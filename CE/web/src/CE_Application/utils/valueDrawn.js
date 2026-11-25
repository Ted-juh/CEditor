/**
 * valueDrawn.js — the value-drawn engine (step 6; docs/design/animation-designer.md, "The model"):
 * an effect that moves what a knob's or a slider's value draws — its pointer, its arc, its fill — for
 * a moment, then hands back to the value. A ring sweep: the arc runs round to full and settles on
 * where the knob really is.
 *
 * It moves the DRAWING, never the value. Nothing is sent, no binding fires, the readout under the
 * knob still says what the value is. A clip ends on the live value, whatever the value did meanwhile,
 * so the hand-back is never a jump; and while the control is being dragged, the hand wins and the
 * value is drawn as it is.
 *
 * Drawn values are SVG attributes (an arc's `d`, a pointer's angle), which CSS cannot animate, so
 * this is worked out in script, a frame at a time while a clip runs (CanvasControl), the way the
 * slider renderer's value glide already is. Pure: the control hands it the plays, the live value and
 * the time.
 */
import { readEasing, easeAt } from './easing.js';
import { VALUE_TARGET } from './sceneFormat.js';
import { isSliderBehavior, getSliderGeometry, getSliderValueMode } from './sliderBehavior.js';
import { macroConfig, macroValue } from './macroLayout.js';
import { meterConfig, meterPosition } from './meterLayout.js';

/** The controls that draw a value of their own rather than through a Behavior: the Macro, the meters. */
const METER_TYPES = new Set(['Meter', 'ProgressBar']);
const typeOf = (control) => String(control?._children?.Core?.controlType ?? '');

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/** Where one frame puts the drawing, given the live value. */
export function valueFrameAt(frame, live) {
  if (Number.isFinite(frame?.value)) return clamp01(frame.value);
  if (Number.isFinite(frame?.by)) return clamp01(live + frame.by);
  return clamp01(live);
}

/**
 * Where a value effect draws at `progress` (0 to 1 of its clip): between the frames either side of
 * it, eased within that stretch as a keyframe animation's easing is (per stretch, not overall).
 */
export function valueEffectAt(effect, progress, live) {
  const frames = Array.isArray(effect?.frames) ? effect.frames : [];
  if (!frames.length) return clamp01(live);
  const p = clamp01(progress);
  if (p <= frames[0].at) return valueFrameAt(frames[0], live);
  const last = frames[frames.length - 1];
  if (p >= last.at) return valueFrameAt(last, live);
  let index = 0;
  while (index < frames.length - 2 && frames[index + 1].at <= p) index += 1;
  const a = frames[index];
  const b = frames[index + 1];
  const span = b.at - a.at;
  const local = span > 0 ? (p - a.at) / span : 1;
  const eased = easeAt(readEasing(effect), local);
  const from = valueFrameAt(a, live);
  return clamp01(from + (valueFrameAt(b, live) - from) * eased);
}

/** A scene's value clips on one control, earliest first. */
export function valueClipsOf(scene, controlId) {
  return (scene?.clips ?? [])
    .filter((clip) => clip.controlId === controlId && clip.target === VALUE_TARGET && clip.effect?.kind === 'value')
    .sort((a, b) => a.start - b.start);
}

/** How many times a clip plays: a scene clip once; a control's own animation as often as it says. */
const timesOf = (clip) => (clip?.iterations === 'infinite' ? Infinity : Math.max(1, Math.round(Number(clip?.iterations) || 1)));
/** When a clip's last run ends, ms: Infinity for one that loops. */
const clipEnd = (clip) => clip.start + clip.length * timesOf(clip);

/**
 * What a scene draws for a control's value `elapsed` ms in, or null to draw the value itself. The
 * clip playing then, in whichever of its runs; before the first starts, its first frame (a clip
 * holds its first frame before it starts, as every clip does); after the last ends, nothing: the
 * value is handed back.
 */
