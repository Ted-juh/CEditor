// harvest.js — S2 of the Ctrlr import: the panel's modulators as a CEditor device profile.
//
// A Ctrlr modulator is a named value with a rule for turning it into MIDI bytes; a device-profile
// parameter is the same thing in a richer model. So this is a translation, and the one standard it
// is held to is the BYTES: for every value a control can take, the profile must send what Ctrlr
// sends. test/ctrlrImport.test.js checks that against a port of Ctrlr's own byte-building code
// (CtrlrSysexProcessor, CtrlrUtilities), and `tools/scripts/ctrlr-import.mjs --corpus --verify`
// does it for every parameter of 482 public panels.
//
// WHAT A MODULATOR SAYS, as real panels write it (the first version of this file was written from
// Ctrlr's identifier list alone, and real files proved most of it wrong — design record, "What real
// panels showed"):
//
//   midiMessageType           a NUMBER: 0 CC, 5 SysEx, 6 Multi, 7 Program change, 9 None…
//   modulatorValueExpression  the value on the wire, as a formula of the control's value
//                             (expression.js), or nothing
//   midiMessageSysExFormula   "F0 41 10 00 00 00 1D 12 03 00 06 00 MS LS z6 F7": hex bytes and
//                             Ctrlr's codes for the value (xx, MS LS, ms ls, r1..r4, Q0..Q3), the
//                             channel (yy, 1y), panel variables (k0..), and checksums over the bytes
//                             before them (z6: Roland, w: sum, O: ones' complement, X: XOR, tc)
//   midiMessageMultiList      "CC,ByteValue,MSB7bitValue,99,-2:…": several messages per change
//   a value list              on the component: "Off=0\n1=32\n2=65" — what each row sends
//
// WHAT IS NOT GUESSED. A modulator whose bytes the profile cannot reproduce exactly comes back in
// `flagged` with the reason, and does not become a parameter with a plausible-looking message. A
// profile that quietly sends a wrong byte is worse than one missing a parameter. A modulator with no
// MIDI of its own is not a failure: it is a label, a group, or — on many of the best panels — a
// control whose sending is done by Lua, and the report counts those separately.

import { attr, attrBool, attrNumber } from './xml.js';
import { messageTypeName } from './read.js';
import { compileForwardExpression } from './expression.js';

const MAX_DOMAIN = 65536;
// The longest wire table written into a profile: a formula with branches over 0..4095 at most.
const MAX_TABLE = 4096;
const NO_METHOD = new Set(['', '-- None', '--None', 'None']);

export const slug = (text) => String(text ?? '')
  .trim()
  .replace(/[^A-Za-z0-9]+/g, '.')
  .replace(/^\.+|\.+$/g, '')
  .toLowerCase();

const child = (node, ...names) => (node?.children ?? []).find((c) => names.includes(c.name)) ?? null;
const hex2 = (byte) => byte.toString(16).toUpperCase().padStart(2, '0');

// --- Value lists ---------------------------------------------------------------------------------

/** Which attribute holds a component's value list, by its uiType. */
const LIST_ATTRIBUTE = {
  uicombo: 'uiComboContent',
  uifixedslider: 'uiFixedSliderContent',
  uifixedimageslider: 'uiFixedSliderContent',
  uibutton: 'uiButtonContent',
  uiimagebutton: 'uiImageButtonContent',
  uilistbox: 'uiListBoxContent',
};

function unquote(text) {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && ((trimmed[0] === '"' && trimmed.at(-1) === '"') || (trimmed[0] === "'" && trimmed.at(-1) === "'"))) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

function unquotedEquals(line) {
  let single = false;
  let double = false;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === "'" && !double) single = !single;
    else if (c === '"' && !single) double = !double;
    else if (c === '=' && !single && !double) return i;
  }
  return -1;
}

/** JUCE's String::getIntValue: the leading integer, 0 when there is none. */
const juceInt = (text) => {
  const match = /^\s*([-+]?\d+)/.exec(String(text ?? ''));
  return match ? Number.parseInt(match[1], 10) : 0;
};

/**
 * A value list as Ctrlr reads it (CtrlrValueMap::parseString): one entry per non-empty line, its
 * text before the first unquoted "=" and its number after; a line without "=" sends its LINE
 * number, counted with the empty lines. Lines starting "__" are extra data, not entries. The
 * control's own value is the entry's position in this list.
 */
export function readValueList(text) {
  const lines = String(text ?? '').trim().split('\n');
  const entries = [];
  lines.forEach((raw, line) => {
    const current = raw.trim();
    if (!current || current.startsWith('__')) return;
    const at = unquotedEquals(current);
    if (at >= 0) entries.push({ label: unquote(current.slice(0, at)), value: juceInt(current.slice(at + 1).trim()) });
    else entries.push({ label: unquote(current), value: line });
  });
  return entries;
}

/** The value list a component carries, or []. */
export function componentValueList(component) {
  const key = LIST_ATTRIBUTE[String(attr(component, 'uiType', '')).toLowerCase()];
  return key ? readValueList(attr(component, key, '')) : [];
}

// --- SysEx formulas ------------------------------------------------------------------------------

