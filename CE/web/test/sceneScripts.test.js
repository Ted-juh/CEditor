// sceneScripts.test.js — the scene calls a script makes (step 5c): ce.anim.play(scene), seek,
// effect, swap and pattern, through the script API, against a stand-in for the surface's runtime.
// What the runtime then does is sceneRuntime.test.js's; what is drawn, the browser check's.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get as getStore } from 'svelte/store';
import { setRuntimeHost, scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_WEBVIEW } from '../src/CE_Application/scripting/panelApi.js';
import { registerSceneRun } from '../src/CE_Application/stores/sceneStage.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { addPatternPatch } from '../src/CE_Application/utils/patternLayers.js';

const traced = () => getStore(scriptTrace).map((t) => `${t.kind}:${t.message}`).join('\n');

/** A panel with a Label, a Knob, a Button with a pattern, and two scenes; a runtime that records its calls. */
function withPanel(fn, { live = true } = {}) {
  const title = createControl('Label', { name: 'Title' });
  title._children.Text.content = 'Hello';
  const knob = createControl('Knob', { name: 'Cutoff' });
  const pad = createControl('Button', { name: 'Pad' });
  const { name: pattern, patch } = addPatternPatch(pad._children.Background, 'Background', { speed: 10 });
  pad._children.Background._children.Patterns = patch['Background.Patterns'];
  const panel = {
    id: 'p_scene', name: 'P', width: 400, height: 300, controls: [title, knob, pad],
    animationScenes: [
      { id: 'sc_intro', name: 'Intro', trigger: { type: 'panelOpen' }, length: 1000, loop: false, clips: [] },
      { id: 'sc_cover', name: 'Cover', trigger: { type: 'script' }, length: 2000, loop: false, clips: [] },
    ],
    scripting: { modules: ['ce.core', 'ce.anim'] },
  };
  const calls = [];
  const run = {
    start: (id, options) => { calls.push(['start', id, options]); return true; },
    seek: (id, position) => { calls.push(['seek', id, position]); return true; },
    effect: (key, scene, options) => { calls.push(['effect', key, scene, options]); return true; },
  };
  const writes = [];
  const leave = live ? registerSceneRun('p_scene', run) : () => {};
  setRuntimeHost({ panel, scripts: [], readValue: () => undefined, writeValue: (control, path, value) => { writes.push([control._children.Core.name, path, value]); return true; } });
  clearScriptTrace();
  try { return fn(scriptApiForTesting('', 'scene-script'), { calls, writes, title, knob, pattern }); } finally { setRuntimeHost(null); leave(); }
}

test('the scene calls are declared, panel view only, in ce.anim', () => {
  for (const [id, path] of [['animateSeek', 'ce.anim.seek'], ['animateEffect', 'ce.anim.effect'], ['animateSwap', 'ce.anim.swap'], ['animatePattern', 'ce.anim.pattern']]) {
    assert.ok(MEMBER_BY_ID[id], id);
    assert.equal(memberPath(id), path);
    assert.equal(memberRuntime(MEMBER_BY_ID[id]), RUNTIME_WEBVIEW, id);
  }
});

