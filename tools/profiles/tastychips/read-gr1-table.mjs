// read-gr1-table.mjs — the MIDI Command table of Tasty Chips' GR-1 user manual, as printed, decided
// nothing.
//
// The table is `MIDI msg.  GR-1 parameter  Command / CC  Value  Range/description  Control curve`,
// its header set over three lines (`MIDI … Comman … Control`, `GR-1 parameter … Value …`, `msg. d / CC
// curve`). A row is a line with a number (`23`) or a run of them (`140-143`) in the Command column;
// pitch bend, program change and the notes have `-` there. A cell that wraps is set vertically
// centred on its row (`cubic` above `Attack time`, `(special)` below it; `MOD TIMBRE` above `203`,
// `-PANSPRAY` below), so a line without a number is the row's whose line is nearest it on its page. No row is broken over a page. The table ends at `Precision
// MIDI`; a line that is only a number is the page's.

const joined = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
const KEYS = ['msg', 'name', 'cc', 'value', 'description', 'curve'];

/** The header's columns on these three lines, or null: { msg, name, cc, value, description, curve } as x positions. */
function headerOf(top, middle) {
  const x = (line, word) => line?.words.find((w) => w.text === word)?.x0;
  if (x(top, 'MIDI') == null || x(top, 'Comman') == null || x(top, 'Control') == null || x(middle, 'Value') == null) return null;
  return { msg: x(top, 'MIDI'), name: x(middle, 'GR-1'), cc: x(top, 'Comman'), value: x(middle, 'Value'), description: x(middle, 'Range/description'), curve: x(top, 'Control') };
}

/** The table on these lines (from documentLines): [{ page, msg, name, cc, value, description, curve }], each cell's lines joined top to bottom. */
export function readGr1Table(lines) {
  let cols = null;
  const parsed = [];
  for (const [k, l] of lines.entries()) {
    if (!cols) { cols = headerOf(l, lines[k + 1]); if (cols) cols.skip = k + 2; continue; }
    if (k <= cols.skip) continue;
    const t = joined(l.words);
    if (/^Precision MIDI/.test(t)) break;
    if (/^\d{1,3}$/.test(t)) continue;                                        // the page number
    const cells = Object.fromEntries(KEYS.map((key) => [key, []]));
    // A word is the column its left edge is in; a number set right in the Command column (`216:10`)
    // or a value centred in its own (`250:0 257:- 262:127`) starts left of its header.
    for (const w of l.words) cells[KEYS.reduce((found, key) => (w.x0 >= cols[key] - 4 ? key : found), 'msg')].push(w);
    const number = joined(cells.cc);
    // (Pitch bend, program change and the notes are rows with `-` for a number.)
    parsed.push({ page: l.page, y: l.y, row: /^\d+(?:-\d+)?$/.test(number) || (number === '-' && cells.name.length > 0), cells });
  }
  const rows = parsed.filter((p) => p.row).map((p) => ({ ...p, lines: [p] }));
  for (const p of parsed.filter((x) => !x.row)) {
    const near = rows.filter((r) => r.page === p.page).reduce((best, r) => (!best || Math.abs(r.y - p.y) < Math.abs(best.y - p.y) ? r : best), null);
    if (near) near.lines.push(p);
  }
  return rows.map((r) => {
    const ls = [...r.lines].sort((a, b) => a.y - b.y);
    return { page: r.page, ...Object.fromEntries(KEYS.map((key) => [key, ls.map((l) => joined(l.cells[key])).filter(Boolean).join(' ')])) };
  });
}
