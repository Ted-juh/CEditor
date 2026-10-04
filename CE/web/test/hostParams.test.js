// The Params tab's helpers: which parameters fill from the centre, and where each one sits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isBipolarParameter, parameterPlaces } from '../src/CE_Application/stores/instrumentHost.js';

test('two-sided parameters are the ones centred AND named or printed as such', () => {
  assert.equal(isBipolarParameter({ name: 'Pan', defaultValue: 0.5, text: 'C' }), true);
  assert.equal(isBipolarParameter({ name: 'Osc 2', defaultValue: 0.5, text: '+0 st' }), true, 'a printed sign');
  assert.equal(isBipolarParameter({ name: 'Width', defaultValue: 0.5, text: '50%' }), true, 'a two-sided name');
  assert.equal(isBipolarParameter({ name: 'Cutoff', defaultValue: 0.5, text: '1.2 kHz' }), false,
    'a cutoff that happens to start in the middle is not two-sided');
  assert.equal(isBipolarParameter({ name: 'Pan', defaultValue: 0, text: 'L50' }), false, 'not centred by default');
});

test('each parameter lists the pages, knobs and macros it sits on', () => {
  const state = { rack: {
    pages: [{ name: 'Page 1', slots: [
      { assigned: true, partId: 'p1', parameterId: 'cutoff', kind: 'encoder', index: 2 },
      { assigned: true, partId: 'p1', parameterId: 'res', kind: 'pad', index: 0 },
      { assigned: true, partId: 'p2', parameterId: 'cutoff', kind: 'encoder', index: 0 },
    ] }],
    macros: [{ name: 'Bright', targets: [{ targetId: 'p1', parameterId: 'cutoff' }] }],
  } };
  const places = parameterPlaces(state, 'p1');
  assert.deepEqual(places.get('cutoff'), ['Page 1 · knob 3', 'Macro Bright']);
  assert.deepEqual(places.get('res'), ['Page 1 · pad 1']);
  assert.equal(places.has('wave'), false);
});
