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

// Resolve scopes -> flat parameters with absolute addresses + directional wires.
export function resolveParams(resolved) {
  const out = [];
  for (const [scopeKey, scope] of Object.entries(resolved.scopes ?? {})) {
    const count = scope.instances ?? (scope.instancesFrom ? resolved.deviceStructure?.[scope.instancesFrom] : 1) ?? 1;
    const base = hexToBytes(scope.base ?? '00 00 00 00');
    const stride = hexToBytes(scope.stride ?? '00 00 00 00');
    for (let idx = 0; idx < count; idx++) {
      const instanceLabel = count > 1 ? `${scopeKey}${idx + 1}` : scopeKey;
      for (const p of scope.parameters ?? []) {
        const offset = hexToBytes(p.address ?? '');
        const absAddr = offset.length ? bytesToHex(resolveAddress(base, stride, idx, offset)) : null;
        out.push({
          resolvedId: `${instanceLabel}.${p.id}`, scope: scopeKey, instance: idx, paramId: p.id,
          name: p.name, group: p.group, valueType: p.valueType, range: p.range,
          encoding: p.encoding ?? { type: 'u7' }, access: p.access ?? { read: true, write: true },
          enum: p.enum, ui: p.ui, size: p.size ?? 1, absAddress: absAddr,
          wires: resolveWires(p, absAddr, idx),
        });
      }
    }
  }
  return out;
}

export function resolveWires(p, absAddr, idx) {
  if (Array.isArray(p.wires)) {
    const w = {};
    for (const wire of p.wires) w[wire.dir] = wire.msg === 'cc' ? { msg: 'cc', cc: wire.cc + (wire.ccStride ?? 0) * idx } : { msg: wire.msg, address: absAddr, size: p.size ?? 1 };
    return w;
  }
  const w = {};
  if (p.access?.write !== false && absAddr) w.write = { msg: 'dt1', address: absAddr, size: p.size ?? 1 };
  if (p.access?.read !== false && absAddr) w.read = { msg: 'rq1', address: absAddr, size: p.size ?? 1 };
  if (p.rxLive) w.rxLive = p.rxLive.msg === 'cc' ? { msg: 'cc', cc: p.rxLive.cc + (p.rxLive.ccStride ?? 0) * idx } : { msg: p.rxLive.msg, address: absAddr, size: p.size ?? 1 };
  else if (absAddr) w.rxLive = { msg: 'dt1', address: absAddr, size: p.size ?? 1 };
  return w;
}
