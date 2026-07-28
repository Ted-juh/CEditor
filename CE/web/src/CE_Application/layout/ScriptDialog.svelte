<script>
  // ScriptDialog — the modal ce.ui.dialog() raises.
  //
  // A question, not a message: it stays until it is answered, and answering it runs the script's
  // callback. Every route out of here goes through answerDialog(), including the ones that are not
  // clicks — Escape, and the backdrop — because a dialog that can be closed without settling would
  // leave a script waiting for an answer that never comes.
  import { scriptDialog, answerDialog } from '../stores/scriptUi.js';

  let dialogEl = $state(null);

  // Focus the default button when a dialog appears. Without this the modal traps the eye but not
  // the keyboard, and Enter goes to whatever was focused behind it.
  $effect(() => {
    if (!$scriptDialog || !dialogEl) return;
    const target = dialogEl.querySelector('.dialog-default') ?? dialogEl.querySelector('button');
    target?.focus();
  });

  function onKeydown(e) {
    if (!$scriptDialog) return;
    // Escape dismisses — the callback runs with no answer, the same as clicking away.
    if (e.key === 'Escape') { e.stopPropagation(); answerDialog(undefined); }
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if $scriptDialog}
  <!-- The backdrop dismisses. It is a plain div with a click handler rather than a button so it
       does not enter the tab order in front of the choices the dialog is actually asking about. -->
  <div class="dialog-backdrop" role="presentation" onclick={() => answerDialog(undefined)}></div>

  <div
    class={['dialog', `dialog-${$scriptDialog.kind}`]}
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    aria-label={$scriptDialog.title}
  >
    <div class="dialog-title">{$scriptDialog.title}</div>
    {#if $scriptDialog.message}
      <div class="dialog-message">{$scriptDialog.message}</div>
    {/if}
    <div class="dialog-buttons">
      {#each $scriptDialog.buttons as label (label)}
        <button
          class={['dialog-button', label === $scriptDialog.default && 'dialog-default']}
          onclick={() => answerDialog(label)}
        >{label}</button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }
  .dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    min-width: 280px;
    max-width: 420px;
    padding: 16px 18px 14px;
    border-radius: 6px;
    border: 1px solid #3A3A3A;
    background: #1E1E1E;
    color: #DDD;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  }
  .dialog-warn  { border-color: #6A5A30; }
  .dialog-error { border-color: #6A3030; }

  .dialog-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    margin-bottom: 6px;
  }
  .dialog-warn  .dialog-title { color: #E0C070; }
  .dialog-error .dialog-title { color: #E08080; }

  .dialog-message {
    font-size: 12px;
    line-height: 1.45;
    color: #AAA;
    margin-bottom: 12px;
    white-space: pre-wrap;    /* a script composing a multi-line question keeps its line breaks */
  }
  .dialog-buttons {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;          /* several long labels wrap rather than overflowing the modal */
    gap: 8px;
    margin-top: 12px;
  }
  .dialog-button {
    padding: 5px 13px;
    border-radius: 4px;
    border: 1px solid #3A3A3A;
    background: #2A2A2A;
    color: #DDD;
    font-size: 12px;
    cursor: pointer;
  }
  .dialog-button:hover { border-color: #5B9BD5; }
  .dialog-default {
    border-color: #5B9BD5;
    background: #2E4258;
  }
  .dialog-button:focus-visible { outline: 2px solid #5B9BD5; outline-offset: 1px; }
</style>
