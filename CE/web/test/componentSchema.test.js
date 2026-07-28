// componentSchema.test.js — the type→capability map that answers "does this apply to my control?"
//
// The value of this module is entirely in what it says NO to, so the tests are mostly negative:
// a Slider is not an Arpeggiator, and nothing in the picker or in autocomplete should suggest it
// might be. The positive half — the cross-cutting modules stay available everywhere — matters just
// as much, because narrowing too far would replace one wrong answer with another.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAMILY_SECTIONS, sectionsForType, isKnownType, typeOfControl,
  moduleAppliesToType, memberAppliesToType, familiesForType, describeType,
} from '../src/CE_Application/scripting/componentSchema.js';
import { COMPONENT_TYPES } from '../src/CE_Application/models/componentTypes.js';
import { COMPONENT_FAMILIES } from '../src/CE_Application/scripting/componentVerbs.js';
import { MODULES, ALL_MEMBERS, memberModule } from '../src/CE_Application/scripting/panelApi.js';

/* ------------------------------------------------------------------- the map itself */

test('every component family names a section that some real component type has', () => {
  // A family whose section no type carries would narrow its verbs out of existence everywhere —
  // invisible in the picker, absent from autocomplete, and impossible to diagnose from either.
  for (const [moduleId, section] of Object.entries(FAMILY_SECTIONS)) {
    const owners = Object.entries(COMPONENT_TYPES).filter(([, t]) => (t.sections ?? []).includes(section));
    assert.ok(owners.length, `${moduleId} drives "${section}", which no component type has`);
  }
});

test('every ce.components.* module in the manifest has a section mapped', () => {
  // The five hand-written families are listed by hand; the spec-driven ones are derived. Either
  // way, a component module missing from FAMILY_SECTIONS would silently apply to everything —
  // failing open, which is exactly the behaviour this module exists to end.
  const componentModules = MODULES.map((m) => m.id).filter((id) => id.startsWith('ce.components.'));
  for (const id of componentModules) {
    assert.ok(FAMILY_SECTIONS[id], `${id} has no section mapped, so it would apply to every control`);
  }
  assert.equal(Object.keys(FAMILY_SECTIONS).length, componentModules.length,
    'and nothing is mapped that is not a module');
});

test('the spec-driven families agree with the spec they came from', () => {
  for (const f of COMPONENT_FAMILIES) {
    assert.equal(FAMILY_SECTIONS[`ce.components.${f.id}`], f.section);
  }
});

/* ------------------------------------------------------------------------- narrowing */

test('a Slider has no component family — the whole ce.components tree is not for it', () => {
  assert.deepEqual(familiesForType('Slider'), []);
  assert.equal(moduleAppliesToType('ce.components.arp', 'Slider'), false);
  assert.equal(moduleAppliesToType('ce.components.lcd', 'Slider'), false);
  assert.equal(memberAppliesToType('arpRate', 'Slider'), false);
});

test('an Arpeggiator gets the arp family and no other', () => {
  assert.deepEqual(familiesForType('Arp'), ['ce.components.arp']);
  assert.equal(memberAppliesToType('arpRate', 'Arp'), true);
  assert.equal(memberAppliesToType('lcdText', 'Arp'), false);
});

test('the cross-cutting modules apply to everything, because they genuinely do', () => {
  // You can draw on any control, animate any value, send MIDI from anywhere. Narrowing these
  // would be a lie in the other direction — and a far more damaging one, since they are the
  // verbs almost every script uses.
  for (const type of ['Slider', 'Knob', 'Button', 'Label', 'Arp']) {
    for (const id of ['sendCC', 'drawArc', 'animate', 'set', 'log', 'scaleNotes']) {
      assert.equal(memberAppliesToType(id, type), true, `${id} should apply to a ${type}`);
    }
  }
});

test('a member of no module is never narrowed away', () => {
  // Lifecycle hooks belong to no module. Filtering them out would leave a script unable to
  // complete its own entry point.
  assert.equal(memberAppliesToType('onPanelLoad', 'Slider'), true);
  assert.equal(memberAppliesToType('somethingThatDoesNotExist', 'Slider'), true);
});

test('an unknown type narrows to nothing rather than everything', () => {
  // A type this build has never heard of should fail loudly-by-absence in the component tree,
  // not quietly offer every verb as if it were fine.
  assert.equal(isKnownType('Slider'), true);
  assert.equal(isKnownType('Nonesuch'), false);
  assert.deepEqual(sectionsForType('Nonesuch'), []);
  assert.deepEqual(familiesForType('Nonesuch'), []);
  assert.equal(memberAppliesToType('arpRate', 'Nonesuch'), false);
  assert.equal(memberAppliesToType('sendCC', 'Nonesuch'), true, 'the cross-cutting half still stands');
});

test('every component verb applies to at least one type, and not to all of them', () => {
  // Two failure modes at once: a verb nothing can use is unreachable; a verb everything can use
  // is not really a component verb and should not be in a family.
  const owner = memberModule();
  const types = Object.keys(COMPONENT_TYPES);
  for (const m of ALL_MEMBERS) {
    const moduleId = owner[m.id]?.module;
    if (!moduleId || !FAMILY_SECTIONS[moduleId]) continue;
    const fits = types.filter((t) => memberAppliesToType(m.id, t));
    assert.ok(fits.length >= 1, `${m.id} applies to no component type at all`);
    assert.ok(fits.length < types.length, `${m.id} applies to every type — it is not a component verb`);
  }
});

/* ----------------------------------------------------------------------- the read-outs */

test('typeOfControl reads the Core section, and copes with a control that has none', () => {
  assert.equal(typeOfControl({ _children: { Core: { type: 'Knob' } } }), 'Knob');
  assert.equal(typeOfControl({}), '');
  assert.equal(typeOfControl(null), '');
});

test('describeType names what a control DOES have, for the message after a wrong guess', () => {
  const out = describeType('Slider');
  assert.match(out, /^Slider \(/);
  for (const section of sectionsForType('Slider')) assert.ok(out.includes(section), `mentions ${section}`);
  assert.equal(describeType('Nonesuch'), 'Nonesuch', 'an unknown type is echoed, not decorated');
});
