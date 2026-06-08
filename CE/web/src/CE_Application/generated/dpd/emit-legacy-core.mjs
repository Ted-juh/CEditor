// Pure, browser-safe conversion: a resolved DPD profile -> the C++ engine's legacy
// .ceditor-device.json shape. Extracted from tools/emit-legacy.mjs so the in-app Designer can
// produce an engine-loadable profile on save (no Node CLI); the CLI re-uses this for the generated
// file. DEVICE-AGNOSTIC: manufacturer / family / identity / message recipes / CC controllers are all
// derived from the resolved profile — no device is special-cased. Imports only browser-safe siblings.
import { resolveParams } from './resolve.mjs';
import { hexToBytes } from './codecs.mjs';
import { assembleDump } from './dumps.mjs';

const flat = (rid) => rid.replace(/^[^.]+\./, '');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined);
const toBytes = (hex) => (hex ? String(hex).trim().split(/\s+/) : []);

// DPD per-offset dump codec -> the C++ engine's legacy dump codec vocabulary
// (u7 / u14-msb-lsb / nibbled / text-ascii / text-nibbled-ascii / enum). Types the engine's dump
// decoder does NOT implement (s7 signed, u8, packed8to7, bitslice) degrade to u7 best-effort + a note,
// mirroring the param-level s7->u7 policy — the DPD's own assemble/parse still handles them faithfully.
function legacyDumpCodec(codec, note) {
  switch (codec?.type) {
    case undefined: case 'u7': return undefined; // default; engine reads the parameter's own type
    case 'u14': return { type: 'u14-msb-lsb' };
    case 'nibbles': return { type: 'nibbled', bytes: codec.bytes ?? 2 };
    case 'text-ascii': return { type: 'text-ascii', length: codec.length, pad: codec.pad ?? 32 };
    case 'text-nibbled-ascii': return { type: 'text-nibbled-ascii', length: codec.length, pad: codec.pad ?? 32 };
    case 's7': note?.(`s7 -> u7 (engine dump decoder has no signed codec; offset lost on the live C++ path)`); return undefined;
    case 'u8': note?.(`u8 -> u7 (engine dump codec is 7-bit)`); return undefined;
    case 'packed8to7': note?.(`packed8to7 per-field unsupported by the engine dump decoder`); return undefined;
    case 'bitslice': note?.(`bitslice unsupported by the engine dump decoder`); return undefined;
    default: return undefined;
  }
}

