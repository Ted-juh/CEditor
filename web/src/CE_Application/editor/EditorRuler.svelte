<script>
  import { guides, removeGuide, updateGuide, draggingGuide, selectedGuide } from '../stores/guides.js';

  const RULER_SIZE = 20;
  const NICE_INTERVALS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

  let {
    orientation = 'horizontal',
    length = 0,
    scrollOffset = 0,
    scale = 1,
    onGuideCreate = null,
  } = $props();

  let canvasEl = $state(null);
  let isHorizontal = $derived(orientation === 'horizontal');

  // Horizontal ruler = X axis → shows vertical guides; vertical ruler = Y axis → shows horizontal guides
  let guidePositions = $derived(
    isHorizontal ? $guides.vertical : $guides.horizontal
  );
  let guideOrientation = $derived(isHorizontal ? 'vertical' : 'horizontal');

  // Convert panel coord → ruler screen pixel
  function panelToRuler(pc) {
    return pc * scale - scrollOffset + 40;
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

    const interval = pickInterval(scale);
    const subDiv = interval >= 10 ? 5 : (interval >= 5 ? 5 : 2);
    const subInterval = interval / subDiv;

    // Range of panel coords visible
    const panelStart = (scrollOffset - 40) / scale;
    const panelEnd = (scrollOffset + (isHorizontal ? w : h) - 40) / scale;

    const firstSub = Math.floor(panelStart / subInterval) * subInterval;

    ctx.fillStyle = '#999';
    ctx.font = '9px sans-serif';
    ctx.textBaseline = isHorizontal ? 'top' : 'middle';
    ctx.textAlign = isHorizontal ? 'center' : 'left';

    for (let pc = firstSub; pc <= panelEnd; pc += subInterval) {
      const screenPos = pc * scale - scrollOffset + 40;
      const isMajor = Math.abs(pc - Math.round(pc / interval) * interval) < 0.01;
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

      if (isMajor) {
        const label = String(Math.round(pc));
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
  });

  // --- Drag from empty ruler area to create guide ---
  function handleRulerMouseDown(e) {
    if (e.button !== 0) return;
    // Don't start create-drag if clicking on a marker
    if (e.target.closest('.guide-marker')) return;
    e.preventDefault();

    const createDragMove = () => {};
    const createDragEnd = (ev) => {
      window.removeEventListener('mousemove', createDragMove);
      window.removeEventListener('mouseup', createDragEnd);

      const rect = canvasEl.getBoundingClientRect();

      if (isHorizontal) {
        if (ev.clientY <= rect.bottom) return;
        const viewport = canvasEl.closest('.canvas-area')?.querySelector('.canvas-viewport');
        if (!viewport) return;
        const vpRect = viewport.getBoundingClientRect();
        const panelY = (ev.clientY - vpRect.top + viewport.scrollTop - 40) / scale;
        onGuideCreate?.('horizontal', panelY);
      } else {
        if (ev.clientX <= rect.right) return;
        const viewport = canvasEl.closest('.canvas-area')?.querySelector('.canvas-viewport');
        if (!viewport) return;
        const vpRect = viewport.getBoundingClientRect();
        const panelX = (ev.clientX - vpRect.left + viewport.scrollLeft - 40) / scale;
        onGuideCreate?.('vertical', panelX);
      }
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

  .guide-marker:hover .marker-tab {
    background: #FFF;
  }
</style>
