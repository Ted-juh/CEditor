<script>
  import PropertySection from '../../properties/PropertySection.svelte';
  import PropertyCell from '../../properties/PropertyCell.svelte';
  import PropertyColor from '../../properties/PropertyColor.svelte';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';
  import NumberCell from '../../properties/NumberCell.svelte';
  import { TEXT_EFFECTS, TEXT_UNORDERED } from '../../utils/effectStack.js';
  import { activateColorTarget } from '../../stores/colorTarget.js';

  let { values = null, controlId = '', selected = $bindable('outline'), onset = () => {} } = $props();
  const effects = [...TEXT_EFFECTS, ...TEXT_UNORDERED,
    { key: 'knockout', label: 'Hollow', enabled: 'knockout', fields: [] }];
  let effect = $derived(effects.find((item) => item.key === selected));
  // Disabled effects remain editable; enabling them restores every stored parameter.
  const label = (value) => String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
  function colourChanged(key, value) {
    let hex = String(value).replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(hex)) hex = `FF${hex}`;
    if (/^[0-9a-f]{8}$/i.test(hex)) onset(key, hex.toUpperCase());
  }
</script>

<div class="text-dock-effects">
  <div class="effect-picker" aria-label="Text effects">
    {#each effects as item}
      <button type="button" class:active={selected === item.key} aria-pressed={selected === item.key}
        onclick={() => { selected = item.key; }}>
        <span class:enabled={values?.[item.enabled] === true} aria-label={values?.[item.enabled] ? 'Enabled' : 'Disabled'}>●</span>{item.label}
      </button>
    {/each}
  </div>
  <PropertySection title={effect.label} collapseKey="effect-parameters">
    <PropertyCell label="Enabled"><PropertyToggle value={values?.[effect.enabled] === true} onchange={(v) => onset(effect.enabled, v)} /></PropertyCell>
    {#if effect.order}
      <PropertyCell label="Draw order" compact hint="Lower orders draw behind higher orders.">
        <NumberCell label="Order" value={Number(values?.[effect.order] ?? effect.defaultOrder)} step={1} onchange={(v) => onset(effect.order, v)} />
      </PropertyCell>
    {/if}
    {#each effect.fields as field (field.key)}
      <PropertyCell label={field.label} span={field.kind === 'colour' ? 2 : 1} compact={field.kind === 'number'}
        disabled={field.when ? !field.when(values ?? {}) : false} hint={`${effect.label}: ${field.label}.`}>
        {#if field.kind === 'number'}
          <NumberCell label={field.label} value={Number(values?.[field.key] ?? 0)} min={field.min} max={field.max} step={field.step ?? 1} onchange={(v) => onset(field.key, v)} />
        {:else if field.kind === 'choice'}
          <select aria-label={`${effect.label} ${field.label}`} value={values?.[field.key] ?? field.options[0]} onchange={(event) => onset(field.key, event.target.value)}>
            {#if values?.[field.key] != null && !field.options.includes(values[field.key])}<option value={values[field.key]}>{label(values[field.key])}</option>{/if}
            {#each field.options as option}<option value={option}>{label(option)}</option>{/each}
          </select>
        {:else if field.kind === 'toggle'}
          <PropertyToggle value={values?.[field.key] === true} onchange={(v) => onset(field.key, v)} />
        {:else if field.kind === 'colour'}
          <PropertyColor value={String(values?.[field.key] ?? 'FFFFFFFF')}
            onchange={(v) => colourChanged(field.key, v)}
            onswatchclick={() => activateColorTarget({ type: 'control', controlId, path: `Text.Effects.${field.key}` }, String(values?.[field.key] ?? 'FFFFFFFF'))} />
        {/if}
      </PropertyCell>
    {/each}
  </PropertySection>
</div>

<style>
  .text-dock-effects { container: text-effects / inline-size; }
  .effect-picker { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; }
  .effect-picker button { display: flex; align-items: center; gap: 5px; padding: 4px 7px; border: 1px solid #333; border-radius: 3px; background: #1A1A1A; color: #AAA; font: inherit; font-size: 11px; cursor: pointer; }
  .effect-picker button.active { background: #094771; border-color: #0B6EB5; color: #FFF; }
  .effect-picker button:hover { border-color: #5B9BD5; }
  .effect-picker span { color: #666; font-size: 8px; }
  .effect-picker span.enabled { color: #5B9BD5; }
  select { width: 100%; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font: inherit; font-size: var(--pp-field-font, 11px); }
  .text-dock-effects :global(.property-grid) { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  @container text-effects (max-width: 600px) { .text-dock-effects :global(.property-grid) { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
