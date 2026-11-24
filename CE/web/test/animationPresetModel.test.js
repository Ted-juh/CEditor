// animationPresetModel.test.js — a person's animation preset: saved, applied linked, followed, shared.
//
// The Animation Designer's step 4. A preset made from a control's animations has to work on another
// control, so it carries the state changes they ease and the settings a recipe needs, and says what it
// needs. Applied linked, each animation is written whole with a link; overrides are what differs from
// the version it follows, and a new version reaches everything that follows it except those.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRESET_FORMAT,
  buildPreset,
  cleanPreset,
  presetNeeds,
  presetDoesNotFit,
  presetFitsTypes,
  applyPresetPatch,
  presetLink,
  followedAnimation,
  presetOverrides,
  revertOverride,
  clearOverrides,
  detachNode,
  followNewVersion,
  presetWithAnimation,
  followersUpdate,
  presetsInUse,
  presetFileText,
  readPresetFile,
  presetFileName,
  sameValue,
} from '../src/CE_Application/utils/animationPresetModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { nameValueSwapPatch } from '../src/CE_Application/utils/textEffects.js';
import { animationsPatch } from '../src/CE_Application/utils/animationModel.js';

const apply = (control, patch) => { for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value); return control; };

/** A Button whose Hover state scales it and changes its fill, with a hover lift that eases the scale. */
function liftedButton() {
  const button = createControl('Button');
  button._children.Core.id = 'btn';
  button._children.States._children.Hover.patches.component = { 'Transform.scale': 1.06, 'Background.Fill.colour': 'FF3366AA' };
  button._children.Animations._children = {
    lift: {
      _type: 'Animation', name: 'lift', enabled: true, kind: 'transition', duration: 140, delay: 0, easing: 'outCubic',
      trigger: { type: 'stateChange', from: ['*'], to: ['hover'], reverse: true },
      targets: [{ path: 'Transform.scale', properties: ['transform'] }],
    },
    glow: {
      _type: 'Animation', name: 'glow', enabled: true, kind: 'keyframes', duration: 900, delay: 0, easing: 'linear',
      trigger: { type: 'stateChange', to: ['hover'] }, targets: [{ path: 'Transform' }],
      frames: [{ at: 0, opacity: 1, fill: 'FFFFFFFF' }, { at: 1, opacity: 0.8 }],
    },
  };
  return button;
}

const fixedId = { id: 'ap_test0001' };

test('a preset of one animation carries the state change it eases, and only that', () => {
  const { preset } = buildPreset(liftedButton(), 'lift', { ...fixedId, name: 'Soft lift', category: 'Hover', tags: ['scale'] });
  assert.equal(preset.format, PRESET_FORMAT);
  assert.equal(preset.size, 'effect');
  assert.deepEqual(Object.keys(preset.animations), ['lift']);
  assert.equal(preset.animations.lift.preset, undefined, 'no link inside a preset');
  assert.deepEqual(preset.states, { Hover: { when: { hover: true }, patches: { component: { 'Transform.scale': 1.06 }, parts: {} } } },
    'the scale it eases, not the fill colour Hover also sets');
  assert.deepEqual(presetNeeds(preset), { parts: [], sections: ['Animations'], states: ['Hover'] });
});

test('several animations make a recipe; leaving colour to the control takes every colour out', () => {
  const { preset } = buildPreset(liftedButton(), ['lift', 'glow'], { ...fixedId, colours: 'control' });
  assert.equal(preset.size, 'recipe');
  assert.deepEqual(preset.animations.glow.frames, [{ at: 0, opacity: 1 }, { at: 1, opacity: 0.8 }]);
  const kept = buildPreset(liftedButton(), ['lift', 'glow'], fixedId).preset;
  assert.equal(kept.animations.glow.frames[0].fill, 'FFFFFFFF');
  assert.equal(buildPreset(liftedButton(), [], fixedId).preset, null);
});

test('the name/value swap saved from a Label is a recipe that brings the Label setting it needs', () => {
  const label = createControl('Label');
  label._children.Core.attachedTo = 'knob';
  const { patch, names } = nameValueSwapPatch(label, animationsPatch);
  apply(label, patch);
  const { preset } = buildPreset(label, names, { ...fixedId, name: 'Name and value' });
  assert.equal(preset.size, 'recipe');
  assert.deepEqual(preset.fields, { 'Text.shows': 'nameValue' });
  assert.deepEqual(presetNeeds(preset).sections, ['Animations', 'Text']);
  // And it goes on a plain Label, which has no Animations section until it is given one.
  const other = createControl('Label');
  assert.equal(presetDoesNotFit(preset, other), '');
  const applied = applyPresetPatch(other, preset);
  apply(other, applied.patch);
  assert.equal(other._children.Text.shows, 'nameValue');
  assert.equal(Object.keys(other._children.Animations._children).length, 4);
});

test('what a preset needs decides where it goes, and says why not', () => {
  const { preset } = buildPreset(liftedButton(), 'lift', fixedId);
  assert.match(presetDoesNotFit(preset, createControl('Label')), /no states/);
  const knobOnly = cleanPreset({ ...preset, animations: { a: { kind: 'transition', targets: [{ path: 'Parts.pointerCurrent.Layout.x' }] } }, states: {} });
  assert.match(presetDoesNotFit(knobOnly, createControl('Button')), /part this control does not have: pointerCurrent/);
  assert.equal(presetDoesNotFit(knobOnly, createControl('Knob')), '');
  const fits = presetFitsTypes(knobOnly, ['Knob', 'Button', 'Label'], createControl);
  assert.deepEqual(fits, ['Knob']);
});

