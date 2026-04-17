<script>
  import {
    Paintbrush, Type, Image, Sparkles, Zap, Link, Settings2,
    LayoutDashboard, Grid3x3, Monitor, Box, Move, Frame, MousePointer,
  } from 'lucide-svelte';
  import { activePanel, selectedComponentId } from '../stores/panels.js';
  import { propertyHint } from '../stores/propertyHint.js';
  import { selectedControl, hasSection, addSection } from '../stores/controls.js';
  import PropertiesToolbar from './PropertiesToolbar.svelte';
  import TabIconBar from './TabIconBar.svelte';
  import TabContentArea from './TabContentArea.svelte';
  import { createTabViewState } from '../utils/tabViewState.js';
  import { COMPONENT_TYPES } from '../models/componentTypes.js';
  import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';

  const MIN_PROPERTIES_PANEL_WIDTH = 600;
  const UI_STATE_STORAGE_KEY = 'ce.propertiesPanel.uiState.v1';

  function readStoredUiState() {
    const stored = readStoredJson(UI_STATE_STORAGE_KEY, {});
    return {
      viewMode: stored?.viewMode === 'multi' ? 'multi' : 'single',
      pinPanelProps: stored?.pinPanelProps === true,
      singleTab: String(stored?.singleTab ?? 'core'),
      multiTabs: new Set(Array.isArray(stored?.multiTabs) && stored.multiTabs.length > 0 ? stored.multiTabs : ['core']),
      pinnedPanelTab: String(stored?.pinnedPanelTab ?? 'core'),
      pinnedPanelMultiTabs: new Set(
        Array.isArray(stored?.pinnedPanelMultiTabs) && stored.pinnedPanelMultiTabs.length > 0
          ? stored.pinnedPanelMultiTabs
          : ['core']
      ),
      collapsedCards: stored?.collapsedCards && typeof stored.collapsedCards === 'object'
        ? stored.collapsedCards
        : {},
    };
  }

  const storedUiState = readStoredUiState();

  let { width = MIN_PROPERTIES_PANEL_WIDTH } = $props();
  let clampedWidth = $derived(Math.max(width, MIN_PROPERTIES_PANEL_WIDTH));

  let panel = $derived($activePanel);
  let selectedComponent = $derived($selectedComponentId);
  let contextMode = $derived(selectedComponent != null ? 'component' : 'panel');

  // Owner names for header overlays
  let panelName = $derived(panel?.name ?? 'Panel');
  let componentName = $derived($selectedControl?._children?.Core?.name ?? 'Component');
  let ownerName = $derived(contextMode === 'panel' ? panelName : componentName);

  // View mode: 'single' or 'multi'
  let viewMode = $state(storedUiState.viewMode);

  // Pin panel properties — show panel props at top even when a component is selected
  let pinPanelProps = $state(storedUiState.pinPanelProps);

  // Main tab state (component tabs, or panel tabs when contextMode === 'panel')
  let singleTab = $state(storedUiState.singleTab);
  let multiTabs = $state(storedUiState.multiTabs);

  // Pinned-panel tab state (only used when showPinnedPanel is true)
  let pinnedPanelTab = $state(storedUiState.pinnedPanelTab);
  let pinnedPanelMultiTabs = $state(storedUiState.pinnedPanelMultiTabs);

  // Controllers — closures bind to the state vars above. handleClick/isActive
  // are used by both the main tab bar and the pinned panel tab bar.
  const main = createTabViewState({
    getSingle: () => singleTab, setSingle: (v) => singleTab = v,
    getMulti:  () => multiTabs, setMulti:  (v) => multiTabs = v,
    getViewMode: () => viewMode, setViewMode: (v) => viewMode = v,
  });
  const pinnedPanel = createTabViewState({
    getSingle: () => pinnedPanelTab, setSingle: (v) => pinnedPanelTab = v,
    getMulti:  () => pinnedPanelMultiTabs, setMulti:  (v) => pinnedPanelMultiTabs = v,
    getViewMode: () => viewMode, setViewMode: (v) => viewMode = v,
  });

  // Collapse state per card id
  let collapsedCards = $state(storedUiState.collapsedCards);

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
    { id: 'border',     icon: Frame,         label: 'Border',     section: 'Background' },
    { id: 'text',       icon: Type,          label: 'Text',       section: 'Text' },
    { id: 'mouse',      icon: MousePointer,  label: 'Mouse',      section: 'Mouse' },
    { id: 'grid',       icon: Grid3x3,       label: 'Grid',       section: 'Grid' },
    { id: 'icon',       icon: Image,         label: 'Icon',       section: 'Icon' },
    { id: 'effects',    icon: Sparkles,      label: 'Effects',    section: 'Effects' },
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

  // Upgrade older controls in-place when their type template gains new sections.
  $effect(() => {
    const control = $selectedControl;
    const controlId = control?._children?.Core?.id;
    const controlType = control?._children?.Core?.controlType;
    if (!controlId || !controlType) return;

    const template = COMPONENT_TYPES[controlType];
    if (!template?.sections?.length) return;

    for (const sectionName of template.sections) {
      if (!hasSection(control, sectionName)) {
        addSection(controlId, sectionName);
      }
    }
  });

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

  function ensureValidMainTabs() {
    const validIds = new Set(tabs.map((tab) => tab.id));
    if (validIds.size === 0) return;

    if (!validIds.has(singleTab)) {
      singleTab = tabs[0]?.id ?? 'core';
    }

    const filteredMultiTabs = [...multiTabs].filter((id) => validIds.has(id));
    const nextMultiTabs = filteredMultiTabs.length > 0 ? filteredMultiTabs : [singleTab];
    const currentMultiTabs = [...multiTabs];
    if (
      nextMultiTabs.length !== currentMultiTabs.length
      || nextMultiTabs.some((id, index) => id !== currentMultiTabs[index])
    ) {
      multiTabs = new Set(nextMultiTabs);
    }
  }

  function ensureValidPinnedTabs() {
    const validIds = new Set(panelTabs.map((tab) => tab.id));
    if (!validIds.has(pinnedPanelTab)) {
      pinnedPanelTab = panelTabs[0]?.id ?? 'core';
    }

    const filtered = [...pinnedPanelMultiTabs].filter((id) => validIds.has(id));
    const nextPinnedTabs = filtered.length > 0 ? filtered : [pinnedPanelTab];
    const currentPinnedTabs = [...pinnedPanelMultiTabs];
    if (
      nextPinnedTabs.length !== currentPinnedTabs.length
      || nextPinnedTabs.some((id, index) => id !== currentPinnedTabs[index])
    ) {
      pinnedPanelMultiTabs = new Set(nextPinnedTabs);
    }
  }

  $effect(() => {
    ensureValidMainTabs();
  });

  $effect(() => {
    ensureValidPinnedTabs();
  });

  $effect(() => {
    writeStoredJson(UI_STATE_STORAGE_KEY, {
      viewMode,
      pinPanelProps,
      singleTab,
      multiTabs: [...multiTabs],
      pinnedPanelTab,
      pinnedPanelMultiTabs: [...pinnedPanelMultiTabs],
      collapsedCards,
    });
  });

  function toggleViewMode() {
    if (viewMode === 'single') {
      viewMode = 'multi';
      multiTabs = new Set([singleTab]);
    } else {
      viewMode = 'single';
      if (multiTabs.size > 0) singleTab = [...multiTabs][0];
    }
  }

  function toggleCollapse(id) {
    collapsedCards = { ...collapsedCards, [id]: !collapsedCards[id] };
  }
