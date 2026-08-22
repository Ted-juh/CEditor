// recentFileActions.test.js — re-opening a recent entry, and what happens when it is gone.
//
// Review finding D6 wants Recent Files; finding D3 is the same menu shipping items that looked
// live and were not. A recent entry whose subject has been deleted is exactly that item, so the
// interesting case here is the stale one: it must not fail silently, and it must not still be in
// the list afterwards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { openRecentFile } from '../src/CE_Application/stores/recentFileActions.js';
import { recentFiles, rememberRecentFile } from '../src/CE_Application/stores/recentFiles.js';

const originalAlert = globalThis.window?.alert;

test.beforeEach(() => {
  recentFiles.set([]);
  globalThis.window = globalThis.window ?? {};
  globalThis.window.alert = () => {};
});

test.afterEach(() => {
  if (globalThis.window) globalThis.window.alert = originalAlert;
  recentFiles.set([]);
});

test('a path-backed entry is opened without a file dialog', () => {
  // Skipping the dialog is the whole point of a recent list. With no JUCE backend attached the
  // bridge call is a no-op, but the routing decision — "this is openable, do not discard it" — is
  // what this asserts.
  assert.equal(openRecentFile({ kind: 'panel', path: 'C:/Panels/Kit.cepanel' }), true);
  assert.equal(openRecentFile({ kind: 'script', path: 'C:/Scripts/Boot.cescript.json' }), true);
});

test('an entry whose subject is gone says so and removes itself from the list', () => {
  rememberRecentFile({ kind: 'component', id: 'deleted-package', name: 'Deleted Package' });
  assert.equal(get(recentFiles).length, 1);

  let told = '';
  globalThis.window.alert = (message) => { told = message; };

  assert.equal(openRecentFile({ kind: 'component', id: 'deleted-package', name: 'Deleted Package' }), false);
  assert.match(told, /Deleted Package/);
  assert.match(told, /no longer available/);
  assert.deepEqual(get(recentFiles), [], 'the dead row is gone, not left to be clicked again');
});

test('a path-less panel entry is treated as stale rather than opened blindly', () => {
  assert.equal(openRecentFile({ kind: 'panel', name: 'No Path' }), false);
  assert.equal(openRecentFile(null), false);
});
