// dumpOffsets.js — what lives at the bytes a byte-list call reads or writes, by the device profile's
// own description of its dumps, for the script editor's Values tab. "ce.midi.read(msg, 23, 1)" is the
// GAIA's Patch Level when msg is a Patch Common dump; nothing in the call says so.
//
// A profile describes each dump by offset: `payload.offset`, where its values start in the message,
// and `mappings`, one { parameter, offset } a value, counted from there (deviceProfileLocalEngine.js
// decodes a dump the same way). valuesContext.js turns that into each dump's layout, its fields at
// their places in the whole message, each as wide as the parameter's encoding is
// (parameterValueWidth). Offsets here count from the message's first byte, F0, as a script that
// reads a dump has it: onMidiIn's midi.bytes is the message as it arrived.
//
// Which dump the bytes are is not known from the call, so every dump of every mapped profile that has
// something at those bytes is said, the dumps that hold the same thing there on one line (a GAIA's
// three tones have their filter cutoff at the same byte), four lines at most; when the bytes are
// written out, only the dumps they match. Read when the offset and the count are written out.

import { readBytes } from './scriptValueKinds.js';

const VERBS = { bytesRead: 'ce.midi.read', bytesWrite: 'ce.midi.write', bytesSlice: 'ce.midi.slice', bytesPut: 'ce.midi.put' };
const SHOWN = 4;
const isWhole = (n) => typeof n === 'number' && Number.isInteger(n);
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/** "$deviceId" as words: "the device id". */
const variableWords = (token) => `the ${String(token).slice(1).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`;

/**
 * What a read, write, slice or put call's bytes are in the profiles' dumps, or null when it is none
 * of those, a part it reads is not written out, or no dump has anything there:
 *
 *   { verb, from, to, dumps: [{ role, profile, dump, id, parts: [{ what, text, from, to }] }],
 *     lines: [{ profile, dumps: [names], who, text }], more }
 *
 * `to` is null for a slice to the end. `what` is 'header', 'field', 'packed', 'checksum' or 'end'; a field's
 * part also has `parameter` and `whole`, false when the call reads or writes only some of its bytes.
 * `lines` is what the row says, a line for each different thing those bytes are, with the dumps they
 * are that in; `more` counts the dumps on lines past the fourth.
 */
export function readDumpOffset(memberId, args, devices) {
  const verb = VERBS[memberId];
  if (!verb) return null;
  const arg = (name) => args.find((a) => a.param?.name === name);
  const offsetArg = arg('offset');
  if (!offsetArg?.literal || !isWhole(offsetArg.value) || offsetArg.value < 0) return null;
  const from = offsetArg.value;
  let to;
  if (memberId === 'bytesRead' || memberId === 'bytesWrite') {
    const c = arg('count');
    if (!c?.literal || !isWhole(c.value) || c.value < 1 || c.value > 4) return null;
    to = from + c.value - 1;
  } else if (memberId === 'bytesSlice') {
    const c = arg('count');
    if (!c) to = null;
    else if (!c.literal || !isWhole(c.value) || c.value < 1) return null;
    else to = from + c.value - 1;
  } else {
    // put writes as many bytes as it is given: not known, or none, and there is no range to name.
    const v = arg('values');
    const read = v?.literal ? readBytes(v.value, { verb }).meaning.bytes : null;
    if (!Array.isArray(read) || !read.length) return null;
    to = from + read.length - 1;
  }
  // Bytes written out are matched against each dump's start, its variables matching any byte.
  const bytesArg = arg('bytes');
  const given = bytesArg?.literal ? readBytes(bytesArg.value, { verb }).meaning.bytes : null;

  const found = [];
  for (const [role, info] of Object.entries(devices?.roles ?? {})) {
    for (const dump of Array.isArray(info?.dumps) ? info.dumps : []) {
      const layout = dump?.layout;
      if (!layout) continue;
      if (Array.isArray(given) && !matches(layout.prefix, given)) continue;
      const parts = partsOf(layout, from, to);
      if (parts.length) found.push({ role, profile: info.profileName ?? '', dump: dump.name || dump.id, id: dump.id, parts });
    }
  }
  if (!found.length) return null;
  const byText = new Map();
  for (const d of found) {
    const text = dumpPartsSaid(d.parts);
    const key = `${d.profile}\u0000${text}`;
    if (!byText.has(key)) byText.set(key, { profile: d.profile, dumps: [], text });
    byText.get(key).dumps.push(d.dump);
  }
  const lines = [...byText.values()].map((line) => ({ ...line, who: dumpNamesSaid(line.dumps) }));
  const more = lines.slice(SHOWN).reduce((n, line) => n + line.dumps.length, 0);
  return { verb, from, to, dumps: found, lines: lines.slice(0, SHOWN), more };
}

