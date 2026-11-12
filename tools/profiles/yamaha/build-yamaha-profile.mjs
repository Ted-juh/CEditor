// build-yamaha-profile.mjs — a Yamaha transcription (tables/<name>.json) and a layout
// (synths/<name>.mjs) -> a CEditor device profile.
//
// What the data list says, and nothing it does not:
//
//   - every row of a MIDI PARAMETER CHANGE TABLE that prints a data range is a parameter, sent as
//     the parameter change the data format prints (F0 43 1n 7F 1C <model> <address> <data> F7; the
//     MX's F0 43 1n 7F 17 <address> <data> F7) at the row's address; `reserved` and `NOT USED` rows are not;
//   - the description column says what each value shows, in order. A list of names exactly as long
//     as the range (`00 – 04` beside `OFF, AMP, FILTER, PITCH, OSC`) is a choice; a range of numbers
//     as long as the data range (`28 – 58` beside `-24 – +24 (semitones)`) is the values shown; a
//     range in parts (`00 – 0F, 7F` beside `1 – 16, off`) is matched part for part. Anything else
//     is a number, and the description is said;
//   - a value over several bytes is read as the description says it is split: `1st bit 3-0 : bit
//     15-12` is four nibbles, `1st bit 6-0 : bit 13-7` two 7-bit halves; two bytes printed as a high
//     and a low range are two 7-bit halves when the description counts out exactly the values
//     between (`00 – 02` over `05 – 2C` beside `5 ... 300`);
//   - a name printed one character a row (`Voice Name1` … `Voice Name10`, `32 – 126 (ASCII)`) is one
//     text parameter, read from the bulk dump and not written: a parameter change carries one
//     parameter, and the data list does not say ten characters may go in one;
//   - an address byte printed as a placeholder (`31 op 00`) is expanded over the values the table's
//     note gives it (`op = operator number 00 – 03 (hex) OP1 – OP4`);
//   - Pull asks for each bulk dump block the BULK DUMP table lists, at its Bulk Header's address
//     where it has one, and reads every parameter whose address falls in a block back from it; the
//     checksum is the one the data format prints, over the model ID, address and data. A series
//     printed first and last (`Part 1` … `Part 4`) is a block for each; a header printed `0E mm nn`
//     is asked for at the edit buffer the layout picks from the Bulk Control table; the byte count is
//     what the data list says it counts (from the model ID onward, or the data alone).

import { camel, stringifyProfile } from '../roland/build-profile.mjs';

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
// The MODX prints an arrow from a private-use font between a byte's bits and the value's (`1st bit6-0  bit13-7`).
// U+2212 is a minus sign (the MODX M's `−24 – +24`), not a dash.
const clean = (s) => String(s ?? '').replace(/—/g, '–').replace(/−/g, '-').replace(/[’‘]/g, "'").replace(/[\uf000-\uf8ff]/g, ':').replace(/\s+/g, ' ').trim();
const slug = (label) => label.toLowerCase().replace(/[^a-z0-9+-]+/g, '').replace(/\+/g, 'plus').replace(/-/g, 'minus') || 'v';

/** `00 – 7F` -> [[0, 127]]; `00 – 0F, 7F` -> [[0, 15], [127, 127]]; `00, 20 – 7E` -> [[0, 0], [32, 126]]. */
export function readHexRange(text) {
  const parts = clean(text).split(/\s*,\s*/).filter(Boolean);
  if (!parts.length) return null;
  const out = [];
  for (const p of parts) {
    // Two digits a byte, or one (the MX's `0 – 2`).
    const m = /^([0-9A-F]{1,2})(?:\s*[–-]\s*([0-9A-F]{1,2}))?$/.exec(p);
    if (!m) return null;
    const from = parseInt(m[1], 16);
    const to = m[2] ? parseInt(m[2], 16) : from;
    if (to < from) return null;
    out.push([from, to]);
  }
  return out;
}

/**
 * A range printed two 7-bit bytes a value (the MODX M's `Data Range MSB/LSB`, the Motif XS's `0005 –
 * 022C`): `00 00 – 00 7F` ->
 * [[0, 127]]; `00 00 – 00 11, 00 7F` -> [[0, 17], [127, 127]]; `07 7F` is 1023.
 */
export function readPairRange(text) {
  const parts = clean(text).split(/\s*,\s*/).filter(Boolean);
  const out = [];
  for (const p of parts) {
    // `00 05` or, the Motif XS's, `0005`.
    const m = /^([0-9A-F]{2}) ?([0-9A-F]{2})(?:\s*–\s*([0-9A-F]{2}) ?([0-9A-F]{2}))?$/.exec(p);
    if (!m || m.slice(1).filter(Boolean).some((b) => parseInt(b, 16) > 127)) return null;
    const from = (parseInt(m[1], 16) << 7) | parseInt(m[2], 16);
    const to = m[3] ? (parseInt(m[3], 16) << 7) | parseInt(m[4], 16) : from;
    if (to < from) return null;
    out.push([from, to]);
  }
  return out.length ? out : null;
}

/** The numbers a description prints, a hyphen between two digits a range's, not a sign (`8192-8447`). */
const numbersIn = (text) => (clean(text).match(/(?<!\d)[+-]?\d+/g) ?? []).map(Number);

/**
 * A two-byte range printed as one four-digit number over two lines (`0000 –` over `3FFF`, `0005 –` over
 * `022C`) -> [[from, to]], or null. The digits are the two 7-bit bytes on the Motif XS (`0005 – 022C`
 * beside `5 – 300`) and the value written in hex on the MOTIF ES generation (`0000 – 00C8` beside `0 –
 * 200%`, C8 not being a 7-bit byte): whichever the description agrees with, by the span its shown range
 * counts or by its largest number (`0 – 1786: Preset, 8192 – 8447: User, 16383: No Type` over `3FFF`);
 * the bytes where it says neither. The MOTIF's `0001 –` over `012C` beside `1 – 300` was read as bytes
 * (1 - 172) before this.
 */
export function readSplitNumber(first, second, description) {
  const a = clean(first).replace(/\s*[–-]$/, '');
  const b = clean(second);
  if (!/^[0-9A-F]{4}$/.test(a) || !/^[0-9A-F]{4}$/.test(b)) return null;
  const shown = readShownRange(description);
  const numbers = numbersIn(description);
  const agrees = ([from, to]) => (shown ? to - from === shown.max - shown.min : numbers.length > 0 && Math.max(...numbers) === to && Math.min(...numbers) >= from);
  const asBytes = readPairRange(`${a} – ${b}`)?.[0];
  if (asBytes && agrees(asBytes)) return [asBytes];
  const asNumber = [parseInt(a, 16), parseInt(b, 16)];
  if (asNumber[1] <= 16383 && asNumber[0] <= asNumber[1] && agrees(asNumber)) return [asNumber];
  // (A description that counts nothing, `50.1 – 2.00k`, says neither: the bytes, as a one-line range is read.)
  return asBytes ? [asBytes] : null;
}

/**
 * A two-byte value printed as two bands of a high and a low byte range each (the MOX's and MOXF's
 * arpeggio assign types: `00 – 34`, `00 – 7B`, `40 – 41`, `00 – 7F` beside `off, Preset 0001 … 6779,
 * User 001 … 256`) -> [[from, to], [from, to]], or null. Read only where the description names the
 * first band's last value and the second's count.
 */
export function readTwoBands(ranges, description) {
  if (ranges.length !== 4) return null;
  const b = ranges.map((r) => readHexRange(clean(r).replace(/,$/, ''))?.[0]);
  if (b.some((x) => !x)) return null;
  const bands = [[(b[0][0] << 7) | b[1][0], (b[0][1] << 7) | b[1][1]], [(b[2][0] << 7) | b[3][0], (b[2][1] << 7) | b[3][1]]];
  const numbers = numbersIn(description);
  if (bands[0][1] >= bands[1][0] || !numbers.includes(bands[0][1]) || !numbers.includes(bands[1][1] - bands[1][0] + 1)) return null;
  return bands;
}

