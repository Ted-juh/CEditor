<script>
  import { get } from 'svelte/store';
  import { closeActiveEditorTab, openSettingsTab, activeEditorTab, saveActivePanel, saveActivePanelAs, openPanelFromFile, openStandaloneDeviceProfileTab, selectedComponentIds, setActiveEditorTab, buildActivePanelVst3 } from '../stores/panels.js';
  import { undoAvailable, redoAvailable } from '../stores/history.js';
  import { hasClipboardContent } from '../stores/clipboard.js';
  import { styleClipboard, copyControlStyle, applyStyleToSelection } from '../stores/styleClipboard.js';
  import { INSERT_CATEGORIES } from '../models/insertCatalog.js';
  import { openNewPanelDialog } from '../stores/newPanelDialog.js';
  import { addControl } from '../stores/controls.js';
  import { closeApplication } from '../bridge/bridge.js';
  import { undo, redo } from '../stores/history.js';
  import { cutSelection, copySelection, pasteSelection, selectAll } from '../stores/clipboard.js';
  import { editorZoom, editorZoomIncrement, activePanel, updatePanel } from '../stores/panels.js';
  import { requestFitToWindow, requestZoomStep, requestZoomToSelection } from '../stores/editorCommands.js';
  import { createComponentDocument, createComponentDocumentFromLibraryEntry } from '../stores/componentWorkspace.js';
  import { createScriptWorkspaceDocument, getOrCreateScriptDocForPanel, openScriptWorkspaceFromFile, saveActiveScriptWorkspace, saveActiveScriptWorkspaceAs } from '../stores/scriptWorkspace.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import { createDeviceProfileDraft, deviceProfiles, importDeviceProfile, refreshDeviceProfiles, selectedDeviceProfileId } from '../stores/deviceProfiles.js';
  import { buildInfo, buildLabel } from '../buildInfo.js';
  import { createPerfDebugTimer } from '../utils/perfDebug.js';

  // Menu state predicates, evaluated when a dropdown opens. A menu item that
  // is always enabled and never shows state cannot tell the user whether
  // clicking it will do anything — Undo stayed clickable with an empty stack,
  // and "Toggle Grid" never said which way it would toggle.
  const hasPanel = () => !!get(activePanel);
  const hasSelection = () => get(selectedComponentIds).size > 0;
  const canSave = () => get(activeEditorTab)?.type === 'script' || hasPanel();

  function newCustomComponent() {
    const document = createComponentDocument();
    if (document?.id) setActiveEditorTab({ type: 'component', id: document.id });
  }

  function openSavedCustomComponent() {
    const entry = get(customComponentLibrary)?.[0];
    if (!entry) {
      window.alert?.('No saved custom component packages yet.');
      return;
    }
    const document = createComponentDocumentFromLibraryEntry(entry);
    if (document?.id) setActiveEditorTab({ type: 'component', id: document.id });
  }

  function newDeviceProfile() {
    const profile = createDeviceProfileDraft();
    openStandaloneDeviceProfileTab(profile);
  }

  // Open a fresh device-profile draft; with no model yet, the Designer shows its Detect screen for
  // MIDI-CI discovery (scan -> pick a device -> its drafted profile seeds the editor).
  function discoverDeviceProfile() {
    const profile = createDeviceProfileDraft({ name: 'MIDI-CI Device' });
    openStandaloneDeviceProfileTab(profile);
  }

  function newScriptWorkspace() {
    const panel = get(activePanel);
    const document = getOrCreateScriptDocForPanel(panel?.id, panel?.name);
    if (document?.id) setActiveEditorTab({ type: 'script', id: document.id });
  }

  function openDeviceProfile() {
    refreshDeviceProfiles();
    const profiles = get(deviceProfiles) ?? [];
    const selectedId = get(selectedDeviceProfileId);
    const profile = profiles.find((item) => item.id === selectedId) ?? profiles[0];
    if (profile?.id) {
      openStandaloneDeviceProfileTab(profile);
      return;
    }
    importDeviceProfile();
  }

  const menus = {
    File: [
      { label: 'New Panel',  shortcut: 'Ctrl+N', action: () => openNewPanelDialog() },
      { label: 'Open Panel', shortcut: 'Ctrl+O', action: () => openPanelFromFile() },
      { type: 'separator' },
      { label: 'New Custom Component', action: () => newCustomComponent() },
      { label: 'Open Saved Custom Component', action: () => openSavedCustomComponent() },
      { type: 'separator' },
      { label: 'New Device Profile', action: () => newDeviceProfile() },
      { label: 'Open Device Profile', action: () => openDeviceProfile() },
      { label: 'Import Device Profile...', action: () => importDeviceProfile() },
      { label: 'Discover Device (MIDI-CI)...', action: () => discoverDeviceProfile() },
      { type: 'separator' },
      { label: 'New Script Workspace', action: () => newScriptWorkspace() },
      { label: 'Open Script Workspace', action: () => openScriptWorkspaceFromFile() },
      { type: 'separator' },
      { label: 'Save',       shortcut: 'Ctrl+S', enabled: canSave, action: () => {
        const tab = get(activeEditorTab);
        if (tab?.type === 'script') saveActiveScriptWorkspace();
        else saveActivePanel();
      } },
      { label: 'Save As...', shortcut: 'Ctrl+Shift+S', enabled: canSave, action: () => {
        const tab = get(activeEditorTab);
        if (tab?.type === 'script') saveActiveScriptWorkspaceAs();
        else saveActivePanelAs();
      } },
      { type: 'separator' },
      { label: 'Close Tab', shortcut: 'Ctrl+W', action: () => closeActiveEditorTab() },
      { label: 'Settings...', shortcut: 'Ctrl+,', action: () => openSettingsTab() },
      { type: 'separator' },
      { label: 'Close Program', shortcut: 'Alt+F4', action: () => closeApplication() },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', enabled: () => get(undoAvailable), action: () => undo() },
      { label: 'Redo', shortcut: 'Ctrl+Y', enabled: () => get(redoAvailable), action: () => redo() },
      { type: 'separator' },
      { label: 'Cut',   shortcut: 'Ctrl+X', enabled: hasSelection, action: () => cutSelection() },
      { label: 'Copy',  shortcut: 'Ctrl+C', enabled: hasSelection, action: () => copySelection() },
      { label: 'Paste', shortcut: 'Ctrl+V', enabled: () => hasClipboardContent() && hasPanel(), action: () => pasteSelection() },
      { type: 'separator' },
      { label: 'Select All', shortcut: 'Ctrl+A', enabled: () => (get(activePanel)?.controls?.length ?? 0) > 0, action: () => selectAll() },
      { type: 'separator' },
      { label: 'Copy Style', shortcut: 'Ctrl+Alt+C', enabled: hasSelection, action: () => copyControlStyle() },
      { label: 'Paste Style', shortcut: 'Ctrl+Alt+V', enabled: () => !!get(styleClipboard) && hasSelection(), action: () => applyStyleToSelection() },
    ],
    View: [
      { label: 'Zoom In',  shortcut: 'Ctrl++', enabled: hasPanel, action: () => requestZoomStep(1) },
      { label: 'Zoom Out', shortcut: 'Ctrl+-', enabled: hasPanel, action: () => requestZoomStep(-1) },
      { label: 'Reset Zoom', enabled: hasPanel, action: () => editorZoom.set(100) },
      { label: 'Fit to Window', shortcut: 'Ctrl+0', enabled: hasPanel, action: () => requestFitToWindow() },
      { label: 'Zoom to Selection', shortcut: 'Ctrl+Shift+P', enabled: hasSelection, action: () => requestZoomToSelection() },
      { type: 'separator' },
      { label: 'Grid', enabled: hasPanel, checked: () => get(activePanel)?.gridEnabled === true, action: () => { const p = get(activePanel); if (p) updatePanel(p.id, { gridEnabled: !p.gridEnabled }); } },
      { label: 'Snap to Grid', enabled: hasPanel, checked: () => get(activePanel)?.snapToGrid === true, action: () => { const p = get(activePanel); if (p) updatePanel(p.id, { snapToGrid: !p.snapToGrid }); } },
    ],
    // Every insertable type, from the same catalog the icon rail uses —
    // the hand-written copy here knew 11 of the 47 types and had neither
    // Slider nor Knob.
    Insert: INSERT_CATEGORIES.flatMap((category) => [
      { type: 'header', label: category.label },
      ...category.items.map((item) => ({
        label: item.label,
        enabled: hasPanel,
        action: () => addControl(item.type),
      })),
    ]),
    Build: [
      // "Export Plugin", not "Build VST3": one build now produces every format the panel's Export
      // settings enable — the .vst3 plus a .clap and .lv2 by default. The label deliberately does
      // not list them, because it cannot see the panel's settings from here and a menu item naming
      // a format the user switched off would be a lie in the one place it is hardest to check.
      // The Export tab's build note spells out exactly what this run will produce.
      { label: 'Export Plugin', enabled: hasPanel, action: () => buildActivePanelVst3() },
    ],
    Help: [
      { label: 'Keyboard Shortcuts', shortcut: 'F1', action: () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
      }},
      { label: 'About CEditor', action: () => window.alert?.(`CEditor\n\nBuild ${buildInfo.sha}\nBranch ${buildInfo.branch}\nBuilt ${buildInfo.time}`) },
    ],
  };

  const menuNames = Object.keys(menus);
  let openMenu = $state(null);

  // Timed because this is the click a frozen window was reported on, twice, and nothing in here
  // looks capable of it: opening a menu sets one variable and renders a dozen buttons. If these
  // timings come back small while the window is visibly stuck, the freeze is not the click handler
  // and the stall watch will say which thread it is instead.
  function toggleMenu(name) {
    const stop = createPerfDebugTimer(`menu toggle ${name}`);
    openMenu = openMenu === name ? null : name;
    stop();
  }

  function handleItemClick(item) {
    const stop = createPerfDebugTimer(`menu action ${item.label}`);
    if (item.action) item.action();
    openMenu = null;
    stop();
  }

  function handleWindowClick(e) {
    if (openMenu && !e.target.closest('.menubar')) {
      openMenu = null;
    }
  }

  function handleWindowKeydown(e) {
    if (e.key === 'Escape' && openMenu) openMenu = null;
  }

  function handleMenuHover(name) {
    if (openMenu !== null) {
      openMenu = name;
    }
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<nav class="menubar">
  {#each menuNames as name}
    <div class="menu-wrapper">
      <button
        class="menu-item"
        class:active={openMenu === name}
        onclick={() => toggleMenu(name)}
        onmouseenter={() => handleMenuHover(name)}
      >
        {name}
      </button>

      {#if openMenu === name}
        <div class="dropdown">
          {#each menus[name] as item}
            {#if item.type === 'separator'}
              <div class="dropdown-separator"></div>
            {:else if item.type === 'header'}
              <div class="dropdown-header">{item.label}</div>
            {:else}
              <button
                class="dropdown-item"
                disabled={item.enabled ? !item.enabled() : false}
                onclick={() => handleItemClick(item)}
              >
                {#if item.checked}
                  <span class="item-check">{item.checked() ? '\u2713' : ''}</span>
                {/if}
                <span class="item-label">{item.label}</span>
                {#if item.shortcut}
                  <span class="item-shortcut">{item.shortcut}</span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  <span class="build-stamp" title="Build {buildInfo.sha} · {buildInfo.branch} · {buildInfo.time}">
    build {buildLabel}
  </span>
</nav>

<style>
  .menubar {
    display: flex;
    align-items: center;
    height: 100%;
    background: #2D2D2D;
    border-bottom: 1px solid #1A1A1A;
    padding: 0 4px 0 0;
    gap: 1px;
    position: relative;
    z-index: 100;
  }

  .menu-wrapper {
    position: relative;
  }

  .menu-item {
    background: none;
    border: none;
    color: #CCC;
    font-size: 12px;
    padding: 4px 10px;
    cursor: pointer;
    border-radius: 3px;
    font-family: inherit;
  }

  .menu-item:hover {
    background: #3D3D3D;
    color: #FFF;
  }

  .menu-item.active {
    background: #094771;
    color: #FFF;
  }

  /* Dropdown */
  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 200px;
    max-height: calc(100vh - 60px);
    overflow-y: auto;
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    z-index: 200;
  }

  .dropdown::-webkit-scrollbar { width: 6px; }
  .dropdown::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

  .dropdown-header {
    padding: 6px 12px 3px;
    font-size: 10px;
    color: #777;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    user-select: none;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    color: #CCC;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .dropdown-item:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .item-check {
    width: 14px;
    flex-shrink: 0;
    color: #5B9BD5;
    font-size: 11px;
  }

  .item-label {
    flex: 1;
  }

  .dropdown-item:hover:not(:disabled) {
    background: #094771;
    color: #FFF;
  }

  .item-label {
    flex: 1;
  }

  .item-shortcut {
    color: #777;
    font-size: 11px;
    margin-left: 24px;
    flex-shrink: 0;
  }

  .dropdown-item:hover .item-shortcut {
    color: #AAD;
  }

  .dropdown-separator {
    height: 1px;
    background: #444;
    margin: 4px 8px;
  }

  /* Always-visible build stamp, pushed to the far right of the menu bar. */
  .build-stamp {
    margin-left: auto;
    padding: 0 10px;
    color: #6A6A6A;
    font-size: 11px;
    font-family: inherit;
    white-space: nowrap;
    user-select: text;
  }
</style>
