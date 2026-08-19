// DPD foundation verification. Run: node CE/dpd/tools/verify.mjs
// Proves the new schema + ported GAIA reproduce known-good hardware behaviour, resolve scopes
// correctly (incl. multi-wire + per-tone CC), and that every codec round-trips across full range.
import {
  LIB_DIR, loadProfile, resolveProfile, resolveParams, buildMessage,
  encodeValue, decodeValue, pack8to7, unpack8to7, bitsliceEncode, bitsliceDecode,
  applyOverrides, mergeIncludes, resolveModel, bytesToHex,
  assembleDump, parseDump, dumpRoundTrip, dumpByteMap,
} from './dpd.mjs';
import { validateProfile } from './validate.mjs';
import { buildLegacyProfile, buildDumpDefinitions } from '../emit-legacy-core.mjs';
import { midiCiToProfile } from './import-midici.mjs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL: ' + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const section = (t) => console.log('\n— ' + t);

// ---------------------------------------------------------------- structural validation
section('Structural validation');
function validate(profile, id) {
  const { ok: good, errors } = validateProfile(profile);
  ok(good, `${id} validates` + (errors.length ? ' :: ' + errors.join('; ') : ''));
  return good;
}
validate(loadProfile('roland'), 'roland (manufacturer)');
validate(loadProfile('roland.gaia'), 'roland.gaia (model)');

// the validator must mirror the schema's enums/required-fields (was previously too lax — C4)
const ok0 = { schemaVersion: 1, id: 'x.y', version: '1.0.0', kind: 'model', scopes: { s: { parameters: [{ id: 'a', valueType: 'continuous' }] } } };
validate(ok0, 'minimal valid model');
const rejects = (p, why) => ok(!validateProfile(p).ok, `rejects: ${why}`);
rejects({ ...ok0, byteOrder: 'middle-out' }, 'bad byteOrder');
rejects({ ...ok0, checksum: { type: 'crc32' } }, 'bad checksum.type');
rejects({ ...ok0, scopes: { s: { parameters: [{ id: 'a', valueType: 'enum', enum: [{ label: 'X' }] }] } } }, 'enum entry missing id/wire');
rejects({ ...ok0, scopes: { s: { parameters: [{ id: 'a', valueType: 'continuous', encoding: { type: 'bitslice' } }] } } }, 'bitslice without slices');
rejects({ ...ok0, scopes: { s: { parameters: [{ id: 'a', valueType: 'continuous', encoding: { type: 'wat' } }] } } }, 'bad encoding.type');
rejects({ ...ok0, dumps: [{ id: 'd', kind: 'megadump' }] }, 'bad dump.kind');

// ---------------------------------------------------------------- resolution
section('Inheritance + scope resolution');
const gaia = resolveProfile('roland.gaia');
eq(gaia.manufacturerId, '41', 'inherited manufacturerId');
eq(gaia.deviceId, '7F', 'inherited deviceId (broadcast)');
eq(gaia.modelId, '00 00 41', 'own modelId');
ok(Array.isArray(gaia.messageShapes) && gaia.messageShapes.length === 2, 'inherited messageShapes (dt1, rq1)');

const params = resolveParams(gaia);
const by = (rid) => params.find((p) => p.resolvedId === rid);
eq(params.length, 3 * 13 + 1, 'resolved param count = 3 tones × 13 + 1 global');

// per-tone absolute addresses (the outbound map)
eq(by('tone1.filter.cutoff').absAddress, '10 00 01 0C', 'tone1 cutoff address');
eq(by('tone2.filter.cutoff').absAddress, '10 00 02 0C', 'tone2 cutoff address');
eq(by('tone3.filter.cutoff').absAddress, '10 00 03 0C', 'tone3 cutoff address');
eq(by('tone1.osc.wave').absAddress, '10 00 01 00', 'tone1 osc.wave address');
eq(by('tone1.lfo.shape').absAddress, '10 00 01 1C', 'tone1 lfo.shape address');
eq(by('tone1.filter.resonance').absAddress, '10 00 01 0F', 'tone1 resonance address');

// multi-wire: cutoff written via DT1 but received live via CC, per-tone (102/103/104)
eq(by('tone1.filter.cutoff').wires.write.msg, 'dt1', 'cutoff write = DT1');
eq(by('tone1.filter.cutoff').wires.read.msg, 'rq1', 'cutoff read = RQ1');
eq(by('tone1.filter.cutoff').wires.rxLive.msg, 'cc', 'cutoff rxLive = CC');
eq(by('tone1.filter.cutoff').wires.rxLive.cc, 102, 'tone1 cutoff rxLive CC 102');
eq(by('tone2.filter.cutoff').wires.rxLive.cc, 103, 'tone2 cutoff rxLive CC 103');
eq(by('tone3.filter.cutoff').wires.rxLive.cc, 104, 'tone3 cutoff rxLive CC 104');
// OSC/LFO: device emits DT1 on edit (rxLive defaults to DT1 at the write address)
eq(by('tone1.osc.wave').wires.rxLive.msg, 'dt1', 'osc.wave rxLive = DT1 (default)');
// write-only CC param
eq(by('global.master.volume').wires.write.msg, 'cc', 'master.volume write = CC');
eq(by('global.master.volume').wires.write.cc, 7, 'master.volume CC 7');
ok(!by('global.master.volume').wires.read, 'master.volume has no read wire (write-only)');

