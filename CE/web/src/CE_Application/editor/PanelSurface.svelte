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
  import SelectionBoundsOverlay from './SelectionBoundsOverlay.svelte';
  import { showGuides } from '../stores/editorView.js';
  import { foldSceneryInEditor } from '../stores/runtimePreferences.js';
  import { deviceParameterDrag } from '../stores/deviceParameterDrag.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { getControlId, sortControlsForHitTest, sortControlsForRender } from '../utils/controlOrder.js';
  import { layerNames, normalizeLayerName, normalizePanelLayers } from '../utils/panelLayers.js';
  import { panelAllowsFold, planSceneryFold, sceneryHoldSet } from '../utils/sceneryModel.js';
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
    ondragover = null,   // Insert-panel drag-to-place
    ondrop = null,
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

  /**
   * TWO SCENERY MECHANISMS, and they do not overlap.
   *
   * `buildSceneryRenderPlan` compiles a layer the author DECLARED as scenery and locked, all of it,
   * into one image. The fold below infers scenery from the component type — a Label has no section
   * it could change through — and needs nothing declared. A panel that uses neither (which is every
   * panel written before layers existed, and every panel whose author never opened the layer dock)
   * still gets the fold; a panel that compiled a layer is left to the plan alone, because folding a
   * second time over controls the compiler already refused would restack them against the image
   * they were refused from.
   */
  let planCompiledScenery = $derived(plan.scenery.size > 0);
  let planControls = $derived(plan.items.filter((item) => item.type === 'control').map((item) => item.control));

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

  let foldEnabled = $derived($foldSceneryInEditor && !planCompiledScenery && panelAllowsFold(panel));

  let sceneryFold = $derived(
    foldEnabled ? planSceneryFold(planControls) : { ground: [], live: planControls },
  );
  let groundControls = $derived(sceneryFold.ground);

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

  /**
   * What the surface paints, after the fold: the plan's own items with the folded controls taken
   * out, and the held ones put back at the front.
   *
   * Filtering the plan rather than rebuilding a list keeps the compiled-layer images in the
   * document positions the plan chose for them — the plan is a flat paint-order list precisely
   * because the DOM stacks by document order, and re-deriving it here would lose that. The held
   * ones are the plan's OWN item objects moved to the front, not fresh wrappers around the same
   * controls: sceneryRenderPlan reuses those wrappers on purpose, and minting new ones for the
   * controls under the pointer would write a changed value into every one of their signals on
   * every pointer move.
   */
  let foldedItems = $derived.by(() => {
    if (!foldEnabled || groundControls.length === 0) return plan.items;
    const folded = new Set(groundControls);
    const heldControls = new Set(sceneryHeld.held);
    const held = [];
    const rest = [];
    for (const item of plan.items) {
      if (item.type !== 'control' || !folded.has(item.control)) rest.push(item);
      else if (heldControls.has(item.control)) held.push(item);
    }
    return [...held, ...rest];
  });

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

  // A large panel is mounted in slices so the editor appears before the last control is built —
  // see utils/progressiveMount.js. Below its threshold `mountedCount` is simply the whole list and
  // none of this runs. It slices what is LEFT after the fold, which is the list that costs anything
  // to mount — the ground is one element however many controls went into it.
  let mountedCount = $state(0);
  // Reset on a new panel, not on every edit: the identity that matters is which panel is open, and
  // rebuilding from the first slice on each keystroke would be a flicker, not a speed-up.
  let panelIdentity = $derived(panel?.id ?? null);
  $effect(() => {
    panelIdentity;
    mountedCount = initialMountCount(foldedItems.length);
  });
  $effect(() => {
    const total = foldedItems.length;
    if (!mountIncomplete(mountedCount, total)) return;
    return scheduleNextSlice(() => { mountedCount = nextMountCount(mountedCount, total); });
  });
  let renderItems = $derived(
    mountedCount >= foldedItems.length ? foldedItems : foldedItems.slice(0, mountedCount)
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
  onpointermove={handleSurfacePointerMove}
  onpointerleave={handleSurfacePointerLeave}
  ondragover={ondragover}
  ondrop={ondrop}
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

  <SelectionBoundsOverlay {panel} {scale} {panelLocked} />

  {#if marquee.isActive && (marqueeRect.w > 1 || marqueeRect.h > 1)}
    <div
      class="marquee"
      style="left:{marqueeRect.x}px; top:{marqueeRect.y}px; width:{marqueeRect.w}px; height:{marqueeRect.h}px; border-width:{1 / (scale || 1)}px;"
    ></div>
  {/if}
</div>

<style>
  /* overflow VISIBLE: selection handles and rotate zones sit just outside a
     control's box, so a control at x:0 — the most common position in a panel
     layout — had its left handles clipped off and ungrabbable. Content that
     overhangs the panel edge now shows during editing (like any design
     tool's artboard); export and preview still clip to the panel. */
  .panel-surface {
    position: relative;
    border: 1px solid #444;
    border-radius: 2px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    flex-shrink: 0;
    overflow: visible;
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
