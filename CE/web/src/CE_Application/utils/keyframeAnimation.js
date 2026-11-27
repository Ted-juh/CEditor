/**
 * keyframeAnimation.js — the second kind of animation: a shape of its own, played by CSS.
 *
 * A transition eases a property from one style to the next when something changes; it has no
 * shape of its own and nothing to do while nothing changes. A keyframe animation is the other
 * thing — a pulse, a wobble, a lamp blinking — and plays a list of frames, while its trigger holds
 * or once each time it fires.
 *
 * The node:
 *
 *   { kind: 'keyframes', duration, delay, easing,
 *     iterations: <n> | 'infinite',     // default: infinite for always/stateChange, 1 otherwise
 *     direction: 'normal' | 'alternate',
 *     trigger: { type: 'always'|'stateChange'|'valueChange'|'beat'|'script',
 *                to, from,              // stateChange: plays WHILE a To state is active (looping),
 *                                       //   or once on entering one (a finite count)
 *                source, origin,        // valueChange: once per change
 *                every },               // beat: once every N transport beats while it runs
 *     targets: [{ path }],              // only the part matters: 'Parts.<name>…', else the control
 *     frames: [{ at: 0..1, scale, rotate, x, y, opacity,
 *                fill, text,            // colours, AARRGGBB as everywhere else in the document
 *                turn, shift }] }       // the fill gradient's angle (deg) and its stops (%), added
 *
 * HOW IT DRAWS. Frames are written with the INDIVIDUAL transform properties — `scale`, `rotate`,
 * `translate` — not `transform`. A control is already scaled and rotated by its own `transform`
 * (and a state can patch it); an animation that wrote `transform` would replace that, so a knob
 * rotated 30° would snap upright to pulse. The individual properties compose with it instead.
 *
 * HOW IT RESTARTS. A CSS animation restarts when its NAME changes, not when anything else does, so
 * every animation is written twice under two names (`…-a`, `…-b`) and a one-shot that fires again
 * flips between them — the trick utils/chromeMotion.js uses for the workspace swap.
 *
 * HOW COLOUR DRAWS. A control's colour is not painted by the element that moves: a fill sits on
 * an inner layer (`.control-content`, BackgroundRenderer's solid layer, a part's simple background,
 * a vector shape) and text on its own span, each with an inline colour of its own that a keyframe on
 * the moving element cannot reach. So colour frames become separate @keyframes — one per CHANNEL,
 * below — and travel to the layers that paint as inherited custom properties (`--ce-kf-paint` and
 * the rest, colourVariables). Every control and every part sets all four, `none` where it has
 * nothing, so a control's colour pulse does not leak into the parts drawn inside it. Where the
 * moving element is itself the painter (a part whose fill is absorbed onto it, a slider's pointer
 * shape) the renderer appends the channel's list to its own `animation` instead.
 *
 * AND A GRADIENT. `turn` and `shift` frames move a fill gradient's angle and every one of its stops
 * (utils/gradientPaint.js: the registered `--ce-g-turn` and `--ce-g-shift` it is written with). They
 * are the fifth channel, `gradient`, carried to the gradient layer as `--ce-kf-gradient` like the
 * colours, so a sheen can sweep across a chrome fill or a conic gradient spin while the control does
 * not move. 2026-11-24, the Animation Designer's step 3.
 *
 * AND AN IMAGE. `panX`, `panY`, `zoom` and `spin` frames move a fill's background image inside its
 * clip: a slow zoom and drift across a photograph, a dial face turning behind the knob. They are
 * the sixth channel, `image`, carried as `--ce-kf-image` to the element that paints the picture
 * (BackgroundRenderer's `.bg-fill-paint`), whose own `translate`, `scale` and `rotate` they animate —
 * individual properties, so they add to the rotation and flips the image is set with.
 */
import { readTrigger } from './interactionRuntime.js';
import { easingToCss } from './easing.js';
import { describeChange, matchStrength } from './transitionSelection.js';
import { textEffectRules } from './textEffects.js';
import { GRADIENT_VARS } from './gradientPaint.js';
import { cleanValueFrames } from './sceneFormat.js';

