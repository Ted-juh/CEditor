// numpad.test.js — typing a number and committing it.
//
// WHAT THE COMPONENT IS FOR. Selecting a preset, a program, a bank slot: a value you KNOW rather
// than one you hunt for. A knob over 0..127 is 128 indistinguishable positions and a combobox of 128
// rows is a scroll; "call up 47" is one gesture on a keypad, which is why hardware has one.
//
// THE ONE DECISION EVERYTHING ELSE FOLLOWS FROM. Typing 1, then 2, then 7 must not recall preset 1,
// then 12, then 127 on the way past. That is three patch changes for one intended change, two of
// them wrong, and on a real synth audible. So digits build a PENDING string and nothing is emitted
// until Enter. Most of this file is that rule and its edges.
//
// Geometry and entry live in one module (utils/numpadLayout.js) because the renderer draws from it
// and the preview surface hit-tests with it. Written twice, the picture and the presses would
// disagree about where a key is — which is invisible until somebody's finger lands between two.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NUMPAD_KEYS, numpadConfig, numpadDisplayText, numpadKeyAt, numpadKeys, numpadPress,
} from '../src/CE_Application/utils/numpadLayout.js';
import { COMPONENT_TYPES, createControl } from '../src/CE_Application/models/componentTypes.js';
import { isScenery } from '../src/CE_Application/utils/sceneryModel.js';

const cfg = (overrides = {}) => ({
  min: 0, max: 127, digits: 3, commitOnLength: false, displayOffset: 0, editable: true, ...overrides,
});
const key = (id) => NUMPAD_KEYS.find((k) => k.id === id);

/** Type a string of key ids, returning the final state and everything committed on the way. */
function type(ids, config = cfg(), pending = '') {
  const commits = [];
  let current = pending;
  let last = { pending: current, commit: null, rejected: '' };
  for (const id of ids) {
    last = numpadPress(key(id), current, config);
    current = last.pending;
    if (last.commit !== null) commits.push(last.commit);
  }
  return { ...last, pending: current, commits };
}

/* ------------------------------------------------------- the reason it exists */

test('digits do not emit anything on the way past', () => {
  // THE test. If this ever passes values through, a pad bound to a preset recalls 1, then 12, then
  // 127 while somebody types 127.
  const result = type(['1', '2', '7']);
  assert.deepEqual(result.commits, [], 'a digit emitted a value');
  assert.equal(result.pending, '127');
});

test('Enter commits what was typed, once', () => {
  const result = type(['1', '2', '7', 'enter']);
  assert.deepEqual(result.commits, [127]);
  assert.equal(result.pending, '', 'the pad should be ready for the next entry');
});

test('Enter with nothing typed emits nothing', () => {
  const result = type(['enter']);
  assert.deepEqual(result.commits, []);
  assert.equal(result.rejected, 'empty');
});

test('Clear throws the entry away without emitting', () => {
  const result = type(['4', '2', 'clear']);
  assert.deepEqual(result.commits, []);
  assert.equal(result.pending, '');
});

/* ------------------------------------------------------------ the range */

test('an out-of-range entry is REFUSED, not clamped', () => {
  // Clamping 999 to 127 would recall a preset nobody asked for, and the person typing would have no
  // way to tell it apart from the one they meant.
  const result = type(['9', '9', '9', 'enter']);
  assert.deepEqual(result.commits, []);
  assert.equal(result.rejected, 'outOfRange');
  assert.equal(result.pending, '999', 'the refused entry stays up so it can be corrected');
});

test('a value below the minimum is refused too', () => {
  const result = type(['3', 'enter'], cfg({ min: 10 }));
  assert.deepEqual(result.commits, []);
  assert.equal(result.rejected, 'outOfRange');
});

test('the bounds themselves are accepted', () => {
  assert.deepEqual(type(['0', 'enter']).commits, [0]);
  assert.deepEqual(type(['1', '2', '7', 'enter']).commits, [127]);
});

test('a digit past the configured width is refused rather than shifting the entry', () => {
  // Dropping the leading digit would silently turn 1274 into 274 — a different preset, entered by
  // somebody who thinks they typed the first one.
  const result = type(['1', '2', '7', '4']);
  assert.equal(result.pending, '127');
  assert.equal(result.rejected, 'tooLong');
});

/* ------------------------------------------------------------- the offset */

test('the display offset sits between what is typed and what is emitted', () => {
  // A machine whose front panel calls its first preset 1 while the wire calls it 0. Getting this
  // backwards is an off-by-one on every recall.
  const one = cfg({ displayOffset: 1, min: 0, max: 127 });
  assert.deepEqual(type(['1', 'enter'], one).commits, [0], 'panel 1 is wire 0');
  assert.deepEqual(type(['1', '2', '8', 'enter'], one).commits, [127], 'panel 128 is wire 127');
});

test('the offset is applied before the range check, not after', () => {
  // Typing 0 on a 1-based machine is below the first preset, and must be refused rather than
  // emitting -1.
  const result = type(['0', 'enter'], cfg({ displayOffset: 1, min: 0, max: 127 }));
  assert.deepEqual(result.commits, []);
  assert.equal(result.rejected, 'outOfRange');
});

/* --------------------------------------------------------- the fixed-width mode */

