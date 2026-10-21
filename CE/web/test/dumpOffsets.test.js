// dumpOffsets.test.js — what the Values tab says lives at the bytes a byte-list call reads or writes
// (scripting/dumpOffsets.js), by each dump's layout (valuesContext.js's dumpLayout). The layout is
// held to the device engine's own dumps: a value changed in a dump the engine builds changes bytes
// inside that field's place and width, and nowhere else.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { deviceValueContext, dumpLayout, declaredDeviceDumps } from '../src/CE_Application/editor/valuesContext.js';
import { localBuildDumpMessage } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { dumpRangeSaid, dumpNamesSaid, dumpHeadSaid, dumpLineWho } from '../src/CE_Application/scripting/dumpOffsets.js';
import {
  defineParameter, defineDump, buildDump, clearDeviceDefinitions, definedDumpKinds,
} from '../src/CE_Application/scripting/deviceDefinitions.js';

const profileText = (file) => readFileSync(fileURLToPath(new URL(`../../profiles/test/${file}`, import.meta.url)), 'utf8');
const GAIA = profileText('roland-gaia-sh01.ceditor-device.json');
const devicesFor = (text, name = 'Roland GAIA SH-01') => deviceValueContext({
  mappings: { mainSynth: { profileId: 'p' } }, profiles: [{ id: 'p', name }], sources: { p: { source: text } },
});
const dumpAt = (source, devices = devicesFor(GAIA), language = 'lua') => readStatement(source, language, 3, { devices }).calls[0].dumpAt;

test('every field of every dump is where the engine puts it, as wide as it writes it', () => {
  // Built twice by the engine, once with one value changed: every byte that changes, the checksum
  // aside, is inside that field, and at least one does.
  const another = (p) => {
    if (p.type === 'text') return ['A'.repeat(32), 'B'.repeat(32)].map((t) => t.slice(0, Number(p.encoding?.length ?? 1)));
    const choices = Array.isArray(p.choices) ? p.choices : Array.isArray(p.options) ? p.options : [];
    if (choices.length > 1) return [choices[0].value, choices[1].value];
    const lo = Number(p.range?.min ?? 0);
    return [lo, lo + 1];
  };
  let fieldsChecked = 0;
  for (const file of ['roland-gaia-sh01.ceditor-device.json', 'roland-sh-201.ceditor-device.json',
    'yamaha-an1x-dpd.ceditor-device.json', 'test-sysex-synth.ceditor-device.json']) {
    const profile = JSON.parse(profileText(file));
    const parameters = new Map(profile.parameters.map((p) => [p.id, p]));
    for (const dump of profile.dumpDefinitions) {
      const layout = dumpLayout(dump, parameters);
      assert.ok(layout, `${file} ${dump.id} has a layout`);
      if (dump.payload.pack) {
        // Its mappings count unpacked bytes: no field is placed in the message, only the packed run.
        assert.deepEqual(layout.fields, [], `${file} ${dump.id}`);
        assert.ok(layout.packed && layout.packed.from === dump.payload.offset, `${file} ${dump.id}: the packed run`);
        continue;
      }
      const empty = localBuildDumpMessage(profile, dump.id, {});
      if (!empty.ok) continue;                                    // a dump the local engine cannot build
      assert.equal(layout.length ?? empty.bytes.length, empty.bytes.length, `${file} ${dump.id}: its length`);
      const sum = layout.checksum ? new Set(Array.from({ length: layout.checksum.count }, (_, i) => layout.checksum.at + i)) : new Set();
      for (const field of layout.fields) {
        // Only this value given: some profiles map one field over another (the SH-201's name and its
        // twelve characters), and a value given for the other would be written over it.
        const [one, two] = another(parameters.get(field.parameter));
        const before = localBuildDumpMessage(profile, dump.id, { [field.parameter]: one });
        const after = localBuildDumpMessage(profile, dump.id, { [field.parameter]: two });
        if (!before.ok || !after.ok) {
          // test-sysex-synth carries dumps that are wrong on purpose, for the engine's own tests.
          assert.equal(file, 'test-sysex-synth.ceditor-device.json', `${file} ${dump.id} ${field.parameter}: ${before.error || after.error}`);
          continue;
        }
        const changed = after.bytes.map((b, i) => (b !== before.bytes[i] && !sum.has(i) ? i : -1)).filter((i) => i >= 0);
        const where = `${file} ${dump.id} ${field.parameter}, at ${field.start}, ${field.width} wide`;
        assert.ok(changed.length > 0, `${where}: nothing changed`);
        assert.ok(changed.every((i) => i >= field.start && i < field.start + field.width), `${where}: bytes ${changed} changed`);
        fieldsChecked += 1;
      }
    }
  }
  assert.ok(fieldsChecked > 800, `${fieldsChecked} fields checked`);
});

