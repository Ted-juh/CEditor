/**
 * The arithmetic behind the component tree's windowed list, and the small decisions that go with
 * it. All of it is pure: ComponentTree.svelte owns the DOM and the stores, this owns the maths,
 * and the maths is the part that has to be right when the panel has 413 controls in it.
 *
 * Why any of this exists: the tree used to render one row per control with no windowing. The GAIA
 * panel mounts 413 rows and ~1,200 inline icons, and every write to the panel store re-walked the
 * whole control tree and rebuilt every row — sixty times a second while a control is being dragged
 * on the canvas, for a drag that changed one x/y pair and no part of the tree at all.
 */

import { getChildControls, isContainerControl } from './containment.js';
import { getControlId, getControlLayer, getControlZIndex } from './controlOrder.js';

/** Row height in CSS pixels. `.tree-item` is pinned to this — the window maths cannot measure. */
export const TREE_ROW_HEIGHT = 32;

/**
 * Rows rendered beyond each edge of the viewport. Three is enough that a wheel flick never shows
 * a blank band before the next frame lands, and small enough that a 413-row panel still mounts
 * ~25 rows instead of 413.
 */
export const TREE_OVERSCAN = 3;

/**
 * The slice of rows to actually render, plus the spacer heights that keep the scrollbar honest.
 *
 * `end` is exclusive. A zero or unknown viewport height (the first frame, before the element has
 * been measured) must still render something, or the list is empty until a scroll event arrives
 * that will never come — so an unmeasured viewport falls back to a screenful.
 */
export function treeWindow({ scrollTop = 0, viewportHeight = 0, rowCount = 0, rowHeight = TREE_ROW_HEIGHT, overscan = TREE_OVERSCAN }) {
  const count = Math.max(0, Math.floor(rowCount));
  if (count === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };

  const height = viewportHeight > 0 ? viewportHeight : rowHeight * 20;
  const top = Math.max(0, scrollTop);

  const first = Math.max(0, Math.floor(top / rowHeight) - overscan);
  const visible = Math.ceil(height / rowHeight) + overscan * 2 + 1;
  const last = Math.min(count, first + visible);

  return {
    start: first,
    end: last,
    padTop: first * rowHeight,
    padBottom: Math.max(0, (count - last) * rowHeight),
  };
}

/**
 * The scrollTop that brings a row into view with `block: 'nearest'` semantics — already-visible
 * rows do not move, a row above the fold comes to the top, a row below comes to the bottom.
 *
 * The tree used to do this with `scrollIntoView` on the row element. Windowing removes that
 * option: the row a canvas selection wants revealed is usually not mounted, so there is no element
 * to call it on. Index arithmetic works whether the row is on screen or four hundred rows away.
 */
export function scrollTopForRow({ index, scrollTop = 0, viewportHeight = 0, rowHeight = TREE_ROW_HEIGHT, rowCount = 0 }) {
  if (!(index >= 0) || rowCount <= 0) return scrollTop;

  const rowTop = index * rowHeight;
  const rowBottom = rowTop + rowHeight;
  if (rowTop < scrollTop) return rowTop;
  if (viewportHeight > 0 && rowBottom > scrollTop + viewportHeight) return rowBottom - viewportHeight;
  return scrollTop;
}

/** Distance from an edge, in pixels, inside which a drag starts scrolling the list. */
export const DRAG_SCROLL_ZONE = 28;

/** Fastest auto-scroll, in pixels per animation frame — roughly 1,000 px/s at 60fps. */
export const DRAG_SCROLL_MAX_SPEED = 16;

/**
 * Pixels to scroll this frame while a row is being dragged near an edge of the list. Negative
 * scrolls up. Zero in the middle, ramping linearly to full speed at the edge, so a drag that is
 * merely *near* the edge creeps and one pinned against it moves.
 *
 * Without this a reparent from row 400 to row 1 is impossible: the drag holds the pointer captive,
 * the wheel does not reach the list, and the only scroll call in the whole component was the
 * selection reveal.
 */
export function dragAutoScrollStep({ pointerY, top, bottom, zone = DRAG_SCROLL_ZONE, maxSpeed = DRAG_SCROLL_MAX_SPEED }) {
  if (!(bottom > top) || !(zone > 0)) return 0;

  const usableZone = Math.min(zone, (bottom - top) / 2);
  const fromTop = pointerY - top;
  const fromBottom = bottom - pointerY;

  if (fromTop < usableZone) {
    const strength = Math.min(1, Math.max(0, (usableZone - fromTop) / usableZone));
    return -Math.ceil(strength * maxSpeed);
  }
  if (fromBottom < usableZone) {
    const strength = Math.min(1, Math.max(0, (usableZone - fromBottom) / usableZone));
    return Math.ceil(strength * maxSpeed);
  }
  return 0;
}

