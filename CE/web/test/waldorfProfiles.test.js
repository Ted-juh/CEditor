// waldorfProfiles.test.js — device profiles read out of Waldorf's System Exclusive Specifications.
//
// tools/profiles/waldorf/ reads a specification's sound data table, value lists and effect
// parameters from poppler's word positions (read-waldorf-sysex.mjs), commits them as
// tables/<name>.json, and builds a profile from them and a layout. Checked here: the READER on rows
// set the way the Blofeld's are, the BUILDER's bit-field rule, and every PROFILE through the app's own
// engine, the committed profiles against the generator. None of it has met a real instrument
// (`verifiedOnHardware: false`).

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { pageLines, readLists, readSoundTable, splitValueAndName } from '../../../tools/profiles/waldorf/read-waldorf-sysex.mjs';
import { bitFieldChoices } from '../../../tools/profiles/waldorf/build-waldorf-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/waldorf/make-profiles.mjs';
import { localCompileDeviceRequest, localCompileParameter, localParseDumpMessage, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/* ------------------------------------------------------------------ the reader */

// A line of words at the x positions given: [[x, text], ...], each word 6 points a character.
const line = (y, ...words) => words.map(([x, t]) => `<word xMin="${x}" yMin="${y}" xMax="${x + t.length * 6}" yMax="${y + 8}">${t}</word>`).join('');
const page = (...lines) => `<page width="612" height="792">${lines.join('')}</page>`;

test('the sound data table: value and name apart at the widest gap, or marked where a tab collapsed', () => {
  const xml = page(
    line(40, [40, '3.1'], [62, 'SDATA'], [100, '-'], [110, 'Sound'], [146, 'Data']),
    line(60, [77, '1'], [115, '16..112'], [170, "128'..1/2'"], [290, 'Osc'], [314, '1'], [326, 'Octave']),
    line(70, [77, '12'], [115, 'reserved']),
    line(80, [77, '311'], [118, '0..3'], [156, 'off,on,One'], [222, 'Shot,Hold'], [290, 'Arpeggiator'], [362, 'Mode']),
    line(90, [77, '317'], [118, '0..3'], [157, 'Up,Down,Alt'], [227, 'Up,Alt'], [269, 'Down'], [296, 'Arpeggiator'], [368, 'Direction']),
    line(100, [77, '339'], [118, '0..127'], [290, 'Arp'], [314, 'Pattern'], [362, 'Step']),
    line(120, [40, '3.2'], [62, 'GDATA']),
    line(130, [77, '1'], [115, '0..1'], [160, 'off,on'], [290, 'Multi'], [326, 'Mode']),
  );
  const rows = readSoundTable(pageLines(xml));
  assert.deepEqual(rows, [
    { index: 1, range: [16, 112], value: "128'..1/2'", name: 'Osc 1 Octave' },
    { index: 12, range: null, value: '', name: 'reserved' },
    { index: 311, range: [0, 3], value: 'off,on,One Shot,Hold', name: 'Arpeggiator Mode' },
    { index: 317, range: [0, 3], value: '', name: 'Up,Down,Alt Up,Alt Down Arpeggiator Direction', unsure: true },
    { index: 339, range: [0, 127], value: '', name: 'Arp Pattern Step' },
  ], 'the table ends at the next section; a row with no gap is marked, not guessed');
  assert.deepEqual(splitValueAndName({ x1: 100 }, []), { value: '', name: '', unsure: false });
});

test('a value list, its runs, and a bit-field byte\'s parts', () => {
  const xml = page(
    line(40, [40, '4.6'], [62, 'LFO'], [90, 'Clocks']),
    line(50, [40, '0..1'], [90, '1280'], [120, 'bars']),
    line(60, [40, '4.10'], [66, 'Allocation']),
    line(70, [40, '0uuu000a']),
    line(80, [40, 'uuu:']),
    line(90, [40, '0'], [90, 'off']),
    line(100, [40, '1'], [90, 'dual']),
    line(110, [40, 'a:']),
    line(120, [40, '0'], [90, 'Poly']),
    line(130, [40, '1'], [90, 'Mono']),
    line(140, [40, '5.'], [60, 'Effects']),
  );
  const lists = readLists(pageLines(xml), /^4\.6\s/, /^5\.\s/);
  assert.deepEqual(lists['4.6'].items, [{ from: 0, to: 1, label: '1280 bars' }]);
  assert.equal(lists['4.10'].notes, '0uuu000a');
  // `0uuu000a`: unisono in bits 6-4, allocation in bit 0, every combination.
  assert.deepEqual(bitFieldChoices(lists['4.10'].notes, lists['4.10']), [
    { value: 0, label: 'off, Poly' }, { value: 1, label: 'off, Mono' }, { value: 16, label: 'dual, Poly' }, { value: 17, label: 'dual, Mono' },
  ]);
});

/* ------------------------------------------------------------------ the profiles */

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/waldorf/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is a sound parameter change at its index, at both ends of its range`, () => {
    const equipment = data.format.equipmentId;
    const ids = new Set();
    for (const p of profile.parameters) {
      assert.ok(!ids.has(p.id), `${p.id} twice`);
      ids.add(p.id);
      if (p.type === 'text') continue;
      const values = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of values) {
        const compiled = localCompileParameter(profile, { parameterId: p.id, value });
        assert.ok(compiled.ok, `${p.id}: ${compiled.error}`);
        assert.equal(compiled.hex, `F0 3E ${equipment} 00 20 00 ${p.address} ${hex([wire])} F7`, `${p.id} = ${value}`);
      }
    }
  });

  test(`${profile.id}: its test vectors, its request, and its sound dump read back, with the checksum or 7F`, () => {
    for (const t of profile.tests) {
      if (t.parameter) {
        const compiled = localCompileParameter(profile, { parameterId: t.parameter, value: t.value });
        assert.ok(compiled.ok, compiled.error);
        assert.equal(compiled.hex, t.expectedHex, t.name);
      } else if (t.kind === 'request') {
        const compiled = localCompileDeviceRequest(profile, { request: t.request });
        assert.ok(compiled.ok, compiled.error);
        assert.equal(compiled.transaction?.encodedValueHex ?? compiled.hex, t.expectedHex, t.name);
      } else if (t.kind === 'dumpParse') {
        const parsed = localParseDumpMessage(profile, t.inputHex);
        assert.ok(parsed.ok, parsed.error);
        for (const [id, value] of Object.entries(t.expectedValues)) assert.equal(parsed.values[id], value, `${t.name}: ${id}`);
        // The same dump with 7F for its checksum, which the specification says is always accepted.
        const bytes = t.inputHex.split(' ');
        bytes[bytes.length - 2] = '7F';
        assert.ok(localParseDumpMessage(profile, bytes.join(' ')).ok, 'a checksum of 7F is taken');
        bytes[bytes.length - 2] = '7E';
        assert.equal(localParseDumpMessage(profile, bytes.join(' ')).ok, false, 'another wrong one is not');
      }
    }
    assert.ok(profile.parameters.every((p) => p.access.canRead), 'every parameter is in the sound dump');
  });

  test(`${profile.id}: the source is Waldorf's specification, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Waldorf');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

