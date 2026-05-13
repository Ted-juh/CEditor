<script>
  import {
    BadgeCheck,
    CircleDot,
    Container,
    Library,
    Pin,
    Plus,
    Search,
    RectangleHorizontal,
    RefreshCw,
    SlidersHorizontal,
    SlidersVertical,
    Square,
    ListCollapse,
    TimerReset,
    ToggleLeft,
    Type,
    PanelBottom,
    PanelRight,
    PanelLeftClose,
  } from 'lucide-svelte';
  import { addControl, addCustomComponentPackage } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';

  let {
    showDisplayPanel = true,
    showPropertiesPanel = true,
    showTreePanel = true,
    onToggleDisplay = () => {},
    onToggleProperties = () => {},
    onToggleTree = () => {},
  } = $props();

  let hasActivePanel = $derived(!!$activePanel);
  let customLibraryOpen = $state(false);
  let customLibraryQuery = $state('');
  let customLibraryKind = $state('all');
  let selectedCustomLibraryId = $state('');
  let customLibraryEntries = $derived.by(() => {
    const query = customLibraryQuery.trim().toLowerCase();
    const entries = $customComponentLibrary ?? [];
    return entries.filter((entry) => {
      const labels = entry.capabilities?.labels ?? [];
      if (customLibraryKind !== 'all' && entry.capabilities?.primaryKind !== customLibraryKind && !labels.includes(customLibraryKind)) {
        return false;
      }
      if (!query) return true;
      const searchable = [
        entry.name,
        entry.version,
        entry.author,
        entry.description,
        entry.category,
        entry.license,
        entry.homepage,
        entry.readiness?.score,
        entry.capabilities?.primaryKind,
        ...(entry.tags ?? []),
        ...labels,
        ...(entry.publicApiSummary?.inputs ?? []).map((input) => `${input.label ?? input.name} ${input.channel ?? ''} ${input.type ?? ''}`),
        ...(entry.publicApiSummary?.outputs ?? []).map((output) => `${output.label ?? output.name} ${output.channel ?? ''} ${output.type ?? ''}`),
        ...(entry.publicApiSummary?.properties ?? []).map((property) => `${property.label ?? property.name} ${property.path ?? ''} ${property.type ?? ''}`),
      ].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(query);
    });
  });
  let selectedCustomLibraryEntry = $derived(customLibraryEntries.find((entry) => entry.id === selectedCustomLibraryId) ?? customLibraryEntries[0] ?? null);
  let pinnedCustomLibraryEntries = $derived.by(() => {
    const entries = customLibraryEntries;
    const pinned = entries.filter((entry) => entry.pinned === true);
    const recent = entries.filter((entry) => entry.pinned !== true);
    return [...pinned, ...recent]
      .sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        const rightTime = Date.parse(right.lastUsedAt || right.savedAt || '') || 0;
        const leftTime = Date.parse(left.lastUsedAt || left.savedAt || '') || 0;
        return rightTime - leftTime;
      })
      .slice(0, 3);
  });

  const insertGroups = [
    [
      { type: 'Background',      icon: Square,             label: 'Insert Background' },
      { type: 'Label',           icon: Type,               label: 'Insert Label' },
      { type: 'Container',       icon: Container,          label: 'Insert Container' },
    ],
    [
      { type: 'MomentaryButton', icon: RectangleHorizontal, label: 'Insert Momentary Button' },
      { type: 'ToggleButton',    icon: ToggleLeft,          label: 'Insert Toggle Button' },
      { type: 'RadioButtonGroup', icon: CircleDot,          label: 'Insert Radio Button Group' },
      { type: 'CyclicButton',    icon: RefreshCw,           label: 'Insert Cyclic Button' },
      { type: 'Combobox',        icon: ListCollapse,        label: 'Insert Combobox' },
      { type: 'TimedButton',     icon: TimerReset,          label: 'Insert Timed Button' },
      { type: 'OneShotButton',   icon: BadgeCheck,          label: 'Insert One-Shot Button' },
    ],
    [
      { type: 'Range',           icon: SlidersHorizontal,   label: 'Insert Range' },
      { type: 'Slider',          icon: SlidersVertical,     label: 'Insert Slider' },
      { type: 'CustomComponent', icon: Container,           label: 'Insert Custom Component' },
    ],
  ];

  const customLibraryKinds = ['all', 'button', 'slider', 'multi', 'grid', 'piano', 'filmstrip', 'linked'];

  function handleInsert(type) {
    if (!hasActivePanel) return;
    addControl(type);
  }

  function handleInsertPackage(entry) {
    if (!hasActivePanel || !entry?.envelope) return;
    addCustomComponentPackage(entry.envelope);
    customComponentLibrary.markUsed(entry.id);
  }

  function toggleCustomLibrary() {
    customLibraryOpen = !customLibraryOpen;
  }

  function thumbnailPartStyle(part) {
    const kind = String(part?.kind ?? '').toLowerCase();
    const isRoundOutline = kind.includes('ring') || kind.includes('arc');
    const radius = kind.includes('circle') || isRoundOutline ? 999 : (part?.radius ?? 3);
    const background = isRoundOutline ? 'transparent' : (part?.colour ?? '#5B9BD5');
    const border = isRoundOutline ? `2px solid ${part?.colour ?? '#5B9BD5'}` : '1px solid rgba(255,255,255,0.18)';
    return [
      `left:${part?.x ?? 0}%`,
      `top:${part?.y ?? 0}%`,
      `width:${Math.max(1, part?.width ?? 10)}%`,
      `height:${Math.max(1, part?.height ?? 10)}%`,
      `background:${background}`,
      `border:${border}`,
      `border-radius:${radius}px`,
      `transform:rotate(${part?.rotation ?? 0}deg)`,
    ].join(';');
  }

  function selectLibraryEntry(entry) {
    selectedCustomLibraryId = entry?.id ?? '';
  }

  function togglePinnedEntry(entry) {
    if (!entry?.id) return;
    const updated = customComponentLibrary.togglePinned(entry.id);
    selectedCustomLibraryId = updated?.id ?? entry.id;
  }

  function publicSurfacePreview(entry) {
    const summary = entry?.publicApiSummary ?? {};
    return [
      ...(summary.inputs ?? []).map((item) => ({ ...item, direction: 'In' })),
      ...(summary.outputs ?? []).map((item) => ({ ...item, direction: 'Out' })),
      ...(summary.properties ?? []).map((item) => ({ ...item, direction: 'Prop' })),
    ].slice(0, 6);
  }

  function valueRangeLabel(item) {
    const hasMin = item?.min !== undefined && item?.min !== '';
    const hasMax = item?.max !== undefined && item?.max !== '';
    if (Array.isArray(item?.values) && item.values.length) return item.values.slice(0, 4).join(', ');
    if (hasMin || hasMax) return `${hasMin ? item.min : '...'}-${hasMax ? item.max : '...'}`;
    if (item?.defaultValue !== undefined && item.defaultValue !== '') return `default ${item.defaultValue}`;
    return item?.channel || item?.path || '';
  }