function matches(prefix, bytes) {
  const list = Array.isArray(prefix) ? prefix : [];
  if (bytes.length < list.length) return false;
  return list.every((token, i) => String(token).startsWith('$') || parseInt(String(token), 16) === bytes[i]);
}

/** What of one dump's layout lies in [from, to] (to null: to the end). */
function partsOf(layout, from, to) {
  const end = to ?? Infinity;
  const hits = (a, b) => a <= end && b >= from;
  const parts = [];
  const prefix = Array.isArray(layout.prefix) ? layout.prefix : [];
  if (hits(0, layout.payload - 1)) {
    const a = Math.max(0, from);
    const b = Math.min(layout.payload - 1, end);
    const words = [];
    for (let i = a; i <= b; i += 1) {
      const token = prefix[i];
      words.push(token === undefined ? '?' : String(token).startsWith('$') ? variableWords(token) : hex2(parseInt(String(token), 16)));
    }
    parts.push({ what: 'header', from: a, to: b, text: `${a === b ? `header byte ${a}` : `header bytes ${a}–${b}`}: ${words.join(', ')}` });
  }
  for (const field of layout.fields ?? []) {
    const a = field.start;
    const b = field.start + field.width - 1;
    if (!hits(a, b)) continue;
    const whole = from <= a && end >= b;
    const at = a === b ? `byte ${a}` : `bytes ${a}–${b}`;
    parts.push({
      what: 'field', parameter: field.parameter, from: a, to: b, whole,
      text: whole ? (a === b ? field.name : `${field.name}, ${at}`) : `part of ${field.name}, which is ${at}`,
    });
  }
  if (layout.packed && hits(layout.packed.from, layout.packed.to)) {
    const { from: a, to: b } = layout.packed;
    parts.push({ what: 'packed', from: a, to: b,
      text: `packed values, bytes ${a}–${b}: unpacked before they are read, so no byte here is one value` });
  }
  const sum = layout.checksum;
  if (sum && Number.isInteger(sum.at) && hits(sum.at, sum.at + Math.max(1, sum.count) - 1)) {
    parts.push({ what: 'checksum', from: sum.at, to: sum.at + Math.max(1, sum.count) - 1, text: 'the checksum' });
  }
  if (Number.isInteger(layout.length) && hits(layout.length - 1, layout.length - 1)) {
    parts.push({ what: 'end', from: layout.length - 1, to: layout.length - 1, text: 'F7, the end' });
  }
  return parts;
}

/** The dumps a line is about: three by name, or two and how many more. */
export function dumpNamesSaid(names) {
  if (names.length <= 3) return names.length === 3 ? `${names[0]}, ${names[1]} and ${names[2]}` : names.join(' and ');
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** The line a dump's parts are said in: the first four, and how many more. */
export function dumpPartsSaid(parts) {
  const shown = parts.slice(0, 4).map((p) => p.text);
  const more = parts.length - shown.length;
  return `${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}`;
}

/** "Byte 23", "Bytes 23 to 24" or "From byte 11 to the end", counting from F0. */
export function dumpRangeSaid({ from, to }) {
  if (to === null) return `From byte ${from} to the end, counting from F0`;
  return from === to ? `Byte ${from}, counting from F0` : `Bytes ${from} to ${to}, counting from F0`;
}
