// read-waldorf-sysex.mjs — a Waldorf System Exclusive Specification -> what it prints, decided nothing.
//
// Waldorf's SysEx specifications (the Blofeld's, release 1.04; the Microwave 2's, release 2.16) are
// plain-text documents set in a proportional font: a sound data table of `Index Range Value
// Parameter` rows (`1  16..112  128'..1/2'  Osc 1 Octave, in steps of 12`), value lists under
// numbered headings (`4.1 Oscillator Shapes and Waves`, `0 off`, `1 Pulse` …), the effect types'
// parameters (`5.2 Chorus Effect Parameters`, `130 146 0..127 0..127 Speed`), and each message laid
// out a byte a line. Its columns were set with tabs, so the reader works from poppler's word
// positions: a row's value and name are where the widest gap between its words is. Where a tab
// collapsed to a space (the Blofeld's `0..3 Up,Down,Alt Up,Alt Down Arpeggiator Direction`) there is
// no such gap, and the row is marked `unsure`, for the layout to split.

import { execFileSync } from 'node:child_process';

const RANGE = /^(\d+)(?:\.\.|-)(\d+)$/;

/** The document's words, a line at a time: [{ page, y, words: [{ x0, x1, text }] }], in reading order. */
export function documentLines(pdf) {
  const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], { maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return pageLines(xml);
}

/** documentLines on `pdftotext -bbox` output. */
export function pageLines(xml) {
  const out = [];
  xml.split('<page ').slice(1).forEach((page, p) => {
    const lines = new Map();
    for (const m of page.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
      const y = Math.round(Number(m[2]));
      // A word a point above or below the others is on their line.
      const key = [...lines.keys()].find((k) => Math.abs(k - y) <= 1) ?? y;
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key).push({ x0: Number(m[1]), x1: Number(m[3]), text: decode(m[5]) });
    }
    for (const [y, words] of [...lines].sort((a, b) => a[0] - b[0])) out.push({ page: p + 1, y, words: words.sort((a, b) => a.x0 - b.x0) });
  });
  return out;
}

const decode = (s) => s.replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = (words) => words.map((w) => w.text).join(' ');

/**
 * Split a row's words after its range into the value and the parameter's name, at the widest gap
 * between them: { value, name, unsure }. A first word set far from the range is the name, with no
 * value printed (`339  0..127  Arp Pattern Step/Glide/Accent 13`).
 */
export function splitValueAndName(range, rest) {
  if (!rest.length) return { value: '', name: '', unsure: false };
  if (rest[0].x0 - range.x1 >= 40) return { value: '', name: text(rest), unsure: false };
  let at = -1;
  let widest = 0;
  for (let i = 0; i + 1 < rest.length; i++) {
    const gap = rest[i + 1].x0 - rest[i].x1;
    if (gap > widest) { widest = gap; at = i; }
  }
  if (widest >= 10) return { value: text(rest.slice(0, at + 1)), name: text(rest.slice(at + 1)), unsure: false };
  return { value: '', name: text(rest), unsure: true };
}

/**
 * The sound data table (`3.1 SDATA - Sound Data`): [{ index, range: [lo, hi] | null, value, name,
 * unsure?, notes? }], `reserved` rows with no range. It runs to the next section's heading.
 */
export function readSoundTable(lines, heading = /^3\.1\s+SDATA/) {
  const start = lines.findIndex((l) => heading.test(text(l.words)));
  if (start < 0) return [];
  const rows = [];
  for (const l of lines.slice(start + 1)) {
    const t = text(l.words);
    if (/^\d+\.\d+\s+[A-Z]/.test(t) && !/^\d+\s/.test(t.replace(/^\d+\.\d+/, ''))) break;
    const [first, second, ...rest] = l.words;
    if (!first || !/^\d+$/.test(first.text)) {
      // A name or note run on under its row (the Microwave 2's `Format 0 is unpublished`).
      if (rows.length && t && !/^[-*]+$/.test(t) && !/^Index\b/.test(t) && !/^Note:/.test(t)) rows.at(-1).notes = `${rows.at(-1).notes ?? ''} ${t}`.trim();
      continue;
    }
    const index = Number(first.text);
    if (second?.text === 'reserved') { rows.push({ index, range: null, value: '', name: 'reserved', page: l.page }); continue; }
    const r = second && RANGE.exec(second.text);
    if (!r) continue;
    let split = splitValueAndName(second, rest);
    // A list of names whose tab collapsed into the name (the Microwave 2's `sin,tri,sqr,saw,rnd,S&H
    // LFO 1 Shape`, 0 - 5): where its commas count out the range and no name has a space in it, the
    // value is its first word.
    if (split.unsure) {
      const words = split.name.split(' ');
      const k = words.findIndex((w, i) => i > 0 && !words[i - 1].endsWith(',') && !w.startsWith(',') && words.slice(0, i).join(' ').split(',').length === Number(r[2]) - Number(r[1]) + 1);
      // Only where every name is one word: `Up,Down,Alt Up,Alt Down` (the Blofeld's) cannot be told
      // from its name this way.
      if (k > 0 && k === 1 && !words.slice(k).join(' ').includes(',')) split = { value: words[0], name: words.slice(1).join(' '), unsure: false };
    }
    // `!!`, `!!!`: the Microwave 2 marks what changed in a release.
    const name = split.name.replace(/\s*!{2,3}$/, '');
    // The page it is printed on: a parameter says where its document prints it.
    rows.push({ index, range: [Number(r[1]), Number(r[2])], value: split.value, name, ...(split.unsure ? { unsure: true } : {}), page: l.page });
  }
  return rows;
}

