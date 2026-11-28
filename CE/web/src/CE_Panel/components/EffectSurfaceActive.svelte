<script>
  // A surface that has something to draw: EffectSurface.svelte mounts this only then.
  import { surfaceShadows } from '../../CE_Application/utils/surfaceEffects.js';
  import { buildFilterCSS, buildBlendCSS } from '../../CE_Application/utils/effectsCSS.js';
  import { materialActive } from '../../CE_Application/utils/materialFilter.js';
  import MaterialFilter from './MaterialFilter.svelte';
  import ShadowFilter from './ShadowFilter.svelte';
  // `blend` is the blend mode the thing inside was given where it is edited — a fill layer's Blend
  // in the Background tab. A filter makes this wrapper an isolated group, and inside one a blend
  // mode has nothing beneath it to blend with: an image layer set to Multiply drew as Normal the
  // moment it gained a shadow or a filter. So the wrapper carries it instead, where the layers
  // below are. The surface's own Effects › Blend, when it says anything, wins.
  let { effects = null, width = 0, height = 0, shadowsOnly = false, target = '', blend = 'normal', children } = $props();
  let blendStyle = $derived(shadowsOnly ? ''
    : (buildBlendCSS(effects) || (blend && blend !== 'normal' ? `mix-blend-mode: ${blend};` : '')));
  const uid = $props.id();
  const id = `surface-effects-${uid}`;
  const materialId = `surface-material-${uid}`;
  let shadows = $derived(surfaceShadows(effects));
  // The material lights a SURFACE — a background, a fill layer, a border — never the whole
  // component, whose wrapper carries only its shadows (`shadowsOnly`) so text is not lit as if
  // it were embossed into the body. See utils/materialFilter.js.
  let material = $derived(shadowsOnly ? null : effects?._children?.Material ?? null);
  let lit = $derived(materialActive(material));
  let filterStyle = $derived(shadowsOnly ? '' : buildFilterCSS({ _children: {
    Filters: { blur: 0, brightness: 100, contrast: 100, saturation: 100, hueRotate: 0, grayscale: 0, sepia: 0, invert: 0, ...effects?._children?.Filters },
  } }).replace(/^filter:\s*/, '').replace(/;$/, ''));
</script>

{#if lit}
  <MaterialFilter id={materialId} {material} />
{/if}
{#if shadows.length}
  <ShadowFilter {id} {shadows} {width} {height} />
{/if}
<!-- Material first, so the shadows and bevel fall from the lit surface rather than the light
     being painted over them. -->
<div class="effect-surface" data-effect-surface={target}
  style={`filter: ${[lit ? `url(#${materialId})` : '', shadows.length ? `url(#${id})` : '', filterStyle].filter(Boolean).join(' ') || 'none'}; ${blendStyle}`}>
  {@render children()}
</div>

<style>
  .effect-surface { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
</style>
