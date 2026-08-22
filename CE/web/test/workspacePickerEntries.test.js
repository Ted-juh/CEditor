// workspacePickerEntries.test.js — one set of rows for "open a saved thing".
//
// Review finding D6, last clause: "'Open Saved Custom Component' still opens `library[0]` with no
// picker while TabBar's equivalent shows a real picker." Two implementations of one question is
// how they drifted apart, so the rows and the one-entry shortcut are shared. These tests pin the
// shortcut's boundaries in particular: with one saved package the picker is a dialog whose only
// purpose is to be dismissed, but with none it must still open, because the empty state is the
// only thing that explains why nothing happened.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  componentPickerEntries, deviceProfilePickerEntries, shouldOpenDirectly,
} from '../src/CE_Application/utils/workspacePickerEntries.js';

test('component rows carry a name, a version and a category', () => {
  const rows = componentPickerEntries([
    { id: 'a', name: 'Big Knob', version: '2.1.0', category: 'knobs' },
    { id: 'b' },
  ]);
  assert.deepEqual(rows[0], {
    key: 'a', title: 'Big Knob', subtitle: '2.1.0 · knobs', entry: { id: 'a', name: 'Big Knob', version: '2.1.0', category: 'knobs' },
  });
  // A package saved before those fields existed still gets a readable row rather than "undefined".
  assert.equal(rows[1].title, 'b');
  assert.equal(rows[1].subtitle, '1.0.0 · custom');
});

test('device rows fall back the same way', () => {
  const rows = deviceProfilePickerEntries([{ id: 'p1' }, { id: 'p2', name: 'JD-Xi', manufacturer: 'Roland', status: 'verified' }]);
  assert.equal(rows[0].title, 'p1');
  assert.equal(rows[0].subtitle, 'device · profile');
  assert.equal(rows[1].subtitle, 'Roland · verified');
});

test('a missing or empty library yields no rows rather than throwing', () => {
  assert.deepEqual(componentPickerEntries(null), []);
  assert.deepEqual(deviceProfilePickerEntries(undefined), []);
});

test('exactly one saved thing opens straight away; none or many show the picker', () => {
  assert.equal(shouldOpenDirectly([{ key: 'a' }]), true);
  assert.equal(shouldOpenDirectly([]), false, 'the empty state has to be shown');
  assert.equal(shouldOpenDirectly([{ key: 'a' }, { key: 'b' }]), false, 'choosing for the user is the bug');
  assert.equal(shouldOpenDirectly(null), false);
});