// reproduces the previously-hardcoded inbound maps (address->param, cc->param, enum wires)
section('Reproduces the hardcoded runtime maps (now derived from the profile)');
const sysexMap = Object.fromEntries(params.filter((p) => p.instance === 0 && p.absAddress).map((p) => [p.absAddress, p.paramId]));
eq(sysexMap['10 00 01 0C'], 'filter.cutoff', 'INBOUND_SYSEX 10 00 01 0C');
eq(sysexMap['10 00 01 0F'], 'filter.resonance', 'INBOUND_SYSEX 10 00 01 0F');
eq(sysexMap['10 00 01 00'], 'osc.wave', 'INBOUND_SYSEX 10 00 01 00');
eq(sysexMap['10 00 01 1C'], 'lfo.shape', 'INBOUND_SYSEX 10 00 01 1C');
eq(by('tone1.filter.cutoff').wires.rxLive.cc, 102, 'INBOUND_CC 102 -> filter.cutoff');
const oscEnum = Object.fromEntries(by('tone1.osc.wave').enum.map((e) => [e.id, e.wire]));
eq(oscEnum.pulse, 2, 'osc.wave enum: pulse=2');
eq(oscEnum.supersaw, 6, 'osc.wave enum: supersaw=6');

// ---------------------------------------------------------------- exact hardware bytes
section('Builds the exact bytes captured from the real GAIA this session');
const dt1 = (rid, val) => {
  const p = by(rid);
  const wire = p.valueType === 'enum' ? [val] : encodeValue(p.encoding, val);
  return buildMessage(gaia, 'dt1', { addressHex: p.absAddress, valueBytes: wire, size: p.size });
};
eq(dt1('tone1.filter.cutoff', 64), 'F0 41 7F 00 00 41 12 10 00 01 0C 40 23 F7', 'cutoff=64 DT1');
eq(dt1('tone1.osc.wave', 2), 'F0 41 7F 00 00 41 12 10 00 01 00 02 6D F7', 'osc.wave=Pulse(2) DT1');
eq(dt1('tone1.lfo.shape', 3), 'F0 41 7F 00 00 41 12 10 00 01 1C 03 50 F7', 'lfo.shape=Square(3) DT1');
eq(buildMessage(gaia, 'rq1', { addressHex: '10 00 01 0C', valueBytes: [], size: 1 }),
   'F0 41 7F 00 00 41 11 10 00 01 0C 00 00 00 01 62 F7', 'cutoff RQ1 read');
// tone 2/3 outbound use the resolved per-tone address
eq(dt1('tone2.osc.wave', 1), 'F0 41 7F 00 00 41 12 10 00 02 00 01 6D F7', 'tone2 osc.wave=1 DT1');
eq(dt1('tone3.lfo.shape', 5), 'F0 41 7F 00 00 41 12 10 00 03 1C 05 4C F7', 'tone3 lfo.shape=5 DT1');

// ---------------------------------------------------------------- codec round-trips
section('Codec round-trips (full range)');
let rt;
rt = true; for (let v = 0; v <= 127; v++) if (decodeValue({ type: 'u7' }, encodeValue({ type: 'u7' }, v)) !== v) rt = false;
ok(rt, 'u7 round-trips 0..127');
rt = true; for (let v = -63; v <= 63; v++) if (decodeValue({ type: 's7', signedOffset: 64 }, encodeValue({ type: 's7', signedOffset: 64 }, v)) !== v) rt = false;
ok(rt, 's7 round-trips -63..63');
rt = true; for (const e of by('tone1.osc.wave').enum) if (decodeValue({ type: 'u7' }, encodeValue({ type: 'u7' }, e.wire)) !== e.wire) rt = false;
ok(rt, 'osc.wave enum wires round-trip');
rt = true; for (let v = 0; v <= 255; v++) if (decodeValue({ type: 'nibbles', bytes: 2 }, encodeValue({ type: 'nibbles', bytes: 2 }, v)) !== v) rt = false;
ok(rt, 'nibbles(2) round-trips 0..255');
// bitslice: a 10-bit value across two bytes
const slice = { type: 'bitslice', slices: [{ byte: 0, fromBit: 0, toBit: 6, valueShift: 0 }, { byte: 1, fromBit: 0, toBit: 2, valueShift: 7 }] };
rt = true; for (let v = 0; v <= 1023; v++) if (bitsliceDecode(slice, bitsliceEncode(slice, v)) !== v) rt = false;
ok(rt, 'bitslice(10-bit) round-trips 0..1023');
// packed8to7 at the VALUE level (C1: previously unwired in encodeValue/decodeValue — would throw)
rt = true;
for (const order of ['msb-high-first', 'msb-low-first']) {
  for (let v = 0; v <= 255; v++) { const e = { type: 'packed8to7', bytes: 1, packOrder: order }; if (decodeValue(e, encodeValue(e, v)) !== v) rt = false; }
  for (let v = 0; v <= 65535; v += 257) { const e = { type: 'packed8to7', bytes: 2, packOrder: order }; if (decodeValue(e, encodeValue(e, v)) !== v) rt = false; }
}
ok(rt, 'packed8to7 value round-trips (1+2 bytes, both orders)');