// `event`: a gesture on the control — click, double-click, long press, flick, a wheel turn — played
// on request from where the gesture is recognised, as `script` is from ce.anim.play. Its id is in
// `trigger.event` (stateMotion.js MOTION_EVENTS); the player needs no branch for it. 2026-11-24.
//
// `valueStep`: each time the value comes to a new step, the range cut into `trigger.steps` (or the
// control's own steps). Unlike valueChange it plays during a drag, once a step however fast the hand
// goes, and it knows which way the value turned: a text effect whose direction is `turn` goes that
// way, and an emitted word (EMIT, below) knows where it came from. A detent, a stream of numbers.
// The Components showcase's Knob, phase 2 (docs/design/component-presets.md). 2026-11-26.
// A keyframe animation on it may follow the turn too (`followTurn`): played mirrored, side for side,
// when the value stepped back (mirroredEntry). A choice group leaning toward the option chosen,
// whichever side that is: the Choice group's Lean. 2026-11-27.
// `hold`: a timed button held to confirm (or waiting for its second click): plays from the moment it
// is held, over exactly as long as it must be held (interactionRuntime.js gives the entry the
// button's own hold time), and stops if it is let go early. A hold's progress, drawn by whatever
// the animation moves: a lamp that fills, a key that colours. The Components showcase's Button.
export const KEYFRAME_TRIGGER_TYPES = ['always', 'stateChange', 'valueChange', 'valueStep', 'beat', 'script', 'event', 'hold'];

/** What a frame can set, and the value each has when a frame leaves it out. */
export const FRAME_PROPERTIES = ['scale', 'rotate', 'x', 'y', 'opacity'];
export const FRAME_DEFAULTS = Object.freeze({ scale: 1, rotate: 0, x: 0, y: 0, opacity: 1 });

/**
 * EMIT. The kind of animation that makes words rather than moving them: each time it plays (on a
 * step, usually), the control's value, or how far it moved, is thrown out from the pointer's tip
 * (or the dial's centre), along the pointer or straight up, and fades as it goes. Several can be in
 * the air at once. The player keeps each word while it flies; the slider renderer draws them.
 *
 *   { kind: 'emit', shows: 'value' | 'delta' | 'words' | 'count', words, from: 'tip' | 'centre',
 *     direction: 'pointer' | 'up', travel (px), size (px), colour (AARRGGBB or none: the readout's),
 *     duration, delay, easing, trigger }
 *
 * `words` throws words of its own ("SENT", "+1"), and `count` how many times it has thrown (1, 2,
 * 3…), which is what a button can say: it has no value to speak of. On a button a word rises from
 * the key (`centre`) or from its top edge (`tip`); CanvasControl draws it. The Components
 * showcase's Button.
 */
export const EMIT_KIND = 'emit';
export const EMIT_SHOWS = Object.freeze(['value', 'delta', 'words', 'count']);
/** Words of its own, as many as read at a glance. */
export const EMIT_WORDS_LIMIT = 24;
export const EMIT_FROM = Object.freeze(['tip', 'centre']);
export const EMIT_DIRECTIONS = Object.freeze(['pointer', 'up']);
const EMIT_LIMITS = { travel: [0, 400], size: [6, 72], duration: [80, 5000] };
const clampTo = (value, [low, high], fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback;
};

/** An emit animation read with every field defaulted and in range; null when it is not one or is off. */
export function readEmit(animation, key = '', { timeScale = 1 } = {}) {
  if (!animation || typeof animation !== 'object' || animation.enabled === false) return null;
  if (String(animation.kind ?? '') !== EMIT_KIND) return null;
  const scale = Number(timeScale) > 0 ? Number(timeScale) : 1;
  const duration = clampTo(animation.duration, EMIT_LIMITS.duration, 700) * scale;
  const delay = Math.max(0, Number(animation.delay) || 0) * scale;
  const emit = {
    shows: EMIT_SHOWS.includes(animation.shows) ? animation.shows : 'value',
    words: String(animation.words ?? '').trim().slice(0, EMIT_WORDS_LIMIT),
    from: EMIT_FROM.includes(animation.from) ? animation.from : 'tip',
    direction: EMIT_DIRECTIONS.includes(animation.direction) ? animation.direction : 'pointer',
    travel: clampTo(animation.travel, EMIT_LIMITS.travel, 36),
    size: clampTo(animation.size, EMIT_LIMITS.size, 12),
    colour: cleanFrameColour(animation.colour),
    duration,
    delay,
    easing: easingToCss(animation),
  };
  return {
    name: String(animation.name ?? key),
    emit,
    moves: false,
    part: '',
    duration,
    delay,
    iterations: 1,
    trigger: readTrigger(animation),
    frames: [],
    span: delay + duration,
  };
}

/** The limits a frame value is kept to — past them a typo, not a design. */
const FRAME_LIMITS = { scale: [0, 10], rotate: [-3600, 3600], x: [-2000, 2000], y: [-2000, 2000], opacity: [0, 1] };

/** The colours a frame can set: the fill it paints with, and its text. */
export const FRAME_COLOURS = ['fill', 'text'];

/** What a frame can do to a fill gradient: turn it (degrees) and shift its stops (percent). */
export const FRAME_GRADIENT = ['turn', 'shift'];
const GRADIENT_LIMITS = { turn: [-3600, 3600], shift: [-200, 200] };

