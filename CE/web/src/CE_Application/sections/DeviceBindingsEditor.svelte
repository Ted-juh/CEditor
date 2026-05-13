<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { getBindableComponentPorts } from '../models/componentPorts.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let deviceBindings = $derived(getSection(control, 'DeviceBindings'));
  let multiEdit = $derived($selectedComponentIds.size > 1);
  let ports = $derived(getBindableComponentPorts(control));
  let bindings = $derived(Array.isArray(deviceBindings?.bindings) ? deviceBindings.bindings : []);

  let selectedIndex = $state(0);

  let selectedBinding = $derived(bindings[selectedIndex] ?? null);

  $effect(() => {
    if (selectedIndex >= bindings.length) selectedIndex = Math.max(0, bindings.length - 1);
  });

  function writeBindings(nextBindings) {
    if (!core?.id) return;
    if (deviceBindings) {
      updateControlProperty(core.id, 'DeviceBindings.bindings', nextBindings);
    } else {
      updateControlProperty(core.id, 'DeviceBindings', {
        _type: 'DeviceBindings',
        enabled: true,
        debug: false,
        bindings: nextBindings,
      });
    }
  }

  function setEnabled(value) {
    if (!core?.id) return;
    if (deviceBindings) {
      updateControlProperty(core.id, 'DeviceBindings.enabled', value);
    } else {
      updateControlProperty(core.id, 'DeviceBindings', {
        _type: 'DeviceBindings',
        enabled: value,
        debug: false,
        bindings: [],
      });
    }
  }

  function addBinding() {
    const port = ports[0]?.id ?? 'value';
    const next = [
      ...bindings,
      {
        kind: 'deviceParameter',
        port,
        deviceRole: 'mainSynth',
        parameterId: '',
        parameterType: '',
        adoptMetadata: true,
        dryRun: true,
        feedback: {
          receiveUpdates: true,
          ignoreOwnEchoes: true,
          echoWindowMs: 250,
        },
      },
    ];
    writeBindings(next);
    selectedIndex = next.length - 1;
  }

  function removeBinding() {
    if (!selectedBinding) return;
    writeBindings(bindings.filter((_, index) => index !== selectedIndex));
  }

  function setBindingProp(prop, value) {
    if (!selectedBinding) return;
    const next = bindings.map((binding, index) =>
      index === selectedIndex ? { ...binding, [prop]: value } : binding
    );
    writeBindings(next);
  }

  function setFeedbackProp(prop, value) {
    if (!selectedBinding) return;
    const next = bindings.map((binding, index) =>
      index === selectedIndex
        ? { ...binding, feedback: { ...(binding.feedback ?? {}), [prop]: value } }
        : binding
    );
    writeBindings(next);
  }
</script>

{#if multiEdit}
  <div class="placeholder">Device binding editing is single-selection only right now.</div>
{:else}
  <PropertySection title="Device Bindings">
    <PropertyCell label="Enabled" span={1} hint="Enable semantic device parameter bindings for this component.">
      <PropertyToggle value={deviceBindings?.enabled !== false} onchange={() => setEnabled(!(deviceBindings?.enabled !== false))} />
    </PropertyCell>
    <PropertyCell label="Add" span={1} hint="Add a semantic parameter binding.">
      <button class="action-btn" onclick={addBinding}>Add</button>
    </PropertyCell>
    <PropertyCell label="Remove" span={1} hint="Remove the selected semantic parameter binding.">
      <button class="action-btn danger" onclick={removeBinding} disabled={!selectedBinding}>Remove</button>
    </PropertyCell>
    <PropertyCell label="Ports" span={1} hint="Value ports exposed by this component type.">
      <div class="port-list">{ports.map((port) => port.id).join(', ') || 'None'}</div>
    </PropertyCell>
  </PropertySection>

  {#if bindings.length > 0}
    <PropertySection title="Selected Binding">
      <PropertyCell label="Binding" span={2} hint="Select which semantic binding to edit.">
        <select class="val" value={selectedIndex} onchange={(e) => selectedIndex = Number(e.target.value)}>
          {#each bindings as binding, index}
            <option value={index}>{binding.port || 'port'} -> {binding.parameterId || 'unassigned'}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Port" span={2} hint="Component value port that drives this binding.">
        <select class="val" value={selectedBinding?.port ?? ''} onchange={(e) => setBindingProp('port', e.target.value)}>
          {#each ports as port}
            <option value={port.id}>{port.label ?? port.id}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Role" span={2} hint="Logical device role used by the panel.">
        <input class="val" value={selectedBinding?.deviceRole ?? 'mainSynth'} onchange={(e) => setBindingProp('deviceRole', e.target.value)} />
      </PropertyCell>
      <PropertyCell label="Parameter" span={2} hint="Semantic parameter id from the device profile.">
        <input class="val" value={selectedBinding?.parameterId ?? ''} placeholder="filter.cutoff" onchange={(e) => setBindingProp('parameterId', e.target.value)} />
      </PropertyCell>
      <PropertyCell label="Type" span={2} hint="Semantic parameter type. Dragging from the parameter browser fills this automatically.">
        <select class="val" value={selectedBinding?.parameterType ?? ''} onchange={(e) => setBindingProp('parameterType', e.target.value)}>
          <option value="">Auto / unspecified</option>
          <option value="integer">Integer</option>
          <option value="float">Float</option>
          <option value="choice">Choice</option>
          <option value="boolean">Boolean</option>
          <option value="momentary">Momentary</option>
          <option value="action">Action</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Adopt" span={1} hint="Allow this component to adopt compatible metadata from the parameter.">
        <PropertyToggle value={selectedBinding?.adoptMetadata !== false} onchange={() => setBindingProp('adoptMetadata', !(selectedBinding?.adoptMetadata !== false))} />
      </PropertyCell>
      <PropertyCell label="Dry Run" span={1} hint="Compile and monitor the transaction without sending to hardware.">
        <PropertyToggle value={selectedBinding?.dryRun !== false} onchange={() => setBindingProp('dryRun', !(selectedBinding?.dryRun !== false))} />
      </PropertyCell>
      <PropertyCell label="Feedback" span={1} hint="Receive backend parameter updates for this binding.">
        <PropertyToggle value={selectedBinding?.feedback?.receiveUpdates !== false} onchange={() => setFeedbackProp('receiveUpdates', !(selectedBinding?.feedback?.receiveUpdates !== false))} />
      </PropertyCell>
      <PropertyCell label="Echo" span={1} hint="Ignore obvious echoes of messages sent by CEditor.">
        <PropertyToggle value={selectedBinding?.feedback?.ignoreOwnEchoes !== false} onchange={() => setFeedbackProp('ignoreOwnEchoes', !(selectedBinding?.feedback?.ignoreOwnEchoes !== false))} />
      </PropertyCell>
    </PropertySection>
  {:else}
    <div class="placeholder">No semantic device bindings yet.</div>
  {/if}
{/if}

<style>
  .placeholder {
    padding: 16px;
    color: #777;
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

  .port-list {
    color: #AAA;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
