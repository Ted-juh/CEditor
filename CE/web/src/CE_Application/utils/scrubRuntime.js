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

// The historical spinner feel: one step per 18 px of travel.
const SCRUB_PIXELS_PER_STEP = 18;

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
    deadZone: 0,
    step,
    min: getRangeMin(behavior),
    max: getRangeMax(behavior),
  }, startValue);
}
