// Segmented — short enums rendered flat. Every option is a radio-role button,
// the current one carries aria-checked and the filled class, so state is
// visible instead of latent behind a dropdown.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import Segmented from '../src/CE_Application/properties/Segmented.svelte';

const OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'shape', label: 'Shape' },
  { value: 'border-inner', label: 'Border Inner' },
];

const html = render(Segmented, {
  props: { options: OPTIONS, value: 'shape', ariaLabel: 'Clipping mode' },
}).body;

test('renders a radiogroup with one radio per option', () => {
  assert.match(html, /role="radiogroup"[^>]*aria-label="Clipping mode"|aria-label="Clipping mode"[^>]*role="radiogroup"/);
  const radios = html.match(/role="radio"/g) ?? [];
  assert.equal(radios.length, 3);
});

test('current option is checked and filled; others are not', () => {
  assert.match(html, /aria-checked="true"[^>]*aria-label="Shape"/, 'Shape is the checked segment');
  const checked = html.match(/aria-checked="true"/g) ?? [];
  assert.equal(checked.length, 1, 'exactly one segment checked');
  assert.match(html, /class="seg[^"]*\bon\b/, 'checked segment gets the filled class');
});

test('labels render as the segment text', () => {
  assert.match(html, />None</);
  assert.match(html, />Border Inner</);
});
