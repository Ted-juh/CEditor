<script>
  import { getSection, updateControlProperty, removeControlNode } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { setDebugDock } from '../stores/debugDock.js';
  import { stateEditScope, setStateEditScopeBase, setStateEditScopeState } from '../stores/stateEditScope.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { BASE_STATE_TARGET, buildStateTargetOptions, resolveSelectedStateName, summarizeStateOverrides } from '../utils/stateTargets.js';

  let { control = null } = $props();

  const COMMON_FLAGS = [
    { key: 'hover', label: 'Hover' },
    { key: 'pressed', label: 'Pressed' },
    { key: 'focused', label: 'Focused' },
    { key: 'dragging', label: 'Dragging' },
    { key: 'disabled', label: 'Disabled' },
    { key: 'checked', label: 'Checked' },
    { key: 'mixed', label: 'Mixed' },
  ];

  let core = $derived(getSection(control, 'Core'));
  let states = $derived(getSection(control, 'States'));
  let multiEdit = $derived($selectedComponentIds.size > 1);
  let stateTargetOptions = $derived(buildStateTargetOptions(states));
  let selectedStateName = $state('');
  let newStateName = $state('');
  let componentPatchDraft = $state('{}');
  let partsPatchDraft = $state('{}');
  let parseError = $state('');
  let showAdvanced = $state(false);
  let activeScope = $derived($stateEditScope);
  let activeStateTarget = $derived(
    activeScope?.mode === 'state' && activeScope?.stateName
      ? activeScope.stateName
      : BASE_STATE_TARGET
  );
  let selectedState = $derived(
    selectedStateName && selectedStateName !== BASE_STATE_TARGET
      ? (states?._children?.[selectedStateName] ?? null)
      : null
  );
  let overrideSummary = $derived(summarizeStateOverrides(selectedState));
  let activeTargetLabel = $derived(
    activeStateTarget === BASE_STATE_TARGET
      ? 'Base'
      : (stateTargetOptions.find((option) => option.id === activeStateTarget)?.fullLabel ?? activeStateTarget)
  );

  $effect(() => {
    const nextSelectedStateName = resolveSelectedStateName(
      stateTargetOptions,
      selectedStateName,
      activeStateTarget,
    );
    if (nextSelectedStateName !== selectedStateName) {
      selectedStateName = nextSelectedStateName;
    }
  });

  $effect(() => {
    componentPatchDraft = JSON.stringify(selectedState?.patches?.component ?? {}, null, 2);
    partsPatchDraft = JSON.stringify(selectedState?.patches?.parts ?? {}, null, 2);
    parseError = '';
  });

  function setStateProp(prop, value) {
    if (!core?.id || !selectedStateName) return;
    updateControlProperty(core.id, `States.${selectedStateName}.${prop}`, value);
  }

  function setStateWhenFlag(flag, nextValue) {
    if (!core?.id || !selectedStateName) return;
    updateControlProperty(core.id, `States.${selectedStateName}.when.${flag}`, nextValue);
  }

  function addState() {
    const name = String(newStateName ?? '').trim();
    if (!core?.id || !name || states?._children?.[name]) return;
    updateControlProperty(core.id, `States.${name}`, {
      _type: 'State',
      name,
      group: 'interaction',
      description: '',
      enabled: true,
      when: {},
      patches: {
        component: {},
        parts: {},
      },
    });
    newStateName = '';
    selectedStateName = name;
    setStateEditScopeState(name);
  }

  function duplicateState() {
    if (!core?.id || !selectedStateName || !selectedState) return;
    let suffix = 2;
    let nextName = `${selectedStateName}_${suffix}`;
    while (states?._children?.[nextName]) {
      suffix += 1;
      nextName = `${selectedStateName}_${suffix}`;
    }

    updateControlProperty(core.id, `States.${nextName}`, {
      ...JSON.parse(JSON.stringify(selectedState)),
      name: nextName,
    });
    selectedStateName = nextName;
    setStateEditScopeState(nextName);
  }

  function removeState() {
    if (!core?.id || !selectedStateName) return;
    if (activeStateTarget === selectedStateName) {
      setStateEditScopeBase();
    }
    removeControlNode(core.id, `States.${selectedStateName}`);
    selectedStateName = '';
  }

  function clearOverrides(kind) {
    if (!core?.id || !selectedStateName) return;
    updateControlProperty(core.id, `States.${selectedStateName}.patches.${kind}`, {});
  }

  function commitPatchDraft(kind) {
    if (!core?.id || !selectedStateName) return;
    const draft = kind === 'component' ? componentPatchDraft : partsPatchDraft;
    try {
      const parsed = JSON.parse(draft || '{}');
      updateControlProperty(core.id, `States.${selectedStateName}.patches.${kind}`, parsed);
      parseError = '';
    } catch (error) {
      parseError = error?.message ?? 'Invalid JSON';
    }
  }

  function toggleVisualTarget() {
    if (!selectedStateName) return;
    if (activeStateTarget === selectedStateName) {
      setStateEditScopeBase();
      return;
    }
    setStateEditScopeState(selectedStateName);
  }

  function dumpStateDebug() {
    if (!selectedStateName || !selectedState) return;
    setDebugDock({
      title: 'State Debug',
      source: `${core?.id ?? ''}:${selectedStateName}`,
      text: JSON.stringify(selectedState, null, 2),
    });
  }

  function selectState(stateName) {
    if (!stateName) return;
    if (stateName === BASE_STATE_TARGET) {
      selectedStateName = BASE_STATE_TARGET;
      setStateEditScopeBase();
      return;
    }
    selectedStateName = stateName;
    setStateEditScopeState(stateName);
  }