/**
 * Whether a description's numbers run within a high and a low byte's ranges taken together and end at
 * their top: [[0, 127], [0, 127]] beside `… 16383: No Type`. A description printing a range of its own
 * that is not the bytes' (`-100 … +100` over 0 - 255) does not.
 */
export function wholeAgrees(bounds, description) {
  const numbers = numbersIn(description);
  if (bounds.length !== 2 || !numbers.length) return false;
  const [lo, hi] = [(bounds[0][0] << 7) | bounds[1][0], (bounds[0][1] << 7) | bounds[1][1]];
  return hi > 127 && Math.max(...numbers) === hi && Math.min(...numbers) >= lo;
}

/** A description split at its commas, leaving those inside brackets alone. */
export function splitList(text) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of clean(text)) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** `-24 – +24 (semitones)`, `-24 – +24 [semitones]` (the MOXF), `ALGO 1 – 12`, `-48 (-4 octave) – +48 (+4 octave)` -> { min, max, unit }. */
export function readShownRange(text) {
  const t = clean(text);
  // `(semitones)`, `[semitones]`, or bare after the range: the MODX M's `-24 – +24 semi`.
  const unit = /[([](semitones?|cent|cents|dB|%|Hz|ms|octave)[)\]]\s*$/i.exec(t)?.[1] ?? (/\d\s+semi$/.test(t) ? 'semitones' : undefined);
  const bare = t.replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\s+semi$/, '').replace(/\s+/g, ' ').trim();
  // Pan: `L64 – C – R63`.
  const pan = /^L(\d+)\s*–\s*C\s*–\s*R(\d+)$/.exec(bare);
  if (pan) return { min: -Number(pan[1]), max: Number(pan[2]) };
  // Through zero: `-64 – 0 – +63`.
  const through = /^([+-]?\d+)\s*–\s*0\s*–\s*([+-]?\d+)$/.exec(bare);
  if (through) return { min: Number(through[1]), max: Number(through[2]) };
  const m = /^(?:[A-Za-z.]+\s+)?([+-]?\d+)\s*(?:dB|%|cent|Hz|ms)?\s*–\s*([+-]?\d+)\s*(?:dB|%|cent|Hz|ms)?$/.exec(bare);
  if (!m) return null;
  const named = unit ? ({ db: 'dB', hz: 'Hz', semitone: 'semitones', cents: 'cent' }[unit.toLowerCase()] ?? unit.toLowerCase()) : null;
  return { min: Number(m[1]), max: Number(m[2]), ...(named ? { unit: named } : {}) };
}

/**
 * What a one-byte row's values are: { choices } | { shown, unit } | {} (a plain number), from its
 * data range in parts and its description.
 */
export function readValues(parts, description) {
  const width = (p) => p[1] - p[0] + 1;
  const items = splitList(description);
  if (parts.length === 1) {
    const [from, to] = parts[0];
    const shown = readShownRange(description);
    if (shown && shown.max - shown.min === to - from) {
      return shown.min === from && shown.max === to ? (shown.unit ? { unit: shown.unit } : {}) : { shown: { min: shown.min, max: shown.max }, ...(shown.unit ? { unit: shown.unit } : {}) };
    }
    const named = items.length === width(parts[0]) && items.length >= 2 && items.every((x) => x && !/\d\s*–\s*[+-]?\d/.test(x));
    // `0: Voice, 1: Performance, …`, `00: 0dB, 01: +6dB`: the value printed before each name is left off.
    const numbered = named && items.every((x, i) => new RegExp(`^0*${from + i}\\s*[:=]\\s*\\S`).test(x));
    if (named) return { choices: items.map((label, i) => ({ value: from + i, label: numbered ? label.replace(/^\d+\s*[:=]\s*/, '') : label })) };
    const listed = from === 0 ? readValueList(to, items) : null;
    if (listed) return { choices: listed };
    return {};
  }
  // Counted out over the parts in turn: `00 – 10, 7F` beside `1 – 16, omni, off`.
  if (items.length !== parts.length) {
    const values = parts.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (u, i) => from + i));
    const listed = readValueList(values.length - 1, items, values);
    return listed ? { choices: listed.map((c, i) => ({ value: values[i], label: c.label })) } : {};
  }
  // Part for part: `00 – 0F, 7F` beside `1 – 16, off`.
  const choices = [];
  for (const [i, [from, to]] of parts.entries()) {
    if (from === to) { choices.push({ value: from, label: items[i].replace(new RegExp(`\\s*\\(${hex(from)}H?\\)$`), '') }); continue; }
    const shown = readShownRange(items[i]);
    if (!shown || shown.max - shown.min !== to - from) return {};
    for (let v = from; v <= to; v++) choices.push({ value: v, label: String(shown.min + (v - from)) });
  }
  return { choices };
}

/**
 * A list that counts out the range from 0, an item at a time: a name (one value), a range of
 * numbers (`1 – 95`, one value each), `0 = Preset` (that value), `2 – 9 = Library1 – 8` (those values,
 * named in turn). A range sharing one meaning (`1 – 127: Mono`) is not a list. Returns the choices,
 * or null when the items do not count out exactly 0 to `to`.
 */
export function readValueList(to, items, values = null) {
  const out = [];
  // Over a range in parts the numbers printed are the values themselves (`127: Off` after `17:
  // Master` beside `00 – 11, 7F`); over one range from 0, the values are the count.
  const valueAt = (i) => (values ? values[i] : i);
  for (const item of items) {
    let m;
    const next = valueAt(out.length);
    if ((m = /^(\d+)\s*[:=]\s*(\D*?)(\d+)\s*–\s*(\d+)\s*[:=]\s*\2(\d+)$/.exec(item))) {
      // `2 = Library1 … 9 = Library8`: the values between, named in turn.
      const [a, b, first] = [Number(m[1]), Number(m[4]), Number(m[3])];
      if (a !== next || b - a !== Number(m[5]) - first || valueAt(out.length + b - a) !== b) return null;
      for (let v = a; v <= b; v++) out.push({ value: v, label: `${m[2]}${first + v - a}` });
    } else if ((m = /^(\d+)\s*–\s*(\d+)\s*[:=]\s*(.+)$/.exec(item))) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      const named = /^(.*?)(\d+)\s*–\s*(\d+)$/.exec(m[3].trim());
      if (a !== next || !named || Number(named[3]) - Number(named[2]) !== b - a || valueAt(out.length + b - a) !== b) return null;
      for (let v = a; v <= b; v++) out.push({ value: v, label: `${named[1]}${Number(named[2]) + v - a}` });
    } else if ((m = /^(\d+)\s*[:=]\s*(.+)$/.exec(item))) {
      if (Number(m[1]) !== next) return null;
      out.push({ value: next, label: m[2].trim() });
    } else if (/\d\s*–\s*[+-]?\d/.test(item)) {
      const shown = readShownRange(item);
      if (!shown) return null;
      const prefix = /^([A-Za-z.]+)\s+[+-]?\d/.exec(item)?.[1];
      for (let n = shown.min; n <= shown.max; n++) out.push({ value: valueAt(out.length), label: prefix ? `${prefix} ${n}` : String(n) });
    } else {
      out.push({ value: next, label: item });
    }
  }
  return out.length === (values ? values.length : to + 1) && out.length >= 2 ? out : null;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** Key 0 = C0 as the MOXF's drum keys print it (`Key C0` … `Key C6`, 00 – 48). */
