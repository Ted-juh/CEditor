// parse-address-map.mjs — read the Parameter Address Map out of a Roland MIDI Implementation.
//
//   node tools/profiles/roland/parse-address-map.mjs <document.txt|document.pdf> [--json out.json]
//
// Roland has printed its address maps in one fixed-width table format for twenty-odd years — the
// SH-201 (2005), the GAIA (2010) and the JD-Xi (2015) are the same grammar character for character:
//
//   **Program Common
//   +------------------------------------------------------------------------------+
//   | Offset      |                                                                |
//   |     Address |                  Description                                   |
//   |-------------+----------------------------------------------------------------|
//   |       00 00 | 0aaa aaaa | Program Name 1                          (32 - 127) |
//   |             |           |                                  32 - 127 [ASCII] |
//   |#      00 11 | 0000 aaaa |                                                    |
//   |             | 0000 bbbb |                                                    |
//   |             | 0000 cccc |                                                    |
//   |             | 0000 dddd | Program Tempo                        (500 - 30000) |
//   |             |           |                                     5.00 - 300.00 |
//   |          : |            |                                                    |
//   |-------------+----------------------------------------------------------------|
//   | 00 00 00 3B | Total Size                                                     |
//   +------------------------------------------------------------------------------+
//
// So the map is read by a parser rather than retyped. Retyping is where transcription errors come
// from; a parser makes the same mistake everywhere or nowhere, and its output can be checked against
// the two maps in this repository that were transcribed by hand (tools/profiles/roland/README.md).
//
// The output is a TRANSCRIPTION: names, offsets, bit layouts, the wire range in brackets and the
// display line beneath it, exactly as printed. What a display line MEANS (choice labels, a bipolar
// range, a unit) is decided later, by interpret.mjs, so that this file has one job and the committed
// map stays a record of what the manual says rather than of what we made of it.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEX_BYTES = /^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*$/;

/** `|  00 11 | 0000 aaaa | Name  (0 - 1) |` -> ['  00 11 ', ' 0000 aaaa ', ' Name  (0 - 1) '] */
function cellsOf(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const parts = trimmed.split('|');
  // A row ends in '|', so split leaves an empty string at each end. Anything after the last '|' is
  // not a cell — it is the other column's text, run onto the line when a page's columns were not
  // separated — and is dropped rather than read as a fourth column.
  const cells = parts.slice(1, -1);
  // A bare `|` (a border clipped at a page edge) has no cells and nothing to say.
  return cells.length ? cells : null;
}

const isBorder = (line) => /^\+-{20,}\+?$/.test(line.trim()) || /^\+-{20,}/.test(line.trim());
const isSeparator = (line) => /^\|-{3,}/.test(line.trim());
const isHeaderRow = (cells) => cells.length <= 2
  && /^(Offset|Start|Address|Description)?$/.test(cells[0].trim())
  && /^(Description|Address|Offset)?$/.test((cells[1] ?? '').trim())
  && cells.some((c) => /Offset|Start|Address|Description/.test(c));

/**
 * A heading names the table that follows it: `**Program Common`, `* Patch`. The asterisks are also
 * how Roland marks a NOTE ("**Not received when …"), so a heading is told apart by being short and
 * not being a sentence.
 */
function headingOf(line) {
  // `**Program Common` (JD-Xi), `* Patch` (GAIA), `❍Patch Common` (SH-201).
  const match = /^\s*(?:\*{1,2}|❍)\s*(.+?)\s*$/.exec(line);
  if (!match) return null;
  const text = match[1];
  if (text.length > 60 || /[.:;]$/.test(text) || /^(Not |The |When |If |This |These |For |Received|Transmitted|Only |Use )/.test(text)) return null;
  return text;
}

/**
 * `Name    (0 - 127)` -> { name, min, max }. A range may be negative, `(-63 - +63)`; a single
 * value, `(0)` (the JD-Xi's drum Wave Group Type, which has one legal value); or a set,
 * `(0, 5 - 8)` (its EFX2 Type, which skips the four types EFX1 has and EFX2 does not). A set keeps
 * its members in `values`, because min and max alone would claim 1 to 4 are legal.
 */
