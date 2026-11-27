// showcaseCollections.test.js — Mechanisms, the Gallery, the Animated Synths and the Components'
// Knob (scripts/mechanismsPanels.js, galleryPanels.js, synthPanels.js and componentPanels.js, written
// by export-showcases.mjs): the committed files are what the scripts write; each panel opens with
// every clip of every scene on a control it has, and the presets it carries (what the synths bind and
// show is synthPanels.test.js's, what the knobs wear knobPresets.test.js's); and what each
// mechanism shows is what it says: gears at their teeth ratios on a knob's value, reels on the beat,
// a domino run whose script answers every marker, and a clock whose script holds each hand at the time.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { COLLECTIONS, collectionDir, collectionFile, collectionPanel } from '../scripts/showcaseCollections.js';
import { DOMINO_SCRIPT, CLOCK_SCRIPT } from '../scripts/mechanismsPanels.js';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { cleanScene } from '../src/CE_Application/utils/sceneFormat.js';

const NEW = ['mechanisms', 'gallery', 'synths', 'knob', 'slider', 'button'];
const named = (panel, name) => panel.controls.find((control) => control._children.Core.name === name);

test('the committed panels are what the scripts write: run export-showcases.mjs after changing one', () => {
  for (const key of NEW) {
    const names = COLLECTIONS[key].list.map(([id]) => collectionPanel(key, id).name);
    assert.deepEqual(readdirSync(collectionDir(key)).filter((f) => f.endsWith('.cepanel')).sort(), names.map((name) => `${name}.cepanel`).sort(), key);
    for (const [id] of COLLECTIONS[key].list) {
      const { path, text } = collectionFile(key, id);
      assert.equal(readFileSync(path, 'utf8'), text, `${path} is stale`);
    }
  }
});

test('each opens as a panel, every clip of every scene on a control it has and inside its scene, its markers and scripts kept', () => {
  for (const key of NEW) {
    for (const [id] of COLLECTIONS[key].list) {
      const { path } = collectionFile(key, id);
      const panel = deserializePanel(readFileSync(path, 'utf8'), path, null);
      assert.ok(panel, `${id} opens`);
      const authored = collectionPanel(key, id);
      assert.equal((panel.animationScenes ?? []).length, authored.animationScenes.length, id);
      // The presets it wears (the Components showcase) come back with it, as it carries them.
      assert.deepEqual((panel.animationPresets ?? []).map((preset) => preset.id), (authored.animationPresets ?? []).map((preset) => preset.id), `${id}: presets kept`);
      const ids = new Set(panel.controls.map((control) => control._children.Core.id));
      (panel.animationScenes ?? []).forEach((scene, i) => {
        assert.equal(cleanScene(scene).clips.length, authored.animationScenes[i].clips.length, `${id}: no clip dropped`);
        assert.deepEqual((scene.markers ?? []).map((m) => m.action), (authored.animationScenes[i].markers ?? []).map((m) => m.action), `${id}: markers kept`);
        for (const clip of scene.clips) {
          assert.ok(ids.has(clip.controlId), `${id}: ${clip.id} plays on a control the panel has`);
          assert.ok(clip.start + clip.length <= scene.length + 1, `${id}: ${clip.id} ends inside its scene`);
        }
      });
      assert.deepEqual((panel.scripts ?? []).map((s) => s.source), (authored.scripts ?? []).map((s) => s.source), `${id}: scripts kept`);
    }
  }
});

test('the gear train turns on the Drive knob\'s value, each gear the other way at its teeth ratio', () => {
  const panel = collectionPanel('mechanisms', 'geartrain');
  const train = panel.animationScenes.find((scene) => scene.clock);
  assert.deepEqual([train.clock.source, train.clock.controlId], ['value', named(panel, 'Drive')._children.Core.id]);
  const teeth = (i) => Number(named(panel, `Teeth${i}`)._children.Text.content);
  const turn = (i) => train.clips.find((clip) => clip.controlId === named(panel, `Gear${i}`)._children.Core.id).effect.frames.at(-1).rotate;
  for (let i = 2; i <= 5; i += 1) {
    assert.ok(Math.sign(turn(i)) === -Math.sign(turn(i - 1)), `gear ${i} turns the other way from gear ${i - 1}`);
    assert.ok(Math.abs(Math.abs(turn(i)) * teeth(i) - Math.abs(turn(i - 1)) * teeth(i - 1)) < 1, `gear ${i}: as many teeth pass as on gear ${i - 1}`);
  }
});

