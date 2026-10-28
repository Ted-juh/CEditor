import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GLYPH_SLOTS, GLYPH_W, glyphSlotChar, parseGlyph, glyphPath, buildGlyphMap, emptyGlyphSlots,
  glyphBits, toggleGlyphBit, invertGlyphBits, shiftGlyphBits, barGlyphSet, glyphBitsRefusal,
} from '../src/CE_Application/utils/lcdUserGlyphs.js';
import { BAR_CHARS } from '../src/CE_Application/utils/lcdZones.js';

/** The bargraph glyph a real panel spends a CGRAM slot on: a bar with a foot. */
const BAR_FULL = '.....|.###.|.###.|.###.|.###.|.###.|.###.|#####';

test('a glyph parses from the datasheet spelling', () => {
  const rows = parseGlyph(BAR_FULL);
  assert.equal(rows.length, 8);
  assert.deepEqual(rows[0], [false, false, false, false, false]);
  assert.deepEqual(rows[1], [false, true, true, true, false]);
  assert.deepEqual(rows[7], [true, true, true, true, true], 'the baseline is the whole point');
});

test('the other two spellings parse to the same glyph', () => {
  // '1'/'0' is how PixelDisplay stores freehand bitmaps; no separators is a flat 40-char string.
  const pipes = parseGlyph(BAR_FULL);
  const ones = parseGlyph(BAR_FULL.replace(/#/g, '1').replace(/\./g, '0'));
  const flat = parseGlyph(BAR_FULL.replace(/\|/g, ''));
  assert.deepEqual(ones, pipes);
  assert.deepEqual(flat, pipes);
});

test('a glyph that defines nothing is not a glyph', () => {
  // An empty CGRAM slot draws nothing on the hardware. Treating "all blank" as a definition would
  // let a slot claim a character and then erase it.
  assert.equal(parseGlyph(''), null);
  assert.equal(parseGlyph(null), null);
  assert.equal(parseGlyph('.....|.....|.....|.....|.....|.....|.....|.....'), null);
  assert.equal(parseGlyph('00000000000000000000000000000000000000000'), null);
  assert.equal(parseGlyph('not a glyph'), null);
});

test('a short glyph draws as far as it was drawn', () => {
  // Half-authored input pads rather than failing: a partly drawn glyph in the inspector should
  // show what it has, not disappear.
  const rows = parseGlyph('#####|#####');
  assert.equal(rows.length, 8);
  assert.deepEqual(rows[1], [true, true, true, true, true]);
  assert.deepEqual(rows[2], [false, false, false, false, false]);
});

test('each row between "|" is read on its own, a short one padded to five', () => {
  // The separators used to be dropped and the rest read five at a time, so a short row ran into
  // the next: "#|#|#" lit three cells of the top row rather than one cell of three rows.
  const rows = parseGlyph('#|#|#');
  assert.deepEqual(rows.slice(0, 4).map((row) => row.map((on) => (on ? '#' : '.')).join('')),
    ['#....', '#....', '#....', '.....']);
  assert.deepEqual(parseGlyph('##.|#')[0], [true, true, false, false, false]);
  assert.deepEqual(parseGlyph('##.|#')[1], [true, false, false, false, false]);
  assert.deepEqual(parseGlyph(' #.#. | .#.#. ')[1], [false, true, false, true, false], 'spaces are not cells');
});

test('a glyph that cannot be drawn as written says why; one that can says nothing', () => {
  assert.equal(glyphBitsRefusal('abc'),
    '"a", "b", "c" are not cells of a glyph: "#" or "1" is lit, "." or "0" unlit, and "|" ends a row.');
  assert.equal(glyphBitsRefusal('#x###'),
    '"x" is not a cell of a glyph: "#" or "1" is lit, "." or "0" unlit, and "|" ends a row.');
  assert.equal(glyphBitsRefusal('#|#|#|#|#|#|#|#|#'), 'It has 9 rows, and a glyph has 8.');
  assert.equal(glyphBitsRefusal('#####|######'), 'Row 2 has 6 cells, and a row has 5.');
  assert.equal(glyphBitsRefusal('#'.repeat(41)), 'It has 41 cells, and a glyph has 40: eight rows of five.');
  for (const fine of [BAR_FULL, BAR_FULL.replace(/\|/g, ''), '#|#|#', '0101', '', '.....|.....', ' #.#. | ### ']) {
    assert.equal(glyphBitsRefusal(fine), null, JSON.stringify(fine));
  }
});

test('the path merges horizontal runs instead of drawing a rect per pixel', () => {
  // One subpath for the row of five, not five.
  assert.equal(glyphPath(parseGlyph('#####|.....|.....|.....|.....|.....|.....|.....')),
    'M0 0h5v1h-5z');
  // A gap splits the run in two.
  assert.equal(glyphPath(parseGlyph('##.##|.....|.....|.....|.....|.....|.....|.....')),
    'M0 0h2v1h-2zM3 0h2v1h-2z');
  assert.equal(glyphPath(null), '');
});

test('every slot is reachable by its own control character, as on the hardware', () => {
  assert.equal(glyphSlotChar(0), '\x00');
  assert.equal(glyphSlotChar(7), '\x07');
  // Out of range clamps rather than producing a character nothing can address.
  assert.equal(glyphSlotChar(99), '\x07');
  assert.equal(glyphSlotChar(-1), '\x00');
});

test('a glyph can claim an ordinary character, which is what makes bar work', () => {
  // `bar` keeps composing Unicode blocks; a glyph claiming █ is what turns them into a real
  // segmented bargraph without the pure zone engine knowing glyphs exist.
  const map = buildGlyphMap([{ bits: BAR_FULL, for: '█' }]);
  assert.ok(map.has('\x00'), 'still addressable by slot');
  assert.ok(map.has('█'), 'and by the character it claims');
  assert.equal(map.get('█'), map.get('\x00'));
});

test('a claim on a slot code is refused, so one glyph cannot displace another', () => {
  const map = buildGlyphMap([
    { bits: BAR_FULL, for: '' },
    { bits: '#####|#####|#####|#####|#####|#####|#####|#####', for: '\x00' },
  ]);
  // Slot 1's claim on \x00 is ignored; \x00 still draws slot 0.
  assert.equal(map.get('\x00'), glyphPath(parseGlyph(BAR_FULL)));
});

test('two glyphs claiming one character resolve to the later slot', () => {
  // "Last one wins", matching how overlapping zones paint — not an error nobody would see.
  const later = '#####|#####|#####|#####|#####|#####|#####|#####';
  const map = buildGlyphMap([{ bits: BAR_FULL, for: '@' }, { bits: later, for: '@' }]);
  assert.equal(map.get('@'), glyphPath(parseGlyph(later)));
});

test('blank slots contribute nothing, and there are always eight of them', () => {
  const slots = emptyGlyphSlots();
  assert.equal(slots.length, GLYPH_SLOTS);
  assert.equal(buildGlyphMap(slots).size, 0);
  // Distinct objects: eight references to one would make editing slot 1 edit all eight.
  slots[0].bits = BAR_FULL;
  assert.equal(slots[1].bits, '');
  assert.equal(buildGlyphMap(slots).size, 1);
});

test('a ninth slot is ignored — the hardware has eight', () => {
  const nine = [...emptyGlyphSlots(), { bits: BAR_FULL, for: '@' }];
  nine[0].bits = BAR_FULL;
  const map = buildGlyphMap(nine);
  assert.ok(map.has('\x00'));
  assert.ok(!map.has('@'), 'the ninth slot claims nothing');
});

/* --------------------------------------------------- drawing one, which is what the inspector does */

test('a painted pixel round-trips through the canonical form', () => {
  // The editor holds no copy of the picture: every click is bits in, bits out, so what is stored
  // is always what is drawn and the two cannot drift.
  let bits = toggleGlyphBit('', 0, 0);
  assert.equal(bits, '#....|.....|.....|.....|.....|.....|.....|.....');
  bits = toggleGlyphBit(bits, 4, 7);
  assert.equal(parseGlyph(bits)[7][4], true);
  assert.equal(parseGlyph(bits)[0][0], true);
  // …and off again, back to "not defined" rather than to a grid of dots.
  bits = toggleGlyphBit(toggleGlyphBit(bits, 0, 0), 4, 7);
  assert.equal(bits, '');
  // Off the grid changes nothing.
  assert.equal(toggleGlyphBit('#....|.....|.....|.....|.....|.....|.....|.....', 5, 0),
    '#....|.....|.....|.....|.....|.....|.....|.....');
  assert.equal(toggleGlyphBit('', -1, 3), '');
});

test('glyphBits writes the datasheet spelling whatever it was given', () => {
  // parseGlyph accepts three spellings; only one is written back, so a panel saved from the
  // inspector shows the picture to anyone reading the file.
  const flat = '1'.repeat(5) + '0'.repeat(35);
  assert.equal(glyphBits(parseGlyph(flat)), '#####|.....|.....|.....|.....|.....|.....|.....');
  assert.equal(glyphBits(null), '');
  assert.equal(glyphBits(parseGlyph('')), '');
});

test('invert turns an empty slot into a solid block and back', () => {
  const solid = invertGlyphBits('');
  assert.equal(solid, Array.from({ length: 8 }, () => '#####').join('|'));
  assert.equal(invertGlyphBits(solid), '', 'and all the way back to not-defined');
});

test('a nudge loses what falls off the edge rather than wrapping it', () => {
  // A foot that reappears at the top is never what the nudge meant.
  const foot = '.....|.....|.....|.....|.....|.....|.....|#####';
  assert.equal(shiftGlyphBits(foot, 0, 1), '', 'pushed off the bottom, and the slot is now empty');
  assert.equal(shiftGlyphBits(foot, 0, -1), '.....|.....|.....|.....|.....|.....|#####|.....');
  const left = '#....|#....|#....|#....|#....|#....|#....|#....';
  assert.equal(shiftGlyphBits(left, -1, 0), '');
  assert.equal(shiftGlyphBits(left, 1, 0), '.#...|.#...|.#...|.#...|.#...|.#...|.#...|.#...');
});

test('the bar set claims exactly the characters the bar draws with', () => {
  const set = barGlyphSet();
  assert.equal(set.length, GLYPH_SLOTS, 'eight characters, eight slots — not a coincidence');
  assert.deepEqual(set.map((g) => g.for), Array.from(BAR_CHARS));
  // Every one is a real glyph, every one has the foot the block characters cannot give it.
  for (const g of set) {
    const rows = parseGlyph(g.bits);
    assert.ok(rows, `${g.for} defines nothing`);
    assert.deepEqual(rows[7], [true, true, true, true, true], `${g.for} has no baseline`);
  }
  // Widths climb and never fall. Five columns cannot show eight distinct widths, so some adjacent
  // pairs match — that is the cell being five pixels wide, not the generator being wrong.
  const width = (g) => parseGlyph(g.bits)[3].filter(Boolean).length;
  const partials = set.slice(1).map(width);
  assert.deepEqual(partials, [...partials].sort((a, b) => a - b));
  assert.equal(width(set[0]), GLYPH_W, 'the full block fills the cell');
  assert.ok(width(set[7]) < GLYPH_W, 'and seven-eighths does not');
});

test('the whole set builds a map the renderer can use', () => {
  // The acceptance test for the feature: define the claiming set and every character `bar`
  // composes from is drawn from CGRAM instead of from the font.
  const map = buildGlyphMap(barGlyphSet());
  for (const ch of BAR_CHARS) assert.ok(map.get(ch), `${ch} is not drawn from a glyph`);
});
