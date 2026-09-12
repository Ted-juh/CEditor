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
