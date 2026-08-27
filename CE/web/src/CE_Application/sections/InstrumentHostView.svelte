<script>
  /**
   * InstrumentHostView.svelte — the Instrument Host workspace (VIP-successor Stage 1).
   *
   * Left column: the rack — parts in order, click to focus, per-part mixer and the focused
   * part's MIDI zone. Right column: the instrument browser over the native catalogue, the
   * scan controls and the quarantine list. Everything here renders the latest
   * `instrumentHostState` push and sends commands; the native side stays authoritative
   * (a control that "didn't take" reverts on the next push instead of lying).
   *
   * The native plug-in editor pane is the NEXT increment — loading works from here already,
   * the vendor UI does not show yet.
   */
  import {
    hostState, hostScanLog, hostLastError, hostAudioDevices, initInstrumentHostBridge,
    filterInstruments, scanForInstruments, addScanPath, browseScanPath, removeScanPath, clearQuarantine,
    addRackPart, removeRackPart, focusRackPart, loadInstrument, unloadInstrument,
    setPartMixer, setPartMidiRules, hostPanic, openEditor, closeEditor,
    requestAudioDevices, setAudioDevice, setMidiInputEnabled,
    hostProject, hostBuild, requestHostProject, setHostProject, buildHostProduct,
    hostParameters, emptyHostParameters, filterParameters, requestParameters,
    setParameter, resetParameter, beginParameterGesture, endParameterGesture,
    addControlPage, removeControlPage, assignControlSlot, clearControlSlot, setControlSlotValue,
  } from '../stores/instrumentHost.js';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  initInstrumentHostBridge();

  let search = $state('');
  let newScanPath = $state('');
  let devicesOpen = $state(false);
  let projectOpen = $state(false);
  let paramSearch = $state('');
  let paramDiagnostics = $state(false);

  function toggleDevices() {
    devicesOpen = !devicesOpen;
    if (devicesOpen) requestAudioDevices();
  }

  function toggleProject() {
    projectOpen = !projectOpen;
    if (projectOpen) requestHostProject();
  }

  let instruments = $derived(filterInstruments($hostState.instruments, search));
  let visibleParameters = $derived(filterParameters($hostParameters.parameters, paramSearch));
  // Group headers derive from the registry order so a plug-in's own hierarchy shows once,
  // above its first parameter, rather than being re-sorted out of recognition.
  let groupedParameters = $derived(visibleParameters.map((p, i) => ({
    ...p,
    groupHeader: p.group && (i === 0 || visibleParameters[i - 1].group !== p.group) ? p.group : '',
  })));

  // The registry follows the focused part: ask when a loaded part takes focus, clear when
  // focus lands somewhere without an instrument. Load state matters too — the same part
  // gains a registry the moment its instrument commits.
  $effect(() => {
    const partId = focusedPart?.hasInstrument ? focusedPart.partId : '';
    if (partId) requestParameters(partId);
    else hostParameters.set(emptyHostParameters());
  });

  function stepFor(parameter) {
    return parameter.numSteps > 1 ? 1 / (parameter.numSteps - 1) : 0.001;
  }

  // Neutral control pages: one is selected for viewing and for the parameter view's assign
  // action. Selection follows the list — a removed page falls back to the first remaining.
  let selectedPageId = $state('');
  let pages = $derived($hostState.rack.pages);
  let selectedPage = $derived(pages.find((p) => p.pageId === selectedPageId) ?? pages[0] ?? null);
  let firstEmptySlot = $derived(selectedPage?.slots.find((s) => !s.assigned) ?? null);

  function assignToSelectedPage(parameter) {
    if (!selectedPage || !firstEmptySlot || !focusedPart) return;
    assignControlSlot(selectedPage.pageId, firstEmptySlot.slotId, focusedPart.partId, parameter.id);
  }
  let parts = $derived($hostState.rack.parts);
  let focusedPartId = $derived($hostState.rack.focusedPartId);
  let focusedPart = $derived(parts.find((p) => p.partId === focusedPartId) ?? null);
  let lastScanLine = $derived($hostScanLog.at(-1) ?? '');
  let audioLine = $derived(
    $hostState.audio.running
      ? `${$hostState.audio.deviceName} · ${Math.round($hostState.audio.sampleRate / 100) / 10} kHz · ${$hostState.audio.bufferSize}`
      : $hostState.audio.enabled
        ? 'No audio device'
        : 'Audio off (browser preview)'
  );

  function toggleEditor(part) {
    if ($hostState.editorOpenPartId === part.partId) closeEditor();
    else openEditor(part.partId);
  }

  function partTitle(part) {
    if (part.hasInstrument) return part.pluginName || 'Loaded instrument';
    if (part.unresolved) return `${part.pluginName || part.pluginCeId} (missing)`;
    return 'Empty part';
  }

  function submitScanPath() {
    const path = newScanPath.trim();
    if (!path) return;
    addScanPath(path);
    newScanPath = '';
  }
