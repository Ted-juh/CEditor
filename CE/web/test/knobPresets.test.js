// knobPresets.test.js — the Knob's built-in animation presets (utils/knobPresets.js) and the
// Components showcase that wears them (scripts/componentPanels.js, CE/panels/Components/Knob/).
//
// The promises: every preset is an ordinary preset that survives its own file; each goes on a knob
// in every set the showcase dresses one in, and the one that belongs on a name Label goes there and
// is refused on the knob; a Glide takes the place of the knob's own glide rather than tying with it;
// a state with a rule keeps it; the readout presets show the readout and hide it at rest; a value
// effect hands back to the value; nothing loops that does not say so; in the library a built-in
// applies linked, the panel carries it, and nobody is asked to adopt it; and the showcase panels are
// those presets on knobs, one panel a group.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { KNOB_PRESETS, KNOB_PRESET_GROUPS, knobPresetId } from '../src/CE_Application/utils/knobPresets.js';
import {
  applyPresetPatch, presetDoesNotFit, presetFileText, readPresetFile, cleanPreset, presetLink,
} from '../src/CE_Application/utils/animationPresetModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { stateMatches } from '../src/CE_Application/utils/interactionRuntime.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';

import { initHistory, flushHistory } from '../src/CE_Application/stores/history.js';
import { panels, activePanelId, activeEditorTab, selectedComponentIds, addPanel, createPanel } from '../src/CE_Application/stores/panels.js';
import { addControl } from '../src/CE_Application/stores/controls.js';
import { componentWorkspaceMode } from '../src/CE_Application/stores/componentWorkspace.js';
import {
  COMPONENT_PRESETS, presetsToAdopt, panelAnimationPresets, applyAnimationPreset, updatePanelPreset, resetAnimationPresetLibraryForTesting,
} from '../src/CE_Application/stores/animationPresetLibrary.js';

import { KNOB_PANELS } from '../scripts/componentPanels.js';

const byId = (slug) => KNOB_PRESETS.find((entry) => entry.slug === slug);

/** A knob as the showcase makes one for a preset: its settings, and the set it is dressed in. */
function knobFor(entry, setId = '') {
  const knob = createControl('Knob');
  Object.assign(knob._children.Behavior, entry.knob);
  return setId ? resolveControlForSet(knob, getControlSet(setId)) : knob;
}
const applied = (control, preset) => {
  const { patch, reason } = applyPresetPatch(control, preset);
  assert.ok(patch, reason);
  for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value);
  return control;
};

test('the catalogue: seven groups in order, each preset an ordinary preset under its group, ids of its own', () => {
  assert.deepEqual(KNOB_PRESET_GROUPS.map((group) => group.id), ['numbers', 'ticks', 'touch', 'turning', 'attention', 'gestures', 'words']);
  for (const group of KNOB_PRESET_GROUPS) assert.ok(KNOB_PRESETS.some((entry) => entry.group === group.id), `${group.id} has presets`);
  const ids = KNOB_PRESETS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  for (const entry of KNOB_PRESETS) {
    assert.ok(entry.preset, `${entry.slug} cleans`);
    assert.equal(entry.id, knobPresetId(entry.slug));
    assert.match(entry.id, /^ce:knob:[a-z-]+$/);
    assert.equal(entry.preset.category, 'Knob');
    assert.equal(entry.preset.tags[0], entry.groupLabel);
    assert.ok(entry.how && entry.what, `${entry.slug} says what plays it and what it does`);
    // Its own file, read back, is the same preset.
    assert.deepEqual(readPresetFile(presetFileText(entry.preset)).preset, entry.preset, `${entry.slug} survives its file`);
  }
});

