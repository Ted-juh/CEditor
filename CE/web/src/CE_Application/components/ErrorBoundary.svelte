<script>
  // A recoverable failure wall for one region of the editor.
  //
  // The editor runs inside WebView2, where an uncaught render error blanks the whole window
  // and the only way back is restarting the app — losing whatever was on the canvas. Wrapping
  // the independently-rebuildable regions means a bad control (or a half-finished custom
  // component) takes down its own pane and nothing else, and "Try again" re-renders it once
  // the offending property has been changed back.
  import { cerror } from '../stores/console.js';

  let { label = 'This panel', children } = $props();
</script>

<svelte:boundary onerror={(error) => cerror(`${label} failed to render:`, error?.stack ?? String(error))}>
  {@render children?.()}

  {#snippet failed(error, reset)}
    <div class="boundary-failed" role="alert">
      <div class="boundary-title">{label} stopped rendering</div>
      <div class="boundary-message">{error?.message ?? String(error)}</div>
      <button class="boundary-retry" onclick={reset}>Try again</button>
      <div class="boundary-hint">The rest of the editor is unaffected — the full trace is in the Console.</div>
    </div>
  {/snippet}
</svelte:boundary>

<style>
  .boundary-failed {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    height: 100%;
    padding: 16px;
    overflow: auto;
    background: #1a1a1a;
    color: #ddd;
    font-size: 12px;
  }

  .boundary-title {
    font-weight: 600;
    color: #ff6b6b;
  }

  .boundary-message {
    max-width: 640px;
    padding: 8px 10px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #111;
    color: #bbb;
    font-family: 'Consolas', 'Menlo', monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .boundary-retry {
    padding: 4px 12px;
    border: 1px solid #444;
    border-radius: 4px;
    background: #2a2a2a;
    color: #ddd;
    cursor: pointer;
  }

  .boundary-retry:hover {
    border-color: #666;
    background: #333;
  }

  .boundary-hint {
    color: #777;
  }
</style>