// Korg 8->7 packing — the doc's footgun. Full 0..255 sweep per byte, both MSB orders, boundary combos.
section('Korg 8→7 block packing (all 256 values per byte, both orders)');
for (const order of ['msb-high-first', 'msb-low-first']) {
  let good = true;
  // each internal byte swept 0..255 independently
  for (let pos = 0; pos < 7 && good; pos++) {
    for (let v = 0; v <= 255 && good; v++) {
      const internal = [0, 0, 0, 0, 0, 0, 0]; internal[pos] = v;
      const round = unpack8to7(pack8to7(internal, order), order);
      if (round.join(',') !== internal.join(',')) good = false;
    }
  }
  // boundary combinations where the top bit flips
  for (const fill of [0, 127, 128, 255]) {
    const internal = new Array(7).fill(fill);
    if (unpack8to7(pack8to7(internal, order), order).join(',') !== internal.join(',')) good = false;
  }
  ok(good, `packed8to7 ${order} round-trips full range`);
}

// ---------------------------------------------------------------- override algebra + mixins
section('Override algebra + mixins (Layer 1)');
{
  const base = { scopes: { tone: { parameters: [
    { id: 'a', valueType: 'continuous', range: { min: 0, max: 127 } },
    { id: 'b', valueType: 'continuous' },
  ] } } };
  const over = applyOverrides(base, [
    { op: 'set', target: 'scopes.tone.parameters.a', value: { range: { min: 0, max: 64 } } },
    { op: 'add', target: 'scopes.tone.parameters', value: { id: 'c', valueType: 'continuous' } },
    { op: 'remove', target: 'scopes.tone.parameters.b' },
    { op: 'reorder', target: 'scopes.tone.parameters', order: ['c', 'a'] },
  ]);
  eq(over.scopes.tone.parameters.map((p) => p.id).join(','), 'c,a', 'override: add c, remove b, reorder -> [c,a]');
  eq(over.scopes.tone.parameters.find((p) => p.id === 'a').range.max, 64, 'override set: a.range.max = 64');
  eq(base.scopes.tone.parameters.length, 2, 'override does not mutate the base');

  const comp = { scopes: { tone: { parameters: [{ id: 'a', valueType: 'enum' }, { id: 'x', valueType: 'continuous' }] } } };
  const inc = mergeIncludes(base, [comp]);
  eq(inc.scopes.tone.parameters.map((p) => p.id).join(','), 'a,b,x', 'include: own a/b kept, x added');
  eq(inc.scopes.tone.parameters.find((p) => p.id === 'a').valueType, 'continuous', 'include: own a wins over component a');
}

