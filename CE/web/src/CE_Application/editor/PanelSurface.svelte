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
  import SelectionBoundsOverlay from './SelectionBoundsOverlay.svelte';
  import { showGuides } from '../stores/editorView.js';
  import { deviceParameterDrag } from '../stores/deviceParameterDrag.js';
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
    scopedEditingControl = null,
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
  let scopedEditingControlId = $derived(scopedEditingControl?._children?.Core?.id ?? null);

  function bindSurface(node) {
    surfaceRef = node;

    return {
      destroy() {
        if (surfaceRef === node) surfaceRef = null;
      },
    };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="panel-surface"
  class:device-drop-background={$deviceParameterDrag}
  style="width: {panel.width}px; height: {panel.height}px; transform: scale({scale}); transform-origin: 0 0;"
  use:bindSurface
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
      control={scopedEditingControlId != null && scopedEditingControlId === control._children?.Core?.id
        ? scopedEditingControl
        : control}
      sourceControl={control}
      {scale}
      {snapToGrid}
      {gridSize}
      gridOriginX={gridOrigin.x}
      gridOriginY={gridOrigin.y}
      {panelLocked}
      allControls={orderedControls}
      panelControls={panel.controls}
      panelWidth={panel.width}
      panelHeight={panel.height}
    />
  {/each}

  <SelectionBoundsOverlay {panel} {scale} {panelLocked} />

  {#if marquee.isActive && (marqueeRect.w > 1 || marqueeRect.h > 1)}
    <div
      class="marquee"
      style="left:{marqueeRect.x}px; top:{marqueeRect.y}px; width:{marqueeRect.w}px; height:{marqueeRect.h}px; border-width:{1 / (scale || 1)}px;"
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

  .panel-surface.device-drop-background {
    box-shadow:
      0 4px 24px rgba(0,0,0,0.4),
      inset 0 0 0 2px rgba(213, 107, 107, 0.45);
  }

  .panel-surface.device-drop-background::after {
    content: 'Drop on a component';
    position: absolute;
    right: 8px;
    bottom: 8px;
    padding: 4px 7px;
    border-radius: 3px;
    background: rgba(24, 24, 24, 0.9);
    border: 1px solid rgba(213, 107, 107, 0.55);
    color: #D56B6B;
    font-size: 10px;
    pointer-events: none;
    z-index: 250;
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

  /* Border width is set inline (1px / scale) so the marquee reads as a hairline
     at every zoom; a purely-vertical drag must render too, hence the w OR h gate. */
  .marquee {
    position: absolute;
    border-style: solid;
    border-color: #5B9BD5;
    background: rgba(91, 155, 213, 0.1);
    pointer-events: none;
    z-index: 200;
  }
</style>
