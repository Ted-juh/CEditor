// hostKeys.test.js — which keys an exported plug-in's page hands to the DAW (utils/hostKeys.js).
//
// The decision alone, on event-shaped objects: a key the page used, a key being typed, a key for an
// open list or menu, Tab and the bare modifiers stay; the rest goes. The order of the page's own
// handlers, which the decision must not depend on, needs a browser: browser-checks/playerHostKeys.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { hostKeyPayload, keyIsForTheHost } from '../src/CE_Application/utils/hostKeys.js';

// Just enough of an element: a tag, attributes, a parent.
function element(tagName, { attrs = {}, parent = null, type, editable = false } = {}) {
  return {
    nodeType: 1, tagName, type, isContentEditable: editable, parentElement: parent,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
  };
}
const body = element('BODY');
const keyDown = (key, over = {}) => ({ type: 'keydown', key, code: over.code ?? key, keyCode: over.keyCode ?? 0, target: body, defaultPrevented: false, ...over });

test('a key nothing used, pressed outside anything being typed into, is the host\'s', () => {
  assert.equal(keyIsForTheHost(keyDown(' ', { code: 'Space', keyCode: 32 })), true);
  assert.equal(keyIsForTheHost(keyDown('s', { code: 'KeyS', keyCode: 83, ctrlKey: true })), true);
  assert.equal(keyIsForTheHost(keyDown('Enter', { keyCode: 13 })), true);
  assert.equal(keyIsForTheHost(keyDown('ArrowLeft', { keyCode: 37 })), true);
  const button = element('BUTTON', { parent: body });
  assert.equal(keyIsForTheHost(keyDown(' ', { code: 'Space', keyCode: 32, target: button })), true,
    'Space over a button is the transport, as in a DAW, not a press of the button');
  const checkbox = element('INPUT', { type: 'checkbox', parent: body });
  assert.equal(keyIsForTheHost(keyDown(' ', { code: 'Space', keyCode: 32, target: checkbox })), true);
});

test('a key the page used, or one being typed, composed or meant for an open list, stays', () => {
  assert.equal(keyIsForTheHost(keyDown(' ', { defaultPrevented: true })), false, 'used by a handler');
  assert.equal(keyIsForTheHost(keyDown('a', { isComposing: true })), false, 'an input method composing');
  assert.equal(keyIsForTheHost(keyDown('Process', { keyCode: 229 })), false);
  for (const field of [element('INPUT', { type: 'text' }), element('INPUT', { type: 'number' }), element('TEXTAREA'),
    element('SELECT'), element('DIV', { editable: true })]) {
    assert.equal(keyIsForTheHost(keyDown(' ', { target: field })), false, `typing into ${field.tagName} ${field.type ?? ''}`);
  }
  const list = element('DIV', { attrs: { role: 'listbox' }, parent: body });
  const option = element('BUTTON', { attrs: { role: 'option' }, parent: list });
  assert.equal(keyIsForTheHost(keyDown('Enter', { target: option })), false, 'an option of an open list');
  const inMenu = element('SPAN', { parent: element('DIV', { attrs: { role: 'menu' }, parent: body }) });
  assert.equal(keyIsForTheHost(keyDown('ArrowDown', { target: inMenu })), false, 'inside a menu');
});

test('Tab, bare modifiers and keys the browser cannot name stay', () => {
  for (const key of ['Tab', 'Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Unidentified', 'Dead', '']) {
    assert.equal(keyIsForTheHost(keyDown(key)), false, key || '(no key)');
  }
  assert.equal(keyIsForTheHost(null), false);
});

test('what the host is told is the key as Windows knows it, with its modifiers', () => {
  const payload = hostKeyPayload({ key: 'S', code: 'KeyS', keyCode: 83, repeat: true, ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }, 'down');
  assert.deepEqual(payload, { type: 'down', keyCode: 83, code: 'KeyS', key: 'S', repeat: true, ctrl: true, shift: true, alt: false, meta: false });
  assert.equal(hostKeyPayload({}, 'up').keyCode, 0, 'a key without a code says 0, which PlayerHost refuses');
});