test('ce.anim.play with one name plays a panel scene; done hears how it ended', () => {
  withPanel((script, { calls }) => {
    const heard = [];
    assert.equal(script.animatePlay('intro', { done: (completed) => heard.push(completed) }), true, 'any case');
    assert.equal(calls[0][0], 'start');
    assert.equal(calls[0][1], 'sc_intro');
    calls[0][2].done(true);
    assert.deepEqual(heard, [true]);
    assert.equal(script.animatePlay('Outro'), false);
    assert.match(traced(), /no scene called "Outro"\. The panel's scenes: Intro, Cover\./);
  });
});

test('with no window, no surface: the scene calls return false and wait for nothing', () => {
  withPanel((script, { calls }) => {
    assert.equal(script.animatePlay('Intro'), false);
    assert.equal(script.animateSeek('Intro', 0.5), false);
    assert.equal(script.animateEffect('Title', 'Pop'), false);
    assert.deepEqual(calls, []);
    assert.equal(traced(), '', 'and it is not an error');
  }, { live: false });
});

test('ce.anim.seek holds a scene at a point; a position that is not a number is refused', () => {
  withPanel((script, { calls }) => {
    assert.equal(script.animateSeek('Cover', 0.25), true);
    assert.deepEqual(calls[0], ['seek', 'sc_cover', 0.25]);
    assert.equal(script.animateSeek('Cover', 'half'), false);
    assert.match(traced(), /ce\.anim\.seek: "half" is not a position/);
  });
});

test('ce.anim.effect plays a library effect on a box, words or a part, one per place', () => {
  withPanel((script, { calls, knob }) => {
    const knobId = knob._children.Core.id;
    assert.equal(script.animateEffect('Cutoff', 'Pop'), true);
    const [, key, scene] = calls[0];
    assert.equal(key, `${knobId}|Transform`);
    assert.equal(scene.clips[0].target, 'Transform');
    assert.equal(scene.clips[0].length, 400, 'the effect\'s own length');
    assert.equal(script.animateEffect('Title', 'typewriter in', { duration: 1200, delay: 100 }), true);
    const [, textKey, typed] = calls[1];
    assert.match(textKey, /\|Text$/, 'a text effect on a control goes on its words');
    assert.deepEqual([typed.clips[0].start, typed.clips[0].length, typed.length], [100, 1200, 1300]);
    const part = Object.keys(knob._children.Parts._children)[0];
    assert.equal(script.animateEffect(`Cutoff.${part}`, 'move:fadeIn'), true);
    assert.equal(calls[2][2].clips[0].target, `Parts.${part}`);
  });
});

test('ce.anim.effect refuses what it cannot play, and says what it can', () => {
  withPanel((script) => {
    assert.equal(script.animateEffect('Title', 'Wobble'), false);
    assert.match(traced(), /no effect or preset called "Wobble"\. The effects: .*Fade in.*Pop/);
    clearScriptTrace();
    assert.equal(script.animateEffect('Cutoff', 'Typewriter in'), false);
    assert.match(traced(), /Cutoff has no words of its own/);
    clearScriptTrace();
    assert.equal(script.animateEffect('Cutoff.nothing', 'Pop'), false);
    assert.match(traced(), /"nothing" is not on Cutoff/);
  });
});

test('ce.anim.swap: the old words leave, then the new ones are written and arrive', () => {
  withPanel((script, { calls, writes }) => {
    const heard = [];
    assert.equal(script.animateSwap('Title', 'Goodbye', 'Roll', { done: (c) => heard.push(c) }), true);
    const [, key, out, outOptions] = calls[0];
    assert.match(key, /\|Text$/);
    assert.deepEqual([out.clips[0].effect.effect, out.clips[0].effect.way], ['roll', 'out']);
    assert.deepEqual(writes, [], 'not before the old words have left');
    outOptions.done(true);
    assert.deepEqual(writes, [['Title', 'Text.content', 'Goodbye']]);
    const [, sameKey, arrive, inOptions] = calls[1];
    assert.equal(sameKey, key);
    assert.deepEqual([arrive.clips[0].effect.effect, arrive.clips[0].effect.way], ['roll', 'in']);
    inOptions.done(true);
    assert.deepEqual(heard, [true]);
  });
});

test('ce.anim.swap cut short writes nothing, and says so to done', () => {
  withPanel((script, { calls, writes }) => {
    const heard = [];
    script.animateSwap('Title', 'Later', undefined, { done: (c) => heard.push(c) });
    assert.equal(calls[0][2].clips[0].effect.effect, 'crossfade', 'no effect named: a crossfade');
    calls[0][3].done(false);
    assert.deepEqual([writes, heard], [[], [false]]);
  });
});

test('ce.anim.pattern changes a pattern while it plays, as set() would', () => {
  withPanel((script, { writes, pattern }) => {
    assert.equal(script.animatePattern('Pad', { speed: 40, direction: 90 }), true);
    assert.deepEqual(writes, [
      ['Pad', `Background.Patterns.${pattern}.speed`, 40],
      ['Pad', `Background.Patterns.${pattern}.direction`, 90],
    ]);
    assert.equal(script.animatePattern('Pad.nope', { speed: 1 }), false);
    assert.match(traced(), /no pattern "nope" on Pad\. Its patterns: /);
    clearScriptTrace();
    assert.equal(script.animatePattern('Title', { speed: 1 }), false);
    assert.match(traced(), /no patterns on Title\. Add one on its Background tab\./);
  });
});
