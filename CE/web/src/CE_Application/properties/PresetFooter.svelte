<script>
  import PropertySection from './PropertySection.svelte';
  import PropertyCell from './PropertyCell.svelte';
  import { cardPresets, addCardPreset, updateCardPreset, removeCardPreset } from '../stores/cardPresets.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { applyControlPatch, applySelectedPatch, applyPatchObject } from '../stores/controls.js';
  import { updatePanel } from '../stores/panels.js';
  import { buildComponentPatch, buildPanelPatch, filterPatchByScopes } from '../utils/presetPatches.js';
  import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
  import { deepClone } from '../utils/deepClone.js';
  import { setDebugDock, clearDebugDock } from '../stores/debugDock.js';

  let {
    domain = '',
    control = null,
    panel = null,
    mode = 'component',
    scopeOptions = [],
  } = $props();

  let domainPresets = $derived.by(() =>
    $cardPresets
      .filter((preset) => preset.domain === domain)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  );

  let selectedPresetId = $state('');
  let draftName = $state('');
  let draftDescription = $state('');
  let selectedScopeIds = $state([]);
  let lastDomain = $state('');

  let selectedPreset = $derived.by(() =>
    domainPresets.find((preset) => preset.id === selectedPresetId) ?? null
  );
  let selectedPresetIsLegacyTextPreset = $derived.by(() =>
    domain === 'component:text'
    && !!selectedPreset
    && !Object.prototype.hasOwnProperty.call(selectedPreset.patches ?? {}, 'Text')
    && availableScopeIds().length > 0
    && availableScopeIds().every((id) => (selectedPreset.scopeIds ?? []).includes(id))
  );
  let selectedPresetDebugDump = $derived.by(() => {
    if (!selectedPreset) return '';

    const patchEntries = Object.entries(selectedPreset.patches ?? {});
    const patchKeys = patchEntries.map(([path]) => path);
    const fullTextNode = selectedPreset.patches?.Text ?? null;
    const presetFlowMode = domain === 'component:text'
      ? (
        fullTextNode?._children?.Position?.flowMode
        ?? selectedPreset.patches?.['Text.Position.flowMode']
        ?? null
      )
      : null;
    const presetOrientation = domain === 'component:text'
      ? (
        fullTextNode?._children?.Position?.orientation
        ?? selectedPreset.patches?.['Text.Position.orientation']
        ?? null
      )
      : null;
    const presetUnderline = domain === 'component:text'
      ? (
        fullTextNode?._children?.Font?.underline
        ?? selectedPreset.patches?.['Text.Font.underline']
        ?? null
      )
      : null;

    return JSON.stringify({
      domain,
      presetId: selectedPreset.id,
      presetName: selectedPreset.name,
      storedScopeIds: selectedPreset.scopeIds ?? [],
      currentApplyScopeIds: selectedScopeIds,
      patchFormat: Object.prototype.hasOwnProperty.call(selectedPreset.patches ?? {}, 'Text')
        ? 'full-text-subtree'
        : 'leaf-patch',
      patchEntryCount: patchEntries.length,
      patchKeyPreview: patchKeys.slice(0, 40),
      presetTextSummary: domain === 'component:text'
        ? {
            flowMode: presetFlowMode,
            orientation: presetOrientation,
            underline: presetUnderline,
          }
        : null,
      targetTextSummary: domain === 'component:text'
        ? {
            flowMode: control?._children?.Text?._children?.Position?.flowMode ?? null,
            orientation: control?._children?.Text?._children?.Position?.orientation ?? null,
            underline: control?._children?.Text?._children?.Font?.underline ?? null,
          }
        : null,
      rawPreset: selectedPreset,
    }, null, 2);
  });

  function availableScopeIds() {
    return (scopeOptions ?? []).map((option) => option.id);
  }

  function allSelected() {
    const ids = availableScopeIds();
    return ids.length > 0 && ids.every((id) => selectedScopeIds.includes(id));
  }

  function resetDraft() {
    selectedPresetId = '';
    draftName = '';
    draftDescription = '';
    selectedScopeIds = availableScopeIds();
  }

  function loadPresetDraft(preset) {
    if (!preset) {
      resetDraft();
      return;
    }

    selectedPresetId = preset.id;
    draftName = String(preset.name ?? '');
    draftDescription = String(preset.description ?? '');
    selectedScopeIds = Array.isArray(preset.scopeIds) && preset.scopeIds.length > 0
      ? [...preset.scopeIds]
      : availableScopeIds();
  }

  function buildCurrentPatch() {
    if (
      mode === 'component'
      && domain === 'component:text'
      && control?._children?.Text
      && availableScopeIds().length > 0
      && availableScopeIds().every((id) => selectedScopeIds.includes(id))
    ) {
      return { Text: deepClone(control._children.Text) };
    }
    if (mode === 'panel') {
      return buildPanelPatch(panel, scopeOptions, selectedScopeIds);
    }
    return buildComponentPatch(control, scopeOptions, selectedScopeIds);
  }

  function buildComponentResetPatch(scopeIds) {
    const normalizedScopeIds = Array.isArray(scopeIds) ? scopeIds : [];
    if (
      domain === 'component:text'
      && availableScopeIds().length > 0
      && availableScopeIds().every((id) => normalizedScopeIds.includes(id))
    ) {
      return { Text: deepClone(SECTION_DEFAULTS.Text) };
    }
    return buildComponentPatch({ _children: deepClone(SECTION_DEFAULTS) }, scopeOptions, scopeIds);
  }

  function buildTextSectionPatch(filteredPatch, applyScopeIds) {
    const textDefaults = deepClone(SECTION_DEFAULTS.Text);
    const currentText = deepClone(control?._children?.Text ?? SECTION_DEFAULTS.Text);
    const allTextScopesSelected =
      availableScopeIds().length > 0
      && availableScopeIds().every((id) => applyScopeIds.includes(id));

    const wrapper = {
      _children: {
        Text: allTextScopesSelected ? textDefaults : currentText,
      },
    };

    applyPatchObject(wrapper, buildComponentResetPatch(applyScopeIds));
    applyPatchObject(wrapper, filteredPatch);

    return { Text: deepClone(wrapper._children.Text) };
  }

  function applyPreset() {
    if (!selectedPreset) return;
    const applyScopeIds = selectedScopeIds.length > 0
      ? [...selectedScopeIds]
      : (
        Array.isArray(selectedPreset.scopeIds) && selectedPreset.scopeIds.length > 0
          ? [...selectedPreset.scopeIds]
          : availableScopeIds()
      );
    const filteredPatch = filterPatchByScopes(selectedPreset.patches ?? {}, scopeOptions, applyScopeIds);

    if (mode === 'panel') {
      if (!panel?.id) return;
      updatePanel(panel.id, filteredPatch);
      return;
    }

    if (!control?._children?.Core?.id) return;
    const combinedPatch =
      domain === 'component:text' && $selectedComponentIds.size <= 1
        ? buildTextSectionPatch(filteredPatch, applyScopeIds)
        : { ...buildComponentResetPatch(applyScopeIds), ...filteredPatch };
    if ($selectedComponentIds.size > 1) {
      applySelectedPatch(combinedPatch);
    } else {
      applyControlPatch(control._children.Core.id, combinedPatch);
    }
  }

  function saveNewPreset() {
    const name = draftName.trim();
    if (!name || selectedScopeIds.length === 0) return;

    const patches = buildCurrentPatch();
    if (Object.keys(patches).length === 0) return;

    const preset = addCardPreset({
      domain,
      name,
      description: draftDescription.trim(),
      scopeIds: [...selectedScopeIds],
      patches,
    });

    loadPresetDraft(preset);
  }

  function updateExistingPreset() {
    if (!selectedPreset) return;

    const name = draftName.trim();
    if (!name || selectedScopeIds.length === 0) return;

    const patches = buildCurrentPatch();
    if (Object.keys(patches).length === 0) return;

    const preset = updateCardPreset(selectedPreset.id, {
      name,
      description: draftDescription.trim(),
      scopeIds: [...selectedScopeIds],
      patches,
    });

    if (preset) loadPresetDraft(preset);
  }

  function deleteSelectedPreset() {
    if (!selectedPreset) return;
    removeCardPreset(selectedPreset.id);
    resetDraft();
  }

  function toggleScope(id) {
    if (selectedScopeIds.includes(id)) {
      selectedScopeIds = selectedScopeIds.filter((scopeId) => scopeId !== id);
    } else {
      selectedScopeIds = [...selectedScopeIds, id];
    }
  }

  function toggleAllScopes() {
    selectedScopeIds = allSelected() ? [] : availableScopeIds();
  }

  $effect(() => {
    if (domain !== lastDomain) {
      lastDomain = domain;
      resetDraft();
    }
  });

  $effect(() => {
    if (selectedPresetId && !domainPresets.some((preset) => preset.id === selectedPresetId)) {
      resetDraft();
    }
  });

  $effect(() => {
    if (!selectedPresetId && selectedScopeIds.length === 0 && availableScopeIds().length > 0) {
      selectedScopeIds = availableScopeIds();
    }
  });

  $effect(() => {
    if (!selectedPreset) {
      clearDebugDock();
      return;
    }

    setDebugDock({
      title: 'Preset Debug',
      source: `${domain} · ${selectedPreset.name}`,
      text: selectedPresetDebugDump,
    });
  });