// ---------------------------------------------------------------- legacy emit (device-agnostic)
section('legacy emit — device-agnostic');
{
  // GAIA: functional fields preserved; identity omitted (no captured codes); per-controller CC recipe.
  const gaia = buildLegacyProfile(resolveProfile('roland.gaia'), { legacyId: 'roland-gaia-dpd' });
  eq(gaia.manufacturer, 'Roland', 'GAIA manufacturer derived from inherits');
  eq(gaia.family, 'SH', 'GAIA family from model');
  ok(gaia.identity === undefined, 'GAIA identity omitted (no captured codes)');
  // The AN1x's family code was captured under the SCHEMA's key names (identity.family), and the
  // emitter used to look only for the legacy engine's (familyCode) — so the one profile that could
  // answer a Test button never got an identity block. The engine compares only declared fields, so
  // manufacturer + family without a member is a legal, matchable identity.
  {
    const an1x = buildLegacyProfile(resolveProfile('yamaha.an1x'), { legacyId: 'yamaha-an1x-dpd' });
    ok(an1x.identity !== undefined, 'AN1x identity emitted from schema keys');
    eq(JSON.stringify(an1x.identity.manufacturerId), JSON.stringify(['43']), 'AN1x manufacturer 43');
    eq(JSON.stringify(an1x.identity.familyCode), JSON.stringify(['02', '1A']), 'AN1x family from identity.family');
    ok(an1x.identity.modelNumber === undefined, 'no member captured -> none declared');
    ok(an1x.identity.revision === undefined, 'firmware selects a variant; identity never pins it');
    // The inquiry must be broadcast. $deviceId is the manufacturer's own addressing byte — for
    // Yamaha the composite `1n` of a Parameter Change, 0x10 meaning "device 1" — and putting it in
    // F0 7E <id> asks for device 17 instead, which nothing answers.
    ok(an1x.identity.requestDeviceId === undefined,
      'no requestDeviceId: the engine broadcasts to 7F, which every device answers');
  }
  eq(JSON.stringify(gaia.messageRecipes.find((r) => r.id === 'dt1').template),
    JSON.stringify(['F0', '41', '$deviceId', '00', '00', '41', '12', '$address', '$encodedValue', '$checksum', 'F7']),
    'GAIA dt1 recipe byte-identical (modelId expanded)');
  ok(gaia.messageRecipes.some((r) => r.id === 'cc7' && r.controller === 7), 'GAIA cc7 recipe (per-controller)');
  eq(gaia.parameters.find((p) => p.id === 'master.volume').messageRecipe, 'cc7', 'master.volume -> cc7 recipe');
  eq(gaia.parameters.find((p) => p.id === 'filter.cutoff').address, '10 00 01 0C', 'GAIA cutoff address unchanged');
  // rxLive — the message the instrument SENDS when its own knob moves. The GAIA writes cutoff as a
  // DT1 and transmits it as CC 102, so nothing derived from the write path can recognise the knob.
  // This emitter resolved the wire and then dropped it, which is why the Player carried a
  // hand-written CC map beside the profile it already had.
  eq(JSON.stringify(gaia.parameters.find((p) => p.id === 'filter.cutoff').inbound),
    JSON.stringify([{ kind: 'cc', controller: 102 }]), 'GAIA cutoff declares the CC its knob sends');
  ok(!gaia.parameters.find((p) => p.id === 'master.volume').inbound,
    'a parameter whose rxLive IS its write wire declares nothing extra');
  ok(!gaia.parameters.find((p) => p.id === 'filter.resonance').inbound,
    'a parameter with no CC rxLive declares nothing');

  // A synthetic non-Roland device must derive EVERYTHING from its own profile — nothing GAIA-specific.
  const lib = {
    acme: { id: 'acme', kind: 'manufacturer', version: '1.0.0', label: 'Acme', manufacturerId: '42', deviceId: '30',
      byteOrder: 'msb-first', checksum: { type: 'sum-7bit', from: '$address', to: '$encodedValue' },
      messageShapes: [{ id: 'dt1', kind: 'sysex', template: ['F0', '42', '$deviceId', '$modelId', '40', '$address', '$encodedValue', '$checksum', 'F7'], checksum: { type: 'sum-7bit', from: '$address', to: '$encodedValue' } }] },
    'acme.x': { id: 'acme.x', kind: 'model', version: '2.0.0', inherits: 'acme', modelId: '01 02', family: 'X',
      scopes: { part: { base: '00 00 00 00', parameters: [
        { id: 'cutoff', name: 'Cutoff', valueType: 'continuous', address: '00 00 00 10', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, wires: [{ dir: 'write', msg: 'cc', cc: 74 }] },
        { id: 'reso', name: 'Reso', valueType: 'continuous', address: '00 00 00 11', range: { min: 0, max: 127 }, encoding: { type: 'u7' } },
        { id: 'pitch', name: 'Pitch', valueType: 'continuous', range: { min: 0, max: 16383 }, size: 2, encoding: { type: 'u7' }, wires: [{ dir: 'write', msg: 'nrpn', nrpn: '01 20' }] } ] } } },
  };
  const k = buildLegacyProfile(resolveModel(lib['acme.x'], lib), {});
  eq(k.manufacturer, 'Acme', 'synthetic manufacturer derived (not Roland)');
  eq(k.family, 'X', 'synthetic family from model');
  eq(k.id, 'acme.x-dpd', 'synthetic default legacyId = <id>-dpd');
  eq(k.variables.deviceId, 0x30, 'synthetic deviceId from manufacturer');
  eq(k.messageRecipes.find((r) => r.id === 'dt1').template[1], '42', 'synthetic dt1 carries ITS manufacturer id (42)');
  eq(JSON.stringify(k.messageRecipes.find((r) => r.id === 'dt1').template.slice(3, 5)), JSON.stringify(['01', '02']), 'synthetic dt1 expands ITS modelId');
  ok(k.messageRecipes.some((r) => r.id === 'cc74' && r.controller === 74), 'synthetic cc74 recipe (per-controller, not cc7)');
  eq(k.parameters.find((p) => p.id === 'cutoff').messageRecipe, 'cc74', 'synthetic cutoff -> cc74');
  ok(k.identity === undefined, 'synthetic no identity (no codes)');
  // NRPN (C3): the nrpn wire carries its parameter number and emits a legacy nrpn recipe
  const pitch = resolveParams(resolveModel(lib['acme.x'], lib)).find((x) => x.paramId === 'pitch');
  eq(pitch.wires.write.nrpn, '01 20', 'nrpn wire carries the MSB/LSB (was dropped to address:null)');
  const nr = k.messageRecipes.find((r) => r.id === 'nrpn0120');
  ok(nr && nr.kind === 'nrpn' && nr.parameterMsb === 1 && nr.parameterLsb === 0x20 && nr.valueResolution === 14, 'NRPN recipe msb1/lsb32/14-bit (from size 2)');
  eq(k.parameters.find((p) => p.id === 'pitch').messageRecipe, 'nrpn0120', 'nrpn param -> nrpn0120 recipe');
}

