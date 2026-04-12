<script>
  import { X, Plus } from 'lucide-svelte';
  import { panels, activePanelId, addPanel, closePanel, setActivePanel } from '../stores/panels.js';

  let panelList = $derived($panels);
  let activeId = $derived($activePanelId);

  function handleMiddleClick(e, id) {
    if (e.button === 1) {
      e.preventDefault();
      closePanel(id);
    }
  }

  function handleTabKeyDown(e, id) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActivePanel(id);
    }
  }
</script>

<div class="tab-bar">
  <div class="tabs">
    {#each panelList as panel (panel.id)}
      <div
        class="tab"
        class:active={panel.id === activeId}
        role="button"
        tabindex="0"
        onclick={() => setActivePanel(panel.id)}
        onkeydown={(e) => handleTabKeyDown(e, panel.id)}
        onmousedown={(e) => handleMiddleClick(e, panel.id)}
      >
        <span class="tab-name">
          {panel.name}
          {#if panel.modified}<span class="modified-dot">●</span>{/if}
        </span>
        <button
          class="tab-close"
          title="Close"
          onclick={(e) => { e.stopPropagation(); closePanel(panel.id); }}
        >
          <X size={12} strokeWidth={1.5} />
        </button>
      </div>
    {/each}
  </div>

  <button class="new-tab-btn" title="New Panel" onclick={() => addPanel()}>
    <Plus size={14} strokeWidth={1.5} />
  </button>
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
  }

  .new-tab-btn:hover {
    background: #333;
    color: #DDD;
  }
</style>
