<script>
  /**
   * The SVG filter behind a surface's shadows, glows and bevel (utils/surfaceEffects.js,
   * surfaceShadows): each one its source's alpha spread, blurred, moved and tinted, under the source
   * or, for an inner one, over it. Its own component so the two that draw it draw the same filter:
   * EffectSurfaceActive, as a CSS `filter: url(#id)` on HTML, and SliderShapeFill, on an SVG group
   * (utils/svgFillEffects.js says why). `width` and `height` are the surface's, in the filter's units.
   */
  let { id, shadows = [], width = 0, height = 0 } = $props();
  let padding = $derived(Math.max(1, ...shadows.map((s) => Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.spread) + s.blur * 3)));
</script>

<svg class="effect-defs" width="0" height="0" aria-hidden="true">
  <defs>
    <filter {id} filterUnits="userSpaceOnUse" x={-padding} y={-padding} width={width + 2 * padding} height={height + 2 * padding} color-interpolation-filters="sRGB">
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
