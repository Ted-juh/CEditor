/**
 * anatomyWords.js — the words a knob or a slider draws for itself, and how a text effect plays on
 * them (docs/design/animation-designer.md, "As built: text effects on a knob's own words").
 *
 * A knob has no words of its own: its name, value and unit are Labels beside it (labelShows.js).
 * What it draws itself are the marks of its scale and the labels riding a slider's handles, and those
 * take the text effects a Label takes, from the same engine (textEffects.js):
 *
 *   - the scale's numbers (Parts.tickNumber) and its ticks (Parts.tickMajor, Parts.tickMinor), drawn
 *     in the SVG. Each number or tick is one piece, round the scale in order: a typewriter writes the
 *     dial from its first number to its last, an explosion gathers them in from all sides. `whole`
 *     plays them together. A tick drawn as a line or a dot takes an effect too — a scale lit a tick
 *     at a time is the oldest power-on there is.
 *   - the labels on a slider's handles (Parts.labelStart, labelCurrent, labelEnd), which are HTML,
 *     cut as a Label's words are: a letter, a word or a line at a time.
 *
 * A mark in an effect paints with currentColor, so the engine's colour keyframes (a typewriter's
 * arriving colour, a shimmer's light) reach it as they reach HTML text; it moves about its own box
 * (transform-box: fill-box) rather than the drawing's; and a roll or a push is clipped to a box about
 * each mark, as a Label's box clips its words.
 *
 * Pure: no DOM, no stores.
 */
import { knobTrackOf } from './knobTrack.js';
import { isSliderBehavior, getSliderValueMode } from './sliderBehavior.js';
import { resolveSliderSemanticParts } from './sliderEntityFactory.js';
import { textPieceStyles } from './textEffects.js';

/** The marks of a scale, drawn in the SVG: one piece each. */
export const SLIDER_MARK_PARTS = Object.freeze(['tickNumber', 'tickMajor', 'tickMinor']);
/** The labels riding a slider's handles, drawn as HTML: cut into letters, words or lines. */
export const SLIDER_HANDLE_LABEL_PARTS = Object.freeze(['labelStart', 'labelCurrent', 'labelEnd']);
export const SLIDER_WORD_PARTS = Object.freeze([...SLIDER_MARK_PARTS, ...SLIDER_HANDLE_LABEL_PARTS]);

let semanticNames = null;
/** The parts the slider renderer draws itself (utils/sliderEntityFactory.js), by name. */
function semanticPartNames() {
  semanticNames ??= new Set(Object.keys(resolveSliderSemanticParts(null)?._children ?? {}));
  return semanticNames;
}

/** Whether the slider renderer draws a part of this name itself, rather than as a part of its own. */
export function isSliderRendererPart(part) {
  return semanticPartNames().has(String(part));
}

/** Whether a control is a knob or a slider: the family SliderFamilyRenderer draws. */
export function isSliderFamily(control) {
  return isSliderBehavior(control?._children?.Behavior ?? null);
}

/** The handle labels a slider shows now, by its value mode: one on a single value, two or three on a range. */
function handleLabelsShown(behavior) {
  if (behavior?.showHandleLabels !== true) return [];
  const mode = getSliderValueMode(behavior);
  if (mode === 'single') return ['labelCurrent'];
  return mode === 'band' ? ['labelStart', 'labelCurrent', 'labelEnd'] : ['labelStart', 'labelEnd'];
}

/** The word and mark parts this knob or slider draws now, in the order a text effect dropped on it looks for one. */
export function sliderWordParts(control) {
  if (!isSliderFamily(control)) return [];
  const behavior = control._children.Behavior;
  const track = knobTrackOf(control, 100, 100);
  const parts = resolveSliderSemanticParts(control?._children?.Parts ?? null)._children;
  const numeral = (name) => String(parts?.[name]?.kind ?? '').toLowerCase() === 'numeral';
  const ticks = track.showTicks ? ['tickMajor', 'tickMinor'].filter((name) => parts?.[name]?.visible !== false) : [];
  const out = [];
  if (track.scaleNumberCount >= 2) out.push('tickNumber');
  out.push(...ticks.filter(numeral));
  out.push(...handleLabelsShown(behavior));
  out.push(...ticks.filter((name) => !numeral(name)));
  return out;
}