/**
 * What a frame can do to a fill's image (AND AN IMAGE, below): pan it across and down (percent of
 * the box), zoom it (times its size) and spin it (degrees), inside the clip it is painted in.
 */
export const FRAME_IMAGE = ['panX', 'panY', 'zoom', 'spin'];
const IMAGE_LIMITS = { panX: [-200, 200], panY: [-200, 200], zoom: [0.1, 10], spin: [-3600, 3600] };

/**
 * A frame colour as the document stores colours — AARRGGBB, upper case — or null. Six digits are
 * opaque. Nothing else is accepted, and that is not tidiness: the colour is written into a <style>
 * element, and a value that is only ever eight hex digits has nothing in it to escape.
 */
export function cleanFrameColour(value) {
  const hex = String(value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{8}$/.test(hex)) return hex.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `FF${hex.toUpperCase()}`;
  return null;
}

/** AARRGGBB to CSS `#RRGGBBAA`. */
const colourCss = (argb) => `#${argb.slice(2)}${argb.slice(0, 2)}`;

/**
 * Where a colour frame is painted. Fill is three channels because three kinds of element paint a
 * fill — a box (background-color), a shape (fill), a line (stroke) — and an element animates the
 * one property it paints with, not all three: a knob's arc is a path with fill="none", and filling
 * it would draw a pie.
 */
export const COLOUR_CHANNELS = Object.freeze({
  paint: { frame: 'fill', property: 'background-color' },
  shape: { frame: 'fill', property: 'fill' },
  stroke: { frame: 'fill', property: 'stroke' },
  text: { frame: 'text', property: 'color' },
});
/** The fifth channel: a fill gradient's turn and shift (see AND A GRADIENT). */
export const GRADIENT_CHANNEL = 'gradient';
/** The sixth: a fill image's pan, zoom and spin (see AND AN IMAGE). */
export const IMAGE_CHANNEL = 'image';
const CHANNEL_NAMES = [...Object.keys(COLOUR_CHANNELS), GRADIENT_CHANNEL, IMAGE_CHANNEL];

/** A new keyframe animation's frames: a gentle pulse that ends where it starts. */
export const PULSE_FRAMES = Object.freeze([
  Object.freeze({ at: 0, scale: 1 }),
  Object.freeze({ at: 0.5, scale: 1.08 }),
  Object.freeze({ at: 1, scale: 1 }),
]);

/** Loop while the trigger holds, or play a set number of times each time it fires. */
export function defaultIterations(triggerType) {
  return triggerType === 'always' || triggerType === 'stateChange' ? 'infinite' : 1;
}

/** Where a keyframe animation plays: the part its first target names, or '' for the control. */
export function keyframePart(animation) {
  for (const target of animation?.targets ?? []) {
    const path = String(target?.path ?? '').trim();
    if (!path) continue;
    if (path.startsWith('Parts.')) return path.split('.')[1] || '';
    return '';
  }
  return '';
}

/** Frames with known properties only, numbers in range, sorted by position. */
export function cleanFrames(frames) {
  const out = [];
  for (const frame of Array.isArray(frames) ? frames : []) {
    if (!frame || typeof frame !== 'object') continue;
    const at = Number(frame.at);
    if (!Number.isFinite(at)) continue;
    const clean = { at: Math.min(1, Math.max(0, at)) };
    for (const key of FRAME_PROPERTIES) {
      const value = Number(frame[key]);
      if (frame[key] === undefined || frame[key] === null || frame[key] === '' || !Number.isFinite(value)) continue;
      const [lo, hi] = FRAME_LIMITS[key];
      clean[key] = Math.min(hi, Math.max(lo, value));
    }
    for (const key of FRAME_COLOURS) {
      const colour = cleanFrameColour(frame[key]);
      if (colour) clean[key] = colour;
    }
    for (const key of FRAME_GRADIENT) {
      const value = Number(frame[key]);
      if (frame[key] === undefined || frame[key] === null || frame[key] === '' || !Number.isFinite(value)) continue;
      const [lo, hi] = GRADIENT_LIMITS[key];
      clean[key] = Math.min(hi, Math.max(lo, value));
    }
    for (const key of FRAME_IMAGE) {
      const value = Number(frame[key]);
      if (frame[key] === undefined || frame[key] === null || frame[key] === '' || !Number.isFinite(value)) continue;
      const [lo, hi] = IMAGE_LIMITS[key];
      clean[key] = Math.min(hi, Math.max(lo, value));
    }
    out.push(clean);
  }
  return out.sort((a, b) => a.at - b.at);
}

function readIterations(animation, triggerType) {
  const raw = animation?.iterations;
  if (raw === 'infinite' || raw === Infinity) return 'infinite';
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1) return Math.min(1000, Math.round(n));
  return defaultIterations(triggerType);
}

