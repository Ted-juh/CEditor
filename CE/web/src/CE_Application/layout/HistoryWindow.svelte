<script>
  // History window (Edit › History...): every undo step of the active document, named, oldest at
  // the top. Click a row to go to the state after it; the steps below the current one are the ones
  // Redo would put back. The names come from stores/history.js historyTimeline(), which works them
  // out by comparing neighbouring states — nothing is recorded for this window.
  //
  // It floats beside the canvas rather than covering it, so a click shows what that step looked
  // like while the list stays open.
  import { historyVersion, historyTimeline, jumpToHistory } from '../stores/history.js';
  import { historyWindowOpen, closeHistoryWindow } from '../stores/historyWindow.js';
  import { resolvedActivePanelId } from '../stores/panels.js';

  // Re-read on any stack change and on a switch of panel — not on every panel-store change, which
  // would redo this on each frame of a drag.
  let timeline = $derived.by(() => {
    void $historyVersion;
    void $resolvedActivePanelId;
    return $historyWindowOpen ? historyTimeline() : { steps: [], position: 0 };
  });

  let listEl = $state(null);
  $effect(() => {
    void timeline.position;
    // Keep the current step in view as undo/redo move it.
    listEl?.querySelector('[data-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
  });

  // Escape closes the window and nothing else. It listens in the capture phase, ahead of the
  // editor's own window handlers, which would otherwise take the same Escape to clear a selection
  // or leave a tool. The window is not modal, so every other key goes on to the editor as usual.
  $effect(() => {
    if (!$historyWindowOpen) return undefined;
    const onKeydownCapture = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeHistoryWindow();
    };
    window.addEventListener('keydown', onKeydownCapture, true);
    return () => window.removeEventListener('keydown', onKeydownCapture, true);
  });
</script>

{#if $historyWindowOpen}
  <aside class="history-window" aria-label="History" data-testid="history-window">
    <header>
      <strong>History</strong>
      <span class="count">{timeline.position} of {timeline.steps.length}</span>
      <button type="button" class="close" onclick={closeHistoryWindow} title="Close (Esc)" aria-label="Close history">×</button>
    </header>
    <ol bind:this={listEl}>
      <li>
        <button type="button" class="step origin" class:current={timeline.position === 0} data-current={timeline.position === 0}
          data-position="0" onclick={() => jumpToHistory(0)} title="Go back to before the first step listed">
          <span class="dot"></span><span class="label">Start</span>
        </button>
      </li>
      {#each timeline.steps as step, index (index)}
        <li>
          <button type="button" class="step" class:undone={!step.applied} class:current={timeline.position === index + 1}
            data-current={timeline.position === index + 1} data-position={index + 1}
            onclick={() => jumpToHistory(index + 1)} title={step.applied ? `Go back to just after: ${step.label}` : `Redo up to: ${step.label}`}>
            <span class="dot"></span><span class="label">{step.label}</span>
          </button>
        </li>
      {/each}
    </ol>
    {#if timeline.steps.length === 0}
      <p class="empty">Nothing to undo yet. Steps appear here as you edit.</p>
    {/if}
    <footer>Keeps the last 50 steps per document. Background images are not part of undo.</footer>
  </aside>
{/if}

<style>
  .history-window {
    position: fixed;
    top: 72px;
    right: 16px;
    z-index: 1500;
    display: flex;
    flex-direction: column;
    width: 280px;
    max-height: min(560px, calc(100vh - 110px));
    border: 1px solid #333;
    border-radius: 6px;
    background: #1B1B1B;
    color: #DDD;
    font-size: 11px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid #2C2C2C;
  }

  header strong { flex: 1; font-size: 12px; }
  .count { color: #888; }

  .close {
    border: none;
    background: transparent;
    color: #AAA;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }

  ol {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 4px 0;
    overflow: auto;
    list-style: none;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 10px;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .step:hover { background: #262626; }
  .step.undone { color: #777; font-style: italic; }
  .step.current { background: #20354A; color: #FFF; }
  .step.origin .label { color: #999; }

  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1px solid #5B9BD5;
  }

  .step.current .dot { background: #5B9BD5; }
  .step.undone .dot { border-color: #555; }

  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty { margin: 4px 10px 8px; color: #888; }

  footer {
    padding: 6px 10px;
    border-top: 1px solid #2C2C2C;
    color: #777;
    font-size: 10px;
  }
</style>
