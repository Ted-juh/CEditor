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
  import AboutOverlay from './CE_Application/layout/AboutOverlay.svelte';
  import { runStartupUpdateCheck } from './CE_Application/stores/updateChannel.js';
  import HelpOverlay from './CE_Application/layout/HelpOverlay.svelte';
  import ContextBar from './CE_Application/layout/ContextBar.svelte';
  import CutoutDebugPage from './CE_Application/debug/CutoutDebugPage.svelte';
  import BehaviorDesigner from './CE_Application/editor/BehaviorDesigner.svelte';
  import { initPanelBridge, openSettingsTab, activeEditorTab, flushUnsavedSessionSnapshot, addPanel, activePanel, clearSelection, closeActiveEditorTab, openPanelFromFile, saveActivePanel, saveActivePanelAs, selectComponent, selectedComponentIds } from './CE_Application/stores/panels.js';
  import { get } from 'svelte/store';
  import { duplicateControl, groupSelectionIntoContainer, removeControl, ungroupContainer, updateControlProperty } from './CE_Application/stores/controls.js';
  import { copySelection, cutSelection, pasteSelection, selectAll } from './CE_Application/stores/clipboard.js';
  import { deleteSelectedGuide } from './CE_Application/stores/guides.js';
  import { applyStyleToSelection, copyControlStyle } from './CE_Application/stores/styleClipboard.js';
  import { previewModeEnabled } from './CE_Application/stores/interactionPreview.js';
  import { saveActiveScriptWorkspace, saveActiveScriptWorkspaceAs } from './CE_Application/stores/scriptWorkspace.js';
  import { handleEditorShortcut } from './CE_Application/utils/editorShortcuts.js';
  import { isEditableTarget, resolveGlobalShortcut } from './CE_Application/utils/globalShortcuts.js';
  import { initScriptWorkspaceBridge } from './CE_Application/stores/scriptWorkspace.js';
  import { initAppSettingsBridge } from './CE_Application/stores/appSettings.js';
  import { initConsoleBridge } from './CE_Application/stores/console.js';
  import { initScriptConsoleBridge } from './CE_Application/stores/scriptConsole.js';
  import { initScriptModules } from './CE_Application/stores/scriptModules.js';
  import ScriptNotifications from './CE_Application/layout/ScriptNotifications.svelte';
  import ScriptDialog from './CE_Application/layout/ScriptDialog.svelte';
  import NewPanelDialog from './CE_Application/layout/NewPanelDialog.svelte';
  import { openNewPanelDialog } from './CE_Application/stores/newPanelDialog.js';
  import { initPanelRuntime } from './CE_Application/scripting/panelRuntime.js';
  import { initHistory, undo, redo, flushHistory } from './CE_Application/stores/history.js';
  import { initPresetChoiceSync } from './CE_Application/stores/presetChoiceSync.js';
  import { customComponentLibrary } from './CE_Application/stores/customComponentLibrary.js';
  import { aboutSignal, documentationSignal, requestFitToWindow, requestZoomStep, requestZoomToSelection } from './CE_Application/stores/editorCommands.js';
  import { componentWorkspaceMode } from './CE_Application/stores/componentWorkspace.js';
  import { colorTarget } from './CE_Application/stores/colorTarget.js';
  import { gradientTarget } from './CE_Application/stores/gradientTarget.js';
  import { displayTabRequest } from './CE_Application/stores/displayTab.js';
  import { readStoredBool, readStoredNumber, writeStoredJson } from './CE_Application/utils/localStorageState.js';
  import { showDisplayPanel, showPropertiesPanel, showTreePanel, togglePanelVisibility } from './CE_Application/stores/panelVisibility.js';
  import { clampDockHeight, maxDisplayDockHeight, resolveDockHeight } from './CE_Application/utils/displayDock.js';
  import { advanceWorkspaceSwap, workspaceSwapPhase } from './CE_Application/utils/chromeMotion.js';
  import { startPerfDebugStallWatch, syncPerfDebugToNative } from './CE_Application/utils/perfDebug.js';
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
    startPerfDebugStallWatch();   // both sides watch, so a frozen window says which side froze
    initAppSettingsBridge();
    initHistory();
    initPresetChoiceSync(); // preset-sourced selector rows follow scans + profile sources
  }

  function saveActiveTab({ saveAs = false } = {}) {
    if (get(activeEditorTab)?.type === 'script') {
      if (saveAs) saveActiveScriptWorkspaceAs(); else saveActiveScriptWorkspace();
      return;
    }
    if (saveAs) saveActivePanelAs(); else saveActivePanel();
  }

  function handleGlobalKeyDown(e) {
    if (isCutoutDebug || isBehaviorDebug) return;

    const editableTarget = isEditableTarget(e.target);
    const command = resolveGlobalShortcut(e, { editableTarget });

    if (command) {
      e.preventDefault();
      switch (command) {
        case 'toggle-shortcuts': showShortcuts = !showShortcuts; break;
        case 'save': saveActiveTab(); break;
        case 'save-as': saveActiveTab({ saveAs: true }); break;
        case 'new-panel': openNewPanelDialog(); break;
        case 'open-panel': openPanelFromFile(); break;
        case 'close-tab': closeActiveEditorTab(); break;
        case 'open-settings': openSettingsTab(); break;
        case 'toggle-display-panel': togglePanelVisibility('display'); break;
        case 'toggle-tree-panel': togglePanelVisibility('tree'); break;
        case 'toggle-properties-panel': togglePanelVisibility('properties'); break;
        case 'zoom-to-selection': requestZoomToSelection(); break;
        case 'undo': undo(); break;
        case 'redo': redo(); break;
      }
      return;
    }

    // Fallback for the canvas editing shortcuts (Delete, Ctrl+D/C/X/V/A/G,
    // arrows). EditorCanvas dispatches these itself while focus sits inside
    // the canvas wrapper; the moment focus wanders (tree click, toolbar
    // click, marquee mousedown that suppressed the focus transfer) the
    // wrapper handler goes silent and this window-level pass keeps the
    // selection editable. Skipped when the wrapper already handled the key
    // (defaultPrevented), while typing, and in workspaces without a canvas.
    if (e.defaultPrevented || editableTarget) return;
    if ($previewModeEnabled || $componentWorkspaceMode === 'surface') return;
    const panel = get(activePanel);
    if (!panel) return;

    handleEditorShortcut(e, {
      panel,
      panelLocked: panel.locked ?? false,
      gridSize: panel.gridSize ?? 10,
      selectedComponentIds: get(selectedComponentIds),
      zoomIn: () => requestZoomStep(1),
      zoomOut: () => requestZoomStep(-1),
      fitToWindow: requestFitToWindow,
      zoomToSelection: requestZoomToSelection,
      selectAll, pasteSelection, copySelection, cutSelection, duplicateControl,
      removeControl, updateControlProperty, deleteSelectedGuide,
      groupSelectionIntoContainer, ungroupContainer,
      selectComponent, clearSelection,
      copyControlStyle, applyStyleToSelection,
    });
  }

  // The arrow keys nudge through the window-level fallback above whenever focus has wandered out
  // of the canvas wrapper, and EditorCanvas's own keyup never fires in that case — so the tail of
  // a held nudge would sit in the debounce until something unrelated pushed it out. Same flush,
  // same reason, second entry point. flushHistory is a no-op when nothing is pending, so this
  // costs nothing on every other key.
  function handleGlobalKeyUp(e) {
    if (isEditableTarget(e.target)) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      flushHistory();
    }
  }

  const MIN_PROPERTIES_PANEL_WIDTH = 600;
  // The three panel-visibility flags used to live here as `$state` locals, which
  // is why nothing outside App.svelte could read them and the View/Window menu
  // could neither tick a box nor flip one (D6). They are a store now — see
  // stores/panelVisibility.js, which owns their persistence and their keys.
  const UI_STORAGE_KEYS = {
    propertiesPanelWidth: 'ce.ui.propertiesPanelWidth',
    treePanelWidth: 'ce.ui.treePanelWidth',
    displayPanelHeight: 'ce.ui.displayPanelHeight',
    displayPanelHeightUserSized: 'ce.ui.displayPanelHeightUserSized',
  };

  let propertiesPanelWidth = $state(readStoredNumber(UI_STORAGE_KEYS.propertiesPanelWidth, MIN_PROPERTIES_PANEL_WIDTH));
  let isResizingProps = $state(false);
  let treePanelWidth = $state(readStoredNumber(UI_STORAGE_KEYS.treePanelWidth, 200));
  let isResizingTree = $state(false);
  let showShortcuts = $state(false);
  let showAbout = $state(false);
  // The menu cannot reach the overlay directly — it lives here. A signal rather than a shared
  // boolean, so the menu asks and the overlay owns its own closing.
  $effect(() => { if ($aboutSignal > 0) showAbout = true; });

  let showDocumentation = $state(false);
  $effect(() => { if ($documentationSignal > 0) showDocumentation = true; });
  let isSettingsTab = $derived($activeEditorTab?.type === 'settings');
  let viewportHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 900);

  function maxDisplayPanelHeight() {
    return maxDisplayDockHeight(viewportHeight);
  }

  function handleWindowResize() {
    viewportHeight = window.innerHeight;
    viewportWidth = window.innerWidth;
    // Deliberately NOT clamping the stored height here. A window briefly
    // dragged narrow used to permanently shrink a dock the user had sized, and
    // there was no way to get it back except by dragging again. The render
    // basis below clamps, so the dock always fits; the preference survives.
  }

  $effect(() => {
    writeStoredJson(UI_STORAGE_KEYS.propertiesPanelWidth, propertiesPanelWidth);
  });
  $effect(() => {
    writeStoredJson(UI_STORAGE_KEYS.treePanelWidth, treePanelWidth);
  });
  let displayPanelHeight = $state(readStoredNumber(UI_STORAGE_KEYS.displayPanelHeight, 320));
  // Has the user ever dragged the dock splitter? Once they have, tab clicks
  // stop having opinions about height (B8) — and this must be persisted, or the
  // dock forgets on restart and ambushes them all over again.
  let displayHeightUserSized = $state(readStoredBool(UI_STORAGE_KEYS.displayPanelHeightUserSized, false));
  let isResizingDisplay = $state(false);
  let viewportWidth = $state(typeof window === 'undefined' ? 1280 : window.innerWidth);
  let workspaceChrome = $derived(resolveWorkspaceChrome({
    activeTab: $activeEditorTab,
    componentWorkspaceMode: $componentWorkspaceMode,
    viewportWidth,
    showTreePanel: $showTreePanel,
    showDisplayPanel: $showDisplayPanel,
    showPropertiesPanel: $showPropertiesPanel,
  }));
  let componentDesignerWorkspaceActive = $derived(workspaceChrome.workspaceKind === 'component');
  let scriptWorkspaceActive = $derived(workspaceChrome.workspaceKind === 'script');
  let chromeWorkspaceActive = $derived(workspaceChrome.chromeWorkspaceActive);
  let effectiveShowPropertiesPanel = $derived(workspaceChrome.showPropertiesPanel);
  let effectiveShowTreePanel = $derived(workspaceChrome.showTreePanel);
  let effectiveShowDisplayPanel = $derived(workspaceChrome.showDisplayPanel);
  let displayPanelBasis = $derived(`${clampDockHeight(displayPanelHeight, viewportHeight)}px`);

  // A workspace change is announced to CSS as an alternating phase class, which
  // is what lets the arriving frame animate instead of appearing between two
  // frames with nothing to say it moved (E4). See utils/chromeMotion.js.
  let workspaceSwapCount = $state(0);
  let lastWorkspaceKind = null;
  $effect(() => {
    const kind = workspaceChrome.workspaceKind;
    const next = advanceWorkspaceSwap({ kind, previousKind: lastWorkspaceKind, swapCount: workspaceSwapCount });
    lastWorkspaceKind = kind;
    if (next.changed) workspaceSwapCount = next.swapCount;
  });
  let workspaceSwapClass = $derived(workspaceSwapPhase(workspaceSwapCount));

  $effect(() => {
    writeStoredJson(UI_STORAGE_KEYS.displayPanelHeight, displayPanelHeight);
  });
  $effect(() => {
    writeStoredJson(UI_STORAGE_KEYS.displayPanelHeightUserSized, displayHeightUserSized);
  });
  $effect(() => {
    if ($colorTarget || $gradientTarget || $displayTabRequest) {
      showDisplayPanel.set(true);
    }
  });

  // Tab clicks may SUGGEST a height, never impose one. The old table
  // (colors 480, gradient 580) was applied unconditionally and then persisted
  // over whatever the user had dragged — so the dock relayouted the canvas
  // under the pointer mid-task and the user's own height was gone for good.
  function handleDisplayTabChange(tabId) {
    displayPanelHeight = resolveDockHeight({
      tabId,
      currentHeight: displayPanelHeight,
      userSized: displayHeightUserSized,
      viewportHeight,
    });
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
    // The drag itself is what marks the height as the user's. Set on start,
    // not on end, so a drag abandoned halfway still counts — they touched it,
    // which is all the dock needs to know to stop overriding them.
    onDragStart: () => { isResizingDisplay = true; displayHeightUserSized = true; },
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
    // Does nothing unless the user turned the setting on, and the store enforces that rather than
    // this call site — Settings → General → Check for Updates on Startup, off by default.
    // Delayed past the first frames: a network call has no business competing with panel restore
    // for the message thread while the window is still painting.
    setTimeout(() => runStartupUpdateCheck(), 4000);
  });

