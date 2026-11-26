// sliderAnimationPresets.test.js — the Slider's built-in animation presets (utils/sliderPresets.js) and the
// Components showcase that wears them (scripts/componentPanels.js, CE/panels/Components/Slider/).
//
// The promises: every preset is an ordinary preset that survives its own file; each goes on a
// slider in every set the showcase dresses one in, and the ones that belong on a name Label go
// there; Lift and Grip move a fader cap through Layout.lift, never the Layout.scale a slider's own
// states already patch; the readout presets show the readout and hide it at rest; nothing loops that
// does not say so; the library lists them under Slider after the Knob; and the showcase panels are
// those presets on faders, one panel a group, each in a set of its own and none shared with the Knob.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SLIDER_PRESETS, SLIDER_PRESET_GROUPS, sliderPresetId } from '../src/CE_Application/utils/sliderPresets.js';
import { KNOB_PRESETS } from '../src/CE_Application/utils/knobPresets.js';
import { applyPresetPatch, presetDoesNotFit, presetFileText, readPresetFile, presetLink } from '../src/CE_Application/utils/animationPresetModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet, resolveColourLiteral } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { resolveInteractiveControl, targetBuckets } from '../src/CE_Application/utils/interactionRuntime.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { COMPONENT_PRESETS } from '../src/CE_Application/stores/animationPresetLibrary.js';
import { SLIDER_PANELS, KNOB_PANELS } from '../scripts/componentPanels.js';

const byId = (slug) => SLIDER_PRESETS.find((entry) => entry.slug === slug);

/** A fader as the showcase makes one for a preset: vertical, its settings, and the set it is in. */
function faderFor(entry, setId = '') {
  const slider = createControl('Slider');
  Object.assign(slider._children.Behavior, { orientation: 'vertical' }, entry.knob);
  return setId ? resolveControlForSet(slider, getControlSet(setId)) : slider;
}
const applied = (control, preset) => {
  const { patch, reason } = applyPresetPatch(control, preset);
  assert.ok(patch, reason);
  for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value);
  return control;
};

test('the catalogue: seven groups in order, each preset an ordinary preset under Slider, ids of its own', () => {
  assert.deepEqual(SLIDER_PRESET_GROUPS.map((group) => group.id), ['numbers', 'ticks', 'touch', 'moving', 'attention', 'gestures', 'words']);
  for (const group of SLIDER_PRESET_GROUPS) assert.ok(SLIDER_PRESETS.some((entry) => entry.group === group.id), `${group.id} has presets`);
  const ids = SLIDER_PRESETS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'no id twice');
  assert.equal(ids.filter((id) => KNOB_PRESETS.some((knob) => knob.id === id)).length, 0, 'none is a knob\'s');
  for (const entry of SLIDER_PRESETS) {
    assert.equal(entry.id, sliderPresetId(entry.slug));
    assert.match(entry.id, /^ce:slider:[a-z-]+$/);
    assert.equal(entry.preset.category, 'Slider');
    assert.equal(entry.preset.tags[0], entry.groupLabel);
    assert.ok(entry.how && entry.what, `${entry.slug} says what plays it and what it does`);
    assert.deepEqual(readPresetFile(presetFileText(entry.preset)).preset, entry.preset, `${entry.slug} survives its file`);
  }
});

test('every slider preset goes on a fader, and on a fader in its own panel\'s set; the name Label ones on a Label', () => {
  const setOf = Object.fromEntries(SLIDER_PANELS.map(([id, make]) => [id.slice('slider-'.length), make().controlSet]));
  const allSets = [...new Set(Object.values(setOf))];
  for (const entry of SLIDER_PRESETS) {
    if (entry.on === 'label') {
      assert.equal(presetDoesNotFit(entry.preset, createControl('Label')), '', `${entry.slug} fits a Label`);
      continue;
    }
    assert.equal(presetDoesNotFit(entry.preset, faderFor(entry)), '', `${entry.slug} fits the default slider`);
    assert.equal(presetDoesNotFit(entry.preset, faderFor(entry, setOf[entry.group])), '', `${entry.slug} fits a ${setOf[entry.group]} fader`);
    for (const set of allSets) {
      const reason = presetDoesNotFit(entry.preset, faderFor(entry, set));
      assert.ok(reason === '' || /Ticks section/.test(reason), `${entry.slug} on ${set}: ${reason}`);
    }
  }
});

