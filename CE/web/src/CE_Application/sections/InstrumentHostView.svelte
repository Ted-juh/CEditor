<script>
  import '../styles/hostage-theme.css';
  import HostageLogo from '../components/HostageLogo.svelte';
  /**
   * InstrumentHostView.svelte — the Hostage workspace.
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
  import { onDestroy, tick } from 'svelte';
  import {
    hostState,
    hostMidiActivity, hostSurface, hostScanLog, hostLastError, hostAudioDevices, initInstrumentHostBridge,
    filterInstruments, filterEffects, scanForInstruments, addScanPath, browseScanPath, removeScanPath, clearQuarantine,
    addRackPart, removeRackPart, moveRackPart, focusRackPart, loadInstrument, unloadInstrument,
    setPartMixer, setPartMidiRules, hostPanic, openEditor, closeEditor, floatEditor, closeEditorWindow,
    requestAudioDevices, setAudioDevice, setMidiInputEnabled,
    hostProject, hostBuild, requestHostProject, setHostProject, buildHostProduct,
    hostParameters, emptyHostParameters, filterParameters, requestParameters,
    parameterControlKind, setParameterText, groupParameters, assignedParameterIds, quickLearnParameter,
    setParameter, resetParameter, beginParameterGesture, endParameterGesture,
    addControlPage, removeControlPage, renameControlPage, assignControlSlot, clearControlSlot, setControlSlotValue,
    hostMidiLearn, learnControlSlotMidi, cancelMidiLearn, clearControlSlotMidi,
    hostParamLearn, learnControlSlotParameter, cancelLearnControlSlotParameter,
    toggleParameterFavourite, parameterShortlist,
    hostArpStep,
    hostCanvasDrag,
    hostChordLearn, learnKeyChord, cancelKeyChordLearn, clearKeyChord,
    walkPartPreset,
    setPresetAudition, auditionLibraryRecord,
    startSoundComparison, stepSoundComparison, keepSoundComparison, cancelSoundComparison,
    generateControlPages,
    hostLibrary, requestLibrary, scanLibrary, browseLibraryPath, removeLibraryPath,
    saveUserPreset, saveRackToLibrary, saveChainToLibrary,
    setLibraryUserMetadata, removeLibraryRecord, loadLibraryRecord,
    addEffect, removeEffect, moveEffect, setEffectBypassed, openEffectEditor,
    reorderIndexForDrop, setPluginArtwork, clearPluginArtwork, customArtworkIds,
    hostParamDrag,
    addMacro, removeMacro, renameMacro, setMacroValue, addMacroTarget, removeMacroTarget, setMacroTargetOptions,
    addReturn, removeReturn, renameReturn, setReturnLevel, setSendLevel,
    setExtraOut, removeExtraOut, setHardwareConfig, clearHardware, sendHardwareProgram,
    setPartMidiSource, hostKeyboardMode, showPartRange, showKeyboardPlay, partColor, midiSourceWouldLoop,
    captureHardwarePatch, cancelHardwarePatchCapture, finishHardwarePatchCapture,
    clearHardwarePatch, sendHardwarePatch, setHardwareRestorePolicy,
    hostPatchCapture, hostPatchSends, hostPatchPrompt,
    hostPatchCompare, compareHardwarePatch, clearPatchCompare, hostLibrary as hostLibraryStore,
    transportPlay, transportContinue, transportStop, setTransportPosition,
    setTempo, setTimeSignature, setExternalClock,
    setPartArp, setPartMidiFx,
    midiSlotTypes, midiSlotLabels,
    addMidiSlot, removeMidiSlot, moveMidiSlot, setMidiSlotBypassed, setMidiSlotOptions,
    setStageLock, beginStageUnlock, cancelStageUnlock,
  } from '../stores/instrumentHost.js';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PerformancePanel from './PerformancePanel.svelte';
  import HostMixerPanel from './HostMixerPanel.svelte';
  import LayerGroupsPanel from './LayerGroupsPanel.svelte';
  import MidiChainPanel from './MidiChainPanel.svelte';
  import HostRackCanvas from './HostRackCanvas.svelte';
  import PluginTile from './PluginTile.svelte';
  import HostSurfacePanel from './HostSurfacePanel.svelte';
  import ProductPanel from './ProductPanel.svelte';
  import ReliabilityPanel from './ReliabilityPanel.svelte';
  import LicencePanel from './LicencePanel.svelte';
  import HostKeyboard from './HostKeyboard.svelte';
  import StageView from './StageView.svelte';
  import { noteName } from '../utils/pianoGeometry.js';
  import {
    restoreHostNavigation,
    storeHostNavigation,
    toggleHostUtility,
  } from '../utils/hostNavigation.js';
  import {
    clampDockHeight,
    preferredDockHeight,
    restoreDockHeights,
    storeDockHeights,
  } from '../utils/hostDockSizing.js';

  initInstrumentHostBridge();

  let search = $state('');
  let newScanPath = $state('');
  let paramSearch = $state('');
  let paramDiagnostics = $state(false);
  // Persisted with the Performance: the native side waits for the actual preset commit and
  // plays the configured phrase into that part alone. This view only edits the recipe.
  let audition = $derived($hostState.rack.presetAudition);
  let libraryQuery = $state('');
  let libraryType = $state('');
  let hostMode = $state('build');
  let buildHold = $state(false);
  let unlockRequested = $state(false);
  let buildHoldTimer;
  let pendingDestructive = $state('');
  let destructiveTimer;
  const restoredNavigation = restoreHostNavigation();
  let buildWorkspace = $state(restoredNavigation.workspace);
  let activeUtility = $state(restoredNavigation.utility);

  const buildWorkspaces = [
    { id: 'rack', label: 'Rack' },
    { id: 'performance', label: 'Performance' },
    { id: 'mixer', label: 'Mixer' },
    { id: 'layers', label: 'Layers' },
    { id: 'controller', label: 'Controller' },
  ];
  const hostUtilities = [
    { id: 'library', label: 'Library' },
    { id: 'devices', label: 'Audio & MIDI' },
    { id: 'project', label: 'Project' },
    { id: 'product', label: 'Product' },
    { id: 'health', label: 'Health' },
    { id: 'licence', label: 'Edition' },
  ];

  $effect(() => storeHostNavigation({ workspace: buildWorkspace, utility: activeUtility }));
  $effect(() => {
    const lockError = $hostLastError;
    if ($hostState.stageLocked) {
      hostMode = 'stage';
      if (unlockRequested && lockError.includes('Hold Build')) unlockRequested = false;
    }
    else if (unlockRequested) {
      unlockRequested = false;
      buildHold = false;
      hostMode = 'build';
    }
  });

  function enterStage() {
    if (hostMode === 'stage') return;
    hostLastError.set('');
    hostMode = 'stage';
    setStageLock(true);
  }

  function beginBuildHold(event) {
    if (hostMode !== 'stage' || buildHold) return;
    if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event?.preventDefault();
    hostLastError.set('');
    unlockRequested = false;
    buildHold = true;
    beginStageUnlock();
    clearTimeout(buildHoldTimer);
    buildHoldTimer = setTimeout(() => {
      if (!buildHold) return;
      buildHold = false;
      unlockRequested = true;
      setStageLock(false);
    }, 1000);
  }

  function cancelBuildHold(event) {
    if (event?.type === 'keyup' && event.key !== 'Enter' && event.key !== ' ') return;
    if (!buildHold) return;
    clearTimeout(buildHoldTimer);
    buildHold = false;
    cancelStageUnlock();
  }

  function guardedAction(key, action) {
    if (pendingDestructive === key) {
      clearTimeout(destructiveTimer);
      pendingDestructive = '';
      action();
      return;
    }
    pendingDestructive = key;
    clearTimeout(destructiveTimer);
    destructiveTimer = setTimeout(() => (pendingDestructive = ''), 5000);
  }

  onDestroy(() => {
    clearTimeout(buildHoldTimer);
    clearTimeout(destructiveTimer);
    if (buildHold) cancelStageUnlock();
  });
  let preparedUtility = '';
  $effect(() => {
    const utility = activeUtility;
    if (!utility) { preparedUtility = ''; return; }
    if (utility === preparedUtility) return;
    preparedUtility = utility;
    if (utility === 'library') requestLibrary(libraryQuery, libraryType);
    else if (utility === 'devices') requestAudioDevices();
    else if (utility === 'project') requestHostProject();
  });

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
  const restoredDockHeights = restoreDockHeights();
  let dockHeights = $state(restoredDockHeights);
  let dockHeight = $state(preferredDockHeight('midi'));
  let buildContentHeight = $state(0);
  let dockContentElement = $state(null);
  let dockFitRequest = 0;
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
    dockHeight = clampDockHeight(gripStartHeight + (gripStartY - event.clientY), buildContentHeight);
  }
  function gripUp() {
    if (!gripping) return;
    gripping = false;
    dockHeights = { ...dockHeights, [dockTab]: dockHeight };
  }

  async function fitDock(tab = dockTab, forgetManualHeight = false) {
    if (forgetManualHeight && dockHeights[tab] !== undefined) {
      const next = { ...dockHeights };
      delete next[tab];
      dockHeights = next;
    }
    const request = ++dockFitRequest;
    await tick();
    if (request !== dockFitRequest || tab !== dockTab || !dockOpen) return;
    const remembered = dockHeights[tab];
    const preferred = preferredDockHeight(tab, dockContentElement?.scrollHeight ?? 0, buildContentHeight);
    dockHeight = clampDockHeight(remembered ?? preferred, buildContentHeight);
  }

  function resetDockHeight() { void fitDock(dockTab, true); }

  $effect(() => storeDockHeights(dockHeights));

  function selectDockTab(id) {
    // Clicking the tab you are on collapses the dock — the same gesture that opened it.
    if (dockOpen && dockTab === id) { dockOpen = false; return; }
    dockTab = id;
    dockOpen = true;
  }


  function clickLibraryRow(record) {
    if (record.type === 'rack' || !record.available) return;
    // One click, loaded: into the focused part, or as the first part of an empty rack.
    const action = focusedPart ? 'focused' : 'add';
    if (audition.enabled && record.type === 'preset')
      auditionLibraryRecord(record.recordId, action);
    else
      loadLibraryRecord(record.recordId, action);
  }

  function setLibraryFilter(query, type) {
    libraryQuery = query;
    libraryType = type;
    requestLibrary(query, type);
  }

  function chooseUtility(id) {
    activeUtility = toggleHostUtility(activeUtility, id);
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
  let soundComparison = $derived($hostState.rack.soundComparison);
  let comparisonCandidates = $derived($hostLibrary.records.filter((record) =>
    record.type === 'preset' && record.available && record.sourceType !== 'hardwarePatch'
      && focusedPart?.hasInstrument && !focusedPart.hardware
      && record.targetCeId === focusedPart.pluginCeId).slice(0, 20));
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
  ]);

  // What the dock is editing, on the tab bar, so the answer is in one fixed place however far
  // the body has been scrolled.
  let dockSubject = $derived(dockTab === 'rack' ? 'Master, returns and macros'
                             : dockTab === 'params' ? (paramTargetName || 'Parameters')
                             : focusedPart ? partTitle(focusedPart) : 'Nothing focused');

  // A tab that stops applying must not leave the dock showing nothing — unloading the part
  // whose parameters you were reading is the ordinary way to get here.
  $effect(() => {
    if (!dockTabs.some((tab) => tab.id === dockTab))
      dockTab = dockTabs[0]?.id ?? 'rack';
  });

  $effect(() => {
    if (!dockOpen) return;
    // These are the changes that materially alter a tab's natural height. Transport pushes do
    // not belong here: measuring the dock on every beat would turn layout into a metronome.
    const contentStamp = [
      dockTab, buildContentHeight, focusedPartId, paramTargetId,
      focusedPart?.midiSlots?.length ?? 0,
      focusedPart?.effects?.length ?? 0,
      visibleParameters.length,
      $hostState.rack.returns.length,
      $hostState.rack.macros.length,
    ].join(':');
    contentStamp;
    void fitDock(dockTab);
  });

  function toggleEditor(part) {
    if ($hostState.editorOpenPartId === part.partId) closeEditor();
    else openEditor(part.partId);
  }

  /** L20 / C / R35 — how a pan reads on a desk, not -0.2. */
  function panLabel(pan) {
    const amount = Math.round(Math.abs(pan) * 100);
    return amount === 0 ? 'C' : `${pan < 0 ? 'L' : 'R'}${amount}`;
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
    <div class="host-brand">
      <span class="host-logo-frame">
        <HostageLogo />
      </span>
      <span class="host-purpose">PLUG-IN HOST · LIVE STAGE</span>
      <span class="host-audio-status" class:on={$hostState.audio.running} title={audioLine}>
        <span class="host-status-dot"></span>{audioLine}
      </span>
    </div>

    <div class="host-mode" role="group" aria-label="Workspace mode">
      <button type="button" class="mode-button" class:on={hostMode === 'build'} class:holding={buildHold}
              title={hostMode === 'stage' ? 'Hold for one second to leave Stage Lock' : 'Build workspace'}
              aria-label={hostMode === 'stage' ? 'Hold for one second to leave Stage Lock' : 'Build workspace'}
              onpointerdown={beginBuildHold} onpointerup={cancelBuildHold}
              onpointerleave={cancelBuildHold} onpointercancel={cancelBuildHold}
              onkeydown={beginBuildHold} onkeyup={cancelBuildHold}
              onclick={() => { if (hostMode !== 'stage') hostMode = 'build'; }}
              data-testid="host-mode-build">{buildHold ? 'Hold…' : 'Build'}</button>
      <button type="button" class="mode-button" class:on={hostMode === 'stage'}
              onclick={enterStage} data-testid="host-mode-stage">Stage</button>
    </div>

    {#if hostMode === 'build'}
      <div class="host-command-area">
      <!-- The transport is always visible: it is the one clock everything else follows,
           and a player needs to see whether it is running without opening a panel. -->
        <div class="host-transport-group">
          <span class="header-group-label">Transport</span>
          <span class="transport" data-testid="host-transport">
            <button type="button" class="toggle" class:on={transport.playing}
                    title={transport.playing ? 'Stop' : 'Play from the beginning'}
                    onclick={() => (transport.playing ? transportStop() : transportPlay())}
                    data-testid="host-transport-play">{transport.playing ? '■' : '▶'}</button>
            <button type="button" class="ghost transport-action" disabled={transport.playing}
                    title="Continue from the current position" aria-label="Continue playback"
                    onclick={() => transportContinue()}>▷</button>
            <button type="button" class="ghost transport-action"
                    title="Return to the beginning" aria-label="Return transport to start"
                    onclick={() => setTransportPosition(0)}>↤</button>
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
        </div>
        <div class="host-global-actions">
          {#if $hostState.scanning}
            <span class="scan-status" role="status">Scanning plug-ins… {lastScanLine}</span>
          {:else if lastScanLine}
            <span class="scan-status">{lastScanLine}</span>
          {/if}
          <button type="button" class="panic" title="All notes off, every part" onclick={() => hostPanic()}>
            Panic
          </button>
        </div>
      </div>
    {:else}
      <div class="stage-header-actions">
        <span class="stage-header-hint">
          {$hostState.stageLocked ? 'Stage Lock active · hold Build to edit' : 'Engaging Stage Lock…'}
        </span>
      </div>
    {/if}
  </header>

  {#if hostMode === 'stage'}
    <StageView />
  {:else}
  <nav class="build-navigation" aria-label="Build navigation">
    <div class="workspace-tabs" role="group" aria-label="Primary workspace">
      {#each buildWorkspaces as workspace (workspace.id)}
        <button type="button" class="navigation-tab" class:on={buildWorkspace === workspace.id}
                aria-current={buildWorkspace === workspace.id ? 'page' : undefined}
                data-testid={`host-workspace-${workspace.id}`}
                onclick={() => (buildWorkspace = workspace.id)}>{workspace.label}</button>
      {/each}
    </div>
    <div class="utility-tabs" role="group" aria-label="Utilities">
      <span class="navigation-label">Utilities</span>
      {#each hostUtilities as utility (utility.id)}
        <button type="button" class="utility-tab" class:on={activeUtility === utility.id}
                class:warn={utility.id === 'health'
                            && ($hostState.reliability.recovery.interrupted
                                || $hostState.reliability.safeMode.level !== 'normal')}
                data-testid={`host-utility-${utility.id}`}
                onclick={() => chooseUtility(utility.id)}>{utility.label}</button>
      {/each}
    </div>
  </nav>

  <div class="build-content" bind:clientHeight={buildContentHeight}>
  {#if activeUtility}
  <aside class="utility-drawer" data-testid="host-utility-drawer"
         aria-label={`${hostUtilities.find((utility) => utility.id === activeUtility)?.label ?? 'Utility'} drawer`}>
    <div class="utility-drawer-head">
      <strong>{hostUtilities.find((utility) => utility.id === activeUtility)?.label}</strong>
      <button type="button" class="ghost utility-close" aria-label="Close utility drawer"
              data-testid="host-utility-close" onclick={() => (activeUtility = '')}>×</button>
    </div>
    <div class="utility-drawer-body">
  {#if activeUtility === 'devices'}
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

  {#if activeUtility === 'product'}
    <ProductPanel />
  {/if}

  {#if activeUtility === 'health'}
    <ReliabilityPanel />
  {/if}

  {#if activeUtility === 'licence'}
    <LicencePanel />
  {/if}

  {#if activeUtility === 'library'}
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
        <button type="button" class="toggle" class:on={audition.enabled}
                class:playing={audition.playing} data-testid="host-audition"
                title="When on, clicking a preset loads it and plays the configured phrase on that part"
                onclick={() => setPresetAudition({ enabled: !audition.enabled })}>
          {audition.playing ? '♪ Playing…' : '♪ Audition'}
        </button>
        <button type="button" onclick={() => scanForInstruments()} disabled={$hostState.scanning}
                data-testid="host-scan">
          {$hostState.scanning ? 'Scanning plug-ins…' : 'Scan plug-ins'}
        </button>
        <button type="button" onclick={() => scanLibrary()} data-testid="host-scan-library">Scan presets</button>
        <button type="button" onclick={() => browseLibraryPath()}>Add folder…</button>
        <span class="library-counts">{$hostLibrary.counts.presets} presets · {$hostLibrary.counts.chains} chains · {$hostLibrary.counts.racks} racks</span>
      </div>

      {#if audition.enabled}
        <div class="audition-config" data-testid="host-audition-config">
          <strong>Audition phrase</strong>
          <label>Phrase
            <select value={audition.phrase}
                    onchange={(e) => setPresetAudition({ phrase: e.currentTarget.value })}>
              <option value="single">Single note</option>
              <option value="chord">Major chord</option>
              <option value="scale">Major scale</option>
              <option value="riff">Short riff</option>
            </select>
          </label>
          <label>Root
            <span class="number-with-note">
              <input type="number" min="0" max="127" value={audition.rootNote}
                     onchange={(e) => setPresetAudition({ rootNote: Number(e.currentTarget.value) })} />
              <small>{noteName(audition.rootNote)}</small>
            </span>
          </label>
          <label>Velocity
            <input type="number" min="1" max="127" value={audition.velocity}
                   onchange={(e) => setPresetAudition({ velocity: Number(e.currentTarget.value) })} />
          </label>
          <label>Length
            <span class="number-unit"><input type="number" min="40" max="4000" step="10"
                     value={audition.noteLengthMs}
                     onchange={(e) => setPresetAudition({ noteLengthMs: Number(e.currentTarget.value) })} /><small>ms</small></span>
          </label>
          {#if audition.phrase === 'scale' || audition.phrase === 'riff'}
            <label>Gap
              <span class="number-unit"><input type="number" min="0" max="2000" step="10"
                       value={audition.gapMs}
                       onchange={(e) => setPresetAudition({ gapMs: Number(e.currentTarget.value) })} /><small>ms</small></span>
            </label>
          {/if}
          <span class="audition-help">Click a preset name to load and hear it.</span>
        </div>
      {/if}

      {#if soundComparison.active}
        <div class="sound-compare" data-testid="host-sound-comparison">
          <span class="compare-slot">{soundComparison.index + 1}<small>/{soundComparison.count}</small></span>
          <span class="compare-copy">
            <small>Sound Comparison · original: {soundComparison.originalName}</small>
            <strong>{soundComparison.name || 'Preset unavailable'}</strong>
          </span>
          <button type="button" class="ghost" title="Previous preset"
                  onclick={() => stepSoundComparison(-1)}>‹ Previous</button>
          <button type="button" class="ghost" title="Next preset"
                  onclick={() => stepSoundComparison(1)}>Next ›</button>
          <button type="button" class="compare-keep" onclick={() => keepSoundComparison()}>
            Keep this sound
          </button>
          <button type="button" class="ghost" onclick={() => cancelSoundComparison()}>
            Cancel · restore original
          </button>
        </div>
      {/if}

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
        <button type="button" data-testid="host-start-sound-comparison"
                disabled={soundComparison.active || comparisonCandidates.length < 2}
                title={comparisonCandidates.length >= 2
                  ? `Compare ${comparisonCandidates.length} visible presets with the audition phrase`
                  : 'Show at least two presets for the focused instrument'}
                onclick={() => startSoundComparison(focusedPart.partId,
                  comparisonCandidates.map((record) => record.recordId))}>
          Compare visible ({comparisonCandidates.length})
        </button>
      </div>

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

      {#if $hostLibrary.records.length === 0}
        <div class="empty-hint">
          {$hostLibrary.counts.total === 0
            ? 'Nothing in the library yet — scan presets, or capture the focused part.'
            : 'Nothing matches the search.'}
        </div>
      {/if}

      <div class="library-list">
        {#each $hostLibrary.records as record (record.recordId)}
          <div class="library-row" class:unavailable={!record.available}
               class:comparing={soundComparison.active && soundComparison.recordId === record.recordId}>
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
                          : audition.enabled && record.type === 'preset'
                            ? 'Click: load into the focused part and audition'
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
              <button type="button" class="ghost danger" class:confirming={pendingDestructive === `library-record:${record.recordId}`}
                      title={pendingDestructive === `library-record:${record.recordId}` ? 'Click again to confirm' : 'Remove this record'}
                      onclick={() => guardedAction(`library-record:${record.recordId}`,
                        () => removeLibraryRecord(record.recordId))}>
                {pendingDestructive === `library-record:${record.recordId}` ? 'Confirm' : '×'}
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if activeUtility === 'project'}
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
    </div>
  </aside>
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

  {#if buildWorkspace === 'rack' || buildWorkspace === 'mixer' || buildWorkspace === 'layers'}
    <HostKeyboard />
  {/if}

  {#if buildWorkspace === 'performance'}
    <main class="primary-workspace" data-testid="host-primary-performance">
      <PerformancePanel />
    </main>
  {:else if buildWorkspace === 'mixer'}
    <main class="primary-workspace" data-testid="host-primary-mixer">
      <HostMixerPanel />
    </main>
  {:else if buildWorkspace === 'layers'}
    <main class="primary-workspace" data-testid="host-primary-layers">
      <LayerGroupsPanel />
    </main>
  {:else if buildWorkspace === 'controller'}
    <main class="primary-workspace controller-workspace" data-testid="host-primary-controller">
      <HostSurfacePanel />
    </main>
  {:else}
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

      {#each rackView === 'list' ? parts : [] as part, partIndex (part.partId)}
        <div class="part" class:focused={part.partId === focusedPartId} class:disabled={!part.enabled}>
          <!-- The plug-in's face fills the row's whole height on the left, beside everything
               rather than above it. A snapshot is a picture of a window, and a 24px square of
               one was a smudge; at the row's height it is recognisable from across the desk,
               which is the point of having it. -->
          {#if part.hasInstrument || part.unresolved}
            <button type="button" class="part-art" title={part.pluginName || 'Focus this part'}
                    data-testid="part-art"
                    onclick={() => focusRackPart(part.partId)}>
              <PluginTile ceId={part.pluginCeId} name={part.pluginName} vendor={part.pluginVendor} fill />
            </button>
          {/if}
          <div class="part-body">
          <div class="part-head">
            <button type="button" class="part-main" onclick={() => focusRackPart(part.partId)}>
              <span class="part-name">{partTitle(part)}</span>
              <span class="part-vendor">{part.pluginVendor || (part.hardware ? part.midiOutputName : 'Ready for an instrument')}</span>
            </button>
            <span class="part-states" aria-label="Part state">
              {#if part.unresolved}<span class="part-state problem">Missing</span>{/if}
              {#if !part.enabled}<span class="part-state off">Off</span>{/if}
              {#if part.mute}<span class="part-state muted">Muted</span>{/if}
              {#if part.solo}<span class="part-state soloed">Solo</span>{/if}
            </span>
            <details class="part-actions" data-testid="part-actions">
              <summary title="Editor and part actions" aria-label={`Actions for ${partTitle(part)}`}>•••</summary>
              <div class="part-action-menu">
                <button type="button" class="ghost" disabled={partIndex === 0}
                        onclick={() => moveRackPart(part.partId, partIndex - 1)}>Move up</button>
                <button type="button" class="ghost" disabled={partIndex === parts.length - 1}
                        onclick={() => moveRackPart(part.partId, partIndex + 1)}>Move down</button>
                {#if part.hasInstrument}
                  <button type="button" class="toggle" class:on={$hostState.editorOpenPartId === part.partId}
                          title="Show the plug-in's own interface in the native pane"
                          onclick={() => toggleEditor(part)}>Editor</button>
                  <button type="button" class="toggle"
                          class:on={$hostState.floatingEditorPartIds.includes(part.partId)}
                          data-testid="part-float-editor"
                          title="Pop the plug-in's interface out into its own window"
                          onclick={() => ($hostState.floatingEditorPartIds.includes(part.partId)
                                            ? closeEditorWindow(part.partId)
                                            : floatEditor(part.partId))}>Floating editor</button>
                  <button type="button" class="ghost" class:confirming={pendingDestructive === `unload:${part.partId}`}
                          title={pendingDestructive === `unload:${part.partId}`
                            ? 'Click again to confirm unload' : 'Unload the instrument, keep the part'}
                          onclick={() => guardedAction(`unload:${part.partId}`,
                            () => unloadInstrument(part.partId))}>
                    {pendingDestructive === `unload:${part.partId}` ? 'Confirm unload' : 'Unload instrument'}
                  </button>
                {/if}
                <button type="button" class="ghost danger" class:confirming={pendingDestructive === `part:${part.partId}`}
                        title={pendingDestructive === `part:${part.partId}`
                          ? 'Click again to confirm removal' : 'Remove this part'}
                        onclick={() => guardedAction(`part:${part.partId}`,
                          () => removeRackPart(part.partId))}>
                  {pendingDestructive === `part:${part.partId}` ? 'Confirm remove' : 'Remove part'}
                </button>
              </div>
            </details>
          </div>
          <div class="part-performance">
            {#if (part.hasInstrument && !part.hardware) || part.hardware}
              <!-- Preset walking stays in the performance layer: it changes the sound, but not
                   the rack structure. Its fixed centre prevents a long preset name from
                   pushing Mute, Solo or the faders away. -->
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
            <button type="button" class="toggle range-button"
                    class:on={$hostKeyboardMode.mode === 'range' && $hostKeyboardMode.partId === part.partId}
                    style={`--part-color:${partColor(partIndex)}`}
                    data-testid="part-range"
                    title="Show this part's key range on the keyboard above — drag its edges to set the split"
                    onclick={() => ($hostKeyboardMode.mode === 'range' && $hostKeyboardMode.partId === part.partId
                                      ? showKeyboardPlay() : showPartRange(part.partId))}>
              {noteName(part.keyLow)}–{noteName(part.keyHigh)}
            </button>
            <button type="button" class="toggle" class:on={part.enabled} title="Part enabled (off panics its notes)"
                    onclick={() => setPartMixer(part.partId, { enabled: !part.enabled })}>Active</button>
            <button type="button" class="toggle" class:on={part.mute} title="Mute (audio only; notes keep running)"
                    onclick={() => setPartMixer(part.partId, { mute: !part.mute })}>Mute</button>
            <button type="button" class="toggle" class:on={part.solo} title="Solo"
                    onclick={() => setPartMixer(part.partId, { solo: !part.solo })}>Solo</button>
            <!-- Two sliders with nothing written on them were two sliders nobody could name.
                 The word is the label; the number is in the tooltip, where it is wanted
                 while dragging and not otherwise. -->
            <label class="mini" title={`Volume ${part.volume.toFixed(2)} (1.00 is unity)`}>
              <span class="mini-label">Vol</span>
              <input type="range" min="0" max="2" step="0.01" value={part.volume} aria-label="Volume"
                     oninput={(e) => setPartMixer(part.partId, { volume: Number(e.currentTarget.value) })} />
            </label>
            <label class="mini" title={`Pan ${panLabel(part.pan)}`}>
              <span class="mini-label">Pan</span>
              <input type="range" min="-1" max="1" step="0.01" value={part.pan} aria-label="Pan"
                     oninput={(e) => setPartMixer(part.partId, { pan: Number(e.currentTarget.value) })} />
            </label>
            </div>
          </div>
          </div>
        </div>
      {/each}

      <!-- Splits and layers as a picture live on the keyboard at the top now — press Range on
           a part and it grows to all 128 keys with every range drawn beneath. One keyboard,
           one geometry, instead of a second strip down here that never lined up with it. -->

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
              <button type="button" class="ghost danger" class:confirming={pendingDestructive === `scan-path:${path}`}
                      title={pendingDestructive === `scan-path:${path}` ? 'Click again to confirm' : 'Remove this scan folder'}
                      onclick={() => guardedAction(`scan-path:${path}`, () => removeScanPath(path))}>
                {pendingDestructive === `scan-path:${path}` ? 'Confirm' : '×'}
              </button>
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
                <input type="text" class="page-name" value={page.name}
                       aria-label="Control page name"
                       title={page.generated ? 'Generated — regenerating replaces this page' : 'Rename control page'}
                       onfocus={() => (selectedPageId = page.pageId)}
                       onclick={() => (selectedPageId = page.pageId)}
                       onchange={(e) => renameControlPage(page.pageId, e.currentTarget.value)} />
                {#if page.generated}<span class="page-auto">auto</span>{/if}
                <button type="button" class="ghost danger" class:confirming={pendingDestructive === `page:${page.pageId}`}
                        title={pendingDestructive === `page:${page.pageId}` ? 'Click again to confirm' : 'Remove this page'}
                        onclick={() => guardedAction(`page:${page.pageId}`, () => removeControlPage(page.pageId))}>
                  {pendingDestructive === `page:${page.pageId}` ? 'Confirm' : '×'}
                </button>
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
                    <button type="button" class="ghost danger" class:confirming={pendingDestructive === `slot:${selectedPage.pageId}:${slot.slotId}`}
                            title={pendingDestructive === `slot:${selectedPage.pageId}:${slot.slotId}` ? 'Click again to confirm' : 'Clear this slot'}
                            onclick={() => guardedAction(`slot:${selectedPage.pageId}:${slot.slotId}`,
                              () => clearControlSlot(selectedPage.pageId, slot.slotId))}>
                      {pendingDestructive === `slot:${selectedPage.pageId}:${slot.slotId}` ? 'Confirm' : '×'}
                    </button>
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
                        <button type="button" class="ghost danger" class:confirming={pendingDestructive === `midi-slot:${selectedPage.pageId}:${slot.slotId}`}
                                title={pendingDestructive === `midi-slot:${selectedPage.pageId}:${slot.slotId}` ? 'Click again to confirm' : 'Remove the MIDI binding'}
                                onclick={() => guardedAction(`midi-slot:${selectedPage.pageId}:${slot.slotId}`,
                                  () => clearControlSlotMidi(selectedPage.pageId, slot.slotId))}>
                          {pendingDestructive === `midi-slot:${selectedPage.pageId}:${slot.slotId}` ? 'Confirm' : '×'}
                        </button>
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
      <div class="dock-grip" role="separator" aria-label="Resize the dock" aria-orientation="horizontal"
           title="Drag to resize · double-click to fit this tab"
           onpointerdown={gripDown} onpointermove={gripMove}
           onpointerup={gripUp} onpointercancel={gripUp}
           ondblclick={resetDockHeight}></div>
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
        <div class="dock-body-content" bind:this={dockContentElement}>
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
                  <button type="button" class="ghost danger" class:confirming={pendingDestructive === `effect:${effect.effectId}`}
                          title={pendingDestructive === `effect:${effect.effectId}` ? 'Click again to confirm' : 'Remove this effect'}
                          onclick={() => guardedAction(`effect:${effect.effectId}`, () => removeEffect(effect.effectId))}>
                    {pendingDestructive === `effect:${effect.effectId}` ? 'Confirm' : '×'}
                  </button>
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
                     role="group" aria-label={`${parameter.name} parameter`}
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
                <input type="text" class="send-name editable-name" value={ret.name}
                       aria-label="Return name" title="Rename return"
                       onchange={(e) => renameReturn(ret.returnId, e.currentTarget.value)} />
                <label class="mini return-level" title="Return level">
                  <input type="range" min="0" max="2" step="0.01" value={ret.level}
                         aria-label={`${ret.name} level`}
                         oninput={(e) => setReturnLevel(ret.returnId, Number(e.currentTarget.value))} />
                </label>
                <button type="button" class="ghost danger" class:confirming={pendingDestructive === `return:${ret.returnId}`}
                        title={pendingDestructive === `return:${ret.returnId}` ? 'Click again to confirm' : 'Remove this return (its sends go with it)'}
                        onclick={() => guardedAction(`return:${ret.returnId}`, () => removeReturn(ret.returnId))}>
                  {pendingDestructive === `return:${ret.returnId}` ? 'Confirm' : '×'}
                </button>
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
              <input type="text" class="macro-name" value={macro.name}
                     aria-label="Macro name" title="Select or rename this macro"
                     onfocus={() => (selectedMacroId = macro.macroId)}
                     onclick={() => (selectedMacroId = macro.macroId)}
                     onchange={(e) => renameMacro(macro.macroId, e.currentTarget.value)} />
              <input type="range" min="0" max="1" step="0.001" value={macro.value} aria-label={macro.name}
                     oninput={(e) => setMacroValue(macro.macroId, Number(e.currentTarget.value))}
                     onchange={(e) => setMacroValue(macro.macroId, Number(e.currentTarget.value), true)} />
              <button type="button" class="ghost danger" class:confirming={pendingDestructive === `macro:${macro.macroId}`}
                      title={pendingDestructive === `macro:${macro.macroId}` ? 'Click again to confirm' : 'Remove this macro'}
                      onclick={() => guardedAction(`macro:${macro.macroId}`, () => removeMacro(macro.macroId))}>
                {pendingDestructive === `macro:${macro.macroId}` ? 'Confirm' : '×'}
              </button>
            </div>
            {#if macro.targets.length > 0}
              <div class="macro-targets">
                {#each macro.targets as target (target.targetId + target.parameterId)}
                  <span class="macro-target" class:unresolved={!target.resolved}
                        title={target.resolved ? `${target.displayName} on ${target.targetName}`
                                               : 'unresolved — the target no longer carries this plug-in'}>
                    <span class="macro-target-name">
                      {target.displayName} — {target.targetName || 'missing'}
                    </span>
                    <label class="macro-bound" title="Output when the macro is at minimum">
                      <span>Min</span>
                      <input type="number" min="0" max={target.rangeMax} step="0.01" value={target.rangeMin}
                             aria-label={`${target.displayName} minimum`}
                             onchange={(e) => setMacroTargetOptions(
                               macro.macroId, target.targetId, target.parameterId,
                               { rangeMin: Number(e.currentTarget.value) })} />
                    </label>
                    <label class="macro-bound" title="Output when the macro is at maximum">
                      <span>Max</span>
                      <input type="number" min={target.rangeMin} max="1" step="0.01" value={target.rangeMax}
                             aria-label={`${target.displayName} maximum`}
                             onchange={(e) => setMacroTargetOptions(
                               macro.macroId, target.targetId, target.parameterId,
                               { rangeMax: Number(e.currentTarget.value) })} />
                    </label>
                    <span class="macro-invert">
                      <PropertyToggle value={target.inverted} label="Inv" compact
                                      title="Reverse this target's response"
                                      ariaLabel={`Invert ${target.displayName}`}
                                      onchange={(inverted) => setMacroTargetOptions(
                                        macro.macroId, target.targetId, target.parameterId,
                                        { inverted })} />
                    </span>
                    <button type="button" class="ghost danger"
                            class:confirming={pendingDestructive === `macro-target:${macro.macroId}:${target.targetId}:${target.parameterId}`}
                            title={pendingDestructive === `macro-target:${macro.macroId}:${target.targetId}:${target.parameterId}`
                              ? 'Click again to confirm' : 'Remove this macro target'}
                            onclick={() => guardedAction(`macro-target:${macro.macroId}:${target.targetId}:${target.parameterId}`,
                              () => removeMacroTarget(macro.macroId, target.targetId, target.parameterId))}>
                      {pendingDestructive === `macro-target:${macro.macroId}:${target.targetId}:${target.parameterId}` ? 'Confirm' : '×'}
                    </button>
                  </span>
                {/each}
              </div>
            {/if}
          {/each}
        </div>
        {/if}
        </div>
      </div>
    {/if}
  </div>
  {/if}
  </div>
  {/if}
</div>

<style>
  .host-workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: var(--host-bg);
    color: var(--host-text);
    font-size: 13px;
    line-height: 1.35;
  }

  .host-header {
    flex: none;
    display: grid;
    grid-template-columns: minmax(260px, 1fr) auto minmax(430px, 1.35fr);
    align-items: center;
    gap: 14px;
    min-height: 60px;
    padding: 8px 14px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--host-line);
    background: var(--host-surface);
  }

  .host-brand {
    min-width: 0;
    display: grid;
    grid-template-columns: 174px minmax(0, 1fr);
    grid-template-rows: auto auto;
    column-gap: 10px;
    align-items: center;
  }
  .host-logo-frame {
    grid-row: 1 / 3;
    display: block;
    width: 174px;
    height: 36px;
  }
  .host-purpose {
    color: var(--host-text-dim);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.11em;
    white-space: nowrap;
  }
  .host-audio-status {
    grid-column: 2;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--host-text-soft);
    font-family: var(--host-font-mono);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .host-status-dot { flex: none; width: 6px; height: 6px; background: var(--host-text-dim); }
  .host-audio-status.on .host-status-dot { background: var(--host-active); box-shadow: 0 0 7px color-mix(in srgb, var(--host-active) 60%, transparent); }
  .host-mode { display: inline-flex; align-items: center; padding: 2px; border: 1px solid #35424d; border-radius: 6px; background: #111519; }
  .mode-button { min-width: 58px; border: none; border-radius: 4px; background: transparent; color: #929da7; padding: 5px 10px; font-size: 12px; cursor: pointer; }
  .mode-button.on { background: #2b5270; color: #f0f6fa; }
  .mode-button.holding {
    color: #f0f6fa;
    animation: build-unlock-hold 1s linear forwards;
  }
  @keyframes build-unlock-hold {
    from { box-shadow: inset 0 0 #4a7b5e; }
    to { box-shadow: inset 72px 0 #4a7b5e; }
  }
  button.confirming {
    border-color: #c57575;
    background: #51282c;
    color: #ffd8d8;
  }
  .host-command-area { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
  .host-transport-group { display: flex; align-items: center; gap: 7px; }
  .header-group-label {
    color: var(--host-text-dim);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .host-global-actions { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .host-global-actions .panic { flex: none; }
  .stage-header-actions { justify-self: end; display: flex; align-items: center; gap: 12px; }
  .stage-header-hint { color: #8b99a4; font-size: 12px; }
  .scan-status { color: #96a2ad; font-size: 11px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  @media (max-width: 1120px) {
    .host-header { grid-template-columns: minmax(260px, 1fr) auto; }
    .host-command-area {
      grid-column: 1 / -1;
      justify-content: space-between;
      padding-top: 7px;
      border-top: 1px solid var(--host-line-soft);
    }
    .stage-header-actions { grid-column: 1 / -1; justify-self: stretch; justify-content: flex-end; }
  }

  @media (max-width: 720px) {
    .host-header { gap: 9px; padding-inline: 10px; }
    .host-purpose, .header-group-label, .scan-status { display: none; }
    .host-command-area { overflow-x: auto; }
    .host-global-actions { margin-left: auto; }
  }

  .build-navigation {
    flex: none;
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 6px 14px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--host-line-soft);
    background: var(--host-bg-deep);
    overflow-x: auto;
  }
  .workspace-tabs, .utility-tabs { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .navigation-label {
    margin-right: 3px;
    color: #8795a0;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  button.navigation-tab, button.utility-tab {
    padding: 4px 10px;
    border-color: transparent;
    background: transparent;
    color: #9aa6b0;
    font-size: 12px;
  }
  button.navigation-tab:hover:not(:disabled), button.utility-tab:hover:not(:disabled) {
    border-color: #3b4652;
    color: #d6dbe0;
  }
  button.navigation-tab.on {
    border-color: #456b89;
    background: #21394b;
    color: #edf5fa;
  }
  button.utility-tab.on {
    border-color: #4b5966;
    background: #242b31;
    color: #dce4ea;
  }
  button.utility-tab.warn { color: #e4b3b3; }

  .build-content {
    flex: 1;
    min-height: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .primary-workspace {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 12px 14px;
    box-sizing: border-box;
    overflow: auto;
  }
  .primary-workspace :global(.perf-panel) {
    min-height: 100%;
    max-height: none;
    margin: 0;
    box-sizing: border-box;
  }
  .primary-workspace :global(.mixer) { min-height: 100%; box-sizing: border-box; }
  .controller-workspace { display: flex; overflow: hidden; }

  .utility-drawer {
    position: absolute;
    z-index: 20;
    top: 0;
    right: 0;
    bottom: 0;
    width: clamp(380px, 40vw, 560px);
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--host-line);
    background: var(--host-surface);
    box-shadow: -14px 0 28px #080a0c99;
  }
  .utility-drawer-head {
    flex: none;
    min-height: 42px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px 7px 14px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--host-line-soft);
    background: var(--host-bg-deep);
  }
  .utility-drawer-head strong { flex: 1; font-size: 13px; }
  button.utility-close { padding: 2px 7px; font-size: 18px; line-height: 1; }
  .utility-drawer-body { flex: 1; min-height: 0; overflow: auto; padding: 12px; }
  .utility-drawer .device-panel,
  .utility-drawer .library-panel,
  .utility-drawer .project-panel {
    margin: 0;
    max-height: none;
    box-sizing: border-box;
  }
  .utility-drawer .device-panel { flex-direction: column; gap: 16px; }
  .utility-drawer .device-output { min-width: 0; width: 100%; }
  .utility-drawer .library-panel { height: 100%; }
  .utility-drawer :global(.product-panel),
  .utility-drawer :global(.reliability-panel),
  .utility-drawer :global(.licence-panel) {
    margin: 0;
    max-height: none;
    box-sizing: border-box;
  }
  .utility-drawer :global(.product-grid),
  .utility-drawer :global(.reliability-grid),
  .utility-drawer :global(.licence-grid) { grid-template-columns: 1fr; }
  .utility-drawer :global(.note),
  .utility-drawer :global(.label),
  .utility-drawer :global(.field),
  .utility-drawer :global(.check),
  .utility-drawer :global(.detail),
  .utility-drawer :global(.never) { font-size: 12px; }
  .utility-drawer :global(.matrix-row),
  .utility-drawer :global(.readout) { min-height: 26px; line-height: 1.45; }

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
  .device-output { display: flex; flex-direction: column; gap: 5px; color: #aab4bd; font-size: 12px; min-width: 260px; }
  .device-midi { display: flex; flex-direction: column; gap: 4px; }
  .midi-activity {
    margin-left: 10px;
    color: #a9dfad;
    font-size: 12px;
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

  .device-midi-title { color: #aab4bd; font-size: 12px; }
  .surface-row { color: #aab4bd; font-size: 12px; align-items: center; }
  .surface-dot { width: 7px; height: 7px; border-radius: 50%; background: #5c6672;
                 display: inline-block; flex: 0 0 auto; }
  .surface-dot.connected { background: #35c46f; }
  .surface-dot.connecting { background: #d9a13c; }
  .surface-dot.heldElsewhere { background: #d9a13c; }
  .surface-dot.failed { background: #e05656; }
  .device-midi-empty { color: #7d8894; font-size: 12px; }
  .device-midi-row { display: flex; align-items: center; gap: 8px; min-height: 30px; font-size: 12px; color: #d6dbe0; }

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
  .project-field { display: flex; flex-direction: column; gap: 5px; color: #aab4bd; font-size: 12px; }
  .project-field input { width: 180px; }
  .project-target { display: flex; align-items: center; gap: 6px; padding-bottom: 2px; }
  .project-appid { color: #96a2ad; font-size: 12px; }
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
  .library-head .playing { border-color: #ef8b35; color: #ffd3ab; }
  .audition-config {
    display: flex; align-items: end; gap: 10px; flex-wrap: wrap;
    padding: 7px 9px;
    border: 1px solid #3b4652;
    background: #171c21;
  }
  .audition-config strong { align-self: center; color: #d7dde3; font-size: 12px; }
  .audition-config label {
    display: flex; flex-direction: column; gap: 3px;
    color: #96a2ad; font-size: 10px; text-transform: uppercase;
  }
  .audition-config select { width: 112px; }
  .audition-config input[type="number"] { width: 66px; }
  .number-with-note, .number-unit { display: inline-flex; align-items: center; gap: 4px; }
  .number-with-note small, .number-unit small { color: #b7c1ca; font-size: 11px; text-transform: none; }
  .audition-help { align-self: center; color: #78848f; font-size: 11px; }
  .sound-compare {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 8px 10px;
    border: 1px solid #d66f24;
    background: linear-gradient(90deg, #2a1c13, #171c21 42%);
  }
  .compare-slot {
    display: inline-flex; align-items: baseline; justify-content: center;
    min-width: 44px; color: #ff9a47; font-size: 22px; font-weight: 750;
  }
  .compare-slot small { color: #a87955; font-size: 11px; }
  .compare-copy { display: flex; flex: 1 1 180px; min-width: 150px; flex-direction: column; }
  .compare-copy small { color: #9f8877; font-size: 10px; }
  .compare-copy strong { color: #f1f3f5; font-size: 13px; }
  .compare-keep { border-color: #d66f24; color: #ffd7b7; }
  .library-counts { color: #96a2ad; font-size: 12px; }
  .library-capture { display: flex; gap: 8px; }
  .library-paths { display: flex; flex-direction: column; gap: 4px; }
  .library-list { overflow-y: auto; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
  .library-row { display: flex; align-items: center; gap: 8px; min-height: 34px; }
  .library-row.comparing { outline: 1px solid #d66f24; background: #241b15; }
  .library-id { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .library-name { font-weight: 600; font-size: 12px; }
  .library-id.clickable { cursor: pointer; }
  .library-id.clickable:hover .library-name { color: #7fb4e0; }
  .library-detail { color: #96a2ad; font-size: 12px; }
  .library-reason { color: #e1aaaa; font-size: 12px; }
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
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-top: 1px solid var(--host-line);
    background: var(--host-surface);
  }
  .host-dock.collapsed { height: auto; }
  .dock-grip {
    height: 10px;
    margin-top: -5px;
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
    color: #96a2ad;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dock-collapse { padding: 2px 8px; }
  .dock-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 14px 12px;
  }
  .dock-body-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  /* Inside the dock these blocks are the content, not one more section in a stack: the rule
     that separated them from what came above has nothing above it any more. */
  .dock-body-content > .fx-chain:first-of-type,
  .dock-body-content > .macros:first-of-type,
  .dock-body-content > .returns:first-of-type,
  .dock-body-content > .sends:first-of-type,
  .dock-body-content > .outputs:first-of-type,
  .dock-body-content > .hw-config:first-of-type { border-top: none; padding-top: 0; }

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

  .empty-hint { color: #96a2ad; padding: 12px 4px; }

  .part {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 10px;
    border: 1px solid #2c343d;
    border-radius: 5px;
    padding: 8px;
    background: #1c2126;
  }
  .part.focused { border-color: #67abe3; box-shadow: inset 0 0 0 1px #3d81c4; }
  .part.disabled { background: #181c20; }
  .part.disabled .part-main, .part.disabled .part-performance { opacity: 0.68; }
  .part:has(.part-actions[open]) { z-index: 5; }
  /* The face on the left, the row's full height; the three lines to its right. */
  .part-art {
    flex: none;
    position: relative;      /* the tile inside is absolute: it fills this, it never sizes it */
    align-self: stretch;
    width: 96px;             /* a recognisable plug-in face beside two predictable rows */
    min-height: 78px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 4px;
    overflow: hidden;
  }
  .part-art :global(.plugin-tile) { border-radius: 4px; }
  .part-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .part-head { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
  .mini { display: inline-flex; align-items: center; gap: 4px; }
  /* The part's range, as a button: it says where the part plays and opens the keyboard to
     change it, which is the same thing said twice in the right order. */
  .range-button { font-variant-numeric: tabular-nums; min-width: 64px; border-left: 4px solid var(--part-color, #3b4652); }
  .mini-label { font-size: 11px; color: #aab4bd; letter-spacing: 0.3px; }

  .part-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    background: none;
    border: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0;
    font: inherit;
  }
  .part-name { max-width: 100%; font-weight: 650; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .part-states { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; flex-wrap: wrap; }
  .part-state { padding: 2px 6px; border: 1px solid #46515b; background: #20262c; color: #b5c0c8; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; }
  .part-state.problem, .part-state.muted { border-color: #7a4a4a; background: #2a1d1d; color: #e8b5b5; }
  .part-state.off { border-color: #626a72; background: #25292d; color: #b4bbc1; }
  .part-state.soloed { border-color: #806d36; background: #2a2618; color: #ead58f; }
  .part-actions { position: relative; flex: none; }
  .part-actions summary {
    width: 34px;
    min-height: 30px;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    border: 1px solid #3b4652;
    background: #20262c;
    color: #aab4bd;
    cursor: pointer;
    list-style: none;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .part-actions summary::-webkit-details-marker { display: none; }
  .part-actions[open] summary { border-color: #67abe3; color: #edf5fa; background: #24384c; }
  .part-action-menu {
    position: absolute;
    z-index: 10;
    top: calc(100% + 4px);
    right: 0;
    width: 170px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    border: 1px solid #46515b;
    background: #151a1f;
    box-shadow: 0 8px 18px #080a0caa;
  }
  .part-action-menu button { width: 100%; justify-content: flex-start; text-align: left; white-space: nowrap; }
  .part-performance { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
  .preset-walk { flex: 0 1 220px; min-width: 150px; display: inline-flex; align-items: center; gap: 3px; }
  .preset-walk .ghost { flex: none; padding: 0 8px; font-size: 16px; line-height: 1; }
  .preset-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                 font-size: 12px; color: #aab4bd; }
  .part-vendor { color: #96a2ad; font-size: 12px; }

  .part-controls { flex: 1; min-width: 290px; display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex-wrap: wrap; }
  .mini input[type="range"] { width: 84px; }

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
  .instrument-vendor { color: #96a2ad; font-size: 12px; }

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
  .dim { color: #96a2ad; font-size: 12px; }

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
    font-size: 12px;
  }
  .param-list { overflow-y: auto; max-height: 260px; display: flex; flex-direction: column; gap: 4px; }
  .param-group { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left;
                 background: #161e27; border: 1px solid #232c36; border-radius: 4px;
                 color: #aab4bd; font-size: 12px; font-weight: 600; padding: 4px 8px;
                 cursor: pointer; }
  .param-row { display: flex; align-items: center; gap: 8px; }
  .param-pin { flex: none; padding: 0 3px; color: #6d7883; font-size: 12px; line-height: 16px; }
  .param-pin.on { color: #e0c060; }
  /* The two short lists sit above the groups and read as a landing strip rather than as more
     of the same list — a rule under each, and a heading small enough not to compete with the
     group headings below. */
  .param-shortlist { display: flex; flex-direction: column; gap: 2px; padding-bottom: 4px;
                     margin-bottom: 4px; border-bottom: 1px solid #2c343d; }
  .param-shortlist-head { color: #96a2ad; font-size: 11px; text-transform: uppercase;
                          letter-spacing: 0.06em; }
  .param-segments { display: inline-flex; gap: 2px; flex: 1; min-width: 0; }
  .param-segments button { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
                           white-space: nowrap; font-size: 11px; padding: 3px 5px;
                           background: #1c2630; color: #aab4bd; border: 1px solid #2c3742;
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
  .param-value { flex: 0 0 92px; text-align: right; color: #aab4bd; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .param-diag { color: #8795a0; font-size: 11px; margin: -2px 0 0 138px; }

  .transport { display: flex; align-items: center; gap: 4px; }
  .transport-action { min-width: 26px; padding: 2px 5px; }
  .transport-action:disabled { opacity: 0.35; cursor: default; }
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
  input.editable-name { box-sizing: border-box; min-width: 0; }
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
  .fx-row .ghost { flex: none; padding: 2px 6px; font-size: 11px; line-height: 18px; }
  /* Running is green, bypassed is red. Struck-through text said "deleted" — the one state
     this row can never be in — and it took reading the Byp button to find out otherwise. */
  .fx-name { flex: 1; color: #8fc4a8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx-row.bypassed .fx-name { color: #d68a8a; }
  .fx-row.unresolved .fx-name { color: #d6a3a3; font-style: italic; }
  .macro-row { display: flex; align-items: center; gap: 8px; }
  .macro-row.on .macro-name { color: #d6dbe0; border-color: #5b9bd5; }
  .macro-name { box-sizing: border-box; flex: 0 0 112px; min-width: 0; font-size: 12px; }
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
  .macro-target-name { white-space: nowrap; }
  .macro-bound, .macro-invert { display: inline-flex; align-items: center; gap: 2px; }
  .macro-bound span, .macro-invert span { color: #74808b; font-size: 9px; text-transform: uppercase; }
  .macro-bound input[type='number'] {
    width: 42px;
    min-width: 42px;
    height: 20px;
    padding: 1px 3px;
    border: 1px solid #46515d;
    border-radius: 2px;
    background: #171c21;
    color: #cbd2d8;
    font-size: 10px;
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
  .page-auto { color: #96a2ad; font-size: 11px; }
  .page-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
  .page-tab { display: inline-flex; align-items: center; gap: 2px; border: 1px solid #3b4652; border-radius: 4px; padding: 0 2px; }
  .page-tab.on { border-color: #5b9bd5; background: #24313d; }
  .page-name { box-sizing: border-box; width: 104px; min-width: 0; background: none; color: inherit;
               border: none; padding: 3px 6px; }
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

</style>
