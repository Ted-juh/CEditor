// read-yamaha-pdf.mjs — the MIDI data tables in Yamaha's data lists, from poppler's word positions
// (`pdftotext -bbox-layout`).
//
// Yamaha has set these tables the same way for twenty years: a title, `MIDI PARAMETER CHANGE TABLE
// (VOICE Common)`, then the headings `Address (hex)` (over `High Mid Low`, or alone), `Size`, `Data
// Range (hex)`, `Parameter Name`, `Description`, sometimes `Default (HEX)`, `Notes`, and the rows set
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
const ADDRESS_BYTE = /^([0-9A-F]{2}|[0-9a-z]{2})$/;
const HEX_BYTE = /^[0-9A-F]{2}$/;

/** Words of one line from x0 to x1. */
const wordsIn = (line, x0, x1) => line.words.filter((w) => w.x0 >= x0 - 0.5 && w.x0 < x1 - 0.5);

/**
 * The page's words as printed lines: poppler gives a cell's words a line of their own, so a row
 * across a table is its words at one height, put together here, left to right.
 */
function visualLines(words) {
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
    const next = heads.filter((o) => o !== h && Math.abs(middle(o.name) - middle(h.name)) < 40 && o.address.x0 > h.name.x0).sort((a, b) => a.address.x0 - b.address.x0)[0];
    h.x1 = next ? next.address.x0 - 12 : width;
    h.x0 = h.address.x0 - 8;
    const band = (x) => Math.abs(middle(x) - middle(h.name)) <= 13 && x.x0 > h.name.x1 && x.x0 < h.x1;
    h.description = words.find((x) => band(x) && x.text === 'Description');
    h.defaultHead = words.find((x) => band(x) && x.text === 'Default');
    h.notes = words.find((x) => band(x) && x.text === 'Notes');
    // The headings' own lines: `(hex)`, `High Mid Low` below them.
    const own = words.filter((x) => x.x0 >= h.x0 && x.x0 < h.x1 && x.y0 >= h.y0 - 14 && x.y0 <= middle(h.name) + 14
      && /^(Address|\(hex\)|\(HEX\)|Size|Data|Range|Parameter|Name|Description|Default|Notes|High|Mid|Low)$/.test(x.text));
    h.bottom = Math.max(...own.map((x) => x.y1));
  }
  return heads;
}

/**
 * The parameter-change tables on one page, in reading order (each column of the page top to
 * bottom): { title, notes, rows: [{ address: [H, M, L], size, range: [..], name, description,
 * default, notes }] }. A table with no title over it on this page continues the one before it.
 */