test('applied linked: each animation whole, with its link, the state merged as the built-ins merge', () => {
  const { preset } = buildPreset(liftedButton(), 'lift', fixedId);
  const target = createControl('Button');
  target._children.States._children.Hover.patches.component = { 'Transform.scale': 1.2, 'Text.Fill.colour': 'FFFF0000' };
  target._children.Animations._children = { lift: { _type: 'Animation', name: 'lift', kind: 'transition', targets: [] } };
  const { patch, names } = applyPresetPatch(target, preset);
  apply(target, patch);
  assert.deepEqual(names, ['lift2'], 'a name the control does not use');
  const node = target._children.Animations._children.lift2;
  assert.deepEqual(presetLink(node), { id: 'ap_test0001', revision: 1, from: 'lift' });
  assert.equal(node.duration, 140);
  assert.deepEqual(target._children.States._children.Hover.patches.component, { 'Transform.scale': 1.2, 'Text.Fill.colour': 'FFFF0000' },
    'the author\'s own scale wins; nothing else of theirs is touched');
  // Unlinked, it is a plain copy.
  const loose = createControl('Button');
  apply(loose, applyPresetPatch(loose, preset, { link: false }).patch);
  assert.equal(presetLink(loose._children.Animations._children.lift), null);
  assert.equal(loose._children.Animations._children.lift.duration, 140);
});

test('overrides are what differs from the version followed; Revert, Clear and Detach', () => {
  const { preset } = buildPreset(liftedButton(), 'lift', fixedId);
  const target = createControl('Button');
  apply(target, applyPresetPatch(target, preset).patch);
  const followed = followedAnimation(target._children.Animations._children.lift, preset);
  assert.ok(followed);
  let node = { ...target._children.Animations._children.lift, duration: 300, easing: 'linear' };
  assert.deepEqual(presetOverrides(node, followed), ['duration', 'easing']);
  node = revertOverride(node, followed, 'easing');
  assert.deepEqual(presetOverrides(node, followed), ['duration']);
  const cleared = clearOverrides(node, followed);
  assert.deepEqual(presetOverrides(cleared, followed), []);
  assert.ok(presetLink(cleared), 'still linked');
  assert.equal(presetLink(detachNode(node)), null);
  assert.equal(detachNode(node).duration, 300, 'detached keeps its settings');
});

test('a new version reaches every follower, except where each overrode it', () => {
  const { preset: v1 } = buildPreset(liftedButton(), 'lift', fixedId);
  const a = createControl('Button'); a._children.Core.id = 'a';
  const b = createControl('Button'); b._children.Core.id = 'b';
  apply(a, applyPresetPatch(a, v1).patch);
  apply(b, applyPresetPatch(b, v1).patch);
  a._children.Animations._children.lift.duration = 500;      // a's override
  const v2 = presetWithAnimation(v1, 'lift', { ...v1.animations.lift, easing: 'outBack', duration: 200 });
  assert.equal(v2.revision, 2);
  const writes = followersUpdate([a, b, createControl('Label')], v1, v2);
  assert.deepEqual(writes.map((write) => write.controlId), ['a', 'b']);
  const [na, nb] = writes.map((write) => write.node);
  assert.equal(na.easing, 'outBack');
  assert.equal(na.duration, 500, 'a keeps its own duration');
  assert.equal(nb.duration, 200);
  assert.equal(presetLink(nb).revision, 2);
  assert.deepEqual([...presetsInUse([a, b])], ['ap_test0001']);
  // followNewVersion directly: a setting the new version drops is dropped where it was not overridden.
  const dropped = followNewVersion({ ...nb, iterations: 2 }, { ...v2.animations.lift, iterations: 2 }, v2.animations.lift, 3);
  assert.equal(dropped.iterations, undefined);
});

test('a .ceanim file round-trips, and anything else is refused with a reason', () => {
  const { preset } = buildPreset(liftedButton(), ['lift', 'glow'], { ...fixedId, name: 'Hover set: lift/glow?' });
  const textValue = presetFileText(preset);
  const back = readPresetFile(textValue);
  assert.ok(back.preset);
  assert.ok(sameValue(back.preset, preset));
  assert.equal(presetFileName(preset), 'Hover set lift glow.ceanim', 'what a file system refuses is taken out');
  assert.match(readPresetFile('not json').error, /not JSON/);
  assert.match(readPresetFile('{"format":"something-else"}').error, /not an animation preset/);
  assert.match(readPresetFile(JSON.stringify({ ...preset, version: 99 })).error, /newer CEditor/);
  assert.match(readPresetFile(JSON.stringify({ ...preset, animations: { x: { kind: 'hologram' } } })).error, /nothing in it/);
  assert.match(readPresetFile('x'.repeat(1024 * 1024 + 1)).error, /too large/);
});

test('reading tidies what a file may hold: names, tags, and only the recipe fields it knows', () => {
  const preset = cleanPreset({
    format: PRESET_FORMAT, version: 1, id: 'ap_x', name: '  Wave\u0007 swell ', tags: ['a', '', 'b'],
    animations: { 'bad name!': { kind: 'keyframes', preset: { id: 'elsewhere' } } },
    states: { 'not a key!': {}, Hover: { when: { hover: true } } },
    fields: { 'Text.shows': 'nameValue', 'Core.id': 'stolen' },
  });
  assert.equal(preset.name, 'Wave  swell');
  assert.deepEqual(preset.tags, ['a', 'b']);
  assert.deepEqual(Object.keys(preset.animations), ['badname']);
  assert.equal(preset.animations.badname.preset, undefined);
  assert.deepEqual(Object.keys(preset.states), ['Hover']);
  assert.deepEqual(preset.fields, { 'Text.shows': 'nameValue' });
  assert.equal(cleanPreset({ format: PRESET_FORMAT, version: 1, id: 'has space', animations: { a: {} } }), null);
});
