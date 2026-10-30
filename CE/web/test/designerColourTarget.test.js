// designerColourTarget.test.js — in the Component Designer, the dock's Colors tab edits the selected layer.
//
// It read "Editing: Panel background" with a layer selected, and a drag on the picker repainted the
// panel hidden behind the designer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

import { colorTarget, activateColorTarget, clearColorTarget } from '../src/CE_Application/stores/colorTarget.js';
import { designerFillTarget, followDesignerFill } from '../src/CE_Application/stores/designerColourTarget.js';

const open = (layers, extra = {}) => ({ kind: 'Layer', controlId: 'knob', layers, fill: 'FF262E35', ...extra });

test('the target is the selected layers\' fill, and nothing when none is selected or the designer is shut', () => {
  const one = designerFillTarget(open(['face']));
  assert.equal(one.type, 'control');
  assert.equal(one.controlId, 'knob');
  assert.equal(one.path, 'Parts.face.Background.Fill.colour');
  assert.equal(one.label, 'face › Fill');

  const two = designerFillTarget(open(['face', 'rim']));
  assert.equal(two.type, 'callback', 'several layers take the colour together');
  assert.equal(two.label, '2 layers › Fill');

  assert.equal(designerFillTarget(open([])), null);
  assert.equal(designerFillTarget({ ...open(['face']), kind: '' }), null, 'the designer is not open');
  assert.equal(designerFillTarget(null), null);
});

test('selecting a layer arms its fill; a swatch clicked after that keeps the dock until the selection changes', () => {
  clearColorTarget();
  followDesignerFill(designerFillTarget(open(['face'])), 'FF262E35');
  assert.equal(get(colorTarget).path, 'Parts.face.Background.Fill.colour');
  assert.equal(get(colorTarget)._initialColor, '262E35', 'the picker starts at the layer\'s own colour');

  // The look bar's Stroke swatch, say.
  activateColorTarget({ type: 'control', controlId: 'knob', path: 'Parts.face.Border.colour' }, 'FFFFFFFF');
  followDesignerFill(designerFillTarget(open(['face'])), 'FF262E35');
  assert.equal(get(colorTarget).path, 'Parts.face.Border.colour', 'the same selection leaves the clicked swatch armed');

  followDesignerFill(designerFillTarget(open(['rim'])), 'FF111111');
  assert.equal(get(colorTarget).path, 'Parts.rim.Background.Fill.colour', 'a new selection takes the dock');
});

test('when the dock lets go, the selection takes it again; with nothing selected the target goes', () => {
  followDesignerFill(designerFillTarget(open(['rim'])), 'FF111111');
  clearColorTarget(); // Done, or the dock closing
  followDesignerFill(designerFillTarget(open(['rim'])), 'FF111111');
  assert.equal(get(colorTarget)?.path, 'Parts.rim.Background.Fill.colour');

  activateColorTarget({ type: 'control', controlId: 'knob', path: 'Parts.rim.Border.colour' }, 'FFFFFFFF');
  followDesignerFill(null, '');
  assert.equal(get(colorTarget), null, 'a target armed for the old selection does not outlive it');
});

test('the dock does not write the hidden panel from the designer, and says what it edits', () => {
  const dock = readFileSync(new URL('../src/CE_Application/panels/DisplayPanel.svelte', import.meta.url), 'utf8');
  assert.match(dock, /if \(designerOpen\) return;\s*\n\s*\/\/ Default — write to panel bgColour/);
  assert.match(dock, /if \(panel && !designerOpen\) \{\s*updatePanel\(panel\.id, \{ bgGradient: newGradient/);
  assert.match(dock, /\(designerOpen \? 'No layer selected' : 'Panel background'\)/);
  assert.match(dock, /if \(!t\._designerFill\) handleTabClick/, 'selecting a layer does not take the dock off its tab');
});
