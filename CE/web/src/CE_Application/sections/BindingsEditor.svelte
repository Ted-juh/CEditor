<script>
  import { getSection, updateControlProperty, removeControlNode } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { setDebugDock } from '../stores/debugDock.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import Cable from 'lucide-svelte/icons/cable';
  import Pencil from 'lucide-svelte/icons/pencil';
  import ArrowRightLeft from 'lucide-svelte/icons/arrow-right-left';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let bindings = $derived(getSection(control, 'Bindings'));
  let multiEdit = $derived($selectedComponentIds.size > 1);

  let selectedBindingName = $state('');
  let newBindingName = $state('');
  let enumMapDraft = $state('{}');
  let parseError = $state('');

  let bindingNames = $derived(Object.keys(bindings?._children ?? {}));
  let selectedBinding = $derived(bindings?._children?.[selectedBindingName] ?? null);

  $effect(() => {
    if (!bindingNames.length) {
      selectedBindingName = '';
      return;
    }
    if (!selectedBindingName || !bindingNames.includes(selectedBindingName)) {
      selectedBindingName = bindingNames[0];
    }
  });

  $effect(() => {
    enumMapDraft = JSON.stringify(selectedBinding?.enumMap ?? {}, null, 2);
    parseError = '';
  });

  function setBindingProp(prop, value) {
    if (!core?.id || !selectedBindingName) return;
    updateControlProperty(core.id, `Bindings.${selectedBindingName}.${prop}`, value);
  }

  function addBinding() {
    const name = String(newBindingName ?? '').trim();
    if (!core?.id || !name || bindings?._children?.[name]) return;
    updateControlProperty(core.id, `Bindings.${name}`, {
      _type: 'Binding',
      name,
      enabled: true,
      source: 'value.normalized',
      mapMode: 'range',
      target: '',
      outputUnit: 'percent',
      inputMin: 0,
      inputMax: 1,
      outputMin: 0,
      outputMax: 100,
      falseValue: 0,
      trueValue: 100,
      enumMap: {},
      clamp: true,
      round: false,
      invert: false,
    });
    newBindingName = '';
    selectedBindingName = name;
  }

  function removeBinding() {
    if (!core?.id || !selectedBindingName) return;
    removeControlNode(core.id, `Bindings.${selectedBindingName}`);
    selectedBindingName = '';
  }

  function commitEnumMap() {
    if (!core?.id || !selectedBindingName) return;
    try {
      const parsed = JSON.parse(enumMapDraft || '{}');
      updateControlProperty(core.id, `Bindings.${selectedBindingName}.enumMap`, parsed);
      parseError = '';
    } catch (error) {
      parseError = error?.message ?? 'Invalid JSON';
    }
  }

  function dumpBindingDebug() {
    if (!selectedBindingName || !selectedBinding) return;
    setDebugDock({
      title: 'Binding Debug',
      source: `${core?.id ?? ''}:${selectedBindingName}`,
      text: JSON.stringify(selectedBinding, null, 2),
    });
  }

  const SOURCE_OPTIONS = [
    'value.raw',
    'value.normalized',
    'value.display',
    'value.bool',
    'value.enum',
    'state.hover',
    'state.pressed',
    'state.focused',
    'state.dragging',
    'state.disabled',
    'state.checked',
  ];
  const MAP_MODE_OPTIONS = ['range', 'boolean', 'enum', 'direct'];
  const UNIT_OPTIONS = ['percent', 'px', 'deg', 'unitless'];
</script>

