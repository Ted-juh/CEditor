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
