// read-behringer-tables.mjs — the tables a Behringer manual prints a row a line (the Wave's controller,
// NRPN and preset byte tables) -> their rows as printed, decided nothing.
//
// A table is a header line, repeated at the top of each page it runs onto, and under it a line for
// each row, its first cell a number. The titles are not set over their columns (the Wave's `Notes`
// stands 90 points right of the notes), so the columns are where the rows' cells line up: a cell is
// words set closer than 9 points, and the places where cells start in more than one row are the
// columns, in order.

import { pageLines } from '../waldorf/read-waldorf-sysex.mjs';

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

export { pageLines };

/** A line's cells: its words split where they are set 9 points or more apart. */
export function cellsOf(words, columns = []) {
  const cells = [];
  for (const w of words) {
    const prev = cells.at(-1);
    // (Once the columns are known, a word that starts on one starts a cell however close it is set:
    // the DeepMind's `OSC 1 Aftertouch > Pitch Mod Depth` runs into its `0-255`.)
    const onColumn = columns.some((x) => Math.abs(x - w.x0) <= 3) && prev && !columns.some((x) => Math.abs(x - prev.x) <= 3 && x === w.x0);
    if (prev && w.x0 - prev.x1 < 9 && !onColumn) { prev.words.push(w); prev.x1 = w.x1; } else cells.push({ x: w.x0, x1: w.x1, words: [w] });
  }
  return cells.map((c) => ({ x: c.x, x1: c.x1, text: text(c.words) }));
}

/**
 * The tables on these lines. `kinds` says what each header is: [{ kind, header: [words …], columns:
 * [names …] }], the header's words in order (`['MSB', 'LSB', '14-bit']`), one column name for each
 * column. Returns [{ kind, page, ...cells by column name }].
 */
export function readLineTables(lines, kinds) {
  const rows = [];
  const isRow = (l) => /^\d+(?:-\d+)?$/.test(l.words[0]?.text ?? '');
  // A table's stretch: its header, then the lines after it on its page, up to the next header.
  const segments = [];
  let current = null;
  for (const l of lines) {
    const words = l.words.map((w) => w.text);
    const kind = kinds.find((k) => k.header.every((h, i) => words[i] === h));
    if (kind) { current = { kind, page: l.page, lines: [] }; segments.push(current); continue; }
    if (!current || current.page !== l.page) { current = null; continue; }
    current.lines.push(l);
  }
  for (const seg of segments) {
    const rowLines = [];
    // The rows run from the first line that is one to the first line after that is neither a row
    // nor a note run over from one (the DeepMind's notes are set over two lines, around their row).
    const candidates = seg.lines.filter((l, i) => { const first = seg.lines.findIndex(isRow); return first >= 0 && i >= first - 1; });
    // (A dash alone is an empty cell, centred where no cell starts: the DeepMind's `—` for no notes.)
    const lineCells = (l) => cellsOf(l.words).filter((c) => !/^[—–-]$/.test(c.text));
    for (const l of candidates) if (isRow(l)) rowLines.push(l);
    // The columns: where cells start in more than one row.
    const starts = [];
    for (const l of rowLines) for (const c of lineCells(l)) {
      const near = starts.find((s2) => Math.abs(s2.x - c.x) <= 8);
      if (near) near.n++; else starts.push({ x: c.x, n: 1 });
    }
    const columns = starts.filter((s2) => s2.n >= 2).sort((a, b) => a.x - b.x);
    const split = (l) => cellsOf(l.words, columns.map((c) => c.x)).filter((c) => !/^[—–-]$/.test(c.text));
    if (columns.length !== seg.kind.columns.length) throw new Error(`${seg.kind.kind} table on page ${seg.page}: ${columns.length} columns, not ${seg.kind.columns.length} (${columns.map((c) => Math.round(c.x)).join(', ')})`);
    const last = columns.at(-1).x;
    const read = [];
    let ended = false;
    for (const l of candidates) {
      if (ended) break;
      if (isRow(l)) {
        const row = { kind: seg.kind.kind, page: seg.page, y: l.y };
        for (const c of split(l)) {
          // The column a cell starts at, or the last one left of it (a cell set a little out of line).
          let k = columns.findIndex((col) => Math.abs(col.x - c.x) <= 8);
          if (k < 0) k = columns.reduce((best, col, i) => (col.x <= c.x ? i : best), 0);
          const name = seg.kind.columns[k];
          row[name] = row[name] ? `${row[name]} ${c.text}` : c.text;
        }
        read.push(row);
        continue;
      }
      // A note run over: all its cells in the last column, set within 7 points of a row.
      const near = rowLines.reduce((best, r) => (!best || Math.abs(r.y - l.y) < Math.abs(best.y - l.y) ? r : best), null);
      if (near && Math.abs(near.y - l.y) <= 7 && lineCells(l).every((c) => c.x >= last - 8)) { read.push({ over: near.y, y: l.y, text: text(l.words) }); continue; }
      if (read.some((r) => !r.over)) ended = true;
    }
    for (const row of read.filter((r) => !r.over)) {
      const name = seg.kind.columns.at(-1);
      const pieces = [...read.filter((r) => r.over === row.y), { y: row.y, text: row[name] }].filter((p) => p.text).sort((a, b) => a.y - b.y);
      const { y, ...out } = row;
      if (pieces.length) out[name] = pieces.map((p) => p.text).join(' ');
      rows.push(out);
    }
  }
  return rows;
}
