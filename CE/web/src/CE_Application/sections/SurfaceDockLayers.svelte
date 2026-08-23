<script>
  /**
   * The Layers tab of the design surface dock: the add strip, the layer tree (parts, kits,
   * generated sources and hit zones), and the per-row visibility / lock / reorder / delete
   * controls.
   *
   * Fifth of the §5 decomposition, and the first cut INTO the dock rather than around it. The
   * dock as a whole needs 98 props; taking it out in one piece would trade an 8,000-line file for
   * a 98-argument function signature, which is not the improvement the review is asking for. Its
   * two tab groups are the real seams — this is one of them, at 35.
   */
  import ArrowDown from 'lucide-svelte/icons/arrow-down';
  import ArrowUp from 'lucide-svelte/icons/arrow-up';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import Lock from 'lucide-svelte/icons/lock';
  import Unlock from 'lucide-svelte/icons/lock-open';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { applyControlPatch } from '../stores/controls.js';
  import { generatorNameForEntry, layerKind, layerKindClass, layerKindLabel } from '../utils/customDesignSurfaceHelpers.js';

  let {
    core = null,
    parts = null,
    generators = null,
    topLevelPartEntries = [],
    kitEntries = [],
    generatedSourceEntries = [],
    hitZoneEntries = [],
    dockHitZoneEntries = [],
    activeSelectionKind = '',
    selectedLayer = '',
    selectedLayerSet = new Set(),
    selectedKit = '',
    selectedHitZone = '',
    selectionPulseTarget = '',
    draggingLayerName = '',
    isLayerSelected = () => false,
    canManagePartName = () => false,
    layerThumbPartStyle = () => '',
    zoneThumbPartStyle = () => '',
    selectLayer = () => {},
    selectKit = () => {},
    selectHitZone = () => {},
    toggleLayerMultiSelection = () => {},
    toggleLayerVisibility = () => {},
    toggleLayerLock = () => {},
    toggleGeneratedSource = () => {},
    moveLayer = () => {},
    beginLayerDrag = () => {},
    dropLayerOn = () => {},
    addLayerAtCenter = () => {},
    addHitZoneAtCenter = () => {},
    editKitParts = () => {},
    editGeneratorForLayer = () => {},
    removeKitEntry = () => {},
  } = $props();
