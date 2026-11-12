// Browser-safe DPD bulk-dump engine: assemble / parse / round-trip a whole-patch (or bank) SysEx
// dump from a resolved profile's `dump` model. UNIVERSAL — no device is special-cased: Roland address
// blocks, Korg 8->7 block-packed payloads, Yamaha nibbled values, ASCII patch names and every checksum
// flavour are all expressed by the same `message` + `layout` model. Imports only browser-safe siblings,
// so the Node tools (verify / library / emit) and the in-app Designer share ONE verified implementation.
//
// A `dump` (see dpd.schema.json $defs.dump):
//   message.matcher   {prefix:[hex|$deviceId|$modelId|$manufacturerId], suffix:[hex]}   wire framing
//   message.payload   {offset, size, pack?:encoding}   where data sits; optional whole-payload 8->7 pack
//   message.checksum  {type, fromOffset, toOffset, byteOffset}   integrity over a framed-message span
//   message.completion{messages, bytes}   multi-message banks (informational here; engine collects them)
//   layout[]          {param, offset, size?, codec?}   the device's REAL byte map (explicit offsets)
//
// `layout[].param` references a resolved id ("tone1.cutoff") or, for a single-instance scope, the
// forgiving "scope.paramId" alias. A layout entry may also reference a virtual id (e.g. "patchName")
// that has no parameter, as long as it carries a text codec. `codec` defaults to the parameter's own
// `encoding`; it is a superset of $defs.encoding adding u14 (two-byte MSB-first) and text-ascii /
// text-nibbled-ascii for patch names.
//
// parseDump handles ONE framed SysEx message. Multi-message banks (completion.messages > 1) are
// expressed for emit but collected by the C++ engine; the DPD verifies single-message round-trips.

import { resolveParams } from './resolve.mjs';
import { hexToBytes, encodeValue, decodeValue, pack8to7, unpack8to7, checksumOf, bitsliceMask, bitsliceWidth } from './codecs.mjs';

// value codecs encodeValue/decodeValue understand directly; everything else is handled in (en|de)codeField.
const VALUE_CODECS = new Set(['u7', 'u8', 's7', 'nibbles', 'packed8to7', 'bitslice']);
const valueCodec = (c) => (c && VALUE_CODECS.has(c.type)) ? c : { type: 'u7' };
// A parameter's own encoding used as its dump field's codec: the ones a dump byte holds as a plain
// byte (a switch sent as 0/127, a value sent as a 14-bit pair but dumped as one byte) read as u7.
const AS_U7 = new Set(['boolean-u7']);
const isText = (c) => c?.type === 'text-ascii' || c?.type === 'text-nibbled-ascii';

const enumWire = (param, id) => { const e = param?.enum?.find((x) => x.id === id); return e ? e.wire : 0; };
const enumId = (param, wire) => { const e = param?.enum?.find((x) => x.wire === wire); return e ? e.id : wire; };
const manufBytes = (r) => Array.isArray(r?.manufacturerId)
  ? r.manufacturerId.map((h) => parseInt(h, 16) & 0xff)
  : hexToBytes(r?.manufacturerId ?? '');

// Resolve a profile's params into a lookup keyed by resolvedId, plus a forgiving "scope.paramId" alias
// for instance 0 so single-tone layouts need not spell out "tone1.".
// Kept per scopes object: a dump's round trip resolves the map seven times, and a FANTOM checks 441
// dumps against 11,852 parameters, which took minutes. The Designer resolves a fresh copy per edit, so a
// changed model is a new object and is never served a stale map.
const paramMaps = new WeakMap();
function buildParamMap(resolved) {
  if (!resolved?.scopes) return {};
  const cached = paramMaps.get(resolved.scopes);
  if (cached) return cached;
  const map = buildParamMapUncached(resolved);
  paramMaps.set(resolved.scopes, map);
  return map;
}
function buildParamMapUncached(resolved) {
  const map = {};
  const params = resolveParams(resolved);
  for (const p of params) {
    map[p.resolvedId] = p;
    const alias = `${p.scope}.${p.paramId}`;
    if (p.instance === 0 && !(alias in map)) map[alias] = p;
  }
  // A model converted from an engine profile names a parameter by the id the engine gives it, as the
  // emitter does (byOwnId): an instance of a named scope by its own ('part2.level'), any other by its
  // id. Without this its dump fields found no parameter, and were probed over the codec's whole range.
  for (const p of params) {
    const own = p.named ? p.legacyId : p.instance === 0 ? p.paramId : null;
    if (own && !(own in map)) map[own] = p;
  }
  return map;
}

