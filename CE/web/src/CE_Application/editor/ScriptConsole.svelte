<script>
  // ScriptConsole — the output/console panel for running scripts. Renders the live
  // scriptTrace store (log / error / midi / trace lines emitted by panelRuntime) with
  // per-kind filters, a count, clear, and auto-scroll. Used inline under the editor
  // (output appears where you press ▶ Run) and on the Test / Trace screen.
  import { scriptTrace, clearScriptTrace } from '../stores/scriptConsole.js';

  let { compact = false } = $props();

  // Which kinds are visible. 'trace' folds into the generic bucket with 'log'; 'warn' gets its own
  // bucket, because a warning that is filtered away with the logs is a warning nobody reads.
  let show = $state({ log: true, warn: true, error: true, midi: true });
  function kindBucket(kind) {
    if (kind === 'error') return 'error';
    if (kind === 'warn') return 'warn';
    return kind === 'midi' ? 'midi' : 'log';
  }

  let counts = $derived.by(() => {
    const c = { log: 0, warn: 0, error: 0, midi: 0 };
    for (const e of $scriptTrace) c[kindBucket(e.kind)]++;
    return c;
  });
  let visible = $derived($scriptTrace.filter((e) => show[kindBucket(e.kind)]));

  // Auto-scroll to the newest line unless the user has scrolled up.
  let listEl = $state(null);
  let stick = $state(true);
  function onScroll() {
    if (!listEl) return;
    stick = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 24;
  }
  $effect(() => {
    void visible.length;
    if (stick && listEl) listEl.scrollTop = listEl.scrollHeight;
  });

  const ICON = { error: '✕', warn: '!', midi: '→', log: '›', trace: '·' };
</script>

<div class={['sc', compact && 'compact']}>
  <div class="sc-head">
    <span class="sc-title">Console</span>
    <span class="sc-filters">
      <button class={['sc-chip', 'log', show.log && 'on']} onclick={() => show.log = !show.log}>Logs {counts.log}</button>
      <button class={['sc-chip', 'warn', show.warn && 'on']} onclick={() => show.warn = !show.warn}>Warnings {counts.warn}</button>
      <button class={['sc-chip', 'error', show.error && 'on']} onclick={() => show.error = !show.error}>Errors {counts.error}</button>
      <button class={['sc-chip', 'midi', show.midi && 'on']} onclick={() => show.midi = !show.midi}>MIDI {counts.midi}</button>
    </span>
    <span class="sc-spacer"></span>
    <button class="sc-clear" title="Clear console" onclick={clearScriptTrace}>Clear</button>
  </div>
  <div class="sc-list" bind:this={listEl} onscroll={onScroll}>
    {#if visible.length === 0}
      <div class="sc-empty">No output yet — press ▶ Run, or interact with the panel. Errors, <code>log()</code> output, and MIDI appear here.</div>
    {:else}
      {#each visible as e (e.id)}
        <div class={['sc-line', kindBucket(e.kind)]}>
          <span class="sc-time">{e.time}</span>
          <span class="sc-icon">{ICON[e.kind] ?? '·'}</span>
          <span class="sc-msg">{e.message}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .sc { display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--line-2); border-radius: 8px; background: #0a0c10; overflow: hidden; }
  .sc-head { display: flex; align-items: center; gap: 8px; padding: 6px 9px; border-bottom: 1px solid var(--line); background: var(--bg-2); }
  .sc-title { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--txt-faint); }
  .sc-filters { display: flex; gap: 5px; }
  .sc-spacer { flex: 1; }
  .sc-chip {
    background: transparent; border: 1px solid var(--line-2); border-radius: 12px;
    color: var(--txt-faint); cursor: pointer; font-size: 11px; padding: 2px 9px; line-height: 1.5;
  }
  .sc-chip.on.log { color: var(--txt); border-color: var(--line-2); }
  .sc-chip.on.warn { color: #e6c46a; border-color: #8a6a20; }
  .sc-chip.on.error { color: #f0a59f; border-color: var(--red); }
  .sc-chip.on.midi { color: #8fc0f5; border-color: var(--blue); }
  .sc-chip:not(.on) { opacity: .5; }
  .sc-clear { background: transparent; border: 1px solid var(--line-2); border-radius: 6px; color: var(--txt-dim); cursor: pointer; font-size: 11px; padding: 3px 9px; }
  .sc-clear:hover { color: var(--txt); border-color: var(--accent-dim); }
  .sc-list { flex: 1; overflow-y: auto; padding: 6px 4px; font-family: var(--mono); font-size: 12px; min-height: 80px; }
  .sc.compact .sc-list { max-height: 150px; }
  .sc-empty { color: var(--txt-faint); font-size: 12px; padding: 14px; font-family: 'Archivo', system-ui, sans-serif; line-height: 1.5; }
  .sc-line { display: flex; gap: 8px; align-items: baseline; padding: 2px 8px; border-radius: 4px; }
  .sc-line.warn { background: rgba(226, 185, 90, 0.09); }
  .sc-line.error { background: rgba(224, 99, 90, 0.1); }
  .sc-time { color: var(--txt-faint); flex-shrink: 0; font-size: 11px; }
  .sc-icon { flex-shrink: 0; width: 10px; text-align: center; }
  .sc-line.warn .sc-icon, .sc-line.warn .sc-msg { color: #e6c46a; }
  .sc-line.error .sc-icon, .sc-line.error .sc-msg { color: #f0a59f; }
  .sc-line.midi .sc-icon, .sc-line.midi .sc-msg { color: #8fc0f5; }
  .sc-line.log .sc-icon { color: var(--txt-faint); }
  .sc-msg { color: var(--txt-dim); white-space: pre-wrap; word-break: break-word; }
</style>