</script>

{#if multiEdit}
  <div class="placeholder">State editing is single-selection only.</div>
{:else if states}
  <PropertySection title="State Studio">
    <PropertyCell label="States" span={4} hint="Choose Base or a state you want to inspect and manage here.">
      <div class="state-strip">
        {#each stateTargetOptions as option}
          <button
            class="state-chip"
            class:selected={selectedStateName === option.id}
            class:active-target={activeStateTarget === option.id}
            onclick={() => selectState(option.id)}
            title={option.tooltip}
          >
            <span>{option.fullLabel}</span>
            {#if option.hasOverrides}
              <span class="chip-dot"></span>
            {/if}
          </button>
        {/each}
      </div>
    </PropertyCell>
    <PropertyCell label="New" span={3} hint="Create a new visual state for this control.">
      <input class="val" type="text" bind:value={newStateName} placeholder="State name" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create the state and make it the current visual target.">
      <button class="action-btn" onclick={addState}>Add</button>
    </PropertyCell>
  </PropertySection>

  {#if selectedStateName === BASE_STATE_TARGET}
    <PropertySection title="Base Target">
      <PropertyCell label="Mode" span={4} hint="Base is the unmodified control. Select a state chip to inspect that state directly.">
        <div class="target-banner">
          <div class="target-copy">
            <strong>Base</strong>
            <span>Visual tabs are currently editing the base control.</span>
          </div>
        </div>
      </PropertyCell>
    </PropertySection>
  {:else if selectedState}
    <PropertySection title="Selected State">
      <PropertyCell label="Target" span={4} hint="Choose whether visual tabs should currently edit Base or this state.">
        <div class="target-banner">
          <div class="target-copy">
            <strong>{selectedStateName}</strong>
            <span>Visual target is currently {activeTargetLabel}.</span>
          </div>
          <button class="action-btn compact" onclick={toggleVisualTarget}>
            {activeStateTarget === selectedStateName ? 'Edit Base' : `Edit ${selectedStateName}`}
          </button>
        </div>
      </PropertyCell>
      <PropertyCell label="Enabled" span={1} hint="Enable or disable this state rule.">
        <PropertyToggle value={selectedState.enabled !== false} onchange={() => setStateProp('enabled', !(selectedState.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Group" span={1} hint="Grouping hint used by the runtime and future tooling.">
        <input class="val" type="text" value={selectedState.group ?? 'interaction'} onchange={(e) => setStateProp('group', e.target.value)} />
      </PropertyCell>
      <PropertyCell label="Name" span={2} hint="Display label used in the UI and debug tools.">
        <input class="val" type="text" value={selectedState.name ?? selectedStateName} onchange={(e) => setStateProp('name', e.target.value)} />
      </PropertyCell>
      <PropertyCell label="Desc" span={4} hint="Short note for what this state is meant to capture.">
        <textarea class="val val-textarea" rows="2" value={selectedState.description ?? ''} onchange={(e) => setStateProp('description', e.target.value)}></textarea>
      </PropertyCell>
      <PropertyCell label="Actions" span={4} hint="Duplicate, remove, or debug the selected state.">
        <div class="action-row">
          <button class="action-btn compact" onclick={duplicateState}>Duplicate</button>
          <button class="action-btn compact danger" onclick={removeState}>Remove</button>
          <button class="action-btn compact" onclick={dumpStateDebug}>Debug</button>
        </div>
      </PropertyCell>
    </PropertySection>

    <PropertySection title="When">
      {#each COMMON_FLAGS as flag}
        <PropertyCell label={flag.label} span={1} hint={`Require ${flag.label.toLowerCase()} to activate this state.`}>
          <PropertyToggle
            value={selectedState.when?.[flag.key] === true}
            onchange={() => setStateWhenFlag(flag.key, !(selectedState.when?.[flag.key] === true))}
          />
        </PropertyCell>
      {/each}
    </PropertySection>

    <PropertySection title="Overrides">
      <PropertyCell label="Summary" span={4} hint="Visual tabs write overrides here when this state is targeted.">
        <div class="override-card">
          {#if overrideSummary.length}
            <div class="override-list">
              {#each overrideSummary as entry}
                <span class="override-pill">{entry}</span>
              {/each}
            </div>
            <div class="override-footnote">
              Keep using `Background`, `Border`, `Text`, `Icon`, `Effects`, or `Transform` while `{selectedStateName}` is targeted to refine these overrides.
            </div>
          {:else}
            <div class="override-empty">
              No overrides yet. Select `Edit {selectedStateName}` and adjust a visual tab to start capturing changes.
            </div>
          {/if}
        </div>
      </PropertyCell>
      <PropertyCell label="Reset" span={4} hint="Clear all captured component or part overrides for this state.">
        <div class="action-row">
          <button class="action-btn compact" onclick={() => clearOverrides('component')}>Clear Component Overrides</button>
          <button class="action-btn compact" onclick={() => clearOverrides('parts')}>Clear Part Overrides</button>
        </div>
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Advanced">
      <PropertyCell label="Raw Patches" span={4} hint="Optional JSON editing for advanced state patch work.">
        <div class="advanced-header">
          <span>Use this only when the visual tabs are not enough.</span>
          <button class="action-btn compact" onclick={() => showAdvanced = !showAdvanced}>
            {showAdvanced ? 'Hide JSON' : 'Show JSON'}
          </button>
        </div>
      </PropertyCell>
      {#if showAdvanced}
        <PropertyCell label="Component" span={2} hint="Root-level patch map. Paths follow the normal section path format.">
          <textarea class="val code" rows="12" bind:value={componentPatchDraft} onblur={() => commitPatchDraft('component')}></textarea>
        </PropertyCell>
        <PropertyCell label="Parts" span={2} hint="Per-part patch map keyed by part name.">
          <textarea class="val code" rows="12" bind:value={partsPatchDraft} onblur={() => commitPatchDraft('parts')}></textarea>
        </PropertyCell>
        <PropertyCell label="" span={4} hint="Shows parse errors while editing the raw JSON.">
          <div class="patch-footer">
            <span class="error">{parseError}</span>
          </div>
        </PropertyCell>
      {/if}
    </PropertySection>
  {/if}
{/if}

<style>
  .placeholder {
    padding: 16px;
    color: #666;
    font-size: 11px;
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

  .val.code {
    font-family: Consolas, 'Courier New', monospace;
    line-height: 1.4;
  }

  .val-textarea {
    resize: vertical;
  }

  .val:focus {
    border-color: #5B9BD5;
  }

  .state-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .state-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid #363636;
    background: #1B1B1B;
    color: #D5D5D5;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }

  .state-chip:hover {
    border-color: #5B9BD5;
  }

  .state-chip.selected {
    border-color: #5B9BD5;
    background: #1D2A31;
  }

  .state-chip.active-target {
    box-shadow: inset 0 0 0 1px #7CB2D4;
  }

  .chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #F5B83D;
  }

  .target-banner,
  .advanced-header,
  .action-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .target-banner {
    justify-content: space-between;
    padding: 10px 12px;
    border: 1px solid #2D4553;
    background: linear-gradient(180deg, #1B252C 0%, #171E24 100%);
    border-radius: 6px;
  }

  .target-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: #AFC5D4;
    font-size: 11px;
  }

  .target-copy strong {
    color: #F0F5F8;
    font-size: 12px;
  }

  .override-card {
    width: 100%;
    border: 1px solid #2E3640;
    background: #191C1F;
    border-radius: 6px;
    padding: 10px 12px;
  }

  .override-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .override-pill {
    padding: 4px 8px;
    border-radius: 999px;
    background: #202C35;
    border: 1px solid #314654;
    color: #D1E3EF;
    font-size: 10px;
    font-family: Consolas, 'Courier New', monospace;
  }

  .override-footnote,
  .override-empty {
    margin-top: 10px;
    color: #9BA3AA;
    font-size: 11px;
    line-height: 1.45;
  }

  .advanced-header {
    justify-content: space-between;
    color: #9BA3AA;
    font-size: 11px;
  }

  .patch-footer {
    width: 100%;
    min-height: 18px;
    display: flex;
    align-items: center;
  }

  .action-btn {
    background: #252525;
    border: 1px solid #3B3B3B;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
    font-family: inherit;
  }

  .action-btn:hover:not(:disabled) {
    border-color: #5B9BD5;
  }

  .action-btn.compact {
    width: auto;
  }

  .action-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .action-btn.danger:hover:not(:disabled) {
    border-color: #C95A5A;
  }

  .error {
    color: #D98B8B;
    font-size: 10px;
    min-height: 14px;
  }
</style>
