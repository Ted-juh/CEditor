<script>
  /**
   * The SVG filter behind a lit material — see utils/materialFilter.js for the numbers and why.
   *
   * Renders only `<defs>`; the surface that owns it points at the filter with
   * `filter: url(#id)`. Noise becomes a height map, one distant lamp lights it (diffuse), that
   * light is multiplied onto the source graphic, a specular pass is added for the finishes that
   * shine, and the result is clipped back to the source's own alpha so a round cap stays round.
   */
  import { getContext } from 'svelte';
  import { materialPrimitives } from '../../CE_Application/utils/materialFilter.js';
  import { CONTROL_SET_LAMP_CONTEXT_KEY } from '../../CE_Application/models/controlSets.js';
  let { id, material = null, lamp = null } = $props();
  // The lamp: the caller's when it has one, otherwise the panel's control set's, which the
  // surface that renders the panel (CanvasControl, PanelSurface) puts in context as a getter.
  const lampFromContext = getContext(CONTROL_SET_LAMP_CONTEXT_KEY) ?? null;
  let setLamp = $derived(lamp ?? (typeof lampFromContext === 'function' ? lampFromContext() : lampFromContext));
  let p = $derived(materialPrimitives(material, setLamp));
</script>

{#if p}
  <svg class="material-defs" width="0" height="0" aria-hidden="true">
    <defs>
      <filter {id} x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency={p.baseFrequency} numOctaves={p.numOctaves} seed={p.seed} result="noise" />
        {#if p.blur > 0}
          <feGaussianBlur in="noise" stdDeviation={p.blur} result="noise" />
        {/if}
        <feDiffuseLighting in="noise" lighting-color="#ffffff" surfaceScale={p.surfaceScale} diffuseConstant="1" result="diffuse">
          <feDistantLight azimuth={p.azimuth} elevation={p.elevation} />
        </feDiffuseLighting>
        <feComposite in="diffuse" in2="SourceGraphic" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit" />
        {#if p.specularConstant > 0}
          <feSpecularLighting in="noise" lighting-color="#ffffff" surfaceScale={p.surfaceScale} specularConstant={p.specularConstant} specularExponent={p.specularExponent} result="spec">
            <feDistantLight azimuth={p.azimuth} elevation={p.elevation} />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
          <feComposite in="specIn" in2="lit" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit" />
        {/if}
        <feComposite in="lit" in2="SourceAlpha" operator="in" />
      </filter>
    </defs>
  </svg>
{/if}

<style>
  .material-defs { position: absolute; width: 0; height: 0; pointer-events: none; }
</style>
