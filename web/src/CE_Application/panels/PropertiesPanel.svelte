<script>
  import {
    Crosshair,
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
  } from 'lucide-svelte';
  import { panels, activePanelId, selectedComponentId } from '../stores/panels.js';
  import PanelCardContent from './PanelCardContent.svelte';

  let { width = 280 } = $props();

  let panel = $derived($panels.find(p => p.id === $activePanelId) ?? null);
  let selectedComponent = $derived($selectedComponentId);
  let contextMode = $derived(selectedComponent != null ? 'component' : 'panel');

  // View mode: 'single' or 'multi'
  let viewMode = $state('single');

  // Single mode: one active tab
  let singleTab = $state('identity');

  // Multi mode: set of visible tab ids
  let multiTabs = $state(new Set(['identity']));

  // Collapse state per card id
  let collapsedCards = $state({});

  // Reset tabs when context mode changes
  $effect(() => {
    if (contextMode) {
      singleTab = 'identity';
      multiTabs = new Set(['identity']);
    }
  });

  // Panel-level tabs
  const panelTabs = [
    { id: 'identity',   icon: LayoutDashboard, label: 'Panel' },
    { id: 'background', icon: Paintbrush,      label: 'Background' },
    { id: 'grid',       icon: Grid3x3,         label: 'Grid' },
    { id: 'export',     icon: Monitor,          label: 'Export' },
  ];

  // Component-level tabs
  const componentTabs = [
    { id: 'identity',   icon: Crosshair,    label: 'Identity' },
    { id: 'background', icon: Paintbrush,    label: 'Background' },
    { id: 'text',       icon: Type,          label: 'Text' },
    { id: 'border',     icon: SquareDashed,  label: 'Border' },
    { id: 'icon',       icon: Image,         label: 'Icon' },
    { id: 'effects',    icon: Sparkles,      label: 'Effects' },
    { id: 'actions',    icon: Zap,           label: 'Actions' },
    { id: 'links',      icon: Link,          label: 'Links' },
    { id: 'specific',   icon: Settings2,     label: 'Type' },
  ];

  let tabs = $derived(contextMode === 'panel' ? panelTabs : componentTabs);

  let visibleTabs = $derived(
    viewMode === 'single'
      ? tabs.filter(t => t.id === singleTab)
      : tabs.filter(t => multiTabs.has(t.id))
  );

  function isTabActive(id) {
    if (viewMode === 'single') return id === singleTab;
    return multiTabs.has(id);
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
    <!-- Icon tab strip -->
    <div class="icon-tabs">
      {#each tabs as tab (tab.id)}
        <button
          class="tab-icon"
          class:active={isTabActive(tab.id)}
          title={tab.label}
          onclick={(e) => handleTabClick(tab.id, e)}
        >
          <tab.icon size={16} strokeWidth={1.5} />
        </button>
      {/each}

      <div class="tab-spacer"></div>

      <button
        class="tab-icon mode-toggle"
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

    <!-- Card detail area -->
    <div class="card-area">
      {#if viewMode === 'single'}
        {#each visibleTabs as tab (tab.id)}
          <div class="card-header">
            <span class="card-title">{tab.label}</span>
            <span class="card-context">{contextMode === 'panel' ? 'Panel' : 'Component'}</span>
          </div>
          <div class="card-content">
            {#if contextMode === 'panel'}
              <PanelCardContent tabId={tab.id} />
            {:else}
              <div class="placeholder">Component: {tab.label}</div>
            {/if}
          </div>
        {/each}
      {:else}
        <div class="multi-scroll">
          {#each visibleTabs as tab (tab.id)}
            <div class="multi-card">
              <button class="multi-card-header" onclick={() => toggleCollapse(tab.id)}>
                {#if isCollapsed(tab.id)}
                  <ChevronRight size={14} strokeWidth={1.5} />
                {:else}
                  <ChevronDown size={14} strokeWidth={1.5} />
                {/if}
                <span class="multi-card-title">{tab.label}</span>
              </button>
              {#if !isCollapsed(tab.id)}
                <div class="multi-card-content">
                  {#if contextMode === 'panel'}
                    <PanelCardContent tabId={tab.id} />
                  {:else}
                    <div class="placeholder">Component: {tab.label}</div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div class="empty-panel">
      <span class="empty-text">No panel open</span>
    </div>
  {/if}
</div>

<style>
  .properties-panel {
    display: flex;
    height: 100%;
    background: #1E1E1E;
    border-left: 1px solid #1A1A1A;
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

  .mode-toggle {
    border-top: 1px solid #333;
    padding-top: 4px;
    margin-top: 4px;
  }

  .card-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid #2A2A2A;
    flex-shrink: 0;
  }

  .card-title {
    font-size: 12px;
    font-weight: 600;
    color: #CCC;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .card-context {
    font-size: 10px;
    color: #666;
    background: #2A2A2A;
    padding: 1px 6px;
    border-radius: 3px;
  }

  .card-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .multi-scroll {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

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
</style>
