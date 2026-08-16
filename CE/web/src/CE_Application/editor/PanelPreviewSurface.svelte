<script>
  import { onDestroy, untrack } from 'svelte';
  import CanvasControl from './CanvasControl.svelte';
  import GuideLines from './GuideLines.svelte';
  import { collectSourceIds, resolveActiveLayoutId, isActiveSource, activeFilterOf, findLayout } from '../utils/lcdZones.js';
  import { FONT_H, FONT_ADVANCE } from '../utils/pixelFont.js';
  import * as textEdit from '../utils/textEditBuffer.js';
  import { get } from 'svelte/store';
  import { lcdDesignLayoutIds } from '../stores/lcdDesignLayout.js';
  import { updateControlProperty } from '../stores/controls.js';
  import { commitDeviceParameter } from '../stores/deviceProfiles.js';
  import { showGuides } from '../stores/editorView.js';
  import { showPreviewSelectionRing } from '../stores/runtimePreferences.js';
  import {
    panelPreviewSessions,
    panelPreviewDebugEnabled,
    previewInspectedControlId,
    createInteractionPreviewSession,
    updatePanelPreviewSession,
    commitPanelPreviewSelectAction,
    setPreviewInspectedControlId,
  } from '../stores/interactionPreview.js';
  import { sortControlsForRender } from '../utils/controlOrder.js';
  import { layerNames, normalizeLayerName, normalizePanelLayers } from '../utils/panelLayers.js';
  import { buildSceneryRenderPlan } from '../utils/sceneryRenderPlan.js';
  import { flatControls } from '../utils/containment.js';
  import { resolveRadioGroupLayout, resolveRadioGroupValueAtPoint } from '../utils/radioGroupLayout.js';
  import {
    listboxRows, listboxRowStride, listboxRowIndexAtPoint, listboxMaxScroll, isSelectableRow,
    listboxConfig, listboxIndexOfValue, listboxStep, listboxScrollIntoView, listboxRowHeight,
    listboxFilterHeight,
  } from '../utils/listboxLayout.js';
  import { resolveInteractiveControl } from '../utils/interactionRuntime.js';
  import { recallRowSlot } from '../stores/presetChoiceSync.js';
  import { visibleChoiceRows, dependsOnId, dependentControl } from '../utils/dependentChoices.js';
  import { meterPosition, meterPeak, meterZoneIndexAt } from '../utils/meterLayout.js';
  import {
    envelopeConfig, envelopePoints, envelopeGeometry, envHitNode, envFromPx,
    envDragNode, envAddNode, envRemoveNode, normalizePoints,
  } from '../utils/envelopeLayout.js';
  import { controlPortValues } from '../utils/controlPortValues.js';
  import {
    matrixConfig, matrixAmounts, matrixGeometry, matrixCellAtPoint, matrixCellRect,
    matrixAmountAt, matrixAmountFromDrag, matrixSetAmount, matrixIndex, matrixCols,
  } from '../utils/matrixLayout.js';
  import {
    joystickConfig, joystickPos, joystickGeometry, joyFromPx, joystickGlide,
  } from '../utils/joystickLayout.js';
  import {
    crossfaderConfig, crossfaderMix, crossfaderGeometry, crossfaderMixFromPx,
    crossfaderDetent, crossfaderGlide,
  } from '../utils/crossfaderLayout.js';
  import {
    ribbonConfig, ribbonValue, ribbonVertical, ribbonGeometry, ribbonValueFromPx,
    ribbonSnap, ribbonReturnTarget, ribbonGlide,
  } from '../utils/ribbonLayout.js';
  import { macroConfig, macroValue, macroGeometry, macroKnobHit } from '../utils/macroLayout.js';
  import {
    orbitConfig, orbitNodes, orbitGeometry, orbitHitNode, pxToOrbit, nodeAngle,
    orbitSynced, orbitCycleBars,
  } from '../utils/orbitLayout.js';
  import {
    looperConfig, looperLanes, looperGeometry, laneRect, laneAtPoint, pxToLane,
    recordAppend, normalizeGesture, looperLoopSeconds,
    looperSynced, looperLoopBars,
  } from '../utils/looperLayout.js';
  import {
    routerConfig, routerCurvePoints, routerGeometry, routerHitNode, routerNodeFromPx,
    routerInputFromState, routerSourceIsMidi,
  } from '../utils/routerLayout.js';
  import {
    timbreConfig, timbreAnchors, timbreGeometry, timbreHitAnchor, timbreFromPx,
  } from '../utils/timbreLayout.js';
  import {
    turingConfig, turingSteps, turingLength, turingStepIndex, turingGeometry,
    stepAtPoint, valueFromY, turingStepsPerSecond, mutateStep,
    turingSynced, turingSyncedStepAt, turingSyncedPhaseAt,
  } from '../utils/turingLayout.js';
  import {
    kineticConfig, kineticParams, kineticInitial, kineticGeometry, kineticFromPx,
    stepKinetic, kineticKick, kineticSynced,
  } from '../utils/kineticLayout.js';
  import {
    constellationConfig, constellationPresets, constellationGeometry,
    constellationHitPreset, constellationFromPx, wanderPos,
    constellationSynced, constellationWanderBars, nearestPreset,
  } from '../utils/constellationLayout.js';
  import {
    constraintConfig, constraintMembers, constraintMode, applyConstraint,
    constraintGeometry, barAtPoint, valueFromY as constraintValueFromY,
  } from '../utils/constraintLayout.js';
  import {
    chordPadConfig, chordPadLayout as chordPadLayoutMode, chordPadPads, wheelSlots,
    gridGeometry, gridHit, wheelGeometry, wheelHit, padNotes,
    chordPadVelocity, chordPadChannel, noteOnBytes, noteOffBytes, bytesToHex,
  } from '../utils/chordPadLayout.js';
  import {
    arpConfig, arpRate, arpVelocity, arpChannel, arpBaseNotes, arpSequence,
    stepFires, stepIndexAt, swingDelay, gateSeconds, stepSeconds,
    effectiveSwing as arpEffectiveSwing,
    arpGeometry, arpCellAt, toggleMute, arpPhase,
    arpSynced, arpDivision, syncedPhaseAt,
  } from '../utils/arpLayout.js';
  // The touch-strip Ribbon (a parameter control) already owns the plain
  // ribbonConfig/ribbonGeometry names, so the note ribbon's come in aliased.
  import {
    ribbonConfig as nrConfig, ribbonMode as nrMode, ribbonZones as nrZones,
    ribbonHorizontal as nrHorizontal, ribbonChannel as nrChannel,
    ribbonGeometry as nrGeometry, inRibbon as nrInside,
    positionAlong as nrAlong, positionAcross as nrAcross,
    snapZone as nrSnapZone, glideStep as nrGlideStep,
    bendBytes as nrBendBytes, ccBytes as nrCcBytes,
    touchVelocity as nrVelocity, modValue as nrModValue, modCc as nrModCc,
  } from '../utils/noteRibbonLayout.js';
  import {
    drumConfig, drumRows, drumCols, drumPads, drumChannel, drumMode, drumGateMs, drumVelocity,
    drumGeometry, padHit, padRect, padStrikeY, padStrikeX, strikeVelocity, chokedBy, drumOrigin,
    padRolls, rollIntervalMs, rollDelayMs, rollVelocity,
    strikeAction, flamMs, ghostVelocity,
  } from '../utils/drumPadLayout.js';
  import { createRepeatClock } from '../utils/repeatClock.js';
  import {
    midiNoteState, midiExpressionState, midiRouteEvents, startNoteInputListener, clearNoteInput,
  } from '../stores/noteInput.js';
  import {
    panicConfig, panicMessages, panicGeometry, panicHit,
    EMERGENCY_PANIC, isPanicShortcut, DEFAULT_PANIC_SHORTCUT,
  } from '../utils/panicLayout.js';
  import {
    phraseConfig, phraseSteps, phraseRows, phraseSynced, phraseDivision, phraseRate,
    phraseDirection, phraseStepSeconds, gateSeconds as phraseGateSeconds,
    phraseGeometry, cellAtPoint as phraseCellAt, toggleCell, phrasePattern,
    stepAtIndex as phraseStepAt, EMPTY_SOUNDING as PHRASE_EMPTY,
    playStep as phrasePlayStep, releaseAll as phraseReleaseAll,
    phraseBeatsPerStep, tiesForward, phraseSwingSeconds, ratchetOffsets, noteGateSeconds,
    phraseChainOn, phraseChainLoops, loadPattern,
  } from '../utils/phraseLayout.js';
  import { slotForLap, chainSwitches } from '../utils/songChain.js';
  import {
    recorderConfig, recorderState, recorderTake, recorderChannel, recorderPlaying,
    recorderSynced, recorderBars, recorderLoopSeconds, isRecordingState,
    recordNoteOn, recordNoteOff, closeOpenNotes, takeIsEmpty, nextPassFor,
    eventsInWindow, eventSeconds, playedNote, playedVelocity,
    onLoopBoundary, toggleRecordState, phaseAtTime, countInLaps, loadSlot,
  } from '../utils/noteRecorderLayout.js';
  import { noteOutputEvents, publishNoteOutput, noteOutputFromBytes } from '../stores/noteOutput.js';
  import {
    harmoniserConfig, harmoniserRange, harmoniserKeys, EMPTY_HELD,
    releaseAllHarmony, reconcileHarmony, soundingPitches, heldInputNotes,
    strumDelays, harmoniserChannel,
  } from '../utils/harmoniserLayout.js';
  import {
    setlistConfig, setlistScenes, setlistCount, setlistIndex, setlistWraps,
    setlistGeometry, rowAtPoint, stepIndex, gotoIndex, footswitchEdge, recallPlan,
    footswitchBackEdge, crossfadeMs, blendValues,
  } from '../utils/setlistLayout.js';
  import {
    splitConfig, splitZones, splitRange, splitInputChannel, splitGeometry,
    noteAtPoint as splitNoteAt, hitZoneEdge, dragSplitPoint,
    EMPTY_SOUNDING, pressNote as splitPress, releaseNote as splitRelease,
    releaseAll as splitReleaseAll, reconcileHeld as splitReconcile, soundingNotes,
    routeCc as splitRouteCc, trackCc as splitTrackCc, heldLatchingCcs,
    routeBend as splitRouteBend, routePressure as splitRoutePressure,
    bendBytes, pressureBytes, trackBend, offCentreBends, soundingZoneIds,
    routePolyPressure, polyPressureBytes, applySplitScriptAction,
  } from '../utils/splitZoneLayout.js';
  import {
    transportConfig, transportGeometry as tpGeometry, hitTransportButton,
    transportSource as tpSource, tapTempo, crossedSteps, transportIsFollowing,
    cyclePhaseAt, musicalDelta, loopRegion, countInBars,
  } from '../utils/transportLayout.js';
  import {
    transport, startTransport, stopTransport, toggleTransport,
    setTransportBpm, setTransportSource, setTransportClockOut, transportSwingNow, setTransportSwing,
    transportBeatsNow, isTransportRunning, transportBpmNow,
    setTransportSignature, transportBeatsPerBar, transportJumpSeq,
    setTransportLoop, startTransportWithCountIn, isCountingIn, countInBeatsLeft,
  } from '../stores/transport.js';
  import { noteLevels } from '../utils/midiNoteInput.js';
  import { heldNotes as inputHeldNotes, heldNoteEntries as inputHeldEntries } from '../utils/midiNoteInput.js';
  import { triggerRawMidiAction } from '../bridge/bridge.js';
  import {
    createTimedButtonPreviewController,
    isTimedButtonBehavior,
  } from '../utils/timedButtonPreview.js';
  import {
    createMomentaryButtonPreviewController,
    isPressToTalkBehavior,
    isRepeatingBehavior,
  } from '../utils/momentaryButtonPreview.js';
  import {
    adjustRangeValue,
    adjustRangeHandleValue,
    clampRangeHandleValue,
    formatRangeValue,
    getCurrentRangeValue,
    getRangeActiveHandle,
    getRangeEndValue,
    getRangeMax,
    getRangeMin,
    getRangeStartValue,
    isRangeBehavior,
    isRangeTextInputKey,
    isSliderRangeBehavior,
    isTwoValueRange,
    normalizedRangePointerValue,
    parseRangeInputValue,
    resolveRangeDisplayValue,
    resolveRangeZone,
    resolveMouseDirection,
    snapRangeValue,
  } from '../utils/rangeBehavior.js';
  import {
    createCircularSliderScrub,
    createRangeScrub,
    createRangeTrackScrub,
    createSliderTrackScrub,
    getCircularSliderDragMode,
    isLinearSliderGeometry,
    scrubSample,
  } from '../utils/scrubRuntime.js';
  import {
    getSliderActiveHandle,
    getSliderLegalRangeForHandle,
    getSliderResolvedValues,
    getSliderValueMode,
    isSliderBehavior,
    snapSliderValue,
  } from '../utils/sliderBehavior.js';
  import {
    resolveCircularPoint,
    resolveCircularTrackMetrics,
    resolveLinearPointerPoint,
    resolveSliderNormalizedFromPoint,
    sliderValueToAngle,
  } from '../utils/sliderGeometry.js';
  import {
    getCustomHitZones,
    getCustomValueChannels,
    getCustomBehaviors,
    isCustomMouseDirectionReversed,
    normalizeCustomChannelValue,
    resolveCustomHitZoneAtPoint,
    resolveCustomInteractionPatch,
    seedCustomValues,
    snapCustomChannelValue,
  } from '../utils/customComponentInteraction.js';
  import { dispatchInteraction } from '../scripting/panelRuntime.js';
  import { numberOr } from '../utils/primitives.js';
  import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';

  let {
    panel,
    scale = 1,
    bgLayers = {},
    gridStyle = '',
    surfaceRef = $bindable(null),
  } = $props();

  const DEFAULT_LAYER_ORDER = ['solid', 'gradient', 'image', 'texture'];

  // The panel's own layer order, not one inferred from array position. Inferring it meant
  // deleting an unrelated control could restack the whole panel — see utils/panelLayers.js.
  let panelLayers = $derived(normalizePanelLayers(panel?.layers, panel?.controls ?? []));
  let orderedLayerNames = $derived(layerNames(panelLayers));
  let hiddenLayers = $derived(new Set(panelLayers.filter((l) => l.visible === false).map((l) => l.name)));
  let orderedControls = $derived(
    sortControlsForRender(panel?.controls ?? [], orderedLayerNames)
      .filter((control) => !hiddenLayers.has(normalizeLayerName(control?._children?.Core?.layer)))
  );
  // What to PAINT — same decision the editor surface makes, from the same module, except that here
  // a scenery layer compiles whether or not it is locked: there is nothing to edit in preview, so
  // the lock has no meaning and holding the DOM elements open would buy nothing. `orderedControls`
  // is untouched, because every other thing in this file that reads it is asking about behaviour
  // rather than about paint.
  let previewPlan = $derived(buildSceneryRenderPlan(panel, { preview: true }));
  /**
   * Id -> control, over the WHOLE tree.
   *
   * `orderedControls` is RENDER order and holds top-level controls only, because a nested control
   * is drawn by its container. Using it to answer "which control is this id?" therefore returned
   * null for anything inside a Group — and eleven places asked exactly that. The window pointerup
   * handler was one of them: it looked the pressed control up, got null, and skipped the release,
   * so a nested pad could be pressed and never released. Render order stays as it is; lookups come
   * from here.
   */
  let controlsById = $derived(new Map(flatControls(panel?.controls ?? []).map((c) => [getControlId(c), c])));
  const controlById = (id) => controlsById.get(String(id ?? '')) ?? null;
  let previewRenderIdNamespace = $derived(`panel-preview-${panel?.id ?? 'panel'}`);

  let pointerActiveControlId = $state('');
  let pointerActiveElement = $state(null);
  let draggingRange = $state(false);
  let pointerDownPoint = $state({ x: 0, y: 0 });
  let pointerDownZone = $state('');
  let listboxDrag = null; // { id, startY, startScroll, moved } while drag-scrolling a listbox
  let listboxDoubleTap = false; // this press is the 2nd tap of a double-click on a listbox
  // Transient interaction-event tracking (onDoubleClick timing, onPointerMove throttle).
  let lastPointerDownAt = 0;
  let lastPointerDownId = '';
  let lastPointerMoveDispatchAt = 0;
  let pointerStartValue = $state(0);
  let rangeScrub = null;
  let sliderScrub = null;
  let pointerSliderHandle = $state('');
  let pointerCustomHitZone = $state(null);
  let pointerCustomStartValues = $state({});
  let keyboardFocusControlId = $state('');
  let lastInputMode = $state('pointer');
  let openComboboxControlId = $state('');

  const timedButtonPreview = createTimedButtonPreviewController({
    patchSession: (controlId, patch) => patchControlSession(controlId, patch),
  });

  // The momentary twin: `repeating` and `press_to_talk`, which the Properties panel has offered all
  // along and nothing honoured. Same channel as the timed controller, so both are only session
  // patches and neither needs a private path into bindings or the script runtime.
  const momentaryButtonPreview = createMomentaryButtonPreviewController({
    patchSession: (controlId, patch) => patchControlSession(controlId, patch),
  });

  function bindSurface(node) {
    surfaceRef = node;

    return {
      destroy() {
        if (surfaceRef === node) surfaceRef = null;
      },
    };
  }

  function getControlId(control) {
    return String(control?._children?.Core?.id ?? '');
  }

  /* --- Component events (design doc §45) ---------------------------------------
   *
   * The event catalogue was 24 events and not one of them came from a component. After §44 a
   * script could drive 302 component members and could not be told anything — a step firing, a
   * scene changing, a take finishing were all invisible, and the only way to notice was to poll a
   * read() on a timer.
   *
   * One raiser, so every family reports the same way and the "did it change" bookkeeping lives in
   * one place rather than eleven. dispatchInteraction is the same door the pointer events already
   * use: it resolves the control name, refuses to re-enter while handlers are running, and hands
   * back a promise the caller is free to drop.
   */
  const componentCycleCount = {};   // id -> loops since the panel opened
  const componentLastStage = {};    // id -> last stage reported, so a stage fires once
  const componentLastZone = {};     // id -> last meter zone reported
  const componentLastPreset = {};   // id -> last Constellation preset reported

  function componentTargetName(control) {
    return String(control?._children?.Core?.name ?? '');
  }

  /** Raise one component event. `target` is in the payload as well as on the envelope, because
   *  on("*", "step", …) is a legitimate subscription and the handler has to know which arp. */
  function raiseComponent(control, handler, payload) {
    dispatchInteraction(getControlId(control), handler,
      { target: componentTargetName(control), ...payload });
  }

  /** Raise onCycle when a 0..1 phase has just wrapped. The tickers all advance phase with `% 1`,
   *  so a phase that went DOWN is a wrap — the same test each ticker already makes to decide
   *  whether to re-baseline. */
  function raiseComponentCycle(control, phase, previous) {
    if (!(phase < previous)) return;
    const id = getControlId(control);
    const count = (componentCycleCount[id] ?? 0) + 1;
    componentCycleCount[id] = count;
    raiseComponent(control, 'onCycle', { count });
  }

  /** Raise onStage when a component enters a stage it was not in. Fires once per change, and the
   *  first sighting only BASELINES: reporting "idle" on the frame a panel opens would tell a
   *  script the recorder had just stopped, which is not what opening a panel means. */
  function raiseComponentStage(control, stage) {
    const id = getControlId(control);
    const previous = componentLastStage[id];
    if (previous === stage) return;
    componentLastStage[id] = stage;
    if (previous === undefined) return;
    raiseComponent(control, 'onStage', { stage, previous });
  }

  function inspectPreviewControl(controlId = '') {
    if (!$panelPreviewDebugEnabled) return;
    setPreviewInspectedControlId(controlId);
  }

  function getBehavior(control) {
    return control?._children?.Behavior ?? null;
  }

  // The Mouse section rides alongside Behavior into every scrub built here, so
  // a drag-mode or sensitivity set in the Mouse tab reaches the core.
  function getMouse(control) {
    return control?._children?.Mouse ?? null;
  }

  function sessionFor(control) {
    const controlId = getControlId(control);
    return $panelPreviewSessions?.[controlId] ?? createInteractionPreviewSession(control);
  }

  function resolvedPreviewFor(control) {
    const session = sessionFor(control);
    const previewOverrides = session?.enabled === false ? {} : session;
    const resolved = resolveInteractiveControl(control, previewOverrides);
    return applySetlistValueSource(control, applyHarmoniserValueSource(control, applyRecorderValueSource(control, applyPhraseValueSource(control, applySplitZoneValueSource(control, applyTransportValueSource(control, applyPanicValueSource(control, applyDrumPadsValueSource(control, applyNoteRibbonValueSource(control, applyArpValueSource(control, applyChordPadValueSource(control, applyConstraintValueSource(control, applyConstellationValueSource(control, applyKineticValueSource(control, applyTuringValueSource(control, applyTimbreValueSource(control, applyRouterValueSource(control, applyLooperValueSource(control, applyOrbitValueSource(control, applyMacroValueSource(control, applyRibbonValueSource(control, applyCrossfaderValueSource(control, applyJoystickValueSource(control, applyMatrixValueSource(control, applyEnvelopeValueSource(control, applyMeterValueSource(control, applyPixelValueSource(control, applyLcdValueSource(control, resolved))))))))))))))))))))))))))));
  }

  // The current numeric value + range of a value-producing control (slider,
  // knob, range spinner, number) from its live preview session.
  function lcdSourceValueRange(src) {
    const behavior = getBehavior(src);
    if (!isRangeBehavior(behavior)) return null;
    const value = isSliderControl(src)
      ? currentSliderRoleValue(src, currentSliderActiveHandle(src))
      : currentRangeValue(src);
    return { value, min: getRangeMin(behavior), max: getRangeMax(behavior) };
  }

  function lcdRangeForSource(srcId) {
    const id = String(srcId ?? '');
    if (!id) return null;
    const src = controlById(id);
    if (!src) return null;
    const range = lcdSourceValueRange(src);
    return range && range.value !== undefined ? range : null;
  }

  // Rich live info about a source control for the zones engine: value/range, its
  // name, an On/Off or choice text, and a selector key for page switching.
  function lcdSourceInfo(src) {
    if (!src) return null;
    const behavior = getBehavior(src);
    const session = sessionFor(src);
    const info = {
      present: true,
      name: String(src?._children?.Core?.name ?? ''),
      value: 0, min: 0, max: 127, text: '', on: false, selector: '',
    };
    // 'address' show-kind: the device parameter this control is bound to (if
    // any), so the panel can print e.g. a CC/NRPN address instead of "----".
    const bind = (src?._children?.DeviceBindings?.bindings ?? []).find((b) => b?.parameterId);
    if (bind) info.address = String(bind.parameterId);
    if (isRangeBehavior(behavior)) {
      const range = lcdSourceValueRange(src);
      if (range) { info.value = range.value; info.min = range.min; info.max = range.max; info.selector = String(range.value); }
    }
    const family = String(behavior?.family ?? '').trim().toLowerCase();
    const buttonType = String(behavior?.buttonType ?? '').trim().toLowerCase();
    if (String(src?._children?.Core?.controlType ?? '') === 'Label') {
      // A label's editable text is its Text.content.
      info.text = String(src?._children?.Text?.content ?? '');
    } else if (isComboboxControl(src) || buttonType === 'radio' || buttonType === 'cyclic') {
      // Multi-choice: the selector is the internal value; the text is the option's
      // human label (so the screen shows "Bright", not "option_2").
      const choice = session?.valueOverrideEnabled === true
        ? session.valueOverride
        : (isComboboxControl(src) ? currentComboboxValue(src) : behavior?.defaultValue);
      info.selector = String(choice ?? '');
      const row = getValueRows(src).find((r) => String(rowValue(r)) === String(choice ?? ''));
      info.text = String(row?.displayText ?? choice ?? '');
    } else if (family === 'select' || String(behavior?.valueType ?? '') === 'bool') {
      info.on = session?.checked === true || behavior?.defaultValue === true;
      info.text = info.on ? 'On' : 'Off';
      info.value = info.on ? 1 : 0; info.min = 0; info.max = 1;
      info.selector = info.on ? '1' : '0';
    } else if (family === 'trigger') {
      // Momentary / action buttons have no stored value: read the live pressed
      // (or executed) state so the display shows 1/On while held, 0/Off at rest.
      info.on = session?.pressed === true || session?.executed === true;
      info.text = info.on ? 'On' : 'Off';
      info.value = info.on ? 1 : 0; info.min = 0; info.max = 1;
      info.selector = info.on ? '1' : '0';
    }
    return info;
  }

  // --- On-screen editing (an edit zone writes back to its target) ---
  // Edit targets: '@edit' (the display's own text), a Label (its Text.content) —
  // both free-text with a caret — or a Combobox/Radio/Cyclic, which becomes a
  // choice cycler (no caret; wheel/arrows change the selected option).
  let lcdEdit = $state({ id: '', zoneId: '', sourceId: '', kind: '', caret: 0, original: '', active: false });

  function lcdDisplayOf(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'LcdDisplay'
      ? (control?._children?.Display ?? null) : null;
  }
  // The editable section for either display type (@edit target + edit options
  // live here). name is the section key for updateControlProperty writes.
  function editSectionOf(control) {
    const type = String(control?._children?.Core?.controlType ?? '');
    if (type === 'LcdDisplay') return { type, section: control?._children?.Display ?? null, name: 'Display' };
    if (type === 'PixelDisplay') return { type, section: control?._children?.Pixel ?? null, name: 'Pixel' };
    return { type: '', section: null, name: '' };
  }
  function lcdSourceControl(sourceId) {
    return controlById(sourceId);
  }
  // What kind of edit a zone source supports: 'text' | 'choice' | 'none'.
  function lcdEditKindOf(sourceId) {
    const sid = String(sourceId ?? '');
    if (sid === '@edit') return 'text';
    const src = lcdSourceControl(sid);
    if (!src) return 'none';
    // A Label is only editable from the screen when its Text.editable flag is on.
    if (String(src?._children?.Core?.controlType ?? '') === 'Label') {
      return src?._children?.Text?.editable === true ? 'text' : 'none';
    }
    const bt = String(getBehavior(src)?.buttonType ?? '').trim().toLowerCase();
    if (isComboboxControl(src) || bt === 'radio' || bt === 'cyclic') return 'choice';
    return 'none';
  }
  function lcdEditOpts(section) {
    return { charset: String(section?.editCharset ?? 'upper'), maxLength: Math.max(0, Math.round(numberOr(section?.editMaxLength, 16))) };
  }
  // All editable "edit" zones on the active layout (text/choice targets), in order.
  function lcdEditZones(control) {
    const display = lcdDisplayOf(control);
    if (!display || !Array.isArray(display.layouts) || !display.layouts.length) return [];
    const layout = findLayout(display.layouts, resolveLcdActiveLayoutId(control));
    const out = [];
    for (const z of (layout?.zones ?? [])) {
      if (String(z?.show ?? '') !== 'edit' || z?.visible === false) continue;
      const kind = lcdEditKindOf(z?.sourceId);
      if (kind !== 'none') out.push({ zone: z, sourceId: String(z?.sourceId ?? ''), kind });
    }
    return out;
  }

  // --- PixelDisplay edit targets (pixel-positioned 'edit' elements) ---
  function pixelDisplayOf(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'PixelDisplay'
      ? (control?._children?.Pixel ?? null) : null;
  }
  // The elements the renderer is currently showing: the active layout's, else
  // the flat list (mirrors PixelDisplayRenderer).
  function pixelActiveElements(control) {
    const pixel = pixelDisplayOf(control);
    if (!pixel) return [];
    const layouts = Array.isArray(pixel.layouts) ? pixel.layouts : [];
    if (layouts.length) {
      const layout = findLayout(layouts, resolvePixelActiveLayoutId(control));
      return Array.isArray(layout?.elements) ? layout.elements : [];
    }
    return Array.isArray(pixel.elements) ? pixel.elements : [];
  }
  // Editable 'edit' elements on the active layout, in order.
  function pixelEditElements(control) {
    const out = [];
    for (const el of pixelActiveElements(control)) {
      if (String(el?.kind ?? '') !== 'edit' || el?.visible === false) continue;
      const kind = lcdEditKindOf(el?.sourceId);
      if (kind !== 'none') out.push({ element: el, id: String(el?.id ?? ''), sourceId: String(el?.sourceId ?? ''), kind });
    }
    return out;
  }
  // Text-layout params for a pixel element's rendered string (grid px), so the
  // caret lands between characters exactly as the renderer draws them. The
  // rendered line is prefix + editText + suffix; alignment uses the full
  // rendered width, and the caret is offset past the prefix.
  function pixelTextLayout(control, element, sourceId) {
    const elX = Math.round(numberOr(element?.x, 0));
    const elH = Math.max(3, Math.round(numberOr(element?.h, 8)));
    const boxW = Math.max(0, Math.round(numberOr(element?.w, 0)));
    const s = Math.max(1, Math.floor(elH / (FONT_H + 1)));
    const advance = FONT_ADVANCE * s;
    const prefixLen = String(element?.prefix ?? '').length;
    const suffixLen = String(element?.suffix ?? '').length;
    const len = lcdEditText(control, sourceId).length;
    const renderedLen = prefixLen + len + suffixLen;
    const textW = renderedLen > 0 ? renderedLen * advance - s : 0;
    let startX = elX;
    if (boxW > 0) {
      const align = String(element?.align ?? 'left');
      if (align === 'center') startX = elX + Math.round((boxW - textW) / 2);
      else if (align === 'right') startX = elX + boxW - textW;
    }
    return { startX, advance, len, prefixLen, renderedLen, elY: Math.round(numberOr(element?.y, 0)), rowH: FONT_H * s };
  }
  // Element bounds (grid px) → is a control-local click inside it?
  function pixelElementContainsPoint(control, element, pt) {
    const pixel = pixelDisplayOf(control);
    const transform = control?._children?.Transform ?? {};
    const width = numberOr(transform.width, 0);
    const height = numberOr(transform.height, 0);
    if (!pixel || !pt || width <= 0 || height <= 0) return false;
    const padding = Math.max(0, numberOr(pixel.padding, 8));
    const pixW = Math.max(1, Math.round(numberOr(pixel.pixelsW, 128)));
    const pixH = Math.max(1, Math.round(numberOr(pixel.pixelsH, 64)));
    const sx = Math.max(1e-6, (width - padding * 2) / pixW);
    const sy = Math.max(1e-6, (height - padding * 2) / pixH);
    const gx = (pt.x - padding) / sx;
    const gy = (pt.y - padding) / sy;
    const lay = pixelTextLayout(control, element, String(element?.sourceId ?? ''));
    const w = Math.max(1, Math.round(numberOr(element?.w, Math.max(1, lay.renderedLen) * FONT_ADVANCE)));
    const x0 = Math.round(numberOr(element?.x, 0));
    return gx >= x0 - 1 && gx <= x0 + w + 1 && gy >= lay.elY - 1 && gy <= lay.elY + lay.rowH + 1;
  }
  // Caret index from a click on a pixel edit element.
  function pixelCaretFromPoint(control, element, pt) {
    const pixel = pixelDisplayOf(control);
    const transform = control?._children?.Transform ?? {};
    const width = numberOr(transform.width, 0);
    const padding = Math.max(0, numberOr(pixel?.padding, 8));
    const pixW = Math.max(1, Math.round(numberOr(pixel?.pixelsW, 128)));
    const sx = Math.max(1e-6, (width - padding * 2) / pixW);
    const lay = pixelTextLayout(control, element, String(element?.sourceId ?? ''));
    const gx = (pt.x - padding) / sx;
    // Clicked rendered-column → subtract the prefix to get a caret into editText.
    const caret = Math.round((gx - lay.startX) / Math.max(1, lay.advance)) - lay.prefixLen;
    return Math.max(0, Math.min(lay.len, caret));
  }

  // Unified edit targets for whichever display type this control is.
  function screenEditTargets(control) {
    const type = String(control?._children?.Core?.controlType ?? '');
    if (type === 'LcdDisplay') return lcdEditZones(control).map((t) => ({ ...t, id: String(t.zone?.id ?? '') }));
    if (type === 'PixelDisplay') return pixelEditElements(control);
    return [];
  }

  // Map a click point (control-local px) to a character cell {row, col},
  // mirroring the renderer's geometry (padding, cols/rows, char/line gaps).
  function lcdCellFromPoint(control, pt) {
    const display = lcdDisplayOf(control);
    const transform = control?._children?.Transform ?? {};
    const width = numberOr(transform.width, 0);
    const height = numberOr(transform.height, 0);
    if (!display || !pt || width <= 0 || height <= 0) return null;
    const padding = Math.max(0, numberOr(display.padding, 10));
    const cols = Math.max(1, Math.round(numberOr(display.cols, 16)));
    const rows = Math.max(1, Math.round(numberOr(display.rows, 2)));
    const charSpacing = Math.max(0, numberOr(display.charSpacing, 1));
    const lineSpacing = Math.max(0, numberOr(display.lineSpacing, 3));
    const cellW = Math.max(1, (Math.max(1, width - padding * 2) - (cols - 1) * charSpacing) / cols);
    const cellH = Math.max(1, (Math.max(1, height - padding * 2) - (rows - 1) * lineSpacing) / rows);
    return {
      col: Math.floor((pt.x - padding) / (cellW + charSpacing)),
      row: Math.floor((pt.y - padding) / (cellH + lineSpacing)),
    };
  }

  function lcdZoneContainsCell(zone, cell, cols) {
    if (!cell) return false;
    const zoneRow = Math.round(numberOr(zone?.row, 1)) - 1;
    const c0 = Math.round(numberOr(zone?.colStart, 1)) - 1;
    const c1 = Math.round(numberOr(zone?.colEnd, cols)) - 1;
    return cell.row === zoneRow && cell.col >= c0 && cell.col <= c1;
  }

  // Caret index for a click cell inside a zone; outside -> end of text. Mirrors
  // fitToRegion's alignment padding + the prefix so the caret lands on the same
  // character the renderer drew under the click.
  function lcdCaretFromCell(zone, cell, cols, textLen) {
    if (!cell) return textLen;
    const c0 = Math.round(numberOr(zone?.colStart, 1)) - 1;
    const c1 = Math.max(c0, Math.round(numberOr(zone?.colEnd, cols)) - 1);
    if (!lcdZoneContainsCell(zone, cell, cols)) return textLen;
    const width = c1 - c0 + 1;
    const prefixLen = String(zone?.prefix ?? '').length;
    const suffixLen = String(zone?.suffix ?? '').length;
    const startOff = regionStartOffset(width, prefixLen + textLen + suffixLen, zone?.align);
    return Math.max(0, Math.min(textLen, cell.col - c0 - startOff - prefixLen));
  }

  // Arm an edit target: text kinds remember the original for Esc-cancel.
  function lcdArmEdit(control, target, caret) {
    lcdEdit = {
      id: getControlId(control),
      zoneId: String(target.id ?? target.zone?.id ?? ''),
      sourceId: target.sourceId,
      kind: target.kind,
      caret,
      original: target.kind === 'text' ? lcdEditText(control, target.sourceId) : '',
      active: true,
    };
  }
  const LCD_EDIT_IDLE = { id: '', zoneId: '', sourceId: '', kind: '', caret: 0, original: '', active: false };

  // Text edit target read/write: '@edit' -> the display's own editText
  // (Display.editText or Pixel.editText), else a Label's content.
  function lcdEditText(control, sourceId) {
    if (String(sourceId) === '@edit') return String(editSectionOf(control).section?.editText ?? '');
    return String(lcdSourceControl(sourceId)?._children?.Text?.content ?? '');
  }
  function lcdWriteEditText(control, sourceId, text) {
    if (String(sourceId) === '@edit') {
      const id = getControlId(control);
      const { name } = editSectionOf(control);
      if (id && name) updateControlProperty(id, `${name}.editText`, text);
      return;
    }
    const sid = getControlId(lcdSourceControl(sourceId));
    if (sid) updateControlProperty(sid, 'Text.content', text);
  }
  // Apply a text op to the active target, persist it, and move the caret.
  function lcdApplyEdit(control, opName, arg) {
    const { section } = editSectionOf(control);
    const id = getControlId(control);
    if (!section || !id || !lcdEdit.active) return;
    const opts = lcdEditOpts(section);
    const cur = lcdEditText(control, lcdEdit.sourceId);
    // Leave the EXISTING text untouched (no charset normalisation — that would
    // eat e.g. lowercase letters under the 'upper' set); the charset/maxLength
    // constrain only new input via insert/cycle.
    const buf = textEdit.clampCaret({ text: cur, caret: lcdEdit.caret });
    let next;
    switch (opName) {
      case 'insert': {
        // 'upper' has no lowercase, so auto-uppercase typed letters.
        const ch = opts.charset === 'upper' && typeof arg === 'string' ? arg.toUpperCase() : arg;
        next = textEdit.insert(buf, ch, opts);
        break;
      }
      case 'backspace': next = textEdit.backspace(buf); break;
      case 'delete': next = textEdit.deleteForward(buf); break;
      case 'left': next = textEdit.moveCaret(buf, -1); break;
      case 'right': next = textEdit.moveCaret(buf, 1); break;
      case 'home': next = textEdit.caretHome(buf); break;
      case 'end': next = textEdit.caretEnd(buf); break;
      case 'cycle': next = textEdit.cycleChar(buf, arg, opts); break;
      default: return;
    }
    if (next.text !== cur) lcdWriteEditText(control, lcdEdit.sourceId, next.text);
    lcdEdit = { ...lcdEdit, id, caret: next.caret, active: true };
  }

  // Choice cycler: move the bound combobox/radio/cyclic to the prev/next option.
  function lcdCurrentChoice(src) {
    const session = sessionFor(src);
    if (session?.valueOverrideEnabled === true) return session.valueOverride;
    if (isComboboxControl(src)) return currentComboboxValue(src);
    return getBehavior(src)?.defaultValue ?? getValueRows(src)[0]?.internalValue ?? getValueRows(src)[0]?.id ?? '';
  }
  function lcdCycleChoice(control, sourceId, delta) {
    const src = lcdSourceControl(sourceId);
    if (!src) return;
    const rows = getValueRows(src).filter((r) => r?.enabled !== false);
    if (!rows.length) return;
    const cur = String(lcdCurrentChoice(src));
    let idx = rows.findIndex((r) => String(rowValue(r)) === cur);
    if (idx < 0) idx = 0;
    const nextIdx = ((idx + Math.sign(delta || 1)) % rows.length + rows.length) % rows.length;
    selectComboboxRow(src, rows[nextIdx]);
    lcdEdit = { ...lcdEdit, id: getControlId(control), sourceId, kind: 'choice', active: true };
  }

  // The layout active in the editor preview (design layout as the resting default,
  // overridden by a live selector value or an overlay). Shared with the renderer feed.
  function resolveLcdActiveLayoutId(control) {
    const display = lcdDisplayOf(control);
    if (!display || !Array.isArray(display.layouts) || !display.layouts.length) return '';
    const pages = display.pages ?? {};
    const selSrc = pages.selectorSourceId ? lcdSourceControl(pages.selectorSourceId) : null;
    const selInfo = selSrc ? lcdSourceInfo(selSrc) : null;
    const selectorValue = selInfo ? selInfo.selector : undefined;
    const activeOverlayLayoutId = resolveActiveOverlayLayout(display);
    // The inspector's transient design-layout selection (in-memory store, never
    // persisted) acts as the resting default while previewing from the editor.
    const designId = String(get(lcdDesignLayoutIds)[getControlId(control)] ?? '');
    const hasDesign = designId && display.layouts.some((l) => String(l?.id ?? '') === designId);
    const effPages = hasDesign ? { ...pages, defaultLayoutId: designId } : pages;
    return resolveActiveLayoutId(effPages, display.layouts, { selectorValue, activeOverlayLayoutId });
  }

  // The control most recently clicked / dragged / changed — resolves the
  // reserved "@active" zone source so a zone can follow whatever is touched.
  let lcdActiveId = $state('');
  // Per-control last-activity time (press or change), for scoped @active. Plain
  // object: reads happen at render, driven reactive by lcdActiveId changing.
  const lcdActiveAt = {};

  // Resolve "@active" for a display: the most recently active control, optionally
  // restricted to a scope (list of Core.ids). Empty scope = any control.
  function lcdActiveForScope(scope) {
    const list = (Array.isArray(scope) ? scope : []).map(String).filter(Boolean);
    if (!list.length) return lcdActiveId;
    let best = ''; let bestAt = -1;
    for (const id of list) {
      const at = lcdActiveAt[id];
      if (at !== undefined && at > bestAt) { bestAt = at; best = id; }
    }
    return best;
  }

  // Coarse "kind" of a control, for "@active#kind" zone filtering. Sliders/knobs/
  // numbers are 'value'; momentary/toggle/select buttons are 'switch'; multi-
  // choice pickers are 'choice'.
  function lcdControlKind(src) {
    const behavior = getBehavior(src);
    const family = String(behavior?.family ?? '').trim().toLowerCase();
    const buttonType = String(behavior?.buttonType ?? '').trim().toLowerCase();
    if (isComboboxControl(src) || buttonType === 'radio' || buttonType === 'cyclic') return 'choice';
    if (family === 'trigger' || family === 'select' || String(behavior?.valueType ?? '') === 'bool') return 'switch';
    if (family === 'range') return 'value';
    return 'other';
  }

  // Resolve an "@active" (optionally "@active#kind") source to a concrete control
  // id. Without a filter it's just the scoped active control; with a filter it
  // resolves only when the currently-active control is of that kind, so a
  // filtered zone stays empty while an off-kind control is being touched.
  function lcdResolveActive(id, display) {
    const base = lcdActiveForScope(display?.activeScope);
    if (!base) return '';
    const filter = activeFilterOf(id);
    if (!filter) return base;
    const ctrl = controlById(base);
    return ctrl && lcdControlKind(ctrl) === filter ? base : '';
  }

  // Change-time tracking for overlay pages: stamp when a control's value changes.
  let lcdChangeAt = $state({});
  // A reactive clock bumped by timers so timed overlays auto-dismiss while idle.
  let overlayClock = $state(0);
  const lcdPrevValue = {};
  let overlayTimers = [];

  // Schedule a re-render at each distinct timer-overlay duration so an overlay
  // drops when its window elapses even if the user stops interacting.
  function scheduleOverlayTicks() {
    overlayTimers.forEach((t) => clearTimeout(t));
    overlayTimers = [];
    const durations = new Set();
    for (const control of orderedControls) {
      const type = String(control?._children?.Core?.controlType ?? '');
      const section = type === 'LcdDisplay' ? control?._children?.Display
        : type === 'PixelDisplay' ? control?._children?.Pixel : null;
      if (!section) continue;
      for (const ov of (section?.pages?.overlays ?? [])) {
        if (String(ov?.dismiss ?? 'timer').trim().toLowerCase() === 'timer') {
          durations.add(Math.max(30, numberOr(ov?.duration, 800)));
        }
      }
    }
    for (const d of durations) {
      overlayTimers.push(setTimeout(() => { overlayClock = Date.now(); }, d + 20));
    }
  }

  $effect(() => {
    void $panelPreviewSessions; // re-run when any preview value changes
    const now = Date.now();
    let changed = false;
    // untrack the self-read so writing lcdChangeAt below doesn't re-trigger us.
    const next = untrack(() => ({ ...lcdChangeAt }));
    let lastChangedId = '';
    for (const control of orderedControls) {
      const id = getControlId(control);
      if (!id) continue;
      const info = lcdSourceInfo(control);
      const sig = info ? `${info.value}|${info.selector}|${info.on}` : '';
      if (lcdPrevValue[id] !== undefined && lcdPrevValue[id] !== sig) { next[id] = now; changed = true; lastChangedId = id; }
      lcdPrevValue[id] = sig;
    }
    if (changed) {
      lcdChangeAt = next;
      if (lastChangedId) { lcdActiveAt[lastChangedId] = now; lcdActiveId = lastChangedId; }
      scheduleOverlayTicks();
    }
  });

  onDestroy(() => overlayTimers.forEach((t) => clearTimeout(t)));
  // Leaving preview drops the echoed notes. A keyboard unplugged mid-note never
  // sends its note-off, and a pad stuck lit forever looks like a bug.
  // Leaving preview silences the rig. A note the panel was holding has no other
  // way to stop once this surface is gone — nothing is left to send its
  // note-off. Only when something actually sounded, so closing an untouched
  // panel is quiet.
  onDestroy(() => {
    if (sentAnyNote) firePanicEmergency({ flashButtons: false });
    else if (noteInputStarted) clearNoteInput();
  });

  // Which overlay layout is currently active (timer window, or latched until a
  // different control changes). Best-effort timing; verify in-browser.
  function resolveActiveOverlayLayout(display) {
    const overlays = display?.pages?.overlays ?? [];
    if (!overlays.length) return '';
    void overlayClock; // re-evaluate when the overlay timers fire
    const now = Date.now();
    const times = Object.values(lcdChangeAt);
    const globalMax = times.length ? Math.max(...times) : -1;
    let best = ''; let bestAt = -1;
    for (const ov of overlays) {
      const at = lcdChangeAt[String(ov?.sourceId ?? '')];
      if (at === undefined) continue;
      const dismiss = String(ov?.dismiss ?? 'timer').trim().toLowerCase();
      const active = dismiss === 'untilchange' ? at === globalMax : (now - at) < numberOr(ov?.duration, 800);
      if (active && at > bestAt) { bestAt = at; best = String(ov?.layoutId ?? ''); }
    }
    return best;
  }

  // Drive an LcdDisplay from live control values: the primary/extra value fields,
  // and (for zone layouts) a __live info map + the resolved active page.
  function applyLcdValueSource(control, resolved) {
    if (String(control?._children?.Core?.controlType ?? '') !== 'LcdDisplay') return resolved;
    const display = control?._children?.Display;
    if (!display) return resolved;

    const hasLayouts = Array.isArray(display.layouts) && display.layouts.length > 0;
    const primary = lcdRangeForSource(display.valueSourceId);
    const fields = Array.isArray(display.fields) ? display.fields : [];
    const fieldRanges = fields.map((f) => lcdRangeForSource(f?.sourceId));

    const live = {};
    if (hasLayouts) {
      for (const id of collectSourceIds(display)) {
        // "@active"/"@active#kind" resolve to the most recently touched control
        // (restricted to this display's activeScope, and to the kind filter);
        // a fixed id resolves to that control. Keyed by the raw id so each
        // filtered "@active#kind" zone reads its own live value.
        const resolvedId = isActiveSource(id) ? lcdResolveActive(id, display) : id;
        const src = resolvedId ? controlById(resolvedId) : null;
        const info = src ? lcdSourceInfo(src) : null;
        if (info) live[id] = info;
      }
    }

    // Optional live drives for the panel lighting: a range control for
    // brightness (mapped 0-100 across its range), a switch for the backlight.
    const brightRange = display.brightnessSourceId ? lcdRangeForSource(display.brightnessSourceId) : null;
    const backCtrl = display.backlightSourceId
      ? controlById(display.backlightSourceId) : null;
    const backInfo = backCtrl ? lcdSourceInfo(backCtrl) : null;

    // A device parameter bound directly onto this display (text/brightness/
    // backlight port) lands in the preview session as an override.
    const ownSession = sessionFor(control) ?? {};
    const hasOwnOverride = ownSession.textOverride !== undefined
      || ownSession.brightnessOverride !== undefined
      || ownSession.backlightOverride !== undefined;

    if (!hasLayouts && !primary && !fieldRanges.some(Boolean) && !brightRange && !backInfo && !hasOwnOverride) return resolved;

    // Shallow clone that shares heavy read-only fields (imageSrc, layouts, pages)
    // by reference; only the Display + the field entries we mutate are copied.
    const base = resolved?.control ?? control;
    const baseDisplay = base?._children?.Display ?? {};
    const cd = { ...baseDisplay };
    if (Array.isArray(baseDisplay.fields)) cd.fields = baseDisplay.fields.map((f) => ({ ...f }));
    const clone = { ...base, _children: { ...base._children, Display: cd } };
    if (cd) {
      if (brightRange) {
        const span = brightRange.max - brightRange.min;
        const frac = span === 0 ? 0 : Math.max(0, Math.min(1, (brightRange.value - brightRange.min) / span));
        cd.brightness = Math.round(frac * 100);
      }
      if (backInfo) cd.backlightOn = backInfo.on === true || numberOr(backInfo.value, 0) >= 0.5;
      if (primary) { cd.value = primary.value; cd.valueMin = primary.min; cd.valueMax = primary.max; }
      // Direct device bindings win over source-control drives (more specific).
      if (ownSession.brightnessOverride !== undefined) cd.brightness = ownSession.brightnessOverride;
      if (ownSession.backlightOverride !== undefined) cd.backlightOn = ownSession.backlightOverride === true;
      if (ownSession.textOverride !== undefined) cd.editText = String(ownSession.textOverride);
      if (Array.isArray(cd.fields)) {
        fieldRanges.forEach((range, i) => {
          if (range && cd.fields[i]) { cd.fields[i].value = range.value; cd.fields[i].min = range.min; cd.fields[i].max = range.max; }
        });
      }
      if (hasLayouts) {
        cd.__live = live;
        // Active layout: design layout as the resting default, overridden by a
        // live selector value or an overlay (shared resolver).
        cd.__page = { activeLayoutId: resolveLcdActiveLayoutId(control) };
        // Live edit marker: text edits carry the caret; a choice edit highlights
        // the armed zone (the renderer parks the block on its first cell).
        const controlId = getControlId(control);
        cd.__edit = (lcdEdit.active && lcdEdit.id === controlId)
          ? { active: true, caret: lcdEdit.caret, zoneId: lcdEdit.zoneId, kind: lcdEdit.kind } : null;
      }
    }
    return { ...resolved, control: clone };
  }

  // --- Meter: value-driven level meter -----------------------------------
  // Peak-hold state per control id + a lazy rAF ticker so the peak marker keeps
  // decaying between value changes (only runs while a peak-hold meter exists).
  let meterClock = $state(0);
  const meterPeakState = {};
  let meterTickerRunning = false;
  function ensureMeterTicker() {
    if (meterTickerRunning) return;
    meterTickerRunning = true;
    const loop = () => {
      const anyPeak = (orderedControls ?? []).some((c) =>
        String(c?._children?.Core?.controlType ?? '') === 'Meter' && c?._children?.Meter?.peakHold === true);
      if (!anyPeak) { meterTickerRunning = false; return; } // self-stop when none remain
      meterClock = Date.now();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // Inject the meter's live value + peak-hold onto the resolved Meter section:
  // the value comes from a linked range control (valueSourceId) or the static
  // config; the peak decays via the ticker. The renderer reads Meter.__value /
  // Meter.__peak.
  function applyMeterValueSource(control, resolved) {
    if (String(control?._children?.Core?.controlType ?? '') !== 'Meter') return resolved;
    const base = resolved?.control ?? control;
    const meter = base?._children?.Meter;
    if (!meter) return resolved;

    const range = meter.valueSourceId ? lcdRangeForSource(meter.valueSourceId) : null;
    const value = range && range.value !== undefined ? range.value : numberOr(meter.value, 0);
    const nextMeter = { ...meter, __value: value };
    if (range) { nextMeter.valueMin = range.min; nextMeter.valueMax = range.max; }

    // Crossing into a different threshold band, which is what an overload LED is lit from. The
    // zones are the meter's OWN, via meterZoneIndexAt, so the band a script hears about is the
    // band the meter draws. The first sighting baselines: a panel opening at 0 has not "crossed"
    // into the bottom zone.
    {
      const id = getControlId(control);
      const zone = meterZoneIndexAt(meterPosition(value, nextMeter), nextMeter);
      const previous = componentLastZone[id];
      componentLastZone[id] = zone;
      if (previous !== undefined && previous !== zone) {
        raiseComponent(control, 'onZone', { zone: zone + 1, previous: previous + 1, value });
      }
    }

    if (meter.peakHold === true) {
      ensureMeterTicker();
      void meterClock; // re-evaluate as the peak decays
      const pos = meterPosition(value, nextMeter);
      const id = getControlId(control);
      const now = Date.now();
      const prev = meterPeakState[id] ?? { peak: pos, peakAt: now };
      const next = meterPeak({
        prevPeak: prev.peak, prevPeakAt: prev.peakAt, pos, now,
        holdMs: numberOr(meter.peakHoldMs, 1200), decayPerSec: numberOr(meter.peakDecayPerSec, 0.4),
      });
      meterPeakState[id] = next;
      nextMeter.__peak = next.peak;
    }
    return { ...resolved, control: { ...base, _children: { ...base._children, Meter: nextMeter } } };
  }

  // --- Envelope: draggable breakpoint / curve editor ----------------------
  const ENV_PAD = 10;
  let envDrag = null; // { id, index } while dragging a node
  function isEnvelopeControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Envelope';
  }
  function envGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    return envelopeGeometry(numberOr(t.width, 0), numberOr(t.height, 0), ENV_PAD);
  }
  // The working points: the live session copy while dragging, else the model.
  function envWorkingPoints(control) {
    const sess = sessionFor(control)?.envPoints;
    return Array.isArray(sess) ? sess : envelopePoints(control);
  }
  // Envelope presets keep the start (and one-shot end) pinned to y=0; free/MSEG
  // shapes let every node move in y. Ends always keep their x (span the axis).
  function envLockY(control, points) {
    const preset = String(envelopeConfig(control).preset ?? 'adsr');
    if (preset === 'free' || preset === 'mseg') return [];
    return [0, points.length - 1];
  }
  function envSnap(control, pt) {
    const cfg = envelopeConfig(control);
    const sx = numberOr(cfg.snapX, 0);
    const sy = numberOr(cfg.snapY, 0);
    return {
      x: sx > 0 ? Math.round(pt.x / sx) * sx : pt.x,
      y: sy > 0 ? Math.round(pt.y / sy) * sy : pt.y,
    };
  }
  function commitEnvPoints(control, points) {
    updateControlProperty(getControlId(control), 'Envelope.points', points);
  }
  // A control-like with its Envelope points swapped, for resolving fan-out
  // values from the in-progress (session) shape before it's committed.
  function envControlWith(control, points) {
    return { ...control, _children: { ...control._children, Envelope: { ...control._children?.Envelope, points } } };
  }
  // Fan-out: send EVERY bound port's resolved value to its device parameter.
  // One multi-port control (Envelope) → many device parameters at once.
  function emitControlPortFanout(control, phase = 'commit') {
    const values = controlPortValues(control);
    if (!values) return;
    const controlId = getControlId(control);
    for (const binding of activeDeviceBindings(control)) {
      const v = values[String(binding?.port ?? '')];
      if (v === undefined) continue;
      commitDeviceParameter({
        requestId: `panel_preview_${controlId || 'control'}_${phase}_${Date.now()}`,
        deviceRole: binding.deviceRole || 'mainSynth',
        parameterId: binding.parameterId,
        value: v,
        interactionPhase: phase,
        dryRun: binding.dryRun !== false,
      });
    }
  }
  // Inject the live working points + resolved phase onto the resolved Envelope
  // so the renderer draws the in-progress drag and the playhead.
  function applyEnvelopeValueSource(control, resolved) {
    if (!isEnvelopeControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const env = base?._children?.Envelope;
    if (!env) return resolved;
    const sessPoints = sessionFor(control)?.envPoints;
    const phaseRange = env.phaseSourceId ? lcdRangeForSource(env.phaseSourceId) : null;
    const phase = phaseRange
      ? (phaseRange.max === phaseRange.min ? 0 : (phaseRange.value - phaseRange.min) / (phaseRange.max - phaseRange.min))
      : undefined;
    if (!Array.isArray(sessPoints) && phase === undefined) return resolved;
    const nextEnv = { ...env };
    if (Array.isArray(sessPoints)) nextEnv.points = sessPoints;
    if (phase !== undefined) {
      nextEnv.__phase = Math.max(0, Math.min(1, phase));
      // Where the playhead is, in the envelope's own terms: before the sustain point, past it, or
      // at the end. Polled, because the phase is driven by whatever value source is bound to it and
      // there is no envelope ticker to hang a transition off — so raiseComponentStage baselines the
      // first sighting rather than announcing a stage the panel simply opened in.
      const pts = normalizePoints(nextEnv.points);
      const sustainAt = Math.round(numberOr(nextEnv.sustainIndex, -1));
      const sustainX = sustainAt >= 0 && pts[sustainAt] ? pts[sustainAt].x : null;
      const at = nextEnv.__phase;
      const stage = at >= 1 ? 'end'
        : (sustainX !== null && at >= sustainX ? 'release' : (at <= 0 ? 'start' : 'attack'));
      raiseComponentStage(control, stage);
    }
    return { ...resolved, control: { ...base, _children: { ...base._children, Envelope: nextEnv } } };
  }
  // Pointer-down on an envelope: start dragging the node under the cursor.
  // Returns true when it grabbed a node (so the generic handler leaves it alone).
  function handleEnvelopePointerDown(control, localPoint, isDoubleTap) {
    if (!isEnvelopeControl(control) || envelopeConfig(control).editable === false) return false;
    const geom = envGeomFor(control);
    const points = envWorkingPoints(control);
    const hit = envHitNode(points, geom, localPoint.x, localPoint.y, Math.max(8, numberOr(envelopeConfig(control).nodeRadius, 4) + 6));
    if (isDoubleTap) {
      // Double-click: remove an interior node, or add one where there's none.
      if (hit > 0 && hit < points.length - 1) {
        const removed = envRemoveNode(points, hit);
        commitEnvPoints(control, removed);
        emitControlPortFanout(envControlWith(control, removed), 'commit');
      } else if (hit < 0 && envelopeConfig(control).addOnDoubleClick !== false) {
        const norm = envSnap(control, envFromPx(localPoint.x, localPoint.y, geom));
        const { points: added, index } = envAddNode(points, norm.x, norm.y);
        commitEnvPoints(control, added);
        emitControlPortFanout(envControlWith(control, added), 'commit');
        patchControlSession(getControlId(control), { envActiveIndex: index });
      }
      envDrag = null;
      return true;
    }
    if (hit < 0) return false;
    envDrag = { id: getControlId(control), index: hit };
    patchControlSession(getControlId(control), { envActiveIndex: hit, envPoints: points });
    return true;
  }

  // --- Mod Matrix: modulation routing grid --------------------------------
  let matrixDrag = null; // { id, r, c, startAmount, startY } while dragging a cell
  function isMatrixControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Matrix';
  }
  function matrixGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    return matrixGeometry(numberOr(t.width, 0), numberOr(t.height, 0), control);
  }
  function matrixWorkingAmounts(control) {
    const sess = sessionFor(control)?.matrixAmounts;
    return Array.isArray(sess) ? sess : matrixAmounts(control);
  }
  function commitMatrixAmounts(control, amounts) {
    updateControlProperty(getControlId(control), 'Matrix.amounts', amounts);
  }
  function matrixControlWith(control, amounts) {
    return { ...control, _children: { ...control._children, Matrix: { ...control._children?.Matrix, amounts } } };
  }
  function applyMatrixValueSource(control, resolved) {
    if (!isMatrixControl(control)) return resolved;
    const sess = sessionFor(control)?.matrixAmounts;
    if (!Array.isArray(sess)) return resolved;
    const base = resolved?.control ?? control;
    const m = base?._children?.Matrix;
    if (!m) return resolved;
    return { ...resolved, control: { ...base, _children: { ...base._children, Matrix: { ...m, __amounts: sess } } } };
  }
  // Pointer-down on a matrix: grab the cell under the cursor for a knob drag.
  function handleMatrixPointerDown(control, localPoint) {
    if (!isMatrixControl(control) || matrixConfig(control).editable === false) return false;
    const cell = matrixCellAtPoint(matrixGeomFor(control), localPoint.x, localPoint.y);
    if (!cell) return false;
    matrixDrag = { id: getControlId(control), r: cell.r, c: cell.c, startAmount: matrixAmountAt(control, cell.r, cell.c), startY: localPoint.y };
    patchControlSession(getControlId(control), { matrixActiveCell: cell, matrixAmounts: matrixWorkingAmounts(control) });
    return true;
  }

  // --- Vector Joystick: XY pad with a draggable puck ----------------------
  const JOY_PAD = 10;
  let joyDrag = null; // { id } while dragging the puck
  function isJoystickControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'VectorJoystick';
  }
  function joyGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    return joystickGeometry(numberOr(t.width, 0), numberOr(t.height, 0), JOY_PAD);
  }
  function joyWorkingPos(control) {
    const sess = sessionFor(control)?.joyPos;
    return (sess && typeof sess === 'object') ? sess : joystickPos(control);
  }
  function commitJoyPos(control, pos) {
    updateControlProperty(getControlId(control), 'Joystick.x', pos.x);
    updateControlProperty(getControlId(control), 'Joystick.y', pos.y);
  }
  function joyControlWith(control, pos) {
    return { ...control, _children: { ...control._children, Joystick: { ...control._children?.Joystick, x: pos.x, y: pos.y } } };
  }
  function joyTrailNext(control, pos) {
    if (joystickConfig(control).showTrail !== true) return undefined;
    const cap = Math.max(2, Math.round(numberOr(joystickConfig(control).trailLength, 24)));
    const cur = sessionFor(control)?.joyTrail;
    const arr = Array.isArray(cur) ? cur.slice(-(cap - 1)) : [];
    arr.push(pos);
    return arr;
  }
  function applyJoystickValueSource(control, resolved) {
    if (!isJoystickControl(control)) return resolved;
    const session = sessionFor(control);
    const sess = session?.joyPos;
    const trail = session?.joyTrail;
    if (!(sess && typeof sess === 'object') && !Array.isArray(trail)) return resolved;
    const base = resolved?.control ?? control;
    const j = base?._children?.Joystick;
    if (!j) return resolved;
    const next = { ...j };
    if (sess && typeof sess === 'object') { next.__x = sess.x; next.__y = sess.y; }
    if (Array.isArray(trail)) next.__trail = trail;
    return { ...resolved, control: { ...base, _children: { ...base._children, Joystick: next } } };
  }
  // Pointer-down on a joystick: jump the puck to the click point + start dragging.
  function handleJoystickPointerDown(control, localPoint) {
    if (!isJoystickControl(control) || joystickConfig(control).editable === false) return false;
    const pos = joyFromPx(localPoint.x, localPoint.y, joyGeomFor(control));
    joyDrag = { id: getControlId(control) };
    patchControlSession(getControlId(control), { joyPos: pos, joyTrail: joyTrailNext(control, pos) });
    emitControlPortFanout(joyControlWith(control, pos), 'continuous');
    return true;
  }
  // Spring-return glide back to centre on release (rAF loop, emits fan-out).
  function startJoystickReturn(control) {
    const cfg = joystickConfig(control);
    if (cfg.returnToCenter !== true) return false;
    const id = getControlId(control);
    const axes = String(cfg.returnAxes ?? 'both');
    const rate = numberOr(cfg.returnRate, 4);
    let lastT = Date.now();
    const loop = () => {
      if (joyDrag && joyDrag.id === id) return; // a new grab cancels the return
      const now = Date.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const { pos, settled } = joystickGlide(joyWorkingPos(control), { x: 0.5, y: 0.5 }, rate, dt, axes);
      patchControlSession(id, { joyPos: pos, joyTrail: joyTrailNext(control, pos) });
      emitControlPortFanout(joyControlWith(control, pos), settled ? 'commit' : 'continuous');
      if (settled) {
        commitJoyPos(control, pos);
        patchControlSession(id, { joyPos: undefined });
        raiseComponent(control, 'onSettled', { value: pos.x, x: pos.x, y: pos.y });
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return true;
  }

  // --- Crossfader: 1-D A/B blend fader ------------------------------------
  const XF_PAD = 10;
  let xfadeDrag = null; // { id } while dragging the handle
  function isCrossfaderControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Crossfader';
  }
  function xfadeGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    return crossfaderGeometry(numberOr(t.width, 0), numberOr(t.height, 0), control, XF_PAD);
  }
  function xfadeWorkingMix(control) {
    const sess = sessionFor(control)?.xfadeMix;
    return typeof sess === 'number' ? sess : crossfaderMix(control);
  }
  function commitXfadeMix(control, mix) {
    updateControlProperty(getControlId(control), 'Crossfader.mix', mix);
  }
  function xfadeControlWith(control, mix) {
    return { ...control, _children: { ...control._children, Crossfader: { ...control._children?.Crossfader, mix } } };
  }
  function applyCrossfaderValueSource(control, resolved) {
    if (!isCrossfaderControl(control)) return resolved;
    const sess = sessionFor(control)?.xfadeMix;
    if (typeof sess !== 'number') return resolved;
    const base = resolved?.control ?? control;
    const x = base?._children?.Crossfader;
    if (!x) return resolved;
    return { ...resolved, control: { ...base, _children: { ...base._children, Crossfader: { ...x, __mix: sess } } } };
  }
  function handleCrossfaderPointerDown(control, localPoint) {
    if (!isCrossfaderControl(control) || crossfaderConfig(control).editable === false) return false;
    const raw = crossfaderMixFromPx(localPoint.x, localPoint.y, xfadeGeomFor(control));
    const mix = crossfaderDetent(raw, crossfaderConfig(control).detent);
    xfadeDrag = { id: getControlId(control) };
    patchControlSession(getControlId(control), { xfadeMix: mix });
    emitControlPortFanout(xfadeControlWith(control, mix), 'continuous');
    return true;
  }
  function startCrossfaderReturn(control) {
    const cfg = crossfaderConfig(control);
    if (cfg.returnToCenter !== true) return false;
    const id = getControlId(control);
    const rate = numberOr(cfg.returnRate, 4);
    let lastT = Date.now();
    const loop = () => {
      if (xfadeDrag && xfadeDrag.id === id) return; // a new grab cancels the return
      const now = Date.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const { mix, settled } = crossfaderGlide(xfadeWorkingMix(control), 0.5, rate, dt);
      patchControlSession(id, { xfadeMix: mix });
      emitControlPortFanout(xfadeControlWith(control, mix), settled ? 'commit' : 'continuous');
      if (settled) {
        commitXfadeMix(control, mix);
        patchControlSession(id, { xfadeMix: undefined });
        raiseComponent(control, 'onSettled', { value: mix });
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return true;
  }

  // --- Ribbon / pitch-mod wheel: 1-D absolute-touch strip -----------------
  const RIB_PAD = 8;
  let ribbonDrag = null; // { id } while touching the strip
  function isRibbonControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Ribbon';
  }
  function ribGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    return ribbonGeometry(numberOr(t.width, 0), numberOr(t.height, 0), RIB_PAD);
  }
  function ribWorkingValue(control) {
    const sess = sessionFor(control)?.ribbonValue;
    return typeof sess === 'number' ? sess : ribbonValue(control);
  }
  function commitRibbonValue(control, value) {
    updateControlProperty(getControlId(control), 'Ribbon.value', value);
  }
  // Inject the live value + touch onto the resolved Ribbon (for the renderer and
  // the fan-out — `touch` reads __touch).
  function ribControlWith(control, value, touched) {
    return { ...control, _children: { ...control._children, Ribbon: { ...control._children?.Ribbon, __value: value, __touch: touched === true } } };
  }
  function applyRibbonValueSource(control, resolved) {
    if (!isRibbonControl(control)) return resolved;
    const session = sessionFor(control);
    const v = session?.ribbonValue;
    if (typeof v !== 'number') return resolved;
    const base = resolved?.control ?? control;
    const r = base?._children?.Ribbon;
    if (!r) return resolved;
    return { ...resolved, control: { ...base, _children: { ...base._children, Ribbon: { ...r, __value: v, __touch: session?.ribbonTouch === true } } } };
  }
  function handleRibbonPointerDown(control, localPoint) {
    if (!isRibbonControl(control) || ribbonConfig(control).editable === false) return false;
    const value = ribbonSnap(ribbonValueFromPx(localPoint.x, localPoint.y, ribGeomFor(control), ribbonVertical(control)), control);
    ribbonDrag = { id: getControlId(control) };
    patchControlSession(getControlId(control), { ribbonValue: value, ribbonTouch: true });
    emitControlPortFanout(ribControlWith(control, value, true), 'continuous');
    return true;
  }
  // On release: fire the touch-off gate, then either latch, snap, or glide back
  // to the rest value (returnMode).
  function releaseRibbon(control) {
    const id = getControlId(control);
    const target = ribbonReturnTarget(control);
    if (target === null) { // latch / hold
      const v = ribWorkingValue(control);
      commitRibbonValue(control, v);
      patchControlSession(id, { ribbonTouch: false, ribbonValue: undefined });
      emitControlPortFanout(ribControlWith(control, v, false), 'commit');
      return;
    }
    const rate = numberOr(ribbonConfig(control).returnRate, 8);
    let lastT = Date.now();
    const loop = () => {
      if (ribbonDrag && ribbonDrag.id === id) return; // a new touch cancels the return
      const now = Date.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const { value, settled } = ribbonGlide(ribWorkingValue(control), target, rate, dt);
      patchControlSession(id, { ribbonValue: value, ribbonTouch: false });
      emitControlPortFanout(ribControlWith(control, value, false), settled ? 'commit' : 'continuous');
      if (settled) {
        commitRibbonValue(control, value);
        patchControlSession(id, { ribbonValue: undefined });
        raiseComponent(control, 'onSettled', { value });
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // --- Macro: one knob → many assignments (fan-out) -----------------------
  let macroDrag = null; // { id, startY, startValue } while turning the knob
  function isMacroControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Macro';
  }
  function macroWorkingValue(control) {
    const sess = sessionFor(control)?.macroValue;
    return typeof sess === 'number' ? sess : macroValue(control);
  }
  function commitMacroValue(control, value) {
    updateControlProperty(getControlId(control), 'Macro.value', value);
  }
  function macroControlWith(control, value) {
    return { ...control, _children: { ...control._children, Macro: { ...control._children?.Macro, value } } };
  }
  function applyMacroValueSource(control, resolved) {
    if (!isMacroControl(control)) return resolved;
    const sess = sessionFor(control)?.macroValue;
    if (typeof sess !== 'number') return resolved;
    const base = resolved?.control ?? control;
    const m = base?._children?.Macro;
    if (!m) return resolved;
    return { ...resolved, control: { ...base, _children: { ...base._children, Macro: { ...m, __value: sess } } } };
  }
  // Pointer-down on the knob starts a vertical drag (up = more).
  function handleMacroPointerDown(control, localPoint) {
    if (!isMacroControl(control) || macroConfig(control).editable === false) return false;
    const t = control?._children?.Transform ?? {};
    const geom = macroGeometry(numberOr(t.width, 0), numberOr(t.height, 0), control);
    if (!macroKnobHit(geom, localPoint.x, localPoint.y)) return false;
    macroDrag = { id: getControlId(control), startY: localPoint.y, startValue: macroWorkingValue(control) };
    patchControlSession(getControlId(control), { dragging: true });
    return true;
  }

  // --- Orbit: a self-running spatial poly-LFO (fan-out) -------------------
  // The Orbit animates itself: a lazy rAF ticker advances each running Orbit's
  // phase by rate·dt, re-renders (orbitClock), and fans out every satellite's
  // live value to its device parameter. Satellites can also be dragged to a new
  // radius/angle. Only runs while a running Orbit exists (self-stops).
  const ORBIT_PAD = 10;
  // The Orbit re-renders at rAF (~60Hz) but a free-running modulator must NOT
  // spam that many MIDI messages per bound port. Cap each port's send rate and
  // skip sends when its value hasn't meaningfully moved (a parked satellite is
  // silent). ~40Hz max / ~0.5-of-127-step epsilon keeps it smooth yet lean.
  const ORBIT_EMIT_MS = 25;
  const ORBIT_EMIT_EPS = 0.004;
  let orbitClock = $state(0);
  const orbitPhaseState = {};   // { [id]: phase 0..1 }
  const orbitLastSent = {};     // { [`${id}:${port}`]: { value, at } }
  let orbitTickerRunning = false;
  let orbitLastMs = 0;
  let orbitDrag = null;         // { id, index } while dragging a satellite
  function isOrbitControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Orbit';
  }
  function orbitControls() {
    return (orderedControls ?? []).filter((c) => isOrbitControl(c));
  }
  function orbitPhaseFor(control) {
    const id = getControlId(control);
    if (orbitPhaseState[id] !== undefined) return orbitPhaseState[id];
    return ((numberOr(orbitConfig(control).phase, 0) % 1) + 1) % 1;
  }
  function ensureOrbitTicker() {
    if (orbitTickerRunning) return;
    orbitTickerRunning = true;
    orbitLastMs = Date.now();
    const loop = () => {
      const running = orbitControls().filter((c) => orbitConfig(c).running !== false);
      if (!running.length) { orbitTickerRunning = false; return; } // self-stop
      const now = Date.now();
      const dt = Math.min(0.1, Math.max(0, (now - orbitLastMs) / 1000)); // clamp big gaps
      orbitLastMs = now;
      for (const c of running) {
        const id = getControlId(c);
        if (orbitSynced(c)) {
          // One cycle = N bars. Every satellite's `ratio` is turns per cycle,
          // so the whole constellation inherits the tempo from this one number.
          const wasSynced = orbitPhaseState[id];
          orbitPhaseState[id] = cyclePhaseAt(transportBeatsNow(), orbitCycleBars(c), transportBeatsPerBar());
          if (wasSynced !== undefined) raiseComponentCycle(c, orbitPhaseState[id], wasSynced);
        } else {
          const rate = numberOr(orbitConfig(c).rate, 0.25);
          const prev = orbitPhaseState[id] ?? orbitPhaseFor(c);
          orbitPhaseState[id] = (prev + rate * dt) % 1;
          raiseComponentCycle(c, orbitPhaseState[id], prev);
        }
        emitClockFanout(orbitControlWith(c, orbitPhaseState[id]), now, 'orbit');
      }
      orbitClock = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  // Rate-capped, change-filtered fan-out for a free-running clock (Orbit,
  // Looper): send a bound port's value only when it moved ≥ epsilon AND that
  // port hasn't sent within ORBIT_EMIT_MS. The `control` already carries its
  // live __phase. Keeps a self-running modulator from flooding MIDI.
  function emitClockFanout(control, now, tag = 'clock') {
    const values = controlPortValues(control);
    if (!values) return;
    const controlId = getControlId(control);
    for (const binding of activeDeviceBindings(control)) {
      const port = String(binding?.port ?? '');
      const v = values[port];
      if (v === undefined) continue;
      const key = `${controlId}:${port}`;
      const prev = orbitLastSent[key];
      if (prev && Math.abs(prev.value - v) < ORBIT_EMIT_EPS) continue; // parked / no move
      if (prev && (now - prev.at) < ORBIT_EMIT_MS) continue;           // rate cap
      orbitLastSent[key] = { value: v, at: now };
      commitDeviceParameter({
        requestId: `panel_preview_${controlId || 'control'}_${tag}_${now}`,
        deviceRole: binding.deviceRole || 'mainSynth',
        parameterId: binding.parameterId,
        value: v,
        interactionPhase: 'continuous',
        dryRun: binding.dryRun !== false,
      });
    }
  }
  // A control-like with its Orbit phase (and optional node override) swapped in,
  // for resolving fan-out / rendering from the live clock before it's committed.
  function orbitControlWith(control, phase, nodes = null) {
    const orbit = { ...control._children?.Orbit, __phase: phase };
    if (Array.isArray(nodes)) orbit.nodes = nodes;
    return { ...control, _children: { ...control._children, Orbit: orbit } };
  }
  function orbitGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    return orbitGeometry(numberOr(t.width, 0), numberOr(t.height, 0), ORBIT_PAD);
  }
  // The working nodes: the live session copy while dragging, else the model.
  function orbitWorkingNodes(control) {
    const sess = sessionFor(control)?.orbitNodes;
    return Array.isArray(sess) ? sess : orbitNodes(control);
  }
  // Inject the live clock phase (+ any drag session state) onto the resolved
  // Orbit so the renderer animates. Reads Orbit.__phase / __drag.
  function applyOrbitValueSource(control, resolved) {
    if (!isOrbitControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const orbit = base?._children?.Orbit;
    if (!orbit) return resolved;
    if (orbit.running !== false) { ensureOrbitTicker(); void orbitClock; }
    const nextOrbit = { ...orbit, __phase: orbitPhaseFor(control) };
    const sess = sessionFor(control);
    if (Array.isArray(sess?.orbitNodes)) nextOrbit.nodes = sess.orbitNodes;
    if (typeof sess?.orbitDragIndex === 'number') nextOrbit.__drag = sess.orbitDragIndex;
    return { ...resolved, control: { ...base, _children: { ...base._children, Orbit: nextOrbit } } };
  }
  // Pointer-down on a satellite starts dragging it to a new radius/angle.
  function handleOrbitPointerDown(control, localPoint) {
    if (!isOrbitControl(control) || orbitConfig(control).editable === false) return false;
    const geom = orbitGeomFor(control);
    const phase = orbitPhaseFor(control);
    const hit = orbitHitNode(control, phase, geom, localPoint.x, localPoint.y, 14);
    if (hit < 0) return false;
    orbitDrag = { id: getControlId(control), index: hit };
    patchControlSession(getControlId(control), { orbitDragIndex: hit });
    return true;
  }
  // Move a satellite: place it under the pointer at the current phase (its base
  // angle is back-solved so it sits there now), live into session + fan-out.
  function moveOrbitDrag(control, localPoint) {
    const geom = orbitGeomFor(control);
    const phase = orbitPhaseFor(control);
    const nodes = orbitWorkingNodes(control).map((s) => ({ ...s }));
    const node = nodes[orbitDrag.index];
    if (!node) return;
    const { radius, angle } = pxToOrbit(localPoint.x, localPoint.y, geom);
    node.radius = radius;
    // Displayed angle = base + ratio·phase·360 ⇒ base = displayed − advance.
    const advance = numberOr(node.ratio, 1) * phase * 360;
    let base = angle - advance;
    base = ((base % 360) + 360) % 360;
    node.angle = base;
    patchControlSession(getControlId(control), { orbitNodes: nodes });
    emitControlPortFanout(orbitControlWith(control, phase, nodes), 'continuous');
  }
  // Release a satellite: commit the node array, drop the session override.
  function releaseOrbitDrag(control) {
    const sess = sessionFor(control)?.orbitNodes;
    if (Array.isArray(sess)) {
      updateControlProperty(getControlId(control), 'Orbit.nodes', sess);
      emitControlPortFanout(orbitControlWith(control, orbitPhaseFor(control), sess), 'commit');
    }
    patchControlSession(getControlId(control), { orbitNodes: undefined, orbitDragIndex: undefined });
  }

  // --- Gesture Looper: record a control motion, loop it on the clock ---------
  // Same self-running clock as the Orbit (phase advances by dt / loopSeconds),
  // plus recording: press-and-move inside a lane paints a value-over-loop gesture
  // (x = loop position, y = value); on release it commits and loops.
  const LOOP_PAD = 8;
  const looperPhaseState = {};  // { [id]: phase 0..1 }
  let looperTickerRunning = false;
  let looperLastMs = 0;
  let looperRec = null;         // { id, lane } while recording a lane
  function isLooperControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Looper';
  }
  function looperControls() {
    return (orderedControls ?? []).filter((c) => isLooperControl(c));
  }
  function looperPhaseFor(control) {
    const id = getControlId(control);
    if (looperPhaseState[id] !== undefined) return looperPhaseState[id];
    return ((numberOr(looperConfig(control).phase, 0) % 1) + 1) % 1;
  }
  function looperControlWith(control, phase, lanes = null) {
    const looper = { ...control._children?.Looper, __phase: phase };
    if (Array.isArray(lanes)) looper.lanes = lanes;
    return { ...control, _children: { ...control._children, Looper: looper } };
  }
  function ensureLooperTicker() {
    if (looperTickerRunning) return;
    looperTickerRunning = true;
    looperLastMs = Date.now();
    const loop = () => {
      const running = looperControls().filter((c) => looperConfig(c).running !== false);
      if (!running.length) { looperTickerRunning = false; return; } // self-stop
      const now = Date.now();
      const dt = Math.min(0.1, Math.max(0, (now - looperLastMs) / 1000));
      looperLastMs = now;
      for (const c of running) {
        const id = getControlId(c);
        if (looperSynced(c)) {
          // The loop point is the bar line: phase comes straight from the
          // transport position, so a take recorded over two bars comes back
          // over two bars however long it's been running.
          const wasSynced = looperPhaseState[id];
          looperPhaseState[id] = cyclePhaseAt(transportBeatsNow(), looperLoopBars(c), transportBeatsPerBar());
          if (wasSynced !== undefined) raiseComponentCycle(c, looperPhaseState[id], wasSynced);
          if (!(looperRec && looperRec.id === id)) emitClockFanout(looperControlWith(c, looperPhaseState[id]), now, 'loop');
          continue;
        }
        const prev = looperPhaseState[id] ?? looperPhaseFor(c);
        looperPhaseState[id] = (prev + dt / looperLoopSeconds(c)) % 1;
        raiseComponentCycle(c, looperPhaseState[id], prev);
        // Don't fight a recording in progress on this control's lane.
        if (!(looperRec && looperRec.id === id)) emitClockFanout(looperControlWith(c, looperPhaseState[id]), now, 'loop');
      }
      // touch a reactive dep so the resolve path re-runs
      orbitClock = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  function looperGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    const lanes = looperLanes(control);
    return looperGeometry(numberOr(t.width, 0), numberOr(t.height, 0), Math.max(1, lanes.length), LOOP_PAD);
  }
  // Inject the live clock phase (+ in-progress recording) onto the resolved
  // Looper so the renderer animates + shows the take. Reads __phase/__recLane/…
  function applyLooperValueSource(control, resolved) {
    if (!isLooperControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const looper = base?._children?.Looper;
    if (!looper) return resolved;
    if (looper.running !== false) { ensureLooperTicker(); void orbitClock; }
    const next = { ...looper, __phase: looperPhaseFor(control) };
    if (looperSynced(control)) next.__beatsPerBar = $transport.beatsPerBar;
    const sess = sessionFor(control);
    if (typeof sess?.looperRecLane === 'number') { next.__recLane = sess.looperRecLane; next.__recPoints = sess.looperRecPoints ?? []; }
    return { ...resolved, control: { ...base, _children: { ...base._children, Looper: next } } };
  }
  // Pointer-down inside a lane starts recording that lane from scratch.
  function handleLooperPointerDown(control, localPoint) {
    if (!isLooperControl(control) || looperConfig(control).editable === false) return false;
    const geom = looperGeomFor(control);
    const lane = laneAtPoint(geom, localPoint.y, looperLanes(control).length);
    if (lane < 0) return false;
    const rect = laneRect(geom, lane);
    const first = pxToLane(rect, localPoint.x, localPoint.y);
    looperRec = { id: getControlId(control), lane };
    patchControlSession(getControlId(control), { looperRecLane: lane, looperRecPoints: [{ t: first.t, v: first.v }], dragging: true });
    return true;
  }
  // While recording: append the pointer's (t,v) and fan the drawn value live.
  function moveLooperRec(control, localPoint) {
    const geom = looperGeomFor(control);
    const rect = laneRect(geom, looperRec.lane);
    const p = pxToLane(rect, localPoint.x, localPoint.y);
    const pts = recordAppend(sessionFor(control)?.looperRecPoints ?? [], p.t, p.v);
    patchControlSession(getControlId(control), { looperRecPoints: pts });
    // Emit this lane's drawn value at the drawn position immediately.
    const lanes = looperLanes(control).map((l, i) => (i === looperRec.lane ? { ...l, points: pts } : l));
    emitControlPortFanout(looperControlWith(control, p.t, lanes), 'continuous');
  }
  // Release: commit the recorded lane, drop the session take.
  function releaseLooperRec(control) {
    const sess = sessionFor(control);
    const pts = normalizeGesture(sess?.looperRecPoints ?? []);
    const lane = sess?.looperRecLane;
    if (typeof lane === 'number' && pts.length) {
      const lanes = looperLanes(control).map((l, i) => (i === lane ? { ...l, points: pts } : l));
      updateControlProperty(getControlId(control), 'Looper.lanes', lanes);
    }
    patchControlSession(getControlId(control), { looperRecLane: undefined, looperRecPoints: undefined, dragging: false });
  }

  // --- Expression Router: shape an input signal, fan it to many params -------
  // In preview the input comes from a linked on-panel control (source = 'link')
  // or the section's test value; the shaped curve output fans out on change. The
  // transfer-curve nodes are draggable. (In the Player, incoming MIDI feeds it.)
  const ROUTER_PAD = 8;
  const ROUTER_HEADER = 26;
  const lastRouterInput = {};   // { [id]: input } — emit fan-out only on change
  let routerDrag = null;        // { id, index } while dragging a curve node
  function isRouterControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Router';
  }
  // The live input 0..1: a linked control's normalized value, else the test value.
  function routerInputLive(control) {
    const cfg = routerConfig(control);
    const source = String(cfg.source ?? '');
    if (source === 'link' && cfg.sourceControlId) {
      const range = lcdRangeForSource(cfg.sourceControlId);
      if (range && range.max !== range.min) return Math.max(0, Math.min(1, (range.value - range.min) / (range.max - range.min)));
    } else if (routerSourceIsMidi(source)) {
      // Real hardware. `undefined` means that controller has never been seen,
      // which is different from it having arrived at zero — only the former
      // falls back to the design-time test value.
      ensureNoteInput();
      const live = routerInputFromState(control, $midiExpressionState.expression);
      if (live !== undefined) return live;
    }
    return Math.max(0, Math.min(1, numberOr(cfg.testInput, 0)));
  }
  // Is this router actually being driven by hardware right now? Drives the
  // renderer's live/test badge, so a silent controller is obvious rather than
  // looking like a working one parked at the test value.
  function routerInputIsLive(control) {
    const cfg = routerConfig(control);
    const source = String(cfg.source ?? '');
    if (!routerSourceIsMidi(source)) return false;
    ensureNoteInput();
    return routerInputFromState(control, $midiExpressionState.expression) !== undefined;
  }
  function routerControlWith(control, curve) {
    const router = { ...control._children?.Router };
    if (Array.isArray(curve)) router.curve = curve;
    return { ...control, _children: { ...control._children, Router: router } };
  }
  // The curve editing rect (matches the renderer: header row + left ~52%).
  function routerCurveLayout(control) {
    const t = control?._children?.Transform ?? {};
    const w = numberOr(t.width, 0);
    const h = numberOr(t.height, 0);
    const curveW = Math.round((w - ROUTER_PAD * 2) * 0.52);
    const bodyH = Math.max(20, h - (ROUTER_PAD + ROUTER_HEADER) - ROUTER_PAD);
    const geom = routerGeometry(curveW + ROUTER_PAD * 2, bodyH + ROUTER_PAD * 2, ROUTER_PAD);
    return { geom, gy: ROUTER_HEADER };
  }
  function routerWorkingPoints(control) {
    const sess = sessionFor(control)?.routerCurve;
    return Array.isArray(sess) ? sess : routerCurvePoints(control);
  }
  // Inject the live input (+ any in-progress curve drag) and fan out on change.
  function applyRouterValueSource(control, resolved) {
    if (!isRouterControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const router = base?._children?.Router;
    if (!router) return resolved;
    const input = routerInputLive(control);
    const next = { ...router, __input: input, __live: routerInputIsLive(control) };
    const sess = sessionFor(control);
    if (Array.isArray(sess?.routerCurve)) next.curve = sess.routerCurve;
    if (typeof sess?.routerDragIndex === 'number') next.__drag = sess.routerDragIndex;
    // Fan out the shaped destinations whenever the input moved (preview link).
    const id = getControlId(control);
    if (lastRouterInput[id] === undefined || Math.abs(lastRouterInput[id] - input) > 0.0015) {
      lastRouterInput[id] = input;
      emitControlPortFanout({ ...base, _children: { ...base._children, Router: next } }, 'continuous');
    }
    return { ...resolved, control: { ...base, _children: { ...base._children, Router: next } } };
  }
  // Pointer-down on a transfer-curve node starts dragging it.
  function handleRouterPointerDown(control, localPoint) {
    if (!isRouterControl(control) || routerConfig(control).editable === false) return false;
    const { geom, gy } = routerCurveLayout(control);
    const pts = routerWorkingPoints(control);
    const hit = routerHitNode(pts, geom, localPoint.x, localPoint.y - gy, 12);
    if (hit < 0) return false;
    routerDrag = { id: getControlId(control), index: hit };
    patchControlSession(getControlId(control), { routerDragIndex: hit });
    return true;
  }
  // Drag a curve node: ends keep their x (0/1), interior x stays between neighbours.
  function moveRouterDrag(control, localPoint) {
    const { geom, gy } = routerCurveLayout(control);
    const pts = routerWorkingPoints(control).map((p) => ({ ...p }));
    const node = pts[routerDrag.index];
    if (!node) return;
    const norm = routerNodeFromPx(localPoint.x, localPoint.y - gy, geom);
    const isFirst = routerDrag.index === 0;
    const isLast = routerDrag.index === pts.length - 1;
    node.x = isFirst ? 0 : isLast ? 1 : Math.max(pts[routerDrag.index - 1].x, Math.min(pts[routerDrag.index + 1].x, norm.x));
    node.y = norm.y;
    patchControlSession(getControlId(control), { routerCurve: pts });
  }
  function releaseRouterDrag(control) {
    const sess = sessionFor(control)?.routerCurve;
    if (Array.isArray(sess)) updateControlProperty(getControlId(control), 'Router.curve', sess);
    patchControlSession(getControlId(control), { routerCurve: undefined, routerDragIndex: undefined });
  }

  // --- Timbre Space: control by meaning — blend patch anchors with the puck ---
  const TIMBRE_PAD = 10;
  let timbreDrag = null;   // { id, kind: 'puck' | 'anchor', index }
  function isTimbreControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Timbre';
  }
  function timbreGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    return timbreGeometry(numberOr(t.width, 0), numberOr(t.height, 0), TIMBRE_PAD);
  }
  function timbreWorkingAnchors(control) {
    const sess = sessionFor(control)?.timbreAnchors;
    return Array.isArray(sess) ? sess : timbreAnchors(control);
  }
  function timbrePuckWorking(control) {
    const sess = sessionFor(control);
    const cfg = timbreConfig(control);
    return {
      x: typeof sess?.timbreX === 'number' ? sess.timbreX : numberOr(cfg.x, 0.5),
      y: typeof sess?.timbreY === 'number' ? sess.timbreY : numberOr(cfg.y, 0.5),
    };
  }
  function timbreControlWith(control, puck, anchors) {
    const timbre = { ...control._children?.Timbre, __x: puck.x, __y: puck.y };
    if (Array.isArray(anchors)) timbre.anchors = anchors;
    return { ...control, _children: { ...control._children, Timbre: timbre } };
  }
  // Inject the live puck (+ any anchor drag) and mark what's being dragged.
  function applyTimbreValueSource(control, resolved) {
    if (!isTimbreControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const timbre = base?._children?.Timbre;
    if (!timbre) return resolved;
    const sess = sessionFor(control);
    const puck = timbrePuckWorking(control);
    const next = { ...timbre, __x: puck.x, __y: puck.y };
    if (Array.isArray(sess?.timbreAnchors)) next.anchors = sess.timbreAnchors;
    if (sess?.timbreDrag) next.__drag = sess.timbreDrag;
    return { ...resolved, control: { ...base, _children: { ...base._children, Timbre: next } } };
  }
  // Pointer-down: grab an anchor if one is under the cursor, else jump + drag puck.
  function handleTimbrePointerDown(control, localPoint) {
    if (!isTimbreControl(control) || timbreConfig(control).editable === false) return false;
    const id = getControlId(control);
    const geom = timbreGeomFor(control);
    const hit = timbreHitAnchor(control, geom, localPoint.x, localPoint.y, 13);
    if (hit >= 0) {
      timbreDrag = { id, kind: 'anchor', index: hit };
      patchControlSession(id, { timbreDrag: `anchor:${hit}` });
      return true;
    }
    const p = timbreFromPx(localPoint.x, localPoint.y, geom);
    timbreDrag = { id, kind: 'puck', index: -1 };
    patchControlSession(id, { timbreX: p.x, timbreY: p.y, timbreDrag: 'puck' });
    emitControlPortFanout(timbreControlWith(control, p), 'continuous');
    return true;
  }
  // Drag the puck (blend) or an anchor (reposition a patch on the pad).
  function moveTimbreDrag(control, localPoint) {
    const geom = timbreGeomFor(control);
    const p = timbreFromPx(localPoint.x, localPoint.y, geom);
    if (timbreDrag.kind === 'anchor') {
      const anchors = timbreWorkingAnchors(control).map((a) => ({ ...a }));
      if (anchors[timbreDrag.index]) { anchors[timbreDrag.index].x = p.x; anchors[timbreDrag.index].y = p.y; }
      patchControlSession(getControlId(control), { timbreAnchors: anchors });
      emitControlPortFanout(timbreControlWith(control, timbrePuckWorking(control), anchors), 'continuous');
    } else {
      patchControlSession(getControlId(control), { timbreX: p.x, timbreY: p.y });
      emitControlPortFanout(timbreControlWith(control, p), 'continuous');
    }
  }
  function releaseTimbreDrag(control) {
    const id = getControlId(control);
    const sess = sessionFor(control);
    if (timbreDrag.kind === 'anchor' && Array.isArray(sess?.timbreAnchors)) {
      updateControlProperty(id, 'Timbre.anchors', sess.timbreAnchors);
      emitControlPortFanout(timbreControlWith(control, timbrePuckWorking(control), sess.timbreAnchors), 'commit');
    } else if (timbreDrag.kind === 'puck') {
      const puck = timbrePuckWorking(control);
      updateControlProperty(id, 'Timbre.x', puck.x);
      updateControlProperty(id, 'Timbre.y', puck.y);
      emitControlPortFanout(timbreControlWith(control, puck), 'commit');
    }
    patchControlSession(id, { timbreAnchors: undefined, timbreDrag: undefined, timbreX: undefined, timbreY: undefined });
  }

  // --- Turing Modulator: a stepped generative sequence that locks or evolves --
  // Same self-running clock as the Orbit/Looper (phase advances by rate/length).
  // The evolving register lives in the session: when the step index advances, the
  // incoming step mutates with probability = randomness (Math.random supplies the
  // roll + new value; the pure mutateStep decides). Step bars are draggable to
  // seed/edit the sequence. Generative mutations stay ephemeral (session only).
  const TURING_PAD = 8;
  const turingPhaseState = {};   // { [id]: phase 0..1 }
  const turingLastIdx = {};      // { [id]: last step index }
  const turingJumpState = {};    // { [id]: transport jump counter seen }
  let turingTickerRunning = false;
  let turingLastMs = 0;
  let turingDrag = null;         // { id } while painting step bars
  function isTuringControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Turing';
  }
  function turingControls() {
    return (orderedControls ?? []).filter((c) => isTuringControl(c));
  }
  function turingPhaseFor(control) {
    const id = getControlId(control);
    if (turingPhaseState[id] !== undefined) return turingPhaseState[id];
    return ((numberOr(turingConfig(control).phase, 0) % 1) + 1) % 1;
  }
  function turingLiveSteps(control) {
    const sess = sessionFor(control)?.turingSteps;
    return Array.isArray(sess) ? sess : turingSteps(control);
  }
  function turingControlWith(control, phase, steps) {
    const turing = { ...control._children?.Turing, __phase: phase };
    if (Array.isArray(steps)) turing.__steps = steps;
    return { ...control, _children: { ...control._children, Turing: turing } };
  }
  function ensureTuringTicker() {
    if (turingTickerRunning) return;
    turingTickerRunning = true;
    turingLastMs = Date.now();
    const loop = () => {
      const running = turingControls().filter((c) => turingConfig(c).running !== false);
      if (!running.length) { turingTickerRunning = false; return; } // self-stop
      const now = Date.now();
      const dt = Math.min(0.1, Math.max(0, (now - turingLastMs) / 1000));
      turingLastMs = now;
      for (const c of running) {
        const id = getControlId(c);
        const len = turingLength(c);
        let phase; let idx;
        if (turingSynced(c)) {
          // Position in, step out — same rule as the Arp. A stopped transport
          // holds the register where it is rather than freezing it mid-mutation
          // at some arbitrary point, because the step index is a function of
          // the position and the position isn't moving.
          const beats = transportBeatsNow();
          phase = turingSyncedPhaseAt(beats, c);
          idx = turingSyncedStepAt(beats, c);
          turingPhaseState[id] = phase;
          // Same rule as the Arp: a host locate must not look like the
          // sequence advanced, or the register mutates for steps it skipped.
          const jump = transportJumpSeq();
          const jumped = turingJumpState[id] !== jump;
          turingJumpState[id] = jump;
          if (jumped || !isTransportRunning()) {
            turingLastIdx[id] = idx;
            emitClockFanout(turingControlWith(c, phase, turingLiveSteps(c)), now, 'turing');
            continue;
          }
        } else {
          const prev = turingPhaseState[id] ?? turingPhaseFor(c);
          phase = (prev + (turingStepsPerSecond(c) / len) * dt) % 1;
          turingPhaseState[id] = phase;
          raiseComponentCycle(c, phase, prev);
          idx = Math.max(0, Math.min(len - 1, Math.floor(phase * len)));
        }
        // Mutate when the step index advances (skip while the user is editing it).
        if (turingLastIdx[id] !== idx) {
          // Synced, the phase belongs to the transport, so the wrap is the index going back.
          if (turingSynced(c) && turingLastIdx[id] > idx) raiseComponentCycle(c, 0, 1);
          turingLastIdx[id] = idx;
          if (!(turingDrag && turingDrag.id === id)) {
            const randomness = Math.max(0, Math.min(1, numberOr(turingConfig(c).randomness, 0)));
            if (randomness > 0) {
              const base = turingLiveSteps(c);
              const mutated = mutateStep(base, idx, Math.random(), Math.random(), randomness);
              patchControlSession(id, { turingSteps: mutated });
            }
          }
          // The step, with the value the register now holds at it — which is the whole point of
          // this component, and the one number a script would otherwise have to go and fetch.
          const live = turingLiveSteps(c);
          raiseComponent(c, 'onStep', { index: idx + 1, of: len, notes: [], value: live[idx] });
        }
        emitClockFanout(turingControlWith(c, phase, turingLiveSteps(c)), now, 'turing');
      }
      orbitClock = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  function applyTuringValueSource(control, resolved) {
    if (!isTuringControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const turing = base?._children?.Turing;
    if (!turing) return resolved;
    if (turing.running !== false) { ensureTuringTicker(); void orbitClock; }
    const next = { ...turing, __phase: turingPhaseFor(control) };
    const sess = sessionFor(control)?.turingSteps;
    if (Array.isArray(sess)) next.__steps = sess;
    return { ...resolved, control: { ...base, _children: { ...base._children, Turing: next } } };
  }
  function turingGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    const showGate = turingConfig(control).showGate !== false;
    return turingGeometry(numberOr(t.width, 0), numberOr(t.height, 0) - (showGate ? 10 : 0), turingLength(control), TURING_PAD);
  }
  // Set the step under the cursor to the pointer's value (paint the sequence).
  function paintTuringStep(control, localPoint) {
    const geom = turingGeomFor(control);
    const i = stepAtPoint(geom, localPoint.x, turingLength(control));
    if (i < 0) return;
    const v = valueFromY(geom, localPoint.y);
    const steps = turingLiveSteps(control).slice();
    steps[i] = v;
    patchControlSession(getControlId(control), { turingSteps: steps });
    emitClockFanout(turingControlWith(control, turingPhaseFor(control), steps), Date.now(), 'turing');
  }
  function handleTuringPointerDown(control, localPoint) {
    if (!isTuringControl(control) || turingConfig(control).editable === false) return false;
    const geom = turingGeomFor(control);
    if (stepAtPoint(geom, localPoint.x, turingLength(control)) < 0) return false;
    turingDrag = { id: getControlId(control) };
    paintTuringStep(control, localPoint);
    return true;
  }
  function releaseTuringDrag(control) {
    const sess = sessionFor(control)?.turingSteps;
    if (Array.isArray(sess)) updateControlProperty(getControlId(control), 'Turing.steps', sess);
    // Keep the session register so evolution continues from the edited seed.
  }

  // --- Kinetic Modulator: a physics ball you fling around a box ---------------
  // The physics integration is stateful, so the evolving ball state (+ trail)
  // lives in plain maps advanced by the shared clock; the pure stepKinetic does
  // the maths. Fling: drag sets position and derives a throw velocity; on release
  // the ball flies off and the ticker takes over. Generative state is ephemeral.
  const KINETIC_PAD = 8;
  const kineticStateMap = {};   // id -> { x, y, vx, vy, bounced }
  const kineticTrailMap = {};   // id -> [{ x, y }...]
  let kineticTickerRunning = false;
  let kineticLastMs = 0;
  let kineticDrag = null;       // { id, lastX, lastY, lastT } while flinging
  function isKineticControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Kinetic';
  }
  function kineticControls() {
    return (orderedControls ?? []).filter((c) => isKineticControl(c));
  }
  function kineticStateFor(control) {
    return kineticStateMap[getControlId(control)] ?? kineticInitial(control);
  }
  function kineticControlWith(control, state, trail, extra) {
    const k = { ...control._children?.Kinetic, __state: state };
    if (Array.isArray(trail)) k.__trail = trail;
    if (extra) Object.assign(k, extra);
    return { ...control, _children: { ...control._children, Kinetic: k } };
  }
  const kineticBeatsState = {};   // id -> last transport reading, for synced balls
  function pushKineticTrail(id, state) {
    const tr = kineticTrailMap[id] ?? [];
    tr.push({ x: state.x, y: state.y });
    while (tr.length > 16) tr.shift();
    kineticTrailMap[id] = tr;
  }
  function ensureKineticTicker() {
    if (kineticTickerRunning) return;
    kineticTickerRunning = true;
    kineticLastMs = Date.now();
    const loop = () => {
      const active = kineticControls().filter((c) => kineticConfig(c).running !== false || (kineticDrag && kineticDrag.id === getControlId(c)));
      if (!active.length) { kineticTickerRunning = false; return; } // self-stop
      const now = Date.now();
      const dt = Math.min(0.05, Math.max(0, (now - kineticLastMs) / 1000));
      kineticLastMs = now;
      for (const c of active) {
        const id = getControlId(c);
        if (kineticDrag && kineticDrag.id === id) continue; // driven by the fling drag
        const params = kineticParams(c);
        const prev = kineticStateMap[id] ?? kineticInitial(c);
        // Synced, the sim advances in MUSICAL time: the step is the beats that
        // passed, converted at the 120bpm reference, so tempo scales the motion
        // and a stopped transport freezes the ball. This one can't be made
        // drift-free — it's an integrator, there's nothing to recompute from.
        let step = dt;
        if (kineticSynced(c)) {
          const beats = transportBeatsNow();
          const before = kineticBeatsState[id];
          kineticBeatsState[id] = beats;
          if (!isTransportRunning() || before === undefined) continue;
          step = Math.min(0.05, musicalDelta(before, beats));
          if (step <= 0) continue;
        }
        let next = stepKinetic(prev, step, params);
        // Keep-alive: a nearly-stalled ball gets a fresh random kick.
        if (params.keepAlive > 0 && Math.hypot(next.vx, next.vy) < 0.05) {
          next = { ...next, ...kineticKick(next, params.keepAlive, Math.random(), Math.random()) };
        }
        kineticStateMap[id] = next;
        pushKineticTrail(id, next);
        // stepKinetic already reports the wall it hit; nothing was listening.
        if (next.bounced && !prev.bounced) {
          raiseComponent(c, 'onBounce', { x: next.x, y: next.y, vx: next.vx, vy: next.vy });
        }
        emitClockFanout(kineticControlWith(c, next, null, { __bounce: next.bounced }), now, 'kinetic');
      }
      orbitClock = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  function applyKineticValueSource(control, resolved) {
    if (!isKineticControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const k = base?._children?.Kinetic;
    if (!k) return resolved;
    const id = getControlId(control);
    if (k.running !== false || (kineticDrag && kineticDrag.id === id)) { ensureKineticTicker(); void orbitClock; }
    const next = { ...k, __state: kineticStateMap[id] ?? kineticInitial(control), __trail: kineticTrailMap[id] ?? [] };
    if (kineticDrag && kineticDrag.id === id) next.__drag = true;
    return { ...resolved, control: { ...base, _children: { ...base._children, Kinetic: next } } };
  }
  function kineticGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    return kineticGeometry(numberOr(t.width, 0), numberOr(t.height, 0), KINETIC_PAD);
  }
  function handleKineticPointerDown(control, localPoint) {
    if (!isKineticControl(control) || kineticConfig(control).editable === false) return false;
    const geom = kineticGeomFor(control);
    const p = kineticFromPx(localPoint.x, localPoint.y, geom);
    const id = getControlId(control);
    kineticDrag = { id, lastX: p.x, lastY: p.y, lastT: Date.now() };
    kineticStateMap[id] = { x: p.x, y: p.y, vx: 0, vy: 0, bounced: false };
    ensureKineticTicker();
    return true;
  }
  // Track the finger and derive a throw velocity from its recent movement.
  function moveKineticDrag(control, localPoint) {
    const geom = kineticGeomFor(control);
    const p = kineticFromPx(localPoint.x, localPoint.y, geom);
    const now = Date.now();
    const dt = Math.max(0.001, (now - kineticDrag.lastT) / 1000);
    const id = getControlId(control);
    const vx = (p.x - kineticDrag.lastX) / dt;
    const vy = (p.y - kineticDrag.lastY) / dt;
    kineticStateMap[id] = { x: p.x, y: p.y, vx, vy, bounced: false };
    pushKineticTrail(id, kineticStateMap[id]);
    kineticDrag.lastX = p.x; kineticDrag.lastY = p.y; kineticDrag.lastT = now;
    emitControlPortFanout(kineticControlWith(control, kineticStateMap[id]), 'continuous');
    orbitClock = now;
  }
  // Release: clamp the fling velocity; the ticker integrates from here.
  function releaseKineticDrag(control) {
    const id = getControlId(control);
    const st = kineticStateMap[id];
    if (st) {
      const cap = kineticParams(control).maxSpeed * 1.5;
      const sp = Math.hypot(st.vx, st.vy);
      if (sp > cap) { const kk = cap / sp; kineticStateMap[id] = { ...st, vx: st.vx * kk, vy: st.vy * kk }; }
    }
    ensureKineticTicker();
  }

  // --- Preset Constellation: recall/morph a preset library; wander the probe --
  const constPhaseState = {};   // { [id]: wander phase 0..1 }
  let constTickerRunning = false;
  let constLastMs = 0;
  let constDrag = null;         // { id, kind: 'probe' | 'star', index }
  function isConstControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Constellation';
  }
  function constControls() { return (orderedControls ?? []).filter((c) => isConstControl(c)); }
  function constGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    return constellationGeometry(numberOr(t.width, 0), numberOr(t.height, 0), 10);
  }
  function constWorkingPresets(control) {
    const s = sessionFor(control)?.constPresets;
    return Array.isArray(s) ? s : constellationPresets(control);
  }
  function constModelProbe(control) {
    const cfg = constellationConfig(control);
    return { x: numberOr(cfg.probeX, 0.5), y: numberOr(cfg.probeY, 0.5) };
  }
  function constControlWith(control, probe, presets) {
    const con = { ...control._children?.Constellation, __probeX: probe.x, __probeY: probe.y };
    if (Array.isArray(presets)) con.presets = presets;
    return { ...control, _children: { ...control._children, Constellation: con } };
  }
  function ensureConstTicker() {
    if (constTickerRunning) return;
    constTickerRunning = true;
    constLastMs = Date.now();
    const loop = () => {
      const running = constControls().filter((c) => constellationConfig(c).running === true);
      if (!running.length) { constTickerRunning = false; return; } // self-stop
      const now = Date.now();
      const dt = Math.min(0.1, Math.max(0, (now - constLastMs) / 1000));
      constLastMs = now;
      for (const c of running) {
        const id = getControlId(c);
        if (constDrag && constDrag.id === id) continue;      // manual override
        // Synced, the wander cycle is a bar count: the probe reaches the same
        // point of the field on the same bar every time round.
        const phase = constellationSynced(c)
          ? cyclePhaseAt(transportBeatsNow(), constellationWanderBars(c), transportBeatsPerBar())
          : ((constPhaseState[id] ?? 0) + numberOr(constellationConfig(c).wanderRate, 0.08) * dt) % 1;
        constPhaseState[id] = phase;
        emitClockFanout(constControlWith(c, wanderPos(phase)), now, 'constellation');
      }
      orbitClock = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  // Inject the live probe (drag > wander > committed) + any star drag + marker.
  function applyConstellationValueSource(control, resolved) {
    if (!isConstControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const con = base?._children?.Constellation;
    if (!con) return resolved;
    const id = getControlId(control);
    const running = con.running === true;
    if (running) { ensureConstTicker(); void orbitClock; }
    const sess = sessionFor(control);
    let probe;
    if (typeof sess?.constX === 'number') probe = { x: sess.constX, y: sess.constY };
    else if (running) probe = wanderPos(constPhaseState[id] ?? 0);
    else probe = { x: numberOr(con.probeX, 0.5), y: numberOr(con.probeY, 0.5) };
    const next = { ...con, __probeX: probe.x, __probeY: probe.y };
    if (Array.isArray(sess?.constPresets)) next.presets = sess.constPresets;
    if (sess?.constDrag) next.__drag = sess.constDrag;

    // Snap mode recalls the nearest star exactly, so "which star" is a discrete moment. Blend mode
    // is a continuous morph and has none — nothing is recalled, so nothing is reported.
    if (String(con.mode ?? 'blend') === 'snap') {
      const near = nearestPreset(Array.isArray(next.presets) ? next.presets : [], probe.x, probe.y);
      const previous = componentLastPreset[id];
      const nowId = String(near?.id ?? '');
      componentLastPreset[id] = nowId;
      if (previous !== undefined && previous !== nowId && nowId) {
        raiseComponent(control, 'onRecall', { id: nowId, label: String(near?.label ?? '') });
      }
    }
    return { ...resolved, control: { ...base, _children: { ...base._children, Constellation: next } } };
  }
  // Pointer-down: grab a preset star if under the cursor, else jump + drag probe.
  function handleConstellationPointerDown(control, localPoint) {
    if (!isConstControl(control) || constellationConfig(control).editable === false) return false;
    const id = getControlId(control);
    const geom = constGeomFor(control);
    const hit = constellationHitPreset(control, geom, localPoint.x, localPoint.y, 13);
    if (hit >= 0) {
      constDrag = { id, kind: 'star', index: hit };
      patchControlSession(id, { constDrag: `star:${hit}` });
      return true;
    }
    const p = constellationFromPx(localPoint.x, localPoint.y, geom);
    constDrag = { id, kind: 'probe', index: -1 };
    patchControlSession(id, { constX: p.x, constY: p.y, constDrag: 'probe' });
    emitControlPortFanout(constControlWith(control, p), 'continuous');
    return true;
  }
  function moveConstDrag(control, localPoint) {
    const geom = constGeomFor(control);
    const p = constellationFromPx(localPoint.x, localPoint.y, geom);
    if (constDrag.kind === 'star') {
      const presets = constWorkingPresets(control).map((x) => ({ ...x }));
      if (presets[constDrag.index]) { presets[constDrag.index].x = p.x; presets[constDrag.index].y = p.y; }
      patchControlSession(getControlId(control), { constPresets: presets });
      emitControlPortFanout(constControlWith(control, constModelProbe(control), presets), 'continuous');
    } else {
      patchControlSession(getControlId(control), { constX: p.x, constY: p.y });
      emitControlPortFanout(constControlWith(control, p), 'continuous');
    }
  }
  function releaseConstDrag(control) {
    const id = getControlId(control);
    const sess = sessionFor(control);
    if (constDrag.kind === 'star' && Array.isArray(sess?.constPresets)) {
      updateControlProperty(id, 'Constellation.presets', sess.constPresets);
    } else if (constDrag.kind === 'probe' && typeof sess?.constX === 'number') {
      updateControlProperty(id, 'Constellation.probeX', sess.constX);
      updateControlProperty(id, 'Constellation.probeY', sess.constY);
    }
    patchControlSession(id, { constPresets: undefined, constX: undefined, constY: undefined, constDrag: undefined });
  }

  // --- Constraint Cell: drag a member bar; the rule moves the others ----------
  let constraintDrag = null;    // { id, index } while dragging a member bar
  function isConstraintControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Constraint';
  }
  function constraintGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    const count = Math.max(1, constraintMembers(control).length);
    return constraintGeometry(numberOr(t.width, 0), numberOr(t.height, 0), count, 8, 16);
  }
  function constraintWorkingValues(control) {
    const sess = sessionFor(control)?.constraintValues;
    return Array.isArray(sess) ? sess : constraintMembers(control).map((m) => m.value);
  }
  function constraintControlWith(control, values) {
    return { ...control, _children: { ...control._children, Constraint: { ...control._children?.Constraint, __values: values } } };
  }
  // Inject the live (in-progress) values + dragged index onto the resolved cell.
  function applyConstraintValueSource(control, resolved) {
    if (!isConstraintControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const c = base?._children?.Constraint;
    if (!c) return resolved;
    const sess = sessionFor(control);
    if (!Array.isArray(sess?.constraintValues) && sess?.constraintDrag === undefined) return resolved;
    const next = { ...c };
    if (Array.isArray(sess?.constraintValues)) next.__values = sess.constraintValues;
    if (typeof sess?.constraintDrag === 'number') next.__drag = sess.constraintDrag;
    return { ...resolved, control: { ...base, _children: { ...base._children, Constraint: next } } };
  }
  // Set the dragged member from the pointer's Y, then run the solver.
  function solveConstraintFrom(control, localPoint) {
    const geom = constraintGeomFor(control);
    const nv = constraintValueFromY(geom, localPoint.y);
    const working = constraintWorkingValues(control);
    const next = applyConstraint(working, constraintMode(control), constraintDrag.index, nv, { minGap: numberOr(constraintConfig(control).minGap, 0) });
    patchControlSession(getControlId(control), { constraintValues: next });
    emitControlPortFanout(constraintControlWith(control, next), 'continuous');
  }
  function handleConstraintPointerDown(control, localPoint) {
    if (!isConstraintControl(control) || constraintConfig(control).editable === false) return false;
    const geom = constraintGeomFor(control);
    const idx = barAtPoint(geom, localPoint.x, constraintMembers(control).length);
    if (idx < 0) return false;
    constraintDrag = { id: getControlId(control), index: idx };
    // Seed the working values from the model so the solver has a base.
    patchControlSession(getControlId(control), { constraintValues: constraintMembers(control).map((m) => m.value), constraintDrag: idx });
    solveConstraintFrom(control, localPoint);
    return true;
  }
  function releaseConstraintDrag(control) {
    const sess = sessionFor(control)?.constraintValues;
    if (Array.isArray(sess)) {
      const members = constraintMembers(control).map((m, i) => ({ ...m, value: Math.max(0, Math.min(1, numberOr(sess[i], m.value))) }));
      updateControlProperty(getControlId(control), 'Constraint.members', members);
      emitControlPortFanout(constraintControlWith(control, members.map((m) => m.value)), 'commit');
    }
    patchControlSession(getControlId(control), { constraintValues: undefined, constraintDrag: undefined });
  }

  // --- Note input echo: light the note controls from INCOMING MIDI ------------
  // One listener, one held-note model, four consumers. Every note-playing
  // control can mirror what's arriving on the hardware input, which turns the
  // Chord Pad into a chord analyser, the Drum Pads into a sequencer monitor, and
  // lets the Arp be driven from an external keyboard.
  let noteInputStarted = false;
  function ensureNoteInput() {
    if (noteInputStarted) return;
    noteInputStarted = true;
    startNoteInputListener();
  }
  // The notes a control should echo, honouring its channel filter (0 = omni).
  // Returns [] when the control has echo switched off, so nothing is drawn and
  // no work is done for the common case.
  function echoNotesFor(cfg) {
    if (cfg?.echo !== true) return [];
    ensureNoteInput();
    return inputHeldNotes($midiNoteState.notes, numberOr(cfg.echoChannel, 0));
  }
  // How hard each echoed note is being played (poly pressure if a finger is
  // leaning on it, else the velocity it was struck at) so the echo can show
  // dynamics instead of just on/off.
  function echoLevelsFor(cfg) {
    if (cfg?.echo !== true) return null;
    ensureNoteInput();
    return noteLevels($midiNoteState.notes, $midiExpressionState.expression, numberOr(cfg.echoChannel, 0));
  }

  // --- Chord Pad: PLAY the synth (MIDI notes, not parameters) -----------------
  // The only control here that emits notes: pressing a pad sends note-on for each
  // chord tone (optionally strummed), releasing sends note-off. Notes go out as
  // raw MIDI via the same bridge action the scripting runtime uses, so they reach
  // whatever hardware output the 'mainSynth' role holds. Held pads + sounding
  // notes live in the session so the renderer can light up.
  const chordHeld = {};         // id -> { [padId]: number[] }  (sounding notes per pad)
  const chordStrumTimers = {};  // id -> [timeoutId...]
  let chordPress = null;        // { id, padId } while a pad is held by the pointer
  function isChordPadControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'ChordPad';
  }
  // Set once anything on this panel actually sounds a note. Auto-panic on exit
  // checks it, so closing a panel that never played stays silent instead of
  // firing 64 messages at the rig for no reason.
  let sentAnyNote = false;
  function sendNoteBytes(bytes, actionId, sourceType = '', sourceId = '') {
    if ((bytes?.[0] & 0xF0) === 0x90) sentAnyNote = true;
    triggerRawMidiAction({ deviceRole: 'mainSynth', actionId, message: bytesToHex(bytes), dryRun: false });
    // Every note the panel plays passes through here, which is what makes
    // "record what I just played" one tap instead of six integrations.
    const tapped = noteOutputFromBytes(bytes, sourceType, sourceId);
    if (tapped) publishNoteOutput(tapped);
  }
  // Push the union of every held pad's notes into the session (for the renderer).
  function syncChordSession(control) {
    const id = getControlId(control);
    const map = chordHeld[id] ?? {};
    const padIds = Object.keys(map);
    const notes = [...new Set(padIds.flatMap((k) => map[k]))].sort((a, b) => a - b);
    patchControlSession(id, { chordHeldIds: padIds, chordNotes: notes });
  }
  function chordNoteOn(control, padId, notes) {
    const id = getControlId(control);
    const cfg = chordPadConfig(control);
    const ch = chordPadChannel(control);
    const vel = chordPadVelocity(control);
    const strum = Math.max(0, numberOr(cfg.strumMs, 0));
    (chordHeld[id] ??= {})[padId] = notes;
    // The event fires either way, including when the pad is feeding an Arp and stays silent: the
    // pad WAS struck, and a script lighting it should not care who plays the notes.
    raiseComponent(control, 'onHit', { id: padId, note: notes[0], notes: [...notes], velocity: vel });
    // Feeding an Arp? Record the held notes (the Arp reads them, the renderer
    // lights up) but stay silent — the Arp does the playing.
    if (chordPadFeedsArp(control)) { syncChordSession(control); return; }
    notes.forEach((note, i) => {
      if (strum > 0 && i > 0) {
        const t = setTimeout(() => sendNoteBytes(noteOnBytes(ch, note, vel), `note_on_${note}`), strum * i);
        (chordStrumTimers[id] ??= []).push(t);
      } else {
        sendNoteBytes(noteOnBytes(ch, note, vel), `note_on_${note}`);
      }
    });
    syncChordSession(control);
  }
  function chordNoteOff(control, padId) {
    const id = getControlId(control);
    const map = chordHeld[id] ?? {};
    const notes = map[padId];
    if (!notes) return;
    const ch = chordPadChannel(control);
    // Only silence notes no OTHER held pad is still sounding.
    const stillHeld = new Set(Object.entries(map).filter(([k]) => k !== padId).flatMap(([, v]) => v));
    if (!chordPadFeedsArp(control)) {
      for (const note of notes) if (!stillHeld.has(note)) sendNoteBytes(noteOffBytes(ch, note), `note_off_${note}`);
    }
    delete map[padId];
    raiseComponent(control, 'onRelease', { id: padId, note: notes[0], notes: [...notes] });
    syncChordSession(control);
  }
  function chordAllOff(control) {
    const id = getControlId(control);
    for (const t of chordStrumTimers[id] ?? []) clearTimeout(t);
    chordStrumTimers[id] = [];
    for (const padId of Object.keys(chordHeld[id] ?? {})) chordNoteOff(control, padId);
  }
  // Inject the held pads + sounding notes so the renderer lights up.
  function applyChordPadValueSource(control, resolved) {
    if (!isChordPadControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const c = base?._children?.ChordPad;
    if (!c) return resolved;
    const sess = sessionFor(control);
    const echo = echoNotesFor(c);
    if (!sess?.chordHeldIds && !sess?.chordNotes && !echo.length) return resolved;
    const next = { ...c, __held: sess?.chordHeldIds ?? [], __notes: sess?.chordNotes ?? [] };
    if (echo.length) { next.__echo = echo; next.__echoLevels = echoLevelsFor(c); }
    return { ...resolved, control: { ...base, _children: { ...base._children, ChordPad: next } } };
  }
  // Which pad (if any) is under the pointer — shared by both layouts.
  function chordPadAtPoint(control, localPoint) {
    const t = control?._children?.Transform ?? {};
    const w = numberOr(t.width, 0);
    const h = numberOr(t.height, 0);
    const cfg = chordPadConfig(control);
    const pianoH = cfg.showPiano !== false ? 26 : 0;
    if (chordPadLayoutMode(control) === 'grid') {
      const pads = chordPadPads(control);
      const geom = gridGeometry(w, h, Math.max(1, pads.length), Math.max(1, Math.round(numberOr(cfg.gridCols, 4))), 10, 30, pianoH);
      const i = gridHit(geom, localPoint.x, localPoint.y, pads.length);
      return i >= 0 ? pads[i] : null;
    }
    const geom = wheelGeometry(w, h - pianoH, 10, 30);
    const hit = wheelHit(geom, localPoint.x, localPoint.y);
    if (!hit) return null;
    const slot = wheelSlots(control)[hit.index];
    return hit.ring === 'minor' ? slot.minor : slot.major;
  }
  function handleChordPadPointerDown(control, localPoint) {
    if (!isChordPadControl(control) || chordPadConfig(control).editable === false) return false;
    const pad = chordPadAtPoint(control, localPoint);
    if (!pad) return false;
    const id = getControlId(control);
    const latch = chordPadConfig(control).latch === true;
    // Latch: a second tap on a sounding pad silences it.
    if (latch && (chordHeld[id] ?? {})[pad.id]) { chordNoteOff(control, pad.id); return true; }
    if (!latch) chordAllOff(control);            // momentary: one pad at a time
    chordNoteOn(control, pad.id, padNotes(control, pad));
    if (!latch) chordPress = { id, padId: pad.id };
    return true;
  }
  // Drag across pads → legato: release the old pad, sound the new one.
  function moveChordPress(control, localPoint) {
    const pad = chordPadAtPoint(control, localPoint);
    if (!pad || pad.id === chordPress.padId) return;
    chordNoteOff(control, chordPress.padId);
    chordNoteOn(control, pad.id, padNotes(control, pad));
    chordPress.padId = pad.id;
  }
  function releaseChordPress(control) {
    if (chordPadConfig(control).latch === true) return;   // latched pads keep ringing
    chordAllOff(control);
  }

  // --- Arpeggiator: walk the held notes on the clock --------------------------
  // The second note-emitting control. It shares the Chord Pad's output path
  // (sendNoteBytes) and the shared rAF clock the modulators use. Each fired step
  // sends note-on for its notes and schedules the matching note-off a gate
  // later; swing delays the odd steps. Notes come from its own key/scale chord,
  // or from whatever a linked Chord Pad is holding.
  const ARP_PAD = 8;
  const arpPhaseState = {};     // id -> phase 0..1 across the whole sequence
  const arpLastIdx = {};        // id -> last fired step index
  const arpTimers = {};         // id -> [timeoutId...]  (swing delays + note-offs)
  const arpSounding = {};       // id -> Set(note) currently ringing
  const arpLatched = {};        // id -> last non-empty linked note set
  const arpBeatsState = {};     // id -> last transport reading, for synced arps
  const arpJumpState = {};      // id -> transport jump counter seen (see tickSyncedArp)
  let arpTickerRunning = false;
  let arpLastMs = 0;
  function isArpControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Arp';
  }
  function arpControls() {
    return (orderedControls ?? []).filter((c) => isArpControl(c));
  }
  // A Chord Pad that feeds a running Arp goes SILENT itself — the Arp plays its
  // notes. Otherwise you'd hear the block chord under the arpeggio.
  function chordPadFeedsArp(control) {
    const id = getControlId(control);
    if (!id) return false;
    return arpControls().some((c) => {
      const cfg = arpConfig(c);
      return String(cfg.source ?? 'chord') === 'link' && String(cfg.linkId ?? '') === id && cfg.running !== false;
    });
  }
  // The linked Chord Pad's held notes (null when the Arp uses its own chord).
  function arpSourceNotes(control) {
    const cfg = arpConfig(control);
    const source = String(cfg.source ?? 'chord');
    if (source !== 'link' && source !== 'input') return null;
    let live;
    if (source === 'input') {
      // Straight off the hardware keyboard — the same held-note model the echo
      // displays use, so an arp and a lit Chord Pad always agree.
      ensureNoteInput();
      live = inputHeldNotes($midiNoteState.notes, numberOr(cfg.inputChannel, 0));
    } else {
      const linkId = String(cfg.linkId ?? '');
      const map = linkId ? (chordHeld[linkId] ?? {}) : {};
      live = [...new Set(Object.values(map).flat())].sort((a, b) => a - b);
    }
    const id = getControlId(control);
    if (live.length) { arpLatched[id] = live; return live; }
    if (cfg.latch === true && Array.isArray(arpLatched[id])) return arpLatched[id];
    return [];
  }
  // A control-like carrying its live phase + linked notes, for the engine and
  // the renderer.
  function arpControlWith(control, phase) {
    const notes = arpSourceNotes(control);
    const arp = { ...control._children?.Arp };
    if (phase !== null) arp.__phase = phase;
    if (notes) arp.__sourceNotes = notes;
    return { ...control, _children: { ...control._children, Arp: arp } };
  }
  function arpPhaseFor(control) {
    const id = getControlId(control);
    return arpPhaseState[id] !== undefined ? arpPhaseState[id] : arpPhase(control);
  }
  function arpAllOff(control) {
    const id = getControlId(control);
    const timers = arpTimers[id] ?? [];
    const ringing = arpSounding[id];
    if (!timers.length && !(ringing && ringing.size)) return;
    for (const t of timers) clearTimeout(t);
    arpTimers[id] = [];
    const ch = arpChannel(control);
    for (const note of ringing ?? []) sendNoteBytes(noteOffBytes(ch, note), `arp_off_${note}`);
    arpSounding[id] = new Set();
  }
  function arpFireStep(control, notes, stepIdx, bpm = null) {
    const id = getControlId(control);
    const cfg = arpConfig(control);
    const ch = arpChannel(control);
    const vel = arpVelocity(control);
    const secs = stepSeconds(control, bpm);
    const gateMs = gateSeconds(control, secs) * 1000;
    const push = (t) => (arpTimers[id] ??= []).push(t);
    const fire = () => {
      for (const note of notes) {
        sendNoteBytes(noteOnBytes(ch, note, vel), `arp_on_${note}`);
        (arpSounding[id] ??= new Set()).add(note);
        push(setTimeout(() => {
          sendNoteBytes(noteOffBytes(ch, note), `arp_off_${note}`);
          arpSounding[id]?.delete(note);
        }, gateMs));
      }
    };
    const delayMs = swingDelay(stepIdx, arpEffectiveSwing(control, transportSwingNow()), secs) * 1000;
    if (delayMs > 0) push(setTimeout(fire, delayMs)); else fire();
  }
  // A synced Arp doesn't advance a phase of its own — it asks the transport
  // where the music is and works out which step that is. Two consequences worth
  // the extra branch: it can never drift away from anything else on the clock,
  // and a frame that arrives late FIRES the steps it slept through (crossedSteps)
  // instead of leaving a hole in the bar. When the transport is stopped the Arp
  // holds its position and stays silent, which is what a stopped transport means.
  function tickSyncedArp(control, id, live, seq) {
    const beats = transportBeatsNow();
    const div = arpDivision(control);
    arpPhaseState[id] = syncedPhaseAt(beats, control, seq.length);
    const prev = arpBeatsState[id];
    arpBeatsState[id] = beats;
    // A locate, a loop wrap or a rewind is a discontinuity, not playing on.
    // Catching up through one would fire every step the locator skipped, which
    // is a burst of notes nobody asked for. Re-baseline and start again.
    const jump = transportJumpSeq();
    if (arpJumpState[id] !== jump) { arpJumpState[id] = jump; return; }
    if (!isTransportRunning() || prev === undefined || beats <= prev) return;
    const bpm = transportBpmNow();
    const { steps } = crossedSteps(prev, beats, div);
    for (const global of steps) {
      const idx = ((global % seq.length) + seq.length) % seq.length;
      // A synced Arp has no phase of its own to watch, so the wrap is the step index going back.
      if (arpLastIdx[id] > idx) raiseComponentCycle(control, 0, 1);
      arpLastIdx[id] = idx;
      if (stepFires(live, idx)) {
        arpFireStep(control, seq[idx], idx, bpm);
        raiseComponent(control, 'onStep', { index: idx + 1, of: seq.length, notes: [...seq[idx]] });
      }
    }
  }
  function ensureArpTicker() {
    if (arpTickerRunning) return;
    arpTickerRunning = true;
    arpLastMs = Date.now();
    const loop = () => {
      const running = arpControls().filter((c) => arpConfig(c).running !== false);
      if (!running.length) { arpTickerRunning = false; return; }   // self-stop
      const now = Date.now();
      const dt = Math.min(0.1, Math.max(0, (now - arpLastMs) / 1000));
      arpLastMs = now;
      for (const c of running) {
        const id = getControlId(c);
        const live = arpControlWith(c, null);
        const seq = arpSequence(live, arpBaseNotes(live));
        if (!seq.length) {                       // nothing held — park at the start
          arpPhaseState[id] = 0;
          arpLastIdx[id] = -1;
          // Forget the synced reading too, or the first frame after notes come
          // back would "catch up" every step of the silence.
          delete arpBeatsState[id];
          arpAllOff(c);
          continue;
        }
        if (arpSynced(c)) { tickSyncedArp(c, id, live, seq); continue; }
        const prev = arpPhaseState[id] ?? arpPhaseFor(c);
        const phase = (prev + (arpRate(c) / seq.length) * dt) % 1;
        arpPhaseState[id] = phase;
        raiseComponentCycle(c, phase, prev);
        const idx = stepIndexAt(phase, seq.length);
        if (arpLastIdx[id] !== idx) {
          arpLastIdx[id] = idx;
          // A muted step is not a step that fired, so it raises nothing — the event follows the
          // notes, which is what a script lighting an LED off it wants.
          if (stepFires(live, idx)) {
            arpFireStep(c, seq[idx], idx);
            raiseComponent(c, 'onStep', { index: idx + 1, of: seq.length, notes: [...seq[idx]] });
          }
        }
      }
      orbitClock = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  // Inject the live phase + linked notes so the renderer draws the real walk.
  function applyArpValueSource(control, resolved) {
    if (!isArpControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const arp = base?._children?.Arp;
    if (!arp) return resolved;
    if (arp.running !== false) { ensureArpTicker(); void orbitClock; }
    const notes = arpSourceNotes(control);
    const next = { ...arp, __phase: arpPhaseFor(control) };
    if (notes) next.__sourceNotes = notes;
    return { ...resolved, control: { ...base, _children: { ...base._children, Arp: next } } };
  }
  function arpGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    const headerH = arpConfig(control).showHeader !== false ? 22 : 0;
    const live = arpControlWith(control, null);
    const len = Math.max(1, arpSequence(live, arpBaseNotes(live)).length);
    return { geom: arpGeometry(numberOr(t.width, 0), numberOr(t.height, 0), len, ARP_PAD, headerH), len };
  }
  // Click a step cell to mute/unmute it by hand.
  function handleArpPointerDown(control, localPoint) {
    if (!isArpControl(control) || arpConfig(control).editable === false) return false;
    const { geom, len } = arpGeomFor(control);
    if (localPoint.y < geom.y0) return false;
    const i = arpCellAt(geom, localPoint.x, len);
    if (i < 0) return false;
    updateControlProperty(getControlId(control), 'Arp.mutes', toggleMute(control, i));
    return true;
  }

  // --- Ribbon Keyboard: slide along the strip to play pitch --------------------
  // Third note-emitting control, on the same raw-MIDI path. Scale-snap and
  // chromatic play discrete zones (sliding retriggers legato); glide holds one
  // root and sends PITCH BEND for the fractional pitch, retriggering only when
  // the finger travels past the bend window. The cross axis can send a CC.
  const RIBBON_PAD = 8;
  const RIBBON_SEND_MS = 20;      // don't stream bend/CC faster than ~50 Hz
  const RIBBON_BEND_EPS = 24;     // …or for a move smaller than this (of 16383)
  let ribbonPress = null;         // { id, note, root, t, across, pitch }
  const ribbonLastSend = {};      // id -> { bend: {v, at}, cc: {v, at} }
  function isNoteRibbonControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'NoteRibbon';
  }
  function ribbonGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    const headerH = nrConfig(control).showHeader !== false ? 22 : 0;
    return nrGeometry(numberOr(t.width, 0), numberOr(t.height, 0), RIBBON_PAD, headerH,
      nrHorizontal(control) ? 'horizontal' : 'vertical');
  }
  // Push the live touch into the session so the renderer can draw the rail.
  function syncRibbonSession(control, touch) {
    patchControlSession(getControlId(control), { noteRibbonTouch: touch ?? undefined });
  }
  function sendRibbonBend(control, value, force = false) {
    const id = getControlId(control);
    const now = Date.now();
    const last = (ribbonLastSend[id] ??= {}).bend;
    if (!force && last && Math.abs(last.v - value) < RIBBON_BEND_EPS && (now - last.at) < RIBBON_SEND_MS) return;
    ribbonLastSend[id].bend = { v: value, at: now };
    sendNoteBytes(nrBendBytes(nrChannel(control), value), 'pitch_bend');
  }
  function sendRibbonMod(control, across) {
    const v = nrModValue(control, across);
    if (v === null) return;
    const id = getControlId(control);
    const now = Date.now();
    const last = (ribbonLastSend[id] ??= {}).cc;
    if (last && last.v === v && (now - last.at) < RIBBON_SEND_MS) return;
    ribbonLastSend[id].cc = { v, at: now };
    sendNoteBytes(nrCcBytes(nrChannel(control), nrModCc(control), v), `cc_${nrModCc(control)}`);
  }
  function ribbonNoteOff(control) {
    if (!ribbonPress || ribbonPress.id !== getControlId(control)) return;
    sendNoteBytes(noteOffBytes(nrChannel(control), ribbonPress.note), `note_off_${ribbonPress.note}`);
    raiseComponent(control, 'onRelease', { id: '', note: ribbonPress.note, notes: [ribbonPress.note] });
  }
  // Play the pitch at a strip position, reusing the sounding note when it hasn't
  // changed so a slow slide doesn't machine-gun note-ons.
  function ribbonPlayAt(control, localPoint, isNew) {
    const geom = ribbonGeomFor(control);
    const t = nrAlong(geom, localPoint.x, localPoint.y);
    const across = nrAcross(geom, localPoint.x, localPoint.y);
    const ch = nrChannel(control);
    const mode = nrMode(control);
    let note;
    let pitch = null;
    if (mode === 'glide') {
      const step = nrGlideStep(control, t, isNew ? null : ribbonPress?.root);
      note = step.root;
      pitch = step.pitch;
      if (step.retrigger) {
        if (!isNew) ribbonNoteOff(control);
        sendRibbonBend(control, 8192, true);          // centre before the new note
        sendNoteBytes(noteOnBytes(ch, note, nrVelocity(control, across)), `note_on_${note}`);
        raiseComponent(control, 'onHit',
          { id: '', note, notes: [note], velocity: nrVelocity(control, across) });
      }
      sendRibbonBend(control, step.bend, step.retrigger);
    } else {
      const zone = nrSnapZone(nrZones(control), t);
      if (!zone) return false;
      note = zone.note;
      if (isNew || note !== ribbonPress?.note) {
        if (!isNew) ribbonNoteOff(control);
        sendNoteBytes(noteOnBytes(ch, note, nrVelocity(control, across)), `note_on_${note}`);
        raiseComponent(control, 'onHit',
          { id: '', note, notes: [note], velocity: nrVelocity(control, across) });
      }
    }
    sendRibbonMod(control, across);
    ribbonPress = { id: getControlId(control), note, root: note, t, across, pitch };
    syncRibbonSession(control, { note, t, across, pitch });
    return true;
  }
  function handleNoteRibbonPointerDown(control, localPoint) {
    if (!isNoteRibbonControl(control) || nrConfig(control).editable === false) return false;
    if (!nrInside(ribbonGeomFor(control), localPoint.x, localPoint.y)) return false;
    // Latch: a second touch on a latched, still-sounding ribbon silences it.
    if (nrConfig(control).latch === true && ribbonPress && ribbonPress.id === getControlId(control)) {
      ribbonNoteOff(control);
      sendRibbonBend(control, 8192, true);
      ribbonPress = null;
      syncRibbonSession(control, null);
      return true;
    }
    return ribbonPlayAt(control, localPoint, true);
  }
  function moveRibbonPress(control, localPoint) {
    ribbonPlayAt(control, localPoint, false);
  }
  function releaseRibbonPress(control) {
    if (nrConfig(control).latch === true) return;   // keep it ringing
    ribbonNoteOff(control);
    sendRibbonBend(control, 8192, true);                // leave the bend centred
    ribbonPress = null;
    syncRibbonSession(control, null);
  }
  // Inject the live touch so the renderer can draw the rail + note bubble.
  function applyNoteRibbonValueSource(control, resolved) {
    if (!isNoteRibbonControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const r = base?._children?.NoteRibbon;
    if (!r) return resolved;
    const touch = sessionFor(control)?.noteRibbonTouch;
    const echo = echoNotesFor(r);
    if (!touch && !echo.length) return resolved;
    const next = { ...r };
    if (touch) next.__touch = touch;
    if (echo.length) { next.__echo = echo; next.__echoLevels = echoLevelsFor(r); }
    return { ...resolved, control: { ...base, _children: { ...base._children, NoteRibbon: next } } };
  }

  // --- Drum Pads: fixed-note trigger grid --------------------------------------
  // Fourth note-emitting control, on the shared raw-MIDI path. Three trigger
  // modes (hold / one-shot gate / toggle), velocity from the strike height, and
  // CHOKE GROUPS — hitting a pad silences any sounding pad in the same group,
  // which is how a closed hi-hat cuts an open one.
  const DRUM_PAD = 8;
  const drumHits = {};        // id -> { [padId]: { note, mode } }
  const drumTimers = {};      // id -> [timeoutId...]  (one-shot gates)
  let drumPress = null;       // { id, padId } while the pointer holds a pad
  // ROLL. A pad marked `roll` restrikes for as long as it is ON — held under 'momentary', latched
  // under 'toggle'. The clock is the same one a repeating button holds; what differs is only what
  // firing MEANS, which here is note-off then note-on at the roll velocity.
  const drumRolling = {};     // "id:padId" -> { control, pad }
  const drumRollKey = (id, padId) => `${id}:${padId}`;
  const drumRollClock = createRepeatClock({
    onFire: (key) => {
      const held = drumRolling[key];
      if (!held) return;
      restrikeDrumPad(held.control, held.pad);
    },
  });
  onDestroy(() => drumRollClock.destroy());
  function isDrumPadsControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'DrumPads';
  }
  function drumGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    const headerH = drumConfig(control).showHeader !== false ? 22 : 0;
    return drumGeometry(numberOr(t.width, 0), numberOr(t.height, 0),
      drumRows(control), drumCols(control), DRUM_PAD, headerH, 5);
  }
  function syncDrumSession(control, last) {
    const id = getControlId(control);
    const patch = { drumHits: Object.keys(drumHits[id] ?? {}) };
    if (last !== undefined) patch.drumLast = last;
    patchControlSession(id, patch);
  }
  function drumNoteOff(control, padId) {
    const id = getControlId(control);
    // Stop the roll FIRST, and unconditionally. This is the one place every way a pad can stop
    // passes through — released, toggled off, choked by a group-mate, or cut by its one-shot gate —
    // so a roll that outlived any of them would be a roll with no pad under it.
    stopDrumRoll(id, padId);
    const held = (drumHits[id] ?? {})[padId];
    if (!held) return;
    sendNoteBytes(noteOffBytes(drumChannel(control), held.note), `note_off_${held.note}`);
    delete drumHits[id][padId];
    raiseComponent(control, 'onRelease', { id: padId, note: held.note, notes: [held.note] });
  }
  function drumHit(control, pad, strikeY, opts = null) {
    const id = getControlId(control);
    const ch = drumChannel(control);
    const mode = drumMode(control);
    const map = (drumHits[id] ??= {});
    // Toggle: a second hit on a sounding pad silences it instead of restriking.
    if (mode === 'toggle' && map[pad.id]) {
      drumNoteOff(control, pad.id);
      syncDrumSession(control, null);
      return;
    }
    // Choke: this pad's group-mates stop first.
    for (const other of chokedBy(drumPads(control), pad)) {
      if (map[other.id]) drumNoteOff(control, other.id);
    }
    if (map[pad.id]) drumNoteOff(control, pad.id);        // restrike cleanly
    // A corner action may have decided the velocity already (accent, ghost) or forced a roll on a
    // pad that does not carry the flag.
    const strikeVel = opts?.velocity != null
      ? Math.max(1, Math.min(127, Math.round(opts.velocity)))
      : strikeVelocity(control, strikeY);
    sendNoteBytes(noteOnBytes(ch, pad.note, strikeVel), `note_on_${pad.note}`);
    map[pad.id] = { note: pad.note, mode, velocity: strikeVel };
    raiseComponent(control, 'onHit', { id: pad.id, note: pad.note, notes: [pad.note], velocity: strikeVel });
    startDrumRoll(control, pad, mode, opts?.roll === true);
    if (mode === 'oneShot') {
      (drumTimers[id] ??= []).push(setTimeout(() => {
        drumNoteOff(control, pad.id);
        syncDrumSession(control);
      }, drumGateMs(control)));
    }
    syncDrumSession(control, { label: pad.label, note: pad.note });
  }
  /**
   * One strike of a roll: off, then on again, at the roll velocity.
   *
   * The note-off matters. A drum sound is usually one-shot on the synth side, but a pad in
   * 'momentary' holds its note until release, so a bare second note-on would leave the first
   * hanging — the same reason drumHit restrikes cleanly rather than stacking.
   *
   * The opening strike keeps its own velocity and the repeats sit under it, which is what makes a
   * roll read as an accent followed by a buzz rather than as a machine gun.
   */
  function restrikeDrumPad(control, pad) {
    const id = getControlId(control);
    const held = (drumHits[id] ?? {})[pad.id];
    if (!held) { stopDrumRoll(id, pad.id); return; }
    const cfg = drumConfig(control);
    const ch = drumChannel(control);
    const vel = rollVelocity(cfg, held.velocity ?? drumVelocity(control));
    sendNoteBytes(noteOffBytes(ch, held.note), `note_off_${held.note}`);
    sendNoteBytes(noteOnBytes(ch, held.note, vel), `note_on_${held.note}`);
    raiseComponent(control, 'onHit',
      { id: pad.id, note: held.note, notes: [held.note], velocity: vel, roll: true });
  }

  function startDrumRoll(control, pad, mode, forced = false) {
    const cfg = drumConfig(control);
    if (!forced && !padRolls(cfg, pad, mode)) return;
    // A corner-forced roll still obeys the mode rule: there is no "while held" on a one-shot.
    if (forced && !padRolls(cfg, { roll: true }, mode)) return;
    const key = drumRollKey(getControlId(control), pad.id);
    drumRolling[key] = { control, pad };
    // Synced to the panel transport when there is one to sync to, exactly as the Arpeggiator's
    // steps are — so a roll set to 1/32 is a 1/32 and stays one when the tempo moves.
    drumRollClock.start(key, {
      delay: rollDelayMs(cfg),
      interval: rollIntervalMs(cfg, cfg.rollSync !== false ? transportBpmNow() : null),
    });
  }

  function stopDrumRoll(id, padId) {
    const key = drumRollKey(id, padId);
    drumRollClock.stop(key);
    delete drumRolling[key];
  }

  /**
   * One strike, with the corner vocabulary applied.
   *
   * Returns whether the pad is now SOUNDING — false for a strike that consumed itself, which is
   * `choke`: grabbing a cymbal silences the group and makes no sound of its own, so there is no
   * press to hold and no note to release.
   *
   * Everything else ends in the ordinary drumHit, which is what keeps one path for choke groups,
   * toggling, restrikes, the one-shot gate and the roll clock. A corner that forked into its own
   * note-sending code would be a second implementation of all of that.
   */
  function drumStrike(control, hit) {
    const cfg = drumConfig(control);
    const { action } = strikeAction(cfg, hit.strikeX, hit.strikeY);
    const base = strikeVelocity(control, hit.strikeY, hit.strikeX);

    switch (action) {
      case 'choke': {
        // Silence this pad's group — including the pad itself if it is ringing — and sound nothing.
        for (const other of chokedBy(drumPads(control), hit.pad)) drumNoteOff(control, other.id);
        drumNoteOff(control, hit.pad.id);
        syncDrumSession(control, null);
        raiseComponent(control, 'onRelease',
          { id: hit.pad.id, note: hit.pad.note, notes: [hit.pad.note], choke: true });
        return false;
      }
      case 'accent':
        drumHit(control, hit.pad, hit.strikeY, { velocity: drumVelocity(control), roll: false });
        return true;
      case 'ghost':
        drumHit(control, hit.pad, hit.strikeY, { velocity: ghostVelocity(cfg, base), roll: false });
        return true;
      case 'flam': {
        // A grace note just before the main one. Quiet, and it does NOT choke — a flam is one
        // gesture, and letting the grace note cut its own main hit would silence the thing it is
        // decorating.
        const ch = drumChannel(control);
        const grace = ghostVelocity(cfg, base);
        sendNoteBytes(noteOnBytes(ch, hit.pad.note, grace), `note_on_${hit.pad.note}`);
        (drumTimers[getControlId(control)] ??= []).push(setTimeout(() => {
          sendNoteBytes(noteOffBytes(ch, hit.pad.note), `note_off_${hit.pad.note}`);
          drumHit(control, hit.pad, hit.strikeY, { velocity: base, roll: false });
        }, flamMs(cfg)));
        return true;
      }
      case 'roll':
        // The corner rolls whether or not the pad's own flag does. Both are true unions of the
        // same thing: "this strike should repeat".
        drumHit(control, hit.pad, hit.strikeY, { velocity: base, roll: true });
        return true;
      default:
        drumHit(control, hit.pad, hit.strikeY);
        return true;
    }
  }

  // The pad under a point, plus how high up it you struck.
  function drumPadAtPoint(control, localPoint) {
    const geom = drumGeomFor(control);
    const i = padHit(geom, localPoint.x, localPoint.y, drumOrigin(control));
    if (i < 0) return null;
    const pads = drumPads(control);
    if (!pads[i]) return null;
    const rect = padRect(geom, i, drumOrigin(control));
    return {
      pad: pads[i],
      strikeY: padStrikeY(rect, localPoint.y),
      strikeX: padStrikeX(rect, localPoint.x),
    };
  }
  function handleDrumPadsPointerDown(control, localPoint) {
    if (!isDrumPadsControl(control) || drumConfig(control).editable === false) return false;
    const hit = drumPadAtPoint(control, localPoint);
    if (!hit) return false;
    // A corner action may consume the strike entirely — `choke` silences the group and sounds
    // nothing, so there is no press to track afterwards.
    if (!drumStrike(control, hit)) return true;
    if (drumMode(control) === 'momentary') drumPress = { id: getControlId(control), padId: hit.pad.id };
    return true;
  }
  // Drag across the grid to strike each pad you cross — the finger-roll gesture.
  function moveDrumPress(control, localPoint) {
    const hit = drumPadAtPoint(control, localPoint);
    if (!hit || hit.pad.id === drumPress.padId) return;
    drumNoteOff(control, drumPress.padId);
    if (drumStrike(control, hit)) drumPress.padId = hit.pad.id;
  }
  function releaseDrumPress(control) {
    if (drumMode(control) !== 'momentary') return;   // one-shots and toggles ring on
    drumNoteOff(control, drumPress.padId);
    syncDrumSession(control);
  }
  // --- Setlist: an ordered list of panel states, advanced by a footswitch --------
  // Unglamorous, and the thing people actually need on stage. The one rule that
  // has to be right is the footswitch EDGE: a momentary pedal sends 127 on press
  // and 0 on release, and acting on both steps the list twice per press.
  const setlistFootDown = {};     // id -> is the pedal currently held
  const setlistCcSeen = {};       // id -> midiRouteEvents.seq consumed
  const setlistIndexSeen = {};    // id -> the index we last recalled for
  const setlistBackDown = {};     // id -> is the BACK pedal held
  const setlistFadeTimers = {};   // id -> [intervalId…] for a value crossfade
  // A fade in flight writes through updateControlProperty, which reaches the ValueTree and
  // the undo stack. Left running past teardown it would keep editing the document — and
  // stack undo entries — for a surface that no longer exists.
  onDestroy(() => {
    for (const timers of Object.values(setlistFadeTimers)) timers.forEach(clearInterval);
  });
  function isSetlistControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Setlist';
  }
  function setlistGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    const cfg = setlistConfig(control);
    return setlistGeometry(numberOr(t.width, 0), numberOr(t.height, 0), setlistCount(control), 8,
      cfg.showHeader === false ? 0 : 20, Math.max(12, Math.round(numberOr(cfg.rowHeight, 18))));
  }
  // Recall: MIDI first, then the panel values, then the tempo. A program change
  // swaps the patch on the synth, and the stored values belong to that patch —
  // sending them first would write them into the old one.
  function recallScene(control, index) {
    const plan = recallPlan(control, index);
    if (!plan.scene) return;
    for (const m of plan.messages) {
      triggerRawMidiAction({
        deviceRole: 'mainSynth',
        actionId: `setlist_${m.kind}`,
        message: bytesToHex(m.bytes),
        dryRun: false,
      });
    }
    const fadeMs = crossfadeMs(control);
    if (fadeMs <= 0) {
      writeSceneValues(plan.values);
    } else {
      // Read the current values FIRST — they are the start of the fade, and a
      // moment later they are already the fade's own output.
      const from = {};
      for (const path of Object.keys(plan.values)) {
        const v = readScenePath(path);
        if (v !== undefined) from[path] = v;
      }
      const id = getControlId(control);
      for (const t of setlistFadeTimers[id] ?? []) clearInterval(t);
      const startedAt = Date.now();
      const tick = setInterval(() => {
        const pos = Math.min(1, (Date.now() - startedAt) / fadeMs);
        writeSceneValues(blendValues(from, plan.values, pos));
        if (pos >= 1) {
          clearInterval(tick);
          setlistFadeTimers[id] = (setlistFadeTimers[id] ?? []).filter((x) => x !== tick);
        }
      }, 25);
      (setlistFadeTimers[id] ??= []).push(tick);
    }
    if (plan.bpm !== null && plan.bpm !== undefined) setTransportBpm(plan.bpm);
  }
  // Moving the index is ALL these do. The recall is driven by the index
  // changing (see pumpSetlistIndex), so the pedal, a click, a script and a hand
  // edit in the inspector all take the same path and cannot diverge.
  function sceneTargetFor(path) {
    const dot = String(path).indexOf('.');
    if (dot <= 0) return null;
    const name = String(path).slice(0, dot);
    const target = (orderedControls ?? []).find((c) => String(c?._children?.Core?.name ?? '') === name);
    return target ? { target, rest: String(path).slice(dot + 1) } : null;
  }
  function writeSceneValues(values) {
    for (const [path, value] of Object.entries(values ?? {})) {
      const hit = sceneTargetFor(path);
      if (hit) updateControlProperty(getControlId(hit.target), hit.rest, value);
    }
  }
  function readScenePath(path) {
    const hit = sceneTargetFor(path);
    if (!hit) return undefined;
    let node = hit.target?._children;
    for (const seg of hit.rest.split('.')) {
      if (node == null) return undefined;
      node = node[seg] !== undefined ? node[seg] : node?._children?.[seg];
    }
    return node;
  }
  function setlistGo(control, index) {
    const next = gotoIndex(setlistScenes(control), index);
    if (next < 0) return;
    updateControlProperty(getControlId(control), 'Setlist.index', next);
  }
  function setlistStep(control, delta) {
    const next = stepIndex(setlistScenes(control), setlistIndex(control), delta, setlistWraps(control));
    if (next < 0 || next === setlistIndex(control)) return;
    updateControlProperty(getControlId(control), 'Setlist.index', next);
  }
  // Watch the index and recall when it moves. The first sighting only
  // BASELINES: recalling on panel load would fire a program change at the synth
  // every time you open the editor, which is not what opening a panel means.
  function pumpSetlistIndex(control) {
    const id = getControlId(control);
    const now = setlistIndex(control);
    const seen = setlistIndexSeen[id];
    setlistIndexSeen[id] = now;
    if (seen === undefined || seen === now || now < 0) return;
    recallScene(control, now);
    // On the recall, so a scripted jump, a click and a footswitch are one event downstream.
    const scene = setlistScenes(control)[now];
    raiseComponent(control, 'onScene', { index: now + 1, name: String(scene?.name ?? '') });
  }
  // The pedal. Read off the router's EVENT store, not the expression state
  // store: a stepper has to see each message once, when it arrives.
  function pumpSetlistFoot(control) {
    const cfg = setlistConfig(control);
    if (cfg.footEnabled === false) return;
    ensureNoteInput();
    const id = getControlId(control);
    const batch = $midiRouteEvents;
    if (setlistCcSeen[id] === batch.seq) return;
    setlistCcSeen[id] = batch.seq;
    if (!batch.seq) return;
    for (const ev of batch.events) {
      // Two pedals, two held-state booleans. Sharing one would have each
      // pedal's release cancel the other's press.
      const back = footswitchBackEdge(control, ev, setlistBackDown[id] === true);
      setlistBackDown[id] = back.down;
      if (back.step) { setlistStep(control, -1); continue; }
      const r = footswitchEdge(control, ev, setlistFootDown[id] === true);
      setlistFootDown[id] = r.down;
      if (!r.step) continue;
      const action = String(cfg.footAction ?? 'next');
      if (action === 'prev') setlistStep(control, -1);
      else if (action === 'goto') setlistGo(control, Math.round(numberOr(cfg.footGoto, 0)));
      else setlistStep(control, 1);
    }
  }
  function applySetlistValueSource(control, resolved) {
    if (!isSetlistControl(control)) return resolved;
    const base = resolved?.control ?? control;
    if (!base?._children?.Setlist) return resolved;
    pumpSetlistFoot(control);
    pumpSetlistIndex(control);
    return resolved;
  }
  // Click a row to jump to it. On stage you use the pedal; in the editor you
  // click, and both go through the same recall.
  function handleSetlistPointerDown(control, localPoint) {
    if (!isSetlistControl(control) || setlistConfig(control).editable === false) return false;
    const row = rowAtPoint(setlistGeomFor(control), Math.max(0, setlistIndex(control)), localPoint.x, localPoint.y);
    if (row === null) return false;
    setlistGo(control, row);
    return true;
  }

  // --- Harmoniser: one finger in, a chord out ------------------------------------
  // Mostly assembly — the Chord Pad's scale engine, the note-input path, the
  // note-output path. The work is in the bookkeeping, and it is not the usual
  // bookkeeping: as well as "a note-off releases what its note-on sent", two
  // input notes a third apart produce OVERLAPPING chords, so sounding pitches
  // are reference counted. Releasing one finger must not stop notes the other
  // is still holding.
  const harmHeld = {};            // id -> pure held state (see harmoniserLayout)
  const harmSeen = {};            // id -> midiNoteState.seq consumed
  let harmKeyPress = null;        // { id, note } — a key auditioned with the mouse
  const harmTimers = {};          // id -> [timeoutId…] for strummed note-ons
  const harmXSeen = {};           // id -> midiRouteEvents.seq consumed
  function isHarmoniserControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Harmoniser';
  }
  function harmInputChannel(control) {
    return Math.max(0, Math.round(numberOr(harmoniserConfig(control).inputChannel, 0)));
  }
  function runHarmSends(control, sends) {
    // Strum spreads the note-ons over a few milliseconds. Note-OFFs are never
    // strummed: a chord that lets go raggedly sounds like a fault, where one
    // that arrives raggedly sounds like a guitar.
    const ons = sends.filter((m) => m.kind === 'on');
    const delays = strumDelays(control, ons.length);
    let oi = 0;
    for (const m of sends) {
      if (m.kind !== 'on') { sendNoteBytes(noteOffBytes(m.channel, m.note), `harm_off_${m.note}`, 'Harmoniser'); continue; }
      const d = delays[oi] ?? 0;
      oi += 1;
      if (d <= 0) { sendNoteBytes(noteOnBytes(m.channel, m.note, m.velocity), `harm_on_${m.note}`, 'Harmoniser'); continue; }
      (harmTimers[getControlId(control)] ??= []).push(setTimeout(() => {
        sendNoteBytes(noteOnBytes(m.channel, m.note, m.velocity), `harm_on_${m.note}`, 'Harmoniser');
      }, d));
    }
  }
  // Pitch bend and aftertouch arriving on the input, forwarded to the channel
  // the chord is on. The harmoniser has no note to attribute them to and needs
  // none: everything it plays is on one channel, so "all of it or none" is the
  // only rule there is — which is why this is a switch rather than the Zone
  // Splitter's four-way attribution.
  function pumpHarmExpression(control) {
    const cfg = harmoniserConfig(control);
    if (cfg.forwardBend !== true && cfg.forwardPressure !== true) return;
    const id = getControlId(control);
    const batch = $midiRouteEvents;
    if (harmXSeen[id] === batch.seq) return;
    harmXSeen[id] = batch.seq;
    if (!batch.seq) return;
    const inCh = harmInputChannel(control);
    const outCh = harmoniserChannel(control);
    for (const ev of batch.events) {
      if (inCh && ev.channel !== inCh) continue;
      if (ev.kind === 'bend' && cfg.forwardBend === true) {
        // All fourteen bits: re-sending seven would turn a glide into a
        // staircase, which is the thing a bend wheel exists to avoid.
        const v = Math.max(0, Math.min(16383, Math.round(numberOr(ev.value14 ?? ev.value, 8192))));
        sendNoteBytes([0xE0 | (outCh - 1), v & 0x7F, (v >> 7) & 0x7F], 'harm_bend', 'Harmoniser');
      } else if (ev.kind === 'aftertouch' && cfg.forwardPressure === true) {
        sendNoteBytes([0xD0 | (outCh - 1), Math.max(0, Math.min(127, Math.round(numberOr(ev.value, 0))))], 'harm_at', 'Harmoniser');
      }
    }
  }
  function harmAllOff(control) {
    const id = getControlId(control);
    for (const t of harmTimers[id] ?? []) clearTimeout(t);
    harmTimers[id] = [];
    const r = releaseAllHarmony(harmHeld[id] ?? EMPTY_HELD);
    harmHeld[id] = r.held;
    harmKeyPress = harmKeyPress?.id === id ? null : harmKeyPress;
    runHarmSends(control, r.sends);
  }
  /** The voices a reconcile produced for a played note, if any. Raised from the two places that
   *  run harmony sends, so a pressed key and a mouse-held one report alike. */
  function raiseHarmVoiced(control, sends, played) {
    const ons = sends.filter((m) => m.kind === 'on');
    if (!ons.length || played === null || played === undefined) return;
    raiseComponent(control, 'onVoiced', {
      note: played, velocity: ons[0].velocity, out: ons.map((m) => m.note),
      channel: ons[0].channel, zones: [],
    });
  }
  // Consume the live held-note state, the same reconcile the Zone Splitter does.
  function pumpHarmInput(control) {
    ensureNoteInput();
    const id = getControlId(control);
    const seq = $midiNoteState.seq;
    const keep = harmKeyPress && harmKeyPress.id === id ? harmKeyPress.note : null;
    // The mouse-held key has no sequence number of its own, so a press has to
    // be reconciled even when the input store hasn't moved.
    if (harmSeen[id] === seq && keep === null) return;
    harmSeen[id] = seq;
    const entries = inputHeldEntries($midiNoteState.notes, harmInputChannel(control));
    const r = reconcileHarmony(harmHeld[id] ?? EMPTY_HELD, control, entries, keep);
    if (r.held !== (harmHeld[id] ?? EMPTY_HELD)) harmHeld[id] = r.held;
    runHarmSends(control, r.sends);
    // The note that caused it: the newly-held key, or the mouse-held one.
    const played = keep ?? entries.find((e) => !(harmHeld[id]?.[e.note]))?.note ?? entries[0]?.note;
    raiseHarmVoiced(control, r.sends, played ?? null);
  }
  function applyHarmoniserValueSource(control, resolved) {
    if (!isHarmoniserControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const cfg = base?._children?.Harmoniser;
    if (!cfg) return resolved;
    pumpHarmInput(control);
    pumpHarmExpression(control);
    const id = getControlId(control);
    const held = harmHeld[id] ?? EMPTY_HELD;
    const next = {
      ...cfg,
      __sounding: soundingPitches(held),
      __played: heldInputNotes(held),
    };
    return { ...resolved, control: { ...base, _children: { ...base._children, Harmoniser: next } } };
  }
  // Click a key to audition the harmony — most of the editor's life is spent
  // with no keyboard plugged in.
  function handleHarmoniserPointerDown(control, localPoint) {
    if (!isHarmoniserControl(control) || harmoniserConfig(control).editable === false) return false;
    const cfg = harmoniserConfig(control);
    const id = getControlId(control);
    const held = harmHeld[id] ?? EMPTY_HELD;
    const t = control?._children?.Transform ?? {};
    const range = harmoniserRange(held, control,
      Math.max(0, Math.round(numberOr(cfg.displayLow, 48))),
      Math.max(12, Math.round(numberOr(cfg.displaySpan, 24))));
    const keys = harmoniserKeys(range, numberOr(t.width, 0), numberOr(t.height, 0), 8,
      cfg.showHeader === false ? 0 : 22);
    // Back to front, so a black key wins over the white it overlaps — it is
    // drawn on top, so it has to be hit first.
    const hit = [...keys].reverse().find((k) => localPoint.x >= k.x && localPoint.x <= k.x + k.w
      && localPoint.y >= k.y && localPoint.y <= k.y + k.h);
    if (!hit) return false;
    harmKeyPress = { id, note: hit.note };
    pumpHarmInput(control);
    return true;
  }
  function releaseHarmoniserPress() {
    if (!harmKeyPress) return;
    const control = (orderedControls ?? []).find((c) => getControlId(c) === harmKeyPress.id);
    harmKeyPress = null;
    if (control) pumpHarmInput(control);
  }

  // --- Phrase Recorder: capture what you played, loop it -------------------------
  // The note twin of the Gesture Looper. Two capture sources, deliberately
  // different in kind:
  //   · the MIDI INPUT, diffed off the shared held-note store the same way the
  //     Zone Splitter reconciles — one subscription feeds every recorder;
  //   · the PANEL's own output, off the noteOutput tap, which every note control
  //     already funnels through.
  // The live take lives in the session while recording and is committed to the
  // model when recording ends. Writing the model on every note would put a
  // hundred undo steps in the history for one four-bar phrase.
  const recorderTakeLive = {};    // id -> take being recorded (session truth)
  const recorderPhaseState = {};  // id -> phase 0..1
  const recorderPrevPhase = {};   // id -> previous frame's phase, for the play window
  const recorderSounding = {};    // id -> { "channel:note": true } currently played back
  const recorderTimers = {};      // id -> [timeoutId…] for playback note-offs
  const recorderHeldSeen = {};    // id -> midiNoteState.seq consumed
  const recorderHeldNotes = {};   // id -> Set of input notes seen held last time
  const recorderTapSeen = {};     // id -> noteOutputEvents.seq consumed
  const recorderArmedLaps = {};   // id -> laps spent armed, for the count-in
  const recorderChainLap = {};    // id -> the chain lap we last resolved
  const recorderJumpState = {};   // id -> transport jump counter seen
  const recorderBeatsState = {};
  let recorderTickerRunning = false;
  let recorderLastMs = 0;
  function isRecorderControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Recorder';
  }
  function recorderControls() {
    return (orderedControls ?? []).filter((c) => isRecorderControl(c));
  }
  function liveTakeFor(control) {
    const id = getControlId(control);
    return recorderTakeLive[id] ?? recorderTake(control);
  }
  function setLiveTake(control, take) {
    const id = getControlId(control);
    recorderTakeLive[id] = take;
    patchControlSession(id, { recorderTake: take });
  }
  // Commit to the model — one undo step for the whole take, at the moment it
  // stops being edited.
  function commitTake(control) {
    const id = getControlId(control);
    const take = recorderTakeLive[id];
    if (!take) return;
    updateControlProperty(id, 'Recorder.take', { events: take.events, pending: {} });
  }
  // Every path into a state change goes through here — a click, a script verb, the count-in
  // promotion, the once-through stop — so it is the one place onStage is raised from, and no
  // caller has to remember to.
  function setRecorderState(control, next) {
    // Reported here rather than through raiseComponentStage: this is an explicit TRANSITION with a
    // known previous state, so the first one has to fire. raiseComponentStage baselines its first
    // sighting, which is right for a stage that is polled and wrong for one that is set.
    const previous = String(recorderState(control) ?? '');
    const stage = String(next ?? '');
    if (stage !== previous) {
      componentLastStage[getControlId(control)] = stage;
      raiseComponent(control, 'onStage', { stage, previous });
    }
    updateControlProperty(getControlId(control), 'Recorder.state', next);
  }
  function recorderAllOff(control) {
    const id = getControlId(control);
    for (const t of recorderTimers[id] ?? []) clearTimeout(t);
    recorderTimers[id] = [];
    for (const key of Object.keys(recorderSounding[id] ?? {})) {
      const [ch, note] = key.split(':').map(Number);
      sendNoteBytes(noteOffBytes(ch, note), `rec_off_${note}`, 'Recorder', id);
    }
    recorderSounding[id] = {};
    // Anything still held when we stop gets closed, so the take has no event
    // without an end — that would play as a stuck note on every future lap.
    const live = recorderTakeLive[id];
    if (live && Object.keys(live.pending).length) {
      setLiveTake(control, closeOpenNotes(live, recorderPhaseState[id] ?? 0));
      commitTake(control);
    }
  }
  // Record one note into the live take. `t` is the phase it happened at.
  function captureNote(control, kind, channel, note, velocity, atMs = 0) {
    const state = recorderState(control);
    if (!isRecordingState(state)) return;
    const id = getControlId(control);
    // Wind the position back to when the note actually arrived, not when this
    // frame noticed it. Panel-played notes are captured in the same tick they
    // are sent, so they pass 0 and use the live phase.
    const live = recorderPhaseState[id] ?? 0;
    const t = atMs > 0
      ? phaseAtTime(live, Date.now(), atMs,
          recorderLoopSeconds(control, recorderSynced(control) ? transportBpmNow() : null, transportBeatsPerBar()))
      : live;
    const prior = liveTakeFor(control);
    const pass = nextPassFor(prior, state);
    const next = kind === 'on'
      ? recordNoteOn(prior, t, channel, note, velocity, pass)
      : recordNoteOff(prior, t, channel, note);
    if (next !== prior) setLiveTake(control, next);
  }
  // Capture from the hardware input. The store is STATE with a sequence number,
  // so arrival is derived by diffing what is held now against what was held
  // when we last looked — the same reconcile the splitter does.
  function pumpRecorderInput(control) {
    const src = String(recorderConfig(control).source ?? 'both');
    if (src !== 'input' && src !== 'both') return;
    ensureNoteInput();
    const id = getControlId(control);
    const seq = $midiNoteState.seq;
    if (recorderHeldSeen[id] === seq) return;
    recorderHeldSeen[id] = seq;
    const entries = inputHeldEntries($midiNoteState.notes, 0);
    const now = new Map(entries.map((e) => [`${e.channel ?? 1}:${e.note}`, e]));
    const before = recorderHeldNotes[id] ?? new Map();
    for (const [key, e] of now) {
      if (!before.has(key)) captureNote(control, 'on', e.channel ?? 1, e.note, e.velocity ?? 100, e.at ?? 0);
    }
    for (const [key, e] of before) {
      // A note-off has no entry left to carry a stamp, so the release is
      // frame-resolution. That moves a note's LENGTH by a frame at worst; a
      // missed onset would move the note itself, which is what mattered.
      if (!now.has(key)) captureNote(control, 'off', e.channel ?? 1, e.note, 0);
    }
    recorderHeldNotes[id] = now;
  }
  // Capture from the panel's own note controls, through the single funnel every
  // one of them sends on.
  function pumpRecorderTap(control) {
    const src = String(recorderConfig(control).source ?? 'both');
    if (src !== 'panel' && src !== 'both') return;
    const id = getControlId(control);
    const batch = $noteOutputEvents;
    if (recorderTapSeen[id] === batch.seq) return;
    recorderTapSeen[id] = batch.seq;
    if (!batch.seq) return;
    for (const ev of batch.events) {
      // A recorder never records a recorder. Two of them pointed at each other
      // would feed each other forever, doubling the take on every lap.
      if (ev.sourceType === 'Recorder') continue;
      captureNote(control, ev.kind, ev.channel, ev.note, ev.velocity);
    }
  }
  // Play everything that starts in (prev, now]. Note-offs are timers off the
  // event's own recorded length, so a legato take stays legato.
  function playRecorderWindow(control, prev, now, loopSecs) {
    if (!recorderPlaying(control)) return;
    const id = getControlId(control);
    const take = liveTakeFor(control);
    if (!take.events.length) return;
    const ch = recorderChannel(control);
    for (const ev of eventsInWindow(take.events, prev, now)) {
      const note = playedNote(control, ev);
      if (note === null) continue;              // transposed off the end: dropped, not clamped
      const key = `${ch}:${note}`;
      // The same pitch already sounding from an earlier overlapping event: stop
      // it first, or its note-off will cut the new one short.
      if (recorderSounding[id]?.[key]) sendNoteBytes(noteOffBytes(ch, note), `rec_off_${note}`, 'Recorder', id);
      sendNoteBytes(noteOnBytes(ch, note, playedVelocity(control, ev)), `rec_on_${note}`, 'Recorder', id);
      (recorderSounding[id] ??= {})[key] = true;
      const ms = eventSeconds(ev, loopSecs) * 1000;
      (recorderTimers[id] ??= []).push(setTimeout(() => {
        if (!recorderSounding[id]?.[key]) return;
        sendNoteBytes(noteOffBytes(ch, note), `rec_off_${note}`, 'Recorder', id);
        delete recorderSounding[id][key];
      }, ms));
    }
  }
  function ensureRecorderTicker() {
    if (recorderTickerRunning) return;
    recorderTickerRunning = true;
    recorderLastMs = Date.now();
    const loop = () => {
      const all = recorderControls();
      if (!all.length) { recorderTickerRunning = false; return; }
      const now = Date.now();
      const dt = Math.min(0.25, Math.max(0, (now - recorderLastMs) / 1000));
      recorderLastMs = now;
      for (const c of all) {
        const id = getControlId(c);
        const bpm = transportBpmNow();
        const loopSecs = recorderLoopSeconds(c, recorderSynced(c) ? bpm : null, transportBeatsPerBar());
        const prev = recorderPhaseState[id] ?? 0;
        let next = prev;
        if (recorderSynced(c)) {
          // Position in, phase out — the rule every follower here obeys. A
          // locate re-baselines rather than replaying the bars it skipped.
          const beats = transportBeatsNow();
          const jump = transportJumpSeq();
          const jumped = recorderJumpState[id] !== jump;
          recorderJumpState[id] = jump;
          const barBeats = recorderBars(c) * transportBeatsPerBar();
          next = ((Math.max(0, beats) / barBeats) % 1 + 1) % 1;
          const hadPrev = recorderBeatsState[id] !== undefined;
          recorderBeatsState[id] = beats;
          if (jumped || !hadPrev || !isTransportRunning()) {
            recorderPhaseState[id] = next;
            recorderPrevPhase[id] = next;
            continue;
          }
        } else {
          next = ((prev + dt / Math.max(0.05, loopSecs)) % 1 + 1) % 1;
        }
        recorderPhaseState[id] = next;
        if (next < prev) pumpRecorderChain(c, id);
        // The seam. Everything that has to happen exactly once per lap happens
        // here: the arm→record promotion, the once-through stop, and the commit.
        if (next < prev) {
          const state = recorderState(c);
          // Laps spent waiting, so a count-in can span more than one.
          const waited = state === 'armed' ? (recorderArmedLaps[id] ?? 0) : 0;
          const after = onLoopBoundary(state, {
            hadEvents: !takeIsEmpty(liveTakeFor(c)),
            once: recorderConfig(c).once === true,
            lapsWaited: waited,
            countInLaps: countInLaps(c),
          });
          recorderArmedLaps[id] = after === 'armed' ? waited + 1 : 0;
          if (after !== state) {
            setRecorderState(c, after);
            if (!isRecordingState(after)) { recorderAllOffPending(c); }
          }
        }
        playRecorderWindow(c, prev, next, loopSecs);
        recorderPrevPhase[id] = next;
      }
      orbitClock = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  // Song mode for the recorder: the same chain engine, pointed at take slots
  // instead of patterns. A chain never runs while recording — swapping the take
  // out from under a pass would lose it.
  function pumpRecorderChain(control, id) {
    if (recorderConfig(control).chainOn !== true) return;
    if (isRecordingState(recorderState(control))) return;
    const chain = recorderConfig(control).chain;
    if (!Array.isArray(chain) || !chain.length) return;
    const loop = recorderConfig(control).chainLoop !== false;
    const lap = (recorderChainLap[id] ?? -1) + 1;
    const seen = recorderChainLap[id];
    recorderChainLap[id] = lap;
    if (seen !== undefined && !chainSwitches(chain, seen, lap, loop)) return;
    const slot = slotForLap(chain, lap, loop);
    if (slot === null) return;
    const take = loadSlot(recorderConfig(control).slots, slot);
    recorderAllOff(control);
    setLiveTake(control, take);
  }
  // Recording just ended: close anything held and write the take to the model.
  function recorderAllOffPending(control) {
    const id = getControlId(control);
    const live = recorderTakeLive[id];
    if (!live) return;
    const closed = closeOpenNotes(live, recorderPhaseState[id] ?? 0);
    if (closed !== live) setLiveTake(control, closed);
    commitTake(control);
  }
  function applyRecorderValueSource(control, resolved) {
    if (!isRecorderControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const cfg = base?._children?.Recorder;
    if (!cfg) return resolved;
    ensureRecorderTicker();
    void orbitClock;
    pumpRecorderInput(control);
    pumpRecorderTap(control);
    const id = getControlId(control);
    const next = { ...cfg, __phase: recorderPhaseState[id] ?? 0 };
    const sess = sessionFor(control);
    if (sess?.recorderTake) next.take = sess.recorderTake;
    return { ...resolved, control: { ...base, _children: { ...base._children, Recorder: next } } };
  }
  // Click the roll to arm; click again to change your mind. Everything else is
  // in the inspector, because a transport you can mis-hit while playing is
  // worse than one you have to reach for.
  function handleRecorderPointerDown(control, localPoint) {
    if (!isRecorderControl(control) || recorderConfig(control).editable === false) return false;
    void localPoint;
    const state = recorderState(control);
    const next = toggleRecordState(state, !takeIsEmpty(liveTakeFor(control)));
    setRecorderState(control, next);
    if (!isRecordingState(next)) recorderAllOffPending(control);
    ensureRecorderTicker();
    return true;
  }

  // --- Phrase Sequencer: notes on a grid ----------------------------------------
  // The third note-emitting family member with a clock, after the Arp and the
  // Turing — and it shares their rule: the step index is derived from a rising
  // number (the transport position when synced, a free-running counter when
  // not), never stored, so a direction change or a stall can't corrupt a cursor.
  //
  // Note-off bookkeeping is the same trap as the Zone Splitter's, with a
  // different trigger: editing the key, scale, transpose or base octave while it
  // plays changes what a row MEANS, so a re-derived off would release a pitch
  // that was never started. playStep() therefore remembers what it sent.
  const PHRASE_PAD = 8;
  const phraseSounding = {};      // id -> pure sounding map (see phraseLayout)
  const phraseIndexState = {};    // id -> last fired sequence index
  const phraseLastIdx = {};       // id -> the index before it, so a wrap can raise onCycle
  const phraseBeatsState = {};    // id -> last transport reading, when synced
  const phraseJumpState = {};     // id -> transport jump counter seen
  const phraseFreeIndex = {};     // id -> free-running index accumulator
  const phraseTimers = {};        // id -> [timeoutId…] for gate note-offs
  const phraseChainLap = {};      // id -> the chain lap we last resolved
  let phraseTickerRunning = false;
  let phraseLastMs = 0;
  function isPhraseControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Phrase';
  }
  function phraseControls() {
    return (orderedControls ?? []).filter((c) => isPhraseControl(c));
  }
  function phraseGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    const cfg = phraseConfig(control);
    return phraseGeometry(numberOr(t.width, 0), numberOr(t.height, 0),
      phraseSteps(control), phraseRows(control), PHRASE_PAD,
      cfg.showHeader !== false ? 20 : 0, cfg.showGutter !== false ? 26 : 0);
  }
  function runPhraseSends(control, index, sends, bpm) {
    const id = getControlId(control);
    const secs = phraseStepSeconds(control, bpm);
    const gateMs = phraseGateSeconds(control, secs) * 1000;
    const gates = gateMs < secs * 1000 - 2;      // a full gate is legato: no early off
    for (const m of sends) {
      if (m.kind === 'off') { sendNoteBytes(noteOffBytes(m.channel, m.note), `phrase_off_${m.note}`); continue; }
      sendNoteBytes(noteOnBytes(m.channel, m.note, m.velocity), `phrase_on_${m.note}`);
      // A note the next step is about to TIE must not be cut short — that is the
      // whole point of a tie — so it skips the gate and rides to the boundary.
      const tied = tiesForward(control, index, m.row);
      // A tied note is never ratcheted: holding it and retriggering it are
      // opposite instructions, and the tie is the one you asked for last.
      const offsets = tied ? [0] : ratchetOffsets(m, secs);
      // Extra hits inside the step. The first is the note-on already sent.
      for (let h = 1; h < offsets.length; h += 1) {
        (phraseTimers[id] ??= []).push(setTimeout(() => {
          sendNoteBytes(noteOffBytes(m.channel, m.note), `phrase_ratchet_off_${m.note}`);
          sendNoteBytes(noteOnBytes(m.channel, m.note, m.velocity), `phrase_ratchet_${m.note}`);
        }, offsets[h] * 1000));
      }
      if (tied) continue;
      // A cell's own length overrides the pattern gate and may deliberately
      // outlast its step, so the "a full gate is legato" shortcut only applies
      // to notes still using the pattern's.
      const ownGateMs = noteGateSeconds(control, m, secs) * 1000;
      const ratcheted = offsets.length > 1;
      if (!gates && m.length === null && !ratcheted) continue;
      const lastMs = ratcheted
        ? offsets[offsets.length - 1] * 1000 + Math.max(5, (secs * 1000 / offsets.length) * 0.8)
        : ownGateMs;
      (phraseTimers[id] ??= []).push(setTimeout(() => {
        const held = phraseSounding[id]?.[`${m.row}`];
        if (!held || held.note !== m.note) return;   // already released, or moved on
        sendNoteBytes(noteOffBytes(m.channel, m.note), `phrase_gate_${m.note}`);
        const next = { ...phraseSounding[id] };
        delete next[`${m.row}`];
        phraseSounding[id] = next;
      }, lastMs));
    }
  }
  function phraseFireIndex(control, index, bpm) {
    const id = getControlId(control);
    // Swing delays the odd steps. The step is worked out at fire time rather
    // than captured now, so a pattern edited during the delay plays as edited —
    // and the pending timer lives in phraseTimers so Panic can cancel it.
    const fire = () => {
      const r = phrasePlayStep(phraseSounding[id] ?? PHRASE_EMPTY, control, index);
      phraseSounding[id] = r.sounding;
      runPhraseSends(control, index, r.sends, bpm);
    };
    // The playing column lights on the beat even when the note is swung off it:
    // the grid shows where the sequence is, not where the shuffle put it.
    phraseIndexState[id] = index;
    const of = phraseSteps(control);
    if (phraseLastIdx[id] > index) raiseComponentCycle(control, 0, 1);
    phraseLastIdx[id] = index;
    raiseComponent(control, 'onStep', { index: index + 1, of, notes: [] });
    const delayMs = phraseSwingSeconds(control, index, phraseStepSeconds(control, bpm), transportSwingNow()) * 1000;
    if (delayMs > 0) (phraseTimers[id] ??= []).push(setTimeout(fire, delayMs));
    else fire();
  }
  function phraseAllOff(control) {
    const id = getControlId(control);
    for (const t of phraseTimers[id] ?? []) clearTimeout(t);
    phraseTimers[id] = [];
    const r = phraseReleaseAll(phraseSounding[id] ?? PHRASE_EMPTY);
    phraseSounding[id] = r.sounding;
    for (const m of r.sends) sendNoteBytes(noteOffBytes(m.channel, m.note), `phrase_off_${m.note}`);
  }
  function ensurePhraseTicker() {
    if (phraseTickerRunning) return;
    phraseTickerRunning = true;
    phraseLastMs = Date.now();
    const loop = () => {
      const all = phraseControls();
      const running = all.filter((c) => phraseConfig(c).running !== false);
      // Stopping must let go. Otherwise the ticker exits with the last step
      // still held and nothing left running to ever send the note-off — a
      // hanging note you can only clear with Panic.
      for (const c of all) {
        if (phraseConfig(c).running !== false) continue;
        const id = getControlId(c);
        if (Object.keys(phraseSounding[id] ?? PHRASE_EMPTY).length === 0 && !(phraseTimers[id] ?? []).length) continue;
        phraseAllOff(c);
        phraseIndexState[id] = undefined;   // and the playing column goes dark
      }
      if (!running.length) { phraseTickerRunning = false; return; }
      const now = Date.now();
      const dt = Math.min(0.1, Math.max(0, (now - phraseLastMs) / 1000));
      phraseLastMs = now;
      for (const c of running) {
        const id = getControlId(c);
        if (phraseSynced(c)) {
          // Position in, index out — the Arp's rule. A jump (a host locate, a
          // loop wrap) re-baselines instead of firing every step it skipped.
          const beats = transportBeatsNow();
          const jump = transportJumpSeq();
          const jumped = phraseJumpState[id] !== jump;
          phraseJumpState[id] = jump;
          const index = Math.floor(Math.max(0, beats) / phraseBeatsPerStep(c));
          const prev = phraseBeatsState[id];
          phraseBeatsState[id] = beats;
          if (jumped || prev === undefined || !isTransportRunning()) { phraseIndexState[id] = index; continue; }
          if (index !== phraseIndexState[id]) { pumpPhraseChain(c, id, index); phraseFireIndex(c, index, transportBpmNow()); }
          continue;
        }
        pumpPhraseChain(c, id);
        const next = (phraseFreeIndex[id] ?? 0) + phraseRate(c) * dt;
        phraseFreeIndex[id] = next;
        const index = Math.floor(next);
        if (index !== phraseIndexState[id]) phraseFireIndex(c, index, null);
      }
      orbitClock = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  // Song mode. A lap is one complete pass of the pattern, so the chain advances
  // on the pattern's own length rather than on a separate counter — a chain
  // link of "2" means two passes of whatever is in that slot, whatever length
  // that slot happens to be.
  function pumpPhraseChain(control, id, index = null) {
    if (!phraseChainOn(control)) return;
    const chain = phraseConfig(control).chain;
    if (!Array.isArray(chain) || !chain.length) return;
    const idx = index === null ? Math.floor(phraseFreeIndex[id] ?? 0) : index;
    const lap = Math.floor(idx / Math.max(1, phraseSteps(control)));
    const seen = phraseChainLap[id];
    phraseChainLap[id] = lap;
    if (seen === lap) return;
    // Only swap when the SLOT changes. Reloading the same pattern every lap
    // would throw away any edit made while it was playing.
    if (seen !== undefined && !chainSwitches(chain, seen, lap, phraseChainLoops(control))) return;
    const slot = slotForLap(chain, lap, phraseChainLoops(control));
    if (slot === null) return;
    const cells = loadPattern(phraseConfig(control).patterns, slot);
    patchControlSession(id, { phrasePattern: cells });
  }
  function applyPhraseValueSource(control, resolved) {
    if (!isPhraseControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const cfg = base?._children?.Phrase;
    if (!cfg) return resolved;
    if (cfg.running !== false) { ensurePhraseTicker(); void orbitClock; }
    const id = getControlId(control);
    const index = phraseIndexState[id];
    const next = {
      ...cfg,
      __step: index === undefined ? -1 : phraseStepAt(index, phraseSteps(control), phraseDirection(control), cfg.seed ?? 0),
    };
    const sess = sessionFor(control);
    if (sess?.phrasePattern) next.pattern = sess.phrasePattern;
    return { ...resolved, control: { ...base, _children: { ...base._children, Phrase: next } } };
  }
  // Click a cell to toggle a note; drag across to paint a run of them.
  function handlePhrasePointerDown(control, localPoint) {
    if (!isPhraseControl(control) || phraseConfig(control).editable === false) return false;
    const hit = phraseCellAt(phraseGeomFor(control), localPoint.x, localPoint.y);
    if (!hit) return false;
    const pattern = phrasePattern(control);
    const turningOn = !pattern[`${hit.step}:${hit.row}`];
    phrasePaint = { id: getControlId(control), on: turningOn, seen: new Set() };
    paintPhraseCell(control, hit);
    return true;
  }
  function paintPhraseCell(control, hit) {
    const key = `${hit.step}:${hit.row}`;
    if (phrasePaint.seen.has(key)) return;      // one toggle per cell per drag
    phrasePaint.seen.add(key);
    const pattern = phrasePattern(control);
    const isOn = !!pattern[key];
    // A drag that started by turning cells ON only turns them on, and vice
    // versa — otherwise dragging back over your own trail erases it.
    if (isOn === phrasePaint.on) return;
    updateControlProperty(getControlId(control), 'Phrase.pattern', toggleCell(pattern, hit.step, hit.row));
  }
  function movePhrasePaint(control, localPoint) {
    const hit = phraseCellAt(phraseGeomFor(control), localPoint.x, localPoint.y);
    if (hit) paintPhraseCell(control, hit);
  }

  // --- Zone Splitter: one keyboard, several synths ------------------------------
  // The first control here that is purely a ROUTER: it plays nothing of its own,
  // it re-sends what arrives on the hardware input. Notes go out on the same raw
  // MIDI path the Chord Pad and Arp use.
  //
  // The trap this has to get right is note-OFF. A note-off must go to exactly
  // the destinations its note-on went to — if the user drags a split point, or
  // changes a transposition, while a key is down, re-deriving the routing at
  // release time sends the off to the wrong channel or the wrong pitch and
  // leaves the original note ringing forever. So every note-on's routing is
  // REMEMBERED and the off replays it.
  let phrasePaint = null;         // { id, on, seen } while painting cells
  const SPLIT_PAD = 8;
  const splitSounding = {};       // id -> pure sounding map (see splitZoneLayout)
  const splitSeen = {};           // id -> last note-input seq consumed
  const splitCcSeen = {};         // id -> last CC batch seq consumed
  const splitLatched = {};        // id -> latching CCs currently down, per channel
  const splitBend = {};           // id -> last bend sent, per channel
  const splitLastZones = {};      // id -> zones that claimed the most recent note-on
  let splitEdgeDrag = null;       // { id, index, edge, note } while dragging a split point
  let splitKeyPress = null;       // { id, note } while auditioning from the keyboard
  function isSplitZoneControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'SplitZone';
  }
  function splitControls() {
    return (orderedControls ?? []).filter((c) => isSplitZoneControl(c));
  }
  function splitGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    const cfg = splitConfig(control);
    const lanes = Math.max(1, splitZones(control).length);
    return splitGeometry(numberOr(t.width, 0), numberOr(t.height, 0), SPLIT_PAD,
      cfg.showHeader !== false ? 20 : 0, Math.min(26, Math.max(10, lanes * 8)));
  }
  // Everything below is a thin executor over the pure reducer in
  // splitZoneLayout.js: it decides what to send, this sends it.
  function runSplitSends(sends) {
    for (const m of sends) {
      if (m.kind === 'on') sendNoteBytes(noteOnBytes(m.channel, m.note, m.velocity), `split_on_${m.note}`);
      else sendNoteBytes(noteOffBytes(m.channel, m.note), `split_off_${m.note}`);
    }
  }
  function splitNoteOn(control, note, velocity) {
    const id = getControlId(control);
    const r = splitPress(splitSounding[id] ?? EMPTY_SOUNDING, control, note, velocity);
    splitSounding[id] = r.sounding;
    if (r.zoneIds.length) splitLastZones[id] = r.zoneIds;
    runSplitSends(r.sends);
    // Which zone took it, and what it turned into — a note transposed by a zone is not the note
    // that was played, and nothing said so.
    const out = r.sends.filter((m) => m.kind === 'on');
    if (out.length) {
      raiseComponent(control, 'onVoiced', {
        note, velocity, out: out.map((m) => m.note), channel: out[0].channel,
        zones: [...r.zoneIds],
      });
    }
  }
  function splitReleaseKey(control, note) {
    const id = getControlId(control);
    const r = splitRelease(splitSounding[id] ?? EMPTY_SOUNDING, note);
    splitSounding[id] = r.sounding;
    runSplitSends(r.sends);
  }
  function splitAllOff(control) {
    const id = getControlId(control);
    const r = splitReleaseAll(splitSounding[id] ?? EMPTY_SOUNDING);
    splitSounding[id] = r.sounding;
    runSplitSends(r.sends);
    splitReleaseLatched(control);
  }
  // Consume the live held-note state. Driven off the shared note-input store, so
  // one subscription feeds every splitter on the panel.
  function pumpSplitInput(control) {
    ensureNoteInput();
    const id = getControlId(control);
    const seq = $midiNoteState.seq;
    if (splitSeen[id] === seq) return;
    splitSeen[id] = seq;
    const entries = inputHeldEntries($midiNoteState.notes, splitInputChannel(control));
    const keep = splitKeyPress && splitKeyPress.id === id ? splitKeyPress.note : null;
    const r = splitReconcile(splitSounding[id] ?? EMPTY_SOUNDING, control, entries, keep);
    splitSounding[id] = r.sounding;
    if (r.zoneIds?.length) splitLastZones[id] = r.zoneIds;
    runSplitSends(r.sends);
  }
  // Controllers, on the same principle as the notes: each arriving message is
  // forwarded ONCE, to every channel a zone says should hear it. Latching ones
  // (sustain and friends) are remembered, because a pedal left down on a channel
  // is a synth full of notes nothing will ever stop.
  function pumpSplitCc(control) {
    const id = getControlId(control);
    const batch = $midiRouteEvents;
    if (splitCcSeen[id] === batch.seq) return;
    splitCcSeen[id] = batch.seq;
    if (!batch.seq) return;                    // nothing has arrived yet
    // Pitch bend and channel pressure carry no note, so they're attributed:
    // whoever claimed the most recent note-on, or whoever is sounding.
    const attribution = {
      lastZoneIds: splitLastZones[id] ?? [],
      soundingZoneIds: soundingZoneIds(splitSounding[id]),
    };
    for (const ev of batch.events) {
      if (splitInputChannel(control) && ev.channel !== splitInputChannel(control)) continue;
      if (ev.kind === 'bend') {
        const sends = splitRouteBend(control, ev.value14, attribution);
        splitBend[id] = trackBend(splitBend[id], sends);
        for (const m of sends) sendNoteBytes(bendBytes(m.channel, m.value14), 'split_bend');
        continue;
      }
      if (ev.kind === 'polyAftertouch') {
        // Named its note, so no rule needed — it follows that note's routing.
        for (const m of routePolyPressure(control, splitSounding[id], ev.note, ev.value)) {
          sendNoteBytes(polyPressureBytes(m.channel, m.note, m.value), 'split_pat');
        }
        continue;
      }
      if (ev.kind === 'aftertouch') {
        for (const m of splitRoutePressure(control, ev.value, attribution)) {
          sendNoteBytes(pressureBytes(m.channel, m.value), 'split_at');
        }
        continue;
      }
      const sends = splitRouteCc(control, ev.cc, ev.value);
      splitLatched[id] = splitTrackCc(splitLatched[id], sends);
      for (const m of sends) {
        sendNoteBytes([0xB0 | (m.channel - 1), m.cc, m.value], `split_cc${m.cc}`);
      }
    }
  }
  // Let go of every latching controller this splitter put down. Called by panic
  // and by an all-off: releasing the notes but leaving the pedal down is the
  // half-fix that looks like the panic button doesn't work.
  function splitReleaseLatched(control) {
    const id = getControlId(control);
    for (const m of heldLatchingCcs(control, splitLatched[id])) {
      sendNoteBytes([0xB0 | (m.channel - 1), m.cc, m.value], `split_cc${m.cc}_off`);
    }
    splitLatched[id] = {};
    // A bend left off-centre is a permanently detuned synth. Channels already
    // centred send nothing, so panic on an untouched rig stays quiet.
    for (const m of offCentreBends(splitBend[id])) {
      sendNoteBytes(bendBytes(m.channel, m.value14), 'split_bend_centre');
    }
    splitBend[id] = {};
  }
  function applySplitZoneValueSource(control, resolved) {
    if (!isSplitZoneControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const cfg = base?._children?.SplitZone;
    if (!cfg) return resolved;
    pumpSplitInput(control);
    pumpSplitCc(control);
    const id = getControlId(control);
    const sess = sessionFor(control);
    const next = { ...cfg, __held: soundingNotes(splitSounding[id]) };
    // A drag is previewed from the session, so the keyboard follows the cursor
    // before anything is committed to the model.
    if (Array.isArray(sess?.splitZones)) next.zones = sess.splitZones;
    if (splitEdgeDrag && splitEdgeDrag.id === id) next.__dragEdge = { note: splitEdgeDrag.note };
    return { ...resolved, control: { ...base, _children: { ...base._children, SplitZone: next } } };
  }
  // Pointer-down: grab a split point on the band strip, or audition a key.
  function handleSplitZonePointerDown(control, localPoint) {
    if (!isSplitZoneControl(control) || splitConfig(control).editable === false) return false;
    const geom = splitGeomFor(control);
    const range = splitRange(control);
    const id = getControlId(control);
    const edge = hitZoneEdge(control, geom, localPoint.x, localPoint.y, range.lowNote, range.highNote);
    if (edge) {
      const note = splitNoteAt(geom, localPoint.x, geom.keysY + 2, range.lowNote, range.highNote);
      splitEdgeDrag = { id, index: edge.index, edge: edge.edge, note: note >= 0 ? note : range.lowNote };
      return true;
    }
    // Clicking a key plays it through the zones — auditioning a split without
    // needing the hardware plugged in, which is most of the editor's life.
    const note = splitNoteAt(geom, localPoint.x, localPoint.y, range.lowNote, range.highNote);
    if (note < 0) return false;
    splitKeyPress = { id, note };
    splitNoteOn(control, note, 100);
    return true;
  }
  function moveSplitDrag(control, localPoint) {
    const geom = splitGeomFor(control);
    const range = splitRange(control);
    const note = splitNoteAt(geom, localPoint.x, geom.keysY + 2, range.lowNote, range.highNote);
    if (note < 0 || note === splitEdgeDrag.note) return;
    splitEdgeDrag.note = note;
    patchControlSession(splitEdgeDrag.id, {
      splitZones: dragSplitPoint(splitZones(control), splitEdgeDrag.index, splitEdgeDrag.edge, note),
    });
  }
  function releaseSplitDrag(control) {
    const zones = sessionFor(control)?.splitZones;
    if (Array.isArray(zones)) updateControlProperty(getControlId(control), 'SplitZone.zones', zones);
    patchControlSession(getControlId(control), { splitZones: undefined });
    splitEdgeDrag = null;
  }

  // --- Transport: the master clock --------------------------------------------
  // The component is a face on the shared clock in stores/transport.js, not a
  // clock of its own — two transports on a panel drive the same one, which is
  // the point.
  const tapTimes = [];
  let transportConfigured = false;
  function isTransportControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Transport';
  }
  function tpGeomFor(control) {
    const t = control?._children?.Transform ?? {};
    return tpGeometry(numberOr(t.width, 0), numberOr(t.height, 0), 8);
  }
  // Push the control's settings into the shared clock. Done from the value
  // source so edits take effect live, and once per change rather than per frame.
  function applyTransportValueSource(control, resolved) {
    if (!isTransportControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const cfg = base?._children?.Transport;
    if (!cfg) return resolved;
    const signature = `${cfg.bpm}|${cfg.source}|${cfg.clockOut}|${cfg.beatsPerBar}`
      + `|${cfg.loopEnabled}|${cfg.loopStartBar}|${cfg.loopLengthBars}|${cfg.swing}`;
    if (transportConfigured !== signature) {
      transportConfigured = signature;
      setTransportSource(tpSource(base));
      if (!transportIsFollowing(tpSource(base))) setTransportBpm(numberOr(cfg.bpm, 120));
      setTransportClockOut(cfg.clockOut === true);
      // Swing lives on the clock so every synced follower shuffles together.
      setTransportSwing(numberOr(cfg.swing, 0));
      // The meter has to reach the store, not just the readout: the components
      // that loop in BARS ask the store how long a bar is.
      setTransportSignature(numberOr(cfg.beatsPerBar, 4));
      const region = loopRegion(base, numberOr(cfg.beatsPerBar, 4));
      setTransportLoop(region.enabled, region.startBeats, region.lengthBeats);
      // Run-on-load is a decision only a MASTER clock gets to make. Following a
      // DAW or an incoming clock, pressing play is the other end's job, and
      // starting ourselves would show a running transport parked at bar 1.
      if (cfg.runOnLoad === true && !isTransportRunning() && !transportIsFollowing(tpSource(base))) {
        startTransportWithCountIn(countInBars(base), 0);
      }
    }
    void $transport.seq;                       // re-render on every publish
    return {
      ...resolved,
      control: {
        ...base,
        _children: {
          ...base._children,
          Transport: {
            ...cfg,
            __running: $transport.running,
            __beats: transportBeatsNow(),
            __bpm: $transport.externalBpm ?? $transport.bpm,
            __locked: $transport.externalLocked,
            __countingIn: $transport.countingIn,
            __countInLeft: $transport.countingIn ? countInBeatsLeft() : 0,
            __loop: $transport.loopEnabled,
          },
        },
      },
    };
  }
  function handleTransportPointerDown(control, localPoint) {
    if (!isTransportControl(control) || transportConfig(control).editable === false) return false;
    const geom = tpGeomFor(control);
    if (hitTransportButton(geom, localPoint.x, localPoint.y)) {
      // Pressing play runs the count-in first; pressing it again during the
      // count-in aborts, which is what every DAW does and what you want when
      // you started it by mistake.
      if (isTransportRunning() || isCountingIn()) stopTransport();
      else startTransportWithCountIn(countInBars(control));
      return true;
    }
    // Anywhere else on the face is tap tempo — but only when we're the master;
    // tapping while following someone else's clock would do nothing and look
    // broken, so it's simply inactive.
    if (transportConfig(control).showTap === false || transportIsFollowing(tpSource(control))) return false;
    if (localPoint.x < geom.x || localPoint.x > geom.x + geom.w) return false;
    tapTimes.push(Date.now());
    if (tapTimes.length > 8) tapTimes.shift();
    const bpm = tapTempo(tapTimes);
    if (bpm !== null) {
      setTransportBpm(bpm);
      updateControlProperty(getControlId(control), 'Transport.bpm', Math.round(bpm * 10) / 10);
    }
    return true;
  }

  // --- Panic: silence everything ----------------------------------------------
  // Three jobs, and the third is the one that matters. It stops the panel's own
  // note controls, clears the echoed display, and sends the standard silence
  // set to the synth — because a note-off lost to a cable leaves a note ringing
  // that no amount of tidying our own bookkeeping will ever stop.
  function isPanicControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'Panic';
  }
  // Stop every note-playing control on this panel, whatever it happens to hold.
  function silenceLocalNoteControls() {
    for (const c of (orderedControls ?? [])) {
      if (isChordPadControl(c)) chordAllOff(c);
      else if (isSplitZoneControl(c)) { splitAllOff(c); splitSeen[getControlId(c)] = null; splitCcSeen[getControlId(c)] = null; }
      else if (isPhraseControl(c)) phraseAllOff(c);
      else if (isRecorderControl(c)) recorderAllOff(c);
      else if (isHarmoniserControl(c)) harmAllOff(c);
      else if (isArpControl(c)) { arpAllOff(c); arpLatched[getControlId(c)] = null; }
      else if (isNoteRibbonControl(c)) {
        if (ribbonPress && ribbonPress.id === getControlId(c)) {
          ribbonNoteOff(c);
          ribbonPress = null;
        }
        syncRibbonSession(c, null);
      } else if (isDrumPadsControl(c)) {
        const id = getControlId(c);
        for (const t of drumTimers[id] ?? []) clearTimeout(t);
        drumTimers[id] = [];
        // drumNoteOff stops each pad's roll on the way out; this catches a roll whose pad is no
        // longer in drumHits, which a torn-down surface can leave behind.
        for (const padId of Object.keys(drumHits[id] ?? {})) drumNoteOff(c, padId);
        for (const key of Object.keys(drumRolling)) {
          if (key.startsWith(`${id}:`)) { drumRollClock.stop(key); delete drumRolling[key]; }
        }
        drumPress = null;
        syncDrumSession(c, null);
      }
    }
  }
  function firePanic(control) {
    const id = getControlId(control);
    if (panicConfig(control).clearLocal !== false) silenceLocalNoteControls();
    for (const bytes of panicMessages(control)) sendNoteBytes(bytes, 'panic');
    clearNoteInput();
    // Flash, because the whole point is that the result is silence — without it
    // there is no way to tell a working button from a dead one.
    patchControlSession(id, { panicFlash: true });
    setTimeout(() => patchControlSession(id, { panicFlash: undefined }), 180);
  }
  function handlePanicPointerDown(control, localPoint) {
    if (!isPanicControl(control) || panicConfig(control).editable === false) return false;
    const t = control?._children?.Transform ?? {};
    const geom = panicGeometry(numberOr(t.width, 0), numberOr(t.height, 0), 6);
    if (!panicHit(geom, localPoint.x, localPoint.y)) return false;
    firePanic(control);
    return true;
  }
  function applyPanicValueSource(control, resolved) {
    if (!isPanicControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const pn = base?._children?.Panic;
    if (!pn || sessionFor(control)?.panicFlash !== true) return resolved;
    return { ...resolved, control: { ...base, _children: { ...base._children, Panic: { ...pn, __flash: true } } } };
  }
  // The emergency path: Esc, and leaving the panel. Always the MAXIMAL silence
  // set, never a placed Panic button's config — someone may have set one up as
  // a narrow "drums off, ch 10", and an emergency that silences a third of the
  // rig is worse than useless.
  function firePanicEmergency({ flashButtons = true } = {}) {
    try { silenceLocalNoteControls(); } catch { /* mid-teardown: the blanket set still covers it */ }
    for (const bytes of panicMessages(EMERGENCY_PANIC)) sendNoteBytes(bytes, 'panic');
    clearNoteInput();
    sentAnyNote = false;
    if (!flashButtons) return;
    // Light any Panic buttons on the panel, so Esc visibly does the same thing.
    for (const c of (orderedControls ?? [])) {
      if (!isPanicControl(c)) continue;
      const id = getControlId(c);
      patchControlSession(id, { panicFlash: true });
      setTimeout(() => patchControlSession(id, { panicFlash: undefined }), 180);
    }
  }
  // The guard that stops Esc stealing the per-control Escape cancels lives in
  // panicLayout as a pure predicate, because getting it wrong means every
  // cancelled text edit also panics the rig.
  function handleGlobalKeyDown(event) {
    const shortcut = panel?.panicShortcut ?? DEFAULT_PANIC_SHORTCUT;
    if (!isPanicShortcut(event, { shortcut, lcdEditing: lcdEdit.active === true })) return;
    event.preventDefault();
    firePanicEmergency();
  }

  // Inject the sounding pads + last hit so the renderer can light up.
  function applyDrumPadsValueSource(control, resolved) {
    if (!isDrumPadsControl(control)) return resolved;
    const base = resolved?.control ?? control;
    const d = base?._children?.DrumPads;
    if (!d) return resolved;
    const sess = sessionFor(control);
    const echo = echoNotesFor(d);
    if (!sess?.drumHits && !sess?.drumLast && !echo.length) return resolved;
    const next = { ...d, __hits: sess?.drumHits ?? [], __last: sess?.drumLast ?? null };
    if (echo.length) { next.__echo = echo; next.__echoLevels = echoLevelsFor(d); }
    return { ...resolved, control: { ...base, _children: { ...base._children, DrumPads: next } } };
  }

  // Drive a PixelDisplay from live control values: element sources (+ @active),
  // and the brightness/backlight drives. Mirrors applyLcdValueSource for the
  // pixel-surface component.
  // Every element sourceId across the flat list and all layouts, plus the page
  // selector and overlay triggers.
  function pixelSourceIds(pixel) {
    const ids = new Set();
    const collect = (list) => {
      for (const el of (Array.isArray(list) ? list : [])) {
        const id = String(el?.sourceId ?? '');
        if (id) ids.add(id);
      }
    };
    collect(pixel.elements);
    for (const layout of (Array.isArray(pixel.layouts) ? pixel.layouts : [])) collect(layout?.elements);
    const pages = pixel.pages ?? {};
    if (pages.selectorSourceId) ids.add(String(pages.selectorSourceId));
    for (const ov of (Array.isArray(pages.overlays) ? pages.overlays : [])) {
      if (ov?.sourceId) ids.add(String(ov.sourceId));
    }
    return [...ids];
  }

  // Active layout for a PixelDisplay in preview: design selection as the resting
  // default, overridden by a live selector value or an overlay.
  function resolvePixelActiveLayoutId(control) {
    const pixel = control?._children?.Pixel;
    const layouts = Array.isArray(pixel?.layouts) ? pixel.layouts : [];
    if (!layouts.length) return '';
    const pages = pixel.pages ?? {};
    const selSrc = pages.selectorSourceId ? controlById(pages.selectorSourceId) : null;
    const selInfo = selSrc ? lcdSourceInfo(selSrc) : null;
    const selectorValue = selInfo ? selInfo.selector : undefined;
    const activeOverlayLayoutId = resolveActiveOverlayLayout(pixel);
    const designId = String(get(lcdDesignLayoutIds)[getControlId(control)] ?? '');
    const hasDesign = designId && layouts.some((l) => String(l?.id ?? '') === designId);
    const effPages = hasDesign ? { ...pages, defaultLayoutId: designId } : pages;
    return resolveActiveLayoutId(effPages, layouts, { selectorValue, activeOverlayLayoutId });
  }

  function applyPixelValueSource(control, resolved) {
    if (String(control?._children?.Core?.controlType ?? '') !== 'PixelDisplay') return resolved;
    const pixel = control?._children?.Pixel;
    if (!pixel) return resolved;

    const live = {};
    for (const id of pixelSourceIds(pixel)) {
      const resolvedId = isActiveSource(id) ? lcdResolveActive(id, pixel) : id;
      const src = resolvedId ? controlById(resolvedId) : null;
      const info = src ? lcdSourceInfo(src) : null;
      if (info) live[id] = info;
    }

    const brightRange = pixel.brightnessSourceId ? lcdRangeForSource(pixel.brightnessSourceId) : null;
    const backCtrl = pixel.backlightSourceId
      ? controlById(pixel.backlightSourceId) : null;
    const backInfo = backCtrl ? lcdSourceInfo(backCtrl) : null;
    const hasLayouts = Array.isArray(pixel.layouts) && pixel.layouts.length > 0;

    const ownSession = sessionFor(control) ?? {};
    const hasOwnOverride = ownSession.textOverride !== undefined
      || ownSession.brightnessOverride !== undefined
      || ownSession.backlightOverride !== undefined;
    const editingHere = lcdEdit.active && lcdEdit.id === getControlId(control);

    if (!Object.keys(live).length && !brightRange && !backInfo && !hasLayouts && !hasOwnOverride && !editingHere) return resolved;

    const base = resolved?.control ?? control;
    const basePixel = base?._children?.Pixel ?? {};
    const cp = { ...basePixel, __live: live };
    if (hasLayouts) cp.__page = { activeLayoutId: resolvePixelActiveLayoutId(control) };
    if (brightRange) {
      const span = brightRange.max - brightRange.min;
      const frac = span === 0 ? 0 : Math.max(0, Math.min(1, (brightRange.value - brightRange.min) / span));
      cp.brightness = Math.round(frac * 100);
    }
    if (backInfo) cp.backlightOn = backInfo.on === true || numberOr(backInfo.value, 0) >= 0.5;
    // Direct device bindings win over source-control drives (more specific).
    if (ownSession.brightnessOverride !== undefined) cp.brightness = ownSession.brightnessOverride;
    if (ownSession.backlightOverride !== undefined) cp.backlightOn = ownSession.backlightOverride === true;
    if (ownSession.textOverride !== undefined) cp.editText = String(ownSession.textOverride);
    // Live edit caret: the renderer parks a blinking I-beam on the armed element.
    cp.__edit = editingHere
      ? { active: true, caret: lcdEdit.caret, elementId: lcdEdit.zoneId, kind: lcdEdit.kind }
      : null;
    const clone = { ...base, _children: { ...base._children, Pixel: cp } };
    return { ...(resolved ?? {}), control: clone };
  }

  function isDisabled(control) {
    const session = sessionFor(control);
    return session?.enabled === false
      || session?.disabled === true
      || control?._children?.Core?.enabled === false;
  }

  function isRangeControl(control) {
    return isRangeBehavior(getBehavior(control));
  }

  function isCustomComponent(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'CustomComponent';
  }

  function isComboboxControl(control) {
    return String(getBehavior(control)?.buttonType ?? '').trim().toLowerCase() === 'combobox';
  }

  function isListboxControl(control) {
    return String(getBehavior(control)?.buttonType ?? '').trim().toLowerCase() === 'listbox';
  }

  // --- TextInput: an editable text field committing to Behavior.defaultValue ---
  function isTextInputControl(control) {
    return String(control?._children?.Core?.controlType ?? '') === 'TextInput';
  }
  // The live text = Behavior.defaultValue (the input stays uncontrolled while
  // typing; this value only changes on commit or an inbound device update).
  function currentTextValue(control) {
    return String(getBehavior(control)?.defaultValue ?? '');
  }
  function commitTextValue(control, value) {
    const id = getControlId(control);
    if (!id) return;
    const str = String(value ?? '');
    if (str !== currentTextValue(control)) updateControlProperty(id, 'Behavior.defaultValue', str);
    // Emit through the text port (SysEx patch-name value on the device side).
    emitDeviceBindingsForPatch(control, { textValue: str });
  }
  function handleTextFieldFocus(control) {
    const id = getControlId(control);
    inspectPreviewControl(id);
    patchControlSession(id, { focused: true, hover: true });
  }
  function handleTextFieldBlur(control, event) {
    commitTextValue(control, event?.target?.value);
    patchControlSession(getControlId(control), { focused: false });
  }
  function handleTextFieldKeyDown(control, event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTextValue(control, event.target?.value);
      event.currentTarget?.blur?.();
    } else if (event.key === 'Escape') {
      // Cancel: restore the committed value and drop focus.
      event.preventDefault();
      const original = currentTextValue(control);
      if (event.target) event.target.value = original;
      event.currentTarget?.blur?.();
    }
  }

  // The Value row under a click on an always-open listbox (accounts for scroll).
  function resolveListboxPreviewValue(control, clientX, clientY) {
    if (!isListboxControl(control)) return undefined;
    control = lbControl(control);
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return undefined;
    const transformSection = control?._children?.Transform ?? null;
    const localY = ((clientY - rect.top) / Math.max(rect.height, 1)) * (transformSection?.height ?? rect.height);
    const scrollTop = numberOr(sessionFor(control)?.listboxScrollTop, 0);
    const filter = lbFilter(control);
    const idx = listboxRowIndexAtPoint(control, localY, scrollTop, filter);
    const rows = listboxRows(control, filter);
    const row = idx >= 0 ? rows[idx] : undefined;
    // Section headers / disabled rows aren't selectable.
    return isSelectableRow(row) ? row : undefined;
  }

  // The listbox viewport height (logical grid px).
  function listboxViewport(control) {
    return Math.max(1, numberOr(control?._children?.Transform?.height, 0));
  }
  // The live filter text for a listbox (filter-box search).
  function lbFilter(control) {
    return String(sessionFor(control)?.listboxFilter ?? '');
  }
  // The listbox with its rows reduced to the parent selector's value (cascading);
  // the id/name are preserved so session reads/writes still resolve. Every
  // listbox row/hit-test read should go through this so it matches the renderer.
  function lbControl(control) {
    return dependentControl(control, sessionFor(control)?.dependsParentValue);
  }
  function handleListboxFilterInput(control, event) {
    // Reset the scroll on a new query so the top match is visible.
    patchControlSession(getControlId(control), { listboxFilter: String(event?.target?.value ?? ''), listboxScrollTop: 0 });
  }
  // Keep the selected row in view (if configured) by nudging session scrollTop.
  function scrollListboxToIndex(control, index) {
    if (index < 0 || listboxConfig(control).scrollIntoView === false) return;
    control = lbControl(control);
    const cur = numberOr(sessionFor(control)?.listboxScrollTop, 0);
    const next = listboxScrollIntoView(control, index, listboxViewport(control), cur, lbFilter(control));
    if (next !== cur) patchControlSession(getControlId(control), { listboxScrollTop: next });
  }
  // Select the visible row at `index` (by value), scroll it into view.
  function selectListboxIndex(control, index) {
    const row = listboxRows(lbControl(control), lbFilter(control))[index];
    if (!isSelectableRow(row)) return;
    selectComboboxRow(control, row);
    scrollListboxToIndex(control, index);
  }
  // Arm the visible row at `index` as pending (double/enter/multi modes),
  // scrolling it into view. Distinct from committing the value.
  function armListboxIndex(control, index) {
    const row = listboxRows(control, lbFilter(control))[index];
    if (!isSelectableRow(row)) return;
    patchControlSession(getControlId(control), { listboxPending: String(rowValue(row)) });
    scrollListboxToIndex(control, index);
  }
  // The current keyboard anchor: the pending row if one is armed, else the
  // committed selection.
  function listboxAnchorIndex(control, filter) {
    const pending = String(sessionFor(control)?.listboxPending ?? '');
    if (pending) {
      const at = listboxRows(control, filter).findIndex((r) => String(rowValue(r)) === pending);
      if (at >= 0) return at;
    }
    return listboxIndexOfValue(control, currentComboboxValue(control), filter);
  }

  // Keyboard navigation for a focused listbox. Returns true if handled.
  function handleListboxKey(control, event) {
    if (listboxConfig(control).keyboardNav === false) return false;
    const cfg = listboxConfig(control);
    const deferred = cfg.multiSelect === true || String(cfg.confirmMode ?? 'single') !== 'single';
    control = lbControl(control); // cascading: navigate only the visible rows
    const filter = lbFilter(control);
    const rows = listboxRows(control, filter);
    if (!rows.length) return false;
    // Enter / Space commit (or toggle in multi-select) the armed row.
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      if (!deferred) return false;
      const idx = listboxAnchorIndex(control, filter);
      const row = idx >= 0 ? rows[idx] : undefined;
      if (isSelectableRow(row)) {
        event.preventDefault();
        if (cfg.multiSelect === true) toggleListboxSelection(control, row);
        else confirmListboxPending(control, row);
        return true;
      }
      return false;
    }
    const curIdx = deferred ? listboxAnchorIndex(control, filter) : listboxIndexOfValue(control, currentComboboxValue(control), filter);
    const perPage = Math.max(1, Math.floor(listboxViewport(control) / listboxRowStride(control)) - 1);
    let target = -1;
    switch (event.key) {
      case 'ArrowDown': target = listboxStep(control, curIdx, 1, filter); break;
      case 'ArrowUp': target = listboxStep(control, curIdx, -1, filter); break;
      case 'PageDown': target = listboxStep(control, curIdx, perPage, filter); break;
      case 'PageUp': target = listboxStep(control, curIdx, -perPage, filter); break;
      case 'Home': target = listboxStep(control, -1, 1, filter); break;
      case 'End': target = listboxStep(control, rows.length, -1, filter); break;
      default: return false;
    }
    event.preventDefault();
    if (target >= 0) {
      if (deferred) armListboxIndex(control, target);
      else selectListboxIndex(control, target);
    }
    return true;
  }

  // Type-ahead: accumulate typed chars (reset after a pause) and jump to the
  // first matching row (prefix or fuzzy). Returns true if handled.
  let listboxTypeBuffer = { id: '', text: '', at: 0 };
  function fuzzyMatch(q, s) {
    let i = 0;
    for (const ch of s) { if (ch === q[i]) i += 1; if (i >= q.length) return true; }
    return q.length === 0;
  }
  function handleListboxTypeAhead(control, event) {
    const mode = String(listboxConfig(control).typeAhead ?? 'off');
    if (mode === 'off') return false;
    const key = event.key;
    if (key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
    event.preventDefault();
    control = lbControl(control); // cascading: search only the visible rows
    const id = getControlId(control);
    const now = (typeof performance !== 'undefined' ? performance.now() : 0);
    if (listboxTypeBuffer.id !== id || now - listboxTypeBuffer.at > 900) listboxTypeBuffer = { id, text: '', at: now };
    listboxTypeBuffer = { id, text: listboxTypeBuffer.text + key, at: now };
    const q = listboxTypeBuffer.text.toLowerCase();
    const idx = listboxRows(control, lbFilter(control)).findIndex((r) => {
      if (!isSelectableRow(r)) return false;
      const label = String(r.displayText ?? '').toLowerCase();
      return mode === 'fuzzy' ? fuzzyMatch(q, label) : label.startsWith(q);
    });
    if (idx >= 0) selectListboxIndex(control, idx);
    return true;
  }

  // --- Confirm modes (D4) + multi-select (D5) ------------------------------
  function listboxMultiSelected(control) {
    const cur = sessionFor(control)?.listboxSelected;
    return Array.isArray(cur) ? cur : [];
  }
  // Toggle a row in the multi-select set; the anchor value follows the row.
  function toggleListboxSelection(control, row) {
    if (!isSelectableRow(row)) return;
    const controlId = getControlId(control);
    const val = String(rowValue(row));
    const cur = listboxMultiSelected(control).slice();
    const at = cur.indexOf(val);
    if (at >= 0) cur.splice(at, 1); else cur.push(val);
    inspectPreviewControl(controlId);
    patchControlSession(controlId, {
      listboxSelected: cur,
      valueOverrideEnabled: true, valueOverride: val,
      focused: true, hover: true, pressed: false,
    });
  }
  // Fire the "recall" side effect on commit when recallOnSelect is on: mark the row as now-playing
  // and, when the row carries a preset slot, send the profile's recall action (Program Change /
  // Bank+PC / SysEx per the DPD preset model — a no-op for authored non-preset rows).
  function recallListboxRow(control, row) {
    if (listboxConfig(control).recallOnSelect !== true || !isSelectableRow(row)) return;
    patchControlSession(getControlId(control), { listboxNowPlaying: String(rowValue(row)) });
    recallRowSlot(row, {});
  }
  // A click's effect on a listbox row, honoring multiSelect + confirmMode.
  function activateListboxRow(control, row) {
    if (!isSelectableRow(row)) return;
    const cfg = listboxConfig(control);
    if (cfg.multiSelect === true) { toggleListboxSelection(control, row); return; }
    const mode = String(cfg.confirmMode ?? 'single');
    if (mode === 'single') {
      selectComboboxRow(control, row);
      recallListboxRow(control, row);
      patchControlSession(getControlId(control), { listboxPending: '' });
    } else {
      // double / enter: a single click only arms the row; commit happens on the
      // double-click or Enter that confirms it.
      patchControlSession(getControlId(control), {
        listboxPending: String(rowValue(row)), focused: true, hover: true, pressed: false,
      });
      inspectPreviewControl(getControlId(control));
    }
  }
  // Commit the armed (pending) row in double/enter confirm modes.
  function confirmListboxPending(control, row) {
    const target = row ?? listboxRows(control, lbFilter(control))
      .find((r) => String(rowValue(r)) === String(sessionFor(control)?.listboxPending ?? ''));
    if (!isSelectableRow(target)) return false;
    selectComboboxRow(control, target);
    recallListboxRow(control, target);
    patchControlSession(getControlId(control), { listboxPending: '' });
    return true;
  }

  function getValueRows(control) {
    // Cascading selectors: reduce to the rows visible under the parent value.
    const rows = visibleChoiceRows(control?._children?.Value?.rows, sessionFor(control)?.dependsParentValue, dependsOnId(control));
    return rows.filter((row) => row?.enabled !== false && row?.isHeader !== true);
  }

  function rowValue(row) {
    return row?.internalValue ?? row?.id ?? '';
  }

  function rowLabel(row) {
    return row?.displayText ?? row?.label ?? row?.internalValue ?? row?.id ?? '';
  }

  function currentComboboxValue(control) {
    const session = sessionFor(control);
    const behavior = getBehavior(control);
    const rows = getValueRows(control);
    if (session?.valueOverrideEnabled === true) return session?.valueOverride;
    return behavior?.defaultValue
      ?? rows.find((row) => row?.selectedByDefault === true)?.internalValue
      ?? rows[0]?.internalValue
      ?? rows[0]?.id
      ?? '';
  }

  function comboboxMenuStyle(control) {
    const transform = control?._children?.Transform ?? {};
    const x = numberOr(transform?.x, 0);
    const y = numberOr(transform?.y, 0);
    const width = Math.max(32, numberOr(transform?.width, 160));
    const height = Math.max(1, numberOr(transform?.height, 34));
    return `left:${x}px; top:${y + height + 4}px; width:${width}px;`;
  }

  function selectComboboxRow(control, row) {
    const controlId = getControlId(control);
    if (!controlId || !row) return;
    inspectPreviewControl(controlId);
    patchControlSession(controlId, {
      valueOverrideEnabled: true,
      valueOverride: rowValue(row),
      checked: false,
      mixed: false,
      hover: true,
      focused: true,
      pressed: false,
    });
    openComboboxControlId = '';
  }

  function currentRangeValue(control) {
    return getCurrentRangeValue(getBehavior(control), sessionFor(control));
  }

  // --- Two-value min/max spinner ([ low ] [ − + ] [ high ]) ---------------
  function isTwoValueSpinner(control) {
    const behavior = getBehavior(control);
    return isTwoValueRange(behavior)
      && String(behavior?.role ?? '').trim().toLowerCase() === 'spinbox';
  }

  // Which of the four spinner regions a pointer x falls in. Matches the part
  // layout: low 0–30%, decrement ~30–50%, increment ~50–70%, high 70–100%.
  function resolveSpinnerZone(rect, clientX) {
    if (!rect || rect.width <= 0) return 'low';
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (fraction < 0.30) return 'low';
    if (fraction < 0.50) return 'decrement';
    if (fraction < 0.70) return 'increment';
    return 'high';
  }

  function spinnerActiveHandle(control) {
    return getRangeActiveHandle(sessionFor(control));
  }

  function setSpinnerActiveHandle(control, handle) {
    const role = handle === 'end' ? 'end' : 'start';
    // Note: does NOT clear valueInputActive — a click that focuses a field to
    // type must not immediately cancel that edit.
    patchControlSession(getControlId(control), {
      activeHandle: role,
      valueInputRole: role,
      hover: true,
      focused: true,
    });
  }

  // --- Inline typing into the low/high fields -----------------------------
  function spinnerHandleForRole(role) {
    return role === 'highField' ? 'end' : 'start';
  }

  function spinnerFieldValue(control, role) {
    const behavior = getBehavior(control);
    const session = sessionFor(control);
    const handle = spinnerHandleForRole(role);
    if (session?.valueInputActive === true && getRangeActiveHandle(session) === handle) {
      return String(session?.valueInputBuffer ?? '');
    }
    const value = handle === 'end' ? getRangeEndValue(behavior, session) : getRangeStartValue(behavior, session);
    return formatRangeValue(behavior, value);
  }

  // Descriptor map consumed by CanvasControl to render lowField/highField as
  // editable inputs (so they can be focused and typed into).
  function spinnerEditableFields(control) {
    if (!isTwoValueSpinner(control)) return null;
    const behavior = getBehavior(control);
    const base = {
      disabled: isDisabled(control),
      inputMode: String(behavior?.valueType ?? '') === 'int' ? 'numeric' : 'decimal',
      tabIndex: -1,
    };
    return {
      lowField: { ...base, value: spinnerFieldValue(control, 'lowField'), ariaLabel: 'Low value' },
      highField: { ...base, value: spinnerFieldValue(control, 'highField'), ariaLabel: 'High value' },
    };
  }

  function beginSpinnerFieldEdit(control, role) {
    const handle = spinnerHandleForRole(role);
    const behavior = getBehavior(control);
    const session = sessionFor(control);
    const current = handle === 'end' ? getRangeEndValue(behavior, session) : getRangeStartValue(behavior, session);
    patchControlSession(getControlId(control), {
      activeHandle: handle,
      valueInputRole: handle,
      valueInputActive: true,
      valueInputBuffer: formatRangeValue(behavior, current),
      focused: true,
      hover: true,
    });
  }

  function commitSpinnerField(control, role) {
    const handle = spinnerHandleForRole(role);
    const session = sessionFor(control);
    const buffer = String(session?.valueInputBuffer ?? '');
    const parsed = parseRangeInputValue(getBehavior(control), buffer);
    patchControlSession(getControlId(control), {
      valueInputActive: false,
      valueInputBuffer: '',
      ...(parsed === null ? {} : {
        activeHandle: handle,
        valueInputRole: handle,
        [`${handle}ValueOverrideEnabled`]: true,
        [`${handle}ValueOverride`]: clampRangeHandleValue(getBehavior(control), session, handle, parsed),
      }),
    });
  }

  function handleSpinnerFieldFocus(control, role, event) {
    event.stopPropagation();
    beginSpinnerFieldEdit(control, role);
    // Select the field contents so typing replaces the value.
    event.currentTarget?.select?.();
  }

  function handleSpinnerFieldInput(control, role, event) {
    event.stopPropagation();
    const handle = spinnerHandleForRole(role);
    const rawValue = String(event?.currentTarget?.value ?? '');
    patchControlSession(getControlId(control), {
      activeHandle: handle,
      valueInputRole: handle,
      valueInputActive: true,
      valueInputBuffer: rawValue,
    });
  }

  function handleSpinnerFieldKeyDown(control, role, event) {
    event.stopPropagation();
    const handle = spinnerHandleForRole(role);

    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      // Ensure the edited field is the active handle, then reuse the key logic.
      if (getRangeActiveHandle(sessionFor(control)) !== handle) {
        patchControlSession(getControlId(control), { activeHandle: handle, valueInputRole: handle });
      }
      adjustRangeFromKey(control, event.key);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitSpinnerField(control, role);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      patchControlSession(getControlId(control), { valueInputActive: false, valueInputBuffer: '' });
    }
  }

  function handleSpinnerFieldBlur(control, role, event) {
    event.stopPropagation();
    commitSpinnerField(control, role);
    patchControlSession(getControlId(control), { focused: false, pressed: false, dragging: false });
  }

  // Write a handle's value into the session (enables its override, keeps the
  // pair ordered) and marks it active.
  function setSpinnerHandleValue(control, handle, nextValue, extraPatch = {}) {
    const role = handle === 'end' ? 'end' : 'start';
    patchControlSession(getControlId(control), {
      activeHandle: role,
      valueInputRole: role,
      [`${role}ValueOverrideEnabled`]: true,
      [`${role}ValueOverride`]: nextValue,
      valueInputActive: false,
      valueInputBuffer: '',
      ...extraPatch,
    });
  }

  function adjustSpinnerActiveHandle(control, direction, multiplier = 1) {
    const behavior = getBehavior(control);
    const session = sessionFor(control);
    const handle = getRangeActiveHandle(session);
    const nextValue = adjustRangeHandleValue(behavior, session, handle, direction, multiplier);
    setSpinnerHandleValue(control, handle, nextValue, { hover: true, focused: true });
  }

  function isSliderControl(control) {
    return isSliderBehavior(getBehavior(control));
  }

  function currentSliderValues(control) {
    return getSliderResolvedValues(getBehavior(control), sessionFor(control));
  }

  function currentSliderActiveHandle(control) {
    return getSliderActiveHandle(getBehavior(control), sessionFor(control));
  }

  function currentSliderRoleValue(control, role = 'current') {
    const values = currentSliderValues(control);
    return values?.[role] ?? values?.current ?? currentRangeValue(control);
  }

  function sliderHandleRoles(control) {
    const behavior = getBehavior(control);
    return getSliderValueMode(behavior) === 'range'
      ? ['start', 'end']
      : (getSliderValueMode(behavior) === 'band' ? ['start', 'current', 'end'] : ['current']);
  }

  function sliderPreviewScale(control, rect = null) {
    if (!rect) return 1;
    const transform = control?._children?.Transform ?? null;
    const widthScale = rect.width / Math.max(1, numberOr(transform?.width, rect.width));
    const heightScale = rect.height / Math.max(1, numberOr(transform?.height, rect.height));
    return Math.max(0.01, Math.min(widthScale || 1, heightScale || 1));
  }

  function sliderPartsFor(control) {
    return control?._children?.Parts?._children ?? {};
  }

  function sliderTrackThickness(control) {
    const trackLayout = sliderPartsFor(control)?.bodyTrackBase?._children?.Layout ?? null;
    return Math.max(4, numberOr(trackLayout?.height, 10));
  }

  function sliderMajorTickLength(control) {
    const behavior = getBehavior(control);
    const tickLayout = sliderPartsFor(control)?.tickMajor?._children?.Layout ?? null;
    return Math.max(0, numberOr(tickLayout?.height, numberOr(behavior?.majorTickLength, 12)));
  }

  function sliderPointerSize(control, role = 'current') {
    const partName = role === 'start'
      ? 'pointerStart'
      : role === 'end'
        ? 'pointerEnd'
        : 'pointerCurrent';
    const fallback = role === 'current' ? 20 : 18;
    const pointerLayout = sliderPartsFor(control)?.[partName]?._children?.Layout ?? null;
    return Math.max(8, numberOr(pointerLayout?.width, numberOr(pointerLayout?.height, fallback)));
  }

  function sliderHandlePoint(control, role = 'current', rect = null) {
    if (!rect) return null;

    const behavior = getBehavior(control);
    const scaleFactor = sliderPreviewScale(control, rect);
    const trackThickness = sliderTrackThickness(control) * scaleFactor;
    const pointerSize = sliderPointerSize(control, role) * scaleFactor;
    const showReadout = behavior?.showValueReadout !== false;
    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    const span = max - min;
    const normalized = span > 0
      ? Math.max(0, Math.min(1, (currentSliderRoleValue(control, role) - min) / span))
      : 0;

    if (String(behavior?.geometry ?? 'linear').trim().toLowerCase() === 'circular') {
      const maxPointerSize = Math.max(...sliderHandleRoles(control).map((handleRole) => sliderPointerSize(control, handleRole))) * scaleFactor;
      const metrics = resolveCircularTrackMetrics(rect.width, rect.height, {
        trackThickness,
        pointerSize: maxPointerSize,
        majorTickLength: sliderMajorTickLength(control) * scaleFactor,
        hasReadout: showReadout,
        circularDiameter: numberOr(behavior?.circularDiameter, 0) * scaleFactor,
      });
      return resolveCircularPoint(
        rect.width,
        rect.height,
        sliderValueToAngle(behavior, currentSliderRoleValue(control, role)),
        metrics.radius,
        { x: metrics.centerX, y: metrics.centerY },
      );
    }

    return resolveLinearPointerPoint(
      behavior,
      rect.width,
      rect.height,
      normalized,
      trackThickness,
      pointerSize,
      showReadout,
    );
  }

  function sliderValueForPoint(control, event) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return currentSliderRoleValue(control, currentSliderActiveHandle(control));
    const behavior = getBehavior(control);
    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    // A live scrub means a linear drag is in progress; circular tracks (and
    // one-shot hit tests like handle picking) use the pure geometry mapping.
    const normalized = sliderScrub
      ? (sliderScrub.move(scrubSample(event)) ?? sliderScrub.value)
      : resolveSliderNormalizedFromPoint(behavior, rect, event.clientX, event.clientY);
    return snapSliderValue(behavior, min + ((max - min) * normalized));
  }

  function pickNearestSliderHandle(control, event) {
    const values = currentSliderValues(control);
    const targetValue = sliderValueForPoint(control, event);
    let nearestRole = currentSliderActiveHandle(control);
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const role of sliderHandleRoles(control)) {
      const distance = Math.abs((values?.[role] ?? 0) - targetValue);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestRole = role;
      }
    }

    return nearestRole;
  }

  function pickDirectSliderHandle(control, event) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return '';

    const scaleFactor = sliderPreviewScale(control, rect);
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    let nearestRole = '';
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const role of sliderHandleRoles(control)) {
      const point = sliderHandlePoint(control, role, rect);
      if (!point) continue;

      const hitRadius = Math.max((sliderPointerSize(control, role) * scaleFactor) / 2, 12);
      const distance = Math.hypot(localX - point.x, localY - point.y);
      if (distance > hitRadius || distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearestRole = role;
    }

    return nearestRole;
  }

  function resolveRadioGroupPreviewValue(control, clientX, clientY) {
    if (String(getBehavior(control)?.buttonType ?? '') !== 'radio') return '';

    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return '';

    const transformSection = control?._children?.Transform ?? null;
    const contentLayout = control?._children?.ContentLayout ?? null;
    const layout = resolveRadioGroupLayout({
      behavior: getBehavior(control),
      valueRows: control?._children?.Value?.rows ?? [],
      width: transformSection?.width ?? rect.width,
      height: transformSection?.height ?? rect.height,
      paddingLeft: contentLayout?.paddingLeft ?? 0,
      paddingRight: contentLayout?.paddingRight ?? 0,
      paddingTop: contentLayout?.paddingTop ?? 0,
      paddingBottom: contentLayout?.paddingBottom ?? 0,
      gap: contentLayout?.gap ?? 8,
    });

    const localX = ((clientX - rect.left) / Math.max(rect.width, 1)) * (transformSection?.width ?? rect.width);
    const localY = ((clientY - rect.top) / Math.max(rect.height, 1)) * (transformSection?.height ?? rect.height);
    return resolveRadioGroupValueAtPoint(layout, localX, localY);
  }

  function activeDeviceBindings(control) {
    const deviceBindings = control?._children?.DeviceBindings;
    if (deviceBindings?.enabled === false) return [];
    const bindings = deviceBindings?.bindings;
    return Array.isArray(bindings)
      ? bindings.filter((binding) => binding?.kind === 'deviceParameter' && binding?.parameterId)
      : [];
  }

  function bindingValueForPatch(binding, patch = {}, control = null) {
    if (isTimedButtonBehavior(getBehavior(control))) {
      return patch.executed === true ? true : undefined;
    }

    const port = String(binding?.port ?? 'value');
    if (port === 'trigger') {
      if (String(binding?.parameterType ?? '') === 'momentary') {
        return Object.prototype.hasOwnProperty.call(patch, 'pressed') ? patch.pressed === true : undefined;
      }
      if (patch.executed === true || patch.pressed === false) return true;
      return undefined;
    }
    if (port === 'state') {
      return Object.prototype.hasOwnProperty.call(patch, 'checked') ? patch.checked : undefined;
    }
    if (port === 'selectedChoice') {
      return Object.prototype.hasOwnProperty.call(patch, 'valueOverride') ? patch.valueOverride : undefined;
    }
    if (port === 'text') {
      return Object.prototype.hasOwnProperty.call(patch, 'textValue') ? patch.textValue : undefined;
    }
    if (port === 'value') {
      if (Object.prototype.hasOwnProperty.call(patch, 'valueOverride')) return patch.valueOverride;
      if (Object.prototype.hasOwnProperty.call(patch, 'currentValueOverride')) return patch.currentValueOverride;
      if (Object.prototype.hasOwnProperty.call(patch, 'activeHandle')) {
        const activeHandle = String(patch.activeHandle ?? 'current');
        const handleKey = `${activeHandle}ValueOverride`;
        if (Object.prototype.hasOwnProperty.call(patch, handleKey)) return patch[handleKey];
      }
    }
    return undefined;
  }

  function emitDeviceBindingsForPatch(control, patch = {}) {
    const controlId = getControlId(control);
    const interactionPhase = patch.dragging === true ? 'continuous' : 'commit';
    for (const binding of activeDeviceBindings(control)) {
      const value = bindingValueForPatch(binding, patch, control);
      if (value === undefined) continue;
      commitDeviceParameter({
        requestId: `panel_preview_${controlId || 'control'}_${interactionPhase}_${Date.now()}`,
        deviceRole: binding.deviceRole || DEFAULT_DEVICE_ROLE,
        parameterId: binding.parameterId,
        value,
        interactionPhase,
        dryRun: binding.dryRun !== false,
      });
    }
  }

  function commitSelectActionAndEmit(control, options = {}) {
    const controlId = getControlId(control);
    if (!controlId) return;

    const requestedValue = Object.prototype.hasOwnProperty.call(options, 'value')
      ? options.value
      : undefined;

    const appliedPatch = commitPanelPreviewSelectAction(controlId, options);

    if (appliedPatch?.valueOverrideEnabled === true) {
      emitDeviceBindingsForPatch(control, {
        valueOverride: appliedPatch.valueOverride,
      });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(appliedPatch ?? {}, 'checked')) {
      emitDeviceBindingsForPatch(control, {
        checked: appliedPatch.checked === true,
      });
      return;
    }

    if (requestedValue !== undefined && requestedValue !== '') {
      // Player fallback: commitPanelPreviewSelectAction resolves the control via the editor's
      // active-panel store, which is empty in the standalone/plugin player — so it returns null
      // and the session is never updated (the send still fires below, which is why SysEx worked
      // but the on-screen selection didn't move). Update the session directly here (we have the
      // control), so radio/combobox selection reflects the click — matching the slider's behaviour.
      updatePanelPreviewSession(controlId, { valueOverrideEnabled: true, valueOverride: requestedValue });
      emitDeviceBindingsForPatch(control, {
        valueOverride: requestedValue,
      });
      return;
    }

    const currentSession = sessionFor(control);
    if (currentSession?.valueOverrideEnabled === true) {
      emitDeviceBindingsForPatch(control, {
        valueOverride: currentSession.valueOverride,
      });
    }
  }

  function patchControlSession(controlId, patch = {}) {
    const control = controlById(controlId);
    updatePanelPreviewSession(controlId, patch);
    if (control) emitDeviceBindingsForPatch(control, patch);
  }

  function customSessionValues(control) {
    return {
      ...seedCustomValues(control),
      ...(sessionFor(control)?.customValues ?? {}),
    };
  }

  function customMainChannelName(control) {
    const channels = getCustomValueChannels(control);
    return channels?.mainValue ? 'mainValue' : (Object.keys(channels ?? {})[0] ?? '');
  }

  function customMainBehaviorModule(control) {
    const channelName = customMainChannelName(control);
    return Object.values(getCustomBehaviors(control) ?? {}).find((entry) => entry?.valueChannel === channelName) ?? null;
  }

  function customHitZoneEntry(control, hitZoneName = '') {
    const name = String(hitZoneName ?? '').trim();
    if (!name) return null;
    const zone = getCustomHitZones(control)?.[name] ?? null;
    return zone ? { name, zone } : null;
  }

  function customHitZoneFromEventTarget(control, event) {
    const hitZoneElement = event?.target?.closest?.('.custom-hit-zone');
    if (!hitZoneElement) return null;
    const label = hitZoneElement.querySelector?.('span')?.textContent ?? '';
    return customHitZoneEntry(control, label);
  }

  function defaultCustomActivationHitZone(control) {
    const entries = Object.entries(getCustomHitZones(control) ?? {})
      .filter(([, zone]) => zone?.enabled !== false)
      .sort((left, right) => numberOr(right?.[1]?.priority, 0) - numberOr(left?.[1]?.priority, 0));
    const actionPriority = ['cyclevalue', 'togglevalue', 'setvalue', 'selectvalue', 'cellvalue', 'notevalue'];
    for (const wantedAction of actionPriority) {
      const match = entries.find(([, zone]) => String(zone?.action ?? '').trim().toLowerCase() === wantedAction);
      if (match) return { name: match[0], zone: match[1] };
    }
    const first = entries[0];
    return first ? { name: first[0], zone: first[1] } : null;
  }

  function patchCustomInteraction(control, hitZoneEntry, event, extraPatch = {}) {
    const controlId = getControlId(control);
    const rect = pointerActiveElement?.getBoundingClientRect?.()
      ?? event?.currentTarget?.getBoundingClientRect?.();
    const patch = resolveCustomInteractionPatch(control, sessionFor(control), hitZoneEntry, {
      rect,
      clientX: event?.clientX ?? rect?.left ?? 0,
      clientY: event?.clientY ?? rect?.top ?? 0,
      startClientX: pointerDownPoint?.x,
      startClientY: pointerDownPoint?.y,
      startValues: pointerCustomStartValues,
      fine: event?.shiftKey === true,
      coarse: event?.ctrlKey === true || event?.metaKey === true,
    });
    if (!controlId || !Object.keys(patch).length) return;
    patchControlSession(controlId, {
      ...patch,
      ...extraPatch,
    });
  }

  function updateCustomDragFromPointer(control, event) {
    if (!pointerCustomHitZone) return;
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return;
    const patch = resolveCustomInteractionPatch(control, sessionFor(control), pointerCustomHitZone, {
      rect,
      clientX: event.clientX,
      clientY: event.clientY,
      startClientX: pointerDownPoint?.x,
      startClientY: pointerDownPoint?.y,
      startValues: pointerCustomStartValues,
      fine: event?.shiftKey === true,
      coarse: event?.ctrlKey === true || event?.metaKey === true,
    });
    if (!Object.keys(patch).length) return;
    patchControlSession(getControlId(control), {
      ...patch,
      activeCustomBehavior: pointerCustomHitZone?.zone?.targetBehavior ?? '',
      activeCustomHitZone: pointerCustomHitZone?.name ?? '',
      dragging: true,
    });
  }

  function adjustCustomMainValue(control, direction = 1) {
    const channelName = customMainChannelName(control);
    const channel = getCustomValueChannels(control)?.[channelName] ?? null;
    if (!channel) return;
    const currentValues = customSessionValues(control);
    const currentValue = currentValues?.[channelName] ?? channel?.defaultValue ?? 0;
    const nextValue = snapCustomChannelValue(channel, numberOr(currentValue, 0) + (direction * numberOr(channel?.step, 0.01)));
    patchControlSession(getControlId(control), {
      customValues: {
        ...currentValues,
        [channelName]: nextValue,
      },
      customNormalizedValue: normalizeCustomChannelValue(channel, nextValue),
      valueOverrideEnabled: channelName === 'mainValue',
      valueOverride: channelName === 'mainValue' ? nextValue : sessionFor(control)?.valueOverride,
      focused: true,
      hover: true,
    });
  }

  function setCustomMainValue(control, value) {
    const channelName = customMainChannelName(control);
    const channel = getCustomValueChannels(control)?.[channelName] ?? null;
    if (!channel) return;
    const nextValue = snapCustomChannelValue(channel, value);
    patchControlSession(getControlId(control), {
      customValues: {
        ...customSessionValues(control),
        [channelName]: nextValue,
      },
      customNormalizedValue: normalizeCustomChannelValue(channel, nextValue),
      valueOverrideEnabled: channelName === 'mainValue',
      valueOverride: channelName === 'mainValue' ? nextValue : sessionFor(control)?.valueOverride,
      focused: true,
      hover: true,
    });
  }

  function patchCustomKeyboardActivation(control, event) {
    const resolvedPreview = resolvedPreviewFor(control);
    const hitZoneEntry = defaultCustomActivationHitZone(resolvedPreview?.control ?? control)
      ?? defaultCustomActivationHitZone(control);
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    patchCustomInteraction(control, hitZoneEntry, {
      ...event,
      currentTarget: event?.currentTarget,
      clientX: rect ? rect.left + rect.width / 2 : undefined,
      clientY: rect ? rect.top + rect.height / 2 : undefined,
    }, {
      focused: true,
      hover: true,
      pressed: false,
      dragging: false,
      inputModality: 'keyboard',
    });
  }

  function isPointInsideActiveHitbox(clientX, clientY) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function clearRangeInput(controlId) {
    patchControlSession(controlId, {
      valueInputActive: false,
      valueInputBuffer: '',
    });
  }

  function beginRangeFieldEdit(control) {
    const controlId = getControlId(control);
    patchControlSession(controlId, {
      focused: true,
      hover: true,
      valueInputActive: true,
      valueInputBuffer: resolveRangeDisplayValue(getBehavior(control), sessionFor(control)),
    });
  }

  function commitRangeFieldInput(control) {
    const controlId = getControlId(control);
    const session = sessionFor(control);
    const rawValue = session?.valueInputActive === true
      ? String(session?.valueInputBuffer ?? '')
      : resolveRangeDisplayValue(getBehavior(control), session);
    const parsed = parseRangeInputValue(getBehavior(control), rawValue);

    patchControlSession(controlId, {
      valueInputActive: false,
      valueInputBuffer: '',
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
  }

  function handleRangeFieldInput(control, event) {
    event.stopPropagation();
    const rawValue = String(event?.currentTarget?.value ?? '');
    const parsed = parseRangeInputValue(getBehavior(control), rawValue);
    patchControlSession(getControlId(control), {
      valueInputActive: true,
      valueInputBuffer: rawValue,
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
  }

  function handleRangeFieldKeyDown(control, event) {
    event.stopPropagation();

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      adjustRangeFromKey(control, event.key);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitRangeFieldInput(control);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      clearRangeInput(getControlId(control));
    }
  }

  function handleRangeFieldFocus(control, event) {
    event.stopPropagation();
    beginRangeFieldEdit(control);
  }

  function handleRangeFieldBlur(control, event) {
    event.stopPropagation();
    commitRangeFieldInput(control);
    patchControlSession(getControlId(control), {
      focused: false,
      pressed: false,
      dragging: false,
    });
  }

  function setRangeValue(control, nextValue, extraPatch = {}) {
    if (!isRangeControl(control)) return;
    patchControlSession(getControlId(control), {
      valueOverrideEnabled: true,
      valueOverride: snapRangeValue(getBehavior(control), nextValue),
      valueInputActive: false,
      valueInputBuffer: '',
      ...extraPatch,
    });
  }

  function setSliderRoleValue(control, role = 'current', nextValue = 0, extraPatch = {}) {
    if (!isSliderControl(control)) return;

    const behavior = getBehavior(control);
    const session = sessionFor(control);
    const legal = getSliderLegalRangeForHandle(behavior, session, role);
    const clamped = Math.max(legal.min, Math.min(legal.max, snapSliderValue(behavior, nextValue)));
    const currentRolePatch = role === 'current'
      ? {
          valueOverrideEnabled: true,
          valueOverride: clamped,
        }
      : {
          valueOverrideEnabled: false,
        };
    patchControlSession(getControlId(control), {
      activeHandle: role,
      valueInputRole: role,
      [`${role}ValueOverrideEnabled`]: true,
      [`${role}ValueOverride`]: clamped,
      ...currentRolePatch,
      valueInputActive: false,
      valueInputBuffer: '',
      ...extraPatch,
    });
  }

  function adjustRangeFromKey(control, key) {
    if (!isRangeControl(control)) return;

    const behavior = getBehavior(control);
    if (isTwoValueSpinner(control)) {
      const session = sessionFor(control);
      const handle = getRangeActiveHandle(session);
      switch (key) {
        case 'Home':
          setSpinnerHandleValue(control, handle, getRangeMin(behavior), { hover: true, focused: true });
          break;
        case 'End':
          setSpinnerHandleValue(control, handle, getRangeMax(behavior), { hover: true, focused: true });
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          adjustSpinnerActiveHandle(control, -1);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          adjustSpinnerActiveHandle(control, 1);
          break;
        case 'PageDown':
          adjustSpinnerActiveHandle(control, -1, 10);
          break;
        case 'PageUp':
          adjustSpinnerActiveHandle(control, 1, 10);
          break;
        default:
          break;
      }
      return;
    }
    if (isSliderControl(control)) {
      const role = currentSliderActiveHandle(control);
      const legal = getSliderLegalRangeForHandle(behavior, sessionFor(control), role);
      let nextValue = currentSliderRoleValue(control, role);

      switch (key) {
        case 'Home':
          nextValue = legal.min;
          break;
        case 'End':
          nextValue = legal.max;
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          nextValue = snapSliderValue(behavior, nextValue - numberOr(behavior?.step, 0.01));
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          nextValue = snapSliderValue(behavior, nextValue + numberOr(behavior?.step, 0.01));
          break;
        case 'PageDown':
          nextValue = snapSliderValue(behavior, nextValue - numberOr(behavior?.step, 0.01) * 10);
          break;
        case 'PageUp':
          nextValue = snapSliderValue(behavior, nextValue + numberOr(behavior?.step, 0.01) * 10);
          break;
        default:
          return;
      }

      setSliderRoleValue(control, role, nextValue);
      return;
    }

    let nextValue = currentRangeValue(control);

    switch (key) {
      case 'Home':
        nextValue = getRangeMin(behavior);
        break;
      case 'End':
        nextValue = getRangeMax(behavior);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        nextValue = adjustRangeValue(behavior, nextValue, -1);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        nextValue = adjustRangeValue(behavior, nextValue, 1);
        break;
      case 'PageDown':
        nextValue = adjustRangeValue(behavior, nextValue, -1, 10);
        break;
      case 'PageUp':
        nextValue = adjustRangeValue(behavior, nextValue, 1, 10);
        break;
      default:
        return;
    }

    setRangeValue(control, nextValue);
  }

  function handleRangeTextInput(control, key) {
    // The two-value spinner does not yet support inline digit typing (per-handle
    // editing is a follow-up); let those keys fall through for now.
    if (isTwoValueSpinner(control)) return false;

    const controlId = getControlId(control);
    const session = sessionFor(control);
    const currentBuffer = session?.valueInputActive === true ? String(session?.valueInputBuffer ?? '') : '';

    if (key === 'Escape') {
      clearRangeInput(controlId);
      return true;
    }

    if (key === 'Enter') {
      const parsed = parseRangeInputValue(getBehavior(control), currentBuffer);
      patchControlSession(controlId, {
        valueInputActive: false,
        valueInputBuffer: '',
        ...(parsed === null ? {} : {
          valueOverrideEnabled: true,
          valueOverride: parsed,
        }),
      });
      return true;
    }

    let nextBuffer = currentBuffer;
    if (key === 'Backspace') {
      nextBuffer = currentBuffer.slice(0, -1);
    } else if (key === 'Delete') {
      nextBuffer = '';
    } else if (isRangeTextInputKey(key)) {
      nextBuffer = `${currentBuffer}${key}`;
    } else {
      return false;
    }

    const parsed = parseRangeInputValue(getBehavior(control), nextBuffer);
    patchControlSession(controlId, {
      valueInputActive: true,
      valueInputBuffer: nextBuffer,
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
    return true;
  }

  function updateSliderRangeFromPointer(control, event, roleOverride = '') {
    if (!isRangeControl(control)) return;
    if (isSliderControl(control)) {
      const role = String(roleOverride || pointerSliderHandle || currentSliderActiveHandle(control)).trim().toLowerCase();
      setSliderRoleValue(control, role, sliderValueForPoint(control, event), { dragging: true });
      return;
    }

    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return;

    const behavior = getBehavior(control);
    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    const normalized = sliderScrub
      ? (sliderScrub.move(scrubSample(event)) ?? sliderScrub.value)
      : normalizedRangePointerValue(behavior, rect, event.clientX, event.clientY);
    setRangeValue(control, min + ((max - min) * normalized));
  }

  function updateScrubRangeFromPointer(control, event) {
    if (!isRangeControl(control) || !rangeScrub) return;
    const next = rangeScrub.move(scrubSample(event));
    if (next === null) return;
    setRangeValue(control, next, { dragging: true });
  }

  function maybeStartRangeDrag(control, event) {
    if (!isRangeControl(control) || draggingRange) return false;

    const behavior = getBehavior(control);
    // The two-value spinner uses click-to-select + steppers, not single-value
    // scrub, so a drag must not corrupt one shared value.
    if (isTwoValueSpinner(control)) return false;
    if (behavior?.dragEnabled !== true || isSliderRangeBehavior(behavior)) return false;

    const dx = Math.abs(event.clientX - pointerDownPoint.x);
    const dy = Math.abs(event.clientY - pointerDownPoint.y);
    if (Math.max(dx, dy) < 5) return false;

    draggingRange = true;
    // Anchor at the pointer-down point, not the threshold crossing, so the
    // first fed move spans the whole distance travelled — same feel as before.
    rangeScrub = createRangeScrub(behavior, pointerStartValue, getMouse(control));
    rangeScrub.begin({ x: pointerDownPoint.x, y: pointerDownPoint.y });
    patchControlSession(getControlId(control), { dragging: true });
    return true;
  }

  // Control-local coordinates (logical px) for a pointer/wheel event — the payload for interaction scripts.
  function controlLocalPoint(event) {
    const rect = event?.currentTarget?.getBoundingClientRect?.() ?? pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return { x: 0, y: 0 };
    const s = scale || 1;
    return { x: Math.round((event.clientX - rect.left) / s), y: Math.round((event.clientY - rect.top) / s) };
  }

  function handleRangeWheel(control, event) {
    // Fire onWheel for ANY control (before the range-only built-in below returns), so a script can
    // react to the wheel even on non-range controls. delta = +1 up / -1 down; raw deltas included.
    dispatchInteraction(getControlId(control), 'onWheel', {
      ...controlLocalPoint(event),
      delta: event.deltaY < 0 ? 1 : -1,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    });
    // Hardware style: while an LCD edit zone is active, the wheel acts as a data
    // knob — cycling the char under the caret (text) or the option (choice).
    if (lcdEdit.active && lcdEdit.id === getControlId(control)) {
      event.preventDefault();
      const dir = event.deltaY < 0 ? 1 : -1;
      if (lcdEdit.kind === 'choice') lcdCycleChoice(control, lcdEdit.sourceId, dir);
      else lcdApplyEdit(control, 'cycle', dir);
      return;
    }
    // Listbox: wheel scrolls the row viewport (one row per notch).
    if (isListboxControl(control)) {
      control = lbControl(control); // cascading: scroll only the visible rows
      const rect = event.currentTarget?.getBoundingClientRect?.();
      const viewH = numberOr(control?._children?.Transform?.height, rect ? rect.height / (scale || 1) : 0);
      const max = listboxMaxScroll(control, viewH, lbFilter(control));
      if (max <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      const cur = numberOr(sessionFor(control)?.listboxScrollTop, 0);
      // Smooth = pixel scroll (raw wheel delta); line = one row-stride per notch.
      const smooth = String(listboxConfig(control).scrollMode) === 'smooth';
      const step = smooth
        ? Math.max(-80, Math.min(80, event.deltaY))
        : listboxRowStride(control) * (event.deltaY > 0 ? 1 : -1);
      const next = Math.max(0, Math.min(max, cur + step));
      if (next !== cur) patchControlSession(getControlId(control), { listboxScrollTop: next });
      return;
    }
    if (isCustomComponent(control)) {
      if (isDisabled(control)) return;
      event.preventDefault();
      event.stopPropagation();
      const baseDirection = event.deltaY < 0 ? 1 : -1;
      adjustCustomMainValue(control, baseDirection * (isCustomMouseDirectionReversed(customMainBehaviorModule(control)) ? -1 : 1));
      return;
    }

    const behavior = getBehavior(control);
    if (!isRangeControl(control) || behavior?.wheelEnabled !== true) return;

    event.preventDefault();
    event.stopPropagation();
    const direction = resolveMouseDirection(behavior, event.deltaY < 0 ? 1 : -1);
    if (isTwoValueSpinner(control)) {
      adjustSpinnerActiveHandle(control, direction);
      return;
    }
    if (isSliderControl(control)) {
      const role = currentSliderActiveHandle(control);
      setSliderRoleValue(control, role, currentSliderRoleValue(control, role) + (direction * numberOr(behavior?.step, 0.01)), {
        hover: true,
        focused: true,
      });
      return;
    }

    setRangeValue(control, adjustRangeValue(behavior, currentRangeValue(control), direction), {
      hover: true,
      focused: true,
    });
  }

  function handleRangePointerClick(control, event) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return;

    if (isTwoValueSpinner(control)) {
      const zone = resolveSpinnerZone(rect, event.clientX);
      if (zone !== pointerDownZone) return;
      if (zone === 'low') {
        setSpinnerActiveHandle(control, 'start');
      } else if (zone === 'high') {
        setSpinnerActiveHandle(control, 'end');
      } else if (zone === 'decrement') {
        adjustSpinnerActiveHandle(control, -1);
      } else if (zone === 'increment') {
        adjustSpinnerActiveHandle(control, 1);
      }
      return;
    }

    const zone = resolveRangeZone(getBehavior(control), rect, event.clientX, event.clientY);
    if (zone !== pointerDownZone) return;
    if (zone === 'decrement') {
      setRangeValue(control, adjustRangeValue(getBehavior(control), currentRangeValue(control), -1));
    } else if (zone === 'increment') {
      setRangeValue(control, adjustRangeValue(getBehavior(control), currentRangeValue(control), 1));
    }
  }

  function removeWindowListeners() {
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
    rangeScrub?.end();
    rangeScrub = null;
    sliderScrub?.end();
    sliderScrub = null;
  }

  onDestroy(() => {
    removeWindowListeners();
    timedButtonPreview.destroy();
    momentaryButtonPreview.destroy();
  });

  $effect(() => {
    // The WHOLE tree, not orderedControls: this asks "does the control I am tracking still exist?",
    // and a control inside a Group is never in the top-level list. So the answer was always no for
    // a nested control, and the moment this effect re-ran mid-press it concluded the pressed pad
    // had gone, dropped the pointer state and removed the window listeners — after which the
    // release was never handled at all. It survived because the effect only re-runs when something
    // changes: a plain nested button held for a second was fine, while one whose own handler kept
    // writing (a roll firing notes on a timer) tore its own listeners off mid-gesture.
    const activeControlIds = [...controlsById.keys()];
    timedButtonPreview.syncKeys(activeControlIds);
    momentaryButtonPreview.syncKeys(activeControlIds);

    if (pointerActiveControlId && !controlsById.has(pointerActiveControlId)) {
      momentaryButtonPreview.cancel(pointerActiveControlId);
      pointerActiveControlId = '';
      pointerActiveElement = null;
      draggingRange = false;
      pointerDownZone = '';
      pointerSliderHandle = '';
      pointerCustomHitZone = null;
      pointerCustomStartValues = {};
      removeWindowListeners();
    }

    for (const control of orderedControls) {
      const controlId = getControlId(control);
      if (!controlId) continue;
      timedButtonPreview.syncSession(controlId, sessionFor(control));
    }
  });

  function handlePointerEnter(control) {
    if (isDisabled(control)) return;
    const controlId = getControlId(control);
    inspectPreviewControl(controlId);
    patchControlSession(controlId, { hover: true });
  }

  function handlePointerMove(control, event) {
    // onPointerMove: throttled (~30fps) hover-move over a control, control-local coords. Fires for any
    // control; the built-in custom-hit-zone hover tracking below still only runs for custom components.
    const moveAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (moveAt - lastPointerMoveDispatchAt > 33) {
      lastPointerMoveDispatchAt = moveAt;
      dispatchInteraction(getControlId(control), 'onPointerMove', controlLocalPoint(event));
    }
    // Listbox drag-scroll while the pointer is held down on it.
    if (listboxDrag && listboxDrag.id === getControlId(control)) {
      const dy = (event.clientY - listboxDrag.startY) / (scale || 1);
      if (Math.abs(dy) > 4) listboxDrag.moved = true;
      const max = listboxMaxScroll(lbControl(control), listboxViewport(control), lbFilter(control));
      const next = Math.max(0, Math.min(max, listboxDrag.startScroll - dy));
      patchControlSession(getControlId(control), { listboxScrollTop: next });
      return;
    }
    // Phrase Sequencer: paint cells as the pointer crosses them.
    if (phrasePaint && phrasePaint.id === getControlId(control)) {
      movePhrasePaint(control, controlLocalPoint(event));
      return;
    }
    // Zone Splitter: drag a split point along the keyboard.
    if (splitEdgeDrag && splitEdgeDrag.id === getControlId(control)) {
      moveSplitDrag(control, controlLocalPoint(event));
      return;
    }
    // Envelope: drag the grabbed node (constrained + snapped), live into session.
    if (envDrag && envDrag.id === getControlId(control)) {
      const geom = envGeomFor(control);
      const local = controlLocalPoint(event);
      const points = envWorkingPoints(control);
      const norm = envSnap(control, envFromPx(local.x, local.y, geom));
      const next = envDragNode(points, envDrag.index, norm.x, norm.y, { lockEndsX: true, lockYIndices: envLockY(control, points) });
      patchControlSession(getControlId(control), { envPoints: next, envActiveIndex: envDrag.index });
      emitControlPortFanout(envControlWith(control, next), 'continuous'); // fan-out live
      return;
    }
    // Mod Matrix: knob-drag the grabbed cell (up = more), live into session.
    if (matrixDrag && matrixDrag.id === getControlId(control)) {
      const geom = matrixGeomFor(control);
      const local = controlLocalPoint(event);
      const amount = matrixAmountFromDrag(matrixDrag.startAmount, local.y - matrixDrag.startY, geom.cellH, control);
      const next = matrixSetAmount(matrixControlWith(control, matrixWorkingAmounts(control)), matrixDrag.r, matrixDrag.c, amount);
      patchControlSession(getControlId(control), { matrixAmounts: next, matrixActiveCell: { r: matrixDrag.r, c: matrixDrag.c } });
      emitControlPortFanout(matrixControlWith(control, next), 'continuous'); // fan-out live
      return;
    }
    // Vector Joystick: move the puck to the pointer (absolute), live into session.
    if (joyDrag && joyDrag.id === getControlId(control)) {
      const local = controlLocalPoint(event);
      const pos = joyFromPx(local.x, local.y, joyGeomFor(control));
      patchControlSession(getControlId(control), { joyPos: pos, joyTrail: joyTrailNext(control, pos) });
      emitControlPortFanout(joyControlWith(control, pos), 'continuous');
      return;
    }
    // Crossfader: move the handle to the pointer (absolute + detent), live.
    if (xfadeDrag && xfadeDrag.id === getControlId(control)) {
      const local = controlLocalPoint(event);
      const mix = crossfaderDetent(crossfaderMixFromPx(local.x, local.y, xfadeGeomFor(control)), crossfaderConfig(control).detent);
      patchControlSession(getControlId(control), { xfadeMix: mix });
      emitControlPortFanout(xfadeControlWith(control, mix), 'continuous');
      return;
    }
    // Ribbon: track the finger along the strip (absolute), live.
    if (ribbonDrag && ribbonDrag.id === getControlId(control)) {
      const local = controlLocalPoint(event);
      const value = ribbonSnap(ribbonValueFromPx(local.x, local.y, ribGeomFor(control), ribbonVertical(control)), control);
      patchControlSession(getControlId(control), { ribbonValue: value, ribbonTouch: true });
      emitControlPortFanout(ribControlWith(control, value, true), 'continuous');
      return;
    }
    // Macro: vertical knob drag (up = more) → fan out all assignments live.
    if (macroDrag && macroDrag.id === getControlId(control)) {
      const local = controlLocalPoint(event);
      const value = Math.max(0, Math.min(1, macroDrag.startValue - (local.y - macroDrag.startY) / 150));
      patchControlSession(getControlId(control), { macroValue: value, dragging: true });
      emitControlPortFanout(macroControlWith(control, value), 'continuous');
      return;
    }
    // Orbit: drag a satellite to a new radius/angle → fan out all nodes live.
    if (orbitDrag && orbitDrag.id === getControlId(control)) {
      moveOrbitDrag(control, controlLocalPoint(event));
      return;
    }
    // Looper: paint the gesture into the recording lane.
    if (looperRec && looperRec.id === getControlId(control)) {
      moveLooperRec(control, controlLocalPoint(event));
      return;
    }
    // Router: reshape the transfer curve by dragging a node.
    if (routerDrag && routerDrag.id === getControlId(control)) {
      moveRouterDrag(control, controlLocalPoint(event));
      return;
    }
    // Timbre Space: move the blend puck or reposition an anchor.
    if (timbreDrag && timbreDrag.id === getControlId(control)) {
      moveTimbreDrag(control, controlLocalPoint(event));
      return;
    }
    // Turing: paint step bars as you drag across them.
    if (turingDrag && turingDrag.id === getControlId(control)) {
      paintTuringStep(control, controlLocalPoint(event));
      return;
    }
    // Kinetic: drag the ball (deriving a throw velocity).
    if (kineticDrag && kineticDrag.id === getControlId(control)) {
      moveKineticDrag(control, controlLocalPoint(event));
      return;
    }
    // Constellation: move the probe or reposition a preset star.
    if (constDrag && constDrag.id === getControlId(control)) {
      moveConstDrag(control, controlLocalPoint(event));
      return;
    }
    // Constraint: drag a member bar, re-running the solver.
    if (constraintDrag && constraintDrag.id === getControlId(control)) {
      solveConstraintFrom(control, controlLocalPoint(event));
      return;
    }
    // Chord Pad: slide across pads to play them legato.
    if (chordPress && chordPress.id === getControlId(control)) {
      moveChordPress(control, controlLocalPoint(event));
      return;
    }
    // Ribbon Keyboard: slide along the strip to change pitch.
    if (ribbonPress && ribbonPress.id === getControlId(control)) {
      moveRibbonPress(control, controlLocalPoint(event));
      return;
    }
    // Drum Pads: roll across the grid to strike each pad you cross.
    if (drumPress && drumPress.id === getControlId(control)) {
      moveDrumPress(control, controlLocalPoint(event));
      return;
    }
    // Listbox per-row hover: track the row under the pointer so the renderer can
    // highlight / animate it. Runs whether or not the pointer is held.
    if (isListboxControl(control) && !isDisabled(control)) {
      if (listboxConfig(control).hoverHighlight !== false) {
        const rect = event?.currentTarget?.getBoundingClientRect?.();
        if (rect) {
          control = lbControl(control); // cascading: hit-test only the visible rows
          const transformSection = control?._children?.Transform ?? null;
          const localY = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * (transformSection?.height ?? rect.height);
          const scrollTop = numberOr(sessionFor(control)?.listboxScrollTop, 0);
          const filter = lbFilter(control);
          const idx = listboxRowIndexAtPoint(control, localY, scrollTop, filter);
          const row = idx >= 0 ? listboxRows(control, filter)[idx] : undefined;
          const hoverIdx = isSelectableRow(row) ? idx : -1;
          if ((sessionFor(control)?.listboxHoverIndex ?? -1) !== hoverIdx) {
            patchControlSession(getControlId(control), { listboxHoverIndex: hoverIdx });
          }
        }
      }
      return;
    }
    if (isDisabled(control) || pointerActiveControlId) return;
    if (!isCustomComponent(control)) return;
    const controlId = getControlId(control);
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    const resolvedPreview = resolvedPreviewFor(control);
    const hoveredHitZone = resolveCustomHitZoneAtPoint(resolvedPreview?.control ?? control, rect, event.clientX, event.clientY, sessionFor(control)?.customValues ?? {})
      ?? customHitZoneFromEventTarget(resolvedPreview?.control ?? control, event)
      ?? customHitZoneFromEventTarget(control, event);
    const hoveredName = hoveredHitZone?.name ?? '';
    if ((sessionFor(control)?.hoveredCustomHitZone ?? '') === hoveredName) return;
    patchControlSession(controlId, {
      hover: true,
      hoveredCustomBehavior: hoveredHitZone?.zone?.targetBehavior ?? '',
      hoveredCustomHitZone: hoveredName,
    });
  }

  function handlePointerLeave(control) {
    if (isDisabled(control)) return;
    const controlId = getControlId(control);
    // Drop any listbox hover-row highlight when the pointer leaves.
    if (isListboxControl(control) && (sessionFor(control)?.listboxHoverIndex ?? -1) !== -1) {
      patchControlSession(controlId, { listboxHoverIndex: -1 });
    }
    if (pointerActiveControlId === controlId) {
      patchControlSession(controlId, {
        hover: false,
        hoveredCustomBehavior: '',
        hoveredCustomHitZone: '',
      });
      return;
    }

    patchControlSession(controlId, {
      hover: false,
      pressed: false,
      dragging: false,
      hoveredCustomBehavior: '',
      hoveredCustomHitZone: '',
    });
  }

  function handlePointerDown(control, event) {
    if (event.button !== 0) return;
    if (isDisabled(control)) return;

    // Double-click: two presses on the same control within 350ms (CanvasControl has no native dblclick).
    const downId = getControlId(control);
    const downAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const isDoubleTap = downId === lastPointerDownId && (downAt - lastPointerDownAt) < 350;
    if (isDoubleTap) {
      dispatchInteraction(downId, 'onDoubleClick', controlLocalPoint(event));
    }
    listboxDoubleTap = isDoubleTap && isListboxControl(control);
    lastPointerDownId = downId;
    lastPointerDownAt = downAt;
    const pointerDownLocal = controlLocalPoint(event);

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    event.currentTarget?.focus?.();
    lastInputMode = 'pointer';
    keyboardFocusControlId = '';
    pointerActiveControlId = getControlId(control);
    // Arm listbox drag-scroll (a moved drag suppresses the row select on release).
    listboxDrag = (isListboxControl(control) && listboxConfig(control).dragScroll === true)
      ? { id: getControlId(control), startY: event.clientY, startScroll: numberOr(sessionFor(control)?.listboxScrollTop, 0), moved: false }
      : null;
    // Envelope: grab the node under the cursor (or add/remove on double-click).
    handleEnvelopePointerDown(control, pointerDownLocal, isDoubleTap);
    // Mod Matrix: grab the cell under the cursor for a knob drag.
    handleMatrixPointerDown(control, pointerDownLocal);
    // Vector Joystick: jump the puck to the click point + start dragging.
    handleJoystickPointerDown(control, pointerDownLocal);
    // Crossfader: jump the handle to the click point + start dragging.
    handleCrossfaderPointerDown(control, pointerDownLocal);
    // Ribbon: absolute touch — jump the value to the finger + start tracking.
    handleRibbonPointerDown(control, pointerDownLocal);
    // Macro: grab the knob for a vertical drag.
    handleMacroPointerDown(control, pointerDownLocal);
    // Orbit: grab the satellite under the cursor for a radius/angle drag.
    handleOrbitPointerDown(control, pointerDownLocal);
    // Looper: press inside a lane to record a gesture.
    handleLooperPointerDown(control, pointerDownLocal);
    // Router: grab a transfer-curve node to reshape the response.
    handleRouterPointerDown(control, pointerDownLocal);
    // Timbre Space: grab an anchor, or jump + drag the blend puck.
    handleTimbrePointerDown(control, pointerDownLocal);
    // Turing: paint a step bar's value.
    handleTuringPointerDown(control, pointerDownLocal);
    // Kinetic: grab the ball to fling it.
    handleKineticPointerDown(control, pointerDownLocal);
    // Constellation: grab a preset star, or jump + drag the probe.
    handleConstellationPointerDown(control, pointerDownLocal);
    // Constraint: grab a member bar; the rule moves the others.
    handleConstraintPointerDown(control, pointerDownLocal);
    // Chord Pad: press a pad to sound its notes.
    handleChordPadPointerDown(control, pointerDownLocal);
    // Arp: click a step cell to mute/unmute it.
    handleArpPointerDown(control, pointerDownLocal);
    // Ribbon Keyboard: press the strip to sound the pitch there.
    handleNoteRibbonPointerDown(control, pointerDownLocal);
    // Drum Pads: strike the pad under the pointer.
    handleDrumPadsPointerDown(control, pointerDownLocal);
    // Panic: silence everything.
    handlePanicPointerDown(control, pointerDownLocal);
    // Transport: play/stop, or tap tempo.
    handleTransportPointerDown(control, pointerDownLocal);
    // Zone Splitter: grab a split point, or audition a key.
    handleSplitZonePointerDown(control, pointerDownLocal);
    // Phrase Sequencer: toggle a cell, or paint a run of them.
    handlePhrasePointerDown(control, pointerDownLocal);
    // Phrase Recorder: arm it (or change your mind).
    handleRecorderPointerDown(control, pointerDownLocal);
    // Harmoniser: audition a key.
    handleHarmoniserPointerDown(control, pointerDownLocal);
    // Setlist: jump to the scene under the pointer.
    handleSetlistPointerDown(control, pointerDownLocal);
    // "@active" zone source — but a display itself never counts as the active
    // control (clicking a screen shouldn't make its own zones show the screen).
    if (pointerActiveControlId && !['LcdDisplay', 'PixelDisplay'].includes(String(control?._children?.Core?.controlType ?? ''))) {
      lcdActiveAt[pointerActiveControlId] = Date.now(); lcdActiveId = pointerActiveControlId;
    }
    // Clicking an LCD with an editable zone focuses it; clicking anything else
    // ends any active edit. Text targets place the caret at the end; a choice
    // target just arms the cycler (wheel/arrows change the option).
    const editTargets = screenEditTargets(control);
    if (editTargets.length) {
      // Pick the edit field under the click (falling back to the first one);
      // clicking inside a text field places the caret at the clicked character.
      const dtype = String(control?._children?.Core?.controlType ?? '');
      let target;
      let caret;
      if (dtype === 'PixelDisplay') {
        target = editTargets.find((t) => pixelElementContainsPoint(control, t.element, pointerDownLocal)) ?? editTargets[0];
        caret = target.kind === 'text' ? pixelCaretFromPoint(control, target.element, pointerDownLocal) : 0;
      } else {
        const displayCols = Math.max(1, Math.round(numberOr(lcdDisplayOf(control)?.cols, 16)));
        const cell = lcdCellFromPoint(control, pointerDownLocal);
        target = editTargets.find((t) => lcdZoneContainsCell(t.zone, cell, displayCols)) ?? editTargets[0];
        caret = target.kind === 'text'
          ? lcdCaretFromCell(target.zone, cell, displayCols, lcdEditText(control, target.sourceId).length)
          : 0;
      }
      lcdArmEdit(control, target, caret);
    } else if (lcdEdit.active) {
      lcdEdit = { ...LCD_EDIT_IDLE };
    }
    if (openComboboxControlId && openComboboxControlId !== pointerActiveControlId) {
      openComboboxControlId = '';
    }
    pointerActiveElement = event.currentTarget;
    pointerDownPoint = { x: event.clientX, y: event.clientY };
    pointerDownZone = '';
    pointerSliderHandle = '';
    sliderScrub = null;
    pointerCustomHitZone = null;
    pointerCustomStartValues = {};
    pointerStartValue = isSliderControl(control)
      ? currentSliderRoleValue(control, currentSliderActiveHandle(control))
      : currentRangeValue(control);
    draggingRange = isRangeControl(control) && isSliderRangeBehavior(getBehavior(control));
    inspectPreviewControl(pointerActiveControlId);

    if (isCustomComponent(control)) {
      const rect = pointerActiveElement?.getBoundingClientRect?.();
      const resolvedPreview = resolvedPreviewFor(control);
      pointerCustomHitZone = resolveCustomHitZoneAtPoint(resolvedPreview?.control ?? control, rect, event.clientX, event.clientY, sessionFor(control)?.customValues ?? {})
        ?? customHitZoneFromEventTarget(resolvedPreview?.control ?? control, event)
        ?? customHitZoneFromEventTarget(control, event);
      pointerCustomStartValues = { ...(sessionFor(control)?.customValues ?? {}) };
      const action = String(pointerCustomHitZone?.zone?.action ?? '').trim().toLowerCase();
      const isDragAction = action === 'dragvalue' || action === 'scrubvalue' || action === '';
      if (isDragAction) {
        patchCustomInteraction(control, pointerCustomHitZone, event, {
          hover: true,
          pressed: false,
          focused: false,
          dragging: true,
        });
        updateCustomDragFromPointer(control, event);
      } else {
        patchControlSession(pointerActiveControlId, {
          hover: true,
          pressed: false,
          focused: false,
          dragging: false,
          activeCustomBehavior: pointerCustomHitZone?.zone?.targetBehavior ?? '',
          activeCustomHitZone: pointerCustomHitZone?.name ?? '',
        });
      }
      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', handleWindowPointerUp);
      return;
    }

    if (isRangeControl(control)) {
      const rect = pointerActiveElement?.getBoundingClientRect?.();
      pointerDownZone = isTwoValueSpinner(control)
        ? resolveSpinnerZone(rect, event.clientX)
        : resolveRangeZone(getBehavior(control), rect, event.clientX, event.clientY);
    }

    let nextSliderHandle = '';
    if (isSliderControl(control)) {
      const directHandle = pickDirectSliderHandle(control, event);
      const clickMode = String(getBehavior(control)?.trackClickMode ?? 'moveNearestHandle').trim().toLowerCase();
      nextSliderHandle = directHandle || (
        clickMode === 'moveactivehandle'
          ? currentSliderActiveHandle(control)
          : pickNearestSliderHandle(control, event)
      );
      pointerSliderHandle = nextSliderHandle;
      patchControlSession(pointerActiveControlId, {
        activeHandle: nextSliderHandle,
        valueInputRole: nextSliderHandle,
      });
    }

    // Folded into the SAME patch, not sent after it: a second patch in this tick arrives while the
    // script runtime is still dispatching the first and is dropped, which is how press-to-talk came
    // to report its release and never its press.
    const momentaryPress = momentaryButtonPreview.beginPress(pointerActiveControlId, getBehavior(control));
    patchControlSession(pointerActiveControlId, {
      hover: true,
      pressed: true,
      focused: false,
      dragging: draggingRange,
      pointerX: pointerDownLocal.x,
      pointerY: pointerDownLocal.y,
      pointerButton: event.button,
      pointerModifiers: (event.shiftKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.altKey ? 4 : 0) | (event.metaKey ? 8 : 0),
      ...(momentaryPress ?? {}),
    });
    if (isTimedButtonBehavior(getBehavior(control))) {
      timedButtonPreview.beginPress(pointerActiveControlId, getBehavior(control));
    }

    if (draggingRange) {
      const rect = pointerActiveElement?.getBoundingClientRect?.();
      const dragBehavior = getBehavior(control);
      const dragMouse = getMouse(control);
      if (rect && (!isSliderControl(control) || isLinearSliderGeometry(dragBehavior))) {
        sliderScrub = isSliderControl(control)
          ? createSliderTrackScrub(dragBehavior, dragMouse)
          : createRangeTrackScrub(dragBehavior, dragMouse);
        sliderScrub.begin(scrubSample(event), { bounds: rect, jumpToPointer: true });
      } else if (rect && getCircularSliderDragMode(dragBehavior) !== 'absolute') {
        // Relative dial drag: start from the picked handle's value, no jump.
        const min = getRangeMin(dragBehavior);
        const span = getRangeMax(dragBehavior) - min;
        const role = nextSliderHandle || currentSliderActiveHandle(control);
        sliderScrub = createCircularSliderScrub(dragBehavior, span > 0 ? (currentSliderRoleValue(control, role) - min) / span : 0, dragMouse);
        sliderScrub.begin(scrubSample(event), { bounds: rect });
      }
      updateSliderRangeFromPointer(control, event, nextSliderHandle);
    }

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  }

  function handleWindowPointerMove(event) {
    if (!pointerActiveControlId) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    const activeControl = controlById(pointerActiveControlId);
    if (!activeControl || isDisabled(activeControl)) return;

    if (isCustomComponent(activeControl)) {
      updateCustomDragFromPointer(activeControl, event);
      return;
    }

    if (!isRangeControl(activeControl)) return;
    if (isSliderRangeBehavior(getBehavior(activeControl))) {
      if (!draggingRange) return;
      updateSliderRangeFromPointer(activeControl, event, pointerSliderHandle);
      return;
    }

    if (maybeStartRangeDrag(activeControl, event)) {
      updateScrubRangeFromPointer(activeControl, event);
      return;
    }

    if (draggingRange) {
      updateScrubRangeFromPointer(activeControl, event);
    }
  }

  function handleWindowPointerUp(event) {
    if (!pointerActiveControlId) return;
    event.preventDefault?.();
    event.stopPropagation?.();

    const activeId = pointerActiveControlId;
    const activeControl = controlById(activeId);
    const inside = isPointInsideActiveHitbox(event.clientX, event.clientY);
    const activeBehavior = getBehavior(activeControl);

    phrasePaint = null;
    // Commit a split-point drag; release an auditioned key.
    if (splitEdgeDrag && activeControl) releaseSplitDrag(activeControl);
    if (splitKeyPress && activeControl) {
      splitReleaseKey(activeControl, splitKeyPress.note);
      splitKeyPress = null;
    }
    // Release a key auditioned on the Harmoniser.
    releaseHarmoniserPress();

    // Commit an envelope node drag: persist the working points to the model,
    // then drop the live session override so the model is the source of truth.
    if (envDrag && activeControl) {
      const finalPoints = sessionFor(activeControl)?.envPoints;
      if (Array.isArray(finalPoints)) {
        commitEnvPoints(activeControl, finalPoints);
        emitControlPortFanout(envControlWith(activeControl, finalPoints), 'commit'); // fan-out on release
      }
      patchControlSession(activeId, { envPoints: undefined });
      envDrag = null;
    }

    // Commit a matrix cell drag: persist the amounts, drop the session override.
    if (matrixDrag && activeControl) {
      const finalAmounts = sessionFor(activeControl)?.matrixAmounts;
      if (Array.isArray(finalAmounts)) {
        commitMatrixAmounts(activeControl, finalAmounts);
        emitControlPortFanout(matrixControlWith(activeControl, finalAmounts), 'commit');
      }
      patchControlSession(activeId, { matrixAmounts: undefined });
      matrixDrag = null;
    }

    // Release a joystick puck: commit its position, then spring-return to centre
    // (if enabled) which glides + commits the rest position itself.
    if (joyDrag && activeControl) {
      const pos = joyWorkingPos(activeControl);
      joyDrag = null;
      if (!startJoystickReturn(activeControl)) {
        commitJoyPos(activeControl, pos);
        patchControlSession(activeId, { joyPos: undefined, joyTrail: undefined });
      }
    }

    // Release a crossfader handle: commit its mix, then spring-return if enabled.
    if (xfadeDrag && activeControl) {
      const mix = xfadeWorkingMix(activeControl);
      xfadeDrag = null;
      if (!startCrossfaderReturn(activeControl)) {
        commitXfadeMix(activeControl, mix);
        patchControlSession(activeId, { xfadeMix: undefined });
      }
    }

    // Release a ribbon: touch-off gate + latch / snap / glide to rest.
    if (ribbonDrag && activeControl) {
      ribbonDrag = null;
      releaseRibbon(activeControl);
    }

    // Release a macro knob: commit the position, drop the session override.
    if (macroDrag && activeControl) {
      const value = macroWorkingValue(activeControl);
      macroDrag = null;
      commitMacroValue(activeControl, value);
      emitControlPortFanout(macroControlWith(activeControl, value), 'commit');
      patchControlSession(activeId, { macroValue: undefined, dragging: false });
    }

    // Release an orbit satellite: commit the node array, drop the override.
    if (orbitDrag && activeControl) {
      orbitDrag = null;
      releaseOrbitDrag(activeControl);
    }

    // Release a looper recording: commit the lane's gesture.
    if (looperRec && activeControl) {
      looperRec = null;
      releaseLooperRec(activeControl);
    }

    // Release a router curve node: commit the reshaped curve.
    if (routerDrag && activeControl) {
      routerDrag = null;
      releaseRouterDrag(activeControl);
    }

    // Release a timbre puck / anchor: commit its position.
    if (timbreDrag && activeControl) {
      timbreDrag = null;
      releaseTimbreDrag(activeControl);
    }

    // Release a turing edit: commit the seeded sequence.
    if (turingDrag && activeControl) {
      turingDrag = null;
      releaseTuringDrag(activeControl);
    }

    // Release the kinetic ball: it flies off with the fling velocity.
    if (kineticDrag && activeControl) {
      const kc = activeControl;
      kineticDrag = null;
      releaseKineticDrag(kc);
    }

    // Release a constellation probe / star: commit its position.
    if (constDrag && activeControl) {
      constDrag = null;
      releaseConstDrag(activeControl);
    }

    // Release a constraint member: commit the solved values.
    if (constraintDrag && activeControl) {
      constraintDrag = null;
      releaseConstraintDrag(activeControl);
    }

    // Release a chord pad: note-off (unless latched).
    if (chordPress && activeControl) {
      const cpc = activeControl;
      chordPress = null;
      releaseChordPress(cpc);
    }

    // Release the ribbon: note-off + recentre the bend (unless latched).
    if (ribbonPress && activeControl && ribbonPress.id === getControlId(activeControl)) {
      releaseRibbonPress(activeControl);
    }

    // Release a drum pad: note-off for held (momentary) strikes.
    if (drumPress && activeControl && drumPress.id === getControlId(activeControl)) {
      const dpc = activeControl;
      releaseDrumPress(dpc);
      drumPress = null;
    }

    if (isCustomComponent(activeControl)) {
      const action = String(pointerCustomHitZone?.zone?.action ?? '').trim().toLowerCase();
      if (inside && activeControl && !isDisabled(activeControl) && action && action !== 'dragvalue' && action !== 'scrubvalue') {
        patchCustomInteraction(activeControl, pointerCustomHitZone, event, {
          hover: inside,
          pressed: false,
          dragging: false,
          inputModality: 'pointer',
        });
      } else {
        patchControlSession(activeId, {
          hover: inside,
          pressed: false,
          dragging: false,
          inputModality: 'pointer',
        });
      }

      pointerActiveControlId = '';
      pointerActiveElement = null;
      draggingRange = false;
      pointerDownZone = '';
      pointerSliderHandle = '';
      pointerCustomHitZone = null;
      pointerCustomStartValues = {};
      const abandoned = momentaryButtonPreview.releasePress(activeId, activeBehavior);
      if (abandoned) patchControlSession(activeId, abandoned);
      removeWindowListeners();
      return;
    }

    if (!draggingRange && inside && activeControl && !isDisabled(activeControl)) {
      if (isRangeControl(activeControl) && !isSliderRangeBehavior(getBehavior(activeControl))) {
        handleRangePointerClick(activeControl, event);
      } else if (isTimedButtonBehavior(activeBehavior)) {
        timedButtonPreview.releasePress(activeId, activeBehavior, { inside });
      } else if (String(getBehavior(activeControl)?.family ?? 'trigger') === 'select') {
        if (isListboxControl(activeControl)) {
          // A moved drag-scroll suppresses the row select on release.
          if (!(listboxDrag && listboxDrag.moved)) {
            const row = resolveListboxPreviewValue(activeControl, event.clientX, event.clientY);
            if (row) {
              const mode = String(listboxConfig(activeControl).confirmMode ?? 'single');
              if (mode === 'double' && listboxDoubleTap) confirmListboxPending(activeControl, row);
              else activateListboxRow(activeControl, row);
            }
          }
          patchControlSession(activeId, { focused: true, hover: true });
        } else if (isComboboxControl(activeControl)) {
          openComboboxControlId = openComboboxControlId === activeId ? '' : activeId;
          patchControlSession(activeId, {
            focused: true,
            hover: true,
          });
        } else {
          const value = resolveRadioGroupPreviewValue(activeControl, event.clientX, event.clientY);
          commitSelectActionAndEmit(activeControl, {
            value,
          });
        }
      }
    } else if (isTimedButtonBehavior(activeBehavior)) {
      timedButtonPreview.releasePress(activeId, activeBehavior, { inside });
    }
    const momentaryRelease = momentaryButtonPreview.releasePress(activeId, activeBehavior);

    patchControlSession(activeId, {
      hover: inside,
      pressed: false,
      dragging: false,
      ...(momentaryRelease ?? {}),
    });

    pointerActiveControlId = '';
    pointerActiveElement = null;
    draggingRange = false;
    pointerDownZone = '';
    pointerSliderHandle = '';
    pointerCustomHitZone = null;
    pointerCustomStartValues = {};
    listboxDrag = null;
    removeWindowListeners();
  }

  function handleFocus(control) {
    if (isDisabled(control)) return;
    if (lastInputMode !== 'keyboard') return;

    const controlId = getControlId(control);
    keyboardFocusControlId = controlId;
    inspectPreviewControl(controlId);
    patchControlSession(controlId, { focused: true });
  }

  function handleBlur(control) {
    const controlId = getControlId(control);
    if (lcdEdit.active && lcdEdit.id === controlId) {
      lcdEdit = { ...LCD_EDIT_IDLE };
    }
    if (isTimedButtonBehavior(getBehavior(control))) {
      timedButtonPreview.cancel(controlId);
    }

    if (keyboardFocusControlId === controlId) {
      keyboardFocusControlId = '';
    }

    if (openComboboxControlId === controlId) {
      openComboboxControlId = '';
    }

    patchControlSession(controlId, {
      focused: false,
      pressed: false,
      dragging: false,
      valueInputActive: false,
    });

    if (pointerActiveControlId === controlId) {
      pointerActiveControlId = '';
      pointerActiveElement = null;
      draggingRange = false;
      pointerSliderHandle = '';
      removeWindowListeners();
    }
  }

  function handleKeyDown(control, event) {
    if (isDisabled(control)) return;

    const controlId = getControlId(control);
    lastInputMode = 'keyboard';
    keyboardFocusControlId = controlId;
    inspectPreviewControl(controlId);

    // Listbox keyboard navigation (arrows / page / home / end) + type-ahead.
    if (isListboxControl(control)) {
      if (handleListboxKey(control, event)) return;
      if (handleListboxTypeAhead(control, event)) return;
    }

    // On-screen editing takes over the keyboard while an LCD zone is active.
    if (lcdEdit.active && lcdEdit.id === controlId) {
      const key = event.key;
      if (key === 'Enter') { event.preventDefault(); lcdEdit = { ...LCD_EDIT_IDLE }; event.currentTarget?.blur?.(); return; }
      if (key === 'Escape') {
        // Cancel: restore the text as it was when editing started.
        event.preventDefault();
        if (lcdEdit.kind === 'text') lcdWriteEditText(control, lcdEdit.sourceId, lcdEdit.original);
        lcdEdit = { ...LCD_EDIT_IDLE };
        event.currentTarget?.blur?.();
        return;
      }
      if (key === 'Tab') {
        // Cycle between the layout's edit fields (Shift+Tab goes back).
        event.preventDefault();
        const targets = screenEditTargets(control);
        if (targets.length > 1) {
          const idx = targets.findIndex((t) => String(t.id ?? t.zone?.id ?? '') === lcdEdit.zoneId);
          const next = targets[(((idx < 0 ? 0 : idx) + (event.shiftKey ? -1 : 1)) % targets.length + targets.length) % targets.length];
          lcdArmEdit(control, next, next.kind === 'text' ? lcdEditText(control, next.sourceId).length : 0);
        }
        return;
      }
      if (lcdEdit.kind === 'choice') {
        // Choice cycler: arrows move through the bound control's options.
        if (key === 'ArrowUp' || key === 'ArrowRight') { event.preventDefault(); lcdCycleChoice(control, lcdEdit.sourceId, 1); return; }
        if (key === 'ArrowDown' || key === 'ArrowLeft') { event.preventDefault(); lcdCycleChoice(control, lcdEdit.sourceId, -1); return; }
        return;
      }
      // Free-text editing (Label / @edit).
      if (key === 'ArrowLeft') { event.preventDefault(); lcdApplyEdit(control, 'left'); return; }
      if (key === 'ArrowRight') { event.preventDefault(); lcdApplyEdit(control, 'right'); return; }
      if (key === 'Home') { event.preventDefault(); lcdApplyEdit(control, 'home'); return; }
      if (key === 'End') { event.preventDefault(); lcdApplyEdit(control, 'end'); return; }
      if (key === 'Backspace') { event.preventDefault(); lcdApplyEdit(control, 'backspace'); return; }
      if (key === 'Delete') { event.preventDefault(); lcdApplyEdit(control, 'delete'); return; }
      // Hardware style: Up/Down cycles the char under the caret through the charset.
      if (key === 'ArrowUp') { event.preventDefault(); lcdApplyEdit(control, 'cycle', 1); return; }
      if (key === 'ArrowDown') { event.preventDefault(); lcdApplyEdit(control, 'cycle', -1); return; }
      // Printable single characters insert (PC style).
      if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        lcdApplyEdit(control, 'insert', key);
        return;
      }
      return;
    }

    if (isRangeControl(control) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (handleRangeTextInput(control, event.key)) {
        event.preventDefault();
        event.currentTarget?.focus?.();
        patchControlSession(controlId, {
          focused: true,
          hover: true,
        });
        return;
      }
    }

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (event.repeat) return;
      event.currentTarget?.focus?.();
      patchControlSession(controlId, {
        focused: true,
        hover: true,
        pressed: isCustomComponent(control) ? false : true,
      });
      if (isTimedButtonBehavior(getBehavior(control))) {
        timedButtonPreview.beginPress(controlId, getBehavior(control));
      }
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      if (isCustomComponent(control)) {
        event.preventDefault();
        event.currentTarget?.focus?.();
        patchControlSession(controlId, {
          focused: true,
          hover: true,
        });
        const channel = getCustomValueChannels(control)?.[customMainChannelName(control)] ?? null;
        if (event.key === 'Home' && channel) {
          setCustomMainValue(control, channel?.min ?? 0);
        } else if (event.key === 'End' && channel) {
          setCustomMainValue(control, channel?.max ?? 1);
        } else {
          adjustCustomMainValue(control, (event.key === 'ArrowLeft' || event.key === 'ArrowDown') ? -1 : 1);
        }
        return;
      }
      if (!isRangeControl(control)) return;
      event.preventDefault();
      event.currentTarget?.focus?.();
      patchControlSession(controlId, {
        focused: true,
        hover: true,
      });
      adjustRangeFromKey(control, event.key);
    }

    if ((event.key === 'PageUp' || event.key === 'PageDown') && isRangeControl(control) && !isCustomComponent(control)) {
      event.preventDefault();
      event.currentTarget?.focus?.();
      patchControlSession(controlId, { focused: true, hover: true });
      adjustRangeFromKey(control, event.key);
    }
  }

  function handleKeyUp(control, event) {
    if (isDisabled(control)) return;
    if (event.key !== ' ' && event.key !== 'Enter') return;

    event.preventDefault();
    const controlId = getControlId(control);
    if (isTimedButtonBehavior(getBehavior(control))) {
      timedButtonPreview.releasePress(controlId, getBehavior(control), { inside: true });
    } else if (isCustomComponent(control)) {
      patchCustomKeyboardActivation(control, event);
    } else if (String(getBehavior(control)?.family ?? 'trigger') === 'select') {
      if (isComboboxControl(control)) {
        openComboboxControlId = openComboboxControlId === controlId ? '' : controlId;
      } else {
        commitSelectActionAndEmit(control);
      }
    }
    patchControlSession(controlId, {
      focused: true,
      hover: true,
      pressed: false,
    });
  }

  function previewRoleFor(control) {
    if (isCustomComponent(control)) return previewRoleForCustomComponent(control);

    const behavior = getBehavior(control);
    const family = String(behavior?.family ?? 'trigger');
    const role = String(behavior?.role ?? '').trim().toLowerCase();
    const buttonType = String(behavior?.buttonType ?? '').trim().toLowerCase();

    if (family === 'range') return isSliderRangeBehavior(behavior) ? 'slider' : 'spinbutton';
    if (buttonType === 'combobox') return 'combobox';
    if (buttonType === 'radio') return 'radiogroup';
    if (role === 'radio' || role === 'segmented') return 'radio';
    if (role === 'toggle' || role === 'checkbox') return 'checkbox';
    return 'button';
  }

  function previewRoleForCustomComponent(control) {
    const hitZones = Object.values(getCustomHitZones(control) ?? {}).filter((zone) => zone?.enabled !== false);
    const behaviors = getCustomBehaviors(control);
    const behaviorNames = new Set(hitZones.map((zone) => String(zone?.targetBehavior ?? '').trim()).filter(Boolean));
    const behaviorList = [...behaviorNames].map((name) => behaviors?.[name]).filter(Boolean);
    if (!behaviorList.length) {
      behaviorList.push(...Object.values(behaviors ?? {}).filter(Boolean));
    }

    const hasMultipleTargets = hitZones.length > 1 || behaviorList.length > 1;
    if (hasMultipleTargets) return 'group';

    const behavior = behaviorList[0] ?? null;
    const role = String(behavior?.role ?? '').trim().toLowerCase();
    const type = String(behavior?.type ?? '').trim().toLowerCase();
    const geometry = String(behavior?.geometry ?? '').trim().toLowerCase();
    const action = String(hitZones[0]?.action ?? type ?? '').trim().toLowerCase();

    if (role.includes('button') || ['button', 'cycle', 'toggle'].includes(type) || ['cyclevalue', 'togglevalue', 'press'].includes(action)) {
      return 'button';
    }

    if (
      role.includes('slider')
      || role.includes('dial')
      || ['slider', 'dial', 'ring'].includes(type)
      || ['linear', 'horizontal', 'vertical', 'linear-vertical', 'circular', 'ring', 'dial', 'arc'].includes(geometry)
      || ['dragvalue', 'setvalue', 'scrubvalue'].includes(action)
    ) {
      return 'slider';
    }

    if (role.includes('meter') || type === 'meter') return 'meter';
    return 'group';
  }

  function previewAriaCheckedFor(control) {
    const role = previewRoleFor(control);
    if (role !== 'radio' && role !== 'checkbox') return undefined;
    return sessionFor(control)?.checked === true;
  }

  function previewTabIndexFor(control) {
    if (isDisabled(control)) return undefined;
    const role = previewRoleFor(control);
    return ['button', 'checkbox', 'radio', 'combobox', 'slider', 'spinbutton'].includes(role) ? 0 : undefined;
  }

  // All per-control preview props as one object, so the same set can be spread
  // onto top-level controls AND threaded to nested children (childPreviewPropsFor).
  // Called inside the template, so it stays reactive to the stores/state it reads.
  function previewPropsFor(control) {
    const resolvedPreview = resolvedPreviewFor(control);
    const behavior = getBehavior(control);
    const session = sessionFor(control);
    const coreName = control?._children?.Core?.name ?? control?._children?.Core?.controlType ?? 'Control';
    return {
      resolvedControlOverride: resolvedPreview?.control ?? control,
      interactionRuntimeOverride: resolvedPreview?.runtime ?? null,
      previewSessionOverride: session,
      renderIdNamespace: previewRenderIdNamespace,
      previewRole: previewRoleFor(control),
      previewTabIndex: previewTabIndexFor(control),
      previewAriaLabel: `${coreName} preview`,
      previewAriaDisabled: isDisabled(control),
      previewAriaChecked: previewAriaCheckedFor(control),
      previewAriaExpanded: isComboboxControl(control) ? openComboboxControlId === getControlId(control) : undefined,
      previewAriaValueNow: isRangeControl(control) ? currentRangeValue(control) : undefined,
      previewAriaValueMin: isRangeControl(control) ? getRangeMin(behavior) : undefined,
      previewAriaValueMax: isRangeControl(control) ? getRangeMax(behavior) : undefined,
      previewAriaValueText: isRangeControl(control) ? resolveRangeDisplayValue(behavior, session) : undefined,
      previewValueField: previewRoleFor(control) === 'spinbutton' && !isTwoValueSpinner(control) ? {
        value: resolveRangeDisplayValue(behavior, session),
        disabled: isDisabled(control),
        inputMode: String(behavior?.valueType ?? '') === 'int' ? 'numeric' : 'decimal',
        ariaLabel: `${coreName} value`,
        tabIndex: -1,
      } : null,
      previewEditableFields: spinnerEditableFields(control),
      previewKeyboardFocus: keyboardFocusControlId === getControlId(control),
      previewHighlighted: $showPreviewSelectionRing && $previewInspectedControlId === getControlId(control),
      onpreviewpointerenter: () => handlePointerEnter(control),
      onpreviewpointerleave: () => handlePointerLeave(control),
      onpreviewpointermove: (event) => handlePointerMove(control, event),
      onpreviewpointerdown: (event) => handlePointerDown(control, event),
      onpreviewwheel: (event) => handleRangeWheel(control, event),
      onpreviewfocus: () => handleFocus(control),
      onpreviewblur: () => handleBlur(control),
      onpreviewkeydown: (event) => handleKeyDown(control, event),
      onpreviewkeyup: (event) => handleKeyUp(control, event),
      onpreviewvaluefieldinput: (event) => handleRangeFieldInput(control, event),
      onpreviewvaluefieldkeydown: (event) => handleRangeFieldKeyDown(control, event),
      onpreviewvaluefieldfocus: (event) => handleRangeFieldFocus(control, event),
      onpreviewvaluefieldblur: (event) => handleRangeFieldBlur(control, event),
      onpreviewfieldinput: (role, event) => handleSpinnerFieldInput(control, role, event),
      onpreviewfieldkeydown: (role, event) => handleSpinnerFieldKeyDown(control, role, event),
      onpreviewfieldfocus: (role, event) => handleSpinnerFieldFocus(control, role, event),
      onpreviewfieldblur: (role, event) => handleSpinnerFieldBlur(control, role, event),
      previewTextField: isTextInputControl(control) ? {
        value: currentTextValue(control),
        placeholder: String(control?._children?.Text?.content ?? ''),
        disabled: isDisabled(control),
      } : null,
      onpreviewtextkeydown: (event) => handleTextFieldKeyDown(control, event),
      onpreviewtextfocus: () => handleTextFieldFocus(control),
      onpreviewtextblur: (event) => handleTextFieldBlur(control, event),
      previewListboxFilter: isListboxControl(control) && listboxConfig(control).filterBox === true ? {
        visible: true,
        value: lbFilter(control),
        height: listboxFilterHeight(control),
      } : null,
      onpreviewlistboxfilter: (event) => handleListboxFilterInput(control, event),
    };
  }
</script>

<!-- Esc is the emergency stop. Window-level so it works wherever focus is,
     but it defers to any control that already claimed the key. -->
<svelte:window onkeydown={handleGlobalKeyDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="panel-surface preview-surface"
  style="width: {panel.width}px; height: {panel.height}px; transform: scale({scale}); transform-origin: 0 0;"
  use:bindSurface
>
  {#each panel.bgLayerOrder ?? DEFAULT_LAYER_ORDER as layerId}
    {#if bgLayers[layerId]}
      <div class="bg-layer" style={bgLayers[layerId]}></div>
    {/if}
  {/each}

  {#if gridStyle}
    <div class="grid-overlay" style={gridStyle}></div>
  {/if}

  {#if $showGuides}
    <GuideLines {scale} panelWidth={panel.width} panelHeight={panel.height} />
  {/if}

  {#each previewPlan.items as item (item.type === 'scenery' ? `scenery:${item.layer}` : item.control._children?.Core?.id)}
    {#if item.type === 'scenery'}
      <img class="scenery-layer" src={item.url} width={panel.width} height={panel.height} alt="" />
    {:else}
    {@const control = item.control}
    <CanvasControl
      {control}
      {scale}
      panelLocked={false}
      allControls={orderedControls}
      panelControls={panel.controls}
      panelWidth={panel.width}
      panelHeight={panel.height}
      editorInteractionEnabled={false}
      childPreviewPropsFor={previewPropsFor}
      {...previewPropsFor(control)}
    />
    {#if isComboboxControl(control) && openComboboxControlId === getControlId(control) && getValueRows(control).length}
      <div class="panel-combobox-menu" style={comboboxMenuStyle(control)} role="listbox">
        {#each getValueRows(control) as row (row.id ?? row.internalValue ?? row.displayText)}
          {@const selected = String(rowValue(row)) === String(currentComboboxValue(control))}
          <button
            type="button"
            class:selected
            role="option"
            aria-selected={selected}
            onpointerdown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onclick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              selectComboboxRow(control, row);
            }}
          >
            {rowLabel(row)}
          </button>
        {/each}
      </div>
    {/if}
    {/if}
  {/each}
</div>

<style>
  .panel-surface {
    position: relative;
    border: 1px solid #444;
    border-radius: 2px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    flex-shrink: 0;
    overflow: hidden;
  }

  .preview-surface {
    cursor: default;
  }

  .bg-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  /* Compiled scenery. No z-index on purpose: it stacks by document order, at the depth the render
     plan gave its layer. A number here would flatten every scenery layer into one band. */
  .scenery-layer {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    pointer-events: none;
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .panel-combobox-menu {
    position: absolute;
    z-index: 10000;
    max-height: 184px;
    overflow: auto;
    padding: 4px;
    border: 1px solid #4A4A4A;
    border-radius: 6px;
    background: #202020;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.42);
  }

  .panel-combobox-menu button {
    display: block;
    width: 100%;
    min-height: 26px;
    padding: 4px 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #E5E5E5;
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .panel-combobox-menu button:hover,
  .panel-combobox-menu button.selected {
    background: rgba(91, 155, 213, 0.24);
  }
</style>
