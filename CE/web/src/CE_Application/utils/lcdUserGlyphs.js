// lcdUserGlyphs.js — the character LCD's eight user-definable glyphs (CGRAM).
//
// A real HD44780 has eight programmable 5x8 characters, and every hardware panel spends them the
// same two ways: on a bargraph that fills smoothly with a baseline under it, and on symbols no
// character set carries — a MIDI plug, a note, a level meter. The component had neither, so its
// `bar` kind builds a bargraph out of the Unicode block characters instead, which costs two things:
// the bar's appearance depends on the SYSTEM FONT carrying `▏▎▍▌▋▊▉`, and no block character has a
// foot, so the bar can never have the baseline that makes one readable at a glance.
//
// PURE, like lcdZones.js next door and for the same reason: the renderer turns these answers into
// SVG, and neither the answers nor the tests should need a DOM.
//
// TWO WAYS TO REACH A GLYPH, because the hardware's way and the useful way are different:
//
//   BY SLOT.  Glyph n is the character with code n — `\x00` to `\x07` — in any zone's text. That is
//             literally how the hardware addresses CGRAM, and it is why the slots are numbered.
//   BY CLAIM. A glyph may name a character it stands in for (`for: '█'`). The renderer then draws
//             it wherever that character appears, which is what lets `bar` keep composing ordinary
//             block characters and still come out as a proper segmented bargraph. The alternative
//             was teaching resolveZoneContent about glyphs, which would push display state into the
//             pure zone engine to no benefit.

import { BAR_CHARS } from './lcdZones.js';

/** A real HD44780 has exactly eight. Not a limit we chose, and the reason slots are always present. */
export const GLYPH_SLOTS = 8;
export const GLYPH_W = 5;
export const GLYPH_H = 8;

/** The character that addresses glyph `slot` in zone text: \x00..\x07, as on the hardware. */
export function glyphSlotChar(slot) {
  return String.fromCharCode(Math.max(0, Math.min(GLYPH_SLOTS - 1, Math.round(Number(slot) || 0))));
}

/**
 * Parse a glyph's bits into eight rows of five booleans, or null when it defines nothing.
 *
 * The authoring form is a datasheet's: eight rows of `#` and `.`, separated by `|`. Two other
 * spellings are accepted because they cost nothing and both turn up in practice — `1`/`0` (how
 * PixelDisplay's freehand `bitmap` element stores its pixels) and no separators at all (a flat
 * forty-character string). Anything shorter than a full grid is padded with blanks rather than
 * rejected: a half-drawn glyph should render as far as it was drawn, not vanish.
 */
