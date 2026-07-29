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
//     ASCII values and roland-7bit/sum-7bit checksums, and a second decoder would drift from it.
//   • ENCODING a parameter is done here rather than through localCompileParameter, for one reason:
//     that function's `$checksum` token is a plain clamped sum. For a profile authored in the
//     editor that is only ever a preview, but a script-defined parameter is the REAL send, and a
//     Roland two's-complement checksum written as a plain sum is a message the synth rejects
//     silently. The verb exists for old and obscure hardware, which is exactly the hardware that
//     checksums, so it computes the checksum the device documents.
//
// Definitions are SCRIPT-LIFETIME, like drawings and animations: they live in the runtime, not in
// the panel document. A panel that wants them on every load declares them from onPanelBuild, which
// is what makes the build idempotent (§13) — and it means a definition can never be half-saved
// into the author's file.

import { localParseDumpMessage } from '../stores/deviceProfileLocalEngine.js';
import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';

/** role -> { parameters: Map<id, entry>, dumps: Map<kind, entry>, profile: object|null } */
const byRole = new Map();

function slot(role) {
  const key = String(role || DEFAULT_DEVICE_ROLE);
  if (!byRole.has(key)) byRole.set(key, { parameters: new Map(), dumps: new Map(), profile: null });
  return byRole.get(key);
}

/** Any write invalidates the synthetic profile the decoder is handed. */
function invalidate(entry) { entry.profile = null; }

/* ------------------------------------------------------------------------------ byte helpers */

const int7 = (v, lo = 0, hi = 127) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
};

/** "f0 41 10" | [0xf0, …] | { 1: 0xf0 } (a wasmoon Lua table) -> a byte array. */
export function toBytes(input) {
  if (Array.isArray(input)) return input.map((v) => int7(v, 0, 255));
  if (typeof input === 'string') {
    return input.trim().split(/[\s,]+/).filter(Boolean)
      .map((h) => parseInt(h, 16)).filter((n) => Number.isFinite(n))
      .map((v) => int7(v, 0, 255));
  }
  if (input && typeof input === 'object') return Object.values(input).map((v) => int7(v, 0, 255));
  return [];
}

/**
 * A matcher pattern, as the local engine's own dump definitions spell it: HEX TOKEN STRINGS, so a
 * `$deviceId` in the pattern still resolves. A script may write either — `{ 0xf0, 0x7d }` reads
 * naturally in Lua and `{ "f0", "$deviceId" }` is what the profile format uses — so both arrive
 * here and leave as tokens.
 */
function toPatternTokens(input) {
  const raw = Array.isArray(input) ? input
    : typeof input === 'string' ? input.trim().split(/[\s,]+/).filter(Boolean)
    : input && typeof input === 'object' ? Object.values(input)
    : [];
  return raw.map((token) => {
    if (typeof token === 'number') return (token & 0xff).toString(16).padStart(2, '0');
    const text = String(token ?? '').trim();
    if (text.startsWith('$')) return text;
    if (/^[0-9a-f]{1,2}$/i.test(text)) return text;
    const n = Number(text);
    return Number.isFinite(n) ? (n & 0xff).toString(16).padStart(2, '0') : '';
  }).filter(Boolean);
}

/**
 * The checksum a device documents, not a generic sum. "roland" and "yamaha" are the same
 * two's-complement 7-bit figure written two ways — the same equivalence checksum() states.
 */
function checksumOver(kind, bytes) {
  let sum = 0;
  let x = 0;
  for (const b of bytes) { sum = (sum + (b & 0xff)) % 128; x = (x ^ (b & 0xff)) & 0x7f; }
  const k = String(kind ?? 'roland').toLowerCase();
  if (k === 'xor') return x;
  if (k === 'sum' || k === 'sum-7bit') return sum;
  return (128 - sum) % 128;                 // roland / yamaha / two's complement
}

/* ------------------------------------------------------------------------- parameter defining */

