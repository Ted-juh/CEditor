// recentFiles.test.js — the MRU list behind File ▸ Open Recent.
//
// Review finding D6: "File has no Recent Files (panels track `filePath`; a recent list exists for
// scripts only)", and E6's second clause, which wants recent documents reachable from onboarding.
// The store is pure list mechanics, so the properties that matter are testable directly: identity
// (the same file must not appear twice however it is spelled), ordering (most recent first),
// bounds (both of them), and the persistence round-trip.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resetStoredQuotaState } from '../src/CE_Application/utils/localStorageState.js';

/** A localStorage that behaves, so a round-trip can actually be observed. */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
  return map;
}

/** The store keeps module state, so each test needs its own instance of the module. */
async function freshStore(seed) {
  resetStoredQuotaState();
  fakeStorage(seed);
  return import(`../src/CE_Application/stores/recentFiles.js?t=${Math.random()}`);
}

test.afterEach(() => { delete globalThis.localStorage; resetStoredQuotaState(); });

test('remembering a panel puts it at the front, newest first', async () => {
  const { get } = await import('svelte/store');
  const store = await freshStore();
  store.rememberRecentFile({ kind: 'panel', path: 'C:/Panels/One.cepanel', name: 'One' });
  store.rememberRecentFile({ kind: 'panel', path: 'C:/Panels/Two.cepanel', name: 'Two' });
  assert.deepEqual(get(store.recentFiles).map((e) => e.name), ['Two', 'One']);
});

test('re-opening a file moves it back to the front instead of adding a second row', async () => {
  const { get } = await import('svelte/store');
  const store = await freshStore();
  store.rememberRecentFile({ kind: 'panel', path: 'C:/A.cepanel', name: 'A' });
  store.rememberRecentFile({ kind: 'panel', path: 'C:/B.cepanel', name: 'B' });
  store.rememberRecentFile({ kind: 'panel', path: 'C:/A.cepanel', name: 'A' });
  assert.deepEqual(get(store.recentFiles).map((e) => e.name), ['A', 'B']);
});

test('the same file spelled differently is still the same file', async () => {
  const { get } = await import('svelte/store');
  const store = await freshStore();
  // Exactly the drift that happens in the app: the save handler echoes the native spelling, the
  // session-restore path list has been round-tripped through forward slashes and lower case.
  store.rememberRecentFile({ kind: 'panel', path: 'C:\\Panels\\Kit.cepanel', name: 'Kit' });
  store.rememberRecentFile({ kind: 'panel', path: 'c:/panels/kit.cepanel', name: 'Kit' });
  const list = get(store.recentFiles);
  assert.equal(list.length, 1);
  // The display keeps whatever arrived last, so the list reflects the most recent truth.
  assert.equal(list[0].path, 'c:/panels/kit.cepanel');
});

test('two kinds sharing one identifier are two entries', async () => {
  const { get } = await import('svelte/store');
  const store = await freshStore();
  store.rememberRecentFile({ kind: 'component', id: 'shared-id', name: 'Package' });
  store.rememberRecentFile({ kind: 'deviceProfile', id: 'shared-id', name: 'Profile' });
  assert.equal(get(store.recentFiles).length, 2);
});

test('one busy kind cannot evict every other kind', async () => {
  const { get } = await import('svelte/store');
  const store = await freshStore();
  store.rememberRecentFile({ kind: 'script', path: '/s/only.cescript', name: 'Only Script' });
  for (let i = 0; i < store.MAX_RECENT_FILES + 5; i += 1) {
    store.rememberRecentFile({ kind: 'panel', path: `/p/${i}.cepanel`, name: `P${i}` });
  }
  const list = get(store.recentFiles);
  assert.equal(list.filter((e) => e.kind === 'panel').length, store.MAX_RECENT_PER_KIND);
  assert.ok(list.some((e) => e.name === 'Only Script'), 'the lone script survives a panel flood');
  assert.ok(list.length <= store.MAX_RECENT_FILES);
});

test('the total bound holds even with every kind pulling', async () => {
  const { get } = await import('svelte/store');
  const store = await freshStore();
  for (const kind of store.RECENT_FILE_KINDS) {
    for (let i = 0; i < 10; i += 1) {
      store.rememberRecentFile({ kind, path: `/x/${kind}-${i}`, name: `${kind}${i}` });
    }
  }
  assert.equal(get(store.recentFiles).length, store.MAX_RECENT_FILES);
});

