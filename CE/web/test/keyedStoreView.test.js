import test from 'node:test';
import assert from 'node:assert/strict';
import { writable } from 'svelte/store';
import { keyedStoreView } from '../src/CE_Application/utils/keyedStoreView.js';

test('a keyed view retains untouched sessions and follows additions, removals and resets', () => {
  const a = { value: 1 }, b = { value: 2 };
  const source = writable({ a, b });
  const view = keyedStoreView(source);
  assert.equal(view.values.get('a'), a);
  const changed = { value: 3 };
  source.set({ a: changed, b });
  assert.equal(view.values.get('a'), changed);
  assert.equal(view.values.get('b'), b);
  source.set({ b, c: a });
  assert.equal(view.values.has('a'), false);
  assert.equal(view.values.get('c'), a);
  source.set({});
  assert.equal(view.values.size, 0);
  view.destroy();
  source.set({ a });
  assert.equal(view.values.size, 0, 'an unmounted view must release its subscription');
});
