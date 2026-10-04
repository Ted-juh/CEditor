import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestTags, canonicalTag, tagFamily, TAG_FAMILIES } from '../src/CE_Application/utils/tagVocabulary.js';

const tags = (record) => suggestTags(record).map((s) => s.tag);

test('suggestions come from the name, instrument first', () => {
  assert.deepEqual(tags({ name: 'BA Warm Sub' }), ['Bass', 'Warm']);
  assert.deepEqual(tags({ name: 'LD Glass Trance' }), ['Lead', 'Glassy', 'Trance']);
  assert.deepEqual(tags({ name: 'WarmPad Evolving' }), ['Pad', 'Warm', 'Evolving'], 'joined words are split');
  assert.deepEqual(tags({ name: 'Deep Pads', category: 'Bass' }), ['Bass', 'Pad'], 'the category counts too');
});

test('a short prefix counts only as the first word', () => {
  assert.deepEqual(tags({ name: 'PL Soft Keys' }), ['Pluck', 'Keys', 'Soft']);
  assert.deepEqual(tags({ name: 'Soft PL' }), ['Soft'], '"PL" later in a name means nothing');
  assert.deepEqual(tags({ name: 'LD' }), [], 'a prefix alone is not a name');
});

test('nothing it already has, nothing twice, and no wild guesses', () => {
  assert.deepEqual(tags({ name: 'Bass Bass Sub', tags: ['bass'] }), []);
  assert.deepEqual(tags({ name: 'Air Horn Blast' }), ['Brass'], '"Air" is not taken for Airy');
  assert.deepEqual(tags({ name: 'Init' }), []);
});

test('tags are spelled the vocabulary way and know their family', () => {
  assert.equal(canonicalTag('  bass '), 'Bass');
  assert.equal(canonicalTag('lo-fi'), 'Lo-Fi');
  assert.equal(canonicalTag('My Own Tag'), 'My Own Tag', 'your own words are kept as typed');
  assert.equal(tagFamily('Warm'), 'character');
  assert.equal(tagFamily('Techno'), 'style');
  assert.equal(tagFamily('Mine'), 'other');
  const all = TAG_FAMILIES.flatMap((f) => f.tags.map((t) => t.toLowerCase()));
  assert.equal(new Set(all).size, all.length, 'no word is in two families');
});
