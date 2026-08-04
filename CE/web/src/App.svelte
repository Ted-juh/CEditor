<script>
  import { onMount } from 'svelte';
  import { dragScrub } from './CE_Application/scrub/dragScrubAction';
  import MenuBar from './CE_Application/layout/MenuBar.svelte';
  import IconPanel from './CE_Application/layout/IconPanel.svelte';
  import EditorCanvas from './CE_Application/editor/EditorCanvas.svelte';
  import PropertiesPanel from './CE_Application/panels/PropertiesPanel.svelte';
  import ErrorBoundary from './CE_Application/components/ErrorBoundary.svelte';
  import DisplayPanel from './CE_Application/panels/DisplayPanel.svelte';
  import StatusBar from './CE_Application/layout/StatusBar.svelte';
  import ComponentTree from './CE_Application/panels/ComponentTree.svelte';
  import ShortcutsOverlay from './CE_Application/layout/ShortcutsOverlay.svelte';
  import AppearanceBar from './CE_Application/layout/AppearanceBar.svelte';
  import FunctionBar from './CE_Application/layout/FunctionBar.svelte';
  import ZoomBar from './CE_Application/layout/ZoomBar.svelte';
  import CutoutDebugPage from './CE_Application/debug/CutoutDebugPage.svelte';
  import BehaviorDesigner from './CE_Application/editor/BehaviorDesigner.svelte';
  import { initPanelBridge, openSettingsTab, activeEditorTab, flushUnsavedSessionSnapshot, addPanel } from './CE_Application/stores/panels.js';
  import { initScriptWorkspaceBridge } from './CE_Application/stores/scriptWorkspace.js';
  import { initAppSettingsBridge } from './CE_Application/stores/appSettings.js';
  import { initConsoleBridge } from './CE_Application/stores/console.js';
  import { initScriptConsoleBridge } from './CE_Application/stores/scriptConsole.js';
  import { initScriptModules } from './CE_Application/stores/scriptModules.js';
  import ScriptNotifications from './CE_Application/layout/ScriptNotifications.svelte';
  import ScriptDialog from './CE_Application/layout/ScriptDialog.svelte';
  import { initPanelRuntime } from './CE_Application/scripting/panelRuntime.js';
  import { initHistory, undo, redo } from './CE_Application/stores/history.js';
  import { initPresetChoiceSync } from './CE_Application/stores/presetChoiceSync.js';
  import { customComponentLibrary } from './CE_Application/stores/customComponentLibrary.js';
  import { requestZoomToSelection } from './CE_Application/stores/editorCommands.js';
  import { componentWorkspaceMode } from './CE_Application/stores/componentWorkspace.js';
  import { colorTarget } from './CE_Application/stores/colorTarget.js';
  import { gradientTarget } from './CE_Application/stores/gradientTarget.js';
  import { displayTabRequest } from './CE_Application/stores/displayTab.js';
  import { readStoredBool, readStoredNumber, writeStoredJson } from './CE_Application/utils/localStorageState.js';
  import { syncPerfDebugToNative } from './CE_Application/utils/perfDebug.js';
  import { createCustomComponentStressPanel, createCustomComponentStressTest } from './CE_Application/utils/customComponentStressTest.js';
  import { resolveWorkspaceChrome } from './CE_Application/utils/workspaceChrome.js';

  const debugRoute = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('debug') : null;
  const isCutoutDebug = debugRoute === 'cutout';
  const isBehaviorDebug = debugRoute === 'behavior';
  // Sample control tree for the standalone BehaviorDesigner debug route (?debug=behavior),
  // so the path-picker is demonstrable without a live panel.
  const behaviorSampleControls = [
    { name: 'cutoff', leaves: ['value', 'normalizedValue', 'midiValue', 'background.fill.colour', 'visible'] },
    { name: 'resonance', leaves: ['value', 'normalizedValue', 'midiValue'] },
    { name: 'filterType', leaves: ['value', 'midiValue'] },
    { name: 'initButton', leaves: ['background.fill.colour', 'text.text', 'visible'] },
  ];
  const behaviorSampleScripts = [
    { name: 'Read synth on open', language: 'lua', scope: 'panel', event: 'onPanelReady',
      source: 'function onPanelReady(info)\n  if info.firstTime then\n    requestDump("patch")\n  end\nend\n' },
    { name: 'Cutoff drives resonance', language: 'lua', scope: 'component', event: 'onValueChanged',
      source: 'function onValueChanged(value)\n  set("resonance.value", scale(value, 0, 127, 0, 80))\nend\n' },
    { name: 'Init patch', language: 'javascript', scope: 'component', event: 'onClick',
      source: 'function onClick(mouse) {\n  noTransmit(() => {\n    set("cutoff.value", 8000)\n    set("resonance.value", 0)\n  })\n}\n' },
    { name: 'Save preset on close', language: 'lua', scope: 'panel', event: 'onPanelClose',
      source: 'function onPanelClose()\n  sendDump("patch")\nend\n' },
  ];

  if (!isCutoutDebug && !isBehaviorDebug) {
    initPanelBridge();
    initScriptWorkspaceBridge();
    initConsoleBridge();
    initScriptConsoleBridge();
    initScriptModules();   // installed ce.ext.* modules, before any script can reach for one
    initPanelRuntime();
    syncPerfDebugToNative();
    initAppSettingsBridge();
    initHistory();
    initPresetChoiceSync(); // preset-sourced selector rows follow scans + profile sources
  }

  function handleGlobalKeyDown(e) {
    if (isCutoutDebug || isBehaviorDebug) return;

    if (e.key === 'F1') {
      e.preventDefault();
      showShortcuts = !showShortcuts;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      requestZoomToSelection();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      openSettingsTab();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  }

  const MIN_PROPERTIES_PANEL_WIDTH = 600;
  const UI_STORAGE_KEYS = {
    propertiesPanelWidth: 'ce.ui.propertiesPanelWidth',
    treePanelWidth: 'ce.ui.treePanelWidth',
    showTreePanel: 'ce.ui.showTreePanel',
    displayPanelHeight: 'ce.ui.displayPanelHeight',
    showDisplayPanel: 'ce.ui.showDisplayPanel',
    showPropertiesPanel: 'ce.ui.showPropertiesPanel',
  };

  let propertiesPanelWidth = $state(readStoredNumber(UI_STORAGE_KEYS.propertiesPanelWidth, MIN_PROPERTIES_PANEL_WIDTH));
  let isResizingProps = $state(false);
  let treePanelWidth = $state(readStoredNumber(UI_STORAGE_KEYS.treePanelWidth, 200));
  let isResizingTree = $state(false);
  let showTreePanel = $state(readStoredBool(UI_STORAGE_KEYS.showTreePanel, true));
  let showShortcuts = $state(false);
  let isSettingsTab = $derived($activeEditorTab?.type === 'settings');
  let viewportHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 900);

  function maxDisplayPanelHeight() {
    return Math.max(140, Math.floor(viewportHeight * 0.44));
  }

  function handleWindowResize() {
    viewportHeight = window.innerHeight;
    viewportWidth = window.innerWidth;
    displayPanelHeight = Math.min(displayPanelHeight, maxDisplayPanelHeight());
  }

  $effect(() => {
    writeStoredJson(UI_STORAGE_KEYS.showTreePanel, showTreePanel);
  });
  $effect(() => {
    writeStoredJson(UI_STORAGE_KEYS.propertiesPanelWidth, propertiesPanelWidth);
  });
  $effect(() => {
    writeStoredJson(UI_STORAGE_KEYS.treePanelWidth, treePanelWidth);
  });
  let displayPanelHeight = $state(readStoredNumber(UI_STORAGE_KEYS.displayPanelHeight, 480));
  let isResizingDisplay = $state(false);
  let showDisplayPanel = $state(readStoredBool(UI_STORAGE_KEYS.showDisplayPanel, false));
  let showPropertiesPanel = $state(readStoredBool(UI_STORAGE_KEYS.showPropertiesPanel, true));
  let viewportWidth = $state(typeof window === 'undefined' ? 1280 : window.innerWidth);
  let workspaceChrome = $derived(resolveWorkspaceChrome({
    activeTab: $activeEditorTab,
    componentWorkspaceMode: $componentWorkspaceMode,
    viewportWidth,
    showTreePanel,
    showDisplayPanel,
    showPropertiesPanel,
  }));
  let componentDesignerWorkspaceActive = $derived(workspaceChrome.workspaceKind === 'component');
  let scriptWorkspaceActive = $derived(workspaceChrome.workspaceKind === 'script');
  let chromeWorkspaceActive = $derived(workspaceChrome.chromeWorkspaceActive);
  let workspaceOwnsChrome = $derived(workspaceChrome.ownsChrome);
  let effectiveShowPropertiesPanel = $derived(workspaceChrome.showPropertiesPanel);
  let effectiveShowTreePanel = $derived(workspaceChrome.showTreePanel);
  let effectiveShowDisplayPanel = $derived(workspaceChrome.showDisplayPanel);
  let displayPanelBasis = $derived(`${Math.min(displayPanelHeight, maxDisplayPanelHeight())}px`);

  $effect(() => {
    writeStoredJson(UI_STORAGE_KEYS.displayPanelHeight, displayPanelHeight);
  });
  $effect(() => {
    writeStoredJson(UI_STORAGE_KEYS.showDisplayPanel, showDisplayPanel);
  });
  $effect(() => {
    writeStoredJson(UI_STORAGE_KEYS.showPropertiesPanel, showPropertiesPanel);
  });
  $effect(() => {
    if ($colorTarget || $gradientTarget || $displayTabRequest) {
      showDisplayPanel = true;
    }
  });
  const tabDefaultHeights = { colors: 480, gradient: 580 };

  function handleDisplayTabChange(tabId) {
    const target = tabDefaultHeights[tabId];
    if (target) displayPanelHeight = Math.min(target, maxDisplayPanelHeight());
  }

  // Pane splitters: relative dragScrub, one CSS pixel per pixel of travel.
  // The panels sit right/below their handles, so leftward/upward drags widen
  // them; the axis is fixed by orientation — no direction settings, by design.
  const propsResizeScrub = $derived({
    axis: 'x',
    tracking: 'relative',
    sensitivity: 1,
    deadZone: 0,
    invertX: true,
    min: MIN_PROPERTIES_PANEL_WIDTH,
    max: typeof window === 'undefined' ? 10000 : Math.max(MIN_PROPERTIES_PANEL_WIDTH, window.innerWidth - 120),
    value: propertiesPanelWidth,
    manageCursor: false,
    onChange: (v) => { propertiesPanelWidth = Math.round(v); },
    onDragStart: () => { isResizingProps = true; },
    onDragEnd: () => { isResizingProps = false; },
  });

  const treeResizeScrub = $derived({
    axis: 'x',
    tracking: 'relative',
    sensitivity: 1,
    deadZone: 0,
    invertX: true,
    min: 120,
    max: 400,
    value: treePanelWidth,
    manageCursor: false,
    onChange: (v) => { treePanelWidth = Math.round(v); },
    onDragStart: () => { isResizingTree = true; },
    onDragEnd: () => { isResizingTree = false; },
  });

  const displayResizeScrub = $derived({
    axis: 'y',
    tracking: 'relative',
    sensitivity: 1,
    deadZone: 0,
    min: 80,
    max: maxDisplayPanelHeight(),
    value: displayPanelHeight,
    manageCursor: false,
    onChange: (v) => { displayPanelHeight = Math.round(v); },
    onDragStart: () => { isResizingDisplay = true; },
    onDragEnd: () => { isResizingDisplay = false; },
  });

  function handleBeforeUnload() {
    flushUnsavedSessionSnapshot();
  }

  function maybeLoadCustomComponentStressTest() {
    if (typeof window === 'undefined' || isCutoutDebug) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('custom_component_stress')) return;
    const requestId = params.get('custom_component_stress') || 'default';
    const sessionKey = `ce.customComponentStress.loaded.${requestId}`;
    if (window.sessionStorage?.getItem(sessionKey) === 'true') return;

    const stress = createCustomComponentStressTest();
    const entries = stress.definitions
      .map((definition) => customComponentLibrary.saveControl(definition.component, definition.metadata))
      .filter(Boolean);
    const panel = createCustomComponentStressPanel(entries);
    addPanel(panel);

    window.__ceCustomComponentStressTest = {
      generatedAt: stress.generatedAt,
      componentCount: entries.length,
      panelId: panel.id,
      panelName: panel.name,
      notes: stress.notes,
    };
    window.sessionStorage?.setItem(sessionKey, 'true');
  }

  onMount(() => {
    maybeLoadCustomComponentStressTest();
  });

