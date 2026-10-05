<script>
  // ScriptTrustBanner — asks once before a panel's scripts run (stores/scriptTrust.js).
  //
  // Preview scripts can reach this computer's files through the app's native bridge, so code that
  // arrived in an opened or shared panel waits here until the user says it may run. The question
  // names what is waiting and why it matters; the answer is remembered for that exact code.
  import { get } from 'svelte/store';
  import { pendingScriptTrust, trustScriptsHash, declineScriptsHash } from '../stores/scriptTrust.js';
  import { previewModeEnabled, setPreviewModeEnabled } from '../stores/interactionPreview.js';

  const LANGUAGE_NAMES = { javascript: 'JavaScript', typescript: 'TypeScript', lua: 'Lua', python: 'Python', cpp: 'C++', csharp: 'C#', java: 'Java' };

  let pending = $derived($pendingScriptTrust);
  let languages = $derived((pending?.languages ?? []).map((l) => LANGUAGE_NAMES[l] ?? l).join(', '));

  function run() {
    if (!pending) return;
    trustScriptsHash(pending.hash);
    // The panel's start-up handlers fired while its scripts were held back; going live again is
    // what runs onPanelLoad, onPanelBuild and onPanelReady for them.
    if (get(previewModeEnabled)) {
      setPreviewModeEnabled(false);
      queueMicrotask(() => setPreviewModeEnabled(true));
    }
  }

  function keepOff() {
    if (pending) declineScriptsHash(pending.hash);
  }
</script>

{#if pending}
  <div class="trust" role="alertdialog" aria-labelledby="script-trust-title" aria-describedby="script-trust-body">
    <div id="script-trust-title" class="title">
      “{pending.panelName}” contains {pending.count} {pending.count === 1 ? 'script' : 'scripts'}{languages ? ` (${languages})` : ''}
    </div>
    <div id="script-trust-body" class="body">
      Scripts can read and write files on this computer and send MIDI to your devices. They are not
      running. Run them only if you trust where this panel came from — you can read them in the script
      editor first.
    </div>
    <div class="actions">
      <button class="primary" onclick={run}>Run scripts</button>
      <button onclick={keepOff}>Keep them off</button>
    </div>
  </div>
{/if}

<style>
  .trust {
    position: fixed;
    left: 50%;
    top: 64px;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 32px));
    padding: 12px 14px;
    border: 1px solid #6A5A30;
    border-radius: 6px;
    background: #1E1E1E;
    color: #DDD;
    font-size: 12px;
    line-height: 1.45;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    z-index: 950;
  }
  .title { font-weight: 600; color: #E0C070; margin-bottom: 4px; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
  button {
    padding: 4px 12px;
    border: 1px solid #444;
    border-radius: 4px;
    background: #2A2A2A;
    color: #DDD;
    font-size: 12px;
    cursor: pointer;
  }
  button:hover { border-color: #5B9BD5; }
  button.primary { border-color: #5B9BD5; background: #24415C; }
</style>