// Substitute $deviceId / $modelId / $manufacturerId tokens to literal bytes; pass hex bytes through.
function substituteTokens(tokens, resolved) {
  const out = [];
  for (const tok of tokens ?? []) {
    if (tok === '$deviceId') out.push(...hexToBytes(resolved?.deviceId ?? ''));
    else if (tok === '$modelId') out.push(...hexToBytes(resolved?.modelId ?? ''));
    else if (tok === '$manufacturerId') out.push(...manufBytes(resolved));
    else out.push(parseInt(tok, 16) & 0xff);
  }
  return out;
}

// Natural byte width of a codec (used when a layout entry omits `size`).
function naturalSize(codec, param) {
  const t = codec?.type ?? 'u7';
  switch (t) {
    case 'u14': case 'u14-lsb': return 2;
    case 'nibbles': return codec.bytes ?? 2;
    case 'bitslice': return Math.max(...codec.slices.map((s) => s.byte)) + 1;
    case 'packed8to7': return pack8to7(new Array(codec.bytes ?? 1).fill(0), codec.packOrder, codec.groupSize ?? 7).length;
    case 'text-ascii': return codec.length ?? (param ? 0 : 0);
    case 'text-nibbled-ascii': return 2 * (codec.length ?? 0);
    default: return 1; // u7 / u8 / s7
  }
}

function resolveEntry(e, paramMap) {
  const param = paramMap[e.param];
  let codec = e.codec ?? param?.encoding ?? { type: 'u7' };
  if (AS_U7.has(codec.type)) codec = { type: 'u7' };
  const size = e.size ?? naturalSize(codec, param);
  return { param, codec, size };
}

// One layout field -> payload bytes. value is semantic: a number (continuous/signed), an enum id
// (string) or a name string (text codecs).
function encodeField(codec, value, param) {
  const t = codec?.type ?? 'u7';
  if (t === 'text-ascii') {
    const len = codec.length ?? String(value ?? '').length;
    const pad = codec.pad ?? 0x20;
    const s = String(value ?? '');
    const out = [];
    for (let i = 0; i < len; i++) out.push(i < s.length ? (s.charCodeAt(i) & 0x7f) : pad);
    return out;
  }
  if (t === 'text-nibbled-ascii') {
    const len = codec.length ?? String(value ?? '').length;
    const pad = codec.pad ?? 0x20;
    const s = String(value ?? '');
    const out = [];
    for (let i = 0; i < len; i++) {
      const code = i < s.length ? (s.charCodeAt(i) & 0xff) : pad;
      out.push((code >> 4) & 0x0f, code & 0x0f);
    }
    return out;
  }
  // A choice is sent as its wire value, whatever the codec (a Matriarch's settings are 14-bit).
  const v = param?.valueType === 'enum' ? enumWire(param, value) : value | 0;
  if (t === 'u14') return [(v >> 7) & 0x7f, v & 0x7f];       // MSB first
  if (t === 'u14-lsb') return [v & 0x7f, (v >> 7) & 0x7f];   // LSB first
  if (param?.valueType === 'enum') return encodeValue(valueCodec(codec), v);
  return encodeValue(codec, value | 0);
}

