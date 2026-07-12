<script>
  import {
    Paintbrush, Type, Image, Sparkles, Zap, Link, Settings2, Workflow, Play, Cable,
    LayoutDashboard, Grid3x3, Monitor, Box, Move, Frame, MousePointer, Rows3, SlidersHorizontal,
  } from 'lucide-svelte';
  import { activePanel, selectedComponentId } from '../stores/panels.js';
  import { propertyHint } from '../stores/propertyHint.js';
  import { propertyFilter, clearPropertyFilter } from '../stores/propertyFilter.js';
  import { creatorMode, CREATOR_SIMPLE_HIDDEN_TABS } from '../stores/creatorMode.js';
  import { selectedControl, hasSection, getSection, updateControlProperty } from '../stores/controls.js';
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
  import { propertiesTabRequest } from '../stores/propertiesTab.js';
  import { componentWorkspaceMode, openComponentSurfaceWorkspace } from '../stores/componentWorkspace.js';
  import { getComponentPorts } from '../models/componentPorts.js';
  import { resolveStateScopedControl } from '../utils/interactionRuntime.js';
  import { BASE_STATE_TARGET, buildStateTargetOptions, findStateTargetOption } from '../utils/stateTargets.js';
  import {
    PROPERTIES_UI_STATE_KEY_V1,
    PROPERTIES_UI_STATE_KEY_V2,
    migratePropertiesUiState,
    tabAllowedForAudience,
    tabAudience,
  } from '../utils/propertiesTabAudience.js';

  const MIN_PROPERTIES_PANEL_WIDTH = 600;
  const PREVIEW_INFO_TEXT = 'Preview is active. The canvas is running panel behavior; debug inspection is optional.';

  function readStoredUiState() {
    const state = migratePropertiesUiState(
      readStoredJson(PROPERTIES_UI_STATE_KEY_V2, null),
      readStoredJson(PROPERTIES_UI_STATE_KEY_V1, null)
    );
    return {
      ...state,
      multiTabs: new Set(state.multiTabs),
      authorMultiTabs: new Set(state.authorMultiTabs),
      pinnedPanelMultiTabs: new Set(state.pinnedPanelMultiTabs),
    };
  }

  const storedUiState = readStoredUiState();

  let { width = MIN_PROPERTIES_PANEL_WIDTH } = $props();
  let clampedWidth = $derived(Math.max(width, MIN_PROPERTIES_PANEL_WIDTH));

  let contextMode = $derived($selectedComponentId != null ? 'component' : 'panel');

  // Owner names for header overlays
  let panelName = $derived($activePanel?.name ?? 'Panel');
  let componentName = $derived($selectedControl?._children?.Core?.name ?? 'Component');

  // Reset the property search whenever the selected control changes so a stale
  // filter never silently hides another control's properties.
  let lastFilteredControlId = $state(null);
  $effect(() => {
    const id = $selectedControl?._children?.Core?.id ?? null;
    if (id !== lastFilteredControlId) {
      lastFilteredControlId = id;
      clearPropertyFilter();
    }
  });
  let ownerName = $derived(contextMode === 'panel' ? panelName : componentName);
  let selectedIsCustomComponent = $derived(
    String(getSection($selectedControl, 'Core')?.controlType ?? '') === 'CustomComponent'
  );

  // View mode: 'single' or 'multi'
  let viewMode = $state(storedUiState.viewMode);

  // Pin panel properties — show panel props at top even when a component is selected
  let pinPanelProps = $state(storedUiState.pinPanelProps);

  // Main tab state (component tabs, or panel tabs when contextMode === 'panel').
  // Custom components keep two selections — instance vs author context — so
  // opening/closing the Designer workspace never clobbers the other side.
  let singleTab = $state(storedUiState.singleTab);
  let multiTabs = $state(storedUiState.multiTabs);
  let authorSingleTab = $state(storedUiState.authorSingleTab);
  let authorMultiTabs = $state(storedUiState.authorMultiTabs);

  // Audience context (Stage A): authoring tabs render only while the Designer
  // workspace is open; instance tabs only while it is closed.
  let audienceContext = $derived($componentWorkspaceMode === 'surface' ? 'author' : 'instance');
  let useAuthorTabState = $derived(selectedIsCustomComponent && audienceContext === 'author');
  let activeSingleTab = $derived(useAuthorTabState ? authorSingleTab : singleTab);
  let activeMultiTabs = $derived(useAuthorTabState ? authorMultiTabs : multiTabs);

  function setActiveSingleTab(value) {
    if (useAuthorTabState) authorSingleTab = value;
    else singleTab = value;
  }

  function setActiveMultiTabs(value) {
    if (useAuthorTabState) authorMultiTabs = value;
    else multiTabs = value;
  }

  // Pinned-panel tab state (only used when showPinnedPanel is true)
  let pinnedPanelTab = $state(storedUiState.pinnedPanelTab);
  let pinnedPanelMultiTabs = $state(storedUiState.pinnedPanelMultiTabs);

  // Controllers — closures bind to the state vars above. handleClick/isActive
  // are used by both the main tab bar and the pinned panel tab bar.
  const main = createTabViewState({
    getSingle: () => activeSingleTab, setSingle: setActiveSingleTab,
    getMulti:  () => activeMultiTabs, setMulti:  setActiveMultiTabs,
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
    { id: 'devicebindings', icon: Cable,     label: 'Device',     section: 'DeviceBindings' },
    { id: 'animations', icon: Play,          label: 'Animations', section: 'Animations' },
    { id: 'properties', icon: SlidersHorizontal, label: 'Properties', section: 'PublishedProperties', when: (control) => String(getSection(control, 'Core')?.controlType ?? '') === 'CustomComponent' },
    { id: 'interact',   icon: Settings2,     label: 'Interact',   section: 'ValueChannels' },
    { id: 'assets',     icon: Image,         label: 'Assets',     section: 'Assets' },
    { id: 'links',      icon: Workflow,      label: 'Links',      section: 'Links' },
    { id: 'publish',    icon: Cable,         label: 'Publish',    section: 'PublishedProperties' },
    { id: 'testbench',  icon: Play,          label: 'Test Bench', section: 'Designer', when: (control) => String(getSection(control, 'Core')?.controlType ?? '') === 'CustomComponent' },
    { id: 'actions',    icon: Zap,           label: 'Scripts',    section: 'Scripts' },
  ];

  // Only show tabs for sections that exist on the selected component.
  // Custom components are additionally audience-gated (Stage A): instance
  // context hides authoring tabs, author context hides instance ones. Simple
  // creator mode further hides the raw-graph list managers (§11.2) — same
  // data, progressively disclosed.
  let componentTabs = $derived(
    $selectedControl
      ? allComponentTabs.filter((tab) => (
        (!tab.section
          || hasSection($selectedControl, tab.section)
          || (tab.id === 'devicebindings' && getComponentPorts($selectedControl).length > 0))
        && (typeof tab.when === 'function' ? tab.when($selectedControl) : true)
        && tabAllowedForAudience(tab.id, audienceContext, selectedIsCustomComponent)
        && !(selectedIsCustomComponent && $creatorMode === 'simple' && CREATOR_SIMPLE_HIDDEN_TABS.has(tab.id))
      ))
      : allComponentTabs.filter(t => t.id === 'core' || t.id === 'transform')
  );
  let selectedControlId = $derived($selectedControl?._children?.Core?.id ?? '');
  let designerFocusSection = $derived(getSection($selectedControl, 'Designer')?.focusSection ?? '');
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
      ? tabs.filter(t => t.id === activeSingleTab)
      : tabs.filter(t => activeMultiTabs.has(t.id))
  );

  let visibleComponentTabs = $derived(
    viewMode === 'single'
      ? componentTabs.filter(t => t.id === activeSingleTab)
      : componentTabs.filter(t => activeMultiTabs.has(t.id))
  );

  let visiblePinnedPanelTabs = $derived(
    viewMode === 'single'
      ? panelTabs.filter(t => t.id === pinnedPanelTab)
      : panelTabs.filter(t => pinnedPanelMultiTabs.has(t.id))
  );

  function ensureValidMainTabs() {
    const validIds = new Set(tabs.map((tab) => tab.id));
    if (validIds.size === 0) return;

    if (!validIds.has(activeSingleTab)) {
      setActiveSingleTab(tabs[0]?.id ?? 'core');
    }

    const filteredMultiTabs = [...activeMultiTabs].filter((id) => validIds.has(id));
    const nextMultiTabs = filteredMultiTabs.length > 0 ? filteredMultiTabs : [activeSingleTab];
    const currentMultiTabs = [...activeMultiTabs];
    if (
      nextMultiTabs.length !== currentMultiTabs.length
      || nextMultiTabs.some((id, index) => id !== currentMultiTabs[index])
    ) {
      setActiveMultiTabs(new Set(nextMultiTabs));
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

  // External jump-to-tab request (e.g. from the Device insight zone's "Properties" button).
  $effect(() => {
    const req = $propertiesTabRequest;
    if (!req?.tabId) return;
    if (contextMode === 'component' && componentTabs.some((tab) => tab.id === req.tabId)) {
      if (viewMode !== 'single') viewMode = 'single';
      setActiveSingleTab(req.tabId);
    }
    propertiesTabRequest.set(null);
  });

  $effect(() => {
    ensureValidMainTabs();
  });

  $effect(() => {
    ensureValidPinnedTabs();
  });

  $effect(() => {
    writeStoredJson(PROPERTIES_UI_STATE_KEY_V2, {
      viewMode,
      pinPanelProps,
      singleTab,
      multiTabs: [...multiTabs],
      authorSingleTab,
      authorMultiTabs: [...authorMultiTabs],
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

    activeComponentPropertiesTab.set(String(activeSingleTab ?? ''));
  });

  $effect(() => {
    const focusTab = String(designerFocusSection ?? '').trim();
    if (contextMode !== 'component' || !selectedControlId || !focusTab) return;
    if (!componentTabs.some((tab) => tab.id === focusTab)) {
      // A focus request can target an author tab while the workspace is
      // closed (Stage A6): open the workspace first — this effect re-runs
      // once the tab becomes visible and finishes the focus.
      if (
        selectedIsCustomComponent
        && audienceContext === 'instance'
        && tabAudience(focusTab) === 'author'
        && allComponentTabs.some((tab) => tab.id === focusTab)
      ) {
        openComponentSurfaceWorkspace();
      }
      return;
    }

    if (viewMode === 'single') {
      setActiveSingleTab(focusTab);
    } else if (!activeMultiTabs.has(focusTab)) {
      setActiveMultiTabs(new Set([...activeMultiTabs, focusTab]));
    }

    updateControlProperty(selectedControlId, 'Designer.focusSection', '');
  });

  function toggleViewMode() {
    if (viewMode === 'single') {
      viewMode = 'multi';
      setActiveMultiTabs(new Set([activeSingleTab]));
    } else {
      viewMode = 'single';
      if (activeMultiTabs.size > 0) setActiveSingleTab([...activeMultiTabs][0]);
    }
  }

  function toggleCollapse(id) {
    collapsedCards = { ...collapsedCards, [id]: !collapsedCards[id] };
  }

  function handleOpenComponentDesigner(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    openComponentSurfaceWorkspace();
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
            onclick={main.handleClick}
          />
          <div class="split-content-area">
            <TabContentArea
              {viewMode}
              tabs={componentTabs}
              visibleTabs={visibleComponentTabs}
              singleTabId={activeSingleTab}
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
          onclick={main.handleClick}
        />

        <div class="card-area">
          <div class="content-scroll">
            <TabContentArea
              {viewMode}
              {tabs}
              {visibleTabs}
              singleTabId={activeSingleTab}
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

    {#if !$previewModeEnabled && contextMode === 'component' && selectedIsCustomComponent}
      <!-- Custom-component footer: search + Simple/Advanced + the prominent
           designer launch, docked at the bottom of the panel (was at the top). -->
      <div class="component-footer">
        <div class="component-footer-row">
          <div class="property-search">
            <input
              type="text"
              placeholder="Search properties…"
              value={$propertyFilter}
              oninput={(event) => propertyFilter.set(event.currentTarget.value)}
              aria-label="Search properties"
            />
            {#if $propertyFilter}
              <button type="button" class="property-search-clear" aria-label="Clear search" onclick={clearPropertyFilter}>&times;</button>
            {/if}
          </div>
          <div class="creator-mode-toggle" role="radiogroup" aria-label="Creator mode">
            <button
              type="button"
              class:active={$creatorMode === 'simple'}
              onclick={() => creatorMode.set('simple')}
              title="Hide the raw graph editors (Channels, Behaviors, Hit Zones, Bindings, Links, Variants). Nothing is removed — Advanced brings them back."
            >Simple</button>
            <button
              type="button"
              class:active={$creatorMode === 'advanced'}
              onclick={() => creatorMode.set('advanced')}
              title="Expose the full component graph."
            >Advanced</button>
          </div>
        </div>
        <button
          type="button"
          class="component-designer-entry"
          data-testid="properties-component-designer-launch"
          onclick={handleOpenComponentDesigner}
        >
          Open Component Designer
        </button>
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

  /* Docked footer at the bottom of the panel for a selected custom component. */
  .component-footer {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid #2A2A2A;
    background: #1B1B1B;
  }

  .component-footer-row {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }

  .component-footer-row .property-search {
    flex: 1;
    margin: 0;
  }

  .component-footer-row .creator-mode-toggle {
    margin: 0;
    flex: 0 0 auto;
    width: 132px;
  }

  .component-designer-entry {
    flex: 0 0 34px;
    height: 34px;
    margin: 0;
    border: 1px solid #335371;
    border-radius: 4px;
    background: #142538;
    color: #DDEEFF;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .component-designer-entry:hover {
    border-color: #5B9BD5;
    background: #20344B;
  }

  .creator-mode-toggle {
    flex: 0 0 auto;
    display: flex;
    margin: 6px 8px 0 8px;
    border: 1px solid #333;
    border-radius: 4px;
    overflow: hidden;
  }

  .creator-mode-toggle button {
    flex: 1;
    padding: 4px 0;
    border: none;
    background: #1A1A1A;
    color: #8A949E;
    font-size: 10px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
  }

  .creator-mode-toggle button.active {
    background: #173449;
    color: #C7D9EA;
  }

  .creator-mode-toggle button:hover:not(.active) {
    color: #C6CDD4;
  }

  .property-search {
    flex: 0 0 auto;
    position: relative;
    margin: 6px 8px 0 8px;
  }

  .property-search input {
    width: 100%;
    box-sizing: border-box;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 4px;
    color: #DDD;
    font-size: 11px;
    font-family: inherit;
    padding: 5px 22px 5px 8px;
    outline: none;
  }

  .property-search input:focus {
    border-color: #5B9BD5;
  }

  .property-search-clear {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #999;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
  }

  .property-search-clear:hover {
    color: #FFF;
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