function splitNameAndRange(text) {
  const match = /^(.*?)\s*\(\s*([-+]?\d+(?:\s*-\s*[-+]?\d+)?(?:\s*,\s*[-+]?\d+(?:\s*-\s*[-+]?\d+)?)*)\s*\)\s*$/.exec(text.trim());
  if (!match) return null;
  const values = [];
  let contiguous = true;
  const parts = match[2].split(',').map((part) => part.trim());
  for (const part of parts) {
    const span = /^([-+]?\d+)\s*-\s*([-+]?\d+)$/.exec(part);
    const [lo, hi] = span ? [Number(span[1]), Number(span[2])] : [Number(part), Number(part)];
    for (let v = lo; v <= hi; v++) values.push(v);
  }
  for (let i = 1; i < values.length; i++) if (values[i] !== values[i - 1] + 1) contiguous = false;
  const result = { name: match[1].trim(), min: Math.min(...values), max: Math.max(...values) };
  if (!contiguous) result.values = values;
  return result;
}

/**
 * Parse every address-map table in the document.
 *
 * Returns `{ modelId, tables }`. A table is either an OFFSETS table (two columns: an address and
 * what lives there) or a PARAMETERS table (three: offset, bit layout, description), with the page
 * it starts on so a reader can find it in the manual. A table that runs off the bottom of a column
 * carries on at the top of the next one; the parser keeps it open across anything that is not a
 * table line, which is how both page breaks and column breaks come out.
 */
