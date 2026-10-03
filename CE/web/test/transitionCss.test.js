// transitionCss.test.js — one CSS declaration per bucket, for every renderer.
//
// There used to be three writers and they disagreed: the part renderer listed properties, the
// slider renderer wrote `transition: all <one timing>` (so colour moved on sliders and nowhere
// else), and the control's root wrote transform and opacity only. These pin the one writer that
// replaced them, and the two things it found on the way: a part is placed with left/top, so moving
// one never animated; and an SVG shape is coloured with fill and stroke, not background.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BUCKET_PROPERTIES,
  transitionDeclaration,
  rootTransitionDeclaration,
  colourTransitionVar,
} from '../src/CE_Application/utils/transitionCss.js';

const T = '120ms linear 0ms';

test('each bucket lists its properties with the bucket\'s timing, in a fixed order', () => {
  const css = transitionDeclaration({ colour: 'c', transform: 't', opacity: null, size: 's' });
  assert.equal(css, 'transition:transform t, translate t, rotate t, scale t, left t, top t, width s, height s, background-color c, color c, border-color c, fill c, stroke c;');
  assert.equal(transitionDeclaration({ transform: null, opacity: null, size: null, colour: null }), '');
  assert.equal(transitionDeclaration(null), '');
});

test('a part glides left and top with its transform — that is where it is placed', () => {
  // The editor has always listed Layout.x/y/offsetX/offsetY under "transform". Without left/top in
  // the list, moving a part never animated, however the target was set.
  assert.ok(BUCKET_PROPERTIES.part.transform.includes('left'));
  assert.ok(BUCKET_PROPERTIES.part.transform.includes('top'));
  assert.match(transitionDeclaration({ transform: T }), /left 120ms/);
});

test('the control\'s own box never glides left or top, so dragging it in the editor never lags', () => {
  assert.ok(!BUCKET_PROPERTIES.root.transform.includes('left'));
  assert.ok(!BUCKET_PROPERTIES.root.transform.includes('top'));
  const css = rootTransitionDeclaration(new Map([['transform', T], ['opacity', T], ['size', T]]));
  assert.ok(!/left|top/.test(css), css);
  assert.ok(!/width|height/.test(css), 'and the root has no size bucket');
});

test('an SVG shape is coloured with fill and stroke, and has no size bucket CSS can act on', () => {
  const css = transitionDeclaration({ colour: T, size: T }, { target: 'svg' });
  assert.match(css, /fill 120ms/);
  assert.match(css, /stroke 120ms/);
  assert.ok(!/background-color|width/.test(css), css);
  assert.deepEqual(BUCKET_PROPERTIES.svg.size, []);
});

test('every target kind has all four buckets, so no bucket silently vanishes on one renderer', () => {
  for (const [target, table] of Object.entries(BUCKET_PROPERTIES)) {
    assert.deepEqual(Object.keys(table).sort(), ['colour', 'opacity', 'size', 'transform'], target);
  }
});

test('the colour timing travels as an inherited custom property, and is always set', () => {
  assert.equal(colourTransitionVar(null), '--ce-colour-transition:none;',
    'a part with no colour timing must not borrow its control\'s');
  assert.equal(colourTransitionVar(T), `--ce-colour-transition:${BUCKET_PROPERTIES.part.colour.map((p) => `${p} ${T}`).join(', ')};`);
  assert.match(colourTransitionVar(T, { svg: true }), /stop-color 120ms/);
});

test('the painting elements read the custom property, in every renderer that paints colour', () => {
  // `transition` does not inherit. A fill layer or a text block that does not read the variable
  // would keep snapping while the part around it says it glides.
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  for (const path of [
    'CE_Application/editor/CanvasControl.svelte',
    'CE_Application/editor/InteractivePartRenderer.svelte',
    'CE_Panel/components/BackgroundRenderer.svelte',
  ]) {
    assert.match(read(path), /transition: var\(--ce-colour-transition, none\)/, path);
  }
  // And nobody writes the old catch-all any more.
  assert.ok(!/transition: all \$\{/.test(read('CE_Application/editor/SliderFamilyRenderer.svelte')));
});
