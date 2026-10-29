// sh201Panel.test.js — the two SH-201 panels hold to what they are for: being read in the editor.
//
// Both were generated once (tools/scripts/sh201-panel/make-sh201-panel.mjs) and are meant to be
// edited in CEditor from here on, so these read the FILES, not the generator: whatever an edit does
// to the layout, these are the promises each panel makes to someone reading it.
//
// The draft, Roland SH-201.cepanel, in the GAIA panel's look:
//   - every control sends one profile parameter: all 64 of each tone's, once each, and Keyboard Part
//   - a control sits in its tone, and in the section of the front panel its parameter belongs to;
//     both tones are on the panel at once, Upper above Lower
//   - every custom component is a clean linked copy of a package in the library file beside it,
//     with its range, default and readout as per-copy settings, not design edits
//   - Keyboard Part is a choice of the synth's own two, in the header, and the panel has no scripts
//
// The hardware look, the answer to the tutorial in the draft's notepad, makes all the same promises
// with the instrument's own sections, and is the draft repainted: the same parameters on the same
// packages, the knob at its next version, and only the filter envelopes' depth a different kind.

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
import { render } from 'svelte/server';
import { get } from 'svelte/store';
import PanelPreviewSurface from '../src/CE_Application/editor/PanelPreviewSurface.svelte';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { panelPreviewSessions, createInteractionPreviewSession, setPreviewModeEnabled } from '../src/CE_Application/stores/interactionPreview.js';
import { syncDeviceParameterToPanelPreview } from '../src/CE_Application/utils/deviceBindingSync.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const profile = JSON.parse(read('CE/profiles/test/roland-sh-201.ceditor-device.json'));
const parameters = new Map(profile.parameters.map((p) => [p.id, p]));

