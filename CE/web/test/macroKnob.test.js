// macroKnob.test.js — a Macro's knob is its set's knob (utils/macroKnob.js).
//
// The Macro drew one dark disc under every set while a Knob placed beside it took the set's form:
// a tuning dial on Tolex, a lens on Neon, a vernier on Machined. These pin that the Macro now hosts
// that same Knob, that Graphite's Macro is untouched, that the author's choice wins, and that the
// knob's markings read on the Macro's face, where its set never meant them to sit.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_CONTROL_SETS, getControlSet, resolveToken } from '../src/CE_Application/models/controlSets.js';
import { pristineControlFor, resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { contrast } from '../src/CE_Application/models/instrumentDesigns.js';
import { macroGeometry } from '../src/CE_Application/utils/macroLayout.js';
import {
  macroKnobBaseRuntime, macroKnobBox, macroKnobControl, macroKnobHalo, macroKnobRuntime, macroKnobSignature, macroUsesSetKnob,
} from '../src/CE_Application/utils/macroKnob.js';

const others = BUILT_IN_CONTROL_SETS.filter((s) => s.id !== 'graphite');

function macro(extra = {}) {
  const control = createControl('Macro', { Transform: { x: 0, y: 0, width: 276, height: 124 } });
  Object.assign(control._children.Macro, extra);
  return control;
}
const boxFor = (control) => macroKnobBox(macroGeometry(276, 124, control), control);

test('the Macro follows its set: Graphite keeps its own knob, every other set draws its knob', () => {
  assert.equal(macro()._children.Macro.knobDesign, '', 'the factory follows the set');
  assert.equal(macroUsesSetKnob(resolveControlForSet(macro(), getControlSet('graphite'))), false);
  for (const set of others) {
    assert.equal(macroUsesSetKnob(resolveControlForSet(macro(), set)), true, set.id);
  }
});

test('the author\'s choice wins over the set, either way', () => {
  assert.equal(macroUsesSetKnob(resolveControlForSet(macro({ knobDesign: 'own' }), getControlSet('tolex'))), false);
  assert.equal(macroUsesSetKnob(resolveControlForSet(macro({ knobDesign: 'set' }), getControlSet('graphite'))), true);
});

test('the hosted knob is the set\'s Knob: the same form, cap and pointer as a Knob on the same panel', () => {
  const source = macro();
  for (const set of BUILT_IN_CONTROL_SETS) {
    const hosted = resolveControlForSet(macroKnobControl(source, boxFor(source), set), set);
    const plain = resolveControlForSet(createControl('Knob'), set);
    assert.equal(hosted._children.Core.controlForm, plain._children.Core.controlForm, `${set.id} form`);
    for (const key of ['formFaceColour', 'formHousingColour', 'formAccentColour']) {
      assert.equal(hosted._children.Core[key], plain._children.Core[key], `${set.id} ${key}`);
    }
    for (const part of ['bodyCap', 'pointerCurrent', 'bodyTrackFill']) {
      assert.deepEqual(hosted._children.Parts._children[part], plain._children.Parts._children[part], `${set.id} ${part}`);
    }
  }
});

test('the hosted knob only draws: no labels, no readout, no id of the Macro\'s, a shared factory left alone', () => {
  const before = JSON.stringify(pristineControlFor('Knob'));
  const source = macro();
  const box = boxFor(source);
  const knob = macroKnobControl(source, box, getControlSet('tolex'));
  assert.equal(JSON.stringify(pristineControlFor('Knob')), before, 'the cached factory Knob is not mutated');
  assert.equal(knob._children.Core.id, `${source._children.Core.id}~knob`);
  assert.equal(knob._children.Core.formShowValue, false);
  assert.equal(knob._children.Behavior.showValueReadout, false);
  assert.equal(knob._children.Behavior.showMinMaxLabels, false);
  assert.deepEqual(Object.keys(knob._children.Parts._children).filter((name) => name.startsWith('label')), []);
  assert.deepEqual([knob._children.Transform.x, knob._children.Transform.y, knob._children.Transform.width], [box.x, box.y, box.width]);
  // A Macro pinned to a set pins its knob to the same one.
  const pinned = macro();
  pinned._children.Core.controlSetId = 'neon';
  assert.equal(macroKnobControl(pinned, boxFor(pinned))._children.Core.controlSetId, 'neon');
});

test('the knob sits between the Macro\'s caption and its readout, inside the Macro', () => {
  for (const [w, h] of [[276, 124], [180, 90], [400, 220], [120, 120]]) {
    const control = macro();
    const geom = macroGeometry(w, h, control);
    const box = macroKnobBox(geom, control);
    const readoutTop = geom.knobCY + geom.knobR + 15 - Math.max(12, geom.knobR * 0.42) * 0.78;
    assert.ok(box.y >= geom.knobCY - geom.knobR - 7, `${w}x${h}: below the caption's baseline`);
    assert.ok(box.y + box.height <= readoutTop, `${w}x${h}: above the readout`);
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= h, `${w}x${h}: inside the Macro`);
    assert.ok(Math.abs(box.x + box.width / 2 - geom.knobCX) < 0.001, `${w}x${h}: centred on the Macro's knob`);
  }
});