test('Lift and Grip move the cap through Layout.lift, and leave the scale a slider\'s own states patch alone', () => {
  const slider = createControl('Slider');
  const own = slider._children.States._children.Hover.patches.parts.pointerCurrent;
  assert.equal(own['Layout.scale'], 1.06, 'a slider ships a Hover that patches its cap\'s scale, never drawn on a fader');
  const wearing = applied(createControl('Slider'), byId('lift').preset);
  assert.equal(wearing._children.Parts._children.pointerCurrent._children.Layout.lift, 1, 'a lift at rest, which is what the renderer lifts');
  assert.equal(createControl('Slider')._children.Parts._children.pointerCurrent._children.Layout.lift, undefined, 'a slider has none of its own');
  const lifted = wearing._children.States._children.Hover.patches.parts.pointerCurrent;
  assert.equal(lifted['Layout.lift'], 1.12);
  assert.equal(lifted['Layout.scale'], 1.06, 'the shipped patch is kept as it was');
  const gripped = applied(createControl('Slider'), byId('grip').preset)._children.States._children.Pressed.patches.parts.pointerCurrent;
  assert.equal(gripped['Layout.lift'], 0.9);
  // Its transition eases what the state changes: Layout.lift is a transform.
  assert.deepEqual(targetBuckets({ path: 'Parts.pointerCurrent.Layout.lift' }), { part: 'pointerCurrent', buckets: ['transform'] });
  const hovered = resolveInteractiveControl(applied(createControl('Slider'), byId('lift').preset), { hover: true }).control;
  assert.equal(hovered._children.Parts._children.pointerCurrent._children.Layout.lift, 1.12);
});

test('the readout presets show the readout and keep it hidden until they show it', () => {
  for (const slug of ['fly-out', 'cap-label', 'readout', 'max-stamp', 'default-stamp', 'big-number']) {
    const slider = applied(createControl('Slider'), byId(slug).preset);
    assert.equal(slider._children.Behavior.showHandleLabels, true, slug);
    assert.equal(slider._children.Parts._children.labelCurrent.opacity, 0, slug);
  }
  for (const slug of ['odometer', 'units', 'choice-names', 'readout-doors']) {
    const slider = applied(faderFor(byId(slug)), byId(slug).preset);
    assert.equal(slider._children.Behavior.showHandleLabels, true, slug);
    assert.equal(slider._children.Parts._children.labelCurrent.opacity ?? 1, 1, `${slug}: shown at rest`);
  }
});

test('the slider\'s own: Unfold is a fan on a line, Throw a value effect on a flick, the words thrown out from the cap', () => {
  assert.deepEqual(Object.values(byId('unfold').preset.animations).map((node) => [node.effect, node.way]), [['fan', 'in'], ['fan', 'in']]);
  const thrown = byId('throw').preset.animations.throw;
  assert.deepEqual([thrown.kind, thrown.trigger.type, thrown.trigger.event], ['value', 'event', 'flick']);
  assert.deepEqual(thrown.frames.at(-1), { at: 1 }, 'it hands back to the value');
  const stream = byId('number-stream').preset.animations.stream;
  assert.deepEqual([stream.kind, stream.from, stream.direction, stream.trigger.type], ['emit', 'tip', 'pointer', 'valueStep']);
  assert.equal(byId('choice-names').preset.animations.choice.effect, 'roll', 'a fader\'s choices go up and down, and so does the name');
});

