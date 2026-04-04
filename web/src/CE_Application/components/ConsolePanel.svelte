<script>
  import { Trash2, ArrowDownToLine, Filter } from 'lucide-svelte';
  import { consoleEntries, clearConsole } from '../stores/console.js';

  let containerEl = $state(null);
  let autoScroll = $state(true);
  let filterText = $state('');
  let filterLevel = $state('all');

  const levels = ['all', 'log', 'info', 'debug', 'warn', 'error'];

  let filtered = $derived((() => {
    let list = $consoleEntries;
    if (filterLevel !== 'all') {
      list = list.filter(e => e.level === filterLevel);
    }
    if (filterText) {
      const lower = filterText.toLowerCase();
      list = list.filter(e =>
        e.message.toLowerCase().includes(lower) ||
        e.source.toLowerCase().includes(lower)
      );
    }
    return list;
  })());

  // Auto-scroll to bottom when new entries arrive
  $effect(() => {
    void filtered.length;
    if (autoScroll && containerEl) {
      requestAnimationFrame(() => {
        containerEl.scrollTop = containerEl.scrollHeight;
      });
    }
  });

  function handleScroll() {
    if (!containerEl) return;
    const { scrollTop, scrollHeight, clientHeight } = containerEl;
    // If user scrolled up, disable auto-scroll; if at bottom, re-enable
    autoScroll = scrollHeight - scrollTop - clientHeight < 24;
  }

  function scrollToBottom() {
    autoScroll = true;
    if (containerEl) containerEl.scrollTop = containerEl.scrollHeight;
  }

  function selectAll(e) {
    e.target.select();
  }

  function levelClass(level) {
    if (level === 'error') return 'lvl-error';
    if (level === 'warn') return 'lvl-warn';
    if (level === 'info') return 'lvl-info';
    if (level === 'debug') return 'lvl-debug';
    return 'lvl-log';
  }

  function sourceLabel(source) {
    if (source === 'c++') return 'C++';
    if (source === 'js') return 'JS';
    return 'APP';
  }
</script>

<div class="console-panel">
  <div class="console-toolbar">
    <button class="tool-btn" onclick={clearConsole} title="Clear console">
      <Trash2 size={12} />
    </button>
    <div class="toolbar-separator"></div>
    <select class="level-filter" bind:value={filterLevel}>
      {#each levels as lvl}
        <option value={lvl}>{lvl === 'all' ? 'All Levels' : lvl.charAt(0).toUpperCase() + lvl.slice(1)}</option>
      {/each}
    </select>
    <div class="filter-box">
      <Filter size={10} />
      <input
        type="text"
        class="filter-input"
        placeholder="Filter..."
        bind:value={filterText}
        onfocus={selectAll}
      />
    </div>
    <div class="toolbar-spacer"></div>
    <span class="entry-count">{filtered.length}</span>
    <button class="tool-btn" class:active={autoScroll} onclick={scrollToBottom} title="Scroll to bottom">
      <ArrowDownToLine size={12} />
    </button>
  </div>

  <div
    class="console-log"
    bind:this={containerEl}
    onscroll={handleScroll}
  >
    {#each filtered as entry (entry.id)}
      <div class="log-entry {levelClass(entry.level)}">
        <span class="log-time">{entry.timestamp}</span>
        <span class="log-source {entry.source}">{sourceLabel(entry.source)}</span>
        <span class="log-level">{entry.level.toUpperCase().padEnd(5)}</span>
        <span class="log-msg">{entry.message}</span>
      </div>
    {/each}
    {#if filtered.length === 0}
      <div class="empty-msg">No console output</div>
    {/if}
  </div>
</div>

<style>
  .console-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1A1A1A;
  }

  .console-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    background: #222;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 20px;
    background: none;
    border: 1px solid transparent;
    color: #888;
    cursor: pointer;
    border-radius: 3px;
    padding: 0;
  }
  .tool-btn:hover {
    background: #3D3D3D;
    color: #FFF;
    border-color: #555;
  }
  .tool-btn.active {
    color: #5B9BD5;
  }

  .toolbar-separator {
    width: 1px;
    height: 14px;
    background: #444;
  }

  .level-filter {
    background: #1A1A1A;
    border: 1px solid #333;
    color: #CCC;
    font-size: 10px;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: inherit;
    cursor: pointer;
  }
  .level-filter:focus {
    border-color: #5B9BD5;
    outline: none;
  }

  .filter-box {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 2px 6px;
    color: #666;
  }
  .filter-box:focus-within {
    border-color: #5B9BD5;
  }

  .filter-input {
    background: none;
    border: none;
    color: #CCC;
    font-size: 10px;
    font-family: inherit;
    width: 80px;
    outline: none;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .entry-count {
    font-size: 9px;
    color: #666;
    font-family: 'Consolas', 'Courier New', monospace;
  }

  .console-log {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.4;
  }

  .console-log::-webkit-scrollbar {
    width: 6px;
  }
  .console-log::-webkit-scrollbar-track {
    background: transparent;
  }
  .console-log::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 3px;
  }
  .console-log::-webkit-scrollbar-thumb:hover {
    background: #5B9BD5;
  }

  .log-entry {
    display: flex;
    gap: 6px;
    padding: 1px 8px;
    border-bottom: 1px solid #1E1E1E;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .log-entry:hover {
    background: #252525;
  }

  .log-time {
    color: #555;
    flex-shrink: 0;
    user-select: none;
  }

  .log-source {
    flex-shrink: 0;
    font-size: 9px;
    padding: 0 3px;
    border-radius: 2px;
    line-height: 1.5;
    user-select: none;
  }
  .log-source.js {
    color: #E8D44D;
    background: #3A3500;
  }
  .log-source.c\+\+ {
    color: #5B9BD5;
    background: #0D2A42;
  }
  .log-source.app {
    color: #9CDCFE;
    background: #1A2E3E;
  }

  .log-level {
    flex-shrink: 0;
    width: 40px;
    user-select: none;
  }

  .log-msg {
    flex: 1;
    min-width: 0;
  }

  /* Level colors */
  .lvl-log .log-level  { color: #888; }
  .lvl-log .log-msg    { color: #CCC; }

  .lvl-info .log-level { color: #5B9BD5; }
  .lvl-info .log-msg   { color: #9CDCFE; }

  .lvl-debug .log-level { color: #888; }
  .lvl-debug .log-msg   { color: #888; }

  .lvl-warn {
    background: #332B00;
  }
  .lvl-warn .log-level  { color: #E8D44D; }
  .lvl-warn .log-msg    { color: #E8D44D; }

  .lvl-error {
    background: #2D0000;
  }
  .lvl-error .log-level { color: #F44747; }
  .lvl-error .log-msg   { color: #F48771; }

  .empty-msg {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #444;
    font-size: 12px;
    font-family: inherit;
  }
</style>
