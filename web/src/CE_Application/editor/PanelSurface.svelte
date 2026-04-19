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
  import { createPerfDebugTimer, logPerfDebug, measurePerfDebug } from '../utils/perfDebug.js';

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
  let orderedControls = $derived.by(() => measurePerfDebug(
    `panel sort controls ${panel?.id ?? 'panel'}`,
    () => sortControlsForRender(panel?.controls ?? []),
    {
      minDurationMs: 2,
      detail: `controls=${panel?.controls?.length ?? 0}`,
    }
  ));
  const loggedControlRenderErrors = new Set();

  function controlCore(control) {
    return control?._children?.Core ?? null;
  }

  function controlTransform(control) {
    return control?._children?.Transform ?? null;
  }

  function describeControl(control) {
    const core = controlCore(control);
    const type = core?.type ?? 'Control';
    const name = core?.name ?? 'unnamed';
    const id = core?.id ?? 'unknown';
    return `${type}:${name}:${id}`;
  }

  function controlFailureStyle(control) {
    const transform = controlTransform(control);
    const x = Number.isFinite(Number(transform?.x)) ? Number(transform.x) : 0;
    const y = Number.isFinite(Number(transform?.y)) ? Number(transform.y) : 0;
    const width = Math.max(20, Number.isFinite(Number(transform?.width)) ? Number(transform.width) : 80);
    const height = Math.max(20, Number.isFinite(Number(transform?.height)) ? Number(transform.height) : 32);
    return `left:${x}px; top:${y}px; width:${width}px; height:${height}px;`;
  }

  function handleControlRenderError(control, error) {
    const description = describeControl(control);
    const message = String(error?.message ?? error ?? 'unknown');
    const errorKey = `${description}:${message}`;
    if (loggedControlRenderErrors.has(errorKey)) return;
    loggedControlRenderErrors.add(errorKey);
    logPerfDebug(
      `panel control render error ${panel?.id ?? 'panel'}`,
      `${description} message="${message}"`
    );
    console.error('[panel surface] Control render failure', {
      panel,
      control: description,
      error,
    });
  }

  function bindSurface(node) {
    surfaceRef = node;
    logPerfDebug(
      `panel surface dom mount ${panel?.id ?? 'panel'}`,
      `size=${panel?.width ?? 0}x${panel?.height ?? 0} controls=${panel?.controls?.length ?? 0}`
    );

    return {
      destroy() {
        if (surfaceRef === node) surfaceRef = null;
      },
    };
  }

  function summarizeControls(controls) {
    const summary = {
      total: 0,
      text: 0,
      icons: 0,
      backgroundsWithAssets: 0,
      textWithAssets: 0,
      withEffects: 0,
    };

    for (const control of controls ?? []) {
      summary.total += 1;
      const children = control?._children ?? {};
      const background = children.Background?._children?.Fill ?? null;
      const text = children.Text?._children ?? null;
      const icon = children.Icon ?? null;
      const effects = children.Effects ?? null;

      if (text?.content) summary.text += 1;
      if (icon?.sourceType || icon?.iconSource || icon?.name) summary.icons += 1;
      if (background?.imageEnabled === true || background?.overlayEnabled === true) summary.backgroundsWithAssets += 1;
      if (text?.Fill?.imageEnabled === true || text?.Fill?.textureEnabled === true) summary.textWithAssets += 1;
      if (effects && Object.keys(effects).length > 0) summary.withEffects += 1;
    }

    return summary;
  }

  $effect(() => {
    if (!panel?.id) return;

    const summary = summarizeControls(panel.controls);
    logPerfDebug(
      `panel surface prepare ${panel.id}`,
      `controls=${summary.total} text=${summary.text} icons=${summary.icons} bgAssets=${summary.backgroundsWithAssets} textAssets=${summary.textWithAssets} effects=${summary.withEffects}`
    );

    const stop = createPerfDebugTimer(`panel surface first frames ${panel.id}`);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        stop(`controls=${summary.total}`);
      });
    });
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="panel-surface"
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
    <svelte:boundary onerror={(error) => handleControlRenderError(control, error)}>
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
      {#snippet failed(error)}
        <div
          class="control-render-error"
          style={controlFailureStyle(control)}
          title={`${describeControl(control)}: ${error()?.message ?? 'render failed'}`}
        >
          <span class="control-render-error-label">{controlCore(control)?.type ?? 'Control'} failed</span>
        </div>
      {/snippet}
    </svelte:boundary>
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

  .control-render-error {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 6px;
    border: 1px dashed #D17B7B;
    background: rgba(77, 28, 28, 0.78);
    color: #F4D7D7;
    font-size: 10px;
    line-height: 1.2;
    text-align: center;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 220;
    overflow: hidden;
  }

  .control-render-error-label {
    display: block;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
