/**
 * Canvas interaction controllers.
 *
 * Each controller manages its own private state and mutates an external
 * `state` proxy (typically a component's `$state`) so reactivity lives in
 * the consumer. The controller itself has no Svelte dependency.
 */

import { flatControlsWithPanelRects } from './containment.js';

// -----------------------------------------------------------------------------
// Pan controller
// -----------------------------------------------------------------------------
/**
 * Creates a pan controller. The caller supplies a reactive state object with
 * `isPanning` and `spaceHeld` fields that the controller will mutate.
 *
 *   state        — { isPanning: false, spaceHeld: false }
 *   getViewport  — () => HTMLElement | null
 *
 * THE RIGHT BUTTON DOES NOT PAN. It used to, and it cost the menu: the pan
 * ended by deciding whether the press had been a click or a drag, and more
 * than two pixels of travel meant "drag", meaning no context menu. The native
 * menu is suppressed on the canvas, so a right-click with a shaky hand — the
 * ordinary case on a trackpad, or on any mouse held while talking — produced
 * no menu at all, from either source. There is no threshold that fixes that,
 * because the two gestures share a button and the wrong guess is silent.
 *
 * So the button was given back its one conventional job. Panning already has
 * two bindings that nothing else wants (middle-drag and Space+drag), the menu
 * now opens from the browser's own `contextmenu` event, which fires whether
 * or not the pointer moved, and right-drag does nothing.
 */
export function createPanController(state, { getViewport }) {
  let panStart = { x: 0, y: 0, scrollX: 0, scrollY: 0 };

  function startPan(e) {
    const el = getViewport();
    if (!el) return;
    state.isPanning = true;
    panStart = { x: e.clientX, y: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }

  function onMove(e) {
    const el = getViewport();
    if (!state.isPanning || !el) return;
    el.scrollLeft = panStart.scrollX - (e.clientX - panStart.x);
    el.scrollTop = panStart.scrollY - (e.clientY - panStart.y);
  }

  function onEnd() {
    state.isPanning = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onEnd);
  }

  function handleMouseDown(e) {
    if (e.button === 1) { e.preventDefault(); startPan(e); return true; }
    if (e.button === 0 && state.spaceHeld) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e);
      return true;
    }
    return false;
  }

  function handleKeyDown(e) {
    if (e.key === ' ' && !e.repeat && !e.target.closest('input, textarea')) {
      state.spaceHeld = true;
    }
  }

  function handleKeyUp(e) {
    if (e.key === ' ') {
      state.spaceHeld = false;
      if (state.isPanning) onEnd();
    }
  }

  return { handleMouseDown, handleKeyDown, handleKeyUp };
}

// -----------------------------------------------------------------------------
// Marquee controller
// -----------------------------------------------------------------------------
/**
 * Creates a marquee-selection controller.
 *
 *   state       — { isActive: false, start: {x,y}, end: {x,y} }
 *   getSurface  — () => HTMLElement | null  (panel surface for coordinate math)
 *   getScale    — () => number              (zoom scale to divide by)
 *   isBlocked   — () => boolean             (e.g. "is space held? don't start")
 *   onSelect    — (rect, mouseUpEvent, info) => void  (called on mouseup)
 *   alsoStartsOn — (target) => boolean, an extra "yes, start here" the
 *                  consumer supplies for cases only it can judge. The editor
 *                  uses it for the body of a container the user has drilled
 *                  into: inside a group, dragging over its empty space is a
 *                  rubber band over its children, not a drag of the group.
 *
 * `info` carries { onLocked } — see startsMarquee. Returns
 * { handleMouseDown, getRect }; `getRect` always returns the current
 * normalized rect in panel coordinates.
 */

/**
 * Is this mousedown target something a rubber band may start on?
 *
 * The surface itself and its two full-bleed decorations obviously are. A
 * LOCKED CONTROL is the interesting case: it used to be an absolute wall,
 * because it is a real element that takes the press and its own mousedown
 * calls stopPropagation, so the surface below never heard about it. Locking a
 * background plate — the single most common thing anyone locks — therefore
 * removed the ability to rubber-band across most of the panel, which is the
 * opposite of what locking is for. Locked means "not a target", so the press
 * belongs to the marquee.
 *
 * A control locked on its own is now click-through in CSS
 * (CanvasControl's .lock-click-through), which makes `e.target` the surface
 * and never reaches this branch at all. It still matters for the case that
 * rule deliberately leaves alone: a locked PANEL, where every control keeps
 * its pointer events so the canvas does not go inert. Marquee-selecting on a
 * locked panel is legitimate — selection is not mutation.
 */
