// Swatch cells used to answer to three gestures at once on a 14px target:
// click stored-or-applied, double-click cleared permanently with no undo,
// right-click overwrote — and the meanings changed from tab to tab. These
// tests pin the gesture table that replaced that, the undo that makes the
// destructive ones survivable, and the cell size that makes them hittable.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import {
  swatchAction, swatchMenuItems, swatchTitle, undoFor, applyUndo,
} from '../src/CE_Application/utils/swatchGestures.js';
import SwatchGrid from '../src/CE_Application/components/SwatchGrid.svelte';

const filled = { hasColour: true };
const empty = { hasColour: false };

test('the gesture a stray hand produces is the harmless one', () => {
  assert.equal(swatchAction('click', filled), 'use');
  assert.equal(swatchAction('click', empty), 'store');

  // THE regression this file exists for: double-click used to clear the cell
  // permanently, with no undo anywhere in the app.
  assert.equal(swatchAction('dblclick', filled), 'none');
  assert.equal(swatchAction('dblclick', empty), 'none');
});

test('destruction has to be asked for by name', () => {
  assert.equal(swatchAction('contextmenu', filled), 'menu');
  assert.equal(swatchAction('contextmenu', empty), 'menu');
  assert.equal(swatchAction('delete', filled), 'clear');
  assert.equal(swatchAction('delete', empty), 'none', 'nothing to clear, nothing to undo');
});

test('an unknown gesture does nothing rather than guessing', () => {
  assert.equal(swatchAction('wheel', filled), 'none');
  assert.equal(swatchAction(undefined, filled), 'none');
  assert.equal(swatchAction('click', undefined), 'store');
});

test('the cell menu offers the same three items everywhere, with Clear gated', () => {
  const onFilled = swatchMenuItems(true);
  assert.deepEqual(onFilled.map((i) => i.id), ['use', 'replace', 'clear']);
  assert.equal(onFilled[0].label, 'Use this colour');
  assert.equal(onFilled[2].danger, true);
  assert.equal(onFilled[2].disabled, false);

  const onEmpty = swatchMenuItems(false);
  assert.equal(onEmpty[0].label, 'Store current colour');
  assert.equal(onEmpty[2].disabled, true, 'an empty cell cannot be cleared');
});

test('the tooltip names the gestures, because they are not guessable', () => {
  assert.match(swatchTitle('FF0000'), /#FF0000/);
  assert.match(swatchTitle('FF0000'), /click to use/);
  assert.match(swatchTitle('FF0000'), /right-click/);
  assert.doesNotMatch(swatchTitle('FF0000'), /double-click/, 'double-click no longer does anything');
  assert.match(swatchTitle(null), /store the current colour/i);
});

test('clearing is undoable — the snapshot restores the exact colour', () => {
  const swatches = ['FF0000', '00FF00', null];
  const undo = undoFor(swatches, 1);
  assert.deepEqual(undo, { kind: 'cell', index: 1, colour: '00FF00' });

  swatches[1] = null;                       // what the parent's clear handler does
  applyUndo(swatches, undo);
  assert.deepEqual(swatches, ['FF0000', '00FF00', null]);
});

test('overwriting is undoable too — replace is destructive as well', () => {
  const swatches = ['FF0000'];
  const undo = undoFor(swatches, 0);
  swatches[0] = '123456';
  applyUndo(swatches, undo);
  assert.equal(swatches[0], 'FF0000');
});

test('undoing a cell that was empty puts the emptiness back', () => {
  const swatches = [null];
  const undo = undoFor(swatches, 0);
  swatches[0] = 'ABCDEF';
  applyUndo(swatches, undo);
  assert.equal(swatches[0], null);
});

test('applyUndo ignores a record it cannot use', () => {
  const swatches = ['FF0000'];
  applyUndo(swatches, null);
  applyUndo(swatches, { kind: 'palette', name: 'x' });
  assert.deepEqual(swatches, ['FF0000']);
});

// --- The rendered grid ------------------------------------------------------

const swatchesFor = (first) => Array.from({ length: 24 }, (_, i) => (i === 0 ? first : null));

test('the grid renders 24 cells, each with a name and a gesture tooltip', () => {
  const html = render(SwatchGrid, { props: { swatches: swatchesFor('FF0000') } }).body;
  const cells = html.match(/<button class="swatch[^>]*>/g) ?? [];
  assert.equal(cells.length, 24);
  assert.match(cells[0], /aria-label="Swatch 1, #FF0000"/);
  assert.match(cells[1], /aria-label="Swatch 2, empty"/);
  assert.match(cells[0], /right-click for replace and clear/);
  assert.doesNotMatch(html, /double-click to clear/, 'the old destructive promise is gone');
});

test('cells are big enough to hit: eight across, not twelve, with a floor', () => {
  const css = render(SwatchGrid, { props: { swatches: swatchesFor(null) } }).head;
  assert.match(css, /grid-template-columns:\s*repeat\(8,\s*1fr\)/);
  assert.match(css, /grid-template-rows:\s*repeat\(3,\s*1fr\)/);
  assert.match(css, /min-height:\s*20px/, 'a cell never shrinks below a targetable size');
});

test('the grid names its palette and offers more than one', () => {
  const html = render(SwatchGrid, { props: { swatches: swatchesFor(null), label: 'Colors' } }).body;
  assert.match(html, /aria-label="Colors palette"/);
  assert.match(html, /aria-label="New palette"/);
  assert.match(html, /aria-label="Rename palette"/);
  assert.match(html, /aria-label="Delete palette"/);
  assert.match(html, /<option value="[^"]+"[^>]*>Palette<\/option>/, 'the palette has a name');
});

test('the last palette cannot be deleted, and the button says why', () => {
  const html = render(SwatchGrid, { props: { swatches: swatchesFor(null) } }).body;
  const deleteButton = html.match(/<button[^>]*aria-label="Delete palette"[^>]*>/)?.[0] ?? '';
  assert.match(deleteButton, /disabled/);
  assert.match(deleteButton, /The last palette cannot be deleted/);
});
