<script>
  import { editorTabs, activeEditorTab, activePanelDesignerSplit, addPanel, closePanel, setActiveEditorTab, closeSettingsTab, closeDeviceProfileTab, openTabToSide, swapEditorSplit, toggleEditorSplitOrientation } from '../stores/panels.js';

  let tabList = $derived($editorTabs);
  let activeTab = $derived($activeEditorTab);
  let splitActive = $derived(!!$activePanelDesignerSplit);
  let splitOrientationLabel = $derived($activePanelDesignerSplit?.orientation === 'horizontal' ? 'Side by Side' : 'Top / Bottom');

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
    } else {
      closePanel(tab.id);
    }
  }
</script>

<div class="tab-bar">
  <div class="tabs">
    {#each tabList as tab (`${tab.tabType}:${tab.id}`)}
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

  <button class="new-tab-btn" title="New Panel" onclick={() => addPanel()}>
    +
  </button>

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

  .new-tab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    margin-bottom: 1px;
    font-size: 18px;
    line-height: 1;
  }

  .new-tab-btn:hover {
    background: #333;
    color: #DDD;
  }

  .split-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
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
