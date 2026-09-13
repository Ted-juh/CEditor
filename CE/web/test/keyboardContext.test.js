import test from 'node:test';
import assert from 'node:assert/strict';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { keyboardContext, keyboardPress } from '../src/CE_Application/utils/keyboardLayout.js';
import { panelKeyPlan } from '../src/CE_Application/utils/panelKey.js';
import { controlPortValues } from '../src/CE_Application/utils/controlPortValues.js';

test('Keyboard follows panel-key broadcasts, including component scale aliases', () => {
  const control = createControl('Keyboard', { Keyboard: { followPanelKey: true } });
  const plan = panelKeyPlan({ controls: [control], musicalContext: { root: 2, scale: 'pentatonicMinor', enabled: true } });
  assert.equal(plan.changes.length, 1);
  assert.deepEqual(plan.changes[0].patch, { key: 2, scale: 'pentatonicMin' });
  Object.assign(control._children.Keyboard, plan.changes[0].patch, { scaleLock: 'refuse' });
  assert.equal(keyboardPress(control, 60, { context: keyboardContext(control) }).note, 60); // C is in D minor pentatonic.
  assert.equal(keyboardPress(control, 64, { context: keyboardContext(control) }), null); // E is not.
});

test('Keyboard own key and transpose use the same context as the renderer', () => {
  const control = createControl('Keyboard', { Keyboard: { key: 0, scale: 'major', scaleLock: 'quantize', transpose: 2, octave: 1, channel: 4, velocity: 91 } });
  assert.deepEqual(keyboardPress(control, 61, { context: keyboardContext(control) }), { note: 74, channel: 4, velocity: 91 });
});

test('Keyboard exposes its played note and velocity to its advertised device-binding ports', () => {
  const control = createControl('Keyboard', { Keyboard: { __note: 74, __velocity: 91 } });
  assert.deepEqual(controlPortValues(control), { note: 74, velocity: 91 });
  control._children.Keyboard.__velocity = 0;
  assert.deepEqual(controlPortValues(control), { note: 74, velocity: 0 });
});
