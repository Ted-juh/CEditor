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

// A knob runs on the slider's engine and has the same tab, which offered it the linear presets and
// a linear geometry; set to linear, it went on drawing a dial and was dragged as a line.
function knobHtml(patch = {}) {
  const control = createControl('Knob');
  Object.assign(control._children.Behavior, patch);
  return render(SliderEditor, { props: { control } }).body;
}

test('a knob is offered circular only, and its tab and presets are called Knob', () => {
  const html = knobHtml();
  const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Knob Presets/);
  assert.doesNotMatch(text, /Linear Single Bipolar/);
  assert.match(text, /Circular Single Bipolar Range Band/);
  assert.doesNotMatch(html, /<option value="linear"[^>]*>linear<\/option>/, 'no Geometry choice');
  assert.doesNotMatch(html, /knob-back-to-circular/);
  assert.match(knobHtml({ geometry: 'linear' }), /data-testid="knob-back-to-circular"/, 'one set to linear gets a way back');
  const panel = readFileSync(new URL('../src/CE_Application/panels/PropertiesPanel.svelte', import.meta.url), 'utf8');
  assert.match(panel, /tab\.id === 'slider' && getSection\(\$selectedControl, 'Core'\)\?\.controlType === 'Knob' \? \{ \.\.\.tab, label: 'Knob' \} : tab/);
  // A slider keeps both.
  const slider = render(SliderEditor, { props: { control: createControl('Slider') } }).body;
  assert.match(slider, /<option value="linear"[^>]*>linear<\/option>/);
});
