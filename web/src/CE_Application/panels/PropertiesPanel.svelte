<script>
  import {
    Paintbrush,
    Type,
    SquareDashed,
    Image,
    Sparkles,
    Zap,
    Link,
    Settings2,
    LayoutDashboard,
    Grid3x3,
    Monitor,
    Layers,
    SquareStack,
    ChevronDown,
    ChevronRight,
    Box,
    Move,
    MousePointer,
    Lock,
    LockOpen,
    Undo2,
    Redo2,
    Save,
    Grid3x3 as GridIcon,
    Magnet,
    Pin,
    PinOff,
  } from 'lucide-svelte';
  import { panels, activePanelId, selectedComponentId, updatePanel, saveActivePanel } from '../stores/panels.js';
  import { propertyHint } from '../stores/propertyHint.js';
  import { undo, redo, undoAvailable, redoAvailable } from '../stores/history.js';
  import { selectedControl, hasSection } from '../stores/controls.js';
  import PanelCardContent from './PanelCardContent.svelte';
  import CoreEditor from '../sections/CoreEditor.svelte';
  import TransformEditor from '../sections/TransformEditor.svelte';
  import BackgroundEditor from '../sections/BackgroundEditor.svelte';

  let { width = 280 } = $props();

  let panel = $derived($panels.find(p => p.id === $activePanelId) ?? null);
  let selectedComponent = $derived($selectedComponentId);
  let contextMode = $derived(selectedComponent != null ? 'component' : 'panel');

  // Owner names for header overlays
  let panelName = $derived(panel?.name ?? 'Panel');
  let componentName = $derived($selectedControl?._children?.Core?.name ?? 'Component');
  let ownerName = $derived(contextMode === 'panel' ? panelName : componentName);

  // View mode: 'single' or 'multi'
  let viewMode = $state('single');

  // Pin panel properties — show panel props at top even when a component is selected
  let pinPanelProps = $state(false);

  // Single mode: one active tab
  let singleTab = $state('core');

  // Multi mode: set of visible tab ids
  let multiTabs = $state(new Set(['core']));

  // Pinned panel section: separate tab tracking
  let pinnedPanelTab = $state('core');
  let pinnedPanelMultiTabs = $state(new Set(['core']));

  // Collapse state per card id
  let collapsedCards = $state({});

  // Reset component tabs when context mode changes
  $effect(() => {
    if (contextMode) {
      const defaultTab = 'core';
      singleTab = defaultTab;
      multiTabs = new Set([defaultTab]);
    }
  });

  // Whether to show the pinned panel section at top
  let showPinnedPanel = $derived(pinPanelProps && contextMode === 'component');

  // Panel-level tabs
  const panelTabs = [
    { id: 'core',       icon: LayoutDashboard, label: 'Core' },
    { id: 'background', icon: Paintbrush,      label: 'Background' },
    { id: 'grid',       icon: Grid3x3,         label: 'Grid' },
    { id: 'export',     icon: Monitor,          label: 'Export' },
  ];

  // All possible component-level tabs (filtered by which sections exist)
  const allComponentTabs = [
    { id: 'core',       icon: Box,           label: 'Core',       section: 'Core' },
    { id: 'transform',  icon: Move,          label: 'Transform',  section: 'Transform' },
    { id: 'background', icon: Paintbrush,    label: 'Background', section: 'Background' },
    { id: 'text',       icon: Type,          label: 'Text',       section: 'Text' },
    { id: 'border',     icon: SquareDashed,  label: 'Border',     section: 'Border' },
    { id: 'mouse',      icon: MousePointer,  label: 'Mouse',      section: 'Mouse' },
    { id: 'grid',       icon: Grid3x3,       label: 'Grid',       section: 'Grid' },
    { id: 'icon',       icon: Image,         label: 'Icon',       section: 'Icon' },
    { id: 'effects',    icon: Sparkles,      label: 'Effects',    section: 'Shadow' },
    { id: 'actions',    icon: Zap,           label: 'Scripts',    section: 'Scripts' },
    { id: 'links',      icon: Link,          label: 'Links',      section: null },
    { id: 'specific',   icon: Settings2,     label: 'Type',       section: null },
  ];

  // Only show tabs for sections that exist on the selected component
  let componentTabs = $derived(
    $selectedControl
      ? allComponentTabs.filter(t => !t.section || hasSection($selectedControl, t.section))
      : allComponentTabs.filter(t => t.id === 'core' || t.id === 'transform')
  );

  // When not pinned: show panel or component tabs based on context
  // When pinned + component: icon bar shows both groups
  let tabs = $derived(contextMode === 'panel' ? panelTabs : componentTabs);

  let visibleTabs = $derived(
    viewMode === 'single'
      ? tabs.filter(t => t.id === singleTab)
      : tabs.filter(t => multiTabs.has(t.id))
  );

  let visibleComponentTabs = $derived(
    viewMode === 'single'
      ? componentTabs.filter(t => t.id === singleTab)
      : componentTabs.filter(t => multiTabs.has(t.id))
  );

  let visiblePinnedPanelTabs = $derived(
    viewMode === 'single'
      ? panelTabs.filter(t => t.id === pinnedPanelTab)
      : panelTabs.filter(t => pinnedPanelMultiTabs.has(t.id))
  );

  function isPanelTabActive(id) {
    if (viewMode === 'single') return pinnedPanelTab === id;
    return pinnedPanelMultiTabs.has(id);
  }

  function isComponentTabActive(id) {
    if (viewMode === 'single') return id === singleTab;
    return multiTabs.has(id);
  }

  function isTabActive(id) {
    if (viewMode === 'single') return id === singleTab;
    return multiTabs.has(id);
  }

  function handlePanelTabClick(id, e) {
    if (e.ctrlKey || e.metaKey) {
      togglePinnedPanelMultiTab(id);
      if (pinnedPanelMultiTabs.size > 1) viewMode = 'multi';
    } else if (viewMode === 'single') {
      pinnedPanelTab = id;
    } else {
      togglePinnedPanelMultiTab(id);
    }
  }

  function togglePinnedPanelMultiTab(id) {
    pinnedPanelMultiTabs = new Set(pinnedPanelMultiTabs);
    if (pinnedPanelMultiTabs.has(id)) {
      if (pinnedPanelMultiTabs.size > 1) pinnedPanelMultiTabs.delete(id);
    } else {
      pinnedPanelMultiTabs.add(id);
    }
    if (pinnedPanelMultiTabs.size === 1) {
      pinnedPanelTab = [...pinnedPanelMultiTabs][0];
    }
  }

  function handleComponentTabClick(id, e) {
    if (e.ctrlKey || e.metaKey) {
      toggleMultiTab(id);
      if (multiTabs.size > 1) viewMode = 'multi';
    } else if (viewMode === 'single') {
      singleTab = id;
    } else {
      toggleMultiTab(id);
    }
  }

  function handleTabClick(id, e) {
    if (e.ctrlKey || e.metaKey) {
      toggleMultiTab(id);
      if (multiTabs.size > 1) viewMode = 'multi';
    } else if (viewMode === 'single') {
      singleTab = id;
    } else {
      toggleMultiTab(id);
    }
  }

  function toggleMultiTab(id) {
    multiTabs = new Set(multiTabs);
    if (multiTabs.has(id)) {
      if (multiTabs.size > 1) multiTabs.delete(id);
    } else {
      multiTabs.add(id);
    }
    if (multiTabs.size === 1) {
      singleTab = [...multiTabs][0];
    }
  }

  function toggleViewMode() {
    if (viewMode === 'single') {
      viewMode = 'multi';
      multiTabs = new Set([singleTab]);
    } else {
      viewMode = 'single';
      if (multiTabs.size > 0) singleTab = [...multiTabs][0];
    }
  }

  function isCollapsed(id) {
    return collapsedCards[id] === true;
  }

  function toggleCollapse(id) {
    collapsedCards = { ...collapsedCards, [id]: !collapsedCards[id] };
  }
