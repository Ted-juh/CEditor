<script>
  import { onDestroy, onMount } from 'svelte';
  import SongsPage from './performance/SongsPage.svelte';
  import HostConfirmButton from './HostConfirmButton.svelte';
  /**
   * PerformancePanel.svelte — Hostage's performance system.
   *
   * Several views over ONE engine, which is the whole point of the stage: the pattern editor
   * writes lanes and steps, the clip and scene grid launches them, the arranger chains them,
   * and the setlist walks whole rigs. None keeps its own playback state — every control sends a command and the
   * next `instrumentHostState` push is what gets drawn, so a launch that the engine is still
   * holding for its quantization boundary renders as "pending" rather than as a lie.
   *
   * The playhead is the one thing that reads rather than commands: clip phase comes from the
   * native side's own position, because §18.8.13's rule is that timing never depends on the
   * WebView's frame rate — the animation follows the engine, it does not drive it.
   */
  import {
    hostState, hostParameters, hostRackCaptures, requestParameters, requestRackCaptures,
    addPattern, removePattern, renamePattern, setPatternOptions, createPatternVariations,
    importGrooveTemplate, removeGrooveTemplate, applyGrooveTemplate, extractGrooveTemplate,
    removeGestureShape, applyGestureShape, extractGestureShape, importGestureShape,
    addLane, removeLane, setLaneOptions, clearLane, euclidFill,
    setStep, toggleStep, setStepParameterLock, setStepCcLock,
    removeStepLock, clearStepLocks,
    addClip, removeClip, setClipOptions, launchClip, stopClip, stopAllClips, setPerformanceFill,
    armCapture, disarmCapture, captureRecentMidi, freezeMidiClip,
    startMidiLoop, finishMidiLoop, cancelMidiLoop, removeMidiLoop,
    startGestureRecording, finishGestureRecording, cancelGestureRecording, clearGestureLanes,
    startPerformanceRecording, finishPerformanceRecording, cancelPerformanceRecording,
    removePerformanceTake, replayPerformanceTake, stopPerformanceReplay,
    addModulationRoute, setModulationRoute, removeModulationRoute, clearModulationRoutes,
    addMidiLfo,
    addEnvelope, triggerEnvelope,
    addMseg,
    addRandomModulator,
    importScalaTuning, parseScalaTuning, resetMicrotuning, setMicrotuning,
    setPartMicrotuning, sendMicrotuning,
    addScene, removeScene, renameScene, captureScene, setSceneOptions, setSceneClip, launchScene,
    createSceneVariations,
    addSetlistItem, removeSetlistItem, moveSetlistItem, setSetlistItem, setSetlistOptions,
    setlistGo, setlistNext, setlistPrev,
    checkSetlistSoundcheck, startSoundcheck, finishSoundcheck,
    addArrangementItem, removeArrangementItem, setArrangementItem, moveArrangementItem,
    setArrangementOptions, startArrangement, stopArrangement,
  } from '../stores/instrumentHost.js';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { PERFORMANCE_GROUPS, performanceGroupFor, restorePerformanceNavigation,
    storePerformanceNavigation, selectPerformanceTool } from '../utils/performanceNavigation.js';
  import FollowGraph from './FollowGraph.svelte';
  import LfoCard from './performance/LfoCard.svelte';
  import EnvelopeCard from './performance/EnvelopeCard.svelte';
  import MsegCard from './performance/MsegCard.svelte';
  import RandomCard from './performance/RandomCard.svelte';
  import PatternStepRows from './performance/PatternStepRows.svelte';
  import ScrubValue from '../components/controls/ScrubValue.svelte';
  import { parseSongLength as parseLength } from '../utils/stageScreen.js';
  import Segmented from '../components/controls/Segmented.svelte';

  let { onShowMixer = () => {} } = $props();
  const stopMeasurement = () => { if ($hostState.soundcheck.activeItemId) finishSoundcheck(); };
  const songCount = (sceneId) => performance.setlist.items.filter((item) => item.sceneId === sceneId).length;

  // The Launcher: scenes are rows and clips columns, so what a scene starts is visible at a
  // glance. Picking a column or a row shows that clip's or scene's settings under the grid.
  let pickedClipId = $state('');
  let pickedSceneId = $state('');
  let knownSceneCount = 0;
  const pickedClip = $derived(performance.clips.find((c) => c.clipId === pickedClipId) ?? performance.clips[0] ?? null);
  const pickedScene = $derived(performance.scenes.find((s) => s.sceneId === pickedSceneId) ?? performance.scenes[0] ?? null);
  $effect(() => {
    // A scene just added is the one about to be set up.
    const count = performance.scenes.length;
    if (count > knownSceneCount && knownSceneCount > 0) pickedSceneId = performance.scenes[count - 1].sceneId;
    knownSceneCount = count;
  });
  const SCENE_COLOURS = ['#d98b3a', '#4f9fd6', '#9a7ad6', '#52b58a', '#d6698f', '#c9b24a', '#4fc1c9', '#8c9aa8'];
  const sceneColour = (index) => SCENE_COLOURS[index % SCENE_COLOURS.length];
  const clipParts = (clip) => {
    const pattern = performance.patterns.find((p) => p.patternId === clip.patternId);
    const names = new Set();
    for (const lane of pattern?.lanes ?? []) {
      const part = $hostState.rack.parts.find((candidate) => candidate.partId === lane.targetPartId);
      if (part) names.add(part.name || part.pluginName || 'Part');
    }
    return [...names];
  };
  const clipFlow = (clip) => {
    if (clip.followAction === 'none') return clip.loop ? 'loops' : 'plays once';
    if (clip.followAction === 'stop') return 'then stops';
    if (clip.followAction === 'next') return 'then the next clip';
    if (clip.followAction === 'random') return 'then a random clip';
    const target = performance.clips.find((c) => c.clipId === clip.followClipId);
    return target ? `then ${target.name}` : 'then a clip';
  };
  const sceneUse = (sceneId) => {
    const songs = performance.setlist.items.filter((item) => item.sceneId === sceneId).length;
    return songs === 0 ? 'no song' : songs === 1 ? '1 song' : `${songs} songs`;
  };
  onDestroy(stopMeasurement);
  const heldFillClipIds = new Set();
  const heldEnvelopeIds = new Set();

  function setFillHeld(clipId, held) {
    if (held) heldFillClipIds.add(clipId);
    else heldFillClipIds.delete(clipId);
    setPerformanceFill(clipId, held);
  }

  function setEnvelopeAuditionHeld(envelopeId, held) {
    if (held) heldEnvelopeIds.add(envelopeId);
    else heldEnvelopeIds.delete(envelopeId);
    triggerEnvelope(envelopeId, held, held ? 1 : undefined);
  }

  function releaseHeldPerformanceActions() {
    for (const clipId of heldFillClipIds) setPerformanceFill(clipId, false);
    for (const envelopeId of heldEnvelopeIds) triggerEnvelope(envelopeId, false);
    heldFillClipIds.clear();
    heldEnvelopeIds.clear();
  }

  onMount(() => {
    window.addEventListener('blur', releaseHeldPerformanceActions);
    return () => window.removeEventListener('blur', releaseHeldPerformanceActions);
  });
  onDestroy(releaseHeldPerformanceActions);
  const showMixer = () => { stopMeasurement(); onShowMixer(); };
  let navigation = $state(restorePerformanceNavigation());
  let tab = $derived(navigation.tab);
  let activeGroup = $derived(performanceGroupFor(tab));
  let activeTool = $derived(activeGroup.tools.find(tool => tool.id === tab));
  $effect(() => {
    if (tab !== 'clips' && heldFillClipIds.size > 0) {
      for (const clipId of heldFillClipIds) setPerformanceFill(clipId, false);
      heldFillClipIds.clear();
    }
    if (tab !== 'envelopes' && heldEnvelopeIds.size > 0) {
      for (const envelopeId of heldEnvelopeIds) triggerEnvelope(envelopeId, false);
      heldEnvelopeIds.clear();
    }
  });
  const selectTool = (tool) => {
    if (tool !== 'setlist') stopMeasurement();
    navigation = selectPerformanceTool(navigation, tool);
  };
  $effect(() => storePerformanceNavigation(navigation));
  let selectedPatternId = $state('');
  let selectedLaneId = $state('');
  let selectedStepIndex = $state(-1);
  let retrospectiveSeconds = $state(30);
  // An old completed capture must not override the remembered tool on remount.
  let seenRetrospectivePatternId = $state($hostState.performance.capture.lastPatternId);
  let lockKind = $state('parameter');
  let lockTargetId = $state('');
  let lockParameterId = $state('');
  let lockValue = $state(0.5);
  let lockCcNumber = $state(74);
  let lockChannel = $state(1);
  let lastLockSourceLaneId = $state('');
  let modSourceKey = $state('velocity');
  let modTargetId = $state('');
  let modParameterId = $state('');
  let modAmount = $state(0.25);
  let modChannel = $state(0);
  let modCcNumber = $state(74);
  let tuningFileMessage = $state('');
  let variationAmount = $state(0.55);
  let variationAmountPatternId = $state('');
  let freezeCycles = $state(1);
  let selectedGrooveId = $state('');
  let grooveAmount = $state(0.75);
  let grooveVelocity = $state(true);
  let grooveFileMessage = $state('');
  let performanceTakeName = $state('');

  let performance = $derived($hostState.performance);
  let patterns = $derived(performance.patterns);
  let grooves = $derived(performance.grooves);
  let parts = $derived($hostState.rack.parts);
  let looperLayers = $derived(performance.clips.filter((clip) => clip.looperLayer));
  let gestureTargets = $derived(
    performance.clips.filter((clip) => clip.gestureClip || clip.looperLayer));
  let hardwareParts = $derived(parts.filter((part) => part.hardware));
  let microtuning = $derived($hostState.rack.microtuning);
  let rackCaptures = $derived($hostRackCaptures);

  let selectedPattern = $derived(
    patterns.find((p) => p.patternId === selectedPatternId) ?? patterns[0] ?? null);
  let editableLanes = $derived(selectedPattern?.lanes.filter((lane) => !lane.lockSourceLaneId) ?? []);
  let selectedLane = $derived(
    editableLanes.find((l) => l.laneId === selectedLaneId) ?? editableLanes[0] ?? null);
  let selectedStep = $derived(
    selectedLane && selectedStepIndex >= 0 ? selectedLane.steps[selectedStepIndex] ?? null : null);
  let selectedGroove = $derived(
    grooves.find((groove) => groove.grooveId === selectedGrooveId) ?? grooves[0] ?? null);

  $effect(() => {
    if (selectedPattern?.patternId && selectedPattern.patternId !== variationAmountPatternId) {
      variationAmountPatternId = selectedPattern.patternId;
      variationAmount = selectedPattern.variationAmount ?? 0.55;
    }
  });

  $effect(() => {
    if (tab === 'setlist') requestRackCaptures();
  });

  $effect(() => {
    if (selectedGroove?.grooveId && selectedGrooveId !== selectedGroove.grooveId)
      selectedGrooveId = selectedGroove.grooveId;
  });

  // Parameter locks are stored as ordinary, non-gliding automation/CC lanes linked to the
  // visible source lane. That lets the proven scheduler play them while this editor keeps the
  // implementation lanes out of the main pattern stack.
  let effectTargets = $derived([
    ...$hostState.rack.masterEffects,
    ...parts.flatMap((part) => part.effects),
    ...$hostState.rack.returns.flatMap((ret) => ret.effects),
    ...$hostState.rack.buses.flatMap((bus) => bus.effects),
  ]);
  let lockTargets = $derived([
    ...parts.map((part, index) => ({
      id: part.partId,
      kind: 'part',
      label: part.hardware
        ? (part.midiOutputName || `Hardware part ${index + 1}`)
        : (part.pluginName || `Part ${index + 1}`),
    })),
    ...effectTargets.filter((effect) => effect.hasProcessor).map((effect) => ({
      id: effect.effectId, kind: 'effect', label: effect.pluginName || 'Effect',
    })),
    ...$hostState.rack.macros.map((macro, index) => ({
      id: macro.macroId, kind: 'macro', label: macro.name || `Macro ${index + 1}`,
    })),
  ]);
  let selectedLockTarget = $derived(lockTargets.find((target) => target.id === lockTargetId) ?? null);
  let availableLockParameters = $derived.by(() => {
    if (!selectedLockTarget) return [];
    if (selectedLockTarget.kind === 'macro') {
      const macro = $hostState.rack.macros.find((candidate) => candidate.macroId === lockTargetId);
      return [{ id: '@macro', name: selectedLockTarget.label, value: macro?.value ?? 0 }];
    }
    return $hostParameters.partId === lockTargetId
      ? $hostParameters.parameters.filter((parameter) => parameter.automatable)
      : [];
  });
  let selectedStepLocks = $derived(
    selectedPattern && selectedLane && selectedStepIndex >= 0
      ? selectedPattern.lanes.filter((lane) => lane.lockSourceLaneId === selectedLane.laneId
          && lane.steps[selectedStepIndex]?.active)
      : []);

  const fixedModSources = [
    { key: 'velocity', type: 'velocity', label: 'Note velocity' },
    { key: 'modWheel', type: 'modWheel', label: 'Mod wheel (CC1)' },
    { key: 'expression', type: 'expression', label: 'Expression (CC11)' },
    { key: 'channelPressure', type: 'channelPressure', label: 'Channel aftertouch' },
    { key: 'polyAftertouch', type: 'polyAftertouch', label: 'Poly aftertouch (latest)' },
    { key: 'pitchBend', type: 'pitchBend', label: 'Pitch bend' },
    { key: 'midiCc', type: 'midiCc', label: 'MIDI CC…' },
  ];
  let modulationSources = $derived([
    ...fixedModSources,
    ...$hostState.rack.midiLfos.map((lfo, index) => ({
      key: `lfo:${lfo.lfoId}`, type: 'lfo', sourceId: lfo.lfoId,
      label: `LFO · ${lfo.name || index + 1}`,
    })),
    ...$hostState.rack.envelopes.map((envelope, index) => ({
      key: `envelope:${envelope.envelopeId}`, type: 'envelope', sourceId: envelope.envelopeId,
      label: `Envelope · ${envelope.name || index + 1}`,
    })),
    ...$hostState.rack.msegs.map((mseg, index) => ({
      key: `mseg:${mseg.msegId}`, type: 'mseg', sourceId: mseg.msegId,
      label: `MSEG · ${mseg.name || index + 1}`,
    })),
    ...$hostState.rack.randomModulators.map((random, index) => ({
      key: `random:${random.randomId}`, type: 'random', sourceId: random.randomId,
      label: `Random · ${random.name || index + 1}`,
    })),
    ...$hostState.rack.macros.map((macro, index) => ({
      key: `macro:${macro.macroId}`, type: 'macro', sourceId: macro.macroId,
      label: `Macro · ${macro.name || index + 1}`,
    })),
  ]);
  let selectedModSource = $derived(
    modulationSources.find((source) => source.key === modSourceKey) ?? modulationSources[0]);
  let modulationTargets = $derived(lockTargets.filter(
    (target) => target.kind !== 'macro'
      || ['lfo', 'envelope', 'mseg', 'random'].includes(selectedModSource?.type)));
  let selectedModTarget = $derived(
    modulationTargets.find((target) => target.id === modTargetId) ?? null);
  let availableModParameters = $derived(
    selectedModTarget?.kind === 'macro'
      ? [{ id: '@macro', name: selectedModTarget.label }]
      : $hostParameters.partId === modTargetId
      ? $hostParameters.parameters.filter((parameter) => parameter.automatable
          && parameter.id !== '@macro')
      : []);

  // The clip a lane belongs to, for arming capture straight from the editor.
  let clipForSelectedPattern = $derived(
    performance.clips.find((c) => c.patternId === selectedPattern?.patternId) ?? null);

  // A completed retrospective capture is an edit, so take the player directly to the new
  // ordinary pattern. From this point it behaves exactly like one drawn by hand.
  $effect(() => {
    const patternId = performance.capture.lastPatternId;
    if (patternId && patternId !== seenRetrospectivePatternId) {
      seenRetrospectivePatternId = patternId;
      selectedPatternId = patternId;
      selectedLaneId = '';
      selectedStepIndex = -1;
      selectTool('patterns');
    }
  });

  $effect(() => {
    if (tab !== 'modulation') return;
    if (!modulationSources.some((source) => source.key === modSourceKey))
      modSourceKey = modulationSources[0]?.key ?? 'velocity';
    if (!modulationTargets.some((target) => target.id === modTargetId)) {
      modTargetId = modulationTargets.find((target) => target.id === $hostState.rack.focusedPartId)?.id
        ?? modulationTargets[0]?.id ?? '';
      modParameterId = '';
    }
    if (modTargetId && selectedModTarget?.kind !== 'macro'
        && $hostParameters.partId !== modTargetId)
      requestParameters(modTargetId);
  });

  $effect(() => {
    if (tab !== 'modulation' || availableModParameters.length === 0) return;
    if (!availableModParameters.some((parameter) => parameter.id === modParameterId))
      modParameterId = availableModParameters[0].id;
  });

  // Follow the selected source lane, but keep an explicit target choice while the user moves
  // between steps in that lane. The part the lane already plays is the least surprising first
  // target; a focused part and then the first available target are the fallbacks.
  $effect(() => {
    const sourceLaneId = selectedLane?.laneId ?? '';
    const targetStillExists = lockTargets.some((target) => target.id === lockTargetId);
    if (!sourceLaneId) {
      lastLockSourceLaneId = '';
      return;
    }
    if (sourceLaneId !== lastLockSourceLaneId || !targetStillExists) {
      lastLockSourceLaneId = sourceLaneId;
      const preferred = lockTargets.find((target) => target.id === selectedLane.targetPartId)
        ?? lockTargets.find((target) => target.id === $hostState.rack.focusedPartId)
        ?? lockTargets[0];
      lockTargetId = preferred?.id ?? '';
      lockParameterId = '';
      lockChannel = Math.max(1, Math.min(16, Number(selectedLane.channel ?? 1)));
    }
  });

  // The parameter registry is deliberately fetched only while this per-step editor is open.
  // It is a shared store, so this avoids stealing the target from the normal Params view.
  $effect(() => {
    if (tab === 'patterns' && selectedStep && lockKind === 'parameter'
        && selectedLockTarget && selectedLockTarget.kind !== 'macro'
        && $hostParameters.partId !== lockTargetId)
      requestParameters(lockTargetId);
  });

  $effect(() => {
    if (availableLockParameters.length === 0) return;
    if (!availableLockParameters.some((parameter) => parameter.id === lockParameterId)) {
      lockParameterId = availableLockParameters[0].id;
      lockValue = availableLockParameters[0].value;
    }
  });

  const quantizeOptions = ['immediate', '1/16', '1/8', 'beat', '1/2 bar', 'bar', '2 bars', '4 bars'];
  const snapshotMorphOptions = [
    { value: 0, label: 'Cut' },
    { value: 0.25, label: '¼ beat' },
    { value: 1, label: '1 beat' },
    { value: 2, label: '2 beats' },
    { value: 4, label: '4 beats' },
    { value: 8, label: '8 beats' },
    { value: 16, label: '16 beats' },
  ];
  const QUANTIZE_CHOICES = quantizeOptions.map((option) => [option, option]);
  const MORPH_CHOICES = snapshotMorphOptions.map((option) => [option.value, option.label]);
  // What a clip does after its loops, as pictures (24 × 14): nothing, stop, the next clip, a
  // random one, or a clip you name.
  const FOLLOW_ACTIONS = [
    { value: 'none', label: 'No follow action', path: 'M5 7 H19', iconOnly: true },
    { value: 'stop', label: 'Stop', path: 'M8 3 H16 V11 H8 Z', iconOnly: true },
    { value: 'next', label: 'Next clip', path: 'M4 7 H18 M14 3 L18 7 L14 11', iconOnly: true },
    { value: 'random', label: 'A random clip', path: 'M4 4 H8 L15 10 H20 M4 10 H8 L15 4 H20 M17 2 L20 4 L17 6 M17 8 L20 10 L17 12', iconOnly: true },
    { value: 'clip', label: 'A clip you choose', path: 'M5 12 V6 H18 M14 2 L18 6 L14 10', iconOnly: true },
  ];
  const FILL_CHANNELS = [[0, 'any'], ...Array.from({ length: 16 }, (_, i) => [i + 1, String(i + 1)])];
  let openFills = $state(new Set());
  const toggleFill = (clipId) => {
    const next = new Set(openFills);
    if (next.has(clipId)) next.delete(clipId); else next.add(clipId);
    openFills = next;
  };
  const laneTypes = ['note', 'chord', 'drum', 'cc', 'parameter'];
  const noteName = (note) => {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `${names[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
  };
  const patternForClip = (clip) => patterns.find((pattern) => pattern.patternId === clip.patternId) ?? null;
  const fillPatternsFor = (clip) => {
    const source = patternForClip(clip);
    const groupId = source?.variationGroupId ?? '';
    return patterns.filter((pattern) => pattern.patternId !== clip.patternId)
      .sort((a, b) => {
        const aRelated = groupId && a.variationGroupId === groupId ? 0 : 1;
        const bRelated = groupId && b.variationGroupId === groupId ? 0 : 1;
        return aRelated - bRelated;
      });
  };
  const followTargetsFor = (clip) => performance.clips.filter((candidate) =>
    candidate.clipId !== clip.clipId);
  const beatLabel = (beats) => `${Number(beats || 0).toFixed(Number.isInteger(beats) ? 0 : 2)} beats`;
  // Every lane a gesture can live on: a parameter or cc lane carries a value per step, and a
  // note lane carries velocities, which are not a curve. One picker drives both directions —
  // reading a movement out of a lane and putting one back on it — so there is never a question
  // of which lane a button meant.
  let gestureLanes = $derived(patterns.flatMap((p) =>
    (p.lanes ?? [])
      .filter((lane) => (lane.type === 'parameter' || lane.type === 'cc')
                        && !lane.lockSourceLaneId)
      .map((lane) => ({ patternId: p.patternId, laneId: lane.laneId,
                        label: `${p.name} · ${lane.name || lane.parameterId || 'lane'}` }))));
  let gestureLaneKey = $state('');
  let gestureDepth = $state(1);
  let gestureTarget = $derived(gestureLanes.find((l) => `${l.patternId}/${l.laneId}` === gestureLaneKey)
                               ?? gestureLanes[0] ?? null);

  /** A shape drawn small enough to recognise at a glance, which is the whole reason to keep a
      library rather than a list of names. */
  const gesturePath = (points) => (points ?? [])
    .map((value, i, all) =>
      `${i === 0 ? 'M' : 'L'} ${(i / Math.max(1, all.length - 1) * 100).toFixed(2)} ${((1 - value) * 20).toFixed(2)}`)
    .join(' ');

  const gestureLaneCount = (clip) =>
    patternForClip(clip)?.lanes.filter((lane) => lane.type === 'parameter'
      && !lane.lockSourceLaneId).length ?? 0;
  const preloadFor = (item) => performance.setlist.preloads.find(
    (preload) => preload.recordId === item.rackRecordId) ?? null;

  // --- the piano roll (note and chord lanes) -------------------------------------------
  // Pitch was a number you typed per step; now it is a row you click. Two octaves are
  // visible per lane, shifted with the octave buttons; the window opens where the lane's
  // notes already live. Note lanes are monophonic — clicking another row MOVES the step's
  // note; clicking the lit cell rests the step; dragging paints. Chord lanes stack: each
  // click toggles that pitch in the step's chord.
  const ROLL_ROWS = 25;
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
  let rollBase = $state({});
  let rollDrag = $state(null);   // { laneId, painting, lastIndex }

  function stepPitches(lane, step) {
    if (!step.active) return [];
    return lane.type === 'chord' && step.chordNotes.length > 0 ? step.chordNotes : [step.note];
  }

  function rollBaseFor(lane) {
    if (rollBase[lane.laneId] !== undefined) return rollBase[lane.laneId];
    const notes = lane.steps.flatMap((step) => stepPitches(lane, step));
    const low = notes.length > 0 ? Math.min(...notes) : 48;   // an empty lane opens at C2
    return Math.max(0, Math.min(127 - ROLL_ROWS + 1, Math.floor(low / 12) * 12));
  }

  function shiftRoll(lane, octaves) {
    rollBase[lane.laneId] = Math.max(0, Math.min(127 - ROLL_ROWS + 1,
      rollBaseFor(lane) + octaves * 12));
  }

  function rollCellFromEvent(lane, event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.max(0, Math.min(lane.stepCount - 1,
      Math.floor(((event.clientX - rect.left) / rect.width) * lane.stepCount)));
    const row = Math.max(0, Math.min(ROLL_ROWS - 1,
      ROLL_ROWS - 1 - Math.floor(((event.clientY - rect.top) / rect.height) * ROLL_ROWS)));
    return { index, note: rollBaseFor(lane) + row };
  }

  function rollDown(lane, event) {
    if (event.button === 2) return;   // right-click keeps its meaning: select the step
    event.preventDefault();
    selectedLaneId = lane.laneId;
    const { index, note } = rollCellFromEvent(lane, event);
    selectedStepIndex = index;
    const step = lane.steps[index];

    if (lane.type === 'chord') {
      const chord = stepPitches(lane, step);
      const nextChord = chord.includes(note)
        ? chord.filter((n) => n !== note)
        : [...chord, note].sort((a, b) => a - b);
      setStep(selectedPattern.patternId, lane.laneId, index,
              { active: nextChord.length > 0, chord: nextChord });
      return;   // chords are click-built, not painted
    }

    if (step.active && step.note === note) {
      setStep(selectedPattern.patternId, lane.laneId, index, { active: false });
      rollDrag = { laneId: lane.laneId, painting: false, lastIndex: index };
    } else {
      setStep(selectedPattern.patternId, lane.laneId, index, { active: true, note });
      rollDrag = { laneId: lane.laneId, painting: true, lastIndex: index };
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function rollMove(lane, event) {
    if (!rollDrag?.painting || rollDrag.laneId !== lane.laneId) return;
    const { index, note } = rollCellFromEvent(lane, event);
    if (index === rollDrag.lastIndex && lane.steps[index]?.active
        && lane.steps[index]?.note === note) return;
    rollDrag = { ...rollDrag, lastIndex: index };
    setStep(selectedPattern.patternId, lane.laneId, index, { active: true, note });
  }

  const rollUp = () => (rollDrag = null);

  // Value bars for cc/parameter lanes: the same bar-per-step gesture the arp grid uses. The
  // other per-step values are PatternStepRows under the selected lane.
  let barDrag = $state(null);   // { laneId, field, lastIndex }
  let rollSideWidth = $state(0);

  function barFromEvent(lane, event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.max(0, Math.min(lane.stepCount - 1,
      Math.floor(((event.clientX - rect.left) / rect.width) * lane.stepCount)));
    const height = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    return { index, height };
  }

  function barDown(lane, field, event) {
    event.preventDefault();
    barDrag = { laneId: lane.laneId, field, lastIndex: -1 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    barApply(lane, field, event);
  }

  function barApply(lane, field, event) {
    const { index, height } = barFromEvent(lane, event);
    setStep(selectedPattern.patternId, lane.laneId, index,
            { active: true, value: Math.round(height * 100) / 100 });
  }

  function barMove(lane, field, event) {
    if (!barDrag || barDrag.laneId !== lane.laneId || barDrag.field !== field) return;
    barApply(lane, field, event);
  }

  const barUp = () => (barDrag = null);

  // The playhead column, coarse on purpose: the clip's engine-reported phase mapped onto
  // this lane's own loop (lanes are polymetric, so each maps separately).
  function playingColumn(lane) {
    const clip = clipForSelectedPattern;
    if (!clip?.active || !selectedPattern || !(selectedPattern.lengthPpq > 0)) return -1;
    const laneBeats = lane.stepCount / Math.max(1, lane.stepsPerBeat);
    if (!(laneBeats > 0)) return -1;
    const beatsIn = (clip.phase * selectedPattern.lengthPpq) % laneBeats;
    return Math.floor((beatsIn / laneBeats) * lane.stepCount) % lane.stepCount;
  }

  function laneLabel(lane) {
    if (lane.type === 'parameter')
      return `${lane.name || 'Automation'} — ${lane.parameterId || 'unassigned'}`;
    if (lane.type === 'drum') return `${lane.name || 'Drum'} — ${noteName(lane.drumNote)}`;
    if (lane.type === 'cc') return `${lane.name || 'CC'} — CC${lane.ccNumber}`;
    return lane.name || 'Notes';
  }

  function stepValueLabel(lane, step) {
    if (lane.type === 'cc' || lane.type === 'parameter') return step.value.toFixed(2);
    if (lane.type === 'drum') return String(step.velocity);
    return noteName(step.note);
  }

  const visibleLaneCount = (pattern) => pattern.lanes.filter((lane) => !lane.lockSourceLaneId).length;
  const stepHasLocks = (lane, index) => selectedPattern?.lanes.some((candidate) =>
    candidate.lockSourceLaneId === lane.laneId && candidate.steps[index]?.active) === true;

  function selectLockKind(kind) {
    lockKind = kind;
    if (kind === 'cc' && !parts.some((part) => part.partId === lockTargetId)) {
      lockTargetId = selectedLane?.targetPartId || parts[0]?.partId || '';
      lockParameterId = '';
    }
  }

  function selectLockTarget(targetId) {
    lockTargetId = targetId;
    lockParameterId = '';
    const target = lockTargets.find((candidate) => candidate.id === targetId);
    if (lockKind === 'parameter' && target && target.kind !== 'macro') requestParameters(targetId);
  }

  function selectLockParameter(parameterId) {
    lockParameterId = parameterId;
    const parameter = availableLockParameters.find((candidate) => candidate.id === parameterId);
    if (parameter) lockValue = parameter.value;
  }

  function addParameterLock() {
    if (!selectedPattern || !selectedLane || selectedStepIndex < 0
        || !lockTargetId || !lockParameterId) return;
    setStepParameterLock(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                         lockTargetId, lockParameterId, lockValue);
  }

  function addCcLock() {
    if (!selectedPattern || !selectedLane || selectedStepIndex < 0
        || !parts.some((part) => part.partId === lockTargetId)) return;
    setStepCcLock(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                  lockTargetId, lockChannel, lockCcNumber, lockValue);
  }

  function lockName(lane) {
    const name = (lane.name || (lane.type === 'cc' ? `CC${lane.ccNumber}` : lane.parameterId))
      .replace(/^Lock\s*[—-]\s*/, '');
    return lane.targetName ? `${name} · ${lane.targetName}` : name;
  }

  function lockValueText(lane, step) {
    return lane.type === 'cc' ? String(Math.round(step.value * 127)) : `${Math.round(step.value * 100)}%`;
  }

  function addRoute() {
    if (!selectedModSource || !selectedModTarget || !modParameterId) return;
    addModulationRoute({
      sourceType: selectedModSource.type,
      ...(selectedModSource.sourceId ? { sourceId: selectedModSource.sourceId } : {}),
      sourceChannel: ['macro', 'lfo', 'envelope', 'mseg', 'random'].includes(selectedModSource.type)
        ? 0 : modChannel,
      sourceNumber: selectedModSource.type === 'midiCc' ? modCcNumber : 0,
    }, modTargetId, modParameterId, modAmount);
  }

  function routeSourceName(route) {
    if (route.sourceType === 'lfo') {
      const lfo = $hostState.rack.midiLfos.find((candidate) => candidate.lfoId === route.sourceId);
      return lfo ? `LFO · ${lfo.name}` : 'LFO · missing';
    }
    if (route.sourceType === 'envelope') {
      const envelope = $hostState.rack.envelopes.find(
        (candidate) => candidate.envelopeId === route.sourceId);
      return envelope ? `Envelope · ${envelope.name}` : 'Envelope · missing';
    }
    if (route.sourceType === 'mseg') {
      const mseg = $hostState.rack.msegs.find((candidate) => candidate.msegId === route.sourceId);
      return mseg ? `MSEG · ${mseg.name}` : 'MSEG · missing';
    }
    if (route.sourceType === 'random') {
      const random = $hostState.rack.randomModulators.find(
        (candidate) => candidate.randomId === route.sourceId);
      return random ? `Random · ${random.name}` : 'Random · missing';
    }
    if (route.sourceType === 'macro') {
      const macro = $hostState.rack.macros.find((candidate) => candidate.macroId === route.sourceId);
      return macro ? `Macro · ${macro.name}` : 'Macro · missing';
    }
    return fixedModSources.find((source) => source.type === route.sourceType)?.label
      ?? route.sourceType;
  }

  function routeSourceDetail(route) {
    const channel = route.sourceChannel > 0 ? `Ch ${route.sourceChannel}` : 'Omni';
    return ['macro', 'lfo', 'envelope', 'mseg', 'random'].includes(route.sourceType) ? ''
      : route.sourceType === 'midiCc' ? `${channel} · CC${route.sourceNumber}` : channel;
  }

  function routeLfo(lfo) {
    modSourceKey = `lfo:${lfo.lfoId}`;
    selectTool('modulation');
  }

  function routeEnvelope(envelope) {
    modSourceKey = `envelope:${envelope.envelopeId}`;
    selectTool('modulation');
  }

  function routeMseg(mseg) {
    modSourceKey = `mseg:${mseg.msegId}`;
    selectTool('modulation');
  }

  function routeRandom(random) {
    modSourceKey = `random:${random.randomId}`;
    selectTool('modulation');
  }

  // A pattern's seed decides how every probability rolls, on every loop, for ever — same seed,
  // same performance, across runs and machines (deterministicRoll in CompiledPattern.h). Minted
  // in the same range the native side uses, and never zero: setPatternOptions clamps to 1 and a
  // field that silently corrects what you typed is worse than one that will not take it.
  const newPatternSeed = () =>
    (Math.floor(Date.now() + Math.random() * 0x3fffffff) % 0x7ffffffe) + 1;

  function setPatternSeed(pattern, value) {
    const seed = Math.max(1, Math.floor(Number(value)) || 1);
    if (seed !== pattern.seed) setPatternOptions(pattern.patternId, { seed });
  }

  // It only does anything where a step's probability is between 1 and 99: a condition is loop
  // arithmetic rather than a roll, and 0 or 100 answers before the dice are reached. Saying so
  // is the difference between "this control is broken" and "nothing in here rolls yet".
  const patternRolls = (pattern) => (pattern?.lanes ?? []).some(
    (lane) => (lane.steps ?? []).some((step) => step.probability > 0 && step.probability < 100));

  async function importScalaFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('That Scala file is too large to be a tuning table.');
      const text = await file.text();
      const preview = parseScalaTuning(text, file.name);
      importScalaTuning(text, file.name);
      tuningFileMessage = `${preview.name} · ${preview.degreeCount} notes imported`;
    } catch (error) {
      tuningFileMessage = error?.message || 'That Scala file could not be read.';
    } finally {
      input.value = '';
    }
  }

  async function importGrooveFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('That groove file is too large.');
      const parsed = JSON.parse(await file.text());
      const timingOffsets = parsed.timingOffsets ?? parsed.timing;
      const velocityMultipliers = parsed.velocityMultipliers ?? parsed.velocity ?? [];
      if (!Array.isArray(timingOffsets) || timingOffsets.length < 2)
        throw new Error('A groove JSON file needs a timingOffsets array with at least two values.');
      importGrooveTemplate({
        name: parsed.name || file.name.replace(/\.[^.]+$/, ''),
        stepsPerBeat: parsed.stepsPerBeat ?? 4,
        timingOffsets,
        velocityMultipliers,
      });
      grooveFileMessage = `${parsed.name || file.name} imported`;
    } catch (error) {
      grooveFileMessage = error?.message || 'That groove file could not be read.';
    } finally {
      input.value = '';
    }
  }

  const tuningPartName = (part, index) => part.hardware
    ? (part.midiOutputName || part.deviceProfileId || `Hardware part ${index + 1}`)
    : (part.pluginName || `Software part ${index + 1}`);

  const takeDuration = (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, '0')}`;
  };
