// read-groove-spec.mjs — Groove Synthesis's 3rd Wave MIDI CC + SysEx Spec -> its NRPN table and lists
// as printed, decided nothing.
//
// The NRPN table is `NRPN  Category  Range  Description`, a row's description over as many lines as
// it needs, its number set beside the middle of them: a title (`Velocity strength`), then the values
// (`0: velocity off`, `1: light` …), two or three above the number's line and the rest under it, the
// next row's title straight after with no more space between than between its own lines. So the
// lines between two rows are read in order: a value (`N: …`) or a line that runs on in lower case is
// the row it follows; a new title (a capital, not a value) starts the next row's.

const text = (words) => words.map((w) => w.text.replace(/[\u200b\u200c\u200d\ufeff]/g, '')).join(' ').replace(/\s+/g, ' ').trim();
// (`Mutli` is NRPN 253's, as printed; `Not settable` NRPN 444's.)
const CATEGORY = /^(?:Single|Multi(?:-part)?|Mutli|Sequence|Global|Not)$/;

/**
 * The NRPN table on these lines: [{ page, nrpn, category, range, description }]. `columns`: the x of
 * the category, range and description columns (a row's number is left of the category).
 */
export function readNrpnTable(input, { category = 110, range = 180, description = 250 } = {}) {
  // (A number set a few points off its row's line, NRPN 466's and 467's, is joined to it.)
  const lines = [];
  for (const l of input) {
    const prev = lines.at(-1);
    if (prev && prev.page === l.page && l.y - prev.y <= 4 && prev.words.length === 1 && /^\d+$/.test(prev.words[0].text) && prev.words[0].x0 < category - 10) {
      lines[lines.length - 1] = { ...l, words: [prev.words[0], ...l.words] };
    } else lines.push(l);
  }
  const rows = [];
  let ranges = [];    // range cells set over lines above their row's (`0-2 (0: off, 1:` / `CC, 2:` / `NRPN)`)
  let pending = [];   // description lines read since the last row's line, not yet given to a row
  let owner = null;   // the row those lines belong to, until a new title says otherwise
  // Lines earlier rows have run on with (`Upper byte is play count (0-64)` under each song part's
  // title): never a title, even at the head of a page.
  const runOns = new Set();
  for (const l of lines) {
    const w = l.words;
    const lead = w[0];
    const isRow = lead && lead.x0 < category - 10 && /^\d+$/.test(lead.text) && w[1] && CATEGORY.test(w[1].text) && Math.abs(w[1].x0 - category) < 30;
    const desc = text(w.filter((x) => x.x0 >= description - 10));
    if (isRow) {
      const category2 = text(w.filter((x) => x.x0 >= category - 10 && x.x0 < range - 10));
      const own = text(w.filter((x) => x.x0 >= range - 10 && x.x0 < description - 10));
      // (A word broken over two lines, `in-tempo-sy` / `nc`, is joined.)
      const cell = [...ranges, own].filter(Boolean).reduce((a, b) => (a && /[a-z]$/.test(a) && /^[a-z]{1,3}\b/.test(b) && !/:/.test(b) ? a + b : `${a} ${b}`.trim()), '');
      const row = { page: l.page, nrpn: Number(lead.text), category: category2.replace(/^Mutli$/, 'Multi'), ...(category2 === 'Mutli' ? { printed: 'Mutli' } : {}), range: cell, lines: [] };
      ranges = [];
      // The lines before it: those after a new title are its own.
      const start = pending.findIndex((p) => p.title);
      if (owner) owner.lines.push(...(start < 0 ? pending : pending.slice(0, start)).map((p) => p.text));
      row.lines.push(...(start < 0 ? [] : pending.slice(start)).map((p) => p.text));
      if (!owner && start < 0) row.lines.unshift(...pending.map((p) => p.text));
      if (desc) row.lines.push(desc);
      if (owner) for (const t of owner.lines.slice(1)) runOns.add(t);
      rows.push(row);
      owner = row;
      pending = [];
      continue;
    }
    // A line in the range column alone: the next row's range cell, set above it.
    if (!desc && w.length && w.every((x) => x.x0 >= range - 10 && x.x0 < description - 10)) { ranges.push(text(w)); continue; }
    if (!desc || w.some((x) => x.x0 < description - 10)) continue;   // the header, a page's running text
    const value = /^-?\d+\s*:/.test(desc);
    // (A title: a capital to start, not a value, and not a run-on of the line above, which ends in a
    // word, not a full stop.)
    const title = !value && !runOns.has(desc) && /^[A-Z]/.test(desc) && (pending.length === 0 ? true : !/[a-z,]$/.test(pending.at(-1).text) || /^[A-Z][a-z]+ [a-z]/.test(desc) && pending.at(-1).value);
    pending.push({ text: desc, value, title: title && (pending.some((p) => p.title) ? false : true) });
  }
  if (owner) owner.lines.push(...pending.map((p) => p.text));
  return rows.map(({ lines: ls, ...r }) => ({ ...r, description: ls.join(' | ') }));
}

/**
 * The value lists after the table (`Mod Source values (0-29 values)`, `Mod destination values
 * (0-126)`, `Analog waveform index values`): { [heading]: [{ value, label }] }, a line each, a value
 * and its name.
 */
export function readValueLists(lines, headings) {
  const lists = {};
  let current = null;
  for (const l of lines) {
    const t = text(l.words);
    const heading = headings.find((h) => t.startsWith(h));
    if (heading) { current = heading; lists[current] = []; continue; }
    if (!current) continue;
    const m = /^(\d+)\s+(.+)$/.exec(t);
    if (m && l.words[0].x0 < 120) lists[current].push({ value: Number(m[1]), label: m[2] });
    else if (lists[current].length && /^(?:Midi SysEx|Importing)/.test(t)) current = null;
  }
  return lists;
}