</script>

{#if domain}
  <PropertySection title="Presets">
    <PropertyCell label="Preset" span={4} hint="Saved presets for this card only.">
      <select class="preset-select" value={selectedPresetId} onchange={(event) => loadPresetDraft(domainPresets.find((preset) => preset.id === event.target.value) ?? null)}>
        <option value="">New preset...</option>
        {#each domainPresets as preset (preset.id)}
          <option value={preset.id}>{preset.name}</option>
        {/each}
      </select>
    </PropertyCell>

    <PropertyCell label="Actions" span={4} hint="Apply, save, update, or delete presets for this card.">
      <div class="preset-action-row">
        <button class="preset-action-btn" disabled={!selectedPreset} onclick={applyPreset}>Apply</button>
        <button class="preset-action-btn" disabled={!draftName.trim() || selectedScopeIds.length === 0} onclick={saveNewPreset}>Save new</button>
        <button class="preset-action-btn" disabled={!selectedPreset || !draftName.trim() || selectedScopeIds.length === 0} onclick={updateExistingPreset}>Update</button>
        <button class="preset-action-btn" disabled={!selectedPreset} onclick={deleteSelectedPreset}>Delete</button>
        <button class="preset-action-btn" onclick={resetDraft}>New</button>
      </div>
    </PropertyCell>

    <PropertyCell label="Name" span={4} hint="Preset name used in this card's preset list.">
      <input
        class="preset-input"
        type="text"
        value={draftName}
        placeholder="Preset name..."
        onfocus={(event) => event.target.select()}
        oninput={(event) => draftName = event.target.value}
      />
    </PropertyCell>

    <PropertyCell label="Sections" span={4} hint="Choose which sections from this card will be stored in the preset.">
      <div class="preset-scope-grid">
        <button class="preset-scope-btn" class:active={allSelected()} onclick={toggleAllScopes}>All</button>
        {#each scopeOptions as option (option.id)}
          <button
            class="preset-scope-btn"
            class:active={selectedScopeIds.includes(option.id)}
            onclick={() => toggleScope(option.id)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Description">
    <PropertyCell label="Notes" span={4} hint="Optional description or tips shown when this preset is selected.">
      <textarea
        class="preset-description"
        rows="3"
        value={draftDescription}
        placeholder="Preset description or tips..."
        oninput={(event) => draftDescription = event.target.value}
      ></textarea>
    </PropertyCell>

    <PropertyCell label="Info" span={4} hint="Preset status for this card.">
      <div class="preset-info" class:warning={selectedPresetIsLegacyTextPreset}>
        {#if selectedPreset}
          <span>
            Editing <strong>{selectedPreset.name}</strong>
            {#if selectedPresetIsLegacyTextPreset}
              <br />Legacy text preset detected. Use <strong>Update</strong> once to rewrite it cleanly.
            {/if}
          </span>
        {:else if domainPresets.length > 0}
          <span>{domainPresets.length} preset{domainPresets.length === 1 ? '' : 's'} available for this card.</span>
        {:else}
          <span>No presets saved for this card yet.</span>
        {/if}
      </div>
    </PropertyCell>
  </PropertySection>

  {#if selectedPreset}
    <PropertySection title="Debug">
      <PropertyCell label="Preset Dump" span={4} hint="Runtime debug data for the selected preset.">
        <textarea
          class="preset-description preset-debug"
          rows="10"
          readonly
          value={selectedPresetDebugDump}
        ></textarea>
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .preset-select,
  .preset-input,
  .preset-description {
    width: 100%;
    color: #DDD;
    font-size: 11px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    font-family: inherit;
    outline: none;
  }

  .preset-select,
  .preset-input {
    height: 26px;
    padding: 0 6px;
  }

  .preset-description {
    min-height: 58px;
    padding: 6px 8px;
    resize: vertical;
    line-height: 1.35;
  }

  .preset-debug {
    min-height: 180px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 10px;
    white-space: pre;
  }

  .preset-select:focus,
  .preset-input:focus,
  .preset-description:focus {
    border-color: #5B9BD5;
  }

  .preset-action-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
    width: 100%;
  }

  .preset-action-btn {
    height: 26px;
    border-radius: 3px;
    border: 1px solid #333;
    background: #252525;
    color: #DDD;
    font-size: 10px;
    font-family: inherit;
    cursor: pointer;
  }

  .preset-action-btn:hover:not(:disabled) {
    border-color: #5B9BD5;
  }

  .preset-action-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .preset-scope-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    width: 100%;
  }

  .preset-scope-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 6px 4px;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #777;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .preset-scope-btn:hover {
    border-color: #555;
    color: #AAA;
  }

  .preset-scope-btn.active {
    border-color: #5B9BD5;
    color: #5B9BD5;
    background: #0D2A3E;
  }

  .preset-info {
    min-height: 26px;
    display: flex;
    align-items: center;
    color: #777;
    font-size: 10px;
  }

  .preset-info.warning {
    color: #D8B36A;
  }

  .preset-info strong {
    color: #CFCFCF;
    font-weight: 600;
  }
</style>
