// Bridges runtime behavior configs to dragScrub instances. The core owns all
// pointer→value maths; this module only translates a control's behavior block
// (orientation, direction, reverseMouseDirection, step, bounds) into
// DragScrubOptions so both preview surfaces build identical scrubs.
import { DragScrub, defaultOptions, presets } from '../scrub/dragScrub';
import {
  getRangeMin,
  getRangeMax,
  getRangeStep,
  getRangeOrientation,
  getRangeDirection,
  isMouseDirectionReversed,
  numberOr,
} from './rangeBehavior.js';
import {
  getSliderGeometry,
  getSliderOrientation,
  getSliderDirection,
} from './sliderBehavior.js';

import { mouseScrubOverrides } from './mouseBehavior.js';

import { readStoredJson } from './localStorageState.js';

// The Mouse section is layered last, over the geometry-derived options and the
// app-level defaults alike: it is the one place an author overrode the feel
// deliberately, so nothing downstream should be able to win against it. An
// absent or untouched section contributes {} and leaves the options identical
// to what they were before the Mouse tab existed.
function withMouse(options, mouse) {
  const overrides = mouseScrubOverrides(mouse, options);
  // A TRACK SCRUB CARRIES NO SENSITIVITY OF ITS OWN, and it is right not to: an absolute mapping
  // has nothing to scale, because the value IS the pointer's position along the track. The Mouse
  // section can switch that mapping to relative, though, and from that moment `pixels ×
  // sensitivity` is the whole of the maths — with the core's own default silently supplying the
  // number. `mouseScrubOverrides` then finds no resolved sensitivity to multiply and drops the
  // author's `dragSensitivity` on the floor: the field sits in the same tab as the mode that made
  // it meaningful and does nothing. So name the default here, before the section is layered on,
  // and let the override scale it like any other.
  if (overrides.tracking === 'relative' && !Number.isFinite(Number(options?.sensitivity))) {
    const base = { ...options, sensitivity: defaultOptions.sensitivity };
    return { ...base, ...mouseScrubOverrides(mouse, base) };
  }
  return { ...options, ...overrides };
}

// The historical spinner feel: one step per 18 px of travel.
const SCRUB_PIXELS_PER_STEP = 18;

// App-level scrub defaults (deadZone, fineFactor, coarseFactor): deliberately
// no per-widget UI. Stored under one key; only finite stored values override
// the per-widget-type defaults, so an empty store changes nothing.
const SCRUB_DEFAULTS_KEY = 'ce.ui.scrubDefaults';

export function appScrubOverrides() {
  const stored = readStoredJson(SCRUB_DEFAULTS_KEY, null);
  if (!stored || typeof stored !== 'object') return {};
  const overrides = {};
  if (Number.isFinite(Number(stored.deadZone))) overrides.deadZone = Math.max(0, Number(stored.deadZone));
  if (Number.isFinite(Number(stored.fineFactor))) overrides.fineFactor = Math.max(0.01, Number(stored.fineFactor));
  if (Number.isFinite(Number(stored.coarseFactor))) overrides.coarseFactor = Math.max(1, Number(stored.coarseFactor));
  return overrides;
}

export function scrubSample(event) {
  return {
    x: event?.clientX ?? 0,
    y: event?.clientY ?? 0,
    shiftKey: event?.shiftKey === true,
    ctrlKey: event?.ctrlKey === true,
    metaKey: event?.metaKey === true,
    altKey: event?.altKey === true,
  };
}

// Number / spinbox drag: relative accumulation from the pointer-down anchor.
// The surface's own 5 px drag threshold gates engagement, so deadZone is 0
// and begin() is fed the original pointer-down point.
// Circular tracks keep their absolute angle mapping (dragScrub's absolute
// tracking is axis-aligned only, and its rotary axis is relative).
export function isLinearSliderGeometry(behavior) {
  return getSliderGeometry(behavior) !== 'circular';
}