</script>

<div class="perf-panel" data-testid="host-performance-panel">
  <div class="perf-toolbar">
    <h2>Performance</h2>
    <span class="perf-spacer"></span>
    <div class="retrospective"
         title={`The last ${performance.capture.historyCapacitySeconds} seconds of MIDI are remembered even while stopped`}>
      <span class="history-dot" class:ready={performance.capture.historyHasNotes}></span>
      <button type="button" class="retro-button"
              onclick={() => captureRecentMidi(retrospectiveSeconds)}
              data-testid="perf-capture-recent">↶ Capture last</button>
      <select aria-label="Retrospective capture length" value={retrospectiveSeconds}
              onchange={(e) => (retrospectiveSeconds = Number(e.currentTarget.value))}>
        {#each [10, 30, 60, 120] as seconds (seconds)}
          <option value={seconds}>{seconds < 60 ? `${seconds} sec` : `${seconds / 60} min`}</option>
        {/each}
      </select>
      {#if performance.capture.lastPatternId}
        <span class="retro-result" class:trimmed={performance.capture.lastTrimmed}
              title={performance.capture.lastTrimmed
                ? 'The journal or 128-step editor limit kept the most recent section'
                : 'The captured take is now an editable clip'}>
          {performance.capture.lastNoteCount} notes → {performance.capture.lastStepCount} steps
        </span>
      {/if}
    </div>
    {#if performance.capture.armed}
      <button type="button" class="toggle on recording" onclick={() => disarmCapture()}
              title="Capture is armed — played notes are written into the armed lane">
        ● Capturing
      </button>
    {/if}
  </div>

  <!-- One rail: every tool is one click, under the group it belongs to. A group's heading goes
       back to the tool last used in it. -->
  <div class="perf-layout">
  <nav class="performance-navigation perf-rail" aria-label="Performance tools">
    {#each PERFORMANCE_GROUPS as group (group.id)}
      <button type="button" class="rail-group" class:on={activeGroup.id === group.id}
        aria-pressed={activeGroup.id === group.id} data-testid={`perf-group-${group.id}`}
        onclick={() => selectTool(navigation.lastTools[group.id])}>{group.label}</button>
      {#each group.tools as tool (tool.id)}
        <button type="button" class="rail-tool" class:on={tab === tool.id} aria-pressed={tab === tool.id}
          onclick={() => selectTool(tool.id)} data-testid={`perf-tab-${tool.id}`}>{tool.label}</button>
      {/each}
    {/each}
  </nav>
  <div class="perf-content">

  {#if tab === 'patterns'}
    <div class="perf-body">
      <div class="pattern-list">
        <div class="perf-head">
          <strong>Patterns</strong>
          <button type="button" onclick={() => addPattern()} data-testid="perf-add-pattern">+ Pattern</button>
        </div>
        {#if patterns.length === 0}
          <div class="empty-hint">No patterns yet — one pattern holds any number of lanes.</div>
        {/if}
        {#each patterns as pattern (pattern.patternId)}
          <div class="pattern-row" class:on={selectedPattern?.patternId === pattern.patternId}>
            {#if pattern.variationLabel}
              <span class="variation-badge" title={`Pattern variation ${pattern.variationLabel}`}>
                {pattern.variationLabel}
              </span>
            {/if}
            <button type="button" class="ghost pattern-name"
                    onclick={() => { selectedPatternId = pattern.patternId; selectedLaneId = ''; selectedStepIndex = -1; }}>
              {pattern.name}
            </button>
            <span class="pattern-detail">{visibleLaneCount(pattern)} {visibleLaneCount(pattern) === 1 ? 'lane' : 'lanes'}</span>
            <button type="button" class="ghost" title="Make a launchable clip from this pattern"
                    onclick={() => addClip(pattern.patternId)}>+ Clip</button>
            <HostConfirmButton identity={JSON.stringify([pattern.patternId])} aria-label="Remove pattern" type="button" class="ghost danger" title="Remove this pattern and its clips"
                    onclick={() => removePattern(pattern.patternId)}>×</HostConfirmButton>
          </div>
        {/each}
      </div>

      {#if selectedPattern}
        <div class="pattern-editor">
          <div class="perf-head">
            <input type="text" class="pattern-title" value={selectedPattern.name}
                   onchange={(e) => renamePattern(selectedPattern.patternId, e.currentTarget.value)} />
            {#if selectedPattern.variationLabel}
              <span class="variation-badge editor-badge"
                    title={selectedPattern.variationLabel === 'A'
                      ? 'Authored source pattern' : 'Generated from variation A'}>
                {selectedPattern.variationLabel}
              </span>
            {/if}
            <div class="mini-field variation-amount"
                 title="How far B, C and D move away from the authored A pattern">
              Variations
              <Segmented options={[{ value: 0.25, label: 'Subtle' }, { value: 0.55, label: 'Balanced' }, { value: 0.85, label: 'Bold' }]}
                         value={variationAmount} label="How far variations move" testid="variation-amount"
                         onchange={(v) => { variationAmount = v; }} />
            </div>
            <button type="button" class="variation-create"
                    title="Create related feel, sparse and fill patterns; existing variation clips keep working"
                    onclick={() => createPatternVariations(selectedPattern.patternId, variationAmount)}>
              {selectedPattern.variationLabel ? 'Regenerate B/C/D' : 'Create B/C/D'}
            </button>
            <div class="mini-field" title="Delays every second step of each lane's own grid">
              Swing
              <ScrubValue value={Math.round(selectedPattern.swing * 100)} min={0} max={75} unit="%" label="Swing" testid="pattern-swing"
                          onchange={(v) => setPatternOptions(selectedPattern.patternId, { swing: v / 100 })} />
            </div>
            <label class="mini-field seed-field"
                   title={patternRolls(selectedPattern)
                     ? 'Which way every probability rolls. The same seed plays the same performance, every run and every machine — write it down and you can rehearse it.'
                     : 'Which way every probability rolls — but no step in this pattern has a probability between 1 and 99, so nothing here rolls yet and the seed changes nothing.'}>
              Seed
              <span class="seed-row">
                <input type="number" min="1" max="2147483646" step="1" data-testid="pattern-seed"
                       class:inert={!patternRolls(selectedPattern)}
                       value={selectedPattern.seed}
                       onchange={(e) => setPatternSeed(selectedPattern, e.currentTarget.value)} />
                <button type="button" class="ghost" data-testid="pattern-reseed"
                        title="Roll a different performance out of the same steps"
                        onclick={() => setPatternSeed(selectedPattern, newPatternSeed())}>NEW</button>
              </span>
            </label>
            <select value="" aria-label="Add a lane"
                    onchange={(e) => { if (e.currentTarget.value) addLane(selectedPattern.patternId, { type: e.currentTarget.value }); e.currentTarget.value = ''; }}>
              <option value="" disabled>+ Add lane…</option>
              {#each laneTypes as type (type)}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </div>

          <div class="groove-toolbar">
            <strong>Groove</strong>
            <select bind:value={selectedGrooveId} aria-label="Groove template">
              {#each grooves as groove (groove.grooveId)}
                <option value={groove.grooveId}>{groove.name}</option>
              {/each}
            </select>
            <div class="mini-field groove-strength">Strength
              <ScrubValue value={Math.round(grooveAmount * 100)} min={0} max={100} step={5} fineStep={1} unit="%"
                          label="Groove strength" testid="groove-strength" onchange={(v) => { grooveAmount = v / 100; }} />
            </div>
            <PropertyToggle compact label="Velocity accents" value={grooveVelocity}
                            onchange={(on) => { grooveVelocity = on; }} />
            <button type="button" disabled={!selectedGroove}
                    title="Commit this feel into the pattern's editable microtiming and velocity steps"
                    onclick={() => applyGrooveTemplate(selectedPattern.patternId,
                                                       selectedGroove.grooveId,
                                                       Number(grooveAmount), grooveVelocity)}>
              Apply
            </button>
            <button type="button" data-testid="steal-groove"
                    disabled={!selectedPattern || grooves.length >= 32}
                    title={grooves.length >= 32
                      ? 'Remove a groove before keeping another one'
                      : "Read this pattern's own feel into a groove you can wear on other patterns. Timing comes back exactly; velocity is kept as a multiplier, so it shapes another pattern's dynamics rather than reproducing these."}
                    onclick={() => extractGrooveTemplate(selectedPattern.patternId)}>
              Steal this feel
            </button>
            <label class="groove-picker">
              <span>Import JSON…</span>
              <input type="file" accept=".json,application/json,text/plain" onchange={importGrooveFile} />
            </label>
            {#if selectedGroove?.source === 'imported'}
              <HostConfirmButton identity={JSON.stringify([selectedGroove.grooveId])} title="Remove groove template" aria-label="Remove groove template" type="button" class="ghost danger"
                      onclick={() => removeGrooveTemplate(selectedGroove.grooveId)}>Remove template</HostConfirmButton>
            {/if}
            {#if selectedPattern.appliedGrooveId}
              <span class="groove-applied">Last applied:
                {grooves.find((groove) => groove.grooveId === selectedPattern.appliedGrooveId)?.name ?? 'removed template'}
                · {Math.round(selectedPattern.appliedGrooveAmount * 100)}%</span>
            {/if}
            {#if grooveFileMessage}<span class="groove-message">{grooveFileMessage}</span>{/if}
          </div>

          {#each editableLanes as lane (lane.laneId)}
            <div class="lane" class:on={selectedLane?.laneId === lane.laneId}
                 class:unresolved={!lane.resolved}>
              <div class="lane-head">
                <button type="button" class="ghost lane-name"
                        onclick={() => { selectedLaneId = lane.laneId; selectedStepIndex = -1; }}>
                  {laneLabel(lane)}
                </button>
                <span class="lane-target" title={lane.resolved ? '' : 'unresolved — this target is gone or carries a different plug-in'}>
                  {lane.targetName || (lane.resolved ? '' : 'missing')}
                </span>
                <PropertyToggle compact label="Mute" value={lane.muted}
                                ariaLabel={`Mute ${laneLabel(lane)}`}
                                onchange={(on) => setLaneOptions(selectedPattern.patternId, lane.laneId, { muted: on })} />
                <HostConfirmButton identity={JSON.stringify([selectedPattern.patternId, lane.laneId])} aria-label="Remove lane" type="button" class="ghost danger" title="Remove this lane"
                        onclick={() => removeLane(selectedPattern.patternId, lane.laneId)}>×</HostConfirmButton>
              </div>

              {#if lane.type === 'note' || lane.type === 'chord'}
                <!-- The roll: rows are pitches, click places the note there, the lit cell
                     clicked again rests the step, dragging paints. Chord lanes stack
                     pitches per column instead of moving one. -->
                <div class="roll-wrap">
                  <div class="roll-ruler">
                    {#each Array.from({ length: ROLL_ROWS }, (_, r) => rollBaseFor(lane) + ROLL_ROWS - 1 - r) as rowNote (rowNote)}
                      <span class="ruler-cell" class:black={BLACK_KEYS.has(rowNote % 12)}>
                        {rowNote % 12 === 0 ? noteName(rowNote) : ''}</span>
                    {/each}
                  </div>
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="piano-roll" data-testid={`piano-roll-${lane.laneId}`}
                       onpointerdown={(e) => rollDown(lane, e)}
                       onpointermove={(e) => rollMove(lane, e)}
                       onpointerup={rollUp} onpointercancel={rollUp}
                       oncontextmenu={(e) => {
                         e.preventDefault();
                         selectedLaneId = lane.laneId;
                         selectedStepIndex = rollCellFromEvent(lane, e).index;
                       }}>
                    {#each lane.steps as step, index (index)}
                      <div class="roll-col" class:beat={index % lane.stepsPerBeat === 0}
                           class:playing={playingColumn(lane) === index}
                           class:locked={stepHasLocks(lane, index)}
                           class:selected={selectedLane?.laneId === lane.laneId && selectedStepIndex === index}>
                        {#each Array.from({ length: ROLL_ROWS }, (_, r) => rollBaseFor(lane) + ROLL_ROWS - 1 - r) as rowNote (rowNote)}
                          <div class="roll-cell"
                               class:black={BLACK_KEYS.has(rowNote % 12)}
                               class:on={stepPitches(lane, step).includes(rowNote)}
                               class:tie={step.tie && stepPitches(lane, step).includes(rowNote)}></div>
                        {/each}
                      </div>
                    {/each}
                  </div>
                  <div class="roll-side" bind:clientWidth={rollSideWidth}>
                    <button type="button" class="ghost" title="One octave up"
                            onclick={() => shiftRoll(lane, 1)}>▲</button>
                    <button type="button" class="ghost" title="One octave down"
                            onclick={() => shiftRoll(lane, -1)}>▼</button>
                  </div>
                </div>
              {:else if lane.type === 'cc' || lane.type === 'parameter'}
                <!-- A value curve is bars, not a slider hidden behind each step. Dragging a
                     column writes and activates it; the step options still deactivate. -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="bar-lane tall" data-testid={`value-lane-${lane.laneId}`}
                     title="Value per step — drag"
                     onpointerdown={(e) => barDown(lane, 'value', e)}
                     onpointermove={(e) => barMove(lane, 'value', e)}
                     onpointerup={barUp} onpointercancel={barUp}
                     oncontextmenu={(e) => {
                       e.preventDefault();
                       selectedLaneId = lane.laneId;
                       selectedStepIndex = barFromEvent(lane, e).index;
                     }}>
                  {#each lane.steps as step, index (index)}
                    <div class="bar-col" class:idle={!step.active}
                         class:beat={index % lane.stepsPerBeat === 0}
                         class:locked={stepHasLocks(lane, index)}
                         class:playing={playingColumn(lane) === index}>
                      {#if step.active}
                        <div class="bar-fill value" style={`height: ${Math.max(step.value * 100, 3)}%`}></div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="step-grid" style={`--steps: ${lane.stepCount}`}>
                  {#each lane.steps as step, index (index)}
                    <button type="button" class="step"
                            class:active={step.active}
                            class:tie={step.tie}
                            class:beat={index % lane.stepsPerBeat === 0}
                            class:locked={stepHasLocks(lane, index)}
                            class:selected={selectedLane?.laneId === lane.laneId && selectedStepIndex === index}
                            title={step.active ? `${stepValueLabel(lane, step)} · vel ${step.velocity} · ${step.probability}%` : `step ${index + 1}`}
                            onclick={() => {
                              selectedLaneId = lane.laneId;
                              selectedStepIndex = index;
                              toggleStep(selectedPattern.patternId, lane.laneId, index);
                            }}
                            oncontextmenu={(e) => { e.preventDefault(); selectedLaneId = lane.laneId; selectedStepIndex = index; }}>
                      {#if step.active}<span class="step-mark">{step.ratchets > 1 ? step.ratchets : ''}</span>{/if}
                    </button>
                  {/each}
                </div>
              {/if}
              {#if selectedLane?.laneId === lane.laneId}
                <!-- The step values as rows under the lane: drag along one to draw it. -->
                <PatternStepRows {lane} playing={playingColumn(lane)} selected={selectedStepIndex}
                                 gutterLeft={lane.type === 'note' || lane.type === 'chord' ? 29 : 0}
                                 gutterRight={lane.type === 'note' || lane.type === 'chord' ? rollSideWidth + 3 : 0}
                                 onset={(index, fields) => setStep(selectedPattern.patternId, lane.laneId, index, fields)}
                                 onselect={(index) => { selectedStepIndex = index; }} />
              {/if}
            </div>
          {/each}

          {#if selectedLane}
            <div class="lane-options" data-testid="perf-lane-options">
              <div class="mini-field">Steps
                <ScrubValue value={selectedLane.stepCount} min={1} max={64} label="Steps in this lane" testid="lane-steps"
                            onchange={(stepCount) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId, { stepCount })} />
              </div>
              <div class="mini-field" title="Steps per beat — a lane's own rate, which is what makes polymeter free">
                Steps per beat
                <Segmented options={[1, 2, 3, 4, 6, 8, 12, 16].map((rate) => ({ value: rate, label: String(rate), title: `${rate} steps per beat` }))}
                           value={selectedLane.stepsPerBeat} label="Steps per beat" testid="lane-rate"
                           onchange={(stepsPerBeat) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId, { stepsPerBeat })} />
              </div>
              {#if selectedLane.type !== 'parameter'}
                <label class="mini-field">Part
                  <select value={selectedLane.targetPartId}
                          onchange={(e) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId,
                                                          { targetPartId: e.currentTarget.value })}>
                    {#each parts as part (part.partId)}
                      <option value={part.partId}>{part.pluginName || 'Empty part'}</option>
                    {/each}
                  </select>
                </label>
              {/if}
              {#if selectedLane.type === 'drum'}
                <div class="mini-field">Note
                  <ScrubValue value={selectedLane.drumNote} min={0} max={127} format={noteName} label="Drum note" testid="lane-drum-note"
                              onchange={(drumNote) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId, { drumNote })} />
                </div>
              {/if}
              {#if selectedLane.type === 'cc'}
                <div class="mini-field">CC
                  <ScrubValue value={selectedLane.ccNumber} min={0} max={127} label="CC number" testid="lane-cc"
                              onchange={(ccNumber) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId, { ccNumber })} />
                </div>
              {/if}
              {#if selectedLane.type === 'cc' || selectedLane.type === 'parameter'}
                <PropertyToggle compact label="Glide" value={selectedLane.glide}
                                ariaLabel="Interpolate between steps"
                                onchange={(on) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId, { glide: on })} />
              {/if}
              <div class="mini-field" title="Spread N hits evenly over the lane's steps">
                Euclid
                <ScrubValue value={selectedLane.euclidPulses} min={0} max={selectedLane.stepCount} pixelsPerStep={8}
                            format={(n) => (n === 0 ? 'off' : `${n} hits`)} label="Euclidean hits" testid="lane-euclid"
                            onchange={(pulses) => euclidFill(selectedPattern.patternId, selectedLane.laneId, pulses)} />
              </div>
              <HostConfirmButton identity={JSON.stringify([selectedPattern.patternId, selectedLane.laneId])} title="Clear lane" aria-label="Clear lane" type="button" class="ghost"
                      onclick={() => clearLane(selectedPattern.patternId, selectedLane.laneId)}>Clear</HostConfirmButton>
              {#if clipForSelectedPattern}
                <button type="button" class="toggle"
                        class:on={performance.capture.armed && performance.capture.laneId === selectedLane.laneId}
                        title="Arm this lane: played notes are quantized onto its grid"
                        onclick={() => (performance.capture.armed && performance.capture.laneId === selectedLane.laneId
                                          ? disarmCapture()
                                          : armCapture(clipForSelectedPattern.clipId, selectedLane.laneId))}
                        data-testid="perf-arm-capture">● Capture</button>
              {/if}
            </div>
          {/if}

          {#if selectedStep && selectedLane}
            <div class="step-options" data-testid="perf-step-options">
              <strong>Step {selectedStepIndex + 1}</strong>
              {#if selectedLane.type === 'note' || selectedLane.type === 'chord'}
                <div class="mini-field">Note
                  <ScrubValue value={selectedStep.note} min={0} max={127} format={noteName} label="Note" testid="step-note"
                              onchange={(note) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex, { note })} />
                </div>
              {/if}
              {#if selectedLane.type === 'cc' || selectedLane.type === 'parameter'}
                <div class="mini-field">Value
                  <ScrubValue value={Math.round(selectedStep.value * 100)} min={0} max={100} unit="%" label="Value" testid="step-value"
                              onchange={(v) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex, { value: v / 100 })} />
                </div>
              {:else}
                <PropertyToggle compact label="Tie" value={selectedStep.tie} ariaLabel="Tie to the previous step"
                                onchange={(on) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex, { tie: on })} />
              {/if}
              <div class="mini-field" title="Play only on every Nth loop">Plays
                <ScrubValue value={selectedStep.every} min={1} max={16} pixelsPerStep={8} label="Play on every Nth loop" testid="step-every"
                            format={(n) => (n === 1 ? 'every loop' : `every ${n} loops`)}
                            onchange={(every) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex, { every })} />
              </div>
              <span class="step-hint">Velocity, length, chance, nudge and ratchet: drag them in the rows under the lane.</span>

              <div class="lock-editor" data-testid="perf-parameter-locks">
                <div class="lock-head">
                  <strong>Parameter locks</strong>
                  <span>Values recalled on this step only</span>
                  {#if selectedStepLocks.length > 0}
                    <HostConfirmButton identity={JSON.stringify([selectedPattern.patternId, selectedLane.laneId,
                                                          selectedStepIndex])} title="Clear step locks" aria-label="Clear step locks" type="button" class="ghost danger"
                            onclick={() => clearStepLocks(selectedPattern.patternId, selectedLane.laneId,
                                                          selectedStepIndex)}>Clear step</HostConfirmButton>
                  {/if}
                </div>

                {#if selectedStepLocks.length > 0}
                  <div class="lock-list">
                    {#each selectedStepLocks as lockLane (lockLane.laneId)}
                      {@const lockStep = lockLane.steps[selectedStepIndex]}
                      <div class="lock-row">
                        <span class="lock-name" title={lockName(lockLane)}>{lockName(lockLane)}</span>
                        <input type="range" min="0" max="1" step="0.001" value={lockStep.value}
                               aria-label={`${lockName(lockLane)} locked value`}
                               onchange={(e) => lockLane.type === 'cc'
                                 ? setStepCcLock(selectedPattern.patternId, selectedLane.laneId,
                                     selectedStepIndex, lockLane.targetPartId, lockLane.channel,
                                     lockLane.ccNumber, Number(e.currentTarget.value))
                                 : setStepParameterLock(selectedPattern.patternId, selectedLane.laneId,
                                     selectedStepIndex, lockLane.targetId, lockLane.parameterId,
                                     Number(e.currentTarget.value))} />
                        <output>{lockValueText(lockLane, lockStep)}</output>
                        <HostConfirmButton identity={JSON.stringify([selectedPattern.patternId, selectedLane.laneId,
                                                             selectedStepIndex, lockLane.laneId])} aria-label="Remove step lock" type="button" class="ghost danger" title="Remove this lock"
                                onclick={() => removeStepLock(selectedPattern.patternId, selectedLane.laneId,
                                                             selectedStepIndex, lockLane.laneId)}>×</HostConfirmButton>
                      </div>
                    {/each}
                  </div>
                {/if}

                <div class="lock-add">
                  <label class="mini-field">Type
                    <select value={lockKind} onchange={(e) => selectLockKind(e.currentTarget.value)}>
                      <option value="parameter">Plug-in / macro / mixer</option>
                      <option value="cc">Hardware MIDI CC</option>
                    </select>
                  </label>

                  {#if lockKind === 'parameter'}
                    <label class="mini-field lock-target">Target
                      <select value={lockTargetId}
                              onchange={(e) => selectLockTarget(e.currentTarget.value)}>
                        {#each lockTargets as target (target.id)}
                          <option value={target.id}>{target.label}</option>
                        {/each}
                      </select>
                    </label>
                    <label class="mini-field lock-parameter">Parameter
                      <select value={lockParameterId} disabled={availableLockParameters.length === 0}
                              onchange={(e) => selectLockParameter(e.currentTarget.value)}>
                        {#if availableLockParameters.length === 0}
                          <option value="">Loading parameters…</option>
                        {:else}
                          {#each availableLockParameters as parameter (parameter.id)}
                            <option value={parameter.id}>{parameter.group ? `${parameter.group} — ` : ''}{parameter.name}</option>
                          {/each}
                        {/if}
                      </select>
                    </label>
                    <label class="mini-field lock-value">Value
                      <input type="range" min="0" max="1" step="0.001" value={lockValue}
                             oninput={(e) => (lockValue = Number(e.currentTarget.value))} />
                    </label>
                    <output class="lock-readout">{Math.round(lockValue * 100)}%</output>
                    <button type="button" class="lock-button" disabled={!lockTargetId || !lockParameterId}
                            onclick={addParameterLock}>+ Lock</button>
                  {:else}
                    <label class="mini-field lock-target">Part / output
                      <select value={lockTargetId}
                              onchange={(e) => selectLockTarget(e.currentTarget.value)}>
                        {#each parts as part, index (part.partId)}
                          <option value={part.partId}>
                            {part.hardware ? (part.midiOutputName || `Hardware part ${index + 1}`)
                              : (part.pluginName || `Part ${index + 1}`)}
                          </option>
                        {/each}
                      </select>
                    </label>
                    <label class="mini-field">Channel
                      <input type="number" min="1" max="16" value={lockChannel}
                             oninput={(e) => (lockChannel = Math.max(1, Math.min(16,
                               Number(e.currentTarget.value))))} />
                    </label>
                    <label class="mini-field">CC
                      <input type="number" min="0" max="127" value={lockCcNumber}
                             oninput={(e) => (lockCcNumber = Math.max(0, Math.min(127,
                               Number(e.currentTarget.value))))} />
                    </label>
                    <label class="mini-field lock-value">Value
                      <input type="range" min="0" max="127" step="1" value={Math.round(lockValue * 127)}
                             oninput={(e) => (lockValue = Number(e.currentTarget.value) / 127)} />
                    </label>
                    <output class="lock-readout">{Math.round(lockValue * 127)}</output>
                    <button type="button" class="lock-button"
                            disabled={!parts.some((part) => part.partId === lockTargetId)}
                            onclick={addCcLock}>+ CC lock</button>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if tab === 'looper'}
    <div class="looper-body" data-testid="perf-midi-looper">
      <div class="looper-toolbar">
        <div>
          <strong>MIDI Looper</strong>
          <div class="looper-hint">The first pass sets a whole-beat loop. Every layer keeps its own length.</div>
        </div>
        <span class="perf-spacer"></span>
        {#if performance.looper.recording}
          <span class="recording-status">
            ● {performance.looper.overdubbing ? 'Overdubbing' : 'Recording first pass'}
          </span>
          <button type="button" class="looper-record finish" onclick={() => finishMidiLoop()}
                  data-testid="perf-finish-midi-loop">
            ■ {performance.looper.overdubbing ? 'Finish overdub' : 'Close and loop'}
          </button>
          <button type="button" class="ghost" onclick={() => cancelMidiLoop()}>Cancel</button>
        {:else}
          <button type="button" class="looper-record" onclick={() => startMidiLoop()}
                  data-testid="perf-start-midi-loop">● Record new layer</button>
        {/if}
      </div>

      {#if looperLayers.length === 0}
        <div class="looper-empty">
          Play naturally after pressing <strong>Record new layer</strong>, then close the loop.
          Hostage starts the transport, creates the editable pattern and begins playback.
        </div>
      {:else}
        <div class="looper-layers">
          {#each looperLayers as layer, index (layer.clipId)}
            {@const layerPattern = patternForClip(layer)}
            <div class="looper-layer" class:active={layer.active}
                 class:target={performance.looper.targetClipId === layer.clipId}>
              <span class="layer-number">{index + 1}</span>
              <button type="button" class="clip-launch"
                      title={layer.active ? 'Stop this layer' : 'Start this layer'}
                      onclick={() => (layer.active ? stopClip(layer.clipId) : launchClip(layer.clipId))}>
                {layer.pending ? '⧗' : layer.active ? '■' : '▶'}
              </button>
              <input class="layer-name" value={layer.name} aria-label={`Layer ${index + 1} name`}
                     onchange={(e) => setClipOptions(layer.clipId, { name: e.currentTarget.value })} />
              <span class="layer-length">{beatLabel(layerPattern?.lengthPpq)}</span>
              <span class="clip-phase layer-phase" aria-hidden="true">
                <span class="clip-phase-fill" style={`width: ${Math.round(layer.phase * 100)}%`}></span>
              </span>
              <button type="button" class="overdub"
                      disabled={performance.looper.recording}
                      title="Record another pass into this layer without changing its length"
                      onclick={() => startMidiLoop(layer.clipId)}>
                + Overdub
              </button>
              <span class="pass-count">{layer.overdubPasses} {layer.overdubPasses === 1 ? 'overdub' : 'overdubs'}</span>
              <HostConfirmButton identity={JSON.stringify([layer.clipId])} aria-label="Remove MIDI loop" type="button" class="ghost danger"
                      disabled={performance.looper.recording
                        || (performance.gestures.recording && performance.gestures.targetClipId === layer.clipId)}
                      title="Remove this layer and its recorded pattern"
                      onclick={() => removeMidiLoop(layer.clipId)}>×</HostConfirmButton>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if tab === 'gestures'}
    <div class="gesture-body" data-testid="perf-gesture-recorder">
      <div class="looper-toolbar gesture-toolbar">
        <div>
          <strong>Gesture Recorder</strong>
          <div class="looper-hint">
            Record Hostage controls, plug-in knobs and CTRL49 movements as editable automation.
          </div>
        </div>
        <span class="perf-spacer"></span>
        {#if performance.gestures.recording}
          <span class="recording-status gesture-status">
            ● {performance.gestures.mode === 'new' ? 'Recording new gesture'
              : performance.gestures.mode === 'replace' ? 'Replacing touched controls'
              : 'Overdubbing gestures'}
          </span>
          <button type="button" class="looper-record finish"
                  onclick={() => finishGestureRecording()}
                  data-testid="perf-finish-gesture">■ Finish</button>
          <button type="button" class="ghost" onclick={() => cancelGestureRecording()}>Cancel</button>
        {:else}
          <button type="button" class="looper-record gesture-record"
                  onclick={() => startGestureRecording()}
                  data-testid="perf-start-gesture">● Record new gesture</button>
        {/if}
      </div>

      <div class="gesture-help">
        Press record, move any mapped knob, fader, macro or plug-in parameter, then finish.
        The take is tempo-synced and glides between the values you performed.
        <strong>Replace</strong> clears only the controls you touch; <strong>Overdub</strong> merges them.
      </div>

      {#if performance.gestures.truncated}
        <div class="gesture-warning">
          The take reached {performance.gestures.maxPoints} points; its earlier movement is intact,
          but recording stopped accepting new points.
        </div>
      {/if}

      {#if gestureTargets.length === 0}
        <div class="looper-empty">
          There are no gesture performances or MIDI loop layers yet. Record a new gesture above,
          or make a MIDI loop first and add movement to that layer.
        </div>
      {:else}
        <div class="looper-layers gesture-layers">
          {#each gestureTargets as clip, index (clip.clipId)}
            {@const clipPattern = patternForClip(clip)}
            {@const automationCount = gestureLaneCount(clip)}
            <div class="looper-layer gesture-layer" class:active={clip.active}
                 class:target={performance.gestures.targetClipId === clip.clipId}>
              <span class="layer-number">{index + 1}</span>
              <button type="button" class="clip-launch"
                      title={clip.active ? 'Stop this performance' : 'Start this performance'}
                      onclick={() => (clip.active ? stopClip(clip.clipId) : launchClip(clip.clipId))}>
                {clip.pending ? '⧗' : clip.active ? '■' : '▶'}
              </button>
              <input class="layer-name" value={clip.name} aria-label={`Gesture ${index + 1} name`}
                     onchange={(e) => setClipOptions(clip.clipId, { name: e.currentTarget.value })} />
              <span class="gesture-kind">{clip.looperLayer ? 'MIDI layer' : 'Gesture'}</span>
              <span class="layer-length">{beatLabel(clipPattern?.lengthPpq)}</span>
              <span class="gesture-lanes">{automationCount} {automationCount === 1 ? 'control' : 'controls'}</span>
              <span class="clip-phase layer-phase" aria-hidden="true">
                <span class="clip-phase-fill" style={`width: ${Math.round(clip.phase * 100)}%`}></span>
              </span>
              <button type="button" class="overdub" disabled={performance.gestures.recording}
                      title="Merge another movement pass into this clip"
                      onclick={() => startGestureRecording(clip.clipId, 'overdub')}>+ Overdub</button>
              <button type="button" class="gesture-replace" disabled={performance.gestures.recording}
                      title="Replace only the controls moved in the new take"
                      onclick={() => startGestureRecording(clip.clipId, 'replace')}>Replace</button>
              <HostConfirmButton identity={JSON.stringify([clip.clipId])} aria-label="Clear gesture lanes" type="button" class="ghost" disabled={performance.gestures.recording || automationCount === 0}
                      title="Clear every recorded automation lane in this clip"
                      onclick={() => clearGestureLanes(clip.clipId)}>Clear</HostConfirmButton>
              <span class="pass-count">{clip.gesturePasses} {clip.gesturePasses === 1 ? 'take' : 'takes'}</span>
              {#if clip.gestureClip}
                <HostConfirmButton identity={JSON.stringify([clip.clipId])} aria-label="Remove clip" type="button" class="ghost danger" disabled={performance.gestures.recording}
                        title="Remove this gesture performance and its private pattern"
                        onclick={() => removeClip(clip.clipId)}>×</HostConfirmButton>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- THE GESTURE LIBRARY. There was a groove library for the timing of notes and no
           equivalent for the shape of a movement, though they are the same kind of reusable
           human artefact: the sweep you do at the end of a build, the wobble you always put on
           the filter. A recorded gesture was a performance of one lane and nothing more. -->
      <div class="gesture-library" data-testid="gesture-library">
        <div class="looper-toolbar">
          <div>
            <strong>Gesture library</strong>
            <div class="looper-hint">
              Shapes you can put on any parameter or CC lane, at any length.
            </div>
          </div>
          <span class="perf-spacer"></span>
          <label class="mini-field" title="Which lane a shape is read from, and put onto">
            Lane
            <select value={gestureLaneKey} aria-label="Gesture lane"
                    disabled={gestureLanes.length === 0}
                    onchange={(e) => (gestureLaneKey = e.currentTarget.value)}>
              {#each gestureLanes as lane (`${lane.patternId}/${lane.laneId}`)}
                <option value={`${lane.patternId}/${lane.laneId}`}>{lane.label}</option>
              {/each}
            </select>
          </label>
          <label class="mini-field" title="How deep the movement goes. The same shape, gentler — not a blend with whatever the lane held.">
            Depth
            <select value={String(gestureDepth)} aria-label="Gesture depth"
                    onchange={(e) => (gestureDepth = Number(e.currentTarget.value))}>
              <option value="1">Full</option>
              <option value="0.6">Gentle</option>
              <option value="0.3">Barely</option>
            </select>
          </label>
          <button type="button" class="ghost" data-testid="keep-gesture"
                  disabled={!gestureTarget}
                  title="Read the movement out of this lane and keep it. Needs at least two steps that moved something — one value is a position, not a movement."
                  onclick={() => extractGestureShape(gestureTarget.patternId, gestureTarget.laneId)}>
            Keep this movement
          </button>
        </div>

        {#if gestureLanes.length === 0}
          <div class="looper-empty">
            No parameter or CC lanes yet. Record a gesture, or add a parameter lane to a pattern —
            a note lane carries velocities, which are not a curve.
          </div>
        {/if}

        <div class="gesture-shapes">
          {#each performance.gestureShapes as shape (shape.gestureId)}
            <div class="gesture-shape" data-testid="gesture-shape">
              <svg class="shape-thumb" viewBox="0 0 100 20" preserveAspectRatio="none"
                   aria-hidden="true" data-testid="gesture-thumb">
                <path d={gesturePath(shape.points)} />
              </svg>
              <span class="shape-name">{shape.name}</span>
              {#if shape.source === 'factory'}<span class="badge">FACTORY</span>{/if}
              <button type="button" class="ghost" data-testid="apply-gesture"
                      disabled={!gestureTarget}
                      title={gestureTarget
                        ? `Write ${shape.name} onto ${gestureTarget.label}, stretched to its length`
                        : 'Pick a parameter or CC lane first'}
                      onclick={() => applyGestureShape(gestureTarget.patternId, shape.gestureId,
                                                      gestureTarget.laneId, gestureDepth)}>
                Put on lane
              </button>
              {#if shape.source !== 'factory'}
                <button type="button" class="ghost danger" data-testid="remove-gesture"
                        title="Remove this gesture"
                        onclick={() => removeGestureShape(shape.gestureId)}>×</button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if tab === 'recorder'}
    <div class="performance-recorder" data-testid="perf-performance-recorder">
      <div class="looper-toolbar performance-recorder-toolbar">
        <div>
          <strong>Performance Recorder</strong>
          <div class="looper-hint">
            Capture notes, parameters, scenes, transport and controller moves as one replayable show.
          </div>
        </div>
        <span class="perf-spacer"></span>
        {#if performance.performanceRecorder.recording}
          <span class="recording-status">
            ● {performance.performanceRecorder.name}
            · {takeDuration(performance.performanceRecorder.elapsedSeconds)}
            · {performance.performanceRecorder.midiEventCount} MIDI
            · {performance.performanceRecorder.actionCount} actions
          </span>
          <button type="button" class="looper-record finish"
                  onclick={() => finishPerformanceRecording()}
                  data-testid="perf-finish-performance-recording">■ Finish</button>
          <button type="button" class="ghost"
                  onclick={() => cancelPerformanceRecording()}>Cancel</button>
        {:else}
          <input class="performance-take-name" type="text" placeholder="Performance name"
                 value={performanceTakeName}
                 disabled={performance.performanceReplay.state !== 'idle'}
                 oninput={(event) => (performanceTakeName = event.currentTarget.value)} />
          <button type="button" class="looper-record"
                  disabled={performance.performanceReplay.state !== 'idle'}
                  onclick={() => startPerformanceRecording(performanceTakeName)}
                  data-testid="perf-start-performance-recording">● Record everything</button>
        {/if}
      </div>

      <div class="performance-recorder-help">
        Instant Replay first restores the instruments, effects, presets, mixer and controller
        layout from the take's starting point. It then repeats raw MIDI at sample offsets and
        replays Hostage actions on the same timeline.
      </div>

      {#if performance.performanceReplay.state !== 'idle'}
        <div class="performance-replay-status" class:degraded={performance.performanceReplay.degraded}>
          <strong>{performance.performanceReplay.state === 'restoring' ? 'Restoring rig'
            : 'Instant Replay'}</strong>
          <span>{performance.performanceReplay.name}</span>
          <span class="performance-replay-track" aria-label="Replay progress">
            <span style={`width:${Math.round(performance.performanceReplay.progress * 100)}%`}></span>
          </span>
          {#if performance.performanceReplay.degraded}
            <span class="replay-warning">One or more plug-ins could not be restored</span>
          {/if}
          <button type="button" class="ghost" onclick={() => stopPerformanceReplay()}>Stop</button>
        </div>
      {/if}

      {#if performance.performanceTakes.length === 0}
        <div class="looper-empty">
          No complete performance takes yet. Recording does not require the transport to be running.
        </div>
      {:else}
        <div class="performance-take-list">
          {#each performance.performanceTakes as take, index (take.takeId)}
            <div class="performance-take"
                 class:replaying={performance.performanceReplay.takeId === take.takeId}>
              <span class="layer-number">{index + 1}</span>
              <strong>{take.name}</strong>
              <span class="take-duration">{takeDuration(take.durationSeconds)}</span>
              <span class="take-detail">{take.midiEventCount} MIDI · {take.actionCount} actions</span>
              {#if take.truncated}
                <span class="take-truncated" title="The bounded recorder reached its event capacity">partial</span>
              {/if}
              <span class="perf-spacer"></span>
              <button type="button" class="replay-button"
                      disabled={performance.performanceRecorder.recording
                        || performance.performanceReplay.state !== 'idle'}
                      onclick={() => replayPerformanceTake(take.takeId)}
                      data-testid="perf-replay-performance">▶ Instant Replay</button>
              <HostConfirmButton identity={JSON.stringify([take.takeId])} title="Remove performance take" type="button" class="ghost danger"
                      disabled={performance.performanceRecorder.recording}
                      onclick={() => removePerformanceTake(take.takeId)}
                      aria-label={`Remove ${take.name}`}>×</HostConfirmButton>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if tab === 'modulation'}
    <div class="modulation-body" data-testid="perf-modulation-matrix">
      <div class="modulation-head">
        <div>
          <strong>Modulation Matrix</strong>
          <div class="looper-hint">
            Route live playing gestures and macros to plug-in or mixer parameters. Routes to
            the same destination add together around its normal value.
          </div>
        </div>
        <span class="perf-spacer"></span>
        <span class="route-count">{$hostState.rack.modulationRoutes.length} / 128 routes</span>
        <HostConfirmButton identity={JSON.stringify([])} title="Clear modulation routes" aria-label="Clear modulation routes" type="button" class="ghost danger"
                disabled={$hostState.rack.modulationRoutes.length === 0}
                onclick={() => clearModulationRoutes()}>Clear all</HostConfirmButton>
      </div>

      <div class="modulation-add">
        <label class="mini-field mod-source">
          <span>Source</span>
          <select value={modSourceKey} onchange={(e) => (modSourceKey = e.currentTarget.value)}>
            {#each modulationSources as source (source.key)}
              <option value={source.key}>{source.label}</option>
            {/each}
          </select>
        </label>
        {#if !['macro', 'lfo', 'envelope', 'mseg', 'random'].includes(selectedModSource?.type)}
          <label class="mini-field mod-channel">
            <span>Channel</span>
            <select value={modChannel} onchange={(e) => (modChannel = Number(e.currentTarget.value))}>
              <option value={0}>Omni</option>
              {#each Array.from({ length: 16 }, (_, index) => index + 1) as channel (channel)}
                <option value={channel}>{channel}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if selectedModSource?.type === 'midiCc'}
          <label class="mini-field mod-cc">
            <span>CC</span>
            <input type="number" min="0" max="127" value={modCcNumber}
                   onchange={(e) => (modCcNumber = Math.max(0, Math.min(127, Number(e.currentTarget.value))))} />
          </label>
        {/if}
        <span class="route-arrow" aria-hidden="true">→</span>
        <label class="mini-field mod-target">
          <span>Destination</span>
          <select value={modTargetId}
                  onchange={(e) => { modTargetId = e.currentTarget.value; modParameterId = ''; }}>
            {#each modulationTargets as target (target.id)}
              <option value={target.id}>{target.label}</option>
            {/each}
          </select>
        </label>
        <label class="mini-field mod-parameter">
          <span>Parameter</span>
          <select value={modParameterId}
                  disabled={availableModParameters.length === 0}
                  onchange={(e) => (modParameterId = e.currentTarget.value)}>
            {#each availableModParameters as parameter (parameter.id)}
              <option value={parameter.id}>{parameter.name}</option>
            {/each}
          </select>
        </label>
        <label class="mini-field mod-depth">
          <span>Depth {modAmount >= 0 ? '+' : ''}{Math.round(modAmount * 100)}%</span>
          <input type="range" min="-1" max="1" step="0.01" value={modAmount}
                 oninput={(e) => (modAmount = Number(e.currentTarget.value))} />
        </label>
        <button type="button" class="mod-add-button" disabled={!modTargetId || !modParameterId}
                onclick={addRoute} data-testid="perf-add-modulation-route">+ Route</button>
      </div>

      {#if $hostState.rack.modulationRoutes.length === 0}
        <div class="looper-empty">
          No modulation routes yet. Choose a source, destination and depth above. Velocity is
          a good first test: route it gently to filter cutoff or part level.
        </div>
      {:else}
        <div class="modulation-routes">
          <div class="modulation-labels" aria-hidden="true">
            <span></span><span>Source</span><span></span><span>Destination</span><span>Depth</span><span></span>
          </div>
          {#each $hostState.rack.modulationRoutes as route (route.routeId)}
            <div class="modulation-route" class:disabled={!route.enabled} class:unresolved={!route.resolved}>
              <button type="button" class="route-power" class:on={route.enabled}
                      title={route.enabled ? 'Disable route' : 'Enable route'}
                      onclick={() => setModulationRoute(route.routeId, { enabled: !route.enabled })}>
                {route.enabled ? '●' : '○'}
              </button>
              <div class="route-source">
                <span class="route-title">{routeSourceName(route)}</span>
                <span class="route-detail">{routeSourceDetail(route)}</span>
                <span class="source-meter" title={`Current source ${Math.round(route.sourceValue * 100)}%`}>
                  <span style={`width: ${Math.round(route.sourceValue * 100)}%`}></span>
                </span>
              </div>
              <span class="route-arrow" aria-hidden="true">→</span>
              <div class="route-destination">
                <span class="route-title">{route.displayName || route.parameterId}</span>
                <span class="route-detail">{route.targetName || route.targetId}</span>
                {#if !route.resolved}<span class="route-missing">Unresolved</span>{/if}
              </div>
              <label class="route-depth">
                <input type="range" min="-1" max="1" step="0.01" value={route.amount}
                       aria-label={`${routeSourceName(route)} modulation depth`}
                       onchange={(e) => setModulationRoute(route.routeId,
                                                           { amount: Number(e.currentTarget.value) })} />
                <output>{route.amount >= 0 ? '+' : ''}{Math.round(route.amount * 100)}%</output>
              </label>
              <HostConfirmButton identity={JSON.stringify([route.routeId])} aria-label="Remove modulation route" type="button" class="ghost danger" title="Remove route"
                      onclick={() => removeModulationRoute(route.routeId)}>×</HostConfirmButton>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if tab === 'lfos'}
    <div class="lfo-body" data-testid="perf-midi-lfos">
      <div class="modulation-head">
        <div>
          <strong>MIDI LFOs</strong>
          <div class="looper-hint">
            Tempo-locked or free-running control oscillators. Route one through the Modulation
            Matrix to a plug-in, mixer control or macro, or send CC, NRPN or SysEx to hardware.
          </div>
        </div>
        <span class="perf-spacer"></span>
        <span class="route-count">{$hostState.rack.midiLfos.length} / 32 LFOs</span>
        <button type="button" class="mod-add-button" onclick={() => addMidiLfo()}>+ LFO</button>
      </div>

      {#if $hostState.rack.midiLfos.length > 0}
        <div class="lfo-grid">
          {#each $hostState.rack.midiLfos as lfo (lfo.lfoId)}
            <LfoCard {lfo} {hardwareParts} onroute={() => routeLfo(lfo)} />
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if tab === 'envelopes'}
    <div class="envelope-body" data-testid="perf-envelope-generators">
      <div class="modulation-head">
        <div>
          <strong>Envelope Generators</strong>
          <div class="looper-hint">
            Note-triggered ADSR modulators independent of the instrument. Filter incoming notes,
            shape the response, then route the envelope to plug-ins, mixer controls or macros.
          </div>
        </div>
        <span class="perf-spacer"></span>
        <span class="route-count">{$hostState.rack.envelopes.length} / 32 envelopes</span>
        <button type="button" class="mod-add-button" onclick={() => addEnvelope()}>+ Envelope</button>
      </div>

      {#if $hostState.rack.envelopes.length === 0}
        <div class="looper-empty">
          No envelopes yet. Add one, play a note or hold Audition, and route it in the matrix.
        </div>
      {:else}
        <div class="envelope-grid">
          {#each $hostState.rack.envelopes as envelope (envelope.envelopeId)}
            <EnvelopeCard {envelope} {setEnvelopeAuditionHeld} onroute={() => routeEnvelope(envelope)} />
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if tab === 'msegs'}
    <div class="mseg-body" data-testid="perf-mseg-designer">
      <div class="modulation-head">
        <div>
          <strong>MSEG Designer</strong>
          <div class="looper-hint">
            Draw a repeating multi-segment modulation curve. Double-click to add a point,
            drag to shape it, and right-click an interior point to remove it.
          </div>
        </div>
        <span class="perf-spacer"></span>
        <span class="route-count">{$hostState.rack.msegs.length} / 32 MSEGs</span>
        <button type="button" class="mod-add-button" onclick={() => addMseg()}>+ MSEG</button>
      </div>

      {#if $hostState.rack.msegs.length === 0}
        <div class="looper-empty">
          No MSEGs yet. Add one, draw the movement, then route it through the Modulation Matrix.
        </div>
      {:else}
        <div class="mseg-grid">
          {#each $hostState.rack.msegs as mseg (mseg.msegId)}
            <MsegCard {mseg} onroute={() => routeMseg(mseg)} />
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if tab === 'random'}
    <div class="random-body" data-testid="perf-random-modulators">
      <div class="modulation-head">
        <div>
          <strong>Random / Probability Modulators</strong>
          <div class="looper-hint">
            Seeded, repeatable movement: hold values, glide between them, generate chaos,
            or take a bounded walk. Chance decides whether each clock step changes.
          </div>
        </div>
        <span class="perf-spacer"></span>
        <span class="route-count">{$hostState.rack.randomModulators.length} / 32 modulators</span>
        <button type="button" class="mod-add-button"
                onclick={() => addRandomModulator()}>+ Random</button>
      </div>

      {#if $hostState.rack.randomModulators.length === 0}
        <div class="looper-empty">
          No random modulators yet. Add one, choose its character, then route it in the matrix.
        </div>
      {:else}
        <div class="random-grid">
          {#each $hostState.rack.randomModulators as random (random.randomId)}
            <RandomCard {random} onroute={() => routeRandom(random)} />
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if tab === 'tuning'}
    <div class="tuning-body" data-testid="perf-microtuning">
      <section class="tuning-card tuning-overview">
        <div class="perf-head">
          <div>
            <strong>Microtuning Manager</strong>
            <div class="tuning-subtitle">One Scala tuning, shared with every opted-in instrument through MIDI Tuning Standard SysEx.</div>
          </div>
          <span class="perf-spacer"></span>
          <PropertyToggle compact label={microtuning.enabled ? 'Enabled' : 'Disabled'}
                          value={microtuning.enabled}
                          onchange={(enabled) => setMicrotuning({ enabled })} />
          <button type="button" class="ghost" disabled={!microtuning.enabled}
                  onclick={() => sendMicrotuning()}>Send to enabled parts</button>
        </div>

        <div class="tuning-file-row">
          <label class="scala-picker">
            <span>Import Scala .scl</span>
            <input type="file" accept=".scl,text/plain" onchange={importScalaFile} />
          </label>
          {#if tuningFileMessage}<span class="tuning-file-message">{tuningFileMessage}</span>{/if}
          <span class="perf-spacer"></span>
          <button type="button" class="ghost"
                  onclick={() => { resetMicrotuning(); tuningFileMessage = 'Restored 12-tone equal temperament'; }}>
            Reset 12-TET
          </button>
        </div>

        <div class="tuning-summary">
          <label class="mini-field tuning-name">
            <span>Tuning name</span>
            <input type="text" value={microtuning.name}
                   onchange={(e) => setMicrotuning({ name: e.currentTarget.value })} />
          </label>
          <div class="tuning-stat">
            <span>Source</span>
            <strong>{microtuning.sourceName || 'Built in'}</strong>
          </div>
          <div class="tuning-stat">
            <span>Scale</span>
            <strong>{microtuning.degreeCount} notes · {Number(microtuning.periodCents).toFixed(2)} cents</strong>
          </div>
        </div>

        <div class="tuning-settings">
          <label class="mini-field">
            <span>Scale root · {noteName(microtuning.rootMidiNote)}</span>
            <input type="number" min="0" max="127" step="1" value={microtuning.rootMidiNote}
                   onchange={(e) => setMicrotuning({ rootMidiNote: Number(e.currentTarget.value) })} />
          </label>
          <label class="mini-field">
            <span>Reference note · {noteName(microtuning.referenceMidiNote)}</span>
            <input type="number" min="0" max="127" step="1" value={microtuning.referenceMidiNote}
                   onchange={(e) => setMicrotuning({ referenceMidiNote: Number(e.currentTarget.value) })} />
          </label>
          <label class="mini-field">
            <span>Reference Hz</span>
            <input class="tuning-hz" type="number" min="1" max="40000" step="0.01"
                   value={microtuning.referenceFrequency}
                   onchange={(e) => setMicrotuning({ referenceFrequency: Number(e.currentTarget.value) })} />
          </label>
          <label class="mini-field">
            <span>MTS device ID</span>
            <input type="number" min="0" max="127" step="1" value={microtuning.mtsDeviceId}
                   title="127 is the MIDI all-call device ID"
                   onchange={(e) => setMicrotuning({ mtsDeviceId: Number(e.currentTarget.value) })} />
          </label>
          <label class="mini-field">
            <span>MTS program</span>
            <input type="number" min="0" max="127" step="1" value={microtuning.mtsProgram}
                   onchange={(e) => setMicrotuning({ mtsProgram: Number(e.currentTarget.value) })} />
          </label>
        </div>
      </section>

      <section class="tuning-card">
        <div class="perf-head">
          <strong>Destinations</strong>
          <span class="tuning-compatibility">Only instruments that support MIDI Tuning Standard SysEx will retune.</span>
        </div>
        {#if parts.length === 0}
          <div class="empty-hint">Add a software or hardware instrument, then enable tuning for that part.</div>
        {:else}
          <div class="tuning-parts">
            {#each parts as part, index (part.partId)}
              {@const ready = part.hardware ? Boolean(part.midiOutputId) : part.hasInstrument}
              <div class="tuning-part" class:subscribed={part.microtuningEnabled}>
                <PropertyToggle compact label={part.microtuningEnabled ? 'Tuned' : 'Off'}
                                value={part.microtuningEnabled}
                                onchange={(enabled) => setPartMicrotuning(part.partId, enabled)} />
                <span class="tuning-part-kind">{part.hardware ? 'HW' : 'VST3'}</span>
                <div class="tuning-part-name">
                  <strong>{tuningPartName(part, index)}</strong>
                  <span class:error={Boolean(part.microtuningError)}>
                    {part.microtuningError || (part.microtuningEnabled
                      ? ready ? 'MTS delivery path ready; support depends on the instrument'
                              : part.hardware ? 'Choose a MIDI output first' : 'Load an instrument first'
                      : 'Uses its own tuning')}
                  </span>
                </div>
                <button type="button" class="ghost" disabled={!microtuning.enabled || !part.microtuningEnabled || !ready}
                        onclick={() => sendMicrotuning(part.partId)}>Send now</button>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}

  {#if tab === 'clips'}
    <div class="perf-body clip-scene-body" data-testid="perf-launcher">
      <div class="perf-head launcher-head">
        <strong>Launcher</strong>
        <span class="launcher-note">Scenes are rows, clips are columns. A lit cell means the scene starts that clip.</span>
        <span class="perf-spacer"></span>
        {#if performance.clips.some((clip) => clip.active)}
          <button type="button" class="ghost" data-testid="perf-stop-all" onclick={() => stopAllClips()}>
            ■ Stop all · {performance.clips.filter((clip) => clip.active).length} playing</button>
        {/if}
        <button type="button" onclick={() => addScene()} data-testid="perf-add-scene"
                title="A new scene with the rig as it is now">+ Scene from the rig</button>
      </div>
      {#if performance.snapshotMorph.active}
        <div class="snapshot-morph-status" data-testid="snapshot-morph-status">
          <span>Morphing to <strong>{performance.snapshotMorph.name}</strong></span>
          <span>{performance.snapshotMorph.targetCount} controls</span>
          <span class="snapshot-morph-track" aria-label="Snapshot morph progress">
            <span style={`width:${performance.snapshotMorph.progress * 100}%`}></span>
          </span>
        </div>
      {/if}
      {#if performance.scenes.length > 0 || performance.clips.length > 0}
        <div class="launch-scroll">
        <div class="launch-grid" role="group" aria-label="Scenes and the clips they start"
             style={`grid-template-columns: minmax(150px, 190px) repeat(${performance.clips.length}, minmax(104px, 1fr)) minmax(96px, 130px)`}>
          <span class="lg-corner"></span>
          {#each performance.clips as clip (clip.clipId)}
            <div class="lg-clip" class:picked={pickedClip?.clipId === clip.clipId} class:active={clip.active} data-testid="launch-clip">
              <button type="button" class="lg-play" data-testid="launch-clip-play"
                      title={clip.active ? 'Stop at the next boundary' : 'Launch at the next boundary'}
                      onclick={() => (clip.active ? stopClip(clip.clipId) : launchClip(clip.clipId))}>
                {clip.pending ? '⧗' : clip.active ? '■' : '▶'}</button>
              <button type="button" class="lg-name" title="Show this clip's settings below"
                      onclick={() => (pickedClipId = clip.clipId)}>
                <b>{clip.name}{clip.frozenMidi ? ' ❄' : ''}</b>
                <small>{clipParts(clip).join(', ') || 'no part yet'} · {clipFlow(clip)}</small></button>
            </div>
          {/each}
          <span class="lg-corner lg-used">Used in</span>
          {#each performance.scenes as scene, index (scene.sceneId)}
            <div class="lg-scene" class:picked={pickedScene?.sceneId === scene.sceneId}
                 class:now={performance.currentSceneId === scene.sceneId}
                 class:queued={performance.queuedSceneId === scene.sceneId} data-testid="launch-scene">
              <button type="button" class="lg-play" data-testid="launch-scene-play"
                      title={scene.morphBeats > 0 ? `Launch, morphing over ${scene.morphBeats} beats` : 'Launch this scene at its boundary'}
                      onclick={() => launchScene(scene.sceneId)}>▶</button>
              <span class="lg-swatch" style={`background:${sceneColour(index)}`}></span>
              <button type="button" class="lg-name" title="Show this scene's settings below"
                      onclick={() => (pickedSceneId = scene.sceneId)}>
                <b>{scene.name}</b>{#if scene.variationLabel}<small>variation {scene.variationLabel}</small>{/if}</button>
            </div>
            {#each performance.clips as clip (clip.clipId)}
              {@const on = scene.clipIds.includes(clip.clipId)}
              <button type="button" class="lg-cell" class:on class:playing={on && clip.active}
                      style={on ? `--cell:${sceneColour(index)}` : ''} aria-pressed={on} data-testid="launch-cell"
                      aria-label={`${scene.name} starts ${clip.name}`}
                      title={on ? `${scene.name} starts ${clip.name}. Click to leave it out.` : `Make ${scene.name} start ${clip.name}`}
                      onclick={() => setSceneClip(scene.sceneId, clip.clipId, !on)}>{on ? clip.name : ''}</button>
            {/each}
            <span class="lg-meta" class:unused={songCount(scene.sceneId) === 0}>{sceneUse(scene.sceneId)}</span>
          {/each}
        </div>
        </div>
      {/if}
      <div class="launcher-details">
      <div class="clip-column">
        <div class="perf-head">
          <strong>{pickedClip ? `Clip · ${pickedClip.name}` : 'Clips'}</strong>
          <!-- Only what can act: freezing needs a clip, stopping needs one playing. -->
          {#if performance.clips.length > 0}
            <div class="freeze-cycles" title="How many source cycles become one deterministic clip">
              Freeze
              <Segmented options={[1, 2, 4, 8].map((cycles) => ({ value: cycles, label: `${cycles}×`, title: `${cycles} source cycles` }))}
                         value={freezeCycles} label="MIDI freeze cycles" testid="freeze-cycles"
                         onchange={(cycles) => (freezeCycles = cycles)} />
            </div>
          {/if}
        </div>
        {#if performance.clips.length === 0}
          <div class="empty-hint first-step" data-testid="perf-clips-empty">
            <span>No clips yet. A clip plays a pattern: open a pattern and press <strong>+ Clip</strong>.</span>
            <button type="button" onclick={() => selectTool('patterns')}>Go to Patterns</button>
          </div>
        {/if}

        <!-- The song form as a map. The rows below stay the editor; a follow action is five
             dropdowns, and on a row of dropdowns an arrow that will never fire looks exactly
             like one that will. -->
        <FollowGraph clips={performance.clips} />

        {#each pickedClip ? [pickedClip] : [] as clip (clip.clipId)}
          <div class="clip-row" class:active={clip.active} class:pending={clip.pending}
               data-testid="perf-clip">
            <button type="button" class="clip-launch"
                    title={clip.active ? 'Stop at the next boundary' : 'Launch at the next boundary'}
                    onclick={() => (clip.active ? stopClip(clip.clipId) : launchClip(clip.clipId))}>
              {clip.pending ? '⧗' : clip.active ? '■' : '▶'}
            </button>
            <span class="clip-name" title={clip.frozenMidi
              ? `${clip.frozenNoteCount} rendered notes from ${clip.frozenCycles} source cycle(s)`
              : clip.name}>
              {clip.name}{clip.frozenMidi ? ' · ❄' : ''}
            </span>
            <span class="clip-phase" aria-hidden="true">
              <span class="clip-phase-fill" style={`width: ${Math.round(clip.phase * 100)}%`}></span>
            </span>
            <ScrubValue value={clip.launchQuantize} choices={QUANTIZE_CHOICES} pixelsPerStep={10}
                        label={`${clip.name} launch quantization`} testid="clip-quantize"
                        title="Launches on this boundary: drag up or down, or click to type"
                        onchange={(launchQuantize) => setClipOptions(clip.clipId, { launchQuantize })} />
            <PropertyToggle compact label="Loop" value={clip.loop} ariaLabel={`${clip.name} loops`}
                            onchange={(on) => setClipOptions(clip.clipId, { loop: on })} />
            <Segmented options={FOLLOW_ACTIONS} value={clip.followAction} label={`${clip.name} follow action`}
                       testid="clip-follow"
                       onchange={(followAction) => {
                         const patch = {
                           followAction,
                           followAfterLoops: followAction === 'none' ? 0 : Math.max(1, clip.followAfterLoops || 1),
                         };
                         if (followAction === 'clip' && !clip.followClipId)
                           patch.followClipId = followTargetsFor(clip)[0]?.clipId ?? '';
                         setClipOptions(clip.clipId, patch);
                       }} />
            <!-- Fixed slots, filled or not, so every clip's controls line up in columns. -->
            <span class="follow-slot loops">
              {#if clip.followAction !== 'none'}
                <ScrubValue value={Math.max(1, clip.followAfterLoops)} min={1} max={64} pixelsPerStep={8}
                            format={(n) => `after ${n} ${n === 1 ? 'loop' : 'loops'}`}
                            label={`${clip.name} follow loops`} testid="clip-follow-loops"
                            onchange={(followAfterLoops) => setClipOptions(clip.clipId, { followAfterLoops })} />
              {/if}
            </span>
            <span class="follow-slot target">
              {#if clip.followAction === 'clip'}
                <select class="follow-target" value={clip.followClipId}
                        aria-label={`${clip.name} follow target`}
                        onchange={(e) => setClipOptions(clip.clipId, { followClipId: e.currentTarget.value })}>
                  <option value="">Choose clip…</option>
                  {#each followTargetsFor(clip) as target (target.clipId)}
                    <option value={target.clipId}>{target.name}</option>
                  {/each}
                </select>
              {/if}
            </span>
            <!-- The fill's settings live in a panel under the row; the row keeps the button you
                 hold while playing, once there is a fill to hold. -->
            <button type="button" class="ghost fill-open" aria-expanded={openFills.has(clip.clipId)}
                    data-testid="clip-fill-open" title="The pattern a held Fill plays, and its pedal"
                    onclick={() => toggleFill(clip.clipId)}>
              Fill{clip.fillPatternId ? ' ✓' : ''} {openFills.has(clip.clipId) ? '▴' : '▾'}
            </button>
            <span class="follow-slot hold">
            {#if clip.fillPatternId}
            <button type="button" class="fill-hold" class:on={clip.fillActive || clip.fillPending}
                    disabled={!clip.active || !clip.fillPatternId}
                    title="Hold for the temporary fill; release to return without restarting the clip"
                    onpointerdown={(e) => {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      setFillHeld(clip.clipId, true);
                    }}
                    onpointerup={(e) => { e.preventDefault(); setFillHeld(clip.clipId, false); }}
                    onpointercancel={() => setFillHeld(clip.clipId, false)}
                    onkeydown={(e) => {
                      if (!e.repeat && (e.key === ' ' || e.key === 'Enter')) {
                        e.preventDefault(); setFillHeld(clip.clipId, true);
                      }
                    }}
                    onkeyup={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault(); setFillHeld(clip.clipId, false);
                      }
                    }}>
              {clip.fillPending ? 'Fill…' : clip.fillActive ? 'Filling' : 'Hold Fill'}
            </button>
            {/if}
            </span>
            <button type="button" class="ghost freeze-button" disabled={clip.frozenMidi}
                    title={clip.frozenMidi
                      ? 'This clip already contains rendered post-MIDI-FX notes'
                      : `Render ${freezeCycles} cycle(s) through the part MIDI modules into a new editable clip`}
                    onclick={() => freezeMidiClip(clip.clipId, freezeCycles)}>
              {clip.frozenMidi ? 'Frozen' : 'Freeze MIDI'}
            </button>
            <HostConfirmButton identity={JSON.stringify([clip.clipId])} title="Remove clip" aria-label="Remove clip" type="button" class="ghost danger" onclick={() => removeClip(clip.clipId)}>×</HostConfirmButton>
          </div>
          {#if openFills.has(clip.clipId)}
            <div class="fill-panel" data-testid="clip-fill-panel">
              <div class="mini-field">Fill pattern
                <select class="fill-pattern" value={clip.fillPatternId}
                        aria-label={`${clip.name} fill pattern`}
                        title="Temporary pattern used while Fill is held"
                        onchange={(e) => setClipOptions(clip.clipId, { fillPatternId: e.currentTarget.value })}>
                  <option value="">No fill</option>
                  {#each fillPatternsFor(clip) as pattern (pattern.patternId)}
                    <option value={pattern.patternId}>
                      {pattern.variationLabel ? `${pattern.variationLabel} · ` : ''}{pattern.name}
                    </option>
                  {/each}
                </select>
              </div>
              <div class="mini-field" title="Boundary used for both press and release">On
                <ScrubValue value={clip.fillQuantize} choices={QUANTIZE_CHOICES} pixelsPerStep={10}
                            label={`${clip.name} fill quantization`} testid="clip-fill-quantize"
                            onchange={(fillQuantize) => setClipOptions(clip.clipId, { fillQuantize })} />
              </div>
              <div class="mini-field" title="A momentary MIDI controller that holds the fill">Pedal CC
                <ScrubValue value={clip.fillCc} min={-1} max={127} format={(n) => (n < 0 ? 'off' : `CC ${n}`)}
                            label={`${clip.name} fill pedal CC`} testid="clip-fill-cc"
                            onchange={(fillCc) => setClipOptions(clip.clipId, { fillCc })} />
              </div>
              <div class="mini-field" title="The channel the pedal is heard on">Channel
                <ScrubValue value={clip.fillChannel} choices={FILL_CHANNELS} pixelsPerStep={8}
                            label={`${clip.name} fill pedal channel`} testid="clip-fill-channel"
                            onchange={(fillChannel) => setClipOptions(clip.clipId, { fillChannel })} />
              </div>
            </div>
          {/if}
        {/each}
      </div>

      <div class="scene-column">
        <div class="perf-head">
          <strong>{pickedScene ? `Scene · ${pickedScene.name}` : 'Scenes'}</strong>
        </div>
        {#if performance.scenes.length === 0}
          <div class="empty-hint">
            No scenes yet. A scene is a sound setup: which parts play, their levels and macros, and which clips start.
            <strong>+ Scene from the rig</strong> takes the rig as it is now.
          </div>
        {/if}
        {#each pickedScene ? [pickedScene] : [] as scene (scene.sceneId)}
          <div class="scene-row" data-testid="perf-scene">
            <button type="button" class="clip-launch"
                    title={scene.morphBeats > 0
                      ? `Launch at its boundary and morph continuous controls over ${scene.morphBeats} beats`
                      : 'Launch this scene at its boundary'}
                    onclick={() => launchScene(scene.sceneId)}>▶</button>
            <input type="text" class="clip-name scene-name-input" value={scene.name}
                   aria-label="Scene name" title="Rename scene"
                   onchange={(e) => renameScene(scene.sceneId, e.currentTarget.value)} />
            {#if scene.variationLabel}
              <span class="variation-badge" data-testid="scene-variation-label"
                    title={scene.variationLabel === 'A'
                      ? 'Authored source scene'
                      : `Generated from scene A at ${Math.round(scene.variationAmount * 100)}%`}>
                {scene.variationLabel}
              </span>
            {/if}
            <span class="scene-detail">{scene.clipIds.length} clips · {scene.numSlots} slots · {scene.numMacros} macros · {scene.numParameters} mapped</span>
            <ScrubValue value={scene.launchQuantize} choices={QUANTIZE_CHOICES} pixelsPerStep={10}
                        label={`${scene.name} launch quantization`} testid="scene-quantize"
                        onchange={(launchQuantize) => setSceneOptions(scene.sceneId, { launchQuantize })} />
            <span class="scene-morph" title="Continuous scene values move together; clips, mute and tempo still land on the boundary">
              Morph
              <ScrubValue value={scene.morphBeats} choices={MORPH_CHOICES} pixelsPerStep={10}
                          label={`${scene.name} snapshot morph time`} testid="scene-morph"
                          onchange={(morphBeats) => setSceneOptions(scene.sceneId, { morphBeats })} />
            </span>
            <span class="scene-morph" title="CTRL49 control layout recalled with this scene">
              Controls
              <Segmented options={[{ value: '', label: 'Keep', title: 'Keep the page that is showing' },
                                   ...$hostState.rack.pages.slice(0, 3).map((page) => ({ value: page.pageId, label: page.name }))]}
                         value={scene.pageId} label={`${scene.name} CTRL49 controls`} testid="scene-page"
                         onchange={(pageId) => setSceneOptions(scene.sceneId, { pageId })} />
            </span>
            <button type="button" class="ghost" title="Replace this scene's contents with the rig as it stands"
                    onclick={() => captureScene(scene.sceneId)}>Capture</button>
            <!-- A variation of the thing you are PLAYING, not of one lane of it. Each clip gets
                 its pattern's B/C/D (reusing one that already exists), levels and macros move,
                 and a mute does not — there is no such thing as forty per cent muted. -->
            <button type="button" class="ghost" data-testid="scene-variations"
                    title="Make B, C and D versions of this whole scene: varied patterns with clips of their own, nudged levels and macros, and mutes left alone"
                    onclick={() => createSceneVariations(scene.sceneId, variationAmount)}>
              {scene.variationLabel ? 'Regen B/C/D' : 'B/C/D'}
            </button>
            <!-- "+ Set" read like "make a set" and changed nothing you could see: it adds a song
                 to the one setlist, and the count beside it is the acknowledgement. -->
            <button type="button" class="ghost" title="Add a song to the setlist that recalls this scene"
                    data-testid="scene-add-song"
                    onclick={() => addSetlistItem(scene.sceneId, `Song ${performance.setlist.items.length + 1}`)}>+ Song</button>
            {#if songCount(scene.sceneId) > 0}
              <span class="in-setlist" data-testid="scene-in-setlist"
                    title="Songs in the setlist (Live setup › Setlist) that recall this scene">
                {songCount(scene.sceneId) === 1 ? 'in setlist' : `in setlist ×${songCount(scene.sceneId)}`}</span>
            {/if}
            <button type="button" class="ghost" title="Add a four-bar block to the song arranger"
                    onclick={() => addArrangementItem(scene.sceneId, undefined, performance.arrangement.songId)}>+ Arrange</button>
            <HostConfirmButton identity={JSON.stringify([scene.sceneId])} title="Remove scene" aria-label="Remove scene" type="button" class="ghost danger" onclick={() => removeScene(scene.sceneId)}>×</HostConfirmButton>
          </div>
        {/each}
      </div>
      </div>
    </div>
  {/if}

  {#if tab === 'arranger'}
    <div class="perf-body arranger-body" data-testid="perf-arranger">
      <div class="perf-head arranger-head">
        <strong>Song / Scene Arranger</strong>
        {#if performance.arrangement.playing}
          <button type="button" class="arranger-stop" onclick={() => stopArrangement()}
                  data-testid="perf-arrangement-stop">■ Stop</button>
        {:else}
          <button type="button" disabled={performance.arrangement.items.length === 0}
                  onclick={() => startArrangement(0)} data-testid="perf-arrangement-play">▶ Play</button>
        {/if}
        <PropertyToggle compact label="Loop song" value={performance.arrangement.loop}
                        disabled={performance.arrangement.playing}
                        onchange={(value) => setArrangementOptions({ loop: value }, performance.arrangement.songId)} />
        <span class="arranger-explainer">Scenes change on bar boundaries; clips remain editable in their own patterns.</span>
      </div>

      {#if performance.arrangement.items.length === 0}
        <div class="empty-hint">
          No blocks yet. Use <strong>+ Arrange</strong> beside a scene in the Launcher; each block holds that scene for a number of bars.
        </div>
      {/if}

      <div class="arranger-list">
        {#each performance.arrangement.items as item, index (item.itemId)}
          <div class="arranger-item" class:current={performance.arrangement.currentIndex === index}
               class:queued={performance.arrangement.queuedIndex === index} class:missing={item.missing}
               data-testid="perf-arrangement-item">
            <button type="button" class="arranger-play-here"
                    disabled={performance.arrangement.playing || item.missing}
                    title={`Play the arrangement from ${item.name}`}
                    onclick={() => startArrangement(index)}>▶ {index + 1}</button>
            <div class="arranger-order">
              <button type="button" class="ghost" disabled={performance.arrangement.playing || index === 0}
                      aria-label={`Move ${item.name} earlier`}
                      onclick={() => moveArrangementItem(item.itemId, index - 1, performance.arrangement.songId)}>↑</button>
              <button type="button" class="ghost"
                      disabled={performance.arrangement.playing || index === performance.arrangement.items.length - 1}
                      aria-label={`Move ${item.name} later`}
                      onclick={() => moveArrangementItem(item.itemId, index + 1, performance.arrangement.songId)}>↓</button>
            </div>
            <input type="text" class="arranger-name" value={item.name}
                   disabled={performance.arrangement.playing}
                   aria-label={`Arrangement block ${index + 1} name`}
                   onchange={(e) => setArrangementItem(item.itemId, { name: e.currentTarget.value }, performance.arrangement.songId)} />
            <select class="arranger-scene" value={item.sceneId} disabled={performance.arrangement.playing}
                    aria-label={`${item.name} scene`}
                    onchange={(e) => setArrangementItem(item.itemId, { sceneId: e.currentTarget.value }, performance.arrangement.songId)}>
              {#if item.missing}<option value={item.sceneId}>Missing scene</option>{/if}
              {#each performance.scenes as scene (scene.sceneId)}
                <option value={scene.sceneId}>{scene.name}</option>
              {/each}
            </select>
            <label class="arranger-bars">Bars
              <input type="number" min="1" max="128" value={item.bars}
                     disabled={performance.arrangement.playing}
                     aria-label={`${item.name} duration in bars`}
                     onchange={(e) => setArrangementItem(item.itemId,
                                           { bars: Number(e.currentTarget.value) }, performance.arrangement.songId)} />
            </label>
            <div class="arranger-status">
              {#if performance.arrangement.currentIndex === index}
                <span>{performance.arrangement.ending ? 'Ending' : `Bar ${performance.arrangement.bar} / ${item.bars}`}</span>
                <span class="arranger-progress"><span style={`width:${performance.arrangement.progress * 100}%`}></span></span>
              {:else if performance.arrangement.queuedIndex === index}
                <span>Queued for next bar</span>
              {:else}
                <span>{item.bars} {item.bars === 1 ? 'bar' : 'bars'}</span>
              {/if}
            </div>
            <HostConfirmButton identity={JSON.stringify([item.itemId])} title="Remove arrangement item" type="button" class="ghost danger" disabled={performance.arrangement.playing}
                    aria-label={`Remove ${item.name} from arrangement`}
                    onclick={() => removeArrangementItem(item.itemId, performance.arrangement.songId)}>×</HostConfirmButton>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if tab === 'setlist'}
    <SongsPage {performance} {rackCaptures} {preloadFor} onShowMixer={showMixer} />
  {/if}
  </div>
  </div>
  <div class="perf-location" data-testid="perf-location" role="status">Performance / {activeGroup.label} / {activeTool.label}</div>
</div>

<style>
  .setlist-entry { border:1px solid var(--host-line); border-radius:5px; }
  .soundcheck-label { font-size:11px; color:var(--host-text-soft); margin-left:8px; }
  .setlist-item { flex-wrap:wrap; }
  .perf-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid var(--host-line);
    border-radius: var(--host-radius-panel);
    background: var(--host-surface);
    max-height: 460px;
    overflow-y: auto;
  }

  .perf-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 4px 2px 8px; }
  .perf-toolbar h2 { margin: 0; font-size: 18px; font-weight: 650; }
  .perf-layout { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; align-items: start; min-height: 0; }
  .perf-content { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .perf-rail { position: sticky; top: 0; display: flex; flex-direction: column; gap: 1px; padding: 8px 6px;
               border: 1px solid var(--host-line); border-radius: var(--host-radius-panel); background: var(--host-bg-deep); }
  :global(.host-workspace.host-workspace) .perf-panel .perf-rail button { border: 0; border-radius: 5px; background: transparent;
               text-align: left; justify-content: flex-start; min-height: 0; }
  :global(.host-workspace.host-workspace) .perf-panel .perf-rail button.rail-group { margin-top: 8px; padding: 2px 8px;
               font: 600 10px var(--host-font-mono, monospace); letter-spacing: .12em; text-transform: uppercase; color: var(--host-text-dim); }
  :global(.host-workspace.host-workspace) .perf-panel .perf-rail button.rail-group:first-child { margin-top: 0; }
  :global(.host-workspace.host-workspace) .perf-panel .perf-rail button.rail-group.on { color: var(--host-text-soft); background: transparent; box-shadow: none; }
  :global(.host-workspace.host-workspace) .perf-panel .perf-rail button.rail-tool { padding: 5px 10px; color: var(--host-text-soft); }
  :global(.host-workspace.host-workspace) .perf-panel .perf-rail button.rail-tool.on { background: var(--host-accent-surface);
               color: var(--host-text); box-shadow: inset 2px 0 var(--host-accent-strong); }
  .perf-location { flex: none; border-top: 1px solid var(--host-line-soft); margin-top: auto; padding: 10px 2px 0; font-size: 11px; color: var(--host-text-soft); }
  .perf-spacer { flex: 1; }
  .recording { color: #e4b3b3; border-color: #7a4a4a; }
  .retrospective {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    max-width: 100%;
    flex: 0 0 auto;
    padding-left: 6px;
    border-left: 1px solid #2c343d;
  }
  .retrospective select { width: auto; min-width: 62px; }
  .retro-button { white-space: nowrap; }
  .history-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 7px;
    border-radius: 50%;
    background: #4b5560;
    box-shadow: 0 0 0 1px #12171c;
  }
  .history-dot.ready { background: #50b982; box-shadow: 0 0 5px #50b98280; }
  .retro-result { color: #8f9ba6; font-size: 11px; white-space: nowrap; }
  .retro-result.trimmed { color: #d3ae67; }
  @media (max-width: 650px) {
    .perf-toolbar > .perf-spacer { display: none; }
    .retrospective { padding-left: 0; border-left: 0; }
    /* Narrow: the rail lies down above the page and wraps. */
    .perf-layout { grid-template-columns: minmax(0, 1fr); }
    .perf-rail { position: static; flex-direction: row; flex-wrap: wrap; align-items: center; }
    :global(.host-workspace.host-workspace) .perf-panel .perf-rail button.rail-group { margin: 0 0 0 8px; }
  }

  .looper-body { display: flex; flex-direction: column; gap: 12px; }
  .looper-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 10px;
    border: 1px solid #303a44;
    background: #1b2127;
  }
  .looper-hint { margin-top: 3px; color: #89949f; font-size: 11px; }
  .looper-record { border-color: #95504a; color: #f0b1aa; white-space: nowrap; }
  .looper-record.finish { background: #733a36; border-color: #bd6259; color: #fff1ef; }
  .recording-status { color: #ef8f86; font-size: 12px; animation: record-pulse 1.2s ease-in-out infinite; }
  @keyframes record-pulse { 50% { opacity: 0.55; } }
  .looper-empty {
    padding: 24px;
    border: 1px dashed #38434e;
    color: #8f9aa5;
    text-align: center;
    font-size: 12px;
  }
  .looper-layers { display: flex; flex-direction: column; gap: 6px; }
  .looper-layer {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 6px 8px;
    border: 1px solid #2e3740;
    background: #191f25;
  }
  .looper-layer.active { border-left: 3px solid #53a97b; padding-left: 6px; }
  .looper-layer.target { border-color: #b75a53; background: #251d1e; }
  .layer-number { width: 18px; color: #68747f; font: 11px 'JetBrains Mono', monospace; text-align: center; }
  .layer-name { flex: 0 1 180px; min-width: 90px; }
  .layer-length { width: 58px; color: #93a0ab; font-size: 11px; white-space: nowrap; }
  .layer-phase { flex: 1; min-width: 70px; }
  .overdub { white-space: nowrap; border-color: #66573c; color: #d6bd82; }
  .pass-count { width: 72px; color: #74808b; font-size: 10px; white-space: nowrap; }

  .gesture-body { display: flex; flex-direction: column; gap: 10px; }
  .gesture-toolbar { border-left: 3px solid #c17846; }
  .gesture-record { border-color: #a86639; color: #efb685; }
  .gesture-status { color: #f1a66f; }
  .gesture-help {
    padding: 8px 10px;
    border: 1px solid #303944;
    background: #171d23;
    color: #929da7;
    font-size: 11px;
    line-height: 1.45;
  }
  .gesture-help strong { color: #c8d0d7; }
  .gesture-warning {
    padding: 7px 9px;
    border: 1px solid #755b32;
    color: #d8b573;
    background: #282116;
    font-size: 11px;
  }
  .gesture-layer.target { border-color: #c17846; background: #292018; }
  .gesture-kind {
    min-width: 62px;
    color: #c19571;
    font: 9px 'JetBrains Mono', monospace;
    text-transform: uppercase;
  }
  .gesture-lanes { min-width: 58px; color: #88949e; font-size: 10px; white-space: nowrap; }
  .gesture-replace { border-color: #4d6172; color: #acc4d7; white-space: nowrap; }

  .performance-recorder { display: flex; flex-direction: column; gap: 10px; }
  .performance-recorder-toolbar { border-left: 3px solid #c55b50; }
  .performance-take-name { width: 180px; }
  .performance-recorder-help {
    padding: 8px 10px; border: 1px solid #303944; background: #171d23;
    color: #929da7; font-size: 11px; line-height: 1.45;
  }
  .performance-take-list { display: flex; flex-direction: column; gap: 6px; }
  .performance-take {
    display: flex; align-items: center; gap: 9px; min-height: 40px;
    padding: 5px 8px; border: 1px solid #2e3740; background: #191f25; font-size: 11px;
  }
  .performance-take.replaying { border-left: 3px solid #d7863b; padding-left: 6px; }
  .performance-take > strong { min-width: 130px; color: var(--host-text); }
  .take-duration { color: #c1cad2; font: 10px 'JetBrains Mono', monospace; }
  .take-detail { color: #7f8b96; }
  .take-truncated { color: #deb66d; text-transform: uppercase; font-size: 9px; }
  .replay-button { border-color: #4e6f58; color: #a9d3b1; white-space: nowrap; }
  .performance-replay-status {
    display: grid; grid-template-columns: auto minmax(100px, auto) minmax(100px, 1fr) auto;
    align-items: center; gap: 9px; min-height: 34px; padding: 6px 8px;
    border: 1px solid #8b5d35; background: #282018; color: #c2b6aa; font-size: 11px;
  }
  .performance-replay-status.degraded { border-color: #89534f; }
  .performance-replay-status strong { color: #efa96c; }
  .performance-replay-track { display: block; height: 5px; overflow: hidden; background: #11161b; }
  .performance-replay-track > span { display: block; height: 100%; background: #d7863b; }
  .replay-warning { color: #e4a19b; font-size: 10px; }

  .modulation-body { display: flex; flex-direction: column; gap: 10px; }
  .modulation-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 10px;
    border: 1px solid #3f382f;
    border-left: 3px solid #d7863b;
    background: #1c1d1e;
  }
  .route-count { color: #8d969e; font: 10px 'JetBrains Mono', monospace; white-space: nowrap; }
  .modulation-add {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    flex-wrap: wrap;
    padding: 9px;
    border: 1px solid #343b42;
    background: #171c21;
  }
  .modulation-add select { width: auto; }
  .mod-source select { min-width: 160px; }
  .mod-channel select { min-width: 68px; }
  .mod-cc input { width: 54px !important; }
  .mod-target select { min-width: 145px; max-width: 190px; }
  .mod-parameter { flex: 1; min-width: 150px; }
  .mod-parameter select { width: 100%; min-width: 150px; max-width: 260px; }
  .mod-depth input { width: 105px !important; }
  .mod-add-button { border-color: #9b5e31; color: #f0b47d; white-space: nowrap; }
  .route-arrow { align-self: center; color: #d7863b; font-size: 16px; padding: 0 2px; }
  .modulation-routes { display: flex; flex-direction: column; gap: 4px; }
  .modulation-labels, .modulation-route {
    display: grid;
    grid-template-columns: 28px minmax(145px, 0.9fr) 28px minmax(170px, 1.2fr) minmax(140px, 0.8fr) 28px;
    align-items: center;
    gap: 8px;
  }
  .modulation-labels {
    padding: 0 7px;
    color: #68737d;
    font: 9px 'JetBrains Mono', monospace;
    text-transform: uppercase;
  }
  .modulation-route {
    min-height: 48px;
    padding: 5px 7px;
    border: 1px solid #373c40;
    border-left: 3px solid #d7863b;
    background: #1a1e21;
  }
  .modulation-route.disabled { opacity: 0.56; border-left-color: #59616a; }
  .modulation-route.unresolved { border-color: #744d42; border-left-color: #bd6d56; }
  .route-power { padding: 2px 5px; color: #737e87; border-color: #3b434a; }
  .route-power.on { color: #efad70; border-color: #8f5a35; }
  .route-source, .route-destination { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .route-title { overflow: hidden; color: #cdd4da; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .route-detail { overflow: hidden; color: #77838d; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .route-missing { color: #da8d78; font-size: 9px; text-transform: uppercase; }
  .source-meter { display: block; width: 100%; height: 3px; margin-top: 2px; background: #292f34; overflow: hidden; }
  .source-meter > span { display: block; height: 100%; background: #d7863b; }
  .route-depth { display: flex; align-items: center; gap: 8px; }
  .route-depth input { width: 100%; min-width: 80px; }
  .route-depth output { width: 40px; color: #e0a36b; font: 10px 'JetBrains Mono', monospace; text-align: right; }

  .lfo-body { display: flex; flex-direction: column; gap: 10px; }
  .lfo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(520px, 1fr)); gap: 10px; }
  .route-lfo { margin-left: auto; }

  .envelope-body { display: flex; flex-direction: column; gap: 10px; }
  .envelope-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(560px, 1fr)); gap: 10px; }

  .mseg-body { display: flex; flex-direction: column; gap: 10px; }
  .mseg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(600px, 1fr)); gap: 10px; }

  .random-body { display: flex; flex-direction: column; gap: 10px; }
  .random-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(600px, 1fr)); gap: 10px; }

  .tuning-body { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .tuning-card {
    padding: 12px;
    border: 1px solid #303a44;
    border-left: 3px solid #587b92;
    background: #191f25;
  }
  .tuning-overview { border-left-color: #c9793f; }
  .tuning-subtitle, .tuning-compatibility {
    margin-top: 3px;
    color: #8996a1;
    font-size: 11px;
    line-height: 1.35;
  }
  .tuning-file-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding: 8px;
    border: 1px solid #2c353e;
    background: #151a1f;
  }
  .scala-picker {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 0 9px;
    border: 1px solid #83522f;
    border-radius: 2px;
    color: #edb185;
    background: #282019;
    font-size: 11px;
    cursor: pointer;
  }
  .scala-picker:hover { border-color: #c9793f; }
  .scala-picker input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .tuning-file-message { color: #aab4bd; font-size: 11px; }
  .tuning-summary {
    display: grid;
    grid-template-columns: minmax(210px, 1.4fr) minmax(130px, 1fr) minmax(180px, 1fr);
    gap: 10px;
    margin-top: 10px;
  }
  .tuning-name input { width: 100%; }
  .tuning-stat {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid #303943;
    background: #171c21;
  }
  .tuning-stat span { color: #7f8b96; font-size: 10px; text-transform: uppercase; }
  .tuning-stat strong { overflow: hidden; color: #c7d0d7; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .tuning-settings { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
  .tuning-settings .mini-field { min-width: 122px; }
  .tuning-settings .mini-field input { width: 78px; }
  .tuning-settings .tuning-hz { width: 104px !important; }
  .tuning-parts { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; }
  .tuning-part {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 42px;
    padding: 6px 8px;
    border: 1px solid #2e3740;
    background: #171d22;
  }
  .tuning-part.subscribed { border-left: 3px solid #c9793f; padding-left: 6px; }
  .tuning-part-kind {
    min-width: 32px;
    color: #75828e;
    font: 9px 'JetBrains Mono', monospace;
    text-align: center;
  }
  .tuning-part-name { display: flex; flex: 1; flex-direction: column; gap: 3px; min-width: 100px; }
  .tuning-part-name strong { color: #cbd3da; font-size: 12px; }
  .tuning-part-name span { color: #7f8b96; font-size: 10px; }
  .tuning-part-name span.error { color: #d99086; }

  @media (max-width: 760px) {
    .lfo-grid { grid-template-columns: minmax(0, 1fr); }
    .envelope-grid, .mseg-grid, .random-grid { grid-template-columns: minmax(0, 1fr); }
    .tuning-summary { grid-template-columns: minmax(0, 1fr); }
    .tuning-file-row, .tuning-part { flex-wrap: wrap; }
  }

  .perf-body { display: flex; gap: 16px; align-items: flex-start; }
  .clip-scene-body { flex-direction: column; width: 100%; }
  .launcher-head { width: 100%; }
  .launcher-note { font-size: 11px; color: var(--host-text-soft, #9aa5b1); }
  .launch-scroll { width: 100%; overflow-x: auto; }
  .launch-grid { display: grid; gap: 4px; align-items: stretch; min-width: min-content; }
  .lg-corner { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .1em; text-transform: uppercase;
               color: var(--host-text-dim, #6c7783); align-self: end; padding: 0 4px 6px; }
  .lg-clip, .lg-scene { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 5px 6px; border-radius: 6px;
                        border: 1px solid var(--host-line-soft, #2b333d); background: var(--host-bg-deep, #12171b); }
  .lg-clip { align-items: flex-start; }
  .lg-clip.picked, .lg-scene.picked { border-color: var(--host-accent, #80d8bc); }
  .lg-clip.active { box-shadow: inset 0 -2px 0 #58d68d; }
  .lg-scene.now { box-shadow: inset 0 0 0 1px #ffb347; }
  .lg-scene.queued { box-shadow: inset 0 0 0 1px #79b9ee; }
  :global(.host-workspace.host-workspace) .perf-panel button.lg-play { flex: none; width: 24px; height: 24px; min-height: 0; padding: 0;
               border-radius: 50%; border: 1.5px solid #58d68d; color: #58d68d; background: transparent; font-size: 9px; }
  :global(.host-workspace.host-workspace) .perf-panel button.lg-name { flex: 1; min-width: 0; min-height: 0; padding: 0; border: 0;
               background: transparent; text-align: left; justify-content: flex-start; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
  .lg-name b { font-size: 12px; color: var(--host-text, #d6dbe0); font-weight: 600; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lg-name small { font-size: 10px; color: var(--host-text-dim, #6c7783); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lg-swatch { flex: none; width: 7px; height: 24px; border-radius: 2px; }
  :global(.host-workspace.host-workspace) .perf-panel button.lg-cell { min-height: 36px; padding: 0 8px; border-radius: 5px;
               border: 1px dashed #2a343e; background: transparent; color: #0d1115; font-size: 11px; font-weight: 600;
               justify-content: flex-start; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  :global(.host-workspace.host-workspace) .perf-panel button.lg-cell:hover { border-color: #4a5866; }
  :global(.host-workspace.host-workspace) .perf-panel button.lg-cell.on { border: 1px solid transparent; background: var(--cell); }
  :global(.host-workspace.host-workspace) .perf-panel button.lg-cell.playing { outline: 2px solid #58d68d; outline-offset: -2px; }
  .lg-meta { align-self: center; font: 10.5px var(--host-font-mono, monospace); color: var(--host-text-soft, #9aa5b1); padding: 0 4px; }
  .lg-meta.unused { color: var(--host-text-dim, #6c7783); }
  .lg-used { text-align: left; }
  .launcher-details { display: flex; flex-direction: column; gap: 12px; width: 100%; }
  .clip-scene-body .clip-column, .clip-scene-body .scene-column { width: 100%; flex: none; }
  .clip-scene-body .clip-row, .clip-scene-body .scene-row { flex-wrap: wrap; }
  .perf-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .empty-hint { color: #7d8894; padding: 8px 2px; font-size: 12px; }
  .empty-hint strong { color: var(--host-text, #d6dbe0); font-weight: 600; }
  .empty-hint.first-step { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

  .pattern-list { flex: 0 0 250px; display: flex; flex-direction: column; gap: 6px; }
  .pattern-row { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 12px; }
  .pattern-row.on .pattern-name { color: #edf5fa; border-color: #5b9bd5; background: #24384c; }
  .pattern-name { flex: 1; text-align: left; }
  .pattern-detail { color: #98a4ae; font-size: 12px; }
  .in-setlist { font: 600 11px 'JetBrains Mono', monospace; color: #8fd19e; border: 1px solid #2f5a3a; border-radius: 10px; padding: 1px 7px; white-space: nowrap; }
  .variation-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; flex: 0 0 20px;
    border: 1px solid #d7863b; color: #f2aa61; background: #2b2119;
    font: 700 11px 'JetBrains Mono', monospace;
  }
  .variation-badge.editor-badge { width: 24px; height: 24px; flex-basis: 24px; }
  .variation-amount { flex-direction: row; align-items: center; }
  .variation-create { border-color: #8c592e; }

  .pattern-editor { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .groove-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 7px;
                    padding: 7px 8px; border: 1px solid var(--host-line-soft);
                    background: var(--host-surface-raised); }
  .groove-toolbar > strong { color: var(--host-accent); font-size: 11px; text-transform: uppercase; }
  .groove-strength { min-width: 145px; }
  .groove-picker { position: relative; border: 1px solid var(--host-line-soft);
                   padding: 4px 8px; color: var(--host-text-soft); cursor: pointer; font-size: 11px; }
  .groove-picker:hover { border-color: var(--host-accent); }
  .groove-picker input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .groove-applied, .groove-message { color: var(--host-text-dim); font-size: 10px; }
  .pattern-title { flex: 1; min-width: 120px; }

  .lane {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid #2c343d;
    border-radius: 4px;
    padding: 6px;
    background: #1c2126;
  }
  .lane.on { border-color: #5b9bd5; }
  .lane.unresolved { border-color: #7a4a4a; }
  .lane-head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .lane-name { flex: 0 0 auto; }
  .lane-target { flex: 1; color: #98a4ae; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lane.unresolved .lane-target { color: #d6a3a3; }

  .roll-wrap { display: flex; gap: 3px; align-items: stretch; }
  .roll-ruler { display: flex; flex-direction: column; width: 26px; flex: 0 0 auto; }
  .ruler-cell { flex: 1; font-size: 7px; color: #66707b; line-height: 1;
                display: flex; align-items: center; }
  .ruler-cell.black { background: #12171d; }
  .piano-roll { flex: 1; display: flex; gap: 1px; height: 150px; background: #10161c;
                border: 1px solid #232c36; border-radius: 4px; padding: 2px;
                cursor: crosshair; touch-action: none; }
  .roll-col { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 4px; }
  .roll-col.beat { border-left: 1px solid #232c36; }
  .roll-col.playing { background: #24384c; border-radius: 1px; }
  .roll-col.locked { box-shadow: inset 0 2px #d7863b; }
  .roll-col.selected { outline: 2px solid #67abe3; outline-offset: -2px; }
  .roll-cell { flex: 1; background: #161e27; border-radius: 1px; }
  .roll-cell.black { background: #131a22; }
  .roll-cell.on { background: #3d81c4; }
  .roll-cell.on.tie { background: #7fb4e0; }
  .roll-col.playing .roll-cell.on { background: #9cd0f7; }
  .roll-side { display: flex; flex-direction: column; gap: 2px; justify-content: center; }
  .bar-lane { display: flex; gap: 1px; height: 34px; margin-top: 3px; background: #10161c;
              border: 1px solid #232c36; border-radius: 4px; padding: 2px;
              cursor: crosshair; touch-action: none; }
  .bar-lane.tall { height: 72px; }
  .bar-col { flex: 1; display: flex; align-items: flex-end; background: #161e27;
             border-radius: 1px; min-width: 4px; }
  .bar-col.idle { opacity: 0.35; }
  .bar-col.playing { background: #24384c; }
  .bar-col.locked { box-shadow: inset 0 2px #d7863b; }
  .bar-fill { width: 100%; background: #4aa88c; border-radius: 1px 1px 0 0; }
  .bar-fill.value { background: #b4854a; }
  .step-grid {
    display: grid;
    grid-template-columns: repeat(var(--steps), minmax(0, 1fr));
    gap: 2px;
  }
  .step {
    height: 28px;
    padding: 0;
    background: #14171a;
    border: 1px solid #2c343d;
    border-radius: 3px;
    color: #a0abb4;
    font-size: 11px;
    cursor: pointer;
  }
  .step.beat { border-color: #3b4652; }
  .step.active { background: #2f6ea8; border-color: #5b9bd5; color: #eef4fa; }
  .step.tie { background: #24485f; }
  .step.locked { box-shadow: inset 0 -3px #d7863b; }
  .step.selected { outline: 2px solid #e4bd53; outline-offset: -2px; }
  .step-mark { pointer-events: none; }

  .step-hint { align-self: center; color: #7f8b96; font-size: 11px; }
  .lane-options, .step-options {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    border-top: 1px solid #2c343d;
    padding-top: 6px;
  }
  .mini-field { display: flex; flex-direction: column; gap: 4px; color: #aab4bd; font-size: 12px; }
  .seed-field .seed-row { display: flex; align-items: center; gap: 4px; }
  .seed-field input { width: 96px; font-variant-numeric: tabular-nums; }
  /* Dimmed, not disabled: the seed is still real and still saved, it simply has nothing to
     decide until a step carries a probability. Disabling it would hide a number worth keeping. */
  .seed-field input.inert { opacity: 0.55; }
  .mini-field input[type='number'] { width: 62px; }
  .mini-field input[type='range'] { width: 90px; }

  .lock-editor {
    flex: 1 0 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
    padding: 8px;
    border: 1px solid #4b3a2d;
    border-left: 3px solid #d7863b;
    background: #191714;
  }
  .lock-head { display: flex; align-items: center; gap: 8px; min-height: 24px; }
  .lock-head strong { color: #e7b17a; font-size: 12px; }
  .lock-head span { flex: 1; color: #8e857c; font-size: 10px; }
  .lock-list { display: flex; flex-direction: column; gap: 3px; }
  .lock-row {
    display: grid;
    grid-template-columns: minmax(130px, 1fr) minmax(90px, 1fr) 42px 26px;
    align-items: center;
    gap: 7px;
    min-height: 28px;
    padding: 2px 4px;
    border: 1px solid #38332e;
    background: #1f1c19;
  }
  .lock-name { overflow: hidden; color: #c8c0b7; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .lock-row input[type='range'] { width: 100%; }
  .lock-row output, .lock-readout {
    color: #dfad78;
    font: 10px 'JetBrains Mono', monospace;
    text-align: right;
  }
  .lock-add { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
  .lock-target select { max-width: 170px; }
  .lock-parameter { flex: 1; min-width: 170px; }
  .lock-parameter select { width: 100%; max-width: 280px; }
  .lock-value input[type='range'] { width: 110px; }
  .lock-readout { width: 34px; padding-bottom: 6px; }
  .lock-button { border-color: #89562e; color: #efb476; white-space: nowrap; }
  .lock-button:disabled { color: #6e655c; border-color: #39332e; }

  .clip-column, .scene-column { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .freeze-cycles { display: inline-flex; align-items: center; gap: 4px; color: #98a4ae; font-size: 11px; }
  .freeze-button { white-space: nowrap; border-color: #456579; color: #a9ccdf; }
  /* --- the gesture library --------------------------------------------------------------- */
  .gesture-library { margin-top: 14px; border-top: 1px solid #262c33; padding-top: 10px; }
  .gesture-shapes { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  .gesture-shape {
    display: flex; align-items: center; gap: 8px; min-height: 30px; font-size: 12px;
    padding: 2px 4px; border-radius: 4px;
  }
  .gesture-shape:hover { background: #1c2126; }
  .shape-thumb { width: 84px; height: 20px; flex: none; background: #12161a; border-radius: 2px; }
  .shape-thumb path { fill: none; stroke: #7fb4e0; stroke-width: 1.4; vector-effect: non-scaling-stroke; }
  .shape-name { color: #d6dbe0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gesture-shape .badge {
    font-size: 8.5px; letter-spacing: 0.06em; padding: 2px 4px; border-radius: 2px;
    border: 1px solid #3b4652; color: #7d8894;
  }
  .gesture-shape .ghost { margin-left: auto; }
  .gesture-shape .ghost + .ghost { margin-left: 0; }

  .clip-row, .scene-row { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 12px; }
  .clip-launch { padding: 2px 8px; }
  .clip-row.active .clip-launch { color: #9fd6a3; border-color: #4a7a52; }
  .clip-row.pending .clip-launch { color: #e0cf9a; border-color: #7a6a3a; }
  .follow-slot { flex: none; display: inline-flex; }
  .follow-slot.loops { width: 116px; }
  .follow-slot.target { width: 124px; }
  .follow-slot.hold { width: 84px; }
  .follow-target { width: 100%; }
  .fill-open { white-space: nowrap; }
  .fill-hold { white-space: nowrap; border-color: #8c592e; }
  .fill-hold.on { color: #18120d; border-color: #f0a45a; background: #f0a45a; }
  .fill-panel { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin: 0 0 6px 38px; padding: 8px 10px;
                border: 1px solid #3a3129; border-left: 3px solid #8c592e; background: #1a1714; }
  .fill-pattern { max-width: 180px; }
  .clip-name { flex: 0 0 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scene-name-input { box-sizing: border-box; min-width: 0; }
  .clip-phase { flex: 1; height: 4px; background: #14171a; border-radius: 2px; overflow: hidden; min-width: 30px; }
  .clip-phase-fill { display: block; height: 100%; background: #5b9bd5; }
  .scene-detail { flex: 1; color: #98a4ae; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scene-morph { display: inline-flex; align-items: center; gap: 4px; color: #98a4ae; font-size: 10px; }
  .snapshot-morph-status {
    display: grid; grid-template-columns: auto auto minmax(70px, 1fr); align-items: center; gap: 8px;
    min-height: 28px; padding: 4px 7px; border: 1px solid #80542f;
    color: #c8b7a7; background: #271f19; font-size: 10px;
  }
  .snapshot-morph-status strong { color: #efad70; }
  .snapshot-morph-track { height: 4px; overflow: hidden; background: #14171a; }
  .snapshot-morph-track > span { display: block; height: 100%; background: #d7863b; }
  .scene-clips { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 6px 30px; }
  .chip {
    padding: 1px 6px;
    font-size: 11px;
    background: none;
    border: 1px solid #3b4652;
    color: #7d8894;
  }
  .chip.on { color: #d6dbe0; border-color: #5b9bd5; background: #24313d; }

  .setlist-body { flex-direction: column; align-items:stretch; gap:8px; }
  .setlist-item { display: flex; align-items: center; gap: 10px; min-height: 34px; font-size: 12px; }
  .setlist-item.current { background: #24313d; border-radius: 4px; }
  .setlist-item.loading { box-shadow: inset 3px 0 #d7863b; }
  .setlist-go { flex: 0 0 26px; }
  .setlist-order { display: inline-flex; flex-direction: column; gap: 2px; }
  .setlist-order button { width: 22px; height: 15px; padding: 0; line-height: 12px; }
  .setlist-order button:disabled { opacity: 0.28; cursor: default; }
  .setlist-name { width: 160px; }
  .setlist-loading { color: #98a4ae; font-size: 12px; }
  .song-field .setlist-name { font-weight: 600; }
  .setlist-scene { width: 160px; color: #98a4ae; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .setlist-item.missing .setlist-scene { color: #d6a3a3; }
  .setlist-notes { flex: 1 1 220px; min-width: 160px; min-height: 36px; resize: vertical; font: inherit; font-size: 12px; }
  .preload-state { flex: 0 0 auto; font-size: 10px; color: #9aa6b0; text-transform: uppercase; }
  .preload-state.ready { color: #82bd8d; }
  .preload-state.degraded { color: #df9a76; }

  .arranger-body { flex-direction: column; }
  .arranger-head { flex-wrap: wrap; }
  .arranger-explainer { color: #87939e; font-size: 11px; }
  .arranger-stop { color: #e8b0a6; border-color: #765049; }
  .arranger-list { display: flex; flex-direction: column; gap: 5px; }
  .arranger-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 3px 5px;
    border: 1px solid #2d3741;
    background: #171d23;
    font-size: 12px;
  }
  .arranger-item.current { border-color: #b56e32; background: #282119; }
  .arranger-item.queued { border-color: #6d6742; }
  .arranger-item.missing { border-color: #744c4c; }
  .arranger-play-here { flex: 0 0 46px; }
  .arranger-order { display: flex; flex-direction: column; gap: 1px; }
  .arranger-order button { min-width: 24px; padding: 0 5px; line-height: 14px; }
  .arranger-name { flex: 0 1 150px; min-width: 90px; }
  .arranger-scene { flex: 0 1 155px; min-width: 100px; }
  .arranger-bars { display: inline-flex; align-items: center; gap: 4px; color: #98a4ae; }
  .arranger-bars input { width: 48px; }
  .arranger-status { display: flex; align-items: center; gap: 8px; flex: 1; color: #98a4ae; min-width: 125px; }
  .arranger-progress { display: block; width: 90px; height: 4px; background: #101419; overflow: hidden; }
  .arranger-progress > span { display: block; height: 100%; background: #d3833d; }

</style>