test('the knob\'s scale and a bodiless needle read on the Macro\'s face; markings that already read are the set\'s', () => {
  const source = macro();
  for (const set of others) {
    const face = resolveToken('instrument.face', set);
    const plain = resolveControlForSet(createControl('Knob'), set)._children.Core;
    const hosted = resolveControlForSet(macroKnobControl(source, boxFor(source), set), set)._children.Core;
    assert.ok(contrast(hosted.formLabelColour, face) >= 3, `${set.id}: scale ${hosted.formLabelColour} on ${face}`);
    if (hosted.controlForm === 'pointer') assert.ok(contrast(hosted.formInkColour, face) >= 3, `${set.id}: needle`);
    if (contrast(plain.formLabelColour, face) >= 3) assert.equal(hosted.formLabelColour, plain.formLabelColour, `${set.id}: a scale that reads is left alone`);
    if (hosted.controlForm !== 'pointer') assert.equal(hosted.formInkColour, plain.formInkColour, `${set.id}: ink on a body is the set's`);
  }
});

test('the value goes in as a runtime: the knob control stays the same while the Macro turns', () => {
  const source = macro();
  const knob = macroKnobControl(source, boxFor(source));
  const base = macroKnobBaseRuntime(knob);
  const at = macroKnobRuntime(base, 0.62, true);
  assert.equal(at.signals.currentValueNormalized, 0.62);
  assert.equal(at.signals.valueRaw, 0.62);
  assert.equal(at.signals.dragging, true);
  assert.notEqual(base.signals.currentValueNormalized, 0.62, 'the base runtime is not written to');
  assert.equal(macroKnobRuntime(base, 7).signals.currentValueNormalized, 1);
  assert.equal(macroKnobRuntime(base, -1).signals.currentValueNormalized, 0);
  assert.equal(macroKnobRuntime(null, 0.5), null);
});

test('a dark round knob on the dark face sits on a ring of the set\'s display light; others need none', () => {
  const source = macro();
  const ring = (id) => macroKnobHalo(macroKnobControl(source, boxFor(source)), getControlSet(id));
  for (const id of ['flightdeck', 'stompbox', 'bakelite']) {
    const set = getControlSet(id);
    assert.equal(ring(id), resolveToken('display.lit', set), `${id} gets its display light`);
    assert.ok(contrast(ring(id), resolveToken('instrument.face', set)) >= 3, `${id}: the ring reads`);
  }
  assert.equal(ring('tolex'), null, 'a cream dial reads already');
  assert.equal(ring('neon'), null, 'a lens lights itself');
  assert.equal(ring('walnut'), null, 'a tuning dial is not a round cap');
  assert.equal(ring('ladder'), null, 'a reflective set\'s ink is dark: no ring to see');
  assert.equal(macroKnobHalo(null, getControlSet('tolex')), null);
});

test('the knob is rebuilt for any colour it or its ring reads, and not for a new copy of the same set', () => {
  // The canvas keys the hosted knob on this. A set edited in Settings keeps its id and its face
  // while its display light moves, and the ring is drawn in that light: keyed on the face alone,
  // the ring stayed in the old colour, or stayed when it should have gone.
  const source = macro();
  const box = boxFor(source);
  const flightdeck = getControlSet('flightdeck');
  const key = macroKnobSignature(source, box, flightdeck);
  assert.equal(macroKnobSignature(source, box, JSON.parse(JSON.stringify(flightdeck))), key, 'the same set as a new object');
  const relit = { ...flightdeck, tokens: { ...flightdeck.tokens, 'display.lit': 'FFFF5FA2' } };
  assert.equal(resolveToken('instrument.face', relit), resolveToken('instrument.face', flightdeck), 'the face is unchanged');
  assert.notEqual(macroKnobSignature(source, box, relit), key, 'a new display light rebuilds the knob');
  assert.notEqual(macroKnobHalo(macroKnobControl(source, box, relit), relit), macroKnobHalo(macroKnobControl(source, box, flightdeck), flightdeck),
    'and the ring the rebuilt knob sits on is in the new light');
  const recapped = { ...flightdeck, tokens: { ...flightdeck.tokens, surface: 'FFE8E2D0' } };
  assert.notEqual(macroKnobSignature(source, box, recapped), key, 'so does a new cap colour, which decides whether there is a ring');
  assert.notEqual(macroKnobSignature(source, { ...box, width: box.width + 4 }, flightdeck), key, 'and a new box');
});
