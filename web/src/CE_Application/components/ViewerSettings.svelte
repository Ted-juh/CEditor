<script>
  import { ZoomIn, ZoomOut, Maximize, RotateCcw, ImagePlus, Pipette } from 'lucide-svelte';

  let { getViewerRef, statusMessage = '', hoverColor = null } = $props();

  let zoomDisplay = $state(100);

  // Poll zoom from viewer ref (lightweight — updates on user interaction)
  $effect(() => {
    const interval = setInterval(() => {
      const ref = getViewerRef?.();
      if (ref) zoomDisplay = ref.getZoom?.() ?? 100;
    }, 100);
    return () => clearInterval(interval);
  });

  function zoomIn() { getViewerRef?.()?.zoomIn?.(); }
  function zoomOut() { getViewerRef?.()?.zoomOut?.(); }
  function zoom100() { getViewerRef?.()?.zoom100?.(); }
  function fitToSection() { getViewerRef?.()?.fitToSection?.(); }
  function loadImage() { getViewerRef?.()?.addImage?.() ?? document.querySelector('.image-tab-add')?.click(); }

  function toggleEyedropper() {
    const ref = getViewerRef?.();
    if (!ref) return;
    const current = ref.isEyedropper?.() ?? false;
    ref.setEyedropper?.(!current);
  }

  let eyedropperOn = $derived((() => {
    // Re-check periodically via zoomDisplay dependency (polled)
    void zoomDisplay;
    return getViewerRef?.()?.isEyedropper?.() ?? false;
  })());

  function handleZoomInput(e) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      getViewerRef?.()?.setZoom?.(val);
    }
  }

  function handleZoomKey(e) {
    if (e.key === 'Enter') {
      e.target.blur();
      handleZoomInput(e);
    }
  }

  function selectAll(e) {
    e.target.select();
  }
</script>

<div class="viewer-settings">
  <!-- Actions -->
  <div class="section">
    <div class="section-label">Actions</div>
    <button class="action-btn" onclick={loadImage}>
      <ImagePlus size={13} />
      Load Image
    </button>
    <button class="action-btn eyedropper-btn" class:active={eyedropperOn} onclick={toggleEyedropper}>
      <Pipette size={13} />
      Eyedropper
    </button>
  </div>

  <!-- Eyedropper color preview -->
  {#if hoverColor}
    <div class="section color-preview-section">
      <div class="section-label">Preview</div>
      <div class="color-preview-row">
        <div class="color-preview-swatch" style="background: #{hoverColor}"></div>
        <span class="color-preview-hex">#{hoverColor}</span>
      </div>
    </div>
  {/if}

  <!-- Zoom Controls -->
  <div class="section">
    <div class="section-label">Zoom</div>
    <div class="zoom-display">
      <input
        type="number"
        class="zoom-input"
        value={zoomDisplay}
        min="10"
        max="1600"
        onfocus={selectAll}
        onkeydown={handleZoomKey}
        onchange={handleZoomInput}
      />
      <span class="zoom-pct">%</span>
    </div>
    <div class="toolbar-row">
      <button class="tool-btn" onclick={zoomOut} title="Zoom Out">
        <ZoomOut size={13} />
      </button>
      <button class="tool-btn" onclick={zoomIn} title="Zoom In">
        <ZoomIn size={13} />
      </button>
      <button class="tool-btn" onclick={zoom100} title="100%">
        <RotateCcw size={13} />
      </button>
      <button class="tool-btn" onclick={fitToSection} title="Fit to View">
        <Maximize size={13} />
      </button>
    </div>
  </div>

  <!-- Status -->
  <div class="status-area">
    <input type="text" class="status-box" readonly value={statusMessage} />
  </div>
</div>

<style>
  .viewer-settings {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    padding: 0 6px;
  }

  .viewer-settings::-webkit-scrollbar {
    width: 4px;
  }
  .viewer-settings::-webkit-scrollbar-track {
    background: transparent;
  }
  .viewer-settings::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 2px;
  }
  .viewer-settings::-webkit-scrollbar-thumb:hover {
    background: #5B9BD5;
  }

  .section {
    padding: 6px 0;
    border-bottom: 1px solid #333;
  }

  .section-label {
    font-size: 9px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .zoom-display {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 6px;
  }

  .zoom-input {
    width: 54px;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #DDD;
    font-size: 11px;
    padding: 3px 4px;
    border-radius: 3px;
    text-align: center;
    font-family: inherit;
  }
  .zoom-input:focus {
    border-color: #5B9BD5;
    outline: none;
  }

  .zoom-pct {
    font-size: 11px;
    color: #888;
  }

  .toolbar-row {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 24px;
    background: #252525;
    border: 1px solid #333;
    color: #BBB;
    cursor: pointer;
    border-radius: 3px;
    padding: 0;
  }
  .tool-btn:hover {
    background: #3D3D3D;
    color: #FFF;
    border-color: #555;
  }
  .tool-btn:active {
    background: #094771;
    color: #FFF;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: #252525;
    border: 1px solid #333;
    color: #BBB;
    font-size: 11px;
    padding: 5px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
  }
  .action-btn:hover {
    background: #3D3D3D;
    color: #FFF;
    border-color: #5B9BD5;
  }
  .action-btn:active {
    background: #094771;
    color: #FFF;
  }

  .eyedropper-btn {
    margin-top: 4px;
  }
  .eyedropper-btn.active {
    background: #094771;
    color: #FFF;
    border-color: #5B9BD5;
  }

  .color-preview-section {
    padding: 6px 0;
  }

  .color-preview-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .color-preview-swatch {
    width: 28px;
    height: 28px;
    border-radius: 3px;
    border: 1px solid #555;
    flex-shrink: 0;
  }

  .color-preview-hex {
    font-size: 11px;
    color: #DDD;
    font-family: 'Consolas', 'Courier New', monospace;
  }

  .status-area {
    margin-top: auto;
    padding: 6px 0;
    border-top: 1px solid #333;
  }

  .status-box {
    width: 100%;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #AAA;
    font-size: 10px;
    padding: 4px 6px;
    border-radius: 3px;
    font-family: inherit;
    box-sizing: border-box;
  }
  .status-box:focus {
    outline: none;
  }
</style>
