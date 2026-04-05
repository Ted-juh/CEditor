<script>
  import { panels, activePanelId, editorZoom, selectedComponentId } from '../stores/panels.js';
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
            style="width: {panel.width}px; height: {panel.height}px;"
            onclick={handleCanvasClick}
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
                allControls={panel.controls}
              />
            {/each}

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
