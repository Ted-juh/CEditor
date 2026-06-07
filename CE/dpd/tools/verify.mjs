// DPD foundation verification. Run: node CE/dpd/tools/verify.mjs
// Proves the new schema + ported GAIA reproduce known-good hardware behaviour, resolve scopes
// correctly (incl. multi-wire + per-tone CC), and that every codec round-trips across full range.
import {
  LIB_DIR, loadProfile, resolveProfile, resolveParams, buildMessage,
  encodeValue, decodeValue, pack8to7, unpack8to7, bitsliceEncode, bitsliceDecode,
  applyOverrides, mergeIncludes, resolveModel,
} from './dpd.mjs';
import { validateProfile } from './validate.mjs';
import { buildLegacyProfile } from '../emit-legacy-core.mjs';

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
  eq(JSON.stringify(gaia.messageRecipes.find((r) => r.id === 'dt1').template),
    JSON.stringify(['F0', '41', '$deviceId', '00', '00', '41', '12', '$address', '$encodedValue', '$checksum', 'F7']),
    'GAIA dt1 recipe byte-identical (modelId expanded)');
  ok(gaia.messageRecipes.some((r) => r.id === 'cc7' && r.controller === 7), 'GAIA cc7 recipe (per-controller)');
  eq(gaia.parameters.find((p) => p.id === 'master.volume').messageRecipe, 'cc7', 'master.volume -> cc7 recipe');
  eq(gaia.parameters.find((p) => p.id === 'filter.cutoff').address, '10 00 01 0C', 'GAIA cutoff address unchanged');

  // A synthetic non-Roland device must derive EVERYTHING from its own profile — nothing GAIA-specific.
  const lib = {
    acme: { id: 'acme', kind: 'manufacturer', version: '1.0.0', label: 'Acme', manufacturerId: '42', deviceId: '30',
      byteOrder: 'msb-first', checksum: { type: 'sum-7bit', from: '$address', to: '$encodedValue' },
      messageShapes: [{ id: 'dt1', kind: 'sysex', template: ['F0', '42', '$deviceId', '$modelId', '40', '$address', '$encodedValue', '$checksum', 'F7'], checksum: { type: 'sum-7bit', from: '$address', to: '$encodedValue' } }] },
    'acme.x': { id: 'acme.x', kind: 'model', version: '2.0.0', inherits: 'acme', modelId: '01 02', family: 'X',
      scopes: { part: { base: '00 00 00 00', parameters: [
        { id: 'cutoff', name: 'Cutoff', valueType: 'continuous', address: '00 00 00 10', range: { min: 0, max: 127 }, encoding: { type: 'u7' }, wires: [{ dir: 'write', msg: 'cc', cc: 74 }] },
        { id: 'reso', name: 'Reso', valueType: 'continuous', address: '00 00 00 11', range: { min: 0, max: 127 }, encoding: { type: 'u7' } } ] } } },
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
}

// ---------------------------------------------------------------- report
console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
