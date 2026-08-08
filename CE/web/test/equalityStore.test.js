import test from 'node:test';
import assert from 'node:assert/strict';
import { get, writable } from 'svelte/store';

import { equalityWritable } from '../src/CE_Application/utils/equalityStore.js';

const sameScope = (a, b) => (a?.mode ?? '') === (b?.mode ?? '') && (a?.name ?? '') === (b?.name ?? '');

test('a plain writable notifies even when handed back the SAME object', () => {
  // The behaviour this module exists to work around, pinned so the reason stays visible. Svelte's
  // safe_not_equal returns true for any object, so the widespread
  //   store.update((current) => (isSame(current, next) ? current : next))
  // idiom reads as "only notify when it changed" and does not do that.
  const store = writable({ mode: 'base' });
  let runs = 0;
  store.subscribe(() => { runs += 1; });
  assert.equal(runs, 1, 'subscribing runs once');

  store.update((current) => current);
  assert.equal(runs, 2, 'the identical object still notified — this is the bug');
});

test('an equality writable stays quiet when nothing changed', () => {
  const store = equalityWritable({ mode: 'base', name: '' }, sameScope);
  let runs = 0;
  store.subscribe(() => { runs += 1; });
  assert.equal(runs, 1);

  store.set({ mode: 'base', name: '' });          // a different object, an equal value
  store.set({ mode: 'base', name: '' });
  assert.equal(runs, 1, 'no notification for an equal value');
});

test('it notifies when the value genuinely changes', () => {
  const store = equalityWritable({ mode: 'base', name: '' }, sameScope);
  const seen = [];
  store.subscribe((v) => seen.push(v.mode + ':' + v.name));

  store.set({ mode: 'state', name: 'Hover' });
  store.set({ mode: 'state', name: 'Hover' });   // equal, quiet
  store.set({ mode: 'state', name: 'Pressed' });
  store.set({ mode: 'base', name: '' });

  assert.deepEqual(seen, ['base:', 'state:Hover', 'state:Pressed', 'base:']);
});

test('update cannot bypass the guard', () => {
  // update() is defined in terms of set(), so there is no second door into the store. Leaving it
  // unguarded would put the original bug back for any caller that reached for update instead.
  const store = equalityWritable({ mode: 'base', name: '' }, sameScope);
  let runs = 0;
  store.subscribe(() => { runs += 1; });

  store.update((current) => current);
  store.update(() => ({ mode: 'base', name: '' }));
  assert.equal(runs, 1, 'update stayed quiet for an equal value');

  store.update((current) => ({ ...current, mode: 'state', name: 'X' }));
  assert.equal(runs, 2);
});

test('update sees the current value even after a suppressed set', () => {
  // The guard must not desynchronise the value update() reads from the value subscribers hold.
  const store = equalityWritable({ mode: 'base', name: '' }, sameScope);
  store.set({ mode: 'base', name: '' });          // suppressed
  let seen = null;
  store.update((current) => { seen = current; return current; });
  assert.deepEqual(seen, { mode: 'base', name: '' });
  assert.deepEqual(get(store), { mode: 'base', name: '' });
});

test('get() reflects the last value that was actually accepted', () => {
  const store = equalityWritable({ mode: 'base', name: '' }, sameScope);
  store.set({ mode: 'state', name: 'A' });
  assert.deepEqual(get(store), { mode: 'state', name: 'A' });
  store.set({ mode: 'state', name: 'A' });
  assert.deepEqual(get(store), { mode: 'state', name: 'A' });
});
