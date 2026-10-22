// deviceDefinitions.js — the parameters and dump layouts a SCRIPT declares at runtime.
//
// Everything ce.device could reach until now came out of a device profile the app was SHIPPED with.
// That is the right default and it is also a hard ceiling: a panel can only address a synth
// somebody already wrote a profile for, which excludes most of what is actually in people's racks.
//
// A definition made here is SELF-ENCODING. The spec carries its own wire format — a CC number, an
// NRPN pair, a SysEx template, a dump layout — so nothing in the path needs a profile to exist.
// That is the whole point: `ce.device.defineParameter` plus `onPanelBuild` is a panel that wires
// itself to a synth nobody wrote a profile for.
//
// WHAT IS REUSED AND WHAT IS NOT, because the split is deliberate:
//   • DECODING a dump reuses the local engine (localParseDumpMessage) verbatim, by handing it a
//     synthetic profile built from these definitions. That codec already handles u7/u14/nibbled/
//     ASCII values and every checksum in utils/checksums.js, and a second decoder would drift.
//   • ENCODING a parameter is done here rather than through localCompileParameter, for one reason:
//     that function's `$checksum` token is a plain clamped sum. For a profile authored in the
//     editor that is only ever a preview, but a script-defined parameter is the REAL send, and a
//     Roland two's-complement checksum written as a plain sum is a message the synth rejects
//     silently. The verb exists for old and obscure hardware, which is exactly the hardware that
//     checksums, so it computes the checksum the device documents, from the same table
//     ce.midi.checksum answers from.
//
// WHAT IS REFUSED. A definition is checked when it is made, and one that is wrong in any way is
// refused with a console message and not defined at all. These parsers used to clamp, drop and
// guess: "F07D00F7" as a request went out as FF, which is System Reset; a token they could not read
// vanished; 300 became 255; a template's 0x41 was read back as hex 65; an unknown checksum,
// encoding, type or $token quietly became Roland, u7, a number or 00. Each was a message the synth
// ignored or misread, with nothing on the console. ScriptRuntime.cpp is the player's twin and
// refuses the same things in the same words; the two suites pin them against each other.
//
// Definitions are SCRIPT-LIFETIME, like drawings and animations: they live in the runtime, not in
// the panel document. A panel that wants them on every load declares them from onPanelBuild, which
// is what makes the build idempotent (§13) — and it means a definition can never be half-saved
// into the author's file.

import {
  localBuildDumpMessage, localParseDumpMessage, parseRawMidiHexText,
} from '../stores/deviceProfileLocalEngine.js';
import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';
import { checksumAlgorithm, checksumBytes, checksumNames } from '../utils/checksums.js';

/** role -> { parameters: Map<id, entry>, dumps: Map<kind, entry>, profile: object|null } */
const byRole = new Map();

function slot(role) {
  const key = String(role || DEFAULT_DEVICE_ROLE);
  if (!byRole.has(key)) byRole.set(key, { parameters: new Map(), dumps: new Map(), profile: null });
  return byRole.get(key);
}

/** Any write invalidates the synthetic profile the decoder is handed. */
function invalidate(entry) { entry.profile = null; }

/* ------------------------------------------------------------------------- what went wrong */
// Every refusal reads "<call>: <what was wrong>, so <what did not happen>." with any advice after
// it, the shape this file's messages already had. ScriptRuntime.cpp builds the same sentences.

const PARAMETER_REFUSED = 'the parameter was not defined';
const DUMP_REFUSED = 'the dump was not defined';
const NOT_SENT = 'nothing was sent';

const refusal = (call, what, outcome, advice = '') => ({
  ok: false, error: `${call}: ${what}, so ${outcome}.${advice ? ` ${advice}` : ''}`,
});

/**
 * Lists and objects as the player sees them, so both runtimes call a value the same thing. wasmoon
 * hands a Lua sequence over as an array, but a table with a hole as an object keyed "1", "3"…, which
 * the player's Lua bridge turns into a list by counting the keys and reading that many from 1: so
 * {0xF0, nil, 0x41} is [F0, nothing] there, and here. An empty table is an object in the player and
 * reads as an empty list wherever a list is wanted, in both.
 */
function isList(value) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return true;
  if (!value || typeof value !== 'object') return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => /^[1-9][0-9]*$/.test(k));
}
const isObject = (value) => !!value && typeof value === 'object' && !isList(value);

/** The items of a list however the language spelled it, or null when the value is not one. */
function listOf(value) {
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (isList(value)) return Object.keys(value).map((_, i) => value[i + 1]);
  return isObject(value) && Object.keys(value).length === 0 ? [] : null;
}

/** A value as a message shows it: a number as the script wrote it, text in double quotes, and
 *  nil, undefined or None as "nothing". The player's shownValue gives the same words. */
