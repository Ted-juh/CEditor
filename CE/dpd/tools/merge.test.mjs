// Merge-on-drop translation tests (architecture doc §"Integration").
// Proves a resolved DPD parameter becomes (a) a descriptor the existing fit/adopt logic consumes,
// and (b) a self-contained value-tree section carrying address/CC + enum wire values + packing + stamp.
// Run: node CE/dpd/tools/merge.test.mjs
import { resolveProfile, resolveParams } from './dpd.mjs';
import {
  valueTypeToDescriptorType,
  dpdParamToDescriptor,
  dpdParamToBindingSection,
  fitStatusToColor,
  buildMergeOnDrop,
} from '../merge.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const model = resolveProfile('roland.gaia');
const rp = resolveParams(model);
const t1 = rp.filter((p) => p.instance === 0 && p.scope === 'tone');
const t2 = rp.filter((p) => p.instance === 1 && p.scope === 'tone');
const byId = (list, id) => list.find((p) => p.paramId === id);
const stamp = { profileId: model.id, version: model.version };

// ---- value-type mapping (doc: "carries the value-type information across") ----
eq(valueTypeToDescriptorType('continuous'), 'integer', 'continuous -> integer');
eq(valueTypeToDescriptorType('signed'), 'bipolar', 'signed -> bipolar');
eq(valueTypeToDescriptorType('enum'), 'enum', 'enum -> enum');
eq(valueTypeToDescriptorType('toggle'), 'boolean', 'toggle -> boolean');

// ---- Cutoff: continuous, multi-wire (write DT1, rxLive CC) ----
const cutoff = byId(t1, 'filter.cutoff');
const cutDesc = dpdParamToDescriptor(cutoff);
eq(cutDesc.type, 'integer', 'cutoff descriptor type integer (fit-compatible with slider)');
eq(cutDesc.range, { min: 0, max: 127 }, 'cutoff descriptor range carried');
ok(cutDesc.choices === undefined, 'cutoff descriptor has no choices');

const cutSec = dpdParamToBindingSection(cutoff, stamp);
eq(cutSec.source, 'roland.gaia@1.0.0', 'cutoff section stamped source=id@version (doc 437)');
eq(cutSec.wires.write, { msg: 'dt1', address: '10 00 01 0C', size: 1 }, 'cutoff write wire = DT1 @ 10 00 01 0C (self-contained address)');
eq(cutSec.wires.read, { msg: 'rq1', address: '10 00 01 0C', size: 1 }, 'cutoff read wire = RQ1 @ same');
eq(cutSec.wires.rxLive, { msg: 'cc', cc: 102 }, 'cutoff rxLive = CC 102 (the knob transmits CC, not SysEx)');
ok(cutSec.wires.write.address && !cutSec.parameterId.includes('@'), 'section is self-contained: carries its own address, not just a profile ref');

// Tone 2 of the SAME parameter must carry the strided CC (per-tone 102/103/104).
const cut2Sec = dpdParamToBindingSection(byId(t2, 'filter.cutoff'), stamp);
eq(cut2Sec.wires.rxLive, { msg: 'cc', cc: 103 }, 'cutoff tone 2 rxLive = CC 103 (ccStride applied)');
eq(cut2Sec.wires.write.address, '10 00 02 0C', 'cutoff tone 2 write address strided to 10 00 02 0C (base+stride+offset)');

// ---- OSC Wave: enum with wire values ----
const osc = byId(t1, 'osc.wave');
const oscDesc = dpdParamToDescriptor(osc);
eq(oscDesc.type, 'enum', 'osc.wave descriptor type enum');
eq(oscDesc.choices.length, 7, 'osc.wave 7 choices');
eq(oscDesc.choices[0], { id: 'saw', label: 'Saw', value: 0 }, 'osc.wave choice 0 carries wire value 0');
eq(oscDesc.choices[6], { id: 'supersaw', label: 'Super Saw', value: 6 }, 'osc.wave choice 6 carries wire value 6');

const oscSec = dpdParamToBindingSection(osc, stamp);
eq(oscSec.wires.write, { msg: 'dt1', address: '10 00 01 00', size: 1 }, 'osc.wave write = DT1 @ 10 00 01 00');
eq(oscSec.enum.length, 7, 'osc.wave section carries 7 enum entries with wire values');
eq(oscSec.enum[2], { id: 'pulse', label: 'Pulse', wire: 2 }, 'osc.wave enum entry carries its wire value');

// ---- Env Depth: signed -> bipolar ----
const depth = byId(t1, 'filter.envDepth');
ok(depth, 'envDepth resolved');
eq(dpdParamToDescriptor(depth).type, 'bipolar', 'envDepth descriptor type bipolar (signed)');
ok(depth.range && depth.range.min < 0, 'envDepth range is signed (min < 0)');

// ---- Packed parameter: bit-slice/packing detail must be carried (doc 439) ----
const packed = {
  resolvedId: 'tone1.dump.packedByte', paramId: 'dump.packedByte', valueType: 'continuous',
  range: { min: 0, max: 255 }, size: 2, absAddress: '20 00 00 04',
  encoding: { type: 'packed8to7', bytes: 2, msbFirst: false },
  wires: { write: { msg: 'dt1', address: '20 00 00 04', size: 2 }, read: { msg: 'rq1', address: '20 00 00 04', size: 2 }, rxLive: null },
};
const packedSec = dpdParamToBindingSection(packed, stamp);
eq(packedSec.encoding, { type: 'packed8to7', bytes: 2, msbFirst: false }, 'packed section carries full packing detail (type+bytes+msbFirst)');
eq(packedSec.size, 2, 'packed section carries multi-byte size');
ok(dpdParamToDescriptor(packed).access.realtimeSafe === false, 'multi-byte packed param marked NOT realtime-safe');

// ---- fit-status -> doc color vocabulary ----
eq(fitStatusToColor('compatible'), 'green', 'compatible -> green');
eq(fitStatusToColor('warning'), 'orange', 'warning -> orange');
eq(fitStatusToColor('incompatible'), 'red', 'incompatible -> red');

// ---- buildMergeOnDrop returns both halves ----
const both = buildMergeOnDrop(cutoff, stamp);
ok(both.descriptor && both.section, 'buildMergeOnDrop returns {descriptor, section}');
eq(both.section.source, 'roland.gaia@1.0.0', 'buildMergeOnDrop section stamped');

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
