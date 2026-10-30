<script>
  /**
   * A saved component's picture: the component itself, drawn by the canvas's renderer at its own
   * proportions and as large as the box allows.
   *
   * Package & Library and the Insert panel's library drew a schematic instead: up to 18 of the
   * component's parts as plain coloured boxes (no gradients, images, paths or text styling),
   * placed in percentages of a box that was the card's full width and a clamped 42-120 px high.
   * A round knob went into a wide flat box, so its circles came out as flat ovals, and nothing in
   * it looked like the component. The dock's Library tab had already moved to the real renderer
   * (LibraryGrid.svelte says why); this is the same for the rest.
   *
   * The box is as wide as its container (measured), `height` high, and the component is fitted
   * inside it whole, never stretched.
   */
  import EffectPreview from '../effects/EffectPreview.svelte';

  let { component = null, height = 64, width = 0, maxScale = 2, label = '' } = $props();

  let measured = $state(0);
  // Inside the 1 px border: clientWidth already is; a given width is not.
  let boxWidth = $derived(width > 0 ? Math.max(1, width - 2) : measured);
</script>

<span class="package-shot" style="height:{height}px;{width > 0 ? `width:${width}px;flex:0 0 ${width}px;` : ''}" bind:clientWidth={measured}>
  {#if !component}
    <i class="none">no component</i>
  {:else if boxWidth > 0}
    <!-- Out of the layout: the drawing is sized from the box, so it must not also size the box, or a
         panel made narrower could never shrink it. -->
    <span class="fit">
      <EffectPreview control={component} {boxWidth} boxHeight={Math.max(1, height - 2)} padding={3} {maxScale} {label} />
    </span>
  {/if}
</span>

<style>
  .package-shot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    border: 1px solid #303A42;
    border-radius: 5px;
    background: #0C0F12;
    overflow: hidden;
    box-sizing: border-box;
  }

  .fit {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .none {
    font: 400 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    font-style: normal;
    color: #4B545C;
  }
</style>
