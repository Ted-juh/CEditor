// Pure geometry helpers for the custom-component design surface.
// Extracted verbatim from CustomDesignSurfaceEditor.svelte — reactive values
// (artboard size, zoom, snap settings) are passed in as explicit parameters.
import { numberOr } from './primitives.js';

export function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function resolveUnit(value, unit, total) {
  const numeric = numberOr(value, 0);
  return String(unit ?? 'px') === 'percent' ? (total * numeric) / 100 : numeric;
}

export function anchorOffset(anchor, size) {
  switch (String(anchor ?? 'center')) {
    case 'left':
    case 'top':
      return 0;
    case 'right':
    case 'bottom':
      return size;
    default:
      return size / 2;
  }
}

export function partFrame(part, artboardWidth, artboardHeight) {
  const layout = part?._children?.Layout ?? {};
  if (String(layout.mode ?? 'absolute') === 'fill') {
    return { left: 0, top: 0, width: artboardWidth, height: artboardHeight };
  }

  const width = resolveUnit(layout.width, layout.widthUnit, artboardWidth);
  const height = resolveUnit(layout.height, layout.heightUnit, artboardHeight);
  const x = resolveUnit(layout.x, layout.xUnit, artboardWidth);
  const y = resolveUnit(layout.y, layout.yUnit, artboardHeight);
  return {
    left: x - anchorOffset(layout.anchorX, width) + numberOr(layout.offsetX, 0),
    top: y - anchorOffset(layout.anchorY, height) + numberOr(layout.offsetY, 0),
    width,
    height,
  };
}

export function zoneFrame(zone, artboardWidth, artboardHeight) {
  const bounds = zone?.bounds ?? {};
  const unit = String(bounds.unit ?? 'percent') === 'px' ? 'px' : '%';
  const x = numberOr(bounds.x, 0);
  const y = numberOr(bounds.y, 0);
  const width = Math.max(0, numberOr(bounds.width, 100));
  const height = Math.max(0, numberOr(bounds.height, 100));
  return unit === 'px'
    ? { left: x, top: y, width, height }
    : {
      left: (artboardWidth * x) / 100,
      top: (artboardHeight * y) / 100,
      width: (artboardWidth * width) / 100,
      height: (artboardHeight * height) / 100,
    };
}

export function isTinyFrame(frame) {
  return !!frame && (frame.width < 28 || frame.height < 18);
}

export function frameCenter(frame) {
  return {
    x: numberOr(frame?.left, 0) + (numberOr(frame?.width, 0) / 2),
    y: numberOr(frame?.top, 0) + (numberOr(frame?.height, 0) / 2),
  };
}

export function boundsForFrames(frames = []) {
  if (!frames.length) return null;
  const left = Math.min(...frames.map((frame) => frame.left));
  const top = Math.min(...frames.map((frame) => frame.top));
  const right = Math.max(...frames.map((frame) => frame.left + frame.width));
  const bottom = Math.max(...frames.map((frame) => frame.top + frame.height));
  return { left, top, width: right - left, height: bottom - top };
}

export function draftRect(draft, artboardWidth, artboardHeight) {
  if (!draft) return null;
  let x2 = draft.current.x;
  let y2 = draft.current.y;
  if (draft.constrain) {
    const size = Math.max(Math.abs(x2 - draft.start.x), Math.abs(y2 - draft.start.y));
    x2 = draft.start.x + Math.sign(x2 - draft.start.x || 1) * size;
    y2 = draft.start.y + Math.sign(y2 - draft.start.y || 1) * size;
    x2 = Math.max(0, Math.min(artboardWidth, x2));
    y2 = Math.max(0, Math.min(artboardHeight, y2));
  }
  return {
    left: Math.min(draft.start.x, x2),
    top: Math.min(draft.start.y, y2),
    width: Math.abs(x2 - draft.start.x),
    height: Math.abs(y2 - draft.start.y),
  };
}

export function defaultDrawSize(tool) {
  if (tool === 'text') return { width: 96, height: 28 };
  if (tool === 'hitZone') return { width: 96, height: 52 };
  if (['ellipse', 'ring', 'arcTrack'].includes(tool)) return { width: 72, height: 72 };
  return { width: 72, height: 52 };
}

