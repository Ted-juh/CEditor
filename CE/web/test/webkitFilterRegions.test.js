// webkitFilterRegions.test.js — every SVG filter a CSS `filter: url(#…)` puts on HTML gives its region
// as a fraction of the element's box, never in user-space pixels.
//
// WebKit (WebKitGTK: the Linux app and plug-ins) places a `filterUnits="userSpaceOnUse"` region on an
// HTML element somewhere other than the element, and the element is not drawn at all: on 2026-11-24
// every control a control set gave a shadow — an LCD, a group frame, the Macro, an XY pad, a
// dropdown — was blank on Linux. Chromium, which the browser checks run, draws it either way, so this
// is the only check that can hold it. Filters applied to SVG elements inside an SVG are not affected.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the shadow and material filters, which HTML surfaces use, are sized in fractions of the box', async () => {
  for (const file of ['CE_Panel/components/ShadowFilter.svelte', 'CE_Panel/components/MaterialFilter.svelte']) {
    const source = await read(file);
    const tag = source.match(/<filter\b[^>]*>/)[0];
    assert.doesNotMatch(tag, /userSpaceOnUse/, `${file}: ${tag}`);
  }
  const shadow = (await read('CE_Panel/components/ShadowFilter.svelte')).match(/<filter\b[^>]*>/)[0];
  assert.match(shadow, /x=\{-padding \/ w\} y=\{-padding \/ h\} width=\{1 \+ \(2 \* padding\) \/ w\} height=\{1 \+ \(2 \* padding\) \/ h\}/);
});

test('the surfaces that put a filter on HTML use those two', async () => {
  const surface = await read('CE_Panel/components/EffectSurfaceActive.svelte');
  assert.match(surface, /<ShadowFilter \{id\} \{shadows\} \{width\} \{height\} \/>/);
  assert.match(surface, /<MaterialFilter id=\{materialId\} \{material\} \/>/);
  assert.doesNotMatch(surface, /<filter\b/, 'no filter of its own');
});
