// customComponentLibraryStorage.test.js — the component library's move from localStorage to IndexedDB.
//
// The library store is a module singleton that reads its storage when it is created, so each case
// imports a fresh copy of the module after setting up the storage it should find.
import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readRecord, resetBrowserDatabaseForTests } from '../src/CE_Application/utils/browserDatabase.js';
import { createCustomComponentExportEnvelope } from '../src/CE_Application/utils/customComponentPackage.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

let copy = 0;
async function freshLibrary() {
  copy += 1;
  const module = await import(`../src/CE_Application/stores/customComponentLibrary.js?copy=${copy}`);
  await module.customComponentLibrary.ready();
  return module.customComponentLibrary;
}

function storage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  return values;
}

async function withIndexedDb() {
  await resetBrowserDatabaseForTests();
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
}

test.afterEach(async () => {
  await resetBrowserDatabaseForTests();
  delete globalThis.indexedDB;
  delete globalThis.IDBKeyRange;
  delete globalThis.localStorage;
});

const envelopeFor = (name) => createCustomComponentExportEnvelope(
  createControl('Knob', { Core: { id: `k_${name}`, name } }), { name },
);

test('a library an older build left in localStorage is shown, then moved to the database', async () => {
  const values = storage();
  await withIndexedDb();
  values.set('ce.customComponentLibrary.v1', JSON.stringify([envelopeFor('Legacy Knob')]));

  const library = await freshLibrary();
  assert.deepEqual(get(library).map((entry) => entry.name), ['Legacy Knob']);
  assert.equal(values.has('ce.customComponentLibrary.v1'), false, 'the old key is freed');
  assert.equal((await readRecord('componentLibrary')).length, 1);
});

test('saves go to the database, in order, and survive a restart', async () => {
  const values = storage();
  await withIndexedDb();
  const library = await freshLibrary();
  library.importEnvelope(envelopeFor('One'));
  library.importEnvelope(envelopeFor('Two'));
  await library.settled();
  assert.equal(values.has('ce.customComponentLibrary.v1'), false);

  const reopened = await freshLibrary();
  assert.deepEqual(get(reopened).map((entry) => entry.name), ['Two', 'One'], 'most recent first');
});

test('without IndexedDB the library stays in localStorage, as before', async () => {
  const values = storage();
  const library = await freshLibrary();
  library.importEnvelope(envelopeFor('Only'));
  assert.ok(values.get('ce.customComponentLibrary.v1').includes('Only'));
});
