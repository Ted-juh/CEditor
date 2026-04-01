<script>
  /**
   * Display Panel — bottom dock with mini displays/tools.
   * Tabs for: Colors, Gradient, Notepad, Viewer, Tools, Console.
   */

  let activeTab = $state('colors');

  const tabs = [
    { id: 'colors',   label: 'Colors' },
    { id: 'gradient', label: 'Gradient' },
    { id: 'notepad',  label: 'Notepad' },
    { id: 'viewer',   label: 'Viewer' },
    { id: 'tools',    label: 'Tools' },
    { id: 'console',  label: 'Console' },
  ];
</script>

<div class="display-panel">
  <div class="tab-bar">
    {#each tabs as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        onclick={() => activeTab = tab.id}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="tab-content">
    {#if activeTab === 'colors'}
      <div class="placeholder">Color Picker / Swatches</div>
    {:else if activeTab === 'gradient'}
      <div class="placeholder">Gradient Editor</div>
    {:else if activeTab === 'notepad'}
      <div class="placeholder">Notepad</div>
    {:else if activeTab === 'viewer'}
      <div class="placeholder">Picture Viewer</div>
    {:else if activeTab === 'tools'}
      <div class="placeholder">Tools</div>
    {:else if activeTab === 'console'}
      <div class="placeholder">Console Output</div>
    {/if}
  </div>
</div>

<style>
  .display-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1E1E1E;
  }

  .tab-bar {
    display: flex;
    gap: 1px;
    background: #1A1A1A;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .tab {
    background: #252525;
    border: none;
    color: #888;
    font-size: 10px;
    padding: 4px 10px;
    cursor: pointer;
    border-top: 2px solid transparent;
    font-family: inherit;
    transition: all 0.1s;
  }

  .tab:hover {
    color: #CCC;
    background: #2A2A2A;
  }

  .tab.active {
    color: #DDD;
    background: #2D2D2D;
    border-top-color: #5B9BD5;
  }

  .tab-content {
    flex: 1;
    overflow: auto;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #444;
    font-size: 12px;
  }
</style>
