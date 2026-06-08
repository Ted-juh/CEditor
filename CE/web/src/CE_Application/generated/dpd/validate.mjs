// Shared structural validator for DPD profiles. The formal contract is dpd.schema.json
// (usable by ajv / editors); this is the dependency-free check the tools + the in-app Designer run,
// kept in step with the schema's enums/required-fields so it's a real import gate (not a token check).
const KINDS = ['manufacturer', 'model', 'variant', 'component'];
const VALUE_TYPES = ['continuous', 'signed', 'enum', 'toggle', 'trigger'];
const WIRE_DIRS = ['write', 'read', 'rxLive'];
const WIRE_MSGS = ['dt1', 'rq1', 'cc', 'nrpn', 'raw'];
const CHECKSUM_TYPES = ['roland-7bit', 'sum-7bit', 'xor', 'none'];
const ENCODING_TYPES = ['u7', 'u8', 's7', 'u14', 'u14-lsb', 'nibbles', 'packed8to7', 'bitslice'];
const SHAPE_KINDS = ['sysex', 'cc', 'nrpn', 'raw'];
const SCOPE_KINDS = ['global', 'tone', 'part', 'effect', 'drumMap', 'patch'];
const DUMP_KINDS = ['patch', 'performance', 'bank'];
// per-offset dump codecs: the value-encoding set plus the two text (patch-name) codecs.
const DUMP_CODEC_TYPES = [...ENCODING_TYPES, 'text-ascii', 'text-nibbled-ascii'];
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
        if (!ENCODING_TYPES.includes(p.encoding.type)) E(`${sk}.${id}: bad encoding.type ${p.encoding.type}`);
        if (p.encoding.type === 'bitslice' && !Array.isArray(p.encoding.slices)) E(`${sk}.${id}: bitslice encoding needs slices`);
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

  if (profile.provenance && !['official', 'community', 'imported', 'learn'].includes(profile.provenance.source))
    E('bad provenance.source');
  if (profile.completeness && !['full', 'partial', 'structural-only'].includes(profile.completeness))
    E('bad completeness');

  return { ok: errs.length === 0, errors: errs };
}
