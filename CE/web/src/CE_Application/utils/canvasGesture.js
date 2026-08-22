/**
 * The live dimension readout — what the canvas shows WHILE you drag or resize.
 *
 * There was no live geometry anywhere in the editor. The status bar's X/Y/W/H
 * reads the store, and a drag or a resize writes nothing to the store until
 * mouseup, so the one moment you actually want the numbers — while you are
 * placing the thing — was the one moment nothing had any. You dropped it,
 * read the number, and dragged again.
 *
 * WHERE THE NUMBERS COME FROM. The transient values live inside CanvasControl
 * and never leave it, but they are not hidden: the control writes them
 * straight onto its own element every frame as `left/top/width/height` in
 * PANEL UNITS (CanvasControl's root style binding), which is what the eye is
 * already reading. So the HUD reads them back off the element rather than
 * asking for a second copy to be published and kept in step — one source of
 * truth, and no change needed in a file this could not reach anyway.
 *
 * That does couple this module to CanvasControl's inline style. The coupling
 * is cheap to keep honest (the values are unit-less panel px in a fixed
 * order) and it is checked by tests; the alternative — a store the control
 * writes to on every mousemove — is a second copy of the same number that can
 * silently drift from the one being drawn.
 *
 * Pure apart from the element reads, so it can be tested with plain objects.
 */

const GESTURE_SELECTOR = '.canvas-control';

/** px string ("123px", "12.5px", "") → number, NaN-free. */
function parsePx(value) {
  const n = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * What gesture is a mousedown on `target` about to start, and on which
 * control? Resize handles and rotate zones are rendered INSIDE the control's
 * own element (CanvasControlSelectionOverlay), so one `closest` finds the
 * control for all three; the kind is decided by what was actually grabbed.
 *
 * Returns { kind: 'drag' | 'resize' | 'rotate', element } or null when the
 * press was not on a control at all (bare surface, marquee, ruler…).
 */
export function gestureTargetFor(target) {
  const element = target?.closest?.(GESTURE_SELECTOR);
  if (!element) return null;
  if (target.closest('.resize-handle')) return { kind: 'resize', element };
  if (target.closest('.rotate-zone')) return { kind: 'rotate', element };
  return { kind: 'drag', element };
}

/**
 * The live geometry of the control being gestured, or null if it cannot be
 * read.
 *
 *   x, y, w, h        the control's OWN numbers, in the frame its Transform is
 *                     expressed in — parent-relative for a nested control, so
 *                     the HUD agrees with the properties panel rather than
 *                     inventing a third convention.
 *   panelX, panelY,   where the box is drawn, in panel units, for positioning
 *   panelW, panelH    the HUD itself. Measured, so it survives nesting.
 */
export function readGestureGeometry(element, surfaceEl, scale = 1) {
  if (!element || !surfaceEl) return null;
  const s = scale || 1;
  const x = parsePx(element.style?.left);
  const y = parsePx(element.style?.top);
  const w = parsePx(element.style?.width);
  const h = parsePx(element.style?.height);
  if (x === null || y === null || w === null || h === null) return null;

  const box = element.getBoundingClientRect?.();
  const surface = surfaceEl.getBoundingClientRect?.();
  if (!box || !surface) return null;

  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    panelX: (box.left - surface.left) / s,
    panelY: (box.top - surface.top) / s,
    panelW: box.width / s,
    panelH: box.height / s,
  };
}

/**
 * The HUD's fields. A resize is about size and a move is about position, but
 * both change the box, so both show all four — the review's complaint was the
 * absence of "live X/Y/W/H", not of one half of it. Order matches the
 * properties panel and the status bar.
 */
export function gestureHudParts(geometry) {
  if (!geometry) return [];
  return [
    { label: 'X', value: geometry.x },
    { label: 'Y', value: geometry.y },
    { label: 'W', value: geometry.w },
    { label: 'H', value: geometry.h },
  ];
}

/**
 * Abandon the drag or resize in flight: put the pointer back where the
 * gesture began and release it.
 *
 * Escape cancelling a drag is table stakes and the editor had no route to it
 * at all — the Escape branch in editorShortcuts.js is gated behind a selection
 * check and only ever deselects. The transient position lives inside
 * CanvasControl and there is no cancel entry point to call, so the gesture is
 * ended the only way it knows how to end. The control recomputes a zero delta,
 * commits nothing (`moved` is false for a drag; an identical resize patch is
 * deduplicated by the history's sameSnapshot check) and tears its own state
 * down. That is a real cancel, not a visual one.
 *
 * `win` is injected rather than reached for so this can be tested, and the
 * MouseEvent constructor comes off it for the same reason.
 *
 * A `cancelGesture()` on CanvasControl would be tidier still, and would also
 * undo an alignment snap that happened to nudge the start position by a unit
 * on the way back. This reaches across a file boundary instead of standing up
 * a second drag state machine that could disagree with the first.
 */
export function rewindGesture(win, start) {
  if (!win || !start || typeof win.MouseEvent !== 'function') return false;
  const at = { clientX: start.x, clientY: start.y, bubbles: true, cancelable: true, button: 0, view: win };
  win.dispatchEvent(new win.MouseEvent('mousemove', at));
  win.dispatchEvent(new win.MouseEvent('mouseup', at));
  return true;
}
