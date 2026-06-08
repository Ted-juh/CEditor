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
import { hexToBytes, encodeValue, decodeValue, pack8to7, unpack8to7, checksumOf } from './codecs.mjs';

// value codecs encodeValue/decodeValue understand directly; everything else is handled in (en|de)codeField.
const VALUE_CODECS = new Set(['u7', 'u8', 's7', 'nibbles', 'packed8to7', 'bitslice']);
const valueCodec = (c) => (c && VALUE_CODECS.has(c.type)) ? c : { type: 'u7' };
const isText = (c) => c?.type === 'text-ascii' || c?.type === 'text-nibbled-ascii';

const enumWire = (param, id) => { const e = param?.enum?.find((x) => x.id === id); return e ? e.wire : 0; };
const enumId = (param, wire) => { const e = param?.enum?.find((x) => x.wire === wire); return e ? e.id : wire; };
const manufBytes = (r) => Array.isArray(r?.manufacturerId)
  ? r.manufacturerId.map((h) => parseInt(h, 16) & 0xff)
  : hexToBytes(r?.manufacturerId ?? '');

// Resolve a profile's params into a lookup keyed by resolvedId, plus a forgiving "scope.paramId" alias
// for instance 0 so single-tone layouts need not spell out "tone1.".
function buildParamMap(resolved) {
  const map = {};
  if (!resolved?.scopes) return map;
  for (const p of resolveParams(resolved)) {
    map[p.resolvedId] = p;
    const alias = `${p.scope}.${p.paramId}`;
    if (p.instance === 0 && !(alias in map)) map[alias] = p;
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
    case 'u14': return 2;
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
  const codec = e.codec ?? param?.encoding ?? { type: 'u7' };
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
  if (t === 'u14') { const v = value | 0; return [(v >> 7) & 0x7f, v & 0x7f]; }
  if (param?.valueType === 'enum') return encodeValue(valueCodec(codec), enumWire(param, value));
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
  if (t === 'u14') return ((bytes[0] & 0x7f) << 7) | (bytes[1] & 0x7f);
  if (param?.valueType === 'enum') return enumId(param, decodeValue(valueCodec(codec), bytes));
  return decodeValue(codec, bytes);
}

// ── public API ──────────────────────────────────────────────────────────────────────────────────

// Assemble a complete wire dump (array of byte numbers) from semantic values keyed by layout param ref.
export function assembleDump(dump, valuesById, resolved) {
  const paramMap = buildParamMap(resolved);
  const msg = dump?.message ?? {};
  const layout = dump?.layout ?? [];

  const payloadSize = msg.payload?.size ?? layout.reduce((max, e) => {
    const { size } = resolveEntry(e, paramMap);
    return Math.max(max, (e.offset ?? 0) + size);
  }, 0);

  const payload = new Array(payloadSize).fill(0);
  for (const e of layout) {
    const { param, codec, size } = resolveEntry(e, paramMap);
    const bytes = encodeField(codec, valuesById?.[e.param], param);
    for (let i = 0; i < size && i < bytes.length; i++) payload[(e.offset ?? 0) + i] = bytes[i] & 0xff;
  }

  const wirePayload = msg.payload?.pack
    ? pack8to7(payload, msg.payload.pack.packOrder ?? 'msb-high-first', msg.payload.pack.groupSize ?? 7)
    : payload;

  const prefix = substituteTokens(msg.matcher?.prefix, resolved);
  const suffix = substituteTokens(msg.matcher?.suffix, resolved);
  const out = [...prefix, ...wirePayload];

  const cs = msg.checksum;
  if (cs && cs.type !== 'none') {
    const span = out.slice(cs.fromOffset ?? prefix.length, (cs.toOffset ?? out.length - 1) + 1);
    out.push(checksumOf(cs.type, span)); // checksum sits immediately after the payload, before the suffix
  }
  out.push(...suffix);
  return out;
}

// Parse one framed wire dump back to semantic values + checksum status.
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

  const valuesById = {};
  for (const e of layout) {
    const { param, codec, size } = resolveEntry(e, paramMap);
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
  else if (t === 'u14') hi = 16383;
  else if (t === 'nibbles') hi = (1 << (4 * (codec.bytes ?? 2))) - 1;
  else if (t === 'packed8to7') hi = Math.pow(2, 8 * (codec.bytes ?? 1)) - 1;
  if (param?.range) { lo = Math.max(lo, param.range.min); hi = Math.min(hi, param.range.max); }
  if (hi < lo) hi = lo;
  return [lo, hi];
}

function probeValue(level, param, codec, entry) {
  if (isText(codec)) {
    const len = codec.length ?? entry.size ?? 8;
    return 'PROBE NAME 0123456789'.slice(0, len);
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
  for (const level of ['min', 'mid', 'max']) {
    const values = {};
    for (const e of layout) {
      const { param, codec } = resolveEntry(e, paramMap);
      values[e.param] = probeValue(level, param, codec, e);
    }
    let parsed;
    try {
      parsed = parseDump(dump, assembleDump(dump, values, resolved), resolved);
    } catch (err) {
      failures.push({ level, error: String(err?.message ?? err) });
      continue;
    }
    if (parsed.checksumStatus === 'bad') failures.push({ level, error: 'checksum mismatch on self-assembled dump' });
    for (const e of layout) {
      if (!valuesEqual(values[e.param], parsed.valuesById[e.param]))
        failures.push({ level, param: e.param, want: values[e.param], got: parsed.valuesById[e.param] });
    }
  }
  return { ok: failures.length === 0, failures };
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
    suffixLen: suffix.length, fields,
    checksum: cs && cs.type !== 'none' ? { type: cs.type, byteOffset: cs.byteOffset } : null,
    completion: msg.completion ?? null,
  };
}
