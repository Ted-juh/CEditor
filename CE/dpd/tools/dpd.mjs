// DPD resolver + codecs + message builder.
// Pure JS, no deps. Resolves a model profile (inheritance + scopes) into flat parameters
// with absolute addresses and directional wires, encodes/decodes values, and builds the
// exact wire messages — so the new schema can be checked against known-good hardware bytes.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LIB_DIR = join(HERE, '..', 'library');

// ---- hex / 7-bit address arithmetic ----
export const hexToBytes = (s) => (s ?? '').trim().length ? s.trim().split(/\s+/).map((h) => parseInt(h, 16)) : [];
export const bytesToHex = (a) => a.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

// 7-bit add of two equal-length address byte arrays (Roland addresses carry at 0x80).
export function add7(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0);
  let carry = 0;
  for (let i = n - 1; i >= 0; i--) {
    const sum = (a[a.length - n + i] ?? 0) + (b[b.length - n + i] ?? 0) + carry;
    out[i] = sum & 0x7f;
    carry = sum >> 7;
  }
  return out;
}

// base + stride*idx + paramOffset, all as 7-bit address arrays.
export function resolveAddress(base, stride, idx, offset) {
  let addr = base.slice();
  for (let k = 0; k < idx; k++) addr = add7(addr, stride);
  return add7(addr, offset);
}

// ---- checksums ----
export function roland7bit(bytes) {
  const sum = bytes.reduce((s, b) => (s + b) & 0x7f, 0);
  return (128 - sum) & 0x7f;
}
export function checksumOf(type, bytes) {
  switch (type) {
    case 'roland-7bit': return roland7bit(bytes);
    case 'sum-7bit': return bytes.reduce((s, b) => (s + b) & 0x7f, 0);
    case 'xor': return bytes.reduce((s, b) => s ^ b, 0) & 0x7f;
    case 'none': return null;
    default: throw new Error(`unknown checksum type: ${type}`);
  }
}

// ---- value codecs (encode = value->wire bytes, decode = wire bytes->value) ----
export function encodeValue(encoding, value) {
  const t = encoding?.type ?? 'u7';
  if (t === 'u7') return [value & 0x7f];
  if (t === 'u8') return [value & 0xff];
  if (t === 's7') return [(value + (encoding.signedOffset ?? 64)) & 0x7f];
  if (t === 'nibbles') {
    const n = encoding.bytes ?? 2;
    const out = [];
    for (let i = 0; i < n; i++) out.push((value >> (4 * (n - 1 - i))) & 0x0f);
    return out;
  }
  if (t === 'bitslice') return bitsliceEncode(encoding, value);
  throw new Error(`encodeValue: unsupported type ${t}`);
}
export function decodeValue(encoding, bytes) {
  const t = encoding?.type ?? 'u7';
  if (t === 'u7' || t === 'u8') return bytes[0];
  if (t === 's7') return (bytes[0] & 0x7f) - (encoding.signedOffset ?? 64);
  if (t === 'nibbles') {
    const n = encoding.bytes ?? 2;
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 4) | (bytes[i] & 0x0f);
    return v;
  }
  if (t === 'bitslice') return bitsliceDecode(encoding, bytes);
  throw new Error(`decodeValue: unsupported type ${t}`);
}

// bitslice: value assembled from declared (byte, fromBit..toBit -> valueShift) slices.
export function bitsliceEncode(encoding, value) {
  const maxByte = Math.max(...encoding.slices.map((s) => s.byte));
  const out = new Array(maxByte + 1).fill(0);
  for (const s of encoding.slices) {
    const width = s.toBit - s.fromBit + 1;
    const mask = (1 << width) - 1;
    const chunk = (value >> s.valueShift) & mask;
    out[s.byte] |= (chunk & mask) << s.fromBit;
  }
  return out;
}
export function bitsliceDecode(encoding, bytes) {
  let v = 0;
  for (const s of encoding.slices) {
    const width = s.toBit - s.fromBit + 1;
    const mask = (1 << width) - 1;
    const chunk = (bytes[s.byte] >> s.fromBit) & mask;
    v |= chunk << s.valueShift;
  }
  return v;
}

