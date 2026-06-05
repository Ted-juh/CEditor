// Emit the runtime maps a player needs, DERIVED from a resolved DPD profile.
// This is the "maps -> profile" generalization: the player's previously-hardcoded
// INBOUND_CC / INBOUND_SYSEX / paramRows become generated data, valid for ANY profiled
// device, not just the GAIA. Run: node CE/dpd/tools/emit-runtime.mjs roland.gaia
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProfile, resolveParams } from './dpd.mjs';

const id = process.argv[2] ?? 'roland.gaia';
const resolved = resolveProfile(id);
const params = resolveParams(resolved);

const out = {
  profileId: resolved.id,
  version: resolved.version,
  deviceId: resolved.deviceId,
  modelId: resolved.modelId,
  sysexIn: {},   // absolute DT1 address -> resolvedId  (incoming SysEx decode)
  ccIn: {},      // CC number -> resolvedId             (incoming CC live mirror)
  params: {},    // resolvedId -> { valueType, outAddress, size, enum: {id->wire} }
};

for (const p of params) {
  out.params[p.resolvedId] = {
    valueType: p.valueType,
    outAddress: p.wires.write?.address ?? null,
    outCc: p.wires.write?.cc ?? null,
    size: p.size,
    enum: p.enum ? Object.fromEntries(p.enum.map((e) => [e.id, e.wire])) : null,
  };
  // incoming routing
  if (p.wires.rxLive?.msg === 'dt1' && p.wires.rxLive.address) out.sysexIn[p.wires.rxLive.address] = p.resolvedId;
  if (p.wires.rxLive?.msg === 'cc') out.ccIn[p.wires.rxLive.cc] = p.resolvedId;
  // RQ1-readable params are also decodable from their DT1 reply address
  if (p.wires.read?.msg === 'rq1' && p.wires.read.address) out.sysexIn[p.wires.read.address] = p.resolvedId;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${id}.runtime.json`);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`wrote ${file}`);
console.log(`  sysexIn: ${Object.keys(out.sysexIn).length} addresses, ccIn: ${Object.keys(out.ccIn).length} CCs, params: ${Object.keys(out.params).length}`);
console.log(`  sample — CC ${Object.keys(out.ccIn).join('/')} -> cutoff; 10 00 01 00 -> ${out.sysexIn['10 00 01 00']}; 10 00 01 0C -> ${out.sysexIn['10 00 01 0C']}`);
