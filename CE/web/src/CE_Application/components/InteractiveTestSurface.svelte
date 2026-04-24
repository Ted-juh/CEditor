<script>
  import { onDestroy } from 'svelte';
  import CanvasControl from '../editor/CanvasControl.svelte';
  import { deepClone } from '../utils/deepClone.js';
  import { getNextEnumValue } from '../utils/enumBehavior.js';
  import { resolveRadioGroupLayout, resolveRadioGroupValueAtPoint } from '../utils/radioGroupLayout.js';
  import {
    createTimedButtonPreviewController,
    isTimedButtonBehavior,
    resolveTimedButtonConfig,
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
    formatSliderNumericValue,
    getSliderActiveHandle,
    getSliderDisplayValue,
    getSliderLegalRangeForHandle,
    getSliderResolvedValues,
    getSliderValueMode,
    isSliderBehavior,
    parseSliderInputValue,
    snapSliderValue,
  } from '../utils/sliderBehavior.js';
  import { resolveSliderNormalizedFromPoint } from '../utils/sliderGeometry.js';

  function getValueRows(control) {
    const rows = control?._children?.Value?.rows;
    return Array.isArray(rows) ? rows.filter((row) => row?.enabled !== false) : [];
  }

  let {
    control = null,
    resolvedControl = null,
    resolvedRuntime = null,
    session = null,
    onpatchsession = null,
  } = $props();

  const SURFACE_PADDING = 24;
  const MAX_PREVIEW_SCALE = 2.75;

  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let hitboxElement = $state(null);
  let pointerActive = $state(false);
  let draggingRange = $state(false);
  let pointerDownPoint = $state({ x: 0, y: 0 });
  let pointerDownZone = $state('');
  let pointerStartValue = $state(0);
  let keyboardFocusActive = $state(false);
  let lastInputMode = $state('pointer');
  let lastControlId = $state('');
  let commitResetTimer = null;

  const timedButtonPreview = createTimedButtonPreviewController({
    patchSession: (_controlId, patch) => patchSession(patch),
  });

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function patchSession(patch = {}) {
    onpatchsession?.(patch);
  }

  function pulseCommitState() {
    if (behavior?.emitValueCommit !== true) return;
    patchSession({ executed: true });
    if (commitResetTimer) clearTimeout(commitResetTimer);
    commitResetTimer = setTimeout(() => {
      commitResetTimer = null;
      patchSession({ executed: false });
    }, 180);
  }

  let behavior = $derived(control?._children?.Behavior ?? null);
  let transform = $derived(control?._children?.Transform ?? null);
  let previewRenderIdNamespace = $derived(
    `interaction-preview-${control?._children?.Core?.id ?? 'control'}`
  );
  let previewControl = $derived.by(() => {
    const sourceControl = resolvedControl ?? control;
    if (!sourceControl) return null;
    const clone = deepClone(sourceControl);
    if (clone?._children?.Transform) {
      clone._children.Transform.x = 0;
      clone._children.Transform.y = 0;
    }
    return clone;
  });

  let controlWidth = $derived(Math.max(24, numberOr(transform?.width, 100)));
  let controlHeight = $derived(Math.max(24, numberOr(transform?.height, 40)));
  let fitScale = $derived.by(() => {
    if (!stageWidth || !stageHeight) return 1;
    const usableWidth = Math.max(1, stageWidth - (SURFACE_PADDING * 2));
    const usableHeight = Math.max(1, stageHeight - (SURFACE_PADDING * 2));
    return clamp(Math.min(usableWidth / controlWidth, usableHeight / controlHeight, MAX_PREVIEW_SCALE), 0.25, MAX_PREVIEW_SCALE);
  });
  let sceneWidth = $derived(controlWidth * fitScale);
  let sceneHeight = $derived(controlHeight * fitScale);
  let sceneLeft = $derived(Math.max(SURFACE_PADDING, (stageWidth - sceneWidth) / 2));
  let sceneTop = $derived(Math.max(SURFACE_PADDING, (stageHeight - sceneHeight) / 2));
  let previewSession = $derived(session?.enabled === false ? {} : (session ?? {}));
  let isDisabled = $derived(session?.enabled === false || session?.disabled === true);
  let helperLabel = $derived.by(() => {
    if (!behavior) return 'Hover and click to test the selected control.';
    if (isTimedButtonBehavior(behavior)) {
      const config = resolveTimedButtonConfig(behavior);
      if (config.subtype === 'double_click') {
        return `Click ${config.requiredClicks} times within ${config.clickWindow} ms to trigger this button.`;
      }
      return `Press and hold for ${config.holdDuration} ms to trigger this button.`;
    }
    if (behavior.family === 'range') {
      return isSliderRangeBehavior(behavior)
        ? 'Drag across the control to test slider travel.'
        : 'Click the step buttons, type a value, or scrub-drag to test range behavior.';
    }
    if (behavior.family === 'select') return 'Hover, press, and click to test selection behavior.';
    return 'Hover and press to test the configured states.';
  });
  let previewRole = $derived.by(() => {
    if (!behavior) return 'button';
    const family = String(behavior.family ?? 'trigger').trim().toLowerCase();
    const role = String(behavior.role ?? '').trim().toLowerCase();
    const buttonType = String(behavior.buttonType ?? '').trim().toLowerCase();

    if (family === 'range') return isSliderRangeBehavior(behavior) ? 'slider' : 'spinbutton';
    if (buttonType === 'radio') return 'radiogroup';
    if (role === 'radio' || role === 'segmented') return 'radio';
    if (role === 'toggle' || role === 'checkbox') return 'checkbox';
    return 'button';
  });
  let previewAriaValueNow = $derived(
    isRangeControl()
      ? (isSliderControl() ? resolvedRuntime?.signals?.ariaValueNow : currentRangeValue())
      : undefined
  );
  let previewAriaValueMin = $derived(
    isRangeControl()
      ? (isSliderControl() ? resolvedRuntime?.signals?.ariaValueMin : getRangeMin(behavior))
      : undefined
  );
  let previewAriaValueMax = $derived(
    isRangeControl()
      ? (isSliderControl() ? resolvedRuntime?.signals?.ariaValueMax : getRangeMax(behavior))
      : undefined
  );
  let previewAriaValueText = $derived(
    isRangeControl()
      ? (isSliderControl() ? resolvedRuntime?.signals?.ariaValueText : resolveRangeDisplayValue(behavior, session))
      : undefined
  );

  function removeWindowListeners() {
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
  }

  onDestroy(() => {
    removeWindowListeners();
    if (commitResetTimer) {
      clearTimeout(commitResetTimer);
      commitResetTimer = null;
    }
    timedButtonPreview.destroy();
  });

  $effect(() => {
    const nextControlId = String(control?._children?.Core?.id ?? '');
    timedButtonPreview.syncKeys(nextControlId ? [nextControlId] : []);
    if (nextControlId !== lastControlId) {
      lastControlId = nextControlId;
      pointerActive = false;
      draggingRange = false;
      pointerDownZone = '';
      keyboardFocusActive = false;
      if (commitResetTimer) {
        clearTimeout(commitResetTimer);
        commitResetTimer = null;
      }
      removeWindowListeners();
    }
    if (nextControlId) {
      timedButtonPreview.syncSession(nextControlId, session);
    }
  });

  function isRangeControl() {
    return isRangeBehavior(behavior);
  }

  function isPointInsideHitbox(clientX, clientY) {
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function currentBoolValue() {
    if (session?.valueOverrideEnabled === true) return session?.valueOverride === true;
    return session?.checked === true;
  }

  function currentRangeValue() {
    return getCurrentRangeValue(behavior, session);
  }

  function isSliderControl() {
    return isSliderBehavior(behavior);
  }

  function currentSliderValues() {
    return getSliderResolvedValues(behavior, session);
  }

  function currentSliderActiveHandle() {
    return getSliderActiveHandle(behavior, session);
  }

  function currentSliderRoleValue(role = 'current') {
    return currentSliderValues()?.[role] ?? currentSliderValues().current;
  }

  function sliderValueForPoint(event) {
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return currentSliderRoleValue(currentSliderActiveHandle());
    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    const normalized = resolveSliderNormalizedFromPoint(behavior, rect, event.clientX, event.clientY);
    return snapSliderValue(behavior, min + ((max - min) * normalized));
  }

  function pickNearestSliderHandle(event) {
    const values = currentSliderValues();
    const roles = getSliderValueMode(behavior) === 'range'
      ? ['start', 'end']
      : (getSliderValueMode(behavior) === 'band' ? ['start', 'current', 'end'] : ['current']);
    const targetValue = sliderValueForPoint(event);
    let nearestRole = currentSliderActiveHandle();
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const role of roles) {
      const distance = Math.abs((values?.[role] ?? 0) - targetValue);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestRole = role;
      }
    }

    return nearestRole;
  }

  function setSliderRoleValue(role = 'current', nextValue = 0, extraPatch = {}) {
    const legal = getSliderLegalRangeForHandle(behavior, session, role);
    const clamped = Math.max(legal.min, Math.min(legal.max, snapSliderValue(behavior, nextValue)));
    patchSession({
      activeHandle: role,
      valueInputRole: role,
      [`${role}ValueOverrideEnabled`]: true,
      [`${role}ValueOverride`]: clamped,
      valueInputActive: false,
      valueInputBuffer: '',
      ...extraPatch,
    });
  }

  function resolveRadioGroupPreviewValue(clientX, clientY) {
    if (String(behavior?.buttonType ?? '') !== 'radio') return '';

    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return '';

    const transformSection = control?._children?.Transform ?? null;
    const contentLayout = control?._children?.ContentLayout ?? null;
    const valueRows = getValueRows(control);
    const layout = resolveRadioGroupLayout({
      behavior,
      valueRows,
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

  function commitSelectAction(nextValue = '') {
    const buttonType = String(behavior?.buttonType ?? '');
    const role = String(behavior?.role ?? '');
    const valueType = String(behavior?.valueType ?? '');
    const valueRows = getValueRows(control);
    if (role === 'radio') {
      const selectedValue = String(nextValue ?? '').trim();
      const nextRow = valueRows.find((row) => String(row?.internalValue ?? row?.id ?? '') === selectedValue)
        ?? valueRows.find((row) => row?.selectedByDefault === true)
        ?? valueRows[0]
        ?? null;
      if (!nextRow) return;
      patchSession({
        checked: false,
        mixed: false,
        valueOverrideEnabled: true,
        valueOverride: nextRow?.internalValue ?? nextRow?.id ?? '',
      });
      return;
    }
    if (buttonType === 'cyclic' && valueRows.length) {
      const currentValue = session?.valueOverrideEnabled === true
        ? session?.valueOverride
        : (behavior?.defaultValue ?? valueRows[0]?.internalValue ?? valueRows[0]?.id);
      const currentIndex = Math.max(0, valueRows.findIndex((row) => String(row?.internalValue ?? row?.id) === String(currentValue ?? '')));
      const nextIndex = currentIndex >= valueRows.length - 1
        ? (behavior?.wrapBehavior === false ? currentIndex : 0)
        : currentIndex + 1;
      const nextRow = valueRows[nextIndex] ?? valueRows[0];
      patchSession({
        valueOverrideEnabled: true,
        valueOverride: nextRow?.internalValue ?? nextRow?.id ?? '',
      });
      return;
    }
    if (valueType === 'enum') {
      const values = Array.isArray(behavior?.enumValues) ? behavior.enumValues : [];
      if (!values.length) return;
      const currentValue = session?.valueOverrideEnabled === true ? session?.valueOverride : behavior?.defaultValue;
      const nextValue = getNextEnumValue(values, currentValue, behavior?.wrapEnum === true);
      patchSession({
        valueOverrideEnabled: true,
        valueOverride: nextValue,
      });
      return;
    }

    patchSession({
      checked: !currentBoolValue(),
      mixed: false,
      valueOverrideEnabled: false,
    });
  }

  function clearRangeInput() {
    patchSession({
      valueInputActive: false,
      valueInputRole: currentSliderActiveHandle(),
      valueInputBuffer: '',
    });
  }

  function beginRangeFieldEdit() {
    if (isSliderControl()) {
      patchSession({
        focused: true,
        hover: true,
        valueInputActive: true,
        valueInputRole: currentSliderActiveHandle(),
        valueInputBuffer: getSliderDisplayValue(behavior, session),
      });
      return;
    }

    patchSession({
      focused: true,
      hover: true,
      valueInputActive: true,
      valueInputBuffer: resolveRangeDisplayValue(behavior, session),
    });
  }

  function commitRangeFieldInput() {
    if (isSliderControl()) {
      const role = String(session?.valueInputRole ?? currentSliderActiveHandle()).trim().toLowerCase();
      const rawValue = session?.valueInputActive === true
        ? String(session?.valueInputBuffer ?? '')
        : formatSliderNumericValue(behavior, currentSliderRoleValue(role));
      const parsed = parseSliderInputValue(behavior, rawValue);

      const nextPatch = {
        valueInputActive: false,
        valueInputRole: role,
        valueInputBuffer: '',
        ...(parsed === null ? {} : {
          activeHandle: role,
          [`${role}ValueOverrideEnabled`]: true,
          [`${role}ValueOverride`]: parsed,
        }),
      };
      patchSession(nextPatch);
      if (parsed !== null) pulseCommitState();
      return;
    }

    const rawValue = session?.valueInputActive === true
      ? String(session?.valueInputBuffer ?? '')
      : resolveRangeDisplayValue(behavior, session);
    const parsed = parseRangeInputValue(behavior, rawValue);

    patchSession({
      valueInputActive: false,
      valueInputBuffer: '',
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
    if (parsed !== null) pulseCommitState();
  }

  function handleRangeFieldInput(event) {
    event.stopPropagation();
    const rawValue = String(event?.currentTarget?.value ?? '');
    if (isSliderControl()) {
      const role = String(session?.valueInputRole ?? currentSliderActiveHandle()).trim().toLowerCase();
      const parsed = parseSliderInputValue(behavior, rawValue);
      patchSession({
        valueInputActive: true,
        valueInputRole: role,
        valueInputBuffer: rawValue,
        ...(parsed === null ? {} : {
          activeHandle: role,
          [`${role}ValueOverrideEnabled`]: true,
          [`${role}ValueOverride`]: parsed,
        }),
      });
      return;
    }

    const parsed = parseRangeInputValue(behavior, rawValue);
    patchSession({
      valueInputActive: true,
      valueInputBuffer: rawValue,
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
  }

  function handleRangeFieldKeyDown(event) {
    event.stopPropagation();

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      adjustRangeFromKey(event.key);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitRangeFieldInput();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      clearRangeInput();
    }
  }

  function handleRangeFieldFocus(event) {
    event.stopPropagation();
    beginRangeFieldEdit();
  }

  function handleRangeFieldBlur(event) {
    event.stopPropagation();
    commitRangeFieldInput();
    patchSession({
      focused: false,
      pressed: false,
      dragging: false,
    });
  }

  function setRangeValue(nextValue, extraPatch = {}) {
    patchSession({
      valueOverrideEnabled: true,
      valueOverride: snapRangeValue(behavior, nextValue),
      valueInputActive: false,
      valueInputBuffer: '',
      ...extraPatch,
    });
  }

  function updateSliderRangeFromPointer(event) {
    if (!isRangeControl()) return;
    if (isSliderControl()) {
      setSliderRoleValue(currentSliderActiveHandle(), sliderValueForPoint(event), { dragging: true });
      return;
    }

    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return;

    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    const normalized = normalizedRangePointerValue(behavior, rect, event.clientX, event.clientY);
    setRangeValue(min + ((max - min) * normalized));
  }

  function updateScrubRangeFromPointer(event) {
    if (!isRangeControl()) return;
    setRangeValue(
      scrubRangeValue(behavior, pointerStartValue, pointerDownPoint, { x: event.clientX, y: event.clientY }),
      { dragging: true }
    );
  }

  function maybeStartRangeDrag(event) {
    if (!isRangeControl() || draggingRange || isSliderRangeBehavior(behavior) || behavior?.dragEnabled !== true) return false;

    const dx = Math.abs(event.clientX - pointerDownPoint.x);
    const dy = Math.abs(event.clientY - pointerDownPoint.y);
    if (Math.max(dx, dy) < 5) return false;

    draggingRange = true;
    patchSession({ dragging: true });
    return true;
  }

  function handleRangePointerClick(event) {
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return;

    const zone = resolveRangeZone(behavior, rect, event.clientX, event.clientY);
    if (zone !== pointerDownZone) return;

    if (zone === 'decrement') {
      setRangeValue(adjustRangeValue(behavior, currentRangeValue(), -1));
    } else if (zone === 'increment') {
      setRangeValue(adjustRangeValue(behavior, currentRangeValue(), 1));
    }
  }

  function adjustRangeFromKey(key) {
    if (!isRangeControl()) return;

    if (isSliderControl()) {
      const role = currentSliderActiveHandle();
      const legal = getSliderLegalRangeForHandle(behavior, session, role);
      let nextValue = currentSliderRoleValue(role);

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

      setSliderRoleValue(role, nextValue);
      pulseCommitState();
      return;
    }

    let nextValue = currentRangeValue();

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

    setRangeValue(nextValue);
    pulseCommitState();
  }

  function handleRangeTextInput(key) {
    if (isSliderControl()) {
      const role = String(session?.valueInputRole ?? currentSliderActiveHandle()).trim().toLowerCase();
      const currentBuffer = session?.valueInputActive === true ? String(session?.valueInputBuffer ?? '') : '';

      if (key === 'Escape') {
        clearRangeInput();
        return true;
      }

      if (key === 'Enter') {
        const parsed = parseSliderInputValue(behavior, currentBuffer);
        patchSession({
          valueInputActive: false,
          valueInputRole: role,
          valueInputBuffer: '',
          ...(parsed === null ? {} : {
            activeHandle: role,
            [`${role}ValueOverrideEnabled`]: true,
            [`${role}ValueOverride`]: parsed,
          }),
        });
        if (parsed !== null) pulseCommitState();
        return true;
      }

      let nextBuffer = currentBuffer;
      if (key === 'Backspace') {
        nextBuffer = currentBuffer.slice(0, -1);
      } else if (key === 'Delete') {
        nextBuffer = '';
      } else if (/^[0-9]$/.test(String(key ?? '')) || key === '.' || key === '-') {
        nextBuffer = `${currentBuffer}${key}`;
      } else {
        return false;
      }

      const parsed = parseSliderInputValue(behavior, nextBuffer);
      patchSession({
        valueInputActive: true,
        valueInputRole: role,
        valueInputBuffer: nextBuffer,
        ...(parsed === null ? {} : {
          activeHandle: role,
          [`${role}ValueOverrideEnabled`]: true,
          [`${role}ValueOverride`]: parsed,
        }),
      });
      return true;
    }

    const currentBuffer = session?.valueInputActive === true ? String(session?.valueInputBuffer ?? '') : '';

    if (key === 'Escape') {
      clearRangeInput();
      return true;
    }

    if (key === 'Enter') {
      const parsed = parseRangeInputValue(behavior, currentBuffer);
      patchSession({
        valueInputActive: false,
        valueInputBuffer: '',
        ...(parsed === null ? {} : {
          valueOverrideEnabled: true,
          valueOverride: parsed,
        }),
      });
      if (parsed !== null) pulseCommitState();
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

    const parsed = parseRangeInputValue(behavior, nextBuffer);
    patchSession({
      valueInputActive: true,
      valueInputBuffer: nextBuffer,
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
    return true;
  }

  function handleWheel(event) {
    if (!isRangeControl() || behavior?.wheelEnabled !== true || isDisabled) return;

    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    if (isSliderControl()) {
      const role = currentSliderActiveHandle();
      setSliderRoleValue(role, currentSliderRoleValue(role) + (direction * numberOr(behavior?.step, 0.01)), {
        hover: true,
        focused: true,
      });
      pulseCommitState();
      return;
    }

    setRangeValue(adjustRangeValue(behavior, currentRangeValue(), direction), {
      hover: true,
      focused: true,
    });
    pulseCommitState();
  }

  function handlePointerEnter() {
    if (isDisabled) return;
    patchSession({ hover: true });
  }

  function handlePointerLeave() {
    if (isDisabled) return;
    if (pointerActive) {
      patchSession({ hover: false });
      return;
    }
    patchSession({ hover: false, pressed: false, dragging: false });
  }

  function handlePointerDown(event) {
    if (isDisabled) return;
    event.preventDefault();
    lastInputMode = 'pointer';
    keyboardFocusActive = false;
    pointerActive = true;
    pointerDownPoint = { x: event.clientX, y: event.clientY };
    pointerStartValue = isSliderControl() ? currentSliderRoleValue(currentSliderActiveHandle()) : currentRangeValue();
    draggingRange = isRangeControl() && (isSliderControl() || isSliderRangeBehavior(behavior));
    pointerDownZone = isRangeControl()
      ? resolveRangeZone(behavior, hitboxElement?.getBoundingClientRect?.(), event.clientX, event.clientY)
      : '';

    if (isSliderControl()) {
      const clickMode = String(behavior?.trackClickMode ?? 'moveNearestHandle').trim().toLowerCase();
      const nextHandle = clickMode === 'moveactivehandle'
        ? currentSliderActiveHandle()
        : pickNearestSliderHandle(event);
      patchSession({
        activeHandle: nextHandle,
        valueInputRole: nextHandle,
      });
    }

    patchSession({
      hover: true,
      pressed: true,
      dragging: draggingRange,
    });
    if (isTimedButtonBehavior(behavior)) {
      timedButtonPreview.beginPress(control?._children?.Core?.id, behavior);
    }
    if (draggingRange) {
      updateSliderRangeFromPointer(event);
    }
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  }

  function handleWindowPointerMove(event) {
    if (!pointerActive || isDisabled || !isRangeControl()) return;

    if (isSliderControl() || isSliderRangeBehavior(behavior)) {
      if (!draggingRange) return;
      updateSliderRangeFromPointer(event);
      return;
    }

    if (maybeStartRangeDrag(event)) {
      updateScrubRangeFromPointer(event);
      return;
    }

    if (draggingRange) {
      updateScrubRangeFromPointer(event);
    }
  }

  function handleWindowPointerUp(event) {
    if (!pointerActive) return;
    const inside = isPointInsideHitbox(event.clientX, event.clientY);

    if (!draggingRange && inside && !isDisabled) {
      if (isRangeControl() && !isSliderControl() && !isSliderRangeBehavior(behavior)) {
        handleRangePointerClick(event);
      } else if (isTimedButtonBehavior(behavior)) {
        timedButtonPreview.releasePress(control?._children?.Core?.id, behavior, { inside });
      } else if (String(behavior?.family ?? 'trigger') === 'select') {
        commitSelectAction(resolveRadioGroupPreviewValue(event.clientX, event.clientY));
      }
    } else if (isTimedButtonBehavior(behavior)) {
      timedButtonPreview.releasePress(control?._children?.Core?.id, behavior, { inside });
    }

    patchSession({
      hover: inside,
      pressed: false,
      dragging: false,
      inputModality: 'pointer',
    });
    if (draggingRange && isRangeControl()) pulseCommitState();

    pointerActive = false;
    draggingRange = false;
    pointerDownZone = '';
    removeWindowListeners();
  }

  function handleFocus() {
    if (isDisabled) return;
    if (lastInputMode !== 'keyboard') return;
    keyboardFocusActive = true;
    patchSession({ focused: true });
  }

  function handleBlur() {
    if (isTimedButtonBehavior(behavior)) {
      timedButtonPreview.cancel(control?._children?.Core?.id);
    }
    keyboardFocusActive = false;
    patchSession({ focused: false, pressed: false, dragging: false, valueInputActive: false });
    pointerActive = false;
    draggingRange = false;
    removeWindowListeners();
  }

  function handleKeyDown(event) {
    if (isDisabled) return;
    if (behavior?.keyboardEnabled === false) return;
    lastInputMode = 'keyboard';
    keyboardFocusActive = true;

    if (!event.ctrlKey && !event.metaKey && !event.altKey && isRangeControl()) {
      if (handleRangeTextInput(event.key)) {
        event.preventDefault();
        hitboxElement?.focus?.();
        patchSession({ focused: true, hover: true });
        return;
      }
    }

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (event.repeat) return;
      hitboxElement?.focus?.();
      patchSession({ focused: true, pressed: true, hover: true });
      if (isTimedButtonBehavior(behavior)) {
        timedButtonPreview.beginPress(control?._children?.Core?.id, behavior);
      }
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      hitboxElement?.focus?.();
      patchSession({ focused: true, hover: true });
      adjustRangeFromKey(event.key);
    }
  }

  function handleKeyUp(event) {
    if (isDisabled) return;
    if (behavior?.keyboardEnabled === false) return;
    if (event.key !== ' ' && event.key !== 'Enter') return;

    event.preventDefault();
    if (isTimedButtonBehavior(behavior)) {
      timedButtonPreview.releasePress(control?._children?.Core?.id, behavior, { inside: true });
    } else if (String(behavior?.family ?? 'trigger') === 'select') {
      commitSelectAction();
    }
    patchSession({ focused: true, hover: true, pressed: false });
  }
</script>

<div class="test-surface">
  <div class="surface-header">
    <div class="surface-title">Live Test Surface</div>
    <div class="surface-subtitle">{helperLabel}</div>
  </div>

  <div class="surface-stage" bind:clientWidth={stageWidth} bind:clientHeight={stageHeight}>
    {#if previewControl}
      <div class="stage-grid"></div>
      <div
        class="preview-scene"
        style="left:{sceneLeft}px; top:{sceneTop}px; width:{controlWidth}px; height:{controlHeight}px; transform:scale({fitScale}); transform-origin:top left;"
      >
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          bind:this={hitboxElement}
          class="test-hitbox"
          class:disabled={session?.disabled === true}
          class:keyboard-focus={keyboardFocusActive}
          role={previewRole}
          aria-label="Interactive preview surface"
          aria-disabled={session?.disabled === true}
          aria-valuenow={previewAriaValueNow}
          aria-valuemin={previewAriaValueMin}
          aria-valuemax={previewAriaValueMax}
          aria-valuetext={previewAriaValueText}
          tabindex={isDisabled ? undefined : 0}
          onpointerenter={handlePointerEnter}
          onpointerleave={handlePointerLeave}
          onpointerdown={handlePointerDown}
          onwheel={handleWheel}
          onfocus={handleFocus}
          onblur={handleBlur}
          onkeydown={handleKeyDown}
          onkeyup={handleKeyUp}
        >
          <CanvasControl
            control={previewControl}
            resolvedControlOverride={previewControl}
            interactionRuntimeOverride={resolvedRuntime}
            scale={1}
            renderIdNamespace={previewRenderIdNamespace}
            panelLocked={false}
            allControls={[previewControl]}
            editorInteractionEnabled={false}
            previewSessionOverride={previewSession}
            previewValueField={previewRole === 'spinbutton' ? {
              value: resolveRangeDisplayValue(behavior, session),
              disabled: isDisabled,
              inputMode: String(behavior?.valueType ?? '') === 'int' ? 'numeric' : 'decimal',
              ariaLabel: `${control?._children?.Core?.name ?? control?._children?.Core?.controlType ?? 'Range'} value`,
              tabIndex: -1,
            } : null}
            onpreviewvaluefieldinput={handleRangeFieldInput}
            onpreviewvaluefieldkeydown={handleRangeFieldKeyDown}
            onpreviewvaluefieldfocus={handleRangeFieldFocus}
            onpreviewvaluefieldblur={handleRangeFieldBlur}
          />
        </div>
      </div>
      {#if session?.enabled === false}
        <div class="surface-overlay">Preview disabled</div>
      {/if}
    {:else}
      <div class="surface-empty">Select a control to test it here.</div>
    {/if}
  </div>
</div>

<style>
  .test-surface {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    height: 100%;
  }

  .surface-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .surface-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.45px;
    color: #D7D7D7;
  }

  .surface-subtitle {
    font-size: 11px;
    color: #8A8A8A;
  }

  .surface-stage {
    position: relative;
    flex: 1;
    min-height: 240px;
    overflow: hidden;
    border: 1px solid #2D2D2D;
    border-radius: 10px;
    background:
      radial-gradient(circle at top, rgba(91, 155, 213, 0.12), transparent 42%),
      linear-gradient(180deg, #1C1C1C 0%, #161616 100%);
  }

  .stage-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    background-size: 18px 18px;
    pointer-events: none;
  }

  .preview-scene {
    position: absolute;
  }

  .test-hitbox {
    position: absolute;
    inset: 0;
    outline: none;
    cursor: pointer;
  }

  .test-hitbox.disabled {
    cursor: not-allowed;
  }

  .test-hitbox.keyboard-focus::after {
    content: '';
    position: absolute;
    inset: -6px;
    border: 1px solid rgba(91, 155, 213, 0.6);
    border-radius: 12px;
    pointer-events: none;
  }

  .surface-overlay,
  .surface-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    text-align: center;
    color: #7C7C7C;
    font-size: 12px;
    pointer-events: none;
  }

  .surface-overlay {
    background: rgba(15, 15, 15, 0.55);
    color: #B4B4B4;
  }
</style>
