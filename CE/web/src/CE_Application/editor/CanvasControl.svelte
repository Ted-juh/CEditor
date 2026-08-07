<script>
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import CanvasControlSelectionOverlay from './CanvasControlSelectionOverlay.svelte';
  import CanvasControlNested from './CanvasControl.svelte';
  import { getChildControls, computeFlowLayout, controlPanelRect, panelToLocalPoint, selectionRoots, collectSubtreeIds, findControlById, buildControlIndex, getAncestorIds, flatControlsWithPanelRects } from '../utils/containment.js';
  import { containerDropTargetId } from '../stores/containerDrag.js';
  import { sortControlsForRender } from '../utils/controlOrder.js';
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
  import { applyControlPatchesById, getSection, updateControlProperty, reparentControls } from '../stores/controls.js';
  import { adoptParameterMetadata } from '../utils/parameterAdoption.js';
  import { storedFonts, storedIcons, fontRuntimeStatus, ensureStoredFontLoaded } from '../stores/appSettings.js';
  import { nativeFontPreviews, requestNativeFontPreview } from '../stores/nativeFontPreviews.js';
  import { get } from 'svelte/store';
  import { showDistances } from '../stores/editorView.js';
  import { guides } from '../stores/guides.js';
  import { fileCache, loadFile } from '../stores/fileCache.js';
  import { findAlignmentSnap, computeDistances } from '../utils/canvasSnapping.js';
  import { setActivePanelSnapGuides, clearActivePanelSnapGuides } from '../stores/panelSnapGuides.js';
  import { buildShadowCSS, buildBlendCSS, buildFilterCSS } from '../utils/effectsCSS.js';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { resolveInteractiveControl } from '../utils/interactionRuntime.js';
  import {
    getMouseSection,
    resolveCursorCss,
    resolveHitTestClipPath,
    resolveTabIndex,
    acceptsPointer,
    childrenAcceptPointer,
    showsFocusOutline,
    isFocusable,
    raisesOnClick,
  } from '../utils/mouseBehavior.js';
  import { visibleChoiceRows, dependsOnId, dependentControl } from '../utils/dependentChoices.js';
  import { measurePerfDebug } from '../utils/perfDebug.js';
  import { resolveRadioGroupLayout } from '../utils/radioGroupLayout.js';
  import { segmentEditScope } from '../stores/segmentEditScope.js';
  import { normalizeSegmentTargetIds } from '../utils/segmentTargets.js';
  import { getBindingCompatibility } from '../models/componentPorts.js';
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
    computeResizedRect, snapRectToGrid, snapToGridAxis,
    clientToPanelPoint, angleFromCenter, computeRotation, normalizeRotation,
    resizeHandleStyle,
  } from '../utils/transformMath.js';

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
  let mouseFocusable = $derived(mouseAppliesToSurface && isFocusable(mouseSection));
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
    previewTabIndex !== undefined ? previewTabIndex : resolveTabIndex(mouseSection)
  );

  // --- Drag state (internal $state per feedback) ---
  let isDragging = $state(false);
  let dragStartMouse = $state({ x: 0, y: 0 });
  let dragStartPos = $state({ x: 0, y: 0 });
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

  // During multi-drag, non-dragged selected components offset by the shared delta
  let multiDragOffsetX = $derived(!isDragging && isSelected && $multiDragDelta.active ? $multiDragDelta.x : 0);
  let multiDragOffsetY = $derived(!isDragging && isSelected && $multiDragDelta.active ? $multiDragDelta.y : 0);
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

  let displayX = $derived(layoutPosition ? layoutPosition.x : (transientX ?? transform?.x ?? 0) + multiDragOffsetX);
  let displayY = $derived(layoutPosition ? layoutPosition.y : (transientY ?? transform?.y ?? 0) + multiDragOffsetY);
  let displayW = $derived(transientW ?? transform?.width ?? 100);
  let displayH = $derived(transientH ?? transform?.height ?? 40);

  // --- Container children (nesting). All empty/false for non-containers, so a
  // control with no Children section renders exactly as before. ---
  let childrenSection = $derived(getSection(control, 'Children'));
  let isContainer = $derived(!!childrenSection);
  let childControls = $derived(isContainer ? sortControlsForRender(getChildControls(control)) : []);
  let childrenPadding = $derived(Number(childrenSection?.padding ?? 0));
  let childrenGap = $derived(Number(childrenSection?.gap ?? 0));
  let childrenClip = $derived(childrenSection?.clip === true);
  let childrenLayoutMode = $derived(String(childrenSection?.layout ?? 'none'));
  let childFlowPositions = $derived(
    childrenLayoutMode !== 'none' && childControls.length
      ? computeFlowLayout(childControls, displayW, childrenGap, childrenPadding)
      : null
  );
  let childParentOffset = $derived({
    x: parentOffset.x + displayX + childrenPadding,
    y: parentOffset.y + displayY + childrenPadding,
  });
  let childParentChainIds = $derived([...parentChainIds, core?.id].filter(Boolean));
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

  // Thin wrappers around the pure snap utils so the drag/resize handlers
  // stay readable. findAlignmentSnap uses allControls + ruler guides;
  // computeDistances additionally filters out co-selected siblings and
  // only runs for the dragged (key-object) component.
  function alignSnap(x, y, w, h) {
    const align = findAlignmentSnap(
      { x, y, w, h }, core?.id, allControls, $guides, getSection,
      { width: panelWidth, height: panelHeight },
    );
    // Publish the live guides so the panel rulers can mirror them (parity with
    // the component editor). Cleared on drag/resize end.
    setActivePanelSnapGuides(align.guides);
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
      allControls,
      { width: panelWidth, height: panelHeight },
      getSection,
    );
  }

  // --- Click to select ---
  function handleMouseDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();

    const multiKey = e.ctrlKey || e.metaKey;
    if (multiKey) {
      // Ctrl+click: toggle this component in/out of selection
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
    dragStartMouse = { x: e.clientX, y: e.clientY };
    dragStartPos = { x: transform?.x ?? 0, y: transform?.y ?? 0 };
    transientX = dragStartPos.x;
    transientY = dragStartPos.y;
    onDragStart?.();

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  }

  function parseDeviceParameterDrag(event) {
    const raw = event.dataTransfer?.getData('application/x-ceditor-device-parameter');
    if (!raw) return null;

    try {
      const payload = JSON.parse(raw);
      if (payload?.kind !== 'ceditor.deviceParameter' || !payload?.parameter?.id) return null;
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
    const nextBinding = {
      kind: 'deviceParameter',
      port: compatibility.port.id,
      deviceRole: payload.deviceRole || DEFAULT_DEVICE_ROLE,
      parameterId: parameter.id,
      parameterType: parameter.type,
      adoptMetadata: true,
      dryRun: true,
      feedback: {
        receiveUpdates: true,
        ignoreOwnEchoes: true,
        echoWindowMs: 250,
      },
    };

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
  function dropCandidateAt(panelX, panelY) {
    const ids = get(selectedComponentIds);
    const movingRoots = ids.size > 1 && ids.has(core?.id) ? selectionRoots(panelControls, ids) : [core?.id];
    const excluded = new Set();
    for (const rootId of movingRoots) {
      const rootControl = findControlById(panelControls, rootId);
      if (rootControl) for (const subId of collectSubtreeIds(rootControl)) excluded.add(subId);
    }
    const index = buildControlIndex(panelControls);
    let best = null;
    // Consider every container in the tree (panel-space rects), so a component
    // can be dropped into a nested container, not just a top-level one.
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
      if (panelX < entryTransform.x || panelX > entryTransform.x + entryTransform.width) continue;
      if (panelY < entryTransform.y || panelY > entryTransform.y + entryTransform.height) continue;
      const depth = index.get(entryCore.id)?.depth ?? 0;
      if (!best || depth >= best.depth) best = { id: entryCore.id, depth };
    }
    return best?.id ?? null;
  }

  function handleDragMove(e) {
    if (!isDragging) return;
    const dx = (e.clientX - dragStartMouse.x) / scale;
    const dy = (e.clientY - dragStartMouse.y) / scale;

    let newX = dragStartPos.x + dx;
    let newY = dragStartPos.y + dy;

    // Grid snap first
    if (snapToGrid && gridSize > 0) {
      newX = snapToGridX(newX);
      newY = snapToGridY(newY);
    }

    // Alignment snap overrides grid when within threshold
    const align = alignSnap(newX, newY, displayW, displayH);
    transientX = Math.round(align.x);
    transientY = Math.round(align.y);
    snapGuides = align.guides;
    distanceLabels = $showDistances ? distancesFor(transientX, transientY, displayW, displayH) : [];

    // Broadcast delta for other selected components to follow
    const ids = get(selectedComponentIds);
    if (ids.size > 1) {
      multiDragDelta.set({ x: transientX - dragStartPos.x, y: transientY - dragStartPos.y, active: true });
    }

    // Highlight the container under the pointer as the drop target (Alt suppresses).
    const currentParentId = parentChainIds[0] ?? null;
    const surfacePoint = surfacePointFromClient(e.clientX, e.clientY);
    const target = (!e.altKey && surfacePoint) ? dropCandidateAt(surfacePoint.x, surfacePoint.y) : currentParentId;
    containerDropTargetId.set(target !== currentParentId ? target : null);
  }

  function handleDragEnd(e) {
    if (!isDragging) return;
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
    containerDropTargetId.set(null);

    const dx = transientX - dragStartPos.x;
    const dy = transientY - dragStartPos.y;
    const moved = dx !== 0 || dy !== 0;
    const ids = get(selectedComponentIds);
    const isMultiDrag = ids.size > 1 && ids.has(core?.id);

    // Where did the drag end — over which container (or top level)?
    const currentParentId = parentChainIds[0] ?? null;
    let targetParentId = currentParentId;
    if (moved && e?.altKey !== true) {
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
      const patches = new Map();
      if (isMultiDrag) {
        // Multi-drag: apply delta to all selected components
        for (const other of allControls) {
          const otherId = getSection(other, 'Core')?.id;
          if (!otherId || otherId === core.id || !ids.has(otherId)) continue;
          const ot = getSection(other, 'Transform');
          if (ot) {
            patches.set(otherId, {
              'Transform.x': ot.x + dx,
              'Transform.y': ot.y + dy,
            });
          }
        }
      }
      // Always update the dragged component itself
      if (core?.id) {
        patches.set(core.id, {
          ...(patches.get(core.id) ?? {}),
          'Transform.x': transientX,
          'Transform.y': transientY,
        });
      }

      if (patches.size > 0) {
        applyControlPatchesById(patches);
      }
    }

    // Clear multi-drag delta
    multiDragDelta.set({ x: 0, y: 0, active: false });

    isDragging = false;
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

    // Resize geometry (deltas + aspect lock + min/max clamping)
    let rect = computeResizedRect(resizeStartRect, resizeHandle, dx, dy, {
      aspectLock: e.shiftKey || (transform?.aspectLock === true),
      aspectRatio: resizeStartRect.w / resizeStartRect.h,
      minW: Math.max(MIN_SIZE, transform?.minWidth || 0),
      minH: Math.max(MIN_SIZE, transform?.minHeight || 0),
      maxW: transform?.maxWidth || 0,
      maxH: transform?.maxHeight || 0,
    });

    // Grid snap
    if (snapToGrid) rect = snapRectToGrid(rect, gridSize, snapToGridX, snapToGridY);

    // Alignment snap overrides grid when within threshold
    const align = alignSnap(rect.x, rect.y, rect.w, rect.h);
    transientX = Math.round(align.x);
    transientY = Math.round(align.y);
    transientW = Math.round(rect.w);
    transientH = Math.round(rect.h);
    snapGuides = align.guides;
    distanceLabels = $showDistances ? distancesFor(transientX, transientY, transientW, transientH) : [];
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
  const handles = [
    { id: 'tl', cursor: 'nwse-resize' },
    { id: 't',  cursor: 'ns-resize' },
    { id: 'tr', cursor: 'nesw-resize' },
    { id: 'l',  cursor: 'ew-resize' },
    { id: 'r',  cursor: 'ew-resize' },
    { id: 'bl', cursor: 'nesw-resize' },
    { id: 'b',  cursor: 'ns-resize' },
    { id: 'br', cursor: 'nwse-resize' },
  ];

  const handleStyle = resizeHandleStyle;

  // --- Effects CSS (applied to .canvas-control and .control-content) ---
  let shadowCSS = $derived(buildShadowCSS(effects));
  let blendCSS  = $derived(buildBlendCSS(effects));
  let filterCSS = $derived(buildFilterCSS(effects));

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
  let hasText = $derived(!isRadioGroupControl && !isListboxControl && !isTextInput && !isMeter && !isEnvelope && !isMatrix && !isJoystick && !isCrossfader && !isRibbon && !isMacro && !isOrbit && !isLooper && !isRouter && !isTimbre && !isTuring && !isKinetic && !isConstellation && !isConstraint && !isChordPad && !isArp && !isNoteRibbon && !isDrumPads && !isPanic && !isTransport && !isSplitZone && !isPhrase && !isRecorder && !isHarmoniser && !isSetlist && !!text && renderedTextContent.length > 0 && contentLayoutMode !== 'icon_only');
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
    const width = Math.max(0, domTextGlyphSize.width);
    const height = Math.max(0, domTextGlyphSize.height || numberOr(textFont?.size, 12));
    return {
      left: textAxisCenter.x - (width / 2),
      top: textAxisCenter.y - (height / 2),
      width,
      height,
    };
  });
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
  // Stay off this anchor math unless the text-position system is being redesigned.
  // Label->Text->Position must stay locked to glyph bounds only.
  // Underline/overline/strike live in their own layers and must never be folded
  // back into this placement, or Top/Center/Bottom drifts and flips again.
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

  function blockLineDomStyleFor(index) {
    if (usesCustomTextFlow) return '';

    const styles = [
      'display:block',
      'white-space:pre',
      `text-align:${blockLineFillWidthApplied(index) ? 'left' : blockLineEffectiveAlign(index)}`,
      `letter-spacing:${blockLineLetterSpacingFor(index)}px`,
      `word-spacing:${blockLineWordSpacingFor(index)}px`,
    ];

    if (blockTextLayout.lineBoxWidth > 0) {
      styles.push(`width:${blockTextLayout.lineBoxWidth}px`);
    }

    return styles.join('; ');
  }

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

    const syncMetrics = () => {
      domTextGlyphSize = {
        width: textGlyphElement.offsetWidth ?? 0,
        height: textGlyphElement.offsetHeight ?? 0,
      };

      if (!showBlockLineDecorations) {
        if (domGlyphCharacterRects.length > 0) {
          domGlyphCharacterRects = [];
        }
        return;
      }

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

      domGlyphCharacterRects = nextRects;
    };

    const frame = requestAnimationFrame(syncMetrics);
    const observer = new ResizeObserver(() => syncMetrics());
    observer.observe(textGlyphElement);
    if (showBlockLineDecorations) {
      observer.observe(controlContentElement);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
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
  class:selected={editorInteractionEnabled && isSelected && !panelLocked}
  class:key-object={editorInteractionEnabled && isKeyObject && !panelLocked}
  class:hidden-component={!isVisible}
  class:locked={editorInteractionEnabled && isEditorLocked}
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
  style="left:{displayX}px; top:{displayY}px; width:{displayW}px; height:{displayH}px; opacity:{renderOpacity}; {canvasTransformCSS} {rootTransitionCSS} {shadowCSS} {blendCSS} {mouseCursorCSS} {mouseClipCSS} {mouseRaiseCSS}"
  onmousedown={editorInteractionEnabled ? handleMouseDown : undefined}
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
  <div bind:this={controlContentElement} class="control-content" style="{filterCSS}">
    {#if background}
      <BackgroundRenderer {background} width={displayW} height={displayH} />
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
        <div class="text-anchor" style={textAnchorStyle}>
          <span class="text-span" style={textSpanStyle}>
            <span
              bind:this={textGlyphElement}
              class="text-glyphs"
              class:hidden-glyphs={(shouldUseNativeTextPreview && nativePreviewData) || showBlockTextVisual}
              style={textGlyphStyle}
            >
              {#each svgTextLines as line, index}
                <span class="text-line" style={blockLineDomStyleFor(index)}>{blockLineDomText(line)}</span>
              {/each}
            </span>
          </span>
        </div>
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
         re-enable their own. -->
    <div class="children-clip" class:clipped={childrenClip} class:children-interactive={mouseChildrenTakePointer}>
      <div class="children-origin" style="left:{childrenPadding}px; top:{childrenPadding}px;">
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
            {panelWidth}
            {panelHeight}
            {onDragStart}
            {onDragEnd}
            {panelControls}
            {childPreviewPropsFor}
            parentOffset={childParentOffset}
            parentChainIds={childParentChainIds}
            parentGrid={myGridSection}
            layoutPosition={childFlowPositions?.get(child._children?.Core?.id) ?? null}
            {...(childPreviewPropsFor?.(child) ?? {})}
          />
        {/each}
      </div>
    </div>
  {/if}

  <CanvasControlSelectionOverlay
    showHandles={editorInteractionEnabled && isSelected && !isEditorLocked}
    {handles}
    {handleStyle}
    onResizeStart={handleResizeStart}
    onRotateStart={handleRotateStart}
    showMeasurements={isDragging || isResizing}
    {snapGuides}
    {distanceLabels}
    {isKeyObject}
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

  /* Container highlighted as the live drop target during a canvas drag. */
  .canvas-control.drop-target {
    outline: 2px dashed #5B9BD5;
    outline-offset: 1px;
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

  .text-anchor {
    position: absolute;
    max-width: 100%;
    min-width: 0;
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

  .text-span {
    position: relative;
    display: inline-block;
    max-width: 100%;
    white-space: pre-wrap;
    word-break: break-word;
  }

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

  .canvas-control:hover:not(.locked) {
    outline: 1px solid rgba(91, 155, 213, 0.4);
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

  .canvas-control.selected {
    outline: 2px solid #5B9BD5;
    outline-offset: -1px;
  }

  .canvas-control.selected.key-object {
    outline-color: #E5A029;
  }

  .canvas-control.hidden-component {
    opacity: 0.25 !important;
    outline: 1px dashed #666;
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