function shown(value) {
  if (value === undefined || value === null) return 'nothing';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'function') return 'a function';
  return isList(value) ? 'a list' : 'an object';
}

/** "a", "a and b", "a, b and c". */
function listWords(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const isWhole = (v) => typeof v === 'number' && Number.isInteger(v);

/* ---------------------------------------------------------------------- bytes, by one rule */
// The rule every send reads hex text by (scriptBytes in panelRuntime.js, BridgeScriptHost.h), and
// the same words. Text: a token is one byte, one or two hex digits in any case with or without 0x,
// and tokens are separated by spaces, tabs, line breaks or commas and nothing else. A list: each
// item is a whole number from 0 to 255, or text that is one such token, so ["F0", "41"] is F0 41.

const SEPARATORS = /[ \t\r\n\f\v,]+/;
const HEX_BYTE = /^(0x)?[0-9a-f]{1,2}$/i;
const tokensOf = (text) => text.split(SEPARATORS).filter(Boolean);
const byteOf = (token) => parseInt(token.replace(/^0x/i, ''), 16);

/** notOneByte's advice, word for word. */
function oneByteAdvice(token) {
  return /^[0-9a-f]+$/i.test(token) && token.length % 2 === 0
    ? `Put a space between the bytes: "${token.match(/../g).join(' ')}".`
    : 'Each byte is one or two hex digits, with spaces between the bytes: "F0 41 10 F7".';
}

/**
 * The bytes a definition was given. `{ items }` — each `{ byte }`, or `{ token }` for a `$name`
 * where `tokens` allows them (the caller checks the name) — or `{ what, advice }` saying what was
 * wrong, worded to follow "<call>: ". Nothing at all is an empty list.
 */
function readBytes(input, field, tokens = false) {
  if (input === undefined || input === null) return { items: [] };
  const items = [];
  if (typeof input === 'string') {
    for (const token of tokensOf(input)) {
      if (tokens && token.startsWith('$')) items.push({ token });
      else if (HEX_BYTE.test(token)) items.push({ byte: byteOf(token) });
      else return { what: `in the ${field}, "${token}" is not one byte`, advice: oneByteAdvice(token) };
    }
    return { items };
  }
  const list = listOf(input);
  if (!list) return { what: `the ${field} is ${shown(input)}, not a list of bytes or hex text` };
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const one = typeof item === 'string' ? tokensOf(item) : [];
    if (isWhole(item) && item >= 0 && item <= 255) items.push({ byte: item });
    else if (one.length === 1 && tokens && one[0].startsWith('$')) items.push({ token: one[0] });
    else if (one.length === 1 && HEX_BYTE.test(one[0])) items.push({ byte: byteOf(one[0]) });
    else return { what: `in the ${field}, ${shown(item)} at position ${i} is not a byte` };
  }
  return { items };
}

/** A byte as the template and pattern tokens carry it: two lower-case hex digits. */
const hex2 = (byte) => byte.toString(16).padStart(2, '0');

/* ------------------------------------------------------------------------- parameter defining */

const TYPES = ['boolean', 'choice', 'enum', 'integer', 'number', 'text'];

/** Every spelling `encoding` accepts, to what it means. "to14bit" is ce.midi's name for the same two
 *  bytes, most significant first, and "boolean-u7" the device profiles' name for a switch's byte. */
const ENCODINGS = { 'boolean-u7': 'boolean-u7', nibbled: 'nibbled', to14bit: 'u14', u14: 'u14', u7: 'u7' };

/** The template's own tokens, in the order a message lists them. `$encodedValue`, the device
 *  profiles' spelling of `$value`, is read too. */
const TEMPLATE_TOKENS = ['$value', '$deviceId', '$channel', '$checksumStart', '$checksum'];
const BUILT_IN_NAMES = new Set(['value', 'encodedValue', 'deviceId', 'channel', 'checksumStart', 'checksum']);

/** The tokens a dump's prefix and suffix may hold, resolved the way the decoder resolves them. */
const PATTERN_TOKENS = ['$deviceId', '$channel'];
const PATTERN_VALUES = { channel: 1, deviceId: 16 };

/** How many bytes an encoding puts on the wire, for `$value` and for a dump field's width. */
function encodedBytes(encoding, number, nibbles) {
  if (encoding === 'u14') return [(number >> 7) & 0x7f, number & 0x7f];
  if (encoding === 'nibbled') {
    const out = [];
    for (let i = nibbles - 1; i >= 0; i -= 1) out.push(Math.floor(number / 16 ** i) % 16);
    return out;
  }
  return [number];
}