export function startsMarquee(target, surface) {
  if (!target) return false;
  if (target === surface) return true;
  if (target.classList?.contains?.('grid-overlay') || target.classList?.contains?.('bg-layer')) return true;
  return !!target.closest?.('.canvas-control.locked');
}

export function createMarqueeController(state, { getSurface, getScale, isBlocked, onSelect, alsoStartsOn = null }) {
  // Whether the gesture began on top of a locked control rather than on bare
  // surface. The consumer needs to know: a click-sized marquee normally means
  // "deselect", but a press on a control has already selected something by the
  // time we get here, and clearing that would make locked controls unclickable.
  let onLocked = false;

  function getRect() {
    const x1 = Math.min(state.start.x, state.end.x);
    const y1 = Math.min(state.start.y, state.end.y);
    const x2 = Math.max(state.start.x, state.end.x);
    const y2 = Math.max(state.start.y, state.end.y);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function handleMouseDown(e) {
    if (e.button !== 0 || isBlocked?.()) return;
    // The locked-control route registers this handler in the CAPTURE phase as
    // well (the control's own mousedown would otherwise stop it reaching the
    // surface), so the same press can arrive twice. First one wins.
    if (state.isActive) return;
    const el = getSurface();
    if (!el) return;
    if (!startsMarquee(e.target, el) && !alsoStartsOn?.(e.target)) return;
    onLocked = e.target !== el && !!e.target.closest?.('.canvas-control.locked');

    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const scale = getScale();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    state.isActive = true;
    state.start = { x, y };
    state.end = { x, y };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }

  function onMove(e) {
    if (!state.isActive) return;
    const el = getSurface();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = getScale();
    state.end = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }

  function onEnd(e) {
    if (!state.isActive) return;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onEnd);
    state.isActive = false;
    // The mouseup event rides along so the consumer can read modifiers
    // (Shift+marquee extends the selection instead of replacing it).
    onSelect?.(getRect(), e, { onLocked });
    onLocked = false;

    // Swallow the click that follows mouseup so canvas-click handlers don't
    // immediately clear the selection we just made.
    window.addEventListener('click', (ev) => {
      if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
        ev.stopPropagation(); ev.preventDefault();
      }
    }, { once: true, capture: true });
  }

  return { handleMouseDown, getRect };
}

// -----------------------------------------------------------------------------
// Zoom math
// -----------------------------------------------------------------------------
const ZOOM_MIN = 10;
const ZOOM_MAX = 400;
const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/**
 * Compute the zoom % that fits the panel inside the viewport with `padding`
 * pixels of reserved margin on each side. Returns null if inputs are invalid.
 */
export function computeFitZoom(panel, viewportEl, padding = 80) {
  if (!panel || !viewportEl) return null;
  const availW = viewportEl.clientWidth - padding;
  const availH = viewportEl.clientHeight - padding;
  const scaleW = availW / panel.width;
  const scaleH = availH / panel.height;
  return clampZoom(Math.round(Math.min(scaleW, scaleH) * 100));
}

/**
 * Compute AABB of the selected controls in panel coordinates, or null if
 * nothing selected / no transform data. Tree-aware: nested controls count
 * at their panel-space position.
 */
