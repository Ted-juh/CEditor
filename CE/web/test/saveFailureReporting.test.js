// A save that failed must not look like a save that worked.
//
// The backend used to drop the result of its write and always emit `panelSaved` /
// `scriptWorkspaceSaved`. The editor believed it: the dirty dot cleared, history took that state
// as the saved one, the unsaved-session snapshot stopped carrying the panel, and closing the tab
// asked nothing. A read-only file or a full disk therefore lost the work with no message at any
// point — the only save failure the user could ever see was the one on the package path, which
// already reported `ok`.
//
// These tests pin the two halves of the rule: a failure changes nothing except to say so, and a
// payload with no `ok` at all still counts as a success, because that is what an older backend
// sends.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, applyPanelSavedPayload } from '../src/CE_Application/stores/panels.js';
import {
  scriptDocuments,
  applyScriptWorkspaceSavedPayload,
} from '../src/CE_Application/stores/scriptWorkspace.js';
import { scriptNotifications } from '../src/CE_Application/stores/scriptUi.js';
import { recentFiles } from '../src/CE_Application/stores/recentFiles.js';

const PANEL_ID = 4242;

function seedPanel(overrides = {}) {
  panels.set([{
    id: PANEL_ID,
    name: 'Rehearsal',
    filePath: 'C:\\panels\\Rehearsal.cepanel',
    modified: true,
    controls: [],
    scripts: [],
    ...overrides,
  }]);
  scriptNotifications.set([]);
  return () => get(panels).find((panel) => panel.id === PANEL_ID);
}

function seedWorkspace() {
  scriptDocuments.set([{
    id: 'doc-1',
    name: 'Takeover',
    filePath: 'C:\\scripts\\Takeover.cescript.json',
    modified: true,
    scripts: [],
    recentFiles: [],
  }]);
  scriptNotifications.set([]);
  return () => get(scriptDocuments).find((document) => document.id === 'doc-1');
}

test('a failed panel save leaves the panel modified, at its old path, and says so', () => {
  const panel = seedPanel();

  const counted = applyPanelSavedPayload({
    panelId: String(PANEL_ID),
    filePath: 'D:\\read-only\\Rehearsal.cepanel',
    name: 'Rehearsal',
    ok: false,
  });

  assert.equal(counted, false, 'the save did not count');
  assert.equal(panel().modified, true, 'the panel is still unsaved work');
  assert.equal(panel().filePath, 'C:\\panels\\Rehearsal.cepanel', 'and still lives where it did');

  const notice = get(scriptNotifications).at(-1);
  assert.equal(notice?.kind, 'error', 'the failure is reported to the user');
  assert.match(notice?.message ?? '', /could not save/i);
  assert.equal(notice?.expiresAt, null, 'and does not time out before it is read');

  assert.ok(
    !get(recentFiles).some((entry) => entry.path === 'D:\\read-only\\Rehearsal.cepanel'),
    'a file that was never written does not reach Open Recent',
  );
});

test('a successful panel save clears the modified flag and adopts the path', () => {
  const panel = seedPanel();

  const counted = applyPanelSavedPayload({
    panelId: String(PANEL_ID),
    filePath: 'C:\\panels\\Rehearsal 2.cepanel',
    name: 'Rehearsal 2',
    ok: true,
  });

  assert.equal(counted, true);
  assert.equal(panel().modified, false);
  assert.equal(panel().filePath, 'C:\\panels\\Rehearsal 2.cepanel');
  assert.equal(panel().name, 'Rehearsal 2');
});

test('a payload with no ok field is still a success', () => {
  const panel = seedPanel();

  // An older backend sends exactly this. Treating a missing flag as a failure would turn every
  // save into a scary notice on a build where nothing is wrong.
  assert.equal(applyPanelSavedPayload({
    panelId: String(PANEL_ID),
    filePath: 'C:\\panels\\Rehearsal.cepanel',
  }), true);
  assert.equal(panel().modified, false);
  assert.equal(get(scriptNotifications).length, 0, 'and says nothing');
});

test('a failed script workspace save leaves the document modified', () => {
  const document = seedWorkspace();

  const counted = applyScriptWorkspaceSavedPayload({
    documentId: 'doc-1',
    filePath: 'D:\\read-only\\Takeover.cescript.json',
    name: 'Takeover',
    ok: false,
  });

  assert.equal(counted, false);
  assert.equal(document().modified, true, 'the workspace is still unsaved work');
  assert.equal(document().filePath, 'C:\\scripts\\Takeover.cescript.json', 'at its old path');
  assert.equal(get(scriptNotifications).at(-1)?.kind, 'error', 'and the failure is reported');
});

test('a successful script workspace save marks it saved', () => {
  const document = seedWorkspace();

  assert.equal(applyScriptWorkspaceSavedPayload({
    documentId: 'doc-1',
    filePath: 'C:\\scripts\\Takeover.cescript.json',
    name: 'Takeover',
    ok: true,
  }), true);
  assert.equal(document().modified, false);
});
