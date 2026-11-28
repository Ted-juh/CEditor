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
  import { parseTiming } from '../../CE_Application/utils/easing.js';

  /**
   * A mover whose speed changes — a state that sets the pattern faster or slower — keeps its place
   * and eases to the new speed, on the control's colour timing (`--ce-colour-timing`), as the tint,
   * the opacity and the size do. A CSS animation given a new duration keeps its elapsed time and so
   * jumps to another place; this puts it back where it was, in the new duration's terms, and ramps
   * its rate from the old speed to the new.
   */
  function steadyScroll(node, params) {
    let duration = Number(params?.duration) || 0;
    let frame = 0;
    const stop = () => { if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame); frame = 0; };
    return {
      update(next) {
        const after = Number(next?.duration) || 0;
        const before = duration;
        duration = after;
        if (!before || !after || before === after) return;
        // The scroll itself: not the size's transition, which is an animation of the mover too.
        const animation = node.getAnimations?.()?.find((entry) => entry.animationName);
        if (!animation || animation.currentTime === null || animation.currentTime === undefined) return;
        const place = (Number(animation.currentTime) % before) / before;
        animation.currentTime = place * after;
        stop();
        // At once: the same place, at the old speed; then to the new speed on the colour timing —
        // the one given with the new duration, or, where none is given, the control's variable,
        // read a frame later when it has surely reached this element.
        const from = after / before;
        const started = performance.now();
        animation.playbackRate = from;
        if (typeof requestAnimationFrame !== 'function') { animation.playbackRate = 1; return; }
        let timing = next?.timing ? parseTiming(next.timing) : null;
        const step = (now) => {
          timing ??= parseTiming(getComputedStyle(node).getPropertyValue('--ce-colour-timing').trim()) ?? { duration: 0, delay: 0, ease: (t) => t };
          const t = timing.duration > 0 ? Math.min(1, Math.max(0, (now - started - timing.delay) / timing.duration)) : 1;
          animation.playbackRate = from + (1 - from) * timing.ease(t);
          frame = t < 1 ? requestAnimationFrame(step) : 0;
          if (t >= 1) animation.playbackRate = 1;
        };
        frame = requestAnimationFrame(step);
      },
      destroy: stop,
    };
  }

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
    // The control's (or part's) colour timing ('600ms linear 0ms'), or null: a state that changes
    // the pattern eases its tint, opacity, size and speed on it. Written into each element's own
    // style, beside the value it eases, so both change in one write: WebKitGTK settled a pattern's
    // new opacity with no transition when the control's --ce-colour-timing arrived a write later.
    timing = null,
  } = $props();
  const eased = (properties) => (timing ? `;transition:${properties.map((property) => `${property} ${timing}`).join(', ')}` : '');
  const PAINT_EASED = ['background-color', 'left', 'top', 'width', 'height', '-webkit-mask-size', 'mask-size', '-webkit-mask-position', 'mask-position'];
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
      return styles ? { name, ...styles, durationX: Number(/animation-duration:(\d+)ms/.exec(styles.moveX ?? '')?.[1]) || 0, durationY: Number(/animation-duration:(\d+)ms/.exec(styles.moveY ?? '')?.[1]) || 0 } : null;
    })
    .filter(Boolean));
</script>

{#each drawn as layer (layer.name)}
  <div class="pattern-layer" data-pattern={layer.name} data-place={place} style="{layer.layer};{clip}{eased(['opacity'])}">
    <!-- Always there, so a clip starting does not rebuild the movers and jump the scroll. -->
    <div class="pattern-clip" style={animationOf(layer.name)}>
    {#if layer.moveX && layer.moveY}
      <div class="pattern-move-x" style="{layer.moveX}{eased(['width', 'height'])}" use:steadyScroll={{ duration: layer.durationX, timing }}>
        <div class="pattern-move-y" style="{layer.moveY}{eased(['width', 'height'])}" use:steadyScroll={{ duration: layer.durationY, timing }}>
          <div class="pattern-paint" style="{layer.paint}{eased(PAINT_EASED)}"></div>
        </div>
      </div>
    {:else if layer.moveX}
      <div class="pattern-move-x" style="{layer.moveX}{eased(['width', 'height'])}" use:steadyScroll={{ duration: layer.durationX, timing }}><div class="pattern-paint" style="{layer.paint}{eased(PAINT_EASED)}"></div></div>
    {:else if layer.moveY}
      <div class="pattern-move-y" style="{layer.moveY}{eased(['width', 'height'])}" use:steadyScroll={{ duration: layer.durationY, timing }}><div class="pattern-paint" style="{layer.paint}{eased(PAINT_EASED)}"></div></div>
    {:else}
      <div class="pattern-paint" style="{layer.paint}{eased(PAINT_EASED)}"></div>
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
    /* A state that fades the pattern fades it on the control's colour timing (transitionCss.js). */
    transition: opacity var(--ce-colour-timing, 0s);
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
    /* One tile in size: a state that resizes the pattern grows the tile with the mask below. */
    transition: width var(--ce-colour-timing, 0s), height var(--ce-colour-timing, 0s);
  }
  .pattern-move-x { animation-name: ce-pattern-x; }
  .pattern-move-y { animation-name: ce-pattern-y; }
  @keyframes ce-pattern-x { from { translate: 0 0; } to { translate: 100% 0; } }
  @keyframes ce-pattern-y { from { translate: 0 0; } to { translate: 0 100%; } }
  /* The tint is the colour it paints, on the control's colour timing like every other fill; its
     size — the painted area and the mask's tile — eases on the same timing. */
  .pattern-paint {
    position: absolute;
    transition:
      background-color var(--ce-colour-timing, 0s),
      left var(--ce-colour-timing, 0s), top var(--ce-colour-timing, 0s),
      width var(--ce-colour-timing, 0s), height var(--ce-colour-timing, 0s),
      -webkit-mask-size var(--ce-colour-timing, 0s), mask-size var(--ce-colour-timing, 0s),
      -webkit-mask-position var(--ce-colour-timing, 0s), mask-position var(--ce-colour-timing, 0s);
  }
</style>
