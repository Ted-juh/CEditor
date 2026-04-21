<script>
  import {
    applyControlPatch,
    applySelectedPatch,
    getSection,
    updateControlProperty,
    updateSelectedProperty,
  } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';
  import { normalizeEnumValues, resolveEnumDefaultValue } from '../utils/enumBehavior.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let behavior = $derived(getSection(control, 'Behavior'));

  const FAMILY_OPTIONS = ['trigger', 'select', 'range'];
  const ROLE_OPTIONS = {
    trigger: ['button', 'custom'],
    select: ['toggle', 'checkbox', 'radio', 'segmented', 'custom'],
    range: ['spinbox', 'stepper', 'scrubber', 'slider', 'knob', 'custom'],
  };
  const VALUE_TYPE_OPTIONS = ['none', 'bool', 'int', 'float', 'enum'];
  const SELECTION_OPTIONS = ['none', 'single', 'multi', 'cycle'];
  const PRESS_MODE_OPTIONS = ['press', 'release', 'pressRelease'];
  const TOGGLE_ON_OPTIONS = ['press', 'release'];
  const ORIENTATION_OPTIONS = ['horizontal', 'vertical'];

  function set(prop, value) {
    if (!core?.id) return;
    const path = `Behavior.${prop}`;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(core.id, path, value);
    }
  }

  function applyBehaviorPatch(patch = {}) {
    if (!core?.id) return;
    const entries = Object.entries(patch);
    if (!entries.length) return;

    const behaviorPatch = Object.fromEntries(
      entries.map(([key, value]) => [`Behavior.${key}`, value])
    );

    if ($selectedComponentIds.size > 1) {
      applySelectedPatch(behaviorPatch);
    } else {
      applyControlPatch(core.id, behaviorPatch);
    }
  }

  function handleInput(prop, event) {
    set(prop, event?.target?.value ?? '');
  }

  function handleToggle(prop) {
    set(prop, !(behavior?.[prop] === true));
  }

  function nextEnumLabel() {
    const used = new Set(enumValues);
    let index = enumValues.length + 1;
    let candidate = `Option ${index}`;
    while (used.has(candidate)) {
      index += 1;
      candidate = `Option ${index}`;
    }
    return candidate;
  }

  function updateEnumValues(nextValues = []) {
    const normalizedValues = normalizeEnumValues(nextValues);
    const patch = {
      enumValues: normalizedValues,
    };

    if (valueType === 'enum') {
      patch.defaultValue = resolveEnumDefaultValue(normalizedValues, behavior?.defaultValue ?? '');
    }

    applyBehaviorPatch(patch);
  }

  function updateEnumValueAt(index, value) {
    const nextValues = [...enumValues];
    nextValues[index] = value;
    updateEnumValues(nextValues);
  }

  function addEnumValue() {
    updateEnumValues([...enumValues, nextEnumLabel()]);
  }

  function removeEnumValueAt(index) {
    const nextValues = [...enumValues];
    nextValues.splice(index, 1);
    updateEnumValues(nextValues);
  }

  let family = $derived(String(behavior?.family ?? 'trigger'));
  let role = $derived(String(behavior?.role ?? 'button'));
  let roleOptions = $derived(ROLE_OPTIONS[family] ?? ['custom']);
  let isSelectFamily = $derived(family === 'select');
  let isRangeFamily = $derived(family === 'range');
  let valueType = $derived(String(behavior?.valueType ?? 'none'));
  let isEnumValue = $derived(valueType === 'enum');
  let isBoolValue = $derived(valueType === 'bool');
  let isExclusiveSelectRole = $derived(role === 'radio' || role === 'segmented');
  let enumValues = $derived(normalizeEnumValues(behavior?.enumValues ?? []));
  let enumDefaultValue = $derived(resolveEnumDefaultValue(enumValues, behavior?.defaultValue ?? ''));
</script>

