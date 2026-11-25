// sceneModel.test.js — panel scenes: clips on any controls on one time axis, played through the
// engines every control's animations already play through (the Animation Designer, step 5).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cleanScene, cleanClip, cleanTrigger, cleanSceneList, newSceneId } from '../src/CE_Application/utils/sceneFormat.js';
import {
  SCENE_EFFECTS, sceneEffect, effectFromPreset, newScene, newClip, addClip, moveClip, resizeClip, removeClip,
  duplicateClip, setClipEffect, snapTime, tracksOf, controlScenes, ownClipPatch, clipAnimation, sceneControlOutput,
  mergeKeyframeOutputs, targetLabel,
} from '../src/CE_Application/utils/sceneModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { textPieceStyles } from '../src/CE_Application/utils/textEffects.js';

const control = (type, id, name = id) => {
  const c = createControl(type);
  c._children.Core.id = id;
  c._children.Core.name = name;
  return c;
};
const ids = (prefix) => { let n = 0; return { id: `${prefix}_${++n}` }; };

function intro() {
  let scene = newScene('Panel opens', { type: 'panelOpen' }, { id: 'sc_intro' });
  scene = addClip(scene, newClip({ controlId: 'wave', target: 'Text', start: 400, length: 900, effect: sceneEffect('text:typewriter:in').effect }, { id: 'cl_type' }));
  scene = addClip(scene, newClip({ controlId: 'cutoff', target: 'Transform', start: 0, length: 500, effect: sceneEffect('move:fadeIn').effect }, { id: 'cl_fade' }));
  scene = addClip(scene, newClip({ controlId: 'cutoff', target: 'Transform', start: 1200, length: 400, effect: sceneEffect('move:pulse').effect }, { id: 'cl_pulse' }));
  return scene;
}

test('a scene and its clips are read and checked; what does not read is dropped, never half-kept', () => {
  assert.equal(cleanScene({ name: 'x' }), null, 'no id');
  const scene = cleanScene({
    id: 'sc_a', name: '  Intro\u0007 ', trigger: { type: 'nonsense' }, length: -5, loop: 'yes',
    clips: [
      { id: 'c1', controlId: 'k', target: 'Text', start: 100, length: 300, effect: { kind: 'text', effect: 'roll', duration: 200, trigger: { type: 'always' }, preset: { id: 'x' } } },
      { id: 'c2', controlId: 'k', target: 'Background.Fill.colour', effect: { kind: 'keyframes' } },
      { id: 'c3', controlId: 'k', target: 'Transform', effect: { kind: 'transition' } },
      { id: 'c4', controlId: 'k', target: 'Parts.bodyCap', start: 0, length: 5, effect: { kind: 'keyframes', duration: 999 } },
    ],
  });
  assert.equal(scene.name, 'Intro');
  assert.deepEqual(scene.trigger, { type: 'script' });
  assert.equal(scene.loop, false);
  assert.deepEqual(scene.clips.map((clip) => clip.id), ['c1', 'c4']);
  assert.equal(scene.clips[0].effect.duration, 200, 'a text clip keeps each piece\'s duration');
  assert.equal(scene.clips[0].effect.trigger, undefined, 'the clip says when, not its effect');
  assert.equal(scene.clips[0].effect.preset, undefined);
  assert.equal(scene.clips[1].effect.duration, undefined, 'a keyframe clip lasts as long as the clip');
  assert.equal(scene.clips[1].length, 10, 'at least 10 ms');
  assert.ok(scene.length >= 400, 'never shorter than its clips');
  assert.deepEqual(cleanTrigger({ type: 'state', controlId: 'k', to: 'Hover' }), { type: 'state', controlId: 'k', to: 'hover' });
  assert.deepEqual(cleanTrigger({ type: 'beat', every: 400 }), { type: 'beat', every: 64 });
  assert.equal(cleanSceneList([{ id: 'a' }, { id: 'a' }, { id: 'b' }]).length, 2, 'ids unique');
  assert.match(newSceneId('sc'), /^sc_[a-z0-9]{10}$/);
});

test('the library: every text effect in and out, moves and paint, each going where it plays', () => {
  assert.equal(SCENE_EFFECTS.filter((entry) => entry.effect.kind === 'text').length, 18);
  assert.equal(sceneEffect('text:reel:in').category, 'Swap', 'a reel reads as a change of words');
  assert.equal(sceneEffect('text:push:out').category, 'Swap');
  assert.equal(sceneEffect('text:explode:in').category, 'Text');
  assert.equal(sceneEffect('paint:sheen').effect.frames[1].shift, 100);
  // A Pattern effect's place is a pattern of the control's, named when it is placed ('Patterns' alone).
  for (const entry of SCENE_EFFECTS) assert.ok(cleanClip({ id: 'c', controlId: 'k', target: entry.target === 'Patterns' ? 'Patterns.pattern1' : entry.target, effect: entry.effect }), entry.id);
  const mine = effectFromPreset({ animations: { glow: { _type: 'Animation', kind: 'keyframes', duration: 900, trigger: { type: 'always' }, targets: [{ path: 'Parts.cap' }], frames: [{ at: 0, opacity: 1 }] } } });
  assert.equal(mine.length, 900);
  assert.equal(mine.target, 'Parts.cap');
  assert.equal(mine.effect.trigger, undefined);
});

