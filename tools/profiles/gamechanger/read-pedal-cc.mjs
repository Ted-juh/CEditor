// read-pedal-cc.mjs — the MIDI CC tables of Gamechanger Audio's pedal manuals, as printed, decided
// nothing.
//
// Two forms, both read from the PDFs' word positions (documentLines: { page, y, words }):
//
//   - `CC  NAME  MSB value range  MSB and LSB value range (CC[n] = MSB, CC[n+32] = LSB)`, the AUTO
//     pedals' quick guides and the Motor Pedal's manual: a row its controller and name, then what the
//     values mean twice over, in 7 bits and in 14 (`[0...42] = FAST, [43...84] = SLOW, …`). A cell
//     that does not fit wraps: the AUTO guides set a row's number on its last line (the cell's first
//     lines above it), the Motor Pedal's manual on its first (the rest below), which the layout says.
//     The columns are where the header puts them; a band can overrun its column (`[85...` ending
//     the 7-bit cell where the 14-bit one starts), so a word is the column its left edge is in.
//   - `Adjustment  Address  Range`, the Bigsby's CC map: a row a line (`Rate MSB  14  0-127`).

const text = (words) => words.map((w) => w.text).join(' ').normalize('NFKC').replace(/\s+/g, ' ').trim();   // NFKC: the ﬀ ligature
const STOP = /^(?:PC|TECHNICAL|Connections)$/;

/** The band table's columns: { cc, name, msb, pair } as x positions, and the header's line. */
export function bandColumns(lines) {
  const at = lines.findIndex((l) => l.words[0]?.text === 'CC' && l.words[1]?.text === 'NAME');
  if (at < 0) return null;
  const head = lines[at];
  // `MSB and LSB …` on the header's line (the Motor Pedal) or the line above it (the AUTO guides).
  const pairOf = (line) => line?.words.find((w, k) => w.text === 'MSB' && line.words[k + 1]?.text === 'and')?.x0;
  return {
    at,
    cc: head.words[0].x0,
    name: head.words[1].x0,
    msb: head.words.find((w) => w.text === 'MSB').x0,
    pair: pairOf(head) ?? pairOf(lines[at - 1]),
  };
}

/**
 * The band table on these lines: [{ page, cc, name, msb, pair }], each cell's lines joined top to
 * bottom. `numberLine` says which of a row's lines carries its number: 'last' (the cells' other
 * lines above it) or 'first' (below it).
 */
export function readBandTable(lines, { numberLine }) {
  const cols = bandColumns(lines);
  if (!cols) return [];
  const rows = [];
  let pending = [];                                          // lines waiting for the row below them
  for (const line of lines.slice(cols.at + 1)) {
    if (STOP.test(line.words[0]?.text ?? '')) break;
    const cell = { cc: [], name: [], msb: [], pair: [] };
    for (const w of line.words) {
      const col = w.x0 >= cols.pair - 2 ? 'pair' : w.x0 >= cols.msb - 2 ? 'msb' : w.x0 >= cols.name - 2 ? 'name' : 'cc';
      cell[col].push(w);
    }
    const number = cell.cc.length === 1 && /^\d{1,3}$/.test(cell.cc[0].text) ? Number(cell.cc[0].text) : null;
    if (number == null) {
      // A name going on in the number's column (`(MODWHEEL)` under `MOD`) is the name's.
      cell.name.unshift(...cell.cc);
      cell.cc = [];
    }
    if (number != null) {
      const row = { page: line.page, cc: number, name: [], msb: [], pair: [] };
      for (const p of numberLine === 'last' ? pending : []) for (const k of ['name', 'msb', 'pair']) row[k].push(...p[k]);
      pending = [];
      for (const k of ['name', 'msb', 'pair']) row[k].push(...cell[k]);
      rows.push(row);
      continue;
    }
    if (numberLine === 'last') { pending.push(cell); continue; }
    const last = rows.at(-1);
    if (last) for (const k of ['name', 'msb', 'pair']) last[k].push(...cell[k]);
  }
  return rows.map((r) => ({ page: r.page, cc: r.cc, name: text(r.name), msb: text(r.msb), pair: text(r.pair) }));
}

/** The Bigsby's form: [{ page, name, cc, range }], from the `Adjustment  Address  Range` header to the next heading. */
export function readAddressTable(lines) {
  const at = lines.findIndex((l) => l.words[0]?.text === 'Adjustment' && l.words.some((w) => w.text === 'Address'));
  if (at < 0) return [];
  const address = lines[at].words.find((w) => w.text === 'Address');
  const rows = [];
  for (const line of lines.slice(at + 1)) {
    const k = line.words.findIndex((w) => /^\d{1,3}$/.test(w.text) && w.x1 >= address.x0 - 4 && w.x0 <= address.x1 + 4);
    if (k < 0) break;
    rows.push({ page: line.page, name: text(line.words.slice(0, k)), cc: Number(line.words[k].text), range: text(line.words.slice(k + 1)) });
  }
  return rows;
}