const VALUE_CODES = new Set(['xx', 'LS', 'MS', 'ls', 'ms', 'r1', 'r2', 'r3', 'r4', 'q0', 'q1', 'q2', 'q3', 'Q0', 'Q1', 'Q2', 'Q3']);

/**
 * One token of a formula, the way CtrlrX identifies it (CtrlrSysexProcessor::sysExIdentifyToken),
 * in the same order — which matters: "1y" is a channel code before anything else is considered.
 */
export function classifySysexToken(token) {
  const t = String(token);
  if (t === 'xx') return { kind: 'value', code: t };
  if (t.length > 1 && t.endsWith('y') && !t.startsWith('y')) return { kind: 'channel4', high: Number.parseInt(t[0], 16) || 0 };
  if (t.startsWith('z')) return { kind: 'checksum', type: 'roland-7bit', span: juceInt(t.slice(1)), code: t };
  if (t.startsWith('O') && /\d/.test(t[1] ?? '')) return { kind: 'checksum', type: 'ones-complement-7bit', span: juceInt(t.slice(1)), code: t };
  if (t.startsWith('w')) return { kind: 'checksum', type: 'sum-7bit', span: juceInt(t.slice(1)), code: t };
  if (t.startsWith('X') && /\d/.test(t[1] ?? '')) return { kind: 'checksum', type: 'xor-7bit', span: juceInt(t.slice(1)), code: t };
  if (t.startsWith('u')) return { kind: 'unsupported', reason: `"${t}" runs a Lua method to make the byte` };
  if (t.startsWith('v')) return { kind: 'unsupported', reason: `"${t}" computes the byte with a formula` };
  if (t === 'yy') return { kind: 'channel' };
  if (VALUE_CODES.has(t)) return { kind: 'value', code: t };
  if (t === 'ii') return { kind: 'unsupported', reason: '"ii" leaves a byte as it was' };
  if (t === 'tp' || t === 'tb') return { kind: 'unsupported', reason: `"${t}" is the panel's current ${t === 'tp' ? 'program' : 'bank'}` };
  if (t === 'tc') return { kind: 'checksum', type: 'xor-7bit', span: -1, code: t };
  if (/^[kpno]/.test(t)) return { kind: 'global', index: juceInt(t.slice(1)) };
  if (/^[0-9A-Fa-f]{1,2}$/.test(t)) return { kind: 'literal', byte: Number.parseInt(t, 16) };
  // Anything else Ctrlr reads as hex anyway (String::getHexValue32: the hex digits in it, the rest
  // ignored), capped at 255 — so "OD" with a letter O is 0D, and that is what the synth has been
  // getting. The same byte, said so; one that is no MIDI data byte is refused.
  const byte = Math.min(255, hexValue32(t));
  if (byte > 127) return { kind: 'unsupported', reason: `"${t}" reads as the byte ${byte}, which is not a MIDI data byte` };
  return { kind: 'literal', byte, note: `"${t}" is read as ${hex2(byte)}, as Ctrlr reads it` };
}

/** JUCE String::getHexValue32: every hex digit in the string, the rest ignored. */
function hexValue32(text) {
  let value = 0;
  for (const c of String(text)) {
    const digit = Number.parseInt(c, 16);
    if (!Number.isNaN(digit)) value = ((value << 4) | digit) >>> 0;
  }
  return value;
}

/**
 * Each run of value codes Ctrlr writes, the encoding that writes the same bytes, and the MASK
 * Ctrlr's code applies to the value first (CtrlrSysexProcessor::sysExProcessToken): LS is
 * `value & 127`, MS LS the low 14 bits, ms ls the low byte's two nibbles. The mask is what makes a
 * negative value come out in two's complement — -1 through MS LS is 7F 7F — so it is applied before
 * the value is fitted. `xx` is `(uint8) value`: a byte, of which only 0-127 is MIDI. The Roland
 * split bytes divide rather than mask, so they have none: a negative value there is refused.
 */
const VALUE_RUNS = {
  xx: { type: 'u7', max: 127, mask: 0xff },
  LS: { type: 'u7', max: 127, mask: 0x7f },
  'MS LS': { type: 'u14', max: 16383, mask: 0x3fff },
  'LS MS': { type: 'u14-lsb-msb', max: 16383, mask: 0x3fff },
  'ms ls': { type: 'nibbled', nibbles: 2, max: 255, mask: 0xff },
  ls: { type: 'u7', max: 15, mask: 0xf },
  r4: { type: 'u7', max: 15 },
  'r3 r4': { type: 'nibbled', nibbles: 2, max: 255 },
  'r2 r3 r4': { type: 'nibbled', nibbles: 3, max: 4095 },
  'r1 r2 r3 r4': { type: 'nibbled', nibbles: 4, max: 65535 },   // Roland split bytes: four nibbles, high first
  'Q0 Q1 Q2 Q3': { type: 'nibbled', nibbles: 4, max: 65535, mask: 0xffff },
};

