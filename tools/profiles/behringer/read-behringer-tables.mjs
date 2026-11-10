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

/**
 * Rows anchored on a number, the other cells set around it (the PolyEight's NRPN and preset tables):
 * `columns` [{ name, dx }] from each half page's left edge; a row is a line with a number at the
 * first column (and, where `anchor` says, a cell matching it at another); every other cell goes to
 * the row on its half page whose number is nearest it. Two pages printed side by side on one sheet
 * are split at `split`, the right one read `offset` points in. Returns [{ page, side, ...cells }].
 */
export function readAnchoredRows(lines, { columns, split = Infinity, offset = 0, anchor = null, top = 0, skip = null, below = false, first = 0 }) {
  const halves = new Map();
  for (const l of lines) {
    if (l.y < top) continue;
    for (const side of [0, 1]) {
      const words = l.words.filter((w) => (side === 0 ? w.x0 < split : w.x0 >= split)).map((w) => ({ ...w, x0: w.x0 - side * offset, x1: w.x1 - side * offset }));
      if (!words.length || (skip && skip.test(text(words)))) continue;
      const key = `${l.page}/${side}`;
      if (!halves.has(key)) halves.set(key, { page: l.page, side, lines: [] });
      halves.get(key).lines.push({ y: l.y, words });
    }
  }
  const out = [];
  const xs = columns.map((c) => c.dx);
  const columnOf = (x) => { let k = 0; for (let i = 0; i < xs.length; i++) if (x >= xs[i] - 6) k = i; return k; };
  for (const { page, side, lines: own } of halves.values()) {
    const rows = [];
    const cells = [];
    for (const l of own) {
      const cs = cellsOf(l.words, xs).map((c) => ({ ...c, column: columnOf(c.x), y: l.y }));
      // A row's line: a number in its first column (`first`: another column), and where `anchor` says,
      // a cell matching it at another.
      const lead = cs.find((c) => c.column === first);
      const isRow = lead && (first !== 0 || /^\d+$/.test(lead.text)) && (!anchor || cs.some((c) => c.column === anchor.column && anchor.test.test(c.text)));
      if (isRow) rows.push({ y: l.y, cells: [] });
      for (const c of cs) cells.push({ ...c, row: isRow ? rows.at(-1) : null });
    }
    if (!rows.length) continue;
    // (`below`: a row runs from its line down to the next row's, the PolyEight preset table's enum
    // lists set under their description.)
    if (below) {
      for (const c of cells) {
        if (c.row) { c.row.cells.push(c); continue; }
        const above = rows.filter((r) => r.y <= c.y + 1).at(-1);
        if (above) above.cells.push(c);
      }
    }
    // Each column's lines run into cells (a cell's lines are 10 points apart, rows' cells 13 or more):
    // a run holding a row's own line is that row's, any other the row nearest its middle.
    for (let k = 0; k < (below ? 0 : columns.length); k++) {
      const own2 = cells.filter((c) => c.column === k).sort((a, b) => a.y - b.y);
      const runs = [];
      for (const c of own2) {
        const run = runs.at(-1);
        if (run && c.y - run.at(-1).y <= 11) run.push(c); else runs.push([c]);
      }
      for (const run of runs) {
        const anchored = [...new Set(run.map((c) => c.row).filter(Boolean))];
        if (anchored.length > 1) { for (const c of run) (c.row ?? anchored.reduce((b, r) => (Math.abs(r.y - c.y) < Math.abs(b.y - c.y) ? r : b))).cells.push(c); continue; }
        const mid = (run[0].y + run.at(-1).y) / 2;
        const to = anchored[0] ?? rows.reduce((b, r) => (Math.abs(r.y - mid) < Math.abs(b.y - mid) ? r : b));
        if (anchored[0] || Math.abs(to.y - mid) <= 30) to.cells.push(...run);
      }
    }
    for (const r of rows) {
      const row = { page, side };
      for (const [k, col] of columns.entries()) {
        const t = r.cells.filter((c) => c.column === k).sort((a, b) => a.y - b.y || a.x - b.x).map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
        if (t) row[col.name] = t;
      }
      out.push(row);
    }
  }
  return out;
}
