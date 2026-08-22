<script>
  /**
   * The multi-selection bounding box: one dashed box with 8 handles around
   * the whole selection, replacing the per-control handle sets (15 selected
   * controls used to render 120 handles and no group bounds at all).
   *
   * Dragging a handle scales every selection root proportionally around the
   * box — positions and sizes both — and scales the local geometry of a
   * selected container's descendants so the group resizes as one object.
   * Holding Alt resizes about the box centre instead of the opposite corner.
   *
   * Dragging a corner ROTATE ZONE turns the whole selection about the box
   * centre: every member's own rotation advances by the gesture's delta and
   * its position orbits that centre (see computeOrbitedTransform). Shift
   * snaps the turn to 15°. Rotation used to be a single-control affordance
   * only — CanvasControl suppresses its own handles and rotate zones for a
   * multi-selection, so before this a multi-selection could not be rotated at
   * all, by any gesture.
   *
   * Writes go to the store live for feedback; one snapshot is pushed at the
   * gesture boundary so the whole resize (or rotation) is a single undo step.
   */
  import { selectedComponentIds, multiDragDelta } from '../stores/panels.js';
  import { applyControlPatchesById } from '../stores/controls.js';
  import { pushSnapshot } from '../stores/history.js';
  import { groupRotationPatches } from '../utils/groupTransform.js';
  import {
    angleFromCenter,
    clientToPanelPoint,
    computeResizedRect,
    computeRotation,
    normalizeRotation,
    resizeHandleStyle,
    rotatedRectBounds,
  } from '../utils/transformMath.js';
  import {
    findControlById,
    flatControlsWithPanelRects,
    getChildControls,
    selectionRoots,
    walkControls,
  } from '../utils/containment.js';

  let { panel, scale = 1, panelLocked = false } = $props();

  const handles = [
    { id: 'tl', cursor: 'nwse-resize' },
    { id: 't',  cursor: 'ns-resize' },
    { id: 'tr', cursor: 'nesw-resize' },
    { id: 'l',  cursor: 'ew-resize' },
    { id: 'r',  cursor: 'ew-resize' },
    { id: 'bl', cursor: 'nesw-resize' },
    { id: 'b',  cursor: 'ns-resize' },
    { id: 'br', cursor: 'nwse-resize' },
  ];

  // The four corners carry a rotate zone, sitting just outside the box —
  // same arrangement (and same 16px/-18px geometry) as the per-control
  // overlay, so the gesture is in the place the hand already knows.
  const rotateCorners = ['tl', 'tr', 'bl', 'br'];

  let active = $derived(!panelLocked && $selectedComponentIds.size > 1);

  let isResizing = $state(false);
  let isRotating = $state(false);
  let rotateDelta = $state(0);
  let transientBounds = $state(null);
  let startBounds = null;
  let startMouse = null;
  let resizeHandle = '';
  let members = [];
  let rotateCenter = null;
  let rotateStartAngle = 0;
  // The surface the gesture started in, captured at mousedown. The
  // single-control rotate re-queries per move with
  // `document.querySelector('.panel-surface')`, which finds the FIRST panel on
  // screen rather than the one under the hand — harmless with one panel open,
  // wrong the moment there are two.
  let rotateSurface = null;

  // Panel-space AABB over the selection. While a member drag is live the
  // store still holds the start positions, so the box rides the broadcast
  // delta; while a group resize is live it shows the transient rect.
  let bounds = $derived.by(() => {
    if (!active || !panel) return null;
    if (transientBounds) return transientBounds;
    const ids = $selectedComponentIds;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const entry of flatControlsWithPanelRects(panel.controls)) {
      if (!ids.has(entry._children?.Core?.id)) continue;
      const t = entry._children?.Transform;
      // Rotation included: the box wraps what is drawn, not what is stored.
      const r = rotatedRectBounds(
        { x: t.x, y: t.y, w: t.width ?? 0, h: t.height ?? 0 },
        t.rotation,
      );
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    if (minX === Infinity) return null;
    const drag = $multiDragDelta.active ? $multiDragDelta : { x: 0, y: 0 };
    // Out to whole panel units: everything the editor stores is an integer,
    // a rotated corner is not, and rounding outward keeps the box wrapping
    // its contents rather than shaving a corner off one of them.
    const x = Math.floor(minX + drag.x);
    const y = Math.floor(minY + drag.y);
    return {
      x,
      y,
      w: Math.ceil(maxX + drag.x) - x,
      h: Math.ceil(maxY + drag.y) - y,
    };
  });

  function captureMembers() {
    const rectsById = new Map();
    for (const entry of flatControlsWithPanelRects(panel.controls)) {
      rectsById.set(entry._children.Core.id, entry._children.Transform);
    }
    const out = [];
    for (const rootId of selectionRoots(panel.controls, $selectedComponentIds)) {
      const ctrl = findControlById(panel.controls, rootId);
      const local = ctrl?._children?.Transform;
      if (!local) continue;
      const panelRect = rectsById.get(rootId);
      out.push({
        id: rootId,
        kind: 'root',
        local: { x: local.x, y: local.y, w: local.width, h: local.height },
        // The member's own rotation at gesture start — a group rotation adds
        // the gesture delta to it rather than replacing it, so a control that
        // was already at 30° stays 30° ahead of its neighbours.
        rotation: Number(local.rotation ?? 0),
        // Constant while resizing: the (unselected) parent chain doesn't move.
        parentOffset: {
          x: (panelRect?.x ?? local.x) - local.x,
          y: (panelRect?.y ?? local.y) - local.y,
        },
      });
      // Descendants of a selected container scale their local geometry, so
      // the container's contents resize with it.
      walkControls(getChildControls(ctrl), (node) => {
        const t = node._children?.Transform;
        if (!t) return;
        out.push({
          id: node._children.Core.id,
          kind: 'descendant',
          local: { x: t.x, y: t.y, w: t.width, h: t.height },
        });
      });
    }
    return out;
  }

  function startResize(handleId, e) {
    if (e.button !== 0 || !bounds) return;
    e.preventDefault();
    e.stopPropagation();

    isResizing = true;
    resizeHandle = handleId;
    startMouse = { x: e.clientX, y: e.clientY };
    startBounds = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
    members = captureMembers();

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  }

  function handleResizeMove(e) {
    if (!isResizing || !startBounds) return;
    const dx = (e.clientX - startMouse.x) / (scale || 1);
    const dy = (e.clientY - startMouse.y) / (scale || 1);

    const rect = computeResizedRect(startBounds, resizeHandle, dx, dy, {
      aspectLock: e.shiftKey,
      aspectRatio: startBounds.h ? startBounds.w / startBounds.h : 1,
      minW: 8,
      minH: 8,
      maxW: 0,
      maxH: 0,
      // Alt/Option grows the box about its own centre. The member maths below
      // maps startBounds onto rect linearly, so it does not care which point
      // the box was anchored to — the mode is entirely the rect's business.
      fromCenter: e.altKey === true,
    });
    transientBounds = rect;

    const sx = startBounds.w ? rect.w / startBounds.w : 1;
    const sy = startBounds.h ? rect.h / startBounds.h : 1;

    const patches = new Map();
    for (const m of members) {
      if (m.kind === 'root') {
        const startPanelX = m.local.x + m.parentOffset.x;
        const startPanelY = m.local.y + m.parentOffset.y;
        const newPanelX = rect.x + (startPanelX - startBounds.x) * sx;
        const newPanelY = rect.y + (startPanelY - startBounds.y) * sy;
        patches.set(m.id, {
          'Transform.x': Math.round(newPanelX - m.parentOffset.x),
          'Transform.y': Math.round(newPanelY - m.parentOffset.y),
          'Transform.width': Math.max(1, Math.round(m.local.w * sx)),
          'Transform.height': Math.max(1, Math.round(m.local.h * sy)),
        });
      } else {
        patches.set(m.id, {
          'Transform.x': Math.round(m.local.x * sx),
          'Transform.y': Math.round(m.local.y * sy),
          'Transform.width': Math.max(1, Math.round(m.local.w * sx)),
          'Transform.height': Math.max(1, Math.round(m.local.h * sy)),
        });
      }
    }
    applyControlPatchesById(patches);
  }

  function handleResizeEnd() {
    if (!isResizing) return;
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
    isResizing = false;
    transientBounds = null;
    startBounds = null;
    members = [];
    pushSnapshot();   // gesture boundary — one group resize, one undo step
    swallowNextCanvasClick();
  }

  // --- Group rotation ---

  function startRotate(e) {
    if (e.button !== 0 || !bounds) return;
    e.preventDefault();
    e.stopPropagation();

    const surface = e.target?.closest?.('.panel-surface') ?? null;
    const point = surface ? clientToPanelPoint(surface, e.clientX, e.clientY, scale || 1) : null;
    if (!point) return;

    isRotating = true;
    rotateSurface = surface;
    startBounds = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
    rotateCenter = { x: startBounds.x + startBounds.w / 2, y: startBounds.y + startBounds.h / 2 };
    rotateStartAngle = angleFromCenter(rotateCenter.x, rotateCenter.y, point.x, point.y);
    rotateDelta = 0;
    members = captureMembers();
    // Freeze the box at its start rect: the members move under it and the
    // AABB would otherwise breathe every frame. The CSS rotate on the box
    // shows the turn instead, which is also what the user is aiming at.
    transientBounds = startBounds;

    window.addEventListener('mousemove', handleRotateMove);
    window.addEventListener('mouseup', handleRotateEnd);
  }

  function handleRotateMove(e) {
    if (!isRotating || !rotateCenter) return;
    const point = clientToPanelPoint(rotateSurface, e.clientX, e.clientY, scale || 1);
    if (!point) return;

    const angle = angleFromCenter(rotateCenter.x, rotateCenter.y, point.x, point.y);
    // A group has no rotation of its own, so the gesture's start rotation is
    // 0 and computeRotation hands back the DELTA — and Shift snaps that delta
    // to 15°, the same convention (and the same function) as the
    // single-control rotate.
    rotateDelta = computeRotation(rotateStartAngle, angle, 0, e.shiftKey);

    // Always against the geometry captured at mousedown, never against the
    // last frame — see groupRotationPatches.
    applyControlPatchesById(
      groupRotationPatches(members, rotateCenter.x, rotateCenter.y, rotateDelta),
    );
  }

  function handleRotateEnd() {
    if (!isRotating) return;
    window.removeEventListener('mousemove', handleRotateMove);
    window.removeEventListener('mouseup', handleRotateEnd);

    const turned = Math.abs(rotateDelta) > 0.001;
    isRotating = false;
    rotateDelta = 0;
    rotateCenter = null;
    rotateSurface = null;
    transientBounds = null;
    startBounds = null;
    members = [];
    // Gesture boundary — one group rotation, one undo step. A zero-degree
    // click on a rotate zone changed nothing and must not spend one.
    if (turned) pushSnapshot();
    swallowNextCanvasClick();
  }

  /** Swallow the click that follows mouseup so it doesn't clear the selection
   *  (clicks on menus and toolbars still pass through). */
  function swallowNextCanvasClick() {
    window.addEventListener('click', (ev) => {
      if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    }, { once: true, capture: true });
  }
