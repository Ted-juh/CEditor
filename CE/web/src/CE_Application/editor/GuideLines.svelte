<script>
  import { guides, removeGuide, updateGuide, selectedGuide, draggingGuide } from '../stores/guides.js';
  import {
    guideLineStyle,
    pasteboardExtent,
    pendingGuideFor,
    sameExtent,
    NO_PASTEBOARD,
  } from '../utils/guideGeometry.js';

  let { scale = 1, panelWidth = 0, panelHeight = 0 } = $props();

  let hGuides = $derived($guides.horizontal);
  let vGuides = $derived($guides.vertical);

  // The guide being pulled out of a ruler right now, if any. Same store the move-drag publishes
  // to, so the ruler marker and this line are one value read twice rather than two guesses.
  let pendingH = $derived(pendingGuideFor($draggingGuide, 'horizontal'));
  let pendingV = $derived(pendingGuideFor($draggingGuide, 'vertical'));

  // Line width that always appears 1px on screen regardless of zoom
  let lineWidth = $derived(1 / scale);

  // Hit zone width in panel coords (min 3px on screen)
  let hitZone = $derived(Math.max(3, 8 / scale));

  // Label font size that stays readable
  let labelSize = $derived(Math.max(9, 11 / scale));

  // --- Guides reach across the pasteboard, not just the panel ---
  //
  // A guide used to be `left:0; right:0` inside this `inset: 0` wrapper, so it stopped dead at the
  // panel edge and hovered over the pasteboard doing nothing. During editing `.panel-surface` is
  // `overflow: visible` (its own comment explains why), so a control can sit half off the
  // artboard with no line out there to align it to — and every other design tool runs its guides
  // to the edge of the viewport anyway.
  //
  // The overhang is measured, not assumed. Anything to the right or below the panel adds to the
  // scrollable area of the `overflow: auto` viewport, so a fixed generous tail would give the
  // canvas scrollbars pointing at empty space. Held as panel units and applied as negative
  // offsets, which keeps the existing zoom compensation intact: everything written inside the
  // scaled surface is divided by `scale` or it changes meaning with the zoom (review S1).
  let wrapperEl = $state(null);
  let extent = $state(NO_PASTEBOARD);
  // Deliberately NOT $state: comparing against the reactive copy inside the effect would make the
  // effect depend on its own output and tear its listeners down on every measurement.
  let measured = NO_PASTEBOARD;

  $effect(() => {
    // Read what moves the panel under the viewport — that is what subscribes this effect to it.
    void scale; void panelWidth; void panelHeight; void hGuides.length; void vGuides.length;
    if (!wrapperEl) return;

    // The scroll box in the editor canvas; the custom design surface names its own differently,
    // and anything else falls back to the clipping frame around the whole canvas.
    const view = wrapperEl.closest('.canvas-viewport')
      ?? wrapperEl.closest('.surface-scroll')
      ?? wrapperEl.closest('.canvas-area');
    if (!view) return;

    let frame = 0;
    const remeasure = () => {
      frame = 0;
      if (!wrapperEl) return;
      const next = pasteboardExtent(
        wrapperEl.getBoundingClientRect(),
        view.getBoundingClientRect(),
        scale,
      );
      if (sameExtent(next, measured)) return;
      measured = next;
      extent = next;
    };
    // Scrolling fires far faster than it can matter; one measurement per frame is plenty and
    // keeps two getBoundingClientRect calls out of the scroll handler's hot path.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(remeasure);
    };

    remeasure();
    view.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // The docks resize the viewport without scrolling or resizing the window, which is the case
    // a scroll+resize pair alone would miss.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(view);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      view.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  });

  function selectGuide(orientation, index) {
    selectedGuide.set({ orientation, index });
    // Focus the editor wrapper so Delete key reaches the keydown handler
    document.querySelector('.editor-wrapper')?.focus();
  }

  // --- Drag to reposition ---
  let dragStartMouse = $state(0);
  let dragStartPos = $state(0);

  function startDrag(orientation, index, pos, e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    selectGuide(orientation, index);

    dragStartPos = pos;
    dragStartMouse = orientation === 'horizontal' ? e.clientY : e.clientX;
    draggingGuide.set({ orientation, index, pos });

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  }

  function handleDragMove(e) {
    const dg = $draggingGuide;
    if (!dg) return;
    const delta = (dg.orientation === 'horizontal'
      ? e.clientY - dragStartMouse
      : e.clientX - dragStartMouse) / scale;
    draggingGuide.set({ ...dg, pos: Math.round(dragStartPos + delta) });
  }

  function handleDragEnd() {
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);

    const dg = $draggingGuide;
    if (dg && dg.pos !== dragStartPos) {
      updateGuide(dg.orientation, dg.index, dg.pos);
    }

    draggingGuide.set(null);
  }

  function handleRightClick(orientation, index, e) {
    e.preventDefault();
    e.stopPropagation();
    removeGuide(orientation, index);
    const sel = $selectedGuide;
    if (sel && sel.orientation === orientation && sel.index === index) {
      selectedGuide.set(null);
    }
  }

  function guidePos(orientation, index, storePos) {
    const dg = $draggingGuide;
    if (dg && dg.orientation === orientation && dg.index === index) {
      return dg.pos;
    }
    return storePos;
  }

  function isSelectedGuide(orientation, index) {
    const sel = $selectedGuide;
    return sel != null && sel.orientation === orientation && sel.index === index;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="guide-wrapper" bind:this={wrapperEl}>

{#each hGuides as pos, i}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="guide-line guide-h"
    class:selected={isSelectedGuide('horizontal', i)}
    style={guideLineStyle('horizontal', guidePos('horizontal', i, pos), extent, lineWidth)}
  >
    <div
      class="guide-hit-zone guide-hit-h"
      style="height:{hitZone}px;"
      onmousedown={(e) => startDrag('horizontal', i, pos, e)}
      oncontextmenu={(e) => handleRightClick('horizontal', i, e)}
    ></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class="guide-label"
      class:label-selected={isSelectedGuide('horizontal', i)}
      style="font-size:{labelSize}px;"
      onmousedown={(e) => startDrag('horizontal', i, pos, e)}
      oncontextmenu={(e) => handleRightClick('horizontal', i, e)}
    >{guidePos('horizontal', i, pos)}</span>
  </div>
{/each}

{#each vGuides as pos, i}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="guide-line guide-v"
    class:selected={isSelectedGuide('vertical', i)}
    style={guideLineStyle('vertical', guidePos('vertical', i, pos), extent, lineWidth)}
  >
    <div
      class="guide-hit-zone guide-hit-v"
      style="width:{hitZone}px;"
      onmousedown={(e) => startDrag('vertical', i, pos, e)}
      oncontextmenu={(e) => handleRightClick('vertical', i, e)}
    ></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class="guide-label"
      class:label-selected={isSelectedGuide('vertical', i)}
      style="font-size:{labelSize}px;"
      onmousedown={(e) => startDrag('vertical', i, pos, e)}
      oncontextmenu={(e) => handleRightClick('vertical', i, e)}
    >{guidePos('vertical', i, pos)}</span>
  </div>
{/each}

<!-- The guide being dragged out of a ruler right now. It has no index in the document, so it gets
     no hit zone and no right-click: there is nothing yet to move or remove. The label is the
     point of it — a live readout of where releasing would put the guide. -->
{#if pendingH}
  <div class="guide-line guide-h pending" style={guideLineStyle('horizontal', pendingH.pos, extent, lineWidth)}>
    <span class="guide-label" style="font-size:{labelSize}px;">{pendingH.pos}</span>
  </div>
{/if}

{#if pendingV}
  <div class="guide-line guide-v pending" style={guideLineStyle('vertical', pendingV.pos, extent, lineWidth)}>
    <span class="guide-label" style="font-size:{labelSize}px;">{pendingV.pos}</span>
  </div>
{/if}

</div>

<style>
  .guide-wrapper {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 150;
    outline: none;
  }

  .guide-line {
    position: absolute;
    pointer-events: none;
  }

  .guide-h {
    height: 0;
    border-top: 0 dashed #00BFFF;
  }

  .guide-v {
    width: 0;
    border-left: 0 dashed #00BFFF;
  }

  .guide-line.selected {
    border-color: #FFD700;
  }

  /* In-flight create-drag. Solid rather than dashed so "not committed yet" reads at a glance, and
     inert throughout: the gesture is driven by window-level mousemove/mouseup, and a hit zone
     materialising under the cursor mid-drag would compete with it. */
  .guide-line.pending {
    border-style: solid;
    pointer-events: none;
  }

  .guide-line.pending .guide-label {
    pointer-events: none;
    background: #FFF;
  }

  .guide-hit-zone {
    position: absolute;
    pointer-events: auto;
  }

  .guide-hit-h {
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    cursor: ns-resize;
  }

  .guide-hit-v {
    top: 0;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    cursor: ew-resize;
  }

  .guide-label {
    position: absolute;
    background: #00BFFF;
    color: #000;
    font-size: 9px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 2px;
    white-space: nowrap;
    pointer-events: auto;
    line-height: 1.4;
    cursor: pointer;
    user-select: none;
  }

  .guide-label:hover {
    background: #FFF;
  }

  .guide-label.label-selected {
    background: #FFD700;
    color: #000;
  }

  /* Anchored to the START of the line, which since the pasteboard fix is the left/top edge of the
     visible canvas rather than of the panel — so the readout follows the viewport instead of
     scrolling away with the artboard. */
  .guide-h .guide-label {
    left: 2px;
    top: 4px;
  }

  .guide-v .guide-label {
    top: 2px;
    left: 4px;
  }
</style>
