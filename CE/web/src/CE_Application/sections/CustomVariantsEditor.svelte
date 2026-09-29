<script>
  import { getSection, updateControlProperty, removeControlNode, applyControlPatch } from '../stores/controls.js';
  import { valueAtPath } from '../stores/controlTreeUtils.js';
  import { describeVariantPatches } from '../utils/customComponentVariants.js';
  import { materializedCustomComponentSnapshot } from '../utils/customComponentMaterializer.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import Shuffle from 'lucide-svelte/icons/shuffle';
  import EyeIcon from 'lucide-svelte/icons/eye';
  import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';

  // showActivePicker=false hides the instance-facing "Active" cell — inside
  // the Publish tab only the definitions are edited (the picker lives on the
  // instance Properties tab).
  let { control = null, showActivePicker = true } = $props();

  // Preset/template cards are an add-time aid (Stage D3): collapsed by
  // default so the editor keeps only live content on screen.
  let showPresetGrid = $state(false);

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
  let showAdvanced = $state(false);
  let newOverridePath = $state('');
  let newOverrideValue = $state('');
  // A part's geometry lives in its Layout child. These used to suggest `Parts.x.Transform.*`, which
  // no part has, so a variant built from them changed nothing.
  let overrideSuggestions = $derived(partNames.flatMap((name) => [
    `Parts.${name}.visible`,
    `Parts.${name}.opacity`,
    `Parts.${name}.Layout.x`,
    `Parts.${name}.Layout.y`,
    `Parts.${name}.Layout.scale`,
    `Parts.${name}.Background.Fill.colour`,
  ]));
  // Generated parts exist only after the generators run, so paths are checked against that.
  let materializedForCheck = $derived(selectedPatchEntries.length ? materializedCustomComponentSnapshot(control, { valueNormalized: 0.5, customChannels: {} }) : null);
  let patchChecks = $derived(new Map(describeVariantPatches(selected?.patches ?? {}, materializedForCheck).map((row) => [row.path, row])));
  let overrideRows = $derived(selectedPatchEntries.map(([path, value]) => {
    const base = valueAtPath(control, path);
    const check = patchChecks.get(path);
    return { path, value, base, changed: !sameValue(base, value), status: check?.status ?? 'ok', reason: check?.reason ?? '' };
  }));
  let ineffectiveCount = $derived(overrideRows.filter((row) => row.status !== 'ok').length);

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

  // A preset patches only parts this component actually has. It used to fall back to a guessed
  // name, writing patches to parts that did not exist.
  function partPath(role, suffix) {
    const found = partNames.find((name) => name.toLowerCase().includes(role));
    return found ? `Parts.${found}.${suffix}` : '';
  }

  function patchesOf(entries) {
    return Object.fromEntries(entries.filter(([path]) => path));
  }

  function createVariantPresets() {
    return [
      {
        id: 'compact',
        label: 'Compact',
        description: 'Smaller layout and tighter type for dense panels.',
        patches: patchesOf([
          [partPath('label', 'Text.Font.size'), 10],
          [partPath('handle', 'Layout.scale'), 0.85],
        ]),
      },
      {
        id: 'dark',
        label: 'Dark',
        description: 'Darker shell with a brighter accent part.',
        patches: patchesOf([
          [partPath('background', 'Background.Fill.colour'), 'FF15171A'],
          [partPath('handle', 'Background.Fill.colour'), 'FF5B9BD5'],
          [partPath('label', 'Text.Fill.colour'), 'FFEFEFEF'],
        ]),
      },
      {
        id: 'light',
        label: 'Light',
        description: 'Light panel-friendly colour treatment.',
        patches: patchesOf([
          [partPath('background', 'Background.Fill.colour'), 'FFE8ECEF'],
          [partPath('handle', 'Background.Fill.colour'), 'FF2E78B7'],
          [partPath('label', 'Text.Fill.colour'), 'FF1D242B'],
        ]),
      },
      // No 'Vertical' preset. It rotated the label and track parts, each about its own centre,
      // which does not turn a horizontal layout into a vertical one — and it resized the component
      // through Designer.width/height, which is not what sizes a placed copy. A vertical look is a
      // layout of its own; draw it as a separate component.
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

  function sameValue(a, b) {
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return String(a ?? '') === String(b ?? '');
  }

  function displayValue(value) {
    if (value === undefined) return '—';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  // Coerce a text field back to the natural type, preferring the base value's
  // type so a numeric/boolean property is not silently turned into a string.
  function coerceValue(raw, base) {
    const text = String(raw ?? '');
    if (typeof base === 'boolean') return text === 'true';
    if (typeof base === 'number') {
      const n = Number(text);
      return Number.isFinite(n) ? n : text;
    }
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text.trim() !== '' && Number.isFinite(Number(text))) return Number(text);
    return text;
  }

  function writePatches(next) {
    if (!core?.id || !selectedName) return;
    updateControlProperty(core.id, `Variants.${selectedName}.patches`, next);
  }

  function setOverride(path, rawValue, base) {
    const key = String(path ?? '').trim();
    if (!key) return;
    writePatches({ ...(selected?.patches ?? {}), [key]: coerceValue(rawValue, base) });
  }

  function removeOverride(path) {
    const next = { ...(selected?.patches ?? {}) };
    delete next[path];
    writePatches(next);
  }

  function addOverride() {
    const key = String(newOverridePath ?? '').trim();
    if (!key) return;
    const base = valueAtPath(control, key);
    const raw = newOverrideValue !== '' ? newOverrideValue : (base !== undefined ? base : '');
    writePatches({ ...(selected?.patches ?? {}), [key]: coerceValue(raw, base) });
    newOverridePath = '';
    newOverrideValue = '';
  }

  function resetOverride(path) {
    const base = valueAtPath(control, path);
    if (base !== undefined) setOverride(path, base, base);
  }
</script>

{#if variants}
  <PropertySection title="Variants" icon={Shuffle}>
    {#if showActivePicker}
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
    {/if}
    <PropertyCell label="Selected" span={showActivePicker ? 2 : 4} hint="Variant to inspect and edit.">
      <select class="val" bind:value={selectedName}>
        {#each names as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Add" span={3} hint="Add a named component variant such as compact, vertical, dark, or detailed.">
      <input class="val" type="text" bind:value={newName} placeholder="variantName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create variant." compact>
      <button class="action-btn" type="button" onclick={addVariant}>Add</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Variant Preview" icon={EyeIcon}>
    <PropertyCell label="Summary" span={2} hint="Variant count and active state. The artboard always shows the base you are editing; see a variant on a placed copy, or under Sizes… on the States strip.">
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
    <PropertyCell label="Starter Variants" span={4} hint="Create common variant patches without hand-writing JSON.">
      <button class="preset-disclosure" type="button" onclick={() => showPresetGrid = !showPresetGrid}>{showPresetGrid ? "Hide" : "Show"} starter variants ▾</button>
      {#if showPresetGrid}
      <div class="preset-grid">
        {#each variantPresets as preset}
          <button class="preset-btn" type="button" onclick={() => applyVariantPreset(preset)}>
            <strong>{preset.label}</strong>
            <span>{preset.description}</span>
          </button>
        {/each}
      </div>
      {/if}
    </PropertyCell>
  </PropertySection>

  {#if selected}
    <PropertySection title="Variant Definition" icon={SlidersHorizontal}>
      <PropertyCell label="Enabled" span={1} hint="Enable this variant.">
        <PropertyToggle value={selected.enabled !== false} onchange={() => set('enabled', !(selected.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Label" span={3} hint="Friendly variant label.">
        <input class="val" type="text" value={selected.label ?? selectedName} onchange={(event) => set('label', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Description" span={4} hint="Describe when this variant should be used.">
        <textarea class="val code" rows="3" value={selected.description ?? ''} onchange={(event) => set('description', event.target.value)}></textarea>
      </PropertyCell>
      <PropertyCell label="Overrides" span={4} hint="Properties this variant changes from the base component. Base value shown for reference.">
        <div class="override-list">
          {#if overrideRows.length}
            {#each overrideRows as row (row.path)}
              <div class="override-row" class:unchanged={!row.changed} class:ineffective={row.status !== 'ok'} data-status={row.status}>
                <div class="override-path" title={row.reason ? `${row.path} — ${row.reason}` : row.path}>{row.status !== 'ok' ? '⚠ ' : ''}{row.path}</div>
                <div class="override-base" title={`Base: ${displayValue(row.base)}`}>{displayValue(row.base)}</div>
                {#if typeof row.value === 'boolean' || typeof row.base === 'boolean'}
                  <div class="override-edit"><PropertyToggle value={row.value === true} onchange={() => setOverride(row.path, !(row.value === true), row.base)} /></div>
                {:else}
                  <input class="val override-edit" type="text" value={displayValue(row.value)} onchange={(event) => setOverride(row.path, event.target.value, row.base)} />
                {/if}
                <button class="row-btn" type="button" title="Reset override to the base value" aria-label="Reset to base" disabled={row.base === undefined} onclick={() => resetOverride(row.path)}>↺</button>
                <button class="row-btn danger" type="button" title="Remove this override" aria-label="Remove override" onclick={() => removeOverride(row.path)}>&times;</button>
              </div>
            {/each}
          {:else}
            <div class="empty-note">No overrides — this variant matches the base component.</div>
          {/if}
          {#if ineffectiveCount}
            <div class="ineffective-note" data-testid="variant-ineffective">
              {ineffectiveCount} override{ineffectiveCount === 1 ? '' : 's'} will not change anything:
              {#each overrideRows.filter((row) => row.status !== 'ok') as row (row.path)}
                <span><code>{row.path}</code> — {row.reason}.</span>
              {/each}
            </div>
          {/if}
          <div class="override-add">
            <input class="val" type="text" list="variant-override-paths" bind:value={newOverridePath} placeholder="Parts.label.visible" />
            <input class="val" type="text" bind:value={newOverrideValue} placeholder="value" onkeydown={(event) => { if (event.key === 'Enter') addOverride(); }} />
            <button class="action-btn compact" type="button" onclick={addOverride} disabled={!newOverridePath.trim()}>Add</button>
          </div>
          <datalist id="variant-override-paths">
            {#each overrideSuggestions as path}
              <option value={path}></option>
            {/each}
          </datalist>
        </div>
      </PropertyCell>
      <PropertyCell label="" span={4} hint="Raw JSON patch map — an escape hatch for cases the visual editor doesn't cover yet." compact>
        <div class="advanced-block">
          <button class="cond-mini" type="button" onclick={() => showAdvanced = !showAdvanced}>{showAdvanced ? 'Hide raw JSON' : 'Advanced: raw JSON'}</button>
          {#if showAdvanced}
            <textarea class="val code" rows="8" bind:value={patchDraft} onblur={commitPatches}></textarea>
          {/if}
        </div>
      </PropertyCell>
      <PropertyCell label="" span={4} hint="Remove this variant. Default cannot be removed." compact>
        <div class="footer-row">
          <span>{parseError}</span>
          <button class="action-btn danger compact" type="button" onclick={removeVariant} disabled={selectedName === 'default'}>Remove variant</button>
        </div>
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }

  /* A textarea wears `.val` too, and the shared skin is sized for a single-line field. Rows
     decide its height; the token is only a floor. */
  textarea.val {
    height: auto;
    min-height: var(--pp-field-height, 26px);
    padding: 4px 6px;
    line-height: 1.4;
    resize: vertical;
  }
  .val.code { font-family: Consolas, 'Courier New', monospace; line-height: 1.4; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .action-btn { width: 100%; background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 8px; cursor: pointer; font-family: inherit; }
  .action-btn.compact { width: auto; }
  .action-btn:hover:not(:disabled) { border-color: #5B9BD5; color: #FFF; }
  .action-btn.danger:hover:not(:disabled) { border-color: #D56B6B; }
  .action-btn:disabled { opacity: 0.4; cursor: default; }
  .footer-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; color: #C96A6A; font-size: 10px; min-height: 26px; }
  .variant-summary { background: #202020; border: 1px solid #343434; border-radius: 4px; box-sizing: border-box; min-height: 54px; padding: 8px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
  .variant-summary strong { color: #E0E0E0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .variant-summary span { color: #999; }
  .empty-note { color: #777; font-size: 11px; min-height: 26px; display: flex; align-items: center; padding: 0 8px; }
  .override-list { display: flex; flex-direction: column; gap: 4px; width: 100%; min-width: 0; }
  .override-row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr) minmax(0, 1fr) auto auto; gap: 4px; align-items: center; }
  .override-row.unchanged .override-edit { opacity: 0.7; }
  .override-row.ineffective .override-path { color: #E0A15B; }
  .ineffective-note { display: grid; gap: 2px; padding: 6px 8px; border: 1px solid #5A4020; border-radius: 3px; background: #2A2016; color: #E0B97A; font-size: 10px; line-height: 1.35; }
  .ineffective-note code { font-family: Consolas, 'Courier New', monospace; }
  .override-path { color: #CFCFCF; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: Consolas, 'Courier New', monospace; }
  .override-base { color: #888; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .override-edit { min-width: 0; }
  .row-btn { background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #C8C8C8; font-size: 12px; line-height: 1; width: 24px; height: 24px; cursor: pointer; padding: 0; }
  .row-btn:hover:not(:disabled) { border-color: #5B9BD5; color: #FFF; }
  .row-btn.danger:hover:not(:disabled) { border-color: #D56B6B; }
  .row-btn:disabled { opacity: 0.35; cursor: default; }
  .override-add { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto; gap: 4px; align-items: center; margin-top: 2px; }
  .advanced-block { display: flex; flex-direction: column; gap: 6px; width: 100%; }
  .cond-mini { width: fit-content; background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #BBB; font-size: 10px; padding: 3px 8px; cursor: pointer; font-family: inherit; }
  .cond-mini:hover { border-color: #5B9BD5; color: #FFF; }
  .preset-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .preset-btn { min-height: 54px; background: #202020; border: 1px solid #343434; border-radius: 4px; color: #CCC; cursor: pointer; font-family: inherit; font-size: 11px; text-align: left; box-sizing: border-box; padding: 8px; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .preset-btn:hover { border-color: #5B9BD5; color: #FFF; }
  .preset-btn strong { color: #E0E0E0; }
  .preset-btn span { color: #999; line-height: 1.3; }
  .preset-disclosure {
    width: fit-content;
    background: #252525;
    border: 1px solid #3B3B3B;
    border-radius: 3px;
    color: #BBB;
    font-size: 10px;
    font-family: inherit;
    padding: 3px 8px;
    cursor: pointer;
    margin-bottom: 4px;
  }

  .preset-disclosure:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }
</style>
