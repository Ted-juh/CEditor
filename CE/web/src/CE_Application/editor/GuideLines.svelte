<script>
  import { guides, removeGuide, updateGuide, selectedGuide, draggingGuide } from '../stores/guides.js';

  let { scale = 1, panelWidth = 0, panelHeight = 0 } = $props();

  let hGuides = $derived($guides.horizontal);
  let vGuides = $derived($guides.vertical);

  // Line width that always appears 1px on screen regardless of zoom
  let lineWidth = $derived(1 / scale);

  // Hit zone width in panel coords (min 3px on screen)
  let hitZone = $derived(Math.max(3, 8 / scale));

  // Label font size that stays readable
  let labelSize = $derived(Math.max(9, 11 / scale));

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
<div class="guide-wrapper">

{#each hGuides as pos, i}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="guide-line guide-h"
    class:selected={isSelectedGuide('horizontal', i)}
    style="top:{guidePos('horizontal', i, pos)}px; left:0; right:0; border-top-width:{lineWidth}px;"
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
    style="left:{guidePos('vertical', i, pos)}px; top:0; bottom:0; border-left-width:{lineWidth}px;"
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

  .guide-h .guide-label {
    left: 2px;
    top: 4px;
  }

  .guide-v .guide-label {
    top: 2px;
    left: 4px;
  }
</style>
