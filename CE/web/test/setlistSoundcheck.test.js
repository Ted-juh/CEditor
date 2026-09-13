import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSoundcheck, normalizeHostState } from '../src/CE_Application/stores/instrumentHost.js';
import { soundcheckDb, soundcheckReferenceStatus } from '../src/CE_Application/utils/setlistSoundcheck.js';

test('soundcheck distinguishes no measurement, silence, and overload', () => {
  assert.equal(soundcheckDb(0, false), '—');
  assert.equal(soundcheckDb(0, true), '−∞');
  assert.equal(soundcheckDb(0.5, true), '-6.0');
  assert.equal(soundcheckDb(2, true), '6.0');
  assert.equal(soundcheckDb(NaN, true), '—');
  assert.equal(soundcheckDb(-1, true), '—');
});
test('reference status is a timestamped check, never a loading claim', () => {
  assert.equal(soundcheckReferenceStatus().kind, 'unchecked');
  assert.equal(soundcheckReferenceStatus({ checkedAt: 1, issues: [] }).label, 'References found at last check');
  assert.equal(soundcheckReferenceStatus({ checkedAt: 1, issues: ['Missing rig'] }).label, '1 reference issue');
  assert.equal(soundcheckReferenceStatus({ checkedAt: 1, issues: ['Missing rig', 'Port'] }).kind, 'warning');
});
test('soundcheck normalizer rejects invalid readings but preserves genuine silence', () => {
  const entries = [null, {}, { itemId: 'silent', measured: true, peak: 0, rms: 0, seconds: 2 },
    ...[null, undefined, NaN, Infinity, -1, '0.5'].map((value, index) => ({ itemId: `bad${index}`, measured: true, peak: value, rms: value }))];
  const result = normalizeSoundcheck({ entries });
  assert.equal(result.entries.length, 7);
  assert.equal(result.entries[0].measured, true);
  assert.equal(result.entries[0].seconds, 2);
  assert.ok(result.entries.slice(1).every(row => !row.measured));
  assert.deepEqual(normalizeSoundcheck(null), normalizeHostState({}).soundcheck);
});
test('live measurement and earlier failed-attempt details survive state normalization', () => {
  const soundcheck = { activeItemId: 'song', currentItemId: 'song', blockedReason: '', entries: [
    { itemId: 'song', checkedAt: 12, basis: 'Rig A', issues: ['Missing output'], measured: true,
      measuredAt: 10, peak: 1.2, rms: 0.3, seconds: 8, error: 'No buffers received' }] };
  assert.deepEqual(normalizeHostState({ soundcheck }).soundcheck, soundcheck);
});
