import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { splitColourAlpha } from '../src/CE_Application/utils/colorMath.js';
import { colorTarget, activateColorTarget } from '../src/CE_Application/stores/colorTarget.js';
import { gradientTarget, activateGradientTarget } from '../src/CE_Application/stores/gradientTarget.js';
import { selectedComponentIds } from '../src/CE_Application/stores/panels.js';

test('splitColourAlpha keeps the alpha byte out of the RGB channels', () => {
  // The default panel colour: AARRGGBB. Reading chars 0-5 as RGB shows red.
  assert.deepEqual(splitColourAlpha('FF333333'), { color: '333333', alpha: 1 });
  const half = splitColourAlpha('80FF0000');
  assert.equal(half.color, 'FF0000');
  assert.ok(Math.abs(half.alpha - 128 / 255) < 1e-9);
  assert.deepEqual(splitColourAlpha('ABCDEF'), { color: 'ABCDEF', alpha: 1 });
  assert.deepEqual(splitColourAlpha('#FF333333'), { color: '333333', alpha: 1 });
  assert.deepEqual(splitColourAlpha(null), { color: '333333', alpha: 1 });
});

test('a colour target does not survive a selection change', () => {
  activateColorTarget({ type: 'control', controlId: 'ctrl_1', path: 'Background.Fill.colour' }, 'FF112233');
  assert.ok(get(colorTarget));

  selectedComponentIds.set(new Set(['ctrl_2']));
  assert.equal(get(colorTarget), null);
});

test('a gradient target does not survive a selection change', () => {
  activateGradientTarget({ type: 'control', controlId: 'ctrl_1', path: 'Background.Fill' }, null);
  assert.ok(get(gradientTarget));

  selectedComponentIds.set(new Set());
  assert.equal(get(gradientTarget), null);
});
