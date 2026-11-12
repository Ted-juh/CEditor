// Browser-safe resolution: scope expansion, directional wires, override algebra, mixins.
// Pure (imports only codecs), so the browser Designer and the Node tools share it.
import { hexToBytes, bytesToHex, resolveAddress } from './codecs.mjs';

// Override algebra: ordered set/add/remove/reorder against scopes.<scope>.parameters[.<id>].
export function applyOverrides(resolved, ops) {
  const out = structuredClone(resolved);
  for (const op of ops) {
    const path = (op.target ?? '').split('.');
    if (path[0] !== 'scopes' || path[2] !== 'parameters') continue;
    const scope = out.scopes?.[path[1]];
    if (!scope) continue;
    const params = scope.parameters ?? (scope.parameters = []);
    const paramId = path[3];
    if (op.op === 'set' && paramId) { const p = params.find((x) => x.id === paramId); if (p) Object.assign(p, op.value ?? {}); }
    else if (op.op === 'add' && op.value) params.push(op.value);
    else if (op.op === 'remove' && paramId) scope.parameters = params.filter((x) => x.id !== paramId);
    else if (op.op === 'reorder' && Array.isArray(op.order)) {
      const byId = Object.fromEntries(params.map((x) => [x.id, x]));
      scope.parameters = op.order.map((id) => byId[id]).filter(Boolean).concat(params.filter((x) => !op.order.includes(x.id)));
    }
  }
  return out;
}

// Mixin composition: included component scopes/params fill in; own (present) wins on id.
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

// `{n}` in every string of a value, the instance's number in its place.
function fillNumber(value, n) {
  if (typeof value === 'string') return value.replaceAll('{n}', String(n));
  if (Array.isArray(value)) return value.map((v) => fillNumber(v, n));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillNumber(v, n)]));
  return value;
}

/**
 * One instance of a scope's parameter, where the scope names its instances (`idTemplate`): `{n}` in
 * its strings filled with the instance's number (`first` + its index; a part's name, group, channel
 * variable), and the values it has per instance (`perInstance: { field: [one per instance] }`) taken.
 */
export function instanceParam(p, idx, n) {
  const { perInstance, ...rest } = p;
  const out = fillNumber(rest, n);
  // fillNumber copies as it goes: the designer resolves its live model, a Svelte state proxy, which
  // structuredClone refuses (DataCloneError), and a KRONOS's per-instance values were lost to it.
  for (const [field, values] of Object.entries(perInstance ?? {})) if (Array.isArray(values) && values[idx] !== undefined) out[field] = fillNumber(values[idx], n);
  return out;
}

// Resolve scopes -> flat parameters with absolute addresses + directional wires.
//
// A scope that names its instances (`idTemplate`, e.g. 'part{n}.{id}', `first` the first instance's
// number) gives each parameter of each instance its own id, and `{n}` in its strings that number:
// the engine profiles' own names ('Part 2 Level', group 'Part 2'). A scope without one is as it was:
// the first instance keeps the parameter's id, the others are '<scope><index>.<id>'.
export function resolveParams(resolved) {
  const out = [];
  for (const [scopeKey, scope] of Object.entries(resolved.scopes ?? {})) {
    const count = scope.instances ?? (scope.instancesFrom ? resolved.deviceStructure?.[scope.instancesFrom] : 1) ?? 1;
    const base = hexToBytes(scope.base ?? '00 00 00 00');
    const stride = hexToBytes(scope.stride ?? '00 00 00 00');
    const named = typeof scope.idTemplate === 'string';
    for (let idx = 0; idx < count; idx++) {
      const instanceLabel = count > 1 ? `${scopeKey}${idx + 1}` : scopeKey;
      const n = (scope.first ?? 1) + idx;
      for (const raw of scope.parameters ?? []) {
        const p = named ? instanceParam(raw, idx, n) : raw;
        const offset = hexToBytes(p.address ?? '');
        // A parameter whose address steps by its own amount (addressStride: a KRONOS insert effect's
        // switch, its address a byte longer than the effect type's) uses that, not the scope's.
        const step = p.addressStride ? hexToBytes(p.addressStride) : stride;
        const absAddr = offset.length ? bytesToHex(resolveAddress(base, step, idx, offset)) : null;
        out.push({
          resolvedId: `${instanceLabel}.${p.id}`, scope: scopeKey, scopeLabel: scope.label, instance: idx, paramId: p.id,
          name: p.name, group: p.group, valueType: p.valueType, range: p.range, default: p.default,
          encoding: p.encoding ?? { type: 'u7' }, access: p.access ?? { read: true, write: true },
          enum: p.enum, ui: p.ui, display: p.display, size: p.size ?? 1, absAddress: absAddr,
          // What a profile converted from the engine's format carries beyond the DPD's own fields:
          // its description, and `engine`, the engine-only details the emitter lays over what it
          // derives (tools/from-legacy.mjs computes it as exactly that difference).
          ...(p.description != null ? { description: p.description } : {}),
          ...(p.sendPolicy !== undefined ? { sendPolicy: p.sendPolicy } : {}),
          // `wires: []`: a parameter sent with nothing, only read back (from a dump).
          ...(Array.isArray(p.wires) && p.wires.length === 0 ? { wiresDeclaredEmpty: true } : {}),
          ...(p.engine ? { engine: p.engine } : {}),
          ...(named ? { legacyId: scope.idTemplate.replaceAll('{n}', String(n)).replaceAll('{id}', raw.id), named: true } : {}),
          wires: resolveWires(p, absAddr, idx, (rel) => bytesToHex(resolveAddress(base, step, idx, hexToBytes(rel)))),
        });
      }
    }
  }
  return out;
}