test('a read names what is at its byte in every dump, the dumps holding the same thing on one line', () => {
  const at = dumpAt('ce.midi.read(msg, 23, 1)');
  assert.equal(dumpRangeSaid(at), 'Byte 23, counting from F0');
  assert.deepEqual(at.lines[1], { profile: 'Roland GAIA SH-01', declared: false, dumps: ['Patch Common'], who: 'Patch Common', text: 'Patch Level' });
  assert.equal(dumpHeadSaid(at), 'Byte 23, counting from F0, in a Roland GAIA SH-01 dump:');
  assert.deepEqual(at.lines[2].dumps, ['Patch Tone 1', 'Patch Tone 2', 'Patch Tone 3']);
  assert.equal(at.lines[2].text, 'FILTER Cutoff');
  assert.equal(at.lines[0].text, 'part of System Tempo, which is bytes 21–23', 'a field the read starts inside');
  assert.ok(at.lines.length <= 4 && at.more > 0, 'four lines, and how many dumps beyond them');
  assert.equal(at.dumps.length, at.lines.reduce((n, l) => n + l.dumps.length, 0) + at.more);
});

test('a slice says every field it takes, a header byte its meaning, and the end of the message', () => {
  assert.equal(dumpAt('ce.midi.slice(msg, 11, 12)').lines.find((l) => l.who === 'Patch Common').text, 'Patch Name, bytes 11–22');
  const header = dumpAt('ce.midi.read(msg, 2, 1)');
  assert.equal(header.lines.length, 1, 'every dump has the device id there');
  assert.equal(header.lines[0].text, 'header byte 2: the device id');
  assert.equal(header.lines[0].who, `System, Patch Common and ${header.dumps.length - 2} more`);
  const tail = dumpAt('ce.midi.slice(msg, 72)');
  assert.equal(dumpRangeSaid(tail), 'From byte 72 to the end, counting from F0');
  assert.ok(tail.lines.some((l) => l.text === 'the checksum; F7, the end' && l.dumps.includes('Patch Common')));
});

test('a packed payload is said as one run, since no byte of it is one value', () => {
  const synth = profileText('test-sysex-synth.ceditor-device.json');
  const at = dumpAt('ce.midi.read("F0 7D 00 08 01 02 03 F7", 5, 1)', devicesFor(synth, 'Test SysEx Synth'));
  assert.deepEqual(at.lines.map((l) => [l.who, l.text]),
    [['Packed Payload Dump', 'packed values, bytes 4–6: unpacked before they are read, so no byte here is one value']]);
});

test('bytes written out are matched to the dump they are', () => {
  const common = 'F0 41 10 00 00 41 12 10 00 00 00 41 42 43 44 45 46 47 48 49 4A 4B 4C 64';
  const at = dumpAt(`ce.midi.read("${common}", 23, 1)`);
  assert.deepEqual(at.lines.map((l) => [l.who, l.text]), [['Patch Common', 'Patch Level']]);
  assert.equal(dumpAt('ce.midi.read("F0 7E 7F 06 01 F7", 2, 1)'), undefined, 'bytes that are none of its dumps');
});

test('write and put name the bytes they write; nothing is said without a profile or a written offset', () => {
  assert.equal(dumpAt('ce.midi.write(msg, 23, 1, 100)').lines[1].text, 'Patch Level');
  assert.equal(dumpAt('ce.midi.put(msg, 23, { 100, 64 })').lines[1].text, 'Patch Level; part of Patch Tempo, which is bytes 24–26');
  assert.equal(dumpAt('ce.midi.put(msg, 23, values)'), undefined, 'bytes not known until it runs: how many is not known');
  assert.equal(dumpAt('ce.midi.put(msg, 23, {})'), undefined, 'no bytes, nothing written');
  assert.equal(dumpAt('ce.midi.read(msg, at, 1)'), undefined);
  assert.equal(dumpAt('ce.midi.read(msg, 23, 5)'), undefined, 'a count the runtime refuses');
  assert.equal(readStatement('ce.midi.read(msg, 23, 1)', 'lua', 3, {}).calls[0].dumpAt, undefined);
  assert.equal(dumpAt('ce.midi.read(msg, 23, 1)', devicesFor(GAIA), 'lua').verb, 'ce.midi.read');
  assert.equal(dumpAt('ce.midi.read(msg, 23, 1);', devicesFor(GAIA), 'javascript').lines[1].text, 'Patch Level');
  assert.equal(dumpNamesSaid(['A', 'B']), 'A and B');
  assert.equal(dumpNamesSaid(['A', 'B', 'C']), 'A, B and C');
});

