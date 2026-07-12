<script>
  // Interact tab (restructure Stage C): Channels + Behaviors + Hit Zones as
  // one editor over *clusters* — the unit Make Interactive creates. Membership
  // is the wiring; the target dropdowns leave the common path (they remain in
  // the Advanced flat lists below, which embed the original three editors).
  import { getSection, updateControlProperty, applyControlPatch } from '../stores/controls.js';
  import { creatorMode } from '../stores/creatorMode.js';
  import { deriveInteractClusters } from '../utils/customComponentClusters.js';
  import { buildInteractivePatch } from '../utils/customComponentScaffold.js';
  import { listInteractiveArchetypes } from '../utils/customComponentFactory.js';
  import { numberOr } from '../utils/primitives.js';
  import PropertySection from '../properties/PropertySection.svelte';
  import CustomValueChannelsEditor from './CustomValueChannelsEditor.svelte';
  import CustomBehaviorsEditor from './CustomBehaviorsEditor.svelte';
  import CustomHitZonesEditor from './CustomHitZonesEditor.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let designer = $derived(getSection(control, 'Designer'));
  let transform = $derived(getSection(control, 'Transform'));
  let channels = $derived(getSection(control, 'ValueChannels'));
  let behaviors = $derived(getSection(control, 'Behaviors'));
  let hitZones = $derived(getSection(control, 'HitZones'));
  let derivation = $derived(deriveInteractClusters(control));
  let clusters = $derived(derivation.clusters);
  let orphans = $derived(derivation.orphans);
  let hasOrphans = $derived(orphans.channels.length + orphans.behaviors.length + orphans.zones.length > 0);

  const ARCHETYPES = listInteractiveArchetypes();
  const ARCHETYPE_FRAMES = {
    dial: { width: 72, height: 72 },
    slider: { width: 140, height: 22 },
    handle: { width: 24, height: 24 },
    button: { width: 64, height: 28 },
    toggle: { width: 52, height: 26 },
    xy: { width: 110, height: 110 },
    range: { width: 140, height: 22 },
  };

  let addMenuOpen = $state(false);
  let openClusters = $state({});

  // Canvas → panel sync (C6): the cluster owning the canvas-selected channel
  // or hit zone auto-expands.
  let canvasFocusedClusterId = $derived.by(() => {
    const channel = String(designer?.selectedValueChannel ?? '').trim();
    const zone = String(designer?.selectedHitZone ?? '').trim();
    for (const cluster of clusters) {
      if (channel && cluster.channels.includes(channel)) return cluster.id;
      if (zone && cluster.zones.some((entry) => entry.name === zone)) return cluster.id;
    }
    return '';
  });

  function isOpen(cluster) {
    if (cluster.id in openClusters) return openClusters[cluster.id];
    return cluster.id === canvasFocusedClusterId || clusters.length <= 2;
  }

  function toggleCluster(cluster) {
    openClusters = { ...openClusters, [cluster.id]: !isOpen(cluster) };
    if (!core?.id) return;
    // Panel → canvas sync (C6): focusing a cluster selects its primary
    // channel and lights the grab-area halos.
    applyControlPatch(core.id, {
      'Designer.selectedValueChannel': cluster.channels[0] ?? '',
      'Designer.preview.showHitZones': true,
    });
  }

  function selectZoneOnCanvas(zoneName) {
    if (!core?.id) return;
    applyControlPatch(core.id, {
      'Designer.selectedHitZone': zoneName,
      'Designer.selectedSurfaceKind': 'hitZone',
      'Designer.preview.showHitZones': true,
    });
  }

  function addInteractive(archetypeId) {
    addMenuOpen = false;
    if (!core?.id) return;
    const size = ARCHETYPE_FRAMES[archetypeId] ?? { width: 80, height: 40 };
    const artboardWidth = Math.max(1, numberOr(transform?.width, 220));
    const artboardHeight = Math.max(1, numberOr(transform?.height, 120));
    const frame = {
      x: Math.max(0, Math.round((artboardWidth - size.width) / 2)),
      y: Math.max(0, Math.round((artboardHeight - size.height) / 2)),
      width: size.width,
      height: size.height,
    };
    const built = buildInteractivePatch(control, archetypeId, frame);
    if (!built) return;
    applyControlPatch(core.id, {
      ...built.patch,
      'Designer.selectedLayer': built.partName,
      'Designer.selectedValueChannel': `${built.base}Value`,
      'Designer.preview.showHitZones': true,
    });
    openClusters = {};
  }

  function setChannelField(name, field, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `ValueChannels.${name}.${field}`, value);
  }

  function setBehaviorField(name, field, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Behaviors.${name}.${field}`, value);
  }

  function setZoneField(name, field, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `HitZones.${name}.${field}`, value);
  }

  function channelOf(name) {
    return channels?._children?.[name] ?? null;
  }

  function behaviorOf(name) {
    return behaviors?._children?.[name] ?? null;
  }

  function zoneOf(name) {
    return hitZones?._children?.[name] ?? null;
  }

  function numeric(event, fallback = 0) {
    const value = Number(event.currentTarget.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function zoneSourceLabel(zone) {
    const source = String(zone?.source ?? 'independent');
    if (source === 'face') return 'whole face';
    if (source.startsWith('part:')) return `follows ${source.slice('part:'.length)}`;
    return 'own bounds';
  }

  const GEOMETRY_OPTIONS = ['none', 'linear', 'vertical', 'circular', 'xy', 'grid', 'piano', 'scroll'];
  const DRAG_MODES = ['auto', 'horizontal', 'vertical', 'both'];
</script>

<div class="interact-editor">
  <div class="interact-head">
    <div class="interact-summary">
      <strong>{clusters.length} interactive control{clusters.length === 1 ? '' : 's'}</strong>
      <span>value + behavior + grab areas, edited as one card</span>
    </div>
    <div class="add-host">
      <button type="button" class="add-btn" aria-haspopup="menu" aria-expanded={addMenuOpen} onclick={() => { addMenuOpen = !addMenuOpen; }}>
        + Make Interactive ▾
      </button>
      {#if addMenuOpen}
        <div class="add-menu" role="menu" aria-label="Interactive archetypes">
          {#each ARCHETYPES as archetype (archetype.id)}
            <button type="button" role="menuitem" onclick={() => addInteractive(archetype.id)}>{archetype.label}</button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  {#each clusters as cluster (cluster.id)}
    <div class="cluster-card" class:open={isOpen(cluster)} class:canvas-focus={cluster.id === canvasFocusedClusterId}>
      <button type="button" class="cluster-head" onclick={() => toggleCluster(cluster)}>
        <strong>{cluster.label}</strong>
        <span>
          {cluster.channels.length > 1 ? `${cluster.channels.length} channels` : (channelOf(cluster.channels[0])?.type ?? 'float')}
          · {cluster.behaviors.map((name) => behaviorOf(name)?.type ?? 'behavior').join(' + ')}
          · {cluster.zones.length} grab area{cluster.zones.length === 1 ? '' : 's'}
        </span>
        <em>{isOpen(cluster) ? '−' : '+'}</em>
      </button>

      {#if isOpen(cluster)}
        <div class="cluster-body">
          <div class="cluster-group">
            <div class="group-title">Value</div>
            {#each cluster.channels as channelName (channelName)}
              {@const channel = channelOf(channelName)}
              {#if channel}
                <div class="field-row">
                  <span class="field-name">{channelName}</span>
                  <label><em>Min</em><input type="number" value={numberOr(channel.min, 0)} onchange={(event) => setChannelField(channelName, 'min', numeric(event))} /></label>
                  <label><em>Max</em><input type="number" value={numberOr(channel.max, 1)} onchange={(event) => setChannelField(channelName, 'max', numeric(event, 1))} /></label>
                  <label><em>Step</em><input type="number" step="any" value={numberOr(channel.step, 0.01)} onchange={(event) => setChannelField(channelName, 'step', numeric(event, 0.01))} /></label>
                  <label><em>Default</em><input type="number" step="any" value={numberOr(channel.defaultValue, 0)} onchange={(event) => setChannelField(channelName, 'defaultValue', numeric(event))} /></label>
                </div>
              {/if}
            {/each}
          </div>

          <div class="cluster-group">
            <div class="group-title">Behavior</div>
            {#each cluster.behaviors as behaviorName (behaviorName)}
              {@const behavior = behaviorOf(behaviorName)}
              {#if behavior}
                <div class="field-row">
                  <span class="field-name">{behaviorName}</span>
                  <label><em>Type</em><span class="readout">{behavior.type ?? 'behavior'}</span></label>
                  <label><em>Geometry</em>
                    <select value={behavior.geometry ?? 'linear'} onchange={(event) => setBehaviorField(behaviorName, 'geometry', event.currentTarget.value)}>
                      {#each GEOMETRY_OPTIONS as option (option)}<option value={option}>{option}</option>{/each}
                    </select>
                  </label>
                  <label><em>Drag</em>
                    <select value={behavior.dragMode ?? 'auto'} onchange={(event) => setBehaviorField(behaviorName, 'dragMode', event.currentTarget.value)}>
                      {#each DRAG_MODES as option (option)}<option value={option}>{option}</option>{/each}
                    </select>
                  </label>
                </div>
              {/if}
            {/each}
          </div>

          <div class="cluster-group">
            <div class="group-title">Grab areas</div>
            {#each cluster.zones as entry (entry.name)}
              {@const zone = zoneOf(entry.name)}
              <div class="field-row zone-row" class:generated={entry.generated}>
                <button type="button" class="field-name zone-jump" title="Select on canvas (shows the grab-area halo)" onclick={() => selectZoneOnCanvas(entry.name)}>
                  {entry.name}
                </button>
                {#if entry.generated}
                  <span class="tag">generated</span>
                {:else if zone}
                  <span class="readout wide">{zoneSourceLabel(zone)}</span>
                  <label><em>Grow</em><input type="number" value={numberOr(zone.inflate?.x, 0)} title="Inflate the grab area (px each side)" onchange={(event) => { const value = numeric(event); setZoneField(entry.name, 'inflate', { x: value, y: value, unit: 'px' }); }} /></label>
                  <label><em>Min px</em><input type="number" value={numberOr(zone.minTouch, 0)} title="Minimum touch size (finger floor)" onchange={(event) => setZoneField(entry.name, 'minTouch', numeric(event))} /></label>
                {/if}
                {#if entry.shared}<span class="tag shared">shared</span>{/if}
              </div>
            {:else}
              <div class="empty-note">No grab areas — this control cannot receive input yet.</div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="empty-card">
      <strong>Nothing is interactive yet.</strong>
      <span>Use “+ Make Interactive” (or draw with the surface’s Interactive tool) to scaffold a wired control — value, behavior, and grab area in one step.</span>
    </div>
  {/each}

  {#if hasOrphans}
    <PropertySection title="Not wired up">
      <div class="orphans">
        {#each orphans.channels as name (name)}
          <div class="orphan-row"><span class="tag">channel</span><strong>{name}</strong><em>no behavior drives it (fine for output-only values)</em></div>
        {/each}
        {#each orphans.behaviors as name (name)}
          <div class="orphan-row warn"><span class="tag">behavior</span><strong>{name}</strong><em>its value channel is missing</em></div>
        {/each}
        {#each orphans.zones as name (name)}
          <div class="orphan-row warn"><span class="tag">zone</span><strong>{name}</strong><em>targets a missing behavior/channel</em></div>
        {/each}
      </div>
    </PropertySection>
  {/if}

  {#if $creatorMode === 'advanced'}
    <!-- Advanced escape hatch (C4): the original flat list editors, target
         dropdowns and all. Everything possible before stays possible. -->
    <PropertySection title="Channels (flat list)">
      <div class="flat-embed"><CustomValueChannelsEditor {control} /></div>
    </PropertySection>
    <PropertySection title="Behaviors (flat list)">
      <div class="flat-embed"><CustomBehaviorsEditor {control} /></div>
    </PropertySection>
    <PropertySection title="Hit Zones (flat list)">
      <div class="flat-embed"><CustomHitZonesEditor {control} /></div>
    </PropertySection>
  {:else}
    <div class="advanced-hint">Cross-wired setups (one zone driving two behaviors, shared channels) are edited in the flat lists — switch the footer toggle to Advanced.</div>
  {/if}
</div>

<style>
  .interact-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .interact-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .interact-summary {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .interact-summary strong {
    color: #E5EDF6;
    font-size: 12px;
  }

  .interact-summary span {
    color: #8A97A3;
    font-size: 10px;
  }

  .add-host {
    position: relative;
  }

  .add-btn {
    background: #142538;
    border: 1px solid #335371;
    border-radius: 4px;
    color: #DDEEFF;
    font-size: 11px;
    font-weight: 700;
    font-family: inherit;
    padding: 6px 10px;
    cursor: pointer;
  }

  .add-btn:hover {
    border-color: #5B9BD5;
    background: #20344B;
  }

  .add-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    min-width: 130px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px;
    border: 1px solid #3B4652;
    border-radius: 5px;
    background: #151B21;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.4);
  }

  .add-menu button {
    background: transparent;
    border: none;
    border-radius: 3px;
    color: #D5DEE7;
    font-size: 11px;
    font-family: inherit;
    text-align: left;
    padding: 5px 8px;
    cursor: pointer;
  }

  .add-menu button:hover {
    background: #24303C;
    color: #FFF;
  }

  .cluster-card {
    border: 1px solid #2E3A44;
    border-radius: 6px;
    background: #191E23;
    overflow: hidden;
  }

  .cluster-card.canvas-focus {
    border-color: rgba(45, 212, 191, 0.55);
  }

  .cluster-head {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: inherit;
    font-family: inherit;
    padding: 8px 10px;
    cursor: pointer;
    text-align: left;
  }

  .cluster-head:hover {
    background: #1E252C;
  }

  .cluster-head strong {
    color: #E9F1F8;
    font-size: 12px;
  }

  .cluster-head span {
    color: #8A97A3;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cluster-head em {
    color: #6E7B87;
    font-style: normal;
    font-size: 13px;
  }

  .cluster-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 2px 10px 10px;
    border-top: 1px solid #242E37;
  }

  .cluster-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .group-title {
    color: #6E7B87;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 6px;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .field-name {
    flex: 0 0 auto;
    min-width: 92px;
    color: #C9D5DD;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .zone-jump {
    background: transparent;
    border: none;
    padding: 0;
    font-family: inherit;
    text-align: left;
    color: #7DC4F3;
    cursor: pointer;
  }

  .zone-jump:hover {
    text-decoration: underline;
  }

  .field-row label {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .field-row label em {
    color: #6E7B87;
    font-size: 9px;
    font-style: normal;
  }

  .field-row input,
  .field-row select {
    width: 62px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    font-family: inherit;
    padding: 3px 5px;
    outline: none;
    box-sizing: border-box;
  }

  .field-row select {
    width: auto;
  }

  .field-row input:focus,
  .field-row select:focus {
    border-color: #5B9BD5;
  }

  .readout {
    color: #93A1AD;
    font-size: 10px;
  }

  .readout.wide {
    min-width: 88px;
  }

  .tag {
    flex: 0 0 auto;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid #574A26;
    background: #2A2416;
    color: #E5C06B;
    font-size: 9px;
  }

  .tag.shared {
    border-color: #2E4A5A;
    background: #14242E;
    color: #7DC4F3;
  }

  .zone-row.generated .tag {
    border-color: #574A26;
  }

  .empty-note,
  .advanced-hint {
    color: #777;
    font-size: 10px;
    line-height: 1.4;
  }

  .advanced-hint {
    padding: 2px 2px 0;
  }

  .empty-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px dashed #33404B;
    border-radius: 6px;
    background: #171C21;
    padding: 14px 12px;
  }

  .empty-card strong {
    color: #C9D5DD;
    font-size: 12px;
  }

  .empty-card span {
    color: #8A97A3;
    font-size: 11px;
    line-height: 1.45;
  }

  .orphans {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  .orphan-row {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    color: #C9D5DD;
  }

  .orphan-row em {
    color: #8A97A3;
    font-style: normal;
    font-size: 10px;
  }

  .orphan-row.warn em {
    color: #D5A16B;
  }

  .flat-embed {
    width: 100%;
  }
</style>
