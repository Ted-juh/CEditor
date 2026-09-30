/**
 * glyphAtlasBuild.js — building a glyph atlas from a parsed font. No imports, no state.
 *
 * utils/fontSources.js explains what an atlas is for. This is only the construction, kept apart so
 * the page (fontSources.glyphAtlas) and the font worker (workers/fontWorker.js) run exactly the same
 * code: an atlas built in either place must be byte-identical, because it is stored in the document
 * and compared by the combined-shape cache.
 *
 * The cost is the kerning table: every pair of printable ASCII characters is laid out once, 9,025
 * calls into fontkit, about half a second for one face. That is why the worker exists.
 */

export const ATLAS_CHARACTERS = [
  ...Array.from({ length: 0x7F - 0x20 }, (_, i) => 0x20 + i),
  ...Array.from({ length: 0x100 - 0xC0 }, (_, i) => 0xC0 + i),
];
const KERNED = ATLAS_CHARACTERS.filter((cp) => cp < 0x7F);

export function unitsPath(commands) {
  const n = (v) => String(Math.round(v * 10) / 10);
  const letters = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' };
  return commands.map(({ command, args }) => letters[command] + args.map(n).join(' ')).join('');
}

/**
 * The atlas of a fontkit font (already instanced at the weight, for a variable face).
 * `meta` is `{ family, weight, style, synthesizedItalic, synthesizedBold }`, copied into the result.
 */
export function atlasFromFont(font, meta) {
  const glyphs = {};
  for (const cp of ATLAS_CHARACTERS) {
    if (!font.hasGlyphForCodePoint?.(cp) && cp !== 0x20) continue;
    const glyph = font.glyphForCodePoint(cp);
    glyphs[cp] = [Math.round(glyph.advanceWidth * 10) / 10, unitsPath(glyph.path.commands)];
  }
  const kern = {};
  for (const a of KERNED) {
    if (!glyphs[a]) continue;
    const advance = glyphs[a][0];
    for (const b of KERNED) {
      if (!glyphs[b]) continue;
      const run = font.layout(String.fromCodePoint(a, b), { liga: false, clig: false, dlig: false, calt: false });
      if (run.glyphs.length !== 2) continue;
      const dx = Math.round((run.positions[0].xAdvance - advance) * 10) / 10;
      if (dx) kern[`${a},${b}`] = dx;
    }
  }
  return {
    family: meta.family, weight: Number(meta.weight) || 400, style: meta.style === 'italic' ? 'italic' : 'normal',
    unitsPerEm: font.unitsPerEm, ascent: font.ascent, descent: font.descent,
    synthesizedItalic: !!meta.synthesizedItalic, synthesizedBold: !!meta.synthesizedBold,
    glyphs, kern,
  };
}
