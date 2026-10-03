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
 *     frames: [{ at: 0..1, scale, rotate, x, y, opacity }] }
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
 * Colour and text frames are not here yet: the layers that paint a control's colour sit inside it
 * with inline styles of their own, which a keyframe on the control cannot reach. Said rather than
 * half done.
 */
import { readTrigger } from './interactionRuntime.js';
import { easingToCss } from './easing.js';
import { describeChange, matchStrength } from './transitionSelection.js';

export const KEYFRAME_TRIGGER_TYPES = ['always', 'stateChange', 'valueChange', 'beat', 'script'];

/** What a frame can set, and the value each has when a frame leaves it out. */
export const FRAME_PROPERTIES = ['scale', 'rotate', 'x', 'y', 'opacity'];
export const FRAME_DEFAULTS = Object.freeze({ scale: 1, rotate: 0, x: 0, y: 0, opacity: 1 });

/** The limits a frame value is kept to — past them a typo, not a design. */
const FRAME_LIMITS = { scale: [0, 10], rotate: [-3600, 3600], x: [-2000, 2000], y: [-2000, 2000], opacity: [0, 1] };

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
    part: keyframePart(animation),
    duration,
    delay,
    easing: easingToCss(animation),
    iterations,
    direction: animation.direction === 'alternate' ? 'alternate' : 'normal',
    trigger,
    frames,
    // How long one firing runs. Infinity for a loop, which never finishes on its own.
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

/** The @keyframes rule for one phase of one entry. Numbers and a hash only — nothing to escape. */
export function keyframesRule(entry, phase = 'a') {
  const body = entry.frames
    .map((frame) => `${number(frame.at * 100)}%{${frameDeclarations(frame)}}`)
    .join('');
  return `@keyframes ce-kf-${framesHash(entry.frames)}-${phase}{${body}}`;
}

/**
 * The `animation` value for an entry in a phase.
 * Fill mode none: when a run ends, the element is its own style again — a pulse that ends at scale
 * 1.08 by mistake does not stick there.
 */
export function animationValue(entry, phase = 'a') {
  const count = entry.iterations === 'infinite' ? 'infinite' : String(entry.iterations);
  return `ce-kf-${framesHash(entry.frames)}-${phase} ${Math.round(entry.duration)}ms ${entry.easing} ${Math.round(entry.delay)}ms ${count} ${entry.direction} none`;
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
  let previousPlays = {};
  const heldBefore = new Map();         // name -> whether a looping state animation's state held
  const runs = new Map();               // name -> { phase, startedAt } for anything that has played
  let last = { parts: new Map(), rules: '', fired: [], key: '' };

  const flip = (name, t) => {
    const run = runs.get(name);
    runs.set(name, { phase: run?.phase === 'a' ? 'b' : 'a', startedAt: t });
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
        } else if (trigger.type === 'beat') {
          const every = Math.max(1, trigger.every || 1);
          const slot = Number.isFinite(beats) ? Math.floor(beats / every) : null;
          const before = previousBeatSlot.get(entry.name);
          fire = slot !== null && before !== undefined && before !== null && slot !== before;
          previousBeatSlot.set(entry.name, slot);
        }
        if (fire && !requested) { flip(entry.name, t); fired.push(entry.name); }
        // A one-shot stays applied after it ends (fill mode none leaves the element as it was), so a
        // re-render never restarts it; only a flip of its name does.
        if (runs.has(entry.name)) playing.set(entry.name, runs.get(entry.name).phase);
      }
      previousPlays = { ...(plays ?? {}) };

      const parts = new Map();
      const rules = [];
      const keyParts = [];
      for (const entry of entries) {
        const phase = playing.get(entry.name);
        if (!phase) continue;
        const list = parts.get(entry.part) ?? [];
        list.push(animationValue(entry, phase));
        parts.set(entry.part, list);
        rules.push(keyframesRule(entry, phase));
        keyParts.push(`${entry.part}:${animationValue(entry, phase)}`);
      }
      const key = keyParts.join('|');
      if (key === last.key) {
        // Nothing to restyle: hand back the same objects, so a beat tick or a re-render of a control
        // whose animations did not change touches nothing downstream.
        last = { ...last, fired };
        return last;
      }
      last = { parts, rules: [...new Set(rules)].join('\n'), fired, key };
      return last;
    },
    reset() {
      previousFrame = null;
      previousBeatSlot = new Map();
      previousPlays = {};
      heldBefore.clear();
      runs.clear();
      last = { parts: new Map(), rules: '', fired: [], key: '' };
    },
  };
}

/** The CSS for one part's (or the control's) animations: `animation:…;`, or ''. */
export function animationDeclaration(list, { svg = false } = {}) {
  if (!list?.length) return '';
  // An SVG shape scales and rotates about the user-space origin unless told otherwise; a pulse that
  // swings the pointer off towards the top-left corner is not a pulse.
  const origin = svg ? 'transform-box:fill-box;transform-origin:center;' : '';
  return `${origin}animation:${list.join(', ')};`;
}
