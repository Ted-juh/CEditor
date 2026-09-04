import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
