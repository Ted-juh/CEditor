// The exported plug-in's page and its DAW parameters: values, and a drag held as one gesture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paramEvents, endOpenGestures } from '../src/CE_Application/utils/playerParamEvents.js';

const controlByParam = { cutoff: { controlId: 'k1' }, reso: { controlId: 'k2' } };
const valueOf = (session) => session?.value;

function stream() {
  const state = { lastParamValue: {}, openGestures: new Set(), ready: false, valueOf };
  return (sessions) => {
    const events = paramEvents(sessions, controlByParam, state);
    state.ready = true;
    return events.map(([name, p]) => (name === 'paramGesture' ? `${p.phase}:${p.id}` : `${p.id}=${p.value}`));
  };
}

test('the first pass only learns the values the panel opened with', () => {
  const step = stream();
  assert.deepEqual(step({ k1: { value: 10 }, k2: { value: 3, dragging: true } }), []);
});

test('a drag is one gesture: begin, every value, end', () => {
  const step = stream();
  step({ k1: { value: 10 } });
  assert.deepEqual(step({ k1: { value: 11, dragging: true } }), ['begin:cutoff', 'cutoff=11']);
  assert.deepEqual(step({ k1: { value: 12, dragging: true } }), ['cutoff=12']);
  assert.deepEqual(step({ k1: { value: 13, dragging: true } }), ['cutoff=13']);
  assert.deepEqual(step({ k1: { value: 14 } }), ['cutoff=14', 'end:cutoff']);
  // A change with no drag (a wheel step, a key) is a value on its own, as before.
  assert.deepEqual(step({ k1: { value: 15 } }), ['cutoff=15']);
});

test('a press that moves nothing still ends its gesture', () => {
  const step = stream();
  step({ k1: { value: 10 } });
  assert.deepEqual(step({ k1: { value: 10, dragging: true } }), ['begin:cutoff']);
  assert.deepEqual(step({ k1: { value: 10 } }), ['end:cutoff']);
});

test('a value the automation path already wrote is not sent back', () => {
  const state = { lastParamValue: {}, openGestures: new Set(), ready: true, valueOf };
  state.lastParamValue.cutoff = 50;   // applyParamSync writes this before it moves the control
  assert.deepEqual(paramEvents({ k1: { value: 50 } }, controlByParam, state), []);
});

test('a closing page ends every gesture it holds', () => {
  const open = new Set(['cutoff', 'reso']);
  assert.deepEqual(endOpenGestures(open).map(([, p]) => `${p.phase}:${p.id}`), ['end:cutoff', 'end:reso']);
  assert.equal(open.size, 0);
});
