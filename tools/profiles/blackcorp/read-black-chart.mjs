// read-black-chart.mjs — a Black Corporation manual's MIDI CC chart -> its rows as printed, decided
// nothing.
//
// Every Black Corporation manual ends on a `MIDI CC CHART`: a row a controller, its number first
// (`CC48`), then what the chart has columns for: `MIDI CC  RANGE  FUNCTION` (the Deckard's Dream MK2),
// `MIDI CC  FUNCTION` (the Kijimi MK2), `CC NUMBER  FUNCTION  LAYER` (the Ise-Nin), or the function
// alone under a `CHANNEL 1` / `CHANNEL 2` heading (the Xerxes MK2). So the cells after the number are
// told apart by what they hold, not where they stand: a range is digits, dashes and slashes, a layer
// `UPPER` or `LOWER`, and the rest is the function. Two things about how the pages are set:
//   - the Xerxes's names are broken by a narrow space inside a word (`BUTTON_OSC2_S YNC`), and a few
//     stand a few points above their number, a line of their own to pdftotext;
//   - a cell is words set less than 12 points apart; the columns are further apart than that.

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
const NUMBER = /^CC\s?(\d{1,3})$/;
const RANGE = /^[\d\s/-]+$/;
const LAYER = /^(?:UPPER|LOWER)$/;
const HEADING = /^CHANNEL\s+(\d+)$/;

/** A line's words grouped into cells: words set less than 12 points apart are one. */
const cellsOf = (words) => {
  const cells = [];
  for (const w of [...words].sort((a, b) => a.x0 - b.x0)) {
    const prev = cells.at(-1);
    if (prev && w.x0 - prev.x1 < 12) { prev.words.push(w); prev.x1 = w.x1; } else cells.push({ x0: w.x0, x1: w.x1, words: [w] });
  }
  return cells.map((c) => ({ x0: c.x0, text: text(c.words) }));
};

/**
 * The chart's rows on these lines: [{ page, cc, range?, name, layer?, block? }]. The chart starts at
 * its `MIDI CC CHART` heading; `block` is the `CHANNEL n` heading a row is under, where there is one.
 */
export function readChart(lines) {
  const start = lines.findIndex((l) => /^MIDI CC CHART$/.test(text(l.words)));
  if (start < 0) throw new Error('no MIDI CC CHART heading on these pages');
  // Lines a few points apart are one (a name set above its number).
  const merged = [];
  for (const l of lines.slice(start + 1)) {
    const prev = merged.at(-1);
    if (prev && prev.page === l.page && l.y - prev.y <= 6) prev.words = [...prev.words, ...l.words];
    else merged.push({ page: l.page, y: l.y, words: [...l.words] });
  }
  const rows = [];
  let block = null;
  for (const l of merged) {
    const cells = cellsOf(l.words);
    const heading = HEADING.exec(cells.map((c) => c.text).join(' '));
    if (heading) { block = `CHANNEL ${heading[1]}`; continue; }
    const n =NUMBER.exec(cells[0]?.text ?? '');
    if (!n) continue;
    const row = { page: l.page, cc: Number(n[1]) };
    const names = [];
    for (const c of cells.slice(1)) {
      if (RANGE.test(c.text) && !names.length) row.range = c.text.replace(/\s+/g, ' ');
      else if (LAYER.test(c.text)) row.layer = c.text;
      else names.push(c.text);
    }
    let name = names.join(' ');
    // (`BUTTON_OSC2_S YNC`: a name made of underscores has no spaces of its own.)
    if (name.includes('_')) name = name.replace(/\s+/g, '');
    row.name = name;
    if (block) row.block = block;
    rows.push(row);
  }
  return rows;
}
