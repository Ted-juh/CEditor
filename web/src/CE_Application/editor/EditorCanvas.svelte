<script>
  import { activePanel, activeEditorTab, editorZoom, editorZoomIncrement, selectedComponentIds, selectComponent, clearSelection } from '../stores/panels.js';
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
  import SettingsView from './SettingsView.svelte';
  import { addGuide, deleteSelectedGuide } from '../stores/guides.js';
  import { zoomToSelectionSignal } from '../stores/editorCommands.js';
  import { showRulers } from '../stores/editorView.js';
  import { logPerfDebug } from '../utils/perfDebug.js';

  let zoom = $derived($editorZoom);
  let scale = $derived(zoom / 100);

  function describeEditorTab(tab) {
    return `${tab?.type ?? 'none'}:${tab?.id ?? 'null'}`;
  }

  function describePanel(panelValue) {
    return panelValue ? `${panelValue.id}:${panelValue.name ?? 'unnamed'}` : 'null:none';
  }

  function handlePanelSurfaceError(error, tab, panelValue) {
    const message = String(error?.message ?? error ?? 'unknown');
    logPerfDebug(
      'editor panel surface error',
      `tab=${describeEditorTab(tab)} panel=${describePanel(panelValue)} message="${message}"`
    );
    console.error('[editor] Panel surface render failure', {
      tab,
      panel: panelValue,
      error,
    });
  }

  function bindViewport(node) {
    viewportEl = node;
    logPerfDebug(
      'editor viewport mount',
      `panel=${describePanel($activePanel)} size=${node.clientWidth}x${node.clientHeight}`
    );

    requestAnimationFrame(() => {
      if (viewportEl !== node) return;
      node.scrollLeft = 0;
      node.scrollTop = 0;
      logPerfDebug('editor viewport reset', `panel=${describePanel($activePanel)}`);
    });

    return {
      destroy() {
        if (viewportEl === node) viewportEl = null;
      },
    };
  }

  function bindZoomContainer(node) {
    zoomContainerEl = node;
    logPerfDebug(
      'editor zoom-container mount',
      `panel=${describePanel($activePanel)} size=${node.offsetWidth}x${node.offsetHeight}`
    );

    return {
      destroy() {
        if (zoomContainerEl === node) zoomContainerEl = null;
      },
    };
  }

  $effect(() => {
    logPerfDebug(
      'editor canvas state',
      `tab=${describeEditorTab($activeEditorTab)} panel=${describePanel($activePanel)} zoom=${zoom}`
    );
  });

  // --- Ruler scroll/size tracking ---
  let metrics = $state({ scrollLeft: 0, scrollTop: 0, width: 0, height: 0, contentLeft: 40, contentTop: 40 });
  $effect(() => trackViewportMetrics(metrics, () => viewportEl, () => zoomContainerEl));

  // Re-measure panel-surface offset when zoom or panel size changes — the
  // panel surface uses a CSS transform so its layout box doesn't resize, so
  // the ResizeObserver above won't fire on zoom. We trigger it manually.
  $effect(() => {
    scale;
    $activePanel?.width;
    $activePanel?.height;
    metrics.width;
    metrics.height;
    if (zoomContainerEl) {
      metrics.contentLeft = zoomContainerEl.offsetLeft;
      metrics.contentTop  = zoomContainerEl.offsetTop;
    }
  });

  let gridEnabled = $derived($activePanel?.gridEnabled ?? false);
  let gridSize = $derived($activePanel?.gridSize ?? 10);
  let snapToGrid = $derived($activePanel?.snapToGrid ?? false);
  let panelLocked = $derived($activePanel?.locked ?? false);

  // Grid snap origin — same centering math as the visual grid, without the visual fudge
  let gridOrigin = $derived(computeGridOrigin($activePanel, gridSize));

  let gridColour = $derived($activePanel?.gridColour ?? '33FFFFFF');
  let gridLineWidth = $derived($activePanel?.gridLineWidth ?? 1);

  // Dynamic grid CSS — rendered on the panel surface
  let gridStyle = $derived(buildGridStyle($activePanel, { gridEnabled, gridSize, gridColour, gridLineWidth }));

  // Trigger file loading when paths change
  $effect(() => {
    if ($activePanel?.bgImageEnabled && $activePanel?.bgImage) loadFile($activePanel.bgImage);
    if ($activePanel?.bgTextureEnabled && $activePanel?.bgTexture) loadFile($activePanel.bgTexture);
  });

  // Background layers as one keyed object — the PanelSurface loop picks
  // entries by layer id, so null/empty layers simply don't render.
  let bgLayers = $derived({
    solid: buildSolidStyle($activePanel),
    gradient: buildGradientStyle($activePanel),
    image: buildLayerStyle($activePanel, 'Image', $activePanel?.bgImage ? $fileCache[$activePanel.bgImage] : null),
    texture: buildLayerStyle($activePanel, 'Texture', $activePanel?.bgTexture ? $fileCache[$activePanel.bgTexture] : null),
  });

  // --- DOM refs ---
  let viewportEl = $state(null);
  let zoomContainerEl = $state(null);
  let panelSurfaceEl = $state(null);
  let lastViewportPanelId = $state(null);

  let scaledPanelWidth = $derived($activePanel ? $activePanel.width * scale : 0);
  let scaledPanelHeight = $derived($activePanel ? $activePanel.height * scale : 0);
  let stageMarginLeft = $derived(Math.max(40, (metrics.width - scaledPanelWidth) / 2));
  let stageMarginTop = $derived(Math.max(40, (metrics.height - scaledPanelHeight) / 2));

  $effect(() => {
    const panelId = $activePanel?.id ?? null;
    if (!viewportEl || panelId == null || panelId === lastViewportPanelId) return;

    lastViewportPanelId = panelId;
    requestAnimationFrame(() => {
      if (!viewportEl || $activePanel?.id !== panelId) return;
      viewportEl.scrollLeft = 0;
      viewportEl.scrollTop = 0;
      logPerfDebug('editor viewport reset', `panel=${describePanel($activePanel)}`);
    });
  });

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
      const ids = $activePanel ? findControlsInRect($activePanel.controls, rect, getSection) : new Set();
      selectedComponentIds.set(ids);
    },
  });

  let marqueeRect = $derived(marqueeCtrl.getRect());

  // --- Zoom controller (wheel, fit-to-window, zoom-to-selection) ---
  const zoomCtrl = createZoomController({
    getViewport: () => viewportEl,
    getPanel: () => $activePanel,
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
      panel: $activePanel, panelLocked, gridSize,
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
    if (!$activePanel || !panelSurfaceEl) { ctxMenu = null; return; }
    const rect = panelSurfaceEl.getBoundingClientRect();
    const panelX = (screenX - rect.left) / scale;
    const panelY = (screenY - rect.top) / scale;
    // If right-clicking on a control that isn't selected, select it
    const clickedCtrl = findControlAtPoint($activePanel.controls, panelX, panelY);
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
    {#key `${$activeEditorTab?.type ?? 'panel'}:${$activeEditorTab?.id ?? 'none'}:${$activePanel?.id ?? 'none'}`}
      {#if $activeEditorTab?.type === 'settings'}
        <SettingsView />
      {:else if $activePanel}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="canvas-viewport" class:with-rulers={$showRulers} use:bindViewport class:panel-active={$activePanel} 
             onclick={handleCanvasClick} oncontextmenu={handleContextMenu}
             onmousedown={panCtrl.handleMouseDown} onwheel={zoomCtrl.handleWheel}>
          <div class="canvas-stage">
            <div
              class="zoom-container"
              use:bindZoomContainer
              style="width: {scaledPanelWidth}px; height: {scaledPanelHeight}px; margin-left: {stageMarginLeft}px; margin-top: {stageMarginTop}px;"
            >
              <PanelSurface
                panel={$activePanel}
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
        <CanvasContextMenu bind:target={ctxMenu} panel={$activePanel} />
      {:else}
        <div class="empty-state">
          <span class="empty-text">No panel open</span>
          <span class="empty-hint">File → New Panel or press the + tab</span>
        </div>
      {/if}
    {/key}
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

  .canvas-viewport.panel-active {
    background: linear-gradient(180deg, rgba(91,155,213,0.05), rgba(91,155,213,0.02));
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
    position: relative;
  }

  .zoom-container {
    position: relative;
    outline: 1px solid rgba(91, 155, 213, 0.35);
    outline-offset: 2px;
  }

  .panel-render-error {
    position: relative;
    border: 1px solid #8F2D2D;
    border-radius: 2px;
    background: linear-gradient(180deg, #2C1616 0%, #1F1111 100%);
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .panel-render-error-card {
    max-width: min(520px, calc(100% - 48px));
    padding: 16px 18px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    background: rgba(0,0,0,0.22);
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: center;
  }

  .panel-render-error-title {
    color: #F2D7D7;
    font-size: 14px;
    font-weight: 600;
  }

  .panel-render-error-message {
    color: #D5B1B1;
    font-size: 12px;
    line-height: 1.35;
    word-break: break-word;
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