export function parseAddressMap(text) {
  const tables = [];
  let modelId = null;
  let page = 1;
  let heading = null;
  let titleLine = null;
  let afterTableLine = false;
  let justClosed = null;
  let table = null;
  let row = null;

  const closeRow = () => {
    if (!row) return;
    // An exact repeat of a row already in the table — same offset, same name — is a slip in the
    // manual, not a second parameter: the AX-Edge's prints `00 09 Assignable Button(5) Function`
    // again after Buttons 6, 7 and 8. Kept once; the repeats are counted so a reader can see them.
    const repeat = row.offset && table.rows.some((r) => !r.gap && r.offset === row.offset && r.name === row.name);
    if (repeat) table.repeatedRows = (table.repeatedRows ?? 0) + 1;
    else table.rows.push(row);
    row = null;
  };
  const closeTable = () => {
    if (!table) return;
    closeRow();
    if (table.kind === 'parameters' || table.entries.length || table.rows.length) tables.push(table);
    table = null;
  };

  for (const rawLine of text.split('\n')) {
    if (rawLine.includes('\f')) page += rawLine.split('\f').length - 1;
    // Older documents (the SH-201's) set every dash as an em dash — borders, ranges and minus signs
    // alike: `(0 — 127)`, `—63 — +63`. One character class, folded before anything reads the line.
    const line = rawLine.replace(/\f/g, '').replace(/[‒-―−]/g, '-');

    // `(ModelID = 00H 00H 00H 0EH)`. Read up to the closing bracket, with the H optional: the
    // AX-Edge and JUPITER-X documents both print `00H 00H 00 65H`, and stopping at the first byte
    // without its H gave a two-byte model id that addresses nothing.
    const model = /Model\s?ID\s*=\s*((?:[0-9A-F]{2}H?\s*)+)\)/i.exec(line); // the MC-909 prints `Model ID =`
    if (model && !modelId) {
      modelId = model[1].trim().split(/\s+/).map((b) => b.replace(/H$/i, '').toUpperCase()).join(' ');
      heading = line.trim().replace(/^\d+\.\s*/, '');
    }

    const text = line.trim();
    if (isBorder(line)) {
      // A border straight after a table line closes that table. A border after anything else —
      // a heading set without its asterisk, a page number — cannot be closing a table that has
      // already stopped: the open one ended on a separator (the FA-06/07/08 does this), and this
      // border opens the next. A headless one that merely carries a table over a page break is
      // joined back onto it once everything is read (joinContinuations, below).
      if (table && afterTableLine) {
        justClosed = table;
        closeTable();
      } else {
        closeTable();
        table = { name: heading ?? titleLine ?? '(unnamed)', page, kind: null, entries: [], rows: [], totalSize: null };
      }
      heading = null;
      titleLine = null;
      afterTableLine = true;
      continue;
    }
    if (text) afterTableLine = text.startsWith('|');
    // Some documents set a table's heading without the asterisk — the FA-06/07/08's
    // `PCM Synth Tone Common` sits alone on the line above its border. Remember the last short,
    // title-like line, and use it only when no starred heading came first.
    if (text && !text.startsWith('|')) {
      titleLine = /^[A-Z][A-Za-z0-9 ()/&+\-]{2,59}$/.test(text) && !/\s(is|are|the|of|to)\s/i.test(text) ? text : null;
    }

    const h = headingOf(line);
    if (!table) {
      // A data row straight after a closing border, with nothing between them, means the border
      // was a rule inside the table: the V-Synth GT's top table draws one under User Tone (896) and
      // carries on with Temporary Patch and the User Patches. The table is taken back up.
      const rowCells = text ? cellsOf(line) : null;
      if (justClosed && rowCells && !isHeaderRow(rowCells) && !isSeparator(line) && tables.at(-1) === justClosed
          && HEX_BYTES.test(rowCells[0].replace('#', '').trim())) {
        table = tables.pop();
        justClosed = null;
      } else {
        if (text) justClosed = null;
        if (h) heading = h;
        continue;
      }
    }
    // A heading while a table is open means the open table has ended without its bottom border —
    // the FA-06/07/08's top table closes on a `|----+----|` separator and the next line is
    // `* System`. Inside a table every line starts with `|`, and a table carried over a column or
    // page break resumes with a row, never a heading, so this cannot cut one in two.
    if (h) {
      closeTable();
      heading = h;
      continue;
    }

    if (isSeparator(line)) { closeRow(); continue; }
    const cells = cellsOf(line);
    if (!cells) continue; // page furniture between the halves of a table that crosses a break
    if (isHeaderRow(cells)) continue;

    // ---- Total Size: the last row of every parameter table.
    if (cells.length === 2 && /Total Size/i.test(cells[1])) {
      closeRow();
      table.kind = 'parameters';
      table.totalSize = cells[0].trim();
      continue;
    }

    // ---- Offset tables: an address and a name.
    if (cells.length === 2) {
      const address = cells[0].trim();
      const name = cells[1].trim();
      table.kind ??= 'offsets';
      // The newer documents end an entry with the table it points to — `Tone Partial 1
      // [Tone Partial]` — which is a link, not part of the name: kept apart as `table`.
      const linked = /^(.*?)\s*\[([^\]]+)\]$/.exec(name);
      const entry = linked ? { name: linked[1].replace(/\s+/g, ' '), table: linked[2].trim() } : { name: name.replace(/\s+/g, ' ') };
      if (address === ':') table.entries.push({ gap: true });
      else if (HEX_BYTES.test(address)) table.entries.push({ address, ...entry });
      else if (name && table.entries.length) table.entries.at(-1).name += ` ${entry.name}`;
      continue;
    }

    // ---- Parameter rows: offset, bits, description.
    if (cells.length >= 3) {
      table.kind = 'parameters';
      const offsetCell = cells[0].trim();
      const bits = cells[1].trim();
      const descRaw = cells.slice(2).join('|');
      const desc = descRaw.trim();

      if (offsetCell.replace('#', '').trim() === ':') {
        closeRow();
        table.rows.push({ gap: true });
        continue;
      }

      const offsetMatch = /^(#?)\s*((?:[0-9A-F]{2} ?)+)$/.exec(offsetCell);
      // The newer documents (JUNO-X, JUPITER-X, FANTOM, GAIA-2) print every packet of a `#` value
      // with its OWN offset — `#00 00 | 0000 aaaa`, `00 01 | 0000 bbbb`, … `00 03 | 0000 dddd |
      // Master Tune` — where the older ones leave the offset cell blank after the first. A row whose
      // bits continue the letters of an open, still-unnamed packet row is that row's next packet.
      const continuesPacket = offsetMatch && !offsetMatch[1] && row?.packets && row.name === null
        && /^0000 [b-h]{4}$/.test(bits) && row.bits.length > 0;
      if (continuesPacket) {
        row.bits.push(bits);
      } else if (offsetMatch) {
        closeRow();
        row = { offset: offsetMatch[2].trim(), bits: bits ? [bits] : [], name: null, display: [] };
        if (offsetMatch[1]) row.packets = true;
      } else if (!row) {
        continue; // a continuation with nothing to continue: header debris
      } else if (bits && !continuesPacket) {
        row.bits.push(bits);
      }

      if (!desc) continue;
      // The SD-90's tables print each row's default beneath it: `default: (1024) 0` — the wire
      // value in brackets, then what the screen shows. A default, not more of the display line.
      const printedDefault = /^default\s*:\s*\((-?\d+)\)/i.exec(desc);
      if (printedDefault && row.name !== null) { row.printedDefault = Number(printedDefault[1]); continue; }
      const named = splitNameAndRange(desc);
      if (named && row.name === null) {
        row.name = named.name;
        row.min = named.min;
        row.max = named.max;
        if (named.values) row.values = named.values;
      } else if (row.name === null) {
        // A description with no bracketed range: `(reserve) <*>`, or a name whose range wrapped.
        row.name = desc;
      } else if (named && row.min === undefined && named.name === '') {
        row.min = named.min;
        row.max = named.max;
      } else {
        row.display.push(desc);
      }
    }
  }
  closeTable();
  joinContinuations(tables);

  // Older documents (SH-32, MC-909, SD-90, VariOS, the RD pianos) never print a `(ModelID = …)`
  // heading; they list the id a byte at a time in the exclusive-message tables — `00H Model ID #1
  // (SH-32)`, `4AH Model ID #2 (SH-32)`. Assembled from those, first value per position, and only
  // when there was no heading: where a document prints both, the address map's heading is the one
  // its own tables are written against (the JUPITER-X prints #4 as 52H once and 65H everywhere else).
  let modelIdFrom = modelId ? 'heading' : null;
  if (!modelId) {
    const bytes = new Map();
    for (const match of text.matchAll(/\b([0-9A-F]{2})H\s+model\s*ID\s*#\s*(\d)/gi)) {
      const position = Number(match[2]);
      if (!bytes.has(position)) bytes.set(position, match[1].toUpperCase());
    }
    const positions = [...bytes.keys()].sort((a, b) => a - b);
    if (positions.length && positions.every((p, i) => p === i + 1)) {
      modelId = positions.map((p) => bytes.get(p)).join(' ');
      modelIdFrom = 'byte list';
    }
  }

  for (const t of tables) {
    for (const r of t.rows) {
      if (r.gap) continue;
      // `(reserve) <*>` in the JD-Xi, `(reserved)` in the GAIA, `Reserved (0 - 0)` in the JUNO-X.
      // `<Reserved>` in the RD-2000, `(dummy)` in the SH-32, `(reserve) <*1>` in the TB-3.
      if (/^[<(]?\s*(reserved?|dummy)\s*[>)]?(\s*\d*)?(\s*<\*\d*>)?$/i.test(r.name ?? '') || /<\*\d*>/.test(r.name ?? '')) r.reserved = true;
      r.display = r.display.join(' ').replace(/\s+/g, ' ').trim();
      if (!r.display) delete r.display;
      // A few rows print no bracketed range at all, only the display line beneath — the JD-XA's
      // `Keyboard Fade Width Lower … 0 - 127`. When that line is a bare integer range and nothing
      // else, it IS the range; `rangeFromDisplay` says where it was found.
      const bare = !r.reserved && r.min === undefined && /^(-?\d+) - (-?\d+)$/.exec(r.display ?? '');
      if (bare) {
        r.min = Number(bare[1]);
        r.max = Number(bare[2]);
        r.rangeFromDisplay = true;
        delete r.display;
      }
      // The V-Synth GT's 32-bit sample offsets print their range in hexadecimal and nowhere else:
      // `0000000h - FFFFFFFh`.
      const hex = !r.reserved && r.min === undefined && /^([0-9A-F]+)h - ([0-9A-F]+)h$/i.exec(r.display ?? '');
      if (hex) {
        r.min = parseInt(hex[1], 16);
        r.max = parseInt(hex[2], 16);
        r.rangeFromDisplay = true;
      }
      // A switch printed with only its labels (the JUNO-Di's `Rhythm Pattern Sw … OFF, ON`) counts
      // out from zero: two labels are 0 - 1. Only when every label is a word, so a list of numbers
      // is never mistaken for a count.
      const labels = (r.display ?? '').split(',').map((label) => label.trim()).filter(Boolean);
      if (!r.reserved && r.min === undefined && r.name && labels.length >= 2 && labels.every((label) => /^[A-Za-z][\w\- /&+]*$/.test(label))) {
        r.min = 0;
        r.max = labels.length - 1;
        r.rangeFromDisplay = true;
      }
      // A row printed with no name and no range at all (the FA-06/07/08's Drum Kit Common, 00 0D
      // to 00 10) is a byte the manual does not describe: it occupies its address and is no control.
      if (r.name === null && r.min === undefined && !r.display) { r.reserved = true; r.undocumented = true; }
      if (r.bits.length > 1) r.nibbles = r.bits.length;
    }
    t.rows = expandSeries(t.rows, (r) => r.offset, (r, offset) => ({ ...r, offset }), (r) => !r.reserved);
    t.entries = expandSeries(t.entries, (e) => e.address, (e, address) => ({ ...e, address }), () => true);
  }
  return { modelId, ...(modelIdFrom === 'byte list' ? { modelIdFrom } : {}), tables };
}

