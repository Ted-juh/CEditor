<script>
  import PropertySection from '../../properties/PropertySection.svelte';
  import PropertyCell from '../../properties/PropertyCell.svelte';
  import PropertyColor from '../../properties/PropertyColor.svelte';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';
  import NumberCell from '../../properties/NumberCell.svelte';
  import OpenInDock from '../../properties/OpenInDock.svelte';
  import { activateColorTarget } from '../../stores/colorTarget.js';

  let { row = null, values = null, controlId = '', colourRoot = null, stackIndex = -1, stackSize = 0,
    onset = () => {}, ontoggle = () => {}, onreorder = () => {} } = $props();
  const titleCase = (value) => String(value).replace(/[-_]/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  function colourChanged(key, value) {
    let hex = String(value).replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(hex)) hex = `FF${hex}`;
    if (/^[0-9a-f]{8}$/i.test(hex)) onset(row, key, hex.toUpperCase());
  }
</script>

<div class="effect-settings">
  {#if !row}
    <p class="note">Pick an effect on the left.</p>
  {:else}
    <PropertySection title={row.label} collapseKey={row.key}>
      {#snippet tools()}
        {#if row.stackable && stackSize > 1}
          <span class="position">{stackIndex + 1} / {stackSize}</span>
          <button type="button" title="Move effect forward" aria-label="Move effect forward" disabled={stackIndex <= 0} onclick={() => onreorder(row.key, stackIndex - 1)}>↑</button>
          <button type="button" title="Move effect backward" aria-label="Move effect backward" disabled={stackIndex >= stackSize - 1} onclick={() => onreorder(row.key, stackIndex + 1)}>↓</button>
        {/if}
      {/snippet}
      {#if !row.alwaysOn}
        <PropertyCell label="Enabled"><PropertyToggle value={row.enabled} ariaLabel={`${row.label} enabled`} onchange={() => ontoggle(row)} /></PropertyCell>
      {/if}
      {#if row.orderPath}
        <PropertyCell label="Draw order" compact hint="Lower orders draw behind higher orders.">
          <NumberCell label="Order" value={row.order} step={1} onchange={(v) => onset(row, row.orderPath.split('.').at(-1), v)} />
        </PropertyCell>
      {/if}
      {#each row.fields as field (field.key)}
        <PropertyCell label={field.label} span={field.kind === 'colour' || field.kind === 'choice' ? 2 : 1}
          compact={field.kind === 'number'} disabled={field.when ? !field.when(values ?? {}) : false}
          hint={`${row.label}: ${field.label}.`}>
          {#if field.kind === 'number'}
            <NumberCell label={field.label} value={Number(values?.[field.key] ?? 0)} min={field.min} max={field.max}
              step={field.step ?? 1} disabled={field.when ? !field.when(values ?? {}) : false} onchange={(v) => onset(row, field.key, v)} />
          {:else if field.kind === 'choice'}
            <select aria-label={`${row.label} ${field.label}`} value={values?.[field.key] ?? field.options[0]}
              disabled={field.when ? !field.when(values ?? {}) : false} onchange={(event) => onset(row, field.key, event.target.value)}>
              {#if values?.[field.key] != null && !field.options.includes(values[field.key])}<option value={values[field.key]}>{titleCase(values[field.key])}</option>{/if}
              {#each field.options as option}<option value={option}>{titleCase(option)}</option>{/each}
            </select>
          {:else if field.kind === 'toggle'}
            <PropertyToggle value={values?.[field.key] === true} ariaLabel={`${row.label} ${field.label}`}
              disabled={field.when ? !field.when(values ?? {}) : false} onchange={(v) => onset(row, field.key, v)} />
          {:else if field.kind === 'colour'}
            <PropertyColor value={String(values?.[field.key] ?? 'FFFFFFFF')} onchange={(v) => colourChanged(field.key, v)}
              onswatchclick={() => activateColorTarget({ type: 'control', controlId, path: `${colourRoot ?? row.root}.${field.key}` }, String(values?.[field.key] ?? 'FFFFFFFF'))} />
          {/if}
        </PropertyCell>
      {/each}
      {#if row.key === 'fill'}
        <PropertyCell label="Colour and fill" span={3}><OpenInDock tab="type" domain="fill" {controlId} what="text fill" /></PropertyCell>
      {/if}
    </PropertySection>
  {/if}
</div>

<style>
  .effect-settings { container: effect-settings / inline-size; min-width: 0; }
  .effect-settings :global(.property-grid) { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .position { color: #888; font-size: 10px; margin-right: 4px; }
  button { width: 22px; height: 20px; padding: 0; border: 1px solid #333; border-radius: 3px; background: #1A1A1A; color: #AAA; cursor: pointer; }
  button:hover { border-color: #5B9BD5; color: #FFF; }
  button:disabled { opacity: .4; cursor: default; }
  select { width: 100%; height: var(--pp-field-height); padding: var(--pp-field-padding); background: var(--pp-field-bg); border: 1px solid var(--pp-field-border); border-radius: var(--pp-field-radius); color: var(--pp-field-fg); font: inherit; font-size: var(--pp-field-font); }
  .note { padding: 8px; color: #999; }
  @container effect-settings (max-width: 700px) { .effect-settings :global(.property-grid) { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  @container effect-settings (max-width: 300px) { .effect-settings :global(.property-grid) { grid-template-columns: repeat(2, minmax(0, 1fr)); } .effect-settings :global(.span-3) { grid-column: span 2; } }
</style>
