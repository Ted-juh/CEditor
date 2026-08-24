// panelVisibility.test.js — the three dock toggles, now readable by the Window menu.
//
// Review finding D6: "There is no Window menu and View carries no panel toggles." The reason
// there could not be one is that `showTreePanel` / `showDisplayPanel` / `showPropertiesPanel`
// were `$state` locals inside App.svelte, so nothing outside it could show a checkmark or flip
// one. The storage keys must stay exactly the ones App.svelte already wrote, or every existing
// install loses its layout on upgrade — that is what the first test is for.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resetStoredQuotaState } from '../src/CE_Application/utils/localStorageState.js';

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
  return map;
}

async function freshModule(seed) {
  resetStoredQuotaState();
  fakeStorage(seed);
  return import(`../src/CE_Application/stores/panelVisibility.js?t=${Math.random()}`);
}

test.afterEach(() => { delete globalThis.localStorage; resetStoredQuotaState(); });

test('it reads the keys App.svelte already used, so an upgrade keeps the layout', async () => {
  const { get } = await import('svelte/store');
  const mod = await freshModule({
    'ce.ui.showTreePanel': 'false',
    'ce.ui.showDisplayPanel': 'true',
    'ce.ui.showPropertiesPanel': 'false',
  });
  assert.deepEqual(mod.PANEL_VISIBILITY_STORAGE_KEYS, {
    tree: 'ce.ui.showTreePanel',
    display: 'ce.ui.showDisplayPanel',
    properties: 'ce.ui.showPropertiesPanel',
  });
  assert.equal(get(mod.showTreePanel), false);
  assert.equal(get(mod.showDisplayPanel), true);
  assert.equal(get(mod.showPropertiesPanel), false);
});

test('the defaults are what the app shipped: tree and properties open, the dock closed', async () => {
  const { get } = await import('svelte/store');
  const mod = await freshModule();
  assert.deepEqual(
    [get(mod.showTreePanel), get(mod.showPropertiesPanel), get(mod.showDisplayPanel)],
    [true, true, false],
  );
});

test('toggling flips the store and persists, so the menu checkmark and the layout agree', async () => {
  const { get } = await import('svelte/store');
  const map = fakeStorage();
  resetStoredQuotaState();
  const mod = await import(`../src/CE_Application/stores/panelVisibility.js?t=${Math.random()}`);

  mod.togglePanelVisibility('display');
  assert.equal(get(mod.showDisplayPanel), true);
  assert.equal(map.get('ce.ui.showDisplayPanel'), 'true');

  mod.togglePanelVisibility('display');
  assert.equal(get(mod.showDisplayPanel), false);
  assert.equal(map.get('ce.ui.showDisplayPanel'), 'false');
});

test('a write from anywhere persists — the rail and the menu are both legitimate writers', async () => {
  const map = fakeStorage();
  resetStoredQuotaState();
  const mod = await import(`../src/CE_Application/stores/panelVisibility.js?t=${Math.random()}`);
  mod.setPanelVisibility('tree', false);
  assert.equal(map.get('ce.ui.showTreePanel'), 'false');
  mod.showTreePanel.set(true);
  assert.equal(map.get('ce.ui.showTreePanel'), 'true');
});

test('an unknown toggle name is a no-op rather than a crash in the menu', async () => {
  const { get } = await import('svelte/store');
  const mod = await freshModule();
  assert.equal(mod.panelVisibilityStore('nope'), null);
  mod.togglePanelVisibility('nope');
  mod.setPanelVisibility('nope', true);
  assert.equal(get(mod.showTreePanel), true);
});

test('the Window menu rows name all three toggles once each', async () => {
  const mod = await freshModule();
  assert.deepEqual(mod.PANEL_VISIBILITY_ITEMS.map((item) => item.id), ['tree', 'properties', 'display']);
  for (const item of mod.PANEL_VISIBILITY_ITEMS) {
    assert.ok(mod.panelVisibilityStore(item.id), `${item.id} has a store behind it`);
    assert.ok(item.label.length > 0);
  }
});
