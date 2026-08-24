// canvasGeometryFeedback.test.js — what the canvas tells you about geometry while you work.
//
// Review finding A13, four clauses that are one subject:
//
//   (1) "No dimension HUD during drag/resize (no live X/Y/W/H anywhere)". The status bar reads
//       the store and a gesture writes nothing to the store until mouseup, so the numbers were
//       missing at exactly the moment they were wanted.
//   (2) "No equal-spacing detection (the pink Figma-style indicators)". canvasSnapping measures
//       the nearest neighbour per side, which cannot see that three gaps match.
//   (3) "No Alt-hover measuring". The only altKey the canvas read was drag-duplicate.
//   (4) "No Escape to cancel an in-flight drag".
//
// The maths is in pure modules so it can be tested without a browser; the element reads are
// tested against stand-ins with the two properties they actually use.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  gestureHudParts, gestureTargetFor, readGestureGeometry, rewindGesture,
} from '../src/CE_Application/utils/canvasGesture.js';
import { measureBetweenRects } from '../src/CE_Application/utils/canvasMeasure.js';
import { detectEqualSpacing, detectEqualSpacingOnAxis } from '../src/CE_Application/utils/equalSpacing.js';

const here = dirname(fileURLToPath(import.meta.url));
const editorCanvas = readFileSync(
  join(here, '..', 'src', 'CE_Application', 'editor', 'EditorCanvas.svelte'), 'utf8',
);

// --- (1) the live readout -----------------------------------------------------------------

function el(matches, parent = null) {
  const node = {
    parent,
    matches,
    style: {},
    dataset: {},
    closest(selector) {
      let n = node;
      while (n) { if (n.matches.includes(selector)) return n; n = n.parent; }
      return null;
    },
    getBoundingClientRect: () => node.rect,
    rect: { left: 0, top: 0, width: 0, height: 0 },
  };
  return node;
}

test('a press on a control body starts a drag; on a handle, a resize', () => {
  const control = el(['.canvas-control']);
  assert.deepEqual(gestureTargetFor(control), { kind: 'drag', element: control });
  assert.equal(gestureTargetFor(el(['.resize-handle'], control)).kind, 'resize');
  assert.equal(gestureTargetFor(el(['.rotate-zone'], control)).kind, 'rotate');
  assert.equal(gestureTargetFor(el(['.resize-handle'], control)).element, control,
    'the handle reports the control it belongs to, not itself');
});

test('a press on the bare surface starts no gesture at all', () => {
  assert.equal(gestureTargetFor(el(['.panel-surface'])), null);
  assert.equal(gestureTargetFor(null), null);
});

test('the readout takes the control\'s own numbers from where it draws them', () => {
  const control = el(['.canvas-control']);
  control.style = { left: '137px', top: '42px', width: '210px', height: '64px' };
  control.rect = { left: 300, top: 200, width: 105, height: 32 };
  const surface = el(['.panel-surface']);
  surface.rect = { left: 100, top: 100, width: 800, height: 600 };

  const g = readGestureGeometry(control, surface, 0.5);
  // Own frame: exactly the numbers the control is drawing with, so the HUD agrees with the
  // properties panel for a nested control instead of inventing panel-space values.
  assert.deepEqual([g.x, g.y, g.w, g.h], [137, 42, 210, 64]);
  // Panel space: measured, and divided back out of the zoom, for positioning the HUD.
  assert.deepEqual([g.panelX, g.panelY, g.panelW, g.panelH], [400, 200, 210, 64]);
});

test('the readout gives up rather than reporting nonsense', () => {
  const bare = el(['.canvas-control']);
  bare.rect = { left: 0, top: 0, width: 0, height: 0 };
  assert.equal(readGestureGeometry(bare, el(['.panel-surface']), 1), null, 'no inline geometry yet');
  assert.equal(readGestureGeometry(null, el([]), 1), null);
  assert.equal(readGestureGeometry(el([]), null, 1), null);
});

test('the HUD shows all four numbers, in the order the rest of the editor uses', () => {
  const parts = gestureHudParts({ x: 1, y: 2, w: 3, h: 4 });
  assert.deepEqual(parts.map((p) => p.label), ['X', 'Y', 'W', 'H']);
  assert.deepEqual(parts.map((p) => p.value), [1, 2, 3, 4]);
  assert.deepEqual(gestureHudParts(null), []);
});