</script>

<div class="icon-panel">
  {#each insertGroups as group, groupIndex}
    <div class="insert-section">
      {#each group as component}
        <button
          class="icon-btn"
          title={hasActivePanel ? component.label : `${component.label} (open a panel first)`}
          onclick={() => handleInsert(component.type)}
          disabled={!hasActivePanel}
        >
          <component.icon size={18} strokeWidth={1.5} />
        </button>
      {/each}
    </div>

    {#if groupIndex < insertGroups.length - 1}
      <div class="separator"></div>
    {/if}
  {/each}

  {#if ($customComponentLibrary ?? []).length}
    <div class="separator"></div>
    <div class="insert-section custom-library-section">
      <button
        class="icon-btn"
        class:active={customLibraryOpen}
        title="Browse Custom Component Library"
        onclick={toggleCustomLibrary}
      >
        <Library size={18} strokeWidth={1.5} />
      </button>

      {#each pinnedCustomLibraryEntries as entry (entry.id)}
        <button
          class="icon-btn package-btn"
          class:invalid={entry.validation?.ok === false}
          title={hasActivePanel ? `Insert ${entry.name} ${entry.version ?? ''}` : `Insert ${entry.name} (open a panel first)`}
          onclick={() => handleInsertPackage(entry)}
          disabled={!hasActivePanel}
        >
          <Container size={16} strokeWidth={1.5} />
          <span>{entry.name?.slice(0, 2) ?? 'CC'}</span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="spacer"></div>

  <div class="separator"></div>

  <div class="panel-toggles">
    <button
      class="icon-btn"
      class:active={showDisplayPanel}
      title="Toggle Display Panel"
      onclick={onToggleDisplay}
    >
      <PanelBottom size={18} strokeWidth={1.5} />
    </button>
    <button
      class="icon-btn"
      class:active={showTreePanel}
      title="Toggle Component Tree"
      onclick={onToggleTree}
    >
      <PanelLeftClose size={18} strokeWidth={1.5} />
    </button>
    <button
      class="icon-btn"
      class:active={showPropertiesPanel}
      title="Toggle Properties Panel"
      onclick={onToggleProperties}
    >
      <PanelRight size={18} strokeWidth={1.5} />
    </button>
  </div>
</div>

{#if customLibraryOpen}
  <div class="custom-library-drawer">
    <div class="drawer-header">
      <div>
        <strong>Custom Library</strong>
        <span>{customLibraryEntries.length} / {($customComponentLibrary ?? []).length}</span>
      </div>
      <button class="close-btn" title="Close library" onclick={() => customLibraryOpen = false}>x</button>
    </div>

    <label class="search-row">
      <Search size={14} strokeWidth={1.6} />
      <input
        type="text"
        placeholder="Search components"
        bind:value={customLibraryQuery}
      />
    </label>

    <div class="kind-row">
      {#each customLibraryKinds as kind}
        <button class:active={customLibraryKind === kind} onclick={() => customLibraryKind = kind}>{kind}</button>
      {/each}
    </div>

    <div class="drawer-list">
      {#if customLibraryEntries.length}
        {#each customLibraryEntries as entry (entry.id)}
          <button
            class="library-entry"
            class:selected={selectedCustomLibraryEntry?.id === entry.id}
            class:invalid={entry.validation?.ok === false}
            title={`Select ${entry.name}`}
            onclick={() => selectLibraryEntry(entry)}
          >
            <span class="entry-thumb" style={`aspect-ratio:${entry.thumbnail?.aspectRatio ?? 2}`}>
              {#each (entry.thumbnail?.parts ?? []).slice(0, 10) as part}
                <i style={thumbnailPartStyle(part)}></i>
              {/each}
            </span>
            <span class="entry-main">
              <span class="entry-title">{entry.name}</span>
              <span class="entry-meta">
                {entry.summary?.parts ?? 0} parts
                · {entry.capabilities?.primaryKind ?? 'custom'}
                · {entry.readiness?.score ?? 0}%
                {#if entry.publicApiSummary?.counts?.inputs}
                  · {entry.publicApiSummary.counts.inputs} in
                {/if}
                {#if entry.publicApiSummary?.counts?.outputs}
                  · {entry.publicApiSummary.counts.outputs} out
                {/if}
                {#if entry.publicApiSummary?.counts?.properties}
                  · {entry.publicApiSummary.counts.properties} props
                {/if}
                {#if entry.useCount}
                  · used {entry.useCount}
                {/if}
              </span>
            </span>
            <span class="entry-status">{entry.pinned ? 'Pin' : entry.validation?.ok === false ? 'Fix' : 'View'}</span>
          </button>
        {/each}
      {:else}
        <div class="empty-library">No matching custom components.</div>
      {/if}
    </div>

    {#if selectedCustomLibraryEntry}
      <div class="library-detail" class:invalid={selectedCustomLibraryEntry.validation?.ok === false}>
        <div class="detail-head">
          <div>
            <strong>{selectedCustomLibraryEntry.name}</strong>
            <span>{selectedCustomLibraryEntry.version ?? '1.0.0'} · {selectedCustomLibraryEntry.capabilities?.primaryKind ?? 'custom'} · {selectedCustomLibraryEntry.readiness?.score ?? 0}%</span>
          </div>
          <button
            class="icon-action"
            class:active={selectedCustomLibraryEntry.pinned === true}
            title={selectedCustomLibraryEntry.pinned ? 'Unpin package' : 'Pin package'}
            onclick={() => togglePinnedEntry(selectedCustomLibraryEntry)}
          >
            <Pin size={14} strokeWidth={1.7} />
          </button>
        </div>
        <div class="detail-tags">
          {#each (selectedCustomLibraryEntry.capabilities?.labels ?? []).slice(0, 6) as label}
            <span>{label}</span>
          {/each}
        </div>
        <div class="detail-stats">
          <span>{selectedCustomLibraryEntry.summary?.materializedParts ?? selectedCustomLibraryEntry.summary?.parts ?? 0} parts</span>
          <span>{selectedCustomLibraryEntry.summary?.materializedHitZones ?? selectedCustomLibraryEntry.summary?.hitZones ?? 0} zones</span>
          <span>{selectedCustomLibraryEntry.publicApiSummary?.counts?.inputs ?? 0} in</span>
          <span>{selectedCustomLibraryEntry.publicApiSummary?.counts?.properties ?? 0} props</span>
        </div>
        {#if publicSurfacePreview(selectedCustomLibraryEntry).length}
          <div class="api-preview">
            {#each publicSurfacePreview(selectedCustomLibraryEntry) as item}
              <span>
                <strong>{item.direction}</strong>
                <em>{item.label ?? item.name}</em>
                <i>{item.type}{#if valueRangeLabel(item)} · {valueRangeLabel(item)}{/if}</i>
              </span>
            {/each}
          </div>
        {/if}
        {#if selectedCustomLibraryEntry.description}
          <div class="detail-description">{selectedCustomLibraryEntry.description}</div>
        {/if}
        <button
          class="add-selected-btn"
          type="button"
          onclick={() => handleInsertPackage(selectedCustomLibraryEntry)}
          disabled={!hasActivePanel}
          title={hasActivePanel ? `Insert ${selectedCustomLibraryEntry.name}` : 'Open a panel before inserting'}
        >
          <Plus size={14} strokeWidth={1.8} />
          <span>{hasActivePanel ? 'Add to Panel' : 'Open Panel First'}</span>
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .icon-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    background: #252525;
    border-right: 1px solid #1A1A1A;
    padding: 34px 0 6px 0;
    gap: 2px;
    overflow-y: auto;
  }

  .insert-section,
  .panel-toggles {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
    padding: 0 4px;
  }

  .spacer {
    flex: 1;
  }

  .separator {
    width: 28px;
    height: 1px;
    background: #444;
    margin: 6px 0;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.1s;
    position: relative;
  }

  .icon-btn:hover:not(:disabled) {
    background: #3A3A3A;
    color: #DDD;
  }

  .icon-btn.active {
    background: #094771;
    color: #FFF;
  }

  .icon-btn:disabled {
    color: #4E4E4E;
    cursor: not-allowed;
  }

  .package-btn span {
    position: absolute;
    right: 4px;
    bottom: 3px;
    max-width: 20px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #A9C8DC;
    font-size: 7px;
    line-height: 1;
    letter-spacing: 0;
  }

  .package-btn.invalid {
    color: #B88972;
  }

  .package-btn.invalid span {
    color: #D9A58A;
  }

  .custom-library-drawer {
    position: fixed;
    left: 46px;
    top: 48px;
    bottom: 42px;
    width: 260px;
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: #242424;
    border: 1px solid #3A3A3A;
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42);
    color: #DDD;
  }

  .drawer-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .drawer-header strong {
    display: block;
    font-size: 12px;
    line-height: 1.25;
    font-weight: 600;
  }

  .drawer-header span {
    display: block;
    margin-top: 2px;
    color: #9A9A9A;
    font-size: 10px;
    line-height: 1.2;
  }

  .close-btn {
    width: 22px;
    height: 22px;
    border: 1px solid #3A3A3A;
    border-radius: 4px;
    background: #2E2E2E;
    color: #AAA;
    cursor: pointer;
    line-height: 1;
  }

  .close-btn:hover {
    background: #3A3A3A;
    color: #EEE;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 0 7px;
    background: #1E1E1E;
    border: 1px solid #363636;
    border-radius: 5px;
    color: #8DAEC2;
  }

  .search-row input {
    min-width: 0;
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: #DDD;
    font-size: 11px;
  }

  .kind-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .kind-row button {
    min-height: 22px;
    border: 1px solid #363636;
    border-radius: 4px;
    background: #2A2A2A;
    color: #AAA;
    cursor: pointer;
    font-size: 9px;
    padding: 2px 6px;
  }

  .kind-row button:hover,
  .kind-row button.active {
    border-color: #55794C;
    background: #182418;
    color: #CBE8B8;
  }

  .drawer-list {
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .library-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 46px;
    width: 100%;
    padding: 7px 8px;
    border: 1px solid #363636;
    border-radius: 6px;
    background: #2A2A2A;
    color: #DDD;
    cursor: pointer;
    text-align: left;
  }

  .entry-thumb {
    position: relative;
    flex: 0 0 48px;
    width: 48px;
    min-height: 28px;
    border: 1px solid #333F48;
    border-radius: 4px;
    background: #101418;
    overflow: hidden;
    box-sizing: border-box;
  }

  .entry-thumb i {
    position: absolute;
    display: block;
    box-sizing: border-box;
  }

  .library-entry:hover:not(:disabled) {
    background: #333;
    border-color: #4A4A4A;
  }

  .library-entry.selected {
    background: #26313B;
    border-color: #5B9BD5;
  }

  .library-entry:disabled {
    color: #666;
    cursor: not-allowed;
  }

  .library-entry.invalid {
    border-color: #6A4438;
  }

  .entry-main {
    min-width: 0;
  }

  .entry-title {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.25;
  }

  .entry-meta {
    display: block;
    margin-top: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #9B9B9B;
    font-size: 10px;
    line-height: 1.2;
  }

  .entry-status {
    flex: 0 0 auto;
    color: #8DB7CE;
    font-size: 10px;
    font-weight: 600;
  }

  .library-entry.invalid .entry-status {
    color: #D9A58A;
  }

  .empty-library {
    padding: 16px 8px;
    color: #888;
    font-size: 11px;
    text-align: center;
  }

  .library-detail {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 9px;
    border: 1px solid #343F48;
    border-radius: 6px;
    background: #1E2429;
    min-height: 0;
  }

  .library-detail.invalid {
    border-color: #6A4438;
    background: #2A211F;
  }

  .detail-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .detail-head strong {
    display: block;
    max-width: 190px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    line-height: 1.25;
  }

  .detail-head span {
    display: block;
    margin-top: 2px;
    color: #A4B5C0;
    font-size: 10px;
    line-height: 1.2;
  }

  .icon-action {
    flex: 0 0 auto;
    width: 26px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #3B4750;
    border-radius: 4px;
    background: #242C32;
    color: #A8B8C2;
    cursor: pointer;
  }

  .icon-action:hover,
  .icon-action.active {
    color: #E1F2FF;
    border-color: #5B9BD5;
    background: #253646;
  }

  .detail-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .detail-tags span {
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 2px 5px;
    border-radius: 4px;
    background: #2B343A;
    color: #B7D4E5;
    font-size: 9px;
  }

  .detail-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }

  .detail-stats span {
    min-width: 0;
    padding: 4px 5px;
    border: 1px solid #303A41;
    border-radius: 4px;
    background: #1A2025;
    color: #A7A7A7;
    font-size: 9px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .api-preview {
    display: grid;
    gap: 4px;
    max-height: 104px;
    overflow: auto;
  }

  .api-preview span {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 2px 6px;
    align-items: center;
    min-width: 0;
    padding: 5px 6px;
    border: 1px solid #2D3940;
    border-radius: 4px;
    background: #192024;
  }

  .api-preview strong {
    grid-row: span 2;
    color: #92BED5;
    font-size: 9px;
    line-height: 1.1;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .api-preview em,
  .api-preview i {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }

  .api-preview em {
    color: #DFE8EE;
    font-size: 10px;
    line-height: 1.2;
  }

  .api-preview i {
    color: #8D9EA8;
    font-size: 9px;
    line-height: 1.2;
  }

  .detail-description {
    max-height: 42px;
    overflow: hidden;
    color: #AAA;
    font-size: 10px;
    line-height: 1.35;
  }

  .add-selected-btn {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid #4D6B82;
    border-radius: 5px;
    background: #243544;
    color: #E3F3FF;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
  }

  .add-selected-btn:hover:not(:disabled) {
    border-color: #75B7E8;
    background: #2D4050;
  }

  .add-selected-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
