// presetCategories.test.js — a category per SLOT, not just per bank.
//
// A preset bank could carry one `category` for all of it, which is right for a device whose banks
// are the categories and useless for one whose banks are not. The AN1x is the second kind: its 128
// factory voices sit in one bank and the Data List prints a `Cat.` column against every one of them
// — 13 distinct codes spread across the whole list. A single bank-wide tag could only have said
// "all of these are the same", which is false, so the field went unused and the information stayed
// in the PDF.
//
// `categories` is indexed exactly as `names` is — slot - startSlot — so the three shapes a device
// can want all work: one tag for a whole bank, a tag per slot, or a per-slot list with gaps the
// bank tag fills.
//
// THE CODES ARE STORED VERBATIM. The AN1x prints `Ba`, `Pd`, `Sq` and gives no legend for them
// anywhere in the Data List. Expanding them to "Bass", "Pad", "Sequence" would be inventing words
// the instrument never uses, and would be wrong the first time a guess missed (`Sc`, `Se`, `Co` and
// `Or` are not obvious). What the document prints is what is stored.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { presetSlotInfo } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const an1x = JSON.parse(readFileSync(
  path.join(REPO, 'CE/profiles/test/yamaha-an1x-dpd.ceditor-device.json'), 'utf8'));

/** A profile carrying one bank, for the resolution rules. */
const bankProfile = (bank) => ({
  id: 'probe',
  presets: { banks: [{ id: 'b', role: 'factory', startSlot: 0, slotCount: 4, ...bank }] },
});

/* ------------------------------------------------------------------ how it resolves */

test('a per-slot category wins over the bank tag', () => {
  const profile = bankProfile({ category: 'Bank', categories: ['Ba', 'Pd', 'Sq', 'Ld'] });
  assert.equal(presetSlotInfo(profile, 0).category, 'Ba');
  assert.equal(presetSlotInfo(profile, 3).category, 'Ld');
});

test('a gap in the per-slot list falls back to the bank tag', () => {
  // The mixed case: a device documents some of its slots and not others.
  const profile = bankProfile({ category: 'Bank', categories: ['Ba', '', 'Sq'] });
  assert.equal(presetSlotInfo(profile, 0).category, 'Ba');
  assert.equal(presetSlotInfo(profile, 1).category, 'Bank', 'a blank entry should defer to the bank');
  assert.equal(presetSlotInfo(profile, 3).category, 'Bank', 'past the end should defer to the bank');
});

test('a bank with no per-slot list behaves exactly as it did before', () => {
  // The migration promise: every profile that already carried a bank-wide tag is unchanged.
  const profile = bankProfile({ category: 'Bank' });
  assert.equal(presetSlotInfo(profile, 0).category, 'Bank');
  assert.equal(presetSlotInfo(profile, 3).category, 'Bank');
});

test('a bank with neither reports an empty category rather than undefined', () => {
  const profile = bankProfile({});
  assert.equal(presetSlotInfo(profile, 0).category, '');
});

test('the category is resolved against the slot\'s own bank', () => {
  // Two banks, each with its own list. Indexing the second bank's list from slot 0 rather than from
  // its own startSlot would tag every slot in it with the wrong category.
  const profile = {
    id: 'probe',
    presets: {
      banks: [
        { id: 'a', role: 'factory', startSlot: 0, slotCount: 2, categories: ['A0', 'A1'] },
        { id: 'b', role: 'user', startSlot: 2, slotCount: 2, categories: ['B0', 'B1'] },
      ],
    },
  };
  assert.equal(presetSlotInfo(profile, 0).category, 'A0');
  assert.equal(presetSlotInfo(profile, 2).category, 'B0');
  assert.equal(presetSlotInfo(profile, 3).category, 'B1');
});

/* ------------------------------------------------------ the AN1x's own, from the Data List */

test('the AN1x ships a category for all 128 factory voices', () => {
  const bank = an1x.presets.banks[0];
  assert.equal(bank.names.length, 128);
  assert.equal(bank.categories.length, 128, 'every voice in the list has a Cat. column entry');
  assert.ok(bank.categories.every((c) => /^[A-Z][a-z]$/.test(c)),
    'the Data List prints two-letter codes; anything else means the column was misread');
});

test('the AN1x categories are spread rather than uniform', () => {
  // The guard on the transcription. A column read off by a row, or a fill-down bug, most likely
  // shows up as one code for everything — which is exactly what a bank-wide tag would have given,
  // so a uniform list would mean this whole field bought nothing.
  const bank = an1x.presets.banks[0];
  const distinct = new Set(bank.categories);
  assert.ok(distinct.size >= 10, `expected many categories, got ${distinct.size}: ${[...distinct]}`);
});

test('the first voices carry the categories the Data List prints against them', () => {
  // Transcribed by hand from p2 of the Data List, against the names already in the profile, so the
  // row alignment is checked rather than assumed: Relaxx is Co, Terraform is Sq, Celluloid is Ba.
  const bank = an1x.presets.banks[0];
  const expected = [['Relaxx', 'Co'], ['Terraform', 'Sq'], ['Celluloid', 'Ba'],
    ['MajorBrass', 'Br'], ['Soar', 'Pd'], ['Hardcore', 'Ba']];
  for (const [index, [name, category]] of expected.entries()) {
    assert.equal(bank.names[index], name, `slot ${index} name`);
    assert.equal(bank.categories[index], category, `slot ${index} category`);
  }
});

test('and they reach presetSlotInfo from the shipped profile', () => {
  // End to end: the field the librarian and the browser actually read.
  assert.equal(presetSlotInfo(an1x, 0).category, 'Co');
  assert.equal(presetSlotInfo(an1x, 0).catalogName, 'Relaxx');
  assert.equal(presetSlotInfo(an1x, 127).category, an1x.presets.banks[0].categories[127]);
});

test('the bank records where the codes came from', () => {
  // Provenance, because a two-letter code with no legend is exactly the kind of thing somebody
  // later "tidies up" into a guess.
  assert.match(an1x.presets.banks[0].note, /Voice List/);
  assert.match(an1x.presets.banks[0].note, /no legend/);
});