/** What the wire can carry, and the words for it. Nothing in this codec sends a negative number. */
function capacityOf(wireKind, encoding, nibbles) {
  if (wireKind === 'cc') return { max: 127, carrier: 'a CC carries 0 to 127' };
  if (wireKind === 'nrpn') return { max: 16383, carrier: 'an NRPN carries 0 to 16383' };
  if (encoding === 'u14') return { max: 16383, carrier: 'two SysEx data bytes carry 0 to 16383' };
  if (encoding === 'nibbled') {
    const max = 16 ** nibbles - 1;
    return { max, carrier: nibbles === 1 ? 'one nibble carries 0 to 15' : `${nibbles} nibbles carry 0 to ${max}` };
  }
  return { max: 127, carrier: 'a SysEx data byte carries 0 to 127' };
}

/** A whole number from lo to hi, or what was wrong with it, worded to follow "<call>: ". */
function wholeIn(name, value, lo, hi) {
  return isWhole(value) && value >= lo && value <= hi ? null : `${name} is ${shown(value)}, not a whole number from ${lo} to ${hi}`;
}

/**
 * Declare a parameter. `spec` is the script-facing flat shape — one of `cc`, `nrpn` or `sysex` says
 * how it reaches the synth, and the rest describes it well enough for `parameters()` to answer the
 * same questions a shipped profile would.
 *
 * Rejecting is deliberate where a silent accept would produce a parameter that enumerates fine and
 * sends nothing, or sends the wrong thing: a descriptor with no wire is worse than an error, because
 * the panel looks built. So is one whose range the wire cannot carry.
 */