</script>

<svelte:window onkeydown={handleGlobalKeyDown} onkeyup={handleGlobalKeyUp} onresize={handleWindowResize} onbeforeunload={handleBeforeUnload} oncontextmenu={(e) => e.preventDefault()} />

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
    class:workspace-swap-a={workspaceSwapClass === 'a'}
    class:workspace-swap-b={workspaceSwapClass === 'b'}
    style="--icon-width: {workspaceChrome.iconWidth + 'px'}; --props-width: {effectiveShowPropertiesPanel ? propertiesPanelWidth + 'px' : '0px'}; --resize-width: {effectiveShowPropertiesPanel ? '8px' : '0px'}"
  >
    <div class="menubar-area">
      <MenuBar />
    </div>

    <div class="icon-panel-area">
      <IconPanel
        showDisplayPanel={$showDisplayPanel}
        showPropertiesPanel={$showPropertiesPanel}
        showTreePanel={$showTreePanel}
        togglesEnabled={workspaceChrome.railTogglesEnabled}
        insertEnabled={workspaceChrome.railInsertEnabled}
        previewEnabled={workspaceChrome.workspaceKind === 'panel'}
        onToggleDisplay={() => togglePanelVisibility('display')}
        onToggleProperties={() => togglePanelVisibility('properties')}
        onToggleTree={() => togglePanelVisibility('tree')}
      />
    </div>

    <div class="center-area">
      <div class="editor-top-row">
        <div class="editor-canvas-col">
          {#if !isSettingsTab && !chromeWorkspaceActive}
            <div class="context-bar-area">
              <ContextBar />
            </div>
          {/if}
          <div class="editor-canvas-area">
            <ErrorBoundary label="The canvas">
              <EditorCanvas />
            </ErrorBoundary>
          </div>
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
          <DisplayPanel onTabChange={handleDisplayTabChange} visible={effectiveShowDisplayPanel} />
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

  <NewPanelDialog />

  {#if showShortcuts}
    <ShortcutsOverlay show={showShortcuts} onclose={() => showShortcuts = false} />
  {/if}
  {#if showAbout}
    <AboutOverlay show={showAbout} onclose={() => showAbout = false} />
  {/if}
  {#if showDocumentation}
    <HelpOverlay show={showDocumentation} onclose={() => showDocumentation = false} />
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
  /* One context bar replaces the old Look (60px) + Function (56px) + Zoom
     (24px) stack — auto height (~64px, less with nothing selected), giving
     the canvas the difference. Zoom and view toggles live in the status bar. */
  .context-bar-area {
    flex: 0 0 auto;
    border-bottom: 1px solid #333;
  }
  .display-panel-area {
    border-top: 1px solid #333;
    overflow: hidden;
  }

  /* Workspace swap (E4). Switching to a script / device / screen / component
     tab used to replace the context bar, tree, dock and properties panel
     between two frames, which reads as a glitch rather than as navigation.
     The arriving frame now lifts and fades in over 160ms.

     Two identical animations under two class names, alternated by
     chromeMotion.js: a CSS animation restarts on a change of animation NAME,
     so with a single name a second tab switch inside the same 160ms would
     simply not play. Nothing here gates input — no pointer-events change, no
     handler waits on the animation, and the regions are interactive from the
     first frame. */
  .workspace-swap-a .center-area,
  .workspace-swap-a .properties-area {
    animation: workspace-swap-a 160ms ease-out;
  }
  .workspace-swap-b .center-area,
  .workspace-swap-b .properties-area {
    animation: workspace-swap-b 160ms ease-out;
  }

  @keyframes workspace-swap-a {
    from { opacity: 0.35; transform: translateY(4px); }
    to   { opacity: 1;    transform: none; }
  }
  @keyframes workspace-swap-b {
    from { opacity: 0.35; transform: translateY(4px); }
    to   { opacity: 1;    transform: none; }
  }

  /* Honoured in CSS rather than by a matchMedia read at mount, so flipping the
     OS setting takes effect without a reload. */
  @media (prefers-reduced-motion: reduce) {
    .workspace-swap-a .center-area,
    .workspace-swap-a .properties-area,
    .workspace-swap-b .center-area,
    .workspace-swap-b .properties-area {
      animation: none;
    }
  }
</style>