// Payload bytes -> one layout field's semantic value (inverse of encodeField).
function decodeField(codec, bytes, param) {
  const t = codec?.type ?? 'u7';
  if (t === 'text-ascii') {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b & 0x7f);
    return s.replace(/[\s\0]+$/, '');
  }
  if (t === 'text-nibbled-ascii') {
    let s = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(((bytes[i] & 0x0f) << 4) | (bytes[i + 1] & 0x0f));
    return s.replace(/[\s\0]+$/, '');
  }
  const asChoice = (n) => (param?.valueType === 'enum' ? enumId(param, n) : n);
  if (t === 'u14') return asChoice(((bytes[0] & 0x7f) << 7) | (bytes[1] & 0x7f));       // MSB first
  if (t === 'u14-lsb') return asChoice(((bytes[1] & 0x7f) << 7) | (bytes[0] & 0x7f));   // LSB first
  if (param?.valueType === 'enum') return enumId(param, decodeValue(valueCodec(codec), bytes));
  return decodeValue(codec, bytes);
}

// ── public API ──────────────────────────────────────────────────────────────────────────────────

// Assemble a complete wire dump (array of byte numbers) from semantic values keyed by layout param ref.
// ── where a field sits ─────────────────────────────────────────────────────────────────────────
//
// A field sits at its `offset` in the payload, or, in a payload of records (`payload.records`: the
// Groove Synthesis 3rd Wave's dump is every setting as its NRPN number and value, four bytes each), in
// the record its `record` key names, the one met while the key its `scope` names last held the
// scope's value (the 3rd Wave sets NRPN 0, the part, before each part's settings). A field with `when`
// is there only while another payload byte holds a value: a KRONOS EXi slot's settings mean one
// engine's or another's by the slot's type byte, a TWISTfm VALUE message's value by its first byte.
// The engine reads them this way (deviceProfileLocalEngine.js, DeviceProfileEngine.cpp).

const recordWidth = (type) => (type === 'u14' ? 2 : 1);
const putField = (out, at, type, v) => { if (recordWidth(type) === 2) { out[at] = (v >> 7) & 0x7f; out[at + 1] = v & 0x7f; } else out[at] = v & 0x7f; };
const getField = (bytes, at, type) => (recordWidth(type) === 2 ? ((bytes[at] & 0x7f) << 7) | (bytes[at + 1] & 0x7f) : bytes[at] & 0x7f);
const whenHolds = (e, payload) => !e.when || (payload[e.when.offset] & 0xff) === e.when.value;

// The records a set of values makes: the fields with no scope, then each scope's record and its fields.
function assembleRecords(rec, layout, valuesById, paramMap) {
  const out = [];
  const write = (key, valueBytes) => {
    const r = new Array(rec.size).fill(0);
    putField(r, rec.keyAt ?? 0, rec.keyType, key);
    for (let i = 0; i < valueBytes.length && (rec.valueAt ?? 1) + i < rec.size; i++) r[(rec.valueAt ?? 1) + i] = valueBytes[i] & 0x7f;
    out.push(...r);
  };
  const scopes = new Map();
  for (const e of layout) {
    if (e.record == null) continue;
    const key = e.scope ? `${e.scope.record}:${e.scope.value}` : '';
    (scopes.get(key) ?? scopes.set(key, []).get(key)).push(e);
  }
  for (const [key, entries] of [...scopes].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : 0))) {
    if (key) { const [k, v] = key.split(':').map(Number); const scopeBytes = []; putField(scopeBytes, 0, rec.valueType, v); write(k, scopeBytes); }
    for (const e of entries) {
      const { param, codec } = resolveEntry(e, paramMap);
      write(e.record, encodeField(codec, valuesById?.[e.param], param).slice(0, recordWidth(rec.valueType)));
    }
  }
  return out;
}

