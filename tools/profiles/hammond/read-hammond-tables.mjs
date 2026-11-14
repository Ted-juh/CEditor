// read-hammond-tables.mjs — the parameter tables at the end of Hammond's SK1/SK2, SKX and XK-1c
// owner's manuals, as printed, decided nothing.
//
// A table's header is `Category  Parameter  NRPN  SysEx Address  SysEx  Data  Default  Description`
// (Global), `… Data  Patch Load` or `… Preset Load` (Patch), or, for Leslie, two NRPN pairs (`NRPN
// (OR)`, `NRPN (21)`); under it `LSB MSB  MSB to LSB  Length`. A row is a parameter's name and its
// codes, each two characters: the NRPN's LSB and MSB (`01 00`, or `4n 00` for each external zone,
// `3p 05` for each section, `-- --` for none), the SysEx address's three bytes and its length; then
// its data, which may go on below in lines of their own (`00: Pedal (normal)`, `(-6 - 0 - 6)`), and
// in the Global table a default and its description. A name or a category that does not fit goes on
// below too (`(DRAWB)`, `Organ section`). A row's category is what is printed on its own lines; a
// row without one is in the category above it, which the builder carries down.
//
// And the Drawbar Data List 2: a controller for each drawbar of each part (`Upper 0CH(12) …`, `-` for
// none), and the values that are each level (`00 - 0FH … 7FH`).

// (Words pdftotext splits at a ligature, `Eﬀ ect`, `Ampliﬁ er`, are set without a gap: joined.)
const LIGATURES = { '\uFB00': 'ff', '\uFB01': 'fi', '\uFB02': 'fl', '\uFB03': 'ffi', '\uFB04': 'ffl' };
const text = (words) => words.map((w, k) => (k > 0 && w.x0 - words[k - 1].x1 < 1 ? '' : ' ') + w.text).join('').replace(/[\uFB00-\uFB04]/g, (c) => LIGATURES[c]).replace(/\s+/g, ' ').trim();
const CODE = /^(?:[0-9A-F]{2}|[0-9A-F][np]|--)$/;
const HEADINGS = /^(Global Parameters|Patch Parameters|Leslie Parameters|System Parameters|Tonewheel Parameters)\b/;

/** A table's header on this line and the next: its columns' x positions, or null. */
function headerOf(line, next) {
  const x = (l, word) => l?.words.find((w) => w.text === word)?.x0;
  if (x(line, 'Category') == null || x(line, 'Parameter') == null || x(line, 'NRPN') == null) return null;
  const load = line.words.find((w) => /^(?:Patch|Preset)$/.test(w.text));
  const nrpns = line.words.filter((w) => w.text === 'NRPN').length;
  return {
    category: x(line, 'Category'),
    parameter: x(line, 'Parameter'),
    codes: x(line, 'NRPN'),
    length: (next?.words.find((w) => w.text === 'Length')?.x1) ?? null,
    data: x(line, 'Data'),
    default: x(line, 'Default'),
    description: x(line, 'Description'),
    load: load?.x0,
    loadName: load ? `${load.text} Load` : null,
    codeCount: nrpns === 2 ? 8 : 6,
  };
}

/**
 * Every table on these lines (from documentLines: { page, y, words }), until the System Parameters:
 * [{ table, page, category, name, codes: [...], data: [lines], default?, description?, load? }].
 */