test('every knob preset goes on the default knob and on a knob in its own panel\'s set; the name Label one on a Label only', () => {
  const setOf = Object.fromEntries(KNOB_PANELS.map(([id, make]) => [id.slice('knob-'.length), make().controlSet]));
  const allSets = [...new Set(Object.values(setOf))];
  for (const entry of KNOB_PRESETS) {
    if (entry.on === 'label') {
      assert.equal(presetDoesNotFit(entry.preset, createControl('Label')), '', `${entry.slug} fits a Label`);
      assert.match(presetDoesNotFit(entry.preset, createControl('Knob')), /Text/, `${entry.slug} is refused on the knob`);
      continue;
    }
    assert.equal(presetDoesNotFit(entry.preset, knobFor(entry)), '', `${entry.slug} fits the default knob`);
    assert.equal(presetDoesNotFit(entry.preset, knobFor(entry, setOf[entry.group])), '', `${entry.slug} fits a ${setOf[entry.group]} knob`);
    // In the other sets it fits, or says what the knob lacks: a set that shows no ticks has none to play on.
    for (const set of allSets) {
      const reason = presetDoesNotFit(entry.preset, knobFor(entry, set));
      assert.ok(reason === '' || /Ticks section/.test(reason), `${entry.slug} on ${set}: ${reason}`);
    }
  }
});

test('a text effect on words the knob does not show is refused, unless the preset itself shows them', () => {
  const plain = createControl('Knob');
  plain._children.Behavior.scaleNumberCount = 0;
  assert.match(presetDoesNotFit(byId('scale-types-in').preset, plain), /does not show that now/);
  // The readout's doors turn the readout on, so a knob with it off is not refused for that.
  assert.equal(plain._children.Behavior.showHandleLabels, false);
  assert.equal(presetDoesNotFit(byId('readout-doors').preset, plain), '');
});

test('Glide, Snap and Spring take the place of the knob\'s own glide, linked, instead of tying with it', () => {
  for (const slug of ['glide', 'snap', 'spring']) {
    const knob = applied(createControl('Knob'), byId(slug).preset);
    const names = Object.keys(knob._children.Animations._children);
    assert.deepEqual(names.sort(), ['pointerSlide', 'rangeSlide'], `${slug}: still two glides, no second pair`);
    for (const name of names) {
      const node = knob._children.Animations._children[name];
      assert.equal(presetLink(node)?.id, byId(slug).id, `${slug}: ${name} follows the preset`);
      assert.equal(node.duration, byId(slug).preset.animations[name].duration);
    }
  }
  // A Spring after a Glide takes the Glide's place; the same preset again adds a copy, as any does.
  const turned = applied(applied(createControl('Knob'), byId('glide').preset), byId('spring').preset);
  assert.deepEqual(Object.keys(turned._children.Animations._children).sort(), ['pointerSlide', 'rangeSlide']);
  assert.equal(presetLink(turned._children.Animations._children.pointerSlide).id, byId('spring').id);
  const twice = applied(applied(createControl('Knob'), byId('glide').preset), byId('glide').preset);
  assert.deepEqual(Object.keys(twice._children.Animations._children).sort(), ['pointerSlide', 'pointerSlide2', 'rangeSlide', 'rangeSlide2']);
  // Something that eases other things on the same change is not taken over.
  const knob = createControl('Knob');
  const other = { ...byId('glide').preset, id: 'ce:knob:test-other', animations: { onlyFill: { ...byId('glide').preset.animations.rangeSlide, name: 'onlyFill', targets: [{ path: 'Parts.bodyTrackFill.Layout.width', properties: ['size'] }] } } };
  applied(knob, cleanPreset(other));
  assert.ok(knob._children.Animations._children.onlyFill && knob._children.Animations._children.rangeSlide, 'added beside, not in place of');
});

test('a state with a rule keeps it: Overload holds above 90% only, MAX at the top, MIN at the bottom', () => {
  const overload = applied(createControl('Knob'), byId('overload').preset)._children.States._children.Overload;
  assert.equal(overload.rule, 'valueNormalized > 0.9');
  assert.equal(stateMatches(overload, { valueNormalized: 0.95 }), true);
  assert.equal(stateMatches(overload, { valueNormalized: 0.5 }), false);
  const states = applied(createControl('Knob'), byId('max-stamp').preset)._children.States._children;
  assert.equal(stateMatches(states.AtMax, { valueNormalized: 1 }), true);
  assert.equal(stateMatches(states.AtMax, { valueNormalized: 0.9 }), false);
  assert.equal(stateMatches(states.AtMin, { valueNormalized: 0 }), true);
  assert.equal(states.AtMax.patches.parts.labelCurrent['Text.content'], 'MAX');
});

