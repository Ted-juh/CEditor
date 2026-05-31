<script>
  import { editorTabs, activeEditorTab, activePanelDesignerSplit, addPanel, closePanel, setActiveEditorTab, closeSettingsTab, closeDeviceProfileTab, openPanelFromFile, openStandaloneDeviceProfileTab, openTabToSide, swapEditorSplit, toggleEditorSplitOrientation } from '../stores/panels.js';
  import { closeComponentDocument, createComponentDocument, createComponentDocumentFromLibraryEntry } from '../stores/componentWorkspace.js';
  import { createDeviceProfileDraft, deviceProfiles, importDeviceProfile, refreshDeviceProfiles } from '../stores/deviceProfiles.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';

  let tabList = $derived($editorTabs);
  let activeTab = $derived($activeEditorTab);
  let splitActive = $derived(!!$activePanelDesignerSplit);
  let splitOrientationLabel = $derived($activePanelDesignerSplit?.orientation === 'horizontal' ? 'Side by Side' : 'Top / Bottom');
  let createMode = $state(false);
  let picker = $state('');
  let componentLibraryEntries = $derived($customComponentLibrary ?? []);
  let loadedDeviceProfiles = $derived($deviceProfiles ?? []);

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
    } else if (tab.tabType === 'deviceProfile') {
      closeDeviceProfileTab(tab.id);
    } else if (tab.tabType === 'component') {
      const nextId = closeComponentDocument(tab.id);
      if (activeTab?.type === 'component' && activeTab?.id === tab.id) {
        setActiveEditorTab(nextId ? { type: 'component', id: nextId } : { type: 'panel', id: null });
      }
    } else {
      closePanel(tab.id);
    }
  }

  function createComponentTab() {
    const document = createComponentDocument();
    if (document?.id) setActiveEditorTab({ type: 'component', id: document.id });
  }

  function createDeviceProfileTab() {
    const profile = createDeviceProfileDraft();
    openStandaloneDeviceProfileTab(profile);
  }

  function closePicker() {
    picker = '';
  }

  function handlePanelTarget() {
    closePicker();
    if (createMode) {
      addPanel();
      return;
    }
    openPanelFromFile();
  }

  function openComponentEntry(entry) {
    const document = createComponentDocumentFromLibraryEntry(entry);
    if (document?.id) setActiveEditorTab({ type: 'component', id: document.id });
    closePicker();
  }

  function handleComponentTarget() {
    if (createMode) {
      closePicker();
      createComponentTab();
      return;
    }
    if (componentLibraryEntries.length === 1) {
      openComponentEntry(componentLibraryEntries[0]);
      return;
    }
    picker = picker === 'component' ? '' : 'component';
  }

  function openDeviceProfile(profile) {
    openStandaloneDeviceProfileTab(profile);
    closePicker();
  }

  function handleDeviceTarget() {
    if (createMode) {
      closePicker();
      createDeviceProfileTab();
      return;
    }
    refreshDeviceProfiles();
    if (loadedDeviceProfiles.length === 1) {
      openDeviceProfile(loadedDeviceProfiles[0]);
      return;
    }
    picker = picker === 'device' ? '' : 'device';
  }

  function handleImportDeviceProfile() {
    importDeviceProfile();
    closePicker();
  }
</script>

