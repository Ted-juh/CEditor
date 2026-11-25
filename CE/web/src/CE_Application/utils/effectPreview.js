/**
 * effectPreview.js — what a library card's preview draws: an effect played on a stand-in, through the
 * engines a control plays it through (docs/design/animation-designer.md, "As built: previews on the
 * library cards").
 *
 * The record asked for "a preview recorded from the stage". A recording would be pictures of one
 * control at one size, out of date the moment the engine changes and blurred on a high-density
 * screen; a stand-in plays the effect itself. So each card has a small stand-in of the kind of thing
 * the effect plays on, and the effect is a one-clip scene on it, read by sceneControlOutput exactly as
 * a control reads a scene:
 *
 *   - 'box'      a move or a paint: a small box that moves, its fill painted (a colour, a gradient
 *                 turned or shifted, an image panned and zoomed), its word coloured;
 *   - 'word'     a text effect: the word "Text", cut and played as a Label's words are;
 *   - 'pattern'  a Pattern effect: a framed box whose striped pattern moves and fades, the frame still;
 *   - 'ring'     a value effect: a knob's ring, drawn a frame at a time by valueEffectAt.
 *
 * A preview plays while its card is pointed at or focused, again after a rest, and is still
 * otherwise; with reduced motion it is always still (the component's business). Pure.
 */
import { sceneControlOutput } from './sceneModel.js';
import { patternPlace } from './sceneFormat.js';
import { splitText, textEffectSpan, textPieceStyles, reelColumns } from './textEffects.js';
import { canRepeat, REPEAT_STAGGER } from './scenePreset.js';

/** The pause between plays, ms. */
export const PREVIEW_REST = 700;
/** The word a text effect plays on. */
export const PREVIEW_WORD = 'Text';
/** The live value a value effect starts from and hands back to. */
export const PREVIEW_VALUE = 0.35;

/** What kind of stand-in an effect plays on, from the effect and where it was made to play. */
export function previewKind(entry) {
  const kind = String(entry?.effect?.kind ?? '');
  if (kind === 'value') return 'ring';
  if (kind === 'text') return 'word';
  if (kind !== 'keyframes') return 'none';
  const target = String(entry?.target ?? '');
  return target === 'Patterns' || patternPlace(target) ? 'pattern' : 'box';
}

const join = (list) => (list?.length ? `animation:${list.join(', ')};` : '');

/**
 * One play of an effect on its stand-in, in a phase ('a' or 'b': flipped to play it again) and
 * `delay` ms after the play begins: `{ kind, rules, period, … }` with the stand-in's styles, or
 * `{ kind: 'none' }` for what has nothing to show (a transition, which needs a state change).
 *
 *   box:     { box, fill, image, word, gradient, image? }   styles of the box, its fill, image and word
 *   word:    { pieces: [{ text, style, column }] }   (column: a reel's, drawn in a window)
 *   pattern: { pattern }                                     the striped layer's style
 *   ring:    { effect, length, delay }                       drawn by the component, a frame at a time
 */
export function previewOf(entry, { phase = 'a', delay = 0 } = {}) {
  const kind = previewKind(entry);
  const length = Math.max(100, Math.round(Number(entry?.length) || 600));
  const start = Math.max(0, Math.round(Number(delay) || 0));
  if (kind === 'none') return { kind, rules: '', period: 0 };
  if (kind === 'ring') return { kind, rules: '', period: start + length + PREVIEW_REST, effect: entry.effect, length, delay: start };
  const target = kind === 'word' ? 'Text' : kind === 'pattern' ? 'Patterns.preview' : 'Transform';
  const scene = { id: 'preview', clips: [{ id: 'preview', controlId: 'preview', target, start, length, effect: entry.effect }] };
  const out = sceneControlOutput(scene, 'preview', { phase });
  if (!out) return { kind: 'none', rules: '', period: 0 };
  if (kind === 'word') {
    const item = out.texts.get('')?.[0];
    if (!item) return { kind: 'none', rules: '', period: 0 };
    // The clip's start is already the effect's delay (sceneModel.js clipAnimation), and in its span.
    const pieces = splitText(PREVIEW_WORD, item.effect.split);
    const styles = textPieceStyles(item.effect, pieces, { phase, seedText: 'preview', columns: true });
    const columns = reelColumns(item.effect, pieces, { seedText: 'preview' });
    const count = pieces.filter((piece) => piece.animated).length;
    return {
      kind, rules: out.rules, period: textEffectSpan(item.effect, count) + PREVIEW_REST,
      pieces: pieces.map((piece, index) => ({ text: piece.text, style: styles[index], column: columns[index] })),
    };
  }
  if (kind === 'pattern') {
    return { kind, rules: out.rules, period: start + length + PREVIEW_REST, pattern: join(out.patterns.get('preview')) };
  }
  const channels = out.colours.get('') ?? {};
  return {
    kind,
    rules: out.rules,
    period: start + length + PREVIEW_REST,
    box: join(out.parts.get('')),
    fill: join([...(channels.paint ?? []), ...(channels.gradient ?? [])]),
    gradient: (channels.gradient ?? []).length > 0,
    image: (channels.image ?? []).length ? join(channels.image) : '',
    word: join(channels.text),
  };
}

/**
 * A scene preset's stand-ins: one a slot (the first three), each playing its slot's first clip at
 * its start; or, for a preset that repeats over every control that fits, three of its one slot, each
 * a stagger after the last, as Knobs sweep in sweeps three knobs. `period` is the whole preset's, so
 * they play together. `[{ entry, delay }]` and `period`.
 */
export function scenePresetPreview(preset, { stagger = REPEAT_STAGGER } = {}) {
  const clips = Array.isArray(preset?.clips) ? preset.clips : [];
  const firstOf = (slot) => clips.filter((clip) => clip.slot === slot).sort((a, b) => a.start - b.start)[0] ?? null;
  const asEntry = (clip) => ({ target: clip.target, length: clip.length, effect: clip.effect });
  let minis;
  if (canRepeat(preset)) {
    const clip = firstOf(0);
    minis = clip ? [0, 1, 2].map((i) => ({ entry: asEntry(clip), delay: clip.start + i * stagger })) : [];
  } else {
    minis = (preset?.slots ?? []).slice(0, 3).map((_, slot) => firstOf(slot)).filter(Boolean).map((clip) => ({ entry: asEntry(clip), delay: clip.start }));
  }
  const end = minis.reduce((last, mini) => Math.max(last, mini.delay + mini.entry.length), 0);
  return { minis, period: end + PREVIEW_REST };
}