{#if multiEdit}
  <div class="placeholder">Binding tree editing is single-selection only right now.</div>
{:else if bindings}
  <PropertySection title="Binding List" icon={Cable}>
    <PropertyCell label="Add" span={3} hint="Create a new named binding.">
      <input class="val" type="text" bind:value={newBindingName} placeholder="Binding name" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create the binding with a neutral default shape.">
      <button class="action-btn" onclick={addBinding}>Add</button>
    </PropertyCell>
    <PropertyCell label="Bindings" span={3} hint="Select the binding to edit.">
      <select class="val" bind:value={selectedBindingName}>
        {#each bindingNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected binding.">
      <button class="action-btn danger" onclick={removeBinding} disabled={!selectedBindingName}>Remove</button>
    </PropertyCell>
  </PropertySection>

  {#if selectedBinding}
    <PropertySection title="Binding" icon={Pencil}>
      {#snippet tools()}
        <HeaderPill value={selectedBinding.enabled !== false}
                    title="Enable or disable this binding."
                    onchange={() => setBindingProp('enabled', !(selectedBinding.enabled !== false))} />
      {/snippet}
      {#if selectedBinding.enabled !== false}
      <PropertyCell label="Source" span={2} hint="Runtime signal used as the input for this mapping.">
        <select class="val" value={selectedBinding.source ?? 'value.normalized'} onchange={(e) => setBindingProp('source', e.target.value)}>
          {#each SOURCE_OPTIONS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Mode" span={1} hint="Mapping strategy used to convert input to output.">
        <select class="val" value={selectedBinding.mapMode ?? 'range'} onchange={(e) => setBindingProp('mapMode', e.target.value)}>
          {#each MAP_MODE_OPTIONS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Unit" span={1} hint="Display/runtime unit expected by the target property.">
        <select class="val" value={selectedBinding.outputUnit ?? 'percent'} onchange={(e) => setBindingProp('outputUnit', e.target.value)}>
          {#each UNIT_OPTIONS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Target" span={4} hint="Control or part path that receives the resolved output value.">
        <input class="val" type="text" value={selectedBinding.target ?? ''} onchange={(e) => setBindingProp('target', e.target.value)} />
      </PropertyCell>
      {/if}
    </PropertySection>

    {#if selectedBinding.mapMode === 'range'}
      <PropertySection title="Range Map" icon={ArrowRightLeft}>
        <PropertyCell label="In Min" span={1} compact hint="Minimum input value for normalization.">
          <NumberCell label="InMin" value={selectedBinding.inputMin ?? 0} step={0.01} defaultValue={0} onchange={(value) => setBindingProp('inputMin', value)} />
        </PropertyCell>
        <PropertyCell label="In Max" span={1} compact hint="Maximum input value for normalization.">
          <NumberCell label="InMax" value={selectedBinding.inputMax ?? 1} step={0.01} defaultValue={1} onchange={(value) => setBindingProp('inputMax', value)} />
        </PropertyCell>
        <PropertyCell label="Out Min" span={1} compact hint="Minimum output value written to the target.">
          <NumberCell label="OutMin" value={selectedBinding.outputMin ?? 0} step={0.01} defaultValue={0} onchange={(value) => setBindingProp('outputMin', value)} />
        </PropertyCell>
        <PropertyCell label="Out Max" span={1} compact hint="Maximum output value written to the target.">
          <NumberCell label="OutMax" value={selectedBinding.outputMax ?? 100} step={0.01} defaultValue={100} onchange={(value) => setBindingProp('outputMax', value)} />
        </PropertyCell>
        <PropertyCell label="Clamp" span={1} hint="Clamp the output to the configured range.">
          <PropertyToggle value={selectedBinding.clamp !== false} onchange={() => setBindingProp('clamp', !(selectedBinding.clamp !== false))} />
        </PropertyCell>
        <PropertyCell label="Round" span={1} hint="Round the resolved output value.">
          <PropertyToggle value={selectedBinding.round === true} onchange={() => setBindingProp('round', !(selectedBinding.round === true))} />
        </PropertyCell>
        <PropertyCell label="Invert" span={1} hint="Invert the input range before output mapping.">
          <PropertyToggle value={selectedBinding.invert === true} onchange={() => setBindingProp('invert', !(selectedBinding.invert === true))} />
        </PropertyCell>
        <PropertyCell label="" span={1} hint="Send the selected binding payload to the Debug panel.">
          <button class="action-btn" onclick={dumpBindingDebug}>Debug</button>
        </PropertyCell>
      </PropertySection>
    {:else if selectedBinding.mapMode === 'boolean'}
      <PropertySection title="Boolean Map" icon={ArrowRightLeft}>
        <PropertyCell label="False" span={2} compact hint="Output used when the source resolves to false.">
          <NumberCell label="False" value={selectedBinding.falseValue ?? 0} step={0.01} defaultValue={0} onchange={(value) => setBindingProp('falseValue', value)} />
        </PropertyCell>
        <PropertyCell label="True" span={2} compact hint="Output used when the source resolves to true.">
          <NumberCell label="True" value={selectedBinding.trueValue ?? 100} step={0.01} defaultValue={100} onchange={(value) => setBindingProp('trueValue', value)} />
        </PropertyCell>
      </PropertySection>
    {:else if selectedBinding.mapMode === 'enum'}
      <PropertySection title="Enum Map" icon={ArrowRightLeft}>
        <PropertyCell label="Map" span={4} hint="JSON object mapping enum names to output values.">
          <textarea class="val code" rows="10" bind:value={enumMapDraft} onblur={commitEnumMap}></textarea>
        </PropertyCell>
        <PropertyCell label="" span={4} hint="Parse status for the enum map JSON.">
          <div class="patch-footer">
            <span class="error">{parseError}</span>
            <button class="action-btn" onclick={dumpBindingDebug}>Debug</button>
          </div>
        </PropertyCell>
      </PropertySection>
    {:else}
      <PropertySection title="Direct Map" icon={ArrowRightLeft}>
        <PropertyCell label="Pass-Through" span={4} hint="Write the source value directly to the target property without remapping.">
          <div class="placeholder-inline">Useful for string targets, such as Parts.valueField.Text.content</div>
        </PropertyCell>
      </PropertySection>
    {/if}
  {/if}
{/if}

<style>
  .placeholder {
    padding: 16px;
    color: #666;
    font-size: 11px;
  }

  .placeholder-inline {
    color: #888;
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

  .error {
    flex: 1;
    color: #C96A6A;
    font-size: 10px;
    min-height: 12px;
  }
</style>
