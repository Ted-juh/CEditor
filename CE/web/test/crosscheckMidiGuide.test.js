/**
 * tools/profiles/crosscheck-midi-guide.mjs: the comparison of the profiles' controller and NRPN
 * numbers with MIDI Guide's independent dataset. The dataset is not in the repository; its logic is
 * checked here on rows made by hand.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { compare, matchDevices, parseCsv, sameName } from '../../../tools/profiles/crosscheck-midi-guide.mjs';

test('CSV: quoted fields with commas, quotes and line breaks', () => {
  assert.deepEqual(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\n1,,3,\n'), [['a', 'b, c', 'say "hi"', 'two\nlines'], ['1', '', '3', '']]);
});

test('names: abbreviations read out, a voice prefix ignored; a word in common is not enough', () => {
  assert.ok(sameName('V1 OSC1 WF', 'Waveform Osc 1'));
  assert.ok(sameName('Lforate', 'LFO Rate'));
  assert.ok(sameName('O1 Wave', 'Osc 1 Waveform'));
  assert.ok(sameName('PWM A', 'Pulse width modulation amount I'));
  assert.ok(sameName('F1 Reso', 'Filter1 Resonance'));
  assert.ok(!sameName('V3 VOL ENV DEC', 'Mod. Envelope decay'));
  assert.ok(!sameName('Square II', 'SAW B'));
  assert.ok(!sameName('VCO LFO modulation', 'VCF LFO MOD'));
});

const profile = {
  id: 'maker-synth', manufacturer: 'Maker', name: 'Maker Synth One',
  authoringNotes: ['Left out, the performance controllers: Mod Wheel (CC 1).'],
  messageRecipes: [
    { id: 'cc20', kind: 'cc', controller: 20 }, { id: 'cc21', kind: 'cc', controller: 21 }, { id: 'cc22', kind: 'cc', controller: 22 },
    { id: 'n', kind: 'nrpn', parameterMsb: 0, parameterLsb: 37 },
  ],
  parameters: [
    { name: 'Filter Cutoff', messageRecipe: 'cc20' }, { name: 'Mod. Envelope decay', messageRecipe: 'cc21' }, { name: 'Drive', messageRecipe: 'cc22' },
    { name: 'LFO 1 Freq.', messageRecipe: 'n' },
  ],
};

test('a device against its profile: numbers both have, renamed, only one has, left out and named', () => {
  const device = { folder: 'Maker', maker: 'Maker', device: 'Synth One', rows: [
    { name: 'Cutoff', cc: 20, nrpn: null }, { name: 'V3 VOL ENV DEC', cc: 21, nrpn: null }, { name: 'Mod wheel', cc: 1, nrpn: null }, { name: 'Glide', cc: 5, nrpn: null },
    { name: 'VCA ENV REL', cc: null, nrpn: 37 },
  ] };
  const [pair] = matchDevices([device], [profile]);
  assert.equal(pair.profile.id, 'maker-synth');
  const r = compare(device, profile);
  assert.equal(r.cc.both, 2);
  assert.deepEqual(r.cc.renamed.map((x) => x.number), ['CC 21']);
  assert.deepEqual(r.cc.named.map((x) => x.number), ['CC 1']);
  assert.deepEqual(r.cc.onlyTheirs.map((x) => x.number), ['CC 5']);
  assert.deepEqual(r.cc.onlyOurs.map((x) => x.number), ['CC 22']);
  assert.deepEqual(r.nrpn.renamed.map((x) => x.number), ['NRPN 0/37']);
});