/**
 * The value lists under numbered headings (`4.1 Oscillator Shapes and Waves`): { '4.1': { title,
 * items: [{ from, to, label }] } }, an item a value or a run of them (`0..1 1280 bars`). A list's
 * own sub-headings (`uuu:`, `a:` under `4.10 Allocation and Unisono Modes`) are kept as items with
 * no value, so the layout can tell its parts apart.
 */
export function readLists(lines, from = /^4\.\s/, to = /^5\.\s/) {
  const start = lines.findIndex((l) => from.test(text(l.words)));
  const end = lines.findIndex((l, i) => i > start && to.test(text(l.words)));
  const lists = {};
  let current = null;
  for (const l of lines.slice(start < 0 ? lines.length : start, end < 0 ? lines.length : end)) {
    const t = text(l.words);
    const head = /^(\d+\.\d+)\s+(.+)$/.exec(t);
    if (head && !/^\d+(\.\.\d+)?\s/.test(t)) { current = lists[head[1]] = { title: head[2], items: [] }; continue; }
    if (!current || /^(Index|-+|\*+)/.test(t)) continue;
    // (`6* Delay, see 5.7 FX2`: the Blofeld marks the effect types whose values may change.)
    const item = /^(\d+)(?:\.\.(\d+))?(\*?)\s+(.+)$/.exec(t);
    if (item) current.items.push({ from: Number(item[1]), to: Number(item[2] ?? item[1]), label: item[4], ...(item[3] ? { marked: true } : {}) });
    else if (/^\w+:$/.test(t)) current.items.push({ part: t.slice(0, -1) });
    else current.notes = `${current.notes ?? ''} ${t}`.trim();
  }
  return lists;
}

/**
 * The effects' parameters by type (`5.2 Chorus Effect Parameters`, `FX1 FX2 Range Value Parameter`,
 * `130 146 0..127 0..127 Speed`; or one index column for a type only the second unit has):
 * [{ type, rows: [{ indices: [..], range, value, name }] }].
 */
export function readEffects(lines, from = /^5\.\s+Effects/, to = /^6\.\s/) {
  const start = lines.findIndex((l) => from.test(text(l.words)));
  const end = lines.findIndex((l, i) => i > start && to.test(text(l.words)));
  const out = [];
  let current = null;
  for (const l of lines.slice(start < 0 ? lines.length : start, end < 0 ? lines.length : end)) {
    const t = text(l.words);
    const head = /^5\.\d+\s+(.+?)\s+Effect Parameters$/.exec(t);
    if (head) { current = { type: head[1], rows: [] }; out.push(current); continue; }
    if (!current) continue;
    const words = l.words;
    const n = words.findIndex((w) => RANGE.test(w.text));
    if (n < 1 || !words.slice(0, n).every((w) => /^\d+$/.test(w.text))) continue;
    const split = splitValueAndName(words[n], words.slice(n + 1));
    const r = RANGE.exec(words[n].text);
    current.rows.push({ indices: words.slice(0, n).map((w) => Number(w.text)), range: [Number(r[1]), Number(r[2])], value: split.value, name: split.name, ...(split.unsure ? { unsure: true } : {}) });
  }
  return out;
}

/**
 * The messages: the equipment ID, the sound dump's data indices and checksum (`7-389 SDATA`, `390 CHK
 * SDATA & 7Fh`; the Microwave 2's `263 XSUM (BB+NN+SDATA)&7Fh`), the Sound mode edit buffer's location
 * (`7F 00 Sound Mode Edit Buffer`), and the identity reply's family and member codes.
 */
export function readFormat(layoutText) {
  const t = String(layoutText);
  const equipment = /IDE\s*:?\s*Equipment ID\s*=\s*([0-9A-F]{2})h/i.exec(t)?.[1] ?? /\bIDE\s+([0-9A-F]{2})h\b/.exec(t)?.[1];
  const sdata = /\b(\d+)-(\d+)\s+SDATA\s/.exec(t);
  // The dump's checksum, printed under its data (not the request's, `7 XSUM (BB+NN)&7Fh`).
  const sum = sdata && /\b(\d+)\s+(?:CHK|XSUM)\s+(\(?[A-Z+ ]+\)?)\s*&\s*7Fh/i.exec(t.slice(sdata.index));
  const editBuffer = /\b([0-9A-F]{2}) ([0-9A-F]{2})\s+Sound Mode Edit Buffer/.exec(t);
  const family = /([0-9A-F]{2}),\s*([0-9A-F]{2}),\s+Device family code/i.exec(t);
  const member = /Device family member codes[^\n]*\n\s*([0-9A-F]{2}),\s*([0-9A-F]{2})\s+(.+)/i.exec(t);
  return {
    ...(equipment ? { equipmentId: equipment } : {}),
    ...(sdata ? { soundData: { from: Number(sdata[1]), to: Number(sdata[2]) } } : {}),
    ...(sum ? { checksum: { at: Number(sum[1]), over: sum[2].replace(/[()\s]/g, '').split('+') } } : {}),
    ...(editBuffer ? { editBuffer: [editBuffer[1], editBuffer[2]] } : {}),
    ...(family ? { identity: { family: [family[1], family[2]], ...(member ? { member: [member[1], member[2]], memberName: member[3].trim() } : {}) } } : {}),
  };
}
