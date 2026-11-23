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
  assert.match(dock, /\(designerOpen \? \(lightLook \? `\$\{lightLook\.name\} › light, no colour of its own` : 'No layer selected'\) : 'Panel background'\)/);
  assert.match(dock, /if \(!t\._designerFill\) handleTabClick/, 'selecting a layer does not take the dock off its tab');
});

test('a picture layer\'s target is its own colour, light has none, and a mixed selection writes each its own', () => {
  const looks = [
    { name: 'skirt', kind: 'picture', colourPath: 'Background.Fill.imageColour', drawnPath: 'Background.Fill.imageColourDrawn' },
    { name: 'pointer', kind: 'frames', colourPath: 'Image.colour', drawnPath: 'Image.colourDrawn' },
    { name: 'skirt_shading', kind: 'light', lights: 'skirt' },
    { name: 'face', kind: '' },
  ];
  const skirt = designerFillTarget(open(['skirt'], { looks }));
  assert.deepEqual([skirt.path, skirt.label], ['Parts.skirt.Background.Fill.imageColour', 'skirt › Colour']);
  assert.deepEqual(skirt._picture, { name: 'skirt', controlId: 'knob', drawnPath: 'Parts.skirt.Background.Fill.imageColourDrawn' });
  assert.equal(designerFillTarget(open(['pointer'], { looks })).path, 'Parts.pointer.Image.colour');
  assert.equal(designerFillTarget(open(['skirt_shading'], { looks })), null, 'light has no colour of its own');
  const both = designerFillTarget(open(['skirt', 'skirt_shading', 'pointer'], { looks }));
  assert.equal(both.label, '2 layers › Colour', 'the light layer is left out');
  const mixed = designerFillTarget(open(['skirt', 'face'], { looks }));
  assert.equal(mixed.label, '2 layers › Fill and colour');
  assert.equal(mixed.acceptsRoles, true, 'a set\'s role links each');
});