</script>

  <div class="dock-add-strip" aria-label="Create layer">
    <button type="button" onclick={() => addLayerAtCenter('rectangle')} title="Add rectangle">
      <span class="tool-icon rectangle"></span>
    </button>
    <button type="button" onclick={() => addLayerAtCenter('ellipse')} title="Add ellipse">
      <span class="tool-icon ellipse"></span>
    </button>
    <button type="button" onclick={() => addLayerAtCenter('text')} title="Add text">
      <span class="tool-icon text"></span>
    </button>
    <button type="button" onclick={addHitZoneAtCenter} title="Add hit zone">
      <span class="tool-icon hitZone"></span>
    </button>
  </div>
  <div class="list-scroll layer-scroll">
  {#each kitEntries as kit (kit.id)}
    <div
      class="list-row kit-row"
      class:selected={activeSelectionKind === 'kit' && selectedKit === kit.id}
      class:primary={activeSelectionKind === 'kit' && selectedKit === kit.id}
      class:pulse={selectionPulseTarget === `kit:${kit.id}`}
      role="group"
      aria-label={`${kit.label} kit controls`}
      title={`${kit.label}: ${kit.layerNames.length} generated layers`}
    >
      <button type="button" class="row-main" onclick={() => selectKit(kit.id)}>
        <span class={`layer-thumb kit-thumb ${kit.control?.style ?? 'dial'}`} aria-hidden="true">
          <span class="kit-thumb-ring"></span>
          <span class="kit-thumb-pointer"></span>
        </span>
        <span class="row-text">
          <strong>{kit.label}</strong>
          <em>{kit.layerNames.length} layers · {kit.zoneNames.length} zone{kit.zoneNames.length === 1 ? '' : 's'}</em>
        </span>
        <span class="row-badge kit">KIT</span>
      </button>
      <div class="row-actions">
        <button
          type="button"
          onclick={(event) => { event.stopPropagation(); editKitParts(kit.id); }}
          title="Edit generated parts"
        >
          Edit
        </button>
        <button
          type="button"
          class="danger"
          onclick={(event) => { event.stopPropagation(); removeKitEntry(kit); }}
          title="Delete value control"
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  {/each}
  {#each generatedSourceEntries as source (source.source)}
    <div
      class="list-row generated-group-row"
      class:collapsed={source.collapsed}
      role="group"
      aria-label={`${source.label} generated output group`}
      title={`${source.label}: ${source.partCount} generated layers, ${source.zoneCount} generated zones`}
    >
      <button type="button" class="row-main" onclick={(event) => toggleGeneratedSource(source.source, event)}>
        <span class="layer-thumb generated-group-thumb" aria-hidden="true">
          <span></span>
        </span>
        <span class="row-text">
          <strong>{source.label}</strong>
          <em>{source.partCount} layers · {source.zoneCount} zone{source.zoneCount === 1 ? '' : 's'} · {source.collapsed ? 'folded' : 'expanded'}</em>
        </span>
        <span class="row-badge gen-group">{source.collapsed ? '+' : '-'}</span>
      </button>
      <div class="row-actions">
        {#if source.hasGenerator}
          <button
            type="button"
            onclick={(event) => { event.stopPropagation(); dockTab = 'generators'; applyControlPatch(core.id, { 'Designer.selectedGenerator': source.source }); }}
            title={`Edit ${source.source} generator`}
          >
            Gen
          </button>
        {/if}
      </div>
    </div>
  {/each}
  {#each topLevelPartEntries as [name, part] (name)}
    <div
      class="list-row"
      class:selected={isLayerSelected(name)}
      class:primary={activeSelectionKind === 'layer' && selectedLayer === name}
      class:generated={part?.generated === true || part?.meta?.generated === true}
      class:hidden={part?.visible === false}
      class:locked={part?.locked === true || part?.meta?.locked === true}
      class:pulse={selectionPulseTarget === `layer:${name}`}
      class:dragging={draggingLayerName === name}
      role="group"
      aria-label={`${name} layer controls`}
      draggable="true"
      title={`${name}: ${part?.kind ?? part?.role ?? 'part'}`}
      ondragstart={(event) => beginLayerDrag(name, event)}
      ondragend={() => { draggingLayerName = ''; }}
      ondragover={(event) => event.preventDefault()}
      ondrop={(event) => dropLayerOn(name, event)}
  >
    <button type="button" class="row-main" onclick={(event) => selectLayer(name, event)}>
        <span class="layer-thumb" aria-hidden="true">
          <span class={`layer-thumb-shape ${layerKindClass(part)}`} style={layerThumbPartStyle(name, part)}>
            {#if layerKind(part) === 'text'}T{/if}
          </span>
        </span>
        <span class="row-text">
          <strong>{name}</strong>
          <em>{part?.visible === false ? 'hidden · ' : ''}{part?.locked === true || part?.meta?.locked === true ? 'locked · ' : ''}{layerKindLabel(part)}</em>
        </span>
        <span class="row-badge">{part?.generated === true || part?.meta?.generated === true ? 'GEN' : layerKindLabel(part)}</span>
      </button>
      <div class="row-actions">
        {#if generatorNameForEntry(part)}
          <button
            type="button"
            onclick={(event) => editGeneratorForLayer(name, part, event)}
            title={`Edit ${generatorNameForEntry(part)} generator`}
          >
            Gen
          </button>
        {/if}
        <button
          type="button"
          class:selected={selectedLayerSet.has(name)}
          onclick={(event) => toggleLayerMultiSelection(name, event)}
          title={selectedLayerSet.has(name) ? 'Remove from selection' : 'Add to selection'}
          aria-label={selectedLayerSet.has(name) ? `Remove ${name} from selection` : `Add ${name} to selection`}
        >
          +
        </button>
        <button type="button" onclick={(event) => { event.stopPropagation(); moveLayer(name, 1); }} disabled={!canManagePartName(name)} title={canManagePartName(name) ? 'Bring forward' : 'Generated layer: edit the generator or detach first'}>
          <ArrowUp size={12} aria-hidden="true" />
        </button>
        <button type="button" onclick={(event) => { event.stopPropagation(); moveLayer(name, -1); }} disabled={!canManagePartName(name)} title={canManagePartName(name) ? 'Send backward' : 'Generated layer: edit the generator or detach first'}>
          <ArrowDown size={12} aria-hidden="true" />
        </button>
        <button type="button" onclick={(event) => toggleLayerVisibility(name, part, event)} disabled={!canManagePartName(name)} title={canManagePartName(name) ? (part?.visible === false ? 'Show layer' : 'Hide layer') : 'Generated layer: edit the generator or detach first'}>
          {#if part?.visible === false}
            <Eye size={12} aria-hidden="true" />
          {:else}
            <EyeOff size={12} aria-hidden="true" />
          {/if}
        </button>
        <button type="button" onclick={(event) => toggleLayerLock(name, part, event)} disabled={!canManagePartName(name)} title={canManagePartName(name) ? (part?.locked === true || part?.meta?.locked === true ? 'Unlock layer' : 'Lock layer') : 'Generated layer: edit the generator or detach first'}>
          {#if part?.locked === true || part?.meta?.locked === true}
            <Unlock size={12} aria-hidden="true" />
          {:else}
            <Lock size={12} aria-hidden="true" />
          {/if}
        </button>
      </div>
    </div>
  {/each}
  </div>
  <div class="list-header secondary">
    <span>Hit Zones</span>
    <strong>{dockHitZoneEntries.length}</strong>
  </div>
  <div class="list-scroll zones">
  {#if dockHitZoneEntries.length}
    {#each dockHitZoneEntries as [name, zone] (name)}
      <div
        class="list-row zone-row"
        class:selected={activeSelectionKind === 'hitZone' && selectedHitZone === name}
        class:generated={zone?.generated === true || zone?.meta?.generated === true}
        class:pulse={selectionPulseTarget === `zone:${name}`}
        role="group"
        aria-label={`${name} hit zone`}
        title={`${name}: ${zone?.action ?? 'action'}`}
      >
        <button type="button" class="row-main" onclick={() => selectHitZone(name)}>
          <span class="layer-thumb zone-thumb" aria-hidden="true">
            <span class="zone-thumb-shape" style={zoneThumbPartStyle(name, zone)}></span>
          </span>
          <span class="row-text">
            <strong>{name}</strong>
            <em>{zone?.shape ?? 'zone'} · {zone?.action ?? 'action'}</em>
          </span>
          <span class="row-badge zone">ZONE</span>
        </button>
      </div>
    {/each}
  {:else}
    <div class="list-empty">{hitZoneEntries.length ? 'Generated zones are folded above' : 'No zones'}</div>
  {/if}
  </div>

<style>

  .list-header.secondary {
    position: static;
    border-top: 1px solid #2A2A2A;
  }

  .dock-add-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    flex-shrink: 0;
    padding: 6px;
    border-bottom: 1px solid #252C32;
    background: #181D22;
  }

  .dock-add-strip button {
    display: grid;
    place-items: center;
    height: 28px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #22272B;
    color: #DCEBFA;
    cursor: pointer;
  }

  .dock-add-strip button:hover {
    border-color: #5B9BD5;
    background: #173449;
  }

  .list-scroll {
    min-height: 0;
    max-height: none;
    overflow: visible;
  }

  .list-scroll.layer-scroll {
    flex: 0 0 auto;
    max-height: none;
  }

  .list-scroll.zones {
    min-height: 0;
    max-height: none;
  }

  .list-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    width: 100%;
    min-height: 43px;
    padding: 0;
    border: 0;
    border-bottom: 1px solid #252525;
    background: transparent;
    color: #C9D5DE;
    text-align: left;
    font: inherit;
  }

  .list-row:hover {
    background: #202A31;
  }

  .list-row.selected {
    background: #173449;
    color: #F1F8FF;
    box-shadow:
      inset 3px 0 0 #5B9BD5,
      inset 0 0 0 1px rgba(91, 155, 213, 0.34);
  }

  .list-row.selected:not(.primary) {
    background: #1E2C36;
    box-shadow:
      inset 3px 0 0 rgba(91, 155, 213, 0.68),
      inset 0 0 0 1px rgba(91, 155, 213, 0.18);
  }

  .list-row.generated {
    color: #EACB8C;
  }

  .list-row.hidden {
    opacity: 0.58;
  }

  .list-row.dragging {
    opacity: 0.42;
  }

  .list-row.locked strong::after {
    content: ' locked';
    color: #E5A029;
    font-size: 9px;
    font-weight: 700;
  }

  .list-row.zone-row.selected {
    background: #3A2C16;
    color: #FFF3D8;
    box-shadow:
      inset 3px 0 0 #E5A029,
      inset 0 0 0 1px rgba(229, 160, 41, 0.36);
  }

  .list-row.kit-row {
    color: #D9EAF4;
  }

  .list-row.kit-row.selected {
    background: #18333A;
    color: #F2FCFF;
    box-shadow:
      inset 3px 0 0 #14B8A6,
      inset 0 0 0 1px rgba(20, 184, 166, 0.34);
  }

  .list-row.generated-group-row {
    color: #F1D8A1;
    background: #191710;
  }

  .list-row.generated-group-row:hover {
    background: #242017;
  }

  .list-row.generated-group-row.collapsed {
    background: #151512;
  }

  .list-row.pulse {
    animation: row-pulse 720ms ease-out;
  }

  .row-main {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    min-width: 0;
    padding: 6px 8px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font: inherit;
  }

  .layer-thumb {
    position: relative;
    width: 42px;
    height: 30px;
    overflow: hidden;
    border: 1px solid #31404A;
    border-radius: 4px;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px),
      #0C1217;
    background-size: 7px 7px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
  }

  .kit-thumb {
    display: grid;
    place-items: center;
  }

  .kit-thumb.horizontal .kit-thumb-ring,
  .kit-thumb.vertical .kit-thumb-ring {
    border: 0 !important;
    border-radius: 999px !important;
    background: #5B9BD5 !important;
  }

  .kit-thumb.horizontal .kit-thumb-ring {
    width: 28px !important;
    height: 3px !important;
  }

  .kit-thumb.vertical .kit-thumb-ring {
    width: 3px !important;
    height: 22px !important;
  }

  .kit-thumb.horizontal .kit-thumb-pointer {
    width: 3px !important;
    height: 18px !important;
    transform: none !important;
  }

  .kit-thumb.vertical .kit-thumb-pointer {
    width: 18px !important;
    height: 3px !important;
    transform: none !important;
  }

  .kit-thumb-ring {
    width: 20px;
    height: 20px;
    border: 3px solid #5B9BD5;
    border-right-color: #14B8A6;
    border-radius: 999px;
  }

  .kit-thumb-pointer {
    position: absolute;
    width: 4px;
    height: 14px;
    border-radius: 99px;
    background: #EAF6FF;
    transform: translateY(-4px) rotate(-35deg);
    transform-origin: 50% 100%;
  }

  .generated-group-thumb {
    display: grid;
    place-items: center;
    border-color: #6E5A2E;
    background:
      linear-gradient(90deg, rgba(229, 192, 107, 0.18) 1px, transparent 1px),
      linear-gradient(0deg, rgba(229, 192, 107, 0.18) 1px, transparent 1px),
      #16140E;
    background-size: 8px 8px;
  }

  .generated-group-thumb span {
    width: 23px;
    height: 15px;
    border: 1px dashed #E5C06B;
    border-radius: 3px;
    box-shadow:
      5px 4px 0 rgba(229, 192, 107, 0.16),
      -5px -4px 0 rgba(229, 192, 107, 0.12);
  }

  .layer-thumb-shape,
  .zone-thumb-shape {
    position: absolute;
    display: grid;
    place-items: center;
    min-width: 4px;
    min-height: 4px;
    border: 1px solid #5B9BD5;
    color: #0A1116;
    font-size: 9px;
    font-weight: 900;
    line-height: 1;
  }

  .layer-thumb-shape.text {
    background: #E8F3FA !important;
    border-color: #8FA4B0 !important;
  }

  .layer-thumb-shape.arc {
    background: transparent !important;
    border-width: 3px;
    border-left-color: transparent !important;
  }

  .layer-thumb-shape.capsule {
    border-radius: 999px !important;
  }

  .zone-thumb {
    border-color: rgba(229, 160, 41, 0.42);
    background:
      linear-gradient(90deg, rgba(229, 160, 41, 0.07) 1px, transparent 1px),
      linear-gradient(0deg, rgba(229, 160, 41, 0.07) 1px, transparent 1px),
      #11120E;
    background-size: 7px 7px;
  }

  .zone-thumb-shape {
    border: 1px dashed #E5A029;
    background: rgba(229, 160, 41, 0.16);
  }

  .row-text {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .row-badge {
    justify-self: end;
    max-width: 58px;
    overflow: hidden;
    padding: 2px 5px;
    border: 1px solid #2F404B;
    border-radius: 4px;
    background: #10181E;
    color: #8FA4B0;
    font-size: 8px;
    font-weight: 900;
    line-height: 1.2;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .row-badge.zone {
    border-color: rgba(229, 160, 41, 0.34);
    color: #E5A029;
  }

  .row-badge.kit {
    border-color: rgba(20, 184, 166, 0.38);
    color: #52D7CA;
  }

  .row-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px 0 2px;
    opacity: 0.18;
  }

  .list-row.selected .row-actions,
  .list-row:hover .row-actions,
  .list-row:focus-within .row-actions {
    opacity: 1;
  }

  .row-actions button {
    display: grid;
    place-items: center;
    width: 20px;
    height: 22px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: #AFC5D8;
    cursor: pointer;
  }

  .row-actions button:hover {
    border-color: #5B9BD5;
    background: rgba(91, 155, 213, 0.18);
    color: #EAF5FF;
  }

  .row-actions button:disabled {
    opacity: 0.32;
    cursor: not-allowed;
  }

  .row-actions button:disabled:hover {
    border-color: transparent;
    background: transparent;
    color: #AFC5D8;
  }

  .row-actions button.selected {
    border-color: rgba(125, 196, 243, 0.75);
    background: rgba(91, 155, 213, 0.24);
    color: #EAF5FF;
    font-weight: 900;
  }

  .list-row strong,
  .list-row em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-row strong {
    font-size: 11px;
    font-weight: 700;
  }

  .list-row em {
    color: #7F8B94;
    font-size: 10px;
    font-style: normal;
  }

  .list-empty {
    padding: 12px 10px;
    color: #666;
    font-size: 11px;
  }
  .dock-add-strip {
    background: #111A21;
    border-bottom-color: #24313A;
  }
  .dock-add-strip button {
    border-color: #303F49;
    background: #1B2730;
  }
  .dock-add-strip button:hover {
    border-color: #14B8A6;
    background: rgba(20, 184, 166, 0.17);
    color: #F0FFFC;
  }

  .list-row {
    min-height: 54px;
    border-bottom-color: #222D35;
  }

  .list-row:hover {
    background: #18252D;
  }

  .list-row.selected {
    background: linear-gradient(90deg, rgba(20, 184, 166, 0.28), rgba(20, 184, 166, 0.13));
    box-shadow:
      inset 3px 0 0 #14B8A6,
      inset 0 0 0 1px rgba(20, 184, 166, 0.28);
  }

  .layer-thumb {
    border-color: #344650;
    background-color: #0B1116;
  }

  .list-row.selected .layer-thumb {
    border-color: #14B8A6;
    box-shadow:
      inset 0 0 0 1px rgba(20, 184, 166, 0.24),
      0 0 14px rgba(20, 184, 166, 0.12);
  }

  .row-badge {
    border-color: #31404A;
    background: rgba(13, 20, 25, 0.92);
  }
</style>