/**
 * A SysEx formula as a recipe template: `{ ok, template, encoding, address, checksum, variables,
 * notes }`, or `{ ok: false, reason }`.
 *
 * A checksum in a device profile covers the parameter's address and value — never the template's
 * literal bytes. So the literal bytes a Ctrlr checksum covers become the parameter's ADDRESS, and
 * the template reads [header…, $address, $encodedValue, $checksum, F7]: exactly the shape of a
 * Roland DT1, which is what most of these are. A channel or panel-variable code inside the covered
 * span is written in at the panel's value, and said so.
 *
 * `ctx`: { channel (1-16), channelFixed (the message names its own channel), globals (panel
 * variables) }.
 */
export function readSysexFormula(formula, ctx = {}) {
  const text = String(formula ?? '').trim().replace(/[\r\n\t]+/g, ' ');
  if (!text) return { ok: false, reason: 'the SysEx formula is empty' };
  // Split as JUCE's StringArray::addTokens does, KEEPING an empty token between two separators: Ctrlr
  // sends it as a 00 byte. A doubled space inside a formula is therefore a byte of the message, and
  // the profile sends it too (said so) — the same bytes Ctrlr sends, whatever was meant.
  const tokens = text.split(/[ :;]/).map((t) => (t === ''
    ? { text: t, kind: 'literal', byte: 0, note: 'a doubled space in the formula is a 00 byte, as Ctrlr sends it' }
    : { text: t, ...classifySysexToken(t) }));
  const bad = tokens.find((t) => t.kind === 'unsupported');
  if (bad) return { ok: false, reason: bad.reason };
  const readNotes = tokens.filter((t) => t.note).map((t) => t.note);

  const channel = Math.min(16, Math.max(1, Number(ctx.channel) || 1));
  const globals = Array.isArray(ctx.globals) ? ctx.globals : [];
  const variables = {};
  const notes = [...readNotes];
  const globalValue = (index) => {
    const value = globals[index];
    return Number.isInteger(value) && value >= 0 && value <= 127 ? value : null;
  };

  // The value: one run of value codes.
  const valueAt = tokens.map((t, i) => (t.kind === 'value' ? i : -1)).filter((i) => i >= 0);
  if (valueAt.length && valueAt.at(-1) - valueAt[0] !== valueAt.length - 1) {
    return {
      ok: false,
      reason: `the value is split around other bytes (${valueAt.map((i) => tokens[i].code).join(' … ')}), which a recipe cannot write`
        + (tokens.some((t) => t.kind === 'literal' && t.byte > 0x7f) ? ' — it is a channel message written inside a SysEx formula' : ''),
    };
  }
  const run = valueAt.map((i) => tokens[i].code).join(' ');
  const encoding = valueAt.length ? VALUE_RUNS[run] : null;
  if (valueAt.length && !encoding) {
    return {
      ok: false,
      reason: /q\d/.test(run)
        ? `the value is written low nibble first (${run}), which a device profile cannot write yet`
        : `the value is written as "${run}", which a device profile cannot write`,
    };
  }

  const checksums = tokens.map((t, i) => (t.kind === 'checksum' ? i : -1)).filter((i) => i >= 0);
  if (checksums.length > 1) return { ok: false, reason: 'the message has more than one checksum' };

  // A channel or variable code as a template token, or as a literal byte when it must be fixed.
  const channelByte = channel - 1;
  const asLiteral = (t) => {
    if (t.kind === 'literal') return t.byte;
    if (t.kind === 'channel') return channelByte;
    if (t.kind === 'channel4') return ((t.high & 7) << 4) | channelByte;
    if (t.kind === 'global') return globalValue(t.index);
    return null;
  };
  const asToken = (t) => {
    if (t.kind === 'literal') return hex2(t.byte);
    if (t.kind === 'channel' || t.kind === 'channel4') {
      if (ctx.channelFixed) return hex2(asLiteral(t));
      const name = t.kind === 'channel' ? 'ctrlrChannel' : `ctrlrChannel${t.high & 7}`;
      variables[name] = asLiteral(t);
      return `$${name}`;
    }
    if (t.kind === 'global') {
      const value = globalValue(t.index);
      if (value === null) return null;
      variables[`ctrlrGlobal${t.index}`] = value;
      return `$ctrlrGlobal${t.index}`;
    }
    return null;
  };

  let template = [];
  let address = [];
  let checksum = null;

  if (!checksums.length) {
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (t.kind === 'value') {
        if (i === valueAt[0]) template.push('$encodedValue');
        continue;
      }
      const token = asToken(t);
      if (token === null) return { ok: false, reason: `panel variable ${t.text} has no value in the panel` };
      template.push(token);
    }
  } else {
    const at = checksums[0];
    const sum = tokens[at];
    const start = sum.span < 0 ? 1 : at - sum.span;   // tc: everything after F0
    if (sum.span === 0 || start < 1) return { ok: false, reason: `the checksum ${sum.code} covers bytes before the message starts` };
    if (valueAt.length && (valueAt[0] < start || valueAt[0] > at)) {
      return { ok: false, reason: `the value is outside what the checksum ${sum.code} covers, and a device profile always counts the value` };
    }

    // Inside the span: literal bytes (the address) and the value, in one of the two orders the
    // template can say — address then value, or value then address.
    const shape = [];
    for (let i = start; i < at; i += 1) {
      const t = tokens[i];
      if (t.kind === 'value') {
        if (shape.at(-1) !== 'V') shape.push('V');
        continue;
      }
      const byte = asLiteral(t);
      if (byte === null) return { ok: false, reason: `panel variable ${t.text} has no value in the panel` };
      if (t.kind !== 'literal') notes.push(`${t.text} is inside the checksum, so it is written in as ${hex2(byte)} (channel ${channel}${t.kind === 'global' ? `, variable ${t.text}` : ''})`);
      address.push(byte);
      if (shape.at(-1) !== 'L') shape.push('L');
    }
    const pattern = shape.join('');
    if (!['L', 'V', 'LV', 'VL'].includes(pattern)) {
      return { ok: false, reason: `the checksum ${sum.code} covers bytes on both sides of the value` };
    }

    for (let i = 0; i < start; i += 1) {
      const token = asToken(tokens[i]);
      if (token === null) return { ok: false, reason: `panel variable ${tokens[i].text} has no value in the panel` };
      template.push(token);
    }
    for (const part of pattern) template.push(part === 'L' ? '$address' : '$encodedValue');
    template.push('$checksum');
    for (let i = at + 1; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (t.kind === 'value') return { ok: false, reason: 'the value comes after the checksum' };
      const token = asToken(t);
      if (token === null) return { ok: false, reason: `panel variable ${t.text} has no value in the panel` };
      template.push(token);
    }
    checksum = { type: sum.type };
  }

  if (template[0] !== 'F0' || template.at(-1) !== 'F7') {
    return { ok: false, reason: 'the SysEx formula does not start with F0 and end with F7' };
  }
  const inside = [...template.slice(1, -1).filter((t) => /^[0-9A-F]{2}$/.test(t)).map((t) => Number.parseInt(t, 16)), ...address];
  const high = inside.find((byte) => byte > 0x7f);
  if (high !== undefined) {
    return {
      ok: false,
      reason: `the formula has the byte ${hex2(high)} inside the SysEx, which is not a MIDI data byte`
        + (high >= 0x80 && high <= 0xef ? ' — it is a channel message written inside a SysEx formula' : ''),
    };
  }
  return {
    ok: true,
    template,
    encoding: encoding ?? null,
    address: address.length ? address.map(hex2).join(' ') : '',
    checksum,
    variables,
    notes,
  };
}

