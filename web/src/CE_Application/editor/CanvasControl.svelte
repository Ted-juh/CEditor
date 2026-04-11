<script>
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { selectedComponentIds, selectComponent, multiDragDelta, keyObjectId } from '../stores/panels.js';
  import { updateControlProperty, getSection } from '../stores/controls.js';
  import { get } from 'svelte/store';
  import { showDistances } from '../stores/editorView.js';
  import { guides } from '../stores/guides.js';
  import { findAlignmentSnap, computeDistances } from '../utils/canvasSnapping.js';
  import { buildShadowCSS, buildBlendCSS, buildFilterCSS } from '../utils/effectsCSS.js';
  import {
    computeResizedRect, snapRectToGrid, snapToGridAxis,
    clientToPanelPoint, angleFromCenter, computeRotation, normalizeRotation,
    resizeHandleStyle,
  } from '../utils/transformMath.js';

  let {
    control,
    scale = 1,
    snapToGrid = false,
    gridSize = 10,
    gridOriginX = 0,
    gridOriginY = 0,
    panelLocked = false,
    allControls = [],
    panelWidth = 0,
    panelHeight = 0,
    onDragStart = null,
    onDragEnd = null,
  } = $props();

  // --- Derived data from sections ---
  let core = $derived(getSection(control, 'Core'));
  let transform = $derived(getSection(control, 'Transform'));
  let background = $derived(getSection(control, 'Background'));
  let effects = $derived(getSection(control, 'Effects'));
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

  // --- Snap to grid helper (accounts for grid origin offset) ---
  const snapToGridX = (val) => snapToGrid ? snapToGridAxis(val, gridSize, gridOriginX) : val;
  const snapToGridY = (val) => snapToGrid ? snapToGridAxis(val, gridSize, gridOriginY) : val;

  // --- Snap guides & distance labels ---
  let snapGuides = $state([]);
  let distanceLabels = $state([]); // { axis, dist, x, y, length }

  // Thin wrappers around the pure snap utils so the drag/resize handlers
  // stay readable. findAlignmentSnap uses allControls + ruler guides;
  // computeDistances additionally filters out co-selected siblings and
  // only runs for the dragged (key-object) component.
  function alignSnap(x, y, w, h) {
    return findAlignmentSnap({ x, y, w, h }, core?.id, allControls, $guides, getSection);
  }

  function distancesFor(x, y, w, h) {
    const ids = get(selectedComponentIds);
    // Only the dragged component should show distances
    if (ids.size > 1 && !isKeyObject && $keyObjectId !== core?.id) return [];
    return computeDistances(
      { x, y, w, h },
      core?.id,
      ids,
      allControls,
      { width: panelWidth, height: panelHeight },
      getSection,
    );
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
    const align = alignSnap(newX, newY, displayW, displayH);
    transientX = Math.round(align.x);
    transientY = Math.round(align.y);
    snapGuides = align.guides;
    distanceLabels = $showDistances ? distancesFor(transientX, transientY, displayW, displayH) : [];

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
    distanceLabels = [];
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

    // Resize geometry (deltas + aspect lock + min/max clamping)
    let rect = computeResizedRect(resizeStartRect, resizeHandle, dx, dy, {
      aspectLock: e.shiftKey || (transform?.aspectLock === true),
      aspectRatio: resizeStartRect.w / resizeStartRect.h,
      minW: Math.max(MIN_SIZE, transform?.minWidth || 0),
      minH: Math.max(MIN_SIZE, transform?.minHeight || 0),
      maxW: transform?.maxWidth || 0,
      maxH: transform?.maxHeight || 0,
    });

    // Grid snap
    if (snapToGrid) rect = snapRectToGrid(rect, gridSize, snapToGridX, snapToGridY);

    // Alignment snap overrides grid when within threshold
    const align = alignSnap(rect.x, rect.y, rect.w, rect.h);
    transientX = Math.round(align.x);
    transientY = Math.round(align.y);
    transientW = Math.round(rect.w);
    transientH = Math.round(rect.h);
    snapGuides = align.guides;
    distanceLabels = $showDistances ? distancesFor(transientX, transientY, transientW, transientH) : [];
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
    distanceLabels = [];
    // Swallow the click only if it lands on the canvas (prevents deselect),
    // but let clicks on menus/toolbar pass through
    window.addEventListener('click', (ev) => {
      if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
        ev.stopPropagation(); ev.preventDefault();
      }
    }, { once: true, capture: true });
  }

  // --- Rotation ---
  let isRotating = $state(false);
  let rotateStartAngle = $state(0);
  let rotateStartRotation = $state(0);
  let transientRotation = $state(null);

  function handleRotateStart(e) {
    if (isEditorLocked) return;
    e.stopPropagation();
    e.preventDefault();

    isRotating = true;
    rotateStartRotation = transform?.rotation ?? 0;
    transientRotation = rotateStartRotation;

    const cx = displayX + displayW / 2;
    const cy = displayY + displayH / 2;
    const p = clientToPanelPoint(e.target.closest('.panel-surface'), e.clientX, e.clientY, scale);
    if (!p) return;
    rotateStartAngle = angleFromCenter(cx, cy, p.x, p.y);

    window.addEventListener('mousemove', handleRotateMove);
    window.addEventListener('mouseup', handleRotateEnd);
  }

  function handleRotateMove(e) {
    if (!isRotating) return;
    const cx = displayX + displayW / 2;
    const cy = displayY + displayH / 2;
    const p = clientToPanelPoint(document.querySelector('.panel-surface'), e.clientX, e.clientY, scale);
    if (!p) return;
    const currentAngle = angleFromCenter(cx, cy, p.x, p.y);
    transientRotation = computeRotation(rotateStartAngle, currentAngle, rotateStartRotation, e.shiftKey);
  }

  function handleRotateEnd() {
    if (!isRotating) return;
    window.removeEventListener('mousemove', handleRotateMove);
    window.removeEventListener('mouseup', handleRotateEnd);

    if (core?.id && transientRotation !== rotateStartRotation) {
      updateControlProperty(core.id, 'Transform.rotation', normalizeRotation(transientRotation));
    }

    isRotating = false;
    transientRotation = null;

    window.addEventListener('click', (ev) => {
      if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
        ev.stopPropagation(); ev.preventDefault();
      }
    }, { once: true, capture: true });
  }

  // Current rotation for display (transient during rotate drag, otherwise from transform)
  let displayRotation = $derived(transientRotation ?? transform?.rotation ?? 0);

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

  const handleStyle = resizeHandleStyle;

  // --- Effects CSS (applied to .canvas-control and .control-content) ---
  let shadowCSS = $derived(buildShadowCSS(effects));
  let blendCSS  = $derived(buildBlendCSS(effects));
  let filterCSS = $derived(buildFilterCSS(effects));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="canvas-control"
  class:selected={isSelected && !panelLocked}
  class:key-object={isKeyObject && !panelLocked}
  class:hidden-component={!isVisible}
  class:locked={isEditorLocked}
  style="left:{displayX}px; top:{displayY}px; width:{displayW}px; height:{displayH}px; opacity:{transform?.opacity ?? 1}; {displayRotation ? `transform:rotate(${displayRotation}deg); transform-origin:center center;` : ''} {shadowCSS} {blendCSS}"
  onmousedown={handleMouseDown}