export function roundLayoutValue(value) {
  return Math.round(value * 1000) / 1000;
}

export function valueFromPx(px, unit, total) {
  return String(unit ?? 'px') === 'percent'
    ? roundLayoutValue(total > 0 ? (px / total) * 100 : 0)
    : roundLayoutValue(px);
}

export function patchFromFrameForLayer(name, part, frame, artboardWidth, artboardHeight) {
  const layout = part?._children?.Layout ?? {};
  const width = Math.max(1, frame.width);
  const height = Math.max(1, frame.height);
  const coordinateX = frame.left + anchorOffset(layout.anchorX, width) - numberOr(layout.offsetX, 0);
  const coordinateY = frame.top + anchorOffset(layout.anchorY, height) - numberOr(layout.offsetY, 0);

  return {
    [`Parts.${name}.Layout.x`]: valueFromPx(coordinateX, layout.xUnit, artboardWidth),
    [`Parts.${name}.Layout.y`]: valueFromPx(coordinateY, layout.yUnit, artboardHeight),
    [`Parts.${name}.Layout.width`]: valueFromPx(width, layout.widthUnit, artboardWidth),
    [`Parts.${name}.Layout.height`]: valueFromPx(height, layout.heightUnit, artboardHeight),
  };
}

export function patchFromZoneFrameFor(name, zone, frame, artboardWidth, artboardHeight) {
  const unit = String(zone?.bounds?.unit ?? 'percent') === 'px' ? 'px' : 'percent';
  const left = Math.max(0, frame.left);
  const top = Math.max(0, frame.top);
  const width = Math.max(1, frame.width);
  const height = Math.max(1, frame.height);
  return {
    [`HitZones.${name}.bounds.x`]: unit === 'px' ? roundLayoutValue(left) : roundLayoutValue((left / artboardWidth) * 100),
    [`HitZones.${name}.bounds.y`]: unit === 'px' ? roundLayoutValue(top) : roundLayoutValue((top / artboardHeight) * 100),
    [`HitZones.${name}.bounds.width`]: unit === 'px' ? roundLayoutValue(width) : roundLayoutValue((width / artboardWidth) * 100),
    [`HitZones.${name}.bounds.height`]: unit === 'px' ? roundLayoutValue(height) : roundLayoutValue((height / artboardHeight) * 100),
    [`HitZones.${name}.bounds.unit`]: unit,
  };
}

export function pointInArtboardFromElement(event, element, artboardWidth, artboardHeight, surfaceZoom) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(artboardWidth, (event.clientX - rect.left) / surfaceZoom)),
    y: Math.max(0, Math.min(artboardHeight, (event.clientY - rect.top) / surfaceZoom)),
  };
}

export function arcPointStyle(frame, angleDeg) {
  if (!frame) return '';
  const radians = (numberOr(angleDeg, 0) * Math.PI) / 180;
  const rx = frame.width / 2;
  const ry = frame.height / 2;
  const x = rx + Math.cos(radians) * rx;
  const y = ry + Math.sin(radians) * ry;
  return `left:${x - 6}px;top:${y - 6}px;`;
}

export function snapGuides(frame, snapEnabled, snapSize, artboardWidth, artboardHeight) {
  if (!frame || !snapEnabled) return [];
  const size = Math.max(1, numberOr(snapSize, 10));
  const candidates = [
    { axis: 'x', value: frame.left },
    { axis: 'x', value: frame.left + frame.width },
    { axis: 'y', value: frame.top },
    { axis: 'y', value: frame.top + frame.height },
  ];
  return candidates
    .filter((guide) => Math.abs(guide.value - Math.round(guide.value / size) * size) < 0.01)
    .map((guide) => ({
      ...guide,
      style: guide.axis === 'x'
        ? `left:${guide.value}px;top:0;height:${artboardHeight}px;`
        : `top:${guide.value}px;left:0;width:${artboardWidth}px;`,
    }));
}

export function frameReadout(frame) {
  if (!frame) return '';
  return `${Math.round(frame.width)} x ${Math.round(frame.height)}  X ${Math.round(frame.left)}  Y ${Math.round(frame.top)}`;
}

