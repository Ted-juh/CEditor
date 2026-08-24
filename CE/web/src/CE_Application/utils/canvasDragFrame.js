/**
 * The coordinate frame a control snaps, measures and multi-drags in.
 *
 * A nested control's `Transform.x/y` is PARENT-RELATIVE — measured from its container's content
 * origin, not from the panel's top-left. CanvasControl used to hand every descendant the panel's
 * TOP-LEVEL control list and the panel's own size, so a child inside a container compared its
 * parent-relative rect against panel-space rects. Three things came out of that, all visible:
 * it snapped to positions that had nothing to do with where the guide was drawn, the distance
 * labels were arithmetic between two different coordinate systems, and a co-selected SIBLING was
 * not in the top-level list at all — it followed the drag on screen and snapped back on mouseup,
 * because nothing ever patched it.
 *
 * The fix is a frame, not a conversion. Each control is given the controls that share its frame
 * (its siblings) and the bounds of that frame (its container's content box, or the panel itself
 * at top level), and does all of its rect math there. Panel space is re-entered exactly once, at
 * the boundary where results are DRAWN — `toPanelGuides` / `toPanelDistances` — because the
 * selection overlay and the rulers both draw in panel space. The alternative, lifting the dragged
 * rect into panel space on every mousemove, would have had to lift every sibling with it sixty
 * times a second and convert the snapped answer back before writing it.
 *
 * Everything here is pure — no Svelte, no stores — and everything rests on one property: frames
 * differ from each other only by a TRANSLATION. Nesting never scales a child's coordinates. That
 * is why a drag delta is frame-independent, and why `multiDragPatches` can apply one dx/dy to
 * controls living in three different containers and be right about all of them.
 */

import { buildControlIndex, selectionRoots } from './containment.js';

/** Origin normaliser: a missing/partial offset behaves as the panel origin. */
function originOf(parentOffset) {
  return { x: Number(parentOffset?.x) || 0, y: Number(parentOffset?.y) || 0 };
}

/**
 * Ruler guides expressed in this control's frame.
 *
 * Guides are stored in panel space (they are drawn on the panel rulers), so a nested control had
 * to be handed them shifted by its frame origin or it would snap to a line drawn somewhere else
 * entirely. At top level the origin is 0,0 and the input object is returned untouched, which keeps
 * the store's identity stable for the derived that reads it.
 */
export function framedGuides(rulerGuides, parentOffset) {
  const origin = originOf(parentOffset);
  if (origin.x === 0 && origin.y === 0) return rulerGuides;
  return {
    horizontal: (rulerGuides?.horizontal ?? []).map((pos) => pos - origin.y),
    vertical: (rulerGuides?.vertical ?? []).map((pos) => pos - origin.x),
  };
}

/** Frame-space snap guides ({ type, pos, center }) back into panel space, for the overlay/rulers. */
export function toPanelGuides(guides, parentOffset) {
  const origin = originOf(parentOffset);
  if (origin.x === 0 && origin.y === 0) return guides ?? [];
  return (guides ?? []).map((guide) => ({
    ...guide,
    pos: guide.pos + (guide.type === 'vertical' ? origin.x : origin.y),
  }));
}

/** Frame-space distance labels back into panel space. Only the anchor point moves; gaps are lengths. */
export function toPanelDistances(labels, parentOffset) {
  const origin = originOf(parentOffset);
  if (origin.x === 0 && origin.y === 0) return labels ?? [];
  return (labels ?? []).map((label) => ({ ...label, x: label.x + origin.x, y: label.y + origin.y }));
}

/**
 * True when one of this control's own ancestors is in the selection.
 *
 * Ctrl+A selects containers together with everything inside them, and a container carries its
 * children: it translates, and the DOM nesting takes them along for free. A child that ALSO
 * applied the broadcast multi-drag delta therefore moved twice — the Ctrl+A-then-drag bug where
 * every nested control slid out of its container by exactly the distance the container moved.
 *
 * `parentChainIds` is already threaded through CanvasControl for the drop-target work, so the
 * answer costs a walk of the chain rather than a walk of the tree.
 */
export function hasSelectedAncestor(parentChainIds, selectedIds) {
  if (!selectedIds || !parentChainIds?.length) return false;
  return parentChainIds.some((id) => id != null && selectedIds.has(id));
}

/**
 * The patch set a finished drag should commit: `Map<id, { 'Transform.x', 'Transform.y' }>`.
 *
 *   tree                — the panel's control TREE (nested included), for root/transform lookups
 *   selectedIds         — the live selection
 *   draggedId           — the control the pointer had hold of
 *   draggedAncestorIds  — its ancestor chain (CanvasControl's `parentChainIds`)
 *   dx, dy              — how far the gesture moved, in the dragged control's frame
 *   draggedX, draggedY  — the dragged control's final SNAPPED position, in its own frame
 *   multi               — whether this was a multi-selection drag
 *
 * Two rules, and the whole of A5's third consequence and A12(a) fall out of them:
 *
 *   1. The controls that move under their own power are the selection ROOTS — selected controls
 *      with no selected ancestor. Walking a flat top-level list instead missed every nested
 *      sibling; walking the whole selection instead moved carried children a second time.
 *   2. The dragged control commits its snapped position rather than start+delta, unless it is
 *      itself carried by a selected ancestor — then the ancestor's patch already accounts for it
 *      and writing one here would double the move on commit exactly as the broadcast doubled it
 *      on screen.
 */
export function multiDragPatches({
  tree = [],
  selectedIds = new Set(),
  draggedId = null,
  draggedAncestorIds = [],
  dx = 0,
  dy = 0,
  draggedX = 0,
  draggedY = 0,
  multi = false,
  getSection,
}) {
  const patches = new Map();
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds ?? []);
  const carried = multi && hasSelectedAncestor(draggedAncestorIds, ids);

  if (multi) {
    const index = buildControlIndex(tree ?? []);
    for (const rootId of selectionRoots(tree ?? [], ids)) {
      // The dragged control is handled below, from its snapped position rather than start+delta.
      if (rootId == null || rootId === draggedId) continue;
      const transform = getSection(index.get(rootId)?.control, 'Transform');
      if (!transform) continue;
      patches.set(rootId, {
        'Transform.x': (transform.x ?? 0) + dx,
        'Transform.y': (transform.y ?? 0) + dy,
      });
    }
  }

  if (draggedId != null && !carried) {
    patches.set(draggedId, {
      ...(patches.get(draggedId) ?? {}),
      'Transform.x': draggedX,
      'Transform.y': draggedY,
    });
  }

  return patches;
}