/* ------------------------------------------------------------------ series */

const LAST_NUMBER = /(\d+)(?!.*\d)/;
const formatAddress = (value, length) => {
  const bytes = [];
  for (let i = 0; i < length; i++) { bytes.unshift(value % 128); value = Math.floor(value / 128); }
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
};

/**
 * Roland's `:` row means two different things, and only one of them may be filled in.
 *
 *   EFX1 Parameter 1     00 11        Drum Kit Partial (Key # 36)   00 2E 00
 *   EFX1 Parameter 2     00 15        Drum Kit Partial (Key # 37)   00 30 00
 *   :                                 :
 *   EFX1 Parameter 32    01 0D        Drum Kit Partial (Key # 72)   00 76 00
 *
 * Here it is "and so on": thirty parameters, or thirty-five drum keys, that exist and are simply
 * not printed. Between two `(reserve)` rows it is "more of the same nothing", and there is nothing
 * to fill. The difference is decided by arithmetic rather than by reading the names hopefully: the
 * rows either side must carry the same name with a number in it, the stride is taken from the two
 * rows before the gap (or, with only one, from the row's own width), and the series must land
 * EXACTLY on the printed row after the gap — (end - start) = (M - N) × stride. A gap that fails any
 * of that is left as a gap, which costs a missing parameter rather than an invented one.
 *
 * GAIA's `User Patch (A-1) … (H-8)` is the case the check exists for: its last numbers run 1 to 8
 * across sixty-four slots, the arithmetic does not close, and it is correctly left alone.
 */
