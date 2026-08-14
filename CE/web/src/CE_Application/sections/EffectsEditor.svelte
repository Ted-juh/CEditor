<script>
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import Haze from 'lucide-svelte/icons/haze';

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
      <PropertyCell label="Blur" span={1} compact hint="Overall component blur.">
        <NumberCell label="Blur" value={effects?._children?.Filters?.blur ?? 0} step={0.5} min={0} defaultValue={0} onchange={(value) => set('Effects.Filters.blur', value)} />
      </PropertyCell>
      <PropertyCell label="Bright" span={1} compact hint="Overall component brightness.">
        <NumberCell label="Bright" value={effects?._children?.Filters?.brightness ?? 100} step={1} min={0} defaultValue={100} onchange={(value) => set('Effects.Filters.brightness', value)} />
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
      <PropertyCell label="Enable" span={2} hint="Text shadow, glow, blur. Hover a chip for its name.">
        <FlagStrip
          flags={[
            { key: 'Text.Effects.shadowEnabled', title: 'Shadow — enable text shadow', on: textEffects.shadowEnabled === true, icon: Copy },
            { key: 'Text.Effects.glowEnabled', title: 'Glow — enable text glow', on: textEffects.glowEnabled === true, icon: Sparkles },
            { key: 'Text.Effects.blurEnabled', title: 'Blur — enable text blur', on: textEffects.blurEnabled === true, icon: Haze },
          ]}
          ontoggle={(key, next) => set(key, next)}
        />
      </PropertyCell>
      <PropertyCell label="Blur Amt" span={1} compact hint="Text blur amount.">
        <NumberCell label="Amt" value={textEffects.blurAmount ?? 1} step={0.5} min={0} defaultValue={1} onchange={(value) => set('Text.Effects.blurAmount', value)} />
      </PropertyCell>
      <PropertyCell label="Shadow X" span={1} compact hint="Text shadow horizontal offset.">
        <NumberCell label="X" value={textEffects.shadowOffsetX ?? 1} step={1} defaultValue={1} onchange={(value) => set('Text.Effects.shadowOffsetX', value)} />
      </PropertyCell>
      <PropertyCell label="Shadow Y" span={1} compact hint="Text shadow vertical offset.">
        <NumberCell label="Y" value={textEffects.shadowOffsetY ?? 1} step={1} defaultValue={1} onchange={(value) => set('Text.Effects.shadowOffsetY', value)} />
      </PropertyCell>
      <PropertyCell label="Glow Size" span={2} compact hint="Text glow size.">
        <NumberCell label="Size" value={textEffects.glowSize ?? 4} step={0.5} min={0} defaultValue={4} onchange={(value) => set('Text.Effects.glowSize', value)} />
      </PropertyCell>
      <PropertyCell label="Outline" span={1} hint="Enable text outline.">
        <PropertyToggle value={textEffects.outlineEnabled === true} onchange={() => set('Text.Effects.outlineEnabled', !(textEffects.outlineEnabled === true))} />
      </PropertyCell>
    </PropertySection>
  {:else if selectedTarget === 'icon' && iconEffects}
    <PropertySection title="Icon Effects">
      <PropertyCell label="Enable" span={2} hint="Icon shadow, glow, blur. Hover a chip for its name.">
        <FlagStrip
          flags={[
            { key: 'Icon.Effects.shadowEnabled', title: 'Shadow — enable icon drop shadow', on: iconEffects.shadowEnabled === true, icon: Copy },
            { key: 'Icon.Effects.glowEnabled', title: 'Glow — enable icon glow', on: iconEffects.glowEnabled === true, icon: Sparkles },
            { key: 'Icon.Effects.blurEnabled', title: 'Blur — enable icon blur', on: iconEffects.blurEnabled === true, icon: Haze },
          ]}
          ontoggle={(key, next) => set(key, next)}
        />
      </PropertyCell>
      <PropertyCell label="Amount" span={1} compact hint="Icon blur amount.">
        <NumberCell label="Amt" value={iconEffects.blurAmount ?? 0} step={0.5} min={0} defaultValue={0} onchange={(value) => set('Icon.Effects.blurAmount', value)} />
      </PropertyCell>
      <PropertyCell label="Shadow X" span={1} compact hint="Icon shadow horizontal offset.">
        <NumberCell label="X" value={iconEffects.shadowOffsetX ?? 0} step={1} defaultValue={0} onchange={(value) => set('Icon.Effects.shadowOffsetX', value)} />
      </PropertyCell>
      <PropertyCell label="Shadow Y" span={1} compact hint="Icon shadow vertical offset.">
        <NumberCell label="Y" value={iconEffects.shadowOffsetY ?? 2} step={1} defaultValue={2} onchange={(value) => set('Icon.Effects.shadowOffsetY', value)} />
      </PropertyCell>
      <PropertyCell label="Glow Size" span={2} compact hint="Icon glow size.">
        <NumberCell label="Size" value={iconEffects.glowSize ?? 4} step={0.5} min={0} defaultValue={4} onchange={(value) => set('Icon.Effects.glowSize', value)} />
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
