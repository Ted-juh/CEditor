// sh201ArpPattern.test.js — the GAIA's arpeggio pattern editor, editing an SH-201.
//
// The grid, Read Pattern, Send Pattern and the readback status were written for the GAIA with its
// parameter names inline. The SH-201 stores its user pattern the same way — sixteen lanes, an
// Original Note and thirty-two steps each, one End Step — under other names, so the names became a
// layout (utils/arpPatternLayouts.js) and a grid marked `patternEditing.kind: 'sh201'` uses the
// SH-201's.
//
// A layout is only right if the profile agrees with it, so the first test checks every name and
// every request against the SH-201 profile itself rather than against a copy of the names.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { gaiaArpGrid } from '../../../tools/scripts/gaia-panel/components.mjs';
import { seedCustomValues } from '../src/CE_Application/utils/customComponentInteraction.js';
import { syncCustomArpeggiatorValues } from '../src/CE_Application/utils/customComponentArpeggiator.js';
import { ARP_PATTERN_LAYOUTS, hasPatternEditing, layoutFor } from '../src/CE_Application/utils/arpPatternLayouts.js';
import { patternReadGroups, decodeGaiaPattern, patternValuesForSend } from '../src/CE_Application/utils/gaiaPatternEditing.js';
import { gaiaExpectedArpValues, gaiaSyncStatus } from '../src/CE_Application/utils/gaiaSyncStatus.js';
import { createGaiaPatternTransfer } from '../src/CE_Application/utils/gaiaPatternTransfer.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../../profiles/test/${name}`, import.meta.url), 'utf8'));
const SH201 = read('roland-sh-201.ceditor-device.json');
const GAIA = read('roland-gaia-sh01.ceditor-device.json');
const layout = ARP_PATTERN_LAYOUTS.sh201;

function sh201Grid() {
  const grid = gaiaArpGrid({ width: 1536, height: 240 });
  grid._children.Designer.patternEditing = { kind: 'sh201', mode: 'manual' };
  return grid;
}
const grid = sh201Grid();
const seeded = () => seedCustomValues(grid);
const withBlocks = (values, blocks) => syncCustomArpeggiatorValues(grid, { ...values, __arpeggiator: { ...values.__arpeggiator, blocks } });

test('every name and request the SH-201 layout uses is in the SH-201 profile, with the GAIA\'s ranges', () => {
  for (const [profile, kind] of [[SH201, 'sh201'], [GAIA, 'gaia']]) {
    const parameters = new Map(profile.parameters.map((p) => [p.id, p]));
    const requests = new Set(profile.requests.map((r) => r.id));
    const groups = patternReadGroups(ARP_PATTERN_LAYOUTS[kind]);
    assert.equal(groups.length, 17);
    assert.equal(groups.flatMap((g) => g.ids).length, 529, `${kind}: End Step and 16 lanes of 33`);
    for (const group of groups) {
      assert.ok(requests.has(group.request), `${kind}: the profile has no request ${group.request}`);
      for (const id of group.ids) assert.ok(parameters.has(id), `${kind}: the profile has no parameter ${id}`);
    }
    // The meanings the editor reads into the numbers — 128 is OFF for a lane and a tie for a step —
    // need the same ranges on both synths.
    const endStep = parameters.get(ARP_PATTERN_LAYOUTS[kind].endStep);
    assert.deepEqual([endStep.range.min, endStep.range.max], [1, 32], `${kind}: End Step`);
    for (const id of groups.slice(1).flatMap((g) => g.ids)) {
      assert.deepEqual([parameters.get(id).range.min, parameters.get(id).range.max], [0, 128], `${kind}: ${id}`);
    }
  }
});

test('each lane\'s request asks for the block that lane\'s dump holds', () => {
  const dumps = new Map(SH201.dumpDefinitions.map((d) => [d.id, d]));
  for (const group of patternReadGroups(layout)) {
    const request = SH201.requests.find((r) => r.id === group.request);
    const dump = dumps.get(request.response.dump);
    assert.ok(dump, `${group.request} answers with a dump the profile defines`);
    const mapped = new Set(dump.mappings.map((m) => m.parameter));
    for (const id of group.ids) assert.ok(mapped.has(id), `${request.response.dump} carries ${id}`);
  }
});

test('a grid says which synth it edits; one without the mark is the GAIA\'s, as before', () => {
  assert.equal(hasPatternEditing(grid), true);
  assert.equal(layoutFor(grid).synth, 'SH-201');
  const unmarked = gaiaArpGrid();
  assert.equal(hasPatternEditing(unmarked), false);
  assert.equal(layoutFor(unmarked).kind, 'gaia');
});

test('the drawn pattern goes out under the SH-201\'s names, and reads back to the same notes', () => {
  const values = seeded();
  const expected = gaiaExpectedArpValues(grid, values).expected;
  assert.equal(Object.keys(expected).length, 529);
  assert.ok('arpeggio.pattern01.originalNote' in expected && 'arpeggio.pattern16.step32' in expected && 'arpeggio.endStep' in expected);
  assert.ok(!Object.keys(expected).some((id) => id.startsWith('arpPattern.')), 'no GAIA name leaks into an SH-201 send');

  const sent = patternValuesForSend(grid, values);
  assert.deepEqual(sent, expected);
  const decoded = decodeGaiaPattern(sent, layout);
  const shape = (blocks) => blocks.map(({ note, step, length, velocity }) => [note, step, length, velocity])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert.deepEqual(shape(decoded.blocks), shape(values.__arpeggiator.blocks));
  assert.ok(decoded.blocks.every((b) => b.id.startsWith('sh201_read_')));
});

