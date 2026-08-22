// menuNavigation.test.js — the keyboard and access-key rules behind the menu bar.
//
// Review finding D3, last clause: "No mnemonics, no Escape-to-close, no ARIA." Escape landed
// earlier; this covers the access keys and the roving focus. The two rules most easily broken by
// a later "tidy-up" are pinned here on purpose: arrow keys must stop on disabled rows (otherwise
// a screen-reader user is never told the command exists), and must never stop on the Insert
// menu's category headers (otherwise crossing it costs a dozen extra presses).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assignMnemonics, firstFocusableIndex, isFocusableMenuRow, lastFocusableIndex,
  matchMnemonicIndex, nextFocusableIndex, splitLabelForMnemonic, stepMenuName,
} from '../src/CE_Application/utils/menuNavigation.js';

const items = [
  { label: 'Undo' },
  { label: 'Redo' },
  { type: 'separator' },
  { type: 'header', label: 'Arrange' },
  { label: 'Bring to Front' },
  { label: 'Send to Back' },
];

test('separators and headers are not keyboard rows; commands are', () => {
  assert.deepEqual(items.map(isFocusableMenuRow), [true, true, false, false, true, true]);
});

test('the first and last rows skip the furniture at either end', () => {
  assert.equal(firstFocusableIndex([{ type: 'header', label: 'H' }, { label: 'A' }]), 1);
  assert.equal(lastFocusableIndex([{ label: 'A' }, { type: 'separator' }]), 0);
  assert.equal(firstFocusableIndex([{ type: 'separator' }]), -1);
});

test('Down from nothing focused lands on the first row, Up on the last', () => {
  assert.equal(nextFocusableIndex(items, -1, 1), 0);
  assert.equal(nextFocusableIndex(items, -1, -1), 5);
});

test('arrows step over the separator and the header in one press', () => {
  assert.equal(nextFocusableIndex(items, 1, 1), 4);
  assert.equal(nextFocusableIndex(items, 4, -1), 1);
});

test('arrows wrap at both ends', () => {
  assert.equal(nextFocusableIndex(items, 5, 1), 0);
  assert.equal(nextFocusableIndex(items, 0, -1), 5);
});

test('a disabled row still takes focus — hiding it would hide the command', () => {
  const withDisabled = [{ label: 'Cut', disabled: true }, { label: 'Copy' }];
  assert.equal(nextFocusableIndex(withDisabled, -1, 1), 0);
});

test('access keys inside one menu are unique, and prefer word starts', () => {
  const keys = assignMnemonics(['Save', 'Save As...', 'Select All', 'Settings...']);
  assert.deepEqual(keys.map((k) => k.key), ['s', 'a', 'e', 't']);
  assert.equal(new Set(keys.map((k) => k.key)).size, 4);
  // "Save As..." could not have 's', so it takes the start of the second word rather than a
  // letter buried inside the first.
  assert.equal(keys[1].index, 'Save '.length);
});

test('rows with no letters left get no key rather than a duplicate one', () => {
  const keys = assignMnemonics(['a', 'a', 'a']);
  assert.deepEqual(keys.map((k) => k?.key ?? null), ['a', null, null]);
});

test('non-rows (separators, headers) are passed through as null and take no letter', () => {
  const keys = assignMnemonics(['Undo', null, 'Up']);
  assert.equal(keys[1], null);
  assert.equal(keys[0].key, 'u');
  assert.equal(keys[2].key, 'p', 'the header did not eat a letter');
});

test('the label splits around exactly one character so only that one is underlined', () => {
  const parts = splitLabelForMnemonic('Save As...', { key: 'a', index: 5 });
  assert.deepEqual(parts, { before: 'Save ', letter: 'A', after: 's...' });
  assert.deepEqual(splitLabelForMnemonic('Save', null), { before: 'Save', letter: '', after: '' });
});

test('type-ahead cycles rather than sticking on the first match', () => {
  const rows = [{ label: 'Grid' }, { label: 'Group' }, { label: 'Guides' }];
  const keys = [{ key: 'g', index: 0 }, { key: 'g', index: 0 }, { key: 'g', index: 0 }];
  assert.equal(matchMnemonicIndex(rows, keys, 'g', -1), 0);
  assert.equal(matchMnemonicIndex(rows, keys, 'g', 0), 1);
  assert.equal(matchMnemonicIndex(rows, keys, 'g', 2), 0, 'wraps');
  assert.equal(matchMnemonicIndex(rows, keys, 'z', -1), -1);
});

test('type-ahead never lands on a header even if its caption starts with the letter', () => {
  const rows = [{ type: 'header', label: 'Grid' }, { label: 'Group' }];
  const keys = [{ key: 'g', index: 0 }, { key: 'g', index: 0 }];
  assert.equal(matchMnemonicIndex(rows, keys, 'g', -1), 1);
});

test('left and right walk the menu bar itself, wrapping', () => {
  const names = ['File', 'Edit', 'View'];
  assert.equal(stepMenuName(names, 'File', 1), 'Edit');
  assert.equal(stepMenuName(names, 'View', 1), 'File');
  assert.equal(stepMenuName(names, 'File', -1), 'View');
  assert.equal(stepMenuName(names, 'Nope', 1), 'File');
  assert.equal(stepMenuName([], 'File', 1), null);
});
