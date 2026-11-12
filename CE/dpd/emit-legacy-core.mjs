// Pure, browser-safe conversion: a resolved DPD profile -> the C++ engine's legacy
// .ceditor-device.json shape. Extracted from tools/emit-legacy.mjs so the in-app Designer can
// produce an engine-loadable profile on save (no Node CLI); the CLI re-uses this for the generated
// file. DEVICE-AGNOSTIC: manufacturer / family / identity / message recipes / CC controllers are all
// derived from the resolved profile — no device is special-cased. Imports only browser-safe siblings.
import { resolveParams, copyJson } from './resolve.mjs';
import { hexToBytes } from './codecs.mjs';
import { assembleDump } from './dumps.mjs';

const flat = (rid) => rid.replace(/^[^.]+\./, '');
// The one id a resolved parameter goes by in the legacy profile — in its `parameters` entry AND in
// every dump mapping that names it. Instance 0 keeps its flat id (every existing panel and test binds
// `scMixVco1`, not `scene1.scMixVco1`); later instances keep the resolved prefix, which is what makes
// them distinct ids at all.
//
// Two places used to decide this separately and disagreed: the parameter list kept `scene2.` and the
// dump mappings flattened it. So the AN1x's Scene 2 dump named no Scene 2 parameter — all 111 of its
// mappings read into and wrote from Scene 1 — and the voiceCommon dump mapped Free-EG tracks 2-4 onto
// track 1, four offsets to one id. A Scene 2 read moved Scene 1's controls, and every built dump wrote
// Scene 1's values into Scene 2. One helper, so the two cannot drift again.
// A scope that names its instances (idTemplate) gives each its own id outright.
export const legacyParamId = (p) => p.legacyId ?? (p.instance > 0 ? p.resolvedId : flat(p.resolvedId));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined);

// A cc recipe's id. A plain controller on the profile's channel keeps the id it always had
// (`cc74`); one with a low-seven-bits controller (a 14-bit pair) or a channel of its own is a
// different message and gets its own recipe.
/** An nrpn or rpn recipe's id: the number, and what else makes it a message of its own. */
export function numberRecipeId(flavour, wire) {
  const number = String(wire[flavour] ?? '').replace(/\s+/g, '');
  const ch = wire.channel != null ? `@${String(wire.channel).replace(/^\$/, '')}` : '';
  const how = [wire.nullAfterSend != null ? `n${wire.nullAfterSend ? 1 : 0}` : '', wire.lowBits != null ? `l${wire.lowBits}c${wire.lowBitsController}` : '', wire.delayAfterMs != null ? `d${wire.delayAfterMs}` : '', (wire.size ?? 1) >= 2 ? '' : 'v7'].filter(Boolean).join('');
  // The id the emitter always gave a plain number on the profile's channel stays the same.
  return wire.channel == null && wire.nullAfterSend == null && wire.lowBits == null && wire.delayAfterMs == null ? flavour + number : `${flavour}${number}${ch}${how ? `_${how}` : ''}`;
}

export function ccRecipeId(wire) {
  const lsb = wire.lsbCc != null ? `_${wire.lsbCc}` : '';
  const ch = wire.channel != null ? `@${String(wire.channel).replace(/^\$/, '')}` : '';
  return `cc${wire.cc}${lsb}${ch}`;
}

