<script>
  /**
   * In-place colour editor for an effect's colour.
   *
   * WHY IT EXISTS, and why it is not the Colors tab. The house rule in `colorTarget.js` is that
   * colour is edited in one place — the dock's Colors tab — and this is the second exception to
   * it, granted for the same reason as the first. The comment on `StopColourPopover` says it
   * exactly: sending a chip to the Colors tab means the dock swaps away from the editor you were
   * working in, and comes back only after two full-panel transitions. For a gradient that pushed
   * the gradient off screen; here it would push the specimen off screen, and the specimen is the
   * entire reason the effects live in a dock at all.
   *
   * WHY IT IS NOT StopColourPopover. That component drops alpha on purpose — a gradient stop is
   * RRGGBB, its opacity belongs to the fill layer. Every effect colour is AARRGGBB and the alpha
   * is load-bearing: `shadowColour` ships as `80000000`, a half-transparent black, and a shadow
   * forced to full opacity is a different effect. Rather than teach the shipped component a mode
   * and risk gradients, this keeps the eight digits and borrows the behaviour.
   *
   * ABANDONMENT SEMANTICS, matching the gradient popover so the two feel the same: edits are live,
   * clicking away commits, Cancel and Escape put the original back.
   */
  import { onMount, untrack } from 'svelte';
  import ColorChooser from '../ColorChooser.svelte';
  import { splitColourAlpha, alphaToHex } from '../../utils/colorMath.js';

  let { colour = 'FF000000', label = 'Colour', oninput, oncommit, oncancel } = $props();

  // Captured once — what Cancel restores. Following the prop would defeat that, because `oninput`
  // drives the prop and "the original" would chase the edit.
  const original = untrack(() => String(colour ?? 'FF000000').replace(/^#/, '').toUpperCase());
  const seed = splitColourAlpha(original);

  let live = $state(original);
  let liveColour = $state(seed.color);
  let liveAlpha = $state(seed.alpha);
  let rootEl = $state(null);

  function handleChange(fullHex) {
    // ColorChooser speaks AARRGGBB and an effect colour is AARRGGBB, so unlike the gradient stop
    // there is nothing to strip.
    const hex = String(fullHex ?? '').replace(/^#/, '').toUpperCase();
    live = hex.length === 8 ? hex : `${alphaToHex(liveAlpha)}${hex.slice(-6)}`;
    const split = splitColourAlpha(live);
    liveColour = split.color;
    liveAlpha = split.alpha;
    oninput?.(live);
  }

  function commit() { oncommit?.(live); }
  function cancel() { oncancel?.(original); }

  onMount(() => {
    function onPointerDown(event) {
      if (rootEl && !rootEl.contains(event.target)) commit();
    }
    function onKeydown(event) {
      // A key pressed inside a field belongs to the field — the chooser's hex input uses Escape to
      // revert a typo and Enter to apply it.
      if (event.target?.tagName === 'INPUT') return;
      if (event.key === 'Escape') { event.stopPropagation(); cancel(); }
      else if (event.key === 'Enter') { commit(); }
    }
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKeydown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKeydown, true);
    };
  });
</script>

<div class="fx-popover" bind:this={rootEl} role="dialog" aria-label="{label} colour">
  <div class="ph">
    <span class="pt">{label}</span>
    <span class="px">#{live}</span>
  </div>
  <div class="pc">
    <ColorChooser color={liveColour} alpha={liveAlpha} onchange={handleChange} />
  </div>
  <div class="pa">
    <button type="button" class="pb" onclick={cancel} title="Restore the colour this effect had (Esc)">Cancel</button>
    <button type="button" class="pb primary" onclick={commit} title="Keep this colour (Enter)">Done</button>
  </div>
</div>

<style>
  .fx-popover {
    position: absolute;
    z-index: 40;
    right: 0;
    top: 100%;
    margin-top: 4px;
    width: 236px;
    max-width: calc(100vw - 24px);
    background: #1E1E1E;
    border: 1px solid #555;
    border-radius: 5px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .ph {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 4px 6px;
    border-bottom: 1px solid #333;
  }
  .pt { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .px { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10px; color: #BBB; }

  .pc { height: 170px; }

  .pa { display: flex; gap: 4px; padding: 4px 6px 6px; }
  .pb {
    flex: 1;
    height: 22px;
    border: 1px solid #3B4650;
    border-radius: 3px;
    background: #1A1A1A;
    color: #B9C8D4;
    font: 600 10px/1 'IBM Plex Sans', system-ui, sans-serif;
    cursor: pointer;
  }
  .pb:hover { border-color: #55636E; color: #E8EEF5; }
  .pb.primary { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }
</style>
