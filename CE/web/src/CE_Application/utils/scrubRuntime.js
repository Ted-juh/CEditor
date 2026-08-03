// Bridges runtime behavior configs to dragScrub instances. The core owns all
// pointer→value maths; this module only translates a control's behavior block
// (orientation, direction, reverseMouseDirection, step, bounds) into
// DragScrubOptions so both preview surfaces build identical scrubs.
import { DragScrub, presets } from '../scrub/dragScrub';
import {
  getRangeMin,
  getRangeMax,
  getRangeStep,
  getRangeOrientation,
  getRangeDirection,
  isMouseDirectionReversed,
} from './rangeBehavior.js';
import {
  getSliderGeometry,
  getSliderOrientation,
  getSliderDirection,
} from './sliderBehavior.js';

import { readStoredJson } from './localStorageState.js';

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

function linearTrackScrub(vertical, inverted) {
  return new DragScrub({
    ...(vertical ? presets.linearVertical : presets.linearHorizontal),
    invertX: !vertical && inverted,
    invertY: vertical && inverted,
    min: 0,
    max: 1,
  }, 0);
}

// Linear slider: absolute track mapping over the hitbox, normalised 0..1.
export function createSliderTrackScrub(behavior) {
  const vertical = getSliderOrientation(behavior) === 'vertical';
  const direction = getSliderDirection(behavior);
  return linearTrackScrub(vertical, vertical ? direction === 'ttb' : direction === 'rtl');
}

// Range-family slider role: same mapping, orientation read from the range block.
export function createRangeTrackScrub(behavior) {
  const vertical = getRangeOrientation(behavior) === 'vertical';
  const direction = getRangeDirection(behavior);
  return linearTrackScrub(vertical, vertical ? direction === 'ttb' : direction === 'rtl');
}

export function createRangeScrub(behavior, startValue = 0) {
  const vertical = getRangeOrientation(behavior) === 'vertical';
  const direction = getRangeDirection(behavior);
  const reversed = isMouseDirectionReversed(behavior);
  const step = getRangeStep(behavior);
  return new DragScrub({
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
  }, startValue);
}
