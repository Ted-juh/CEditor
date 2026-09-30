import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { PANEL_TEMPLATES, PANEL_SIZE_PRESETS, buildPanelFromTemplate } from '../src/CE_Application/models/panelTemplates.js';
import {
  clearUnsavedSessionSnapshot, persistUnsavedSessionSnapshot, readUnsavedSession, settleUnsavedSessionWrites,
} from '../src/CE_Application/stores/panelSessionPersistence.js';
import { resetStoredQuotaState } from '../src/CE_Application/utils/localStorageState.js';
import { readRecord, resetBrowserDatabaseForTests } from '../src/CE_Application/utils/browserDatabase.js';

function storage(limit = 5 * 1024 * 1024) {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
    setItem(key, value) {
      if (value.length > limit) throw Object.assign(new Error('Storage full'), { name: 'QuotaExceededError' });
      values.set(key, value);
    },
  };
  return values;
}

async function withIndexedDb() {
  await resetBrowserDatabaseForTests();
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
}

async function withoutIndexedDb() {
  await resetBrowserDatabaseForTests();
  delete globalThis.indexedDB;
  delete globalThis.IDBKeyRange;
}

const ON = { autosaveEnabled: true, restoreUnsavedWork: true };

test.beforeEach(resetStoredQuotaState);
test.afterEach(async () => {
  await settleUnsavedSessionWrites();
  delete globalThis.localStorage;
  await withoutIndexedDb();
});

// --- Without IndexedDB: the localStorage path, unchanged ------------------------------------------

test('all twenty starter/size combinations recover losslessly within browser storage', async () => {
  await withoutIndexedDb();
  const values = storage();
  const panelList = PANEL_TEMPLATES.flatMap(t => PANEL_SIZE_PRESETS.map(s => buildPanelFromTemplate({ templateId:t.id, ...s })));
  assert.ok(JSON.stringify(panelList).length > 5 * 1024 * 1024, 'reproduces expanded-state storage overflow');
  const activeEditorTab = { type:'panel', id:panelList.at(-1).id };
  assert.equal(await persistUnsavedSessionSnapshot({ panelList, activeEditorTab, ...ON }), true);
  assert.ok(values.get('ce.unsavedPanels').length < 1024 * 1024);
  const read = await readUnsavedSession();
  assert.deepEqual(read.panels, panelList);
  assert.deepEqual(read.activeEditorTab, activeEditorTab);
});

test('older expanded session snapshots remain readable', async () => {
  await withoutIndexedDb();
  const values=storage();
  const panel=buildPanelFromTemplate({templateId:'synth'});
  values.set('ce.unsavedPanels',JSON.stringify([panel]));
  assert.deepEqual((await readUnsavedSession()).panels,[panel]);
});

test('failed recovery write reports failure and retains the previous snapshot and active tab', async () => {
  await withoutIndexedDb();
  storage(10000);
  const panelList=[buildPanelFromTemplate({templateId:'blank'})];
  const options={panelList,activeEditorTab:{type:'panel',id:panelList[0].id},...ON};
  assert.equal(await persistUnsavedSessionSnapshot(options),true);
  const previous=(await readUnsavedSession()).panels;
  panelList[0].notepad={notes:[{content:'x'.repeat(20000)}]};
  assert.equal(await persistUnsavedSessionSnapshot({...options,activeEditorTab:{type:'panel',id:999}}),false);
  const after = await readUnsavedSession();
  assert.deepEqual(after.panels,previous);
  assert.deepEqual(after.activeEditorTab,options.activeEditorTab);
});

// --- With IndexedDB --------------------------------------------------------------------------------