function expandSeries(items, addressOf, withAddress, eligible) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.gap) { out.push(item); continue; }
    const before = out.at(-1);
    const after = items[i + 1];
    const filled = before && after && !after.gap && eligible(before) && eligible(after)
      ? fillBetween(out.at(-2), before, after, addressOf, withAddress) : null;
    if (filled) out.push(...filled);
    else out.push(item);
  }
  return out;
}

function fillBetween(twoBefore, before, after, addressOf, withAddress) {
  const nameOf = (x) => x.name ?? '';
  const n = LAST_NUMBER.exec(nameOf(before));
  if (!n) return null;
  const template = (x) => nameOf(x).replace(LAST_NUMBER, '#');
  const first = Number(n[1]);
  let last;
  const m = LAST_NUMBER.exec(nameOf(after));
  if (m && template(before) === template(after)) {
    last = Number(m[1]);
  } else {
    // A run that closes on a lettered slot — the JUNO-D6's `Scene Part (Part 1)`, `(Part 2)`, `:`,
    // `(Part R)`: the numbers carry on up to the slot before the letter, as many as the stride says.
    const escaped = template(before).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('#', '[A-Z]+');
    if (!new RegExp(`^${escaped}$`).test(nameOf(after))) return null;
    last = null;
  }

  const start = flat(addressOf(before));
  const end = flat(addressOf(after));
  let stride = null;
  if (twoBefore && !twoBefore.gap && template(twoBefore) === template(before)
      && Number(LAST_NUMBER.exec(nameOf(twoBefore))[1]) === first - 1) {
    stride = start - flat(addressOf(twoBefore));
  } else {
    stride = before.nibbles ?? 1;
  }
  if (stride <= 0) return null;
  if (last === null) {
    if ((end - start) % stride !== 0) return null;
    last = first + (end - start) / stride; // the lettered slot sits where number `last` would
  }
  if (last - first < 2 || end - start !== (last - first) * stride) return null;

  const length = addressOf(before).split(' ').length;
  const width = n[1].length;
  const rows = [];
  for (let k = first + 1; k < last; k++) {
    const number = String(k).padStart(n[1].startsWith('0') ? width : 0, '0');
    const name = nameOf(before).replace(LAST_NUMBER, number);
    rows.push({ ...withAddress(before, formatAddress(start + (k - first) * stride, length)), name, series: true });
  }
  return rows;
}