test('the canvas renders the readout from a live gesture, editor-side only', () => {
  assert.match(editorCanvas, /class="gesture-hud"/);
  assert.match(editorCanvas, /gestureHudParts\(gesture\.geometry\)/);
  assert.match(editorCanvas, /\{#if !\$previewModeEnabled\}[\s\S]*class="canvas-annotations"/,
    'the whole annotation layer is skipped in preview');
  assert.match(editorCanvas, /\.canvas-annotations \{[\s\S]*?pointer-events: none;/,
    'and it never eats a click meant for the panel');
});

// --- (2) equal spacing --------------------------------------------------------------------

const box = (id, x, y, w = 40, h = 20) => ({ id, x, y, w, h });

test('three boxes with matching gaps are detected as a row', () => {
  const target = box('A', 0, 0);
  const others = [box('B', 60, 0), box('C', 120, 0)];   // gaps of 20 and 20
  const found = detectEqualSpacingOnAxis(target, others, 'x');
  assert.ok(found);
  assert.equal(found.gap, 20);
  assert.equal(found.count, 2, 'both gaps are drawn, not just the one next to the target');
  assert.deepEqual(found.segments.map((s) => s.x), [40, 100]);
  assert.deepEqual(found.segments.map((s) => s.length), [20, 20]);
});

test('unequal gaps are not a row', () => {
  assert.equal(detectEqualSpacingOnAxis(box('A', 0, 0), [box('B', 60, 0), box('C', 140, 0)], 'x'), null);
});

test('two boxes are never equal spacing — one gap has nothing to match', () => {
  assert.equal(detectEqualSpacingOnAxis(box('A', 0, 0), [box('B', 60, 0)], 'x'), null);
});

test('a run the target takes no part in is true but not news, and is not drawn', () => {
  // B, C, D are evenly spaced; the target A sits far away with an odd gap of its own.
  const target = box('A', 0, 0);
  const others = [box('B', 500, 0), box('C', 560, 0), box('D', 620, 0)];
  assert.equal(detectEqualSpacingOnAxis(target, others, 'x'), null);
});

test('only boxes sharing a band count — a control in another row is not a neighbour', () => {
  const target = box('A', 0, 0);
  const others = [box('B', 60, 400), box('C', 120, 400)];
  assert.equal(detectEqualSpacingOnAxis(target, others, 'x'), null);
});

test('columns work the same way, and both axes can report at once', () => {
  const target = box('A', 0, 0);
  const column = [box('B', 0, 40), box('C', 0, 80)];      // vertical gaps of 20, 20
  const row = [box('D', 60, 0), box('E', 120, 0)];        // horizontal gaps of 20, 20
  const groups = detectEqualSpacing(target, [...column, ...row]);
  assert.deepEqual(groups.map((g) => g.axis).sort(), ['x', 'y']);
});

test('a gap is equal within the tolerance, so a one-unit rounding does not break the row', () => {
  const found = detectEqualSpacingOnAxis(box('A', 0, 0), [box('B', 60, 0), box('C', 121, 0)], 'x', 1);
  assert.ok(found, 'gaps of 20 and 21 are the same gap to the eye');
  assert.equal(detectEqualSpacingOnAxis(box('A', 0, 0), [box('B', 60, 0), box('C', 121, 0)], 'x', 0), null);
});

test('overlapping boxes are not "equally spaced"', () => {
  assert.equal(detectEqualSpacingOnAxis(box('A', 0, 0), [box('B', 20, 0), box('C', 40, 0)], 'x'), null);
});

test('the canvas draws the indicators for the control being moved', () => {
  assert.match(editorCanvas, /detectEqualSpacing\(target,/);
  assert.match(editorCanvas, /class="eq-bar"/);
  assert.match(editorCanvas, /controlPanelOffset\(canvasPanel\.controls, gesture\.id\)/,
    'drawn in panel space although detected in the control\'s own frame');
});

// --- (3) Alt-hover measuring ---------------------------------------------------------------

test('a rect directly below gets one vertical measurement, drawn between the facing edges', () => {
  const from = { x: 0, y: 0, w: 100, h: 50 };
  const to = { x: 20, y: 90, w: 60, h: 30 };
  const segments = measureBetweenRects(from, to);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].axis, 'y');
  assert.equal(segments[0].dist, 40);
  assert.deepEqual([segments[0].y1, segments[0].y2], [50, 90]);
  assert.equal(segments[0].x1, segments[0].x2, 'a vertical line');
  assert.equal(segments[0].x1, 50, 'sitting in the middle of the band the two rects share');
});

test('a rect diagonally away gets both distances — "over by this much, down by this much"', () => {
  const segments = measureBetweenRects({ x: 0, y: 0, w: 50, h: 50 }, { x: 200, y: 300, w: 50, h: 50 });
  assert.deepEqual(segments.map((s) => s.axis), ['x', 'y']);
  assert.deepEqual(segments.map((s) => s.dist), [150, 250]);
});

test('measuring works in both directions', () => {
  const segments = measureBetweenRects({ x: 300, y: 0, w: 50, h: 50 }, { x: 0, y: 0, w: 50, h: 50 });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].axis, 'x');
  assert.equal(segments[0].dist, 250);
  assert.deepEqual([segments[0].x1, segments[0].x2], [300, 50]);
});

