// createControlIsolation.test.js — a new control is its own: it shares no object with another new
// control of its type, or with the type's defaults.
//
// createControl's applyOverrides assigned what a type's defaultOverrides set instead of copying it,
// so 55 objects were one object for every new control of the type: a button's choice list
// (Value.rows), States.priority, a knob's Behavior.enumValues, a Custom Component's published
// properties. A change made in place to one of them changed every new control of that type, and the
// pristine a saved control is a difference from. It was found when a new Custom Component had a
// published property removed in place, and every later one lost it too.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createControl, COMPONENT_TYPES } from '../src/CE_Application/models/componentTypes.js';

test('two new controls of any type share no object', () => {
  const shared = [];
  const walk = (a, b, path) => {
    if (!a || typeof a !== 'object') return;
    if (a === b) { shared.push(path); return; }
    for (const key of Object.keys(a)) walk(a[key], b?.[key], `${path}.${key}`);
  };
  for (const type of Object.keys(COMPONENT_TYPES)) walk(createControl(type)._children, createControl(type)._children, type);
  assert.deepEqual(shared, []);
});

test('a change made in place to a new control leaves the next one as the type makes it', () => {
  const first = createControl('Button');
  const rows = first._children.Value.rows.length;
  first._children.Value.rows.push({ id: 'extra' });
  first._children.States.priority.push('Extra');
  assert.equal(createControl('Button')._children.Value.rows.length, rows);
  assert.ok(!createControl('Button')._children.States.priority.includes('Extra'));
});
