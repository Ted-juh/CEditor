import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HOST_UTILITIES,
  normaliseHostNavigation,
  restoreHostNavigation,
  storeHostNavigation,
  toggleHostUtility,
} from '../src/CE_Application/utils/hostNavigation.js';

test('host navigation accepts one known workspace and one known utility', () => {
  assert.deepEqual(normaliseHostNavigation({ workspace: 'mixer', utility: 'health' }), {
    workspace: 'mixer',
    utility: 'health',
  });
  assert.equal(normaliseHostNavigation({ workspace: 'layers' }).workspace, 'layers');
  assert.deepEqual(normaliseHostNavigation({ workspace: 'unknown', utility: 'everything' }), {
    workspace: 'rack',
    utility: '',
  });
});

test('selecting a utility swaps the drawer and selecting it again closes it', () => {
  assert.equal(toggleHostUtility('', 'library'), 'library');
  assert.equal(toggleHostUtility('library', 'health'), 'health');
  assert.equal(toggleHostUtility('health', 'health'), '');
});

test('host navigation survives a component remount', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  storeHostNavigation({ workspace: 'controller', utility: 'devices' }, storage);
  assert.deepEqual(restoreHostNavigation(storage), {
    workspace: 'controller',
    utility: 'devices',
  });
});

test('every tab the host draws is a utility the navigation will accept', () => {
  // The tab strip and this whitelist are two lists of the same thing, in two files. A tab added
  // to one and not the other looks correct - it draws, it highlights on click - and then opens
  // nothing at all, because toggleHostUtility answers '' for an id it does not know. That is
  // exactly how the Sounds drawer shipped dead, so the two lists are compared here instead.
  const view = readFileSync(new URL(
    '../src/CE_Application/sections/InstrumentHostView.svelte', import.meta.url), 'utf8');
  const block = view.match(/const hostUtilities = \[([\s\S]*?)\];/)?.[1];
  assert.ok(block, 'the host view must declare its utility tabs as one list');
  const drawn = [...block.matchAll(/id: '([^']+)'/g)].map((match) => match[1]);

  assert.ok(drawn.length >= 6, 'the audit must see the whole utility strip');
  assert.deepEqual(drawn.filter((id) => !HOST_UTILITIES.includes(id)), [],
    'a drawn tab with no entry in HOST_UTILITIES opens an empty drawer');
  assert.deepEqual(HOST_UTILITIES.filter((id) => !drawn.includes(id)), [],
    'a utility nothing draws is unreachable');
});

test('the Sounds dock is told which part is focused', () => {
  // SoundBrowser takes the focused part as a prop and every per-part action in it — save
  // this sound, load into the part, morph the part between two neighbours — is disabled with
  // "focus a part first" until it is handed one. Mounted bare, the drawer drew all of those
  // buttons and none of them worked, while a part sat focused in the rack beside it. The
  // component cannot know the difference between "nothing is focused" and "nobody told me",
  // so the mount site is checked here instead.
  const view = readFileSync(new URL(
    '../src/CE_Application/sections/InstrumentHostView.svelte', import.meta.url), 'utf8');
  const mounts = [...view.matchAll(/<SoundBrowser\b([^>]*)>/g)].map((match) => match[1]);
  assert.ok(mounts.length >= 1, 'the host view mounts the sound browser');
  for (const attributes of mounts) {
    assert.match(attributes, /\{focusedPart\}|focusedPart=/, 'the browser is handed the focused part');
    assert.match(attributes, /\{partTitle\}|partTitle=/, 'and the part naming rule');
  }
});

test('a remembered Sounds drawer migrates to the bottom dock', () => {
  assert.equal(normaliseHostNavigation({ utility: 'sounds' }).utility, '');
});
