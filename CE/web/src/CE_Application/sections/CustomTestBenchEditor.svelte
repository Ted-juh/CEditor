<script>
  import { applyControlPatch, getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';
  import {
    extractDetachedGeneratedHitZones,
    extractDetachedGeneratedParts,
    materializedCustomComponentSnapshot,
  } from '../utils/customComponentMaterializer.js';
  import {
    applyCustomLinks,
    normalizeCustomChannelValue,
    resolveCustomHitZoneProbeValues,
    seedCustomValues,
    snapCustomChannelValue,
  } from '../utils/customComponentInteraction.js';
  import { applyCustomBindings } from '../utils/interactionRuntime.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let designer = $derived(getSection(control, 'Designer'));
  let parts = $derived(getSection(control, 'Parts'));
  let values = $derived(getSection(control, 'ValueChannels'));
  let behaviors = $derived(getSection(control, 'Behaviors'));
  let hitZones = $derived(getSection(control, 'HitZones'));
  let bindings = $derived(getSection(control, 'Bindings'));
  let links = $derived(getSection(control, 'Links'));
  let generators = $derived(getSection(control, 'Generators'));
  let assets = $derived(getSection(control, 'Assets'));
  let states = $derived(getSection(control, 'States'));
  let animations = $derived(getSection(control, 'Animations'));
  let published = $derived(getSection(control, 'PublishedProperties'));
  let variants = $derived(getSection(control, 'Variants'));
  let preview = $derived(designer?.preview ?? {});

  let partNames = $derived(Object.keys(parts?._children ?? {}));
  let valueNames = $derived(Object.keys(values?._children ?? {}));
  let behaviorNames = $derived(Object.keys(behaviors?._children ?? {}));
  let hitZoneNames = $derived(Object.keys(hitZones?._children ?? {}));
  let bindingNames = $derived(Object.keys(bindings?._children ?? {}));
  let linkNames = $derived(Object.keys(links?._children ?? {}));
  let generatorNames = $derived(Object.keys(generators?._children ?? {}));
  let stateNames = $derived(Object.keys(states?._children ?? {}));
  let animationNames = $derived(Object.keys(animations?._children ?? {}));
  let variantNames = $derived(Object.keys(variants?._children ?? {}));
  let filmstripNames = $derived(Object.keys(assets?.filmstrips ?? {}));
  let publishedInputs = $derived(Object.values(published?.inputs ?? {}).filter((entry) => entry?.enabled !== false));
  let publishedOutputs = $derived(Object.values(published?.outputs ?? {}).filter((entry) => entry?.enabled !== false));
  let publishedPropertyEntries = $derived(Object.entries(published?.editableProperties ?? {}).filter(([, entry]) => entry?.enabled !== false));
  let seededValues = $derived(buildTestValues(control, preview.channelValues));
  let linkedDefaults = $derived(applyCustomLinks(control, seededValues));
  // The signals that drive both generator materialization and live bindings, so
  // the Test Bench preview reflects binding-driven part changes (position, color,
  // rotation, …) as channel values are scrubbed — matching the running plugin.
  let previewSignals = $derived({
    valueNormalized: preview.testValue ?? 0.5,
    customChannels: Object.fromEntries(
      Object.entries(values?._children ?? {}).flatMap(([name, channel]) => ([
        [`channel.${name}.raw`, linkedDefaults.values?.[name] ?? seededValues?.[name]],
        [`channel.${name}.normalized`, normalizeCustomChannelValue(channel, linkedDefaults.values?.[name] ?? seededValues?.[name])],
      ]))
    ),
  });
  let materialized = $derived(applyCustomBindings(
    materializedCustomComponentSnapshot(control, previewSignals),
    previewSignals
  ));
  let materializedParts = $derived(materialized?._children?.Parts?._children ?? {});
  let materializedHitZones = $derived(materialized?._children?.HitZones?._children ?? {});
  let materializedPartNames = $derived(Object.keys(materializedParts));
  let materializedHitZoneEntries = $derived(Object.entries(materializedHitZones));
  let generatedPartEntries = $derived(Object.entries(materializedParts).filter(([, part]) => part?.generated === true));
  let generatedHitZoneEntries = $derived(materializedHitZoneEntries.filter(([, zone]) => zone?.generated === true));
  let generatedSourceDiagnostics = $derived.by(() => groupGeneratedOutput(generatedPartEntries, generatedHitZoneEntries));
  let probeHitZoneEntries = $derived(materializedHitZoneEntries.filter(([, zone]) => isProbeableHitZone(zone)));
  let probeGroups = $derived.by(() => groupProbeHitZones(probeHitZoneEntries));
  let channelDiagnostics = $derived.by(() => Object.entries(values?._children ?? {}).map(([name, channel]) => {
    const raw = linkedDefaults.values?.[name] ?? seededValues?.[name];
    return {
      name,
      label: channel?.label ?? name,
      type: String(channel?.type ?? 'float'),
      raw,
      normalized: normalizeCustomChannelValue(channel, raw),
      publicInput: channel?.publicInput !== false,
      publicOutput: channel?.publicOutput !== false,
      linked: linkedDefaults.targets?.has?.(name) === true,
    };
  }));
  let stateDiagnostics = $derived.by(() => Object.entries(states?._children ?? {}).map(([name, state]) => {
    const partPatches = Object.entries(state?.patches?.parts ?? {});
    const componentPatchCount = Object.keys(state?.patches?.component ?? {}).length;
    return {
      name,
      enabled: state?.enabled !== false,
      group: state?.group ?? 'state',
      active: stateMatchesPreview(name, state, preview),
      when: stateConditionSummary(state),
      partPatchCount: partPatches.length,
      componentPatchCount,
      patches: partPatches.map(([partName, patch]) => ({
        partName,
        properties: Object.keys(patch ?? {}).slice(0, 4).join(', '),
        count: Object.keys(patch ?? {}).length,
      })).slice(0, 4),
    };
  }));
  let scenarioPresets = $derived([
    { label: 'Min', value: 0, state: 'base', overlays: false },
    { label: 'Mid', value: 0.5, state: 'base', overlays: false },
    { label: 'Max', value: 1, state: 'base', overlays: false },
    { label: 'Hover', value: preview.testValue ?? 0.5, state: 'hover', overlays: false },
    { label: 'Pressed', value: preview.testValue ?? 0.5, state: 'pressed', overlays: false },
    { label: 'Debug', value: preview.testValue ?? 0.5, state: preview.state ?? 'base', overlays: true },
  ]);

  let performance = $derived({
    layers: partNames.length,
    hitZones: hitZoneNames.length,
    generated: generatorNames.length,
    bindings: bindingNames.length,
    links: linkNames.length,
    filmstrips: filmstripNames.length,
    variants: variantNames.length,
    states: stateNames.length,
    animations: animationNames.length,
    generatedParts: generatedPartEntries.length,
    generatedZones: generatedHitZoneEntries.length,
  });
  let estimatedCost = $derived(
    performance.layers
    + performance.hitZones
    + performance.generatedParts
    + performance.generatedZones
    + (performance.generated * 4)
    + (performance.bindings * 2)
    + (performance.links * 2)
    + (performance.filmstrips * 8)
    + (performance.animations * 3)
  );
  let costLabel = $derived(
    estimatedCost > 90 ? 'heavy' : estimatedCost > 45 ? 'medium' : 'light'
  );

  function setPreview(path, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Designer.preview.${path}`, value);
  }

  function focusDesigner(patch = {}) {
    if (!core?.id) return;
    applyControlPatch(core.id, {
      'Designer.focusedFromTestBench': true,
      ...patch,
    });
  }

  function layerNameFromPath(path = '') {
    const match = String(path).match(/^Parts\.([^.]+)/);
    return match?.[1] ?? '';
  }

  function channelNameFromSignal(signal = '') {
    const channelMatch = String(signal).match(/^channel\.([^.]+)\.(raw|normalized)$/);
    if (channelMatch) return channelMatch[1];
    const plain = String(signal ?? '').trim();
    return values?._children?.[plain] ? plain : '';
  }

  function channelsFromSignal(signal = '') {
    const found = new Set();
    const text = String(signal ?? '');
    const channelMatches = text.matchAll(/channel\.([^.|\s]+)\.(raw|normalized)/g);
    for (const match of channelMatches) {
      if (values?._children?.[match[1]]) found.add(match[1]);
    }
    if (values?._children?.[text.trim()]) found.add(text.trim());
    return [...found];
  }

  function focusLayer(name) {
    if (!name) return;
    focusDesigner({
      'Designer.selectedLayer': name,
      'Designer.focusSurfaceDock': 'layers',
      'Designer.preview.showBounds': true,
    });
  }

  function focusChannel(name) {
    if (!name) return;
    focusDesigner({
      'Designer.selectedValueChannel': name,
      'Designer.focusSection': 'interact',
    });
  }

  function focusPublicApi(channelName = '') {
    focusDesigner({
      'Designer.selectedValueChannel': channelName,
      'Designer.focusSection': 'publish',
    });
  }

  function focusPublicProperty(entry) {
    const partMatch = String(entry?.path ?? '').match(/^Parts\.([^.]+)/);
    focusDesigner({
      'Designer.selectedLayer': partMatch?.[1] ?? (designer?.selectedLayer ?? ''),
      'Designer.selectedPublicProperty': entry?.name ?? '',
      'Designer.focusSection': 'publish',
    });
  }

  function publishChannelEndpoint(channelName, direction) {
    if (!core?.id || !channelName || !values?._children?.[channelName]) return;
    const channel = values._children[channelName];
    const entry = {
      channel: channelName,
      label: channel?.label ?? channelName,
      type: channel?.type ?? 'float',
      enabled: true,
    };
    const patch = {
      'Designer.selectedValueChannel': channelName,
      'Designer.focusSection': 'publish',
    };
    if (direction === 'input' || direction === 'both') {
      patch[`PublishedProperties.inputs.${channelName}`] = entry;
    }
    if (direction === 'output' || direction === 'both') {
      patch[`PublishedProperties.outputs.${channelName}`] = entry;
    }
    applyControlPatch(core.id, patch);
  }

  function focusBinding(name, binding) {
    if (!name || !binding) return;
    const layer = layerNameFromPath(binding.target);
    const channel = channelNameFromSignal(binding.source) || channelNameFromSignal(binding.target);
    focusDesigner({
      'Designer.selectedBinding': name,
      'Designer.selectedLayer': layer || (designer?.selectedLayer ?? ''),
      'Designer.selectedValueChannel': channel || (designer?.selectedValueChannel ?? ''),
      'Designer.focusSection': 'react',
      'Designer.focusReactPane': 'bindings',
      'Designer.preview.showBounds': true,
    });
  }

  function focusHitZone(name, zone) {
    if (!name || !zone) return;
    const generatorName = zone?.meta?.generatedBy ?? '';
    const detachedSource = zone?.detachedFromGenerator ?? zone?.meta?.detachedFromGenerator ?? '';
    if (zone?.generated === true && generatorName) {
      focusDesigner({
        'Designer.selectedGenerator': generatorName,
        'Designer.selectedHitZone': '',
        'Designer.selectedBehavior': zone?.targetBehavior ?? '',
        'Designer.selectedValueChannel': zone?.targetValueChannel ?? '',
        'Designer.focusSurfaceDock': 'generators',
        'Designer.preview.showHitZones': true,
      });
      return;
    }
    focusDesigner({
      'Designer.selectedHitZone': name,
      'Designer.selectedBehavior': zone?.targetBehavior ?? '',
      'Designer.selectedValueChannel': zone?.targetValueChannel ?? '',
      'Designer.selectedGenerator': detachedSource,
      'Designer.focusSection': 'interact',
      'Designer.preview.showHitZones': true,
    });
  }

  function hitZoneEditLabel(zone) {
    return zone?.generated === true && zone?.meta?.generatedBy ? 'Generator' : 'Edit';
  }

  function hitZoneRuntimeNote(zone) {
    if (zone?.generated === true && zone?.meta?.generatedBy) return `runtime from ${zone.meta.generatedBy}`;
    const source = zone?.detachedFromGenerator ?? zone?.meta?.detachedFromGenerator;
    if (source) return `detached from ${source}`;
    return '';
  }

  function canDetachGenerator(generatorName) {
    if (!generatorName || generatorName === 'manual') return false;
    return generators?._children?.[generatorName]?.detachable !== false;
  }

  function focusGeneratorSource(generatorName) {
    if (!generatorName) return;
    focusDesigner({
      'Designer.selectedGenerator': generatorName,
      'Designer.focusSurfaceDock': 'generators',
      'Designer.preview.showHitZones': true,
    });
  }

  function detachGeneratedSource(generatorName) {
    if (!core?.id || !canDetachGenerator(generatorName)) return;
    const partsToDetach = extractDetachedGeneratedParts(control, generatorName, {
      valueNormalized: preview.testValue ?? 0.5,
    });
    const zonesToDetach = extractDetachedGeneratedHitZones(control, generatorName, {
      valueNormalized: preview.testValue ?? 0.5,
    });
    const partEntries = Object.entries(partsToDetach);
    const zoneEntries = Object.entries(zonesToDetach);
    if (!partEntries.length && !zoneEntries.length) return;

    const patch = {
      [`Generators.${generatorName}.enabled`]: false,
      'Designer.selectedGenerator': generatorName,
      'Designer.selectedLayer': partEntries[0]?.[0] ?? (designer?.selectedLayer ?? ''),
      'Designer.selectedHitZone': zoneEntries[0]?.[0] ?? (designer?.selectedHitZone ?? ''),
      'Designer.focusSection': partEntries.length ? '' : 'interact',
      'Designer.focusSurfaceDock': partEntries.length ? 'layers' : '',
      'Designer.preview.showHitZones': zoneEntries.length > 0,
      'Designer.preview.showBounds': true,
    };
    for (const [partName, part] of partEntries) {
      patch[`Parts.${partName}`] = part;
    }
    for (const [zoneName, zone] of zoneEntries) {
      patch[`HitZones.${zoneName}`] = zone;
    }
    applyControlPatch(core.id, patch);
  }

  function groupGeneratedOutput(partEntries = [], zoneEntries = []) {
    const groups = new Map();
    const ensureGroup = (source) => {
      const name = source || 'generated';
      if (!groups.has(name)) {
        groups.set(name, {
          source: name,
          partNames: [],
          zoneNames: [],
          detachable: canDetachGenerator(name),
        });
      }
      return groups.get(name);
    };
    for (const [name, part] of partEntries) {
      ensureGroup(part?.meta?.generatedBy).partNames.push(name);
    }
    for (const [name, zone] of zoneEntries) {
      ensureGroup(zone?.meta?.generatedBy).zoneNames.push(name);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      partCount: group.partNames.length,
      zoneCount: group.zoneNames.length,
      samples: [...group.partNames.slice(0, 3), ...group.zoneNames.slice(0, 3)].slice(0, 4).join(', '),
    }));
  }

  function focusState(name) {
    if (!name) return;
    focusDesigner({
      'Designer.selectedState': name,
      'Designer.focusSection': 'react',
      'Designer.focusReactPane': 'states',
      'Designer.preview.state': name,
      'Designer.preview.showBounds': true,
    });
  }

  function buildTestValues(customControl, overrides = {}) {
    const seeded = seedCustomValues(customControl);
    const channels = customControl?._children?.ValueChannels?._children ?? {};
    const nextValues = { ...seeded };
    for (const [name, value] of Object.entries(overrides ?? {})) {
      if (!channels[name]) continue;
      nextValues[name] = snapCustomChannelValue(channels[name], value);
    }
    return nextValues;
  }

  function channelOptions(channel) {
    const explicit = Array.isArray(channel?.values) ? channel.values : (Array.isArray(channel?.options) ? channel.options : []);
    return explicit
      .map((entry) => entry?.value ?? entry?.id ?? entry)
      .filter((entry) => entry !== undefined && entry !== null);
  }

  function enumOptionsForChannel(channelName, channel) {
    const options = new Set(channelOptions(channel).map((entry) => String(entry)));
    if (channel?.defaultValue !== undefined && channel?.defaultValue !== null && channel?.defaultValue !== '') {
      options.add(String(channel.defaultValue));
    }
    for (const [, zone] of materializedHitZoneEntries) {
      if (zone?.targetValueChannel !== channelName) continue;
      const payloadValue = zone?.payload?.value ?? zone?.value;
      if (payloadValue !== undefined && payloadValue !== null && payloadValue !== '') options.add(String(payloadValue));
    }
    for (const [, state] of Object.entries(states?._children ?? {})) {
      const valueEnum = state?.when?.valueEnum;
      if (valueEnum !== undefined && valueEnum !== null && valueEnum !== '') options.add(String(valueEnum));
    }
    return [...options];
  }

  function setChannelTestValue(name, value) {
    if (!name || !values?._children?.[name]) return;
    const channelValues = {
      ...(preview.channelValues ?? {}),
      [name]: snapCustomChannelValue(values._children[name], value),
    };
    setPreview('channelValues', channelValues);
  }

  function resetChannelTestValue(name) {
    if (!name) return;
    const channelValues = { ...(preview.channelValues ?? {}) };
    delete channelValues[name];
    setPreview('channelValues', channelValues);
  }

  function resetAllChannelTestValues() {
    setPreview('channelValues', {});
  }

  function isProbeableHitZone(zone) {
    if (!zone || zone.enabled === false) return false;
    const action = String(zone.action ?? '').trim().toLowerCase();
    return Boolean(zone.payload)
      || ['cyclevalue', 'togglevalue', 'setvalue', 'selectvalue', 'cellvalue', 'notevalue', 'dragvalue'].includes(action);
  }

  function probeSourceName(zone) {
    return zone?.meta?.generatedBy || zone?.detachedFromGenerator || (zone?.generated === true ? 'generated' : 'manual');
  }

  function probeKind(zone) {
    const payloadType = String(zone?.payload?.type ?? '').trim();
    if (payloadType) return payloadType;
    return String(zone?.action ?? 'hitZone').trim() || 'hitZone';
  }

  function groupProbeHitZones(entries = []) {
    const groups = new Map();
    for (const [name, zone] of entries) {
      const source = probeSourceName(zone);
      if (!groups.has(source)) {
        groups.set(source, {
          source,
          generated: zone?.generated === true,
          detachable: canDetachGenerator(source),
          entries: [],
          kinds: new Set(),
        });
      }
      const group = groups.get(source);
      group.entries.push([name, zone]);
      group.generated = group.generated || zone?.generated === true;
      group.detachable = group.detachable || canDetachGenerator(source);
      group.kinds.add(probeKind(zone));
    }

    return [...groups.values()].map((group) => {
      const entriesForGroup = group.entries;
      const lastIndex = entriesForGroup.length - 1;
      const middleIndex = Math.floor(lastIndex / 2);
      const samples = [
        { label: 'First', entry: entriesForGroup[0] },
        { label: 'Middle', entry: entriesForGroup[middleIndex] },
        { label: 'Last', entry: entriesForGroup[lastIndex] },
      ].filter((sample, index, all) => sample.entry && all.findIndex((other) => other.entry?.[0] === sample.entry?.[0]) === index);

      return {
        ...group,
        kinds: [...group.kinds].slice(0, 3).join(', '),
        samples,
      };
    });
  }

  function payloadSummary(zone) {
    const payload = zone?.payload ?? {};
    const parts = [];
    if (payload.noteName) parts.push(payload.noteName);
    if (payload.noteNumber !== undefined) parts.push(`note ${payload.noteNumber}`);
    if (payload.rowIndex !== undefined || payload.columnIndex !== undefined) {
      parts.push(`r${Number(payload.rowIndex ?? 0) + 1}:c${Number(payload.columnIndex ?? 0) + 1}`);
    }
    if (payload.keyIndex !== undefined) parts.push(`key ${Number(payload.keyIndex) + 1}`);
    if (payload.normalized !== undefined) parts.push(`v ${Number(payload.normalized).toFixed(3)}`);
    if (payload.xNormalized !== undefined || payload.yNormalized !== undefined) {
      parts.push(`xy ${Number(payload.xNormalized ?? 0).toFixed(2)},${Number(payload.yNormalized ?? 0).toFixed(2)}`);
    }
    return parts.length ? parts.join(' · ') : 'no payload';
  }

  function applyHitZoneProbe(name, zone) {
    const nextValues = resolveCustomHitZoneProbeValues(control, { name, zone }, seededValues);
    setPreview('channelValues', nextValues);
  }

  function applyProbeSample(sample) {
    const [name, zone] = sample?.entry ?? [];
    if (!name || !zone) return;
    applyHitZoneProbe(name, zone);
  }

  function stateConditionSummary(state) {
    const entries = Object.entries(state?.when ?? {});
    if (!entries.length) return 'manual';
    return entries
      .map(([key, value]) => Array.isArray(value) ? `${key}: ${value.join('|')}` : `${key}: ${String(value)}`)
      .join(' · ');
  }

  function stateMatchesPreview(name, state, currentPreview) {
    if (!state || state.enabled === false) return false;
    const stateName = String(currentPreview.state ?? 'base');
    if (String(name) === stateName) return true;
    const when = state.when ?? {};
    return Object.entries(when).every(([key, expected]) => {
      if (key === 'valueEnum') {
        const enumValues = Object.entries(values?._children ?? {})
          .filter(([, channel]) => String(channel?.type ?? '').toLowerCase() === 'enum')
          .map(([channelName]) => linkedDefaults.values?.[channelName] ?? seededValues?.[channelName]);
        return enumValues.some((value) => String(value) === String(expected));
      }
      const actual = key === 'value'
        ? currentPreview.testValue
        : (key === 'valueNormalized' ? currentPreview.testValue : stateName === key);
      if (Array.isArray(expected)) return expected.includes(actual);
      return actual === expected;
    });
  }

  function previewState(name) {
    if (!name) return;
    setPreview('state', name);
    setPreview('showBounds', true);
    focusState(name);
  }

  function applyScenario(scenario) {
    if (!core?.id || !scenario) return;
    updateControlProperty(core.id, 'Designer.preview.testValue', scenario.value);
    updateControlProperty(core.id, 'Designer.preview.state', scenario.state);
    if (scenario.overlays) {
      updateControlProperty(core.id, 'Designer.preview.showHitZones', true);
      updateControlProperty(core.id, 'Designer.preview.showBounds', true);
      updateControlProperty(core.id, 'Designer.preview.showValues', true);
    }
  }
</script>

{#if designer}
  <PropertySection title="Simulation">
    <PropertyCell label="Test Value" span={2} hint="Normalized preview value for value-driven bindings and recipes.">
      <NumberInput value={preview.testValue ?? 0.5} step={0.01} min={0} max={1} onchange={(value) => setPreview('testValue', value)} />
    </PropertyCell>
    <PropertyCell label="State" span={2} hint="Preview state label for future state simulation.">
      <select class="val" value={preview.state ?? 'base'} onchange={(event) => setPreview('state', event.target.value)}>
        <option value="base">base</option>
        <option value="hover">hover</option>
        <option value="pressed">pressed</option>
        <option value="dragging">dragging</option>
        <option value="focused">focused</option>
        <option value="disabled">disabled</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Hit Zones" span={1} hint="Show hit-zone overlay on the panel canvas.">
      <PropertyToggle value={preview.showHitZones === true} onchange={() => setPreview('showHitZones', !(preview.showHitZones === true))} />
    </PropertyCell>
    <PropertyCell label="Bounds" span={1} hint="Show layer bounds while designing.">
      <PropertyToggle value={preview.showBounds !== false} onchange={() => setPreview('showBounds', !(preview.showBounds !== false))} />
    </PropertyCell>
    <PropertyCell label="Values" span={1} hint="Show value debug overlays later.">
      <PropertyToggle value={preview.showValues !== false} onchange={() => setPreview('showValues', !(preview.showValues !== false))} />
    </PropertyCell>
    <PropertyCell label="Anim" span={1} hint="Enable animation previews.">
      <PropertyToggle value={preview.animationsEnabled !== false} onchange={() => setPreview('animationsEnabled', !(preview.animationsEnabled !== false))} />
    </PropertyCell>
    <PropertyCell label="Scenarios" span={4} hint="Jump between common test values and interaction states.">
      <div class="scenario-grid">
        {#each scenarioPresets as scenario}
          <button class="scenario-btn" type="button" class:active={(preview.state ?? 'base') === scenario.state && Math.abs((preview.testValue ?? 0.5) - scenario.value) < 0.001} onclick={() => applyScenario(scenario)}>
            {scenario.label}
          </button>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Channels">
    <PropertyCell label="Controls" span={4} hint="Drive each custom value channel directly while the bench evaluates links, generated output, and public surface.">
      <div class="channel-rig">
        {#each channelDiagnostics as channel (channel.name)}
          {@const definition = values?._children?.[channel.name]}
          {@const type = String(definition?.type ?? 'float').toLowerCase()}
          <div class="rig-row" class:linked={channel.linked}>
            <div class="rig-name">
              <strong>{channel.label}</strong>
              <span>{channel.name}</span>
            </div>
            <div class="rig-control">
              {#if type === 'bool'}
                <PropertyToggle
                  value={(linkedDefaults.values?.[channel.name] ?? seededValues?.[channel.name]) === true}
                  onchange={() => setChannelTestValue(channel.name, !(seededValues?.[channel.name] === true))}
                />
              {:else if type === 'enum'}
                <select class="val" value={seededValues?.[channel.name] ?? ''} onchange={(event) => setChannelTestValue(channel.name, event.target.value)}>
                  {#each channelOptions(definition) as option}
                    <option value={option}>{option}</option>
                  {/each}
                  {#if channelOptions(definition).length === 0}
                    <option value={seededValues?.[channel.name] ?? ''}>{seededValues?.[channel.name] ?? 'value'}</option>
                  {/if}
                </select>
              {:else if type === 'array' && definition?.itemFields}
                <!-- Object-item array (e.g. arpPattern): published read-only view. -->
                <div class="rig-object-array" title={JSON.stringify(seededValues?.[channel.name] ?? definition?.items ?? []).slice(0, 800)}>
                  {(Array.isArray(seededValues?.[channel.name]) ? seededValues[channel.name] : (definition?.items ?? [])).length} item(s) · {Object.keys(definition.itemFields).join(' / ')}
                </div>
              {:else if type === 'array'}
                <div class="rig-array" title="Drag a slider to drive one item of the array channel">
                  {#each (Array.isArray(seededValues?.[channel.name]) ? seededValues[channel.name] : (definition?.items ?? [])) as item, index (index)}
                    <input
                      type="range"
                      min={Number(definition?.min ?? 0)}
                      max={Number(definition?.max ?? 1)}
                      step={Number(definition?.step ?? 0.01)}
                      value={Number(item) || 0}
                      aria-label={`${channel.name} item ${index + 1}`}
                      title={`Item ${index + 1}: ${Number(item).toFixed(2)}`}
                      oninput={(event) => {
                        const source = Array.isArray(seededValues?.[channel.name]) ? seededValues[channel.name] : (definition?.items ?? []);
                        const items = [...source];
                        items[index] = Number(event.currentTarget.value);
                        setChannelTestValue(channel.name, items);
                      }}
                    />
                  {/each}
                </div>
              {:else}
                <NumberInput
                  value={Number(seededValues?.[channel.name] ?? definition?.defaultValue ?? 0)}
                  step={Number(definition?.step ?? (type === 'int' ? 1 : 0.01))}
                  min={Number(definition?.min ?? 0)}
                  max={Number(definition?.max ?? 1)}
                  onchange={(value) => setChannelTestValue(channel.name, value)}
                />
              {/if}
            </div>
            <em>{String(linkedDefaults.values?.[channel.name] ?? seededValues?.[channel.name])}</em>
            <small>{channel.normalized.toFixed(3)}</small>
            <button class="mini-btn" type="button" onclick={() => resetChannelTestValue(channel.name)} disabled={preview.channelValues?.[channel.name] === undefined}>Reset</button>
          </div>
        {/each}
        {#if channelDiagnostics.length === 0}<div class="empty-row">No value channels.</div>{/if}
      </div>
    </PropertyCell>
    <PropertyCell label="Reset" span={4} hint="Clear all bench channel overrides and return to the component defaults.">
      <button class="action-btn" type="button" onclick={resetAllChannelTestValues} disabled={!Object.keys(preview.channelValues ?? {}).length}>Reset channels</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Hit Zones">
    <PropertyCell label="Triggers" span={4} hint="Fire authored or generated hit zones directly into the channel rig.">
      <div class="probe-groups">
        {#each probeGroups as group (group.source)}
          <div class="probe-group" class:generated={group.generated}>
            <div class="probe-group-head">
              <strong>{group.source}</strong>
              <span>{group.entries.length} zone{group.entries.length === 1 ? '' : 's'}</span>
              <em>{group.kinds}</em>
            </div>
            {#if group.generated}
              <div class="probe-group-actions">
                <button class="sample-btn" type="button" onclick={() => focusGeneratorSource(group.source)}>
                  Generator
                </button>
                <button class="sample-btn" type="button" onclick={() => detachGeneratedSource(group.source)} disabled={!group.detachable}>
                  Detach
                </button>
              </div>
            {/if}
            <div class="probe-samples">
              {#each group.samples as sample (sample.label)}
                <button class="sample-btn" type="button" onclick={() => applyProbeSample(sample)}>
                  {sample.label}
                </button>
              {/each}
            </div>
          </div>
        {/each}
        {#if probeGroups.length === 0}<div class="empty-row">No hit zones.</div>{/if}
      </div>
      <div class="probe-list">
        {#each probeHitZoneEntries.slice(0, 12) as [name, zone] (name)}
          <button class="probe-card" class:generated={zone?.generated === true} type="button" onclick={() => applyHitZoneProbe(name, zone)}>
            <strong>{name}</strong>
            <span>{zone?.action ?? '-'}</span>
            <em>{zone?.targetValueChannel || '-'}{zone?.targetValueChannelY ? ` / ${zone.targetValueChannelY}` : ''}</em>
            <small>{hitZoneRuntimeNote(zone) || payloadSummary(zone)}</small>
          </button>
        {/each}
        {#if probeHitZoneEntries.length > 12}<div class="empty-row">+{probeHitZoneEntries.length - 12} more zones in the group samples</div>{/if}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="States">
    <PropertyCell label="States" span={4} hint="Preview authored state rules and see which visual patches they apply.">
      <div class="state-list">
        {#each stateDiagnostics as state (state.name)}
          <div class="state-card" class:active={state.active} class:disabled={state.enabled === false}>
            <div class="state-head">
              <strong>{state.name}</strong>
              <span>{state.group}</span>
              <em>{state.when}</em>
              <button class="sample-btn" type="button" onclick={() => previewState(state.name)}>Preview</button>
              <button class="sample-btn" type="button" onclick={() => focusState(state.name)}>Edit</button>
            </div>
            <div class="state-patches">
              {#each state.patches as patch}
                <span>{patch.partName} · {patch.properties || `${patch.count} patch${patch.count === 1 ? '' : 'es'}`}</span>
              {/each}
              {#if state.partPatchCount > state.patches.length}<em>+{state.partPatchCount - state.patches.length}</em>{/if}
              {#if state.componentPatchCount}<em>component · {state.componentPatchCount}</em>{/if}
              {#if state.partPatchCount === 0 && state.componentPatchCount === 0}<em>no patches</em>{/if}
            </div>
          </div>
        {/each}
        {#if stateDiagnostics.length === 0}<div class="empty-row">No states.</div>{/if}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Counts">
    <PropertyCell label="Layers" span={1} hint="Visible/internal parts."><div class="metric">{performance.layers}</div></PropertyCell>
    <PropertyCell label="Zones" span={1} hint="Hit zones."><div class="metric">{performance.hitZones}</div></PropertyCell>
    <PropertyCell label="Gen" span={1} hint="Generators."><div class="metric">{performance.generated}</div></PropertyCell>
    <PropertyCell label="Cost" span={1} hint="Rough design-time cost estimate."><div class="metric cost-{costLabel}">{costLabel}</div></PropertyCell>
    <PropertyCell label="Bindings" span={1} hint="Value-to-visual mappings."><div class="metric">{performance.bindings}</div></PropertyCell>
    <PropertyCell label="Links" span={1} hint="Logic links."><div class="metric">{performance.links}</div></PropertyCell>
    <PropertyCell label="Strips" span={1} hint="Filmstrip assets."><div class="metric">{performance.filmstrips}</div></PropertyCell>
    <PropertyCell label="Variants" span={1} hint="Component variants."><div class="metric">{performance.variants}</div></PropertyCell>
    <PropertyCell label="States" span={1} hint="Authored state rules."><div class="metric">{performance.states}</div></PropertyCell>
    <PropertyCell label="Anim" span={1} hint="Authored animations."><div class="metric">{performance.animations}</div></PropertyCell>
    <PropertyCell label="Gen Parts" span={1} hint="Runtime parts created by enabled generators."><div class="metric">{performance.generatedParts}</div></PropertyCell>
    <PropertyCell label="Gen Zones" span={1} hint="Runtime hit zones created by enabled generators."><div class="metric">{performance.generatedZones}</div></PropertyCell>
  </PropertySection>

  <PropertySection title="Generators">
    <PropertyCell label="Sources" span={4} hint="Enabled generators currently producing runtime parts or hit zones.">
      <div class="generated-source-list">
        {#each generatedSourceDiagnostics as source (source.source)}
          <div class="generated-source-row">
            <strong>{source.source}</strong>
            <span>{source.partCount} part{source.partCount === 1 ? '' : 's'}</span>
            <span>{source.zoneCount} zone{source.zoneCount === 1 ? '' : 's'}</span>
            <em>{source.samples || 'no sample names'}</em>
            <button class="sample-btn" type="button" onclick={() => focusGeneratorSource(source.source)}>Generator</button>
            <button class="sample-btn" type="button" onclick={() => detachGeneratedSource(source.source)} disabled={!source.detachable}>Detach</button>
          </div>
        {/each}
        {#if generatedSourceDiagnostics.length === 0}<div class="empty-row">No generated runtime output.</div>{/if}
      </div>
    </PropertyCell>
    <PropertyCell label="Parts" span={2} hint="Runtime-generated parts currently produced by enabled generators.">
      <div class="pill-list dense">
        {#each generatedPartEntries.slice(0, 18) as [name]}
          <span>{name}</span>
        {/each}
        {#if generatedPartEntries.length > 18}<em>+{generatedPartEntries.length - 18}</em>{/if}
        {#if generatedPartEntries.length === 0}<em>none</em>{/if}
      </div>
    </PropertyCell>
    <PropertyCell label="Hit Zones" span={2} hint="Runtime-generated hit zones, including grid cells and piano keys.">
      <div class="pill-list dense">
        {#each generatedHitZoneEntries.slice(0, 18) as [name, zone]}
          <span>{name}{zone?.payload?.noteName ? `:${zone.payload.noteName}` : ''}</span>
        {/each}
        {#if generatedHitZoneEntries.length > 18}<em>+{generatedHitZoneEntries.length - 18}</em>{/if}
        {#if generatedHitZoneEntries.length === 0}<em>none</em>{/if}
      </div>
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
    box-sizing: border-box;
  }
  .status-card {
    width: 100%;
    border: 1px solid #57402B;
    background: #241D17;
    border-radius: 6px;
    padding: 10px;
    color: #E8C08A;
    font-size: 11px;
  }
  .status-card.ok {
    border-color: #2F573E;
    background: #162219;
    color: #A9DCB8;
  }
  .readiness-meter {
    width: 100%;
    height: 6px;
    margin: 6px 0;
    border-radius: 999px;
    background: #151515;
    overflow: hidden;
    border: 1px solid #353535;
  }
  .readiness-checklist,
  .quick-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }
  .readiness-step {
    min-width: 0;
    border: 1px solid #383838;
    border-radius: 4px;
    background: #1B1B1B;
    color: #D6D6D6;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .readiness-step {
    display: grid;
    grid-template-columns: 18px 1fr;
    gap: 2px 6px;
    align-items: center;
    padding: 7px;
    text-align: left;
  }
  .readiness-step:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }
  .metric {
    min-height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #333;
    border-radius: 4px;
    background: #191919;
    color: #F0F0F0;
    font-size: 12px;
    font-weight: 700;
  }
  .metric.cost-light { color: #A9DCB8; }
  .metric.cost-medium { color: #E5C06B; }
  .metric.cost-heavy { color: #E28B8B; }
  .scenario-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }
  .scenario-btn {
    min-height: 28px;
    background: #202020;
    border: 1px solid #343434;
    border-radius: 4px;
    color: #CCC;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
  }
  .scenario-btn:hover,
  .scenario-btn.active {
    border-color: #5B9BD5;
    color: #FFF;
    background: #26313B;
  }
  .channel-rig {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rig-row {
    display: grid;
    grid-template-columns: minmax(82px, 1fr) minmax(118px, 1.2fr) minmax(52px, 0.55fr) 48px 54px;
    gap: 7px;
    align-items: center;
    min-height: 34px;
    border: 1px solid #303840;
    border-radius: 5px;
    background: #171C20;
    padding: 5px 6px;
    box-sizing: border-box;
  }
  .rig-row.linked {
    border-color: #5B9BD5;
    background: #172330;
  }
  .rig-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rig-name strong,
  .rig-name span,
  .rig-row em,
  .rig-row small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }
  .rig-name strong {
    color: #F0F4F7;
    font-size: 11px;
  }
  .rig-name span {
    color: #8EA3B2;
    font-size: 9px;
  }
  .rig-control {
    min-width: 0;
  }
  .rig-array {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 3px 6px;
  }
  .rig-array input[type='range'] {
    width: 100%;
    min-width: 0;
    height: 14px;
    accent-color: #5B9BD5;
  }
  .rig-object-array {
    padding: 4px 7px;
    border: 1px solid #2A3036;
    border-radius: 4px;
    background: #15191D;
    color: #87939E;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rig-row em {
    color: #DDE6EC;
    font-size: 10px;
  }
  .rig-row small {
    color: #82B8E5;
    font-size: 10px;
  }
  .mini-btn,
  .action-btn {
    background: #252525;
    border: 1px solid #3B3B3B;
    border-radius: 4px;
    color: #DDD;
    cursor: pointer;
    font-family: inherit;
  }
  .mini-btn {
    min-height: 24px;
    font-size: 10px;
  }
  .action-btn {
    width: 100%;
    min-height: 28px;
    font-size: 11px;
  }
  .mini-btn:hover:not(:disabled),
  .action-btn:hover:not(:disabled) {
    border-color: #5B9BD5;
    color: #FFF;
  }
  .mini-btn:disabled,
  .action-btn:disabled {
    opacity: 0.42;
    cursor: default;
  }
  .probe-groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
    margin-bottom: 7px;
  }
  .specialized-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(142px, 1fr));
    gap: 7px;
    width: 100%;
  }
  .specialized-card {
    min-width: 0;
    min-height: 72px;
    display: grid;
    gap: 4px;
    align-content: start;
    border: 1px solid #31424C;
    border-radius: 5px;
    background: #151B20;
    color: #C9D3DA;
    cursor: pointer;
    font: inherit;
    padding: 8px;
    text-align: left;
  }
  .specialized-card:hover {
    border-color: #5B9BD5;
    background: #172330;
    color: #FFFFFF;
  }
  .probe-group {
    min-width: 0;
    border: 1px solid #303840;
    border-radius: 5px;
    background: #151A1E;
    padding: 7px;
  }
  .probe-group.generated {
    border-color: #47613E;
  }
  .probe-group-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 8px;
    align-items: center;
    margin-bottom: 6px;
  }
  .probe-group-head strong,
  .probe-group-head span,
  .probe-group-head em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }
  .probe-group-head strong {
    color: #F0F4F7;
    font-size: 11px;
  }
  .probe-group-head span {
    color: #B8C7D0;
    font-size: 10px;
  }
  .probe-group-head em {
    grid-column: 1 / -1;
    color: #82B8E5;
    font-size: 10px;
  }
  .probe-group-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    margin-bottom: 6px;
  }
  .probe-samples {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
  }
  .sample-btn {
    min-height: 24px;
    min-width: 0;
    background: #22282D;
    border: 1px solid #39444D;
    border-radius: 4px;
    color: #DDE6EC;
    cursor: pointer;
    font-family: inherit;
    font-size: 10px;
  }
  .sample-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
    background: #24313B;
  }
  .sample-btn:disabled {
    opacity: 0.42;
    cursor: default;
  }
  .animation-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }
  .state-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }
  .coverage-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
    width: 100%;
  }
  .enum-group-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
    width: 100%;
  }
  .animation-card {
    min-width: 0;
    border: 1px solid #303840;
    border-radius: 5px;
    background: #171C20;
    padding: 7px;
  }
  .state-card {
    min-width: 0;
    border: 1px solid #303840;
    border-radius: 5px;
    background: #171C20;
    padding: 7px;
  }
  .coverage-card {
    min-width: 0;
    border: 1px solid #30424D;
    border-radius: 5px;
    background: #161C20;
    padding: 7px;
  }
  .coverage-card.warning {
    border-color: #4B3E2C;
    background: #1D1A16;
  }
  .enum-group-card {
    min-width: 0;
    border: 1px solid #31424C;
    border-radius: 5px;
    background: #151B20;
    padding: 7px;
  }
  .animation-card.active {
    border-color: #5B9BD5;
    background: #172330;
  }
  .state-card.active {
    border-color: #5B9BD5;
    background: #172330;
  }
  .animation-card.disabled {
    opacity: 0.55;
  }
  .state-card.disabled {
    opacity: 0.55;
  }
  .animation-head {
    display: grid;
    grid-template-columns: minmax(78px, 1.2fr) minmax(72px, 1fr) minmax(70px, 0.9fr) 58px 44px;
    gap: 7px;
    align-items: center;
    margin-bottom: 6px;
  }
  .state-head {
    display: grid;
    grid-template-columns: minmax(78px, 1.2fr) minmax(54px, 0.7fr) minmax(80px, 1fr) 58px 44px;
    gap: 7px;
    align-items: center;
    margin-bottom: 6px;
  }
  .state-head strong,
  .state-head span,
  .state-head em,
  .state-patches span,
  .state-patches em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }
  .state-head strong {
    color: #F0F4F7;
    font-size: 11px;
  }
  .state-head span {
    color: #B8C7D0;
    font-size: 10px;
  }
  .state-head em {
    color: #82B8E5;
    font-size: 10px;
  }
  .animation-targets {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .state-patches {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .coverage-head {
    display: grid;
    grid-template-columns: minmax(82px, 1fr) minmax(68px, 0.8fr) minmax(58px, 0.6fr) minmax(86px, 0.9fr);
    gap: 7px;
    align-items: center;
    margin-bottom: 7px;
  }
  .coverage-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    gap: 6px;
  }
  .coverage-option {
    min-width: 0;
    min-height: 52px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    border: 1px solid #303840;
    border-radius: 5px;
    background: #171C20;
    color: #C9D3DA;
    cursor: pointer;
    font-family: inherit;
    font-size: 10px;
    padding: 7px;
    text-align: left;
  }
  .coverage-option.covered {
    border-color: #47613E;
    background: #171D16;
  }
  .coverage-option.missing {
    border-color: #5A3F2E;
    background: #201916;
  }
  .coverage-option:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }
  .enum-group-head {
    display: grid;
    grid-template-columns: minmax(82px, 1fr) minmax(68px, 0.8fr) minmax(86px, 0.9fr) minmax(56px, 0.6fr);
    gap: 7px;
    align-items: center;
    margin-bottom: 7px;
  }
  .enum-zone-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .state-patches span,
  .state-patches em {
    max-width: 150px;
    border: 1px solid #34424D;
    background: #1C252C;
    color: #CDE1EE;
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 9px;
  }
  .state-patches em {
    color: #777;
    background: #1A1A1A;
  }
  .binding-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 100%;
  }
  .binding-row {
    display: grid;
    grid-template-columns: minmax(76px, 1fr) minmax(74px, 1fr) minmax(92px, 1.2fr) minmax(70px, 0.8fr) 44px;
    gap: 7px;
    align-items: center;
    min-height: 28px;
    border: 1px solid #303840;
    border-radius: 5px;
    background: #171C20;
    padding: 4px 6px;
    color: #C9D3DA;
    font-size: 10px;
  }
  .binding-row.disabled {
    opacity: 0.55;
  }
  .api-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 100%;
  }
  .api-row {
    display: grid;
    grid-template-columns: minmax(80px, 1fr) 48px minmax(74px, 1fr) minmax(70px, 0.8fr) 44px;
    gap: 7px;
    align-items: center;
    min-height: 28px;
    border: 1px solid #384330;
    border-radius: 5px;
    background: #171D16;
    padding: 4px 6px;
    color: #C9D3DA;
    font-size: 10px;
  }
  .api-row.output {
    border-color: #30424D;
    background: #161C20;
  }
  .api-row.property {
    border-color: #4B3E2C;
    background: #1D1A16;
  }
  .probe-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }
  .probe-card {
    min-width: 0;
    min-height: 58px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 3px;
    border: 1px solid #303840;
    border-radius: 5px;
    background: #171C20;
    color: #C9D3DA;
    cursor: pointer;
    font-family: inherit;
    font-size: 10px;
    padding: 7px;
    text-align: left;
  }
  .probe-card.generated {
    border-color: #47613E;
  }
  .probe-card:hover {
    border-color: #5B9BD5;
    background: #172330;
    color: #FFF;
  }
  .probe-card strong,
  .probe-card span,
  .probe-card em,
  .probe-card small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }
  .probe-card strong {
    color: #F0F4F7;
  }
  .probe-card em {
    color: #82B8E5;
  }
  .probe-card small {
    color: #8EA3B2;
  }
  .matrix-list,
  .route-list,
  .flow-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 100%;
  }
  .flow-row {
    min-width: 0;
    min-height: 32px;
    display: grid;
    grid-template-columns: minmax(82px, 1fr) 46px 62px minmax(132px, 1.4fr) minmax(112px, 1fr) minmax(142px, auto);
    gap: 7px;
    align-items: center;
    border: 1px solid #303840;
    border-radius: 5px;
    background: #171C20;
    padding: 4px 6px;
    color: #C9D3DA;
    font-size: 10px;
  }
  .flow-row.isolated {
    border-color: #4B3E2C;
    background: #1D1A16;
  }
  .flow-tags {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    overflow: hidden;
  }
  .flow-actions {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }
  .generated-source-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 100%;
  }
  .generated-source-row {
    min-width: 0;
    min-height: 30px;
    display: grid;
    grid-template-columns: minmax(90px, 1fr) 58px 58px minmax(96px, 1.2fr) 64px 54px;
    gap: 7px;
    align-items: center;
    border: 1px solid #47613E;
    border-radius: 5px;
    background: #171D16;
    padding: 4px 6px;
    color: #C9D3DA;
    font-size: 10px;
  }
  .matrix-row,
  .route-row {
    display: grid;
    grid-template-columns: minmax(72px, 1.2fr) minmax(56px, 0.9fr) minmax(44px, 0.7fr) minmax(52px, 0.8fr) minmax(44px, 0.6fr);
    gap: 7px;
    align-items: center;
    min-height: 26px;
    border: 1px solid #303840;
    border-radius: 5px;
    background: #171C20;
    padding: 4px 6px;
    color: #C9D3DA;
    font-size: 10px;
    min-width: 0;
  }
  .route-row {
    grid-template-columns: minmax(72px, 1.2fr) minmax(48px, 0.7fr) minmax(56px, 0.8fr) minmax(64px, 0.9fr) 54px 48px;
  }
  .matrix-row.linked,
  .route-row.linked {
    border-color: #5B9BD5;
    background: #172330;
  }
  .route-row.generated {
    border-color: #47613E;
  }
  .route-row.disabled {
    opacity: 0.55;
  }
  .generated-source-row strong,
  .generated-source-row span,
  .generated-source-row em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }
  .generated-source-row strong {
    color: #F0F4F7;
  }
  .generated-source-row em {
    color: #82B8E5;
  }
  .empty-row {
    color: #777;
    font-size: 10px;
    padding: 5px 0;
  }
  .pill-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    width: 100%;
    min-height: 28px;
    align-items: center;
  }
  .pill-list span,
  .pill-list em {
    border: 1px solid #34424D;
    background: #1C252C;
    color: #CDE1EE;
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 10px;
    font-style: normal;
  }
  .pill-list em {
    color: #777;
    background: #1A1A1A;
  }
  .pill-list.dense {
    align-content: flex-start;
    max-height: 118px;
    overflow: auto;
  }
  .pill-list.dense span,
  .pill-list.dense em {
    border-radius: 5px;
    padding: 3px 6px;
    font-size: 9px;
  }
</style>
