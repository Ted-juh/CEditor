// textFitNoRoom.test.js — shrink-to-fit never shrinks text to nothing.
//
// With no room to fit into (padding taller than the control), the fit scale was computed against a
// 0.0001 stand-in and came out near zero: the GAIA's bank-name buttons, squeezed to 15px under a
// Button's default padding, rendered blank. No room is not something shrinking can solve, so the
// text is left at its own size.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBlockTextLayoutState } from '../src/CE_Application/editor/canvasControlTextLayout.js';

const font = { size: 10 };

test('no height to fit into leaves the text unscaled', () => {
  const { fitScale } = buildBlockTextLayoutState('CHECK SELECTION', { fontSection: font, maxWidth: 120, maxHeight: 0, fitMode: 'shrink', maxLines: 1 });
  assert.equal(fitScale, 1);
});

test('no width to fit into leaves the text unscaled', () => {
  const { fitScale } = buildBlockTextLayoutState('CHECK SELECTION', { fontSection: font, maxWidth: 0, maxHeight: 20, fitMode: 'shrink', maxLines: 1 });
  assert.equal(fitScale, 1);
});

test('real room still shrinks text that does not fit', () => {
  // Wraps to several lines at this width, and they do not fit this height.
  const { fitScale } = buildBlockTextLayoutState('CHECK SELECTION', { fontSection: font, maxWidth: 30, maxHeight: 12, fitMode: 'shrink' });
  assert.ok(fitScale > 0.05 && fitScale < 1, `expected a real shrink, got ${fitScale}`);
});

// The canvas lays every caption in a line box forced to the full width (forceLineBoxWidth), and the
// layout's `width` is that box. Fitting measured the box against itself, so it always fitted: a
// one-line caption too wide for its control was clipped, never shrunk. Only text too tall shrank.
test('a one-line caption too wide for its box shrinks in the line box the canvas uses', () => {
  const caption = 'A CAPTION FAR TOO LONG FOR ITS BOX';
  const forced = buildBlockTextLayoutState(caption, { fontSection: font, maxWidth: 52, maxHeight: 16, fitMode: 'shrink', wrapMode: 'none', forceLineBoxWidth: true });
  assert.ok(forced.fitScale < 0.9, `expected a real shrink, got ${forced.fitScale}`);
  assert.ok(forced.layout.contentWidth * forced.fitScale <= 52.5, 'and the shrunk text fits the box');
  const loose = buildBlockTextLayoutState(caption, { fontSection: font, maxWidth: 52, maxHeight: 16, fitMode: 'shrink', wrapMode: 'none' });
  assert.equal(forced.fitScale, loose.fitScale, 'the line box does not change the answer');
});

test('a caption that fits keeps its size, line box or not', () => {
  for (const forceLineBoxWidth of [true, false]) {
    const { fitScale } = buildBlockTextLayoutState('VOL', { fontSection: font, maxWidth: 52, maxHeight: 16, fitMode: 'shrink', wrapMode: 'none', forceLineBoxWidth });
    assert.equal(fitScale, 1, `forceLineBoxWidth ${forceLineBoxWidth}`);
  }
});