/** Which section of the front panel each of the profile's tone groups belongs in ("Upper OSC1" is "OSC1"). */
const DRAFT_SECTIONS = {
  'OSC1': 'OSC 1', 'OSC2': 'OSC 2', 'Mix Mod': 'MIX/MOD',
  'LFO1': 'LFO 1', 'LFO2': 'LFO 2', 'Pitch Env': 'PITCH ENV',
  'Filter': 'FILTER', 'Filter Env': 'FILTER', 'AMP': 'AMP', 'AMP Env': 'AMP',
  'Performance': 'PERFORMANCE', 'Effects Send': 'EFFECTS',
};
/** On the instrument the two envelopes are sections of their own. */
const HARDWARE_SECTIONS = { ...DRAFT_SECTIONS, 'Filter Env': 'FILTER ENV', 'AMP Env': 'AMP ENV' };
const TONES = ['upper', 'lower'];
const toneOf = (parameterId) => parameterId.split('.')[0];
const sectionGroup = (parameter) => parameter.group.replace(/^(Upper|Lower) /, '');

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

  test(`${file}: every control sends one SH-201 parameter, both tones whole and once, and Keyboard Part`, () => {
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
    const tones = profile.parameters.filter((p) => TONES.includes(toneOf(p.id))).map((p) => p.id);
    assert.equal(tones.length, 128);
    assert.deepEqual([...sent].sort(), [...tones, 'patch.keyboardPart'].sort(), 'each tone parameter once, Keyboard Part, and nothing else');
    assert.deepEqual(panel.requiredProfiles, [{ role: 'Roland SH-201', profileId: 'roland-sh-201', version: '*' }]);
  });

  test(`${file}: the component tree reads like the front panel: its two tones, their sections`, () => {
    const tones = panel.controls.filter((c) => getChildControls(c).length);
    assert.deepEqual(tones.map((c) => [c._children.Core.name, c._children.Core.controlType]), [['Upper', 'Group'], ['Lower', 'Group']],
      'two top-level groups, Upper first');
    assert.ok(!all.some((c) => c._children.Core.controlType === 'TabContainer'), 'both tones at once, not pages of one');
    const [upper, lower] = tones.map((c) => c._children.Transform);
    assert.ok(upper.y + upper.height <= lower.y, 'Upper above Lower');
    for (const tone of tones) {
      const toneId = tone._children.Core.name.toLowerCase();
      const groups = getChildControls(tone).filter((c) => getChildControls(c).length);
      assert.deepEqual(groups.map((c) => c._children.Core.name).sort(), [...new Set(Object.values(sections))].sort(), tone._children.Core.name);
      for (const section of groups) {
        for (const control of getChildControls(section)) {
          const id = parameterOf(control);
          if (!id) continue;
          assert.equal(toneOf(id), toneId, `${id} is in the ${tone._children.Core.name} tone`);
          assert.equal(sections[sectionGroup(parameters.get(id))], section._children.Core.name,
            `${id} (${parameters.get(id).group}) sits in ${section._children.Core.name}`);
        }
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
    // Every tone parameter that is not a named list: those are stock Comboboxes, their rows the profile's.
    const notLists = profile.parameters.filter((p) => TONES.includes(toneOf(p.id)) && p.type !== 'choice').length;
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

  test(`${file}: Keyboard Part is the synth's own choice of tone, and there are no scripts`, () => {
    const keyboardPart = parameters.get('patch.keyboardPart');
    const selector = bound.find((c) => parameterOf(c) === 'patch.keyboardPart');
    assert.equal(selector._children.Core.controlType, 'RadioButtonGroup');
    assert.ok(panel.controls.includes(selector), 'in the header, beside neither tone');
    // Its rows are the profile's choices, so a value heard from the synth selects the row it names.
    assert.deepEqual(selector._children.Value.rows.map((row) => [row.id, row.sendValue]),
      keyboardPart.choices.map((choice) => [choice.id, choice.value]));
    assert.equal(selector._children.Behavior.defaultValue, keyboardPart.default, 'opens on the part a new patch has');
    const [binding] = selector._children.DeviceBindings.bindings;
    assert.deepEqual([binding.port, binding.feedback.receiveUpdates], ['selectedChoice', true]);
    assert.ok(!all.some((c) => c._children.Core.controlType === 'ToggleButton'), 'no tone button beside it');
    assert.deepEqual(panel.scripts ?? [], []);
    assert.ok(all.every((c) => !(c._children.Scripts?.scripts ?? []).length));
    assert.match(panel.notepad.notes[0].content, /Simulated device/);
  });
}

test('KEYBOARD follows the synth: Lower pressed on the instrument lights LOWER in the panel', () => {
  const selector = draft.bound.find((c) => parameterOf(c) === 'patch.keyboardPart');
  const id = selector._children.Core.id;
  setPreviewModeEnabled(true);
  const panel = { id: 'sh201', width: draft.panel.width, height: 60, controls: [selector], layers: [] };
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  panelPreviewSessions.set({ [id]: createInteractionPreviewSession(selector) });
  const lit = () => [...render(PanelPreviewSurface, { props: { panel, scale: 1, bgLayers: {}, gridStyle: '' } }).body
    .matchAll(/class="radio-group-item(?: [^"]*)?"/g)].map(([cls]) => /\bselected\b/.test(cls));
  assert.deepEqual(lit(), [true, false], 'a new patch plays Upper');
  // The device service reports a choice by its id; a raw number names the same row.
  for (const [reported, expected] of [['lower', [false, true]], ['upper', [true, false]], [1, [false, true]], [0, [true, false]]]) {
    syncDeviceParameterToPanelPreview('Roland SH-201', 'patch.keyboardPart', reported);
    assert.deepEqual(lit(), expected, `the synth reports ${JSON.stringify(reported)}`);
  }
  assert.equal(get(panelPreviewSessions)[id].valueOverride, 'upper');
});

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
  assert.deepEqual(changed.sort(), ['lower.filterEnv.depth: SH-201 Knob → SH-201 Fader', 'upper.filterEnv.depth: SH-201 Knob → SH-201 Fader'],
    'the filter envelope depth is a slider, as on the instrument');

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

test('the hardware look\'s silver sections carry the brushed-metal overlay that ships beside it', () => {
  const texture = readFileSync(path.join(REPO, 'CE/panels/Roland SH-201 brushed metal.png'));
  assert.deepEqual([...texture.subarray(1, 4)].map((b) => String.fromCharCode(b)).join(''), 'PNG');
  const dataUrl = `data:image/png;base64,${texture.toString('base64')}`;
  const SILVER = ['OSC 1', 'OSC 2', 'MIX/MOD', 'FILTER', 'AMP'];
  const sections = (look) => look.all.filter((c) => c._children.Core.controlType === 'Group' && getChildControls(c).length
    && Object.values(look.sections).includes(c._children.Core.name));
  const silver = sections(hardware).filter((c) => SILVER.includes(c._children.Core.name));
  assert.equal(silver.length, SILVER.length * 2, 'both tones');
  for (const section of silver) {
    const fill = section._children.Background._children.Fill;
    assert.deepEqual([fill.overlayEnabled, fill.overlayBlend, fill.overlayFit, fill.overlaySrc === dataUrl],
      [true, 'overlay', 'tile', true], `${section._children.Core.name}: a transparent metallic overlay, the file beside the panel`);
    assert.ok(fill.overlayOpacity > 0 && fill.overlayOpacity < 100, 'transparent');
  }
  for (const section of [...sections(hardware).filter((c) => !SILVER.includes(c._children.Core.name)), ...sections(draft)]) {
    assert.notEqual(section._children.Background._children.Fill.overlayEnabled, true, `${section._children.Core.name} has no overlay`);
  }
  const tutorial = draft.panel.notepad.notes.find((note) => /^Tutorial 1\b/.test(note.content)).content;
  assert.match(tutorial, /transparent metallic overlay/);
  assert.match(tutorial, /Roland SH-201 brushed metal\.png/);
  assert.match(tutorial, /Blend to Overlay/);
});