test('the tape machine turns its reels a third of a turn a beat, which a three-spoked reel joins up', () => {
  const panel = collectionPanel('mechanisms', 'tapemachine');
  const beat = panel.animationScenes.find((scene) => scene.trigger.type === 'beat');
  assert.deepEqual([beat.trigger.every, beat.loop], [1, false]);
  for (const name of ['ReelL', 'ReelR']) {
    const clip = beat.clips.find((c) => c.controlId === named(panel, name)._children.Core.id);
    assert.equal(Math.abs(clip.effect.frames.at(-1).rotate), 120, name);
  }
});

/** A stand-in for the script API: the calls a script makes, and the actions it defines. */
function runScript(source, globals = {}) {
  const calls = [];
  const actions = new Map();
  const api = {
    defineAction: (name, fn) => actions.set(name, fn),
    animatePlay: (scene) => { calls.push(['play', scene]); return true; },
    animateSeek: (scene, at) => { calls.push(['seek', scene, at]); return true; },
    after: (ms, fn) => { calls.push(['after', ms, typeof fn]); return 'timer'; },
    ...globals,
  };
  new Function(...Object.keys(api), source)(...Object.values(api));
  return { calls, actions };
}

test('the domino run\'s script answers every marker, each action starting a scene the panel has', () => {
  const panel = collectionPanel('mechanisms', 'dominorun');
  assert.equal(panel.scripts[0].source, DOMINO_SCRIPT);
  const { calls, actions } = runScript(DOMINO_SCRIPT);
  assert.deepEqual(calls.splice(0), [['play', 'Dominoes']], 'it starts a run as it starts, so scripts enabled after the panel opened still run it');
  const sceneNames = new Set(panel.animationScenes.map((scene) => scene.name));
  const markers = panel.animationScenes.flatMap((scene) => (scene.markers ?? []).map((marker) => [scene.name, marker.action]));
  assert.deepEqual(markers, [['Dominoes', 'roll'], ['Ball', 'ring'], ['Bell', 'again']], 'each scene ends on a marker');
  for (const [, action] of markers) {
    assert.ok(actions.has(action), `the script defines ${action}`);
    actions.get(action)();
  }
  assert.deepEqual(calls.map(([, scene]) => scene), ['Ball', 'Bell', 'Dominoes'], 'round and round');
  for (const [, scene] of calls) assert.ok(sceneNames.has(scene), `${scene} is a scene of the panel`);
});

test('the clock\'s script holds each hand\'s scene at the time, and comes back in a second', () => {
  const panel = collectionPanel('mechanisms', 'clockwork');
  assert.equal(panel.scripts[0].source, CLOCK_SCRIPT);
  class TenFifteen { getSeconds() { return 30; } getMinutes() { return 15; } getHours() { return 22; } }
  const { calls } = runScript(CLOCK_SCRIPT, { Date: TenFifteen });
  const seek = Object.fromEntries(calls.filter(([kind]) => kind === 'seek').map(([, scene, at]) => [scene, at]));
  assert.equal(seek.Seconds, 0.5);
  assert.ok(Math.abs(seek.Minutes - 15.5 / 60) < 1e-9);
  assert.ok(Math.abs(seek.Hours - (10 + 15.5 / 60) / 12) < 1e-9, 'ten past the hour on a twelve-hour face');
  assert.deepEqual(calls.find(([kind]) => kind === 'after'), ['after', 1000, 'function']);
  for (const scene of ['Seconds', 'Minutes', 'Hours']) assert.ok(panel.animationScenes.some((s) => s.name === scene && s.trigger.type === 'script'), `${scene} is played by nothing but the script`);
});

test('the Gallery\'s pattern clips each move a pattern their control has', () => {
  for (const id of ['opart', 'pointillism']) {
    const panel = collectionPanel('gallery', id);
    const clips = panel.animationScenes[0].clips.filter((clip) => clip.target.startsWith('Patterns.'));
    assert.ok(clips.length >= 2, id);
    for (const clip of clips) {
      const control = panel.controls.find((c) => c._children.Core.id === clip.controlId);
      const name = clip.target.slice('Patterns.'.length);
      assert.ok(control._children.Background._children.Patterns._children[name], `${id}: ${clip.target} is a pattern of its control`);
    }
  }
});