/* ------------------------------------------------------------------ per instrument */

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;

test('the Blofeld: an index in two 7-bit bytes, the edit buffer\'s dump, and the device ID throughout', { skip: !builtProfile('waldorf-blofeld') }, () => {
  const profile = builtProfile('waldorf-blofeld');
  const at = (name) => profile.parameters.find((p) => p.name === name);
  const send = (name, value, variables) => localCompileParameter(variables ? { ...profile, variables: { ...profile.variables, ...variables } } : profile, { parameterId: at(name).id, value }).hex;
  assert.equal(send('Filter 1 Cutoff', 100), 'F0 3E 13 00 20 00 00 4E 64 F7', 'index 78: 00 4E');
  assert.equal(send('Category', 'seq'), 'F0 3E 13 00 20 00 02 7B 0C F7', 'index 379: 02 7B');
  assert.equal(send('Osc 2 Octave', "8'"), 'F0 3E 13 00 20 00 00 11 40 F7', "8' is 64, 16 + 4 x 12");
  assert.equal(send('Allocation Mode and Unisono', 'dualmono'), 'F0 3E 13 00 20 00 00 3A 11 F7', '0uuu000a: dual (1) in uuu, Mono (1) in a');
  assert.equal(send('Filter 1 Cutoff', 1, { deviceId: 5 }), 'F0 3E 13 05 20 00 00 4E 01 F7', 'the device ID is the variable');
  assert.deepEqual(at('Effect 1 Type').choices.map((c) => c.label), ['Bypass', 'Chorus', 'Flanger', 'Phaser', 'Overdrive', 'Triple FX'], 'the first unit has no delay or reverb');
  assert.equal(at('Effect 2 Type').choices.length, 9);
  assert.match(at('Effect 2 Parameter 3').description, /Overdrive: Post Gain; Reverb: Decay/);
  assert.deepEqual([at('Mixer Osc 1 Balance').display.min, at('Mixer Osc 1 Balance').display.max], [-64, 63]);
  assert.equal(at('Name').access.canWrite, false);
  const [dump] = profile.dumpDefinitions;
  assert.equal(dump.matcher.prefix.join(' '), 'F0 3E 13 $deviceId 10 7F 00');
  assert.deepEqual([dump.payload.offset, dump.payload.size, dump.completion.expectedBytes], [7, 383, 392]);
  assert.deepEqual([dump.checksum.fromOffset, dump.checksum.toOffset, dump.checksum.byteOffset], [7, 389, 390], 'the Blofeld sums the data alone');
  assert.equal(profile.requests[0].template.join(' '), 'F0 3E 13 $deviceId 00 7F 00 7F F7');
  assert.deepEqual([profile.identity.manufacturerId, profile.identity.familyCode, profile.identity.modelNumber], [['3E'], ['13', '00'], ['00', '00']]);
});

