import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEditorShortcutFocus,
  isSurfaceEditorShortcutAllowed,
} from '../src/CE_Application/utils/editorShortcutFocus.js';

function focused(tagName, ancestors = []) {
  return {
    tagName,
    closest(selector) {
      const normalizedTag = String(tagName).toLowerCase();
      if (selector.split(',').some((part) => part.trim().split(/[\[.:]/)[0] === normalizedTag)) return this;
      return ancestors.some((ancestor) => selector.includes(ancestor)) ? this : null;
    },
  };
}

test('canvas shortcuts stay on the canvas and component tree', () => {
  const global = { allowPageBody: true, allowTree: true };
  assert.equal(isEditorShortcutFocus(focused('BODY'), global), true);
  assert.equal(isEditorShortcutFocus(focused('DIV', ['.canvas-viewport']), global), true);
  assert.equal(isEditorShortcutFocus(focused('DIV', ['.tree-list']), global), true);
  assert.equal(isEditorShortcutFocus(focused('DIV', ['.tree-list'])), false);
  assert.equal(isEditorShortcutFocus(focused('BUTTON', ['.tree-list']), global), false);
  assert.equal(isEditorShortcutFocus(focused('DIV', ['.studio-rail']), global), false);
  assert.equal(isEditorShortcutFocus(focused('DIV', ['.tab-bar-area']), global), false);
});

test('focused surface buttons keep editing shortcuts but retain native activation and tabbing', () => {
  const button = focused('BUTTON');
  for (const key of ['Delete', 'Escape', 'ArrowLeft', 'r']) {
    assert.equal(isSurfaceEditorShortcutAllowed({ key, code: key, target: button }), true, key);
  }
  assert.equal(isSurfaceEditorShortcutAllowed({ key: 'Enter', code: 'Enter', target: button }), false);
  assert.equal(isSurfaceEditorShortcutAllowed({ key: ' ', code: 'Space', target: button }), false);
  assert.equal(isSurfaceEditorShortcutAllowed({ key: 'Tab', code: 'Tab', target: button }), false);
});

test('composite controls retain their navigation keys and text entry keeps every key', () => {
  const radio = focused('DIV', ['[role="radio"]']);
  assert.equal(isSurfaceEditorShortcutAllowed({ key: 'ArrowRight', code: 'ArrowRight', target: radio }), false);
  assert.equal(isSurfaceEditorShortcutAllowed({ key: 'Delete', code: 'Delete', target: radio }), true);

  const input = focused('INPUT');
  assert.equal(isSurfaceEditorShortcutAllowed({ key: 'Escape', code: 'Escape', target: input }), false);
  assert.equal(isSurfaceEditorShortcutAllowed({ key: 'r', code: 'KeyR', target: input }), false);
});
