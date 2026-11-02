<script>
  /**
   * One set in the Library of Settings › Control Sets: its own knob, drawn by the canvas's renderer
   * (EffectPreview) straight on the set's panel colour, and its name. The Library was a strip of
   * names; a knob tells sets apart at a glance. With 79 built-ins, a card draws its knob only once it
   * has been scrolled into view.
   */
  import { onDestroy } from 'svelte';
  import EffectPreview from '../components/effects/EffectPreview.svelte';
  import { createControl } from '../models/componentTypes.js';
  import { resolveControlForSet } from '../models/controlSetFamilies.js';
  import { resolveToken } from '../models/controlSets.js';
  import { aarrggbbToHex } from '../utils/colourHex.js';

  let { set = null, active = false, onPanel = false, onselect = () => {} } = $props();

  let element = $state(null);
  let seen = $state(false);
  let observer = null;
  $effect(() => {
    if (!element || seen) return;
    if (typeof IntersectionObserver === 'undefined') { seen = true; return; }
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { seen = true; observer?.disconnect(); }
    }, { rootMargin: '120px' });
    observer.observe(element);
    return () => observer?.disconnect();
  });
  onDestroy(() => observer?.disconnect());

  let knob = $derived.by(() => {
    if (!seen || !set) return null;
    try {
      const control = createControl('Knob', { Core: { controlSetId: set.id }, Transform: { x: 0, y: 0, width: 84, height: 84 } });
      return resolveControlForSet(control, set);
    } catch {
      return null;
    }
  });
  let panelColour = $derived(aarrggbbToHex(set?.panel?.colour ?? resolveToken('panel.surface', set) ?? 'FF333333'));
</script>

<button type="button" class="set-card" class:active bind:this={element} style:--card-panel={panelColour}
        title={set?.description ?? set?.name ?? ''} onclick={() => onselect(set?.id)} data-set-card={set?.id}>
  <span class="knob">
    {#if knob}<EffectPreview control={knob} boxWidth={64} boxHeight={64} maxScale={1} />{/if}
  </span>
  <b>{set?.name ?? ''}</b>
  {#if onPanel}<i>on panel</i>{/if}
</button>

<style>
  .set-card {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0;
    padding: 6px 4px 5px; border: 1px solid transparent; border-radius: 7px; cursor: pointer;
    background: var(--card-panel, #262626); color: #E4E4E4; font: inherit;
  }
  .set-card:hover { border-color: #5b9bd5; }
  .set-card.active { border-color: #2a8fd6; box-shadow: 0 0 0 2px rgba(42, 143, 214, 0.45); }
  .knob { width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; }
  b {
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 10.5px; font-weight: 600; padding: 1px 5px; border-radius: 3px;
    background: rgba(0, 0, 0, 0.55); color: #F2F2F2;
  }
  i {
    position: absolute; top: 4px; right: 4px; font-style: normal; font-size: 8.5px; color: #8fd1a6;
    border: 1px solid #3c5a46; border-radius: 8px; padding: 0 4px; background: #11221a;
  }
</style>
