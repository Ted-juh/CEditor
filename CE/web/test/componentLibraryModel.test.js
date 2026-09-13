// componentLibraryModel.test.js — the Library tab's model.
//
// The headline test runs the SHIPPED thumbnail builder on a component with more parts than its cap
// and shows what comes back, because the tab's central claim is that the saved picture is missing
// parts from both ends of the stack. The rest is filtering, sorting and the pin rule.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENVELOPE_PART_CAP,
  CARD_PART_CAP,
  LIBRARY_SORTS,
  LIBRARY_SORT_KEYS,
  describeEntry,
  describeLibrary,
  thumbnailLoss,
  filterLibrary,
  sortLibrary,
  libraryTags,
  libraryCounts,
  relativeTime,
  allLibraryFieldLabels,
} from '../src/CE_Application/utils/componentLibraryModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import { createCustomComponentThumbnail } from '../src/CE_Application/utils/customComponentPackage.js';

function componentWithParts(count) {
  const control = createControl('CustomComponent');
  const children = {};
  for (let i = 0; i < count; i += 1) {
    const part = createPartNode(`part${i}`, {});
    part.zIndex = i;
    part.name = `part${i}`;
    children[`part${i}`] = part;
  }
  control._children.Parts = { _type: 'Parts', _children: children };
  return control;
}

const entry = (over = {}) => ({
  id: 'pkg-1',
  name: 'Big Knob',
  version: '1.0.0',
  author: 'me',
  category: 'knobs',
  tags: ['knob', 'demo'],
  pinned: false,
  useCount: 0,
  savedAt: '2026-09-01T00:00:00.000Z',
  summary: { parts: 5, valueChannels: 2, publicInputs: 1, publicOutputs: 1, editableProperties: 2 },
  validation: { ok: true, issues: [] },
  readiness: { score: 80 },
  ...over,
});

// --- The picture ------------------------------------------------------------

test('the shipped thumbnail drops the bottom of the stack first', () => {
  // 22 parts, sorted ascending by z-index, `.slice(-18)`: what goes is parts 0-3, the background.
  const thumb = createCustomComponentThumbnail(componentWithParts(22));
  assert.equal(thumb.parts.length, ENVELOPE_PART_CAP);
  assert.deepEqual(thumb.parts.map((p) => p.name).slice(0, 2), ['part4', 'part5']);
  assert.equal(thumb.parts.at(-1).name, 'part21');
});

test('and the card then drops the top of what survived', () => {
  const thumb = createCustomComponentThumbnail(componentWithParts(22));
  const drawn = thumb.parts.slice(0, CARD_PART_CAP);
  assert.equal(drawn.length, 14);
  assert.equal(drawn.at(-1).name, 'part17', 'parts 18-21 are never drawn');
});

test('thumbnailLoss names both ends and the totals', () => {
  const loss = thumbnailLoss(describeEntry(entry({ summary: { parts: 22 } })));
  assert.equal(loss.total, 22);
  assert.equal(loss.kept, 18);
  assert.equal(loss.drawn, 14);
  assert.equal(loss.lostFromBottom, 4);
  assert.equal(loss.lostFromTop, 4);
  assert.match(loss.message, /14 of 22/);
});

test('a component small enough to draw whole loses nothing', () => {
  assert.equal(thumbnailLoss(describeEntry(entry({ summary: { parts: 5 } }))), null);
  assert.equal(thumbnailLoss(describeEntry(entry({ summary: { parts: 14 } }))), null);
  assert.equal(thumbnailLoss(describeEntry(entry({ summary: { parts: 0 } }))), null);
});

test('between the two caps only the card cap bites', () => {
  const loss = thumbnailLoss(describeEntry(entry({ summary: { parts: 16 } })));
  assert.equal(loss.lostFromBottom, 0);
  assert.equal(loss.lostFromTop, 2);
});

// --- Reading an entry -------------------------------------------------------

test('an entry reduces to what the grid reads, with nothing undefined', () => {
  const row = describeEntry(entry(), 3);
  assert.equal(row.name, 'Big Knob');
  assert.equal(row.index, 3);
  assert.equal(row.readiness, 80);
  assert.equal(row.valid, true);
  assert.deepEqual(row.tags, ['knob', 'demo']);
  for (const [key, value] of Object.entries(row)) {
    if (key === 'component' || key === 'envelope' || key === 'entry') continue;
    assert.notEqual(value, undefined, `${key} is undefined`);
  }
});

test('a half-empty entry still reads', () => {
  const row = describeEntry({});
  assert.equal(row.name, 'Untitled');
  assert.equal(row.tags.length, 0);
  assert.equal(row.valid, true, 'no validation block is not an invalid package');
  assert.equal(row.readiness, 0);
});

test('a package with issues is marked invalid', () => {
  const row = describeEntry(entry({ validation: { ok: false, issues: ['a', 'b'] } }));
  assert.equal(row.valid, false);
  assert.equal(row.issues.length, 2);
});

// --- Filtering --------------------------------------------------------------

