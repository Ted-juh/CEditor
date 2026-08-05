// Resolvers for the Mouse section — the per-control pointer, focus and drag
// settings edited in the Mouse tab.
//
// The section shipped in the model long before anything read it, so every
// resolver here has to treat a missing or half-populated block as "the old
// default" rather than as an instruction. A panel authored before the Mouse
// tab existed carries no Mouse values at all, and must keep behaving exactly
// as it did: `undefined` therefore falls through to the value the surfaces
// hard-coded previously, never to a new one.
//
// Nothing in here touches the DOM or dragScrub directly. CanvasControl turns
// the pointer/focus half into element attributes; scrubRuntime folds the drag
// half into DragScrubOptions. Keeping the decisions in one pure module is what
// lets both be tested without a browser.
import { numberOr } from './primitives.js';

/** Cursors offered in the Mouse tab. `default` means "inherit the surface's". */
export const CURSOR_OPTIONS = [
  'default',
  'pointer',
  'grab',
  'grabbing',
  'crosshair',
  'move',
  'text',
  'ns-resize',
  'ew-resize',
  'nwse-resize',
  'not-allowed',
  'none',
];

/**
 * Hit-test shapes. `rectangle` is the element box (no clipping);
 * `ellipse` inscribes an ellipse, which is what a round knob wants so the
 * corners of its box stop swallowing clicks meant for whatever is behind it.
 */
export const HIT_TEST_SHAPES = ['rectangle', 'ellipse'];

/**
 * Drag modes, mirroring the vocabulary custom behavior modules already use so
 * one concept isn't spelled two ways. `auto` defers to the control's own
 * geometry — the behavior the surfaces had before this setting existed.
 */
export const DRAG_MODE_OPTIONS = [
  'auto',
  'vertical',
  'horizontal',
  'circular',
  'both',
  'free',
  'relative',
];

const DRAG_MODE_AXIS = {
  vertical: 'y',
  horizontal: 'x',
  circular: 'rotary',
  both: 'both',
  free: 'both',
  relative: null, // keeps the resolved axis, switches tracking only
};

export function getMouseSection(control = null) {
  return control?._children?.Mouse ?? null;
}

export function getCursor(mouse = null) {
  const cursor = String(mouse?.cursor ?? 'default').trim();
  return CURSOR_OPTIONS.includes(cursor) ? cursor : 'default';
}

/**
 * The root element's `cursor`. `default` returns '' so the surface's own
 * cursor (the editor's move/resize affordances) still shows through — writing
 * `cursor: default` would override them.
 */
export function resolveCursorCss(mouse = null) {
  const cursor = getCursor(mouse);
  return cursor === 'default' ? '' : `cursor:${cursor};`;
}

/** False makes the control transparent to the pointer; events land behind it. */
export function acceptsPointer(mouse = null) {
  return mouse?.interceptClicks !== false;
}

/**
 * True lets children take the pointer themselves. The default (false) is the
 * historical behavior: the control is one target and its parts don't compete
 * with it.
 */
export function childrenAcceptPointer(mouse = null) {
  return mouse?.interceptChildClicks === true;
}

export function getHitTestShape(mouse = null) {
  const shape = String(mouse?.hitTestShape ?? 'rectangle').trim().toLowerCase();
  return HIT_TEST_SHAPES.includes(shape) ? shape : 'rectangle';
}

/**
 * Clip-path for the hit shape. An ellipse clips the painted box as well as the
 * hit area — which is the honest reading of "this control is round", and means
 * what you click matches what you see.
 */
export function resolveHitTestClipPath(mouse = null) {
  return getHitTestShape(mouse) === 'ellipse' ? 'clip-path:ellipse(50% 50%);' : '';
}

export function isFocusable(mouse = null) {
  return mouse?.focusable === true;
}

export function showsFocusOutline(mouse = null) {
  return mouse?.focusOutline === true;
}

/**
 * Tab index for preview/runtime. A focusable control with no explicit index
 * gets 0 (in tab order); a non-focusable one gets -1. An author-set index is
 * honoured either way, so an explicit order survives toggling focusable.
 */
export function resolveTabIndex(mouse = null) {
  const explicit = mouse?.tabIndex;
  if (explicit !== undefined && explicit !== null && Number.isFinite(Number(explicit))) {
    return Math.trunc(Number(explicit));
  }
  return isFocusable(mouse) ? 0 : -1;
}

export function raisesOnClick(mouse = null) {
  return mouse?.bringToFrontOnClick === true;
}

export function getDragMode(mouse = null) {
  const mode = String(mouse?.dragMode ?? 'auto').trim().toLowerCase();
  return DRAG_MODE_OPTIONS.includes(mode) ? mode : 'auto';
}

export function getDragSensitivity(mouse = null) {
  const raw = numberOr(mouse?.dragSensitivity, 1);
  return Math.max(0.01, Math.min(10, raw));
}

/**
 * The drag half of the section, as a partial DragScrubOptions to layer over
 * whatever the control's own geometry produced.
 *
 * Only keys the author actually changed appear in the result. That matters:
 * these are spread over options the surfaces computed from orientation and
 * direction, and a key present with a default value would clobber a
 * deliberate choice made there. `auto` mode plus sensitivity 1 plus no
 * inversion yields `{}`, i.e. exactly the pre-existing behavior.
 *
 * `invertX`/`invertY` are XORed against the resolved values rather than
 * assigned, so "invert" means "flip whatever this control already does" — on a
 * right-to-left slider that reads the way the label promises.
 */
export function mouseScrubOverrides(mouse = null, resolved = {}) {
  if (!mouse) return {};
  const overrides = {};

  const mode = getDragMode(mouse);
  if (mode !== 'auto') {
    const axis = DRAG_MODE_AXIS[mode];
    if (axis) overrides.axis = axis;
    if (mode === 'relative' || mode === 'free' || mode === 'circular') {
      overrides.tracking = 'relative';
    }
    if (mode === 'free') overrides.combine = 'magnitude';
  }

  const sensitivity = getDragSensitivity(mouse);
  if (sensitivity !== 1 && Number.isFinite(Number(resolved?.sensitivity))) {
    overrides.sensitivity = Number(resolved.sensitivity) * sensitivity;
  }

  if (mouse.invertX === true) overrides.invertX = resolved?.invertX !== true;
  if (mouse.invertY === true) overrides.invertY = resolved?.invertY !== true;

  return overrides;
}

/**
 * True when the section carries at least one setting that changes a drag.
 * The surfaces use it to skip rebuilding scrub options for the overwhelming
 * majority of controls, which have never been near the Mouse tab.
 */
export function hasDragOverrides(mouse = null) {
  if (!mouse) return false;
  return getDragMode(mouse) !== 'auto'
    || getDragSensitivity(mouse) !== 1
    || mouse.invertX === true
    || mouse.invertY === true;
}