export function defineParameter(role, id, spec = {}) {
  const key = String(id ?? '').trim();
  if (!key) return { ok: false, error: 'defineParameter(id, spec): a parameter id is required.' };
  const call = `defineParameter("${key}")`;
  if (!spec || typeof spec !== 'object') {
    return { ok: false, error: `${call}: a spec is required — say how the parameter reaches the synth ({ cc = … }, { nrpn = { msb, lsb } } or { sysex = { … } }).` };
  }
  const refuse = (what, advice) => refusal(call, what, PARAMETER_REFUSED, advice);

  // Names are read in any case, the way divisions and checksums are.
  const type = spec.type == null ? 'number' : typeof spec.type === 'string' ? spec.type.toLowerCase() : '';
  if (!TYPES.includes(type)) return refuse(`${shown(spec.type)} is not a type`, `One of: ${TYPES.join(', ')}.`);
  let encoding = type === 'boolean' ? 'boolean-u7' : 'u7';
  if (spec.encoding != null) {
    const name = typeof spec.encoding === 'string' ? spec.encoding.toLowerCase() : '';
    if (!Object.hasOwn(ENCODINGS, name)) {
      return refuse(`${shown(spec.encoding)} is not an encoding`, `One of: ${Object.keys(ENCODINGS).join(', ')}.`);
    }
    encoding = ENCODINGS[name];
  }
  let nibbles = 2;
  if (spec.nibbles != null) {
    const wrong = wholeIn('nibbles', spec.nibbles, 1, 8);
    if (wrong) return refuse(wrong);
    nibbles = spec.nibbles;
  }
  let channel = 1;
  if (spec.channel != null) {
    const wrong = wholeIn('channel', spec.channel, 1, 16);
    if (wrong) return refuse(wrong);
    channel = spec.channel;
  }

  const wire = { kind: '' };
  const variables = {};
  if (spec.cc != null) {
    const wrong = wholeIn('cc', spec.cc, 0, 127);
    if (wrong) return refuse(wrong);
    Object.assign(wire, { kind: 'cc', cc: spec.cc, channel });
  } else if (spec.nrpn != null) {
    // { msb, lsb }, or the two as a list.
    const n = spec.nrpn;
    if (!isList(n) && !isObject(n)) return refuse(`the nrpn is ${shown(n)}, not { msb, lsb }`);
    const pair = isList(n) ? listOf(n) : null;
    const msb = pair ? pair[0] : n.msb;
    const lsb = pair ? pair[1] : n.lsb;
    const wrong = wholeIn('nrpn.msb', msb, 0, 127) ?? wholeIn('nrpn.lsb', lsb, 0, 127);
    if (wrong) return refuse(wrong);
    Object.assign(wire, { kind: 'nrpn', msb, lsb, channel });
  } else if (spec.sysex != null) {
    const read = readBytes(spec.sysex, 'sysex template', true);
    if (read.what) return refuse(read.what, read.advice);
    if (!read.items.length) {
      return { ok: false, error: `${call}: the sysex template is empty — it needs the bytes to send, with $value where the value goes.` };
    }
    // Every variable is a byte the template can put on the wire, so each is read by the byte rule.
    // In name order, so the first one reported does not depend on how a table iterates.
    const declared = isObject(spec.variables) ? spec.variables : {};
    for (const [name, value] of Object.entries(declared).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const one = typeof value === 'string' ? tokensOf(value) : [];
      if (isWhole(value) && value >= 0 && value <= 255) variables[name] = value;
      else if (one.length === 1 && HEX_BYTE.test(one[0])) variables[name] = byteOf(one[0]);
      else return refuse(`in the variables, ${name} = ${shown(value)} is not a byte`);
    }
    const own = Object.keys(variables).filter((name) => !BUILT_IN_NAMES.has(name)).sort();
    for (const { token } of read.items) {
      if (token && token !== '$encodedValue' && !TEMPLATE_TOKENS.includes(token) && !own.includes(token.slice(1))) {
        const tokens = `The tokens are ${listWords(TEMPLATE_TOKENS)}`;
        return refuse(`in the sysex template, "${token}" is not a token`, !own.length
          ? `${tokens}, and any $name you list in variables.`
          : `${tokens}, and the variable${own.length === 1 ? '' : 's'} ${listWords(own.map((n) => `$${n}`))}.`);
      }
    }
    const checksum = checksumAlgorithm(typeof spec.checksum === 'string' ? spec.checksum : spec.checksum == null ? 'roland' : '');
    if (!checksum) return refuse(`${shown(spec.checksum)} is not a checksum`, `One of: ${checksumNames().join(', ')}.`);
    Object.assign(wire, {
      kind: 'sysex',
      // Normalised: a byte is two hex digits however it was written, so 0x41 and "41" are one thing.
      template: read.items.map((item) => item.token ?? hex2(item.byte)),
      checksum: checksum.id,
      channel,
    });
  } else {
    return { ok: false, error: `${call}: no wire format — give it { cc = 74 }, { nrpn = { msb = 1, lsb = 2 } } or { sysex = { … } }, or nothing will be sent.` };
  }

  const capacity = capacityOf(wire.kind, encoding, nibbles);
  const negative = 'A negative number cannot be sent. Declare the numbers the synth receives, such as '
    + `min = 0 and max = ${capacity.max}, and add the offset in your script with ce.midi.toOffset(value, 64).`;

  // Choices are a choice parameter's: a name each, worth its position plus min, or { id, value }.
  const min = Number.isFinite(Number(spec.min)) ? Number(spec.min) : 0;
  const choices = [];
  let named = 0;
  if ((type === 'choice' || type === 'enum') && spec.choices != null) {
    const list = listOf(spec.choices);
    if (!list) return refuse(`the choices are ${shown(spec.choices)}, not a list`);
    for (let i = 0; i < list.length; i += 1) {
      const c = list[i];
      if (typeof c === 'string') { choices.push({ id: c, value: min + i }); named += 1; continue; }
      if (!isObject(c)) {
        return refuse(`in the choices, ${shown(c)} at position ${i} is not a choice`, 'A choice is its name, or { id, value }.');
      }
      const choiceId = String(c.id ?? c.name ?? '');
      if (!isWhole(c.value)) return refuse(`the value of choice "${choiceId}" is ${shown(c.value)}, not a whole number`);
      choices.push({ id: choiceId, value: c.value });
    }
  }

  const widthMax = encoding === 'u14' ? 16383 : 127;
  const maxRaw = Number(spec.max);
  const max = Number.isFinite(maxRaw) ? maxRaw
    : type === 'boolean' ? 1
    : named && named === choices.length ? min + choices.length - 1
    : Math.min(widthMax, capacity.max);

  let trueValue = 1;
  let falseValue = 0;
  if (type !== 'text') {
    for (const [name, value] of [['min', min], ['max', max]]) {
      if (value < 0) return refuse(`${name} is ${value}, and ${capacity.carrier}`, negative);
      if (value > capacity.max) return refuse(`${name} is ${value}, and ${capacity.carrier}`);
    }
    for (const c of choices) {
      if (c.value < 0 || c.value > capacity.max) return refuse(`the value of choice "${c.id}" is ${c.value}, and ${capacity.carrier}`);
    }
    for (const name of ['trueValue', 'falseValue']) {
      const value = spec[name];
      if (value == null) continue;
      if (!isWhole(value)) return refuse(`${name} is ${shown(value)}, not a whole number`);
      if (value < 0 || value > capacity.max) return refuse(`${name} is ${value}, and ${capacity.carrier}`, value < 0 ? negative : '');
      if (name === 'trueValue') trueValue = value; else falseValue = value;
    }
  }

  const entry = {
    // The descriptor half — what parameters() / parameter() hand back. Deliberately the same shape
    // a profile-backed descriptor has, so a script that discovered a parameter cannot tell (and
    // does not need to tell) where it came from… except by `defined`, which is there for the
    // script that DOES need to tell.
    descriptor: {
      id: key,
      name: String(spec.name ?? key),
      group: String(spec.group ?? 'Script'),
      type,
      min,
      max,
      access: String(spec.access ?? 'readWrite'),
      defined: true,
    },
    // The wire half — never handed to a script, because a script gave it to us.
    wire,
    encoding,
    nibbles,
    length: Number(spec.length) > 0 ? Math.round(Number(spec.length)) : 0,
    pad: Number.isFinite(Number(spec.pad)) ? Number(spec.pad) : 32,
    trueValue,
    falseValue,
    choices,
    variables,
  };

  const s = slot(role);
  s.parameters.set(key, entry);
  invalidate(s);
  const warning = wire.kind === 'sysex' ? rolandChecksumWarning(key, wire.template) : '';
  return { ok: true, parameter: entry.descriptor, ...(warning ? { warning } : {}) };
}

