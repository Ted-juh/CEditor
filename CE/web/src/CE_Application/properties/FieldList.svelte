<script>
  // Renders ordinary inspector fields from data (utils/inspectorFields.js) with the same widgets a
  // hand-written section uses — PropertyCell, PropertyToggle, the slider row — so a section adopting
  // it looks and behaves exactly as it did. A `slot` field renders the editor's own snippet in that
  // position, which is how anything that is not ordinary (a shared widget, a button, a picker with
  // its own logic) stays in the editor while the plain fields around it come from data.
  import PropertyCell from './PropertyCell.svelte';
  import PropertyToggle from './PropertyToggle.svelte';
  import { rangeView, rangeWrite, toggleOn } from '../utils/inspectorFields.js';

  let {
    fields = [],
    values = {},                 // the section object the fields read
    set = () => {},              // (key, value) — the section's own writer
    slots = {},                  // { name: snippet } for `slot` fields
  } = $props();
</script>

{#each fields as field, index (field.slot ? `slot:${field.slot}` : field.key ?? index)}
  {#if field.slot}
    {@render slots[field.slot]?.()}
  {:else if field.kind === 'toggle'}
    <PropertyCell label={field.label} span={field.span ?? 1} hint={field.hint}>
      <PropertyToggle value={toggleOn(field, values?.[field.key])} onchange={() => set(field.key, !toggleOn(field, values?.[field.key]))} />
    </PropertyCell>
  {:else if field.kind === 'range'}
    {@const view = rangeView(field, values?.[field.key])}
    <PropertyCell label={field.label} span={field.span ?? 4} hint={field.hint}>
      <div class="rangewrap"><input class="range" type="range" min={view.min} max={view.max} step={view.step} value={view.value} oninput={(e) => set(field.key, rangeWrite(field, e.target.value))} /><span class="lbl">{view.text}</span></div>
    </PropertyCell>
  {/if}
{/each}

<style>
  .rangewrap { display: flex; align-items: center; gap: 10px; }
  .range { flex: 1 1 auto; accent-color: var(--field-accent, #39D98A); }
  .lbl { font-size: 11px; color: #B9B9B9; min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
