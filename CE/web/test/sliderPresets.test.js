// Slider › Slider Presets. Each preset wrote its own width and height, so going from Single to
// Bipolar on the same slider resized it, and no button said which preset the slider was set as.
// Now a preset keeps the slider's size, only a change between linear and circular takes the
// preset's, and the button matching the slider's geometry, value mode and polarity is shown chosen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import SliderEditor from '../src/CE_Application/sections/SliderEditor.svelte';

function chosen(patch = {}) {
  const control = createControl('Slider');
  Object.assign(control._children.Behavior, patch);
  const html = render(SliderEditor, { props: { control } }).body;
  return [...html.matchAll(/<button class="preset-btn[^"]*"[^>]*aria-pressed="true"[^>]*>([^<]+)<\/button>/g)].map((match) => match[1]);
}

test('the preset the slider is set as shows as chosen, and only that one', () => {
  assert.deepEqual(chosen({ geometry: 'linear', valueMode: 'single', min: 0, max: 1, fillOrigin: 'min' }), ['Single']);
  assert.deepEqual(chosen({ geometry: 'linear', valueMode: 'single', min: -1, max: 1, fillOrigin: 'center' }), ['Bipolar']);
  assert.deepEqual(chosen({ geometry: 'circular', valueMode: 'range', min: 0, max: 1, fillOrigin: 'min' }), ['Range']);
  assert.deepEqual(chosen({ geometry: 'circular', valueMode: 'band', min: 0, max: 1 }), ['Band']);
});

test('a preset keeps the size; only linear to circular, or back, resizes', () => {
  const source = readFileSync(new URL('../src/CE_Application/sections/SliderEditor.svelte', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function applyPreset'), source.indexOf('setPatch(basePatch);'));
  assert.match(body, /if \(preset\.geometry !== geometry\) \{\s*basePatch\['Transform\.width'\] = preset\.width;\s*basePatch\['Transform\.height'\] = preset\.height;\s*\}/);
  assert.equal((body.match(/'Transform\.width'/g) ?? []).length, 1, 'no unconditional size in the patch');
});
