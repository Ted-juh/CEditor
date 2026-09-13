<script>
  import { hasSurfaceEffects, surfaceShadows } from '../../CE_Application/utils/surfaceEffects.js';
  import { buildFilterCSS, buildBlendCSS } from '../../CE_Application/utils/effectsCSS.js';
  let { effects = null, width = 0, height = 0, shadowsOnly = false, target = '', children } = $props();
  const uid = $props.id();
  const id = `surface-effects-${uid}`;
  let shadows = $derived(surfaceShadows(effects));
  let active = $derived(shadowsOnly ? shadows.length > 0 : hasSurfaceEffects(effects));
  let padding = $derived(Math.max(1, ...shadows.map((s) => Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.spread) + s.blur * 3)));
  let filterStyle = $derived(shadowsOnly ? '' : buildFilterCSS({ _children: {
    Filters: { blur: 0, brightness: 100, contrast: 100, saturation: 100, hueRotate: 0, grayscale: 0, sepia: 0, invert: 0, ...effects?._children?.Filters },
  } }).replace(/^filter:\s*/, '').replace(/;$/, ''));
</script>

{#if active}
  {#if shadows.length}
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
  {/if}
  <div class="effect-surface" data-effect-surface={target}
    style={`filter: ${[shadows.length ? `url(#${id})` : '', filterStyle].filter(Boolean).join(' ') || 'none'}; ${shadowsOnly ? '' : buildBlendCSS(effects)}`}>
    {@render children()}
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .effect-defs { position: absolute; pointer-events: none; }
  .effect-surface { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
</style>