</script>

<div class="properties-panel" style="width: {clampedWidth}px;">
  {#if panel}
    <!-- Toolbar area — aligns with editor tab bar (34px) -->
    <PropertiesToolbar
      {panel}
      {pinPanelProps}
      {viewMode}
      ontogglepin={() => pinPanelProps = !pinPanelProps}
      ontoggleview={toggleViewMode}
    />

    {#if showPinnedPanel}
      <!-- === SPLIT VIEW: icons + content paired per section === -->
      <div class="split-wrapper">
        <!-- Panel half: icons + content -->
        <div class="split-half">
          <TabIconBar
            tabs={panelTabs}
            isActive={pinnedPanel.isActive}
            onclick={pinnedPanel.handleClick}
            titlePrefix="Panel: "
          />
          <div class="split-content-area">
            <TabContentArea
              {viewMode}
              tabs={panelTabs}
              visibleTabs={visiblePinnedPanelTabs}
              singleTabId={pinnedPanelTab}
              contextMode="panel"
              ownerName={panelName}
              {collapsedCards}
              collapsePrefix="panel-"
              ontogglecollapse={toggleCollapse}
            />
          </div>
        </div>

        <div class="split-divider"></div>

        <!-- Component half: icons + content -->
        <div class="split-half">
          <TabIconBar
            tabs={componentTabs}
            isActive={main.isActive}
            onclick={main.handleClick}
          />
          <div class="split-content-area">
            <TabContentArea
              {viewMode}
              tabs={componentTabs}
              visibleTabs={visibleComponentTabs}
              singleTabId={singleTab}
              contextMode="component"
              control={$selectedControl}
              ownerName={componentName}
              {collapsedCards}
              ontogglecollapse={toggleCollapse}
            />
          </div>
        </div>
      </div>

    {:else}
      <!-- === NORMAL VIEW: single icon bar + content === -->
      <div class="normal-wrapper">
        <TabIconBar
          {tabs}
          isActive={main.isActive}
          onclick={main.handleClick}
        />

        <div class="card-area">
          <div class="content-scroll">
            <TabContentArea
              {viewMode}
              {tabs}
              {visibleTabs}
              singleTabId={singleTab}
              {contextMode}
              control={$selectedControl}
              {ownerName}
              {collapsedCards}
              ontogglecollapse={toggleCollapse}
            />
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
    min-width: 600px;
    background: #1E1E1E;
    border-left: 1px solid #1A1A1A;
  }

  /* --- Normal view: icon bar + content side by side --- */

  .normal-wrapper {
    flex: 1;
    display: flex;
    min-height: 0;
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
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
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

  .split-divider {
    height: 2px;
    background: #094771;
    flex-shrink: 0;
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
