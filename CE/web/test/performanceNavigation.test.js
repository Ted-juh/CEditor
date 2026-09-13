import test from 'node:test';
import assert from 'node:assert/strict';
import { PERFORMANCE_GROUPS, performanceGroupFor, normalisePerformanceNavigation,
  selectPerformanceTool, restorePerformanceNavigation, storePerformanceNavigation } from '../src/CE_Application/utils/performanceNavigation.js';

test('all thirteen existing Performance tools occur once in a group', () => {
  const ids = PERFORMANCE_GROUPS.flatMap(g => g.tools.map(t => t.id));
  assert.equal(new Set(ids).size, 13);
  assert.deepEqual([...ids].sort(), ['patterns','looper','gestures','recorder','modulation','lfos',
    'envelopes','msegs','random','tuning','clips','arranger','setlist'].sort());
});
test('switching tools remembers each group independently, including direct navigation', () => {
  let state = selectPerformanceTool(null, 'lfos');
  state = selectPerformanceTool(state, 'recorder');
  state = selectPerformanceTool(state, state.lastTools.modulation);
  assert.equal(state.tab, 'lfos');
  assert.equal(state.lastTools.capture, 'recorder');
  state = selectPerformanceTool(state, 'modulation');
  assert.equal(performanceGroupFor(state.tab).id, 'modulation');
  assert.equal(state.lastTools.modulation, 'modulation');
  assert.deepEqual(selectPerformanceTool(state, 'not-a-tool'), state);
});
test('saved navigation survives reload and rejects malformed or cross-group memories', () => {
  let saved;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  const state = selectPerformanceTool(selectPerformanceTool(null, 'random'), 'tuning');
  storePerformanceNavigation(state, storage);
  assert.deepEqual(restorePerformanceNavigation(storage), state);
  saved = '{broken';
  assert.equal(restorePerformanceNavigation(storage).tab, 'patterns');
  assert.equal(normalisePerformanceNavigation({ tab: 'lfos', lastTools: { capture: 'lfos' } }).lastTools.capture, 'looper');
  assert.equal(normalisePerformanceNavigation(null).tab, 'patterns');
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } };
  assert.equal(restorePerformanceNavigation(blocked).tab, 'patterns');
  assert.doesNotThrow(() => storePerformanceNavigation(state, blocked));
});
