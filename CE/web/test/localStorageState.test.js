import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readStoredJson, removeStoredValue, resetStoredQuotaState, storedKeyIsOverQuota, writeStoredJson,
} from '../src/CE_Application/utils/localStorageState.js';

/**
 * A localStorage that refuses anything over `limit` bytes, the way a browser does, and counts what
 * it was asked to do. `JSON.stringify` is counted separately, because the cost this guard exists
 * to remove is the SERIALIZE, not the storage call — a guard that skipped only the setItem would
 * save nothing measurable.
 */
function fakeStorage({ limit = Infinity } = {}) {
  const map = new Map();
  const stats = { setItems: 0, refused: 0, bytesOffered: 0 };
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      stats.setItems += 1;
      stats.bytesOffered += String(v).length;
      if (String(v).length > limit) {
        stats.refused += 1;
        const error = new Error('quota');
        error.name = 'QuotaExceededError';
        throw error;
      }
      map.set(k, String(v));
    },
    removeItem: (k) => { map.delete(k); },
  };
  return stats;
}

function countingValue(size) {
  // An object whose serialization is expensive to produce, so a test can prove it was not produced.
  const value = { blob: 'x'.repeat(size) };
  let serialized = 0;
  Object.defineProperty(value, 'toJSON', {
    value() { serialized += 1; return { blob: this.blob }; },
    enumerable: false,
  });
  return { value, count: () => serialized };
}

test.beforeEach(() => { resetStoredQuotaState(); });
test.afterEach(() => { delete globalThis.localStorage; });

test('a value that fits is written', () => {
  const stats = fakeStorage({ limit: 1000 });
  writeStoredJson('k', { a: 1 });
  assert.equal(stats.setItems, 1);
  assert.deepEqual(readStoredJson('k', null), { a: 1 });
  assert.equal(storedKeyIsOverQuota('k'), false);
});

test('writing the same value twice stores it once', () => {
  const stats = fakeStorage({ limit: 1000 });
  writeStoredJson('k', { a: 1 });
  writeStoredJson('k', { a: 1 });
  assert.equal(stats.setItems, 1);
});

test('a key refused for size is never serialized again', () => {
  // THE WHOLE POINT. The autosave writes a document that expands to 21 MB into a 5 MB store: the
  // setItem throws, the failure is swallowed, and the JSON.stringify that built the 21 MB string
  // cost 225 ms of blocked main thread to produce something immediately discarded — on every
  // autosave tick, forever.
  const stats = fakeStorage({ limit: 50 });
  const big = countingValue(500);

  writeStoredJson('huge', big.value);
  assert.equal(stats.refused, 1, 'the first attempt should reach the browser and be refused');
  assert.equal(big.count(), 1, 'and it has to be serialized once to find that out');
  assert.equal(storedKeyIsOverQuota('huge'), true);

  for (let i = 0; i < 20; i += 1) writeStoredJson('huge', big.value);
  assert.equal(big.count(), 1, 'nothing was serialized again');
  assert.equal(stats.setItems, 1, 'and nothing was offered to storage again');
});

test('one oversized key does not stop any other key', () => {
  const stats = fakeStorage({ limit: 50 });
  writeStoredJson('huge', { blob: 'x'.repeat(500) });
  writeStoredJson('small', { a: 1 });
  assert.equal(storedKeyIsOverQuota('huge'), true);
  assert.equal(storedKeyIsOverQuota('small'), false);
  assert.deepEqual(readStoredJson('small', null), { a: 1 });
  assert.equal(stats.refused, 1);
});

test('a failure that is not about size does not latch', () => {
  // Storage disabled, a security error, a serialization throw — none of those are "too big", and
  // they may not repeat. Latching on them would silently stop persisting UI state that was fine.
  const map = new Map();
  let attempts = 0;
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      attempts += 1;
      if (attempts === 1) { const e = new Error('nope'); e.name = 'SecurityError'; throw e; }
      map.set(k, String(v));
    },
    removeItem: (k) => { map.delete(k); },
  };

  writeStoredJson('k', { a: 1 });
  assert.equal(storedKeyIsOverQuota('k'), false);
  writeStoredJson('k', { a: 2 });
  assert.equal(attempts, 2, 'the second write was still attempted');
  assert.deepEqual(readStoredJson('k', null), { a: 2 });
});

test('the legacy numeric quota codes count too', () => {
  // Safari and older Firefox report the size refusal as a code, not a name.
  for (const code of [22, 1014]) {
    resetStoredQuotaState();
    const map = new Map();
    globalThis.localStorage = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: () => { const e = new Error('quota'); e.code = code; throw e; },
      removeItem: (k) => { map.delete(k); },
    };
    writeStoredJson('k', { a: 1 });
    assert.equal(storedKeyIsOverQuota('k'), true, `code ${code}`);
  }
});

test('removing the value gives the key another chance', () => {
  // Deleting is the one thing that can make room, so a later smaller value must be able to land.
  const stats = fakeStorage({ limit: 50 });
  writeStoredJson('k', { blob: 'x'.repeat(500) });
  assert.equal(storedKeyIsOverQuota('k'), true);

  removeStoredValue('k');
  assert.equal(storedKeyIsOverQuota('k'), false);

  writeStoredJson('k', { a: 1 });
  assert.deepEqual(readStoredJson('k', null), { a: 1 });
  assert.equal(stats.refused, 1);
});

test('a refused write leaves no cached string to mistake for a no-op', () => {
  // The dedupe compares against the last string written. A refused write stored nothing, so a
  // stale cache entry would make the NEXT value — possibly one that fits — look unchanged and be
  // skipped, losing it silently.
  const stats = fakeStorage({ limit: 50 });
  const value = { blob: 'x'.repeat(500) };

  writeStoredJson('k', value);
  assert.equal(storedKeyIsOverQuota('k'), true);
  removeStoredValue('k');
  writeStoredJson('k', value);        // still too big
  assert.equal(stats.refused, 2, 'it was genuinely offered again rather than deduped away');
});