test('nothing loops that does not say so, and a value effect hands back to the value', () => {
  const loops = new Set(['ripple', 'focus-ring', 'glow', 'modulated', 'shimmer']);
  for (const entry of SLIDER_PRESETS) {
    for (const node of Object.values(entry.preset.animations)) {
      if (node.kind === 'value') {
        const last = node.frames.at(-1);
        assert.ok(last.value === undefined && (last.by === undefined || last.by === 0), `${entry.slug}: ends on the value`);
      }
      assert.equal(node.iterations === 'infinite', loops.has(entry.slug), `${entry.slug}: ${node.iterations === 'infinite' ? 'loops' : 'plays once'}`);
    }
  }
});

// A fader's readout is drawn beside its cap, on the panel's ground, in the cap's colour
// ({control.cap}). Anodised's is near-black, and on the Gestures panel's dark ground Default stamp
// stamped the value on where nobody could see it. Every readout a showcase fader shows reads there.
const luminance = (argb) => [2, 4, 6].map((at) => parseInt(argb.slice(at, at + 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('every readout a showcase fader shows reads against its panel\'s ground', () => {
  let readouts = 0;
  for (const [id, make] of SLIDER_PANELS) {
    const panel = make();
    const set = getControlSet(panel.controlSet.id);
    for (const control of panel.controls.filter((c) => c._children.Core.controlType === 'Slider' && c._children.Behavior.showHandleLabels === true)) {
      const ink = resolveColourLiteral(control._children.Parts._children.labelCurrent._children.Text._children.Fill.colour, set);
      assert.ok(contrast(ink, panel.bgColour) >= 3, `${id} ${control._children.Core.name}: its readout ${ink} on ${panel.bgColour}`);
      readouts += 1;
    }
  }
  assert.ok(readouts >= 10, `the readout presets are all checked (${readouts})`);
});

test('the library lists them under Slider, after the Knob, by group', () => {
  const slider = COMPONENT_PRESETS.find((entry) => entry.component === 'Slider');
  assert.deepEqual(COMPONENT_PRESETS.map((entry) => entry.component), ['Knob', 'Slider']);
  assert.deepEqual(slider.groups.map((group) => group.label), SLIDER_PRESET_GROUPS.map((group) => group.label));
  assert.equal(slider.groups.reduce((n, group) => n + group.entries.length, 0), SLIDER_PRESETS.length);
});

test('the showcase: one panel a group and Together, every fader wearing its preset, a set of its own and not the Knob\'s', () => {
  assert.deepEqual(SLIDER_PANELS.map(([id]) => id), [...SLIDER_PRESET_GROUPS.map((group) => `slider-${group.id}`), 'slider-together']);
  const knobSets = new Set(KNOB_PANELS.map(([, make]) => make().controlSet.id));
  const sets = new Set();
  for (const [id, make] of SLIDER_PANELS) {
    const panel = make();
    // A panel stores its set as `{ id }`: compared by id, two panels in one set are told apart.
    const set = panel.controlSet.id;
    assert.ok(!sets.has(set) && !knobSets.has(set), `${id}: a set of its own (${set})`);
    sets.add(set);
    if (id === 'slider-together') {
      assert.deepEqual(panel.animationScenes.map((scene) => scene.name), ['Sweep in', 'Wave', 'Follow the leader']);
      continue;
    }
    const entries = SLIDER_PRESETS.filter((entry) => entry.group === id.slice('slider-'.length));
    assert.deepEqual(panel.animationPresets.map((preset) => preset.id).sort(), entries.map((entry) => entry.id).sort(), `${id} carries its presets`);
    const followed = new Set(panel.controls.flatMap((control) => Object.values(control._children.Animations?._children ?? {}).map((node) => presetLink(node)?.id).filter(Boolean)));
    for (const entry of entries) assert.ok(followed.has(entry.id), `${id}: a fader wears ${entry.slug}`);
    for (const control of panel.controls.filter((c) => c._children.Core.controlType === 'Slider')) {
      assert.equal(control._children.Behavior.orientation, 'vertical', `${id}: faders`);
    }
  }
});