// --- Multi messages ------------------------------------------------------------------------------

const VALUE_OPS = {
  ByteValue: 'whole', Direct: 'whole', Default: 'whole', '': 'whole',
  MSB7bitValue: 'msb7', LSB7bitValue: 'lsb7', MSB4bitValue: 'msb4', LSB4bitValue: 'lsb4',
};
const applyOp = (op, value) => (op === 'msb7' ? (value & 0x3fff) >> 7
  : op === 'lsb7' ? value & 0x7f : op === 'msb4' ? (value >> 4) & 0xf : op === 'lsb4' ? value & 0xf : value);

/**
 * A Multi list as messages: `{ ok, recipe, encoding }` or `{ ok: false, reason }`.
 *
 * Each part is "type,numberOp,valueOp,number,value" (midiMessageExfromString): a number of -2 is the
 * component's own number, a value of -1 the control's value and -2 the number, anything else a
 * fixed byte; the value op takes the low or high 7 bits (or 4). An NRPN spelled as four CCs becomes
 * an NRPN recipe; any other run of CCs a CC sequence.
 */
export function readMultiList(list, { number = 0, channel = '$channel' } = {}) {
  const parts = String(list ?? '').split(':').map((part) => part.trim()).filter(Boolean)
    .map((part) => part.split(',').map((field) => field.trim()));
  if (!parts.length) return { ok: false, reason: 'the Multi message lists no messages' };
  const steps = [];
  for (const fields of parts) {
    const [type, , valueOpName = ''] = fields;
    if (type !== 'CC') {
      return { ok: false, reason: type === 'SysEx' ? 'the Multi message sends several SysEx messages' : `the Multi message includes a ${type || 'blank'} message` };
    }
    const op = VALUE_OPS[valueOpName];
    if (!op) return { ok: false, reason: `the Multi message uses "${valueOpName}", which has no profile form yet` };
    const numberField = fields[3] ?? '-2';
    const controller = numberField.includes('-2-32') ? number - 32 : juceInt(numberField) === -2 ? number : juceInt(numberField);
    if (!Number.isInteger(controller) || controller < 0 || controller > 127) return { ok: false, reason: `the Multi message's controller ${controller} is not 0-127` };
    const valueField = juceInt(fields[4] ?? '-1');
    if (valueField === -1) steps.push({ controller, op });
    else steps.push({ controller, constant: applyOp(op, valueField === -2 ? number : valueField) });
  }
  for (const step of steps) {
    if (step.constant !== undefined && (step.constant < 0 || step.constant > 127)) {
      return { ok: false, reason: `the Multi message sends ${step.constant}, which is not a MIDI data byte` };
    }
  }

  const ops = new Set(steps.filter((s) => s.op).map((s) => s.op));
  if ([...ops].some((op) => op === 'msb4' || op === 'lsb4')) return { ok: false, reason: 'the Multi message splits the value into nibbles across CCs' };
  if (ops.has('whole') && ops.size > 1) return { ok: false, reason: 'the Multi message sends the value both whole and split' };
  // juce::MidiMessage::controllerEvent masks with 127, so a whole value is its low 7 bits, and the
  // MSB/LSB pair carries the low 14.
  const encoding = ops.has('msb7') || ops.has('lsb7') ? { type: 'u14', max: 16383, mask: 0x3fff } : { type: 'u7', max: 127, mask: 0x7f };
  const isU14 = encoding.type === 'u14';

  // An NRPN (or RPN) the engine's own recipe sends byte for byte.
  const shape = steps.map((s) => (s.op ? `${s.controller}:${s.op}` : `${s.controller}=`)).join(' ');
  const select = /^(99|101)= (98|100)= /.exec(shape);
  if (select && Number(select[1]) - Number(select[2]) === 1) {
    const kind = select[1] === '99' ? 'nrpn' : 'rpn';
    const rest = shape.slice(select[0].length);
    const resolution = rest === '6:msb7 38:lsb7' ? 14 : (rest === '6:whole' || rest === '6:lsb7') ? 7 : 0;
    if (resolution) {
      return {
        ok: true,
        encoding: resolution === 14 ? encoding : { type: 'u7', max: 127, mask: 0x7f },
        recipe: { kind, channel, parameterMsb: steps[0].constant, parameterLsb: steps[1].constant, valueResolution: resolution, value: '$encodedValue', nullAfterSend: false },
      };
    }
  }

  return {
    ok: true,
    encoding,
    recipe: {
      kind: 'ccSequence',
      channel,
      messages: steps.map((s) => ({
        controller: s.controller,
        value: s.op ? (isU14 ? (s.op === 'msb7' ? '$byte0' : '$byte1') : '$byte0') : s.constant,
      })),
    },
  };
}

