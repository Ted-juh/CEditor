<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { selectedControl, updateControlProperty } from '../stores/controls.js';
  import {
    deviceProfiles,
    deviceDiagnostics,
    deviceRoleMappings,
    importDeviceProfile,
    latestMidiPreview,
    latestProfileImport,
    latestProfileTestResult,
    mapDeviceRole,
    midiDestinations,
    midiMonitorEvents,
    profileParameters,
    refreshDeviceProfiles,
    refreshProfileParameters,
    runTestsForProfile,
  } from '../stores/deviceProfiles.js';
  import { getBindingCompatibility } from '../models/componentPorts.js';

  let query = $state('');
  let selectedProfileId = $state('test-cc-synth');
  let selectedDestinationId = $state('previewOnly');

  let parameters = $derived($profileParameters?.[selectedProfileId] ?? []);
  let filteredParameters = $derived(parameters.filter((parameter) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [
      parameter.id,
      parameter.name,
      parameter.group,
      parameter.type,
    ].some((value) => String(value ?? '').toLowerCase().includes(needle));
  }));

  let selectedControlType = $derived($selectedControl?._children?.Core?.controlType ?? '');

  onMount(() => {
    refreshDeviceProfiles();
    refreshProfileParameters(selectedProfileId);
  });

  function handleProfileChange(profileId) {
    selectedProfileId = profileId;
    refreshProfileParameters(profileId);
    mapDeviceRole('mainSynth', profileId, {
      midiDestination: findDestination(selectedDestinationId),
    });
  }

  function handleDestinationChange(destinationId) {
    selectedDestinationId = destinationId;
    mapDeviceRole('mainSynth', selectedProfileId, {
      midiDestination: findDestination(destinationId),
    });
  }

  function findDestination(destinationId) {
    return get(midiDestinations).find((destination) => destination.id === destinationId)
      ?? { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' };
  }

  function bindParameter(parameter) {
    const control = get(selectedControl);
    const core = control?._children?.Core;
    if (!core?.id) return;

    const compatibility = getBindingCompatibility(core.controlType, parameter);
    if (compatibility.status === 'incompatible' || !compatibility.port) return;

    const existing = control?._children?.DeviceBindings?.bindings;
    const nextBindings = Array.isArray(existing) ? [...existing] : [];
    const bindingIndex = nextBindings.findIndex((binding) => binding.port === compatibility.port.id);
    const nextBinding = {
      kind: 'deviceParameter',
      port: compatibility.port.id,
      deviceRole: 'mainSynth',
      parameterId: parameter.id,
      adoptMetadata: true,
      dryRun: true,
      feedback: {
        receiveUpdates: true,
        ignoreOwnEchoes: true,
        echoWindowMs: 250,
      },
    };

    if (bindingIndex >= 0) nextBindings[bindingIndex] = nextBinding;
    else nextBindings.push(nextBinding);

    if (control?._children?.DeviceBindings) {
      updateControlProperty(core.id, 'DeviceBindings.bindings', nextBindings);
    } else {
      updateControlProperty(core.id, 'DeviceBindings', {
        _type: 'DeviceBindings',
        enabled: true,
        debug: false,
        bindings: nextBindings,
      });
    }
    adoptParameterMetadata(core.id, core.controlType, parameter);
  }

  function adoptParameterMetadata(controlId, controlType, parameter) {
    const shortLabel = parameter?.display?.shortLabel || parameter?.name || parameter?.id;
    if (shortLabel && ['Button', 'MomentaryButton', 'ToggleButton', 'RadioButtonGroup', 'CyclicButton', 'Combobox', 'Label'].includes(controlType)) {
      updateControlProperty(controlId, 'Text.content', shortLabel);
    }

    if (parameter?.type === 'integer' || parameter?.type === 'float' || parameter?.type === 'bipolar') {
      const min = Number(parameter?.range?.min ?? 0);
      const max = Number(parameter?.range?.max ?? 127);
      const value = Number(parameter?.default ?? min);
      updateControlProperty(controlId, 'Behavior.min', min);
      updateControlProperty(controlId, 'Behavior.max', max);
      updateControlProperty(controlId, 'Behavior.defaultCurrentValue', value);
      updateControlProperty(controlId, 'Behavior.valueType', parameter.type === 'float' ? 'float' : 'int');
    }

    if (parameter?.type === 'choice' && Array.isArray(parameter?.choices)) {
      updateControlProperty(controlId, 'Value.rows', parameter.choices.map((choice, index) => ({
        id: choice.id ?? `choice_${index + 1}`,
        displayText: choice.label ?? choice.id ?? String(choice.value ?? index),
        internalValue: choice.id ?? String(choice.value ?? index),
        sendValue: choice.value ?? index,
        receiveValue: choice.value ?? index,
        selectedByDefault: (choice.id ?? String(choice.value)) === parameter.default,
        enabled: true,
        visualOverrides: {},
      })));
      updateControlProperty(controlId, 'Behavior.valueType', 'enum');
      updateControlProperty(controlId, 'Behavior.defaultValue', parameter.default ?? parameter.choices[0]?.id ?? '');
    }
  }
</script>

<div class="parameter-browser">
  <div class="toolbar">
    <select value={selectedProfileId} onchange={(e) => handleProfileChange(e.target.value)}>
      {#each $deviceProfiles as profile}
        <option value={profile.id}>{profile.name || profile.id}</option>
      {/each}
    </select>
    <select value={selectedDestinationId} onchange={(e) => handleDestinationChange(e.target.value)}>
      {#each $midiDestinations as destination}
        <option value={destination.id}>{destination.name || destination.id}</option>
      {/each}
    </select>
    <input value={query} placeholder="Search parameters" oninput={(e) => query = e.target.value} />
    <button onclick={() => runTestsForProfile(selectedProfileId)}>Tests</button>
    <button onclick={() => refreshDeviceProfiles()}>Refresh</button>
    <button onclick={() => importDeviceProfile()}>Import</button>
  </div>

  <div class="target">
    Target: {selectedControlType || 'select a component'} / {$deviceRoleMappings.mainSynth?.midiDestination?.name || 'Preview Only'}
  </div>

  <div class="list">
    {#each filteredParameters as parameter}
      {@const compatibility = getBindingCompatibility(selectedControlType, parameter)}
      <button
        class={['parameter-row', compatibility.status]}
        disabled={!selectedControlType || compatibility.status === 'incompatible'}
        onclick={() => bindParameter(parameter)}
        title={compatibility.warning}
      >
        <span class="name">{parameter.name || parameter.id}</span>
        <span class="meta">{parameter.group || 'Ungrouped'} / {parameter.type}</span>
        <span class="status">{compatibility.status}</span>
      </button>
    {/each}
  </div>

  <div class="diagnostics">
    <div class="diagnostic-panel">
      <div class="diagnostic-title">Preview</div>
      <div class="hex">{$latestMidiPreview?.transaction?.hex || 'No transaction yet'}</div>
      {#if $latestMidiPreview?.transaction?.policy}
        <div class="policy">
          {$latestMidiPreview.transaction.policy.mode}
          / {$latestMidiPreview.transaction.policy.coalesce ? 'coalesce' : 'no coalesce'}
          / {$latestMidiPreview.transaction.policy.minIntervalMs ?? 0} ms
        </div>
      {/if}
      {#if $latestMidiPreview?.error}
        <div class="error">{$latestMidiPreview.error}</div>
      {/if}
      {#if $latestProfileImport?.ok === false}
        <div class="error">{$latestProfileImport.error}</div>
      {:else if $latestProfileImport?.ok === true}
        <div class="policy">Imported {$latestProfileImport.name || $latestProfileImport.id}</div>
      {/if}
    </div>
    <div class="diagnostic-panel">
      <div class="diagnostic-title">Tests</div>
      <div class="hex">
        {#if $latestProfileTestResult}
          {$latestProfileTestResult.passed ?? 0}/{$latestProfileTestResult.total ?? 0} passed
        {:else}
          Not run
        {/if}
      </div>
    </div>
    <div class="diagnostic-panel monitor">
      <div class="diagnostic-title">Monitor</div>
      {#each ($midiMonitorEvents ?? []).slice(-4).reverse() as event}
        <div class="monitor-row" title={`${event.direction} ${event.semantic} ${event.status}`}>
          <span>{event.direction}</span>
          <span>{event.semantic}</span>
          <span>{event.status}</span>
        </div>
      {:else}
        <div class="hex">No MIDI events</div>
      {/each}
    </div>
    <div class="diagnostic-panel issues">
      <div class="diagnostic-title">Issues</div>
      {#each ($deviceDiagnostics?.issues ?? []).slice(0, 4) as issue}
        <div class={['issue-row', issue.level]}>
          <span>{issue.level}</span>
          <span>{issue.message}</span>
        </div>
      {:else}
        <div class="hex">No device issues</div>
      {/each}
    </div>
  </div>
</div>

<style>
  .parameter-browser {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #1E1E1E;
    color: #DDD;
    font-size: 11px;
  }

  .toolbar {
    display: grid;
    grid-template-columns: minmax(120px, 0.9fr) minmax(120px, 0.9fr) minmax(100px, 1fr) 56px 68px 64px;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid #333;
  }

  select,
  input,
  button {
    min-width: 0;
    background: #252525;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    color: #DDD;
    font: inherit;
    padding: 4px 6px;
  }

  .target {
    padding: 6px 8px;
    color: #999;
    border-bottom: 1px solid #2B2B2B;
  }

  .list {
    overflow: auto;
    padding: 4px;
    min-height: 0;
    flex: 1;
  }

  .parameter-row {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(120px, 0.8fr) 92px;
    gap: 8px;
    align-items: center;
    text-align: left;
    margin-bottom: 3px;
    cursor: pointer;
  }

  .parameter-row:hover:not(:disabled) {
    border-color: #5B9BD5;
  }

  .parameter-row:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .name {
    color: #EEE;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status {
    color: #888;
    text-align: right;
  }

  .parameter-row.warning .status {
    color: #D5B45B;
  }

  .diagnostics {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) 110px minmax(190px, 1.4fr) minmax(190px, 1.4fr);
    gap: 6px;
    padding: 6px 8px;
    border-top: 1px solid #333;
    background: #1A1A1A;
  }

  .diagnostic-panel {
    min-width: 0;
    border: 1px solid #303030;
    border-radius: 3px;
    padding: 5px 6px;
    background: #202020;
  }

  .diagnostic-title {
    color: #888;
    font-size: 10px;
    margin-bottom: 3px;
    text-transform: uppercase;
  }

  .hex,
  .error,
  .policy,
  .monitor-row {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hex {
    color: #CCC;
    font-family: Consolas, monospace;
  }

  .error {
    color: #D56B6B;
    margin-top: 3px;
  }

  .policy {
    color: #888;
    margin-top: 3px;
  }

  .monitor-row,
  .issue-row {
    display: grid;
    grid-template-columns: 54px minmax(80px, 1fr) minmax(160px, 0.75fr);
    gap: 5px;
    color: #AAA;
    font-family: Consolas, monospace;
    margin-top: 2px;
  }

  .monitor-row span,
  .issue-row span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .issue-row {
    grid-template-columns: 54px minmax(80px, 1fr);
  }

  .issue-row.error {
    color: #D56B6B;
  }

  .issue-row.warning {
    color: #D5B45B;
  }
</style>
