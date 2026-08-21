// Shared structural validator for DPD profiles. The formal contract is dpd.schema.json
// (usable by ajv / editors); this is the dependency-free check the tools + the in-app Designer run,
// kept in step with the schema's enums/required-fields so it's a real import gate (not a token check).
const KINDS = ['manufacturer', 'model', 'variant', 'component'];
const VALUE_TYPES = ['continuous', 'signed', 'enum', 'toggle', 'trigger', 'text'];
const WIRE_DIRS = ['write', 'read', 'rxLive'];
const WIRE_MSGS = ['dt1', 'rq1', 'cc', 'nrpn', 'rpn', 'raw'];
const CHECKSUM_TYPES = ['roland-7bit', 'sum-7bit', 'xor', 'none'];
const ENCODING_TYPES = ['u7', 'u8', 's7', 'u14', 'u14-lsb', 'nibbles', 'packed8to7', 'bitslice'];
const SHAPE_KINDS = ['sysex', 'cc', 'nrpn', 'rpn', 'raw'];
const SCOPE_KINDS = ['global', 'tone', 'part', 'effect', 'drumMap', 'patch'];
const DUMP_KINDS = ['patch', 'performance', 'bank'];
// The two text codecs are parameter encodings as well as dump codecs. A patch name is ONE value —
// ten bytes of ASCII at one address — and modelling it as ten one-byte parameters gives you ten
// knobs where a name field belongs, and a librarian with nothing to read.
const TEXT_CODEC_TYPES = ['text-ascii', 'text-nibbled-ascii'];
const PARAM_ENCODING_TYPES = [...ENCODING_TYPES, ...TEXT_CODEC_TYPES];
// per-offset dump codecs: the value-encoding set plus the two text (patch-name) codecs.
const DUMP_CODEC_TYPES = [...ENCODING_TYPES, ...TEXT_CODEC_TYPES];
const ADDRESS_RE = /^([0-9A-Fa-f]{2})(\s[0-9A-Fa-f]{2})*$/;

export function validateProfile(profile) {
  const errs = [];
  const E = (m) => errs.push(m);
  if (profile.schemaVersion !== 1) E('schemaVersion must be 1');
  if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(profile.id ?? '')) E('bad id');
  if (!/^\d+\.\d+\.\d+$/.test(profile.version ?? '')) E('bad version');
  if (!KINDS.includes(profile.kind)) E('bad kind');
  if (profile.kind === 'model' && !profile.scopes) E('model needs scopes');
  if (profile.kind === 'variant' && !profile.inherits) E('variant needs inherits');
  if (profile.byteOrder && !['msb-first', 'lsb-first'].includes(profile.byteOrder)) E(`bad byteOrder ${profile.byteOrder}`);

  if (profile.checksum) {
    if (!profile.checksum.type) E('checksum needs type');
    else if (!CHECKSUM_TYPES.includes(profile.checksum.type)) E(`bad checksum.type ${profile.checksum.type}`);
  }

  for (const s of profile.messageShapes ?? []) {
    if (!s.id || !s.kind || !Array.isArray(s.template)) E(`messageShape ${s.id ?? '?'}: needs id + kind + template`);
    else if (!SHAPE_KINDS.includes(s.kind)) E(`messageShape ${s.id}: bad kind ${s.kind}`);
    if (s.checksum?.type && !CHECKSUM_TYPES.includes(s.checksum.type)) E(`messageShape ${s.id}: bad checksum.type ${s.checksum.type}`);
  }

  for (const [sk, sc] of Object.entries(profile.scopes ?? {})) {
    if (sc.kind && !SCOPE_KINDS.includes(sc.kind)) E(`scope ${sk}: bad kind ${sc.kind}`);
    if (!Array.isArray(sc.parameters)) E(`scope ${sk}: needs a parameters array`);
    for (const p of sc.parameters ?? []) {
      const id = p.id ?? '?';
      if (!p.id) E(`${sk}: param missing id`);
      if (!VALUE_TYPES.includes(p.valueType)) E(`${sk}.${id}: bad valueType ${p.valueType}`);
      if (p.valueType === 'enum') {
        if (!Array.isArray(p.enum)) E(`${sk}.${id}: enum needs entries`);
        else p.enum.forEach((e, i) => {
          if (!e || e.id == null || e.wire == null) E(`${sk}.${id}: enum[${i}] needs id + wire`);
        });
      }
      if (p.encoding) {
        if (!PARAM_ENCODING_TYPES.includes(p.encoding.type)) E(`${sk}.${id}: bad encoding.type ${p.encoding.type}`);
        if (p.encoding.type === 'bitslice' && !Array.isArray(p.encoding.slices)) E(`${sk}.${id}: bitslice encoding needs slices`);
        if (TEXT_CODEC_TYPES.includes(p.encoding.type) && !(p.encoding.length > 0)) {
          E(`${sk}.${id}: a text encoding needs a positive length`);
        }
      }
      if (p.valueType === 'text' && !TEXT_CODEC_TYPES.includes(p.encoding?.type)) {
        E(`${sk}.${id}: a text parameter needs a text encoding`);
      }
      if (p.valueType === 'text' && p.size != null && p.size !== (p.encoding?.type === 'text-nibbled-ascii' ? p.encoding.length * 2 : p.encoding?.length)) {
        E(`${sk}.${id}: text size ${p.size} does not match its encoding length`);
      }
      if (p.address && !ADDRESS_RE.test(p.address)) E(`${sk}.${id}: bad address`);
      for (const w of [p.rxLive, ...(p.wires ?? [])].filter(Boolean)) {
        if (!WIRE_DIRS.includes(w.dir)) E(`${sk}.${id}: bad wire dir ${w.dir}`);
        if (!WIRE_MSGS.includes(w.msg)) E(`${sk}.${id}: bad wire msg ${w.msg}`);
      }
    }
  }

  for (const d of profile.dumps ?? []) {
    if (!d.id || !d.kind) E(`dump ${d.id ?? '?'}: needs id + kind`);
    else if (!DUMP_KINDS.includes(d.kind)) E(`dump ${d.id}: bad kind ${d.kind}`);
    const m = d.message;
    if (m) {
      if (m.checksum) {
        if (!CHECKSUM_TYPES.includes(m.checksum.type)) E(`dump ${d.id}: bad message.checksum.type ${m.checksum.type}`);
        else if (m.checksum.type !== 'none' && (m.checksum.fromOffset == null || m.checksum.toOffset == null || m.checksum.byteOffset == null))
          E(`dump ${d.id}: message.checksum needs fromOffset/toOffset/byteOffset`);
      }
      if (m.payload?.pack && !ENCODING_TYPES.includes(m.payload.pack.type)) E(`dump ${d.id}: bad payload.pack.type ${m.payload.pack.type}`);
    }
    (d.layout ?? []).forEach((e, i) => {
      if (!e.param || typeof e.param !== 'string') E(`dump ${d.id}: layout[${i}] needs a param ref`);
      if (!Number.isInteger(e.offset) || e.offset < 0) E(`dump ${d.id}: layout[${i}] needs an integer offset >= 0`);
      if (e.codec && !DUMP_CODEC_TYPES.includes(e.codec.type)) E(`dump ${d.id}: layout[${i}] bad codec.type ${e.codec.type}`);
    });
  }

  if (profile.presets) validatePresets(profile.presets, E);

  if (profile.provenance && !['official', 'community', 'imported', 'learn'].includes(profile.provenance.source))
    E('bad provenance.source');
  if (profile.completeness && !['full', 'partial', 'structural-only'].includes(profile.completeness))
    E('bad completeness');

  return { ok: errs.length === 0, errors: errs };
}