// ---------------------------------------------------------------- per-wire address (B4)
section('per-wire address resolution');
{
  const prof = { scopes: { tone: { base: '10 00 01 00', stride: '00 00 01 00', instances: 2, parameters: [
    { id: 'p', valueType: 'continuous', address: '00 00 00 0C', wires: [{ dir: 'write', msg: 'dt1' }, { dir: 'read', msg: 'rq1', address: '00 00 00 0D' }] }] } } };
  const r = resolveParams(prof);
  eq(r.find((x) => x.resolvedId === 'tone1.p').wires.write.address, '10 00 01 0C', 'write wire at the param address');
  eq(r.find((x) => x.resolvedId === 'tone1.p').wires.read.address, '10 00 01 0D', 'read wire at ITS OWN address (distinct from write)');
  eq(r.find((x) => x.resolvedId === 'tone2.p').wires.read.address, '10 00 02 0D', 'per-wire address strides per instance');
}

// ---------------------------------------------------------------- universal bulk dumps (C2)
// A dump is the whole-patch SysEx. The model + dumps.mjs must express ANY machine — Roland address
// blocks, Yamaha nibbled, Korg 8->7 block-packed, ASCII patch names, every checksum — no device
// special-cased. Proven on synthetic dumps (a real device's byte map comes from its manual).
section('Universal bulk dumps (assemble / parse / round-trip)');
{
  // synthetic device exercising u14, s7, enum, nibbled, AND an ASCII patch name + a sum-7bit checksum
  const dev = {
    schemaVersion: 1, id: 'syn.dump', version: '1.0.0', kind: 'model',
    deviceId: '10', modelId: '00 41', manufacturerId: '7D',
    scopes: { patch: { kind: 'global', instances: 1, parameters: [
      { id: 'cutoff', name: 'Cutoff', valueType: 'continuous', address: '00', range: { min: 0, max: 127 }, encoding: { type: 'u7' } },
      { id: 'pitch',  name: 'Pitch',  valueType: 'continuous', range: { min: 0, max: 16383 }, encoding: { type: 'u7' } }, // dump overrides to u14
      { id: 'tune',   name: 'Tune',   valueType: 'signed', range: { min: -64, max: 63 }, encoding: { type: 's7' } },
      { id: 'wave',   name: 'Wave',   valueType: 'enum', enum: [{ id: 'saw', label: 'Saw', wire: 0 }, { id: 'sqr', label: 'Square', wire: 1 }, { id: 'tri', label: 'Tri', wire: 2 }] },
      { id: 'level',  name: 'Level',  valueType: 'continuous', range: { min: 0, max: 255 }, encoding: { type: 'nibbles', bytes: 2 } },
    ] } },
  };
  const dump = {
    id: 'patchDump', kind: 'patch', spans: ['patch'],
    message: {
      matcher: { prefix: ['F0', '7D', '$deviceId', '$modelId', '12'], suffix: ['F7'] },
      payload: { offset: 6, size: 8 },
      checksum: { type: 'sum-7bit', fromOffset: 5, toOffset: 13, byteOffset: 14 },
    },
    layout: [
      { param: 'patch.cutoff', offset: 0, codec: { type: 'u7' } },
      { param: 'patch.pitch',  offset: 1, codec: { type: 'u14' } },          // per-dump codec OVERRIDES the param's u7
      { param: 'patch.tune',   offset: 3, codec: { type: 's7' } },
      { param: 'patch.wave',   offset: 4, codec: { type: 'u7' } },
      { param: 'patch.level',  offset: 5, codec: { type: 'nibbles', bytes: 2 } },
      { param: 'patchName',    offset: 7, codec: { type: 'text-ascii', length: 1 } }, // virtual id (no param) + text codec
    ],
  };

  // byte-exact assemble for a known vector (proves framing, $token substitution, every codec + checksum)
  const vals = { 'patch.cutoff': 100, 'patch.pitch': 12345, 'patch.tune': -10, 'patch.wave': 'tri', 'patch.level': 200, patchName: 'A' };
  eq(bytesToHex(assembleDump(dump, vals, dev)), 'F0 7D 10 00 41 12 64 60 39 36 02 0C 08 41 1C F7', 'byte-exact assemble (u14+s7+enum+nibbles+text+checksum)');

  const back = parseDump(dump, assembleDump(dump, vals, dev), dev);
  ok(back.prefixOk && back.suffixOk, 'parse matches prefix + suffix');
  eq(back.checksumStatus, 'ok', 'parse verifies the checksum');
  eq(back.valuesById['patch.pitch'], 12345, 'u14 value recovered (two-byte)');
  eq(back.valuesById['patch.tune'], -10, 'signed s7 value recovered');
  eq(back.valuesById['patch.wave'], 'tri', 'enum recovered as id');
  eq(back.valuesById['patch.level'], 200, 'nibbled value recovered');
  eq(back.valuesById.patchName, 'A', 'ASCII patch name recovered');

  // checksum tamper is detected
  const tampered = assembleDump(dump, vals, dev); tampered[6] = (tampered[6] + 1) & 0x7f;
  eq(parseDump(dump, tampered, dev).checksumStatus, 'bad', 'corrupted payload -> checksum bad');

  // dumpRoundTrip across min/mid/max + enum cycle + sample name  => provenance.verifiedFullDump
  ok(dumpRoundTrip(dump, dev).ok, 'full round-trip ok (verifiedFullDump = true)');

  // a broken layout (two params share offset 0) must NOT verify
  const broken = { ...dump, layout: [...dump.layout, { param: 'patch.level', offset: 0, codec: { type: 'nibbles', bytes: 2 } }] };
  ok(!dumpRoundTrip(broken, dev).ok, 'overlapping layout fails round-trip (verifiedFullDump = false)');

  // byte map for the UI: one field per layout entry, sorted by offset
  const map = dumpByteMap(dump, dev);
  eq(map.fields.length, 6, 'byteMap exposes every layout field');
  ok(map.fields[0].offset === 0 && map.fields[map.fields.length - 1].offset === 7, 'byteMap fields sorted by offset');
  ok(map.checksum && map.checksum.type === 'sum-7bit', 'byteMap carries the checksum descriptor');

  // Korg 8->7 block-packed payload (the universal Korg case): u8 values > 127 survive because the
  // high bits ride in the packing MSB byte — and the wire stays legal 7-bit SysEx.
  const korg = {
    schemaVersion: 1, id: 'syn.korg', version: '1.0.0', kind: 'model', deviceId: '00',
    scopes: { patch: { kind: 'global', instances: 1, parameters: [
      { id: 'a', name: 'A', valueType: 'continuous', range: { min: 0, max: 255 }, encoding: { type: 'u8' } },
      { id: 'b', name: 'B', valueType: 'continuous', range: { min: 0, max: 255 }, encoding: { type: 'u8' } },
    ] } },
  };
  const korgDump = {
    id: 'kPatch', kind: 'patch', spans: ['patch'],
    message: {
      matcher: { prefix: ['F0', '42', '$deviceId'], suffix: ['F7'] },
      payload: { offset: 3, size: 2, pack: { type: 'packed8to7', packOrder: 'msb-high-first' } },
    },
    layout: [{ param: 'patch.a', offset: 0, codec: { type: 'u8' } }, { param: 'patch.b', offset: 1, codec: { type: 'u8' } }],
  };
  const kWire = assembleDump(korgDump, { 'patch.a': 200, 'patch.b': 250 }, korg);
  ok(kWire.slice(1, -1).every((x) => x <= 0x7f), 'packed payload is legal 7-bit on the wire (no byte > 0x7F)');
  const kBack = parseDump(korgDump, kWire, korg);
  ok(kBack.valuesById['patch.a'] === 200 && kBack.valuesById['patch.b'] === 250, 'Korg 8->7 block-packed payload round-trips (values > 127 preserved)');
  ok(dumpRoundTrip(korgDump, korg).ok, 'Korg block-packed dump full round-trip ok');

  // validator gates the dump model
  const base = { schemaVersion: 1, id: 'x.y', version: '1.0.0', kind: 'model', scopes: { s: { parameters: [{ id: 'a', valueType: 'continuous' }] } } };
  ok(validateProfile({ ...base, dumps: [dump] }).ok, 'validator accepts a well-formed dump');
  ok(!validateProfile({ ...base, dumps: [{ id: 'd', kind: 'patch', layout: [{ param: 'p', offset: 0, codec: { type: 'crc' } }] }] }).ok, 'validator rejects bad layout codec');
  ok(!validateProfile({ ...base, dumps: [{ id: 'd', kind: 'patch', message: { checksum: { type: 'fletcher' } } }] }).ok, 'validator rejects bad dump checksum');
  ok(!validateProfile({ ...base, dumps: [{ id: 'd', kind: 'patch', layout: [{ param: 'p' }] }] }).ok, 'validator rejects layout entry missing offset');

  // ── Stage B: emit to the engine's legacy `dumpDefinitions` (get-patch / send-patch) ──
  const emit = buildDumpDefinitions({ ...dev, dumps: [dump] });
  const ld = emit.dumpDefinitions[0];
  eq(JSON.stringify(ld.matcher.prefix), JSON.stringify(['F0', '7D', '$deviceId', '00', '41', '12']), 'emit: $modelId expanded, $deviceId left for the engine');
  eq(JSON.stringify(ld.payload), JSON.stringify({ offset: 6, size: 8 }), 'emit: payload window');
  eq(JSON.stringify(ld.checksum), JSON.stringify({ type: 'sum-7bit', fromOffset: 5, toOffset: 13, byteOffset: 14 }), 'emit: checksum span');
  eq(ld.completion.expectedMessages, 1, 'emit: single-message completion');
  eq(ld.completion.expectedBytes, 16, 'emit: expectedBytes = exact framed length');
  const mp = Object.fromEntries(ld.mappings.map((m) => [m.parameter, m]));
  ok(!mp.cutoff.codec, 'emit: u7 mapping carries no codec (engine default)');
  eq(mp.pitch.codec?.type, 'u14-msb-lsb', 'emit: u14 -> engine u14-msb-lsb');
  ok(mp.level.codec?.type === 'nibbled' && mp.level.codec.nibbles === 2, 'emit: nibbles -> engine nibbled, count under the key the engine reads');
  ok(mp.patchName.codec?.type === 'text-ascii' && mp.patchName.codec.length === 1 && mp.patchName.codec.pad === 32, 'emit: text-ascii name mapping');
  ok(mp.tune.codec?.type === 's7' && mp.tune.codec.signedOffset === 64, 'emit: s7 ships a signed dump codec (engine decodes the sign)');
  ok(!emit.notes.some((n) => /s7/.test(n)), 'emit: no s7 degrade note (engine supports it)');

  // emitted into a full legacy profile; the Korg payload-pack is now SHIPPED (the C++ engine unpacks it)
  const legacy = buildLegacyProfile({ ...dev, label: 'Syn', dumps: [dump] }, {});
  ok(Array.isArray(legacy.dumpDefinitions) && legacy.dumpDefinitions.length === 1, 'buildLegacyProfile carries dumpDefinitions');
  // The single-parameter SEND encoder, which is a different code path from the dump codec above and
  // had no coverage. The engine matches this name as an exact string and fails the send on anything
  // it does not know, so a parameter emitted with the DPD word is a control that silently does
  // nothing. Assert the word AND the count key: a right-named encoder reading a missing count just
  // defaults to two nibbles, which is the same wrong value with no error.
  const lp = Object.fromEntries((legacy.parameters ?? []).map((p) => [p.id, p]));
  const levelEnc = lp.level?.encoding;
  ok(levelEnc?.type === 'nibbled' && levelEnc.nibbles === 2, 'emit: parameter encoder is the engine word, with its count');
  ok(!Object.values(lp).some((p) => p.encoding?.type === 'nibbles'), 'emit: no DPD-only encoder name reaches a runtime profile');
  const kEmit = buildDumpDefinitions({ ...korg, dumps: [korgDump] });
  ok(kEmit.dumpDefinitions[0].payload?.pack?.type === 'packed8to7' && kEmit.dumpDefinitions[0].engineSupported !== false, 'emit: Korg payload-pack shipped (engine unpacks it, no longer flagged)');
  ok(!kEmit.notes.some((n) => /block-packing/.test(n)), 'emit: no block-packing gap note (engine supports it)');

  // ── Engine parity: the bytes dumps.mjs assembles are EXACTLY what the C++ engine parses ──
  // These vectors are mirrored in CE/profiles/test/test-sysex-synth.ceditor-device.json +
  // CE/tests/DeviceProfileEngineTests.cpp (packedPayloadDump / xorPatchDump) — one source of truth for
  // the wire, so the JS assembler and the C++ decoder can never silently drift.
  const eng = {
    schemaVersion: 1, id: 'syn.eng', version: '1.0.0', kind: 'model', deviceId: '10',
    scopes: { patch: { kind: 'global', instances: 1, parameters: [
      { id: 'cutoff', name: 'Cutoff', valueType: 'continuous', range: { min: 0, max: 127 }, encoding: { type: 'u7' } },
      { id: 'depth', name: 'Depth', valueType: 'continuous', range: { min: 0, max: 255 }, encoding: { type: 'u8' } },
      { id: 'pan', name: 'Pan', valueType: 'signed', range: { min: -64, max: 63 }, encoding: { type: 's7' } },
      { id: 'waveform', name: 'Wave', valueType: 'enum', enum: [{ id: 'saw', label: 'Saw', wire: 0 }, { id: 'square', label: 'Square', wire: 1 }, { id: 'triangle', label: 'Triangle', wire: 2 }] },
    ] } },
  };
  const packedDump = { id: 'packedPayloadDump', kind: 'patch', spans: ['patch'],
    message: { matcher: { prefix: ['F0', '7D', '$deviceId', '08'], suffix: ['F7'] }, payload: { offset: 4, size: 2, pack: { type: 'packed8to7', packOrder: 'msb-high-first' } } },
    layout: [{ param: 'patch.cutoff', offset: 0, codec: { type: 'u7' } }, { param: 'patch.depth', offset: 1, codec: { type: 'u8' } }] };
  const xorDump = { id: 'xorPatchDump', kind: 'patch', spans: ['patch'],
    message: { matcher: { prefix: ['F0', '7D', '$deviceId', '09'], suffix: ['F7'] }, payload: { offset: 4, size: 2 }, checksum: { type: 'xor', fromOffset: 3, toOffset: 5, byteOffset: 6 } },
    layout: [{ param: 'patch.cutoff', offset: 0, codec: { type: 'u7' } }, { param: 'patch.waveform', offset: 1, codec: { type: 'u7' } }] };
  eq(bytesToHex(assembleDump(packedDump, { 'patch.cutoff': 100, 'patch.depth': 200 }, eng)), 'F0 7D 10 08 20 64 48 F7', 'parity: packed dump assembles to the exact bytes the C++ engine unpacks');
  eq(bytesToHex(assembleDump(xorDump, { 'patch.cutoff': 100, 'patch.waveform': 'triangle' }, eng)), 'F0 7D 10 09 64 02 6F F7', 'parity: XOR dump assembles to the exact bytes the C++ engine verifies');
  const s7Dump = { id: 's7PatchDump', kind: 'patch', spans: ['patch'],
    message: { matcher: { prefix: ['F0', '7D', '$deviceId', '0A'], suffix: ['F7'] }, payload: { offset: 4, size: 1 } },
    layout: [{ param: 'patch.pan', offset: 0, codec: { type: 's7' } }] };
  eq(bytesToHex(assembleDump(s7Dump, { 'patch.pan': -10 }, eng)), 'F0 7D 10 0A 36 F7', 'parity: signed s7 dump assembles to the exact byte the C++ engine decodes (-10 -> 0x36)');
  const u14lsbDump = { id: 'u14lsbDump', kind: 'patch', spans: ['patch'],
    message: { matcher: { prefix: ['F0', '7D', '$deviceId', '0B'], suffix: ['F7'] }, payload: { offset: 4, size: 2 } },
    layout: [{ param: 'patch.depth', offset: 0, codec: { type: 'u14-lsb' } }] };
  eq(bytesToHex(assembleDump(u14lsbDump, { 'patch.depth': 12345 }, eng)), 'F0 7D 10 0B 39 60 F7', 'parity: u14 lsb-first dump assembles LSB-first (12345 -> 39 60, vs MSB 60 39)');
  ok(buildDumpDefinitions({ ...eng, dumps: [u14lsbDump] }).dumpDefinitions[0].mappings[0].codec?.type === 'u14-lsb-msb', 'emit: u14-lsb -> engine u14-lsb-msb');
  ok(dumpRoundTrip(packedDump, eng).ok && dumpRoundTrip(xorDump, eng).ok && dumpRoundTrip(s7Dump, eng).ok && dumpRoundTrip(u14lsbDump, eng).ok, 'parity: packed + XOR + s7 + u14-lsb engine-parity dumps self-round-trip');
}

