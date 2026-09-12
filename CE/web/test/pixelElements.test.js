// pixelElements.test.js — addressing a pixel display's scene by name.
//
// The module exists because two obvious keys do not work, and each of those is a test here rather
// than a comment: an index addresses nothing on a blank display and is rewritten by the inspector's
// reorder arrows, and an `el_…` id is never shown to the person writing the script.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  elementAnswersTo, elementLabel, elementLists, elementSites, elementAt,
  elementsPatch, elementPropTable,
} from '../src/CE_Application/utils/pixelElements.js';

const el = (over) => ({ id: 'el_0', name: '', kind: 'static', text: '', visible: true, x: 0, ...over });

test('an element answers to its name, and to its id when it has none', () => {
  assert.equal(elementAnswersTo(el({ name: 'title' }), 'title'), true);
  // Trimmed and case-insensitive, the way a control name is matched.
  assert.equal(elementAnswersTo(el({ name: 'Title' }), '  title '), true);
  assert.equal(elementAnswersTo(el({ id: 'el_7' }), 'el_7'), true, 'the id still resolves');
  assert.equal(elementAnswersTo(el({ name: 'title' }), 'tempo'), false);
  // An empty name addresses nothing at all rather than every unnamed element.
  assert.equal(elementAnswersTo(el({ name: '' }), ''), false);
  assert.equal(elementLabel(el({ name: 'title', id: 'el_9' })), 'title');
  assert.equal(elementLabel(el({ name: '', id: 'el_9' })), 'el_9', 'unnamed shows as its id');
});

test('a name resolves across the flat scene AND every layout', () => {
  // The failure this prevents: a display with pages does not draw the flat list at all, so a verb
  // that only knew about `elements` would work on a simple screen and do nothing on a real one.
  const cfg = {
    elements: [el({ id: 'a', name: 'title' })],
    layouts: [
      { id: 'l1', elements: [el({ id: 'b', name: 'title' }), el({ id: 'c', name: 'tempo' })] },
      { id: 'l2', elements: [el({ id: 'd', name: 'title' })] },
    ],
  };
  assert.equal(elementLists(cfg).length, 3, 'the flat list plus one per layout');
  assert.deepEqual(elementSites(cfg, 'title'),
    [{ layout: -1, at: 0 }, { layout: 0, at: 0 }, { layout: 1, at: 0 }]);
  assert.deepEqual(elementSites(cfg, 'tempo'), [{ layout: 0, at: 1 }]);
  assert.deepEqual(elementSites(cfg, 'nothing'), []);
  assert.equal(elementAt(cfg, { layout: 0, at: 1 }).id, 'c');
  assert.equal(elementAt(cfg, { layout: 9, at: 0 }), null);
});

test('a write reaches every element of that name, in both places at once', () => {
  // Duplicating a layout keeps the names and mints new ids, so a three-page screen has three
  // elements called `title` BY CONSTRUCTION and they are the same title. Writing one of them is
  // not a behaviour anybody wants, and picking between them by position puts the index back.
  const cfg = {
    elements: [el({ id: 'a', name: 'title', text: 'OLD' })],
    layouts: [{ id: 'l1', elements: [el({ id: 'b', name: 'title', text: 'OLD' }),
                                     el({ id: 'c', name: 'tempo', text: '120' })] }],
  };
  const patch = elementsPatch(cfg, elementSites(cfg, 'title'), 'text', 'NEW');
  assert.equal(patch.elements[0].text, 'NEW');
  assert.equal(patch.layouts[0].elements[0].text, 'NEW');
  assert.equal(patch.layouts[0].elements[1].text, '120', 'the other element is untouched');
  // And the input is never mutated — the reducer contract every verb here is held to.
  assert.equal(cfg.elements[0].text, 'OLD');
  assert.equal(cfg.layouts[0].elements[0].text, 'OLD');
});

test('only the places that actually differ are written', () => {
  const cfg = {
    elements: [el({ id: 'a', name: 'title', text: 'SAME' })],
    layouts: [{ id: 'l1', elements: [el({ id: 'b', name: 'title', text: 'OLD' })] }],
  };
  // Every site already holding the value is the "already that way" case, and it has to produce
  // NOTHING — a patch here would be a document change and an undo step for no edit.
  assert.deepEqual(elementsPatch(cfg, elementSites(cfg, 'title'), 'text', 'OLD').elements[0].text,
    'OLD', 'the flat one differs, so it is written');
  assert.deepEqual(Object.keys(elementsPatch(cfg, elementSites(cfg, 'title'), 'text', 'OLD')),
    ['elements'], 'and the layout, which already held it, is not');

  // The two sites converge on the value asked for rather than on each other, so writing the value
  // the flat one already has still fixes the layout that has drifted.
  assert.deepEqual(Object.keys(elementsPatch(cfg, elementSites(cfg, 'title'), 'text', 'SAME')),
    ['layouts']);

  const settled = { elements: [el({ name: 'title', text: 'X' })], layouts: [] };
  assert.deepEqual(elementsPatch(settled, elementSites(settled, 'title'), 'text', 'X'), {});
});

test('the read table is keyed by the name a verb would use', () => {
  const cfg = {
    elements: [el({ id: 'el_3', name: '', text: 'UNNAMED' }), el({ id: 'a', name: 'title', text: 'HI' })],
    layouts: [{ id: 'l1', elements: [el({ id: 'b', name: 'title', text: 'SHADOWED' })] }],
  };
  const table = elementPropTable(cfg, 'text');
  assert.equal(table.title, 'HI', 'the first element of that name answers');
  assert.equal(table.el_3, 'UNNAMED', 'an unnamed element appears under its id rather than vanishing');
  assert.equal(Object.keys(table).length, 2);
});