</script>

<div class="properties-panel" style="width: {width}px;">
  {#if panel}
    <!-- Toolbar area — aligns with editor tab bar (34px) -->
    <div class="props-toolbar">
      <button class="toolbar-btn" class:active={$undoAvailable} disabled={!$undoAvailable} title="Undo" onclick={undo}>
        <Undo2 size={18} strokeWidth={1.5} />
      </button>
      <button class="toolbar-btn" class:active={$redoAvailable} disabled={!$redoAvailable} title="Redo" onclick={redo}>
        <Redo2 size={18} strokeWidth={1.5} />
      </button>
      <div class="toolbar-divider"></div>
      <button
        class="toolbar-btn"
        class:active={panel.modified}
        title="Save panel"
        onclick={() => saveActivePanel()}
      >
        <Save size={18} strokeWidth={1.5} />
      </button>
      <button
        class="toolbar-btn"
        class:active={panel.locked}
        title={panel.locked ? 'Unlock panel' : 'Lock panel'}
        onclick={() => updatePanel(panel.id, { locked: !panel.locked })}
      >
        {#if panel.locked}
          <Lock size={18} strokeWidth={1.5} />
        {:else}
          <LockOpen size={18} strokeWidth={1.5} />
        {/if}
      </button>
      <div class="toolbar-divider"></div>
      <button
        class="toolbar-btn"
        class:active={panel.gridEnabled}
        title={panel.gridEnabled ? 'Hide grid' : 'Show grid'}
        onclick={() => updatePanel(panel.id, { gridEnabled: !panel.gridEnabled })}
      >
        <GridIcon size={18} strokeWidth={1.5} />
      </button>
      <button
        class="toolbar-btn"
        class:active={panel.snapToGrid}
        title={panel.snapToGrid ? 'Disable snap' : 'Enable snap'}
        onclick={() => updatePanel(panel.id, { snapToGrid: !panel.snapToGrid })}
      >
        <Magnet size={18} strokeWidth={1.5} />
      </button>
      <div class="toolbar-spacer"></div>
      <button
        class="toolbar-btn"
        class:active={pinPanelProps}
        title={pinPanelProps ? 'Unpin panel properties' : 'Pin panel properties'}
        onclick={() => pinPanelProps = !pinPanelProps}
      >
        {#if pinPanelProps}
          <Pin size={16} strokeWidth={1.5} />
        {:else}
          <PinOff size={16} strokeWidth={1.5} />
        {/if}
      </button>
      <button
        class="toolbar-btn"
        class:active={viewMode === 'multi'}
        title={viewMode === 'single' ? 'Switch to multi view' : 'Switch to single view'}
        onclick={toggleViewMode}
      >
        {#if viewMode === 'single'}
          <Layers size={16} strokeWidth={1.5} />
        {:else}
          <SquareStack size={16} strokeWidth={1.5} />
        {/if}
      </button>
    </div>

    {#if showPinnedPanel}
      <!-- === SPLIT VIEW: icons + content paired per section === -->
      <div class="split-wrapper">
        <!-- Panel half: icons + content -->
        <div class="split-half">
          <div class="icon-tabs">
            {#each panelTabs as tab (tab.id)}
              <button
                class="tab-icon"
                class:active={isPanelTabActive(tab.id)}
                title={"Panel: " + tab.label}
                onclick={(e) => handlePanelTabClick(tab.id, e)}
              >
                <tab.icon size={20} strokeWidth={1.5} />
              </button>
            {/each}
            <div class="tab-spacer"></div>
          </div>
          <div class="split-content-area">
            {#if viewMode === 'single'}
              <div class="card-header">
                <span class="card-title">{panelTabs.find(t => t.id === pinnedPanelTab)?.label ?? 'Panel'}</span>
                <span class="owner-label">{panelName}</span>
              </div>
              <div class="split-content">
                <PanelCardContent tabId={pinnedPanelTab} />
              </div>
            {:else}
              {#each visiblePinnedPanelTabs as tab, i (tab.id)}
                <div class="multi-card">
                  <button class="multi-card-header" onclick={() => toggleCollapse('panel-' + tab.id)}>
                    {#if isCollapsed('panel-' + tab.id)}
                      <ChevronRight size={16} strokeWidth={1.5} />
                    {:else}
                      <ChevronDown size={16} strokeWidth={1.5} />
                    {/if}
                    <span class="multi-card-title">{tab.label}</span>
                    {#if i === 0}<span class="owner-label">{panelName}</span>{/if}
                  </button>
                  {#if !isCollapsed('panel-' + tab.id)}
                    <div class="multi-card-content">
                      <PanelCardContent tabId={tab.id} />
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <div class="split-divider"></div>

        <!-- Component half: icons + content -->
        <div class="split-half">
          <div class="icon-tabs">
            {#each componentTabs as tab (tab.id)}
              <button
                class="tab-icon"
                class:active={isComponentTabActive(tab.id)}
                title={tab.label}
                onclick={(e) => handleComponentTabClick(tab.id, e)}
              >
                <tab.icon size={20} strokeWidth={1.5} />
              </button>
            {/each}
            <div class="tab-spacer"></div>
          </div>
          <div class="split-content-area">
            {#if viewMode === 'single'}
              {#key singleTab}
                <div class="card-header">
                  <span class="card-title">{componentTabs.find(t => t.id === singleTab)?.label ?? ''}</span>
                  <span class="owner-label">{componentName}</span>
                </div>
                <div class="split-content">
                  {#if singleTab === 'core'}
                    <CoreEditor control={$selectedControl} />
                  {:else if singleTab === 'transform'}
                    <TransformEditor control={$selectedControl} />
                  {:else if singleTab === 'background'}
                    <BackgroundEditor control={$selectedControl} />
                  {:else}
                    <div class="placeholder">Component: {componentTabs.find(t => t.id === singleTab)?.label ?? ''}</div>
                  {/if}
                </div>
              {/key}
            {:else}
              {#each visibleComponentTabs as tab, i (tab.id)}
                <div class="multi-card">
                  <button class="multi-card-header" onclick={() => toggleCollapse(tab.id)}>
                    {#if isCollapsed(tab.id)}
                      <ChevronRight size={16} strokeWidth={1.5} />
                    {:else}
                      <ChevronDown size={16} strokeWidth={1.5} />
                    {/if}
                    <span class="multi-card-title">{tab.label}</span>
                    {#if i === 0}<span class="owner-label">{componentName}</span>{/if}
                  </button>
                  {#if !isCollapsed(tab.id)}
                    <div class="multi-card-content">
                      {#if tab.id === 'core'}
                        <CoreEditor control={$selectedControl} />
                      {:else if tab.id === 'transform'}
                        <TransformEditor control={$selectedControl} />
                      {:else if tab.id === 'background'}
                        <BackgroundEditor control={$selectedControl} />
                      {:else}
                        <div class="placeholder">Component: {tab.label}</div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </div>

    {:else}
      <!-- === NORMAL VIEW: single icon bar + content === -->
      <div class="normal-wrapper">
        <div class="icon-tabs">
          {#each tabs as tab (tab.id)}
            <button
              class="tab-icon"
              class:active={isTabActive(tab.id)}
              title={tab.label}
              onclick={(e) => handleTabClick(tab.id, e)}
            >
              <tab.icon size={20} strokeWidth={1.5} />
            </button>
          {/each}
          <div class="tab-spacer"></div>
        </div>

        <div class="card-area">
          <div class="content-scroll">
            {#if viewMode === 'single'}
              {#key singleTab}
                <div class="card-header">
                  <span class="card-title">{tabs.find(t => t.id === singleTab)?.label ?? ''}</span>
                  <span class="owner-label">{ownerName}</span>
                </div>
                <div class="card-content">
                  {#if contextMode === 'panel'}
                    <PanelCardContent tabId={singleTab} />
                  {:else if singleTab === 'core'}
                    <CoreEditor control={$selectedControl} />
                  {:else if singleTab === 'transform'}
                    <TransformEditor control={$selectedControl} />
                  {:else if singleTab === 'background'}
                    <BackgroundEditor control={$selectedControl} />
                  {:else}
                    <div class="placeholder">Component: {tabs.find(t => t.id === singleTab)?.label ?? ''}</div>
                  {/if}
                </div>
              {/key}
            {:else}
              {#each visibleTabs as tab, i (tab.id)}
                <div class="multi-card">
                  <button class="multi-card-header" onclick={() => toggleCollapse(tab.id)}>
                    {#if isCollapsed(tab.id)}
                      <ChevronRight size={16} strokeWidth={1.5} />
                    {:else}
                      <ChevronDown size={16} strokeWidth={1.5} />
                    {/if}
                    <span class="multi-card-title">{tab.label}</span>
                    {#if i === 0}<span class="owner-label">{ownerName}</span>{/if}
                  </button>
                  {#if !isCollapsed(tab.id)}
                    <div class="multi-card-content">
                      {#if contextMode === 'panel'}
                        <PanelCardContent tabId={tab.id} />
                      {:else if tab.id === 'core'}
                        <CoreEditor control={$selectedControl} />
                      {:else if tab.id === 'transform'}
                        <TransformEditor control={$selectedControl} />
                      {:else if tab.id === 'background'}
                        <BackgroundEditor control={$selectedControl} />
                      {:else}
                        <div class="placeholder">Component: {tab.label}</div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>

          <!-- Info bar -->
          <div class="info-bar">
            <div class="info-header">Info</div>
            <span class="info-text">{$propertyHint || 'Hover a property for details'}</span>
          </div>
        </div>
      </div>
    {/if}

    {#if showPinnedPanel}
      <!-- Info bar for split view -->
      <div class="info-bar">
        <div class="info-header">Info</div>
        <span class="info-text">{$propertyHint || 'Hover a property for details'}</span>
      </div>
    {/if}
  {:else}
    <div class="empty-panel">
      <span class="empty-text">No panel open</span>
    </div>
  {/if}
</div>

<style>
  .properties-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1E1E1E;
    border-left: 1px solid #1A1A1A;
  }

  /* --- Toolbar (always at top, full width) --- */

  .props-toolbar {
    display: flex;
    align-items: center;
    height: 34px;
    flex-shrink: 0;
    padding: 0 8px;
    border-bottom: 1px solid #2A2A2A;
    background: #222;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.1s;
  }

  .toolbar-btn:hover {
    background: #333;
    color: #CCC;
  }

  .toolbar-btn.active {
    color: #5B9BD5;
  }

  .toolbar-btn:disabled {
    color: #444;
    cursor: default;
    pointer-events: none;
  }

  .toolbar-divider {
    width: 1px;
    height: 16px;
    background: #333;
    flex-shrink: 0;
  }

  .toolbar-spacer {
    flex: 1;
  }

  /* --- Normal view: icon bar + content side by side --- */

  .normal-wrapper {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .icon-tabs {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 36px;
    flex-shrink: 0;
    background: #222;
    border-right: 1px solid #1A1A1A;
    padding: 6px 0;
    gap: 2px;
  }

  .tab-icon {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #777;
    cursor: pointer;
    border-radius: 5px;
    transition: all 0.1s;
  }

  .tab-icon:hover {
    background: #333;
    color: #CCC;
  }

  .tab-icon.active {
    background: #094771;
    color: #FFF;
  }

  .tab-spacer {
    flex: 1;
  }

  .card-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .content-scroll {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .card-header {
    display: flex;
    align-items: center;
    height: 30px;
    flex-shrink: 0;
    padding: 0 12px;
  }

  .card-title {
    font-size: 12px;
    font-weight: 600;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .owner-label {
    margin-left: auto;
    font-size: 10px;
    font-weight: 400;
    color: #5B9BD5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
    text-align: right;
  }

  .card-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  /* --- Split view: two halves stacked vertically --- */

  .split-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }

  .split-half {
    flex-shrink: 0;
    display: flex;
    min-height: 80px;
  }

  .split-content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .split-content {
    padding: 8px;
  }

  .split-divider {
    height: 2px;
    background: #094771;
    flex-shrink: 0;
  }

  /* --- Multi-card (used in multi view mode) --- */

  .multi-card {
    border-bottom: 1px solid #2A2A2A;
  }

  .multi-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: #252525;
    border: none;
    color: #BBB;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .multi-card-header:hover {
    background: #2A2A2A;
  }

  .multi-card-title {
    flex: 1;
  }

  .multi-card-content {
    padding: 8px;
  }

  /* --- Misc --- */

  .empty-panel {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-text {
    color: #444;
    font-size: 12px;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    color: #444;
    font-size: 12px;
  }

  .info-bar {
    flex-shrink: 0;
    height: 80px;
    padding: 0;
    border-top: 1px solid #333;
    background: #222;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .info-header {
    font-size: 9px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 10px 2px 10px;
    border-bottom: 1px solid #2A2A2A;
  }

  .info-text {
    font-size: 11px;
    color: #888;
    line-height: 1.4;
    padding: 4px 10px;
    flex: 1;
  }
</style>
