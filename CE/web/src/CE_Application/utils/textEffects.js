/**
 * textEffects.js — real text, animated whole or a piece at a time: the Text engine of the Animation
 * Designer (docs/design/animation-designer.md, step 2).
 *
 * An animation of kind `text` names an EFFECT and which WAY it goes, and the engine turns that into
 * pieces of the text, each with a CSS animation that starts a little after the last:
 *
 *   { kind: 'text', effect: 'typewriter', way: 'in' | 'out',
 *     split: 'letter' | 'word' | 'line' | 'whole', order: 'forward' | 'reverse' | 'centre' | 'random',
 *     stagger, duration, delay, easing,     // ms; duration is one piece's, stagger the gap between
 *     direction,                            // roll, push, wipe: which way the text moves
 *     scatter, scale,                       // explode: how far the letters fly, how large they get
 *     colour,                               // typewriter: the colour a letter arrives in; shimmer: the light
 *     iterations,                           // 1, or 'infinite' (a shimmer that keeps running)
 *     trigger, targets: [{ path: 'Text' | 'Parts.<part>' }] }
 *
 * The seven effects are default settings for that one engine (TEXT_EFFECTS), so every effect can be
 * tuned the same way and a preset of one is just numbers. "In" brings the text from the effect's
 * starting pose to the text as it is; "out" takes the text as it is to the effect's end pose, and
 * holds it there. Pieces are split by grapheme, not by UTF-16 unit, so an accent or an emoji is one
 * letter; and a script whose letters join (Arabic, Devanagari and others) is split into words
 * instead, because a letter cut out of a joined word changes its shape.
 *
 * Everything written into a <style> element is numbers, a hash and an AARRGGBB colour that has been
 * checked: nothing from the document's text, as keyframeAnimation.js keeps it.
 */
import { cleanFrameColour } from './keyframeAnimation.js';
import { easingToCss } from './easing.js';
import { readTrigger } from './interactionRuntime.js';

export const TEXT_KIND = 'text';
export const TEXT_WAYS = Object.freeze(['in', 'out']);
export const TEXT_SPLITS = Object.freeze(['letter', 'word', 'line', 'whole']);
export const TEXT_ORDERS = Object.freeze(['forward', 'reverse', 'centre', 'random']);
export const TEXT_DIRECTIONS = Object.freeze(['left', 'right', 'up', 'down']);

/**
 * What starts a text effect: a keyframe animation's triggers, and `textChange` — the words changed
 * (a Label that shows a knob's value, or its name and its value by turns). A textChange trigger's
 * `to` waits for one of a "name, value while touched" Label's two texts: ['value'], ['name'], or any.
 */
export const TEXT_TRIGGER_TYPES = Object.freeze(['always', 'stateChange', 'valueChange', 'beat', 'script', 'event', 'textChange']);
export const TEXT_TRIGGER_LABELS = Object.freeze({
  always: 'All the time',
  stateChange: 'In a state',
  valueChange: 'When the value changes',
  beat: 'On the beat',
  script: 'When a script plays it',
  event: 'On a click or gesture',
  textChange: 'When its words change',
});

/**
 * The first seven effects, as the owner approved them (2026-11-24): each one's defaults. `order`
 * may differ by way — a typewriter types forwards and deletes backwards.
 */
export const TEXT_EFFECTS = Object.freeze({
  typewriter: { label: 'Typewriter', split: 'letter', order: { in: 'forward', out: 'reverse' }, stagger: 45, duration: 300 },
  explode: { label: 'Explode', split: 'letter', order: { in: 'random', out: 'random' }, stagger: 18, duration: 520, scatter: 40, scale: 2.6 },
  roll: { label: 'Roll', split: 'whole', order: { in: 'forward', out: 'forward' }, stagger: 0, duration: 260, direction: 'up' },
  push: { label: 'Push', split: 'whole', order: { in: 'forward', out: 'forward' }, stagger: 0, duration: 320, direction: 'right' },
  wipe: { label: 'Wipe', split: 'whole', order: { in: 'forward', out: 'forward' }, stagger: 0, duration: 500, direction: 'right' },
  crossfade: { label: 'Crossfade', split: 'whole', order: { in: 'forward', out: 'forward' }, stagger: 0, duration: 300 },
  shimmer: { label: 'Shimmer', split: 'letter', order: { in: 'forward', out: 'reverse' }, stagger: 40, duration: 600, colour: 'FFFFFFFF' },
});
export const TEXT_EFFECT_NAMES = Object.freeze(Object.keys(TEXT_EFFECTS));