test('entries nothing could re-open are refused', async () => {
  const { get } = await import('svelte/store');
  const store = await freshStore();
  assert.equal(store.rememberRecentFile(null), null);
  assert.equal(store.rememberRecentFile({ kind: 'panel' }), null, 'no path and no id');
  assert.equal(store.rememberRecentFile({ kind: 'notAThing', path: '/x' }), null, 'unknown kind');
  assert.equal(get(store.recentFiles).length, 0);
});

test('the list survives a restart, and reloads deduplicated and capped', async () => {
  const { get } = await import('svelte/store');
  const map = fakeStorage();
  resetStoredQuotaState();
  const first = await import(`../src/CE_Application/stores/recentFiles.js?t=${Math.random()}`);
  first.rememberRecentFile({ kind: 'panel', path: '/p/Kit.cepanel', name: 'Kit' });
  first.rememberRecentFile({ kind: 'script', path: '/s/Boot.cescript', name: 'Boot' });

  const raw = map.get(first.RECENT_FILES_STORAGE_KEY);
  assert.ok(raw, 'something was persisted');

  // Restart: same storage, fresh module. Plus a duplicate and a junk row written by an older
  // build, which a reload must not propagate.
  const stored = JSON.parse(raw);
  map.set(first.RECENT_FILES_STORAGE_KEY, JSON.stringify([...stored, stored[0], { kind: 'panel' }, 'nope']));
  resetStoredQuotaState();
  const second = await import(`../src/CE_Application/stores/recentFiles.js?t=${Math.random()}`);
  const reloaded = get(second.recentFiles);
  assert.deepEqual(reloaded.map((e) => e.name), ['Boot', 'Kit']);
});

test('forget drops one entry and clear drops them all, both persisting', async () => {
  const { get } = await import('svelte/store');
  const map = fakeStorage();
  resetStoredQuotaState();
  const store = await import(`../src/CE_Application/stores/recentFiles.js?t=${Math.random()}`);
  store.rememberRecentFile({ kind: 'panel', path: '/p/A', name: 'A' });
  store.rememberRecentFile({ kind: 'panel', path: '/p/B', name: 'B' });
  store.forgetRecentFile({ kind: 'panel', path: '/P/a' });
  assert.deepEqual(get(store.recentFiles).map((e) => e.name), ['B']);
  store.clearRecentFiles();
  assert.deepEqual(JSON.parse(map.get(store.RECENT_FILES_STORAGE_KEY)), []);
});

test('grouping keeps a fixed kind order and never emits an empty group', async () => {
  const store = await freshStore();
  const list = [
    { kind: 'script', path: '/s/1', name: 'S1' },
    { kind: 'panel', path: '/p/1', name: 'P1' },
    { kind: 'panel', path: '/p/2', name: 'P2' },
  ];
  const groups = store.groupRecentFiles(list);
  assert.deepEqual(groups.map((g) => g.kind), ['panel', 'script']);
  assert.deepEqual(groups[0].entries.map((e) => e.name), ['P1', 'P2']);
  assert.ok(groups.every((g) => g.entries.length > 0));
  assert.equal(store.groupRecentFiles([]).length, 0);
});

test('the menu label is the basename, whichever slash the platform used', async () => {
  const store = await freshStore();
  assert.equal(store.recentFileLabel({ path: 'C:\\Panels\\Kit.cepanel' }), 'Kit.cepanel');
  assert.equal(store.recentFileLabel({ path: '/home/u/Kit.cepanel' }), 'Kit.cepanel');
  assert.equal(store.recentFileLabel({ name: 'Named', path: '/x/other' }), 'Named');
  assert.equal(store.recentFileLabel({ id: 'pkg-7' }), 'pkg-7');
});

test('a kind-limited slice is what a menu asks for', async () => {
  const store = await freshStore();
  const list = Array.from({ length: 9 }, (_, i) => ({ kind: 'panel', path: `/p/${i}`, name: `P${i}` }));
  assert.equal(store.recentFilesByKind(list, 'panel').length, store.RECENT_MENU_LIMIT);
  assert.equal(store.recentFilesByKind(list, 'script').length, 0);
});

test('it works with no localStorage at all, which is how the tests and the export runner see it', async () => {
  const { get } = await import('svelte/store');
  resetStoredQuotaState();
  delete globalThis.localStorage;
  const store = await import(`../src/CE_Application/stores/recentFiles.js?t=${Math.random()}`);
  store.rememberRecentFile({ kind: 'panel', path: '/p/A', name: 'A' });
  assert.deepEqual(get(store.recentFiles).map((e) => e.name), ['A']);
});
