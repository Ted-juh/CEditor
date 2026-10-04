/**
 * keyframeModel.js — the `sequence` animation kind: what a track is, how it is edited, how it
 * fires, and how anime.js plays it.
 *
 * The third kind, beside `transition` and `keyframes`. A `transition` smooths whatever a state
 * changes and has no middle. A `sequence` has one: each target is a track, each track is a list
 * of `{ time, value, easing }` along one time axis, and the whole thing plays when its trigger
 * fires — or, on a value trigger, is scrubbed by the value.
 *
 * NOT THE `keyframes` KIND. That one (utils/keyframeAnimation.js) is CSS playing one list of
 * frames on one part: a pulse, a blink, on the beat or from a script. This was written under the
 * same name on another branch and took the name `sequence` when the two met; the file and its
 * functions still say "keyframe" because a sequence is made of them.
 *
 * WHY ANIME.JS, AND WHY NOT CSS. A CSS transition reaches an element's style and nothing else.
 * The things a panel wants to sequence — a part's rotation, a fill colour, an opacity, and later a
 * value channel or a filmstrip frame — are values in the document the resolver turns into style,
 * so the runtime drives VALUES, not elements: anime.js tweens a plain object, and every frame the
 * object becomes a patch map (`stores/keyframeOverlays.js`) that `resolveInteractiveControl`
 * applies after the state patches. The editor and the exported player run the same code. anime.js
 * is loaded on demand (`keyframePlayer.js`), so a panel without a keyframe animation pays nothing.
 *
 * ONE PATH, THREE READERS. The timeline built here is what the player plays, what the tab's scrub
 * seeks, and what "add a keyframe at the playhead" samples for its default value. There is no
 * second sampler to drift from it; the tests seek this one.
 *
 * COLOUR. The document stores AARRGGBB. anime.js tweens rgba() strings. The two conversions are
 * here and nowhere else; the overlay carries AARRGGBB back into the document shape.
 */
import { EASING_BEZIERS, EASING_NAMES } from './interactionRuntime.js';
import { targetStatus } from './animationModel.js';
import { cubicBezierEase } from './easing.js';

export const KEYFRAME_DEFAULTS = Object.freeze({ duration: 1000, easing: 'outQuad' });

/** The trigger names a sequence accepts; the same two a transition uses. */
export const KEYFRAME_TRIGGERS = ['stateChange', 'valueChange'];

/** The kind this file plays. */
export const SEQUENCE_KIND = 'sequence';

const isSequence = (animation) => String(animation?.kind ?? 'transition') === SEQUENCE_KIND;

/** `[name, animation]` for every enabled sequence on a control. */
export function keyframeAnimations(control) {
  const animations = control?._children?.Animations;
  if (!animations || animations.enabled === false) return [];
  return Object.entries(animations._children ?? {})
    .filter(([, animation]) => animation && animation.enabled !== false && isSequence(animation));
}

// --- Values -------------------------------------------------------------------------------------

/** A target animates a colour when the runtime would put it in the colour bucket. */
export function isColourTarget(target) {
  return targetStatus(target, []).animates === 'colour';
}

const HEX = /^[0-9a-f]+$/i;

