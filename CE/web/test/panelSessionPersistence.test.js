import test from 'node:test';
import assert from 'node:assert/strict';
import { PANEL_TEMPLATES, PANEL_SIZE_PRESETS, buildPanelFromTemplate } from '../src/CE_Application/models/panelTemplates.js';
import { persistUnsavedSessionSnapshot, readUnsavedSessionSnapshot, readUnsavedActiveEditorTab } from '../src/CE_Application/stores/panelSessionPersistence.js';
import { resetStoredQuotaState } from '../src/CE_Application/utils/localStorageState.js';

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
test.beforeEach(resetStoredQuotaState);
test.afterEach(() => { delete globalThis.localStorage; });

test('all twenty starter/size combinations recover losslessly within browser storage', () => {
  const values = storage();
  const panelList = PANEL_TEMPLATES.flatMap(t => PANEL_SIZE_PRESETS.map(s => buildPanelFromTemplate({ templateId:t.id, ...s })));
  assert.ok(JSON.stringify(panelList).length > 5 * 1024 * 1024, 'reproduces expanded-state storage overflow');
  const activeEditorTab = { type:'panel', id:panelList.at(-1).id };
  assert.equal(persistUnsavedSessionSnapshot({ panelList, activeEditorTab, autosaveEnabled:true, restoreUnsavedWork:true }), true);
  assert.ok(values.get('ce.unsavedPanels').length < 1024 * 1024);
  assert.deepEqual(readUnsavedSessionSnapshot(),panelList);
  assert.deepEqual(readUnsavedActiveEditorTab(),activeEditorTab);
});

test('older expanded session snapshots remain readable', () => {
  const values=storage();
  const panel=buildPanelFromTemplate({templateId:'synth'});
  values.set('ce.unsavedPanels',JSON.stringify([panel]));
  assert.deepEqual(readUnsavedSessionSnapshot(),[panel]);
});

test('failed recovery write reports failure and retains the previous snapshot and active tab', () => {
  storage(10000);
  const panelList=[buildPanelFromTemplate({templateId:'blank'})];
  const options={panelList,activeEditorTab:{type:'panel',id:panelList[0].id},autosaveEnabled:true,restoreUnsavedWork:true};
  assert.equal(persistUnsavedSessionSnapshot(options),true);
  const previous=readUnsavedSessionSnapshot();
  panelList[0].notepad={notes:[{content:'x'.repeat(20000)}]};
  assert.equal(persistUnsavedSessionSnapshot({...options,activeEditorTab:{type:'panel',id:999}}),false);
  assert.deepEqual(readUnsavedSessionSnapshot(),previous);
  assert.deepEqual(readUnsavedActiveEditorTab(),options.activeEditorTab);
});