// Circular sliders can opt out of jump-to-angle into a relative drag:
// 'knob' is the plugin-standard vertical drag, 'rotary' follows actual
// rotation about the dial (unbounded turns, one full turn = the whole
// range at sensitivity 1). 'absolute' keeps the classic angle mapping.
export function getCircularSliderDragMode(behavior) {
  const mode = String(behavior?.circularDragMode ?? 'absolute').trim().toLowerCase();
  return mode === 'knob' || mode === 'rotary' ? mode : 'absolute';
}

export function createCircularSliderScrub(behavior, startNormalized = 0, mouse = null) {
  const sensitivityScale = Math.max(0.01, numberOr(behavior?.circularDragSensitivity, 1));
  const reversed = isMouseDirectionReversed(behavior);
  const base = getCircularSliderDragMode(behavior) === 'rotary'
    ? {
        ...presets.rotary,
        // The core's rotary axis is counter-clockwise-positive (mathematical
        // angles); a cw dial needs the mirror so clockwise motion increases.
        invertX: (getSliderDirection(behavior) !== 'ccw') !== reversed,
        sensitivity: (1 / 400) * sensitivityScale,
      }
    : {
        ...presets.knob,
        invertY: reversed,
        sensitivity: (1 / 250) * sensitivityScale,
      };
  return new DragScrub(withMouse({
    ...base,
    deadZone: 0,
    min: 0,
    max: 1,
    ...appScrubOverrides(),
  }, mouse), Math.max(0, Math.min(1, numberOr(startNormalized, 0))));
}

// `startNormalized` is where the control stands at pointer-down, 0..1. An absolute track ignores
// it entirely — the first move overwrites the value with the pointer's position — which is why it
// was hard-coded to 0 for as long as absolute was the only mapping. Once the Mouse section switches
// the track to relative tracking the seed IS the value: the surface writes `scrub.value` on
// pointer-down, so a scrub seeded at 0 snapped the control to its minimum before the pointer had
// moved at all, and every press threw the setting away.
function linearTrackScrub(vertical, inverted, mouse, startNormalized = 0) {
  return new DragScrub(withMouse({
    ...(vertical ? presets.linearVertical : presets.linearHorizontal),
    invertX: !vertical && inverted,
    invertY: vertical && inverted,
    min: 0,
    max: 1,
  }, mouse), Math.max(0, Math.min(1, numberOr(startNormalized, 0))));
}

// Linear slider: absolute track mapping over the hitbox, normalised 0..1.
export function createSliderTrackScrub(behavior, mouse = null, startNormalized = 0) {
  const vertical = getSliderOrientation(behavior) === 'vertical';
  const direction = getSliderDirection(behavior);
  const inverted = vertical ? direction === 'ttb' : direction === 'rtl';
  return linearTrackScrub(vertical, inverted !== isMouseDirectionReversed(behavior), mouse, startNormalized);
}

// Range-family slider role: same mapping, orientation read from the range block.
export function createRangeTrackScrub(behavior, mouse = null, startNormalized = 0) {
  const vertical = getRangeOrientation(behavior) === 'vertical';
  const direction = getRangeDirection(behavior);
  return linearTrackScrub(vertical, vertical ? direction === 'ttb' : direction === 'rtl', mouse, startNormalized);
}

export function createRangeScrub(behavior, startValue = 0, mouse = null) {
  const vertical = getRangeOrientation(behavior) === 'vertical';
  const direction = getRangeDirection(behavior);
  const reversed = isMouseDirectionReversed(behavior);
  const step = getRangeStep(behavior);
  return new DragScrub(withMouse({
    ...presets.numberField,
    axis: vertical ? 'y' : 'x',
    invertX: !vertical && ((direction === 'rtl') !== reversed),
    invertY: vertical && ((direction === 'ttb') !== reversed),
    sensitivity: step / SCRUB_PIXELS_PER_STEP,
    step,
    min: getRangeMin(behavior),
    max: getRangeMax(behavior),
    ...appScrubOverrides(),
    // The surface's own 5 px drag threshold gates engagement, never the core.
    deadZone: 0,
  }, mouse), startValue);
}