/** Where a text effect dropped on a knob or slider as a whole plays: its first words, or null when it draws none. */
export function sliderWordsPlace(control) {
  const first = sliderWordParts(control)[0];
  return first ? `Parts.${first}` : null;
}

const WORD_PLACES = 'its scale’s numbers, its ticks or the labels on its handles';

/**
 * Why a text effect on this place of a knob or slider plays on nothing, or '' when it plays: `part`
 * is the part's name, '' for the control's own words. A part the renderer does not draw (one added
 * to the control) is drawn as a part, with words of its own, and is not this function's business.
 */
export function sliderWordsRefusal(control, part = '') {
  if (!isSliderFamily(control)) return '';
  const name = control?._children?.Core?.name || 'This knob';
  if (!part) return `${name} has no words of its own: a text effect plays on ${WORD_PLACES}. Its name and value are Labels beside it.`;
  if (SLIDER_WORD_PARTS.includes(part)) {
    return sliderWordParts(control).includes(part) ? '' : `${name} does not show that now: turn it on in its Ticks section, or play the effect on ${WORD_PLACES}.`;
  }
  if (!isSliderRendererPart(part)) return '';
  if (part.startsWith('label')) return `${name} prints its name, value and range as Labels of their own beside it: put the effect on that Label.`;
  return `That part of ${name} draws no words: a text effect plays on ${WORD_PLACES}.`;
}

const INLINE_PIECE = 'display:inline-block;white-space:pre;';
const OWN_BOX = 'transform-box:fill-box;transform-origin:center;';

/**
 * Each mark's style for one run of an effect over a scale's `labels` (one entry a mark, its text or
 * ''): one piece a mark, round the scale; `whole` plays them together. For SVG: no inline display,
 * and a move about the mark's own box.
 */
export function markPieceStyles(effect, labels, { phase = 'a', seedText = '', at = null } = {}) {
  if (!effect || !labels?.length) return [];
  const pieces = labels.map((text) => ({ text: String(text ?? ''), animated: true }));
  const run = effect.split === 'whole' ? { ...effect, stagger: 0 } : effect;
  return textPieceStyles(run, pieces, { phase, seedText, at }).map((style) => `${style.replace(INLINE_PIECE, '')}${OWN_BOX}`);
}

const round = (value) => Math.round(value * 100) / 100;

/**
 * The box a mark is clipped to while a roll or a push moves it through: about the mark, from what it
 * is. A number (`text`, centred on x, y, at `size`) by its size and its length; a dot (`r`) by its
 * radius; a tick line (x1, y1, x2, y2) by its ends and its `width`.
 */
export function markClipBox(mark) {
  if (mark?.text != null) {
    const size = Math.max(1, Number(mark.size) || 1);
    const chars = Math.max(1, [...String(mark.text)].length);
    const width = chars * size * 0.62 + size * 0.4;
    const height = size * 1.3;
    return { x: round(mark.x - width / 2), y: round(mark.y - height / 2), width: round(width), height: round(height) };
  }
  if (mark?.r != null) {
    const r = Math.max(0.5, Number(mark.r) || 0) + 1;
    return { x: round(mark.x - r), y: round(mark.y - r), width: round(r * 2), height: round(r * 2) };
  }
  const pad = Math.max(0.5, (Number(mark?.width) || 1) / 2) + 1;
  const x = Math.min(mark.x1, mark.x2) - pad;
  const y = Math.min(mark.y1, mark.y2) - pad;
  return { x: round(x), y: round(y), width: round(Math.abs(mark.x2 - mark.x1) + pad * 2), height: round(Math.abs(mark.y2 - mark.y1) + pad * 2) };
}