// ---- Korg-style 8->7 block packing (the architecture doc's worked reference) ----
// 7 internal 8-bit bytes -> 8 transmitted 7-bit bytes: a leading MSB byte + 7 low-7 bytes.
// order 'msb-high-first': first internal byte's top bit lands at MSB-byte bit 6.
// order 'msb-low-first':  first internal byte's top bit lands at MSB-byte bit 0.
export function pack8to7(internal, order = 'msb-high-first', groupSize = 7) {
  const out = [];
  for (let g = 0; g < internal.length; g += groupSize) {
    const group = internal.slice(g, g + groupSize);
    let msb = 0;
    group.forEach((b, i) => {
      const bit = (b >> 7) & 1;
      msb |= bit << (order === 'msb-high-first' ? (groupSize - 1 - i) : i);
    });
    out.push(msb & 0x7f);
    for (const b of group) out.push(b & 0x7f);
  }
  return out;
}
export function unpack8to7(wire, order = 'msb-high-first', groupSize = 7) {
  const out = [];
  for (let g = 0; g < wire.length; g += groupSize + 1) {
    const msb = wire[g];
    const lows = wire.slice(g + 1, g + 1 + groupSize);
    lows.forEach((lo, i) => {
      const bit = (msb >> (order === 'msb-high-first' ? (groupSize - 1 - i) : i)) & 1;
      out.push((lo & 0x7f) | (bit << 7));
    });
  }
  return out;
}

// ---- profile loading + inheritance resolution ----
export function loadProfile(id, libDir = LIB_DIR) {
  return JSON.parse(readFileSync(join(libDir, `${id}.json`), 'utf8'));
}

// Resolve a profile: inherit parent conventions, compose includes (mixins), apply overrides.
// Resolution order on collision: own > included (declared order) > inherited.
export function resolveProfile(id, libDir = LIB_DIR) {
  const profile = loadProfile(id, libDir);
  let merged = profile;
  if (profile.inherits) {
    const parent = resolveProfile(profile.inherits, libDir);
    merged = {
      ...parent,
      ...profile,
      manufacturerId: profile.manufacturerId ?? parent.manufacturerId,
      deviceId: profile.deviceId ?? parent.deviceId,
      identity: profile.identity ?? parent.identity,
      checksum: profile.checksum ?? parent.checksum,
      byteOrder: profile.byteOrder ?? parent.byteOrder,
      messageShapes: profile.messageShapes ?? parent.messageShapes,
      provenance: profile.provenance ?? parent.provenance,
      // a variant has no own scopes -> inherit the model's; deep-clone so overrides don't mutate cache.
      scopes: profile.scopes ?? structuredClone(parent.scopes),
    };
  }
  if (Array.isArray(merged.includes) && merged.includes.length) {
    const comps = merged.includes.map((ref) => resolveProfile(ref.split('@')[0], libDir));
    merged = mergeIncludes(merged, comps);
  }
  if (Array.isArray(merged.overrides) && merged.overrides.length) {
    merged = applyOverrides(merged, merged.overrides);
  }
  return merged;
}

// Override algebra: ordered set/add/remove/reorder ops against scopes.<scope>.parameters[.<id>].
export function applyOverrides(resolved, ops) {
  const out = structuredClone(resolved);
  for (const op of ops) {
    const path = (op.target ?? '').split('.');
    if (path[0] !== 'scopes' || path[2] !== 'parameters') continue;
    const scope = out.scopes?.[path[1]];
    if (!scope) continue;
    const params = scope.parameters ?? (scope.parameters = []);
    const paramId = path[3];
    if (op.op === 'set' && paramId) {
      const p = params.find((x) => x.id === paramId);
      if (p) Object.assign(p, op.value ?? {});
    } else if (op.op === 'add' && op.value) {
      params.push(op.value);
    } else if (op.op === 'remove' && paramId) {
      scope.parameters = params.filter((x) => x.id !== paramId); // tombstone (suppressed on resolve)
    } else if (op.op === 'reorder' && Array.isArray(op.order)) {
      const byId = Object.fromEntries(params.map((x) => [x.id, x]));
      scope.parameters = op.order.map((id) => byId[id]).filter(Boolean)
        .concat(params.filter((x) => !op.order.includes(x.id)));
    }
  }
  return out;
}

// Mixin composition: included component scopes/params fill in; own (already present) wins on id.
export function mergeIncludes(resolved, components) {
  const out = structuredClone(resolved);
  out.scopes = out.scopes ?? {};
  for (const comp of components) {
    for (const [sk, sc] of Object.entries(comp.scopes ?? {})) {
      if (!out.scopes[sk]) { out.scopes[sk] = structuredClone(sc); continue; }
      const have = new Set((out.scopes[sk].parameters ?? []).map((p) => p.id));
      for (const p of sc.parameters ?? []) if (!have.has(p.id)) out.scopes[sk].parameters.push(structuredClone(p));
    }
  }
  return out;
}

