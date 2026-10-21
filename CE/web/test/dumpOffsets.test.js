// dumpOffsets.test.js — what the Values tab says lives at the bytes a byte-list call reads or writes
// (scripting/dumpOffsets.js), by each dump's layout (valuesContext.js's dumpLayout). The layout is
// held to the device engine's own dumps: a value changed in a dump the engine builds changes bytes
// inside that field's place and width, and nowhere else.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { deviceValueContext, dumpLayout } from '../src/CE_Application/editor/valuesContext.js';
import { localBuildDumpMessage } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { dumpRangeSaid, dumpNamesSaid } from '../src/CE_Application/scripting/dumpOffsets.js';

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
    // From 0 up: the local encoder writes a signed (s7) value as it is, clamped to 0–127.
    const lo = Math.max(0, Number(p.range?.min ?? 0));
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
  assert.deepEqual(at.lines[1], { profile: 'Roland GAIA SH-01', dumps: ['Patch Common'], who: 'Patch Common', text: 'Patch Level' });
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
  assert.equal(dumpAt('ce.midi.read(msg, at, 1)'), undefined);
  assert.equal(dumpAt('ce.midi.read(msg, 23, 5)'), undefined, 'a count the runtime refuses');
  assert.equal(readStatement('ce.midi.read(msg, 23, 1)', 'lua', 3, {}).calls[0].dumpAt, undefined);
  assert.equal(dumpAt('ce.midi.read(msg, 23, 1)', devicesFor(GAIA), 'lua').verb, 'ce.midi.read');
  assert.equal(dumpAt('ce.midi.read(msg, 23, 1);', devicesFor(GAIA), 'javascript').lines[1].text, 'Patch Level');
  assert.equal(dumpNamesSaid(['A', 'B']), 'A and B');
  assert.equal(dumpNamesSaid(['A', 'B', 'C']), 'A, B and C');
});