// The engine-only details a profile converted from the engine's format carries (`engine`, written by
// tools/from-legacy.mjs as the difference between that profile and what is derived here), laid over
// what was derived: a key set to null is left out. Without one, nothing changes.
function applyEngine(out, engine) {
  if (!engine || typeof engine !== 'object') return out;
  for (const [key, value] of Object.entries(engine)) {
    if (value === null) delete out[key];
    else out[key] = copyJson(value);
  }
  return out;
}
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
  // A dump marked frameOnly is emitted with an empty layout too: a Yamaha bulk header or footer frames
  // the collection and maps nothing.
  const framed = (d) => d.message?.matcher && (d.layout?.length || d.frameOnly === true);
  const dumps = all.filter(framed);
  for (const d of all) if (!framed(d))
    notes.push(`dump ${d.id}: declared without a byte layout (message.matcher + layout) — no engine dumpDefinition emitted; supply its byte map from the device manual/capture`);
  if (!dumps.length) return { dumpDefinitions: undefined, notes };

  const paramMap = {};
  // A mapping naming a parameter by its own id finds that parameter first: a named scope's
  // resolved ids (part1.x for its first instance) can be another instance's own id (part1.x of a
  // scope numbered from 0).
  const byOwnId = new Map();
  for (const p of resolveParams(resolved)) {
    if (p.legacyId) byOwnId.set(p.legacyId, p);
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
    // A count given as null is left out (a collection the instrument sizes, ended by its footer).
    def.completion = {};
    if (m.completion?.messages !== null) def.completion.expectedMessages = m.completion?.messages ?? 1;
    if (m.completion?.bytes !== null) def.completion.expectedBytes = m.completion?.bytes ?? assembleDump(d, {}, resolved).length;
    def.mappings = (d.layout ?? []).map((e) => {
      const p = byOwnId.get(e.param) ?? paramMap[e.param];
      const codec = legacyDumpCodec(e.codec, note);
      // A record's mapping names its record, not an offset; `engine` carries what else it has.
      const mapping = {
        parameter: p ? legacyParamId(p) : e.param, ...(e.offset != null ? { offset: e.offset } : {}), ...(codec ? { codec } : {}),
        // A record's key (and the record it follows), and a condition on another payload byte.
        ...Object.fromEntries(['record', 'scope', 'when'].filter((k) => e[k] != null).map((k) => [k, copyJson(e[k])])),
      };
      return applyEngine(mapping, e.engine);
    });
    if (d.requestShape) def.requestRecipe = d.requestShape;
    return applyEngine(def, d.engine);
  });
  return { dumpDefinitions, notes };
}

// A `requests` entry per dump that names a request shape.
//
// `requestRecipe` on a dumpDefinition is read by nothing — not the engine, not the web app — so a
// dump could declare a requestShape, emit cleanly, and still be unaskable. What the engine reads is
// the top-level `requests` array with `response: { kind: "bulkDump", dump: <id> }`, and until now
// only the preset name-scan produced one. A block the profile can parse but cannot ask for is a
// block the user can only capture by pressing buttons on the instrument.
export function buildDumpRequests(resolved, modelBytes, emittedDumpIds = null) {
  const shapes = resolved.messageShapes ?? [];
  const out = [];
  for (const d of resolved.dumps ?? []) {
    // ONLY for a dump that actually became a dumpDefinition. A dump declared with just spans and a
    // requestShape is a placeholder whose byte layout is still in somebody's manual, and
    // buildDumpDefinitions rightly emits nothing for it — but this used to emit a request pointing
    // at it anyway. The engine then refused the whole profile for an unknown dump reference and
    // said nothing, so the device simply was not in the list. The GAIA, whose `patch` dump is
    // exactly that placeholder, was one regeneration away from disappearing.
    if (emittedDumpIds && !emittedDumpIds.has(d.id)) continue;
    const shape = shapes.find((s) => s.id === d.requestShape);
    if (!shape || out.some((r) => r.id === shape.id)) continue;
    out.push({
      id: shape.id,
      name: `Request ${d.name ?? d.id}`,
      kind: shape.kind ?? 'sysex',
      template: (shape.template ?? []).flatMap((tok) => (tok === '$modelId' ? modelBytes : [tok])),
      response: { kind: 'bulkDump', dump: d.id },
      timeoutMs: 4000,
      retries: 1,
    });
  }
  return out;
}

/** Every `$name` a shape or matcher uses, so the emitted `variables` block can define them all. */
export function templateVariables(resolved) {
  const names = new Set();
  const scan = (tokens) => {
    for (const tok of tokens ?? []) if (typeof tok === 'string' && tok.startsWith('$')) names.add(tok.slice(1));
  };
  for (const s of resolved.messageShapes ?? []) scan(s.template);
  for (const d of resolved.dumps ?? []) {
    scan(d.message?.matcher?.prefix);
    scan(d.message?.matcher?.suffix);
  }
  return names;
}

