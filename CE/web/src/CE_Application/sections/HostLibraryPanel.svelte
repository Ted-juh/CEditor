<script>
  import { onDestroy, onMount } from 'svelte';
  import { hostState, hostScanLog, hostLibrary, scanForInstruments, scanLibrary,
    requestLibrary, browseLibraryPath, removeLibraryPath, hostAnalysis, analyseLibrary, cancelAnalysis,
    mergeDuplicateSet, browseStateFolder, addStateFolder, removeStateFolder } from '../stores/instrumentHost.js';
  let { onShowSounds = () => {} } = $props();
  let pendingDestructive = $state('');
  let destructiveTimer;
  // Only something that went wrong needs attention: a plug-in whose presets are in a format of
  // its own is not broken, and says what can be done about it on its own row.
  let updateIssues = $derived($hostLibrary.scanReport.filter(row => row.reason || row.unavailable > 0).length);
  const folderFor = (row) => $hostLibrary.stateFolders.find((f) => f.ceId === row.ceId) ?? null;
  // Folders whose plug-in has no row yet (no update since) still need to be seen and removable.
  let unlistedFolders = $derived($hostLibrary.stateFolders.filter((f) =>
    !$hostLibrary.scanReport.some((row) => row.ceId === f.ceId)));
  const shortPath = (path) => {
    const parts = String(path).split(/[\\/]/).filter(Boolean);
    return parts.length > 3 ? `…\\${parts.slice(-3).join('\\')}` : path;
  };
  // The refusal causes C++ reports (RefusalCause in Library.h), in the order somebody would act
  // on them: the one a re-run can fix, then the ones it cannot, then anything unrecognised —
  // which appears only when a refusal string has moved and nothing classifies it any more.
  const REFUSAL_ROWS = [
    { cause: 'crashed',     retryable: true,  label: 'the plug-in crashed or stopped responding' },
    { cause: 'unreadable',  retryable: false, label: 'the saved state is damaged or unreadable' },
    { cause: 'mismatch',    retryable: false, label: 'the plug-in no longer accepts this preset' },
    { cause: 'unsupported', retryable: false, label: 'this build cannot load that kind of preset' },
    { cause: 'other',       retryable: false, label: 'for a reason this build does not recognise' },
  ];
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
  <section><div class="section-head"><h3>More folders to search</h3><button type="button" onclick={() => browseLibraryPath()}>Add folder…</button></div>
      <p class="library-note">For .vstpreset, NKS, FXP, Spire and Zebra files kept outside the usual places. A plug-in with
        presets in a format of its own gets its folder on its own row below.</p>
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
      {#if $hostLibrary.scanReport.length}
        <div class="scan-report" data-testid="plugin-presets">
          <div class="report-head">Presets by plug-in · {$hostLibrary.scanReport.length}{updateIssues ? ` · ${updateIssues} need attention` : ''}</div>
          {#each $hostLibrary.scanReport as result (result.ceId || result.name)}
            {@const folder = folderFor(result)}
            <div class="report-row" data-testid="plugin-presets-row" data-plugin={result.name}>
              <div class="row-title"><strong>{result.name}</strong> · {result.kind} ·
                <span class="row-count" class:none={result.count === 0}>{result.count > 0 ? `${result.count} presets` : 'no presets'}</span></div>
              {#if result.count > 0}
                <span>{result.files} files · {result.programs} named programs{result.unavailable ? ` · ${result.unavailable} unavailable` : ''}{result.unnamedPrograms ? ` · ${result.unnamedPrograms} unnamed program slots left out` : ''}</span>
              {/if}
              {#if result.reason}<span class="load-failed">{result.reason}</span>{/if}
              {#if folder}
                <!-- The folder this plug-in's presets come from, and what the test load said. -->
                <span class="folder-line" class:refused={folder.status === 'refused'} data-testid="plugin-presets-folder">
                  {#if folder.status === 'ok'}From {shortPath(folder.path)} (.{folder.extension}) · {folder.count} presets
                  {:else if folder.status === 'checking'}Test-loading two .{folder.extension} files into {result.name}…
                  {:else}HoSTage can't read the .{folder.extension} files in {shortPath(folder.path)}. {folder.detail}{/if}
                </span>
                {#if folder.status !== 'checking'}
                  <span class="row-actions">
                    <button type="button" class="ghost danger" class:confirming={pendingDestructive === `state-folder:${folder.path}`}
                            title="Stop using this folder; its presets leave the library"
                            onclick={() => guardedAction(`state-folder:${folder.path}`, () => removeStateFolder(folder.path))}>
                      {pendingDestructive === `state-folder:${folder.path}` ? 'Confirm' : 'Remove folder'}</button>
                    {#if folder.status === 'refused'}
                      <button type="button" class="ghost" onclick={() => browseStateFolder(result.ceId)}>Try another folder…</button>
                    {/if}
                  </span>
                {/if}
              {:else if result.count === 0 && !result.reason}
                {#if result.candidate}
                  <span class="found-line" data-testid="plugin-presets-found">Found {result.candidate.files} .{result.candidate.extension} files in
                    {shortPath(result.candidate.path)} that HoSTage does not read yet.</span>
                  <span class="row-actions">
                    <button type="button" data-testid="plugin-presets-test"
                            title="Load two of these into the plug-in; if it takes them, all of them join the library"
                            onclick={() => addStateFolder(result.candidate.path, result.ceId)}>Test these files</button>
                    <button type="button" class="ghost" onclick={() => browseStateFolder(result.ceId)}>Another folder…</button>
                  </span>
                {:else}
                  <span data-testid="plugin-presets-browser-only">No preset files on this computer: its presets are only in its own browser.</span>
                  <span class="row-actions">
                    <button type="button" class="ghost" data-testid="plugin-presets-add"
                            title="If the presets are files somewhere unusual, pick the folder"
                            onclick={() => browseStateFolder(result.ceId)}>Add folder…</button>
                  </span>
                {/if}
              {/if}
            </div>
          {/each}
          {#each unlistedFolders as folder (folder.path)}
            <div class="report-row"><strong>{folder.plugin}</strong>
              <span class="folder-line">{folder.path} · {folder.status === 'ok' ? `${folder.count} presets` : folder.detail}</span>
              <span class="row-actions"><button type="button" class="ghost danger" onclick={() => removeStateFolder(folder.path)}>Remove folder</button></span>
            </div>
          {/each}
        </div>
      {:else if $hostLibrary.updateFinished}
        <div class="scan-report">No imported VST3 plug-ins were available to scan. Import a plug-in, then update the library.</div>
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
          <!-- Split by what could be done about it, because the button above cannot help all of
               them: a crash may well pass on a second run, and a damaged state will fail the same
               way for ever. Without the split one number invites the same fruitless re-run. -->
          <div class="refusal-causes" data-testid="refusal-causes">
            {#each REFUSAL_ROWS as row (row.cause)}
              {@const n = $hostLibrary.counts.refusedByCause?.[row.cause] ?? 0}
              {#if n > 0}
                <div class="refusal-row" data-testid={`refusal-${row.cause}`}>
                  <span class="rn">{n}</span>
                  <span class="rt">{row.label}</span>
                  <span class="rf" class:worth={row.retryable}>
                    {row.retryable ? 'asking again may work' : 'asking again will not help'}
                  </span>
                </div>
              {/if}
            {/each}
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
          <div class="rail-pair">
            <button type="button" class="rail-item" data-testid="duplicate-set"
                    title={set.identical ? 'The same bytes, filed more than once'
                                         : 'The same name, plug-in and measurement'}
                    onclick={() => onShowSounds(set.name)}>
              <span>{set.name}</span><span class="n">×{set.recordIds.length}</span>
            </button>
            <!-- Only the same bytes can be folded. A measured resemblance is the auditioner's
                 opinion, and the difference between two patches that merely sound alike is
                 somebody's edit — folding those would be the program deciding it did not count.
                 The native side refuses it too; this only stops the button offering it. -->
            <button type="button" class="rail-fold" data-testid="fold-duplicates"
                    disabled={!set.identical}
                    title={set.identical
                             ? 'Gather their tags, rating and notes onto one and fold the rest away. Nothing is deleted.'
                             : 'These only sound alike. Folding is for files that are the same bytes.'}
                    onclick={() => mergeDuplicateSet(set.keyRecordId)}>Fold</button>
          </div>
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
  .report-head { font-weight: 600; color: var(--host-text-soft); }
  .report-row { padding: 8px 0; border-top: 1px solid var(--host-line); overflow-wrap: anywhere; }
  .report-row:first-of-type { border-top: 0; }
  .report-row > span { display: block; color: var(--host-text-soft); margin-top: 3px; }
  .row-count.none { color: var(--host-text-soft); }
  .found-line { color: var(--host-text) !important; }
  .folder-line.refused { color: var(--host-warning, #d9a441) !important; }
  .row-actions { display: flex !important; gap: 6px; flex-wrap: wrap; margin-top: 6px !important; }
  .scan-report span.load-failed { color: var(--host-danger); }
  .bar { height: 3px; background: var(--host-line-soft); }
  .bar i { display: block; height: 100%; background: var(--host-accent); }
  .listen-progress, .listen-refused { margin-bottom: 6px; }
  .rail-item { display: flex; justify-content: space-between; gap: 8px; text-align: left; }
  .rail-pair { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .rail-pair .rail-item { flex: 1; min-width: 0; }
  button.rail-fold { padding: 3px 7px; font-size: 10.5px; }
  .refusal-causes { display: flex; flex-direction: column; gap: 2px; padding: 0 0 6px 10px; font-size: 11px; }
  .refusal-row { display: flex; align-items: baseline; gap: 6px; }
  .refusal-row .rn { color: var(--host-pending); min-width: 18px; text-align: right; font-variant-numeric: tabular-nums; }
  .refusal-row .rt { color: var(--host-text-soft); }
  .refusal-row .rf { color: var(--host-text-dim); font-style: italic; margin-left: auto; }
  .refusal-row .rf.worth { color: #7f9d6a; }
</style>
