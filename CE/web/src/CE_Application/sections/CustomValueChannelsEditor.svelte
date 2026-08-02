<script>
  import { applyControlPatch, getSection, updateControlProperty, removeControlNode } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';
  import { createValueChannel } from '../utils/customComponentFactory.js';
  import { normalizeCustomChannelValue, snapCustomChannelValue } from '../utils/customComponentInteraction.js';

  let { control = null } = $props();

  // Preset/template cards are an add-time aid (Stage D3): collapsed by
  // default so the editor keeps only live content on screen.
  let showPresetGrid = $state(false);

  let core = $derived(getSection(control, 'Core'));
  let designer = $derived(getSection(control, 'Designer'));
  let channels = $derived(getSection(control, 'ValueChannels'));
  let channelNames = $derived(Object.keys(channels?._children ?? {}));
  let selectedName = $state('');
  let newName = $state('');
  let selected = $derived(channels?._children?.[selectedName] ?? null);
  let channelEntries = $derived(Object.entries(channels?._children ?? {}));
  let publicInputs = $derived(channelEntries.filter(([, channel]) => channel?.publicInput !== false).length);
  let publicOutputs = $derived(channelEntries.filter(([, channel]) => channel?.publicOutput !== false).length);
  // Publishing is owned by the Publish tab (Stage B9) — this editor only
  // reflects the contract entries that reference the selected channel.
  let published = $derived(getSection(control, 'PublishedProperties'));
  let publishedAsLabel = $derived.by(() => {
    if (!selectedName) return '';
    const names = [];
    for (const [kind, entries] of [['input', published?.inputs ?? {}], ['output', published?.outputs ?? {}]]) {
      for (const [name, entry] of Object.entries(entries)) {
        if (entry?.enabled === false) continue;
        if (String(entry?.channel ?? '') === selectedName) names.push(`${kind} "${name}"`);
      }
    }
    return names.join(' · ');
  });

  function jumpToPublish() {
    if (!core?.id) return;
    applyControlPatch(core.id, {
      'Designer.focusSection': 'publish',
      'Designer.focusApiMode': 'contract',
    });
  }
  let deviceBindable = $derived(channelEntries.filter(([, channel]) => channel?.deviceBindable !== false).length);
  let selectedDefault = $derived(selected?.defaultValue ?? (String(selected?.type ?? '') === 'bool' ? false : 0));
  let selectedNormalized = $derived(selected ? normalizeCustomChannelValue(selected, selectedDefault) : 0);
  let selectedSnapped = $derived(selected ? snapCustomChannelValue(selected, selectedDefault) : 0);
  let selectedFormatted = $derived(formatChannelValue(selected, selectedSnapped));
  let enumText = $derived((selected?.values ?? selected?.options ?? []).join(', '));
  let selectedNumeric = $derived(!['bool', 'enum', 'text', 'color', 'note'].includes(String(selected?.type ?? 'float')));
  let constraintChannelOptions = $derived(channelEntries
    .filter(([name, channel]) => name !== selectedName && !['bool', 'enum', 'text', 'color'].includes(String(channel?.type ?? 'float')))
    .map(([name, channel]) => ({ name, label: channel?.label || name })));
  let lowerConstraintChannel = $derived(channelNameFromConstraint(selected?.constraints?.normalizedMin));
  let upperConstraintChannel = $derived(channelNameFromConstraint(selected?.constraints?.normalizedMax));

  const TYPE_OPTIONS = ['float', 'int', 'bool', 'enum', 'note', 'color', 'text'];
  const CURVE_OPTIONS = ['linear', 'exponential', 'logarithmic', 's-curve', 'stepped', 'bipolar', 'dead-zone'];
  const CHANNEL_PRESETS = [
    { id: 'float', label: 'Float', type: 'float', min: 0, max: 1, step: 0.01, defaultValue: 0.5, format: { precision: 2 } },
    { id: 'bipolar', label: 'Bipolar', type: 'float', min: -1, max: 1, step: 0.01, defaultValue: 0, curve: { mode: 'bipolar' }, format: { precision: 2 } },
    { id: 'int', label: 'Integer', type: 'int', min: 0, max: 127, step: 1, defaultValue: 64, format: { precision: 0 } },
    { id: 'bool', label: 'Bool', type: 'bool', min: 0, max: 1, step: 1, defaultValue: false, format: { precision: 0 } },
    { id: 'enum', label: 'Enum', type: 'enum', min: 0, max: 1, step: 1, defaultValue: 'A', values: ['A', 'B'], format: { precision: 0 } },
    { id: 'note', label: 'Note', type: 'note', min: 0, max: 127, step: 1, defaultValue: 60, format: { precision: 0, unit: 'midi' } },
    { id: 'color', label: 'Color', type: 'color', min: 0, max: 1, step: 1, defaultValue: 'FF5B9BD5', publicOutput: false, deviceBindable: false },
    { id: 'text', label: 'Text', type: 'text', min: 0, max: 1, step: 1, defaultValue: 'Label', publicOutput: false, deviceBindable: false },
  ];

  $effect(() => {
    if (designer?.selectedValueChannel && channelNames.includes(designer.selectedValueChannel)) {
      selectedName = designer.selectedValueChannel;
      return;
    }
    if (!channelNames.length) {
      selectedName = '';
      return;
    }
    if (!selectedName || !channelNames.includes(selectedName)) selectedName = channelNames[0];
  });

  function set(path, value) {
    if (!core?.id || !selectedName) return;
    updateControlProperty(core.id, `ValueChannels.${selectedName}.${path}`, value);
  }

  function channelNameFromConstraint(value) {
    const text = String(value ?? '').trim();
    const match = text.match(/^channel\.([A-Za-z_$][\w$]*)\.normalized$/);
    return match?.[1] ?? '';
  }

  function setConstraintChannel(path, channelName, fallback) {
    set(path, channelName ? `channel.${channelName}.normalized` : fallback);
  }

  function addChannel() {
    const name = String(newName ?? '').trim();
    if (!core?.id || !name || channels?._children?.[name]) return;
    updateControlProperty(core.id, `ValueChannels.${name}`, createValueChannel(name));
    newName = '';
    selectedName = name;
  }

  function nextChannelName(base) {
    const safeBase = String(base || 'value').replace(/[^a-zA-Z0-9_]/g, '') || 'value';
    let name = safeBase;
    let index = 1;
    const existing = new Set(channelNames);
    while (existing.has(name)) {
      index += 1;
      name = `${safeBase}_${index}`;
    }
    return name;
  }

  function applyPreset(preset) {
    if (!core?.id || !preset) return;
    const name = selectedName || nextChannelName(newName || preset.id);
    applyControlPatch(core.id, {
      [`ValueChannels.${name}`]: {
        ...(selected ?? createValueChannel(name)),
        name,
        label: selected?.label || preset.label,
        type: preset.type,
        min: preset.min,
        max: preset.max,
        step: preset.step,
        defaultValue: preset.defaultValue,
        currentValue: preset.defaultValue,
        publicInput: preset.publicInput ?? selected?.publicInput ?? true,
        publicOutput: preset.publicOutput ?? selected?.publicOutput ?? true,
        deviceBindable: preset.deviceBindable ?? selected?.deviceBindable ?? true,
        values: preset.values ?? selected?.values ?? selected?.options ?? [],
        format: {
          precision: preset.type === 'int' || preset.type === 'note' ? 0 : 2,
          prefix: '',
          suffix: '',
          unit: '',
          ...(selected?.format ?? {}),
          ...(preset.format ?? {}),
        },
        snap: {
          enabled: true,
          mode: 'step',
          ...(selected?.snap ?? {}),
        },
        curve: {
          mode: 'linear',
          deadZone: 0,
          hysteresis: 0,
          ...(selected?.curve ?? {}),
          ...(preset.curve ?? {}),
        },
      },
    });
    newName = '';
    selectedName = name;
  }

  function removeChannel() {
    if (!core?.id || !selectedName) return;
    removeControlNode(core.id, `ValueChannels.${selectedName}`);
    selectedName = '';
  }

  function setEnumText(value) {
    const values = String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    set('values', values);
    if (values.length && !values.includes(String(selected?.defaultValue ?? ''))) {
      set('defaultValue', values[0]);
    }
  }

  function formatChannelValue(channel, value) {
    if (!channel) return '-';
    const type = String(channel.type ?? 'float');
    const prefix = channel.format?.prefix ?? '';
    const suffix = channel.format?.suffix ?? '';
    const unit = channel.format?.unit ? ` ${channel.format.unit}` : '';
    if (type === 'bool') return value ? 'true' : 'false';
    if (type === 'enum' || type === 'text' || type === 'color') return `${prefix}${String(value ?? '')}${suffix}${unit}`;
    const precision = Math.max(0, Math.min(6, Math.round(Number(channel.format?.precision ?? (type === 'int' || type === 'note' ? 0 : 2)))));
    const numeric = Number(value);
    return `${prefix}${Number.isFinite(numeric) ? numeric.toFixed(precision) : String(value ?? '')}${suffix}${unit}`;
  }
