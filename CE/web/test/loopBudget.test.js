// loopBudget.test.js — what a panel keeps moving, against the owner's budget of ten.
//
// The owner chose ten moving loops a panel (2026-11-24), a gradient loop counting two, said by the
// status bar, the Animation tab's chips and the Export tab, never enforced. These pin what counts, the
// three places that say it, and the Export tab's one setting: moving patterns at 30 frames a second
// in the plug-in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';

import { LOOP_BUDGET, animationLoopWeight, panelLoops, loopLines } from '../src/CE_Application/utils/loopBudget.js';
import { patternFrameCap, frameCapFor } from '../src/CE_Application/stores/patternFrameCap.js';
import { addPatternPatch } from '../src/CE_Application/utils/patternLayers.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';

const keyframes = (extra = {}) => ({ kind: 'keyframes', enabled: true, trigger: { type: 'always' }, frames: [{ at: 0, scale: 1 }], ...extra });

function labelWithPattern(id, fields) {
  const label = createControl('Label');
  label._children.Core.id = id;
  label._children.Core.name = id;
  const { patch } = addPatternPatch(label._children.Background, 'Background', fields);
  for (const [path, value] of Object.entries(patch)) setNestedValue(label, path, value);
  return label;
}

test('what loops, and what it weighs', () => {
  assert.equal(animationLoopWeight(keyframes()), 1, 'an always trigger loops by default');
  assert.equal(animationLoopWeight(keyframes({ trigger: { type: 'stateChange', to: ['hover'] } })), 1, 'so does a state, while it holds');
  assert.equal(animationLoopWeight(keyframes({ trigger: { type: 'valueChange' } })), 0, 'a value change plays once');
  assert.equal(animationLoopWeight(keyframes({ iterations: 3 })), 0);
  assert.equal(animationLoopWeight(keyframes({ frames: [{ at: 0, shift: -100 }, { at: 1, shift: 100 }] })), 2, 'a gradient is repainted every frame');
  assert.equal(animationLoopWeight(keyframes({ enabled: false })), 0);
  assert.equal(animationLoopWeight({ kind: 'text', iterations: 'infinite' }), 1);
  assert.equal(animationLoopWeight({ kind: 'text', iterations: 1 }), 0);
  assert.equal(animationLoopWeight({ kind: 'sequence', loop: true }), 1);
  assert.equal(animationLoopWeight({ kind: 'sequence' }), 0);
  assert.equal(animationLoopWeight({ kind: 'transition' }), 0);
});

test('a panel\'s loops: moving patterns on controls and parts, looping animations, nothing switched off', () => {
  const wave = labelWithPattern('wave', { speed: 30 });
  const still = labelWithPattern('still', { speed: 0 });
  const button = createControl('Button');
  button._children.Core.id = 'btn';
  button._children.Core.name = 'Button';
  button._children.Animations._children = { pulse: keyframes(), sheen: keyframes({ frames: [{ at: 0, shift: 0 }] }), hover: { kind: 'transition' } };
  const quiet = createControl('Button');
  quiet._children.Core.id = 'quiet';
  quiet._children.Animations.enabled = false;
  quiet._children.Animations._children = { pulse: keyframes() };
  const component = createControl('CustomComponent');
  component._children.Core.id = 'cc';
  component._children.Core.name = 'Plate';
  component._children.Parts = { _type: 'Parts', _children: { plate: { _type: 'Part', _children: { Background: { _type: 'Background', _children: {} } } } } };
  const { patch } = addPatternPatch(component._children.Parts._children.plate._children.Background, 'Parts.plate.Background', { speed: 10 });
  for (const [path, value] of Object.entries(patch)) setNestedValue(component, path, value);

  const summary = panelLoops([wave, still, button, quiet, component]);
  assert.equal(summary.count, 5, 'wave 1, pulse 1, sheen 2, the part\'s pattern 1');
  assert.equal(summary.over, false);
  assert.deepEqual(loopLines(summary.items), ['wave › Pattern 1', 'Button › pulse', 'Button › sheen (counts 2)', 'Plate › plate › Pattern 1']);
  assert.equal(summary.items.find((item) => item.animation === 'sheen').controlId, 'btn');
});

