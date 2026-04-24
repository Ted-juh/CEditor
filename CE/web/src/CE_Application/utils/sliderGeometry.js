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

function sliderHasReadout(behavior = null) {
  return behavior?.showValueReadout !== false;
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

  if (getSliderGeometry(behavior) === 'circular') {
    const center = resolveCircularCenter(rect.width, rect.height, {
      hasReadout: sliderHasReadout(behavior),
    });
    const centerX = rect.left + center.x;
    const centerY = rect.top + center.y;
    const angle = normalizeDegrees((Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI);
    const startAngle = getSliderStartAngle(behavior);
    const sweepAngle = getSliderSweepAngle(behavior);
    const direction = getSliderDirection(behavior);
    const delta = direction === 'ccw'
      ? counterClockwiseDelta(startAngle, angle)
      : clockwiseDelta(startAngle, angle);
    return clamp(delta / Math.max(1, sweepAngle), 0, 1);
  }

  const localX = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  const localY = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  const orientation = getSliderOrientation(behavior);
  const direction = getSliderDirection(behavior);

  if (orientation === 'vertical') {
    return direction === 'ttb' ? localY : 1 - localY;
  }

  return direction === 'rtl' ? 1 - localX : localX;
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

export function resolveCircularCenter(width = 0, height = 0, {
  hasReadout = false,
} = {}) {
  return {
    x: width / 2,
    y: (height / 2) + (hasReadout ? 8 : 0),
  };
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

export function resolveLinearTrackFrame(behavior = null, width = 0, height = 0, trackThickness = 8, pointerSize = 16, hasReadout = false) {
  const orientation = getSliderOrientation(behavior);
  const topPadding = hasReadout ? 24 : 10;
  const outerPadding = 14;

  if (orientation === 'vertical') {
    return {
      x1: width / 2,
      y1: height - outerPadding - (pointerSize / 2),
      x2: width / 2,
      y2: topPadding + (pointerSize / 2),
      trackThickness,
    };
  }

  return {
    x1: outerPadding + (pointerSize / 2),
    y1: hasReadout ? Math.max(topPadding + 12, height / 2) : height / 2,
    x2: width - outerPadding - (pointerSize / 2),
    y2: hasReadout ? Math.max(topPadding + 12, height / 2) : height / 2,
    trackThickness,
  };
}

export function resolveLinearPointerPoint(behavior = null, width = 0, height = 0, normalized = 0, trackThickness = 8, pointerSize = 16, hasReadout = false) {
  const frame = resolveLinearTrackFrame(behavior, width, height, trackThickness, pointerSize, hasReadout);
  const orientation = getSliderOrientation(behavior);
  const safeNormalized = clamp(numberOr(normalized, 0), 0, 1);
  if (orientation === 'vertical') {
    return {
      x: frame.x1,
      y: frame.y1 + ((frame.y2 - frame.y1) * safeNormalized),
    };
  }
  return {
    x: frame.x1 + ((frame.x2 - frame.x1) * safeNormalized),
    y: frame.y1,
  };
}

export function resolveCircularTrackMetrics(width = 0, height = 0, {
  trackThickness = 10,
  pointerSize = 18,
  majorTickLength = 12,
  hasReadout = false,
} = {}) {
  const topInset = hasReadout ? 12 : 0;
  const outerPadding = 14 + majorTickLength + (pointerSize / 2);
  const center = resolveCircularCenter(width, height, { hasReadout });
  const radius = Math.max(
    16,
    (Math.min(width, height - topInset) / 2) - outerPadding - (trackThickness / 2)
  );

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

export function buildSliderTickStops(behavior = null) {
  const majorCount = Math.max(2, Math.round(numberOr(behavior?.majorTickCount, 11)));
  const minorCount = Math.max(0, Math.round(numberOr(behavior?.minorTickCount, 0)));
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

export function buildSliderLabelAnchors(behavior = null, width = 0, height = 0, normalizedValues = {}, {
  trackThickness = 8,
  pointerSize = 16,
  hasReadout = false,
} = {}) {
  const geometry = getSliderGeometry(behavior);
  if (geometry === 'circular') {
    const metrics = resolveCircularTrackMetrics(width, height, {
      trackThickness,
      pointerSize,
      majorTickLength: numberOr(behavior?.majorTickLength, 12),
      hasReadout,
    });
    const center = { x: metrics.centerX, y: metrics.centerY };
    const startAngle = getSliderStartAngle(behavior);
    const endAngle = sliderNormalizedToAngle(behavior, 1);
    return {
      min: resolveCircularPoint(width, height, startAngle, metrics.radius + 24, center),
      max: resolveCircularPoint(width, height, endAngle, metrics.radius + 24, center),
      start: resolveCircularPoint(width, height, sliderNormalizedToAngle(behavior, normalizedValues.start ?? 0), metrics.radius + 22, center),
      current: resolveCircularPoint(width, height, sliderNormalizedToAngle(behavior, normalizedValues.current ?? 0), metrics.radius + 22, center),
      end: resolveCircularPoint(width, height, sliderNormalizedToAngle(behavior, normalizedValues.end ?? 0), metrics.radius + 22, center),
      title: { x: metrics.centerX, y: metrics.centerY - 18 },
      value: { x: metrics.centerX, y: metrics.centerY + 10 },
    };
  }

  const frame = resolveLinearTrackFrame(behavior, width, height, trackThickness, pointerSize, hasReadout);
  const startPoint = resolveLinearPointerPoint(behavior, width, height, normalizedValues.start ?? 0, trackThickness, pointerSize, hasReadout);
  const currentPoint = resolveLinearPointerPoint(behavior, width, height, normalizedValues.current ?? 0, trackThickness, pointerSize, hasReadout);
  const endPoint = resolveLinearPointerPoint(behavior, width, height, normalizedValues.end ?? 0, trackThickness, pointerSize, hasReadout);
  const vertical = getSliderOrientation(behavior) === 'vertical';

  if (vertical) {
    return {
      min: { x: frame.x1 + 18, y: frame.y1 + 4 },
      max: { x: frame.x2 + 18, y: frame.y2 + 4 },
      start: { x: startPoint.x + 22, y: startPoint.y + 4 },
      current: { x: currentPoint.x + 22, y: currentPoint.y + 4 },
      end: { x: endPoint.x + 22, y: endPoint.y + 4 },
      title: { x: width / 2, y: height - 14 },
      value: { x: width / 2, y: 14 },
    };
  }

  return {
    min: { x: frame.x1, y: frame.y1 + 22 },
    max: { x: frame.x2, y: frame.y2 + 22 },
    start: { x: startPoint.x, y: startPoint.y - 18 },
    current: { x: currentPoint.x, y: currentPoint.y - 18 },
    end: { x: endPoint.x, y: endPoint.y - 18 },
    title: { x: width / 2, y: height - 12 },
    value: { x: width / 2, y: 14 },
  };
}
