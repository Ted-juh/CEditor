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
    hostMidiActivity, hostSurface, hostScanLog, hostLastError, hostAudioDevices, initInstrumentHostBridge,
    filterInstruments, filterEffects, scanForInstruments, addScanPath, browseScanPath, removeScanPath, clearQuarantine,
    addRackPart, removeRackPart, focusRackPart, loadInstrument, unloadInstrument,
    setPartMixer, setPartMidiRules, hostPanic, openEditor, closeEditor, floatEditor, closeEditorWindow,
    requestAudioDevices, setAudioDevice, setMidiInputEnabled,
    hostProject, hostBuild, requestHostProject, setHostProject, buildHostProduct,
    hostParameters, emptyHostParameters, filterParameters, requestParameters,
    parameterControlKind, setParameterText, groupParameters, assignedParameterIds, quickLearnParameter,
    setParameter, resetParameter, beginParameterGesture, endParameterGesture,
    addControlPage, removeControlPage, assignControlSlot, clearControlSlot, setControlSlotValue,
    hostMidiLearn, learnControlSlotMidi, cancelMidiLearn, clearControlSlotMidi,
    hostParamLearn, learnControlSlotParameter, cancelLearnControlSlotParameter,
    toggleParameterFavourite, parameterShortlist,
    hostArpStep,
    hostCanvasDrag,
    hostChordLearn, learnKeyChord, cancelKeyChordLearn, clearKeyChord,
    hostNote,
    walkPartPreset,
    generateControlPages,
    hostLibrary, requestLibrary, scanLibrary, browseLibraryPath, removeLibraryPath,
    saveUserPreset, saveRackToLibrary, saveChainToLibrary,
    setLibraryUserMetadata, removeLibraryRecord, loadLibraryRecord,
    addEffect, removeEffect, moveEffect, setEffectBypassed, openEffectEditor,
    reorderIndexForDrop, setPluginArtwork, clearPluginArtwork, customArtworkIds,
    hostParamDrag,
    addMacro, removeMacro, setMacroValue, addMacroTarget, removeMacroTarget,
    addReturn, removeReturn, setReturnLevel, setSendLevel,
    setExtraOut, removeExtraOut, setHardwareConfig, clearHardware, sendHardwareProgram,
    setPartMidiSource, midiSourceWouldLoop,
    captureHardwarePatch, cancelHardwarePatchCapture, finishHardwarePatchCapture,
    clearHardwarePatch, sendHardwarePatch, setHardwareRestorePolicy,
    hostPatchCapture, hostPatchSends, hostPatchPrompt,
    hostPatchCompare, compareHardwarePatch, clearPatchCompare, hostLibrary as hostLibraryStore,
    transportPlay, transportStop, setTempo, setTimeSignature, setExternalClock,
    setPartArp, setPartMidiFx,
    midiSlotTypes, midiSlotLabels,
    addMidiSlot, removeMidiSlot, moveMidiSlot, setMidiSlotBypassed, setMidiSlotOptions,
  } from '../stores/instrumentHost.js';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PerformancePanel from './PerformancePanel.svelte';
  import HostMixerPanel from './HostMixerPanel.svelte';
  import HostSplitEditor from './HostSplitEditor.svelte';
  import MidiChainPanel from './MidiChainPanel.svelte';
  import HostRackCanvas from './HostRackCanvas.svelte';
  import PluginTile from './PluginTile.svelte';
  import HostSurfacePanel from './HostSurfacePanel.svelte';
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
  // Audition: when on, one click on a library row loads the sound into the focused part AND
  // plays a short note through the host, so browsing with the mouse is browsing with ears.
  let auditionOn = $state(false);
  let libraryQuery = $state('');
  let libraryType = $state('');
  let performanceOpen = $state(false);
  let mixerOpen = $state(false);
  let productOpen = $state(false);
  let reliabilityOpen = $state(false);
  let licenceOpen = $state(false);

  // The rack column has two readings of the same thing: the list you edit from, and the
  // picture of where the sound goes. A toggle rather than a replacement — the list is
  // keyboard-navigable and carries the per-part mixer, the canvas does neither, so neither
  // one gets to be the only way in.
  let rackView = $state('list');

  // --- the dock ---------------------------------------------------------------------------
  // One strip along the bottom showing whatever you selected, instead of every editor stacked
  // down the rack column. The tab list is derived, not fixed: with no part focused only the
  // rack-wide chains apply, and the parameter view appears once something is inspectable.
  let dockOpen = $state(true);
  let dockTab = $state('midi');
  // What the patch being captured will be called. Typed while the capture is running, so it
  // is asked for at the moment the player knows the answer rather than afterwards.
  let patchName = $state('');

  /** Bytes as something a person reads. A patch is a few hundred; a bank is tens of
      thousands, and "38912" says less than "38 KB" about whether the whole thing arrived. */
  const patchSize = (bytes) => (bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} bytes`);
  /** A byte the way a synth manual writes it; a byte that is not there reads as absent. */
  const hex = (b) => (b < 0 ? '—' : b.toString(16).toUpperCase().padStart(2, '0') + 'h');
  // Which saved patch to compare the part's against.
  let compareRecordId = $state('');
  let dockHeight = $state(340);   // enough for the arp's two grids without a scrollbar
  let gripping = $state(false);
  let gripStartY = 0;
  let gripStartHeight = 0;

  function gripDown(event) {
    gripping = true;
    gripStartY = event.clientY;
    gripStartHeight = dockHeight;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function gripMove(event) {
    if (!gripping) return;
    // Dragging up grows the dock, which is why the delta is inverted.
    dockHeight = Math.max(140, Math.min(720, gripStartHeight + (gripStartY - event.clientY)));
  }
  function gripUp() { gripping = false; }

  function selectDockTab(id) {
    // Clicking the tab you are on collapses the dock — the same gesture that opened it.
    if (dockOpen && dockTab === id) { dockOpen = false; return; }
    dockTab = id;
    dockOpen = true;
  }


  function playAuditionNote() {
    // A note the focused part will actually voice: the centre of its key zone, clamped —
    // middle C is no use to a bass split that ends at B2.
    const part = focusedPart;
    const note = part ? Math.round((part.keyLow + part.keyHigh) / 2) : 60;
    hostNote(note, 100, true);
    setTimeout(() => hostNote(note, 0, false), 600);
  }

  function clickLibraryRow(record) {
    if (record.type === 'rack' || !record.available) return;
    // One click, loaded: into the focused part, or as the first part of an empty rack.
    loadLibraryRecord(record.recordId, focusedPart ? 'focused' : 'add');
    // The common browse case (same plug-in, next sound) applies synchronously, so a short
    // beat later the note plays the NEW sound. A cross-class load may still be
    // instantiating — the note then auditions nothing, which is harmless and honest.
    if (auditionOn) setTimeout(playAuditionNote, 250);
  }

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
  let effects = $derived(filterEffects($hostState.effectClasses, search));

  let assignedIds = $derived(assignedParameterIds($hostState, paramTargetId));
  let paramAssignedOnly = $state(false);
  let visibleParameters = $derived(
    filterParameters($hostParameters.parameters, paramSearch)
      .filter((p) => !paramAssignedOnly || assignedIds.has(p.id)));
  // The plug-in's own hierarchy, folded: groups collapse so four hundred parameters read as
  // a dozen headings. A search or an active filter opens everything — hiding a match inside
  // a closed group is worse than a long list — and a single-group registry never collapses,
  // because a closed list with one heading is just an empty panel with extra steps.
  let parameterGroups = $derived(groupParameters(visibleParameters));
  let shortlist = $derived(parameterShortlist($hostParameters.parameters,
                                              $hostParameters.favourites,
                                              $hostParameters.touched));
  let openGroups = $state({});
  let groupsForcedOpen = $derived(
    paramSearch.trim() !== '' || paramAssignedOnly || parameterGroups.length <= 1);
  // The parameter the armed learn slot points at, so its ⚡ can show as listening.
  let armedParameterId = $derived.by(() => {
    if (!$hostMidiLearn.armed) return '';
    const slot = $hostState.rack.pages.find((p) => p.pageId === $hostMidiLearn.pageId)
      ?.slots.find((sl) => sl.slotId === $hostMidiLearn.slotId);
    return slot && slot.partId === paramTargetId ? slot.parameterId : '';
  });

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

  // Typed entry: double-click the value, type what the plug-in itself would print.
  let editingParamId = $state(null);
  let editingParamText = $state('');
  function beginParamEdit(parameter) {
    editingParamId = parameter.id;
    editingParamText = parameter.text;
  }
  function commitParamEdit(parameter) {
    if (editingParamId !== parameter.id) return;
    setParameterText(paramTargetId, parameter.id, editingParamText);
    editingParamId = null;
  }
  function stepIndexOf(parameter) {
    return Math.round(parameter.value * Math.max(1, parameter.numSteps - 1));
  }
  function nudgeParameterStep(parameter, delta) {
    const steps = parameter.numSteps;
    const index = Math.max(0, Math.min(steps - 1, stepIndexOf(parameter) + delta));
    setParameter(paramTargetId, parameter.id, steps > 1 ? index / (steps - 1) : 0);
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

  // Tabs a part actually has. Routing stays offered whenever a part is focused — hardware,
  // sends and extra outs all live there and any of them can appear at any moment — but the
  // parameter view only exists once something is inspectable, so it comes and goes.
  let dockTabs = $derived([
    ...(focusedPart
          ? [{ id: 'zone', label: 'Zone' }, { id: 'midi', label: 'MIDI' },
             { id: 'inserts', label: 'Inserts' }, { id: 'routing', label: 'Routing' }]
          : []),
    ...(paramTargetId ? [{ id: 'params', label: 'Params' }] : []),
    { id: 'rack', label: 'Rack' },
    { id: 'surface', label: 'Surface' },
  ]);

  // What the dock is editing, on the tab bar, so the answer is in one fixed place however far
  // the body has been scrolled.
  let dockSubject = $derived(dockTab === 'surface' ? 'The controller'
                             : dockTab === 'rack' ? 'Master, returns and macros'
                             : dockTab === 'params' ? (paramTargetName || 'Parameters')
                             : focusedPart ? partTitle(focusedPart) : 'Nothing focused');

  // A tab that stops applying must not leave the dock showing nothing — unloading the part
  // whose parameters you were reading is the ordinary way to get here.
  $effect(() => {
    if (!dockTabs.some((tab) => tab.id === dockTab))
      dockTab = dockTabs[0]?.id ?? 'rack';
  });

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

  // --- dragging an insert to reorder the chain ---------------------------------------------
  //
  // The chain's order IS the signal's order, and until now there was no way to change it at
  // all: no arrows, no drag, nothing. The only fix for putting the compressor after the
  // reverb was to delete both and add them back the other way round.
  //
  // The grip is what is draggable, not the whole row: a row full of buttons that also drags
  // makes every button press feel like it might do something else. reorderIndexForDrop owns
  // the one piece of arithmetic worth a test — the off-by-one when a row travels downwards.
  let fxDrag = $state({ id: '', overId: '', after: false });

  function fxDragStart(event, effectId) {
    fxDrag = { id: effectId, overId: '', after: false };
    event.dataTransfer?.setData('text/plain', effectId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function fxDragEnd() { fxDrag = { id: '', overId: '', after: false }; }

  /** Which half of the row the pointer is in — the difference between "before this" and
      "after this", which is the whole vocabulary of a reorder. */
  const inLowerHalf = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY > box.top + box.height / 2;
  };

  function fxDragOver(event, chain, overId) {
    if (!fxDrag.id || !chain.some((e) => e.effectId === fxDrag.id)) return;   // not this chain
    event.preventDefault();
    // Must match the source's effectAllowed or the browser cancels the drop in silence.
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    fxDrag = { ...fxDrag, overId, after: inLowerHalf(event) };
  }

  function fxDrop(event, chain, overId) {
    if (!fxDrag.id || !chain.some((e) => e.effectId === fxDrag.id)) return;
    event.preventDefault();
    const index = reorderIndexForDrop(chain.findIndex((e) => e.effectId === fxDrag.id),
                                      chain.findIndex((e) => e.effectId === overId),
                                      inLowerHalf(event));
    if (index >= 0) moveEffect(fxDrag.id, index);
    fxDragEnd();
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
      <button type="button" class="toggle" class:on={mixerOpen}
              onclick={() => (mixerOpen = !mixerOpen)}
              data-testid="host-mixer-toggle">Mixer</button>
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
      <div class="device-midi">
        <span class="device-midi-title">Control surface</span>
        <span class="device-midi-row surface-row" data-testid="host-surface-status">
          <span class="surface-dot {$hostSurface.state}"></span>
          {#if $hostSurface.state === 'connected'}
            {$hostSurface.device || 'CTRL49'} connected
          {:else if $hostSurface.state === 'connecting'}
            Starting the CTRL49 display…
          {:else if $hostSurface.state === 'heldElsewhere'}
            CTRL49 is in use by another instance
          {:else if $hostSurface.state === 'failed'}
            CTRL49 failed{$hostSurface.detail ? ` — ${$hostSurface.detail}` : ''}
          {:else}
            Looking for a CTRL49 — plug it in and it connects by itself
          {/if}
        </span>
      </div>
    </div>
  {/if}

  {#if performanceOpen}
    <PerformancePanel />
  {/if}

  {#if mixerOpen}
    <HostMixerPanel />
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
        <input type="search" placeholder="Search sounds, chains and racks…" value={libraryQuery}
               oninput={(e) => setLibraryFilter(e.currentTarget.value, libraryType)} />
        <span class="library-filters">
          {#each [['', 'All'], ['preset', 'Presets'], ['chain', 'Chains'], ['rack', 'Racks']] as [value, label] (value)}
            <button type="button" class="toggle" class:on={libraryType === value}
                    onclick={() => setLibraryFilter(libraryQuery, value)}>{label}</button>
          {/each}
        </span>
        <button type="button" class="toggle" class:on={auditionOn} data-testid="host-audition"
                title="When on, clicking a sound loads it into the focused part and plays a short note"
                onclick={() => (auditionOn = !auditionOn)}>♪ Audition</button>
        <button type="button" onclick={() => scanLibrary()} data-testid="host-scan-library">Scan presets</button>
        <button type="button" onclick={() => browseLibraryPath()}>Add folder…</button>
        <span class="library-counts">{$hostLibrary.counts.presets} presets · {$hostLibrary.counts.chains} chains · {$hostLibrary.counts.racks} racks</span>
      </div>

      <div class="library-capture">
        <!-- A hardware part saves the patch it captured. The Library is where a sound lives
             whichever box makes it, so "warm pad" finds the Serum preset and the Juno patch
             in one list. -->
        <button type="button"
                disabled={!(focusedPart?.hasInstrument
                            || (focusedPart?.hardware && focusedPart?.hardwarePatchBytes > 0))}
                title={focusedPart?.hasInstrument ? `Capture ${partTitle(focusedPart)}'s current state`
                       : focusedPart?.hardware
                         ? (focusedPart.hardwarePatchBytes > 0
                              ? `Save ${partTitle(focusedPart)}'s captured patch to the library`
                              : 'Capture a patch from the synth first (Routing tab)')
                         : 'Focus a part with an instrument first'}
                onclick={() => saveUserPreset(focusedPart.partId)}
                data-testid="host-save-preset">{focusedPart?.hardware ? 'Save patch of focused part' : 'Save preset of focused part'}</button>
        <button type="button" disabled={!focusedPart?.hasInstrument}
                title={focusedPart?.hasInstrument
                       ? `Capture ${partTitle(focusedPart)} whole: the instrument and its state, the MIDI modules ahead of it and the inserts behind it`
                       : 'Focus a part with an instrument first'}
                onclick={() => saveChainToLibrary(focusedPart.partId)}
                data-testid="host-save-chain">Save chain of focused part</button>
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
            {#if record.type !== 'rack'}
              <PluginTile ceId={record.targetCeId} name={record.instrument || record.name}
                          vendor={record.manufacturer} size={22} />
            {/if}
            <div class="library-id" class:clickable={record.type !== 'rack' && record.available}
                 role="button" tabindex="-1" data-testid="library-row-body"
                 title={record.type === 'rack' ? undefined
                        : record.type === 'chain'
                          ? 'Click: load the whole chain into the focused part'
                          : auditionOn ? 'Click: load into the focused part and audition'
                                       : 'Click: load into the focused part'}
                 onclick={() => clickLibraryRow(record)}
                 onkeydown={(e) => e.key === 'Enter' && clickLibraryRow(record)}>
              <span class="library-name">{record.name}</span>
              <span class="library-detail">
                {record.type === 'rack' ? 'Rack'
                  : [record.type === 'chain' ? 'Chain'
                       : record.sourceType === 'hardwarePatch' ? 'Hardware patch' : null,
                     record.instrument, record.manufacturer]
                      .filter(Boolean).join(' · ') || 'Preset'}
                {#if record.sourceType === 'userState' || record.sourceType === 'rackCapture'
                     || record.sourceType === 'chainCapture' || record.sourceType === 'hardwarePatch'} · yours{/if}
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

  <!-- Total recall's one question, asked once when a session opens holding patches set to
       "ask". Nothing has been transmitted at this point and nothing will be until somebody
       presses a button here: the thing on the other end of that cable may not be the thing
       that was there when the patch was captured, and a dump sent at it uninvited overwrites
       an edit buffer somebody may be standing in front of. -->
  {#if $hostPatchPrompt.length > 0}
    <div class="patch-prompt" data-testid="host-patch-prompt">
      <span class="patch-prompt-text">
        Restore {$hostPatchPrompt.length === 1 ? 'a captured patch' : `${$hostPatchPrompt.length} captured patches`}
        to your hardware? ({$hostPatchPrompt.map((p) => p.patchName).join(', ')})
      </span>
      <button type="button" onclick={() => {
        for (const p of $hostPatchPrompt) sendHardwarePatch(p.partId);
        hostPatchPrompt.set([]);
      }}>Send {$hostPatchPrompt.length === 1 ? 'it' : 'them'}</button>
      <button type="button" class="ghost" onclick={() => hostPatchPrompt.set([])}>Not now</button>
    </div>
  {/if}

  <div class="host-columns">
    <section class="rack-column" aria-label="Instrument rack">
      <div class="column-head">
        <strong>Rack</strong>
        <span class="view-switch">
          {#each [['list', 'List'], ['canvas', 'Canvas']] as [value, label] (value)}
            <button type="button" class="toggle" class:on={rackView === value}
                    data-testid={`rack-view-${value}`}
                    onclick={() => (rackView = value)}>{label}</button>
          {/each}
        </span>
        <button type="button" onclick={() => addRackPart()} data-testid="host-add-part">+ Add part</button>
      </div>

      {#if parts.length === 0}
        <div class="empty-hint">No parts yet. Add one, then load an instrument from the right.</div>
      {/if}

      {#if rackView === 'canvas'}
        <HostRackCanvas />
      {/if}

      {#each rackView === 'list' ? parts : [] as part (part.partId)}
        <div class="part" class:focused={part.partId === focusedPartId} class:disabled={!part.enabled}>
          <button type="button" class="part-main" onclick={() => focusRackPart(part.partId)}>
            {#if part.hasInstrument || part.unresolved}
              <PluginTile ceId={part.pluginCeId} name={part.pluginName} vendor={part.pluginVendor} size={24} />
            {/if}
            <span class="part-name">{partTitle(part)}</span>
            <span class="part-vendor">{part.pluginVendor}</span>
          </button>
          {#if (part.hasInstrument && !part.hardware) || part.hardware}
            <!-- The VIP front-panel walk: every library preset for this plug-in — factory
                 program list, vendor files, captured state — in one order, wrapping. A
                 hardware part walks the patches captured from the same synth, which is a
                 preset browser on a box that never had one. -->
            <span class="preset-walk" data-testid="part-preset-walk">
              <button type="button" class="ghost" title={part.hardware ? 'Previous patch' : 'Previous preset'}
                      onclick={() => walkPartPreset(part.partId, -1)}>‹</button>
              <span class="preset-name" title={part.presetName
                      ? `Loaded ${part.hardware ? 'patch' : 'preset'}: ${part.presetName}`
                      : part.hardware
                        ? 'No library patch loaded yet — capture one, save it, then walk'
                        : 'No preset loaded yet — walk or pick one from the library'}>
                {part.presetName || (part.hardware ? '— no patch —' : '— no preset —')}
              </span>
              <button type="button" class="ghost" title={part.hardware ? 'Next patch' : 'Next preset'}
                      onclick={() => walkPartPreset(part.partId, 1)}>›</button>
            </span>
          {/if}
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
              <button type="button" class="toggle"
                      class:on={$hostState.floatingEditorPartIds.includes(part.partId)}
                      data-testid="part-float-editor"
                      title="Pop the plug-in's interface out into its own window — several parts can float at once"
                      onclick={() => ($hostState.floatingEditorPartIds.includes(part.partId)
                                        ? closeEditorWindow(part.partId)
                                        : floatEditor(part.partId))}>⧉</button>
              <button type="button" class="ghost" title="Unload the instrument, keep the part"
                      onclick={() => unloadInstrument(part.partId)}>Unload</button>
            {/if}
            <button type="button" class="ghost danger" title="Remove this part"
                    onclick={() => removeRackPart(part.partId)}>×</button>
          </div>
        </div>
      {/each}

      {#if parts.length > 0 && rackView === 'list'}
        <!-- Splits and layers as a picture: every part's key range on one keyboard, edges
             draggable. The numeric zone fields in the dock stay — the picture and the digits
             drive the same command. -->
        <HostSplitEditor />
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
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="instrument" draggable="true"
               ondragstart={(e) => {
                 hostCanvasDrag.set({ kind: 'instrument', id: instrument.ceId, label: instrument.name });
                 e.dataTransfer?.setData('text/plain', instrument.name);
                 if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
               }}
               ondragend={() => hostCanvasDrag.set({ kind: '', id: '', label: '' })}>
            <!-- The tile is the button: clicking a plug-in's picture to change it is where
                 anyone would look first, and it costs the row no width. The revert appears
                 only for a class that is showing a picture somebody chose. -->
            <button type="button" class="tile-button"
                    title={$customArtworkIds.has(instrument.ceId)
                             ? `Choose a different picture for ${instrument.name}`
                             : `Choose your own picture for ${instrument.name}`}
                    onclick={() => setPluginArtwork(instrument.ceId)}>
              <PluginTile ceId={instrument.ceId} name={instrument.name} vendor={instrument.vendor} size={30} />
            </button>
            {#if $customArtworkIds.has(instrument.ceId)}
              <button type="button" class="ghost tile-revert"
                      title={`Use ${instrument.name}'s own picture again`}
                      onclick={() => clearPluginArtwork(instrument.ceId)}>↺</button>
            {/if}
            <div class="instrument-id">
              <span class="instrument-name">{instrument.name}</span>
              <span class="instrument-vendor">{instrument.vendor} {instrument.version}</span>
            </div>
            <button type="button" disabled={!focusedPart}
                    title={focusedPart
                             ? `Load into ${partTitle(focusedPart)} — or drag it onto a part in the rack canvas`
                             : 'Focus a rack part first, or drag this onto one in the rack canvas'}
                    onclick={() => loadInstrument(focusedPart?.partId ?? '', instrument.ceId)}>
              Load
            </button>
          </div>
        {/each}
      </div>

      <!-- Effects, which had no browser at all until now: the only way to reach one was a
           dropdown on whichever chain you happened to be looking at. They are first-class
           everywhere else, so they get the same list, the same tile and the same drag. -->
      <div class="column-head">
        <strong>Effects</strong>
        <span class="dim">{effects.length} of {$hostState.effectClasses.length}</span>
      </div>
      {#if $hostState.effectClasses.length === 0}
        <div class="empty-hint">No effects catalogued yet — scan for plug-ins.</div>
      {:else if effects.length === 0}
        <div class="empty-hint">No effect matches the search.</div>
      {/if}
      <div class="instrument-list">
        {#each effects as effect (effect.ceId)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="instrument" draggable="true"
               ondragstart={(e) => {
                 hostCanvasDrag.set({ kind: 'effect', id: effect.ceId, label: effect.name });
                 e.dataTransfer?.setData('text/plain', effect.name);
                 if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
               }}
               ondragend={() => hostCanvasDrag.set({ kind: '', id: '', label: '' })}>
            <!-- The tile is the button: clicking a plug-in's picture to change it is where
                 anyone would look first, and it costs the row no width. The revert appears
                 only for a class that is showing a picture somebody chose. -->
            <button type="button" class="tile-button"
                    title={$customArtworkIds.has(effect.ceId)
                             ? `Choose a different picture for ${effect.name}`
                             : `Choose your own picture for ${effect.name}`}
                    onclick={() => setPluginArtwork(effect.ceId)}>
              <PluginTile ceId={effect.ceId} name={effect.name} vendor={effect.vendor} size={30} />
            </button>
            {#if $customArtworkIds.has(effect.ceId)}
              <button type="button" class="ghost tile-revert"
                      title={`Use ${effect.name}'s own picture again`}
                      onclick={() => clearPluginArtwork(effect.ceId)}>↺</button>
            {/if}
            <div class="instrument-id">
              <span class="instrument-name">{effect.name}</span>
              <span class="instrument-vendor">{effect.vendor} {effect.version}</span>
            </div>
            <button type="button" disabled={!focusedPart}
                    title={focusedPart
                             ? `Insert into ${partTitle(focusedPart)} — or drag it onto any box in the rack canvas`
                             : 'Focus a rack part first, or drag this onto a box in the rack canvas'}
                    onclick={() => addEffect(focusedPart?.partId ?? '', effect.ceId)}>
              Insert
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
                  <!-- MIDI learn: click, wiggle a control on the keyboard, and the slot follows
                       it from then on. Works on an empty slot too — bind the knob first,
                       assign the parameter after. -->
                  {#if $hostMidiLearn.armed && $hostMidiLearn.pageId === selectedPage.pageId
                        && $hostMidiLearn.slotId === slot.slotId}
                    <button type="button" class="ghost midi-learn armed" data-testid="midi-learn-armed"
                            title="Move a control on your MIDI keyboard — or click to cancel"
                            onclick={() => cancelMidiLearn()}>listening…</button>
                  {:else}
                    {#if slot.midiCc >= 0}
                      <span class="midi-cc"
                            title={`This slot follows CC ${slot.midiCc}${slot.midiChannel ? ` on channel ${slot.midiChannel}` : ' on any channel'}`}>
                        CC {slot.midiCc}{slot.midiChannel ? ` · ch ${slot.midiChannel}` : ''}
                        <button type="button" class="ghost danger" title="Remove the MIDI binding"
                                onclick={() => clearControlSlotMidi(selectedPage.pageId, slot.slotId)}>×</button>
                      </span>
                    {/if}
                    <button type="button" class="ghost midi-learn"
                            title="Bind a hardware control: click, then move a knob or fader on your MIDI keyboard"
                            onclick={() => learnControlSlotMidi(selectedPage.pageId, slot.slotId)}>learn</button>
                    <!-- The answer to a plug-in with five hundred parameters: don't find it,
                         point at it. Click, then move the control in the plug-in's OWN window
                         and whatever moved lands here — no name to know, no list to scroll. -->
                    {#if $hostParamLearn.armed && $hostParamLearn.slotId === slot.slotId}
                      <button type="button" class="ghost midi-learn armed"
                              data-testid="param-learn-armed"
                              title="Move the control you want in the plug-in's own window — or click to cancel"
                              onclick={() => cancelLearnControlSlotParameter()}>watching…</button>
                    {:else}
                      <button type="button" class="ghost midi-learn"
                              data-testid="param-learn"
                              title="Pick a parameter by moving it: click, then move the control in the plug-in's own window"
                              onclick={() => learnControlSlotParameter(selectedPage.pageId, slot.slotId)}>grab</button>
                    {/if}
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="empty-hint">No pages yet — a page holds eight control slots for hardware and macros.</div>
        {/if}
      </div>

      <!-- Nothing about scanned modules here. What the scanner did is a Health question, and
           the browser is for browsing. -->
    </section>
  </div>

  <!-- The dock. Everything that edits ONE THING lives here rather than stacked down the
       rack column: the part's zone, its MIDI modules, its inserts, its routing, the
       parameter view, and the rack-wide chains. The column above is a list of parts you
       pick from; this is what you picked. Tabs, not scrolling, is the whole point. -->
  <div class="host-dock" class:collapsed={!dockOpen} data-testid="host-dock"
       style={dockOpen ? `height:${dockHeight}px` : null} aria-label="Editor dock">
    {#if dockOpen}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="dock-grip" role="separator" aria-label="Resize the dock"
           onpointerdown={gripDown} onpointermove={gripMove}
           onpointerup={gripUp} onpointercancel={gripUp}></div>
    {/if}

    <div class="dock-tabs">
      {#each dockTabs as tab (tab.id)}
        <button type="button" class="dock-tab" class:on={dockOpen && dockTab === tab.id}
                data-testid={`dock-tab-${tab.id}`}
                onclick={() => selectDockTab(tab.id)}>{tab.label}</button>
      {/each}
      <span class="dock-subject">{dockSubject}</span>
      <button type="button" class="ghost dock-collapse" data-testid="dock-collapse"
              title={dockOpen ? 'Collapse the dock' : 'Open the dock'}
              onclick={() => (dockOpen = !dockOpen)}>{dockOpen ? '▾' : '▴'}</button>
    </div>

    {#if dockOpen}
      <div class="dock-body" data-testid="dock-body">
        <!-- Declared before anything renders it: the insert chain is drawn three times
             here (a part, the master, each return) and it is one shape. -->
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
              {#each chain as effect, index (effect.effectId)}
                <!-- Controls first, name after. The buttons are what you came to press and
                     they are in the same place on every row, so the mouse travels a fixed
                     short distance instead of chasing however long a plug-in's name is. -->
                <div class="fx-row" class:bypassed={effect.bypassed} class:unresolved={effect.unresolved}
                     class:drop-before={fxDrag.overId === effect.effectId && !fxDrag.after}
                     class:drop-after={fxDrag.overId === effect.effectId && fxDrag.after}
                     class:lifted={fxDrag.id === effect.effectId}
                     data-testid="fx-row"
                     role="presentation"
                     ondragover={(e) => fxDragOver(e, chain, effect.effectId)}
                     ondrop={(e) => fxDrop(e, chain, effect.effectId)}>
                  <!-- The order of an insert chain is the order of the signal, and until now
                       it could only be set by removing everything after the mistake and
                       adding it again. Drag the grip, or use the arrows — the arrows are not
                       a leftover, they are the keyboard's version of the same move. -->
                  <span class="fx-grip" draggable="true" title="Drag to reorder" aria-hidden="true"
                        ondragstart={(e) => fxDragStart(e, effect.effectId)}
                        ondragend={fxDragEnd}>⠿</span>
                  <button type="button" class="ghost" disabled={index === 0}
                          aria-label={`Move ${effect.pluginName} earlier in the chain`}
                          title="Move earlier in the chain"
                          onclick={() => moveEffect(effect.effectId, index - 1)}>▲</button>
                  <button type="button" class="ghost" disabled={index === chain.length - 1}
                          aria-label={`Move ${effect.pluginName} later in the chain`}
                          title="Move later in the chain"
                          onclick={() => moveEffect(effect.effectId, index + 1)}>▼</button>
                  <PropertyToggle compact label="Byp" value={effect.bypassed} ariaLabel={`Bypass ${effect.pluginName}`}
                                  onchange={(on) => setEffectBypassed(effect.effectId, on)} />
                  <button type="button" class="toggle" disabled={!effect.hasProcessor}
                          class:on={$hostState.editorOpenPartId === effect.effectId}
                          title="Show the effect's own interface"
                          onclick={() => openEffectEditor(effect.effectId)}>Editor</button>
                  <button type="button" class="toggle"
                          class:on={$hostState.floatingEditorPartIds.includes(effect.effectId)}
                          disabled={!effect.hasProcessor}
                          title="Pop this effect's interface out into its own window"
                          onclick={() => ($hostState.floatingEditorPartIds.includes(effect.effectId)
                                            ? closeEditorWindow(effect.effectId)
                                            : floatEditor(effect.effectId))}>⧉</button>
                  <button type="button" class="toggle" disabled={!effect.hasProcessor}
                          class:on={paramTargetId === effect.effectId}
                          title="Inspect this effect's parameters"
                          onclick={() => { paramTargetId = effect.effectId; selectDockTab('params'); }}>P</button>
                  <button type="button" class="ghost danger" title="Remove this effect"
                          onclick={() => removeEffect(effect.effectId)}>×</button>
                  <span class="fx-name" title={effect.pluginVendor}>
                    {effect.pluginName || 'Loading…'}{#if effect.unresolved} (missing){/if}
                  </span>
                </div>
              {/each}
            </div>
          {/snippet}

        {#if !focusedPart && dockTab !== 'rack' && dockTab !== 'surface'}
          <div class="empty-hint">Focus a rack part to edit it.</div>
        {/if}

        {#if dockTab === 'zone'}
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
        {:else if dockTab === 'midi'}
        {#if focusedPart}
          <!-- Where the part's MIDI comes from. The keyboard, or another part's chain output
               — after that part's zone, its arpeggiator, its echo — so an arp on one part can
               play the synth on another, and the source keeps playing its own instrument
               too. What arrives then goes through THIS part's zone and chain like keyboard
               notes would. Loops are refused before they are offered. -->
          <div class="midi-source" data-testid="host-midi-source">
            <label>MIDI from
              <select value={focusedPart.midiSourcePartId}
                      onchange={(e) => setPartMidiSource(focusedPart.partId, e.currentTarget.value)}>
                <option value="">Keyboard</option>
                {#each parts.filter((p) => p.partId !== focusedPart.partId) as source (source.partId)}
                  <option value={source.partId}
                          disabled={midiSourceWouldLoop($hostState.rack, focusedPart.partId, source.partId)}>
                    {partTitle(source)}{midiSourceWouldLoop($hostState.rack, focusedPart.partId, source.partId) ? ' (would loop)' : ''}
                  </option>
                {/each}
              </select>
            </label>
            {#if focusedPart.midiSourcePartId}
              <span class="dim">after that part's chain, then through this part's zone and chain</span>
            {/if}
          </div>
          <!-- The part's Stage 6 event chain: what shapes what arrives, and what replays it.
               Both are modes over the shared transport, which is why they live beside the zone
               rules rather than in a panel of their own. -->
          <!-- The part's MIDI inserts. What used to be a fixed row of note-shaping fields
               plus one arpeggiator is a chain you compose — see MidiChainPanel. -->
          <MidiChainPanel part={focusedPart} />
        {/if}
        {:else if dockTab === 'inserts'}
        {#if focusedPart}
          {@render effectChain(focusedPart.effects, focusedPart.partId,
                               `Inserts — ${partTitle(focusedPart)}${latencySuffix(focusedPart.latencyMs)}`)}
        {/if}
        {:else if dockTab === 'routing'}
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

            <!-- Total recall. A program number names a slot; it does not name a sound — the
                 sound moved the moment somebody edited it, or the moment the synth was
                 handed to somebody else. So the patch itself is kept: whatever the synth
                 dumps, byte for byte, sent home when the session opens.

                 Capture is armed rather than automatic, and that is not caution for its own
                 sake — a patch dump looks exactly like every other system-exclusive message
                 on the wire, so the window is the only thing that says which one you meant. -->
            <div class="hw-recall" data-testid="host-hardware-recall">
              <div class="hw-recall-head">
                <strong>Patch</strong>
                {#if focusedPart.hardwarePatchBytes > 0}
                  <span class="hw-patch-name">{focusedPart.hardwarePatchName}</span>
                  <span class="hw-patch-size">{patchSize(focusedPart.hardwarePatchBytes)}</span>
                {:else}
                  <span class="hw-patch-none">None captured</span>
                {/if}
              </div>

              {#if $hostPatchCapture.armed && $hostPatchCapture.partId === focusedPart.partId}
                <div class="hw-capturing" data-testid="host-patch-capturing">
                  <span class="hw-listen">Listening — send a patch dump from the synth.</span>
                  <span class="hw-heard">{$hostPatchCapture.messages} message{$hostPatchCapture.messages === 1 ? '' : 's'},
                    {patchSize($hostPatchCapture.bytes)}</span>
                  <input type="text" placeholder="Patch name" bind:value={patchName}
                         aria-label="Patch name" />
                  <button type="button" disabled={$hostPatchCapture.bytes === 0}
                          onclick={() => { finishHardwarePatchCapture(focusedPart.partId, patchName); patchName = ''; }}>Keep it</button>
                  <button type="button" class="ghost"
                          onclick={() => cancelHardwarePatchCapture()}>Cancel</button>
                </div>
              {:else}
                <div class="hw-recall-row">
                  <button type="button" title="Arm, then send a patch dump from the synth"
                          onclick={() => captureHardwarePatch(focusedPart.partId)}>Capture patch…</button>
                  <button type="button" disabled={focusedPart.hardwarePatchBytes === 0}
                          title="Send the captured patch to the synth now"
                          onclick={() => sendHardwarePatch(focusedPart.partId)}>Send patch</button>
                  <button type="button" class="ghost" disabled={focusedPart.hardwarePatchBytes === 0}
                          title="Forget the captured patch (the part stays hardware)"
                          onclick={() => clearHardwarePatch(focusedPart.partId)}>Forget</button>
                  <label class="hw-policy">On session open
                    <select value={focusedPart.hardwareRestore}
                            onchange={(e) => setHardwareRestorePolicy(focusedPart.partId, e.currentTarget.value)}>
                      <option value="ask">Ask first</option>
                      <option value="always">Send it</option>
                      <option value="never">Do nothing</option>
                    </select>
                  </label>
                </div>
              {/if}

              {#if $hostPatchSends[focusedPart.partId]}
                <div class="hw-sending" data-testid="host-patch-sending">
                  Sending… {$hostPatchSends[focusedPart.partId].sent} of {$hostPatchSends[focusedPart.partId].total}
                </div>
              {/if}

              <!-- Patch compare. The one thing that can be said about the bytes without
                   reading them: where two dumps of the same synth differ. "Is what's on the
                   part what I saved?" and "what did I change since?" — offsets a person who
                   knows the synth can read against its manual. -->
              {#if focusedPart.hardwarePatchBytes > 0}
                {@const candidates = $hostLibraryStore.records.filter((r) =>
                  r.sourceType === 'hardwarePatch'
                  && (!focusedPart.hardwarePatchTarget || r.targetCeId === focusedPart.hardwarePatchTarget))}
                {#if candidates.length > 0}
                  <div class="hw-compare-row" data-testid="host-patch-compare">
                    <label>Compare with
                      <select bind:value={compareRecordId}>
                        <option value="">(choose a saved patch)</option>
                        {#each candidates as r (r.recordId)}
                          <option value={r.recordId}>{r.name}</option>
                        {/each}
                      </select>
                    </label>
                    <button type="button" disabled={!compareRecordId}
                            onclick={() => compareHardwarePatch(focusedPart.partId, compareRecordId)}>Compare</button>
                  </div>
                {/if}
              {/if}
              {#if $hostPatchCompare && $hostPatchCompare.partId === focusedPart.partId}
                {@const c = $hostPatchCompare}
                <div class="hw-compare" data-testid="host-patch-compare-result">
                  <div class="hw-compare-head">
                    {#if c.identical}
                      <strong>Identical</strong> — {c.nameA} is byte for byte {c.nameB}
                    {:else}
                      <strong>{c.totalDifferences} byte{c.totalDifferences === 1 ? '' : 's'} differ</strong>
                      — {c.nameA} vs {c.nameB}
                      ({c.messagesA} message{c.messagesA === 1 ? '' : 's'}, {patchSize(c.bytesA)}
                      {#if c.messagesA !== c.messagesB || c.bytesA !== c.bytesB} vs {c.messagesB}, {patchSize(c.bytesB)}{/if})
                    {/if}
                    <button type="button" class="ghost" onclick={() => clearPatchCompare()}>×</button>
                  </div>
                  {#if !c.identical}
                    <div class="hw-compare-list">
                      {#each c.differences.slice(0, 48) as d, i (i)}
                        <span class="hw-diff">
                          <span class="hw-diff-where">msg {d.message} · {d.offset}</span>
                          <span class="hw-diff-bytes">{hex(d.before)} → {hex(d.after)}</span>
                        </span>
                      {/each}
                      {#if c.differences.length > 48 || c.truncated}
                        <span class="dim">… and more</span>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {:else if focusedPart && !focusedPart.hasInstrument && !focusedPart.unresolved}
          <div class="hw-config" data-testid="host-hardware-offer">
            <button type="button" title="Use this part for an external synth: MIDI out, optional audio return"
                    onclick={() => setHardwareConfig(focusedPart.partId, {})}>Use external hardware…</button>
          </div>
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
          {#if focusedPart && !focusedPart.hardware && $hostState.rack.returns.length === 0
               && focusedPart.outputChannels <= 2}
            <div class="empty-hint">
              Nothing to route yet — add a return for sends, or use a multi-output instrument
              for extra pairs. Group buses live in the Mixer.
            </div>
          {/if}
        {:else if dockTab === 'params'}
        <!-- The Stage 2 generic parameter view: the common, inspectable control surface the
             vendor editor is not — and the same registry hardware pages and macros will use. -->
        {#if paramTargetId && $hostParameters.partId === paramTargetId}
          <div class="param-view" data-testid="host-parameters">
            <div class="param-head">
              <strong>Parameters — {paramTargetName}</strong>
              <input type="search" placeholder="Search parameters…" bind:value={paramSearch} />
              <button type="button" class="toggle" class:on={paramAssignedOnly}
                      title="Only parameters already on a knob slot or macro"
                      data-testid="param-assigned-filter"
                      onclick={() => (paramAssignedOnly = !paramAssignedOnly)}>assigned</button>
              <button type="button" class="toggle" class:on={paramDiagnostics}
                      title="Show native IDs and indices"
                      onclick={() => (paramDiagnostics = !paramDiagnostics)}>ID</button>
            </div>
            {#each $hostParameters.warnings as warning (warning)}
              <div class="param-warning">{warning}</div>
            {/each}
            {#if visibleParameters.length === 0}
              <div class="empty-hint">
                {$hostParameters.parameters.length === 0
                  ? 'This instrument exposes no host-visible parameters.'
                  : 'Nothing matches the search.'}
              </div>
            {/if}
            {#snippet paramRow(parameter)}
                <!-- Draggable onto the controller drawing in the Surface tab: assigning
                     hardware is spatial work, and "this knob" is a position rather than a row
                     in a list. The row keeps working exactly as it did for everything else. -->
                <div class="param-row" class:assigned={assignedIds.has(parameter.id)}
                     draggable="true"
                     ondragstart={(e) => {
                       hostParamDrag.set({ partId: paramTargetId, parameterId: parameter.id,
                                           name: parameter.name });
                       e.dataTransfer?.setData('text/plain', parameter.name);
                       if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
                     }}
                     ondragend={() => hostParamDrag.set({ partId: '', parameterId: '', name: '' })}>
                  <span class="param-name" title={`${parameter.name} — drag onto a knob in the Surface tab`}>{parameter.name}</span>
                  {#if parameterControlKind(parameter) === 'toggle'}
                    <PropertyToggle compact value={parameter.value >= 0.5} ariaLabel={parameter.name}
                                    onchange={(on) => setParameter(paramTargetId, parameter.id, on ? 1 : 0)} />
                  {:else if parameterControlKind(parameter) === 'segments'}
                    <!-- Every value is one button — no slider travel, no dead zones. -->
                    <span class="param-segments" role="group" aria-label={parameter.name}>
                      {#each parameter.valueTexts as choice, i (i)}
                        <button type="button" class:on={stepIndexOf(parameter) === i} title={choice}
                                onclick={() => setParameter(paramTargetId, parameter.id,
                                                            i / (parameter.numSteps - 1))}>{choice}</button>
                      {/each}
                    </span>
                  {:else if parameterControlKind(parameter) === 'stepper'}
                    <!-- A countable set steps exactly; the value text between the arrows IS
                         the control, so what you read is what is selected. -->
                    <span class="param-stepper">
                      <button type="button" aria-label={`${parameter.name} previous value`}
                              disabled={stepIndexOf(parameter) <= 0}
                              onclick={() => nudgeParameterStep(parameter, -1)}>‹</button>
                      <button type="button" aria-label={`${parameter.name} next value`}
                              disabled={stepIndexOf(parameter) >= parameter.numSteps - 1}
                              onclick={() => nudgeParameterStep(parameter, 1)}>›</button>
                    </span>
                  {:else}
                    <input type="range" min="0" max="1" step={stepFor(parameter)} value={parameter.value}
                           aria-label={parameter.name}
                           onpointerdown={() => beginParameterGesture(paramTargetId, parameter.id)}
                           onpointerup={() => endParameterGesture(paramTargetId, parameter.id)}
                           oninput={(e) => setParameter(paramTargetId, parameter.id, Number(e.currentTarget.value))} />
                  {/if}
                  {#if editingParamId === parameter.id}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input class="param-edit" type="text" bind:value={editingParamText} autofocus
                           aria-label={`Type a value for ${parameter.name}`}
                           onkeydown={(e) => {
                             if (e.key === 'Enter') commitParamEdit(parameter);
                             if (e.key === 'Escape') editingParamId = null;
                           }}
                           onblur={() => (editingParamId = null)} />
                  {:else}
                    <span class="param-value" role="button" tabindex="-1"
                          title="Double-click to type a value"
                          ondblclick={() => beginParamEdit(parameter)}
                          onkeydown={(e) => e.key === 'Enter' && beginParamEdit(parameter)}>
                      {parameter.text}{parameter.label ? ` ${parameter.label}` : ''}</span>
                  {/if}
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
                  <button type="button" class="ghost quick-learn"
                          class:armed={armedParameterId === parameter.id}
                          data-testid="param-quick-learn"
                          title="Put this on a knob: click, then move a control on your MIDI keyboard"
                          onclick={() => quickLearnParameter(paramTargetId, parameter.id)}>⚡</button>
                  <!-- Pinned per plug-in CLASS, not per part: you reach for the same dozen on
                       the same synth whichever rack it is in today. -->
                  <button type="button" class="ghost param-pin"
                          class:on={$hostParameters.favourites.includes(parameter.id)}
                          data-testid="param-pin"
                          title={$hostParameters.favourites.includes(parameter.id)
                                   ? 'Unpin — stop keeping this at the top for this plug-in'
                                   : 'Pin to the top for this plug-in, in every session'}
                          onclick={() => toggleParameterFavourite(paramTargetId, parameter.id)}
                          >{$hostParameters.favourites.includes(parameter.id) ? '★' : '☆'}</button>
                </div>
                {#if paramDiagnostics}
                  <div class="param-diag">{parameter.id} · index {parameter.index}{parameter.automatable ? '' : ' · not automatable'}{parameter.meta ? ' · meta' : ''}</div>
                {/if}
            {/snippet}

            <div class="param-list">
              <!-- Two short lists before the four hundred rows. Pinned is what you said you
                   use on this plug-in; Recent is what you last reached for in its own window,
                   which the host notices without being asked. Hidden while searching: you are
                   already telling it what you want. -->
              {#if !paramSearch.trim() && !paramAssignedOnly}
                {#each [['Pinned', shortlist.pinned], ['Recent', shortlist.recent]] as [heading, rows] (heading)}
                  {#if rows.length > 0}
                    <div class="param-shortlist" data-testid={`param-${heading.toLowerCase()}`}>
                      <span class="param-shortlist-head">{heading}</span>
                      {#each rows as parameter (parameter.id)}
                        {@render paramRow(parameter)}
                      {/each}
                    </div>
                  {/if}
                {/each}
              {/if}
              {#each parameterGroups as group (group.name)}
                {#if parameterGroups.length > 1}
                  <button type="button" class="param-group"
                          aria-expanded={groupsForcedOpen || openGroups[group.name] === true}
                          onclick={() => (openGroups[group.name] = !openGroups[group.name])}>
                    <span class="param-group-arrow">{groupsForcedOpen || openGroups[group.name] ? '▾' : '▸'}</span>
                    {group.name}
                    <span class="param-group-count">{group.parameters.length}{
                      group.parameters.some((p) => assignedIds.has(p.id)) ? ' · assigned' : ''}</span>
                  </button>
                {/if}
                {#if groupsForcedOpen || openGroups[group.name] || parameterGroups.length <= 1}
                {#each group.parameters as parameter (parameter.id)}
                {@render paramRow(parameter)}
                {/each}
                {/if}
              {/each}
            </div>
          </div>
        {/if}
        {:else if dockTab === 'surface'}
          <HostSurfacePanel />
        {:else if dockTab === 'rack'}
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
        {/if}
      </div>
    {/if}
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
  .surface-row { color: #9aa5b1; font-size: 11px; align-items: center; }
  .surface-dot { width: 7px; height: 7px; border-radius: 50%; background: #5c6672;
                 display: inline-block; flex: 0 0 auto; }
  .surface-dot.connected { background: #35c46f; }
  .surface-dot.connecting { background: #d9a13c; }
  .surface-dot.heldElsewhere { background: #d9a13c; }
  .surface-dot.failed { background: #e05656; }
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
  .library-id.clickable { cursor: pointer; }
  .library-id.clickable:hover .library-name { color: #7fb4e0; }
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

  /* The dock: a strip of its own, never part of the columns' scroll. Collapsed it is just
     the tab bar, so the gesture that opened it is the gesture that gets the space back. */
  .host-dock {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-top: 1px solid #3b4652;
    background: #171a1d;
  }
  .host-dock.collapsed { height: auto; }
  .dock-grip {
    height: 6px;
    margin-top: -3px;
    cursor: ns-resize;
    touch-action: none;
    background: transparent;
  }
  .dock-grip:hover { background: #2c6ca8; }
  .dock-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 14px;
    border-bottom: 1px solid #2c343d;
  }
  .dock-tab {
    background: none;
    border: 1px solid transparent;
    border-radius: 4px 4px 0 0;
    color: #9aa5b1;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .dock-tab:hover { color: #d6dbe0; }
  .dock-tab.on { color: #fff; background: #24313d; border-color: #5b9bd5; }
  .dock-subject {
    flex: 1;
    text-align: right;
    color: #7d8894;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dock-collapse { padding: 2px 8px; }
  .dock-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 14px 12px;
  }
  /* Inside the dock these blocks are the content, not one more section in a stack: the rule
     that separated them from what came above has nothing above it any more. */
  .dock-body > .fx-chain:first-of-type,
  .dock-body > .macros:first-of-type,
  .dock-body > .returns:first-of-type,
  .dock-body > .sends:first-of-type,
  .dock-body > .outputs:first-of-type,
  .dock-body > .hw-config:first-of-type { border-top: none; padding-top: 0; }

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

  .view-switch { display: flex; gap: 4px; margin-left: auto; }

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
    align-items: center;
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
  .part-name { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preset-walk { display: inline-flex; align-items: center; gap: 2px; margin-right: 4px; }
  .preset-walk .ghost { padding: 0 6px; font-size: 13px; line-height: 1.2; }
  .preset-name { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                 font-size: 11px; color: #9aa5b1; }
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
  .instrument-id { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .instrument-name { font-weight: 600; }
  .instrument-vendor { color: #7d8894; font-size: 11px; }

  .scan-paths {
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
  .dim { color: #7d8894; font-size: 11px; }

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
  .param-group { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left;
                 background: #161e27; border: 1px solid #232c36; border-radius: 4px;
                 color: #9aa5b1; font-size: 11px; font-weight: 600; padding: 4px 8px;
                 cursor: pointer; }
  .param-row { display: flex; align-items: center; gap: 8px; }
  .param-pin { flex: none; padding: 0 3px; color: #6d7883; font-size: 12px; line-height: 16px; }
  .param-pin.on { color: #e0c060; }
  /* The two short lists sit above the groups and read as a landing strip rather than as more
     of the same list — a rule under each, and a heading small enough not to compete with the
     group headings below. */
  .param-shortlist { display: flex; flex-direction: column; gap: 2px; padding-bottom: 4px;
                     margin-bottom: 4px; border-bottom: 1px solid #2c343d; }
  .param-shortlist-head { color: #7d8894; font-size: 10px; text-transform: uppercase;
                          letter-spacing: 0.06em; }
  .param-segments { display: inline-flex; gap: 2px; flex: 1; min-width: 0; }
  .param-segments button { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
                           white-space: nowrap; font-size: 10px; padding: 2px 4px;
                           background: #1c2630; color: #9aa5b1; border: 1px solid #2c3742;
                           border-radius: 3px; cursor: pointer; }
  .param-segments button.on { background: #2c6ca8; color: #fff; border-color: #2c6ca8; }
  .param-stepper { display: inline-flex; gap: 2px; }
  .param-stepper button { font-size: 12px; padding: 0 8px; background: #1c2630; color: #9aa5b1;
                          border: 1px solid #2c3742; border-radius: 3px; cursor: pointer; }
  .param-stepper button:disabled { opacity: 0.35; cursor: default; }
  .param-group-arrow { color: #66707b; }
  .param-group-count { margin-left: auto; color: #66707b; font-weight: 400; }
  .param-row.assigned .param-name { color: #7fb4e0; }
  .quick-learn.armed { color: #d9a13c; border-color: #d9a13c;
                       animation: midi-learn-pulse 1s ease-in-out infinite; }
  .param-value { cursor: text; }
  .param-edit { width: 90px; font-size: 11px; background: #10161c; color: #d6dbe0;
                border: 1px solid #3d81c4; border-radius: 3px; padding: 1px 4px; }
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
  .fx-chain, .macros, .sends, .outputs, .returns, .hw-config {
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
  .midi-source { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; padding-bottom: 6px; }
  .midi-source label { display: flex; align-items: center; gap: 6px; }
  .hw-recall {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #2c343d;
  }
  .hw-recall-head { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
  .hw-patch-name { color: #d8e0e8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hw-patch-size, .hw-patch-none { color: #7d8894; font-size: 11px; }
  .hw-recall-row, .hw-capturing { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; }
  .hw-policy { display: flex; align-items: center; gap: 4px; margin-left: auto; font-size: 11px; color: #9aa5b1; }
  /* The armed state has to read as armed from across a room: this is the moment somebody is
     standing at the synth pressing its own Send button, not looking at the screen. */
  .hw-capturing {
    padding: 6px 8px;
    border: 1px solid #4a6a7a;
    border-radius: 4px;
    background: #1b262c;
  }
  /* A patch name is two words. Left to flex freely it became a text field the width of the
     whole dock, which reads as a place to write a paragraph. */
  .hw-capturing input[type='text'] { flex: 1; min-width: 90px; max-width: 220px; }
  .hw-listen { color: #9fd0e4; }
  .hw-heard { color: #7d8894; font-size: 11px; }
  .hw-sending { font-size: 11px; color: #9fd0e4; }
  .hw-compare-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .hw-compare-row label { display: flex; align-items: center; gap: 6px; }
  .hw-compare { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid #2c343d; border-radius: 4px; background: #14191e; font-size: 12px; }
  .hw-compare-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .hw-compare-head .ghost { margin-left: auto; }
  /* Offsets read as a table without being one: fixed-width pairs that wrap. */
  .hw-compare-list { display: flex; flex-wrap: wrap; gap: 4px 12px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; }
  .hw-diff { display: inline-flex; gap: 8px; }
  .hw-diff-where { color: #7d8894; min-width: 80px; }
  .hw-diff-bytes { color: #d8e0e8; }
  .patch-prompt {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 6px 10px;
    border: 1px solid #4a6a7a;
    border-radius: 4px;
    background: #1b262c;
    font-size: 12px;
  }
  .patch-prompt-text { flex: 1; min-width: 200px; color: #cfe0ea; }
  .fx-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .tile-button {
    flex: none;
    display: inline-flex;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: none;
    cursor: pointer;
  }
  .tile-button:hover { outline: 1px solid #5b9bd5; outline-offset: 1px; }
  .tile-revert { flex: none; padding: 0 3px; font-size: 12px; line-height: 16px; }

  .fx-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  /* The insertion line is drawn on the row the pointer is over, on the side it will land —
     an inset shadow rather than a real element, so the rows never shift while you aim. */
  .fx-row.drop-before { box-shadow: inset 0 2px 0 0 #5b9bd5; }
  .fx-row.drop-after  { box-shadow: inset 0 -2px 0 0 #5b9bd5; }
  .fx-row.lifted { opacity: 0.45; }
  .fx-grip {
    flex: none;
    cursor: grab;
    padding: 0 2px;
    color: #6d7883;
    font-size: 13px;
    line-height: 1;
    user-select: none;
  }
  .fx-grip:hover { color: #d6dbe0; }
  .fx-row .ghost { flex: none; padding: 0 4px; font-size: 10px; line-height: 16px; }
  /* Running is green, bypassed is red. Struck-through text said "deleted" — the one state
     this row can never be in — and it took reading the Byp button to find out otherwise. */
  .fx-name { flex: 1; color: #8fc4a8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx-row.bypassed .fx-name { color: #d68a8a; }
  .fx-row.unresolved .fx-name { color: #d6a3a3; font-style: italic; }
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
  .midi-learn { font-size: 10px; color: #9aa5b1; }
  .midi-learn.armed { color: #d9a13c; border-color: #d9a13c; animation: midi-learn-pulse 1s ease-in-out infinite; }
  @keyframes midi-learn-pulse { 50% { opacity: 0.45; } }
  .midi-cc { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: #7fb4e0;
             background: #22303c; border-radius: 3px; padding: 1px 4px; white-space: nowrap; }

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