const LIMITS = { stagger: [0, 2000], duration: [1, 20000], delay: [0, 20000], scatter: [0, 400], scale: [0.05, 8] };

function clampNumber(value, [lo, hi], fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/** Where a text effect plays: a part's text, or the control's own ('' ). */
export function textEffectPart(animation) {
  for (const target of animation?.targets ?? []) {
    const path = String(target?.path ?? '').trim();
    if (path.startsWith('Parts.')) return path.split('.')[1] || '';
    if (path) return '';
  }
  return '';
}

/** A text animation read with every field defaulted and in range; null when it is not one or is off. */
export function readTextEffect(animation, key = '', { timeScale = 1 } = {}) {
  if (!animation || animation.enabled === false || String(animation.kind ?? '') !== TEXT_KIND) return null;
  const effect = TEXT_EFFECTS[animation.effect] ? animation.effect : 'typewriter';
  const base = TEXT_EFFECTS[effect];
  const way = TEXT_WAYS.includes(animation.way) ? animation.way : 'in';
  const scale = Number.isFinite(Number(timeScale)) && Number(timeScale) > 0 ? Number(timeScale) : 1;
  const trigger = readTrigger(animation);
  const raw = animation.iterations;
  const iterations = raw === 'infinite' ? 'infinite' : Math.max(1, Math.min(1000, Math.round(Number(raw) || 1)));
  return {
    name: String(animation.name ?? key),
    effect,
    way,
    split: TEXT_SPLITS.includes(animation.split) ? animation.split : base.split,
    order: TEXT_ORDERS.includes(animation.order) ? animation.order : base.order[way],
    stagger: clampNumber(animation.stagger, LIMITS.stagger, base.stagger) * scale,
    duration: clampNumber(animation.duration, LIMITS.duration, base.duration) * scale,
    delay: clampNumber(animation.delay, LIMITS.delay, 0) * scale,
    easing: easingToCss(animation),
    direction: TEXT_DIRECTIONS.includes(animation.direction) ? animation.direction : (base.direction ?? 'right'),
    scatter: clampNumber(animation.scatter, LIMITS.scatter, base.scatter ?? 40),
    scale: clampNumber(animation.scale, LIMITS.scale, base.scale ?? 2.6),
    colour: cleanFrameColour(animation.colour) ?? (effect === 'shimmer' ? base.colour : null),
    iterations,
    part: textEffectPart(animation),
    trigger,
  };
}

// --- Splitting ----------------------------------------------------------------------------------

// Scripts whose letters change shape with their neighbours: a letter on its own is a different
// glyph, so these are split into words. Written with \p{Script=…}: ASCII in the source, so the chunk
// stays one byte a character (vite.config.js, oneByteChunks).
const JOINING = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Thai}\p{Script=Lao}\p{Script=Tibetan}\p{Script=Myanmar}\p{Script=Khmer}]/u;

function graphemes(text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((part) => part.segment);
  }
  return Array.from(text);
}

function words(text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].map((part) => part.segment);
  }
  return text.split(/(\s+)/).filter((part) => part !== '');
}

/**
 * The text cut into pieces: `[{ text, animated }]`, in reading order, which joined give the text
 * back exactly. White space is a piece of its own and is not animated (a space appearing is nothing
 * to see, and it would only stretch the timing), except when the whole text is one piece.
 */
export function splitText(text, split = 'letter') {
  const source = String(text ?? '');
  if (!source) return [];
  let mode = split;
  if (mode === 'letter' && JOINING.test(source)) mode = 'word';
  let pieces;
  if (mode === 'whole') pieces = [source];
  else if (mode === 'line') pieces = source.split(/(\n)/).filter((part) => part !== '');
  else if (mode === 'word') pieces = words(source);
  else pieces = graphemes(source);
  return pieces.map((piece) => ({ text: piece, animated: mode === 'whole' || /\S/.test(piece) }));
}

/** A small, seeded random number generator: the same text plays the same way every time. */
function seeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h;
}

/** Each animated piece's place in the running order (0 first), by the effect's order. */
export function pieceRanks(pieces, order = 'forward', seedText = '') {
  const animated = pieces.map((piece, index) => (piece.animated ? index : -1)).filter((index) => index >= 0);
  const n = animated.length;
  const rankOf = new Map();
  if (order === 'reverse') animated.forEach((index, i) => rankOf.set(index, n - 1 - i));
  else if (order === 'centre') {
    const mid = (n - 1) / 2;
    const byDistance = animated.map((index, i) => ({ index, d: Math.abs(i - mid) })).sort((a, b) => a.d - b.d);
    let rank = -1;
    let last = -1;
    for (const { index, d } of byDistance) {
      if (d !== last) { rank += 1; last = d; }
      rankOf.set(index, rank);
    }
  } else if (order === 'random') {
    const random = seeded(hashText(seedText || pieces.map((piece) => piece.text).join('')));
    const shuffled = [...animated];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((index, i) => rankOf.set(index, i));
  } else animated.forEach((index, i) => rankOf.set(index, i));
  return pieces.map((_, index) => (rankOf.has(index) ? rankOf.get(index) : -1));
}

