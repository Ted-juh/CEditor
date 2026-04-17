<script>
  import { Copy, Check, Trash2 } from 'lucide-svelte';
  import { debugDockState, clearDebugDock } from '../stores/debugDock.js';

  let copied = $state(false);
  let debugState = $derived($debugDockState);

  async function copyDebug() {
    const text = debugState?.text ?? '';
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => copied = false, 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copied = true;
      setTimeout(() => copied = false, 1500);
    }
  }
</script>

<div class="debug-panel">
  <div class="debug-toolbar">
    <div class="debug-title-group">
      <span class="debug-title">{debugState.title || 'Debug'}</span>
      {#if debugState.source}
        <span class="debug-source">{debugState.source}</span>
      {/if}
    </div>
    <div class="toolbar-spacer"></div>
    <button class="tool-btn" onclick={copyDebug} disabled={!debugState.text} title="Copy debug output">
      {#if copied}<Check size={12} />{:else}<Copy size={12} />{/if}
    </button>
    <button class="tool-btn" onclick={clearDebugDock} disabled={!debugState.text} title="Clear debug output">
      <Trash2 size={12} />
    </button>
  </div>

  {#if debugState.text}
    <textarea class="debug-output" readonly value={debugState.text}></textarea>
  {:else}
    <div class="debug-empty">No debug payload</div>
  {/if}
</div>

<style>
  .debug-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #171717;
  }

  .debug-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    background: #202020;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .debug-title-group {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }

  .debug-title {
    color: #DDD;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .debug-source {
    color: #777;
    font-size: 9px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toolbar-spacer {
    flex: 1;
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

  .tool-btn:hover:not(:disabled) {
    background: #3D3D3D;
    color: #FFF;
    border-color: #555;
  }

  .tool-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .debug-output {
    flex: 1;
    width: 100%;
    resize: none;
    border: none;
    outline: none;
    background: #171717;
    color: #CFCFCF;
    padding: 8px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 10px;
    line-height: 1.4;
  }

  .debug-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #444;
    font-size: 12px;
  }
</style>
