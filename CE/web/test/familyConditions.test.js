// familyConditions.test.js — a family value that goes with another property (models/familyConditions.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import { conditionOf, onlyWhere } from '../src/CE_Application/models/familyConditions.js';
import { resolveControlFamily } from '../src/CE_Application/models/controlSetFamilies.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

// A set of our own: a plate on labels, and a dark ink that goes with it.
const set = {
  id: 'test-plate', tokens: {},
  families: { Label: { component: {
    'Text.Fill.colour': onlyWhere('Background.Fill.colour', 'FFC8A45A', 'FF2A2116', 'FFEEEEEE'),
    'Background.Fill.colour': 'FFC8A45A',
  } } },
};
const drawn = (overrides) => resolveControlFamily(createControl('Label', overrides), set)._children;
const ink = (overrides) => drawn(overrides).Text._children.Fill.colour;

test('the value applies where what it goes with was drawn, wherever it sits in the patch', () => {
  assert.equal(drawn().Background._children.Fill.colour, 'FFC8A45A');
  assert.equal(ink(), 'FF2A2116', 'listed before the plate, and still applied after it');
});

test('where what it goes with is not drawn, the alternative applies', () => {
  assert.equal(ink({ Background: { _children: { Fill: { colour: '00000000' } } } }), 'FFEEEEEE');
});

test('the rule still decides whether the control takes it at all', () => {
  assert.equal(ink({ Text: { _children: { Fill: { colour: 'FF00FF00' } } } }), 'FF00FF00', 'an author\'s ink is theirs');
  const pinned = { Core: { setOverrides: ['Background.Fill.colour'] } };
  assert.equal(ink(pinned), 'FFEEEEEE', 'a background pinned at the factory value is not the plate');
});

test('an ordinary value has no condition', () => {
  assert.equal(conditionOf('FF000000'), null);
  assert.equal(conditionOf({ enabled: true }), null);
  assert.deepEqual(conditionOf(onlyWhere('a.b', 1, 2)), { path: 'a.b', is: 1 });
});