/** How long a text effect runs on this many animated pieces, from its trigger to the last piece. */
export function textEffectSpan(effect, animatedCount) {
  const ranks = Math.max(0, animatedCount - 1);
  return effect.delay + ranks * effect.stagger + effect.duration;
}

// --- CSS ----------------------------------------------------------------------------------------

const DIRECTIONS = 12;
const num = (value) => String(Math.round(value * 1000) / 1000);
const colourCss = (argb) => `#${argb.slice(2)}${argb.slice(0, 2)}`;

/** One of twelve directions a letter of an explosion flies in, and a little of its own distance. */
function scatterAt(slot, scatter) {
  const angle = (slot / DIRECTIONS) * Math.PI * 2;
  const reach = scatter * (0.7 + 0.3 * ((slot * 7) % DIRECTIONS) / DIRECTIONS);
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
}

/** The pose a piece starts from (in) or ends at (out), as declarations; `variant` picks a scatter slot. */
function poseDeclarations(effect, variant) {
  const away = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[effect.direction] ?? [1, 0];
  // In: the text travels in the direction, so it starts on the other side; out: it leaves that way.
  const sign = effect.way === 'in' ? -1 : 1;
  switch (effect.effect) {
    case 'explode': {
      const { x, y } = scatterAt(variant, effect.scatter);
      return `opacity:0;transform:translate(${num(x)}px,${num(y)}px) scale(${num(effect.scale)})`;
    }
    case 'roll':
      return `transform:translateY(${num(sign * (away[1] || -1) * 110)}%)`;
    case 'push':
      return `transform:translateX(${num(sign * (away[0] || 1) * 110)}%)`;
    case 'wipe': {
      // In: revealed from the side it travels from; out: hidden towards the side it travels to.
      const edge = effect.way === 'in'
        ? { right: '0 100% 0 0', left: '0 0 0 100%', down: '0 0 100% 0', up: '100% 0 0 0' }[effect.direction]
        : { right: '0 0 0 100%', left: '0 100% 0 0', down: '100% 0 0 0', up: '0 0 100% 0' }[effect.direction];
      return `clip-path:inset(${edge ?? '0 100% 0 0'})`;
    }
    case 'typewriter':
    case 'crossfade':
    default:
      return 'opacity:0';
  }
}

/** The @keyframes body for one variant of an effect, with the colour property this text paints with. */
function keyframesBody(effect, variant, colourProperty) {
  if (effect.effect === 'shimmer') {
    return `0%,100%{}50%{${colourProperty}:${colourCss(effect.colour ?? 'FFFFFFFF')}}`;
  }
  if (effect.effect === 'typewriter') {
    const colour = effect.colour ? `${colourProperty}:${colourCss(effect.colour)};` : '';
    // A letter appears at once, in its arriving colour, and takes its own colour over the duration.
    return effect.way === 'in'
      ? `0%{opacity:0;${colour}}1%{opacity:1;${colour}}100%{opacity:1}`
      : `0%{opacity:1}99%{opacity:1}100%{opacity:0}`;
  }
  const pose = poseDeclarations(effect, variant);
  return effect.way === 'in' ? `0%{${pose}}100%{}` : `0%{}100%{${pose}}`;
}

/** A short, stable name for an effect's settings, for its keyframes rules. */
export function textEffectHash(effect, colourProperty = 'color') {
  return hashText(JSON.stringify([effect.effect, effect.way, effect.direction, effect.scatter, effect.scale, effect.colour, colourProperty])).toString(36);
}

const variantsOf = (effect) => (effect.effect === 'explode' ? DIRECTIONS : 1);

/** Every @keyframes rule an effect needs in a phase ('a' or 'b': flipped to restart it). */
export function textEffectRules(effect, { phase = 'a', colourProperty = 'color' } = {}) {
  const hash = textEffectHash(effect, colourProperty);
  const rules = [];
  for (let variant = 0; variant < variantsOf(effect); variant += 1) {
    rules.push(`@keyframes ce-tx-${hash}-${variant}-${phase}{${keyframesBody(effect, variant, colourProperty)}}`);
  }
  return rules.join('');
}

