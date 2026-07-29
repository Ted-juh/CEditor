<script>
  // ScriptDialog — the modal ce.ui.dialog() raises.
  //
  // A question, not a message: it stays until it is answered, and answering it runs the script's
  // callback. Every route out of here goes through answerDialog(), including the ones that are not
  // clicks — Escape, and the backdrop — because a dialog that can be closed without settling would
  // leave a script waiting for an answer that never comes.
  import { scriptDialog, answerDialog } from '../stores/scriptUi.js';

  let dialogEl = $state(null);
  // What the person has typed or picked, before they commit to it. Held here rather than in the
  // store because an unanswered edit is not an answer — the store learns it when a button is
  // pressed, and never if the dialog is dismissed.
  let text = $state('');
  let picked = $state([]);

  $effect(() => {
    const d = $scriptDialog;
    if (!d) return;
    text = d.value ?? '';
    picked = d.selected ? [d.selected] : [];
  });

  // Focus the thing the person is meant to act on. For a question with a FIELD that is the field,
  // not the button: a text dialog that opens with OK focused makes you reach for the mouse to
  // answer a question you could have typed.
  $effect(() => {
    if (!$scriptDialog || !dialogEl) return;
    const target = dialogEl.querySelector('.dialog-input')
      ?? dialogEl.querySelector('.dialog-default')
      ?? dialogEl.querySelector('button');
    target?.focus();
    if (target?.select) target.select();
  });

  /** The answer this dialog's SHAPE produces. The shape decides the type — a label, a string, or
   *  a selection — which is the whole reason `ask` exists. */
  function answerFor(label) {
    const d = $scriptDialog;
    if (!d || d.ask === 'choice') return label;
    // A cancel on a text or list dialog is a DISMISSAL, not an empty answer: "" and [] are things
    // somebody might mean, and "I did not answer" is not one of them.
    if (label !== d.buttons[0]) return undefined;
    if (d.ask === 'text') return text;
    return d.multiple ? [...picked] : (picked[0] ?? undefined);
  }

  function togglePick(item) {
    const d = $scriptDialog;
    if (!d) return;
    if (!d.multiple) { picked = [item]; return; }
    picked = picked.includes(item) ? picked.filter((p) => p !== item) : [...picked, item];
  }

  function onKeydown(e) {
    if (!$scriptDialog) return;
    // Escape dismisses — the callback runs with no answer, the same as clicking away.
    if (e.key === 'Escape') { e.stopPropagation(); answerDialog(undefined); }
    // Enter in a field accepts, which is what every text prompt anywhere does.
    if (e.key === 'Enter' && $scriptDialog.ask === 'text') {
      e.stopPropagation();
      answerDialog(answerFor($scriptDialog.buttons[0]));
    }
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
    {#if $scriptDialog.ask === 'text'}
      <input
        class="dialog-input"
        type="text"
        bind:value={text}
        placeholder={$scriptDialog.placeholder}
        aria-label={$scriptDialog.title}
      />
    {:else if $scriptDialog.ask === 'list'}
      <div class="dialog-list" role="listbox" aria-label={$scriptDialog.title} tabindex="-1">
        {#each $scriptDialog.items as item (item)}
          <button
            class={['dialog-option', picked.includes(item) && 'dialog-option-on']}
            role="option"
            aria-selected={picked.includes(item)}
            onclick={() => togglePick(item)}
          >{item}</button>
        {/each}
      </div>
    {/if}
    <div class="dialog-buttons">
      {#each $scriptDialog.buttons as label (label)}
        <button
          class={['dialog-button', label === $scriptDialog.default && 'dialog-default']}
          onclick={() => answerDialog(answerFor(label))}
        >{label}</button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .dialog-input {
    width: 100%;
    margin: 10px 0 4px;
    padding: 6px 8px;
    box-sizing: border-box;
    font: inherit;
    color: inherit;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 4px;
  }

  .dialog-list {
    /* Scrolls rather than growing: a list of forty presets must not push the buttons off screen,
       which is the failure that makes a picker unanswerable. */
    max-height: 220px;
    overflow-y: auto;
    margin: 10px 0 4px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 4px;
  }

  .dialog-option {
    display: block;
    width: 100%;
    padding: 5px 8px;
    text-align: left;
    font: inherit;
    color: inherit;
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .dialog-option:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .dialog-option-on {
    background: rgba(0, 122, 204, 0.55);
  }

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
