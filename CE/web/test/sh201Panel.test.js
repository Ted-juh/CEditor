// sh201Panel.test.js — the two SH-201 panels hold to what they are for: being read in the editor.
//
// Both were generated once (tools/scripts/sh201-panel/make-sh201-panel.mjs) and are meant to be
// edited in CEditor from here on, so these read the FILES, not the generator: whatever an edit does
// to the layout, these are the promises each panel makes to someone reading it.
//
// The draft, Roland SH-201.cepanel, in the GAIA panel's look:
//   - every control sends one profile parameter, and all 64 of the Upper tone's are on it, once each
//   - a control sits in the section of the front panel its parameter belongs to
//   - every custom component is a clean linked copy of a package in the library file beside it,
//     with its range, default and readout as per-copy settings, not design edits
//   - the tone-select button has its State, and the panel has no scripts
//
// The hardware look, the answer to the tutorial in the draft's notepad, makes all the same promises
// with the instrument's own sections, and is the draft repainted: the same parameters on the same
// packages, the knob at its next version, and only the filter envelope's depth a different kind.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
const profile = JSON.parse(read('CE/profiles/test/roland-sh-201.ceditor-device.json'));
const parameters = new Map(profile.parameters.map((p) => [p.id, p]));

/** Which section of the front panel each of the profile's Upper groups belongs in. */
const DRAFT_SECTIONS = {
  'Upper OSC1': 'OSC 1', 'Upper OSC2': 'OSC 2', 'Upper Mix Mod': 'MIX/MOD',
  'Upper LFO1': 'LFO 1', 'Upper LFO2': 'LFO 2', 'Upper Pitch Env': 'PITCH ENV',
  'Upper Filter': 'FILTER', 'Upper Filter Env': 'FILTER', 'Upper AMP': 'AMP', 'Upper AMP Env': 'AMP',
  'Upper Performance': 'PERFORMANCE', 'Upper Effects Send': 'EFFECTS',
};
/** On the instrument the two envelopes are sections of their own. */
const HARDWARE_SECTIONS = { ...DRAFT_SECTIONS, 'Upper Filter Env': 'FILTER ENV', 'Upper AMP Env': 'AMP ENV' };

function load(file, libraryFile, sections) {
  const panel = deserializePanel(read(`CE/panels/${file}`), file, null);
  const library = normalizeCustomComponentLibraryEnvelope(JSON.parse(read(`CE/panels/${libraryFile}`)));
  const all = flatControls(panel.controls);
  const bound = all.filter((c) => (c._children.DeviceBindings?.bindings ?? []).length);
  return { file, panel, library, all, bound, sections };
}

const draft = load('Roland SH-201.cepanel', 'Roland SH-201 components.json', DRAFT_SECTIONS);
const hardware = load('Roland SH-201 (hardware look).cepanel', 'Roland SH-201 (hardware look) components.json', HARDWARE_SECTIONS);

const parameterOf = (control) => control._children.DeviceBindings?.bindings?.[0]?.parameterId;
const sourceOf = (control) => control._children.Designer?.sourcePackage;
const isCopy = (control) => control._children.Core.controlType === 'CustomComponent';