/**
 * Is this a Roland template (41 straight after F0) whose $checksum has no $checksumStart? Then the
 * sum runs from the first byte after F0, header included, which is right for short templates and
 * a message a Roland synth rejects without a word (encodeParameter says why the marker is not
 * inferred). The definition still stands; defineParameter returns a warning that says so, in the
 * same words as ScriptRuntime::defineDeviceParameter. The template is normalised by then, so a
 * template written as numbers ({ 0xF0, 0x41, … }) is recognised too.
 */
function rolandChecksumWarning(key, template) {
  const first = template[0] === 'f0' ? template[1] : template[0];
  if (first !== '41' || !template.includes('$checksum') || template.includes('$checksumStart')) return '';
  return `defineParameter("${key}"): this is a Roland template (41 after F0) with $checksum and no `
    + '$checksumStart, so the checksum includes the header, and a Roland synth ignores the message. '
    + 'Put $checksumStart where the address begins.';
}

const DECIMAL = /^[+-]?[0-9]+(\.[0-9]+)?$/;

/** A number as a write may give one: a number, true or false, or decimal text such as "64". */
function numberOf(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && DECIMAL.test(value)) return Number(value);
  return null;
}

/** On or off, or null: true/false, a number (0 is off), or "on"/"off"/"true"/"false" in any case. */
function switchOf(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value !== 0 : null;
  const word = typeof value === 'string' ? value.toLowerCase() : '';
  if (word === 'on' || word === 'true') return true;
  if (word === 'off' || word === 'false') return false;
  return null;
}

/**
 * The number a value becomes on the wire, in the parameter's own units, or what was wrong with it.
 * A value the parameter cannot read is refused rather than sent as its minimum, which is what a
 * mistyped choice, a switch written as 127 and a nil all used to do.
 */
function numberFor(entry, value) {
  const { descriptor } = entry;
  if (descriptor.type === 'text') {
    return { error: `a text parameter is read out of a dump and cannot be written on its own, so ${NOT_SENT}.` };
  }
  if (descriptor.type === 'boolean') {
    const on = switchOf(value);
    if (on === null) {
      return { error: `${shown(value)} is not on or off, so ${NOT_SENT}. Write true or false, a number `
        + '(0 is off, any other number is on), or "on", "off", "true" or "false".' };
    }
    return { number: on ? entry.trueValue : entry.falseValue };
  }
  if (descriptor.type === 'choice' || descriptor.type === 'enum') {
    // A name is matched in any case, the way divisions are; a number is the value itself.
    const match = typeof value === 'string'
      ? entry.choices.find((c) => c.id === value)
        ?? entry.choices.find((c) => c.id.toLowerCase() === value.toLowerCase())
      : null;
    if (match) return { number: match.value };
    if (numberOf(value) === null) {
      const ids = entry.choices.map((c) => `"${c.id}"`);
      const list = ids.length === 0 ? 'It has no choices.'
        : ids.length === 1 ? `The only choice is ${ids[0]}.` : `The choices are ${listWords(ids)}.`;
      return { error: `${shown(value)} is not one of its choices, so ${NOT_SENT}. ${list}` };
    }
  }
  const n = numberOf(value);
  if (n === null) return { error: `${shown(value)} is not a number, so ${NOT_SENT}.` };
  const lo = Math.min(descriptor.min, descriptor.max);
  const hi = Math.max(descriptor.min, descriptor.max);
  return { number: Math.round(n < lo ? lo : n > hi ? hi : n) };
}

/**
 * Compile a defined parameter into the bytes that set it.
 *
 * The SysEx template's tokens: a byte (`"41"` or 0x41), `$value` (the encoded value, however many
 * bytes the encoding takes), `$deviceId` (16 unless `variables` says otherwise), `$channel` (the
 * parameter's channel, 1 unless given), any `$name` from the spec's `variables`, `$checksumStart`
 * (a zero-width marker) and `$checksum`. All of them were checked when the parameter was defined.
 *
 * `$checksumStart` exists because a Roland checksum covers the ADDRESS AND DATA, not the
 * manufacturer header, and no rule inferred from the template can know where the header stops.
 * Without a marker the sum runs from the first byte after an opening F0, which is the right answer
 * for the short templates and the wrong one for Roland — so the marker is documented rather than
 * the default being quietly approximate.
 */
