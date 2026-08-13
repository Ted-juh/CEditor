import test from 'node:test';
import assert from 'node:assert/strict';

import { resizeHandleStyle } from '../src/CE_Application/utils/transformMath.js';

test('handles are 8px at 100% zoom', () => {
  const style = resizeHandleStyle('tl', 1);
  assert.match(style, /width:8px/);
  assert.match(style, /height:8px/);
  assert.match(style, /top:-4px/);
  assert.match(style, /left:-4px/);
});

test('handles grow in panel units as zoom shrinks, staying 8 screen px', () => {
  // 25% zoom → invScale 4 → 32 panel units = 8 screen px.
  const style = resizeHandleStyle('br', 4);
  assert.match(style, /width:32px/);
  assert.match(style, /height:32px/);
  assert.match(style, /bottom:-16px/);
  assert.match(style, /right:-16px/);
  assert.match(style, /border-width:4px/);
});

test('edge handles centre with the compensated half-size', () => {
  // 200% zoom → invScale 0.5 → 4 panel units = 8 screen px.
  const style = resizeHandleStyle('t', 0.5);
  assert.match(style, /width:4px/);
  assert.match(style, /left:calc\(50% - 2px\)/);
});