// Assemble a complete wire dump (array of byte numbers) from semantic values keyed by layout param ref.
// `force` ({ offset, value }) sets a payload byte before the fields that depend on it are written: the
// round trip checks each alternative of a `when` this way.
export function assembleDump(dump, valuesById, resolved, force = null) {
  const paramMap = buildParamMap(resolved);
  const msg = dump?.message ?? {};
  const layout = dump?.layout ?? [];
  const rec = msg.payload?.records ?? null;

  let payload;
  if (rec) payload = assembleRecords(rec, layout, valuesById, paramMap);
  else {
    const payloadSize = msg.payload?.size ?? layout.reduce((max, e) => {
      const { size } = resolveEntry(e, paramMap);
      return Math.max(max, (e.offset ?? 0) + size);
    }, 0);
    payload = new Array(payloadSize).fill(0);
    const place = (e) => {
      const { param, codec, size } = resolveEntry(e, paramMap);
      const bytes = encodeField(codec, valuesById?.[e.param], param);
      // A bit-sliced field writes only its own bits: a KRONOS keeps a switch in bit 6 of a byte
      // whose other bits are another parameter's.
      const mask = codec?.type === 'bitslice' ? bitsliceMask(codec) : null;
      for (let i = 0; i < size && i < bytes.length; i++) {
        const at = (e.offset ?? 0) + i;
        payload[at] = mask ? (payload[at] & ~mask[i]) | (bytes[i] & mask[i]) : bytes[i] & 0xff;
      }
    };
    // Fields that hold always, then the byte a `when` reads, then the fields it lets in.
    for (const e of layout) if (!e.when) place(e);
    if (force) payload[force.offset] = force.value;
    for (const e of layout) if (e.when && whenHolds(e, payload)) place(e);
  }

  const wirePayload = msg.payload?.pack
    ? pack8to7(payload, msg.payload.pack.packOrder ?? 'msb-high-first', msg.payload.pack.groupSize ?? 7)
    : payload;

  const prefix = substituteTokens(msg.matcher?.prefix, resolved);
  const suffix = substituteTokens(msg.matcher?.suffix, resolved);
  // A payload that starts after the prefix (a program number between them, as the Behringer Wave's
  // and Waldorf's dumps have) has those bytes as zeros: everything after them, the checksum too, is
  // where the dump definition says.
  const gap = Math.max(0, (msg.payload?.offset ?? prefix.length) - prefix.length);
  const out = [...prefix, ...new Array(gap).fill(0), ...wirePayload];

  const cs = msg.checksum;
  if (cs && cs.type !== 'none') {
    const span = out.slice(cs.fromOffset ?? prefix.length, (cs.toOffset ?? out.length - 1) + 1);
    out.push(checksumOf(cs.type, span)); // checksum sits immediately after the payload, before the suffix
  }
  out.push(...suffix);
  return out;
}

// Parse one framed wire dump back to semantic values + checksum status. A field whose `when` does not
// hold, or whose record the dump does not carry, is left out of valuesById.
export function parseDump(dump, bytes, resolved) {
  const paramMap = buildParamMap(resolved);
  const msg = dump?.message ?? {};
  const layout = dump?.layout ?? [];

  const prefix = substituteTokens(msg.matcher?.prefix, resolved);
  const suffix = substituteTokens(msg.matcher?.suffix, resolved);
  const prefixOk = prefix.every((b, i) => b === bytes[i]);
  const suffixOk = suffix.every((b, i) => b === bytes[bytes.length - suffix.length + i]);

  const cs = msg.checksum;
  const csLen = (cs && cs.type !== 'none') ? 1 : 0;
  let checksumStatus = 'none';
  if (csLen) {
    const span = bytes.slice(cs.fromOffset ?? prefix.length, (cs.toOffset ?? 0) + 1);
    checksumStatus = (checksumOf(cs.type, span) === bytes[cs.byteOffset ?? (bytes.length - suffix.length - 1)]) ? 'ok' : 'bad';
  }

  const payloadOffset = msg.payload?.offset ?? prefix.length;
  const wireLen = bytes.length - payloadOffset - suffix.length - csLen;
  let payload = bytes.slice(payloadOffset, payloadOffset + wireLen);
  if (msg.payload?.pack) payload = unpack8to7(payload, msg.payload.pack.packOrder ?? 'msb-high-first', msg.payload.pack.groupSize ?? 7);

  const rec = msg.payload?.records ?? null;
  const records = [];
  if (rec) for (let at = 0; at + rec.size <= payload.length; at += rec.size) records.push({ key: getField(payload, at + (rec.keyAt ?? 0), rec.keyType), at });

  const valuesById = {};
  for (const e of layout) {
    const { param, codec, size } = resolveEntry(e, paramMap);
    if (!whenHolds(e, payload)) continue;
    if (rec) {
      if (e.record == null) continue;
      let held = -1, found = null;
      for (const r of records) {
        if (r.key === e.record && (!e.scope || held === e.scope.value)) { found = r; break; }
        if (e.scope && r.key === e.scope.record) held = getField(payload, r.at + (rec.valueAt ?? 1), rec.valueType);
      }
      if (!found) continue;
      const at = found.at + (rec.valueAt ?? 1);
      valuesById[e.param] = decodeField(codec, payload.slice(at, at + recordWidth(rec.valueType)), param);
      continue;
    }
    valuesById[e.param] = decodeField(codec, payload.slice(e.offset ?? 0, (e.offset ?? 0) + size), param);
  }
  return { valuesById, checksumStatus, prefixOk, suffixOk, ok: prefixOk && suffixOk && checksumStatus !== 'bad' };
}

