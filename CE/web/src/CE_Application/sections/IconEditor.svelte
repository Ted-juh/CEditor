<script>
  import Settings from 'lucide-svelte/icons/settings';
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { availableIcons } from '../stores/appSettings.js';
  import PropertyGrid from '../properties/PropertyGrid.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let icon = $derived(getSection(control, 'Icon'));
  let selectedIcon = $derived(
    $availableIcons.find((option) => option.value === (icon?.assetId ?? ''))
    ?? $availableIcons.find((option) => option.name === (icon?.name ?? ''))
    ?? null
  );

  function set(path, value) {
    if (!core?.id) return;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(core.id, path, value);
    }
  }

  function setAsset(event) {
    const assetId = String(event.target.value ?? '');
    const asset = $availableIcons.find((option) => option.value === assetId) ?? null;

    set('Icon.source', asset ? 'library' : 'none');
    set('Icon.assetId', assetId);
    set('Icon.name', asset?.name ?? '');
  }
</script>

{#if icon}
  <PropertyGrid>
    <PropertyCell label="Icon" span={3} hint="Choose an imported icon from the shared library">
      <select class="icon-select" value={icon?.assetId ?? ''} onchange={setAsset}>
        <option value="">No icon</option>
        {#each $availableIcons as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </PropertyCell>

    <PropertyCell label="Size" span={1} hint="Display size in pixels">
      <NumberInput
        value={icon?.size ?? 16}
        min={4}
        step={1}
        onchange={(value) => set('Icon.size', value)}
      />
    </PropertyCell>

    <PropertyCell label="Tint" span={1} hint="Primary tint applied to the imported icon.">
      <input class="icon-select" type="text" value={icon?.tint ?? 'FFFFFFFF'} onchange={(event) => set('Icon.tint', event.target.value)} />
    </PropertyCell>

    <PropertyCell label="Opacity" span={1} hint="Opacity applied to the icon image.">
      <NumberInput
        value={icon?.opacity ?? 1}
        min={0}
        max={1}
        step={0.05}
        onchange={(value) => set('Icon.opacity', value)}
      />
    </PropertyCell>

    <PropertyCell label="Rotate" span={1} hint="Rotation applied to the icon layer.">
      <NumberInput
        value={icon?.rotation ?? 0}
        step={1}
        onchange={(value) => set('Icon.rotation', value)}
      />
    </PropertyCell>

    <PropertyCell label="Preview" span={4} hint="Imported icons are managed globally in File -> Settings -> Icons">
      <div class="preview-card">
        {#if selectedIcon?.dataUrl}
          <div class="preview-frame">
            <img class="preview-image" src={selectedIcon.dataUrl} alt={selectedIcon.name} />
          </div>
          <div class="preview-meta">
            <strong>{selectedIcon.name}</strong>
            <span>{selectedIcon.isVector ? 'Vector' : 'Raster'}</span>
            {#if selectedIcon.width && selectedIcon.height}
              <span>{selectedIcon.width} x {selectedIcon.height}</span>
            {/if}
          </div>
        {:else}
          <div class="preview-empty">
            <Settings size={16} strokeWidth={1.7} />
            <span>Import icons in Settings and pick one here.</span>
          </div>
        {/if}
      </div>
    </PropertyCell>
  </PropertyGrid>
{/if}

<style>
  .icon-select {
    width: 100%;
    height: 26px;
    color: #DDD;
    font-size: 11px;
    background: #1A1A1A;
    padding: 0 6px;
    border-radius: 3px;
    border: 1px solid #333;
    font-family: inherit;
    outline: none;
  }

  .icon-select:focus {
    border-color: #5B9BD5;
  }

  .preview-card {
    min-height: 74px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid #333;
    border-radius: 6px;
    background: linear-gradient(180deg, #1B1B1B 0%, #171717 100%);
  }

  .preview-frame {
    width: 52px;
    height: 52px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1px solid #3A3A3A;
    background:
      linear-gradient(45deg, #202020 25%, transparent 25%, transparent 75%, #202020 75%),
      linear-gradient(45deg, #202020 25%, transparent 25%, transparent 75%, #202020 75%);
    background-position: 0 0, 7px 7px;
    background-size: 14px 14px;
    background-color: #181818;
  }

  .preview-image {
    max-width: 36px;
    max-height: 36px;
    object-fit: contain;
  }

  .preview-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 11px;
    color: #969696;
  }

  .preview-meta strong {
    color: #F2F2F2;
    font-size: 12px;
    font-weight: 600;
  }

  .preview-empty {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #7B7B7B;
    font-size: 11px;
  }
</style>
