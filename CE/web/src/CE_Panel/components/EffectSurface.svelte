<script>
  // Wraps its children in a surface's shadows, bevel, material, filters and blend, or in nothing
  // when the surface has none of them, which is most of the time: BackgroundRenderer puts one
  // round its background, one round its border and one round each visible fill layer, so a panel
  // control carries a dozen or more, nearly all of them empty. An empty one now costs this one
  // derived. Everything else, the six deriveds, the instance id and the filter markup, is in
  // EffectSurfaceActive.svelte and is made only for a surface that draws something.
  //
  // `props` is read whole rather than destructured with defaults: a default makes a fallback
  // getter per prop per instance, which is most of what an empty wrapper would otherwise cost.
  import { hasSurfaceEffects, surfaceShadows } from '../../CE_Application/utils/surfaceEffects.js';
  import EffectSurfaceActive from './EffectSurfaceActive.svelte';
  const props = $props();
  let active = $derived(props.shadowsOnly ? surfaceShadows(props.effects).length > 0 : hasSurfaceEffects(props.effects));
</script>

{#if active}
  <EffectSurfaceActive {...props} />
{:else}
  {@render props.children()}
{/if}