// --- Representing the value ----------------------------------------------------------------------

/**
 * The encoding.transform that turns every value of the domain into exactly its wire value, or null.
 * Linear on each side of zero (Ctrlr's "lt(modulatorValue, 0, …)" forms split there), checked on
 * EVERY value with the truncation Ctrlr applies — a fit that is right at the ends and wrong in the
 * middle is not a fit.
 */
export function fitTransform(domain, wires, raw) {
  const sides = [domain.filter((v) => v >= 0), domain.filter((v) => v < 0)];
  const line = (values) => {
    if (!values.length) return null;
    const a = values[0];
    const b = values.length > 1 ? values[1] : null;
    let scale;
    let offset;
    try {
      if (b === null) { scale = 1; offset = raw(a) - a; } else { scale = (raw(b) - raw(a)) / (b - a); offset = raw(a) - scale * a; }
    } catch {
      return null;
    }
    return Number.isFinite(scale) && Number.isFinite(offset) ? { scale, offset } : null;
  };
  const positive = line(sides[0]);
  const negative = line(sides[1]);
  const transform = {};
  const pos = positive ?? negative;
  if (!pos) return null;
  if (pos.scale !== 1) transform.scale = pos.scale;
  if (pos.offset !== 0) transform.offset = pos.offset;
  if (positive && negative && (negative.scale !== positive.scale || negative.offset !== positive.offset)) {
    if (negative.scale !== positive.scale) transform.negativeScale = negative.scale;
    transform.negativeOffset = negative.offset;
  }
  const wireOf = (v) => {
    const useNegative = v < 0 && (transform.negativeScale !== undefined || transform.negativeOffset !== undefined);
    const scale = useNegative ? (transform.negativeScale ?? transform.scale ?? 1) : (transform.scale ?? 1);
    const offset = useNegative ? (transform.negativeOffset ?? transform.offset ?? 0) : (transform.offset ?? 0);
    return Math.trunc(scale * v + offset);
  };
  for (let i = 0; i < domain.length; i += 1) if (wireOf(domain[i]) !== wires[i]) return null;
  return transform;
}

/**
 * What a modulator becomes, given its domain, the wire value of each, and what the message can
 * carry: `{ ok, fields }` (the parameter's type, range or choices, encoding, display, default) or a
 * reason. In order of preference, every one EXACT for every value the control can take:
 *
 *   a value list   choices, for a combo box or list box on one byte; otherwise its positions with a
 *                  wire table (encoding.table) and the list's words as the readout (display.table)
 *   no formula     the value itself
 *   a formula      a transform (encoding.transform), checked on every value; else a wire table
 *
 * `wireAt(v)` is the wire value of any integer v, for a table over a range with steps in it.
 */