// Numeric test range = codec capacity ∩ the parameter's declared range.
function codecRange(codec, param) {
  let lo = 0, hi = 127;
  const t = codec?.type ?? 'u7';
  if (t === 'u8') hi = 255;
  else if (t === 's7') { const off = codec.signedOffset ?? 64; lo = -off; hi = 127 - off; }
  else if (t === 'u14' || t === 'u14-lsb') hi = 16383;
  else if (t === 'nibbles') hi = (1 << (4 * (codec.bytes ?? 2))) - 1;
  else if (t === 'packed8to7') hi = Math.pow(2, 8 * (codec.bytes ?? 1)) - 1;
  else if (t === 'bitslice') {
    const w = bitsliceWidth(codec);
    if (codec.signed) { lo = -(2 ** (w - 1)); hi = 2 ** (w - 1) - 1; } else hi = 2 ** w - 1;
    if (codec.shiftRight) { lo >>= codec.shiftRight; hi >>= codec.shiftRight; }
    if (codec.max !== undefined) hi = Math.min(hi, codec.max);
  }
  if (param?.range) { lo = Math.max(lo, param.range.min); hi = Math.min(hi, param.range.max); }
  if (hi < lo) hi = lo;
  return [lo, hi];
}

function probeValue(level, param, codec, entry) {
  if (isText(codec)) {
    const len = codec.length ?? entry.size ?? 8;
    return 'PROBE NAME 0123456789'.slice(0, len);
  }
  // A value given by table: the table's first, middle and last.
  if (codec?.type === 'bitslice' && Array.isArray(codec.map) && codec.map.length && param?.valueType !== 'enum') {
    const n = codec.map.length;
    return codec.map[level === 'min' ? 0 : level === 'max' ? n - 1 : (n >> 1)][1];
  }
  if (param?.valueType === 'enum' && param.enum?.length) {
    const n = param.enum.length;
    const i = level === 'min' ? 0 : level === 'max' ? n - 1 : (n >> 1);
    return param.enum[i].id;
  }
  const [lo, hi] = codecRange(codec, param);
  return level === 'min' ? lo : level === 'max' ? hi : Math.floor((lo + hi) / 2);
}

const valuesEqual = (a, b) => (typeof a === 'string' || typeof b === 'string')
  ? String(a).replace(/[\s\0]+$/, '') === String(b).replace(/[\s\0]+$/, '')
  : a === b;

