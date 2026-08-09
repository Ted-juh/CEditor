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
  import SceneryGround from './SceneryGround.svelte';
  import { showGuides } from '../stores/editorView.js';
  import { foldSceneryInEditor } from '../stores/runtimePreferences.js';
  import { deviceParameterDrag } from '../stores/deviceParameterDrag.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { getControlId, sortControlsForHitTest, sortControlsForRender } from '../utils/controlOrder.js';
  import { panelAllowsFold, planSceneryFold, sceneryHoldSet } from '../utils/sceneryModel.js';

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

  /**
   * The control the pointer is over, when that control is only in the ground.
   *
   * Folding in the EDIT surface has a problem preview does not: selection is DOM-driven. Every
   * CanvasControl carries its own mousedown, so a control that was never mounted cannot be clicked,
   * and a control that only becomes real once clicked would need a second press before it could be
   * dragged.
   *
   * Hover is the way out. Pointer moves over the surface are hit-tested against the ground by
   * geometry, and whatever is under the pointer gets a live copy drawn over it. By the time a press
   * arrives the control is a real one, with its handles and its drag, and nothing downstream needs
   * to know it was ever folded.
   */
  let hoveredSceneryId = $state(null);

  let foldEnabled = $derived($foldSceneryInEditor && panelAllowsFold(panel));

  let sceneryFold = $derived(
    foldEnabled ? planSceneryFold(orderedControls) : { ground: [], live: orderedControls },
  );
  let groundControls = $derived(sceneryFold.ground);
  let liveControls = $derived(sceneryFold.live);

  /**
   * Drawn live over the ground: whatever is selected (it needs handles and a drag), whatever is
   * being scope-edited, and whatever the pointer is on.
   *
   * Note these do NOT leave the ground. The ground is cached against its own contents, so removing
   * one to hoist it would re-bake the rest — a few hundred milliseconds every time the pointer
   * crossed a label. They are hidden inside it and redrawn instead, and sceneryHoldSet brings along
   * anything they would otherwise cover.
   */
  let sceneryHeld = $derived(sceneryHoldSet(groundControls, (control) => {
    const id = getControlId(control);
    if (id == null) return false;
    return id === hoveredSceneryId || id === scopedEditingControlId || $selectedComponentIds.has(id);
  }));

  // Hit-test the ground the way the editor hit-tests anything: topmost first, by box.
  function sceneryAt(x, y) {
    for (const control of sortControlsForHitTest(groundControls)) {
      const t = control?._children?.Transform ?? {};
      const cx = Number(t.x) || 0, cy = Number(t.y) || 0;
      const w = Number(t.width) || 0, h = Number(t.height) || 0;
      if (x >= cx && x <= cx + w && y >= cy && y <= cy + h) return getControlId(control);
    }
    return null;
  }

  function handleSurfacePointerMove(event) {
    if (!foldEnabled) {
      if (hoveredSceneryId !== null) hoveredSceneryId = null;
      return;
    }
    // The surface is scaled, so client pixels are not panel pixels.
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / (scale || 1);
    const y = (event.clientY - rect.top) / (scale || 1);
    const hit = sceneryAt(x, y);
    if (hit !== hoveredSceneryId) hoveredSceneryId = hit;
  }

  function handleSurfacePointerLeave() {
    // Not cleared while something is selected — the selection already holds it live, and dropping
    // the hover mid-drag would fold the control out from under the pointer.
    if (hoveredSceneryId !== null) hoveredSceneryId = null;
  }

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
  onpointermove={handleSurfacePointerMove}
  onpointerleave={handleSurfacePointerLeave}
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

  {#if groundControls.length}
    <SceneryGround
      controls={groundControls}
      allControls={orderedControls}
      panelControls={panel.controls}
      panelWidth={panel.width}
      panelHeight={panel.height}
      {scale}
      hiddenIds={sceneryHeld.heldIds}
    />
  {/if}

  {#each [...sceneryHeld.held, ...liveControls] as control (control._children?.Core?.id)}
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
