// read-modor-manual.mjs — the MIDI chapters of Modor's user manuals (NF-1, NF-1k, DR-2), as printed,
// decided nothing.
//
// Three tables, read from the PDF's word positions (`pdftotext -bbox`):
//   - the MIDI controller list: `Control  Function  Transmitted  Received  Remarks`, a row a line,
//     a remark that does not fit going on below (`Mod Source` / `MODW`, `Digital patch vol-` / `ume`).
//     A footnote is marked by a raised digit set smaller than the text (`Bank Select¹`, `On or Off²`,
//     `Instrument Enable/Disable³`), which is how it is told from a name that ends in a digit (`ENV 1
//     T1`); the notes themselves are set under the table (`1 CC01 also engages the modwheel vibrato
//     by LFO3`), a note going on at the margin below;
//   - the NF-1's formant table (§4.4): the preset vowels' values on the formant controllers
//     (`Formant 1  106-110-114  49 32 35 …`);
//   - the DR-2's NRPN table (§7.4): the instruments by MSB and the parameters by LSB, set side by side.

import { execFileSync } from 'node:child_process';

const decode = (s) => s.replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const joined = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

/** The words on these pages, a line being the words whose tops are within 2.5 points: [{ page, y, words: [{ x0, x1, y0, y1, text, raised }] }]. */
export function documentWords(pdf, pages) {
  const xml = execFileSync('pdftotext', ['-f', String(pages[0]), '-l', String(pages[1]), '-bbox', pdf, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return linesOf(xml).map((l) => ({ ...l, page: l.page + pages[0] - 1 }));
}

export function linesOf(xml) {
  const out = [];
  xml.split('<page ').slice(1).forEach((page, p) => {
    const words = [...page.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
      .map((m) => ({ x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]), text: decode(m[5]) }));
    const heights = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
    const body = heights[Math.floor(heights.length / 2)] ?? 0;
    const lines = [];
    for (const w of [...words].sort((a, b) => a.y0 - b.y0)) {
      // A digit set smaller than the body text, its top above the line's: a footnote mark.
      const raised = /^\d$/.test(w.text) && w.y1 - w.y0 < body * 0.8;
      const line = lines.find((l) => Math.abs(l.top - w.y0) <= 2.5);
      if (line) line.words.push({ ...w, raised }); else lines.push({ top: w.y0, words: [{ ...w, raised }] });
    }
    for (const l of lines) out.push({ page: p + 1, y: l.top, words: l.words.sort((a, b) => a.x0 - b.x0) });
  });
  return out;
}

/**
 * The controller list on these lines: { rows: [{ page, cc, name, transmitted, received, remarks,
 * notes: [text] }], notes: { mark: text } }.
 */
export function readControllerList(lines) {
  let cols = null;
  const rows = [];
  const notes = {};
  let note = null;
  for (const l of lines) {
    const t = joined(l.words);
    const head = l.words.findIndex((w) => w.text === 'Control') === 0 && l.words.some((w) => w.text === 'Transmitted');
    if (head) {
      const x = (word) => l.words.find((w) => w.text === word).x0;
      cols = { function: x('Function'), transmitted: x('Transmitted'), received: x('Received'), remarks: x('Remarks') };
      note = null;
      continue;
    }
    if (!cols || /CHAPTER/.test(t) || /^\d{1,3}$/.test(t)) continue;
    // A footnote under the table: its mark at the margin, its text after it; a line at the margin
    // after it goes on with it.
    const first = l.words[0];
    if (first.raised && first.x0 < cols.function) { note = first.text; notes[note] = joined(l.words.slice(1)); continue; }
    if (note && first.x0 < cols.function && !/^\d{1,3}$/.test(first.text)) { notes[note] = `${notes[note]} ${t}`.replace(/(\w)- (\w)/g, '$1$2'); continue; }
    const cell = (from, to) => l.words.filter((w) => w.x0 >= from - 3 && w.x0 < to - 3);
    const number = l.words.filter((w) => w.x0 < cols.function - 3 && !w.raised);
    const tx = joined(cell(cols.transmitted, cols.received));
    const rx = joined(cell(cols.received, cols.remarks));
    if (number.length === 1 && /^\d{1,3}$/.test(number[0].text) && /^(Yes|No)$/.test(tx) && /^(Yes|No)$/.test(rx)) {
      const name = cell(cols.function, cols.transmitted);
      const remarks = cell(cols.remarks, Infinity);
      rows.push({
        page: l.page, cc: Number(number[0].text),
        name: joined(name.filter((w) => !w.raised)), transmitted: tx === 'Yes', received: rx === 'Yes',
        remarks: joined(remarks.filter((w) => !w.raised)),
        marks: [...name, ...remarks].filter((w) => w.raised).map((w) => w.text),
      });
      note = null;
      continue;
    }
    // A cell going on below its row: the name's or the remark's, by where it is set.
    const last = rows.at(-1);
    if (!last || note) continue;
    const more = (key, words) => { if (words.length) last[key] = `${last[key]} ${joined(words.filter((w) => !w.raised))}`.trim().replace(/(\w)- (\w)/g, '$1$2'); last.marks.push(...words.filter((w) => w.raised).map((w) => w.text)); };
    more('name', cell(cols.function, cols.transmitted));
    more('remarks', cell(cols.remarks, Infinity));
  }
  return { rows: rows.map(({ marks, ...r }) => ({ ...r, notes: marks.map((m) => notes[m]).filter(Boolean) })), notes };
}

/** The NF-1's formant table in `pdftotext -layout` text: { vowels: [...], rows: [{ name, controllers: [cc …], values: [...] }] }. */
export function readFormantTable(text) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^\s*Midi CC#\s+/.test(l));
  if (at < 0) return null;
  const vowels = lines[at].trim().split(/\s+/).slice(2);
  const rows = [];
  for (const l of lines.slice(at + 1)) {
    const m = /^\s*(Formant (?:\d|Vol))\s+(\d+(?:-\d+)+)\s+((?:\d+\s+)*\d+)\s*$/.exec(l);
    if (!m) break;
    rows.push({ name: m[1], controllers: m[2].split('-').map(Number), values: m[3].trim().split(/\s+/).map(Number) });
  }
  return { vowels, rows };
}

/** The DR-2's NRPN table in `pdftotext -layout` text: { instruments: [{ msb, instrument }], parameters: [{ lsb, name }] }. */
export function readNrpnTable(text) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /NRPN LSB\s+Parameter/.test(l));
  if (at < 0) return null;
  const instruments = [];
  const parameters = [];
  for (const l of lines.slice(at + 1)) {
    if (/^\s*\d{1,3}\s*$/.test(l) && parameters.length > 30) break;          // the page number
    const msb = /^\s{1,12}(\d)\s{4,}([A-F])\s*$/.exec(l);
    if (msb) { instruments.push({ msb: Number(msb[1]), instrument: msb[2] }); continue; }
    const lsb = /^\s{20,}(\d{1,2})\s{3,}(\S.*?)\s*$/.exec(l);
    if (lsb) parameters.push({ lsb: Number(lsb[1]), name: lsb[2] });
  }
  return { instruments, parameters };
}