</script>

<svelte:window onkeydown={handleGlobalKeyDown} onresize={handleWindowResize} onbeforeunload={handleBeforeUnload} oncontextmenu={(e) => e.preventDefault()} />

{#if isBehaviorDebug}
  <BehaviorDesigner controls={behaviorSampleControls} initialScripts={behaviorSampleScripts} />
{:else if isCutoutDebug}
  <CutoutDebugPage />
{:else}
    <div
    class="app"
    class:component-workspace-active={componentDesignerWorkspaceActive}
    class:script-workspace-active={scriptWorkspaceActive}
    class:compact-panel-workspace={workspaceChrome.compactPanel}
    style="--icon-width: {workspaceChrome.iconWidth + 'px'}; --props-width: {effectiveShowPropertiesPanel ? propertiesPanelWidth + 'px' : '0px'}; --resize-width: {effectiveShowPropertiesPanel ? '8px' : '0px'}"
  >
    <div class="menubar-area">
      <MenuBar />
    </div>

    <div class="icon-panel-area">
      {#if !workspaceOwnsChrome && !workspaceChrome.compactPanel}
        <IconPanel
          {showDisplayPanel}
          {showPropertiesPanel}
          {showTreePanel}
          onToggleDisplay={() => {
            showDisplayPanel = !showDisplayPanel;
          }}
          onToggleProperties={() => {
            showPropertiesPanel = !showPropertiesPanel;
          }}
          onToggleTree={() => {
            showTreePanel = !showTreePanel;
          }}
        />
      {/if}
    </div>

    <div class="center-area">
      <div class="editor-top-row">
        <div class="editor-canvas-col">
          {#if !isSettingsTab && !chromeWorkspaceActive}
            <div class="look-bar-area">
              <AppearanceBar />
            </div>
          {/if}
          <div class="editor-canvas-area">
            <ErrorBoundary label="The canvas">
              <EditorCanvas />
            </ErrorBoundary>
          </div>
          {#if !isSettingsTab && !chromeWorkspaceActive}
            <div class="common-bar-area">
              <FunctionBar />
            </div>
            <div class="zoom-bar-area">
              <ZoomBar />
            </div>
          {/if}
        </div>
        {#if effectiveShowTreePanel}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="tree-resize-handle" role="separator" aria-orientation="vertical" class:active={isResizingTree} use:dragScrub={treeResizeScrub}></div>
          <div class="tree-area" style="flex: 0 0 {treePanelWidth}px;">
            <ComponentTree />
          </div>
        {/if}
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="display-resize-handle" role="separator" aria-orientation="horizontal" class:active={isResizingDisplay} use:dragScrub={displayResizeScrub} style="display: {effectiveShowDisplayPanel ? 'block' : 'none'}"></div>
      <div class="display-panel-area" style="flex: 0 0 {displayPanelBasis}; display: {effectiveShowDisplayPanel ? 'block' : 'none'}">
        <ErrorBoundary label="The display panel">
          <DisplayPanel onTabChange={handleDisplayTabChange} />
        </ErrorBoundary>
      </div>
    </div>

    {#if effectiveShowPropertiesPanel}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resize-handle" role="separator" aria-orientation="vertical" class:active={isResizingProps} use:dragScrub={propsResizeScrub}></div>

      <div class="properties-area">
        <ErrorBoundary label="The properties panel">
          <PropertiesPanel width={propertiesPanelWidth} />
        </ErrorBoundary>
      </div>
    {/if}

    <div class="statusbar-area">
      <StatusBar />
    </div>
  </div>

  <!-- ce.ui.notify() toasts. Mounted once at the root, and fixed-position, so a message survives
       whatever tab or panel is on screen when the script raises it. -->
  <ScriptNotifications />

  <!-- ce.ui.dialog() modals. Root-mounted for the same reason, and above everything: a question
       that can be scrolled out of view is a script left waiting for an answer. -->
  <ScriptDialog />

  {#if showShortcuts}
    <ShortcutsOverlay show={showShortcuts} onclose={() => showShortcuts = false} />
  {/if}
{/if}

<style>
  .app {
    width: 100vw;
    height: 100vh;
    display: grid;
    grid-template-columns: var(--icon-width) 1fr var(--resize-width) var(--props-width);
    grid-template-rows: 28px 1fr 24px;
    grid-template-areas:
      "icon    menu    menu    menu"
      "icon    center  resize  props"
      "status  status  status  status";
    overflow: hidden;
    background: #1E1E1E;
    user-select: none;
  }

  .menubar-area    { grid-area: menu; position: relative; z-index: 1000; }
  .icon-panel-area { grid-area: icon; }
  .center-area     { grid-area: center; display: flex; flex-direction: column; overflow: hidden; }
  .properties-area { grid-area: props; overflow: hidden; }
  .statusbar-area  { grid-area: status; }

  .editor-top-row {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  .editor-canvas-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .tree-area {
    overflow: hidden;
  }

  .tree-resize-handle {
    flex: 0 0 8px;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
  }
  .tree-resize-handle:hover,
  .tree-resize-handle.active {
    background: #5B9BD5;
  }

  .resize-handle {
    grid-area: resize;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
  }
  .resize-handle:hover,
  .resize-handle.active {
    background: #5B9BD5;
  }

  .display-resize-handle {
    flex: 0 0 8px;
    cursor: row-resize;
    background: transparent;
    transition: background 0.15s;
  }
  .display-resize-handle:hover,
  .display-resize-handle.active {
    background: #5B9BD5;
  }

  .editor-canvas-area {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .look-bar-area {
    flex: 0 0 60px;
    border-bottom: 1px solid #333;
  }
  .common-bar-area {
    flex: 0 0 56px;
    border-top: 1px solid #333;
  }

  .zoom-bar-area {
    flex: 0 0 24px;
    border-top: 1px solid #2A2A2A;
  }
  .display-panel-area {
    border-top: 1px solid #333;
    overflow: hidden;
  }
</style>
