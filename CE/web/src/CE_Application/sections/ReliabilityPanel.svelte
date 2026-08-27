<script>
  /**
   * ReliabilityPanel.svelte — what the product did about its own failures (§17).
   *
   * The native side already refuses to load a plug-in that took the last run down, keeps a
   * state it knows boots, and gathers a support bundle by allowlist. None of that is worth
   * much if the person in front of it cannot see that it happened and cannot get back out —
   * a safe mode nobody can find is indistinguishable from a broken install.
   *
   * Four blocks, in the order somebody in trouble needs them: what happened, what is being
   * skipped because of it, what came back damaged, and how to hand the whole picture to
   * somebody else.
   */
  import {
    hostState, hostSupportBundle,
    setSafeMode, clearSafeModeSuspect, clearAllSafeModeSuspects,
    acknowledgeRecovery, restoreLastKnownGood,
    previewSupportBundle, exportSupportBundle,
  } from '../stores/instrumentHost.js';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let reliability = $derived($hostState.reliability);
  let safeMode = $derived(reliability.safeMode);
  let recovery = $derived(reliability.recovery);
  let bundle = $derived($hostSupportBundle);

  // Modules the catalogue is refusing for a reason that is not the plug-in's fault — the
  // wrong architecture, mostly. They belong here rather than in the browser, which is exactly
  // the list they are absent from.
  let unavailableModules = $derived(
    $hostState.modules.filter((m) => m.unavailableReason && !m.missing)
  );

  let includeStateBlobs = $state(false);
  let includeCrashStates = $state(true);
  let includeLogs = $state(true);

  const bundleOptions = () => ({ includeStateBlobs, includeCrashStates, includeLogs });

  const levelLabel = {
    normal: 'Loading everything',
    skipSuspects: 'Skipping plug-ins that crashed',
    noThirdParty: 'No third-party plug-ins at all',
  };

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
</script>

