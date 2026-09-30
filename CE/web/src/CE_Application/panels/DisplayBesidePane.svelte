<script>
  /**
   * The display dock's second pane: one more tool beside the one in the main pane, so two can be
   * used together — the Text dock next to Effects, the MIDI monitor next to Ports.
   *
   * Only tools that stand on their own come here (DisplayPanel's BESIDE_TAB_IDS). Colors, Gradient,
   * Notepad and Viewer share the dock's one colour pick, and Preview mounts a live surface; they stay
   * in the main pane. A tool is never in both panes at once — DisplayPanel keeps that rule.
   *
   * The pane is the parent's to place and size; this draws its header (which tool, and close) and
   * the tool itself, loaded the same lazy way the main pane loads it.
   */
  import X from 'lucide-svelte/icons/x';

  let {
    tabId = '',
    choices = [],                 // [{ id, label }] — the tools this pane may show now
    load = async () => null,      // tabId → the tool's component set (DisplayPanel's lazy loader)
    onchange = () => {},
    onclose = () => {},
    onopentab = () => {},         // a tool asking for another tab opens it in the main pane
  } = $props();

  let loaded = $state(null);
  let loadedId = $state('');
  let error = $state('');
  let retry = $state(0);

  $effect(() => {
    const id = tabId;
    void retry;
    let cancelled = false;
    error = '';
    if (!id) { loaded = null; loadedId = ''; return; }
    load(id)
      .then((set) => { if (!cancelled) { loaded = set; loadedId = id; } })
      .catch((failure) => { if (!cancelled) error = failure?.message ?? 'load failed'; });
    return () => { cancelled = true; };
  });

  let label = $derived(choices.find((choice) => choice.id === tabId)?.label ?? tabId);
</script>

<section class="beside-pane" aria-label={`${label} (beside)`} data-beside-tab={tabId}>
  <header class="beside-head">
    <select aria-label="Tool beside" value={tabId} onchange={(event) => onchange(event.currentTarget.value)}>
      {#each choices as choice (choice.id)}
        <option value={choice.id}>{choice.label}</option>
      {/each}
    </select>
    <button type="button" class="beside-close" title="Close the pane beside" aria-label="Close the pane beside" onclick={() => onclose()}>
      <X size={13} strokeWidth={1.8} />
    </button>
  </header>
  <div class="beside-body">
    {#if error}
      <div class="placeholder load-error">
        <span>Failed To Load: {error}</span>
        <button type="button" onclick={() => { retry += 1; }}>Retry</button>
      </div>
    {:else if loadedId === tabId && loaded?.debug && loaded?.console}
      {@const DebugPanel = loaded.debug}
      {@const ConsolePanel = loaded.console}
      <div class="console-split">
        <div class="debug-side"><DebugPanel /></div>
        <div class="console-divider"></div>
        <div class="console-side"><ConsolePanel /></div>
      </div>
    {:else if loadedId === tabId && loaded?.default}
      {@const Tool = loaded.default}
      {#if tabId === 'device'}
        <Tool {onopentab} />
      {:else}
        <Tool />
      {/if}
    {:else}
      <div class="placeholder">Loading {label}…</div>
    {/if}
  </div>
</section>

<style>
  .beside-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    background: #1E1E1E;
  }

  .beside-head {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 6px;
    background: #1A1A1A;
    border-bottom: 1px solid #333;
  }

  .beside-head select {
    height: 20px;
    padding: 0 4px;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    background: #252525;
    color: #DDD;
    font-size: 11px;
  }

  .beside-close {
    margin-left: auto;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: #999;
    cursor: pointer;
  }

  .beside-close:hover,
  .beside-close:focus-visible {
    background: #333;
    color: #FFF;
  }

  .beside-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .placeholder {
    margin: auto;
    color: #777;
    font-size: 12px;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .console-split {
    display: flex;
    height: 100%;
    min-height: 0;
  }

  .debug-side,
  .console-side {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .console-divider {
    width: 1px;
    background: #333;
  }
</style>
