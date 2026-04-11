/**
 * Canvas interaction controllers.
 *
 * Each controller manages its own private state and mutates an external
 * `state` proxy (typically a component's `$state`) so reactivity lives in
 * the consumer. The controller itself has no Svelte dependency.
 */

// -----------------------------------------------------------------------------
// Pan controller
// -----------------------------------------------------------------------------
/**
 * Creates a pan controller. The caller supplies a reactive state object with
 * `isPanning` and `spaceHeld` fields that the controller will mutate.
 *
 *   state        — { isPanning: false, spaceHeld: false }
 *   getViewport  — () => HTMLElement | null
 *   onRightClick — (screenX, screenY) => void  (called on no-drag right-click)
 */
export function createPanController(state, { getViewport, onRightClick }) {
  let panStart = { x: 0, y: 0, scrollX: 0, scrollY: 0 };
  let panDidMove = false;
  let panButton = -1;

  function startPan(e) {
    const el = getViewport();
    if (!el) return;
    state.isPanning = true;
    panDidMove = false;
    panButton = e.button;
    panStart = { x: e.clientX, y: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }

  function onMove(e) {
    const el = getViewport();
    if (!state.isPanning || !el) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panDidMove = true;
    el.scrollLeft = panStart.scrollX - dx;
    el.scrollTop = panStart.scrollY - dy;
  }

  function onEnd(e) {
    const wasRight = panButton === 2;
    const didMove = panDidMove;
    state.isPanning = false;
    panButton = -1;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onEnd);
    // Right-click with no drag → show context menu
    if (wasRight && !didMove && e) onRightClick?.(e.clientX, e.clientY);
  }

  function handleMouseDown(e) {
    if (e.button === 1) { e.preventDefault(); startPan(e); return true; }
    if (e.button === 2) { startPan(e); return true; }
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
 *   onSelect    — (rect) => void            (called on mouseup if rect is meaningful)
 *
 * Returns { handleMouseDown, getRect } — `getRect` always returns the current
 * normalized rect in panel coordinates.
 */
export function createMarqueeController(state, { getSurface, getScale, isBlocked, onSelect }) {
  function getRect() {
    const x1 = Math.min(state.start.x, state.end.x);
    const y1 = Math.min(state.start.y, state.end.y);
    const x2 = Math.max(state.start.x, state.end.x);
    const y2 = Math.max(state.start.y, state.end.y);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function handleMouseDown(e) {
    if (e.button !== 0 || isBlocked?.()) return;
    const el = getSurface();
    if (!el) return;
    // Only start marquee on the surface itself, not on controls
    if (e.target !== el && !e.target.classList.contains('grid-overlay') && !e.target.classList.contains('bg-layer')) return;

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

  function onEnd() {
    if (!state.isActive) return;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onEnd);
    state.isActive = false;
    onSelect?.(getRect());

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
 * nothing selected / no transform data.
 */
export function computeSelectionBounds(panel, ids) {
  if (!panel || !ids || ids.size === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ctrl of panel.controls) {
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
 * Compute { zoom, scrollLeft, scrollTop } to zoom-and-center the given
 * selection bounds inside the viewport. Returns null if inputs are invalid.
 * The 40px offset matches the zoom-container padding in EditorCanvas.
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
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return {
    zoom,
    scrollLeft: cx * newScale + 40 - viewportEl.clientWidth / 2,
    scrollTop:  cy * newScale + 40 - viewportEl.clientHeight / 2,
  };
}

/**
 * Compute the result of a ctrl+wheel zoom that keeps the cursor position
 * stable. Returns { zoom, scrollLeft, scrollTop } or null if no change.
 */
export function computeWheelZoom(viewportEl, e, currentZoom, step = 10) {
  if (!viewportEl) return null;
  const rect = viewportEl.getBoundingClientRect();
  const mx = e.clientX - rect.left + viewportEl.scrollLeft;
  const my = e.clientY - rect.top + viewportEl.scrollTop;
  const delta = e.deltaY < 0 ? step : -step;
  const newZoom = clampZoom(currentZoom + delta);
  if (newZoom === currentZoom) return null;
  const ratio = newZoom / currentZoom;
  return {
    zoom: newZoom,
    scrollLeft: mx * ratio - (e.clientX - rect.left),
    scrollTop:  my * ratio - (e.clientY - rect.top),
  };
}
