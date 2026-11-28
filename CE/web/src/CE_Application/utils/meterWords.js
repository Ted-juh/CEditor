/**
 * meterWords.js — a text effect on the words a meter draws itself (the Meter: docs/design/
 * component-presets.md, "Words inside the meter"): its legend ("LEVEL", "VU", or its reading in
 * figures, models/meterDeviceParts.js) and its scale's numbers.
 *
 * A meter's words are SVG text, and SVG text has no letters to move one at a time. So a word played a
 * letter at a time is drawn as its letters, each a piece of its own, where the browser put them when it
 * set the word whole (MeterDeviceParts measures that, getStartPositionOfChar): typed, waved, scattered
 * along the word as a Label's are. A word at a time splits at the spaces; whole (or a line) plays each
 * thing drawn as one piece. A legend drawn as figures in cells is already a piece a figure, and a
 * scale's numbers a piece a number, round the scale, as a knob's are (utils/anatomyWords.js).
 *
 * Until the letters are measured the words play whole. Pure: positions in, pieces out.
 */
import { markPieceStyles, markClipBox } from './anatomyWords.js';
import { textEffectClips } from './textEffects.js';

const round = (value) => Math.round(value * 100) / 100;

/**
 * Where a legend's words would be cut for this effect: by letter, by word, or not at all.
 * Several things drawn (figures in cells) are pieces already.
 */
export function meterWordsSplit(effect, texts) {
  const split = String(effect?.split ?? 'letter');
  if ((texts?.length ?? 0) !== 1) return 'whole';
  return split === 'letter' || split === 'word' ? split : 'whole';
}

/**
 * The pieces of a legend's words for one run of `effect`: `texts` as the part draws them
 * ([{ x, y, text, size }], baseline at y, centred on x), `measured` each one's letters where the
 * browser set them ({ xs: [start x a letter], end }, or null). Each piece:
 * `{ text, x, y, size, anchor, style, clip }`, `clip` the box a roll or a push is cut to, or null.
 */
export function legendWordPieces(effect, texts, measured = [], { phase = 'a', seedText = 'legend', at = null } = {}) {
  if (!effect || !texts?.length) return [];
  const split = meterWordsSplit(effect, texts);
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
  const styles = markPieceStyles(run, pieces.map((piece) => piece.text), { phase, seedText, at });
  const clips = textEffectClips(effect);
  return pieces.map((piece, i) => ({
    text: piece.text, x: piece.x, y: piece.y, size: piece.size, anchor: piece.anchor,
    style: styles[i] ?? '',
    clip: clips ? legendClipBox(piece) : null,
  }));
}

/** A scale's numbers for one run of `effect`: a piece a number, round the scale. */
export function numeralPieces(effect, labels, { phase = 'a', seedText = 'scale', at = null } = {}) {
  if (!effect || !labels?.length) return [];
  const styles = markPieceStyles(effect, labels.map((label) => label.text), { phase, seedText, at });
  const clips = textEffectClips(effect);
  return labels.map((label, i) => ({ ...label, style: styles[i] ?? '', clip: clips ? markClipBox({ text: label.text, x: label.x, y: label.y, size: label.size }) : null }));
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

// The box a legend piece is cut to while it rolls or pushes: its width (measured, or guessed from its
// length), a line high from a little under its baseline.
function legendClipBox(piece) {
  const size = Math.max(1, Number(piece.size) || 1);
  const width = piece.width ?? [...piece.text].length * size * 0.62 + size * 0.4;
  const x = piece.anchor === 'middle' ? piece.x - width / 2 : piece.x;
  return { x: round(x - size * 0.1), y: round(piece.y - size * 1.05), width: round(width + size * 0.2), height: round(size * 1.35) };
}