test('the Microwave II/XT: the Blofeld\'s ancestor, its checksum over the location as well, no identity', { skip: !builtProfile('waldorf-microwave-2') }, () => {
  const profile = builtProfile('waldorf-microwave-2');
  const at = (name) => profile.parameters.find((p) => p.name === name);
  const send = (name, value) => localCompileParameter(profile, { parameterId: at(name).id, value }).hex;
  assert.equal(send('Filter 1 Cutoff', 100), 'F0 3E 0E 00 20 00 00 3E 64 F7', 'equipment 0E, index 62: 00 3E');
  assert.equal(send('Osc 2 Octave', '+1'), 'F0 3E 0E 00 20 00 00 0C 4C F7', '+1 is 76, 16 + 5 x 12');
  assert.deepEqual(at('LFO 1 Shape').choices.map((c) => c.label), ['sin', 'tri', 'sqr', 'saw', 'rnd', 'S&H'], 'a list whose tab collapsed, split where its commas count out the range');
  assert.deepEqual(at('Assignment').choices.map((c) => c.label), ['normal', 'dual', 'unisono'], '`normal/dual/unisono`');
  assert.deepEqual(at('Aliasing').choices.map((c) => c.label), ['off', '1', '2', '3', '4', '5'], '`off,1-5`, counted out');
  assert.equal(at('Play Parameter #1').choices[0].label, 'Osc 1 Octave', 'the list\'s index column left off');
  assert.equal(at('Modifier 4 Type').address, '01 3E', 'printed `Modifier 3 Type` a second time');
  const [dump] = profile.dumpDefinitions;
  assert.deepEqual([dump.payload.offset, dump.payload.size, dump.completion.expectedBytes], [7, 256, 265]);
  assert.deepEqual([dump.checksum.fromOffset, dump.checksum.byteOffset], [5, 263], '`(BB+NN+SDATA)&7Fh`: from the location');
  assert.equal(profile.requests[0].template.join(' '), 'F0 3E 0E $deviceId 00 20 00 20 F7', 'the request\'s checksum, (BB+NN) & 7F');
  assert.equal(profile.identity, undefined, 'a member code for each hardware combination: no identity check');
});
