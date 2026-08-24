<script>
  // Keyboard — a piano keyboard that sends notes on click or touch.
  //
  // Visual only. The geometry is `keyboardLayout.js` over the Zone Splitter's key maths, and the
  // held set and musical context are injected by the preview surface — the editor draws the
  // keyboard at rest, which is the right thing for an editor to show.
  //
  // Whites are drawn first and blacks over them, because a black key overlaps its neighbours and
  // painter's order is the only thing that decides which one you see. `keyboardKeys` returns them
  // in that order already, so this file does not re-sort and cannot disagree with the hit test.
  import { keyboardConfig, keyboardKeys } from '../utils/keyboardLayout.js';

  let { control = null, width = 0, height = 0, held = [], context = null } = $props();

  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    return fallback;
  }

  let cfg = $derived(keyboardConfig(control));
  let keys = $derived(keyboardKeys(control, width, height, {
    held: cfg.__held ?? held,
    context: cfg.__context ?? context,
  }));
  let whiteCss = $derived(css(cfg.whiteColour, 'rgba(232,232,232,1)'));
  let blackCss = $derived(css(cfg.blackColour, 'rgba(26,26,26,1)'));
  let heldCss = $derived(css(cfg.heldColour, 'rgba(91,155,213,1)'));
  let outCss = $derived(css(cfg.outOfKeyColour, 'rgba(154,154,154,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(85,85,85,1)'));

  function fillFor(key) {
    if (key.held) return heldCss;
    if (!key.inKey) return key.black ? blackCss : outCss;
    return key.black ? blackCss : whiteCss;
  }

  // A REFUSED KEY IS DRAWN DEAD, and only under `refuse`.
  //
  // Out-of-key shading says "that one is not in the key", which under `off` and `quantize` is all
  // there is to say — the key still sounds something. Under `refuse` it sounds NOTHING, and a player
  // who finds that out by pressing and hearing silence concludes the panel is broken rather than
  // that the panel is doing what its author asked for. So the two are drawn differently: heavier
  // dim, no label, and a cursor that says the key is not for pressing.
  function opacityFor(key) {
    if (key.refused) return 0.34;
    return key.inKey ? 1 : 0.72;
  }
</script>

<svg class="keyboard" viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} width={width} height={height} aria-hidden="true">
  {#each keys as key (key.note)}
    <rect
      x={key.rect.x} y={key.rect.y} width={Math.max(0.5, key.rect.w)} height={Math.max(0.5, key.rect.h)}
      rx={key.black ? 1.5 : 2}
      fill={fillFor(key)}
      stroke="rgba(0,0,0,0.55)"
      stroke-width={key.black ? 0 : 0.75}
      opacity={opacityFor(key)}
      class:refused={key.refused}
    />
    {#if key.label && !key.black && !key.refused && cfg.showLabels !== false && key.rect.w >= 11}
      <text
        x={key.rect.x + key.rect.w / 2}
        y={key.rect.y + key.rect.h - 3}
        fill={labelCss}
        font-size={Math.min(9, key.rect.w * 0.75)}
        text-anchor="middle"
      >{key.label}</text>
    {/if}
  {/each}
</svg>

<style>
  .keyboard { display: block; overflow: visible; }
  /* Pointer-inert as well as dim: the press would return null anyway, and a cursor that promises
     otherwise is the same lie the dimming is there to stop. */
  rect.refused { cursor: not-allowed; }
  text { font-family: inherit; pointer-events: none; user-select: none; }
</style>
