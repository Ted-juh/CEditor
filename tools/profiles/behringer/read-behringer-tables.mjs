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
export function cellsOf(words) {
  const cells = [];
  for (const w of words) {
    const prev = cells.at(-1);
    if (prev && w.x0 - prev.x1 < 9) { prev.words.push(w); prev.x1 = w.x1; } else cells.push({ x: w.x0, x1: w.x1, words: [w] });
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
  // A table's stretch: from its header to the first line after it that is not a row.
  const segments = [];
  let current = null;
  for (const l of lines) {
    const words = l.words.map((w) => w.text);
    const kind = kinds.find((k) => k.header.every((h, i) => words[i] === h));
    if (kind) { current = { kind, page: l.page, lines: [] }; segments.push(current); continue; }
    if (!current || current.page !== l.page) { current = null; continue; }
    if (!/^\d+(?:-\d+)?$/.test(words[0] ?? '')) { if (current.lines.length) current = null; continue; }
    current.lines.push(l);
  }
  for (const seg of segments) {
    const lineCells = seg.lines.map((l) => cellsOf(l.words));
    // The columns: where cells start in more than one row.
    const starts = [];
    for (const cs of lineCells) for (const c of cs) {
      const near = starts.find((s) => Math.abs(s.x - c.x) <= 8);
      if (near) near.n++; else starts.push({ x: c.x, n: 1 });
    }
    const columns = starts.filter((s) => s.n >= 2).sort((a, b) => a.x - b.x);
    if (columns.length !== seg.kind.columns.length) throw new Error(`${seg.kind.kind} table on page ${seg.page}: ${columns.length} columns, not ${seg.kind.columns.length} (${columns.map((c) => Math.round(c.x)).join(', ')})`);
    for (const cs of lineCells) {
      const row = { kind: seg.kind.kind, page: seg.page };
      for (const c of cs) {
        // The column a cell starts at, or the last one left of it (a cell set a little out of line).
        let k = columns.findIndex((col) => Math.abs(col.x - c.x) <= 8);
        if (k < 0) k = columns.reduce((best, col, i) => (col.x <= c.x ? i : best), 0);
        const name = seg.kind.columns[k];
        row[name] = row[name] ? `${row[name]} ${c.text}` : c.text;
      }
      rows.push(row);
    }
  }
  return rows;
}