export function feedbackLabelStyle(frame, artboardWidth, artboardHeight) {
  if (!frame) return '';
  const left = Math.max(4, Math.min(artboardWidth - 118, frame.left + frame.width + 8));
  const top = Math.max(4, Math.min(artboardHeight - 24, frame.top + frame.height + 8));
  return `left:${left}px;top:${top}px;`;
}

export function selectionBoundsStyle(frame) {
  if (!frame) return '';
  return `left:${frame.left}px;top:${frame.top}px;width:${frame.width}px;height:${frame.height}px;`;
}

// --- Object-relative smart guides ---------------------------------------
// Snap a moving frame to other parts' edges/centers and the artboard
// edges/center. Grid snap is the per-axis fallback when no object line is
// within the threshold.

export function smartSnapTargets(otherFrames = [], artboardWidth, artboardHeight) {
  const xs = new Set([0, roundLayoutValue(artboardWidth / 2), artboardWidth]);
  const ys = new Set([0, roundLayoutValue(artboardHeight / 2), artboardHeight]);
  for (const frame of otherFrames) {
    if (!frame) continue;
    xs.add(roundLayoutValue(frame.left));
    xs.add(roundLayoutValue(frame.left + frame.width / 2));
    xs.add(roundLayoutValue(frame.left + frame.width));
    ys.add(roundLayoutValue(frame.top));
    ys.add(roundLayoutValue(frame.top + frame.height / 2));
    ys.add(roundLayoutValue(frame.top + frame.height));
  }
  return { xs: [...xs], ys: [...ys] };
}

function bestAxisSnap(edges, targets, threshold) {
  let best = null;
  for (const target of targets) {
    for (const edge of edges) {
      const delta = target - edge;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, target };
      }
    }
  }
  return best;
}

/**
 * Per-axis: snap `rawFrame` to the nearest object/artboard line within
 * `threshold`; where no line matches, fall back to that axis of
 * `fallbackFrame` (the grid-snapped frame). Returns the resolved frame plus
 * the matched guide lines for rendering.
 */
export function applySmartSnap(rawFrame, fallbackFrame, targets, threshold = 6) {
  if (!rawFrame) return { frame: rawFrame, guides: [] };
  const fallback = fallbackFrame ?? rawFrame;
  const guides = [];

  const xSnap = bestAxisSnap(
    [rawFrame.left, rawFrame.left + rawFrame.width / 2, rawFrame.left + rawFrame.width],
    targets?.xs ?? [],
    threshold
  );
  const ySnap = bestAxisSnap(
    [rawFrame.top, rawFrame.top + rawFrame.height / 2, rawFrame.top + rawFrame.height],
    targets?.ys ?? [],
    threshold
  );

  const left = xSnap ? rawFrame.left + xSnap.delta : fallback.left;
  const top = ySnap ? rawFrame.top + ySnap.delta : fallback.top;
  if (xSnap) guides.push({ axis: 'x', value: xSnap.target });
  if (ySnap) guides.push({ axis: 'y', value: ySnap.target });

  return {
    frame: { left, top, width: rawFrame.width, height: rawFrame.height },
    guides,
  };
}

export function smartGuideStyle(guide, artboardWidth, artboardHeight) {
  return guide.axis === 'x'
    ? `left:${guide.value}px;top:0;height:${artboardHeight}px;`
    : `top:${guide.value}px;left:0;width:${artboardWidth}px;`;
}

// --- Align & distribute within a multi-selection -------------------------

/**
 * entries: array of [name, frame]. Returns a Map name -> new frame with the
 * layers aligned inside the selection's bounding box.
 */
export function alignFramesWithinSelection(entries, mode) {
  const frames = entries.map(([, frame]) => frame).filter(Boolean);
  const bounds = boundsForFrames(frames);
  if (!bounds) return new Map();
  const result = new Map();
  for (const [name, frame] of entries) {
    if (!frame) continue;
    const next = { ...frame };
    if (mode === 'left') next.left = bounds.left;
    if (mode === 'centerX') next.left = bounds.left + (bounds.width - frame.width) / 2;
    if (mode === 'right') next.left = bounds.left + bounds.width - frame.width;
    if (mode === 'top') next.top = bounds.top;
    if (mode === 'centerY') next.top = bounds.top + (bounds.height - frame.height) / 2;
    if (mode === 'bottom') next.top = bounds.top + bounds.height - frame.height;
    result.set(name, next);
  }
  return result;
}

