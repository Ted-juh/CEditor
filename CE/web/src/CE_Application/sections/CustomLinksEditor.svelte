<script>
  import { getSection, updateControlProperty, removeControlNode, applyControlPatch } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';
  import ConditionBuilder from './ConditionBuilder.svelte';
  import { activePanel } from '../stores/panels.js';
  import {
    createPanelCustomRouteLink,
    endpointDisplayName,
    endpointKey,
    findPanelCustomRouteLink,
    listPanelCustomApiEndpoints,
    listPanelCustomRouteCandidates,
    listPanelCustomRouteLinks,
  } from '../utils/panelCustomComponentLinks.js';

  let { control = null } = $props();

  // Preset/template cards are an add-time aid (Stage D3): collapsed by
  // default so the editor keeps only live content on screen.
  let showPresetGrid = $state(false);

  let core = $derived(getSection(control, 'Core'));
  let links = $derived(getSection(control, 'Links'));
  let channels = $derived(getSection(control, 'ValueChannels'));
  let designer = $derived(getSection(control, 'Designer'));
  let parts = $derived(getSection(control, 'Parts'));
  let names = $derived(Object.keys(links?._children ?? {}));
  let channelNames = $derived(Object.keys(channels?._children ?? {}));
  let partNames = $derived(Object.keys(parts?._children ?? {}));
  let selectedName = $state('');
  let newName = $state('');
  let selected = $derived(links?._children?.[selectedName] ?? null);
  let panelEndpoints = $derived(listPanelCustomApiEndpoints($activePanel?.controls ?? []));
  let panelTargetEndpoints = $derived(panelEndpoints.filter((endpoint) => endpoint.direction === 'input' && endpoint.controlId !== core?.id));
  let panelSourceEndpoints = $derived(panelEndpoints.filter((endpoint) => endpoint.direction === 'output' && endpoint.controlId !== core?.id));
  let panelRouteCandidates = $derived(listPanelCustomRouteCandidates($activePanel?.controls ?? [], core?.id));
  let panelRouteLinks = $derived(listPanelCustomRouteLinks($activePanel?.controls ?? []));
  let selectedPanelRoutes = $derived(panelRouteLinks.filter((route) => route.source.controlId === core?.id || route.target?.controlId === core?.id));
  let selectedRouteMode = $state('outbound');
  let selectedRouteKey = $state('');
  let routeStatus = $state('');
  let selectedPanelTarget = $state('');
  let sourceHints = $derived([...channelNames, ...partNames.map((name) => `Parts.${name}`), ...panelSourceEndpoints.map((endpoint) => `${endpoint.controlId}.${endpoint.channel}`), 'external.input']);
  let targetHints = $derived([...channelNames, ...partNames.map((name) => `Parts.${name}.visible`), 'external.output']);
  let linkEntries = $derived(Object.entries(links?._children ?? {}));
  let enabledCount = $derived(linkEntries.filter(([, link]) => link?.enabled !== false).length);
  let channelTargetCount = $derived(linkEntries.filter(([, link]) => channelNames.includes(link?.target)).length);
  let propertyTargetCount = $derived(linkEntries.filter(([, link]) => String(link?.target ?? '').includes('.')).length);
  let selectedPreview = $derived(previewLink(selected));
  let linkPresets = $derived(createLinkPresets());

  const TYPES = ['mirror', 'map', 'offset', 'clamp', 'condition', 'switch', 'reset', 'toggle', 'enable-disable', 'show-hide', 'route-value', 'trigger-animation', 'external-input', 'external-output'];
  const ROUTE_MODES = [
    { id: 'outbound', label: 'Send Out' },
    { id: 'inbound', label: 'Receive' },
    { id: 'external', label: 'All Routes' },
  ];

  let visibleRouteCandidates = $derived(panelRouteCandidates.filter((candidate) => selectedRouteMode === 'external' ? true : candidate.direction === selectedRouteMode));
  let selectedRouteCandidate = $derived(visibleRouteCandidates.find((candidate) => candidate.key === selectedRouteKey) ?? visibleRouteCandidates[0] ?? null);
  let selectedRouteExists = $derived(selectedRouteCandidate ? findPanelCustomRouteLink($activePanel?.controls ?? [], selectedRouteCandidate.source, selectedRouteCandidate.target) : null);
  let inboundRouteCount = $derived(selectedPanelRoutes.filter((route) => route.target?.controlId === core?.id).length);
  let outboundRouteCount = $derived(selectedPanelRoutes.filter((route) => route.source.controlId === core?.id).length);

  function firstChannel(fallback = 'mainValue') {
    return channelNames[0] ?? fallback;
  }

  function firstOtherChannel(source = firstChannel(), fallback = 'mode') {
    return channelNames.find((name) => name !== source) ?? channelNames[1] ?? fallback;
  }

  function firstPartPath(prop = 'visible') {
    return partNames[0] ? `Parts.${partNames[0]}.${prop}` : `Parts.handle.${prop}`;
  }

  function routeLabel(candidate) {
    if (!candidate) return 'No route';
    return `${endpointDisplayName(candidate.source)} > ${endpointDisplayName(candidate.target)}`;
  }

  function endpointMeta(endpoint) {
    if (!endpoint) return '';
    const type = String(endpoint.type ?? 'value');
    const values = Array.isArray(endpoint.values) ? endpoint.values.filter(Boolean).slice(0, 4).join(', ') : '';
    const hasMin = endpoint.min !== undefined && endpoint.min !== '';
    const hasMax = endpoint.max !== undefined && endpoint.max !== '';
    const range = hasMin || hasMax ? `${hasMin ? endpoint.min : '...'}-${hasMax ? endpoint.max : '...'}` : '';
    const fallback = endpoint.defaultValue !== undefined && endpoint.defaultValue !== '' ? `default ${endpoint.defaultValue}` : '';
    return [type, values || range || fallback].filter(Boolean).join(' ');
  }

  function routeMeta(candidate) {
    if (!candidate) return '';
    return `${endpointMeta(candidate.source)} > ${endpointMeta(candidate.target)}`;
  }

  function compatibilityLabel(candidate) {
    return candidate?.compatibility?.warning || 'Types match.';
  }

  function routeDirection(route) {
    if (!route) return 'route';
    if (route.source.controlId === core?.id) return 'outbound';
    if (route.target?.controlId === core?.id) return 'inbound';
    return 'external';
  }

  function routeLinkLabel(route) {
    if (!route) return '';
    return `${endpointDisplayName(route.source)} > ${endpointDisplayName(route.target)}`;
  }

  function niceType(type = 'map') {
    return String(type).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }

  function previewLink(link) {
    if (!link) {
      return {
        source: 'source',
        operation: 'No Link',
        target: 'target',
        details: 'Create or select a link to preview routing.',
      };
    }

    const source = link.source || 'source';
    const target = link.target || 'target';
    const type = String(link.type ?? 'map');
    if (type === 'map') {
      return {
        source,
        operation: 'Map Range',
        target,
        details: `${link.inputMin ?? 0}..${link.inputMax ?? 1} becomes ${link.outputMin ?? 0}..${link.outputMax ?? 1}${link.clamp !== false ? ', clamped' : ''}`,
      };
    }
    if (type === 'offset') {
      return { source, operation: 'Offset', target, details: `Add ${link.amount ?? 0} before writing the target.` };
    }
    if (type === 'clamp') {
      return { source, operation: 'Clamp', target, details: `Keep routed values between ${link.min ?? 0} and ${link.max ?? 1}.` };
    }
    if (type === 'condition') {
      return { source, operation: 'Condition', target, details: `${link.expression || link.condition || 'expression'} ? ${link.trueValue || 'true'} : ${link.falseValue || 'false'}` };
    }
    if (type === 'switch') {
      return { source, operation: 'Switch', target, details: `${Object.keys(link.cases ?? {}).length} case routes configured.` };
    }
    if (type === 'toggle') {
      return { source, operation: 'Toggle', target, details: 'Flip the target value when the source fires.' };
    }
    if (type === 'reset') {
      return { source, operation: 'Reset', target, details: 'Return the target value to its default state.' };
    }
    if (type === 'enable-disable' || type === 'show-hide') {
      return { source, operation: niceType(type), target, details: `${link.invert === true ? 'Invert and route' : 'Route'} the source as a boolean property.` };
    }
    return { source, operation: niceType(type), target, details: 'Route this value through the selected link operation.' };
  }

  function createLinkPresets() {
    const source = firstChannel('mainValue');
    const target = firstOtherChannel(source, source);
    const mode = channelNames.includes('mode') ? 'mode' : target;
    return [
      { id: 'mirror', label: 'Mirror', type: 'mirror', source, target, notes: 'Copy a channel or external value directly into another channel.' },
      { id: 'mapRange', label: 'Map Range', type: 'map', source, target, inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1, clamp: true, notes: 'Scale one value range into another.' },
      { id: 'invert', label: 'Invert', type: 'map', source, target, inputMin: 0, inputMax: 1, outputMin: 1, outputMax: 0, clamp: true, notes: 'Invert a normalized value.' },
      { id: 'offset', label: 'Offset', type: 'offset', source, target, amount: 0.1, notes: 'Add a fixed value before writing the target.' },
      { id: 'clamp', label: 'Clamp', type: 'clamp', source, target, min: 0, max: 1, notes: 'Constrain a routed value to a safe range.' },
      { id: 'modeSwitch', label: 'Mode Switch', type: 'switch', source: mode, target, cases: { A: source, B: target }, notes: 'Pick which value should drive the target based on a mode channel.' },
      { id: 'showHide', label: 'Show/Hide', type: 'show-hide', source: mode, target: firstPartPath('visible'), notes: 'Use a button or mode channel to show or hide a layer.' },
      { id: 'toggle', label: 'Toggle', type: 'toggle', source: mode, target: mode, notes: 'Flip a boolean or mode-like target from a trigger.' },
      { id: 'reset', label: 'Reset', type: 'reset', source, target, notes: 'Reset a channel from a trigger or source event.' },
    ];
  }

  $effect(() => {
    if (designer?.selectedLink && names.includes(designer.selectedLink)) {
      selectedName = designer.selectedLink;
      return;
    }
    if (!names.length) {
      selectedName = '';
      return;
    }
    if (!selectedName || !names.includes(selectedName)) selectedName = names[0];
  });

  $effect(() => {
    if (!visibleRouteCandidates.length) {
      selectedRouteKey = '';
      return;
    }
    if (!selectedRouteKey || !visibleRouteCandidates.some((candidate) => candidate.key === selectedRouteKey)) {
      selectedRouteKey = visibleRouteCandidates[0].key;
    }
  });

  function set(path, value) {
    if (!core?.id || !selectedName) return;
    updateControlProperty(core.id, `Links.${selectedName}.${path}`, value);
  }

  function setRoot(path, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Links.${path}`, value);
  }

  function addLink() {
    const name = String(newName ?? '').trim();
    if (!core?.id || !name || links?._children?.[name]) return;
    updateControlProperty(core.id, `Links.${name}`, {
      _type: 'Link',
      name,
      enabled: true,
      type: 'map',
      source: 'mainValue',
      target: '',
      condition: '',
      expression: '',
      notes: '',
    });
    newName = '';
    selectedName = name;
  }

  function removeLink() {
    if (!core?.id || !selectedName) return;
    removeControlNode(core.id, `Links.${selectedName}`);
    selectedName = '';
  }

  function applyPreset(preset) {
    if (!core?.id || !preset) return;
    const fallbackName = preset.id || 'link';
    const name = selectedName || String(newName || fallbackName).trim() || fallbackName;
    const existing = links?._children?.[name] ?? {};
    const next = {
      _type: 'Link',
      enabled: true,
      name,
      condition: '',
      expression: '',
      ...existing,
      ...preset,
      id: undefined,
      label: undefined,
    };
    delete next.id;
    delete next.label;
    applyControlPatch(core.id, { [`Links.${name}`]: next });
    newName = '';
    selectedName = name;
  }

  function selectedTargetEndpoint() {
    return panelTargetEndpoints.find((endpoint) => endpointKey(endpoint) === selectedPanelTarget) ?? panelTargetEndpoints[0] ?? null;
  }

  function applyPanelRoutePreset() {
    const endpoint = selectedTargetEndpoint();
    if (!endpoint || !core?.id) return;
    const sourceEndpoint = {
      controlId: core.id,
      controlName: core.name,
      direction: 'output',
      name: firstChannel('mainValue'),
      channel: firstChannel('mainValue'),
      label: firstChannel('mainValue'),
      type: channels?._children?.[firstChannel('mainValue')]?.type ?? 'float',
    };
    const link = createPanelCustomRouteLink(sourceEndpoint, endpoint, {
      name: selectedName || `routeTo_${endpoint.controlName}_${endpoint.channel}`.replace(/[^A-Za-z0-9_$]+/g, '_'),
    });
    applyControlPatch(core.id, {
      [`Links.${link.name}`]: link,
    });
    selectedName = link.name;
    routeStatus = `Created ${link.name}.`;
  }

  function applyRouteCandidate(candidate = selectedRouteCandidate) {
    if (!candidate) return;
    const existing = findPanelCustomRouteLink($activePanel?.controls ?? [], candidate.source, candidate.target);
    if (existing) {
      routeStatus = `Already routed by ${existing.name}.`;
      return;
    }
    const sourceId = candidate.source.controlId;
    const link = createPanelCustomRouteLink(candidate.source, candidate.target);
    applyControlPatch(sourceId, { [`Links.${link.name}`]: link });
    if (sourceId === core?.id) selectedName = link.name;
    routeStatus = `${candidate.direction === 'inbound' ? 'Created on source component' : 'Created'}: ${routeLabel(candidate)}.`;
  }
</script>

{#if links}
  <PropertySection title="Logic">
    <PropertyCell label="Enabled" span={2} hint="Enable internal and external logic links for this component.">
      <PropertyToggle value={links.enabled !== false} onchange={() => setRoot('enabled', !(links.enabled !== false))} />
    </PropertyCell>
    <PropertyCell label="Debug" span={2} hint="Show link debug information in the test bench later.">
      <PropertyToggle value={links.debug === true} onchange={() => setRoot('debug', !(links.debug === true))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Links">
    <PropertyCell label="Add" span={3} hint="Create a link between internal values, behaviors, visual properties, or external component API values.">
      <input class="val" type="text" bind:value={newName} placeholder="linkName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Add a logic link.">
      <button class="action-btn" type="button" onclick={addLink}>Add</button>
    </PropertyCell>
    <PropertyCell label="Selected" span={3} hint="Choose which link to edit.">
      <select class="val" bind:value={selectedName}>
        {#each names as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected link.">
      <button class="action-btn danger" type="button" onclick={removeLink} disabled={!selectedName}>Remove</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Link Preview">
    <PropertyCell label="Flow" span={4} hint="Visual route for the selected link.">
      <div class="link-flow-card" class:disabled={selected?.enabled === false}>
        <div class="flow-node">
          <span class="flow-label">Source</span>
          <strong>{selectedPreview.source}</strong>
        </div>
        <div class="flow-op">
          <span>&gt;</span>
          <strong>{selectedPreview.operation}</strong>
          <span>&gt;</span>
        </div>
        <div class="flow-node">
          <span class="flow-label">Target</span>
          <strong>{selectedPreview.target}</strong>
        </div>
      </div>
    </PropertyCell>
    <PropertyCell label="Details" span={2} hint="Selected link summary.">
      <div class="link-summary">
        <strong>{selectedPreview.operation}</strong>
        <span>{selectedPreview.details}</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Metrics" span={2} hint="Quick overview of link coverage.">
      <div class="metric-row">
        <span><strong>{enabledCount}</strong> active</span>
        <span><strong>{channelTargetCount}</strong> channels</span>
        <span><strong>{propertyTargetCount}</strong> properties</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Panel Flow" span={4} hint="Active panel-level routes connected to this custom component.">
      <div class="panel-flow-summary">
        <div><strong>{outboundRouteCount}</strong><span>outbound</span></div>
        <div><strong>{inboundRouteCount}</strong><span>inbound</span></div>
        <div><strong>{selectedPanelRoutes.filter((route) => route.broken).length}</strong><span>broken</span></div>
      </div>
      {#if selectedPanelRoutes.length}
        <div class="panel-flow-list">
          {#each selectedPanelRoutes as route (route.key)}
            <button
              type="button"
              class:broken={route.broken}
              onclick={() => {
                if (route.source.controlId === core?.id) selectedName = route.name;
                routeStatus = route.source.controlId === core?.id ? `Selected ${route.name}.` : `Route lives on ${route.source.controlName}.`;
              }}
            >
              <span>{routeDirection(route)}</span>
              <strong>{routeLinkLabel(route)}</strong>
              <em>{route.compatibility.warning || route.compatibility.status}</em>
            </button>
          {/each}
        </div>
      {:else}
        <div class="empty-routes">No panel routes touch this component yet.</div>
      {/if}
    </PropertyCell>
    <PropertyCell label="Presets" span={4} hint="Apply a common routing pattern to the selected link or create one if none exists.">
      <button class="preset-disclosure" type="button" onclick={() => showPresetGrid = !showPresetGrid}>{showPresetGrid ? "Hide" : "Show"} routing presets ▾</button>
      {#if showPresetGrid}
      <div class="preset-grid">
        {#each linkPresets as preset}
          <button class="preset-btn" type="button" onclick={() => applyPreset(preset)}>
            <strong>{preset.label}</strong>
            <span>{previewLink(preset).details}</span>
          </button>
        {/each}
      </div>
      {/if}
    </PropertyCell>
    <PropertyCell label="Panel Routes" span={4} hint="Route this component output into another custom component's published input.">
      <div class="panel-route-card">
        <select class="val" bind:value={selectedPanelTarget}>
          {#each panelTargetEndpoints as endpoint}
            <option value={endpointKey(endpoint)}>{endpoint.controlName} / {endpoint.label} ({endpointMeta(endpoint)})</option>
          {/each}
        </select>
        <button class="action-btn" type="button" onclick={applyPanelRoutePreset} disabled={panelTargetEndpoints.length === 0}>Route</button>
        <span>{panelTargetEndpoints.length ? 'Creates an external-output link.' : 'Add another custom component with published inputs.'}</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Route Builder" span={4} hint="Create routes between published custom component outputs and inputs, including inbound routes into this component.">
      <div class="route-builder">
        <div class="route-mode-row">
          {#each ROUTE_MODES as mode}
            <button class:selected={selectedRouteMode === mode.id} type="button" onclick={() => selectedRouteMode = mode.id}>{mode.label}</button>
          {/each}
        </div>
        <select class="val" bind:value={selectedRouteKey} disabled={visibleRouteCandidates.length === 0}>
          {#each visibleRouteCandidates as candidate}
            <option value={candidate.key}>{routeLabel(candidate)} ({routeMeta(candidate)} / {candidate.compatibility.status})</option>
          {/each}
        </select>
        <div class="candidate-summary">
          {#if selectedRouteCandidate}
            <span class:warn={selectedRouteCandidate.compatibility.warning || selectedRouteExists}>
              {selectedRouteExists ? `Already routed by ${selectedRouteExists.name}.` : compatibilityLabel(selectedRouteCandidate)}
            </span>
            <button class="action-btn" type="button" onclick={() => applyRouteCandidate(selectedRouteCandidate)} disabled={!!selectedRouteExists}>Create Route</button>
          {:else}
            <span>Add another custom component with published API endpoints.</span>
            <button class="action-btn" type="button" disabled>Create Route</button>
          {/if}
        </div>
        {#if routeStatus}
          <div class="route-status">{routeStatus}</div>
        {/if}
        <div class="candidate-list">
          {#each visibleRouteCandidates.slice(0, 6) as candidate}
            {@const existingRoute = findPanelCustomRouteLink($activePanel?.controls ?? [], candidate.source, candidate.target)}
            <button class:selected={selectedRouteKey === candidate.key} type="button" onclick={() => selectedRouteKey = candidate.key}>
              <strong>{routeLabel(candidate)}</strong>
              <em>{routeMeta(candidate)}</em>
              <span class={existingRoute ? 'existing' : candidate.compatibility.status}>
                {candidate.direction} / {existingRoute ? 'exists' : candidate.compatibility.status}
              </span>
            </button>
          {/each}
        </div>
      </div>
    </PropertyCell>
    <PropertyCell label="Routes" span={4} hint="Select a link by its route.">
      <div class="route-list">
        {#if linkEntries.length}
          {#each linkEntries as [name, link]}
            {@const preview = previewLink(link)}
            <button class="route-btn" class:selected={selectedName === name} type="button" onclick={() => selectedName = name}>
              <span>{name}</span>
              <strong>{preview.source} &gt; {preview.operation} &gt; {preview.target}</strong>
            </button>
          {/each}
        {:else}
          <div class="empty-routes">No links yet. Use a preset or add a named link.</div>
        {/if}
      </div>
    </PropertyCell>
  </PropertySection>

  {#if selected}
    <PropertySection title="Link Definition">
      <PropertyCell label="Enabled" span={1} hint="Enable this link.">
        <PropertyToggle value={selected.enabled !== false} onchange={() => set('enabled', !(selected.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Type" span={3} hint="Link operation.">
        <select class="val" value={selected.type ?? 'map'} onchange={(event) => set('type', event.target.value)}>
          {#each TYPES as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Source" span={2} hint="Source channel, behavior, part path, or external input.">
        <input class="val" type="text" list="custom-link-sources" value={selected.source ?? ''} onchange={(event) => set('source', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Target" span={2} hint="Target channel, behavior, part path, or external output.">
        <input class="val" type="text" list="custom-link-targets" value={selected.target ?? ''} onchange={(event) => set('target', event.target.value)} />
      </PropertyCell>
      <datalist id="custom-link-sources">
        {#each sourceHints as hint}
          <option value={hint}></option>
        {/each}
      </datalist>
      <datalist id="custom-link-targets">
        {#each targetHints as hint}
          <option value={hint}></option>
        {/each}
      </datalist>
      <PropertyCell label="Condition" span={4} hint="When this link runs. Leave empty to always run.">
        <ConditionBuilder value={selected.condition ?? ''} channels={channelNames} onChange={(next) => set('condition', next)} placeholder="link always runs" />
      </PropertyCell>
    </PropertySection>

    {#if ['map', 'offset', 'clamp', 'condition', 'switch', 'enable-disable', 'show-hide'].includes(String(selected.type ?? 'map'))}
      <PropertySection title="Link Options">
        {#if selected.type === 'map'}
          <PropertyCell label="Input Min" span={1} hint="Lowest source value for the mapping.">
            <NumberInput value={selected.inputMin ?? 0} step={0.01} onchange={(value) => set('inputMin', value)} />
          </PropertyCell>
          <PropertyCell label="Input Max" span={1} hint="Highest source value for the mapping.">
            <NumberInput value={selected.inputMax ?? 1} step={0.01} onchange={(value) => set('inputMax', value)} />
          </PropertyCell>
          <PropertyCell label="Output Min" span={1} hint="Lowest target value after mapping.">
            <NumberInput value={selected.outputMin ?? 0} step={0.01} onchange={(value) => set('outputMin', value)} />
          </PropertyCell>
          <PropertyCell label="Output Max" span={1} hint="Highest target value after mapping.">
            <NumberInput value={selected.outputMax ?? 1} step={0.01} onchange={(value) => set('outputMax', value)} />
          </PropertyCell>
          <PropertyCell label="Clamp" span={2} hint="Keep mapped values inside the output range.">
            <PropertyToggle value={selected.clamp !== false} onchange={() => set('clamp', !(selected.clamp !== false))} />
          </PropertyCell>
          <PropertyCell label="Round" span={2} hint="Round mapped values to whole numbers before snapping.">
            <PropertyToggle value={selected.round === true} onchange={() => set('round', !(selected.round === true))} />
          </PropertyCell>
        {:else if selected.type === 'offset'}
          <PropertyCell label="Amount" span={2} hint="Amount added to the source before writing the target.">
            <NumberInput value={selected.amount ?? 0} step={0.01} onchange={(value) => set('amount', value)} />
          </PropertyCell>
        {:else if selected.type === 'clamp'}
          <PropertyCell label="Min" span={2} hint="Lowest allowed routed value.">
            <NumberInput value={selected.min ?? 0} step={0.01} onchange={(value) => set('min', value)} />
          </PropertyCell>
          <PropertyCell label="Max" span={2} hint="Highest allowed routed value.">
            <NumberInput value={selected.max ?? 1} step={0.01} onchange={(value) => set('max', value)} />
          </PropertyCell>
        {:else if selected.type === 'condition'}
          <PropertyCell label="Expression" span={4} hint="Condition picking the true/false value below.">
            <ConditionBuilder value={selected.expression ?? ''} channels={channelNames} onChange={(next) => set('expression', next)} placeholder="evaluates to false" />
          </PropertyCell>
          <PropertyCell label="True" span={2} hint="Channel name or literal value written when the expression is true.">
            <input class="val" type="text" value={selected.trueValue ?? ''} onchange={(event) => set('trueValue', event.target.value)} placeholder="xValue" />
          </PropertyCell>
          <PropertyCell label="False" span={2} hint="Channel name or literal value written when the expression is false.">
            <input class="val" type="text" value={selected.falseValue ?? ''} onchange={(event) => set('falseValue', event.target.value)} placeholder="0" />
          </PropertyCell>
        {:else if selected.type === 'switch'}
          <PropertyCell label="Cases" span={4} hint="JSON object mapping source states to channel names or literal values.">
            <textarea class="val code" rows="4" value={JSON.stringify(selected.cases ?? {}, null, 2)} onchange={(event) => {
              try {
                set('cases', JSON.parse(event.target.value || '{}'));
              } catch {
                set('notes', `Invalid cases JSON: ${event.target.value}`);
              }
            }}></textarea>
          </PropertyCell>
        {:else}
          <PropertyCell label="Invert" span={2} hint="Invert the boolean source before writing the target.">
            <PropertyToggle value={selected.invert === true} onchange={() => set('invert', !(selected.invert === true))} />
          </PropertyCell>
        {/if}
      </PropertySection>
    {/if}

    <PropertySection title="Notes">
      <PropertyCell label="Notes" span={4} hint="Freeform implementation notes for this link.">
        <textarea class="val code" rows="3" value={selected.notes ?? ''} onchange={(event) => set('notes', event.target.value)}></textarea>
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .val { width: 100%; min-width: 0; background: #1A1A1A; border: 1px solid #333; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 6px; font-family: inherit; outline: none; box-sizing: border-box; }
  .val.code { font-family: Consolas, 'Courier New', monospace; line-height: 1.4; }
  .val:focus { border-color: #5B9BD5; }
  .action-btn { width: 100%; background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 8px; cursor: pointer; font-family: inherit; }
  .action-btn:hover:not(:disabled) { border-color: #5B9BD5; color: #FFF; }
  .action-btn.danger:hover:not(:disabled) { border-color: #D56B6B; }
  .action-btn:disabled { opacity: 0.4; cursor: default; }
  .link-flow-card { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; gap: 6px; min-height: 58px; }
  .link-flow-card.disabled { opacity: 0.55; }
  .flow-node, .flow-op, .link-summary, .metric-row, .empty-routes { background: #202020; border: 1px solid #343434; border-radius: 4px; box-sizing: border-box; }
  .flow-node { display: flex; flex-direction: column; justify-content: center; gap: 5px; padding: 9px; min-width: 0; }
  .flow-node strong, .flow-op strong, .link-summary strong, .route-btn strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .flow-label { color: #8D8D8D; font-size: 10px; text-transform: uppercase; letter-spacing: 0; }
  .flow-op { display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 112px; padding: 8px; color: #8DBBE8; }
  .flow-op span { color: #666; }
  .link-summary { display: flex; flex-direction: column; gap: 6px; min-height: 54px; padding: 8px; }
  .link-summary span { color: #AAA; line-height: 1.35; }
  .metric-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; min-height: 54px; padding: 8px; align-items: center; text-align: center; }
  .metric-row span { display: flex; flex-direction: column; gap: 3px; color: #999; min-width: 0; }
  .metric-row strong { color: #DDD; font-size: 13px; }
  .panel-flow-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
    margin-bottom: 6px;
  }
  .panel-flow-summary div {
    min-width: 0;
    min-height: 42px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 3px;
    background: #202020;
    border: 1px solid #343434;
    border-radius: 4px;
  }
  .panel-flow-summary strong { color: #E0E0E0; font-size: 13px; }
  .panel-flow-summary span { color: #999; font-size: 10px; }
  .panel-flow-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .panel-flow-list button {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) minmax(70px, 0.55fr);
    gap: 7px;
    align-items: center;
    min-height: 30px;
    padding: 6px 8px;
    background: #202020;
    border: 1px solid #343434;
    border-radius: 4px;
    color: #CCC;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    text-align: left;
  }
  .panel-flow-list button:hover { border-color: #5B9BD5; color: #FFF; }
  .panel-flow-list button.broken { border-color: #7A4C4C; }
  .panel-flow-list span,
  .panel-flow-list strong,
  .panel-flow-list em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .panel-flow-list span { color: #8DBBE8; }
  .panel-flow-list em { color: #A8A8A8; font-style: normal; }
  .preset-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .preset-btn, .route-btn { background: #202020; border: 1px solid #343434; border-radius: 4px; color: #CCC; cursor: pointer; font-family: inherit; font-size: 11px; text-align: left; box-sizing: border-box; min-width: 0; }
  .preset-btn { min-height: 54px; padding: 8px; display: flex; flex-direction: column; gap: 5px; }
  .preset-btn:hover, .route-btn:hover { border-color: #5B9BD5; color: #FFF; }
  .preset-btn strong { color: #E0E0E0; }
  .preset-btn span { color: #999; line-height: 1.3; }
  .panel-route-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 88px;
    gap: 6px;
    align-items: center;
    width: 100%;
  }
  .panel-route-card span {
    grid-column: 1 / -1;
    color: #8FA6B6;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .route-builder { display: flex; flex-direction: column; gap: 6px; }
  .route-mode-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
  .route-mode-row button, .candidate-list button {
    background: #202020;
    border: 1px solid #343434;
    border-radius: 4px;
    color: #CCC;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    min-width: 0;
  }
  .route-mode-row button { min-height: 28px; }
  .route-mode-row button.selected, .candidate-list button.selected { border-color: #5B9BD5; background: #26313B; color: #FFF; }
  .candidate-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 96px;
    gap: 6px;
    align-items: center;
  }
  .candidate-summary span, .route-status {
    color: #8FA6B6;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .candidate-summary span.warn { color: #D6B36C; }
  .route-status { color: #8DBBE8; }
  .candidate-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
  .candidate-list button { display: flex; flex-direction: column; gap: 4px; min-height: 52px; padding: 6px 8px; text-align: left; }
  .candidate-list strong, .candidate-list span, .candidate-list em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .candidate-list em { color: #8FA6B6; font-style: normal; }
  .candidate-list span { color: #999; }
  .candidate-list span.compatible { color: #8CCB8C; }
  .candidate-list span.convert { color: #D6B36C; }
  .candidate-list span.warning { color: #D68C6C; }
  .candidate-list span.existing { color: #8DBBE8; }
  .route-list { display: flex; flex-direction: column; gap: 5px; }
  .route-btn { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 8px; align-items: center; min-height: 32px; padding: 6px 8px; }
  .route-btn.selected { border-color: #5B9BD5; background: #26313B; }
  .route-btn span { color: #9D9D9D; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty-routes { color: #888; padding: 10px; }
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
