<script>
  import { editorTabs, activeEditorTab, activePanel, activePanelDesignerSplit, closePanel, panels, setActiveEditorTab, closeSettingsTab, closeInstrumentHostTab, closeDeviceProfileTab, openPanelFromFile, openStandaloneDeviceProfileTab, openTabToSide, swapEditorSplit, toggleEditorSplitOrientation } from '../stores/panels.js';
  import { closeComponentDocument, createComponentDocument } from '../stores/componentWorkspace.js';
  import { closeScriptWorkspaceDocument, getOrCreateScriptDocForPanel, openScriptWorkspaceFromFile, scriptDocuments } from '../stores/scriptWorkspace.js';
  import { createDeviceProfileDraft, deviceProfiles, importDeviceProfile, refreshDeviceProfiles } from '../stores/deviceProfiles.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import { openNewPanelDialog } from '../stores/newPanelDialog.js';
  import { recentFiles, recentFileLabel, recentKindLabel, RECENT_MENU_LIMIT } from '../stores/recentFiles.js';
  import { openComponentLibraryEntry, openDeviceProfileEntry, openRecentFile } from '../stores/recentFileActions.js';
  import { componentPickerEntries, deviceProfilePickerEntries, shouldOpenDirectly } from '../utils/workspacePickerEntries.js';
  import { applyTabOrder, moveTabKey, pruneTabOrder, seedTabOrder, tabContextAvailability, tabKey, tabOverflowState, tabsToClose } from '../utils/tabStrip.js';
  import { placeMenu } from '../utils/menuPlacement.js';
  import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
  import { canRevealFiles, revealFile } from '../bridge/revealFile.js';
  import WorkspacePicker from '../layout/WorkspacePicker.svelte';

  const TAB_ORDER_STORAGE_KEY = 'ce.ui.tabOrder';
  // Above this the override is stale history, not memory: prune it. Below it, keys for closed
  // documents are kept deliberately so a reopened tab comes back where the user put it.
  const TAB_ORDER_PRUNE_AT = 64;

  let activeTab = $derived($activeEditorTab);
  let splitActive = $derived(!!$activePanelDesignerSplit);
  let splitOrientationLabel = $derived($activePanelDesignerSplit?.orientation === 'horizontal' ? 'Side by Side' : 'Top / Bottom');

  let componentLibraryEntries = $derived(componentPickerEntries($customComponentLibrary ?? []));
  let deviceProfileEntries = $derived(deviceProfilePickerEntries($deviceProfiles ?? []));
  let recentEntries = $derived(($recentFiles ?? []).slice(0, RECENT_MENU_LIMIT));

  /**
   * The tab's file on disk, looked up per tab type.
   *
   * `editorTabs` (panels.js:430) carries only id/name/modified, so the strip has to ask the
   * owning stores. Worth the join: with two panels called "Kit" open, the name is not enough to
   * tell them apart, and there was no tooltip at all — D8's last clause.
   */
  function pathForTab(tab) {
    if (tab.tabType === 'panel') return $panels.find((panel) => panel.id === tab.id)?.filePath ?? '';
    if (tab.tabType === 'script') return $scriptDocuments.find((doc) => doc.id === tab.id)?.filePath ?? '';
    return '';
  }

  const TAB_KIND_LABELS = {
    panel: 'Panel',
    component: 'Custom Component',
    deviceProfile: 'Device Profile',
    script: 'Script Workspace',
    settings: 'Settings',
    screen: 'Screen',
    instrumentHost: 'Hostage',
  };

  function tabTooltip(tab) {
    const kind = TAB_KIND_LABELS[tab.tabType] ?? 'Document';
    const where = tab.filePath || 'Not saved to a file yet';
    const dirty = tab.modified ? '\nUnsaved changes' : '';
    return `${tab.name}\n${kind} · ${where}${dirty}`;
  }

  // --- User ordering (D8: "no tab reorder") -------------------------------------------------
  let tabOrder = $state(Array.isArray(readStoredJson(TAB_ORDER_STORAGE_KEY, [])) ? readStoredJson(TAB_ORDER_STORAGE_KEY, []) : []);
  let orderedTabs = $derived(applyTabOrder($editorTabs, tabOrder).map((tab) => ({ ...tab, filePath: pathForTab(tab) })));
  let draggingKey = $state('');
  let dropTargetKey = $state('');

  $effect(() => { writeStoredJson(TAB_ORDER_STORAGE_KEY, tabOrder); });

  $effect(() => {
    if (tabOrder.length <= TAB_ORDER_PRUNE_AT) return;
    const pruned = pruneTabOrder(tabOrder, $editorTabs);
    if (pruned.length !== tabOrder.length) tabOrder = pruned;
  });

  function handleDragStart(event, tab) {
    draggingKey = tabKey(tab);
    // The strip's own list is the payload; the text/plain copy is there so dropping a tab into a
    // text field pastes something meaningful rather than "[object Object]".
    event.dataTransfer?.setData('text/plain', tab.filePath || tab.name);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(event, tab) {
    if (!draggingKey) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dropTargetKey = tabKey(tab);
  }

  function handleDrop(event, tab) {
    if (!draggingKey) return;
    event.preventDefault();
    // Seed from what is on screen: until the first drag there is no override at all, and moving
    // within an empty list would silently do nothing.
    const seeded = seedTabOrder(orderedTabs, tabOrder);
    tabOrder = moveTabKey(seeded, draggingKey, tabKey(tab));
    draggingKey = '';
    dropTargetKey = '';
  }

  function handleDragEnd() {
    draggingKey = '';
    dropTargetKey = '';
  }

  // --- Overflow (D8: "no overflow UI — a bare overflow-x: auto") -----------------------------
  let stripEl = $state(null);
  let overflow = $state({ overflowing: false, atStart: true, atEnd: true, hiddenBefore: false, hiddenAfter: false });

  function measureOverflow() {
    if (!stripEl) return;
    overflow = tabOverflowState({
      scrollLeft: stripEl.scrollLeft,
      scrollWidth: stripEl.scrollWidth,
      clientWidth: stripEl.clientWidth,
    });
  }

  $effect(() => {
    // Re-measure when the tab list changes as well as when the window does — closing a tab can
    // end the overflow, and a chevron left pointing at nothing is worse than none.
    void orderedTabs.length;
    if (!stripEl) return;
    measureOverflow();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(stripEl);
    return () => observer.disconnect();
  });

  function scrollStrip(direction) {
    stripEl?.scrollBy({ left: direction * Math.max(120, (stripEl.clientWidth ?? 240) * 0.6), behavior: 'smooth' });
  }

  let tabEls = $state({});

  $effect(() => {
    // A tab activated from anywhere else — the menu, a shortcut, opening a file — must not stay
    // scrolled out of sight.
    const key = activeTab ? `${activeTab.type}:${activeTab.id}` : '';
    tabEls[key]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });

  // --- Per-tab context menu (D8) --------------------------------------------------------------
  let tabMenu = $state(null);
  let tabMenuEl = $state(null);
  let tabMenuPlaced = $state(null);

  const viewportSize = () => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  });

  // Measure, then place — the same two-step the canvas context menu uses (utils/menuPlacement.js),
  // because a right-click on the rightmost tab is the ordinary case, not the exotic one.
  $effect(() => {
    const at = tabMenu;
    if (!at || !tabMenuEl) { tabMenuPlaced = null; return; }
    const rect = tabMenuEl.getBoundingClientRect();
    tabMenuPlaced = placeMenu(at.x, at.y, { width: rect.width, height: rect.height }, viewportSize());
  });

  function openTabMenu(event, tab, index) {
    event.preventDefault();
    closeTrays();
    tabMenuPlaced = null;
    tabMenu = { tab, index, x: event.clientX, y: event.clientY };
  }

  function closeTabMenu() {
    tabMenu = null;
    tabMenuPlaced = null;
  }

  let tabMenuAvailability = $derived(tabMenu
    ? tabContextAvailability(orderedTabs, tabMenu.index, tabMenu.tab)
    : { canClose: false, canCloseOthers: false, canCloseToRight: false, canCopyPath: false, canReveal: false });

  function closeMany(mode) {
    if (!tabMenu) return;
    for (const tab of tabsToClose(orderedTabs, tabMenu.index, mode)) closeTab(tab);
    closeTabMenu();
  }

  async function copyTabPath() {
    const path = tabMenu?.tab?.filePath ?? '';
    closeTabMenu();
    if (!path) return;
    try {
      await navigator.clipboard?.writeText(path);
    } catch {
      // Clipboard permission can be refused; the tooltip already shows the path, so there is
      // nothing useful to say and nothing broken to report.
    }
  }

  function revealTab() {
    const path = tabMenu?.tab?.filePath ?? '';
    closeTabMenu();
    revealFile(path);
  }

  // --- New / Open (D8, first clause) ----------------------------------------------------------
  // The modal "New" toggle is gone. It re-purposed Panel/Component/Device between create and open
  // with nothing but a highlight to say which, and Script ignored the mode entirely — so the same
  // button did two different things and one button did neither. Two named menus instead: every
  // row says what it does, and there is no state to read before clicking.
  let tray = $state('');
  let picker = $state('');

  function closeTrays() {
    tray = '';
    picker = '';
  }

  function toggleTray(which) {
    picker = '';
    tray = tray === which ? '' : which;
  }

  function createComponentTab() {
    const document = createComponentDocument();
    if (document?.id) setActiveEditorTab({ type: 'component', id: document.id });
  }

  function createDeviceProfileTab() {
    const profile = createDeviceProfileDraft();
    openStandaloneDeviceProfileTab(profile);
  }

  function createScriptTab() {
    const document = getOrCreateScriptDocForPanel($activePanel?.id, $activePanel?.name);
    if (document?.id) setActiveEditorTab({ type: 'script', id: document.id });
  }

  function runNew(action) {
    closeTrays();
    action();
  }

  function openSavedComponent() {
    tray = '';
    if (shouldOpenDirectly(componentLibraryEntries)) {
      openComponentLibraryEntry(componentLibraryEntries[0].entry);
      return;
    }
    picker = 'component';
  }

  function openSavedDeviceProfile() {
    tray = '';
    refreshDeviceProfiles();
    if (shouldOpenDirectly(deviceProfileEntries)) {
      openDeviceProfileEntry(deviceProfileEntries[0].entry);
      return;
    }
    picker = 'device';
  }

  function handleImportDeviceProfile() {
    closeTrays();
    importDeviceProfile();
  }

  function handleRecent(entry) {
    closeTrays();
    openRecentFile(entry);
  }

  // --- Tab lifecycle (unchanged behaviour) ----------------------------------------------------
  function handleMiddleClick(e, tab) {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tab);
    }
  }

  function handleTabKeyDown(e, tab) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActiveEditorTab(tab);
    }
  }

  function isActive(tab) {
    return activeTab?.type === tab.tabType && activeTab?.id === tab.id;
  }

  function closeTab(tab) {
    if (tab.tabType === 'settings') {
      closeSettingsTab();
    } else if (tab.tabType === 'instrumentHost') {
      closeInstrumentHostTab();
    } else if (tab.tabType === 'deviceProfile') {
      closeDeviceProfileTab(tab.id);
    } else if (tab.tabType === 'component') {
      const nextId = closeComponentDocument(tab.id);
      if (activeTab?.type === 'component' && activeTab?.id === tab.id) {
        setActiveEditorTab(nextId ? { type: 'component', id: nextId } : { type: 'panel', id: null });
      }
    } else if (tab.tabType === 'script') {
      const nextId = closeScriptWorkspaceDocument(tab.id);
      if (activeTab?.type === 'script' && activeTab?.id === tab.id) {
        setActiveEditorTab(nextId ? { type: 'script', id: nextId } : { type: 'panel', id: null });
      }
    } else {
      closePanel(tab.id);
    }
  }

  function handleWindowClick(event) {
    if (tabMenu && !event.target.closest('.tab-context-menu')) closeTabMenu();
    // The New/Open trays live in the create group; the "all open tabs" list hangs off the
    // overflow button at the other end of the strip. A guard that knew only about the first one
    // dismissed the second on the very click that was choosing a row from it.
    if (!tray && !picker) return;
    if (event.target.closest('.tab-create-group') || event.target.closest('.strip-overflow')) return;
    closeTrays();
  }

  function handleWindowKeydown(event) {
    if (event.key !== 'Escape') return;
    if (tabMenu) { closeTabMenu(); return; }
    if (tray || picker) closeTrays();
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="tab-bar">
  {#if overflow.overflowing}
    <button
      class="strip-nav"
      title="Scroll tabs left"
      aria-label="Scroll tabs left"
      disabled={overflow.atStart}
      onclick={() => scrollStrip(-1)}
    >&#8249;</button>
  {/if}

  <div class="tabs" bind:this={stripEl} onscroll={measureOverflow}>
    {#each orderedTabs as tab, index (`${tab.tabType}:${tab.id}`)}
      <div
        class="tab"
        class:active={isActive(tab)}
        class:dragging={draggingKey === tabKey(tab)}
        class:drop-target={dropTargetKey === tabKey(tab) && draggingKey !== tabKey(tab)}
        role="button"
        tabindex="0"
        draggable="true"
        title={tabTooltip(tab)}
        bind:this={tabEls[tabKey(tab)]}
        onclick={() => setActiveEditorTab(tab)}
        onkeydown={(e) => handleTabKeyDown(e, tab)}
        onmousedown={(e) => handleMiddleClick(e, tab)}
        oncontextmenu={(e) => openTabMenu(e, tab, index)}
        ondragstart={(e) => handleDragStart(e, tab)}
        ondragover={(e) => handleDragOver(e, tab)}
        ondragleave={() => { if (dropTargetKey === tabKey(tab)) dropTargetKey = ''; }}
        ondrop={(e) => handleDrop(e, tab)}
        ondragend={handleDragEnd}
      >
        <span class="tab-name">
          {tab.name}
          {#if tab.modified}<span class="modified-dot">●</span>{/if}
        </span>
        {#if tab.tabType === 'deviceProfile' && activeTab?.type === 'panel'}
          <button
            class="tab-side"
            title="Open to side"
            onclick={(e) => { e.stopPropagation(); openTabToSide(tab); }}
          >
            Side
          </button>
        {/if}
        <button
          class="tab-close"
          title="Close"
          onclick={(e) => { e.stopPropagation(); closeTab(tab); }}
        >
          ×
        </button>
      </div>
    {/each}
  </div>

  {#if overflow.overflowing}
    <button
      class="strip-nav"
      title="Scroll tabs right"
      aria-label="Scroll tabs right"
      disabled={overflow.atEnd}
      onclick={() => scrollStrip(1)}
    >&#8250;</button>
    <div class="strip-overflow">
      <button
        class="strip-nav"
        class:open={picker === 'tabs'}
        title="All open tabs ({orderedTabs.length})"
        aria-haspopup="dialog"
        aria-expanded={picker === 'tabs'}
        onclick={() => { tray = ''; picker = picker === 'tabs' ? '' : 'tabs'; }}
      >{orderedTabs.length} &#9662;</button>
      {#if picker === 'tabs'}
        <WorkspacePicker
          title="Open Tabs"
          entries={orderedTabs.map((tab) => ({
            key: tabKey(tab),
            title: `${tab.name}${tab.modified ? ' ●' : ''}`,
            subtitle: tab.filePath || (TAB_KIND_LABELS[tab.tabType] ?? 'Document'),
            tooltip: tabTooltip(tab),
            tab,
          }))}
          emptyText="No open tabs."
          anchorStyle="right: 0; top: calc(100% + 6px);"
          onPick={(row) => { picker = ''; setActiveEditorTab(row.tab); }}
          onClose={() => { picker = ''; }}
        />
      {/if}
    </div>
  {/if}

  <div class="tab-create-group" aria-label="Open or create workspace">
    <button
      class="tray-btn"
      class:open={tray === 'new'}
      aria-haspopup="menu"
      aria-expanded={tray === 'new'}
      title="Create a new document"
      onclick={() => toggleTray('new')}
    >
      <span class="plus-mark">+</span><span>New</span><span class="caret">&#9662;</span>
    </button>
    <button
      class="tray-btn"
      class:open={tray === 'open'}
      aria-haspopup="menu"
      aria-expanded={tray === 'open'}
      title="Open an existing document"
      onclick={() => toggleTray('open')}
    >
      <span>Open</span><span class="caret">&#9662;</span>
    </button>

    {#if tray === 'new'}
      <div class="tray-menu" role="menu" aria-label="New document">
        <button role="menuitem" onclick={() => runNew(openNewPanelDialog)}>Panel&hellip;</button>
        <button role="menuitem" onclick={() => runNew(createComponentTab)}>Custom Component</button>
        <button role="menuitem" onclick={() => runNew(createDeviceProfileTab)}>Device Profile Designer</button>
        <button role="menuitem" onclick={() => runNew(createScriptTab)}>Script Workspace</button>
      </div>
    {:else if tray === 'open'}
      <div class="tray-menu" role="menu" aria-label="Open document">
        <button role="menuitem" onclick={() => runNew(openPanelFromFile)}>Panel&hellip;</button>
        <button role="menuitem" onclick={openSavedComponent}>Saved Custom Component&hellip;</button>
        <button role="menuitem" onclick={openSavedDeviceProfile}>Device Profile&hellip;</button>
        <button role="menuitem" onclick={() => runNew(openScriptWorkspaceFromFile)}>Script Workspace&hellip;</button>
        <div class="tray-separator" role="separator"></div>
        <button role="menuitem" onclick={handleImportDeviceProfile}>Import Device Profile&hellip;</button>
        {#if recentEntries.length}
          <div class="tray-header" role="presentation">Recent</div>
          {#each recentEntries as entry (`${entry.kind}:${entry.path ?? entry.id}`)}
            <button
              role="menuitem"
              class="tray-recent"
              title={entry.path || `${recentKindLabel(entry.kind)}: ${entry.name}`}
              onclick={() => handleRecent(entry)}
            >
              <span class="tray-recent-name">{recentFileLabel(entry)}</span>
              <span class="tray-recent-kind">{recentKindLabel(entry.kind)}</span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}

    {#if picker === 'component'}
      <WorkspacePicker
        title="Open Component"
        entries={componentLibraryEntries}
        emptyText="No saved component packages yet."
        onPick={(row) => { picker = ''; openComponentLibraryEntry(row.entry); }}
        onClose={() => { picker = ''; }}
      />
    {:else if picker === 'device'}
      <WorkspacePicker
        title="Open Device"
        entries={deviceProfileEntries}
        emptyText="No loaded device profiles."
        footerLabel="Import Profile"
        onPick={(row) => { picker = ''; openDeviceProfileEntry(row.entry); }}
        onClose={() => { picker = ''; }}
        onFooter={handleImportDeviceProfile}
      />
    {/if}
  </div>

  {#if splitActive}
    <div class="split-actions">
      <button title="Swap split sides" onclick={swapEditorSplit}>Swap</button>
      <button title="Toggle split orientation" onclick={toggleEditorSplitOrientation}>{splitOrientationLabel}</button>
    </div>
  {/if}
</div>

{#if tabMenu}
  <!-- Hidden for the one frame between "rendered so it can be measured" and "measured, so we
       know where it goes" — a menu that visibly jumps into place reads as a glitch. -->
  <div
    class="tab-context-menu"
    role="menu"
    aria-label="Tab actions"
    bind:this={tabMenuEl}
    style="left:{tabMenuPlaced ? tabMenuPlaced.left : tabMenu.x}px; top:{tabMenuPlaced ? tabMenuPlaced.top : tabMenu.y}px; visibility:{tabMenuPlaced ? 'visible' : 'hidden'};"
  >
    <button role="menuitem" onclick={() => { const tab = tabMenu.tab; closeTabMenu(); closeTab(tab); }}>Close</button>
    <button role="menuitem" disabled={!tabMenuAvailability.canCloseOthers} onclick={() => closeMany('others')}>Close Others</button>
    <button role="menuitem" disabled={!tabMenuAvailability.canCloseToRight} onclick={() => closeMany('right')}>Close to the Right</button>
    <div class="tab-context-separator" role="separator"></div>
    <button
      role="menuitem"
      disabled={!tabMenuAvailability.canCopyPath}
      title={tabMenuAvailability.canCopyPath ? tabMenu.tab.filePath : 'This document has never been saved'}
      onclick={copyTabPath}
    >Copy Path</button>
    <button
      role="menuitem"
      disabled={!tabMenuAvailability.canReveal || !canRevealFiles()}
      title={!tabMenuAvailability.canReveal
        ? 'This document has never been saved'
        : (canRevealFiles() ? 'Show this file in the system file browser' : 'Only available in the desktop app')}
      onclick={revealTab}
    >Reveal in File Browser</button>
  </div>
{/if}

<style>
  .tab-bar {
    display: flex;
    align-items: end;
    height: 100%;
    background: #1A1A1A;
    border-bottom: 1px solid #1A1A1A;
    padding: 0 4px;
    gap: 1px;
    /* The strip inside scrolls; the bar itself must not, or the New/Open group scrolls away
       with the tabs and the overflow chevrons have nothing to sit against. */
    overflow: hidden;
  }

  .tabs {
    display: flex;
    align-items: end;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tabs::-webkit-scrollbar { height: 0; }

  .strip-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    min-width: 20px;
    margin-bottom: 3px;
    padding: 0 5px;
    border: 1px solid #343434;
    border-radius: 4px;
    background: #202020;
    color: #AAA;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    flex: 0 0 auto;
  }

  .strip-nav:hover:not(:disabled) {
    border-color: #5B9BD5;
    color: #EEE;
  }

  .strip-nav:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .strip-nav.open {
    border-color: #5B9BD5;
    color: #EEE;
  }

  .strip-overflow {
    position: relative;
    flex: 0 0 auto;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px 5px 12px;
    background: #252525;
    color: #888;
    font-size: 12px;
    cursor: pointer;
    border-radius: 6px 6px 0 0;
    white-space: nowrap;
    min-width: 0;
    flex-shrink: 0;
    transition: background 0.1s;
    border: 1px solid transparent;
    border-bottom: none;
  }

  .tab:hover {
    background: #2A2A2A;
    color: #BBB;
  }

  .tab.active {
    background: #1E1E1E;
    color: #DDD;
    border-color: #333;
  }

  .tab.dragging {
    opacity: 0.45;
  }

  /* The insertion point, drawn on the tab the drop would displace. A whole-tab highlight would
     read as "this one is selected", which is the opposite of what a drop target means. */
  .tab.drop-target {
    box-shadow: inset 3px 0 0 #5B9BD5;
  }

  .tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }

  .modified-dot {
    color: #5B9BD5;
    font-size: 8px;
    margin-left: 2px;
    vertical-align: middle;
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    border-radius: 3px;
    width: 18px;
    height: 18px;
    padding: 0;
    flex-shrink: 0;
    font-size: 14px;
    line-height: 1;
  }

  .tab-side {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid #3A3A3A;
    color: #777;
    cursor: pointer;
    border-radius: 3px;
    height: 18px;
    padding: 0 5px;
    flex-shrink: 0;
    font-size: 10px;
    line-height: 1;
  }

  .tab-side:hover {
    border-color: #5B9BD5;
    color: #DDD;
  }

  .tab-close:hover {
    background: #444;
    color: #FFF;
  }

  .tab-create-group {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    margin-bottom: 3px;
    padding: 3px;
    border: 1px solid #3A3A3A;
    border-radius: 6px;
    background: #171717;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    flex: 0 0 auto;
  }

  .tray-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 24px;
    padding: 0 9px;
    border: 1px solid #343434;
    border-radius: 5px;
    background: #202020;
    color: #AAA;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }

  .tray-btn:hover,
  .tray-btn.open {
    border-color: #5B9BD5;
    background: rgba(91, 155, 213, 0.16);
    color: #E7F3FF;
  }

  .caret {
    color: #7FB4E8;
    font-size: 9px;
  }

  .plus-mark {
    color: #7FB4E8;
    font-size: 14px;
    font-weight: 900;
    line-height: 1;
  }

  .tray-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    min-width: 220px;
    max-width: calc(100vw - 24px);
    padding: 4px;
    border: 1px solid #3B4652;
    border-radius: 6px;
    background: #171A1D;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
    box-sizing: border-box;
  }

  .tray-menu button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #D8E0E8;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
  }

  .tray-menu button:hover,
  .tray-menu button:focus-visible {
    background: #243241;
  }

  .tray-separator {
    height: 1px;
    margin: 4px 6px;
    background: #2E353C;
  }

  .tray-header {
    padding: 6px 8px 3px;
    color: #77828C;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    user-select: none;
  }

  .tray-recent-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tray-recent-kind {
    color: #77828C;
    font-size: 10px;
    flex-shrink: 0;
  }

  .tab-context-menu {
    position: fixed;
    z-index: 400;
    display: flex;
    flex-direction: column;
    min-width: 180px;
    padding: 4px;
    border: 1px solid #3B4652;
    border-radius: 6px;
    background: #171A1D;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  }

  .tab-context-menu button {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #D8E0E8;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
  }

  .tab-context-menu button:hover:not(:disabled) {
    background: #243241;
  }

  .tab-context-menu button:disabled {
    color: #5A6169;
    cursor: default;
  }

  .tab-context-separator {
    height: 1px;
    margin: 4px 6px;
    background: #2E353C;
  }

  .split-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 6px;
    margin-bottom: 4px;
    padding-left: 8px;
    flex-shrink: 0;
  }

  .split-actions button {
    height: 20px;
    padding: 0 8px;
    background: #252525;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    color: #AAA;
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
  }

  .split-actions button:hover {
    border-color: #5B9BD5;
    color: #DDD;
  }
</style>
