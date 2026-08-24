<script>
  // AboutOverlay — what the program says about itself.
  //
  // This replaced a `window.alert` containing a commit hash. The release notes claimed "the app
  // states this in About and on the Export tab" about both the licence and the missing code-signing
  // certificate, and neither sentence existed anywhere in the program. The words now live in
  // utils/legalNotices.js and are read from both places, so the claim is true and stays true.
  //
  // An alert was also the wrong shape for it: a modal the OS draws cannot be read alongside the
  // Export tab it is about, and it cannot be copied out of on Windows.

  import { buildInfo } from '../buildInfo.js';
  import { LICENCE_NOTICE, SIGNING_NOTICE } from '../utils/legalNotices.js';
  import { runUpdateCheck, updateStatus, updateStatusLine } from '../stores/updateChannel.js';

  let { show = false, onclose = () => {} } = $props();

  const NOTICES = [LICENCE_NOTICE, SIGNING_NOTICE];

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (show) handleKeyDown(e); }} />

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay-backdrop" onclick={handleBackdropClick}>
    <div class="overlay-panel">
      <div class="overlay-header">
        <span class="overlay-title">About CEditor</span>
        <button class="close-btn" onclick={onclose}>&times;</button>
      </div>
      <div class="overlay-body">
        <div class="build">
          <div class="product">CEditor {buildInfo.version}</div>
          <div class="stamp">build {buildInfo.sha} · {buildInfo.branch} · {buildInfo.time}</div>
          <div class="update">
            <span class="update-line">{updateStatusLine($updateStatus)}</span>
            <button class="update-btn" onclick={() => runUpdateCheck({ userAsked: true })}
                    disabled={$updateStatus?.state === 'checking'}>Check now</button>
          </div>
          {#if $updateStatus?.updateAvailable && $updateStatus?.releaseUrl}
            <a class="update-link" href={$updateStatus.releaseUrl} target="_blank" rel="noreferrer">
              Open the release page
            </a>
          {/if}
        </div>

        {#each NOTICES as notice}
          <div class="notice">
            <h3 class="notice-title">{notice.title}</h3>
            <p class="notice-body">{notice.detail}</p>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .overlay-panel {
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    max-width: 560px;
    max-height: 80vh;
    width: 90%;
    display: flex;
    flex-direction: column;
  }

  .overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #3A3A3A;
  }

  .overlay-title { color: #DDD; font-size: 13px; font-weight: 600; }

  .close-btn {
    background: none; border: none; color: #888;
    font-size: 20px; cursor: pointer; padding: 0 4px; line-height: 1;
  }
  .close-btn:hover { color: #FFF; }

  .overlay-body { overflow-y: auto; padding: 16px; }
  .overlay-body::-webkit-scrollbar { width: 6px; }
  .overlay-body::-webkit-scrollbar-track { background: transparent; }
  .overlay-body::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

  .build { margin-bottom: 18px; }
  .product { color: #EEE; font-size: 16px; font-weight: 600; }
  .stamp { color: #888; font-size: 11px; margin-top: 3px; user-select: text; }

  .update { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .update-line { color: #AAA; font-size: 12px; }
  .update-btn {
    background: #383F47; border: 1px solid #4C555E; border-radius: 4px;
    color: #DDD; font-family: inherit; font-size: 11px; padding: 2px 9px; cursor: pointer;
  }
  .update-btn:hover:not(:disabled) { background: #454E57; color: #FFF; }
  .update-btn:disabled { opacity: 0.5; cursor: default; }
  .update-link { display: inline-block; margin-top: 6px; color: #7FB3E0; font-size: 12px; }

  .notice { margin-bottom: 16px; }
  .notice:last-child { margin-bottom: 0; }

  .notice-title {
    font-size: 11px; color: #5B9BD5; text-transform: uppercase; letter-spacing: 0.5px;
    margin: 0 0 6px 0; padding-bottom: 4px; border-bottom: 1px solid #333;
  }

  .notice-body { color: #AAA; font-size: 12px; line-height: 1.5; margin: 0; user-select: text; }
</style>
