// SwatchCluster — a control's colours as one row of captioned mini-swatches.
// Clicking targets the display panel's Colors tab (the dock does the picking,
// per the house colour rule); the live swatch wears the ring. These tests pin
// the markup contract and the live-target matching.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import { colorTarget } from '../src/CE_Application/stores/colorTarget.js';
import SwatchCluster from '../src/CE_Application/properties/SwatchCluster.svelte';

const SWATCHES = [
  { key: 'pad', label: 'Pads', value: 'FF171720', target: { type: 'control', controlId: 'c1', path: 'ChordPad.padColour' } },
  { key: 'tonic', label: 'Tonic', value: 'F2C94C', target: { type: 'control', controlId: 'c1', path: 'ChordPad.tonicColour' } },
];

test('renders one captioned swatch per colour', () => {
  colorTarget.set(null);
  const html = render(SwatchCluster, { props: { swatches: SWATCHES } }).body;

  assert.match(html, /aria-label="Pads colour"/);
  assert.match(html, /aria-label="Tonic colour"/);
  assert.match(html, />Pads</, 'caption text renders');
  assert.match(html, /background:#171720/, 'AARRGGBB renders its RGB tail');
  assert.match(html, /background:#F2C94C/, 'bare RRGGBB renders as-is');
});

test('no swatch is live when no colour target is armed', () => {
  colorTarget.set(null);
  const html = render(SwatchCluster, { props: { swatches: SWATCHES } }).body;
  assert.doesNotMatch(html, /class="[^"]*\blive\b/);
});

test('the swatch matching the armed colour target wears the ring', () => {
  colorTarget.set({ type: 'control', controlId: 'c1', path: 'ChordPad.tonicColour' });
  const html = render(SwatchCluster, { props: { swatches: SWATCHES } }).body;

  const tonicTag = html.match(/<button[^>]*aria-label="Tonic colour"[^>]*>/)?.[0] ?? '';
  assert.match(tonicTag, /\blive\b/, 'tonic is ringed');
  const live = html.match(/\blive\b/g) ?? [];
  assert.equal(live.length, 1, 'exactly one live swatch');
  colorTarget.set(null);
});
