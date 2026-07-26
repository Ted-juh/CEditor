/**
 * Pure geometry helpers for CanvasControl text rendering: angle/vector math,
 * reflection transforms, polyline/arc/bezier path sampling. No DOM access,
 * no store reads — every function is a plain (inputs -> value) mapping.
 */

import { numberOr } from '../utils/primitives.js';

export function degToRad(value) {
  return (Number(value) * Math.PI) / 180;
}

export function normalizeAngleDegrees(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return ((numeric % 360) + 360) % 360;
}

export function isQuarterTurnAngle(value) {
  const normalized = normalizeAngleDegrees(value);
  return Math.abs(normalized - 90) < 0.001 || Math.abs(normalized - 270) < 0.001;
}

export function angleDegreesFromVector(x = 0, y = 0, fallback = 90) {
  const numericX = numberOr(x, 0);
  const numericY = numberOr(y, 0);
  if (Math.hypot(numericX, numericY) <= 0.0001) return fallback;
  return normalizeAngleDegrees((Math.atan2(numericY, numericX) * 180) / Math.PI);
}

/** SVG matrix() that reflects across the axis perpendicular to angleDegrees, offset by distance. */
export function reflectionMatrixTransform(centerX, centerY, angleDegrees = 90, distance = 0) {
  const radians = degToRad(angleDegrees);
  const nx = Math.cos(radians);
  const ny = Math.sin(radians);
  const a = 1 - (2 * nx * nx);
  const b = -2 * nx * ny;
  const c = -2 * nx * ny;
  const d = 1 - (2 * ny * ny);
  const e = centerX + (nx * distance) - ((a * centerX) + (c * centerY));
  const f = centerY + (ny * distance) - ((b * centerX) + (d * centerY));
  return `matrix(${a.toFixed(6)} ${b.toFixed(6)} ${c.toFixed(6)} ${d.toFixed(6)} ${e.toFixed(3)} ${f.toFixed(3)})`;
}

export function rotatePointAround(x, y, centerX, centerY, angleDegrees = 0) {
  const radians = degToRad(angleDegrees);
  const dx = x - centerX;
  const dy = y - centerY;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: centerX + (dx * cos) - (dy * sin),
    y: centerY + (dx * sin) + (dy * cos),
  };
}

export function mirrorPointHorizontally(x, y, axisX) {
  return {
    x: (axisX * 2) - x,
    y,
  };
}

export function projectPointOntoAxis(x, y, originX, originY, angleDegrees = 90) {
  const radians = degToRad(angleDegrees);
  const nx = Math.cos(radians);
  const ny = Math.sin(radians);
  return ((x - originX) * nx) + ((y - originY) * ny);
}

/**
 * Gradient spec (endpoints + stops) for fading a reflection along its axis.
 * Returns null when no fade applies. sourceProjectionRange is the projection
 * of the source glyph bounds onto the reflection axis ({ min, max }).
 */
export function buildReflectionFadeSpec(centerX, centerY, angleDegrees = 90, distance = 0, mode = 'none', amount = 0, sourceProjectionRange = null) {
  const fadeMode = String(mode ?? 'none');
  if (fadeMode !== 'in' && fadeMode !== 'out') return null;

  const fadeDistance = Math.max(0, numberOr(distance, 0));
  if (fadeDistance <= 0) return null;

  const sourceMin = numberOr(sourceProjectionRange?.min, 0);
  const sourceMax = numberOr(sourceProjectionRange?.max, 0);
  const reflectedNear = fadeDistance - sourceMax;
  const reflectedFar = fadeDistance - sourceMin;
  const absoluteAmount = Math.max(0, numberOr(amount, 0));
  const span = Math.max(1, reflectedFar - reflectedNear);
  const radians = degToRad(angleDegrees);
  const nx = Math.cos(radians);
  const ny = Math.sin(radians);
  const offsetFor = (projection) => `${((((projection - reflectedNear) / span) * 100)).toFixed(2)}%`;

  if (fadeMode === 'in') {
    if (absoluteAmount <= reflectedNear) return null;
    const fadeEnd = Math.min(absoluteAmount, reflectedFar);
    return {
      x1: centerX + (nx * reflectedNear),
      y1: centerY + (ny * reflectedNear),
      x2: centerX + (nx * reflectedFar),
      y2: centerY + (ny * reflectedFar),
      stops: [
        { offset: '0%', colour: '#000' },
        { offset: offsetFor(fadeEnd), colour: '#fff' },
        { offset: '100%', colour: '#fff' },
      ],
    };
  }

  if (absoluteAmount >= reflectedFar) return null;
  const fadeStart = Math.max(absoluteAmount, reflectedNear);

  return {
    x1: centerX + (nx * reflectedNear),
    y1: centerY + (ny * reflectedNear),
    x2: centerX + (nx * reflectedFar),
    y2: centerY + (ny * reflectedFar),
    stops: [
      { offset: '0%', colour: '#fff' },
      { offset: offsetFor(fadeStart), colour: '#fff' },
      { offset: '100%', colour: '#000' },
    ],
  };
}

