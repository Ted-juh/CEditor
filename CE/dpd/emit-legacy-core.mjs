// Pure, browser-safe conversion: a resolved DPD profile -> the C++ engine's legacy
// .ceditor-device.json shape. Extracted from tools/emit-legacy.mjs so the in-app Designer can
// produce an engine-loadable profile on save (no Node CLI); the CLI re-uses this for the
// byte-identical generated file. Imports only browser-safe siblings.
import { resolveParams } from './resolve.mjs';
import { hexToBytes } from './codecs.mjs';

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

// `resolved` must be an inheritance-merged profile (deviceId etc. present) — see resolveProfile
// (Node) / resolveModel (browser). When `embedDpdModel` is given, the new-schema model is stamped
// into the legacy file so the in-app Designer can reload the exact edited source (round-trip).
export function buildLegacyProfile(resolved, { legacyId = 'roland-gaia-dpd', name, embedDpdModel } = {}) {
  const params = resolveParams(resolved).filter((p) => p.instance === 0); // tone 1 + global
  const legacy = {
    schemaVersion: 1,
    profileVersion: resolved.version,
    minCEditorVersion: '0.9.0',
    id: legacyId,
    name: name ?? ((resolved.label ?? 'Device') + ' (from DPD)'),
    dpdSource: resolved.id,
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
  if (embedDpdModel) legacy.dpdModel = embedDpdModel;
  return legacy;
}