{#if behavior}
  <PropertySection title="Type">
    <PropertyCell label="Family" span={2} hint="Interaction family that drives which behaviors and states apply.">
      <select class="val" value={behavior.family ?? 'trigger'} onchange={(e) => handleInput('family', e)}>
        {#each FAMILY_OPTIONS as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Role" span={2} hint="Concrete role used by previews, defaults, and runtime intent.">
      <select class="val" value={behavior.role ?? 'button'} onchange={(e) => handleInput('role', e)}>
        {#each roleOptions as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Value" span={2} hint="Value model emitted by this control.">
      <select class="val" value={behavior.valueType ?? 'none'} onchange={(e) => handleInput('valueType', e)}>
        {#each VALUE_TYPE_OPTIONS as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Default" span={2} hint="Default runtime value used by previews and new instances.">
      {#if isBoolValue}
        <PropertyToggle value={behavior.defaultValue === true} onchange={() => set('defaultValue', !(behavior.defaultValue === true))} />
      {:else if isEnumValue}
        {#if enumValues.length}
          <select class="val" value={enumDefaultValue} onchange={(e) => handleInput('defaultValue', e)}>
            {#each enumValues as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        {:else}
          <input class="val" type="text" value="" placeholder="Add enum values below" disabled />
        {/if}
      {:else if valueType === 'int' || valueType === 'float'}
        <NumberInput
          value={behavior.defaultValue ?? 0}
          step={valueType === 'int' ? 1 : 0.01}
          onchange={(value) => set('defaultValue', value)}
        />
      {:else}
        <input class="val" type="text" value={behavior.defaultValue ?? ''} onchange={(e) => handleInput('defaultValue', e)} />
      {/if}
    </PropertyCell>
  </PropertySection>

  {#if isSelectFamily}
    <PropertySection title="Selection">
      <PropertyCell label="Mode" span={2} hint="How the control participates in selection state.">
        <select class="val" value={behavior.selectionMode ?? 'single'} onchange={(e) => handleInput('selectionMode', e)}>
          {#each SELECTION_OPTIONS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      {#if isExclusiveSelectRole && isBoolValue}
        <PropertyCell label="Group" span={2} hint="Group id for exclusive items such as radio buttons or segmented controls.">
          <input class="val" type="text" value={behavior.groupId ?? ''} onchange={(e) => handleInput('groupId', e)} />
        </PropertyCell>
      {/if}
      {#if isBoolValue}
        <PropertyCell label="Mixed" span={2} hint="Allow an intermediate mixed state when the role supports it.">
          <PropertyToggle value={behavior.allowMixed === true} onchange={() => handleToggle('allowMixed')} />
        </PropertyCell>
        <PropertyCell label="Uncheck" span={2} hint="Allow clicking an active item to turn it off.">
          <PropertyToggle value={behavior.uncheckOnClick === true} onchange={() => handleToggle('uncheckOnClick')} />
        </PropertyCell>
        <PropertyCell label="Toggle On" span={2} hint="Choose whether the value flips on mouse press or release.">
          <select class="val" value={behavior.toggleOn ?? 'release'} onchange={(e) => handleInput('toggleOn', e)}>
            {#each TOGGLE_ON_OPTIONS as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </PropertyCell>
      {/if}
      {#if isEnumValue}
        <PropertyCell label="Wrap Enum" span={2} hint="When using enum values, wrap from the last item back to the first.">
          <PropertyToggle value={behavior.wrapEnum === true} onchange={() => handleToggle('wrapEnum')} />
        </PropertyCell>
      {/if}
    </PropertySection>
  {/if}

  {#if isEnumValue}
    <PropertySection title="Enum">
      <PropertyCell label="Values" span={2} hint="Ordered values used by enum bindings, preview overrides, and click cycling.">
        <div class="enum-editor">
          {#if enumValues.length}
            {#each enumValues as enumValue, index (`${index}:${enumValue}`)}
              <div class="enum-row">
                <input
                  class="val enum-input"
                  type="text"
                  value={enumValue}
                  onchange={(e) => updateEnumValueAt(index, e?.target?.value ?? '')}
                />
                <button type="button" class="enum-btn danger" onclick={() => removeEnumValueAt(index)}>
                  Remove
                </button>
              </div>
            {/each}
          {:else}
            <div class="enum-empty">No enum values yet. Add values to define the cycle order.</div>
          {/if}
          <button type="button" class="enum-btn" onclick={addEnumValue}>
            Add Value
          </button>
        </div>
      </PropertyCell>
    </PropertySection>
  {/if}

  {#if isRangeFamily}
    <PropertySection title="Range">
      <PropertyCell label="Orient" span={2} hint="Axis used for value changes and preview controls.">
        <select class="val" value={behavior.orientation ?? 'horizontal'} onchange={(e) => handleInput('orientation', e)}>
          {#each ORIENTATION_OPTIONS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Direction" span={2} hint="Logical direction for travel and value growth.">
        <input class="val" type="text" value={behavior.direction ?? 'ltr'} onchange={(e) => handleInput('direction', e)} />
      </PropertyCell>
      <PropertyCell label="Min" span={2} hint="Minimum raw value.">
        <NumberInput value={behavior.min ?? 0} step={1} onchange={(value) => set('min', value)} />
      </PropertyCell>
      <PropertyCell label="Max" span={2} hint="Maximum raw value.">
        <NumberInput value={behavior.max ?? 1} step={1} onchange={(value) => set('max', value)} />
      </PropertyCell>
      <PropertyCell label="Step" span={2} hint="Step size used by keyboard, wheel, and snapping.">
        <NumberInput value={behavior.step ?? 1} step={0.01} onchange={(value) => set('step', value)} />
      </PropertyCell>
      <PropertyCell label="Snap" span={2} hint="Snap value changes to the configured step.">
        <PropertyToggle value={behavior.snapToStep !== false} onchange={() => set('snapToStep', !(behavior.snapToStep !== false))} />
      </PropertyCell>
      <PropertyCell label="Drag" span={2} hint="Allow drag-based value changes.">
        <PropertyToggle value={behavior.dragEnabled === true} onchange={() => handleToggle('dragEnabled')} />
      </PropertyCell>
      <PropertyCell label="Wheel" span={2} hint="Allow mouse wheel value changes.">
        <PropertyToggle value={behavior.wheelEnabled === true} onchange={() => handleToggle('wheelEnabled')} />
      </PropertyCell>
    </PropertySection>
  {/if}

  <PropertySection title="Input">
    <PropertyCell label="Press Mode" span={2} hint="How press/release is interpreted for action and state timing.">
      <select class="val" value={behavior.pressMode ?? 'pressRelease'} onchange={(e) => handleInput('pressMode', e)}>
        {#each PRESS_MODE_OPTIONS as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Focusable" span={2} hint="Whether the control can receive keyboard focus in runtime previews.">
      <PropertyToggle value={behavior.focusable !== false} onchange={() => set('focusable', !(behavior.focusable !== false))} />
    </PropertyCell>
    <PropertyCell label="Keyboard" span={2} hint="Enable keyboard activation and value adjustment.">
      <PropertyToggle value={behavior.keyboardEnabled !== false} onchange={() => set('keyboardEnabled', !(behavior.keyboardEnabled !== false))} />
    </PropertyCell>
    <PropertyCell label="Emit Click" span={2} hint="Expose click events to future script/runtime systems.">
      <PropertyToggle value={behavior.emitClick !== false} onchange={() => set('emitClick', !(behavior.emitClick !== false))} />
    </PropertyCell>
    <PropertyCell label="Emit Value" span={2} hint="Expose value changes to future script/runtime systems.">
      <PropertyToggle value={behavior.emitValueChange === true} onchange={() => handleToggle('emitValueChange')} />
    </PropertyCell>
    <PropertyCell label="Emit State" span={2} hint="Expose state entry/exit to future script/runtime systems.">
      <PropertyToggle value={behavior.emitStateChange !== false} onchange={() => set('emitStateChange', !(behavior.emitStateChange !== false))} />
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

  .enum-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .enum-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .enum-input {
    flex: 1;
  }

  .enum-btn {
    background: #252525;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    color: #DDD;
    cursor: pointer;
    font-size: 11px;
    min-width: 74px;
    padding: 5px 8px;
  }

  .enum-btn:hover {
    border-color: #5B9BD5;
  }

  .enum-btn.danger:hover {
    border-color: #C96A6A;
  }

  .enum-empty {
    border: 1px dashed #3A3A3A;
    border-radius: 4px;
    color: #8A8A8A;
    font-size: 11px;
    padding: 8px;
  }
</style>