export function readTables(lines) {
  const rows = [];
  let table = null;
  let cols = null;
  for (let i = 0; i < lines.length; i++) {
    // (The footer's mark, `*#1`, and the SKX's, set in a symbol font, fall where a category would be.)
    const l = { ...lines[i], words: lines[i].words.filter((w) => !/^\*#/.test(w.text) && !/[\uE000-\uF8FF]/.test(w.text)) };
    if (/^(?:Skx|Sk1 \/ Sk2|:-%)(?: Owner’s Manual)?$/.test(text(l.words))) continue;
    const t = text(l.words);
    const heading = HEADINGS.exec(t);
    if (heading) {
      if (/^(System|Tonewheel)/.test(heading[1])) break;
      table = heading[1].replace(/ Parameters$/, '');
    }
    const header = headerOf(l, lines[i + 1]);
    if (header) { cols = header; i += 2; continue; }
    // (An example, `Set Transpose at 0 via NRPN ….Bx 62 01 63 00 06 40`, is not a row: examples() reads them.)
    if (!cols || !table || /^(?:Example|“[np]” means|ex:|NRPN \w+\/21)/.test(t) || /\.{5,}|via (?:NRPN|System Exclusive|SysEx)\b/.test(t) || /MIDI INFORMATION|Owner’s Manual|^\d+$|^Appendix$/.test(t)) continue;
    // The codes: the run of two-character cells from the NRPN column on.
    const after = l.words.filter((w) => w.x0 >= cols.codes - 14);
    const codes = [];
    for (const w of after) { if (codes.length < cols.codeCount && CODE.test(w.text)) codes.push(w); else break; }
    const isRow = codes.length === cols.codeCount;
    const end = isRow ? codes.at(-1).x1 : (cols.length ?? cols.codes);
    const rest = l.words.filter((w) => w.x0 > end + 2);
    // After the codes: the data, then (Global) the default and its description, or the load column.
    const loadFrom = cols.load != null ? cols.load - 26 : Infinity;
    const defaultFrom = cols.default != null ? cols.default - 6 : Infinity;
    const descriptionFrom = cols.default != null && cols.description != null ? (cols.default + cols.description) / 2 : Infinity;
    const cells = { data: [], default: [], description: [], load: [] };
    rest.forEach((w, k) => {
      const gap = k === 0 ? Infinity : w.x0 - rest[k - 1].x1;
      if (w.x0 >= descriptionFrom) cells.description.push(w);
      else if (w.x0 >= defaultFrom) cells.default.push(w);
      else if (w.x0 >= loadFrom && (gap > 6 || cells.load.length)) cells.load.push(w);
      else cells.data.push(w);
    });
    // (The headers are centred over their columns: a name starts left of `Parameter`.)
    const left = l.words.filter((w) => w.x0 < cols.codes - 14);
    const nameFrom = (cols.category + cols.parameter) / 2;
    const categoryWords = left.filter((w) => w.x0 < nameFrom);
    const nameWords = left.filter((w) => w.x0 >= nameFrom);
    // A data cell printed in two columns (`00 - 04   03: Both (normal)`) is two items.
    const segments = [];
    // (Two items set close enough to read as one, `00: Pedal (normal) 04: Both (reverse)`, are split
    // where the second's value starts, `04:` or `0D - 25:`, each in the column its own x puts it.)
    const startsItem = (ws, k) => k > 0 && ((/^[0-9A-F]{2}:$/.test(ws[k].text) && !(ws[k - 1].text === '-' && /^[0-9A-F]{2}$/.test(ws[k - 2]?.text ?? ''))) || (/^[0-9A-F]{2}$/.test(ws[k].text) && ws[k + 1]?.text === '-' && /^[0-9A-F]{2}:$/.test(ws[k + 2]?.text ?? '')));
    cells.data.forEach((w, k) => { if (k === 0 || w.x0 - cells.data[k - 1].x1 > 9 || startsItem(cells.data, k)) segments.push([w]); else segments.at(-1).push(w); });
    cells.data = segments.map((ws) => ({ x: ws[0].x0, text: text(ws) }));
    if (isRow) {
      rows.push({
        table, page: l.page, ...(categoryWords.length ? { category: text(categoryWords) } : {}), name: text(nameWords), codes: codes.map((w) => w.text),
        columns: [],
        ...(cells.default.length ? { default: text(cells.default) } : {}),
        ...(cells.description.length ? { description: text(cells.description) } : {}),
        ...(cells.load.length ? { load: text(cells.load) } : {}),
      });
      for (const d of cells.data) addData(rows.at(-1), d);
      continue;
    }
    const row = rows.at(-1);
    if (!row || row.table !== table) continue;
    // A line of its own: the row's data going on, its name's, its category's, or its description's.
    for (const d of cells.data) addData(row, d);
    if (nameWords.length) row.name = `${row.name} ${text(nameWords)}`;
    if (categoryWords.length) row.category = `${row.category ?? ''} ${text(categoryWords)}`.trim();
    if (cells.description.length) row.description = `${row.description ?? ''} ${text(cells.description)}`.trim();
    if (cells.load.length) row.load = `${row.load ?? ''} ${text(cells.load)}`.trim();
  }
  // A row's data: its columns' items, the left column's first.
  return rows.map(({ columns, ...r }) => ({ ...r, data: columns.sort((a, b) => a.x - b.x).flatMap((c) => c.items) }));
}

/**
 * A piece of a row's data, at x: a new item where it starts with a value (`03: Both`, `0D - 25:`) or
 * is the first in its column; otherwise the going on of its column's last (`(alternate)` under `01:
 * Leslie Fast`, `(-6 - 0 - 6)` under `3A - 40 - 46`).
 */
function addData(row, { x, text: t }) {
  let col = row.columns.find((c) => Math.abs(c.x - x) < 16);
  if (!col) { col = { x, items: [] }; row.columns.push(col); }
  if (!col.items.length || /^[0-9A-F]{2}(?:\s*-\s*[0-9A-F]{2})?\s*:/.test(t)) col.items.push(t);
  else col.items[col.items.length - 1] += ` ${t}`;
}

/**
 * The examples printed under the tables, as they are: [{ page, text }] (`Set Transpose at 0 via
 * NRPN ….Bx 62 01 63 00 06 40 (x = Upper channel)`), the dotted leader taken out.
 */
export function readExamples(lines) {
  return lines
    .map((l) => ({ page: l.page, text: text(l.words).replace(/^Example:?\s*/, '').replace(/\s*\.{5,}\s*/, ' … ') }))
    .filter((e) => /via (?:NRPN|System Exclusive|SysEx)\b/.test(e.text));
}

/**
 * The Drawbar Data List 2: { parts: [{ part, controllers: [n|null …] }], levels: [first value of
 * each level] }. A controller is printed `0CH(12)`; `-` is a drawbar the part does not have.
 */
export function readDrawbarList(lines) {
  const at = lines.findIndex((l) => /^Drawbar Data List 2$/.test(text(l.words)));
  if (at < 0) return null;
  const parts = [];
  let levels = null;
  for (const l of lines.slice(at + 1)) {
    const t = text(l.words);
    if (/^ex:/.test(t)) break;
    const part = /^(Upper|Lower|Pedal)\s+(.*)$/.exec(t);
    if (part) {
      const cells = part[2].split(/\s+/).map((c) => (/^[0-9A-F]{2}H\((\d+)\)$/.test(c) ? Number(/\((\d+)\)/.exec(c)[1]) : c === '-' ? null : c));
      parts.push({ part: part[1], controllers: cells });
      continue;
    }
    const value = /^Value\s+(.*)$/.exec(t);
    // (`00 - 0FH  10 - 1FH … 70 - 7EH  7FH`: each level's first value.)
    if (value) levels = [...value[1].matchAll(/([0-9A-F]{2})H?(?:\s*-\s*[0-9A-F]{2}H)?/g)].map((m) => m[1]);
  }
  return { parts, levels };
}

/**
 * What a placeholder in the codes stands for, as the examples' notes print it: `“n” means Zone
 * number. 1=0, 2=1, 3=2` and `“p” means Section number. Organ=0, Extra Voice=1` ->
 * { n: { name: 'Zone', values: [{ label: '1', value: 0 } …] }, p: … }.
 */
export function readPlaceholders(lines) {
  const out = {};
  for (const l of lines) {
    const m = /“([np])” means (\w+) number\.\s*(.*)$/.exec(text(l.words));
    if (!m) continue;
    out[m[1]] = { name: m[2], values: [...m[3].matchAll(/([\w. ]+?)=(\d+)/g)].map((v) => ({ label: v[1].trim(), value: Number(v[2]) })) };
  }
  return out;
}

/** The Identity Reply's codes as printed: `00 10  Device Family code`, `00 1F  Device Family number`. */
export function readIdentity(lines) {
  const find = (re) => lines.map((l) => re.exec(text(l.words))).find(Boolean)?.[1].split(' ');
  return { family: find(/\b([0-9A-F]{2} [0-9A-F]{2})\s+Device Family code/), member: find(/\b([0-9A-F]{2} [0-9A-F]{2})\s+Device Family number/), model: find(/\b(10)\s+Model ID MSB/) && find(/\b([0-9A-F]{2})\s+Model ID LSB/) };
}