test('over the budget is more than ten, weighted', () => {
  assert.equal(LOOP_BUDGET, 10);
  const many = (n) => Array.from({ length: n }, (_, i) => labelWithPattern(`l${i}`, { speed: 20 }));
  assert.equal(panelLoops(many(10)).over, false, 'ten is within it');
  assert.equal(panelLoops(many(11)).over, true);
  const button = createControl('Button');
  button._children.Animations._children = { sheen: keyframes({ frames: [{ at: 0, turn: 0 }] }) };
  assert.equal(panelLoops([...many(9), button]).over, true, 'nine patterns and a gradient loop are eleven');
});

test('the Export tab\'s switch steps moving patterns 30 times a second in the plug-in, and only there', () => {
  assert.equal(frameCapFor({ patternFps: 30 }), 30);
  assert.equal(frameCapFor({}), 0);
  assert.equal(frameCapFor({ patternFps: 'lots' }), 0);
  const wave = labelWithPattern('wave', { speed: 32 });
  const drawn = () => render(CanvasControl, { props: { control: wave, scale: 1, editorInteractionEnabled: false } }).body;
  assert.match(drawn(), /animation-timing-function:linear/);
  patternFrameCap.set(30);
  try {
    assert.match(drawn(), /animation-timing-function:steps\(60, jump-end\)/, 'a two-second loop in sixty steps');
  } finally {
    patternFrameCap.set(0);
  }
  const player = readFileSync(new URL('../src/Player.svelte', import.meta.url), 'utf8');
  assert.match(player, /patternFrameCap\.set\(frameCapFor\(next\.exportSettings\)\)/, 'the player sets it from the panel it loads');
});

test('the three places say it: the status bar, the Animation tab\'s chip, the Export tab\'s note', () => {
  const read = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
  const status = read('layout/StatusBar.svelte');
  assert.match(status, /\{#if panel && \$panelLoopSummary\.count > 0\}/);
  assert.match(status, /class:status-warn=\{\$panelLoopSummary\.over\}/);
  assert.match(status, /onclick=\{showNextLoop\}/);
  const tab = read('components/AnimationTab.svelte');
  assert.match(tab, /\{#if \$panelLoopSummary\.over\}[\s\S]*?Panel: \{\$panelLoopSummary\.count\} loops/);
  const exportTab = read('panels/PanelCardContent.svelte');
  assert.match(exportTab, /The plug-in still builds\./);
  assert.match(exportTab, /setExportSetting\('patternFps'/);
});

test('a looping scene counts each of its clips; one that plays once counts nothing', () => {
  const knob = { _type: 'Knob', _children: { Core: { id: 'cutoff', name: 'Cutoff' } } };
  const clip = (id, effect, label = '') => ({ id, controlId: 'cutoff', target: 'Transform', start: 0, length: 400, effect, ...(label ? { label } : {}) });
  const fade = { kind: 'keyframes', frames: [{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }] };
  const sheen = { kind: 'keyframes', frames: [{ at: 0, turn: 0 }, { at: 1, turn: 360 }] };
  const scenes = [
    { id: 'sc1', name: 'Glow', trigger: { type: 'panelOpen' }, loop: true, length: 800, clips: [clip('a', fade, 'Fade in'), clip('b', sheen)] },
    { id: 'sc2', name: 'Intro', trigger: { type: 'panelOpen' }, loop: false, length: 800, clips: [clip('c', fade)] },
  ];
  const summary = panelLoops([knob], undefined, { scenes });
  assert.equal(summary.count, 3, 'a fade 1, a turning gradient 2; the scene that plays once nothing');
  assert.deepEqual(loopLines(summary.items), ['Cutoff › scene Glow › Fade in', 'Cutoff › scene Glow › Transform (counts 2)']);
  assert.equal(summary.items[0].kind, 'scene');
  assert.equal(panelLoops([knob]).count, 0, 'and no scenes, no change');
});