/** 'AARRGGBB' or 'RRGGBB' (with or without '#') → 'rgba(r, g, b, a)'. Anything else → transparent. */
export function argbToRgba(argb) {
  const hex = String(argb ?? '').replace(/^#/, '');
  if (!HEX.test(hex) || (hex.length !== 6 && hex.length !== 8)) return 'rgba(0, 0, 0, 0)';
  const a = hex.length === 8 ? parseInt(hex.slice(0, 2), 16) / 255 : 1;
  const rgb = hex.slice(-6);
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(4))})`;
}

const RGBA = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();

/** 'rgba(r, g, b, a)' → 'AARRGGBB'. A string that is already hex passes through, upper-cased. */
export function rgbaToArgb(value) {
  const text = String(value ?? '').trim();
  const m = RGBA.exec(text);
  if (!m) {
    const hex = text.replace(/^#/, '');
    if (HEX.test(hex) && hex.length === 8) return hex.toUpperCase();
    if (HEX.test(hex) && hex.length === 6) return `FF${hex.toUpperCase()}`;
    return 'FF000000';
  }
  const a = m[4] == null ? 1 : Number(m[4]);
  return `${hex2(a * 255)}${hex2(Number(m[1]))}${hex2(Number(m[2]))}${hex2(Number(m[3]))}`;
}

/** The value a keyframe stores for a target: a number, or an AARRGGBB string for a colour. */
export function coerceKeyframeValue(target, value) {
  if (isColourTarget(target)) return rgbaToArgb(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** A ruler label: milliseconds below a second, seconds from there on, each with its unit. */
export function formatAxisLabel(ms) {
  const n = Number(ms) || 0;
  if (Math.abs(n) < 1000) return `${Math.round(n)} ms`;
  return `${Number((n / 1000).toFixed(2))} s`;
}

// --- Tracks -------------------------------------------------------------------------------------

const clampTime = (time) => Math.max(0, Math.round(Number(time) || 0));

/** A track's keyframes, cleaned and sorted by time. Never the stored array itself. */
export function normalizeKeyframes(target) {
  const list = Array.isArray(target?.keyframes) ? target.keyframes : [];
  return list
    .filter((k) => k && typeof k === 'object')
    .map((k) => ({
      time: clampTime(k.time),
      value: coerceKeyframeValue(target, k.value),
      easing: EASING_NAMES.includes(String(k.easing)) ? String(k.easing) : KEYFRAME_DEFAULTS.easing,
    }))
    .sort((a, b) => a.time - b.time);
}

/** The length of the time axis: the stored duration, or further if a keyframe lies beyond it. */
export function keyframesDuration(animation) {
  const stored = Number(animation?.duration);
  let last = 0;
  for (const target of animation?.targets ?? []) {
    const frames = normalizeKeyframes(target);
    if (frames.length) last = Math.max(last, frames[frames.length - 1].time);
  }
  return Math.max(Number.isFinite(stored) && stored > 0 ? Math.round(stored) : KEYFRAME_DEFAULTS.duration, last);
}

/** A new keyframe on a track. One at the same time replaces the old; the result is sorted. */
export function addKeyframe(target, keyframe) {
  const frames = normalizeKeyframes(target).filter((k) => k.time !== clampTime(keyframe?.time));
  frames.push({
    time: clampTime(keyframe?.time),
    value: coerceKeyframeValue(target, keyframe?.value),
    easing: EASING_NAMES.includes(String(keyframe?.easing)) ? String(keyframe.easing) : KEYFRAME_DEFAULTS.easing,
  });
  frames.sort((a, b) => a.time - b.time);
  return { ...target, keyframes: frames };
}

export function removeKeyframe(target, index) {
  const frames = normalizeKeyframes(target);
  if (index < 0 || index >= frames.length) return { ...target, keyframes: frames };
  frames.splice(index, 1);
  return { ...target, keyframes: frames };
}

/**
 * Change one keyframe. Moving it in time re-sorts the track, so the index it ends up at comes
 * back with the target; a caller that keeps a selection follows it.
 */
export function updateKeyframe(target, index, patch) {
  const frames = normalizeKeyframes(target);
  if (index < 0 || index >= frames.length) return { target: { ...target, keyframes: frames }, index: -1 };
  const current = frames[index];
  const next = {
    time: patch?.time != null ? clampTime(patch.time) : current.time,
    value: patch?.value != null ? coerceKeyframeValue(target, patch.value) : current.value,
    easing: patch?.easing != null && EASING_NAMES.includes(String(patch.easing)) ? String(patch.easing) : current.easing,
  };
  const rest = frames.filter((k, i) => i !== index && k.time !== next.time);
  rest.push(next);
  rest.sort((a, b) => a.time - b.time);
  return { target: { ...target, keyframes: rest }, index: rest.indexOf(next) };
}

// --- Triggers -----------------------------------------------------------------------------------

const names = (list) => (Array.isArray(list) ? list.map((v) => String(v ?? '').trim()).filter(Boolean) : []);
const any = (list) => list.length === 0 || list.includes('*');

/**
 * Does a state change fire this animation? `to` names the states that must have been entered
 * (`*`: any change at all); `from` the states that must have been active before (`*`: any).
 */
export function triggerFires(animation, prevStates = [], nextStates = []) {
  if (String(animation?.trigger?.type ?? 'stateChange') !== 'stateChange') return false;
  const to = names(animation?.trigger?.to);
  const from = names(animation?.trigger?.from);
  const entered = nextStates.filter((s) => !prevStates.includes(s));
  const left = prevStates.filter((s) => !nextStates.includes(s));
  const toOk = any(to) ? entered.length > 0 || left.length > 0 : entered.some((s) => to.includes(s));
  const fromOk = any(from) || prevStates.some((s) => from.includes(s));
  return toOk && fromOk;
}

/** Is the state that fired this animation still active, so its last frame should hold? */
export function triggerHeld(animation, states = []) {
  const to = names(animation?.trigger?.to);
  if (any(to)) return false;
  return states.some((s) => to.includes(s));
}

// --- The timeline -------------------------------------------------------------------------------

/** An easing by name as the function anime.js takes: the same bezier the CSS transition gets. */
export function easingFunction(name) {
  const bezier = EASING_BEZIERS[String(name ?? '')];
  if (!bezier) return (t) => t;
  // Exact at the ends: the bisection is good to a millionth, and a keyframe must land, not nearly.
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : cubicBezierEase(t, bezier[0], bezier[1], bezier[2], bezier[3]));
}

/**
 * Build the anime.js timeline for one animation. `anime` is the loaded module (passed in, so the
 * player can load it on demand and a test can import it). Returns the timeline, the object it
 * tweens, and `overlay()`, which reads that object back as a patch map in document shape.
 *
 * Each track: the first keyframe's value is where the object starts (held until that time), and
 * every later keyframe is a segment arriving with its own easing. A track with one keyframe is a
 * constant. The axis always runs the animation's full duration, so a scrub past the last keyframe
 * still answers.
 */
export function buildKeyframeTimeline(anime, animation, { onUpdate = null, onComplete = null, loop = false } = {}) {
  const duration = keyframesDuration(animation);
  const values = { _t: 0 };
  const tracks = [];
  const timeline = anime.createTimeline({
    autoplay: false,
    loop: loop === true,
    defaults: { ease: 'linear' },
    onUpdate: onUpdate ? () => onUpdate(values) : undefined,
    onComplete: onComplete ? () => onComplete(values) : undefined,
  });
  // The axis: a plain clock, so the timeline is as long as the animation says even when every
  // keyframe sits early. `_t` is also the current time, for anyone reading the object.
  timeline.add(values, { _t: duration, duration, ease: 'linear' }, 0);

  const follows = String(animation?.trigger?.type ?? 'stateChange') === 'valueChange';
  (animation?.targets ?? []).forEach((target, index) => {
    const path = String(target?.path ?? '').trim();
    const frames = normalizeKeyframes(target);
    if (!path || !frames.length) return;
    // A sequence that follows the value cannot drive it too: the track would chase itself.
    if (follows && path === 'ValueChannels.mainValue') return;
    const colour = isColourTarget(target);
    const key = `k${index}`;
    const first = frames[0];
    values[key] = colour ? argbToRgba(first.value) : first.value;
    tracks.push({ key, path, colour });
    if (frames.length < 2) return;
    const segments = [];
    for (let i = 1; i < frames.length; i += 1) {
      const from = frames[i - 1];
      const to = frames[i];
      segments.push({
        to: colour ? argbToRgba(to.value) : to.value,
        duration: Math.max(1, to.time - from.time),
        ease: easingFunction(to.easing),
      });
    }
    timeline.add(values, { [key]: segments }, first.time);
  });

  const overlay = () => {
    const out = {};
    for (const track of tracks) {
      const raw = values[track.key];
      out[track.path] = track.colour ? rgbaToArgb(raw) : Number(raw);
    }
    return out;
  };

  return { timeline, values, overlay, duration, tracks };
}

/** The pose at one time, as a patch map. What "add a keyframe at the playhead" starts from. */
export function sampleKeyframes(anime, animation, time) {
  const built = buildKeyframeTimeline(anime, animation);
  built.timeline.seek(Math.max(0, Math.min(built.duration, Number(time) || 0)));
  return built.overlay();
}
