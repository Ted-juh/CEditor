// read-elektron-midi.mjs — an Elektron manual's MIDI appendix -> its rows as printed, decided nothing.
//
// Every Elektron manual ends with an appendix of the CC and NRPN numbers its parameters answer to,
// in small tables: a title over each (`SYN1`, `FILTER`, `LFO PARAMETERS`), a header line (`Parameter
// CC MSB CC LSB NRPN MSB NRPN LSB`, with `Encoder`, `Data Range MSB/LSB` or `Specific values info`
// in some manuals), and a row a parameter. The columns are found from the header's words on each
// table; a page may set two tables side by side (the Model:Cycles'), each with its own header. A
// cell's number may carry its range (`94 (0–127)`, the Analog Four's) or its fine controller
// (`109 (LSB: 110)`, the Model:Cycles'); a dash is an empty cell. A line with no parameter's name
// runs the row above on (the Analog Heat's values info over two lines) or is another encoder of it
// (the Analog Four's `B - - 1`), kept as printed.

import { execFileSync } from 'node:child_process';

import { pageLines } from '../waldorf/read-waldorf-sysex.mjs';

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

/** The document's lines from the appendix headed `heading` (`APPENDIX B: MIDI`) to the next appendix. */
export function appendixLines(pdf, heading = /^APPENDIX [A-Z]: MIDI/i) {
  const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const lines = pageLines(xml);
  // The appendix itself, not the contents' entry for it: the last page that opens with its heading.
  const starts = lines.filter((l, i) => heading.test(text(l.words)) && !/\.\s*\.\s*\./.test(text(l.words)) && (i === 0 || lines[i - 1].page !== l.page || lines.findIndex((x) => x.page === l.page) >= i - 2));
  if (!starts.length) return [];
  const first = starts[0].page;
  const out = [];
  for (const l of lines) {
    if (l.page < first) continue;
    const t = text(l.words);
    if (l.page > first && /^APPENDIX [A-Z]:/.test(t) && !heading.test(t) && out.length && lines.findIndex((x) => x.page === l.page) === lines.indexOf(l)) {
      // A running header names the appendix the page belongs to; another appendix's ends ours.
    }
    if (/^APPENDIX [A-Z]:/i.test(t) && !heading.test(t)) break;
    out.push(l);
  }
  return out;
}

/** A header line's columns: [{ key, x }] left to right, or null. */
function headerColumns(words) {
  const cols = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i].text;
    const next = words[i + 1]?.text;
    if (w === 'Parameter') cols.push({ key: 'name', x: words[i].x0 });
    else if (w === 'Encoder') cols.push({ key: 'encoder', x: words[i].x0 });
    else if (w === 'CC' && next === 'MSB') cols.push({ key: 'cc', x: words[i].x0 });
    else if (w === 'CC' && next === 'LSB') cols.push({ key: 'ccLsb', x: words[i].x0 });
    else if (/^N(?:RP|PR)N$/.test(w) && next === 'MSB') cols.push({ key: 'nrpnMsb', x: words[i].x0 });
    else if (/^N(?:RP|PR)N$/.test(w) && next === 'LSB') cols.push({ key: 'nrpnLsb', x: words[i].x0 });
    else if (w === 'Data' && next === 'Range' && words[i + 2]?.text === 'MSB') cols.push({ key: 'rangeMsb', x: words[i].x0 });
    else if (w === 'Data' && next === 'Range' && words[i + 2]?.text === 'LSB') cols.push({ key: 'rangeLsb', x: words[i].x0 });
    else if (w === 'Specific') cols.push({ key: 'values', x: words[i].x0 });
  }
  return cols.some((c) => c.key === 'name') && cols.some((c) => /^(cc|nrpnMsb)$/.test(c.key)) ? cols : null;
}

/** A number cell: `94`, `94 (0–127)`, `109 (LSB: 110)`, `-` -> { n, range?, lsb? } or null. */
export function readCell(s) {
  const t = String(s ?? '').trim();
  if (!t || /^[-–]$/.test(t)) return null;
  const m = /^(\d+)(?:\s*\((?:LSB:\s*(\d+)|(\d+)\s*[–-]\s*(\d+))\))?$/.exec(t);
  if (!m) return { text: t };
  return { n: Number(m[1]), ...(m[2] ? { lsb: Number(m[2]) } : {}), ...(m[3] ? { range: [Number(m[3]), Number(m[4])] } : {}) };
}