/**
 * The inline style of each piece for one run of an effect over `pieces`: `animation` on the animated
 * ones, nothing on white space, and the display that lets a transform apply to a piece of a line.
 * A shimmer that loops starts each piece in step with the others, so the light keeps travelling.
 */
export function textPieceStyles(effect, pieces, { phase = 'a', colourProperty = 'color', seedText = '' } = {}) {
  const hash = textEffectHash(effect, colourProperty);
  const ranks = pieceRanks(pieces, effect.order, seedText);
  const count = effect.iterations === 'infinite' ? 'infinite' : String(effect.iterations);
  const fill = effect.way === 'out' ? 'both' : 'backwards';
  const moves = ['explode', 'roll', 'push'].includes(effect.effect);
  return pieces.map((piece, index) => {
    const display = moves ? 'display:inline-block;white-space:pre;' : '';
    if (ranks[index] < 0) return display;
    const variant = effect.effect === 'explode' ? hashText(`${seedText}:${index}`) % DIRECTIONS : 0;
    const delay = effect.delay + ranks[index] * effect.stagger;
    return `${display}animation:ce-tx-${hash}-${variant}-${phase} ${Math.round(effect.duration)}ms ${effect.easing} ${Math.round(delay)}ms ${count} normal ${fill};`;
  });
}

/** Whether an effect slides the text across its own box, which then has to clip it. */
export function textEffectClips(effect) {
  return effect?.effect === 'roll' || effect?.effect === 'push';
}

/** A new text animation, as the Animation tab and the States tab make one. */
export function newTextEffectShape(name, effect = 'typewriter', way = 'in', part = '') {
  const base = TEXT_EFFECTS[effect] ?? TEXT_EFFECTS.typewriter;
  return {
    _type: 'Animation',
    name: String(name ?? ''),
    enabled: true,
    kind: TEXT_KIND,
    effect: TEXT_EFFECTS[effect] ? effect : 'typewriter',
    way: TEXT_WAYS.includes(way) ? way : 'in',
    split: base.split,
    order: base.order[TEXT_WAYS.includes(way) ? way : 'in'],
    stagger: base.stagger,
    duration: base.duration,
    delay: 0,
    easing: 'outQuad',
    ...(base.direction ? { direction: base.direction } : {}),
    ...(effect === 'explode' ? { scatter: base.scatter, scale: base.scale } : {}),
    ...(base.colour ? { colour: base.colour } : {}),
    iterations: 1,
    trigger: { type: 'script', from: ['*'], to: [] },
    targets: [{ path: part ? `Parts.${part}` : 'Text' }],
  };
}

/**
 * The name ↔ value swap of the owner's example (2026-11-24), for a Label that shows a knob's name
 * and, while the knob is touched, its value (`Text.shows: 'nameValue'`): the name pushed out to the
 * right as the value pushes in after it; on letting go, the value fades and the name is typed back,
 * its letters arriving pale and taking their own colour. Four text effects, each on the swap that
 * brings its text: `textChange` to 'value' or to 'name'.
 */
export function nameValueSwapAnimations() {
  const swap = (name, effect, way, to, extra = {}) => ({
    ...newTextEffectShape(name, effect, way),
    trigger: { type: 'textChange', from: ['*'], to: [to] },
    ...extra,
  });
  return {
    valueIn: swap('valueIn', 'push', 'in', 'value', { direction: 'right' }),
    nameOut: swap('nameOut', 'push', 'out', 'value', { direction: 'right' }),
    valueOut: swap('valueOut', 'crossfade', 'out', 'name', { duration: 220 }),
    nameIn: swap('nameIn', 'typewriter', 'in', 'name', { delay: 150, colour: 'FFFFE3E3' }),
  };
}

/**
 * The patch that makes `label` a name ↔ value Label: it shows "name, value while touched", and has
 * the four swap animations (named so they do not collide with any it has). `{ patch, names }`.
 */
export function nameValueSwapPatch(label, writeAnimations) {
  const existing = new Set(Object.keys(label?._children?.Animations?._children ?? {}));
  const nodes = {};
  for (const [base, node] of Object.entries(nameValueSwapAnimations())) {
    let name = base;
    for (let n = 2; existing.has(name); n += 1) name = `${base}${n}`;
    existing.add(name);
    nodes[name] = { ...node, name };
  }
  // The writer of animations (animationModel.animationsPatch) is passed in: that module imports this
  // one, and a Label has no Animations section to write into until one is made.
  return { patch: { 'Text.shows': 'nameValue', ...writeAnimations(label, nodes) }, names: Object.keys(nodes) };
}
