import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIconTintStyle,
  usesIconTint,
} from '../src/CE_Application/editor/canvasControlStyles.js';

test('opaque white keeps the imported icon in full colour', () => {
  for (const value of [undefined, '', 'FFFFFF', 'FFFFFFFF', '#ffffffff', 'not-a-colour']) {
    assert.equal(usesIconTint(value), false);
    assert.equal(buildIconTintStyle(value, 'data:image/png;base64,probe'), '');
  }
});

test('a real tint builds a centred alpha mask with the authored fit and colour', () => {
  const style = buildIconTintStyle('8044CC22', 'data:image/png;base64,probe', 'cover');
  assert.equal(usesIconTint('8044CC22'), true);
  assert.match(style, /background-color:rgba\(68, 204, 34, 0\.502\)/);
  assert.match(style, /mask-image:url\("data:image\/png;base64,probe"\)/);
  assert.match(style, /mask-size:cover/);
  assert.match(style, /mask-position:center/);
  assert.match(style, /mask-repeat:no-repeat/);
});

test('six-digit tints are accepted and an empty image cannot produce a mask', () => {
  assert.equal(usesIconTint('#5B9BD5'), true);
  assert.equal(buildIconTintStyle('#5B9BD5', ''), '');
  assert.match(buildIconTintStyle('#5B9BD5', 'probe.svg', 'unknown'), /mask-size:contain/);
});
