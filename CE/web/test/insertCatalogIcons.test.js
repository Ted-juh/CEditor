// insertCatalogIcons.test.js — every insertable thing has a picture, and no two share one.
//
// `insertCatalogIcons.js` opened with "One icon per meaning: no icon appears twice anywhere in this
// file", and that was a claim rather than a fact. Eight types had no entry at all — Tabbed
// Container, Scroll Area, Progress Bar, Shape, Pitch Wheel, Mod Wheel, Keyboard and Step Sequencer
// — so they fell through to the fallback square, and `Numpad` borrowed `Number`'s hash. It showed
// the day the icon rail's flyouts started listing a whole group at once: Layout & Display drew the
// same blank square at Tabbed Container and Scroll Area, then again at Progress Bar and Shape.
//
// So the claim is a test now. Both halves of it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { INSERT_CATEGORIES } from '../src/CE_Application/models/insertCatalog.js';
import { TYPE_ICONS, CATEGORY_ICONS, FALLBACK_TYPE_ICON } from '../src/CE_Application/models/insertCatalogIcons.js';

const ALL_ITEMS = INSERT_CATEGORIES.flatMap((category) =>
  category.items.map((item) => ({ ...item, categoryId: category.id })));

test('every type the catalog offers has an icon of its own', () => {
  const missing = ALL_ITEMS.filter((item) => !TYPE_ICONS[item.type]).map((item) => item.label);
  assert.deepEqual(missing, [], `falling through to the fallback square: ${missing.join(', ')}`);
});

test('and every category has one', () => {
  for (const category of INSERT_CATEGORIES) {
    assert.ok(CATEGORY_ICONS[category.id], `${category.label} has no icon`);
  }
  assert.equal(Object.keys(CATEGORY_ICONS).length, INSERT_CATEGORIES.length);
});

test('no icon is used twice — not across types, categories or the fallback', () => {
  const slots = [
    ...Object.entries(TYPE_ICONS).map(([type, icon]) => [`type ${type}`, icon]),
    ...Object.entries(CATEGORY_ICONS).map(([id, icon]) => [`category ${id}`, icon]),
    ['the fallback', FALLBACK_TYPE_ICON],
  ];
  const firstUse = new Map();
  const clashes = [];
  for (const [where, icon] of slots) {
    if (firstUse.has(icon)) clashes.push(`${firstUse.get(icon)} and ${where}`);
    else firstUse.set(icon, where);
  }
  assert.deepEqual(clashes, [], `sharing an icon: ${clashes.join('; ')}`);
});

test('the fallback is still there, and is nothing else', () => {
  // It has to exist — a type added to the catalog without an icon must draw something rather than
  // throw — but nothing may be assigned it, which is what the test above enforces.
  assert.ok(FALLBACK_TYPE_ICON);
  assert.ok(!Object.values(TYPE_ICONS).includes(FALLBACK_TYPE_ICON));
});

test('the icon map has no entries for types the catalog does not offer', () => {
  // A stale key is an icon nothing draws and a name nobody searches for.
  const offered = new Set(ALL_ITEMS.map((item) => item.type));
  const stale = Object.keys(TYPE_ICONS).filter((type) => !offered.has(type));
  assert.deepEqual(stale, [], `icons for types that are not insertable: ${stale.join(', ')}`);
});

test('all 56 insertable types are covered, across the five groups', () => {
  assert.equal(ALL_ITEMS.length, 56);
  assert.equal(INSERT_CATEGORIES.length, 5);
  assert.equal(Object.keys(TYPE_ICONS).length, 56);
});