/** Axis-aligned bounding box size of a width x height box rotated by angleDegrees. */
export function rotatedBoxSize(width, height, angleDegrees) {
  const radians = degToRad(angleDegrees);
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: (width * cos) + (height * sin),
    height: (width * sin) + (height * cos),
  };
}

export function glyphBoundsAt(x, y, width, height, rotationDegrees = 0) {
  const rotated = rotatedBoxSize(width, height, rotationDegrees);
  return {
    left: x - (rotated.width / 2),
    right: x + (rotated.width / 2),
    top: y - (rotated.height / 2),
    bottom: y + (rotated.height / 2),
  };
}

export function normalizeVector(x, y) {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= 0.0001) return { x: 0, y: 1 };
  return { x: x / length, y: y / length };
}

export function leftNormalForVector(x, y) {
  const normalized = normalizeVector(x, y);
  return { x: -normalized.y, y: normalized.x };
}

export function distanceBetweenPoints(a, b) {
  return Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));
}

export function polylineLength(points) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
  let total = 0;
  for (let i = 0; i < safePoints.length - 1; i += 1) {
    total += distanceBetweenPoints(safePoints[i], safePoints[i + 1]);
  }
  return total;
}

/** Cut trimStart/trimEnd path-lengths off either end of a polyline. */
export function trimPolylinePoints(points, trimStart = 0, trimEnd = 0) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
  if (safePoints.length < 2) return [];

  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < safePoints.length - 1; i += 1) {
    const start = safePoints[i];
    const end = safePoints[i + 1];
    const length = distanceBetweenPoints(start, end);
    if (length <= 0.0001) continue;
    segments.push({ start, end, length });
    totalLength += length;
  }

  if (segments.length === 0 || totalLength <= 0.0001) return [];

  const clampedStart = Math.max(0, Math.min(totalLength, numberOr(trimStart, 0)));
  const clampedEnd = Math.max(0, Math.min(totalLength - clampedStart, numberOr(trimEnd, 0)));
  const visibleLength = totalLength - clampedStart - clampedEnd;
  if (visibleLength <= 0.0001) return [];

  const trimmed = [];
  let consumed = 0;
  const targetStart = clampedStart;
  const targetEnd = totalLength - clampedEnd;

  for (const segment of segments) {
    const segmentStart = consumed;
    const segmentEnd = consumed + segment.length;
    consumed = segmentEnd;

    if (segmentEnd <= targetStart || segmentStart >= targetEnd) continue;

    const startRatio = Math.max(0, (targetStart - segmentStart) / segment.length);
    const endRatio = Math.min(1, (targetEnd - segmentStart) / segment.length);
    const startPoint = {
      x: segment.start.x + ((segment.end.x - segment.start.x) * startRatio),
      y: segment.start.y + ((segment.end.y - segment.start.y) * startRatio),
    };
    const endPoint = {
      x: segment.start.x + ((segment.end.x - segment.start.x) * endRatio),
      y: segment.start.y + ((segment.end.y - segment.start.y) * endRatio),
    };

    if (trimmed.length === 0) {
      trimmed.push(startPoint);
    } else {
      const previous = trimmed[trimmed.length - 1];
      if (distanceBetweenPoints(previous, startPoint) > 0.0001) trimmed.push(startPoint);
    }

    if (distanceBetweenPoints(startPoint, endPoint) > 0.0001) {
      trimmed.push(endPoint);
    }
  }

  return trimmed;
}

/** Shift each polyline point along its local left normal by offset. */
export function offsetPolylinePoints(points, offset = 0) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
  if (safePoints.length === 0) return [];
  if (Math.abs(offset) <= 0.0001) return safePoints.map((point) => ({ x: point.x, y: point.y }));

  return safePoints.map((point, index) => {
    const previous = safePoints[index - 1] ?? safePoints[index];
    const next = safePoints[index + 1] ?? safePoints[index];
    const tangent = normalizeVector(next.x - previous.x, next.y - previous.y);
    const normal = leftNormalForVector(tangent.x, tangent.y);
    return {
      x: point.x + (normal.x * offset),
      y: point.y + (normal.y * offset),
    };
  });
}