/** 'MM LL' moved on by `by` as one 14-bit number; unchanged when `by` is 0. */
function stepNumber(number, by) {
  if (!by || typeof number !== 'string') return number;
  const [msb, lsb] = number.trim().split(/\s+/).map((h) => parseInt(h, 16));
  const v = ((msb << 7) | lsb) + by;
  const hex2 = (x) => x.toString(16).toUpperCase().padStart(2, '0');
  return `${hex2((v >> 7) & 0x7f)} ${hex2(v & 0x7f)}`;
}

// resolveAddr (optional) resolves a wire's OWN relative address to absolute (base+stride+offset);
// without it, or for wires with no `address`, the param's resolved address is used (back-compat).
export function resolveWires(p, absAddr, idx, resolveAddr) {
  const addrOf = (wire) => (wire.address && resolveAddr ? resolveAddr(wire.address) : absAddr);
  // one wire -> its resolved form. cc strides per instance; nrpn carries its MSB/LSB; sysex its address.
  // A cc wire may name the controller carrying its low seven bits (a 14-bit pair, MSB first) and a
  // channel of its own (a variable such as $partChannel, or a fixed channel), as the engine's cc
  // recipes do; both stride with the instance like the controller itself.
  const wireOut = (wire) => wire.msg === 'cc'
    ? {
      msg: 'cc', cc: wire.cc + (wire.ccStride ?? 0) * idx,
      ...(wire.lsbCc != null ? { lsbCc: wire.lsbCc + (wire.ccStride ?? 0) * idx } : {}),
      ...(wire.channel != null ? { channel: wire.channel } : {}),
    }
    : wire.msg === 'nrpn' || wire.msg === 'rpn'
      // Its number, and how the engine sends it: a channel of its own, a null (7F 7F) after the
      // value, Korg's low bits first on another controller, a pause after the message.
      ? {
        // A number that steps with the instance (nrpnStride, on the 14-bit number) as a cc does.
        msg: wire.msg, [wire.msg]: stepNumber(wire[wire.msg], (wire[`${wire.msg}Stride`] ?? 0) * idx), size: wire.size ?? p.size ?? 1,
        ...Object.fromEntries(['channel', 'nullAfterSend', 'lowBits', 'lowBitsController', 'delayAfterMs']
          .filter((k) => wire[k] != null).map((k) => [k, wire[k]])),
      }
      : { msg: wire.msg, address: addrOf(wire), size: wire.size ?? p.size ?? 1, ...(wire.shape ? { shape: wire.shape } : {}) };

  if (Array.isArray(p.wires)) {
    const w = {};
    for (const wire of p.wires) w[wire.dir] = wireOut(wire);
    return w;
  }
  const w = {};
  if (p.access?.write !== false && absAddr) w.write = { msg: 'dt1', address: absAddr, size: p.size ?? 1 };
  if (p.access?.read !== false && absAddr) w.read = { msg: 'rq1', address: absAddr, size: p.size ?? 1 };
  if (p.rxLive) w.rxLive = wireOut(p.rxLive);
  else if (absAddr) w.rxLive = { msg: 'dt1', address: absAddr, size: p.size ?? 1 };
  return w;
}

// Browser-safe inheritance merge — mirrors tools/dpd.mjs resolveProfile, but over an in-memory
// library map (id -> profile) instead of the filesystem. Lets the in-app Designer produce a
// fully-resolved profile (deviceId, message shapes, checksum from the manufacturer) for emit.
export function resolveModel(model, library = {}) {
  let merged = model;
  if (model?.inherits && library[model.inherits]) {
    const parent = resolveModel(library[model.inherits], library);
    merged = {
      ...parent, ...model,
      manufacturerId: model.manufacturerId ?? parent.manufacturerId,
      deviceId: model.deviceId ?? parent.deviceId,
      identity: model.identity ?? parent.identity,
      checksum: model.checksum ?? parent.checksum,
      byteOrder: model.byteOrder ?? parent.byteOrder,
      messageShapes: model.messageShapes ?? parent.messageShapes,
      provenance: model.provenance ?? parent.provenance,
      scopes: model.scopes ?? structuredClone(parent.scopes),
    };
  }
  if (Array.isArray(merged.includes) && merged.includes.length) {
    merged = mergeIncludes(merged, merged.includes
      .map((ref) => library[ref.split('@')[0]]).filter(Boolean).map((c) => resolveModel(c, library)));
  }
  if (Array.isArray(merged.overrides) && merged.overrides.length) {
    merged = applyOverrides(merged, merged.overrides);
  }
  return merged;
}