/**
 * entries: array of [name, frame]. Distributes the layers along `axis`
 * ('x' | 'y') with equal gaps between them, keeping the outermost two in
 * place. Needs 3+ frames to do anything.
 */
export function distributeFramesWithinSelection(entries, axis) {
  const usable = entries.filter(([, frame]) => frame);
  if (usable.length < 3) return new Map();
  const posKey = axis === 'x' ? 'left' : 'top';
  const sizeKey = axis === 'x' ? 'width' : 'height';
  const sorted = [...usable].sort((a, b) => a[1][posKey] - b[1][posKey]);
  const first = sorted[0][1];
  const last = sorted[sorted.length - 1][1];
  const span = (last[posKey] + last[sizeKey]) - first[posKey];
  const totalSize = sorted.reduce((sum, [, frame]) => sum + frame[sizeKey], 0);
  const gap = (span - totalSize) / (sorted.length - 1);
  const result = new Map();
  let cursor = first[posKey];
  for (const [name, frame] of sorted) {
    result.set(name, { ...frame, [posKey]: roundLayoutValue(cursor) });
    cursor += frame[sizeKey] + gap;
  }
  return result;
}

// --- Distance readouts between two frames --------------------------------

/**
 * Returns dashed-connector descriptors for the horizontal and vertical pixel
 * gaps between two frames: [{ axis, left, top, length, label }]. A line is
 * emitted only when the frames actually have a gap on that axis.
 */
export function measurementLinesBetween(frameA, frameB) {
  if (!frameA || !frameB) return [];
  const lines = [];

  const aRight = frameA.left + frameA.width;
  const bRight = frameB.left + frameB.width;
  const aBottom = frameA.top + frameA.height;
  const bBottom = frameB.top + frameB.height;

  // Horizontal gap (one frame fully to the left of the other).
  const leftFrame = aRight <= frameB.left ? frameA : (bRight <= frameA.left ? frameB : null);
  if (leftFrame) {
    const rightFrame = leftFrame === frameA ? frameB : frameA;
    const gapStart = leftFrame.left + leftFrame.width;
    const gap = rightFrame.left - gapStart;
    if (gap > 0.5) {
      const overlapTop = Math.max(frameA.top, frameB.top);
      const overlapBottom = Math.min(aBottom, bBottom);
      const at = overlapBottom > overlapTop
        ? (overlapTop + overlapBottom) / 2
        : (frameCenter(frameA).y + frameCenter(frameB).y) / 2;
      lines.push({ axis: 'x', left: gapStart, top: at, length: gap, label: `${Math.round(gap)}px` });
    }
  }

  // Vertical gap (one frame fully above the other).
  const topFrame = aBottom <= frameB.top ? frameA : (bBottom <= frameA.top ? frameB : null);
  if (topFrame) {
    const bottomFrame = topFrame === frameA ? frameB : frameA;
    const gapStart = topFrame.top + topFrame.height;
    const gap = bottomFrame.top - gapStart;
    if (gap > 0.5) {
      const overlapLeft = Math.max(frameA.left, frameB.left);
      const overlapRight = Math.min(aRight, bRight);
      const at = overlapRight > overlapLeft
        ? (overlapLeft + overlapRight) / 2
        : (frameCenter(frameA).x + frameCenter(frameB).x) / 2;
      lines.push({ axis: 'y', left: at, top: gapStart, length: gap, label: `${Math.round(gap)}px` });
    }
  }

  return lines;
}

// --- Surface interaction quanta ----------------------------------------------------------------
//
// The last of the §5 extraction from the 2026-07-12 workspace review: the three numbers that
// decide where a drag lands and how far a zoom goes. They lived as one-line closures over reactive
// state inside CustomDesignSurfaceEditor, which meant the only way to check the zoom clamp or the
// snap quantum was to open the app and try it. The review asks for exactly these as pure-logic
// tests, on the grounds that a surface which cannot be tested is a surface that regresses quietly.

