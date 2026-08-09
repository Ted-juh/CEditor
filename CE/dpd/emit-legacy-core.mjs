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
// (u7 / u8 / s7 / u14-msb-lsb / nibbled / text-ascii / text-nibbled-ascii / enum). The engine's dump
// decoder handles u7/u8/s7 directly; the two that remain unsupported there (per-field packed8to7,
// bitslice) degrade to u7 best-effort + a note — the DPD's own assemble/parse still handles them.
function legacyDumpCodec(codec, note) {
  switch (codec?.type) {
    case undefined: case 'u7': return undefined; // default; engine reads the parameter's own type
    case 'u8': return { type: 'u8' };
    case 's7': return { type: 's7', signedOffset: codec.signedOffset ?? 64 };
    case 'u14': return { type: 'u14-msb-lsb' };
    case 'u14-lsb': return { type: 'u14-lsb-msb' };
    // The engine's dump decoder reads the nibble count from a property called `nibbles`
    // (propInt (encoding, "nibbles", 2)). Emitting it as `bytes` left the count unread, so every
    // field wider than two nibbles silently decoded as two — the top byte of the value, and nothing
    // else. Same key on both sides of the boundary now.
    case 'nibbles': return { type: 'nibbled', nibbles: codec.bytes ?? 2 };
    case 'text-ascii': return { type: 'text-ascii', length: codec.length, pad: codec.pad ?? 32 };
    case 'text-nibbled-ascii': return { type: 'text-nibbled-ascii', length: codec.length, pad: codec.pad ?? 32 };
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
  // DPD value-codec type -> the engine's single-parameter encoder vocabulary. s7 degrades to u7 (the
  // engine's send path has no signed encoder; profiles use raw wire ranges instead); u14 maps to the
  // engine's canonical 'u14-msb-lsb' (and u14-lsb to 'u14-lsb-msb'), which it both sends and decodes;
  // DPD's 'nibbles' is the engine's 'nibbled', with its count in the property the engine reads.
  // That last one is not hypothetical tidying: the engine matches the encoder name as an exact
  // string, so a parameter emitted as 'nibbles' fails its send with "Unsupported numeric encoder"
  // and the knob does nothing. The GAIA profile reached 622 such parameters before this was found.
  const encType = p.valueType === 'enum' ? 'enum'
    : p.encoding?.type === 's7' ? 'u7'
    : p.encoding?.type === 'u14' ? 'u14-msb-lsb'
    : p.encoding?.type === 'u14-lsb' ? 'u14-lsb-msb'
    : p.encoding?.type === 'nibbles' ? 'nibbled'
    : (p.encoding?.type ?? 'u7');
  out.encoding = encType === 'nibbled'
    ? { type: 'nibbled', nibbles: p.encoding?.bytes ?? 2 }
    : { type: encType };
  out.access = { canRead: p.access?.read !== false, canWrite: p.access?.write !== false, realtimeSafe: true, source: 'singleParameter' };
  out.sendPolicy = { mode: p.valueType === 'enum' ? 'onCommit' : 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true };
  // sysex write wires reference the shape recipe by id (dt1); cc write wires reference a per-controller recipe.
  out.messageRecipe = p.wires?.write?.msg === 'cc' ? ('cc' + p.wires.write.cc)
    : p.wires?.write?.msg === 'nrpn' ? ('nrpn' + String(p.wires.write.nrpn ?? '').replace(/\s+/g, ''))
    : (p.wires?.write?.msg ?? 'dt1');
  // An rxLive wire is the message the instrument SENDS when its own control moves, which need not be
  // the one the editor writes: a GAIA's filter knob is written as a DT1 to an address and transmitted
  // as CC 102/103/104. Nothing derived from the write path can recognise those, so the inbound index
  // needs it declared. This was resolved per instance and then dropped on the floor here, which is
  // why the Player still carried a hand-written CC map. Only emitted when it differs from the write
  // wire — when they are the same, the write path already describes the message.
  const rx = p.wires?.rxLive;
  const writeCc = p.wires?.write?.msg === 'cc' ? p.wires.write.cc : null;
  if (rx?.msg === 'cc' && rx.cc != null && rx.cc !== writeCc) out.inbound = [{ kind: 'cc', controller: rx.cc }];
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

  // Preset model: carried through verbatim (the librarian/selector reads it), plus the legacy
  // engine's scan plumbing derived from it — a `requests` entry synthesized from the referenced
  // messageShape and a `presetBrowser` whose slots are the union of the bank ranges.
  if (resolved.presets) {
    legacy.presets = structuredClone(resolved.presets);
    const nameRequestId = resolved.presets.nameRequest?.request;
    const shape = (resolved.messageShapes ?? []).find((s) => s.id === nameRequestId);
    if (shape) {
      (legacy.requests ??= []).push({
        id: shape.id,
        name: 'Preset name request',
        kind: shape.kind ?? 'sysex',
        template: (shape.template ?? []).flatMap((tok) => (tok === '$modelId' ? toBytes(resolved.modelId) : [tok])),
      });
    } else if (nameRequestId && log) {
      log(`[presets] nameRequest "${nameRequestId}" has no matching messageShape — scan needs a request with that id`);
    }
    const banks = resolved.presets.banks ?? [];
    if (nameRequestId && banks.length) {
      legacy.presetBrowser = {
        request: nameRequestId,
        slotVariable: resolved.presets.nameRequest?.slotVariable ?? 'slot',
        slots: banks.flatMap((b) => Array.from({ length: b.slotCount ?? 0 }, (_, i) => (b.startSlot ?? 0) + i)),
      };
    }
  }

  if (embedDpdModel) legacy.dpdModel = embedDpdModel;
  return legacy;
}
