import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
  midiLearnState, startMidiLearn, stopMidiLearn, isLearning,
  midiExpressionState, ingestMidiHexForTest,
} from '../src/CE_Application/stores/noteInput.js';
import { routerSettingsForLearned } from '../src/CE_Application/utils/routerLayout.js';

// Sweep a CC in, as the hardware listener would.
function sweep(status, cc, from, to, step = 8) {
  for (let v = from; v <= to; v += step) {
    ingestMidiHexForTest(`${status} ${cc.toString(16).padStart(2, '0')} ${v.toString(16).padStart(2, '0')}`);
  }
}

test('a learn session only collects while it is running', (t) => {
  t.after(() => stopMidiLearn());
  assert.equal(isLearning('r1'), false);
  // bytes arriving before Learn is pressed are not remembered
  sweep('B0', 1, 0, 120);
  startMidiLearn('r1');
  assert.equal(isLearning('r1'), true);
  assert.equal(get(midiLearnState).best, null);
  assert.deepEqual(get(midiLearnState).session.candidates, {});
});

test('the session adopts the controller that moved most, then can be stopped', (t) => {
  t.after(() => stopMidiLearn());
  startMidiLearn('r1');
  ingestMidiHexForTest('90 3C 50');     // a stray note first
  sweep('B0', 74, 0, 127);              // then the real sweep
  const best = get(midiLearnState).best;
  assert.equal(best.kind, 'cc');
  assert.equal(best.cc, 74);
  assert.deepEqual(routerSettingsForLearned(best), { source: 'cc', ccNumber: 74, inputChannel: 1 });
  stopMidiLearn();
  assert.equal(isLearning('r1'), false);
  assert.equal(get(midiLearnState).best, null);
});

test('only one session runs at a time — starting a second cancels the first', (t) => {
  t.after(() => stopMidiLearn());
  startMidiLearn('r1');
  sweep('B0', 1, 0, 120);
  assert.ok(get(midiLearnState).best);
  startMidiLearn('r2');                 // a different control takes over
  assert.equal(isLearning('r1'), false);
  assert.equal(isLearning('r2'), true);
  assert.equal(get(midiLearnState).best, null);   // and starts from scratch
});

test('learning does not disturb the live expression levels', (t) => {
  t.after(() => stopMidiLearn());
  ingestMidiHexForTest('B0 01 40');
  const before = get(midiExpressionState).expression;
  startMidiLearn('r1');
  sweep('B0', 74, 0, 64);
  // the expression store kept tracking (it is the same byte stream)…
  assert.notEqual(get(midiExpressionState).expression, before);
  // …and stopping the session leaves those levels alone
  const levels = get(midiExpressionState).expression;
  stopMidiLearn();
  assert.equal(get(midiExpressionState).expression, levels);
});
