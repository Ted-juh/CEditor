<script>
  /**
   * The panel surface — background layers, grid overlay, guide lines, all
   * child controls, and the drag-marquee overlay. Owns the `.panel-surface`
   * scoped CSS (and the `.bg-layer` / `.grid-overlay` / `.marquee` rules
   * that only make sense inside it).
   *
   * Extracted from EditorCanvas so the parent doesn't have to manage 50
   * lines of nested template for a single draggable rectangle.
   */
  import CanvasControl from './CanvasControl.svelte';
  import GuideLines from './GuideLines.svelte';
  import { showGuides } from '../stores/editorView.js';
  import { sortControlsForRender } from '../utils/controlOrder.js';

  let {
    panel,
    scale = 1,
    snapToGrid = false,
    gridSize = 10,
    gridOrigin = { x: 0, y: 0 },
    panelLocked = false,
    bgLayers = {},       // { solid, gradient, image, texture } — CSS strings or null
    gridStyle = '',
    marquee,             // { isActive, start, end }
    marqueeRect,         // { x, y, w, h }
    onmousedown = null,
    onclick = null,
    oncontextmenu = null,
    surfaceRef = $bindable(null),
  } = $props();

  // Default layer order if the panel doesn't specify one.
  const DEFAULT_LAYER_ORDER = ['solid', 'gradient', 'image', 'texture'];
  let orderedControls = $derived(sortControlsForRender(panel?.controls ?? []));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="panel-surface"
  style="width: {panel.width}px; height: {panel.height}px; transform: scale({scale}); transform-origin: 0 0;"
  bind:this={surfaceRef}
  onclick={onclick}
  onmousedown={onmousedown}
  oncontextmenu={oncontextmenu}
>
  {#each panel.bgLayerOrder ?? DEFAULT_LAYER_ORDER as layerId}
    {#if bgLayers[layerId]}
      <div class="bg-layer" style={bgLayers[layerId]}></div>
    {/if}
  {/each}

  {#if gridStyle}
    <div class="grid-overlay" style={gridStyle}></div>
  {/if}

  {#if $showGuides}
    <GuideLines {scale} panelWidth={panel.width} panelHeight={panel.height} />
  {/if}

  {#each orderedControls as control (control._children?.Core?.id)}
    <CanvasControl
      {control}
      {scale}
      {snapToGrid}
      {gridSize}
      gridOriginX={gridOrigin.x}
      gridOriginY={gridOrigin.y}
      {panelLocked}
      allControls={orderedControls}
      panelWidth={panel.width}
      panelHeight={panel.height}
    />
  {/each}

  {#if marquee.isActive && marqueeRect.w > 1}
    <div
      class="marquee"
      style="left:{marqueeRect.x}px; top:{marqueeRect.y}px; width:{marqueeRect.w}px; height:{marqueeRect.h}px;"
    ></div>
  {/if}
</div>

<style>
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
</style>