// Distinct categories on purpose: the fixture's first draft left them all as "knobs", which made
// a search for "knob" match every entry through the category and looked like a bug in the filter.
// It was the fixture. The filter searching the category is deliberate and is asserted below.
const rows = describeLibrary([
  entry({ id: 'a', name: 'Big Knob', category: 'knobs', tags: ['knob'], useCount: 9, readiness: { score: 40 }, pinned: false }),
  entry({ id: 'b', name: 'Slim Fader', author: 'sam', category: 'faders', tags: ['fader', 'mixer'], useCount: 2, readiness: { score: 90 } }),
  entry({ id: 'c', name: 'Amber LED', category: 'lamps', tags: ['led'], useCount: 0, readiness: { score: 70 }, pinned: true }),
]);

test('the search box matches name, author, category and tags', () => {
  assert.deepEqual(filterLibrary(rows, 'knob').map((r) => r.id), ['a']);
  assert.deepEqual(filterLibrary(rows, 'sam').map((r) => r.id), ['b']);
  assert.deepEqual(filterLibrary(rows, 'mixer').map((r) => r.id), ['b']);
  assert.deepEqual(filterLibrary(rows, 'lamps').map((r) => r.id), ['c'], 'the category too');
});

test('several words all have to match', () => {
  assert.deepEqual(filterLibrary(rows, 'slim fader').map((r) => r.id), ['b']);
  assert.deepEqual(filterLibrary(rows, 'slim knob').map((r) => r.id), []);
});

test('an empty search returns everything, and does not alias the input', () => {
  const out = filterLibrary(rows, '   ');
  assert.equal(out.length, 3);
  out.pop();
  assert.equal(rows.length, 3, 'the caller must not be able to shorten the library');
});

// --- Sorting ----------------------------------------------------------------

test('a pinned entry leads whatever the sort', () => {
  for (const key of LIBRARY_SORT_KEYS) {
    assert.equal(sortLibrary(rows, key)[0].id, 'c', `${key} buried the pinned entry`);
  }
});

test('the sorts order what they say they order', () => {
  assert.deepEqual(sortLibrary(rows, 'used').map((r) => r.id), ['c', 'a', 'b']);
  assert.deepEqual(sortLibrary(rows, 'ready').map((r) => r.id), ['c', 'b', 'a']);
  assert.deepEqual(sortLibrary(rows, 'name').map((r) => r.id), ['c', 'a', 'b']);
  assert.deepEqual(sortLibrary(rows, 'recent').map((r) => r.id), ['c', 'a', 'b']);
});

test('an unknown sort falls back rather than throwing', () => {
  assert.equal(sortLibrary(rows, 'nonsense').length, 3);
});

test('sorting is a total order, so an unrelated change cannot reshuffle it', () => {
  const once = sortLibrary(rows, 'used').map((r) => r.id);
  const twice = sortLibrary([...rows].reverse(), 'used').map((r) => r.id);
  assert.deepEqual(once, twice);
});

test('every sort is described for the picker', () => {
  for (const sort of LIBRARY_SORTS) assert.ok(sort.label && sort.hint, `${sort.key} is not described`);
});

// --- Tags and counts --------------------------------------------------------

test('tags come back with their counts, most used first', () => {
  const many = describeLibrary([
    entry({ id: 'a', tags: ['knob', 'dark'] }),
    entry({ id: 'b', tags: ['knob'] }),
    entry({ id: 'c', tags: ['led'] }),
  ]);
  assert.deepEqual(libraryTags(many), [
    { tag: 'knob', count: 2 },
    { tag: 'dark', count: 1 },
    { tag: 'led', count: 1 },
  ]);
});

test('the counts say how big the library is and what is wrong with it', () => {
  const counts = libraryCounts(describeLibrary([
    entry({ id: 'a', pinned: true }),
    entry({ id: 'b', validation: { ok: false, issues: ['x'] } }),
    entry({ id: 'c', useCount: 4 }),
  ]));
  assert.deepEqual(counts, { total: 3, pinned: 1, invalid: 1, unused: 2 });
});

test('relativeTime reads at every scale, and says nothing about nonsense', () => {
  const now = Date.parse('2026-09-10T12:00:00.000Z');
  assert.equal(relativeTime('2026-09-10T11:59:40.000Z', now), 'just now');
  assert.equal(relativeTime('2026-09-10T11:30:00.000Z', now), '30m ago');
  assert.equal(relativeTime('2026-09-10T06:00:00.000Z', now), '6h ago');
  assert.equal(relativeTime('2026-09-03T12:00:00.000Z', now), '7d ago');
  assert.equal(relativeTime('2026-06-10T12:00:00.000Z', now), '3mo ago');
  assert.equal(relativeTime('2024-09-10T12:00:00.000Z', now), '2y ago');
  assert.equal(relativeTime('', now), '');
  assert.equal(relativeTime('not a date', now), '');
});

test('field labels are collected for the day the panel rows come out', () => {
  const labels = allLibraryFieldLabels();
  assert.ok(labels.includes('Name'));
  assert.ok(labels.includes('Recent'));
  assert.equal(new Set(labels).size, labels.length, 'a duplicate label would double a search hit');
});