function representValue({ domain, wires, wireAt, list, encoding, expression, defaultValue, fixed, masked, uiType }) {
  const encodingOut = encoding ? { type: encoding.type, ...(encoding.nibbles ? { nibbles: encoding.nibbles } : {}) } : { type: 'u7' };
  const max = encoding?.max ?? 127;
  const fits = (wire) => Number.isInteger(wire) && wire >= 0 && wire <= max;
  const table = (v) => wires[domain.indexOf(v)];
  const withTransform = (transform) => ({ ...encodingOut, ...(Object.keys(transform).length ? { transform } : {}) });

  // A message that does not carry the value at all (a button that sends a fixed message).
  if (fixed) {
    return {
      ok: true,
      fields: { type: 'integer', range: { min: domain[0], max: domain.at(-1) }, default: defaultValue, encoding: { type: 'u7', transform: { scale: 0 } } },
    };
  }

  if (list.length) {
    const over = wires.find((w) => !fits(w));
    if (over !== undefined) return { ok: false, reason: `a row of its list would send ${over}, which the message can only carry as 0-${max}` };
    const labels = list.map((entry) => entry.label || String(entry.value));
    if ((uiType === 'uicombo' || uiType === 'uilistbox') && encodingOut.type === 'u7') {
      const used = new Set();
      const choices = list.map((entry, index) => {
        let id = slug(entry.label) || `v${index}`;
        while (used.has(id)) id = `${id}.${index}`;
        used.add(id);
        return { id, label: labels[index], value: wires[index] };
      });
      const index = Math.min(choices.length - 1, Math.max(0, Math.round(defaultValue)));
      return { ok: true, fields: { type: 'choice', choices, default: choices[index]?.id ?? choices[0].id, encoding: encodingOut } };
    }
    // Any other control (a fixed slider, a button, a filmstrip) moves through the list's positions.
    const plain = wires.every((w, i) => w === i);
    const transform = plain ? {} : fitTransform(domain, wires, table);
    return {
      ok: true,
      fields: {
        type: 'integer',
        range: { min: 0, max: list.length - 1 },
        default: defaultValue,
        encoding: transform ? withTransform(transform) : { ...encodingOut, table: wires },
        display: { table: labels },
      },
    };
  }

  const over = wires.find((w) => !fits(w));
  if (over !== undefined) return { ok: false, reason: `it sends ${over}, which the message can only carry as 0-${max}` };
  const range = { min: domain[0], max: domain.at(-1) };
  if (expression.identity && !masked) return { ok: true, fields: { type: 'integer', range, default: defaultValue, encoding: encodingOut } };

  // Fitted to the formula's exact result where the wire is that result, and to the wire table
  // where Ctrlr's mask has folded it (two's complement).
  const transform = fitTransform(domain, wires, masked ? table : expression.raw) ?? fitTransform(domain, wires, table);
  if (transform) return { ok: true, fields: { type: 'integer', range, default: defaultValue, encoding: withTransform(transform) } };

  // Any other formula: the wire value of every integer in the range, written out.
  const size = range.max - range.min + 1;
  if (size <= MAX_TABLE) {
    const entries = [];
    let last = wires[0];
    for (let v = range.min; v <= range.max; v += 1) {
      let wire;
      try { wire = wireAt(v); } catch { wire = NaN; }
      // Between a stepped control's steps: never sent, so any byte that fits will do.
      if (!fits(wire)) wire = last;
      entries.push(wire);
      last = wire;
    }
    if (domain.every((v, i) => entries[v - range.min] === wires[i])) {
      return { ok: true, fields: { type: 'integer', range, default: defaultValue, encoding: { ...encodingOut, table: entries } } };
    }
  }
  return { ok: false, reason: `the value formula "${expression.source}" follows no rule a profile can state for a range this wide` };
}

// --- One modulator --------------------------------------------------------------------------------

/**
 * One `<modulator>` → `{ ok, parameter, recipe }`, or `{ ok: false, flag }` with the reason, or
 * `{ ok: false, none: true, lua }` for a modulator that sends nothing of its own.
 *
 * `ctx`: { group, panel (read.js details: outputChannel, globals) }.
 */
