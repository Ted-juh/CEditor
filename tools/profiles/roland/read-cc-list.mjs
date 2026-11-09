// read-cc-list.mjs — what a Roland instrument does with control changes, read from its own manual.
//
// The Boutiques, the AIRA and TR boxes and the grooveboxes publish no address map: their MIDI is
// the Control Change list. Roland prints it four ways, and this reads all four from the text
// `pdftotext -layout` gives:
//
//   chart    the MIDI Implementation Chart's own Control Change rows, one per number, with what it
//            transmits and recognizes and the name in Remarks (JP-08, JU-06A, SYSTEM-1, TR-8S,
//            SH-4d, JX-08, MC-707, VT-4 …):
//                                   71 o     o        VCF RESONANCE*1
//   list     a separate "Control Change / Explanation" table, beside the chart or after it, often
//            two side by side (SH-01A, TR-06, TR-08, S-1), or "CC# / Patch parameter" (SE-02):
//                     Control Change   Explanation        Control Change   Explanation
//                     9                SHUFFLE (*Rx only) 103              LT DELAY
//   hex      decimal and hexadecimal side by side, `–` for an unused number (P-6):
//                     12  0x0C GRANULAR Filter Type (p. 110)
//
// A chart's Control Change row may also name a span (`12–31 o o`) and leave the names to a list;
// those numbers are kept as `chartNumbers` so the list can be checked against the chart that
// points to it — two tables from the same page, which must agree.
//
// The chart's legend says which glyph means Yes. It is not always a letter: the VT-4's font
// extracts its circle as `6`, and its legend reads `6 : Yes`.

import { execFileSync } from 'node:child_process';

/** The whole document as text, one string per page. */
export function documentPages(pdf) {
  return execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).split('\f');
}

const DASH = '[–\\-]';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `o`/`○` for Yes and `x`/`×` for No, plus whatever this chart's legend says. */
function legend(text) {
  const yes = new Set(['o', 'O', '○', '◯']);
  const no = new Set(['x', 'X', '×']);
  for (const m of text.matchAll(/(?:^|\s)(\S)\s*:\s*Yes\b/g)) yes.add(m[1]);
  for (const m of text.matchAll(/(?:^|\s)(\S)\s*:\s*No\b/g)) no.add(m[1]);
  return { yes, no };
}

/** `12–31, 64, 65` -> [12 … 31, 64, 65] */
export function expandNumbers(text) {
  const out = [];
  for (const part of text.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const span = new RegExp(`^(\\d{1,3})\\s*${DASH}\\s*(\\d{1,3})$`).exec(token);
    if (span) for (let n = Number(span[1]); n <= Number(span[2]); n++) out.push(n);
    else if (/^\d{1,3}$/.test(token)) out.push(Number(token));
    else return null;
  }
  return out;
}

/** `LFO RATE*1` -> { name: 'LFO RATE', marks: ['1'] }; `SHUFFLE (*Rx only)` keeps its words. */
function splitMarks(text) {
  const marks = [];
  let name = text.trim();
  for (;;) {
    const m = /\s*\(?\*\s*(\d+)\)?\s*$/.exec(name);
    if (!m || m.index === 0) break;
    marks.unshift(m[1]);
    name = name.slice(0, m.index).trim();
  }
  return { name, marks };
}

/**
 * Every chart in the document: its Control Change rows, the numbers it names, and its notes.
 * A chart starts at its Pitch Bend row and its Control Change section ends at Program Change; a
 * chart that runs over a page (the JX-08's) simply continues, its page furniture matching nothing.
 */