export function encodeParameter(role, id, value) {
  const entry = slot(role).parameters.get(String(id ?? ''));
  if (!entry) return { ok: false, error: '' };      // not ours — the caller falls back to the profile

  const read = numberFor(entry, value);
  if (read.error) return { ok: false, error: read.error };
  const { number } = read;
  const { wire } = entry;

  if (wire.kind === 'cc') {
    return { ok: true, bytes: [0xb0 | (wire.channel - 1), wire.cc, number] };
  }
  if (wire.kind === 'nrpn') {
    const status = 0xb0 | (wire.channel - 1);
    return {
      ok: true,
      bytes: [status, 99, wire.msb, status, 98, wire.lsb,
        status, 6, (number >> 7) & 0x7f, status, 38, number & 0x7f],
    };
  }

  const valueBytes = encodedBytes(entry.encoding, number, entry.nibbles);
  const variables = { channel: wire.channel, deviceId: 16, ...entry.variables };
  const bytes = [];
  let sumFrom = -1;
  for (const token of wire.template) {
    if (token === '$checksumStart') { sumFrom = bytes.length; continue; }
    if (token === '$checksum') {
      const from = sumFrom >= 0 ? sumFrom : (bytes[0] === 0xf0 ? 1 : 0);
      bytes.push(...checksumBytes(wire.checksum, bytes.slice(from)));
      continue;
    }
    if (token === '$value' || token === '$encodedValue') { bytes.push(...valueBytes); continue; }
    if (token.startsWith('$')) { bytes.push(variables[token.slice(1)]); continue; }
    bytes.push(parseInt(token, 16));
  }
  if (!bytes.length) return { ok: false, error: `The sysex template for "${id}" produced no bytes.` };
  if (bytes[0] !== 0xf0) bytes.unshift(0xf0);
  if (bytes[bytes.length - 1] !== 0xf7) bytes.push(0xf7);
  return { ok: true, bytes };
}

/* ------------------------------------------------------------------------------ dump defining */

/** A prefix or suffix: bytes, and the two tokens the decoder resolves. Tokens as the profile format
 *  spells them, so the local engine reads them unchanged. */
function readPattern(input, field, call) {
  const read = readBytes(input, field, true);
  if (read.what) return refusal(call, read.what, DUMP_REFUSED, read.advice);
  for (const { token } of read.items) {
    if (token && !PATTERN_TOKENS.includes(token)) {
      return refusal(call, `in the ${field}, "${token}" is not a token`, DUMP_REFUSED,
        `The tokens are ${listWords(PATTERN_TOKENS)}.`);
    }
  }
  return { ok: true, tokens: read.items.map((item) => item.token ?? hex2(item.byte)) };
}

/**
 * Declare a dump layout: what to send to ask for it, how to recognise the reply, and where each
 * parameter sits inside it.
 *
 * Every field must name a parameter that is ALREADY defined. Rejecting an unknown one here rather
 * than at decode time is the difference between a message while the script is being written and a
 * dump that silently decodes to fewer values than the author thinks, months later, in front of an
 * audience. A layout with no prefix is refused for the same reason: it would match every SysEx that
 * arrives and decode it into the controls.
 */