// The engine's type for each DPD value type, one to one. Everything but a choice and a name used to
// be emitted as an integer, so a signed value, a switch and a button all lost what they were.
const LEGACY_TYPES = { enum: 'choice', text: 'text', signed: 'bipolar', toggle: 'boolean', trigger: 'action', momentary: 'momentary' };

function legacyParam(p, defaults = {}) {
  // The id follows legacyParamId (instance 0 flat, later instances prefixed) — the same rule the dump
  // mappings use. Later instances' names carry the instance too, because "Mixer VCO1 Level" twice in
  // a parameter list answers no question anyone is asking.
  // A named instance's name is its own ('Part 2 Level'); otherwise later instances say which they are.
  const instanced = p.instance > 0 && !p.named;
  const isText = p.valueType === 'text';
  const out = {
    id: legacyParamId(p),
    name: instanced ? `${p.name} (${p.scopeLabel ?? cap(p.scope)} ${p.instance + 1})` : p.name,
    group: p.group,
    type: LEGACY_TYPES[p.valueType] ?? 'integer',
  };
  // The DEVICE's default when the profile records one. The fallbacks below are placeholders, not
  // data: range.min is the bottom of the dial, and for a bipolar parameter that is the extreme, not
  // the centre. An AN1x initialised from those fallbacks writes -100 cent master tune, -12 dB into
  // all three EQ bands and a closed filter — so a profile that ships defaults must be preferred.
  if (isText) {
    // A name has no range and no choices — its value IS the string, and the engine's text encoder
    // reads `length` and `pad` off the encoding to lay it out. Emitting a range here would give it
    // a slider's metadata and a slider's drag-fit colour.
    out.default = typeof p.default === 'string' ? p.default : '';
  } else if (p.valueType === 'enum') {
    out.default = p.default ?? p.enum[0].id;
    out.choices = p.enum.map((e) => ({ id: e.id, label: e.label, value: e.wire }));
  } else {
    out.default = p.default ?? p.range?.min ?? 0;
    out.range = p.range ?? { min: 0, max: 127 };
  }
  if (p.absAddress) out.address = p.absAddress;
  // shortLabel takes the INSTANCED name: two scenes of the same 110 parameters put "VCF Cutoff"
  // twice in every picker otherwise, and the short label is the one the UI shows.
  out.display = { mode: p.valueType === 'enum' ? 'choice' : isText ? 'text' : 'number', shortLabel: out.name };
  // How the synth's own display writes it (dpd.schema.json parameterDisplay): ce.format.parameter
  // and the readouts read these from the descriptor. The two above are the emitter's and stay.
  if (p.display && typeof p.display === 'object') {
    for (const key of ['format', 'table', 'min', 'max', 'unit', 'precision', 'middleC', 'mode', 'shortLabel']) {
      if (p.display[key] !== undefined) out.display[key] = copyJson(p.display[key]);
    }
  }
  // A string has no normalized position — there is no 0..1 to put it on.
  if (!isText) out.normalization = { mode: p.valueType === 'enum' ? 'choiceIndex' : 'linear' };
  // DPD value-codec type -> the engine's single-parameter encoder vocabulary. s7 degrades to u7 (the
  // engine's send path has no signed encoder; profiles use raw wire ranges instead); u14 maps to the
  // engine's canonical 'u14-msb-lsb' (and u14-lsb to 'u14-lsb-msb'), which it both sends and decodes;
  // DPD's 'nibbles' is the engine's 'nibbled', with its count in the property the engine reads.
  // That last one is not hypothetical tidying: the engine matches the encoder name as an exact
  // string, so a parameter emitted as 'nibbles' fails its send with "Unsupported numeric encoder"
  // and the knob does nothing. The GAIA profile reached 622 such parameters before this was found.
  const encType = p.valueType === 'enum' ? 'enum'
    : isText ? (p.encoding?.type ?? 'text-ascii')
    : p.encoding?.type === 's7' ? 'u7'
    : p.encoding?.type === 'u14' ? 'u14-msb-lsb'
    : p.encoding?.type === 'u14-lsb' ? 'u14-lsb-msb'
    : p.encoding?.type === 'nibbles' ? 'nibbled'
    : (p.encoding?.type ?? 'u7');
  // The engine's text encoder reads `length` and `pad` off the encoding — without them it defaults
  // to one character and pads with spaces, which writes a one-byte name into a ten-byte field.
  out.encoding = encType === 'nibbled'
    ? { type: 'nibbled', nibbles: p.encoding?.bytes ?? 2 }
    : isText
      ? { type: encType, length: p.encoding?.length ?? 1, pad: p.encoding?.pad ?? 32 }
      : { type: encType };
  out.access = { canRead: p.access?.read !== false, canWrite: p.access?.write !== false, realtimeSafe: p.access?.realtimeSafe ?? true, source: p.access?.source ?? 'singleParameter' };
  // Its own send policy, or its model's for its value type; failing both, a name and a choice are
  // committed and the rest dragged. null: none at all.
  const sendPolicy = p.sendPolicy !== undefined ? p.sendPolicy : defaults.sendPolicy?.[p.valueType];
  if (sendPolicy !== null) out.sendPolicy = copyJson(sendPolicy ?? { mode: p.valueType === 'enum' || isText ? 'onCommit' : 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true });
  // sysex write wires reference the shape recipe by id (dt1); cc write wires reference a per-controller recipe.
  // A parameter only read back (from a dump) has no write wire and is sent with nothing; a converted
  // one says so with `wires: []`. One with no wires list at all keeps the DT1 it always defaulted to.
  out.messageRecipe = p.wiresDeclaredEmpty ? undefined
    : p.wires?.write?.msg === 'cc' ? ccRecipeId(p.wires.write)
    : p.wires?.write?.msg === 'nrpn' ? numberRecipeId('nrpn', p.wires.write)
    : p.wires?.write?.msg === 'rpn' ? numberRecipeId('rpn', p.wires.write)
    : (p.wires?.write?.shape ?? p.wires?.write?.msg ?? 'dt1');
  // An rxLive wire is the message the instrument SENDS when its own control moves, which need not be
  // the one the editor writes: a GAIA's filter knob is written as a DT1 to an address and transmitted
  // as CC 102/103/104. Nothing derived from the write path can recognise those, so the inbound index
  // needs it declared. This was resolved per instance and then dropped on the floor here, which is
  // why the Player still carried a hand-written CC map. Only emitted when it differs from the write
  // wire — when they are the same, the write path already describes the message.
  const rx = p.wires?.rxLive;
  const writeCc = p.wires?.write?.msg === 'cc' ? p.wires.write.cc : null;
  if (rx?.msg === 'cc' && rx.cc != null && rx.cc !== writeCc) out.inbound = [{ kind: 'cc', controller: rx.cc }];
  if (out.messageRecipe === undefined) delete out.messageRecipe;
  out.ui = p.ui ?? { preferredComponent: p.valueType === 'enum' ? 'RadioButtonGroup' : 'Slider' };
  if (p.description != null) out.description = p.description;
  return applyEngine(out, p.engine);
}

