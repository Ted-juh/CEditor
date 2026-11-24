<script>
  /**
   * The SVG filter behind a surface's shadows, glows and bevel (utils/surfaceEffects.js,
   * surfaceShadows): each one its source's alpha spread, blurred, moved and tinted, under the source
   * or, for an inner one, over it. Its own component so the two that draw it draw the same filter:
   * EffectSurfaceActive, as a CSS `filter: url(#id)` on HTML, and SliderShapeFill, on an SVG group
   * (utils/svgFillEffects.js says why). `width` and `height` are the surface's, in the filter's units.
   *
   * The region is a fraction of the box it filters (objectBoundingBox, the default), never pixels in
   * `userSpaceOnUse`: WebKit (the Linux app and plug-ins) places a user-space region on an HTML
   * element somewhere other than the element, and the element — an LCD, a group frame, the Macro,
   * an XY pad, whatever its control set gave a shadow — was not drawn at all. Measured in WebKitGTK
   * 2.52; Chromium draws the same region either way. The primitives stay in pixels (primitiveUnits
   * is user space by default), which both engines get right.
   */
  let { id, shadows = [], width = 0, height = 0 } = $props();
  let padding = $derived(Math.max(1, ...shadows.map((s) => Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.spread) + s.blur * 3)));
  let w = $derived(Math.max(1, Number(width) || 0));
  let h = $derived(Math.max(1, Number(height) || 0));
</script>

<svg class="effect-defs" width="0" height="0" aria-hidden="true">
  <defs>
    <filter {id} x={-padding / w} y={-padding / h} width={1 + (2 * padding) / w} height={1 + (2 * padding) / h} color-interpolation-filters="sRGB">
      {#each shadows as shadow, i}
        {#if shadow.inner}
          <feComponentTransfer in="SourceAlpha" result={`alpha${i}`}><feFuncA type="table" tableValues="1 0" /></feComponentTransfer>
        {:else}<feComposite in="SourceAlpha" in2="SourceAlpha" operator="in" result={`alpha${i}`} />{/if}
        <feMorphology in={`alpha${i}`} operator={shadow.spread < 0 ? 'erode' : 'dilate'} radius={Math.abs(shadow.spread)} result={`spread${i}`} />
        <feGaussianBlur in={`spread${i}`} stdDeviation={shadow.blur / 2} result={`blur${i}`} />
        <feOffset in={`blur${i}`} dx={shadow.x} dy={shadow.y} result={`offset${i}`} />
        <feComposite in={`offset${i}`} in2="SourceAlpha" operator={shadow.inner ? 'in' : 'out'} result={`mask${i}`} />
        <feFlood flood-color={shadow.colour} flood-opacity={shadow.alpha} result={`colour${i}`} />
        <feComposite in={`colour${i}`} in2={`mask${i}`} operator="in" result={`paint${i}`} />
      {/each}
      <feMerge>
        {#each [...shadows.keys()].reverse().filter((i) => !shadows[i].inner) as i}<feMergeNode in={`paint${i}`} />{/each}
        <feMergeNode in="SourceGraphic" />
        {#each [...shadows.keys()].reverse().filter((i) => shadows[i].inner) as i}<feMergeNode in={`paint${i}`} />{/each}
      </feMerge>
    </filter>
  </defs>
</svg>

<style>
  .effect-defs { position: absolute; pointer-events: none; }
</style>
