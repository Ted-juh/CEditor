// sh201Panel.test.js — the SH-201 draft panel holds to what it is for: being read in the editor.
//
// The panel was generated once (tools/scripts/sh201-panel/make-sh201-panel.mjs) and is meant to be
// edited in CEditor from here on, so these read the FILE, not the generator: whatever an edit does
// to the layout, these are the promises the draft makes to someone reading it.
//
//   - every control sends one profile parameter, and all 64 of the Upper tone's are on it, once each
//   - a control sits in the section of the front panel its parameter belongs to
//   - every custom component is a clean linked copy of a package in the library file beside it,
//     with its range, default and readout as per-copy settings, not design edits
//   - the tone-select button has its State, and the panel has no scripts

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { flatControls, getChildControls } from '../src/CE_Application/utils/containment.js';
import {
  normalizeCustomComponentLibraryEnvelope, customComponentPackageId,
} from '../src/CE_Application/utils/customComponentPackage.js';
import { diffCustomComponentAgainstSource } from '../src/CE_Application/utils/customComponentSourceLink.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const panel = deserializePanel(read('CE/panels/Roland SH-201.cepanel'), 'Roland SH-201.cepanel', null);
const profile = JSON.parse(read('CE/profiles/test/roland-sh-201.ceditor-device.json'));
const library = normalizeCustomComponentLibraryEnvelope(JSON.parse(read('CE/panels/Roland SH-201 components.json')));
const parameters = new Map(profile.parameters.map((p) => [p.id, p]));
const all = flatControls(panel.controls);
const bound = all.filter((c) => (c._children.DeviceBindings?.bindings ?? []).length);

/** Which section of the front panel each of the profile's Upper groups belongs in. */
const SECTION_FOR_GROUP = {
  'Upper OSC1': 'OSC 1', 'Upper OSC2': 'OSC 2', 'Upper Mix Mod': 'MIX/MOD',
  'Upper LFO1': 'LFO 1', 'Upper LFO2': 'LFO 2', 'Upper Pitch Env': 'PITCH ENV',
  'Upper Filter': 'FILTER', 'Upper Filter Env': 'FILTER', 'Upper AMP': 'AMP', 'Upper AMP Env': 'AMP',
  'Upper Performance': 'PERFORMANCE', 'Upper Effects Send': 'EFFECTS',
};

test('every control sends one SH-201 parameter, and the whole Upper tone is there once', () => {
  const sent = [];
  for (const control of bound) {
    const bindings = control._children.DeviceBindings.bindings;
    assert.equal(bindings.length, 1, `${control._children.Core.name} has one binding`);
    const [binding] = bindings;
    assert.equal(binding.deviceRole, 'Roland SH-201');
    assert.ok(parameters.has(binding.parameterId), `${binding.parameterId} is in the profile`);
    assert.equal(binding.dryRun, false);
    sent.push(binding.parameterId);
  }
  const upper = profile.parameters.filter((p) => p.id.startsWith('upper.')).map((p) => p.id);
  assert.equal(upper.length, 64);
  assert.deepEqual([...sent].sort(), [...upper].sort(), 'each Upper parameter once, and nothing else');
  assert.deepEqual(panel.requiredProfiles, [{ role: 'Roland SH-201', profileId: 'roland-sh-201', version: '*' }]);
});

test('the component tree reads like the front panel: Upper, then its sections', () => {
  const upper = panel.controls.find((c) => c._children.Core.name === 'Upper');
  assert.ok(upper, 'a top-level Upper container');
  const sections = getChildControls(upper).map((c) => c._children.Core.name);
  assert.deepEqual([...sections].sort(), [...new Set(Object.values(SECTION_FOR_GROUP))].sort());
  for (const section of getChildControls(upper)) {
    for (const control of getChildControls(section)) {
      const id = control._children.DeviceBindings?.bindings?.[0]?.parameterId;
      if (!id) continue;
      assert.equal(SECTION_FOR_GROUP[parameters.get(id).group], section._children.Core.name,
        `${id} (${parameters.get(id).group}) sits in ${section._children.Core.name}`);
    }
  }
});

test('every custom component is a clean linked copy of a package in the library beside the panel', () => {
  const entries = library.packages.map((envelope) => ({
    id: customComponentPackageId(envelope), version: envelope.metadata.version, fingerprint: envelope.fingerprint,
    component: envelope.component, envelope,
  }));
  assert.deepEqual(library.packages.map((p) => p.metadata.name).sort(), ['SH-201 Fader', 'SH-201 Knob', 'SH-201 LED Switch']);
  const copies = all.filter((c) => c._children.Core.controlType === 'CustomComponent');
  // Every Upper parameter that is not a named list: those are stock Comboboxes, their rows the profile's.
  const notLists = profile.parameters.filter((p) => p.id.startsWith('upper.') && p.type !== 'choice').length;
  assert.equal(copies.length, notLists);
  for (const copy of copies) {
    const report = diffCustomComponentAgainstSource(copy, entries);
    assert.equal(report.status, 'current',
      `${copy._children.Core.name}: ${report.status} ${report.design.map((d) => d.path).join(', ')}`);
  }
});

test('a copy reads and sends its parameter\'s whole range, and reads it as the synth does', () => {
  for (const control of bound.filter((c) => c._children.Core.controlType === 'CustomComponent')) {
    const parameter = parameters.get(control._children.DeviceBindings.bindings[0].parameterId);
    const channel = control._children.ValueChannels._children.value;
    if (parameter.type === 'boolean') {
      assert.equal(channel.currentValue, parameter.default === true ? 1 : 0, `${parameter.id} opens at its default`);
      continue;
    }
    assert.deepEqual([channel.min, channel.max], [parameter.range.min, parameter.range.max], parameter.id);
    assert.equal(channel.currentValue, parameter.default, `${parameter.id} opens at its default`);
    if (Number.isFinite(parameter.display?.min)) {
      assert.deepEqual([channel.format.displayMin, channel.format.displayMax], [parameter.display.min, parameter.display.max], parameter.id);
    }
  }
});

test('the tone-select button lights the tone being edited, and there are no scripts', () => {
  const button = all.find((c) => c._children.Core.name === 'Tone Upper');
  const state = button?._children.States?._children?.Editing;
  assert.ok(state, 'the Editing state');
  assert.deepEqual(state.when, { checked: true });
  assert.ok(state.patches.component['Background.Fill.colour']);
  assert.equal(button._children.Behavior.defaultValue, true, 'Upper is the tone being edited');
  assert.deepEqual(panel.scripts ?? [], []);
  assert.ok(all.every((c) => !(c._children.Scripts?.scripts ?? []).length));
  assert.match(panel.notepad.notes[0].content, /Simulated device/);
});
