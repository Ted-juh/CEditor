// read-asm-cc.mjs — an ASM owner's manual's MIDI CC chart (`Sorted by Module`) -> its rows as printed.
//
// The chart is two tables side by side, `Module  Parameter  CC`, the header over the left one only
// and the right one's first row beside it. A line is cells set apart; every number among them ends a
// row, the two cells before it its module and parameter.

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

/** A line's cells: its words split where they are set 9 points or more apart. */
const cellsOf = (words) => {
  const cells = [];
  for (const w of words) {
    const prev = cells.at(-1);
    if (prev && w.x0 - prev.x1 < 9) { prev.words.push(w); prev.x1 = w.x1; } else cells.push({ x: w.x0, x1: w.x1, words: [w] });
  }
  return cells.map((c) => ({ x: c.x, text: text(c.words) }));
};

/** The chart on these lines: [{ page, module, name, cc }], in the order printed, left table first. */
export function readCcChart(lines, { leftOnly = [] } = {}) {
  const rows = [];
  for (const l of lines) {
    const cells = cellsOf(l.words);
    for (let i = 2; i < cells.length; i++) {
      if (!/^\d{1,3}$/.test(cells[i].text)) continue;
      const [module, name] = cells.slice(i - 2, i);
      // (The header, `Module  Parameter  CC`, has no number; a page number stands alone.)
      if (/^\d/.test(module.text) || /^\d/.test(name.text)) continue;
      rows.push({ page: l.page, y: l.y, x: module.x, module: module.text, name: name.text, cc: Number(cells[i].text) });
    }
  }
  // The left table, then the right, page by page: which is which by where its module column stands.
  const xs = rows.map((r) => r.x);
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  const side = (r) => (r.x < middle ? 0 : 1);
  // (`leftOnly`: a page whose right-hand table is the chart again, sorted by number: the Explorer's 95.)
  return rows.filter((r) => !(leftOnly.includes(r.page) && side(r) === 1))
    .sort((a, b) => a.page - b.page || side(a) - side(b) || a.y - b.y).map(({ y, x, ...r }) => r);
}
