// callExplainers.js — what a call does with the values written in it, for the Values sidebar to draw
// under the call's rows: the bytes a number becomes, the bytes a read takes from a message, the
// messages a send puts out, the steps to a checksum, where a value lands in another range.
// docs/design/api-descriptions-handoff.md, "The Values sidebar and the hint".
//
// Only what is written out is drawn: a value that only exists when the script runs leaves its cells
// empty, and nothing is worked out from a guess. The arithmetic is the runtime's (panelRuntime.js's
// to7bit, bytesRead, sendParameterNumber and the shared checksum table), done again here on the
// literal values so the drawing says what the call will do; test/callExplainers.test.js holds the
// two together where they can drift.
//
// Also here: the lines of a function argument that give each answer a command makes a choice from
// (interceptMidiIn's "What fn returns"), and the "Good to know" lines, with the checks that turn a
// general note into a line about this script.
//
// Pure: no store, no DOM.

import { checksumAlgorithm } from '../utils/checksums.js';
import { readBytes } from './scriptValueKinds.js';

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const isWhole = (n) => typeof n === 'number' && Number.isInteger(n);
const ORDINAL = ['first', 'second', 'third', 'fourth'];
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** The written value of the argument for parameter `name`, or undefined when it is not written out. */
function written(args, name) {
  const arg = args.find((a) => a.param?.name === name);
  return arg?.literal ? arg.value : undefined;
}
/** An options table's key, written out. */
function option(args, name, key) {
  const arg = args.find((a) => a.param?.name === name);
  const entry = arg?.options?.find((o) => o.name === key);
  return entry?.literal ? entry.value : undefined;
}
/** A byte list written out, as numbers; null when it is not written out or is not bytes. */
function bytesOf(value) {
  if (value === undefined || value === null) return null;
  const read = readBytes(value, { verb: 'value' });
  return Array.isArray(read.meaning?.bytes) ? read.meaning.bytes : null;
}

/* ---------------------------------------------------------------------------- the drawings */

/** to7bit(v, count, order): the number in binary, cut into groups of 7, and the bytes they become. */
function sevenBit(args) {
  const v = written(args, 'v');
  const count = written(args, 'count') ?? 2;
  const given = written(args, 'order') ?? 'msb';
  const order = typeof given === 'string' ? given.trim().toLowerCase() : given;   // in any case, as to7bit reads it
  if (!isWhole(count) || count < 1 || count > 4 || (order !== 'msb' && order !== 'lsb')) return null;
  if (v !== undefined && (!isWhole(v) || v < 0 || v >= 128 ** count)) return null;
  const known = v !== undefined;
  const binary = known ? v.toString(2).padStart(7 * count, '0') : null;
  // High group first, as the number is written; the bytes in the order the call returns them.
  const highFirst = Array.from({ length: count }, (_, i) => {
    const bits = known ? binary.slice(7 * i, 7 * i + 7) : null;
    return { bits, byte: known ? parseInt(bits, 2) : null };
  });
  const out = order === 'msb' ? highFirst : highFirst.slice().reverse();
  return {
    kind: 'sevenBit', value: known ? v : null, count, order, binary,
    groups: highFirst.map((g) => ({ ...g, label: ORDINAL[out.indexOf(g)] })),
    bytes: out.map((g) => ({ ...g, label: ORDINAL[out.indexOf(g)] })),
  };
}

/** bytesRead / bytesWrite / bytesSlice: the message's bytes numbered from 0, the ones taken marked. */
const WINDOW = 12;
function bytesTaken(memberId, args, language) {
  const offset = written(args, 'offset');
  const countWritten = written(args, 'count');
  if (!isWhole(offset) || offset < 0) return null;
  const bits = option(args, 'opts', 'bits') ?? 7;
  const order = option(args, 'opts', 'order') ?? 'msb';
  if ((bits !== 7 && bits !== 8) || (order !== 'msb' && order !== 'lsb')) return null;
  const list = bytesOf(written(args, 'bytes'));
  let count = countWritten;
  if (memberId === 'bytesSlice' && count === undefined) count = list ? Math.max(0, list.length - offset) : null;
  if (!isWhole(count) || count < 1 || (memberId !== 'bytesSlice' && count > 4)) return null;
  const end = offset + count;                     // exclusive
  if (list && end > list.length) return null;     // refused: the runtime's own sentence says so
  // Every byte when the list is short; else a window around the ones taken.
  const length = list ? list.length : end;
  const from = length <= WINDOW ? 0 : Math.max(0, offset - 3);
  const to = length <= WINDOW ? length : Math.min(length, end + 3);
  const cells = [];
  for (let i = from; i < to; i += 1) {
    cells.push({ index: i, hex: list ? hex2(list[i]) : null, field: i >= offset && i < end });
  }
  const out = {
    kind: 'bytes', verb: memberId, offset, count, bits, order, cells,
    before: from > 0, after: to < length, value: null, formula: null, luaIndex: language === 'lua' ? offset + 1 : null,
  };
  if (list && memberId === 'bytesRead') {
    const part = list.slice(offset, end).map((b) => b % 2 ** bits);
    const big = order === 'lsb' ? part.slice().reverse() : part;
    out.value = big.reduce((v, b) => v * 2 ** bits + b, 0);
    if (count > 1) {
      const base = 2 ** bits;
      out.formula = big.map((b, i) => {
        const power = big.length - 1 - i;
        return power === 0 ? String(b) : `${b} × ${power === 1 ? base : `${base}${power === 2 ? '²' : '³'}`}`;
      }).join(' + ');
    }
  }
  return out;
}

