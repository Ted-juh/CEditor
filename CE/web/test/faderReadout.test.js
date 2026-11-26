// A fader's value readout stands beside its cap, on the panel, and it was drawn in the cap's colour.
// Measured against each set's own panel (2026-11-26), 35 of the 79 built-in sets put it under 3:1
// there: a white cap on a white panel (Ceramic, Kiln, Studio White), a dark one on a dark one
// (Chrome, Obsidian, Brassworks). The owner: add a fader readout colour to the sets. A set now holds
// `control.readout`, given the cap's colour where the cap reads on the set's panel at 4.5:1 and its
// label text's where it does not; a slider draws its readout in it, a knob (whose readout can sit in
// its cap, on the knob) in the cap's as before.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILT_IN_CONTROL_SETS, BASE_CONTROL_SET, CONTROL_SET_TOKEN_NAMES, READOUT_CONTRAST,
  getControlSet, normalizeControlSetDefinition, resolveToken, withReadout,
} from '../src/CE_Application/models/controlSets.js';
import { contrast } from '../src/CE_Application/models/instrumentDesigns.js';
import { ROLE_GROUPS } from '../src/CE_Application/models/setEditing.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { convertRangeControl } from '../src/CE_Application/utils/rangeControlConversion.js';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';

const readoutOf = (control) => control._children.Parts._children.labelCurrent._children.Text._children.Fill.colour;
const onPanel = (set) => contrast(resolveToken('control.readout', set), resolveToken('panel.surface', set));

test('every built-in set names a fader readout, and it reads on the set\'s own panel', () => {
  assert.ok(CONTROL_SET_TOKEN_NAMES.includes('control.readout'));
  for (const set of BUILT_IN_CONTROL_SETS) {
    assert.match(set.tokens['control.readout'] ?? '', /^\{(control\.cap|text\.label)\}$/, `${set.id} names one, as a reference`);
    assert.ok(onPanel(set) >= READOUT_CONTRAST, `${set.id}: ${resolveToken('control.readout', set)} on ${resolveToken('panel.surface', set)}, ${onPanel(set).toFixed(2)}:1`);
  }
});

test('the cap\'s colour where it reads on the panel, the label text\'s where it does not', () => {
  for (const set of BUILT_IN_CONTROL_SETS) {
    const capReads = contrast(resolveToken('control.cap', set), resolveToken('panel.surface', set)) >= READOUT_CONTRAST;
    assert.equal(set.tokens['control.readout'], capReads ? '{control.cap}' : '{text.label}', set.id);
  }
  // A white cap on a white panel, a dark one on a dark one, and one that reads.
  assert.equal(getControlSet('ceramic').tokens['control.readout'], '{text.label}');
  assert.equal(getControlSet('obsidian').tokens['control.readout'], '{text.label}');
  assert.equal(getControlSet('backlit').tokens['control.readout'], '{control.cap}');
  assert.equal(BASE_CONTROL_SET.tokens['control.readout'], '{control.cap}', 'the base set\'s follows a set\'s own cap');
  const counts = BUILT_IN_CONTROL_SETS.reduce((n, set) => ({ ...n, [set.tokens['control.readout']]: (n[set.tokens['control.readout']] ?? 0) + 1 }), {});
  assert.deepEqual(counts, { '{control.cap}': 40, '{text.label}': 39 });
});

test('a set that names its own readout keeps it; a set read without one is given one by the same rule', () => {
  const named = withReadout({ id: 'mine', tokens: { 'control.cap': 'FFFFFFFF', 'panel.surface': 'FFFFFFFF', 'text.label': 'FF000000', 'control.readout': 'FFFF0000' } });
  assert.equal(named.tokens['control.readout'], 'FFFF0000');
  const ceramic = getControlSet('ceramic');
  const old = { ...ceramic, id: 'my-ceramic', tokens: { ...ceramic.tokens } };
  delete old.tokens['control.readout'];
  assert.equal(normalizeControlSetDefinition(old).tokens['control.readout'], '{text.label}', 'a set file from before the role');
  const partial = withReadout({ id: 'bare', tokens: { 'control.cap': 'FFFFFFFF' } });
  assert.equal(partial.tokens['control.readout'], undefined, 'nothing to judge by: the base set\'s reference, to its own cap');
  assert.equal(resolveToken('control.readout', partial), 'FFFFFFFF');
});

test('Settings › Control Sets offers it among the controls\' colours', () => {
  const controls = ROLE_GROUPS.find((group) => group.id === 'controls').roles;
  assert.deepEqual(controls.find(([key]) => key === 'control.readout'), ['control.readout', 'Fader readout']);
});

test('a slider draws its readout in it, a knob in its cap\'s; changing one into the other swaps a default and keeps an author\'s', () => {
  assert.equal(readoutOf(createControl('Slider')), '{control.readout}');
  assert.equal(readoutOf(createControl('Knob')), '{control.cap}');
  assert.equal(readoutOf(convertRangeControl(createControl('Slider'))), '{control.cap}');
  assert.equal(readoutOf(convertRangeControl(createControl('Knob'))), '{control.readout}');
  const authored = createControl('Knob');
  authored._children.Parts._children.labelCurrent._children.Text._children.Fill.colour = 'FF112233';
  assert.equal(readoutOf(convertRangeControl(authored)), 'FF112233');
});

test('a fader saved before the role opens with it: a saved file keeps a default as nothing', () => {
  const path = new URL('../../panels/Components/Slider/Slider Touch.cepanel', import.meta.url);
  const text = readFileSync(path, 'utf8');
  assert.doesNotMatch(text, /control\.readout/, 'the file never wrote the readout\'s colour');
  const panel = deserializePanel(text, path.pathname, null);
  const readout = panel.controls.find((control) => control._children.Core.name === 'Readout');
  assert.equal(readoutOf(readout), '{control.readout}');
});