/**
 * A table carried over a page break that the document re-opens with a fresh border and header, and
 * no heading, comes out as an `(unnamed)` table right after one with no Total Size yet: it is that
 * table's second half, and its rows go back where they belong.
 */
function joinContinuations(tables) {
  for (let i = tables.length - 1; i > 0; i--) {
    const t = tables[i];
    const before = tables[i - 1];
    if (t.name !== '(unnamed)' || t.entries.length || before.kind !== 'parameters' || before.totalSize) continue;
    before.rows.push(...t.rows);
    before.totalSize = t.totalSize;
    if (t.repeatedRows) before.repeatedRows = (before.repeatedRows ?? 0) + t.repeatedRows;
    tables.splice(i, 1);
  }
}

/* ------------------------------------------------------------------ checks */

const toBytes = (hex) => hex.trim().split(/\s+/).map((b) => parseInt(b, 16));
/** Roland addresses and sizes are base-128 numbers, one 7-bit digit per byte. */
export const flat = (hex) => toBytes(hex).reduce((total, byte) => total * 128 + byte, 0);

/**
 * What the table itself can say about whether it was read correctly.
 *
 * Offsets must rise. Each row occupies one byte, or one per packet for a `#` row, and must end
 * before the next begins. The last row must end where Total Size says the block ends. A choice
 * parameter whose labels do not number max - min + 1 is reported by interpret.mjs, not here.
 *
 * The size check is a warning and not an error, deliberately: the GAIA's Distortion block states
 * 00 00 01 01 where its last offset gives 01 11, and the stated size is what the synth answers to.
 * A mismatch is a thing to look at, not a thing to correct.
 */
export function checkTables(tables) {
  const issues = [];
  for (const t of tables) {
    if (t.kind !== 'parameters') continue;
    if (!t.totalSize) { issues.push(`${t.name} (p${t.page}): no Total Size row`); continue; }
    let previousEnd = 0;
    let lastEnd = 0;
    let lastReserved = false;
    for (const r of t.rows) {
      if (r.gap) { previousEnd = -1; continue; }
      const start = flat(r.offset);
      if (previousEnd > 0 && start < previousEnd) issues.push(`${t.name}: ${r.offset} overlaps the row before it`);
      const end = start + (r.nibbles ?? 1);
      previousEnd = end;
      lastEnd = end;
      lastReserved = Boolean(r.reserved);
      if (!r.reserved && r.min === undefined) issues.push(`${t.name}: ${r.offset} "${r.name}" has no (min - max)`);
    }
    // The newer documents close a block with ONE `Reserved` row standing for every byte left up to
    // Total Size (FANTOM's Analog Filter: `00 23 Reserved`, size 00 28). Ending short behind a
    // reserve is that, not a lost row; ending short behind a live parameter, or past the size, is not.
    if (lastReserved && lastEnd < flat(t.totalSize)) lastEnd = flat(t.totalSize);
    if (lastEnd !== flat(t.totalSize)) {
      issues.push(`${t.name}: rows end at ${lastEnd}, Total Size says ${flat(t.totalSize)} (${t.totalSize})`);
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ cli */

async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith('--'));
  const jsonAt = args.indexOf('--json');
  if (!input) {
    console.error('usage: node tools/profiles/roland/parse-address-map.mjs <document.txt|.pdf> [--json out.json]');
    process.exitCode = 2;
    return;
  }
  let text;
  if (input.toLowerCase().endsWith('.pdf')) {
    const { extractText } = await import('./extract-text.mjs');
    text = extractText(input);
  } else {
    text = readFileSync(input, 'utf8');
  }
  const map = parseAddressMap(text);
  console.log(`model id ${map.modelId ?? '?'}; ${map.tables.length} tables`);
  for (const t of map.tables) {
    const live = t.rows.filter((r) => !r.gap && !r.reserved).length;
    console.log(`  p${String(t.page).padEnd(3)} ${t.kind === 'offsets' ? 'offsets   ' : 'parameters'} ${t.name}`
      + (t.kind === 'offsets' ? `  (${t.entries.filter((e) => !e.gap).length} entries)` : `  (${live} parameters, size ${t.totalSize})`));
  }
  const issues = checkTables(map.tables);
  if (issues.length) {
    console.log(`\n${issues.length} issue(s):`);
    for (const issue of issues) console.log(`  - ${issue}`);
  }
  if (jsonAt >= 0) writeFileSync(args[jsonAt + 1], `${JSON.stringify(map, null, 1)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