export const noteName = (key) => `${NOTES[key % 12]}${Math.floor(key / 12)}`;
const noteNumber = (s) => { const m = /^([A-G]#?)(\d)$/.exec(s); return m ? NOTES.indexOf(m[1]) + 12 * Number(m[2]) : null; };

/**
 * The names of a series printed first and last (`Part 1` … `Part 16`, `Key C0` … `Key C6`), counted
 * out between them; numbered from 1 after the last's name when they do not count out.
 */
export function seriesNames(first, last, count) {
  const [a, b] = [/^(.*?)(\S+)$/.exec(first), /^(.*?)(\S+)$/.exec(last)];
  const prefix = b[1];
  if (/^\d+$/.test(a[2]) && /^\d+$/.test(b[2]) && Number(b[2]) - Number(a[2]) + 1 === count) return Array.from({ length: count }, (u, i) => `${prefix}${Number(a[2]) + i}`);
  // The number inside the name (the CP4 STAGE's `Part 1 Insertion A` … `Part 3 Insertion A`). The
  // first may still carry its block's label (the MOTIF ES's `PLUG-IN PART Plug-in 1 Part` … `Plug-in 3
  // Part`): the series is its words as many as the last's.
  const tb = last.split(' ');
  const ta = first.split(' ').slice(-tb.length);
  // The number may be set against a word inside the name (the MOTIF's `Seq Remote Tr1 Message` …
  // `Tr16 Message`); at its end, it is set apart below (`Part1` … `Part4`: `Part 1` … `Part 4`).
  const differ = ta.length === tb.length ? ta.map((t, i) => (t === tb[i] ? -1 : i)).filter((i) => i >= 0) : [];
  const inside = differ.length === 1 && differ[0] < ta.length - 1 ? /^(\D*)(\d+)$/ : /^()(\d+)$/;
  const [da, db] = differ.length === 1 ? [inside.exec(ta[differ[0]]), inside.exec(tb[differ[0]])] : [];
  if (da && db && da[1] === db[1] && Number(db[2]) - Number(da[2]) + 1 === count) {
    return Array.from({ length: count }, (u, i) => ta.map((t, k) => (k === differ[0] ? `${da[1]}${Number(da[2]) + i}` : t)).join(' '));
  }
  // The number set against the name (the S90 XS's `Part1` … `Part4`): `Part 1` … `Part 4`.
  const [ga, gb] = [/^(.*?[A-Za-z])(\d+)$/.exec(first), /^(.*?[A-Za-z])(\d+)$/.exec(last)];
  if (ga && gb && Number(gb[2]) - Number(ga[2]) + 1 === count) return Array.from({ length: count }, (u, i) => `${gb[1]} ${Number(ga[2]) + i}`);
  const [na, nb] = [noteNumber(a[2]), noteNumber(b[2])];
  if (na !== null && nb !== null && nb - na + 1 === count) return Array.from({ length: count }, (u, i) => `${prefix}${noteName(na + i)}`);
  // A note inside the name, its octave set apart (the Motif XF's `KEY C 0 Key` … `KEY C 6 Key`).
  const NOTE = /\b([A-G]#?) ?(\d)\b/;
  const [ma, mb] = [NOTE.exec(first), NOTE.exec(last)];
  if (ma && mb) {
    const [ka, kb] = [noteNumber(`${ma[1]}${ma[2]}`), noteNumber(`${mb[1]}${mb[2]}`)];
    if (ka !== null && kb !== null && kb - ka + 1 === count) return Array.from({ length: count }, (u, i) => first.replace(NOTE, noteName(ka + i)));
  }
  return Array.from({ length: count }, (u, i) => `${prefix}${i + 1}`);
}

// An address byte is printed, or a placeholder: the whole byte (`op`, `kk`), or a nibble each (`ep`:
// element in the high nibble, part in the low; `5p`: 50H plus the part).
const placeholderVars = (byte, holders) => (/^[0-9A-F]{2}$/.test(byte) ? [] : holders[byte] ? [byte] : byte.split('').filter((c) => !/[0-9A-F]/.test(c)));
const resolveByte = (byte, at, holders) => {
  if (/^[0-9A-F]{2}$/.test(byte)) return byte;
  if (holders[byte]) return hex(at[byte]);
  return hex(parseInt(byte.split('').map((c) => (/[0-9A-F]/.test(c) ? c : at[c].toString(16))).join(''), 16));
};
/** Every assignment of the placeholders `vars` over their values, each with the values' labels. */
const assignments = (vars, holders) => {
  let out = [{}];
  for (const v of vars) out = out.flatMap((at) => holders[v].values.map((value, i) => ({ ...at, [v]: value, [`${v}:label`]: holders[v].labels[i] })));
  return out;
};

const titleOf = (title) => (/\(([^)]*)\)\s*$/.exec(title)?.[1] ?? title).trim();
const titleCase = (s) => (s === s.toUpperCase() ? s.replace(/\w\S*/g, (w) => (/^(TG|EG|LFO|OP|SYSTEM)$/.test(w) && w !== 'SYSTEM' ? w : w[0] + w.slice(1).toLowerCase())) : s.replace(/\b([A-Z]{3,})\b/g, (w) => (/^(EG|LFO|TG)$/.test(w) ? w : w[0] + w.slice(1).toLowerCase())));

/** `op = operator number` / `00 – 03 (hex)` / `OP1 – OP4` -> { key: 'op', values: [0..3], labels: ['OP1'..'OP4'] }. */
export function readPlaceholders(notes) {
  const out = {};
  const text = (notes ?? []).map(clean);
  text.forEach((n, i) => {
    const m = /^([0-9a-z]{1,2})\s*=\s*(.+)$/.exec(n);
    if (!m) return;
    const range = text.slice(i + 1).map((x) => /^([0-9A-F]{2})\s*–\s*([0-9A-F]{2})\s*\(hex\)/i.exec(x)).find(Boolean);
    if (!range) return;
    const [from, to] = [parseInt(range[1], 16), parseInt(range[2], 16)];
    const labels = text.slice(i + 1).map((x) => /^([A-Za-z]+)\s*(\d+)\s*–\s*[A-Za-z]+\s*(\d+)$/.exec(x)).find(Boolean);
    const values = Array.from({ length: to - from + 1 }, (u, k) => from + k);
    out[m[1]] = { what: m[2], values, labels: values.map((v, k) => (labels ? `${labels[1]}${Number(labels[2]) + k}` : `${m[2]} ${v + 1}`)) };
  });
  return out;
}

// A row that holds no setting: `reserved`, and the MOTIF ES's and CP4 STAGE's `NOT USED`.
const UNUSED = /^(reserved|not used)$/i;

export function buildYamahaProfile(data, layout) {
  // Where the data list prints a parameter: its page, in the document the tables are read from.
  const sourced = (p, row) => { p.source = { ...(layout.read.doc ? { doc: layout.read.doc } : {}), page: row.page }; return p; };
  const notes = [];
  const parameters = [];
  const ids = new Set();
  const skipped = new Map();
  const corrected = [];
  const unprinted = [];
  const skip = (why, what) => { const list = skipped.get(why) ?? []; if (!list.includes(what)) skipped.set(why, [...list, what]); };
  const unique = (id) => { let out = id; for (let n = 2; ids.has(out); n++) out = `${id}${n}`; ids.add(out); return out; };
  // The bytes between the device number and the address, as the data format prints them: the group
  // number and model ID (7F 1C 03, the reface), or a model ID of two bytes (7F 17, the MX). A bulk dump
  // carries its byte count among them (`bb`), before the model ID or after it.
  const model = data.format.modelId;
  const group = data.format.group ?? ['7F', '1C'];
  // Where the data list prints a byte for each model (the CP4 STAGE's and CP40 STAGE's model ID `7F
  // **`, 1A and 1B), the layout gives this model's.
  const head = layout.header ?? data.format.header ?? [...group, model];
  const bulkHead = layout.bulkHeader ?? data.format.bulkHeader ?? [...group, 'bb', 'bb', model];
  const recipe = { id: 'parameterChange', kind: 'sysex', template: ['F0', '43', '$deviceId', ...head, '$address', '$encodedValue', 'F7'] };
  // A choice where every value is two bytes (the MODX M): its high byte 00, then the choice.
  const choiceRecipe = { id: 'parameterChangeChoice', kind: 'sysex', template: ['F0', '43', '$deviceId', ...head, '$address', '00', '$encodedValue', 'F7'] };
  let pairChoices = 0;
  const addressBytes = data.format.addressBytes ?? 3;
  const placed = [];   // { parameter, address: [H, M, L] (or four bytes), width, valueAt }
  // Whether an address falls in a block of `size` bytes at `at`: the same bytes but the last, and the
  // last within the block.
  const inBlock = (address, at, size, length = 1) => address.length === at.length && at.slice(0, -1).every((x, i) => address[i] === x) && address.at(-1) >= at.at(-1) && address.at(-1) + length <= at.at(-1) + size;

  // The bulk dump blocks, each where it starts and how many bytes of data it holds. The byte count is
  // printed as the data list says: from the model ID onward (the reface: the data and four bytes
  // more) or the data alone (the MOXF).
  const overhead = data.format.byteCount === 'data' ? 0 : 4;
  const expandBlock = (b) => {
    // What the data list prints for another model it shares (the CP5/CP50's `(CP5 only)` blocks).
    if (layout.absent?.[b.address[0]]) return [];
    const [H, M, L] = b.address.map((x) => parseInt(x, 16));
    // A series printed first and last (`Part 1` … `Part 4 03`, `Key C0` … `Key C6 48`): a block for
    // each middle byte between.
    if (b.last) {
      const to = parseInt(b.last.mid, 16);
      const names = seriesNames(blockName(b.name), clean(b.last.name), to - M + 1);
      return names.map((name, i) => ({ ...b, name, at: [H, M + i, L] }));
    }
    // A block printed with placeholders (the MODX's `41 ep 00 [p: Part No. (0...15), e: Element No.
    // (0...7)]`): one for each value the layout gives them (its laid-out part's elements). A Bulk
    // Header's or Footer's `mm nn` is the edit buffer's, from the layout.
    // The layout may give a block's placeholders by its address (the MODX M's `o` is an FM-X
    // operator at 3p and an AN-X oscillator at 4p).
    const blockHolders = { ...(layout.placeholders ?? {}), ...(typeof layout.bulkPlaceholders === 'function' ? layout.bulkPlaceholders(b.address) : layout.bulkPlaceholders ?? {}) };
    const vars = b.frame ? [] : [...new Set(b.address.flatMap((x) => placeholderVars(x, blockHolders)))];
    if (vars.some((v) => !blockHolders[v])) { skip('bulk dump blocks printed with a placeholder the layout does not give, not read (their messages are let pass)', `${blockName(b.name)} (${b.address.join(' ')})`); return []; }
    if (vars.length) return assignments(vars, blockHolders).map((at) => ({ ...b, base: blockName(b.name), name: `${blockName(b.name)} ${vars.map((v) => at[`${v}:label`]).join(' ')}`, at: b.address.map((x) => parseInt(resolveByte(x, at, blockHolders), 16)) }));
    return [{ ...b, at: b.address.map((x) => parseInt(x, 16)) }];
  };
  // The block column and the description run together: `COMMON TG Common`, `AUDIO IN PART Audio Part
  // (A/D)`, `QUICK SETUP CONFIG MIDI Config 1`. The label's words are left off up to the last the
  // description repeats (`TG Common`, `Audio Part (A/D)`, `MIDI Config 1`); `SYSTEM Common` keeps it.
  const blockName = (n) => clean(n)
    .replace(/^((?:[A-Z][A-Z0-9/+&]*\s+)+)(?=[A-Z][a-z])(.*)$/, (m, label, rest) => {
      const words = label.trim().split(/\s+/);
      const last = words.findLastIndex((w) => new RegExp(`\\b${w.replace(/[^A-Z0-9]/g, '')}\\b`).test(rest.toUpperCase()));
      return last < 0 ? m : [...words.slice(last + 1), rest].join(' ');
    })
    .replace(/\b(\w+)\s+\1\b/g, '$1')
    // `Live Set Page Name [p: Page No.`: the placeholder's note is not the name.
    .replace(/\s*\[.*$/, '');
  // A Bulk Header is at 0E, a Bulk Footer at 0F (the Bulk Control table's addresses), whatever the
  // row is called: the reface YC's data list prints its footer `Bulk`.
  const frameOf = (b) => (/Bulk Header/i.test(b.name) || (addressBytes === 3 && b.address[0] === '0E') ? 'header' : /Bulk Footer/i.test(b.name) || (addressBytes === 3 && b.address[0] === '0F') ? 'footer' : null);
  // A block address the data list misprints, corrected by the layout from where the data list prints
  // it elsewhere (`name address` -> address). Or the last block of a series printed with a wrong
  // middle byte, so read as a block of its own (the MOTIF ES's Mix `Plug-in 1 Part 37 60 00` … `Plug-in
  // 3 Part 37 44 00`, which its Performance prints 31 60 … 31 62): `{ seriesLast: '62' }` ends the
  // series begun by the block before it there.
  const fixedBulk = [];
  for (const b of data.bulk) {
    const fix = layout.bulkCorrections?.[`${clean(b.name)} ${b.address.join(' ')}`];
    if (!fix) { fixedBulk.push(b); continue; }
    if (Array.isArray(fix)) {
      corrected.push(`bulk dump block ${clean(b.name)} printed ${b.address.join(' ')}, taken as ${fix.join(' ')}`);
      fixedBulk.push({ ...b, address: fix });
      continue;
    }
    const first = fixedBulk.pop();
    corrected.push(`bulk dump block ${clean(b.name)} printed ${b.address.join(' ')}, taken as the last of the series from ${clean(first.name)} (${first.address.join(' ')}), at ${[first.address[0], fix.seriesLast, ...first.address.slice(2)].join(' ')}`);
    fixedBulk.push({ ...first, last: { name: b.name, mid: fix.seriesLast } });
  }
  const blocks = fixedBulk.map((b) => ({ ...b, frame: frameOf(b), label: clean(b.name).replace(/\s*Bulk (Header|Footer)?$/i, ''), name: frameOf(b) === 'footer' ? 'Bulk Footer' : blockName(b.name), size: Math.max(0, b.bytes - overhead) }))
    .flatMap(expandBlock)
    .map((b) => ({ ...b, name: layout.blockName?.(b.name, b.at) ?? b.name }));
  const blockAt = (address) => blocks.find((b) => inBlock(address, b.at, b.size));

  for (const table of data.tables) {
    const title = titleOf(table.title);
    // A layout names a table by its title, whatever its case (the Motif XS prints `(Bulk Control)`).
    const own = Object.entries(layout.tables ?? {}).find(([k]) => k.toLowerCase() === title.toLowerCase())?.[1] ?? {};
    const holders = { ...readPlaceholders(table.notes), ...(layout.placeholders ?? {}), ...(own.placeholders ?? {}) };
    if (own.skip) { skip(own.skip, title); continue; }
    // A placeholder can stand for different things in one table, told apart by the address's first
    // byte (the Motif XF's `31 pp 00`, a part, and `35 pp 00`, an audio input): the layout gives them
    // by that byte.
    // (or by its first two, the MOX's `00 4n`, an audio part, beside `00 5n`, a Quick Setup).
    const atKey = (row) => [row.address.slice(0, 2).join(' '), row.address[0]].find((k) => layout.placeholdersAt?.[k]);
    const holdersOf = (row) => ({ ...holders, ...(layout.placeholdersAt?.[atKey(row)] ?? {}) });
    // Rows run by the placeholders in their own address: a run of rows with the same ones is laid
    // out once per assignment of them (a Part row once per part, a Scene Part row once per scene and
    // part), and a row with none once.
    // A name printed once beside the rows that share it (`MTC strat offset` beside Hour, Minute, Second
    // and Frame): each takes it, with the word its description ends on.
    // A row whose range is a dash is no parameter (the Bulk Control table's headers and footers).
    // A one-byte range printed over two lines, the first ending on its comma (the MOTIF's `00 - 10,`
    // over `7F`), is one range.
    const oneRange = (r) => (r.size !== 1 ? r.range : r.range.reduce((out, x) => (out.length && /,$/.test(clean(out.at(-1))) ? [...out.slice(0, -1), `${out.at(-1)} ${x}`] : [...out, x]), []));
    const tableRows = table.rows.filter((r) => !(r.range.length && r.range.every((x) => /^[-–]$/.test(clean(x))))).map((r) => ({ ...r, range: oneRange(r) }));
    // A low byte misprinted, that the rows either side pin down: the MODX M prints Key Controller
    // Set 2 Switch `00` between Set 1 Ratio at 0E (two bytes) and Set 2 Destination at 12; it is 10.
    for (let i = 1; i + 1 < tableRows.length; i++) {
      const [a, b, c] = [tableRows[i - 1], tableRows[i], tableRows[i + 1]];
      const same = (x, y) => x.address.slice(0, -1).join(' ') === y.address.slice(0, -1).join(' ');
      if (!same(a, b) || !same(b, c) || !/^[0-9A-F]{2}$/.test(b.address.at(-1))) continue;
      const [la, lb, lc] = [a, b, c].map((r) => parseInt(r.address.at(-1), 16));
      const expected = la + (a.size || 1);
      if (lb !== expected && lc === expected + (b.size || 1)) {
        b.address = [...b.address.slice(0, -1), hex(expected)];
        corrected.push(`${title}: ${clean(b.name)} printed ${hex(lb)}, taken as ${hex(expected)}`);
      }
    }
    // A table heading's address misprinted, corrected by the layout from the data list's own base
    // address table (the Motif XF heads the Multi's Insertion B `46 04 00`; it is 36 04 00).
    for (const r of tableRows) {
      const fix = own.readdress?.[r.address.slice(0, -1).join(' ')];
      if (!fix) continue;
      const printed = r.address.join(' ');
      r.address = [...fix, r.address.at(-1)];
      if (!corrected.some((c) => c.startsWith(`${title}: ${printed.slice(0, -3)}`))) corrected.push(`${title}: ${printed.slice(0, -3)} taken as ${fix.join(' ')}`);
    }
    // `〃`: as the row above (the MODX M's effect parameters and arpeggio offsets); `:` the same, as the
    // MODX+'s arpeggio offsets and micro tunings and the CP1's effect parameters print it (a vertical
    // ditto, read as a colon).
    tableRows.forEach((r, i) => { if (/^(?:〃|:)$/.test(clean(r.description)) && i > 0) r.description = tableRows[i - 1].description; });
    const endWord = (r) => /\(([A-Za-z]+)\)\s*$/.exec(clean(r.description))?.[1];
    for (let i = 1; i < tableRows.length; i++) {
      if (clean(tableRows[i].name) || !tableRows[i].range.length || !endWord(tableRows[i])) continue;
      let j = i - 1;
      while (j > 0 && !clean(table.rows[j].name)) j--;
      const base = clean(table.rows[j].name);
      if (!base) continue;
      tableRows[i].name = `${base} ${endWord(tableRows[i])}`;
      if (tableRows[j].name === table.rows[j].name && endWord(tableRows[j])) tableRows[j].name = `${base} ${endWord(tableRows[j])}`;
    }
    // A row printed without its address, read as the row's before it past its size (read-yamaha-pdf.mjs).
    for (const r of tableRows) if (r.unprinted && !UNUSED.test(clean(r.name))) unprinted.push(`${title}: ${clean(r.name)} (${r.address.join(' ')})`);
    const runs = [];
    for (const row of tableRows) {
      if (row.address.some((x) => x == null)) { skip('an address not printed in full', `${title}: ${clean(row.name)}`); continue; }
      if (layout.absent?.[row.address[0]]) { skip(`not on this model, ${layout.absent[row.address[0]]}`, `${title} at ${row.address[0]}`); continue; }
      const rowHolders = holdersOf(row);
      const vars = [...new Set(row.address.flatMap((b) => placeholderVars(b, rowHolders)))];
      // `00 5n 00` and `00 6n 00` are different things numbered alike (a Quick Setup, an audio config).
      const key = `${atKey(row) ?? ''} ${row.address.filter((b) => placeholderVars(b, rowHolders).length).join(' ')}`;
      if (runs.length && runs.at(-1).key === key) runs.at(-1).rows.push(row); else runs.push({ key, vars, holders: rowHolders, rows: [row] });
    }
    for (const run of runs) {
      const unknown = run.vars.filter((v) => !run.holders[v]);
      if (unknown.length) { skip('an address byte printed as a placeholder neither its table nor the layout explains', run.rows.map((r) => `${title}: ${r.name} (${r.address.join(' ')})`).join(', ')); continue; }
      const instances = assignments(run.vars, run.holders);
      const resolve = (byte, at) => resolveByte(byte, at, run.holders);
    for (const at of instances) {
      const labels = run.vars.map((v) => at[`${v}:label`]);
      const inst = labels.length ? { label: labels.join(' ') } : null;
      const rows = run.rows;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowVars = run.vars;
        const address = row.address.map((b) => resolve(b, at));
        // The layout may name the group from the bulk dump block the row falls in.
        const groupName = own.groupOf?.(at, row, blockAt(address.map((b) => parseInt(b, 16)))) ?? (inst ? (own.group ? `${own.group} ${inst.label}` : inst.label) : own.group ?? titleCase(title));
        let name = clean(row.name);
        const label = `${groupName}: ${name} (${address.join(' ')})`;
        if (UNUSED.test(name) || !row.range.length) { continue; }
        if (inst && rowVars.length && !own.groupOf && !own.group) name = /^OP\b/.test(name) && /^OP\d/.test(inst.label) ? name.replace(/^OP\b/, inst.label) : `${inst.label} ${name}`;
        // `1..16`, `0 .. 59 (Minute)`, `5 ... 300`, `-120 … +120`: a range printed with dots; the MOTIF's
        // `1 - 16`, `L63 - C - R63`, `-64 - +63`: with a hyphen set between spaces.
        const asPrinted = clean(row.description);
        // (`1st bit 6-0 → bit 13-7`, the MOTIF ES generation's, and the YC's `à`, the same arrow mis-set:
        // the `:` other lists print; `bit 6 – 0`, the S90 XS's, is `bit 6-0`.)
        const description = asPrinted.replace(/(\d)\s*(?:\.{2,3}|…)\s*(?=[+-]?\d)/g, '$1 – ').replace(/(\S) - (?=\S)/g, '$1 – ')
          .replace(/\s*(?:→|\sà(?=\s|$))\s*/g, ': ').replace(/:\s*$/, '').replace(/\bbit\s*(\d+)\s*[–-]\s*(\d+)/g, 'bit $1-$2');
        const describe = [];
        // Several switches in one byte (`bit 6: Off, On Assignable Knob 8 bit 5: …`): sending one means
        // knowing the others.
        if ((`${description} ${row.notes}`.match(/\bbit\s*\d+\s*:/g) ?? []).length >= 2) { skip('several settings packed in one byte, a bit each', label); continue; }
        // A name printed a character a row.
        const charRow = (r) => /^(.*?Name)\s*(\d+)$/.exec(clean(r.name)) && /ASCII/.test(r.description) && r.size === 1;
        if (charRow(row)) {
          const base = /^(.*?Name)\s*\d+$/.exec(name)[1];
          let n = 1;
          while (rows[i + n] && charRow(rows[i + n]) && /^(.*?Name)\s*\d+$/.exec(clean(rows[i + n].name))[1] === /^(.*?Name)\s*\d+$/.exec(clean(row.name))[1]) n++;
          i += n - 1;
          const p = {
            id: unique(`${camel(groupName)}.${camel(base)}`),
            name: base,
            group: groupName,
            description: `${n} characters, one per address from ${address.join(' ')}, ${asPrinted}. Read from the bulk dump; not written, since a parameter change carries one character.`,
            type: 'text',
            default: '',
            address: address.join(' '),
            display: { mode: 'text', shortLabel: camel(base) },
            encoding: { type: 'text-ascii', length: n, pad: 32 },
            access: { canRead: false, canWrite: false, realtimeSafe: false, source: 'bulkDump' },
            sendPolicy: { mode: 'onCommit', coalesce: false },
            messageRecipe: recipe.id,
            ui: { preferredComponent: 'TextInput' },
          };
          parameters.push(sourced(p, row));
          placed.push({ parameter: p, address: address.map((b) => parseInt(b, 16)), width: n });
          continue;
        }
        let read;
        let encoding = { type: 'u7' };
        let width = 1;
        let pairChoice = false;
        // A high byte printed fixed and the low byte's range under it (the CP4 STAGE's `00` over `00 –
        // 1D`): the same as `00 00 – 00 1D`.
        const fixedHigh = row.size === 2 && row.range.length === 2 && !/1st bit/.test(description) && /^[0-9A-F]{2}$/.test(clean(row.range[0])) && /^([0-9A-F]{2})\s*–\s*([0-9A-F]{2})$/.exec(clean(row.range[1]));
        const split = row.size === 2 && row.range.length === 2 && /^[0-9A-F]{4}\s*[–-]$/.test(clean(row.range[0]));
        const pairs = row.size === 2 ? (split ? readSplitNumber(row.range[0], row.range[1], description) : readPairRange(fixedHigh ? `${clean(row.range[0])} ${fixedHigh[1]} – ${clean(row.range[0])} ${fixedHigh[2]}` : row.range.join(' '))) : null;
        if (pairs) {
          // Two 7-bit bytes a value, every value (the MODX M): read as one range.
          const values = readValues(pairs, description);
          width = 2;
          encoding = { type: 'u14-msb-lsb' };
          if (values.choices && values.choices.length <= 32 && values.choices.every((c) => c.value < 128)) { read = { choices: values.choices }; pairChoice = true; }
          else if (values.choices && pairs.length === 1) read = { min: pairs[0][0], max: pairs[0][1] };
          else if (pairs.length > 1) { skip('a data range in parts its description does not match', `${label}: ${row.range.join(' ')} / ${description}`); continue; } else read = { min: pairs[0][0], max: pairs[0][1], ...values };
        } else if (row.size === 1) {
          // A one-byte range wrapped over two lines (`00 –` over `11, 7F`).
          const parts = readHexRange(row.range.join(' '));
          if (!parts) { skip('a data range not read', `${label}: ${row.range.join('; ')}`); continue; }
          const values = readValues(parts, description);
          // A list longer than a menu (`Off, 1 – 95`, a controller number) is a number with its description.
          if (values.choices && values.choices.length > 32 && parts.length === 1) read = { min: parts[0][0], max: parts[0][1] };
          else if (values.choices) read = { choices: values.choices };
          else if (parts.length > 1) { skip('a data range in parts its description does not match', `${label}: ${row.range[0]} / ${description}`); continue; } else read = { min: parts[0][0], max: parts[0][1], ...values };
        } else {
          // Several bytes, split as the description says.
          const bands = row.size === 2 ? readTwoBands(row.range, description) : null;
          const bounds = row.range.map((r) => readHexRange(r)?.[0]);
          if (!bands && (bounds.length !== row.size || bounds.some((b) => !b))) { skip(`a value over ${row.size} bytes whose ranges are not printed one a byte`, label); continue; }
          if (bands) {
            // Two bands, the values between them unused: a number over both, the description saying which.
            encoding = { type: 'u14-msb-lsb' };
            read = { min: bands[0][0], max: bands[1][1] };
            describe.push(`Two bands: ${bands.map(([a, z]) => `${a} - ${z}`).join(' and ')}; the values between them are not used.`);
          } else if (row.size === 2 && /bit\s*3-0\s*:?\s*bit\s*7-4/.test(description)) {
            // Two nibbles (Detune: `1st bit 3-0: bit 7-4, 2nd bit 3-0: bit 3-0`).
            encoding = { type: 'nibbled', nibbles: 2 };
            read = { min: (bounds[0][0] << 4) | bounds[1][0], max: (bounds[0][1] << 4) | bounds[1][1] };
          } else if (row.size === 4 && /bit\s*3-0\s*:?\s*bit\s*15-?\s*12/.test(description)) {
            encoding = { type: 'nibbled', nibbles: 4 };
            read = { min: bounds.reduce((n, b) => (n << 4) | b[0], 0), max: bounds.reduce((n, b) => (n << 4) | b[1], 0) };
          } else if (row.size === 2 && /bit\s*6-0\s*:?\s*bit\s*13-7/.test(description)) {
            encoding = { type: 'u14-msb-lsb' };
            read = { min: (bounds[0][0] << 7) | bounds[1][0], max: (bounds[0][1] << 7) | bounds[1][1] };
            // What it shows: as wide as the range (`-128 – +127` over 0 - 255), or the values themselves (Tempo 30 - 300).
            const shown = readShownRange(description.replace(/\s*1st bit.*$/, ''));
            if (shown && shown.max - shown.min === read.max - read.min && shown.min !== read.min) read = { ...read, shown: { min: shown.min, max: shown.max }, ...(shown.unit ? { unit: shown.unit } : {}) };
            else if (shown && shown.min >= read.min && shown.max <= read.max) read = { min: shown.min, max: shown.max };
            name = name.replace(/^(.*?)\s+MSB\s+\1\s+LSB$/, '$1');
          } else if (row.size === 2 && readShownRange(description) && ((bounds[0][1] << 7) | bounds[1][1]) - ((bounds[0][0] << 7) | bounds[1][0]) === readShownRange(description).max - readShownRange(description).min) {
            // A high and a low 7-bit range whose description counts out exactly the values between
            // (Tempo, `00 – 02` over `05 – 2C` beside `5 ... 300`; `00 – 01` over `08 – 78` beside
            // `-120 … +120`).
            encoding = { type: 'u14-msb-lsb' };
            const shown = readShownRange(description);
            read = { min: (bounds[0][0] << 7) | bounds[1][0], max: (bounds[0][1] << 7) | bounds[1][1] };
            if (shown.min !== read.min) read = { ...read, shown: { min: shown.min, max: shown.max }, ...(shown.unit ? { unit: shown.unit } : {}) };
          } else if (row.size === 2 && wholeAgrees(bounds, description)) {
            // Two 7-bit bytes whose description's numbers end at the two together (the MO's `00 – 7F`
            // over `00 – 7F` beside `0 – 1786: Preset, 8192 – 8447: User, 16383: No Type`).
            encoding = { type: 'u14-msb-lsb' };
            read = { min: (bounds[0][0] << 7) | bounds[1][0], max: (bounds[0][1] << 7) | bounds[1][1] };
          } else { skip(`a value over ${row.size} bytes split in a way not read`, label); continue; }
          width = row.size;
          describe.push(/1st bit/.test(description) ? `${row.size} bytes: ${description.replace(/^.*?(1st bit)/, '$1')}.` : `${row.size} bytes, the high 7 bits first.`);
          const shownText = asPrinted.replace(/\s*1st bit.*$/, '');
          if (shownText) describe.push(`Printed: ${shownText}.`);
        }
        if (row.notes) describe.push(clean(row.notes).replace(/([^.])$/, '$1.'));
        const base = {
          id: unique(`${camel(groupName)}.${camel(name)}`),
          name,
          group: groupName,
          address: address.join(' '),
          access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
          messageRecipe: recipe.id,
        };
        // The Default (HEX) column, where the data list prints one: bytes, and a one-word label of the
        // value after them (`00 10 (NoAsg)`); `01 (EL1 only)` is a condition, not a default for all.
        const printed = /^([0-9A-F]{2})(?:\s+([0-9A-F]{2}))?(?:\s+([0-9A-F]{2}))?(?:\s+([0-9A-F]{2}))?(?:\s*\([^)\s]*\))?$/.exec(clean(row.default ?? ''));
        const defaultBytes = printed ? printed.slice(1).filter(Boolean).map((b) => parseInt(b, 16)) : null;
        const printedDefault = defaultBytes && defaultBytes.length === width
          ? (encoding.type === 'nibbled' ? defaultBytes.reduce((n, b) => (n << 4) | b, 0) : encoding.type === 'u14-msb-lsb' ? (defaultBytes[0] << 7) | defaultBytes[1] : defaultBytes[0])
          : null;
        let p;
        if (read.choices) {
          const seen = new Set();
          const list = read.choices.map(({ value, label: l }) => { const s = slug(l); const id = seen.has(s) ? `${s}_${value}` : s; seen.add(id); return { id, label: l, value }; });
          if (pairChoice) { base.messageRecipe = choiceRecipe.id; pairChoices++; }
          p = { ...base, ...(describe.length ? { description: describe.join(' ') } : {}), type: 'choice', default: (list.find((c) => c.value === printedDefault) ?? list[0]).id, choices: list, display: { mode: 'choice', shortLabel: camel(name) }, normalization: { mode: 'choiceIndex' }, encoding: { type: 'enum' }, sendPolicy: { mode: 'onCommit', coalesce: true }, ui: { preferredComponent: list.length === 2 ? 'ToggleButton' : list.length <= 5 ? 'RadioButtonGroup' : 'Combobox' } };
        } else {
          const same = readShownRange(description);
          if ((row.size === 1 || pairs) && description && !read.shown && !(same && same.min === read.min && same.max === read.max)) describe.push(`Printed: ${asPrinted}.`);
          if (read.unit) describe.push(`In ${read.unit}.`);
          const bipolar = read.shown && read.shown.min < 0 && read.shown.max > 0;
          const zero = bipolar ? read.min - read.shown.min : null;
          p = {
            ...base,
            ...(describe.length ? { description: describe.join(' ') } : {}),
            type: bipolar ? 'bipolar' : 'integer',
            range: { min: read.min, max: read.max },
            default: printedDefault !== null && printedDefault >= read.min && printedDefault <= read.max ? printedDefault : zero ?? read.min,
            display: { mode: 'number', unit: read.unit === 'semitones' ? 'st' : read.unit === 'dB' ? 'dB' : '', shortLabel: camel(name), ...(read.shown ? { min: read.shown.min, max: read.shown.max } : {}) },
            normalization: { mode: 'linear' },
            encoding,
            sendPolicy: read.max - read.min > 8 ? { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } : { mode: 'onCommit', coalesce: true },
            ui: { preferredComponent: /Level|Attack|Decay|Sustain|Release|Rate|Depth|Time|Volume/i.test(name) ? 'Slider' : 'Knob' },
          };
        }
        parameters.push(sourced(p, row));
        // A two-byte choice is read from its low byte.
        placed.push({ parameter: p, address: address.map((b) => parseInt(b, 16)), width, ...(pairChoice ? { valueAt: 1 } : {}) });
      }
    }
    }
  }

  // Pull: the bulk dump blocks.
  const requests = [];
  const dumpDefinitions = [];
  const read = new Set();
  const isHex = (x) => /^[0-9A-F]{2}$/.test(x);
  const dumpFor = (b, collection) => {
    const size = b.size;
    const id = `bulk${b.at.map(hex).join('')}`;
    const mappings = size > 0 ? placed.filter((x) => inBlock(x.address, b.at, size, x.width))
      .map((x) => ({ parameter: x.parameter, offset: x.address.at(-1) - b.at.at(-1) + (x.valueAt ?? 0), ...(x.parameter.encoding.type !== 'u7' && x.parameter.type !== 'choice' && x.parameter.type !== 'text' ? { codec: { type: x.parameter.encoding.type === 'nibbled' ? 'nibbled' : x.parameter.encoding.type, ...(x.parameter.encoding.nibbles ? { nibbles: x.parameter.encoding.nibbles } : {}) } } : {}) })) : [];
    const bc = b.bytes;
    const counted = bulkHead.indexOf('bb');
    const at = 3 + bulkHead.length + addressBytes;   // F0 43 0n, the header, the address
    // The checksum adds up from the model ID (the reface, the MOXF) or from the byte count (the MX).
    const from = 3 + counted + (data.format.checksumFrom === 'byteCount' ? 0 : 2);
    return {
      id,
      name: b.name,
      kind: 'sysex',
      matcher: { prefix: ['F0', '43', '00', ...bulkHead.map((x, i) => (i === counted ? hex(bc >> 7) : i === counted + 1 ? hex(bc & 127) : x)), ...b.at.map(hex)], suffix: ['F7'] },
      payload: { offset: at, size },
      checksum: { type: 'roland-7bit', fromOffset: from, toOffset: at + size - 1, byteOffset: at + size },
      completion: { expectedMessages: collection ? collection.count : 1, expectedBytes: at + size + 2, ...(collection ? { collectionId: collection.id, ...(collection.endsWith ? { endsWith: collection.endsWith } : {}) } : {}) },
      mappings,
    };
  };
  // A block listed on its own and again in a collection (the CP88's Master EQ, under System and in the
  // Live Set Sound) is defined once, as the collection's: its own request is answered by it all the same.
  const take = (d) => {
    for (const m of d.mappings) { read.add(m.parameter); if (typeof m.parameter !== 'string') m.parameter = m.parameter.id; }
    const twin = dumpDefinitions.findIndex((x) => x.id === d.id);
    if (twin < 0) dumpDefinitions.push(d);
    else if (d.completion.collectionId && !dumpDefinitions[twin].completion.collectionId) dumpDefinitions[twin] = d;
    return d;
  };
  const notAsked = [];
  // A Bulk Header begins a collection that runs to its Bulk Footer; a block outside one is asked for
  // alone, when it holds a parameter laid out here.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.frame === 'header') {
      let j = i;
      while (j < blocks.length && blocks[j].frame !== 'footer') j++;
      // The layout picks a collection by its label, or, where two share one (the MODX M's
      // PERFORMANCE headers), by its header as printed (`04 04 01 nn`).
      const pull = layout.pull?.[b.address.join(' ')] ?? layout.pull?.[b.label];
      // The header's address as printed (the reface's 0E 0F 00), or, printed `0E mm nn`, the one the
      // layout picks from the Bulk Control table (the MOXF's Normal Voice Edit Buffer, 0E 0F 00).
      const header = pull?.header?.map((x) => parseInt(x, 16)) ?? (b.address.every(isHex) ? b.at : null);
      if (!header) { skip('a bulk dump whose header the data list prints as `0E mm nn` and the layout does not pick', b.label); i = j; continue; }
      const members = blocks.slice(i, j + 1).map((m) => (m.frame && !m.address.every(isHex) ? { ...m, at: [m.at[0], ...header.slice(1)] } : m));
      const id = pull?.id ?? layout.pullName ?? 'editBuffer';
      // Complete at its Bulk Footer: the data list says the blocks between may come in any order and
      // not all of them, and a MODX part sends element, key or operator blocks as its type has.
      const footer = members.at(-1);
      const collection = { id, count: members.length, ...(footer.frame === 'footer' ? { endsWith: `bulk${footer.at.map(hex).join('')}` } : {}) };
      const dumps = members.map((m) => dumpFor(m, collection));
      if (!dumps.some((d) => d.mappings.length)) { notAsked.push(pull?.name ?? b.label); i = j; continue; }
      dumps.forEach(take);
      requests.push({ id: `request${id.replace(/^./, (c) => c.toUpperCase())}`, name: `Bulk dump request (${pull?.name ?? members.slice(1, -1).map((m) => m.name).join(', ')})`, kind: 'sysex', template: ['F0', '43', '20', ...head, ...members[0].at.map(hex), 'F7'], response: { kind: 'bulkDump', collectionId: collection.id }, timeoutMs: 3000, retries: layout.collectionRetries ?? 1 });
      i = j;
    } else {
      const d = dumpFor(b, null);
      if (!d.mappings.length) { notAsked.push(b.name); continue; }
      take(d);
      const rid = `request${camel(b.name).replace(/^./, (c) => c.toUpperCase())}`;
      requests.push({ id: requests.some((r) => r.id === rid) ? `${rid}${b.at.map(hex).join('')}` : rid, name: `Bulk dump request (${b.name})`, kind: 'sysex', template: ['F0', '43', '20', ...head, ...b.at.map(hex), 'F7'], response: { dump: d.id }, timeoutMs: 3000, retries: 1 });
    }
  }
  if (notAsked.length) notes.push(`Not asked for, holding no parameter laid out here: ${notAsked.join(', ')}.`);
  for (const p of read) { p.access.canRead = true; if (p.access.source !== 'bulkDump') p.access.source = 'singleParameter'; }
  const unread = parameters.filter((p) => !read.has(p));

  if (corrected.length) notes.push(`Addresses misprinted in the data list, taken from where it prints them otherwise (a row's from the rows either side, a block's from another list): ${corrected.join(', ')}.`);
  if (unprinted.length) notes.push(`Rows the data list prints without an address, taken as the row's before them past its size: ${unprinted.join(', ')}.`);
  for (const [why, list] of skipped) notes.push(`Left out, ${why}: ${list.join(', ')}.`);
  const unreadGroups = [...new Set(unread.map((p) => p.group))];
  if (requests.length) notes.push(`Pull: ${requests.map((r) => r.name).join('; ')}. ${read.size} of ${parameters.length} parameters are read back${unread.length ? `; not in any block: ${unread.length > 12 ? `${unread.length} parameters, in ${unreadGroups.join(', ')}` : unread.map((p) => p.name).join(', ')}` : ''}.`);

  const variables = { channel: 1, deviceId: 16, ...(layout.variables ?? {}) };
  const tests = [];
  // (A nibbled value of each width the profile has: Master Tune's four, Detune's two.)
  const nibbleWidths = [...new Set(parameters.filter((p) => p.encoding.type === 'nibbled').map((p) => p.encoding.nibbles))];
  const pick = [...new Set([parameters.find((p) => p.type === 'choice'), parameters.find((p) => p.type === 'integer' && p.range.max > 1), parameters.find((p) => p.encoding.type === 'u14-msb-lsb' && p.type !== 'choice'), ...nibbleWidths.map((n) => parameters.find((p) => p.encoding.type === 'nibbled' && p.encoding.nibbles === n))].filter(Boolean))];
  const valueBytes = (p, v) => (p.encoding.type === 'u14-msb-lsb' ? [v >> 7, v & 127] : p.encoding.type === 'nibbled' ? Array.from({ length: p.encoding.nibbles }, (u, i) => (v >> ((p.encoding.nibbles - 1 - i) * 4)) & 15) : [v]);
  for (const p of pick) {
    const choice = p.type === 'choice' ? p.choices.at(-1) : null;
    const v = choice ? choice.value : Math.min(p.range.max, Math.max(p.range.min, 100));
    tests.push({ name: `${p.group}: ${p.name} = ${choice ? choice.label : v}`, parameter: p.id, value: choice ? choice.id : v, expectedHex: ['F0', '43', hex(variables.deviceId), ...head, p.address, ...(p.messageRecipe === choiceRecipe.id ? [0, v] : valueBytes(p, v)).map(hex), 'F7'].join(' ') });
  }
  for (const r of requests) tests.push({ name: r.name, kind: 'request', request: r.id, expectedHex: r.template.join(' ') });
  // A dump made by hand from the block's own layout, its checksum worked out: every mapped value at
  // its lowest, but one choice at its last value and one number at its highest.
  const rich = [...dumpDefinitions].sort((a, b) => b.mappings.length - a.mappings.length)[0];
  if (rich?.mappings.length) {
    const data = new Array(rich.payload.size).fill(0);
    const expected = {};
    const byId = new Map(parameters.map((p) => [p.id, p]));
    const set = (m, v) => { valueBytes(byId.get(m.parameter), v).forEach((b, k) => { data[m.offset + k] = b; }); };
    for (const m of rich.mappings) {
      const p = byId.get(m.parameter);
      if (p.type === 'text') { 'INIT'.padEnd(p.encoding.length, ' ').split('').forEach((c, k) => { data[m.offset + k] = c.charCodeAt(0); }); expected[p.id] = 'INIT'; continue; }
      set(m, p.type === 'choice' ? p.choices[0].value : p.range.min);
    }
    const c = rich.mappings.map((m) => byId.get(m.parameter)).find((p) => p.type === 'choice');
    const n = rich.mappings.map((m) => byId.get(m.parameter)).find((p) => p.type !== 'choice' && p.type !== 'text');
    if (c) { set(rich.mappings.find((m) => m.parameter === c.id), c.choices.at(-1).value); expected[c.id] = c.choices.at(-1).id; }
    if (n) { set(rich.mappings.find((m) => m.parameter === n.id), n.range.max); expected[n.id] = n.range.max; }
    const prefix = rich.matcher.prefix.map((b) => parseInt(b, 16));
    const summed = [...prefix.slice(rich.checksum.fromOffset), ...data];
    const sum = (128 - (summed.reduce((t, b) => t + b, 0) % 128)) % 128;
    tests.push({ name: `${rich.name}, read back`, kind: 'dumpParse', inputHex: [...prefix, ...data, sum, 0xf7].map(hex).join(' '), expectedValues: expected });
  }

  const reply = layout.identityReply ?? data.format.identityReply ?? [];
  const identity = reply.length >= 10 ? { requestDeviceId: '7F', manufacturerId: [reply[5]], familyCode: reply.slice(6, 8), modelNumber: reply.slice(8, 10), timeoutMs: 1000, retries: 0 } : null;
  const profile = {
    schemaVersion: 1,
    profileVersion: layout.profileVersion ?? '0.1.0',
    minCEditorVersion: '0.9.0',
    id: layout.id,
    name: layout.name,
    manufacturer: 'Yamaha',
    family: layout.family,
    status: 'experimental',
    trust: 'local',
    description: layout.description,
    sources: data.sources.map((s, i) => ({
      type: 'manual',
      title: s.title,
      // Which pages of which document: the format and the tables may be in two (the YC's).
      notes: `${[i === (layout.read.formatDoc ?? layout.read.doc ?? 0) ? `MIDI data format (pages ${layout.read.formatPages.join(', ')})` : null, i === (layout.read.doc ?? 0) ? `data tables (pages ${layout.read.tablePages.join(', ')})` : null].filter(Boolean).join(' and ')} read by tools/profiles/yamaha/read-yamaha-pdf.mjs from ${s.file} (sha256 ${s.sha256}), ${s.url}. Not yet checked against the instrument itself.`,
    })),
    testedWith: [],
    authoringNotes: [
      'Generated by tools/profiles/yamaha/make-profiles.mjs; edit the layout in tools/profiles/yamaha/synths/, not this file.',
      'Every parameter is a row of the data list\'s MIDI parameter change tables, with its printed name. Nothing here has been sent to a real instrument yet.',
      `Parameter change: F0 43 1n ${head.join(' ')} <address> <data> F7, n the device number (the deviceId variable is 1n, 10H for device number 1); bulk dumps are asked for with 2n and answered with 0n, both taken as device number 1.`,
      identity ? `Identity: the reply the data list prints, ${reply.join(' ')}.` : `No identity check: ${layout.noIdentity ?? 'the data list prints no identity reply'}.`,
      ...(layout.notes ?? []),
      ...notes,
    ],
    variables,
    ...(identity ? { identity } : {}),
    coverage: {
      singleParameterWrite: 'complete-for-the-data-list\'s-parameter-change-tables',
      realtimeEditing: 'complete-for-the-data-list\'s-parameter-change-tables',
      editBufferDumpRequest: requests.length ? 'complete: every bulk dump block the data list lists' : 'notImplemented',
      editBufferDumpParse: requests.length ? `${unread.length ? 'partial' : 'complete'}: ${read.size} of ${parameters.length} parameters` : 'notImplemented',
      bankDump: 'notImplemented',
      inboundControllers: 'parameter changes the instrument sends are read by address; its control changes are not mapped',
      verifiedOnHardware: false,
      ...(layout.coverage ?? {}),
    },
    timing: { minDelayBetweenMessagesMs: layout.delayMs ?? 0 },
    messageRecipes: [recipe, ...(pairChoices ? [choiceRecipe] : [])],
    parameters,
    tests,
    ...(requests.length ? { requests, dumpDefinitions, startup: { policy: 'pull', syncDirection: 'pull', sync: requests.map((r) => ({ request: r.id })) } } : {}),
  };
  return profile;
}

export { stringifyProfile };
