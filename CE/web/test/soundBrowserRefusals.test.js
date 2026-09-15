// soundBrowserRefusals.test.js — the Listen rail's refusal breakdown, rendered.
//
// WHY THIS FILE EXISTS, and it is worth saying plainly: three changes were shipped to this panel
// and to PerformancePanel with no render test between them, on the reasoning that the Vite build
// compiles the markup and the store tests cover the data. Both are true and neither looks at what
// the panel actually draws — a row could be wired to the wrong count, or guarded so it never
// appears, and every other check would still pass.
//
// What is pinned here is the thing the breakdown exists for: a refusal a re-run can fix is told
// apart from one it cannot, so "measure everything again" stops being offered as the answer to
// both. If these rows ever merge back into one number, the feature is gone and this fails.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import { get } from 'svelte/store';
import SoundBrowser from '../src/CE_Application/sections/SoundBrowser.svelte';
import {
  hostLibrary, hostState, mockHostState, requestLibrary, emptyLibraryQuery,
  normalizeHostLibrary,
} from '../src/CE_Application/stores/instrumentHost.js';

/** The panel reads its library from the store, so a test drives it by putting one there. */
function renderWith(library) {
  hostState.set(mockHostState());
  requestLibrary(emptyLibraryQuery());
  if (library) hostLibrary.set(normalizeHostLibrary(library));
  return render(SoundBrowser, { props: {} }).body;
}

/** One cause's row as rendered, or null when it is absent. Sliced by test id rather than
    matched whole, because Svelte appends a scoped class to every element and the hash changes
    whenever the stylesheet does — a test that pinned it would fail on an unrelated edit. */
const rowFor = (html, cause) => {
  const start = html.indexOf(`data-testid="refusal-${cause}"`);
  if (start < 0) return null;
  return html.slice(start, html.indexOf('</div>', start));
};

/** The count shown on one cause's row, or null when the row is absent. */
const rowCount = (html, cause) => {
  const row = rowFor(html, cause);
  const match = row && /class="rn[^"]*">(\d+)</.exec(row);
  return match ? Number(match[1]) : null;
};

test('the mock library draws a row per cause it actually has', () => {
  const html = renderWith(null);
  const counts = get(hostLibrary).counts;

  assert.equal(counts.refused, 2, 'the preview ships two refusals of different kinds');
  assert.match(html, /data-testid="refusal-causes"/, 'the breakdown is drawn');
  assert.equal(rowCount(html, 'crashed'), 1);
  assert.equal(rowCount(html, 'unreadable'), 1);

  // A cause with nothing in it is not a row saying zero.
  assert.equal(rowCount(html, 'mismatch'), null, 'an empty cause draws no row');
  assert.equal(rowCount(html, 'unsupported'), null);
  assert.equal(rowCount(html, 'other'), null);
});

test('only the retry-worthy row says a re-run may help', () => {
  const html = renderWith(null);

  assert.match(rowFor(html, 'crashed'), /asking again may work/,
    'a crash is the one a re-run can fix, and must say so');
  assert.match(rowFor(html, 'unreadable'), /asking again will not help/,
    'a damaged state fails identically for ever, and must say so');
});

test('the rows add up to the total above them', () => {
  const html = renderWith(null);
  const counts = get(hostLibrary).counts;

  const shown = ['crashed', 'unreadable', 'mismatch', 'unsupported', 'other']
    .map((cause) => rowCount(html, cause) ?? 0)
    .reduce((a, b) => a + b, 0);

  assert.equal(shown, counts.refused,
    'a breakdown that does not sum to its heading is two different questions on one line');
  assert.match(html, new RegExp(`${counts.refused} could not be heard`),
    'and the heading is still the total');
});

test('nothing refused draws no breakdown at all', () => {
  const html = renderWith({
    records: [],
    counts: { total: 0, refused: 0, refusedByCause: {}, measurable: 0, measured: 0 },
  });

  assert.ok(!html.includes('data-testid="refusal-causes"'),
    'an empty breakdown is absent, not a set of zeroes');
  assert.ok(!html.includes('could not be heard'));
});

test('an unrecognised cause is a visible row rather than a silent loss', () => {
  // `other` is what a refusal string that has moved lands in. The whole reason it exists is to
  // be seen: a sound quietly dropped from the arithmetic is the failure this design avoids.
  const html = renderWith({
    records: [],
    counts: { total: 9, refused: 3, measurable: 0, measured: 6,
              refusedByCause: { crashed: 0, unreadable: 0, mismatch: 0, unsupported: 0, other: 3 } },
  });

  assert.equal(rowCount(html, 'other'), 3, 'an unclassified refusal is still counted on screen');
  assert.match(html, /for a reason this build does not recognise/);
});

test('the Added recently row shows what arrived, and toggles the filter', () => {
  const html = renderWith(null);
  const counts = get(hostLibrary).counts;

  const start = html.indexOf('data-testid="added-recently"');
  assert.ok(start > 0, 'the row is drawn');
  const row = html.slice(html.lastIndexOf('<button', start), html.indexOf('</button>', start));

  assert.ok(counts.addedRecently > 0, 'the preview ships something that arrived lately');
  assert.match(row, new RegExp(`>${counts.addedRecently}</span>`),
    'and the row shows that count, not the whole library');
  assert.match(row, /Added recently/);

  // The tooltip carries the two things somebody would otherwise report as bugs.
  assert.match(row, /has no arrival time and is not recent/);
  assert.match(row, /moved keeps the record it already had/);
});
