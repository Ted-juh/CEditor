// controlSetReach.test.js — does each control set reach each control, and in form or only in colour?
// (scripts/control-set-reach.mjs measures; this holds the measurement to a rule.)
//
// Half the Insert menu once ignored the sets, and nothing said so: a control a set does not touch
// has no symptom, every test passes, and the set simply looks generic. A control a set only
// recolours is the quieter version of the same thing: the same part in a different paint. So this
// is the test for the gap itself, as componentCoverage.test.js is for script verbs. Three rules:
//
//   REACH   every control on the Insert menu is changed by every set but Graphite, or is named in
//           NOT_REACHED with a reason.
//   FORM    every control takes at least MIN_FORMS different forms across the sets, or is named in
//           ONE_FORM with a reason. One form means every set draws it the same, in its own paint.
//   DEBT    a set that only recolours a control is a debt, counted per control in COLOUR_ONLY.
//           The count must match: a new recolour fails, and so does a paid one until its number is
//           lowered, so the table only ever goes down and always says what is true.
//
// Every list here is asserted exactly, so a name left behind after its gap is fixed cannot quietly
// excuse the next one. Read the whole table with `node scripts/control-set-reach.mjs`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { INSERTABLE_TYPES, MEASURED_SETS, measureControlSetReach, setChanges } from '../scripts/control-set-reach.mjs';

const ROWS = measureControlSetReach();
const row = (type) => ROWS.find((entry) => entry.type === type);

/** Controls no set changes. Each is the author's own content, or a gap marked GAP. */
const NOT_REACHED = {
  Image: 'the author\'s picture: a set has nothing to say about its pixels',
  CustomComponent: 'the author\'s own component, designed part by part by them',
};

const MIN_FORMS = 3;

/** Controls every set draws in the same form. */
const ONE_FORM = {
  Background: 'by design: the panel\'s own face, frameless in every set, in the panel\'s colour and material',
};

/**
 * Per control, how many sets change only its colours. Paid in full: the last were the keyboard's
 * case in 37 sets and seven instruments each on Walnut, Valve, Ladder and Field, which the design
 * grammar's frame and lettering gave a form (models/designGrammar.js). It stays, empty, so that the
 * next recolour fails here rather than going unnoticed.
 */
const COLOUR_ONLY = {};

test('the measure: a recolour is a recolour, and a radius or a form is form', () => {
  const recolour = { id: 'probe', tokens: {}, families: { Knob: { component: { 'Core.formFaceColour': 'FF123456' } } } };
  const reshape = { id: 'probe', tokens: {}, families: { Knob: { component: { 'Core.controlForm': 'tuning', 'Core.formFaceColour': 'FF123456' } } } };
  assert.deepEqual(Object.keys(setChanges('Knob', recolour).form), []);
  assert.ok(setChanges('Knob', recolour).colour.length >= 1);
  assert.deepEqual(Object.keys(setChanges('Knob', reshape).form), ['_children.Core.controlForm']);
  assert.equal(INSERTABLE_TYPES.length, ROWS.length);
  assert.ok(INSERTABLE_TYPES.length >= 50, 'the Insert menu is measured whole');
  assert.ok(MEASURED_SETS.length >= 70 && !MEASURED_SETS.some((set) => set.id === 'graphite'));
});

test('REACH: every set but Graphite changes every control on the Insert menu, or the control says why not', () => {
  const partly = ROWS.filter((r) => r.untouched.length && r.untouched.length < MEASURED_SETS.length);
  assert.deepEqual(partly.map((r) => `${r.type}: untouched by ${r.untouched.join(', ')}`), [],
    'a control some sets reach and others do not');
  const unreached = ROWS.filter((r) => r.untouched.length === MEASURED_SETS.length).map((r) => r.type);
  assert.deepEqual(unreached.sort(), Object.keys(NOT_REACHED).sort(),
    'controls no set changes must be named in NOT_REACHED, and only those');
});

test(`FORM: every control takes at least ${MIN_FORMS} forms across the sets, or the control says why not`, () => {
  const flat = ROWS.filter((r) => !NOT_REACHED[r.type] && r.forms < MIN_FORMS).map((r) => `${r.type} (${r.forms})`);
  assert.deepEqual(flat.map((entry) => entry.split(' ')[0]).sort(), Object.keys(ONE_FORM).sort(),
    `controls drawn in fewer than ${MIN_FORMS} forms: ${flat.join(', ')}. Name them in ONE_FORM with a reason, or remove the ones that now pass.`);
});

test('DEBT: the sets that only recolour a control are counted, and the count only goes down', () => {
  const actual = Object.fromEntries(ROWS
    .filter((r) => !NOT_REACHED[r.type] && !ONE_FORM[r.type] && r.colourOnly.length)
    .map((r) => [r.type, r.colourOnly.length]));
  const worse = Object.keys(actual).filter((type) => actual[type] > (COLOUR_ONLY[type] ?? 0))
    .map((type) => `${type}: ${actual[type]} (was ${COLOUR_ONLY[type] ?? 0}): ${row(type).colourOnly.join(', ')}`);
  assert.deepEqual(worse, [], 'a set that only recolours a control it used to give a form');
  const better = Object.keys(COLOUR_ONLY).filter((type) => (actual[type] ?? 0) < COLOUR_ONLY[type])
    .map((type) => `${type}: ${COLOUR_ONLY[type]} -> ${actual[type] ?? 0}`);
  assert.deepEqual(better, [], 'paid debt: lower these in COLOUR_ONLY');
});
