import {
  clamp,
  getSliderAllowWrapAround,
  getSliderDirection,
  getSliderGeometry,
  getSliderOrientation,
  getSliderStartAngle,
  getSliderSweepAngle,
  getSliderValueMode,
  normalizeSliderValue,
  numberOr,
} from './sliderBehavior.js';

export function degToRad(value) {
  return (numberOr(value, 0) * Math.PI) / 180;
}

export function normalizeDegrees(value) {
  const normalized = numberOr(value, 0) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function clockwiseDelta(fromDegrees, toDegrees) {
  return normalizeDegrees(toDegrees - fromDegrees);
}

export function counterClockwiseDelta(fromDegrees, toDegrees) {
  return normalizeDegrees(fromDegrees - toDegrees);
}

export function resolveSliderNormalizedFromPoint(behavior = null, rect = null, clientX = 0, clientY = 0) {
  if (!rect) return 0;
  const reverse = (value) => behavior?.reverseMouseDirection === true ? 1 - value : value;

  if (getSliderGeometry(behavior) === 'circular') {
    // About the centre the knob is drawn round (resolveCircularTrackMetrics).
    const center = resolveCircularCenter(rect.width, rect.height);
    const centerX = rect.left + center.x;
    const centerY = rect.top + center.y;
    const angle = normalizeDegrees((Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI);
    const startAngle = getSliderStartAngle(behavior);
    const sweepAngle = getSliderSweepAngle(behavior);
    const direction = getSliderDirection(behavior);
    const delta = direction === 'ccw'
      ? counterClockwiseDelta(startAngle, angle)
      : clockwiseDelta(startAngle, angle);
    const sweep = Math.max(1, sweepAngle);
    // Outside the sweep — the gap between the end and the start — the nearer end wins, as it does
    // for a custom component's dial (customComponentInteraction.js). Measured from the start in
    // the turning direction, a pointer just short of the start reads as nearly a full turn, so a
    // plain clamp sent a knob dragged a little past its start straight to its end.
    const normalized = delta <= sweep ? delta / sweep : ((delta - sweep) <= (360 - delta) ? 1 : 0);
    return reverse(clamp(normalized, 0, 1));
  }

  const localX = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const localY = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  const orientation = getSliderOrientation(behavior);
  const direction = getSliderDirection(behavior);

  if (orientation === 'vertical') {
    return reverse(direction === 'ttb' ? localY : 1 - localY);
  }

  return reverse(direction === 'rtl' ? 1 - localX : localX);
}

export function sliderValueToAngle(behavior = null, value = 0) {
  const startAngle = getSliderStartAngle(behavior);
  const sweepAngle = getSliderSweepAngle(behavior);
  const direction = getSliderDirection(behavior);
  const min = numberOr(behavior?.min, 0);
  const max = Math.max(min, numberOr(behavior?.max, min + 1));
  const normalized = normalizeSliderValue(numberOr(value, min), min, max);
  return normalizeDegrees(
    direction === 'ccw'
      ? startAngle - (normalized * sweepAngle)
      : startAngle + (normalized * sweepAngle)
  );
}

export function sliderNormalizedToAngle(behavior = null, normalized = 0) {
  const startAngle = getSliderStartAngle(behavior);
  const sweepAngle = getSliderSweepAngle(behavior);
  const direction = getSliderDirection(behavior);
  const safeNormalized = clamp(numberOr(normalized, 0), 0, 1);
  return normalizeDegrees(
    direction === 'ccw'
      ? startAngle - (safeNormalized * sweepAngle)
      : startAngle + (safeNormalized * sweepAngle)
  );
}

export function resolveCircularCenter(width = 0, height = 0) {
  return { x: width / 2, y: height / 2 };
}

export function resolveCircularPoint(width, height, angleDegrees, radius, center = null) {
  const fallbackCenter = resolveCircularCenter(width, height);
  const centerX = numberOr(center?.x, fallbackCenter.x);
  const centerY = numberOr(center?.y, fallbackCenter.y);
  const radians = degToRad(angleDegrees);
  return {
    x: centerX + (Math.cos(radians) * radius),
    y: centerY + (Math.sin(radians) * radius),
  };
}

export function resolveCircularArcSweep(behavior = null, startAngle, endAngle) {
  const direction = getSliderDirection(behavior);
  const sweep = direction === 'ccw'
    ? counterClockwiseDelta(startAngle, endAngle)
    : clockwiseDelta(startAngle, endAngle);
  if (getSliderAllowWrapAround(behavior)) return sweep;
  return Math.min(sweep, getSliderSweepAngle(behavior));
}

/**
 * The room a knob keeps round its track for text of its own: only for the labels that ride its
 * handles (Behavior.showHandleLabels), at their size (`size`, the largest of the label parts'). Its
 * name, its value and the ends of its range are Labels of their own beside it (utils/labelShows.js,
 * utils/attachedLabels.js), so it keeps none for those. Pass it to resolveCircularTrackMetrics and
 * buildSliderHandleLabelAnchors as `handleLabelSize`; a linear track keeps no room for them.
 */
export function sliderHandleLabelRoom(behavior = null, size = 11) {
  return behavior?.showHandleLabels === true ? Math.max(0, numberOr(size, 11)) : 0;
}

/**
 * A linear track's ends: 14 px in from the sides across, 10 from the top and 14 from the bottom up,
 * and half the pointer so it stays inside at either end.
 */
export function resolveLinearTrackFrame(behavior = null, width = 0, height = 0, trackThickness = 8, pointerSize = 16) {
  if (getSliderOrientation(behavior) === 'vertical') {
    return {
      x1: width / 2,
      y1: height - 14 - (pointerSize / 2),
      x2: width / 2,
      y2: 10 + (pointerSize / 2),
      trackThickness,
    };
  }

  return {
    x1: 14 + (pointerSize / 2),
    y1: height / 2,
    x2: width - 14 - (pointerSize / 2),
    y2: height / 2,
    trackThickness,
  };
}

export function resolveLinearPointerPoint(behavior = null, width = 0, height = 0, normalized = 0, trackThickness = 8, pointerSize = 16) {
  const frame = resolveLinearTrackFrame(behavior, width, height, trackThickness, pointerSize);
  const orientation = getSliderOrientation(behavior);
  const direction = getSliderDirection(behavior);
  const safeNormalized = clamp(numberOr(normalized, 0), 0, 1);
  if (orientation === 'vertical') {
    const travel = direction === 'ttb' ? 1 - safeNormalized : safeNormalized;
    return {
      x: frame.x1,
      y: frame.y1 + ((frame.y2 - frame.y1) * travel),
    };
  }
  const travel = direction === 'rtl' ? 1 - safeNormalized : safeNormalized;
  return {
    x: frame.x1 + ((frame.x2 - frame.x1) * travel),
    y: frame.y1,
  };
}

export function resolveCircularTrackMetrics(width = 0, height = 0, {
  trackThickness = 10,
  pointerSize = 18,
  majorTickLength = 12,
  hasTicks = true,
  circularDiameter = 0,
  // The labels riding the handles (sliderHandleLabelRoom): the room they hang in round the track.
  handleLabelSize = 0,
  // `tight`: reserve room only for what the knob draws (the pointer it uses, its ticks), not for
  // every handle it might, and keep what it draws past its track inside its box: its housing and
  // skirt, and the numbers round its scale. Opt-in (Behavior.circularFit), so every knob that exists
  // keeps its size; the knob forms rebuilt as parts ask for it, since their drawings filled the box
  // (models/knobFormParts.js). Labels riding the handles hang outside the box in it.
  tight = false,
  // How far the housing reaches from the centre, as a multiple of the track's radius (0 without one).
  outerReach = 0,
  // A knob's scale numbers (Parts.tickNumber): their distance from the centre as a multiple of the
  // track's radius, and their size in px, which hangs half outside that distance.
  numberReach = 0,
  numberSize = 0,
} = {}) {
  const labelAllowance = tight ? 0 : Math.max(0, numberOr(handleLabelSize, 0));
  // What actually sits outside the arc, measured rather than summed. The ticks and the pointer
  // both reach outward from the track, into the SAME ring, so the room they need is the larger of
  // the two and not both added together — and a knob with its ticks off needs none for them. The
  // old padding added the tick length, the whole pointer half-size and a 14 px slack on top of
  // each other, which for a 100 px knob left an arc 16 px in radius (the floor below) in a box
  // that could hold one twice that.
  const tickRoom = hasTicks ? Math.max(0, majorTickLength) + 2 : 0;
  const pointerRoom = Math.max(0, (pointerSize - trackThickness) / 2) + 2;
  const outerPadding = 6 + Math.max(tickRoom, pointerRoom) + (labelAllowance * 0.4);
  const center = resolveCircularCenter(width, height);
  const autoRadius = Math.max(16, (Math.min(width, height) / 2) - outerPadding - (trackThickness / 2));
  const diameter = numberOr(circularDiameter, 0);
  const authoredRadius = diameter > 0 ? Math.max(1, diameter / 2) : autoRadius;
  const maxRadius = Math.max(1, Math.min(center.x, center.y) - (trackThickness / 2));
  let radius = Math.min(authoredRadius, maxRadius);

  if (tight && diameter <= 0) {
    // The housing's and the numbers' reach, 2 px in from the edge.
    const room = Math.max(1, Math.min(center.x, center.y) - 2);
    const reach = numberOr(outerReach, 0);
    const numbers = numberOr(numberReach, 0) > 0
      ? (room - Math.max(0, numberOr(numberSize, 0)) * 0.75) / numberOr(numberReach, 1)
      : Infinity;
    radius = Math.min(radius, Math.max(16, Math.min(reach > 1 ? room / reach : Infinity, numbers)));
  }

  return {
    centerX: center.x,
    centerY: center.y,
    radius,
  };
}

export function describeSliderSelection(behavior = null, normalizedValues = {}) {
  const mode = getSliderValueMode(behavior);
  const geometry = getSliderGeometry(behavior);
  if (mode === 'single') {
    return {
      geometry,
      kind: 'single',
      start: 0,
      end: clamp(numberOr(normalizedValues?.current, 0), 0, 1),
    };
  }

  return {
    geometry,
    kind: mode,
    start: clamp(numberOr(normalizedValues?.start, 0), 0, 1),
    end: clamp(numberOr(normalizedValues?.end, 0), 0, 1),
  };
}

/**
 * How many ticks a slider family control may draw. Every tick is an SVG node, and the counts had no
 * upper bound: 100,000 major ticks froze the editor for a minute and 1,000,000 crashed it (release
 * audit C-94). 129 major stops is every step of a 7-bit MIDI value plus the end; the largest count in
 * any shipped panel or control set is 25. The inspector fields use the same limits, and this builder
 * applies them again because a file or a script can write the counts without going through a field.
 */
export const SLIDER_TICK_LIMITS = Object.freeze({ majorMin: 2, majorMax: 129, minorMin: 0, minorMax: 16 });

export function clampSliderTickCount(kind, value, fallback) {
  const min = kind === 'major' ? SLIDER_TICK_LIMITS.majorMin : SLIDER_TICK_LIMITS.minorMin;
  const max = kind === 'major' ? SLIDER_TICK_LIMITS.majorMax : SLIDER_TICK_LIMITS.minorMax;
  return clamp(Math.round(numberOr(value, fallback)), min, max);
}

export function buildSliderTickStops(behavior = null) {
  const majorCount = clampSliderTickCount('major', behavior?.majorTickCount, 11);
  const minorCount = clampSliderTickCount('minor', behavior?.minorTickCount, 0);
  const major = [];
  const minor = [];

  for (let index = 0; index < majorCount; index += 1) {
    const normalized = majorCount === 1 ? 0 : index / (majorCount - 1);
    major.push({ normalized, key: `major_${index}` });

    if (index >= majorCount - 1 || minorCount <= 0) continue;
    for (let minorIndex = 1; minorIndex <= minorCount; minorIndex += 1) {
      minor.push({
        normalized: normalized + ((minorIndex / (minorCount + 1)) * (1 / (majorCount - 1))),
        key: `minor_${index}_${minorIndex}`,
      });
    }
  }

  return { major, minor };
}

/**
 * Where the labels riding a knob's or slider's handles hang (Behavior.showHandleLabels): 22 px out
 * from a knob's track at each handle's angle, 18 above a horizontal track's handles and 22 beside a
 * vertical one's. The only text a knob or slider still draws itself. `circle` is the circle the
 * knob is drawn round (utils/knobTrack.js); without one, the track's own metrics from the sizes.
 */
export function buildSliderHandleLabelAnchors(behavior = null, width = 0, height = 0, normalizedValues = {}, {
  trackThickness = 8,
  pointerSize = 16,
  handleLabelSize = 0,
  circle = null,
} = {}) {
  if (getSliderGeometry(behavior) === 'circular') {
    const metrics = circle ?? resolveCircularTrackMetrics(width, height, {
      trackThickness,
      pointerSize,
      majorTickLength: numberOr(behavior?.majorTickLength, 12),
      hasTicks: behavior?.showTicks !== false,
      circularDiameter: behavior?.circularDiameter,
      handleLabelSize,
    });
    const center = { x: metrics.centerX, y: metrics.centerY };
    const at = (normalized) => resolveCircularPoint(width, height, sliderNormalizedToAngle(behavior, normalized ?? 0), metrics.radius + 22, center);
    return {
      start: at(normalizedValues.start),
      current: at(normalizedValues.current),
      end: at(normalizedValues.end),
    };
  }

  const point = (normalized) => resolveLinearPointerPoint(behavior, width, height, normalized ?? 0, trackThickness, pointerSize);
  const beside = getSliderOrientation(behavior) === 'vertical'
    ? (p) => ({ x: p.x + 22, y: p.y + 4 })
    : (p) => ({ x: p.x, y: p.y - 18 });
  return {
    start: beside(point(normalizedValues.start)),
    current: beside(point(normalizedValues.current)),
    end: beside(point(normalizedValues.end)),
  };
}
