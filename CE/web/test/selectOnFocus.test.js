// Which fields select all their text on focus (utils/selectOnFocus.js): text-like inputs that
// are editable, unless they opt out. The browser behaviour itself is in browser-checks/hostWorkspace.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectsOnFocus } from '../src/CE_Application/utils/selectOnFocus.js';

const input = (type, extra = {}) => ({ tagName: 'INPUT', dataset: {}, readOnly: false, disabled: false,
  getAttribute: (name) => (name === 'type' ? type : null), ...extra });

test('text-like inputs select on focus; others and opted-out ones do not', () => {
  for (const type of ['text', 'search', 'number', 'url', null]) assert.equal(selectsOnFocus(input(type)), true, String(type));
  for (const type of ['checkbox', 'range', 'color', 'file']) assert.equal(selectsOnFocus(input(type)), false, type);
  assert.equal(selectsOnFocus(input('text', { readOnly: true })), false, 'read-only fields keep their caret');
  assert.equal(selectsOnFocus(input('text', { dataset: { keepCaret: '' } })), false, 'data-keep-caret opts out');
  assert.equal(selectsOnFocus({ tagName: 'TEXTAREA', dataset: {} }), false, 'long text areas are edited in the middle');
  assert.equal(selectsOnFocus(null), false);
});