test('clips move, stretch, copy and go, on a grid; tracks group them by control and place', () => {
  let scene = intro();
  scene = moveClip(scene, 'cl_pulse', 1234, 10);
  assert.equal(scene.clips.find((clip) => clip.id === 'cl_pulse').start, 1230);
  scene = resizeClip(scene, 'cl_pulse', 3, 10);
  assert.equal(scene.clips.find((clip) => clip.id === 'cl_pulse').length, 10);
  scene = duplicateClip(scene, 'cl_fade', 2000);
  assert.equal(scene.clips.length, 4);
  assert.ok(scene.length >= 2500, 'the scene grows to hold what is in it');
  scene = removeClip(scene, 'cl_type');
  scene = setClipEffect(scene, 'cl_fade', { easing: 'linear' });
  assert.equal(scene.clips.find((clip) => clip.id === 'cl_fade').effect.easing, 'linear');
  assert.equal(snapTime(-50), 0);

  const controls = [control('Label', 'wave', 'Wave'), control('Knob', 'cutoff', 'Cutoff')];
  const tracks = tracksOf(intro(), controls);
  assert.deepEqual(tracks.map((track) => [track.control, track.label, track.clips.map((clip) => clip.id)]),
    [['Wave', 'Text', ['cl_type']], ['Cutoff', 'Whole control', ['cl_fade', 'cl_pulse']]]);
  assert.equal(targetLabel('Parts.bodyCap'), 'Body › Cap');
  const gone = tracksOf(intro(), [control('Label', 'wave', 'Wave')]);
  assert.ok(gone.find((track) => track.controlId === 'cutoff').missing, 'a clip whose control is gone is shown, not dropped');
});

test('a control\'s own animations are scenes too: one animation, two views', () => {
  const button = control('Button', 'btn', 'Start');
  button._children.Animations._children = {
    blink: { kind: 'keyframes', delay: 200, duration: 900, iterations: 'infinite', trigger: { type: 'always' }, targets: [{ path: 'Transform' }], frames: [{ at: 0, opacity: 1 }] },
    lift: { kind: 'transition', duration: 120 },
  };
  const [own] = controlScenes([button]);
  assert.equal(controlScenes([button]).length, 1, 'a transition has no time of its own to show');
  assert.equal(own.name, 'Start · blink');
  assert.equal(own.loop, true);
  assert.deepEqual([own.clips[0].start, own.clips[0].length, own.clips[0].target], [200, 900, 'Transform']);
  assert.deepEqual(ownClipPatch(own, { ...own.clips[0], start: 300, length: 600 }), { 'Animations.blink.delay': 300, 'Animations.blink.duration': 600 });
});

test('a clip plays as an animation the players read, its start its delay; posed, it is paused there', () => {
  const scene = intro();
  const node = clipAnimation(scene.clips.find((clip) => clip.id === 'cl_pulse'));
  assert.deepEqual([node.kind, node.delay, node.duration, node.iterations, node.targets[0].path], ['keyframes', 1200, 400, 1, 'Transform']);

  const played = sceneControlOutput(scene, 'cutoff');
  assert.equal(played.parts.get('').length, 2);
  assert.match(played.parts.get('')[1], / 400ms cubic-bezier\([^)]*\) 1200ms 1 normal both$/);
  const posed = sceneControlOutput(scene, 'cutoff', { at: 1300 });
  assert.match(posed.parts.get('')[1], / 400ms cubic-bezier\([^)]*\) -100ms 1 normal both paused$/, 'a tenth of a second into the pulse');
  assert.match(posed.rules, /@keyframes ce-kf-/);
  assert.equal(sceneControlOutput(scene, 'nobody'), null);

  const words = sceneControlOutput(scene, 'wave', { at: 500 });
  const [item] = words.texts.get('');
  assert.equal(item.at, 500);
  const styles = textPieceStyles(item.effect, [{ text: 'W', animated: true }, { text: 'a', animated: true }], { phase: 'a', at: item.at });
  assert.match(styles[0], /-100ms 1 normal backwards paused;$/, 'each letter posed at the playhead');
});

test('a scene\'s output joins what the control plays of its own, changing neither', () => {
  const own = { parts: new Map([['', ['own 1s']]]), colours: new Map(), texts: new Map(), rules: '@own', fired: ['x'], key: 'k' };
  const scene = sceneControlOutput(intro(), 'cutoff', { at: 0 });
  const merged = mergeKeyframeOutputs(own, scene);
  assert.equal(merged.parts.get('').length, 3);
  assert.equal(merged.parts.get('')[0], 'own 1s');
  assert.match(merged.rules, /^@own\n@keyframes/);
  assert.deepEqual(merged.fired, ['x']);
  assert.equal(own.parts.get('').length, 1, 'the control\'s own output is not changed');
  assert.equal(mergeKeyframeOutputs(own, null), own);
});

test('the scene format imports nothing, so the saved document can read scenes under plain Node', () => {
  const source = readFileSync(new URL('../src/CE_Application/utils/sceneFormat.js', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(source), false);
});