const ENCODINGS = new Set(['u7', 'u14', 'nibbled', 'boolean-u7']);

/** How many bytes an encoding puts on the wire, for `$value` and for a dump field's width. */
function encodedBytes(encoding, number, nibbles) {
  if (encoding === 'u14') return [(number >> 7) & 0x7f, number & 0x7f];
  if (encoding === 'nibbled') {
    const count = Math.max(1, Math.round(Number(nibbles) || 2));
    const out = [];
    for (let i = count - 1; i >= 0; i -= 1) out.push((number >> (i * 4)) & 0x0f);
    return out;
  }
  return [int7(number)];
}

/**
 * Declare a parameter. `spec` is the script-facing flat shape — one of `cc`, `nrpn` or `sysex` says
 * how it reaches the synth, and the rest describes it well enough for `parameters()` to answer the
 * same questions a shipped profile would.
 *
 * Rejecting is deliberate where a silent accept would produce a parameter that enumerates fine and
 * sends nothing: a descriptor with no wire is worse than an error, because the panel looks built.
 */
export function defineParameter(role, id, spec = {}) {
  const key = String(id ?? '').trim();
  if (!key) return { ok: false, error: 'defineParameter(id, spec): a parameter id is required.' };
  if (!spec || typeof spec !== 'object') {
    return { ok: false, error: `defineParameter("${key}"): a spec is required — say how the parameter reaches the synth ({ cc = … }, { nrpn = { msb, lsb } } or { sysex = { … } }).` };
  }

  const type = String(spec.type ?? 'number');
  const encoding = ENCODINGS.has(String(spec.encoding ?? '')) ? String(spec.encoding)
    : type === 'boolean' ? 'boolean-u7' : 'u7';
  const widthMax = encoding === 'u14' ? 16383 : 127;

  const wire = { kind: '' };
  if (spec.cc != null) {
    wire.kind = 'cc';
    wire.cc = int7(spec.cc);
    wire.channel = int7(spec.channel ?? 1, 1, 16);
  } else if (spec.nrpn != null) {
    const n = spec.nrpn;
    wire.kind = 'nrpn';
    wire.msb = int7(n?.msb ?? n?.[0] ?? 0);
    wire.lsb = int7(n?.lsb ?? n?.[1] ?? 0);
    wire.channel = int7(spec.channel ?? 1, 1, 16);
  } else if (spec.sysex != null) {
    const template = Array.isArray(spec.sysex) ? spec.sysex
      : typeof spec.sysex === 'string' ? spec.sysex.trim().split(/[\s,]+/).filter(Boolean)
      : spec.sysex && typeof spec.sysex === 'object' ? Object.values(spec.sysex)
      : [];
    if (!template.length) {
      return { ok: false, error: `defineParameter("${key}"): the sysex template is empty — it needs the bytes to send, with $value where the value goes.` };
    }
    wire.kind = 'sysex';
    wire.template = template.map((t) => String(t ?? '').trim());
    wire.checksum = String(spec.checksum ?? 'roland');
  } else {
    return { ok: false, error: `defineParameter("${key}"): no wire format — give it { cc = 74 }, { nrpn = { msb = 1, lsb = 2 } } or { sysex = { … } }, or nothing will be sent.` };
  }

  const min = Number.isFinite(Number(spec.min)) ? Number(spec.min) : 0;
  const maxRaw = Number(spec.max);
  const max = Number.isFinite(maxRaw) ? maxRaw : (type === 'boolean' ? 1 : widthMax);

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
    nibbles: Number(spec.nibbles) > 0 ? Math.round(Number(spec.nibbles)) : 2,
    length: Number(spec.length) > 0 ? Math.round(Number(spec.length)) : 0,
    pad: Number.isFinite(Number(spec.pad)) ? Number(spec.pad) : 32,
    trueValue: Number.isFinite(Number(spec.trueValue)) ? Number(spec.trueValue) : 1,
    falseValue: Number.isFinite(Number(spec.falseValue)) ? Number(spec.falseValue) : 0,
    choices: Array.isArray(spec.choices) ? spec.choices.map((c) => ({
      id: String(c?.id ?? c?.name ?? ''), value: int7(c?.value ?? 0, 0, widthMax),
    })) : [],
    variables: spec.variables && typeof spec.variables === 'object' ? { ...spec.variables } : {},
  };

  const s = slot(role);
  s.parameters.set(key, entry);
  invalidate(s);
  return { ok: true, parameter: entry.descriptor };
}

