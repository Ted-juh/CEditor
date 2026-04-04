<script>
  import { panels, activePanelId, editorZoom, selectedComponentId } from '../stores/panels.js';
  import { removeControl, duplicateControl, updateControlProperty } from '../stores/controls.js';
  import TabBar from './TabBar.svelte';
  import CanvasControl from './CanvasControl.svelte';

  let panel = $derived($panels.find(p => p.id === $activePanelId) ?? null);
  let zoom = $derived($editorZoom);
  let scale = $derived(zoom / 100);

  let gridEnabled = $derived(panel?.gridEnabled ?? false);
  let gridSize = $derived(panel?.gridSize ?? 10);
  let snapToGrid = $derived(panel?.snapToGrid ?? false);

  let gridColour = $derived(panel?.gridColour ?? '33FFFFFF');
  let gridLineWidth = $derived(panel?.gridLineWidth ?? 1);

  // Parse AARRGGBB hex to rgba
  function hexToRgba(hex) {
    const h = hex.replace(/^#/, '');
    if (h.length === 8) {
      const a = parseInt(h.slice(0, 2), 16) / 255;
      const r = parseInt(h.slice(2, 4), 16);
      const g = parseInt(h.slice(4, 6), 16);
      const b = parseInt(h.slice(6, 8), 16);
      return `rgba(${r},${g},${b},${a.toFixed(3)})`;
    }
    // fallback for 6-char hex
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},0.06)`;
  }

  // Dynamic grid CSS — rendered on the panel surface
  let gridStyle = $derived.by(() => {
    if (!gridEnabled || gridSize <= 0) return '';
    const c = hexToRgba(gridColour);
    const lw = gridLineWidth;
    return `
      background-image:
        linear-gradient(${c} ${lw}px, transparent ${lw}px),
        linear-gradient(90deg, ${c} ${lw}px, transparent ${lw}px);
      background-size: ${gridSize}px ${gridSize}px;
      background-position: 0 0;
    `;
  });

  // Panel background style
  let panelBgStyle = $derived.by(() => {
    if (!panel) return '';
    if (panel.bgMode === 'solid') {
      return `background: #${panel.bgColour || '2A2A2A'};`;
    }
    // gradient mode could use gradientToCSS here in the future
    return `background: #${panel.bgColour || '2A2A2A'};`;
  });

  // Click on empty canvas → deselect
  function handleCanvasClick(e) {
    if (e.target === e.currentTarget || e.target.classList.contains('panel-surface')) {
      selectedComponentId.set(null);
    }
  }

  // Keyboard shortcuts
  function handleKeyDown(e) {
    if (!panel) return;
    const selected = $selectedComponentId;
    if (!selected) return;

    // Find selected control
    const ctrl = panel.controls.find(c => c._children?.Core?.id === selected);
    if (!ctrl) return;
    const isLocked = ctrl._children?.Core?.locked;

    // Delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeControl(selected);
      return;
    }

    // Duplicate
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      duplicateControl(selected);
      return;
    }

    // Arrow nudge (not when locked)
    if (isLocked) return;
    const nudge = e.shiftKey ? gridSize : 1;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      updateControlProperty(selected, 'Transform.x', (ctrl._children.Transform?.x ?? 0) - nudge);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      updateControlProperty(selected, 'Transform.x', (ctrl._children.Transform?.x ?? 0) + nudge);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateControlProperty(selected, 'Transform.y', (ctrl._children.Transform?.y ?? 0) - nudge);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateControlProperty(selected, 'Transform.y', (ctrl._children.Transform?.y ?? 0) + nudge);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor-wrapper" onkeydown={handleKeyDown} tabindex="-1">
  <div class="tab-bar-area">
    <TabBar />
  </div>

  <div class="canvas-area">
    {#if panel}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="canvas-viewport" onclick={handleCanvasClick}>
        <div class="zoom-container" style="transform: scale({scale}); transform-origin: center center;">
          <div
            class="panel-surface"
            style="width: {panel.width}px; height: {panel.height}px; {panelBgStyle}"
            onclick={handleCanvasClick}
          >
            {#if gridStyle}
              <div class="grid-overlay" style={gridStyle}></div>
            {/if}
            {#each panel.controls as control (control._children?.Core?.id)}
              <CanvasControl
                {control}
                {scale}
                {snapToGrid}
                {gridSize}
                allControls={panel.controls}
              />
            {/each}

            {#if panel.controls.length === 0}
              <span class="panel-label">{panel.name} — {panel.width} x {panel.height}</span>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <div class="empty-state">
        <span class="empty-text">No panel open</span>
        <span class="empty-hint">File → New Panel or press the + tab</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .editor-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    outline: none;
  }

  .tab-bar-area {
    flex: 0 0 34px;
  }

  .canvas-area {
    flex: 1;
    min-height: 0;
    background: #1A1A1A;
    overflow: hidden;
    position: relative;
  }

  .canvas-viewport {
    width: 100%;
    height: 100%;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .canvas-viewport::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  .canvas-viewport::-webkit-scrollbar-track {
    background: #5B9BD5;
  }

  .canvas-viewport::-webkit-scrollbar-thumb {
    background: #1A1A1A;
    border-radius: 6px;
    border: 2px solid #5B9BD5;
  }

  .canvas-viewport::-webkit-scrollbar-corner {
    background: #5B9BD5;
  }

  .zoom-container {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 40px;
  }

  .panel-surface {
    position: relative;
    border: 1px solid #444;
    border-radius: 2px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    flex-shrink: 0;
    overflow: hidden;
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .panel-label {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #555;
    font-size: 12px;
    pointer-events: none;
  }

  .empty-state {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .empty-text {
    color: #555;
    font-size: 14px;
  }

  .empty-hint {
    color: #3A3A3A;
    font-size: 12px;
  }
</style>
