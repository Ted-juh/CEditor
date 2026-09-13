// dockFieldIndex.test.js — so a search still finds a property that lives in a dock tab.
//
// The panel's search hides rows that do not match, so it only ever finds what the panel is drawing.
// The moment a row moves into a tab, searching for it returns nothing — which reads as "this
// application does not have that" rather than "it moved". This index is what answers instead.
//
// The last test is the one that matters most: it pins that all eight `all…FieldLabels()` functions
// are actually CALLED. Every one of them shipped "ready for the day the panel's rows come out", and
// on the day that day arrived all eight were called zero times.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DOCK_FIELD_INDEX, MIN_QUERY, indexedLabelCount, tabAppliesTo, labelMatches,
  findDockFields, describeHits,
} from '../src/CE_Application/utils/dockFieldIndex.js';
import { DOCK_OPENERS } from '../src/CE_Application/utils/dockOpeners.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const label = () => createControl('Label');
const custom = () => createControl('CustomComponent');
const sequencer = () => createControl('StepSequencer');
const knob = () => createControl('Knob');

test('every tab in the index is a tab there is an opener for', () => {
  for (const row of DOCK_FIELD_INDEX) {
    assert.ok(DOCK_OPENERS[row.tab], `${row.tab} has no opener`);
    assert.ok(row.labels.length > 0, `${row.tab} contributes no labels`);
  }
  assert.equal(DOCK_FIELD_INDEX.length, 8);
});

test('and all eight label lists are non-trivial', () => {
  // A floor, not an exact count: a tab that grows a control and declares its label should not fail
  // here. What must not happen is a list quietly emptying, which is how the search goes blind.
  for (const row of DOCK_FIELD_INDEX) {
    assert.ok(row.labels.length >= 5, `${row.tab} declares only ${row.labels.length} labels`);
  }
  assert.ok(indexedLabelCount() >= 190, `only ${indexedLabelCount()} labels indexed`);
});

// --- Matching ---------------------------------------------------------------

test('a label matches from the start of a word, not the middle', () => {
  assert.equal(labelMatches('Glow', 'glo'), true);
  assert.equal(labelMatches('Inner Glow', 'glow'), true, 'the second word counts');
  assert.equal(labelMatches('Position', 'on'), false, 'a middle match would drag half the index in');
  assert.equal(labelMatches('Frame W', 'frame'), true);
});

test('a one-character query matches nothing at all', () => {
  assert.equal(MIN_QUERY, 2);
  assert.deepEqual(findDockFields('x', label()), []);
  assert.deepEqual(findDockFields('', label()), []);
  assert.deepEqual(findDockFields('  ', label()), []);
});

// --- Scope ------------------------------------------------------------------

test('a search only offers tabs that have something to say about this control', () => {
  assert.deepEqual(findDockFields('glow', label()).map((h) => h.tab), ['effects']);
  assert.deepEqual(findDockFields('glow', knob()).map((h) => h.tab), [], 'a Knob has no text or lighting');
});

test('the Designer tab answers from its own registry, not from a section name', () => {
  assert.deepEqual(findDockFields('pattern', sequencer()).map((h) => h.tab), ['designer']);
  assert.deepEqual(findDockFields('pattern', label()).map((h) => h.tab), [], 'a Label has no designer');
  // Envelope has one; Phrase does not yet, even though it has a pattern.
  assert.deepEqual(findDockFields('curve', createControl('Envelope')).map((h) => h.tab), ['designer']);
  assert.deepEqual(findDockFields('curve', createControl('Phrase')).map((h) => h.tab), []);
});

test('an animation property is offered on a control that can hold animations', () => {
  assert.deepEqual(findDockFields('easing', custom()).map((h) => h.tab), ['animation']);
  assert.equal(label()._children.Animations, undefined, 'a Label has no Animations section');
  assert.deepEqual(findDockFields('easing', label()).map((h) => h.tab), []);
});

test('the Library applies to everything, because it edits the library rather than a control', () => {
  const row = DOCK_FIELD_INDEX.find((entry) => entry.tab === 'library');
  assert.equal(row.sections, null);
  assert.equal(tabAppliesTo(row, knob()), true);
  assert.deepEqual(findDockFields('tags', knob()).map((h) => h.tab), ['library']);
});

// --- What the row reads out -------------------------------------------------

test('a hit names what it matched, and says how many it left out', () => {
  const [hit] = findDockFields('sh', label(), { limit: 2 });
  assert.equal(hit.tab, 'effects');
  assert.equal(hit.matched.length, 2);
  assert.ok(hit.count >= 2);
  assert.match(describeHits(hit), /and \d+ more$/);
});

test('and says them plainly when nothing was left out', () => {
  const [hit] = findDockFields('glow', label());
  assert.equal(hit.more, 0);
  assert.equal(describeHits(hit), hit.matched.join(', '));
  assert.equal(describeHits(null), '');
});

test('one row per tab, not one per label', () => {
  const hits = findDockFields('c', label());
  assert.deepEqual(hits, [], 'still under the minimum');
  const many = findDockFields('co', label());
  assert.equal(new Set(many.map((h) => h.tab)).size, many.length);
});

// --- The claim this file exists to answer -----------------------------------

test('all eight field-label lists are actually called now', () => {
  const source = readFileSync(new URL('../src/CE_Application/utils/dockFieldIndex.js', import.meta.url), 'utf8');
  for (const fn of [
    'allEffectFieldLabels', 'allTypographyFieldLabels', 'allAssetFieldLabels', 'allScreenFieldLabels',
    'allApiFieldLabels', 'allLibraryFieldLabels', 'allAnimationFieldLabels', 'allDesignerFieldLabels',
  ]) {
    assert.match(source, new RegExp(`${fn}\\(\\)`), `${fn} is still a dead export`);
  }
});

test('and the panel renders the results, so the index is not dead either', () => {
  const panel = readFileSync(new URL('../src/CE_Application/panels/PropertiesPanel.svelte', import.meta.url), 'utf8');
  assert.match(panel, /<DockSearchHits control=\{\$selectedControl\} \/>/);
  const hits = readFileSync(new URL('../src/CE_Application/properties/DockSearchHits.svelte', import.meta.url), 'utf8');
  assert.match(hits, /findDockFields\(\$propertyFilter, control\)/);
});
