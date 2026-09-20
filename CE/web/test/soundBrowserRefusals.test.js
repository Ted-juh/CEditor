// soundBrowserRefusals.test.js — the auditioner's refusal breakdown, and the browse rows that
// arrived with it, rendered.
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
//
// Two components draw what this file checks. The auditioner and its housekeeping live in the
// library panel beside the rack; the browse — its filter row, its record rows and the inspector —
// is the Sounds dock, which keeps the filter row and the inspector behind toggles, so a render
// that needs them asks for them open.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';
import { get } from 'svelte/store';
import SoundBrowser from '../src/CE_Application/sections/SoundBrowser.svelte';
import HostLibraryPanel from '../src/CE_Application/sections/HostLibraryPanel.svelte';
import {
  hostLibrary, hostState, mockHostState, requestLibrary, emptyLibraryQuery,
  normalizeHostLibrary, hostRecordFamily, normalizeRecordFamily,
  mergeDuplicateSet, resetMockLibraryState,
} from '../src/CE_Application/stores/instrumentHost.js';

/** Both panels read their library from the store, so a test drives them by putting one there. */
function seed(library) {
  hostState.set(mockHostState());
  requestLibrary(emptyLibraryQuery());
  if (library) hostLibrary.set(normalizeHostLibrary(library));
}

/** The auditioner and its housekeeping. */
function renderLibrary(library) {
  seed(library);
  return render(HostLibraryPanel, { props: {} }).body;
}

/** The browse, with its filter row open. */
function renderBrowser(library) {
  seed(library);
  return render(SoundBrowser, { props: { showFilters: true } }).body;
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
  const html = renderLibrary(null);
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
  const html = renderLibrary(null);

  assert.match(rowFor(html, 'crashed'), /asking again may work/,
    'a crash is the one a re-run can fix, and must say so');
  assert.match(rowFor(html, 'unreadable'), /asking again will not help/,
    'a damaged state fails identically for ever, and must say so');
});

