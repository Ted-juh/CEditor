<script>
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
    hostState, hostParameters, hostLibrary, requestParameters, requestLibrary,
    addPattern, removePattern, renamePattern, setPatternOptions, createPatternVariations,
    importGrooveTemplate, removeGrooveTemplate, applyGrooveTemplate,
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
    addMidiLfo, setMidiLfo, resetMidiLfo, removeMidiLfo,
    addMidiLfoOutput, setMidiLfoOutput, removeMidiLfoOutput,
    addEnvelope, setEnvelope, triggerEnvelope, resetEnvelope, removeEnvelope,
    addMseg, setMseg, resetMseg, removeMseg,
    addRandomModulator, setRandomModulator, resetRandomModulator, removeRandomModulator,
    deterministicRandomUnit,
    importScalaTuning, parseScalaTuning, resetMicrotuning, setMicrotuning,
    setPartMicrotuning, sendMicrotuning,
    addScene, removeScene, renameScene, captureScene, setSceneOptions, setSceneClip, launchScene,
    addSetlistItem, removeSetlistItem, moveSetlistItem, setSetlistItem, setSetlistOptions,
    setlistGo, setlistNext, setlistPrev,
    addArrangementItem, removeArrangementItem, setArrangementItem, moveArrangementItem,
    setArrangementOptions, startArrangement, stopArrangement,
  } from '../stores/instrumentHost.js';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let tab = $state('patterns');
  let selectedPatternId = $state('');
  let selectedLaneId = $state('');
  let selectedStepIndex = $state(-1);
  let retrospectiveSeconds = $state(30);
  let seenRetrospectivePatternId = $state('');
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
  let msegDrag = $state(null);
  let selectedMsegId = $state('');
  let selectedMsegPointId = $state('');
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
  let rackCaptures = $derived($hostLibrary.records.filter((record) => record.type === 'rack'));

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
    if (tab === 'setlist') requestLibrary('', 'rack');
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

  const lfoSyncRates = [
    { beats: 0.125, label: '1/32' },
    { beats: 1 / 6, label: '1/16T' },
    { beats: 0.25, label: '1/16' },
    { beats: 1 / 3, label: '1/8T' },
    { beats: 0.5, label: '1/8' },
    { beats: 2 / 3, label: '1/4T' },
    { beats: 1, label: '1/4' },
    { beats: 2, label: '1/2' },
    { beats: 4, label: '1 bar' },
    { beats: 8, label: '2 bars' },
    { beats: 16, label: '4 bars' },
  ];

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
      tab = 'patterns';
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

  // Velocity bars for the selected note/chord/drum lane, and value bars for cc/parameter
  // lanes: same bar-per-step gesture the arp grid uses.
  let barDrag = $state(null);   // { laneId, field, lastIndex }

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
    const step = lane.steps[index];
    if (field === 'velocity') {
      if (!step?.active) return;   // velocity without a note is noise
      setStep(selectedPattern.patternId, lane.laneId, index,
              { velocity: Math.max(1, Math.round(height * 127)) });
    } else {
      setStep(selectedPattern.patternId, lane.laneId, index,
              { active: true, value: Math.round(height * 100) / 100 });
    }
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
    tab = 'modulation';
  }

  function routeEnvelope(envelope) {
    modSourceKey = `envelope:${envelope.envelopeId}`;
    tab = 'modulation';
  }

  function routeMseg(mseg) {
    modSourceKey = `mseg:${mseg.msegId}`;
    tab = 'modulation';
  }

  function routeRandom(random) {
    modSourceKey = `random:${random.randomId}`;
    tab = 'modulation';
  }

  const randomModeLabel = (mode) => ({
    sampleHold: 'Sample & hold', smoothRandom: 'Smooth random',
    chaos: 'Chaos', randomWalk: 'Bounded walk',
  })[mode] ?? 'Sample & hold';

  function randomPreviewValues(random, count = 24) {
    let target = 0.5;
    let chaosValue = 0.05
      + 0.9 * deterministicRandomUnit(random.seed, 0, 0x68bc21eb);
    let walkValue = 0.5;
    const values = [];
    for (let step = 0; step < count; step += 1) {
      const changes = random.probability >= 1
        || deterministicRandomUnit(random.seed, step, 0xa341316c) < random.probability;
      if (random.mode === 'chaos' && changes) {
        chaosValue = Math.max(0.0001, Math.min(0.9999,
          (3.57 + 0.43 * random.chaos) * chaosValue * (1 - chaosValue)));
        target = chaosValue;
      } else if (random.mode === 'randomWalk' && changes) {
        let walked = walkValue
          + (deterministicRandomUnit(random.seed, step, 0xad90777d) * 2 - 1)
            * random.stepSize;
        if (walked < 0) walked = -walked;
        if (walked > 1) walked = 2 - walked;
        walkValue = Math.max(0, Math.min(1, walked));
        target = walkValue;
      } else if (!['chaos', 'randomWalk'].includes(random.mode) && changes) {
        target = deterministicRandomUnit(random.seed, step, 0xc8013ea4);
      }
      values.push(random.minimum + target * (random.maximum - random.minimum));
    }
    return values;
  }

  function randomPreviewPath(random) {
    const values = randomPreviewValues(random);
    if (values.length === 0) return '';
    const y = (value) => (1 - value) * 60;
    const x = (index) => index * 100 / (values.length - 1);
    const path = [`M 0 ${y(values[0])}`];
    for (let index = 1; index < values.length; index += 1) {
      if (random.mode === 'sampleHold') path.push(`L ${x(index)} ${y(values[index - 1])}`);
      path.push(`L ${x(index)} ${y(values[index])}`);
    }
    return path.join(' ');
  }

  function reseedRandom(random) {
    const seed = (Math.floor(Date.now() + Math.random() * 0x3fffffff) % 0x7ffffffe) + 1;
    setRandomModulator(random.randomId, { seed });
  }

  const msegDisplayPoints = (mseg) => msegDrag?.msegId === mseg.msegId
    ? msegDrag.points : mseg.points;

  function msegPath(points) {
    if (points.length === 0) return '';
    const path = [`M ${points[0].position * 100} ${(1 - points[0].value) * 60}`];
    for (let index = 1; index < points.length; index += 1) {
      const left = points[index - 1];
      const right = points[index];
      const span = right.position - left.position;
      if (span <= 0.000001) {
        path.push(`L ${right.position * 100} ${(1 - right.value) * 60}`);
        continue;
      }
      for (let sample = 1; sample <= 12; sample += 1) {
        const progress = sample / 12;
        const shaped = progress ** (4 ** right.curve);
        const position = left.position + span * progress;
        const value = left.value + (right.value - left.value) * shaped;
        path.push(`L ${position * 100} ${(1 - value) * 60}`);
      }
    }
    return path.join(' ');
  }

  function msegCoordinates(element, event) {
    const rect = element.getBoundingClientRect();
    return {
      position: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      value: Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)),
    };
  }

  function selectMsegPoint(mseg, pointId) {
    selectedMsegId = mseg.msegId;
    selectedMsegPointId = pointId;
  }

  function addMsegPoint(mseg, event) {
    if (mseg.points.length >= 64) return;
    const { position, value } = msegCoordinates(event.currentTarget, event);
    const point = {
      pointId: `mseg-point-${Date.now()}-${mseg.points.length + 1}`,
      position: Math.max(0.001, Math.min(0.999, position)), value, curve: 0,
    };
    const points = [...mseg.points, point].sort((a, b) => a.position - b.position);
    selectMsegPoint(mseg, point.pointId);
    setMseg(mseg.msegId, { points });
  }

  function beginMsegDrag(mseg, point, event) {
    event.preventDefault();
    event.stopPropagation();
    selectMsegPoint(mseg, point.pointId);
    msegDrag = {
      msegId: mseg.msegId,
      pointId: point.pointId,
      points: mseg.points.map((candidate) => ({ ...candidate })),
    };
    event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
  }

  function moveMsegPoint(mseg, event) {
    if (msegDrag?.msegId !== mseg.msegId) return;
    const { position, value } = msegCoordinates(event.currentTarget, event);
    const points = msegDrag.points.map((point, index, all) => {
      if (point.pointId !== msegDrag.pointId) return point;
      const fixedEndpoint = index === 0 || index === all.length - 1;
      return { ...point, position: fixedEndpoint ? point.position : position, value };
    }).sort((a, b) => a.position - b.position);
    points[0].position = 0;
    points[points.length - 1].position = 1;
    msegDrag = { ...msegDrag, points };
  }

  function endMsegDrag(mseg, event) {
    if (msegDrag?.msegId !== mseg.msegId) return;
    setMseg(mseg.msegId, { points: msegDrag.points });
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    msegDrag = null;
  }

  function deleteMsegPoint(mseg, point, event) {
    event.preventDefault();
    event.stopPropagation();
    const index = mseg.points.findIndex((candidate) => candidate.pointId === point.pointId);
    if (mseg.points.length <= 2 || index <= 0 || index === mseg.points.length - 1) return;
    const points = mseg.points.filter((candidate) => candidate.pointId !== point.pointId);
    if (selectedMsegPointId === point.pointId) selectedMsegPointId = points[0].pointId;
    setMseg(mseg.msegId, { points });
  }

  function msegPointKey(mseg, point, index, event) {
    const step = event.shiftKey ? 0.05 : 0.01;
    if (['Delete', 'Backspace'].includes(event.key)) {
      deleteMsegPoint(mseg, point, event);
      return;
    }
    const changes = {};
    if (event.key === 'ArrowUp') changes.value = Math.min(1, point.value + step);
    else if (event.key === 'ArrowDown') changes.value = Math.max(0, point.value - step);
    else if (event.key === 'ArrowLeft' && index > 0 && index < mseg.points.length - 1)
      changes.position = Math.max(0, point.position - step);
    else if (event.key === 'ArrowRight' && index > 0 && index < mseg.points.length - 1)
      changes.position = Math.min(1, point.position + step);
    else return;
    event.preventDefault();
    selectMsegPoint(mseg, point.pointId);
    setSelectedMsegPoint(mseg, changes);
  }

  function setSelectedMsegPoint(mseg, fields) {
    const pointId = selectedMsegId === mseg.msegId && selectedMsegPointId
      ? selectedMsegPointId : mseg.points[0]?.pointId;
    if (!pointId) return;
    selectMsegPoint(mseg, pointId);
    const points = mseg.points.map((point, index, all) => point.pointId === pointId
      ? {
          ...point,
          ...fields,
          position: index === 0 ? 0 : index === all.length - 1 ? 1
            : Math.max(0, Math.min(1, Number(fields.position ?? point.position))),
        }
      : point).sort((a, b) => a.position - b.position);
    setMseg(mseg.msegId, { points });
  }

  function applyMsegPreset(mseg, values) {
    const points = values.map(([position, value, curve = 0], index) => ({
      pointId: `mseg-point-${Date.now()}-${index + 1}`, position, value, curve,
    }));
    selectedMsegId = mseg.msegId;
    selectedMsegPointId = points[0].pointId;
    setMseg(mseg.msegId, { points });
  }

  function envelopeVisual(envelope) {
    const timeWidth = (milliseconds, width) => {
      const normalized = Math.log10(Math.max(0, Number(milliseconds)) + 10) / Math.log10(60010);
      return 5 + normalized * width;
    };
    const attackX = 2 + timeWidth(envelope.attackMs, 23);
    const decayX = Math.min(61, attackX + timeWidth(envelope.decayMs, 22));
    const releaseX = Math.max(72, decayX + 8);
    const sustainY = 49 - Math.max(0, Math.min(1, envelope.sustain)) * 46;
    let markerX = 2;
    if (envelope.stage === 'attack') markerX = 2 + (attackX - 2) * envelope.stageProgress;
    else if (envelope.stage === 'decay') markerX = attackX + (decayX - attackX) * envelope.stageProgress;
    else if (envelope.stage === 'sustain') markerX = decayX + (releaseX - decayX) * 0.5;
    else if (envelope.stage === 'release') markerX = releaseX + (98 - releaseX) * envelope.stageProgress;
    return {
      points: `2,49 ${attackX},3 ${decayX},${sustainY} ${releaseX},${sustainY} 98,49`,
      attackX, decayX, releaseX,
      markerX,
      markerY: 49 - Math.max(0, Math.min(1, envelope.value)) * 46,
    };
  }

  // A linear 60-second fader would make the useful first second almost impossible to set.
  // The editor is logarithmic while the stored/native value remains ordinary milliseconds.
  const envelopeTimePosition = (milliseconds) =>
    Math.log10(Math.max(0, Math.min(60000, Number(milliseconds))) + 1) / Math.log10(60001);
  const envelopeTimeFromPosition = (position) =>
    Math.round((60001 ** Math.max(0, Math.min(1, Number(position))) - 1) / 5) * 5;

  function addHardwareLfoOutput(lfo) {
    const target = hardwareParts[0];
    if (!target) return;
    addMidiLfoOutput(lfo.lfoId, {
      type: 'cc', targetPartId: target.partId, channel: target.midiOutChannel || 1, number: 1,
    });
  }

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
  <div class="perf-tabs">
    {#each [['patterns', 'Patterns'], ['looper', 'Looper'], ['gestures', 'Gestures'], ['recorder', 'Recorder'], ['modulation', 'Modulation'], ['lfos', 'MIDI LFOs'], ['envelopes', 'Envelopes'], ['msegs', 'MSEG'], ['random', 'Random'], ['tuning', 'Tuning'], ['clips', 'Clips & scenes'], ['arranger', 'Arrange'], ['setlist', 'Setlist']] as [id, label] (id)}
      <button type="button" class="toggle" class:on={tab === id} onclick={() => (tab = id)}
              data-testid={`perf-tab-${id}`}>{label}</button>
    {/each}
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
            <button type="button" class="ghost danger" title="Remove this pattern and its clips"
                    onclick={() => removePattern(pattern.patternId)}>×</button>
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
            <label class="mini-field variation-amount"
                   title="How far B, C and D move away from the authored A pattern">
              Variations
              <select value={variationAmount}
                      onchange={(e) => { variationAmount = Number(e.currentTarget.value); }}>
                <option value="0.25">Subtle</option>
                <option value="0.55">Balanced</option>
                <option value="0.85">Bold</option>
              </select>
            </label>
            <button type="button" class="variation-create"
                    title="Create related feel, sparse and fill patterns; existing variation clips keep working"
                    onclick={() => createPatternVariations(selectedPattern.patternId, variationAmount)}>
              {selectedPattern.variationLabel ? 'Regenerate B/C/D' : 'Create B/C/D'}
            </button>
            <label class="mini-field" title="Delays every second step of each lane's own grid">
              Swing
              <input type="range" min="0" max="0.75" step="0.01" value={selectedPattern.swing}
                     onchange={(e) => setPatternOptions(selectedPattern.patternId,
                                                       { swing: Number(e.currentTarget.value) })} />
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
            <label class="mini-field groove-strength">Strength — {Math.round(grooveAmount * 100)}%
              <input type="range" min="0" max="1" step="0.05" bind:value={grooveAmount} />
            </label>
            <PropertyToggle compact label="Velocity accents" value={grooveVelocity}
                            onchange={(on) => { grooveVelocity = on; }} />
            <button type="button" disabled={!selectedGroove}
                    title="Commit this feel into the pattern's editable microtiming and velocity steps"
                    onclick={() => applyGrooveTemplate(selectedPattern.patternId,
                                                       selectedGroove.grooveId,
                                                       Number(grooveAmount), grooveVelocity)}>
              Apply
            </button>
            <label class="groove-picker">
              <span>Import JSON…</span>
              <input type="file" accept=".json,application/json,text/plain" onchange={importGrooveFile} />
            </label>
            {#if selectedGroove?.source === 'imported'}
              <button type="button" class="ghost danger"
                      onclick={() => removeGrooveTemplate(selectedGroove.grooveId)}>Remove template</button>
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
                <button type="button" class="ghost danger" title="Remove this lane"
                        onclick={() => removeLane(selectedPattern.patternId, lane.laneId)}>×</button>
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
                  <div class="roll-side">
                    <button type="button" class="ghost" title="One octave up"
                            onclick={() => shiftRoll(lane, 1)}>▲</button>
                    <button type="button" class="ghost" title="One octave down"
                            onclick={() => shiftRoll(lane, -1)}>▼</button>
                  </div>
                </div>
                {#if selectedLane?.laneId === lane.laneId}
                  <!-- Dynamics under the melody, exactly the arp's gesture. -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="bar-lane" data-testid={`velocity-lane-${lane.laneId}`}
                       title="Velocity per step — drag"
                       onpointerdown={(e) => barDown(lane, 'velocity', e)}
                       onpointermove={(e) => barMove(lane, 'velocity', e)}
                       onpointerup={barUp} onpointercancel={barUp}>
                    {#each lane.steps as step, index (index)}
                      <div class="bar-col" class:idle={!step.active}
                           class:locked={stepHasLocks(lane, index)}
                           class:playing={playingColumn(lane) === index}>
                        {#if step.active}
                          <div class="bar-fill" style={`height: ${Math.max(step.velocity / 127 * 100, 4)}%`}></div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
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
                {#if selectedLane?.laneId === lane.laneId && lane.type === 'drum'}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="bar-lane" data-testid={`velocity-lane-${lane.laneId}`}
                       title="Velocity per step — drag"
                       onpointerdown={(e) => barDown(lane, 'velocity', e)}
                       onpointermove={(e) => barMove(lane, 'velocity', e)}
                       onpointerup={barUp} onpointercancel={barUp}>
                    {#each lane.steps as step, index (index)}
                      <div class="bar-col" class:idle={!step.active}
                           class:locked={stepHasLocks(lane, index)}
                           class:playing={playingColumn(lane) === index}>
                        {#if step.active}
                          <div class="bar-fill" style={`height: ${Math.max(step.velocity / 127 * 100, 4)}%`}></div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>
          {/each}

          {#if selectedLane}
            <div class="lane-options" data-testid="perf-lane-options">
              <label class="mini-field">Steps
                <input type="number" min="1" max="64" value={selectedLane.stepCount}
                       onchange={(e) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId,
                                                       { stepCount: Number(e.currentTarget.value) })} />
              </label>
              <label class="mini-field" title="Steps per beat — a lane's own rate, which is what makes polymeter free">
                Rate
                <select value={selectedLane.stepsPerBeat}
                        onchange={(e) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId,
                                                        { stepsPerBeat: Number(e.currentTarget.value) })}>
                  {#each [1, 2, 3, 4, 6, 8, 12, 16] as rate (rate)}
                    <option value={rate}>{rate}/beat</option>
                  {/each}
                </select>
              </label>
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
                <label class="mini-field">Note
                  <input type="number" min="0" max="127" value={selectedLane.drumNote}
                         onchange={(e) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId,
                                                         { drumNote: Number(e.currentTarget.value) })} />
                </label>
              {/if}
              {#if selectedLane.type === 'cc'}
                <label class="mini-field">CC
                  <input type="number" min="0" max="127" value={selectedLane.ccNumber}
                         onchange={(e) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId,
                                                         { ccNumber: Number(e.currentTarget.value) })} />
                </label>
              {/if}
              {#if selectedLane.type === 'cc' || selectedLane.type === 'parameter'}
                <PropertyToggle compact label="Glide" value={selectedLane.glide}
                                ariaLabel="Interpolate between steps"
                                onchange={(on) => setLaneOptions(selectedPattern.patternId, selectedLane.laneId, { glide: on })} />
              {/if}
              <label class="mini-field" title="Spread N hits evenly over the lane's steps">
                Euclid
                <input type="number" min="0" max={selectedLane.stepCount} value={selectedLane.euclidPulses}
                       onchange={(e) => euclidFill(selectedPattern.patternId, selectedLane.laneId,
                                                   Number(e.currentTarget.value))} />
              </label>
              <button type="button" class="ghost"
                      onclick={() => clearLane(selectedPattern.patternId, selectedLane.laneId)}>Clear</button>
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
                <label class="mini-field">Note
                  <input type="number" min="0" max="127" value={selectedStep.note}
                         onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                  { note: Number(e.currentTarget.value) })} />
                </label>
              {/if}
              {#if selectedLane.type === 'cc' || selectedLane.type === 'parameter'}
                <label class="mini-field">Value
                  <input type="range" min="0" max="1" step="0.01" value={selectedStep.value}
                         onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                  { value: Number(e.currentTarget.value) })} />
                </label>
              {:else}
                <label class="mini-field">Velocity
                  <input type="number" min="1" max="127" value={selectedStep.velocity}
                         onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                  { velocity: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field">Gate
                  <input type="range" min="0.05" max="4" step="0.05" value={selectedStep.gate}
                         onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                  { gate: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field" title="Retriggers inside this step">Ratchet
                  <input type="number" min="1" max="8" value={selectedStep.ratchets}
                         onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                  { ratchets: Number(e.currentTarget.value) })} />
                </label>
                <PropertyToggle compact label="Tie" value={selectedStep.tie} ariaLabel="Tie to the previous step"
                                onchange={(on) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex, { tie: on })} />
              {/if}
              <label class="mini-field" title="Rolled from the pattern's seed, so the same seed replays the same show">
                Chance
                <input type="number" min="0" max="100" value={selectedStep.probability}
                       onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                { probability: Number(e.currentTarget.value) })} />
              </label>
              <label class="mini-field" title="Nudge, as a fraction of a step">Nudge
                <input type="range" min="-0.5" max="0.5" step="0.01" value={selectedStep.microtiming}
                       onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                { microtiming: Number(e.currentTarget.value) })} />
              </label>
              <label class="mini-field" title="Play only on every Nth loop">Every
                <input type="number" min="1" max="16" value={selectedStep.every}
                       onchange={(e) => setStep(selectedPattern.patternId, selectedLane.laneId, selectedStepIndex,
                                                { every: Number(e.currentTarget.value) })} />
              </label>

              <div class="lock-editor" data-testid="perf-parameter-locks">
                <div class="lock-head">
                  <strong>Parameter locks</strong>
                  <span>Values recalled on this step only</span>
                  {#if selectedStepLocks.length > 0}
                    <button type="button" class="ghost danger"
                            onclick={() => clearStepLocks(selectedPattern.patternId, selectedLane.laneId,
                                                          selectedStepIndex)}>Clear step</button>
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
                        <button type="button" class="ghost danger" title="Remove this lock"
                                onclick={() => removeStepLock(selectedPattern.patternId, selectedLane.laneId,
                                                             selectedStepIndex, lockLane.laneId)}>×</button>
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
              <button type="button" class="ghost danger"
                      disabled={performance.looper.recording
                        || (performance.gestures.recording && performance.gestures.targetClipId === layer.clipId)}
                      title="Remove this layer and its recorded pattern"
                      onclick={() => removeMidiLoop(layer.clipId)}>×</button>
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
              <button type="button" class="ghost" disabled={performance.gestures.recording || automationCount === 0}
                      title="Clear every recorded automation lane in this clip"
                      onclick={() => clearGestureLanes(clip.clipId)}>Clear</button>
              <span class="pass-count">{clip.gesturePasses} {clip.gesturePasses === 1 ? 'take' : 'takes'}</span>
              {#if clip.gestureClip}
                <button type="button" class="ghost danger" disabled={performance.gestures.recording}
                        title="Remove this gesture performance and its private pattern"
                        onclick={() => removeClip(clip.clipId)}>×</button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
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
              <button type="button" class="ghost danger"
                      disabled={performance.performanceRecorder.recording}
                      onclick={() => removePerformanceTake(take.takeId)}
                      aria-label={`Remove ${take.name}`}>×</button>
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
        <button type="button" class="ghost danger"
                disabled={$hostState.rack.modulationRoutes.length === 0}
                onclick={() => clearModulationRoutes()}>Clear all</button>
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
              <button type="button" class="ghost danger" title="Remove route"
                      onclick={() => removeModulationRoute(route.routeId)}>×</button>
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

      {#if $hostState.rack.midiLfos.length === 0}
        <div class="looper-empty">
          No LFOs yet. Add one, choose its waveform and speed, then route it in the matrix.
        </div>
      {:else}
        <div class="lfo-grid">
          {#each $hostState.rack.midiLfos as lfo (lfo.lfoId)}
            <article class="lfo-card" class:disabled={!lfo.enabled}>
              <header class="lfo-card-head">
                <button type="button" class="route-power" class:on={lfo.enabled}
                        title={lfo.enabled ? 'Disable LFO' : 'Enable LFO'}
                        onclick={() => setMidiLfo(lfo.lfoId, { enabled: !lfo.enabled })}>
                  {lfo.enabled ? '●' : '○'}
                </button>
                <input class="lfo-name" value={lfo.name} aria-label="LFO name"
                       onchange={(e) => setMidiLfo(lfo.lfoId, { name: e.currentTarget.value })} />
                <span class="perf-spacer"></span>
                <button type="button" class="ghost" onclick={() => resetMidiLfo(lfo.lfoId)}>
                  Restart
                </button>
                <button type="button" class="ghost danger" title="Remove LFO"
                        onclick={() => removeMidiLfo(lfo.lfoId)}>×</button>
              </header>

              <div class="lfo-scope" aria-label={`${lfo.name} current value ${Math.round(lfo.value * 100)}%`}>
                <span class="lfo-midline"></span>
                <span class="lfo-trace" style={`width: ${Math.round(lfo.phase * 100)}%`}></span>
                <span class="lfo-dot"
                      style={`left: ${Math.round(lfo.phase * 100)}%; top: ${Math.round((1 - lfo.value) * 100)}%`}></span>
                <output>{Math.round(lfo.value * 100)}%</output>
              </div>

              <div class="lfo-controls">
                <label class="mini-field">
                  <span>Shape</span>
                  <select value={lfo.shape}
                          onchange={(e) => setMidiLfo(lfo.lfoId, { shape: e.currentTarget.value })}>
                    <option value="sine">Sine</option>
                    <option value="triangle">Triangle</option>
                    <option value="sawUp">Saw up</option>
                    <option value="sawDown">Saw down</option>
                    <option value="square">Square</option>
                    <option value="sampleHold">Sample & hold</option>
                  </select>
                </label>
                <label class="mini-field lfo-sync-field">
                  <span>Clock</span>
                  <button type="button" class="toggle" class:on={lfo.sync}
                          onclick={() => setMidiLfo(lfo.lfoId, { sync: !lfo.sync })}>
                    {lfo.sync ? 'Tempo sync' : 'Free Hz'}
                  </button>
                </label>
                {#if lfo.sync}
                  <label class="mini-field">
                    <span>Cycle</span>
                    <select value={lfo.syncBeats}
                            onchange={(e) => setMidiLfo(lfo.lfoId,
                                                       { syncBeats: Number(e.currentTarget.value) })}>
                      {#each lfoSyncRates as rate (rate.label)}
                        <option value={rate.beats}>{rate.label}</option>
                      {/each}
                    </select>
                  </label>
                {:else}
                  <label class="mini-field">
                    <span>Rate Hz</span>
                    <input type="number" min="0.01" max="40" step="0.01" value={lfo.rateHz}
                           onchange={(e) => setMidiLfo(lfo.lfoId,
                                                      { rateHz: Number(e.currentTarget.value) })} />
                  </label>
                {/if}
                <label class="mini-field lfo-range">
                  <span>Phase {Math.round(lfo.phaseOffset * 360)}°</span>
                  <input type="range" min="0" max="1" step="0.01" value={lfo.phaseOffset}
                         onchange={(e) => setMidiLfo(lfo.lfoId,
                                                    { phaseOffset: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field lfo-range">
                  <span>Minimum {Math.round(lfo.minimum * 100)}%</span>
                  <input type="range" min="0" max={lfo.maximum} step="0.01" value={lfo.minimum}
                         onchange={(e) => setMidiLfo(lfo.lfoId,
                                                    { minimum: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field lfo-range">
                  <span>Maximum {Math.round(lfo.maximum * 100)}%</span>
                  <input type="range" min={lfo.minimum} max="1" step="0.01" value={lfo.maximum}
                         onchange={(e) => setMidiLfo(lfo.lfoId,
                                                    { maximum: Number(e.currentTarget.value) })} />
                </label>
                <button type="button" class="mod-add-button route-lfo"
                        onclick={() => routeLfo(lfo)}>Route in matrix →</button>
              </div>

              <div class="lfo-midi-head">
                <div>
                  <strong>Hardware MIDI</strong>
                  <span>Outputs are added muted and must be enabled explicitly.</span>
                </div>
                <button type="button" class="ghost" disabled={hardwareParts.length === 0}
                        title={hardwareParts.length === 0 ? 'Add a hardware part first' : 'Add a MIDI output'}
                        onclick={() => addHardwareLfoOutput(lfo)}>+ Output</button>
              </div>
              {#if lfo.outputs.length === 0}
                <div class="lfo-output-empty">
                  {hardwareParts.length === 0
                    ? 'Add a hardware part to make CC, NRPN or SysEx destinations available.'
                    : 'No direct hardware output. Matrix routes still work.'}
                </div>
              {:else}
                <div class="lfo-outputs">
                  {#each lfo.outputs as output (output.outputId)}
                    <div class="lfo-output" class:unresolved={!output.resolved}>
                      <button type="button" class="route-power" class:on={output.enabled}
                              title={output.enabled ? 'Mute output' : 'Enable output'}
                              onclick={() => setMidiLfoOutput(lfo.lfoId, output.outputId,
                                                              { enabled: !output.enabled })}>
                        {output.enabled ? '●' : '○'}
                      </button>
                      <label class="mini-field">
                        <span>Protocol</span>
                        <select value={output.type}
                                onchange={(e) => setMidiLfoOutput(lfo.lfoId, output.outputId,
                                                                  { type: e.currentTarget.value })}>
                          <option value="cc">CC</option>
                          <option value="nrpn">NRPN 14-bit</option>
                          <option value="sysex">SysEx</option>
                        </select>
                      </label>
                      <label class="mini-field lfo-output-target">
                        <span>Hardware part</span>
                        <select value={output.targetPartId}
                                onchange={(e) => setMidiLfoOutput(lfo.lfoId, output.outputId,
                                                                  { targetPartId: e.currentTarget.value })}>
                          {#each hardwareParts as part (part.partId)}
                            <option value={part.partId}>{part.midiOutputName || part.pluginName || 'Hardware part'}</option>
                          {/each}
                        </select>
                      </label>
                      {#if output.type !== 'sysex'}
                        <label class="mini-field lfo-output-small">
                          <span>Channel</span>
                          <input type="number" min="1" max="16" value={output.channel}
                                 onchange={(e) => setMidiLfoOutput(lfo.lfoId, output.outputId,
                                                                  { channel: Number(e.currentTarget.value) })} />
                        </label>
                        <label class="mini-field lfo-output-number">
                          <span>{output.type === 'nrpn' ? 'NRPN' : 'CC'}</span>
                          <input type="number" min="0" max={output.type === 'nrpn' ? 16383 : 127}
                                 value={output.number}
                                 onchange={(e) => setMidiLfoOutput(lfo.lfoId, output.outputId,
                                                                  { number: Number(e.currentTarget.value) })} />
                        </label>
                      {:else}
                        <label class="mini-field lfo-sysex">
                          <span>Template · use {'{value7}'}, {'{valueMSB}'}, {'{valueLSB}'}</span>
                          <input value={output.sysexTemplate} spellcheck="false"
                                 onchange={(e) => setMidiLfoOutput(lfo.lfoId, output.outputId,
                                                                  { sysexTemplate: e.currentTarget.value })} />
                        </label>
                      {/if}
                      {#if !output.resolved}<span class="route-missing">Unresolved</span>{/if}
                      <button type="button" class="ghost danger" title="Remove output"
                              onclick={() => removeMidiLfoOutput(lfo.lfoId, output.outputId)}>×</button>
                    </div>
                  {/each}
                </div>
              {/if}
            </article>
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
            {@const visual = envelopeVisual(envelope)}
            <article class="envelope-card" class:disabled={!envelope.enabled}>
              <header class="lfo-card-head">
                <button type="button" class="route-power" class:on={envelope.enabled}
                        title={envelope.enabled ? 'Disable envelope' : 'Enable envelope'}
                        onclick={() => setEnvelope(envelope.envelopeId,
                                                  { enabled: !envelope.enabled })}>
                  {envelope.enabled ? '●' : '○'}
                </button>
                <input class="lfo-name" value={envelope.name} aria-label="Envelope name"
                       onchange={(e) => setEnvelope(envelope.envelopeId,
                                                    { name: e.currentTarget.value })} />
                <span class="envelope-stage" class:active={envelope.stage !== 'idle'}>
                  {envelope.stage} · {Math.round(envelope.value * 100)}%
                </span>
                <span class="perf-spacer"></span>
                <button type="button" class="ghost" onclick={() => resetEnvelope(envelope.envelopeId)}>
                  Reset
                </button>
                <button type="button" class="ghost danger" title="Remove envelope"
                        onclick={() => removeEnvelope(envelope.envelopeId)}>×</button>
              </header>

              <div class="envelope-scope"
                   aria-label={`${envelope.name}, ${envelope.stage}, ${Math.round(envelope.value * 100)} percent`}>
                <svg viewBox="0 0 100 52" preserveAspectRatio="none" aria-hidden="true">
                  <line x1={visual.attackX} y1="0" x2={visual.attackX} y2="52"></line>
                  <line x1={visual.decayX} y1="0" x2={visual.decayX} y2="52"></line>
                  <line x1={visual.releaseX} y1="0" x2={visual.releaseX} y2="52"></line>
                  <polyline points={visual.points}></polyline>
                  <circle cx={visual.markerX} cy={visual.markerY} r="2.2"></circle>
                </svg>
                <div class="envelope-stage-labels" aria-hidden="true">
                  <span>A</span><span>D</span><span>S</span><span>R</span>
                </div>
              </div>

              <div class="envelope-controls">
                <label class="mini-field envelope-time">
                  <span>Attack {Math.round(envelope.attackMs)} ms</span>
                  <input type="range" min="0" max="1" step="0.001"
                         value={envelopeTimePosition(envelope.attackMs)}
                         onchange={(e) => setEnvelope(envelope.envelopeId,
                           { attackMs: envelopeTimeFromPosition(e.currentTarget.value) })} />
                </label>
                <label class="mini-field envelope-time">
                  <span>Decay {Math.round(envelope.decayMs)} ms</span>
                  <input type="range" min="0" max="1" step="0.001"
                         value={envelopeTimePosition(envelope.decayMs)}
                         onchange={(e) => setEnvelope(envelope.envelopeId,
                           { decayMs: envelopeTimeFromPosition(e.currentTarget.value) })} />
                </label>
                <label class="mini-field envelope-time">
                  <span>Sustain {Math.round(envelope.sustain * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.01" value={envelope.sustain}
                         onchange={(e) => setEnvelope(envelope.envelopeId,
                                                      { sustain: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field envelope-time">
                  <span>Release {Math.round(envelope.releaseMs)} ms</span>
                  <input type="range" min="0" max="1" step="0.001"
                         value={envelopeTimePosition(envelope.releaseMs)}
                         onchange={(e) => setEnvelope(envelope.envelopeId,
                           { releaseMs: envelopeTimeFromPosition(e.currentTarget.value) })} />
                </label>
                <label class="mini-field envelope-time">
                  <span>Curve {envelope.curve > 0 ? '+' : ''}{envelope.curve.toFixed(2)}</span>
                  <input type="range" min="-1" max="1" step="0.01" value={envelope.curve}
                         onchange={(e) => setEnvelope(envelope.envelopeId,
                                                      { curve: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field envelope-time">
                  <span>Velocity {Math.round(envelope.velocityAmount * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.01" value={envelope.velocityAmount}
                         onchange={(e) => setEnvelope(envelope.envelopeId,
                                                      { velocityAmount: Number(e.currentTarget.value) })} />
                </label>
              </div>

              <div class="envelope-trigger-row">
                <label class="mini-field">
                  <span>MIDI channel</span>
                  <select value={envelope.channel}
                          onchange={(e) => setEnvelope(envelope.envelopeId,
                                                       { channel: Number(e.currentTarget.value) })}>
                    <option value={0}>Omni</option>
                    {#each Array.from({ length: 16 }, (_, index) => index + 1) as channel (channel)}
                      <option value={channel}>{channel}</option>
                    {/each}
                  </select>
                </label>
                <label class="mini-field envelope-note">
                  <span>Lowest note</span>
                  <input type="number" min="0" max="127" value={envelope.noteLow}
                         title={noteName(envelope.noteLow)}
                         onchange={(e) => setEnvelope(envelope.envelopeId,
                                                      { noteLow: Number(e.currentTarget.value) })} />
                  <output>{noteName(envelope.noteLow)}</output>
                </label>
                <label class="mini-field envelope-note">
                  <span>Highest note</span>
                  <input type="number" min="0" max="127" value={envelope.noteHigh}
                         title={noteName(envelope.noteHigh)}
                         onchange={(e) => setEnvelope(envelope.envelopeId,
                                                      { noteHigh: Number(e.currentTarget.value) })} />
                  <output>{noteName(envelope.noteHigh)}</output>
                </label>
                <label class="mini-field">
                  <span>Held notes</span>
                  <button type="button" class="toggle" class:on={envelope.retrigger}
                          onclick={() => setEnvelope(envelope.envelopeId,
                                                    { retrigger: !envelope.retrigger })}>
                    {envelope.retrigger ? 'Retrigger' : 'Legato'}
                  </button>
                </label>
                <span class="perf-spacer"></span>
                <button type="button" class="envelope-audition" disabled={!envelope.enabled}
                        onpointerdown={() => triggerEnvelope(envelope.envelopeId, true, 1)}
                        onpointerup={() => triggerEnvelope(envelope.envelopeId, false)}
                        onpointercancel={() => triggerEnvelope(envelope.envelopeId, false)}
                        onpointerleave={() => triggerEnvelope(envelope.envelopeId, false)}>
                  Hold to audition
                </button>
                <button type="button" class="mod-add-button"
                        onclick={() => routeEnvelope(envelope)}>Route in matrix →</button>
              </div>
            </article>
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
            {@const points = msegDisplayPoints(mseg)}
            {@const selectedPoint = (selectedMsegId === mseg.msegId
              ? points.find((point) => point.pointId === selectedMsegPointId) : null) ?? points[0]}
            {@const selectedPointIndex = points.findIndex(
              (point) => point.pointId === selectedPoint.pointId)}
            <article class="mseg-card" class:disabled={!mseg.enabled}>
              <header class="lfo-card-head">
                <button type="button" class="route-power" class:on={mseg.enabled}
                        title={mseg.enabled ? 'Disable MSEG' : 'Enable MSEG'}
                        onclick={() => setMseg(mseg.msegId, { enabled: !mseg.enabled })}>
                  {mseg.enabled ? '●' : '○'}
                </button>
                <input class="lfo-name" value={mseg.name} aria-label="MSEG name"
                       onchange={(e) => setMseg(mseg.msegId, { name: e.currentTarget.value })} />
                <span class="mseg-readout">
                  phase {Math.round(mseg.phase * 100)}% · value {Math.round(mseg.value * 100)}%
                </span>
                <span class="perf-spacer"></span>
                <button type="button" class="ghost" onclick={() => resetMseg(mseg.msegId)}>
                  Restart
                </button>
                <button type="button" class="ghost danger" title="Remove MSEG"
                        onclick={() => removeMseg(mseg.msegId)}>×</button>
              </header>

              <div class="mseg-editor">
                <svg viewBox="0 0 100 60" preserveAspectRatio="none" role="application"
                     aria-label={`${mseg.name} curve editor. Double-click to add, drag points, right-click to remove.`}
                     ondblclick={(e) => addMsegPoint(mseg, e)}
                     onpointermove={(e) => moveMsegPoint(mseg, e)}
                     onpointerup={(e) => endMsegDrag(mseg, e)}
                     onpointercancel={(e) => endMsegDrag(mseg, e)}>
                  <g class="mseg-grid-lines" aria-hidden="true">
                    {#each [25, 50, 75] as x (x)}<line x1={x} y1="0" x2={x} y2="60"></line>{/each}
                    {#each [15, 30, 45] as y (y)}<line x1="0" y1={y} x2="100" y2={y}></line>{/each}
                  </g>
                  <path class="mseg-curve" d={msegPath(points)}></path>
                  <line class="mseg-playhead" x1={mseg.phase * 100} y1="0"
                        x2={mseg.phase * 100} y2="60"></line>
                  <rect class="mseg-live-dot" x={mseg.phase * 100 - 0.7}
                        y={(1 - mseg.value) * 60 - 2.5} width="1.4" height="5"></rect>
                  {#each points as point, pointIndex (point.pointId)}
                    <rect class="mseg-point"
                          class:selected={selectedMsegId === mseg.msegId
                            && selectedMsegPointId === point.pointId}
                          x={point.position * 100 - 0.85} y={(1 - point.value) * 60 - 3}
                          width="1.7" height="6"
                          role="button" tabindex="0"
                          aria-label={`Point ${pointIndex + 1}, position ${Math.round(point.position * 100)} percent, value ${Math.round(point.value * 100)} percent`}
                          onpointerdown={(e) => beginMsegDrag(mseg, point, e)}
                          ondblclick={(e) => e.stopPropagation()}
                          onkeydown={(e) => msegPointKey(mseg, point, pointIndex, e)}
                          oncontextmenu={(e) => deleteMsegPoint(mseg, point, e)}>
                      <title>{Math.round(point.position * 100)}% · {Math.round(point.value * 100)}%</title>
                    </rect>
                  {/each}
                </svg>
                <div class="mseg-axis" aria-hidden="true">
                  <span>0</span><span>¼</span><span>½</span><span>¾</span><span>1 cycle</span>
                </div>
              </div>

              <div class="mseg-controls">
                <label class="mini-field mseg-clock">
                  <span>Clock</span>
                  <button type="button" class="toggle" class:on={mseg.sync}
                          onclick={() => setMseg(mseg.msegId, { sync: !mseg.sync })}>
                    {mseg.sync ? 'Tempo sync' : 'Free Hz'}
                  </button>
                </label>
                {#if mseg.sync}
                  <label class="mini-field">
                    <span>Cycle</span>
                    <select value={mseg.syncBeats}
                            onchange={(e) => setMseg(mseg.msegId,
                              { syncBeats: Number(e.currentTarget.value) })}>
                      {#each lfoSyncRates as rate (rate.label)}
                        <option value={rate.beats}>{rate.label}</option>
                      {/each}
                    </select>
                  </label>
                {:else}
                  <label class="mini-field">
                    <span>Rate Hz</span>
                    <input type="number" min="0.01" max="40" step="0.01" value={mseg.rateHz}
                           onchange={(e) => setMseg(mseg.msegId,
                             { rateHz: Number(e.currentTarget.value) })} />
                  </label>
                {/if}
                <label class="mini-field mseg-phase">
                  <span>Phase {Math.round(mseg.phaseOffset * 360)}°</span>
                  <input type="range" min="0" max="1" step="0.01" value={mseg.phaseOffset}
                         onchange={(e) => setMseg(mseg.msegId,
                           { phaseOffset: Number(e.currentTarget.value) })} />
                </label>
                <div class="mseg-presets">
                  <span>Shape</span>
                  <button type="button" class="ghost"
                          onclick={() => applyMsegPreset(mseg, [[0, 0], [1, 1]])}>Ramp</button>
                  <button type="button" class="ghost"
                          onclick={() => applyMsegPreset(mseg,
                            [[0, 0], [0.1, 1, -0.35], [0.45, 0.18, 0.2], [1, 0]])}>Pluck</button>
                  <button type="button" class="ghost"
                          onclick={() => applyMsegPreset(mseg,
                            [[0, 0], [0.24, 0], [0.25, 1], [0.74, 1], [0.75, 0], [1, 0]])}>Pulse</button>
                </div>
                <span class="perf-spacer"></span>
                <button type="button" class="mod-add-button"
                        onclick={() => routeMseg(mseg)}>Route in matrix →</button>
              </div>

              <div class="mseg-point-inspector">
                <strong>Point {selectedPointIndex + 1}</strong>
                <label class="mini-field mseg-point-control">
                  <span>Position {Math.round(selectedPoint.position * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.005" value={selectedPoint.position}
                         disabled={selectedPointIndex === 0 || selectedPointIndex === points.length - 1}
                         onchange={(e) => setSelectedMsegPoint(mseg,
                           { position: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field mseg-point-control">
                  <span>Value {Math.round(selectedPoint.value * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.005" value={selectedPoint.value}
                         onchange={(e) => setSelectedMsegPoint(mseg,
                           { value: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field mseg-point-control">
                  <span>Curve {selectedPoint.curve > 0 ? '+' : ''}{selectedPoint.curve.toFixed(2)}</span>
                  <input type="range" min="-1" max="1" step="0.01" value={selectedPoint.curve}
                         disabled={selectedPointIndex === 0}
                         onchange={(e) => setSelectedMsegPoint(mseg,
                           { curve: Number(e.currentTarget.value) })} />
                </label>
                <button type="button" class="ghost danger"
                        disabled={points.length <= 2 || selectedPointIndex === 0
                          || selectedPointIndex === points.length - 1}
                        onclick={(e) => deleteMsegPoint(mseg, selectedPoint, e)}>
                  Remove point
                </button>
                <span class="mseg-point-count">{points.length} / 64 points</span>
              </div>
            </article>
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
            {@const preview = randomPreviewValues(random)}
            {@const liveStep = ((Math.max(0, random.step) % preview.length) + preview.length)
              % preview.length}
            <article class="random-card" class:disabled={!random.enabled}>
              <header class="lfo-card-head">
                <button type="button" class="route-power" class:on={random.enabled}
                        title={random.enabled ? 'Disable random modulator' : 'Enable random modulator'}
                        onclick={() => setRandomModulator(random.randomId,
                          { enabled: !random.enabled })}>
                  {random.enabled ? '●' : '○'}
                </button>
                <input class="lfo-name" value={random.name} aria-label="Random modulator name"
                       onchange={(e) => setRandomModulator(random.randomId,
                         { name: e.currentTarget.value })} />
                <span class="random-mode-readout">{randomModeLabel(random.mode)}</span>
                <span class="random-value-readout">{Math.round(random.value * 100)}%</span>
                <span class="perf-spacer"></span>
                <button type="button" class="ghost"
                        onclick={() => resetRandomModulator(random.randomId)}>Restart</button>
                <button type="button" class="ghost danger" title="Remove random modulator"
                        onclick={() => removeRandomModulator(random.randomId)}>×</button>
              </header>

              <div class="random-scope"
                   aria-label={`${random.name}, ${randomModeLabel(random.mode)}, current value ${Math.round(random.value * 100)} percent`}>
                <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
                  <g class="random-grid-lines">
                    {#each [25, 50, 75] as x (x)}<line x1={x} y1="0" x2={x} y2="60"></line>{/each}
                    {#each [15, 30, 45] as y (y)}<line x1="0" y1={y} x2="100" y2={y}></line>{/each}
                  </g>
                  <path class="random-preview" d={randomPreviewPath(random)}></path>
                  <line class="random-playhead"
                        x1={(liveStep + random.phase) * 100 / preview.length} y1="0"
                        x2={(liveStep + random.phase) * 100 / preview.length} y2="60"></line>
                  <rect class="random-live-dot"
                        x={(liveStep + random.phase) * 100 / preview.length - 0.8}
                        y={(1 - random.value) * 60 - 3} width="1.6" height="6"></rect>
                </svg>
                <div class="random-scope-labels" aria-hidden="true">
                  <span>Seed {random.seed}</span>
                  <span>Step {Math.max(0, random.step) + 1}</span>
                </div>
              </div>

              <div class="random-controls">
                <label class="mini-field">
                  <span>Character</span>
                  <select value={random.mode}
                          onchange={(e) => setRandomModulator(random.randomId,
                            { mode: e.currentTarget.value })}>
                    <option value="sampleHold">Sample &amp; hold</option>
                    <option value="smoothRandom">Smooth random</option>
                    <option value="chaos">Chaos</option>
                    <option value="randomWalk">Bounded walk</option>
                  </select>
                </label>
                <label class="mini-field random-clock">
                  <span>Clock</span>
                  <button type="button" class="toggle" class:on={random.sync}
                          onclick={() => setRandomModulator(random.randomId,
                            { sync: !random.sync })}>
                    {random.sync ? 'Tempo sync' : 'Free Hz'}
                  </button>
                </label>
                {#if random.sync}
                  <label class="mini-field">
                    <span>Decision rate</span>
                    <select value={random.syncBeats}
                            onchange={(e) => setRandomModulator(random.randomId,
                              { syncBeats: Number(e.currentTarget.value) })}>
                      {#each lfoSyncRates as rate (rate.label)}
                        <option value={rate.beats}>{rate.label}</option>
                      {/each}
                    </select>
                  </label>
                {:else}
                  <label class="mini-field">
                    <span>Rate Hz</span>
                    <input type="number" min="0.01" max="40" step="0.01" value={random.rateHz}
                           onchange={(e) => setRandomModulator(random.randomId,
                             { rateHz: Number(e.currentTarget.value) })} />
                  </label>
                {/if}
                <label class="mini-field random-wide">
                  <span>Chance {Math.round(random.probability * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.01" value={random.probability}
                         onchange={(e) => setRandomModulator(random.randomId,
                           { probability: Number(e.currentTarget.value) })} />
                </label>
                {#if random.mode === 'smoothRandom'}
                  <label class="mini-field random-wide">
                    <span>Glide {Math.round(random.smoothing * 100)}%</span>
                    <input type="range" min="0" max="1" step="0.01" value={random.smoothing}
                           onchange={(e) => setRandomModulator(random.randomId,
                             { smoothing: Number(e.currentTarget.value) })} />
                  </label>
                {:else if random.mode === 'chaos'}
                  <label class="mini-field random-wide">
                    <span>Chaos {Math.round(random.chaos * 100)}%</span>
                    <input type="range" min="0" max="1" step="0.01" value={random.chaos}
                           onchange={(e) => setRandomModulator(random.randomId,
                             { chaos: Number(e.currentTarget.value) })} />
                  </label>
                {:else if random.mode === 'randomWalk'}
                  <label class="mini-field random-wide">
                    <span>Step size {Math.round(random.stepSize * 100)}%</span>
                    <input type="range" min="0" max="1" step="0.01" value={random.stepSize}
                           onchange={(e) => setRandomModulator(random.randomId,
                             { stepSize: Number(e.currentTarget.value) })} />
                  </label>
                {/if}
              </div>

              <div class="random-range-row">
                <label class="mini-field random-range">
                  <span>Minimum {Math.round(random.minimum * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.01" value={random.minimum}
                         onchange={(e) => setRandomModulator(random.randomId,
                           { minimum: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field random-range">
                  <span>Maximum {Math.round(random.maximum * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.01" value={random.maximum}
                         onchange={(e) => setRandomModulator(random.randomId,
                           { maximum: Number(e.currentTarget.value) })} />
                </label>
                <label class="mini-field random-seed">
                  <span>Seed</span>
                  <input type="number" min="1" max="2147483647" step="1" value={random.seed}
                         onchange={(e) => setRandomModulator(random.randomId,
                           { seed: Number(e.currentTarget.value) })} />
                </label>
                <button type="button" class="ghost" onclick={() => reseedRandom(random)}>
                  New seed
                </button>
                <span class="perf-spacer"></span>
                <button type="button" class="mod-add-button"
                        onclick={() => routeRandom(random)}>Route in matrix →</button>
              </div>
            </article>
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
    <div class="perf-body clip-scene-body">
      <div class="clip-column">
        <div class="perf-head">
          <strong>Clips</strong>
          <label class="freeze-cycles" title="How many source cycles become one deterministic clip">
            Freeze
            <select aria-label="MIDI freeze cycles" value={freezeCycles}
                    onchange={(e) => (freezeCycles = Number(e.currentTarget.value))}>
              {#each [1, 2, 4, 8] as cycles (cycles)}
                <option value={cycles}>{cycles}×</option>
              {/each}
            </select>
          </label>
          <button type="button" class="ghost" onclick={() => stopAllClips()}>Stop all</button>
        </div>
        {#if performance.clips.length === 0}
          <div class="empty-hint">No clips yet — make one from a pattern.</div>
        {/if}
        {#each performance.clips as clip (clip.clipId)}
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
            <select value={clip.launchQuantize} aria-label={`${clip.name} launch quantization`}
                    onchange={(e) => setClipOptions(clip.clipId, { launchQuantize: e.currentTarget.value })}>
              {#each quantizeOptions as option (option)}
                <option value={option}>{option}</option>
              {/each}
            </select>
            <PropertyToggle compact label="Loop" value={clip.loop} ariaLabel={`${clip.name} loops`}
                            onchange={(on) => setClipOptions(clip.clipId, { loop: on })} />
            <select class="follow-action" value={clip.followAction}
                    aria-label={`${clip.name} follow action`}
                    title="What happens after the configured number of loops"
                    onchange={(e) => {
                      const followAction = e.currentTarget.value;
                      const patch = {
                        followAction,
                        followAfterLoops: followAction === 'none'
                          ? 0 : Math.max(1, clip.followAfterLoops || 1),
                      };
                      if (followAction === 'clip' && !clip.followClipId)
                        patch.followClipId = followTargetsFor(clip)[0]?.clipId ?? '';
                      setClipOptions(clip.clipId, patch);
                    }}>
              <option value="none">No follow</option>
              <option value="clip">Target clip</option>
              <option value="next">Next clip</option>
              <option value="random">Random clip</option>
              <option value="stop">Stop</option>
            </select>
            {#if clip.followAction !== 'none'}
              <label class="follow-loops" title="Complete this many loops before the action">
                after
                <input type="number" min="1" max="64" value={Math.max(1, clip.followAfterLoops)}
                       aria-label={`${clip.name} follow loops`}
                       onchange={(e) => setClipOptions(clip.clipId,
                         { followAfterLoops: Number(e.currentTarget.value) })} />
              </label>
            {/if}
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
            <select class="fill-quantize" value={clip.fillQuantize}
                    aria-label={`${clip.name} fill quantization`}
                    title="Boundary used for both press and release"
                    onchange={(e) => setClipOptions(clip.clipId, { fillQuantize: e.currentTarget.value })}>
              {#each quantizeOptions as option (option)}
                <option value={option}>{option}</option>
              {/each}
            </select>
            <button type="button" class="fill-hold" class:on={clip.fillActive || clip.fillPending}
                    disabled={!clip.active || !clip.fillPatternId}
                    title="Hold for the temporary fill; release to return without restarting the clip"
                    onpointerdown={(e) => {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      setPerformanceFill(clip.clipId, true);
                    }}
                    onpointerup={(e) => { e.preventDefault(); setPerformanceFill(clip.clipId, false); }}
                    onpointercancel={() => setPerformanceFill(clip.clipId, false)}
                    onkeydown={(e) => {
                      if (!e.repeat && (e.key === ' ' || e.key === 'Enter')) {
                        e.preventDefault(); setPerformanceFill(clip.clipId, true);
                      }
                    }}
                    onkeyup={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault(); setPerformanceFill(clip.clipId, false);
                      }
                    }}>
              {clip.fillPending ? 'Fill…' : clip.fillActive ? 'Filling' : 'Hold Fill'}
            </button>
            <label class="fill-midi" title="Momentary MIDI controller; -1 disables the pedal">
              CC
              <input type="number" min="-1" max="127" value={clip.fillCc}
                     aria-label={`${clip.name} fill pedal CC`}
                     onchange={(e) => setClipOptions(clip.clipId, { fillCc: Number(e.currentTarget.value) })} />
            </label>
            <label class="fill-midi" title="0 accepts the fill pedal on any MIDI channel">
              Ch
              <input type="number" min="0" max="16" value={clip.fillChannel}
                     aria-label={`${clip.name} fill pedal channel`}
                     onchange={(e) => setClipOptions(clip.clipId, { fillChannel: Number(e.currentTarget.value) })} />
            </label>
            <button type="button" class="ghost freeze-button" disabled={clip.frozenMidi}
                    title={clip.frozenMidi
                      ? 'This clip already contains rendered post-MIDI-FX notes'
                      : `Render ${freezeCycles} cycle(s) through the part MIDI modules into a new editable clip`}
                    onclick={() => freezeMidiClip(clip.clipId, freezeCycles)}>
              {clip.frozenMidi ? 'Frozen' : 'Freeze MIDI'}
            </button>
            <button type="button" class="ghost danger" onclick={() => removeClip(clip.clipId)}>×</button>
          </div>
        {/each}
      </div>

      <div class="scene-column">
        <div class="perf-head">
          <strong>Scenes</strong>
          <button type="button" onclick={() => addScene()} data-testid="perf-add-scene">+ Scene</button>
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
        {#if performance.scenes.length === 0}
          <div class="empty-hint">
            A scene recalls clips, mixer state and macros together — add one to capture the rig as it stands.
          </div>
        {/if}
        {#each performance.scenes as scene (scene.sceneId)}
          <div class="scene-row" data-testid="perf-scene">
            <button type="button" class="clip-launch"
                    title={scene.morphBeats > 0
                      ? `Launch at its boundary and morph continuous controls over ${scene.morphBeats} beats`
                      : 'Launch this scene at its boundary'}
                    onclick={() => launchScene(scene.sceneId)}>▶</button>
            <input type="text" class="clip-name scene-name-input" value={scene.name}
                   aria-label="Scene name" title="Rename scene"
                   onchange={(e) => renameScene(scene.sceneId, e.currentTarget.value)} />
            <span class="scene-detail">{scene.clipIds.length} clips · {scene.numSlots} slots · {scene.numMacros} macros · {scene.numParameters} mapped</span>
            <select value={scene.launchQuantize} aria-label={`${scene.name} launch quantization`}
                    onchange={(e) => setSceneOptions(scene.sceneId, { launchQuantize: e.currentTarget.value })}>
              {#each quantizeOptions as option (option)}
                <option value={option}>{option}</option>
              {/each}
            </select>
            <label class="scene-morph" title="Continuous scene values move together; clips, mute and tempo still land on the boundary">
              Morph
              <select value={String(scene.morphBeats)} aria-label={`${scene.name} snapshot morph time`}
                      onchange={(e) => setSceneOptions(scene.sceneId,
                        { morphBeats: Number(e.currentTarget.value) })}>
                {#each snapshotMorphOptions as option (option.value)}
                  <option value={String(option.value)}>{option.label}</option>
                {/each}
              </select>
            </label>
            <label class="scene-morph" title="CTRL49 control layout recalled with this scene">
              Controls
              <select value={scene.pageId} aria-label={`${scene.name} CTRL49 controls`}
                      onchange={(e) => setSceneOptions(scene.sceneId,
                        { pageId: e.currentTarget.value })}>
                <option value="">Keep page</option>
                {#each $hostState.rack.pages.slice(0, 3) as page (page.pageId)}
                  <option value={page.pageId}>{page.name}</option>
                {/each}
              </select>
            </label>
            <button type="button" class="ghost" title="Replace this scene's contents with the rig as it stands"
                    onclick={() => captureScene(scene.sceneId)}>Capture</button>
            <button type="button" class="ghost" title="Add to the setlist"
                    onclick={() => addSetlistItem(scene.sceneId)}>+ Set</button>
            <button type="button" class="ghost" title="Add a four-bar block to the song arranger"
                    onclick={() => addArrangementItem(scene.sceneId)}>+ Arrange</button>
            <button type="button" class="ghost danger" onclick={() => removeScene(scene.sceneId)}>×</button>
          </div>
          {#if performance.clips.length > 0}
            <div class="scene-clips">
              {#each performance.clips as clip (clip.clipId)}
                <button type="button" class="chip" class:on={scene.clipIds.includes(clip.clipId)}
                        title={`Include ${clip.name} in ${scene.name}`}
                        onclick={() => setSceneClip(scene.sceneId, clip.clipId,
                                                    !scene.clipIds.includes(clip.clipId))}>
                  {clip.name}
                </button>
              {/each}
            </div>
          {/if}
        {/each}
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
                        onchange={(value) => setArrangementOptions({ loop: value })} />
        <span class="arranger-explainer">Scenes change on bar boundaries; clips remain editable in their own patterns.</span>
      </div>

      {#if performance.arrangement.items.length === 0}
        <div class="empty-hint">
          No song blocks yet — use “+ Arrange” beside a scene. Each block simply holds that scene for a number of bars.
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
                      onclick={() => moveArrangementItem(item.itemId, index - 1)}>↑</button>
              <button type="button" class="ghost"
                      disabled={performance.arrangement.playing || index === performance.arrangement.items.length - 1}
                      aria-label={`Move ${item.name} later`}
                      onclick={() => moveArrangementItem(item.itemId, index + 1)}>↓</button>
            </div>
            <input type="text" class="arranger-name" value={item.name}
                   disabled={performance.arrangement.playing}
                   aria-label={`Arrangement block ${index + 1} name`}
                   onchange={(e) => setArrangementItem(item.itemId, { name: e.currentTarget.value })} />
            <select class="arranger-scene" value={item.sceneId} disabled={performance.arrangement.playing}
                    aria-label={`${item.name} scene`}
                    onchange={(e) => setArrangementItem(item.itemId, { sceneId: e.currentTarget.value })}>
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
                                           { bars: Number(e.currentTarget.value) })} />
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
            <button type="button" class="ghost danger" disabled={performance.arrangement.playing}
                    aria-label={`Remove ${item.name} from arrangement`}
                    onclick={() => removeArrangementItem(item.itemId)}>×</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if tab === 'setlist'}
    <div class="perf-body setlist-body" data-testid="perf-setlist">
      <div class="perf-head">
        <strong>Setlist</strong>
        <label class="mini-field" title="Warm upcoming full-rack captures before they are needed">Preload
          <select value={String(performance.setlist.preloadAhead)}
                  onchange={(e) => setSetlistOptions({ preloadAhead: Number(e.currentTarget.value) })}>
            <option value="0">Off</option>
            <option value="1">Next song</option>
            <option value="2">Next 2 songs</option>
          </select>
        </label>
        <button type="button" class="ghost" onclick={() => setlistPrev()}>← Prev</button>
        <button type="button" class="ghost" onclick={() => setlistNext()} data-testid="perf-setlist-next">Next →</button>
      </div>
      {#if performance.setlist.items.length === 0}
        <div class="empty-hint">
          Nothing in the setlist — add scenes to it, then walk them with Prev and Next on stage.
        </div>
      {/if}
      {#each performance.setlist.items as item, index (item.itemId)}
        {@const preload = preloadFor(item)}
        <div class="setlist-item" class:current={performance.setlist.currentIndex === index}
             class:missing={item.missing} class:loading={performance.setlist.loadingIndex === index}>
          <button type="button" class="ghost setlist-go" onclick={() => setlistGo(index)}>{index + 1}</button>
          <span class="setlist-order" aria-label={`Move ${item.name}`}>
            <button type="button" class="ghost" disabled={index === 0}
                    title="Move earlier" aria-label={`Move ${item.name} earlier`}
                    onclick={() => moveSetlistItem(item.itemId, index - 1)}>↑</button>
            <button type="button" class="ghost" disabled={index === performance.setlist.items.length - 1}
                    title="Move later" aria-label={`Move ${item.name} later`}
                    onclick={() => moveSetlistItem(item.itemId, index + 1)}>↓</button>
          </span>
          <input type="text" class="setlist-name" value={item.name}
                 aria-label={`Song name ${index + 1}`}
                 onchange={(e) => setSetlistItem(item.itemId, { name: e.currentTarget.value })} />
          <span class="setlist-scene">
            {item.missing ? 'scene is gone'
              : performance.setlist.loadingIndex === index ? 'loading rig…' : item.sceneName}
          </span>
          {#if preload}
            <span class={`preload-state ${preload.state}`} title={preload.error}>
              {preload.state === 'ready' ? 'ready'
                : preload.state === 'degraded' ? `degraded ${preload.ready}/${preload.total}`
                : `warming ${preload.ready}/${preload.total}`}
            </span>
          {/if}
          <input type="text" class="setlist-notes" placeholder="notes for the stage…" value={item.notes}
                 onchange={(e) => setSetlistItem(item.itemId, { notes: e.currentTarget.value })} />
          <label class="mini-field" title="Optional full-rack Library capture for this song">Rig
            <select value={item.rackRecordId}
                    onchange={(e) => setSetlistItem(item.itemId, { rackRecordId: e.currentTarget.value })}>
              <option value="">Current rig</option>
              {#each rackCaptures as record (record.recordId)}
                <option value={record.recordId} disabled={!record.available}>{record.name}</option>
              {/each}
            </select>
          </label>
          <label class="mini-field" title="CTRL49 controls shown when this song is recalled">Controls
            <select value={item.pageId}
                    onchange={(e) => setSetlistItem(item.itemId, { pageId: e.currentTarget.value })}>
              <option value="">Keep page</option>
              {#each $hostState.rack.pages.slice(0, 3) as page (page.pageId)}
                <option value={page.pageId}>{page.name}</option>
              {/each}
            </select>
          </label>
          <label class="mini-field" title="0 keeps the current tempo">Tempo
            <input type="number" min="0" max="300" value={item.tempo}
                   onchange={(e) => setSetlistItem(item.itemId, { tempo: Number(e.currentTarget.value) })} />
          </label>
          <button type="button" class="ghost danger" onclick={() => removeSetlistItem(item.itemId)}>×</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
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

  .perf-tabs { display: flex; align-items: center; gap: 6px; }
  .perf-spacer { flex: 1; }
  .recording { color: #e4b3b3; border-color: #7a4a4a; }
  .retrospective {
    display: inline-flex;
    align-items: center;
    gap: 4px;
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
  .lfo-card {
    min-width: 0;
    padding: 9px;
    border: 1px solid #393d40;
    border-left: 3px solid #d7863b;
    background: #181c20;
  }
  .lfo-card.disabled { border-left-color: #59616a; opacity: 0.67; }
  .lfo-card-head { display: flex; align-items: center; gap: 7px; }
  .lfo-name {
    width: 150px !important;
    border: 0 !important;
    border-bottom: 1px solid #4a4f53 !important;
    background: transparent !important;
    color: #e0e4e7 !important;
    font-weight: 650;
  }
  .lfo-scope {
    position: relative;
    height: 62px;
    margin: 9px 0;
    border: 1px solid #31383e;
    background:
      linear-gradient(90deg, transparent 24.8%, #2b3238 25%, transparent 25.2%, transparent 49.8%, #2b3238 50%, transparent 50.2%, transparent 74.8%, #2b3238 75%, transparent 75.2%),
      #12171b;
    overflow: hidden;
  }
  .lfo-midline { position: absolute; inset: 50% 0 auto; border-top: 1px solid #2d343a; }
  .lfo-trace {
    position: absolute;
    left: 0;
    top: calc(50% - 1px);
    height: 2px;
    background: linear-gradient(90deg, #774924, #d7863b);
  }
  .lfo-dot {
    position: absolute;
    width: 8px;
    height: 8px;
    transform: translate(-4px, -4px);
    border: 1px solid #ffd1a5;
    background: #df8739;
    box-shadow: 0 0 7px #d7863b99;
  }
  .lfo-scope output {
    position: absolute;
    right: 5px;
    bottom: 3px;
    color: #d99a62;
    font: 9px 'JetBrains Mono', monospace;
  }
  .lfo-controls { display: flex; align-items: flex-end; gap: 7px; flex-wrap: wrap; }
  .lfo-controls select { width: auto; min-width: 90px; }
  .lfo-sync-field .toggle { min-width: 86px; }
  .lfo-range { min-width: 120px; flex: 1 1 120px; }
  .lfo-range input { width: 100% !important; }
  .route-lfo { margin-left: auto; }
  .lfo-midi-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #30363b;
    font-size: 10px;
  }
  .lfo-midi-head > div { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .lfo-midi-head span { color: #737f89; }
  .lfo-output-empty { padding: 7px 0 1px; color: #717c86; font-size: 10px; }
  .lfo-outputs { display: flex; flex-direction: column; gap: 5px; margin-top: 7px; }
  .lfo-output {
    display: flex;
    align-items: flex-end;
    gap: 7px;
    padding: 7px;
    border: 1px solid #323a41;
    background: #151a1e;
  }

  .envelope-body { display: flex; flex-direction: column; gap: 10px; }
  .envelope-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(560px, 1fr)); gap: 10px; }
  .envelope-card {
    min-width: 0;
    padding: 9px;
    border: 1px solid #393d40;
    border-left: 3px solid #d7863b;
    background: #181c20;
  }
  .envelope-card.disabled { border-left-color: #59616a; opacity: 0.67; }
  .envelope-stage {
    color: #74818b;
    font: 9px 'JetBrains Mono', monospace;
    text-transform: uppercase;
  }
  .envelope-stage.active { color: #e2a46c; }
  .envelope-scope {
    position: relative;
    height: 104px;
    margin: 9px 0;
    border: 1px solid #31383e;
    background:
      linear-gradient(#2a3137 1px, transparent 1px) 0 50% / 100% 50%,
      #12171b;
    overflow: hidden;
  }
  .envelope-scope svg { display: block; width: 100%; height: calc(100% - 17px); overflow: visible; }
  .envelope-scope line { stroke: #283138; stroke-width: 0.35; vector-effect: non-scaling-stroke; }
  .envelope-scope polyline {
    fill: none;
    stroke: #d7863b;
    stroke-width: 1.35;
    vector-effect: non-scaling-stroke;
  }
  .envelope-scope circle {
    fill: #e38b3e;
    stroke: #ffd1a5;
    stroke-width: 0.8;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 2px #d7863b);
  }
  .envelope-stage-labels {
    position: absolute;
    inset: auto 7px 2px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    color: #65717a;
    font: 8px 'JetBrains Mono', monospace;
    text-align: center;
  }
  .envelope-controls { display: grid; grid-template-columns: repeat(3, minmax(120px, 1fr)); gap: 8px; }
  .envelope-time input { width: 100% !important; }
  .envelope-trigger-row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .envelope-trigger-row select { width: auto; min-width: 68px; }
  .envelope-note { position: relative; }
  .envelope-note input { width: 68px !important; padding-right: 28px !important; }
  .envelope-note output {
    position: absolute;
    right: 5px;
    bottom: 5px;
    color: #89949d;
    font: 8px 'JetBrains Mono', monospace;
    pointer-events: none;
  }
  .envelope-audition {
    border-color: #775333;
    color: #e6ad78;
    user-select: none;
    touch-action: none;
  }
  .envelope-audition:active { border-color: #dc8b43; background: #38271b; color: #ffd3aa; }

  .mseg-body { display: flex; flex-direction: column; gap: 10px; }
  .mseg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(600px, 1fr)); gap: 10px; }
  .mseg-card {
    min-width: 0;
    padding: 9px;
    border: 1px solid #393d40;
    border-left: 3px solid #d7863b;
    background: #181c20;
  }
  .mseg-card.disabled { border-left-color: #59616a; opacity: 0.67; }
  .mseg-readout {
    color: #9a7760;
    font: 9px 'JetBrains Mono', monospace;
    white-space: nowrap;
  }
  .mseg-editor {
    position: relative;
    height: 190px;
    margin: 9px 0;
    border: 1px solid #343b40;
    background: #11171b;
    overflow: hidden;
  }
  .mseg-editor svg {
    display: block;
    width: 100%;
    height: calc(100% - 18px);
    cursor: crosshair;
    touch-action: none;
  }
  .mseg-grid-lines line {
    stroke: #273037;
    stroke-width: 0.45;
    vector-effect: non-scaling-stroke;
  }
  .mseg-curve {
    fill: none;
    stroke: #d7863b;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .mseg-playhead {
    stroke: #ecc79f;
    stroke-width: 1;
    stroke-opacity: 0.55;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .mseg-live-dot {
    fill: #ffb673;
    stroke: #fff0df;
    stroke-width: 0.8;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .mseg-point {
    fill: #151c21;
    stroke: #db8c47;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    cursor: grab;
  }
  .mseg-point:hover, .mseg-point.selected { fill: #e28a3d; stroke: #ffe0c1; }
  .mseg-point:active { cursor: grabbing; }
  .mseg-axis {
    position: absolute;
    inset: auto 7px 2px;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    color: #65717a;
    font: 8px 'JetBrains Mono', monospace;
  }
  .mseg-axis span:nth-child(2), .mseg-axis span:nth-child(3), .mseg-axis span:nth-child(4) {
    text-align: center;
  }
  .mseg-axis span:last-child { text-align: right; }
  .mseg-controls { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
  .mseg-controls select { width: auto; min-width: 88px; }
  .mseg-clock .toggle { min-width: 86px; }
  .mseg-phase { min-width: 130px; }
  .mseg-phase input { width: 130px !important; }
  .mseg-presets { display: flex; align-items: flex-end; gap: 4px; }
  .mseg-presets > span {
    align-self: center;
    color: #77838c;
    font-size: 9px;
    text-transform: uppercase;
  }
  .mseg-point-inspector {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 10px;
    padding: 8px;
    border: 1px solid #30383e;
    background: #151a1e;
  }
  .mseg-point-inspector > strong {
    align-self: center;
    min-width: 52px;
    color: #d7a06d;
    font: 10px 'JetBrains Mono', monospace;
  }
  .mseg-point-control { flex: 1 1 125px; }
  .mseg-point-control input { width: 100% !important; }
  .mseg-point-count {
    align-self: center;
    color: #707b84;
    font: 9px 'JetBrains Mono', monospace;
    white-space: nowrap;
  }

  .random-body { display: flex; flex-direction: column; gap: 10px; }
  .random-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(600px, 1fr)); gap: 10px; }
  .random-card {
    min-width: 0;
    padding: 9px;
    border: 1px solid #393d40;
    border-left: 3px solid #d7863b;
    background: #181c20;
  }
  .random-card.disabled { border-left-color: #59616a; opacity: 0.67; }
  .random-mode-readout {
    color: #c58b5b;
    font: 9px 'JetBrains Mono', monospace;
    text-transform: uppercase;
  }
  .random-value-readout {
    min-width: 36px;
    color: #efb47d;
    font: 10px 'JetBrains Mono', monospace;
    text-align: right;
  }
  .random-scope {
    position: relative;
    height: 142px;
    margin: 9px 0;
    border: 1px solid #343b40;
    background: #11171b;
    overflow: hidden;
  }
  .random-scope svg { display: block; width: 100%; height: calc(100% - 19px); }
  .random-grid-lines line {
    stroke: #273037;
    stroke-width: 0.45;
    vector-effect: non-scaling-stroke;
  }
  .random-preview {
    fill: none;
    stroke: #d7863b;
    stroke-width: 1.25;
    stroke-opacity: 0.86;
    vector-effect: non-scaling-stroke;
  }
  .random-playhead {
    stroke: #f1c79e;
    stroke-width: 1;
    stroke-opacity: 0.52;
    vector-effect: non-scaling-stroke;
  }
  .random-live-dot {
    fill: #ffb673;
    stroke: #fff0df;
    stroke-width: 0.8;
    vector-effect: non-scaling-stroke;
  }
  .random-scope-labels {
    position: absolute;
    inset: auto 7px 3px;
    display: flex;
    justify-content: space-between;
    color: #65717a;
    font: 8px 'JetBrains Mono', monospace;
  }
  .random-controls, .random-range-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .random-controls select { width: auto; min-width: 104px; }
  .random-clock .toggle { min-width: 86px; }
  .random-wide { min-width: 135px; flex: 1 1 135px; }
  .random-wide input, .random-range input { width: 100% !important; }
  .random-range-row {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #30363b;
  }
  .random-range { min-width: 130px; flex: 1 1 130px; }
  .random-seed input { width: 112px !important; font: 9px 'JetBrains Mono', monospace; }

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
  .lfo-output.unresolved { border-color: #744d42; }
  .lfo-output select { width: auto; min-width: 85px; }
  .lfo-output-target { flex: 1; min-width: 130px; }
  .lfo-output-target select { width: 100%; }
  .lfo-output-small input { width: 48px !important; }
  .lfo-output-number input { width: 72px !important; }
  .lfo-sysex { flex: 1; min-width: 220px; }
  .lfo-sysex input { width: 100% !important; font: 10px 'JetBrains Mono', monospace; }

  @media (max-width: 760px) {
    .lfo-grid { grid-template-columns: minmax(0, 1fr); }
    .envelope-grid, .mseg-grid, .random-grid { grid-template-columns: minmax(0, 1fr); }
    .envelope-controls { grid-template-columns: repeat(2, minmax(100px, 1fr)); }
    .lfo-output { align-items: stretch; flex-wrap: wrap; }
    .lfo-sysex { flex-basis: 100%; }
    .tuning-summary { grid-template-columns: minmax(0, 1fr); }
    .tuning-file-row, .tuning-part { flex-wrap: wrap; }
  }

  .perf-body { display: flex; gap: 16px; align-items: flex-start; }
  .clip-scene-body { flex-direction: column; width: 100%; }
  .clip-scene-body .clip-column, .clip-scene-body .scene-column { width: 100%; flex: none; }
  .clip-scene-body .clip-row, .clip-scene-body .scene-row { flex-wrap: wrap; }
  .perf-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .empty-hint { color: #7d8894; padding: 8px 2px; font-size: 12px; }

  .pattern-list { flex: 0 0 250px; display: flex; flex-direction: column; gap: 6px; }
  .pattern-row { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 12px; }
  .pattern-row.on .pattern-name { color: #edf5fa; border-color: #5b9bd5; background: #24384c; }
  .pattern-name { flex: 1; text-align: left; }
  .pattern-detail { color: #98a4ae; font-size: 12px; }
  .variation-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; flex: 0 0 20px;
    border: 1px solid #d7863b; color: #f2aa61; background: #2b2119;
    font: 700 11px 'JetBrains Mono', monospace;
  }
  .variation-badge.editor-badge { width: 24px; height: 24px; flex-basis: 24px; }
  .variation-amount { flex-direction: row; align-items: center; }
  .variation-amount select { width: auto; min-width: 84px; }
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

  .lane-options, .step-options {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    border-top: 1px solid #2c343d;
    padding-top: 6px;
  }
  .mini-field { display: flex; flex-direction: column; gap: 4px; color: #aab4bd; font-size: 12px; }
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
  .freeze-cycles select { width: auto; min-width: 46px; }
  .freeze-button { white-space: nowrap; border-color: #456579; color: #a9ccdf; }
  .clip-row, .scene-row { display: flex; align-items: center; gap: 8px; min-height: 32px; font-size: 12px; }
  .clip-launch { padding: 2px 8px; }
  .clip-row.active .clip-launch { color: #9fd6a3; border-color: #4a7a52; }
  .clip-row.pending .clip-launch { color: #e0cf9a; border-color: #7a6a3a; }
  .fill-pattern { max-width: 130px; }
  .fill-quantize { max-width: 82px; }
  .follow-action { max-width: 104px; }
  .follow-target { max-width: 120px; }
  .follow-loops { display: inline-flex; align-items: center; gap: 3px; color: #98a4ae; }
  .follow-loops input { width: 42px; }
  .fill-hold { white-space: nowrap; border-color: #8c592e; }
  .fill-hold.on { color: #18120d; border-color: #f0a45a; background: #f0a45a; }
  .fill-midi { display: inline-flex; align-items: center; gap: 3px; color: #98a4ae; }
  .fill-midi input { width: 44px; }
  .clip-name { flex: 0 0 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scene-name-input { box-sizing: border-box; min-width: 0; }
  .clip-phase { flex: 1; height: 4px; background: #14171a; border-radius: 2px; overflow: hidden; min-width: 30px; }
  .clip-phase-fill { display: block; height: 100%; background: #5b9bd5; }
  .scene-detail { flex: 1; color: #98a4ae; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scene-morph { display: inline-flex; align-items: center; gap: 4px; color: #98a4ae; font-size: 10px; }
  .scene-morph select { width: auto; min-width: 70px; }
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

  .setlist-body { flex-direction: column; }
  .setlist-item { display: flex; align-items: center; gap: 10px; min-height: 34px; font-size: 12px; }
  .setlist-item.current { background: #24313d; border-radius: 4px; }
  .setlist-item.loading { box-shadow: inset 3px 0 #d7863b; }
  .setlist-go { flex: 0 0 26px; }
  .setlist-order { display: inline-flex; flex-direction: column; gap: 2px; }
  .setlist-order button { width: 22px; height: 15px; padding: 0; line-height: 12px; }
  .setlist-order button:disabled { opacity: 0.28; cursor: default; }
  .setlist-name { flex: 0 0 140px; }
  .setlist-scene { flex: 0 0 120px; color: #98a4ae; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .setlist-item.missing .setlist-scene { color: #d6a3a3; }
  .setlist-notes { flex: 1; min-width: 80px; }
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