/** sendNRPN / sendRPN: the four Control Change messages it sends, as bytes. */
function parameterNumber(memberId, args) {
  const channel = written(args, 'channel');
  const msb = written(args, 'msb');
  const lsb = written(args, 'lsb');
  const value = written(args, 'value');
  const byte = (n) => isWhole(n) && n >= 0 && n <= 127;
  if (!isWhole(channel) || channel < 1 || channel > 16 || !byte(msb) || !byte(lsb)) return null;
  if (!isWhole(value) || value < 0 || value > 16383) return null;
  const [msbCc, lsbCc] = memberId === 'sendRPN' ? [101, 100] : [99, 98];
  const status = 0xB0 + channel - 1;
  const hi = Math.floor(value / 128);
  const lo = value % 128;
  const line = (cc, v, part) => ({ bytes: [status, cc, v].map(hex2), cc, value: v, part });
  return {
    kind: 'messages', verb: memberId, channel, status: hex2(status), value, hi, lo,
    lines: [line(msbCc, msb, 'number'), line(lsbCc, lsb, 'number'), line(6, hi, 'value'), line(38, lo, 'value')],
  };
}

/** checksum: the bytes it adds up and the steps to the checksum, for the 7-bit sums; the result for the rest. */
function checksumSteps(args) {
  const type = written(args, 'type');
  const list = bytesOf(written(args, 'bytes'));
  const algorithm = typeof type === 'string' ? checksumAlgorithm(type) : null;
  if (!algorithm || !list || !list.length) return null;
  const result = algorithm.fn(list, null);
  const shown = list.map(hex2);
  const total = list.reduce((s, b) => s + b, 0);
  let steps = [];
  if (algorithm.id === 'roland-7bit') {
    const rest = total % 128;
    steps = [
      { left: shown.join(' + '), right: `= ${total}` },
      { left: `${total} mod 128`, right: `= ${rest}` },
      { left: `128 − ${rest}`, right: rest === 0 ? '= 128, which is 0 in 7 bits' : `= ${128 - rest}` },
    ];
  } else if (algorithm.id === 'sum-7bit') {
    steps = [{ left: shown.join(' + '), right: `= ${total}` }, { left: `${total} mod 128`, right: `= ${total % 128}` }];
  } else if (algorithm.id === 'xor-7bit') {
    steps = [{ left: shown.join(' xor '), right: `= ${list.reduce((x, b) => x ^ b, 0)}` }];
  }
  return { kind: 'checksum', type: algorithm.id, bytes: shown, steps, result, resultHex: result < 256 ? hex2(result) : result.toString(16).toUpperCase() };
}

/** scale(v, inLo, inHi, outLo, outHi): the two ranges, the value on the first and where it lands. */
function ranges(args) {
  const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : undefined);
  const inLo = num(written(args, 'inLo'));
  const inHi = num(written(args, 'inHi'));
  const outLo = num(written(args, 'outLo'));
  const outHi = num(written(args, 'outHi'));
  if ([inLo, inHi, outLo, outHi].includes(undefined)) return null;
  const v = num(written(args, 'v'));
  let result = null;
  let at = null;                                  // where v is along the first range, 0 to 1
  if (v !== undefined) {
    at = inHi === inLo ? 0 : (v - inLo) / (inHi - inLo);
    result = inHi === inLo ? outLo : outLo + at * (outHi - outLo);
  }
  return {
    kind: 'ranges', from: [inLo, inHi], to: [outLo, outHi], value: v ?? null, result, at,
    outside: at !== null && (at < 0 || at > 1),
  };
}

/** animateStop / animateFinish: the one picture that says how the two differ. */
function stopOrFinish(memberId) {
  return { kind: 'stopOrFinish', verb: memberId === 'animateStop' ? 'stop' : 'finish' };
}

