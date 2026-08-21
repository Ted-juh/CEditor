<script module>
  /**
   * Baked grounds, keyed by what they were baked from, for the life of the session.
   *
   * Deliberately not persisted. Written into the .cepanel it would be derived data in a source file
   * — inflating every diff, and a stale one would render a panel that no longer matches its own
   * controls. In IndexedDB it would be a cache layer with its own invalidation to get wrong. In
   * memory it cannot go stale: the key IS the content, so scenery that changed simply misses.
   *
   * Bounded because the key changes on every edit to a folded control. Dragging one label across the
   * panel mints a new entry per frame, and without a cap a long editing session would hold every
   * intermediate ground alive. Insertion order is eviction order, which for this access pattern —
   * the useful entry is the one just written — is what an LRU would have done anyway.
   */
  const BAKE_CACHE_LIMIT = 8;
  const bakeCache = new Map();

  function readCache(key) {
    return bakeCache.get(key) ?? null;
  }

  function writeCache(key, markup) {
    bakeCache.set(key, markup);
    while (bakeCache.size > BAKE_CACHE_LIMIT) bakeCache.delete(bakeCache.keys().next().value);
  }

  /** Exposed for the tests, which need to prove a second render is a cache hit and not a re-bake. */
  export function _sceneryBakeCacheSize() {
    return bakeCache.size;
  }

  export function _clearSceneryBakeCache() {
    bakeCache.clear();
  }
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
  import { mount, unmount } from 'svelte';
  import SceneryLayer from './SceneryLayer.svelte';
  import { sceneryFingerprint } from '../utils/sceneryModel.js';

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
  } = $props();

  let groundEl = $state(null);

  const layerProps = () => ({ controls, allControls, panelControls, panelWidth, panelHeight, scale });

  let fingerprint = $derived(sceneryFingerprint(controls));
  let baked = $state(null);

  // Server-side there is no DOM to bake into and no second render to save, so the scenery is drawn
  // as controls. Tests render this way, which is what keeps the golden baselines meaningful: they
  // compare the paint of a real control, not of a string this component happened to cache.
  const canBake = typeof window !== 'undefined' && typeof document !== 'undefined';

  $effect(() => {
    if (!canBake) return;
    const key = fingerprint;

    const hit = readCache(key);
    if (hit !== null) {
      baked = hit;
      return;
    }

    // Mount the scenery detached, take its markup, throw the components away. Detached rather than
    // in place so nothing is ever visible mid-bake and no layout is computed for it.
    const scratch = document.createElement('div');
    const app = mount(SceneryLayer, { target: scratch, props: layerProps() });
    const markup = scratch.innerHTML;
    unmount(app);

    writeCache(key, markup);
    baked = markup;
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
  {#if baked !== null}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- the markup is this app's own render output, not input -->
    {@html baked}
  {:else}
    <SceneryLayer {controls} {allControls} {panelControls} {panelWidth} {panelHeight} {scale} />
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
