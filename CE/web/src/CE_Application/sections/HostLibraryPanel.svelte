<script>
  import { onDestroy, onMount } from 'svelte';
  import { hostState, hostScanLog, hostLibrary, scanForInstruments, scanLibrary,
    requestLibrary, browseLibraryPath, removeLibraryPath, hostAnalysis, analyseLibrary, cancelAnalysis } from '../stores/instrumentHost.js';
  let { onShowSounds = () => {} } = $props();
  let pendingDestructive = $state('');
  let destructiveTimer;
  let updateIssues = $derived($hostLibrary.scanReport.filter(row => row.reason || row.unavailable > 0).length);
  onMount(() => requestLibrary($hostLibrary.request));
  function guardedAction(key, action) {
    if (pendingDestructive === key) { clearTimeout(destructiveTimer); pendingDestructive = ''; action(); return; }
    pendingDestructive = key;
    clearTimeout(destructiveTimer);
    destructiveTimer = setTimeout(() => pendingDestructive = '', 5000);
  }
  onDestroy(() => clearTimeout(destructiveTimer));
</script>

<svelte:window onkeydown={(event) => {
  if (event.key === 'Escape') { clearTimeout(destructiveTimer); pendingDestructive = ''; }
}} />

<section class="library-management" data-testid="host-library-panel" aria-label="Library management">
  <section><h3>Plug-ins</h3>
    <button type="button" onclick={() => scanForInstruments()} disabled={$hostState.scanning} data-testid="host-scan">
      {$hostState.scanning ? 'Scanning plug-ins…' : 'Scan plug-ins'}
    </button>
    <p role="status">{$hostScanLog.at(-1) || 'Instruments and effects'}</p>
  </section>
  <section><div class="section-head"><h3>Preset folders</h3><button type="button" onclick={() => browseLibraryPath()}>Add folder…</button></div>
      {#if $hostLibrary.paths.length > 0}
        <div class="library-paths">
          {#each $hostLibrary.paths as path (path)}
            <span class="scan-path"><span>{path}</span>
            <button type="button" class="ghost danger" class:confirming={pendingDestructive === `library-path:${path}`}
                    title={pendingDestructive === `library-path:${path}` ? 'Click again to confirm' : 'Remove this library folder'}
                    onclick={() => guardedAction(`library-path:${path}`, () => removeLibraryPath(path))}>
              {pendingDestructive === `library-path:${path}` ? 'Confirm' : '×'}
            </button></span>
          {/each}
        </div>
      {/if}

  </section>
  <section><h3>Preset library</h3>
      <button type="button" onclick={() => scanLibrary()} disabled={$hostLibrary.scanning} data-testid="host-scan-library">{$hostLibrary.scanning ? 'Updating library…' : 'Update library'}</button>
      <p class="library-note">Saved sounds are ready immediately. Update after adding presets or plug-ins; favourites and tags are kept.</p>
      {#if $hostLibrary.scanReport.length || $hostLibrary.updateFinished}
        <details class="scan-report" open={$hostLibrary.updateFinished && (updateIssues > 0 || !$hostLibrary.scanReport.length)}>
          <summary>Update results · {$hostLibrary.scanReport.length} plug-ins{updateIssues ? ` · ${updateIssues} need attention` : ''}</summary>
          {#if !$hostLibrary.scanReport.length}<div>No imported VST3 plug-ins were available to scan. Import a plug-in, then update the library.</div>{/if}
          {#each $hostLibrary.scanReport as result}
            <div><strong>{result.name}</strong> · {result.kind} · {result.count} usable presets
              <span>{result.files} files · {result.programs} named programs{result.unavailable ? ` · ${result.unavailable} unavailable` : ''}</span>
              {#if result.unnamedPrograms}<span>{result.unnamedPrograms} unnamed program slots excluded</span>{/if}
              {#if result.reason}<span class="load-failed">{result.reason}</span>{/if}
            </div>
          {/each}
        </details>
      {/if}

    <p>{$hostLibrary.counts.presets} presets · {$hostLibrary.counts.chains} chains · {$hostLibrary.counts.racks} racks</p>
  </section>
  <section>
      <div class="rail-head">The auditioner</div>
      {#if $hostAnalysis.running}
        <div class="listen-progress" data-testid="analysis-progress">
          <div class="bar"><i style={`width:${$hostAnalysis.total > 0
            ? Math.round(100 * $hostAnalysis.done / $hostAnalysis.total) : 0}%`}></i></div>
          <span class="listen-what">{$hostAnalysis.done} of {$hostAnalysis.total} · {$hostAnalysis.what}</span>
        </div>
        <button type="button" class="rail-action" onclick={() => cancelAnalysis()}>Stop listening</button>
      {:else}
        <button type="button" class="rail-action" data-testid="host-analyse"
                disabled={$hostLibrary.counts.measurable === 0}
                title={$hostLibrary.counts.measurable === 0
                       ? 'Everything with a plug-in behind it has been asked'
                       : 'Play each of these once and write down what came out'}
                onclick={() => analyseLibrary()}>
          {$hostLibrary.counts.measurable === 0
            ? 'Nothing left to measure'
            : `Listen to ${$hostLibrary.counts.measurable} sound${$hostLibrary.counts.measurable === 1 ? '' : 's'}`}
        </button>
        <!-- Refused sounds are not in `measurable` — that is what remembering a refusal means —
             so without their own line "nothing left to measure" would be quietly hiding them.
             This is also the only way back to one: the auditioner will not ask again on its own. -->
        {#if $hostLibrary.counts.refused > 0}
          <div class="listen-refused" data-testid="refused-count">
            {$hostLibrary.counts.refused} could not be heard.
            <button type="button" class="ghost more" data-testid="host-analyse-all"
                    title="Ask every sound again, including the ones that refused"
                    onclick={() => analyseLibrary(true)}>MEASURE EVERYTHING AGAIN</button>
          </div>
        {/if}
        {#if $hostAnalysis.what}
          <span class="listen-what">{$hostAnalysis.what}</span>
        {/if}
      {/if}
  </section>
      {#if $hostLibrary.duplicates.length > 0}
        <div class="rail-head">Housekeeping</div>
        <div class="rail-row">
          <span class="dup-note" data-testid="duplicate-note">
            {$hostLibrary.duplicates.length} duplicate
            {$hostLibrary.duplicates.length === 1 ? 'set' : 'sets'} —
            {$hostLibrary.duplicates.reduce((n, d) => n + d.recordIds.length - 1, 0)} copies
          </span>
        </div>
        {#each $hostLibrary.duplicates.slice(0, 6) as set (set.keyRecordId)}
          <button type="button" class="rail-item" data-testid="duplicate-set"
                  title={set.identical ? 'The same bytes, filed more than once'
                                       : 'The same name, plug-in and measurement'}
                  onclick={() => onShowSounds(set.name)}>
            <span>{set.name}</span><span class="n">×{set.recordIds.length}</span>
          </button>
        {/each}
      {/if}


</section>

<style>
  .library-management { display: flex; flex-direction: column; gap: 12px; color: var(--host-text); font-size: 12px; }
  section section { border-bottom: 1px solid var(--host-line-soft); padding-bottom: 12px; }
  h3, .rail-head { font-size: 12px; font-weight: 600; margin: 0 0 8px; }
  .section-head, .scan-path, .rail-row { display: flex; align-items: center; gap: 6px; }
  .section-head h3 { flex: 1; margin: 0; }
  .library-paths { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .scan-path > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  p, .scan-path, .listen-what, .listen-refused, .dup-note { color: var(--host-text-soft); font-size: 11px; }
  p { margin: 7px 0 0; overflow-wrap: anywhere; }
  button { font: inherit; padding: 5px 8px; border: 1px solid var(--host-line); border-radius: 4px; background: var(--host-bg); color: var(--host-text); cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--host-accent); }
  button:disabled { opacity: .5; cursor: default; }
  button.confirming, .load-failed { color: var(--host-danger); }
  .scan-report { margin-top: 10px; font-size: 11px; }
  .scan-report summary { cursor: pointer; }
  .scan-report div { padding-top: 8px; overflow-wrap: anywhere; }
  .scan-report span { display: block; color: var(--host-text-soft); margin-top: 3px; }
  .scan-report span.load-failed { color: var(--host-danger); }
  .bar { height: 3px; background: var(--host-line-soft); }
  .bar i { display: block; height: 100%; background: var(--host-accent); }
  .listen-progress, .listen-refused { margin-bottom: 6px; }
  .rail-item { display: flex; justify-content: space-between; gap: 8px; text-align: left; }
</style>
