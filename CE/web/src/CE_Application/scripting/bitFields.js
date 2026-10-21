// bitFields.js — what ce.midi.getBits and setBits do with the bits they are given, for the script
// editor's Values tab: the byte (or bytes) drawn a bit to a cell with the field marked, the bits read
// or written, and the runtime's sentence for a call it refuses, checked in the runtime's order
// (panelRuntime.js's bytesGetBits and bytesSetBits; test/bitFields.test.js holds the two together).
//
// "getBits(b, 4, 3)" is a field of a packed byte, the way synths store a waveform and a range in one
// byte, and nothing in the call shows which bits those are. The row draws them.
//
// Read when the start and the count are written out. The value may not be: then the field is drawn
// on empty bytes, which is still where it is. Bits run from 0, the lowest, as the runtime counts
// them; a byte is drawn as it is written, its highest bit first, and a list's bytes in list order,
// its bits running on from one byte into the next, eight to a byte.

import { readBytes } from './scriptValueKinds.js';

const BIT_RANGE = 'start must be a whole number from 0, and count one from 1 to 32';
const isWhole = (n) => typeof n === 'number' && Number.isInteger(n);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const span = (word, a, b) => (a === b ? `${word} ${a} is past` : `${word}s ${a} to ${b} run past`);
const shown = (v) => (v === undefined || v === null ? 'nothing' : typeof v === 'string' ? `"${v}"`
  : typeof v === 'number' || typeof v === 'boolean' ? String(v) : 'a list');
const hex = (n, digits) => `0x${n.toString(16).toUpperCase().padStart(digits, '0')}`;

const VERBS = { getBits: 'ce.midi.getBits', setBits: 'ce.midi.setBits' };

/**
 * A getBits or setBits call's field, or null when it is neither or its start or count is not
 * written out:
 *
 *   { verb, start, count, groups: [{ label, cells: [{ bit, v, was, field }] }], read, result, bits, said,
 *     refused }
 *
 * Each group is a byte, drawn highest bit first; a cell's `v` is its bit (0 or 1) — after setBits
 * writes, when it does — and `was` the bit before (setBits' field only), both null when the value is
 * not known. `read` is what getBits answers and `result` what setBits does, each null when it is not
 * known or the call is refused; `bits` is setBits' new setting when it is written out and fits;
 * `refused` is the runtime's sentence for a call it answers nothing to, and `said` what the row says
 * of the field.
 */
