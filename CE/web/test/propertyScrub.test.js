// PropertyScrub — the panel's scrubbar — combines three input methods in one
// row: drag the track, type in the always-live value box, or step with the ▴▾
// buttons / arrow keys. These tests pin the contract's structure: all three
// zones must render together (the track is never the only way in), and the
// value box must be a real text input, not a display span.
//
// Pointer/keyboard behavior of the track lives in scrub/dragScrub.ts and is
// covered by scrubRuntime.test.js; these tests cover the component markup.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import PropertyScrub from '../src/CE_Application/properties/PropertyScrub.svelte';

function renderScrub(props) {
  return render(PropertyScrub, { props }).body;
}

test('renders all three input zones: track, text input, steppers', () => {
  const html = renderScrub({ value: 85, min: 0, max: 100 });

  assert.match(html, /role="slider"/, 'track is an accessible slider');
  assert.match(html, /<input[^>]*class="[^"]*scrub-value/, 'value box is a real <input>');
  assert.match(html, /aria-label="Increment"/, 'has an increment stepper');
  assert.match(html, /aria-label="Decrement"/, 'has a decrement stepper');
});

test('track carries the aria value range', () => {
  const html = renderScrub({ value: 85, min: 0, max: 200, label: 'Sat' });

  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="200"/);
  assert.match(html, /aria-valuenow="85"/);
  assert.match(html, /aria-label="Sat"/);
});

test('value box shows the value and names itself after the label', () => {
  const html = renderScrub({ value: 85, min: 0, max: 100, label: 'Bri' });

  assert.match(html, /<input[^>]*value="85"/);
  assert.match(html, /aria-label="Bri value"/);
});

test('display is faithful to the stored value, not snapped to step', () => {
  const offGrid = renderScrub({ value: 55.4, min: 0, max: 100, step: 1 });
  assert.match(offGrid, /<input[^>]*value="55.4"/, 'typed off-step values keep their precision');

  const frac = renderScrub({ value: 1.25, min: 0.1, max: 5, step: 0.05 });
  assert.match(frac, /<input[^>]*value="1.25"/, 'fractional values render as typed');

  const noisy = renderScrub({ value: 0.30000000000000004, min: 0, max: 1, step: 0.1 });
  assert.match(noisy, /<input[^>]*value="0.3"/, 'float noise is stripped');
});

test('fill and thumb reflect the value position in the range', () => {
  const html = renderScrub({ value: 50, min: 0, max: 200 });

  assert.match(html, /width:25%/, 'fill width is the range fraction');
  assert.match(html, /left:25%/, 'thumb sits at the range fraction');
});

test('label is optional; the row renders without one', () => {
  const html = renderScrub({ value: 10, min: 0, max: 100 });

  assert.doesNotMatch(html, /scrub-label/, 'no label strip when label is empty');
  assert.match(html, /aria-label="Value"/, 'track falls back to a generic name');
});