</script>

{#if bounds}
  <div
    class="selection-bounds"
    style="left:{bounds.x}px; top:{bounds.y}px; width:{bounds.w}px; height:{bounds.h}px; --inv-scale:{1 / (scale || 1)};{isRotating ? ` transform:rotate(${rotateDelta}deg);` : ''}"
  >
    {#if !$multiDragDelta.active}
      {#each handles as handle (handle.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="group-handle"
          style="{resizeHandleStyle(handle.id, 1 / (scale || 1))} cursor:{handle.cursor};"
          onmousedown={(e) => startResize(handle.id, e)}
        ></div>
      {/each}

      {#each rotateCorners as corner (corner)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="rotate-zone rotate-{corner}" onmousedown={startRotate}></div>
      {/each}
    {/if}
  </div>

  {#if isRotating}
    <!-- Outside the box on purpose: the box carries the live CSS rotate, and
         a readout that turns with it is unreadable at exactly the angles you
         most want to read it at. -->
    <div
      class="group-angle"
      style="left:{bounds.x + bounds.w / 2}px; top:{bounds.y}px; --inv-scale:{1 / (scale || 1)};"
    >{normalizeRotation(rotateDelta)}°</div>
  {/if}
{/if}

<style>
  .selection-bounds {
    position: absolute;
    pointer-events: none;
    border: calc(1px * var(--inv-scale, 1)) dashed #5B9BD5;
    z-index: 150;
  }

  .group-handle {
    position: absolute;
    pointer-events: auto;
    background: #5B9BD5;
    border: solid #FFF;
    z-index: 151;
  }

  .group-handle::after {
    content: '';
    position: absolute;
    inset: calc(-5px * var(--inv-scale, 1));
  }

  .group-handle:hover {
    background: #FFF;
    border-color: #5B9BD5;
  }

  /* Every length here is multiplied by --inv-scale (1/zoom) for the same
     reason the handles are: this is screen-space chrome living inside the
     CSS-scaled panel surface. The geometry and the cursor are deliberately
     identical to CanvasControlSelectionOverlay's rotate zones — one selected
     control and fifteen should offer rotation in the same place. */
  .rotate-zone {
    position: absolute;
    pointer-events: auto;
    width: calc(16px * var(--inv-scale, 1));
    height: calc(16px * var(--inv-scale, 1));
    z-index: 150;
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M21 12a9 9 0 1 1-3-6.7'/%3E%3Cpath d='M21 3v5h-5'/%3E%3C/svg%3E") 10 10, crosshair;
  }

  .rotate-tl { top: calc(-18px * var(--inv-scale, 1)); left: calc(-18px * var(--inv-scale, 1)); }
  .rotate-tr { top: calc(-18px * var(--inv-scale, 1)); right: calc(-18px * var(--inv-scale, 1)); }
  .rotate-bl { bottom: calc(-18px * var(--inv-scale, 1)); left: calc(-18px * var(--inv-scale, 1)); }
  .rotate-br { bottom: calc(-18px * var(--inv-scale, 1)); right: calc(-18px * var(--inv-scale, 1)); }

  /* Live angle readout for the group turn, above the box's top edge. */
  .group-angle {
    position: absolute;
    pointer-events: none;
    z-index: 152;
    background: #5B9BD5;
    color: #FFF;
    font-size: calc(9px * var(--inv-scale, 1));
    font-weight: 600;
    padding: calc(1px * var(--inv-scale, 1)) calc(4px * var(--inv-scale, 1));
    border-radius: calc(3px * var(--inv-scale, 1));
    white-space: nowrap;
    transform: translate(-50%, calc(-100% - 6px * var(--inv-scale, 1)));
    font-family: inherit;
    line-height: 1.2;
  }
</style>
