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
  import { deviceParameterDrag } from '../stores/deviceParameterDrag.js';
  import { sortControlsForRender } from '../utils/controlOrder.js';
  import { layerNames, normalizeLayerName, normalizePanelLayers } from '../utils/panelLayers.js';
  import { buildSceneryRenderPlan } from '../utils/sceneryRenderPlan.js';
  import { initialMountCount, nextMountCount, mountIncomplete, scheduleNextSlice } from '../utils/progressiveMount.js';

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
  // What to paint, in order: controls, plus one image for each locked scenery layer. The decision
  // lives in utils/sceneryRenderPlan.js so the preview surface makes it identically — a panel that
  // changes when you press Preview is worse than one that never compiles at all.
  let plan = $derived(buildSceneryRenderPlan(panel, { preview: false }));
  // Children still need the flat control list for snapping, distance guides and hit-testing, and
  // that list must include the folded ones: a control you cannot snap to because it was compiled
  // would be a very confusing kind of invisible.
  let panelLayers = $derived(normalizePanelLayers(panel?.layers, panel?.controls ?? []));
  let orderedLayerNames = $derived(layerNames(panelLayers));
  let hiddenLayers = $derived(new Set(panelLayers.filter((l) => l.visible === false).map((l) => l.name)));
  let orderedControls = $derived(
    sortControlsForRender(panel?.controls ?? [], orderedLayerNames)
      .filter((control) => !hiddenLayers.has(normalizeLayerName(control?._children?.Core?.layer)))
  );
  let scopedEditingControlId = $derived(scopedEditingControl?._children?.Core?.id ?? null);

  // A large panel is mounted in slices so the editor appears before the last control is built —
  // see utils/progressiveMount.js. Below its threshold `mountedCount` is simply the whole list and
  // none of this runs.
  let mountedCount = $state(0);
  // Reset on a new panel, not on every edit: the identity that matters is which panel is open, and
  // rebuilding from the first slice on each keystroke would be a flicker, not a speed-up.
  let panelIdentity = $derived(panel?.id ?? null);
  $effect(() => {
    panelIdentity;
    mountedCount = initialMountCount(plan.items.length);
  });
  $effect(() => {
    const total = plan.items.length;
    if (!mountIncomplete(mountedCount, total)) return;
    return scheduleNextSlice(() => { mountedCount = nextMountCount(mountedCount, total); });
  });
  let renderItems = $derived(
    mountedCount >= plan.items.length ? plan.items : plan.items.slice(0, mountedCount)
  );

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

  {#each renderItems as item (item.type === 'scenery' ? `scenery:${item.layer}` : item.control._children?.Core?.id)}
    {#if item.type === 'scenery'}
      <!-- A whole locked scenery layer, as one element. Not interactive by construction: unlock
           the layer to get the controls back. -->
      <img class="scenery-layer" src={item.url} width={panel.width} height={panel.height} alt="" />
    {:else}
      <CanvasControl
        control={scopedEditingControlId != null && scopedEditingControlId === item.control._children?.Core?.id
          ? scopedEditingControl
          : item.control}
        sourceControl={item.control}
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
    {/if}
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

  /* Compiled scenery. Deliberately without a z-index: it stacks by document order, in the sequence
     the render plan put it, which is the layer's own depth. Giving it a number would put every
     scenery layer in the same band and lose the ordering the plan just worked out. */
  .scenery-layer {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    pointer-events: none;
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
