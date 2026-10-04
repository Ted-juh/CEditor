import test from 'node:test';
import assert from 'node:assert/strict';
import { NUDGES, nudgedNeighbours } from '../src/CE_Application/utils/soundNudges.js';

const sound = (recordId, sonic) => ({ recordId, sonic: { brightness: 0.5, attack: 0.1, tail: 0.5, width: 0.3, noisiness: 0.1, ...sonic } });

test('brighter finds the nearest sound that is brighter, not merely the nearest', () => {
  const here = sound('here', {});
  const twin = sound('twin', { brightness: 0.52 });            // nearest, but not brighter enough
  const brighter = sound('brighter', { brightness: 0.7 });     // brighter, otherwise identical
  const farBrighter = sound('far', { brightness: 0.9, tail: 0.95 });
  const darker = sound('darker', { brightness: 0.2 });
  const result = nudgedNeighbours(here, [here, twin, brighter, farBrighter, darker], 'brighter');
  assert.deepEqual(result.map((r) => r.record.recordId), ['brighter', 'far']);
  assert.equal(result[0].percent, 100, 'identical apart from the nudged axis');
  assert.ok(result[0].step > 0.15);
  assert.deepEqual(nudgedNeighbours(here, [darker, brighter], 'darker').map((r) => r.record.recordId), ['darker']);
});

test('unmeasured and silent sounds are left out, and an unknown nudge gives nothing', () => {
  const here = sound('here', {});
  const unmeasured = { recordId: 'u', sonic: null };
  const silent = { recordId: 's', sonic: { ...sound('s', { tail: 0.9 }).sonic, silent: true } };
  assert.deepEqual(nudgedNeighbours(here, [unmeasured, silent], 'longer'), []);
  assert.deepEqual(nudgedNeighbours(here, [sound('x', { tail: 0.9 })], 'nonsense'), []);
  assert.deepEqual(nudgedNeighbours({ recordId: 'n', sonic: null }, [sound('x', {})], 'longer'), []);
  assert.equal(NUDGES.length, 6);
});
