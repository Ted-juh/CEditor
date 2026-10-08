// setSwatchValue.test.js — the inspector's swatches show the colour the canvas draws
// (utils/setSwatchValue.js).
//
// Editors build their swatches from the document control, which holds the factory value for a
// property nobody touched. The canvas draws the set's family patch there instead, so on Tolex the
// Turing's bar swatch said factory green while its bars were tan; and a swatch holding a token
// reference such as `{display.lit}` could not be painted at all.

import test from 'node:test';
import assert from 'node:assert/strict';

import { getControlSet, resolveToken } from '../src/CE_Application/models/controlSets.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { effectiveSwatchColour } from '../src/CE_Application/utils/setSwatchValue.js';

test('a factory colour the set draws differently shows the set\'s, marked as the set\'s', () => {
  const turing = createControl('Turing');
  const tolex = getControlSet('tolex');
  const stored = turing._children.Turing.barColour;
  const shown = effectiveSwatchColour(turing, tolex, 'Turing.barColour', stored);
  assert.equal(shown.value, resolveToken('series.one', tolex));
  assert.notEqual(shown.value, stored);
  assert.equal(shown.fromSet, true);
});

test('Graphite draws the factory colour, so the swatch is unchanged and not marked', () => {
  const turing = createControl('Turing');
  const stored = turing._children.Turing.barColour;
  const shown = effectiveSwatchColour(turing, getControlSet('graphite'), 'Turing.barColour', stored);
  assert.equal(shown.value, stored);
  assert.equal(shown.fromSet, false);
});

test('a colour the author chose is theirs: shown as written, not marked', () => {
  const turing = createControl('Turing');
  turing._children.Turing.barColour = 'FF123456';
  const shown = effectiveSwatchColour(turing, getControlSet('tolex'), 'Turing.barColour', 'FF123456');
  assert.deepEqual(shown, { value: 'FF123456', fromSet: false });
});

test('a token reference is painted as the colour it resolves to', () => {
  const lcd = createControl('LcdDisplay');
  const tolex = getControlSet('tolex');
  assert.equal(lcd._children.Display.litColour, '{display.lit}');
  const shown = effectiveSwatchColour(lcd, tolex, 'Display.litColour', '{display.lit}');
  assert.equal(shown.value, resolveToken('display.lit', tolex));
  assert.equal(shown.fromSet, true);
});

test('a value the editor shows from a state, not the document, is left alone', () => {
  const turing = createControl('Turing');
  assert.equal(effectiveSwatchColour(turing, getControlSet('tolex'), 'Turing.barColour', 'FFABCDEF'), null);
  assert.equal(effectiveSwatchColour(null, getControlSet('tolex'), 'Turing.barColour', 'FFABCDEF'), null);
});
