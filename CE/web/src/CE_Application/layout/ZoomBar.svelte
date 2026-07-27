<script>
  import Maximize from 'lucide-svelte/icons/maximize';
  import Ruler from 'lucide-svelte/icons/ruler';
  import Columns3 from 'lucide-svelte/icons/columns-3';
  import MoveHorizontal from 'lucide-svelte/icons/move-horizontal';
  import { editorZoom, editorZoomIncrement, activePanel } from '../stores/panels.js';
  import { showRulers, showGuides, showDistances } from '../stores/editorView.js';

  let isEditing = $state(false);
  let editValue = $state('100');

  let zoom = $derived($editorZoom);
  let increment = $derived($editorZoomIncrement);
  let panel = $derived($activePanel);

  function zoomIn() {
    editorZoom.update(z => Math.min(400, z + $editorZoomIncrement));
  }

  function zoomOut() {
    editorZoom.update(z => Math.max(10, z - $editorZoomIncrement));
  }

  function resetZoom() {
    editorZoom.set(100);
  }

  function startEdit() {
    editValue = String(zoom);
    isEditing = true;
  }

  function commitEdit() {
    isEditing = false;
    const num = parseInt(editValue, 10);
    if (!isNaN(num)) {
      editorZoom.set(Math.max(10, Math.min(400, num)));
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      isEditing = false;
    }
  }

  function handleIncrementChange(e) {
    const num = parseInt(e.target.value, 10);
    if (!isNaN(num) && num > 0) {
      editorZoomIncrement.set(Math.min(100, num));
    }
  }

  function fitToWindow() {
    if (!panel) return;
    // Get the canvas viewport dimensions from the DOM
    const viewport = document.querySelector('.canvas-viewport');
    if (!viewport) { editorZoom.set(100); return; }

    const availW = viewport.clientWidth - 40; // padding
    const availH = viewport.clientHeight - 40;
    const scaleW = availW / panel.width;
    const scaleH = availH / panel.height;
    const fitScale = Math.min(scaleW, scaleH);
    const fitZoom = Math.max(10, Math.min(400, Math.round(fitScale * 100)));
    editorZoom.set(fitZoom);
  }
</script>

<div class="zoom-bar">
  <div class="scrollbar-area">
    <!-- Horizontal scrollbar placeholder -->
  </div>

  <div class="zoom-controls">
    <button class="zoom-btn" onclick={zoomOut} title="Zoom out">−</button>

    {#if isEditing}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="zoom-input"
        type="text"
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={handleKeydown}
        autofocus
      />
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span class="zoom-value" ondblclick={startEdit} title="Double-click to type a value">
        {zoom}%
      </span>
    {/if}

    <button class="zoom-btn" onclick={zoomIn} title="Zoom in">+</button>

    <span class="inc-label">Dec/Inc</span>
    <input class="inc-input" type="number" value={increment}
           onchange={handleIncrementChange} min="1" max="100" />

    <div class="divider"></div>

    <button class="zoom-btn icon" onclick={resetZoom} title="Reset to 100%">⊡</button>
    <button class="zoom-btn icon" onclick={fitToWindow} title="Fit to window">
      <Maximize size={12} strokeWidth={1.5} />
    </button>

    <div class="divider"></div>

    <button class="zoom-btn icon" class:toggle-on={$showRulers} onclick={() => showRulers.update(v => !v)} title="Toggle Rulers">
      <Ruler size={12} strokeWidth={1.5} />
    </button>
    <button class="zoom-btn icon" class:toggle-on={$showGuides} onclick={() => showGuides.update(v => !v)} title="Toggle Guide Lines">
      <Columns3 size={12} strokeWidth={1.5} />
    </button>
    <button class="zoom-btn icon" class:toggle-on={$showDistances} onclick={() => showDistances.update(v => !v)} title="Toggle Distance Labels">
      <MoveHorizontal size={12} strokeWidth={1.5} />
    </button>
  </div>
</div>

<style>
  .zoom-bar {
    display: flex;
    align-items: center;
    height: 100%;
    background: #222;
    padding: 0 8px;
    gap: 8px;
  }

  .scrollbar-area {
    flex: 1;
    height: 6px;
    background: #1A1A1A;
    border-radius: 3px;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .zoom-btn {
    background: #333;
    border: 1px solid #444;
    color: #AAA;
    width: 20px;
    height: 18px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    padding: 0;
  }

  .zoom-btn:hover { background: #444; color: #FFF; }
  .zoom-btn.toggle-on { background: #094771; color: #5B9BD5; border-color: #5B9BD5; }

  .zoom-btn.icon { width: auto; padding: 0 4px; }
  .zoom-value {
    color: #888;
    font-size: 10px;
    min-width: 36px;
    text-align: center;
    cursor: text;
    border-radius: 3px;
    padding: 1px 2px;
  }

  .zoom-value:hover {
    background: #2A2A2A;
    color: #BBB;
  }

  .zoom-input {
    width: 40px;
    background: #1A1A1A;
    border: 1px solid #5B9BD5;
    border-radius: 3px;
    color: #DDD;
    font-size: 10px;
    font-family: inherit;
    text-align: center;
    padding: 1px 2px;
    outline: none;
  }

  .divider {
    width: 1px;
    height: 14px;
    background: #444;
    margin: 0 4px;
  }

  .inc-label {
    color: #666;
    font-size: 10px;
    white-space: nowrap;
  }

  .inc-input {
    width: 36px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font-size: 10px;
    font-family: inherit;
    text-align: center;
    padding: 2px;
    outline: none;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .inc-input::-webkit-inner-spin-button,
  .inc-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .inc-input:focus {
    border-color: #5B9BD5;
  }
</style>
