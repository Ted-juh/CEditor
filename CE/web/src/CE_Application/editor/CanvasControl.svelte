<script>
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import CanvasControlSelectionOverlay from './CanvasControlSelectionOverlay.svelte';
  import CanvasControlNested from './CanvasControl.svelte';
  import { getChildControls, computeFlowLayout, controlPanelRect, panelToLocalPoint, selectionRoots, collectSubtreeIds, findControlById, buildControlIndex, getAncestorIds, flatControlsWithPanelRects } from '../utils/containment.js';
  import { containerDropTargetId } from '../stores/containerDrag.js';
  import { sortControlsForRender } from '../utils/controlOrder.js';
  import { anchoredPositions, axisIsDerived, fitSettings, fitsAnyAxis, fittedSizeDeep } from '../utils/containerFit.js';
  import { plainFillCSS } from '../utils/plainFillCSS.js';
  import { observeElementMetrics } from '../utils/batchedElementMetrics.js';
  import InteractivePartRenderer from './InteractivePartRenderer.svelte';
  import { bakeStaticPartEntries } from '../utils/staticPartBaking.js';
  import SliderFamilyRenderer from './SliderFamilyRenderer.svelte';
  import LcdDisplayRenderer from './LcdDisplayRenderer.svelte';
  import PixelDisplayRenderer from './PixelDisplayRenderer.svelte';
  import ScriptDrawOverlay from './ScriptDrawOverlay.svelte';
  import MeterRenderer from './MeterRenderer.svelte';
  import EnvelopeRenderer from './EnvelopeRenderer.svelte';
  import MatrixRenderer from './MatrixRenderer.svelte';
  import JoystickRenderer from './JoystickRenderer.svelte';
  import CrossfaderRenderer from './CrossfaderRenderer.svelte';
  import NumpadRenderer from './NumpadRenderer.svelte';
  import RibbonRenderer from './RibbonRenderer.svelte';
  import MacroRenderer from './MacroRenderer.svelte';
  import OrbitRenderer from './OrbitRenderer.svelte';
  import LooperRenderer from './LooperRenderer.svelte';
  import RouterRenderer from './RouterRenderer.svelte';
  import TimbreRenderer from './TimbreRenderer.svelte';
  import TuringRenderer from './TuringRenderer.svelte';
  import KineticRenderer from './KineticRenderer.svelte';
  import ConstellationRenderer from './ConstellationRenderer.svelte';
  import ConstraintRenderer from './ConstraintRenderer.svelte';
  import ChordPadRenderer from './ChordPadRenderer.svelte';
  import ArpRenderer from './ArpRenderer.svelte';
  import NoteRibbonRenderer from './NoteRibbonRenderer.svelte';
  import DrumPadsRenderer from './DrumPadsRenderer.svelte';
  import PanicRenderer from './PanicRenderer.svelte';
  import SplitZoneRenderer from './SplitZoneRenderer.svelte';
  import PhraseRenderer from './PhraseRenderer.svelte';
  import RecorderRenderer from './RecorderRenderer.svelte';
  import HarmoniserRenderer from './HarmoniserRenderer.svelte';
  import SetlistRenderer from './SetlistRenderer.svelte';
  import TransportRenderer from './TransportRenderer.svelte';
  import ListboxRenderer from './ListboxRenderer.svelte';
  import { activePanel, selectedComponentIds, selectComponent, multiDragDelta, keyObjectId, updatePanel } from '../stores/panels.js';
  import { layerTints } from '../stores/panelLayerActions.js';
  import { normalizeLayerName } from '../utils/panelLayers.js';
  import { applyControlPatchesById, duplicateControlsInPlace, getSection, updateControlProperty, reparentControls } from '../stores/controls.js';
  import { pushSnapshot } from '../stores/history.js';
  import { adoptParameterMetadata } from '../utils/parameterAdoption.js';
  import { storedFonts, storedIcons, fontRuntimeStatus, ensureStoredFontLoaded } from '../stores/appSettings.js';
  import { nativeFontPreviews, requestNativeFontPreview } from '../stores/nativeFontPreviews.js';
  import { get } from 'svelte/store';
  import { showDistances } from '../stores/editorView.js';
  import { guides, selectedGuide } from '../stores/guides.js';
  import { fileCache, loadFile } from '../stores/fileCache.js';
  import { findAlignmentSnap, computeDistances } from '../utils/canvasSnapping.js';
  import { framedGuides, hasSelectedAncestor, multiDragPatches, toPanelDistances, toPanelGuides } from '../utils/canvasDragFrame.js';
  import { setActivePanelSnapGuides, clearActivePanelSnapGuides } from '../stores/panelSnapGuides.js';
  import { buildShadowCSS, buildBlendCSS, buildFilterCSS } from '../utils/effectsCSS.js';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { resolveInteractiveControl } from '../utils/interactionRuntime.js';
  import {
    getMouseSection,
    resolveCursorCss,
    resolveHitTestClipPath,
    resolveTabIndexFor,
    resolveTabIndex,
    acceptsPointer,
    childrenAcceptPointer,
    showsFocusOutline,
    isFocusableFor,
    raisesOnClick,
  } from '../utils/mouseBehavior.js';
  import { visibleChoiceRows, dependsOnId, dependentControl } from '../utils/dependentChoices.js';
  import { measurePerfDebug } from '../utils/perfDebug.js';
  import { resolveRadioGroupLayout } from '../utils/radioGroupLayout.js';
  import { segmentEditScope } from '../stores/segmentEditScope.js';
  import { normalizeSegmentTargetIds } from '../utils/segmentTargets.js';
  import { getBindingCompatibility } from '../models/componentPorts.js';
  import { midiControlBindingFrom } from '../utils/midiControlBindings.js';
  import { deviceParameterDrag } from '../stores/deviceParameterDrag.js';
  import { numberOr } from '../utils/primitives.js';
  import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';
  import {
    angleDegreesFromVector, buildReflectionFadeSpec, degToRad,
    isQuarterTurnAngle, mirrorPointHorizontally, normalizeVector,
    projectPointOntoAxis, reflectionMatrixTransform, rotatePointAround,
    rotatedBoxSize,
  } from './canvasControlTextGeometry.js';
  import {
    applyTextCaseMode, applyTextReadingOrientation, buildFontFeatureSettings,
    buildFontVariationSettings, buildGlowShadowLayers, buildSingleBlurFilterValue,
    buildTextBlurFilterValue, buildTextFillLayerStyle, buildTextShadowValue,
    cssColor, customHitZoneStyle, getDefaultValueRowLabel, getEnabledValueRows, lineCanvasFont,
    lineGeometry, lineLayerFor, normalizeFillMode, normalizeKey,
    normalizeLastLineAlign, normalizeScriptMode, normalizeTextCaseMode,
    normalizeTextFlowMode, normalizeTextLayerOrder, normalizeTextOrientation,
    normalizeTextReadingOrientation, parseHexColor, resolveTextFlowAngle,
    safeSvgId, scriptBaselineShiftForMode, scriptScaleForMode,
    sortTextVisualLayers, svgTextAnchorFor, textAlignFor, textCaseVariantCaps,
    textEffectColor, textOrientationAngle,
  } from './canvasControlStyles.js';
  import {
    buildBlockTextLayoutState, buildCustomFlowDecorationFor,
    buildCustomTextFlowLayout, measureCanvasLineWidth, measureFontMetrics,
    measureGlyphAdvance, normalizeParagraphMode,
  } from './canvasControlTextLayout.js';
  import {
    buildRadioWholeBackground,
    resolveRadioSegmentStyle,
    resolveRadioSelectedKeys,
    resolveRadioShapeRadius,
  } from '../utils/radioSegmentStyle.js';
  import {
    computeResizedRect, computeRotatedResizedRect, snapRectToGrid, snapToGridAxis,
    clientToPanelPoint, angleFromCenter, computeRotation, normalizeRotation,
    resizeHandleStyle,
  } from '../utils/transformMath.js';
  import { sortControlsForHitTest } from '../utils/controlOrder.js';

  let {
    control,
    sourceControl = control,
    scale = 1,
    previewSessionOverride = null,
    resolvedControlOverride = null,
    interactionRuntimeOverride = null,
    renderIdNamespace = '',
    editorInteractionEnabled = true,
    snapToGrid = false,
    gridSize = 10,
    gridOriginX = 0,
    gridOriginY = 0,
    panelLocked = false,
    allControls = [],
    panelWidth = 0,
    panelHeight = 0,
    onDragStart = null,
    onDragEnd = null,
    previewRole = '',
    previewTabIndex = undefined,
    previewAriaLabel = '',
    previewAriaDisabled = undefined,
    previewAriaChecked = undefined,
    previewAriaExpanded = undefined,
    previewAriaValueNow = undefined,
    previewAriaValueMin = undefined,
    previewAriaValueMax = undefined,
    previewAriaValueText = undefined,
    previewValueField = null,
    previewEditableFields = null,
    previewKeyboardFocus = false,
    previewHighlighted = false,
    onpreviewpointerenter = null,
    onpreviewpointerleave = null,
    onpreviewpointermove = null,
    onpreviewpointerdown = null,
    onpreviewwheel = null,
    onpreviewfocus = null,
    onpreviewblur = null,
    onpreviewkeydown = null,
    onpreviewkeyup = null,
    onpreviewvaluefieldinput = null,
    onpreviewvaluefieldkeydown = null,
    onpreviewvaluefieldfocus = null,
    onpreviewvaluefieldblur = null,
    onpreviewfieldinput = null,
    onpreviewfieldkeydown = null,
    onpreviewfieldfocus = null,
    onpreviewfieldblur = null,
    previewTextField = null,
    onpreviewtextinput = null,
    onpreviewtextkeydown = null,
    onpreviewtextfocus = null,
    onpreviewtextblur = null,
    previewListboxFilter = null,
    onpreviewlistboxfilter = null,
    // --- Nesting (all inert for un-nested/top-level controls) ---
    panelControls = [],
    // The controls that share this one's COORDINATE FRAME, and the bounds of that frame. A
    // container hands both to its children (its own child list, its own content box); a top-level
    // control is handed neither and falls back to `allControls` and the panel, which is exactly
    // what its frame is. See utils/canvasDragFrame.js for why this is a frame and not a
    // conversion — `allControls` deliberately stays the panel's top-level list, because the LCD
    // and pixel-display renderers use it to resolve a data source by name and that lookup is not
    // a geometry question.
    frameControls = null,
    frameSize = null,
    parentOffset = { x: 0, y: 0 },
    parentChainIds = [],
    parentGrid = null,
    layoutPosition = null,
    childPreviewPropsFor = null,
  } = $props();

  // Editable value fields resolve per part role. `previewEditableFields` is a
  // role→descriptor map (used by the two-value Range spinner for lowField /
  // highField); the older single `previewValueField` still serves the
  // `valueField` role (Number, InteractiveTestSurface).
  function editableInputForPart(part) {
    if (!previewInteractive) return null;
    const role = part?.role;
    if (previewEditableFields && previewEditableFields[role]) return previewEditableFields[role];
    if (role === 'valueField') return previewValueField;
    return null;
  }

  function editableHandlerForPart(part, kind) {
    if (!previewInteractive) return null;
    const role = part?.role;
    if (previewEditableFields && previewEditableFields[role]) {
      const roleAware = {
        input: onpreviewfieldinput,
        keydown: onpreviewfieldkeydown,
        focus: onpreviewfieldfocus,
        blur: onpreviewfieldblur,
      }[kind];
      return roleAware ? (event) => roleAware(role, event) : null;
    }
    if (role === 'valueField') {
      return {
        input: onpreviewvaluefieldinput,
        keydown: onpreviewvaluefieldkeydown,
        focus: onpreviewvaluefieldfocus,
        blur: onpreviewvaluefieldblur,
      }[kind];
    }
    return null;
  }

  // --- Derived data from sections ---
  let core = $derived(getSection(control, 'Core'));
  let transform = $derived(getSection(control, 'Transform'));
  let isCustomComponent = $derived(String(core?.controlType ?? '') === 'CustomComponent');
  let isLcdDisplay = $derived(String(core?.controlType ?? '') === 'LcdDisplay');
  let isPixelDisplay = $derived(String(core?.controlType ?? '') === 'PixelDisplay');
  let isMeter = $derived(String(core?.controlType ?? '') === 'Meter');
  let isEnvelope = $derived(String(core?.controlType ?? '') === 'Envelope');
  let isMatrix = $derived(String(core?.controlType ?? '') === 'Matrix');
  let isJoystick = $derived(String(core?.controlType ?? '') === 'VectorJoystick');
  let isCrossfader = $derived(String(core?.controlType ?? '') === 'Crossfader');
  let isNumpad = $derived(String(core?.controlType ?? '') === 'Numpad');
  let isRibbon = $derived(String(core?.controlType ?? '') === 'Ribbon');
  let isMacro = $derived(String(core?.controlType ?? '') === 'Macro');
  let isOrbit = $derived(String(core?.controlType ?? '') === 'Orbit');
  let isLooper = $derived(String(core?.controlType ?? '') === 'Looper');
  let isRouter = $derived(String(core?.controlType ?? '') === 'Router');
  let isTimbre = $derived(String(core?.controlType ?? '') === 'Timbre');
  let isTuring = $derived(String(core?.controlType ?? '') === 'Turing');
  let isKinetic = $derived(String(core?.controlType ?? '') === 'Kinetic');
  let isConstellation = $derived(String(core?.controlType ?? '') === 'Constellation');
  let isConstraint = $derived(String(core?.controlType ?? '') === 'Constraint');
  let isChordPad = $derived(String(core?.controlType ?? '') === 'ChordPad');
  let isArp = $derived(String(core?.controlType ?? '') === 'Arp');
  let isNoteRibbon = $derived(String(core?.controlType ?? '') === 'NoteRibbon');
  let isDrumPads = $derived(String(core?.controlType ?? '') === 'DrumPads');
  let isPanic = $derived(String(core?.controlType ?? '') === 'Panic');
  let isSplitZone = $derived(String(core?.controlType ?? '') === 'SplitZone');
  let isPhrase = $derived(String(core?.controlType ?? '') === 'Phrase');
  let isRecorder = $derived(String(core?.controlType ?? '') === 'Recorder');
  let isHarmoniser = $derived(String(core?.controlType ?? '') === 'Harmoniser');
  let isSetlist = $derived(String(core?.controlType ?? '') === 'Setlist');
  let isTransport = $derived(String(core?.controlType ?? '') === 'Transport');
  let isTextInput = $derived(String(core?.controlType ?? '') === 'TextInput');
  // TextInput: an editable <input> styled from the Text/Font/ContentLayout
  // sections. Value + placeholder come from the preview surface.
  function argbCss(hex, fallback) {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${parseInt(s.slice(0, 2), 16) / 255})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) {
      return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    }
    return fallback;
  }
  let tiValue = $derived(String(previewTextField?.value ?? ''));
  let tiPlaceholder = $derived(String(previewTextField?.placeholder ?? control?._children?.Text?.content ?? ''));
  let tiStyle = $derived.by(() => {
    const font = control?._children?.Text?._children?.Font ?? null;
    const cl = control?._children?.ContentLayout ?? null;
    const colour = argbCss(control?._children?.Text?._children?.Fill?.colour, 'rgba(224,224,224,1)');
    const align = String(cl?.horizontalAlign ?? 'left');
    return `color:${colour};`
      + `font-family:${String(font?.family ?? 'Arial')};`
      + `font-size:${Math.max(6, Number(font?.size) || 12)}px;`
      + `font-weight:${Number(font?.weightValue) || 400};`
      + `text-align:${align};`
      + `padding:${Math.max(0, Number(cl?.paddingTop) || 4)}px ${Math.max(0, Number(cl?.paddingRight) || 8)}px ${Math.max(0, Number(cl?.paddingBottom) || 4)}px ${Math.max(0, Number(cl?.paddingLeft) || 8)}px;`;
  });
  let previewSession = $derived(previewSessionOverride ?? null);
  let appliedPreviewSession = $derived(previewSession?.enabled === false ? {} : previewSession);
  let interactiveRenderingEnabled = $derived(isCustomComponent || previewSessionOverride !== null || editorInteractionEnabled === false);
  let shouldResolveInteractive = $derived(interactiveRenderingEnabled && resolvedControlOverride == null && interactionRuntimeOverride == null);
  let resolvedInteractive = $derived(shouldResolveInteractive ? resolveInteractiveControl(control, appliedPreviewSession) : null);
  let renderControl = $derived(
    resolvedControlOverride
      ?? (interactiveRenderingEnabled ? (resolvedInteractive?.control ?? control) : control)
  );
  let interactionRuntime = $derived(
    interactionRuntimeOverride
      ?? (interactiveRenderingEnabled ? (resolvedInteractive?.runtime ?? null) : null)
  );
  let svgIdSeed = $derived.by(() => {
    const baseId = safeSvgId(core?.id);
    const namespace = safeSvgId(renderIdNamespace);
    return namespace ? `${namespace}-${baseId}` : baseId;
  });
  let renderTransform = $derived(getSection(renderControl, 'Transform') ?? transform);
  let background = $derived(getSection(renderControl, 'Background'));
  let text = $derived(getSection(renderControl, 'Text'));
  let sourceBackground = $derived(getSection(sourceControl, 'Background') ?? background);
  let sourceText = $derived(getSection(sourceControl, 'Text') ?? text);
  let icon = $derived(getSection(renderControl, 'Icon'));
  let effects = $derived(getSection(renderControl, 'Effects'));
  let contentLayout = $derived(getSection(renderControl, 'ContentLayout'));
  let behavior = $derived(getSection(renderControl, 'Behavior'));
  let valueSection = $derived(getSection(renderControl, 'Value'));
  let statesSection = $derived(getSection(renderControl, 'States'));
  let sourceBehavior = $derived(getSection(sourceControl, 'Behavior') ?? behavior);
  let sourceValueSection = $derived(getSection(sourceControl, 'Value') ?? valueSection);
  let sourceStatesSection = $derived(getSection(sourceControl, 'States') ?? statesSection);
  let buttonType = $derived(String(sourceBehavior?.buttonType ?? behavior?.buttonType ?? '').trim().toLowerCase());
  // Cascading selectors: rows visible under the parent selector's current value
  // (a no-op unless this control has Value.dependsOn set).
  let valueRows = $derived(visibleChoiceRows(
    getEnabledValueRows(sourceValueSection ?? valueSection),
    previewSession?.dependsParentValue,
    dependsOnId(renderControl),
  ));
  let isRadioGroupControl = $derived(buttonType === 'radio');
  let isComboboxControl = $derived(buttonType === 'combobox');
  let isListboxControl = $derived(buttonType === 'listbox');
  // The control the listbox renderer draws — with its rows reduced to the
  // parent value so render + hit-test stay aligned.
  let listboxRenderControl = $derived(dependentControl(renderControl, previewSession?.dependsParentValue));
  // Multi-select set for the listbox renderer (null unless multiSelect is on).
  let listboxMultiSet = $derived.by(() => {
    if (!isListboxControl || (renderControl?._children?.Listbox?.multiSelect !== true)) return null;
    const arr = previewSession?.listboxSelected;
    return new Set((Array.isArray(arr) ? arr : []).map((v) => String(v)));
  });
  // Now-playing (recalled) row for the ▶ marker (only when nowPlaying is on).
  let listboxNowPlaying = $derived.by(() => {
    if (!isListboxControl || renderControl?._children?.Listbox?.nowPlaying !== true) return undefined;
    const np = previewSession?.listboxNowPlaying;
    return (np !== undefined && np !== '') ? np : undefined;
  });
  let renderParts = $derived(getSection(renderControl, 'Parts'));
  let designer = $derived(getSection(renderControl, 'Designer'));
  let hitZones = $derived(getSection(renderControl, 'HitZones'));
  let showCustomHitZones = $derived(
    String(core?.controlType ?? '') === 'CustomComponent'
    && editorInteractionEnabled
    && designer?.preview?.showHitZones === true
  );
  let customHitZoneEntries = $derived.by(() =>
    Object.entries(hitZones?._children ?? {})
      .filter(([, zone]) => zone?.enabled !== false && zone?.visibleInEditor !== false)
      .sort((left, right) => numberOr(left?.[1]?.priority, 0) - numberOr(right?.[1]?.priority, 0))
  );
  const SLIDER_SEMANTIC_PARTS = new Set([
    'bodyTrackBase', 'bodyTrackFill', 'bodySelectedRange', 'bodyCenterMarker',
    'pointerStart', 'pointerCurrent', 'pointerEnd',
    'tickMajor', 'tickMinor', 'tickAccent',
    'labelMin', 'labelMax', 'labelStart', 'labelCurrent', 'labelEnd', 'labelValue', 'labelTitle', 'labelUnit',
  ]);
  let renderPartEntries = $derived.by(() =>
    Object.entries(renderParts?._children ?? {})
      .filter(([, part]) => part?.visible !== false)
      .sort((left, right) => numberOr(left?.[1]?.zIndex, 0) - numberOr(right?.[1]?.zIndex, 0))
  );
  let isSliderControl = $derived(
    String(sourceBehavior?.family ?? behavior?.family ?? '').trim().toLowerCase() === 'range'
    && String(sourceBehavior?.role ?? behavior?.role ?? '').trim().toLowerCase() === 'slider'
  );
  let visiblePartEntries = $derived.by(() => (
    isSliderControl
      ? renderPartEntries.filter(([partName]) => !SLIDER_SEMANTIC_PARTS.has(String(partName)))
      : renderPartEntries
  ));
  // Parts that nothing can ever change are compiled to one SVG and drawn as a single element.
  // On the GAIA panel that is 2,821 of 3,295 parts: 12,025 surface DOM nodes become 5,509 and the
  // load halves. bakeStaticPartEntries returns its input untouched whenever it cannot help, so
  // this needs no condition of its own — the rules all live in staticPartBaking.js.
  //
  // Note where this ISN'T: the component creator renders parts through InteractivePartRenderer
  // directly rather than through CanvasControl, so authoring always sees real, separate layers.
  // That is not an accident of this code, but it is load-bearing, and componentCreatorParts.test.js
  // is what stops it becoming one.
  let renderedPartEntries = $derived.by(() =>
    bakeStaticPartEntries(renderControl, visiblePartEntries, displayW, displayH));
  let isSelected = $derived(core?.id != null && $selectedComponentIds.has(core.id));
  // The layer's colour code, if it has one. This is where colour coding actually earns its keep:
  // in the dock you already know which layer you are looking at, on the canvas you do not, and
  // "why won't this move" answers itself when the outline is the locked layer's colour.
  let layerTint = $derived($layerTints.size === 0
    ? null
    : ($layerTints.get(normalizeLayerName(core?.layer)) ?? null));
  let isKeyObject = $derived(core?.id != null && $keyObjectId === core.id && $selectedComponentIds.size > 1);
  let isLocked = $derived(core?.locked === true);
  let isVisible = $derived(core?.visible !== false);
  let isEditorLocked = $derived(panelLocked || isLocked);
  let renderOpacity = $derived(renderTransform?.opacity ?? transform?.opacity ?? 1);
  let renderScale = $derived(renderTransform?.scale ?? transform?.scale ?? 1);
  let interactionDebugEnabled = $derived(interactiveRenderingEnabled && previewSession?.autoDebug === true);
  let interactionDebugSummary = $derived.by(() => {
    if (!interactionDebugEnabled) return '';

    const segments = [];
    if (interactionRuntime?.activeStates?.length) {
      segments.push(interactionRuntime.activeStates.join(' + '));
    }

    const family = interactionRuntime?.signals?.family;
    const role = String(interactionRuntime?.signals?.role ?? '').trim().toLowerCase();
    if (family === 'range' && role === 'slider') {
      segments.push(`value:${String(interactionRuntime?.signals?.valueDisplay ?? interactionRuntime?.signals?.valueRaw ?? '-')}`);
      segments.push(`handle:${String(interactionRuntime?.signals?.activeHandle ?? '-')}`);
    } else if (family === 'range' || family === 'select') {
      segments.push(`value:${String(interactionRuntime?.signals?.valueRaw ?? '-')}`);
    }

    return segments.join(' | ');
  });
  // --- Mouse section (cursor, click interception, hit shape, focus) ---
  // Applied on the preview/runtime surface only. In the editor the same
  // properties would fight the tools you edit with: `interceptClicks: false`
  // would make a control unselectable, an ellipse hit shape would clip its own
  // resize handles, and a custom cursor would mask the move/resize affordances.
  // The author sets what the finished panel does; the editor stays editable.
  // renderControl, not the raw control: a state that changes the cursor or
  // makes something focusable should take effect while that state is active.
  let mouseSection = $derived(getMouseSection(renderControl ?? control));
  let mouseAppliesToSurface = $derived(editorInteractionEnabled === false);
  // Behavior rides alongside for the value-flow question: a display is not a tab stop, whatever
  // the Mouse tab says, because focusing something that cannot be operated swallows the Tab press
  // that was heading for the next real control.
  let flowBehavior = $derived((renderControl ?? control)?._children?.Behavior ?? null);
  let mouseFocusable = $derived(mouseAppliesToSurface && isFocusableFor(mouseSection, flowBehavior));
  let mouseCursorCSS = $derived(mouseAppliesToSurface ? resolveCursorCss(mouseSection) : '');
  let mouseClipCSS = $derived(mouseAppliesToSurface ? resolveHitTestClipPath(mouseSection) : '');
  let mouseBlocksPointer = $derived(mouseAppliesToSurface && !acceptsPointer(mouseSection));
  let mouseChildrenTakePointer = $derived(mouseAppliesToSurface && childrenAcceptPointer(mouseSection));
  let mouseFocusOutline = $derived(mouseAppliesToSurface && showsFocusOutline(mouseSection));
  let mouseRaisesOnClick = $derived(mouseAppliesToSurface && raisesOnClick(mouseSection));

  // bringToFrontOnClick. Component-local state, so it lasts exactly as long as
  // the preview does and leaves nothing behind in the document — overlapping
  // controls come back in their authored order when preview stops, the same
  // promise the rest of preview makes.
  let raisedInPreview = $state(false);
  let mouseRaiseCSS = $derived(raisedInPreview ? 'z-index:2147483000;' : '');

  function handleMouseSectionPointerDown(event) {
    if (mouseRaisesOnClick) raisedInPreview = true;
    onpreviewpointerdown?.(event);
  }

  // Dropping out of preview clears the raise, so re-entering starts level.
  $effect(() => {
    if (!mouseAppliesToSurface && raisedInPreview) raisedInPreview = false;
  });

  let previewInteractive = $derived(
    editorInteractionEnabled === false
    && (
      !!previewRole
      || previewTabIndex !== undefined
      // A control the author marked focusable is interactive by that fact
      // alone, even with no role and no handlers — otherwise ticking Focusable
      // on a plain label would silently do nothing.
      || mouseFocusable
      || mouseRaisesOnClick
      // The child-clicks rule is scoped to .preview-interactive so it cannot
      // reach the editor's selection path; a container that turns it on has
      // to carry that class or the setting would quietly do nothing.
      || mouseChildrenTakePointer
      || onpreviewpointerenter != null
      || onpreviewpointerleave != null
      || onpreviewpointermove != null
      || onpreviewpointerdown != null
      || onpreviewwheel != null
      || onpreviewfocus != null
      || onpreviewblur != null
      || onpreviewkeydown != null
      || onpreviewkeyup != null
    )
  );

  // The surface's own tab index wins when it set one — it knows about roles and
  // handle counts. The Mouse section fills in for everything else.
  let effectiveTabIndex = $derived(
    // ...except for a display, where the surface does not know it is one. -1 wins over the
    // surface's own index there, because a read-only control is never in the tab order.
    mouseAppliesToSurface && resolveTabIndexFor(mouseSection, flowBehavior) === -1
      ? -1
      : (previewTabIndex !== undefined ? previewTabIndex : resolveTabIndex(mouseSection))
  );

  // --- Drag state (internal $state per feedback) ---
  let isDragging = $state(false);
  let dragStartMouse = $state({ x: 0, y: 0 });
  let dragStartPos = $state({ x: 0, y: 0 });
  // A drag only engages after the pointer travels a few SCREEN pixels.
  // Without the threshold, the hand jitter inside an ordinary click moves the
  // control — by whole panel units when zoomed out — and dirties the document.
  const DRAG_ENGAGE_SCREEN_PX = 4;
  let dragEngaged = $state(false);
  // Space held during a drag keeps the control in its current parent
  // (Figma's convention). Alt is busy: Alt+drag leaves a copy behind.
  // Space isn't a MouseEvent modifier, so it's tracked via key listeners
  // that live only for the duration of the drag.
  let dragSpaceHeld = false;
  function handleDragSpaceKey(e) {
    if (e.key === ' ') dragSpaceHeld = e.type === 'keydown';
  }
  let rootElement = $state(null);

  // --- Resize state ---
  let isResizing = $state(false);
  let resizeHandle = $state('');
  let resizeStartMouse = $state({ x: 0, y: 0 });
  let resizeStartRect = $state({ x: 0, y: 0, w: 0, h: 0 });

  // --- Transient position/size during drag/resize ---
  let transientX = $state(null);
  let transientY = $state(null);
  let transientW = $state(null);
  let transientH = $state(null);

  // CARRIED, not moved. Ctrl+A selects containers together with everything inside them, so a
  // nested child is routinely selected at the same time as the container it lives in. The
  // container translates and the DOM nesting takes the child with it — applying the broadcast
  // delta here as well moved the child TWICE, sliding it out of its own container by exactly the
  // distance the container travelled. The commit had the same double (handleDragEnd), so letting
  // go did not put it back.
  let carriedByAncestor = $derived(isSelected && hasSelectedAncestor(parentChainIds, $selectedComponentIds));

  // During multi-drag, non-dragged selected components offset by the shared delta
  let multiDragOffsetX = $derived(!isDragging && isSelected && !carriedByAncestor && $multiDragDelta.active ? $multiDragDelta.x : 0);
  let multiDragOffsetY = $derived(!isDragging && isSelected && !carriedByAncestor && $multiDragDelta.active ? $multiDragDelta.y : 0);
  // ...and when the pointer has hold of the carried child itself, its own transient position is
  // the same double from the other end: the ancestor is already moving it. Falling back to the
  // stored Transform lets the container's translation be the only thing that moves it on screen,
  // which is what the commit will write.
  let dragMovesSelf = $derived(!(carriedByAncestor && $multiDragDelta.active));
  let deviceDropCompatibility = $derived($deviceParameterDrag?.parameter
    ? getBindingCompatibility(sourceControl, $deviceParameterDrag.parameter)
    : null
  );
  let deviceDropStatus = $derived(
    !editorInteractionEnabled || panelLocked || isEditorLocked || !$deviceParameterDrag
      ? ''
      : deviceDropCompatibility?.status === 'compatible'
        ? 'compatible'
        : deviceDropCompatibility?.status === 'warning'
          ? 'warning'
          : 'incompatible'
  );

  let displayX = $derived(layoutPosition ? layoutPosition.x : (dragMovesSelf ? (transientX ?? transform?.x ?? 0) : (transform?.x ?? 0)) + multiDragOffsetX);
  let displayY = $derived(layoutPosition ? layoutPosition.y : (dragMovesSelf ? (transientY ?? transform?.y ?? 0) : (transform?.y ?? 0)) + multiDragOffsetY);
  // A section whose size comes from its contents (utils/containerFit.js). Deep, because a section
  // holding another fitted section cannot know its own size until the inner one does. The derived
  // size wins over the stored Transform on a fitted axis; a transient drag still wins over both, so
  // a half-fitted container drags on its locked axis and refuses on the other.
  let fittedSelf = $derived(fitsAnyAxis(control) ? fittedSizeDeep(control) : null);
  let displayW = $derived(transientW ?? fittedSelf?.width ?? transform?.width ?? 100);
  let displayH = $derived(transientH ?? fittedSelf?.height ?? transform?.height ?? 40);

  // --- Container children (nesting). All empty/false for non-containers, so a
  // control with no Children section renders exactly as before. ---
  let childrenSection = $derived(getSection(control, 'Children'));
  let isContainer = $derived(!!childrenSection);
  let childControls = $derived(isContainer ? sortControlsForRender(getChildControls(control)) : []);
  // WHERE A CHILD'S 0,0 IS. Everything else in the app answers this with containment.contentOrigin
  // — hit-testing, controlPanelRect, the fit measurement, the scenery compiler — and that function
  // prefers paddingLeft/paddingTop over the shared `padding`. This component used the shared number
  // alone, which agreed with it only while the two were the same. The moment a per-side value
  // differed, the drawn position of every child and its MODELLED position disagreed by that
  // difference: marquee selection, alignment guides and drag-to-reparent all targeting a box that
  // is not where the child is on screen, and a scenery layer visibly sliding its contents on lock.
  // Nothing could write a per-side value before the Children editor existed, which is why it went
  // unnoticed; the same reason it had to be fixed alongside it.
  let childrenPad = $derived(fitSettings(control).padding);
  let childrenGap = $derived(Number(childrenSection?.gap ?? 0));
  let childrenClip = $derived(childrenSection?.clip === true);
  // The container's own corner radius, so a clip follows the curve rather than the border box.
  // Clamped to half the shorter side exactly as boxElement clamps it, so the two never disagree.
  let childrenClipRadius = $derived(Math.min(
    Number(getSection(control, 'Background')?._children?.Corners?.radius ?? 0) || 0,
    Math.min(displayW, displayH) / 2,
  ));
  let childrenLayoutMode = $derived(String(childrenSection?.layout ?? 'none'));
  let childFlowPositions = $derived(
    childrenLayoutMode !== 'none' && childControls.length
      // The row width a flow layout wraps at is the CONTENT width, so it comes off the same
      // per-side padding rather than doubling the shared one.
      ? computeFlowLayout(childControls, displayW - childrenPad.left - childrenPad.right, childrenGap, 0)
      : null
  );
  // Anchored children, resolved against this container's CONTENT box. A child cannot do this
  // itself — it has no way to ask its parent how wide the parent turned out to be, especially when
  // the parent's width is derived from the children. So the parent places them, through the same
  // `layoutPosition` prop flow layout already uses.
  let childAnchoredPositions = $derived.by(() => {
    if (!childControls.length) return null;
    return anchoredPositions(childControls,
      displayW - childrenPad.left - childrenPad.right,
      displayH - childrenPad.top - childrenPad.bottom);
  });
  // Flow layout wins where both apply: it is an explicit "the container places everything" mode,
  // and an anchor inside it would be a control opting out of the layout it was put in.
  let childPositions = $derived(childFlowPositions ?? childAnchoredPositions);
  let childParentOffset = $derived({
    x: parentOffset.x + displayX + childrenPad.left,
    y: parentOffset.y + displayY + childrenPad.top,
  });
  let childParentChainIds = $derived([...parentChainIds, core?.id].filter(Boolean));
  // The frame this container's children live in: their (0,0) is its content origin, so the bounds
  // they snap and measure against are the CONTENT box, not the container's border box. Handed down
  // as `frameSize` — the same role the panel's own size plays for a top-level control.
  let childFrameSize = $derived({
    width: Math.max(0, displayW - childrenPad.left - childrenPad.right),
    height: Math.max(0, displayH - childrenPad.top - childrenPad.bottom),
  });
  let myGridSection = $derived(getSection(control, 'Grid') ?? null);
  // This container is highlighted as the live drop target during a canvas drag.
  let isDropTargetHighlighted = $derived(editorInteractionEnabled && core?.id != null && $containerDropTargetId === core.id);

  const MIN_SIZE = 10;

  // --- Snap to grid helper (accounts for grid origin offset) ---
  const snapToGridX = (val) => snapToGrid ? snapToGridAxis(val, gridSize, gridOriginX) : val;
  const snapToGridY = (val) => snapToGrid ? snapToGridAxis(val, gridSize, gridOriginY) : val;

  // --- Snap guides & distance labels ---
  let snapGuides = $state.raw([]);
  let distanceLabels = $state.raw([]); // { axis, dist, x, y, length }

  // MY COORDINATE FRAME. Everything below this line does rect math in the space this control's
  // own x/y is expressed in — its siblings and the box they sit in — never in panel space. For a
  // top-level control the two are the same thing and none of this changes anything; for a nested
  // one they differ by `parentOffset`, and mixing them is what made snapping inside a container
  // snap to nowhere and its distance labels read as fiction. utils/canvasDragFrame.js carries the
  // reasoning; the short version is that a frame is cheaper and less error-prone than converting
  // every sibling into panel space sixty times a second.
  let mySiblings = $derived(frameControls ?? allControls);
  let myFrameSize = $derived(frameSize ?? { width: panelWidth, height: panelHeight });
  // Ruler guides are stored in panel space because that is where the rulers draw them, so they are
  // the one input that has to be brought INTO the frame rather than being there already.
  let myFrameGuides = $derived(framedGuides($guides, parentOffset));
  // The tree the drag commit resolves selection roots and sibling transforms against.
  // `panelControls` is the real thing; the fallback is for the handful of callers that render a
  // CanvasControl with a flat list and no tree (a flat list IS a tree with no children, so the
  // answers are identical for them).
  let dragTree = $derived(panelControls?.length ? panelControls : allControls);
  // THE LAST id in the chain, not the first. `parentChainIds` is built outermost-first
  // (`[...parentChainIds, core.id]`), so index 0 is the TOP of the chain — at depth 1 that happens
  // to be the immediate parent, which is why reading [0] survived until containers could hold
  // containers. At depth 2 it named the grandparent, and a drag that never left its own container
  // looked to the drop logic like a reparent out of the one above it.
  let myParentId = $derived(parentChainIds.length ? parentChainIds[parentChainIds.length - 1] : null);

  // Thin wrappers around the pure snap utils so the drag/resize handlers
  // stay readable. findAlignmentSnap uses my frame's controls + ruler guides;
  // computeDistances additionally filters out co-selected siblings and
  // only runs for the dragged (key-object) component.
  function alignSnap(x, y, w, h) {
    const align = findAlignmentSnap(
      { x, y, w, h }, core?.id, mySiblings, myFrameGuides, getSection,
      myFrameSize,
      // 5 screen px of stickiness at every zoom level.
      5 / (scale || 1),
    );
    // Publish the live guides so the panel rulers can mirror them (parity with
    // the component editor). Cleared on drag/resize end. The rulers are panel-space,
    // so this is the boundary where the frame is left behind.
    setActivePanelSnapGuides(toPanelGuides(align.guides, parentOffset));
    return align;
  }

  function distancesFor(x, y, w, h) {
    const ids = get(selectedComponentIds);
    // Only the dragged component should show distances
    if (ids.size > 1 && !isKeyObject && $keyObjectId !== core?.id) return [];
    return computeDistances(
      { x, y, w, h },
      core?.id,
      ids,
      mySiblings,
      myFrameSize,
      getSection,
    );
  }

  // The selection overlay positions guides and labels by subtracting a PANEL-space offset
  // (`overlayOffsetX`), so both cross back out of the frame on the way to it. A no-op at top level.
  function publishMeasurements(align, labels) {
    snapGuides = toPanelGuides(align.guides, parentOffset);
    distanceLabels = toPanelDistances(labels, parentOffset);
  }

  // --- Double-click: drill into containers, edit text in place ---
  // The Figma model: double-clicking a container selects the child under the
  // pointer (one level per double-click); double-clicking a text-bearing
  // control edits its text right on the canvas. A selected child becomes
  // directly interactive (see the .children-origin .selected CSS rule), so
  // after drilling it can be dragged and resized without a properties trip.
  let inlineTextEditing = $state(false);
  let inlineTextValue = $state('');

  function startInlineTextEdit() {
    const txt = getSection(control, 'Text');
    if (!txt || !core?.id) return false;
    inlineTextValue = String(txt.content ?? '');
    inlineTextEditing = true;
    return true;
  }

  function commitInlineTextEdit() {
    if (!inlineTextEditing) return;
    inlineTextEditing = false;
    const txt = getSection(control, 'Text');
    if (String(txt?.content ?? '') !== inlineTextValue) {
      updateControlProperty(core.id, 'Text.content', inlineTextValue);
      pushSnapshot();   // one text edit, one undo step
    }
  }

  function handleInlineTextKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitInlineTextEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      inlineTextEditing = false;   // discard
    }
  }

  function drillIntoChildAt(px, py) {
    const local = panelToLocalPoint(panelControls, core?.id, px, py);
    const child = sortControlsForHitTest(getChildControls(sourceControl ?? control)).find((candidate) => {
      const t = candidate._children?.Transform;
      return t && local.x >= t.x && local.x <= t.x + t.width && local.y >= t.y && local.y <= t.y + t.height;
    });
    const childId = child?._children?.Core?.id;
    if (!childId) return false;
    selectComponent(childId, false);
    return true;
  }

  function handleDoubleClick(e) {
    if (!editorInteractionEnabled || isEditorLocked || inlineTextEditing) return;
    e.stopPropagation();
    if (childControls.length) {
      const p = surfacePointFromClient(e.clientX, e.clientY);
      if (p && drillIntoChildAt(p.x, p.y)) return;
    }
    startInlineTextEdit();
  }

  // --- Click to select ---
  function handleMouseDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();

    // Selecting a control ends any guide selection — a stale selected guide
    // used to hijack the next Delete press away from the controls.
    selectedGuide.set(null);

    // Shift+click is the industry-standard extend gesture; Ctrl/Cmd+click
    // does the same for muscle memory from file managers.
    const multiKey = e.ctrlKey || e.metaKey || e.shiftKey;
    if (multiKey) {
      // Toggle this component in/out of selection
      selectComponent(core?.id, true);
    } else if (!isSelected) {
      // Normal click on unselected: replace selection with just this one
      selectComponent(core?.id, false);
    }
    // Normal click on already-selected: keep current selection (enables multi-drag)

    if (isEditorLocked || isResizing) {
      // Swallow the click only if it lands on the canvas (prevents deselect)
      window.addEventListener('click', (ev) => {
        if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
          ev.stopPropagation(); ev.preventDefault();
        }
      }, { once: true, capture: true });
      return;
    }

    // Start drag
    isDragging = true;
    dragEngaged = false;
    dragSpaceHeld = false;
    // The document and the selection are fixed for the length of the gesture, so the drop targets
    // are worked out here rather than on every move. Cleared in handleDragEnd.
    dropCandidates = buildDropCandidates();
    dragStartMouse = { x: e.clientX, y: e.clientY };
    dragStartPos = { x: transform?.x ?? 0, y: transform?.y ?? 0 };
    transientX = dragStartPos.x;
    transientY = dragStartPos.y;
    onDragStart?.();

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('keydown', handleDragSpaceKey);
    window.addEventListener('keyup', handleDragSpaceKey);
  }

  function parseDeviceParameterDrag(event) {
    const raw = event.dataTransfer?.getData('application/x-ceditor-device-parameter');
    if (!raw) return null;

    try {
      const payload = JSON.parse(raw);
      // Two kinds over one MIME type: a named profile parameter, or a raw CC described as the
      // 0-127 integer it is. Both carry `parameter`, so everything downstream that only asks about
      // compatibility — the accept check, the drag highlight — needs no branch.
      const known = payload?.kind === 'ceditor.deviceParameter' || payload?.kind === 'ceditor.midiControl';
      if (!known || !payload?.parameter?.id) return null;
      return payload;
    } catch {
      return null;
    }
  }

  function canAcceptDeviceParameterDrop(payload) {
    if (!editorInteractionEnabled || panelLocked || isEditorLocked || !core?.id) return false;
    const compatibility = getBindingCompatibility(sourceControl, payload?.parameter);
    return compatibility.status !== 'incompatible' && !!compatibility.port;
  }

  function handleDeviceParameterDragOver(event) {
    const types = Array.from(event.dataTransfer?.types ?? []);
    if (!types.includes('application/x-ceditor-device-parameter')) return;

    if (editorInteractionEnabled && !panelLocked && !isEditorLocked && !!core?.id) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    } else {
      event.dataTransfer.dropEffect = 'none';
    }
  }

  function handleDeviceParameterDrop(event) {
    const payload = parseDeviceParameterDrag(event);
    if (!payload || !canAcceptDeviceParameterDrop(payload)) return;

    event.preventDefault();
    event.stopPropagation();
    bindDroppedDeviceParameter(payload);
  }

  function bindDroppedDeviceParameter(payload) {
    const parameter = payload.parameter;
    const compatibility = getBindingCompatibility(sourceControl, parameter);
    if (!compatibility.port) return;

    selectComponent(core.id, false);

    const deviceBindings = getSection(sourceControl, 'DeviceBindings');
    const existing = deviceBindings?.bindings;
    const nextBindings = Array.isArray(existing) ? [...existing] : [];
    const bindingIndex = nextBindings.findIndex((binding) => binding.port === compatibility.port.id);
    // A raw CC binds to the MESSAGE; there is no profile parameter to name, no metadata to adopt
    // and no required profile to record, because the whole point is that the profile does not
    // describe this controller.
    const rawControl = payload.kind === 'ceditor.midiControl';
    const nextBinding = rawControl
      ? midiControlBindingFrom({
        message: payload.message,
        controller: payload.controller,
        parameterMsb: payload.parameterMsb,
        parameterLsb: payload.parameterLsb,
        valueResolution: payload.valueResolution,
        port: compatibility.port.id,
        deviceRole: payload.deviceRole || DEFAULT_DEVICE_ROLE,
      })
      : {
        kind: 'deviceParameter',
        port: compatibility.port.id,
        deviceRole: payload.deviceRole || DEFAULT_DEVICE_ROLE,
        parameterId: parameter.id,
        parameterType: parameter.type,
        adoptMetadata: true,
        // Not a dry run. This was true, and dropping a parameter onto a fader then produced a
        // binding that compiled its message, showed it in the monitor and never sent it — so the
        // gesture looked like it worked and the fader did nothing. Dry run is a real mode with a
        // toggle in the properties panel; it is not what someone means by dragging.
        dryRun: false,
        feedback: {
          receiveUpdates: true,
          ignoreOwnEchoes: true,
          echoWindowMs: 250,
        },
      };
    if (!nextBinding) return;

    if (bindingIndex >= 0) nextBindings[bindingIndex] = nextBinding;
    else nextBindings.push(nextBinding);

    if (deviceBindings) {
      updateControlProperty(core.id, 'DeviceBindings.bindings', nextBindings);
    } else {
      updateControlProperty(core.id, 'DeviceBindings', {
        _type: 'DeviceBindings',
        enabled: true,
        debug: false,
        bindings: nextBindings,
      });
    }

    if (rawControl) return;
    adoptParameterMetadata(core.id, core.controlType, parameter);
    persistDroppedPanelDeviceReference(payload);
  }

  function persistDroppedPanelDeviceReference(payload) {
    const panel = get(activePanel);
    const parameter = payload?.parameter;
    if (!panel?.id || !parameter?.id || !payload?.profileId) return;

    const role = payload.deviceRole || DEFAULT_DEVICE_ROLE;
    const requiredProfiles = Array.isArray(panel.requiredProfiles) ? [...panel.requiredProfiles] : [];
    const existingIndex = requiredProfiles.findIndex((entry) => entry?.role === role);
    const requiredProfile = {
      role,
      profileId: payload.profileId,
      version: '*',
    };

    if (existingIndex >= 0) requiredProfiles[existingIndex] = requiredProfile;
    else requiredProfiles.push(requiredProfile);

    const snapshotKey = `${role}.${parameter.id}`;
    const parameterSnapshots = {
      ...(panel.parameterSnapshots ?? {}),
      [snapshotKey]: {
        id: parameter.id,
        name: parameter.name ?? parameter.id,
        type: parameter.type ?? '',
        group: parameter.group ?? '',
        range: parameter.range ?? null,
        choices: Array.isArray(parameter.choices)
          ? parameter.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            value: choice.value,
          }))
          : undefined,
        display: parameter.display ?? null,
      },
    };

    updatePanel(panel.id, {
      requiredProfiles,
      parameterSnapshots,
    });
  }

  // Map a mouse client point to panel-surface coordinates (accounts for scale).
  function surfacePointFromClient(clientX, clientY) {
    const surface = rootElement?.closest?.('.panel-surface');
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }

  // The container currently under the pointer that this drag could drop into —
  // deepest container whose panel-space AABB contains the point, excluding the
  // dragged subtree(s) and any locked/hidden container (or one under one).
  /**
   * The containers this drag could drop into, as flat rects — computed ONCE per gesture.
   *
   * Everything here is a property of the document and the selection, and a drag changes neither:
   * the move handler only writes transientX/transientY, and the document is not patched until
   * mouseup. Only the pointer moves, and the pointer is the query, not the data.
   *
   * It used to be rebuilt on every mousemove: buildControlIndex over the whole tree,
   * flatControlsWithPanelRects shallow-copying all 413 controls with a fresh Transform each, and
   * a getAncestorIds walk per candidate. Roughly twelve hundred objects allocated per mouse move,
   * sixty times a second — which is most of the garbage collector time in a drag profile, and it
   * bought an answer that could not have changed since the drag began.
   */
  function buildDropCandidates() {
    const ids = get(selectedComponentIds);
    const movingRoots = ids.size > 1 && ids.has(core?.id) ? selectionRoots(panelControls, ids) : [core?.id];
    const excluded = new Set();
    for (const rootId of movingRoots) {
      const rootControl = findControlById(panelControls, rootId);
      if (rootControl) for (const subId of collectSubtreeIds(rootControl)) excluded.add(subId);
    }

    const index = buildControlIndex(panelControls);
    const candidates = [];
    // Every container in the tree, in panel space, so a component can be dropped into a nested
    // container and not just a top-level one.
    for (const entry of flatControlsWithPanelRects(panelControls)) {
      const entryCore = entry._children?.Core;
      const entryTransform = entry._children?.Transform;
      if (!entryCore?.id || !entryTransform || !entry._children?.Children) continue;
      if (excluded.has(entryCore.id)) continue;
      if (entryCore.locked === true || entryCore.visible === false) continue;
      if (getAncestorIds(panelControls, entryCore.id).some((ancestorId) => {
        const ancestorCore = index.get(ancestorId)?.control?._children?.Core;
        return ancestorCore?.locked === true || ancestorCore?.visible === false;
      })) continue;
      candidates.push({
        id: entryCore.id,
        depth: index.get(entryCore.id)?.depth ?? 0,
        x: entryTransform.x,
        y: entryTransform.y,
        right: entryTransform.x + entryTransform.width,
        bottom: entryTransform.y + entryTransform.height,
      });
    }
    return candidates;
  }

  // Held for the length of one gesture; null whenever no gesture is in flight.
  let dropCandidates = null;

  function dropCandidateAt(panelX, panelY) {
    const candidates = dropCandidates ?? buildDropCandidates();
    let best = null;
    for (const entry of candidates) {
      if (panelX < entry.x || panelX > entry.right) continue;
      if (panelY < entry.y || panelY > entry.bottom) continue;
      if (!best || entry.depth >= best.depth) best = entry;
    }
    return best?.id ?? null;
  }

  function handleDragMove(e) {
    if (!isDragging) return;
    if (!dragEngaged) {
      const screenDist = Math.hypot(e.clientX - dragStartMouse.x, e.clientY - dragStartMouse.y);
      if (screenDist < DRAG_ENGAGE_SCREEN_PX) return;
      dragEngaged = true;
    }
    let dx = (e.clientX - dragStartMouse.x) / scale;
    let dy = (e.clientY - dragStartMouse.y) / scale;

    // Shift constrains the move to the dominant axis.
    if (e.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }

    let newX = dragStartPos.x + dx;
    let newY = dragStartPos.y + dy;

    // Holding Ctrl/Cmd suspends every snap for the duration — the only way
    // to place something 2px off a neighbour's edge without a settings trip.
    const snapSuspended = e.ctrlKey || e.metaKey;

    // Grid snap first
    if (!snapSuspended && snapToGrid && gridSize > 0) {
      newX = snapToGridX(newX);
      newY = snapToGridY(newY);
    }

    // Alignment snap overrides grid when within threshold
    const align = snapSuspended ? { x: newX, y: newY, guides: [] } : alignSnap(newX, newY, displayW, displayH);
    if (snapSuspended) setActivePanelSnapGuides([]);
    transientX = Math.round(align.x);
    transientY = Math.round(align.y);
    publishMeasurements(align, $showDistances ? distancesFor(transientX, transientY, displayW, displayH) : []);

    // Broadcast delta for other selected components to follow
    const ids = get(selectedComponentIds);
    if (ids.size > 1) {
      multiDragDelta.set({ x: transientX - dragStartPos.x, y: transientY - dragStartPos.y, active: true });
    }

    // Highlight the container under the pointer as the drop target
    // (holding Space keeps the current parent). A control being CARRIED by a selected ancestor is
    // not the thing that moved and cannot reparent itself — see the same guard in handleDragEnd.
    const currentParentId = myParentId;
    const surfacePoint = surfacePointFromClient(e.clientX, e.clientY);
    const canReparent = !dragSpaceHeld && !(ids.size > 1 && hasSelectedAncestor(parentChainIds, ids));
    const target = (canReparent && surfacePoint) ? dropCandidateAt(surfacePoint.x, surfacePoint.y) : currentParentId;
    containerDropTargetId.set(target !== currentParentId ? target : null);
  }

  function handleDragEnd(e) {
    if (!isDragging) return;
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    window.removeEventListener('keydown', handleDragSpaceKey);
    window.removeEventListener('keyup', handleDragSpaceKey);
    containerDropTargetId.set(null);

    const dx = transientX - dragStartPos.x;
    const dy = transientY - dragStartPos.y;
    const moved = dx !== 0 || dy !== 0;
    const ids = get(selectedComponentIds);
    const isMultiDrag = ids.size > 1 && ids.has(core?.id);

    // Alt held at drop: leave a copy of the moved controls where the gesture
    // started — Alt+drag-duplicate, done before the originals move so the
    // clones inherit the start positions.
    if (moved && e?.altKey === true) {
      duplicateControlsInPlace(isMultiDrag ? ids : [core?.id]);
    }

    // Where did the drag end — over which container (or top level)?
    //
    // Not asked at all when a selected ancestor is carrying this control. The moving root is the
    // ancestor, the pointer is inside it, and buildDropCandidates excludes a moving root's whole
    // subtree — so the answer would be "somewhere outside the container you are still inside", and
    // a Ctrl+A drag of one nested child would tear its container out of its parent.
    const carriedNow = isMultiDrag && hasSelectedAncestor(parentChainIds, ids);
    const currentParentId = myParentId;
    let targetParentId = currentParentId;
    if (moved && !dragSpaceHeld && !carriedNow) {
      const surfacePoint = surfacePointFromClient(e?.clientX, e?.clientY);
      if (surfacePoint) targetParentId = dropCandidateAt(surfacePoint.x, surfacePoint.y);
    }

    if (moved && targetParentId !== currentParentId) {
      // Structural move: reparent the selection roots into the target container
      // (or to top level when null), converting positions so nothing visually jumps.
      const roots = isMultiDrag ? selectionRoots(panelControls, ids) : [core?.id];
      const entries = [];
      for (const rootId of roots) {
        if (rootId == null) continue;
        let panelX, panelY;
        if (rootId === core?.id) {
          panelX = transientX + parentOffset.x;
          panelY = transientY + parentOffset.y;
        } else {
          const rect = controlPanelRect(panelControls, rootId);
          if (!rect) continue;
          panelX = rect.x + dx;
          panelY = rect.y + dy;
        }
        const local = panelToLocalPoint(panelControls, targetParentId, panelX, panelY);
        entries.push({ id: rootId, x: local.x, y: local.y });
      }
      if (entries.length) reparentControls(entries, targetParentId);
    } else if (moved) {
      // What moves, and by how much. This used to walk `allControls` — the panel's TOP-LEVEL list
      // — which got two different things wrong at once: a co-selected sibling nested in a
      // container was never in that list, so it followed the drag on screen and snapped back the
      // instant you let go; and a child selected alongside its container (Ctrl+A does exactly
      // that) WAS in the list at top level and got the delta a second time on top of the
      // translation its container had already given it. multiDragPatches answers both from the
      // selection ROOTS over the whole tree — see utils/canvasDragFrame.js.
      const patches = multiDragPatches({
        tree: dragTree,
        selectedIds: ids,
        draggedId: core?.id ?? null,
        draggedAncestorIds: parentChainIds,
        dx,
        dy,
        draggedX: transientX,
        draggedY: transientY,
        multi: isMultiDrag,
        getSection,
      });

      if (patches.size > 0) {
        applyControlPatchesById(patches);
      }
    }

    // Clear multi-drag delta
    multiDragDelta.set({ x: 0, y: 0, active: false });

    // One gesture = one undo step, committed at the boundary instead of
    // letting the 400ms debounce merge it with whatever comes next.
    if (moved) pushSnapshot();

    isDragging = false;
    dragEngaged = false;
    dropCandidates = null;
    transientX = null;
    transientY = null;
    snapGuides = [];
    distanceLabels = [];
    clearActivePanelSnapGuides();
    onDragEnd?.();
    // Swallow the click only if it lands on the canvas (prevents deselect),
    // but let clicks on menus/toolbar pass through
    window.addEventListener('click', (ev) => {
      if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
        ev.stopPropagation(); ev.preventDefault();
      }
    }, { once: true, capture: true });
  }

  // --- Resize ---
  function handleResizeStart(handle, e) {
    if (isEditorLocked) return;
    e.stopPropagation();
    e.preventDefault();

    isResizing = true;
    resizeHandle = handle;
    resizeStartMouse = { x: e.clientX, y: e.clientY };
    resizeStartRect = {
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
      w: transform?.width ?? 100,
      h: transform?.height ?? 40,
    };
    transientX = resizeStartRect.x;
    transientY = resizeStartRect.y;
    transientW = resizeStartRect.w;
    transientH = resizeStartRect.h;

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  }

  function handleResizeMove(e) {
    if (!isResizing) return;

    const dx = (e.clientX - resizeStartMouse.x) / scale;
    const dy = (e.clientY - resizeStartMouse.y) / scale;

    const rotation = Number(transform?.rotation ?? 0) % 360;
    // Alt resizes about the control's own centre instead of pinning the opposite edge — the
    // convention every design tool shares, and the same option the group box passes. Note Alt is
    // read for drag-duplicate too (handleDragEnd), but the two gestures are exclusive: you are
    // either on a handle or on the body.
    const fromCenter = e.altKey === true;
    const resizeOpts = {
      fromCenter,
      aspectLock: e.shiftKey || (transform?.aspectLock === true),
      aspectRatio: resizeStartRect.w / resizeStartRect.h,
      minW: Math.max(MIN_SIZE, transform?.minWidth || 0),
      minH: Math.max(MIN_SIZE, transform?.minHeight || 0),
      maxW: transform?.maxWidth || 0,
      maxH: transform?.maxHeight || 0,
    };

    // Rotated controls resize in their own frame (the handles are rotated
    // with the box, so the drag must be too), with the opposite point held
    // fixed on screen. Axis-aligned snapping is meaningless there, so it is
    // skipped for them.
    if (rotation) {
      const rect = computeRotatedResizedRect(resizeStartRect, resizeHandle, dx, dy, rotation, resizeOpts);
      transientX = Math.round(rect.x);
      transientY = Math.round(rect.y);
      transientW = Math.round(rect.w);
      transientH = Math.round(rect.h);
      snapGuides = [];
      setActivePanelSnapGuides([]);
      distanceLabels = [];
      return;
    }

    // Resize geometry (deltas + aspect lock + min/max clamping)
    let rect = computeResizedRect(resizeStartRect, resizeHandle, dx, dy, resizeOpts);

    // Holding Ctrl/Cmd suspends snapping during resize, matching drag. Alt suspends it too, and
    // not as a convenience: a positional snap moves x/y, which under from-centre resizing walks
    // the centre off the point the gesture is supposed to be pinning. The rotated branch above
    // already skips snapping for the same class of reason.
    const snapSuspended = e.ctrlKey || e.metaKey || fromCenter;

    // Grid snap
    if (!snapSuspended && snapToGrid) rect = snapRectToGrid(rect, gridSize, snapToGridX, snapToGridY);

    // Alignment snap overrides grid when within threshold
    const align = snapSuspended ? { x: rect.x, y: rect.y, guides: [] } : alignSnap(rect.x, rect.y, rect.w, rect.h);
    if (snapSuspended) setActivePanelSnapGuides([]);
    transientX = Math.round(align.x);
    transientY = Math.round(align.y);
    transientW = Math.round(rect.w);
    transientH = Math.round(rect.h);
    publishMeasurements(align, $showDistances ? distancesFor(transientX, transientY, transientW, transientH) : []);
  }

  function handleResizeEnd() {
    if (!isResizing) return;
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);

    if (core?.id) {
      applyControlPatchesById(new Map([[
        core.id,
        {
          'Transform.x': transientX,
          'Transform.y': transientY,
          'Transform.width': transientW,
          'Transform.height': transientH,
        },
      ]]));
      pushSnapshot();   // gesture boundary — one resize, one undo step
    }

    isResizing = false;
    resizeHandle = '';
    transientX = null;
    transientY = null;
    transientW = null;
    transientH = null;
    snapGuides = [];
    distanceLabels = [];
    clearActivePanelSnapGuides();
    // Swallow the click only if it lands on the canvas (prevents deselect),
    // but let clicks on menus/toolbar pass through
    window.addEventListener('click', (ev) => {
      if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
        ev.stopPropagation(); ev.preventDefault();
      }
    }, { once: true, capture: true });
  }

  // --- Rotation ---
  let isRotating = $state(false);
  let rotateStartAngle = $state(0);
  let rotateStartRotation = $state(0);
  let transientRotation = $state(null);

  function handleRotateStart(e) {
    if (isEditorLocked) return;
    e.stopPropagation();
    e.preventDefault();

    isRotating = true;
    rotateStartRotation = transform?.rotation ?? 0;
    transientRotation = rotateStartRotation;

    const cx = displayX + displayW / 2;
    const cy = displayY + displayH / 2;
    const p = clientToPanelPoint(e.target.closest('.panel-surface'), e.clientX, e.clientY, scale);
    if (!p) return;
    rotateStartAngle = angleFromCenter(cx, cy, p.x, p.y);

    window.addEventListener('mousemove', handleRotateMove);
    window.addEventListener('mouseup', handleRotateEnd);
  }

  function handleRotateMove(e) {
    if (!isRotating) return;
    const cx = displayX + displayW / 2;
    const cy = displayY + displayH / 2;
    const p = clientToPanelPoint(document.querySelector('.panel-surface'), e.clientX, e.clientY, scale);
    if (!p) return;
    const currentAngle = angleFromCenter(cx, cy, p.x, p.y);
    transientRotation = computeRotation(rotateStartAngle, currentAngle, rotateStartRotation, e.shiftKey);
  }

  function handleRotateEnd() {
    if (!isRotating) return;
    window.removeEventListener('mousemove', handleRotateMove);
    window.removeEventListener('mouseup', handleRotateEnd);

    if (core?.id && transientRotation !== rotateStartRotation) {
      updateControlProperty(core.id, 'Transform.rotation', normalizeRotation(transientRotation));
      pushSnapshot();   // gesture boundary — one rotation, one undo step
    }

    isRotating = false;
    transientRotation = null;

    window.addEventListener('click', (ev) => {
      if (ev.target?.closest?.('.panel-surface, .canvas-viewport')) {
        ev.stopPropagation(); ev.preventDefault();
      }
    }, { once: true, capture: true });
  }

  // Current rotation for display (transient during rotate drag, otherwise from the resolved transform)
  let displayRotation = $derived(transientRotation ?? renderTransform?.rotation ?? transform?.rotation ?? 0);
  let rootTransitionCSS = $derived.by(() => {
    const rules = [];
    const transformTransition = interactionRuntime?.transitions?.rootTransitions?.get?.('transform');
    const opacityTransition = interactionRuntime?.transitions?.rootTransitions?.get?.('opacity');

    if (transformTransition) rules.push(`transform ${transformTransition}`);
    if (opacityTransition) rules.push(`opacity ${opacityTransition}`);

    return rules.length ? `transition:${rules.join(', ')};` : '';
  });
  let canvasTransformCSS = $derived.by(() => {
    const transforms = [];
    if (Math.abs(displayRotation) > 0.001) transforms.push(`rotate(${displayRotation}deg)`);
    if (Math.abs(renderScale - 1) > 0.001) transforms.push(`scale(${renderScale})`);
    return transforms.length
      ? `transform:${transforms.join(' ')}; transform-origin:center center;`
      : '';
  });

  // Resize handle definitions: [id, cursor, css-position]
  const ALL_HANDLES = [
    { id: 'tl', cursor: 'nwse-resize' },
    { id: 't',  cursor: 'ns-resize' },
    { id: 'tr', cursor: 'nesw-resize' },
    { id: 'l',  cursor: 'ew-resize' },
    { id: 'r',  cursor: 'ew-resize' },
    { id: 'bl', cursor: 'nesw-resize' },
    { id: 'b',  cursor: 'ns-resize' },
    { id: 'br', cursor: 'nwse-resize' },
  ];

  // A derived axis has no handle. Offering one that snaps back the instant you let go is worse
  // than offering none — the control looks broken rather than deliberate. Corners disappear when
  // EITHER of their axes is derived, since a corner drags both.
  let handles = $derived.by(() => {
    if (!fittedSelf) return ALL_HANDLES;
    const w = axisIsDerived(control, 'width');
    const h = axisIsDerived(control, 'height');
    return ALL_HANDLES.filter(({ id }) => {
      const dragsWidth = id.includes('l') || id.includes('r');
      const dragsHeight = id.includes('t') || id.includes('b');
      return !((dragsWidth && w) || (dragsHeight && h));
    });
  });

  // Screen-constant handles: the overlay lives inside the scaled surface, so
  // sizes are pre-divided by the zoom scale (see resizeHandleStyle).
  let handleStyle = $derived((id) => resizeHandleStyle(id, 1 / (scale || 1)));

  // --- Effects CSS (applied to .canvas-control and .control-content) ---
  let shadowCSS = $derived(buildShadowCSS(effects));
  let blendCSS  = $derived(buildBlendCSS(effects));
  let filterCSS = $derived(buildFilterCSS(effects));

  // A flat colour or a single gradient paints on `.control-content` itself instead of on a child
  // div. That element is `inset: 0` — the control's whole box — and an element's background paints
  // below every one of its children, which is exactly where the fill layer sat as the first of
  // them. See utils/plainFillCSS.js for what is refused and why.
  //
  // The one thing this does move: `.control-content` carries `overflow: hidden`, so a rounded fill
  // now rounds the clip as well as the paint. Content in the corner of a rounded control used to
  // be drawn outside its own visible shape; it is cut to it instead.
  let absorbedFillCSS = $derived(background ? plainFillCSS(background, displayW, displayH) : null);

  function textShapeMaskId(kind = 'block') {
    return `text-shape-mask-${svgIdSeed}-${kind}`;
  }

  function textOutlineMaskId(kind = 'block') {
    return `text-outline-mask-${svgIdSeed}-${kind}`;
  }

  function textReflectionFadeGradientId(kind = 'block') {
    return `text-reflection-fade-gradient-${svgIdSeed}-${kind}`;
  }

  function textReflectionFadeMaskId(kind = 'block') {
    return `text-reflection-fade-mask-${svgIdSeed}-${kind}`;
  }

  function lineGeometryFor(kind, fontSection, fillSection) {
    return lineGeometry(kind, fontSection, fillSection, {
      inlineExtent: textBlockInlineExtent,
      centerX: textAxisCenter.x,
      centerY: textAxisCenter.y,
    });
  }

  function lineMaskId(kind, layer) {
    return `text-line-mask-${svgIdSeed}-${kind}-${layer}`;
  }

  function customFlowMaskId(kind, layer) {
    return `text-flow-mask-${svgIdSeed}-${kind}-${layer}`;
  }

  function drawTextMask(ctx, geometry, fontSection) {
    if (!hasText || !textPlacement) return;

    ctx.save();
    ctx.font = lineCanvasFont(fontSection, resolvedFontFamily);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFF';

    if (textIsMirrored) {
      ctx.translate(textAxisCenter.x * 2, 0);
      ctx.scale(-1, 1);
    }

    if (glyphCharacterRects.length > 0) {
      const sortedRects = [...glyphCharacterRects].sort((a, b) => {
        const topDelta = a.top - b.top;
        if (Math.abs(topDelta) > 0.5) return topDelta;
        return a.left - b.left;
      });
      const lineGroups = [];

      for (const rect of sortedRects) {
        const currentGroup = lineGroups[lineGroups.length - 1];
        if (!currentGroup || Math.abs(rect.top - currentGroup.referenceTop) > 0.75) {
          lineGroups.push({
            referenceTop: rect.top,
            top: rect.top,
            chars: [rect],
          });
        } else {
          currentGroup.top = Math.min(currentGroup.top, rect.top);
          currentGroup.chars.push(rect);
        }
      }

      for (const group of lineGroups) {
        const baselineCandidates = group.chars
          .map((rect) => {
            if (!rect.char) return null;
            const metrics = ctx.measureText(rect.char);
            return rect.top + numberOr(metrics.actualBoundingBoxAscent, numberOr(fontSection?.size, 12) * 0.8);
          })
          .filter((value) => Number.isFinite(value))
          .sort((a, b) => a - b);
        const baselineY = baselineCandidates.length > 0
          ? baselineCandidates[Math.floor(baselineCandidates.length / 2)]
          : group.top + (numberOr(fontSection?.size, 12) * 0.8);

        for (const rect of group.chars) {
          if (!rect.char) continue;
          if (geometry.bottom <= rect.top || geometry.top >= rect.bottom) continue;

          const metrics = ctx.measureText(rect.char);
          const drawX = rect.left - numberOr(metrics.actualBoundingBoxLeft, 0);

          ctx.fillText(rect.char, drawX, baselineY);
        }
      }

      ctx.restore();
      return;
    }

    const fontSize = Math.max(1, numberOr(fontSection?.size, 12));
    const letterSpacing = numberOr(fontSection?.letterSpacing, 0);
    const wordSpacing = numberOr(fontSection?.wordSpacing, 0);
    const probe = ctx.measureText('Mg');
    const ascent = numberOr(probe.actualBoundingBoxAscent, fontSize * 0.8);
    const lineHeight = blockTextLayout.lineHeight;
    const baseLeft = textUnrotatedOrigin.left;
    const baseTop = textUnrotatedOrigin.top;
    const justification = textPosition?.justification ?? 'centred';
    const lineBoxWidth = blockTextLayout.lineBoxWidth > 0 ? blockTextLayout.lineBoxWidth : Math.max(0, textGlyphSize.width);

    for (let lineIndex = 0; lineIndex < blockTextLayout.lineEntries.length; lineIndex += 1) {
      const lineEntry = blockTextLayout.lineEntries[lineIndex] ?? null;
      const line = lineEntry?.text ?? '';
      const baselineY = baseTop + (lineIndex * lineHeight) + ascent;
      const lineWidth = numberOr(lineEntry?.visualWidth, measureCanvasLineWidth(ctx, line, letterSpacing, wordSpacing, fontSize));
      const resolvedWordSpacing = wordSpacing + numberOr(lineEntry?.extraWordSpacing, 0);
      const resolvedLetterSpacing = letterSpacing + numberOr(lineEntry?.extraLetterSpacing, 0);
      let cursorX = baseLeft;

      if (lineEntry?.fillWidthApplied === true) {
        cursorX = baseLeft;
      } else if (justification === 'top' || justification === 'centred' || justification === 'bottom') {
        cursorX += (lineBoxWidth - lineWidth) / 2;
      } else if (justification === 'right' || justification === 'topRight' || justification === 'bottomRight') {
        cursorX += lineBoxWidth - lineWidth;
      }

      const chars = Array.from(line);
      for (let charIndex = 0; charIndex < chars.length; charIndex += 1) {
        const char = chars[charIndex];
        const advance = measureGlyphAdvance(ctx, char, fontSize, resolvedWordSpacing);
        if (char.trim().length > 0) {
          ctx.fillText(char, cursorX, baselineY);
        }
        cursorX += advance;
        if (charIndex < chars.length - 1) {
          cursorX += resolvedLetterSpacing;
        }
      }
    }

    ctx.restore();
  }

  function buildLineSegmentsFromMask(geometry, fontSection, pixelWidth, pixelHeight, dpr) {
    const width = Math.max(0, geometry.right - geometry.left);
    if (width <= 0) return [];
    if (geometry.gap <= 0 || !hasText || !textPlacement || typeof document === 'undefined') {
      return [{ left: geometry.left, width }];
    }

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = pixelWidth;
    maskCanvas.height = pixelHeight;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskCtx) {
      return [{ left: geometry.left, width }];
    }

    maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    maskCtx.clearRect(0, 0, displayW, displayH);
    drawTextMask(maskCtx, geometry, fontSection);

    const scanLeft = Math.max(0, Math.floor(geometry.left * dpr));
    const scanRight = Math.min(pixelWidth, Math.ceil(geometry.right * dpr));
    const scanTop = Math.max(0, Math.floor(geometry.top * dpr));
    const scanBottom = Math.min(pixelHeight, Math.ceil(geometry.bottom * dpr));
    const scanWidth = Math.max(0, scanRight - scanLeft);
    const scanHeight = Math.max(1, scanBottom - scanTop);

    if (scanWidth <= 0) return [];

    const alphaData = maskCtx.getImageData(scanLeft, scanTop, scanWidth, scanHeight).data;
    const occupiedColumns = new Array(scanWidth).fill(false);

    for (let x = 0; x < scanWidth; x += 1) {
      for (let y = 0; y < scanHeight; y += 1) {
        const alpha = alphaData[((y * scanWidth) + x) * 4 + 3];
        if (alpha > 64) {
          occupiedColumns[x] = true;
          break;
        }
      }
    }

    const gapColumns = Math.max(0, Math.round(geometry.gap * dpr));
    if (gapColumns > 0) {
      const expandedColumns = [...occupiedColumns];
      for (let x = 0; x < scanWidth; x += 1) {
        if (!occupiedColumns[x]) continue;
        const left = Math.max(0, x - gapColumns);
        const right = Math.min(scanWidth - 1, x + gapColumns);
        for (let i = left; i <= right; i += 1) {
          expandedColumns[i] = true;
        }
      }
      occupiedColumns.splice(0, occupiedColumns.length, ...expandedColumns);
    }

    const includedColumns = occupiedColumns.map((occupied) => !occupied);
    const minimumVisibleRun = Math.max(1, Math.round(Math.max(geometry.gap, geometry.thickness) * dpr));
    if (minimumVisibleRun > 1) {
      let runStart = -1;
      for (let x = 0; x <= scanWidth; x += 1) {
        const isVisible = x < scanWidth ? includedColumns[x] : false;
        if (isVisible) {
          if (runStart < 0) runStart = x;
          continue;
        }

        if (runStart >= 0) {
          const runLength = x - runStart;
          if (runLength < minimumVisibleRun) {
            for (let i = runStart; i < x; i += 1) {
              includedColumns[i] = false;
            }
          }
          runStart = -1;
        }
      }
    }

    const segments = [];
    let start = -1;
    for (let x = 0; x < scanWidth; x += 1) {
      if (includedColumns[x]) {
        if (start < 0) start = x;
        continue;
      }

      if (start >= 0) {
        segments.push({
          left: (scanLeft + start) / dpr,
          width: (x - start) / dpr,
        });
        start = -1;
      }
    }

    if (start >= 0) {
      segments.push({
        left: (scanLeft + start) / dpr,
        width: (scanWidth - start) / dpr,
      });
    }

    return segments.filter((segment) => segment.width > 0);
  }

  function renderLineLayerCanvas(canvasElement, targetLayer) {
    if (!canvasElement) return;

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
    const pixelWidth = Math.max(1, Math.round(displayW * dpr));
    const pixelHeight = Math.max(1, Math.round(displayH * dpr));

    if (canvasElement.width !== pixelWidth) canvasElement.width = pixelWidth;
    if (canvasElement.height !== pixelHeight) canvasElement.height = pixelHeight;

    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayW, displayH);

    for (const kind of ['underline', 'strikethrough', 'overline']) {
      if (fontSectionForCanvas?.[kind] !== true) continue;
      if (lineLayerFor(kind, fontSectionForCanvas) !== targetLayer) continue;

      const geometry = lineGeometryFor(kind, fontSectionForCanvas, textFillForCanvas);
      const width = Math.max(0, geometry.right - geometry.left);
      if (width <= 0 || geometry.thickness <= 0) continue;

      ctx.fillStyle = geometry.colour;
      const segments = measurePerfDebug(
        `text line mask ${core?.id ?? 'control'}`,
        () => buildLineSegmentsFromMask(geometry, fontSectionForCanvas, pixelWidth, pixelHeight, dpr),
        {
          minDurationMs: 3,
          detail: `kind=${kind} width=${Math.round(width)} gap=${numberOr(geometry.gap, 0)}`,
        }
      );
      for (const segment of segments) {
        ctx.fillRect(segment.left, geometry.top, segment.width, geometry.thickness);
      }
    }
  }

  let textFill = $derived(text?._children?.Fill ?? null);
  let textFont = $derived(text?._children?.Font ?? null);
  let textMultiline = $derived(text?._children?.Multiline ?? null);
  let textEffects = $derived(text?._children?.Effects ?? null);
  let textPosition = $derived(text?._children?.Position ?? null);
  let contentLayoutMode = $derived(String(contentLayout?.mode ?? 'text_only'));
  let layoutPaddingLeft = $derived(numberOr(contentLayout?.paddingLeft, textPosition?.paddingLeft ?? 4));
  let layoutPaddingRight = $derived(numberOr(contentLayout?.paddingRight, textPosition?.paddingRight ?? 4));
  let layoutPaddingTop = $derived(numberOr(contentLayout?.paddingTop, 0));
  let layoutPaddingBottom = $derived(numberOr(contentLayout?.paddingBottom, 0));
  let layoutGap = $derived(Math.max(0, numberOr(contentLayout?.gap, 8)));
  let effectiveTextOffsetX = $derived(numberOr(textPosition?.offsetX, 0) + numberOr(contentLayout?.textOffsetX, 0));
  let effectiveTextOffsetY = $derived(numberOr(textPosition?.offsetY, 0) + numberOr(contentLayout?.textOffsetY, 0));
  let effectiveTextPaddingLeft = $derived(
    layoutPaddingLeft + (
      contentLayoutMode === 'icon_left_text_right' && icon?.source !== 'none'
        ? Math.max(4, Number(icon?.size ?? 16)) + layoutGap
        : 0
    )
  );
  let effectiveTextPaddingRight = $derived(
    layoutPaddingRight + (
      contentLayoutMode === 'text_left_icon_right' && icon?.source !== 'none'
        ? Math.max(4, Number(icon?.size ?? 16)) + layoutGap
        : 0
    )
  );
  let effectiveTextPaddingTop = $derived(
    layoutPaddingTop + (
      contentLayoutMode === 'icon_above_text_below' && icon?.source !== 'none'
        ? Math.max(4, Number(icon?.size ?? 16)) + layoutGap
        : 0
    )
  );
  let effectiveTextPaddingBottom = $derived(
    layoutPaddingBottom + (
      contentLayoutMode === 'text_above_icon_below' && icon?.source !== 'none'
        ? Math.max(4, Number(icon?.size ?? 16)) + layoutGap
        : 0
    )
  );
  let textReadingOrientation = $derived(normalizeTextReadingOrientation(textPosition?.readingOrientation));
  let textIsMirrored = $derived(textReadingOrientation === 'mirrored');
  let textCaseMode = $derived(normalizeTextCaseMode(textFont?.caseMode));
  let textScriptMode = $derived(normalizeScriptMode(textFont?.scriptMode));
  let textScriptScale = $derived(scriptScaleForMode(textScriptMode));
  let textScriptBaselineShift = $derived(scriptBaselineShiftForMode(textScriptMode, numberOr(textFont?.size, 12)) + numberOr(textFont?.baselineShift, 0));
  let textFontFeatureSettings = $derived(buildFontFeatureSettings(textFont));
  let textFontVariationSettings = $derived(buildFontVariationSettings(textFont?.variationAxes));
  let textVariantCaps = $derived(textCaseVariantCaps(textCaseMode));
  let textFillMode = $derived(normalizeFillMode(textFill?.mode));
  let rawTextContent = $derived.by(() => {
    const isSelectorFace = buttonType === 'cyclic' || buttonType === 'combobox';
    if (isSelectorFace && interactionRuntime?.signals?.valueDisplay !== undefined) {
      return String(interactionRuntime.signals.valueDisplay ?? '');
    }

    // No runtime: the plain editor canvas. A selector still has to show the row it will open
    // on, or the canvas disagrees with preview about the same control -- "Option 1" against
    // "Clean" -- and the disagreement is invisible until you run it. Same resolution preview
    // uses, so the two cannot say different things.
    if (isSelectorFace) {
      const label = getDefaultValueRowLabel(sourceValueSection ?? valueSection);
      if (label) return label;
    }

    return String(text?.content ?? '');
  });
  let casedTextContent = $derived.by(() => applyTextCaseMode(rawTextContent, textCaseMode));
  let renderedTextContent = $derived.by(() => applyTextReadingOrientation(casedTextContent, textReadingOrientation));
  let textFillImageUrl = $derived.by(() => {
    const source = String(textFill?.imageSrc ?? '');
    if (!source) return '';
    if (source.startsWith('data:') || /^https?:/i.test(source)) return source;
    loadFile(source);
    return $fileCache[source] ?? '';
  });
  let textFillTextureUrl = $derived.by(() => {
    const source = String(textFill?.textureSrc ?? '');
    if (!source) return '';
    if (source.startsWith('data:') || /^https?:/i.test(source)) return source;
    loadFile(source);
    return $fileCache[source] ?? '';
  });
  let textFillLayerStyle = $derived.by(() => buildTextFillLayerStyle(textFill, textFillImageUrl, textFillTextureUrl));
  let textWordSpacing = $derived(numberOr(textFont?.wordSpacing, 0));
  let textLineHeightMultiplier = $derived(Math.max(0.5, numberOr(textMultiline?.lineHeight, 1.2)));
  let textWrapMode = $derived.by(() => {
    const value = String(textMultiline?.wrapMode ?? 'word');
    return value === 'none' || value === 'character' ? value : 'word';
  });
  let textParagraphMode = $derived.by(() =>
    normalizeParagraphMode(String(textMultiline?.paragraphMode ?? textMultiline?.fillWidthMode ?? 'normal'))
  );
  let textOverflowMode = $derived(String(textMultiline?.overflowMode ?? 'clip') === 'ellipsis' ? 'ellipsis' : 'clip');
  let textFitMode = $derived(String(textMultiline?.fitMode ?? 'none') === 'shrink' ? 'shrink' : 'none');
  let textMaxLines = $derived(Math.max(0, Math.round(numberOr(textMultiline?.maxLines, 0))));
  let textJustifyLastLine = $derived(textMultiline?.justifyLastLine === true);
  let textLastLineAlign = $derived(normalizeLastLineAlign(textMultiline?.lastLineAlign));
  let textFlowMode = $derived(normalizeTextFlowMode(textPosition?.flowMode));
  let usesCustomTextFlow = $derived(textFlowMode !== 'rotate');
  let textFlowAngle = $derived(resolveTextFlowAngle(textPosition));
  let textFlowStepX = $derived(numberOr(textPosition?.flowStepX, Math.max(6, numberOr(textFont?.size, 12) * 0.6)));
  let textFlowStepY = $derived(numberOr(textPosition?.flowStepY, Math.max(6, numberOr(textFont?.size, 12) * 0.45)));
  let textFlowRadius = $derived(Math.max(1, numberOr(textPosition?.flowRadius, Math.max(18, numberOr(textFont?.size, 12) * 3))));
  let textFlowSweep = $derived(numberOr(textPosition?.flowSweep, 180));
  let textFlowDistribution = $derived(String(textPosition?.flowDistribution ?? 'natural'));
  let textFlowFacing = $derived(String(textPosition?.flowFacing ?? 'path'));
  let textFlowSide = $derived(String(textPosition?.flowSide ?? 'center'));
  let textFlowReverse = $derived(textPosition?.flowReverse === true);
  let textFlowStartOffset = $derived(numberOr(textPosition?.flowStartOffset, 0));
  let textFlowFixedAdvance = $derived(numberOr(textPosition?.flowFixedAdvance, 0));
  let textFlowAmplitude = $derived(numberOr(textPosition?.flowAmplitude, 18));
  let textFlowFrequency = $derived(numberOr(textPosition?.flowFrequency, 1));
  let textFlowTurns = $derived(numberOr(textPosition?.flowTurns, 2));
  let textFlowPerimeterInset = $derived(numberOr(textPosition?.flowPerimeterInset, 0));
  let textFlowStairUnit = $derived(String(textPosition?.flowStairUnit ?? 'character'));
  let textOrientation = $derived(normalizeTextOrientation(textPosition?.orientation));
  let textRotationDegrees = $derived(usesCustomTextFlow ? 0 : numberOr(textFlowAngle, textOrientationAngle(textOrientation)));
  let textContentWidth = $derived(Math.max(0, displayW - effectiveTextPaddingLeft - effectiveTextPaddingRight));
  let textContentHeight = $derived(Math.max(0, displayH - effectiveTextPaddingTop - effectiveTextPaddingBottom));
  let textMeasureMaxWidth = $derived.by(() => {
    if (usesCustomTextFlow) return textContentWidth;
    return isQuarterTurnAngle(textRotationDegrees) ? textContentHeight : textContentWidth;
  });
  let textParagraphMeasureWidth = $derived(textMeasureMaxWidth);
  let textForceLineBoxWidth = $derived(!usesCustomTextFlow);
  let hasText = $derived(!isRadioGroupControl && !isListboxControl && !isTextInput && !isMeter && !isEnvelope && !isMatrix && !isJoystick && !isCrossfader && !isNumpad && !isRibbon && !isMacro && !isOrbit && !isLooper && !isRouter && !isTimbre && !isTuring && !isKinetic && !isConstellation && !isConstraint && !isChordPad && !isArp && !isNoteRibbon && !isDrumPads && !isPanic && !isTransport && !isSplitZone && !isPhrase && !isRecorder && !isHarmoniser && !isSetlist && !!text && renderedTextContent.length > 0 && contentLayoutMode !== 'icon_only');
  let textOutlineThickness = $derived(Math.max(1, numberOr(textEffects?.outlineThickness ?? textEffects?.outlineWidth, textEffects?.knockout === true ? 1 : 1)));
  let textOutlineDistance = $derived(Math.max(0, numberOr(textEffects?.outlineDistance, 0)));
  let textOutlineEnabled = $derived(textEffects?.outlineEnabled === true || textEffects?.knockout === true);
  let textOutlineFill = $derived(textEffects?.outlineFill !== false);
  let textOutlineInnerRadius = $derived(textOutlineFill ? 0 : textOutlineDistance);
  let textOutlineOuterRadius = $derived(textOutlineDistance + textOutlineThickness);
  let textOutlineColour = $derived(textEffectColor(textEffects?.outlineColour, textEffects?.knockout === true ? (textFill?.colour ?? 'FFFFFFFF') : 'FF000000'));
  let textOutlineJoin = $derived(String(textEffects?.outlineJoin ?? 'round'));
  let textOutlinePlacement = $derived(String(textEffects?.outlinePlacement ?? 'outer'));
  let textOutlineDashEnabled = $derived(textEffects?.outlineDashEnabled === true);
  let textOutlineDashArray = $derived.by(() => (
    textOutlineDashEnabled
      ? `${Math.max(1, numberOr(textEffects?.outlineDashLength, 8))} ${Math.max(1, numberOr(textEffects?.outlineDashGap, 4))}`
      : ''
  ));
  let textOutlineUseStroke = $derived(textOutlineDashEnabled || textOutlinePlacement !== 'outer');
  let textKnockout = $derived(textEffects?.knockout === true);
  let textFillOrder = $derived(normalizeTextLayerOrder(textFill?.order, 50));
  let textOutlineOrder = $derived(normalizeTextLayerOrder(textEffects?.outlineOrder, 40));
  let textStroke2Order = $derived(normalizeTextLayerOrder(textEffects?.stroke2Order, 45));
  let textShadowStyle = $derived(String(textEffects?.shadowStyle ?? 'soft'));
  let textShadowEnabled = $derived(textEffects?.shadowEnabled === true);
  let textShadowOrder = $derived(normalizeTextLayerOrder(textEffects?.shadowOrder, 10));
  let textSoftShadowEnabled = $derived(
    textShadowEnabled
    && textShadowStyle === 'soft'
    && (
      Math.abs(numberOr(textEffects?.shadowOffsetX, 1)) > 0.001
      || Math.abs(numberOr(textEffects?.shadowOffsetY, 1)) > 0.001
      || Math.max(0, numberOr(textEffects?.shadowBlur, 2)) > 0
    )
  );
  let textLongShadowEnabled = $derived(textShadowEnabled && textShadowStyle !== 'soft');
  let textLongShadowCopies = $derived.by(() => {
    if (!textLongShadowEnabled) return [];
    const steps = Math.max(1, Math.round(numberOr(textEffects?.shadowSteps, 8)));
    const distance = Math.max(0, numberOr(textEffects?.shadowDistance, 12));
    const direction = normalizeVector(numberOr(textEffects?.shadowOffsetX, 1), numberOr(textEffects?.shadowOffsetY, 1));
    return Array.from({ length: steps }, (_, index) => {
      const ratio = (index + 1) / steps;
      return {
        dx: direction.x * distance * ratio,
        dy: direction.y * distance * ratio,
        opacity: textShadowStyle === 'extrude' ? 0.88 : Math.max(0.12, 0.5 * (1 - ratio)),
      };
    });
  });
  let textShadowColour = $derived(textEffectColor(textEffects?.shadowColour, '80000000'));
  let textShadowValue = $derived(buildTextShadowValue(textEffects, textFill?.colour ?? 'FFFFFFFF'));
  let textSoftShadowFilterValue = $derived(buildSingleBlurFilterValue(textEffects?.shadowBlur ?? 0));
  let textGlowLayers = $derived(buildGlowShadowLayers(textEffects, textFill?.colour ?? 'FFFFFFFF'));
  let textGlowEnabled = $derived(textGlowLayers.length > 0);
  let textGlowOrder = $derived(normalizeTextLayerOrder(textEffects?.glowOrder, 20));
  let textFilterValue = $derived(buildTextBlurFilterValue(textEffects));
  let textFillColourResolved = $derived(cssColor(textFill?.colour ?? 'FFFFFFFF'));
  let textMainFillColour = $derived(textKnockout ? 'rgba(0,0,0,0)' : textFillColourResolved);
  let textInnerGlowEnabled = $derived(textEffects?.innerGlowEnabled === true && Math.max(0, numberOr(textEffects?.innerGlowSize, 0)) > 0);
  let textInnerGlowOrder = $derived(normalizeTextLayerOrder(textEffects?.innerGlowOrder, 80));
  let textInnerGlowColour = $derived(textEffectColor(textEffects?.innerGlowColour, textFill?.colour ?? 'FFFFFFFF'));
  let textInnerGlowFilterValue = $derived(buildSingleBlurFilterValue(textEffects?.innerGlowSize ?? 0));
  let textInnerShadowEnabled = $derived(textEffects?.innerShadowEnabled === true);
  let textInnerShadowOrder = $derived(normalizeTextLayerOrder(textEffects?.innerShadowOrder, 60));
  let textInnerShadowColour = $derived(textEffectColor(textEffects?.innerShadowColour, '80000000'));
  let textInnerShadowBlurValue = $derived(buildSingleBlurFilterValue(textEffects?.innerShadowBlur ?? 0));
  let textStroke2Enabled = $derived(textEffects?.stroke2Enabled === true && Math.max(0, numberOr(textEffects?.stroke2Thickness, 0)) > 0);
  let textStroke2Colour = $derived(textEffectColor(textEffects?.stroke2Colour, 'FFFFFFFF'));
  let textStroke2Placement = $derived(String(textEffects?.stroke2Placement ?? 'inner'));
  let textStroke2DashEnabled = $derived(textEffects?.stroke2DashEnabled === true);
  let textStroke2DashArray = $derived.by(() => (
    textStroke2DashEnabled
      ? `${Math.max(1, numberOr(textEffects?.stroke2DashLength, 6))} ${Math.max(1, numberOr(textEffects?.stroke2DashGap, 3))}`
      : ''
  ));
  let needsVisualTextFill = $derived(textFillMode !== 'solid');
  // WebView2 intermittently drops masked foreignObject fills for custom-flow SVG text.
  // Fall back to direct glyph fill there so labels still render and the editor stays interactive.
  let useTextFillForeignObject = $derived(needsVisualTextFill && !usesCustomTextFlow);
  let textReflectionEnabled = $derived(
    textEffects?.reflectionEnabled === true || (textEffects?.reflectionEnabled == null && textEffects?.copyEnabled === true)
  );
  let textReflectionOrder = $derived(normalizeTextLayerOrder(textEffects?.reflectionOrder, 5));
  let textReflectionAngle = $derived.by(() => {
    const explicit = Number(textEffects?.reflectionAngle);
    if (Number.isFinite(explicit)) return explicit;
    return angleDegreesFromVector(textEffects?.copyOffsetX, textEffects?.copyOffsetY, 90);
  });
  let textReflectionDistance = $derived.by(() => {
    const explicit = Number(textEffects?.reflectionDistance);
    if (Number.isFinite(explicit)) return Math.max(0, explicit);
    return Math.hypot(numberOr(textEffects?.copyOffsetX, 0), numberOr(textEffects?.copyOffsetY, 0));
  });
  let textReflectionIntensity = $derived.by(() => {
    const explicit = Number(textEffects?.reflectionIntensity);
    if (Number.isFinite(explicit)) return Math.max(0, Math.min(1, explicit));
    const legacy = parseHexColor(textEffects?.copyColour ?? textFill?.colour ?? 'FFFFFFFF', textFill?.colour ?? 'FFFFFFFF');
    return Math.max(0, Math.min(1, legacy.a));
  });
  let textReflectionColour = $derived.by(() => {
    const stored = String(textEffects?.reflectionColour ?? '').replace(/^#/, '');
    if (stored.length === 8 || stored.length === 6) return textEffectColor(stored, textFill?.colour ?? 'FFFFFFFF');
    const legacy = String(textEffects?.copyColour ?? '').replace(/^#/, '');
    if (legacy.length === 8 || legacy.length === 6) return textEffectColor(legacy, textFill?.colour ?? 'FFFFFFFF');
    return textEffectColor(textFill?.colour ?? 'FFFFFFFF', 'FFFFFFFF');
  });
  let textReflectionFilterValue = $derived(buildSingleBlurFilterValue(
    textEffects?.reflectionBlur ?? textEffects?.copyBlur ?? 0
  ));
  let textMotionEnabled = $derived(textEffects?.motionEnabled === true && Math.max(0, numberOr(textEffects?.motionDistance, 0)) > 0);
  let textMotionOrder = $derived(normalizeTextLayerOrder(textEffects?.motionOrder, 30));
  let textMotionColour = $derived(textEffectColor(textEffects?.motionColour, textFill?.colour ?? 'FFFFFFFF'));
  let textMotionCopies = $derived.by(() => {
    const steps = Math.max(1, Math.round(numberOr(textEffects?.motionSteps, 4)));
    const distance = Math.max(0, numberOr(textEffects?.motionDistance, 8));
    if (!textMotionEnabled || distance <= 0) return [];
    const angleRadians = degToRad(numberOr(textEffects?.motionAngle, 0));
    return Array.from({ length: steps }, (_, index) => {
      const ratio = (index + 1) / steps;
      return {
        dx: Math.cos(angleRadians) * distance * ratio,
        dy: Math.sin(angleRadians) * distance * ratio,
        opacity: Math.max(0.08, 0.35 * (1 - ((index + 1) / (steps + 1)))),
      };
    });
  });
  let textBevelEnabled = $derived(textEffects?.bevelEnabled === true && Math.max(0, numberOr(textEffects?.bevelDepth, 0)) > 0);
  let textBevelOrder = $derived(normalizeTextLayerOrder(textEffects?.bevelOrder, 60));
  let textBevelStyle = $derived(String(textEffects?.bevelStyle ?? 'emboss'));
  let textBevelDepth = $derived(Math.max(0, numberOr(textEffects?.bevelDepth, 1.5)));
  let textBevelHighlightColour = $derived(textEffectColor(textEffects?.bevelHighlightColour, '99FFFFFF'));
  let textBevelShadowColour = $derived(textEffectColor(textEffects?.bevelShadowColour, '99000000'));
  let textBevelIsOuter = $derived(textBevelEnabled && textBevelStyle === 'outer');
  let textBevelIsInside = $derived(textBevelEnabled && textBevelStyle !== 'outer');
  let textBevelHighlightOpacity = $derived.by(() => {
    if (!textBevelEnabled) return 0;
    if (textBevelStyle === 'inner') return 0.65;
    if (textBevelStyle === 'emboss') return 0.8;
    return 0.8;
  });
  let textBevelShadowOpacity = $derived.by(() => {
    if (!textBevelEnabled) return 0;
    if (textBevelStyle === 'inner') return 0.6;
    if (textBevelStyle === 'emboss') return 0.78;
    return 0.8;
  });
  let textBevelNeedsMask = $derived(textBevelEnabled && textBevelStyle !== 'outer');
  let textVisualLayers = $derived.by(() => sortTextVisualLayers([
    ...(textReflectionEnabled ? [{ key: 'reflection', order: textReflectionOrder, priority: 10 }] : []),
    ...(textSoftShadowEnabled ? [{ key: 'softShadow', order: textShadowOrder, priority: 20 }] : []),
    ...(textLongShadowEnabled ? [{ key: 'longShadow', order: textShadowOrder, priority: 21 }] : []),
    ...(textGlowEnabled ? [{ key: 'glow', order: textGlowOrder, priority: 30 }] : []),
    ...(textMotionEnabled ? [{ key: 'motion', order: textMotionOrder, priority: 40 }] : []),
    ...(textBevelIsOuter ? [{ key: 'bevelOuter', order: textBevelOrder, priority: 50 }] : []),
    ...(textOutlineEnabled ? [{ key: 'outline', order: textOutlineOrder, priority: 60 }] : []),
    ...(textStroke2Enabled ? [{ key: 'stroke2', order: textStroke2Order, priority: 70 }] : []),
    { key: 'fill', order: textFillOrder, priority: 80 },
    ...(textInnerShadowEnabled ? [{ key: 'innerShadow', order: textInnerShadowOrder, priority: 90 }] : []),
    ...(textBevelIsInside ? [{ key: 'bevelInner', order: textBevelOrder, priority: 100 }] : []),
    ...(textInnerGlowEnabled ? [{ key: 'innerGlow', order: textInnerGlowOrder, priority: 110 }] : []),
  ]));
  let hasTextEffects = $derived(
    textOutlineEnabled
    || textStroke2Enabled
    || textKnockout
    || textShadowEnabled
    || textGlowEnabled
    || textInnerGlowEnabled
    || textInnerShadowEnabled
    || textEffects?.blurEnabled === true
    || textMotionEnabled
    || textBevelEnabled
    || textReflectionEnabled
  );
  let resolvedStoredFont = $derived.by(() => {
    const requestedFamily = textFont?.family ?? '';
    if (!requestedFamily) return null;

    const byCssFamily = $storedFonts.find((font) => font.cssFamily === requestedFamily && font.enabled);
    if (byCssFamily) return byCssFamily;

    const matchingFamilyFonts = $storedFonts.filter((font) => font.family === requestedFamily && font.enabled);
    if (matchingFamilyFonts.length === 0) return null;

    const wantsItalic = textFont?.style === 'Italic';
    return matchingFamilyFonts.find((font) => (font.fontStyle === 'italic') === wantsItalic)
      ?? matchingFamilyFonts[0];
  });
  $effect(() => {
    if (!resolvedStoredFont) return;
    ensureStoredFontLoaded(resolvedStoredFont, { delayMs: 0 });
  });
  let resolvedFontFamily = $derived(resolvedStoredFont?.cssFamily ?? textFont?.family ?? 'Arial');
  let controlContentElement = $state(null);
  let textGlyphElement = $state(null);
  let domTextGlyphSize = $state({ width: 0, height: 0 });
  let domGlyphCharacterRects = $state.raw([]);
  let lineCanvasBackElement = $state(null);
  let lineCanvasFrontElement = $state(null);
  let fontSectionForCanvas = $derived(textFont ?? null);
  let textFillForCanvas = $derived(textFill ?? null);
  let sourceTextLines = $derived(renderedTextContent.split(/\r\n|\r|\n/));
  let blockTextLayoutState = $derived.by(() => {
    const runLayout = () => buildBlockTextLayoutState(renderedTextContent, {
      fontSection: textFont,
      family: resolvedFontFamily,
      maxWidth: textParagraphMeasureWidth,
      maxHeight: textContentHeight,
      forceLineBoxWidth: textForceLineBoxWidth,
      wrapMode: textWrapMode,
      paragraphMode: textParagraphMode,
      justifyLastLine: textJustifyLastLine,
      lastLineAlign: textLastLineAlign,
      overflowMode: textOverflowMode,
      maxLines: textMaxLines,
      fitMode: textFitMode,
      lineHeightMultiplier: textLineHeightMultiplier,
    });

    if (!text || renderedTextContent.length === 0) {
      return runLayout();
    }

    return measurePerfDebug(
      `text block layout ${core?.id ?? 'control'}`,
      runLayout,
      {
        minDurationMs: 4,
        detail: `chars=${renderedTextContent.length} wrap=${textWrapMode} fit=${textFitMode}`,
      }
    );
  });
  let blockTextLayout = $derived(blockTextLayoutState.layout);
  let blockTextFitScale = $derived(usesCustomTextFlow ? 1 : blockTextLayoutState.fitScale);
  let displayedBlockTextContent = $derived(blockTextLayout.renderedContent);
  let blockTextLineEntries = $derived(usesCustomTextFlow ? [] : blockTextLayout.lineEntries);
  let textBlockInlineExtent = $derived.by(() => Math.max(0, blockTextLayout.lineBoxWidth || textParagraphMeasureWidth));
  let svgTextLines = $derived(usesCustomTextFlow ? sourceTextLines : blockTextLayout.lines);
  let customTextLayout = $derived.by(() => {
    if (!usesCustomTextFlow) {
      return {
        glyphs: [],
        lineEntries: [],
        lineHeight: Math.max(1, numberOr(textFont?.size, 12)),
        bounds: {
          minX: 0,
          maxX: 0,
          minY: 0,
          maxY: 0,
          width: 0,
          height: 0,
          centerX: 0,
          centerY: 0,
        },
      };
    }

    const runLayout = () => buildCustomTextFlowLayout(sourceTextLines, {
      mode: textFlowMode,
      angle: textFlowAngle,
      stepX: textFlowStepX,
      stepY: textFlowStepY,
      radius: textFlowRadius,
      sweep: textFlowSweep,
      wordSpacing: textWordSpacing,
      distribution: textFlowDistribution,
      facing: textFlowFacing,
      side: textFlowSide,
      reverse: textFlowReverse,
      startOffset: textFlowStartOffset,
      fixedAdvance: textFlowFixedAdvance,
      amplitude: textFlowAmplitude,
      frequency: textFlowFrequency,
      turns: textFlowTurns,
      perimeterInset: textFlowPerimeterInset,
      stairUnit: textFlowStairUnit,
      boxWidth: textContentWidth,
      boxHeight: textContentHeight,
      polylinePoints: textPosition?.flowPolylinePoints,
      freehandPoints: textPosition?.flowFreehandPoints,
      bezierPoints: {
        start: { x: textPosition?.flowPathStartX, y: textPosition?.flowPathStartY },
        c1: { x: textPosition?.flowPathC1X, y: textPosition?.flowPathC1Y },
        c2: { x: textPosition?.flowPathC2X, y: textPosition?.flowPathC2Y },
        end: { x: textPosition?.flowPathEndX, y: textPosition?.flowPathEndY },
      },
      lineHeight: Math.max(1, numberOr(textFont?.size, 12) * textLineHeightMultiplier),
      fontSection: textFont,
      family: resolvedFontFamily,
    });

    if (!text || renderedTextContent.length === 0) {
      return runLayout();
    }

    return measurePerfDebug(
      `text custom flow ${core?.id ?? 'control'}`,
      runLayout,
      {
        minDurationMs: 4,
        detail: `mode=${textFlowMode} chars=${renderedTextContent.length}`,
      }
    );
  });
  let textGlyphSize = $derived.by(() => (
    usesCustomTextFlow
      ? {
        width: customTextLayout.bounds.width,
        height: customTextLayout.bounds.height,
      }
      : domTextGlyphSize
  ));
  let glyphCharacterRects = $derived.by(() => (usesCustomTextFlow ? [] : domGlyphCharacterRects));
  let nativePreviewKey = $derived.by(() => {
    if (!resolvedStoredFont?.id || !hasText || usesCustomTextFlow) return '';
    return [
      'canvas',
      resolvedStoredFont.id,
      displayedBlockTextContent,
      displayW,
      displayH,
      textFont?.size ?? 12,
      textFill?.colour ?? 'FFFFFFFF',
      textPosition?.justification ?? 'centred',
      effectiveTextPaddingLeft,
      effectiveTextPaddingRight,
      effectiveTextPaddingTop,
      effectiveTextPaddingBottom,
      textReadingOrientation,
      textFlowMode,
      textFlowAngle,
      textFont?.style ?? 'Normal',
      textFont?.wordSpacing ?? 0,
      textFont?.letterSpacing ?? 0,
      textWrapMode,
      textParagraphMode,
      textOverflowMode,
      textMaxLines,
      textFitMode,
      textLineHeightMultiplier,
      textEffects?.outlineEnabled === true,
      textEffects?.outlineThickness ?? textEffects?.outlineWidth ?? 1,
      textEffects?.outlineDistance ?? 0,
      textEffects?.outlineFill !== false,
      textEffects?.outlineColour ?? 'FF000000',
      textEffects?.outlineJoin ?? 'round',
      textEffects?.shadowEnabled === true,
      textEffects?.shadowOffsetX ?? 1,
      textEffects?.shadowOffsetY ?? 1,
      textEffects?.shadowBlur ?? 2,
      textEffects?.shadowColour ?? '80000000',
      textEffects?.glowEnabled === true,
      textEffects?.glowSize ?? 4,
      textEffects?.glowIntensity ?? 1,
      textEffects?.glowColour ?? '80FFFFFF',
      textEffects?.reflectionEnabled === true,
      textEffects?.reflectionAngle ?? 90,
      textEffects?.reflectionDistance ?? 8,
      textEffects?.reflectionIntensity ?? 0.45,
      textEffects?.reflectionBlur ?? 2,
      textEffects?.reflectionColour ?? 'FFFFFFFF',
    ].join(':');
  });
  let nativePreviewData = $derived(nativePreviewKey ? ($nativeFontPreviews[nativePreviewKey]?.data ?? '') : '');
  let shouldUseNativeTextPreview = $derived(false);

  $effect(() => {
    if (!shouldUseNativeTextPreview || !resolvedStoredFont?.localDataUrl || !hasText || !nativePreviewKey) return;

    requestNativeFontPreview(nativePreviewKey, {
      fontData: resolvedStoredFont.localDataUrl,
      familyName: resolvedStoredFont.family,
      styleName: resolvedStoredFont.styleName || (resolvedStoredFont.fontStyle === 'italic' ? 'Italic' : 'Regular'),
      text: displayedBlockTextContent,
      width: Math.max(1, Math.round(displayW)),
      height: Math.max(1, Math.round(displayH)),
      fontSize: Number(textFont?.size ?? 12),
      colour: String(textFill?.colour ?? 'FFFFFFFF'),
      justification: String(textPosition?.justification ?? 'centred'),
      paddingLeft: Number(effectiveTextPaddingLeft),
      paddingRight: Number(effectiveTextPaddingRight),
      paddingTop: Number(effectiveTextPaddingTop),
      paddingBottom: Number(effectiveTextPaddingBottom),
      italic: textFont?.style === 'Italic' || resolvedStoredFont.fontStyle === 'italic',
      underline: false,
      wordSpacing: Number(textFont?.wordSpacing ?? 0),
      letterSpacing: Number(textFont?.letterSpacing ?? 0),
      paragraphMode: textParagraphMode,
    });
  });
  let textStyle = $derived.by(() => {
    if (!hasText) return '';
    return [
      `padding:${effectiveTextPaddingTop}px ${effectiveTextPaddingRight}px ${effectiveTextPaddingBottom}px ${effectiveTextPaddingLeft}px`,
      `z-index:${numberOr(contentLayout?.textZIndex, 2)}`,
    ].join('; ');
  });
  let textLayoutBounds = $derived.by(() => {
    if (usesCustomTextFlow) {
      return {
        width: customTextLayout.bounds.width,
        height: customTextLayout.bounds.height,
      };
    }
    const baseWidth = Math.max(0, domTextGlyphSize.width) * blockTextFitScale;
    const baseHeight = Math.max(0, domTextGlyphSize.height || numberOr(textFont?.size, 12)) * blockTextFitScale;
    return rotatedBoxSize(baseWidth, baseHeight, textRotationDegrees);
  });
  let textPlacement = $derived.by(() => {
    if (!hasText) return null;

    const glyphWidth = textLayoutBounds.width;
    const glyphHeight = textLayoutBounds.height;
    const justification = textPosition?.justification ?? 'centred';

    let left = effectiveTextPaddingLeft;
    let top = effectiveTextPaddingTop;

    switch (justification) {
      case 'top':
      case 'centred':
      case 'bottom':
        left += (textContentWidth - glyphWidth) / 2;
        break;
      case 'right':
      case 'topRight':
      case 'bottomRight':
        left += textContentWidth - glyphWidth;
        break;
      default:
        break;
    }

    switch (justification) {
      case 'left':
      case 'centred':
      case 'right':
        top += (textContentHeight - glyphHeight) / 2;
        break;
      case 'bottom':
      case 'bottomLeft':
      case 'bottomRight':
        top += textContentHeight - glyphHeight;
        break;
      default:
        break;
    }

    return { left, top, width: glyphWidth, height: glyphHeight };
  });
  let textUnrotatedOrigin = $derived.by(() => {
    // The DOM measurement, but never zero. This origin subtracts half the block's width from the
    // centre, so a width of 0 puts the block's LEFT edge at the centre — and until the measuring
    // effect has committed (or wherever it never does), that is exactly what happened: every
    // centred label started at its box's midpoint and ran off the right edge, so "CATEGORY"
    // rendered as "CATEG" and "LEVEL" as "LEV", cut mid-glyph. The layout engine has already
    // measured the same lines itself — its lineBoxWidth is the width the span is styled to — so an
    // unanswered DOM measurement falls back to that instead of to nothing.
    const width = Math.max(0, domTextGlyphSize.width)
      || Math.max(0, blockTextLayout.lineBoxWidth || 0)
      || Math.max(0, textLayoutBounds.width || 0);
    const height = Math.max(0, domTextGlyphSize.height || numberOr(textFont?.size, 12));
    return {
      left: textAxisCenter.x - (width / 2),
      top: textAxisCenter.y - (height / 2),
      width,
      height,
    };
  });
  /**
   * Where the text block sits. Emitted onto `.text-span` alongside textSpanStyle.
   *
   * These were two elements: an absolutely positioned `.text-anchor` div wrapping a
   * `position:relative; display:inline-block` `.text-span`. That is one DOM node per text-bearing
   * control — 225 on the GAIA panel — and it also placed the text wrong. An inline-block sits on a
   * line box and is aligned by BASELINE, so when the span was shorter than the strut of the div
   * around it, it was pushed down inside its own anchor. Short single-line text rendered ~2px low;
   * text of two lines or more grew past the strut, dominated the line box, and came out right. That
   * is the "Top/Center/Bottom drifts and flips" this used to warn about: not the anchor arithmetic,
   * which was correct, but an inline-block quietly moving underneath it, by an amount that depended
   * on the font and the line-height.
   *
   * One absolutely positioned element has no line box to be aligned within, so it lands where it is
   * put. browser-checks/textPlacement.mjs measures all nine justifications across eleven variants
   * against the rule this code claims to implement — top edge at the top padding, centred in the
   * padded box, bottom edge at the bottom padding. The old structure fails twelve of those; this one
   * passes all of them.
   *
   * Underline/overline/strike still live in their own layers and must never be folded back into this
   * placement — they are decoration around the glyphs, and including them would put the block where
   * the decoration is rather than where the text is.
   */
  let textAnchorStyle = $derived.by(() => {
    if (!hasText || !textPlacement || usesCustomTextFlow) return '';
    const anchorMaxWidth = Math.max(0, Math.max(textMeasureMaxWidth, blockTextLayout.lineBoxWidth || 0));
    return [
      `left:${textUnrotatedOrigin.left}px`,
      `top:${textUnrotatedOrigin.top}px`,
      'width:max-content',
      `max-width:${anchorMaxWidth}px`,
    ].join('; ');
  });
  // Label->Text->Position stays locked to glyph bounds only.
  let textAxisCenter = $derived.by(() => {
    const baseLeft = textPlacement?.left ?? effectiveTextPaddingLeft;
    const baseTop = textPlacement?.top ?? effectiveTextPaddingTop;
    const glyphWidth = textPlacement?.width ?? textLayoutBounds.width;
    const glyphHeight = textPlacement?.height ?? textLayoutBounds.height;

    return {
      x: baseLeft + (glyphWidth / 2) + effectiveTextOffsetX,
      y: baseTop + (glyphHeight / 2) + effectiveTextOffsetY - textScriptBaselineShift,
    };
  });
  let svgTextAnchor = $derived(svgTextAnchorFor(textPosition?.justification ?? 'centred'));
  let customTextOrigin = $derived.by(() => ({
    x: textAxisCenter.x - customTextLayout.bounds.centerX,
    y: textAxisCenter.y - customTextLayout.bounds.centerY,
  }));
  let customTextTranslateTransform = $derived.by(() => `translate(${customTextOrigin.x} ${customTextOrigin.y})`);
  let textSvgRotationTransform = $derived.by(() =>
    (!usesCustomTextFlow && textRotationDegrees) ? `rotate(${textRotationDegrees} ${textAxisCenter.x} ${textAxisCenter.y})` : null
  );
  let textBlockScaleTransform = $derived.by(() => {
    if (usesCustomTextFlow || Math.abs(blockTextFitScale - 1) < 0.001) return null;
    return `translate(${textAxisCenter.x} ${textAxisCenter.y}) scale(${blockTextFitScale}) translate(${-textAxisCenter.x} ${-textAxisCenter.y})`;
  });
  let textSvgBlockTransform = $derived.by(() => {
    if (usesCustomTextFlow) return null;
    const parts = [];
    if (textBlockScaleTransform) parts.push(textBlockScaleTransform);
    if (textSvgRotationTransform) parts.push(textSvgRotationTransform);
    return parts.length > 0 ? parts.join(' ') : null;
  });
  let textSvgMirrorTransform = $derived.by(() =>
    textIsMirrored ? `translate(${textAxisCenter.x * 2} 0) scale(-1 1)` : null
  );
  let textReflectionTransform = $derived.by(() =>
    reflectionMatrixTransform(
      textAxisCenter.x,
      textAxisCenter.y,
      textReflectionAngle,
      textReflectionDistance
    )
  );
  let textReflectionSourceProjectionRange = $derived.by(() => {
    const corners = [];

    if (usesCustomTextFlow) {
      const minX = customTextOrigin.x + customTextLayout.bounds.minX;
      const maxX = customTextOrigin.x + customTextLayout.bounds.maxX;
      const minY = customTextOrigin.y + customTextLayout.bounds.minY;
      const maxY = customTextOrigin.y + customTextLayout.bounds.maxY;
      corners.push(
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      );
    } else {
      const left = textUnrotatedOrigin.left;
      const right = textUnrotatedOrigin.left + textUnrotatedOrigin.width;
      const top = textUnrotatedOrigin.top;
      const bottom = textUnrotatedOrigin.top + textUnrotatedOrigin.height;
      corners.push(
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      );
    }

    const transformedCorners = corners.map((corner) => {
      let point = corner;
      if (!usesCustomTextFlow && textRotationDegrees) {
        point = rotatePointAround(point.x, point.y, textAxisCenter.x, textAxisCenter.y, textRotationDegrees);
      }
      if (textIsMirrored) {
        point = mirrorPointHorizontally(point.x, point.y, textAxisCenter.x);
      }
      return point;
    });

    const projections = transformedCorners.map((point) =>
      projectPointOntoAxis(point.x, point.y, textAxisCenter.x, textAxisCenter.y, textReflectionAngle)
    );
    return {
      min: Math.min(...projections, 0),
      max: Math.max(...projections, 0),
    };
  });
  let textReflectionFadeSpec = $derived.by(() => (
    textReflectionEnabled
      ? buildReflectionFadeSpec(
        textAxisCenter.x,
        textAxisCenter.y,
        textReflectionAngle,
        textReflectionDistance,
        textEffects?.reflectionFadeMode,
        textEffects?.reflectionFadeAmount,
        textReflectionSourceProjectionRange
      )
      : null
  ));
  let textReflectionFadeEnabled = $derived(textReflectionFadeSpec !== null);
  let svgTextLineHeight = $derived.by(() => {
    if (usesCustomTextFlow) return customTextLayout.lineHeight;
    return blockTextLayout.lineHeight;
  });
  let svgTextFontMetrics = $derived.by(() =>
    measureFontMetrics(
      textFont,
      resolvedFontFamily,
      svgTextLines.find((line) => /\S/.test(line)) ?? 'Hg'
    )
  );
  let svgBlockTextDominantBaseline = $derived('alphabetic');
  let svgTextBaselineOffset = $derived.by(() => {
    const ascent = svgTextFontMetrics.ascent;
    const descent = svgTextFontMetrics.descent;
    const inkHeight = Math.max(1, ascent + descent);
    const extraLeading = Math.max(0, svgTextLineHeight - inkHeight);
    return (extraLeading / 2) + ascent;
  });
  let svgTextBaseX = $derived.by(() => {
    const left = textUnrotatedOrigin.left;
    const width = Math.max(0, textGlyphSize.width);

    if (svgTextAnchor === 'start') return left;
    if (svgTextAnchor === 'end') return left + width;
    return left + (width / 2);
  });
  let svgTextBaseY = $derived.by(() =>
    textUnrotatedOrigin.top
    + svgTextBaselineOffset
  );
  let svgTextMaskStyle = $derived.by(() => {
    const weightValue = textFont?.weightValue ?? (textFont?.weight === 'Bold' ? 700 : 400);
    const styles = [
      `font-family:'${resolvedFontFamily}'`,
      `font-size:${(textFont?.size ?? 12) * textScriptScale}px`,
      `font-weight:${weightValue}`,
      `font-style:${textFont?.style === 'Italic' ? 'italic' : 'normal'}`,
      `letter-spacing:${textFont?.letterSpacing ?? 0}px`,
      `word-spacing:${textWordSpacing}px`,
      `font-feature-settings:${textFontFeatureSettings || 'normal'}`,
      `font-variation-settings:${textFontVariationSettings || 'normal'}`,
      `font-variant-caps:${textVariantCaps}`,
      'white-space:pre',
    ];
    return styles.join('; ');
  });
  let svgTextStyle = $derived.by(() => {
    return svgTextMaskStyle;
  });
  let svgTextSoftShadowStyle = $derived.by(() => {
    const styles = [svgTextMaskStyle];
    if (textSoftShadowFilterValue) styles.push(`filter:${textSoftShadowFilterValue}`);
    return styles.join('; ');
  });
  let svgTextReflectionStyle = $derived.by(() => {
    const styles = [svgTextMaskStyle];
    if (textReflectionFilterValue) styles.push(`filter:${textReflectionFilterValue}`);
    return styles.join('; ');
  });
  let svgTextInnerGlowStyle = $derived.by(() => {
    const styles = [svgTextMaskStyle];
    if (textInnerGlowFilterValue) styles.push(`filter:${textInnerGlowFilterValue}`);
    return styles.join('; ');
  });
  let customFlowTextMaskStyle = $derived.by(() => {
    const weightValue = textFont?.weightValue ?? (textFont?.weight === 'Bold' ? 700 : 400);
    return [
      `font-family:'${resolvedFontFamily}'`,
      `font-size:${(textFont?.size ?? 12) * textScriptScale}px`,
      `font-weight:${weightValue}`,
      `font-style:${textFont?.style === 'Italic' ? 'italic' : 'normal'}`,
      `letter-spacing:${textFont?.letterSpacing ?? 0}px`,
      `word-spacing:${textWordSpacing}px`,
      `font-feature-settings:${textFontFeatureSettings || 'normal'}`,
      `font-variation-settings:${textFontVariationSettings || 'normal'}`,
      `font-variant-caps:${textVariantCaps}`,
      'white-space:pre',
    ].join('; ');
  });
  let customFlowTextStyle = $derived.by(() => {
    return customFlowTextMaskStyle;
  });
  let textVisualEffectStyle = $derived.by(() => (
    textFilterValue ? `filter:${textFilterValue}` : ''
  ));
  let customFlowSoftShadowStyle = $derived.by(() => {
    const styles = [customFlowTextMaskStyle];
    if (textSoftShadowFilterValue) styles.push(`filter:${textSoftShadowFilterValue}`);
    return styles.join('; ');
  });
  let customFlowReflectionStyle = $derived.by(() => {
    const styles = [customFlowTextMaskStyle];
    if (textReflectionFilterValue) styles.push(`filter:${textReflectionFilterValue}`);
    return styles.join('; ');
  });
  let customFlowInnerGlowStyle = $derived.by(() => {
    const styles = [customFlowTextMaskStyle];
    if (textInnerGlowFilterValue) styles.push(`filter:${textInnerGlowFilterValue}`);
    return styles.join('; ');
  });
  let customFlowDecorations = $derived.by(() => ({
    underline: buildCustomFlowDecorationFor('underline', customTextLayout, textFont, textFill),
    strikethrough: buildCustomFlowDecorationFor('strikethrough', customTextLayout, textFont, textFill),
    overline: buildCustomFlowDecorationFor('overline', customTextLayout, textFont, textFill),
  }));

  function blockTextLineEntryFor(index) {
    return blockTextLineEntries[index] ?? null;
  }

  function blockLineWordSpacingFor(index) {
    return textWordSpacing + numberOr(blockTextLineEntryFor(index)?.extraWordSpacing, 0);
  }

  function blockLineLetterSpacingFor(index) {
    return numberOr(textFont?.letterSpacing, 0) + numberOr(blockTextLineEntryFor(index)?.extraLetterSpacing, 0);
  }

  function blockLineEffectiveAlign(index) {
    const override = String(blockTextLineEntryFor(index)?.align ?? 'inherit');
    if (override === 'left' || override === 'right' || override === 'centred') {
      return textAlignFor(override);
    }
    return textAlignFor(textPosition?.justification ?? 'centred');
  }

  function blockLineFillWidthApplied(index) {
    return blockTextLineEntryFor(index)?.fillWidthApplied === true;
  }

  /**
   * The declarations a line needs wherever it is drawn: how it sits in its box and how its glyphs
   * are spaced. Split out from the element's own `display` because a line folded into the span
   * must NOT bring that with it — the span is an inline-block, and blockifying it would change how
   * the line box around it is built for a saving of nothing.
   */
  function blockLinePaintStyles(index) {
    const styles = [
      'white-space:pre',
      `text-align:${blockLineFillWidthApplied(index) ? 'left' : blockLineEffectiveAlign(index)}`,
      `letter-spacing:${blockLineLetterSpacingFor(index)}px`,
      `word-spacing:${blockLineWordSpacingFor(index)}px`,
    ];
    if (blockTextLayout.lineBoxWidth > 0) styles.push(`width:${blockTextLayout.lineBoxWidth}px`);
    return styles;
  }

  function blockLineDomStyleFor(index) {
    if (usesCustomTextFlow) return '';
    return ['display:block', ...blockLinePaintStyles(index)].join('; ');
  }

  // A caption is usually one line, and one line needs no box of its own: alignment and spacing say
  // the same thing on the span that carries the face. Two or more do need their own, because each
  // can hold its own alignment and its own justification spacing.
  let foldsSoleLine = $derived(!usesCustomTextFlow && svgTextLines.length === 1);
  let soleLineStyle = $derived(foldsSoleLine ? blockLinePaintStyles(0).join('; ') : '');

  function blockLineDomText(line) {
    return line === '' ? '\u200B' : line;
  }

  function blockSvgLineXFor(index) {
    if (blockLineFillWidthApplied(index)) return textUnrotatedOrigin.left;
    const align = blockLineEffectiveAlign(index);
    if (align === 'left') return textUnrotatedOrigin.left;
    if (align === 'right') return textUnrotatedOrigin.left + Math.max(0, textGlyphSize.width);
    return svgTextBaseX;
  }

  function blockSvgLineAnchorFor(index) {
    if (blockLineFillWidthApplied(index)) return 'start';
    const align = blockLineEffectiveAlign(index);
    if (align === 'left') return 'start';
    if (align === 'right') return 'end';
    return 'middle';
  }

  function blockSvgLineStyleFor(index, baseStyle) {
    return [
      baseStyle,
      `letter-spacing:${blockLineLetterSpacingFor(index)}px`,
      `word-spacing:${blockLineWordSpacingFor(index)}px`,
    ].join('; ');
  }

  let textSpanStyle = $derived.by(() => {
    if (!hasText || usesCustomTextFlow) return '';
    const weightValue = textFont?.weightValue ?? (textFont?.weight === 'Bold' ? 700 : 400);
    const styles = [
      `font-family:'${resolvedFontFamily}'`,
      `font-size:${(textFont?.size ?? 12) * textScriptScale}px`,
      `font-weight:${weightValue}`,
      `font-style:${textFont?.style === 'Italic' ? 'italic' : 'normal'}`,
      `line-height:${blockTextLayout.lineHeight}px`,
      'width:max-content',
      `color:${cssColor(textFill?.colour ?? 'FFFFFFFF')}`,
      `font-feature-settings:${textFontFeatureSettings || 'normal'}`,
      `font-variation-settings:${textFontVariationSettings || 'normal'}`,
      `font-variant-caps:${textVariantCaps}`,
    ];
    if (blockTextLayout.lineBoxWidth > 0) {
      styles.push(`width:${blockTextLayout.lineBoxWidth}px`);
    }
    const transforms = [];
    if (textRotationDegrees) {
      transforms.push(`rotate(${textRotationDegrees}deg)`);
    }
    if (Math.abs(blockTextFitScale - 1) >= 0.001) {
      transforms.push(`scale(${blockTextFitScale})`);
    }
    if (transforms.length > 0) {
      styles.push(`transform:${transforms.join(' ')}`);
      styles.push('transform-origin:center center');
    }
    return styles.join('; ');
  });
  let textGlyphStyle = $derived.by(() => {
    if (usesCustomTextFlow) return '';
    const styles = [];
    if (textIsMirrored) {
      styles.push('transform:scaleX(-1)');
      styles.push('transform-origin:center center');
    }
    if (normalizeTextCaseMode(textCaseMode) === 'smallcaps') {
      styles.push('font-variant-caps:small-caps');
    }
    if (textShadowValue) styles.push(`text-shadow:${textShadowValue}`);
    return styles.join('; ');
  });
  /**
   * The glyph box's declarations and, when there is only one line, that line's as well.
   *
   * Joined with `'; '` and with the empty fragments dropped, which is the whole point of it being
   * a derived rather than three interpolations in the markup. Writing `"{a} {b}"` in the attribute
   * concatenates two lists that do not end in a semicolon, so the last declaration of one fuses
   * with the first of the next — `width:104px  white-space:pre` — and the CSS parser discards the
   * pair. Both of those are invisible in the server-rendered string a golden baseline reads; only
   * the browser's parse shows the loss.
   */
  let textGlyphAndLineStyle = $derived([textGlyphStyle, soleLineStyle].filter(Boolean).join('; '));
  let hasLineDecorations = $derived(
    textFont?.underline === true || textFont?.strikethrough === true || textFont?.overline === true
  );
  let showCustomFlowLineDecorations = $derived(hasLineDecorations && usesCustomTextFlow);
  let showBlockLineDecorations = $derived(hasLineDecorations && !usesCustomTextFlow);
  let showBlockTextVisual = $derived((!usesCustomTextFlow) && (showBlockLineDecorations || hasTextEffects || needsVisualTextFill));
  let nativePreviewStyle = $derived.by(() => {
    if (!hasText || usesCustomTextFlow) return '';
    return `transform:translate(${effectiveTextOffsetX}px, ${effectiveTextOffsetY}px)`;
  });
  $effect(() => {
    renderedTextContent;
    displayedBlockTextContent;
    usesCustomTextFlow;
    showBlockLineDecorations;
    textFont?.family;
    textFont?.size;
    textFont?.weightValue;
    textFont?.style;
    textFont?.wordSpacing;
    textFont?.letterSpacing;
    textPosition?.justification;
    textFlowAngle;
    textWrapMode;
    textParagraphMode;
    textParagraphMeasureWidth;
    textOverflowMode;
    textMaxLines;
    textFitMode;
    textLineHeightMultiplier;
    effectiveTextOffsetX;
    effectiveTextOffsetY;
    textMeasureMaxWidth;
    displayW;
    displayH;

    if (usesCustomTextFlow) {
      domTextGlyphSize = { width: 0, height: 0 };
      domGlyphCharacterRects = [];
      return;
    }

    if (!textGlyphElement || !controlContentElement) return;

    // Reads only. Every control's measure runs before any control's commit — see
    // utils/batchedElementMetrics.js for why that matters at 413 controls.
    const measure = () => {
      const size = {
        width: textGlyphElement.offsetWidth ?? 0,
        height: textGlyphElement.offsetHeight ?? 0,
      };

      if (!showBlockLineDecorations) return { size, rects: null };

      const range = document.createRange();
      const nextRects = [];
      const contentRect = controlContentElement.getBoundingClientRect();
      const walker = document.createTreeWalker(textGlyphElement, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode();

      while (textNode) {
        const content = textNode.textContent ?? '';
        for (let i = 0; i < content.length; i += 1) {
          const char = content[i];
          if (char === '\n' || char === '\u200B' || /\s/.test(char)) continue;

          range.setStart(textNode, i);
          range.setEnd(textNode, i + 1);

          for (const rect of Array.from(range.getClientRects())) {
            if (rect.width <= 0 || rect.height <= 0) continue;
            nextRects.push({
              char,
              left: rect.left - contentRect.left,
              right: rect.right - contentRect.left,
              top: rect.top - contentRect.top,
              bottom: rect.bottom - contentRect.top,
            });
          }
        }

        textNode = walker.nextNode();
      }

      return { size, rects: nextRects };
    };

    // Writes only.
    const commit = ({ size, rects }) => {
      domTextGlyphSize = size;
      if (rects === null) {
        if (domGlyphCharacterRects.length > 0) domGlyphCharacterRects = [];
        return;
      }
      domGlyphCharacterRects = rects;
    };

    // No separate requestAnimationFrame: observing an element delivers an initial callback, which
    // is the first measurement. The old code did both, so every control measured twice on mount.
    return observeElementMetrics({
      targets: showBlockLineDecorations ? [textGlyphElement, controlContentElement] : [textGlyphElement],
      measure,
      commit,
    });
  });
  $effect(() => {
    hasText;
    showBlockLineDecorations;
    displayW;
    displayH;
    textGlyphSize;
    glyphCharacterRects;
    textAxisCenter.x;
    textAxisCenter.y;
    textRotationDegrees;
    textFont?.family;
    textFont?.weightValue;
    textFont?.weight;
    textFont?.style;
    textFont?.size;
    textFont?.wordSpacing;
    textFont?.underline;
    textFont?.underlineOffset;
    textFont?.underlineThickness;
    textFont?.underlineColour;
    textFont?.underlineInsetLeft;
    textFont?.underlineInsetRight;
    textFont?.underlineGap;
    textFont?.underlineLayer;
    textFont?.strikethrough;
    textFont?.strikethroughOffset;
    textFont?.strikethroughThickness;
    textFont?.strikethroughColour;
    textFont?.strikethroughInsetLeft;
    textFont?.strikethroughInsetRight;
    textFont?.strikethroughGap;
    textFont?.strikethroughLayer;
    textFont?.overline;
    textFont?.overlineOffset;
    textFont?.overlineThickness;
    textFont?.overlineColour;
    textFont?.overlineInsetLeft;
    textFont?.overlineInsetRight;
    textFont?.overlineGap;
    textFont?.overlineLayer;
    textFill?.colour;
    displayedBlockTextContent;
    textLineHeightMultiplier;
    textWrapMode;
    textParagraphMode;
    textParagraphMeasureWidth;
    textOverflowMode;
    textMaxLines;
    textFitMode;
    lineCanvasBackElement;
    lineCanvasFrontElement;

    if (!showBlockLineDecorations) return;

    const frame = requestAnimationFrame(() => {
      renderLineLayerCanvas(lineCanvasBackElement, 'back');
      renderLineLayerCanvas(lineCanvasFrontElement, 'front');
    });

    return () => cancelAnimationFrame(frame);
  });
  let resolvedStoredIcon = $derived.by(() => {
    const assetId = icon?.assetId ?? '';
    if (assetId) {
      const byId = $storedIcons.find((entry) => entry.id === assetId && entry.enabled);
      if (byId) return byId;
    }

    const iconName = icon?.name ?? '';
    if (!iconName) return null;

    return $storedIcons.find((entry) => entry.name === iconName && entry.enabled) ?? null;
  });
  let radioGroupPreviewStateName = $derived(String(valueSection?.__segmentPreviewState ?? '').trim());
  let radioGroupPreviewSegmentIds = $derived(
    radioGroupPreviewStateName
      ? normalizeSegmentTargetIds(
        sourceValueSection,
        $segmentEditScope?.mode === 'segments'
          ? $segmentEditScope.segmentIds ?? []
          : []
      )
      : []
  );
  let radioGroupEditTargetSegmentIds = $derived(
    $segmentEditScope?.mode === 'segments'
      ? normalizeSegmentTargetIds(sourceValueSection, $segmentEditScope.segmentIds ?? [])
      : []
  );
  let radioGroupActiveStateNames = $derived.by(() => {
    if (!isRadioGroupControl) return [];
    if (Array.isArray(interactionRuntime?.activeStates) && interactionRuntime.activeStates.length > 0) {
      return interactionRuntime.activeStates;
    }
    return radioGroupPreviewStateName ? [radioGroupPreviewStateName] : [];
  });
  let radioGroupSelectionMode = $derived(String(sourceBehavior?.selectionMode ?? 'single').trim().toLowerCase() === 'multi' ? 'multi' : 'single');
  let radioGroupVisualStyle = $derived(String(sourceBehavior?.visualStyle ?? sourceBehavior?.subtype ?? 'radio'));
  let radioGroupLayout = $derived.by(() => resolveRadioGroupLayout({
    behavior: sourceBehavior,
    valueRows,
    width: displayW,
    height: displayH,
    paddingLeft: layoutPaddingLeft,
    paddingRight: layoutPaddingRight,
    paddingTop: layoutPaddingTop,
    paddingBottom: layoutPaddingBottom,
    gap: layoutGap,
  }));
  let radioGroupSelectedKeys = $derived.by(() => {
    if (!isRadioGroupControl) return new Set();

    const forcedSelectedRowIds = radioGroupPreviewStateName
      && (
        normalizeKey(radioGroupPreviewStateName) === 'selected'
        || normalizeKey(radioGroupPreviewStateName) === 'checked'
        || sourceStatesSection?._children?.[radioGroupPreviewStateName]?.when?.checked === true
      )
      && radioGroupPreviewSegmentIds.length > 0
      ? radioGroupPreviewSegmentIds
      : [];

    if (forcedSelectedRowIds.length > 0) {
      return resolveRadioSelectedKeys(valueRows, sourceBehavior, { forceSelectedRowIds: forcedSelectedRowIds });
    }

    const selected = new Set();
    const runtimeValue = interactionRuntime?.signals?.valueRaw;
    if (Array.isArray(runtimeValue)) {
      for (const entry of runtimeValue) {
        selected.add(String(entry));
      }
    } else if (runtimeValue !== undefined && runtimeValue !== null && runtimeValue !== '') {
      selected.add(String(runtimeValue));
    }

    if (selected.size > 0) {
      if (radioGroupSelectionMode !== 'multi' && selected.size > 1) {
        return new Set([selected.values().next().value]);
      }
      return selected;
    }

    return resolveRadioSelectedKeys(valueRows, sourceBehavior);
  });
  let radioGroupItems = $derived.by(() => {
    if (!isRadioGroupControl) return [];

    return radioGroupLayout.items.map((entry, index) => {
      const row = entry.row;
      const rowId = String(row?.id ?? `row_${index + 1}`);
      const internalKey = String(row?.internalValue ?? row?.id ?? `item_${index + 1}`);
      const selected = radioGroupSelectedKeys.has(internalKey) || radioGroupSelectedKeys.has(rowId);
      const editTarget = radioGroupEditTargetSegmentIds.includes(rowId);
      const resolvedStyle = resolveRadioSegmentStyle({
        row,
        behavior: sourceBehavior,
        background: sourceBackground,
        text: sourceText,
        valueSection: sourceValueSection,
        statesSection: sourceStatesSection,
        selected,
        activeStateNames: radioGroupActiveStateNames,
      });
      const outerShape = String(resolvedStyle?.indicatorOuter?.shape ?? '').trim().toLowerCase();
      const innerShape = String(resolvedStyle?.indicatorInner?.shape ?? '').trim().toLowerCase();
      const outerVisible = resolvedStyle?.indicatorOuter?.visible !== false;
      const innerVisible = resolvedStyle?.indicatorInner?.visible !== false
        && (resolvedStyle?.indicatorInner?.selectedOnly !== true || selected);

      return {
        id: rowId,
        label: String(row?.displayText ?? row?.internalValue ?? row?.id ?? `Option ${index + 1}`),
        selected,
        editTarget,
        shellBackground: buildRadioWholeBackground(resolvedStyle?.whole),
        shellWidth: Math.max(0, numberOr(entry?.width, 0)),
        shellHeight: Math.max(0, numberOr(entry?.height, 0)),
        contentStyle: [
          `padding:${Math.max(0, numberOr(resolvedStyle?.whole?.paddingY, 0))}px ${Math.max(0, numberOr(resolvedStyle?.whole?.paddingX, 0))}px`,
          `gap:${Math.max(0, numberOr(resolvedStyle?.whole?.indicatorGap, 0))}px`,
        ].join('; '),
        indicatorOuterVisible: outerVisible,
        indicatorOuterStyle: [
          `width:${Math.max(0, numberOr(resolvedStyle?.indicatorOuter?.width, 0))}px`,
          `height:${Math.max(0, numberOr(resolvedStyle?.indicatorOuter?.height, 0))}px`,
          `border-width:${Math.max(0, numberOr(resolvedStyle?.indicatorOuter?.borderWidth, 0))}px`,
          `border-radius:${resolveRadioShapeRadius(outerShape, resolvedStyle?.indicatorOuter?.radius)}`,
          `background:${cssColor(resolvedStyle?.indicatorOuter?.fillColour)}`,
          `border-color:${cssColor(resolvedStyle?.indicatorOuter?.borderColour)}`,
        ].join('; '),
        indicatorInnerVisible: innerVisible,
        indicatorInnerStandalone: !outerVisible && innerVisible,
        indicatorInnerStyle: [
          `width:${Math.max(0, numberOr(resolvedStyle?.indicatorInner?.width, 0))}px`,
          `height:${Math.max(0, numberOr(resolvedStyle?.indicatorInner?.height, 0))}px`,
          `border-width:${Math.max(0, numberOr(resolvedStyle?.indicatorInner?.borderWidth, 0))}px`,
          `border-radius:${resolveRadioShapeRadius(innerShape, resolvedStyle?.indicatorInner?.radius)}`,
          `background:${cssColor(resolvedStyle?.indicatorInner?.fillColour)}`,
          `border-color:${cssColor(resolvedStyle?.indicatorInner?.borderColour)}`,
          innerVisible ? 'opacity:1; transform:scale(1)' : 'opacity:0; transform:scale(0.7)',
        ].join('; '),
        labelStyle: [
          `color:${cssColor(resolvedStyle?.label?.colour)}`,
          `font-size:${Math.max(1, numberOr(resolvedStyle?.label?.fontSize, 11))}px`,
          `font-weight:${resolvedStyle?.label?.fontWeight ?? 600}`,
          `letter-spacing:${numberOr(resolvedStyle?.label?.letterSpacing, 0)}px`,
          resolvedStyle?.label?.fontFamily ? `font-family:${JSON.stringify(resolvedStyle.label.fontFamily)}` : '',
          resolvedStyle?.label?.fontStyle ? `font-style:${String(resolvedStyle.label.fontStyle).trim().toLowerCase()}` : '',
          resolvedStyle?.label?.textTransform ? `text-transform:${resolvedStyle.label.textTransform}` : '',
        ].filter(Boolean).join('; '),
      };
    });
  });
  let radioGroupStyle = $derived.by(() => {
    if (!isRadioGroupControl) return '';
    return [
      `padding:${layoutPaddingTop}px ${layoutPaddingRight}px ${layoutPaddingBottom}px ${layoutPaddingLeft}px`,
      `gap:${layoutGap}px`,
      `--radio-columns:${Math.max(1, radioGroupLayout.columns)}`,
      `--radio-rows:${Math.max(1, radioGroupLayout.rowCount)}`,
    ].join('; ');
  });
  let hasIcon = $derived(!isRadioGroupControl && !!resolvedStoredIcon?.dataUrl && icon?.source !== 'none' && contentLayoutMode !== 'text_only');
  let iconEffects = $derived(icon?._children?.Effects ?? null);
  let iconSizeValue = $derived(Math.max(4, Number(icon?.size ?? 16)));
  let iconContainerStyle = $derived.by(() => {
    if (!hasIcon) return '';

    const horizontalAlign = String(contentLayout?.horizontalAlign ?? 'center');
    const verticalAlign = String(contentLayout?.verticalAlign ?? 'center');
    const contentLeft = layoutPaddingLeft;
    const contentRight = Math.max(contentLeft, displayW - layoutPaddingRight);
    const contentTop = layoutPaddingTop;
    const contentBottom = Math.max(contentTop, displayH - layoutPaddingBottom);

    const alignAxis = (min, max, size, align, startValue, endValue) => {
      if (align === startValue) return min + (size / 2);
      if (align === endValue) return max - (size / 2);
      return (min + max) / 2;
    };

    let centerX = alignAxis(contentLeft, contentRight, iconSizeValue, horizontalAlign, 'left', 'right');
    let centerY = alignAxis(contentTop, contentBottom, iconSizeValue, verticalAlign, 'top', 'bottom');

    if (contentLayoutMode === 'icon_left_text_right') {
      centerX = contentLeft + (iconSizeValue / 2);
    } else if (contentLayoutMode === 'text_left_icon_right') {
      centerX = contentRight - (iconSizeValue / 2);
    } else if (contentLayoutMode === 'icon_above_text_below') {
      centerY = contentTop + (iconSizeValue / 2);
    } else if (contentLayoutMode === 'text_above_icon_below') {
      centerY = contentBottom - (iconSizeValue / 2);
    }

    centerX += numberOr(contentLayout?.iconOffsetX, 0);
    centerY += numberOr(contentLayout?.iconOffsetY, 0);

    return [
      `left:${centerX - (iconSizeValue / 2)}px`,
      `top:${centerY - (iconSizeValue / 2)}px`,
      `width:${iconSizeValue}px`,
      `height:${iconSizeValue}px`,
      `z-index:${numberOr(contentLayout?.iconZIndex, 1)}`,
    ].join('; ');
  });
  let iconStyle = $derived.by(() => {
    const fit = icon?.fit === 'cover' ? 'cover' : 'contain';
    const transforms = [];
    if (icon?.flipH === true) transforms.push('scaleX(-1)');
    if (icon?.flipV === true) transforms.push('scaleY(-1)');
    if (Math.abs(numberOr(icon?.rotation, 0)) > 0.001) transforms.push(`rotate(${numberOr(icon?.rotation, 0)}deg)`);
    const filters = [];
    if (iconEffects?.shadowEnabled === true) {
      filters.push(`drop-shadow(${numberOr(iconEffects?.shadowOffsetX, 0)}px ${numberOr(iconEffects?.shadowOffsetY, 2)}px ${Math.max(0, numberOr(iconEffects?.shadowBlur, 4))}px ${cssColor(iconEffects?.shadowColour ?? '66000000')})`);
    }
    if (iconEffects?.glowEnabled === true) {
      filters.push(`drop-shadow(0 0 ${Math.max(0, numberOr(iconEffects?.glowSize, 4))}px ${cssColor(iconEffects?.glowColour ?? '66FFFFFF')})`);
    }
    if (iconEffects?.blurEnabled === true && numberOr(iconEffects?.blurAmount, 0) > 0) {
      filters.push(`blur(${numberOr(iconEffects?.blurAmount, 0)}px)`);
    }
    return [
      'width:100%',
      'height:100%',
      `object-fit:${fit}`,
      `opacity:${Math.max(0, Math.min(1, numberOr(icon?.opacity, 1)))}`,
      transforms.length ? `transform:${transforms.join(' ')}` : '',
      filters.length ? `filter:${filters.join(' ')}` : '',
    ].join('; ');
  });

  // The layer stack names the style it wants; each layout mode owns the actual variable, so the
  // shared stack does not need to know which spelling applies.
  function customFlowTextStyleFor(key) {
    return key === 'reflection' ? customFlowReflectionStyle
      : key === 'softShadow' ? customFlowSoftShadowStyle
      : key === 'text' ? customFlowTextStyle
      : key === 'innerGlow' ? customFlowInnerGlowStyle
      : customFlowTextMaskStyle;
  }
  function blockTextStyleFor(key) {
    return key === 'reflection' ? svgTextReflectionStyle
      : key === 'softShadow' ? svgTextSoftShadowStyle
      : key === 'text' ? svgTextStyle
      : key === 'innerGlow' ? svgTextInnerGlowStyle
      : svgTextMaskStyle;
  }

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={rootElement}
  class="canvas-control"
  data-control-id={core?.id}
  class:selected={editorInteractionEnabled && isSelected && !panelLocked}
  class:key-object={editorInteractionEnabled && isKeyObject && !panelLocked}
  class:hidden-component={!isVisible}
  class:locked={editorInteractionEnabled && isEditorLocked}
  class:lock-click-through={editorInteractionEnabled && isLocked}
  class:editor-draggable={editorInteractionEnabled && !isEditorLocked && !inlineTextEditing}
  class:dragging={isDragging && dragEngaged}
  class:custom-component-hint={editorInteractionEnabled && isCustomComponent && !panelLocked}
  class:preview-surface={!editorInteractionEnabled}
  class:drop-target={isDropTargetHighlighted}
  class:preview-interactive={previewInteractive}
  class:preview-disabled={previewInteractive && previewAriaDisabled === true}
  class:preview-keyboard-focus={previewInteractive && previewKeyboardFocus}
  class:preview-highlighted={previewInteractive && previewHighlighted}
  class:device-drop-compatible={deviceDropStatus === 'compatible'}
  class:device-drop-warning={deviceDropStatus === 'warning'}
  class:device-drop-incompatible={deviceDropStatus === 'incompatible'}
  class:mouse-transparent={mouseBlocksPointer}
  class:mouse-focus-outline={mouseFocusOutline}
  style="left:{displayX}px; top:{displayY}px; width:{displayW}px; height:{displayH}px; opacity:{renderOpacity}; --inv-scale:{1 / (scale || 1)}; {layerTint ? `--layer-tint:${layerTint};` : ''} {canvasTransformCSS} {rootTransitionCSS} {shadowCSS} {blendCSS} {mouseCursorCSS} {mouseClipCSS} {mouseRaiseCSS}"
  onmousedown={editorInteractionEnabled ? handleMouseDown : undefined}
  ondblclick={editorInteractionEnabled ? handleDoubleClick : undefined}
  ondragover={editorInteractionEnabled ? handleDeviceParameterDragOver : undefined}
  ondrop={editorInteractionEnabled ? handleDeviceParameterDrop : undefined}
  onpointerenter={previewInteractive ? onpreviewpointerenter : undefined}
  onpointerleave={previewInteractive ? onpreviewpointerleave : undefined}
  onpointermove={previewInteractive ? onpreviewpointermove : undefined}
  onpointerdown={previewInteractive ? handleMouseSectionPointerDown : undefined}
  onwheel={previewInteractive ? onpreviewwheel : undefined}
  onfocus={previewInteractive ? onpreviewfocus : undefined}
  onblur={previewInteractive ? onpreviewblur : undefined}
  onkeydown={previewInteractive ? onpreviewkeydown : undefined}
  onkeyup={previewInteractive ? onpreviewkeyup : undefined}
  role={previewInteractive && previewRole ? previewRole : undefined}
  data-preview-role={previewInteractive ? (previewRole || '') : undefined}
  tabindex={previewInteractive ? effectiveTabIndex : undefined}
  aria-label={previewInteractive ? previewAriaLabel : undefined}
  aria-disabled={previewInteractive ? previewAriaDisabled : undefined}
  aria-checked={previewInteractive ? previewAriaChecked : undefined}
  aria-expanded={previewInteractive ? previewAriaExpanded : undefined}
  aria-valuenow={previewInteractive ? previewAriaValueNow : undefined}
  aria-valuemin={previewInteractive ? previewAriaValueMin : undefined}
  aria-valuemax={previewInteractive ? previewAriaValueMax : undefined}
  aria-valuetext={previewInteractive ? previewAriaValueText : undefined}
>
  <div bind:this={controlContentElement} class="control-content" style="{filterCSS} {absorbedFillCSS ?? ''}">
    {#if background}
      <BackgroundRenderer {background} width={displayW} height={displayH} absorbFill={!!absorbedFillCSS} />
    {/if}

    {#if isLcdDisplay}
      <LcdDisplayRenderer control={renderControl} allControls={allControls} width={displayW} height={displayH} />
    {/if}

    {#if isMeter}
      <MeterRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isEnvelope}
      <EnvelopeRenderer control={renderControl} width={displayW} height={displayH} activeIndex={previewSession?.envActiveIndex ?? -1} />
    {/if}

    {#if isMatrix}
      <MatrixRenderer control={renderControl} width={displayW} height={displayH} activeCell={previewSession?.matrixActiveCell ?? null} />
    {/if}

    {#if isJoystick}
      <JoystickRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isNumpad}
      <NumpadRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}
    {#if isCrossfader}
      <CrossfaderRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isRibbon}
      <RibbonRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isMacro}
      <MacroRenderer control={renderControl} width={displayW} height={displayH} dragging={previewSession?.dragging === true} />
    {/if}

    {#if isOrbit}
      <OrbitRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isLooper}
      <LooperRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isRouter}
      <RouterRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isTimbre}
      <TimbreRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isTuring}
      <TuringRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isKinetic}
      <KineticRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isConstellation}
      <ConstellationRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isConstraint}
      <ConstraintRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isChordPad}
      <ChordPadRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isArp}
      <ArpRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isNoteRibbon}
      <NoteRibbonRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isDrumPads}
      <DrumPadsRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isPanic}
      <PanicRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isSplitZone}
      <SplitZoneRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isPhrase}
      <PhraseRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}
    {#if isRecorder}
      <RecorderRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}
    {#if isHarmoniser}
      <HarmoniserRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}
    {#if isSetlist}
      <SetlistRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    {#if isTransport}
      <TransportRenderer control={renderControl} width={displayW} height={displayH} />
    {/if}

    <!-- ce.draw: whatever a script has drawn on THIS control, painted over its normal content.
         Any control can be drawn on — that is what lets a script put a scope trace over a
         Background or a readout over a Knob without a dedicated canvas component existing. -->
    <ScriptDrawOverlay controlId={core?.id ?? ''} width={displayW} height={displayH} />

    {#if isPixelDisplay}
      <PixelDisplayRenderer
        control={renderControl}
        allControls={allControls}
        width={displayW}
        height={displayH}
        editable={editorInteractionEnabled && isSelected && !isEditorLocked}
        {scale}
      />
    {/if}

    {#if isListboxControl}
      <ListboxRenderer
        control={listboxRenderControl}
        width={displayW}
        height={displayH}
        selectedValue={interactionRuntime?.signals?.valueRaw}
        selectedValues={listboxMultiSet}
        pendingValue={previewSession?.listboxPending ?? ''}
        nowPlayingValue={listboxNowPlaying}
        focused={previewSession?.focused === true && previewInteractive}
        scrollTop={previewSession?.listboxScrollTop ?? 0}
        hoveredIndex={previewSession?.listboxHoverIndex ?? -1}
        filterText={previewListboxFilter?.value ?? ''}
      />
      {#if previewListboxFilter?.visible && previewInteractive}
        <input
          class="canvas-listbox-filter"
          type="text"
          placeholder="Search…"
          value={previewListboxFilter?.value ?? ''}
          style={`height:${previewListboxFilter?.height ?? 24}px;`}
          oninput={onpreviewlistboxfilter}
          onpointerdown={(event) => event.stopPropagation()}
        />
      {/if}
    {/if}

    {#if isTextInput}
      <input
        class="canvas-text-input"
        type="text"
        style={tiStyle}
        value={tiValue}
        placeholder={tiPlaceholder}
        disabled={previewTextField?.disabled === true}
        readonly={!previewInteractive}
        tabindex={previewInteractive ? 0 : -1}
        oninput={previewInteractive ? onpreviewtextinput : undefined}
        onkeydown={previewInteractive ? onpreviewtextkeydown : undefined}
        onfocus={previewInteractive ? onpreviewtextfocus : undefined}
        onblur={previewInteractive ? onpreviewtextblur : undefined}
        onpointerdown={previewInteractive ? (event) => event.stopPropagation() : undefined}
      />
    {/if}

    {#if isSliderControl}
      <SliderFamilyRenderer
        control={renderControl}
        runtime={interactionRuntime}
        width={displayW}
        height={displayH}
        partTransitions={interactionRuntime?.transitions?.partTransitions ?? null}
        debug={interactionDebugEnabled}
      />
    {/if}

    {#if renderedPartEntries.length}
      {#each renderedPartEntries as [partName, part] (partName)}
        <InteractivePartRenderer
          {part}
          parentWidth={displayW}
          parentHeight={displayH}
          transitionBucket={interactionRuntime?.transitions?.partTransitions?.get?.(partName) ?? null}
          debug={interactionDebugEnabled}
          editableInput={editableInputForPart(part)}
          oneditableinput={editableHandlerForPart(part, 'input')}
          oneditablekeydown={editableHandlerForPart(part, 'keydown')}
          oneditablefocus={editableHandlerForPart(part, 'focus')}
          oneditableblur={editableHandlerForPart(part, 'blur')}
        />
      {/each}
    {/if}

    {#if interactionDebugEnabled && interactionDebugSummary}
      <div class="interaction-debug-badge">{interactionDebugSummary}</div>
    {/if}

    {#if showCustomHitZones && customHitZoneEntries.length}
      <div class="custom-hit-zone-overlay">
        {#each customHitZoneEntries as [zoneName, zone] (zoneName)}
          <div
            class="custom-hit-zone"
            class:ring-zone={zone.shape === 'ring' || zone.shape === 'circle'}
            style={customHitZoneStyle(zone)}
            title={`${zoneName}: ${zone.action ?? 'action'} -> ${zone.targetBehavior ?? ''}`}
          ></div>
        {/each}
      </div>
    {/if}

    {#if isRadioGroupControl && radioGroupItems.length}
      <div class="radio-group-content" style={radioGroupStyle}>
        {#each radioGroupItems as item (item.id)}
          <div
            class="radio-group-item"
            class:selected={item.selected}
            class:edit-target={item.editTarget}
            class:segmented={radioGroupVisualStyle === 'segmented'}
            class:tab={radioGroupVisualStyle === 'tab'}
          >
            <div class="radio-group-item-shell">
              <BackgroundRenderer background={item.shellBackground} width={item.shellWidth} height={item.shellHeight} />
            </div>
            <div class="radio-group-item-content" style={item.contentStyle}>
              {#if item.indicatorOuterVisible}
                <span class="radio-indicator-outer" style={item.indicatorOuterStyle}>
                  {#if item.indicatorInnerVisible}
                    <span class="radio-indicator-inner" style={item.indicatorInnerStyle}></span>
                  {/if}
                </span>
              {:else if item.indicatorInnerStandalone}
                <span class="radio-indicator-inner standalone" style={item.indicatorInnerStyle}></span>
              {/if}
              <span class="radio-group-label" style={item.labelStyle}>{item.label}</span>
            </div>
            {#if item.editTarget}
              <div class="radio-edit-target-badge">Editing</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if isComboboxControl}
      <div class="combobox-arrow" aria-hidden="true"></div>
    {/if}

    {#if hasIcon}
      <div class="icon-content" style={iconContainerStyle}>
        <img class="icon-image" style={iconStyle} src={resolvedStoredIcon.dataUrl} alt="" />
      </div>
    {/if}

    {#if hasText && showBlockLineDecorations}
      {@render blockLineDecorations('back')}
    {/if}

    <!-- Under/strike/overline for block-laid-out text. Rendered twice — once behind the glyphs,
         once in front — so each rule lands on the side its `layer` asks for. -->
    {#snippet blockLineDecorations(layer)}
        <svg class="text-decoration-svg" viewBox={`0 0 ${displayW} ${displayH}`} width={displayW} height={displayH} aria-hidden="true">
          <defs>
            {#if textFont?.underline === true && lineLayerFor('underline', textFont) === layer}
              <mask id={lineMaskId('underline', layer)} maskUnits="userSpaceOnUse" x="0" y="0" width={displayW} height={displayH}>
                <rect x="0" y="0" width={displayW} height={displayH} fill="#fff"></rect>
                <g transform={textSvgBlockTransform}>
                  <g transform={textSvgMirrorTransform}>
                    {#each svgTextLines as line, index}
                      <text
                        x={blockSvgLineXFor(index)}
                        y={svgTextBaseY + (index * svgTextLineHeight)}
                        text-anchor={blockSvgLineAnchorFor(index)}
                        dominant-baseline={svgBlockTextDominantBaseline}
                        fill="#000"
                        stroke="#000"
                        stroke-width={Math.max(0, numberOr(textFont?.underlineGap, 0) * 2)}
                        paint-order="stroke fill"
                        style={blockSvgLineStyleFor(index, svgTextMaskStyle)}
                      >{line}</text>
                    {/each}
                  </g>
                </g>
              </mask>
            {/if}
            {#if textFont?.strikethrough === true && lineLayerFor('strikethrough', textFont) === layer}
              <mask id={lineMaskId('strikethrough', layer)} maskUnits="userSpaceOnUse" x="0" y="0" width={displayW} height={displayH}>
                <rect x="0" y="0" width={displayW} height={displayH} fill="#fff"></rect>
                <g transform={textSvgBlockTransform}>
                  <g transform={textSvgMirrorTransform}>
                    {#each svgTextLines as line, index}
                      <text
                        x={blockSvgLineXFor(index)}
                        y={svgTextBaseY + (index * svgTextLineHeight)}
                        text-anchor={blockSvgLineAnchorFor(index)}
                        dominant-baseline={svgBlockTextDominantBaseline}
                        fill="#000"
                        stroke="#000"
                        stroke-width={Math.max(0, numberOr(textFont?.strikethroughGap, 0) * 2)}
                        paint-order="stroke fill"
                        style={blockSvgLineStyleFor(index, svgTextMaskStyle)}
                      >{line}</text>
                    {/each}
                  </g>
                </g>
              </mask>
            {/if}
            {#if textFont?.overline === true && lineLayerFor('overline', textFont) === layer}
              <mask id={lineMaskId('overline', layer)} maskUnits="userSpaceOnUse" x="0" y="0" width={displayW} height={displayH}>
                <rect x="0" y="0" width={displayW} height={displayH} fill="#fff"></rect>
                <g transform={textSvgBlockTransform}>
                  <g transform={textSvgMirrorTransform}>
                    {#each svgTextLines as line, index}
                      <text
                        x={blockSvgLineXFor(index)}
                        y={svgTextBaseY + (index * svgTextLineHeight)}
                        text-anchor={blockSvgLineAnchorFor(index)}
                        dominant-baseline={svgBlockTextDominantBaseline}
                        fill="#000"
                        stroke="#000"
                        stroke-width={Math.max(0, numberOr(textFont?.overlineGap, 0) * 2)}
                        paint-order="stroke fill"
                        style={blockSvgLineStyleFor(index, svgTextMaskStyle)}
                      >{line}</text>
                    {/each}
                  </g>
                </g>
              </mask>
            {/if}
          </defs>

          <g transform={textSvgBlockTransform}>
            <g transform={textSvgMirrorTransform}>
              {#if textFont?.underline === true && lineLayerFor('underline', textFont) === layer}
                <rect
                  x={lineGeometryFor('underline', textFont, textFill).left}
                  y={lineGeometryFor('underline', textFont, textFill).top}
                  width={Math.max(0, lineGeometryFor('underline', textFont, textFill).right - lineGeometryFor('underline', textFont, textFill).left)}
                  height={lineGeometryFor('underline', textFont, textFill).thickness}
                  fill={lineGeometryFor('underline', textFont, textFill).colour}
                  mask={`url(#${lineMaskId('underline', layer)})`}
                ></rect>
              {/if}
              {#if textFont?.strikethrough === true && lineLayerFor('strikethrough', textFont) === layer}
                <rect
                  x={lineGeometryFor('strikethrough', textFont, textFill).left}
                  y={lineGeometryFor('strikethrough', textFont, textFill).top}
                  width={Math.max(0, lineGeometryFor('strikethrough', textFont, textFill).right - lineGeometryFor('strikethrough', textFont, textFill).left)}
                  height={lineGeometryFor('strikethrough', textFont, textFill).thickness}
                  fill={lineGeometryFor('strikethrough', textFont, textFill).colour}
                  mask={`url(#${lineMaskId('strikethrough', layer)})`}
                ></rect>
              {/if}
              {#if textFont?.overline === true && lineLayerFor('overline', textFont) === layer}
                <rect
                  x={lineGeometryFor('overline', textFont, textFill).left}
                  y={lineGeometryFor('overline', textFont, textFill).top}
                  width={Math.max(0, lineGeometryFor('overline', textFont, textFill).right - lineGeometryFor('overline', textFont, textFill).left)}
                  height={lineGeometryFor('overline', textFont, textFill).thickness}
                  fill={lineGeometryFor('overline', textFont, textFill).colour}
                  mask={`url(#${lineMaskId('overline', layer)})`}
                ></rect>
              {/if}
            </g>
          </g>
        </svg>
    {/snippet}

    <!-- The same rules for custom-flow (path/arc) text, where each decoration is a stroked path. -->
    {#snippet customFlowLineDecorations(layer)}
        <svg class="text-decoration-svg" viewBox={`0 0 ${displayW} ${displayH}`} width={displayW} height={displayH} aria-hidden="true">
          <defs>
            {#if customFlowDecorations.underline?.layer === layer && customFlowDecorations.underline.gap > 0}
              <mask id={customFlowMaskId('underline', layer)} maskUnits="userSpaceOnUse" x="0" y="0" width={displayW} height={displayH}>
                <rect x="0" y="0" width={displayW} height={displayH} fill="#fff"></rect>
                <g transform={textSvgMirrorTransform}>
                  <g transform={customTextTranslateTransform}>
                    {#each customTextLayout.glyphs as glyph}
                      {#if glyph.render}
                        <text
                          x={customTextOrigin.x + glyph.x}
                          y={customTextOrigin.y + glyph.y}
                          text-anchor="middle"
                          dominant-baseline="middle"
                          fill="#000"
                          stroke="#000"
                          stroke-width={Math.max(0, customFlowDecorations.underline.gap * 2)}
                          paint-order="stroke fill"
                          style={customFlowTextMaskStyle}
                          transform={glyph.rotation ? `rotate(${glyph.rotation} ${customTextOrigin.x + glyph.x} ${customTextOrigin.y + glyph.y})` : null}
                        >{glyph.char}</text>
                      {/if}
                    {/each}
                  </g>
                </g>
              </mask>
            {/if}
            {#if customFlowDecorations.strikethrough?.layer === layer && customFlowDecorations.strikethrough.gap > 0}
              <mask id={customFlowMaskId('strikethrough', layer)} maskUnits="userSpaceOnUse" x="0" y="0" width={displayW} height={displayH}>
                <rect x="0" y="0" width={displayW} height={displayH} fill="#fff"></rect>
                <g transform={textSvgMirrorTransform}>
                  <g transform={customTextTranslateTransform}>
                    {#each customTextLayout.glyphs as glyph}
                      {#if glyph.render}
                        <text
                          x={customTextOrigin.x + glyph.x}
                          y={customTextOrigin.y + glyph.y}
                          text-anchor="middle"
                          dominant-baseline="middle"
                          fill="#000"
                          stroke="#000"
                          stroke-width={Math.max(0, customFlowDecorations.strikethrough.gap * 2)}
                          paint-order="stroke fill"
                          style={customFlowTextMaskStyle}
                          transform={glyph.rotation ? `rotate(${glyph.rotation} ${customTextOrigin.x + glyph.x} ${customTextOrigin.y + glyph.y})` : null}
                        >{glyph.char}</text>
                      {/if}
                    {/each}
                  </g>
                </g>
              </mask>
            {/if}
            {#if customFlowDecorations.overline?.layer === layer && customFlowDecorations.overline.gap > 0}
              <mask id={customFlowMaskId('overline', layer)} maskUnits="userSpaceOnUse" x="0" y="0" width={displayW} height={displayH}>
                <rect x="0" y="0" width={displayW} height={displayH} fill="#fff"></rect>
                <g transform={textSvgMirrorTransform}>
                  <g transform={customTextTranslateTransform}>
                    {#each customTextLayout.glyphs as glyph}
                      {#if glyph.render}
                        <text
                          x={customTextOrigin.x + glyph.x}
                          y={customTextOrigin.y + glyph.y}
                          text-anchor="middle"
                          dominant-baseline="middle"
                          fill="#000"
                          stroke="#000"
                          stroke-width={Math.max(0, customFlowDecorations.overline.gap * 2)}
                          paint-order="stroke fill"
                          style={customFlowTextMaskStyle}
                          transform={glyph.rotation ? `rotate(${glyph.rotation} ${customTextOrigin.x + glyph.x} ${customTextOrigin.y + glyph.y})` : null}
                        >{glyph.char}</text>
                      {/if}
                    {/each}
                  </g>
                </g>
              </mask>
            {/if}
          </defs>
          <g transform={textSvgMirrorTransform}>
            <g transform={customTextTranslateTransform}>
              {#if customFlowDecorations.underline?.layer === layer}
                <g mask={customFlowDecorations.underline.gap > 0 ? `url(#${customFlowMaskId('underline', layer)})` : undefined}>
                  {#each customFlowDecorations.underline.paths as pathData}
                    <path
                      d={pathData.d}
                      fill="none"
                      stroke={customFlowDecorations.underline.colour}
                      stroke-width={customFlowDecorations.underline.thickness}
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    ></path>
                  {/each}
                </g>
              {/if}
              {#if customFlowDecorations.strikethrough?.layer === layer}
                <g mask={customFlowDecorations.strikethrough.gap > 0 ? `url(#${customFlowMaskId('strikethrough', layer)})` : undefined}>
                  {#each customFlowDecorations.strikethrough.paths as pathData}
                    <path
                      d={pathData.d}
                      fill="none"
                      stroke={customFlowDecorations.strikethrough.colour}
                      stroke-width={customFlowDecorations.strikethrough.thickness}
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    ></path>
                  {/each}
                </g>
              {/if}
              {#if customFlowDecorations.overline?.layer === layer}
                <g mask={customFlowDecorations.overline.gap > 0 ? `url(#${customFlowMaskId('overline', layer)})` : undefined}>
                  {#each customFlowDecorations.overline.paths as pathData}
                    <path
                      d={pathData.d}
                      fill="none"
                      stroke={customFlowDecorations.overline.colour}
                      stroke-width={customFlowDecorations.overline.thickness}
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    ></path>
                  {/each}
                </g>
              {/if}
            </g>
          </g>
        </svg>
    {/snippet}

    {#if hasText && !usesCustomTextFlow && shouldUseNativeTextPreview && nativePreviewData}
      <img class="native-text-preview" style={nativePreviewStyle} src={nativePreviewData} alt="" />
    {/if}

    {#if hasText && !usesCustomTextFlow && (!shouldUseNativeTextPreview || !nativePreviewData || showBlockTextVisual)}
      <div class="text-content" style={textStyle}>
        <!--
          Two elements, not three and not one. The placement and the face share `.text-span`,
          because an anchor around them bought nothing and cost the placement: an inline-block is
          baseline-aligned inside its parent's line box, which pushed short text down (see
          textAnchorStyle). The mirror, the small-caps and the text-shadow stay on their own
          `.text-glyphs` inside it, because `transform` cannot be written twice on one element —
          the mirror would replace the rotation and the fit-scale rather than compose with them.

          A LINE IS FOLDED IN when there is only one of it, which is most captions. The per-line
          styles are alignment and spacing, and on a single line they say the same thing one level
          up — 225 labels on the GAIA panel is 225 elements saved.
        -->
        <span class="text-span" style="{textAnchorStyle}; {textSpanStyle}">
          <span
            bind:this={textGlyphElement}
            class="text-glyphs"
            class:hidden-glyphs={(shouldUseNativeTextPreview && nativePreviewData) || showBlockTextVisual}
            style={textGlyphAndLineStyle}
          >
            {#if foldsSoleLine}
              {blockLineDomText(svgTextLines[0])}
            {:else}
              {#each svgTextLines as line, index}
                <span class="text-line" style={blockLineDomStyleFor(index)}>{blockLineDomText(line)}</span>
              {/each}
            {/if}
          </span>
        </span>
      </div>
    {/if}

    {#if hasText && showCustomFlowLineDecorations}
      {@render customFlowLineDecorations('back')}
    {/if}

    <!--
      The text effect stack: shape/outline masks, outline, second stroke, shadow and glow
      copies, bevel, inner glow, inner shadow, reflection and fill. Both layout modes stack
      the same layers with the same attributes and offsets; only the primitive that puts
      glyphs on screen differs, so each mode passes its own drawing snippet in. `ns`
      namespaces the <defs> ids so both can coexist in one document.
    -->
    {#snippet textVisual(ns, fillGate, drawText)}
        <svg class="text-visual-svg" viewBox={`0 0 ${displayW} ${displayH}`} width={displayW} height={displayH} aria-hidden="true">
          {#if textInnerGlowEnabled || textInnerShadowEnabled || textBevelNeedsMask || textOutlineEnabled || textStroke2Enabled || fillGate || textReflectionFadeEnabled}
            <defs>
              {#if textReflectionFadeEnabled}
                <linearGradient
                  id={textReflectionFadeGradientId(ns)}
                  gradientUnits="userSpaceOnUse"
                  x1={textReflectionFadeSpec.x1}
                  y1={textReflectionFadeSpec.y1}
                  x2={textReflectionFadeSpec.x2}
                  y2={textReflectionFadeSpec.y2}
                >
                  {#each textReflectionFadeSpec.stops as stop}
                    <stop offset={stop.offset} stop-color={stop.colour}></stop>
                  {/each}
                </linearGradient>
                <mask
                  id={textReflectionFadeMaskId(ns)}
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width={displayW}
                  height={displayH}
                >
                  <rect x="0" y="0" width={displayW} height={displayH} fill={`url(#${textReflectionFadeGradientId(ns)})`}></rect>
                </mask>
              {/if}
              {#if textInnerGlowEnabled || textInnerShadowEnabled || textBevelNeedsMask || textStroke2Enabled || fillGate}
                <mask id={textShapeMaskId(ns)} maskUnits="userSpaceOnUse" x="0" y="0" width={displayW} height={displayH}>
                  <rect x="0" y="0" width={displayW} height={displayH} fill="#000"></rect>
                    {@render drawText({ 'fill': "#fff" }, 'mask', 0, 0, '', undefined)}
                </mask>
              {/if}
              {#if textOutlineEnabled && !textOutlineUseStroke}
                <mask id={textOutlineMaskId(ns)} maskUnits="userSpaceOnUse" x="0" y="0" width={displayW} height={displayH}>
                  <rect x="0" y="0" width={displayW} height={displayH} fill="#000"></rect>
                    {@render drawText({ 'fill': "#fff", 'stroke': "#fff", 'stroke-width': textOutlineOuterRadius * 2, 'stroke-linejoin': textOutlineJoin, 'paint-order': "stroke fill" }, 'mask', 0, 0, '', undefined)}
                    {@render drawText({ 'fill': "#000", 'stroke': "#000", 'stroke-width': textOutlineInnerRadius * 2, 'stroke-linejoin': textOutlineJoin, 'paint-order': "stroke fill" }, 'mask', 0, 0, '', undefined)}
                </mask>
              {/if}
            </defs>
          {/if}
          {#each textVisualLayers as layer}
            {#if layer.key === 'reflection'}
              <g opacity={textReflectionIntensity} mask={textReflectionFadeEnabled ? `url(#${textReflectionFadeMaskId(ns)})` : undefined}>
                <g transform={textReflectionTransform}>
                    {@render drawText({ 'fill': textReflectionColour }, 'reflection', 0, 0, '', undefined)}
                </g>
              </g>
            {:else if layer.key === 'softShadow'}
                {@render drawText({ 'fill': textShadowColour }, 'softShadow', + numberOr(textEffects?.shadowOffsetX, 1), + numberOr(textEffects?.shadowOffsetY, 1), '', undefined)}
            {:else if layer.key === 'longShadow'}
                {#each textLongShadowCopies as shadowCopy}
                  <g opacity={shadowCopy.opacity}>
                    {@render drawText({ 'fill': textShadowColour }, 'mask', + shadowCopy.dx, + shadowCopy.dy, '', undefined)}
                  </g>
                {/each}
            {:else if layer.key === 'glow'}
                {#each textGlowLayers as glowLayer}
                  {@render drawText({ 'fill': glowLayer.colour }, 'mask', 0, 0, `${glowLayer.blur > 0 ? `;filter:blur(${glowLayer.blur}px)` : ''}`, undefined)}
                {/each}
            {:else if layer.key === 'motion'}
                {#each textMotionCopies as motionCopy}
                  <g opacity={motionCopy.opacity}>
                    {@render drawText({ 'fill': textMotionColour }, 'mask', + motionCopy.dx, + motionCopy.dy, '', undefined)}
                  </g>
                {/each}
            {:else if layer.key === 'bevelOuter'}
                <g>
                  {@render drawText({ 'fill': textBevelHighlightColour, 'opacity': textBevelHighlightOpacity }, 'mask', - textBevelDepth, - textBevelDepth, '', undefined)}
                  {@render drawText({ 'fill': textBevelShadowColour, 'opacity': textBevelShadowOpacity }, 'mask', + textBevelDepth, + textBevelDepth, '', undefined)}
                </g>
            {:else if layer.key === 'outline'}
              <g style={textVisualEffectStyle}>
                {#if textOutlineUseStroke}
                    {@render drawText({ 'fill': "none", 'stroke': textOutlineColour, 'stroke-width': (textOutlinePlacement === 'center' ? Math.max(1, textOutlineThickness) : Math.max(1, textOutlineThickness * 2)), 'stroke-dasharray': textOutlineDashArray || undefined, 'stroke-linejoin': textOutlineJoin }, 'text', 0, 0, '', textOutlinePlacement === 'inner' ? `url(#${textShapeMaskId(ns)})` : undefined)}
                {:else}
                  <rect x="0" y="0" width={displayW} height={displayH} fill={textOutlineColour} mask={`url(#${textOutlineMaskId(ns)})`}></rect>
                {/if}
              </g>
            {:else if layer.key === 'stroke2'}
              <g style={textVisualEffectStyle}>
                  {@render drawText({ 'fill': "none", 'stroke': textStroke2Colour, 'stroke-width': (textStroke2Placement === 'center' ? Math.max(1, numberOr(textEffects?.stroke2Thickness, 1)) : Math.max(1, numberOr(textEffects?.stroke2Thickness, 1) * 2)), 'stroke-dasharray': textStroke2DashArray || undefined, 'stroke-linejoin': "round" }, 'text', 0, 0, '', textStroke2Placement === 'inner' ? `url(#${textShapeMaskId(ns)})` : undefined)}
              </g>
            {:else if layer.key === 'fill'}
              <g style={textVisualEffectStyle}>
                {#if fillGate && !textKnockout}
                  <foreignObject x="0" y="0" width={displayW} height={displayH} mask={`url(#${textShapeMaskId(ns)})`} style="pointer-events:none;">
                    <div xmlns="http://www.w3.org/1999/xhtml" style={`${textFillLayerStyle};pointer-events:none;`}></div>
                  </foreignObject>
                {:else if !textKnockout}
                    {@render drawText({ 'fill': textMainFillColour }, 'text', 0, 0, '', undefined)}
                {/if}
              </g>
            {:else if layer.key === 'innerShadow'}
                {@render drawText({ 'fill': textInnerShadowColour }, 'mask', + numberOr(textEffects?.innerShadowOffsetX, 1), + numberOr(textEffects?.innerShadowOffsetY, 1), `;${textInnerShadowBlurValue ? `filter:${textInnerShadowBlurValue};` : ''}`, `url(#${textShapeMaskId(ns)})`)}
            {:else if layer.key === 'bevelInner'}
                {@render drawText({ 'fill': textBevelHighlightColour, 'opacity': textBevelHighlightOpacity }, 'mask', - textBevelDepth, - textBevelDepth, '', `url(#${textShapeMaskId(ns)})`)}
                {@render drawText({ 'fill': textBevelShadowColour, 'opacity': textBevelShadowOpacity }, 'mask', + textBevelDepth, + textBevelDepth, '', `url(#${textShapeMaskId(ns)})`)}
            {:else if layer.key === 'innerGlow'}
                  {@render drawText({ 'fill': textInnerGlowColour }, 'innerGlow', 0, 0, '', `url(#${textShapeMaskId(ns)})`)}
            {/if}
          {/each}
        </svg>
    {/snippet}

    <!-- Custom flow: one <text> per glyph, placed and rotated along the path. -->
    {#snippet glyphTextRun(attrs, styleKey, dx, dy, styleSuffix, groupMask)}
      <g transform={textSvgMirrorTransform} mask={groupMask}>
        {#each customTextLayout.glyphs as glyph}
          {#if glyph.render}
            <text
              x={customTextOrigin.x + glyph.x + dx}
              y={customTextOrigin.y + glyph.y + dy}
              text-anchor="middle"
              dominant-baseline="middle"
              {...attrs}
              style={`${customFlowTextStyleFor(styleKey)}${styleSuffix}`}
              transform={glyph.rotation ? `rotate(${glyph.rotation} ${customTextOrigin.x + glyph.x + dx} ${customTextOrigin.y + glyph.y + dy})` : null}
            >{glyph.char}</text>
          {/if}
        {/each}
      </g>
    {/snippet}

    <!-- Block layout: one <text> per line on the shared baseline grid. -->
    {#snippet lineTextRun(attrs, styleKey, dx, dy, styleSuffix, groupMask)}
      <g transform={textSvgBlockTransform}>
        <g transform={textSvgMirrorTransform} mask={groupMask}>
          {#each svgTextLines as line, index}
            <text
              x={blockSvgLineXFor(index) + dx}
              y={svgTextBaseY + (index * svgTextLineHeight) + dy}
              text-anchor={blockSvgLineAnchorFor(index)}
              dominant-baseline={svgBlockTextDominantBaseline}
              {...attrs}
              style={blockSvgLineStyleFor(index, `${blockTextStyleFor(styleKey)}${styleSuffix}`)}
            >{line}</text>
          {/each}
        </g>
      </g>
    {/snippet}

    {#if hasText && usesCustomTextFlow}
      {@render textVisual('custom', useTextFillForeignObject, glyphTextRun)}
    {/if}

    {#if hasText && showBlockTextVisual}
      {@render textVisual('block', needsVisualTextFill, lineTextRun)}
    {/if}

    {#if hasText && showBlockLineDecorations}
      {@render blockLineDecorations('front')}
    {/if}
  </div>

  {#if showCustomHitZones && customHitZoneEntries.length}
    <div class="custom-hit-zone-label-tray" aria-hidden="true">
      {#each customHitZoneEntries as [zoneName] (zoneName)}
        <span>{zoneName}</span>
      {/each}
    </div>
  {/if}

  {#if childControls.length}
    <!-- Nested children: DOM nesting makes their Transform.x/y parent-relative
         for free. The clip/origin layers carry no pointer events; children
         re-enable their own.

         Parent-relative is also why each child is handed its own COORDINATE FRAME here —
         `frameControls` (its siblings) and `frameSize` (this container's content box). Everything
         a child snaps to, measures against or multi-drags with lives in that frame. `allControls`
         still goes down unchanged and still means the panel's top-level list: the LCD and pixel
         displays resolve a data source out of it by name, which is a lookup, not geometry. -->
    <div class="children-clip" class:clipped={childrenClip} class:children-interactive={mouseChildrenTakePointer}
      style={childrenClip && childrenClipRadius ? `border-radius:${childrenClipRadius}px;` : ''}>
      <div class="children-origin" style="left:{childrenPad.left}px; top:{childrenPad.top}px;">
        {#each childControls as child (child._children?.Core?.id)}
          <CanvasControlNested
            control={child}
            {scale}
            {editorInteractionEnabled}
            {snapToGrid}
            {gridSize}
            {gridOriginX}
            {gridOriginY}
            {panelLocked}
            {allControls}
            frameControls={childControls}
            frameSize={childFrameSize}
            {panelWidth}
            {panelHeight}
            {onDragStart}
            {onDragEnd}
            {panelControls}
            {childPreviewPropsFor}
            parentOffset={childParentOffset}
            parentChainIds={childParentChainIds}
            parentGrid={myGridSection}
            layoutPosition={childPositions?.get(child._children?.Core?.id) ?? null}
            {...(childPreviewPropsFor?.(child) ?? {})}
          />
        {/each}
      </div>
    </div>
  {/if}

  {#if inlineTextEditing}
    <!-- svelte-ignore a11y_autofocus -->
    <textarea
      class="inline-text-editor"
      bind:value={inlineTextValue}
      autofocus
      onfocus={(e) => e.target.select()}
      onblur={commitInlineTextEdit}
      onkeydown={handleInlineTextKey}
      onmousedown={(e) => e.stopPropagation()}
      ondblclick={(e) => e.stopPropagation()}
    ></textarea>
  {/if}

  <CanvasControlSelectionOverlay
    showHandles={editorInteractionEnabled && isSelected && !isEditorLocked && $selectedComponentIds.size <= 1 && !inlineTextEditing}
    {handles}
    {handleStyle}
    onResizeStart={handleResizeStart}
    onRotateStart={handleRotateStart}
    showMeasurements={isDragging || isResizing}
    {snapGuides}
    {distanceLabels}
    {isKeyObject}
    angleLabel={isRotating && transientRotation != null ? `${normalizeRotation(transientRotation)}°` : null}
    overlayOffsetX={displayX + parentOffset.x}
    overlayOffsetY={displayY + parentOffset.y}
  />
</div>

<style>
  .canvas-control {
    position: absolute;
    box-sizing: border-box;
    cursor: default;
  }

  /* THE DRAG AFFORDANCE. The canvas had exactly two cursors — the resize handles' arrows and this
     `default` — so nothing on the surface ever said a control could be dragged; you found out by
     trying it. `move` rather than `grab`: the gesture is a direct positional move, and the eight
     handles ringing a selected control are already pointing at the resize story.

     It reflects state on both sides. Locked is excluded by the class condition rather than by a
     later override, so there is no moment where a not-allowed control claims to be draggable; and
     `dragging` waits for dragEngaged, not for the mousedown, because the first four screen pixels
     of a press are still a click and swapping the cursor there makes an ordinary selection twitch. */
  .canvas-control.editor-draggable {
    cursor: move;
  }

  .canvas-control.editor-draggable.dragging {
    cursor: grabbing;
  }

  /* --- Mouse section, preview/runtime only (see mouseAppliesToSurface) --- */

  /* interceptClicks off: the pointer passes straight through to whatever sits
     behind. Nested controls inside it are unaffected — the existing
     `.children-origin :global(.canvas-control.preview-interactive)` rule
     already hands them their own pointer events back, so a decorative frame
     can stop taking clicks without disabling the controls it contains. */
  .canvas-control.mouse-transparent {
    pointer-events: none;
  }

  /* interceptChildClicks on: parts inside the control become targets in their
     own right, rather than the control being one opaque hit area.
     Qualified by .preview-interactive, like every other re-enable in this
     file: outside preview a click on a child must still select the container,
     which is how a group gets dragged as a unit. */
  .canvas-control.preview-interactive .children-clip.children-interactive {
    pointer-events: auto;
  }

  /* focusOutline on: a visible ring when focus arrives by keyboard. Pointer
     focus stays unmarked — :focus-visible, not :focus — which is the behavior
     a plugin UI wants. */
  .canvas-control.mouse-focus-outline:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
  }

  /* Nested-children layers. Transparent to pointer events so the container's
     own handlers and the children's handlers both work; children re-enable
     interaction via their own .canvas-control. */
  .children-clip {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .children-clip.clipped {
    overflow: hidden;
    /* Rounded with the container it is clipping to. `overflow: hidden` on its own clips to the
       BORDER BOX, which is square — so a child overhanging a rounded corner stayed visible in the
       little triangle outside the curve, while the scenery compiler's <clipPath> (which rebuilds
       the same radius) cut it away. The two disagreed on exactly the pixels a corner radius is
       for, and a scenery layer locking made the difference appear. The radius is set inline
       alongside this, from the container's own Corners. */
  }
  .children-origin {
    position: absolute;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  /* The "children re-enable interaction" half of the comment above, which was never actually
     written: pointer-events: none INHERITS, so every nested control was transparent and a button
     inside a Group could not be hovered, pressed or focused in preview — the parent swallowed the
     lot. Scoped to preview-interactive on purpose. In the EDITOR the transparency is wanted:
     clicking a child selects its container, which is how dragging a group around works. */
  .children-origin :global(.canvas-control.preview-interactive) {
    pointer-events: auto;
  }

  /* A SELECTED child is directly interactive in the editor too: double-click
     drills into a container (selecting the child under the pointer), and from
     then on the child can be dragged/resized itself. Deselect (Esc steps back
     out to the parent) and the container is one draggable unit again. */
  .children-origin :global(.canvas-control.selected) {
    pointer-events: auto;
  }

  /* In-place text editor (double-click a text-bearing control). Sized by the
     control, screen-legible at every zoom via --inv-scale. */
  .inline-text-editor {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background: rgba(12, 20, 28, 0.85);
    border: calc(1px * var(--inv-scale, 1)) solid #5B9BD5;
    border-radius: 2px;
    color: #FFF;
    font-family: inherit;
    font-size: calc(12px * var(--inv-scale, 1));
    text-align: center;
    padding: calc(2px * var(--inv-scale, 1));
    resize: none;
    outline: none;
    overflow: hidden;
    z-index: 20;
    pointer-events: auto;
  }

  /* Container highlighted as the live drop target during a canvas drag. */
  .canvas-control.drop-target {
    outline: calc(2px * var(--inv-scale, 1)) dashed #5B9BD5;
    outline-offset: calc(1px * var(--inv-scale, 1));
    background: rgba(91, 155, 213, 0.10);
  }

  /* TextInput editable field: fills the control, styled via inline tiStyle. */
  .canvas-text-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
    outline: none;
    margin: 0;
  }
  .canvas-text-input:read-only {
    cursor: default;
  }

  /* Listbox filter-box input, pinned to the top of the control. */
  .canvas-listbox-filter {
    position: absolute;
    top: 2px; left: 4px; right: 4px;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 4px;
    color: inherit;
    font: inherit;
    padding: 0 6px;
    outline: none;
    z-index: 4;
  }
  .canvas-listbox-filter:focus-visible { border-color: #5B9BD5; }

  .control-content {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .interaction-debug-badge {
    position: absolute;
    top: 4px;
    left: 4px;
    max-width: calc(100% - 8px);
    padding: 3px 7px;
    border-radius: 999px;
    background: rgba(18, 18, 18, 0.9);
    border: 1px solid rgba(91, 155, 213, 0.45);
    color: #D7ECFF;
    font-size: 9px;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    z-index: 12;
  }

  .custom-hit-zone-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 30;
    overflow: visible;
  }

  .custom-hit-zone {
    position: absolute;
    box-sizing: border-box;
    border: 1px dashed rgba(245, 184, 61, 0.9);
    background: rgba(245, 184, 61, 0.08);
    color: #FFE2A1;
    font-size: 9px;
    line-height: 1;
    overflow: visible;
  }

  .custom-hit-zone.ring-zone {
    border-style: solid;
    box-shadow: inset 0 0 0 4px rgba(245, 184, 61, 0.12);
  }

  .custom-hit-zone-label-tray {
    position: absolute;
    left: 0;
    top: -32px;
    z-index: 46;
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: max(220px, 100%);
    overflow: hidden;
    white-space: nowrap;
    background: rgba(20, 18, 12, 0.94);
    border: 1px solid rgba(245, 184, 61, 0.38);
    border-radius: 4px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.38);
    opacity: 0;
    padding: 4px 6px;
    pointer-events: none;
    transform: translateY(3px);
    transition:
      opacity 90ms ease,
      transform 90ms ease;
  }

  .canvas-control:hover > .custom-hit-zone-label-tray,
  .canvas-control.selected > .custom-hit-zone-label-tray,
  .canvas-control:focus-within > .custom-hit-zone-label-tray {
    opacity: 1;
    transform: translateY(0);
  }

  .custom-hit-zone-label-tray span {
    min-width: 0;
    max-width: 120px;
    overflow: hidden;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(245, 184, 61, 0.12);
    color: #FFE2A1;
    font-size: 9px;
    font-weight: 800;
    line-height: 1.1;
    text-overflow: ellipsis;
  }

  .text-content {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    overflow: hidden;
    line-height: 1;
  }

  .radio-group-content {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(var(--radio-columns, 1), minmax(0, 1fr));
    grid-template-rows: repeat(var(--radio-rows, 1), minmax(0, 1fr));
    box-sizing: border-box;
    pointer-events: none;
    z-index: 3;
  }

  .radio-group-item {
    min-width: 0;
    min-height: 0;
    position: relative;
    box-sizing: border-box;
    overflow: hidden;
  }

  .radio-group-item.edit-target::after {
    content: '';
    position: absolute;
    inset: 2px;
    border: 2px solid rgba(46, 139, 87, 0.95);
    border-radius: 8px;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.55),
      0 0 10px rgba(46, 139, 87, 0.45);
    pointer-events: none;
    z-index: 6;
  }

  .radio-group-item-shell {
    position: absolute;
    inset: 0;
  }

  .radio-group-item-content {
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1px;
  }

  .radio-indicator-outer,
  .radio-indicator-inner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .radio-indicator-outer {
    border-style: solid;
  }

  .radio-indicator-inner {
    border-style: solid;
    transition: transform 0.14s ease, opacity 0.14s ease;
  }

  .radio-indicator-inner.standalone {
    align-self: center;
  }

  .radio-group-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.1;
  }

  .radio-edit-target-badge {
    position: absolute;
    right: 5px;
    top: 5px;
    z-index: 7;
    border-radius: 999px;
    padding: 2px 5px;
    background: rgba(14, 63, 42, 0.92);
    border: 1px solid rgba(46, 139, 87, 0.95);
    color: #FFF;
    font-size: 8px;
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
    pointer-events: none;
  }

  .combobox-arrow {
    position: absolute;
    right: 10px;
    top: 50%;
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid rgba(255, 255, 255, 0.78);
    transform: translateY(-35%);
    pointer-events: none;
    z-index: 14;
  }

  .icon-content {
    position: absolute;
    box-sizing: border-box;
    pointer-events: none;
  }

  .icon-image {
    display: block;
  }

  /*
   * Was two elements: `.text-anchor` positioned the block, `.text-span` was the inline-block the
   * glyphs and their transforms lived in. `display:inline-block` is kept because `transform` and
   * `transform-origin: center center` in textSpanStyle are relative to this box — but note that
   * `position:absolute` blockifies it, which is the point: an inline-block is baseline-aligned
   * inside its parent's line box, and that is what used to push short text down. Absolute
   * positioning removes the line box, so the element lands exactly where left/top put it.
   *
   * `max-width` is no longer set here; it comes in through textAnchorStyle as a pixel value, which
   * would beat any percentage written at this level anyway.
   */
  .text-span {
    position: absolute;
    display: inline-block;
    min-width: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /*
   * The glyph box, and — when there is only one line — that line as well. `display:block` either
   * way: the folded line needs it, and blockLinePaintStyles deliberately leaves it out so that a
   * line folded onto an inline-block would not blockify it.
   */
  .text-glyphs {
    display: block;
  }

  .text-line {
    display: block;
    min-width: 0;
  }

  .text-glyphs.hidden-glyphs {
    color: transparent !important;
    -webkit-text-fill-color: transparent;
    -webkit-text-stroke-width: 0 !important;
    -webkit-text-stroke-color: transparent !important;
    text-stroke-width: 0 !important;
    text-stroke-color: transparent !important;
    text-shadow: none !important;
    filter: none !important;
  }

  .text-decoration-svg,
  .text-visual-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }

  .native-text-preview {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
    pointer-events: none;
  }

  /* Selection/hover/drop outlines are screen-space UI drawn inside the scaled
     surface — widths ride --inv-scale so they read the same at every zoom. */
  .canvas-control:hover:not(.locked) {
    outline: calc(1px * var(--inv-scale, 1)) solid rgba(91, 155, 213, 0.4);
  }

  .canvas-control.preview-surface:hover:not(.locked) {
    outline: none;
  }

  .canvas-control.preview-interactive {
    cursor: default;
    outline: none;
    touch-action: none;
    overscroll-behavior: contain;
    user-select: none;
    -webkit-user-select: none;
  }

  .canvas-control.preview-interactive[data-preview-role='button'],
  .canvas-control.preview-interactive[data-preview-role='checkbox'],
  .canvas-control.preview-interactive[data-preview-role='radio'],
  .canvas-control.preview-interactive[data-preview-role='combobox'] {
    cursor: pointer;
  }

  .canvas-control.preview-interactive[data-preview-role='slider'],
  .canvas-control.preview-interactive[data-preview-role='spinbutton'] {
    cursor: ns-resize;
  }

  .canvas-control.preview-disabled {
    cursor: not-allowed;
  }

  .canvas-control.preview-keyboard-focus::after,
  .canvas-control.preview-highlighted::before {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 12px;
    pointer-events: none;
  }

  .canvas-control.preview-keyboard-focus::after {
    border: 1px solid rgba(91, 155, 213, 0.6);
  }

  .canvas-control.preview-highlighted::before {
    border: 1px dashed rgba(255, 196, 84, 0.7);
  }

  /* Tinted by the control's layer when that layer has a colour code, blue otherwise. The key-object
     rule below still wins, because "this is the one the others align to" is a stronger thing to say
     than "this is on the scenery layer". */
  .canvas-control.selected {
    outline: calc(2px * var(--inv-scale, 1)) solid var(--layer-tint, #5B9BD5);
    outline-offset: calc(-1px * var(--inv-scale, 1));
  }

  .canvas-control.selected.key-object {
    outline-color: #E5A029;
  }

  .canvas-control.hidden-component {
    opacity: 0.25 !important;
    outline: calc(1px * var(--inv-scale, 1)) dashed #666;
  }

  /* A HIDDEN CONTROL STOPS TAKING THE POINTER. `opacity: 0.25` alone left it fully interactive, so
     something you had deliberately made invisible still ate the click meant for what sits under it
     and still swallowed a marquee begun on top of it — the eye said "not there", the mouse said
     "very much there".

     pointer-events INHERITS. That is the trap already recorded on the .children-origin rules above
     (a blanket `none` once made every nested control unreachable in preview), and here it is the
     wanted behaviour rather than an accident: hiding a container dims its whole subtree, because
     the opacity applies to the subtree, and a child you cannot see must not be clickable either.
     Which means the two deliberate re-enables — .preview-interactive and .selected — would punch
     straight back through it, and a selected child inside a hidden container would be the one
     clickable thing in an invisible group. `!important` on the descendant selector shuts both off
     inside a hidden subtree, and on the host selector too, so a hidden control that is itself a
     selected nested child does not re-enable itself.
     To work on a hidden control, unhide it. */
  .canvas-control.hidden-component,
  .canvas-control.hidden-component :global(.canvas-control) {
    pointer-events: none !important;
  }

  /* A LOCKED CONTROL IS CLICK-THROUGH. It used to intercept the press and then refuse to do
     anything with it (handleMouseDown returns early on isEditorLocked), which is the worst of both:
     the click is spent, whatever is underneath never sees it, and a marquee cannot even be started
     on top of a locked backdrop — the single most common thing to lock. Locked means "not a target",
     the way it does in every other design tool, and selecting one is the component tree's job.

     Scoped to the control's OWN lock, not `isEditorLocked`: when the whole PANEL is locked every
     control would go inert at once and the canvas would stop responding entirely, so panel-lock
     keeps the old swallow-and-refuse path (and the not-allowed cursor below, which is the only
     place that cursor can still be seen).

     Inheriting into the subtree is correct here too — locking a container locks what is inside it,
     which is already how buildDropCandidates treats one — and the same two re-enables have to be
     shut off for the same reason as above. */
  .canvas-control.lock-click-through,
  .canvas-control.lock-click-through :global(.canvas-control) {
    pointer-events: none !important;
  }

  /* A custom component with no visible background renders transparent, so in
     edit mode it would be invisible until hovered/selected. This faint,
     edit-only dashed box + corner tag shows where it is. Suppressed once the
     control is selected (the selection outline takes over) and never present
     in preview/export (preview-surface). */
  .canvas-control.custom-component-hint:not(.selected):not(.preview-surface)::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    outline: 1px dashed rgba(120, 160, 210, 0.55);
    outline-offset: -1px;
    background: rgba(91, 155, 213, 0.04);
    z-index: 1;
  }

  .canvas-control.custom-component-hint:not(.selected):not(.preview-surface)::after {
    content: 'component';
    position: absolute;
    left: 0;
    top: 0;
    transform: translateY(-100%);
    pointer-events: none;
    padding: 0 4px;
    font-size: 8px;
    line-height: 1.5;
    letter-spacing: 0.03em;
    color: rgba(200, 220, 240, 0.75);
    background: rgba(30, 42, 56, 0.85);
    border-radius: 2px 2px 0 0;
    white-space: nowrap;
    z-index: 1;
  }

  /* Only reachable when the whole PANEL is locked: a control locked on its own is click-through
     (see .lock-click-through), so its cursor is whatever lies underneath, which is the honest
     answer for something that is not a target. */
  .canvas-control.locked {
    cursor: not-allowed;
  }

  .canvas-control.device-drop-compatible {
    outline: 2px solid rgba(124, 193, 141, 0.9);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(124, 193, 141, 0.14);
  }

  .canvas-control.device-drop-warning {
    outline: 2px solid rgba(213, 180, 91, 0.95);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(213, 180, 91, 0.16);
  }

  .canvas-control.device-drop-incompatible {
    outline: 2px solid rgba(213, 107, 107, 0.9);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(213, 107, 107, 0.14);
  }

</style>
