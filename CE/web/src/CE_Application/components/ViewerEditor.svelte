<script>
  import { onDestroy } from 'svelte';
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';

  let {
    images = $bindable([]),
    activeImageIndex = $bindable(0),
    sourceId = null,
    sourceGeneration = 0,
    onchange,
    onColorPicked,
    onColorHover,
  } = $props();

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

  // Per-image view state follows the image object. Array indexes are positions, not identities:
  // closing image 0 must not hand its zoom and pan to the image that shifts into index 0.
  const viewStates = new WeakMap();
  const emptyView = { zoom: 100, panX: 0, panY: 0 };
  let viewStateVersion = $state(0);

  function getView(idx) {
    const image = images[idx];
    if (!image || typeof image !== 'object') return emptyView;
    if (!viewStates.has(image)) viewStates.set(image, { zoom: 100, panX: 0, panY: 0 });
    return viewStates.get(image);
  }

  let currentView = $derived((() => {
    viewStateVersion;
    const v = getView(activeImageIndex);
    return { zoom: v.zoom, panX: v.panX, panY: v.panY };
  })());

  let disposed = false;
  const sourceSnapshot = () => ({ id: sourceId, generation: sourceGeneration });
  const isCurrentSource = (source) =>
    !disposed && source?.id === sourceId && source?.generation === sourceGeneration;
  function emitChange(nextImages = images, nextIndex = activeImageIndex, source = sourceSnapshot(), documentChanged = true) {
    onchange?.(nextImages, {
      sourceId: source.id,
      sourceGeneration: source.generation,
      activeImageIndex: nextIndex,
      documentChanged,
    });
  }

  // Eyedropper state
  let eyedropperActive = $state(false);

  export function setEyedropper(on) {
    eyedropperActive = on;
    if (!on && onColorHover) onColorHover(null);
  }
  export function isEyedropper() { return eyedropperActive; }

  // Cached offscreen canvas for pixel sampling (rebuilt per image)
  let pixelCanvas = null;
  let pixelCtx = null;
  let pixelCanvasFor = null; // { image, dataUrl, sourceId, sourceGeneration }
  let pixelRequestGeneration = 0;

  onDestroy(() => {
    disposed = true;
    pixelRequestGeneration += 1;
  });

  // Rebuild whenever the selected image or viewer source changes while the eyedropper is active.
  // The request token and complete source snapshot keep a late Image.onload from publishing pixels
  // for the tab or panel that used to occupy this component.
  $effect(() => {
    const img = images[activeImageIndex];
    const dataUrl = img?.dataUrl;
    const requestSource = sourceSnapshot();
    const shouldLoad = eyedropperActive && !!img && !!dataUrl;
    const request = ++pixelRequestGeneration;
    pixelCanvas = null;
    pixelCtx = null;
    pixelCanvasFor = null;
    onColorHover?.(null);
    if (!shouldLoad) return;

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const el = new Image();
    el.onload = () => {
      if (request !== pixelRequestGeneration || !isCurrentSource(requestSource)) return;
      if (images[activeImageIndex] !== img || images[activeImageIndex]?.dataUrl !== dataUrl) return;
      ctx.drawImage(el, 0, 0);
      pixelCanvas = canvas;
      pixelCtx = ctx;
      pixelCanvasFor = {
        image: img,
        dataUrl,
        sourceId: requestSource.id,
        sourceGeneration: requestSource.generation,
      };
    };
    el.onerror = () => {};
    el.src = dataUrl;
    return () => {
      if (request === pixelRequestGeneration) pixelRequestGeneration += 1;
      el.onload = null;
      el.onerror = null;
    };
  });

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
    const img = images[activeImageIndex];
    if (!pixelCtx || !pixelCanvasFor || pixelCanvasFor.image !== img) return null;
    if (pixelCanvasFor.dataUrl !== img?.dataUrl || !isCurrentSource({
      id: pixelCanvasFor.sourceId,
      generation: pixelCanvasFor.sourceGeneration,
    })) return null;
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
    // The selected viewer tab is workspace navigation. Persist it for the next visit without
    // turning an otherwise saved panel into an unsaved document.
    emitChange(images, index, sourceSnapshot(), false);
  }

  export function addImage() {
    const requestSource = sourceSnapshot();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (!isCurrentSource(requestSource)) return;
        const newImg = { name: file.name, dataUrl: reader.result, naturalWidth: 0, naturalHeight: 0 };
        // Probe natural size
        const img = new Image();
        img.onload = () => {
          if (!isCurrentSource(requestSource)) return;
          newImg.naturalWidth = img.naturalWidth;
          newImg.naturalHeight = img.naturalHeight;
          images = [...images, newImg];
          activeImageIndex = images.length - 1;
          // Auto-fit
          fitToSection(activeImageIndex);
          emitChange(images, activeImageIndex, requestSource);
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

    const closingImage = images[index];
    images = images.filter((_, i) => i !== index);
    if (closingImage && typeof closingImage === 'object') viewStates.delete(closingImage);

    if (images.length === 0) {
      activeImageIndex = 0;
    } else if (activeImageIndex >= images.length) {
      activeImageIndex = images.length - 1;
    } else if (activeImageIndex > index) {
      activeImageIndex = activeImageIndex - 1;
    }
    emitChange();
  }

  function handleTabDblClick(index) {
    const current = images[index].name;
    const newName = prompt('Rename image:', current);
    if (newName && newName.trim()) {
      images[index].name = newName.trim();
      images = [...images];
      emitChange();
    }
  }

  // Zoom
  export function zoomIn() {
    const v = getView(activeImageIndex);
    v.zoom = Math.min(v.zoom + 10, 1600);
    viewStateVersion += 1;
  }

  export function zoomOut() {
    const v = getView(activeImageIndex);
    v.zoom = Math.max(v.zoom - 10, 10);
    viewStateVersion += 1;
  }

  export function setZoom(val) {
    const v = getView(activeImageIndex);
    v.zoom = Math.max(10, Math.min(1600, val));
    viewStateVersion += 1;
  }

  export function getZoom() {
    return getView(activeImageIndex).zoom;
  }

  export function zoom100() {
    const v = getView(activeImageIndex);
    v.zoom = 100;
    v.panX = 0;
    v.panY = 0;
    viewStateVersion += 1;
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
    viewStateVersion += 1;
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
    viewStateVersion += 1;
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
    viewStateVersion += 1;
  }
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} onblur={handleMouseUp} />

<div class="viewer-editor">
  <div class="image-tabs" role="tablist" aria-label="Open images">
    {#each images as img, i}
      <div
        class="image-tab"
        class:active={i === activeImageIndex}
      >
        <button
          type="button"
          class="image-tab-select"
          role="tab"
          aria-selected={i === activeImageIndex}
          onclick={() => switchTab(i)}
          ondblclick={() => handleTabDblClick(i)}
          title="Double-click to rename"
        ><span class="image-tab-label">{img.name}</span></button>
        <button type="button" class="image-tab-close" onclick={(e) => closeImage(i, e)} aria-label={`Close ${img.name}`} title="Close image">
          <X size={10} />
        </button>
      </div>
    {/each}
    <button type="button" class="image-tab-add" onclick={addImage} aria-label="Load image" title="Load image">
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

  .image-tab-select {
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: default;
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