/** Zoom bounds for the design surface. Below 0.25 parts are unhittable; above 5 a pixel is a tile. */
export const SURFACE_ZOOM_MIN = 0.25;
export const SURFACE_ZOOM_MAX = 5;

/** Clamp a zoom factor into the usable range. Non-numeric input falls back to 1:1 rather than NaN. */
export function clampSurfaceZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(SURFACE_ZOOM_MIN, Math.min(SURFACE_ZOOM_MAX, n));
}

/** Clamp the zoom step (in percentage points) a +/- press or a wheel notch applies. */
export function clampZoomIncrement(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return null;   // null = leave the current increment alone
  return Math.min(100, n);
}

/** Clamp the grid size. 1px is "off in all but name"; past 64 the grid is coarser than most parts. */
export function clampSnapSize(value) {
  const n = Number(value);
  return Math.max(1, Math.min(64, Math.round(Number.isFinite(n) ? n : 10)));
}

/**
 * Quantise one coordinate to the grid.
 *
 * `enabled` false and Alt-held both pass the value straight through — Alt is the documented
 * bypass, and it has to be checked here rather than at the call sites, because there are a dozen
 * of them and the one that forgets is the one that feels broken.
 */
export function snapToGrid(value, { enabled = true, size = 10, bypass = false } = {}) {
  if (!enabled || bypass) return value;
  const step = Math.max(1, Number(size) || 10);
  return Math.round(value / step) * step;
}

/** Quantise a frame, keeping width and height at least one grid step so nothing snaps to nothing. */
export function snapFrameToGrid(frame, opts = {}) {
  if (!frame) return frame;
  const { enabled = true, bypass = false } = opts;
  if (!enabled || bypass) return frame;
  return {
    ...frame,
    left: snapToGrid(frame.left, opts),
    top: snapToGrid(frame.top, opts),
    width: Math.max(1, snapToGrid(frame.width, opts)),
    height: Math.max(1, snapToGrid(frame.height, opts)),
  };
}

// --- Marquee selection ---------------------------------------------------------------------------
//
// Tier 1 of the 2026-07-12 workspace review: "Marquee selection (none exists — unlike the panel
// editor)." The panel editor has `createMarqueeController`, but it is built around the panel's DOM
// and zoom model; the design surface already has its own artboard-space point conversion, so what
// was actually missing is the geometry, which is this.

/** Normalise two artboard-space corners into a positive-area rect. */
export function marqueeRect(start, end) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  return { left, top, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

/**
 * A marquee smaller than this (in artboard units) is a click, not a drag.
 *
 * Without a threshold, every click on empty canvas is a zero-area rubber band that selects
 * nothing and clears the selection — which is the wanted behaviour, but it has to be reached
 * deliberately rather than as a side effect of the maths.
 */
export const MARQUEE_MIN_DRAG = 3;

export function isMarqueeDrag(rect) {
  return rect.width >= MARQUEE_MIN_DRAG || rect.height >= MARQUEE_MIN_DRAG;
}

/**
 * The parts a marquee catches.
 *
 * Intersection, not containment: a rubber band that only takes parts it fully encloses cannot
 * select a background plate that runs past the band on both sides, and reaching for one is the
 * commonest use of the gesture. Locked and hidden parts are skipped — selecting something you
 * cannot see or move is not a selection, it is a puzzle.
 */
export function partsInMarquee(entries, rect, frameOf) {
  const x2 = rect.left + rect.width;
  const y2 = rect.top + rect.height;
  const hits = [];
  for (const [name, part] of entries ?? []) {
    if (part?.locked === true || part?.visible === false) continue;
    const f = frameOf(part);
    if (!f) continue;
    if (f.left < x2 && f.left + f.width > rect.left && f.top < y2 && f.top + f.height > rect.top) {
      hits.push(name);
    }
  }
  return hits;
}

/** Shift-drag extends rather than replaces, matching the panel editor and every drawing tool. */
export function mergeMarqueeSelection(existing, hits, additive) {
  if (!additive) return hits;
  return [...new Set([...(existing ?? []), ...hits])];
}