// A dump the script declares, in Lua as a panel writes one: a 14-bit value, a four-nibble one, a
// name, a switch, and a Roland checksum after the payload.
const DECLARED = `
ce.device.defineParameter("cutoff", { sysex = "F0 41 10 $value F7", encoding = "u14" })
ce.device.defineParameter("tune", { sysex = "F0 41 10 $value F7", encoding = "nibbled", nibbles = 4 })
ce.device.defineParameter("title", { sysex = "F0 41 10 $value F7", type = "text", length = 6 })
ce.device.defineParameter("hold", { cc = 64, type = "boolean" })
ce.device.defineDump("patch", {
  name = "My Patch",
  match = { prefix = { "F0", "41", "$deviceId", "12" }, suffix = { "F7" } },
  offset = 5, size = 13, checksum = "roland",
  fields = { { parameter = "cutoff", offset = 0 }, { parameter = "tune", offset = 2 },
             { parameter = "title", offset = 6 }, { parameter = "hold", offset = 12 } },
})`;
const declaredContext = (source, extra = {}) => deviceValueContext({
  declaredDumps: declaredDeviceDumps([{ language: 'lua', source }]), ...extra,
});

test('a dump the script declares is laid out where the runtime builds it, each field as wide as it writes it', () => {
  const [declared] = declaredDeviceDumps([{ language: 'lua', source: DECLARED }]);
  assert.equal(declared.id, 'patch');
  assert.equal(declared.name, 'My Patch');
  assert.deepEqual(declared.layout.fields.map((f) => [f.parameter, f.start, f.width]),
    [['cutoff', 5, 2], ['tune', 7, 4], ['title', 11, 6], ['hold', 17, 1]]);
  assert.deepEqual(declared.layout.checksum, { at: 18, count: 1 });

  // Held to the runtime: the same declarations, built twice with one value changed.
  clearDeviceDefinitions();
  const role = 'layoutCheck';
  for (const [id, spec] of [['cutoff', { sysex: 'F0 41 10 $value F7', encoding: 'u14' }],
    ['tune', { sysex: 'F0 41 10 $value F7', encoding: 'nibbled', nibbles: 4 }],
    ['title', { sysex: 'F0 41 10 $value F7', type: 'text', length: 6 }], ['hold', { cc: 64, type: 'boolean' }]]) {
    assert.equal(defineParameter(role, id, spec).ok, true, id);
  }
  assert.equal(defineDump(role, 'patch', {
    match: { prefix: ['F0', '41', '$deviceId', '12'], suffix: ['F7'] }, offset: 5, size: 13, checksum: 'roland',
    fields: declared.layout.fields.map((f) => ({ parameter: f.parameter, offset: f.start - 5 })),
  }).ok, true);
  const base = { cutoff: 0, tune: 0, title: 'AAAAAA', hold: false };
  const pairs = { cutoff: [0, 200], tune: [0, 300], title: ['AAAAAA', 'BBBBBB'], hold: [false, true] };
  for (const field of declared.layout.fields) {
    const [one, two] = pairs[field.parameter];
    const before = buildDump(role, 'patch', { ...base, [field.parameter]: one });
    const after = buildDump(role, 'patch', { ...base, [field.parameter]: two });
    assert.equal(before.ok && after.ok, true, before.error ?? after.error);
    const changed = after.bytes.map((b, i) => (b !== before.bytes[i] && i !== declared.layout.checksum.at ? i : -1)).filter((i) => i >= 0);
    assert.ok(changed.length > 0, `${field.parameter}: nothing changed`);
    assert.ok(changed.every((i) => i >= field.start && i < field.start + field.width), `${field.parameter}: bytes ${changed} changed`);
  }
  assert.equal(buildDump(role, 'patch', base).bytes.length - 2, declared.layout.checksum.at, 'the checksum, then F7');
  clearDeviceDefinitions();
});

