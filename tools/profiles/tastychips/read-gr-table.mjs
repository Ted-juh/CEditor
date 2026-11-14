// read-gr-table.mjs — the MIDI Command Table of Tasty Chips' GR-2 and GR-MEGA manuals ("Generated
// from src/midi.rs enum Nrpn"), and the tables after it, as printed, decided nothing.
//
// The table is `CC #  Name  Description  Range / notes  Curve`, a row's cells bottom-aligned: a cell
// that wraps puts its first lines above the row's number, which sits on its last (`Enable & focus` /
// `3 ENA PART NR layer`). So the lines between two rows' numbers are the second row's. A page that
// breaks a row leaves its last lines at the top of the next page (row 35's `see Rate` / `divisio` /
// `ns` / `table)`), where they read exactly like the next row's first lines: those lines go to
// whichever of the two rows keeps every line break in each of its cells one that wrapping would make
// (the next word did not fit), the next row's where both do. A label set across the range column
// between rows (`NRPN-only (> 127)`, `Macros`) is a section, which the layout names.
//
// And the tables after it: Rate divisions (`Index  Rate  Category`), Mod sources (`Index  Modulation
// source`), Modulation destinations (`Index  Name  Category`).

const joined = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
const SPACE = 3;

/** The header's columns on this line, or null: { name, description, range, curve } as x positions. */
function headerOf(line) {
  const x = (word) => line.words.find((w) => w.text === word)?.x0;
  if (line.words[0]?.text !== 'CC' || x('Name') == null || x('Description') == null || x('Curve') == null) return null;
  return { name: x('Name'), description: x('Description'), range: x('Range'), curve: x('Curve') };
}

const KEYS = ['name', 'description', 'range', 'curve'];

/**
 * The table on these lines (from documentLines): [{ page, cc, name, description, range, curve,
 * section? }], each cell's lines joined. `sections`: the labels set between rows.
 */
export function readCommandTable(lines, { sections = [] } = {}) {
  let cols = null;
  const columnOf = (w) => KEYS.reduce((found, key) => (w.x0 >= cols[key] - 2 ? key : found), 'cc');
  const rows = [];
  let pending = [];           // lines read since the last row, not yet given to one
  let section = null;
  let pageTop = false;        // the pending lines are a page's first, before its first row
  const limits = { name: 0, description: 0, range: 0, curve: 0 };
  const parsed = [];
  for (const l of lines) {
    const header = headerOf(l);
    if (header) { cols = header; pageTop = true; continue; }
    if (!cols) continue;
    const t = joined(l.words);
    if (/^Rate divisions$|^Table \d+:/.test(t)) break;
    if (/^Generated from /.test(t) || /^\d{2,3}$/.test(t)) continue;
    if (sections.includes(t)) { parsed.push({ kind: 'section', text: t }); continue; }
    const cells = Object.fromEntries(KEYS.map((k) => [k, []]));
    const number = [];
    for (const w of l.words) (columnOf(w) === 'cc' ? number : cells[columnOf(w)]).push(w);
    const isRow = number.length === 1 && /^\d+$/.test(number[0].text);
    parsed.push({ kind: isRow ? 'row' : 'line', page: l.page, cc: isRow ? Number(number[0].text) : null, cells, pageTop });
    if (isRow) pageTop = false;
    for (const k of KEYS) if (cells[k].length > 1) limits[k] = Math.max(limits[k], cells[k].at(-1).x1);
  }
  // A cell's width: what its widest line of two words or more reaches.
  const fits = (key, before, after) => before.at(-1).x1 + SPACE + (after[0].x1 - after[0].x0) <= limits[key] + 0.5;
  // Whether a cell's lines, in order, break only where the next word did not fit.
  const natural = (key, lineCells) => lineCells.every((c, i) => i === 0 || !fits(key, lineCells[i - 1], c));

  const cellLines = (row, key) => row.lines.map((l) => l.cells[key]).filter((c) => c.length);
  for (const p of parsed) {
    if (p.kind === 'section') { section = p.text; continue; }
    if (p.kind === 'line') { pending.push(p); continue; }
    let own = pending;
    const prev = rows.at(-1);
    if (prev && pending.length && pending[0].pageTop) {
      // A page's first lines: the last row's going on, or this row's first, or some of each.
      const row = { lines: [p] };
      const ok = (k) => {
        const toPrev = { lines: [...prev.lines, ...pending.slice(0, k)] };
        const toThis = { lines: [...pending.slice(k), p] };
        return KEYS.every((key) => natural(key, cellLines(toPrev, key)) && natural(key, cellLines(toThis, key))
          // (A bottom-aligned cell ends on its row's line.)
          && (!pending.slice(k).some((l) => l.cells[key].length) || p.cells[key].length));
      };
      const k = [0, ...Array.from({ length: pending.length }, (u, i) => i + 1)].find(ok) ?? 0;
      prev.lines.push(...pending.slice(0, k));
      own = pending.slice(k);
      void row;
    }
    rows.push({ page: p.page, cc: p.cc, section, lines: [...own, p] });
    pending = [];
  }
  return rows.map(({ lines: ls, ...r }) => ({
    ...r,
    // (A line that ends on a hyphen, `clock-` / `synced`, `GR-` / `MEGA`, goes on without a space.)
    ...Object.fromEntries(KEYS.map((key) => [key, ls.map((l) => joined(l.cells[key])).filter(Boolean).join(' ').replace(/(\w)- (\w)/g, '$1-$2')])),
  }));
}

/**
 * A table after the command table, from its title (`Table 3: Rate divisions`) to the next title:
 * [{ index, cells: [...] }], its columns where its header (`Index  Rate  Category`) puts them.
 */
export function readIndexTable(lines, title) {
  const at = lines.findIndex((l) => joined(l.words) === title);
  if (at < 0) return null;
  const out = [];
  let starts = null;
  for (const l of lines.slice(at + 1)) {
    const t = joined(l.words);
    if (/^Table \d+:/.test(t)) break;
    // (A header label of two words, `Modulation source`, is one column.)
    if (l.words[0]?.text === 'Index') { starts = l.words.slice(1).filter((w, k, ws) => k === 0 || w.x0 - ws[k - 1].x1 > 9).map((w) => w.x0); continue; }
    if (!starts || !/^\d+$/.test(l.words[0]?.text ?? '')) continue;
    const cells = starts.map(() => []);
    for (const w of l.words.slice(1)) {
      const k = starts.reduce((found, x, i) => (w.x0 >= x - 4 ? i : found), 0);
      cells[k].push(w);
    }
    // (A page number is an index with nothing beside it.)
    if (cells.every((c) => !c.length)) continue;
    out.push({ index: Number(l.words[0].text), cells: cells.map(joined) });
  }
  return out;
}
