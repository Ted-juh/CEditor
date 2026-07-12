<script>
  import { applyControlPatch, getSection, updateControlProperty, removeControlNode } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { createBehaviorModule } from '../utils/customComponentFactory.js';

  let { control = null } = $props();

  // Preset/template cards are an add-time aid (Stage D3): collapsed by
  // default so the editor keeps only live content on screen.
  let showPresetGrid = $state(false);

  let core = $derived(getSection(control, 'Core'));
  let behaviors = $derived(getSection(control, 'Behaviors'));
  let channels = $derived(getSection(control, 'ValueChannels'));
  let behaviorNames = $derived(Object.keys(behaviors?._children ?? {}));
  let channelNames = $derived(Object.keys(channels?._children ?? {}));
  let selectedName = $state('');
  let newName = $state('');
  let showAdvancedGeometry = $state(false);
  let selected = $derived(behaviors?._children?.[selectedName] ?? null);
  let behaviorEntries = $derived(Object.entries(behaviors?._children ?? {}));
  let enabledCount = $derived(behaviorEntries.filter(([, behavior]) => behavior?.enabled !== false).length);
  let targetedChannels = $derived([...new Set(behaviorEntries.map(([, behavior]) => behavior?.valueChannel).filter(Boolean))]);
  let selectedChannel = $derived(channels?._children?.[selected?.valueChannel] ?? null);
  let selectedValueChannels = $derived(Array.isArray(selected?.valueChannels) ? selected.valueChannels : [selected?.valueChannel].filter(Boolean));
  let behaviorPreviewClass = $derived(previewClassFor(selected));
  let routeSummary = $derived(routeLabel(selected));
  let recommendedGeometryOptions = $derived(geometryOptionsFor(selected));
  let currentGeometryIsRecommended = $derived(isRecommendedGeometry(selected));

  const TYPE_OPTIONS = ['button', 'toggle', 'radio', 'cycle', 'slider', 'multi-slider', 'three-value-slider', 'dial', 'ring', 'scroll', 'grid', 'piano-bar', 'filmstrip-control', 'xy-pad', 'drag-handle', 'visual-only'];
  const GEOMETRY_OPTIONS = ['none', 'linear', 'vertical', 'circular', 'ring', 'grid', 'xy', 'scroll', 'piano'];
  const DRAG_MODE_OPTIONS = ['auto', 'vertical', 'horizontal', 'circular', 'both'];
  const TYPE_GEOMETRIES = {
    button: ['none'],
    toggle: ['none'],
    radio: ['none'],
    cycle: ['none'],
    slider: ['linear', 'vertical', 'circular', 'ring'],
    'multi-slider': ['linear', 'vertical', 'circular', 'ring'],
    'three-value-slider': ['linear', 'vertical', 'circular', 'ring'],
    dial: ['circular', 'ring'],
    ring: ['ring', 'circular'],
    scroll: ['scroll', 'vertical', 'linear'],
    grid: ['grid'],
    'piano-bar': ['piano', 'linear'],
    'filmstrip-control': ['linear', 'vertical', 'circular'],
    'xy-pad': ['xy', 'grid'],
    'drag-handle': ['linear', 'vertical', 'circular', 'ring'],
    'visual-only': ['none'],
  };
  const BEHAVIOR_TEMPLATES = [
    { id: 'button', label: 'Button', type: 'button', role: 'button', geometry: 'none', interaction: { pointer: true, keyboard: true, wheel: false, snap: true } },
    { id: 'toggle', label: 'Toggle', type: 'toggle', role: 'button', geometry: 'none', interaction: { pointer: true, keyboard: true, wheel: false, snap: true } },
    { id: 'slider', label: 'Slider', type: 'slider', role: 'slider', geometry: 'linear', interaction: { pointer: true, keyboard: true, wheel: true, snap: true } },
    { id: 'dial', label: 'Dial', type: 'dial', role: 'dial', geometry: 'circular', dragMode: 'vertical', interaction: { pointer: true, keyboard: true, wheel: true, snap: true } },
    { id: 'xyPad', label: 'XY Pad', type: 'xy-pad', role: 'xyPad', geometry: 'xy', dragMode: 'both', interaction: { pointer: true, keyboard: false, wheel: false, snap: false } },
    { id: 'pianoBar', label: 'Piano', type: 'piano-bar', role: 'piano', geometry: 'piano', interaction: { pointer: true, keyboard: true, wheel: false, snap: true } },
    { id: 'scroll', label: 'Scroll', type: 'scroll', role: 'viewport', geometry: 'scroll', interaction: { pointer: true, keyboard: true, wheel: true, snap: false } },
    { id: 'filmstrip', label: 'Filmstrip', type: 'filmstrip-control', role: 'filmstrip', geometry: 'linear', interaction: { pointer: true, keyboard: true, wheel: true, snap: true } },
  ];

  $effect(() => {
    if (!behaviorNames.length) {
      selectedName = '';
      return;
    }
    if (!selectedName || !behaviorNames.includes(selectedName)) selectedName = behaviorNames[0];
  });

  function set(path, value) {
    if (!core?.id || !selectedName) return;
    updateControlProperty(core.id, `Behaviors.${selectedName}.${path}`, value);
  }

  function setSelectedPatch(patch = {}) {
    if (!core?.id || !selectedName) return;
    applyControlPatch(core.id, Object.fromEntries(
      Object.entries(patch).map(([path, value]) => [`Behaviors.${selectedName}.${path}`, value])
    ));
  }

  function setValueChannelAt(index, channelName) {
    if (!core?.id || !selectedName) return;
    const nextChannels = [...selectedValueChannels];
    nextChannels[index] = channelName;
    const patch = {
      valueChannels: nextChannels.filter(Boolean),
    };
    if (index === 0) patch.valueChannel = channelName;
    setSelectedPatch(patch);
  }

  function addBehavior() {
    const name = String(newName ?? '').trim();
    if (!core?.id || !name || behaviors?._children?.[name]) return;
    updateControlProperty(core.id, `Behaviors.${name}`, createBehaviorModule(name, {
      valueChannel: channelNames[0] ?? 'mainValue',
    }));
    newName = '';
    selectedName = name;
  }

  function nextBehaviorName(base) {
    const safeBase = String(base || 'behavior').replace(/[^a-zA-Z0-9_]/g, '') || 'behavior';
    let name = safeBase;
    let index = 1;
    const existing = new Set(behaviorNames);
    while (existing.has(name)) {
      index += 1;
      name = `${safeBase}_${index}`;
    }
    return name;
  }

  function applyTemplate(template) {
    if (!core?.id || !template) return;
    const name = selectedName || nextBehaviorName(newName || template.id);
    const valueChannel = selected?.valueChannel || channelNames[0] || 'mainValue';
    const patch = {
      [`Behaviors.${name}`]: {
        ...(selected ?? createBehaviorModule(name, {})),
        name,
        type: template.type,
        role: template.role,
        geometry: template.geometry,
        dragMode: template.dragMode ?? selected?.dragMode ?? 'auto',
        enabled: true,
        valueChannel,
        valueChannels: template.type === 'xy-pad'
          ? [valueChannel, channelNames.find((channel) => channel !== valueChannel)].filter(Boolean)
          : [valueChannel].filter(Boolean),
        interaction: {
          pointer: true,
          keyboard: true,
          wheel: false,
          snap: true,
          ...(selected?.interaction ?? {}),
          ...template.interaction,
        },
        description: selected?.description || `${template.label} behavior controlling ${valueChannel}.`,
      },
    };
    applyControlPatch(core.id, patch);
    newName = '';
    selectedName = name;
  }

  function removeBehavior() {
    if (!core?.id || !selectedName) return;
    removeControlNode(core.id, `Behaviors.${selectedName}`);
    selectedName = '';
  }

  function routeLabel(behavior) {
    if (!behavior) return 'No behavior selected';
    const channel = behavior.valueChannel || 'no value';
    return `${behavior.type ?? 'behavior'} -> ${channel} (${behavior.geometry ?? 'none'})`;
  }

  function typeKey(behaviorOrType) {
    return String(typeof behaviorOrType === 'string' ? behaviorOrType : behaviorOrType?.type ?? 'slider').trim().toLowerCase() || 'slider';
  }

  function recommendedGeometriesFor(type) {
    return TYPE_GEOMETRIES[typeKey(type)] ?? ['linear'];
  }

  function defaultGeometryFor(type) {
    return recommendedGeometriesFor(type)[0] ?? 'linear';
  }

  function isRecommendedGeometry(behavior) {
    const geometry = String(behavior?.geometry ?? defaultGeometryFor(behavior)).trim().toLowerCase();
    return recommendedGeometriesFor(behavior).includes(geometry);
  }

  function geometryOptionsFor(behavior) {
    if (showAdvancedGeometry) return GEOMETRY_OPTIONS;
    const recommended = recommendedGeometriesFor(behavior);
    const current = String(behavior?.geometry ?? '').trim().toLowerCase();
    return current && GEOMETRY_OPTIONS.includes(current) && !recommended.includes(current)
      ? [...recommended, current]
      : recommended;
  }

  function handleTypeChange(nextType) {
    const nextGeometry = showAdvancedGeometry
      ? (selected?.geometry ?? defaultGeometryFor(nextType))
      : defaultGeometryFor(nextType);
    setSelectedPatch({
      type: nextType,
      geometry: nextGeometry,
    });
  }

  function previewClassFor(behavior) {
    const type = String(behavior?.type ?? 'slider');
    if (type === 'xy-pad' || type === 'grid') return 'grid';
    if (type === 'piano-bar') return 'piano';
    if (type === 'dial' || type === 'ring') return 'dial';
    if (type === 'toggle' || type === 'cycle' || type === 'button') return 'button';
    if (type === 'scroll') return 'scroll';
    if (type === 'filmstrip-control') return 'filmstrip';
    if (type.includes('slider') || type === 'drag-handle') return 'slider';
    return 'visual';
  }
