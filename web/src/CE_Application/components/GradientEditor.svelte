<script>
  /**
   * GradientEditor — Interactive gradient preview with draggable handles.
   *
   * Radial types: axis from center → center+radius. Stop 0% = center, 100% = radius edge.
   *   Draggable center handle, radius handle(s), and stop handles on the axis.
   * Linear types: axis through shape center from edge to edge. Stop 0% = start, 100% = end.
   */
  import { onMount } from 'svelte';
  import { gradientToCSS, gradientFilterCSS, gradientBlendCSS, interpolateColor, squareRampToDataURL } from '../utils/gradientCSS.js';

  let props = $props();
  let gradient = $derived(props.gradient);
  let selectedStop = $derived(props.selectedStop ?? 0);
  let shape = $derived(props.shape ?? 'rectangle');
  let onchange = $derived(props.onchange);
  let onSelectStop = $derived(props.onSelectStop);

  // Internal state for smooth dragging
  let internalStops = $state([]);
  let internalCenterX = $state(50);
  let internalCenterY = $state(50);
  let internalRadiusX = $state(50);
  let internalRadiusY = $state(50);
  let dragging = $state(false);
  let editorEl = $state(null);
  let shapeSize = $state(0);
  let editorWidth = $state(100);
  let editorHeight = $state(100);

  // Measure editor container
  onMount(() => {
    if (!editorEl) return;
    const ro = new ResizeObserver(([entry]) => {
      editorWidth = entry.contentRect.width;
      editorHeight = entry.contentRect.height;
    });
    ro.observe(editorEl);
    return () => ro.disconnect();
  });

  $effect(() => {
    shapeSize = Math.floor(Math.min(editorWidth, editorHeight) * 0.85);
  });

  let shapeW = $derived(shape === 'ellipse' ? Math.floor(editorWidth * 0.85) : shapeSize);
  let shapeH = $derived(shape === 'ellipse' ? Math.floor(editorHeight * 0.85) : shapeSize);

  // Sync from prop when NOT dragging
  let ignoreNextSync = false;
  $effect(() => {
    const g = gradient;
    if (!dragging && !ignoreNextSync && g) {
      if (g.stops) internalStops = g.stops.map(s => ({ ...s }));
      internalCenterX = g.centerX ?? 50;
      internalCenterY = g.centerY ?? 50;
      internalRadiusX = g.radiusX ?? 50;
      internalRadiusY = g.radiusY ?? 50;
    }
    ignoreNextSync = false;
  });

  // Build gradient with ALL internal state for live rendering
  let renderGradient = $derived({
    ...gradient,
    stops: internalStops,
    centerX: internalCenterX,
    centerY: internalCenterY,
    radiusX: internalRadiusX,
    radiusY: internalRadiusY,
  });
  let cssGradient = $derived(
    renderGradient.type === 'squareRamp'
      ? `url(${squareRampToDataURL(renderGradient, 256, 256)})`
      : gradientToCSS(renderGradient, shape)
  );
  let cssFilter = $derived(gradientFilterCSS(renderGradient));
  let cssBlend = $derived(gradientBlendCSS(renderGradient));

  let shapeClass = $derived(
    shape === 'circle' ? 'shape-circle'
    : shape === 'square' ? 'shape-square'
    : shape === 'ellipse' ? 'shape-ellipse'
    : shape === 'triangle' ? 'shape-triangle'
    : ''
  );
  let needsShapeContainer = $derived(shape !== 'rectangle');

  // --- Axis geometry ---
  // Radial: axis from gradient center → center+radius (one direction, horizontal)
  // Linear: axis through 50,50 (or gradient center for conical) from edge to edge

  let isRadialAxis = $derived(['radial', 'radialRamp'].includes(gradient.type));
  let hasCenterControl = $derived(['radial', 'radialRamp', 'conical'].includes(gradient.type));
  let hasRadiusControl = $derived(['radial', 'radialRamp'].includes(gradient.type));

  let axisAngle = $derived((() => {
    switch (gradient.type) {
      case 'radial':
      case 'radialRamp':
        return 90; // horizontal
      case 'conical':
        return gradient.angle ?? 0;
      default:
        return (gradient.angle ?? 90);
    }
  })());

  // CSS angle to radians (0°=up, 90°=right, clockwise)
  let axisRad = $derived((axisAngle - 90) * Math.PI / 180);

  // Axis center follows gradient center for types with center control
  let axisCenterX = $derived(hasCenterControl ? internalCenterX : 50);
  let axisCenterY = $derived(hasCenterControl ? internalCenterY : 50);

  // Half-length for linear axis types (ray-cast to edges)
  let linearHalfLen = $derived((() => {
    if (shape !== 'rectangle') return 48;
    const cx = axisCenterX, cy = axisCenterY;
    const dx = Math.cos(axisRad), dy = Math.sin(axisRad);
    let tMin = Infinity;
    if (Math.abs(dx) > 0.001) tMin = Math.min(tMin, Math.abs((dx > 0 ? 100 - cx : cx) / dx));
    if (Math.abs(dy) > 0.001) tMin = Math.min(tMin, Math.abs((dy > 0 ? 100 - cy : cy) / dy));
    return Math.min(tMin * 0.95, 50);
  })());

  // Axis start (stop 0%) and end (stop 100%) points in container %
  let axisStart = $derived((() => {
    if (isRadialAxis) {
      // 0% = at center
      return { x: axisCenterX, y: axisCenterY };
    }
    const dx = Math.cos(axisRad), dy = Math.sin(axisRad);
    return { x: axisCenterX - dx * linearHalfLen, y: axisCenterY - dy * linearHalfLen };
  })());

  let axisEnd = $derived((() => {
    if (isRadialAxis) {
      // 100% = at center + radius (horizontal)
      return { x: axisCenterX + internalRadiusX, y: axisCenterY };
    }
    const dx = Math.cos(axisRad), dy = Math.sin(axisRad);
    return { x: axisCenterX + dx * linearHalfLen, y: axisCenterY + dy * linearHalfLen };
  })());

  let axisContainerEl = $state(null);

  // Project mouse onto axis line, returning 0-100 stop position
  function projectOntoAxis(e) {
    const el = axisContainerEl;
    if (!el) return 50;
    const rect = el.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;

    const ax = axisEnd.x - axisStart.x;
    const ay = axisEnd.y - axisStart.y;
    const len2 = ax * ax + ay * ay;
    if (len2 < 0.001) return 0;

    const t = ((mx - axisStart.x) * ax + (my - axisStart.y) * ay) / len2;
    return Math.max(0, Math.min(100, Math.round(t * 100)));
  }

  // Position a stop thumb between axisStart (0%) and axisEnd (100%)
  function getThumbStyle(stop) {
    const t = stop.position / 100;
    const x = axisStart.x + (axisEnd.x - axisStart.x) * t;
    const y = axisStart.y + (axisEnd.y - axisStart.y) * t;
    return `left: ${x}%; top: ${y}%; background: #${stop.color}`;
  }

  // SVG line: main axis
  let lineStyle = $derived({
    x1: axisStart.x, y1: axisStart.y,
    x2: axisEnd.x, y2: axisEnd.y,
  });

  // Perpendicular axis for Y radius (radial in rectangle mode)
  let showPerpAxis = $derived(hasRadiusControl && (shape === 'rectangle' || shape === 'ellipse'));
  let perpAxisEnd = $derived(
    hasRadiusControl
      ? { x: axisCenterX, y: axisCenterY + internalRadiusY }
      : { x: axisCenterX, y: axisCenterY }
  );
  let perpLineStyle = $derived({
    x1: axisCenterX, y1: axisCenterY,
    x2: perpAxisEnd.x, y2: perpAxisEnd.y,
  });

  // --- Emit helper ---
  function emitChange() {
    if (onchange) onchange({
      ...gradient,
      stops: internalStops,
      centerX: internalCenterX,
      centerY: internalCenterY,
      radiusX: internalRadiusX,
      radiusY: internalRadiusY,
    });
  }

  // --- Interaction handlers ---

  function handleStopMouseDown(index, e) {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    if (onSelectStop) onSelectStop(index);

    function onMove(ev) {
      const pos = projectOntoAxis(ev);
      internalStops = internalStops.map((s, i) =>
        i === index ? { ...s, position: pos } : s
      );
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      dragging = false;
      justDragged = true;
      ignoreNextSync = true;
      emitChange();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleCenterMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;

    function onMove(ev) {
      const el = axisContainerEl;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      internalCenterX = Math.max(0, Math.min(100, Math.round(((ev.clientX - rect.left) / rect.width) * 100)));
      internalCenterY = Math.max(0, Math.min(100, Math.round(((ev.clientY - rect.top) / rect.height) * 100)));
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      dragging = false;
      justDragged = true;
      ignoreNextSync = true;
      emitChange();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleRadiusMouseDown(axis, e) {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;

    function onMove(ev) {
      const el = axisContainerEl;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = ((ev.clientX - rect.left) / rect.width) * 100;
      const my = ((ev.clientY - rect.top) / rect.height) * 100;

      if (axis === 'x') {
        internalRadiusX = Math.max(1, Math.round(Math.abs(mx - internalCenterX)));
      } else {
        internalRadiusY = Math.max(1, Math.round(Math.abs(my - internalCenterY)));
      }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      dragging = false;
      justDragged = true;
      ignoreNextSync = true;
      emitChange();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  let justDragged = false;

  function handleAxisClick(e) {
    if (justDragged) { justDragged = false; return; }
    if (e.target.closest('.stop-thumb') || e.target.closest('.center-handle') || e.target.closest('.radius-handle')) return;
    const position = projectOntoAxis(e);
    const color = interpolateColor(internalStops, position);
    const newStops = [...internalStops, { color, position }];
    internalStops = newStops;
    ignoreNextSync = true;
    if (onchange) onchange({ ...gradient, stops: newStops });
    if (onSelectStop) onSelectStop(newStops.length - 1);
  }

  function handleStopRightClick(index, e) {
    e.preventDefault();
    e.stopPropagation();
    if (internalStops.length <= 2) return;
    const newStops = internalStops.filter((_, i) => i !== index);
    internalStops = newStops;
    ignoreNextSync = true;
    if (onchange) onchange({ ...gradient, stops: newStops });
    if (onSelectStop) onSelectStop(Math.min(index, newStops.length - 1));
  }
</script>

<div class="gradient-editor" bind:this={editorEl}>
  <div class="checkerboard"></div>

  {#if needsShapeContainer}
    <div class="shape-container">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="gradient-surface {shapeClass} axis-host"
        style="width: {shapeW}px; height: {shapeH}px;"
        bind:this={axisContainerEl}
        onclick={handleAxisClick}
      >
        <div class="gradient-bg" style="background: {cssGradient}; background-size: 100% 100%;{cssFilter ? ` filter: ${cssFilter};` : ''}{cssBlend ? ` background-blend-mode: ${cssBlend};` : ''}"></div>
        <svg class="axis-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1={lineStyle.x1} y1={lineStyle.y1} x2={lineStyle.x2} y2={lineStyle.y2}
            stroke="rgba(255,255,255,0.3)" stroke-width="0.4" stroke-dasharray="1.5,1" />
          {#if showPerpAxis}
            <line x1={perpLineStyle.x1} y1={perpLineStyle.y1} x2={perpLineStyle.x2} y2={perpLineStyle.y2}
              stroke="rgba(255,255,255,0.15)" stroke-width="0.3" stroke-dasharray="1,1.5" />
          {/if}
        </svg>
        {#if hasCenterControl}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="center-handle"
            style="left: {axisCenterX}%; top: {axisCenterY}%"
            onmousedown={handleCenterMouseDown}
          ></div>
        {/if}
        {#if hasRadiusControl}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="radius-handle"
            style="left: {axisEnd.x}%; top: {axisEnd.y}%"
            onmousedown={(e) => handleRadiusMouseDown('x', e)}
          ></div>
          {#if shape === 'rectangle' || shape === 'ellipse'}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="radius-handle perp"
              style="left: {perpAxisEnd.x}%; top: {perpAxisEnd.y}%"
              onmousedown={(e) => handleRadiusMouseDown('y', e)}
            ></div>
          {/if}
        {/if}
        {#each internalStops as stop, i}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="stop-thumb" class:selected={i === selectedStop}
            style={getThumbStyle(stop)}
            onmousedown={(e) => handleStopMouseDown(i, e)}
            oncontextmenu={(e) => handleStopRightClick(i, e)}
          ></div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="gradient-surface full" style="background: {cssGradient}; background-size: 100% 100%;{cssFilter ? ` filter: ${cssFilter};` : ''}{cssBlend ? ` background-blend-mode: ${cssBlend};` : ''}"></div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="axis-overlay axis-host" bind:this={axisContainerEl} onclick={handleAxisClick}>
      <svg class="axis-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1={lineStyle.x1} y1={lineStyle.y1} x2={lineStyle.x2} y2={lineStyle.y2}
          stroke="rgba(255,255,255,0.3)" stroke-width="0.4" stroke-dasharray="1.5,1" />
        {#if showPerpAxis}
          <line x1={perpLineStyle.x1} y1={perpLineStyle.y1} x2={perpLineStyle.x2} y2={perpLineStyle.y2}
            stroke="rgba(255,255,255,0.15)" stroke-width="0.3" stroke-dasharray="1,1.5" />
        {/if}
      </svg>
      {#if hasCenterControl}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="center-handle"
          style="left: {axisCenterX}%; top: {axisCenterY}%"
          onmousedown={handleCenterMouseDown}
        ></div>
      {/if}
      {#if hasRadiusControl}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="radius-handle"
          style="left: {axisEnd.x}%; top: {axisEnd.y}%"
          onmousedown={(e) => handleRadiusMouseDown('x', e)}
        ></div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="radius-handle perp"
          style="left: {perpAxisEnd.x}%; top: {perpAxisEnd.y}%"
          onmousedown={(e) => handleRadiusMouseDown('y', e)}
        ></div>
      {/if}
      {#each internalStops as stop, i}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="stop-thumb" class:selected={i === selectedStop}
          style={getThumbStyle(stop)}
          onmousedown={(e) => handleStopMouseDown(i, e)}
          oncontextmenu={(e) => handleStopRightClick(i, e)}
        ></div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .gradient-editor {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 120px;
    overflow: hidden;
    user-select: none;
  }

  .checkerboard {
    position: absolute;
    inset: 0;
    background: repeating-conic-gradient(#2A2A2A 0% 25%, #1A1A1A 0% 50%) 0 0 / 16px 16px;
    z-index: 0;
    pointer-events: none;
  }

  .gradient-surface {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }

  .gradient-surface.full {
    position: absolute;
    inset: 0;
  }

  .shape-container {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    pointer-events: none;
  }

  .shape-container .gradient-surface {
    position: relative;
    overflow: visible;
    pointer-events: auto;
  }

  .gradient-bg {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
  }

  .shape-container .shape-circle {
    border-radius: 50%;
  }

  .shape-container .shape-ellipse {
    border-radius: 50%;
  }

  .shape-container .shape-triangle {
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
  }

  /* Axis overlay — covers the full editor, handles clicks */
  .axis-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    cursor: crosshair;
  }

  .axis-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* Center handle — crosshair for dragging gradient origin */
  .center-handle {
    position: absolute;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    background: transparent;
    transform: translate(-50%, -50%);
    cursor: move;
    z-index: 5;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
  }

  .center-handle::before,
  .center-handle::after {
    content: '';
    position: absolute;
    background: rgba(255, 255, 255, 0.6);
  }

  .center-handle::before {
    width: 1px;
    height: 100%;
    left: 50%;
    transform: translateX(-50%);
  }

  .center-handle::after {
    height: 1px;
    width: 100%;
    top: 50%;
    transform: translateY(-50%);
  }

  /* Radius handle — diamond for dragging gradient extent */
  .radius-handle {
    position: absolute;
    width: 10px;
    height: 10px;
    border: 2px solid #5B9BD5;
    background: rgba(91, 155, 213, 0.3);
    transform: translate(-50%, -50%) rotate(45deg);
    cursor: ew-resize;
    z-index: 5;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
  }

  .radius-handle.perp {
    cursor: ns-resize;
  }

  .stop-thumb {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #888;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.6), inset 0 0 2px rgba(0, 0, 0, 0.2);
    transform: translate(-50%, -50%);
    cursor: grab;
    z-index: 3;
    transition: border-color 0.1s;
  }

  .stop-thumb:hover {
    border-color: #BBB;
  }

  .stop-thumb.selected {
    border-color: #fff;
    box-shadow: 0 0 6px rgba(91, 155, 213, 0.6), 0 0 3px rgba(0, 0, 0, 0.6);
    z-index: 4;
  }

  .stop-thumb:active {
    cursor: grabbing;
  }
</style>
