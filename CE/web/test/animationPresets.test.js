// animationPresets.test.js — ready-made animations, each with the change it animates.
//
// A preset that wrote only the animation would play and move nothing: a transition eases a change,
// it does not make one. So each preset is applied here with the real tree writer and then run
// through the real runtime, and the test checks the thing a person would see — the property
// changes, and the animation fires on the change.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ANIMATION_PRESETS, PRESET_BY_ID, presetPatch, presetBlockedBecause } from '../src/CE_Application/utils/animationPresets.js';
import { findClashes, readAnimations, controlStateNames, unknownTriggerStates } from '../src/CE_Application/utils/animationModel.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { createTransitionTracker } from '../src/CE_Application/utils/transitionSelection.js';
import { createKeyframePlayer } from '../src/CE_Application/utils/keyframeAnimation.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

function apply(control, presetId) {
  const { patch, name, reason } = presetPatch(control, presetId);
  assert.ok(patch, `${presetId}: ${reason}`);
  for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value);
  return name;
}

const scaleOf = (control, session) => resolveInteractiveControl(control, session).control._children.Transform.scale ?? 1;

test('the presets', () => {
  assert.deepEqual(ANIMATION_PRESETS.map((p) => p.id), ['hoverLift', 'pressSquish', 'fadeWhenDisabled', 'blinkWhileOn', 'beatPulse', 'valueGlide']);
  for (const preset of ANIMATION_PRESETS) assert.ok(preset.label && preset.summary, preset.id);
});

test('hover lift adds the Hover change as well as the animation, and the animation fires on it', () => {
  const button = createControl('Button');
  const name = apply(button, 'hoverLift');
  assert.equal(name, 'hoverLift');
  assert.equal(scaleOf(button, {}), 1);
  assert.equal(scaleOf(button, { hover: true }), 1.04, 'the state really changes the scale');
  const tracker = createTransitionTracker({ now: () => 0 });
  tracker.next(resolveInteractiveControl(button, {}).runtime);
  const hover = tracker.next(resolveInteractiveControl(button, { hover: true }).runtime);
  assert.deepEqual(hover.fired, ['hoverLift']);
  assert.match(hover.rootTransitions.get('transform'), /^140ms /);
});

test('a merged state shares nothing with the one it replaces', () => {
  const button = createControl('Button');
  const before = button._children.States._children.Pressed;
  const { patch } = presetPatch(button, 'pressSquish');
  const after = patch['States.Pressed'];
  assert.notEqual(after.when, before.when);
  assert.notEqual(after.patches.parts, before.patches.parts);
});

test('a state the control already has keeps everything it had', () => {
  // The panel's old Quick buttons replaced the state, and a button lost its own Pressed colour.
  const button = createControl('Button');
  const before = structuredClone(button._children.States._children.Pressed);
  apply(button, 'pressSquish');
  const after = button._children.States._children.Pressed;
  assert.deepEqual(after.when, before.when);
  assert.equal(after.patches.component['Background.Fill.colour'], before.patches.component['Background.Fill.colour'], 'its colour stays');
  assert.equal(after.patches.component['Transform.scale'], before.patches.component['Transform.scale'],
    'and a scale it already set is the author\'s, not the preset\'s');
  assert.equal(Object.keys(button._children.States._children).filter((k) => k.toLowerCase() === 'pressed').length, 1, 'no second Pressed');
});

test('a control with no such state gets one, named the way triggers find it', () => {
  const custom = createControl('CustomComponent');
  apply(custom, 'hoverLift');
  assert.deepEqual(controlStateNames(custom), ['hover']);
  for (const row of readAnimations(custom)) assert.deepEqual(unknownTriggerStates(row, controlStateNames(custom)), []);
  assert.equal(scaleOf(custom, { hover: true }), 1.04);
});

test('adding a preset twice gives a second name, never a replacement', () => {
  const button = createControl('Button');
  assert.equal(apply(button, 'hoverLift'), 'hoverLift');
  assert.equal(apply(button, 'hoverLift'), 'hoverLift2');
  // Two of the same is a real clash, and the tab says so rather than this file preventing it.
  assert.equal(findClashes(readAnimations(button), []).length, 1);
});

test('the presets on one control do not clash with each other', () => {
  const toggle = createControl('ToggleButton');
  for (const id of ['hoverLift', 'pressSquish', 'fadeWhenDisabled', 'beatPulse']) apply(toggle, id);
  assert.deepEqual(findClashes(readAnimations(toggle), []), []);
});

test('blink while on needs a control that can be checked, and loops while it is', () => {
  assert.match(presetBlockedBecause(createControl('Range'), PRESET_BY_ID.blinkWhileOn), /never checked/);
  const toggle = createControl('ToggleButton');
  toggle._children.Behavior.buttonType = 'toggle';
  apply(toggle, 'blinkWhileOn');
  const player = createKeyframePlayer({ now: () => 0 });
  player.next(resolveInteractiveControl(toggle, { previewSessionOverride: true }).runtime);
  const on = player.next(resolveInteractiveControl(toggle, { checked: true }).runtime);
  assert.deepEqual(on.fired, ['blinkWhileOn']);
  assert.equal(on.parts.get('').length, 1);
});

test('value glide needs a pointer to glide, and glides only a value from outside', () => {
  assert.match(presetBlockedBecause(createControl('Button'), PRESET_BY_ID.valueGlide), /no part called pointerCurrent/);
  const knob = createControl('Knob');
  // A Knob ships pointerSlide, and a second pointer glide would only tie with it.
  assert.match(presetBlockedBecause(knob, PRESET_BY_ID.valueGlide), /already glides its pointer with pointerSlide/);
  delete knob._children.Animations._children.pointerSlide;
  const name = apply(knob, 'valueGlide');
  const node = knob._children.Animations._children[name];
  assert.equal(node.trigger.origin, 'external');
  const tracker = createTransitionTracker({ now: () => 0 });
  tracker.next(resolveInteractiveControl(knob, { valueOverrideEnabled: true, valueOverride: 0.1 }).runtime);
  const midi = tracker.next(resolveInteractiveControl(knob, { valueOverrideEnabled: true, valueOverride: 0.8 }).runtime);
  assert.ok(midi.fired.includes(name));
});

test('a preset that cannot go on a control says why instead of writing anything', () => {
  const label = createControl('Label');
  const result = presetPatch(label, 'hoverLift');
  if (!label._children.Animations) {
    assert.equal(result.patch, null);
    assert.match(result.reason, /no Animations section/);
  }
  assert.equal(presetPatch(createControl('Button'), 'nonsense').patch, null);
});