export function defineDump(role, kind, spec = {}) {
  const key = String(kind ?? '').trim();
  if (!key) return { ok: false, error: 'defineDump(kind, spec): a dump kind is required.' };
  const call = `defineDump("${key}")`;
  if (!spec || typeof spec !== 'object') {
    return { ok: false, error: `${call}: a spec is required — at least the fields the dump carries.` };
  }

  const fields = Array.isArray(spec.fields) ? spec.fields
    : spec.fields && typeof spec.fields === 'object' ? Object.values(spec.fields)
    : [];
  if (!fields.length) {
    return { ok: false, error: `${call}: no fields — a layout with nothing in it decodes to nothing.` };
  }

  const s = slot(role);
  const mappings = [];
  for (const field of fields) {
    const parameterId = String(field?.parameter ?? field?.id ?? '').trim();
    if (!parameterId) {
      return { ok: false, error: `${call}: a field has no parameter — every field names the parameter it carries.` };
    }
    if (!s.parameters.has(parameterId)) {
      return { ok: false, error: `${call}: "${parameterId}" is not a defined parameter. Call defineParameter("${parameterId}", …) first — the layout describes where a parameter sits, so the parameter has to exist to sit anywhere.` };
    }
    const mapping = { parameter: parameterId, offset: Math.max(0, Math.round(Number(field?.offset) || 0)) };
    if (field?.codec && typeof field.codec === 'object') mapping.codec = field.codec;
    mappings.push(mapping);
  }

  const match = spec.match && typeof spec.match === 'object' ? spec.match : {};
  const prefix = readPattern(match.prefix ?? spec.prefix, 'prefix', call);
  if (!prefix.ok) return prefix;
  if (!prefix.tokens.length) {
    return { ok: false, error: `${call}: no prefix — a layout with nothing to recognise it by would decode every SysEx that arrives. Give it match = { prefix = { "F0", … } }, the bytes the dump starts with.` };
  }
  const suffix = readPattern(match.suffix ?? spec.suffix, 'suffix', call);
  if (!suffix.ok) return suffix;
  const request = readBytes(spec.request, 'request');
  if (request.what) return refusal(call, request.what, DUMP_REFUSED, request.advice);

  // A checksum is a name, placed where a SysEx dump keeps it, or { type, fromOffset, toOffset,
  // byteOffset } for anything else; an offset left out takes the name's default. The defaults depend
  // on the message's length, so they are placed per message (placedChecksum), not here.
  let checksum = null;
  if (spec.checksum != null) {
    const cs = spec.checksum;
    const object = isObject(cs);
    if (typeof cs !== 'string' && !object) {
      return refusal(call, `the checksum is ${shown(cs)}, not a name such as "roland" or { type, fromOffset, toOffset, byteOffset }`, DUMP_REFUSED);
    }
    const type = object ? (cs.type ?? 'roland-7bit') : cs;
    const algorithm = typeof type === 'string' ? checksumAlgorithm(type) : null;
    if (!algorithm) return refusal(call, `${shown(type)} is not a checksum`, DUMP_REFUSED, `One of: ${checksumNames().join(', ')}.`);
    checksum = { type: algorithm.id, width: algorithm.width };
    for (const name of ['fromOffset', 'toOffset', 'byteOffset']) {
      const value = object ? cs[name] : undefined;
      if (value == null) continue;
      if (!isWhole(value) || value < 0) {
        return refusal(call, `checksum.${name} is ${shown(value)}, not a whole number of 0 or more`, DUMP_REFUSED);
      }
      checksum[name] = value;
    }
  }

  const dump = {
    id: key,
    name: String(spec.name ?? key),
    matcher: { prefix: prefix.tokens, suffix: suffix.tokens },
    payload: {
      offset: Number.isFinite(Number(spec.offset)) ? Math.max(0, Math.round(Number(spec.offset))) : 0,
      size: Math.max(0, Math.round(Number(spec.size) || 0)),
    },
    mappings,
  };
  const requestBytes = request.items.map((item) => item.byte);

  s.dumps.set(key, { dump, request: requestBytes, checksum });
  invalidate(s);
  return { ok: true, dump: { kind: key, name: dump.name, fields: mappings.length, requestBytes: requestBytes.length } };
}

/**
 * Where a declared checksum sits in one message. A name alone means the SysEx shape: the checksum
 * just before the suffix (at the end when there is none), covering every byte from the end of the
 * prefix up to it, which is a Roland checksum when the prefix is the header. `byteOffset` is the
 * default position, which the caller works out from the message.
 */
function placedChecksum(entry, byteOffset) {
  const { checksum, dump } = entry;
  const at = checksum.byteOffset ?? byteOffset;
  return {
    type: checksum.type,
    byteCount: checksum.width,
    fromOffset: checksum.fromOffset ?? dump.matcher.prefix.length,
    toOffset: checksum.toOffset ?? at - 1,
    byteOffset: at,
  };
}

/** The synthetic profile with each declared checksum placed by `place(entry)`. */
function profileWithChecksums(role, place) {
  const s = slot(role);
  const base = syntheticProfile(role);
  const entries = [...s.dumps.values()];
  if (!entries.some((e) => e.checksum)) return base;
  return {
    ...base,
    dumpDefinitions: entries.map((e) => (e.checksum ? { ...e.dump, checksum: place(e) } : e.dump)),
  };
}

/* --------------------------------------------------------------------------------- the reads */

export function definedParameters(role) {
  return [...slot(role).parameters.values()].map((e) => e.descriptor);
}

export function definedParameter(role, id) {
  return slot(role).parameters.get(String(id ?? ''))?.descriptor ?? null;
}

export function hasDefinedParameter(role, id) {
  return slot(role).parameters.has(String(id ?? ''));
}

export function hasDefinedDump(role, kind) {
  return slot(role).dumps.has(String(kind ?? ''));
}

