<script>
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import LayoutGrid from 'lucide-svelte/icons/layout-grid';
  import Square from 'lucide-svelte/icons/square';
  import Move from 'lucide-svelte/icons/move';
  import Layers from 'lucide-svelte/icons/layers';

  let { control = null } = $props();

  const MODE_OPTIONS = [
    'text_only',
    'icon_only',
    'icon_left_text_right',
    'text_left_icon_right',
    'icon_above_text_below',
    'text_above_icon_below',
    'overlay_centered',
  ];
  const ALIGN_OPTIONS = ['left', 'center', 'right'];
  const V_ALIGN_OPTIONS = ['top', 'center', 'bottom'];

  let core = $derived(getSection(control, 'Core'));
  let layout = $derived(getSection(control, 'ContentLayout'));

  function set(path, value) {
    if (!core?.id) return;
    const fullPath = `ContentLayout.${path}`;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(fullPath, value);
    } else {
      updateControlProperty(core.id, fullPath, value);
    }
  }
</script>

{#if layout}
  <PropertySection title="Layout" icon={LayoutGrid}>
    <PropertyCell label="Mode" span={2} hint="Choose how text and icon are arranged inside the component.">
      <select class="val" value={layout.mode ?? 'text_only'} onchange={(event) => set('mode', event.target.value)}>
        {#each MODE_OPTIONS as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Gap" span={2} compact hint="Space between text and icon when both are visible.">
      <NumberCell label="Gap" value={layout.gap ?? 8} step={1} min={0} defaultValue={8} onchange={(value) => set('gap', value)} />
    </PropertyCell>
    <PropertyCell label="H Align" span={2} hint="Horizontal alignment for the composed content block.">
      <select class="val" value={layout.horizontalAlign ?? 'center'} onchange={(event) => set('horizontalAlign', event.target.value)}>
        {#each ALIGN_OPTIONS as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="V Align" span={2} hint="Vertical alignment for the composed content block.">
      <select class="val" value={layout.verticalAlign ?? 'center'} onchange={(event) => set('verticalAlign', event.target.value)}>
        {#each V_ALIGN_OPTIONS as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Padding" icon={Square}>
    <PropertyCell label="Padding Left" span={1} compact hint="Left padding inside the button frame.">
      <NumberCell label="L" value={layout.paddingLeft ?? 8} step={1} min={0} defaultValue={8} onchange={(value) => set('paddingLeft', value)} />
    </PropertyCell>
    <PropertyCell label="Padding Right" span={1} compact hint="Right padding inside the button frame.">
      <NumberCell label="R" value={layout.paddingRight ?? 8} step={1} min={0} defaultValue={8} onchange={(value) => set('paddingRight', value)} />
    </PropertyCell>
    <PropertyCell label="Padding Top" span={1} compact hint="Top padding inside the button frame.">
      <NumberCell label="T" value={layout.paddingTop ?? 6} step={1} min={0} defaultValue={6} onchange={(value) => set('paddingTop', value)} />
    </PropertyCell>
    <PropertyCell label="Padding Bottom" span={1} compact hint="Bottom padding inside the button frame.">
      <NumberCell label="B" value={layout.paddingBottom ?? 6} step={1} min={0} defaultValue={6} onchange={(value) => set('paddingBottom', value)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Offsets" icon={Move}>
    <PropertyCell label="Text Offset X" span={1} compact hint="Nudge the text content horizontally.">
      <NumberCell label="Txt X" value={layout.textOffsetX ?? 0} step={1} defaultValue={0} onchange={(value) => set('textOffsetX', value)} />
    </PropertyCell>
    <PropertyCell label="Text Offset Y" span={1} compact hint="Nudge the text content vertically.">
      <NumberCell label="Txt Y" value={layout.textOffsetY ?? 0} step={1} defaultValue={0} onchange={(value) => set('textOffsetY', value)} />
    </PropertyCell>
    <PropertyCell label="Icon Offset X" span={1} compact hint="Nudge the icon content horizontally.">
      <NumberCell label="Icn X" value={layout.iconOffsetX ?? 0} step={1} defaultValue={0} onchange={(value) => set('iconOffsetX', value)} />
    </PropertyCell>
    <PropertyCell label="Icon Offset Y" span={1} compact hint="Nudge the icon content vertically.">
      <NumberCell label="Icn Y" value={layout.iconOffsetY ?? 0} step={1} defaultValue={0} onchange={(value) => set('iconOffsetY', value)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Overlay" icon={Layers}>
    <PropertyCell label="Text Z" span={2} compact hint="Text should usually stay above the icon in overlay mode.">
      <NumberCell label="Text Z" value={layout.textZIndex ?? 2} step={1} defaultValue={2} onchange={(value) => set('textZIndex', value)} />
    </PropertyCell>
    <PropertyCell label="Icon Z" span={2} compact hint="Icon draw order inside overlay mode.">
      <NumberCell label="Icon Z" value={layout.iconZIndex ?? 1} step={1} defaultValue={1} onchange={(value) => set('iconZIndex', value)} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
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

  .val:focus {
    border-color: #5B9BD5;
  }
</style>
