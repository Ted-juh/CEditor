import test from 'node:test';
import assert from 'node:assert/strict';

import { withPixelCustomFontSource } from '../src/CE_Application/utils/pixelFont.js';

test('custom font import materialises defaults when the optional font is null', () => {
  assert.deepEqual(withPixelCustomFontSource(null, 'data:image/png;base64,font'), {
    glyphW: 6,
    glyphH: 8,
    cols: 16,
    first: 32,
    src: 'data:image/png;base64,font',
  });
});

test('custom font import preserves metrics changed while the file was loading', () => {
  assert.deepEqual(withPixelCustomFontSource({ glyphW: 9, glyphH: 12, cols: 8, first: 48, src: 'old' }, 'new'), {
    glyphW: 9,
    glyphH: 12,
    cols: 8,
    first: 48,
    src: 'new',
  });
});