// A resolved DPD dump model -> the engine's legacy `dumpDefinitions` entry. UNIVERSAL: matcher framing,
// payload window, checksum span and per-offset mappings translate directly from the schema's dump.
// Returns { dumpDefinitions, notes } — notes flag the two cases the C++ engine path can't do yet
// (payload-level block packing, and any per-field codec it lacks); the Designer still authors + verifies
// them via dumps.mjs. `$modelId` is expanded to literal bytes (engine resolves $deviceId, not $modelId).
export function buildDumpDefinitions(resolved) {
  const all = resolved.dumps ?? [];
  const notes = [];
  // Only dumps with real byte framing (a matcher + a layout) become engine dumpDefinitions. A dump
  // declared with just spans/requestShape is an unmapped placeholder (e.g. the GAIA, whose layout needs
  // its manual) — emit nothing for it so the legacy file stays clean, and flag it.
  const dumps = all.filter((d) => d.message?.matcher && (d.layout?.length));
  for (const d of all) if (!(d.message?.matcher && d.layout?.length))
    notes.push(`dump ${d.id}: declared without a byte layout (message.matcher + layout) — no engine dumpDefinition emitted; supply its byte map from the device manual/capture`);
  if (!dumps.length) return { dumpDefinitions: undefined, notes };

  const paramMap = {};
  for (const p of resolveParams(resolved)) {
    paramMap[p.resolvedId] = p;
    const alias = `${p.scope}.${p.paramId}`;
    if (p.instance === 0 && !(alias in paramMap)) paramMap[alias] = p;
  }
  const modelBytes = toBytes(resolved.modelId);

  const dumpDefinitions = dumps.map((d) => {
    const m = d.message ?? {};
    const note = (msg) => notes.push(`dump ${d.id}: ${msg}`);
    const def = {
      id: d.id, name: d.name ?? d.id, kind: 'sysex',
      matcher: {
        prefix: (m.matcher?.prefix ?? []).flatMap((t) => (t === '$modelId' ? modelBytes : [t])),
        suffix: m.matcher?.suffix ?? ['F7'],
      },
      payload: {
        ...(m.payload?.offset != null ? { offset: m.payload.offset } : {}),
        ...(m.payload?.size != null ? { size: m.payload.size } : {}),
        // Whole-payload 8->7 block packing (Korg) — the C++ engine unpacks it before per-offset mapping.
        ...(m.payload?.pack ? { pack: m.payload.pack } : {}),
      },
    };
    // roland-7bit / sum-7bit / xor are all computed by the engine's dump decoder.
    if (m.checksum && m.checksum.type !== 'none')
      def.checksum = { type: m.checksum.type, fromOffset: m.checksum.fromOffset, toOffset: m.checksum.toOffset, byteOffset: m.checksum.byteOffset };
    def.completion = {
      expectedMessages: m.completion?.messages ?? 1,
      expectedBytes: m.completion?.bytes ?? assembleDump(d, {}, resolved).length,
    };
    def.mappings = (d.layout ?? []).map((e) => {
      const p = paramMap[e.param];
      const codec = legacyDumpCodec(e.codec, note);
      return { parameter: p ? flat(p.resolvedId) : e.param, offset: e.offset, ...(codec ? { codec } : {}) };
    });
    if (d.requestShape) def.requestRecipe = d.requestShape;
    return def;
  });
  return { dumpDefinitions, notes };
}

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
  out.messageRecipe = p.wires?.write?.msg === 'cc' ? ('cc' + p.wires.write.cc)
    : p.wires?.write?.msg === 'nrpn' ? ('nrpn' + String(p.wires.write.nrpn ?? '').replace(/\s+/g, ''))
    : (p.wires?.write?.msg ?? 'dt1');
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
export function buildLegacyProfile(resolved, { legacyId, name, embedDpdModel, log } = {}) {
  const params = resolveParams(resolved).filter((p) => p.instance === 0); // tone 1 + global

  // Sysex recipes from the manufacturer's message shapes, then one CC recipe per distinct controller.
  const messageRecipes = (resolved.messageShapes ?? []).map((s) => shapeToRecipe(s, resolved));
  const ccControllers = [...new Set(
    params.filter((p) => p.wires?.write?.msg === 'cc' && p.wires.write.cc != null).map((p) => p.wires.write.cc)
  )].sort((a, b) => a - b);
  for (const cc of ccControllers) {
    messageRecipes.push({ id: `cc${cc}`, kind: 'cc', channel: '$channel', controller: cc, value: '$encodedValue' });
  }
  // one NRPN recipe per distinct NRPN parameter number (the engine handles legacy nrpn recipes).
  const nrpnSeen = new Set();
  for (const p of params) {
    const wr = p.wires?.write;
    if (wr?.msg !== 'nrpn' || !wr.nrpn || nrpnSeen.has(wr.nrpn)) continue;
    nrpnSeen.add(wr.nrpn);
    const [msb, lsb] = wr.nrpn.trim().split(/\s+/).map((h) => parseInt(h, 16));
    messageRecipes.push({ id: 'nrpn' + wr.nrpn.replace(/\s+/g, ''), kind: 'nrpn', channel: '$channel', parameterMsb: msb, parameterLsb: lsb, valueResolution: (wr.size ?? 1) >= 2 ? 14 : 7, value: '$encodedValue' });
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

  // Bulk dumps -> legacy dumpDefinitions (get-patch / send-patch). Notes flag any C++ engine gaps.
  const { dumpDefinitions, notes } = buildDumpDefinitions(resolved);
  if (dumpDefinitions) legacy.dumpDefinitions = dumpDefinitions;
  if (notes.length && log) for (const n of notes) log('[dump] ' + n);

  if (embedDpdModel) legacy.dpdModel = embedDpdModel;
  return legacy;
}