test('the rows add up to the total above them', () => {
  const html = renderLibrary(null);
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
  const html = renderLibrary({
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
  const html = renderLibrary({
    records: [],
    counts: { total: 9, refused: 3, measurable: 0, measured: 6,
              refusedByCause: { crashed: 0, unreadable: 0, mismatch: 0, unsupported: 0, other: 3 } },
  });

  assert.equal(rowCount(html, 'other'), 3, 'an unclassified refusal is still counted on screen');
  assert.match(html, /for a reason this build does not recognise/);
});

test('the Added recently row shows what arrived, and toggles the filter', () => {
  const html = renderBrowser(null);
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

test('the filter row starts closed, so a browse is a list first', () => {
  seed(null);
  const html = render(SoundBrowser, { props: {} }).body;
  assert.ok(!html.includes('data-testid="added-recently"'),
    'the rows above live in the filter row, which a caller has to ask for');
});

test('a record with a line draws it as a tree, marking where you are', () => {
  hostState.set(mockHostState());
  // The panel draws a family only for the record it is SHOWING, and with nothing clicked that is
  // the first row. So narrow the view until the middle of the three-generation family is first,
  // which is also the interesting case: one above it and one below.
  requestLibrary({ ...emptyLibraryQuery(), text: 'darker' });
  hostRecordFamily.set(normalizeRecordFamily({
    recordId: 'lib-8',
    rootRecordId: 'lib-1',
    truncated: false,
    nodes: [
      { recordId: 'lib-1', name: 'Warm Pad', parentRecordId: '', depth: 0 },
      { recordId: 'lib-8', name: 'Warm Pad Darker', parentRecordId: 'lib-1', depth: 1 },
      { recordId: 'lib-9', name: 'Warm Pad Darker, Longer', parentRecordId: 'lib-8', depth: 2 },
    ],
  }));

  const html = render(SoundBrowser, { props: { showDetails: true } }).body;
  assert.match(html, /data-testid="record-family"/, 'the line is drawn');
  const block = html.slice(html.indexOf('data-testid="record-family"'));

  assert.match(block, /Warm Pad</, 'the ancestor is there');
  assert.match(block, /Warm Pad Darker, Longer</, 'and so is the descendant');

  // Depth is drawn as indentation, so a tree reads as a tree rather than a flat list.
  assert.match(block, /padding-left:6px/);
  assert.match(block, /padding-left:18px/);
  assert.match(block, /padding-left:30px/);

  // Exactly one node is "you are here", and it is the selected one.
  const here = block.match(/data-testid="family-here"/g) ?? [];
  assert.equal(here.length, 1, 'one node is marked as where you are, not none and not several');
  const hereRow = block.slice(block.indexOf('data-testid="family-here"'));
  assert.match(hereRow.slice(0, 200), /Warm Pad Darker</,
    'and it is the record being looked at, not the root');
});

test('a family too big to show says so rather than implying it ended', () => {
  hostState.set(mockHostState());
  requestLibrary({ ...emptyLibraryQuery(), text: 'Warm Pad' });
  hostRecordFamily.set(normalizeRecordFamily({
    recordId: 'lib-1', rootRecordId: 'lib-1', truncated: true,
    nodes: [
      { recordId: 'lib-1', name: 'Warm Pad', parentRecordId: '', depth: 0 },
      { recordId: 'lib-8', name: 'Warm Pad Darker', parentRecordId: 'lib-1', depth: 1 },
    ],
  }));

  const html = render(SoundBrowser, { props: { showDetails: true } }).body;
  assert.match(html, /data-testid="family-truncated"/,
    'a capped family must not read as a complete one');
  assert.match(html, /and more than fits here/);
});

// --- folding a duplicate -------------------------------------------------------------------
//
// The library panel is where folding is offered and the browse is where it is undone, so both
// have to be drawn. What is pinned here is the pair of things that would turn folding into
// deleting if they went missing: the count of what is hidden, and the way back to it.

/** One button as rendered, sliced by its test id — the same technique the rows above use, and
    for the same reason: Svelte's scoped class hash changes whenever the stylesheet does. */
const buttonFor = (html, testid) => {
  const at = html.indexOf(`data-testid="${testid}"`);
  if (at < 0) return null;
  return html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at));
};

test('a duplicate set is offered a fold, and says what folding does', () => {
  const html = renderLibrary(null);

  assert.ok(buttonFor(html, 'duplicate-set'), 'the set is listed');
  const fold = buttonFor(html, 'fold-duplicates');
  assert.ok(fold, 'and folding it is offered');
  assert.ok(!/disabled/.test(fold), 'an identical set can be folded');
  assert.match(fold, /Nothing is deleted/,
    'the button says what it does, because a fold that reads as a delete will not be clicked');
});

test('a set that only sounds alike is offered nothing', () => {
  // The native side refuses it as well; this is the button not offering it in the first place.
  const html = renderLibrary({
    records: [],
    counts: { total: 2, hidden: 0 },
    duplicates: [{ keyRecordId: 'a', name: 'Init', identical: false, recordIds: ['a', 'b'] }],
  });

  const fold = buttonFor(html, 'fold-duplicates');
  assert.ok(fold, 'the row is still drawn');
  assert.match(fold, /disabled/, 'but folding it is not on offer');
  assert.match(fold, /only sound alike/);
});

test('folding leaves a counted way back', () => {
  hostState.set(mockHostState());
  resetMockLibraryState();
  requestLibrary(emptyLibraryQuery());
  const browse = () => render(SoundBrowser, { props: { showFilters: true } }).body;

  assert.equal(buttonFor(browse(), 'folded-away'), null,
    'with nothing folded there is nothing to offer');

  mergeDuplicateSet('lib-1');
  const html = browse();

  const row = buttonFor(html, 'folded-away');
  assert.ok(row, 'a fold leaves a row saying so — a fold nobody can count is one nobody can undo');
  assert.match(row, />1</, 'and it carries the count');
  assert.match(row, /never deleted/);

  // Showing them marks each folded row and offers it back.
  requestLibrary({ ...emptyLibraryQuery(), includeHidden: true });
  const shown = browse();
  assert.match(shown, /FOLDED/, 'a folded row is drawn as folded rather than as an ordinary sound');
  assert.ok(buttonFor(shown, 'unfold-record'), 'and can be put back from where it is');

  resetMockLibraryState();
});
