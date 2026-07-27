<script>
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';

  let { images = $bindable([]), activeImageIndex = $bindable(0), onchange, onColorPicked, onColorHover } = $props();

  let containerEl = $state(null);
  let containerW = $state(0);
  let containerH = $state(0);

  // Track container size
  $effect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        containerW = e.contentRect.width;
        containerH = e.contentRect.height;
      }
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  });

  // Per-image view state (zoom, pan) — keyed by index
  let viewStates = $state(new Map());

  function getView(idx) {
    if (!viewStates.has(idx)) {
      viewStates.set(idx, { zoom: 100, panX: 0, panY: 0 });
    }
    return viewStates.get(idx);
  }

  let currentView = $derived((() => {
    const v = getView(activeImageIndex);
    return { zoom: v.zoom, panX: v.panX, panY: v.panY };
  })());

  // Eyedropper state
  let eyedropperActive = $state(false);

  export function setEyedropper(on) {
    eyedropperActive = on;
    if (on) ensurePixelCanvas();
    if (!on && onColorHover) onColorHover(null);
  }
  export function isEyedropper() { return eyedropperActive; }

  // Cached offscreen canvas for pixel sampling (rebuilt per image)
  let pixelCanvas = null;
  let pixelCtx = null;
  let pixelCanvasFor = null; // dataUrl key

  function ensurePixelCanvas() {
    const img = images[activeImageIndex];
    if (!img || !img.dataUrl) return;
    if (pixelCanvasFor === img.dataUrl) return; // already cached
    pixelCanvas = document.createElement('canvas');
    pixelCanvas.width = img.naturalWidth;
    pixelCanvas.height = img.naturalHeight;
    pixelCtx = pixelCanvas.getContext('2d', { willReadFrequently: true });
    const el = new Image();
    el.onload = () => {
      pixelCtx.drawImage(el, 0, 0);
      pixelCanvasFor = img.dataUrl;
    };
    el.src = img.dataUrl;
  }

  function mouseToImageCoords(e) {
    const img = images[activeImageIndex];
    if (!img || !containerEl) return null;
    const rect = containerEl.getBoundingClientRect();
    const view = getView(activeImageIndex);
    const scale = view.zoom / 100;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const imgX = (mx - cx - view.panX) / scale + img.naturalWidth / 2;
    const imgY = (my - cy - view.panY) / scale + img.naturalHeight / 2;
    if (imgX < 0 || imgY < 0 || imgX >= img.naturalWidth || imgY >= img.naturalHeight) return null;
    return { x: Math.floor(imgX), y: Math.floor(imgY) };
  }

  function samplePixel(x, y) {
    if (!pixelCtx || pixelCanvasFor !== images[activeImageIndex]?.dataUrl) return null;
    const pixel = pixelCtx.getImageData(x, y, 1, 1).data;
    return ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1).toUpperCase();
  }

  function pickColorAt(e) {
    const coords = mouseToImageCoords(e);
    if (!coords) return;
    const hex = samplePixel(coords.x, coords.y);
    if (hex && onColorPicked) onColorPicked(hex);
    eyedropperActive = false;
    if (onColorHover) onColorHover(null);
  }

  function handleEyedropperHover(e) {
    if (!eyedropperActive) return;
    const coords = mouseToImageCoords(e);
    if (!coords) { if (onColorHover) onColorHover(null); return; }
    const hex = samplePixel(coords.x, coords.y);
    if (onColorHover) onColorHover(hex);
  }

  // Drag state
  let dragging = $state(false);
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let dragStartPanX = $state(0);
  let dragStartPanY = $state(0);

  function switchTab(index) {
    activeImageIndex = index;
  }

  function addImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const newImg = { name: file.name, dataUrl: reader.result, naturalWidth: 0, naturalHeight: 0 };
        // Probe natural size
        const img = new Image();
        img.onload = () => {
          newImg.naturalWidth = img.naturalWidth;
          newImg.naturalHeight = img.naturalHeight;
          images = [...images, newImg];
          activeImageIndex = images.length - 1;
          // Auto-fit
          fitToSection(activeImageIndex);
          if (onchange) onchange(images);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function closeImage(index, e) {
    e.stopPropagation();
    if (images.length <= 0) return;

    images = images.filter((_, i) => i !== index);
    viewStates.delete(index);

    if (images.length === 0) {
      activeImageIndex = 0;
    } else if (activeImageIndex >= images.length) {
      activeImageIndex = images.length - 1;
    } else if (activeImageIndex > index) {
      activeImageIndex = activeImageIndex - 1;
    }
    if (onchange) onchange(images);
  }

  function handleTabDblClick(index) {
    const current = images[index].name;
    const newName = prompt('Rename image:', current);
    if (newName && newName.trim()) {
      images[index].name = newName.trim();
      images = [...images];
      if (onchange) onchange(images);
    }
  }

  // Zoom
  export function zoomIn() {
    const v = getView(activeImageIndex);
    v.zoom = Math.min(v.zoom + 10, 1600);
    viewStates = new Map(viewStates);
  }

  export function zoomOut() {
    const v = getView(activeImageIndex);
    v.zoom = Math.max(v.zoom - 10, 10);
    viewStates = new Map(viewStates);
  }

  export function setZoom(val) {
    const v = getView(activeImageIndex);
    v.zoom = Math.max(10, Math.min(1600, val));
    viewStates = new Map(viewStates);
  }

  export function getZoom() {
    return getView(activeImageIndex).zoom;
  }

  export function zoom100() {
    const v = getView(activeImageIndex);
    v.zoom = 100;
    v.panX = 0;
    v.panY = 0;
    viewStates = new Map(viewStates);
  }

  export function fitToSection(idx) {
    const i = idx ?? activeImageIndex;
    const img = images[i];
    if (!img || !img.naturalWidth || !containerW || !containerH) return;
    const scaleX = containerW / img.naturalWidth;
    const scaleY = containerH / img.naturalHeight;
    const scale = Math.min(scaleX, scaleY, 1) * 100;
    const v = getView(i);
    v.zoom = Math.round(scale);
    v.panX = 0;
    v.panY = 0;
    viewStates = new Map(viewStates);
  }

  // Mouse drag
  function handleMouseDown(e) {
    if (e.button !== 0) return;
    if (eyedropperActive) {
      e.preventDefault();
      pickColorAt(e);
      return;
    }
    const v = getView(activeImageIndex);
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = v.panX;
    dragStartPanY = v.panY;
    e.preventDefault();
  }

  function handleMouseMove(e) {
    if (!dragging) return;
    const v = getView(activeImageIndex);
    v.panX = dragStartPanX + (e.clientX - dragStartX);
    v.panY = dragStartPanY + (e.clientY - dragStartY);
    viewStates = new Map(viewStates);
  }

  function handleMouseUp() {
    dragging = false;
  }

  // Wheel zoom
  function handleWheel(e) {
    e.preventDefault();
    const v = getView(activeImageIndex);
    const delta = e.deltaY > 0 ? -10 : 10;
    v.zoom = Math.max(10, Math.min(1600, v.zoom + delta));
    viewStates = new Map(viewStates);
  }
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<div class="viewer-editor">
  <div class="image-tabs">
    {#each images as img, i}
      <button
        class="image-tab"
        class:active={i === activeImageIndex}
        onclick={() => switchTab(i)}
        ondblclick={() => handleTabDblClick(i)}
        title="Double-click to rename"
      >
        <span class="image-tab-label">{img.name}</span>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <span class="image-tab-close" role="button" tabindex="-1" onclick={(e) => closeImage(i, e)} title="Close image">
          <X size={10} />
        </span>
      </button>
    {/each}
    <button class="image-tab-add" onclick={addImage} title="Load image">
      <Plus size={12} />
    </button>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="viewer-canvas"
    bind:this={containerEl}
    onmousedown={handleMouseDown}
    onmousemove={handleEyedropperHover}
    onwheel={handleWheel}
    class:dragging
    class:eyedropper={eyedropperActive}
  >
    {#if images.length > 0 && images[activeImageIndex]}
      <img
        src={images[activeImageIndex].dataUrl}
        alt={images[activeImageIndex].name}
        class="viewer-image"
        style="
          transform: translate({currentView.panX}px, {currentView.panY}px) scale({currentView.zoom / 100});
          transform-origin: center center;
        "
        draggable="false"
      />
    {:else}
      <div class="empty-message">Click + to load an image</div>
    {/if}
  </div>
</div>

<style>
  .viewer-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1E1E1E;
  }

  .image-tabs {
    display: flex;
    align-items: center;
    gap: 1px;
    background: #1A1A1A;
    padding: 0 4px;
    flex-shrink: 0;
    overflow-x: auto;
  }

  .image-tabs::-webkit-scrollbar {
    height: 2px;
  }
  .image-tabs::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 1px;
  }

  .image-tab {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #252525;
    border: none;
    color: #888;
    font-size: 10px;
    padding: 3px 8px;
    cursor: pointer;
    border-top: 2px solid transparent;
    font-family: inherit;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .image-tab:hover {
    color: #CCC;
    background: #2A2A2A;
  }

  .image-tab.active {
    color: #DDD;
    background: #2D2D2D;
    border-top-color: #5B9BD5;
  }

  .image-tab-label {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .image-tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 0;
    width: 14px;
    height: 14px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .image-tab-close:hover {
    color: #E55;
    background: #333;
  }

  .image-tab-add {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px dashed #444;
    color: #666;
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    flex-shrink: 0;
    margin-left: 2px;
    width: 20px;
    height: 20px;
  }

  .image-tab-add:hover {
    color: #5B9BD5;
    border-color: #5B9BD5;
  }

  .viewer-canvas {
    flex: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: grab;
    background:
      repeating-conic-gradient(#2A2A2A 0% 25%, #222 0% 50%) 0 0 / 16px 16px;
  }

  .viewer-canvas.dragging {
    cursor: grabbing;
  }

  .viewer-canvas.eyedropper {
    cursor: crosshair;
  }

  .viewer-image {
    max-width: none;
    max-height: none;
    user-select: none;
    pointer-events: none;
    image-rendering: auto;
  }

  .empty-message {
    color: #555;
    font-size: 12px;
    font-style: italic;
  }
</style>