export function readBitField(memberId, args) {
  const verb = VERBS[memberId];
  if (!verb) return null;
  const arg = (name) => args.find((a) => a.param?.name === name);
  const startArg = arg('start');
  const countArg = arg('count');
  if (!startArg?.literal || !countArg?.literal) return null;
  const start = startArg.value;
  const count = countArg.value;
  const refuse = (why) => `${verb}: ${why}, so there is no answer.`;
  const out = { verb, start, count, groups: [], read: null, result: null, bits: null, said: '', refused: null };
  if (!isWhole(start) || start < 0 || !isWhole(count) || count < 1 || count > 32) {
    out.refused = refuse(BIT_RANGE);
    return out;
  }
  const end = start + count - 1;

  // setBits' bits, which it checks before it looks at the value.
  let bits;
  if (memberId === 'setBits') {
    const bitsArg = arg('bits');
    if (!bitsArg || bitsArg.literal) {
      const v = bitsArg?.value;
      const unfit = v === undefined || v === null ? 'the value to write is missing'
        : !isWhole(v) ? `${shown(v)} is not a whole number`
          : v < 0 || v >= 2 ** count ? `${v} does not fit in ${plural(count, 'bit')}` : '';
      if (unfit) out.refused = refuse(unfit);
      else { bits = v; out.bits = v; }
    }
  }

  // The value: a number, a list of bytes, or not known.
  const valueArg = arg('value');
  const known = valueArg?.literal === true;
  const value = known ? valueArg.value : undefined;
  let bytes = null;                                       // low byte first for a number
  let list = false;
  if (known && typeof value === 'number') {
    if (!out.refused && end >= 32) out.refused = refuse(`${span('bit', start, end)} the 32 bits a number holds here`);
    const v = Math.floor(value);
    bytes = [0, 1, 2, 3].map((i) => (((Math.floor(v / 2 ** (8 * i)) % 256) + 256) % 256));
    if (!out.refused) {
      const m = 2 ** count;
      const old = ((Math.floor(v / 2 ** start) % m) + m) % m;
      if (memberId === 'getBits') out.read = old;
      else if (bits !== undefined) out.result = v - old * 2 ** start + bits * 2 ** start;
    }
  } else if (known) {
    list = true;
    if (value === undefined || value === null) {
      if (!out.refused) out.refused = refuse('no bytes given');
    } else {
      const read = readBytes(value, { verb, outcome: 'there is no answer' });
      if (Array.isArray(read.meaning.bytes)) bytes = read.meaning.bytes;
      else if (!out.refused) out.refused = read.problem?.message ?? refuse(`${shown(value)} is not a list of bytes`);
      if (bytes && !out.refused && end >= bytes.length * 8) {
        out.refused = refuse(`${span('bit', start, end)} the end of ${plural(bytes.length, 'byte')}`);
      }
    }
  }

  const bitOf = (from, at) => (from && at < from.length * 8 ? Math.floor(from[Math.floor(at / 8)] / 2 ** (at % 8)) % 2 : null);
  let after = bytes;
  if (bytes && !out.refused && memberId === 'setBits' && bits !== undefined) {
    after = bytes.slice();
    for (let k = 0; k < count; k += 1) {
      const at = start + k;
      const mask = 2 ** (at % 8);
      const i = Math.floor(at / 8);
      after[i] += ((Math.floor(bits / 2 ** k) % 2) - (Math.floor(after[i] / mask) % 2)) * mask;
    }
    if (list) out.result = after;
  }
  if (bytes && !out.refused && memberId === 'getBits' && list) {
    let read = 0;
    for (let at = end; at >= start; at -= 1) read = read * 2 + bitOf(bytes, at);
    out.read = read;
  }

  // The bytes drawn: a list's in list order, all of them up to four, else the ones the field is in;
  // a number's from the highest byte the field or the value reaches down to its lowest; a value not
  // known, the bytes the field is in.
  const first = Math.floor(start / 8);
  const last = Math.floor(end / 8);
  let order = [];
  if (list && bytes) {
    const lo = bytes.length <= 4 ? 0 : Math.min(first, bytes.length - 1);
    const hi = bytes.length <= 4 ? bytes.length - 1 : Math.min(last, bytes.length - 1);
    for (let i = lo; i <= hi; i += 1) order.push(i);
  } else if (bytes) {
    let top = Math.min(3, last);
    for (let i = 3; i > top; i -= 1) if (bytes[i]) { top = i; break; }
    for (let i = top; i >= 0; i -= 1) order.push(i);
  } else {
    for (let i = last; i >= first; i -= 1) order.push(i);
  }
  const labelled = list || order.length > 1 || order[0] > 0;
  out.groups = order.map((i) => ({
    label: !labelled ? '' : list ? `byte ${i}` : `bits ${8 * i + 7}–${8 * i}`,
    cells: [7, 6, 5, 4, 3, 2, 1, 0].map((b) => {
      const bit = 8 * i + b;
      const field = bit >= start && bit <= end;
      const cell = { bit, v: bitOf(after, bit), field };
      if (field && after !== bytes) cell.was = bitOf(bytes, bit);
      return cell;
    }),
  }));

  // What the row says.
  const one = start === end;
  const Where = one ? `Bit ${start}` : `Bits ${start} to ${end}`;
  const where = one ? `bit ${start}` : `bits ${start} to ${end}`;
  const fieldOf = (from) => {
    let s = '';
    for (let at = end; at >= start; at -= 1) s += String(bitOf(from, at));
    return s;
  };
  if (out.refused || !bytes) {
    out.said = memberId === 'getBits' ? `Reads ${where}.`
      : bits !== undefined && !out.refused ? `Writes ${bits} into ${where}.` : `Writes into ${where}.`;
  } else if (memberId === 'getBits') {
    out.said = one ? `${Where} is ${out.read}.` : `${Where} are ${fieldOf(bytes)}, which is ${out.read}.`;
  } else if (bits === undefined) {
    out.said = `Writes into ${where}, ${one ? 'which is' : 'which are'} ${fieldOf(bytes)} now.`;
  } else {
    const was = fieldOf(bytes);
    const now = fieldOf(after);
    const go = `${Where} ${one ? 'goes' : 'go'} from ${was} to ${now}`;
    if (was === now) out.said = `${Where} ${one ? 'is' : 'are'} ${now} already, so nothing changes.`;
    else if (list) {
      const changed = after.map((b, i) => (b !== bytes[i] ? i : -1)).filter((i) => i >= 0);
      out.said = `${go}: ${changed.map((i) => `byte ${i} becomes ${hex(after[i], 2)}`).join(', ')}.`;
    } else {
      const digits = 2 * Math.max(1, order.length);
      const v = Math.floor(value);
      out.said = v >= 0 && out.result >= 0 ? `${go}: ${hex(v, digits)} becomes ${hex(out.result, digits)}.` : `${go}: ${v} becomes ${out.result}.`;
    }
  }
  return out;
}
