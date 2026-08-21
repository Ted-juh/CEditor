<script>
  /**
   * The multi-selection bounding box: one dashed box with 8 handles around
   * the whole selection, replacing the per-control handle sets (15 selected
   * controls used to render 120 handles and no group bounds at all).
   *
   * Dragging a handle scales every selection root proportionally around the
   * box — positions and sizes both — and scales the local geometry of a
   * selected container's descendants so the group resizes as one object.
   * Writes go to the store live for feedback; one snapshot is pushed at the
   * gesture boundary so the whole resize is a single undo step.
   */
  import { selectedComponentIds, multiDragDelta } from '../stores/panels.js';
  import { applyControlPatchesById } from '../stores/controls.js';
  import { pushSnapshot } from '../stores/history.js';
  import { computeResizedRect, resizeHandleStyle } from '../utils/transformMath.js';
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

  let active = $derived(!panelLocked && $selectedComponentIds.size > 1);

  let isResizing = $state(false);
  let transientBounds = $state(null);
  let startBounds = null;
  let startMouse = null;
  let resizeHandle = '';
  let members = [];

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
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + (t.width ?? 0));
      maxY = Math.max(maxY, t.y + (t.height ?? 0));
    }
    if (minX === Infinity) return null;
    const drag = $multiDragDelta.active ? $multiDragDelta : { x: 0, y: 0 };
    return { x: minX + drag.x, y: minY + drag.y, w: maxX - minX, h: maxY - minY };
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

    // Swallow the click that follows mouseup so it doesn't clear the selection.
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
    style="left:{bounds.x}px; top:{bounds.y}px; width:{bounds.w}px; height:{bounds.h}px; --inv-scale:{1 / (scale || 1)};"
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
    {/if}
  </div>
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
</style>