// Self-verification: assemble probe values (min / mid / max + enum cycle + sample names) -> parse ->
// compare. This is what legitimately computes provenance.verifiedFullDump. Returns { ok, failures }.
export function dumpRoundTrip(dump, resolved) {
  const paramMap = buildParamMap(resolved);
  const layout = dump?.layout ?? [];
  const failures = [];
  // Two fields on the same byte is a layout mistake, and fails: one of them cannot be read back.
  // Except a name also listed character by character (an SH-201's patch name, as text and as its
  // twelve characters, over the same bytes): the characters are checked, and the name is counted as
  // `shadowed`, not as passing. Bit slices share bytes by design.
  const shadowed = new Set();
  if (!dump?.message?.payload?.records) {
    const owner = new Map();
    for (const e of layout) {
      if (e.when || e.offset == null) continue;
      const { codec, size } = resolveEntry(e, paramMap);
      if (codec?.type === 'bitslice') continue;
      for (let i = 0; i < size; i++) {
        const before = owner.get(e.offset + i);
        if (before && before.e.param !== e.param) {
          const spelled = isText(before.codec) && size === 1 && !isText(codec);
          if (spelled) shadowed.add(before.e.param);
          else failures.push({ param: e.param, error: `shares byte ${e.offset + i} with ${before.e.param}` });
        }
        owner.set(e.offset + i, { e, codec });
      }
    }
  }
  for (const level of ['min', 'mid', 'max']) {
    const values = {};
    for (const e of layout) {
      const { param, codec } = resolveEntry(e, paramMap);
      values[e.param] = probeValue(level, param, codec, e);
    }
    // Once as the values fall, then once for each alternative of a `when` (an EXi slot holding each
    // engine in turn), each pass checking the fields it should have placed.
    const conditions = new Map();
    for (const e of layout) if (e.when) conditions.set(`${e.when.offset}:${e.when.value}`, e.when);
    for (const force of [null, ...conditions.values()]) {
      let parsed;
      try {
        parsed = parseDump(dump, assembleDump(dump, values, resolved, force), resolved);
      } catch (err) {
        failures.push({ level, error: String(err?.message ?? err) });
        break;
      }
      if (parsed.checksumStatus === 'bad') { failures.push({ level, error: 'checksum mismatch on self-assembled dump' }); break; }
      for (const e of layout) {
        const checked = !shadowed.has(e.param) && (force ? e.when?.offset === force.offset && e.when.value === force.value : !e.when || e.param in parsed.valuesById);
        if (checked && !valuesEqual(values[e.param], parsed.valuesById[e.param]))
          failures.push({ level, param: e.param, want: values[e.param], got: parsed.valuesById[e.param] });
      }
    }
  }
  return { ok: failures.length === 0, failures, shadowed: [...shadowed] };
}

// Byte map for the UI: each layout field's absolute position in the framed message + the checksum byte
// and payload region. Offsets are in WIRE bytes (post-pack), so for a packed payload they are advisory
// (the per-field boxes map to unpacked offsets; `packed` flags that).
export function dumpByteMap(dump, resolved) {
  const paramMap = buildParamMap(resolved);
  const msg = dump?.message ?? {};
  const layout = dump?.layout ?? [];
  const prefix = substituteTokens(msg.matcher?.prefix, resolved);
  const suffix = substituteTokens(msg.matcher?.suffix, resolved);
  const payloadOffset = msg.payload?.offset ?? prefix.length;
  const packed = !!msg.payload?.pack;
  const unpackedSize = msg.payload?.size ?? layout.reduce((m, e) => {
    const { size } = resolveEntry(e, paramMap); return Math.max(m, (e.offset ?? 0) + size);
  }, 0);
  const fields = layout.map((e) => {
    const { param, codec, size } = resolveEntry(e, paramMap);
    return { param: e.param, name: param?.name ?? e.param, offset: e.offset ?? 0, size, codec, valueType: param?.valueType ?? (isText(codec) ? 'text' : 'continuous') };
  }).sort((a, b) => a.offset - b.offset);
  const cs = msg.checksum;
  return {
    prefixLen: prefix.length, payloadOffset, unpackedSize, packed,
    // A payload of records places a field by its key, not at a byte: no ruler region per field.
    records: !!msg.payload?.records,
    suffixLen: suffix.length, fields,
    checksum: cs && cs.type !== 'none' ? { type: cs.type, byteOffset: cs.byteOffset } : null,
    completion: msg.completion ?? null,
  };
}
