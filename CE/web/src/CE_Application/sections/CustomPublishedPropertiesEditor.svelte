<script>
  import { getSection, updateControlProperty, removeControlNode, applyControlPatch } from '../stores/controls.js';
  import { valueAtPath } from '../stores/controlTreeUtils.js';
  import { validateCustomComponentPackage } from '../utils/customComponentPackage.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let channels = $derived(getSection(control, 'ValueChannels'));
  let parts = $derived(getSection(control, 'Parts'));
  let designer = $derived(getSection(control, 'Designer'));
  let published = $derived(getSection(control, 'PublishedProperties'));
  let api = $derived(getSection(control, 'ExternalAPI'));
  let channelNames = $derived(Object.keys(channels?._children ?? {}));
  let partNames = $derived(Object.keys(parts?._children ?? {}));
  let inputEntries = $derived(Object.entries(published?.inputs ?? {}));
  let outputEntries = $derived(Object.entries(published?.outputs ?? {}));
  let propertyEntries = $derived(Object.entries(published?.editableProperties ?? {}));
  let enabledInputEntries = $derived(inputEntries.filter(([, entry]) => entry?.enabled !== false));
  let enabledOutputEntries = $derived(outputEntries.filter(([, entry]) => entry?.enabled !== false));
  let enabledPropertyEntries = $derived(propertyEntries.filter(([, entry]) => entry?.enabled !== false));
  let missingInputs = $derived(inputEntries.filter(([, entry]) => entry?.enabled !== false && entry?.channel && !channels?._children?.[entry.channel]));
  let missingOutputs = $derived(outputEntries.filter(([, entry]) => entry?.enabled !== false && entry?.channel && !channels?._children?.[entry.channel]));
  let missingProperties = $derived(propertyEntries.filter(([, entry]) => entry?.enabled !== false && !String(entry?.path ?? '').trim()));
  let propertyPathOptions = $derived(createPropertyPathOptions());
  let propertySuggestions = $derived(createPropertySuggestions());
  let packageValidation = $derived(control ? validateCustomComponentPackage(control) : { issues: [], warnings: [] });
  let publicIssueEntries = $derived((packageValidation?.issues ?? []).filter(isPublicApiValidationMessage));
  let publicWarningEntries = $derived((packageValidation?.warnings ?? []).filter(isPublicApiValidationMessage));
  let publicValidationEntries = $derived([
    ...publicIssueEntries.map((message) => ({ severity: 'issue', message })),
    ...publicWarningEntries.map((message) => ({ severity: 'warning', message })),
  ]);
  let contractStatus = $derived(createContractStatus());

  // Stage B9 write-through: the contract is the single editing surface for
  // channel public-ness, but the channel flags stay in the data because the
  // export path (deriveExportParameters) and package format read them. Keep
  // them in sync with the enabled contract entries whichever way the contract
  // was mutated (add/remove/enable/re-target).
  $effect(() => {
    if (!core?.id) return;
    const inputChannels = new Set(
      Object.values(published?.inputs ?? {})
        .filter((entry) => entry?.enabled !== false)
        .map((entry) => String(entry?.channel ?? ''))
        .filter(Boolean)
    );
    const outputChannels = new Set(
      Object.values(published?.outputs ?? {})
        .filter((entry) => entry?.enabled !== false)
        .map((entry) => String(entry?.channel ?? ''))
        .filter(Boolean)
    );
    const patch = {};
    for (const [name, channel] of Object.entries(channels?._children ?? {})) {
      const wantInput = inputChannels.has(name);
      const wantOutput = outputChannels.has(name);
      if ((channel?.publicInput !== false) !== wantInput) patch[`ValueChannels.${name}.publicInput`] = wantInput;
      if ((channel?.publicOutput !== false) !== wantOutput) patch[`ValueChannels.${name}.publicOutput`] = wantOutput;
    }
    if (Object.keys(patch).length) applyControlPatch(core.id, patch);
  });

  let selectedInput = $state('');
  let selectedOutput = $state('');
  let selectedProperty = $state('');
  let newInputName = $state('');
  let newOutputName = $state('');
  let newPropertyName = $state('');
  let selectedInputEntry = $derived(published?.inputs?.[selectedInput] ?? null);
  let selectedOutputEntry = $derived(published?.outputs?.[selectedOutput] ?? null);
  let selectedPropertyEntry = $derived(published?.editableProperties?.[selectedProperty] ?? null);

  const TYPE_OPTIONS = ['float', 'int', 'bool', 'enum', 'note', 'color', 'text', 'image'];
  const NUMERIC_TYPES = new Set(['float', 'int', 'note']);
  const PROPERTY_PATHS = [
    'Parts.label.Text.content',
    'Designer.activeVariant',
    'Parts.background.Background.Fill.colour',
    'Parts.handle.Background.Fill.colour',
    'Parts.track.Background.Fill.colour',
    'Parts.fill.Background.Fill.colour',
  ];

  function createPropertyPathOptions() {
    const dynamic = [];
    for (const name of partNames) {
      dynamic.push(`Parts.${name}.visible`);
      dynamic.push(`Parts.${name}.Transform.opacity`);
      dynamic.push(`Parts.${name}.Background.Fill.colour`);
      dynamic.push(`Parts.${name}.Text.content`);
    }
    return [...new Set([...PROPERTY_PATHS, ...dynamic])];
  }

  function createPropertySuggestions() {
    const publishedPaths = new Set(
      Object.values(published?.editableProperties ?? {})
        .map((entry) => String(entry?.path ?? '').trim())
        .filter(Boolean)
    );
    const suggestions = [];
    for (const [name, part] of Object.entries(parts?._children ?? {})) {
      const lowerName = name.toLowerCase();
      const hasBackground = part?.Background || lowerName.includes('background') || lowerName.includes('track') || lowerName.includes('handle') || lowerName.includes('fill');
      const hasText = part?.Text || lowerName.includes('label') || lowerName.includes('text');
      const entries = [
        { suffix: 'Visible', path: `Parts.${name}.visible`, type: 'bool', label: `${name} Visible` },
        { suffix: 'Opacity', path: `Parts.${name}.Transform.opacity`, type: 'float', label: `${name} Opacity` },
      ];
      if (hasBackground) entries.push({ suffix: 'Colour', path: `Parts.${name}.Background.Fill.colour`, type: 'color', label: `${name} Colour` });
      if (hasText) entries.push({ suffix: 'Text', path: `Parts.${name}.Text.content`, type: 'text', label: `${name} Text` });
      for (const entry of entries) {
        if (publishedPaths.has(entry.path)) continue;
        suggestions.push({
          name: cleanName(`${name}${entry.suffix}`, 'property'),
          part: name,
          ...entry,
        });
      }
    }
    return suggestions.slice(0, 12);
  }

  function createContractStatus() {
    const issueCount = missingInputs.length + missingOutputs.length + missingProperties.length + publicIssueEntries.length;
    if (issueCount) return { label: 'Needs Attention', detail: `${issueCount} published item${issueCount === 1 ? '' : 's'} need a valid target.` };
    if (publicWarningEntries.length) {
      return { label: 'Needs Polish', detail: `${publicWarningEntries.length} public metadata warning${publicWarningEntries.length === 1 ? '' : 's'} should be reviewed before sharing.` };
    }
    if (!enabledInputEntries.length && !enabledOutputEntries.length && !enabledPropertyEntries.length) {
      return { label: 'Private', detail: 'No public inputs, outputs, or editable properties are enabled yet.' };
    }
    return { label: 'Ready', detail: 'Public contract has valid enabled entries.' };
  }

  function isPublicApiValidationMessage(message) {
    const text = String(message ?? '');
    return text.includes('Published input')
      || text.includes('Published output')
      || text.includes('Editable property')
      || text.includes('No published inputs or outputs');
  }

  function quotedName(message) {
    return String(message ?? '').match(/"([^"]+)"/)?.[1] ?? '';
  }

  function focusValidationMessage(message) {
    const text = String(message ?? '');
    const name = quotedName(text);
    if (!name) return;
    if (text.includes('Published input') && published?.inputs?.[name]) selectedInput = name;
    if (text.includes('Published output') && published?.outputs?.[name]) selectedOutput = name;
    if (text.includes('Editable property') && published?.editableProperties?.[name]) selectedProperty = name;
  }

  $effect(() => {
    if (!inputEntries.length) selectedInput = '';
    else if (!selectedInput || !published?.inputs?.[selectedInput]) selectedInput = inputEntries[0][0];
  });

  $effect(() => {
    if (!outputEntries.length) selectedOutput = '';
    else if (!selectedOutput || !published?.outputs?.[selectedOutput]) selectedOutput = outputEntries[0][0];
  });

  $effect(() => {
    if (!propertyEntries.length) selectedProperty = '';
    else if (!selectedProperty || !published?.editableProperties?.[selectedProperty]) selectedProperty = propertyEntries[0][0];
  });

  $effect(() => {
    const focusedChannel = designer?.selectedValueChannel;
    if (!focusedChannel || designer?.focusSection !== 'publish') return;
    const input = inputEntries.find(([, entry]) => (entry?.channel ?? entry?.variable) === focusedChannel);
    const output = outputEntries.find(([, entry]) => (entry?.channel ?? entry?.variable) === focusedChannel);
    if (input) selectedInput = input[0];
    if (output) selectedOutput = output[0];
  });

  $effect(() => {
    const focusedProperty = designer?.selectedPublicProperty;
    if (!focusedProperty || designer?.focusSection !== 'publish') return;
    if (published?.editableProperties?.[focusedProperty]) selectedProperty = focusedProperty;
  });

  function set(path, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, path, value);
  }

  function channelType(channelName) {
    return channels?._children?.[channelName]?.type ?? 'float';
  }

  function channelLabel(channelName, fallback = channelName) {
    return channels?._children?.[channelName]?.label ?? fallback ?? '';
  }

  function isNumericType(type) {
    return NUMERIC_TYPES.has(String(type ?? '').trim().toLowerCase());
  }

  function isEnumType(type) {
    return String(type ?? '').trim().toLowerCase() === 'enum';
  }

  function valuesText(entry) {
    return Array.isArray(entry?.values) ? entry.values.join(', ') : '';
  }

  function parseValuesText(value) {
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function setValuesList(path, value) {
    set(path, parseValuesText(value));
  }

  function propertyDefaultValue(path) {
    return valueAtPath(control, path);
  }

  function channelPublicMetadata(channelName) {
    const channel = channels?._children?.[channelName] ?? {};
    const metadata = {};
    if (channel.defaultValue !== undefined) metadata.defaultValue = channel.defaultValue;
    if (channel.min !== undefined) metadata.min = channel.min;
    if (channel.max !== undefined) metadata.max = channel.max;
    if (channel.step !== undefined) metadata.step = channel.step;
    if (Array.isArray(channel.values)) metadata.values = [...channel.values];
    return metadata;
  }

  function setPublishedChannel(section, entryName, channelName) {
    if (!core?.id || !section || !entryName) return;
    applyControlPatch(core.id, {
      [`PublishedProperties.${section}.${entryName}.channel`]: channelName,
      [`PublishedProperties.${section}.${entryName}.type`]: channelType(channelName),
      ...Object.fromEntries(
        Object.entries(channelPublicMetadata(channelName)).map(([key, value]) => [`PublishedProperties.${section}.${entryName}.${key}`, value])
      ),
    });
  }

  function cleanName(value, fallback = 'entry') {
    return String(value ?? '')
      .trim()
      .replace(/[^A-Za-z0-9_$]+/g, '_')
      .replace(/^_+|_+$/g, '')
      || fallback;
  }

  function addInput() {
    if (!core?.id) return;
    const name = cleanName(newInputName || channelNames[0] || 'input');
    if (published?.inputs?.[name]) return;
    const channel = channelNames.includes(name) ? name : (channelNames[0] ?? '');
    updateControlProperty(core.id, `PublishedProperties.inputs.${name}`, {
      channel,
      label: channels?._children?.[channel]?.label ?? name,
      type: channelType(channel),
      enabled: true,
      ...channelPublicMetadata(channel),
    });
    selectedInput = name;
    newInputName = '';
  }

  function addOutput() {
    if (!core?.id) return;
    const name = cleanName(newOutputName || channelNames[0] || 'output');
    if (published?.outputs?.[name]) return;
    const channel = channelNames.includes(name) ? name : (channelNames[0] ?? '');
    updateControlProperty(core.id, `PublishedProperties.outputs.${name}`, {
      channel,
      label: channels?._children?.[channel]?.label ?? name,
      type: channelType(channel),
      enabled: true,
      ...channelPublicMetadata(channel),
    });
    selectedOutput = name;
    newOutputName = '';
  }

  function addProperty() {
    if (!core?.id) return;
    const name = cleanName(newPropertyName || 'property');
    if (published?.editableProperties?.[name]) return;
    const path = PROPERTY_PATHS[0];
    updateControlProperty(core.id, `PublishedProperties.editableProperties.${name}`, {
      path,
      label: name,
      type: 'text',
      enabled: true,
      defaultValue: propertyDefaultValue(path) ?? '',
    });
    selectedProperty = name;
    newPropertyName = '';
  }

  function publishChannel(name, options = {}) {
    if (!name) return {};
    const label = channelLabel(name, name);
    const type = channelType(name);
    const patch = {};
    if (options.input !== false) {
      patch[`PublishedProperties.inputs.${name}`] = {
        channel: name,
        label,
        type,
        enabled: true,
        ...channelPublicMetadata(name),
      };
    }
    if (options.output !== false) {
      patch[`PublishedProperties.outputs.${name}`] = {
        channel: name,
        label,
        type,
        enabled: true,
        ...channelPublicMetadata(name),
      };
    }
    return patch;
  }

  function publishProperty(name, path, type = 'text', label = name) {
    if (!name || !path) return {};
    return {
      [`PublishedProperties.editableProperties.${name}`]: {
        path,
        label,
        type,
        enabled: true,
        defaultValue: propertyDefaultValue(path) ?? '',
      },
    };
  }

  function publishSuggestedProperty(suggestion) {
    if (!core?.id || !suggestion?.name || !suggestion?.path) return;
    const patch = publishProperty(suggestion.name, suggestion.path, suggestion.type, suggestion.label);
    patch[`PublishedProperties.editableProperties.${suggestion.name}.part`] = suggestion.part ?? '';
    applyControlPatch(core.id, patch);
    selectedProperty = suggestion.name;
  }

  function applyContractPreset(kind) {
    if (!core?.id) return;
    const patch = {};
    const main = channelNames.includes('mainValue') ? 'mainValue' : channelNames[0];
    const mode = channelNames.includes('mode') ? 'mode' : channelNames.find((name) => channelType(name) === 'enum' || channelType(name) === 'bool');
    const trigger = channelNames.includes('trigger') ? 'trigger' : channelNames.find((name) => channelType(name) === 'trigger');

    if (kind === 'value' && main) Object.assign(patch, publishChannel(main));
    if (kind === 'mode' && mode) Object.assign(patch, publishChannel(mode));
    if (kind === 'trigger' && trigger) Object.assign(patch, publishChannel(trigger, { output: false }));
    if (kind === 'allChannels') {
      for (const name of channelNames) Object.assign(patch, publishChannel(name));
    }
    if (kind === 'look') {
      const background = partNames.find((name) => name.toLowerCase().includes('background')) ?? partNames[0];
      const label = partNames.find((name) => name.toLowerCase().includes('label')) ?? partNames.find((name) => name.toLowerCase().includes('text'));
      const handle = partNames.find((name) => name.toLowerCase().includes('handle')) ?? partNames[1] ?? partNames[0];
      if (background) Object.assign(patch, publishProperty('backgroundColour', `Parts.${background}.Background.Fill.colour`, 'color', 'Background Colour'));
      if (handle) Object.assign(patch, publishProperty('accentColour', `Parts.${handle}.Background.Fill.colour`, 'color', 'Accent Colour'));
      if (label) Object.assign(patch, publishProperty('labelText', `Parts.${label}.Text.content`, 'text', 'Label Text'));
    }

    if (Object.keys(patch).length) applyControlPatch(core.id, patch);
  }

  function removeInput() {
    if (!core?.id || !selectedInput) return;
    removeControlNode(core.id, `PublishedProperties.inputs.${selectedInput}`);
  }

  function removeOutput() {
    if (!core?.id || !selectedOutput) return;
    removeControlNode(core.id, `PublishedProperties.outputs.${selectedOutput}`);
  }

  function removeProperty() {
    if (!core?.id || !selectedProperty) return;
    removeControlNode(core.id, `PublishedProperties.editableProperties.${selectedProperty}`);
  }

  function syncChannels() {
    if (!core?.id) return;
    const patch = {};
    for (const [name, channel] of Object.entries(channels?._children ?? {})) {
      if (channel?.publicInput !== false) {
        patch[`PublishedProperties.inputs.${name}`] = {
          channel: name,
          label: channel?.label ?? name,
          type: channel?.type ?? 'float',
          enabled: published?.inputs?.[name]?.enabled !== false,
          ...channelPublicMetadata(name),
        };
      }
      if (channel?.publicOutput !== false) {
        patch[`PublishedProperties.outputs.${name}`] = {
          channel: name,
          label: channel?.label ?? name,
          type: channel?.type ?? 'float',
          enabled: published?.outputs?.[name]?.enabled !== false,
          ...channelPublicMetadata(name),
        };
      }
    }
    applyControlPatch(core.id, patch);
  }
</script>

{#if published}
  <PropertySection title="External Contract">
    <PropertyCell label="Name" span={2} hint="Addressable name for external links and future scripts.">
      <input class="val" type="text" value={api?.addressableName ?? ''} onchange={(event) => set('ExternalAPI.addressableName', event.target.value)} />
    </PropertyCell>
    <PropertyCell label="Policy" span={2} hint="Published-only keeps internals private by default.">
      <select class="val" value={api?.linkPolicy ?? 'publishedOnly'} onchange={(event) => set('ExternalAPI.linkPolicy', event.target.value)}>
        <option value="publishedOnly">publishedOnly</option>
        <option value="advancedOptIn">advancedOptIn</option>
        <option value="allInternals">allInternals</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Inputs" span={2} hint="Allow other components to drive published inputs.">
      <PropertyToggle value={api?.acceptsExternalLinks !== false} onchange={() => set('ExternalAPI.acceptsExternalLinks', !(api?.acceptsExternalLinks !== false))} />
    </PropertyCell>
    <PropertyCell label="Outputs" span={2} hint="Allow this component to drive other components.">
      <PropertyToggle value={api?.emitsExternalLinks !== false} onchange={() => set('ExternalAPI.emitsExternalLinks', !(api?.emitsExternalLinks !== false))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="API Preview">
    <PropertyCell label="Status" span={2} hint="Readiness of the public contract for library reuse and cross-component links.">
      <div class="contract-status" class:warn={contractStatus.label !== 'Ready'}>
        <strong>{contractStatus.label}</strong>
        <span>{contractStatus.detail}</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Surface" span={2} hint="What this component exposes to the rest of the panel.">
      <div class="surface-metrics">
        <span><strong>{enabledInputEntries.length}</strong> inputs</span>
        <span><strong>{enabledOutputEntries.length}</strong> outputs</span>
        <span><strong>{enabledPropertyEntries.length}</strong> props</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Contract" span={4} hint="Public routes that other components and panel properties can see.">
      <div class="contract-board">
        <div class="contract-lane">
          <strong>Inputs</strong>
          {#if enabledInputEntries.length}
            {#each enabledInputEntries as [name, entry]}
              <span>{name} &gt; {entry.channel || 'none'} ({entry.type ?? 'float'})</span>
            {/each}
          {:else}
            <span class="muted">No inputs published</span>
          {/if}
        </div>
        <div class="contract-lane">
          <strong>Outputs</strong>
          {#if enabledOutputEntries.length}
            {#each enabledOutputEntries as [name, entry]}
              <span>{entry.channel || 'none'} &gt; {name} ({entry.type ?? 'float'})</span>
            {/each}
          {:else}
            <span class="muted">No outputs published</span>
          {/if}
        </div>
        <div class="contract-lane">
          <strong>Properties</strong>
          {#if enabledPropertyEntries.length}
            {#each enabledPropertyEntries as [name, entry]}
              <span>{name} &gt; {entry.path || 'missing path'}</span>
            {/each}
          {:else}
            <span class="muted">No editable properties</span>
          {/if}
        </div>
      </div>
    </PropertyCell>
    {#if publicValidationEntries.length}
      <PropertyCell label="Quality" span={4} hint="Package warnings and issues for the public API. Click one to edit its source.">
        <div class="validation-list">
          {#each publicValidationEntries.slice(0, 8) as item}
            <button class={item.severity} type="button" onclick={() => focusValidationMessage(item.message)}>
              <strong>{item.severity}</strong>
              <span>{item.message}</span>
            </button>
          {/each}
          {#if publicValidationEntries.length > 8}
            <em>{publicValidationEntries.length - 8} more public API warning{publicValidationEntries.length - 8 === 1 ? '' : 's'}</em>
          {/if}
        </div>
      </PropertyCell>
    {/if}
    <PropertyCell label="Quick Publish" span={4} hint="Create common public contracts from the current value channels and parts.">
      <div class="preset-grid">
        <button class="preset-btn" type="button" onclick={() => applyContractPreset('value')} disabled={!channelNames.length}>
          <strong>Value Port</strong>
          <span>Publish the main numeric channel as input and output.</span>
        </button>
        <button class="preset-btn" type="button" onclick={() => applyContractPreset('mode')} disabled={!channelNames.length}>
          <strong>Mode Port</strong>
          <span>Publish enum or boolean mode routing.</span>
        </button>
        <button class="preset-btn" type="button" onclick={() => applyContractPreset('trigger')} disabled={!channelNames.length}>
          <strong>Trigger Input</strong>
          <span>Expose an action-style input only.</span>
        </button>
        <button class="preset-btn" type="button" onclick={() => applyContractPreset('look')} disabled={!partNames.length}>
          <strong>Look Props</strong>
          <span>Expose safe color and label customization.</span>
        </button>
        <button class="preset-btn" type="button" onclick={() => applyContractPreset('allChannels')} disabled={!channelNames.length}>
          <strong>All Channels</strong>
          <span>Publish every value channel both ways.</span>
        </button>
        <button class="preset-btn" type="button" onclick={syncChannels} disabled={!channelNames.length}>
          <strong>Sync Flags</strong>
          <span>Use each channel's public input/output flags.</span>
        </button>
      </div>
    </PropertyCell>
    <PropertyCell label="Property Suggestions" span={4} hint="Publish common user-editable properties from component parts.">
      <div class="suggestion-grid">
        {#each propertySuggestions as suggestion (suggestion.path)}
          <button class="suggestion-btn" type="button" onclick={() => publishSuggestedProperty(suggestion)}>
            <strong>{suggestion.label}</strong>
            <span>{suggestion.type} · {suggestion.path}</span>
          </button>
        {/each}
        {#if propertySuggestions.length === 0}
          <div class="empty-note">No unpublished property suggestions.</div>
        {/if}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Published Inputs">
    <PropertyCell label="Add" span={2} hint="Add a public input by name.">
      <input class="val" type="text" bind:value={newInputName} placeholder="inputName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create a new published input.">
      <button class="action-btn" type="button" onclick={addInput}>Add</button>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Publish all value channels marked as public inputs/outputs.">
      <button class="action-btn" type="button" onclick={syncChannels}>Sync</button>
    </PropertyCell>
    <PropertyCell label="Selected" span={3} hint="Choose a published input to edit.">
      <select class="val" bind:value={selectedInput}>
        {#each inputEntries as [name]}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected published input.">
      <button class="action-btn danger" type="button" onclick={removeInput} disabled={!selectedInput}>Remove</button>
    </PropertyCell>
    {#if selectedInputEntry}
      <PropertyCell label="Enabled" span={1} hint="Expose this input.">
        <PropertyToggle value={selectedInputEntry.enabled !== false} onchange={() => set(`PublishedProperties.inputs.${selectedInput}.enabled`, !(selectedInputEntry.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Label" span={1} hint="Friendly name shown to users.">
        <input class="val" type="text" value={selectedInputEntry.label ?? selectedInput} onchange={(event) => set(`PublishedProperties.inputs.${selectedInput}.label`, event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Channel" span={1} hint="Internal channel driven by this public input.">
        <select class="val" value={selectedInputEntry.channel ?? ''} onchange={(event) => setPublishedChannel('inputs', selectedInput, event.target.value)}>
          <option value="">none</option>
          {#each channelNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Type" span={1} hint="Public value type.">
        <select class="val" value={selectedInputEntry.type ?? 'float'} onchange={(event) => set(`PublishedProperties.inputs.${selectedInput}.type`, event.target.value)}>
          {#each TYPE_OPTIONS as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </PropertyCell>
      {@const inputType = String(selectedInputEntry.type ?? 'float').trim().toLowerCase()}
      {#if isNumericType(inputType)}
        <PropertyCell label="Min" span={1} hint="Smallest value shown to users of this package.">
          <input class="val" type="number" value={selectedInputEntry.min ?? ''} onchange={(event) => set(`PublishedProperties.inputs.${selectedInput}.min`, Number(event.target.value))} />
        </PropertyCell>
        <PropertyCell label="Max" span={1} hint="Largest value shown to users of this package.">
          <input class="val" type="number" value={selectedInputEntry.max ?? ''} onchange={(event) => set(`PublishedProperties.inputs.${selectedInput}.max`, Number(event.target.value))} />
        </PropertyCell>
        <PropertyCell label="Step" span={1} hint="Increment used in normal properties.">
          <input class="val" type="number" value={selectedInputEntry.step ?? ''} onchange={(event) => set(`PublishedProperties.inputs.${selectedInput}.step`, Number(event.target.value))} />
        </PropertyCell>
        <PropertyCell label="Default" span={1} hint="Reset value for this published input.">
          <input class="val" type="number" value={selectedInputEntry.defaultValue ?? ''} onchange={(event) => set(`PublishedProperties.inputs.${selectedInput}.defaultValue`, Number(event.target.value))} />
        </PropertyCell>
      {:else if isEnumType(inputType)}
        <PropertyCell label="Values" span={3} hint="Comma-separated public choices.">
          <input class="val" type="text" value={valuesText(selectedInputEntry)} onchange={(event) => setValuesList(`PublishedProperties.inputs.${selectedInput}.values`, event.target.value)} />
        </PropertyCell>
        <PropertyCell label="Default" span={1} hint="Reset value for this published input.">
          <input class="val" type="text" value={selectedInputEntry.defaultValue ?? ''} onchange={(event) => set(`PublishedProperties.inputs.${selectedInput}.defaultValue`, event.target.value)} />
        </PropertyCell>
      {:else}
        <PropertyCell label="Default" span={inputType === 'bool' ? 1 : 4} hint="Reset value for this published input.">
          {#if inputType === 'bool'}
            <PropertyToggle value={selectedInputEntry.defaultValue === true} onchange={() => set(`PublishedProperties.inputs.${selectedInput}.defaultValue`, !(selectedInputEntry.defaultValue === true))} />
          {:else}
            <input class="val" type="text" value={selectedInputEntry.defaultValue ?? ''} onchange={(event) => set(`PublishedProperties.inputs.${selectedInput}.defaultValue`, event.target.value)} />
          {/if}
        </PropertyCell>
      {/if}
    {:else}
      <PropertyCell label="Empty" span={4} hint="Expose value channels from the Values tab.">
        <div class="empty-note">No published inputs yet.</div>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Published Outputs">
    <PropertyCell label="Add" span={3} hint="Add a public output by name.">
      <input class="val" type="text" bind:value={newOutputName} placeholder="outputName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create a new published output.">
      <button class="action-btn" type="button" onclick={addOutput}>Add</button>
    </PropertyCell>
    <PropertyCell label="Selected" span={3} hint="Choose a published output to edit.">
      <select class="val" bind:value={selectedOutput}>
        {#each outputEntries as [name]}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected published output.">
      <button class="action-btn danger" type="button" onclick={removeOutput} disabled={!selectedOutput}>Remove</button>
    </PropertyCell>
    {#if selectedOutputEntry}
      <PropertyCell label="Enabled" span={1} hint="Expose this output.">
        <PropertyToggle value={selectedOutputEntry.enabled !== false} onchange={() => set(`PublishedProperties.outputs.${selectedOutput}.enabled`, !(selectedOutputEntry.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Label" span={1} hint="Friendly output name.">
        <input class="val" type="text" value={selectedOutputEntry.label ?? selectedOutput} onchange={(event) => set(`PublishedProperties.outputs.${selectedOutput}.label`, event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Channel" span={1} hint="Internal channel emitted by this public output.">
        <select class="val" value={selectedOutputEntry.channel ?? ''} onchange={(event) => setPublishedChannel('outputs', selectedOutput, event.target.value)}>
          <option value="">none</option>
          {#each channelNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Type" span={1} hint="Public value type.">
        <select class="val" value={selectedOutputEntry.type ?? 'float'} onchange={(event) => set(`PublishedProperties.outputs.${selectedOutput}.type`, event.target.value)}>
          {#each TYPE_OPTIONS as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </PropertyCell>
      {@const outputType = String(selectedOutputEntry.type ?? 'float').trim().toLowerCase()}
      {#if isNumericType(outputType)}
        <PropertyCell label="Min" span={1} hint="Smallest emitted value shown in route previews.">
          <input class="val" type="number" value={selectedOutputEntry.min ?? ''} onchange={(event) => set(`PublishedProperties.outputs.${selectedOutput}.min`, Number(event.target.value))} />
        </PropertyCell>
        <PropertyCell label="Max" span={1} hint="Largest emitted value shown in route previews.">
          <input class="val" type="number" value={selectedOutputEntry.max ?? ''} onchange={(event) => set(`PublishedProperties.outputs.${selectedOutput}.max`, Number(event.target.value))} />
        </PropertyCell>
        <PropertyCell label="Step" span={1} hint="Increment for route previews and editors.">
          <input class="val" type="number" value={selectedOutputEntry.step ?? ''} onchange={(event) => set(`PublishedProperties.outputs.${selectedOutput}.step`, Number(event.target.value))} />
        </PropertyCell>
        <PropertyCell label="Default" span={1} hint="Documented resting value for this output.">
          <input class="val" type="number" value={selectedOutputEntry.defaultValue ?? ''} onchange={(event) => set(`PublishedProperties.outputs.${selectedOutput}.defaultValue`, Number(event.target.value))} />
        </PropertyCell>
      {:else if isEnumType(outputType)}
        <PropertyCell label="Values" span={3} hint="Comma-separated emitted choices.">
          <input class="val" type="text" value={valuesText(selectedOutputEntry)} onchange={(event) => setValuesList(`PublishedProperties.outputs.${selectedOutput}.values`, event.target.value)} />
        </PropertyCell>
        <PropertyCell label="Default" span={1} hint="Documented resting value for this output.">
          <input class="val" type="text" value={selectedOutputEntry.defaultValue ?? ''} onchange={(event) => set(`PublishedProperties.outputs.${selectedOutput}.defaultValue`, event.target.value)} />
        </PropertyCell>
      {:else}
        <PropertyCell label="Default" span={outputType === 'bool' ? 1 : 4} hint="Documented resting value for this output.">
          {#if outputType === 'bool'}
            <PropertyToggle value={selectedOutputEntry.defaultValue === true} onchange={() => set(`PublishedProperties.outputs.${selectedOutput}.defaultValue`, !(selectedOutputEntry.defaultValue === true))} />
          {:else}
            <input class="val" type="text" value={selectedOutputEntry.defaultValue ?? ''} onchange={(event) => set(`PublishedProperties.outputs.${selectedOutput}.defaultValue`, event.target.value)} />
          {/if}
        </PropertyCell>
      {/if}
    {:else}
      <PropertyCell label="Empty" span={4} hint="Expose value channels from the Values tab.">
        <div class="empty-note">No published outputs yet.</div>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Editable Properties">
    <PropertyCell label="Add" span={3} hint="Add a friendly editable property by name.">
      <input class="val" type="text" bind:value={newPropertyName} placeholder="propertyName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Create a new editable property.">
      <button class="action-btn" type="button" onclick={addProperty}>Add</button>
    </PropertyCell>
    <PropertyCell label="Selected" span={3} hint="Choose an editable property to edit.">
      <select class="val" bind:value={selectedProperty}>
        {#each propertyEntries as [name]}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected editable property.">
      <button class="action-btn danger" type="button" onclick={removeProperty} disabled={!selectedProperty}>Remove</button>
    </PropertyCell>
    {#if selectedPropertyEntry}
      <PropertyCell label="Enabled" span={1} hint="Expose this editable property.">
        <PropertyToggle value={selectedPropertyEntry.enabled !== false} onchange={() => set(`PublishedProperties.editableProperties.${selectedProperty}.enabled`, !(selectedPropertyEntry.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Label" span={1} hint="Friendly name shown in normal panel properties.">
        <input class="val" type="text" value={selectedPropertyEntry.label ?? selectedProperty} onchange={(event) => set(`PublishedProperties.editableProperties.${selectedProperty}.label`, event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Type" span={1} hint="Property editor type.">
        <select class="val" value={selectedPropertyEntry.type ?? 'text'} onchange={(event) => set(`PublishedProperties.editableProperties.${selectedProperty}.type`, event.target.value)}>
          {#each TYPE_OPTIONS as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Part" span={1} hint="Optional shortcut target part.">
        <select class="val" value={selectedPropertyEntry.part ?? ''} onchange={(event) => set(`PublishedProperties.editableProperties.${selectedProperty}.part`, event.target.value)}>
          <option value="">none</option>
          {#each partNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Path" span={4} hint="Internal path this property edits when the component is reused.">
        <input class="val" list="custom-property-paths" type="text" value={selectedPropertyEntry.path ?? ''} onchange={(event) => set(`PublishedProperties.editableProperties.${selectedProperty}.path`, event.target.value)} />
        <datalist id="custom-property-paths">
          {#each propertyPathOptions as path}
            <option value={path}></option>
          {/each}
        </datalist>
      </PropertyCell>
      {@const propertyType = String(selectedPropertyEntry.type ?? 'text').trim().toLowerCase()}
      {#if isNumericType(propertyType)}
        <PropertyCell label="Min" span={1} hint="Smallest value shown in normal properties.">
          <input class="val" type="number" value={selectedPropertyEntry.min ?? ''} onchange={(event) => set(`PublishedProperties.editableProperties.${selectedProperty}.min`, Number(event.target.value))} />
        </PropertyCell>
        <PropertyCell label="Max" span={1} hint="Largest value shown in normal properties.">
          <input class="val" type="number" value={selectedPropertyEntry.max ?? ''} onchange={(event) => set(`PublishedProperties.editableProperties.${selectedProperty}.max`, Number(event.target.value))} />
        </PropertyCell>
        <PropertyCell label="Step" span={1} hint="Increment used in normal properties.">
          <input class="val" type="number" value={selectedPropertyEntry.step ?? ''} onchange={(event) => set(`PublishedProperties.editableProperties.${selectedProperty}.step`, Number(event.target.value))} />
        </PropertyCell>
        <PropertyCell label="Default" span={1} hint="Reset value for this exposed property.">
          <input class="val" type="number" value={selectedPropertyEntry.defaultValue ?? ''} onchange={(event) => set(`PublishedProperties.editableProperties.${selectedProperty}.defaultValue`, Number(event.target.value))} />
        </PropertyCell>
      {:else if isEnumType(propertyType)}
        <PropertyCell label="Values" span={3} hint="Comma-separated public choices.">
          <input class="val" type="text" value={valuesText(selectedPropertyEntry)} onchange={(event) => setValuesList(`PublishedProperties.editableProperties.${selectedProperty}.values`, event.target.value)} />
        </PropertyCell>
        <PropertyCell label="Default" span={1} hint="Reset value for this exposed property.">
          <input class="val" type="text" value={selectedPropertyEntry.defaultValue ?? ''} onchange={(event) => set(`PublishedProperties.editableProperties.${selectedProperty}.defaultValue`, event.target.value)} />
        </PropertyCell>
      {:else}
        <PropertyCell label="Default" span={propertyType === 'bool' ? 1 : 4} hint="Reset value for this exposed property.">
          {#if propertyType === 'bool'}
            <PropertyToggle value={selectedPropertyEntry.defaultValue === true} onchange={() => set(`PublishedProperties.editableProperties.${selectedProperty}.defaultValue`, !(selectedPropertyEntry.defaultValue === true))} />
          {:else}
            <input class="val" type="text" value={selectedPropertyEntry.defaultValue ?? ''} onchange={(event) => set(`PublishedProperties.editableProperties.${selectedProperty}.defaultValue`, event.target.value)} />
          {/if}
        </PropertyCell>
      {/if}
    {:else}
      <PropertyCell label="Empty" span={4} hint="Expose friendly customization properties here.">
        <div class="empty-note">No editable public properties yet.</div>
      </PropertyCell>
    {/if}
  </PropertySection>
{/if}

<style>
  .val { width: 100%; min-width: 0; background: #1A1A1A; border: 1px solid #333; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 6px; font-family: inherit; outline: none; box-sizing: border-box; }
  .val:focus { border-color: #5B9BD5; }
  .action-btn { width: 100%; background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 8px; cursor: pointer; font-family: inherit; }
  .action-btn:hover:not(:disabled) { border-color: #5B9BD5; color: #FFF; }
  .action-btn.danger:hover:not(:disabled) { border-color: #D56B6B; }
  .action-btn:disabled { opacity: 0.4; cursor: default; }
  .empty-note { color: #777; font-size: 11px; min-height: 26px; display: flex; align-items: center; }
  .contract-status, .surface-metrics, .contract-board { background: #202020; border: 1px solid #343434; border-radius: 4px; box-sizing: border-box; }
  .contract-status { min-height: 54px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .contract-status.warn { border-color: #7A6532; }
  .contract-status strong { color: #E0E0E0; }
  .contract-status span { color: #AAA; line-height: 1.35; }
  .surface-metrics { min-height: 54px; padding: 8px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; align-items: center; text-align: center; }
  .surface-metrics span { display: flex; flex-direction: column; gap: 3px; color: #999; min-width: 0; }
  .surface-metrics strong { color: #DDD; font-size: 13px; }
  .contract-board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; overflow: hidden; }
  .contract-lane { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 8px; background: #1D1D1D; }
  .contract-lane strong { color: #DCDCDC; }
  .contract-lane span { color: #AAA; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .contract-lane .muted { color: #777; }
  .validation-list { display: grid; gap: 5px; max-height: 190px; overflow: auto; }
  .validation-list button { width: 100%; border: 1px solid #4A4A4A; border-radius: 4px; background: #202020; color: #CCC; font-family: inherit; font-size: 11px; text-align: left; padding: 7px 8px; display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 8px; align-items: start; cursor: pointer; box-sizing: border-box; }
  .validation-list button:hover { border-color: #5B9BD5; color: #FFF; }
  .validation-list button.issue { border-color: #704141; background: #251919; }
  .validation-list button.warning { border-color: #6B5730; background: #221D14; }
  .validation-list strong { color: #E0E0E0; text-transform: capitalize; }
  .validation-list span { min-width: 0; color: #AAA; line-height: 1.35; }
  .validation-list em { color: #888; font-style: normal; font-size: 11px; padding: 0 2px; }
  .preset-grid,
  .suggestion-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .suggestion-grid { max-height: 174px; overflow: auto; }
  .preset-btn,
  .suggestion-btn { min-height: 54px; background: #202020; border: 1px solid #343434; border-radius: 4px; color: #CCC; cursor: pointer; font-family: inherit; font-size: 11px; text-align: left; box-sizing: border-box; padding: 8px; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .suggestion-btn { min-height: 48px; }
  .preset-btn:hover:not(:disabled),
  .suggestion-btn:hover:not(:disabled) { border-color: #5B9BD5; color: #FFF; }
  .preset-btn:disabled { opacity: 0.45; cursor: default; }
  .preset-btn strong,
  .suggestion-btn strong { color: #E0E0E0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preset-btn span,
  .suggestion-btn span { color: #999; line-height: 1.3; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
