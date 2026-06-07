// Pure, browser-safe conversion: a resolved DPD profile -> the C++ engine's legacy
// .ceditor-device.json shape. Extracted from tools/emit-legacy.mjs so the in-app Designer can
// produce an engine-loadable profile on save (no Node CLI); the CLI re-uses this for the generated
// file. DEVICE-AGNOSTIC: manufacturer / family / identity / message recipes / CC controllers are all
// derived from the resolved profile — no device is special-cased. Imports only browser-safe siblings.
import { resolveParams } from './resolve.mjs';
import { hexToBytes } from './codecs.mjs';

const flat = (rid) => rid.replace(/^[^.]+\./, '');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined);
const toBytes = (hex) => (hex ? String(hex).trim().split(/\s+/) : []);

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
  // sysex write wires reference the shape recipe by id (dt1); cc write wires reference a per-controller recipe.
  out.messageRecipe = p.wires?.write?.msg === 'cc' ? ('cc' + p.wires.write.cc) : (p.wires?.write?.msg ?? 'dt1');
  out.ui = p.ui ?? { preferredComponent: p.valueType === 'enum' ? 'RadioButtonGroup' : 'Slider' };
  return out;
}

// Translate a new-schema messageShape into a legacy messageRecipe. The legacy engine resolves
// $deviceId/$address/$encodedValue/$size/$checksum from variables but NOT $modelId — so $modelId is
// expanded to its literal bytes here.
function shapeToRecipe(shape, resolved) {
  const modelBytes = toBytes(resolved.modelId);
  const template = (shape.template ?? []).flatMap((tok) => (tok === '$modelId' ? modelBytes : [tok]));
  const recipe = { id: shape.id, kind: shape.kind, template };
  if (shape.checksum && shape.checksum.type !== 'none') recipe.checksum = shape.checksum;
  recipe.delayAfterMs = shape.delayAfterMs ?? 20;
  return recipe;
}

// `resolved` must be an inheritance-merged profile (deviceId / messageShapes etc. present) — see
// resolveProfile (Node) / resolveModel (browser). `legacyId` defaults to `<id>-dpd`. When
// `embedDpdModel` is given, the new-schema model is stamped in so the Designer can reload the edit.
export function buildLegacyProfile(resolved, { legacyId, name, embedDpdModel } = {}) {
  const params = resolveParams(resolved).filter((p) => p.instance === 0); // tone 1 + global

  // Sysex recipes from the manufacturer's message shapes, then one CC recipe per distinct controller.
  const messageRecipes = (resolved.messageShapes ?? []).map((s) => shapeToRecipe(s, resolved));
  const ccControllers = [...new Set(
    params.filter((p) => p.wires?.write?.msg === 'cc' && p.wires.write.cc != null).map((p) => p.wires.write.cc)
  )].sort((a, b) => a - b);
  for (const cc of ccControllers) {
    messageRecipes.push({ id: `cc${cc}`, kind: 'cc', channel: '$channel', controller: cc, value: '$encodedValue' });
  }

  const legacy = {
    schemaVersion: 1,
    profileVersion: resolved.version,
    minCEditorVersion: '0.9.0',
    id: legacyId ?? `${resolved.id}-dpd`,
    name: name ?? ((resolved.label ?? 'Device') + ' (from DPD)'),
    dpdSource: resolved.id,
    manufacturer: resolved.manufacturer ?? cap(resolved.inherits) ?? 'Generic',
    family: resolved.family ?? '',
    status: 'experimental',
    trust: 'local',
    variables: { ...(resolved.deviceId != null ? { deviceId: hexToBytes(resolved.deviceId)[0] } : {}), channel: 1 },
    timing: { minDelayBetweenMessagesMs: 20 },
    parameters: params.map(legacyParam),
    messageRecipes,
  };

  // Device-inquiry identity is OPTIONAL — only emitted when the profile actually carries the codes
  // (a captured Identity Reply). We don't invent placeholder codes.
  if (resolved.identity?.familyCode || resolved.identity?.modelNumber) {
    legacy.identity = {
      requestDeviceId: '$deviceId',
      manufacturerId: toBytes(resolved.identity.manufacturerId ?? resolved.manufacturerId),
      familyCode: toBytes(resolved.identity.familyCode),
      modelNumber: toBytes(resolved.identity.modelNumber),
      revision: toBytes(resolved.identity.revision),
      timeoutMs: 1000, retries: 0,
    };
  }

  if (embedDpdModel) legacy.dpdModel = embedDpdModel;
  return legacy;
}
