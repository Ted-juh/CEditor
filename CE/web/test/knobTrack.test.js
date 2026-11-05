// knobTrack.test.js — one place works out the circle a knob is drawn round (utils/knobTrack.js), and
// the renderer, Preview's and the Test Bench's hit tests, the labels riding the handles and Create
// Component from Selection's layers all ask it. Preview's hit test used to work it out from the
// control as authored, without its set's look; the riding labels from a circle without the tight
// fit, which on a Lever Dial knob put them inside its track.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { OFFERED_CONTROL_SETS, getControlSet, isIllustratedControlSet } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { knobLayers } from '../src/CE_Application/utils/valueControlLayers.js';
import { knobHandleSize, knobTrackOf } from '../src/CE_Application/utils/knobTrack.js';
import { buildSliderHandleLabelAnchors } from '../src/CE_Application/utils/sliderGeometry.js';

const source = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
const W = 120;
const H = 140;
const unique = () => {
  const taken = new Set();
  return (wanted) => { let name = wanted; let i = 2; while (taken.has(name)) name = `${wanted}${i++}`; taken.add(name); return name; };
};
const rangeKnob = (setId) => resolveControlForSet(createControl('Knob', { Behavior: { valueMode: 'range' } }), getControlSet(setId));

test('a range knob\'s handles sit on the circle knobTrack gives, on every set the editor offers', () => {
  let checked = 0;
  for (const set of OFFERED_CONTROL_SETS.filter((each) => !isIllustratedControlSet(each))) {
    const knob = rangeKnob(set.id);
    if (knob._children.Core.controlForm) continue;
    const track = knobTrackOf(knob, W, H);
    // The layers draw the start handle at the top of the circle, turned to the value by a binding.
    const layers = knobLayers({ resolved: knob, rect: { x: 0, y: 0, width: W, height: H }, channel: 'v', prefix: 'k', zIndex: 0, uniqueName: unique() });
    const dot = layers.parts.find((part) => part.name === 'k_start')._children.Layout;
    const drawn = Math.hypot(dot.x + dot.width / 2 - track.centerX, dot.y + dot.height / 2 - track.centerY);
    assert.ok(Math.abs(drawn - track.radius) < 0.5, `${set.id}: drawn ${drawn}, track ${track.radius}`);
    checked += 1;
  }
  assert.ok(checked >= 60, `${checked} sets`);
});

test('the circle is the drawn one: the set\'s tight fit and pointers, not the knob as authored', () => {
  const authored = createControl('Knob', { Behavior: { valueMode: 'range' } });
  const drawn = rangeKnob('lever-dial');
  assert.equal(drawn._children.Behavior.circularFit, 'tight', 'Lever Dial fits its knobs tight');
  const fromDrawn = knobTrackOf(drawn, W, H);
  assert.equal(fromDrawn.tight, true);
  assert.notEqual(knobTrackOf(authored, W, H).radius, fromDrawn.radius, 'the authored knob is not the drawn one');
  assert.equal(knobHandleSize(fromDrawn, 'start'), fromDrawn.pointerStartSize);
  assert.equal(knobHandleSize(fromDrawn, 'end'), fromDrawn.pointerEndSize);
  assert.equal(knobHandleSize(fromDrawn), fromDrawn.pointerCurrentSize);
});

test('the labels riding a knob\'s handles hang 22 px out from the circle it is drawn round', () => {
  const knob = rangeKnob('lever-dial');
  const behavior = { ...knob._children.Behavior, showHandleLabels: true };
  const track = knobTrackOf(knob, W, H);
  // Round a circle of their own, without the tight fit, they hung inside the track, over the knob.
  const own = buildSliderHandleLabelAnchors(behavior, W, H, { start: 0.2, end: 0.8 }, { trackThickness: track.trackThickness, pointerSize: track.maxPointerSize });
  assert.ok(Math.hypot(own.start.x - track.centerX, own.start.y - track.centerY) < track.radius, 'without the circle: inside the track');
  const anchors = buildSliderHandleLabelAnchors(behavior, W, H, { start: 0.2, current: 0.5, end: 0.8 }, { circle: track });
  for (const role of ['start', 'end']) {
    const reach = Math.hypot(anchors[role].x - track.centerX, anchors[role].y - track.centerY);
    assert.ok(Math.abs(reach - (track.radius + 22)) < 1e-9, `${role}: ${reach}`);
  }
});

test('the renderer, the layers, Preview and the Test Bench all ask knobTrack, the hit tests with the drawn control', () => {
  assert.match(source('editor/SliderFamilyRenderer.svelte'), /let track = \$derived\(knobTrack\(\{ behavior, parts: parts\?\._children \}, width, height\)\)/);
  assert.match(source('utils/valueControlLayers.js'), /const track = knobTrack\(\{ behavior, parts: geometryParts \}, width, height\)/);
  const preview = source('editor/PanelPreviewSurface.svelte');
  assert.match(preview, /const drawn = resolvedPreviewFor\(control\)\?\.control \?\? control;[\s\S]*?knobTrackOf\(drawn, width, height\)/);
  const bench = source('components/InteractiveTestSurface.svelte');
  assert.match(bench, /const drawn = resolvedControl \?\? control;[\s\S]*?knobTrackOf\(drawn, controlWidth, controlHeight\)/);
  for (const [name, text] of [['Preview', preview], ['Test Bench', bench]]) {
    assert.doesNotMatch(text, /resolveCircularTrackMetrics/, `${name} works out no circle of its own`);
  }
});