/** The number a value becomes on the wire — the parameter's own units, clamped to what fits. */
function numberFor(entry, value) {
  const { descriptor } = entry;
  if (descriptor.type === 'boolean') {
    const on = value === true || ['true', 'on', 'yes', '1'].includes(String(value).toLowerCase());
    return on ? entry.trueValue : entry.falseValue;
  }
  if (descriptor.type === 'choice' || descriptor.type === 'enum') {
    const match = entry.choices.find((c) => c.id === String(value));
    if (match) return match.value;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return descriptor.min;
  const lo = Math.min(descriptor.min, descriptor.max);
  const hi = Math.max(descriptor.min, descriptor.max);
  return Math.round(n < lo ? lo : n > hi ? hi : n);
}

/**
 * Compile a defined parameter into the bytes that set it.
 *
 * The SysEx template's tokens: a hex literal (`"41"`), `$value` (the encoded value, however many
 * bytes the encoding takes), `$deviceId` / `$channel` / any `$name` from the spec's `variables`,
 * `$checksumStart` (a zero-width marker) and `$checksum`.
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

  const number = numberFor(entry, value);
  const valueBytes = encodedBytes(entry.encoding, number, entry.nibbles);
  const { wire } = entry;

  if (wire.kind === 'cc') {
    return { ok: true, bytes: [0xb0 | (wire.channel - 1), wire.cc, int7(number)] };
  }
  if (wire.kind === 'nrpn') {
    const status = 0xb0 | (wire.channel - 1);
    const wide = entry.encoding === 'u14' ? valueBytes : [(number >> 7) & 0x7f, number & 0x7f];
    return {
      ok: true,
      bytes: [status, 99, wire.msb, status, 98, wire.lsb,
        status, 6, wide[0] ?? 0, status, 38, wide[1] ?? 0],
    };
  }

  const variables = { channel: wire.channel ?? 1, deviceId: 16, ...entry.variables };
  const bytes = [];
  let sumFrom = -1;
  for (const token of wire.template) {
    if (token === '$checksumStart') { sumFrom = bytes.length; continue; }
    if (token === '$checksum') {
      const from = sumFrom >= 0 ? sumFrom : (bytes[0] === 0xf0 ? 1 : 0);
      bytes.push(checksumOver(wire.checksum, bytes.slice(from)));
      continue;
    }
    if (token === '$value' || token === '$encodedValue') { bytes.push(...valueBytes); continue; }
    if (token.startsWith('$')) { bytes.push(int7(variables[token.slice(1)] ?? 0, 0, 255)); continue; }
    if (/^[0-9a-f]{1,2}$/i.test(token)) { bytes.push(parseInt(token, 16)); continue; }
    const n = Number(token);
    if (Number.isFinite(n)) bytes.push(int7(n, 0, 255));
  }
  if (!bytes.length) return { ok: false, error: `The sysex template for "${id}" produced no bytes.` };
  if (bytes[0] !== 0xf0) bytes.unshift(0xf0);
  if (bytes[bytes.length - 1] !== 0xf7) bytes.push(0xf7);
  return { ok: true, bytes };
}

/* ------------------------------------------------------------------------------ dump defining */

/**
 * Declare a dump layout: what to send to ask for it, how to recognise the reply, and where each
 * parameter sits inside it.
 *
 * Every field must name a parameter that is ALREADY defined. Rejecting an unknown one here rather
 * than at decode time is the difference between a message while the script is being written and a
 * dump that silently decodes to fewer values than the author thinks, months later, in front of an
 * audience.
 */
export function defineDump(role, kind, spec = {}) {
  const key = String(kind ?? '').trim();
  if (!key) return { ok: false, error: 'defineDump(kind, spec): a dump kind is required.' };
  if (!spec || typeof spec !== 'object') {
    return { ok: false, error: `defineDump("${key}"): a spec is required — at least the fields the dump carries.` };
  }

  const fields = Array.isArray(spec.fields) ? spec.fields
    : spec.fields && typeof spec.fields === 'object' ? Object.values(spec.fields)
    : [];
  if (!fields.length) {
    return { ok: false, error: `defineDump("${key}"): no fields — a layout with nothing in it decodes to nothing.` };
  }

  const s = slot(role);
  const mappings = [];
  for (const field of fields) {
    const parameterId = String(field?.parameter ?? field?.id ?? '').trim();
    if (!parameterId) {
      return { ok: false, error: `defineDump("${key}"): a field has no parameter — every field names the parameter it carries.` };
    }
    if (!s.parameters.has(parameterId)) {
      return { ok: false, error: `defineDump("${key}"): "${parameterId}" is not a defined parameter. Call defineParameter("${parameterId}", …) first — the layout describes where a parameter sits, so the parameter has to exist to sit anywhere.` };
    }
    const mapping = { parameter: parameterId, offset: Math.max(0, Math.round(Number(field?.offset) || 0)) };
    if (field?.codec && typeof field.codec === 'object') mapping.codec = field.codec;
    mappings.push(mapping);
  }

  const match = spec.match && typeof spec.match === 'object' ? spec.match : {};
  const dump = {
    id: key,
    name: String(spec.name ?? key),
    matcher: {
      prefix: toPatternTokens(match.prefix ?? spec.prefix ?? []),
      suffix: toPatternTokens(match.suffix ?? spec.suffix ?? []),
    },
    payload: {
      offset: Number.isFinite(Number(spec.offset)) ? Math.max(0, Math.round(Number(spec.offset))) : 0,
      size: Math.max(0, Math.round(Number(spec.size) || 0)),
    },
    mappings,
  };
  if (spec.checksum && typeof spec.checksum === 'object') {
    dump.checksum = {
      type: String(spec.checksum.type ?? 'roland-7bit') === 'roland' ? 'roland-7bit' : String(spec.checksum.type ?? 'roland-7bit'),
      fromOffset: Math.max(0, Math.round(Number(spec.checksum.fromOffset) || 0)),
      ...(Number.isFinite(Number(spec.checksum.toOffset)) ? { toOffset: Math.round(Number(spec.checksum.toOffset)) } : {}),
      ...(Number.isFinite(Number(spec.checksum.byteOffset)) ? { byteOffset: Math.round(Number(spec.checksum.byteOffset)) } : {}),
    };
  }

  const request = toBytes(spec.request ?? []);

  s.dumps.set(key, { dump, request });
  invalidate(s);
  return { ok: true, dump: { kind: key, name: dump.name, fields: mappings.length, requestBytes: request.length } };
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
    variables: { channel: 1, deviceId: 16 },
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
  const result = localParseDumpMessage(syntheticProfile(role), hex);
  if (!result?.ok) return { ok: false, error: result?.error ?? 'No declared layout matched.', matchStatus: result?.matchStatus ?? 'noMatch' };
  return { ok: true, kind: result.dumpId, name: result.dumpName, values: result.values ?? {} };
}

/** Drop every definition. Called when the panel is rebuilt, for the reason onPanelBuild exists. */
export function clearDeviceDefinitions() { byRole.clear(); }

/** For tests and for the insight surfaces: what a role currently has declared. */
export function deviceDefinitionCounts(role) {
  const s = slot(role);
  return { parameters: s.parameters.size, dumps: s.dumps.size };
}