</script>

<div class="host-workspace" data-testid="instrument-host-workspace">
  <header class="host-header">
    <div class="host-title">
      <strong>Instrument Host</strong>
      <span class="host-subtitle">{audioLine}</span>
    </div>
    <div class="host-actions">
      {#if $hostState.scanning}
        <span class="scan-status" role="status">Scanning… {lastScanLine}</span>
      {:else if lastScanLine}
        <span class="scan-status">{lastScanLine}</span>
      {/if}
      <button type="button" onclick={() => scanForInstruments()} disabled={$hostState.scanning}
              data-testid="host-scan">
        {$hostState.scanning ? 'Scanning…' : 'Scan for instruments'}
      </button>
      <button type="button" class="toggle" class:on={devicesOpen} onclick={toggleDevices}
              data-testid="host-devices">Audio &amp; MIDI</button>
      <button type="button" class="toggle" class:on={projectOpen} onclick={toggleProject}
              data-testid="host-project">Project</button>
      <button type="button" class="panic" title="All notes off, every part" onclick={() => hostPanic()}>
        Panic
      </button>
    </div>
  </header>

  {#if devicesOpen}
    <div class="device-panel" aria-label="Audio and MIDI devices">
      <label class="device-output">Output
        <select value={$hostAudioDevices.current}
                onchange={(e) => setAudioDevice(e.currentTarget.value)}>
          {#if !$hostAudioDevices.outputs.includes($hostAudioDevices.current) && $hostAudioDevices.current}
            <option value={$hostAudioDevices.current}>{$hostAudioDevices.current}</option>
          {/if}
          {#each $hostAudioDevices.outputs as output (output)}
            <option value={output}>{output}</option>
          {/each}
        </select>
      </label>
      <div class="device-midi">
        <span class="device-midi-title">MIDI inputs</span>
        {#if $hostAudioDevices.midiInputs.length === 0}
          <span class="device-midi-empty">None found.</span>
        {/if}
        {#each $hostAudioDevices.midiInputs as input (input.id)}
          <span class="device-midi-row">
            <PropertyToggle compact value={input.enabled} ariaLabel={input.name}
                            onchange={(enabled) => setMidiInputEnabled(input.id, enabled)} />
            {input.name}
          </span>
        {/each}
      </div>
    </div>
  {/if}

  {#if projectOpen}
    <div class="project-panel" aria-label="Host Project">
      <div class="project-fields">
        <label class="project-field">Product name
          <input type="text" value={$hostProject.productName}
                 onchange={(e) => setHostProject({ productName: e.currentTarget.value })} />
        </label>
        <label class="project-field">Version
          <input type="text" value={$hostProject.version}
                 onchange={(e) => setHostProject({ version: e.currentTarget.value })} />
        </label>
        <label class="project-field">Publisher
          <input type="text" value={$hostProject.publisher}
                 onchange={(e) => setHostProject({ publisher: e.currentTarget.value })} />
        </label>
        <span class="project-target">
          <PropertyToggle compact label="Standalone" value={$hostProject.includeStandalone}
                          onchange={(v) => setHostProject({ includeStandalone: v })} />
          <PropertyToggle compact label="VST3" value={$hostProject.includeVst3}
                          onchange={(v) => setHostProject({ includeVst3: v })} />
        </span>
        <button type="button" class="project-build" data-testid="host-build"
                disabled={$hostBuild.running} onclick={() => buildHostProduct()}>
          {$hostBuild.running ? 'Building…' : 'Build product'}
        </button>
      </div>
      <!-- Identity is minted, not authored — shown so support can match an installer to a
           project, never editable (a changed AppId splits upgrades into a second install). -->
      <span class="project-appid">Installer identity: {$hostProject.appId || '(minted on first save)'}</span>
      {#if $hostBuild.lines.length > 0}
        <pre class="project-build-log" class:failed={$hostBuild.done && !$hostBuild.ok}>{$hostBuild.lines.join('\n')}</pre>
      {/if}
    </div>
  {/if}

  {#if $hostLastError}
    <div class="host-error" role="alert">
      {$hostLastError}
      <button type="button" onclick={() => hostLastError.set('')}>×</button>
    </div>
  {/if}

  <div class="host-columns">
    <section class="rack-column" aria-label="Instrument rack">
      <div class="column-head">
        <strong>Rack</strong>
        <button type="button" onclick={() => addRackPart()} data-testid="host-add-part">+ Add part</button>
      </div>

      {#if parts.length === 0}
        <div class="empty-hint">No parts yet. Add one, then load an instrument from the right.</div>
      {/if}

      {#each parts as part (part.partId)}
        <div class="part" class:focused={part.partId === focusedPartId} class:disabled={!part.enabled}>
          <button type="button" class="part-main" onclick={() => focusRackPart(part.partId)}>
            <span class="part-name">{partTitle(part)}</span>
            <span class="part-vendor">{part.pluginVendor}</span>
          </button>
          <div class="part-controls">
            <button type="button" class="toggle" class:on={part.enabled} title="Part enabled (off panics its notes)"
                    onclick={() => setPartMixer(part.partId, { enabled: !part.enabled })}>On</button>
            <button type="button" class="toggle" class:on={part.mute} title="Mute (audio only; notes keep running)"
                    onclick={() => setPartMixer(part.partId, { mute: !part.mute })}>M</button>
            <button type="button" class="toggle" class:on={part.solo} title="Solo"
                    onclick={() => setPartMixer(part.partId, { solo: !part.solo })}>S</button>
            <label class="mini" title="Volume">
              <input type="range" min="0" max="2" step="0.01" value={part.volume}
                     oninput={(e) => setPartMixer(part.partId, { volume: Number(e.currentTarget.value) })} />
            </label>
            <label class="mini" title="Pan">
              <input type="range" min="-1" max="1" step="0.01" value={part.pan}
                     oninput={(e) => setPartMixer(part.partId, { pan: Number(e.currentTarget.value) })} />
            </label>
            {#if part.hasInstrument}
              <button type="button" class="toggle" class:on={$hostState.editorOpenPartId === part.partId}
                      title="Show the plug-in's own interface in the native pane"
                      onclick={() => toggleEditor(part)}>Editor</button>
              <button type="button" class="ghost" title="Unload the instrument, keep the part"
                      onclick={() => unloadInstrument(part.partId)}>Unload</button>
            {/if}
            <button type="button" class="ghost danger" title="Remove this part"
                    onclick={() => removeRackPart(part.partId)}>×</button>
          </div>
        </div>
      {/each}

      {#if focusedPart}
        <div class="midi-zone">
          <strong>MIDI zone — {partTitle(focusedPart)}</strong>
          <div class="zone-grid">
            <label>Channel
              <select value={focusedPart.channel}
                      onchange={(e) => setPartMidiRules(focusedPart.partId, { channel: Number(e.currentTarget.value) })}>
                <option value={0}>Omni</option>
                {#each Array.from({ length: 16 }, (_, i) => i + 1) as ch}
                  <option value={ch}>{ch}</option>
                {/each}
              </select>
            </label>
            <label>Key low
              <input type="number" min="0" max="127" value={focusedPart.keyLow}
                     onchange={(e) => setPartMidiRules(focusedPart.partId, { keyLow: Number(e.currentTarget.value) })} />
            </label>
            <label>Key high
              <input type="number" min="0" max="127" value={focusedPart.keyHigh}
                     onchange={(e) => setPartMidiRules(focusedPart.partId, { keyHigh: Number(e.currentTarget.value) })} />
            </label>
            <label>Vel low
              <input type="number" min="1" max="127" value={focusedPart.velocityLow}
                     onchange={(e) => setPartMidiRules(focusedPart.partId, { velocityLow: Number(e.currentTarget.value) })} />
            </label>
            <label>Vel high
              <input type="number" min="1" max="127" value={focusedPart.velocityHigh}
                     onchange={(e) => setPartMidiRules(focusedPart.partId, { velocityHigh: Number(e.currentTarget.value) })} />
            </label>
            <label>Transpose
              <input type="number" min="-60" max="60" value={focusedPart.transpose}
                     onchange={(e) => setPartMidiRules(focusedPart.partId, { transpose: Number(e.currentTarget.value) })} />
            </label>
          </div>
        </div>
      {/if}

      <!-- The Stage 2 generic parameter view: the common, inspectable control surface the
           vendor editor is not — and the same registry hardware pages and macros will use. -->
      {#if focusedPart?.hasInstrument && $hostParameters.partId === focusedPart.partId}
        <div class="param-view" data-testid="host-parameters">
          <div class="param-head">
            <strong>Parameters — {partTitle(focusedPart)}</strong>
            <input type="search" placeholder="Search parameters…" bind:value={paramSearch} />
            <button type="button" class="toggle" class:on={paramDiagnostics}
                    title="Show native IDs and indices"
                    onclick={() => (paramDiagnostics = !paramDiagnostics)}>ID</button>
          </div>
          {#each $hostParameters.warnings as warning (warning)}
            <div class="param-warning">{warning}</div>
          {/each}
          {#if groupedParameters.length === 0}
            <div class="empty-hint">
              {$hostParameters.parameters.length === 0
                ? 'This instrument exposes no host-visible parameters.'
                : 'Nothing matches the search.'}
            </div>
          {/if}
          <div class="param-list">
            {#each groupedParameters as parameter (parameter.id)}
              {#if parameter.groupHeader}
                <div class="param-group">{parameter.groupHeader}</div>
              {/if}
              <div class="param-row">
                <span class="param-name" title={parameter.name}>{parameter.name}</span>
                {#if parameter.boolean}
                  <PropertyToggle compact value={parameter.value >= 0.5} ariaLabel={parameter.name}
                                  onchange={(on) => setParameter(focusedPart.partId, parameter.id, on ? 1 : 0)} />
                {:else}
                  <input type="range" min="0" max="1" step={stepFor(parameter)} value={parameter.value}
                         aria-label={parameter.name}
                         onpointerdown={() => beginParameterGesture(focusedPart.partId, parameter.id)}
                         onpointerup={() => endParameterGesture(focusedPart.partId, parameter.id)}
                         oninput={(e) => setParameter(focusedPart.partId, parameter.id, Number(e.currentTarget.value))} />
                {/if}
                <span class="param-value">{parameter.text}{parameter.label ? ` ${parameter.label}` : ''}</span>
                <button type="button" class="ghost" title="Reset to the plug-in's default"
                        onclick={() => resetParameter(focusedPart.partId, parameter.id)}>↺</button>
                <button type="button" class="ghost" disabled={!selectedPage || !firstEmptySlot}
                        title={selectedPage
                                 ? (firstEmptySlot ? `Assign to ${selectedPage.name}, slot ${firstEmptySlot.slotId}`
                                                   : 'The selected page has no empty slot')
                                 : 'Create a control page first'}
                        onclick={() => assignToSelectedPage(parameter)}>→</button>
              </div>
              {#if paramDiagnostics}
                <div class="param-diag">{parameter.id} · index {parameter.index}{parameter.automatable ? '' : ' · not automatable'}{parameter.meta ? ' · meta' : ''}</div>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <section class="browser-column" aria-label="Instrument browser">
      <div class="column-head">
        <strong>Instruments</strong>
        <input type="search" placeholder="Search name or vendor…" bind:value={search}
               data-testid="host-search" />
      </div>

      {#if instruments.length === 0}
        <div class="empty-hint">
          {$hostState.instruments.length === 0
            ? 'Nothing in the catalogue yet — run a scan.'
            : 'Nothing matches the search.'}
        </div>
      {/if}

      <div class="instrument-list">
        {#each instruments as instrument (instrument.ceId)}
          <div class="instrument">
            <div class="instrument-id">
              <span class="instrument-name">{instrument.name}</span>
              <span class="instrument-vendor">{instrument.vendor} {instrument.version}</span>
            </div>
            <button type="button" disabled={!focusedPart}
                    title={focusedPart ? `Load into ${partTitle(focusedPart)}` : 'Add and focus a rack part first'}
                    onclick={() => focusedPart && loadInstrument(focusedPart.partId, instrument.ceId)}>
              Load
            </button>
          </div>
        {/each}
      </div>

      <div class="scan-paths">
        <strong>Extra scan folders</strong>
        <div class="scan-path-add">
          <button type="button" onclick={() => browseScanPath()} data-testid="host-browse">Browse…</button>
          <input type="text" placeholder="or type a path: D:\\More VST3s" bind:value={newScanPath}
                 onkeydown={(e) => e.key === 'Enter' && submitScanPath()} />
          <button type="button" onclick={submitScanPath}>Add</button>
        </div>
        {#each $hostState.scanPaths as path (path)}
          <div class="scan-path">
            <span>{path}</span>
            <button type="button" class="ghost danger" onclick={() => removeScanPath(path)}>×</button>
          </div>
        {/each}
      </div>

      <!-- Neutral control pages (Stage 2): named slots over parameter addresses, authored
           before any hardware exists. The sliders drive the same range/inversion mapping a
           physical control will; an unresolved slot warns instead of moving anything. -->
      <div class="pages" data-testid="host-pages">
        <div class="pages-head">
          <strong>Control pages</strong>
          <button type="button" onclick={() => addControlPage()} data-testid="host-add-page">+ Page</button>
        </div>
        {#if pages.length > 0}
          <div class="page-tabs">
            {#each pages as page (page.pageId)}
              <span class="page-tab" class:on={selectedPage?.pageId === page.pageId}>
                <button type="button" class="page-name" onclick={() => (selectedPageId = page.pageId)}>
                  {page.name}
                </button>
                <button type="button" class="ghost danger" title="Remove this page"
                        onclick={() => removeControlPage(page.pageId)}>×</button>
              </span>
            {/each}
          </div>
          {#if selectedPage}
            <div class="slot-list">
              {#each selectedPage.slots as slot (slot.slotId)}
                <div class="slot-row" class:unresolved={slot.assigned && !slot.resolved}>
                  <span class="slot-id">{slot.slotId}</span>
                  {#if slot.assigned}
                    <span class="slot-name" title={`${slot.parameterId} · ${slot.partId}`}>
                      {slot.displayName}<span class="slot-part"> — {slot.partName || 'missing part'}</span>
                    </span>
                    {#if slot.resolved}
                      <input type="range" min="0" max="1" step="0.001" aria-label={slot.displayName}
                             oninput={(e) => setControlSlotValue(selectedPage.pageId, slot.slotId, Number(e.currentTarget.value))} />
                    {:else}
                      <span class="slot-warning">unresolved — the part no longer carries this plug-in</span>
                    {/if}
                    <button type="button" class="ghost danger" title="Clear this slot"
                            onclick={() => clearControlSlot(selectedPage.pageId, slot.slotId)}>×</button>
                  {:else}
                    <span class="slot-empty">empty — assign from the parameter list (→)</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="empty-hint">No pages yet — a page holds eight control slots for hardware and macros.</div>
        {/if}
      </div>

      <!-- Every module the scan touched, whatever came of it. The browser above lists
           instruments only, so without this a folder full of effects reads as "the scan
           found things and shows nothing" — undiagnosable from the UI. -->
      {#if $hostState.modules.length > 0}
        <div class="modules" data-testid="host-modules">
          <strong>Scanned modules</strong>
          {#each $hostState.modules as module (module.path)}
            <div class="module-row" class:trouble={module.quarantined || module.failureCount > 0 || module.missing}
                 title={module.path}>
              <div class="module-id">
                <span class="module-name">{module.path.split('\\').pop().split('/').pop()}</span>
                <span class="module-detail">
                  {#if module.quarantined}
                    quarantined — {module.lastFailureReason || 'failed to scan'}
                  {:else if module.missing}
                    missing — the file is gone from where it was scanned
                  {:else if module.failureCount > 0}
                    scan failed — {module.lastFailureReason || 'no reason reported'}
                  {:else if module.numInstruments === 0}
                    {module.numClasses} {module.numClasses === 1 ? 'class' : 'classes'}, no instruments — effects are not shown in the browser
                  {:else}
                    {module.numInstruments} of {module.numClasses} {module.numClasses === 1 ? 'class is an instrument' : 'classes are instruments'}
                  {/if}
                </span>
              </div>
              {#if module.quarantined}
                <button type="button" onclick={() => clearQuarantine(module.path)}>Retry</button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .host-workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #1e1e1e;
    color: #d6dbe0;
    font-size: 13px;
  }

  .host-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid #3b4652;
    background: #171a1d;
  }

  .host-title { display: flex; flex-direction: column; gap: 2px; }
  .host-subtitle { color: #7d8894; font-size: 11px; }
  .host-actions { display: flex; align-items: center; gap: 8px; }
  .scan-status { color: #7d8894; font-size: 11px; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .device-panel {
    display: flex;
    align-items: flex-start;
    gap: 24px;
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #171a1d;
    flex-wrap: wrap;
  }
  .device-output { display: flex; flex-direction: column; gap: 4px; color: #9aa5b1; font-size: 11px; min-width: 260px; }
  .device-midi { display: flex; flex-direction: column; gap: 4px; }
  .device-midi-title { color: #9aa5b1; font-size: 11px; }
  .device-midi-empty { color: #7d8894; font-size: 12px; }
  .device-midi-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #d6dbe0; }

  .project-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #171a1d;
  }
  .project-fields { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .project-field { display: flex; flex-direction: column; gap: 4px; color: #9aa5b1; font-size: 11px; }
  .project-field input { width: 180px; }
  .project-target { display: flex; align-items: center; gap: 6px; padding-bottom: 2px; }
  .project-appid { color: #7d8894; font-size: 11px; }
  .project-build-log {
    margin: 0;
    padding: 8px;
    max-height: 160px;
    overflow: auto;
    background: #101315;
    border: 1px solid #2a333d;
    border-radius: 4px;
    color: #9fb2a9;
    font-size: 11px;
    white-space: pre-wrap;
  }
  .project-build-log.failed { color: #e4b3b3; border-color: #7a4a4a; }

  .host-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 8px 14px 0;
    padding: 6px 10px;
    border: 1px solid #7a4a4a;
    border-radius: 4px;
    background: #2a1d1d;
    color: #e4b3b3;
  }

  .host-columns {
    flex: 1;
    display: flex;
    gap: 12px;
    min-height: 0;
    padding: 12px 14px;
  }

  .rack-column, .browser-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #171a1d;
    padding: 10px;
  }

  .column-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .column-head input[type="search"] {
    flex: 1;
    max-width: 260px;
  }

  .empty-hint { color: #7d8894; padding: 12px 4px; }

  .part {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid #2c343d;
    border-radius: 5px;
    padding: 8px;
    background: #1c2126;
  }
  .part.focused { border-color: #5b9bd5; }
  .part.disabled { opacity: 0.55; }

  .part-main {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    background: none;
    border: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0;
    font: inherit;
  }
  .part-name { font-weight: 600; }
  .part-vendor { color: #7d8894; }

  .part-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .mini input[type="range"] { width: 70px; }

  .midi-zone {
    border: 1px solid #2c343d;
    border-radius: 5px;
    padding: 8px;
    background: #1c2126;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .zone-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .zone-grid label { display: flex; flex-direction: column; gap: 3px; color: #9aa5b1; font-size: 11px; }
  .zone-grid input, .zone-grid select { width: 100%; }

  .instrument-list { display: flex; flex-direction: column; gap: 4px; }
  .instrument {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid #2c343d;
    border-radius: 5px;
    padding: 6px 8px;
    background: #1c2126;
  }
  .instrument-id { display: flex; flex-direction: column; min-width: 0; }
  .instrument-name { font-weight: 600; }
  .instrument-vendor { color: #7d8894; font-size: 11px; }

  .scan-paths, .modules {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid #2c343d;
    padding-top: 8px;
  }
  .scan-path-add { display: flex; gap: 6px; }
  .scan-path-add input { flex: 1; }
  .scan-path {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #9aa5b1;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .module-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
  }
  .module-id { display: flex; flex-direction: column; min-width: 0; }
  .module-name { color: #d6dbe0; overflow-wrap: anywhere; }
  .module-detail { color: #7d8894; font-size: 11px; }
  .module-row.trouble .module-detail { color: #d6a3a3; }

  .param-view {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid #2c343d;
    padding-top: 8px;
    min-height: 0;
  }
  .param-head { display: flex; align-items: center; gap: 8px; }
  .param-head input { flex: 1; min-width: 0; }
  .param-warning {
    padding: 4px 8px;
    border: 1px solid #7a6a3a;
    border-radius: 4px;
    background: #2a2618;
    color: #e0cf9a;
    font-size: 11px;
  }
  .param-list { overflow-y: auto; max-height: 260px; display: flex; flex-direction: column; gap: 4px; }
  .param-group { color: #7d8894; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 4px; }
  .param-row { display: flex; align-items: center; gap: 8px; }
  .param-name { flex: 0 0 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .param-row input[type='range'] { flex: 1; min-width: 60px; }
  .param-value { flex: 0 0 84px; text-align: right; color: #9aa5b1; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .param-diag { color: #66707b; font-size: 10px; margin: -2px 0 0 138px; }

  .pages {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid #2c343d;
    padding-top: 8px;
  }
  .pages-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .page-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
  .page-tab { display: inline-flex; align-items: center; gap: 2px; border: 1px solid #3b4652; border-radius: 4px; padding: 0 2px; }
  .page-tab.on { border-color: #5b9bd5; background: #24313d; }
  .page-name { background: none; border: none; padding: 3px 6px; }
  .slot-list { display: flex; flex-direction: column; gap: 4px; }
  .slot-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .slot-id { flex: 0 0 20px; color: #7d8894; font-size: 11px; }
  .slot-name { flex: 0 0 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .slot-part { color: #7d8894; font-size: 11px; }
  .slot-row input[type='range'] { flex: 1; min-width: 60px; }
  .slot-empty { color: #66707b; font-size: 11px; }
  .slot-warning { flex: 1; color: #d6a3a3; font-size: 11px; }
  .slot-row.unresolved .slot-name { color: #d6a3a3; }

  button {
    background: #232a31;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 4px 10px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  button:hover:not(:disabled) { border-color: #5b9bd5; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.toggle { padding: 3px 7px; color: #7d8894; }
  button.toggle.on { color: #d6dbe0; border-color: #5b9bd5; background: #24313d; }
  button.ghost { background: none; border-color: transparent; color: #7d8894; }
  button.ghost:hover { color: #d6dbe0; border-color: #3b4652; }
  button.ghost.danger:hover { color: #e4b3b3; border-color: #7a4a4a; }
  button.panic { border-color: #7a4a4a; color: #e4b3b3; }

  input, select {
    background: #14171a;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 3px 6px;
    font: inherit;
    font-size: 12px;
  }
</style>
