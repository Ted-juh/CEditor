<script module>
  // The size of an image a pattern draws, by source, for the whole page: a pattern's tile is the
  // image's own size times its scale, and an image's size is only known once it has loaded. A
  // built-in tile's is known at once (utils/patternLayers.js PATTERN_TILES).
  const measured = new Map();
  // Instances waiting on an image that is still loading, told its size when it lands.
  const waiting = new Map();
</script>

<script>
  /**
   * A background's patterns (utils/patternLayers.js) for one place: `behind` the content, drawn by
   * BackgroundRenderer over the fill, or `front`, drawn by the control over its text. Each is a layer
   * clipped to the control's shape, holding a tinted, masked area a tile larger than the control,
   * inside one or two movers that slide it a tile at a time — composited, so the mask is painted
   * once.
   */
  import { systemReducedMotion } from '../../CE_Application/stores/reducedMotion.js';
  import { patternFrameCap } from '../../CE_Application/stores/patternFrameCap.js';
  import { knownTileSize, patternEntries, patternImageUrl, patternStyles, readPattern } from '../../CE_Application/utils/patternLayers.js';

  let {
    background = null,
    place = 'behind',
    width = 0,
    height = 0,
    // The control's shape (utils/plainFillCSS.js fillShapeCSS): a border-radius or a clip-path.
    clip = '',
    // The preview's own Reduced motion switch, where there is one; the OS setting is read here.
    reducedMotion = false,
    // A cap on how often a pattern moves, frames a second; 0 is every frame the browser draws, or the
    // page's own cap (stores/patternFrameCap.js: 30 in a plug-in exported with it on).
    fps = 0,
    // A scene's clips on these patterns (utils/sceneModel.js sceneControlOutput): pattern name ->
    // CSS animation values, played on a wrapper inside the layer — its fade multiplies the pattern's
    // own opacity, its moves carry the scrolling tile — so the scroll goes on underneath.
    animations = null,
  } = $props();
  const animationOf = (name) => {
    const list = animations?.get?.(name);
    return list?.length ? `animation:${list.join(', ')};` : '';
  };

  let sizes = $state({});

  /** An image's natural size, loaded once per page; null until it is known. */
  function naturalSize(src) {
    const known = knownTileSize(src);
    if (known) return known;
    const url = patternImageUrl(src);
    if (!url) return null;
    if (sizes[url]) return sizes[url];
    if (measured.get(url)) return measured.get(url);
    if (typeof Image === 'undefined') return null;
    // Loading, here or for another control: wait to be told. Nothing is written now — writing state
    // while a derived value is computed is not allowed — only when the image lands.
    if (!waiting.has(url)) waiting.set(url, new Set());
    waiting.get(url).add(remember);
    if (measured.has(url)) return null;
    measured.set(url, null);
    const image = new Image();
    image.onload = () => {
      const size = { width: image.naturalWidth || 1, height: image.naturalHeight || 1 };
      measured.set(url, size);
      for (const tell of waiting.get(url) ?? []) tell(url, size);
      waiting.delete(url);
    };
    image.src = url;
    return null;
  }

  function remember(url, size) {
    sizes = { ...sizes, [url]: size };
  }

  let reduced = $derived(reducedMotion || $systemReducedMotion);
  let cap = $derived(fps > 0 ? fps : $patternFrameCap);
  let drawn = $derived(patternEntries(background)
    .filter(([, node]) => readPattern(node).place === place)
    .map(([name, node]) => {
      const styles = patternStyles(node, naturalSize(node?.src), { width, height }, { reduced, fps: cap });
      return styles ? { name, ...styles } : null;
    })
    .filter(Boolean));
</script>

{#each drawn as layer (layer.name)}
  <div class="pattern-layer" data-pattern={layer.name} data-place={place} style="{layer.layer};{clip}">
    <!-- Always there, so a clip starting does not rebuild the movers and jump the scroll. -->
    <div class="pattern-clip" style={animationOf(layer.name)}>
    {#if layer.moveX && layer.moveY}
      <div class="pattern-move-x" style={layer.moveX}>
        <div class="pattern-move-y" style={layer.moveY}>
          <div class="pattern-paint" style={layer.paint}></div>
        </div>
      </div>
    {:else if layer.moveX}
      <div class="pattern-move-x" style={layer.moveX}><div class="pattern-paint" style={layer.paint}></div></div>
    {:else if layer.moveY}
      <div class="pattern-move-y" style={layer.moveY}><div class="pattern-paint" style={layer.paint}></div></div>
    {:else}
      <div class="pattern-paint" style={layer.paint}></div>
    {/if}
    </div>
  </div>
{/each}

<style>
  .pattern-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    box-sizing: border-box;
  }
  .pattern-clip {
    position: absolute;
    inset: 0;
  }
  /* A mover is one tile in size and slides by its own width or height, forever (see HOW IT MOVES). */
  .pattern-move-x,
  .pattern-move-y {
    position: absolute;
    left: 0;
    top: 0;
    animation-iteration-count: infinite;
  }
  .pattern-move-x { animation-name: ce-pattern-x; }
  .pattern-move-y { animation-name: ce-pattern-y; }
  @keyframes ce-pattern-x { from { translate: 0 0; } to { translate: 100% 0; } }
  @keyframes ce-pattern-y { from { translate: 0 0; } to { translate: 0 100%; } }
  /* The tint is the colour it paints, on the control's colour timing like every other fill. */
  .pattern-paint {
    position: absolute;
    transition: var(--ce-colour-transition, none);
  }
</style>
