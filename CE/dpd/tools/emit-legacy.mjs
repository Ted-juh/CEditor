// Emit the C++ engine's legacy profile format (.ceditor-device.json) FROM a resolved DPD profile,
// so OUTBOUND is also DPD-sourced (single source of truth) without rewriting the engine.
// Writes a NEW id (roland-gaia-dpd) so the working profile is untouched. Outbound is already
// proven byte-identical (verify.mjs); this lets the live engine consume the DPD too.
// Run: node CE/dpd/tools/emit-legacy.mjs roland.gaia
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProfile, resolveParams, hexToBytes } from './dpd.mjs';

const id = process.argv[2] ?? 'roland.gaia';
const resolved = resolveProfile(id);
const params = resolveParams(resolved).filter((p) => p.instance === 0); // tone 1 + global
const flat = (rid) => rid.replace(/^[^.]+\./, '');

function legacyParam(p) {
  const out = {
    id: flat(p.resolvedId),
    name: p.name, group: p.group,
    type: p.valueType === 'enum' ? 'choice' : 'integer',
  };
  if (p.valueType === 'enum') {
    out.default = p.enum[0].id;
    out.choices = p.enum.map((e) => ({ id: e.id, label: e.label, value: e.wire }));
  } else {
    out.default = p.range?.min ?? 0;
    out.range = p.range ?? { min: 0, max: 127 };
  }
  if (p.absAddress) out.address = p.absAddress;
  out.display = { mode: p.valueType === 'enum' ? 'choice' : 'number', shortLabel: p.name };
  out.normalization = { mode: p.valueType === 'enum' ? 'choiceIndex' : 'linear' };
  out.encoding = { type: p.valueType === 'enum' ? 'enum' : (p.encoding?.type === 's7' ? 'u7' : (p.encoding?.type ?? 'u7')) };
  out.access = { canRead: p.access?.read !== false, canWrite: p.access?.write !== false, realtimeSafe: true, source: 'singleParameter' };
  out.sendPolicy = { mode: p.valueType === 'enum' ? 'onCommit' : 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true };
  out.messageRecipe = p.wires.write?.msg === 'cc' ? 'volumeCc' : 'dt1';
  out.ui = p.ui ?? { preferredComponent: p.valueType === 'enum' ? 'RadioButtonGroup' : 'Slider' };
  return out;
}

const legacy = {
  schemaVersion: 1,
  profileVersion: resolved.version,
  minCEditorVersion: '0.9.0',
  id: 'roland-gaia-dpd',
  name: (resolved.label ?? 'Device') + ' (from DPD)',
  // Backlink to the DPD this legacy profile was generated from, so the editor's merge-on-drop can
  // find the self-contained slice (mergeParams in <dpdSource>.runtime.json) and stamp source=id@version.
  dpdSource: id,
  manufacturer: 'Roland',
  family: 'SH',
  status: 'experimental',
  trust: 'local',
  variables: { deviceId: hexToBytes(resolved.deviceId)[0], channel: 1 },
  identity: {
    requestDeviceId: '$deviceId', manufacturerId: ['41'], familyCode: ['41', '02'],
    modelNumber: ['00', '00'], revision: ['00', '03', '00', '00'], timeoutMs: 1000, retries: 0,
  },
  timing: { minDelayBetweenMessagesMs: 20 },
  parameters: params.map(legacyParam),
  messageRecipes: [
    { id: 'dt1', kind: 'sysex', template: ['F0', '41', '$deviceId', '00', '00', '41', '12', '$address', '$encodedValue', '$checksum', 'F7'], checksum: { type: 'roland-7bit', from: '$address', to: '$encodedValue' }, delayAfterMs: 20 },
    { id: 'rq1', kind: 'sysex', template: ['F0', '41', '$deviceId', '00', '00', '41', '11', '$address', '$size', '$checksum', 'F7'], checksum: { type: 'roland-7bit', from: '$address', to: '$size' }, delayAfterMs: 20 },
    { id: 'volumeCc', kind: 'cc', channel: '$channel', controller: 7, value: '$encodedValue' },
  ],
};

const HERE = dirname(fileURLToPath(import.meta.url));
const out = join(HERE, '..', '..', 'profiles', 'test', 'roland-gaia-dpd.ceditor-device.json');
writeFileSync(out, JSON.stringify(legacy, null, 2));
console.log(`wrote ${out}`);
console.log(`  ${legacy.parameters.length} params; sample addresses: ` +
  legacy.parameters.filter((p) => p.address).slice(0, 3).map((p) => `${p.id}@${p.address}`).join(', '));

// Maintain the web-side map: legacy profile id -> its DPD source + version. The editor's
// merge-on-drop uses this to find the self-contained slice (mergeParams) and stamp source=id@version,
// since the C++ profile *summary* surfaces only id/name/filePath. Merge-friendly (many devices).
const webGen = join(HERE, '..', '..', 'web', 'src', 'CE_Application', 'generated');
mkdirSync(webGen, { recursive: true });
const mapFile = join(webGen, 'dpdProfileMap.json');
const map = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : {};
map[legacy.id] = { dpdSource: id, version: resolved.version };
writeFileSync(mapFile, JSON.stringify(map, null, 2));
console.log(`wrote ${mapFile} (${legacy.id} -> ${id}@${resolved.version})`);
