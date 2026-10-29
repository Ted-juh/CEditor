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

// The import screen said "Imported 4" for a file of four packages whatever the library then held;
// on a Windows install the library stayed empty under that message. importEnvelopes counts what the
// library holds afterwards and names each package it did not keep, and why.
test('importing several says what the library kept, and why it refused the rest', async () => {
  storage();
  await withIndexedDb();
  const library = await freshLibrary();
  const broken = { format: envelopeFor('X').format, metadata: { name: 'Broken Knob' }, component: { _children: {} } };
  Object.defineProperty(broken.component._children, 'Core', { enumerable: true, get() { throw new Error('unreadable core'); } });
  const notAPackage = { metadata: { name: 'Not A Package' } };

  const { imported, failures } = library.importEnvelopes([envelopeFor('Good One'), broken, notAPackage, envelopeFor('Good Two')]);
  assert.deepEqual(imported.map((entry) => entry.name), ['Good One', 'Good Two']);
  assert.deepEqual(get(library).map((entry) => entry.name).sort(), ['Good One', 'Good Two']);
  assert.deepEqual(failures.map((failure) => failure.name), ['Broken Knob', 'Not A Package']);
  assert.match(failures[0].reason, /unreadable core/);
  assert.match(failures[1].reason, /not a component package/);

  // The SH-201 library file, as the import screen reads it: all four kept.
  const { readFileSync } = await import('node:fs');
  const { normalizeCustomComponentLibraryEnvelope } = await import('../src/CE_Application/utils/customComponentPackage.js');
  const file = normalizeCustomComponentLibraryEnvelope(JSON.parse(readFileSync(new URL('../../panels/Roland SH-201 components.json', import.meta.url), 'utf8')));
  const sh201 = library.importEnvelopes(file.packages);
  assert.deepEqual([sh201.imported.length, sh201.failures], [4, []]);
});
