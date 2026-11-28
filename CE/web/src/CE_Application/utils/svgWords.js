/**
 * svgWords.js — a text effect on words a control draws itself in SVG, a letter, a word or a figure at
 * a time: a meter's legend ("LEVEL", "VU", or its reading in figures) and its scale's numbers
 * (editor/MeterDeviceParts.svelte), a key's legend (editor/ButtonDeviceParts.svelte). The Meter:
 * docs/design/component-presets.md, "Words inside the meter".
 *
 * SVG text has no letters to move one at a time. So a word played a letter at a time is drawn as its
 * letters, each a piece of its own, where the browser put them when it set the word whole (the part
 * measures that: editor/measureLetters.js, getStartPositionOfChar): typed, waved, scattered along the
 * word as a Label's are. A word at a time splits at the spaces; whole (or a line) plays each thing
 * drawn as one piece. Several things drawn (a legend's figures in cells) are a piece each already,
 * and a scale's numbers a piece a number, round the scale, as a knob's are (utils/anatomyWords.js).
 *
 * Until the letters are measured the words play whole. Pure: positions in, pieces out.
 *
 * The pieces colour by their fill, which they inherit from the part's paint: its colour, eased, and
 * its colour frames. An effect that colours the words (a shimmer's light, a flash) plays on the fill
 * too (`colourProperty: 'fill'`; the keyframe player writes those rules for an effect on a part), so
 * the part's colour frames and the effect's colour both show, where once a meter's words took the
 * effect's colour alone and a key's lost it.
 *
 * A reel rolls each piece through other glyphs, as a Label's letters: the piece is a column, itself on
 * top and the glyphs it rolls past under it a line each (`column`: `{ lines, step }`), cut to its
 * window, a line high about it, and the column rolls down onto it. The line is `step` units, and the
 * piece's line-height says so, since the reel's keyframes move it in lines (`lh`).
 */
/** A reel's line, in the words' size: the window a piece rolls in is a little under it. */
export const REEL_STEP = 1.4;
import { markPieceStyles, markClipBox } from './anatomyWords.js';
import { reelColumns, textEffectClips } from './textEffects.js';

const round = (value) => Math.round(value * 100) / 100;

/**
 * Where a legend's words would be cut for this effect: by letter, by word, or not at all.
 * Several things drawn (figures in cells) are pieces already.
 */
export function wordsSplit(effect, texts) {
  const split = String(effect?.split ?? 'letter');
  if ((texts?.length ?? 0) !== 1) return 'whole';
  return split === 'letter' || split === 'word' ? split : 'whole';
}

/**
 * The pieces of a part's words for one run of `effect`: `texts` as the part draws them
 * ([{ x, y, text, size }], centred on x; y the baseline, or the middle with `central`), `measured`
 * each one's letters where the browser set them ({ xs: [start x a letter], end }, or null). Each
 * piece: `{ text, x, y, size, anchor, style, clip }`, `clip` the box a roll or a push is cut to, or
 * null.
 */
export function wordPieces(effect, texts, measured = [], { phase = 'a', seedText = 'legend', at = null, central = false } = {}) {
  if (!effect || !texts?.length) return [];
  const split = wordsSplit(effect, texts);
  const letters = split !== 'whole' ? measured?.[0] : null;
  let pieces;
  if (letters?.xs?.length === [...texts[0].text].length && letters.xs.length) {
    const t = texts[0];
    const chars = [...t.text];
    const edges = [...letters.xs, letters.end];
    const cut = split === 'word' ? wordsOf(chars) : chars.map((_, i) => [i, i + 1]);
    pieces = cut
      .filter(([from, to]) => chars.slice(from, to).join('').trim())
      .map(([from, to]) => ({
        text: chars.slice(from, to).join(''), x: round(edges[from]), y: t.y, size: t.size, anchor: 'start', width: round(edges[to] - edges[from]),
      }));
  } else {
    pieces = texts.map((t) => ({ text: t.text, x: t.x, y: t.y, size: t.size, anchor: 'middle', width: null }));
  }
  // Played whole, the effect takes every piece at once; cut, one after another along the words.
  const run = split === 'whole' && texts.length === 1 ? { ...effect, split: 'whole' } : effect;
  const reel = effect.effect === 'reel';
  const styles = markPieceStyles(run, pieces.map((piece) => piece.text), { phase, seedText, at, colourProperty: 'fill', columns: reel });
  const columns = reel ? reelColumns(run, pieces.map((piece) => ({ text: piece.text, animated: true })), { seedText }) : [];
  const clips = textEffectClips(effect);
  return pieces.map((piece, i) => ({
    text: piece.text, x: piece.x, y: piece.y, size: piece.size, anchor: piece.anchor,
    ...reelColumn(styles[i] ?? '', columns[i], piece.size),
    clip: clips ? wordClipBox(piece, central) : null,
  }));
}

// A piece's style and, rolling in a reel, its column: its lines, a step apart, the step its line-height.
function reelColumn(style, column, size) {
  if (!column) return { style, column: null };
  const step = round(Math.max(1, Number(size) || 1) * REEL_STEP);
  return { style: `${style}line-height:${step}px;`, column: { lines: column.split('\n'), step } };
}

/** A scale's numbers for one run of `effect`: a piece a number, round the scale. */
export function numeralPieces(effect, labels, { phase = 'a', seedText = 'scale', at = null } = {}) {
  if (!effect || !labels?.length) return [];
  const reel = effect.effect === 'reel';
  const styles = markPieceStyles(effect, labels.map((label) => label.text), { phase, seedText, at, colourProperty: 'fill', columns: reel });
  const columns = reel ? reelColumns(effect, labels.map((label) => ({ text: label.text, animated: true })), { seedText }) : [];
  const clips = textEffectClips(effect);
  return labels.map((label, i) => ({ ...label, ...reelColumn(styles[i] ?? '', columns[i], label.size), clip: clips ? markClipBox({ text: label.text, x: label.x, y: label.y, size: label.size }) : null }));
}

// [from, to) of each word, the spaces between left out.
function wordsOf(chars) {
  const out = [];
  let from = null;
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (from !== null) out.push([from, i]); from = null; } else if (from === null) from = i;
  });
  if (from !== null) out.push([from, chars.length]);
  return out;
}

// The box a piece is cut to while it rolls or pushes: its width (measured, or guessed from its
// length), a line high about its middle, or from a little under its baseline.
function wordClipBox(piece, central) {
  const size = Math.max(1, Number(piece.size) || 1);
  const width = piece.width ?? [...piece.text].length * size * 0.62 + size * 0.4;
  const x = piece.anchor === 'middle' ? piece.x - width / 2 : piece.x;
  const top = central ? piece.y - size * 0.675 : piece.y - size * 1.05;
  return { x: round(x - size * 0.1), y: round(top), width: round(width + size * 0.2), height: round(size * 1.35) };
}
