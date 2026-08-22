// "No recent colors, no document colours" was one clause of the colour-chooser
// finding, and it landed in an earlier round — `utils/documentColours.js` and
// `stores/recentColours.js`, wired into the Colors tab as the Panel and Recent
// chip rows. Nothing pinned either of them, so this file does: the clause is
// closed, and a later refactor cannot quietly reopen it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { collectDocumentColours } from '../src/CE_Application/utils/documentColours.js';
import { recentColours, recordRecentColour } from '../src/CE_Application/stores/recentColours.js';

const panelWith = (controls, extra = {}) => ({ id: 'p', name: 'P', controls, ...extra });

test('document colours are harvested from wherever the panel keeps them', () => {
  const panel = panelWith([
    { _children: { Core: { id: 'a' }, Background: { _children: { Fill: { colour: 'FF2BE86A' } } } } },
    { _children: { Core: { id: 'b' }, Background: { _children: { Fill: { colour: '#2be86a' } } } } },
    { _children: { Core: { id: 'c' }, Text: { textColour: '112233' } } },
  ], {
    bgColour: 'FF333333',
    bgGradient: { stops: [{ color: 'ABCDEF', position: 0 }] },
  });

  const colours = collectDocumentColours(panel);
  assert.equal(colours[0], '2BE86A', 'most used first');
  assert.ok(colours.includes('112233'));
  assert.ok(colours.includes('333333'), 'the panel background counts');
  assert.ok(colours.includes('ABCDEF'), 'so do gradient stops');
});

test('a fully transparent colour is not a colour choice', () => {
  const panel = panelWith([
    { _children: { Core: { id: 'a' }, Background: { _children: { Fill: { colour: '00FF0000' } } } } },
  ]);
  assert.deepEqual(collectDocumentColours(panel), []);
});

test('document colours are capped and survive an empty panel', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    _children: { Core: { id: `c${i}` }, Background: { _children: { Fill: { colour: `FF0000${i.toString(16).padStart(2, '0')}` } } } },
  }));
  assert.equal(collectDocumentColours(panelWith(many)).length, 10);
  assert.equal(collectDocumentColours(panelWith(many), 3).length, 3);
  assert.deepEqual(collectDocumentColours(null), []);
  assert.deepEqual(collectDocumentColours(panelWith([])), []);
});

test('recent colours are most-recent-first, deduplicated and capped', () => {
  recentColours.set([]);
  recordRecentColour('FF0000');
  recordRecentColour('00ff00');
  recordRecentColour('#0000FF');
  assert.deepEqual(get(recentColours), ['0000FF', '00FF00', 'FF0000']);

  recordRecentColour('FF0000');
  assert.deepEqual(get(recentColours), ['FF0000', '0000FF', '00FF00'], 'a repeat moves to the front, it does not duplicate');

  for (let i = 0; i < 15; i++) recordRecentColour(`0000${i.toString(16).padStart(2, '0')}`);
  assert.equal(get(recentColours).length, 10);
});

test('a malformed recent colour is refused rather than stored', () => {
  recentColours.set([]);
  recordRecentColour('nope');
  recordRecentColour('');
  recordRecentColour(null);
  recordRecentColour('FF00');
  assert.deepEqual(get(recentColours), []);
  recentColours.set([]);
});
