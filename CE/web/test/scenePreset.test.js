// scenePreset.test.js — whole scenes kept to use again (utils/scenePreset.js): slots for the controls
// they used, mapped onto another panel's, or one slot repeated over every control that fits.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScenePreset, cleanScenePreset, slotDoesNotFit, candidatesFor, defaultMapping, canRepeat,
  sceneFromPreset, repeatedScene, BUILT_IN_SCENE_PRESETS, SCENE_PRESET_FORMAT,
} from '../src/CE_Application/utils/scenePreset.js';
import { sceneEffect } from '../src/CE_Application/utils/sceneModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

function control(type, id, name, x, y) {
  const made = createControl(type);
  made._children.Core.id = id;
  made._children.Core.name = name;
  Object.assign(made._children.Transform, { x, y });
  return made;
}
const sweep = sceneEffect('value:sweep');
const typewriter = sceneEffect('text:typewriter:in');
const fade = sceneEffect('move:fadeIn');
const clip = (id, controlId, target, start, effect, length = 600) => ({ id, controlId, target, start, length, effect: effect.effect, label: effect.label });

// A panel: two knobs (the second to the left of the first), a label, a button.
const panel = () => [
  control('Knob', 'k1', 'Cutoff', 300, 20), control('Knob', 'k2', 'Res', 100, 20),
  control('Label', 'l1', 'Title', 20, 200), control('Button', 'b1', 'Go', 400, 200),
];

test('a scene kept as a preset names slots, not controls: what each was, and what its clips need', () => {
  const scene = {
    id: 'sc', name: 'Intro', length: 2000, loop: false, trigger: { type: 'event', controlId: 'b1', event: 'click' },
    clips: [clip('a', 'l1', 'Text', 0, typewriter, 900), clip('b', 'k1', 'Value', 300, sweep, 1200), clip('c', 'k1', 'Transform', 0, fade)],
  };
  const preset = buildScenePreset(scene, panel(), { id: 'sp_1' });
  assert.equal(preset.format, SCENE_PRESET_FORMAT);
  assert.equal(preset.name, 'Intro');
  assert.deepEqual(preset.slots.map((slot) => [slot.type, slot.label]), [['Label', 'Title'], ['Knob', 'Cutoff'], ['Button', 'Go']], 'in the order they first play (the scene\'s order at a tie), the trigger\'s last');
  assert.deepEqual(preset.slots[0].needs, { text: true, value: false, parts: [] });
  assert.deepEqual(preset.slots[1].needs, { text: false, value: true, parts: [] });
  assert.deepEqual(preset.trigger, { type: 'event', event: 'click', slot: 2 });
  assert.equal(preset.clips.find((c) => c.target === 'Value').slot, 1);
  assert.ok(!JSON.stringify(preset).includes('"k1"'), 'no control ids left in it');
  assert.equal(buildScenePreset({ ...scene, clips: [] }, panel()), null, 'nothing to keep');
  assert.equal(cleanScenePreset({ ...preset, trigger: { type: 'state', to: 'hover', slot: 9 } }), null, 'a trigger on a slot that is not there');
  assert.equal(cleanScenePreset({ ...preset, format: 'x' }), null);
});

test('a slot fits a control that has what its clips need, whatever its type', () => {
  const [k1, , l1, b1] = panel();
  const value = { type: 'Knob', needs: { value: true, text: false, parts: [] } };
  const words = { type: 'Label', needs: { text: true, value: false, parts: [] } };
  assert.equal(slotDoesNotFit(value, k1), '');
  assert.match(slotDoesNotFit(value, l1), /Title draws no value/);
  assert.equal(slotDoesNotFit(words, l1), '');
  assert.equal(slotDoesNotFit(words, b1), '', 'a button has words too');
  assert.match(slotDoesNotFit({ type: 'Knob', needs: { parts: ['nope'] } }, k1), /has no part nope/);
  assert.deepEqual(candidatesFor(value, panel()).map((c) => c._children.Core.id), ['k2', 'k1'], 'knobs, left to right');
});

test('mapped onto a panel: each slot on a control, same type first, none twice; the trigger follows its slot', () => {
  const scene = { id: 'sc', name: 'Intro', length: 2000, trigger: { type: 'event', controlId: 'b1', event: 'click' },
    clips: [clip('a', 'k1', 'Value', 0, sweep, 1200), clip('b', 'k2', 'Value', 150, sweep, 1200)] };
  const preset = buildScenePreset(scene, panel(), { id: 'sp' });
  const mapping = defaultMapping(preset, panel());
  assert.deepEqual(mapping, ['k2', 'k1', 'b1']);
  const { scene: made } = sceneFromPreset(preset, mapping, panel(), { id: 'new' });
  assert.deepEqual(made.clips.map((c) => [c.controlId, c.start]), [['k2', 0], ['k1', 150]]);
  assert.deepEqual(made.trigger, { type: 'event', controlId: 'b1', event: 'click' });
  assert.match(sceneFromPreset(preset, ['l1', 'k1', 'b1'], panel()).reason, /Title draws no value/);
  assert.match(sceneFromPreset(preset, ['', 'k1', 'b1'], panel()).reason, /Choose a control for Cutoff/);
});

test('one slot, started by nothing on a control: repeated over every control that fits, each a little later', () => {
  const [knobsSweepIn, labelsTypeIn] = BUILT_IN_SCENE_PRESETS;
  assert.equal(knobsSweepIn.name, 'Knobs sweep in');
  assert.equal(canRepeat(knobsSweepIn), true);
  const { scene, controls } = repeatedScene(knobsSweepIn, panel(), { stagger: 150, id: 'r' });
  assert.equal(controls, 2);
  assert.deepEqual(scene.clips.map((c) => [c.controlId, c.target, c.start]), [['k2', 'Value', 0], ['k1', 'Value', 150]], 'left to right, 150 ms apart');
  assert.equal(scene.length, 1350);
  assert.deepEqual(scene.trigger, { type: 'panelOpen' });
  const typed = repeatedScene(labelsTypeIn, panel(), { stagger: 100 });
  assert.deepEqual(typed.scene.clips.map((c) => c.controlId), ['l1', 'b1'], 'everything with words of its own');
  assert.match(repeatedScene(knobsSweepIn, [control('Label', 'x', 'X', 0, 0)]).reason, /wants a knob, a slider, a Macro or a meter/);
  const triggered = buildScenePreset({ id: 's', name: 'Hover', length: 1000, trigger: { type: 'state', controlId: 'k1', to: 'hover' }, clips: [clip('a', 'k1', 'Value', 0, sweep)] }, panel());
  assert.equal(canRepeat(triggered), false, 'a hover on which knob would start them all?');
  assert.match(repeatedScene(triggered, panel()).reason, /Only a preset of one control/);
});
