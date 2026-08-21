import test from 'node:test';
import assert from 'node:assert/strict';

import { isEditableTarget, resolveGlobalShortcut } from '../src/CE_Application/utils/globalShortcuts.js';

const key = (k, { ctrl = false, shift = false, meta = false } = {}) =>
  ({ key: k, ctrlKey: ctrl, shiftKey: shift, metaKey: meta });

test('application chords resolve regardless of editable target', () => {
  for (const editableTarget of [false, true]) {
    const opts = { editableTarget };
    assert.equal(resolveGlobalShortcut(key('s', { ctrl: true }), opts), 'save');
    assert.equal(resolveGlobalShortcut(key('S', { ctrl: true, shift: true }), opts), 'save-as');
    assert.equal(resolveGlobalShortcut(key('n', { ctrl: true }), opts), 'new-panel');
    assert.equal(resolveGlobalShortcut(key('o', { ctrl: true }), opts), 'open-panel');
    assert.equal(resolveGlobalShortcut(key('w', { ctrl: true }), opts), 'close-tab');
    assert.equal(resolveGlobalShortcut(key(',', { ctrl: true }), opts), 'open-settings');
    assert.equal(resolveGlobalShortcut(key('F1'), opts), 'toggle-shortcuts');
  }
});

test('meta works as the modifier for application chords (macOS)', () => {
  assert.equal(resolveGlobalShortcut(key('s', { meta: true }), { editableTarget: false }), 'save');
});

test('document chords are suppressed while typing', () => {
  const typing = { editableTarget: true };
  assert.equal(resolveGlobalShortcut(key('z', { ctrl: true }), typing), null);
  assert.equal(resolveGlobalShortcut(key('y', { ctrl: true }), typing), null);
  assert.equal(resolveGlobalShortcut(key('z', { ctrl: true, shift: true }), typing), null);
  assert.equal(resolveGlobalShortcut(key('p', { ctrl: true, shift: true }), typing), null);
});

test('document chords resolve outside editable targets', () => {
  const idle = { editableTarget: false };
  assert.equal(resolveGlobalShortcut(key('z', { ctrl: true }), idle), 'undo');
  assert.equal(resolveGlobalShortcut(key('y', { ctrl: true }), idle), 'redo');
  assert.equal(resolveGlobalShortcut(key('z', { ctrl: true, shift: true }), idle), 'redo');
  assert.equal(resolveGlobalShortcut(key('Z', { ctrl: true, shift: true }), idle), 'redo');
  assert.equal(resolveGlobalShortcut(key('P', { ctrl: true, shift: true }), idle), 'zoom-to-selection');
});

test('bare letters and unmodified keys resolve to nothing', () => {
  const idle = { editableTarget: false };
  assert.equal(resolveGlobalShortcut(key('s'), idle), null);
  assert.equal(resolveGlobalShortcut(key('z'), idle), null);
  assert.equal(resolveGlobalShortcut(key('Delete'), idle), null);
});

test('isEditableTarget recognises form fields and contenteditable', () => {
  assert.equal(isEditableTarget({ tagName: 'INPUT' }), true);
  assert.equal(isEditableTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditableTarget({ tagName: 'SELECT' }), true);
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: false }), false);
  assert.equal(isEditableTarget(null), false);
});
