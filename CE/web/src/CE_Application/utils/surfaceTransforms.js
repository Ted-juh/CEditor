/**
 * surfaceTransforms.js — the design surface's geometry for parts that are turned or scaled.
 *
 * A part's Layout is a box; the renderer draws it `rotate(r) scale(s)` about its pivot
 * (bezierPath.js partTransform). The surface's own gestures and aids were written against the box,
 * which is right for an upright part and wrong for a turned one: guides snapped to edges that are not
 * drawn, a marquee missed corners that stick out, "align left" left a turned part poking past the
 * artboard, and an arc's handles were dragged in screen angles but stored as the part's own. Each
 * helper here answers one of those questions in terms of what is DRAWN:
 *
 *   screenBounds       the axis-aligned box round the drawn part — what snapping, measuring, the
 *                      marquee, alignment and toolbar placement should see
 *   moveSnapped        snap a move by the drawn bounds, and move the box by the same amount
 *   pivotPlacement     move the pivot without moving the part (the layout shifts to compensate)
 *   arc handles        where an arc's ends are drawn, in the renderer's compass angles, and the angle
 *                      a pointer means, through the part's turn
 */
import { partTransform } from './bezierPath.js';
import { numberOr } from './primitives.js';

const corners = (frame) => [
  { x: frame.left, y: frame.top },
  { x: frame.left + frame.width, y: frame.top },
  { x: frame.left + frame.width, y: frame.top + frame.height },
  { x: frame.left, y: frame.top + frame.height },
];

/** A part laid out at `frame` (px), with its own turn, scale and pivot kept. */
function atFrame(part, frame) {
  const layout = part?._children?.Layout ?? {};
  return {
    ...part,
    _children: {
      ...(part?._children ?? {}),
      Layout: {
        ...layout, mode: 'absolute', x: frame.left, y: frame.top, width: frame.width, height: frame.height,
        xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0,
      },
    },
  };
}

export function isTurned(part) {
  const layout = part?._children?.Layout ?? {};
  return Math.abs(numberOr(layout.rotation, 0)) > 1e-6 || Math.abs(numberOr(layout.scale, 1) - 1) > 1e-6;
}

/**
 * The axis-aligned bounds of the part as drawn, when its box is `frame` (the part's own frame, or one
 * a gesture is moving it to). An upright, unscaled part's bounds are its frame.
 */
export function screenBounds(part, frame, artboardWidth, artboardHeight) {
  if (!frame) return null;
  if (!isTurned(part)) return frame;
  const { toScreen } = partTransform(atFrame(part, frame), artboardWidth, artboardHeight);
  const points = corners(frame).map(toScreen);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

/**
 * Snap a move by what is drawn. `raw` is the box where the pointer has taken it; `snap(bounds)` is the
 * surface's snapper, returning `{ frame, guides }` for a frame. The box moves by whatever the drawn
 * bounds were moved by, so it keeps its size, turn and pivot.
 */
export function moveSnapped(part, raw, artboardWidth, artboardHeight, snap) {
  const drawn = screenBounds(part, raw, artboardWidth, artboardHeight);
  const snapped = snap(drawn);
  return {
    frame: { ...raw, left: raw.left + (snapped.frame.left - drawn.left), top: raw.top + (snapped.frame.top - drawn.top) },
    guides: snapped.guides ?? [],
  };
}

/** Move a box by the amount its drawn bounds were moved (alignment and distribution act on those). */
export function followDrawn(frame, drawnBefore, drawnAfter) {
  return { ...frame, left: frame.left + (drawnAfter.left - drawnBefore.left), top: frame.top + (drawnAfter.top - drawnBefore.top) };
}

/**
 * Put the pivot on `screenPoint` without moving the part. A pivot is a percentage of the box, and the
 * turn and scale act about it, so changing it alone swings the drawn part; the box is shifted by
 * (I − sR)(P − P') to compensate. Returns `{ frame, pivotX, pivotY }` (frame in px).
 */
export function pivotPlacement(part, frame, screenPoint, artboardWidth, artboardHeight) {
  const current = atFrame(part, frame);
  const { fromScreen, pivot } = partTransform(current, artboardWidth, artboardHeight);
  const local = fromScreen(screenPoint);          // the new pivot, in the part's own coordinates
  const layout = part?._children?.Layout ?? {};
  const scale = Math.max(0.01, numberOr(layout.scale, 1));
  const angle = (numberOr(layout.rotation, 0) * Math.PI) / 180;
  const vx = pivot.x - local.x;
  const vy = pivot.y - local.y;
  // (I − sR)v
  const tx = vx - scale * (vx * Math.cos(angle) - vy * Math.sin(angle));
  const ty = vy - scale * (vx * Math.sin(angle) + vy * Math.cos(angle));
  const width = Math.max(1e-6, frame.width);
  const height = Math.max(1e-6, frame.height);
  return {
    frame: { ...frame, left: frame.left + tx, top: frame.top + ty },
    pivotX: ((local.x - frame.left) / width) * 100,
    pivotY: ((local.y - frame.top) / height) * 100,
  };
}

/** Where the part's pivot is drawn, and where its box centre is drawn. */
export function drawnCentre(part, frame, artboardWidth, artboardHeight) {
  const { toScreen } = partTransform(atFrame(part, frame), artboardWidth, artboardHeight);
  return toScreen({ x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 });
}

// --- Arcs -----------------------------------------------------------------------------------------
// The renderer's arc angles are compass angles: 0° points up and they grow clockwise
// (InteractivePartRenderer turns its SVG circle by `startAngle − 90`).

function arcGeometry(frame, arc, border) {
  const size = Math.max(1, Math.min(frame.width, frame.height));
  const thickness = Math.max(1, Math.min(size / 2, numberOr(arc?.thickness ?? border?.thickness, 1)));
  return { cx: frame.width / 2, cy: frame.height / 2, r: Math.max(0.5, size / 2 - thickness / 2) };
}

/** The arc's two ends in compass degrees: { start, end } — `end` honours a counter-clockwise arc. */
export function arcEnds(arc) {
  const start = numberOr(arc?.startAngle, -135);
  const sweep = Math.max(0, Math.min(360, numberOr(arc?.sweepAngle, 270)));
  const ccw = String(arc?.direction ?? 'cw').trim().toLowerCase() === 'ccw';
  return { start, end: ccw ? start - sweep : start + sweep, ccw };
}

// Half the handle's drawn size (12px and a 1px border), plus the selection frame's own 1px border:
// an absolute child is placed from inside its parent's border.
const HANDLE_INSET = 8;

/** A handle's CSS inside the part's (transformed) selection frame: on the arc's centre line. */
export function arcHandleStyle(frame, arc, border, which) {
  if (!frame) return '';
  const { cx, cy, r } = arcGeometry(frame, arc, border);
  const angle = ((arcEnds(arc)[which] - 90) * Math.PI) / 180;
  return `left:${cx + Math.cos(angle) * r - HANDLE_INSET}px;top:${cy + Math.sin(angle) * r - HANDLE_INSET}px;`;
}

/** The compass angle a pointer (artboard coordinates) points at, from the arc's centre, through the turn. */
export function arcPointerAngle(part, frame, pointer, artboardWidth, artboardHeight) {
  const local = partTransform(atFrame(part, frame), artboardWidth, artboardHeight).fromScreen(pointer);
  const cx = frame.left + frame.width / 2;
  const cy = frame.top + frame.height / 2;
  return (Math.atan2(local.y - cy, local.x - cx) * 180) / Math.PI + 90;
}
