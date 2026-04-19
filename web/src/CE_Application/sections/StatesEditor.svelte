<script>
  import { getSection, updateControlProperty, removeControlNode } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { setDebugDock } from '../stores/debugDock.js';
  import { setStateEditScopeBase, setStateEditScopeState } from '../stores/stateEditScope.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let states = $derived(getSection(control, 'States'));
  let multiEdit = $derived($selectedComponentIds.size > 1);

  let selectedStateName = $state('');
  let newStateName = $state('');
  let componentPatchDraft = $state('{}');
  let partsPatchDraft = $state('{}');
  let parseError = $state('');

  let stateNames = $derived(Object.keys(states?._children ?? {}));
  let selectedState = $derived(states?._children?.[selectedStateName] ?? null);

  $effect(() => {
    if (!stateNames.length) {
      selectedStateName = '';
      return;
    }
    if (!selectedStateName || !stateNames.includes(selectedStateName)) {
      selectedStateName = stateNames[0];
    }
  });

  $effect(() => {
    if (multiEdit) return;
    if (!selectedStateName) {
      setStateEditScopeBase();
      return;
    }
    setStateEditScopeState(selectedStateName);
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
  }

  function removeState() {
    if (!core?.id || !selectedStateName) return;
    removeControlNode(core.id, `States.${selectedStateName}`);
    selectedStateName = '';
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

  function dumpStateDebug() {
    if (!selectedStateName || !selectedState) return;
    setDebugDock({
      title: 'State Debug',
      source: `${core?.id ?? ''}:${selectedStateName}`,
      text: JSON.stringify(selectedState, null, 2),
    });
  }

  const COMMON_FLAGS = [
    { key: 'hover', label: 'Hover' },
    { key: 'pressed', label: 'Pressed' },
    { key: 'focused', label: 'Focused' },
    { key: 'dragging', label: 'Dragging' },
    { key: 'disabled', label: 'Disabled' },
    { key: 'checked', label: 'Checked' },
    { key: 'mixed', label: 'Mixed' },
  ];
</script>

{#if multiEdit}
  <div class="placeholder">State tree editing is single-selection only right now.</div>
{:else if states}
  <PropertySection title="State List">
    <PropertyCell label="Add" span={3} hint="Create a new named state patch.">
      <input class="val" type="text" bind:value={newStateName} placeholder="State name" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create the state and seed an empty patch set.">
      <button class="action-btn" onclick={addState}>Add</button>
    </PropertyCell>
    <PropertyCell label="States" span={3} hint="Select the state to edit.">
      <select class="val" bind:value={selectedStateName}>
        {#each stateNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected state.">
      <button class="action-btn danger" onclick={removeState} disabled={!selectedStateName}>Remove</button>
    </PropertyCell>
  </PropertySection>

  {#if selectedState}
    <PropertySection title="How To Style">
      <PropertyCell label="Visual Editing" span={4} hint="State visuals can be edited from the normal visual tabs.">
        <div class="hint-callout">
          Use the `Editing Look` bar in `Background`, `Border`, `Text`, `Icon`, `Effects`, or visual `Transform` to style `{selectedStateName}` without typing patch paths here.
        </div>
      </PropertyCell>
    </PropertySection>

    <PropertySection title="State Meta">
      <PropertyCell label="Enabled" span={1} hint="Enable or disable this state rule.">
        <PropertyToggle value={selectedState.enabled !== false} onchange={() => setStateProp('enabled', !(selectedState.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Group" span={1} hint="Grouping hint used by the runtime and future tools.">
        <input class="val" type="text" value={selectedState.group ?? 'interaction'} onchange={(e) => setStateProp('group', e.target.value)} />
      </PropertyCell>
      <PropertyCell label="Name" span={2} hint="Display/debug label for the state.">
        <input class="val" type="text" value={selectedState.name ?? selectedStateName} onchange={(e) => setStateProp('name', e.target.value)} />
      </PropertyCell>
      <PropertyCell label="Desc" span={4} hint="Free-form description for future tools and debugging.">
        <textarea
          class="val val-textarea"
          rows="2"
          value={selectedState.description ?? ''}
          onchange={(e) => setStateProp('description', e.target.value)}
        ></textarea>
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Conditions">
      {#each COMMON_FLAGS as flag}
        <PropertyCell label={flag.label} span={1} hint={`Require ${flag.label.toLowerCase()} to be active for this state.`}>
          <PropertyToggle
            value={selectedState.when?.[flag.key] === true}
            onchange={() => setStateWhenFlag(flag.key, !(selectedState.when?.[flag.key] === true))}
          />
        </PropertyCell>
      {/each}
    </PropertySection>

    <PropertySection title="Patches">
      <PropertyCell label="Component" span={2} hint="Root-level patch map. Paths follow the section path format.">
        <textarea
          class="val code"
          rows="12"
          bind:value={componentPatchDraft}
          onblur={() => commitPatchDraft('component')}
        ></textarea>
      </PropertyCell>
      <PropertyCell label="Parts" span={2} hint="Per-part patch map keyed by part name.">
        <textarea
          class="val code"
          rows="12"
          bind:value={partsPatchDraft}
          onblur={() => commitPatchDraft('parts')}
        ></textarea>
      </PropertyCell>
      <PropertyCell label="" span={4} hint="Send the selected state payload to the Debug panel.">
        <div class="patch-footer">
          <span class="error">{parseError}</span>
          <button class="action-btn" onclick={dumpStateDebug}>Debug State</button>
        </div>
      </PropertyCell>
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

  .action-btn {
    width: 100%;
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
    color: #FFF;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .action-btn.danger:hover:not(:disabled) {
    border-color: #D56B6B;
  }

  .patch-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .hint-callout {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #2F4C62;
    border-radius: 4px;
    background: #1F2830;
    color: #BFD3E1;
    font-size: 11px;
    line-height: 1.4;
  }

  .error {
    flex: 1;
    color: #C96A6A;
    font-size: 10px;
    min-height: 12px;
  }
</style>