/**
 * One keyframe animation, read for playing. Null when it is switched off, is not a keyframe
 * animation, or has no frames to play.
 */
export function readKeyframes(animation, key = '', { timeScale = 1 } = {}) {
  if (!animation || typeof animation !== 'object' || animation.enabled === false) return null;
  if (String(animation.kind ?? '') !== 'keyframes') return null;
  const frames = cleanFrames(animation.frames);
  if (!frames.length) return null;
  const trigger = readTrigger(animation);
  const scale = Number(timeScale) > 0 ? Number(timeScale) : 1;
  const duration = Math.max(0, Number.isFinite(Number(animation.duration)) ? Number(animation.duration) : 600) * scale;
  const delay = Math.max(0, Number.isFinite(Number(animation.delay)) ? Number(animation.delay) : 0) * scale;
  const iterations = readIterations(animation, trigger.type);
  return {
    name: String(animation.name ?? key),
    // Whether any frame moves or fades it. A colour-only animation writes no motion keyframes.
    moves: frames.some((frame) => FRAME_PROPERTIES.some((property) => frame[property] !== undefined)),
    part: keyframePart(animation),
    duration,
    delay,
    easing: easingToCss(animation),
    iterations,
    direction: animation.direction === 'alternate' ? 'alternate' : 'normal',
    trigger,
    frames,
    // Each step only: mirrored, side for side, when the value stepped back (mirroredEntry, below).
    followTurn: animation.followTurn === true && trigger.type === 'valueStep',
    // How long one firing runs. Infinity for a loop, which never finishes on its own.
    span: iterations === 'infinite' ? Infinity : delay + duration * iterations,
  };
}

/**
 * A value animation (step 6, utils/valueDrawn.js) as the keyframe player plays it: the same triggers,
 * runs and restarts, with `value` holding the effect instead of CSS frames. It moves what a knob's or
 * a slider's value draws, which CanvasControl works out a frame at a time from the run's start.
 */
export function readValueAnimation(animation, key = '', { timeScale = 1 } = {}) {
  if (!animation || typeof animation !== 'object' || animation.enabled === false) return null;
  if (String(animation.kind ?? '') !== 'value') return null;
  const frames = cleanValueFrames(animation.frames);
  if (!frames) return null;
  const trigger = readTrigger(animation);
  const scale = Number(timeScale) > 0 ? Number(timeScale) : 1;
  const duration = Math.max(10, Number.isFinite(Number(animation.duration)) ? Number(animation.duration) : 1200) * scale;
  const delay = Math.max(0, Number.isFinite(Number(animation.delay)) ? Number(animation.delay) : 0) * scale;
  const iterations = readIterations(animation, trigger.type);
  const effect = { kind: 'value', easing: String(animation.easing ?? 'inOutCubic'), frames };
  if (animation.bezier !== undefined) effect.bezier = animation.bezier;
  if (animation.spring !== undefined) effect.spring = animation.spring;
  return {
    name: String(animation.name ?? key),
    value: effect,
    moves: false,
    part: '',
    duration,
    delay,
    iterations,
    trigger,
    frames: [],
    span: iterations === 'infinite' ? Infinity : delay + duration * iterations,
  };
}

const number = (value) => Number(Number(value).toFixed(4)).toString();

/** One frame as CSS declarations, using the individual transform properties. */
function frameDeclarations(frame) {
  const out = [];
  if (frame.scale !== undefined) out.push(`scale:${number(frame.scale)}`);
  if (frame.rotate !== undefined) out.push(`rotate:${number(frame.rotate)}deg`);
  if (frame.x !== undefined || frame.y !== undefined) out.push(`translate:${number(frame.x ?? 0)}px ${number(frame.y ?? 0)}px`);
  if (frame.opacity !== undefined) out.push(`opacity:${number(frame.opacity)}`);
  return out.join(';');
}

