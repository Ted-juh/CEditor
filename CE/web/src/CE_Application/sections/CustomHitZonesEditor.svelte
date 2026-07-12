<script>
  import { getSection, updateControlProperty, removeControlNode } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';
  import ConditionBuilder from './ConditionBuilder.svelte';
  import { createHitZone } from '../utils/customComponentFactory.js';

  let { control = null } = $props();

  // Preset/template cards are an add-time aid (Stage D3): collapsed by
  // default so the editor keeps only live content on screen.
  let showPresetGrid = $state(false);

  let core = $derived(getSection(control, 'Core'));
  let designer = $derived(getSection(control, 'Designer'));
  let zones = $derived(getSection(control, 'HitZones'));
  let behaviors = $derived(getSection(control, 'Behaviors'));
  let channels = $derived(getSection(control, 'ValueChannels'));
  let zoneNames = $derived(Object.keys(zones?._children ?? {}));
  let behaviorNames = $derived(Object.keys(behaviors?._children ?? {}));
  let channelNames = $derived(Object.keys(channels?._children ?? {}));
  let selectedName = $state('');
  let newName = $state('');
  let selected = $derived(zones?._children?.[selectedName] ?? null);
  let zoneEntries = $derived(Object.entries(zones?._children ?? {})
    .sort((left, right) => Number(right?.[1]?.priority ?? 0) - Number(left?.[1]?.priority ?? 0)));
  let enabledCount = $derived(zoneEntries.filter(([, zone]) => zone?.enabled !== false).length);
  let visibleCount = $derived(zoneEntries.filter(([, zone]) => zone?.visibleInEditor !== false).length);
  let generatedCount = $derived(zoneEntries.filter(([, zone]) => zone?.generated === true || zone?.meta?.generated === true).length);
  let detachedCount = $derived(zoneEntries.filter(([, zone]) => zone?.detachedFromGenerator || zone?.meta?.detachedFromGenerator).length);
  let selectedBounds = $derived(normalizePreviewBounds(selected?.bounds));
  let selectedRoute = $derived(routeLabel(selected));
  let selectedSource = $derived(sourceLabel(selected));

  const SHAPES = ['rectangle', 'circle', 'ellipse', 'ring', 'arc', 'polygon', 'generated-grid-cell', 'generated-piano-key'];
  const ACTIONS = ['press', 'toggleValue', 'cycleValue', 'dragValue', 'scroll', 'setValue', 'cellValue', 'noteValue', 'selectCell', 'selectNote', 'focusOnly'];
  const ZONE_TEMPLATES = [
    { id: 'sliderDrag', label: 'Slider Drag', shape: 'rectangle', action: 'dragValue', bounds: { x: 0, y: 34, width: 100, height: 32, unit: 'percent' } },
    { id: 'buttonPress', label: 'Button', shape: 'rectangle', action: 'press', bounds: { x: 10, y: 12, width: 80, height: 76, unit: 'percent' } },
    { id: 'circleSwitch', label: 'Circle Switch', shape: 'circle', action: 'cycleValue', bounds: { x: 35, y: 20, width: 30, height: 60, unit: 'percent' } },
    { id: 'ringArc', label: 'Ring Arc', shape: 'arc', action: 'dragValue', bounds: { x: 12, y: 8, width: 76, height: 84, unit: 'percent' } },
    { id: 'xyPad', label: 'XY Area', shape: 'rectangle', action: 'dragValue', bounds: { x: 6, y: 6, width: 88, height: 88, unit: 'percent' } },
    { id: 'pianoKey', label: 'Piano Key', shape: 'generated-piano-key', action: 'noteValue', bounds: { x: 0, y: 0, width: 12, height: 100, unit: 'percent' } },
    { id: 'scrollArea', label: 'Scroll Area', shape: 'rectangle', action: 'scroll', bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' } },
  ];

  $effect(() => {
    if (designer?.selectedHitZone && zoneNames.includes(designer.selectedHitZone)) {
      selectedName = designer.selectedHitZone;
      return;
    }
    if (!zoneNames.length) {
      selectedName = '';
      return;
    }
    if (!selectedName || !zoneNames.includes(selectedName)) selectedName = zoneNames[0];
  });

  function set(path, value) {
    if (!core?.id || !selectedName) return;
    updateControlProperty(core.id, `HitZones.${selectedName}.${path}`, value);
  }

  function addZone() {
    const name = String(newName ?? '').trim();
    if (!core?.id || !name || zones?._children?.[name]) return;
    updateControlProperty(core.id, `HitZones.${name}`, createHitZone(name, {
      targetBehavior: behaviorNames[0] ?? '',
      targetValueChannel: channelNames[0] ?? '',
    }));
    newName = '';
    selectZone(name);
  }

  function nextZoneName(base) {
    const safeBase = String(base || 'hitZone').replace(/[^a-zA-Z0-9_]/g, '') || 'hitZone';
    let name = safeBase;
    let index = 1;
    const existing = new Set(zoneNames);
    while (existing.has(name)) {
      index += 1;
      name = `${safeBase}_${index}`;
    }
    return name;
  }

  function addTemplate(template) {
    if (!core?.id || !template) return;
    const name = nextZoneName(newName || template.id);
    updateControlProperty(core.id, `HitZones.${name}`, createHitZone(name, {
      shape: template.shape,
      action: template.action,
      bounds: template.bounds,
      targetBehavior: behaviorNames[0] ?? '',
      targetValueChannel: channelNames[0] ?? '',
    }));
    newName = '';
    selectZone(name);
  }

  function selectZone(name) {
    selectedName = name;
    if (!core?.id || !name) return;
    updateControlProperty(core.id, 'Designer.selectedHitZone', name);
    updateControlProperty(core.id, 'Designer.selectedSurfaceKind', 'hitZone');
  }

  function removeZone() {
    if (!core?.id || !selectedName) return;
    removeControlNode(core.id, `HitZones.${selectedName}`);
    selectedName = '';
  }

  function normalizePreviewBounds(bounds = {}) {
    const unit = bounds?.unit ?? 'percent';
    const x = unit === 'percent' ? Number(bounds.x ?? 0) : Number(bounds.x ?? 0) / 2;
    const y = unit === 'percent' ? Number(bounds.y ?? 0) : Number(bounds.y ?? 0) / 1.2;
    const width = unit === 'percent' ? Number(bounds.width ?? 100) : Number(bounds.width ?? 100) / 2;
    const height = unit === 'percent' ? Number(bounds.height ?? 100) : Number(bounds.height ?? 100) / 1.2;
    return {
      left: Math.max(0, Math.min(100, x)),
      top: Math.max(0, Math.min(100, y)),
      width: Math.max(1, Math.min(100, width)),
      height: Math.max(1, Math.min(100, height)),
    };
  }

  function zoneStyle(zone) {
    const bounds = normalizePreviewBounds(zone?.bounds);
    return `left:${bounds.left}%;top:${bounds.top}%;width:${bounds.width}%;height:${bounds.height}%;`;
  }

  function routeLabel(zone) {
    if (!zone) return 'No hit zone selected';
    const behavior = zone.targetBehavior || 'no behavior';
    const channel = zone.targetValueChannel || 'no value';
    return `${zone.action ?? 'press'} -> ${behavior} -> ${channel}`;
  }

  function sourceLabel(zone) {
    if (!zone) return 'manual';
    const detached = zone.detachedFromGenerator || zone.meta?.detachedFromGenerator;
    if (detached) return `detached from ${detached}`;
    const generated = zone.meta?.generatedBy;
    if (zone.generated === true || zone.meta?.generated === true || generated) return `generated by ${generated || 'generator'}`;
    return 'manual';
  }
</script>

{#if zones}
  <PropertySection title="Hit Zones">
    <PropertyCell label="Add" span={3} hint="Create an interaction area independent from visible layers.">
      <input class="val" type="text" bind:value={newName} placeholder="hitZoneName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Add a new hit zone.">
      <button class="action-btn" type="button" onclick={addZone}>Add</button>
    </PropertyCell>
    <PropertyCell label="Selected" span={3} hint="Choose which hit zone to edit.">
      <select class="val" value={selectedName} onchange={(event) => selectZone(event.target.value)}>
        {#each zoneNames as name}
          {@const zone = zones?._children?.[name]}
          <option value={name}>{name}{zone?.generated === true || zone?.meta?.generated === true ? ' · generated' : ''}{zone?.detachedFromGenerator || zone?.meta?.detachedFromGenerator ? ' · detached' : ''}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected hit zone.">
      <button class="action-btn danger" type="button" onclick={removeZone} disabled={!selectedName}>Remove</button>
    </PropertyCell>
  </PropertySection>

  {#if selected}
    <PropertySection title="Hit Zone Map">
      <PropertyCell label="Map" span={2} hint="Scaled overview of authored hit zones.">
        <div class="zone-map">
          <div class="map-stage">
            {#each zoneEntries as [name, zone] (name)}
              <button
                class="map-zone"
                class:selected={selectedName === name}
                class:disabled={zone?.enabled === false}
                class:circle={zone?.shape === 'circle' || zone?.shape === 'ellipse'}
                class:ring={zone?.shape === 'ring' || zone?.shape === 'arc'}
                class:generated={zone?.generated === true || zone?.meta?.generated === true}
                class:detached={zone?.detachedFromGenerator || zone?.meta?.detachedFromGenerator}
                style={zoneStyle(zone)}
                type="button"
                title={routeLabel(zone)}
                onclick={() => selectZone(name)}
              >
                <span>{name}</span>
              </button>
            {/each}
          </div>
        </div>
      </PropertyCell>
      <PropertyCell label="Route" span={2} hint="What the selected zone controls.">
        <div class="route-card">
          <strong>{selectedName}</strong>
          <span>{selectedRoute}</span>
          <small>{selectedSource}</small>
          <div class="route-metrics">
            <em>{zoneEntries.length} zones</em>
            <em>{enabledCount} enabled</em>
            <em>{generatedCount} generated</em>
            <em>{detachedCount} detached</em>
            <em>{visibleCount} shown</em>
            <em>{selected?.priority ?? 0} priority</em>
          </div>
        </div>
      </PropertyCell>
      <PropertyCell label="Templates" span={4} hint="Create common hit-zone shapes with sensible bounds and actions.">
        <button class="preset-disclosure" type="button" onclick={() => showPresetGrid = !showPresetGrid}>{showPresetGrid ? "Hide" : "Show"} hit-zone templates ▾</button>
        {#if showPresetGrid}
        <div class="template-grid">
          {#each ZONE_TEMPLATES as template}
            <button class="template-card" type="button" onclick={() => addTemplate(template)}>
              <span class={`template-icon ${template.shape} ${template.action}`}></span>
              <strong>{template.label}</strong>
              <em>{template.action}</em>
            </button>
          {/each}
        </div>
        {/if}
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Target">
      <PropertyCell label="Enabled" span={1} hint="Enable or disable this interaction zone.">
        <PropertyToggle value={selected.enabled !== false} onchange={() => set('enabled', !(selected.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Editor" span={1} hint="Show this zone in designer/debug overlays.">
        <PropertyToggle value={selected.visibleInEditor !== false} onchange={() => set('visibleInEditor', !(selected.visibleInEditor !== false))} />
      </PropertyCell>
      <PropertyCell label="Shape" span={2} hint="Shape used for hit testing.">
        <select class="val" value={selected.shape ?? 'rectangle'} onchange={(event) => set('shape', event.target.value)}>
          {#each SHAPES as shape}
            <option value={shape}>{shape}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Behavior" span={2} hint="Behavior module this hit zone controls.">
        <select class="val" value={selected.targetBehavior ?? ''} onchange={(event) => set('targetBehavior', event.target.value)}>
          <option value="">none</option>
          {#each behaviorNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Value" span={2} hint="Value channel this hit zone changes.">
        <select class="val" value={selected.targetValueChannel ?? ''} onchange={(event) => set('targetValueChannel', event.target.value)}>
          <option value="">none</option>
          {#each channelNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Action" span={2} hint="Action performed by this zone.">
        <select class="val" value={selected.action ?? 'press'} onchange={(event) => set('action', event.target.value)}>
          {#each ACTIONS as action}
            <option value={action}>{action}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Priority" span={1} hint="Higher priority wins overlapping hit zones.">
        <NumberInput value={selected.priority ?? 0} step={1} onchange={(value) => set('priority', Math.round(value))} />
      </PropertyCell>
      <PropertyCell label="Cursor" span={1} hint="Cursor shown over this zone.">
        <input class="val" type="text" value={selected.cursor ?? 'pointer'} onchange={(event) => set('cursor', event.target.value)} />
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Bounds">
      <PropertyCell label="X" span={1} hint="Zone X in its configured unit.">
        <NumberInput value={selected.bounds?.x ?? 0} step={1} onchange={(value) => set('bounds.x', value)} />
      </PropertyCell>
      <PropertyCell label="Y" span={1} hint="Zone Y in its configured unit.">
        <NumberInput value={selected.bounds?.y ?? 0} step={1} onchange={(value) => set('bounds.y', value)} />
      </PropertyCell>
      <PropertyCell label="W" span={1} hint="Zone width.">
        <NumberInput value={selected.bounds?.width ?? 100} step={1} min={0} onchange={(value) => set('bounds.width', value)} />
      </PropertyCell>
      <PropertyCell label="H" span={1} hint="Zone height.">
        <NumberInput value={selected.bounds?.height ?? 100} step={1} min={0} onchange={(value) => set('bounds.height', value)} />
      </PropertyCell>
      <PropertyCell label="Unit" span={2} hint="Percent keeps zones responsive; px keeps them fixed.">
        <select class="val" value={selected.bounds?.unit ?? 'percent'} onchange={(event) => set('bounds.unit', event.target.value)}>
          <option value="percent">percent</option>
          <option value="px">px</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Condition" span={4} hint="When this zone is active. Leave empty for always.">
        <ConditionBuilder value={selected.condition ?? ''} channels={channelNames} onChange={(next) => set('condition', next)} placeholder="zone always active" />
      </PropertyCell>
      <PropertyCell label="Preview" span={4} hint="Selected zone bounds as percentages of the component area.">
        <div class="selected-bounds">
          <span class="bounds-stage">
            <span
              class:circle={selected.shape === 'circle' || selected.shape === 'ellipse'}
              class:ring={selected.shape === 'ring' || selected.shape === 'arc'}
              style={`left:${selectedBounds.left}%;top:${selectedBounds.top}%;width:${selectedBounds.width}%;height:${selectedBounds.height}%;`}
            ></span>
          </span>
          <strong>{selected.bounds?.unit ?? 'percent'} · x {selected.bounds?.x ?? 0} · y {selected.bounds?.y ?? 0} · w {selected.bounds?.width ?? 100} · h {selected.bounds?.height ?? 100}</strong>
        </div>
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
  .zone-map {
    width: 100%;
    min-height: 154px;
    border: 1px solid #34424D;
    border-radius: 6px;
    background: #101418;
    padding: 8px;
    box-sizing: border-box;
  }
  .map-stage {
    position: relative;
    width: 100%;
    height: 136px;
    border: 1px solid #2E3840;
    border-radius: 5px;
    background:
      linear-gradient(90deg, transparent 24%, rgba(255,255,255,0.08) 24% 25%, transparent 25% 49%, rgba(255,255,255,0.08) 49% 50%, transparent 50% 74%, rgba(255,255,255,0.08) 74% 75%, transparent 75%),
      linear-gradient(180deg, transparent 24%, rgba(255,255,255,0.08) 24% 25%, transparent 25% 49%, rgba(255,255,255,0.08) 49% 50%, transparent 50% 74%, rgba(255,255,255,0.08) 74% 75%, transparent 75%),
      #151B20;
    overflow: hidden;
  }
  .map-zone {
    position: absolute;
    min-width: 14px;
    min-height: 14px;
    border: 1px solid rgba(91, 155, 213, 0.85);
    border-radius: 4px;
    background: rgba(91, 155, 213, 0.22);
    color: #DDEBF6;
    font-family: inherit;
    font-size: 9px;
    cursor: pointer;
    overflow: hidden;
    padding: 2px;
  }
  .map-zone.circle {
    border-radius: 999px;
  }
  .map-zone.ring {
    border-radius: 999px;
    background: rgba(91, 155, 213, 0.08);
    box-shadow: inset 0 0 0 5px rgba(91, 155, 213, 0.22);
  }
  .map-zone.selected {
    border-color: #E5C06B;
    background: rgba(229, 192, 107, 0.26);
    color: #FFF;
    z-index: 5;
  }
  .map-zone.disabled {
    opacity: 0.42;
  }
  .map-zone.generated {
    border-style: dashed;
    background: rgba(112, 192, 143, 0.18);
    border-color: rgba(112, 192, 143, 0.9);
  }
  .map-zone.detached {
    background: rgba(229, 192, 107, 0.16);
    border-color: rgba(229, 192, 107, 0.88);
  }
  .map-zone span {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .route-card {
    width: 100%;
    min-height: 154px;
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
  .route-card strong {
    color: #F4F7FA;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .route-card span {
    color: #9EADB7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .route-card small {
    color: #7FAFCE;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .route-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
    margin-top: auto;
  }
  .route-metrics em {
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
    inset: 9px 4px;
    border-radius: 4px;
    background: #5B9BD5;
  }
  .template-icon.circle::after,
  .template-icon.ellipse::after {
    inset: 6px;
    border-radius: 50%;
  }
  .template-icon.ring::after,
  .template-icon.arc::after {
    inset: 5px;
    border-radius: 50%;
    background: transparent;
    border: 5px solid #5B9BD5;
  }
  .template-icon.scroll::after {
    inset: 5px 8px;
    border-radius: 999px;
    background: linear-gradient(180deg, #5B9BD5 0 45%, #253544 45% 100%);
  }
  .selected-bounds {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    gap: 8px;
    width: 100%;
    align-items: center;
  }
  .bounds-stage {
    position: relative;
    display: block;
    height: 68px;
    border: 1px solid #34424D;
    border-radius: 5px;
    background: #101418;
    overflow: hidden;
  }
  .bounds-stage > span {
    position: absolute;
    display: block;
    min-width: 3px;
    min-height: 3px;
    border: 1px solid #E5C06B;
    border-radius: 4px;
    background: rgba(229, 192, 107, 0.28);
  }
  .bounds-stage > span.circle {
    border-radius: 999px;
  }
  .bounds-stage > span.ring {
    border-radius: 999px;
    background: rgba(229, 192, 107, 0.08);
    box-shadow: inset 0 0 0 5px rgba(229, 192, 107, 0.28);
  }
  .selected-bounds strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #CDE1EE;
    font-size: 10px;
    font-weight: 500;
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
