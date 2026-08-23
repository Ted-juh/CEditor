<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { getBindableComponentPorts } from '../models/componentPorts.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';
  import { MIDI_CONTROL_KIND, MIDI_CONTROL_MESSAGES, midiControlBindingFrom, midiControlLabel } from '../utils/midiControlBindings.js';

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
        deviceRole: DEFAULT_DEVICE_ROLE,
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

  let isMidiControl = $derived(selectedBinding?.kind === MIDI_CONTROL_KIND);

  /** What a binding is, in one phrase, for the picker. */
  function bindingSummary(binding) {
    if (binding?.kind === MIDI_CONTROL_KIND) return midiControlLabel(binding) || 'CC ?';
    return binding?.parameterId || 'unassigned';
  }

  // Same reason as setBindingKind: a binding left carrying a controller number after switching to
  // aftertouch reads as though the number still means something.
  function setBindingMessage(message) {
    if (!selectedBinding) return;
    const next = midiControlBindingFrom({
      message,
      controller: selectedBinding.controller ?? 0,
      parameterMsb: selectedBinding.parameterMsb ?? 0,
      parameterLsb: selectedBinding.parameterLsb ?? 0,
      valueResolution: selectedBinding.valueResolution ?? 7,
      port: selectedBinding.port ?? 'value',
      deviceRole: selectedBinding.deviceRole ?? DEFAULT_DEVICE_ROLE,
    });
    if (!next) return;
    writeBindings(bindings.map((binding, index) => (index === selectedIndex
      ? { ...next, channel: selectedBinding.channel ?? 0, dryRun: selectedBinding.dryRun !== false }
      : binding)));
  }

  // Switching kind rewrites the binding rather than leaving both sets of fields on it: a binding
  // carrying a parameterId AND a controller reads as though it does both, and it does not.
  function setBindingKind(kind) {
    if (!selectedBinding) return;
    const port = selectedBinding.port ?? 'value';
    const deviceRole = selectedBinding.deviceRole ?? DEFAULT_DEVICE_ROLE;
    const next = kind === MIDI_CONTROL_KIND
      ? midiControlBindingFrom({ controller: selectedBinding.controller ?? 0, port, deviceRole })
      : {
        kind: 'deviceParameter', port, deviceRole,
        parameterId: '', parameterType: '', adoptMetadata: true, dryRun: true,
        feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
      };
    if (!next) return;
    writeBindings(bindings.map((binding, index) => (index === selectedIndex ? next : binding)));
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
            <option value={index}>{binding.port || 'port'} -> {bindingSummary(binding)}</option>
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
      <PropertyCell label="Kind" span={2} hint="A profile parameter is compiled by the device engine; a MIDI control is sent as raw bytes and matched on arrival.">
        <select class="val" value={selectedBinding?.kind ?? 'deviceParameter'} onchange={(e) => setBindingKind(e.target.value)}>
          <option value="deviceParameter">Device parameter</option>
          <option value="midiControl">MIDI control (raw CC)</option>
        </select>
      </PropertyCell>
      {#if isMidiControl}
        <PropertyCell label="Message" span={2} hint="Which MIDI message. CC and aftertouch are two-way; velocity, poly pressure and bend can only be followed.">
          <select class="val" value={selectedBinding?.message ?? 'cc'} onchange={(e) => setBindingMessage(e.target.value)}>
            {#each MIDI_CONTROL_MESSAGES as message}
              <option value={message.id}>{message.label}{message.sends ? '' : ' (in only)'}</option>
            {/each}
          </select>
        </PropertyCell>
        {#if selectedBinding?.message === 'cc' || !selectedBinding?.message}
          <PropertyCell label="Controller" span={2} hint="CC number, 0-127. The control both sends this and follows it.">
            <input class="val" type="number" min="0" max="127" value={selectedBinding?.controller ?? 0} onchange={(e) => setBindingProp('controller', Math.max(0, Math.min(127, Math.round(Number(e.target.value) || 0))))} />
          </PropertyCell>
        {:else if selectedBinding?.message === 'nrpn' || selectedBinding?.message === 'rpn'}
          <PropertyCell label="Number MSB" span={1} hint="Parameter number, high half — CC 99 for an NRPN, CC 101 for an RPN. Manuals print these as MSB:LSB.">
            <input class="val" type="number" min="0" max="127" value={selectedBinding?.parameterMsb ?? 0} onchange={(e) => setBindingProp('parameterMsb', Math.max(0, Math.min(127, Math.round(Number(e.target.value) || 0))))} />
          </PropertyCell>
          <PropertyCell label="Number LSB" span={1} hint="Parameter number, low half — CC 98 for an NRPN, CC 100 for an RPN.">
            <input class="val" type="number" min="0" max="127" value={selectedBinding?.parameterLsb ?? 0} onchange={(e) => setBindingProp('parameterLsb', Math.max(0, Math.min(127, Math.round(Number(e.target.value) || 0))))} />
          </PropertyCell>
          <PropertyCell label="Resolution" span={1} hint="7-bit sends Data Entry MSB only (0-127). 14-bit adds the LSB (0-16383). The wire cannot say which the device means — and for RPN 0:0 the two bytes are semitones and cents, not one number.">
            <select class="val" value={selectedBinding?.valueResolution ?? 7} onchange={(e) => setBindingProp('valueResolution', Number(e.target.value) === 14 ? 14 : 7)}>
              <option value={7}>7-bit</option>
              <option value={14}>14-bit</option>
            </select>
          </PropertyCell>
          <PropertyCell label="Null after" span={1} hint="Deselect the parameter after sending (CC 99/98 = 127), so a later Data Entry cannot land on it.">
            <PropertyToggle value={selectedBinding?.nullAfterSend === true} onchange={() => setBindingProp('nullAfterSend', !(selectedBinding?.nullAfterSend === true))} />
          </PropertyCell>
        {/if}
        <PropertyCell label="Channel" span={2} hint="0 listens on any channel and sends on 1. 1-16 is exact both ways.">
          <input class="val" type="number" min="0" max="16" value={selectedBinding?.channel ?? 0} onchange={(e) => setBindingProp('channel', Math.max(0, Math.min(16, Math.round(Number(e.target.value) || 0))))} />
        </PropertyCell>
      {:else}
        <PropertyCell label="Parameter" span={2} hint="Semantic parameter id from the device profile.">
          <input class="val" value={selectedBinding?.parameterId ?? ''} placeholder="filter.cutoff" onchange={(e) => setBindingProp('parameterId', e.target.value)} />
        </PropertyCell>
      {/if}
      {#if !isMidiControl}
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
      {/if}
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

  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }

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
