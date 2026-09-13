<script>
  /**
   * ReliabilityPanel.svelte — what the product did about its own failures (§17).
   *
   * The native side already refuses to load a plug-in that took the last run down, keeps a
   * state it knows boots, and gathers a support bundle by allowlist. None of that is worth
   * much if the person in front of it cannot see that it happened and cannot get back out —
   * a safe mode nobody can find is indistinguishable from a broken install.
   *
   * Five blocks, in the order somebody in trouble needs them: what happened, what was kept
   * alive in this run, what is skipped on startup, what came back damaged, and how to hand
   * the whole picture to somebody else.
   */
  import {
    hostState, hostSupportBundle,
    setSafeMode, clearSafeModeSuspect, clearAllSafeModeSuspects,
    acknowledgeRecovery, restoreLastKnownGood,
    setAutomaticFailover, retryFailedProcessor, dismissFailoverEvent,
    previewSupportBundle, exportSupportBundle, clearQuarantine,
    hostPanic, dismissMidiIssue,
  } from '../stores/instrumentHost.js';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { hostRackIssues } from '../stores/hostPartIssues.js';
  import { hostPartLabel } from '../utils/hostTargetContext.js';
  let { onInspectPart = () => {} } = $props();
  let partIssues = $derived($hostState.rack.parts.flatMap((part, index) =>
    ($hostRackIssues[part.partId] ?? []).map(issue => ({ part, index, issue }))));

  let reliability = $derived($hostState.reliability);
  let safeMode = $derived(reliability.safeMode);
  let recovery = $derived(reliability.recovery);
  let failover = $derived(reliability.automaticFailover);
  let midi = $derived(reliability.midi);
  let bundle = $derived($hostSupportBundle);
  // Every part that can sound a note: the per-part panic row. A hardware part counts — its
  // synth holds notes of its own and the panic reaches it over the wire.
  let soundingParts = $derived($hostState.rack.parts.filter((p) => p.hasInstrument || p.hardware));

  const midiKindLabel = {
    stuckNote: 'Stuck note',
    heldNote: 'Held note',
    controllerJitter: 'Controller jitter',
    programChange: 'Program change',
    inputGone: 'Input gone',
  };
  // A stuck note and a vanished input are faults; a held note and a program change are facts
  // to know about. The colour says which without a word.
  const midiFault = (issue) => issue.kind === 'stuckNote' || issue.kind === 'inputGone'
    || issue.kind === 'controllerJitter';
  const ago = (ms) => (ms < 1500 ? 'just now' : ms < 90000 ? `${Math.round(ms / 1000)} s ago`
    : `${Math.round(ms / 60000)} min ago`);
  function partName(partId, fallback) {
    const index = $hostState.rack.parts.findIndex((p) => p.partId === partId);
    const part = $hostState.rack.parts[index];
    return part?.pluginName || fallback || (index >= 0 ? `Part ${index + 1}` : partId);
  }

  // Every module the scan touched that produced nothing loadable, and why. This is the whole
  // of what the browser used to show, minus the healthy rows — a module that yielded classes
  // needs no row anywhere, because its classes ARE the row, and they are in the instrument and
  // effect lists. What is left is the question only this panel answers: I pointed the scanner
  // at a folder, and something in it is not here. Why?
  let troubledModules = $derived($hostState.modules.filter(
    (m) => m.quarantined || m.missing || m.unavailableReason || m.failureCount > 0));

  function moduleReason(module) {
    if (module.quarantined) return `quarantined — ${module.lastFailureReason || 'failed to scan'}`;
    if (module.missing) return 'missing — the file is gone from where it was scanned';
    // The wrong architecture, mostly. Without this the row fell through to "no instruments",
    // which reads as a plug-in with nothing in it rather than one this machine cannot load.
    if (module.unavailableReason) return module.unavailableReason;
    return `scan failed — ${module.lastFailureReason || 'no reason reported'}`;
  }

  let includeStateBlobs = $state(false);
  let includeCrashStates = $state(true);
  let includeLogs = $state(true);
  let includeWorkerDumps = $state(false);

  const bundleOptions = () => ({
    includeStateBlobs, includeCrashStates, includeLogs, includeWorkerDumps,
  });

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

  function failoverState(event) {
    if (event.state === 'waiting') return 'retry queued';
    if (event.state === 'loading') return 'restoring now';
    if (event.state === 'recovered') return 'restored';
    if (event.state === 'bypassed') return event.effect ? 'dry-bypassed' : 'silenced';
    return 'needs attention';
  }