test('the readout presets show the readout and keep it hidden until they show it; Glow adds to the knob\'s own Dragging', () => {
  for (const slug of ['fly-out', 'tip-label', 'readout', 'max-stamp', 'default-stamp']) {
    const knob = applied(createControl('Knob'), byId(slug).preset);
    assert.equal(knob._children.Behavior.showHandleLabels, true, slug);
    assert.equal(knob._children.Parts._children.labelCurrent.opacity, 0, slug);
  }
  // A knob already lights its arc while dragged; Glow keeps that and adds the cap's rim.
  const glow = applied(createControl('Knob'), byId('glow').preset)._children.States._children.Dragging.patches.parts;
  assert.equal(glow.bodyTrackFill['Background.Fill.colour'], '{control.fill.hot}', 'the knob\'s own arc colour is kept');
  assert.equal(glow.bodyCap['Background.Border.enabled'], true);
});

test('a value effect hands back to the value, and nothing loops that does not say it does', () => {
  const loops = new Set(['ripple', 'focus-ring', 'glow', 'modulated', 'shimmer']);
  for (const entry of KNOB_PRESETS) {
    for (const node of Object.values(entry.preset.animations)) {
      if (node.kind === 'value') {
        const last = node.frames.at(-1);
        assert.ok(last.value === undefined && (last.by === undefined || last.by === 0), `${entry.slug}: ends on the value`);
      }
      const infinite = node.iterations === 'infinite';
      assert.equal(infinite, loops.has(entry.slug), `${entry.slug}: ${infinite ? 'loops' : 'plays once'}`);
      // A preset that plays as the panel opens plays once: "all the time" with one run.
      if (node.trigger?.type === 'always' && !loops.has(entry.slug)) assert.equal(node.iterations, 1, entry.slug);
    }
  }
});

test('in the library: a built-in applies linked, the panel carries it, and nobody is offered to adopt it', () => {
  componentWorkspaceMode.set('panel'); panels.set([]); activePanelId.set(null);
  activeEditorTab.set({ type: 'panel', id: null }); selectedComponentIds.set(new Set());
  resetAnimationPresetLibraryForTesting();
  initHistory(); addPanel(createPanel('Knobs')); flushHistory();
  const knob = addControl('Knob')._children.Core.id;
  const label = addControl('Label')._children.Core.id;
  assert.deepEqual(COMPONENT_PRESETS.map((entry) => entry.component), ['Knob']);
  assert.equal(COMPONENT_PRESETS[0].groups.reduce((n, group) => n + group.entries.length, 0), KNOB_PRESETS.length);

  const result = applyAnimationPreset([knob, label], byId('lift').id);
  assert.deepEqual(result.applied.map((entry) => entry.controlId), [knob]);
  assert.equal(result.refused[0].controlId, label);
  assert.deepEqual(get(panelAnimationPresets).map((preset) => preset.id), [byId('lift').id]);
  assert.deepEqual(get(presetsToAdopt), [], 'a built-in is everyone\'s');

  // Update panel reads a built-in as it reads your library: the panel's copy is its version already.
  assert.match(updatePanelPreset(byId('lift').id).reason ?? '', /newest/);
});

test('the showcase: one panel a group and Together, every knob wearing its preset, every preset carried', () => {
  assert.deepEqual(KNOB_PANELS.map(([id]) => id), [...KNOB_PRESET_GROUPS.map((group) => `knob-${group.id}`), 'knob-together']);
  const sets = new Set();
  for (const [id, make] of KNOB_PANELS) {
    const panel = make();
    assert.ok(!sets.has(panel.controlSet), `${id}: a set of its own`);
    sets.add(panel.controlSet);
    if (id === 'knob-together') {
      assert.deepEqual(panel.animationScenes.map((scene) => scene.name), ['Sweep in', 'Wave', 'Follow the leader']);
      continue;
    }
    const group = id.slice('knob-'.length);
    const entries = KNOB_PRESETS.filter((entry) => entry.group === group);
    assert.deepEqual(panel.animationPresets.map((preset) => preset.id).sort(), entries.map((entry) => entry.id).sort(), `${id} carries its presets`);
    const followed = new Set(panel.controls.flatMap((control) => Object.values(control._children.Animations?._children ?? {}).map((node) => presetLink(node)?.id).filter(Boolean)));
    for (const entry of entries) assert.ok(followed.has(entry.id), `${id}: a control wears ${entry.slug}`);
  }
});
