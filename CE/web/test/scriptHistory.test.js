import test from 'node:test';
import assert from 'node:assert/strict';

import { updateHistoryList } from '../src/CE_Application/utils/scriptHistory.js';

const opts = { minIntervalMs: 1000, max: 3 };

test('appends the first snapshot', () => {
  const list = updateHistoryList([], 'a', 100, opts);
  assert.deepEqual(list, [{ t: 100, source: 'a' }]);
});

test('identical-to-latest source is ignored', () => {
  const start = [{ t: 100, source: 'a' }];
  const list = updateHistoryList(start, 'a', 5000, opts);
  assert.deepEqual(list, start);
});

test('rapid edits within the interval coalesce into the latest snapshot', () => {
  let list = [{ t: 100, source: 'a' }];
  list = updateHistoryList(list, 'ab', 400, opts);   // within 1000ms → replace
  assert.deepEqual(list, [{ t: 400, source: 'ab' }]);
});

test('edits spaced beyond the interval append new versions', () => {
  let list = [{ t: 100, source: 'a' }];
  list = updateHistoryList(list, 'ab', 2000, opts);  // > 1000ms → append
  assert.equal(list.length, 2);
  assert.deepEqual(list[1], { t: 2000, source: 'ab' });
});

test('trims to max, dropping the oldest', () => {
  let list = [];
  list = updateHistoryList(list, 'a', 0, opts);
  list = updateHistoryList(list, 'b', 2000, opts);
  list = updateHistoryList(list, 'c', 4000, opts);
  list = updateHistoryList(list, 'd', 6000, opts); // 4th → drop 'a'
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((e) => e.source), ['b', 'c', 'd']);
});

test('does not mutate the input list', () => {
  const start = [{ t: 100, source: 'a' }];
  const copy = JSON.parse(JSON.stringify(start));
  updateHistoryList(start, 'b', 5000, opts);
  assert.deepEqual(start, copy);
});
