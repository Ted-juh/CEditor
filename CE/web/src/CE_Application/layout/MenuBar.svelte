<script>
  import { get } from 'svelte/store';
  import { closeActiveEditorTab, openSettingsTab, openInstrumentHostTab, activeEditorTab, saveActivePanel, saveActivePanelAs, openPanelFromFile, openStandaloneDeviceProfileTab, selectedComponentIds, setActiveEditorTab, buildActivePanelVst3, activePanel, editorZoom, updatePanel } from '../stores/panels.js';
  import { undoAvailable, redoAvailable } from '../stores/history.js';
  import { hasClipboardContent } from '../stores/clipboard.js';
  import { styleClipboard, copyControlStyle, applyStyleToSelection } from '../stores/styleClipboard.js';
  import { INSERT_CATEGORIES } from '../models/insertCatalog.js';
  import { openNewPanelDialog } from '../stores/newPanelDialog.js';
  import { addControl, duplicateControl, removeControl, groupSelectionIntoContainer, ungroupContainer } from '../stores/controls.js';
  import { bringForward, bringToFront, sendBackward, sendToBack, tidyGrid, arrangeCircular } from '../stores/alignment.js';
  import { editMenuAvailability } from '../utils/editMenuAvailability.js';
  import { closeApplication } from '../bridge/bridge.js';
  import { undo, redo } from '../stores/history.js';
  import { cutSelection, copySelection, pasteSelection, selectAll } from '../stores/clipboard.js';
  import { requestFitToWindow, requestZoomStep, requestZoomToSelection } from '../stores/editorCommands.js';
  import { createComponentDocument } from '../stores/componentWorkspace.js';
  import { createScriptWorkspaceDocument, getOrCreateScriptDocForPanel, openScriptWorkspaceFromFile, saveActiveScriptWorkspace, saveActiveScriptWorkspaceAs } from '../stores/scriptWorkspace.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import { createDeviceProfileDraft, deviceProfiles, importDeviceProfile, refreshDeviceProfiles, selectedDeviceProfileId } from '../stores/deviceProfiles.js';
  import { buildInfo, buildLabel } from '../buildInfo.js';
  import { createPerfDebugTimer } from '../utils/perfDebug.js';
  import { isTextEntryTarget } from '../utils/textEntry.js';
  import {
    assignMnemonics, firstFocusableIndex, isFocusableMenuRow, lastFocusableIndex,
    matchMnemonicIndex, nextFocusableIndex, splitLabelForMnemonic, stepMenuName,
  } from '../utils/menuNavigation.js';
  import { clearRecentFiles, groupRecentFiles, recentFileLabel, recentFiles } from '../stores/recentFiles.js';
  import { openComponentLibraryEntry, openDeviceProfileEntry, openRecentFile } from '../stores/recentFileActions.js';
  import {
    PANEL_VISIBILITY_ITEMS, showDisplayPanel, showPropertiesPanel,
    showTreePanel, togglePanelVisibility,
  } from '../stores/panelVisibility.js';
  import { GLOBAL_SHORTCUTS } from '../utils/globalShortcuts.js';
  import { requestAbout, requestDocumentation } from '../stores/editorCommands.js';
  import { runUpdateCheck } from '../stores/updateChannel.js';
  import { componentPickerEntries, shouldOpenDirectly } from '../utils/workspacePickerEntries.js';
  import { openSharedPanelFromFile, sharePanelToFile } from '../stores/panelSharingActions.js';
  import { generatePanelFromProfile } from '../stores/autoPanelActions.js';
  import WorkspacePicker from './WorkspacePicker.svelte';

  // Menu state predicates, evaluated when a dropdown opens. A menu item that
  // is always enabled and never shows state cannot tell the user whether
  // clicking it will do anything — Undo stayed clickable with an empty stack,
  // and "Toggle Grid" never said which way it would toggle.
  const hasPanel = () => !!get(activePanel);
  const hasSelection = () => get(selectedComponentIds).size > 0;
  const canSave = () => get(activeEditorTab)?.type === 'script' || hasPanel();

  // Duplicate / Delete / Group / Ungroup / Arrange all grey out through one table
  // (utils/editMenuAvailability.js), so the menu and its tests cannot disagree about when a
  // command can run — and Ungroup in particular asks the same question Ctrl+Shift+G does.
  const editAvailability = () => editMenuAvailability(get(activePanel), get(selectedComponentIds));

  // Toggle state read reactively (not through `get`) so a checkmark cannot go stale while the
  // menu is open — these three are the only menu items another surface (the icon rail) can flip
  // out from under us.
  let treeVisible = $derived($showTreePanel);
  let propertiesVisible = $derived($showPropertiesPanel);
  let displayVisible = $derived($showDisplayPanel);
  let visibilityFlags = $derived({ tree: treeVisible, properties: propertiesVisible, display: displayVisible });

  let componentLibraryEntries = $derived(componentPickerEntries($customComponentLibrary ?? []));
  let recentGroups = $derived(groupRecentFiles($recentFiles));

  function newCustomComponent() {
    const document = createComponentDocument();
    if (document?.id) setActiveEditorTab({ type: 'component', id: document.id });
  }

  // The picker, not `library[0]`. Opening whichever package happened to sort first — with no
  // dialog, no name, and no way to tell it had chosen — was the review's example of a menu item
  // that lies about what it does. The rows come from the same builder the tab strip uses.
  function openSavedCustomComponent() {
    const entries = componentLibraryEntries;
    if (shouldOpenDirectly(entries)) {
      openComponentLibraryEntry(entries[0].entry);
      return;
    }
    picker = 'component';
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
      openDeviceProfileEntry(profile);
      return;
    }
    importDeviceProfile();
  }

  // One row per profile, rather than a dialog or a silent pick. Generating a panel is a big,
  // visible action — 793 parameters is 1624 controls — so the menu should say which device it is
  // about to do it for before it does it.
  function generateFromProfileItems() {
    refreshDeviceProfiles();
    const profiles = get(deviceProfiles) ?? [];
    if (profiles.length === 0) {
      return [{ label: 'No device profiles', enabled: () => false, action: () => {} }];
    }
    return profiles.map((profile) => ({
      label: profile.name || profile.id,
      action: () => generatePanelFromProfile(profile.id),
    }));
  }

  /** The Open Recent submenu, rebuilt each time it opens — the list moves under it constantly. */
  function recentSubmenuItems() {
    const rows = [];
    for (const group of recentGroups) {
      rows.push({ type: 'header', label: group.label });
      for (const entry of group.entries) {
        rows.push({
          label: recentFileLabel(entry),
          // The path is the only thing that tells two panels called "Kit" apart.
          title: entry.path || `${group.label}: ${entry.name}`,
          action: () => openRecentFile(entry),
        });
      }
    }
    if (rows.length === 0) return [{ label: 'No recent documents', enabled: () => false, action: () => {} }];
    rows.push({ type: 'separator' });
    rows.push({ label: 'Clear Recent', action: () => clearRecentFiles() });
    return rows;
  }

  const menus = {
    File: [
      { label: 'New Panel',  shortcut: 'Ctrl+N', action: () => openNewPanelDialog() },
      { label: 'Open Panel', shortcut: 'Ctrl+O', action: () => openPanelFromFile() },
      // The strongest reason to write a device profile: it already knows every parameter, its
      // range, its choices and the bytes to send, and until this existed the only way to get that
      // onto a screen was to place and bind every control by hand.
      { type: 'submenu', label: 'New Panel from Device Profile', items: generateFromProfileItems },
      { type: 'submenu', label: 'Open Recent', enabled: () => recentGroups.length > 0, items: recentSubmenuItems },
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
      // Sharing is a separate command from Save, and has to be: a .cepanel points at its images
      // by absolute path, so the file that is correct to keep is the file that arrives blank on
      // somebody else's computer. A package embeds them. Naming both "Save" would hide exactly
      // the distinction the user has to make.
      { label: 'Share Panel...', enabled: hasPanel, action: () => sharePanelToFile() },
      { label: 'Open Shared Panel...', action: () => openSharedPanelFromFile() },
      { type: 'separator' },
      { label: 'Close Tab', shortcut: 'Ctrl+W', action: () => closeActiveEditorTab() },
      { label: 'Instrument Host...', action: () => openInstrumentHostTab() },
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
      // Duplicate, Delete, Group, Ungroup and Arrange all worked by shortcut or right-click and
      // appeared in no menu — so Ctrl+G and Ctrl+Shift+G were documented nowhere in the product.
      // A menu is where a keyboard shortcut is advertised; that is most of what it is for.
      { label: 'Duplicate', shortcut: 'Ctrl+D', enabled: () => editAvailability().canDuplicate, action: () => duplicateControl(get(selectedComponentIds)) },
      { label: 'Delete', shortcut: 'Del', enabled: () => editAvailability().canDelete, action: () => {
        for (const id of [...get(selectedComponentIds)]) removeControl(id);
      } },
      { type: 'separator' },
      { label: 'Group into Container', shortcut: 'Ctrl+G', enabled: () => editAvailability().canGroup, action: () => groupSelectionIntoContainer() },
      { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', enabled: () => editAvailability().canUngroup, action: () => {
        const id = editAvailability().ungroupTargetId;
        if (id != null) ungroupContainer(id);
      } },
      { type: 'separator' },
      // Arrange: z-order plus the two layout commands that need a crowd. The four z-order rows
      // print their chords because editorShortcuts.js really does bind them (the ARRANGE block:
      // Ctrl+[ / Ctrl+], Shift for the extremes). Tidy Grid and Arrange in Circle print nothing,
      // because nothing listens for them — a menu that advertises a chord no handler answers is
      // the F1 overlay's old bug (D9), and this menu is not the place to repeat it.
      { type: 'header', label: 'Arrange' },
      { label: 'Bring to Front', shortcut: 'Ctrl+Shift+]', enabled: () => editAvailability().canReorder, action: () => bringToFront() },
      { label: 'Bring Forward', shortcut: 'Ctrl+]', enabled: () => editAvailability().canReorder, action: () => bringForward() },
      { label: 'Send Backward', shortcut: 'Ctrl+[', enabled: () => editAvailability().canReorder, action: () => sendBackward() },
      { label: 'Send to Back', shortcut: 'Ctrl+Shift+[', enabled: () => editAvailability().canReorder, action: () => sendToBack() },
      { label: 'Tidy Grid', enabled: () => editAvailability().canArrangeMany, action: () => tidyGrid() },
      { label: 'Arrange in Circle', enabled: () => editAvailability().canArrangeMany, action: () => arrangeCircular() },
      { type: 'separator' },
      { label: 'Select All', shortcut: 'Ctrl+A', enabled: () => editAvailability().canSelectAll, action: () => selectAll() },
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
    // The three dock toggles had exactly one home — the icon rail — because they were `$state`
    // locals inside App.svelte and nothing else could see them. They live in a store now
    // (stores/panelVisibility.js), App.svelte reads that store rather than keeping its own copy,
    // and the accelerators come from the same GLOBAL_SHORTCUTS table the dispatcher matches on —
    // so the label, the tick and the chord cannot drift from each other or from the layout.
    Window: [
      ...PANEL_VISIBILITY_ITEMS.map((item) => ({
        label: item.label,
        shortcut: panelToggleChord(item.id),
        checked: () => visibilityFlags[item.id] === true,
        action: () => togglePanelVisibility(item.id),
      })),
      { type: 'separator' },
      { label: 'Close Tab', shortcut: 'Ctrl+W', action: () => closeActiveEditorTab() },
    ],
    Help: [
      // Nineteen thousand words of manual shipped in a repository the user does not have. This is
      // the first Help row for a reason: the shortcut list was the only help in the program.
      { label: 'Documentation', action: () => requestDocumentation() },
      { label: 'Keyboard Shortcuts', shortcut: 'F1', action: () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
      }},
      // Was a window.alert with a commit hash in it. The release notes claimed the app states
      // its licence and its unsigned status "in About and on the Export tab", and neither sentence
      // existed anywhere in the program. Both now come out of utils/legalNotices.js.
      { type: 'separator' },
      // Always available, whatever the startup setting says: choosing this IS the consent for the
      // one thing a check costs, which is telling GitHub this machine's IP address. The answer
      // lands in the console and in About.
      { label: 'Check for Updates', action: () => { runUpdateCheck({ userAsked: true }); requestAbout(); } },
      { label: 'About CEditor', action: () => requestAbout() },
    ],
  };

  /**
   * The chord for a panel toggle, read out of the table the dispatcher actually matches on.
   * Hardcoding 'Ctrl+J' here is how a menu ends up advertising a shortcut nobody listens for —
   * the bug D9 was about. If the binding is removed, this returns undefined and the row simply
   * stops claiming one.
   */
  function panelToggleChord(id) {
    return GLOBAL_SHORTCUTS.find((b) => b.id === `toggle-${id}-panel`)?.keys;
  }

  const menuNames = Object.keys(menus);

  // Access keys, assigned once. Both levels go through the same allocator so no two rows of one
  // menu can answer the same letter — a duplicated mnemonic does something arbitrary, which is
  // worse than having none.
  const barMnemonics = assignMnemonics(menuNames);
  const itemMnemonics = Object.fromEntries(
    menuNames.map((name) => [name, assignMnemonics(menus[name].map((item) => (isFocusableMenuRow(item) ? item.label : null)))]),
  );

  let openMenu = $state(null);
  let picker = $state('');
  /** Roving focus inside the open dropdown; -1 means "opened by mouse, nothing focused yet". */
  let focusIndex = $state(-1);
  /** Index of the item whose submenu is open, and the roving focus inside it. */
  let openSubmenuIndex = $state(-1);
  let subFocusIndex = $state(-1);
  /** The menu bar is one tab stop: this is which button that stop is on. */
  let barFocusName = $state(menuNames[0]);

  // Element refs for roving focus. `$state` because the focus effect below must re-run once the
  // refs actually bind — on the frame a menu opens, the effect runs before `bind:this` has filled
  // the array, and a plain array would never tell it to look again.
  let itemEls = $state([]);
  let subEls = $state([]);
  let barEls = $state({});

  let currentItems = $derived(openMenu ? menus[openMenu] : []);
  let currentMnemonics = $derived(openMenu ? itemMnemonics[openMenu] : []);
  let submenuItems = $state([]);
  let submenuMnemonics = $derived(assignMnemonics(submenuItems.map((item) => (isFocusableMenuRow(item) ? item.label : null))));

  function isDisabled(item) {
    return item?.enabled ? !item.enabled() : false;
  }

  $effect(() => {
    if (!openMenu || focusIndex < 0) return;
    itemEls[focusIndex]?.focus();
  });

  $effect(() => {
    if (openSubmenuIndex < 0 || subFocusIndex < 0) return;
    subEls[subFocusIndex]?.focus();
  });

  function closeSubmenu() {
    openSubmenuIndex = -1;
    subFocusIndex = -1;
    submenuItems = [];
    subEls = [];
  }

  function closeMenus({ restoreFocus = false } = {}) {
    const name = openMenu;
    closeSubmenu();
    openMenu = null;
    focusIndex = -1;
    itemEls = [];
    if (restoreFocus && name) barEls[name]?.focus();
  }

  // Timed because this is the click a frozen window was reported on, twice, and nothing in here
  // looks capable of it: opening a menu sets one variable and renders a dozen buttons. If these
  // timings come back small while the window is visibly stuck, the freeze is not the click handler
  // and the stall watch will say which thread it is instead.
  function toggleMenu(name, { focusFirst = false } = {}) {
    const stop = createPerfDebugTimer(`menu toggle ${name}`);
    const reopening = openMenu === name;
    // Opening a menu dismisses the component picker: it is anchored under this same bar and would
    // otherwise sit on top of the dropdown it has nothing to do with.
    picker = '';
    closeSubmenu();
    itemEls = [];
    openMenu = reopening ? null : name;
    barFocusName = name;
    focusIndex = !reopening && focusFirst ? firstFocusableIndex(menus[name]) : -1;
    stop();
  }

  function openSubmenuAt(index, { focusFirst = false } = {}) {
    const item = currentItems[index];
    if (item?.type !== 'submenu' || isDisabled(item)) return;
    subEls = [];
    submenuItems = item.items ? item.items() : [];
    openSubmenuIndex = index;
    focusIndex = index;
    subFocusIndex = focusFirst ? firstFocusableIndex(submenuItems) : -1;
  }

  function handleItemClick(item) {
    if (isDisabled(item)) return;
    const stop = createPerfDebugTimer(`menu action ${item.label}`);
    if (item.action) item.action();
    closeMenus();
    stop();
  }

  function handleWindowClick(e) {
    if (openMenu && !e.target.closest('.menubar')) closeMenus();
    if (picker && !e.target.closest('.menubar')) picker = '';
  }

  function handleWindowKeydown(e) {
    if (e.key === 'Escape') {
      if (picker) { picker = ''; return; }
      if (openSubmenuIndex >= 0) { const at = openSubmenuIndex; closeSubmenu(); focusIndex = at; return; }
      if (openMenu) closeMenus({ restoreFocus: true });
      return;
    }
    // Alt+letter opens a menu, the way every desktop menu bar does. Guarded on a text target for
    // the same reason every other global key handler in this app is (utils/textEntry.js).
    if (!e.altKey || e.ctrlKey || e.metaKey || e.key.length !== 1) return;
    if (isTextEntryTarget(e.target)) return;
    const wanted = e.key.toLowerCase();
    const at = barMnemonics.findIndex((m) => m?.key === wanted);
    if (at < 0) return;
    e.preventDefault();
    const name = menuNames[at];
    if (openMenu === name) { closeMenus({ restoreFocus: true }); return; }
    closeSubmenu();
    itemEls = [];
    openMenu = name;
    barFocusName = name;
    focusIndex = firstFocusableIndex(menus[name]);
  }

  function handleMenuHover(name) {
    if (openMenu !== null && openMenu !== name) {
      closeSubmenu();
      itemEls = [];
      openMenu = name;
      barFocusName = name;
      focusIndex = -1;
    }
  }

  function handleBarKeydown(e, name) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = stepMenuName(menuNames, name, e.key === 'ArrowRight' ? 1 : -1);
      barFocusName = next;
      if (openMenu) {
        closeSubmenu();
        itemEls = [];
        openMenu = next;
        focusIndex = -1;
      }
      barEls[next]?.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (openMenu === name) focusIndex = firstFocusableIndex(menus[name]);
      else toggleMenu(name, { focusFirst: true });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (openMenu !== name) toggleMenu(name);
      focusIndex = lastFocusableIndex(menus[name]);
    }
  }

  function handleDropdownKeydown(e) {
    const items = currentItems;
    if (e.key === 'ArrowDown') { e.preventDefault(); focusIndex = nextFocusableIndex(items, focusIndex, 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusIndex = nextFocusableIndex(items, focusIndex, -1); return; }
    if (e.key === 'Home') { e.preventDefault(); focusIndex = firstFocusableIndex(items); return; }
    if (e.key === 'End') { e.preventDefault(); focusIndex = lastFocusableIndex(items); return; }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (items[focusIndex]?.type === 'submenu') { openSubmenuAt(focusIndex, { focusFirst: true }); return; }
      const next = stepMenuName(menuNames, openMenu, 1);
      closeSubmenu();
      itemEls = [];
      openMenu = next;
      barFocusName = next;
      focusIndex = firstFocusableIndex(menus[next]);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = stepMenuName(menuNames, openMenu, -1);
      closeSubmenu();
      itemEls = [];
      openMenu = prev;
      barFocusName = prev;
      focusIndex = firstFocusableIndex(menus[prev]);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = items[focusIndex];
      if (item?.type === 'submenu') openSubmenuAt(focusIndex, { focusFirst: true });
      else if (item) handleItemClick(item);
      return;
    }
    if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
    const match = matchMnemonicIndex(items, currentMnemonics, e.key, focusIndex);
    if (match < 0) return;
    e.preventDefault();
    focusIndex = match;
    const item = items[match];
    if (item.type === 'submenu') openSubmenuAt(match, { focusFirst: true });
    else if (!isDisabled(item)) handleItemClick(item);
  }

  function handleSubmenuKeydown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); subFocusIndex = nextFocusableIndex(submenuItems, subFocusIndex, 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); subFocusIndex = nextFocusableIndex(submenuItems, subFocusIndex, -1); return; }
    if (e.key === 'Home') { e.preventDefault(); subFocusIndex = firstFocusableIndex(submenuItems); return; }
    if (e.key === 'End') { e.preventDefault(); subFocusIndex = lastFocusableIndex(submenuItems); return; }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const at = openSubmenuIndex;
      closeSubmenu();
      focusIndex = at;
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = submenuItems[subFocusIndex];
      if (item) handleItemClick(item);
      return;
    }
    if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
    const match = matchMnemonicIndex(submenuItems, submenuMnemonics, e.key, subFocusIndex);
    if (match < 0) return;
    e.preventDefault();
    subFocusIndex = match;
    if (!isDisabled(submenuItems[match])) handleItemClick(submenuItems[match]);
  }

  function handlePickerPick(row) {
    picker = '';
    openComponentLibraryEntry(row.entry);
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<!-- A real menubar, not a <nav>: role="menubar" carries one tab stop, roving focus and
     aria-expanded per menu. The icon rail (layout/IconPanel.svelte) already models the
     button/drawer half of this; a menu bar owes the arrow keys and access keys as well. -->
<div class="menubar" role="menubar" aria-label="Main menu">
  {#each menuNames as name, barIndex}
    {@const mnemonic = barMnemonics[barIndex]}
    {@const parts = splitLabelForMnemonic(name, mnemonic)}
    <div class="menu-wrapper">
      <button
        class="menu-item"
        class:active={openMenu === name}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={openMenu === name}
        aria-controls="menu-{name}"
        tabindex={barFocusName === name ? 0 : -1}
        bind:this={barEls[name]}
        onclick={() => toggleMenu(name)}
        onkeydown={(e) => handleBarKeydown(e, name)}
        onfocus={() => { barFocusName = name; }}
        onmouseenter={() => handleMenuHover(name)}
      >
        {parts.before}{#if parts.letter}<u>{parts.letter}</u>{/if}{parts.after}
      </button>

      {#if openMenu === name}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="dropdown"
          id="menu-{name}"
          role="menu"
          aria-label={name}
          tabindex="-1"
          onkeydown={handleDropdownKeydown}
        >
          {#each menus[name] as item, index}
            {#if item.type === 'separator'}
              <div class="dropdown-separator" role="separator"></div>
            {:else if item.type === 'header'}
              <div class="dropdown-header" role="presentation">{item.label}</div>
            {:else}
              {@const itemMnemonic = currentMnemonics[index]}
              {@const label = splitLabelForMnemonic(item.label, itemMnemonic)}
              {@const disabled = isDisabled(item)}
              <button
                class="dropdown-item"
                class:focused={focusIndex === index}
                role={item.checked ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={item.checked ? item.checked() : undefined}
                aria-haspopup={item.type === 'submenu' ? 'menu' : undefined}
                aria-expanded={item.type === 'submenu' ? openSubmenuIndex === index : undefined}
                class:is-disabled={disabled}
                aria-disabled={disabled}
                tabindex={focusIndex === index ? 0 : -1}
                title={item.title ?? undefined}
                bind:this={itemEls[index]}
                onmouseenter={() => {
                  focusIndex = index;
                  if (item.type === 'submenu') openSubmenuAt(index);
                  else if (openSubmenuIndex >= 0) closeSubmenu();
                }}
                onclick={() => (item.type === 'submenu' ? openSubmenuAt(index, { focusFirst: true }) : handleItemClick(item))}
              >
                {#if item.checked}
                  <span class="item-check" aria-hidden="true">{item.checked() ? '✓' : ''}</span>
                {/if}
                <span class="item-label">{label.before}{#if label.letter}<u>{label.letter}</u>{/if}{label.after}</span>
                {#if item.shortcut}
                  <span class="item-shortcut">{item.shortcut}</span>
                {/if}
                {#if item.type === 'submenu'}
                  <span class="item-arrow" aria-hidden="true">&#9656;</span>
                {/if}
              </button>

              {#if item.type === 'submenu' && openSubmenuIndex === index}
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <div
                  class="dropdown submenu"
                  role="menu"
                  aria-label={item.label}
                  tabindex="-1"
                  onkeydown={handleSubmenuKeydown}
                >
                  {#each submenuItems as subItem, subIndex}
                    {#if subItem.type === 'separator'}
                      <div class="dropdown-separator" role="separator"></div>
                    {:else if subItem.type === 'header'}
                      <div class="dropdown-header" role="presentation">{subItem.label}</div>
                    {:else}
                      {@const subLabel = splitLabelForMnemonic(subItem.label, submenuMnemonics[subIndex])}
                      <button
                        class="dropdown-item"
                        class:focused={subFocusIndex === subIndex}
                        role="menuitem"
                        class:is-disabled={isDisabled(subItem)}
                        aria-disabled={isDisabled(subItem)}
                        tabindex={subFocusIndex === subIndex ? 0 : -1}
                        title={subItem.title ?? undefined}
                        bind:this={subEls[subIndex]}
                        onmouseenter={() => { subFocusIndex = subIndex; }}
                        onclick={() => handleItemClick(subItem)}
                      >
                        <span class="item-label">{subLabel.before}{#if subLabel.letter}<u>{subLabel.letter}</u>{/if}{subLabel.after}</span>
                      </button>
                    {/if}
                  {/each}
                </div>
              {/if}
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  {#if picker === 'component'}
    <WorkspacePicker
      title="Open Component"
      entries={componentLibraryEntries}
      emptyText="No saved component packages yet."
      anchorStyle="left: 8px; top: calc(100% + 2px);"
      onPick={handlePickerPick}
      onClose={() => { picker = ''; }}
    />
  {/if}

  <span class="build-stamp" title="Build {buildInfo.sha} · {buildInfo.branch} · {buildInfo.time}">
    build {buildLabel}
  </span>
</div>

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

  .menu-item.active,
  .menu-item:focus-visible {
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

  /* A submenu hangs off its parent row, not off the menu bar. `top: 0` puts its first item level
     with the row that opened it, which is what makes the pointer travel feel right. */
  .dropdown.submenu {
    top: 0;
    left: calc(100% - 4px);
    z-index: 210;
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

  /* aria-disabled, not the `disabled` attribute. A disabled button is not focusable, and the
     roving focus this menu now runs on would step onto it, move the highlight, and leave the
     real DOM focus behind — so the one user who most needs to be told the command exists is the
     one who is never told. The click guard is in handleItemClick. */
  .dropdown-item.is-disabled {
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

  .item-label u {
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
  }

  .dropdown-item:hover:not(.is-disabled),
  .dropdown-item.focused:not(.is-disabled) {
    background: #094771;
    color: #FFF;
  }

  /* Keyboard focus moves between items rather than to them, so the browser ring would fight the
     roving highlight above. The .focused row IS the focus indicator. */
  .dropdown-item:focus {
    outline: none;
  }

  .item-arrow {
    color: #888;
    font-size: 10px;
    margin-left: 8px;
    flex-shrink: 0;
  }

  .item-shortcut {
    color: #777;
    font-size: 11px;
    margin-left: 24px;
    flex-shrink: 0;
  }

  .dropdown-item:hover .item-shortcut,
  .dropdown-item.focused .item-shortcut {
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