export function harvestModulator(node, ctx = {}) {
  // Ctrlr allows a modulator with no name, and real panels have controls like that (a Korg
  // Prophecy's sliders): such a one is numbered rather than refused.
  const name = attr(node, 'name') || attr(node, 'modulatorName') || `unnamed ${(ctx.index ?? 0) + 1}`;
  const component = child(node, 'component', 'uiComponent');
  const midi = child(node, 'midi') ?? node;
  const label = attr(component, 'componentVisibleName') || attr(component, 'uiLabelText') || name;
  const id = slug(name) || `modulator.${(ctx.index ?? 0) + 1}`;
  const flag = (reason) => ({ ok: false, flag: { id, name: label || name, reason } });

  const rawType = attr(midi, 'midiMessageType', '');
  const type = messageTypeName(rawType);
  const lua = !NO_METHOD.has(attr(node, 'luaModulatorValueChange', '').trim());
  if (type === 'None' || type === '') {
    if (type === '' && rawType) return flag(`message type "${rawType}" is not one Ctrlr knows`);
    return { ok: false, none: true, lua, id, name: label };
  }
  if (!['CC', 'SysEx', 'Multi'].includes(type)) {
    return flag(type === 'ProgramChange' ? 'a program change selects a patch; it is not a parameter value'
      : `a ${type} message is not a parameter value`);
  }
  // A SysEx or Multi message with nothing in it sends nothing: the control is a display, or its
  // sending is done by Lua. Not a failure to convert.
  if ((type === 'SysEx' && !attr(midi, 'midiMessageSysExFormula', '').trim())
      || (type === 'Multi' && !attr(midi, 'midiMessageMultiList', '').trim())) {
    return { ok: false, none: true, lua, id, name: label };
  }
  const valueHook = attr(node, 'luaModulatorGetValueForMIDI', '').trim();
  if (!NO_METHOD.has(valueHook)) return flag(`the Lua method "${valueHook}" computes the value it sends`);

  // The control's values: a list's positions, or the modulator's range.
  const list = componentValueList(component);
  let domain;
  let step = 1;
  if (list.length) {
    domain = list.map((_, index) => index);
  } else {
    const min = attrNumber(node, 'modulatorMin', 0);
    const max = attrNumber(node, 'modulatorMax', 127);
    if (max < min) return flag(`its range ${min}..${max} is empty`);
    if (!Number.isInteger(min) || !Number.isInteger(max)) return flag(`its range ${min}..${max} is not whole numbers`);
    if (max - min + 1 > MAX_DOMAIN) return flag(`its range ${min}..${max} is wider than 16 bits`);
    // A slider that moves in steps (uiSliderInterval 4, 16, 32 on a JX-8P) takes only those values;
    // the control is given the same step (buildPanel.js), and the profile is fitted to exactly them.
    step = Math.abs(attrNumber(component, 'uiSliderInterval', 1)) || 1;
    if (!Number.isInteger(step)) return flag(`it moves in steps of ${step}, not whole numbers`);
    domain = [];
    for (let v = min; v <= max; v += step) domain.push(v);
  }

  const source = attr(node, 'modulatorValueExpression', '').trim();
  const compiled = compileForwardExpression(source, { min: domain[0], max: domain.at(-1) });
  if (!compiled.ok) return flag(compiled.error);
  // `raw` is the formula's result before Ctrlr cuts it to an integer, which a transform is fitted to.
  const expression = { identity: compiled.identity, source, raw: compiled.rawValue };
  let wires;
  try {
    wires = domain.map((v) => (list.length && compiled.identity ? list[v].value : compiled.forward(v)));
  } catch (error) {
    return flag(error.message);
  }
  const rawValue = attrNumber(node, 'modulatorValue', domain[0]);
  const defaultValue = Math.min(domain.at(-1), Math.max(domain[0], Math.round(rawValue)));

  const fixedChannel = attrBool(midi, 'midiMessageChannelOverride', false);
  const channelNumber = fixedChannel ? Math.min(16, Math.max(1, attrNumber(midi, 'midiMessageChannel', 1))) : (ctx.panel?.outputChannel ?? 1);
  const channel = fixedChannel ? channelNumber : '$channel';
  const number = attrNumber(midi, 'midiMessageCtrlrNumber', -1);

  let recipe;
  let encoding;
  let address = '';
  let variables = {};
  let notes = [];
  let fixed = false;
  if (type === 'CC') {
    if (!Number.isInteger(number) || number < 0 || number > 127) return flag(`CC number ${number} is not 0-127`);
    recipe = { kind: 'cc', channel, controller: number, value: '$encodedValue' };
    // juce::MidiMessage::controllerEvent: value & 127. A negative value goes out as its low 7 bits.
    encoding = { type: 'u7', max: 127, mask: 0x7f };
  } else if (type === 'SysEx') {
    const sysex = readSysexFormula(attr(midi, 'midiMessageSysExFormula', ''), { channel: channelNumber, channelFixed: fixedChannel, globals: ctx.panel?.globals });
    if (!sysex.ok) return flag(sysex.reason);
    recipe = { kind: 'sysex', template: sysex.template, ...(sysex.checksum ? { checksum: sysex.checksum } : {}) };
    encoding = sysex.encoding;
    fixed = !encoding;
    address = sysex.address;
    variables = sysex.variables;
    notes = sysex.notes;
  } else {
    const multi = readMultiList(attr(midi, 'midiMessageMultiList', ''), { number, channel });
    if (!multi.ok) return flag(multi.reason);
    recipe = multi.recipe;
    encoding = multi.encoding;
  }

  // What Ctrlr's own code does to the value on its way into the message (VALUE_RUNS, the CC mask).
  const mask = (w) => (encoding?.mask !== undefined ? w & encoding.mask : w);
  const masked = encoding?.mask !== undefined ? wires.map(mask) : wires;
  const wireAt = (v) => mask(list.length && compiled.identity ? list[v].value : compiled.forward(v));
  const uiType = String(attr(component, 'uiType', '')).toLowerCase();
  const value = representValue({ domain, wires: masked, wireAt, list, encoding, expression, defaultValue, fixed, masked: masked !== wires, uiType });
  if (!value.ok) return flag(value.reason);

  const parameter = {
    id,
    name: label,
    group: ctx.group ?? 'Imported',
    ...value.fields,
    ...(address ? { address } : {}),
    display: { mode: value.fields.type === 'choice' ? 'choice' : 'number', shortLabel: label, ...(value.fields.display ?? {}) },
    normalization: { mode: 'linear' },
    access: { canRead: type === 'CC', canWrite: true, realtimeSafe: true, source: 'singleParameter' },
    sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true },
    ui: { preferredComponent: value.fields.type === 'choice' ? 'Combobox' : 'Knob', ...(step !== 1 ? { step } : {}) },
    ...(type === 'CC' ? { inbound: [{ kind: 'cc', controller: number }] } : {}),
    // Kept so a human reading the profile can find the modulator it came from. The engine ignores it.
    ctrlr: {
      modulator: name,
      messageType: type,
      ...(source && !compiled.identity ? { valueExpression: source } : {}),
      vstIndex: attrNumber(node, 'vstIndex', -1),
      vstExported: attrBool(node, 'modulatorVstExported', false),
      ...(notes.length ? { notes } : {}),
    },
  };
  return { ok: true, parameter, recipe, variables, notes };
}