export function readCharts(pages) {
  const charts = [];
  const all = pages.flatMap((text, index) => text.split('\n').map((line) => ({ line, page: index + 1 })));
  const { yes, no } = legend(pages.join('\n'));
  const glyph = `(?:${[...yes, ...no].map(escape).join('|')})`;
  const mark = '(?:\\s*\\(\\s*\\*?\\s*\\d+\\s*\\)|\\s*\\*\\d+)?';
  const startRe = new RegExp(`Pitch\\s+Bend(?:er)?\\s+(${glyph})${mark}\\s+(${glyph})${mark}(?:\\s|$)`, 'i');
  // `Control change  o  o  For the values, refer to …` (the P-6's): one answer for every number.
  const wholeRe = new RegExp(`^\\s*Control\\s+change\\s+(${glyph})${mark}\\s+(${glyph})${mark}(?:\\s|$)`, 'i');
  const rowRe = new RegExp(`^\\s*(\\d{1,3}(?:\\s*${DASH}\\s*\\d{1,3})?(?:\\s*,\\s*\\d{1,3}(?:\\s*${DASH}\\s*\\d{1,3})?)*)\\s*(${glyph})(${mark})\\s+(${glyph})(${mark})(?:\\s+(.*))?$`);
  const trailingComma = new RegExp(`(\\d)\\s*,\\s+(?=${glyph}\\s)`);

  for (let i = 0; i < all.length; i++) {
    if (!startRe.test(all[i].line)) continue;
    // Where Remarks starts, from the chart's header row: text further right is another table
    // printed beside the chart (the TR-08's note list), not this row's name.
    let remarksAt = null;
    for (let h = i; h >= Math.max(0, i - 30) && remarksAt === null; h--) {
      const at = all[h].line.search(/Remarks\s*$/);
      if (at >= 0 && /Transmitted/.test(all[h].line)) remarksAt = at;
    }
    const chart = { page: all[i].page, rows: [], numbers: [], spanned: [], notes: {}, whole: null };
    // One comma-separated list of numbers printed over several lines with the glyphs on one of
    // them (the SE-02's `5, 9, 13, …` / `61, 62, … 82, o o Patch parameters` / `83, 84, …`): every
    // number in it shares that row's answer.
    let block = null;
    let j = i + 1;
    for (; j < all.length; j++) {
      const raw = all[j].line;
      if (/^\s*(Program|Prog\.?)(\s|$)/i.test(raw) || /^\s*System\s+Exclusive/i.test(raw)) break;
      const whole = wholeRe.exec(raw);
      if (whole) { chart.whole = { tx: yes.has(whole[1]), rx: yes.has(whole[2]) }; continue; }
      const labelled = raw.replace(/^\s*(Control\s+Change|Control|Change)(?=\s|$)/i, '');
      if (!labelled.trim()) continue;
      // A list of numbers on a line of its own: counted, and part of the block. One number alone
      // is the page number of a chart that runs over a page (the JX-08's).
      const bare = /^\s*((?:\d{1,3}\s*,\s*)+\d{1,3},?|\d{1,3},)\s*$/.exec(labelled);
      if (bare) {
        const numbers = expandNumbers(bare[1].replace(/,$/, ''));
        chart.numbers.push(...numbers);
        if (!block?.continues) block = { numbers: [], row: null };
        block.numbers.push(...numbers);
        block.row?.numbers.push(...numbers);
        block.continues = /,$/.test(bare[1]);
        continue;
      }
      const continued = trailingComma.test(labelled);
      const m = rowRe.exec(labelled.replace(trailingComma, '$1 '));
      if (!m) { block = null; continue; }
      const own = expandNumbers(m[1]);
      if (!own || own.some((n) => n > 127)) { block = null; continue; }
      const numbers = [...(block?.continues && !block.row ? block.numbers : []), ...own];
      // Remarks end where the next column starts: a list printed beside the chart (the SH-01A's).
      const remarkAt = m[6] === undefined ? -1 : raw.length - raw.trimEnd().length === 0 ? raw.lastIndexOf(m[6]) : raw.indexOf(m[6]);
      const inColumn = remarksAt === null || remarkAt < 0 || remarkAt <= remarksAt + 15;
      const remark = inColumn ? (m[6] ?? '').split(/\s{6,}/)[0].trim() : '';
      const { name, marks } = splitMarks(remark);
      const footnotes = [m[3], m[5]].map((s) => /\d+/.exec(s ?? '')?.[0]).filter(Boolean);
      chart.numbers.push(...own);
      // `12–31`: a summary of where the list's numbers lie, not a claim that each one is used.
      if (new RegExp(DASH).test(m[1])) chart.spanned.push(...own);
      const row = {
        numbers,
        tx: yes.has(m[2]),
        rx: yes.has(m[4]),
        name,
        marks: [...new Set([...footnotes, ...marks])],
        page: all[j].page,
      };
      chart.rows.push(row);
      block = continued ? { numbers: [], row, continues: true } : null;
    }
    // Notes: `*1 The control changes of the Lower part …`, to the mode legend. A note's next line
    // continues it only if it starts where the note's text did; text further right is another
    // column (the TR-08's list runs down beside its notes).
    let current = null;
    let column = 0;
    const clean = (s) => s.replace(/[\u0000-\u001f]/g, ' ').trim().split(/\s{6,}/)[0];
    for (let k = j; k < all.length && !/Mode\s*1\s*:/i.test(all[k].line); k++) {
      // The `Notes` label sits in the left margin; it is not where the note's text starts.
      const line = all[k].line.replace(/[\u0000-\u001f]/g, ' ').replace(/^(\s*)Notes(?=\s)/, (m) => ' '.repeat(m.length)).trimEnd();
      const note = /(?:^|\s)\*\s?(\d+)(?:\s+(\S.*))?$/.exec(line);
      if (note && !/^\s*:/.test(line)) {
        current = note[1];
        if (note[2]) {
          column = note.index + note[0].indexOf(note[2]);
          chart.notes[current] = clean(note[2]);
        } else {
          // The mark alone, its text on the next line (the JP-08's `*1`).
          const next = all.slice(k + 1).find((l) => l.line.trim());
          column = next ? next.line.length - next.line.trimStart().length : 0;
          chart.notes[current] = '';
        }
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (current && line.trim() && Math.abs(indent - column) <= 3) chart.notes[current] = `${chart.notes[current]} ${clean(line)}`.trim();
      else if (line.trim()) current = null;
    }
    charts.push(chart);
    i = j;
  }
  return charts;
}

/**
 * A "Control Change / Explanation" table, wherever on the page it is printed. Each header fixes a
 * column; a row belongs to the header nearest its number, so two lists side by side, or one beside
 * the chart, do not mix. `header` is the pattern a header line matches.
 */
export function readList(pages, { header = /(Control\s+Change|CC#)\s+(Explanation|Patch\s+parameter)/g, pagesWanted } = {}) {
  const rows = [];
  pages.forEach((text, index) => {
    const page = index + 1;
    if (pagesWanted && !pagesWanted.includes(page)) return;
    const columns = [];
    let open = false;
    for (const line of text.split('\n')) {
      if (/Mode\s*1\s*:|©|Copyright/.test(line)) { open = false; continue; }
      let hit = false;
      for (const m of line.matchAll(header)) {
        hit = true;
        open = true;
        if (!columns.some((c) => Math.abs(c - m.index) <= 4)) columns.push(m.index);
      }
      if (!open || hit && !/\d{1,3}\s{2,}\S/.test(line.replace(header, ''))) continue;
      // A row's name runs to the next row on the line, or to the line's end: a gap inside it is
      // where the manual printed an icon (the S-1's `OSC [saw] LEVEL`), not the end of the name.
      const found = [];
      for (const m of line.matchAll(/(?:^|\s)(\d{1,3})\s{2,}(?=\S)/g)) {
        const at = m.index + m[0].indexOf(m[1]);
        const column = columns.find((c) => Math.abs(c - at) <= 6);
        if (column !== undefined && Number(m[1]) <= 127) found.push({ at, end: m.index + m[0].length, cc: Number(m[1]), column });
      }
      found.forEach((hit, n) => {
        const text = line.slice(hit.end, found[n + 1]?.at ?? line.length);
        // Text far right of a one-column list is another table's (the TR-06's list beside its chart).
        const own = found.length > 1 || columns.length === 1 ? text : text.split(/\s{12,}/)[0];
        const { name, marks } = splitMarks(own.replace(/\s+/g, ' '));
        if (name) rows.push({ numbers: [hit.cc], name, marks, page, column: hit.column, gaps: /\S\s{6,}\S/.test(own.trim()) });
      });
    }
  });
  return rows;
}

/** Drops an opening bracket the line ends inside: the rest was printed on the next line. */
function balanced(text) {
  let depth = 0;
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') { if (depth++ === 0) open = i; } else if (text[i] === ')') depth = Math.max(0, depth - 1);
  }
  return depth > 0 ? text.slice(0, open).trim() : text;
}

/** `12  0x0C GRANULAR Filter Type (p. 110)`: the hexadecimal checks the decimal; `–` is unused. */
export function readHexList(pages) {
  const rows = [];
  const issues = [];
  pages.forEach((text, index) => {
    for (const line of text.split('\n')) {
      const m = /^\s*(\d{1,3})\s+0x([0-9A-F]{2})\s+(.*?)\s*$/.exec(line);
      if (!m) continue;
      const cc = Number(m[1]);
      if (parseInt(m[2], 16) !== cc) { issues.push(`p${index + 1}: ${m[1]} is printed as 0x${m[2]}`); continue; }
      if (/^[–-]?$/.test(m[3])) continue;
      // `(p. 112)`, or a section title with its page, `(Changing the sound quality … (p. 12))`.
      const name = balanced(m[3]
        .replace(/\s*\((?:[^()]|\([^()]*\))*\(p\.\s*\d+\)\)\s*$/, '')
        .replace(/\s*\(p\.\s*\d+\)\s*$/, '')).trim();
      rows.push({ numbers: [cc], name, marks: [], page: index + 1, reference: /\(p\.\s*(\d+)\)/.exec(m[3])?.[1] ?? null });
    }
  });
  return { rows, issues };
}