test('commitOnLength emits as soon as the width is reached', () => {
  const result = type(['0', '4', '7'], cfg({ commitOnLength: true }));
  assert.deepEqual(result.commits, [47]);
  assert.equal(result.pending, '');
});

test('commitOnLength is off by default, because it cannot be safe at every width', () => {
  assert.equal(numpadConfig({ _children: { Numpad: {} } }).commitOnLength, false);
});

/* ----------------------------------------------------------------- small edges */

test('a leading zero is replaced rather than counted', () => {
  // "0" then "4" is 4, not a wasted digit on a two-digit pad.
  const result = type(['0', '4'], cfg({ digits: 2 }));
  assert.equal(result.pending, '4');
});

test('a read-only pad ignores every press', () => {
  const result = type(['1', 'enter'], cfg({ editable: false }));
  assert.deepEqual(result.commits, []);
  assert.equal(result.pending, '');
  assert.equal(result.rejected, 'readOnly');
});

test('min and max are sorted, so a reversed pair is not an unenterable pad', () => {
  const resolved = numpadConfig({ _children: { Numpad: { min: 100, max: 10 } } });
  assert.equal(resolved.min, 10);
  assert.equal(resolved.max, 100);
});

/* -------------------------------------------------------------- the readout */

test('the readout shows the entry while typing and the committed value when idle', () => {
  assert.equal(numpadDisplayText('12', 99, cfg()), '12');
  assert.equal(numpadDisplayText('', 99, cfg()), '99');
  assert.equal(numpadDisplayText('', 99, cfg({ placeholder: 'blank' })), '');
});

test('the idle readout shows the value as the PANEL numbers it', () => {
  // The offset again: a pad on a 1-based machine holding wire value 0 must read 1, or the display
  // and the keys disagree about what is loaded.
  assert.equal(numpadDisplayText('', 0, cfg({ displayOffset: 1 })), '1');
});

/* --------------------------------------------------------------- the geometry */

test('the keypad is twelve keys in reading order, ending C 0 Enter', () => {
  assert.equal(NUMPAD_KEYS.length, 12);
  assert.deepEqual(NUMPAD_KEYS.slice(9).map((k) => k.id), ['clear', '0', 'enter']);
});

test('every key has a box, and they do not overlap', () => {
  const { keys } = numpadKeys(168, 232, cfg({ gap: 4, showDisplay: true }));
  assert.equal(keys.length, 12);
  for (const k of keys) assert.ok(k.width > 0 && k.height > 0, `${k.id} has no box`);
  for (const a of keys) {
    for (const b of keys) {
      if (a === b) continue;
      const apart = a.x + a.width <= b.x + 0.01 || b.x + b.width <= a.x + 0.01
        || a.y + a.height <= b.y + 0.01 || b.y + b.height <= a.y + 0.01;
      assert.ok(apart, `${a.id} overlaps ${b.id}`);
    }
  }
});

test('hit-testing finds the key that was drawn there', () => {
  // The single-source claim: the renderer draws numpadKeys and the surface asks numpadKeyAt, so a
  // point inside a drawn key must resolve to that key.
  const config = cfg({ gap: 4 });
  const { keys } = numpadKeys(168, 232, config);
  for (const k of keys) {
    const hit = numpadKeyAt(k.x + k.width / 2, k.y + k.height / 2, 168, 232, config);
    assert.equal(hit?.id, k.id, `centre of ${k.id} hit ${hit?.id}`);
  }
});

test('a point in the readout is not a key', () => {
  const config = cfg();
  const { display } = numpadKeys(168, 232, config);
  assert.ok(display, 'the readout should exist by default');
  assert.equal(numpadKeyAt(display.width / 2, display.height / 2, 168, 232, config), null);
});

test('a short pad loses key height rather than its readout', () => {
  // A keypad you cannot read is worse than one with cramped keys.
  const { display, keys } = numpadKeys(120, 90, cfg());
  assert.ok(display.height >= 14, 'the readout was squeezed away');
  assert.ok(keys.every((k) => k.height >= 0), 'a negative key height would invert the hit test');
});

/* ------------------------------------------------------------- the registration */

test('the component type is registered with the sections it needs', () => {
  const type = COMPONENT_TYPES.Numpad;
  assert.ok(type, 'Numpad is not in COMPONENT_TYPES');
  // Value + DeviceBindings is what makes a typed number bindable like any other value. Without
  // them the pad would be a picture.
  for (const section of ['Numpad', 'Value', 'DeviceBindings']) {
    assert.ok(type.sections.includes(section), `Numpad is missing its ${section} section`);
  }
});

test('a fresh Numpad carries its defaults and a Value to write into', () => {
  const control = createControl('Numpad', { Core: { id: 'pad' } });
  assert.equal(control._children.Numpad.max, 127);
  assert.equal(control._children.Numpad.digits, 3);
  assert.ok(control._children.Value, 'nothing to commit into');
});

test('the Numpad is not scenery — a folded one would be a picture of a keypad', () => {
  // The scenery fold replaces a control with frozen markup. A type that can change must never
  // qualify, and Value / DeviceBindings / Scripts are exactly the sections that say so.
  const control = createControl('Numpad', { Core: { id: 'pad' } });
  assert.equal(isScenery(control), false);
});
