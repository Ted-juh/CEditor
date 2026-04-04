<script>
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { selectedComponentId } from '../stores/panels.js';
  import { updateControlProperty, getSection } from '../stores/controls.js';

  let {
    control,
    scale = 1,
    snapToGrid = false,
    gridSize = 10,
    allControls = [],
    onDragStart = null,
    onDragEnd = null,
  } = $props();

  // --- Derived data from sections ---
  let core = $derived(getSection(control, 'Core'));
  let transform = $derived(getSection(control, 'Transform'));
  let background = $derived(getSection(control, 'Background'));
  let isSelected = $derived(core?.id != null && $selectedComponentId === core.id);
  let isLocked = $derived(core?.locked === true);
  let isVisible = $derived(core?.visible !== false);

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

  let displayX = $derived(transientX ?? transform?.x ?? 0);
  let displayY = $derived(transientY ?? transform?.y ?? 0);
  let displayW = $derived(transientW ?? transform?.width ?? 100);
  let displayH = $derived(transientH ?? transform?.height ?? 40);

  const MIN_SIZE = 10;
  const SNAP_THRESHOLD = 5;

  // --- Snap to grid helper ---
  function snapValue(val) {
    if (!snapToGrid || gridSize <= 0) return val;
    return Math.round(val / gridSize) * gridSize;
  }

  // --- Snap guides: find alignment with other controls ---
  let snapGuides = $state([]);

  function findSnapGuides(x, y, w, h) {
    if (!allControls || allControls.length === 0) return [];
    const guides = [];
    const edges = {
      left: x,
      centerX: x + w / 2,
      right: x + w,
      top: y,
      centerY: y + h / 2,
      bottom: y + h,
    };

    for (const other of allControls) {
      const otherCore = getSection(other, 'Core');
      const otherTransform = getSection(other, 'Transform');
      if (!otherTransform || otherCore?.id === core?.id) continue;

      const ox = otherTransform.x;
      const oy = otherTransform.y;
      const ow = otherTransform.width;
      const oh = otherTransform.height;

      const otherEdges = {
        left: ox,
        centerX: ox + ow / 2,
        right: ox + ow,
        top: oy,
        centerY: oy + oh / 2,
        bottom: oy + oh,
      };

      // Vertical guides (x-axis alignment)
      for (const [, val] of Object.entries(edges)) {
        if (val === edges.top || val === edges.centerY || val === edges.bottom) continue;
        for (const [, oval] of Object.entries(otherEdges)) {
          if (oval === otherEdges.top || oval === otherEdges.centerY || oval === otherEdges.bottom) continue;
          if (Math.abs(val - oval) < SNAP_THRESHOLD) {
            guides.push({ type: 'vertical', pos: oval });
          }
        }
      }

      // Horizontal guides (y-axis alignment)
      for (const [, val] of Object.entries(edges)) {
        if (val === edges.left || val === edges.centerX || val === edges.right) continue;
        for (const [, oval] of Object.entries(otherEdges)) {
          if (oval === otherEdges.left || oval === otherEdges.centerX || oval === otherEdges.right) continue;
          if (Math.abs(val - oval) < SNAP_THRESHOLD) {
            guides.push({ type: 'horizontal', pos: oval });
          }
        }
      }
    }

    return guides;
  }

  // --- Click to select ---
  function handleMouseDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();

    selectedComponentId.set(core?.id ?? null);

    if (isLocked || isResizing) return;

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

    if (snapToGrid && gridSize > 0) {
      newX = snapValue(newX);
      newY = snapValue(newY);
    }

    transientX = Math.round(newX);
    transientY = Math.round(newY);

    snapGuides = findSnapGuides(transientX, transientY, displayW, displayH);
  }

  function handleDragEnd() {
    if (!isDragging) return;
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);

    if (core?.id && (transientX !== dragStartPos.x || transientY !== dragStartPos.y)) {
      updateControlProperty(core.id, 'Transform.x', transientX);
      updateControlProperty(core.id, 'Transform.y', transientY);
    }

    isDragging = false;
    transientX = null;
    transientY = null;
    snapGuides = [];
    onDragEnd?.();
  }

  // --- Resize ---
  function handleResizeStart(handle, e) {
    if (isLocked) return;
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

    // Snap
    if (snapToGrid && gridSize > 0) {
      x = snapValue(x);
      y = snapValue(y);
      w = snapValue(w) || gridSize;
      h = snapValue(h) || gridSize;
    }

    transientX = Math.round(x);
    transientY = Math.round(y);
    transientW = Math.round(w);
    transientH = Math.round(h);

    snapGuides = findSnapGuides(transientX, transientY, transientW, transientH);
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
    const s = 6;   // handle size in px
    const o = -3;  // offset (half of size)
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
  class:hidden-component={!isVisible}
  class:locked={isLocked}
  style="left:{displayX}px; top:{displayY}px; width:{displayW}px; height:{displayH}px; opacity:{transform?.opacity ?? 1}; {transform?.rotation ? `transform:rotate(${transform.rotation}deg);` : ''}"
  onmousedown={handleMouseDown}
>
  {#if background}
    <BackgroundRenderer {background} />
  {/if}

  <span class="control-label">{core?.name ?? ''}</span>

  {#if isSelected && !isLocked}
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
    border-radius: 1px;
    z-index: 10;
  }

  .resize-handle:hover {
    background: #FFF;
    border-color: #5B9BD5;
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