test('an axis the rects overlap on has no gap, and is left out rather than drawn as zero', () => {
  const segments = measureBetweenRects({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 300, w: 100, h: 100 });
  assert.deepEqual(segments.map((s) => s.axis), ['y']);
  assert.deepEqual(measureBetweenRects({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 10, w: 20, h: 20 }), []);
});

test('the canvas only measures on Alt, with one control selected, and puts it away after', () => {
  const handler = editorCanvas.match(/function handleCanvasMouseMove\(e\) \{[\s\S]*?\n  \}/);
  assert.ok(handler);
  assert.match(handler[0], /e\.altKey/);
  assert.match(handler[0], /\$selectedComponentIds\.size !== 1/);
  assert.match(handler[0], /measureBetweenRects\(from, to\)/);
  assert.match(editorCanvas, /if \(!e\.altKey\) clearMeasure\(\);/, 'releasing Alt puts it away');
  assert.match(editorCanvas, /onmouseleave=\{clearMeasure\}/, 'so does leaving the canvas');
});

// --- (4) Escape cancels the gesture ---------------------------------------------------------

test('the rewind puts the pointer back where the gesture began and releases it', () => {
  const dispatched = [];
  class FakeMouseEvent {
    constructor(type, init) { this.type = type; Object.assign(this, init); }
  }
  const win = { MouseEvent: FakeMouseEvent, dispatchEvent: (e) => dispatched.push(e) };

  assert.equal(rewindGesture(win, { x: 120, y: 64 }), true);
  assert.deepEqual(dispatched.map((e) => e.type), ['mousemove', 'mouseup'],
    'move first: the control recomputes a zero delta before it is asked to commit');
  for (const e of dispatched) {
    assert.equal(e.clientX, 120);
    assert.equal(e.clientY, 64);
    assert.equal(e.button, 0);
  }
});

test('the rewind is a no-op where there is nothing to rewind', () => {
  assert.equal(rewindGesture(null, { x: 0, y: 0 }), false);
  assert.equal(rewindGesture({ MouseEvent: function () {}, dispatchEvent() {} }, null), false);
  assert.equal(rewindGesture({ dispatchEvent() {} }, { x: 0, y: 0 }), false);
});

test('Escape reaches the gesture even when the canvas has no focus, and stops there', () => {
  const handler = editorCanvas.match(/function gestureKey\(e\) \{[\s\S]*?\n  \}/);
  assert.ok(handler);
  assert.match(handler[0], /e\.key !== 'Escape'/);
  assert.match(handler[0], /rewindGesture\(window, gestureStart\)/);
  assert.match(handler[0], /stopPropagation/, 'so Escape does not also deselect');
  assert.match(editorCanvas, /window\.addEventListener\('keydown', gestureKey, true\)/,
    'listened for on window, in capture, for the length of the gesture');
  assert.match(editorCanvas, /window\.removeEventListener\('keydown', gestureKey, true\)/);
});
