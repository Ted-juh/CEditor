// Named palettes. The 24-cell grid was persisted but anonymous and singular,
// so a second set of colours could only arrive by destroying the first. These
// tests pin the library model: migration from the old flat array, uniqueness
// of names, and the refusals that stop a delete leaving the grid with nothing
// to show.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PALETTE_SIZE, emptyColors, normalizeColors, makePalette, uniquePaletteName,
  normalizeLibrary, activePalette, setActivePalette, addPalette, renamePalette,
  deletePalette, setPaletteColors, sameColors,
} from '../src/CE_Application/utils/paletteLibrary.js';

test('normalizeColors always yields 24 validated slots', () => {
  assert.equal(emptyColors().length, PALETTE_SIZE);

  const slots = normalizeColors(['#ff0000', 'nope', null, 'ABCDEF', 12]);
  assert.equal(slots.length, PALETTE_SIZE);
  assert.equal(slots[0], 'FF0000', 'the hash is stripped and the value uppercased');
  assert.equal(slots[1], null, 'a non-colour becomes an empty cell, not a broken one');
  assert.equal(slots[3], 'ABCDEF');
  assert.equal(slots[23], null);

  const overlong = normalizeColors(Array(40).fill('FF0000'));
  assert.equal(overlong.length, PALETTE_SIZE);
});

test('an older build\'s bare array of 24 colours becomes the first named palette', () => {
  const lib = normalizeLibrary(['FF0000', '00FF00']);
  assert.equal(lib.palettes.length, 1);
  assert.equal(lib.palettes[0].name, 'Palette');
  assert.equal(lib.palettes[0].colors[0], 'FF0000');
  assert.equal(lib.activeId, lib.palettes[0].id, 'the migrated palette is the active one');
});

test('normalizeLibrary always produces at least one palette and a live activeId', () => {
  for (const input of [null, undefined, {}, { palettes: [] }, { palettes: 'nope' }, 42]) {
    const lib = normalizeLibrary(input);
    assert.ok(lib.palettes.length >= 1, `${JSON.stringify(input)} produced no palette`);
    assert.ok(lib.palettes.some((p) => p.id === lib.activeId), 'activeId points at a real palette');
  }

  const dangling = normalizeLibrary({ activeId: 'ghost', palettes: [{ id: 'a', name: 'A', colors: [] }] });
  assert.equal(dangling.activeId, 'a', 'an activeId pointing at nothing falls back to the first');
});

test('adding a palette makes it active and never reuses a name', () => {
  let lib = normalizeLibrary(null);
  lib = addPalette(lib, 'Palette');
  lib = addPalette(lib, 'Palette');

  assert.deepEqual(lib.palettes.map((p) => p.name), ['Palette', 'Palette 2', 'Palette 3']);
  assert.equal(activePalette(lib).name, 'Palette 3');
  assert.equal(uniquePaletteName(['Brand', 'Brand 2'], 'Brand'), 'Brand 3');
  assert.equal(uniquePaletteName([], 'Brand'), 'Brand');
});

test('a new palette starts empty even when the previous one is full', () => {
  let lib = normalizeLibrary(Array(PALETTE_SIZE).fill('FF0000'));
  lib = addPalette(lib, 'Second');
  assert.ok(activePalette(lib).colors.every((c) => c === null));
  assert.equal(lib.palettes[0].colors[0], 'FF0000', 'the first palette is untouched');
});

test('a palette can be seeded with colours — that is how a deleted one comes back', () => {
  let lib = normalizeLibrary(null);
  lib = addPalette(lib, 'Restored', ['112233', null, '445566']);
  assert.equal(activePalette(lib).name, 'Restored');
  assert.equal(activePalette(lib).colors[2], '445566');
});

test('renaming refuses an empty name rather than storing one', () => {
  let lib = normalizeLibrary(null);
  const id = lib.activeId;
  lib = renamePalette(lib, id, '  Brand greys  ');
  assert.equal(activePalette(lib).name, 'Brand greys', 'the name is trimmed');

  lib = renamePalette(lib, id, '   ');
  assert.equal(activePalette(lib).name, 'Brand greys', 'a blank rename is a no-op — nameless is what we came from');
});

test('the last palette is never deleted', () => {
  const lib = normalizeLibrary(null);
  const after = deletePalette(lib, lib.activeId);
  assert.equal(after.palettes.length, 1);
  assert.equal(after, lib, 'the refusal returns the library unchanged');
});

test('deleting the active palette activates a neighbour', () => {
  let lib = normalizeLibrary(null);
  lib = addPalette(lib, 'Second');
  lib = addPalette(lib, 'Third');
  const secondId = lib.palettes[1].id;

  lib = setActivePalette(lib, secondId);
  assert.equal(activePalette(lib).name, 'Second');

  lib = deletePalette(lib, secondId);
  assert.deepEqual(lib.palettes.map((p) => p.name), ['Palette', 'Third']);
  assert.equal(activePalette(lib).name, 'Third', 'the slot the deleted palette occupied');
  assert.ok(lib.palettes.some((p) => p.id === lib.activeId));
});

test('deleting an inactive palette leaves the selection alone', () => {
  let lib = normalizeLibrary(null);
  lib = addPalette(lib, 'Second');
  const firstId = lib.palettes[0].id;
  const activeBefore = lib.activeId;

  lib = deletePalette(lib, firstId);
  assert.equal(lib.activeId, activeBefore);
});

test('setActivePalette ignores an id that is not in the library', () => {
  const lib = normalizeLibrary(null);
  assert.equal(setActivePalette(lib, 'ghost'), lib);
});

test('setPaletteColors writes one palette and leaves the others alone', () => {
  let lib = normalizeLibrary(null);
  lib = addPalette(lib, 'Second');
  const firstId = lib.palettes[0].id;

  lib = setPaletteColors(lib, firstId, ['ABCDEF']);
  assert.equal(lib.palettes[0].colors[0], 'ABCDEF');
  assert.equal(lib.palettes[1].colors[0], null);
});

test('sameColors compares slot arrays the way a save guard needs to', () => {
  assert.ok(sameColors(['FF0000'], ['#ff0000']));
  assert.ok(sameColors([], emptyColors()));
  assert.ok(!sameColors(['FF0000'], ['00FF00']));
});

test('every operation returns a new library rather than mutating the old one', () => {
  const lib = normalizeLibrary(null);
  const snapshot = JSON.stringify(lib);
  addPalette(lib, 'Second');
  renamePalette(lib, lib.activeId, 'Renamed');
  setPaletteColors(lib, lib.activeId, ['FF0000']);
  assert.equal(JSON.stringify(lib), snapshot);
});

test('makePalette clamps a runaway name and keeps a supplied id', () => {
  const palette = makePalette('x'.repeat(80), null, 'fixed-id');
  assert.equal(palette.id, 'fixed-id');
  assert.equal(palette.name.length, 40);
});