test('a seventeenth pitch is refused in the SH-201\'s words', () => {
  const tooMany = withBlocks(seeded(), Array.from({ length: 17 }, (_, i) => ({ id: `n${i}`, note: 40 + i, step: 0, length: 1, velocity: 90 })));
  assert.throws(() => patternValuesForSend(grid, tooMany), /SH-201 supports at most 16 distinct pitches/);
});

test('Read Pattern asks the SH-201\'s seventeen requests and loads what they return', async () => {
  const values = seeded(), raw = gaiaExpectedArpValues(grid, values).expected;
  const feedback = { received: {}, writes: {}, reads: {} }, calls = [], loaded = [], states = [];
  let sequence = 1;
  const transfer = createGaiaPatternTransfer({
    control: grid, values: () => values, revision: () => 0, route: () => ({ key: 'sim', ready: true }), feedback: () => feedback,
    timeoutMs: 50, sendGapMs: 0, pause: () => new Promise((resolve) => setTimeout(resolve, 1)),
    read: ({ request }) => {
      calls.push(request);
      for (const id of patternReadGroups(layout).find((g) => g.request === request).ids) feedback.received[id] = { value: raw[id], sequence: sequence++ };
    },
    write: () => {}, apply: (decoded) => loaded.push(decoded), status: (...s) => states.push(s),
  });
  await transfer.run('read');
  assert.deepEqual(calls, ['requestArpeggioCommon', ...Array.from({ length: 16 }, (_, i) => `requestArpeggioPattern${String(i + 1).padStart(2, '0')}`)]);
  assert.equal(loaded.length, 1);
  assert.match(states.at(-1)[0], /READ COMPLETE/);
  assert.ok(states.some(([message]) => /READING 17\/17/.test(message)));
});

test('the status names the SH-201, and the simulated device needs no input to be ready', () => {
  const simulated = { type: 'simulatedDevice', id: 'simulatedDevice' };
  const none = { type: 'none', id: 'none' };
  const status = gaiaSyncStatus({
    grid, values: seeded(), feedback: {}, mapping: { profileId: 'roland-sh-201', midiDestination: simulated, midiInput: none },
    destinations: [simulated], inputs: [none], capabilities: { canSendSysex: true, canReceiveSysex: true },
  });
  assert.match(status.text, /MIDI PORTS READY/);
  assert.match(status.text, /NOT READ FROM SH-201/);
  const hardware = gaiaSyncStatus({
    grid, values: seeded(), feedback: {}, mapping: { profileId: 'roland-sh-201', midiDestination: { type: 'hardwareOutput', id: 'usb' }, midiInput: none },
    destinations: [{ type: 'hardwareOutput', id: 'usb' }], inputs: [none], capabilities: { canSendSysex: true, canReceiveSysex: true },
  });
  assert.match(hardware.text, /NO MIDI INPUT/, 'a real synth still needs its input');
});

// What a step is on the wire, as the owner knows the SH-201 to send it: two bytes, high nibble
// first — 08 00 a tie (128), 00 00 a rest (0), 07 0F the loudest velocity (127). The profile's
// nibbled encoding of 0..128 is exactly that, and a lane read back in those bytes is a note tied
// over two steps and then silence. Original Note's OFF is 128, so 08 00 as well.
test('a step is two bytes, high nibble first: 08 00 a tie, 00 00 a rest, 07 0F the loudest', async () => {
  const { encodeParameterValue, localBuildDumpMessage, localParseDumpMessage, localCompileParameter } =
    await import('../src/CE_Application/stores/deviceProfileLocalEngine.js');
  const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  const param = (id) => SH201.parameters.find((p) => p.id === id);
  const step = param(layout.step(1, 1));
  const wire = (value) => hex(encodeParameterValue(step, value).bytes ?? encodeParameterValue(step, value));
  assert.deepEqual([wire(128), wire(0), wire(127)], ['08 00', '00 00', '07 0F']);
  assert.equal(hex(encodeParameterValue(param(layout.originalNote(1)), 128).bytes ?? []), '08 00', 'Original Note OFF');
  assert.equal(localCompileParameter(SH201, { parameterId: layout.step(1, 1), value: 128, deviceRole: 'sh201' }).transaction.hex,
    'F0 41 10 00 00 16 12 10 00 06 02 08 00 60 F7', 'a tie on step 1 of lane 1, as the synth takes it');

  // Lane 1 read back: note C4, the loudest, tied into step 2, silent from step 3.
  const lane = localBuildDumpMessage(SH201, 'arpeggioPattern01Dump', {
    [layout.originalNote(1)]: 60, [layout.step(1, 1)]: 127, [layout.step(1, 2)]: 128, [layout.step(1, 3)]: 0,
  });
  assert.match(lane.hex, /^F0 41 10 00 00 16 12 10 00 06 00 03 0C 07 0F 08 00 00 00 /, 'note 60 is 03 0C, then 07 0F, 08 00, 00 00');
  const raw = { [layout.endStep]: 16 };
  for (let n = 1; n <= layout.lanes; n++) {
    raw[layout.originalNote(n)] = 128;
    for (let s = 1; s <= layout.steps; s++) raw[layout.step(n, s)] = 0;
  }
  Object.assign(raw, localParseDumpMessage(SH201, lane.hex).values);
  const { blocks } = decodeGaiaPattern(raw, layout);
  assert.deepEqual(blocks.map(({ note, step: at, length, velocity }) => ({ note, at, length, velocity })),
    [{ note: 60, at: 0, length: 2, velocity: 127 }]);
});