>
  <div class="control-content" style="{filterCSS}">
    {#if background}
      <BackgroundRenderer {background} width={displayW} height={displayH} />
    {/if}

  </div>

  {#if isSelected && !isEditorLocked}
    {#each handles as h (h.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="resize-handle"
        style="{handleStyle(h.id)} cursor:{h.cursor};"
        onmousedown={(e) => handleResizeStart(h.id, e)}
      ></div>
    {/each}
    <!-- Rotation zones outside each corner -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="rotate-zone rotate-tl" onmousedown={handleRotateStart}></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="rotate-zone rotate-tr" onmousedown={handleRotateStart}></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="rotate-zone rotate-bl" onmousedown={handleRotateStart}></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="rotate-zone rotate-br" onmousedown={handleRotateStart}></div>
  {/if}
</div>

{#if isDragging || isResizing}
  {#each snapGuides as guide}
    <div
      class="snap-guide"
      class:vertical={guide.type === 'vertical'}
      class:horizontal={guide.type === 'horizontal'}
      style="{guide.type === 'vertical' ? `left:${guide.pos}px;` : `top:${guide.pos}px;`}"
    ></div>
  {/each}
  {#each distanceLabels as dl}
    {#if dl.axis === 'h'}
      <div class="dist-line dist-h" style="left:{dl.x}px; top:{dl.y}px; width:{dl.length}px;"></div>
      <div class="dist-label" style="left:{dl.side === 'left' ? dl.x + dl.length - 20 : dl.x + 20}px; top:{dl.y}px;">{dl.dist}</div>
    {:else}
      <div class="dist-line dist-v" style="left:{dl.x}px; top:{dl.y}px; height:{dl.length}px;"></div>
      <div class="dist-label" style="left:{dl.x}px; top:{dl.side === 'top' ? dl.y + dl.length - 20 : dl.y + 20}px;">{dl.dist}</div>
    {/if}
  {/each}
{/if}

<style>
  .canvas-control {
    position: absolute;
    box-sizing: border-box;
    cursor: default;
  }

  .control-content {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .canvas-control:hover:not(.locked) {
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

  .rotate-zone {
    position: absolute;
    width: 16px;
    height: 16px;
    z-index: 9;
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M21 12a9 9 0 1 1-3-6.7'/%3E%3Cpath d='M21 3v5h-5'/%3E%3C/svg%3E") 10 10, crosshair;
  }

  .rotate-zone::after {
    content: '';
    position: absolute;
    inset: -3px;
  }

  .rotate-tl { top: -18px;  left: -18px; }
  .rotate-tr { top: -18px;  right: -18px; }
  .rotate-bl { bottom: -18px; left: -18px; }
  .rotate-br { bottom: -18px; right: -18px; }

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

  /* Distance measurement lines & labels */
  .dist-line {
    position: absolute;
    pointer-events: none;
    z-index: 101;
  }

  .dist-h {
    height: 0;
    border-top: 1px solid #E5A029;
    transform: translateY(-0.5px);
  }

  .dist-v {
    width: 0;
    border-left: 1px solid #E5A029;
    transform: translateX(-0.5px);
  }

  /* End caps */
  .dist-h::before, .dist-h::after {
    content: '';
    position: absolute;
    width: 1px;
    height: 7px;
    background: #E5A029;
    top: -3px;
  }
  .dist-h::before { left: 0; }
  .dist-h::after  { right: 0; }

  .dist-v::before, .dist-v::after {
    content: '';
    position: absolute;
    height: 1px;
    width: 7px;
    background: #E5A029;
    left: -3px;
  }
  .dist-v::before { top: 0; }
  .dist-v::after  { bottom: 0; }

  .dist-label {
    position: absolute;
    pointer-events: none;
    z-index: 102;
    background: #E5A029;
    color: #000;
    font-size: 9px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    white-space: nowrap;
    transform: translate(-50%, -50%);
    font-family: inherit;
    line-height: 1.2;
  }
</style>
