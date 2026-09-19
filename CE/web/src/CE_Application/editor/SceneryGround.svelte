<script module>
  import { sceneryMarkupStats, clearSceneryMarkupCache } from '../utils/sceneryMarkupCache.js';
  export const _sceneryBakeCacheSize = () => sceneryMarkupStats().entries;
  export const _clearSceneryBakeCache = clearSceneryMarkupCache;
</script>

<script>
  /**
   * The folded scenery, as one node instead of a few hundred components.
   *
   * WHAT THIS BUYS. A Label is a CanvasControl: selection overlay, drag handlers, device-drop
   * targets, interaction runtime, nested-control reach, and the reactive graph to keep all of it
   * current. None of it can ever fire on a Label — the type declares no Mouse, no Value, no
   * Bindings — but it is all built anyway, 216 times on the GAIA panel. Folding replaces the 173 of
   * those that are safe to move (see planSceneryFold) with a single element of frozen markup.
   *
   * WHY FROZEN MARKUP AND NOT A RASTER. "Ground image" is what this is for, and an image is the
   * obvious shape for it — but rasterising means drawing labels, borders and effects a second time
   * through a canvas, and a second implementation is free to disagree with the first. Text is where
   * it would show first and worst: font fallback, hinting and subpixel positioning are the
   * renderer's, not ours to reproduce. Freezing the markup keeps CanvasControl as the only thing
   * that ever draws a control, so the folded panel is the same pixels by construction rather than
   * by care. It costs a DOM subtree rather than a bitmap, which is the trade being made.
   *
   * WHAT IT COSTS. The first bake mounts the scenery for real — a cold open pays what it pays
   * today, plus one innerHTML read. Everything after is a cache hit: reopening the panel, toggling
   * preview, or any re-render of the surface. That is the deal the in-memory cache implies, and it
   * is why this is not a fix for cold-open time on its own.
   *
   * WHAT IS LOST IN THE FREEZE. Event listeners, which is the point, and live DOM state that is not
   * in the markup — canvas pixels, form values, scroll positions. None exist here: the only types
   * that can be scenery are Label, Background, Image and TestBox, none of which render a <canvas>
   * or an input. isSceneryType is derived from the same registry, so a type that gained one could
   * not become scenery without failing sceneryModel.test.js first.
   */
  import { untrack } from 'svelte';
  import SceneryLayer from './SceneryLayer.svelte';
  import { sceneryGroundKey, bakeSceneryGround } from '../utils/sceneryMarkupCache.js';

  let {
    controls = [],
    allControls = [],
    panelControls = [],
    panelWidth = 0,
    panelHeight = 0,
    scale = 1,
    /**
     * Ids the caller is drawing live over the top (see sceneryHoldSet). They stay in the ground —
     * removing them would change what the ground IS, and re-bake it — so they are hidden inside it
     * instead, leaving the live copy as the only one visible.
     */
    hiddenIds = new Set(),
    /**
     * Carry each control's Core tooltip and screen-reader label into the baked markup.
     *
     * Part of the CACHE KEY below, not just of the props. The editing canvas and the preview render
     * the same scenery from the same controls, and only one of them annotates it — so a single key
     * would hand whichever baked first to both, and the tooltip would appear on the canvas or fail
     * to appear in preview depending on which surface the author opened first. Neither is a bug
     * anybody would reproduce on purpose.
     */
    annotate = false,
  } = $props();

  let groundEl = $state(null);

  const layerProps = () => ({ controls, allControls, panelControls, panelWidth, panelHeight, scale, annotate });

  let fingerprint = $derived(sceneryGroundKey(controls, { panelWidth, panelHeight, scale, annotate }));
  let baked = $state(null);

  // Server-side there is no DOM to bake into and no second render to save, so the scenery is drawn
  // as controls. Tests render this way, which is what keeps the golden baselines meaningful: they
  // compare the paint of a real control, not of a string this component happened to cache.
  const canBake = typeof window !== 'undefined' && typeof document !== 'undefined';

  $effect(() => {
    if (!canBake) return;
    const key = fingerprint;

    // No live first mount followed by a second detached mount. A warm ground
    // joins cached strings; a cold one mounts each missing control exactly once.
    const props = layerProps();
    baked = { key, markup: untrack(() => bakeSceneryGround(controls, props)) };
  });

  // Hiding is done to the rendered nodes rather than baked into the markup, so that what is hidden
  // is not part of the cache key. Toggling `visibility` keeps the element's box, which matters not
  // at all here — everything is absolutely positioned — but costs no layout either.
  $effect(() => {
    const root = groundEl;
    const hide = hiddenIds;
    if (!root) return;
    void baked;                                   // re-apply after a re-bake replaces the nodes
    for (const node of root.querySelectorAll('[data-control-id]')) {
      const id = node.getAttribute('data-control-id');
      node.style.visibility = hide.has(id) ? 'hidden' : '';
    }
  });
</script>

<div
  bind:this={groundEl}
  class="scenery-ground"
  style="width:{panelWidth}px; height:{panelHeight}px;"
  aria-hidden="true"
>
  {#if canBake}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- the markup is this app's own render output, not input -->
    {@html baked?.key === fingerprint ? baked.markup : ''}
  {:else}
    <SceneryLayer {controls} {allControls} {panelControls} {panelWidth} {panelHeight} {scale} {annotate} />
  {/if}
</div>

<style>
  /*
   * Stacks by DOCUMENT ORDER, in the sequence the render plan put it, which is the layer's own
   * depth. It carried `z-index: 0` while there was only ever one ground on a surface; the plan can
   * now emit one per layer, and a number here would put all of them in the same band and lose the
   * ordering the plan just worked out. `.canvas-control` sets no z-index for the same reason.
   *
   * Where a ground lands is still the promise planSceneryFold makes: above the background layers
   * and below every live control on its layer, because it refuses to fold anything a live control
   * is already underneath.
   *
   * Inert to the pointer: a folded control cannot be clicked, and the editor's own hit-testing
   * reaches it by geometry instead. Without this the ground would swallow clicks meant for the
   * surface, and marquee selection would stop working the moment it crossed a label.
   */
  .scenery-ground {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
  }
</style>
