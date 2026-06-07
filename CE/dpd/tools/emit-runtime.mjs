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
  sysexIn: {},     // absolute DT1 address -> resolvedId  (incoming SysEx decode)
  ccIn: {},        // CC number -> resolvedId             (incoming CC live mirror)
  params: {},      // resolvedId -> { valueType, outAddress, size, enum: {id->wire} }
  mergeParams: {}, // resolvedId -> full self-contained slice for merge-on-drop (merge.mjs input)
};

for (const p of params) {
  out.params[p.resolvedId] = {
    valueType: p.valueType,
    outAddress: p.wires.write?.address ?? null,
    outCc: p.wires.write?.cc ?? null,
    size: p.size,
    enum: p.enum ? Object.fromEntries(p.enum.map((e) => [e.id, e.wire])) : null,
  };
  // Everything merge.mjs needs to build the self-contained value-tree section at drop time,
  // so the editor never has to re-resolve the profile in the browser.
  out.mergeParams[p.resolvedId] = {
    resolvedId: p.resolvedId,
    paramId: p.paramId,
    name: p.name,
    group: p.group,
    valueType: p.valueType,
    range: p.range ?? null,
    enum: p.enum ?? null,
    encoding: p.encoding ?? { type: 'u7' },
    access: p.access ?? { read: true, write: true },
    size: p.size,
    absAddress: p.absAddress,
    wires: p.wires,
  };
  // incoming routing
  if (p.wires.rxLive?.msg === 'dt1' && p.wires.rxLive.address) out.sysexIn[p.wires.rxLive.address] = p.resolvedId;
  if (p.wires.rxLive?.msg === 'cc') out.ccIn[p.wires.rxLive.cc] = p.resolvedId;
  // RQ1-readable params are also decodable from their DT1 reply address
  if (p.wires.read?.msg === 'rq1' && p.wires.read.address) out.sysexIn[p.wires.read.address] = p.resolvedId;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = join(HERE, '..', 'build');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${id}.runtime.json`);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`wrote ${file}`);
// Also emit into the web app so the player consumes it instead of hardcoded maps.
const webDir = join(HERE, '..', '..', 'web', 'src', 'CE_Application', 'generated');
mkdirSync(webDir, { recursive: true });
const webFile = join(webDir, `${id}.runtime.json`);
writeFileSync(webFile, JSON.stringify(out, null, 2));
console.log(`wrote ${webFile}`);
// (the merge-on-drop translation module is bundled into generated/dpd/ by emit-library.mjs — single source of truth.)
console.log(`  sysexIn: ${Object.keys(out.sysexIn).length} addresses, ccIn: ${Object.keys(out.ccIn).length} CCs, params: ${Object.keys(out.params).length}, mergeParams: ${Object.keys(out.mergeParams).length}`);
console.log(`  sample — CC ${Object.keys(out.ccIn).join('/')} -> cutoff; 10 00 01 00 -> ${out.sysexIn['10 00 01 00']}; 10 00 01 0C -> ${out.sysexIn['10 00 01 0C']}`);