export function computeSelectionBounds(panel, ids) {
  if (!panel || !ids || ids.size === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ctrl of flatControlsWithPanelRects(panel.controls)) {
    if (!ids.has(ctrl._children?.Core?.id)) continue;
    const t = ctrl._children?.Transform;
    if (!t) continue;
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + t.width);
    maxY = Math.max(maxY, t.y + t.height);
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Compute the panel-surface offset within the viewport's scroll content for
 * a given panel size and zoom. Mirrors the flex centering in EditorCanvas:
 * the panel is centered when smaller than the viewport, otherwise sits at
 * the 40px padding edge.
 */
function contentOffsets(panel, viewportEl, scale) {
  const left = Math.max(40, (viewportEl.clientWidth - panel.width * scale) / 2);
  const top  = Math.max(40, (viewportEl.clientHeight - panel.height * scale) / 2);
  return { left, top };
}

/**
 * Compute { zoom, scrollLeft, scrollTop } to zoom-and-center the given
 * selection bounds inside the viewport. Returns null if inputs are invalid.
 */
export function computeZoomToSelection(panel, viewportEl, ids, padding = 60) {
  if (!panel || !viewportEl) return null;
  const b = computeSelectionBounds(panel, ids);
  if (!b) return null;

  const selW = b.maxX - b.minX;
  const selH = b.maxY - b.minY;
  const availW = viewportEl.clientWidth - padding * 2;
  const availH = viewportEl.clientHeight - padding * 2;
  const zoom = clampZoom(Math.round(Math.min(availW / selW, availH / selH) * 100));
  const newScale = zoom / 100;
  const { left, top } = contentOffsets(panel, viewportEl, newScale);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return {
    zoom,
    scrollLeft: cx * newScale + left - viewportEl.clientWidth / 2,
    scrollTop:  cy * newScale + top  - viewportEl.clientHeight / 2,
  };
}

/**
 * Compute a zoom to `targetZoom` that keeps the viewport point
 * (anchorVpX, anchorVpY) visually stable — the shared math behind wheel zoom
 * (anchor = cursor) and button/keyboard zoom (anchor = viewport centre, so
 * the view no longer drifts toward the top-left corner on every step).
 * Returns { zoom, scrollLeft, scrollTop } or null if no change.
 */
export function computeAnchoredZoom(viewportEl, currentZoom, panel, targetZoom, anchorVpX, anchorVpY, baseView = null) {
  if (!viewportEl || !panel) return null;
  const effectiveZoom = baseView?.zoom ?? currentZoom;
  const effectiveScrollLeft = baseView?.scrollLeft ?? viewportEl.scrollLeft;
  const effectiveScrollTop = baseView?.scrollTop ?? viewportEl.scrollTop;
  const oldScale = effectiveZoom / 100;
  const oldOff = contentOffsets(panel, viewportEl, oldScale);

  // Anchor in panel coordinates
  const panelX = (anchorVpX + effectiveScrollLeft - oldOff.left) / oldScale;
  const panelY = (anchorVpY + effectiveScrollTop - oldOff.top) / oldScale;

  const newZoom = clampZoom(Math.round(targetZoom));
  if (newZoom === effectiveZoom) return null;
  const newScale = newZoom / 100;
  const newOff = contentOffsets(panel, viewportEl, newScale);

  return {
    zoom: newZoom,
    scrollLeft: panelX * newScale + newOff.left - anchorVpX,
    scrollTop: panelY * newScale + newOff.top - anchorVpY,
  };
}

/**
 * The next zoom a button/keyboard step should land on.
 *
 * MULTIPLICATIVE, like the wheel. The old step was `zoom + increment`, and an
 * additive step over a range that spans 40× is two different gestures wearing
 * one name: +10 at the bottom doubled the view (10%→20%), +10 at the top moved
 * it by a fortieth (390%→400%). Zoom is perceived in ratios, so the step is
 * one — every press changes the view by the same proportion wherever you are.
 *
 * WHAT THE INCREMENT SETTING NOW MEANS. It is read as a PERCENTAGE OF THE
 * CURRENT ZOOM rather than a number of percentage points: the default 10 is
 * ×1.1 per press, exactly the wheel's factor, and at 100% it still lands on
 * 110% so the setting reads the same as it always did at the zoom people
 * mostly sit at. That coincidence is the reason for choosing this reading over
 * a stop-ladder — nobody's configured value silently becomes something else.
 *
 * TIDY LANDINGS. A raw ratio produces 121%, 133%, 146%. Zoom levels are read
 * aloud and typed into the zoom box, so the result is rounded to a granularity
 * that grows with the number: 1 below 20%, 5 below 100%, 10 below 200%, 25
 * above. Rounding can collide with where we started (22.7 → 25 → the button
 * does nothing) or even overshoot backwards, so the last step forces a move of
 * at least one granularity unit in the requested direction. A zoom button that
 * sometimes does nothing is worse than one that is slightly uneven.
 */
export function tidyZoomStep(base, direction, incrementPercent = 10) {
  const from = Number(base) || 0;
  const pct = Math.max(1, Number(incrementPercent) || 10);
  const factor = 1 + pct / 100;
  const raw = direction > 0 ? from * factor : from / factor;

  const grain = (z) => (z < 20 ? 1 : z < 100 ? 5 : z < 200 ? 10 : 25);
  const g = grain(raw);
  let next = Math.round(raw / g) * g;
  if (direction > 0 && next <= from) next = from + grain(from);
  if (direction < 0 && next >= from) next = from - grain(from);
  return clampZoom(next);
}

/**
 * Compute the result of a wheel zoom that targets the hovered panel point.
 * Multiplicative steps (default ×1.1): 10%→11% and 300%→330% feel the same,
 * where the old additive ±10 doubled the scale at the bottom of the range and
 * barely moved it at the top.
 */
export function computeWheelZoom(viewportEl, e, currentZoom, panel, factor = 1.1, baseView = null) {
  if (!viewportEl || !panel) return null;
  const rect = viewportEl.getBoundingClientRect();
  const effectiveZoom = baseView?.zoom ?? currentZoom;
  const targetZoom = e.deltaY < 0 ? effectiveZoom * factor : effectiveZoom / factor;
  return computeAnchoredZoom(
    viewportEl, currentZoom, panel, targetZoom,
    e.clientX - rect.left, e.clientY - rect.top, baseView,
  );
}
