<script>
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { selectedComponentIds, selectComponent, multiDragDelta, keyObjectId } from '../stores/panels.js';
  import { updateControlProperty, getSection } from '../stores/controls.js';
  import { get } from 'svelte/store';
  import { showDistances } from '../stores/editorView.js';
  import { guides } from '../stores/guides.js';

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

  // --- Snap guides & distance labels ---
  let snapGuides = $state([]);
  let distanceLabels = $state([]); // { axis, dist, x, y, length }

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

    // Snap to vertical guide lines (X positions)
    const vGuides = $guides.vertical ?? [];
    for (const gx of vGuides) {
      for (const myEdge of myXEdges) {
        const dist = Math.abs(myEdge.val - gx);
        if (dist < bestDx) {
          bestDx = dist;
          bestSnapX = gx - myEdge.offset;
          xGuidePos = gx;
        }
      }
    }

    // Snap to horizontal guide lines (Y positions)
    const hGuides = $guides.horizontal ?? [];
    for (const gy of hGuides) {
      for (const myEdge of myYEdges) {
        const dist = Math.abs(myEdge.val - gy);
        if (dist < bestDy) {
          bestDy = dist;
          bestSnapY = gy - myEdge.offset;
          yGuidePos = gy;
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

  /**
   * Compute distance measurements from the dragged component to:
   * - Nearest non-selected neighbor on each side (if any, with perpendicular overlap)
   * - Panel edge as fallback when no neighbor exists on that side
   *
   * Only runs for the key-object (the one actually being dragged), not co-selected controls.
   */
  function computeDistances(x, y, w, h) {
    const labels = [];
    if (!allControls) return labels;

    // Only the dragged component should show distances
    const ids = get(selectedComponentIds);
    if (ids.size > 1 && !isKeyObject && $keyObjectId !== core?.id) return labels;

    const myL = x, myR = x + w, myT = y, myB = y + h;
    const myCX = x + w / 2, myCY = y + h / 2;

    let nearestLeft = null;
    let nearestRight = null;
    let nearestTop = null;
    let nearestBottom = null;

    for (const other of allControls) {
      const oc = getSection(other, 'Core');
      const ot = getSection(other, 'Transform');
      if (!ot || oc?.id === core?.id) continue;
      // Skip components in the same selection — they move together
      if (ids.has(oc?.id)) continue;

      const oL = ot.x, oR = ot.x + ot.width, oT = ot.y, oB = ot.y + ot.height;

      const vOverlap = myB > oT && myT < oB;
      const hOverlap = myR > oL && myL < oR;

      if (vOverlap && oR <= myL) {
        const gap = myL - oR;
        if (!nearestLeft || gap < nearestLeft.gap) nearestLeft = { gap };
      }
      if (vOverlap && oL >= myR) {
        const gap = oL - myR;
        if (!nearestRight || gap < nearestRight.gap) nearestRight = { gap };
      }
      if (hOverlap && oB <= myT) {
        const gap = myT - oB;
        if (!nearestTop || gap < nearestTop.gap) nearestTop = { gap };
      }
      if (hOverlap && oT >= myB) {
        const gap = oT - myB;
        if (!nearestBottom || gap < nearestBottom.gap) nearestBottom = { gap };
      }
    }

    // Fall back to panel edges when no neighbor on that side
    const leftGap  = nearestLeft  ? nearestLeft.gap  : myL;
    const rightGap = nearestRight ? nearestRight.gap  : panelWidth - myR;
    const topGap   = nearestTop   ? nearestTop.gap    : myT;
    const bottomGap= nearestBottom? nearestBottom.gap : panelHeight - myB;

    if (leftGap > 0) {
      labels.push({ axis: 'h', side: 'left', dist: Math.round(leftGap), x: myL - leftGap, y: myCY, length: leftGap });
    }
    if (rightGap > 0) {
      labels.push({ axis: 'h', side: 'right', dist: Math.round(rightGap), x: myR, y: myCY, length: rightGap });
    }
    if (topGap > 0) {
      labels.push({ axis: 'v', side: 'top', dist: Math.round(topGap), x: myCX, y: myT - topGap, length: topGap });
    }
    if (bottomGap > 0) {
      labels.push({ axis: 'v', side: 'bottom', dist: Math.round(bottomGap), x: myCX, y: myB, length: bottomGap });
    }

    return labels;
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
    distanceLabels = $showDistances ? computeDistances(transientX, transientY, displayW, displayH) : [];

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
    const shiftKey = e.shiftKey;

    let { x, y, w, h } = resizeStartRect;

    const handle = resizeHandle;

    // Apply deltas based on handle position
    if (handle.includes('r')) { w += dx; }
    if (handle.includes('l')) { x += dx; w -= dx; }
    if (handle.includes('b')) { h += dy; }
    if (handle.includes('t')) { y += dy; h -= dy; }

    // Aspect ratio lock: from Shift key OR from the aspectLock property
    const aspectLocked = shiftKey || (transform?.aspectLock === true);
    if (aspectLocked && handle.length === 2) {
      const aspect = resizeStartRect.w / resizeStartRect.h;
      if (Math.abs(dx) > Math.abs(dy)) {
        h = w / aspect;
        if (handle.includes('t')) y = resizeStartRect.y + resizeStartRect.h - h;
      } else {
        w = h * aspect;
        if (handle.includes('l')) x = resizeStartRect.x + resizeStartRect.w - w;
      }
    }

    // Enforce min/max size constraints
    const minW = Math.max(MIN_SIZE, transform?.minWidth || 0);
    const minH = Math.max(MIN_SIZE, transform?.minHeight || 0);
    const maxW = transform?.maxWidth || 0;
    const maxH = transform?.maxHeight || 0;

    if (w < minW) { w = minW; if (handle.includes('l')) x = resizeStartRect.x + resizeStartRect.w - minW; }
    if (h < minH) { h = minH; if (handle.includes('t')) y = resizeStartRect.y + resizeStartRect.h - minH; }
    if (maxW > 0 && w > maxW) { w = maxW; if (handle.includes('l')) x = resizeStartRect.x + resizeStartRect.w - maxW; }
    if (maxH > 0 && h > maxH) { h = maxH; if (handle.includes('t')) y = resizeStartRect.y + resizeStartRect.h - maxH; }

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
    distanceLabels = $showDistances ? computeDistances(transientX, transientY, transientW, transientH) : [];
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

    // Calculate the component center in screen space
    const cx = displayX + displayW / 2;
    const cy = displayY + displayH / 2;

    // Get panel-surface position to convert mouse coords to panel space
    const surface = e.target.closest('.panel-surface');
    const rect = surface?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = (e.clientX - rect.left) / scale;
    const mouseY = (e.clientY - rect.top) / scale;
    rotateStartAngle = Math.atan2(mouseY - cy, mouseX - cx);

    window.addEventListener('mousemove', handleRotateMove);
    window.addEventListener('mouseup', handleRotateEnd);
  }

  function handleRotateMove(e) {
    if (!isRotating) return;

    const cx = displayX + displayW / 2;
    const cy = displayY + displayH / 2;

    const surface = document.querySelector('.panel-surface');
    const rect = surface?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = (e.clientX - rect.left) / scale;
    const mouseY = (e.clientY - rect.top) / scale;
    const currentAngle = Math.atan2(mouseY - cy, mouseX - cx);
    let delta = (currentAngle - rotateStartAngle) * (180 / Math.PI);

    let newRotation = rotateStartRotation + delta;

    // Shift = snap to 15° increments
    if (e.shiftKey) {
      newRotation = Math.round(newRotation / 15) * 15;
    }

    transientRotation = newRotation;
  }

  function handleRotateEnd() {
    if (!isRotating) return;
    window.removeEventListener('mousemove', handleRotateMove);
    window.removeEventListener('mouseup', handleRotateEnd);

    if (core?.id && transientRotation !== rotateStartRotation) {
      // Normalise to 0-360
      let deg = transientRotation % 360;
      if (deg < 0) deg += 360;
      updateControlProperty(core.id, 'Transform.rotation', Math.round(deg * 10) / 10);
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
  style="left:{displayX}px; top:{displayY}px; width:{displayW}px; height:{displayH}px; opacity:{transform?.opacity ?? 1}; {displayRotation ? `transform:rotate(${displayRotation}deg); transform-origin:center center;` : ''}"
  onmousedown={handleMouseDown}
>
  <div class="control-content">
    {#if background}
      <BackgroundRenderer {background} />
    {/if}

    <span class="control-label">{core?.name ?? ''}</span>
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
    border-radius: 2px;
    cursor: default;
  }

  .control-content {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 2px;
    pointer-events: none;
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
