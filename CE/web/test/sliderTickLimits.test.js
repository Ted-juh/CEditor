// sliderTickLimits.test.js — release audit C-94.
//
// The Slider tab's Major and Minor tick counts had a minimum and no maximum, and the tick builder
// looped major × (minor + 1) with no cap. Typing 100,000 froze the editor for about 50 s while it
// drew 400,018 SVG nodes into one Knob; 1,000,000 crashed the renderer — reproduced through the real
// inspector. The fields now carry the limits (NumberCell clamps what is typed to its max), and the
// builder applies them again, because a .cepanel or a script can write the counts directly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildSliderTickStops, clampSliderTickCount, SLIDER_TICK_LIMITS } from '../src/CE_Application/utils/sliderGeometry.js';

test('the tick builder stays bounded whatever the document says', () => {
  const started = Date.now();
  const stops = buildSliderTickStops({ majorTickCount: 1e9, minorTickCount: 1e9 });
  assert.equal(stops.major.length, SLIDER_TICK_LIMITS.majorMax);
  assert.equal(stops.minor.length, (SLIDER_TICK_LIMITS.majorMax - 1) * SLIDER_TICK_LIMITS.minorMax);
  assert.ok(Date.now() - started < 200, 'building the capped stops should be instant');
});

test('ordinary counts are unchanged, including the largest any shipped panel uses', () => {
  for (const [major, minor] of [[2, 0], [11, 3], [25, 1], [129, 16]]) {
    const stops = buildSliderTickStops({ majorTickCount: major, minorTickCount: minor });
    assert.equal(stops.major.length, major);
    assert.equal(stops.minor.length, (major - 1) * minor);
  }
});

test('the limits are applied to values that are not numbers or not whole', () => {
  assert.equal(clampSliderTickCount('major', -5, 11), SLIDER_TICK_LIMITS.majorMin);
  assert.equal(clampSliderTickCount('major', 'abc', 11), 11);
  assert.equal(clampSliderTickCount('minor', 3.6, 3), 4);
  assert.equal(clampSliderTickCount('minor', Infinity, 3), 3);
});

test('both Slider tab fields carry the limits, so a typed value is clamped before it is written', () => {
  const source = readFileSync(new URL('../src/CE_Application/sections/SliderEditor.svelte', import.meta.url), 'utf8');
  const field = (label) => source.split('\n').find((line) => line.includes(`<NumberCell label="${label}"`) && line.includes('TickCount'));
  assert.match(field('Major'), /max=\{SLIDER_TICK_LIMITS\.majorMax\}/);
  assert.match(field('Minor'), /max=\{SLIDER_TICK_LIMITS\.minorMax\}/);
});
