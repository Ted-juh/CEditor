// textEntry.test.js — telling a shortcut from a keystroke.
//
// A keyboard shortcut and a typed character are the same event; only where the focus is tells them
// apart. Found by testing: the Settings view renders inside the editor wrapper, whose keydown
// handler treats Delete and Backspace as "remove the selected control" — so Backspace in a settings
// text box never reached the box, and if a control happened to be selected, deleted it instead.
// Ctrl+Z in a field undid a panel edit rather than the typing.
//
// The panic shortcut already guarded for this and had its own private copy of the check. This is
// that check, given a home, so there is one definition and every global handler can reach it.
//
// Deliberately generous about what counts as typing: over-guarding costs a shortcut that does not
// fire while a field has focus, which is visible and workable-around. Under-guarding costs a control
// the user did not mean to delete, which they may not notice until much later.

import test from 'node:test';
import assert from 'node:assert/strict';

import { isTextEntryTarget } from '../src/CE_Application/utils/textEntry.js';
import { isPanicShortcut } from '../src/CE_Application/utils/panicLayout.js';

/** Enough of an element for the check — it only ever reads these three things. */
const el = (tagName, type) => ({ tagName, ...(type ? { type } : {}) });

test('anything you can type into counts', () => {
  assert.equal(isTextEntryTarget(el('INPUT')), true, 'a bare input defaults to text');
  assert.equal(isTextEntryTarget(el('input', 'text')), true, 'tag name case must not matter');
  assert.equal(isTextEntryTarget(el('INPUT', 'number')), true, 'the device name and CC number fields');
  assert.equal(isTextEntryTarget(el('INPUT', 'search')), true);
  assert.equal(isTextEntryTarget(el('TEXTAREA')), true);
  assert.equal(isTextEntryTarget(el('SELECT')), true, 'a select eats its own arrow and letter keys');
  assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true }), true);
});

test('a control you merely focus does not', () => {
  // Nothing is being typed into these, so a key pressed over them is a shortcut. Getting this
  // backwards would make Delete stop working anywhere near a checkbox.
  assert.equal(isTextEntryTarget(el('INPUT', 'checkbox')), false);
  assert.equal(isTextEntryTarget(el('INPUT', 'radio')), false);
  assert.equal(isTextEntryTarget(el('INPUT', 'button')), false);
  assert.equal(isTextEntryTarget(el('INPUT', 'submit')), false);
  assert.equal(isTextEntryTarget(el('BUTTON')), false);
  assert.equal(isTextEntryTarget(el('DIV')), false);
  assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: false }), false);
});

test('nothing at all is not a text field', () => {
  // A keydown with no target must not be read as typing, or every shortcut would stop working.
  assert.equal(isTextEntryTarget(null), false);
  assert.equal(isTextEntryTarget(undefined), false);
  assert.equal(isTextEntryTarget('INPUT'), false, 'a string is not an element');
});

test('the panic shortcut still defers to a text field, as it always did', () => {
  // This helper was extracted from panicLayout.js, so the behaviour it already had has to survive:
  // a BARE key in a field is the field's, a key with a modifier is still the shortcut's.
  const press = (over = {}) => ({ key: 'Escape', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...over });

  assert.equal(isPanicShortcut(press({ target: el('DIV') }), { shortcut: 'Escape' }), true);
  assert.equal(isPanicShortcut(press({ target: el('INPUT') }), { shortcut: 'Escape' }), false,
    'a bare key while typing belongs to the field');
  assert.equal(
    isPanicShortcut(press({ key: 'p', ctrlKey: true, shiftKey: true, target: el('INPUT') }),
      { shortcut: 'Ctrl+Shift+P' }),
    true,
    'a shortcut with a modifier still fires with focus in a text box');
});