export function sceneDrawnValue(scene, controlId, elapsed, live) {
  const clips = valueClipsOf(scene, controlId);
  if (!clips.length || !Number.isFinite(elapsed)) return null;
  let playing = null;
  for (const clip of clips) if (elapsed >= clip.start && elapsed < clipEnd(clip)) playing = clip;
  if (playing) return valueEffectAt(playing.effect, ((elapsed - playing.start) % playing.length) / playing.length, live);
  if (elapsed < clips[0].start) return valueEffectAt(clips[0].effect, 0, live);
  return null;
}

/** When a scene's last value clip on a control ends, ms; 0 when it has none, Infinity for a loop. */
export function valueClipsEnd(scene, controlId) {
  return valueClipsOf(scene, controlId).reduce((end, clip) => Math.max(end, clipEnd(clip)), 0);
}

/**
 * A control's own value animation, as the keyframe player reports one playing
 * (`{ name, effect, phase, startedAt, delay, duration, iterations }`), as a play of a scene of one
 * clip, which is how drawnValueFor reads it. `startedAt` stays on the play: its clock.
 */
export function ownValuePlay(controlId, run) {
  return {
    scene: { id: `own:${run.name}`, clips: [{ id: `own:${run.name}`, controlId, target: VALUE_TARGET, start: run.delay ?? 0, length: Math.max(10, run.duration ?? 1200), iterations: run.iterations ?? 1, effect: run.effect }] },
    phase: run.phase ?? 'a',
    at: null,
    startedAt: run.startedAt,
  };
}

/**
 * The drawn value for a control from every scene on it: `{ value, running }`. `value` is null when
 * the value is drawn as it is. Plays are `{ scene, at, … }`: posed at `at` (ms), or running, in which
 * case `elapsedOf(play)` says how far in. The last play that draws something wins, as the last
 * animation on a property does. `running` is whether one still has a value clip ahead of it, which
 * is how long the control keeps asking for frames.
 */
export function drawnValueFor(plays, controlId, live, { elapsedOf = () => 0, dragging = false } = {}) {
  let value = null;
  let running = false;
  for (const play of plays ?? []) {
    const posed = Number.isFinite(play?.at);
    const elapsed = posed ? play.at : elapsedOf(play);
    const drawn = sceneDrawnValue(play?.scene, controlId, elapsed, live);
    if (drawn !== null) value = drawn;
    if (!posed && elapsed < valueClipsEnd(play?.scene, controlId)) running = true;
  }
  // The hand wins: a knob being turned shows where it is turned to.
  if (dragging) value = null;
  return { value, running };
}

/**
 * Whether a control draws a value a value effect can move: a knob or a slider with one value, the
 * Macro (its ring, its knob and the lanes it drives), a meter or a progress bar (its needle or bar).
 */
export function controlDrawsValue(control) {
  const type = typeOf(control);
  if (type === 'Macro' || METER_TYPES.has(type)) return true;
  const behavior = control?._children?.Behavior ?? null;
  return isSliderBehavior(behavior) && getSliderValueMode(behavior) === 'single';
}

/**
 * The value a control draws now, 0 to 1, which an effect starts from and hands back to: the Macro's
 * own position, a meter's place on its scale (linear or decibels), a knob's or a slider's signals.
 */
export function liveDrawnValue(control, signals = {}) {
  const type = typeOf(control);
  if (type === 'Macro') {
    const cfg = macroConfig(control);
    return cfg.__value !== undefined ? clamp01(cfg.__value) : macroValue(control);
  }
  if (METER_TYPES.has(type)) {
    const cfg = meterConfig(control);
    return clamp01(meterPosition(cfg.__value !== undefined ? cfg.__value : cfg.value, cfg));
  }
  const current = Number(signals?.currentValueNormalized);
  if (signals?.currentValueNormalized !== undefined && signals?.currentValueNormalized !== null && Number.isFinite(current)) return clamp01(current);
  return clamp01(signals?.valueNormalized);
}

/** Whether it is a knob — drawn round a circle — which is what the value effects were made for. */
export function controlIsKnob(control) {
  return controlDrawsValue(control) && getSliderGeometry(control?._children?.Behavior) === 'circular';
}