// The preset model: slot map (banks), recall action, name request, init patch. Kept in step with
// $defs.presets / presetBank / presetRecall in dpd.schema.json.
const PRESET_BANK_ROLES = ['factory', 'user'];
const PRESET_RECALL_KINDS = ['pc', 'bankPc', 'sysex'];

export function validatePresets(presets, E) {
  const banks = presets.banks ?? [];
  const ids = new Set();
  const ranges = [];
  banks.forEach((b, i) => {
    const id = b.id ?? `[${i}]`;
    if (!b.id) E(`presets.banks[${i}]: needs id`);
    else if (ids.has(b.id)) E(`presets.banks: duplicate id ${b.id}`);
    ids.add(b.id);
    if (!PRESET_BANK_ROLES.includes(b.role)) E(`presets bank ${id}: bad role ${b.role}`);
    if (!Number.isInteger(b.startSlot) || b.startSlot < 0) E(`presets bank ${id}: needs integer startSlot >= 0`);
    if (!Number.isInteger(b.slotCount) || b.slotCount < 1) E(`presets bank ${id}: needs integer slotCount >= 1`);
    if (Number.isInteger(b.startSlot) && Number.isInteger(b.slotCount)) ranges.push({ id, from: b.startSlot, to: b.startSlot + b.slotCount - 1 });
    if (Array.isArray(b.names) && Number.isInteger(b.slotCount) && b.names.length > b.slotCount)
      E(`presets bank ${id}: names catalog (${b.names.length}) exceeds slotCount (${b.slotCount})`);
    for (const f of ['programBase', 'bankMsb', 'bankLsb'])
      if (b[f] != null && !(Number.isInteger(b[f]) && b[f] >= 0 && b[f] <= 127)) E(`presets bank ${id}: ${f} must be 0-127`);
  });
  ranges.sort((a, b) => a.from - b.from);
  for (let i = 1; i < ranges.length; i += 1)
    if (ranges[i].from <= ranges[i - 1].to) E(`presets banks ${ranges[i - 1].id} and ${ranges[i].id}: slot ranges overlap`);

  const recall = presets.recall;
  if (recall) {
    if (!PRESET_RECALL_KINDS.includes(recall.kind)) E(`presets.recall: bad kind ${recall.kind}`);
    if (recall.kind === 'sysex' && !(Array.isArray(recall.template) && recall.template.length)) E('presets.recall: sysex recall needs a template');
    if (recall.channel != null && !(Number.isInteger(recall.channel) && recall.channel >= 1 && recall.channel <= 16)) E('presets.recall: channel must be 1-16');
    if (recall.checksum?.type && !CHECKSUM_TYPES.includes(recall.checksum.type)) E(`presets.recall: bad checksum.type ${recall.checksum.type}`);
  }

  if (presets.nameRequest && !presets.nameRequest.request) E('presets.nameRequest: needs a request id');

  const init = presets.initPatch;
  if (init) {
    if (!Number.isInteger(init.slot) || init.slot < 0) E('presets.initPatch: needs integer slot >= 0');
    else if (banks.length) {
      const bank = init.bank ? banks.find((b) => b.id === init.bank) : banks.find((b) => Number.isInteger(b.startSlot) && Number.isInteger(b.slotCount) && init.slot >= b.startSlot && init.slot < b.startSlot + b.slotCount);
      if (init.bank && !bank) E(`presets.initPatch: unknown bank ${init.bank}`);
      else if (bank && (init.slot < bank.startSlot || init.slot >= bank.startSlot + bank.slotCount)) E(`presets.initPatch: slot ${init.slot} is outside bank ${bank.id}`);
      else if (!init.bank && !bank) E(`presets.initPatch: slot ${init.slot} is not inside any bank`);
    }
  }
}