</script>

{#if channels}
  <PropertySection title="Channels">
    <PropertyCell label="Add" span={3} hint="Create a named value channel for sliders, grids, modes, note selections, scroll offsets, and external links.">
      <input class="val" type="text" bind:value={newName} placeholder="channelName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Add the channel with safe float defaults.">
      <button class="action-btn" type="button" onclick={addChannel}>Add</button>
    </PropertyCell>
    <PropertyCell label="Selected" span={3} hint="Choose which channel to edit.">
      <select class="val" bind:value={selectedName}>
        {#each channelNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected value channel.">
      <button class="action-btn danger" type="button" onclick={removeChannel} disabled={!selectedName}>Remove</button>
    </PropertyCell>
  </PropertySection>

  {#if selected}
    <PropertySection title="Channel Preview">
      <PropertyCell label="Signal" span={2} hint="Default value shown as normalized 0..1 signal.">
        <div class="signal-card">
          <div class="signal-track">
            <span style={`width:${Math.max(0, Math.min(1, selectedNormalized)) * 100}%`}></span>
          </div>
          <strong>{selectedFormatted}</strong>
          <em>normalized {selectedNormalized.toFixed(3)} · snapped {String(selectedSnapped)}</em>
        </div>
      </PropertyCell>
      <PropertyCell label="Surface" span={2} hint="Where this channel can be used outside and inside the custom component.">
        <div class="surface-card">
          <strong>{selectedName}</strong>
          <span>{selected.type ?? 'float'} · {selected.publicInput !== false ? 'input' : 'private in'} · {selected.publicOutput !== false ? 'output' : 'private out'}</span>
          <div class="surface-metrics">
            <em>{channelEntries.length} channels</em>
            <em>{publicInputs} inputs</em>
            <em>{publicOutputs} outputs</em>
            <em>{deviceBindable} device</em>
          </div>
        </div>
      </PropertyCell>
      <PropertyCell label="Presets" span={4} hint="Apply common channel shapes without manually setting type, min/max, step, and formatting.">
        <button class="preset-disclosure" type="button" onclick={() => showPresetGrid = !showPresetGrid}>{showPresetGrid ? "Hide" : "Show"} channel presets ▾</button>
        {#if showPresetGrid}
        <div class="preset-grid">
          {#each CHANNEL_PRESETS as preset}
            <button class="preset-card" type="button" onclick={() => applyPreset(preset)}>
              <span class={`preset-icon ${preset.id}`}></span>
              <strong>{preset.label}</strong>
              <em>{preset.type}</em>
            </button>
          {/each}
        </div>
        {/if}
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Definition">
      <PropertyCell label="Label" span={2} hint="Friendly label shown in the designer and public API.">
        <input class="val" type="text" value={selected.label ?? selectedName} onchange={(event) => set('label', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Type" span={2} hint="Controls value rules, formatting, and future device compatibility.">
        <select class="val" value={selected.type ?? 'float'} onchange={(event) => set('type', event.target.value)}>
          {#each TYPE_OPTIONS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>

      {#if selectedNumeric}
        <PropertyCell label="Min" span={1} hint="Minimum numeric value.">
          <NumberInput value={selected.min ?? 0} step={1} onchange={(value) => set('min', value)} />
        </PropertyCell>
        <PropertyCell label="Max" span={1} hint="Maximum numeric value.">
          <NumberInput value={selected.max ?? 1} step={1} onchange={(value) => set('max', value)} />
        </PropertyCell>
        <PropertyCell label="Step" span={1} hint="Legal increment for snapping and keyboard changes.">
          <NumberInput value={selected.step ?? 0.01} step={0.01} min={0} onchange={(value) => set('step', value)} />
        </PropertyCell>
        <PropertyCell label="Default" span={1} hint="Initial value when the component is inserted.">
          <NumberInput value={selected.defaultValue ?? 0} step={selected.step ?? 0.01} onchange={(value) => set('defaultValue', value)} />
        </PropertyCell>
      {:else}
        <PropertyCell label="Default" span={4} hint="Initial value for this non-numeric channel.">
          <input class="val" type="text" value={selected.defaultValue ?? ''} onchange={(event) => set('defaultValue', event.target.value)} />
        </PropertyCell>
      {/if}
      {#if String(selected.type ?? 'float') === 'enum'}
        <PropertyCell label="Values" span={4} hint="Comma-separated enum values used by cycle/switch controls.">
          <input class="val" type="text" value={enumText} onchange={(event) => setEnumText(event.target.value)} placeholder="A, B, C" />
        </PropertyCell>
      {/if}
    </PropertySection>

    {#if selectedNumeric}
      <PropertySection title="Constraints">
        <PropertyCell label="Enabled" span={1} hint="Clamp this channel before bindings, states, links, and preview output use the value.">
          <PropertyToggle value={selected.constraints?.enabled !== false} onchange={() => set('constraints.enabled', !(selected.constraints?.enabled !== false))} />
        </PropertyCell>
        <PropertyCell label="Lower From" span={1} hint="Optional channel this value cannot go below. Use this for value >= min.">
          <select class="val" value={lowerConstraintChannel} onchange={(event) => setConstraintChannel('constraints.normalizedMin', event.target.value, 0)}>
            <option value="">Fixed minimum</option>
            {#each constraintChannelOptions as option}
              <option value={option.name}>{option.label}</option>
            {/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Upper From" span={1} hint="Optional channel this value cannot go above. Use this for min <= max.">
          <select class="val" value={upperConstraintChannel} onchange={(event) => setConstraintChannel('constraints.normalizedMax', event.target.value, 1)}>
            <option value="">Fixed maximum</option>
            {#each constraintChannelOptions as option}
              <option value={option.name}>{option.label}</option>
            {/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Range" span={1} hint="Raw normalized clamp range currently configured for this channel.">
          <div class="constraint-readout">
            <span>{String(selected.constraints?.normalizedMin ?? 0)}</span>
            <span>{String(selected.constraints?.normalizedMax ?? 1)}</span>
          </div>
        </PropertyCell>
        <PropertyCell label="Lower Gap" span={2} hint="Minimum normalized distance above the lower source. For max, set this to keep it above min.">
          <NumberInput value={selected.constraints?.normalizedMinGap ?? 0} step={0.01} min={0} max={1} onchange={(value) => set('constraints.normalizedMinGap', value)} />
        </PropertyCell>
        <PropertyCell label="Upper Gap" span={2} hint="Minimum normalized distance below the upper source. For min, set this to keep it below max.">
          <NumberInput value={selected.constraints?.normalizedMaxGap ?? 0} step={0.01} min={0} max={1} onchange={(value) => set('constraints.normalizedMaxGap', value)} />
        </PropertyCell>
      </PropertySection>
    {/if}

    <PropertySection title="Public API">
      <PropertyCell label="Published" span={2} hint="Edited in the Publish tab. The channel flags follow it automatically.">
        <div class="published-chip" class:none={!publishedAsLabel}>
          <strong>{publishedAsLabel || 'not published'}</strong>
          <button type="button" onclick={jumpToPublish}>Edit in Publish</button>
        </div>
      </PropertyCell>
      <PropertyCell label="Device" span={1} hint="Allow MIDI/device binding for this value.">
        <PropertyToggle value={selected.deviceBindable !== false} onchange={() => set('deviceBindable', !(selected.deviceBindable !== false))} />
      </PropertyCell>
      <PropertyCell label="Snap" span={1} hint="Snap this value to its defined step/ticks/grid.">
        <PropertyToggle value={selected.snap?.enabled !== false} onchange={() => set('snap.enabled', !(selected.snap?.enabled !== false))} />
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Formatting & Mapping">
      <PropertyCell label="Precision" span={1} hint="Displayed decimal precision.">
        <NumberInput value={selected.format?.precision ?? 2} step={1} min={0} max={6} onchange={(value) => set('format.precision', Math.max(0, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Prefix" span={1} hint="Text before formatted values.">
        <input class="val" type="text" value={selected.format?.prefix ?? ''} onchange={(event) => set('format.prefix', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Suffix" span={1} hint="Text after formatted values.">
        <input class="val" type="text" value={selected.format?.suffix ?? ''} onchange={(event) => set('format.suffix', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Unit" span={1} hint="Optional unit label.">
        <input class="val" type="text" value={selected.format?.unit ?? ''} onchange={(event) => set('format.unit', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Curve" span={2} hint="Mapping curve used by bindings and future device scaling.">
        <select class="val" value={selected.curve?.mode ?? 'linear'} onchange={(event) => set('curve.mode', event.target.value)}>
          {#each CURVE_OPTIONS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Dead Zone" span={1} hint="Optional dead-zone amount for value mapping.">
        <NumberInput value={selected.curve?.deadZone ?? 0} step={0.01} min={0} max={1} onchange={(value) => set('curve.deadZone', value)} />
      </PropertyCell>
      <PropertyCell label="Hysteresis" span={1} hint="Optional hysteresis amount for stable stepped controls.">
        <NumberInput value={selected.curve?.hysteresis ?? 0} step={0.01} min={0} max={1} onchange={(value) => set('curve.hysteresis', value)} />
      </PropertyCell>
    </PropertySection>
  {/if}
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
    box-sizing: border-box;
  }
  .val:focus { border-color: #5B9BD5; }
  .signal-card,
  .published-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 26px;
    padding: 3px 6px;
    box-sizing: border-box;
    border: 1px solid #2E4A41;
    border-radius: 4px;
    background: #14201C;
    color: #A9D7C4;
    font-size: 10px;
  }

  .published-chip.none {
    border-color: #333;
    background: #1A1A1A;
    color: #777;
  }

  .published-chip strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .published-chip button {
    flex: 0 0 auto;
    background: #252525;
    border: 1px solid #3B3B3B;
    border-radius: 3px;
    color: #C8C8C8;
    font-size: 10px;
    font-family: inherit;
    padding: 2px 7px;
    cursor: pointer;
  }

  .published-chip button:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .surface-card {
    width: 100%;
    min-height: 112px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    border: 1px solid #303A42;
    border-radius: 6px;
    background: #171C20;
    color: #C9D5DD;
    padding: 10px;
    box-sizing: border-box;
    font-size: 11px;
  }
  .signal-track {
    position: relative;
    height: 16px;
    border: 1px solid #34424D;
    border-radius: 999px;
    background: #101418;
    overflow: hidden;
  }
  .signal-track span {
    display: block;
    height: 100%;
    min-width: 2px;
    background: linear-gradient(90deg, #5B9BD5, #70C08F);
  }
  .signal-card strong,
  .surface-card strong {
    color: #F4F7FA;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .signal-card em,
  .surface-card span {
    color: #9EADB7;
    font-style: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .surface-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    margin-top: auto;
  }
  .surface-metrics em {
    min-height: 25px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #34424D;
    border-radius: 4px;
    background: #1C252C;
    color: #CDE1EE;
    font-size: 10px;
    font-style: normal;
  }
  .constraint-readout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 4px;
    width: 100%;
  }
  .constraint-readout span {
    min-width: 0;
    overflow: hidden;
    border: 1px solid #34424D;
    border-radius: 3px;
    background: #11171B;
    color: #CDE1EE;
    padding: 4px 5px;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preset-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }
  .preset-card {
    min-height: 58px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    grid-template-rows: auto auto;
    gap: 2px 7px;
    align-items: center;
    border: 1px solid #353D45;
    border-radius: 5px;
    background: #1B2025;
    color: #DDE6EC;
    padding: 6px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }
  .preset-card:hover {
    border-color: #5B9BD5;
    background: #202B34;
  }
  .preset-card strong,
  .preset-card em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preset-card strong {
    font-size: 10px;
    color: #F4F7FA;
  }
  .preset-card em {
    font-size: 9px;
    font-style: normal;
    color: #7FAFCE;
  }
  .preset-icon {
    grid-row: 1 / 3;
    position: relative;
    width: 30px;
    height: 30px;
    border: 1px solid #34424D;
    border-radius: 5px;
    background: #101418;
  }
  .preset-icon::after {
    content: '';
    position: absolute;
    left: 5px;
    right: 5px;
    top: 13px;
    height: 4px;
    border-radius: 999px;
    background: #5B9BD5;
  }
  .preset-icon.bipolar::before {
    content: '';
    position: absolute;
    left: 14px;
    top: 5px;
    bottom: 5px;
    width: 2px;
    background: #34424D;
  }
  .preset-icon.int::after,
  .preset-icon.note::after {
    height: 16px;
    top: 7px;
    border-radius: 3px;
    background: repeating-linear-gradient(90deg, #5B9BD5 0 3px, transparent 3px 5px);
  }
  .preset-icon.bool::after {
    left: 8px;
    right: 8px;
    top: 8px;
    height: 14px;
    border-radius: 50%;
    background: #70C08F;
  }
  .preset-icon.enum::after {
    top: 6px;
    height: 18px;
    border-radius: 3px;
    background: linear-gradient(90deg, #5B9BD5 0 32%, #E5C06B 32% 66%, #70C08F 66%);
  }
  .preset-icon.color::after {
    inset: 5px;
    height: auto;
    border-radius: 50%;
    background: conic-gradient(#D56B6B, #E5C06B, #70C08F, #5B9BD5, #D56B6B);
  }
  .preset-icon.text::after {
    content: 'T';
    inset: 4px;
    height: auto;
    background: transparent;
    color: #E6EEF4;
    font-size: 20px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
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
  .action-btn:hover:not(:disabled) { border-color: #5B9BD5; color: #FFF; }
  .action-btn.danger:hover:not(:disabled) { border-color: #D56B6B; }
  .action-btn:disabled { opacity: 0.4; cursor: default; }
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
