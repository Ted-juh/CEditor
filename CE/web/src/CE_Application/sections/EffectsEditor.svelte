<script>
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  const TARGETS = ['component', 'text', 'icon'];
  const blendModes = [
    'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
    'color-dodge', 'color-burn', 'hard-light', 'soft-light',
    'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
  ];

  let core = $derived(getSection(control, 'Core'));
  let effects = $derived(getSection(control, 'Effects'));
  let text = $derived(getSection(control, 'Text'));
  let icon = $derived(getSection(control, 'Icon'));
  let textEffects = $derived(text?._children?.Effects ?? null);
  let iconEffects = $derived(icon?._children?.Effects ?? null);
  let selectedTarget = $state('component');

  function set(path, value) {
    if (!core?.id) return;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(core.id, path, value);
    }
  }
</script>

{#if effects}
  <PropertySection title="Effects Target">
    <PropertyCell label="Target" span={4} hint="Centralized effects editing for component, text, and icon.">
      <div class="target-row">
        {#each TARGETS as target}
          <button class="target-btn" class:active={selectedTarget === target} onclick={() => selectedTarget = target}>
            {target}
          </button>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  {#if selectedTarget === 'component'}
    <PropertySection title="Component Effects">
      <PropertyCell label="Shadow" span={1} hint="Enable the first component drop shadow.">
        <PropertyToggle
          value={effects?._children?.Shadows?.items?.[0]?.enabled === true}
          onchange={() => set('Effects.Shadows.items.0.enabled', !(effects?._children?.Shadows?.items?.[0]?.enabled === true))}
        />
      </PropertyCell>
      <PropertyCell label="Blur" span={1} hint="Overall component blur.">
        <NumberInput value={effects?._children?.Filters?.blur ?? 0} step={0.5} min={0} onchange={(value) => set('Effects.Filters.blur', value)} />
      </PropertyCell>
      <PropertyCell label="Bright" span={1} hint="Overall component brightness.">
        <NumberInput value={effects?._children?.Filters?.brightness ?? 100} step={1} min={0} onchange={(value) => set('Effects.Filters.brightness', value)} />
      </PropertyCell>
      <PropertyCell label="Blend" span={1} hint="Blend mode for the component.">
        <select class="val" value={effects?._children?.Blend?.mode ?? 'normal'} onchange={(event) => set('Effects.Blend.mode', event.target.value)}>
          {#each blendModes as mode}
            <option value={mode}>{mode}</option>
          {/each}
        </select>
      </PropertyCell>
    </PropertySection>
  {:else if selectedTarget === 'text' && textEffects}
    <PropertySection title="Text Effects">
      <PropertyCell label="Shadow" span={1} hint="Enable text shadow.">
        <PropertyToggle value={textEffects.shadowEnabled === true} onchange={() => set('Text.Effects.shadowEnabled', !(textEffects.shadowEnabled === true))} />
      </PropertyCell>
      <PropertyCell label="Glow" span={1} hint="Enable text glow.">
        <PropertyToggle value={textEffects.glowEnabled === true} onchange={() => set('Text.Effects.glowEnabled', !(textEffects.glowEnabled === true))} />
      </PropertyCell>
      <PropertyCell label="Blur" span={1} hint="Enable text blur.">
        <PropertyToggle value={textEffects.blurEnabled === true} onchange={() => set('Text.Effects.blurEnabled', !(textEffects.blurEnabled === true))} />
      </PropertyCell>
      <PropertyCell label="Blur Amt" span={1} hint="Text blur amount.">
        <NumberInput value={textEffects.blurAmount ?? 1} step={0.5} min={0} onchange={(value) => set('Text.Effects.blurAmount', value)} />
      </PropertyCell>
      <PropertyCell label="Shadow X" span={1} hint="Text shadow horizontal offset.">
        <NumberInput value={textEffects.shadowOffsetX ?? 1} step={1} onchange={(value) => set('Text.Effects.shadowOffsetX', value)} />
      </PropertyCell>
      <PropertyCell label="Shadow Y" span={1} hint="Text shadow vertical offset.">
        <NumberInput value={textEffects.shadowOffsetY ?? 1} step={1} onchange={(value) => set('Text.Effects.shadowOffsetY', value)} />
      </PropertyCell>
      <PropertyCell label="Glow Size" span={1} hint="Text glow size.">
        <NumberInput value={textEffects.glowSize ?? 4} step={0.5} min={0} onchange={(value) => set('Text.Effects.glowSize', value)} />
      </PropertyCell>
      <PropertyCell label="Outline" span={1} hint="Enable text outline.">
        <PropertyToggle value={textEffects.outlineEnabled === true} onchange={() => set('Text.Effects.outlineEnabled', !(textEffects.outlineEnabled === true))} />
      </PropertyCell>
    </PropertySection>
  {:else if selectedTarget === 'icon' && iconEffects}
    <PropertySection title="Icon Effects">
      <PropertyCell label="Shadow" span={1} hint="Enable icon drop shadow.">
        <PropertyToggle value={iconEffects.shadowEnabled === true} onchange={() => set('Icon.Effects.shadowEnabled', !(iconEffects.shadowEnabled === true))} />
      </PropertyCell>
      <PropertyCell label="Glow" span={1} hint="Enable icon glow.">
        <PropertyToggle value={iconEffects.glowEnabled === true} onchange={() => set('Icon.Effects.glowEnabled', !(iconEffects.glowEnabled === true))} />
      </PropertyCell>
      <PropertyCell label="Blur" span={1} hint="Enable icon blur.">
        <PropertyToggle value={iconEffects.blurEnabled === true} onchange={() => set('Icon.Effects.blurEnabled', !(iconEffects.blurEnabled === true))} />
      </PropertyCell>
      <PropertyCell label="Amount" span={1} hint="Icon blur amount.">
        <NumberInput value={iconEffects.blurAmount ?? 0} step={0.5} min={0} onchange={(value) => set('Icon.Effects.blurAmount', value)} />
      </PropertyCell>
      <PropertyCell label="Shadow X" span={1} hint="Icon shadow horizontal offset.">
        <NumberInput value={iconEffects.shadowOffsetX ?? 0} step={1} onchange={(value) => set('Icon.Effects.shadowOffsetX', value)} />
      </PropertyCell>
      <PropertyCell label="Shadow Y" span={1} hint="Icon shadow vertical offset.">
        <NumberInput value={iconEffects.shadowOffsetY ?? 2} step={1} onchange={(value) => set('Icon.Effects.shadowOffsetY', value)} />
      </PropertyCell>
      <PropertyCell label="Glow Size" span={1} hint="Icon glow size.">
        <NumberInput value={iconEffects.glowSize ?? 4} step={0.5} min={0} onchange={(value) => set('Icon.Effects.glowSize', value)} />
      </PropertyCell>
      <PropertyCell label="Tint" span={1} hint="Primary icon tint still lives in Icon.">
        <input class="val" type="text" value={icon?.tint ?? 'FFFFFFFF'} onchange={(event) => set('Icon.tint', event.target.value)} />
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .target-row {
    display: flex;
    gap: 6px;
    width: 100%;
  }

  .target-btn {
    flex: 1;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #AAA;
    border-radius: 3px;
    height: 28px;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
    text-transform: capitalize;
  }

  .target-btn.active {
    background: #094771;
    border-color: #0B6EB5;
    color: #FFF;
  }

  .val {
    width: 100%;
    min-width: 0;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    padding: 4px 6px;
    font-family: inherit;
    outline: none;
  }
</style>
