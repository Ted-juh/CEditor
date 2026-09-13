// enumBehavior.test.js — the option list under a Cyclic Button, a Combobox and a Radio group.
//
// Written during the release QA pass because the module had no test file and backs the three
// component families the coverage ledger puts lowest. Nothing here is a regression: the module was
// probed adversarially and held. These pin the invariants a caller actually depends on, so the next
// edit has to keep them.
//
// The case worth naming is the one that looked most likely to be broken and is not: a selection
// whose option has since been DELETED. `resolveEnumDefaultValue` falls back to the first member
// rather than returning a token nothing matches, so a control cannot end up pointing at an option
// that no longer exists.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEnumValues, resolveEnumDefaultValue, getEnumNormalizedValue, getNextEnumValue,
} from '../src/CE_Application/utils/enumBehavior.js';

const LISTS = {
  normal: ['a', 'b', 'c'],
  dupes: ['a', 'a', 'a'],
  blanks: ['', '   ', 'x'],
  mixed: ['a', { value: 'b' }, null, undefined, 3],
  spacey: ['  a  ', 'a', 'b'],
  huge: Array.from({ length: 500 }, (_, index) => `opt${index}`),
};

test('normalising trims, drops blanks and de-duplicates', () => {
  for (const [name, values] of Object.entries(LISTS)) {
    const normalized = normalizeEnumValues(values);
    assert.equal(new Set(normalized).size, normalized.length, `${name} kept a duplicate`);
    assert.ok(!normalized.includes(''), `${name} kept a blank`);
    assert.ok(normalized.every((v) => typeof v === 'string'), `${name} kept a non-string`);
  }
  assert.deepEqual(normalizeEnumValues(['  a  ', 'a', 'b']), ['a', 'b'], 'trimming happens before de-duplication');
  assert.deepEqual(normalizeEnumValues(null), []);
  assert.deepEqual(normalizeEnumValues('not an array'), []);
});

test('a selection whose option was deleted resolves to a real member', () => {
  // The interaction this module exists to get right: the options list is edited in the properties
  // panel, the control's stored value is not, and the two must not be allowed to disagree.
  for (const [name, values] of Object.entries(LISTS)) {
    const members = normalizeEnumValues(values);
    for (const stale of ['zzz-deleted', '', null, undefined, 0, '  a  ']) {
      const resolved = resolveEnumDefaultValue(values, stale);
      assert.ok(members.includes(resolved), `${name} + ${String(stale)} -> "${resolved}" is not a member`);
    }
  }
  assert.equal(resolveEnumDefaultValue([], 'anything'), '', 'an empty list has no member to fall back to');
});

test('the normalised position is always a finite 0..1', () => {
  for (const [name, values] of Object.entries(LISTS)) {
    for (const current of ['zzz-deleted', '', null, undefined, 0, 'a']) {
      const position = getEnumNormalizedValue(values, current);
      assert.ok(Number.isFinite(position) && position >= 0 && position <= 1,
        `${name} + ${String(current)} -> ${position}`);
    }
  }
  assert.equal(getEnumNormalizedValue([], 'a'), 0, 'no options is the bottom of the range');
  // Deliberate, and worth pinning because it reads as surprising: ONE option is the top, not the
  // bottom. A single-choice control is fully at its only setting.
  assert.equal(getEnumNormalizedValue(['only'], 'only'), 1);
  assert.equal(getEnumNormalizedValue(['a', 'b', 'c'], 'b'), 0.5);
});

test('cycling with wrap visits every option once and returns to the first', () => {
  for (const [name, values] of Object.entries(LISTS)) {
    const members = normalizeEnumValues(values);
    if (members.length < 2) continue;
    let current = members[0];
    const path = [current];
    for (let i = 0; i < members.length; i += 1) {
      current = getNextEnumValue(values, current, true);
      assert.ok(members.includes(current), `${name}: stepped onto "${current}", not a member`);
      path.push(current);
    }
    assert.equal(new Set(path.slice(0, -1)).size, members.length, `${name} skipped an option`);
    assert.equal(path[path.length - 1], members[0], `${name} did not wrap back to the first`);
  }
});

test('without wrap the last option is the end of the line', () => {
  for (const [name, values] of Object.entries(LISTS)) {
    const members = normalizeEnumValues(values);
    if (!members.length) continue;
    const last = members[members.length - 1];
    assert.equal(getNextEnumValue(values, last, false), last, `${name} ran off the end`);
  }
  assert.equal(getNextEnumValue([], 'a', true), '', 'an empty list has nowhere to step');
});