</script>

{#if behaviors}
  <PropertySection title="Behavior Modules">
    <PropertyCell label="Add" span={3} hint="Create a behavior module such as slider, button, grid, piano bar, scroll, or filmstrip control.">
      <input class="val" type="text" bind:value={newName} placeholder="behaviorName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Add a behavior module.">
      <button class="action-btn" type="button" onclick={addBehavior}>Add</button>
    </PropertyCell>
    <PropertyCell label="Selected" span={3} hint="Choose which behavior module to edit.">
      <select class="val" bind:value={selectedName}>
        {#each behaviorNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected behavior.">
      <button class="action-btn danger" type="button" onclick={removeBehavior} disabled={!selectedName}>Remove</button>
    </PropertyCell>
  </PropertySection>

  {#if selected}
    <PropertySection title="Behavior Preview">
      <PropertyCell label="Preview" span={2} hint="Visual sketch of how this behavior responds to input.">
        <div class={`behavior-preview ${behaviorPreviewClass}`} class:disabled={selected?.enabled === false}>
          <span class="preview-stage">
            <span class="preview-item a"></span>
            <span class="preview-item b"></span>
            <span class="preview-item c"></span>
            <span class="preview-item d"></span>
          </span>
        </div>
      </PropertyCell>
      <PropertyCell label="Route" span={2} hint="Behavior type, target channel, and interaction support.">
        <div class="behavior-card">
          <strong>{selectedName}</strong>
          <span>{routeSummary}</span>
          <div class="behavior-metrics">
            <em>{behaviorEntries.length} modules</em>
            <em>{enabledCount} enabled</em>
            <em>{targetedChannels.length} channels</em>
            <em>{selectedChannel?.type ?? 'value'}</em>
          </div>
        </div>
      </PropertyCell>
      <PropertyCell label="Templates" span={4} hint="Apply common behavior types without guessing compatible geometry and interaction settings.">
        <button class="preset-disclosure" type="button" onclick={() => showPresetGrid = !showPresetGrid}>{showPresetGrid ? "Hide" : "Show"} behavior templates ▾</button>
        {#if showPresetGrid}
        <div class="template-grid">
          {#each BEHAVIOR_TEMPLATES as template}
            <button class="template-card" type="button" onclick={() => applyTemplate(template)}>
              <span class={`template-icon ${previewClassFor(template)}`}></span>
              <strong>{template.label}</strong>
              <em>{template.geometry}</em>
            </button>
          {/each}
        </div>
        {/if}
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Definition">
      <PropertyCell label="Enabled" span={1} hint="Enable or disable this internal behavior module.">
        <PropertyToggle value={selected.enabled !== false} onchange={() => set('enabled', !(selected.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Type" span={2} hint="Behavior type decides what interaction rules are available.">
        <select class="val" value={selected.type ?? 'slider'} onchange={(event) => handleTypeChange(event.target.value)}>
          {#each TYPE_OPTIONS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Geometry" span={1} hint={showAdvancedGeometry ? 'Advanced mode exposes every geometry pairing.' : 'Filtered to the sensible geometry choices for this behavior type.'}>
        <select class="val" value={selected.geometry ?? 'linear'} onchange={(event) => set('geometry', event.target.value)}>
          {#each recommendedGeometryOptions as option}
            <option value={option}>{option}{!showAdvancedGeometry && !recommendedGeometriesFor(selected).includes(option) ? ' (custom)' : ''}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Advanced Geo" span={1} hint="Show every geometry option for experimental/custom behavior pairings.">
        <PropertyToggle value={showAdvancedGeometry} active={!currentGeometryIsRecommended} onchange={() => showAdvancedGeometry = !showAdvancedGeometry} />
      </PropertyCell>
      <PropertyCell label="Role" span={2} hint="Semantic role for runtime, debugging, and future accessibility.">
        <input class="val" type="text" value={selected.role ?? ''} onchange={(event) => set('role', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Channel" span={2} hint="Primary value channel changed by this behavior.">
        <select class="val" value={selected.valueChannel ?? ''} onchange={(event) => set('valueChannel', event.target.value)}>
          <option value="">none</option>
          {#each channelNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Interaction">
      <PropertyCell label="Pointer" span={1} hint="Allow pointer or touch input.">
        <PropertyToggle value={selected.interaction?.pointer !== false} onchange={() => set('interaction.pointer', !(selected.interaction?.pointer !== false))} />
      </PropertyCell>
      <PropertyCell label="Keyboard" span={1} hint="Allow keyboard input.">
        <PropertyToggle value={selected.interaction?.keyboard !== false} onchange={() => set('interaction.keyboard', !(selected.interaction?.keyboard !== false))} />
      </PropertyCell>
      <PropertyCell label="Wheel" span={1} hint="Allow mouse wheel input.">
        <PropertyToggle value={selected.interaction?.wheel === true} onchange={() => set('interaction.wheel', !(selected.interaction?.wheel === true))} />
      </PropertyCell>
      <PropertyCell label="Snap" span={1} hint="Use channel snap/tick/grid rules.">
        <PropertyToggle value={selected.interaction?.snap !== false} onchange={() => set('interaction.snap', !(selected.interaction?.snap !== false))} />
      </PropertyCell>
      <PropertyCell label="Reverse Mouse" span={2} hint="Invert pointer and wheel value direction for this behavior module while leaving the artwork unchanged.">
        <PropertyToggle value={selected.reverseMouseDirection === true} onchange={() => set('reverseMouseDirection', !(selected.reverseMouseDirection === true))} />
      </PropertyCell>
      <PropertyCell label="Drag Mode" span={2} hint="How pointer movement changes value. Auto follows geometry; vertical is the usual knob/plugin drag.">
        <select class="val" value={selected.dragMode ?? 'auto'} onchange={(event) => set('dragMode', event.target.value)}>
          {#each DRAG_MODE_OPTIONS as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Sensitivity" span={2} hint="Multiplier for vertical, horizontal, or both drag modes. 1 means one control height/width covers the full value range.">
        <input class="val" type="number" min="0.01" max="10" step="0.05" value={selected.dragSensitivity ?? 1} onchange={(event) => set('dragSensitivity', Math.max(0.01, Math.min(10, Number(event.target.value) || 1)))} />
      </PropertyCell>
    </PropertySection>

    {#if selected.type === 'xy-pad' || selected.role === 'xyPad' || selected.role === 'xy-pad' || selected.geometry === 'xy' || selected.geometry === 'grid'}
      <PropertySection title="XY Semantics">
        <PropertyCell label="X Channel" span={2} hint="Horizontal value controlled by this XY behavior.">
          <select class="val" value={selectedValueChannels[0] ?? selected.valueChannel ?? ''} onchange={(event) => setValueChannelAt(0, event.target.value)}>
            <option value="">none</option>
            {#each channelNames as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Y Channel" span={2} hint="Vertical value controlled by this XY behavior. Generated grid hit zones can target this as the Y value channel.">
          <select class="val" value={selectedValueChannels[1] ?? ''} onchange={(event) => setValueChannelAt(1, event.target.value)}>
            <option value="">none</option>
            {#each channelNames as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Pointer Model" span={2} hint="Both axes update together from the pointer position in the target hit zone.">
          <div class="semantic-card">
            <strong>2-axis pointer</strong>
            <span>{selectedValueChannels[0] ?? selected.valueChannel ?? '-'} / {selectedValueChannels[1] ?? '-'}</span>
          </div>
        </PropertyCell>
        <PropertyCell label="Recommended" span={2} hint="Best defaults for an XY pad.">
          <button class="action-btn" type="button" onclick={() => setSelectedPatch({ type: 'xy-pad', role: 'xyPad', geometry: 'xy', dragMode: 'both', interaction: { ...(selected.interaction ?? {}), pointer: true, keyboard: false, wheel: false, snap: false } })}>
            Apply XY Defaults
          </button>
        </PropertyCell>
      </PropertySection>
    {/if}

    <PropertySection title="Notes">
      <PropertyCell label="Purpose" span={4} hint="Short design note for collaborators and downloaded components.">
        <textarea class="val code" rows="4" value={selected.description ?? ''} onchange={(event) => set('description', event.target.value)}></textarea>
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
  .val.code { font-family: Consolas, 'Courier New', monospace; line-height: 1.4; }
  .val:focus { border-color: #5B9BD5; }
  .semantic-card {
    display: grid;
    gap: 3px;
    min-height: 36px;
    padding: 7px;
    border: 1px solid #34424D;
    border-radius: 5px;
    background: #151C22;
  }
  .semantic-card strong,
  .semantic-card span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .semantic-card strong {
    color: #E7F4FB;
    font-size: 11px;
  }
  .semantic-card span {
    color: #83BFEA;
    font-size: 10px;
  }
  .behavior-preview {
    position: relative;
    width: 100%;
    min-height: 130px;
    border: 1px solid #34424D;
    border-radius: 6px;
    background: #101418;
    overflow: hidden;
  }
  .behavior-preview.disabled { opacity: 0.48; }
  .preview-stage,
  .preview-item {
    position: absolute;
    display: block;
  }
  .preview-stage {
    inset: 12px;
  }
  .preview-item {
    background: #5B9BD5;
    border: 1px solid rgba(255, 255, 255, 0.24);
  }
  .behavior-preview.slider .a {
    left: 8%;
    right: 8%;
    top: 54px;
    height: 8px;
    border-radius: 999px;
    background: #26323B;
  }
  .behavior-preview.slider .b {
    left: 58%;
    top: 44px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #E6EEF4;
  }
  .behavior-preview.dial .a {
    left: 50%;
    top: 50%;
    width: 88px;
    height: 88px;
    box-sizing: border-box;
    border-radius: 50%;
    background: transparent;
    border: 8px solid #26323B;
    transform: translate(-50%, -50%);
  }
  .behavior-preview.dial .b {
    left: 50%;
    top: 50%;
    width: 8px;
    height: 44px;
    border-radius: 999px;
    border: 0;
    transform-origin: 50% 86%;
    transform: translate(-50%, -86%) rotate(42deg);
    background: #E5C06B;
  }
  .behavior-preview.grid .a {
    inset: 6px;
    border: 0;
    background:
      repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 1px, transparent 1px calc(100% / 6)),
      repeating-linear-gradient(180deg, rgba(255,255,255,0.22) 0 1px, transparent 1px calc(100% / 6)),
      #182029;
  }
  .behavior-preview.grid .b {
    left: 62%;
    top: 28%;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #E5C06B;
  }
  .behavior-preview.piano .a {
    left: 5px;
    right: 5px;
    bottom: 7px;
    height: 70px;
    border-radius: 5px;
    border-color: #AAB4BC;
    background:
      linear-gradient(90deg,
        #EDEDE8 0 13.6%,
        #B8C0C7 13.6% 14.3%,
        #EDEDE8 14.3% 27.9%,
        #B8C0C7 27.9% 28.6%,
        #EDEDE8 28.6% 42.2%,
        #B8C0C7 42.2% 42.9%,
        #EDEDE8 42.9% 56.5%,
        #B8C0C7 56.5% 57.2%,
        #EDEDE8 57.2% 70.8%,
        #B8C0C7 70.8% 71.5%,
        #EDEDE8 71.5% 85.1%,
        #B8C0C7 85.1% 85.8%,
        #EDEDE8 85.8% 100%);
    box-shadow: inset 0 -12px 16px rgba(70, 75, 80, 0.20);
  }
  .behavior-preview.piano .b {
    left: 5px;
    right: 5px;
    top: 24px;
    height: 45px;
    border: 0;
    background:
      linear-gradient(90deg,
        transparent 0 9.5%,
        #070809 9.5% 18.2%,
        transparent 18.2% 23.8%,
        #070809 23.8% 32.5%,
        transparent 32.5% 52.5%,
        #070809 52.5% 61.2%,
        transparent 61.2% 66.8%,
        #070809 66.8% 75.5%,
        transparent 75.5% 81.1%,
        #070809 81.1% 89.8%,
        transparent 89.8% 100%);
    filter: drop-shadow(0 2px 1px rgba(0,0,0,0.35));
  }
  .behavior-preview.piano .c {
    display: none;
  }
  .behavior-preview.piano .d {
    left: 10px;
    right: 10px;
    bottom: 3px;
    height: 3px;
    border: 0;
    border-radius: 999px;
    background: #5B9BD5;
  }
  .behavior-preview.button .a {
    left: 22%;
    right: 22%;
    top: 35px;
    height: 48px;
    border-radius: 8px;
    background: #E6EEF4;
  }
  .behavior-preview.button .b {
    left: 28%;
    right: 28%;
    top: 42px;
    height: 34px;
    border-radius: 7px;
    background: rgba(91, 155, 213, 0.35);
  }
  .behavior-preview.scroll .a {
    inset: 8px 24px 8px 8px;
    border-radius: 5px;
    background: repeating-linear-gradient(180deg, #26323B 0 14px, #1A222A 14px 28px);
  }
  .behavior-preview.scroll .b {
    right: 8px;
    top: 18px;
    width: 8px;
    height: 54px;
    border-radius: 999px;
    background: #5B9BD5;
  }
  .behavior-preview.filmstrip .a {
    left: calc(50% - 22px);
    top: 12px;
    width: 44px;
    height: 86px;
    border-radius: 5px;
    background: repeating-linear-gradient(180deg, #5B9BD5 0 8px, #192633 8px 14px);
  }
  .behavior-preview.visual .a {
    left: 24%;
    right: 24%;
    top: 38px;
    height: 42px;
    border-radius: 8px;
    background: #34424D;
  }
  .behavior-card {
    width: 100%;
    min-height: 130px;
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
  .behavior-card strong,
  .behavior-card span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .behavior-card strong { color: #F4F7FA; font-size: 12px; }
  .behavior-card span { color: #9EADB7; }
  .behavior-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    margin-top: auto;
  }
  .behavior-metrics em {
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
  .template-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }
  .template-card {
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
  .template-card:hover {
    border-color: #5B9BD5;
    background: #202B34;
  }
  .template-card strong,
  .template-card em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .template-card strong {
    font-size: 10px;
    color: #F4F7FA;
  }
  .template-card em {
    font-size: 9px;
    font-style: normal;
    color: #7FAFCE;
  }
  .template-icon {
    grid-row: 1 / 3;
    position: relative;
    width: 30px;
    height: 30px;
    border: 1px solid #34424D;
    border-radius: 5px;
    background: #101418;
  }
  .template-icon::after {
    content: '';
    position: absolute;
    inset: 11px 5px;
    border-radius: 999px;
    background: #5B9BD5;
  }
  .template-icon.dial::after {
    inset: 5px;
    border-radius: 50%;
    background: transparent;
    border: 5px solid #5B9BD5;
  }
  .template-icon.grid::after {
    inset: 5px;
    border-radius: 2px;
    background:
      linear-gradient(90deg, transparent 48%, #101418 48% 54%, transparent 54%),
      linear-gradient(180deg, transparent 48%, #101418 48% 54%, transparent 54%),
      #5B9BD5;
  }
  .template-icon.piano::after {
    inset: 6px 3px;
    border-radius: 2px;
    background: repeating-linear-gradient(90deg, #EDEDE8 0 5px, #111 5px 7px);
  }
  .template-icon.button::after {
    inset: 8px 5px;
    border-radius: 7px;
  }
  .template-icon.scroll::after,
  .template-icon.filmstrip::after {
    inset: 5px 9px;
    border-radius: 4px;
    background: linear-gradient(180deg, #5B9BD5 0 45%, #253544 45% 100%);
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
