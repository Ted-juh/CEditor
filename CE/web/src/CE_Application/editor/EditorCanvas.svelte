<script>
  import { panels, activePanel, activeEditorTab, activePanelDesignerSplit, editorZoom, editorZoomIncrement, selectedComponentId, selectedComponentIds, selectComponent, clearSelection, setPanelDesignerSplitSize, openPanelFromFile, openStandaloneDeviceProfileTab, setActiveEditorTab, updatePanel } from '../stores/panels.js';
  import { addControl, addCustomComponentPackage, getSection, removeControl, duplicateControl, updateControlProperty, selectedControl, groupSelectionIntoContainer, ungroupContainer } from '../stores/controls.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import { enumerateLeafPaths } from '../stores/controlTreeUtils.js';
  import { cutSelection, copySelection, pasteSelection, selectAll } from '../stores/clipboard.js';
  import { buildSolidStyle, buildGradientStyle, buildLayerStyle } from '../utils/backgroundCSS.js';
  import { computeGridOrigin, buildGridStyle } from '../utils/gridCSS.js';
  import { handleEditorShortcut } from '../utils/editorShortcuts.js';
  import { findControlsInRect, findControlAtPoint, marqueeScopeId } from '../utils/canvasSelection.js';
  import { controlPanelOffset, controlPanelRect, findParentOfControl, getChildControls } from '../utils/containment.js';
  import { gestureHudParts, gestureTargetFor, readGestureGeometry, rewindGesture } from '../utils/canvasGesture.js';
  import { measureBetweenRects } from '../utils/canvasMeasure.js';
  import { detectEqualSpacing } from '../utils/equalSpacing.js';
  import { normalizePanelLayers } from '../utils/panelLayers.js';
  import { createPanController, createMarqueeController } from '../utils/canvasInteractions.js';
  import { DragScrub, presets } from '../scrub/dragScrub';
  import { scrubSample } from '../utils/scrubRuntime.js';
  import { createZoomController } from '../utils/zoomController.js';
  import { trackViewportMetrics } from '../utils/viewportMetrics.js';
  import { fileCache, loadFile } from '../stores/fileCache.js';
  import TabBar from './TabBar.svelte';
  import PanelSurface from './PanelSurface.svelte';
  import PanelPreviewSurface from './PanelPreviewSurface.svelte';
  import CanvasContextMenu from './CanvasContextMenu.svelte';
  // The in-program Device Profile Designer (mockup-faithful). The legacy DeviceProfileDesigner.svelte
  // was removed once its power-user features (raw JSON / tests / dump parse) moved to V2's Advanced screen.
  import DeviceProfileDesignerV2 from './DeviceProfileDesignerV2.svelte';
  import EditorRuler from './EditorRuler.svelte';
  import SettingsView from './SettingsView.svelte';
  import { isTextEntryTarget } from '../utils/textEntry.js';
  import BehaviorDesigner from './BehaviorDesigner.svelte';
  import CustomDesignSurfaceEditor from '../sections/CustomDesignSurfaceEditor.svelte';
  import ScreenBuilderEditor from '../sections/ScreenBuilderEditor.svelte';
  import { addGuide, deleteSelectedGuide, selectedGuide } from '../stores/guides.js';
  import { activePanelSnapGuides } from '../stores/panelSnapGuides.js';
  import { createDeviceProfileDraft, deviceProfiles, deviceRoleMappings, importDeviceProfile } from '../stores/deviceProfiles.js';
  import { fitToWindowSignal, zoomStepSignal, zoomToSelectionSignal } from '../stores/editorCommands.js';
  import { showRulers, viewportPanelCenter } from '../stores/editorView.js';
  import { selectedScopedEditingControl, stateEditScope } from '../stores/stateEditScope.js';
  import { panelPreviewDebugEnabled, previewModeEnabled, previewInspectedControlId, previewInspection, setPreviewInspectedControlId, syncPanelPreviewSessions } from '../stores/interactionPreview.js';
  import { activeComponentControl, closeComponentWorkspace, componentWorkspaceMode, createComponentDocument, openComponentSurfaceWorkspace } from '../stores/componentWorkspace.js';
  import { undo, redo, undoAvailable, redoAvailable, flushHistory } from '../stores/history.js';

  // The four keys whose autorepeat is one undo step (see handleEditorKeyUp).
  const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import Redo2 from 'lucide-svelte/icons/redo-2';
  import { componentDesignerStatus, requestComponentDesignerPreview } from '../stores/componentDesignerStatus.js';
  import { createScriptWorkspaceDocument, scriptDocuments, updateScriptDocument, getOrCreateScriptDocForPanel } from '../stores/scriptWorkspace.js';
  import { createScreenDocument } from '../stores/screenBuilder.js';
  import { isSourceScript } from '../scripting/scriptModel.js';
  import { openNewPanelDialog } from '../stores/newPanelDialog.js';
  import { copyControlStyle, applyStyleToSelection } from '../stores/styleClipboard.js';

  let zoom = $derived($editorZoom);
  let scale = $derived(zoom / 100);

  // Mirror the live alignment snap guides (published by the dragging control)
  // as ruler tick markers — vertical guides mark the horizontal (X) ruler,
  // horizontal guides mark the vertical (Y) ruler; centre guides tagged amber.
  let rulerSnapMarkersX = $derived(
    $activePanelSnapGuides.filter((g) => g.type === 'vertical').map((g) => ({ value: g.pos, kind: g.center ? 'center' : 'edge' }))
  );
  let rulerSnapMarkersY = $derived(
    $activePanelSnapGuides.filter((g) => g.type === 'horizontal').map((g) => ({ value: g.pos, kind: g.center ? 'center' : 'edge' }))
  );
  // The script editor is bound to a specific panel via the document's panelId, so the Paths
  // picker shows THAT panel's controls (not the ambiguous "active panel").
  let scriptDoc = $derived(
    $activeEditorTab?.type === 'script' ? ($scriptDocuments.find((d) => d.id === $activeEditorTab.id) ?? null) : null
  );
  let scriptPanel = $derived(
    scriptDoc?.panelId ? ($panels.find((p) => String(p.id) === String(scriptDoc.panelId)) ?? null) : null
  );
  // Turn a scripting module on from the picker. Only reachable when the panel pins a MANUAL list —
  // on auto the list follows the scripts, so there is nothing to switch.
  function enableScriptModule(moduleId) {
    if (!scriptPanel) return;
    const scripting = scriptPanel.scripting ?? {};
    if (!Array.isArray(scripting.modules)) return;
    if (scripting.modules.includes(moduleId)) return;
    updatePanel(scriptPanel.id, { scripting: { ...scripting, modules: [...scripting.modules, moduleId] } });
  }

  let behaviorControls = $derived(
    (scriptPanel?.controls ?? [])
      .map((c) => ({
        name: c?._children?.Core?.name ?? c?._children?.Core?.id,
        // The component type, so the picker can narrow to what this KIND of control can do.
        type: c?._children?.Core?.controlType ?? '',
        leaves: enumerateLeafPaths(c),
      }))
      .filter((c) => c.name)
  );
  let panelDesignerSplit = $derived($activePanelDesignerSplit);
  let splitDeviceProfileId = $derived(
    $deviceRoleMappings?.mainSynth?.profileId
      || panelDesignerSplit?.profileId
      || ''
  );
  let splitDeviceProfileName = $derived(
    $deviceProfiles.find((profile) => profile.id === splitDeviceProfileId)?.name
      || panelDesignerSplit?.profileName
      || splitDeviceProfileId
  );
  let splitDeviceOnLeft = $derived(panelDesignerSplit?.deviceOnLeft !== false);
  let splitVisibleForActiveTab = $derived($activeEditorTab?.type === 'panel' && !!panelDesignerSplit);
  let splitDesignerSize = $derived(Number(panelDesignerSplit?.designerSize ?? 0.5));
  let splitPanelSize = $derived(1 - splitDesignerSize);
  let splitGridStyle = $derived(buildEditorSplitStyle(panelDesignerSplit, splitDeviceOnLeft, splitDesignerSize, splitPanelSize));
  let canvasPanel = $derived($activePanel);

  function bindViewport(node) {
    viewportEl = node;

    return {
      destroy() {
        if (viewportEl === node) viewportEl = null;
      },
    };
  }

  // Capture-phase mousedown on the viewport — see captureCanvasPress for why
  // it cannot be an ordinary onmousedown.
  function bindCanvasCapture(node) {
    node.addEventListener('mousedown', captureCanvasPress, true);
    return {
      destroy() { node.removeEventListener('mousedown', captureCanvasPress, true); },
    };
  }

  function bindZoomContainer(node) {
    zoomContainerEl = node;

    return {
      destroy() {
        if (zoomContainerEl === node) zoomContainerEl = null;
      },
    };
  }

  // --- Ruler scroll/size tracking ---
  let metrics = $state({ scrollLeft: 0, scrollTop: 0, width: 0, height: 0, contentLeft: 40, contentTop: 40 });
  $effect(() => trackViewportMetrics(metrics, () => viewportEl, () => zoomContainerEl));

  // Publish the panel-space point at the viewport centre — new controls
  // insert there (stores/controls.js) instead of cascading from the origin.
  $effect(() => {
    if (!canvasPanel || !viewportEl) {
      viewportPanelCenter.set(null);
      return;
    }
    viewportPanelCenter.set({
      x: (metrics.scrollLeft + metrics.width / 2 - metrics.contentLeft) / scale,
      y: (metrics.scrollTop + metrics.height / 2 - metrics.contentTop) / scale,
    });
  });

  // Re-measure panel-surface offset when zoom or panel size changes — the
  // panel surface uses a CSS transform so its layout box doesn't resize, so
  // the ResizeObserver above won't fire on zoom. We trigger it manually.
  // Use getBoundingClientRect (not offsetLeft/offsetTop): the zoom container is
  // centred with margins and its vertical margin collapses through the stage
  // wrapper, so offsetTop reads 0 and the vertical ruler's 0 sticks to the
  // viewport top. The rect-based delta is collapse-immune and matches the
  // shared trackViewportMetrics measurement.
  $effect(() => {
    scale;
    canvasPanel?.width;
    canvasPanel?.height;
    metrics.width;
    metrics.height;
    if (zoomContainerEl && viewportEl) {
      const cr = zoomContainerEl.getBoundingClientRect();
      const er = viewportEl.getBoundingClientRect();
      metrics.contentLeft = cr.left - er.left + viewportEl.scrollLeft;
      metrics.contentTop  = cr.top - er.top + viewportEl.scrollTop;
    }
  });

  let gridEnabled = $derived(canvasPanel?.gridEnabled ?? false);
  let gridSize = $derived(canvasPanel?.gridSize ?? 10);
  let snapToGrid = $derived(canvasPanel?.snapToGrid ?? false);
  let panelLocked = $derived(canvasPanel?.locked ?? false);

  // Grid snap origin — same centering math as the visual grid, without the visual fudge
  let gridOrigin = $derived(computeGridOrigin(canvasPanel, gridSize));

  let gridColour = $derived(canvasPanel?.gridColour ?? '33FFFFFF');
  let gridLineWidth = $derived(canvasPanel?.gridLineWidth ?? 1);

  // Dynamic grid CSS — rendered on the panel surface
  let gridStyle = $derived(buildGridStyle(canvasPanel, { gridEnabled, gridSize, gridColour, gridLineWidth }));
  let activeStateScope = $derived($stateEditScope);
  let scopedEditingControl = $derived(activeStateScope.mode === 'state' ? $selectedScopedEditingControl : null);
  let editorStateBadge = $derived(
    scopedEditingControl && activeStateScope.mode === 'state' && activeStateScope.stateName
      ? `Canvas shows ${activeStateScope.stateName}`
      : ''
  );

  // Trigger file loading when paths change
  $effect(() => {
    if (canvasPanel?.bgImageEnabled && canvasPanel?.bgImage) loadFile(canvasPanel.bgImage);
    if (canvasPanel?.bgTextureEnabled && canvasPanel?.bgTexture) loadFile(canvasPanel.bgTexture);
  });

  // Background layers as one keyed object — the PanelSurface loop picks
  // entries by layer id, so null/empty layers simply don't render.
  let bgLayers = $derived({
    solid: buildSolidStyle(canvasPanel),
    gradient: buildGradientStyle(canvasPanel),
    image: buildLayerStyle(canvasPanel, 'Image', canvasPanel?.bgImage ? $fileCache[canvasPanel.bgImage] : null),
    texture: buildLayerStyle(canvasPanel, 'Texture', canvasPanel?.bgTexture ? $fileCache[canvasPanel.bgTexture] : null),
  });

  // --- DOM refs ---
  let viewportEl = $state(null);
  let zoomContainerEl = $state(null);
  let panelSurfaceEl = $state(null);
  let lastViewportPanelId = $state(null);
  let splitContainerEl = $state(null);
  let splitResizing = $state(false);

  let scaledPanelWidth = $derived(canvasPanel ? canvasPanel.width * scale : 0);
  let scaledPanelHeight = $derived(canvasPanel ? canvasPanel.height * scale : 0);
  let stageMarginLeft = $derived(Math.max(40, (metrics.width - scaledPanelWidth) / 2));
  let stageMarginTop = $derived(Math.max(40, (metrics.height - scaledPanelHeight) / 2));
  let previewBadge = $derived(
    $previewModeEnabled
      ? ($previewInspection?.control?._children?.Core?.name
        ? `Preview · ${$previewInspection.control._children.Core.name}`
        : 'Preview')
      : ''
  );
  let componentWorkspaceControl = $derived($activeEditorTab?.type === 'component' ? $activeComponentControl : $selectedControl);
  let standaloneComponentTabActive = $derived($activeEditorTab?.type === 'component');
  let standaloneComponentTabLoading = $derived(standaloneComponentTabActive && !$activeComponentControl);
  let selectedIsCustomComponent = $derived(String(getSection(componentWorkspaceControl, 'Core')?.controlType ?? '') === 'CustomComponent');
  let selectedCustomComponentName = $derived(getSection(componentWorkspaceControl, 'Core')?.name ?? 'Custom Component');
  let componentSurfaceWorkspaceActive = $derived(
    ($activeEditorTab?.type === 'component' || $componentWorkspaceMode === 'surface')
    && selectedIsCustomComponent
    && !$previewModeEnabled
    && ($activeEditorTab?.type === 'panel' || $activeEditorTab?.type === 'component')
  );

  $effect(() => {
    if ($componentWorkspaceMode === 'panel') return;
    if ($activeEditorTab?.type === 'component') return;
    if (selectedIsCustomComponent && !$previewModeEnabled && ($activeEditorTab?.type === 'panel' || $activeEditorTab?.type === 'component')) return;
    closeComponentWorkspace();
  });

  $effect(() => {
    if (!$previewModeEnabled) return;

    pan.spaceHeld = false;
    pan.isPanning = false;

    const controls = canvasPanel?.controls ?? [];
    syncPanelPreviewSessions(controls);

    const availableIds = new Set(
      controls
        .map((control) => control?._children?.Core?.id)
        .filter(Boolean)
    );

    if (!$panelPreviewDebugEnabled || availableIds.size === 0) {
      setPreviewInspectedControlId('');
      return;
    }

    if ($previewInspectedControlId && availableIds.has($previewInspectedControlId)) return;

    const fallbackId = $selectedComponentId && availableIds.has($selectedComponentId)
      ? $selectedComponentId
      : (controls[0]?._children?.Core?.id ?? '');
    setPreviewInspectedControlId(fallbackId);
  });

  $effect(() => {
    const panelId = canvasPanel?.id ?? null;
    if (!viewportEl || panelId == null || panelId === lastViewportPanelId) return;

    lastViewportPanelId = panelId;
    requestAnimationFrame(() => {
      if (!viewportEl || canvasPanel?.id !== panelId) return;
      viewportEl.scrollLeft = 0;
      viewportEl.scrollTop = 0;
    });
  });

  // --- Pan (space+drag, middle mouse) ---
  // `pan` state is mutated by the controller; reactivity lives here. The right
  // button no longer pans — it opens the context menu, from the browser's own
  // contextmenu event; see createPanController for the whole story.
  let pan = $state({ isPanning: false, spaceHeld: false });
  const panCtrl = createPanController(pan, {
    getViewport: () => viewportEl,
  });

  // --- Marquee selection ---
  let marquee = $state({ isActive: false, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } });
  const marqueeCtrl = createMarqueeController(marquee, {
    getSurface: () => panelSurfaceEl,
    getScale: () => scale,
    isBlocked: () => pan.spaceHeld,
    alsoStartsOn: (target) => isDrilledScopeBody(target),
    onSelect: (rect, e, info) => {
      // Only select if the marquee has a meaningful size (not just a click).
      // rect is in panel units — compare against SCREEN pixels so a click
      // doesn't count as a marquee at 25% zoom, nor a real 10px drag at 400%.
      const clickSize = 3 / (scale || 1);
      if (rect.w < clickSize && rect.h < clickSize) {
        // A click that landed on a locked control has already selected
        // something (the control's own mousedown ran too), and clearing it
        // here would make locked controls unselectable on the canvas.
        if (!e?.shiftKey && !info?.onLocked) clearSelection();
        return;
      }
      // The marquee reaches inside the container the user has drilled into,
      // and only the top level when they have not — marqueeScopeId derives
      // which from the selection. Read BEFORE the selection is replaced.
      const scopeId = canvasPanel ? marqueeScopeId(canvasPanel.controls, $selectedComponentIds) : null;
      const ids = canvasPanel ? findControlsInRect(canvasPanel.controls, rect, getSection, scopeId) : new Set();
      // Shift extends: a selection can be built out of several passes.
      if (e?.shiftKey) {
        selectedComponentIds.update((current) => new Set([...current, ...ids]));
        return;
      }
      // An empty sweep INSIDE a container is left alone: clearing would step
      // back out of the drill-down the next marquee depends on, silently.
      // Missing everything is not a request to leave; Escape is.
      if (ids.size === 0 && scopeId) return;
      selectedComponentIds.set(ids);
    },
  });

  let marqueeRect = $derived(marqueeCtrl.getRect());

  /**
   * Is this press on the BODY of the container the user has drilled into?
   *
   * A container fills the space its children sit in, so without this the only
   * place a scoped marquee could begin was the bare panel around it — and a
   * container that fills the panel left nowhere at all. Inside a group, a drag
   * over its empty space is a rubber band over its children, exactly as it is
   * on the panel one level up; a press on a CHILD is still that child's drag,
   * because `closest` returns the innermost control.
   */
  function isDrilledScopeBody(target) {
    if (!canvasPanel) return false;
    const scopeId = marqueeScopeId(canvasPanel.controls, $selectedComponentIds);
    if (!scopeId) return false;
    return target?.closest?.('.canvas-control')?.dataset?.controlId === scopeId;
  }

  // ---------------------------------------------------------------------------
  // Geometry feedback: the live readout, Alt-hover measuring, Escape-to-cancel
  // ---------------------------------------------------------------------------
  // Three of the review's A13 complaints are one subject — what the canvas
  // tells you about geometry while your hand is on the mouse — so they share
  // the pointer bookkeeping here rather than each growing their own.
  //
  // The press is watched in the CAPTURE phase, on the viewport, because a
  // control's own mousedown calls stopPropagation and would otherwise be the
  // end of it. That same capture is what lets a marquee START on top of a
  // locked control (A10): locked means "not a target", so the press belongs to
  // the rubber band, and the marquee controller decides — see startsMarquee.
  const GESTURE_ENGAGE_PX = 4;   // matches CanvasControl's DRAG_ENGAGE_SCREEN_PX

  let gesture = $state(null);    // { kind, id, geometry } while a drag/resize is live
  let gestureStart = null;       // the press that began it, for the Escape rewind
  let gestureFrame = null;

  function captureCanvasPress(e) {
    if ($previewModeEnabled || e.button !== 0 || pan.spaceHeld) return;

    const onScopeBody = isDrilledScopeBody(e.target);
    const wasActive = marquee.isActive;
    marqueeCtrl.handleMouseDown(e);
    if (marquee.isActive && !wasActive) {
      // The container's own mousedown would otherwise select it and start
      // dragging it under the rubber band. Stopping here is the whole point:
      // inside a group the press belongs to the marquee.
      if (onScopeBody) e.stopPropagation();
      gestureStart = null;
      return;
    }

    // Nothing on a locked panel moves, so there is no geometry to report and
    // nothing for Escape to cancel — the press is only ever a selection.
    if (panelLocked) { gestureStart = null; return; }

    // A rotate has its own angle HUD already; the readout is about the box.
    const found = gestureTargetFor(e.target);
    if (!found || found.kind === 'rotate') { gestureStart = null; return; }

    gestureStart = { ...found, id: found.element.dataset?.controlId ?? null, x: e.clientX, y: e.clientY };
    window.addEventListener('mousemove', trackGesture);
    window.addEventListener('mouseup', endGesture);
    window.addEventListener('keydown', gestureKey, true);
  }

  function trackGesture(e) {
    if (!gestureStart) return;
    if (!gesture && Math.hypot(e.clientX - gestureStart.x, e.clientY - gestureStart.y) < GESTURE_ENGAGE_PX) return;
    if (gestureFrame !== null) return;
    // One read per frame: the control re-renders on every mousemove and
    // getBoundingClientRect forces layout, so reading on each one would make
    // the drag pay for the readout.
    gestureFrame = requestAnimationFrame(() => {
      gestureFrame = null;
      if (!gestureStart) return;
      const geometry = readGestureGeometry(gestureStart.element, panelSurfaceEl, scale);
      if (geometry) gesture = { kind: gestureStart.kind, id: gestureStart.id, geometry };
    });
  }

  function endGesture() {
    window.removeEventListener('mousemove', trackGesture);
    window.removeEventListener('mouseup', endGesture);
    window.removeEventListener('keydown', gestureKey, true);
    if (gestureFrame !== null) { cancelAnimationFrame(gestureFrame); gestureFrame = null; }
    gestureStart = null;
    gesture = null;
  }

  /**
   * Escape abandons the drag or resize in flight — see rewindGesture for how
   * a cancel is expressed to a control that has no cancel entry point.
   *
   * The listener is on window, in capture, and only for the length of the
   * gesture: the editor wrapper's keydown needs focus it may not have while
   * dragging, and Escape must not ALSO run the deselect branch in
   * editorShortcuts.js — cancelling a move and losing your selection are two
   * different requests, and the one you asked for is the move.
   */
  function gestureKey(e) {
    if (e.key !== 'Escape' || !gestureStart || !gesture) return;
    e.preventDefault();
    e.stopPropagation();
    rewindGesture(window, gestureStart);
    endGesture();
  }

  // The sibling rects of a control, in the frame its own x/y is measured in —
  // panel space at the top level, the container's content space inside one.
  // Equal spacing is only meaningful between things in one frame.
  function frameSiblingRects(id) {
    if (!canvasPanel || id == null) return [];
    const parent = findParentOfControl(canvasPanel.controls, id);
    const list = parent ? getChildControls(parent) : canvasPanel.controls;
    return list
      .map((c) => ({ control: c, t: c?._children?.Transform }))
      .filter((entry) => entry.t)
      .map(({ control, t }) => ({
        id: control._children.Core.id,
        x: t.x ?? 0, y: t.y ?? 0, w: t.width ?? 0, h: t.height ?? 0,
      }));
  }

  // Equal-gap indicators for the control being moved. Figma shows these while
  // you drag, which is when they can still change the outcome.
  let gestureSpacing = $derived.by(() => {
    if (!gesture?.id || !canvasPanel || $previewModeEnabled) return null;
    const g = gesture.geometry;
    const target = { id: gesture.id, x: g.x, y: g.y, w: g.w, h: g.h };
    const groups = detectEqualSpacing(target, frameSiblingRects(gesture.id).filter((r) => r.id !== gesture.id));
    if (!groups.length) return null;
    return { groups, offset: controlPanelOffset(canvasPanel.controls, gesture.id) };
  });

  // --- Alt-hover measuring ---
  // Hold Alt with one control selected and point at another: the distances
  // between them are drawn without moving anything. The only altKey the canvas
  // read before this was drag-duplicate, so the measuring modifier every other
  // tool has was simply missing.
  let measure = $state(null);   // { segments } in panel units

  function handleCanvasMouseMove(e) {
    if ($previewModeEnabled || gesture || !e.altKey || !canvasPanel || !panelSurfaceEl || $selectedComponentIds.size !== 1) {
      if (measure) measure = null;
      return;
    }
    const surface = panelSurfaceEl.getBoundingClientRect();
    const px = (e.clientX - surface.left) / scale;
    const py = (e.clientY - surface.top) / scale;
    const hovered = findControlAtPoint(canvasPanel.controls, px, py,
      normalizePanelLayers(canvasPanel.layers, canvasPanel.controls));
    const hoveredId = hovered?._children?.Core?.id;
    const selectedId = [...$selectedComponentIds][0];
    if (!hoveredId || hoveredId === selectedId) { measure = null; return; }
    const from = controlPanelRect(canvasPanel.controls, selectedId);
    const to = controlPanelRect(canvasPanel.controls, hoveredId);
    if (!from || !to) { measure = null; return; }
    measure = { segments: measureBetweenRects(from, to) };
  }

  function clearMeasure() { if (measure) measure = null; }

  // --- Zoom controller (wheel, fit-to-window, zoom-to-selection) ---
  const zoomCtrl = createZoomController({
    getViewport: () => viewportEl,
    getPanel: () => canvasPanel,
    getSelection: () => $selectedComponentIds,
    getZoom: () => $editorZoom,
    getZoomIncrement: () => $editorZoomIncrement,
    editorZoom,
  });

  // Wheel must be non-passive so Ctrl+wheel zoom can suppress the host's own
  // ctrl-zoom; plain wheel is left alone and scrolls the viewport natively.
  function nonPassiveWheel(node, handler) {
    node.addEventListener('wheel', handler, { passive: false });
    return { destroy() { node.removeEventListener('wheel', handler); } };
  }

  // React to global zoom-to-selection signal (from Ctrl+Shift+P in App.svelte)
  let lastZoomSignal = 0;
  $effect(() => {
    const sig = $zoomToSelectionSignal;
    if (sig > lastZoomSignal) { lastZoomSignal = sig; zoomCtrl.zoomToSelection(); }
  });

  // React to global fit-to-window requests (menu, zoom bar, shortcuts) — this
  // controller owns the only fit implementation.
  let lastFitSignal = 0;
  $effect(() => {
    const sig = $fitToWindowSignal;
    if (sig > lastFitSignal) { lastFitSignal = sig; zoomCtrl.fitToWindow(); }
  });

  // React to global zoom-step requests (menu, zoom bar, keyboard fallback).
  let lastZoomStepSignal = 0;
  $effect(() => {
    const sig = $zoomStepSignal;
    if (sig.n > lastZoomStepSignal) { lastZoomStepSignal = sig.n; zoomCtrl.zoomStep(sig.direction); }
  });

  function handlePreviewShortcut(e) {
    if (e.defaultPrevented) return;

    const mod = e.ctrlKey || e.metaKey;
    const lowerKey = String(e.key ?? '').toLowerCase();
    if ((mod && ['a', 'c', 'x', 'v', 'd'].includes(lowerKey)) || e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      return;
    }

    if (mod && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoomCtrl.zoomStep(1);
      return;
    }
    if (mod && e.key === '-') {
      e.preventDefault();
      zoomCtrl.zoomStep(-1);
      return;
    }
    if (mod && e.key === '0') {
      e.preventDefault();
      zoomCtrl.fitToWindow();
      return;
    }
    if (mod && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      zoomCtrl.zoomToSelection();
    }
  }

  function handleEditorKeyDown(e) {
    if (componentSurfaceWorkspaceActive) return;
    // Text fields inside the canvas chrome keep their keys — Delete in an input must never delete
    // controls. The Settings view also renders INSIDE this wrapper, so every keystroke in a settings
    // text box arrives here too. Without this, Backspace in a field never reached the field — and if
    // a control happened to be selected, deleted it. Ctrl+A/C/X/V/D were swallowed the same way.
    if (isTextEntryTarget(e.target)) return;

    if ($previewModeEnabled) {
      handlePreviewShortcut(e);
      return;
    }

    panCtrl.handleKeyDown(e);
    handleEditorShortcut(e, {
      panel: canvasPanel, panelLocked, gridSize,
      selectedComponentIds: $selectedComponentIds,
      zoomIn: () => zoomCtrl.zoomStep(1),
      zoomOut: () => zoomCtrl.zoomStep(-1),
      fitToWindow: zoomCtrl.fitToWindow,
      zoomToSelection: zoomCtrl.zoomToSelection,
      selectAll, pasteSelection, copySelection, cutSelection, duplicateControl,
      removeControl, updateControlProperty, deleteSelectedGuide,
      groupSelectionIntoContainer, ungroupContainer,
      selectComponent, clearSelection,
      copyControlStyle, applyStyleToSelection,
    });
  }

  function handleEditorKeyUp(e) {
    if (componentSurfaceWorkspaceActive) return;
    if ($previewModeEnabled) return;
    // Letting go of Alt puts the measuring away, even if the pointer never
    // moves again.
    if (!e.altKey) clearMeasure();
    // A held arrow key is one undo step, and the debounce is what makes it one — but the debounce
    // only commits 400 ms after the LAST repeat, so the tail of the run sat uncommitted until
    // something unrelated happened to push it. Releasing the key is the real end of the gesture,
    // so close the step here. Cheap and safe on every keyup: flushHistory is a no-op when the
    // debounce holds nothing.
    if (ARROW_KEYS.has(e.key)) flushHistory();
    panCtrl.handleKeyUp(e);
  }

  // Click on empty canvas → deselect (but not after panning)
  function handleCanvasClick(e) {
    if ($previewModeEnabled) return;
    if (pan.spaceHeld) return;
    if (e.target === e.currentTarget || e.target.classList.contains('panel-surface')) {
      clearSelection();
      selectedGuide.set(null);
    }
  }

  // --- Context menu ---
  // Null when hidden, { screenX, screenY, panelX, panelY } when shown.
  // CanvasContextMenu mutates this back to null via bind:target.
  let ctxMenu = $state(null);

  // The native menu is replaced by ours, opened HERE rather than from the end
  // of a right-button pan. The old route had to guess whether a right press
  // was a click or a drag, and more than two pixels of tremor meant "drag" and
  // no menu at all — from either source, since the native one was already
  // suppressed. `contextmenu` fires whether or not the pointer moved, which is
  // the whole point of using it.
  function handleContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenuAt(e.clientX, e.clientY);
  }

  function showContextMenuAt(screenX, screenY) {
    if ($previewModeEnabled) { ctxMenu = null; return; }
    if (!canvasPanel || !panelSurfaceEl) { ctxMenu = null; return; }
    const rect = panelSurfaceEl.getBoundingClientRect();
    const panelX = (screenX - rect.left) / scale;
    const panelY = (screenY - rect.top) / scale;
    // If right-clicking on a control that isn't selected, select it
    const clickedCtrl = findControlAtPoint(canvasPanel.controls, panelX, panelY,
      normalizePanelLayers(canvasPanel.layers, canvasPanel.controls));
    const cid = clickedCtrl?._children?.Core?.id;
    if (cid && !$selectedComponentIds.has(cid)) selectComponent(cid);
    ctxMenu = { screenX, screenY, panelX, panelY };
  }

  // --- Insert-panel drag-to-place ---
  // The Insert panel writes a payload on dragstart; dropping on the panel
  // surface lands the component centred on the drop point.
  const INSERT_DRAG_MIME = 'application/x-ceditor-insert';

  function handleInsertDragOver(e) {
    if (!Array.from(e.dataTransfer?.types ?? []).includes(INSERT_DRAG_MIME)) return;
    if ($previewModeEnabled || panelLocked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleInsertDrop(e) {
    const raw = e.dataTransfer?.getData(INSERT_DRAG_MIME);
    if (!raw || $previewModeEnabled || panelLocked || !panelSurfaceEl) return;

    let payload = null;
    try { payload = JSON.parse(raw); } catch { return; }

    e.preventDefault();
    e.stopPropagation();

    const rect = panelSurfaceEl.getBoundingClientRect();
    const at = {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };

    if (payload.kind === 'type' && payload.type) {
      // A catalog PRESET drags the same way a bare type does and carries its section patch with it;
      // dropping a Pitch Wheel has to land a sprung bipolar Ribbon, not a plain one.
      addControl(payload.type, payload.overrides ?? {}, { at });
      return;
    }
    if (payload.kind === 'package' && payload.id) {
      const entry = ($customComponentLibrary ?? []).find((candidate) => candidate.id === payload.id);
      if (entry?.envelope) {
        addCustomComponentPackage(entry.envelope, { Transform: { x: Math.round(at.x - 60), y: Math.round(at.y - 60) } });
        customComponentLibrary.markUsed(entry.id);
      }
    }
  }

  function buildEditorSplitStyle(split, deviceFirst, designerSize, panelSize) {
    const orientation = split?.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    const designerFr = `${Math.round(designerSize * 1000) / 1000}fr`;
    const panelFr = `${Math.round(panelSize * 1000) / 1000}fr`;
    const before = deviceFirst ? designerFr : panelFr;
    const after = deviceFirst ? panelFr : designerFr;
    return orientation === 'horizontal'
      ? `grid-template-rows: minmax(75px, ${before}) 7px minmax(75px, ${after});`
      : `grid-template-columns: minmax(75px, ${before}) 7px minmax(75px, ${after});`;
  }

  function handleSplitResizeStart(event) {
    if (!panelDesignerSplit || $activeEditorTab?.type !== 'panel' || !splitContainerEl) return;
    event.preventDefault();
    splitResizing = true;

    // Absolute mapping over the split container, so the core is driven
    // directly with the container rect as bounds (the handle itself is only
    // 7px). Axis follows the split orientation; the second-pane-first layout
    // flips the mapping, mirroring the old rect.bottom / rect.right maths.
    const rect = splitContainerEl.getBoundingClientRect();
    const horizontal = (panelDesignerSplit?.orientation === 'horizontal' ? 'horizontal' : 'vertical') === 'horizontal';
    const deviceFirst = panelDesignerSplit?.deviceOnLeft !== false;
    const scrub = new DragScrub({
      ...presets.splitterHorizontal,
      axis: horizontal ? 'y' : 'x',
      invertY: horizontal && deviceFirst,
      invertX: !horizontal && !deviceFirst,
      min: 0,
      max: 1,
    }, 0);
    const tabId = $activeEditorTab.id;
    scrub.begin(scrubSample(event), { bounds: rect, jumpToPointer: false });

    const handleMove = (moveEvent) => {
      const next = scrub.move(scrubSample(moveEvent));
      if (next !== null) setPanelDesignerSplitSize(tabId, next);
    };

    const handleUp = () => {
      scrub.end();
      splitResizing = false;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  }

  function launchComponentWorkspace(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    openComponentSurfaceWorkspace();
  }

  function createStandaloneComponent() {
    const document = createComponentDocument();
    if (document?.id) setActiveEditorTab({ type: 'component', id: document.id });
  }

  function createStandaloneDeviceProfile() {
    const profile = createDeviceProfileDraft();
    openStandaloneDeviceProfileTab(profile);
  }

  function createStandaloneScriptWorkspace() {
    const document = getOrCreateScriptDocForPanel($activePanel?.id, $activePanel?.name);
    if (document?.id) setActiveEditorTab({ type: 'script', id: document.id });
  }

  function createStandaloneScreen() {
    const document = createScreenDocument();
    if (document?.id) setActiveEditorTab({ type: 'screen', id: document.id });
  }

</script>

<!-- The canvas annotation layer: everything the editor DRAWS OVER the panel
     without being part of it. Lives in the zoom container rather than inside
     PanelSurface, so nothing here can reach a preview render or an export —
     both build their own surface, and neither renders this component's
     chrome. Inert by construction (`pointer-events: none`), because an
     overlay that eats a click on the thing it is annotating is worse than no
     overlay. Sizes are multiplied by `scale` here instead of riding the
     surface's CSS transform, which is what keeps the hairlines one screen
     pixel at every zoom. -->
{#snippet canvasAnnotations()}
  {#if !$previewModeEnabled}
    <div class="canvas-annotations">
      {#if (canvasPanel?.controls?.length ?? 0) === 0}
        <!-- A NEW PANEL IS NOT A BROKEN ONE, but it looked identical to one:
             a bare grey rectangle with nothing anywhere saying where controls
             come from. The no-document state next door has always pointed at
             what to do next; this is the same courtesy one step later. It
             disappears the moment the panel has a single control, so it can
             never print over real content. -->
        <div class="empty-panel-hint">
          <strong>This panel is empty</strong>
          <span>Open <b>Insert</b> with the <b>+</b> at the top of the left rail, then click a component to place it at the centre — or drag one onto the canvas.</span>
        </div>
      {/if}

      {#if gestureSpacing}
        {#each gestureSpacing.groups as group}
          {#each group.segments as segment}
            <div
              class="eq-bar"
              class:eq-y={group.axis === 'y'}
              style={group.axis === 'x'
                ? `left:${(gestureSpacing.offset.x + segment.x) * scale}px; top:${(gestureSpacing.offset.y + segment.y) * scale}px; width:${segment.length * scale}px;`
                : `left:${(gestureSpacing.offset.x + segment.x) * scale}px; top:${(gestureSpacing.offset.y + segment.y) * scale}px; height:${segment.length * scale}px;`}
            ></div>
          {/each}
          <div
            class="eq-label"
            style="left:{(gestureSpacing.offset.x + group.segments[0].x + (group.axis === 'x' ? group.segments[0].length / 2 : 0)) * scale}px; top:{(gestureSpacing.offset.y + group.segments[0].y + (group.axis === 'y' ? group.segments[0].length / 2 : 0)) * scale}px;"
          >{group.gap}</div>
        {/each}
      {/if}

      {#if measure}
        {#each measure.segments as segment}
          <div
            class="measure-line"
            class:measure-y={segment.axis === 'y'}
            style={segment.axis === 'x'
              ? `left:${Math.min(segment.x1, segment.x2) * scale}px; top:${segment.y1 * scale}px; width:${Math.abs(segment.x2 - segment.x1) * scale}px;`
              : `left:${segment.x1 * scale}px; top:${Math.min(segment.y1, segment.y2) * scale}px; height:${Math.abs(segment.y2 - segment.y1) * scale}px;`}
          ></div>
          <div
            class="measure-label"
            style="left:{((segment.x1 + segment.x2) / 2) * scale}px; top:{((segment.y1 + segment.y2) / 2) * scale}px;"
          >{segment.dist}</div>
        {/each}
      {/if}

      {#if gesture}
        <div
          class="gesture-hud"
          style="left:{gesture.geometry.panelX * scale}px; top:{(gesture.geometry.panelY + gesture.geometry.panelH) * scale + 8}px;"
        >
          {#each gestureHudParts(gesture.geometry) as part}
            <span><b>{part.label}</b>{part.value}</span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor-wrapper" onkeydown={handleEditorKeyDown} onkeyup={handleEditorKeyUp} tabindex="-1" class:panning={pan.isPanning || pan.spaceHeld}>
  <div class="tab-bar-area">
    <TabBar />
  </div>

  <div class="canvas-area">
    {#key `${$activeEditorTab?.type ?? 'panel'}:${$activeEditorTab?.id ?? 'none'}:${canvasPanel?.id ?? 'none'}`}
      {#if componentSurfaceWorkspaceActive}
        <section class="component-workspace" aria-label="Component Designer Workspace">
          <header class="component-workspace-header">
            <div class="component-workspace-title">
              <span>{$activeEditorTab?.type === 'component' ? 'Component Document' : 'Panel Canvas'}</span>
              <span>Component Designer</span>
              <strong>{selectedCustomComponentName}</strong>
            </div>
            <div class="component-workspace-actions">
              <button
                type="button"
                class="icon-btn"
                class:active={$undoAvailable}
                disabled={!$undoAvailable}
                title="Undo (Ctrl+Z)"
                onclick={undo}
              ><Undo2 size={14} strokeWidth={2} /></button>
              <button
                type="button"
                class="icon-btn"
                class:active={$redoAvailable}
                disabled={!$redoAvailable}
                title="Redo (Ctrl+Y)"
                onclick={redo}
              ><Redo2 size={14} strokeWidth={2} /></button>
              {#if $componentDesignerStatus?.kind}
                <div class="component-workspace-status" aria-label="Component designer status">
                  <span title={`Canvas size: ${$componentDesignerStatus.artboard}`}>Canvas <strong>{$componentDesignerStatus.artboard}</strong></span>
                  <span title={`${$componentDesignerStatus.layerCount} layers`}><strong>{$componentDesignerStatus.layerCount}</strong> layers</span>
                  <span title={`${$componentDesignerStatus.zoneCount} hit zones`}><strong>{$componentDesignerStatus.zoneCount}</strong> hit zones</span>
                  {#if $componentDesignerStatus.lockedNote}
                    <span class="warn"><strong>{$componentDesignerStatus.lockedNote}</strong></span>
                  {/if}
                  {#if $componentDesignerStatus.warning}
                    <span class="warn"><strong>{$componentDesignerStatus.warning}</strong></span>
                  {/if}
                </div>
              {/if}
              <button
                type="button"
                class:active={$componentDesignerStatus?.previewMode === 'preview'}
                onclick={() => requestComponentDesignerPreview('preview')}
                title="Hide authoring overlays for a clean component preview"
              >
                Preview
              </button>
              <button
                type="button"
                class:active={$componentDesignerStatus?.previewMode !== 'preview'}
                onclick={() => requestComponentDesignerPreview('edit')}
                title="Show selection bounds and hit zones"
              >
                Edit
              </button>
              {#if $activeEditorTab?.type === 'panel'}
                <button type="button" onclick={closeComponentWorkspace}>Back to Panel</button>
              {/if}
            </div>
          </header>
          <div class="component-workspace-body">
            <CustomDesignSurfaceEditor control={componentWorkspaceControl} />
          </div>
        </section>
      {:else if standaloneComponentTabLoading}
        <div class="workspace-empty-state">
          <span class="workspace-empty-eyebrow">Component Designer</span>
          <strong>Preparing component document</strong>
        </div>
      {:else if splitVisibleForActiveTab && splitDeviceProfileId && canvasPanel}
        <div
          class={['editor-split', panelDesignerSplit?.orientation === 'horizontal' ? 'horizontal' : 'vertical']}
          class:resizing={splitResizing}
          style={splitGridStyle}
          bind:this={splitContainerEl}
        >
          {#if splitDeviceOnLeft}
            <div class="designer-pane" title={splitDeviceProfileName}>
              {#key splitDeviceProfileId}
                <DeviceProfileDesignerV2 profileId={splitDeviceProfileId} />
              {/key}
            </div>
          {/if}
          {#if splitDeviceOnLeft}
            <button class="editor-split-resizer" aria-label="Resize editor split" onpointerdown={handleSplitResizeStart}></button>
          {/if}
          <div class="designer-panel-pane">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="canvas-viewport designer-split-viewport" class:with-rulers={$showRulers} use:bindViewport class:panel-active={canvasPanel}
                 onclick={handleCanvasClick} oncontextmenu={handleContextMenu}
                 onmousemove={handleCanvasMouseMove} onmouseleave={clearMeasure}
                 onmousedown={panCtrl.handleMouseDown} use:bindCanvasCapture use:nonPassiveWheel={zoomCtrl.handleWheel}>
              <div class="canvas-stage">
                <div
                  class="zoom-container"
                  use:bindZoomContainer
                  style="width: {scaledPanelWidth}px; height: {scaledPanelHeight}px; margin-left: {stageMarginLeft}px; margin-top: {stageMarginTop}px;"
                >
                  {#if $previewModeEnabled}
                    <PanelPreviewSurface
                      panel={canvasPanel}
                      {scale}
                      {bgLayers}
                      {gridStyle}
                      bind:surfaceRef={panelSurfaceEl}
                    />
                  {:else}
                    <PanelSurface
                      panel={canvasPanel}
                      {scale}
                      {snapToGrid}
                      {gridSize}
                      {gridOrigin}
                      {panelLocked}
                      {bgLayers}
                      {gridStyle}
                      {scopedEditingControl}
                      {marquee}
                      {marqueeRect}
                      bind:surfaceRef={panelSurfaceEl}
                      onclick={handleCanvasClick}
                      onmousedown={marqueeCtrl.handleMouseDown}
                      oncontextmenu={handleContextMenu}
                      ondragover={handleInsertDragOver}
                      ondrop={handleInsertDrop}
                    />
                  {/if}
                  {#if $previewModeEnabled}
                    <div class="editor-state-badge preview-active">{previewBadge}</div>
                  {:else if editorStateBadge}
                    <div class="editor-state-badge">{editorStateBadge}</div>
                  {/if}
                  {@render canvasAnnotations()}
                </div>
              </div>
            </div>
            {#if !$previewModeEnabled}
              <CanvasContextMenu bind:target={ctxMenu} panel={canvasPanel} />
            {/if}
          </div>
          {#if !splitDeviceOnLeft}
            <button class="editor-split-resizer" aria-label="Resize editor split" onpointerdown={handleSplitResizeStart}></button>
          {/if}
          {#if !splitDeviceOnLeft}
            <div class="designer-pane" title={splitDeviceProfileName}>
              {#key splitDeviceProfileId}
                <DeviceProfileDesignerV2 profileId={splitDeviceProfileId} />
              {/key}
            </div>
          {/if}
        </div>
      {:else if $activeEditorTab?.type === 'settings'}
        <SettingsView />
      {:else if $activeEditorTab?.type === 'screen'}
        {#key $activeEditorTab.id}
          <ScreenBuilderEditor documentId={$activeEditorTab.id} />
        {/key}
      {:else if $activeEditorTab?.type === 'deviceProfile'}
        <DeviceProfileDesignerV2 profileId={$activeEditorTab.id} />
      {:else if $activeEditorTab?.type === 'script'}
        {#key $activeEditorTab.id}
          <BehaviorDesigner
            panelName={scriptPanel?.name ?? 'Scripts'}
            panelId={scriptPanel?.id ?? null}
            panel={scriptPanel}
            controls={behaviorControls}
            initialScripts={(scriptDoc?.scripts ?? []).filter(isSourceScript)}
            onEnableModule={enableScriptModule}
            onChange={(scripts) => updateScriptDocument($activeEditorTab.id, { scripts })} />
        {/key}
      {:else if canvasPanel}
        {#if selectedIsCustomComponent && !$previewModeEnabled}
          <div class="component-workspace-launcher" aria-label="Custom component workspace launcher">
            <button
              type="button"
              class="component-workspace-launch"
              data-testid="component-designer-launch"
              aria-label="Open Component Designer"
              title="Open Component Designer"
              onpointerdown={(event) => event.stopPropagation()}
              onclick={launchComponentWorkspace}
            >
              Component Designer
            </button>
          </div>
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="canvas-viewport" class:with-rulers={$showRulers} use:bindViewport class:panel-active={canvasPanel}
             onclick={handleCanvasClick} oncontextmenu={handleContextMenu}
             onmousemove={handleCanvasMouseMove} onmouseleave={clearMeasure}
             onmousedown={panCtrl.handleMouseDown} use:bindCanvasCapture use:nonPassiveWheel={zoomCtrl.handleWheel}>
          <div class="canvas-stage">
            <div
              class="zoom-container"
              use:bindZoomContainer
              style="width: {scaledPanelWidth}px; height: {scaledPanelHeight}px; margin-left: {stageMarginLeft}px; margin-top: {stageMarginTop}px;"
            >
              {#if $previewModeEnabled}
                <PanelPreviewSurface
                  panel={canvasPanel}
                  {scale}
                  {bgLayers}
                  {gridStyle}
                  bind:surfaceRef={panelSurfaceEl}
                />
              {:else}
                <PanelSurface
                  panel={canvasPanel}
                  {scale}
                  {snapToGrid}
                  {gridSize}
                  {gridOrigin}
                  {panelLocked}
                  {bgLayers}
                  {gridStyle}
                  {scopedEditingControl}
                  {marquee}
                  {marqueeRect}
                  bind:surfaceRef={panelSurfaceEl}
                  onclick={handleCanvasClick}
                  onmousedown={marqueeCtrl.handleMouseDown}
                  oncontextmenu={handleContextMenu}
                  ondragover={handleInsertDragOver}
                  ondrop={handleInsertDrop}
                />
              {/if}
              {#if $previewModeEnabled}
                <div class="editor-state-badge preview-active">{previewBadge}</div>
              {:else if editorStateBadge}
                <div class="editor-state-badge">{editorStateBadge}</div>
              {/if}
              {@render canvasAnnotations()}
            </div>
          </div>
        </div>
        {#if $showRulers}
          <EditorRuler orientation="horizontal" length={metrics.width} scrollOffset={metrics.scrollLeft} contentOffset={metrics.contentLeft} {scale} markers={rulerSnapMarkersX} onGuideCreate={(o, p) => addGuide(o, p)} />
          <EditorRuler orientation="vertical" length={metrics.height} scrollOffset={metrics.scrollTop} contentOffset={metrics.contentTop} {scale} markers={rulerSnapMarkersY} onGuideCreate={(o, p) => addGuide(o, p)} />
          <div class="ruler-corner"></div>
        {/if}
        {#if !$previewModeEnabled}
          <CanvasContextMenu bind:target={ctxMenu} panel={canvasPanel} />
        {/if}
      {:else}
        <div class="workspace-empty-state">
          <span class="workspace-empty-eyebrow">Choose a workspace</span>
          <strong>No document open</strong>
          <span>Each opens in its own workspace.</span>
          <div class="workspace-empty-actions">
            <button type="button" onclick={() => openNewPanelDialog()}>New Panel</button>
            <button type="button" onclick={openPanelFromFile}>Open Panel</button>
            <button type="button" onclick={createStandaloneComponent}>New Custom Component</button>
            <button type="button" onclick={createStandaloneDeviceProfile}>New Device Profile</button>
            <button type="button" onclick={createStandaloneScriptWorkspace}>New Script Workspace</button>
            <button type="button" onclick={createStandaloneScreen}>New Screen (CTRL49)</button>
            <button type="button" onclick={importDeviceProfile}>Import Device Profile</button>
          </div>
        </div>
      {/if}
    {/key}
  </div>
</div>

<style>
  .editor-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    outline: none;
  }

  .editor-wrapper.panning,
  .editor-wrapper.panning * {
    cursor: grab !important;
  }

  .tab-bar-area {
    flex: 0 0 34px;
  }

  .canvas-area {
    flex: 1;
    min-height: 0;
    background: #1A1A1A;
    overflow: hidden;
    position: relative;
  }

  .editor-split {
    position: absolute;
    inset: 0;
    display: grid;
    min-width: 0;
    min-height: 0;
  }

  .designer-pane,
  .designer-panel-pane {
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .designer-pane {
    border: 0;
  }

  .editor-split-resizer {
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: #303030;
    position: relative;
    z-index: 30;
  }

  .editor-split.vertical .editor-split-resizer {
    cursor: col-resize;
    border-left: 1px solid #202020;
    border-right: 1px solid #202020;
  }

  .editor-split.horizontal .editor-split-resizer {
    cursor: row-resize;
    border-top: 1px solid #202020;
    border-bottom: 1px solid #202020;
  }

  .editor-split-resizer::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(91, 155, 213, 0);
    transition: background 120ms ease;
  }

  .editor-split-resizer:hover::after,
  .editor-split.resizing .editor-split-resizer::after {
    background: rgba(91, 155, 213, 0.32);
  }

  .editor-split.resizing,
  .editor-split.resizing * {
    user-select: none;
  }

  .editor-split.vertical.resizing,
  .editor-split.vertical.resizing * {
    cursor: col-resize !important;
  }

  .editor-split.horizontal.resizing,
  .editor-split.horizontal.resizing * {
    cursor: row-resize !important;
  }

  .component-workspace {
    position: absolute;
    inset: 0;
    z-index: 140;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: #0D1318;
  }

  .component-workspace-header {
    flex: 0 0 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 10px;
    background: linear-gradient(180deg, #111B22 0%, #0B1116 100%);
    border-bottom: 1px solid #25323C;
    box-sizing: border-box;
    box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.025);
  }

  .component-workspace-title,
  .component-workspace-actions {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .component-workspace-title {
    flex: 0 1 auto;
    max-width: min(42vw, 540px);
  }

  .component-workspace-actions {
    flex: 1 1 auto;
    justify-content: flex-end;
  }

  .component-workspace-status {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    max-width: min(52vw, 760px);
    height: 24px;
    padding: 0 4px;
    border: 1px solid #2F404B;
    border-radius: 4px;
    background: rgba(10, 16, 20, 0.72);
    color: #7E929E;
    box-sizing: border-box;
    overflow: hidden;
    font-size: 10px;
    white-space: nowrap;
  }

  .component-workspace-status span {
    min-width: 0;
    overflow: hidden;
    padding: 2px 5px;
    border: 1px solid rgba(54, 72, 84, 0.74);
    border-radius: 3px;
    background: rgba(22, 32, 39, 0.88);
    text-overflow: ellipsis;
  }

  .component-workspace-status strong {
    color: #C8DCE5;
    font-size: 10px;
    font-weight: 900;
  }

  .component-workspace-status .warn strong {
    color: #F2C979;
  }

  .component-workspace-status .warn {
    border-color: rgba(229, 160, 41, 0.5);
    background: rgba(229, 160, 41, 0.1);
  }

  .component-workspace-title span {
    position: relative;
    color: #7F929F;
    font-size: 10px;
    white-space: nowrap;
  }

  .component-workspace-title span:not(:last-of-type)::after {
    content: '>';
    margin-left: 7px;
    color: #4D606D;
  }

  .component-workspace-header strong {
    min-width: 0;
    overflow: hidden;
    color: #F0F8FB;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }

  .component-workspace-header button,
  .component-workspace-launch {
    height: 24px;
    border: 1px solid #2F404B;
    border-radius: 4px;
    background: #17242D;
    color: #DCEBFA;
    font-size: 11px;
    font-weight: 700;
    padding: 0 8px;
    cursor: pointer;
  }

  .component-workspace-header button.icon-btn {
    width: 24px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #8BB8D4;
  }

  .component-workspace-header button.icon-btn:disabled {
    color: #2F404B;
    cursor: default;
    pointer-events: none;
  }

  .component-workspace-header button:hover,
  .component-workspace-header button.active,
  .component-workspace-launch:hover {
    border-color: #14B8A6;
    background: rgba(20, 184, 166, 0.16);
    color: #F3FFFD;
  }

  .component-workspace-body {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .component-workspace-body :global(.surface-shell) {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 0;
  }

  .component-workspace-launcher {
    position: absolute;
    right: 14px;
    top: 12px;
    z-index: 120;
    display: flex;
    pointer-events: none;
  }

  .component-workspace-launch {
    pointer-events: auto;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  }

  .canvas-viewport {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: auto;
  }

  .canvas-viewport.with-rulers {
    top: 20px;
    left: 20px;
  }

  .canvas-viewport.panel-active {
    background: linear-gradient(180deg, rgba(91,155,213,0.05), rgba(91,155,213,0.02));
  }

  .ruler-corner {
    position: absolute;
    top: 0;
    left: 0;
    width: 20px;
    height: 20px;
    background: #222;
    border-right: 1px solid #444;
    border-bottom: 1px solid #444;
    z-index: 21;
  }

  .canvas-viewport::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  .canvas-viewport::-webkit-scrollbar-track {
    background: #5B9BD5;
  }

  .canvas-viewport::-webkit-scrollbar-thumb {
    background: #1A1A1A;
    border-radius: 6px;
    border: 2px solid #5B9BD5;
  }

  .canvas-viewport::-webkit-scrollbar-corner {
    background: #5B9BD5;
  }

  .canvas-stage {
    min-width: 100%;
    min-height: 100%;
    position: relative;
  }

  .zoom-container {
    position: relative;
    outline: 1px solid rgba(91, 155, 213, 0.35);
    outline-offset: 2px;
  }

  /* --- Canvas annotation layer (live readout, measuring, equal spacing, the
         empty-panel hint). Editor-only; see the snippet's comment. --- */
  .canvas-annotations {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 15;
  }

  .empty-panel-hint {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 32px;
    text-align: center;
    color: #7C8B99;
    font-size: 12px;
    line-height: 1.5;
  }

  .empty-panel-hint strong {
    color: #9FB4C6;
    font-size: 13px;
    font-weight: 600;
  }

  .empty-panel-hint span {
    max-width: 320px;
  }

  .empty-panel-hint b {
    color: #BBD3E6;
    font-weight: 600;
  }

  /* Equal-gap indicators. Pink because that is what every user of a modern
     design tool already reads as "these spaces match" — the alignment guides
     are blue and the distance labels amber, so a third meaning needed a third
     colour rather than another shade of the first two. */
  .eq-bar {
    position: absolute;
    height: 1px;
    background: #F2589B;
    box-shadow: 0 0 0 0.5px rgba(242, 88, 155, 0.35);
  }

  .eq-bar.eq-y {
    width: 1px;
    height: auto;
  }

  .eq-label {
    position: absolute;
    transform: translate(-50%, -50%);
    padding: 1px 4px;
    border-radius: 2px;
    background: #F2589B;
    color: #FFF;
    font-size: 10px;
    line-height: 1.4;
    white-space: nowrap;
  }

  .measure-line {
    position: absolute;
    height: 1px;
    background: #E8B04B;
  }

  .measure-line.measure-y {
    width: 1px;
    height: auto;
  }

  .measure-label {
    position: absolute;
    transform: translate(-50%, -50%);
    padding: 1px 4px;
    border-radius: 2px;
    background: #E8B04B;
    color: #1A1A1A;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
  }

  /* The live X/Y/W/H. Sits just below the box being moved so it never covers
     the thing whose numbers it is reporting. */
  .gesture-hud {
    position: absolute;
    display: flex;
    gap: 10px;
    padding: 3px 7px;
    border-radius: 3px;
    background: rgba(18, 18, 18, 0.92);
    border: 1px solid rgba(91, 155, 213, 0.45);
    color: #D7ECFF;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .gesture-hud b {
    color: #7FA8CC;
    font-weight: 600;
    margin-right: 3px;
  }

  .editor-state-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(18, 18, 18, 0.9);
    border: 1px solid rgba(91, 155, 213, 0.45);
    color: #D7ECFF;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    pointer-events: none;
    z-index: 8;
  }

  .editor-state-badge.preview-active {
    border-color: rgba(255, 196, 84, 0.45);
    color: #FFE4A7;
  }

  .workspace-empty-state {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .workspace-empty-state {
    padding: 24px;
    color: #8FA0AC;
    text-align: center;
    box-sizing: border-box;
  }

  .workspace-empty-state strong {
    color: #E6EEF5;
    font-size: 18px;
    font-weight: 800;
  }

  .workspace-empty-state span {
    max-width: 520px;
    font-size: 12px;
    line-height: 1.45;
  }

  .workspace-empty-eyebrow {
    color: #5B9BD5;
    font-size: 10px !important;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .workspace-empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    max-width: 560px;
    margin-top: 6px;
  }

  .workspace-empty-actions button {
    height: 28px;
    padding: 0 10px;
    border: 1px solid #3A4650;
    border-radius: 4px;
    background: #20262C;
    color: #DCEBFA;
    cursor: pointer;
    font-size: 11px;
    font-weight: 800;
  }

  .workspace-empty-actions button:hover {
    border-color: #5B9BD5;
    background: #26384B;
    color: #FFF;
  }

  @media (max-width: 980px) {
    .component-workspace-header {
      flex: 0 0 auto;
      align-items: stretch;
      flex-direction: column;
      padding: 8px;
    }

    .component-workspace-title,
    .component-workspace-actions {
      width: 100%;
      max-width: none;
      flex-wrap: wrap;
      justify-content: flex-start;
    }

    .component-workspace-status {
      order: 10;
      width: 100%;
      max-width: none;
    }

    .workspace-empty-state {
      justify-content: flex-start;
      padding-top: 44px;
    }

    .workspace-empty-actions {
      max-width: 360px;
    }

    .workspace-empty-actions button {
      flex: 1 1 150px;
    }
  }

</style>
