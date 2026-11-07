// accessibilityCheck.test.js — the rules behind the dock's Access tool (utils/accessibilityCheck.js).
//
// What the tool measures on the canvas is held by browser-checks/accessCheck.mjs; this is the
// arithmetic and the naming: WCAG 2's contrast, its large-text rule, and what a screen reader will
// call each control — which the preview and the exported plug-in now use too.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captionsByOwner, contrastOverPixels, contrastRatio, isLargeText, isOperable, nameFindings, parseCssColor,
  readableName, relativeLuminance, requiredContrast, sayslittle, spokenName,
} from '../src/CE_Application/utils/accessibilityCheck.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const black = { r: 0, g: 0, b: 0, a: 1 };
const white = { r: 255, g: 255, b: 255, a: 1 };

test('colours as the browser computes them', () => {
  assert.deepEqual(parseCssColor('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(parseCssColor('rgba(10, 20, 30, 0.5)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseCssColor('rgb(10 20 30 / 50%)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseCssColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(parseCssColor('transparent').a, 0);
  assert.equal(parseCssColor('color(display-p3 1 0 0)'), null, 'what cannot be read is not guessed');
});

test('WCAG 2 contrast: black on white is 21:1, a colour on itself 1:1, #777 on white just under 4.5', () => {
  assert.equal(Math.round(contrastRatio(black, white) * 100) / 100, 21);
  assert.equal(contrastRatio(white, white), 1);
  assert.equal(relativeLuminance(white), 1);
  const grey = parseCssColor('#777777');
  assert.ok(Math.abs(contrastRatio(grey, white) - 4.48) < 0.01);
});

test('large text needs 3:1, other text 4.5:1', () => {
  assert.equal(isLargeText(24, '400'), true);
  assert.equal(isLargeText(19, '700'), true);
  assert.equal(isLargeText(19, '400'), false);
  assert.equal(requiredContrast(12, '400'), 4.5);
  assert.equal(requiredContrast(30, 'normal'), 3);
});

test('against a picture, the hardest tenth of what is behind the text decides', () => {
  // Ninety white pixels and ten black ones behind black text: the black ones are where it vanishes.
  const pixels = new Uint8Array(100 * 4);
  for (let i = 0; i < 100; i += 1) { const v = i < 90 ? 255 : 0; pixels.set([v, v, v, 255], i * 4); }
  assert.equal(Math.round(contrastOverPixels(black, pixels, 0.1)), 21, 'one stray dark area in ten does not fail it');
  assert.equal(contrastOverPixels(black, pixels, 0.05), 1, 'but where the background is the text colour, there is nothing');
  // Half-transparent text is laid over what is behind it first.
  const half = contrastOverPixels({ ...black, a: 0.5 }, new Uint8Array([255, 255, 255, 255]));
  assert.ok(half > 3 && half < 4.5);
  assert.equal(contrastOverPixels(black, new Uint8Array(0)), null);
});

test('names as a screen reader says them, and the ones that say nothing', () => {
  assert.equal(readableName('tone1_lfo_shape'), 'tone1 lfo shape');
  assert.equal(readableName('filterCutoff'), 'filter Cutoff');
  for (const name of ['Knob_1794084620614', 'Knob_3', 'knob3', 'ctrlr_0_cutoff', 'Knob', 'Button', 'Toggle', '']) {
    assert.equal(sayslittle(name), true, name);
  }
  for (const name of ['Cutoff', 'Filter cutoff', 'LFO Rate', 'Save patch', 'CUTOFF', 'tone1_lfo_shape', 'Osc 2 pitch', 'FADER']) {
    assert.equal(sayslittle(name), false, name);
  }
});

function knob(id, name, extra = {}) {
  return createControl('Knob', { Core: { id, name, ...(extra.Core ?? {}) } });
}
function caption(id, owner, words) {
  return createControl('Label', { Core: { id, name: `${id}`, attachedTo: owner }, Text: { content: words } });
}

test('what a control is called: its Screen-reader text, else its caption, else a button\'s text, else its name', () => {
  const controls = [
    knob('k1', 'Knob_1', { Core: { screenReaderText: 'Filter cutoff' } }),
    knob('k2', 'Knob_2'),
    caption('c2', 'k2', 'RESONANCE'),
    knob('k3', 'tone1_lfo_rate'),
    createControl('Button', { Core: { id: 'b1', name: 'Button_1' }, Text: { content: 'Save patch' } }),
  ];
  const captions = captionsByOwner(controls);
  assert.deepEqual(spokenName(controls[0], captions), { name: 'Filter cutoff', source: 'authored' });
  assert.deepEqual(spokenName(controls[1], captions), { name: 'RESONANCE', source: 'caption' });
  assert.deepEqual(spokenName(controls[3], captions), { name: 'tone1 lfo rate', source: 'name' });
  assert.deepEqual(spokenName(controls[4], captions), { name: 'Save patch', source: 'text' });
});

test('which controls a screen reader stops on', () => {
  assert.equal(isOperable(createControl('Knob')), true);
  assert.equal(isOperable(createControl('Button')), true);
  assert.equal(isOperable(createControl('Label')), false);
  const display = createControl('Knob', { Behavior: { valueFlow: 'display' } });
  assert.equal(isOperable(display), false, 'a display-only knob shows a value and takes none');
});

test('the Access tool lists the operable controls whose spoken name says nothing', () => {
  const controls = [
    knob('named', 'Cutoff'),
    knob('authored', 'Knob_7', { Core: { screenReaderText: 'Reverb mix' } }),
    knob('captioned', 'Knob_8'),
    caption('cap', 'captioned', 'DRIVE'),
    knob('bare', 'Knob_9'),
    createControl('Button', { Core: { id: 'default-button', name: 'Button_2' }, Text: { content: 'Button' } }),
    createControl('Label', { Core: { id: 'text', name: 'Label_1' } }),
  ];
  const found = nameFindings(controls);
  assert.deepEqual(found.map((entry) => `${entry.id}:${entry.spoken}:${entry.reason}`), ['bare:Knob 9:says little', 'default-button:Button:says little']);
});

test('and the ones read the same as others, which a listener cannot tell apart', () => {
  const button = (id, words, extra = {}) => createControl('Button', { Core: { id, name: id, ...extra }, Text: { content: words } });
  const found = nameFindings([
    button('fader1', 'FADER'), button('fader2', 'FADER'), button('fader3', 'fader'),
    button('copy', 'COPY'),
    button('named', 'FADER', { screenReaderText: 'Tone 1 fader view' }),
  ]);
  assert.deepEqual(found.map((entry) => `${entry.id}:${entry.reason}:${entry.others}`), ['fader1:shared:2', 'fader2:shared:2', 'fader3:shared:2'],
    'case is not a difference a listener hears; a control given its own name drops out');
});
