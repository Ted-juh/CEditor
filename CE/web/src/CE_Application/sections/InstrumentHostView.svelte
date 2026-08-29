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
    hostState,
    hostMidiActivity, hostScanLog, hostLastError, hostAudioDevices, initInstrumentHostBridge,
    filterInstruments, scanForInstruments, addScanPath, browseScanPath, removeScanPath, clearQuarantine,
    addRackPart, removeRackPart, focusRackPart, loadInstrument, unloadInstrument,
    setPartMixer, setPartMidiRules, hostPanic, openEditor, closeEditor,
    requestAudioDevices, setAudioDevice, setMidiInputEnabled,
    hostProject, hostBuild, requestHostProject, setHostProject, buildHostProduct,
    hostParameters, emptyHostParameters, filterParameters, requestParameters,
    setParameter, resetParameter, beginParameterGesture, endParameterGesture,
    addControlPage, removeControlPage, assignControlSlot, clearControlSlot, setControlSlotValue,
    generateControlPages,
    hostLibrary, requestLibrary, scanLibrary, browseLibraryPath, removeLibraryPath,
    saveUserPreset, saveRackToLibrary, setLibraryUserMetadata, removeLibraryRecord, loadLibraryRecord,
    addEffect, removeEffect, setEffectBypassed, openEffectEditor,
    addMacro, removeMacro, setMacroValue, addMacroTarget, removeMacroTarget,
    addReturn, removeReturn, setReturnLevel, setSendLevel,
    setExtraOut, removeExtraOut, setHardwareConfig, clearHardware, sendHardwareProgram,
    transportPlay, transportStop, setTempo, setTimeSignature, setExternalClock,
    setPartArp, setPartMidiFx,
  } from '../stores/instrumentHost.js';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PerformancePanel from './PerformancePanel.svelte';
  import ProductPanel from './ProductPanel.svelte';
  import ReliabilityPanel from './ReliabilityPanel.svelte';
  import LicencePanel from './LicencePanel.svelte';
  import HostKeyboard from './HostKeyboard.svelte';

  initInstrumentHostBridge();

  let search = $state('');
  let newScanPath = $state('');
  let devicesOpen = $state(false);
  let projectOpen = $state(false);
  let paramSearch = $state('');
  let paramDiagnostics = $state(false);
  let libraryOpen = $state(false);
  let libraryQuery = $state('');
  let libraryType = $state('');
  let performanceOpen = $state(false);
  let productOpen = $state(false);
  let reliabilityOpen = $state(false);
  let licenceOpen = $state(false);

  function toggleLibrary() {
    libraryOpen = !libraryOpen;
    if (libraryOpen) requestLibrary(libraryQuery, libraryType);
  }

  function setLibraryFilter(query, type) {
    libraryQuery = query;
    libraryType = type;
    requestLibrary(query, type);
  }

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

  // The parameter view's target: the focused part by default, or an effect the user asked
  // to inspect (its "P" button). Only a focus CHANGE or the target vanishing resets it —
  // every state push re-derives the part objects, and resetting on mere identity churn
  // would knock an effect inspection back to the part on any unrelated mutation. Since
  // Stage 5 every part answers — an empty or hardware part still has its mixer addresses.
  let paramTargetId = $state('');
  let lastFocusedPartId = $state('');
  let allEffects = $derived([
    ...$hostState.rack.masterEffects,
    ...$hostState.rack.parts.flatMap((p) => p.effects),
    ...$hostState.rack.returns.flatMap((r) => r.effects),
  ]);
  $effect(() => {
    const focusedTarget = focusedPart ? focusedPart.partId : '';
    const targetStillExists = paramTargetId
      && (paramTargetId === focusedTarget
          || allEffects.some((e) => e.effectId === paramTargetId && e.hasProcessor));
    if (focusedPartId !== lastFocusedPartId || !targetStillExists) {
      lastFocusedPartId = focusedPartId;
      paramTargetId = focusedTarget;
    }
  });
  // The hardware config needs the MIDI-output list; enumeration stays on demand.
  $effect(() => {
    if (focusedPart?.hardware) requestAudioDevices();
  });
  // Re-request on target change AND when the returns roster changes — each return adds a
  // send address to every part's registry, and a stale list would hide it until a refocus.
  let returnsStamp = $derived($hostState.rack.returns.map((r) => r.returnId).join(','));
  $effect(() => {
    returnsStamp;
    if (paramTargetId) requestParameters(paramTargetId);
    else hostParameters.set(emptyHostParameters());
  });
  let paramTargetName = $derived.by(() => {
    if (!paramTargetId) return '';
    if (focusedPart?.partId === paramTargetId) return partTitle(focusedPart);
    return allEffects.find((e) => e.effectId === paramTargetId)?.pluginName ?? '';
  });

  let selectedMacroId = $state('');
  let selectedMacro = $derived(
    $hostState.rack.macros.find((m) => m.macroId === selectedMacroId) ?? $hostState.rack.macros[0] ?? null);

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
    if (!selectedPage || !firstEmptySlot || !paramTargetId) return;
    assignControlSlot(selectedPage.pageId, firstEmptySlot.slotId, paramTargetId, parameter.id);
  }
  let parts = $derived($hostState.rack.parts);
  let transport = $derived($hostState.performance.transport);
  let scales = $derived($hostState.performance.scales);
  let focusedPartId = $derived($hostState.rack.focusedPartId);
  let focusedPart = $derived(parts.find((p) => p.partId === focusedPartId) ?? null);
  let lastScanLine = $derived($hostScanLog.at(-1) ?? '');
  let audioLine = $derived(
    $hostState.audio.running
      ? `${$hostState.audio.deviceName} · ${Math.round($hostState.audio.sampleRate / 100) / 10} kHz · ${$hostState.audio.bufferSize}`
        + ` · CPU ${Math.round($hostState.audio.cpu * 100)}%`
        + ($hostState.audio.xruns > 0 ? ` · ${$hostState.audio.xruns} xruns` : '')
      : $hostState.audio.enabled
        ? 'No audio device'
        : 'Audio off (browser preview)'
  );

  const latencySuffix = (ms) => (ms >= 0.05 ? ` · ${ms.toFixed(1)} ms` : '');

  function toggleEditor(part) {
    if ($hostState.editorOpenPartId === part.partId) closeEditor();
    else openEditor(part.partId);
  }

  function partTitle(part) {
    if (part.hardware) return `${part.midiOutputName || 'External hardware'} (HW)`;
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
      <!-- The transport is always visible: it is the one clock everything else follows,
           and a player needs to see whether it is running without opening a panel. -->
      <span class="transport" data-testid="host-transport">
        <button type="button" class="toggle" class:on={transport.playing}
                title={transport.playing ? 'Stop' : 'Play'}
                onclick={() => (transport.playing ? transportStop() : transportPlay())}
                data-testid="host-transport-play">{transport.playing ? '■' : '▶'}</button>
        <input type="number" class="tempo" min="20" max="300" step="0.1" value={transport.tempo}
               aria-label="Tempo" title="Tempo"
               onchange={(e) => setTempo(Number(e.currentTarget.value))} />
        <span class="transport-position" title="Bar and beat">{transport.bar}.{transport.beat}</span>
        <input type="number" class="ts" min="1" max="32" value={transport.numerator}
               aria-label="Time signature numerator"
               onchange={(e) => setTimeSignature(Number(e.currentTarget.value), transport.denominator)} />
        <span class="ts-slash">/</span>
        <select class="ts" value={transport.denominator} aria-label="Time signature denominator"
                onchange={(e) => setTimeSignature(transport.numerator, Number(e.currentTarget.value))}>
          {#each [2, 4, 8, 16] as d (d)}<option value={d}>{d}</option>{/each}
        </select>
        <button type="button" class="toggle" class:on={transport.externalClock}
                class:warn={transport.clockLost}
                title={transport.clockLost
                         ? 'External clock selected, but nothing is sending one'
                         : 'Follow an external MIDI clock'}
                onclick={() => setExternalClock(!transport.externalClock)}>EXT</button>
      </span>
      <button type="button" class="toggle" class:on={performanceOpen}
              onclick={() => (performanceOpen = !performanceOpen)}
              data-testid="host-performance">Performance</button>
      <button type="button" class="toggle" class:on={productOpen}
              onclick={() => (productOpen = !productOpen)}
              data-testid="host-product">Product</button>
      <button type="button" class="toggle" class:on={reliabilityOpen}
              class:warn={$hostState.reliability.recovery.interrupted
                          || $hostState.reliability.safeMode.level !== 'normal'}
              title={$hostState.reliability.recovery.interrupted
                       ? 'The last run stopped without finishing'
                       : $hostState.reliability.safeMode.level !== 'normal'
                         ? 'Safe startup is on'
                         : 'Safe startup, recovery and the support bundle'}
              onclick={() => (reliabilityOpen = !reliabilityOpen)}
              data-testid="host-reliability">Health</button>
      <button type="button" class="toggle" class:on={licenceOpen}
              title="What this edition includes, and what it never takes away"
              onclick={() => (licenceOpen = !licenceOpen)}
              data-testid="host-licence">{$hostState.licence.editionLabel}</button>
      <button type="button" class="toggle" class:on={libraryOpen} onclick={toggleLibrary}
              data-testid="host-library">Library</button>
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
        <span class="device-midi-title">MIDI inputs
          <!-- The "is it even plugged in" answer: the latest message from any enabled input,
               flashing on arrival. Keyed on seq so two identical notes still both flash. -->
          {#if $hostMidiActivity.seq > 0}
            {#key $hostMidiActivity.seq}
              <span class="midi-activity" data-testid="host-midi-activity">
                <span class="midi-dot"></span>
                {$hostMidiActivity.text}{$hostMidiActivity.device ? ` · ${$hostMidiActivity.device}` : ''}
              </span>
            {/key}
          {:else}
            <span class="midi-activity quiet">play a key to test — the last message shows here</span>
          {/if}
        </span>
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

  {#if performanceOpen}
    <PerformancePanel />
  {/if}

  {#if productOpen}
    <ProductPanel />
  {/if}

  {#if reliabilityOpen}
    <ReliabilityPanel />
  {/if}

  {#if licenceOpen}
    <LicencePanel />
  {/if}

  <HostKeyboard />

  {#if libraryOpen}
    <div class="library-panel" data-testid="host-library-panel" aria-label="Library">
      <div class="library-head">
        <input type="search" placeholder="Search sounds and racks…" value={libraryQuery}
               oninput={(e) => setLibraryFilter(e.currentTarget.value, libraryType)} />
        <span class="library-filters">
          {#each [['', 'All'], ['preset', 'Presets'], ['rack', 'Racks']] as [value, label] (value)}
            <button type="button" class="toggle" class:on={libraryType === value}
                    onclick={() => setLibraryFilter(libraryQuery, value)}>{label}</button>
          {/each}
        </span>
        <button type="button" onclick={() => scanLibrary()} data-testid="host-scan-library">Scan presets</button>
        <button type="button" onclick={() => browseLibraryPath()}>Add folder…</button>
        <span class="library-counts">{$hostLibrary.counts.presets} presets · {$hostLibrary.counts.racks} racks</span>
      </div>

      <div class="library-capture">
        <button type="button" disabled={!focusedPart?.hasInstrument}
                title={focusedPart?.hasInstrument ? `Capture ${partTitle(focusedPart)}'s current state`
                                                  : 'Focus a part with an instrument first'}
                onclick={() => saveUserPreset(focusedPart.partId)}
                data-testid="host-save-preset">Save preset of focused part</button>
        <button type="button" onclick={() => saveRackToLibrary()} data-testid="host-save-rack">
          Save rack to library
        </button>
      </div>

      {#if $hostLibrary.paths.length > 0}
        <div class="library-paths">
          {#each $hostLibrary.paths as path (path)}
            <span class="scan-path"><span>{path}</span>
              <button type="button" class="ghost danger" onclick={() => removeLibraryPath(path)}>×</button></span>
          {/each}
        </div>
      {/if}

      {#if $hostLibrary.records.length === 0}
        <div class="empty-hint">
          {$hostLibrary.counts.total === 0
            ? 'Nothing in the library yet — scan presets, or capture the focused part.'
            : 'Nothing matches the search.'}
        </div>
      {/if}

      <div class="library-list">
        {#each $hostLibrary.records as record (record.recordId)}
          <div class="library-row" class:unavailable={!record.available}>
            <button type="button" class="ghost star" class:on={record.favourite}
                    title={record.favourite ? 'Unfavourite' : 'Favourite'}
                    onclick={() => setLibraryUserMetadata(record.recordId, { favourite: !record.favourite })}>
              {record.favourite ? '★' : '☆'}
            </button>
            <div class="library-id">
              <span class="library-name">{record.name}</span>
              <span class="library-detail">
                {record.type === 'rack' ? 'Rack'
                  : [record.instrument, record.manufacturer].filter(Boolean).join(' · ') || 'Preset'}
                {#if record.sourceType === 'userState' || record.sourceType === 'rackCapture'} · yours{/if}
                {#if record.tags.length > 0} · {record.tags.join(', ')}{/if}
              </span>
              {#if !record.available}
                <span class="library-reason">{record.reason}</span>
              {/if}
            </div>
            {#if record.type === 'rack'}
              <button type="button" disabled={!record.available}
                      onclick={() => loadLibraryRecord(record.recordId)}>Restore</button>
            {:else}
              <button type="button" disabled={!record.available || !focusedPart}
                      title={focusedPart ? `Load into ${partTitle(focusedPart)}` : 'Focus a rack part first'}
                      onclick={() => loadLibraryRecord(record.recordId, 'focused')}>Load</button>
              <button type="button" disabled={!record.available} title="Add as a new part"
                      onclick={() => loadLibraryRecord(record.recordId, 'add')}>+ Part</button>
            {/if}
            {#if !record.factory}
              <button type="button" class="ghost danger" title="Remove this record"
                      onclick={() => removeLibraryRecord(record.recordId)}>×</button>
            {/if}
          </div>
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

      {#snippet effectChain(chain, chainId, title, testId)}
        <div class="fx-chain" data-testid={testId ?? (chainId === 'master' ? 'host-master-fx' : 'host-part-fx')}>
          <div class="fx-head">
            <strong>{title}</strong>
            <select value="" aria-label={`Add an effect to ${title}`}
                    onchange={(e) => { if (e.currentTarget.value) addEffect(chainId, e.currentTarget.value); e.currentTarget.value = ''; }}>
              <option value="" disabled>+ Add effect…</option>
              {#each $hostState.effectClasses as effectClass (effectClass.ceId)}
                <option value={effectClass.ceId}>{effectClass.name} — {effectClass.vendor}</option>
              {/each}
            </select>
          </div>
          {#each chain as effect (effect.effectId)}
            <div class="fx-row" class:bypassed={effect.bypassed} class:unresolved={effect.unresolved}>
              <span class="fx-name" title={effect.pluginVendor}>
                {effect.pluginName || 'Loading…'}{#if effect.unresolved} (missing){/if}
              </span>
              <PropertyToggle compact label="Byp" value={effect.bypassed} ariaLabel={`Bypass ${effect.pluginName}`}
                              onchange={(on) => setEffectBypassed(effect.effectId, on)} />
              <button type="button" class="toggle" disabled={!effect.hasProcessor}
                      class:on={$hostState.editorOpenPartId === effect.effectId}
                      title="Show the effect's own interface"
                      onclick={() => openEffectEditor(effect.effectId)}>Editor</button>
              <button type="button" class="toggle" disabled={!effect.hasProcessor}
                      class:on={paramTargetId === effect.effectId}
                      title="Inspect this effect's parameters"
                      onclick={() => (paramTargetId = effect.effectId)}>P</button>
              <button type="button" class="ghost danger" title="Remove this effect"
                      onclick={() => removeEffect(effect.effectId)}>×</button>
            </div>
          {/each}
        </div>
      {/snippet}

      {#if focusedPart}
        <!-- The part's Stage 6 event chain: what shapes what arrives, and what replays it.
             Both are modes over the shared transport, which is why they live beside the zone
             rules rather than in a panel of their own. -->
        <div class="event-chain" data-testid="host-event-chain">
          <strong>Event chain — {partTitle(focusedPart)}</strong>
          <div class="zone-grid">
            <label>Transpose
              <input type="number" min="-48" max="48" value={focusedPart.midiFx.transpose}
                     onchange={(e) => setPartMidiFx(focusedPart.partId, { transpose: Number(e.currentTarget.value) })} />
            </label>
            <label>Scale
              <select value={focusedPart.midiFx.constrainToScale ? focusedPart.midiFx.scaleType : ''}
                      onchange={(e) => setPartMidiFx(focusedPart.partId, e.currentTarget.value
                                                       ? { constrainToScale: true, scaleType: e.currentTarget.value }
                                                       : { constrainToScale: false })}>
                <option value="">off</option>
                {#each scales as scale (scale)}
                  <option value={scale}>{scale}</option>
                {/each}
              </select>
            </label>
            <label>Root
              <select value={focusedPart.midiFx.scaleRoot}
                      onchange={(e) => setPartMidiFx(focusedPart.partId, { scaleRoot: Number(e.currentTarget.value) })}>
                {#each ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as name, i (name)}
                  <option value={i}>{name}</option>
                {/each}
              </select>
            </label>
            <label>Chord
              <select value={focusedPart.midiFx.chord}
                      onchange={(e) => setPartMidiFx(focusedPart.partId, { chord: e.currentTarget.value })}>
                {#each ['off', 'power fifth', 'triad', 'triad (1st inv)', 'seventh', 'octave'] as type (type)}
                  <option value={type}>{type}</option>
                {/each}
              </select>
            </label>
            <label>Vel scale
              <input type="number" min="0.1" max="2" step="0.05" value={focusedPart.midiFx.velocityScale}
                     onchange={(e) => setPartMidiFx(focusedPart.partId, { velocityScale: Number(e.currentTarget.value) })} />
            </label>
            <label>Fixed vel (0 = off)
              <input type="number" min="0" max="127" value={focusedPart.midiFx.velocityFixed}
                     onchange={(e) => setPartMidiFx(focusedPart.partId, { velocityFixed: Number(e.currentTarget.value) })} />
            </label>
          </div>

          <div class="arp-row">
            <PropertyToggle compact label="Arp" value={focusedPart.arp.enabled} ariaLabel="Arpeggiator"
                            onchange={(on) => setPartArp(focusedPart.partId, { enabled: on })} />
            <select value={focusedPart.arp.mode} aria-label="Arpeggiator mode"
                    onchange={(e) => setPartArp(focusedPart.partId, { mode: e.currentTarget.value })}>
              {#each ['up', 'down', 'up-down', 'down-up', 'order', 'random', 'chord'] as mode (mode)}
                <option value={mode}>{mode}</option>
              {/each}
            </select>
            <select value={focusedPart.arp.stepsPerBeat} aria-label="Arpeggiator rate"
                    onchange={(e) => setPartArp(focusedPart.partId, { stepsPerBeat: Number(e.currentTarget.value) })}>
              {#each [1, 2, 3, 4, 6, 8, 12, 16] as rate (rate)}
                <option value={rate}>{rate}/beat</option>
              {/each}
            </select>
            <label class="mini" title="Gate">
              <input type="range" min="0.05" max="1" step="0.05" value={focusedPart.arp.gate}
                     aria-label="Arpeggiator gate"
                     onchange={(e) => setPartArp(focusedPart.partId, { gate: Number(e.currentTarget.value) })} />
            </label>
            <label class="mini" title="Swing">
              <input type="range" min="0" max="0.75" step="0.01" value={focusedPart.arp.swing}
                     aria-label="Arpeggiator swing"
                     onchange={(e) => setPartArp(focusedPart.partId, { swing: Number(e.currentTarget.value) })} />
            </label>
            <select value={focusedPart.arp.octaves} aria-label="Arpeggiator octaves"
                    onchange={(e) => setPartArp(focusedPart.partId, { octaves: Number(e.currentTarget.value) })}>
              {#each [1, 2, 3, 4] as octaves (octaves)}
                <option value={octaves}>{octaves} oct</option>
              {/each}
            </select>
            <PropertyToggle compact label="Latch" value={focusedPart.arp.latch} ariaLabel="Latch the held chord"
                            onchange={(on) => setPartArp(focusedPart.partId, { latch: on })} />
          </div>
        </div>
      {/if}

      {#if focusedPart?.hardware}
        <!-- Hardware-instrument parts (Stage 5): the part reaches an external synth over
             MIDI and can return audio through the interface — same zones, fader, inserts
             and sends as any part. A gone port is a diagnostic, never silence. -->
        <div class="hw-config" data-testid="host-hardware">
          <div class="fx-head">
            <strong>External hardware — {partTitle(focusedPart)}</strong>
            <button type="button" class="ghost" title="Back to a software part (identity and zones stay)"
                    onclick={() => clearHardware(focusedPart.partId)}>Make software part</button>
          </div>
          {#if focusedPart.midiOutError}
            <div class="hw-error" role="alert">{focusedPart.midiOutError}</div>
          {/if}
          <div class="zone-grid">
            <label>MIDI output
              <select value={focusedPart.midiOutputId}
                      onchange={(e) => {
                        const id = e.currentTarget.value;
                        const name = $hostAudioDevices.midiOutputs.find((m) => m.id === id)?.name ?? '';
                        setHardwareConfig(focusedPart.partId, { midiOutputId: id, midiOutputName: name });
                      }}>
                <option value="">(no port)</option>
                {#if focusedPart.midiOutputId
                     && !$hostAudioDevices.midiOutputs.some((m) => m.id === focusedPart.midiOutputId)}
                  <option value={focusedPart.midiOutputId}>{focusedPart.midiOutputName || focusedPart.midiOutputId} (gone)</option>
                {/if}
                {#each $hostAudioDevices.midiOutputs as out (out.id)}
                  <option value={out.id}>{out.name}</option>
                {/each}
              </select>
            </label>
            <label>Channel
              <select value={focusedPart.midiOutChannel}
                      onchange={(e) => setHardwareConfig(focusedPart.partId, { midiOutChannel: Number(e.currentTarget.value) })}>
                {#each Array.from({ length: 16 }, (_, i) => i + 1) as ch}
                  <option value={ch}>{ch}</option>
                {/each}
              </select>
            </label>
            <label>Audio return
              <select value={focusedPart.audioReturnChannel}
                      onchange={(e) => setHardwareConfig(focusedPart.partId, { audioReturnChannel: Number(e.currentTarget.value) })}>
                <option value={-1}>None</option>
                {#each Array.from({ length: Math.max($hostAudioDevices.inputChannels, 8) / 2 }, (_, i) => i * 2) as ch}
                  <option value={ch}>Inputs {ch + 1}/{ch + 2}</option>
                {/each}
              </select>
            </label>
            <label>Bank (-1 = none)
              <input type="number" min="-1" max="16383" value={focusedPart.programBank}
                     onchange={(e) => setHardwareConfig(focusedPart.partId, { programBank: Number(e.currentTarget.value) })} />
            </label>
            <label>Program (-1 = none)
              <input type="number" min="-1" max="127" value={focusedPart.programNumber}
                     onchange={(e) => setHardwareConfig(focusedPart.partId, { programNumber: Number(e.currentTarget.value) })} />
            </label>
            <span class="hw-send">
              <button type="button" disabled={focusedPart.programBank < 0 && focusedPart.programNumber < 0}
                      title="Send the bank select / program change now"
                      onclick={() => sendHardwareProgram(focusedPart.partId)}>Send program</button>
            </span>
          </div>
        </div>
      {:else if focusedPart && !focusedPart.hasInstrument && !focusedPart.unresolved}
        <div class="hw-config" data-testid="host-hardware-offer">
          <button type="button" title="Use this part for an external synth: MIDI out, optional audio return"
                  onclick={() => setHardwareConfig(focusedPart.partId, {})}>Use external hardware…</button>
        </div>
      {/if}

      {#if focusedPart}
        {@render effectChain(focusedPart.effects, focusedPart.partId,
                             `Inserts — ${partTitle(focusedPart)}${latencySuffix(focusedPart.latencyMs)}`)}
      {/if}

      {#if focusedPart && $hostState.rack.returns.length > 0}
        <div class="sends" data-testid="host-sends">
          <strong>Sends — {partTitle(focusedPart)}</strong>
          {#each $hostState.rack.returns as ret (ret.returnId)}
            <div class="send-row">
              <span class="send-name">{ret.name}</span>
              <input type="range" min="0" max="2" step="0.01"
                     value={focusedPart.sends.find((s) => s.returnId === ret.returnId)?.level ?? 0}
                     aria-label={`Send to ${ret.name}`}
                     oninput={(e) => setSendLevel(focusedPart.partId, ret.returnId, Number(e.currentTarget.value))} />
            </div>
          {/each}
        </div>
      {/if}

      {#if focusedPart && !focusedPart.hardware && focusedPart.outputChannels > 2}
        <!-- Explicit multi-output routing: extra pairs to the mix at their own gain; the
             main pair 1/2 keeps the inserts and the fader. -->
        <div class="outputs" data-testid="host-outputs">
          <strong>Outputs — {partTitle(focusedPart)}</strong>
          {#each Array.from({ length: Math.floor(focusedPart.outputChannels / 2) - 1 }, (_, i) => i + 1) as pairIndex (pairIndex)}
            {@const route = focusedPart.extraOuts.find((o) => o.pairIndex === pairIndex)}
            <div class="send-row">
              <PropertyToggle compact label={`${pairIndex * 2 + 1}/${pairIndex * 2 + 2}`} value={!!route}
                              ariaLabel={`Route output pair ${pairIndex * 2 + 1}/${pairIndex * 2 + 2}`}
                              onchange={(on) => on ? setExtraOut(focusedPart.partId, pairIndex, 1)
                                                   : removeExtraOut(focusedPart.partId, pairIndex)} />
              {#if route}
                <input type="range" min="0" max="2" step="0.01" value={route.gain}
                       aria-label={`Pair ${pairIndex * 2 + 1}/${pairIndex * 2 + 2} gain`}
                       oninput={(e) => setExtraOut(focusedPart.partId, pairIndex, Number(e.currentTarget.value))} />
              {:else}
                <span class="slot-empty">not routed</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {@render effectChain($hostState.rack.masterEffects, 'master',
                           `Master effects${latencySuffix($hostState.rack.masterLatencyMs)}`)}

      <!-- Shared send/return buses (Stage 5): each return is one more effect chain, fed by
           the per-part send sliders above, rejoining ahead of the master inserts. -->
      <div class="returns" data-testid="host-returns">
        <div class="fx-head">
          <strong>Returns</strong>
          <button type="button" onclick={() => addReturn()} data-testid="host-add-return">+ Return</button>
        </div>
        {#each $hostState.rack.returns as ret (ret.returnId)}
          <div class="return-block">
            <div class="fx-head">
              <span class="send-name">{ret.name}</span>
              <label class="mini return-level" title="Return level">
                <input type="range" min="0" max="2" step="0.01" value={ret.level}
                       aria-label={`${ret.name} level`}
                       oninput={(e) => setReturnLevel(ret.returnId, Number(e.currentTarget.value))} />
              </label>
              <button type="button" class="ghost danger" title="Remove this return (its sends go with it)"
                      onclick={() => removeReturn(ret.returnId)}>×</button>
            </div>
            {@render effectChain(ret.effects, ret.returnId, `${ret.name} effects`, 'host-return-fx')}
          </div>
        {/each}
      </div>

      <!-- Stage 5 macros: one value fanning across parts and effects, always through the
           central parameter path. Select a macro, then add targets from the parameter view. -->
      <div class="macros" data-testid="host-macros">
        <div class="fx-head">
          <strong>Macros</strong>
          <button type="button" onclick={() => addMacro()} data-testid="host-add-macro">+ Macro</button>
        </div>
        {#each $hostState.rack.macros as macro (macro.macroId)}
          <div class="macro-row" class:on={selectedMacro?.macroId === macro.macroId}>
            <button type="button" class="ghost macro-name" title="Select for target assignment"
                    onclick={() => (selectedMacroId = macro.macroId)}>{macro.name}</button>
            <input type="range" min="0" max="1" step="0.001" value={macro.value} aria-label={macro.name}
                   oninput={(e) => setMacroValue(macro.macroId, Number(e.currentTarget.value))}
                   onchange={(e) => setMacroValue(macro.macroId, Number(e.currentTarget.value), true)} />
            <button type="button" class="ghost danger" title="Remove this macro"
                    onclick={() => removeMacro(macro.macroId)}>×</button>
          </div>
          {#if macro.targets.length > 0}
            <div class="macro-targets">
              {#each macro.targets as target (target.targetId + target.parameterId)}
                <span class="macro-target" class:unresolved={!target.resolved}
                      title={target.resolved ? `${target.displayName} on ${target.targetName}`
                                             : 'unresolved — the target no longer carries this plug-in'}>
                  {target.displayName}{target.inverted ? ' ⇄' : ''} — {target.targetName || 'missing'}
                  <button type="button" class="ghost danger"
                          onclick={() => removeMacroTarget(macro.macroId, target.targetId, target.parameterId)}>×</button>
                </span>
              {/each}
            </div>
          {/if}
        {/each}
      </div>

      <!-- The Stage 2 generic parameter view: the common, inspectable control surface the
           vendor editor is not — and the same registry hardware pages and macros will use. -->
      {#if paramTargetId && $hostParameters.partId === paramTargetId}
        <div class="param-view" data-testid="host-parameters">
          <div class="param-head">
            <strong>Parameters — {paramTargetName}</strong>
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
                                  onchange={(on) => setParameter(paramTargetId, parameter.id, on ? 1 : 0)} />
                {:else}
                  <input type="range" min="0" max="1" step={stepFor(parameter)} value={parameter.value}
                         aria-label={parameter.name}
                         onpointerdown={() => beginParameterGesture(paramTargetId, parameter.id)}
                         onpointerup={() => endParameterGesture(paramTargetId, parameter.id)}
                         oninput={(e) => setParameter(paramTargetId, parameter.id, Number(e.currentTarget.value))} />
                {/if}
                <span class="param-value">{parameter.text}{parameter.label ? ` ${parameter.label}` : ''}</span>
                <button type="button" class="ghost" title="Reset to the plug-in's default"
                        onclick={() => resetParameter(paramTargetId, parameter.id)}>↺</button>
                <button type="button" class="ghost" disabled={!selectedPage || !firstEmptySlot}
                        title={selectedPage
                                 ? (firstEmptySlot ? `Assign to ${selectedPage.name}, slot ${firstEmptySlot.slotId}`
                                                   : 'The selected page has no empty slot')
                                 : 'Create a control page first'}
                        onclick={() => assignToSelectedPage(parameter)}>→</button>
                <button type="button" class="ghost" disabled={!selectedMacro}
                        title={selectedMacro ? `Add to macro ${selectedMacro.name}` : 'Create a macro first'}
                        onclick={() => selectedMacro && addMacroTarget(selectedMacro.macroId, paramTargetId, parameter.id)}>M+</button>
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
                    onclick={() => loadInstrument(focusedPart?.partId ?? '', instrument.ceId)}>
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
          <span class="pages-actions">
            <button type="button" disabled={!focusedPart?.hasInstrument}
                    title={focusedPart?.hasInstrument
                             ? `Generate pages from ${partTitle(focusedPart)}'s parameters (replaces its earlier auto pages)`
                             : 'Focus a part with an instrument first'}
                    onclick={() => generateControlPages(focusedPart.partId)}
                    data-testid="host-auto-pages">Auto pages</button>
            <button type="button" onclick={() => addControlPage()} data-testid="host-add-page">+ Page</button>
          </span>
        </div>
        {#if pages.length > 0}
          <div class="page-tabs">
            {#each pages as page (page.pageId)}
              <span class="page-tab" class:on={selectedPage?.pageId === page.pageId}>
                <button type="button" class="page-name" onclick={() => (selectedPageId = page.pageId)}
                        title={page.generated ? 'Generated — regenerating replaces this page' : undefined}>
                  {page.name}{#if page.generated}<span class="page-auto"> · auto</span>{/if}
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
            <div class="module-row"
                 class:trouble={module.quarantined || module.failureCount > 0 || module.missing
                                || module.unavailableReason}
                 title={module.path}>
              <div class="module-id">
                <span class="module-name">{module.path.split('\\').pop().split('/').pop()}</span>
                <span class="module-detail">
                  {#if module.quarantined}
                    quarantined — {module.lastFailureReason || 'failed to scan'}
                  {:else if module.missing}
                    missing — the file is gone from where it was scanned
                  {:else if module.unavailableReason}
                    <!-- The wrong architecture, mostly. Without this branch it fell through to
                         "no instruments", which reads as a plug-in with nothing in it rather
                         than one this machine cannot load — the exact confusion the native
                         check exists to end. -->
                    {module.unavailableReason}
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
  .midi-activity {
    margin-left: 10px;
    color: #9fd6a3;
    font-size: 11px;
    font-weight: normal;
    text-transform: none;
    letter-spacing: normal;
  }
  .midi-activity.quiet { color: #66707b; }
  .midi-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #9fd6a3;
    margin-right: 5px;
    animation: midi-flash 0.6s ease-out forwards;
  }
  @keyframes midi-flash {
    from { box-shadow: 0 0 6px 2px #9fd6a366; }
    to { box-shadow: none; opacity: 0.55; }
  }

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

  .library-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #171a1d;
    max-height: 340px;
  }
  .library-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .library-head input { flex: 1; min-width: 180px; }
  .library-filters { display: flex; gap: 4px; }
  .library-counts { color: #7d8894; font-size: 11px; }
  .library-capture { display: flex; gap: 8px; }
  .library-paths { display: flex; flex-direction: column; gap: 4px; }
  .library-list { overflow-y: auto; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
  .library-row { display: flex; align-items: center; gap: 8px; }
  .library-id { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .library-name { font-weight: 600; font-size: 12px; }
  .library-detail { color: #7d8894; font-size: 11px; }
  .library-reason { color: #d6a3a3; font-size: 11px; }
  .library-row.unavailable .library-name { color: #8a939d; }
  button.star { padding: 2px 4px; font-size: 14px; color: #7d8894; }
  button.star.on { color: #d5a93a; }

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

  .transport { display: flex; align-items: center; gap: 4px; }
  .transport .tempo { width: 62px; }
  .transport .ts { width: 44px; }
  .ts-slash { color: #7d8894; }
  .transport-position {
    min-width: 44px;
    text-align: center;
    color: #9aa5b1;
    font-variant-numeric: tabular-nums;
  }
  button.toggle.warn { color: #e4b3b3; border-color: #7a4a4a; }
  .arp-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

  .fx-chain, .macros, .sends, .outputs, .returns, .hw-config, .event-chain {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid #2c343d;
    padding-top: 8px;
  }
  .send-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .send-name { flex: 0 0 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .send-row input[type='range'] { flex: 1; min-width: 60px; }
  .return-block { display: flex; flex-direction: column; gap: 4px; }
  .return-block .fx-chain { border-top: none; padding-top: 0; margin-left: 8px; }
  .return-level input[type='range'] { width: 120px; }
  .hw-error {
    padding: 4px 8px;
    border: 1px solid #7a4a4a;
    border-radius: 4px;
    background: #2a1d1d;
    color: #e4b3b3;
    font-size: 11px;
  }
  .hw-send { display: flex; align-items: flex-end; }
  .fx-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .fx-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .fx-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx-row.bypassed .fx-name { color: #7d8894; text-decoration: line-through; }
  .fx-row.unresolved .fx-name { color: #d6a3a3; }
  .macro-row { display: flex; align-items: center; gap: 8px; }
  .macro-row.on .macro-name { color: #d6dbe0; border-color: #5b9bd5; }
  .macro-name { font-size: 12px; }
  .macro-row input[type='range'] { flex: 1; min-width: 60px; }
  .macro-targets { display: flex; flex-wrap: wrap; gap: 4px; margin-left: 8px; }
  .macro-target {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    border: 1px solid #3b4652;
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 11px;
    color: #9aa5b1;
  }
  .macro-target.unresolved { color: #d6a3a3; border-color: #7a4a4a; }

  .pages {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid #2c343d;
    padding-top: 8px;
  }
  .pages-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .pages-actions { display: flex; gap: 6px; }
  .page-auto { color: #7d8894; font-size: 10px; }
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
