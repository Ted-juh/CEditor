// The palette library is persisted, and it has to arrive carrying whatever the
// old single anonymous swatch bag held — nobody's 24 collected colours should
// disappear behind the new UI. The store reads its seed at import time, so
// each case installs its storage and then imports a fresh copy of the module.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { resetStoredQuotaState } from '../src/CE_Application/utils/localStorageState.js';

const STORAGE_KEY = 'ce.palettes.v1';
const LEGACY_KEY = 'ce.displayPanel.swatches';

let moduleCounter = 0;

/** A localStorage seeded with `initial`, plus a fresh import of the store. */
async function freshStore(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
  resetStoredQuotaState();
  moduleCounter += 1;
  const store = await import(`../src/CE_Application/stores/palettes.js?case=${moduleCounter}`);
  const stored = () => (map.has(STORAGE_KEY) ? JSON.parse(map.get(STORAGE_KEY)) : null);
  return { ...store, stored };
}

test('an existing swatch bag becomes the first named palette', async () => {
  const legacy = Array(24).fill(null);
  legacy[0] = 'FF0000';
  legacy[5] = '00FF00';

  const { paletteLibrary, getActivePalette } = await freshStore({ [LEGACY_KEY]: legacy });
  const lib = get(paletteLibrary);
  assert.equal(lib.palettes.length, 1);
  assert.equal(getActivePalette().colors[0], 'FF0000');
  assert.equal(getActivePalette().colors[5], '00FF00');
  assert.equal(getActivePalette().name, 'Palette');
});

test('a saved library wins over the legacy bag', async () => {
  const { getActivePalette } = await freshStore({
    [LEGACY_KEY]: ['FF0000'],
    [STORAGE_KEY]: { activeId: 'b', palettes: [
      { id: 'a', name: 'Greys', colors: ['111111'] },
      { id: 'b', name: 'Brand', colors: ['ABCDEF'] },
    ] },
  });
  assert.equal(getActivePalette().name, 'Brand');
  assert.equal(getActivePalette().colors[0], 'ABCDEF');
});

test('with nothing stored there is still exactly one palette to show', async () => {
  const { paletteLibrary } = await freshStore();
  const lib = get(paletteLibrary);
  assert.equal(lib.palettes.length, 1);
  assert.ok(lib.palettes[0].colors.every((c) => c === null));
});

test('creating, renaming, selecting and deleting all persist', async () => {
  const { paletteLibrary, newPalette, renameActivePalette, selectPalette, removePalette, stored } = await freshStore();
  const firstId = get(paletteLibrary).activeId;

  newPalette('Palette');
  renameActivePalette('Brand');
  assert.equal(stored().palettes[1].name, 'Brand');
  assert.equal(stored().activeId, get(paletteLibrary).activeId);

  selectPalette(firstId);
  assert.equal(stored().activeId, firstId);

  removePalette(firstId);
  assert.equal(stored().palettes.length, 1);
  assert.equal(stored().palettes[0].name, 'Brand');
});

test('saveActiveColors writes the working copy back, and skips a no-op', async () => {
  const { saveActiveColors, getActivePalette, stored } = await freshStore();

  const colors = Array(24).fill(null);
  colors[3] = 'ABCDEF';
  saveActiveColors(colors);
  assert.equal(getActivePalette().colors[3], 'ABCDEF');
  assert.equal(stored().palettes[0].colors[3], 'ABCDEF');

  const before = getActivePalette();
  saveActiveColors([...colors]);
  assert.equal(getActivePalette(), before, 'an unchanged save does not churn the store');
});

test('switching palettes does not leak one palette\'s colours into another', async () => {
  const { newPalette, selectPalette, saveActiveColors, paletteLibrary, getActivePalette } = await freshStore();
  const firstId = get(paletteLibrary).activeId;

  const reds = Array(24).fill(null);
  reds[0] = 'FF0000';
  saveActiveColors(reds);

  newPalette('Second');
  assert.equal(getActivePalette().colors[0], null);

  const blues = Array(24).fill(null);
  blues[0] = '0000FF';
  saveActiveColors(blues);

  selectPalette(firstId);
  assert.equal(getActivePalette().colors[0], 'FF0000');
});