// Translate a new-schema messageShape into a legacy messageRecipe. The legacy engine resolves
// $deviceId/$address/$encodedValue/$size/$checksum from variables but NOT $modelId — so $modelId is
// expanded to its literal bytes here.
function shapeToRecipe(shape, resolved) {
  const modelBytes = toBytes(resolved.modelId);
  const template = (shape.template ?? []).flatMap((tok) => (tok === '$modelId' ? modelBytes : [tok]));
  const recipe = { id: shape.id, kind: shape.kind, template };
  if (shape.checksum && shape.checksum.type !== 'none') recipe.checksum = shape.checksum;
  // null asks for no delay at all, as a recipe converted from one without it (tools/from-legacy.mjs).
  if (shape.delayAfterMs !== null) recipe.delayAfterMs = shape.delayAfterMs ?? 20;
  return recipe;
}

// `resolved` must be an inheritance-merged profile (deviceId / messageShapes etc. present) — see
// resolveProfile (Node) / resolveModel (browser). `legacyId` defaults to `<id>-dpd`. When
// `embedDpdModel` is given, the new-schema model is stamped in so the Designer can reload the edit.
export function buildLegacyProfile(resolved, { legacyId, name, embedDpdModel, log } = {}) {
  // Every instance, not just the first. The scope machinery resolves them all — the AN1x's scene
  // scope declares two instances a stride apart, the GAIA's tone scope three — and this line used
  // to throw everything past instance 0 away. The AN1x is the instrument that makes that a lie a
  // user meets: its whole voice is TWO scenes morphed against each other, so a profile with one
  // scene can edit only half of any patch.
  const params = resolveParams(resolved);

  // Sysex recipes from the manufacturer's message shapes, then one CC recipe per distinct controller
  // (with its low-bits controller and channel, when it has them).
  const messageRecipes = (resolved.messageShapes ?? []).map((s) => shapeToRecipe(s, resolved));
  const ccWires = new Map();
  for (const p of params) {
    const w = p.wires?.write;
    if (w?.msg === 'cc' && w.cc != null && !ccWires.has(ccRecipeId(w))) ccWires.set(ccRecipeId(w), w);
  }
  for (const [id, w] of [...ccWires.entries()].sort((a, b) => a[1].cc - b[1].cc || a[0].localeCompare(b[0]))) {
    messageRecipes.push({
      id, kind: 'cc', channel: w.channel ?? '$channel', controller: w.cc,
      ...(w.lsbCc != null ? { lsbController: w.lsbCc } : {}),
      value: '$encodedValue',
    });
  }
  // One recipe per distinct parameter number, for both flavours. NRPN and RPN differ only in the
  // controller pair that selects the number — 99/98 against 101/100 — which is the engine's business
  // rather than the emitter's, so the two loops are the same loop with a different key.
  for (const flavour of ['nrpn', 'rpn']) {
    const seen = new Set();
    for (const p of params) {
      const wr = p.wires?.write;
      const number = wr?.[flavour];
      if (wr?.msg !== flavour || !number) continue;
      const id = numberRecipeId(flavour, wr);
      if (seen.has(id)) continue;
      seen.add(id);
      const [msb, lsb] = number.trim().split(/\s+/).map((h) => parseInt(h, 16));
      messageRecipes.push({
        id,
        kind: flavour,
        channel: wr.channel ?? '$channel',
        parameterMsb: msb,
        parameterLsb: lsb,
        // Korg's low bits replace the resolution: the value is split where they say.
        ...(wr.lowBits != null ? { lowBits: wr.lowBits, lowBitsController: wr.lowBitsController } : { valueResolution: (wr.size ?? 1) >= 2 ? 14 : 7 }),
        ...(wr.nullAfterSend != null ? { nullAfterSend: wr.nullAfterSend } : {}),
        ...(wr.delayAfterMs != null ? { messageDelayAfterMs: wr.delayAfterMs } : {}),
        value: '$encodedValue',
      });
    }
  }

  // A profile converted from the engine's format names its engine id and name in `engine`; asked
  // for none, the emitter derives them (`<id>-dpd`, `<label> (from DPD)`).
  const engineId = resolved.engine?.id;
  const engineName = resolved.engine?.name;
  const legacy = {
    schemaVersion: 1,
    profileVersion: resolved.version,
    minCEditorVersion: '0.9.0',
    id: legacyId ?? engineId ?? `${resolved.id}-dpd`,
    name: name ?? engineName ?? ((resolved.label ?? 'Device') + ' (from DPD)'),
    dpdSource: resolved.id,
    manufacturer: resolved.manufacturer ?? cap(resolved.inherits) ?? 'Generic',
    family: resolved.family ?? '',
    status: 'experimental',
    trust: 'local',
    // Every $name a template or matcher uses gets a home here. The engine resolves an undeclared
    // one to nothing, so a request whose address carries a $slot silently addressed byte 0.
    variables: {
      ...Object.fromEntries([...templateVariables(resolved)]
        .filter((n) => !['deviceId', 'modelId', 'manufacturerId', 'address', 'encodedValue', 'size', 'checksum', 'channel'].includes(n))
        .map((n) => [n, 0])),
      ...(resolved.deviceId != null ? { deviceId: hexToBytes(resolved.deviceId)[0] } : {}),
      channel: 1,
    },
    timing: { minDelayBetweenMessagesMs: 20 },
    parameters: params.map((p) => legacyParam(p, resolved.defaults)),
    messageRecipes,
  };

  // Device-inquiry identity is OPTIONAL — only emitted when the profile actually carries the codes
  // (a captured Identity Reply). We don't invent placeholder codes.
  //
  // The schema's key names are `family` and `member` (dpd.schema.json, identity), and this used to
  // look only for the legacy engine's names, `familyCode` and `modelNumber` — which no
  // schema-conformant profile can contain. So a profile whose family code WAS captured (the AN1x
  // has carried "02 1A" all along) emitted no identity, and its Test button answered "Could not
  // ask, profile has no identity declaration" at the person holding the actual instrument. Same
  // boundary disease as `nibbles` emitted under `bytes`: right data, wrong key, silent nothing.
  //
  // The engine compares only the fields that are declared, so manufacturer + family alone is a
  // legal identity that matches on what it names and reports the rest. No revision is emitted even
  // when the schema's `firmware` is present: firmware selects a VARIANT, and pinning it in the
  // identity made a genuine GAIA report "Wrong instrument" after a firmware update.
  {
    const family = resolved.identity?.family ?? resolved.identity?.familyCode;
    const member = resolved.identity?.member ?? resolved.identity?.modelNumber;
    if (family || member) {
      legacy.identity = {
        // No requestDeviceId, deliberately: compileIdentityRequest defaults to 0x7F, and 0x7F is
        // the Universal Device Inquiry's ALL CALL — every instrument answers it whatever its own
        // device number is set to. Addressing the inquiry to one specific device is backwards for
        // a button whose entire job is to find out what is out there before anything is configured.
        //
        // This emitted `requestDeviceId: '$deviceId'`, and $deviceId is NOT a universal device id.
        // For Yamaha it is the composite `1n` byte of a Parameter Change — the AN1x's 0x10 means
        // "substatus 1, device 1", correct in F0 43 1n and meaningless in F0 7E <id>, where it
        // reads as "device 17". So the inquiry went out addressed to a device that was not there,
        // the AN1x quite correctly said nothing, and Test reported no answer at someone holding a
        // working synth on a working cable.
        manufacturerId: toBytes(resolved.identity.manufacturerId ?? resolved.manufacturerId),
        ...(family ? { familyCode: toBytes(family) } : {}),
        ...(member ? { modelNumber: toBytes(member) } : {}),
        timeoutMs: 1000, retries: 0,
      };
    }
  }

  // Bulk dumps -> legacy dumpDefinitions (get-patch / send-patch). Notes flag any C++ engine gaps.
  const { dumpDefinitions, notes } = buildDumpDefinitions(resolved);
  if (dumpDefinitions) legacy.dumpDefinitions = dumpDefinitions;
  if (notes.length && log) for (const n of notes) log('[dump] ' + n);

  // Gated on what dumpDefinitions actually emitted — a request whose response names a dump the
  // profile does not carry makes the engine refuse the profile outright.
  const emittedDumpIds = new Set((dumpDefinitions ?? []).map((d) => d.id));
  const dumpRequests = buildDumpRequests(resolved, toBytes(resolved.modelId), emittedDumpIds);
  if (dumpRequests.length) (legacy.requests ??= []).push(...dumpRequests);

  // Preset model: carried through verbatim (the librarian/selector reads it), plus the legacy
  // engine's scan plumbing derived from it — a `requests` entry synthesized from the referenced
  // messageShape and a `presetBrowser` whose slots are the union of the bank ranges.
  if (resolved.presets) {
    legacy.presets = copyJson(resolved.presets);
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

  // The profile-wide display defaults (middleC): the engine hands them to each parameter.
  if (resolved.display && typeof resolved.display === 'object') legacy.display = copyJson(resolved.display);
  // What a patch of this synth is (ce.patch): read from the document as the author wrote it.
  if (resolved.patch && typeof resolved.patch === 'object') legacy.patch = copyJson(resolved.patch);

  // The engine-only fields of a converted profile, laid over the rest; an id or name the caller
  // asked for still stands.
  applyEngine(legacy, resolved.engine);
  if (legacyId) legacy.id = legacyId;
  if (name) legacy.name = name;
  legacy.dpdSource = resolved.id;

  if (embedDpdModel) legacy.dpdModel = embedDpdModel;
  return legacy;
}