/** The bytes that ASK for a declared dump, or an empty array when the layout declared no request. */
export function dumpRequestBytes(role, kind) {
  return slot(role).dumps.get(String(kind ?? ''))?.request ?? [];
}

export function definedDumpKinds(role) {
  return [...slot(role).dumps.keys()];
}

/**
 * The synthetic profile the decoder is handed. Built from the definitions rather than kept beside
 * them, so there is exactly one description of a parameter and the two cannot disagree.
 */
function syntheticProfile(role) {
  const s = slot(role);
  if (s.profile) return s.profile;
  const parameters = [...s.parameters.values()].map((e) => ({
    id: e.descriptor.id,
    type: e.descriptor.type,
    choices: e.choices,
    trueValue: e.trueValue,
    encoding: {
      type: e.descriptor.type === 'text'
        ? (e.encoding === 'nibbled' ? 'text-nibbled-ascii' : 'text-ascii')
        : e.encoding === 'boolean-u7' ? 'u7' : e.encoding,
      length: e.length,
      pad: e.pad,
      nibbles: e.nibbles,
    },
  }));
  s.profile = {
    id: `script:${role}`,
    variables: { ...PATTERN_VALUES },
    parameters,
    dumpDefinitions: [...s.dumps.values()].map((d) => d.dump),
  };
  return s.profile;
}

/**
 * Try the declared layouts against a message that just arrived.
 *
 * Returns null when this role has no declared dumps at all — the caller then leaves the message
 * alone, which is what keeps a panel that never called defineDump behaving exactly as before.
 */
export function decodeDump(role, hex) {
  const s = slot(role);
  if (s.dumps.size === 0) return null;
  const parsed = parseRawMidiHexText(hex);
  const length = parsed.ok ? parsed.bytes.length : 0;
  const profile = profileWithChecksums(role,
    (e) => placedChecksum(e, length - e.dump.matcher.suffix.length - e.checksum.width));
  const result = localParseDumpMessage(profile, hex);
  if (!result?.ok) return { ok: false, error: result?.error ?? 'No declared layout matched.', matchStatus: result?.matchStatus ?? 'noMatch' };
  return { ok: true, kind: result.dumpId, name: result.dumpName, values: result.values ?? {} };
}

/**
 * Build bytes for a DECLARED dump — the encode direction, and the counterpart to decodeDump.
 *
 * Only script-declared layouts, deliberately. A profile dump's codec lives in the C++ engine and the
 * preview has no synchronous way to reach it; a layout the script declared with `defineDump` is one
 * this runtime owns outright, so it can be built here with no host at all. That split is the same
 * one `requestDump` already makes.
 *
 * Returns null when the role has no declared dumps, so a caller can tell "nothing declared" from
 * "declared and failed" and give the right message for each.
 */
export function buildDump(role, kind, values = {}) {
  const s = slot(role);
  if (s.dumps.size === 0) return null;
  return localBuildDumpMessage(profileWithChecksums(role, builtChecksum), kind, values);
}

/** Built, the checksum goes straight after the payload, which is just before the suffix. */
const builtChecksum = (e) => placedChecksum(e, Math.max(e.dump.matcher.prefix.length, e.dump.payload.offset) + e.dump.payload.size);

// A role of its own, so what declaredProfile reads never touches what a running script defined.
const DECLARED_ROLE = '\u0000declared-profile';

/**
 * The profile a list of definitions makes, without defining anything: [{ verb: 'parameter' | 'dump',
 * id, spec }], each checked by defineParameter or defineDump as a running script's is, in that
 * order, and one they refuse left out. The script editor lays out the dumps a script declares by it
 * (editor/valuesContext.js) before the script runs. A checksum is where a built dump has it, after
 * the payload; a dump with no size and no checksum.byteOffset has it wherever the message ends, so
 * none is placed.
 */
export function declaredProfile(definitions) {
  byRole.delete(DECLARED_ROLE);
  for (const d of Array.isArray(definitions) ? definitions : []) {
    if (d?.verb === 'parameter') defineParameter(DECLARED_ROLE, d.id, d.spec);
    else if (d?.verb === 'dump') defineDump(DECLARED_ROLE, d.id, d.spec);
  }
  const placed = (e) => (e.checksum.byteOffset != null || e.dump.payload.size > 0 ? builtChecksum(e) : undefined);
  const profile = profileWithChecksums(DECLARED_ROLE, placed);
  byRole.delete(DECLARED_ROLE);
  return profile;
}

/** Drop every definition. Called when the panel is rebuilt, for the reason onPanelBuild exists. */
export function clearDeviceDefinitions() { byRole.clear(); }

/** For tests and for the insight surfaces: what a role currently has declared. */
export function deviceDefinitionCounts(role) {
  const s = slot(role);
  return { parameters: s.parameters.size, dumps: s.dumps.size };
}
