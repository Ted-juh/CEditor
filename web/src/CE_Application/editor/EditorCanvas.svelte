<script>
  import { panels, activePanelId, editorZoom, editorZoomIncrement, selectedComponentIds, selectComponent, clearSelection } from '../stores/panels.js';
  import { getSection, removeControl, duplicateControl, updateControlProperty } from '../stores/controls.js';
  import { cutSelection, copySelection, pasteSelection, selectAll } from '../stores/clipboard.js';
  import { buildSolidStyle, buildGradientStyle, buildLayerStyle } from '../utils/backgroundCSS.js';
  import { computeGridOrigin, buildGridStyle } from '../utils/gridCSS.js';
  import { handleEditorShortcut } from '../utils/editorShortcuts.js';
  import { findControlsInRect, findControlAtPoint } from '../utils/canvasSelection.js';
  import { createPanController, createMarqueeController } from '../utils/canvasInteractions.js';
  import { createZoomController } from '../utils/zoomController.js';
  import { trackViewportMetrics } from '../utils/viewportMetrics.js';
  import { fileCache, loadFile } from '../stores/fileCache.js';
  import TabBar from './TabBar.svelte';
  import PanelSurface from './PanelSurface.svelte';
  import CanvasContextMenu from './CanvasContextMenu.svelte';
  import EditorRuler from './EditorRuler.svelte';
  import { addGuide, deleteSelectedGuide } from '../stores/guides.js';
  import { zoomToSelectionSignal } from '../stores/editorCommands.js';
  import { showRulers } from '../stores/editorView.js';

  let panel = $derived($panels.find(p => p.id === $activePanelId) ?? null);
  let zoom = $derived($editorZoom);
  let scale = $derived(zoom / 100);

  // --- Ruler scroll/size tracking ---
  let metrics = $state({ scrollLeft: 0, scrollTop: 0, width: 0, height: 0, contentLeft: 40, contentTop: 40 });
  $effect(() => trackViewportMetrics(metrics, () => viewportEl, () => panelSurfaceEl));

  // Re-measure panel-surface offset when zoom or panel size changes — the
  // panel surface uses a CSS transform so its layout box doesn't resize, so
  // the ResizeObserver above won't fire on zoom. We trigger it manually.
  $effect(() => {
    scale;
    panel?.width;
    panel?.height;
    if (panelSurfaceEl) {
      metrics.contentLeft = panelSurfaceEl.offsetLeft;
      metrics.contentTop  = panelSurfaceEl.offsetTop;
    }
  });

  let gridEnabled = $derived(panel?.gridEnabled ?? false);
  let gridSize = $derived(panel?.gridSize ?? 10);
  let snapToGrid = $derived(panel?.snapToGrid ?? false);
  let panelLocked = $derived(panel?.locked ?? false);

  // Grid snap origin — same centering math as the visual grid, without the visual fudge
  let gridOrigin = $derived(computeGridOrigin(panel, gridSize));

  let gridColour = $derived(panel?.gridColour ?? '33FFFFFF');
  let gridLineWidth = $derived(panel?.gridLineWidth ?? 1);

  // Dynamic grid CSS — rendered on the panel surface
  let gridStyle = $derived(buildGridStyle(panel, { gridEnabled, gridSize, gridColour, gridLineWidth }));

  // Trigger file loading when paths change
  $effect(() => {
    if (panel?.bgImageEnabled && panel?.bgImage) loadFile(panel.bgImage);
    if (panel?.bgTextureEnabled && panel?.bgTexture) loadFile(panel.bgTexture);
  });

  // Background layers as one keyed object — the PanelSurface loop picks
  // entries by layer id, so null/empty layers simply don't render.
  let bgLayers = $derived({
    solid: buildSolidStyle(panel),
    gradient: buildGradientStyle(panel),
    image: buildLayerStyle(panel, 'Image', panel?.bgImage ? $fileCache[panel.bgImage] : null),
    texture: buildLayerStyle(panel, 'Texture', panel?.bgTexture ? $fileCache[panel.bgTexture] : null),
  });

  // --- DOM refs ---
  let viewportEl = $state(null);
  let panelSurfaceEl = $state(null);

  // --- Pan (space+drag, middle mouse, right mouse) ---
  // `pan` state is mutated by the controller; reactivity lives here.
  let pan = $state({ isPanning: false, spaceHeld: false });
  const panCtrl = createPanController(pan, {
    getViewport: () => viewportEl,
    onRightClick: (x, y) => showContextMenuAt(x, y),
  });

  // --- Marquee selection ---
  let marquee = $state({ isActive: false, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } });
  const marqueeCtrl = createMarqueeController(marquee, {
    getSurface: () => panelSurfaceEl,
    getScale: () => scale,
    isBlocked: () => pan.spaceHeld,
    onSelect: (rect) => {
      // Only select if the marquee has a meaningful size (not just a click)
      if (rect.w < 3 && rect.h < 3) { clearSelection(); return; }
      const ids = panel ? findControlsInRect(panel.controls, rect, getSection) : new Set();
      selectedComponentIds.set(ids);
    },
  });

  let marqueeRect = $derived(marqueeCtrl.getRect());

  // --- Zoom controller (wheel, fit-to-window, zoom-to-selection) ---
  const zoomCtrl = createZoomController({
    getViewport: () => viewportEl,
    getPanel: () => panel,
    getSelection: () => $selectedComponentIds,
    getZoom: () => $editorZoom,
    editorZoom,
  });

  // React to global zoom-to-selection signal (from Ctrl+Shift+P in App.svelte)
  let lastZoomSignal = 0;
  $effect(() => {
    const sig = $zoomToSelectionSignal;
    if (sig > lastZoomSignal) { lastZoomSignal = sig; zoomCtrl.zoomToSelection(); }
  });

  function handleEditorKeyDown(e) {
    panCtrl.handleKeyDown(e);
    handleEditorShortcut(e, {
      panel, panelLocked, gridSize,
      editorZoom, editorZoomIncrement: $editorZoomIncrement,
      selectedComponentIds: $selectedComponentIds,
      fitToWindow: zoomCtrl.fitToWindow,
      zoomToSelection: zoomCtrl.zoomToSelection,
      selectAll, pasteSelection, copySelection, cutSelection, duplicateControl,
      removeControl, updateControlProperty, deleteSelectedGuide,
    });
  }

  // Click on empty canvas → deselect (but not after panning)
  function handleCanvasClick(e) {
    if (pan.spaceHeld) return;
    if (e.target === e.currentTarget || e.target.classList.contains('panel-surface')) {
      clearSelection();
    }
  }

  // --- Context menu ---
  // Null when hidden, { screenX, screenY, panelX, panelY } when shown.
  // CanvasContextMenu mutates this back to null via bind:target.
  let ctxMenu = $state(null);

  // Always suppress the native context menu — our custom one is shown from handlePanEnd
  function handleContextMenu(e) { e.preventDefault(); }

  function showContextMenuAt(screenX, screenY) {
    if (!panel || !panelSurfaceEl) { ctxMenu = null; return; }
    const rect = panelSurfaceEl.getBoundingClientRect();
    const panelX = (screenX - rect.left) / scale;
    const panelY = (screenY - rect.top) / scale;
    // If right-clicking on a control that isn't selected, select it
    const clickedCtrl = findControlAtPoint(panel.controls, panelX, panelY);
    const cid = clickedCtrl?._children?.Core?.id;
    if (cid && !$selectedComponentIds.has(cid)) selectComponent(cid);
    ctxMenu = { screenX, screenY, panelX, panelY };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor-wrapper" onkeydown={handleEditorKeyDown} onkeyup={panCtrl.handleKeyUp} tabindex="-1" class:panning={pan.isPanning || pan.spaceHeld}>
  <div class="tab-bar-area">
    <TabBar />
  </div>

  <div class="canvas-area">
    {#if panel}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="canvas-viewport" class:with-rulers={$showRulers} bind:this={viewportEl}
           onclick={handleCanvasClick} oncontextmenu={handleContextMenu}
           onmousedown={panCtrl.handleMouseDown} onwheel={zoomCtrl.handleWheel}>
        <div class="canvas-stage">
          <div class="zoom-container" style="width: {panel.width * scale + 80}px; height: {panel.height * scale + 80}px;">
            <PanelSurface
              {panel}
              {scale}
              {snapToGrid}
              {gridSize}
              {gridOrigin}
              {panelLocked}
              {bgLayers}
              {gridStyle}
              {marquee}
              {marqueeRect}
              bind:surfaceRef={panelSurfaceEl}
              onclick={handleCanvasClick}
              onmousedown={marqueeCtrl.handleMouseDown}
              oncontextmenu={handleContextMenu}
            />
          </div>
        </div>
      </div>
      {#if $showRulers}
        <EditorRuler orientation="horizontal" length={metrics.width} scrollOffset={metrics.scrollLeft} contentOffset={metrics.contentLeft} {scale} onGuideCreate={(o, p) => addGuide(o, p)} />
        <EditorRuler orientation="vertical" length={metrics.height} scrollOffset={metrics.scrollTop} contentOffset={metrics.contentTop} {scale} onGuideCreate={(o, p) => addGuide(o, p)} />
        <div class="ruler-corner"></div>
      {/if}
      <CanvasContextMenu bind:target={ctxMenu} {panel} />
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

  .editor-wrapper.panning,
  .editor-wrapper.panning * {
    cursor: grab !important;
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
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: auto;
  }

  .canvas-viewport.with-rulers {
    top: 20px;
    left: 20px;
  }

  .ruler-corner {
    position: absolute;
    top: 0;
    left: 0;
    width: 20px;
    height: 20px;
    background: #222;
    border-right: 1px solid #444;
    border-bottom: 1px solid #444;
    z-index: 21;
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

  .canvas-stage {
    min-width: 100%;
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .zoom-container {
    flex-shrink: 0;
    padding: 40px;
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
