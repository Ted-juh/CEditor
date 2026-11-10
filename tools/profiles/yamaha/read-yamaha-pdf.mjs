// read-yamaha-pdf.mjs — the MIDI data tables in Yamaha's data lists, from poppler's word positions
// (`pdftotext -bbox-layout`).
//
// Yamaha has set these tables the same way for twenty years: a title, `MIDI PARAMETER CHANGE TABLE
// (VOICE Common)`, then the headings `Address (hex)` (over `High Mid Low`, or alone), `Size`, `Data
// Range (hex)`, `Parameter Name`, `Description` (or `Settings`), sometimes `Default (HEX)`, `Notes`, and the rows set
// from the top: the address printed in full on a block's first row and its low byte alone after, a
// name or a description wrapped onto the lines below. Two tables often stand side by side on a page,
// and a table runs on over the next page under its headings without its title. `Total Size = 32`
// closes one.
//
// Decides nothing about what a parameter is: the rows come out as printed, the address carried down.

import { execFileSync } from 'node:child_process';

import { pageWords } from '../moog/read-moog-pdf.mjs';

export function pageXml(pdf, page) {
  return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-bbox-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

export function pagesText(pdf, pages) {
  return pages.map((p) => execFileSync('pdftotext', ['-f', String(p), '-l', String(p), '-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })).join('\f');
}

const middle = (box) => (box.y0 + box.y1) / 2;
/** A byte of an address as printed: hex, or a placeholder for a part, element, operator (`op`, `ep`, `5p`, `kk`). */
const ADDRESS_BYTE = /^([0-9A-F]{2}|[0-9a-zA-Z]{2})$/;   // a placeholder may be capital: the MODX M's `L0`, `Lm`
const HEX_BYTE = /^[0-9A-F]{2}$/;

/** Words of one line from x0 to x1. */
const wordsIn = (line, x0, x1) => line.words.filter((w) => w.x0 >= x0 - 0.5 && w.x0 < x1 - 0.5);

/**
 * The page's words as printed lines: poppler gives a cell's words a line of their own, so a row
 * across a table is its words at one height, put together here, left to right.
 */
export function visualLines(words) {
  const out = [];
  for (const w of [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const line = out.find((l) => Math.abs(l.y0 - w.y0) < 2.5 && Math.abs(l.y1 - w.y1) < 3);
    if (line) { line.words.push(w); line.y0 = Math.min(line.y0, w.y0); line.y1 = Math.max(line.y1, w.y1); } else out.push({ y0: w.y0, y1: w.y1, words: [w] });
  }
  for (const l of out) l.words.sort((a, b) => a.x0 - b.x0);
  return out.sort((a, b) => a.y0 - b.y0);
}

/**
 * The parameter-change tables' headings on a page: each `Parameter Name` with the headings on its
 * band, left of it (`Size`, `Data`/`Range`, `Address`) and right of it (`Description`, `Default`,
 * `Notes`), and the span across the page it governs.
 */
function findHeads(lines, width) {
  const words = lines.flatMap((l) => l.words);
  const lineOf = new Map(lines.flatMap((l) => l.words.map((w) => [w, l])));
  const heads = [];
  for (const line of lines) {
    line.words.forEach((w, i) => {
      // `Parameter Name` on one line, or `Parameter` over `Name`.
      const next = line.words[i + 1];
      const beside = next?.text === 'Name' && next.x0 - w.x1 <= 8;
      const under = words.some((x) => x.text === 'Name' && x.y0 > w.y0 && x.y0 - w.y1 < 6 && x.x0 < w.x1 && x.x1 > w.x0);
      if (w.text !== 'Parameter' || !(beside || under)) return;
      const band = (x) => Math.abs(middle(x) - middle(w)) <= 13;
      const left = words.filter((x) => band(x) && x.x1 <= w.x0 + 1).sort((a, b) => b.x0 - a.x0);
      const size = left.find((x) => x.text === 'Size');
      if (!size) return;
      const address = left.find((x) => /^Address/.test(x.text) && x.x0 < size.x0);
      const range = words.filter((x) => band(x) && /^(Data|Range)$/.test(x.text) && x.x0 > size.x0 && x.x0 < w.x0).sort((a, b) => a.x0 - b.x0)[0];
      if (!address || !range) return;
      heads.push({ y0: Math.min(w.y0, size.y0, address.y0), name: w, size, address, range });
    });
  }
  // A head's right-hand headings run to the next head on its band; its span ends there.
  for (const h of heads) {
    // The page's columns are where its tables' `Address` headings stand, whatever their heights.
    const next = heads.filter((o) => o !== h && o.address.x0 > h.name.x0).sort((a, b) => a.address.x0 - b.address.x0)[0];
    h.x1 = next ? next.address.x0 - 15 : width;
    h.x0 = h.address.x0 - 8;
  }
  // A title, or a row's first address byte, can start a little left of the `Address` heading (the
  // MODX's titles do, by ten points, the MODX M's by thirteen and a half), but not into the table
  // beside it.
  for (const h of heads) {
    const prev = heads.filter((o) => o !== h && o.name.x1 < h.address.x0).sort((a, b) => b.address.x0 - a.address.x0)[0];
    h.x0 = Math.max(h.address.x0 - 15, prev ? prev.x1 : 0);
  }
  for (const h of heads) {
    const band = (x) => Math.abs(middle(x) - middle(h.name)) <= 13 && x.x0 > h.name.x1 && x.x0 < h.x1;
    // The MX heads it `Settings` on some pages.
    h.description = words.find((x) => band(x) && (x.text === 'Description' || x.text === 'Settings'));
    h.defaultHead = words.find((x) => band(x) && x.text === 'Default');
    h.notes = words.find((x) => band(x) && x.text === 'Notes');
    // The headings' own lines: `(hex)`, `High Mid Low` below them.
    // (Close enough to the band that a first row printing `Name` in a parameter's name is not one.)
    const own = words.filter((x) => x.x0 >= h.x0 && x.x0 < h.x1 && x.y0 >= h.y0 - 14 && x.y0 <= middle(h.name) + 9.5
      && /^(Address|\(hex\)|\(HEX\)|Size|Data|Range|Parameter|Name|Description|Settings|Default|Notes|High|Mid|Low)$/.test(x.text));
    h.bottom = Math.max(...own.map((x) => x.y1));
  }
  return heads;
}

/**
 * The parameter-change tables on one page, in reading order (each column of the page top to
 * bottom): { title, notes, rows: [{ address: [H, M, L], size, range: [..], name, description,
 * default, notes }] }. A table with no title over it on this page continues the one before it.
 */
export function pageParameterTables(xml, addressBytes = 3) {
  const { words, width, height } = pageWords(xml);
  const lines = visualLines(words);
  // In reading order: the page's left column top to bottom, then its right. By left edge alone, a
  // table set a few points left of the one above it would be read first (the S90 XS's page 108).
  const heads = findHeads(lines, width).sort((a, b) => (a.x0 >= width / 2) - (b.x0 >= width / 2) || a.y0 - b.y0 || a.x0 - b.x0);
  const out = [];
  for (const h of heads) {
    const inSpan = (l) => l.words.some((w) => w.x0 >= h.x0 && w.x0 < h.x1);
    // The table ends where the next one in its span begins: at that one's title, if it has one.
    const titleTop = (o) => {
      const t = lines.filter((l) => l.y1 <= o.y0 + 1 && l.y0 > o.y0 - 70 && /PARAMETER CHANGE TABLE/i.test(wordsIn(l, o.x0, o.x1).map((w) => w.text).join(' ')));
      return t.length ? Math.min(...t.map((l) => l.y0)) : o.y0;
    };
    const below = heads.filter((o) => o !== h && o.y0 > h.y0 && o.x0 < h.x1 && o.x1 > h.x0).map(titleTop).sort((a, b) => a - b)[0] ?? Infinity;
    // Its title: the lines above it, in its span, that name a parameter change table.
    const above = lines.filter((l) => l.y1 <= h.y0 + 1 && l.y0 > h.y0 - 70 && inSpan(l) && !heads.some((o) => o !== h && o.y0 < h.y0 && o.bottom > l.y0 && o.x0 < h.x1 && o.x1 > h.x0)).sort((a, b) => a.y0 - b.y0);
    const titleAt = above.findIndex((l) => /PARAMETER CHANGE TABLE/i.test(wordsIn(l, h.x0, h.x1).map((w) => w.text).join(' ')));
    let title = null;
    const notes = [];
    if (titleAt >= 0) {
      const text = (l) => wordsIn(l, h.x0, h.x1).map((w) => w.text).join(' ');
      title = text(above[titleAt]);
      const rest = above.slice(titleAt + 1);
      if (rest[0] && /^\(/.test(text(rest[0])) && !/PARAMETER CHANGE TABLE \(/i.test(title)) title += ` ${text(rest.shift())}`;
      // The MODX M sets `Group Number =7F 1C, Model ID = 0D` beside its title.
      title = title.replace(/\s*Group Number\s*=.*$/i, '');
      for (const l of rest) if (text(l)) notes.push(text(l));
    }
    // It also ends at its `Total Size`: the notes printed under it are not its columns.
    const total = lines.filter((l) => l.y0 > h.bottom && /^Total Size/i.test(wordsIn(l, h.x0, h.x1).map((w) => w.text).join(' '))).map((l) => l.y0).sort((a, b) => a - b)[0] ?? Infinity;
    // A row set close under a tall heading (the YC's `50 00 00 … Voice Number` beside `(HEX)`) is still a
    // row: below the heading's name, an address and a size.
    const rowLike = (l) => l.y0 > middle(h.name) && /^([0-9A-Fa-zA-Z]{2} ){1,4}\d+ /.test(`${wordsIn(l, h.x0, h.x1).map((w) => w.text).join(' ')} `);
    const below0 = (l) => l.y0 > h.bottom + 0.5 || rowLike(l);
    const body = lines.filter((l) => below0(l) && l.y0 < Math.min(below, total) - 1 && inSpan(l) && l.y0 < height - 40).sort((a, b) => a.y0 - b.y0);
    // The rows go on past it to the next table's title: under one heading a column can hold several
    // tables, each with its own Total Size (the MO's Normal Voice Common: Extra, Common 1, Common 2,
    // Reverb …). The columns are found above the first Total Size alone.
    const rowLines = lines.filter((l) => below0(l) && l.y0 < below - 1 && inSpan(l) && l.y0 < height - 40).sort((a, b) => a.y0 - b.y0);
    // The columns. A heading is often centred over cells that start left of it (`Description`), so
    // each column starts in the widest gap the body's words leave between the heading before it and
    // its own: the x that the fewest words cover.
    const bodyWords = body.flatMap((l) => l.words).filter((w) => w.x0 >= h.x0 && w.x0 < h.x1);
    const gapAt = (a, b) => {
      if (!(b > a)) return b;
      let best = null;
      let run = null;
      for (let x = Math.floor(a); x <= Math.ceil(b); x++) {
        const n = bodyWords.filter((w) => w.x0 < x + 0.5 && w.x1 > x - 0.5).length;
        if (run && run.n === n) run.to = x; else run = { n, from: x, to: x };
        if (!best || run.n < best.n || (run.n === best.n && run.to - run.from > best.to - best.from)) best = { ...run };
      }
      return (best.from + best.to) / 2;
    };
    const headings = [['size', h.size], ['range', h.range], ['name', h.name], ['description', h.description], ['default', h.defaultHead], ['notes', h.notes]].filter(([, w]) => w);
    const cols = [['address', h.x0]];
    headings.forEach(([kind, w], i) => {
      const previous = i === 0 ? h.address : headings[i - 1][1];
      // Up to 35 points left of the heading: the Motif XF centres `Parameter Name` 28 points right of
      // where its arpeggio tables' names start.
      const start = gapAt(Math.max(Math.min(previous.x1, w.x0 - 1) - (i === 0 ? 0 : 4), w.x0 - 35), w.x0 + 1);
      // A size is one digit set under its heading. Where every row of a table prints its address's
      // low byte alone, set under the right of `Address` (a table run on from the page before), the
      // widest gap is left of those bytes: the size column does not start that far left.
      cols.push([kind, kind === 'size' ? Math.max(start, w.x0 - 8) : start]);
    });
    if (process.env.YAMAHA_DEBUG) console.error(title, JSON.stringify(cols.map(([k, x]) => [k, Math.round(x)])));
    const columnOf = (w) => { let k = null; for (const [kind, x] of cols) if (w.x0 >= x - 0.5) k = kind; return w.x0 < h.x1 ? k : null; };
    const rows = [];
    let current = null;
    let afterTotal = false;
    for (const l of rowLines) {
      const cells = {};
      for (const w of l.words) {
        const k = columnOf(w);
        if (k) (cells[k] ??= []).push(w.text);
      }
      const text = (k) => (cells[k] ?? []).join(' ');
      // A Total Size ends a table: what follows it is notes until the next row printed in full.
      if (/^Total Size/i.test(text('address') || text('size'))) { current = null; afterTotal = true; continue; }
      const addressWords = cells.address ?? [];
      const isRow = addressWords.length >= 1 && addressWords.length <= addressBytes && addressWords.every((t) => ADDRESS_BYTE.test(t)) && HEX_BYTE.test(addressWords.at(-1)) && /^\d+$/.test(text('size'));
      if (isRow && afterTotal && addressWords.length < addressBytes) continue;
      if (isRow) {
        afterTotal = false;
        current = { address: addressWords, size: Number(text('size')), range: text('range') ? [text('range')] : [], name: text('name'), description: text('description'), ...(h.defaultHead ? { default: text('default') } : {}), notes: text('notes') };
        rows.push(current);
      } else if (current) {
        if (text('range')) current.range.push(text('range'));
        for (const k of ['name', 'description', 'default', 'notes']) if (text(k)) current[k] = `${current[k] ?? ''} ${text(k)}`.trim();
      }
    }
    out.push({ title, notes, rows });
  }
  return out;
}

/** A word broken over two lines keeps its hyphen and loses the space (`Parame-` over `ter 1`). */
const join = (s) => String(s ?? '').replace(/([A-Za-z])- (?=[a-z])/g, '$1').replace(/\s+/g, ' ').trim();

/**
 * A document's parameter-change tables over its pages, the address carried down each table (a row
 * prints its low byte, and its high and mid bytes when they change) and a table without a title
 * continuing the one before it.
 */
export function readParameterTables(pdf, pages, addressBytes = 3) {
  const tables = [];
  for (const page of pages) {
    for (const t of pageParameterTables(pageXml(pdf, page), addressBytes)) {
      const continues = !t.title && tables.length;
      const table = continues ? tables.at(-1) : { title: t.title ?? '', notes: t.notes, page, rows: [] };
      if (!continues) tables.push(table);
      // A row prints its last byte, and the ones before it when they change: those it leaves out
      // are carried from the row above (three bytes an address, or four on the MODX M).
      let carried = table.rows.length ? table.rows.at(-1).address : new Array(addressBytes).fill(null);
      for (const r of t.rows) {
        const address = [...carried.slice(0, addressBytes - r.address.length), ...r.address];
        carried = address;
        table.rows.push({ page, address, size: r.size, range: r.range.map(join), name: join(r.name), description: join(r.description), ...(r.default !== undefined ? { default: join(r.default) } : {}), notes: join(r.notes) });
      }
    }
  }
  return tables;
}

/**
 * The bytes a message carries between its device number and its address, as the data format prints
 * them a line each (`01111111 7F Group Number High`, `00011100 1C Group Number Low`, `00000000 00
 * Model ID`; the MX's `7F Model ID`, `17 Model ID`), a byte count as `bb`. `status` is the device
 * number line's high nibble: 0001 for a parameter change, 0000 for a bulk dump.
 */
function readHeader(lines, status) {
  const start = lines.findIndex((l) => new RegExp(`\\b${status}nnnn\\s+\\w{2}H?\\s+Device Number`, 'i').test(l));
  if (start < 0) return null;
  const out = [];
  for (const l of lines.slice(start + 1, start + 16)) {
    if (/Address (High|1st)/i.test(l)) return out.length ? out : null;
    const m = /\b[01nb]{8}\s+(?:([0-9A-F]{2})H?|b{7})\s+(?:Group (?:Number|ID) (?:High|Low)|Model ID|Byte Count)\b/i.exec(l);
    if (m) out.push(m[1] ?? 'bb');
  }
  return null;
}

/**
 * The data format: the identity reply, the model ID and the group number, as the MIDI Data Format
 * pages print them (`F0H 7EH 7FH 06H 02H 43H 00H 41H 51H 06H …`, `00000011 03H Model ID`); the bytes
 * a parameter change and a bulk dump carry before the address; and what the checksum adds up, from
 * the model ID (`when the Model ID, Start Address, Data …`) or from the byte count (the MX's).
 */
export function readFormat(text) {
  const t = String(text);
  const lines = t.split('\n');
  let identity = /IDENTITY REPLY[^\n]*\n[^\n]*?(F0H(?:\s+(?:[0-9A-F]{2}|[a-z]{2})H){8,16}\s+F7H?)/.exec(t)?.[1];
  // `ddH ddH` with one code printed under it (`dd; Device Number Code` / `47 06`, the MX); a code for
  // each model (`MOXF6: 4CH 06H`) leaves it unknown.
  // The code ends the next line, whatever the column beside it prints.
  const code = /\bdd[;:]\s*Device (?:Number Code|family number)\s*\n(?:[^\n]*\s{3})?\s*([0-9A-F]{2})H?\s+([0-9A-F]{2})H?[ \t]*(?:\n|$)/i.exec(t);
  if (identity && code) identity = identity.replace(/ddH\s+ddH/, `${code[1]}H ${code[2]}H`);
  // `00000011 03H Model ID` (the reface), `00000010 07 Model ID` (the MODX: the hex column is read).
  const model = /\b([0-9A-F]{2})H?\s+Model ID/.exec(t)?.[1];
  const groupHigh = /\b([0-9A-F]{2})H?\s+Group (?:Number|ID) High/.exec(t)?.[1];
  const groupLow = /\b([0-9A-F]{2})H?\s+Group (?:Number|ID) Low/.exec(t)?.[1];
  const header = readHeader(lines, '0001');
  const bulkHeader = readHeader(lines, '0000');
  const sum = /Check[- ]?sum is the value[^\n]*?when the (Model ID|Byte Count)\b/i.exec(t)?.[1];
  // `Address High`, `Mid`, `Low`; the MODX M's `Address 1st` … `4th`.
  const start = lines.findIndex((l) => /\b0001nnnn\s+\w{2}H?\s+Device Number/i.test(l));
  const addressLines = start < 0 ? [] : lines.slice(start, start + 20).filter((l) => /\b0a{7}\s+a{7}\s+Address (High|Mid|Low|1st|2nd|3rd|4th)\b/i.test(l));
  const reply = identity?.replace(/H/g, '').split(/\s+/).filter(Boolean);
  return {
    ...(reply && reply.slice(0, 10).every((b) => /^[0-9A-F]{2}$/.test(b)) ? { identityReply: reply } : {}),
    ...(model ? { modelId: model } : {}),
    ...(groupHigh ? { group: [groupHigh, groupLow] } : {}),
    ...(header ? { header } : {}),
    ...(bulkHeader ? { bulkHeader } : {}),
    ...(sum ? { checksumFrom: /Byte/i.test(sum) ? 'byteCount' : 'modelId' } : {}),
    ...(addressLines.length === 4 ? { addressBytes: 4 } : {}),
  };
}

/**
 * What a bulk dump's byte count counts, as the data list words it: 'fromModelId' (`Byte Count shows
 * the size of data in blocks from Model ID onward`, the reface) or 'data' (`“Byte Count” indicates the
 * data size contained in each block`, the MODX and MOXF).
 */
export function readByteCount(text) {
  const t = String(text).replace(/\s+/g, ' ');
  if (/Byte Count shows the size of data in blocks from Model ID onward/i.test(t)) return 'fromModelId';
  if (/Byte Count.? indicates the data size contained in each block/i.test(t)) return 'data';
  return null;
}

/**
 * The Bulk Dump Block table: each line that ends in a byte count and an address (`Voice Common 42 2A
 * 30 00 00`, `Operator 1 32 20 31 00 00`, `Bulk Header 4 04 0E 0F 00`, `Bulk Header 0 00 0E mm nn`),
 * with the names before them and the block name carried from the line it was printed on. A series
 * printed first and last with `:` between (`Part 1 62 3E 31 00 00`, `:`, `Part 4 03`) is the first
 * block with `last`: the last one's name and middle address byte. Lines between `Byte Count` and the
 * next heading, within the span the layout gives.
 */
export function readBulkBlocks(pdf, page, span = {}, addressBytes = 3) {
  return pageBulkBlocks(pageXml(pdf, page), span, addressBytes);
}

/** readBulkBlocks on one page's `pdftotext -bbox-layout` XML. */
export function pageBulkBlocks(xml, { left = 0, right = Infinity } = {}, addressBytes = 3) {
  const lines = visualLines(pageWords(xml).words);
  const inSide = (w) => w.x0 >= left && w.x0 < right;
  const head = lines.find((l) => l.words.some((w) => inSide(w) && w.text === 'Byte') && l.words.some((w) => inSide(w) && w.text === 'Count'));
  if (!head) return [];
  const out = [];
  let series = false;
  let inSeries = -1;
  const midX = new Map();   // where each block's middle byte stands
  // A placeholder byte may be misprinted a letter short (the MONTAGE M's whole Performance header,
  // `04 ll m nn`).
  const BYTE = '([0-9A-F]{2}|[0-9a-zA-Z]{1,2})';
  for (const l of lines.filter((x) => x.y0 > head.y1 + 6).sort((a, b) => a.y0 - b.y0)) {
    const words = l.words.filter(inSide).map((w) => w.text);
    if (!words.length) continue;
    const text = words.join(' ');
    // `:` between the ends of a series, alone or with its count (the MODX's `: 8 Blocks : : :`).
    if (/^:(\s+(:|\d+|Blocks,?|Max|Parts))*$/.test(text)) { series = out.length > 0; continue; }
    const m = new RegExp(`^(.*?)\\s*(\\d+)\\s+([0-9A-F]{2,5})${`\\s+${BYTE}`.repeat(addressBytes)}$`).exec(text);
    const last = series && /^(.*?)\s+([0-9A-F]{2})$/.exec(text);
    const seriesBefore = series;
    series = false;
    // A side note set beside the rows (the MODX's `Only the Part No. p same as the Part number
    // specified in "nn" is available.`) shares their lines: its lowercase words before the name are not it.
    const block = m && { name: m[1].trim().replace(/^(?:[a-z“"]\S*\s+)+(?=[A-Z])/, ''), bytes: Number(m[2]), address: m.slice(4, 4 + addressBytes) };
    // The last of a series printed in full (the Motif XF's `Zone 1 … 32 00 00`, `:`, `Zone 8 … 32 07
    // 00`): the same block a middle byte on. A series of groups prints each block of the last group
    // (the MO's drum keys: Oscillator, Amplitude, Pitch and Filter of `KEY C 0`, `:`, then of `KEY C 6`).
    const same = (a, b) => !a.last && a.bytes === b.bytes && a.address.length === b.address.length
      && b.address.every((x, i) => (i === 1 ? /^[0-9A-F]{2}$/.test(x) && /^[0-9A-F]{2}$/.test(a.address[1]) && parseInt(x, 16) > parseInt(a.address[1], 16) : x === a.address[i]));
    // After `:`, the nearest block it repeats; after that, the next block of the same group, in turn.
    const at = !block ? -1 : seriesBefore ? out.findLastIndex((a, i) => i >= out.length - 8 && same(a, block)) : inSeries >= 0 && out[inSeries + 1] && same(out[inSeries + 1], block) ? inSeries + 1 : -1;
    inSeries = at;
    const first = at >= 0 ? out[at] : null;
    // A block with its byte count and only the address bytes that change, the rest as the block above's
    // (the YC's `Organ Section Part Upper 20 14 50 10`, `Key B Section 58 3A 01`).
    const partial = !block && !last && out.length && !out.at(-1).last && new RegExp(`^(.*?[A-Za-z)])\\s+(\\d+)\\s+([0-9A-F]{2,5})((?:\\s+[0-9A-F]{2}){1,${addressBytes - 1}})$`).exec(text);
    // A block repeated at another middle byte, printed with that byte alone under its own and no `:`
    // (the CP88's `Piano Common … 50 00 00`, `E.Piano Common … 01`, `Sub Common … 02`).
    // Its byte stands under the block's middle byte (a page's footer, `reface Data List 17`, does not).
    const lineWords = l.words.filter(inSide);
    const sibling = !block && !last && out.length && Math.abs(lineWords.at(-1).x0 - (midX.get(out.at(-1)) ?? -99)) <= 6 && /^([^\d].*?[A-Za-z)])\s+([0-9A-F]{2})$/.exec(text);
    if (first) first.last = { name: block.name, mid: block.address[1] };
    else if (block) { out.push(block); midX.set(block, lineWords.at(-addressBytes + 1).x0); }
    else if (last) out.at(-1).last = { name: last[1].trim(), mid: last[2] };
    else if (partial) {
      const bytes = partial[4].trim().split(/\s+/);
      const prevAddress = out.at(-1).address;
      // The low byte left out; or the high and low (one byte printed, the middle).
      const address = bytes.length === 1 ? [prevAddress[0], bytes[0], ...prevAddress.slice(2)] : [...bytes, ...prevAddress.slice(bytes.length)];
      const twin = { name: partial[1].trim(), bytes: Number(partial[2]), address };
      midX.set(twin, midX.get(out.at(-1)));
      out.push(twin);
    } else if (sibling && !out.at(-1).last) {
      const twin = { ...out.at(-1), name: sibling[1].trim(), address: [out.at(-1).address[0], sibling[2], ...out.at(-1).address.slice(2)] };
      midX.set(twin, midX.get(out.at(-1)));
      out.push(twin);
    }
    else if (/^(MIDI|Program|Control|Parameter)\b/.test(text) && out.length) break;
  }
  return out;
}
