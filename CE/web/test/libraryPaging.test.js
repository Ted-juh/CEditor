import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIBRARY_SORTS, emptyLibraryQuery, mergeLibraryPage, mockHostLibrary, normalizeLibraryQuery,
  sortLibraryRecords,
} from '../src/CE_Application/stores/instrumentHost.js';

const rec = (name, fields = {}) => ({ name, instrument: '', category: '', rating: 0, lastLoadedAtMs: 0,
  loadCount: 0, addedAtMs: 0, sonic: null, ...fields });

test('a sort is part of the query, and an unknown one is dropped', () => {
  const q = normalizeLibraryQuery({ sort: 'recent', sortDescending: true });
  assert.deepEqual([q.sort, q.sortDescending], ['recent', true]);
  assert.equal(normalizeLibraryQuery({ sort: 'colour' }).sort, '');
  assert.equal(emptyLibraryQuery().sort, '');
  assert.ok(LIBRARY_SORTS.every((s) => typeof s.descending === 'boolean'));
});

test('sorting mirrors the host: natural names, unknowns last both ways', () => {
  const records = [
    rec('Pad 10', { category: 'Pad', sonic: { brightness: 0.9 } }),
    rec('Bass', { rating: 5, lastLoadedAtMs: 3000, sonic: { brightness: 0.2 } }),
    rec('Pad 2', { category: 'Pad', rating: 3, lastLoadedAtMs: 1000 }),
    rec('Lead', { category: 'Lead', rating: 4, lastLoadedAtMs: 2000, sonic: { brightness: 0.6 } }),
  ];
  const names = (key, desc) => sortLibraryRecords(records, key, desc).map((r) => r.name).join(',');
  assert.equal(names('', false), 'Pad 10,Bass,Pad 2,Lead');
  assert.equal(names('name', false), 'Bass,Lead,Pad 2,Pad 10');
  assert.equal(names('name', true), 'Pad 10,Pad 2,Lead,Bass');
  assert.equal(names('category', false), 'Lead,Pad 2,Pad 10,Bass');
  assert.equal(names('rating', true), 'Bass,Lead,Pad 2,Pad 10');
  assert.equal(names('rating', false), 'Pad 2,Lead,Bass,Pad 10');
  assert.equal(names('recent', true), 'Bass,Lead,Pad 2,Pad 10');
  assert.equal(names('brightness', true), 'Pad 10,Lead,Bass,Pad 2');
  assert.equal(names('brightness', false), 'Bass,Lead,Pad 10,Pad 2');
});

test('a later page joins the rows held; a page from another view is dropped', () => {
  const request = normalizeLibraryQuery({ text: 'pad' });
  const first = { offset: 0, request, records: [{ recordId: 'a' }, { recordId: 'b' }] };
  const second = { offset: 2, request, records: [{ recordId: 'c' }] };
  const joined = mergeLibraryPage(first, second);
  assert.deepEqual(joined.records.map((r) => r.recordId), ['a', 'b', 'c']);
  assert.equal(joined.offset, 0);
  const stale = { offset: 2, request: normalizeLibraryQuery({ text: 'bass' }), records: [{ recordId: 'x' }] };
  assert.equal(mergeLibraryPage(first, stale), first, 'a page for a view that changed is ignored');
  const gap = { offset: 5, request, records: [{ recordId: 'z' }] };
  assert.equal(mergeLibraryPage(first, gap), first, 'a page that would leave a hole is ignored');
  assert.equal(mergeLibraryPage(joined, first), first, 'a first page starts over');
});

test('the demo library pages and sorts like the host', () => {
  const all = mockHostLibrary(emptyLibraryQuery());
  const q = { ...emptyLibraryQuery(), sort: 'name' };
  const page = mockHostLibrary(q, '', { offset: 1, limit: 2 });
  assert.equal(page.records.length, Math.min(2, Math.max(0, all.records.length - 1)));
  assert.equal(page.offset, 1);
  assert.equal(page.counts.matched, all.counts.matched, 'the count is the whole result');
  const sorted = mockHostLibrary(q).records.map((r) => r.name);
  assert.deepEqual(page.records.map((r) => r.name), sorted.slice(1, 3));
});
