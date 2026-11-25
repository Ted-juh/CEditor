// partPatternClips.test.js — clips on one of a part's patterns (`Parts.<part>.Patterns.<name>`): a
// part's pattern faded or pulsed while the part itself, and the control, stay put.

import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanClip, patternPlace } from '../src/CE_Application/utils/sceneFormat.js';
import { sceneEffect, sceneControlOutput, mergeKeyframeOutputs, targetLabel, patternPlacesOf } from '../src/CE_Application/utils/sceneModel.js';
import { resolvePlace } from '../src/CE_Application/utils/sceneScript.js';
import { buildScenePreset, slotDoesNotFit } from '../src/CE_Application/utils/scenePreset.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { addPatternPatch } from '../src/CE_Application/utils/patternLayers.js';
import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';

/** A pattern added to a background node, in place; its name. */
function patternOn(background) {
  const { name, patch } = addPatternPatch(background, 'Background', { speed: 20 });
  background._children = { ...(background._children ?? {}), Patterns: patch['Background.Patterns'] };
  return name;
}

/** A Label with a part, `key`, that has a pattern; the Label has none of its own. */
function keyWithPattern(id = 'knock') {
  const control = createControl('Label');
  control._children.Core.id = id;
  control._children.Core.name = 'Knock';
  const key = createPartNode('key', { sections: { Background: { _type: 'Background', _children: {} } } });
  control._children.Parts = { _type: 'Parts', _children: { key } };
  return { control, name: patternOn(key._children.Background) };
}
const pulse = sceneEffect('pattern:pulse');

test('a part\'s pattern is a clip place of its own: keyframes only, named by part and pattern', () => {
  assert.deepEqual(patternPlace('Parts.key.Patterns.pattern1'), { part: 'key', name: 'pattern1' });
  assert.deepEqual(patternPlace('Patterns.pattern1'), { part: '', name: 'pattern1' });
  assert.equal(patternPlace('Parts.key'), null);
  assert.equal(patternPlace('Parts.key.Patterns.'), null);
  const clip = { id: 'c', controlId: 'knock', target: 'Parts.key.Patterns.pattern1', start: 0, length: 600, effect: pulse.effect };
  assert.equal(cleanClip(clip)?.target, 'Parts.key.Patterns.pattern1');
  assert.equal(cleanClip({ ...clip, effect: { kind: 'text', effect: 'typewriter', way: 'in' } }), null, 'words do not play on a pattern');
  assert.equal(cleanClip({ ...clip, target: 'Parts.key.Other.pattern1' }), null);
  assert.equal(targetLabel('Parts.key.Patterns.pattern1'), 'key › Pattern › Pattern 1');
});

test('a control offers its own patterns first, then each part\'s; a Pattern effect goes on the first', () => {
  const { control, name } = keyWithPattern();
  assert.deepEqual(patternPlacesOf(control), [`Parts.key.Patterns.${name}`], 'none of its own, so the key\'s');
  const { patch } = addPatternPatch(control._children.Background, 'Background', {});
  control._children.Background._children.Patterns = patch['Background.Patterns'];
  assert.deepEqual(patternPlacesOf(control), ['Patterns.pattern1', `Parts.key.Patterns.${name}`]);
});

test('a part the control\'s own renderer draws is not offered: a button\'s key paints a pattern of its own kind', () => {
  const button = createControl('Button');
  patternOn(button._children.Parts._children.key._children.Background);
  assert.deepEqual(patternPlacesOf(button), []);
  const knob = createControl('Knob');
  patternOn(knob._children.Parts._children.bodyCap._children.Background);
  assert.deepEqual(patternPlacesOf(knob), [], 'nor a knob\'s cap');
});

test('a scene draws a part\'s pattern clip on that part\'s pattern, and nothing on the part or the control', () => {
  const { name } = keyWithPattern();
  const scene = { id: 's', clips: [{ id: 'c', controlId: 'knock', target: `Parts.key.Patterns.${name}`, start: 0, length: 600, effect: pulse.effect }] };
  const out = sceneControlOutput(scene, 'knock', { at: 300 });
  assert.equal(out.parts.size, 0, 'the key itself is left alone');
  assert.equal(out.patterns.size, 0, 'and so are the control\'s own patterns');
  const list = out.partPatterns.get('key')?.get(name);
  assert.equal(list?.length, 1);
  assert.match(list[0], /^ce-kf-\w+-a .* paused/);
  assert.match(out.rules, /@keyframes ce-kf-/);
  const merged = mergeKeyframeOutputs({ parts: new Map(), colours: new Map(), texts: new Map(), patterns: new Map(), rules: '', fired: [], key: '' }, out);
  assert.equal(merged.partPatterns.get('key').get(name).length, 1, 'carried through the merge with the player\'s output');
  const twice = mergeKeyframeOutputs(merged, out);
  assert.equal(twice.partPatterns.get('key').get(name).length, 2, 'two scenes on it, both');
});

test('a script names a part\'s pattern by its path, and a preset asks for the part and its pattern', () => {
  const { control, name } = keyWithPattern();
  assert.equal(resolvePlace(control, ['Parts', 'key', 'Patterns', name]), `Parts.key.Patterns.${name}`);
  assert.equal(resolvePlace(control, ['key', 'Patterns', name]), `Parts.key.Patterns.${name}`);
  assert.equal(resolvePlace(control, ['key', 'Patterns', 'nope']), null);
  assert.equal(resolvePlace(control, ['key']), 'Parts.key', 'a part on its own, as before');
  assert.equal(resolvePlace(control, ['key', 'Text']), null);
  const preset = buildScenePreset({ id: 's', name: 'Knock glow', length: 1000, trigger: { type: 'panelOpen' },
    clips: [{ id: 'c', controlId: 'knock', target: `Parts.key.Patterns.${name}`, start: 0, length: 600, effect: pulse.effect }] }, [control]);
  assert.deepEqual(preset.slots[0].needs.parts, ['key']);
  assert.deepEqual(preset.slots[0].needs.patterns, [`key.${name}`]);
  assert.equal(slotDoesNotFit(preset.slots[0], control), '');
  const bare = keyWithPattern('other').control;
  delete bare._children.Parts._children.key._children.Background._children.Patterns;
  assert.match(slotDoesNotFit(preset.slots[0], bare), /has no pattern key › pattern1/);
});
