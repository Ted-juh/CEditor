<script>
  /**
   * The Quit window (stores/quitGuard.js): asked for when CEditor is told to quit — its close button,
   * Alt+F4, File → Close Program — and something has unsaved changes. Lists them and offers Save and
   * quit, Quit without saving, or Cancel. With nothing unsaved it never opens.
   */
  import { quitPrompt, quitWithoutSaving, saveAndQuit, stayOpen } from '../stores/quitGuard.js';

  const KIND = {
    panel: 'Panel', script: 'Script workspace', component: 'Component', screen: 'CTRL49 screen', deviceProfile: 'Device profile',
  };

  let prompt = $derived($quitPrompt);
  let savable = $derived((prompt?.documents ?? []).filter((entry) => entry.canSave).length);
  let busy = $derived(prompt?.saving === true);

  function onKeydown(event) {
    if (!prompt || busy) return;
    if (event.key === 'Escape') { event.preventDefault(); stayOpen(); }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if prompt}
  <div class="backdrop" role="presentation">
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="quit-title" data-testid="quit-dialog">
      <div class="title" id="quit-title">Quit CEditor?</div>
      <p class="lead">{prompt.documents.length === 1 ? 'This has' : `These ${prompt.documents.length} have`} unsaved changes:</p>
      <ul class="list">
        {#each prompt.documents as entry (entry.key)}
          <li data-testid="quit-document">
            <span class="kind">{KIND[entry.kind] ?? 'Document'}</span>
            <span class="name">{entry.name}</span>
            {#if entry.note}<span class="note">{entry.note}</span>{/if}
          </li>
        {/each}
      </ul>
      {#if prompt.note}<p class="warn" data-testid="quit-note">{prompt.note}</p>{/if}
      <p class="muted">Without saving, a recovery copy of open panels is kept; <b>Restore Unsaved Work</b> in Settings offers it next time.</p>
      <div class="actions">
        <button class="btn" type="button" onclick={stayOpen} disabled={busy}>Cancel</button>
        <button class="btn danger" type="button" onclick={quitWithoutSaving} disabled={busy} data-testid="quit-discard">Quit without saving</button>
        <!-- svelte-ignore a11y_autofocus -->
        <button class="btn primary" type="button" onclick={saveAndQuit} disabled={busy || !savable} autofocus data-testid="quit-save"
                title={savable ? '' : 'Nothing here can be saved without a dialog: Cancel, then save each with Save As or Export'}>
          {busy ? 'Saving…' : savable === prompt.documents.length ? 'Save and quit' : `Save ${savable} and quit`}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 1400; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; }
  .dialog {
    width: 480px; max-width: calc(100vw - 48px); max-height: calc(100vh - 64px); overflow-y: auto; box-sizing: border-box;
    background: #252526; border: 1px solid #3A3A3A; border-radius: 8px; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
    padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; color: #DDD; font-size: 12px;
  }
  .title { font-size: 15px; font-weight: 600; color: #EEE; }
  .lead { margin: 4px 0 0; }
  .list { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; }
  .list li { display: flex; gap: 8px; align-items: baseline; padding: 5px 8px; border: 1px solid #333; border-radius: 4px; background: #1E1E1E; }
  .kind { color: #6FA8C7; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; flex: 0 0 auto; min-width: 104px; }
  .name { color: #EEE; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { margin-left: auto; color: #999; font-size: 11px; flex: 0 0 auto; }
  .warn { margin: 2px 0; color: #E8B95A; font-size: 11px; }
  .muted { margin: 2px 0; color: #8F8F8F; font-size: 11px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .btn { height: 28px; padding: 0 14px; border: 1px solid #3A3A3A; border-radius: 4px; background: #2C2C2C; color: #DDD; font: inherit; font-weight: 600; cursor: pointer; }
  .btn.primary { background: #094771; border-color: #0B6EB5; color: #fff; }
  .btn.danger { border-color: #7A3A34; color: #F08A7E; }
  .btn:disabled { opacity: 0.45; cursor: default; }
</style>
