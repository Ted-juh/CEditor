<script>
  import { guides, removeGuide, updateGuide, draggingGuide, selectedGuide } from '../stores/guides.js';
  import { rulerCreateDrag, pendingGuideOf, pendingGuideFor } from '../utils/guideGeometry.js';

  const RULER_SIZE = 20;
  const NICE_INTERVALS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

  let {
    orientation = 'horizontal',
    length = 0,
    scrollOffset = 0,
    contentOffset = 40,
    scale = 1,
    gridStep = 0,
    onGuideCreate = null,
    // Transient guide markers along this ruler's axis, in content coords, e.g.
    // the custom-design surface's live smart guides. Each: { value, kind }
    // where kind 'center' draws distinct from a plain snap.
    markers = [],
  } = $props();

  let canvasEl = $state(null);
  let isHorizontal = $derived(orientation === 'horizontal');

  // Horizontal ruler = X axis → shows vertical guides; vertical ruler = Y axis → shows horizontal guides
  let guidePositions = $derived(
    isHorizontal ? $guides.vertical : $guides.horizontal
  );
  let guideOrientation = $derived(isHorizontal ? 'vertical' : 'horizontal');

  // A guide being pulled out of the OPPOSITE ruler is marked on this one: drag down out of the
  // horizontal ruler and the guide you get is horizontal, and horizontal guides live on the
  // vertical ruler's axis. Read from the shared store rather than from local drag state so the
  // marker, the canvas line and the label can never disagree about where the new guide is.
  let pendingMarker = $derived(pendingGuideFor($draggingGuide, guideOrientation));

  // Convert panel coord → ruler screen pixel
  function panelToRuler(pc) {
    return pc * scale - scrollOffset + contentOffset;
  }

  // Pick a tick interval so on-screen spacing is ~50-100px
  function pickInterval(s) {
    for (const iv of NICE_INTERVALS) {
      if (iv * s >= 50) return iv;
    }
    return 1000;
  }

  // Redraw ruler whenever inputs change
  $effect(() => {
    if (!canvasEl || length <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = isHorizontal ? length : RULER_SIZE;
    const h = isHorizontal ? RULER_SIZE : length;

    canvasEl.width = w * dpr;
    canvasEl.height = h * dpr;
    canvasEl.style.width = `${w}px`;
    canvasEl.style.height = `${h}px`;

    const ctx = canvasEl.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);

    // Border
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    if (isHorizontal) {
      ctx.beginPath(); ctx.moveTo(0, h - 0.5); ctx.lineTo(w, h - 0.5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(w - 0.5, 0); ctx.lineTo(w - 0.5, h); ctx.stroke();
    }

    // When a grid step is supplied (e.g. the custom design surface), ruler
    // subdivisions and labels follow the grid so every tick lands on a multiple
    // of the grid size (0-11-22-33 for grid 11). Otherwise fall back to "nice"
    // intervals chosen to keep ~50px between major ticks at the current zoom.
    const useGrid = gridStep > 0;
    let tickStep;   // panel units between ticks
    let interval;   // panel units between labelled (major) ticks in nice mode
    if (useGrid) {
      tickStep = gridStep;
      // Keep ticks at least ~5px apart on screen; doubling stays on grid multiples.
      while (tickStep * scale < 5) tickStep *= 2;
      interval = tickStep;
    } else {
      interval = pickInterval(scale);
      tickStep = interval / (interval >= 5 ? 5 : 2);
    }

    // Range of panel coords visible
    const panelStart = (scrollOffset - contentOffset) / scale;
    const panelEnd = (scrollOffset + (isHorizontal ? w : h) - contentOffset) / scale;

    const firstTick = Math.floor(panelStart / tickStep) * tickStep;

    ctx.font = '9px sans-serif';
    ctx.textBaseline = isHorizontal ? 'top' : 'middle';
    ctx.textAlign = isHorizontal ? 'center' : 'left';

    // Minimum on-screen gap (px) between two adjacent labels in grid mode.
    const LABEL_GAP = 6;
    let lastLabelEnd = -Infinity;

    for (let pc = firstTick; pc <= panelEnd; pc += tickStep) {
      const screenPos = pc * scale - scrollOffset + contentOffset;

      let isMajor;
      let label = null;
      if (useGrid) {
        // Every grid line is a tick; label as many as fit without colliding so
        // labels always sit on grid multiples but never overlap when zoomed out.
        label = String(Math.round(pc));
        const labelSpan = isHorizontal ? ctx.measureText(label).width : 9;
        if (screenPos - labelSpan / 2 >= lastLabelEnd + LABEL_GAP) {
          isMajor = true;
          lastLabelEnd = screenPos + labelSpan / 2;
        } else {
          isMajor = false;
        }
      } else {
        isMajor = Math.abs(pc - Math.round(pc / interval) * interval) < 0.01;
        if (isMajor) label = String(Math.round(pc));
      }

      const tickLen = isMajor ? 10 : 5;
      ctx.strokeStyle = isMajor ? '#888' : '#555';
      ctx.lineWidth = 1;
      ctx.beginPath();

      if (isHorizontal) {
        const x = Math.round(screenPos) + 0.5;
        ctx.moveTo(x, h - tickLen);
        ctx.lineTo(x, h);
      } else {
        const y = Math.round(screenPos) + 0.5;
        ctx.moveTo(w - tickLen, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      if (isMajor && label !== null) {
        ctx.fillStyle = '#999';
        if (isHorizontal) {
          ctx.fillText(label, screenPos, 2);
        } else {
          ctx.save();
          ctx.translate(2, screenPos);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }

    // Transient smart-guide markers: a full-depth tick in magenta (or amber for
    // the artboard-center guide) so an active snap shows in the ruler too.
    for (const marker of markers) {
      const value = typeof marker === 'number' ? marker : marker?.value;
      if (value == null) continue;
      const isCenter = marker?.kind === 'center';
      const screenPos = value * scale - scrollOffset + contentOffset;
      ctx.strokeStyle = isCenter ? '#FACC15' : '#EC4899';
      ctx.lineWidth = isCenter ? 2 : 1.5;
      ctx.beginPath();
      if (isHorizontal) {
        const x = Math.round(screenPos) + 0.5;
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
      } else {
        const y = Math.round(screenPos) + 0.5;
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      ctx.stroke();
    }
  });

  // --- Drag from empty ruler area to create guide ---
  //
  // The move handler used to be `() => {}`: the guide existed only from mouseup onwards, so the
  // whole gesture was performed blind and you learned where the guide had landed by looking at
  // it afterwards. It now publishes the pending guide to `draggingGuide` on every move, which is
  // what makes the preview show up on this ruler's opposite number AND as a full line on the
  // canvas without any of them talking to each other.
  function handleRulerMouseDown(e) {
    if (e.button !== 0) return;
    // Don't start create-drag if clicking on a marker
    if (e.target.closest('.guide-marker')) return;
    // No creator wired — the custom design surface reuses this ruler for its ticks and markers
    // only. Starting a drag there would preview a guide that mouseup could never commit.
    if (!onGuideCreate) return;
    e.preventDefault();

    const newOrientation = isHorizontal ? 'horizontal' : 'vertical';

    // Both rects are re-read per event instead of captured at mousedown: the canvas scrolls and
    // zooms under a drag in this editor, and a stale surface rect would silently place the guide
    // at the position it *would* have had before the view moved.
    const measure = (ev) => {
      if (!canvasEl) return null;
      const surface = canvasEl.closest('.canvas-area')?.querySelector('.panel-surface');
      if (!surface) return null;
      return rulerCreateDrag(
        newOrientation,
        ev,
        canvasEl.getBoundingClientRect(),
        surface.getBoundingClientRect(),
        scale,
      );
    };

    const createDragMove = (ev) => {
      // Dragging back over the ruler clears the preview rather than freezing the last one, so
      // the canvas always shows what releasing right here would leave behind.
      draggingGuide.set(pendingGuideOf(measure(ev)));
    };

    const createDragEnd = (ev) => {
      window.removeEventListener('mousemove', createDragMove);
      window.removeEventListener('mouseup', createDragEnd);

      const drag = measure(ev);
      // Cleared first and unconditionally, ahead of the cancel check: releasing back over the
      // ruler must leave no guide AND no preview, and an early return that skipped this line
      // would strand a guide-shaped ghost on the canvas with nothing behind it.
      draggingGuide.set(null);
      if (!drag?.outside) return;
      onGuideCreate(drag.orientation, drag.pos);
    };

    window.addEventListener('mousemove', createDragMove);
    window.addEventListener('mouseup', createDragEnd);
  }

  // --- Guide marker interaction: select, drag, delete ---
  let dragStartMouse = $state(0);
  let dragStartPos = $state(0);

  function handleMarkerMouseDown(index, pos, e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    dragStartPos = pos;
    dragStartMouse = isHorizontal ? e.clientX : e.clientY;
    draggingGuide.set({ orientation: guideOrientation, index, pos });

    window.addEventListener('mousemove', handleMarkerDragMove);
    window.addEventListener('mouseup', handleMarkerDragEnd);
  }

  function handleMarkerDragMove(e) {
    const dg = $draggingGuide;
    if (!dg) return;
    const delta = (isHorizontal
      ? e.clientX - dragStartMouse
      : e.clientY - dragStartMouse) / scale;
    draggingGuide.set({ ...dg, pos: Math.round(dragStartPos + delta) });
  }

  function handleMarkerDragEnd() {
    window.removeEventListener('mousemove', handleMarkerDragMove);
    window.removeEventListener('mouseup', handleMarkerDragEnd);

    const dg = $draggingGuide;
    if (dg && dg.pos !== dragStartPos) {
      updateGuide(dg.orientation, dg.index, dg.pos);
    }

    draggingGuide.set(null);
  }

  function handleMarkerRightClick(index, e) {
    e.preventDefault();
    e.stopPropagation();
    removeGuide(guideOrientation, index);
  }

  function markerScreenPos(index, pos) {
    const dg = $draggingGuide;
    if (dg && dg.orientation === guideOrientation && dg.index === index) {
      return panelToRuler(dg.pos);
    }
    return panelToRuler(pos);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ruler-wrapper" class:horizontal={isHorizontal} class:vertical={!isHorizontal}>
  <canvas
    bind:this={canvasEl}
    class="ruler-canvas"
    onmousedown={handleRulerMouseDown}
    style="cursor: {isHorizontal ? 'row-resize' : 'col-resize'};"
  ></canvas>

  {#each guidePositions as pos, i}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="guide-marker"
      class:selected={$selectedGuide?.orientation === guideOrientation && $selectedGuide?.index === i}
      class:is-horizontal={isHorizontal}
      class:is-vertical={!isHorizontal}
      style="{isHorizontal ? `left:${markerScreenPos(i, pos)}px;` : `top:${markerScreenPos(i, pos)}px;`}"
      onmousedown={(e) => handleMarkerMouseDown(i, pos, e)}
      oncontextmenu={(e) => handleMarkerRightClick(i, e)}
      title="{Math.round(pos)}px — drag to move, right-click to remove"
    >
      <div class="marker-tab"></div>
    </div>
  {/each}

  {#if pendingMarker}
    <!-- The guide currently being pulled out of the other ruler. Inert: it has no index in the
         document yet, so there is nothing here to grab, move or right-click away. -->
    <div
      class="guide-marker pending"
      class:is-horizontal={isHorizontal}
      class:is-vertical={!isHorizontal}
      style="{isHorizontal ? `left:${panelToRuler(pendingMarker.pos)}px;` : `top:${panelToRuler(pendingMarker.pos)}px;`}"
    >
      <div class="marker-tab"></div>
    </div>
  {/if}
</div>

<style>
  .ruler-wrapper {
    position: absolute;
    z-index: 20;
    overflow: visible;
  }

  .ruler-wrapper.horizontal {
    top: 0;
    left: 20px;
    right: 0;
    height: 20px;
  }

  .ruler-wrapper.vertical {
    top: 20px;
    left: 0;
    bottom: 0;
    width: 20px;
  }

  .ruler-canvas {
    display: block;
    position: absolute;
    inset: 0;
  }

  /* Guide markers on the ruler */
  .guide-marker {
    position: absolute;
    z-index: 2;
    outline: none;
  }

  .guide-marker.is-horizontal {
    top: 0;
    height: 20px;
    width: 0;
    cursor: ew-resize;
  }

  .guide-marker.is-vertical {
    left: 0;
    width: 20px;
    height: 0;
    cursor: ns-resize;
  }

  .marker-tab {
    position: absolute;
    background: #00BFFF;
  }

  .is-horizontal .marker-tab {
    width: 2px;
    height: 100%;
    left: -1px;
    top: 0;
  }

  .is-vertical .marker-tab {
    height: 2px;
    width: 100%;
    top: -1px;
    left: 0;
  }

  /* Wider hit zone */
  .guide-marker::after {
    content: '';
    position: absolute;
  }

  .is-horizontal::after {
    left: -5px;
    right: -5px;
    top: 0;
    bottom: 0;
    width: 12px;
  }

  .is-vertical::after {
    top: -5px;
    bottom: -5px;
    left: 0;
    right: 0;
    height: 12px;
  }

  .guide-marker.selected .marker-tab {
    background: #FFD700;
  }

  /* The in-flight create-drag: same colour as a real guide so what you drag is what you get,
     but it must never eat the pointer — the mousemove/mouseup pair driving the drag is on the
     window, and a hit zone appearing under the cursor mid-gesture would fight it. */
  .guide-marker.pending {
    pointer-events: none;
  }

  .guide-marker.pending .marker-tab {
    background: #FFF;
  }

  .guide-marker:hover .marker-tab {
    background: #FFF;
  }
</style>
