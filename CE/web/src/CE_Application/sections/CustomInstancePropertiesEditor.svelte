<script>
  // Instance "Properties" tab (restructure Stage A4): what a component *user*
  // configures on a placed instance — the active variant plus the published
  // inputs / editable properties / outputs. Authoring the contract itself
  // happens in the Designer workspace (author context).
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import CustomPublicPropertiesEditor from './CustomPublicPropertiesEditor.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let variants = $derived(getSection(control, 'Variants'));
  let variantNames = $derived(Object.keys(variants?._children ?? {}));

  function setActiveVariant(name) {
    if (!core?.id) return;
    updateControlProperty(core.id, 'Variants.active', name);
    updateControlProperty(core.id, 'Designer.activeVariant', name);
  }
</script>

{#if variantNames.length > 1}
  <PropertySection title="Variant">
    <PropertyCell label="Active" span={4} hint="Preset look/layout this instance uses. Variants are defined in the Component Designer.">
      <select class="val" value={variants?.active ?? 'default'} onchange={(event) => setActiveVariant(event.target.value)}>
        {#each variantNames as name (name)}
          <option value={name}>{variants?._children?.[name]?.label ?? name}</option>
        {/each}
      </select>
    </PropertyCell>
  </PropertySection>
{/if}

<CustomPublicPropertiesEditor {control} />

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }

  .val:focus {
    border-color: var(--pp-field-focus, #5B9BD5);
  }
</style>