// ---------------------------------------------------------------- MIDI-CI import -> engine (H1)
// A profile discovered over MIDI-CI must survive the Designer's Save path: resolveModel ->
// buildLegacyProfile. Proves the "Open in Designer -> Save" backend for a CC-only imported device.
section('MIDI-CI import -> legacy emit (discovery Save path)');
{
  const { profile } = midiCiToProfile({
    name: 'CI Synth',
    deviceInfo: { manufacturerId: [0, 33, 9], family: [2, 1], model: [0, 0], version: [1, 0, 0, 0] },
    channelControllers: [
      { title: 'Volume', ctrlType: 'cc', ctrlIndex: [7] },
      { title: 'Filter Cutoff', ctrlType: 'cc', ctrlIndex: [74] },
    ],
    programList: [{ title: 'Init', bankPC: [0, 0, 0] }],
  });
  validate(profile, 'imported MIDI-CI profile');
  let legacy;
  try { legacy = buildLegacyProfile(resolveModel(profile, {}), { legacyId: profile.id, embedDpdModel: profile }); }
  catch (e) { legacy = null; ok(false, 'imported profile emits to legacy without throwing :: ' + e.message); }
  if (legacy) {
    ok(legacy.parameters.length === 2, 'legacy carries the 2 imported CC params');
    ok(legacy.messageRecipes.some((r) => r.id === 'cc74' && r.controller === 74), 'legacy has a cc74 recipe (Filter Cutoff)');
    ok(legacy.parameters.find((p) => p.id === 'filter-cutoff')?.messageRecipe === 'cc74', 'cutoff param -> cc74 recipe');
    ok(legacy.dpdModel?.scopes != null, 'embedded dpdModel round-trips (designer can reload the import)');
  }
}

// ---------------------------------------------------------------- report
console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
