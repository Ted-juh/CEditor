<script>
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { selectedComponentIds, selectComponent, multiDragDelta, keyObjectId } from '../stores/panels.js';
  import { updateControlProperty, getSection } from '../stores/controls.js';
  import { get } from 'svelte/store';

  let {
    control,
    scale = 1,
    snapToGrid = false,
    gridSize = 10,
    gridOriginX = 0,
    gridOriginY = 0,
    panelLocked = false,
    allControls = [],
    onDragStart = null,
    onDragEnd = null,
  } = $props();

  // --- Derived data from sections ---
  let core = $derived(getSection(control, 'Core'));
  let transform = $derived(getSection(control, 'Transform'));
  let background = $derived(getSection(control, 'Background'));
  let isSelected = $derived(core?.id != null && $selectedComponentIds.has(core.id));
  let isKeyObject = $derived(core?.id != null && $keyObjectId === core.id && $selectedComponentIds.size > 1);
  let isLocked = $derived(core?.locked === true);
  let isVisible = $derived(core?.visible !== false);
  let isEditorLocked = $derived(panelLocked || isLocked);

  // --- Drag state (internal $state per feedback) ---
  let isDragging = $state(false);
  let dragStartMouse = $state({ x: 0, y: 0 });
  let dragStartPos = $state({ x: 0, y: 0 });

  // --- Resize state ---
  let isResizing = $state(false);
  let resizeHandle = $state('');
  let resizeStartMouse = $state({ x: 0, y: 0 });
  let resizeStartRect = $state({ x: 0, y: 0, w: 0, h: 0 });

  // --- Transient position/size during drag/resize ---
  let transientX = $state(null);
  let transientY = $state(null);
  let transientW = $state(null);
  let transientH = $state(null);

  // During multi-drag, non-dragged selected components offset by the shared delta
  let multiDragOffsetX = $derived(!isDragging && isSelected && $multiDragDelta.active ? $multiDragDelta.x : 0);
  let multiDragOffsetY = $derived(!isDragging && isSelected && $multiDragDelta.active ? $multiDragDelta.y : 0);

  let displayX = $derived((transientX ?? transform?.x ?? 0) + multiDragOffsetX);
  let displayY = $derived((transientY ?? transform?.y ?? 0) + multiDragOffsetY);
  let displayW = $derived(transientW ?? transform?.width ?? 100);
  let displayH = $derived(transientH ?? transform?.height ?? 40);

  const MIN_SIZE = 10;
  const SNAP_THRESHOLD = 5;

  // --- Snap to grid helper (accounts for grid origin offset) ---
  function snapToGridX(val) {
    if (!snapToGrid || gridSize <= 0) return val;
    return Math.round((val - gridOriginX) / gridSize) * gridSize + gridOriginX;
  }

  function snapToGridY(val) {
    if (!snapToGrid || gridSize <= 0) return val;
    return Math.round((val - gridOriginY) / gridSize) * gridSize + gridOriginY;
  }

  // --- Snap guides: find alignment with other controls and return snapped position ---
  let snapGuides = $state([]);

  /**
   * Find alignment snap guides against other controls.
   * Returns { x, y, guides[] } — snapped position + visual guide lines.
   * Each edge of our rect is compared to each edge of every other control on the same axis.
   * The closest match within SNAP_THRESHOLD wins per axis.
   */
  function findAlignmentSnap(x, y, w, h) {
    const result = { x, y, guides: [] };
    if (!allControls || allControls.length === 0) return result;

    // Our edges by axis
    const myXEdges = [
      { offset: 0,     val: x },         // left
      { offset: w / 2, val: x + w / 2 }, // centerX
      { offset: w,     val: x + w },     // right
    ];
    const myYEdges = [
      { offset: 0,     val: y },         // top
      { offset: h / 2, val: y + h / 2 }, // centerY
      { offset: h,     val: y + h },     // bottom
    ];

    let bestDx = SNAP_THRESHOLD;
    let bestDy = SNAP_THRESHOLD;
    let bestSnapX = null;
    let bestSnapY = null;
    let xGuidePos = null;
    let yGuidePos = null;

    for (const other of allControls) {
      const otherCore = getSection(other, 'Core');
      const otherTransform = getSection(other, 'Transform');
      if (!otherTransform || otherCore?.id === core?.id) continue;

      const ox = otherTransform.x;
      const oy = otherTransform.y;
      const ow = otherTransform.width;
      const oh = otherTransform.height;

      const otherXEdges = [ox, ox + ow / 2, ox + ow];
      const otherYEdges = [oy, oy + oh / 2, oy + oh];

      // X-axis alignment (produces vertical guide lines)
      for (const myEdge of myXEdges) {
        for (const oval of otherXEdges) {
          const dist = Math.abs(myEdge.val - oval);
          if (dist < bestDx) {
            bestDx = dist;
            bestSnapX = oval - myEdge.offset; // shift our x so this edge aligns
            xGuidePos = oval;
          }
        }
      }

      // Y-axis alignment (produces horizontal guide lines)
      for (const myEdge of myYEdges) {
        for (const oval of otherYEdges) {
          const dist = Math.abs(myEdge.val - oval);
          if (dist < bestDy) {
            bestDy = dist;
            bestSnapY = oval - myEdge.offset; // shift our y so this edge aligns
            yGuidePos = oval;
          }
        }
      }
    }

    if (bestSnapX !== null) {
      result.x = bestSnapX;
      result.guides.push({ type: 'vertical', pos: xGuidePos });
    }
    if (bestSnapY !== null) {
      result.y = bestSnapY;
      result.guides.push({ type: 'horizontal', pos: yGuidePos });
    }

    return result;
  }

  // --- Click to select ---
  function handleMouseDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();

    const multiKey = e.ctrlKey || e.metaKey;
    if (multiKey) {
      // Ctrl+click: toggle this component in/out of selection
      selectComponent(core?.id, true);
    } else if (!isSelected) {
      // Normal click on unselected: replace selection with just this one
      selectComponent(core?.id, false);
    }
    // Normal click on already-selected: keep current selection (enables multi-drag)

    if (isEditorLocked || isResizing) {
      // Swallow the click only if it lands on the canvas (prevents deselect)
      window.addEventListener('click', (ev) => {
        if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
          ev.stopPropagation(); ev.preventDefault();
        }
      }, { once: true, capture: true });
      return;
    }

    // Start drag
    isDragging = true;
    dragStartMouse = { x: e.clientX, y: e.clientY };
    dragStartPos = { x: transform?.x ?? 0, y: transform?.y ?? 0 };
    transientX = dragStartPos.x;
    transientY = dragStartPos.y;
    onDragStart?.();

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  }

  function handleDragMove(e) {
    if (!isDragging) return;
    const dx = (e.clientX - dragStartMouse.x) / scale;
    const dy = (e.clientY - dragStartMouse.y) / scale;

    let newX = dragStartPos.x + dx;
    let newY = dragStartPos.y + dy;

    // Grid snap first
    if (snapToGrid && gridSize > 0) {
      newX = snapToGridX(newX);
      newY = snapToGridY(newY);
    }

    // Alignment snap overrides grid when within threshold
    const align = findAlignmentSnap(newX, newY, displayW, displayH);
    transientX = Math.round(align.x);
    transientY = Math.round(align.y);
    snapGuides = align.guides;

    // Broadcast delta for other selected components to follow
    const ids = get(selectedComponentIds);
    if (ids.size > 1) {
      multiDragDelta.set({ x: transientX - dragStartPos.x, y: transientY - dragStartPos.y, active: true });
    }
  }

  function handleDragEnd() {
    if (!isDragging) return;
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);

    const dx = transientX - dragStartPos.x;
    const dy = transientY - dragStartPos.y;

    if (dx !== 0 || dy !== 0) {
      const ids = get(selectedComponentIds);
      if (ids.size > 1 && ids.has(core?.id)) {
        // Multi-drag: apply delta to all selected components
        for (const other of allControls) {
          const otherId = getSection(other, 'Core')?.id;
          if (!otherId || otherId === core.id || !ids.has(otherId)) continue;
          const ot = getSection(other, 'Transform');
          if (ot) {
            updateControlProperty(otherId, 'Transform.x', ot.x + dx);
            updateControlProperty(otherId, 'Transform.y', ot.y + dy);
          }
        }
      }
      // Always update the dragged component itself
      if (core?.id) {
        updateControlProperty(core.id, 'Transform.x', transientX);
        updateControlProperty(core.id, 'Transform.y', transientY);
      }
    }

    // Clear multi-drag delta
    multiDragDelta.set({ x: 0, y: 0, active: false });

    isDragging = false;
    transientX = null;
    transientY = null;
    snapGuides = [];
    onDragEnd?.();
    // Swallow the click only if it lands on the canvas (prevents deselect),
    // but let clicks on menus/toolbar pass through
    window.addEventListener('click', (ev) => {
      if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
        ev.stopPropagation(); ev.preventDefault();
      }
    }, { once: true, capture: true });
  }

  // --- Resize ---
  function handleResizeStart(handle, e) {
    if (isEditorLocked) return;
    e.stopPropagation();
    e.preventDefault();

    isResizing = true;
    resizeHandle = handle;
    resizeStartMouse = { x: e.clientX, y: e.clientY };
    resizeStartRect = {
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
      w: transform?.width ?? 100,
      h: transform?.height ?? 40,
    };
    transientX = resizeStartRect.x;
    transientY = resizeStartRect.y;
    transientW = resizeStartRect.w;
    transientH = resizeStartRect.h;

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  }

  function handleResizeMove(e) {
    if (!isResizing) return;

    const dx = (e.clientX - resizeStartMouse.x) / scale;
    const dy = (e.clientY - resizeStartMouse.y) / scale;
    const shiftKey = e.shiftKey;

    let { x, y, w, h } = resizeStartRect;

    const handle = resizeHandle;

    // Apply deltas based on handle position
    if (handle.includes('r')) { w += dx; }
    if (handle.includes('l')) { x += dx; w -= dx; }
    if (handle.includes('b')) { h += dy; }
    if (handle.includes('t')) { y += dy; h -= dy; }

    // Shift = aspect ratio lock (only for corner handles)
    if (shiftKey && handle.length === 2) {
      const aspect = resizeStartRect.w / resizeStartRect.h;
      if (Math.abs(dx) > Math.abs(dy)) {
        h = w / aspect;
        if (handle.includes('t')) y = resizeStartRect.y + resizeStartRect.h - h;
      } else {
        w = h * aspect;
        if (handle.includes('l')) x = resizeStartRect.x + resizeStartRect.w - w;
      }
    }

    // Enforce minimum size
    if (w < MIN_SIZE) { w = MIN_SIZE; if (handle.includes('l')) x = resizeStartRect.x + resizeStartRect.w - MIN_SIZE; }
    if (h < MIN_SIZE) { h = MIN_SIZE; if (handle.includes('t')) y = resizeStartRect.y + resizeStartRect.h - MIN_SIZE; }

    // Grid snap
    if (snapToGrid && gridSize > 0) {
      x = snapToGridX(x);
      y = snapToGridY(y);
      w = Math.round(w / gridSize) * gridSize || gridSize;
      h = Math.round(h / gridSize) * gridSize || gridSize;
    }

    // Alignment snap overrides grid when within threshold
    const align = findAlignmentSnap(x, y, w, h);
    transientX = Math.round(align.x);
    transientY = Math.round(align.y);
    transientW = Math.round(w);
    transientH = Math.round(h);
    snapGuides = align.guides;
  }

  function handleResizeEnd() {
    if (!isResizing) return;
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);

    if (core?.id) {
      updateControlProperty(core.id, 'Transform.x', transientX);
      updateControlProperty(core.id, 'Transform.y', transientY);
      updateControlProperty(core.id, 'Transform.width', transientW);
      updateControlProperty(core.id, 'Transform.height', transientH);
    }

    isResizing = false;
    resizeHandle = '';
    transientX = null;
    transientY = null;
    transientW = null;
    transientH = null;
    snapGuides = [];
    // Swallow the click only if it lands on the canvas (prevents deselect),
    // but let clicks on menus/toolbar pass through
    window.addEventListener('click', (ev) => {
      if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
        ev.stopPropagation(); ev.preventDefault();
      }
    }, { once: true, capture: true });
  }

  // Resize handle definitions: [id, cursor, css-position]
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

  function handleStyle(id) {
    const s = 8;   // handle visual size in px
    const o = -4;  // offset (half of size)
    const positions = {
      tl: `top:${o}px;left:${o}px;`,
      t:  `top:${o}px;left:calc(50% - ${s/2}px);`,
      tr: `top:${o}px;right:${o}px;`,
      l:  `top:calc(50% - ${s/2}px);left:${o}px;`,
      r:  `top:calc(50% - ${s/2}px);right:${o}px;`,
      bl: `bottom:${o}px;left:${o}px;`,
      b:  `bottom:${o}px;left:calc(50% - ${s/2}px);`,
      br: `bottom:${o}px;right:${o}px;`,
    };
    return `width:${s}px;height:${s}px;${positions[id]}`;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="canvas-control"
  class:selected={isSelected}
  class:key-object={isKeyObject}
  class:hidden-component={!isVisible}
  class:locked={isEditorLocked}
  style="left:{displayX}px; top:{displayY}px; width:{displayW}px; height:{displayH}px; opacity:{transform?.opacity ?? 1}; {transform?.rotation ? `transform:rotate(${transform.rotation}deg);` : ''}"
  onmousedown={handleMouseDown}
>
  {#if background}
    <BackgroundRenderer {background} />
  {/if}

  <span class="control-label">{core?.name ?? ''}</span>

  {#if isSelected && !isEditorLocked}
    {#each handles as h (h.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="resize-handle"
        style="{handleStyle(h.id)} cursor:{h.cursor};"
        onmousedown={(e) => handleResizeStart(h.id, e)}
      ></div>
    {/each}
  {/if}
</div>

{#if (isDragging || isResizing) && snapGuides.length > 0}
  {#each snapGuides as guide}
    <div
      class="snap-guide"
      class:vertical={guide.type === 'vertical'}
      class:horizontal={guide.type === 'horizontal'}
      style="{guide.type === 'vertical' ? `left:${guide.pos}px;` : `top:${guide.pos}px;`}"
    ></div>
  {/each}
{/if}

<style>
  .canvas-control {
    position: absolute;
    box-sizing: border-box;
    border-radius: 2px;
    overflow: hidden;
    cursor: default;
  }

  .canvas-control:hover {
    outline: 1px solid rgba(91, 155, 213, 0.4);
  }

  .canvas-control.selected {
    outline: 2px solid #5B9BD5;
    outline-offset: -1px;
  }

  .canvas-control.selected.key-object {
    outline-color: #E5A029;
  }

  .canvas-control.hidden-component {
    opacity: 0.25 !important;
    outline: 1px dashed #666;
  }

  .canvas-control.locked {
    cursor: not-allowed;
  }

  .control-label {
    position: absolute;
    top: 2px;
    left: 4px;
    font-size: 9px;
    color: rgba(255, 255, 255, 0.3);
    pointer-events: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(100% - 8px);
  }

  .resize-handle {
    position: absolute;
    background: #5B9BD5;
    border: 1px solid #FFF;
    border-radius: 2px;
    z-index: 10;
  }

  .resize-handle::after {
    content: '';
    position: absolute;
    inset: -5px;
  }

  .resize-handle:hover {
    background: #FFF;
    border-color: #5B9BD5;
  }

  .key-object .resize-handle {
    background: #E5A029;
  }

  .key-object .resize-handle:hover {
    background: #FFF;
    border-color: #E5A029;
  }

  .snap-guide {
    position: absolute;
    pointer-events: none;
    z-index: 100;
  }

  .snap-guide.vertical {
    top: 0;
    bottom: 0;
    width: 1px;
    border-left: 1px dashed #5B9BD5;
  }

  .snap-guide.horizontal {
    left: 0;
    right: 0;
    height: 1px;
    border-top: 1px dashed #5B9BD5;
  }
</style>