test('a snapshot far past the localStorage limit is kept in IndexedDB', async () => {
  await withIndexedDb();
  const values = storage(10000);
  const panel = buildPanelFromTemplate({ templateId: 'blank' });
  // An inline image the size of a real one: about 2 MB of base64, which localStorage would refuse.
  panel.bgImage = `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024)}`;
  const activeEditorTab = { type: 'panel', id: panel.id };
  assert.equal(await persistUnsavedSessionSnapshot({ panelList: [panel], activeEditorTab, ...ON }), true);
  assert.equal(values.has('ce.unsavedPanels'), false, 'nothing written to localStorage on an ordinary save');
  const read = await readUnsavedSession();
  assert.equal(read.panels.length, 1);
  assert.equal(read.panels[0].bgImage.length, panel.bgImage.length);
  assert.deepEqual(read.activeEditorTab, activeEditorTab);
});

test('a snapshot an older build left in localStorage is restored, then moved', async () => {
  await withIndexedDb();
  const values = storage();
  const legacy = buildPanelFromTemplate({ templateId: 'synth' });
  values.set('ce.unsavedPanels', JSON.stringify([legacy]));
  values.set('ce.unsavedActiveEditorTab', JSON.stringify({ type: 'panel', id: legacy.id }));

  const read = await readUnsavedSession();
  assert.deepEqual(read.panels, [legacy]);
  assert.deepEqual(read.activeEditorTab, { type: 'panel', id: legacy.id });

  // The next save goes to the database and frees the old keys.
  assert.equal(await persistUnsavedSessionSnapshot({ panelList: read.panels, activeEditorTab: read.activeEditorTab, ...ON }), true);
  assert.equal(values.has('ce.unsavedPanels'), false);
  assert.equal(values.has('ce.unsavedActiveEditorTab'), false);
  assert.ok(await readRecord('unsavedSession'));
});

test('on the way out a small snapshot is also written synchronously, and the newer copy wins', async () => {
  await withIndexedDb();
  const values = storage();
  const first = buildPanelFromTemplate({ templateId: 'blank' });
  first.name = 'first';
  assert.equal(await persistUnsavedSessionSnapshot({ panelList: [first], activeEditorTab: null, ...ON }), true);

  const second = { ...first, name: 'second' };
  const pending = persistUnsavedSessionSnapshot({ panelList: [second], activeEditorTab: null, ...ON, unloading: true });
  // Written before any await: this is the copy that survives the window closing mid-write.
  assert.match(values.get('ce.unsavedPanels'), /"second"/);
  await pending;
  assert.equal((await readUnsavedSession()).panels[0].name, 'second');

  // Had the database write been lost, the synchronous copy is newer than the record and wins.
  values.set('ce.unsavedSavedAt', JSON.stringify(Date.now() + 60_000));
  values.set('ce.unsavedPanels', JSON.stringify([{ ...first, name: 'from localStorage' }]));
  assert.equal((await readUnsavedSession()).panels[0].name, 'from localStorage');
});

test('a write asked for during the start-up read waits for it, so nothing is replaced unread', async () => {
  await withIndexedDb();
  storage();
  const kept = buildPanelFromTemplate({ templateId: 'blank' });
  kept.name = 'unsaved work';
  assert.equal(await persistUnsavedSessionSnapshot({ panelList: [kept], activeEditorTab: null, ...ON }), true);

  const reading = readUnsavedSession();
  // An empty panel list clears the snapshot — the one write that would lose work if it won the race.
  const clearing = persistUnsavedSessionSnapshot({ panelList: [], activeEditorTab: null, ...ON });
  assert.equal((await reading).panels[0]?.name, 'unsaved work');
  await clearing;
  assert.deepEqual((await readUnsavedSession()).panels, []);
});

test('clearing removes both copies', async () => {
  await withIndexedDb();
  const values = storage();
  const panel = buildPanelFromTemplate({ templateId: 'blank' });
  await persistUnsavedSessionSnapshot({ panelList: [panel], activeEditorTab: null, ...ON, unloading: true });
  await clearUnsavedSessionSnapshot();
  assert.equal(values.has('ce.unsavedPanels'), false);
  assert.equal(await readRecord('unsavedSession'), null);
  assert.deepEqual((await readUnsavedSession()).panels, []);
});