// --- The whole panel ---------------------------------------------------------------------------------

function recipeKey(recipe) {
  return JSON.stringify(recipe);
}

function recipeIdFor(recipe, taken) {
  const base = recipe.kind === 'cc' ? `cc${recipe.controller}${typeof recipe.channel === 'number' ? `.ch${recipe.channel}` : ''}`
    : recipe.kind === 'nrpn' || recipe.kind === 'rpn'
      ? `${recipe.kind}${(recipe.parameterMsb << 7) | recipe.parameterLsb}x${recipe.valueResolution}`
      : recipe.kind === 'ccSequence' ? `ccseq.${recipe.messages.map((m) => m.controller).join('.')}`
        : 'sysex';
  let id = recipe.kind === 'sysex' ? `${base}.1` : base;
  let n = 2;
  while (taken.has(id)) { id = `${base}.${n}`; n += 1; }
  return id;
}

/**
 * A whole panel → a `.ceditor-device` profile, plus a report.
 *
 * Marked `status: 'imported'` and `trust: 'local'`: it is a transcription of somebody else's
 * transcription and has never been near the instrument.
 */
export function harvestProfile(read, { id = '', group = 'Imported' } = {}) {
  if (!read?.ok) return { ok: false, error: read?.error ?? 'The panel could not be read.' };

  const modulators = [];
  const collect = (node) => {
    for (const c of node.children ?? []) {
      if (c.name === 'modulator') modulators.push(c);
      collect(c);
    }
  };
  collect(read.root);

  const parameters = [];
  const flagged = [];
  const sendsFromLua = [];
  let silent = 0;
  const seen = new Set();
  const recipes = new Map();      // content key → recipe with id
  const takenRecipeIds = new Set();
  const variables = {};
  const notes = [];

  // Which parameter each modulator became, for the rebuild to bind its control to (reconstruct.js).
  const parameterIdOf = new Map();
  for (const [index, node] of modulators.entries()) {
    const result = harvestModulator(node, { group, panel: read.panel, index });
    if (!result.ok) {
      if (result.none) {
        if (result.lua) sendsFromLua.push(result.name || result.id);
        else silent += 1;
      } else {
        flagged.push(result.flag);
      }
      continue;
    }
    const key = recipeKey(result.recipe);
    if (!recipes.has(key)) {
      const recipeId = recipeIdFor(result.recipe, takenRecipeIds);
      takenRecipeIds.add(recipeId);
      recipes.set(key, { id: recipeId, ...result.recipe });
    }
    Object.assign(variables, result.variables);
    for (const note of result.notes) notes.push(`${result.parameter.name}: ${note}`);
    // Ctrlr does not require unique modulator names; the profile requires unique parameter ids.
    let unique = result.parameter.id || 'modulator';
    let n = 2;
    while (seen.has(unique)) { unique = `${result.parameter.id}.${n}`; n += 1; }
    seen.add(unique);
    parameterIdOf.set(node, unique);
    parameters.push({ ...result.parameter, id: unique, messageRecipe: recipes.get(key).id });
  }

  const panelName = read.panel.name || 'Imported panel';
  const profileId = id || `ctrlr.${slug(read.panel.instrument || panelName) || 'panel'}`;
  const sending = parameters.length + flagged.length;

  return {
    ok: true,
    profile: {
      schemaVersion: 1,
      profileVersion: '0.1.0',
      minCEditorVersion: '0.2.0',
      id: profileId,
      name: `${panelName} (imported)`,
      manufacturer: read.panel.manufacturer || '',
      family: read.panel.instrument || '',
      status: 'imported',
      trust: 'local',
      ctrlrSource: { panelName, author: read.panel.author, version: read.panel.version },
      variables: { deviceId: 16, channel: read.panel.outputChannel ?? 1, ...variables },
      timing: { minDelayBetweenMessagesMs: 10 },
      parameters,
      messageRecipes: [...recipes.values()],
    },
    parameterIdOf,
    report: {
      modulators: modulators.length,
      sending,
      converted: parameters.length,
      flagged,
      sendsFromLua,
      silent,
      notes,
      // How much of what the panel sends needs a human. Reported per panel so a corpus run can total it.
      coverage: sending ? parameters.length / sending : 0,
    },
  };
}