<div class="tab-bar">
  <div class="tabs">
    {#each tabList as tab, index (`${tab.tabType}:${tab.id}:${index}`)}
      <div
        class="tab"
        class:active={isActive(tab)}
        role="button"
        tabindex="0"
        onclick={() => setActiveEditorTab(tab)}
        onkeydown={(e) => handleTabKeyDown(e, tab)}
        onmousedown={(e) => handleMiddleClick(e, tab)}
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

  <div class="tab-create-group" aria-label="Open or create workspace">
    <button
      class="new-mode-btn"
      class:active={createMode}
      title={createMode ? 'New mode is on' : 'Click to create new Panel, Component, or Device'}
      aria-pressed={createMode}
      onclick={() => { createMode = !createMode; closePicker(); }}
    >
      New
    </button>
    <button class="new-tab-btn" title={createMode ? 'New Panel' : 'Open Panel'} onclick={handlePanelTarget}>
      {#if createMode}<span class="plus-mark">+</span>{/if}
      <span>Panel</span>
    </button>
    <button class="new-tab-btn" class:open={picker === 'component'} title={createMode ? 'New Custom Component' : 'Open Saved Custom Component'} onclick={handleComponentTarget}>
      {#if createMode}<span class="plus-mark">+</span>{/if}
      <span>Component</span>
    </button>
    <button class="new-tab-btn" class:open={picker === 'device'} title={createMode ? 'New Device Profile Designer' : 'Open Device Profile Designer'} onclick={handleDeviceTarget}>
      {#if createMode}<span class="plus-mark">+</span>{/if}
      <span>Device</span>
    </button>

    {#if picker === 'component'}
      <div class="workspace-picker component-picker" role="dialog" aria-label="Open saved custom component">
        <div class="picker-head">
          <strong>Open Component</strong>
          <button type="button" title="Close" onclick={closePicker}>×</button>
        </div>
        <div class="picker-list">
          {#each componentLibraryEntries.slice(0, 8) as entry (entry.id)}
            <button type="button" onclick={() => openComponentEntry(entry)}>
              <strong>{entry.name}</strong>
              <span>{entry.version ?? '1.0.0'} · {entry.category || 'custom'}</span>
            </button>
          {/each}
          {#if componentLibraryEntries.length === 0}
            <div class="picker-empty">No saved component packages yet.</div>
          {/if}
        </div>
      </div>
    {:else if picker === 'device'}
      <div class="workspace-picker device-picker" role="dialog" aria-label="Open device profile">
        <div class="picker-head">
          <strong>Open Device</strong>
          <button type="button" title="Close" onclick={closePicker}>×</button>
        </div>
        <div class="picker-list">
          {#each loadedDeviceProfiles.slice(0, 8) as profile (profile.id)}
            <button type="button" onclick={() => openDeviceProfile(profile)}>
              <strong>{profile.name || profile.id}</strong>
              <span>{profile.manufacturer || 'device'} · {profile.status || 'profile'}</span>
            </button>
          {/each}
          {#if loadedDeviceProfiles.length === 0}
            <div class="picker-empty">No loaded device profiles.</div>
          {/if}
        </div>
        <button class="picker-import" type="button" onclick={handleImportDeviceProfile}>Import Profile</button>
      </div>
    {/if}
  </div>

  {#if splitActive}
    <div class="split-actions">
      <button title="Swap split sides" onclick={swapEditorSplit}>Swap</button>
      <button title="Toggle split orientation" onclick={toggleEditorSplitOrientation}>{splitOrientationLabel}</button>
    </div>
  {/if}
</div>

<style>
  .tab-bar {
    display: flex;
    align-items: end;
    height: 100%;
    background: #1A1A1A;
    border-bottom: 1px solid #1A1A1A;
    padding: 0 4px;
    gap: 1px;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .tabs {
    display: flex;
    align-items: end;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
    overflow-x: auto;
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

  .new-mode-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    padding: 0 9px;
    border: 1px solid #343434;
    border-radius: 5px 5px 0 0;
    background: #161616;
    color: #888;
    cursor: pointer;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
  }

  .new-mode-btn:hover,
  .new-mode-btn.active {
    border-color: #5B9BD5;
    background: rgba(91, 155, 213, 0.16);
    color: #E7F3FF;
  }

  .new-tab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: #202020;
    border: 1px solid #343434;
    color: #AAA;
    cursor: pointer;
    border-radius: 5px 5px 0 0;
    width: auto;
    min-width: 74px;
    max-width: 112px;
    height: 24px;
    padding: 0 8px;
    flex-shrink: 0;
    margin-bottom: 1px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    box-sizing: border-box;
  }

  .new-tab-btn:hover {
    background: #2B2B2B;
    border-color: #4A4A4A;
    color: #EEE;
  }

  .new-tab-btn.open {
    border-color: #5B9BD5;
    color: #EEE;
  }

  .plus-mark {
    color: #7FB4E8;
    font-size: 14px;
    font-weight: 900;
    line-height: 1;
  }

  .workspace-picker {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 30;
    width: 260px;
    max-width: calc(100vw - 24px);
    padding: 8px;
    border: 1px solid #3B4652;
    border-radius: 6px;
    background: #171A1D;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
    box-sizing: border-box;
  }

  .picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
    color: #DDE7EF;
    font-size: 11px;
  }

  .picker-head button {
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: #888;
    cursor: pointer;
  }

  .picker-head button:hover {
    background: #333;
    color: #FFF;
  }

  .picker-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 248px;
    overflow-y: auto;
  }

  .picker-list button,
  .picker-import {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    width: 100%;
    min-height: 42px;
    padding: 7px 8px;
    border: 1px solid #30343A;
    border-radius: 4px;
    background: #202326;
    color: #D8E0E8;
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
  }

  .picker-list button:hover,
  .picker-import:hover {
    border-color: #5B9BD5;
    background: #243241;
  }

  .picker-list strong {
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-list span {
    overflow: hidden;
    color: #8FA0AC;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-empty {
    padding: 14px 8px;
    border: 1px dashed #3A3A3A;
    border-radius: 4px;
    color: #888;
    font-size: 11px;
    text-align: center;
  }

  .picker-import {
    align-items: center;
    justify-content: center;
    min-height: 28px;
    margin-top: 6px;
    font-size: 11px;
    font-weight: 800;
    text-align: center;
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