<div class="reliability-panel" data-testid="host-reliability-panel">
  <div class="reliability-grid">
    <section class="block">
      <strong>Since the last run</strong>
      {#if recovery.interrupted}
        <div class="alert" data-testid="reliability-interrupted">
          <p class="line">
            The last run stopped without finishing
            {#if recovery.lastOperation}
              — it was {recovery.lastOperation === 'restoreSession' ? 'restoring the session'
                        : recovery.lastOperation === 'loadInstrument' ? 'loading an instrument'
                        : recovery.lastOperation === 'loadEffect' ? 'loading an effect'
                        : recovery.lastOperation}{#if recovery.lastOperationDetail}, {recovery.lastOperationDetail}{/if}.
            {:else}.{/if}
          </p>
          {#if recovery.preservedStateFile}
            <p class="note">
              The rack as it was then was kept for diagnosis:
              <span class="path">{recovery.preservedStateFile}</span>
            </p>
          {/if}
          <div class="alert-actions">
            {#if recovery.hasLastKnownGood}
              <button type="button" onclick={() => restoreLastKnownGood()}
                      data-testid="reliability-restore-known-good">Go back to the last rig that booted</button>
            {/if}
            <button type="button" class="ghost" onclick={() => acknowledgeRecovery()}
                    data-testid="reliability-acknowledge">Dismiss</button>
          </div>
        </div>
      {:else}
        <p class="note">The last run ended cleanly.</p>
      {/if}

      <div class="readout">
        <span class="label">Last rig that booted</span>
        <span class="value">
          {recovery.hasLastKnownGood
            ? (recovery.lastKnownGoodAt ? recovery.lastKnownGoodAt.replace('T', ' ').slice(0, 19)
                                        : 'available')
            : 'none yet — a rig has to boot cleanly once'}
        </span>
      </div>
      {#if recovery.hasLastKnownGood && !recovery.interrupted}
        <button type="button" class="ghost" onclick={() => restoreLastKnownGood()}>
          Go back to it
        </button>
      {/if}
    </section>

    <section class="block">
      <strong>Safe startup</strong>
      <p class="note">
        A plug-in that was live when a run ended abnormally is not loaded again until you
        vouch for it. The part keeps its identity and its saved state either way.
      </p>
      <label class="field">Level
        <select value={safeMode.level} aria-label="Safe startup level"
                onchange={(e) => setSafeMode(e.currentTarget.value)}
                data-testid="reliability-level">
          {#each Object.entries(levelLabel) as [value, label] (value)}
            <option {value}>{label}</option>
          {/each}
        </select>
      </label>

      {#if safeMode.suspects.length === 0}
        <p class="note quiet">Nothing is being skipped.</p>
      {:else}
        <div class="suspects" data-testid="reliability-suspects">
          {#each safeMode.suspects as suspect (suspect.modulePath)}
            <div class="suspect">
              <span class="suspect-name">{suspect.name || suspect.modulePath}</span>
              <span class="detail">
                {suspect.reason}{suspect.incidents > 1 ? ` · ${suspect.incidents}×` : ''}
              </span>
              <button type="button" class="ghost"
                      onclick={() => clearSafeModeSuspect(suspect.modulePath)}>Load it again</button>
            </div>
          {/each}
        </div>
        <button type="button" class="ghost" onclick={() => clearAllSafeModeSuspects()}>
          Vouch for all of them
        </button>
      {/if}

      {#if reliability.refusedThisRun.length > 0}
        <div class="readout"><span class="label">Not loaded this run</span>
          <span class="value" data-testid="reliability-refused">
            {reliability.refusedThisRun.map((f) => f.name || f.modulePath).join(', ')}
          </span></div>
        <p class="note quiet">
          Vouching takes effect on the next open — reopen the project to load them.
        </p>
      {/if}
    </section>

    <section class="block">
      <strong>What could not be offered</strong>
      {#if unavailableModules.length === 0 && reliability.damagedState.length === 0}
        <p class="note">Every catalogued plug-in is loadable on this machine.</p>
      {/if}

      {#if unavailableModules.length > 0}
        <div class="matrix" data-testid="reliability-unavailable">
          {#each unavailableModules as module (module.path)}
            <div class="matrix-row">
              <span class="label">{module.path.split(/[\\/]/).pop()}</span>
              <span class="detail">{module.unavailableReason}</span>
            </div>
          {/each}
        </div>
        <p class="note quiet">
          These stay in the catalogue with their reason rather than disappearing — a plug-in
          missing from the browser with nothing explaining it is unanswerable.
        </p>
      {/if}

      {#if reliability.damagedState.length > 0}
        <div class="alert" data-testid="reliability-damaged">
          {#each reliability.damagedState as note (note)}
            <p class="line">{note}</p>
          {/each}
        </div>
      {/if}
    </section>

    <section class="block">
      <strong>Support bundle</strong>
      <p class="note">
        Gathered by allowlist: nothing travels unless it is named in the code. Licence files,
        tokens and unrelated documents in the same folder are not named, so they cannot be in it.
      </p>

      <span class="check">
        <PropertyToggle compact value={includeCrashStates} ariaLabel="Include preserved crash states"
                        onchange={(v) => (includeCrashStates = v)} />
        Include preserved crash states
      </span>
      <span class="check">
        <PropertyToggle compact value={includeLogs} ariaLabel="Include logs"
                        onchange={(v) => (includeLogs = v)} />
        Include logs
      </span>
      <span class="check" data-testid="reliability-include-blobs">
        <PropertyToggle compact value={includeStateBlobs}
                        ariaLabel="Include each plug-in's own saved state"
                        onchange={(v) => (includeStateBlobs = v)} />
        Include each plug-in's own saved state
      </span>
      {#if includeStateBlobs}
        <p class="note warn">
          This carries the sounds themselves, not just their names. Leave it off unless
          somebody has asked for it.
        </p>
      {/if}

      <div class="bundle-actions">
        <button type="button" onclick={() => previewSupportBundle(bundleOptions())}
                data-testid="reliability-preview-bundle">See what would be in it</button>
        <button type="button" onclick={() => exportSupportBundle(bundleOptions())}
                data-testid="reliability-export-bundle">Export…</button>
      </div>

      {#if bundle.entries.length > 0}
        <div class="matrix" data-testid="reliability-bundle-entries">
          {#each bundle.entries as entry (entry.name)}
            <div class="matrix-row" class:absent={!entry.included}>
              <span class="tick">{entry.included ? '✓' : '·'}</span>
              <span class="label">{entry.name}</span>
              <span class="detail">
                {formatSize(entry.sizeBytes)}{entry.note ? ` · ${entry.note}` : ''}
              </span>
            </div>
          {/each}
        </div>
        {#if bundle.written && bundle.path}
          <p class="note" data-testid="reliability-bundle-written">Written to {bundle.path}</p>
        {/if}
      {/if}
    </section>
  </div>
</div>

<style>
  .reliability-panel {
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #171a1d;
    max-height: 420px;
    overflow-y: auto;
  }

  .reliability-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .block { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .note { margin: 0; color: #7d8894; font-size: 11px; line-height: 1.45; }
  .note.quiet { color: #66707b; }
  .note.warn { color: #e4b3b3; }
  .line { margin: 0; color: #d6dbe0; font-size: 12px; line-height: 1.45; }
  .path { color: #9aa5b1; word-break: break-all; }

  .readout { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
  .label { flex: 0 0 auto; color: #9aa5b1; font-size: 11px; }
  .value { color: #d6dbe0; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

  .field { display: flex; align-items: center; gap: 8px; color: #9aa5b1; font-size: 11px; }
  .check { display: flex; align-items: center; gap: 6px; color: #9aa5b1; font-size: 11px; }

  .alert {
    border: 1px solid #7a4a4a;
    border-radius: 4px;
    background: #2a1d1d;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .alert-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }

  .suspects { display: flex; flex-direction: column; gap: 4px; }
  .suspect {
    display: flex;
    align-items: baseline;
    gap: 8px;
    border: 1px solid #2c343d;
    border-radius: 3px;
    padding: 4px 6px;
    flex-wrap: wrap;
  }
  .suspect-name { color: #d6dbe0; font-size: 12px; }

  .matrix { display: flex; flex-direction: column; gap: 3px; }
  .matrix-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; min-width: 0; }
  .matrix-row .label { flex: 1; color: #d6dbe0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .matrix-row.absent .label { color: #66707b; }
  .tick { flex: 0 0 12px; color: #9fd6a3; }
  .matrix-row.absent .tick { color: #66707b; }
  .detail {
    flex: 0 0 auto;
    color: #7d8894;
    font-size: 11px;
    max-width: 55%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bundle-actions { display: flex; gap: 6px; flex-wrap: wrap; }

  button {
    background: #232a31;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 3px 8px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  button:hover { border-color: #5b9bd5; }
  button.ghost { background: none; border-color: transparent; color: #7d8894; align-self: flex-start; }
  button.ghost:hover { color: #d6dbe0; border-color: #3b4652; }

  select {
    background: #14171a;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 3px 6px;
    font: inherit;
    font-size: 12px;
  }
</style>
