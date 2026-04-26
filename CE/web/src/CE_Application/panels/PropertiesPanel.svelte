<script>
  import {
    Paintbrush, Type, Image, Sparkles, Zap, Link, Settings2, Workflow, Play,
    LayoutDashboard, Grid3x3, Monitor, Box, Move, Frame, MousePointer, Rows3, SlidersHorizontal,
  } from 'lucide-svelte';
  import { activePanel, selectedComponentId } from '../stores/panels.js';
  import { propertyHint } from '../stores/propertyHint.js';
  import { selectedControl, hasSection, getSection } from '../stores/controls.js';
  import { previewModeEnabled, togglePreviewMode } from '../stores/interactionPreview.js';
  import PropertiesToolbar from './PropertiesToolbar.svelte';
  import PreviewInspector from './PreviewInspector.svelte';
  import TabIconBar from './TabIconBar.svelte';
  import TabContentArea from './TabContentArea.svelte';
  import { createTabViewState } from '../utils/tabViewState.js';
  import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
  import { stateEditScope, setStateEditScopeBase } from '../stores/stateEditScope.js';
  import { setSegmentEditScopeAll } from '../stores/segmentEditScope.js';
  import { activeComponentPropertiesTab } from '../stores/propertiesPanelContext.js';
  import { resolveStateScopedControl } from '../utils/interactionRuntime.js';
  import { BASE_STATE_TARGET, buildStateTargetOptions, findStateTargetOption } from '../utils/stateTargets.js';

  const MIN_PROPERTIES_PANEL_WIDTH = 600;
  const UI_STATE_STORAGE_KEY = 'ce.propertiesPanel.uiState.v1';
  const PREVIEW_INFO_TEXT = 'Preview is active. Click, hover, or focus controls on the canvas to inspect live runtime values here.';

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

  let contextMode = $derived($selectedComponentId != null ? 'component' : 'panel');

  // Owner names for header overlays
  let panelName = $derived($activePanel?.name ?? 'Panel');
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
    { id: 'contentlayout', icon: LayoutDashboard, label: 'Content Layout', section: 'ContentLayout' },
    { id: 'mouse',      icon: MousePointer,  label: 'Mouse',      section: 'Mouse' },
    { id: 'grid',       icon: Grid3x3,       label: 'Grid',       section: 'Grid' },
    { id: 'icon',       icon: Image,         label: 'Icon',       section: 'Icon' },
    { id: 'effects',    icon: Sparkles,      label: 'Effects',    section: 'Effects' },
    { id: 'behavior',   icon: Settings2,     label: 'Behavior',   section: 'Behavior' },
    { id: 'slider',     icon: SlidersHorizontal, label: 'Slider', section: 'Behavior', when: (control) => String(getSection(control, 'Behavior')?.family ?? '').trim().toLowerCase() === 'range' && String(getSection(control, 'Behavior')?.role ?? '').trim().toLowerCase() === 'slider' },
    { id: 'label',      icon: Type,          label: 'Label',      section: 'Parts', when: (control) => String(getSection(control, 'Behavior')?.family ?? '').trim().toLowerCase() === 'range' && String(getSection(control, 'Behavior')?.role ?? '').trim().toLowerCase() === 'slider' },
    { id: 'states',     icon: Workflow,      label: 'States',     section: 'States' },
    { id: 'value',      icon: Link,          label: 'Value',      section: 'Value' },
    { id: 'segments',   icon: Rows3,         label: 'Segments',   section: 'Value', when: (control) => String(getSection(control, 'Behavior')?.buttonType ?? '').trim().toLowerCase() === 'radio' },
    { id: 'bindings',   icon: Link,          label: 'Bindings',   section: 'Bindings' },
    { id: 'animations', icon: Play,          label: 'Animations', section: 'Animations' },
    { id: 'actions',    icon: Zap,           label: 'Scripts',    section: 'Scripts' },
  ];

  // Only show tabs for sections that exist on the selected component
  let componentTabs = $derived(
    $selectedControl
      ? allComponentTabs.filter((tab) => (
        (!tab.section || hasSection($selectedControl, tab.section))
        && (typeof tab.when === 'function' ? tab.when($selectedControl) : true)
      ))
      : allComponentTabs.filter(t => t.id === 'core' || t.id === 'transform')
  );
  let selectedControlId = $derived($selectedControl?._children?.Core?.id ?? '');
  let selectedStates = $derived(getSection($selectedControl, 'States'));
  let stateTargetOptions = $derived(buildStateTargetOptions(selectedStates));
  let activeScope = $derived($stateEditScope);
  let activeStateTarget = $derived(
    activeScope?.mode === 'state' && activeScope?.stateName
      ? activeScope.stateName
      : BASE_STATE_TARGET
  );
  let activeStateTargetOption = $derived(findStateTargetOption(stateTargetOptions, activeStateTarget));
  let stateTargetBadge = $derived(
    activeStateTargetOption?.id === BASE_STATE_TARGET
      ? ''
      : (activeStateTargetOption?.fullLabel ?? '')
  );
  let stateTargetTooltip = $derived(
    activeStateTargetOption?.id === BASE_STATE_TARGET
      ? ''
      : `Editing ${activeStateTargetOption?.fullLabel ?? activeStateTarget}`
  );
  let scopedComponentControl = $derived.by(() => {
    if (!$selectedControl) return null;
    if (activeStateTarget === BASE_STATE_TARGET) return $selectedControl;
    return resolveStateScopedControl($selectedControl, activeStateTarget);
  });
  let lastScopedControlId = $state('');

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

  $effect(() => {
    if (selectedControlId !== lastScopedControlId) {
      lastScopedControlId = selectedControlId;
      setStateEditScopeBase();
      setSegmentEditScopeAll();
    }
  });

  $effect(() => {
    if (activeStateTarget === BASE_STATE_TARGET) return;
    if (stateTargetOptions.some((option) => option.id === activeStateTarget)) return;
    setStateEditScopeBase();
  });

  $effect(() => {
    if (contextMode !== 'component') {
      activeComponentPropertiesTab.set('');
      return;
    }

    if (viewMode !== 'single') {
      activeComponentPropertiesTab.set('');
      return;
    }

    activeComponentPropertiesTab.set(String(singleTab ?? ''));
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

  function handleComponentTabClick(id, event) {
    main.handleClick(id, event);
  }
</script>

<div class="properties-panel" style="width: {clampedWidth}px;">
  {#if $activePanel}
    <!-- Toolbar area — aligns with editor tab bar (34px) -->
    <PropertiesToolbar
      panel={$activePanel}
      {pinPanelProps}
      {viewMode}
      previewMode={$previewModeEnabled}
      ontogglepin={() => pinPanelProps = !pinPanelProps}
      ontoggleview={toggleViewMode}
      ontogglepreview={togglePreviewMode}
    />

    {#if $previewModeEnabled}
      <div class="preview-wrapper">
        <PreviewInspector />
      </div>

      <div class="info-bar">
        <div class="info-header">Info</div>
        <span class="info-text">{PREVIEW_INFO_TEXT}</span>
      </div>
    {:else if showPinnedPanel}
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
            onclick={handleComponentTabClick}
          />
          <div class="split-content-area">
            <TabContentArea
              {viewMode}
              tabs={componentTabs}
              visibleTabs={visibleComponentTabs}
              singleTabId={singleTab}
              contextMode="component"
              control={$selectedControl}
              scopedControl={scopedComponentControl}
              stateTargetKey={activeStateTarget}
              stateTargetBadge={stateTargetBadge}
              stateTargetTooltip={stateTargetTooltip}
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
          onclick={contextMode === 'component' ? handleComponentTabClick : main.handleClick}
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
              scopedControl={contextMode === 'component' ? scopedComponentControl : null}
              stateTargetKey={contextMode === 'component' ? activeStateTarget : 'base'}
              stateTargetBadge={contextMode === 'component' ? stateTargetBadge : ''}
              stateTargetTooltip={contextMode === 'component' ? stateTargetTooltip : ''}
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

  .preview-wrapper {
    flex: 1;
    min-height: 0;
    overflow: hidden;
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
