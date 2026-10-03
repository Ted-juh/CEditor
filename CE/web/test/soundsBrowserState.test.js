import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSelection, pushHistory } from '../src/CE_Application/sections/sounds/soundsBrowser.svelte.js';

const order = ['a', 'b', 'c', 'd', 'e'];

test('a plain click selects one sound and anchors there', () => {
  assert.deepEqual(nextSelection(order, ['a', 'b'], 'a', 'c'), { selection: ['c'], anchor: 'c' });
});

test('ctrl adds or removes one; shift takes the run from the anchor', () => {
  assert.deepEqual(nextSelection(order, ['a'], 'a', 'c', { toggle: true }), { selection: ['a', 'c'], anchor: 'c' });
  assert.deepEqual(nextSelection(order, ['a', 'c'], 'c', 'a', { toggle: true }).selection, ['c']);
  assert.deepEqual(nextSelection(order, ['b'], 'b', 'd', { shift: true }).selection, ['b', 'c', 'd']);
  assert.deepEqual(nextSelection(order, ['d'], 'd', 'b', { shift: true }).selection, ['b', 'c', 'd'], 'either direction');
  assert.deepEqual(nextSelection(order, ['a'], 'b', 'd', { shift: true, toggle: true }).selection, ['a', 'b', 'c', 'd'],
    'ctrl-shift adds the run to what was there');
  assert.deepEqual(nextSelection(order, ['a'], 'gone', 'c', { shift: true }).selection, ['c'],
    'an anchor that has scrolled out of the results starts over');
});

test('history works like a web browser', () => {
  let h = { history: [], at: -1 };
  for (const id of ['a', 'b', 'c']) h = pushHistory(h.history, h.at, id);
  assert.deepEqual(h, { history: ['a', 'b', 'c'], at: 2 });
  assert.deepEqual(pushHistory(h.history, 2, 'c'), h, 'loading the sound you are on adds nothing');
  assert.deepEqual(pushHistory(h.history, 0, 'x'), { history: ['a', 'x'], at: 1 }, 'going back then loading drops what was ahead');
  const long = pushHistory(Array.from({ length: 50 }, (_, i) => `r${i}`), 49, 'new');
  assert.equal(long.history.length, 50);
  assert.equal(long.history[49], 'new');
});
