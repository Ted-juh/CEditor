// browseTargets.test.js — an image chosen with Browse goes on the selection it was chosen for.
//
// Browse on the Background tab refused to start with more than one control selected, so the
// SH-201 tutorial's brushed-metal overlay had to be put on one silver section and copied to the
// other nine. It now goes on all of them; but the file dialog answers later, so only while the
// selection is still the one Browse was started with.

import test from 'node:test';
import assert from 'node:assert/strict';

import { browseGoesToSelection } from '../src/CE_Application/utils/browseTargets.js';

test('a texture chosen for ten sections goes on the ten', () => {
  const ten = new Set(Array.from({ length: 10 }, (_, i) => `section_${i}`));
  assert.equal(browseGoesToSelection(ten, new Set(ten)), true);
});

test('only on the control that asked, when the selection moved on or was one control', () => {
  const two = new Set(['a', 'b']);
  assert.equal(browseGoesToSelection(two, new Set(['a'])), false, 'one deselected meanwhile');
  assert.equal(browseGoesToSelection(two, new Set(['a', 'c'])), false, 'another selected instead');
  assert.equal(browseGoesToSelection(two, new Set(['a', 'b', 'c'])), false, 'one added');
  assert.equal(browseGoesToSelection(new Set(['a']), new Set(['a'])), false, 'a single control is its own editor\'s');
  assert.equal(browseGoesToSelection(null, two), false, 'no Browse in flight');
});
