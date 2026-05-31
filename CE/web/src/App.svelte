<script>
  import { onMount } from 'svelte';
  import MenuBar from './CE_Application/layout/MenuBar.svelte';
  import IconPanel from './CE_Application/layout/IconPanel.svelte';
  import EditorCanvas from './CE_Application/editor/EditorCanvas.svelte';
  import PropertiesPanel from './CE_Application/panels/PropertiesPanel.svelte';
  import DisplayPanel from './CE_Application/panels/DisplayPanel.svelte';
  import StatusBar from './CE_Application/layout/StatusBar.svelte';
  import ComponentTree from './CE_Application/panels/ComponentTree.svelte';
  import ShortcutsOverlay from './CE_Application/layout/ShortcutsOverlay.svelte';
  import CommonPropertyBar from './CE_Application/layout/CommonPropertyBar.svelte';
  import ZoomBar from './CE_Application/layout/ZoomBar.svelte';
  import CutoutDebugPage from './CE_Application/debug/CutoutDebugPage.svelte';
  import { initPanelBridge, openSettingsTab, activeEditorTab, flushUnsavedSessionSnapshot, addPanel } from './CE_Application/stores/panels.js';
  import { initScriptWorkspaceBridge } from './CE_Application/stores/scriptWorkspace.js';
  import { initAppSettingsBridge } from './CE_Application/stores/appSettings.js';
  import { initConsoleBridge } from './CE_Application/stores/console.js';
  import { initHistory, undo, redo } from './CE_Application/stores/history.js';
  import { customComponentLibrary } from './CE_Application/stores/customComponentLibrary.js';
  import { requestZoomToSelection } from './CE_Application/stores/editorCommands.js';
  import { componentWorkspaceMode } from './CE_Application/stores/componentWorkspace.js';
  import { colorTarget } from './CE_Application/stores/colorTarget.js';
  import { gradientTarget } from './CE_Application/stores/gradientTarget.js';
  import { displayTabRequest } from './CE_Application/stores/displayTab.js';
  import { readStoredBool, readStoredNumber, writeStoredJson } from './CE_Application/utils/localStorageState.js';
  import { syncPerfDebugToNative } from './CE_Application/utils/perfDebug.js';
  import { createCustomComponentStressPanel, createCustomComponentStressTest } from './CE_Application/utils/customComponentStressTest.js';

  const isCutoutDebug = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('debug') === 'cutout';

  if (!isCutoutDebug) {
    initPanelBridge();
    initScriptWorkspaceBridge();
    initConsoleBridge();
    syncPerfDebugToNative();
    initAppSettingsBridge();
    initHistory();
  }

  function handleGlobalKeyDown(e) {
    if (isCutoutDebug) return;

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
  let componentDesignerWorkspaceActive = $derived($componentWorkspaceMode === 'surface');
  let scriptWorkspaceActive = $derived($activeEditorTab?.type === 'script');
  let chromeWorkspaceActive = $derived(componentDesignerWorkspaceActive || scriptWorkspaceActive);
  let effectiveShowPropertiesPanel = $derived(!scriptWorkspaceActive && showPropertiesPanel);
  let effectiveShowTreePanel = $derived(!scriptWorkspaceActive && showTreePanel);
  let effectiveShowDisplayPanel = $derived(!scriptWorkspaceActive && showDisplayPanel);
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

  function startPropsResize(e) {
    isResizingProps = true;
    const startX = e.clientX;
    const startWidth = propertiesPanelWidth;

    function onMouseMove(e) {
      const delta = startX - e.clientX;
      const maxWidth = Math.max(MIN_PROPERTIES_PANEL_WIDTH, window.innerWidth - 120);
      propertiesPanelWidth = Math.max(MIN_PROPERTIES_PANEL_WIDTH, Math.min(maxWidth, startWidth + delta));
    }

    function onMouseUp() {
      isResizingProps = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function startTreeResize(e) {
    isResizingTree = true;
    const startX = e.clientX;
    const startWidth = treePanelWidth;

    function onMouseMove(e) {
      const delta = startX - e.clientX;
      treePanelWidth = Math.max(120, Math.min(400, startWidth + delta));
    }

    function onMouseUp() {
      isResizingTree = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function startDisplayResize(e) {
    isResizingDisplay = true;
    const startY = e.clientY;
    const startHeight = displayPanelHeight;

    function onMouseMove(e) {
      const delta = startY - e.clientY;
      displayPanelHeight = Math.max(80, Math.min(maxDisplayPanelHeight(), startHeight + delta));
    }

    function onMouseUp() {
      isResizingDisplay = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

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

{#if isCutoutDebug}
  <CutoutDebugPage />
{:else}
    <div
      class="app"
    class:component-workspace-active={componentDesignerWorkspaceActive}
    class:script-workspace-active={scriptWorkspaceActive}
    style="--props-width: {effectiveShowPropertiesPanel ? propertiesPanelWidth + 'px' : '0px'}; --resize-width: {effectiveShowPropertiesPanel ? '8px' : '0px'}"
  >
    <div class="menubar-area">
      <MenuBar />
    </div>

    <div class="icon-panel-area">
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
    </div>

    <div class="center-area">
      <div class="editor-top-row">
        <div class="editor-canvas-col">
          <div class="editor-canvas-area">
            <EditorCanvas />
          </div>
          {#if !isSettingsTab && !chromeWorkspaceActive}
            <div class="common-bar-area">
              <CommonPropertyBar />
            </div>
            <div class="zoom-bar-area">
              <ZoomBar />
            </div>
          {/if}
        </div>
        {#if effectiveShowTreePanel}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="tree-resize-handle" class:active={isResizingTree} onmousedown={startTreeResize}></div>
          <div class="tree-area" style="flex: 0 0 {treePanelWidth}px;">
            <ComponentTree />
          </div>
        {/if}
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="display-resize-handle" class:active={isResizingDisplay} onmousedown={startDisplayResize} style="display: {effectiveShowDisplayPanel ? 'block' : 'none'}"></div>
      <div class="display-panel-area" style="flex: 0 0 {displayPanelBasis}; display: {effectiveShowDisplayPanel ? 'block' : 'none'}">
        <DisplayPanel onTabChange={handleDisplayTabChange} />
      </div>
    </div>

    {#if effectiveShowPropertiesPanel}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resize-handle" class:active={isResizingProps} onmousedown={startPropsResize}></div>

      <div class="properties-area">
        <PropertiesPanel width={propertiesPanelWidth} />
      </div>
    {/if}

    <div class="statusbar-area">
      <StatusBar />
    </div>
  </div>

  {#if showShortcuts}
    <ShortcutsOverlay show={showShortcuts} onclose={() => showShortcuts = false} />
  {/if}
{/if}

<style>
  .app {
    width: 100vw;
    height: 100vh;
    display: grid;
    grid-template-columns: 48px 1fr var(--resize-width) var(--props-width);
    grid-template-rows: 28px 1fr 24px;
    grid-template-areas:
      "icon    menu    menu    menu"
      "icon    center  resize  props"
      "status  status  status  status";
    overflow: hidden;
    background: #1E1E1E;
    user-select: none;
  }

  .menubar-area    { grid-area: menu; }
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
  .common-bar-area {
    flex: 0 0 32px;
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