for (const look of [draft, hardware]) {
  const { file, panel, library, all, bound, sections } = look;

  test(`${file}: every control sends one SH-201 parameter, and the whole Upper tone is there once`, () => {
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

  test(`${file}: the component tree reads like the front panel: Upper, then its sections`, () => {
    const upper = panel.controls.find((c) => c._children.Core.name === 'Upper');
    assert.ok(upper, 'a top-level Upper container');
    const groups = getChildControls(upper).filter((c) => getChildControls(c).length);
    assert.deepEqual(groups.map((c) => c._children.Core.name).sort(), [...new Set(Object.values(sections))].sort());
    for (const section of groups) {
      for (const control of getChildControls(section)) {
        const id = parameterOf(control);
        if (!id) continue;
        assert.equal(sections[parameters.get(id).group], section._children.Core.name,
          `${id} (${parameters.get(id).group}) sits in ${section._children.Core.name}`);
      }
    }
  });

  test(`${file}: every custom component is a clean linked copy of a package in the library beside the panel`, () => {
    const entries = library.packages.map((envelope) => ({
      id: customComponentPackageId(envelope), version: envelope.metadata.version, fingerprint: envelope.fingerprint,
      component: envelope.component, envelope,
    }));
    assert.deepEqual(library.packages.map((p) => p.metadata.name).sort(), ['SH-201 Fader', 'SH-201 Knob', 'SH-201 LED Switch']);
    const copies = all.filter(isCopy);
    // Every Upper parameter that is not a named list: those are stock Comboboxes, their rows the profile's.
    const notLists = profile.parameters.filter((p) => p.id.startsWith('upper.') && p.type !== 'choice').length;
    assert.equal(copies.length, notLists);
    for (const copy of copies) {
      const report = diffCustomComponentAgainstSource(copy, entries);
      assert.equal(report.status, 'current',
        `${copy._children.Core.name}: ${report.status} ${report.design.map((d) => d.path).join(', ')}`);
    }
  });

  test(`${file}: a copy reads and sends its parameter's whole range, and reads it as the synth does`, () => {
    for (const control of bound.filter(isCopy)) {
      const parameter = parameters.get(parameterOf(control));
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

  test(`${file}: the tone-select button lights the tone being edited, and there are no scripts`, () => {
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
}

test('the draft\'s tutorial counts what the draft holds, and its answer is beside it', () => {
  const tutorial = draft.panel.notepad.notes.find((note) => /^Tutorial 1\b/.test(note.content));
  assert.ok(tutorial, 'a Tutorial 1 note');
  const knobs = draft.all.filter((c) => sourceOf(c)?.name === 'SH-201 Knob').length;
  assert.match(tutorial.content, new RegExp(`once for all ${knobs} of them`));
  assert.match(tutorial.content, new RegExp(`Update ${knobs - 1} other copies`));
  assert.match(tutorial.content, /Save to library as 1\.1\.0/);
  for (const answer of ['Roland SH-201 (hardware look).cepanel']) {
    assert.ok(tutorial.content.includes(answer), `names ${answer}`);
    assert.ok(existsSync(path.join(REPO, 'CE/panels', answer)), `${answer} exists`);
  }
  assert.match(tutorial.content, /Use your own/, 'a photo of the instrument is the reader\'s own');
});

test('the hardware look is the draft repainted: the same parameter on the same package, the knob one version on', () => {
  const byParameter = (look) => new Map(look.bound.map((c) => [parameterOf(c), c]));
  const before = byParameter(draft);
  const after = byParameter(hardware);
  const changed = [];
  for (const [id, control] of after) {
    const was = before.get(id);
    const kind = (c) => sourceOf(c)?.name ?? c._children.Core.controlType;
    if (kind(was) !== kind(control)) { changed.push(`${id}: ${kind(was)} → ${kind(control)}`); continue; }
    if (!sourceOf(control)) continue;
    const expected = sourceOf(control).name === 'SH-201 Knob' ? '1.1.0' : '1.0.0';
    assert.equal(sourceOf(was).version, '1.0.0', `${id} in the draft`);
    assert.equal(sourceOf(control).version, expected, `${id} in the hardware look`);
  }
  assert.deepEqual(changed, ['upper.filterEnv.depth: SH-201 Knob → SH-201 Fader'], 'the filter envelope depth is a slider, as on the instrument');

  const packages = (look) => Object.fromEntries(look.library.packages.map((p) => [p.metadata.name, p]));
  const [old, next] = [packages(draft), packages(hardware)];
  assert.equal(next['SH-201 Knob'].metadata.version, '1.1.0');
  assert.notEqual(next['SH-201 Knob'].fingerprint, old['SH-201 Knob'].fingerprint, 'the knob\'s design changed');
  assert.deepEqual(next['SH-201 Knob'].component._children.PublishedProperties, old['SH-201 Knob'].component._children.PublishedProperties,
    'and what a copy may set on it did not, so every copy keeps its range, default and readout');
  for (const name of ['SH-201 Fader', 'SH-201 LED Switch']) {
    assert.equal(next[name].fingerprint, old[name].fingerprint, `${name} is the draft's`);
  }
});
