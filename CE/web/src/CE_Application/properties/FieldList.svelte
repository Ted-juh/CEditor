<script>
  // Renders ordinary inspector fields from data (utils/inspectorFields.js) with the same widgets a
  // hand-written section uses — PropertyCell, PropertyToggle, the slider row — so a section adopting
  // it looks and behaves exactly as it did. A `slot` field renders the editor's own snippet in that
  // position, which is how anything that is not ordinary (a shared widget, a button, a picker with
  // its own logic) stays in the editor while the plain fields around it come from data.
  import PropertyCell from './PropertyCell.svelte';
  import PropertyToggle from './PropertyToggle.svelte';
  import NumberCell from './NumberCell.svelte';
  import {
    fieldShown, numberValue, numberWrite, rangeView, rangeWrite, selectOptions, toggleOn,
  } from '../utils/inspectorFields.js';

  let {
    fields = [],
    values = {},                 // the section object the fields read
    set = () => {},              // (key, value) — the section's own writer
    slots = {},                  // { name: snippet } for `slot` fields
  } = $props();
</script>

{#each fields as field, index (field.slot ? `slot:${field.slot}` : field.key ?? index)}
  {#if !fieldShown(field, values)}
    <!-- hidden in this state (`when`) -->
  {:else if field.slot}
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
  {:else if field.kind === 'number'}
    {#if field.bare}
      <NumberCell label={field.numberLabel ?? field.label} min={field.min} max={field.max} step={field.step}
        value={numberValue(field, values?.[field.key])} defaultValue={field.reset === false ? undefined : field.default}
        onchange={(v) => set(field.key, numberWrite(field, v))} />
    {:else}
      <PropertyCell label={field.label} span={field.span ?? 1} compact={field.compact === true} hint={field.hint}>
        <NumberCell label={field.numberLabel ?? field.label} min={field.min} max={field.max} step={field.step}
          value={numberValue(field, values?.[field.key])} defaultValue={field.reset === false ? undefined : field.default}
          onchange={(v) => set(field.key, numberWrite(field, v))} />
      </PropertyCell>
    {/if}
  {:else if field.kind === 'select'}
    <PropertyCell label={field.label} span={field.span ?? 2} hint={field.hint}>
      <select class="val" value={values?.[field.key] ?? field.default} onchange={(e) => set(field.key, e.target.value)}>
        {#each selectOptions(field) as [value, label] (value)}<option {value}>{label}</option>{/each}
      </select>
    </PropertyCell>
  {/if}
{/each}

<style>
  .rangewrap { display: flex; align-items: center; gap: 10px; }
  .range { flex: 1 1 auto; accent-color: var(--field-accent, #39D98A); }
  /* The inspector's field skin, as every section editor spells it. */
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .lbl { font-size: 11px; color: #B9B9B9; min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
