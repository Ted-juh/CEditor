// patternClips.test.js — clips on a control's pattern (the Animation Designer's Pattern effects): a
// pattern faded, lifted or pulsed for the length of a clip, its own scroll going on underneath.

import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanClip } from '../src/CE_Application/utils/sceneFormat.js';
import { SCENE_EFFECTS, sceneEffect, sceneControlOutput, mergeKeyframeOutputs, targetLabel, patternPlacesOf } from '../src/CE_Application/utils/sceneModel.js';
import { resolvePlace } from '../src/CE_Application/utils/sceneScript.js';
import { buildScenePreset, slotDoesNotFit } from '../src/CE_Application/utils/scenePreset.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { addPatternPatch } from '../src/CE_Application/utils/patternLayers.js';

function withPattern(type = 'Button', id = 'pad') {
  const control = createControl(type);
  control._children.Core.id = id;
  control._children.Core.name = 'Pad';
  const { name, patch } = addPatternPatch(control._children.Background, 'Background', { speed: 20 });
  control._children.Background._children.Patterns = patch['Background.Patterns'];
  return { control, name };
}
const fadeIn = sceneEffect('pattern:fadeIn');

test('a clip may play on one of a control\'s patterns: keyframes only, named by the pattern', () => {
  const clip = { id: 'c', controlId: 'pad', target: 'Patterns.pattern1', start: 0, length: 600, effect: fadeIn.effect };
  assert.ok(cleanClip(clip));
  assert.equal(cleanClip({ ...clip, target: 'Patterns.' }), null);
  assert.equal(cleanClip({ ...clip, effect: { kind: 'text', effect: 'typewriter', way: 'in' } }), null, 'words do not play on a pattern');
  assert.equal(cleanClip({ ...clip, effect: sceneEffect('value:sweep').effect }), null);
  assert.equal(targetLabel('Patterns.pattern1'), 'Pattern › Pattern 1');
});

test('the library has Pattern effects, which go on the control\'s first pattern when dropped on it', () => {
  const patterns = SCENE_EFFECTS.filter((entry) => entry.category === 'Pattern');
  assert.ok(patterns.length >= 4, patterns.map((entry) => entry.label).join(', '));
  assert.ok(patterns.every((entry) => entry.target === 'Patterns' && entry.effect.kind === 'keyframes'));
  const { control, name } = withPattern();
  assert.deepEqual(patternPlacesOf(control), [`Patterns.${name}`]);
  assert.deepEqual(patternPlacesOf(createControl('Knob')), []);
});

test('a scene draws a pattern clip on that pattern, and nothing on the control itself', () => {
  const { name } = withPattern();
  const scene = { id: 's', clips: [{ id: 'c', controlId: 'pad', target: `Patterns.${name}`, start: 100, length: 600, effect: fadeIn.effect }] };
  const out = sceneControlOutput(scene, 'pad', { at: 400 });
  assert.equal(out.parts.size, 0, 'the control and its parts are left alone');
  const list = out.patterns.get(name);
  assert.equal(list.length, 1);
  assert.match(list[0], /^ce-kf-/);
  assert.match(list[0], /paused/);
  assert.match(out.rules, /@keyframes ce-kf-/);
  const merged = mergeKeyframeOutputs({ parts: new Map(), colours: new Map(), texts: new Map(), patterns: new Map([[name, ['x']]]), rules: '', fired: [], key: '' }, out);
  assert.equal(merged.patterns.get(name).length, 2, 'its own and the scene\'s');
});

test('a script names a pattern by its path, and a scene preset asks for the pattern its clip plays on', () => {
  const { control, name } = withPattern();
  assert.equal(resolvePlace(control, ['Patterns', name]), `Patterns.${name}`);
  assert.equal(resolvePlace(control, ['Patterns', 'nope']), null);
  const preset = buildScenePreset({ id: 's', name: 'Glow', length: 1000, trigger: { type: 'panelOpen' },
    clips: [{ id: 'c', controlId: 'pad', target: `Patterns.${name}`, start: 0, length: 600, effect: fadeIn.effect }] }, [control]);
  assert.deepEqual(preset.slots[0].needs.patterns, [name]);
  assert.equal(slotDoesNotFit(preset.slots[0], control), '');
  assert.match(slotDoesNotFit(preset.slots[0], createControl('Button')), /has no pattern/);
});