/** A short, stable name for a set of frames: equal frames share their @keyframes. */
export function framesHash(frames) {
  const text = JSON.stringify(frames);
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * An entry that follows the turn (`followTurn`, on Each step) as it plays when the value stepped back:
 * its frames mirrored side for side, every sideways move and turn the other way, so a lean toward
 * the next choice leans toward the one before when the choice goes back. Its own frames hash to a
 * rule of its own. The Components showcase's Choice group, Lean (docs/design/component-presets.md).
 */
const mirrored = new WeakMap();
export function mirroredEntry(entry) {
  if (!mirrored.has(entry)) {
    mirrored.set(entry, {
      ...entry,
      frames: entry.frames.map((frame) => ({
        ...frame,
        // 0 - n rather than -n: a frame at rest stays at 0, not -0.
        ...(frame.x !== undefined ? { x: 0 - frame.x } : {}),
        ...(frame.rotate !== undefined ? { rotate: 0 - frame.rotate } : {}),
      })),
    });
  }
  return mirrored.get(entry);
}

/** The @keyframes rule for one phase of one entry. Numbers and a hash only — nothing to escape. */
export function keyframesRule(entry, phase = 'a') {
  const body = entry.frames
    .map((frame) => `${number(frame.at * 100)}%{${frameDeclarations(frame)}}`)
    .join('');
  return `@keyframes ce-kf-${framesHash(entry.frames)}-${phase}{${body}}`;
}

/**
 * The timing after an animation's name: duration, easing, delay, count, direction, fill mode.
 *
 * `at` poses it rather than plays it (the Animation Designer's playhead, step 5): the delay moves
 * back by `at` ms and the animation is paused, so the browser shows exactly where it is at that
 * moment and nothing moves. `fill` is a scene clip's: it holds its first frame before it starts and
 * its last after (`both`), where a control's own animation leaves the element as it was (`none`).
 */
function timing(entry, { at = null, fill = 'none' } = {}) {
  const count = entry.iterations === 'infinite' ? 'infinite' : String(entry.iterations);
  const posed = Number.isFinite(at);
  const delay = Math.round(entry.delay - (posed ? at : 0));
  return `${Math.round(entry.duration)}ms ${entry.easing} ${delay}ms ${count} ${entry.direction} ${fill}${posed ? ' paused' : ''}`;
}

/**
 * The `animation` value for an entry in a phase.
 * Fill mode none: when a run ends, the element is its own style again — a pulse that ends at scale
 * 1.08 by mistake does not stick there.
 */
export function animationValue(entry, phase = 'a', options = {}) {
  return `ce-kf-${framesHash(entry.frames)}-${phase} ${timing(entry, options)}`;
}

/**
 * The frames that set a channel's colour, as [{ at, colour }] — empty when none do. For the gradient
 * channel, the frames that turn or shift it, as [{ at, turn?, shift? }].
 */
export function channelFrames(entry, channel) {
  if (channel === IMAGE_CHANNEL) {
    return entry.frames
      .filter((frame) => FRAME_IMAGE.some((key) => frame[key] !== undefined))
      .map((frame) => ({ at: frame.at, ...Object.fromEntries(FRAME_IMAGE.filter((key) => frame[key] !== undefined).map((key) => [key, frame[key]])) }));
  }
  if (channel === GRADIENT_CHANNEL) {
    return entry.frames
      .filter((frame) => frame.turn !== undefined || frame.shift !== undefined)
      .map((frame) => ({
        at: frame.at,
        ...(frame.turn !== undefined ? { turn: frame.turn } : {}),
        ...(frame.shift !== undefined ? { shift: frame.shift } : {}),
      }));
  }
  const key = COLOUR_CHANNELS[channel]?.frame;
  return key ? entry.frames.filter((frame) => frame[key] !== undefined).map((frame) => ({ at: frame.at, colour: frame[key] })) : [];
}

/**
 * One channel's @keyframes. Colour values are AARRGGBB by the time they get here (cleanFrames), so
 * like the motion rule this is numbers, hex and a hash — nothing to escape. A frame that leaves the
 * colour out is not in this rule at all, and the colour eases through it from the frames either side.
 */
export function colourKeyframesRule(entry, channel, phase = 'a') {
  const frames = channelFrames(entry, channel);
  if (channel === IMAGE_CHANNEL) {
    // A frame that pans writes both axes (a pan along one is none along the other); one that only
    // zooms or spins leaves translate out, so the pan eases through it from the frames either side.
    const body = frames.map((frame) => {
      const declarations = [];
      if (frame.panX !== undefined || frame.panY !== undefined) declarations.push(`translate:${number(frame.panX ?? 0)}% ${number(frame.panY ?? 0)}%`);
      if (frame.zoom !== undefined) declarations.push(`scale:${number(frame.zoom)}`);
      if (frame.spin !== undefined) declarations.push(`rotate:${number(frame.spin)}deg`);
      return `${number(frame.at * 100)}%{${declarations.join(';')}}`;
    }).join('');
    return `@keyframes ce-kf-${channel}-${framesHash(frames)}-${phase}{${body}}`;
  }
  if (channel === GRADIENT_CHANNEL) {
    const body = frames.map((frame) => {
      const declarations = [];
      if (frame.turn !== undefined) declarations.push(`${GRADIENT_VARS.turn}:${number(frame.turn)}deg`);
      if (frame.shift !== undefined) declarations.push(`${GRADIENT_VARS.shift}:${number(frame.shift)}%`);
      return `${number(frame.at * 100)}%{${declarations.join(';')}}`;
    }).join('');
    return `@keyframes ce-kf-${channel}-${framesHash(frames)}-${phase}{${body}}`;
  }
  const { property } = COLOUR_CHANNELS[channel];
  const body = frames.map((frame) => `${number(frame.at * 100)}%{${property}:${colourCss(frame.colour)}}`).join('');
  return `@keyframes ce-kf-${channel}-${framesHash(frames)}-${phase}{${body}}`;
}

/** A channel's `animation` value, on the same clock as the entry's motion: same timing, same phase. */
export function colourAnimationValue(entry, channel, phase = 'a', options = {}) {
  return `ce-kf-${channel}-${framesHash(channelFrames(entry, channel))}-${phase} ${timing(entry, options)}`;
}

/**
 * Whether a looping state animation should be playing in this frame: a To state is active, or —
 * for a To of "any" — any state at all is.
 */
function stateHolds(trigger, activeStates) {
  const active = new Set((activeStates ?? []).map((state) => String(state).trim().toLowerCase()).filter(Boolean));
  const to = trigger.to ?? [];
  if (!to.length || to.includes('*')) return active.size > 0;
  if (to.includes('default') && active.size === 0) return true;
  return to.some((state) => active.has(state));
}

/**
 * One control's keyframe player. Like the transition tracker it remembers the frame before, which
 * is what "fired" means; unlike it, its output is not a transition but a list of animations to
 * apply, per part ('' is the control), plus the @keyframes they need.
 *
 * `next(runtime, { reducedMotion, beats, plays })`:
 *   - `beats` is the transport position while it runs, null while it does not;
 *   - `plays` is `{ [animationName]: seq }` for this control, from ce.anim.play and the stage's
 *     Play — a seq that moved since the last frame is a request to play that animation now.
 */
export function createKeyframePlayer({ now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
  let previousFrame = null;
  let previousBeatSlot = new Map();     // name -> floor(beats / every)
  let previousStepSlot = new Map();     // name -> the step the value was on (valueStep)
  let emitted = [];                     // words in the air: [{ id, name, emit, at, value, from, turn, count }]
  let emitSeq = 0;
  const previousEmitValue = new Map();  // name -> the value when its last word was thrown
  const emitCount = new Map();          // name -> how many words it has thrown
  let previousPlays = {};
  const heldBefore = new Map();         // name -> whether a looping state animation's state held
  const runs = new Map();               // name -> { phase, startedAt } for anything that has played
  let last = { parts: new Map(), colours: new Map(), texts: new Map(), values: [], emits: [], rules: '', fired: [], key: '' };

  // A word thrown: the value now and the value at the last word, for a delta.
  // A word of its own or a count needs no value: a button has none.
  const throwWord = (entry, t, value, turn) => {
    const own = entry.emit.shows === 'words' || entry.emit.shows === 'count';
    if (!own && !Number.isFinite(value)) return;
    const from = previousEmitValue.get(entry.name) ?? value;
    previousEmitValue.set(entry.name, value);
    const count = (emitCount.get(entry.name) ?? 0) + 1;
    emitCount.set(entry.name, count);
    emitted.push({ id: (emitSeq += 1), name: entry.name, emit: entry.emit, at: t, value, from, turn, count });
  };

  const flip = (name, t, turn = null) => {
    const run = runs.get(name);
    runs.set(name, { phase: run?.phase === 'a' ? 'b' : 'a', startedAt: t, turn: turn ?? run?.turn ?? 1 });
  };

  return {
    next(runtime, { reducedMotion = false, beats = null, plays = {} } = {}) {
      const catalog = runtime?.keyframes;
      const frame = { activeStates: runtime?.activeStates ?? [], signals: runtime?.signals ?? {} };
      const change = describeChange(previousFrame, frame);
      previousFrame = frame;
      const t = now();
      const fired = [];
      const entries = catalog?.enabled && !catalog.reducedMotion && !reducedMotion ? (catalog.entries ?? []) : [];
      const playing = new Map();          // name -> phase

      for (const entry of entries) {
        const trigger = entry.trigger;
        const requested = plays?.[entry.name] !== undefined && plays[entry.name] !== previousPlays?.[entry.name];
        if (requested) { flip(entry.name, t); fired.push(entry.name); }

        if (trigger.type === 'always') {
          if (!runs.has(entry.name)) runs.set(entry.name, { phase: 'a', startedAt: t });
          playing.set(entry.name, runs.get(entry.name).phase);
          continue;
        }

        if (trigger.type === 'hold') {
          // Held to confirm: from the moment the hold begins, once, for as long as it lasts. Let go
          // early, it stops where it was and the part goes back; held to the end, the button fires
          // (the Executed state) as it reaches its last frame.
          const holds = frame.signals?.pending === true;
          const held = heldBefore.get(entry.name) === true;
          heldBefore.set(entry.name, holds);
          if (holds && !held && !requested) { flip(entry.name, t); fired.push(entry.name); }
          if (holds || requested) playing.set(entry.name, runs.get(entry.name).phase);
          if (entry.emit && holds && !held) throwWord(entry, t, Number(frame.signals?.valueNormalized), 1);
          continue;
        }

        if (trigger.type === 'stateChange' && entry.iterations === 'infinite') {
          // A loop plays while its state holds and stops when it does not. A play request restarts
          // it if it is playing; it does not start a loop whose state is not there.
          const holds = stateHolds(trigger, frame.activeStates);
          const held = heldBefore.get(entry.name) === true;
          heldBefore.set(entry.name, holds);
          if (holds && !held && !requested) { flip(entry.name, t); if (!change.first) fired.push(entry.name); }
          if (holds) playing.set(entry.name, runs.get(entry.name).phase);
          continue;
        }

        let fire = false;
        if (trigger.type === 'stateChange') {
          // A finite state animation plays once on the way in, by the transition rules' forward match.
          fire = !change.first && matchStrength({ trigger: { ...trigger, reverse: false } }, change, frame.signals) >= 3;
        } else if (trigger.type === 'valueChange') {
          // Once per change — but not again while the last run is still going, or a knob turned by
          // MIDI would restart its pulse every frame and never get past the first one. Never during a
          // drag, by the same reasoning as the transitions.
          const run = runs.get(entry.name);
          const busy = run && t < run.startedAt + entry.span;
          fire = !change.first && frame.signals?.dragging !== true && !busy
            && matchStrength({ trigger }, change, frame.signals) > 0;
        } else if (trigger.type === 'valueStep') {
          // Once a step, during a drag too: the step the value is on, rounded, so a knob of four
          // choices (0, 1/3, 2/3, 1) cut into three steps lands on each exactly.
          const v = Number(frame.signals?.valueNormalized);
          const slot = Number.isFinite(v) ? Math.round(v * Math.max(1, trigger.steps || 20)) : null;
          const before = previousStepSlot.get(entry.name);
          previousStepSlot.set(entry.name, slot);
          if (Number.isFinite(v) && !previousEmitValue.has(entry.name)) previousEmitValue.set(entry.name, v);
          if (slot !== null && before !== undefined && before !== null && slot !== before && !requested) {
            flip(entry.name, t, slot > before ? 1 : -1);
            fired.push(entry.name);
            if (entry.emit) throwWord(entry, t, v, slot > before ? 1 : -1);
          }
          if (runs.has(entry.name)) playing.set(entry.name, runs.get(entry.name).phase);
          continue;
        } else if (trigger.type === 'beat') {
          const every = Math.max(1, trigger.every || 1);
          const slot = Number.isFinite(beats) ? Math.floor(beats / every) : null;
          const before = previousBeatSlot.get(entry.name);
          fire = slot !== null && before !== undefined && before !== null && slot !== before;
          previousBeatSlot.set(entry.name, slot);
        }
        if (fire && !requested) { flip(entry.name, t); fired.push(entry.name); }
        // A word thrown on any other trigger (a click, a script): the value as it is now.
        if (entry.emit) {
          const v = Number(frame.signals?.valueNormalized);
          if (Number.isFinite(v) && !previousEmitValue.has(entry.name)) previousEmitValue.set(entry.name, v);
          if ((fire && !requested) || requested) throwWord(entry, t, v, 1);
        }
        // A one-shot stays applied after it ends (fill mode none leaves the element as it was), so a
        // re-render never restarts it; only a flip of its name does.
        if (runs.has(entry.name)) playing.set(entry.name, runs.get(entry.name).phase);
      }
      previousPlays = { ...(plays ?? {}) };

      const parts = new Map();
      const colours = new Map();          // part -> { paint, shape, stroke, text } animation lists
      const texts = new Map();            // part -> [{ name, effect, phase, trigger }]: text effects
      const values = [];                  // [{ name, effect, phase, startedAt, delay, duration, iterations }]
      const rules = [];
      const keyParts = [];
      for (const entry of entries) {
        const phase = playing.get(entry.name);
        if (!phase) continue;
        if (entry.value) {
          // What the value draws (step 6): no CSS; CanvasControl works it out from when the run began.
          const startedAt = runs.get(entry.name)?.startedAt ?? t;
          values.push({ name: entry.name, effect: entry.value, phase, startedAt, delay: entry.delay, duration: entry.duration, iterations: entry.iterations });
          keyParts.push(`v:${entry.name}:${phase}:${startedAt}`);
          continue;
        }
        if (entry.text) {
          // A text effect (utils/textEffects.js): the renderer cuts the text and gives each piece its
          // animation; here, which effect plays on which text, in which phase, and its rules.
          // A direction of `turn` goes the way the value last turned (valueStep).
          const effect = entry.text.direction === 'turn' ? { ...entry.text, direction: turnDirection(entry.text, runs.get(entry.name)?.turn ?? 1) } : entry.text;
          const list = texts.get(entry.part) ?? [];
          // When it started: a part with several effects plays them one at a time (an out, then the
          // in that brings the words back), and the renderer needs to know whose turn it is.
          list.push({ name: entry.name, effect, phase, trigger: entry.trigger, startedAt: runs.get(entry.name)?.startedAt ?? t });
          texts.set(entry.part, list);
          rules.push(textEffectRules(effect, { phase }));
          keyParts.push(`${entry.part}:tx:${entry.name}:${phase}:${effect.direction}`);
          continue;
        }
        if (entry.moves) {
          // Following the turn, a step back plays it mirrored.
          const moving = entry.followTurn && (runs.get(entry.name)?.turn ?? 1) < 0 ? mirroredEntry(entry) : entry;
          const list = parts.get(entry.part) ?? [];
          list.push(animationValue(moving, phase));
          parts.set(entry.part, list);
          rules.push(keyframesRule(moving, phase));
          keyParts.push(`${entry.part}:${animationValue(moving, phase)}`);
        }
        for (const channel of CHANNEL_NAMES) {
          if (!channelFrames(entry, channel).length) continue;
          const lists = colours.get(entry.part) ?? emptyChannels();
          lists[channel].push(colourAnimationValue(entry, channel, phase));
          colours.set(entry.part, lists);
          rules.push(colourKeyframesRule(entry, channel, phase));
          keyParts.push(`${entry.part}:${colourAnimationValue(entry, channel, phase)}`);
        }
      }
      // The words still in the air; the rest have faded.
      emitted = entries.length ? emitted.filter((word) => t < word.at + word.emit.delay + word.emit.duration + 200) : [];
      for (const word of emitted) keyParts.push(`w:${word.id}`);
      const key = keyParts.join('|');
      if (key === last.key) {
        // Nothing to restyle: hand back the same objects, so a beat tick or a re-render of a control
        // whose animations did not change touches nothing downstream.
        last = { ...last, fired };
        return last;
      }
      last = { parts, colours, texts, values, emits: emitted, rules: [...new Set(rules)].join('\n'), fired, key };
      return last;
    },
    reset() {
      previousFrame = null;
      previousBeatSlot = new Map();
      previousStepSlot = new Map();
      previousEmitValue.clear();
      emitted = [];
      previousPlays = {};
      heldBefore.clear();
      runs.clear();
      last = { parts: new Map(), colours: new Map(), texts: new Map(), values: [], emits: [], rules: '', fired: [], key: '' };
    },
  };
}

/**
 * Where a text effect whose direction is `turn` goes when the value turned up (1) or down (-1): a
 * roll, a reel or an odometer rolls up when the value rose and down when it fell, as a counter's
 * digits do; a push or a wipe carries the text left as the value rises, the next word coming in
 * from the right, as a carousel does, and right as it falls.
 */
export function turnDirection(effect, turn) {
  const up = turn >= 0;
  if (['push', 'wipe'].includes(effect?.effect)) return up ? 'left' : 'right';
  return up ? 'up' : 'down';
}

const emptyChannels = () => ({ paint: [], shape: [], stroke: [], text: [], gradient: [], image: [] });

/**
 * The CSS for one part's (or the control's) animations: `animation:…;`, or ''.
 * `extra` is colour channel lists for an element that both moves and paints (see HOW COLOUR DRAWS).
 */
export function animationDeclaration(list, { svg = false, extra = [] } = {}) {
  const all = [...(list ?? []), ...(extra ?? [])];
  if (!all.length) return '';
  // An SVG shape scales and rotates about the user-space origin unless told otherwise; a pulse that
  // swings the pointer off towards the top-left corner is not a pulse.
  const origin = svg && list?.length ? 'transform-box:fill-box;transform-origin:center;' : '';
  return `${origin}animation:${all.join(', ')};`;
}

/**
 * The custom properties that carry one control's or part's colour animations to the layers that
 * paint it, and its gradient's turn and shift. All five, always — `none` where there is nothing — because they inherit: a part that
 * left them unset would paint with its control's pulse. `skip` names channels the element applies
 * itself and must not hand on (a part whose fill is absorbed onto it paints its own box).
 */
export function colourVariables(channels, { skip = [] } = {}) {
  return CHANNEL_NAMES
    .map((channel) => {
      const list = skip.includes(channel) ? [] : (channels?.[channel] ?? []);
      return `--ce-kf-${channel}:${list.length ? list.join(', ') : 'none'};`;
    })
    .join('');
}