/**
 * Does the type badge tell the reader anything the name has not already told them?
 *
 * The badge prints `MomentaryButton` next to a default name of `MomentaryButton_12`, in a 200px
 * panel — half the width spent repeating the other half. It earns its place only when the name
 * has stopped carrying the type, which is the moment the author renames the control to something
 * of their own. Default names (`Type`, `Type_12`, `Type 12`, `Type-12`) are the type; anything
 * else is not.
 */
export function typeBadgeAddsInformation(name, controlType) {
  const type = String(controlType ?? '').trim();
  if (!type) return false;
  const label = String(name ?? '').trim();
  if (!label) return true;
  return !new RegExp(`^${escapeRegExp(type)}([ _-]?\\d+)?$`, 'i').test(label);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A signature of everything the tree DRAWS, in the order it draws it.
 *
 * This is the answer to "does a canvas drag re-walk the tree". It does not: a drag writes
 * Transform.x/y, which appears nowhere below, so the signature is unchanged and the cached row
 * array is handed back by identity — the `$derived` sees the same value, the keyed `{#each}` is
 * never touched, and the tree costs one cheap pass instead of a sort per sibling list plus 413
 * row objects plus 413 reaction-graph writes.
 *
 * The per-control half is memoised on the control object, which is immutable in this codebase (an
 * edit replaces the control), so an unchanged control costs a WeakMap hit and the one control the
 * drag actually moved costs a string build.
 *
 * Anything a row displays or is positioned by MUST be in here. Add a column to the row and add it
 * here in the same edit, or the tree will show a stale value for as long as nothing else changes.
 */
const fingerprintCache = new WeakMap();

function controlFingerprint(control) {
  const cached = fingerprintCache.get(control);
  if (cached !== undefined) return cached;

  const core = control?._children?.Core ?? null;
  const fingerprint = [
    getControlId(control),
    core?.name ?? '',
    core?.controlType ?? '',
    getControlZIndex(control),
    getControlLayer(control),
    core?.visible === false ? '0' : '1',
    core?.locked === true ? '1' : '0',
    // Joined on a separator no name can contain, so {name:'a', type:'b'} and {name:'ab', type:''}
    // do not fingerprint the same.
  ].join('\u0001');

  fingerprintCache.set(control, fingerprint);
  return fingerprint;
}

export function controlTreeSignature(controls) {
  const parts = [];
  const visit = (list) => {
    for (const control of list ?? []) {
      parts.push(controlFingerprint(control));
      if (isContainerControl(control)) {
        parts.push('(');
        visit(getChildControls(control));
        parts.push(')');
      }
    }
    parts.push('|');
  };
  visit(controls);
  return parts.join('\u0002');
}

/**
 * Where an arrow key moves in a tree, expressed over the flat row list the tree already has.
 *
 * `rows` are the visible rows in display order, each `{ id, depth, container }`; `expanded` says
 * whether a container row is showing its children. Returns one of
 *   { type: 'move', index }      — focus this row
 *   { type: 'expand', id }       — open this container, focus stays put
 *   { type: 'collapse', id }     — close this container, focus stays put
 *   null                         — the key does nothing here
 *
 * This is the WAI-ARIA tree pattern, including the two-step behaviour of Left/Right on containers
 * (open, then step in / close, then step out to the parent), which is the part everyone gets
 * wrong when they wire arrows straight to index±1.
 */
export function treeArrowTarget({ rows, index, key, expanded = () => true }) {
  const count = rows?.length ?? 0;
  if (count === 0) return null;
  const current = index >= 0 && index < count ? index : -1;

  switch (key) {
    case 'ArrowDown':
      return { type: 'move', index: Math.min(count - 1, current + 1) };
    case 'ArrowUp':
      return current <= 0 ? { type: 'move', index: 0 } : { type: 'move', index: current - 1 };
    case 'Home':
      return { type: 'move', index: 0 };
    case 'End':
      return { type: 'move', index: count - 1 };
    case 'ArrowRight': {
      if (current < 0) return { type: 'move', index: 0 };
      const row = rows[current];
      if (row.container && !expanded(row.id)) return { type: 'expand', id: row.id };
      if (current + 1 < count && rows[current + 1].depth > row.depth) return { type: 'move', index: current + 1 };
      return null;
    }
    case 'ArrowLeft': {
      if (current < 0) return { type: 'move', index: 0 };
      const row = rows[current];
      if (row.container && expanded(row.id)) return { type: 'collapse', id: row.id };
      for (let i = current - 1; i >= 0; i--) {
        if (rows[i].depth < row.depth) return { type: 'move', index: i };
      }
      return null;
    }
    default:
      return null;
  }
}