export function pageParameterTables(xml) {
  const { words, width, height } = pageWords(xml);
  const lines = visualLines(words);
  const heads = findHeads(lines, width).sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
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
      for (const l of rest) if (text(l)) notes.push(text(l));
    }
    const body = lines.filter((l) => l.y0 > h.bottom + 0.5 && l.y0 < below - 1 && inSpan(l) && l.y0 < height - 40).sort((a, b) => a.y0 - b.y0);
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
      cols.push([kind, gapAt(Math.max(Math.min(previous.x1, w.x0 - 1) - (i === 0 ? 0 : 4), w.x0 - 25), w.x0 + 1)]);
    });
    if (process.env.YAMAHA_DEBUG) console.error(title, JSON.stringify(cols.map(([k, x]) => [k, Math.round(x)])));
    const columnOf = (w) => { let k = null; for (const [kind, x] of cols) if (w.x0 >= x - 0.5) k = kind; return w.x0 < h.x1 ? k : null; };
    const rows = [];
    let current = null;
    for (const l of body) {
      const cells = {};
      for (const w of l.words) {
        const k = columnOf(w);
        if (k) (cells[k] ??= []).push(w.text);
      }
      const text = (k) => (cells[k] ?? []).join(' ');
      if (/^Total Size/i.test(text('address') || text('size'))) break;
      const addressWords = cells.address ?? [];
      const isRow = addressWords.length >= 1 && addressWords.length <= 3 && addressWords.every((t) => ADDRESS_BYTE.test(t)) && HEX_BYTE.test(addressWords.at(-1)) && /^\d+$/.test(text('size'));
      if (isRow) {
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
export function readParameterTables(pdf, pages) {
  const tables = [];
  for (const page of pages) {
    for (const t of pageParameterTables(pageXml(pdf, page))) {
      const continues = !t.title && tables.length;
      const table = continues ? tables.at(-1) : { title: t.title ?? '', notes: t.notes, page, rows: [] };
      if (!continues) tables.push(table);
      let [high, mid] = table.rows.length ? table.rows.at(-1).address : [null, null];
      for (const r of t.rows) {
        const a = r.address;
        if (a.length === 3) [high, mid] = [a[0], a[1]];
        else if (a.length === 2) mid = a[0];
        table.rows.push({ page, address: [high, mid, a.at(-1)], size: r.size, range: r.range.map(join), name: join(r.name), description: join(r.description), ...(r.default !== undefined ? { default: join(r.default) } : {}), notes: join(r.notes) });
      }
    }
  }
  return tables;
}

/**
 * The data format: the identity reply, the model ID and the group number, as the MIDI Data Format
 * pages print them (`F0H 7EH 7FH 06H 02H 43H 00H 41H 51H 06H …`, `00000011 03H Model ID`).
 */
export function readFormat(text) {
  const t = String(text);
  const identity = /IDENTITY REPLY[^\n]*\n[^\n]*?(F0H(?:\s+[0-9A-F]{2}H){8,16}\s+F7H?)/.exec(t)?.[1];
  const model = /\b([0-9A-F]{2})H\s+Model ID/.exec(t)?.[1];
  const groupHigh = /\b([0-9A-F]{2})H\s+Group Number High/.exec(t)?.[1];
  const groupLow = /\b([0-9A-F]{2})H\s+Group Number Low/.exec(t)?.[1];
  return {
    ...(identity ? { identityReply: identity.replace(/H/g, '').split(/\s+/).filter(Boolean) } : {}),
    ...(model ? { modelId: model } : {}),
    ...(groupHigh ? { group: [groupHigh, groupLow] } : {}),
  };
}

/**
 * The Bulk Dump Block table: each line that ends in a byte count and an address (`Voice Common 42 2A
 * 30 00 00`, `Operator 1 32 20 31 00 00`, `Bulk Header 4 04 0E 0F 00`), with the names before them
 * and the block name carried from the line it was printed on. Lines between `Byte Count` and the
 * next heading, within the span the layout gives.
 */
export function readBulkBlocks(pdf, page, { left = 0, right = Infinity } = {}) {
  const lines = visualLines(pageWords(pageXml(pdf, page)).words);
  const inSide = (w) => w.x0 >= left && w.x0 < right;
  const head = lines.find((l) => l.words.some((w) => inSide(w) && w.text === 'Byte') && l.words.some((w) => inSide(w) && w.text === 'Count'));
  if (!head) return [];
  const out = [];
  for (const l of lines.filter((x) => x.y0 > head.y1 + 6).sort((a, b) => a.y0 - b.y0)) {
    const words = l.words.filter(inSide).map((w) => w.text);
    if (!words.length) continue;
    const text = words.join(' ');
    const m = /^(.*?)\s*(\d+)\s+([0-9A-F]{2,4})\s+([0-9A-F]{2}|[0-9a-z]{2})\s+([0-9A-F]{2}|[0-9a-z]{2})\s+([0-9A-F]{2})$/.exec(text);
    if (m) out.push({ name: m[1].trim(), bytes: Number(m[2]), address: [m[4], m[5], m[6]] });
    else if (/^(MIDI|Program|Control|Parameter)\b/.test(text) && out.length) break;
  }
  return out;
}