const CAPS = /^(?:[A-Z]\.\d+\s+)?[A-Z0-9][A-Z0-9 /&:+().,'-]*$/;
// Capitals with no number of two digits or more: a section heading or a table's title, not a row.
const isCaps = (words) => { const t = text(words); return !!t && CAPS.test(t) && !/\d{2,}/.test(t.replace(/^[A-Z]\.\d+/, '')); };

/**
 * The appendix's tables: [{ page, section, table, name, encoder?, cc?, ccLsb?, nrpn?, values?, cells, more? }],
 * `cells` each column's text as printed, `more` the lines that ran on. Each table holds its own
 * stretch of the page across, so two set side by side go on independently.
 */
export function readMidiAppendix(lines) {
  const rows = [];
  let tables = [];        // open: [{ cols, from, to, title, section, last }]
  let caps = [];          // capitals since the last header: [words]
  const sectionAt = new Map();   // the section last named in each column of the page
  let page = 0;
  // Each page's left margin: a table carried onto a facing page is set at that page's margin.
  const margin = new Map();
  for (const l of lines) margin.set(l.page, Math.min(margin.get(l.page) ?? Infinity, ...l.words.map((w) => w.x0)));
  const column = (x) => Math.round((x - (margin.get(page) ?? 0)) / 150);
  const within = (words, tb) => words.filter((w) => w.x0 >= tb.from && w.x0 < tb.to);
  const addRow = (tb, words, l) => {
    const cells = {};
    for (const w of words) {
      const col = [...tb.cols].reverse().find((c) => w.x0 >= c.x - 4) ?? tb.cols[0];
      cells[col.key] = cells[col.key] ? `${cells[col.key]} ${w.text}` : w.text;
    }
    if (!cells.name) {
      // No name: a run-on of the row above (its values info), or another encoder of it.
      if (tb.last && Object.keys(cells).every((k) => k === 'values')) tb.last.values = `${tb.last.values ?? ''} ${cells.values}`.trim();
      else if (tb.last) (tb.last.more ??= []).push(cells);
      return;
    }
    // Prose running across the page is not a row: a row has a number, or a dash, in a number column.
    if (!['cc', 'ccLsb', 'nrpnMsb', 'nrpnLsb'].some((k) => /\d|^[-–]$/.test(String(cells[k] ?? '').trim()))) {
      tb.last = null;
      if (words.length > 6) tb.closed = true;
      return;
    }
    const row = { page: l.page, section: tb.section, table: tb.title, name: cells.name, cells };
    const cc = readCell(cells.cc);
    const lsb = readCell(cells.ccLsb);
    const msb = readCell(cells.nrpnMsb);
    const nlsb = readCell(cells.nrpnLsb);
    if (cells.encoder && !/^[-–]$/.test(cells.encoder)) row.encoder = cells.encoder;
    if (cc?.n !== undefined) row.cc = cc.n;
    if (lsb?.n !== undefined) row.ccLsb = lsb.n;
    else if (cc?.lsb !== undefined) row.ccLsb = cc.lsb;
    if (msb?.n !== undefined && nlsb?.n !== undefined) row.nrpn = [msb.n, nlsb.n];
    if (cells.values) row.values = cells.values;
    rows.push(row);
    tb.last = row;
  };
  for (const l of lines) {
    const t = text(l.words);
    if (l.page !== page) {
      // Tables still open move with the page's margin.
      const shift = (margin.get(l.page) ?? 0) - (margin.get(page) ?? 0);
      if (page && shift) tables = tables.map((x) => ({ ...x, from: x.from + shift, to: x.to + shift, cols: x.cols.map((c) => ({ ...c, x: c.x + shift })) }));
      page = l.page;
    }
    // Running headers and footers (`APPENDIX B: MIDI IMPLEMENTATION`, `D-2 Appendix D: MIDI`), page numbers.
    if (/^(?:[A-Z]-\d+\s+)?APPENDIX [A-Z]:/i.test(t) || /^\d+$/.test(t)) continue;
    const starts = l.words.map((w, i) => (w.text === 'Parameter' && headerColumns(l.words.slice(i)) ? i : -1)).filter((i) => i >= 0);
    if (starts.length) {
      const fresh = starts.map((s, k) => {
        const end = starts[k + 1] ?? l.words.length;
        const from = l.words[s].x0 - 4;
        const to = k + 1 < starts.length ? l.words[starts[k + 1]].x0 - 4 : Infinity;
        const cols = headerColumns(l.words.slice(s, end));
        // Its title, the last capitals over its columns; its section, the line before that if any.
        const named = caps.map((ws) => text(ws.filter((w) => w.x0 >= from - 60 && w.x0 < to - 60))).filter(Boolean);
        const title = (named.at(-1) ?? '').replace(/^[A-Z]\.\d+\s+/, '');
        if (named.length > 1 || /^[A-Z]\.\d+\s/.test(named.at(-1) ?? '')) sectionAt.set(column(from), named.length > 1 ? named.at(-2) : named.at(-1));
        return { cols, from, to, title, section: sectionAt.get(column(from)) ?? '', last: null };
      });
      // A table set beside the new ones goes on; one under them has ended.
      tables = tables.filter((x) => !x.closed && !fresh.some((f) => f.from < x.to && x.from < f.to));
      const rest = l.words.filter((w) => !fresh.some((f) => w.x0 >= f.from && w.x0 < f.to));
      for (const tb of tables) { const ws = within(rest, tb); if (ws.length) addRow(tb, ws, l); }
      tables.push(...fresh);
      caps = [];
      continue;
    }
    // Each open table takes the words in its stretch: a row, or capitals that close it.
    for (const tb of tables) {
      const ws = within(l.words, tb);
      if (!ws.length) continue;
      // (The capitals are taken below, with the rest of the line no open table holds.)
      if (isCaps(ws)) { tb.closed = true; continue; }
      addRow(tb, ws, l);
    }
    tables = tables.filter((x) => !x.closed);
    const free = l.words.filter((w) => !tables.some((tb) => w.x0 >= tb.from && w.x0 < tb.to));
    if (free.length && isCaps(free)) {
      caps.push(free);
      // A heading across the page names the section of every column (`B.3 FM PARAMETERS`).
      if (/^[A-Z]\.\d+\s/.test(text(free)) || /PARAMETERS$/.test(text(free))) for (const k of [...sectionAt.keys(), column(free[0].x0)]) if (column(free[0].x0) === k) sectionAt.set(k, text(free));
    }
  }
  return rows;
}
