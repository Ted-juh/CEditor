<script>
  import { panels, activePanelId, editorZoom, selectedComponentIds, selectComponent, clearSelection } from '../stores/panels.js';
  import { getSection } from '../stores/controls.js';
  import { removeControl, duplicateControl, updateControlProperty } from '../stores/controls.js';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { fileCache, loadFile } from '../stores/fileCache.js';
  import TabBar from './TabBar.svelte';
  import CanvasControl from './CanvasControl.svelte';

  let panel = $derived($panels.find(p => p.id === $activePanelId) ?? null);
  let zoom = $derived($editorZoom);
  let scale = $derived(zoom / 100);

  let gridEnabled = $derived(panel?.gridEnabled ?? false);
  let gridSize = $derived(panel?.gridSize ?? 10);
  let snapToGrid = $derived(panel?.snapToGrid ?? false);
  let panelLocked = $derived(panel?.locked ?? false);

  // Grid snap origin — same centering math as the visual grid, without the visual fudge
  let gridOrigin = $derived.by(() => {
    if (!panel) return { x: 0, y: 0 };
    let ox = panel.gridOriginX ?? 0;
    let oy = panel.gridOriginY ?? 0;
    if (panel.gridCentered && gridSize > 0) {
      const sub = panel.gridSubdivision ?? 1;
      const tileSize = sub > 1 ? gridSize * sub : gridSize;
      const rw = Math.round(panel.width / tileSize);
      const rh = Math.round(panel.height / tileSize);
      ox = -((rw * tileSize) - panel.width) / 2;
      oy = -((rh * tileSize) - panel.height) / 2;
    }
    return { x: ox, y: oy };
  });

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
    const type = panel?.gridType ?? 'lines';
    const sub = panel?.gridSubdivision ?? 1;
    let ox = panel?.gridOriginX ?? 0;
    let oy = panel?.gridOriginY ?? 0;

    // When centered, offset the grid so it is symmetrically placed around the panel.
    // Round up the number of cells needed to cover each dimension, compute the
    // overshoot, then shift the origin by half the remainder so edges are equal.
    if (panel?.gridCentered) {
      // Center based on the largest tile: if subdivisions exist, use majorSize
      const tileSize = sub > 1 ? gridSize * sub : gridSize;
      const rw = Math.round(panel.width / tileSize);
      const rh = Math.round(panel.height / tileSize);
      ox = -((rw * tileSize) - panel.width) / 2 - 1.5;
      oy = -((rh * tileSize) - panel.height) / 2 - 1.5;
    }

    let style;

    if (type === 'dots') {
      style = `
        background-image: radial-gradient(circle, ${c} ${lw}px, transparent ${lw}px);
        background-size: ${gridSize}px ${gridSize}px;
        background-position: ${ox}px ${oy}px;
      `;
    } else if (type === 'crosses') {
      const arm = Math.max(2, Math.round(gridSize * 0.2));
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${gridSize}' height='${gridSize}'><line x1='${gridSize/2 - arm}' y1='${gridSize/2}' x2='${gridSize/2 + arm}' y2='${gridSize/2}' stroke='${c}' stroke-width='${lw}'/><line x1='${gridSize/2}' y1='${gridSize/2 - arm}' x2='${gridSize/2}' y2='${gridSize/2 + arm}' stroke='${c}' stroke-width='${lw}'/></svg>`;
      const encoded = encodeURIComponent(svg);
      style = `
        background-image: url("data:image/svg+xml,${encoded}");
        background-size: ${gridSize}px ${gridSize}px;
        background-position: ${ox}px ${oy}px;
      `;
    } else if (sub > 1) {
      const majorSize = gridSize * sub;
      const majorLw = Math.max(lw + 1, lw * 2);
      const majorC = hexToRgba(panel?.gridSubColour ?? '55FFFFFF');
      style = `
        background-image:
          linear-gradient(${majorC} ${majorLw}px, transparent ${majorLw}px),
          linear-gradient(90deg, ${majorC} ${majorLw}px, transparent ${majorLw}px),
          linear-gradient(${c} ${lw}px, transparent ${lw}px),
          linear-gradient(90deg, ${c} ${lw}px, transparent ${lw}px);
        background-size: ${majorSize}px ${majorSize}px, ${majorSize}px ${majorSize}px, ${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px;
        background-position: ${ox}px ${oy}px;
      `;
    } else {
      style = `
        background-image:
          linear-gradient(${c} ${lw}px, transparent ${lw}px),
          linear-gradient(90deg, ${c} ${lw}px, transparent ${lw}px);
        background-size: ${gridSize}px ${gridSize}px;
        background-position: ${ox}px ${oy}px;
      `;
    }

    return style;
  });

  // --- Background layer styles ---

  // Solid fill — AARRGGBB or RRGGBB
  let solidStyle = $derived.by(() => {
    if (!panel || panel.bgSolid === false) return '';
    const hex = String(panel.bgColour || 'FF2A2A2A');
    if (hex.length === 8) {
      const a = parseInt(hex.slice(0, 2), 16) / 255;
      const rgb = hex.slice(2);
      return `background: #${rgb}; opacity: ${a.toFixed(3)};`;
    }
    return `background: #${hex};`;
  });

  // Gradient overlay
  let gradientStyle = $derived.by(() => {
    if (!panel || !panel.bgGradientEnabled || !panel.bgGradient) return null;
    const opacity = (panel.bgGradientOpacity ?? 100) / 100;
    return `background: ${gradientToCSS(panel.bgGradient)}; opacity: ${opacity};`;
  });

  // Shared helper for image/texture fit → CSS properties
  function fitToCSS(fit, align, offsetX, offsetY, flipH, flipV, tileScale, rotation, panelW, panelH) {
    const parts = [];

    // Position
    const posMap = {
      'top-left': 'left top', 'top': 'center top', 'top-right': 'right top',
      'left': 'left center', 'center': 'center center', 'right': 'right center',
      'bottom-left': 'left bottom', 'bottom': 'center bottom', 'bottom-right': 'right bottom',
    };
    const pos = posMap[align] || 'center center';

    // Transform (rotation, flip, offset)
    // When rotated, scale the layer up so the rotated content still covers the panel fully.
    const transforms = [];
    if (rotation) {
      const rad = Math.abs(rotation * Math.PI / 180);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const w = panelW || 1;
      const h = panelH || 1;
      // Bounding box of rotated rectangle
      const newW = w * cos + h * sin;
      const newH = w * sin + h * cos;
      const coverScale = Math.max(newW / w, newH / h);
      transforms.push(`rotate(${rotation}deg)`);
      if (coverScale > 1) transforms.push(`scale(${coverScale.toFixed(4)})`);
    }
    if (flipH) transforms.push('scaleX(-1)');
    if (flipV) transforms.push('scaleY(-1)');
    if (offsetX || offsetY) transforms.push(`translate(${offsetX || 0}px, ${offsetY || 0}px)`);
    if (transforms.length) parts.push(`transform: ${transforms.join(' ')};`);

    switch (fit) {
      case 'fill':
        parts.push('background-size: cover;');
        parts.push(`background-position: ${pos};`);
        parts.push('background-repeat: no-repeat;');
        break;
      case 'fit':
        parts.push('background-size: contain;');
        parts.push(`background-position: ${pos};`);
        parts.push('background-repeat: no-repeat;');
        break;
      case 'stretch':
        parts.push('background-size: 100% 100%;');
        parts.push('background-repeat: no-repeat;');
        break;
      case 'tile': {
        const pct = (tileScale || 1) * 25;
        parts.push(`background-size: ${pct}%;`);
        parts.push(`background-position: ${pos};`);
        parts.push('background-repeat: repeat;');
        break;
      }
      case 'original':
        parts.push('background-size: auto;');
        parts.push(`background-position: ${pos};`);
        parts.push('background-repeat: no-repeat;');
        break;
      default:
        parts.push('background-size: cover;');
        parts.push('background-repeat: no-repeat;');
    }

    return parts.join(' ');
  }

  // Image overlay
  // Trigger file loading when paths change
  $effect(() => {
    if (panel?.bgImageEnabled && panel?.bgImage) loadFile(panel.bgImage);
    if (panel?.bgTextureEnabled && panel?.bgTexture) loadFile(panel.bgTexture);
  });

  let imageStyle = $derived.by(() => {
    if (!panel || !panel.bgImageEnabled || !panel.bgImage) return null;
    const imgUrl = $fileCache[panel.bgImage];
    if (!imgUrl) return null;

    const fit = fitToCSS(
      panel.bgImageFit, panel.bgImageAlign,
      panel.bgImageOffsetX, panel.bgImageOffsetY,
      panel.bgImageFlipH, panel.bgImageFlipV,
      panel.bgImageTileScale, panel.bgImageRotation,
      panel.width, panel.height
    );
    const opacity = (panel.bgImageOpacity ?? 100) / 100;
    const blend = panel.bgImageBlend || 'normal';
    const blur = panel.bgImageBlur || 0;
    const sat = panel.bgImageSaturation ?? 100;
    const bri = panel.bgImageBrightness ?? 100;
    const con = panel.bgImageContrast ?? 100;
    const tint = panel.bgImageTint ?? 'FFFFFF';

    let style = `background-image: url('${imgUrl}'); ${fit}`;
    style += ` opacity: ${opacity}; mix-blend-mode: ${blend};`;
    const filters = [];
    if (blur > 0) filters.push(`blur(${blur}px)`);
    if (panel.bgImageGrayscale) filters.push('grayscale(100%)');
    if (sat !== 100) filters.push(`saturate(${sat}%)`);
    if (bri !== 100) filters.push(`brightness(${bri}%)`);
    if (con !== 100) filters.push(`contrast(${con}%)`);
    if (filters.length) style += ` filter: ${filters.join(' ')};`;
    if (tint && tint !== 'FFFFFF') {
      const r = parseInt(tint.slice(0, 2), 16);
      const g = parseInt(tint.slice(2, 4), 16);
      const b = parseInt(tint.slice(4, 6), 16);
      style += ` box-shadow: inset 0 0 0 9999px rgba(${r},${g},${b},0.3);`;
    }
    return style;
  });

  // Texture overlay
  let textureStyle = $derived.by(() => {
    if (!panel || !panel.bgTextureEnabled || !panel.bgTexture) return null;
    const texUrl = $fileCache[panel.bgTexture];
    if (!texUrl) return null;

    const fit = fitToCSS(
      panel.bgTextureFit, panel.bgTextureAlign,
      panel.bgTextureOffsetX, panel.bgTextureOffsetY,
      panel.bgTextureFlipH, panel.bgTextureFlipV,
      panel.bgTextureTileScale, panel.bgTextureRotation,
      panel.width, panel.height
    );
    const opacity = (panel.bgTextureOpacity ?? 100) / 100;
    const blend = panel.bgTextureBlend || 'normal';
    const blur = panel.bgTextureBlur || 0;
    const sat = panel.bgTextureSaturation ?? 100;
    const bri = panel.bgTextureBrightness ?? 100;
    const con = panel.bgTextureContrast ?? 100;
    const tint = panel.bgTextureTint ?? 'FFFFFF';

    let style = `background-image: url('${texUrl}'); ${fit}`;
    style += ` opacity: ${opacity}; mix-blend-mode: ${blend};`;
    const filters = [];
    if (blur > 0) filters.push(`blur(${blur}px)`);
    if (panel.bgTextureGrayscale) filters.push('grayscale(100%)');
    if (sat !== 100) filters.push(`saturate(${sat}%)`);
    if (bri !== 100) filters.push(`brightness(${bri}%)`);
    if (con !== 100) filters.push(`contrast(${con}%)`);
    if (filters.length) style += ` filter: ${filters.join(' ')};`;
    if (tint && tint !== 'FFFFFF') {
      const r = parseInt(tint.slice(0, 2), 16);
      const g = parseInt(tint.slice(2, 4), 16);
      const b = parseInt(tint.slice(4, 6), 16);
      style += ` box-shadow: inset 0 0 0 9999px rgba(${r},${g},${b},0.3);`;
    }
    return style;
  });

  // --- Marquee selection ---
  let isMarquee = $state(false);
  let marqueeStart = $state({ x: 0, y: 0 });
  let marqueeEnd = $state({ x: 0, y: 0 });
  let panelSurfaceEl = $state(null);

  let marqueeRect = $derived.by(() => {
    const x1 = Math.min(marqueeStart.x, marqueeEnd.x);
    const y1 = Math.min(marqueeStart.y, marqueeEnd.y);
    const x2 = Math.max(marqueeStart.x, marqueeEnd.x);
    const y2 = Math.max(marqueeStart.y, marqueeEnd.y);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  });

  function handleSurfaceMouseDown(e) {
    if (e.button !== 0) return;
    // Only start marquee on the surface itself, not on controls
    if (e.target !== panelSurfaceEl && !e.target.classList.contains('grid-overlay') && !e.target.classList.contains('bg-layer')) return;

    e.preventDefault();
    const rect = panelSurfaceEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    isMarquee = true;
    marqueeStart = { x, y };
    marqueeEnd = { x, y };

    window.addEventListener('mousemove', handleMarqueeMove);
    window.addEventListener('mouseup', handleMarqueeEnd);
  }

  function handleMarqueeMove(e) {
    if (!isMarquee) return;
    const rect = panelSurfaceEl.getBoundingClientRect();
    marqueeEnd = {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }

  function handleMarqueeEnd() {
    if (!isMarquee) return;
    window.removeEventListener('mousemove', handleMarqueeMove);
    window.removeEventListener('mouseup', handleMarqueeEnd);

    isMarquee = false;

    // Only select if the marquee has a meaningful size (not just a click)
    if (marqueeRect.w < 3 && marqueeRect.h < 3) {
      clearSelection();
      return;
    }

    // Find all controls that intersect the marquee rect
    const ids = new Set();
    if (panel) {
      for (const ctrl of panel.controls) {
        const t = getSection(ctrl, 'Transform');
        const c = getSection(ctrl, 'Core');
        if (!t || !c) continue;
        // AABB intersection test (partial overlap counts)
        if (t.x < marqueeRect.x + marqueeRect.w &&
            t.x + t.width > marqueeRect.x &&
            t.y < marqueeRect.y + marqueeRect.h &&
            t.y + t.height > marqueeRect.y) {
          ids.add(c.id);
        }
      }
    }

    selectedComponentIds.set(ids);

    // Swallow the click that follows mouseup so handleCanvasClick doesn't clear selection
    window.addEventListener('click', (ev) => {
      if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
        ev.stopPropagation(); ev.preventDefault();
      }
    }, { once: true, capture: true });
  }

  // Click on empty canvas → deselect
  function handleCanvasClick(e) {
    if (e.target === e.currentTarget || e.target.classList.contains('panel-surface')) {
      clearSelection();
    }
  }

  // Keyboard shortcuts
  function handleKeyDown(e) {
    if (!panel) return;
    const ids = $selectedComponentIds;
    if (ids.size === 0) return;

    // Find all selected controls
    const selectedCtrls = panel.controls.filter(c => ids.has(c._children?.Core?.id));
    if (selectedCtrls.length === 0) return;

    // Delete all selected
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      for (const id of ids) removeControl(id);
      return;
    }

    // Duplicate all selected
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      for (const id of ids) duplicateControl(id);
      return;
    }

    // Arrow nudge (skip if panel locked or any selected is component-locked)
    if (panelLocked) return;
    const anyLocked = selectedCtrls.some(c => c._children?.Core?.locked);
    if (anyLocked) return;

    const nudge = e.shiftKey ? gridSize : 1;
    const arrowDeltas = {
      ArrowLeft:  { prop: 'Transform.x', dir: -1 },
      ArrowRight: { prop: 'Transform.x', dir:  1 },
      ArrowUp:    { prop: 'Transform.y', dir: -1 },
      ArrowDown:  { prop: 'Transform.y', dir:  1 },
    };

    const arrow = arrowDeltas[e.key];
    if (arrow) {
      e.preventDefault();
      const axis = arrow.prop === 'Transform.x' ? 'x' : 'y';
      for (const ctrl of selectedCtrls) {
        const current = ctrl._children?.Transform?.[axis] ?? 0;
        updateControlProperty(ctrl._children.Core.id, arrow.prop, current + arrow.dir * nudge);
      }
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
        <div class="zoom-container" style="
          width: {panel.width * scale + 80}px;
          height: {panel.height * scale + 80}px;
        ">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="panel-surface"
            style="width: {panel.width}px; height: {panel.height}px; transform: scale({scale}); transform-origin: 0 0;"
            bind:this={panelSurfaceEl}
            onclick={handleCanvasClick}
            onmousedown={handleSurfaceMouseDown}
          >
            {#each (panel.bgLayerOrder ?? ['solid', 'gradient', 'image', 'texture']) as layerId}
              {#if layerId === 'solid' && solidStyle}
                <div class="bg-layer" style={solidStyle}></div>
              {:else if layerId === 'gradient' && gradientStyle}
                <div class="bg-layer" style={gradientStyle}></div>
              {:else if layerId === 'image' && imageStyle}
                <div class="bg-layer" style={imageStyle}></div>
              {:else if layerId === 'texture' && textureStyle}
                <div class="bg-layer" style={textureStyle}></div>
              {/if}
            {/each}
            {#if gridStyle}
              <div class="grid-overlay" style={gridStyle}></div>
            {/if}
            {#each panel.controls as control (control._children?.Core?.id)}
              <CanvasControl
                {control}
                {scale}
                {snapToGrid}
                {gridSize}
                gridOriginX={gridOrigin.x}
                gridOriginY={gridOrigin.y}
                {panelLocked}
                allControls={panel.controls}
              />
            {/each}

            {#if isMarquee && marqueeRect.w > 1}
              <div
                class="marquee"
                style="left:{marqueeRect.x}px; top:{marqueeRect.y}px; width:{marqueeRect.w}px; height:{marqueeRect.h}px;"
              ></div>
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
    flex-shrink: 0;
    padding: 40px;
    margin: auto;
  }

  .panel-surface {
    position: relative;
    border: 1px solid #444;
    border-radius: 2px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    flex-shrink: 0;
    overflow: hidden;
  }

  .bg-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .marquee {
    position: absolute;
    border: 1px solid #5B9BD5;
    background: rgba(91, 155, 213, 0.1);
    pointer-events: none;
    z-index: 200;
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