test('a read of a declared dump names its field, and the row says whose dump it is', () => {
  const devices = declaredContext(DECLARED);
  const at = dumpAt('ce.midi.read(msg, 7, 2)', devices);
  assert.deepEqual(at.lines.map((l) => [l.who, l.text]), [['My Patch', 'part of tune, which is bytes 7–10']]);
  assert.equal(dumpHeadSaid(at), 'Bytes 7 to 8, counting from F0, in a dump the scripts declare:');
  assert.equal(dumpAt('ce.midi.read(msg, 5, 2)', devices).lines[0].text, 'cutoff, bytes 5–6');
  assert.equal(dumpAt('ce.midi.read(msg, 2, 1)', devices).lines[0].text, 'header byte 2: the device id');
  assert.equal(dumpAt('ce.midi.read(msg, 18, 1)', devices).lines[0].text, 'the checksum');
  assert.equal(dumpAt('ce.midi.read("F0 43 10 12 00 01 02", 5, 1)', devices), undefined, 'bytes that are not the dump');

  // Beside a profile's dumps, each line says whose.
  const both = declaredContext(DECLARED, {
    mappings: { mainSynth: { profileId: 'p' } }, profiles: [{ id: 'p', name: 'Roland GAIA SH-01' }], sources: { p: { source: GAIA } },
  });
  const mixed = dumpAt('ce.midi.read(msg, 17, 1)', both);
  assert.equal(dumpHeadSaid(mixed), 'Byte 17, counting from F0:');
  const mine = mixed.lines[0];
  assert.equal(mine.declared, true, 'the script\'s own dump first');
  assert.equal(dumpLineWho(mixed, mine), 'Declared · My Patch');
  assert.equal(mine.text, 'hold');
  assert.match(dumpLineWho(mixed, mixed.lines.find((l) => !l.declared)), /^Roland GAIA SH-01 · /);
});

test('a declared dump is laid out in the other languages, and its role is its own', () => {
  const js = declaredDeviceDumps([{ language: 'javascript', source: `
    ce.device.defineParameter("cutoff", { cc: 74 });
    ce.device.defineDump("tone", { match: { prefix: "F0 43 10" }, offset: 4, fields: [{ parameter: "cutoff", offset: 3 }] }, "drums");` }]);
  assert.equal(js[0].role, 'drums');
  assert.equal(js[0].layout, undefined, 'the parameter is the main synth\'s, not the drums\'');
  const py = declaredDeviceDumps([{ language: 'python', source: `
ce.device.defineParameter("cutoff", {"cc": 74}, "drums")
ce.device.defineDump("tone", {"match": {"prefix": "F0 43 10"}, "offset": 4, "fields": [{"parameter": "cutoff", "offset": 3}]}, "drums")` }]);
  assert.deepEqual(py[0].layout.fields.map((f) => [f.parameter, f.start, f.width]), [['cutoff', 7, 1]]);
  assert.equal(py[0].layout.checksum, null, 'no checksum asked for');
});

test('what the runtime would refuse, or builds as it runs, is not laid out as if it were written', () => {
  const layoutOf = (source) => declaredDeviceDumps([{ language: 'lua', source }])[0];
  const param = 'ce.device.defineParameter("cutoff", { cc = 74 })\n';
  // An offset built as it runs would read as 0, and the field at the wrong byte.
  assert.equal(layoutOf(`${param}ce.device.defineDump("d", { match = { prefix = "F0 43" }, fields = { { parameter = "cutoff", offset = base + 1 } } })`).layout, undefined);
  assert.equal(layoutOf(`${param}ce.device.defineDump("d", { match = { prefix = header }, fields = { { parameter = "cutoff" } } })`).layout, undefined);
  // The runtime refuses a field naming a parameter nobody defined, and a dump with no prefix.
  assert.equal(layoutOf('ce.device.defineDump("d", { match = { prefix = "F0 43" }, fields = { { parameter = "cutoff" } } })').layout, undefined);
  assert.equal(layoutOf(`${param}ce.device.defineDump("d", { fields = { { parameter = "cutoff" } } })`).layout, undefined);
  // A value's width built as it runs is not known; its wire is no part of the dump.
  assert.equal(layoutOf(`ce.device.defineParameter("cutoff", { sysex = "F0 41 10 $value F7", encoding = pick })
ce.device.defineDump("d", { match = { prefix = "F0 43" }, fields = { { parameter = "cutoff", offset = 1 } } })`).layout, undefined);
  const built = layoutOf(`ce.device.defineParameter("cutoff", { sysex = head .. " $value F7", encoding = "u14", name = label })
ce.device.defineDump("d", { name = title, match = { prefix = "F0 43" }, offset = 2, fields = { { parameter = "cutoff", offset = 1 } } })`);
  assert.deepEqual(built.layout.fields.map((f) => [f.parameter, f.start, f.width]), [['cutoff', 3, 2]]);
  assert.equal(built.name, 'd', 'a name built as it runs is the kind, as when none is given');
  // Nothing the editor reads is left among what the running script defined.
  clearDeviceDefinitions();
  declaredDeviceDumps([{ language: 'lua', source: DECLARED }]);
  assert.deepEqual(definedDumpKinds('mainSynth'), []);
});
