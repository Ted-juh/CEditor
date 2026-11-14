// read-motor-maps.mjs — Gamechanger Audio's Motor Synth MIDI documents, as printed, decided nothing.
//
// Two forms:
//
//   - the NRPN MAP: `NRPN ADDR  PARAMETER  TYPE  PARAMETER VALUE RANGE  MIDI DATA RANGE (NRPN)
//     RETAINS`. The MKII's own PDF sets each cell vertically centred on its row's number: a type over
//     two lines (`UNIPOLAR` above, `FLOAT` below), a value range that does not fit wrapped the same
//     way (`-1200 ... 0 ...` above, `1200` below). The MKI manual prints the same map a row a line,
//     wrapping only the cells that do not fit. So a line without a number is the row's whose number
//     is nearest it on its page, and the columns are where the header puts them.
//   - the MIDI SYSEX pages: a heading (`SOUND PARAMETER DUMP`), then a field a line, its name and
//     its bytes (`Manufacturers System Exclusive id code [3 bytes]   0x00 0x21 0x6D`), a name that
//     wraps continuing on the next line without bytes.

const text = (words) => words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();

/** The header's columns: { addr, name, type, value, midi, retains } as x positions. */
export function mapColumns(lines) {
  const at = lines.findIndex((l) => l.words.some((w) => w.text === 'RETAINS') && l.words.some((w) => w.text === 'TYPE'));
  if (at < 0) return null;
  const x = (line, word) => line?.words.find((w) => w.text === word)?.x0;
  const head = lines[at];
  const above = lines[at - 1];
  const below = lines[at + 1];
  return {
    at,
    addr: Math.min(x(above, 'NRPN') ?? Infinity, x(below, 'ADDR') ?? Infinity),
    name: x(head, 'PARAMETER'),
    type: x(head, 'TYPE'),
    value: x(below, 'VALUE') ?? x(above, 'PARAMETER'),
    midi: x(head, 'MIDI'),
    retains: x(head, 'RETAINS'),
  };
}

/**
 * The NRPN map on these lines (from documentLines: { page, y, words }): [{ page, nrpn, name, type,
 * value, midi, retains }], each cell's lines joined top to bottom. Lines above the header and below
 * the map's end (`MIDI SYSEX`) are not the map's.
 */
export function readNrpnMap(lines) {
  const cols = mapColumns(lines);
  if (!cols) return [];
  const edges = [['name', cols.name - 4], ['type', cols.type - 4], ['value', cols.value - 4], ['midi', cols.midi - 4], ['retains', cols.retains - 4]];
  const columnOf = (w) => edges.reduce((found, [key, from]) => (w.x0 >= from ? key : found), 'addr');
  const end = lines.findIndex((l, i) => i > cols.at && /^MIDI SYSEX$/.test(text(l.words)));
  const body = lines.slice(cols.at + 2, end < 0 ? undefined : end).filter((l) => !/^GAMECHANGER|^NRPN MAP$|^MOTOR SYNTH|^NRPN PARAMETER$|^ADDR VALUE RANGE$/.test(text(l.words)) && !l.words.some((w) => w.text === 'RETAINS'));
  const isRow = (l) => /^\d+$/.test(l.words[0]?.text ?? '') && l.words[0].x0 < cols.name - 4;
  const rows = body.filter(isRow).map((l) => ({ page: l.page, y: l.y, nrpn: Number(l.words[0].text), cells: { name: [], type: [], value: [], midi: [], retains: [] } }));
  for (const l of body) {
    const own = isRow(l) ? rows.find((r) => r.page === l.page && r.y === l.y) : rows.filter((r) => r.page === l.page).reduce((best, r) => (!best || Math.abs(r.y - l.y) < Math.abs(best.y - l.y) ? r : best), null);
    if (!own) continue;
    const words = isRow(l) ? l.words.slice(1) : l.words;
    for (const key of Object.keys(own.cells)) {
      const cell = words.filter((w) => columnOf(w) === key);
      if (cell.length) own.cells[key].push({ y: l.y, text: text(cell) });
    }
  }
  return rows.map(({ page, nrpn, cells }) => ({
    page, nrpn,
    ...Object.fromEntries(Object.entries(cells).map(([k, parts]) => [k, parts.sort((a, b) => a.y - b.y).map((p) => p.text).join(' ')])),
  }));
}

/**
 * The SysEx pages (pdftotext -layout): { [heading]: [{ field, bytes }] }. A heading is a line in
 * capitals alone; a field a name, then its bytes after two spaces or more (`0x00 0x21 0x6D`, `0xhh
 * (if 0x7F responds if any channel)`, `F7`).
 */
export function readSysex(text, headings) {
  const out = {};
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\f/g, '').trimEnd();
    const t = line.trim();
    if (!t || /^GAMECHANGER|MOTOR SYNTH MKI USER MANUAL|^MIDI SYSEX$/.test(t)) continue;
    if (headings.includes(t)) { current = t; out[current] = []; continue; }
    if (!current) continue;
    if (/^[A-Z][A-Z ]+$/.test(t)) { current = null; continue; }
    // (A field's bytes follow two spaces or more; a run of them, `0xhh 0xhh …`, may follow one.)
    const m = /^(.*?\S)(?:\s{2,}|\s(?=0x[0-9A-Fa-fh]{2}\s+0x))((?:0x[0-9A-Fa-f]{2}|0xhh|F7)\b.*)$/.exec(t);
    if (m) out[current].push({ field: m[1], bytes: m[2] });
    else if (out[current].length) out[current].at(-1).field += ` ${t}`;
  }
  return out;
}
