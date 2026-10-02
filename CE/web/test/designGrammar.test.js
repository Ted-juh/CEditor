// designGrammar.test.js — a set's grammar is read by everything it frames (models/designGrammar.js).
//
// The instruments drew their lettering in Arial in every set, beside panels set in Barlow, Libre
// Franklin or Space Grotesk, and their cases differed from set to set by a corner radius at most.
// The set's frame (its piping, its glow, its milling, its hairline) stopped at its sections. These
// pin that the frame and the lettering now reach the instrument cases and the display bezels too.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_CONTROL_SETS, getControlSet, resolveToken } from '../src/CE_Application/models/controlSets.js';
import { familyPatchFor, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { INSTRUMENT_TYPES } from '../src/CE_Application/models/instrumentDesigns.js';
import { SECTION_TREATMENTS } from '../src/CE_Application/models/sectionDesigns.js';
import { frameFor, grammarFor } from '../src/CE_Application/models/designGrammar.js';

const others = BUILT_IN_CONTROL_SETS.filter((set) => set.id !== 'graphite');
const caseOf = (type, set) => resolveControlForSet(createControl(type), set)._children;

test('Graphite has no grammar, and its instruments keep Arial and their factory case', () => {
  const graphite = getControlSet('graphite');
  assert.equal(grammarFor(graphite), null);
  assert.equal(frameFor(graphite, { fill: 'FF000000' }), null);
  const turing = caseOf('Turing', graphite);
  assert.equal(turing.Text._children.Font.family, createControl('Turing')._children.Text._children.Font.family);
  assert.equal(familyPatchFor(graphite, 'Turing'), null);
});

test('every other set has a grammar: a frame, corners, a line and its typefaces', () => {
  for (const set of others) {
    const grammar = grammarFor(set);
    assert.ok(SECTION_TREATMENTS.includes(grammar.frame), set.id);
    assert.ok(grammar.line >= 1 && grammar.line <= 2, set.id);
    assert.ok(grammar.lettering.legend, `${set.id} names a legend face`);
  }
});

test('an instrument\'s case is the set\'s frame round its display window, lettered in the set\'s face', () => {
  for (const set of others) {
    const grammar = grammarFor(set);
    for (const type of INSTRUMENT_TYPES) {
      const control = caseOf(type, set);
      const background = control.Background._children;
      assert.equal(background.Fill.colour, resolveToken('instrument.face', set), `${set.id} ${type} face`);
      assert.equal(control.Text._children.Font.family, grammar.lettering.legend, `${set.id} ${type} lettering`);
      assert.ok(background.Border.thickness >= grammar.line, `${set.id} ${type} line`);
    }
  }
  // The signatures, where they show.
  const tolex = caseOf('Turing', getControlSet('tolex')).Background._children;
  assert.equal(tolex.Border.colour, resolveToken('text.primary', getControlSet('tolex')), 'Tolex pipes its cases in cream');
  assert.equal(tolex.Border.thickness, 2);
  assert.equal(caseOf('Turing', getControlSet('blueprint')).Background._children.Corners.radius, 0, 'Blueprint draws a square line');
  assert.ok(caseOf('Turing', getControlSet('neon')).Effects._children.Shadows.items.some((s) => s.type === 'outer-glow'), 'Neon lights its edge');
  assert.ok(caseOf('Turing', getControlSet('machined')).Effects._children.Shadows.items.some((s) => s.type === 'inner'), 'Machined mills it in');
});

test('a display\'s bezel is the same frame, and the instruments now differ in form, not only in colour', () => {
  for (const set of others) {
    const lcd = caseOf('LcdDisplay', set).Background._children;
    const turing = caseOf('Turing', set).Background._children;
    assert.equal(lcd.Border.colour, turing.Border.colour, `${set.id}: one frame round the LCD and the instruments`);
  }
  const forms = new Set(others.map((set) => {
    const control = caseOf('Turing', set);
    return JSON.stringify([control.Text._children.Font.family, control.Background._children.Border.thickness, control.Background._children.Corners.radius,
      control.Effects._children.Shadows.items.map((s) => s.type)]);
  }));
  assert.ok(forms.size >= 20, `the Turing takes ${forms.size} forms across the sets`);
});
