<script>
  import { onDestroy } from 'svelte';
  import ArrowDown from 'lucide-svelte/icons/arrow-down';
  import ArrowUp from 'lucide-svelte/icons/arrow-up';
  import Copy from 'lucide-svelte/icons/copy';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import Lock from 'lucide-svelte/icons/lock';
  import Maximize from 'lucide-svelte/icons/maximize';
  import PanelBottom from 'lucide-svelte/icons/panel-bottom';
  import PanelLeft from 'lucide-svelte/icons/panel-left';
  import PanelRight from 'lucide-svelte/icons/panel-right';
  import Ruler from 'lucide-svelte/icons/ruler';
  import Scissors from 'lucide-svelte/icons/scissors';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Unlock from 'lucide-svelte/icons/unlock';
  import Zap from 'lucide-svelte/icons/zap';
  import DisplayPanel from '../panels/DisplayPanel.svelte';
  import { applyControlPatch, getSection, removeControlNode, updateControlProperty } from '../stores/controls.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { openFillGradientEditor } from '../stores/gradientTarget.js';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { clipPathForKind } from '../utils/shapeGeometry.js';
  import { getOrCreateScriptDocForPanel } from '../stores/scriptWorkspace.js';
  import { setActiveEditorTab } from '../stores/panels.js';
  import EditorRuler from '../editor/EditorRuler.svelte';
  import InteractiveTestSurface from '../components/InteractiveTestSurface.svelte';
  import InteractivePartRenderer from '../editor/InteractivePartRenderer.svelte';
  import {
    CUSTOM_ASSISTANT_RECIPES,
    CUSTOM_COMPONENT_STARTERS,
    createBackground,
    createBehaviorModule,
    createCustomComponentBlankBindingsDefaults,
    createCustomComponentBlankGeneratorsDefaults,
    createCustomComponentBlankHitZonesDefaults,
    createCustomComponentBlankPartsDefaults,
    createCustomComponentStarterPatch,
    createHitZone,
    createPartNode,
    createText,
    createValueChannel,
    createArpPatternChannel,
  } from '../utils/customComponentFactory.js';
  import { buildRecipePatch } from '../utils/customComponentRecipes.js';
  import { buildInteractivePatch } from '../utils/customComponentScaffold.js';
  import { customHitZoneRect } from '../utils/customComponentInteraction.js';
  import { materializedCustomComponentSnapshot } from '../utils/customComponentMaterializer.js';
  import { analyzeCustomComponentReadiness } from '../utils/customComponentPackage.js';
  import { normalizeCustomArpeggiator } from '../utils/customComponentArpeggiator.js';
  import { resolveStateScopedControl } from '../utils/interactionRuntime.js';
  import { createInteractionPreviewSession } from '../stores/interactionPreview.js';
  import { componentDesignerPreviewRequest, componentDesignerStatus } from '../stores/componentDesignerStatus.js';
  import { creatorMode } from '../stores/creatorMode.js';
  import {
    ENVELOPE_SHAPE_PRESETS,
    RENDERER_COLOR_PRESETS,
    WAVEFORM_SHAPES,
    envelopePathPresetPatch,
    waveformIconPresetPatch,
  } from '../utils/customComponentRendererPresets.js';
  import CustomGeneratorsEditor from './CustomGeneratorsEditor.svelte';
  import CustomArpeggiatorEditor from './CustomArpeggiatorEditor.svelte';
  import CustomStateFilmstrip from './CustomStateFilmstrip.svelte';
  import SurfaceHelpOverlay from './SurfaceHelpOverlay.svelte';
  import { numberOr } from '../utils/primitives.js';
  import {
    angleFromCenter,
    computeResizedRect,
    computeRotation,
    normalizeRotation,
  } from '../utils/transformMath.js';
  import {
    alignFramesWithinSelection,
    applySmartSnap,
    arcPointStyle,
    boundsForFrames,
    clampNumber,
    defaultDrawSize,
    distributeFramesWithinSelection,
    draftRect as draftRectBase,
    feedbackLabelStyle as feedbackLabelStyleBase,
    frameCenter,
    frameReadout,
    isTinyFrame,
    measurementLinesBetween,
    partFrame as partFrameBase,
    patchFromFrameForLayer as patchFromFrameForLayerBase,
    patchFromZoneFrameFor as patchFromZoneFrameForBase,
    pointInArtboardFromElement,
    roundLayoutValue,
    selectionBoundsStyle,
    smartGuideStyle,
    smartSnapTargets,
    snapGuides as snapGuidesBase,
    zoneFrame as zoneFrameBase,
  } from '../utils/customDesignSurfaceGeometry.js';
  import {
    buildPastePatch,
    getPartClipboard,
    hasPartClipboard,
    setPartClipboard,
  } from '../utils/customComponentClipboard.js';
  import {
    alphaFromColour,
    cloneValue,
    colourFromInput,
    drawPreviewClip,
    generatedSourceForNode,
    generatorNameForEntry,
    handleStyle,
    hitZoneStyle as hitZoneStyleBase,
    inlineTextEditorStyle as inlineTextEditorStyleBase,
    isArcCenterPart,
    isEditablePart,
    isEditableZone,
    isGeneratedPart,
    kitIdFor,
    layerKind,
    layerKindClass,
    layerKindLabel,
    layerThumbPartStyle as layerThumbPartStyleBase,
    numericInputValue,
    partOverlayStyle as partOverlayStyleBase,
    previewSignals,
    stopSelectionAction,
    swatchCss,
    uniqueNodeName,
    valueControlStyleLabel,
    zoneThumbPartStyle as zoneThumbPartStyleBase,
  } from '../utils/customDesignSurfaceHelpers.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let transform = $derived(getSection(control, 'Transform'));
  let designer = $derived(getSection(control, 'Designer'));
  let preview = $derived(designer?.preview ?? {});
  let valueChannels = $derived(getSection(control, 'ValueChannels'));
  let behaviors = $derived(getSection(control, 'Behaviors'));
  let bindings = $derived(getSection(control, 'Bindings'));
  let generators = $derived(getSection(control, 'Generators'));
  let states = $derived(getSection(control, 'States'));
  let renderControl = $derived.by(() => materializedCustomComponentSnapshot(control, previewSignals(preview)));
  let parts = $derived(getSection(renderControl, 'Parts'));
  let authoredParts = $derived(getSection(control, 'Parts'));
  let hitZones = $derived(getSection(renderControl, 'HitZones'));
  let authoredHitZones = $derived(getSection(control, 'HitZones'));
  let allPartEntries = $derived(
    Object.entries(parts?._children ?? {})
      .sort((left, right) => Number(left?.[1]?.zIndex ?? 0) - Number(right?.[1]?.zIndex ?? 0))
  );
  let partEntries = $derived(allPartEntries.filter(([, part]) => part?.visible !== false));
  let hitZoneEntries = $derived(
    Object.entries(hitZones?._children ?? {})
      .filter(([, zone]) => zone?.enabled !== false && zone?.visibleInEditor !== false)
      .sort((left, right) => Number(left?.[1]?.priority ?? 0) - Number(right?.[1]?.priority ?? 0))
  );
  let selectedLayer = $derived(String(designer?.selectedLayer ?? ''));
  let localSelectedLayerNames = $state([]);
  let selectedLayerNames = $derived.by(() => {
    const local = localSelectedLayerNames.filter((name) => parts?._children?.[name]);
    if (local.length > 1) return local;
    if (selectedLayer && parts?._children?.[selectedLayer]) {
      if (local.includes(selectedLayer)) return local;
      return [selectedLayer];
    }
    return local;
  });
  let selectedLayerSet = $derived(new Set(selectedLayerNames));
  let selectedHitZone = $derived(String(designer?.selectedHitZone ?? ''));
  let selectedKit = $derived(String(designer?.selectedKit ?? ''));
  let selectedSurfaceKind = $derived(String(designer?.selectedSurfaceKind ?? 'layer'));
  let hoveredSurfaceItem = $state(null);
  let dockTab = $state('layers');
  let collapsedGeneratedSources = $state({});
  let surfaceZoom = $state(1);
  let snapEnabled = $state(true);
  let snapSize = $state(10);
  // Object-relative smart guides: snap moves to other parts' edges/centers
  // and the artboard edges/center; Alt bypasses, grid snap is the fallback.
  let smartSnapEnabled = $state(true);
  let activeSmartGuides = $state.raw([]);
  // Split active guides per ruler axis, tagging the artboard-center guide so
  // both the ruler and the on-canvas line can draw it distinctly.
  let smartGuideCenterEps = 0.75;
  function taggedGuide(guide, centerValue) {
    return { value: guide.value, kind: Math.abs(guide.value - centerValue) <= smartGuideCenterEps ? 'center' : 'edge' };
  }
  let rulerMarkersX = $derived(
    activeSmartGuides.filter((g) => g.axis === 'x').map((g) => taggedGuide(g, artboardWidth / 2))
  );
  let rulerMarkersY = $derived(
    activeSmartGuides.filter((g) => g.axis === 'y').map((g) => taggedGuide(g, artboardHeight / 2))
  );
  function isCenterGuide(guide) {
    const centerValue = guide.axis === 'x' ? artboardWidth / 2 : artboardHeight / 2;
    return Math.abs(guide.value - centerValue) <= smartGuideCenterEps;
  }
  // Distance readouts between exactly two selected layers.
  let measureEnabled = $state(false);
  // '?'-toggled overlay listing shortcuts plus a plain-language glossary.
  let helpOverlayOpen = $state(false);
  let surfaceShellEl = $state(null);
  // Inline readiness nudge: open required/recommended steps, dismissible.
  let readinessNudgeDismissed = $state(false);
  let readinessNudgeSteps = $derived.by(() => {
    if (!control) return [];
    return analyzeCustomComponentReadiness(control).steps
      .filter((step) => !step.done && ['required', 'recommended'].includes(step.severity));
  });
  let artboardWidth = $derived(Math.max(1, numberOr(transform?.width, 220)));
  let artboardHeight = $derived(Math.max(1, numberOr(transform?.height, 120)));
  let artboardStyle = $derived(`width:${artboardWidth}px; height:${artboardHeight}px; transform:scale(${surfaceZoom});`);
  let surfaceGridStyle = $derived(`--surface-grid-size:${Math.max(4, snapSize * surfaceZoom)}px;`);
  let showBounds = $derived(preview?.showBounds !== false);
  let showHitZones = $derived(preview?.showHitZones === true);
  let showGeneratedLabels = $derived(preview?.showGeneratedLabels === true);
  let designerPreviewing = $derived(String(preview?.mode ?? 'edit') === 'preview');
  let livePreviewSession = $state(null);
  let livePreviewControlId = $state('');
  let topDownPartEntries = $derived([...allPartEntries].sort((left, right) => Number(right?.[1]?.zIndex ?? 0) - Number(left?.[1]?.zIndex ?? 0)));
  let kitEntries = $derived.by(() => {
    const kits = new Map();
    for (const [name, part] of Object.entries(parts?._children ?? {})) {
      const kitId = kitIdFor(part);
      if (!kitId) continue;
      const entry = kits.get(kitId) ?? {
        id: kitId,
        label: part?.meta?.kitLabel ?? kitId,
        kind: part?.meta?.kitKind ?? 'kit',
        control: part?.meta?.valueControl ?? null,
        layerNames: [],
        zoneNames: [],
      };
      entry.layerNames.push(name);
      kits.set(kitId, entry);
    }
    for (const [name, zone] of Object.entries(hitZones?._children ?? {})) {
      const kitId = kitIdFor(zone);
      if (!kitId) continue;
      const entry = kits.get(kitId) ?? {
        id: kitId,
        label: zone?.meta?.kitLabel ?? kitId,
        kind: zone?.meta?.kitKind ?? 'kit',
        control: zone?.meta?.valueControl ?? null,
        layerNames: [],
        zoneNames: [],
      };
      entry.zoneNames.push(name);
      kits.set(kitId, entry);
    }
    return [...kits.values()];
  });
  let generatedSourceEntries = $derived.by(() => buildGeneratedSourceEntries());
  let topLevelPartEntries = $derived(topDownPartEntries.filter(([, part]) => {
    const source = generatedSourceForNode(part);
    return !kitIdFor(part) && (!source || !isGeneratedSourceCollapsed(source));
  }));
  let dockHitZoneEntries = $derived(hitZoneEntries.filter(([, zone]) => {
    const source = generatedSourceForNode(zone);
    return !source || !isGeneratedSourceCollapsed(source);
  }));
  let overlayPartEntries = $derived(partEntries.filter(([name, part]) => !kitIdFor(part) || selectedLayerSet.has(name)));
  let selectedKitEntry = $derived(kitEntries.find((entry) => entry.id === selectedKit) ?? null);
  let selectedKitFrame = $derived.by(() => kitFrame(selectedKitEntry));
  let selectedPart = $derived(parts?._children?.[selectedLayer] ?? null);
  let selectedAuthoredPart = $derived(authoredParts?._children?.[selectedLayer] ?? null);
  let selectedZone = $derived(hitZones?._children?.[selectedHitZone] ?? null);
  let selectedAuthoredZone = $derived(authoredHitZones?._children?.[selectedHitZone] ?? null);
  let activeSelectionKind = $derived(
    selectedSurfaceKind === 'artboard'
      ? 'artboard'
      : (selectedSurfaceKind === 'kit' && selectedKitEntry ? 'kit'
        : (selectedSurfaceKind === 'hitZone' && selectedZone ? 'hitZone' : 'layer'))
  );
  let multiSelectionActive = $derived(activeSelectionKind === 'layer' && selectedLayerNames.length > 1);
  // Distance readouts between exactly two selected layers ("Measure" toggle).
  let measurementLines = $derived.by(() => {
    if (!measureEnabled || designerPreviewing) return [];
    if (activeSelectionKind !== 'layer' || selectedLayerNames.length !== 2) return [];
    const [frameA, frameB] = selectedLayerNames.map((name) => (
      parts?._children?.[name] ? partFrame(parts._children[name]) : null
    ));
    return measurementLinesBetween(frameA, frameB);
  });
  let selectedPartEditable = $derived(isEditablePart(selectedAuthoredPart));
  let selectedZoneEditable = $derived(isEditableZone(selectedAuthoredZone));
  let selectedBackground = $derived(selectedAuthoredPart?._children?.Background ?? null);
  let selectedText = $derived(selectedAuthoredPart?._children?.Text ?? null);
  let selectedFill = $derived(selectedBackground?._children?.Fill ?? null);
  let selectedBorder = $derived(selectedBackground?._children?.Border ?? null);
  let selectedCorners = $derived(selectedBackground?._children?.Corners ?? null);
  let selectedTextFill = $derived(selectedText?._children?.Fill ?? null);
  let selectedTextFont = $derived(selectedText?._children?.Font ?? null);
  let canPaintLayer = $derived(activeSelectionKind === 'layer' && selectedPart && selectedPartEditable);
  let canManageLayer = $derived(activeSelectionKind === 'layer' && selectedAuthoredPart);
  let canDetachLayer = $derived(
    activeSelectionKind === 'layer'
      && selectedPart
      && !selectedPartEditable
      && (selectedPart?.generated === true || selectedPart?.meta?.generated === true)
  );
  let selectedFrame = $derived(selectedPart ? partFrame(selectedPart) : null);
  let selectedZoneFrame = $derived(selectedZone ? displayZoneFrame(selectedZone) : null);
  let activeFrame = $state(null);
  let activeLayerFrames = $state.raw({});
  let activeZoneFrame = $state(null);
  let interaction = $state(null);
  let activeTool = $state('select');
  let lastShapeTool = $state('rectangle');
  let shapeFlyoutOpen = $state(false);
  let interactiveFlyoutOpen = $state(false);
  let starterFlyoutOpen = $state(false);
  let assistantFlyoutOpen = $state(false);
  let interactiveArchetype = $state('dial');
  let drawDraft = $state(null);
  let drawNotice = $state('');
  let drawNoticeTimer = null;
  let lastDrawCreatedAt = 0;
  let zoneDisplayMode = $state('selected');
  let arpTool = $state('draw');
  let selectionPulseTarget = $state('');
  let selectionPulseTimer = null;
  let surfaceScrollEl = $state(null);
  let draggingLayerName = $state('');
  let spacePanActive = $state(false);
  let surfacePan = $state(null);
  let inlineTextEditLayer = $state('');
  let inspectorTab = $state('object');
  let filmstripCollapsed = $state(false);
  // Pane visibility toggles (mirrors the normal editor's bottom-left icons).
  let paletteCollapsed = $state(false);
  let dockHidden = $state(false);
  let displayDockHidden = $state(false);
  // Bottom zoom bar (mirrors the Panel Designer's ZoomBar, wired to surfaceZoom).
  let surfaceZoomIncrement = $state(10);
  let zoomEditing = $state(false);
  let zoomEditValue = $state('100');
  let surfaceShowRulers = $state(true);
  // Scripts section in the top Look bar (a custom component can carry scripts).
  let componentScripts = $derived(getSection(control, 'Scripts'));
  let componentScriptList = $derived(Array.isArray(componentScripts?.scripts) ? componentScripts.scripts : []);
  let componentScriptsEnabled = $derived(componentScripts?.enabled !== false);
  let surfaceGridCols = $derived(
    `${paletteCollapsed ? '--palette-w:46px;' : ''}${dockHidden ? '--dock-w:0px;' : ''}`
  );
  let rulerViewWidth = $state(0);
  let rulerViewHeight = $state(0);
  // Rendered top-left of the (centered, zoomed) artboard within the scroll content.
  // Used as the ruler origin so 0,0 tracks the artboard corner. Defaults match the
  // surface padding so the first paint is sensible before measurement runs.
  let boardOffsetX = $state(112);
  let boardOffsetY = $state(96);

  // The artboard is flex-centered and scaled via transform, so its real position
  // shifts with zoom and viewport size — measure it instead of assuming a fixed
  // padding offset, otherwise ruler 0,0 drifts off the artboard corner.
  function measureBoardOffset() {
    if (!surfaceScrollEl) return;
    const board = surfaceScrollEl.querySelector('.artboard');
    if (!board) return;
    const b = board.getBoundingClientRect();
    const s = surfaceScrollEl.getBoundingClientRect();
    // Measure the artboard's LIVE VISUAL top-left relative to the scroll
    // viewport's top-left. Both rulers are inset 20px and the scroll area is
    // inset 20px too, so each ruler's 0 sits exactly on the scroll viewport's
    // corner — which makes this delta the on-screen pixel where ruler-0 must
    // land. getBoundingClientRect already folds in centering, the zoom
    // transform, AND the current scroll, so we pass scrollOffset=0 to the
    // rulers and just re-measure this (cheap) on scroll. The old approach
    // added scrollLeft/Top back in and subtracted it again in the ruler, which
    // drifted whenever the board was flex-centered rather than scrolled.
    boardOffsetX = b.left - s.left;
    boardOffsetY = b.top - s.top;
  }

  $effect(() => {
    // Re-measure whenever anything that repositions or rescales the artboard changes.
    const deps = `${surfaceZoom}:${artboardWidth}:${artboardHeight}:${rulerViewWidth}:${rulerViewHeight}`;
    void deps;
    // Defer to after layout/paint so flex-centering + scrollbars have settled;
    // measuring synchronously catches a pre-centering position that never
    // corrects itself.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(measureBoardOffset);
    else measureBoardOffset();
  });
  let authoredPartNames = $derived(Object.keys(authoredParts?._children ?? {}));
  let valueChannelEntries = $derived(Object.entries(valueChannels?._children ?? {}));
  let behaviorEntries = $derived(Object.entries(behaviors?._children ?? {}));
  let bindingEntries = $derived(Object.entries(bindings?._children ?? {}));
  let generatorEntries = $derived(Object.entries(generators?._children ?? {}));
  let stateEntries = $derived(Object.entries(states?._children ?? {}));
  let stateFilmstripEntries = $derived([
    { name: 'base', state: null, base: true },
    ...stateEntries.map(([name, state]) => ({ name, state, base: false })),
  ]);
  let statePreviewCards = $derived.by(() => stateFilmstripEntries.map((entry, index) => statePreviewCard(entry, index)));
  let activeSelectionName = $derived(activeSelectionKind === 'kit' ? selectedKit : (activeSelectionKind === 'hitZone' ? selectedHitZone : selectedLayer));
  let activeSelectionLabel = $derived.by(() => {
    if (activeSelectionKind === 'artboard') return 'Artboard';
    if (activeSelectionKind === 'kit' && selectedKitEntry) return selectedKitEntry.label;
    if (multiSelectionActive) return `${selectedLayerNames.length} layers`;
    if (activeSelectionKind === 'hitZone' && selectedZone) return selectedHitZone;
    if (selectedPart) return selectedLayer;
    return 'No selection';
  });
  let activeSelectionDescription = $derived.by(() => {
    if (activeSelectionKind === 'artboard') return `${Math.round(artboardWidth)} x ${Math.round(artboardHeight)} workspace`;
    if (activeSelectionKind === 'kit' && selectedKitEntry) {
      const zoneLabel = selectedKitEntry.zoneNames.length === 1 ? 'zone' : 'zones';
      const style = valueControlStyleLabel(selectedKitEntry.control?.style);
      return `${style} / ${selectedKitEntry.layerNames.length} layers / ${selectedKitEntry.zoneNames.length} ${zoneLabel}`;
    }
    if (multiSelectionActive) return 'Multi-selection';
    if (activeSelectionKind === 'hitZone' && selectedZone) {
      return `${selectedZone?.shape ?? 'zone'} / ${selectedZone?.action ?? 'action'}`;
    }
    if (selectedPart) return `${selectedPart?.kind ?? selectedPart?.role ?? 'part'} layer`;
    return 'Pick a layer or hit zone on the canvas';
  });
  let surfaceNameTrayEntries = $derived.by(() => {
    const entries = [];
    const seen = new Set();
    const add = (kind, label) => {
      const clean = String(label ?? '').trim();
      if (!clean) return;
      const key = `${kind}:${clean}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ kind, label: clean });
    };

    if (hoveredSurfaceItem?.name) {
      add(hoveredSurfaceItem.kind, hoveredSurfaceItem.name);
    }
    if (activeSelectionKind === 'kit' && selectedKitEntry) {
      add('kit', selectedKitEntry.label);
    } else if (activeSelectionKind === 'hitZone' && selectedHitZone) {
      add('hitZone', selectedHitZone);
    } else if (multiSelectionActive) {
      add('layer', `${selectedLayerNames.length} layers`);
    } else if (activeSelectionKind === 'layer' && selectedLayer) {
      add('layer', selectedLayer);
    }

    return entries;
  });

  // Dock inspector = per-object + spatial concerns only (Stage B8). The
  // component-wide States/API/Bindings lists moved to their panel homes.
  const INSPECTOR_TABS = [
    { id: 'object', label: 'Object' },
    { id: 'display', label: 'Display' },
    { id: 'behavior', label: 'Behavior' },
    { id: 'states', label: 'Preview' },
  ];

  const RESIZE_HANDLES = [
    { id: 'tl', cursor: 'nwse-resize' },
    { id: 't', cursor: 'ns-resize' },
    { id: 'tr', cursor: 'nesw-resize' },
    { id: 'r', cursor: 'ew-resize' },
    { id: 'br', cursor: 'nwse-resize' },
    { id: 'b', cursor: 'ns-resize' },
    { id: 'bl', cursor: 'nesw-resize' },
    { id: 'l', cursor: 'ew-resize' },
  ];
  const DRAW_TOOLS = [
    { id: 'select', label: 'Select', key: 'V' },
    { id: 'rectangle', label: 'Rectangle', key: 'R' },
    { id: 'roundedRectangle', label: 'Rounded', key: 'U' },
    { id: 'ellipse', label: 'Ellipse', key: 'O' },
    { id: 'ring', label: 'Ring', key: 'G' },
    { id: 'arcTrack', label: 'Arc', key: 'A' },
    { id: 'capsule', label: 'Capsule', key: 'C' },
    { id: 'hitZone', label: 'Hit Zone', key: 'H' },
    { id: 'interactive', label: 'Interactive', key: 'I' },
    { id: 'text', label: 'Text', key: 'T' },
    // Lines & polygons (drawn as SVG vector shapes via shapeGeometry).
    { id: 'line', label: 'Line', key: 'L' },
    { id: 'triangle', label: 'Triangle', key: '' },
    { id: 'rightTriangle', label: 'Right triangle', key: '' },
    { id: 'parallelogram', label: 'Parallelogram', key: '' },
    { id: 'trapezoid', label: 'Trapezoid', key: '' },
    { id: 'diamond', label: 'Diamond', key: '' },
    { id: 'pentagon', label: 'Pentagon', key: '' },
    { id: 'hexagon', label: 'Hexagon', key: '' },
    { id: 'star', label: 'Star', key: '' },
    { id: 'chevron', label: 'Chevron', key: '' },
    { id: 'arrow', label: 'Arrow', key: '' },
    { id: 'plus', label: 'Plus', key: '' },
  ];
  // Arpeggiator tool modes and their 1–5 shortcuts (shown in the toolbar +
  // cheatsheet; handled in handleSurfaceKeydown while an arp surface is active).
  const ARP_TOOLS = ['select', 'draw', 'move', 'resize', 'velocity'];
  const ARP_TOOL_KEYS = Object.fromEntries(ARP_TOOLS.map((tool, index) => [String(index + 1), tool]));

  // Shortcut cheatsheet + glossary live in SurfaceHelpOverlay.svelte.
  const POLYGON_TOOL_IDS = ['triangle', 'rightTriangle', 'parallelogram', 'trapezoid', 'diamond', 'pentagon', 'hexagon', 'star', 'chevron', 'arrow', 'plus'];
  // "Lines & Polygons" palette section: line first, then the flat polygons.
  const VECTOR_SHAPE_TOOL_IDS = ['line', ...POLYGON_TOOL_IDS];
  // SHAPE_TOOL_IDS stays the 6 "Basic" shapes — it drives the bottom tool-strip's
  // Shape flyout. Lines/polygons are drawn directly from the left palette.
  const SHAPE_TOOL_IDS = new Set(['rectangle', 'roundedRectangle', 'ellipse', 'ring', 'arcTrack', 'capsule']);
  const SHAPE_TOOLS = DRAW_TOOLS.filter((tool) => SHAPE_TOOL_IDS.has(tool.id));
  const VECTOR_SHAPE_TOOLS = DRAW_TOOLS.filter((tool) => VECTOR_SHAPE_TOOL_IDS.includes(tool.id));
  const INTERACTIVE_ARCHETYPES = [
    { id: 'dial', label: 'Dial' },
    { id: 'slider', label: 'Slider' },
    { id: 'button', label: 'Button' },
    { id: 'toggle', label: 'Toggle' },
    { id: 'xy', label: 'XY Pad' },
    { id: 'range', label: 'Range' },
  ];
  let activeToolMeta = $derived(DRAW_TOOLS.find((tool) => tool.id === activeTool) ?? DRAW_TOOLS[0]);
  let activeInteractiveMeta = $derived(INTERACTIVE_ARCHETYPES.find((a) => a.id === interactiveArchetype) ?? INTERACTIVE_ARCHETYPES[0]);

  $effect(() => {
    componentDesignerStatus.set({
      kind: activeSelectionKind === 'artboard' ? 'Artboard' : (activeSelectionKind === 'kit' ? 'Kit' : (activeSelectionKind === 'hitZone' ? 'Hit Zone' : 'Layer')),
      tool: activeToolMeta?.label ?? 'Select',
      layer: selectedPart ? selectedLayer : 'none',
      zone: selectedZone ? selectedHitZone : 'none',
      artboard: `${Math.round(artboardWidth)} x ${Math.round(artboardHeight)}`,
      layerCount: allPartEntries.length,
      zoneCount: hitZoneEntries.length,
      lockedNote: activeSelectionKind === 'layer' && selectedPart && selectedAuthoredPart?.locked === true
        ? 'Locked'
        : '',
      previewMode: designerPreviewing ? 'preview' : 'edit',
      warning: activeSelectionKind === 'layer' && selectedPart && !selectedPartEditable
        ? 'Generated part'
        : '',
    });
  });

  let lastPreviewRequestToken = $state(0);
  $effect(() => {
    const request = $componentDesignerPreviewRequest;
    if (!request?.token || request.token === lastPreviewRequestToken) return;
    lastPreviewRequestToken = request.token;
    if (request.mode === 'preview') {
      applyControlPatch(core.id, {
        'Designer.preview.mode': 'preview',
        'Designer.preview.showBounds': false,
        'Designer.preview.showHitZones': false,
      });
    } else if (request.mode === 'edit') {
      applyControlPatch(core.id, {
        'Designer.preview.mode': 'edit',
        'Designer.preview.showBounds': true,
        'Designer.preview.showHitZones': true,
      });
    }
  });

  onDestroy(() => {
    componentDesignerStatus.set({
      kind: '',
      tool: '',
      layer: '',
      zone: '',
      warning: '',
      artboard: '',
      layerCount: 0,
      zoneCount: 0,
      lockedNote: '',
      previewMode: 'edit',
    });
  });
  let activeShapeTool = $derived(SHAPE_TOOLS.find((tool) => tool.id === lastShapeTool) ?? SHAPE_TOOLS[0]);
  let shapeToolActive = $derived(SHAPE_TOOL_IDS.has(activeTool));
  let selectedArcMeta = $derived(selectedAuthoredPart?.meta?.arcTrack ?? null);
  let selectedIsArc = $derived(activeSelectionKind === 'layer' && selectedPartEditable && !!selectedArcMeta);
  // Waveform-icon / envelope-path parts get preset strips (color + shape).
  let selectedIsWaveformIcon = $derived(
    activeSelectionKind === 'layer' && selectedPartEditable
    && (String(selectedPart?.kind ?? '').toLowerCase() === 'waveformicon'
      || String(selectedPart?.meta?.renderer ?? '').toLowerCase() === 'waveformicon')
  );
  let selectedIsEnvelopePath = $derived(
    activeSelectionKind === 'layer' && selectedPartEditable
    && (String(selectedPart?.kind ?? '').toLowerCase() === 'envelopepath'
      || String(selectedPart?.meta?.renderer ?? '').toLowerCase() === 'envelopepath')
  );
  let selectedWaveformMeta = $derived(selectedAuthoredPart?.meta?.waveformIcon ?? selectedPart?.meta?.waveformIcon ?? null);
  let selectedEnvelopeMeta = $derived(selectedAuthoredPart?.meta?.envelopePath ?? selectedPart?.meta?.envelopePath ?? null);

  function applyRendererPreset(patch) {
    if (!core?.id || !selectedLayer || !Object.keys(patch ?? {}).length) return;
    applyControlPatch(core.id, patch);
  }
  let selectedArcPivotTarget = $derived.by(() => nearestArcPivotTarget());
  let arpeggiator = $derived.by(() => normalizeArpeggiator(designer?.arpeggiator));
  let arpeggiatorEnabled = $derived(arpeggiator?.enabled === true);
  let arpBlocks = $derived(Array.isArray(arpeggiator?.blocks) ? arpeggiator.blocks : []);
  let arpStepCount = $derived(Math.max(1, Math.min(256, Math.round(numberOr(arpeggiator?.stepCount, 32)))));
  let arpViewNote = $derived(Math.max(0, Math.min(116, Math.round(numberOr(arpeggiator?.viewNote, 60)))));
  let arpSelectedBlock = $derived(String(arpeggiator?.selectedBlock ?? ''));
  let zoneOverlayEntries = $derived.by(() => {
    if (!showHitZones) return [];
    if (zoneDisplayMode === 'selected') {
      return selectedHitZone && hitZoneEntries.some(([name]) => name === selectedHitZone)
        ? hitZoneEntries.filter(([name]) => name === selectedHitZone)
        : [];
    }
    return hitZoneEntries;
  });
  let feedbackFrame = $derived.by(() => {
    if (drawDraft) return snapFrame(draftRect(drawDraft));
    if (activeFrame) return activeFrame;
    if (activeZoneFrame) return activeZoneFrame;
    return null;
  });
  let feedbackMode = $derived.by(() => {
    if (drawDraft) return drawDraft?.constrain ? 'Draw locked' : 'Draw';
    if (interaction?.type === 'move') return 'Move';
    if (interaction?.type === 'resize') return interaction?.handle ? `Resize ${interaction.handle.toUpperCase()}` : 'Resize';
    if (interaction?.type === 'zoneMove') return 'Zone move';
    if (interaction?.type === 'zoneResize') return interaction?.handle ? `Zone resize ${interaction.handle.toUpperCase()}` : 'Zone resize';
    return '';
  });
  let activeSelectionFrame = $derived.by(() => {
    if (activeSelectionKind === 'kit') return selectedKitFrame;
    if (activeSelectionKind === 'hitZone') return activeZoneFrame ?? selectedZoneFrame;
    if (multiSelectionActive) return multiSelectionBounds();
    return activeFrame ?? selectedFrame;
  });

  function setActiveTool(toolId) {
    const id = String(toolId ?? 'select');
    if (!DRAW_TOOLS.some((tool) => tool.id === id)) return;
    activeTool = id;
    if (SHAPE_TOOL_IDS.has(id)) lastShapeTool = id;
    shapeFlyoutOpen = false;
    cancelDraw();
    if (core?.id && id !== 'select') {
      inlineTextEditLayer = '';
      localSelectedLayerNames = [];
      applyControlPatch(core.id, {
        'Designer.selectedSurfaceKind': 'layer',
        'Designer.selectedHitZone': '',
        'Designer.selectedKit': '',
      });
    }
  }

  function toggleShapeFlyout(event) {
    event?.stopPropagation?.();
    shapeFlyoutOpen = !shapeFlyoutOpen;
    interactiveFlyoutOpen = false;
    starterFlyoutOpen = false;
    assistantFlyoutOpen = false;
    if (shapeFlyoutOpen && !SHAPE_TOOL_IDS.has(activeTool)) {
      activeTool = lastShapeTool;
      cancelDraw();
    }
  }

  function toggleInteractiveFlyout(event) {
    event?.stopPropagation?.();
    interactiveFlyoutOpen = !interactiveFlyoutOpen;
    shapeFlyoutOpen = false;
    starterFlyoutOpen = false;
    assistantFlyoutOpen = false;
    if (interactiveFlyoutOpen && activeTool !== 'interactive') {
      setActiveTool('interactive');
      interactiveFlyoutOpen = true;
    }
  }

  // Starters + Assistant recipes moved here from the dissolved Designer tab
  // (Stage B4) — creation flows live on the surface, not in a properties tab.
  function toggleStarterFlyout(event) {
    event?.stopPropagation?.();
    starterFlyoutOpen = !starterFlyoutOpen;
    assistantFlyoutOpen = false;
    shapeFlyoutOpen = false;
    interactiveFlyoutOpen = false;
  }

  function toggleAssistantFlyout(event) {
    event?.stopPropagation?.();
    assistantFlyoutOpen = !assistantFlyoutOpen;
    starterFlyoutOpen = false;
    shapeFlyoutOpen = false;
    interactiveFlyoutOpen = false;
  }

  function applyStarterFromFlyout(event, starter) {
    event?.stopPropagation?.();
    starterFlyoutOpen = false;
    if (!core?.id || !starter) return;
    applyControlPatch(core.id, createCustomComponentStarterPatch(starter.id));
  }

  function applyRecipeFromFlyout(event, recipe) {
    event?.stopPropagation?.();
    assistantFlyoutOpen = false;
    if (!core?.id || !recipe) return;
    const patch = buildRecipePatch(control, recipe);
    if (patch) applyControlPatch(core.id, patch);
  }

  function selectInteractiveArchetype(event, id) {
    event?.stopPropagation?.();
    interactiveArchetype = id;
    setActiveTool('interactive');
  }

  function normalizeArpeggiator(value = {}) {
    return normalizeCustomArpeggiator(value);
  }

  function withArpPatch(patch = {}) {
    if (!core?.id) return;
    const next = normalizeArpeggiator({ ...arpeggiator, ...patch, enabled: true });
    updateControlProperty(core.id, 'Designer.arpeggiator', next);
  }

  function setArpBlocks(blocks, selectedBlock = arpSelectedBlock) {
    withArpPatch({ blocks, selectedBlock });
  }

  function setArpStepCount(value) {
    if (!core?.id) return;
    const stepCount = Math.max(1, Math.min(256, Math.round(numberOr(value, 32))));
    const blocks = arpBlocks
      .map((block) => ({
        ...block,
        step: Math.min(block.step, stepCount - 1),
        length: Math.max(1, Math.min(block.length, stepCount - Math.min(block.step, stepCount - 1))),
      }))
      .filter((block) => block.step < stepCount);
    const nextArp = normalizeArpeggiator({ ...arpeggiator, stepCount, blocks, enabled: true });
    applyControlPatch(core.id, {
      'Designer.arpeggiator': nextArp,
      'ValueChannels.arpCurrentStep.max': stepCount - 1,
      'ValueChannels.arpStepCount.defaultValue': stepCount,
      'ValueChannels.arpStepCount.currentValue': stepCount,
      'PublishedProperties.inputs.arpCurrentStep.max': stepCount - 1,
      'PublishedProperties.outputs.arpCurrentStep.max': stepCount - 1,
      'PublishedProperties.editableProperties.arpSteps.defaultValue': stepCount,
    });
  }

  function shiftArpOctave(direction) {
    withArpPatch({ viewNote: clampNumber(arpViewNote + (direction * 12), 0, 116) });
  }

  function selectArpBlock(id) {
    withArpPatch({ selectedBlock: String(id ?? '') });
  }

  function removeSelectedArpBlock() {
    if (!arpSelectedBlock) return;
    setArpBlocks(arpBlocks.filter((block) => block.id !== arpSelectedBlock), '');
  }

  $effect(() => {
    const nextId = String(core?.id ?? '');
    if (!nextId) {
      livePreviewControlId = '';
      livePreviewSession = null;
      return;
    }
    if (nextId !== livePreviewControlId) {
      livePreviewControlId = nextId;
      livePreviewSession = createInteractionPreviewSession(control);
    }
  });

  function patchLivePreviewSession(patch = {}) {
    if (!control) return;
    const base = createInteractionPreviewSession(control);
    const previous = livePreviewSession ?? base;
    livePreviewSession = {
      ...base,
      ...previous,
      ...patch,
      customValues: patch.customValues
        ? { ...(previous.customValues ?? base.customValues ?? {}), ...(patch.customValues ?? {}) }
        : (previous.customValues ?? base.customValues ?? {}),
    };
  }

  function partFrame(part) {
    return partFrameBase(part, artboardWidth, artboardHeight);
  }

  function canManagePartName(name) {
    return !!authoredParts?._children?.[name];
  }

  function isGeneratedSourceCollapsed(source) {
    if (!source) return false;
    return collapsedGeneratedSources[source] !== false;
  }

  function toggleGeneratedSource(source, event = null) {
    event?.stopPropagation?.();
    if (!source) return;
    collapsedGeneratedSources = {
      ...collapsedGeneratedSources,
      [source]: !isGeneratedSourceCollapsed(source),
    };
  }

  function buildGeneratedSourceEntries() {
    const groups = new Map();
    const ensure = (source) => {
      const key = source || 'generated';
      if (!groups.has(key)) {
        groups.set(key, {
          source: key,
          partNames: [],
          zoneNames: [],
          hasGenerator: Boolean(generators?._children?.[key]),
        });
      }
      return groups.get(key);
    };
    for (const [name, part] of topDownPartEntries) {
      if (kitIdFor(part)) continue;
      const source = generatedSourceForNode(part);
      if (!source) continue;
      ensure(source).partNames.push(name);
    }
    for (const [name, zone] of hitZoneEntries) {
      if (kitIdFor(zone)) continue;
      const source = generatedSourceForNode(zone);
      if (!source) continue;
      ensure(source).zoneNames.push(name);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      collapsed: isGeneratedSourceCollapsed(group.source),
      label: generators?._children?.[group.source]?.label ?? group.source,
      partCount: group.partNames.length,
      zoneCount: group.zoneNames.length,
    }));
  }

  function editGeneratorForLayer(name, part, event = null) {
    event?.stopPropagation?.();
    if (!core?.id || !name) return;
    const generatorName = generatorNameForEntry(part);
    if (!generatorName || !generators?._children?.[generatorName]) return;
    dockTab = 'generators';
    applyControlPatch(core.id, {
      'Designer.selectedLayer': name,
      'Designer.selectedSurfaceKind': 'layer',
      'Designer.selectedHitZone': '',
      'Designer.selectedKit': '',
      'Designer.selectedGenerator': generatorName,
    });
  }

  function kitFrame(kit) {
    if (!kit?.layerNames?.length) return null;
    return boundsForFrames(
      kit.layerNames
        .map((name) => parts?._children?.[name] ? partFrame(parts._children[name]) : null)
        .filter(Boolean)
    );
  }

  function nextPartName(base) {
    return uniqueNodeName(base, new Set(authoredPartNames), 'layer');
  }

  function nextHitZoneName(base = 'hitZone') {
    return uniqueNodeName(base, new Set(Object.keys(authoredHitZones?._children ?? {})), 'hitZone');
  }

  function nextValueChannelName(base = 'valueControl') {
    return uniqueNodeName(base, new Set(Object.keys(valueChannels?._children ?? {})), 'valueControl');
  }

  function nextBehaviorName(base = 'valueDrag') {
    return uniqueNodeName(base, new Set(Object.keys(behaviors?._children ?? {})), 'valueDrag');
  }

  function nextKitName(base = 'kit') {
    return uniqueNodeName(base, new Set(kitEntries.map((entry) => entry.id)), 'kit');
  }

  function frameFromClick(point, tool = activeTool) {
    const size = defaultDrawSize(tool);
    return snapFrame({
      left: Math.max(0, Math.min(artboardWidth - size.width, point.x - size.width / 2)),
      top: Math.max(0, Math.min(artboardHeight - size.height, point.y - size.height / 2)),
      width: size.width,
      height: size.height,
    });
  }

  function frameForPart(name, part) {
    if (activeLayerFrames?.[name]) return activeLayerFrames[name];
    return activeSelectionKind === 'layer' && name === selectedLayer && activeFrame
      ? activeFrame
      : partFrame(part);
  }

  function isTinyPart(name, part) {
    return isTinyFrame(frameForPart(name, part));
  }

  function renderPartForFrame(name, part) {
    const frame = activeLayerFrames?.[name] ?? (activeSelectionKind === 'layer' && name === selectedLayer ? activeFrame : null);
    if (!frame) return part;
    const layout = part?._children?.Layout ?? {};
    return {
      ...part,
      _children: {
        ...(part?._children ?? {}),
        Layout: {
          ...layout,
          mode: 'absolute',
          x: frame.left,
          y: frame.top,
          width: frame.width,
          height: frame.height,
          xUnit: 'px',
          yUnit: 'px',
          widthUnit: 'px',
          heightUnit: 'px',
          anchorX: 'left',
          anchorY: 'top',
          offsetX: 0,
          offsetY: 0,
        },
      },
    };
  }

  function nearestArcPivotTarget() {
    if (activeSelectionKind !== 'layer' || !selectedPart || !selectedFrame) return null;
    const selectedCenter = frameCenter(selectedFrame);
    const candidates = Object.entries(parts?._children ?? {})
      .filter(([name, part]) => name !== selectedLayer && part?.visible !== false && isArcCenterPart(part))
      .map(([name, part]) => {
        const frame = partFrame(part);
        const center = frameCenter(frame);
        return {
          name,
          frame,
          center,
          distance: Math.hypot(center.x - selectedCenter.x, center.y - selectedCenter.y),
        };
      })
      .sort((left, right) => left.distance - right.distance);
    return candidates[0] ?? null;
  }

  function statePreviewCard(entry, index = 0) {
    const stateName = entry?.name ?? 'base';
    const scopedControl = entry?.base ? control : resolveStateScopedControl(control, stateName);
    const materialized = materializedCustomComponentSnapshot(scopedControl, previewSignals({
      ...preview,
      state: stateName,
    }));
    const previewTransform = getSection(materialized, 'Transform') ?? transform ?? {};
    const previewWidth = Math.max(1, numberOr(previewTransform?.width, artboardWidth));
    const previewHeight = Math.max(1, numberOr(previewTransform?.height, artboardHeight));
    const previewParts = Object.entries(getSection(materialized, 'Parts')?._children ?? {})
      .filter(([, part]) => part?.visible !== false)
      .sort((left, right) => Number(left?.[1]?.zIndex ?? 0) - Number(right?.[1]?.zIndex ?? 0));
    return {
      ...entry,
      index,
      previewWidth,
      previewHeight,
      previewParts,
    };
  }

  function selectStateCard(name) {
    if (!core?.id) return;
    const stateName = String(name || 'base');
    setPreviewFlag('state', stateName);
    updateControlProperty(core.id, 'Designer.selectedState', stateName);
  }

  function nextStateName(base = 'State') {
    return uniqueNodeName(base, new Set(Object.keys(states?._children ?? {})), 'State');
  }

  function addQuickState(event = null) {
    event?.stopPropagation?.();
    if (!core?.id) return;
    const candidates = ['Hover', 'Active', 'Pressed', 'Editing', 'Disabled', 'Focused'];
    const existing = new Set(Object.keys(states?._children ?? {}));
    const name = candidates.find((candidate) => !existing.has(candidate)) ?? nextStateName('State');
    updateControlProperty(core.id, `States.${name}`, {
      _type: 'State',
      name,
      group: 'interaction',
      description: '',
      enabled: true,
      when: {},
      patches: {
        component: {},
        parts: {},
      },
    });
    selectStateCard(name);
  }

  function setFilmstripStateWhen(stateName, flag, value) {
    if (!core?.id || !stateName || stateName === 'base') return;
    updateControlProperty(core.id, `States.${stateName}.when.${flag}`, value);
  }

  function duplicateStateCard(name, state, event = null) {
    event?.stopPropagation?.();
    if (!core?.id) return;
    if (!state || name === 'base') {
      addQuickState(event);
      return;
    }
    const nextName = nextStateName(`${name}_copy`);
    updateControlProperty(core.id, `States.${nextName}`, {
      ...cloneValue(state),
      name: nextName,
    });
    selectStateCard(nextName);
  }

  function removeStateCard(name, event = null) {
    event?.stopPropagation?.();
    if (!core?.id || !name || name === 'base') return;
    removeControlNode(core.id, `States.${name}`);
    if (designer?.preview?.state === name) selectStateCard('base');
  }

  function layerThumbPartStyle(name, part) {
    return layerThumbPartStyleBase(frameForPart(name, part), part, artboardWidth, artboardHeight);
  }

  function zoneThumbPartStyle(name, zone) {
    return zoneThumbPartStyleBase(zoneFrame(zone), zone, artboardWidth, artboardHeight);
  }

  function isLayerSelected(name) {
    return activeSelectionKind === 'layer' && selectedLayerSet.has(name);
  }

  function selectedEditableLayerEntries() {
    return selectedLayerNames
      .map((name) => [name, authoredParts?._children?.[name], parts?._children?.[name]])
      .filter(([, authoredPart, part]) => part && isEditablePart(authoredPart));
  }

  function multiSelectionBounds() {
    if (!selectedLayerNames.length) return null;
    return boundsForFrames(
      selectedLayerNames
        .map((name) => activeLayerFrames?.[name] ?? (parts?._children?.[name] ? partFrame(parts._children[name]) : null))
        .filter(Boolean)
    );
  }

  function pointInArtboard(event) {
    const artboard = event.currentTarget?.classList?.contains?.('artboard')
      ? event.currentTarget
      : event.currentTarget?.closest?.('.artboard');
    return pointInArtboardFromElement(event, artboard, artboardWidth, artboardHeight, surfaceZoom);
  }

  function snapValue(value, event = null) {
    if (!snapEnabled || event?.altKey) return value;
    const size = Math.max(1, numberOr(snapSize, 10));
    return Math.round(value / size) * size;
  }

  function snapFrame(frame, event = null) {
    if (!frame || !snapEnabled || event?.altKey) return frame;
    return {
      left: snapValue(frame.left, event),
      top: snapValue(frame.top, event),
      width: Math.max(1, snapValue(frame.width, event)),
      height: Math.max(1, snapValue(frame.height, event)),
    };
  }

  function draftRect(draft = drawDraft) {
    return draftRectBase(draft, artboardWidth, artboardHeight);
  }

  function drawPreviewStyle() {
    const rect = draftRect();
    if (!rect) return '';
    return `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
  }

  function feedbackLabelStyle(frame = feedbackFrame) {
    return feedbackLabelStyleBase(frame, artboardWidth, artboardHeight);
  }

  function pulseSelection(target) {
    selectionPulseTarget = '';
    if (selectionPulseTimer) clearTimeout(selectionPulseTimer);
    requestAnimationFrame(() => {
      selectionPulseTarget = target;
      selectionPulseTimer = setTimeout(() => {
        if (selectionPulseTarget === target) selectionPulseTarget = '';
      }, 720);
    });
  }

  function showDrawNotice(message) {
    drawNotice = message;
    if (drawNoticeTimer) clearTimeout(drawNoticeTimer);
    drawNoticeTimer = setTimeout(() => {
      if (drawNotice === message) drawNotice = '';
    }, 3000);
  }

  function focusOnMount(node) {
    requestAnimationFrame(() => node?.focus?.());
    return {};
  }

  function snapGuides(frame = feedbackFrame) {
    return snapGuidesBase(frame, snapEnabled, snapSize, artboardWidth, artboardHeight);
  }

  function makeDrawnPart(kind, rect) {
    const partKind = kind === 'ellipse' ? 'circle' : kind;
    const name = nextPartName(kind === 'text' ? 'textLayer' : kind);
    const isCircularOutline = ['ring', 'arcTrack'].includes(kind);
    const isText = kind === 'text';
    const isLine = kind === 'line';
    const radius = ['ellipse', 'ring', 'arcTrack', 'capsule'].includes(kind)
      ? 999
      : (kind === 'roundedRectangle' ? 8 : 0);

    return createPartNode(name, {
      kind: partKind,
      role: kind,
      zIndex: authoredPartNames.length + 1,
      layout: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(Math.max(4, rect.width)),
        height: Math.round(Math.max(4, rect.height)),
        xUnit: 'px',
        yUnit: 'px',
        widthUnit: 'px',
        heightUnit: 'px',
        anchorX: 'left',
        anchorY: 'top',
      },
      sections: isText
        ? { Text: createText('Text', { size: 12, weight: 600 }) }
        : {
          Background: createBackground(isLine ? '00000000' : (isCircularOutline ? '005B9BD5' : 'FF5B9BD5'), {
            borderEnabled: true,
            borderColour: (isCircularOutline || isLine) ? 'FF5B9BD5' : '55FFFFFF',
            borderThickness: isLine ? 3 : (isCircularOutline ? 4 : 1),
            radius,
          }),
        },
      meta: kind === 'arcTrack'
        ? {
          renderer: 'arcTrack',
          arcTrack: {
            startAngle: -135,
            sweepAngle: 270,
            direction: 'cw',
            thickness: 4,
            colour: 'FF5B9BD5',
          },
        }
        : {},
    });
  }

  function makeDrawnHitZone(rect, shape = 'rectangle') {
    const name = nextHitZoneName(shape === 'circle' ? 'circleZone' : 'hitZone');
    const zone = createHitZone(name, {
      shape,
      targetBehavior: designer?.selectedBehavior || 'mainSlider',
      targetValueChannel: designer?.selectedValueChannel || 'mainValue',
      action: 'dragValue',
      bounds: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(Math.max(4, rect.width)),
        height: Math.round(Math.max(4, rect.height)),
        unit: 'px',
      },
    });
    zone.priority = hitZoneEntries.length + 1;
    return zone;
  }

  // "Make Interactive" scaffolding (§3 archetypes): one action creates the
  // visual part(s) plus the channel + behavior + hit-zone set, pre-wired.
  // The patch builder lives in utils/customComponentScaffold.js (shared with
  // the Interact tab's add action).

  function commitInteractiveDraw(rect) {
    const built = buildInteractivePatch(control, interactiveArchetype, { x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    if (!built) return;
    localSelectedLayerNames = [built.partName];
    applyControlPatch(core.id, {
      ...built.patch,
      'Designer.selectedLayer': built.partName,
      'Designer.selectedLayers': [built.partName],
      'Designer.selectedSurfaceKind': 'layer',
      'Designer.selectedHitZone': '',
      'Designer.preview.showHitZones': true,
    });
    activeTool = 'select';
    zoneDisplayMode = 'all';
    lastDrawCreatedAt = Date.now();
    pulseSelection(`layer:${built.partName}`);
  }

  function makeSelectedLayerInteractive() {
    if (!core?.id || !selectedLayer || !canManageLayer || !selectedFrame) return;
    const frame = { x: selectedFrame.left, y: selectedFrame.top, width: selectedFrame.width, height: selectedFrame.height };
    const built = buildInteractivePatch(control, interactiveArchetype, frame, selectedLayer);
    if (!built) return;
    applyControlPatch(core.id, {
      ...built.patch,
      'Designer.preview.showHitZones': true,
    });
    zoneDisplayMode = 'all';
    pulseSelection(`layer:${selectedLayer}`);
  }

  function commitDrawnFrame(tool, rect, event = null) {
    if (!core?.id || !rect) return;
    if (tool === 'interactive') {
      commitInteractiveDraw(rect);
      return;
    }
    if (tool === 'hitZone') {
      const zone = makeDrawnHitZone(rect, event?.shiftKey ? 'circle' : 'rectangle');
      applyControlPatch(core.id, {
        [`HitZones.${zone.name}`]: zone,
        'Designer.selectedHitZone': zone.name,
        'Designer.selectedSurfaceKind': 'hitZone',
        'Designer.preview.showHitZones': true,
      });
      activeTool = 'select';
      zoneDisplayMode = 'selected';
      lastDrawCreatedAt = Date.now();
      pulseSelection(`zone:${zone.name}`);
      return;
    }

    const part = makeDrawnPart(tool, rect);
    localSelectedLayerNames = [part.name];
    applyControlPatch(core.id, {
      [`Parts.${part.name}`]: part,
      'Designer.selectedLayer': part.name,
      'Designer.selectedLayers': [part.name],
      'Designer.selectedSurfaceKind': 'layer',
      'Designer.selectedHitZone': '',
    });
    activeTool = 'select';
    lastDrawCreatedAt = Date.now();
    pulseSelection(`layer:${part.name}`);
    if (tool === 'text') {
      requestAnimationFrame(() => {
        inlineTextEditLayer = part.name;
      });
    }
  }

  function resetToBlankCanvas() {
    if (!core?.id) return;
    localSelectedLayerNames = [];
    activeFrame = null;
    activeLayerFrames = {};
    activeZoneFrame = null;
    inlineTextEditLayer = '';
    applyControlPatch(core.id, {
      Parts: createCustomComponentBlankPartsDefaults(),
      HitZones: createCustomComponentBlankHitZonesDefaults(),
      Generators: createCustomComponentBlankGeneratorsDefaults(),
      Bindings: createCustomComponentBlankBindingsDefaults(),
      'Designer.selectedLayer': '',
      'Designer.selectedLayers': [],
      'Designer.selectedHitZone': '',
      'Designer.selectedSurfaceKind': 'layer',
      'Designer.arpeggiator': normalizeArpeggiator({ enabled: false }),
      'Designer.preview.showHitZones': true,
      'Designer.preview.showBounds': true,
    });
  }

  function addArpeggiatorKit() {
    if (!core?.id) return;
    const backgroundName = nextPartName('arpPanel');
    const background = createPartNode(backgroundName, {
      role: 'arpeggiatorSurface',
      kind: 'rectangle',
      zIndex: 1,
      layout: {
        x: 0,
        y: 0,
        width: 720,
        height: 300,
        xUnit: 'px',
        yUnit: 'px',
        widthUnit: 'px',
        heightUnit: 'px',
        anchorX: 'left',
        anchorY: 'top',
      },
      sections: {
        Background: createBackground('FF101317', {
          borderEnabled: true,
          borderColour: 'FF354555',
          borderThickness: 1,
          radius: 4,
        }),
      },
      meta: {
        locked: true,
        arpeggiatorSurface: true,
      },
    });

    localSelectedLayerNames = [backgroundName];
    applyControlPatch(core.id, {
      'Transform.width': 720,
      'Transform.height': 300,
      [`Parts.${backgroundName}`]: background,
      [`ValueChannels.arpCurrentStep`]: createValueChannel('arpCurrentStep', { label: 'Arp Step', type: 'int', defaultValue: 0, min: 0, max: 31, step: 1 }),
      [`ValueChannels.arpStepCount`]: createValueChannel('arpStepCount', { label: 'Arp Steps', type: 'int', defaultValue: 32, min: 1, max: 256, step: 1, publicInput: false, publicOutput: false }),
      [`ValueChannels.arpNote`]: createValueChannel('arpNote', { label: 'Arp Note', type: 'int', defaultValue: 60, min: 0, max: 127, step: 1 }),
      [`ValueChannels.arpVelocity`]: createValueChannel('arpVelocity', { label: 'Arp Velocity', type: 'int', defaultValue: 0, min: 0, max: 127, step: 1 }),
      [`ValueChannels.arpGate`]: createValueChannel('arpGate', { label: 'Arp Gate', type: 'bool', defaultValue: false, min: 0, max: 1, step: 1 }),
      [`ValueChannels.arpPattern`]: createArpPatternChannel(),
      'PublishedProperties.inputs.arpCurrentStep': { channel: 'arpCurrentStep', label: 'Arp Step In', type: 'int', enabled: true, min: 0, max: 31, step: 1, defaultValue: 0 },
      'PublishedProperties.outputs.arpCurrentStep': { channel: 'arpCurrentStep', label: 'Arp Step', type: 'int', enabled: true, min: 0, max: 31, step: 1, defaultValue: 0 },
      'PublishedProperties.outputs.arpNote': { channel: 'arpNote', label: 'Arp Note', type: 'int', enabled: true, min: 0, max: 127, step: 1, defaultValue: 60 },
      'PublishedProperties.outputs.arpVelocity': { channel: 'arpVelocity', label: 'Arp Velocity', type: 'int', enabled: true, min: 0, max: 127, step: 1, defaultValue: 0 },
      'PublishedProperties.outputs.arpGate': { channel: 'arpGate', label: 'Arp Gate', type: 'bool', enabled: true, defaultValue: false },
      'PublishedProperties.outputs.arpPattern': { channel: 'arpPattern', label: 'Arp Pattern', type: 'array', enabled: true },
      'PublishedProperties.editableProperties.arpSteps': { path: 'Designer.arpeggiator.stepCount', label: 'Arp Steps', type: 'int', enabled: true, min: 1, max: 256, step: 1, defaultValue: 32 },
      'ExternalAPI.events': [
        ...(Array.isArray(control?._children?.ExternalAPI?.events) ? control._children.ExternalAPI.events : []),
        { id: 'arpStep', label: 'Arpeggiator Step', enabled: true },
      ].filter((event, index, events) => events.findIndex((entry) => entry?.id === event?.id) === index),
      'Designer.arpeggiator': normalizeArpeggiator({
        enabled: true,
        stepCount: 32,
        viewNote: 60,
        selectedBlock: '',
        blocks: [],
      }),
      'Designer.selectedLayer': backgroundName,
      'Designer.selectedLayers': [backgroundName],
      'Designer.selectedHitZone': '',
      'Designer.selectedSurfaceKind': 'layer',
      'Designer.selectedValueChannel': 'arpNote',
      'Designer.preview.showBounds': false,
      'Designer.preview.showHitZones': false,
    });
    activeTool = 'select';
    pulseSelection(`layer:${backgroundName}`);
    requestAnimationFrame(fitArtboardToView);
  }

  function assignKitPart(part, kitMeta, role) {
    part.generated = true;
    part.meta = { ...(part.meta ?? {}), ...kitMeta, kitRole: role };
    return part;
  }

  function setPartFill(part, colour, borderColour = '00000000', borderThickness = 0) {
    const background = part?._children?.Background;
    if (!background) return part;
    background._children.Fill.solidEnabled = true;
    background._children.Fill.colour = colour;
    background._children.Border.enabled = borderThickness > 0;
    background._children.Border.colour = borderColour;
    background._children.Border.thickness = borderThickness;
    return part;
  }

  function addDialKit() {
    addValueControlKit('dial');
  }

  function addHorizontalScaleKit() {
    addValueControlKit('horizontal');
  }

  function addVerticalScaleKit() {
    addValueControlKit('vertical');
  }

  function addValueControlKit(style = 'dial', frameOverride = null) {
    if (!core?.id) return;
    if (style === 'horizontal' || style === 'vertical') {
      addScaleValueControlKit(style, frameOverride);
      return;
    }
    const size = frameOverride
      ? Math.min(Math.max(72, Math.min(frameOverride.width, frameOverride.height)), 140)
      : Math.min(120, Math.max(72, Math.min(artboardWidth, artboardHeight) - 28));
    const left = frameOverride ? Math.round(frameOverride.left + (frameOverride.width - size) / 2) : Math.round((artboardWidth - size) / 2);
    const top = frameOverride ? Math.round(frameOverride.top + (frameOverride.height - size) / 2) : Math.round((artboardHeight - size) / 2);
    const centerX = left + size / 2;
    const centerY = top + size / 2;
    const trackName = nextPartName('dialTrack');
    const arcName = nextPartName('dialArc');
    const pointerName = nextPartName('dialPointer');
    const readoutName = nextPartName('dialValue');
    const zoneName = nextHitZoneName('dialZone');
    const kitId = nextKitName('valueControl');
    const channelName = nextValueChannelName('dialValue');
    const behaviorName = nextBehaviorName('dialDrag');
    const kitMeta = {
      kitId,
      kitLabel: 'Dial Control',
      kitKind: 'Value Control',
      valueControl: { style: 'dial', channelName, min: 0, max: 127, value: 64, tickCount: 11 },
      generated: true,
      locked: true,
    };

    const track = makeDrawnPart('ring', { left, top, width: size, height: size });
    track.name = trackName;
    track.role = 'dialTrack';
    track.zIndex = maxLayerZIndex() + 1;
    assignKitPart(track, kitMeta, 'track');
    track._children.Background._children.Border.thickness = 8;
    track._children.Background._children.Border.colour = 'FF2D3A44';

    const arc = makeDrawnPart('arcTrack', { left: left + 8, top: top + 8, width: size - 16, height: size - 16 });
    arc.name = arcName;
    arc.role = 'dialArc';
    arc.zIndex = maxLayerZIndex() + 2;
    assignKitPart(arc, kitMeta, 'arc');
    arc.meta.arcTrack.thickness = 8;
    arc.meta.arcTrack.colour = 'FF5B9BD5';
    arc._children.Background._children.Fill.solidEnabled = false;
    arc._children.Background._children.Border.enabled = false;

    const pointer = makeDrawnPart('capsule', {
      left: centerX - 3,
      top: top + 12,
      width: 6,
      height: Math.max(24, size / 2 - 18),
    });
    pointer.name = pointerName;
    pointer.role = 'dialPointer';
    pointer.zIndex = maxLayerZIndex() + 3;
    assignKitPart(pointer, kitMeta, 'pointer');
    pointer._children.Layout.anchorX = 'center';
    pointer._children.Layout.anchorY = 'bottom';
    pointer._children.Layout.rotation = -45;
    pointer._children.Background._children.Fill.colour = 'FFEAF6FF';
    pointer._children.Background._children.Border.enabled = false;

    const readout = makeDrawnPart('text', {
      left: centerX - 28,
      top: centerY - 12,
      width: 56,
      height: 24,
    });
    readout.name = readoutName;
    readout.role = 'dialValue';
    readout.zIndex = maxLayerZIndex() + 4;
    assignKitPart(readout, kitMeta, 'readout');
    readout._children.Text.content = '64';
    readout._children.Text._children.Font.size = 16;

    const zone = createHitZone(zoneName, {
      shape: 'circle',
      targetBehavior: behaviorName,
      targetValueChannel: channelName,
      action: 'dragValue',
      bounds: { x: left, y: top, width: size, height: size, unit: 'px' },
    });
    zone.generated = true;
    zone.visibleInEditor = false;
    zone.meta = { ...(zone.meta ?? {}), ...kitMeta, kitRole: 'hitZone' };

    localSelectedLayerNames = [];
    applyControlPatch(core.id, {
      [`Parts.${trackName}`]: track,
      [`Parts.${arcName}`]: arc,
      [`Parts.${pointerName}`]: pointer,
      [`Parts.${readoutName}`]: readout,
      [`ValueChannels.${channelName}`]: createValueChannel(channelName, { label: 'Dial Value', defaultValue: 64, min: 0, max: 127, step: 1 }),
      [`Behaviors.${behaviorName}`]: createBehaviorModule(behaviorName, { type: 'slider', role: 'slider', valueChannel: channelName, geometry: 'circular' }),
      [`HitZones.${zoneName}`]: zone,
      'Designer.selectedKit': kitId,
      'Designer.selectedLayer': '',
      'Designer.selectedLayers': [],
      'Designer.selectedHitZone': '',
      'Designer.selectedSurfaceKind': 'kit',
      'Designer.selectedValueChannel': channelName,
      'Designer.selectedBehavior': behaviorName,
      'Designer.preview.showHitZones': false,
    });
    activeTool = 'select';
    pulseSelection(`kit:${kitId}`);
  }

  function addScaleValueControlKit(style = 'horizontal', frameOverride = null) {
    const horizontal = style !== 'vertical';
    const width = frameOverride
      ? Math.max(horizontal ? 150 : 80, horizontal ? frameOverride.width : Math.min(110, frameOverride.width))
      : (horizontal ? Math.min(260, Math.max(150, artboardWidth - 32)) : 92);
    const height = frameOverride
      ? Math.max(horizontal ? 80 : 96, horizontal ? Math.min(110, frameOverride.height) : frameOverride.height)
      : (horizontal ? 92 : Math.min(240, Math.max(96, artboardHeight - 24)));
    const left = frameOverride ? Math.round(frameOverride.left + (frameOverride.width - width) / 2) : Math.round((artboardWidth - width) / 2);
    const top = frameOverride ? Math.round(frameOverride.top + (frameOverride.height - height) / 2) : Math.round((artboardHeight - height) / 2);
    const trackStart = horizontal ? left + 18 : top + 18;
    const trackLength = (horizontal ? width : height) - 36;
    const trackCenter = horizontal ? top + Math.round(height / 2) : left + Math.round(width / 2);
    const valueRatio = 0.5;
    const kitId = nextKitName('valueControl');
    const channelName = nextValueChannelName(horizontal ? 'horizontalValue' : 'verticalValue');
    const behaviorName = nextBehaviorName(horizontal ? 'horizontalDrag' : 'verticalDrag');
    const kitMeta = {
      kitId,
      kitLabel: horizontal ? 'Horizontal Scale' : 'Vertical Scale',
      kitKind: 'Value Control',
      valueControl: { style, channelName, min: 0, max: 127, value: 64, tickCount: 11 },
      generated: true,
      locked: true,
    };
    const patch = {};
    const reservedNames = new Set(authoredPartNames);
    const allocatePartName = (base) => {
      const safeBase = String(base || 'layer').replace(/[^a-zA-Z0-9_]/g, '') || 'layer';
      let name = safeBase;
      let index = 1;
      while (reservedNames.has(name)) {
        index += 1;
        name = `${safeBase}_${index}`;
      }
      reservedNames.add(name);
      return name;
    };
    let zIndex = maxLayerZIndex();

    const track = makeDrawnPart('capsule', horizontal
      ? { left: trackStart, top: trackCenter - 3, width: trackLength, height: 6 }
      : { left: trackCenter - 3, top: trackStart, width: 6, height: trackLength });
    track.name = allocatePartName(horizontal ? 'hScaleTrack' : 'vScaleTrack');
    track.role = 'scaleTrack';
    track.zIndex = ++zIndex;
    assignKitPart(track, kitMeta, 'track');
    setPartFill(track, 'FF2D3A44', '00000000', 0);
    patch[`Parts.${track.name}`] = track;

    const fillLength = Math.max(6, Math.round(trackLength * valueRatio));
    const fill = makeDrawnPart('capsule', horizontal
      ? { left: trackStart, top: trackCenter - 3, width: fillLength, height: 6 }
      : { left: trackCenter - 3, top: trackStart + trackLength - fillLength, width: 6, height: fillLength });
    fill.name = allocatePartName(horizontal ? 'hScaleFill' : 'vScaleFill');
    fill.role = 'scaleFill';
    fill.zIndex = ++zIndex;
    assignKitPart(fill, kitMeta, 'fill');
    setPartFill(fill, 'FF5B9BD5', '00000000', 0);
    patch[`Parts.${fill.name}`] = fill;

    const pointerPosition = horizontal
      ? trackStart + Math.round(trackLength * valueRatio)
      : trackStart + Math.round(trackLength * (1 - valueRatio));
    const pointer = makeDrawnPart('capsule', horizontal
      ? { left: pointerPosition - 3, top: trackCenter - 17, width: 6, height: 34 }
      : { left: trackCenter - 17, top: pointerPosition - 3, width: 34, height: 6 });
    pointer.name = allocatePartName(horizontal ? 'hScalePointer' : 'vScalePointer');
    pointer.role = 'scalePointer';
    pointer.zIndex = ++zIndex;
    assignKitPart(pointer, kitMeta, 'pointer');
    setPartFill(pointer, 'FFEAF6FF', '00000000', 0);
    patch[`Parts.${pointer.name}`] = pointer;

    for (let index = 0; index < 11; index += 1) {
      const ratio = index / 10;
      const major = index % 5 === 0;
      const position = horizontal
        ? trackStart + Math.round(trackLength * ratio)
        : trackStart + Math.round(trackLength * (1 - ratio));
      const tick = makeDrawnPart('rectangle', horizontal
        ? { left: position - 1, top: trackCenter + 11, width: 2, height: major ? 16 : 9 }
        : { left: trackCenter - 27, top: position - 1, width: major ? 16 : 9, height: 2 });
      tick.name = allocatePartName(horizontal ? 'hScaleTick' : 'vScaleTick');
      tick.role = 'scaleTick';
      tick.zIndex = ++zIndex;
      assignKitPart(tick, kitMeta, 'tick');
      setPartFill(tick, major ? 'FFEAF6FF' : 'FF7C8B96', '00000000', 0);
      patch[`Parts.${tick.name}`] = tick;

      if (major) {
        const labelValue = index === 0 ? '0' : (index === 5 ? '64' : '127');
        const label = makeDrawnPart('text', horizontal
          ? { left: position - 15, top: trackCenter + 29, width: 30, height: 16 }
          : { left: trackCenter - 62, top: position - 8, width: 28, height: 16 });
        label.name = allocatePartName(horizontal ? 'hScaleLabel' : 'vScaleLabel');
        label.role = 'scaleLabel';
        label.zIndex = ++zIndex;
        assignKitPart(label, kitMeta, 'label');
        label._children.Text.content = labelValue;
        label._children.Text._children.Font.size = 10;
        patch[`Parts.${label.name}`] = label;
      }
    }

    const readout = makeDrawnPart('text', horizontal
      ? { left: left + width - 58, top: top + 6, width: 48, height: 20 }
      : { left: left + 20, top: top + 4, width: 52, height: 20 });
    readout.name = allocatePartName(horizontal ? 'hScaleValue' : 'vScaleValue');
    readout.role = 'scaleValue';
    readout.zIndex = ++zIndex;
    assignKitPart(readout, kitMeta, 'readout');
    readout._children.Text.content = '64';
    readout._children.Text._children.Font.size = 14;
    patch[`Parts.${readout.name}`] = readout;

    const zoneName = nextHitZoneName(horizontal ? 'hScaleZone' : 'vScaleZone');
    const zone = createHitZone(zoneName, {
      shape: 'rectangle',
      targetBehavior: behaviorName,
      targetValueChannel: channelName,
      action: 'dragValue',
      bounds: { x: left, y: top, width, height, unit: 'px' },
    });
    zone.generated = true;
    zone.visibleInEditor = false;
    zone.meta = { ...(zone.meta ?? {}), ...kitMeta, kitRole: 'hitZone' };
    patch[`HitZones.${zoneName}`] = zone;

    localSelectedLayerNames = [];
    applyControlPatch(core.id, {
      ...patch,
      [`ValueChannels.${channelName}`]: createValueChannel(channelName, { label: horizontal ? 'Horizontal Scale Value' : 'Vertical Scale Value', defaultValue: 64, min: 0, max: 127, step: 1 }),
      [`Behaviors.${behaviorName}`]: createBehaviorModule(behaviorName, { type: 'slider', role: 'slider', valueChannel: channelName, geometry: horizontal ? 'horizontal' : 'vertical' }),
      'Designer.selectedKit': kitId,
      'Designer.selectedLayer': '',
      'Designer.selectedLayers': [],
      'Designer.selectedHitZone': '',
      'Designer.selectedSurfaceKind': 'kit',
      'Designer.selectedValueChannel': channelName,
      'Designer.selectedBehavior': behaviorName,
      'Designer.preview.showHitZones': false,
    });
    activeTool = 'select';
    pulseSelection(`kit:${kitId}`);
  }

  function partOverlayStyle(name, part) {
    return partOverlayStyleBase(frameForPart(name, part), part);
  }

  function zoneFrame(zone) {
    return zoneFrameBase(zone, artboardWidth, artboardHeight);
  }

  function isFollowZone(zone) {
    return String(zone?.source ?? 'independent') !== 'independent';
  }

  // Follow-mode zones live where their source part (or the face) is, grown by
  // inflate/minTouch — the runtime ignores their authored bounds, so the
  // surface must show the resolved grab area instead.
  function displayZoneFrame(zone) {
    if (!isFollowZone(zone)) return zoneFrame(zone);
    const resolved = customHitZoneRect(zone, { width: artboardWidth, height: artboardHeight }, parts?._children ?? null);
    return { left: resolved.x, top: resolved.y, width: resolved.width, height: resolved.height };
  }

  function hitZoneStyle(name, zone) {
    const frame = activeSelectionKind === 'hitZone' && name === selectedHitZone && activeZoneFrame
      ? activeZoneFrame
      : displayZoneFrame(zone);
    return hitZoneStyleBase(frame, zone);
  }

  function patchFromZoneFrameFor(name, zone, frame) {
    return patchFromZoneFrameForBase(name, zone, frame, artboardWidth, artboardHeight);
  }

  function patchFromZoneFrame(zone, frame) {
    return patchFromZoneFrameFor(selectedHitZone, zone, frame);
  }

  const DEFAULT_LAYER_GRADIENT = {
    type: 'linear', angle: 90, centerX: 50, centerY: 50,
    radiusX: 50, radiusY: 50, edge: 0,
    stops: [{ color: '555555', position: 0 }, { color: 'AAAAAA', position: 100 }],
  };

  function openLayerColour(relativePath, currentValue) {
    if (!core?.id || !selectedLayer) return;
    activateColorTarget(
      { type: 'control', controlId: core.id, path: `Parts.${selectedLayer}.${relativePath}` },
      currentValue ?? 'FF5B9BD5'
    );
  }

  function openArcColour() {
    if (!core?.id || !selectedLayer) return;
    activateColorTarget(
      { type: 'control', controlId: core.id, path: `Parts.${selectedLayer}.meta.arcTrack.colour` },
      selectedArcMeta?.colour ?? 'FF5B9BD5'
    );
  }

  function openLayerGradient() {
    if (!core?.id || !selectedLayer || !selectedFill) return;
    openFillGradientEditor({
      controlId: core.id,
      targetPath: `Parts.${selectedLayer}.Background.Fill`,
      fill: selectedFill,
      defaultGradient: DEFAULT_LAYER_GRADIENT,
      seedGradient: (seeded) => setLayerProperty('Background.Fill.gradient', seeded),
    });
  }

  function toggleFillGradient() {
    const next = !selectedFill?.gradientEnabled;
    setLayerProperty('Background.Fill.gradientEnabled', next);
    if (next) openLayerGradient();
  }

  function setZoom(value) {
    surfaceZoom = Math.max(0.25, Math.min(5, numberOr(value, 1)));
  }

  // Wheel zoom on the design canvas (parity with the panel editor). Ctrl/Cmd
  // + wheel, or a trackpad pinch (which arrives as ctrlKey wheel), zooms
  // toward the cursor; a plain wheel keeps native scrolling. Holding the zoom
  // point fixed keeps the part under the cursor put while zooming.
  function handleSurfaceWheel(event) {
    if (!(event.ctrlKey || event.metaKey) || !surfaceScrollEl) return;
    event.preventDefault();
    const rect = surfaceScrollEl.getBoundingClientRect();
    const pointerX = event.clientX - rect.left + surfaceScrollEl.scrollLeft;
    const pointerY = event.clientY - rect.top + surfaceScrollEl.scrollTop;
    const before = surfaceZoom;
    const factor = Math.exp(-event.deltaY * 0.0015);
    setZoom(before * factor);
    const ratio = surfaceZoom / before;
    if (ratio !== 1) {
      // Keep the cursor's content point stationary after the scale change.
      surfaceScrollEl.scrollLeft += (pointerX * ratio) - pointerX;
      surfaceScrollEl.scrollTop += (pointerY * ratio) - pointerY;
    }
  }

  // Bottom zoom bar helpers (percent-based, like the Panel Designer's ZoomBar).
  function zoomStep(deltaPercent) {
    setZoom(surfaceZoom + deltaPercent / 100);
  }

  function startZoomEdit() {
    zoomEditValue = String(Math.round(surfaceZoom * 100));
    zoomEditing = true;
  }

  function commitZoomEdit() {
    zoomEditing = false;
    const pct = parseInt(zoomEditValue, 10);
    if (!isNaN(pct)) setZoom(pct / 100);
  }

  function zoomEditKeydown(event) {
    if (event.key === 'Enter') commitZoomEdit();
    else if (event.key === 'Escape') zoomEditing = false;
  }

  function setZoomIncrement(value) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) surfaceZoomIncrement = Math.min(100, num);
  }

  function openComponentScripts() {
    if (!core?.id) return;
    const doc = getOrCreateScriptDocForPanel(core.id, core?.name || 'Custom Component');
    if (doc?.id) setActiveEditorTab({ type: 'script', id: doc.id });
  }

  function setSnapSize(value) {
    snapSize = Math.max(1, Math.min(64, Math.round(numberOr(value, 10))));
  }

  function fitArtboardToView() {
    if (!surfaceScrollEl) {
      setZoom(1);
      return;
    }
    const widthFit = (surfaceScrollEl.clientWidth - 96) / Math.max(1, artboardWidth);
    const heightFit = (surfaceScrollEl.clientHeight - 96) / Math.max(1, artboardHeight);
    setZoom(Math.min(5, Math.max(0.25, Math.min(widthFit, heightFit))));
    requestAnimationFrame(() => {
      if (!surfaceScrollEl) return;
      surfaceScrollEl.scrollLeft = Math.max(0, (surfaceScrollEl.scrollWidth - surfaceScrollEl.clientWidth) / 2);
      surfaceScrollEl.scrollTop = Math.max(0, (surfaceScrollEl.scrollHeight - surfaceScrollEl.clientHeight) / 2);
    });
  }

  function patchFromFrameForLayer(name, part, frame) {
    return patchFromFrameForLayerBase(name, part, frame, artboardWidth, artboardHeight);
  }

  function patchFromFrame(part, frame) {
    return patchFromFrameForLayer(selectedLayer, part, frame);
  }

  function applyLayerPatch(patch) {
    if (!core?.id || !selectedLayer || !patch || !Object.keys(patch).length) return;
    for (const [path, value] of Object.entries(patch)) {
      updateControlProperty(core.id, path, value);
    }
  }

  function setLayerProperty(relativePath, value) {
    if (!canPaintLayer || !relativePath) return;
    updateControlProperty(core.id, `Parts.${selectedLayer}.${relativePath}`, value);
  }

  function setLayerPropertyFor(name, relativePath, value) {
    if (!core?.id || !name || !relativePath || !isEditablePart(authoredParts?._children?.[name])) return;
    updateControlProperty(core.id, `Parts.${name}.${relativePath}`, value);
  }

  function setLayerLayoutProperty(relativePath, value) {
    if (!selectedPartEditable || !relativePath) return;
    updateControlProperty(core.id, `Parts.${selectedLayer}.Layout.${relativePath}`, value);
  }

  function setSelectedPivotToArcCenter() {
    if (!selectedPartEditable || !selectedLayer || !selectedFrame || !selectedArcPivotTarget) return;
    const width = Math.max(1, numberOr(selectedFrame.width, 1));
    const height = Math.max(1, numberOr(selectedFrame.height, 1));
    const pivotX = ((selectedArcPivotTarget.center.x - selectedFrame.left) / width) * 100;
    const pivotY = ((selectedArcPivotTarget.center.y - selectedFrame.top) / height) * 100;
    applyLayerPatch({
      [`Parts.${selectedLayer}.Layout.pivotX`]: roundLayoutValue(pivotX),
      [`Parts.${selectedLayer}.Layout.pivotY`]: roundLayoutValue(pivotY),
    });
  }

  function setArtboardSize(path, value) {
    if (!core?.id || !['width', 'height'].includes(path)) return;
    updateControlProperty(core.id, `Transform.${path}`, Math.max(1, Math.round(numberOr(value, path === 'width' ? artboardWidth : artboardHeight))));
  }

  function setHitZoneProperty(relativePath, value) {
    if (!core?.id || !selectedHitZone || !selectedZoneEditable || !relativePath) return;
    updateControlProperty(core.id, `HitZones.${selectedHitZone}.${relativePath}`, value);
  }

  function setLayerColour(relativePath, currentValue, inputValue, fallback = '5B9BD5') {
    setLayerProperty(relativePath, colourFromInput(inputValue, alphaFromColour(currentValue), fallback));
  }

  function beginInlineTextEdit(name, event = null) {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    const part = authoredParts?._children?.[name];
    if (!part?._children?.Text || !isEditablePart(part)) return;
    selectLayer(name);
    inlineTextEditLayer = name;
  }

  function finishInlineTextEdit() {
    inlineTextEditLayer = '';
  }

  function inlineTextEditorStyle(name, part) {
    return inlineTextEditorStyleBase(frameForPart(name, part), part);
  }

  function renameSelectedLayer(event) {
    if (!core?.id || !selectedLayer || !selectedAuthoredPart) return;
    const currentName = selectedLayer;
    const nextName = String(event?.currentTarget?.value ?? '').trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!nextName || nextName === currentName) {
      event.currentTarget.value = currentName;
      return;
    }
    if (authoredParts?._children?.[nextName]) {
      event.currentTarget.value = currentName;
      return;
    }

    const renamed = cloneValue(selectedAuthoredPart);
    renamed.name = nextName;
    localSelectedLayerNames = selectedLayerNames.map((name) => name === currentName ? nextName : name);
    applyControlPatch(core.id, {
      [`Parts.${nextName}`]: renamed,
      'Designer.selectedLayer': nextName,
      'Designer.selectedLayers': selectedLayerNames.map((name) => name === currentName ? nextName : name),
      'Designer.selectedSurfaceKind': 'layer',
    });
    removeControlNode(core.id, `Parts.${currentName}`);
  }

  function duplicateSelectedLayer() {
    if (!core?.id || !selectedAuthoredPart) return;
    if (multiSelectionActive) {
      const patch = {};
      const nextSelection = [];
      let zIndex = maxLayerZIndex();
      for (const name of selectedLayerNames) {
        const source = authoredParts?._children?.[name];
        if (!source) continue;
        const cloneName = nextPartName(`${name}_copy`);
        const clone = cloneValue(source);
        clone.name = cloneName;
        clone.locked = false;
        clone.zIndex = ++zIndex;
        if (clone._children?.Layout) {
          clone._children.Layout.offsetX = numberOr(clone._children.Layout.offsetX, 0) + 8;
          clone._children.Layout.offsetY = numberOr(clone._children.Layout.offsetY, 0) + 8;
        }
        patch[`Parts.${cloneName}`] = clone;
        nextSelection.push(cloneName);
      }
      if (nextSelection.length) {
        localSelectedLayerNames = nextSelection;
        patch['Designer.selectedLayer'] = nextSelection[0];
        patch['Designer.selectedLayers'] = nextSelection;
        patch['Designer.selectedSurfaceKind'] = 'layer';
        applyControlPatch(core.id, patch);
      }
      return;
    }
    const name = nextPartName(`${selectedLayer}_copy`);
    const clone = cloneValue(selectedAuthoredPart);
    clone.name = name;
    clone.locked = false;
    clone.zIndex = maxLayerZIndex() + 1;
    if (clone._children?.Layout) {
      clone._children.Layout.offsetX = numberOr(clone._children.Layout.offsetX, 0) + 8;
      clone._children.Layout.offsetY = numberOr(clone._children.Layout.offsetY, 0) + 8;
    }
    applyControlPatch(core.id, {
      [`Parts.${name}`]: clone,
      'Designer.selectedLayer': name,
      'Designer.selectedLayers': [name],
      'Designer.selectedSurfaceKind': 'layer',
    });
    localSelectedLayerNames = [name];
  }

  function addLayerAtCenter(toolId = lastShapeTool) {
    if (!core?.id) return;
    const width = toolId === 'text' ? 96 : 72;
    const height = toolId === 'text' ? 28 : 52;
    const part = makeDrawnPart(toolId, {
      left: Math.max(0, (artboardWidth - width) / 2),
      top: Math.max(0, (artboardHeight - height) / 2),
      width,
      height,
    });
    localSelectedLayerNames = [part.name];
    applyControlPatch(core.id, {
      [`Parts.${part.name}`]: part,
      'Designer.selectedLayer': part.name,
      'Designer.selectedLayers': [part.name],
      'Designer.selectedSurfaceKind': 'layer',
      'Designer.selectedKit': '',
    });
    activeTool = 'select';
    pulseSelection(`layer:${part.name}`);
  }

  function addHitZoneAtCenter() {
    if (!core?.id) return;
    const width = 96;
    const height = 52;
    const zone = makeDrawnHitZone({
      left: Math.max(0, (artboardWidth - width) / 2),
      top: Math.max(0, (artboardHeight - height) / 2),
      width,
      height,
    });
    applyControlPatch(core.id, {
      [`HitZones.${zone.name}`]: zone,
      'Designer.selectedHitZone': zone.name,
      'Designer.selectedSurfaceKind': 'hitZone',
      'Designer.selectedKit': '',
      'Designer.preview.showHitZones': true,
    });
    activeTool = 'select';
    pulseSelection(`zone:${zone.name}`);
  }

  function detachSelectedLayer() {
    if (!core?.id || !selectedLayer || !selectedPart) return;
    const detached = cloneValue(selectedPart);
    detached.name = selectedLayer;
    detached.generated = false;
    detached.detachedFromGenerator = selectedPart?.meta?.generatedBy || selectedPart?.generatedBy || 'generator';
    detached.meta = {
      ...(detached.meta ?? {}),
      generated: false,
      detachedFromGenerator: detached.detachedFromGenerator,
    };
    applyControlPatch(core.id, {
      [`Parts.${selectedLayer}`]: detached,
      'Designer.selectedLayer': selectedLayer,
      'Designer.selectedLayers': [selectedLayer],
      'Designer.selectedSurfaceKind': 'layer',
    });
    localSelectedLayerNames = [selectedLayer];
  }

  function removeSelectedLayer() {
    if (!core?.id || !selectedLayer || !selectedAuthoredPart) return;
    if (multiSelectionActive) {
      const selected = new Set(selectedLayerNames);
      const next = topDownPartEntries.find(([name]) => !selected.has(name))?.[0] ?? '';
      for (const name of selectedLayerNames) {
        if (authoredParts?._children?.[name]) removeControlNode(core.id, `Parts.${name}`);
      }
      localSelectedLayerNames = next ? [next] : [];
      applyControlPatch(core.id, {
        'Designer.selectedLayer': next,
        'Designer.selectedLayers': next ? [next] : [],
        'Designer.selectedSurfaceKind': 'layer',
      });
      return;
    }
    const next = topDownPartEntries.find(([name]) => name !== selectedLayer)?.[0] ?? '';
    removeControlNode(core.id, `Parts.${selectedLayer}`);
    localSelectedLayerNames = next ? [next] : [];
    applyControlPatch(core.id, {
      'Designer.selectedLayer': next,
      'Designer.selectedLayers': next ? [next] : [],
      'Designer.selectedSurfaceKind': 'layer',
    });
  }

  function removeSelectedKit() {
    if (!core?.id || activeSelectionKind !== 'kit' || !selectedKitEntry) return;
    removeKitEntry(selectedKitEntry);
  }

  function removeKitEntry(kit) {
    if (!core?.id || !kit) return;
    const currentKitId = kit.id;
    const nextKit = kitEntries.find((entry) => entry.id !== currentKitId) ?? null;
    for (const name of kit.layerNames) {
      if (authoredParts?._children?.[name]) removeControlNode(core.id, `Parts.${name}`);
    }
    for (const name of kit.zoneNames) {
      if (authoredHitZones?._children?.[name]) removeControlNode(core.id, `HitZones.${name}`);
    }
    localSelectedLayerNames = [];
    applyControlPatch(core.id, {
      'Designer.selectedKit': nextKit?.id ?? '',
      'Designer.selectedLayer': '',
      'Designer.selectedLayers': [],
      'Designer.selectedHitZone': '',
      'Designer.selectedSurfaceKind': nextKit ? 'kit' : 'artboard',
    });
  }

  function maxLayerZIndex() {
    return Math.max(0, ...Object.values(authoredParts?._children ?? {}).map((part) => numberOr(part?.zIndex, 0)));
  }

  function moveLayer(name, direction) {
    if (!core?.id || !name || !authoredParts?._children?.[name]) return;
    const stack = Object.entries(authoredParts?._children ?? {})
      .sort((left, right) => numberOr(left?.[1]?.zIndex, 0) - numberOr(right?.[1]?.zIndex, 0));
    const index = stack.findIndex(([entryName]) => entryName === name);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= stack.length) return;
    const [, currentPart] = stack[index];
    const [nextName, nextPart] = stack[nextIndex];
    applyControlPatch(core.id, {
      [`Parts.${name}.zIndex`]: numberOr(nextPart?.zIndex, nextIndex),
      [`Parts.${nextName}.zIndex`]: numberOr(currentPart?.zIndex, index),
      'Designer.selectedLayer': name,
      'Designer.selectedLayers': selectedLayerNames.includes(name) ? selectedLayerNames : [name],
      'Designer.selectedSurfaceKind': 'layer',
    });
  }

  function moveLayerToExtreme(name, edge = 'front') {
    if (!core?.id || !name || !authoredParts?._children?.[name]) return;
    const zValues = Object.values(authoredParts?._children ?? {}).map((part) => numberOr(part?.zIndex, 0));
    const nextZ = edge === 'back'
      ? Math.min(0, ...zValues) - 1
      : Math.max(0, ...zValues) + 1;
    applyControlPatch(core.id, {
      [`Parts.${name}.zIndex`]: nextZ,
      'Designer.selectedLayer': name,
      'Designer.selectedLayers': selectedLayerNames.includes(name) ? selectedLayerNames : [name],
      'Designer.selectedSurfaceKind': 'layer',
    });
  }

  function moveSelectedLayer(direction) {
    if (!selectedLayer || !selectedAuthoredPart) return;
    moveLayer(selectedLayer, direction);
  }

  function moveSelectedLayerToExtreme(edge) {
    if (!selectedLayer || !selectedAuthoredPart) return;
    moveLayerToExtreme(selectedLayer, edge);
  }

  function moveLayerTo(name, targetName) {
    if (!core?.id || !name || !targetName || name === targetName) return;
    const stack = Object.entries(authoredParts?._children ?? {})
      .sort((left, right) => numberOr(left?.[1]?.zIndex, 0) - numberOr(right?.[1]?.zIndex, 0));
    const from = stack.findIndex(([entryName]) => entryName === name);
    const to = stack.findIndex(([entryName]) => entryName === targetName);
    if (from < 0 || to < 0) return;
    const [moving] = stack.splice(from, 1);
    stack.splice(to, 0, moving);
    const patch = {
      'Designer.selectedLayer': name,
      'Designer.selectedLayers': selectedLayerNames.includes(name) ? selectedLayerNames : [name],
      'Designer.selectedSurfaceKind': 'layer',
    };
    stack.forEach(([entryName], index) => {
      patch[`Parts.${entryName}.zIndex`] = index + 1;
    });
    applyControlPatch(core.id, patch);
  }

  function toggleLayerVisibility(name, part, event = null) {
    event?.stopPropagation?.();
    if (!core?.id || !name || !part) return;
    updateControlProperty(core.id, `Parts.${name}.visible`, part?.visible === false);
  }

  function toggleLayerLock(name, part, event = null) {
    event?.stopPropagation?.();
    if (!core?.id || !name || !part) return;
    updateControlProperty(core.id, `Parts.${name}.locked`, part?.locked !== true);
  }

  function beginLayerDrag(name, event) {
    draggingLayerName = name;
    event?.dataTransfer?.setData?.('text/plain', name);
    event?.dataTransfer && (event.dataTransfer.effectAllowed = 'move');
  }

  function dropLayerOn(name, event) {
    event.preventDefault();
    const source = draggingLayerName || event.dataTransfer?.getData?.('text/plain');
    draggingLayerName = '';
    if (source) moveLayerTo(source, name);
  }

  function toggleSelectedVisibility() {
    if (!core?.id || !selectedLayer || !selectedAuthoredPart) return;
    updateControlProperty(core.id, `Parts.${selectedLayer}.visible`, selectedAuthoredPart?.visible === false);
  }

  function toggleSelectedLock() {
    if (!core?.id || !selectedLayer || !selectedAuthoredPart) return;
    updateControlProperty(core.id, `Parts.${selectedLayer}.locked`, selectedAuthoredPart?.locked !== true);
  }

  function alignSelection(mode) {
    if (activeSelectionKind === 'hitZone') {
      if (!selectedZoneEditable || !selectedZoneFrame || !selectedAuthoredZone) return;
      const frame = { ...selectedZoneFrame };
      if (mode === 'left') frame.left = 0;
      if (mode === 'centerX') frame.left = (artboardWidth - frame.width) / 2;
      if (mode === 'right') frame.left = artboardWidth - frame.width;
      if (mode === 'top') frame.top = 0;
      if (mode === 'centerY') frame.top = (artboardHeight - frame.height) / 2;
      if (mode === 'bottom') frame.top = artboardHeight - frame.height;
      applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, frame));
      return;
    }

    if (multiSelectionActive) {
      const bounds = multiSelectionBounds();
      if (!bounds) return;
      let dx = 0;
      let dy = 0;
      if (mode === 'left') dx = -bounds.left;
      if (mode === 'centerX') dx = (artboardWidth - bounds.width) / 2 - bounds.left;
      if (mode === 'right') dx = artboardWidth - bounds.width - bounds.left;
      if (mode === 'top') dy = -bounds.top;
      if (mode === 'centerY') dy = (artboardHeight - bounds.height) / 2 - bounds.top;
      if (mode === 'bottom') dy = artboardHeight - bounds.height - bounds.top;
      moveSelectedLayersBy(dx, dy);
      return;
    }

    if (!selectedPartEditable || !selectedFrame || !selectedAuthoredPart) return;
    const frame = { ...selectedFrame };
    if (mode === 'left') frame.left = 0;
    if (mode === 'centerX') frame.left = (artboardWidth - frame.width) / 2;
    if (mode === 'right') frame.left = artboardWidth - frame.width;
    if (mode === 'top') frame.top = 0;
    if (mode === 'centerY') frame.top = (artboardHeight - frame.height) / 2;
    if (mode === 'bottom') frame.top = artboardHeight - frame.height;
    applyLayerPatch(patchFromFrame(selectedAuthoredPart, frame));
  }

  function moveSelectedLayersBy(dx, dy) {
    if (!core?.id || !selectedLayerNames.length) return;
    const patch = {};
    for (const [name, authoredPart, renderedPart] of selectedEditableLayerEntries()) {
      const frame = partFrame(renderedPart);
      Object.assign(patch, patchFromFrameForLayer(name, authoredPart, {
        ...frame,
        left: frame.left + dx,
        top: frame.top + dy,
      }));
    }
    if (Object.keys(patch).length) applyControlPatch(core.id, patch);
  }

  function smartTargetsExcluding(excludedNames = []) {
    const excluded = new Set(excludedNames);
    const frames = partEntries
      .filter(([name]) => !excluded.has(name))
      .map(([, part]) => partFrame(part));
    return smartSnapTargets(frames, artboardWidth, artboardHeight);
  }

  // Align the selected layers to each other (the selection's bounding box);
  // alignSelection() above keeps aligning to the artboard.
  function alignSelectedLayers(mode) {
    if (!core?.id || selectedLayerNames.length < 2) return;
    const entries = selectedEditableLayerEntries();
    const aligned = alignFramesWithinSelection(
      entries.map(([name, , renderedPart]) => [name, partFrame(renderedPart)]),
      mode
    );
    const patch = {};
    for (const [name, authoredPart] of entries) {
      const frame = aligned.get(name);
      if (frame) Object.assign(patch, patchFromFrameForLayer(name, authoredPart, frame));
    }
    if (Object.keys(patch).length) applyControlPatch(core.id, patch);
  }

  function distributeSelectedLayers(axis) {
    if (!core?.id || selectedLayerNames.length < 3) return;
    const entries = selectedEditableLayerEntries();
    const distributed = distributeFramesWithinSelection(
      entries.map(([name, , renderedPart]) => [name, partFrame(renderedPart)]),
      axis
    );
    const patch = {};
    for (const [name, authoredPart] of entries) {
      const frame = distributed.get(name);
      if (frame) Object.assign(patch, patchFromFrameForLayer(name, authoredPart, frame));
    }
    if (Object.keys(patch).length) applyControlPatch(core.id, patch);
  }

  function copySelectedLayers() {
    const copiedParts = selectedLayerNames
      .map((name) => authoredParts?._children?.[name])
      .filter(Boolean);
    if (!copiedParts.length) return;
    const partSet = new Set(selectedLayerNames);
    const followingZones = Object.values(authoredHitZones?._children ?? {}).filter((zone) => {
      const followed = /^part:(.+)$/.exec(String(zone?.source ?? ''));
      return followed && partSet.has(followed[1]);
    });
    setPartClipboard(copiedParts, followingZones);
    showDrawNotice(`Copied ${copiedParts.length} layer${copiedParts.length === 1 ? '' : 's'}`);
  }

  function cutSelectedLayers() {
    if (!canManageLayer && !multiSelectionActive) return;
    copySelectedLayers();
    removeSelectedLayer();
  }

  function pasteClipboardLayers() {
    if (!core?.id || !hasPartClipboard()) return;
    const result = buildPastePatch(
      getPartClipboard(),
      Object.keys(authoredParts?._children ?? {}),
      Object.keys(authoredHitZones?._children ?? {}),
      maxLayerZIndex()
    );
    if (!result?.partNames?.length) return;
    localSelectedLayerNames = result.partNames;
    applyControlPatch(core.id, {
      ...result.patch,
      'Designer.selectedLayer': result.partNames[0],
      'Designer.selectedLayers': result.partNames,
      'Designer.selectedSurfaceKind': 'layer',
      'Designer.selectedHitZone': '',
      'Designer.selectedKit': '',
    });
    pulseSelection(`layer:${result.partNames[0]}`);
    showDrawNotice(`Pasted ${result.partNames.length} layer${result.partNames.length === 1 ? '' : 's'}`);
  }

  function setPreviewFlag(path, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Designer.preview.${path}`, value);
  }

  function setZoneDisplayMode(mode) {
    zoneDisplayMode = ['all', 'dim', 'selected'].includes(mode) ? mode : 'selected';
    if (zoneDisplayMode !== 'selected' && core?.id && !showHitZones) {
      updateControlProperty(core.id, 'Designer.preview.showHitZones', true);
    }
  }

  function setArcMetaProperty(path, value) {
    if (!core?.id || !selectedLayer || !selectedIsArc) return;
    updateControlProperty(core.id, `Parts.${selectedLayer}.meta.arcTrack.${path}`, value);
  }

  function commitLayerSelection(names, primary = names?.[0] ?? '') {
    if (!core?.id) return;
    const clean = [...new Set((names ?? []).map((entry) => String(entry)).filter((entry) => parts?._children?.[entry]))];
    const nextPrimary = clean.includes(primary) ? primary : clean[0] ?? '';
    const generatorName = parts?._children?.[nextPrimary]?.meta?.generatedBy ?? parts?._children?.[nextPrimary]?.generatedBy ?? '';
    localSelectedLayerNames = clean;
    applyControlPatch(core.id, {
      'Designer.selectedLayer': nextPrimary,
      'Designer.selectedSurfaceKind': 'layer',
      'Designer.selectedHitZone': '',
      'Designer.selectedKit': '',
      ...(generatorName && generators?._children?.[generatorName] ? { 'Designer.selectedGenerator': generatorName } : {}),
    });
  }

  function selectKit(kitId) {
    if (!core?.id || !kitId) return;
    localSelectedLayerNames = [];
    pulseSelection(`kit:${kitId}`);
    applyControlPatch(core.id, {
      'Designer.selectedKit': kitId,
      'Designer.selectedLayer': '',
      'Designer.selectedLayers': [],
      'Designer.selectedHitZone': '',
      'Designer.selectedSurfaceKind': 'kit',
    });
  }

  function editKitParts(kitId) {
    const kit = kitEntries.find((entry) => entry.id === kitId);
    const primary = kit?.layerNames?.[0] ?? '';
    if (!primary) return;
    commitLayerSelection(kit.layerNames, primary);
  }

  function convertSelectedValueControl(style) {
    if (!core?.id || activeSelectionKind !== 'kit' || !selectedKitEntry) return;
    if (selectedKitEntry.control?.style === style) return;
    const frame = selectedKitFrame ? { ...selectedKitFrame } : null;
    for (const name of selectedKitEntry.layerNames) removeControlNode(core.id, `Parts.${name}`);
    for (const name of selectedKitEntry.zoneNames) removeControlNode(core.id, `HitZones.${name}`);
    addValueControlKit(style, frame);
  }

  function selectLayer(name, event = null) {
    if (!core?.id || !name) return;
    pulseSelection(`layer:${name}`);
    if (event?.ctrlKey || event?.metaKey || event?.shiftKey) {
      const next = selectedLayerSet.has(name)
        ? selectedLayerNames.filter((entry) => entry !== name)
        : [...selectedLayerNames, name];
      commitLayerSelection(next.length ? next : [name], name);
      return;
    }
    commitLayerSelection([name], name);
  }

  function toggleLayerMultiSelection(name, event = null) {
    event?.stopPropagation?.();
    if (!core?.id || !name) return;
    const next = selectedLayerSet.has(name)
      ? selectedLayerNames.filter((entry) => entry !== name)
      : [...selectedLayerNames, name];
    commitLayerSelection(next.length ? next : [name], name);
  }

  function beginMove(name, part, event) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      selectLayer(name, event);
      return;
    }
    if (!selectedLayerSet.has(name)) selectLayer(name);
    if (!isEditablePart(authoredParts?._children?.[name])) return;
    const frame = partFrame(part);
    if (selectedLayerSet.has(name) && selectedLayerNames.length > 1) {
      const startFrames = {};
      for (const [entryName, authoredPart, renderedPart] of selectedEditableLayerEntries()) {
        if (renderedPart && isEditablePart(authoredPart)) startFrames[entryName] = partFrame(renderedPart);
      }
      if (Object.keys(startFrames).length > 1) {
        interaction = {
          type: 'groupMove',
          name,
          startMouse: { x: event.clientX, y: event.clientY },
          startFrames,
          startBounds: boundsForFrames(Object.values(startFrames)),
          smartTargets: smartTargetsExcluding(Object.keys(startFrames)),
        };
        activeLayerFrames = startFrames;
        window.addEventListener('mousemove', handleInteractionMove);
        window.addEventListener('mouseup', handleInteractionEnd);
        return;
      }
    }
    interaction = {
      type: 'move',
      name,
      startMouse: { x: event.clientX, y: event.clientY },
      startFrame: frame,
      smartTargets: smartTargetsExcluding([name]),
    };
    activeFrame = frame;
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
  }

  function beginResize(handle, event) {
    if (event.button !== 0 || !selectedPartEditable || !selectedFrame) return;
    event.stopPropagation();
    event.preventDefault();
    const layout = selectedAuthoredPart?._children?.Layout ?? {};
    interaction = {
      type: 'resize',
      handle,
      startMouse: { x: event.clientX, y: event.clientY },
      startFrame: selectedFrame,
      // Rotation + pivot captured so resize can stay aligned to a rotated shape.
      startRotation: numberOr(layout.rotation, 0),
      pivotX: numberOr(layout.pivotX, 50) / 100,
      pivotY: numberOr(layout.pivotY, 50) / 100,
    };
    activeFrame = selectedFrame;
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
  }

  function beginRotate(event) {
    if (event.button !== 0 || !selectedPartEditable || !selectedFrame) return;
    event.stopPropagation();
    event.preventDefault();
    const center = {
      x: selectedFrame.left + selectedFrame.width / 2,
      y: selectedFrame.top + selectedFrame.height / 2,
    };
    const artboardRect = event.currentTarget?.closest?.('.artboard')?.getBoundingClientRect?.();
    const pointer = artboardRect
      ? { x: (event.clientX - artboardRect.left) / surfaceZoom, y: (event.clientY - artboardRect.top) / surfaceZoom }
      : center;
    interaction = {
      type: 'rotate',
      center,
      startAngle: angleFromCenter(center.x, center.y, pointer.x, pointer.y),
      startRotation: numberOr(selectedAuthoredPart?._children?.Layout?.rotation, 0),
    };
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
  }

  function beginArcHandleDrag(handle, event) {
    if (event.button !== 0 || !selectedIsArc || !selectedFrame) return;
    event.stopPropagation();
    event.preventDefault();
    interaction = {
      type: 'arcHandle',
      handle,
      name: selectedLayer,
      startAngle: numberOr(selectedArcMeta?.startAngle, -135),
      startSweep: numberOr(selectedArcMeta?.sweepAngle, 270),
      frame: selectedFrame,
    };
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
  }

  function handleInteractionMove(event) {
    if (!interaction) return;
    if (interaction.type === 'move') {
      const dx = (event.clientX - interaction.startMouse.x) / surfaceZoom;
      const dy = (event.clientY - interaction.startMouse.y) / surfaceZoom;
      const raw = {
        ...interaction.startFrame,
        left: interaction.startFrame.left + dx,
        top: interaction.startFrame.top + dy,
      };
      const gridded = snapFrame(raw, event);
      if (smartSnapEnabled && !event.altKey) {
        const snapped = applySmartSnap(raw, gridded, interaction.smartTargets);
        activeFrame = snapped.frame;
        activeSmartGuides = snapped.guides;
      } else {
        activeFrame = gridded;
        activeSmartGuides = [];
      }
      return;
    }

    if (interaction.type === 'groupMove') {
      const dx = (event.clientX - interaction.startMouse.x) / surfaceZoom;
      const dy = (event.clientY - interaction.startMouse.y) / surfaceZoom;
      // Snap the selection's bounding box as a whole so the layers keep
      // their relative offsets while dragging.
      const startBounds = interaction.startBounds
        ?? boundsForFrames(Object.values(interaction.startFrames ?? {}));
      let boundsDx = dx;
      let boundsDy = dy;
      if (startBounds) {
        const rawBounds = { ...startBounds, left: startBounds.left + dx, top: startBounds.top + dy };
        const griddedBounds = snapFrame(rawBounds, event);
        let finalBounds = griddedBounds;
        if (smartSnapEnabled && !event.altKey) {
          const snapped = applySmartSnap(rawBounds, griddedBounds, interaction.smartTargets);
          finalBounds = snapped.frame;
          activeSmartGuides = snapped.guides;
        } else {
          activeSmartGuides = [];
        }
        boundsDx = finalBounds.left - startBounds.left;
        boundsDy = finalBounds.top - startBounds.top;
      }
      const nextFrames = {};
      for (const [name, startFrame] of Object.entries(interaction.startFrames ?? {})) {
        nextFrames[name] = {
          ...startFrame,
          left: startFrame.left + boundsDx,
          top: startFrame.top + boundsDy,
        };
      }
      activeLayerFrames = nextFrames;
      return;
    }

    if (interaction.type === 'zoneMove') {
      const dx = (event.clientX - interaction.startMouse.x) / surfaceZoom;
      const dy = (event.clientY - interaction.startMouse.y) / surfaceZoom;
      activeZoneFrame = snapFrame({
        ...interaction.startFrame,
        left: interaction.startFrame.left + dx,
        top: interaction.startFrame.top + dy,
      }, event);
      return;
    }

    if (interaction.type === 'resize') {
      const rotationDeg = interaction.startRotation || 0;
      const theta = (rotationDeg * Math.PI) / 180;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      // Convert the screen-space drag into the shape's local (un-rotated) axes,
      // so a handle resizes along the shape's own edges instead of the screen's.
      const sdx = (event.clientX - interaction.startMouse.x) / surfaceZoom;
      const sdy = (event.clientY - interaction.startMouse.y) / surfaceZoom;
      const dx = sdx * cos + sdy * sin;
      const dy = -sdx * sin + sdy * cos;

      const start = {
        x: interaction.startFrame.left,
        y: interaction.startFrame.top,
        w: interaction.startFrame.width,
        h: interaction.startFrame.height,
      };
      const rect = computeResizedRect(start, interaction.handle, dx, dy, {
        aspectLock: event.shiftKey,
        aspectRatio: start.w / Math.max(1, start.h),
        minW: 4,
        minH: 4,
        maxW: 0,
        maxH: 0,
      });

      if (Math.abs(rotationDeg) < 0.001) {
        activeFrame = snapFrame({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }, event);
        return;
      }

      // Rotation-aware placement: keep the anchored edge/corner fixed in world
      // space while the size changes, so the shape doesn't swing off the cursor.
      // The CSS rotation pivots about (pivotX%, pivotY%) of the box.
      const handle = interaction.handle;
      const px = interaction.pivotX;
      const py = interaction.pivotY;
      const rot = (vx, vy) => ({ x: vx * cos - vy * sin, y: vx * sin + vy * cos });
      // Local position (from top-left) of the anchored edge/corner that stays put.
      const anchorLocal = (w, h) => ({
        x: handle.includes('r') ? 0 : handle.includes('l') ? w : w / 2,
        y: handle.includes('b') ? 0 : handle.includes('t') ? h : h / 2,
      });
      const worldAnchorFor = (left, top, w, h) => {
        const pivot = { x: px * w, y: py * h };
        const a = anchorLocal(w, h);
        const off = rot(a.x - pivot.x, a.y - pivot.y);
        return { x: left + pivot.x + off.x, y: top + pivot.y + off.y };
      };

      const snapSize = (v) => ((snapEnabled && !event?.altKey) ? Math.max(1, snapValue(v, event)) : Math.max(1, v));
      const w1 = snapSize(rect.w);
      const h1 = snapSize(rect.h);

      // Anchor world point from the start frame, then solve for the new top-left
      // that keeps that same world point under the resized + rotated box.
      const world = worldAnchorFor(start.x, start.y, start.w, start.h);
      const pivot1 = { x: px * w1, y: py * h1 };
      const a1 = anchorLocal(w1, h1);
      const off1 = rot(a1.x - pivot1.x, a1.y - pivot1.y);

      activeFrame = {
        left: world.x - pivot1.x - off1.x,
        top: world.y - pivot1.y - off1.y,
        width: w1,
        height: h1,
      };
      return;
    }

    if (interaction.type === 'zoneResize') {
      const dx = (event.clientX - interaction.startMouse.x) / surfaceZoom;
      const dy = (event.clientY - interaction.startMouse.y) / surfaceZoom;
      const rect = computeResizedRect(
        {
          x: interaction.startFrame.left,
          y: interaction.startFrame.top,
          w: interaction.startFrame.width,
          h: interaction.startFrame.height,
        },
        interaction.handle,
        dx,
        dy,
        {
          aspectLock: event.shiftKey,
          aspectRatio: interaction.startFrame.width / Math.max(1, interaction.startFrame.height),
          minW: 4,
          minH: 4,
          maxW: 0,
          maxH: 0,
        }
      );
      activeZoneFrame = snapFrame({
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
      }, event);
      return;
    }

    if (interaction.type === 'rotate') {
      const artboard = document.querySelector('.surface-shell .artboard');
      const artboardRect = artboard?.getBoundingClientRect?.();
      if (!artboardRect) return;
      const pointer = { x: (event.clientX - artboardRect.left) / surfaceZoom, y: (event.clientY - artboardRect.top) / surfaceZoom };
      const angle = angleFromCenter(interaction.center.x, interaction.center.y, pointer.x, pointer.y);
      const rotation = computeRotation(interaction.startAngle, angle, interaction.startRotation, event.shiftKey);
      applyLayerPatch({ [`Parts.${selectedLayer}.Layout.rotation`]: normalizeRotation(rotation) });
    }

    if (interaction.type === 'arcHandle') {
      const artboard = document.querySelector('.surface-shell .artboard');
      const artboardRect = artboard?.getBoundingClientRect?.();
      if (!artboardRect) return;
      const pointer = { x: (event.clientX - artboardRect.left) / surfaceZoom, y: (event.clientY - artboardRect.top) / surfaceZoom };
      const center = {
        x: interaction.frame.left + interaction.frame.width / 2,
        y: interaction.frame.top + interaction.frame.height / 2,
      };
      let angle = Math.atan2(pointer.y - center.y, pointer.x - center.x) * (180 / Math.PI);
      if (event.shiftKey) angle = Math.round(angle / 15) * 15;
      if (interaction.handle === 'start') {
        updateControlProperty(core.id, `Parts.${interaction.name}.meta.arcTrack.startAngle`, normalizeRotation(angle));
      } else {
        const sweep = normalizeRotation(angle - interaction.startAngle);
        updateControlProperty(core.id, `Parts.${interaction.name}.meta.arcTrack.sweepAngle`, Math.max(1, Math.min(360, sweep || 360)));
      }
      return;
    }
  }

  function handleInteractionEnd() {
    if (!interaction) return;
    window.removeEventListener('mousemove', handleInteractionMove);
    window.removeEventListener('mouseup', handleInteractionEnd);

    if ((interaction.type === 'move' || interaction.type === 'resize') && activeFrame && selectedAuthoredPart) {
      applyLayerPatch(patchFromFrame(selectedAuthoredPart, activeFrame));
    }
    if (interaction.type === 'groupMove' && Object.keys(activeLayerFrames ?? {}).length) {
      const patch = {};
      for (const [name, frame] of Object.entries(activeLayerFrames)) {
        const authoredPart = authoredParts?._children?.[name];
        if (isEditablePart(authoredPart)) Object.assign(patch, patchFromFrameForLayer(name, authoredPart, frame));
      }
      applyControlPatch(core.id, patch);
    }
    if ((interaction.type === 'zoneMove' || interaction.type === 'zoneResize') && activeZoneFrame && selectedAuthoredZone) {
      applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, activeZoneFrame));
    }
    interaction = null;
    activeFrame = null;
    activeLayerFrames = {};
    activeZoneFrame = null;
    activeSmartGuides = [];
  }

  function nudgeSelected(dx, dy) {
    if (multiSelectionActive) {
      moveSelectedLayersBy(dx, dy);
      return;
    }
    if (!selectedPartEditable || activeSelectionKind !== 'layer' || !selectedFrame || !selectedAuthoredPart) return;
    const nextFrame = {
      ...selectedFrame,
      left: selectedFrame.left + dx,
      top: selectedFrame.top + dy,
    };
    applyLayerPatch(patchFromFrame(selectedAuthoredPart, nextFrame));
  }

  function nudgeSelectedZone(dx, dy) {
    if (!selectedZoneEditable || activeSelectionKind !== 'hitZone' || !selectedZoneFrame || !selectedAuthoredZone) return;
    const nextFrame = {
      ...selectedZoneFrame,
      left: selectedZoneFrame.left + dx,
      top: selectedZoneFrame.top + dy,
    };
    applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, nextFrame));
  }

  function beginDraw(event) {
    if (activeTool === 'select' || event.button !== 0) return false;
    event.stopPropagation();
    event.preventDefault();
    const start = pointInArtboard(event);
    drawDraft = {
      tool: activeTool,
      start,
      current: start,
      constrain: event.shiftKey,
    };
    window.addEventListener('mousemove', handleDrawMove);
    window.addEventListener('mouseup', handleDrawEnd);
    return true;
  }

  function commitClickDraw(event) {
    if (activeTool === 'select') return;
    event.stopPropagation();
    event.preventDefault();
    if (Date.now() - lastDrawCreatedAt < 260) return;
    const point = pointInArtboard(event);
    commitDrawnFrame(activeTool, frameFromClick(point, activeTool), event);
  }

  function handleDrawMove(event) {
    if (!drawDraft) return;
    const artboard = document.querySelector('.surface-shell .artboard');
    const rect = artboard?.getBoundingClientRect?.();
    if (!rect) return;
    drawDraft = {
      ...drawDraft,
      current: {
        x: Math.max(0, Math.min(artboardWidth, (event.clientX - rect.left) / surfaceZoom)),
        y: Math.max(0, Math.min(artboardHeight, (event.clientY - rect.top) / surfaceZoom)),
      },
      constrain: event.shiftKey,
    };
  }

  function handleDrawEnd(event = null) {
    if (!drawDraft) return;
    window.removeEventListener('mousemove', handleDrawMove);
    window.removeEventListener('mouseup', handleDrawEnd);

    let rect = snapFrame(draftRect(drawDraft));
    const tool = drawDraft.tool;
    const start = drawDraft.start;
    drawDraft = null;
    if (!core?.id || !rect) return;
    if (rect.width < 4 || rect.height < 4) {
      rect = frameFromClick(start, tool);
    }

    commitDrawnFrame(tool, rect, event);
  }

  function cancelDraw() {
    if (!drawDraft) return;
    window.removeEventListener('mousemove', handleDrawMove);
    window.removeEventListener('mouseup', handleDrawEnd);
    drawDraft = null;
  }

  function selectHitZone(name) {
    if (!core?.id || !name) return;
    pulseSelection(`zone:${name}`);
    applyControlPatch(core.id, {
      'Designer.selectedHitZone': name,
      'Designer.selectedSurfaceKind': 'hitZone',
      'Designer.selectedKit': '',
    });
  }

  function removeSelectedHitZone() {
    if (!core?.id || !selectedHitZone || !selectedAuthoredZone) return;
    removeControlNode(core.id, `HitZones.${selectedHitZone}`);
    const next = hitZoneEntries.find(([name]) => name !== selectedHitZone)?.[0] ?? '';
    applyControlPatch(core.id, {
      'Designer.selectedHitZone': next,
      'Designer.selectedSurfaceKind': next ? 'hitZone' : 'layer',
    });
  }

  function beginZoneMove(name, zone, event) {
    if (event.button !== 0) return;
    event.stopPropagation();
    selectHitZone(name);
    if (!isEditableZone(authoredHitZones?._children?.[name])) return;
    // Follow-mode zones derive their rect from the source part — moving the
    // overlay would be meaningless, so select-only.
    if (isFollowZone(zone)) return;
    const frame = zoneFrame(zone);
    interaction = {
      type: 'zoneMove',
      name,
      startMouse: { x: event.clientX, y: event.clientY },
      startFrame: frame,
    };
    activeZoneFrame = frame;
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
  }

  function beginZoneResize(handle, event) {
    if (event.button !== 0 || !selectedZoneEditable || !selectedZoneFrame) return;
    event.stopPropagation();
    event.preventDefault();
    interaction = {
      type: 'zoneResize',
      handle,
      startMouse: { x: event.clientX, y: event.clientY },
      startFrame: selectedZoneFrame,
    };
    activeZoneFrame = selectedZoneFrame;
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
  }

  function beginSurfacePan(event) {
    if (!surfaceScrollEl || !(spacePanActive || event.button === 1)) return;
    event.preventDefault();
    surfacePan = {
      x: event.clientX,
      y: event.clientY,
      left: surfaceScrollEl.scrollLeft,
      top: surfaceScrollEl.scrollTop,
    };
    window.addEventListener('mousemove', handleSurfacePanMove);
    window.addEventListener('mouseup', endSurfacePan);
  }

  function handleSurfaceScroll() {
    // Re-measure the board's visual corner: since the rulers hold scrollOffset
    // at 0, the contentOffset itself must move as the content scrolls.
    measureBoardOffset();
  }

  function handleSurfaceScrollMouseDown(event) {
    beginSurfacePan(event);
    if (event.defaultPrevented || activeTool === 'select' || event.button !== 0) return;
    if (event.target?.closest?.('.artboard')) return;
    showDrawNotice('Start drawing inside the artboard');
  }

  function handleSurfacePanMove(event) {
    if (!surfacePan || !surfaceScrollEl) return;
    surfaceScrollEl.scrollLeft = surfacePan.left - (event.clientX - surfacePan.x);
    surfaceScrollEl.scrollTop = surfacePan.top - (event.clientY - surfacePan.y);
  }

  function endSurfacePan() {
    window.removeEventListener('mousemove', handleSurfacePanMove);
    window.removeEventListener('mouseup', endSurfacePan);
    surfacePan = null;
  }

  function clearSurfaceSelection() {
    if (!core?.id) return;
    applyControlPatch(core.id, {
      'Designer.selectedSurfaceKind': 'artboard',
      'Designer.selectedLayer': '',
      'Designer.selectedLayers': [],
      'Designer.selectedHitZone': '',
      'Designer.selectedKit': '',
    });
    localSelectedLayerNames = [];
    inlineTextEditLayer = '';
  }

  function setSurfaceHover(kind, name) {
    hoveredSurfaceItem = { kind, name };
  }

  function clearSurfaceHover(kind, name) {
    if (hoveredSurfaceItem?.kind === kind && hoveredSurfaceItem?.name === name) {
      hoveredSurfaceItem = null;
    }
  }

  function cycleLayer(direction = 1) {
    if (!core?.id || !topDownPartEntries.length) return;
    const names = topDownPartEntries.map(([name]) => name);
    const currentIndex = Math.max(0, names.indexOf(selectedLayer));
    const nextIndex = (currentIndex + direction + names.length) % names.length;
    selectLayer(names[nextIndex]);
  }

  function cycleHitZone(direction = 1) {
    if (!core?.id || !hitZoneEntries.length) return;
    const names = hitZoneEntries.map(([name]) => name);
    const currentIndex = Math.max(0, names.indexOf(selectedHitZone));
    const nextIndex = (currentIndex + direction + names.length) % names.length;
    selectHitZone(names[nextIndex]);
  }

  // Window-level so nudge/delete/duplicate/tool keys keep working when focus
  // drifts off the surface — guarded so form fields and other focused editor
  // regions (e.g. the panel canvas) still receive their own keys.
  function surfaceKeyEventAllowed(event) {
    if (core?.controlType !== 'CustomComponent') return false;
    if (event.defaultPrevented) return false;
    const targetTag = String(event.target?.tagName ?? '').toLowerCase();
    if (['input', 'select', 'textarea'].includes(targetTag) || event.target?.isContentEditable) return false;
    const active = document.activeElement;
    if (active && active !== document.body && surfaceShellEl && !surfaceShellEl.contains(active)) return false;
    return true;
  }

  function handleSurfaceKeydown(event) {
    if (!surfaceKeyEventAllowed(event)) return;
    if (event.key === '?' && !(event.ctrlKey || event.metaKey || event.altKey)) {
      event.preventDefault();
      helpOverlayOpen = !helpOverlayOpen;
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      spacePanActive = true;
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (helpOverlayOpen) {
        helpOverlayOpen = false;
        return;
      }
      if (inlineTextEditLayer) {
        finishInlineTextEdit();
        return;
      }
      if (drawDraft) {
        cancelDraw();
        return;
      }
      if (shapeFlyoutOpen) {
        shapeFlyoutOpen = false;
        return;
      }
      if (activeTool !== 'select') {
        setActiveTool('select');
        return;
      }
      clearSurfaceSelection();
      return;
    }
    // Arpeggiator tool modes: 1–5 while an arpeggiator surface is active.
    if (arpeggiatorEnabled && !designerPreviewing && !(event.ctrlKey || event.metaKey || event.altKey)) {
      const nextArpTool = ARP_TOOL_KEYS[event.key];
      if (nextArpTool) {
        event.preventDefault();
        arpTool = nextArpTool;
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'c' && activeSelectionKind === 'layer' && selectedLayerNames.length) {
      event.preventDefault();
      copySelectedLayers();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'x' && activeSelectionKind === 'layer' && selectedLayerNames.length) {
      event.preventDefault();
      cutSelectedLayers();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'v' && hasPartClipboard()) {
      event.preventDefault();
      pasteClipboardLayers();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.altKey || activeSelectionKind === 'hitZone') {
        cycleHitZone(event.shiftKey ? -1 : 1);
      } else {
        cycleLayer(event.shiftKey ? -1 : 1);
      }
      return;
    }
    if (activeSelectionKind === 'layer' && canManageLayer && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      removeSelectedLayer();
      return;
    }
    if (activeSelectionKind === 'hitZone' && selectedAuthoredZone && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      removeSelectedHitZone();
      return;
    }
    if (activeSelectionKind === 'kit' && selectedKitEntry && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      removeSelectedKit();
      return;
    }
    if (activeSelectionKind === 'layer' && canManageLayer && event.key.toLowerCase() === 'd' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      duplicateSelectedLayer();
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      if (activeSelectionKind === 'hitZone') nudgeSelectedZone(dx, dy);
      else nudgeSelected(dx, dy);
      return;
    }
    const keyTool = DRAW_TOOLS.find((tool) => tool.key.toLowerCase() === String(event.key ?? '').toLowerCase());
    if (keyTool && !(event.ctrlKey || event.metaKey || event.altKey)) {
      event.preventDefault();
      setActiveTool(keyTool.id);
    }
  }

  function handleSurfaceKeyup(event) {
    if (core?.controlType !== 'CustomComponent') return;
    if (event.code === 'Space') {
      spacePanActive = false;
      endSurfacePan();
    }
  }
</script>

<svelte:window onkeydown={handleSurfaceKeydown} onkeyup={handleSurfaceKeyup} />

{#if core?.controlType === 'CustomComponent'}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="surface-shell"
    class:previewing={designerPreviewing}
    class:palette-collapsed={paletteCollapsed}
    class:dock-hidden={dockHidden}
    style={surfaceGridCols}
    role="application"
    aria-label="Custom component design surface"
    tabindex="0"
    bind:this={surfaceShellEl}
  >
    {#if !designerPreviewing}
    <div class="surface-lookbar" aria-label="Component look bar">
      {#if activeSelectionKind === 'layer' && selectedPart}
      <div class="paint-strip" class:disabled={!canPaintLayer} aria-label="Layer paint controls">
        {#if selectedBackground}
          {#if !selectedIsArc}
            <label class="paint-swatch">
              <span>Fill</span>
              <button
                type="button"
                class="fill-toggle"
                class:active={selectedFill?.solidEnabled !== false}
                disabled={!canPaintLayer}
                title={selectedFill?.solidEnabled !== false ? 'Make transparent' : 'Enable fill'}
                onclick={() => setLayerProperty('Background.Fill.solidEnabled', selectedFill?.solidEnabled !== false ? false : true)}
              ></button>
              <button type="button" class="mini-swatch-btn"
                disabled={!canPaintLayer || selectedFill?.solidEnabled === false}
                style={swatchCss(selectedFill?.colour)}
                onclick={() => openLayerColour('Background.Fill.colour', selectedFill?.colour)}
                title="Pick fill colour"
              ></button>
            </label>
          {/if}
          {#if selectedFill?.gradientEnabled}
            <label class="paint-swatch">
              <span>Grad</span>
              <button type="button" class="mini-gradient-btn"
                disabled={!canPaintLayer}
                style="background:{gradientToCSS(selectedFill?.gradient, 'rectangle')}"
                onclick={openLayerGradient}
                title="Edit gradient"
              ></button>
            </label>
          {/if}
          <label class="paint-swatch">
            <span>Gradient</span>
            <button type="button" class="fill-toggle"
              class:active={selectedFill?.gradientEnabled}
              disabled={!canPaintLayer}
              onclick={toggleFillGradient}
              title={selectedFill?.gradientEnabled ? 'Disable gradient' : 'Enable gradient'}
            >G</button>
          </label>
          <label class="paint-swatch">
            <span>Stroke</span>
              <button type="button" class="mini-swatch-btn"
                disabled={!canPaintLayer}
                style={swatchCss(selectedBorder?.colour, 'FFFFFF')}
                onclick={() => openLayerColour('Background.Border.colour', selectedBorder?.colour)}
                title="Pick stroke colour"
              ></button>
          </label>
          <label class="paint-number">
            <span>W</span>
            <input
              type="number"
              min="0"
              max="32"
              step="1"
              value={numberOr(selectedBorder?.thickness, 0)}
              disabled={!canPaintLayer}
              onchange={(event) => setLayerProperty('Background.Border.thickness', numericInputValue(event, 0))}
            />
          </label>
          <label class="paint-number">
            <span>R</span>
            <input
              type="number"
              min="0"
              max="999"
              step="1"
              value={numberOr(selectedCorners?.radius, 0)}
              disabled={!canPaintLayer}
              onchange={(event) => setLayerProperty('Background.Corners.radius', numericInputValue(event, 0))}
            />
          </label>
        {/if}

        {#if selectedText}
          <label class="paint-swatch">
            <span>Text</span>
              <button type="button" class="mini-swatch-btn"
                disabled={!canPaintLayer}
                style={swatchCss(selectedTextFill?.colour, 'FFFFFF')}
                onclick={() => openLayerColour('Text.Fill.colour', selectedTextFill?.colour)}
                title="Pick text colour"
              ></button>
          </label>
          <label class="paint-number text-size">
            <span>Size</span>
            <input
              type="number"
              min="6"
              max="144"
              step="1"
              value={numberOr(selectedTextFont?.size, 12)}
              disabled={!canPaintLayer}
              onchange={(event) => setLayerProperty('Text.Font.size', numericInputValue(event, 12))}
            />
          </label>
          <label class="text-content-field">
            <span>Content</span>
            <input
              type="text"
              value={selectedText?.content ?? ''}
              disabled={!canPaintLayer}
              oninput={(event) => setLayerProperty('Text.content', event.currentTarget.value)}
            />
          </label>
        {/if}

        <label class="paint-opacity">
          <span>Opacity</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={numberOr(selectedAuthoredPart?.opacity, 1)}
            disabled={!canPaintLayer}
            oninput={(event) => setLayerProperty('opacity', numericInputValue(event, 1))}
          />
          <strong>{Math.round(numberOr(selectedAuthoredPart?.opacity, 1) * 100)}%</strong>
        </label>
      </div>
      {:else}
        <div class="lookbar-empty">Select a layer to edit its look</div>
      {/if}
      <div class="lookbar-scripts" aria-label="Component scripts">
        <div class="lb-s-row">
          <span class="lb-s-chip">SCRIPTS</span>
          {#if componentScriptList.length > 0}
            <span class="lb-s-count">{componentScriptList.length} script{componentScriptList.length === 1 ? '' : 's'}</span>
            <span class={['lb-s-badge', componentScriptsEnabled ? 'on' : 'off']}>{componentScriptsEnabled ? 'on' : 'off'}</span>
          {:else}
            <span class="lb-s-none">none</span>
          {/if}
        </div>
        <div class="lb-s-row">
          <span class="lb-s-hint">{componentScriptList.length > 0 ? 'logic attached' : 'no logic attached'}</span>
          <button type="button" class="lb-s-btn" onclick={openComponentScripts} title="Open the Script Editor for this component">Script Editor</button>
        </div>
      </div>
    </div>
    {/if}

    {#if activeSelectionKind === 'layer' && selectedPart}
      <div class="layer-action-strip" class:disabled={!canManageLayer} aria-label="Selected layer actions">
        <label class="rename-field">
          <span>Name</span>
          <input
            type="text"
            value={selectedLayer}
            disabled={!canManageLayer}
            onblur={renameSelectedLayer}
            onchange={renameSelectedLayer}
          />
        </label>
        {#if canDetachLayer}
          <button class="action-icon detach" type="button" onclick={detachSelectedLayer} title="Detach generated layer">
            <Scissors size={14} aria-hidden="true" />
            <span>Detach</span>
          </button>
        {/if}
        <button class="action-icon" type="button" onclick={duplicateSelectedLayer} disabled={!canManageLayer} title="Duplicate layer">
          <Copy size={14} aria-hidden="true" />
          <span>Duplicate</span>
        </button>
        <button class="action-icon square" type="button" onclick={() => moveSelectedLayer(1)} disabled={!canManageLayer} title="Bring forward">
          <ArrowUp size={14} aria-hidden="true" />
        </button>
        <button class="action-icon square" type="button" onclick={() => moveSelectedLayer(-1)} disabled={!canManageLayer} title="Send backward">
          <ArrowDown size={14} aria-hidden="true" />
        </button>
        <button class="action-icon square" type="button" onclick={toggleSelectedVisibility} disabled={!canManageLayer} title={selectedAuthoredPart?.visible === false ? 'Show layer' : 'Hide layer'}>
          {#if selectedAuthoredPart?.visible === false}
            <Eye size={14} aria-hidden="true" />
          {:else}
            <EyeOff size={14} aria-hidden="true" />
          {/if}
        </button>
        <button class="action-icon square" type="button" onclick={toggleSelectedLock} disabled={!canManageLayer} title={selectedAuthoredPart?.locked === true ? 'Unlock layer' : 'Lock layer'}>
          {#if selectedAuthoredPart?.locked === true}
            <Unlock size={14} aria-hidden="true" />
          {:else}
            <Lock size={14} aria-hidden="true" />
          {/if}
        </button>
        <button class="action-icon square danger" type="button" onclick={removeSelectedLayer} disabled={!canManageLayer} title="Delete layer">
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    {/if}

    {#if !designerPreviewing && activeSelectionFrame && ((activeSelectionKind === 'layer' && selectedPart) || (activeSelectionKind === 'hitZone' && selectedZone))}
      <div class="precision-strip" aria-label="Selection precision controls">
        <label>
          <span>X</span>
          <input
            type="number"
            value={Math.round(activeSelectionFrame.left)}
            disabled={activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable}
            onchange={(event) => {
              const frame = { ...activeSelectionFrame, left: numericInputValue(event, activeSelectionFrame.left) };
              if (activeSelectionKind === 'hitZone') applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, frame));
              else applyLayerPatch(patchFromFrame(selectedAuthoredPart, frame));
            }}
          />
        </label>
        <label>
          <span>Y</span>
          <input
            type="number"
            value={Math.round(activeSelectionFrame.top)}
            disabled={activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable}
            onchange={(event) => {
              const frame = { ...activeSelectionFrame, top: numericInputValue(event, activeSelectionFrame.top) };
              if (activeSelectionKind === 'hitZone') applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, frame));
              else applyLayerPatch(patchFromFrame(selectedAuthoredPart, frame));
            }}
          />
        </label>
        <label>
          <span>W</span>
          <input
            type="number"
            min="1"
            value={Math.round(activeSelectionFrame.width)}
            disabled={activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable}
            onchange={(event) => {
              const frame = { ...activeSelectionFrame, width: Math.max(1, numericInputValue(event, activeSelectionFrame.width)) };
              if (activeSelectionKind === 'hitZone') applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, frame));
              else applyLayerPatch(patchFromFrame(selectedAuthoredPart, frame));
            }}
          />
        </label>
        <label>
          <span>H</span>
          <input
            type="number"
            min="1"
            value={Math.round(activeSelectionFrame.height)}
            disabled={activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable}
            onchange={(event) => {
              const frame = { ...activeSelectionFrame, height: Math.max(1, numericInputValue(event, activeSelectionFrame.height)) };
              if (activeSelectionKind === 'hitZone') applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, frame));
              else applyLayerPatch(patchFromFrame(selectedAuthoredPart, frame));
            }}
          />
        </label>
        {#if activeSelectionKind === 'layer'}
          <label>
            <span>Rot</span>
            <input
              type="number"
              step="1"
              value={Math.round(numberOr(selectedAuthoredPart?._children?.Layout?.rotation, 0))}
              disabled={!selectedPartEditable}
              onchange={(event) => setLayerLayoutProperty('rotation', normalizeRotation(numericInputValue(event, 0)))}
            />
          </label>
        {/if}
        <button type="button" onclick={() => alignSelection('left')} title="Align left">Left</button>
        <button type="button" onclick={() => alignSelection('centerX')} title="Align horizontal center">Center X</button>
        <button type="button" onclick={() => alignSelection('right')} title="Align right">Right</button>
        <button type="button" onclick={() => alignSelection('top')} title="Align top">Top</button>
        <button type="button" onclick={() => alignSelection('centerY')} title="Align vertical center">Center Y</button>
        <button type="button" onclick={() => alignSelection('bottom')} title="Align bottom">Bottom</button>
      </div>
    {/if}

    {#if !designerPreviewing && selectedIsArc}
      <div class="arc-strip" aria-label="Arc controls">
        <strong>Arc</strong>
        <label>
          <span>Start</span>
          <input
            type="number"
            step="1"
            value={Math.round(numberOr(selectedArcMeta?.startAngle, -135))}
            onchange={(event) => setArcMetaProperty('startAngle', normalizeRotation(numericInputValue(event, -135)))}
          />
        </label>
        <label>
          <span>Sweep</span>
          <input
            type="number"
            min="1"
            max="360"
            step="1"
            value={Math.round(numberOr(selectedArcMeta?.sweepAngle, 270))}
            onchange={(event) => setArcMetaProperty('sweepAngle', Math.max(1, Math.min(360, numericInputValue(event, 270))))}
          />
        </label>
        <label>
          <span>Thick</span>
          <input
            type="number"
            min="1"
            max="48"
            step="1"
            value={Math.round(numberOr(selectedArcMeta?.thickness, 4))}
            onchange={(event) => {
              const thickness = Math.max(1, Math.min(48, numericInputValue(event, 4)));
              setArcMetaProperty('thickness', thickness);
              setLayerProperty('Background.Border.thickness', thickness);
            }}
          />
        </label>
        <label>
          <span>Colour</span>
          <button type="button" class="mini-swatch-btn"
            style={swatchCss(selectedArcMeta?.colour, '5B9BD5')}
            onclick={openArcColour}
            title="Pick arc colour"
          ></button>
        </label>
        <div class="arc-toggle-group">
          <button
            type="button"
            class:active={selectedArcMeta?.direction !== 'ccw'}
            onclick={() => setArcMetaProperty('direction', 'cw')}
            title="Clockwise"
          >CW</button>
          <button
            type="button"
            class:active={selectedArcMeta?.direction === 'ccw'}
            onclick={() => setArcMetaProperty('direction', 'ccw')}
            title="Counter-clockwise"
          >CCW</button>
        </div>
        <div class="arc-toggle-group">
          <button
            type="button"
            class:active={selectedArcMeta?.cap !== 'round'}
            onclick={() => setArcMetaProperty('cap', 'flat')}
            title="Flat end caps"
          >Flat</button>
          <button
            type="button"
            class:active={selectedArcMeta?.cap === 'round'}
            onclick={() => setArcMetaProperty('cap', 'round')}
            title="Round end caps"
          >Round</button>
        </div>
      </div>
    {/if}

    {#if !designerPreviewing && selectedIsWaveformIcon}
      <div class="arc-strip" aria-label="Waveform presets">
        <strong>Waveform</strong>
        <div class="arc-toggle-group">
          {#each WAVEFORM_SHAPES as shape (shape.id)}
            <button
              type="button"
              class:active={String(selectedWaveformMeta?.type ?? 'sine') === shape.id}
              onclick={() => applyRendererPreset(waveformIconPresetPatch(selectedLayer, { shape }))}
              title={`${shape.label} waveform`}
            >{shape.label}</button>
          {/each}
        </div>
        <span class="preset-label">Colour</span>
        <div class="preset-swatches">
          {#each RENDERER_COLOR_PRESETS as preset (preset.id)}
            <button
              type="button"
              class="mini-swatch-btn"
              class:active={String(selectedWaveformMeta?.stroke ?? '') === preset.stroke}
              style={swatchCss(preset.stroke, 'EAF0F6')}
              onclick={() => applyRendererPreset(waveformIconPresetPatch(selectedLayer, { colorPreset: preset }))}
              title={`${preset.label} colour preset`}
            ></button>
          {/each}
        </div>
      </div>
    {/if}

    {#if !designerPreviewing && selectedIsEnvelopePath}
      <div class="arc-strip" aria-label="Envelope presets">
        <strong>Envelope</strong>
        <div class="arc-toggle-group">
          {#each ENVELOPE_SHAPE_PRESETS as shape (shape.id)}
            <button
              type="button"
              onclick={() => applyRendererPreset(envelopePathPresetPatch(selectedLayer, { shape }))}
              title={`${shape.label}: A ${shape.attack} D ${shape.decay} S ${shape.sustain} R ${shape.release}`}
            >{shape.label}</button>
          {/each}
        </div>
        <span class="preset-label">Colour</span>
        <div class="preset-swatches">
          {#each RENDERER_COLOR_PRESETS as preset (preset.id)}
            <button
              type="button"
              class="mini-swatch-btn"
              class:active={String(selectedEnvelopeMeta?.stroke ?? '') === preset.stroke}
              style={swatchCss(preset.stroke, '65E6A0')}
              onclick={() => applyRendererPreset(envelopePathPresetPatch(selectedLayer, { colorPreset: preset }))}
              title={`${preset.label} colour preset`}
            ></button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="surface-options-strip" aria-label="Surface view + zoom options">
      <div class="surface-toolbar-left">
      <div class="zone-mode-control creator-mode" role="radiogroup" aria-label="Creator mode" title="Simple hides the raw graph editors; Advanced shows the full component graph">
        <button type="button" class:active={$creatorMode === 'simple'} onclick={() => creatorMode.set('simple')}>Simple</button>
        <button type="button" class:active={$creatorMode === 'advanced'} onclick={() => creatorMode.set('advanced')}>Adv</button>
      </div>
      <label class="toggle-option">
        <input type="checkbox" checked={snapEnabled} onchange={(event) => { snapEnabled = event.currentTarget.checked; }} />
        <span>Snap</span>
      </label>
      <label class="snap-size">
        <span>Grid</span>
        <input
          type="number"
          min="1"
          max="64"
          step="1"
          value={snapSize}
          disabled={!snapEnabled}
          onchange={(event) => setSnapSize(event.currentTarget.value)}
        />
      </label>
      <label class="toggle-option" title="Snap moves to other parts' edges/centers and the artboard (Alt bypasses)">
        <input type="checkbox" checked={smartSnapEnabled} onchange={(event) => { smartSnapEnabled = event.currentTarget.checked; }} />
        <span>Smart</span>
      </label>
      <label class="toggle-option" title="Show pixel gaps between two selected layers">
        <input type="checkbox" checked={measureEnabled} onchange={(event) => { measureEnabled = event.currentTarget.checked; }} />
        <span>Measure</span>
      </label>
      <label class="toggle-option">
        <input type="checkbox" checked={showBounds} onchange={(event) => setPreviewFlag('showBounds', event.currentTarget.checked)} />
        <span>Bounds</span>
      </label>
      <label class="toggle-option" title="Show generated layer names, such as dial tick names, on the canvas">
        <input type="checkbox" checked={showGeneratedLabels} onchange={(event) => setPreviewFlag('showGeneratedLabels', event.currentTarget.checked)} />
        <span>Gen Names</span>
      </label>
      <label class="toggle-option">
        <input type="checkbox" checked={showHitZones} onchange={(event) => setPreviewFlag('showHitZones', event.currentTarget.checked)} />
        <span>Zones</span>
      </label>
      <div class="zone-mode-control" aria-label="Zone display mode">
        <button type="button" class:active={zoneDisplayMode === 'selected'} onclick={() => setZoneDisplayMode('selected')} title="Show only the selected hit zone">Sel</button>
        <button type="button" class:active={zoneDisplayMode === 'dim'} onclick={() => setZoneDisplayMode('dim')} title="Show all hit zones dimmed">Dim</button>
        <button type="button" class:active={zoneDisplayMode === 'all'} onclick={() => setZoneDisplayMode('all')} title="Show all hit zones">All</button>
      </div>
      {#if arpeggiatorEnabled}
        <label class="snap-size">
          <span>Steps</span>
          <input
            type="number"
            min="1"
            max="256"
            step="1"
            value={arpStepCount}
            oninput={(event) => setArpStepCount(event.currentTarget.value)}
            onchange={(event) => setArpStepCount(event.currentTarget.value)}
          />
        </label>
        <div class="zone-mode-control" aria-label="Arpeggiator octave">
          <button type="button" onclick={() => shiftArpOctave(-1)} title="Show lower octave">Oct -</button>
          <button type="button" onclick={() => shiftArpOctave(1)} title="Show higher octave">Oct +</button>
        </div>
        <button type="button" class="surface-command danger" onclick={removeSelectedArpBlock} disabled={!arpSelectedBlock} title="Delete selected note block">Delete Note</button>
      {/if}
      <button type="button" class="surface-command" onclick={resetToBlankCanvas} title="Clear this component to a blank drawing canvas">Blank</button>
      <button type="button" class="surface-command accent" onclick={addDialKit} title="Add a circular value control">Dial</button>
      <button type="button" class="surface-command accent" onclick={addHorizontalScaleKit} title="Add a horizontal value scale with ticks">H Scale</button>
      <button type="button" class="surface-command accent" onclick={addVerticalScaleKit} title="Add a vertical value scale with ticks">V Scale</button>
      <button type="button" class="surface-command accent" onclick={addArpeggiatorKit} title="Add a graphical arpeggiator step editor">Arp Kit</button>
      <button type="button" class="surface-command" class:accent={helpOverlayOpen} onclick={() => { helpOverlayOpen = !helpOverlayOpen; }} title="Shortcuts &amp; glossary (?)">?</button>
      </div>

      <div class="surface-zoombar" aria-label="Zoom controls">
        <button type="button" class="szb-btn" onclick={() => zoomStep(-surfaceZoomIncrement)} title="Zoom out">−</button>
        {#if zoomEditing}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="szb-zoom-input" type="text" bind:value={zoomEditValue} onblur={commitZoomEdit} onkeydown={zoomEditKeydown} onfocus={(event) => event.target.select()} autofocus />
        {:else}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="szb-zoom-value" ondblclick={startZoomEdit} title="Double-click to type a value">{Math.round(surfaceZoom * 100)}%</span>
        {/if}
        <button type="button" class="szb-btn" onclick={() => zoomStep(surfaceZoomIncrement)} title="Zoom in">+</button>
        <span class="szb-inc-label">Dec/Inc</span>
        <input class="szb-inc-input" type="number" value={surfaceZoomIncrement} onchange={(event) => setZoomIncrement(event.currentTarget.value)} min="1" max="100" />
        <div class="szb-divider"></div>
        <button type="button" class="szb-btn icon" onclick={() => setZoom(1)} title="Reset to 100%">⊡</button>
        <button type="button" class="szb-btn icon" onclick={fitArtboardToView} title="Fit to window"><Maximize size={12} strokeWidth={1.6} /></button>
        <div class="szb-divider"></div>
        <button type="button" class="szb-btn icon" class:toggle-on={surfaceShowRulers} onclick={() => { surfaceShowRulers = !surfaceShowRulers; }} title="Toggle rulers"><Ruler size={12} strokeWidth={1.6} /></button>
      </div>
    </div>

      <aside class="palette-panel" aria-label="Designer quick tools">
        <div class="palette-scroll">
        <div class="palette-header">
          <strong>Shapes</strong>
          <span>Draw and style</span>
        </div>

        <section class="palette-group">
          <span>Basic</span>
          <div class="palette-grid">
            {#each SHAPE_TOOLS as tool (tool.id)}
              <button
                type="button"
                class:active={activeTool === tool.id}
                title={`${tool.label} (${tool.key})`}
                onclick={() => setActiveTool(tool.id)}
              >
                <span class={`tool-icon ${tool.id}`}></span>
              </button>
            {/each}
          </div>
        </section>

        <section class="palette-group">
          <span>Lines &amp; Polygons</span>
          <div class="palette-grid">
            {#each VECTOR_SHAPE_TOOLS as tool (tool.id)}
              <button
                type="button"
                class:active={activeTool === tool.id}
                title={tool.label}
                onclick={() => setActiveTool(tool.id)}
              >
                {#if tool.id === 'line'}
                  <span class="poly-glyph line-glyph"></span>
                {:else}
                  <span class="poly-glyph" style={`clip-path:${clipPathForKind(tool.id)}`}></span>
                {/if}
              </button>
            {/each}
          </div>
        </section>

        <section class="palette-group">
          <span>Value Controls</span>
          <div class="palette-grid">
            <button type="button" onclick={addDialKit} title="Add circular dial value control">
              <span class="palette-glyph dial"></span>
            </button>
            <button type="button" onclick={addHorizontalScaleKit} title="Add horizontal tick scale">
              <span class="palette-glyph hscale"></span>
            </button>
            <button type="button" onclick={addVerticalScaleKit} title="Add vertical tick scale">
              <span class="palette-glyph vscale"></span>
            </button>
            <button type="button" onclick={addArpeggiatorKit} title="Add graphical arpeggiator kit">
              <span class="palette-glyph grid"></span>
            </button>
            <button type="button" onclick={addHitZoneAtCenter} title="Add hit zone">
              <span class="tool-icon hitZone"></span>
            </button>
            <button type="button" onclick={() => addLayerAtCenter('text')} title="Add text layer">
              <span class="tool-icon text"></span>
            </button>
          </div>
        </section>

        <section class="palette-group">
          <span>Pen</span>
          <div class="palette-grid brush-grid">
            <button type="button" class:active={activeTool === 'arcTrack'} onclick={() => setActiveTool('arcTrack')} title="Arc pen">
              <span class="brush-preview thin"></span>
            </button>
            <button type="button" class:active={activeTool === 'ring'} onclick={() => setActiveTool('ring')} title="Ring pen">
              <span class="brush-preview soft"></span>
            </button>
            <button type="button" class:active={activeTool === 'capsule'} onclick={() => setActiveTool('capsule')} title="Capsule pen">
              <span class="brush-preview bold"></span>
            </button>
          </div>
          <label class="palette-stepper">
            <span>Size</span>
            <input
              type="number"
              min="1"
              max="24"
              value={Math.round(numberOr(selectedBorder?.thickness, 1))}
              disabled={!canPaintLayer}
              onfocus={(event) => event.target.select()}
              onchange={(event) => setLayerProperty('Background.Border.thickness', numericInputValue(event, 1))}
            />
            <strong>px</strong>
          </label>
        </section>

        <section class="palette-group">
          <span>Fill</span>
          <label class="palette-swatch-row">
            <button type="button" class="mini-swatch-btn"
              disabled={!canPaintLayer || !selectedBackground}
              style={swatchCss(selectedFill?.colour)}
              onclick={() => openLayerColour('Background.Fill.colour', selectedFill?.colour)}
              title="Pick fill colour"
            ></button>
            <code>{selectedFill?.colour ? `#${String(selectedFill.colour).slice(-6)}` : '#14B8A6'}</code>
            <span class="swatch-num" title="Layer opacity (lower = more transparent)">
              <input
                type="number"
                min="0"
                max="100"
                value={Math.round(numberOr(selectedAuthoredPart?.opacity, 1) * 100)}
                disabled={!canPaintLayer || !selectedBackground}
                onfocus={(event) => event.target.select()}
                onchange={(event) => setLayerProperty('opacity', Math.max(0, Math.min(1, numericInputValue(event, 100) / 100)))}
              />%
            </span>
          </label>
        </section>

        <section class="palette-group">
          <span>Gradient</span>
          <div class="palette-grid compact">
            <button type="button"
              class:active={selectedFill?.gradientEnabled}
              disabled={!canPaintLayer || !selectedBackground}
              onclick={toggleFillGradient}
              title={selectedFill?.gradientEnabled ? 'Disable gradient fill' : 'Enable gradient fill'}
            >G</button>
            {#if selectedFill?.gradientEnabled && selectedFill?.gradient}
              <button type="button" class="mini-gradient-btn wide"
                disabled={!canPaintLayer}
                style="background:{gradientToCSS(selectedFill?.gradient, 'rectangle')}"
                onclick={openLayerGradient}
                title="Edit gradient"
              ></button>
            {/if}
          </div>
        </section>

        <section class="palette-group">
          <span>Stroke</span>
          <label class="palette-swatch-row">
              <button type="button" class="mini-swatch-btn"
                disabled={!canPaintLayer || !selectedBackground}
                style={swatchCss(selectedBorder?.colour, 'FFFFFF')}
                onclick={() => openLayerColour('Background.Border.colour', selectedBorder?.colour)}
                title="Pick stroke colour"
              ></button>
            <code>{selectedBorder?.colour ? `#${String(selectedBorder.colour).slice(-6)}` : '#FFFFFF'}</code>
            <span class="swatch-num" title="Stroke thickness">
              <input
                type="number"
                min="0"
                max="999"
                value={Math.round(numberOr(selectedBorder?.thickness, 1))}
                disabled={!canPaintLayer || !selectedBackground}
                onfocus={(event) => event.target.select()}
                onchange={(event) => setLayerProperty('Background.Border.thickness', numericInputValue(event, 1))}
              />px
            </span>
          </label>
        </section>

        <section class="palette-group">
          <span>Path Operations</span>
          <div class="palette-grid compact">
            <button type="button" onclick={duplicateSelectedLayer} disabled={!canManageLayer} title="Duplicate">
              <Copy size={14} aria-hidden="true" />
            </button>
            <button type="button" onclick={() => moveSelectedLayerToExtreme('front')} disabled={!canManageLayer} title="Bring to front">
              <ArrowUp size={14} aria-hidden="true" />
            </button>
            <button type="button" onclick={() => moveSelectedLayerToExtreme('back')} disabled={!canManageLayer} title="Send to back">
              <ArrowDown size={14} aria-hidden="true" />
            </button>
            <button type="button" onclick={toggleSelectedLock} disabled={!canManageLayer} title="Toggle lock">
              {#if selectedAuthoredPart?.locked === true}
                <Unlock size={14} aria-hidden="true" />
              {:else}
                <Lock size={14} aria-hidden="true" />
              {/if}
            </button>
          </div>
        </section>

        <section class="palette-group">
          <span>Corner</span>
          <label class="palette-corner">
            <input
              type="number"
              min="0"
              max="999"
              value={numberOr(selectedCorners?.radius, 0)}
              disabled={!canPaintLayer || !selectedBackground}
              onchange={(event) => setLayerProperty('Background.Corners.radius', numericInputValue(event, 0))}
            />
            <strong>radius</strong>
          </label>
        </section>
        </div>
        <div class="palette-toggles" aria-label="Panel toggles">
          <button type="button" class:active={!paletteCollapsed} title={paletteCollapsed ? 'Expand the Shapes palette' : 'Collapse the Shapes palette'} onclick={() => { paletteCollapsed = !paletteCollapsed; }}>
            <PanelLeft size={18} strokeWidth={1.6} />
          </button>
          <button type="button" class:active={!dockHidden} title="Toggle the inspector (right)" onclick={() => { dockHidden = !dockHidden; }}>
            <PanelRight size={18} strokeWidth={1.6} />
          </button>
          <button type="button" class:active={!displayDockHidden} title="Toggle the Display panel (colours / gradient / align)" onclick={() => { displayDockHidden = !displayDockHidden; }}>
            <PanelBottom size={18} strokeWidth={1.6} />
          </button>
        </div>
      </aside>

      <div class="surface-viewport" class:rulers-hidden={!surfaceShowRulers}>
        {#if surfaceShowRulers}
        <EditorRuler
          orientation="horizontal"
          length={rulerViewWidth}
          scrollOffset={0}
          contentOffset={boardOffsetX}
          scale={surfaceZoom}
          gridStep={snapSize}
          markers={rulerMarkersX}
        />
        <EditorRuler
          orientation="vertical"
          length={rulerViewHeight}
          scrollOffset={0}
          contentOffset={boardOffsetY}
          scale={surfaceZoom}
          gridStep={snapSize}
          markers={rulerMarkersY}
        />
        {/if}
        <div
          class="surface-scroll"
          class:space-pan={spacePanActive}
          class:panning={!!surfacePan}
          role="region"
          aria-label="Design canvas scroll area"
          style={surfaceGridStyle}
          bind:this={surfaceScrollEl}
          bind:clientWidth={rulerViewWidth}
          bind:clientHeight={rulerViewHeight}
          onscroll={handleSurfaceScroll}
          onmousedown={handleSurfaceScrollMouseDown}
          onwheel={handleSurfaceWheel}
        >
        {#if drawNotice}
          <div class="draw-notice">{drawNotice}</div>
        {/if}
        {#if !designerPreviewing && !readinessNudgeDismissed && readinessNudgeSteps.length}
          <div class="readiness-nudge" role="status">
            <strong>Not reusable yet:</strong>
            {#each readinessNudgeSteps as step (step.id)}
              <span class={`nudge-step ${step.severity}`}>{step.label} — {step.detail}</span>
            {/each}
            <button type="button" onclick={() => { readinessNudgeDismissed = true; }} title="Dismiss">×</button>
          </div>
        {/if}
        <div class="surface-pad">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="artboard"
            class:drawing={activeTool !== 'select'}
            style={artboardStyle}
            onclick={() => { if (!designerPreviewing) clearSurfaceSelection(); }}
            onmousedown={(event) => { if (!designerPreviewing && !beginDraw(event)) clearSurfaceSelection(); }}
          >
            {#if !designerPreviewing && surfaceNameTrayEntries.length}
              <div class="surface-name-tray" onmousedown={stopSelectionAction} onclick={stopSelectionAction}>
                {#each surfaceNameTrayEntries as entry (`${entry.kind}:${entry.label}`)}
                  <span class:hit-zone-label={entry.kind === 'hitZone'} class:kit-label={entry.kind === 'kit'}>{entry.label}</span>
                {/each}
              </div>
            {/if}

            {#if designerPreviewing}
              <div
                class="designer-live-preview"
                onmousedown={stopSelectionAction}
                onclick={stopSelectionAction}
              >
                <InteractiveTestSurface
                  {control}
                  session={livePreviewSession ?? createInteractionPreviewSession(control)}
                  onpatchsession={patchLivePreviewSession}
                  compact={true}
                />
              </div>
            {/if}

            {#if !designerPreviewing && activeTool !== 'select'}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="draw-capture"
                aria-hidden="true"
                onmousedown={beginDraw}
                onclick={commitClickDraw}
              ></div>
            {/if}

            {#each partEntries as [name, part] (name)}
              <InteractivePartRenderer
                part={renderPartForFrame(name, part)}
                parentWidth={artboardWidth}
                parentHeight={artboardHeight}
              />
            {/each}

            {#if !designerPreviewing && arpeggiatorEnabled}
              <CustomArpeggiatorEditor
                {arpeggiatorEnabled}
                {arpBlocks}
                {arpStepCount}
                {arpViewNote}
                {arpSelectedBlock}
                {arpTool}
                onArpToolChange={(tool) => { arpTool = tool; }}
                {setArpBlocks}
                {selectArpBlock}
              />
            {/if}

            {#if !designerPreviewing}
              {#each overlayPartEntries as [name, part] (name)}
                <button
                  class="part-bound"
                  class:selected={isLayerSelected(name)}
                  class:primary={activeSelectionKind === 'layer' && selectedLayer === name}
                  class:generated={isGeneratedPart(part)}
                  class:generated-labels-hidden={isGeneratedPart(part) && !showGeneratedLabels}
                  class:bounds-hidden={!showBounds}
                  class:arp-muted={arpeggiatorEnabled && part?.meta?.arpeggiatorSurface === true}
                  class:tiny={isTinyPart(name, part)}
                  class:locked={activeSelectionKind === 'layer' && selectedLayer === name && !selectedPartEditable}
                  class:pulse={selectionPulseTarget === `layer:${name}`}
                  type="button"
                  style={partOverlayStyle(name, part)}
                  title={`${name}: ${part?.kind ?? part?.role ?? 'part'}`}
                  onclick={(event) => { event.stopPropagation(); selectLayer(name, event); }}
                  ondblclick={(event) => beginInlineTextEdit(name, event)}
                  onpointerenter={() => setSurfaceHover('layer', name)}
                  onpointerleave={() => clearSurfaceHover('layer', name)}
                  onmousedown={(event) => beginMove(name, part, event)}
                >
                  <span class="selection-label">{name}</span>
                  {#if activeSelectionKind === 'layer' && selectedLayer === name && selectedPartEditable && !multiSelectionActive}
                    <span class="rotate-handle" onmousedown={beginRotate}></span>
                    {#if selectedIsArc && selectedFrame}
                      <span
                        class="arc-handle arc-start"
                        title="Drag arc start"
                        style={arcPointStyle(selectedFrame, selectedArcMeta?.startAngle)}
                        onmousedown={(event) => beginArcHandleDrag('start', event)}
                      ></span>
                      <span
                        class="arc-handle arc-end"
                        title="Drag arc end"
                        style={arcPointStyle(selectedFrame, numberOr(selectedArcMeta?.startAngle, -135) + numberOr(selectedArcMeta?.sweepAngle, 270))}
                        onmousedown={(event) => beginArcHandleDrag('end', event)}
                      ></span>
                    {/if}
                    {#each RESIZE_HANDLES as handle (handle.id)}
                      {#if !isTinyPart(name, part) || ['tl', 'tr', 'br', 'bl'].includes(handle.id)}
                        <span
                          class="resize-handle"
                          style={`${handleStyle(handle.id)} cursor:${handle.cursor};`}
                          onmousedown={(event) => beginResize(handle.id, event)}
                        ></span>
                      {/if}
                    {/each}
                  {/if}
                </button>
              {/each}
            {/if}

            {#if !designerPreviewing && activeSelectionKind === 'kit' && selectedKitEntry && selectedKitFrame}
              <button
                class="part-bound kit-bound"
                class:selected={true}
                class:pulse={selectionPulseTarget === `kit:${selectedKitEntry.id}`}
                type="button"
                style={selectionBoundsStyle(selectedKitFrame)}
                title={`${selectedKitEntry.label}: grouped kit`}
                onclick={(event) => { event.stopPropagation(); selectKit(selectedKitEntry.id); }}
                onpointerenter={() => setSurfaceHover('kit', selectedKitEntry.label)}
                onpointerleave={() => clearSurfaceHover('kit', selectedKitEntry.label)}
              >
                <span class="selection-label">{selectedKitEntry.label}</span>
              </button>
            {/if}

            {#if !designerPreviewing && multiSelectionActive && activeSelectionFrame}
              <div class="multi-selection-bound" style={selectionBoundsStyle(activeSelectionFrame)}>
                <span>{selectedLayerNames.length} layers</span>
              </div>
              {#if !interaction}
                <div
                  class="align-toolbar"
                  style={`left:${Math.max(0, activeSelectionFrame.left)}px;top:${Math.max(2, activeSelectionFrame.top - 30)}px;`}
                  role="toolbar"
                  tabindex="-1"
                  aria-label="Align and distribute selection"
                  onmousedown={stopSelectionAction}
                >
                  <button type="button" onclick={() => alignSelectedLayers('left')} title="Align left edges">⇤</button>
                  <button type="button" onclick={() => alignSelectedLayers('centerX')} title="Align horizontal centers">⇹</button>
                  <button type="button" onclick={() => alignSelectedLayers('right')} title="Align right edges">⇥</button>
                  <button type="button" onclick={() => alignSelectedLayers('top')} title="Align top edges">⤒</button>
                  <button type="button" onclick={() => alignSelectedLayers('centerY')} title="Align vertical centers">⇳</button>
                  <button type="button" onclick={() => alignSelectedLayers('bottom')} title="Align bottom edges">⤓</button>
                  <span class="align-divider"></span>
                  <button type="button" onclick={() => distributeSelectedLayers('x')} disabled={selectedLayerNames.length < 3} title="Distribute horizontally (3+ layers)">⇸</button>
                  <button type="button" onclick={() => distributeSelectedLayers('y')} disabled={selectedLayerNames.length < 3} title="Distribute vertically (3+ layers)">⇊</button>
                </div>
              {/if}
            {/if}

            {#each partEntries as [name, part] (name)}
              {#if !designerPreviewing && inlineTextEditLayer === name && authoredParts?._children?.[name]?._children?.Text && isEditablePart(authoredParts?._children?.[name])}
                <input
                  class="inline-text-editor"
                  style={inlineTextEditorStyle(name, part)}
                  type="text"
                  value={authoredParts?._children?.[name]?._children?.Text?.content ?? ''}
                  aria-label={`Edit ${name} text`}
                  use:focusOnMount
                  onmousedown={stopSelectionAction}
                  onclick={stopSelectionAction}
                  oninput={(event) => setLayerPropertyFor(name, 'Text.content', event.currentTarget.value)}
                  onblur={finishInlineTextEdit}
                  onkeydown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      finishInlineTextEdit();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      finishInlineTextEdit();
                    }
                  }}
                />
              {/if}
            {/each}

            {#if !designerPreviewing && showHitZones}
              {#each zoneOverlayEntries as [name, zone] (name)}
                <button
                  class="hit-zone"
                  class:selected={activeSelectionKind === 'hitZone' && selectedHitZone === name}
                  class:dimmed={zoneDisplayMode === 'dim' && !(activeSelectionKind === 'hitZone' && selectedHitZone === name)}
                  class:locked={activeSelectionKind === 'hitZone' && selectedHitZone === name && !selectedZoneEditable}
                  class:pulse={selectionPulseTarget === `zone:${name}`}
                  class:follow={isFollowZone(zone)}
                  type="button"
                  style={hitZoneStyle(name, zone)}
                  title={`${name}: ${zone?.action ?? 'action'}${isFollowZone(zone) ? ` — grab area follows ${String(zone.source) === 'face' ? 'the face' : String(zone.source).slice('part:'.length)}` : ''}`}
                  onclick={(event) => { event.stopPropagation(); selectHitZone(name); }}
                  onpointerenter={() => setSurfaceHover('hitZone', name)}
                  onpointerleave={() => clearSurfaceHover('hitZone', name)}
                  onmousedown={(event) => beginZoneMove(name, zone, event)}
                >
                  <span class="selection-label">{name}</span>
                  {#if activeSelectionKind === 'hitZone' && selectedHitZone === name && selectedZoneEditable && !isFollowZone(zone)}
                    {#each RESIZE_HANDLES as handle (handle.id)}
                      <span
                        class="resize-handle"
                        style={`${handleStyle(handle.id)} cursor:${handle.cursor};`}
                        onmousedown={(event) => beginZoneResize(handle.id, event)}
                      ></span>
                    {/each}
                  {/if}
                </button>
              {/each}
            {/if}

            {#if !designerPreviewing && drawDraft}
              <div class={`draw-preview ${drawDraft.tool}`} style={`${drawPreviewStyle()} clip-path:${drawPreviewClip(drawDraft.tool)};`}>
                <span>{DRAW_TOOLS.find((tool) => tool.id === drawDraft?.tool)?.label ?? 'Layer'}</span>
              </div>
            {/if}

            {#if !designerPreviewing && feedbackFrame}
              {#each snapGuides(feedbackFrame) as guide, index (`${guide.axis}-${guide.value}-${index}`)}
                <span class={`snap-guide ${guide.axis}`} style={guide.style}></span>
              {/each}
              <div class="measure-badge" style={feedbackLabelStyle(feedbackFrame)}>
                <strong>{feedbackMode}</strong>
                <span>{frameReadout(feedbackFrame)}</span>
              </div>
            {/if}

            {#if !designerPreviewing}
              {#each activeSmartGuides as guide, index (`${guide.axis}-${guide.value}-${index}`)}
                <span class={`smart-guide ${guide.axis}`} class:center={isCenterGuide(guide)} style={smartGuideStyle(guide, artboardWidth, artboardHeight)}></span>
              {/each}
              {#each measurementLines as line, index (`${line.axis}-${index}`)}
                <div
                  class={`measure-line ${line.axis}`}
                  style={line.axis === 'x'
                    ? `left:${line.left}px;top:${line.top}px;width:${line.length}px;`
                    : `left:${line.left}px;top:${line.top}px;height:${line.length}px;`}
                >
                  <span>{line.label}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>
        {#if !designerPreviewing && activeSelectionFrame && ((activeSelectionKind === 'layer' && selectedPart) || (activeSelectionKind === 'hitZone' && selectedZone))}
          <div
            class="selection-quickbar"
            class:zone-tools={activeSelectionKind === 'hitZone'}
            role="toolbar"
            tabindex="-1"
            aria-label={activeSelectionKind === 'hitZone' ? 'Selected hit zone quick actions' : 'Selected layer quick actions'}
            onmousedown={stopSelectionAction}
          >
            <span class="quickbar-label">{activeSelectionKind === 'hitZone' ? 'Zone' : 'Layer'}</span>
            {#if activeSelectionKind === 'layer'}
              <button type="button" onclick={duplicateSelectedLayer} disabled={!canManageLayer} title="Duplicate layer">
                <Copy size={13} aria-hidden="true" />
              </button>
              <button type="button" class="quick-text" onclick={copySelectedLayers} disabled={!selectedLayerNames.length} title="Copy layers (Ctrl+C)">
                C
              </button>
              <button type="button" class="quick-text" onclick={pasteClipboardLayers} disabled={!hasPartClipboard()} title="Paste layers (Ctrl+V)">
                P
              </button>
              <button type="button" onclick={() => moveSelectedLayer(1)} disabled={!canManageLayer} title="Bring forward">
                <ArrowUp size={13} aria-hidden="true" />
              </button>
              <button type="button" class="quick-text" onclick={() => moveSelectedLayerToExtreme('front')} disabled={!canManageLayer} title="Bring to front">
                F
              </button>
              <button type="button" onclick={() => moveSelectedLayer(-1)} disabled={!canManageLayer} title="Send backward">
                <ArrowDown size={13} aria-hidden="true" />
              </button>
              <button type="button" class="quick-text" onclick={() => moveSelectedLayerToExtreme('back')} disabled={!canManageLayer} title="Send to back">
                B
              </button>
              <button
                type="button"
                onclick={makeSelectedLayerInteractive}
                disabled={!canManageLayer}
                title={`Make interactive: ${activeInteractiveMeta.label} — scaffold a wired channel + behavior + grab zone on this layer`}
              >
                <Zap size={13} aria-hidden="true" />
              </button>
              <button type="button" onclick={toggleSelectedLock} disabled={!canManageLayer} title={selectedAuthoredPart?.locked === true ? 'Unlock layer' : 'Lock layer'}>
                {#if selectedAuthoredPart?.locked === true}
                  <Unlock size={13} aria-hidden="true" />
                {:else}
                  <Lock size={13} aria-hidden="true" />
                {/if}
              </button>
              <button type="button" class="danger" onclick={removeSelectedLayer} disabled={!canManageLayer} title="Delete layer">
                <Trash2 size={13} aria-hidden="true" />
              </button>
            {:else}
              <button type="button" class="danger" onclick={removeSelectedHitZone} disabled={!selectedAuthoredZone} title="Delete hit zone">
                <Trash2 size={13} aria-hidden="true" />
              </button>
            {/if}
          </div>
        {/if}
      </div>
      </div>

      <div class="surface-dock">
        <section class="dock-pane layer-tree" aria-label="Object tree">
          <div class="list-header">
            <div class="dock-tab-row" role="tablist" aria-label="Right dock sections">
              <button type="button" class:active={dockTab === 'layers'} role="tab" aria-selected={dockTab === 'layers'} onclick={() => { dockTab = 'layers'; }}>Layers</button>
              <button type="button" class:active={dockTab === 'generators'} role="tab" aria-selected={dockTab === 'generators'} onclick={() => { dockTab = 'generators'; }}>Generators</button>
              <button type="button" class:active={dockTab === 'assets'} role="tab" aria-selected={dockTab === 'assets'} onclick={() => { dockTab = 'assets'; }} title="Assets stay in the inspector for now">Assets</button>
              <button type="button" class:active={dockTab === 'live'} role="tab" aria-selected={dockTab === 'live'} onclick={() => { dockTab = 'live'; }} title="Persistent live preview — what you build is what runs">Live</button>
            </div>
            <strong>{dockTab === 'generators' ? generatorEntries.length : topLevelPartEntries.length + kitEntries.length + generatedSourceEntries.length}</strong>
          </div>
          {#if dockTab === 'layers'}
          <div class="dock-add-strip" aria-label="Create layer">
            <button type="button" onclick={() => addLayerAtCenter('rectangle')} title="Add rectangle">
              <span class="tool-icon rectangle"></span>
            </button>
            <button type="button" onclick={() => addLayerAtCenter('ellipse')} title="Add ellipse">
              <span class="tool-icon ellipse"></span>
            </button>
            <button type="button" onclick={() => addLayerAtCenter('text')} title="Add text">
              <span class="tool-icon text"></span>
            </button>
            <button type="button" onclick={addHitZoneAtCenter} title="Add hit zone">
              <span class="tool-icon hitZone"></span>
            </button>
          </div>
          <div class="list-scroll layer-scroll">
          {#each kitEntries as kit (kit.id)}
            <div
              class="list-row kit-row"
              class:selected={activeSelectionKind === 'kit' && selectedKit === kit.id}
              class:primary={activeSelectionKind === 'kit' && selectedKit === kit.id}
              class:pulse={selectionPulseTarget === `kit:${kit.id}`}
              role="group"
              aria-label={`${kit.label} kit controls`}
              title={`${kit.label}: ${kit.layerNames.length} generated layers`}
            >
              <button type="button" class="row-main" onclick={() => selectKit(kit.id)}>
                <span class={`layer-thumb kit-thumb ${kit.control?.style ?? 'dial'}`} aria-hidden="true">
                  <span class="kit-thumb-ring"></span>
                  <span class="kit-thumb-pointer"></span>
                </span>
                <span class="row-text">
                  <strong>{kit.label}</strong>
                  <em>{kit.layerNames.length} layers · {kit.zoneNames.length} zone{kit.zoneNames.length === 1 ? '' : 's'}</em>
                </span>
                <span class="row-badge kit">KIT</span>
              </button>
              <div class="row-actions">
                <button
                  type="button"
                  onclick={(event) => { event.stopPropagation(); editKitParts(kit.id); }}
                  title="Edit generated parts"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="danger"
                  onclick={(event) => { event.stopPropagation(); removeKitEntry(kit); }}
                  title="Delete value control"
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
            </div>
          {/each}
          {#each generatedSourceEntries as source (source.source)}
            <div
              class="list-row generated-group-row"
              class:collapsed={source.collapsed}
              role="group"
              aria-label={`${source.label} generated output group`}
              title={`${source.label}: ${source.partCount} generated layers, ${source.zoneCount} generated zones`}
            >
              <button type="button" class="row-main" onclick={(event) => toggleGeneratedSource(source.source, event)}>
                <span class="layer-thumb generated-group-thumb" aria-hidden="true">
                  <span></span>
                </span>
                <span class="row-text">
                  <strong>{source.label}</strong>
                  <em>{source.partCount} layers · {source.zoneCount} zone{source.zoneCount === 1 ? '' : 's'} · {source.collapsed ? 'folded' : 'expanded'}</em>
                </span>
                <span class="row-badge gen-group">{source.collapsed ? '+' : '-'}</span>
              </button>
              <div class="row-actions">
                {#if source.hasGenerator}
                  <button
                    type="button"
                    onclick={(event) => { event.stopPropagation(); dockTab = 'generators'; applyControlPatch(core.id, { 'Designer.selectedGenerator': source.source }); }}
                    title={`Edit ${source.source} generator`}
                  >
                    Gen
                  </button>
                {/if}
              </div>
            </div>
          {/each}
          {#each topLevelPartEntries as [name, part] (name)}
            <div
              class="list-row"
              class:selected={isLayerSelected(name)}
              class:primary={activeSelectionKind === 'layer' && selectedLayer === name}
              class:generated={part?.generated === true || part?.meta?.generated === true}
              class:hidden={part?.visible === false}
              class:locked={part?.locked === true || part?.meta?.locked === true}
              class:pulse={selectionPulseTarget === `layer:${name}`}
              class:dragging={draggingLayerName === name}
              role="group"
              aria-label={`${name} layer controls`}
              draggable="true"
              title={`${name}: ${part?.kind ?? part?.role ?? 'part'}`}
              ondragstart={(event) => beginLayerDrag(name, event)}
              ondragend={() => { draggingLayerName = ''; }}
              ondragover={(event) => event.preventDefault()}
              ondrop={(event) => dropLayerOn(name, event)}
          >
            <button type="button" class="row-main" onclick={(event) => selectLayer(name, event)}>
                <span class="layer-thumb" aria-hidden="true">
                  <span class={`layer-thumb-shape ${layerKindClass(part)}`} style={layerThumbPartStyle(name, part)}>
                    {#if layerKind(part) === 'text'}T{/if}
                  </span>
                </span>
                <span class="row-text">
                  <strong>{name}</strong>
                  <em>{part?.visible === false ? 'hidden · ' : ''}{part?.locked === true || part?.meta?.locked === true ? 'locked · ' : ''}{layerKindLabel(part)}</em>
                </span>
                <span class="row-badge">{part?.generated === true || part?.meta?.generated === true ? 'GEN' : layerKindLabel(part)}</span>
              </button>
              <div class="row-actions">
                {#if generatorNameForEntry(part)}
                  <button
                    type="button"
                    onclick={(event) => editGeneratorForLayer(name, part, event)}
                    title={`Edit ${generatorNameForEntry(part)} generator`}
                  >
                    Gen
                  </button>
                {/if}
                <button
                  type="button"
                  class:selected={selectedLayerSet.has(name)}
                  onclick={(event) => toggleLayerMultiSelection(name, event)}
                  title={selectedLayerSet.has(name) ? 'Remove from selection' : 'Add to selection'}
                  aria-label={selectedLayerSet.has(name) ? `Remove ${name} from selection` : `Add ${name} to selection`}
                >
                  +
                </button>
                <button type="button" onclick={(event) => { event.stopPropagation(); moveLayer(name, 1); }} disabled={!canManagePartName(name)} title={canManagePartName(name) ? 'Bring forward' : 'Generated layer: edit the generator or detach first'}>
                  <ArrowUp size={12} aria-hidden="true" />
                </button>
                <button type="button" onclick={(event) => { event.stopPropagation(); moveLayer(name, -1); }} disabled={!canManagePartName(name)} title={canManagePartName(name) ? 'Send backward' : 'Generated layer: edit the generator or detach first'}>
                  <ArrowDown size={12} aria-hidden="true" />
                </button>
                <button type="button" onclick={(event) => toggleLayerVisibility(name, part, event)} disabled={!canManagePartName(name)} title={canManagePartName(name) ? (part?.visible === false ? 'Show layer' : 'Hide layer') : 'Generated layer: edit the generator or detach first'}>
                  {#if part?.visible === false}
                    <Eye size={12} aria-hidden="true" />
                  {:else}
                    <EyeOff size={12} aria-hidden="true" />
                  {/if}
                </button>
                <button type="button" onclick={(event) => toggleLayerLock(name, part, event)} disabled={!canManagePartName(name)} title={canManagePartName(name) ? (part?.locked === true || part?.meta?.locked === true ? 'Unlock layer' : 'Lock layer') : 'Generated layer: edit the generator or detach first'}>
                  {#if part?.locked === true || part?.meta?.locked === true}
                    <Unlock size={12} aria-hidden="true" />
                  {:else}
                    <Lock size={12} aria-hidden="true" />
                  {/if}
                </button>
              </div>
            </div>
          {/each}
          </div>
          <div class="list-header secondary">
            <span>Hit Zones</span>
            <strong>{dockHitZoneEntries.length}</strong>
          </div>
          <div class="list-scroll zones">
          {#if dockHitZoneEntries.length}
            {#each dockHitZoneEntries as [name, zone] (name)}
              <div
                class="list-row zone-row"
                class:selected={activeSelectionKind === 'hitZone' && selectedHitZone === name}
                class:generated={zone?.generated === true || zone?.meta?.generated === true}
                class:pulse={selectionPulseTarget === `zone:${name}`}
                role="group"
                aria-label={`${name} hit zone`}
                title={`${name}: ${zone?.action ?? 'action'}`}
              >
                <button type="button" class="row-main" onclick={() => selectHitZone(name)}>
                  <span class="layer-thumb zone-thumb" aria-hidden="true">
                    <span class="zone-thumb-shape" style={zoneThumbPartStyle(name, zone)}></span>
                  </span>
                  <span class="row-text">
                    <strong>{name}</strong>
                    <em>{zone?.shape ?? 'zone'} · {zone?.action ?? 'action'}</em>
                  </span>
                  <span class="row-badge zone">ZONE</span>
                </button>
              </div>
            {/each}
          {:else}
            <div class="list-empty">{hitZoneEntries.length ? 'Generated zones are folded above' : 'No zones'}</div>
          {/if}
          </div>
          {:else if dockTab === 'generators'}
            <div class="dock-generator-editor">
              <CustomGeneratorsEditor {control} />
            </div>
          {:else if dockTab === 'live'}
            <!-- Persistent live preview (§12.6): the runtime component, always
                 interactive while editing — shares the session the full-canvas
                 preview mode uses, so values scrubbed here carry over. -->
            <div class="dock-live-preview">
              <InteractiveTestSurface
                {control}
                session={livePreviewSession ?? createInteractionPreviewSession(control)}
                onpatchsession={patchLivePreviewSession}
                compact={true}
              />
              <button
                type="button"
                class="dock-live-reset"
                onclick={() => { livePreviewSession = createInteractionPreviewSession(control); }}
                title="Reset the live session to the component defaults"
              >Reset session</button>
            </div>
          {:else}
            <div class="dock-empty dock-empty-tab">
              Assets are edited in the inspector for now.
            </div>
          {/if}
        </section>

        <section class="dock-pane inspector-pane" aria-label="Context inspector">
          <div class="inspector-head">
            <div>
              <strong>{activeSelectionLabel}</strong>
              <span>{activeSelectionDescription}</span>
            </div>
            {#if activeSelectionKind === 'layer' && selectedPart && !selectedPartEditable}
              <button type="button" class="detach-mini" onclick={detachSelectedLayer} disabled={!canDetachLayer} title="Detach generated layer">
                <Scissors size={13} aria-hidden="true" />
                <span>Detach</span>
              </button>
            {/if}
          </div>

          <div class="inspector-tabs" role="tablist" aria-label="Inspector sections">
            {#each INSPECTOR_TABS as tab (tab.id)}
              <button
                type="button"
                role="tab"
                class:active={inspectorTab === tab.id}
                aria-selected={inspectorTab === tab.id}
                onclick={() => { inspectorTab = tab.id; }}
              >
                {tab.label}
              </button>
            {/each}
          </div>

          <div class="inspector-content">
            {#if inspectorTab === 'object'}
              {#if activeSelectionKind === 'artboard'}
                <div class="dock-section">
                  <div class="dock-section-title">Artboard</div>
                  <div class="dock-number-grid">
                    <label>
                      <span>W</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={Math.round(artboardWidth)}
                        onchange={(event) => setArtboardSize('width', numericInputValue(event, artboardWidth))}
                      />
                    </label>
                    <label>
                      <span>H</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={Math.round(artboardHeight)}
                        onchange={(event) => setArtboardSize('height', numericInputValue(event, artboardHeight))}
                      />
                    </label>
                  </div>
                  <div class="dock-note">This is the saved custom component workspace size. It does not require a panel.</div>
                  <div class="dock-button-grid">
                    <button type="button" onclick={() => { setArtboardSize('width', 152); setArtboardSize('height', 92); }}>Button</button>
                    <button type="button" onclick={() => { setArtboardSize('width', 260); setArtboardSize('height', 120); }}>Default</button>
                    <button type="button" onclick={fitArtboardToView}>Fit View</button>
                  </div>
                </div>
              {:else if !activeSelectionName && !multiSelectionActive}
                <div class="dock-empty">Select artwork, a text layer, or a hit zone to edit it here.</div>
              {:else}
                {#if activeSelectionKind === 'kit' && selectedKitEntry}
                  <div class="dock-section">
                    <div class="dock-section-title">Value Control</div>
                    <div class="segmented">
                      <button type="button" class:active={selectedKitEntry.control?.style === 'dial'} onclick={() => convertSelectedValueControl('dial')}>Dial</button>
                      <button type="button" class:active={selectedKitEntry.control?.style === 'horizontal'} onclick={() => convertSelectedValueControl('horizontal')}>Horizontal</button>
                      <button type="button" class:active={selectedKitEntry.control?.style === 'vertical'} onclick={() => convertSelectedValueControl('vertical')}>Vertical</button>
                    </div>
                    <div class="mini-list">
                      <div>
                        <strong>Style</strong>
                        <span>{valueControlStyleLabel(selectedKitEntry.control?.style)}</span>
                      </div>
                      <div>
                        <strong>Channel</strong>
                        <span>{selectedKitEntry.control?.channelName ?? 'value'}</span>
                      </div>
                      <div>
                        <strong>Range</strong>
                        <span>{selectedKitEntry.control?.min ?? 0} to {selectedKitEntry.control?.max ?? 127}</span>
                      </div>
                      <div>
                        <strong>Ticks</strong>
                        <span>{selectedKitEntry.control?.tickCount ?? 0}</span>
                      </div>
                      <div>
                        <strong>Parts</strong>
                        <span>{selectedKitEntry.layerNames.length} layers</span>
                      </div>
                      <div>
                        <strong>Hit Zones</strong>
                        <span>{selectedKitEntry.zoneNames.length}</span>
                      </div>
                    </div>
                    <div class="dock-note">This is one smart value control. The visible ticks, track, pointer, readout, and hidden interaction area stay grouped by default.</div>
                    <div class="dock-button-grid">
                      <button type="button" onclick={() => editKitParts(selectedKitEntry.id)}>Edit Internal Parts</button>
                      <button type="button" class="danger" onclick={removeSelectedKit}>
                        <Trash2 size={13} aria-hidden="true" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                {/if}

                {#if activeSelectionKind === 'layer' && selectedPart}
                  <div class="dock-section">
                    <div class="dock-section-title">Layer</div>
                    <label class="dock-field wide">
                      <span>Name</span>
                      <input
                        type="text"
                        value={selectedLayer}
                        disabled={!canManageLayer || multiSelectionActive}
                        onblur={renameSelectedLayer}
                        onchange={renameSelectedLayer}
                      />
                    </label>
                    <div class="dock-button-grid">
                      <button type="button" onclick={duplicateSelectedLayer} disabled={!canManageLayer} title="Duplicate layer">
                        <Copy size={13} aria-hidden="true" />
                        <span>Duplicate</span>
                      </button>
                      <button type="button" onclick={() => moveSelectedLayerToExtreme('front')} disabled={!canManageLayer} title="Bring to front">Front</button>
                      <button type="button" onclick={() => moveSelectedLayerToExtreme('back')} disabled={!canManageLayer} title="Send to back">Back</button>
                      <button type="button" onclick={toggleSelectedVisibility} disabled={!canManageLayer} title={selectedAuthoredPart?.visible === false ? 'Show layer' : 'Hide layer'}>
                        {#if selectedAuthoredPart?.visible === false}
                          <Eye size={13} aria-hidden="true" />
                          <span>Show</span>
                        {:else}
                          <EyeOff size={13} aria-hidden="true" />
                          <span>Hide</span>
                        {/if}
                      </button>
                      <button type="button" onclick={toggleSelectedLock} disabled={!canManageLayer} title={selectedAuthoredPart?.locked === true ? 'Unlock layer' : 'Lock layer'}>
                        {#if selectedAuthoredPart?.locked === true}
                          <Unlock size={13} aria-hidden="true" />
                          <span>Unlock</span>
                        {:else}
                          <Lock size={13} aria-hidden="true" />
                          <span>Lock</span>
                        {/if}
                      </button>
                      <button type="button" class="danger" onclick={removeSelectedLayer} disabled={!canManageLayer} title="Delete layer">
                        <Trash2 size={13} aria-hidden="true" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                {/if}

                {#if activeSelectionKind === 'hitZone' && selectedZone}
                  <div class="dock-section">
                    <div class="dock-section-title">Hit Zone</div>
                    <label class="dock-field">
                      <span>Shape</span>
                      <select value={selectedZone?.shape ?? 'rectangle'} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('shape', event.currentTarget.value)}>
                        <option value="rectangle">Rectangle</option>
                        <option value="circle">Circle</option>
                        <option value="ring">Ring</option>
                      </select>
                    </label>
                    <label class="dock-field">
                      <span>Action</span>
                      <select value={selectedZone?.action ?? 'dragValue'} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('action', event.currentTarget.value)}>
                        <option value="dragValue">Drag value</option>
                        <option value="setValue">Set value</option>
                        <option value="cycleValue">Cycle value</option>
                        <option value="trigger">Trigger</option>
                      </select>
                    </label>
                    <label class="dock-field">
                      <span>Enabled</span>
                      <input type="checkbox" checked={selectedZone?.enabled !== false} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('enabled', event.currentTarget.checked)} />
                    </label>
                  </div>
                {/if}

                {#if activeSelectionFrame && ((activeSelectionKind === 'layer' && selectedPart) || (activeSelectionKind === 'hitZone' && selectedZone))}
                  <div class="dock-section">
                    <div class="dock-section-title">Transform</div>
                    <div class="dock-number-grid">
                      <label>
                        <span>X</span>
                        <input
                          type="number"
                          value={Math.round(activeSelectionFrame.left)}
                          disabled={activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable}
                          onchange={(event) => {
                            const frame = { ...activeSelectionFrame, left: numericInputValue(event, activeSelectionFrame.left) };
                            if (activeSelectionKind === 'hitZone') applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, frame));
                            else applyLayerPatch(patchFromFrame(selectedAuthoredPart, frame));
                          }}
                        />
                      </label>
                      <label>
                        <span>Y</span>
                        <input
                          type="number"
                          value={Math.round(activeSelectionFrame.top)}
                          disabled={activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable}
                          onchange={(event) => {
                            const frame = { ...activeSelectionFrame, top: numericInputValue(event, activeSelectionFrame.top) };
                            if (activeSelectionKind === 'hitZone') applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, frame));
                            else applyLayerPatch(patchFromFrame(selectedAuthoredPart, frame));
                          }}
                        />
                      </label>
                      <label>
                        <span>W</span>
                        <input
                          type="number"
                          min="1"
                          value={Math.round(activeSelectionFrame.width)}
                          disabled={activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable}
                          onchange={(event) => {
                            const frame = { ...activeSelectionFrame, width: Math.max(1, numericInputValue(event, activeSelectionFrame.width)) };
                            if (activeSelectionKind === 'hitZone') applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, frame));
                            else applyLayerPatch(patchFromFrame(selectedAuthoredPart, frame));
                          }}
                        />
                      </label>
                      <label>
                        <span>H</span>
                        <input
                          type="number"
                          min="1"
                          value={Math.round(activeSelectionFrame.height)}
                          disabled={activeSelectionKind === 'layer' ? !selectedPartEditable : !selectedZoneEditable}
                          onchange={(event) => {
                            const frame = { ...activeSelectionFrame, height: Math.max(1, numericInputValue(event, activeSelectionFrame.height)) };
                            if (activeSelectionKind === 'hitZone') applyControlPatch(core.id, patchFromZoneFrame(selectedAuthoredZone, frame));
                            else applyLayerPatch(patchFromFrame(selectedAuthoredPart, frame));
                          }}
                        />
                      </label>
                      {#if activeSelectionKind === 'layer'}
                        <label>
                          <span>Rot</span>
                          <input
                            type="number"
                            step="1"
                            value={Math.round(numberOr(selectedAuthoredPart?._children?.Layout?.rotation, 0))}
                            disabled={!selectedPartEditable}
                            onchange={(event) => setLayerLayoutProperty('rotation', normalizeRotation(numericInputValue(event, 0)))}
                          />
                        </label>
                        <label>
                          <span>Pivot X</span>
                          <input
                            type="number"
                            step="1"
                            value={Math.round(numberOr(selectedAuthoredPart?._children?.Layout?.pivotX, 50))}
                            disabled={!selectedPartEditable}
                            onchange={(event) => setLayerLayoutProperty('pivotX', numericInputValue(event, 50))}
                          />
                        </label>
                        <label>
                          <span>Pivot Y</span>
                          <input
                            type="number"
                            step="1"
                            value={Math.round(numberOr(selectedAuthoredPart?._children?.Layout?.pivotY, 50))}
                            disabled={!selectedPartEditable}
                            onchange={(event) => setLayerLayoutProperty('pivotY', numericInputValue(event, 50))}
                          />
                        </label>
                      {/if}
                    </div>
                    {#if activeSelectionKind === 'layer'}
                      <label class="dock-field" title="Pin size: with the instance resize policy 'Scale internals', this part keeps its authored size and font (position still tracks the scale) — for labels and readouts.">
                        <span>Pin size</span>
                        <input
                          type="checkbox"
                          checked={selectedAuthoredPart?._children?.Layout?.pinned === true}
                          disabled={!selectedPartEditable}
                          onchange={(event) => setLayerLayoutProperty('pinned', event.currentTarget.checked)}
                        />
                      </label>
                    {/if}
                    {#if activeSelectionKind === 'layer'}
                      <div class="dock-section-subtitle">Rotation Pivot</div>
                      <div class="pivot-actions">
                        <button
                          type="button"
                          disabled={!selectedPartEditable || !selectedArcPivotTarget}
                          onclick={setSelectedPivotToArcCenter}
                          title={selectedArcPivotTarget ? `Set pivot to ${selectedArcPivotTarget.name} center` : 'No arc/value arc layer available'}
                        >
                          Rotate around arc center
                        </button>
                        <span>{selectedArcPivotTarget ? selectedArcPivotTarget.name : 'No arc found'}</span>
                      </div>
                    {/if}
                    <div class="dock-section-subtitle">Quick Positioning</div>
                    <div class="align-grid">
                      <button type="button" onclick={() => alignSelection('left')}>Left</button>
                      <button type="button" onclick={() => alignSelection('centerX')}>Center X</button>
                      <button type="button" onclick={() => alignSelection('right')}>Right</button>
                      <button type="button" onclick={() => alignSelection('top')}>Top</button>
                      <button type="button" onclick={() => alignSelection('centerY')}>Center Y</button>
                      <button type="button" onclick={() => alignSelection('bottom')}>Bottom</button>
                    </div>
                  </div>
                {/if}
              {/if}
            {:else if inspectorTab === 'display'}
              {#if activeSelectionKind === 'layer' && selectedPart}
                <div class="dock-section">
                  <div class="dock-section-title">Paint</div>
                  {#if selectedBackground}
                    <div class="paint-grid">
                      <label>
                        <span>Fill</span>
                        <button type="button" class="mini-swatch-btn" disabled={!canPaintLayer} style={swatchCss(selectedFill?.colour)} onclick={() => openLayerColour('Background.Fill.colour', selectedFill?.colour)} title="Pick fill colour"></button>
                      </label>
                      <label>
                        <span>Stroke</span>
                        <button type="button" class="mini-swatch-btn" disabled={!canPaintLayer} style={swatchCss(selectedBorder?.colour, 'FFFFFF')} onclick={() => openLayerColour('Background.Border.colour', selectedBorder?.colour)} title="Pick stroke colour"></button>
                      </label>
                      <label>
                        <span>Stroke W</span>
                        <input type="number" min="0" max="32" step="1" value={numberOr(selectedBorder?.thickness, 0)} disabled={!canPaintLayer} onchange={(event) => setLayerProperty('Background.Border.thickness', numericInputValue(event, 0))} />
                      </label>
                      <label>
                        <span>Radius</span>
                        <input type="number" min="0" max="999" step="1" value={numberOr(selectedCorners?.radius, 0)} disabled={!canPaintLayer} onchange={(event) => setLayerProperty('Background.Corners.radius', numericInputValue(event, 0))} />
                      </label>
                    </div>
                  {/if}
                  {#if selectedText}
                    <label class="dock-field wide">
                      <span>Text</span>
                      <input type="text" value={selectedText?.content ?? ''} disabled={!canPaintLayer} oninput={(event) => setLayerProperty('Text.content', event.currentTarget.value)} />
                    </label>
                    <div class="paint-grid">
                      <label>
                        <span>Text Color</span>
                        <button type="button" class="mini-swatch-btn" disabled={!canPaintLayer} style={swatchCss(selectedTextFill?.colour, 'FFFFFF')} onclick={() => openLayerColour('Text.Fill.colour', selectedTextFill?.colour)} title="Pick text colour"></button>
                      </label>
                      <label>
                        <span>Size</span>
                        <input type="number" min="6" max="144" step="1" value={numberOr(selectedTextFont?.size, 12)} disabled={!canPaintLayer} onchange={(event) => setLayerProperty('Text.Font.size', numericInputValue(event, 12))} />
                      </label>
                    </div>
                  {/if}
                  <label class="dock-field wide">
                    <span>Opacity</span>
                    <input type="range" min="0" max="1" step="0.01" value={numberOr(selectedAuthoredPart?.opacity, 1)} disabled={!canPaintLayer} oninput={(event) => setLayerProperty('opacity', numericInputValue(event, 1))} />
                    <strong>{Math.round(numberOr(selectedAuthoredPart?.opacity, 1) * 100)}%</strong>
                  </label>
                </div>

                {#if selectedIsArc}
                  <div class="dock-section">
                    <div class="dock-section-title">Arc</div>
                    <div class="dock-number-grid">
                      <label>
                        <span>Start</span>
                        <input type="number" step="1" value={Math.round(numberOr(selectedArcMeta?.startAngle, -135))} onchange={(event) => setArcMetaProperty('startAngle', normalizeRotation(numericInputValue(event, -135)))} />
                      </label>
                      <label>
                        <span>Sweep</span>
                        <input type="number" min="1" max="360" step="1" value={Math.round(numberOr(selectedArcMeta?.sweepAngle, 270))} onchange={(event) => setArcMetaProperty('sweepAngle', Math.max(1, Math.min(360, numericInputValue(event, 270))))} />
                      </label>
                      <label>
                        <span>Thick</span>
                        <input
                          type="number"
                          min="1"
                          max="48"
                          step="1"
                          value={Math.round(numberOr(selectedArcMeta?.thickness, 4))}
                          onchange={(event) => {
                            const thickness = Math.max(1, Math.min(48, numericInputValue(event, 4)));
                            setArcMetaProperty('thickness', thickness);
                            setLayerProperty('Background.Border.thickness', thickness);
                          }}
                        />
                      </label>
                    </div>
                    <label class="dock-field">
                      <span>Colour</span>
                      <button type="button" class="mini-swatch-btn"
                        style={swatchCss(selectedArcMeta?.colour, '5B9BD5')}
                        onclick={openArcColour}
                        title="Pick arc colour"
                      ></button>
                    </label>
                    <label class="dock-field">
                      <span>Direction</span>
                      <div class="dock-toggle-row">
                        <button type="button" class:active={selectedArcMeta?.direction !== 'ccw'} onclick={() => setArcMetaProperty('direction', 'cw')}>CW</button>
                        <button type="button" class:active={selectedArcMeta?.direction === 'ccw'} onclick={() => setArcMetaProperty('direction', 'ccw')}>CCW</button>
                      </div>
                    </label>
                    <label class="dock-field">
                      <span>Caps</span>
                      <div class="dock-toggle-row">
                        <button type="button" class:active={selectedArcMeta?.cap !== 'round'} onclick={() => setArcMetaProperty('cap', 'flat')}>Flat</button>
                        <button type="button" class:active={selectedArcMeta?.cap === 'round'} onclick={() => setArcMetaProperty('cap', 'round')}>Round</button>
                      </div>
                    </label>
                  </div>
                {/if}
              {:else if activeSelectionKind === 'hitZone' && selectedZone}
                <div class="dock-section">
                  <div class="dock-section-title">Zone Display</div>
                  <label class="dock-field">
                    <span>Visible</span>
                    <input type="checkbox" checked={selectedZone?.visibleInEditor !== false} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('visibleInEditor', event.currentTarget.checked)} />
                  </label>
                  <label class="dock-field">
                    <span>Priority</span>
                    <input type="number" value={numberOr(selectedZone?.priority, 0)} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('priority', numericInputValue(event, 0))} />
                  </label>
                </div>
              {:else}
                <div class="dock-empty">Select a layer to edit fill, stroke, text, opacity, and arc styling.</div>
              {/if}
            {:else if inspectorTab === 'behavior'}
              <div class="dock-section">
                <div class="dock-section-title">Interaction</div>
                {#if activeSelectionKind === 'hitZone' && selectedZone}
                  <label class="dock-field">
                    <span>Behavior</span>
                    <select value={selectedZone?.targetBehavior ?? ''} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('targetBehavior', event.currentTarget.value)}>
                      {#each behaviorEntries as [name] (name)}
                        <option value={name}>{name}</option>
                      {/each}
                    </select>
                  </label>
                  <label class="dock-field">
                    <span>Channel</span>
                    <select value={selectedZone?.targetValueChannel ?? ''} disabled={!selectedZoneEditable} onchange={(event) => setHitZoneProperty('targetValueChannel', event.currentTarget.value)}>
                      {#each valueChannelEntries as [name] (name)}
                        <option value={name}>{name}</option>
                      {/each}
                    </select>
                  </label>
                {:else}
                  <div class="dock-note">Use hit zones to make artwork interactive. Selected artwork can still be animated by bindings and states.</div>
                {/if}
              </div>
            {:else if inspectorTab === 'states'}
              <div class="dock-section">
                <div class="dock-section-title">Preview</div>
                <label class="dock-field">
                  <span>Bounds</span>
                  <input type="checkbox" checked={showBounds} onchange={(event) => setPreviewFlag('showBounds', event.currentTarget.checked)} />
                </label>
                <label class="dock-field">
                  <span>Gen Names</span>
                  <input type="checkbox" checked={showGeneratedLabels} onchange={(event) => setPreviewFlag('showGeneratedLabels', event.currentTarget.checked)} />
                </label>
                <label class="dock-field">
                  <span>Zones</span>
                  <input type="checkbox" checked={showHitZones} onchange={(event) => setPreviewFlag('showHitZones', event.currentTarget.checked)} />
                </label>
                <div class="segmented">
                  <button type="button" class:active={zoneDisplayMode === 'selected'} onclick={() => setZoneDisplayMode('selected')}>Sel</button>
                  <button type="button" class:active={zoneDisplayMode === 'dim'} onclick={() => setZoneDisplayMode('dim')}>Dim</button>
                  <button type="button" class:active={zoneDisplayMode === 'all'} onclick={() => setZoneDisplayMode('all')}>All</button>
                </div>
              </div>
              <div class="dock-section">
                <div class="dock-section-title">States</div>
                <div class="dock-note">States are authored on the filmstrip below the canvas and in the panel's States tab (rules, patches, coverage).</div>
              </div>
            {/if}
          </div>
        </section>
      </div>

    {#if !designerPreviewing}
    <div class="tool-strip" aria-label="Surface tools">
      <button
        type="button"
        class:active={activeTool === 'select'}
        title="Select (V)"
        onclick={() => setActiveTool('select')}
      >
        <span class="tool-icon select"></span>
        <strong>Select</strong>
      </button>

      <div class="tool-flyout-host">
        <button
          type="button"
          class:active={shapeToolActive}
          title={`Shape: ${activeShapeTool.label} (${activeShapeTool.key})`}
          aria-haspopup="menu"
          aria-expanded={shapeFlyoutOpen}
          onclick={toggleShapeFlyout}
        >
          <span class={`tool-icon ${activeShapeTool.id}`}></span>
          <strong>Shape: {activeShapeTool.label}</strong>
        </button>
        {#if shapeFlyoutOpen}
          <div class="tool-flyout" role="menu" aria-label="Shape tools">
            {#each SHAPE_TOOLS as tool (tool.id)}
              <button
                type="button"
                role="menuitem"
                class:active={activeTool === tool.id}
                title={`${tool.label} (${tool.key})`}
                onclick={(event) => { event.stopPropagation(); setActiveTool(tool.id); }}
              >
                <span class={`tool-icon ${tool.id}`}></span>
                <span>{tool.label}</span>
                <kbd>{tool.key}</kbd>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <button
        type="button"
        class:active={activeTool === 'text'}
        title="Text (T)"
        onclick={() => setActiveTool('text')}
      >
        <span class="tool-icon text"></span>
        <strong>Text</strong>
      </button>

      <button
        type="button"
        class:active={activeTool === 'hitZone'}
        title="Hit Zone (H)"
        onclick={() => setActiveTool('hitZone')}
      >
        <span class="tool-icon hitZone"></span>
        <strong>Hit Zone</strong>
      </button>

      <div class="tool-flyout-host">
        <button
          type="button"
          class:active={activeTool === 'interactive'}
          title={`Make Interactive: ${activeInteractiveMeta.label} (I) — draw a pre-wired control`}
          aria-haspopup="menu"
          aria-expanded={interactiveFlyoutOpen}
          onclick={toggleInteractiveFlyout}
        >
          <span class="tool-icon interactive"></span>
          <strong>Interactive: {activeInteractiveMeta.label}</strong>
        </button>
        {#if interactiveFlyoutOpen}
          <div class="tool-flyout" role="menu" aria-label="Interactive archetypes">
            {#each INTERACTIVE_ARCHETYPES as archetype (archetype.id)}
              <button
                type="button"
                role="menuitem"
                class:active={activeTool === 'interactive' && interactiveArchetype === archetype.id}
                title={`Draw a ${archetype.label}`}
                onclick={(event) => selectInteractiveArchetype(event, archetype.id)}
              >
                <span class="tool-icon interactive"></span>
                <span>{archetype.label}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="tool-flyout-host">
        <button
          type="button"
          title="Starters — load a complete editable archetype into this component"
          aria-haspopup="menu"
          aria-expanded={starterFlyoutOpen}
          onclick={toggleStarterFlyout}
        >
          <span class="tool-icon rectangle"></span>
          <strong>Starters</strong>
        </button>
        {#if starterFlyoutOpen}
          <div class="tool-flyout rich" role="menu" aria-label="Starter components">
            {#each CUSTOM_COMPONENT_STARTERS as starter (starter.id)}
              <button type="button" role="menuitem" title={starter.summary} onclick={(event) => applyStarterFromFlyout(event, starter)}>
                <span class="rich-copy">
                  <span>{starter.label}</span>
                  <small>{starter.creates.join(' + ')}</small>
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="tool-flyout-host">
        <button
          type="button"
          title="Assistant — apply a setup recipe (uses the selected layer/channel)"
          aria-haspopup="menu"
          aria-expanded={assistantFlyoutOpen}
          onclick={toggleAssistantFlyout}
        >
          <span class="tool-icon hitZone"></span>
          <strong>Assistant</strong>
        </button>
        {#if assistantFlyoutOpen}
          <div class="tool-flyout rich" role="menu" aria-label="Assistant recipes">
            {#each CUSTOM_ASSISTANT_RECIPES as recipe (recipe.id)}
              <button type="button" role="menuitem" title={recipe.summary} onclick={(event) => applyRecipeFromFlyout(event, recipe)}>
                <span class="rich-copy">
                  <span>{recipe.label}</span>
                  <small>{recipe.group} · {recipe.creates.join(' + ')}</small>
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    {/if}

    {#if !designerPreviewing}
    <CustomStateFilmstrip
      {statePreviewCards}
      activeStateName={designer?.preview?.state ?? 'base'}
      {artboardWidth}
      {artboardHeight}
      {filmstripCollapsed}
      onToggleCollapsed={() => { filmstripCollapsed = !filmstripCollapsed; }}
      {selectStateCard}
      onEditState={(name) => { selectStateCard(name); if (core?.id) applyControlPatch(core.id, { 'Designer.focusSection': 'react', 'Designer.focusReactPane': 'states' }); }}
      {setFilmstripStateWhen}
      {duplicateStateCard}
      {removeStateCard}
      {addQuickState}
    />
    {/if}

    {#if !designerPreviewing && !displayDockHidden}
      <div class="surface-display-dock"><DisplayPanel /></div>
    {/if}

    <SurfaceHelpOverlay open={helpOverlayOpen} onclose={() => { helpOverlayOpen = false; }} />
  </div>
{:else}
  <div class="empty-state">Select a custom component to use the design surface.</div>
{/if}

<style>
  .surface-shell {
    display: grid;
    grid-template-columns: var(--palette-w, 220px) minmax(420px, 1fr) var(--dock-w, clamp(340px, 25vw, 430px));
    grid-template-rows: auto minmax(0, 1fr) auto auto auto;
    grid-template-areas:
      "lookbar lookbar  lookbar"
      "palette canvas   dock"
      "palette toolbar  dock"
      "palette states   dock"
      "palette display  dock";
    min-height: 440px;
    height: calc(100vh - 190px);
    border: 1px solid #2A2A2A;
    background: #181818;
    overflow: hidden;
    outline: none;
  }

  .surface-options-strip { grid-area: toolbar; }
  .surface-lookbar { grid-area: lookbar; }
  .palette-panel { grid-area: palette; }
  .surface-viewport { grid-area: canvas; }
  .surface-dock { grid-area: dock; }
  .surface-display-dock { grid-area: display; }
  /* The floating tool-strip overlaps the bottom of the canvas cell. */
  .tool-strip { grid-area: canvas; align-self: end; }

  .surface-shell.previewing {
    grid-template-columns: 0 minmax(0, 1fr) 0;
  }

  .surface-shell.dock-hidden .surface-dock {
    display: none;
  }

  /* Shared DisplayPanel docked at the bottom of the centre column. */
  .surface-display-dock {
    min-height: 0;
    height: 340px;
    overflow: hidden;
    border-top: 1px solid #26313A;
    background: #0E141A;
  }

  .surface-display-dock :global(.display-panel) {
    height: 100%;
  }

  .surface-shell:focus-within {
    border-color: #3D6688;
  }

  .surface-shell > .layer-action-strip,
  .surface-shell > .precision-strip,
  .surface-shell > .arc-strip {
    display: none;
  }

  .tool-strip {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    overflow-x: auto;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    min-height: 0;
    padding: 8px 6px;
    background: #171B1F;
    border-top: 1px solid #2A2A2A;
    overflow: visible;
    z-index: 5;
  }

  .tool-strip button {
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    justify-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #22272B;
    color: #B9C8D4;
    cursor: pointer;
    font: inherit;
    font-size: 10px;
  }

  .tool-strip button:hover,
  .tool-strip button.active {
    border-color: #5B9BD5;
    background: #173449;
    color: #EAF5FF;
  }

  .tool-strip strong {
    position: absolute;
    bottom: 100%;
    left: 50%;
    top: auto;
    z-index: 10;
    max-width: 140px;
    transform: translateX(-50%);
    margin-bottom: 4px;
    padding: 5px 7px;
    border: 1px solid #3B4652;
    border-radius: 4px;
    background: #12181E;
    color: #EAF5FF;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.32);
    opacity: 0;
    pointer-events: none;
    transition: opacity 90ms ease;
    font-weight: 700;
    white-space: nowrap;
  }

  .tool-strip button:hover strong,
  .tool-strip button:focus-visible strong {
    opacity: 1;
  }

  .tool-flyout-host {
    position: relative;
  }

  .tool-flyout-host {
    display: flex;
    align-items: center;
  }

  /* No divider line: it used to stack above the button, pushing flyout-tool
     icons ~11px lower than the plain buttons and breaking the row alignment. */
  .tool-flyout-host::before {
    display: none;
  }

  .tool-flyout {
    position: absolute;
    bottom: 100%;
    left: 0;
    top: auto;
    z-index: 30;
    width: 154px;
    padding: 6px;
    border: 1px solid #3B4652;
    border-radius: 5px;
    background: #151B21;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.42);
  }

  /* Starters/Assistant flyouts: two-line entries, scroll when long. */
  .tool-flyout.rich {
    width: 236px;
    max-height: 340px;
    overflow-y: auto;
  }

  .tool-flyout.rich button {
    height: auto;
    min-height: 36px;
    grid-template-columns: minmax(0, 1fr);
    padding: 5px 7px;
  }

  .rich-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    text-align: left;
  }

  .rich-copy small {
    color: #7E8B98;
    font-size: 9px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .tool-flyout button {
    width: 100%;
    height: 30px;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    justify-items: start;
    gap: 7px;
    margin: 0;
    padding: 0 7px;
    border-color: transparent;
    background: transparent;
    color: #CBD7E0;
    text-align: left;
  }

  .tool-flyout button:hover,
  .tool-flyout button.active {
    border-color: #3F6C92;
    background: #173449;
    color: #EAF5FF;
  }

  .tool-flyout span:not(.tool-icon) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }

  .tool-flyout kbd {
    min-width: 16px;
    height: 17px;
    border: 1px solid #3B4652;
    border-radius: 3px;
    background: #0F1419;
    color: #8DBFE5;
    font: inherit;
    font-size: 9px;
    font-weight: 800;
    line-height: 15px;
    text-align: center;
  }

  .paint-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 6px 8px;
    background: #15191C;
    border-bottom: 1px solid #2A2A2A;
    color: #B9C8D4;
    overflow-x: auto;
  }

  /* Top Look bar: quick-actions toolbar (left) + Scripts (right). */
  .surface-lookbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    min-height: 50px;
    padding: 0 10px;
    background: linear-gradient(180deg, #172027, #11181F);
    border-bottom: 1px solid #26313A;
    overflow: hidden;
  }

  .surface-lookbar .paint-strip {
    flex: 1;
    min-width: 0;
    background: transparent;
    border-bottom: none;
    padding: 6px 0;
  }

  .lookbar-empty {
    flex: 1;
    color: #6F7E8A;
    font-size: 11px;
    font-style: italic;
  }

  .lookbar-scripts {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-left: 14px;
    border-left: 1px solid #2D3A44;
    font-size: 11px;
  }

  .lb-s-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .lb-s-chip {
    color: #14B8A6;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .lb-s-count {
    color: #E6EEF3;
    font-weight: 600;
    white-space: nowrap;
  }

  .lb-s-none,
  .lb-s-hint {
    color: #7F8B94;
    font-size: 10px;
    white-space: nowrap;
  }

  .lb-s-badge {
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid #2D3A44;
    background: #0D1419;
    font-size: 10px;
    font-weight: 700;
  }

  .lb-s-badge.on { color: #14B8A6; }
  .lb-s-badge.off { color: #7F8B94; }

  .lb-s-btn {
    margin-left: auto;
    height: 22px;
    padding: 0 9px;
    border-radius: 4px;
    border: 1px solid #2D3A44;
    background: #18232B;
    color: #B9C8D4;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .lb-s-btn:hover {
    color: #EAF5FF;
    border-color: rgba(20, 184, 166, 0.5);
    background: rgba(20, 184, 166, 0.14);
  }

  .paint-strip.disabled {
    color: #727D86;
  }

  .paint-strip label {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 7px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #202427;
    font-size: 10px;
    white-space: nowrap;
  }

  .paint-strip label:focus-within {
    border-color: #5B9BD5;
    box-shadow: 0 0 0 1px rgba(91, 155, 213, 0.35);
  }

  .paint-strip span,
  .paint-strip strong {
    font-weight: 700;
  }

  .paint-strip input:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .fill-toggle {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid #2E3B45;
    border-radius: 3px;
    background: #1A242D;
    color: #6B7A86;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
    line-height: 1;
  }

  .fill-toggle.active {
    border-color: #14B8A6;
    background: rgba(20, 184, 166, 0.22);
    color: #8FEDE3;
  }

  .fill-toggle:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .mini-swatch-btn {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .mini-swatch-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .mini-swatch-btn:hover:not(:disabled) {
    border-color: rgba(255,255,255,0.4);
  }

  /* Compact editable numeric field (e.g. stroke thickness) in a swatch row. */
  .swatch-num {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: #DFEAF0;
    font-size: 10px;
    font-weight: 800;
    white-space: nowrap;
  }

  .swatch-num input {
    width: 34px;
    height: 22px;
    padding: 0 2px;
    border: 1px solid #34444F;
    border-radius: 4px;
    background: #0D1419;
    color: #E8EEF5;
    font: inherit;
    font-size: 11px;
    text-align: center;
  }

  .swatch-num input:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .mini-gradient-btn {
    height: 18px;
    min-width: 32px;
    padding: 0;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .mini-gradient-btn.wide {
    min-width: 60px;
    flex: 1;
  }

  .mini-gradient-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .paint-number input {
    width: 46px;
    height: 20px;
    box-sizing: border-box;
    border: 1px solid #3B4650;
    border-radius: 3px;
    background: #111518;
    color: #E8EEF5;
    font: inherit;
    font-size: 10px;
  }

  .paint-number.text-size input {
    width: 54px;
  }

  .text-content-field {
    min-width: 176px;
  }

  .text-content-field input {
    width: 128px;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid #3B4650;
    border-radius: 3px;
    background: #111518;
    color: #E8EEF5;
    font: inherit;
    font-size: 10px;
  }

  .paint-opacity {
    min-width: 160px;
  }

  .paint-opacity input {
    width: 78px;
    accent-color: #5B9BD5;
  }

  .paint-opacity strong {
    width: 34px;
    text-align: right;
    color: #E8EEF5;
  }

  .layer-action-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 6px 8px;
    background: #171717;
    border-bottom: 1px solid #2A2A2A;
    color: #B9C8D4;
    overflow-x: auto;
  }

  .layer-action-strip.disabled {
    color: #727D86;
  }

  .layer-action-strip button,
  .rename-field {
    height: 28px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #22272B;
    color: #B9C8D4;
    font: inherit;
    font-size: 10px;
  }

  .layer-action-strip button {
    cursor: pointer;
    font-weight: 700;
    white-space: nowrap;
  }

  .action-icon {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 8px;
  }

  .action-icon.square {
    width: 28px;
    padding: 0;
  }

  .action-icon.detach {
    border-color: rgba(229, 160, 41, 0.65);
    background: #2B2417;
    color: #F3D39A;
  }

  .layer-action-strip button:hover:not(:disabled) {
    border-color: #5B9BD5;
    background: #173449;
    color: #EAF5FF;
  }

  .layer-action-strip button.danger:hover:not(:disabled) {
    border-color: #D65A5A;
    background: #4B2020;
    color: #FFE8E8;
  }

  .layer-action-strip button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .rename-field {
    display: inline-grid;
    grid-template-columns: auto 120px;
    align-items: center;
    gap: 6px;
    padding: 0 7px;
  }

  .rename-field span {
    font-weight: 700;
  }

  .rename-field input {
    width: 120px;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid #3B4650;
    border-radius: 3px;
    background: #111518;
    color: #E8EEF5;
    font: inherit;
    font-size: 10px;
  }

  .precision-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 6px 8px;
    background: #141719;
    border-bottom: 1px solid #2A2A2A;
    color: #B9C8D4;
    overflow-x: auto;
  }

  .precision-strip label,
  .precision-strip button {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 7px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #202427;
    color: #B9C8D4;
    font: inherit;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .precision-strip input {
    width: 54px;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid #3B4650;
    border-radius: 3px;
    background: #111518;
    color: #E8EEF5;
    font: inherit;
    font-size: 10px;
  }

  .precision-strip button {
    cursor: pointer;
  }

  .precision-strip button:hover {
    border-color: #5B9BD5;
    background: #173449;
    color: #EAF5FF;
  }

  .precision-strip input:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .arc-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    padding: 6px 8px;
    border-bottom: 1px solid #2A2A2A;
    background: #171C20;
    color: #B9C8D4;
    overflow-x: auto;
  }

  .preset-label {
    font-size: 9px;
    color: #7A8894;
    text-transform: uppercase;
  }

  .preset-swatches {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .preset-swatches .mini-swatch-btn.active {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
  }

  .arc-strip > strong {
    color: #E5C06B;
    font-size: 10px;
    text-transform: uppercase;
  }

  .arc-strip label {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 7px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #202427;
    color: #B9C8D4;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .arc-strip input {
    width: 58px;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid #3B4650;
    border-radius: 3px;
    background: #111518;
    color: #E8EEF5;
    font: inherit;
    font-size: 10px;
  }

  .surface-options-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 6px 8px;
    background: #15181A;
    border-bottom: 1px solid #2A2A2A;
    color: #B9C8D4;
    overflow-x: auto;
  }

  .surface-options-strip label,
  .surface-options-strip button {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #202427;
    color: #B9C8D4;
    font: inherit;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .surface-options-strip button {
    cursor: pointer;
  }

  .surface-options-strip button:hover {
    border-color: #5B9BD5;
    background: #173449;
    color: #EAF5FF;
  }

  .surface-options-strip .surface-command {
    border-color: #3B4650;
    background: #1D252B;
  }

  .surface-options-strip .surface-command.accent {
    border-color: rgba(229, 160, 41, 0.56);
    color: #FFE6B2;
  }

  .surface-options-strip .surface-command.danger {
    border-color: rgba(225, 88, 88, 0.5);
    color: #FFD4D4;
  }

  .surface-options-strip .surface-command:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .zone-mode-control {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 2px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #202427;
  }

  .surface-options-strip .zone-mode-control button {
    height: 22px;
    padding: 0 7px;
    border-color: transparent;
    background: transparent;
  }

  .surface-options-strip .zone-mode-control button.active {
    border-color: rgba(229, 160, 41, 0.5);
    background: rgba(229, 160, 41, 0.16);
    color: #FFE6B2;
  }

  .surface-options-strip input[type='checkbox'] {
    accent-color: #5B9BD5;
  }

  .surface-options-strip .snap-size input {
    width: 44px;
    box-sizing: border-box;
    border: 1px solid #3B4650;
    border-radius: 3px;
    background: #111518;
    color: #E8EEF5;
    font: inherit;
    font-size: 10px;
  }

  .tool-icon {
    position: relative;
    width: 16px;
    height: 16px;
    display: block;
  }

  .tool-icon.select::before {
    content: '';
    position: absolute;
    left: 4px;
    top: 2px;
    width: 0;
    height: 0;
    border-left: 9px solid #DCEBFA;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    transform: rotate(45deg);
  }

  .tool-icon.rectangle::before,
  .tool-icon.roundedRectangle::before,
  .tool-icon.text::before {
    content: '';
    position: absolute;
    inset: 3px 2px;
    border: 2px solid #DCEBFA;
  }

  .tool-icon.roundedRectangle::before {
    border-radius: 4px;
  }

  /* Capsule — an elongated stadium pill: short, with straight sides and
     fully rounded ends. */
  .tool-icon.capsule::before {
    content: '';
    position: absolute;
    inset: 5px 1px;
    border: 2px solid #DCEBFA;
    border-radius: 999px;
  }

  /* Ellipse — a smooth oval, wider than tall (true elliptical curve, not a
     stadium). border-radius:50% is what makes the sides curve continuously. */
  .tool-icon.ellipse::before {
    content: '';
    position: absolute;
    inset: 4px 1px;
    border: 2px solid #DCEBFA;
    border-radius: 50%;
  }

  /* Ring — a perfect circle with a hole punched out (thick-rimmed donut). */
  .tool-icon.ring::before {
    content: '';
    position: absolute;
    inset: 2px;
    border: 3px solid #DCEBFA;
    border-radius: 50%;
  }

  /* Arc — an open C: a ring segment with a clear gap (two sides removed). */
  .tool-icon.arcTrack::before {
    content: '';
    position: absolute;
    inset: 2px;
    border: 2px solid #DCEBFA;
    border-radius: 50%;
    border-left-color: transparent;
    border-bottom-color: transparent;
    transform: rotate(-45deg);
  }

  .tool-icon.text::after {
    content: 'T';
    position: absolute;
    inset: 0;
    color: #DCEBFA;
    font-size: 12px;
    font-weight: 800;
    line-height: 16px;
    text-align: center;
  }

  .tool-icon.hitZone::before {
    content: '';
    position: absolute;
    inset: 2px;
    border: 2px dashed #E5A029;
    border-radius: 3px;
  }

  .tool-icon.hitZone::after {
    content: '';
    position: absolute;
    left: 6px;
    top: 6px;
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: #E5A029;
  }

  /* (.surface-body wrapper removed — the shell itself is the CSS grid now.) */

  .surface-shell.previewing .surface-options-strip,
  .surface-shell.previewing .palette-panel,
  .surface-shell.previewing .surface-dock {
    display: none;
  }

  .surface-shell.previewing .surface-viewport :global(.ruler-wrapper) {
    display: none;
  }

  .surface-shell.previewing .surface-scroll {
    inset: 0;
    background:
      radial-gradient(circle at center, rgba(20, 184, 166, 0.08), transparent 38%),
      #0D1216;
  }

  .surface-shell.previewing .artboard {
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.12),
      0 18px 42px rgba(0, 0, 0, 0.34);
  }

  .surface-dock {
    min-height: 0;
    border-left: 1px solid #2A2A2A;
    background: #15181B;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .dock-pane {
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    min-height: 0;
  }

  .layer-tree {
    border-bottom: 1px solid #2A2A2A;
  }

  .inspector-pane {
    background: #171A1E;
  }

  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 6;
    padding: 8px 10px;
    color: #8DBFE5;
    background: #202429;
    border-bottom: 1px solid #2A2A2A;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .list-header strong {
    min-width: 20px;
    height: 17px;
    border: 1px solid rgba(141, 191, 229, 0.28);
    border-radius: 3px;
    color: #D9EBF8;
    font-size: 9px;
    line-height: 15px;
    text-align: center;
  }

  .list-header.secondary {
    position: static;
    border-top: 1px solid #2A2A2A;
  }

  .dock-add-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    flex-shrink: 0;
    padding: 6px;
    border-bottom: 1px solid #252C32;
    background: #181D22;
  }

  .dock-add-strip button {
    display: grid;
    place-items: center;
    height: 28px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #22272B;
    color: #DCEBFA;
    cursor: pointer;
  }

  .dock-add-strip button:hover {
    border-color: #5B9BD5;
    background: #173449;
  }

  .list-scroll {
    min-height: 0;
    max-height: none;
    overflow: visible;
  }

  .list-scroll.layer-scroll {
    flex: 0 0 auto;
    max-height: none;
  }

  .list-scroll.zones {
    min-height: 0;
    max-height: none;
  }

  .dock-generator-editor {
    min-height: 0;
    flex: 0 0 auto;
    overflow: visible;
    padding: 8px;
  }

  .dock-empty-tab {
    margin: 10px;
  }

  .dock-live-preview {
    min-height: 0;
    flex: 1 1 auto;
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 6px;
    padding: 8px;
    overflow: hidden;
  }

  .dock-live-reset {
    justify-self: end;
    padding: 3px 9px;
    border: 1px solid #2E3C46;
    border-radius: 4px;
    background: #1B252C;
    color: #AFC0CB;
    font-size: 10px;
    font-family: inherit;
    cursor: pointer;
  }

  .dock-live-reset:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .inspector-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
    padding: 10px;
    border-bottom: 1px solid #2A2A2A;
    background: #1D2227;
  }

  .inspector-head div {
    min-width: 0;
  }

  .inspector-head strong,
  .inspector-head span {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector-head strong {
    color: #E8EEF5;
    font-size: 12px;
  }

  .inspector-head span {
    margin-top: 2px;
    color: #8D9AA5;
    font-size: 10px;
  }

  .detach-mini {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 5px;
    height: 27px;
    padding: 0 8px;
    border: 1px solid rgba(229, 160, 41, 0.52);
    border-radius: 4px;
    background: #2B2417;
    color: #F3D39A;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }

  .inspector-tabs {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    flex-shrink: 0;
    position: sticky;
    top: 40px;
    z-index: 5;
    padding: 5px;
    gap: 3px;
    border-bottom: 1px solid #2A2A2A;
    background: #15191D;
  }

  .inspector-tabs button {
    min-width: 0;
    height: 27px;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: #96A6B2;
    cursor: pointer;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector-tabs button:hover,
  .inspector-tabs button.active {
    border-color: #3F6C92;
    background: #173449;
    color: #EAF5FF;
  }

  .inspector-content {
    min-height: 0;
    max-height: none;
    overflow: visible;
    padding: 8px;
  }

  .dock-section {
    padding: 9px;
    border: 1px solid #2D343A;
    border-radius: 5px;
    background: #1B2024;
  }

  .dock-section + .dock-section {
    margin-top: 8px;
  }

  .dock-section-title {
    margin-bottom: 8px;
    color: #8DBFE5;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .dock-section-subtitle {
    margin: 9px 0 2px;
    color: #7F929F;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .dock-empty,
  .dock-note {
    padding: 10px;
    border: 1px dashed #35404A;
    border-radius: 5px;
    color: #87939E;
    font-size: 11px;
    line-height: 1.35;
  }

  .dock-note {
    margin-bottom: 8px;
    border-style: solid;
    background: #171C20;
  }

  .dock-field,
  .dock-number-grid label,
  .paint-grid label {
    display: grid;
    gap: 4px;
    color: #AFC5D8;
    font-size: 10px;
    font-weight: 800;
  }

  .dock-field {
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    min-height: 29px;
    margin-top: 6px;
  }

  .dock-field.wide {
    grid-template-columns: 64px minmax(0, 1fr) auto;
  }

  .dock-field input,
  .dock-field select,
  .dock-number-grid input,
  .paint-grid input {
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid #3B4650;
    border-radius: 4px;
    background: #101418;
    color: #E8EEF5;
    font: inherit;
    font-size: 10px;
  }

  .dock-field input:not([type='checkbox']):not([type='range']),
  .dock-field select,
  .dock-number-grid input,
  .paint-grid input:not([type='color']) {
    width: 100%;
    height: 25px;
    padding: 0 7px;
  }

  .dock-field input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: #5B9BD5;
  }

  .dock-field input[type='range'] {
    width: 100%;
    accent-color: #5B9BD5;
  }

  .dock-field strong {
    color: #E8EEF5;
    font-size: 10px;
  }

  .dock-button-grid,
  .align-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
    margin-top: 8px;
  }

  .pivot-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    margin-top: 6px;
  }

  .dock-button-grid button,
  .align-grid button,
  .pivot-actions button,
  .segmented button {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 0;
    height: 27px;
    padding: 0 7px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #22272B;
    color: #B9C8D4;
    cursor: pointer;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dock-button-grid button:hover:not(:disabled),
  .align-grid button:hover,
  .pivot-actions button:hover:not(:disabled),
  .segmented button:hover,
  .segmented button.active {
    border-color: #5B9BD5;
    background: #173449;
    color: #EAF5FF;
  }

  .dock-button-grid button.danger:hover:not(:disabled) {
    border-color: #D65A5A;
    background: #4B2020;
    color: #FFE8E8;
  }

  .pivot-actions span {
    min-width: 0;
    max-width: 92px;
    overflow: hidden;
    color: #8394A0;
    font-size: 10px;
    font-weight: 700;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dock-button-grid button:disabled,
  .pivot-actions button:disabled,
  .dock-field input:disabled,
  .dock-field select:disabled,
  .paint-grid input:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .dock-number-grid,
  .paint-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .segmented {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    margin-top: 8px;
  }

  .mini-list {
    display: grid;
    gap: 4px;
  }

  .mini-list div {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    min-height: 27px;
    padding: 5px 7px;
    border: 1px solid #2A3036;
    border-radius: 4px;
    background: #15191D;
    color: #87939E;
    font-size: 10px;
  }

  .mini-list strong,
  .mini-list span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mini-list strong {
    color: #D4DEE7;
  }

  .dock-hint {
    margin-bottom: 6px;
    color: #6E7B87;
    font-size: 9.5px;
    line-height: 1.45;
  }

  .list-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    width: 100%;
    min-height: 43px;
    padding: 0;
    border: 0;
    border-bottom: 1px solid #252525;
    background: transparent;
    color: #C9D5DE;
    text-align: left;
    font: inherit;
  }

  .list-row:hover {
    background: #202A31;
  }

  .list-row.selected {
    background: #173449;
    color: #F1F8FF;
    box-shadow:
      inset 3px 0 0 #5B9BD5,
      inset 0 0 0 1px rgba(91, 155, 213, 0.34);
  }

  .list-row.selected:not(.primary) {
    background: #1E2C36;
    box-shadow:
      inset 3px 0 0 rgba(91, 155, 213, 0.68),
      inset 0 0 0 1px rgba(91, 155, 213, 0.18);
  }

  .list-row.generated {
    color: #EACB8C;
  }

  .list-row.hidden {
    opacity: 0.58;
  }

  .list-row.dragging {
    opacity: 0.42;
  }

  .list-row.locked strong::after {
    content: ' locked';
    color: #E5A029;
    font-size: 9px;
    font-weight: 700;
  }

  .list-row.zone-row.selected {
    background: #3A2C16;
    color: #FFF3D8;
    box-shadow:
      inset 3px 0 0 #E5A029,
      inset 0 0 0 1px rgba(229, 160, 41, 0.36);
  }

  .list-row.kit-row {
    color: #D9EAF4;
  }

  .list-row.kit-row.selected {
    background: #18333A;
    color: #F2FCFF;
    box-shadow:
      inset 3px 0 0 #14B8A6,
      inset 0 0 0 1px rgba(20, 184, 166, 0.34);
  }

  .list-row.generated-group-row {
    color: #F1D8A1;
    background: #191710;
  }

  .list-row.generated-group-row:hover {
    background: #242017;
  }

  .list-row.generated-group-row.collapsed {
    background: #151512;
  }

  .list-row.pulse {
    animation: row-pulse 720ms ease-out;
  }

  .row-main {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    min-width: 0;
    padding: 6px 8px;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font: inherit;
  }

  .layer-thumb {
    position: relative;
    width: 42px;
    height: 30px;
    overflow: hidden;
    border: 1px solid #31404A;
    border-radius: 4px;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px),
      #0C1217;
    background-size: 7px 7px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
  }

  .kit-thumb {
    display: grid;
    place-items: center;
  }

  .kit-thumb.horizontal .kit-thumb-ring,
  .kit-thumb.vertical .kit-thumb-ring {
    border: 0 !important;
    border-radius: 999px !important;
    background: #5B9BD5 !important;
  }

  .kit-thumb.horizontal .kit-thumb-ring {
    width: 28px !important;
    height: 3px !important;
  }

  .kit-thumb.vertical .kit-thumb-ring {
    width: 3px !important;
    height: 22px !important;
  }

  .kit-thumb.horizontal .kit-thumb-pointer {
    width: 3px !important;
    height: 18px !important;
    transform: none !important;
  }

  .kit-thumb.vertical .kit-thumb-pointer {
    width: 18px !important;
    height: 3px !important;
    transform: none !important;
  }

  .kit-thumb-ring {
    width: 20px;
    height: 20px;
    border: 3px solid #5B9BD5;
    border-right-color: #14B8A6;
    border-radius: 999px;
  }

  .kit-thumb-pointer {
    position: absolute;
    width: 4px;
    height: 14px;
    border-radius: 99px;
    background: #EAF6FF;
    transform: translateY(-4px) rotate(-35deg);
    transform-origin: 50% 100%;
  }

  .generated-group-thumb {
    display: grid;
    place-items: center;
    border-color: #6E5A2E;
    background:
      linear-gradient(90deg, rgba(229, 192, 107, 0.18) 1px, transparent 1px),
      linear-gradient(0deg, rgba(229, 192, 107, 0.18) 1px, transparent 1px),
      #16140E;
    background-size: 8px 8px;
  }

  .generated-group-thumb span {
    width: 23px;
    height: 15px;
    border: 1px dashed #E5C06B;
    border-radius: 3px;
    box-shadow:
      5px 4px 0 rgba(229, 192, 107, 0.16),
      -5px -4px 0 rgba(229, 192, 107, 0.12);
  }

  .layer-thumb-shape,
  .zone-thumb-shape {
    position: absolute;
    display: grid;
    place-items: center;
    min-width: 4px;
    min-height: 4px;
    border: 1px solid #5B9BD5;
    color: #0A1116;
    font-size: 9px;
    font-weight: 900;
    line-height: 1;
  }

  .layer-thumb-shape.text {
    background: #E8F3FA !important;
    border-color: #8FA4B0 !important;
  }

  .layer-thumb-shape.arc {
    background: transparent !important;
    border-width: 3px;
    border-left-color: transparent !important;
  }

  .layer-thumb-shape.capsule {
    border-radius: 999px !important;
  }

  .zone-thumb {
    border-color: rgba(229, 160, 41, 0.42);
    background:
      linear-gradient(90deg, rgba(229, 160, 41, 0.07) 1px, transparent 1px),
      linear-gradient(0deg, rgba(229, 160, 41, 0.07) 1px, transparent 1px),
      #11120E;
    background-size: 7px 7px;
  }

  .zone-thumb-shape {
    border: 1px dashed #E5A029;
    background: rgba(229, 160, 41, 0.16);
  }

  .row-text {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .row-badge {
    justify-self: end;
    max-width: 58px;
    overflow: hidden;
    padding: 2px 5px;
    border: 1px solid #2F404B;
    border-radius: 4px;
    background: #10181E;
    color: #8FA4B0;
    font-size: 8px;
    font-weight: 900;
    line-height: 1.2;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .row-badge.zone {
    border-color: rgba(229, 160, 41, 0.34);
    color: #E5A029;
  }

  .row-badge.kit {
    border-color: rgba(20, 184, 166, 0.38);
    color: #52D7CA;
  }

  .row-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px 0 2px;
    opacity: 0.18;
  }

  .list-row.selected .row-actions,
  .list-row:hover .row-actions,
  .list-row:focus-within .row-actions {
    opacity: 1;
  }

  .row-actions button {
    display: grid;
    place-items: center;
    width: 20px;
    height: 22px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: #AFC5D8;
    cursor: pointer;
  }

  .row-actions button:hover {
    border-color: #5B9BD5;
    background: rgba(91, 155, 213, 0.18);
    color: #EAF5FF;
  }

  .row-actions button:disabled {
    opacity: 0.32;
    cursor: not-allowed;
  }

  .row-actions button:disabled:hover {
    border-color: transparent;
    background: transparent;
    color: #AFC5D8;
  }

  .row-actions button.selected {
    border-color: rgba(125, 196, 243, 0.75);
    background: rgba(91, 155, 213, 0.24);
    color: #EAF5FF;
    font-weight: 900;
  }

  .list-row strong,
  .list-row em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-row strong {
    font-size: 11px;
    font-weight: 700;
  }

  .list-row em {
    color: #7F8B94;
    font-size: 10px;
    font-style: normal;
  }

  .list-empty {
    padding: 12px 10px;
    color: #666;
    font-size: 11px;
  }

  .surface-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      #131313;
    background-size: 20px 20px;
  }

  .draw-notice {
    position: absolute;
    left: 50%;
    top: 10px;
    z-index: 2600;
    transform: translateX(-50%);
    padding: 6px 9px;
    border: 1px solid rgba(229, 160, 41, 0.58);
    border-radius: 4px;
    background: rgba(31, 24, 12, 0.94);
    color: #FFE6B2;
    font-size: 11px;
    font-weight: 800;
    pointer-events: none;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.34);
  }

  .readiness-nudge {
    position: absolute;
    left: 50%;
    bottom: 12px;
    z-index: 2590;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    max-width: calc(100% - 48px);
    padding: 5px 8px;
    border: 1px solid rgba(120, 130, 150, 0.4);
    border-radius: 6px;
    background: rgba(28, 30, 38, 0.95);
    color: rgba(222, 228, 238, 0.9);
    font-size: 10px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
  }

  .readiness-nudge strong {
    color: rgba(232, 192, 138, 0.95);
    font-size: 10px;
  }

  .readiness-nudge .nudge-step {
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(106, 87, 57, 0.6);
    background: rgba(33, 29, 25, 0.9);
    color: #E8C08A;
  }

  .readiness-nudge .nudge-step.required {
    border-color: rgba(106, 57, 57, 0.7);
    background: rgba(37, 23, 23, 0.9);
    color: #E8A0A0;
  }

  .readiness-nudge button {
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: rgba(222, 228, 238, 0.7);
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
  }

  .readiness-nudge button:hover {
    background: rgba(220, 90, 90, 0.3);
  }

  .surface-scroll.space-pan {
    cursor: grab;
  }

  .surface-scroll.panning {
    cursor: grabbing;
  }

  .surface-pad {
    min-width: max-content;
    min-height: 100%;
    padding: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .artboard {
    position: relative;
    flex: none;
    background: #0F1114;
    transform-origin: center center;
    box-shadow:
      0 0 0 1px #364554,
      0 18px 42px rgba(0, 0, 0, 0.34);
    overflow: visible;
  }

  .artboard.drawing {
    cursor: crosshair;
  }

  .designer-live-preview {
    position: absolute;
    inset: 0;
    z-index: 5200;
    background: transparent;
  }

  .draw-capture {
    position: absolute;
    inset: 0;
    z-index: 2300;
    cursor: crosshair;
  }


  .part-bound,
  .hit-zone {
    position: absolute;
    box-sizing: border-box;
    padding: 0;
    margin: 0;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .part-bound {
    border: 1px dashed rgba(91, 155, 213, 0.68);
    color: #CDE7F6;
    user-select: none;
  }

  .part-bound.bounds-hidden {
    border-color: transparent;
  }

  .part-bound.arp-muted {
    pointer-events: none;
    border-color: transparent;
  }

  .part-bound.bounds-hidden:hover {
    border-color: rgba(91, 155, 213, 0.42);
  }

  .part-bound.generated {
    border-style: dotted;
    border-color: rgba(229, 160, 41, 0.72);
  }

  .part-bound.kit-bound {
    border: 2px solid #14B8A6;
    color: #DFFFFB;
    background: rgba(20, 184, 166, 0.04);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.56),
      0 0 0 4px rgba(20, 184, 166, 0.15),
      0 0 18px rgba(20, 184, 166, 0.24);
  }

  .part-bound.kit-bound > .selection-label {
    background: rgba(12, 54, 50, 0.96);
    color: #E6FFFB;
  }

  .part-bound.selected {
    border: 2px solid #5B9BD5;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.82),
      0 0 0 4px rgba(91, 155, 213, 0.18),
      0 0 18px rgba(91, 155, 213, 0.34);
  }

  .part-bound.selected:not(.primary) {
    border-color: rgba(125, 196, 243, 0.82);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.42),
      0 0 0 3px rgba(91, 155, 213, 0.12);
  }

  .part-bound.selected::before,
  .hit-zone.selected::before {
    content: '';
    position: absolute;
    inset: -7px;
    border: 1px solid rgba(125, 196, 243, 0.38);
    pointer-events: none;
  }

  .part-bound.pulse,
  .hit-zone.pulse {
    animation: selection-pulse 720ms ease-out;
  }

  .part-bound.locked {
    cursor: not-allowed;
  }

  .hit-zone.locked {
    cursor: not-allowed;
  }

  .part-bound.bounds-hidden.selected {
    border-color: #5B9BD5;
  }

  .part-bound > .selection-label,
  .hit-zone > .selection-label {
    position: absolute;
    display: none;
    left: -1px;
    top: -6px;
    z-index: 12;
    max-width: min(180px, max(120px, 100%));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 3px 8px;
    border: 1px solid rgba(125, 196, 243, 0.32);
    border-radius: 4px;
    background: rgba(12, 23, 31, 0.96);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.38);
    color: #DDEEFF;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.1;
    opacity: 0;
    pointer-events: none;
    transform: translateY(calc(-100% - 6px));
    transition:
      opacity 90ms ease,
      transform 90ms ease;
  }

  .part-bound:hover > .selection-label,
  .part-bound:focus-visible > .selection-label,
  .part-bound.selected > .selection-label,
  .part-bound.primary > .selection-label,
  .part-bound.pulse > .selection-label,
  .hit-zone:hover > .selection-label,
  .hit-zone:focus-visible > .selection-label,
  .hit-zone.selected > .selection-label,
  .hit-zone.pulse > .selection-label {
    opacity: 1;
    transform: translateY(calc(-100% - 8px));
  }

  .part-bound.arp-muted > .selection-label {
    opacity: 0;
  }

  .part-bound.generated:not(.generated-labels-hidden) > .selection-label {
    opacity: 1;
    transform: translateY(calc(-100% - 8px));
  }

  .part-bound > .resize-handle,
  .hit-zone > .resize-handle,
  .part-bound > .rotate-handle {
    position: absolute;
    display: block;
    padding: 0;
    border-radius: 2px;
    opacity: 1;
    pointer-events: auto;
  }

  .part-bound > .resize-handle,
  .hit-zone > .resize-handle {
    width: 8px;
    height: 8px;
    background: #5B9BD5;
    border: 1px solid #FFF;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
  }

  .part-bound > .resize-handle::after,
  .hit-zone > .resize-handle::after {
    content: '';
    position: absolute;
    inset: -5px;
  }

  .part-bound.tiny > .resize-handle {
    width: 7px;
    height: 7px;
  }

  .part-bound.tiny > .resize-handle::after {
    inset: -2px;
  }

  .hit-zone > .resize-handle {
    background: #E5A029;
  }

  .part-bound > .rotate-handle {
    left: calc(50% - 5px);
    top: -30px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #E5A029;
    border: 1px solid #FFF;
    cursor: grab;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
  }

  .part-bound > .rotate-handle::before {
    content: '';
    position: absolute;
    left: 4px;
    top: 10px;
    width: 1px;
    height: 18px;
    background: rgba(229, 160, 41, 0.9);
  }

  .part-bound > .arc-handle {
    position: absolute;
    z-index: 2;
    width: 12px;
    height: 12px;
    border: 1px solid #FFF;
    border-radius: 999px;
    background: #E5C06B;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
    cursor: crosshair;
    pointer-events: auto;
  }

  .part-bound > .arc-handle.arc-end {
    background: #7DC4F3;
  }

  .part-bound > .arc-handle::after {
    content: '';
    position: absolute;
    inset: -5px;
  }

  .hit-zone {
    border: 1px solid rgba(229, 160, 41, 0.9);
    background: rgba(229, 160, 41, 0.14);
    color: #FFE6B2;
  }

  .hit-zone.dimmed {
    border-color: rgba(229, 160, 41, 0.42);
    background: rgba(229, 160, 41, 0.045);
    opacity: 0.55;
  }

  /* Follow-mode zones show the resolved grab area (source part + inflate +
     minTouch) as a teal halo — distinct from authored amber zones. */
  .hit-zone.follow {
    border: 1px dashed rgba(45, 212, 191, 0.9);
    background: rgba(45, 212, 191, 0.07);
    color: #C8FFF6;
    box-shadow:
      0 0 0 3px rgba(45, 212, 191, 0.12),
      0 0 14px rgba(45, 212, 191, 0.18);
  }

  .hit-zone.follow.selected {
    border-width: 2px;
    background: rgba(45, 212, 191, 0.16);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.55),
      0 0 0 4px rgba(45, 212, 191, 0.16),
      0 0 18px rgba(45, 212, 191, 0.26);
  }

  .hit-zone.follow > .selection-label {
    background: rgba(10, 56, 50, 0.96);
    border-color: rgba(45, 212, 191, 0.4);
    color: #C8FFF6;
  }

  .hit-zone.selected {
    border-width: 2px;
    background: rgba(229, 160, 41, 0.24);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.58),
      0 0 0 4px rgba(229, 160, 41, 0.16),
      0 0 18px rgba(229, 160, 41, 0.26);
  }

  .hit-zone > .selection-label {
    background: rgba(73, 49, 12, 0.96);
    border-color: rgba(229, 160, 41, 0.38);
    color: #FFE6B2;
  }

  .multi-selection-bound {
    position: absolute;
    z-index: 2390;
    box-sizing: border-box;
    border: 1px solid rgba(125, 196, 243, 0.88);
    background: rgba(91, 155, 213, 0.05);
    pointer-events: none;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.38),
      0 0 0 5px rgba(91, 155, 213, 0.1);
  }

  .multi-selection-bound span {
    position: absolute;
    display: none;
    left: 0;
    top: -20px;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(20, 38, 53, 0.96);
    color: #DDEEFF;
    font-size: 9px;
    font-weight: 800;
    white-space: nowrap;
  }

  .surface-name-tray {
    position: absolute;
    left: 0;
    top: -36px;
    z-index: 2620;
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: max(240px, 100%);
    overflow: hidden;
    padding: 5px 6px;
    border: 1px solid rgba(125, 196, 243, 0.34);
    border-radius: 5px;
    background: rgba(12, 23, 31, 0.96);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.42);
    color: #DDEEFF;
    pointer-events: none;
    white-space: nowrap;
  }

  .surface-name-tray span {
    min-width: 0;
    max-width: 150px;
    overflow: hidden;
    padding: 2px 7px;
    border-radius: 3px;
    background: rgba(125, 196, 243, 0.12);
    color: #DDEEFF;
    font-size: 10px;
    font-weight: 900;
    line-height: 1.1;
    text-overflow: ellipsis;
  }

  .surface-name-tray span.hit-zone-label {
    background: rgba(229, 160, 41, 0.14);
    color: #FFE6B2;
  }

  .surface-name-tray span.kit-label {
    background: rgba(20, 184, 166, 0.16);
    color: #DFFFFA;
  }

  .inline-text-editor {
    position: absolute;
    box-sizing: border-box;
    padding: 0 8px;
    border: 1px solid #7DC4F3;
    border-radius: 2px;
    background: rgba(12, 18, 24, 0.96);
    outline: 2px solid rgba(91, 155, 213, 0.24);
    text-align: center;
  }

  .selection-quickbar {
    position: absolute;
    right: 16px;
    bottom: 14px;
    left: auto;
    top: auto;
    z-index: 2420;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: max-content;
    max-width: calc(100% - 32px);
    height: 31px;
    margin: 0;
    padding: 3px 5px;
    border: 1px solid rgba(91, 155, 213, 0.62);
    border-radius: 4px;
    background: rgba(13, 18, 23, 0.94);
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.36);
  }

  .selection-quickbar.zone-tools {
    border-color: rgba(229, 160, 41, 0.64);
  }

  .quickbar-label {
    max-width: 72px;
    overflow: hidden;
    padding: 0 7px 0 4px;
    border-right: 1px solid rgba(255, 255, 255, 0.11);
    color: #9EB2BE;
    font-size: 10px;
    font-weight: 900;
    line-height: 1;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .selection-quickbar button {
    display: grid;
    place-items: center;
    width: 23px;
    height: 23px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: #DDEEFF;
    cursor: pointer;
  }

  .selection-quickbar button.quick-text {
    font-size: 10px;
    font-weight: 900;
  }

  .selection-quickbar button:hover:not(:disabled) {
    border-color: rgba(125, 196, 243, 0.6);
    background: rgba(91, 155, 213, 0.2);
  }

  .selection-quickbar.zone-tools button:hover:not(:disabled) {
    border-color: rgba(229, 160, 41, 0.62);
    background: rgba(229, 160, 41, 0.16);
  }

  .selection-quickbar button.danger:hover:not(:disabled) {
    border-color: rgba(214, 90, 90, 0.74);
    background: rgba(75, 32, 32, 0.8);
    color: #FFE8E8;
  }

  .selection-quickbar button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  .draw-preview {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid #7DC4F3;
    background: rgba(91, 155, 213, 0.18);
    z-index: 2400;
    pointer-events: none;
  }

  .draw-preview.roundedRectangle {
    border-radius: 8px;
  }

  .draw-preview.ellipse,
  .draw-preview.ring,
  .draw-preview.arcTrack,
  .draw-preview.capsule {
    border-radius: 999px;
  }

  .draw-preview.ring,
  .draw-preview.arcTrack {
    background: rgba(91, 155, 213, 0.04);
    border-width: 4px;
  }

  .draw-preview.arcTrack {
    border-left-color: transparent;
    transform: rotate(-35deg);
  }

  .draw-preview.hitZone {
    border-color: #E5A029;
    border-style: dashed;
    background: rgba(229, 160, 41, 0.16);
  }

  .draw-preview.text::after {
    content: 'Text';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #DCEBFA;
    font-size: 12px;
    font-weight: 700;
  }

  .draw-preview span {
    position: absolute;
    left: 0;
    top: -18px;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(20, 38, 53, 0.94);
    color: #DDEEFF;
    font-size: 9px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .snap-guide {
    position: absolute;
    z-index: 2380;
    pointer-events: none;
    background: rgba(125, 196, 243, 0.82);
    box-shadow: 0 0 7px rgba(125, 196, 243, 0.42);
  }

  .snap-guide.x {
    width: 1px;
  }

  .snap-guide.y {
    height: 1px;
  }

  /* Object-relative smart guides — magenta, so they read differently from grid snaps. */
  .smart-guide {
    position: absolute;
    z-index: 2385;
    pointer-events: none;
    background: rgba(236, 72, 153, 0.92);
    box-shadow: 0 0 7px rgba(236, 72, 153, 0.5);
  }

  .smart-guide.x {
    width: 1px;
  }

  .smart-guide.y {
    height: 1px;
  }

  /* Artboard-centre guide reads distinct (amber) so "centered" is obvious. */
  .smart-guide.center {
    background: rgba(250, 204, 21, 0.95);
    box-shadow: 0 0 8px rgba(250, 204, 21, 0.55);
  }

  .smart-guide.center.x {
    width: 2px;
  }

  .smart-guide.center.y {
    height: 2px;
  }

  .measure-line {
    position: absolute;
    z-index: 2395;
    pointer-events: none;
  }

  .measure-line.x {
    height: 0;
    border-top: 1px dashed rgba(250, 204, 21, 0.95);
  }

  .measure-line.y {
    width: 0;
    border-left: 1px dashed rgba(250, 204, 21, 0.95);
  }

  .measure-line span {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(30, 30, 36, 0.92);
    border: 1px solid rgba(250, 204, 21, 0.6);
    color: rgba(250, 224, 120, 0.98);
    font-size: 10px;
    white-space: nowrap;
  }

  .align-toolbar {
    position: absolute;
    z-index: 2420;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    border-radius: 6px;
    background: rgba(30, 30, 36, 0.94);
    border: 1px solid rgba(120, 130, 150, 0.4);
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.35);
  }

  .align-toolbar button {
    min-width: 22px;
    height: 20px;
    padding: 0 3px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: rgba(222, 228, 238, 0.92);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }

  .align-toolbar button:hover:not(:disabled) {
    background: rgba(91, 155, 213, 0.3);
  }

  .align-toolbar button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .align-divider {
    width: 1px;
    height: 14px;
    margin: 0 2px;
    background: rgba(120, 130, 150, 0.4);
  }


  .measure-badge {
    position: absolute;
    z-index: 2410;
    display: grid;
    gap: 2px;
    min-width: 112px;
    padding: 5px 7px;
    border: 1px solid rgba(125, 196, 243, 0.58);
    border-radius: 4px;
    background: rgba(13, 18, 23, 0.92);
    color: #DDEEFF;
    font-size: 10px;
    line-height: 1.2;
    pointer-events: none;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.34);
  }

  .measure-badge strong {
    color: #7DC4F3;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .measure-badge span {
    white-space: nowrap;
  }

  @keyframes selection-pulse {
    0% {
      outline: 0 solid rgba(125, 196, 243, 0.78);
      filter: brightness(1.2);
    }
    100% {
      outline: 14px solid rgba(125, 196, 243, 0);
      filter: brightness(1);
    }
  }

  @keyframes row-pulse {
    0% {
      filter: brightness(1.35);
    }
    100% {
      filter: brightness(1);
    }
  }

  .empty-state {
    display: flex;
    min-height: 240px;
    align-items: center;
    justify-content: center;
    color: #777;
    font-size: 12px;
  }

  /* Affinity-style workspace pass: keep the existing editor logic, but make
     the space read as a dedicated graphical component designer. */
  .surface-shell {
    min-height: 0;
    height: 100%;
    border: 0;
    background:
      radial-gradient(circle at 50% 0%, rgba(20, 184, 166, 0.09), transparent 34%),
      linear-gradient(180deg, #111820 0%, #0F151B 100%);
    color: #C9D6DF;
  }

  .surface-shell:focus-within {
    border-color: transparent;
  }

  .surface-options-strip {
    justify-content: space-between;
    min-height: 31px;
    padding: 3px 8px;
    background: linear-gradient(180deg, #172027, #11181F);
    border-bottom: none;
    border-top: 1px solid #26313A;
    scrollbar-width: thin;
    gap: 12px;
  }

  .surface-toolbar-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  /* Teal zoom controls (right side) — mirrors the Panel Designer's ZoomBar. */
  .surface-zoombar {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .surface-zoombar .szb-btn {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #2D3A44;
    border-radius: 4px;
    background: #18232B;
    color: #9FB2BF;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 0;
  }

  .surface-zoombar .szb-btn:hover {
    color: #DCEBFA;
    border-color: #3A4A56;
  }

  .surface-zoombar .szb-btn.icon {
    width: auto;
    padding: 0 5px;
  }

  .surface-zoombar .szb-btn.toggle-on {
    color: #14B8A6;
    border-color: rgba(20, 184, 166, 0.5);
    background: rgba(20, 184, 166, 0.14);
  }

  .szb-zoom-value {
    min-width: 38px;
    text-align: center;
    color: #B9C8D4;
    font-size: 11px;
    cursor: text;
    padding: 1px 3px;
    border-radius: 3px;
  }

  .szb-zoom-value:hover {
    background: #1C2831;
    color: #EAF5FF;
  }

  .szb-zoom-input {
    width: 42px;
    background: #0D1419;
    border: 1px solid #14B8A6;
    border-radius: 3px;
    color: #E8EEF5;
    font-size: 11px;
    text-align: center;
    padding: 1px 3px;
    outline: none;
  }

  .szb-inc-label {
    color: #6F7E8A;
    font-size: 10px;
    white-space: nowrap;
  }

  .surface-zoombar .szb-inc-input {
    width: 34px;
    background: #0D1419;
    border: 1px solid #2D3A44;
    border-radius: 3px;
    color: #E8EEF5;
    font-size: 10px;
    text-align: center;
    padding: 2px;
    outline: none;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .surface-zoombar .szb-inc-input::-webkit-inner-spin-button,
  .surface-zoombar .szb-inc-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .surface-zoombar .szb-inc-input:focus {
    border-color: #14B8A6;
  }

  .szb-divider {
    width: 1px;
    height: 14px;
    background: #2D3A44;
    margin: 0 3px;
  }

  .surface-options-strip label,
  .surface-options-strip button,
  .zone-mode-control {
    height: 24px;
    border-color: #2D3A44;
    border-radius: 4px;
    background: #18232B;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
  }

  .surface-options-strip .surface-command.accent {
    border-color: rgba(20, 184, 166, 0.54);
    color: #BFFAF2;
  }

  .surface-options-strip input[type='checkbox'] {
    accent-color: #14B8A6;
  }

  .surface-viewport {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .surface-scroll {
    position: absolute;
    inset: 20px 0 0 20px;
    overflow: auto;
  }

  .tool-strip {
    gap: 8px;
    padding: 7px 12px;
    /* Sits at the bottom of the canvas grid cell (align-self:end above) and
       floats over the artboard rather than taking its own row. */
    background: transparent;
    border-top: none;
    position: relative;
    z-index: 6;
    pointer-events: none;
  }

  /* Only the buttons should catch clicks — the empty strip lets them fall
     through to the canvas underneath. */
  .tool-strip > * {
    pointer-events: auto;
  }

  .tool-strip button {
    width: 38px;
    height: 38px;
    border-color: #32414B;
    background: #172229;
    color: #D8E6EE;
  }

  .tool-strip button:hover,
  .tool-strip button.active {
    border-color: #14B8A6;
    background: rgba(20, 184, 166, 0.18);
    box-shadow:
      0 0 0 1px rgba(20, 184, 166, 0.22),
      0 8px 18px rgba(20, 184, 166, 0.08);
  }

  .tool-flyout {
    border-color: #31434F;
    background: #111A21;
  }

  .tool-icon.rectangle::before,
  .tool-icon.roundedRectangle::before,
  .tool-icon.capsule::before,
  .tool-icon.text::before,
  .tool-icon.ellipse::before,
  .tool-icon.ring::before {
    border-color: #DCEBFA;
  }

  .tool-icon.text::after {
    color: #DCEBFA;
  }

  .palette-panel {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(28, 40, 49, 0.96), rgba(15, 22, 28, 0.96)),
      #111920;
    border-right: 1px solid #2A3741;
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.025);
  }

  .palette-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 12px 16px;
    scrollbar-width: thin;
  }

  /* Pane-toggle footer pinned at the bottom of the palette (like the normal
     editor's IconPanel toggles). Stays visible even when the palette collapses. */
  .palette-toggles {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: auto;
    padding: 8px 6px;
    border-top: 1px solid #26313A;
    background: rgba(13, 19, 24, 0.55);
  }

  .palette-toggles button {
    width: 34px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #2E3B45;
    border-radius: 5px;
    background: #172229;
    color: #8A99A5;
    cursor: pointer;
  }

  .palette-toggles button:hover {
    color: #DCEBFA;
    border-color: #3A4A56;
  }

  .palette-toggles button.active {
    color: #14B8A6;
    border-color: rgba(20, 184, 166, 0.5);
    background: rgba(20, 184, 166, 0.12);
  }

  .surface-shell.palette-collapsed .palette-scroll {
    display: none;
  }

  .surface-shell.palette-collapsed .palette-toggles {
    flex-direction: column;
    padding: 8px 4px;
  }

  .palette-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    color: #E7F2F7;
  }

  .palette-header strong {
    font-size: 12px;
    font-weight: 800;
  }

  .palette-header span {
    color: #93A5B1;
    font-size: 10px;
    font-weight: 800;
  }

  .palette-group {
    display: grid;
    gap: 8px;
    padding: 0 0 13px;
    margin-bottom: 13px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  }

  .palette-group > span {
    color: #8FA4B0;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .palette-grid {
    display: grid;
    /* 6 columns so the 6 Basic shapes / Value Controls fit on a single row
       (no orphan icon wrapping to a second line). */
    grid-template-columns: repeat(6, 1fr);
    gap: 7px;
  }

  .palette-grid.compact,
  .palette-grid.brush-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .palette-grid button {
    display: grid;
    place-items: center;
    min-width: 0;
    height: 31px;
    border: 1px solid #303F49;
    border-radius: 4px;
    background: #1C2831;
    color: #DCEBFA;
    cursor: pointer;
  }

  .palette-grid button:hover,
  .palette-grid button.active {
    border-color: #14B8A6;
    background: rgba(20, 184, 166, 0.18);
    color: #F3FFFD;
  }

  .palette-grid button:disabled,
  .palette-stepper input:disabled,
  .palette-corner input:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  /* Lines & polygons palette glyphs: a filled box clipped to the shape. */
  .poly-glyph {
    display: block;
    width: 16px;
    height: 16px;
    background: #DCEBFA;
  }

  .line-glyph {
    height: 2px;
    border-radius: 2px;
  }

  .palette-glyph {
    position: relative;
    display: block;
    width: 18px;
    height: 18px;
  }

  .palette-glyph.dial {
    border: 2px solid #DCEBFA;
    border-radius: 999px;
  }

  .palette-glyph.dial::after {
    content: '';
    position: absolute;
    left: 8px;
    top: 2px;
    width: 2px;
    height: 8px;
    border-radius: 999px;
    background: #14B8A6;
  }

  .palette-glyph.hscale::before,
  .palette-glyph.vscale::before {
    content: '';
    position: absolute;
    border-radius: 999px;
    background: #DCEBFA;
  }

  .palette-glyph.hscale::before {
    left: 1px;
    right: 1px;
    top: 8px;
    height: 2px;
  }

  .palette-glyph.vscale::before {
    top: 1px;
    bottom: 1px;
    left: 8px;
    width: 2px;
  }

  .palette-glyph.hscale::after,
  .palette-glyph.vscale::after {
    content: '';
    position: absolute;
    background:
      linear-gradient(90deg, #14B8A6 0 2px, transparent 2px 6px, #14B8A6 6px 8px, transparent 8px 12px, #14B8A6 12px 14px);
  }

  .palette-glyph.hscale::after {
    left: 2px;
    top: 12px;
    width: 14px;
    height: 5px;
  }

  .palette-glyph.vscale::after {
    left: 1px;
    top: 2px;
    width: 5px;
    height: 14px;
    transform: rotate(90deg);
  }

  .palette-glyph.grid {
    background:
      linear-gradient(90deg, transparent 32%, #DCEBFA 32% 40%, transparent 40% 62%, #DCEBFA 62% 70%, transparent 70%),
      linear-gradient(0deg, transparent 32%, #DCEBFA 32% 40%, transparent 40% 62%, #DCEBFA 62% 70%, transparent 70%);
    border: 1px solid #DCEBFA;
  }

  .brush-preview {
    display: block;
    width: 24px;
    height: 3px;
    border-radius: 999px;
    background: #DCEBFA;
    transform: rotate(-20deg);
  }

  .brush-preview.soft {
    height: 5px;
    opacity: 0.8;
  }

  .brush-preview.bold {
    height: 7px;
    background: #8FA4B0;
  }

  .palette-stepper,
  .palette-swatch-row,
  .palette-corner {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    color: #9FB2BF;
    font-size: 10px;
    font-weight: 800;
  }

  .palette-swatch-row code,
  .palette-stepper strong,
  .palette-corner strong {
    min-width: 0;
    color: #DFEAF0;
    font: inherit;
    font-size: 10px;
    white-space: nowrap;
  }

  .palette-corner input,
  .palette-stepper input {
    width: 60px;
    height: 28px;
    border: 1px solid #34444F;
    border-radius: 4px;
    background: #0D1419;
    color: #E8EEF5;
    font: inherit;
    font-size: 11px;
    text-align: center;
  }

  .surface-scroll {
    background:
      linear-gradient(90deg, rgba(126, 151, 164, 0.055) 1px, transparent 1px),
      linear-gradient(0deg, rgba(126, 151, 164, 0.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(20, 184, 166, 0.11) 1px, transparent 1px),
      linear-gradient(0deg, rgba(20, 184, 166, 0.11) 1px, transparent 1px),
      radial-gradient(circle at center, rgba(41, 61, 72, 0.32), transparent 56%),
      #0D1318;
    background-size:
      var(--surface-grid-size, 20px) var(--surface-grid-size, 20px),
      var(--surface-grid-size, 20px) var(--surface-grid-size, 20px),
      calc(var(--surface-grid-size, 20px) * 10) calc(var(--surface-grid-size, 20px) * 10),
      calc(var(--surface-grid-size, 20px) * 10) calc(var(--surface-grid-size, 20px) * 10),
      auto,
      auto;
    scrollbar-width: thin;
  }

  .surface-pad {
    padding: 96px 112px;
    align-items: center;
    justify-content: center;
  }

  .artboard {
    border-radius: 0;
    background:
      radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.055), transparent 38%),
      #10161B;
    /* Crisp green outline + soft drop shadow only — no surrounding teal halo band. */
    box-shadow:
      0 0 0 1px rgba(20, 184, 166, 0.72),
      0 28px 72px rgba(0, 0, 0, 0.5);
  }

  .part-bound.selected {
    border-color: #14B8A6;
    box-shadow:
      0 0 0 1px rgba(236, 255, 251, 0.82),
      0 0 0 5px rgba(20, 184, 166, 0.18),
      0 0 22px rgba(20, 184, 166, 0.22);
  }

  .resize-handle,
  .rotate-handle,
  .arc-handle {
    border-color: #DAFFFA;
    background: #14B8A6;
  }

  .selection-quickbar {
    height: 31px;
    padding: 3px 5px;
    border-color: #34444F;
    background: rgba(20, 27, 33, 0.96);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.38);
  }

  .surface-dock {
    border-left: 1px solid #2A3741;
    background:
      linear-gradient(180deg, rgba(23, 33, 41, 0.98), rgba(13, 19, 25, 0.98)),
      #121A21;
  }

  .list-header,
  .inspector-head {
    background: #172129;
    border-bottom-color: #2A3741;
  }

  .dock-tab-row {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    padding: 2px;
    border: 1px solid #2C3A44;
    border-radius: 5px;
    background: #10181E;
  }

  .dock-tab-row button {
    height: 23px;
    padding: 0 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #7F929F;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
  }

  .dock-tab-row button.active,
  .dock-tab-row button:hover {
    background: rgba(20, 184, 166, 0.16);
    color: #DFFFFA;
  }

  .list-header span,
  .dock-section-title,
  .dock-section-subtitle,
  .inspector-tabs button.active {
    color: #8FEDE3;
  }

  .dock-add-strip,
  .inspector-tabs {
    background: #111A21;
    border-bottom-color: #24313A;
  }

  .dock-add-strip button,
  .dock-button-grid button,
  .align-grid button,
  .pivot-actions button,
  .segmented button {
    border-color: #303F49;
    background: #1B2730;
  }

  .dock-add-strip button:hover,
  .dock-button-grid button:hover:not(:disabled),
  .align-grid button:hover,
  .pivot-actions button:hover:not(:disabled),
  .segmented button:hover,
  .segmented button.active,
  .inspector-tabs button:hover,
  .inspector-tabs button.active {
    border-color: #14B8A6;
    background: rgba(20, 184, 166, 0.17);
    color: #F0FFFC;
  }

  .list-row {
    min-height: 54px;
    border-bottom-color: #222D35;
  }

  .list-row:hover {
    background: #18252D;
  }

  .list-row.selected {
    background: linear-gradient(90deg, rgba(20, 184, 166, 0.28), rgba(20, 184, 166, 0.13));
    box-shadow:
      inset 3px 0 0 #14B8A6,
      inset 0 0 0 1px rgba(20, 184, 166, 0.28);
  }

  .layer-thumb {
    border-color: #344650;
    background-color: #0B1116;
  }

  .list-row.selected .layer-thumb {
    border-color: #14B8A6;
    box-shadow:
      inset 0 0 0 1px rgba(20, 184, 166, 0.24),
      0 0 14px rgba(20, 184, 166, 0.12);
  }

  .row-badge {
    border-color: #31404A;
    background: rgba(13, 20, 25, 0.92);
  }

  .inspector-pane,
  .dock-section {
    background: #141E25;
  }

  .dock-section {
    border-color: #2A3741;
    border-radius: 6px;
  }

  .dock-field input,
  .dock-field select,
  .dock-number-grid input,
  .paint-grid input {
    border-color: #33434E;
    background: #0D1419;
  }

  .dock-field input[type='checkbox'],
  .dock-field input[type='range'] {
    accent-color: #14B8A6;
  }

  @media (max-width: 1380px) {
    .surface-shell {
      --palette-w: 176px;
      --dock-w: 330px;
    }

    .palette-panel {
      padding-left: 10px;
      padding-right: 10px;
    }

    .palette-grid {
      gap: 5px;
    }
  }

  @media (max-width: 920px) {
    .surface-shell {
      --palette-w: 0px;
      --dock-w: 318px;
    }

    .palette-panel {
      display: none;
    }
  }
</style>