const EXPLAINERS = {
  to7bit: (args) => sevenBit(args),
  bytesRead: (args, language) => bytesTaken('bytesRead', args, language),
  bytesWrite: (args, language) => bytesTaken('bytesWrite', args, language),
  bytesSlice: (args, language) => bytesTaken('bytesSlice', args, language),
  sendNRPN: (args) => parameterNumber('sendNRPN', args),
  sendRPN: (args) => parameterNumber('sendRPN', args),
  checksum: (args) => checksumSteps(args),
  scale: (args) => ranges(args),
  animateStop: () => stopOrFinish('animateStop'),
  animateFinish: () => stopOrFinish('animateFinish'),
};

/** What to draw under a call's rows, or null. getBits and setBits are bitFields.js's. */
export function explainCall(memberId, args, { language = 'lua' } = {}) {
  const make = EXPLAINERS[memberId];
  if (!make) return null;
  try {
    return make(args ?? [], language);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ a function argument's answers */

const FUNCTION_START = /^\s*(?:async\s+)?(?:function\b|def\b|lambda\b|\([^()]*\)\s*(?:=>|->)|[A-Za-z_$][\w$]*\s*=>|\[[^\]]*\]\s*\()/;

/** Whether an argument is a function written in place, rather than one named. */
export function isFunctionLiteral(arg) {
  return FUNCTION_START.test(String(arg?.text ?? ''));
}

const NOTHING = { lua: /^(?:nil)?$/, python: /^(?:None)?$/, javascript: /^(?:undefined|null)?$/ };

/**
 * For a command whose function argument's answer chooses what happens (`returns` in its entry,
 * keyed 'bytes', 'false' or 'nothing'): the lines of the function written in place that give each
 * answer. { false: [81], nothing: [82], bytes: [] }, lines counted from 1, as `lineOf(offset)`
 * counts them; null when the function is named rather than written here.
 */
export function returnLines(arg, lineOf, language = 'lua') {
  if (!isFunctionLiteral(arg)) return null;
  const text = String(arg.text);
  const nothing = NOTHING[language === 'typescript' ? 'javascript' : language] ?? NOTHING.javascript;
  const out = { bytes: [], false: [], nothing: [] };
  const re = /\breturn\b([^\n;]*)/g;
  let m;
  while ((m = re.exec(text))) {
    // What is returned, up to the end of the statement: `end`, `}` or a comment closes it.
    const what = m[1].replace(/\s*(?:--|\/\/|#).*$/, '').replace(/\s*\b(?:end|else|elseif)\b.*$/, '').replace(/[)}\s]+$/, '').trim();
    const key = /^false$/i.test(what) ? 'false' : nothing.test(what) ? 'nothing' : 'bytes';
    const line = lineOf(arg.range.start + m.index);
    if (!out[key].includes(line)) out[key].push(line);
  }
  // A function that ends without a return statement lets the message through: that is "nothing".
  return out;
}

/* --------------------------------------------------------------------------- good to know */

const CHECKS = {
  // panelBatch: code after an await is not part of the batch.
  noAwait(call, args) {
    const fn = args.find((a) => a.param?.name === 'fn');
    if (!fn || !isFunctionLiteral(fn)) return null;
    return /\bawait\b/.test(fn.text)
      ? { mark: 'warn', text: 'This function waits with `await`: code after it is not part of the batch.' }
      : { mark: 'ok', text: 'Nothing in this function waits, so every change is in the batch.' };
  },
  // bytesRead and friends, in Lua: the offset counts from 0, a Lua list from 1.
  luaOffset(call, args, { language }) {
    if (language !== 'lua') return 'skip';
    const offset = written(args, 'offset');
    const list = args.find((a) => a.param?.name === 'bytes');
    if (!isWhole(offset) || offset < 0) return null;
    const named = /^[A-Za-z_][\w.]*$/.test(String(list?.text ?? ''));
    return { mark: 'dot', text: named
      ? `Offsets count from 0, also in Lua: offset ${offset} is ${list.text}[${offset + 1}].`
      : `Offsets count from 0, also in Lua: offset ${offset} is the ${ordinal(offset + 1)} byte.` };
  },
};

/**
 * The "Good to know" lines for a call: the entry's `notes`, each { mark: 'ok' | 'warn' | 'dot',
 * text }. A note that names a check is replaced by the check's line about this script when the
 * check can see the code (✓ or a warning), kept as a general fact (a dot) when it cannot, and left
 * out when the check says it does not apply here (a Lua note in JavaScript).
 */
export function callNotes(member, call, args, { language = 'lua' } = {}) {
  const notes = Array.isArray(member?.notes) ? member.notes : [];
  const out = [];
  for (const note of notes.slice(0, 3)) {
    const text = typeof note === 'string' ? note : note?.text;
    const check = typeof note === 'object' && note?.check ? CHECKS[note.check] : null;
    const said = check ? check(call, args ?? [], { language }) : null;
    if (said === 'skip') continue;
    if (said) out.push(said);
    else if (text) out.push({ mark: 'dot', text });
  }
  return out;
}