export function polylinePathData(points) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
  if (safePoints.length < 2) return '';
  return safePoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`).join(' ');
}

export function polarPoint(radius, angleRadians) {
  return {
    x: Math.cos(angleRadians) * radius,
    y: Math.sin(angleRadians) * radius,
  };
}

/** Arc path centred on the origin; full circles are emitted as two half arcs. */
export function arcPathData(radius, startRadians, endRadians) {
  const safeRadius = Math.max(0.001, numberOr(radius, 0));
  const delta = endRadians - startRadians;
  if (Math.abs(delta) <= 0.0001) return '';
  if (Math.abs(Math.abs(delta) - (Math.PI * 2)) <= 0.0001) {
    const mid = startRadians + (delta / 2);
    const start = polarPoint(safeRadius, startRadians);
    const middle = polarPoint(safeRadius, mid);
    const end = polarPoint(safeRadius, endRadians);
    const sweepFlag = delta >= 0 ? 1 : 0;
    return [
      `M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
      `A ${safeRadius.toFixed(3)} ${safeRadius.toFixed(3)} 0 0 ${sweepFlag} ${middle.x.toFixed(3)} ${middle.y.toFixed(3)}`,
      `A ${safeRadius.toFixed(3)} ${safeRadius.toFixed(3)} 0 0 ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    ].join(' ');
  }
  const start = polarPoint(safeRadius, startRadians);
  const end = polarPoint(safeRadius, endRadians);
  const largeArcFlag = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweepFlag = delta >= 0 ? 1 : 0;
  return [
    `M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${safeRadius.toFixed(3)} ${safeRadius.toFixed(3)} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
  ].join(' ');
}

/** Point + unit tangent at a path-length distance along a polyline. */
export function pointAlongPolyline(points, distance) {
  const safePoints = Array.isArray(points) ? points.filter(Boolean) : [];
  if (safePoints.length === 0) return { x: 0, y: 0, tangentX: 1, tangentY: 0 };
  if (safePoints.length === 1) return { x: safePoints[0].x, y: safePoints[0].y, tangentX: 1, tangentY: 0 };

  let remaining = Math.max(0, numberOr(distance, 0));
  for (let index = 1; index < safePoints.length; index += 1) {
    const start = safePoints[index - 1];
    const end = safePoints[index];
    const length = distanceBetweenPoints(start, end);
    if (length <= 0.0001) continue;
    if (remaining <= length || index === safePoints.length - 1) {
      const ratio = Math.max(0, Math.min(1, remaining / length));
      return {
        x: start.x + ((end.x - start.x) * ratio),
        y: start.y + ((end.y - start.y) * ratio),
        tangentX: (end.x - start.x) / length,
        tangentY: (end.y - start.y) / length,
      };
    }
    remaining -= length;
  }

  const last = safePoints[safePoints.length - 1];
  const previous = safePoints[safePoints.length - 2];
  const tangent = normalizeVector(last.x - previous.x, last.y - previous.y);
  return { x: last.x, y: last.y, tangentX: tangent.x, tangentY: tangent.y };
}

export function bezierPoint(start, c1, c2, end, t) {
  const mt = 1 - t;
  return {
    x: (mt ** 3) * start.x + (3 * mt * mt * t * c1.x) + (3 * mt * t * t * c2.x) + (t ** 3) * end.x,
    y: (mt ** 3) * start.y + (3 * mt * mt * t * c1.y) + (3 * mt * t * t * c2.y) + (t ** 3) * end.y,
  };
}

export function sampleBezierPoints(start, c1, c2, end, segments = 80) {
  return Array.from({ length: Math.max(2, segments) + 1 }, (_, index) =>
    bezierPoint(start, c1, c2, end, index / Math.max(1, segments))
  );
}

/** Map a { x, y } point in 0-100 percent space to box-local coordinates centred on the origin. */
export function normalizedPathPointToLocal(point, width, height) {
  return {
    x: ((numberOr(point?.x, 50) - 50) / 100) * Math.max(1, numberOr(width, 0)),
    y: ((numberOr(point?.y, 50) - 50) / 100) * Math.max(1, numberOr(height, 0)),
  };
}

export function pathPointsFromSetting(points, width, height) {
  const safePoints = Array.isArray(points) && points.length > 1
    ? points
    : [{ x: 0, y: 50 }, { x: 100, y: 50 }];
  return safePoints.map((point) => normalizedPathPointToLocal(point, width, height));
}

export function perimeterPathPoints(width, height, inset = 0) {
  const safeWidth = Math.max(1, numberOr(width, 0));
  const safeHeight = Math.max(1, numberOr(height, 0));
  const insetValue = Math.max(0, numberOr(inset, 0));
  const left = (-safeWidth / 2) + insetValue;
  const right = (safeWidth / 2) - insetValue;
  const top = (-safeHeight / 2) + insetValue;
  const bottom = (safeHeight / 2) - insetValue;
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ];
}
