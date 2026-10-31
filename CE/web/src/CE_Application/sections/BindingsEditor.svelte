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
  import { bindingSourceGroups, choiceGroups, defaultBindingSource, MAP_MODES, OUTPUT_UNITS } from '../utils/bindingSourceOptions.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let bindings = $derived(getSection(control, 'Bindings'));
  let multiEdit = $derived($selectedComponentIds.size > 1);

  let selectedBindingName = $state('');
  let newBindingName = $state('');
  let enumMapDraft = $state('{}');
  let parseError = $state('');

  let bindingNames = $derived(Object.keys(bindings?._children ?? {}));
  // The binding on screen: the one chosen, else the first. Derived rather than left to the effect
  // below, so the first drawing already shows a binding.
  let shownName = $derived(bindingNames.includes(selectedBindingName) ? selectedBindingName : (bindingNames[0] ?? ''));
  let selectedBinding = $derived(bindings?._children?.[shownName] ?? null);
  // A binding's source, mode or unit that the lists do not hold is offered as it is: a select whose
  // value is not among its options shows blank (utils/bindingSourceOptions.js).
  let sourceGroups = $derived(bindingSourceGroups(control, selectedBinding?.source ?? 'value.normalized'));
  let modeGroups = $derived(choiceGroups(MAP_MODES, selectedBinding?.mapMode ?? 'range'));
  let unitGroups = $derived(choiceGroups(OUTPUT_UNITS, selectedBinding?.outputUnit ?? 'percent'));

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
    if (!core?.id || !shownName) return;
    updateControlProperty(core.id, `Bindings.${shownName}.${prop}`, value);
  }

  function addBinding() {
    const name = String(newBindingName ?? '').trim();
    if (!core?.id || !name || bindings?._children?.[name]) return;
    updateControlProperty(core.id, `Bindings.${name}`, {
      _type: 'Binding',
      name,
      enabled: true,
      source: defaultBindingSource(control),
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
    if (!core?.id || !shownName) return;
    removeControlNode(core.id, `Bindings.${shownName}`);
    selectedBindingName = '';
  }

  function commitEnumMap() {
    if (!core?.id || !shownName) return;
    try {
      const parsed = JSON.parse(enumMapDraft || '{}');
      updateControlProperty(core.id, `Bindings.${shownName}.enumMap`, parsed);
      parseError = '';
    } catch (error) {
      parseError = error?.message ?? 'Invalid JSON';
    }
  }

  function dumpBindingDebug() {
    if (!shownName || !selectedBinding) return;
    setDebugDock({
      title: 'Binding Debug',
      source: `${core?.id ?? ''}:${shownName}`,
      text: JSON.stringify(selectedBinding, null, 2),
    });
  }

</script>

{#snippet choices(groups)}
  {#each groups as group (group.label)}
    {#if group.label}
      <optgroup label={group.label}>
        {#each group.options as entry (entry.value)}<option value={entry.value} title={entry.value}>{entry.label}</option>{/each}
      </optgroup>
    {:else}
      {#each group.options as entry (entry.value)}<option value={entry.value}>{entry.label}</option>{/each}
    {/if}
  {/each}
{/snippet}

{#if multiEdit}
  <div class="placeholder">Binding tree editing is single-selection only right now.</div>
{:else if bindings}
  <PropertySection title="Binding List" icon={Cable}>
    <PropertyCell label="Add" span={3} hint="Create a new named binding.">
      <input class="val" type="text" bind:value={newBindingName} placeholder="Binding name" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create the binding with a neutral default shape." compact>
      <button class="action-btn" onclick={addBinding}>Add</button>
    </PropertyCell>
    <PropertyCell label="Bindings" span={3} hint="Select the binding to edit.">
      <select class="val" value={shownName} onchange={(e) => { selectedBindingName = e.target.value; }}>
        {#each bindingNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected binding." compact>
      <button class="action-btn danger" onclick={removeBinding} disabled={!shownName}>Remove</button>
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
        <select class="val" value={selectedBinding.source ?? 'value.normalized'} title={selectedBinding.source ?? 'value.normalized'} onchange={(e) => setBindingProp('source', e.target.value)}>
          {@render choices(sourceGroups)}
        </select>
      </PropertyCell>
      <PropertyCell label="Mode" span={1} hint="Mapping strategy used to convert input to output.">
        <select class="val" value={selectedBinding.mapMode ?? 'range'} onchange={(e) => setBindingProp('mapMode', e.target.value)}>
          {@render choices(modeGroups)}
        </select>
      </PropertyCell>
      <PropertyCell label="Unit" span={1} hint="Display/runtime unit expected by the target property.">
        <select class="val" value={selectedBinding.outputUnit ?? 'percent'} onchange={(e) => setBindingProp('outputUnit', e.target.value)}>
          {@render choices(unitGroups)}
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
        <PropertyCell label="" span={1} hint="Send the selected binding payload to the Debug panel." compact>
          <button class="action-btn" onclick={dumpBindingDebug}>Debug</button>
        </PropertyCell>
      </PropertySection>
    {:else if selectedBinding.mapMode === 'boolean'}
      <PropertySection title="Boolean Map" icon={ArrowRightLeft}>
        <PropertyCell label="False" span={1} compact hint="Output used when the source resolves to false.">
          <NumberCell label="False" value={selectedBinding.falseValue ?? 0} step={0.01} defaultValue={0} onchange={(value) => setBindingProp('falseValue', value)} />
        </PropertyCell>
        <PropertyCell label="True" span={1} compact hint="Output used when the source resolves to true.">
          <NumberCell label="True" value={selectedBinding.trueValue ?? 100} step={0.01} defaultValue={100} onchange={(value) => setBindingProp('trueValue', value)} />
        </PropertyCell>
      </PropertySection>
    {:else if selectedBinding.mapMode === 'enum'}
      <PropertySection title="Enum Map" icon={ArrowRightLeft}>
        <PropertyCell label="Map" span={4} hint="JSON object mapping enum names to output values.">
          <textarea class="val code" rows="10" bind:value={enumMapDraft} onblur={commitEnumMap}></textarea>
        </PropertyCell>
        <PropertyCell label="" span={4} hint="Parse status for the enum map JSON." compact>
          <div class="patch-footer">
            <span class="error">{parseError}</span>
            <button class="action-btn" onclick={dumpBindingDebug}>Debug</button>
          </div>
        </PropertyCell>
      </PropertySection>
    {:else if selectedBinding.mapMode === 'format'}
      <!-- The source as text: (value x multiplier + offset) to a number of decimals, between a
           prefix and a suffix. These were the factory value labels' settings, and a format binding
           used to fall through to "Direct Map" with none of them on screen. -->
      <PropertySection title="Text" icon={ArrowRightLeft}>
        <PropertyCell label="Prefix" span={2} hint="Written before the number.">
          <input class="val" type="text" value={selectedBinding.prefix ?? ''} onchange={(e) => setBindingProp('prefix', e.target.value)} />
        </PropertyCell>
        <PropertyCell label="Suffix" span={2} hint="Written after the number.">
          <input class="val" type="text" value={selectedBinding.suffix ?? ''} onchange={(e) => setBindingProp('suffix', e.target.value)} />
        </PropertyCell>
        <PropertyCell label="Times" span={1} compact hint="The source is multiplied by this before it is written.">
          <NumberCell label="Times" value={selectedBinding.multiplier ?? 1} step={0.01} defaultValue={1} onchange={(value) => setBindingProp('multiplier', value)} />
        </PropertyCell>
        <PropertyCell label="Plus" span={1} compact hint="Added after the multiplication.">
          <NumberCell label="Plus" value={selectedBinding.offset ?? 0} step={0.01} defaultValue={0} onchange={(value) => setBindingProp('offset', value)} />
        </PropertyCell>
        <PropertyCell label="Decimals" span={1} compact hint="Digits after the decimal point, 0 to 8.">
          <NumberCell label="Decimals" value={selectedBinding.precision ?? 0} min={0} max={8} step={1} defaultValue={0} onchange={(value) => setBindingProp('precision', value)} />
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

  .val.code {
    font-family: Consolas, 'Courier New', monospace;
    line-height: 1.4;
  }

  .val:focus {
    border-color: var(--pp-field-focus, #5B9BD5);
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
