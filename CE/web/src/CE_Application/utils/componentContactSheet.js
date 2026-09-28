// componentContactSheet.js — every state of a custom component, at several sizes, side by side.
//
// A component's parts are laid out against the size it is PLACED at (anchors, percent units) —
// CanvasControl hands InteractivePartRenderer the placed width and height, and unless the component
// opts into 'scaleInternals' nothing scales its pixel sizes to match. So a component can look right on the artboard and break at the size somebody
// actually drops it: a right-anchored legend runs into a left-anchored pointer, a pixel-sized part
// hangs out of a smaller box. The filmstrip shows each state at the current size only. This shows
// each state at five, and says where the layout broke.
//
// Each cell is built the way the filmstrip builds its cards — the control at that size, the state's
// patches applied, then materialized — and then, as resolveInteractiveControl does last, a
// 'scaleInternals' component's px internals are scaled to the size. So a cell is what the panel
// draws at that size, not an approximation of it.

import { partFrame } from './customDesignSurfaceGeometry.js';
import { materializedCustomComponentSnapshot } from './customComponentMaterializer.js';
import { resolveStateScopedControl } from './interactionRuntime.js';
import { applyCustomInternalScale } from './customComponentScale.js';
import { numberOr } from './primitives.js';

const EDGE_TOLERANCE = 0.5;

/** The sizes a component is shown at: its current size, half and double, and stretched each way. */
export function contactSheetSizes(width, height) {
  const w = Math.max(1, Math.round(numberOr(width, 1)));
  const h = Math.max(1, Math.round(numberOr(height, 1)));
  const size = (key, label, sw, sh) => ({ key, label, width: Math.max(1, Math.round(sw)), height: Math.max(1, Math.round(sh)) });
  return [
    size('current', 'Current', w, h),
    size('half', 'Half', w / 2, h / 2),
    size('double', 'Double', w * 2, h * 2),
    size('wide', 'Wide', w * 2, h),
    size('tall', 'Tall', w, h * 2),
  ];
}

/** The control as if it had been placed at this size. */
export function controlAtSize(control, width, height) {
  const children = control?._children ?? {};
  return {
    ...control,
    _children: { ...children, Transform: { ...(children.Transform ?? {}), width, height } },
  };
}

/** Visible parts, in paint order, as the filmstrip and canvas draw them. */
function visibleParts(materialized) {
  return Object.entries(materialized?._children?.Parts?._children ?? {})
    .filter(([, part]) => part?.visible !== false)
    .sort((left, right) => numberOr(left?.[1]?.zIndex, 0) - numberOr(right?.[1]?.zIndex, 0));
}

/**
 * A part's box, when it can be judged. A rotated or scaled part draws outside its layout box by an
 * amount this does not model, so it is left out of the checks rather than reported wrongly.
 */
function measurableFrame(part, width, height) {
  const layout = part?._children?.Layout ?? {};
  if (numberOr(layout.rotation, 0) % 360 !== 0) return null;
  if (numberOr(layout.scale, 1) !== 1) return null;
  return partFrame(part, width, height);
}

function inside(frame, width, height) {
  return frame.left >= -EDGE_TOLERANCE
    && frame.top >= -EDGE_TOLERANCE
    && frame.left + frame.width <= width + EDGE_TOLERANCE
    && frame.top + frame.height <= height + EDGE_TOLERANCE;
}

function overlaps(a, b) {
  return a.left < b.left + b.width - EDGE_TOLERANCE
    && b.left < a.left + a.width - EDGE_TOLERANCE
    && a.top < b.top + b.height - EDGE_TOLERANCE
    && b.top < a.top + a.height - EDGE_TOLERANCE;
}

const hasArea = (frame) => frame.width > EDGE_TOLERANCE && frame.height > EDGE_TOLERANCE;

/**
 * What broke between the current size and this one. Only CHANGES are reported: a part that already
 * hangs out at the current size, or two parts that already overlap there, were drawn that way.
 */
export function layoutIssues(designParts, designSize, parts, size) {
  const design = new Map();
  for (const [name, part] of designParts) {
    const frame = measurableFrame(part, designSize.width, designSize.height);
    if (frame) design.set(name, frame);
  }
  const here = [];
  for (const [name, part] of parts) {
    const frame = measurableFrame(part, size.width, size.height);
    if (frame && design.has(name)) here.push([name, frame]);
  }

  const issues = [];
  for (const [name, frame] of here) {
    const was = design.get(name);
    if (hasArea(was) && !hasArea(frame)) {
      issues.push({ kind: 'collapsed', parts: [name], message: `${name} has no size left` });
    } else if (inside(was, designSize.width, designSize.height) && !inside(frame, size.width, size.height)) {
      issues.push({ kind: 'spills', parts: [name], message: `${name} spills outside the component` });
    }
  }
  for (let i = 0; i < here.length; i += 1) {
    for (let j = i + 1; j < here.length; j += 1) {
      const [a, frameA] = here[i];
      const [b, frameB] = here[j];
      if (!hasArea(frameA) || !hasArea(frameB)) continue;
      if (!overlaps(design.get(a), design.get(b)) && overlaps(frameA, frameB)) {
        issues.push({ kind: 'collides', parts: [a, b], message: `${a} now overlaps ${b}` });
      }
    }
  }
  return issues;
}

/** One cell: this state, at this size. */
export function contactSheetCell(control, stateName, size, signals = {}, design = null) {
  const sized = controlAtSize(control, size.width, size.height);
  const scoped = stateName && stateName !== 'base' ? resolveStateScopedControl(sized, stateName) : sized;
  const materialized = materializedCustomComponentSnapshot(scoped, signals);
  applyCustomInternalScale(materialized);
  const parts = visibleParts(materialized);
  return {
    key: `${stateName || 'base'}:${size.key}`,
    state: stateName || 'base',
    size,
    parts,
    issues: design ? layoutIssues(design.parts, design.size, parts, size) : [],
  };
}

/**
 * The whole sheet: a row per state, a column per size. Each row is judged against that same state
 * at the current size, so a state that moves a part on purpose is not reported for it.
 */
export function buildContactSheet(control, stateNames = [], signals = {}) {
  const transform = control?._children?.Transform ?? {};
  const sizes = contactSheetSizes(transform.width, transform.height);
  const names = ['base', ...stateNames.filter((name) => name && name !== 'base')];
  const rows = names.map((stateName) => {
    const designCell = contactSheetCell(control, stateName, sizes[0], signals);
    const design = { parts: designCell.parts, size: sizes[0] };
    return {
      state: stateName,
      cells: [designCell, ...sizes.slice(1).map((size) => contactSheetCell(control, stateName, size, signals, design))],
    };
  });
  const issueCount = rows.reduce((sum, row) => sum + row.cells.reduce((n, cell) => n + cell.issues.length, 0), 0);
  return { sizes, rows, issueCount };
}

/** One scale for the whole sheet, so the cells keep their true proportions to each other. */
export function contactSheetScale(sizes, maxWidth = 180, maxHeight = 130) {
  const widest = Math.max(1, ...sizes.map((size) => size.width));
  const tallest = Math.max(1, ...sizes.map((size) => size.height));
  return Math.min(1, maxWidth / widest, maxHeight / tallest);
}
