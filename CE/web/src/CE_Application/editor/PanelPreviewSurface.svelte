<script>
  import { onDestroy } from 'svelte';
  import CanvasControl from './CanvasControl.svelte';
  import GuideLines from './GuideLines.svelte';
  import { showGuides } from '../stores/editorView.js';
  import { showPreviewSelectionRing } from '../stores/runtimePreferences.js';
  import {
    panelPreviewSessions,
    previewInspectedControlId,
    createInteractionPreviewSession,
    updatePanelPreviewSession,
    commitPanelPreviewSelectAction,
    setPreviewInspectedControlId,
  } from '../stores/interactionPreview.js';
  import { sortControlsForRender } from '../utils/controlOrder.js';
  import { resolveRadioGroupLayout, resolveRadioGroupValueAtPoint } from '../utils/radioGroupLayout.js';
  import { resolveInteractiveControl } from '../utils/interactionRuntime.js';
  import {
    createTimedButtonPreviewController,
    isTimedButtonBehavior,
  } from '../utils/timedButtonPreview.js';
  import {
    adjustRangeValue,
    getCurrentRangeValue,
    getRangeMax,
    getRangeMin,
    isRangeBehavior,
    isRangeTextInputKey,
    isSliderRangeBehavior,
    normalizedRangePointerValue,
    parseRangeInputValue,
    resolveRangeDisplayValue,
    resolveRangeZone,
    scrubRangeValue,
    snapRangeValue,
  } from '../utils/rangeBehavior.js';
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

  let {
    panel,
    scale = 1,
    bgLayers = {},
    gridStyle = '',
    surfaceRef = $bindable(null),
  } = $props();

  const DEFAULT_LAYER_ORDER = ['solid', 'gradient', 'image', 'texture'];

  let orderedControls = $derived(sortControlsForRender(panel?.controls ?? []));
  let previewRenderIdNamespace = $derived(`panel-preview-${panel?.id ?? 'panel'}`);

  let pointerActiveControlId = $state('');
  let pointerActiveElement = $state(null);
  let draggingRange = $state(false);
  let pointerDownPoint = $state({ x: 0, y: 0 });
  let pointerDownZone = $state('');
  let pointerStartValue = $state(0);
  let pointerSliderHandle = $state('');
  let keyboardFocusControlId = $state('');
  let lastInputMode = $state('pointer');
  let openComboboxControlId = $state('');

  const timedButtonPreview = createTimedButtonPreviewController({
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

  function getBehavior(control) {
    return control?._children?.Behavior ?? null;
  }

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function sessionFor(control) {
    const controlId = getControlId(control);
    return $panelPreviewSessions?.[controlId] ?? createInteractionPreviewSession(control);
  }

  function resolvedPreviewFor(control) {
    const session = sessionFor(control);
    const previewOverrides = session?.enabled === false ? {} : session;
    return resolveInteractiveControl(control, previewOverrides);
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

  function isComboboxControl(control) {
    return String(getBehavior(control)?.buttonType ?? '').trim().toLowerCase() === 'combobox';
  }

  function getValueRows(control) {
    const rows = control?._children?.Value?.rows;
    return Array.isArray(rows) ? rows.filter((row) => row?.enabled !== false) : [];
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
    setPreviewInspectedControlId(controlId);
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
    const normalized = resolveSliderNormalizedFromPoint(behavior, rect, event.clientX, event.clientY);
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

  function patchControlSession(controlId, patch = {}) {
    updatePanelPreviewSession(controlId, patch);
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

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
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
    patchControlSession(getControlId(control), {
      activeHandle: role,
      valueInputRole: role,
      [`${role}ValueOverrideEnabled`]: true,
      [`${role}ValueOverride`]: clamped,
      valueInputActive: false,
      valueInputBuffer: '',
      ...extraPatch,
    });
  }

  function adjustRangeFromKey(control, key) {
    if (!isRangeControl(control)) return;

    const behavior = getBehavior(control);
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
      default:
        return;
    }

    setRangeValue(control, nextValue);
  }

  function handleRangeTextInput(control, key) {
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
    const normalized = normalizedRangePointerValue(behavior, rect, event.clientX, event.clientY);
    setRangeValue(control, min + ((max - min) * normalized));
  }

  function updateScrubRangeFromPointer(control, event) {
    if (!isRangeControl(control)) return;
    setRangeValue(
      control,
      scrubRangeValue(
        getBehavior(control),
        pointerStartValue,
        pointerDownPoint,
        { x: event.clientX, y: event.clientY }
      ),
      { dragging: true }
    );
  }

  function maybeStartRangeDrag(control, event) {
    if (!isRangeControl(control) || draggingRange) return false;

    const behavior = getBehavior(control);
    if (behavior?.dragEnabled !== true || isSliderRangeBehavior(behavior)) return false;

    const dx = Math.abs(event.clientX - pointerDownPoint.x);
    const dy = Math.abs(event.clientY - pointerDownPoint.y);
    if (Math.max(dx, dy) < 5) return false;

    draggingRange = true;
    patchControlSession(getControlId(control), { dragging: true });
    return true;
  }

  function handleRangeWheel(control, event) {
    const behavior = getBehavior(control);
    if (!isRangeControl(control) || behavior?.wheelEnabled !== true) return;

    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
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
  }

  onDestroy(() => {
    removeWindowListeners();
    timedButtonPreview.destroy();
  });

  $effect(() => {
    const activeControlIds = orderedControls.map((control) => getControlId(control)).filter(Boolean);
    timedButtonPreview.syncKeys(activeControlIds);

    if (pointerActiveControlId && !activeControlIds.includes(pointerActiveControlId)) {
      pointerActiveControlId = '';
      pointerActiveElement = null;
      draggingRange = false;
      pointerDownZone = '';
      pointerSliderHandle = '';
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
    setPreviewInspectedControlId(controlId);
    patchControlSession(controlId, { hover: true });
  }

  function handlePointerLeave(control) {
    if (isDisabled(control)) return;
    const controlId = getControlId(control);
    if (pointerActiveControlId === controlId) {
      patchControlSession(controlId, { hover: false });
      return;
    }

    patchControlSession(controlId, {
      hover: false,
      pressed: false,
      dragging: false,
    });
  }

  function handlePointerDown(control, event) {
    if (event.button !== 0) return;
    if (isDisabled(control)) return;

    event.preventDefault();
    event.currentTarget?.focus?.();
    lastInputMode = 'pointer';
    keyboardFocusControlId = '';
    pointerActiveControlId = getControlId(control);
    if (openComboboxControlId && openComboboxControlId !== pointerActiveControlId) {
      openComboboxControlId = '';
    }
    pointerActiveElement = event.currentTarget;
    pointerDownPoint = { x: event.clientX, y: event.clientY };
    pointerDownZone = '';
    pointerSliderHandle = '';
    pointerStartValue = isSliderControl(control)
      ? currentSliderRoleValue(control, currentSliderActiveHandle(control))
      : currentRangeValue(control);
    draggingRange = isRangeControl(control) && isSliderRangeBehavior(getBehavior(control));
    setPreviewInspectedControlId(pointerActiveControlId);

    if (isRangeControl(control)) {
      const rect = pointerActiveElement?.getBoundingClientRect?.();
      pointerDownZone = resolveRangeZone(getBehavior(control), rect, event.clientX, event.clientY);
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

    patchControlSession(pointerActiveControlId, {
      hover: true,
      pressed: true,
      focused: false,
      dragging: draggingRange,
    });
    if (isTimedButtonBehavior(getBehavior(control))) {
      timedButtonPreview.beginPress(pointerActiveControlId, getBehavior(control));
    }

    if (draggingRange) {
      updateSliderRangeFromPointer(control, event, nextSliderHandle);
    }

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  }

  function handleWindowPointerMove(event) {
    if (!pointerActiveControlId) return;
    const activeControl = orderedControls.find((control) => getControlId(control) === pointerActiveControlId) ?? null;
    if (!activeControl || isDisabled(activeControl)) return;

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

    const activeId = pointerActiveControlId;
    const activeControl = orderedControls.find((control) => getControlId(control) === activeId) ?? null;
    const inside = isPointInsideActiveHitbox(event.clientX, event.clientY);
    const activeBehavior = getBehavior(activeControl);

    if (!draggingRange && inside && activeControl && !isDisabled(activeControl)) {
      if (isRangeControl(activeControl) && !isSliderRangeBehavior(getBehavior(activeControl))) {
        handleRangePointerClick(activeControl, event);
      } else if (isTimedButtonBehavior(activeBehavior)) {
        timedButtonPreview.releasePress(activeId, activeBehavior, { inside });
      } else if (String(getBehavior(activeControl)?.family ?? 'trigger') === 'select') {
        if (isComboboxControl(activeControl)) {
          openComboboxControlId = openComboboxControlId === activeId ? '' : activeId;
          patchControlSession(activeId, {
            focused: true,
            hover: true,
          });
        } else {
          commitPanelPreviewSelectAction(activeId, {
            value: resolveRadioGroupPreviewValue(activeControl, event.clientX, event.clientY),
          });
        }
      }
    } else if (isTimedButtonBehavior(activeBehavior)) {
      timedButtonPreview.releasePress(activeId, activeBehavior, { inside });
    }

    patchControlSession(activeId, {
      hover: inside,
      pressed: false,
      dragging: false,
    });

    pointerActiveControlId = '';
    pointerActiveElement = null;
    draggingRange = false;
    pointerDownZone = '';
    pointerSliderHandle = '';
    removeWindowListeners();
  }

  function handleFocus(control) {
    if (isDisabled(control)) return;
    if (lastInputMode !== 'keyboard') return;

    const controlId = getControlId(control);
    keyboardFocusControlId = controlId;
    setPreviewInspectedControlId(controlId);
    patchControlSession(controlId, { focused: true });
  }

  function handleBlur(control) {
    const controlId = getControlId(control);
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
    setPreviewInspectedControlId(controlId);

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
        pressed: true,
      });
      if (isTimedButtonBehavior(getBehavior(control))) {
        timedButtonPreview.beginPress(controlId, getBehavior(control));
      }
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      if (!isRangeControl(control)) return;
      event.preventDefault();
      event.currentTarget?.focus?.();
      patchControlSession(controlId, {
        focused: true,
        hover: true,
      });
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
    } else if (String(getBehavior(control)?.family ?? 'trigger') === 'select') {
      if (isComboboxControl(control)) {
        openComboboxControlId = openComboboxControlId === controlId ? '' : controlId;
      } else {
        commitPanelPreviewSelectAction(controlId);
      }
    }
    patchControlSession(controlId, {
      focused: true,
      hover: true,
      pressed: false,
    });
  }

  function previewRoleFor(control) {
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

  function previewAriaCheckedFor(control) {
    const role = previewRoleFor(control);
    if (role !== 'radio' && role !== 'checkbox') return undefined;
    return sessionFor(control)?.checked === true;
  }
</script>

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

  {#each orderedControls as control (control._children?.Core?.id)}
    {@const resolvedPreview = resolvedPreviewFor(control)}
    <CanvasControl
      {control}
      resolvedControlOverride={resolvedPreview?.control ?? control}
      interactionRuntimeOverride={resolvedPreview?.runtime ?? null}
      {scale}
      panelLocked={false}
      allControls={orderedControls}
      panelWidth={panel.width}
      panelHeight={panel.height}
      editorInteractionEnabled={false}
      previewSessionOverride={sessionFor(control)}
      renderIdNamespace={previewRenderIdNamespace}
      previewRole={previewRoleFor(control)}
      previewTabIndex={isDisabled(control) ? undefined : 0}
      previewAriaLabel={`${control?._children?.Core?.name ?? control?._children?.Core?.controlType ?? 'Control'} preview`}
      previewAriaDisabled={isDisabled(control)}
      previewAriaChecked={previewAriaCheckedFor(control)}
      previewAriaExpanded={isComboboxControl(control) ? openComboboxControlId === getControlId(control) : undefined}
      previewAriaValueNow={isRangeControl(control) ? currentRangeValue(control) : undefined}
      previewAriaValueMin={isRangeControl(control) ? getRangeMin(getBehavior(control)) : undefined}
      previewAriaValueMax={isRangeControl(control) ? getRangeMax(getBehavior(control)) : undefined}
      previewAriaValueText={isRangeControl(control) ? resolveRangeDisplayValue(getBehavior(control), sessionFor(control)) : undefined}
      previewValueField={previewRoleFor(control) === 'spinbutton' ? {
        value: resolveRangeDisplayValue(getBehavior(control), sessionFor(control)),
        disabled: isDisabled(control),
        inputMode: String(getBehavior(control)?.valueType ?? '') === 'int' ? 'numeric' : 'decimal',
        ariaLabel: `${control?._children?.Core?.name ?? control?._children?.Core?.controlType ?? 'Range'} value`,
        tabIndex: -1,
      } : null}
      previewKeyboardFocus={keyboardFocusControlId === getControlId(control)}
      previewHighlighted={$showPreviewSelectionRing && $previewInspectedControlId === getControlId(control)}
      onpreviewpointerenter={() => handlePointerEnter(control)}
      onpreviewpointerleave={() => handlePointerLeave(control)}
      onpreviewpointerdown={(event) => handlePointerDown(control, event)}
      onpreviewwheel={(event) => handleRangeWheel(control, event)}
      onpreviewfocus={() => handleFocus(control)}
      onpreviewblur={() => handleBlur(control)}
      onpreviewkeydown={(event) => handleKeyDown(control, event)}
      onpreviewkeyup={(event) => handleKeyUp(control, event)}
      onpreviewvaluefieldinput={(event) => handleRangeFieldInput(control, event)}
      onpreviewvaluefieldkeydown={(event) => handleRangeFieldKeyDown(control, event)}
      onpreviewvaluefieldfocus={(event) => handleRangeFieldFocus(control, event)}
      onpreviewvaluefieldblur={(event) => handleRangeFieldBlur(control, event)}
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
