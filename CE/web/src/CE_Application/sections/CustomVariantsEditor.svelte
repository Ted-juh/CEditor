<script>
  import { getSection, updateControlProperty, removeControlNode, applyControlPatch } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let variants = $derived(getSection(control, 'Variants'));
  let parts = $derived(getSection(control, 'Parts'));
  let names = $derived(Object.keys(variants?._children ?? {}));
  let partNames = $derived(Object.keys(parts?._children ?? {}));
  let variantEntries = $derived(Object.entries(variants?._children ?? {}));
  let selectedName = $state('');
  let newName = $state('');
  let selected = $derived(variants?._children?.[selectedName] ?? null);
  let selectedPatchEntries = $derived(Object.entries(selected?.patches ?? {}));
  let selectedPatchCount = $derived(selectedPatchEntries.length);
  let enabledCount = $derived(variantEntries.filter(([, variant]) => variant?.enabled !== false).length);
  let patchDraft = $state('{}');
  let parseError = $state('');
  let variantPresets = $derived(createVariantPresets());

  $effect(() => {
    if (!names.length) {
      selectedName = '';
      return;
    }
    if (!selectedName || !names.includes(selectedName)) selectedName = variants?.active ?? names[0];
  });

  $effect(() => {
    patchDraft = JSON.stringify(selected?.patches ?? {}, null, 2);
    parseError = '';
  });

  function set(path, value) {
    if (!core?.id || !selectedName) return;
    updateControlProperty(core.id, `Variants.${selectedName}.${path}`, value);
  }

  function setRoot(path, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Variants.${path}`, value);
  }

  function cleanName(value, fallback = 'variant') {
    return String(value ?? '')
      .trim()
      .replace(/[^A-Za-z0-9_$]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || fallback;
  }

  function partPath(role, suffix, fallbackName = '') {
    const found = partNames.find((name) => name.toLowerCase().includes(role));
    const name = found || fallbackName || partNames[0] || role;
    return `Parts.${name}.${suffix}`;
  }

  function createVariantPresets() {
    return [
      {
        id: 'compact',
        label: 'Compact',
        description: 'Smaller layout and tighter type for dense panels.',
        patches: {
          'Designer.width': 96,
          'Designer.height': 32,
          [partPath('label', 'Text.Font.size', 'label')]: 10,
          [partPath('handle', 'Transform.scale', 'handle')]: 0.85,
        },
      },
      {
        id: 'dark',
        label: 'Dark',
        description: 'Darker shell with a brighter accent part.',
        patches: {
          [partPath('background', 'Background.Fill.colour', 'background')]: 'FF15171A',
          [partPath('handle', 'Background.Fill.colour', 'handle')]: 'FF5B9BD5',
          [partPath('label', 'Text.Fill.colour', 'label')]: 'FFEFEFEF',
        },
      },
      {
        id: 'light',
        label: 'Light',
        description: 'Light panel-friendly colour treatment.',
        patches: {
          [partPath('background', 'Background.Fill.colour', 'background')]: 'FFE8ECEF',
          [partPath('handle', 'Background.Fill.colour', 'handle')]: 'FF2E78B7',
          [partPath('label', 'Text.Fill.colour', 'label')]: 'FF1D242B',
        },
      },
      {
        id: 'vertical',
        label: 'Vertical',
        description: 'Tall orientation starter patch.',
        patches: {
          'Designer.width': 48,
          'Designer.height': 144,
          [partPath('label', 'Transform.rotation', 'label')]: -90,
          [partPath('track', 'Transform.rotation', 'track')]: -90,
        },
      },
      {
        id: 'performance',
        label: 'Performance',
        description: 'Disable expensive decorative parts in lightweight views.',
        patches: Object.fromEntries(partNames
          .filter((name) => ['glow', 'shadow', 'highlight', 'reflection'].some((term) => name.toLowerCase().includes(term)))
          .map((name) => [`Parts.${name}.visible`, false])),
      },
    ];
  }

  function addVariant() {
    const name = String(newName ?? '').trim();
    if (!core?.id || !name || variants?._children?.[name]) return;
    updateControlProperty(core.id, `Variants.${name}`, {
      _type: 'Variant',
      name,
      label: name,
      enabled: true,
      description: '',
      patches: {},
    });
    updateControlProperty(core.id, 'Variants.active', name);
    updateControlProperty(core.id, 'Designer.activeVariant', name);
    newName = '';
    selectedName = name;
  }

  function applyVariantPreset(preset) {
    if (!core?.id || !preset) return;
    const name = cleanName(newName || preset.id);
    const existing = variants?._children?.[name] ?? {};
    const patches = preset.patches ?? {};
    applyControlPatch(core.id, {
      [`Variants.${name}`]: {
        _type: 'Variant',
        name,
        label: preset.label ?? name,
        enabled: true,
        description: preset.description ?? '',
        ...existing,
        patches: {
          ...(existing.patches ?? {}),
          ...patches,
        },
      },
      'Variants.active': name,
      'Designer.activeVariant': name,
    });
    newName = '';
    selectedName = name;
  }

  function removeVariant() {
    if (!core?.id || !selectedName || selectedName === 'default') return;
    removeControlNode(core.id, `Variants.${selectedName}`);
    selectedName = 'default';
    setRoot('active', 'default');
  }

  function commitPatches() {
    if (!core?.id || !selectedName) return;
    try {
      const parsed = JSON.parse(patchDraft || '{}');
      updateControlProperty(core.id, `Variants.${selectedName}.patches`, parsed);
      parseError = '';
    } catch (error) {
      parseError = error?.message ?? 'Invalid JSON';
    }
  }
</script>

{#if variants}
  <PropertySection title="Variants">
    <PropertyCell label="Active" span={2} hint="Variant used by preview and normal panel properties.">
      <select class="val" value={variants.active ?? 'default'} onchange={(event) => {
        setRoot('active', event.target.value);
        if (core?.id) updateControlProperty(core.id, 'Designer.activeVariant', event.target.value);
      }}>
        {#each names as name}
          <option value={name}>{variants?._children?.[name]?.label ?? name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Selected" span={2} hint="Variant to inspect and edit.">
      <select class="val" bind:value={selectedName}>
        {#each names as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Add" span={3} hint="Add a named component variant such as compact, vertical, dark, or detailed.">
      <input class="val" type="text" bind:value={newName} placeholder="variantName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create variant.">
      <button class="action-btn" type="button" onclick={addVariant}>Add</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Variant Preview">
    <PropertyCell label="Summary" span={2} hint="Variant count and active state.">
      <div class="variant-summary">
        <strong>{variants.active ?? 'default'}</strong>
        <span>{enabledCount} enabled / {names.length} total</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Selected" span={2} hint="Selected variant patch size.">
      <div class="variant-summary">
        <strong>{selected?.label ?? (selectedName || 'None')}</strong>
        <span>{selectedPatchCount} patch{selectedPatchCount === 1 ? '' : 'es'}</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Patch Map" span={4} hint="Readable view of the selected variant patch map.">
      <div class="patch-list">
        {#if selectedPatchEntries.length}
          {#each selectedPatchEntries as [path, value]}
            <div class="patch-row">
              <span>{path}</span>
              <strong>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</strong>
            </div>
          {/each}
        {:else}
          <div class="empty-note">This variant uses the base component with no overrides.</div>
        {/if}
      </div>
    </PropertyCell>
    <PropertyCell label="Starter Variants" span={4} hint="Create common variant patches without hand-writing JSON.">
      <div class="preset-grid">
        {#each variantPresets as preset}
          <button class="preset-btn" type="button" onclick={() => applyVariantPreset(preset)}>
            <strong>{preset.label}</strong>
            <span>{preset.description}</span>
          </button>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  {#if selected}
    <PropertySection title="Variant Definition">
      <PropertyCell label="Enabled" span={1} hint="Enable this variant.">
        <PropertyToggle value={selected.enabled !== false} onchange={() => set('enabled', !(selected.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Label" span={3} hint="Friendly variant label.">
        <input class="val" type="text" value={selected.label ?? selectedName} onchange={(event) => set('label', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Description" span={4} hint="Describe when this variant should be used.">
        <textarea class="val code" rows="3" value={selected.description ?? ''} onchange={(event) => set('description', event.target.value)}></textarea>
      </PropertyCell>
      <PropertyCell label="Patches" span={4} hint="Advanced JSON patch map for this variant. Visual variant editing can write here later.">
        <textarea class="val code" rows="8" bind:value={patchDraft} onblur={commitPatches}></textarea>
      </PropertyCell>
      <PropertyCell label="" span={4} hint="Remove this variant. Default cannot be removed.">
        <div class="footer-row">
          <span>{parseError}</span>
          <button class="action-btn danger compact" type="button" onclick={removeVariant} disabled={selectedName === 'default'}>Remove Variant</button>
        </div>
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .val { width: 100%; min-width: 0; background: #1A1A1A; border: 1px solid #333; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 6px; font-family: inherit; outline: none; box-sizing: border-box; }
  .val.code { font-family: Consolas, 'Courier New', monospace; line-height: 1.4; }
  .val:focus { border-color: #5B9BD5; }
  .action-btn { width: 100%; background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 8px; cursor: pointer; font-family: inherit; }
  .action-btn.compact { width: auto; }
  .action-btn:hover:not(:disabled) { border-color: #5B9BD5; color: #FFF; }
  .action-btn.danger:hover:not(:disabled) { border-color: #D56B6B; }
  .action-btn:disabled { opacity: 0.4; cursor: default; }
  .footer-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; color: #C96A6A; font-size: 10px; min-height: 26px; }
  .variant-summary, .patch-list { background: #202020; border: 1px solid #343434; border-radius: 4px; box-sizing: border-box; }
  .variant-summary { min-height: 54px; padding: 8px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
  .variant-summary strong { color: #E0E0E0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .variant-summary span { color: #999; }
  .patch-list { display: flex; flex-direction: column; gap: 1px; max-height: 150px; overflow: auto; }
  .patch-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(80px, 0.45fr); gap: 8px; padding: 6px 8px; background: #1D1D1D; min-width: 0; }
  .patch-row span, .patch-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .patch-row span { color: #AAA; }
  .patch-row strong { color: #D8D8D8; text-align: right; }
  .empty-note { color: #777; font-size: 11px; min-height: 26px; display: flex; align-items: center; padding: 0 8px; }
  .preset-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .preset-btn { min-height: 54px; background: #202020; border: 1px solid #343434; border-radius: 4px; color: #CCC; cursor: pointer; font-family: inherit; font-size: 11px; text-align: left; box-sizing: border-box; padding: 8px; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .preset-btn:hover { border-color: #5B9BD5; color: #FFF; }
  .preset-btn strong { color: #E0E0E0; }
  .preset-btn span { color: #999; line-height: 1.3; }
</style>