export function parseGlyph(bits) {
  const raw = String(bits ?? '');
  if (!raw) return null;
  const flat = raw.replace(/[|\s]/g, '');
  if (!flat) return null;
  const lit = (ch) => ch === '#' || ch === '1';
  if (!/^[#.01]+$/.test(flat)) return null;
  // An all-blank glyph is "not defined" rather than "defined as empty": an empty CGRAM slot on the
  // hardware draws nothing, and treating it as a glyph would blank the character it claims.
  if (!/[#1]/.test(flat)) return null;

  const rows = [];
  for (let y = 0; y < GLYPH_H; y += 1) {
    const row = [];
    for (let x = 0; x < GLYPH_W; x += 1) row.push(lit(flat[y * GLYPH_W + x] ?? '.'));
    rows.push(row);
  }
  return rows;
}

/**
 * An SVG path covering a glyph's lit pixels, on a 5x8 viewBox.
 *
 * Horizontal runs are merged into one subpath each rather than emitting a rect per pixel. A cell is
 * at most forty pixels so the saving is small per glyph, but a 20x4 screen of them is 3,200 nodes
 * against a few hundred, and this is redrawn on every value change.
 */
export function glyphPath(rows) {
  if (!rows) return '';
  const parts = [];
  for (let y = 0; y < rows.length; y += 1) {
    let x = 0;
    while (x < rows[y].length) {
      if (!rows[y][x]) { x += 1; continue; }
      let run = 1;
      while (rows[y][x + run]) run += 1;
      parts.push(`M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return parts.join('');
}

/**
 * Map every character that should draw as a user glyph to its path.
 *
 * Slot codes are registered first and claims second, so a glyph that claims a character wins over
 * nothing and two glyphs claiming the SAME character resolve to the later slot — the same
 * "last one wins" the zone engine uses for overlapping regions, rather than an error nobody sees.
 */
export function buildGlyphMap(glyphs) {
  const map = new Map();
  const list = Array.isArray(glyphs) ? glyphs : [];
  for (let slot = 0; slot < Math.min(list.length, GLYPH_SLOTS); slot += 1) {
    const rows = parseGlyph(list[slot]?.bits);
    if (!rows) continue;
    map.set(glyphSlotChar(slot), glyphPath(rows));
  }
  for (let slot = 0; slot < Math.min(list.length, GLYPH_SLOTS); slot += 1) {
    const rows = parseGlyph(list[slot]?.bits);
    if (!rows) continue;
    const claim = String(list[slot]?.for ?? '');
    // One character, and never a slot code: a glyph claiming \x03 would silently move another slot.
    if (claim.length !== 1 || claim.charCodeAt(0) < GLYPH_SLOTS) continue;
    map.set(claim, glyphPath(rows));
  }
  return map;
}

/** The eight blank slots a display starts with — always present, exactly as CGRAM always is. */
export function emptyGlyphSlots() {
  return Array.from({ length: GLYPH_SLOTS }, () => ({ bits: '', for: '' }));
}

/* ------------------------------------------------------------------- editing a glyph
 *
 * The inspector needs to draw one, and the only authoring form that existed was a forty-character
 * string. Everything below is the pure half of a 5x8 drawing grid: bits in, bits out, so the
 * editor holds no parallel copy of the picture and a test can drive the same calls a click does.
 *
 * They all round-trip through the CANONICAL form — eight rows of '#' and '.' joined by '|' — which
 * is the one `parseGlyph` documents and the one a person reading the saved panel can see the
 * picture in. The other two spellings parseGlyph accepts stay readable and stop being written.
 */

/** Eight rows of five booleans, blank where the glyph defines nothing. */
function rowsOrBlank(bits) {
  return parseGlyph(bits) ?? Array.from({ length: GLYPH_H }, () => new Array(GLYPH_W).fill(false));
}

/** Rows of booleans to the canonical '#.'-and-'|' form. All-blank is '', which is "not defined". */
export function glyphBits(rows) {
  const grid = Array.isArray(rows) ? rows : [];
  if (!grid.some((row) => (row ?? []).some(Boolean))) return '';
  return Array.from({ length: GLYPH_H }, (_, y) =>
    Array.from({ length: GLYPH_W }, (_, x) => (grid[y]?.[x] ? '#' : '.')).join('')).join('|');
}

/** Flip one pixel. Out-of-range is a no-op rather than a grid that grows. */
export function toggleGlyphBit(bits, x, y) {
  if (x < 0 || x >= GLYPH_W || y < 0 || y >= GLYPH_H) return String(bits ?? '');
  const rows = rowsOrBlank(bits);
  rows[y] = rows[y].map((on, i) => (i === x ? !on : on));
  return glyphBits(rows);
}

/** Swap lit for unlit. An empty slot inverts to a full block, which is a legitimate glyph. */
export function invertGlyphBits(bits) {
  return glyphBits(rowsOrBlank(bits).map((row) => row.map((on) => !on)));
}

/**
 * Nudge the drawing by one cell. What falls off the edge is LOST rather than wrapped: a glyph is a
 * picture in a 5x8 window, and a foot that reappears at the top is never what the nudge meant.
 */
export function shiftGlyphBits(bits, dx, dy) {
  const from = rowsOrBlank(bits);
  const out = Array.from({ length: GLYPH_H }, (_, y) => Array.from({ length: GLYPH_W }, (_, x) => {
    const sy = y - Math.round(dy || 0);
    const sx = x - Math.round(dx || 0);
    return sy >= 0 && sy < GLYPH_H && sx >= 0 && sx < GLYPH_W ? from[sy][sx] : false;
  }));
  return glyphBits(out);
}

/**
 * The eight slots that turn `bar` into a real bargraph: one per character `barString` emits, each
 * claiming it, each with a baseline foot.
 *
 * This is the whole reason the feature exists, and asking somebody to hand-draw it was never a
 * plan — the eight characters cannot even be typed into the claim box without finding them
 * somewhere first. So the set is generated from `BAR_CHARS`, which is the bar renderer's own list.
 *
 * FIVE COLUMNS CANNOT SHOW EIGHT WIDTHS, and the duplicates are the truth rather than a bug: two
 * adjacent eighths land on the same number of lit columns because a character cell is five pixels
 * wide. What the glyphs buy over the block characters is the two things a font cannot give — the
 * baseline under the bar, and not depending on the font carrying `▏▎▍▌▋▊▉` at all.
 */
export function barGlyphSet() {
  return Array.from(BAR_CHARS).map((claim, i) => {
    // Slot 0 is the full block; slots 1..7 are the i-eighths partials.
    const lit = i === 0 ? GLYPH_W : Math.max(1, Math.round((i * GLYPH_W) / 8));
    const rows = Array.from({ length: GLYPH_H }, (_, y) => Array.from({ length: GLYPH_W }, (_, x) =>
      // The bottom row is the foot: solid all the way across, whatever the bar reads.
      (y === GLYPH_H - 1 ? true : y > 0 && x < lit)));
    return { bits: glyphBits(rows), for: claim };
  });
}