// Resolve scopes -> flat parameters with absolute addresses + directional wires.
export function resolveParams(resolved) {
  const out = [];
  for (const [scopeKey, scope] of Object.entries(resolved.scopes ?? {})) {
    const count = scope.instances
      ?? (scope.instancesFrom ? resolved.deviceStructure?.[scope.instancesFrom] : 1)
      ?? 1;
    const base = hexToBytes(scope.base ?? '00 00 00 00');
    const stride = hexToBytes(scope.stride ?? '00 00 00 00');
    for (let idx = 0; idx < count; idx++) {
      const instanceLabel = count > 1 ? `${scopeKey}${idx + 1}` : scopeKey;
      for (const p of scope.parameters ?? []) {
        const offset = hexToBytes(p.address ?? '');
        const absAddr = offset.length ? bytesToHex(resolveAddress(base, stride, idx, offset)) : null;
        out.push({
          resolvedId: `${instanceLabel}.${p.id}`,
          scope: scopeKey, instance: idx, paramId: p.id,
          name: p.name, group: p.group, valueType: p.valueType,
          range: p.range, encoding: p.encoding ?? { type: 'u7' }, access: p.access ?? { read: true, write: true },
          enum: p.enum, ui: p.ui, size: p.size ?? 1,
          absAddress: absAddr,
          wires: resolveWires(p, absAddr, idx),
        });
      }
    }
  }
  return out;
}

function resolveWires(p, absAddr, idx) {
  // Explicit wires take precedence (e.g. a CC-only param like master volume).
  if (Array.isArray(p.wires)) {
    const w = {};
    for (const wire of p.wires) {
      w[wire.dir] = wire.msg === 'cc'
        ? { msg: 'cc', cc: wire.cc + (wire.ccStride ?? 0) * idx }
        : { msg: wire.msg, address: absAddr, size: p.size ?? 1 };
    }
    return w;
  }
  // Address-based default: write=DT1, read=RQ1, rxLive=DT1 (what the device emits on edit),
  // unless rxLive is overridden (e.g. the GAIA knob transmits CC).
  const w = {};
  if (p.access?.write !== false && absAddr) w.write = { msg: 'dt1', address: absAddr, size: p.size ?? 1 };
  if (p.access?.read !== false && absAddr) w.read = { msg: 'rq1', address: absAddr, size: p.size ?? 1 };
  if (p.rxLive) {
    w.rxLive = p.rxLive.msg === 'cc'
      ? { msg: 'cc', cc: p.rxLive.cc + (p.rxLive.ccStride ?? 0) * idx }
      : { msg: p.rxLive.msg, address: absAddr, size: p.size ?? 1 };
  } else if (absAddr) {
    w.rxLive = { msg: 'dt1', address: absAddr, size: p.size ?? 1 };
  }
  return w;
}

// ---- message builder: expand a messageShape template into wire bytes ----
export function buildMessage(resolved, shapeId, { addressHex, valueBytes = [], size = 1 }) {
  const shape = (resolved.messageShapes ?? []).find((s) => s.id === shapeId);
  if (!shape) throw new Error(`no messageShape '${shapeId}'`);
  const sizeBytes = hexToBytes(addressHex).map((_, i, arr) => (i === arr.length - 1 ? size : 0)); // size aligned to address width

  const expand = (tok) => {
    if (tok === '$deviceId') return hexToBytes(resolved.deviceId);
    if (tok === '$modelId') return hexToBytes(resolved.modelId);
    if (tok === '$address') return hexToBytes(addressHex);
    if (tok === '$encodedValue') return valueBytes;
    if (tok === '$size') return sizeBytes;
    if (tok === '$checksum') return ['CK']; // placeholder, filled below
    return [parseInt(tok, 16)];
  };

  // Build byte stream, remembering where the checksum range starts/ends.
  let bytes = [];
  const marks = {};
  for (const tok of shape.template) {
    if (tok === shape.checksum?.from) marks.from = bytes.length;
    const seg = expand(tok);
    if (seg[0] === 'CK') { marks.ck = bytes.length; bytes.push('CK'); }
    else bytes.push(...seg);
    if (tok === shape.checksum?.to) marks.to = bytes.length - 1;
  }
  if (shape.checksum && shape.checksum.type !== 'none') {
    const range = bytes.slice(marks.from, marks.to + 1);
    bytes[marks.ck] = checksumOf(shape.checksum.type, range);
  }
  return bytesToHex(bytes);
}