</script>

<div class="reliability-panel" data-testid="host-reliability-panel">
  <div class="reliability-grid">
    {#if partIssues.length}
      <section class="block" data-testid="health-part-issues">
        <strong>Rack diagnostics</strong>
        {#each partIssues as { part, index, issue } (`${part.partId}:${issue.id}`)}
          <div class="part-diagnostic">
            <span><b>{hostPartLabel(part, index)}</b><br />{issue.detail}</span>
            {#if issue.target !== 'health'}
              <button type="button" onclick={() => onInspectPart(part.partId, issue)}>
                {{ mixer: 'Mixer', routing: 'Routing', zone: 'Zone', devices: 'Audio & MIDI', part: 'Rack' }[issue.target]}
              </button>
            {/if}
          </div>
        {/each}
      </section>
    {/if}
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

    <!-- MIDI, right now. What a person opens Health for mid-set: a note that will not stop, a
         knob turning itself, a sound that changed on its own, a keyboard that went quiet.
         Each row names the parts it reaches so the panic can be aimed at one part and the
         rest keep playing. -->
    <section class="block" data-testid="reliability-midi">
      <strong>MIDI, right now</strong>
      {#if midi.issues.length === 0}
        <p class="note quiet" data-testid="reliability-midi-quiet">
          Nothing is stuck, jittering or changing programs on its own.
        </p>
      {:else}
        <div class="midi-issues" data-testid="reliability-midi-issues">
          {#each midi.issues as issue (issue.key)}
            <div class="midi-issue" class:fault={midiFault(issue)} data-testid="reliability-midi-issue"
                 data-kind={issue.kind}>
              <span class="midi-kind">{midiKindLabel[issue.kind]}</span>
              <span class="midi-text">{issue.text}</span>
              <span class="midi-actions">
                {#if issue.kind === 'stuckNote' || issue.kind === 'heldNote'}
                  {#each issue.parts as part (part.partId)}
                    <button type="button" class="ghost" data-testid="reliability-midi-panic-part"
                            title={`All notes off on ${partName(part.partId, part.name)} only`}
                            onclick={() => hostPanic(part.partId)}>Panic {partName(part.partId, part.name)}</button>
                  {/each}
                  {#if issue.parts.length === 0}
                    <span class="detail">reaches no part</span>
                  {/if}
                {:else}
                  <button type="button" class="ghost" data-testid="reliability-midi-dismiss"
                          title="Seen it. The row goes; the next occurrence comes back."
                          onclick={() => dismissMidiIssue(issue.key)}>Dismiss</button>
                {/if}
              </span>
            </div>
          {/each}
        </div>
      {/if}

      {#if midi.inputs.length > 0}
        <div class="matrix tight" data-testid="reliability-midi-inputs">
          {#each midi.inputs as input (input.name)}
            <span class="name" class:bad={!input.present}>{input.name}</span>
            <span class="detail">
              {input.present ? 'listening' : 'not listed by the system'}
              · {input.messages} {input.messages === 1 ? 'message' : 'messages'}, last {ago(input.lastAgoMs)}
              {#if input.heldNotes > 0}· {input.heldNotes} {input.heldNotes === 1 ? 'note' : 'notes'} down{/if}
            </span>
          {/each}
        </div>
      {:else}
        <p class="note quiet">No MIDI input has sent anything yet.</p>
      {/if}

      {#if soundingParts.length > 0}
        <div class="panic-row" data-testid="reliability-panic-row">
          <span class="label">Panic</span>
          {#each soundingParts as part (part.partId)}
            <button type="button" class="ghost" data-testid="reliability-panic-part"
                    title={`All notes off on ${partName(part.partId)} only — the other parts keep playing`}
                    onclick={() => hostPanic(part.partId)}>{partName(part.partId)}</button>
          {/each}
          <button type="button" class="ghost all" title="All notes off, every part"
                  data-testid="reliability-panic-all" onclick={() => hostPanic()}>Everything</button>
        </div>
      {/if}
    </section>

    <section class="block" data-testid="reliability-live-failover">
      <strong>Live plug-in failover</strong>
      {#if failover.isolationAvailable}
        <p class="note">
          Each plug-in runs in its own worker process. If it crashes, disconnects or stops meeting
          audio deadlines, Hostage removes only that instance from the audio path. Effects pass dry
          audio and instruments fall silent while a fresh worker receives the last saved state.
          Other parts keep playing; Hostage never silently reloads the plug-in in its own process.
        </p>
      {:else}
        <p class="note warn" data-testid="reliability-isolation-unavailable">
          The isolated live-worker executable is not available in this build. Plug-in loading will
          refuse safely instead of falling back to running third-party code inside Hostage.
        </p>
      {/if}
      <span class="check">
        <PropertyToggle compact value={failover.enabled}
                        ariaLabel="Automatically restore failed plug-ins"
                        onchange={(enabled) => setAutomaticFailover({ enabled })} />
        Restore failed plug-ins automatically
      </span>
      <div class="policy-row">
        <label class="field">Attempts
          <select value={failover.maxAttempts}
                  onchange={(e) => setAutomaticFailover({ maxAttempts: Number(e.currentTarget.value) })}
                  data-testid="reliability-failover-attempts">
            {#each [1, 2, 3, 4, 5] as attempts (attempts)}
              <option value={attempts}>{attempts}</option>
            {/each}
          </select>
        </label>
        <label class="field">First retry
          <select value={failover.retryDelayMs}
                  onchange={(e) => setAutomaticFailover({ retryDelayMs: Number(e.currentTarget.value) })}
                  data-testid="reliability-failover-delay">
            <option value={100}>0.1 s</option>
            <option value={250}>0.25 s</option>
            <option value={500}>0.5 s</option>
            <option value={1000}>1 s</option>
            <option value={2000}>2 s</option>
          </select>
        </label>
      </div>

      {#if failover.events.length === 0}
        <p class="note quiet">No plug-in has been removed from this run.</p>
      {:else}
        <div class="failover-events" data-testid="reliability-failover-events">
          {#each failover.events as event (event.targetId)}
            <div class:recovered={event.state === 'recovered'} class="failover-event">
              <div class="event-line">
                <span class="suspect-name">{event.name || event.targetId}</span>
                <span class="status">{failoverState(event)}</span>
              </div>
              <span class="detail wide">
                {event.effect ? 'Effect' : 'Instrument'}
                {event.attempts > 0 ? ` · ${event.attempts}/${failover.maxAttempts} attempts` : ''}
                {event.error ? ` · ${event.error}` : ''}
              </span>
              <div class="alert-actions">
                {#if event.state === 'failed' || event.state === 'bypassed'}
                  <button type="button" class="ghost"
                          onclick={() => retryFailedProcessor(event.targetId)}>Retry now</button>
                {/if}
                {#if event.state !== 'loading'}
                  <button type="button" class="ghost"
                          onclick={() => dismissFailoverEvent(event.targetId)}>Dismiss</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      <p class="note quiet">
        Safe startup remains the backstop for an interrupted session and for plug-ins that fail
        repeatedly after being restored.
      </p>
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
      {#if troubledModules.length === 0 && reliability.damagedState.length === 0}
        <p class="note">
          Every catalogued plug-in is loadable on this machine
          ({$hostState.modules.length} {$hostState.modules.length === 1 ? 'module' : 'modules'} scanned).
        </p>
      {/if}

      {#if troubledModules.length > 0}
        <div class="matrix tight" data-testid="reliability-unavailable">
          {#each troubledModules as module (module.path)}
            <div class="matrix-row">
              <span class="label" title={module.path}>{module.path.split(/[\\/]/).pop()}</span>
              <span class="detail">{moduleReason(module)}</span>
              {#if module.quarantined}
                <button type="button" class="ghost" data-testid="reliability-retry"
                        onclick={() => clearQuarantine(module.path)}>Retry</button>
              {/if}
            </div>
          {/each}
        </div>
        <p class="note quiet">
          These stay in the catalogue with their reason rather than disappearing — a plug-in
          missing from the browser with nothing explaining it is unanswerable. Modules that
          scanned cleanly are not listed: their instruments and effects are the answer.
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
      <span class="check" data-testid="reliability-include-worker-dumps">
        <PropertyToggle compact value={includeWorkerDumps}
                        ariaLabel="Include live plug-in worker minidumps"
                        onchange={(v) => (includeWorkerDumps = v)} />
        Include live plug-in worker minidumps
      </span>
      {#if includeWorkerDumps}
        <p class="note warn">
          Minidumps help diagnose native plug-in crashes, but can contain stack memory and
          local file paths. Inspect the preview and include them only when support asks.
        </p>
      {/if}
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
  .part-diagnostic { display: flex; align-items: center; gap: 8px; padding: 7px 0;
    border-bottom: 1px solid var(--host-line-soft); font-size: 12px; line-height: 1.5; }
  .part-diagnostic > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .part-diagnostic > button { flex: none; }
  .reliability-panel {
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid var(--host-line);
    border-radius: var(--host-radius-panel);
    background: var(--host-surface);
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
  .policy-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

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

  .failover-events { display: flex; flex-direction: column; gap: 5px; }
  .failover-event {
    display: flex;
    flex-direction: column;
    gap: 3px;
    border: 1px solid #7a4a4a;
    border-radius: 3px;
    padding: 5px 7px;
    background: #241b1b;
  }
  .failover-event.recovered { border-color: #3e6548; background: #19221b; }
  .event-line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .status { color: var(--host-accent); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
  .detail.wide { max-width: none; white-space: normal; }

  .matrix { display: flex; flex-direction: column; gap: 3px; }
  /* The bundle list wants its sizes in a right-hand column; a reason wants to sit next to the
     name it explains, or a wide panel strands it half a screen away from what it is about. */
  .matrix.tight .matrix-row .label { flex: 0 1 auto; }
  .matrix.tight .detail { max-width: none; white-space: normal; }
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

  button.ghost { align-self: flex-start; }

  .midi-issues { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
  .midi-issue {
    display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; align-items: baseline;
    padding: 6px 8px; border-radius: 4px; background: #1c2126; border-left: 3px solid #7d8894;
  }
  .midi-issue.fault { border-left-color: #e0725c; background: #e0725c14; }
  .midi-kind { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #7d8894; white-space: nowrap; }
  .midi-issue.fault .midi-kind { color: #e0725c; }
  .midi-text { font-size: 11.5px; line-height: 1.4; }
  .midi-actions { grid-column: 2; display: flex; flex-wrap: wrap; gap: 4px; }
  .midi-actions button.ghost { font-size: 10.5px; padding: 1px 7px; }
  .panic-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 8px; }
  .panic-row .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #7d8894; margin-right: 4px; }
  .panic-row button.ghost { font-size: 10.5px; padding: 1px 8px; }
  .panic-row button.all { color: #e0725c; }
  .matrix .name.bad { color: #e0725c; }
</style>
