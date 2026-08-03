<script>
  import { onDestroy } from 'svelte';
  import CanvasControl from '../editor/CanvasControl.svelte';
  import { commitDeviceParameter } from '../stores/deviceProfiles.js';
  import { deepClone } from '../utils/deepClone.js';
  import { getNextEnumValue } from '../utils/enumBehavior.js';
  import { resolveRadioGroupLayout, resolveRadioGroupValueAtPoint } from '../utils/radioGroupLayout.js';
  import { numberOr, clamp } from '../utils/primitives.js';
  import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';
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
    resolveMouseDirection,
    snapRangeValue,
  } from '../utils/rangeBehavior.js';
  import {
    createRangeScrub,
    createRangeTrackScrub,
    createSliderTrackScrub,
    isLinearSliderGeometry,
    scrubSample,
  } from '../utils/scrubRuntime.js';
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
  import {
    resolveCircularPoint,
    resolveCircularTrackMetrics,
    resolveLinearPointerPoint,
    resolveSliderNormalizedFromPoint,
    sliderValueToAngle,
  } from '../utils/sliderGeometry.js';
  import {
    denormalizeCustomChannelValue,
    getCustomBehaviors,
    getCustomValueChannels,
    isCustomMouseDirectionReversed,
    normalizeCustomChannelValue,
    resetCustomChannelToDefault,
    resolveCustomHitZoneAtPoint,
    resolveCustomInteractionPatch,
    resolveCustomNormalizedFromPoint,
    seedCustomValues,
    snapCustomChannelValue,
  } from '../utils/customComponentInteraction.js';

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
    compact = false,
  } = $props();

  const MAX_PREVIEW_SCALE = 2.75;

  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let hitboxElement = $state(null);
  let pointerActive = $state(false);
  let draggingRange = $state(false);
  let pointerDownPoint = $state({ x: 0, y: 0 });
  let pointerDownZone = $state('');
  let pointerStartValue = $state(0);
  let rangeScrub = null;
  let sliderScrub = null;
  let pointerSliderHandle = $state('');
  let pointerCustomHitZone = $state(null);
  let pointerCustomStartValues = $state({});
  let keyboardFocusActive = $state(false);
  let lastInputMode = $state('pointer');
  let lastControlId = $state('');
  let comboboxOpen = $state(false);
  let commitResetTimer = null;

  const timedButtonPreview = createTimedButtonPreviewController({
    patchSession: (_controlId, patch) => patchSession(patch),
  });

  function patchSession(patch = {}) {
    onpatchsession?.(patch);
    emitDeviceBindingsForPatch(patch);
  }

  function activeDeviceBindings() {
    const deviceBindings = control?._children?.DeviceBindings;
    if (deviceBindings?.enabled === false) return [];
    const bindings = deviceBindings?.bindings;
    return Array.isArray(bindings)
      ? bindings.filter((binding) => binding?.kind === 'deviceParameter' && binding?.parameterId)
      : [];
  }

    function bindingValueForPatch(binding, patch = {}) {
        if (isTimedButtonBehavior(behavior)) {
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

  function emitDeviceBindingsForPatch(patch = {}) {
    for (const binding of activeDeviceBindings()) {
      const value = bindingValueForPatch(binding, patch);
      if (value === undefined) continue;
      commitDeviceParameter({
        requestId: `surface_${control?._children?.Core?.id ?? 'control'}_${Date.now()}`,
        deviceRole: binding.deviceRole || DEFAULT_DEVICE_ROLE,
        parameterId: binding.parameterId,
        value,
        interactionPhase: patch.dragging === true ? 'continuous' : 'commit',
        dryRun: binding.dryRun !== false,
      });
    }
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
  let isCustomComponent = $derived(String(control?._children?.Core?.controlType ?? '') === 'CustomComponent');
  let customBehaviors = $derived(getCustomBehaviors(control));
  let customChannels = $derived(getCustomValueChannels(control));
  let sliderParts = $derived((resolvedControl ?? control)?._children?.Parts?._children ?? {});
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
  let customHitZones = $derived((previewControl?._children?.HitZones?._children ?? {}));

  let controlWidth = $derived(Math.max(24, numberOr(transform?.width, 100)));
  let controlHeight = $derived(Math.max(24, numberOr(transform?.height, 40)));
  let surfacePadding = $derived(compact ? 0 : 24);
  let fitScale = $derived.by(() => {
    if (!stageWidth || !stageHeight) return 1;
    const usableWidth = Math.max(1, stageWidth - (surfacePadding * 2));
    const usableHeight = Math.max(1, stageHeight - (surfacePadding * 2));
    return clamp(Math.min(usableWidth / controlWidth, usableHeight / controlHeight, MAX_PREVIEW_SCALE), 0.25, MAX_PREVIEW_SCALE);
  });
  let sceneWidth = $derived(controlWidth * fitScale);
  let sceneHeight = $derived(controlHeight * fitScale);
  let sceneLeft = $derived(compact ? Math.max(0, (stageWidth - sceneWidth) / 2) : Math.max(surfacePadding, (stageWidth - sceneWidth) / 2));
  let sceneTop = $derived(compact ? Math.max(0, (stageHeight - sceneHeight) / 2) : Math.max(surfacePadding, (stageHeight - sceneHeight) / 2));
  let previewSession = $derived(session?.enabled === false ? {} : (session ?? {}));
  let isDisabled = $derived(session?.enabled === false || session?.disabled === true);
  let isComboboxControl = $derived(
    String(behavior?.buttonType ?? '').trim().toLowerCase() === 'combobox'
  );
  let comboboxRows = $derived(getValueRows(control));
  let helperLabel = $derived.by(() => {
    if (isCustomComponent) return 'Drag, click, wheel, or use keys to test custom hit zones, behavior modules, and value channels.';
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
    if (isCustomComponent) return 'application';
    if (!behavior) return 'button';
    const family = String(behavior.family ?? 'trigger').trim().toLowerCase();
    const role = String(behavior.role ?? '').trim().toLowerCase();
    const buttonType = String(behavior.buttonType ?? '').trim().toLowerCase();

    if (family === 'range') return isSliderRangeBehavior(behavior) ? 'slider' : 'spinbutton';
    if (buttonType === 'combobox') return 'combobox';
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
    rangeScrub?.end();
    rangeScrub = null;
    sliderScrub?.end();
    sliderScrub = null;
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
      pointerSliderHandle = '';
      pointerCustomHitZone = null;
      pointerCustomStartValues = {};
      keyboardFocusActive = false;
      comboboxOpen = false;
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

  function customSessionValues() {
    return {
      ...seedCustomValues(control),
      ...(session?.customValues ?? {}),
    };
  }

  function formatDebugNumber(value, precision = 3) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(precision) : String(value ?? '');
  }

  function customDebugValue(channel, value) {
    const type = String(channel?.type ?? 'float').toLowerCase();
    if (type === 'bool') return value === true ? 'true' : 'false';
    if (type === 'enum') return String(value ?? channel?.defaultValue ?? '');
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value ?? '');
    const precision = type === 'int' ? 0 : Math.min(3, Math.max(0, Number(channel?.format?.precision ?? 3)));
    const prefix = channel?.format?.prefix ?? '';
    const suffix = channel?.format?.suffix ?? '';
    return `${prefix}${numeric.toFixed(precision)}${suffix}`;
  }

  let customDebugRows = $derived.by(() => {
    if (!isCustomComponent) return [];
    const values = customSessionValues();
    return Object.entries(customChannels ?? {}).map(([name, channel]) => {
      const raw = values?.[name] ?? channel?.currentValue ?? channel?.defaultValue;
      return {
        name,
        label: channel?.label ?? name,
        raw,
        display: customDebugValue(channel, raw),
        normalized: normalizeCustomChannelValue(channel, raw),
      };
    });
  });

  let activeCustomDebug = $derived.by(() => {
    if (!isCustomComponent) return null;
    const activeHitZoneName = pointerCustomHitZone?.name ?? session?.activeCustomHitZone ?? '';
    const activeZone = pointerCustomHitZone?.zone ?? null;
    const activeBehaviorName = activeZone?.targetBehavior ?? session?.activeCustomBehavior ?? '';
    const activeBehavior = customBehaviors?.[activeBehaviorName] ?? customMainBehaviorModule();
    return {
      behavior: activeBehaviorName || activeBehavior?.name || '-',
      hitZone: activeHitZoneName || '-',
      dragMode: activeBehavior?.dragMode ?? 'auto',
      geometry: activeBehavior?.geometry ?? '-',
      active: pointerActive || session?.dragging === true || Boolean(session?.activeCustomHitZone),
    };
  });

  function zoneBoundsPx(zone) {
    const bounds = zone?.bounds ?? zone?._children?.Bounds ?? {};
    const unit = String(bounds.unit ?? 'percent');
    const x = numberOr(bounds.x, 0);
    const y = numberOr(bounds.y, 0);
    const width = numberOr(bounds.width, unit === 'percent' ? 100 : controlWidth);
    const height = numberOr(bounds.height, unit === 'percent' ? 100 : controlHeight);
    return {
      left: unit === 'percent' ? (controlWidth * x) / 100 : x,
      top: unit === 'percent' ? (controlHeight * y) / 100 : y,
      width: unit === 'percent' ? (controlWidth * width) / 100 : width,
      height: unit === 'percent' ? (controlHeight * height) / 100 : height,
    };
  }

  function boundsForFrames(frames = []) {
    if (!frames.length) return { left: 0, top: 0, width: 0, height: 0 };
    const left = Math.min(...frames.map((frame) => frame.left));
    const top = Math.min(...frames.map((frame) => frame.top));
    const right = Math.max(...frames.map((frame) => frame.left + frame.width));
    const bottom = Math.max(...frames.map((frame) => frame.top + frame.height));
    return { left, top, width: right - left, height: bottom - top };
  }

  function zoneOverlayStyle(entry) {
    const frame = entry.frame ?? {};
    return [
      `left:${numberOr(frame.left, 0)}px`,
      `top:${numberOr(frame.top, 0)}px`,
      `width:${Math.max(1, numberOr(frame.width, 0))}px`,
      `height:${Math.max(1, numberOr(frame.height, 0))}px`,
      entry.shape === 'circle' || entry.shape === 'ring' || entry.shape === 'ellipse' ? 'border-radius:999px' : '',
    ].filter(Boolean).join('; ');
  }

  let customHitZoneOverlayEntries = $derived.by(() => {
    if (!isCustomComponent) return [];
    const entries = Object.entries(customHitZones ?? {})
      .filter(([, zone]) => zone?.enabled !== false && zone?.visibleInEditor !== false)
      .map(([name, zone]) => ({
        name,
        zone,
        source: String(zone?.meta?.generatedBy ?? '').trim(),
        generated: zone?.generated === true || zone?.meta?.generated === true,
        shape: String(zone?.shape ?? 'rectangle'),
        frame: zoneBoundsPx(zone),
      }));
    const generatedBySource = new Map();
    const result = [];
    for (const entry of entries) {
      if (entry.generated && entry.source) {
        if (!generatedBySource.has(entry.source)) generatedBySource.set(entry.source, []);
        generatedBySource.get(entry.source).push(entry);
      } else {
        result.push({
          ...entry,
          id: entry.name,
          label: entry.name,
          count: 1,
          summary: entry.zone?.action ?? 'zone',
        });
      }
    }
    for (const [source, sourceEntries] of generatedBySource) {
      if (sourceEntries.length <= 4) {
        for (const entry of sourceEntries) {
          result.push({
            ...entry,
            id: entry.name,
            label: entry.name,
            count: 1,
            summary: source,
          });
        }
        continue;
      }
      result.push({
        id: `generated:${source}`,
        name: source,
        source,
        generated: true,
        grouped: true,
        shape: 'rectangle',
        frame: boundsForFrames(sourceEntries.map((entry) => entry.frame)),
        label: source,
        count: sourceEntries.length,
        summary: `${sourceEntries.length} generated zones`,
      });
    }
    return result;
  });

  function customMainChannelName() {
    return customChannels?.mainValue ? 'mainValue' : (Object.keys(customChannels ?? {})[0] ?? '');
  }

  function customMainBehaviorModule() {
    const channelName = customMainChannelName();
    return Object.values(customBehaviors ?? {}).find((entry) => entry?.valueChannel === channelName) ?? null;
  }

  function customChannelForHitZone(hitZoneEntry = null) {
    const zone = hitZoneEntry?.zone ?? null;
    const behaviorModule = customBehaviors?.[zone?.targetBehavior] ?? null;
    const channelName = zone?.targetValueChannel ?? behaviorModule?.valueChannel ?? customMainChannelName();
    return { channelName, channel: customChannels?.[channelName] ?? null, behaviorModule };
  }

  function patchCustomInteraction(hitZoneEntry, event, extraPatch = {}) {
    const rect = hitboxElement?.getBoundingClientRect?.();
    const patch = resolveCustomInteractionPatch(control, session, hitZoneEntry, {
      rect,
      clientX: event?.clientX ?? rect?.left ?? 0,
      clientY: event?.clientY ?? rect?.top ?? 0,
      startClientX: pointerDownPoint?.x,
      startClientY: pointerDownPoint?.y,
      startValues: pointerCustomStartValues,
      fine: event?.shiftKey === true,
      coarse: event?.ctrlKey === true || event?.metaKey === true,
    });
    if (!Object.keys(patch).length) return;
    patchSession({
      ...patch,
      ...extraPatch,
    });
  }

  function updateCustomDragFromPointer(event) {
    if (!pointerCustomHitZone) return;
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return;
    const action = String(pointerCustomHitZone?.zone?.action ?? '').trim().toLowerCase();
    if (action.startsWith('arpeggiator')) {
      patchCustomInteraction(pointerCustomHitZone, event, {
        hover: true,
        pressed: true,
        dragging: true,
      });
      return;
    }
    const { channelName, channel, behaviorModule } = customChannelForHitZone(pointerCustomHitZone);
    if (!channel) return;
    const secondaryChannelName = pointerCustomHitZone?.zone?.targetValueChannelY ?? pointerCustomHitZone?.zone?.targetYValueChannel ?? '';
    const secondaryChannel = customChannels?.[secondaryChannelName] ?? null;
    const behaviorType = String(behaviorModule?.type ?? '').trim().toLowerCase();
    const behaviorGeometry = String(behaviorModule?.geometry ?? '').trim().toLowerCase();
    if (secondaryChannel && (behaviorType.includes('xy') || behaviorGeometry === 'xy' || behaviorGeometry === 'grid')) {
      const localX = clamp(event.clientX - rect.left, 0, rect.width);
      const localY = clamp(event.clientY - rect.top, 0, rect.height);
      const xNormalized = clamp(localX / Math.max(1, rect.width), 0, 1);
      const yNormalized = clamp(1 - (localY / Math.max(1, rect.height)), 0, 1);
      const nextX = denormalizeCustomChannelValue(channel, xNormalized);
      const nextY = denormalizeCustomChannelValue(secondaryChannel, yNormalized);
      patchSession({
        customValues: {
          ...customSessionValues(),
          [channelName]: nextX,
          [secondaryChannelName]: nextY,
        },
        activeCustomBehavior: pointerCustomHitZone?.zone?.targetBehavior ?? '',
        activeCustomHitZone: pointerCustomHitZone?.name ?? '',
        dragging: true,
      });
      return;
    }
    const normalized = resolveCustomNormalizedFromPoint(behaviorModule, rect, event.clientX, event.clientY, {
      startClientX: pointerDownPoint?.x,
      startClientY: pointerDownPoint?.y,
      startNormalized: normalizeCustomChannelValue(channel, pointerCustomStartValues?.[channelName] ?? customSessionValues()?.[channelName] ?? channel?.defaultValue),
      fine: event.shiftKey === true,
      coarse: event.ctrlKey === true || event.metaKey === true,
    });
    const nextValue = denormalizeCustomChannelValue(channel, normalized);
    patchSession({
      customValues: {
        ...customSessionValues(),
        [channelName]: nextValue,
      },
      customNormalizedValue: channelName === 'mainValue' ? normalized : session?.customNormalizedValue,
      valueOverrideEnabled: channelName === 'mainValue',
      valueOverride: channelName === 'mainValue' ? nextValue : session?.valueOverride,
      activeCustomBehavior: pointerCustomHitZone?.zone?.targetBehavior ?? '',
      activeCustomHitZone: pointerCustomHitZone?.name ?? '',
      dragging: true,
    });
  }

  function adjustCustomMainValue(direction = 1) {
    const channelName = customMainChannelName();
    const channel = customChannels?.[channelName] ?? null;
    if (!channel) return;
    const currentValues = customSessionValues();
    const currentValue = currentValues?.[channelName] ?? channel?.defaultValue ?? 0;
    const nextValue = snapCustomChannelValue(channel, numberOr(currentValue, 0) + (direction * numberOr(channel?.step, 0.01)));
    patchSession({
      customValues: {
        ...currentValues,
        [channelName]: nextValue,
      },
      customNormalizedValue: normalizeCustomChannelValue(channel, nextValue),
      valueOverrideEnabled: channelName === 'mainValue',
      valueOverride: channelName === 'mainValue' ? nextValue : session?.valueOverride,
      focused: true,
      hover: true,
    });
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

  function currentComboboxValue() {
    const rows = comboboxRows;
    if (session?.valueOverrideEnabled === true) return session?.valueOverride;
    return behavior?.defaultValue
      ?? rows.find((row) => row?.selectedByDefault === true)?.internalValue
      ?? rows[0]?.internalValue
      ?? rows[0]?.id
      ?? '';
  }

  function rowValue(row) {
    return row?.internalValue ?? row?.id ?? '';
  }

  function rowLabel(row) {
    return row?.displayText ?? row?.label ?? row?.internalValue ?? row?.id ?? '';
  }

  function selectComboboxRow(row) {
    if (!row) return;
    patchSession({
      valueOverrideEnabled: true,
      valueOverride: rowValue(row),
      checked: false,
      mixed: false,
      focused: true,
      hover: true,
      pressed: false,
    });
    comboboxOpen = false;
    pulseCommitState();
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

  function sliderPreviewScale(rect = null) {
    if (!rect) return 1;
    const widthScale = rect.width / Math.max(1, controlWidth);
    const heightScale = rect.height / Math.max(1, controlHeight);
    return clamp(Math.min(widthScale || 1, heightScale || 1), 0.01, 100);
  }

  function sliderTrackThickness() {
    const trackLayout = sliderParts?.bodyTrackBase?._children?.Layout ?? null;
    return Math.max(4, numberOr(trackLayout?.height, 10));
  }

  function sliderMajorTickLength() {
    const tickLayout = sliderParts?.tickMajor?._children?.Layout ?? null;
    return Math.max(0, numberOr(tickLayout?.height, numberOr(behavior?.majorTickLength, 12)));
  }

  function sliderPointerSize(role = 'current') {
    const partName = role === 'start'
      ? 'pointerStart'
      : role === 'end'
        ? 'pointerEnd'
        : 'pointerCurrent';
    const fallback = role === 'current' ? 20 : 18;
    const pointerLayout = sliderParts?.[partName]?._children?.Layout ?? null;
    return Math.max(8, numberOr(pointerLayout?.width, numberOr(pointerLayout?.height, fallback)));
  }

  function sliderHandleRoles() {
    return getSliderValueMode(behavior) === 'range'
      ? ['start', 'end']
      : (getSliderValueMode(behavior) === 'band' ? ['start', 'current', 'end'] : ['current']);
  }

  function sliderHandlePoint(role = 'current', rect = null) {
    if (!rect) return null;

    const scale = sliderPreviewScale(rect);
    const trackThickness = sliderTrackThickness() * scale;
    const pointerSize = sliderPointerSize(role) * scale;
    const showReadout = behavior?.showValueReadout !== false;
    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    const span = max - min;
    const normalized = span > 0
      ? clamp((currentSliderRoleValue(role) - min) / span, 0, 1)
      : 0;

    if (String(behavior?.geometry ?? 'linear').trim().toLowerCase() === 'circular') {
      const maxPointerSize = Math.max(...sliderHandleRoles().map((handleRole) => sliderPointerSize(handleRole))) * scale;
      const metrics = resolveCircularTrackMetrics(rect.width, rect.height, {
        trackThickness,
        pointerSize: maxPointerSize,
        majorTickLength: sliderMajorTickLength() * scale,
        hasReadout: showReadout,
        circularDiameter: numberOr(behavior?.circularDiameter, 0) * scale,
      });
      return resolveCircularPoint(
        rect.width,
        rect.height,
        sliderValueToAngle(behavior, currentSliderRoleValue(role)),
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

  function sliderValueForPoint(event) {
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return currentSliderRoleValue(currentSliderActiveHandle());
    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    // A live scrub means a linear drag is in progress; circular tracks (and
    // one-shot hit tests like handle picking) use the pure geometry mapping.
    const normalized = sliderScrub
      ? (sliderScrub.move(scrubSample(event)) ?? sliderScrub.value)
      : resolveSliderNormalizedFromPoint(behavior, rect, event.clientX, event.clientY);
    return snapSliderValue(behavior, min + ((max - min) * normalized));
  }

  function pickNearestSliderHandle(event) {
    const values = currentSliderValues();
    const roles = sliderHandleRoles();
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

  function pickDirectSliderHandle(event) {
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return '';

    const scale = sliderPreviewScale(rect);
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    let nearestRole = '';
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const role of sliderHandleRoles()) {
      const point = sliderHandlePoint(role, rect);
      if (!point) continue;

      const hitRadius = Math.max((sliderPointerSize(role) * scale) / 2, 12);
      const distance = Math.hypot(localX - point.x, localY - point.y);
      if (distance > hitRadius || distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearestRole = role;
    }

    return nearestRole;
  }

  function setSliderRoleValue(role = 'current', nextValue = 0, extraPatch = {}) {
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
    patchSession({
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
    if (buttonType === 'combobox') {
      if (!valueRows.length) return;
      comboboxOpen = !comboboxOpen;
      patchSession({
        focused: true,
        hover: true,
        pressed: false,
      });
      return;
    }
    if (buttonType === 'radio' || role === 'radio') {
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

  function updateSliderRangeFromPointer(event, roleOverride = '') {
    if (!isRangeControl()) return;
    if (isSliderControl()) {
      const role = String(roleOverride || pointerSliderHandle || currentSliderActiveHandle()).trim().toLowerCase();
      setSliderRoleValue(role, sliderValueForPoint(event), { dragging: true });
      return;
    }

    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return;

    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    const normalized = sliderScrub
      ? (sliderScrub.move(scrubSample(event)) ?? sliderScrub.value)
      : normalizedRangePointerValue(behavior, rect, event.clientX, event.clientY);
    setRangeValue(min + ((max - min) * normalized));
  }

  function updateScrubRangeFromPointer(event) {
    if (!isRangeControl() || !rangeScrub) return;
    const next = rangeScrub.move(scrubSample(event));
    if (next === null) return;
    setRangeValue(next, { dragging: true });
  }

  function maybeStartRangeDrag(event) {
    if (!isRangeControl() || draggingRange || isSliderRangeBehavior(behavior) || behavior?.dragEnabled !== true) return false;

    const dx = Math.abs(event.clientX - pointerDownPoint.x);
    const dy = Math.abs(event.clientY - pointerDownPoint.y);
    if (Math.max(dx, dy) < 5) return false;

    draggingRange = true;
    // Anchor at the pointer-down point, not the threshold crossing, so the
    // first fed move spans the whole distance travelled — same feel as before.
    rangeScrub = createRangeScrub(behavior, pointerStartValue);
    rangeScrub.begin({ x: pointerDownPoint.x, y: pointerDownPoint.y });
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
    if (isCustomComponent) {
      if (isDisabled) return;
      event.preventDefault();
      event.stopPropagation();
      const baseDirection = event.deltaY < 0 ? 1 : -1;
      adjustCustomMainValue(baseDirection * (isCustomMouseDirectionReversed(customMainBehaviorModule()) ? -1 : 1));
      pulseCommitState();
      return;
    }

    if (!isRangeControl() || behavior?.wheelEnabled !== true || isDisabled) return;

    event.preventDefault();
    event.stopPropagation();
    const direction = resolveMouseDirection(behavior, event.deltaY < 0 ? 1 : -1);
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

  function handleDoubleClick(event) {
    if (isDisabled || !isCustomComponent) return;
    const targetControl = resolvedControl ?? control;
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return;
    const zone = resolveCustomHitZoneAtPoint(targetControl, rect, event.clientX, event.clientY, customSessionValues())?.zone;
    if (!zone) return;
    const channels = [zone.targetValueChannel, zone.targetValueChannelY, zone.targetYValueChannel].filter(Boolean);
    if (!channels.length) return;
    const nextValues = resetCustomChannelToDefault(targetControl, channels, customSessionValues());
    const extra = {};
    if (channels.includes('mainValue')) {
      const mainChannel = getCustomValueChannels(targetControl)?.mainValue;
      if (mainChannel) {
        extra.customNormalizedValue = normalizeCustomChannelValue(mainChannel, nextValues.mainValue);
        extra.valueOverrideEnabled = true;
        extra.valueOverride = nextValues.mainValue;
      }
    }
    patchSession({ customValues: nextValues, ...extra });
  }

  function handlePointerDown(event) {
    if (isDisabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    lastInputMode = 'pointer';
    keyboardFocusActive = false;
    pointerActive = true;
    if (!isComboboxControl) comboboxOpen = false;
    pointerDownPoint = { x: event.clientX, y: event.clientY };

    if (isCustomComponent) {
      const rect = hitboxElement?.getBoundingClientRect?.();
      pointerCustomHitZone = resolveCustomHitZoneAtPoint(resolvedControl ?? control, rect, event.clientX, event.clientY, customSessionValues());
      pointerCustomStartValues = { ...customSessionValues() };
      const action = String(pointerCustomHitZone?.zone?.action ?? '').trim().toLowerCase();
      const isDragAction = action === 'dragvalue' || action === 'scrubvalue' || action.startsWith('arpeggiator') || action === '';
      if (isDragAction) {
        patchCustomInteraction(pointerCustomHitZone, event, {
          hover: true,
          pressed: true,
          dragging: true,
        });
        updateCustomDragFromPointer(event);
      } else {
        patchSession({
          hover: true,
          pressed: true,
          dragging: false,
          activeCustomBehavior: pointerCustomHitZone?.zone?.targetBehavior ?? '',
          activeCustomHitZone: pointerCustomHitZone?.name ?? '',
        });
      }
      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', handleWindowPointerUp);
      return;
    }

    pointerStartValue = isSliderControl() ? currentSliderRoleValue(currentSliderActiveHandle()) : currentRangeValue();
    draggingRange = isRangeControl() && (isSliderControl() || isSliderRangeBehavior(behavior));
    pointerDownZone = isRangeControl()
      ? resolveRangeZone(behavior, hitboxElement?.getBoundingClientRect?.(), event.clientX, event.clientY)
      : '';
    pointerSliderHandle = '';
    sliderScrub = null;

    let nextSliderHandle = '';
    if (isSliderControl()) {
      const directHandle = pickDirectSliderHandle(event);
      const clickMode = String(behavior?.trackClickMode ?? 'moveNearestHandle').trim().toLowerCase();
      nextSliderHandle = directHandle || (
        clickMode === 'moveactivehandle'
          ? currentSliderActiveHandle()
          : pickNearestSliderHandle(event)
      );
      pointerSliderHandle = nextSliderHandle;
      patchSession({
        activeHandle: nextSliderHandle,
        valueInputRole: nextSliderHandle,
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
      const rect = hitboxElement?.getBoundingClientRect?.();
      if (rect && (!isSliderControl() || isLinearSliderGeometry(behavior))) {
        sliderScrub = isSliderControl() ? createSliderTrackScrub(behavior) : createRangeTrackScrub(behavior);
        sliderScrub.begin(scrubSample(event), { bounds: rect, jumpToPointer: true });
      }
      updateSliderRangeFromPointer(event, nextSliderHandle);
    }
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  }

  function handleWindowPointerMove(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    if (isCustomComponent) {
      if (!pointerActive || isDisabled) return;
      updateCustomDragFromPointer(event);
      return;
    }

    if (!pointerActive || isDisabled || !isRangeControl()) return;

    if (isSliderControl() || isSliderRangeBehavior(behavior)) {
      if (!draggingRange) return;
      updateSliderRangeFromPointer(event, pointerSliderHandle);
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
    event.preventDefault?.();
    event.stopPropagation?.();
    const inside = isPointInsideHitbox(event.clientX, event.clientY);

    if (isCustomComponent) {
      const action = String(pointerCustomHitZone?.zone?.action ?? '').trim().toLowerCase();
      if (inside && !isDisabled && action && action !== 'dragvalue' && action !== 'scrubvalue') {
        patchCustomInteraction(pointerCustomHitZone, event, {
          hover: inside,
          pressed: false,
          dragging: false,
          inputModality: 'pointer',
        });
      } else {
        patchSession({
          hover: inside,
          pressed: false,
          dragging: false,
          inputModality: 'pointer',
        });
      }
      pulseCommitState();
      pointerActive = false;
      draggingRange = false;
      pointerDownZone = '';
      pointerSliderHandle = '';
      pointerCustomHitZone = null;
      pointerCustomStartValues = {};
      removeWindowListeners();
      return;
    }

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
    pointerSliderHandle = '';
    pointerCustomHitZone = null;
    pointerCustomStartValues = {};
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
    comboboxOpen = false;
    patchSession({ focused: false, pressed: false, dragging: false, valueInputActive: false });
    pointerActive = false;
    draggingRange = false;
    pointerSliderHandle = '';
    pointerCustomHitZone = null;
    removeWindowListeners();
  }

  function handleKeyDown(event) {
    if (isDisabled) return;
    if (isCustomComponent) {
      lastInputMode = 'keyboard';
      keyboardFocusActive = true;
      if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'Home') {
          const channelName = customMainChannelName();
          const channel = customChannels?.[channelName] ?? null;
          if (channel) {
            const nextValue = snapCustomChannelValue(channel, channel?.min ?? 0);
            patchSession({
              customValues: { ...customSessionValues(), [channelName]: nextValue },
              customNormalizedValue: 0,
              valueOverrideEnabled: channelName === 'mainValue',
              valueOverride: channelName === 'mainValue' ? nextValue : session?.valueOverride,
              focused: true,
              hover: true,
            });
          }
          return;
        }
        if (event.key === 'End') {
          const channelName = customMainChannelName();
          const channel = customChannels?.[channelName] ?? null;
          if (channel) {
            const nextValue = snapCustomChannelValue(channel, channel?.max ?? 1);
            patchSession({
              customValues: { ...customSessionValues(), [channelName]: nextValue },
              customNormalizedValue: 1,
              valueOverrideEnabled: channelName === 'mainValue',
              valueOverride: channelName === 'mainValue' ? nextValue : session?.valueOverride,
              focused: true,
              hover: true,
            });
          }
          return;
        }
        adjustCustomMainValue(event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1);
      }
      return;
    }

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
    if (isCustomComponent) {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        patchSession({ focused: true, hover: true, pressed: false });
      }
      return;
    }

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

<div class="test-surface" class:compact>
  {#if !compact}
    <div class="surface-header">
      <div class="surface-title">Live Test Surface</div>
      <div class="surface-subtitle">{helperLabel}</div>
    </div>
  {/if}

  {#if !compact && isCustomComponent && customDebugRows.length}
    <div class="custom-debug-strip" class:active={activeCustomDebug?.active}>
      <div class="debug-state">
        <strong>{activeCustomDebug?.active ? 'Live input' : 'Ready'}</strong>
        <span>zone {activeCustomDebug?.hitZone ?? '-'}</span>
        <span>{activeCustomDebug?.geometry ?? '-'} · {activeCustomDebug?.dragMode ?? 'auto'}</span>
      </div>
      <div class="debug-channels">
        {#each customDebugRows as row (row.name)}
          <div class="debug-channel">
            <strong>{row.label}</strong>
            <span>{row.display}</span>
            <em>{formatDebugNumber(row.normalized)}</em>
          </div>
        {/each}
      </div>
    </div>
  {/if}

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
          aria-expanded={isComboboxControl ? comboboxOpen : undefined}
          tabindex={isDisabled ? undefined : 0}
          onpointerenter={handlePointerEnter}
          onpointerleave={handlePointerLeave}
          onpointerdown={handlePointerDown}
          ondblclick={handleDoubleClick}
          onwheel={handleWheel}
          onfocus={handleFocus}
          onblur={handleBlur}
          onkeydown={handleKeyDown}
          onkeyup={handleKeyUp}
        >
          <CanvasControl
            control={previewControl}
            sourceControl={control}
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
          {#if isCustomComponent && customHitZoneOverlayEntries.length}
            <div class="custom-zone-overlay" aria-hidden="true">
              {#each customHitZoneOverlayEntries as entry (entry.id)}
                <span
                  class="custom-zone-frame"
                  class:generated={entry.generated}
                  class:grouped={entry.grouped}
                  class:active={entry.name === pointerCustomHitZone?.name || entry.name === session?.activeCustomHitZone}
                  style={zoneOverlayStyle(entry)}
                >
                  <em>{entry.label}</em>
                  {#if entry.count > 1}<strong>{entry.count}</strong>{/if}
                </span>
              {/each}
            </div>
          {/if}
        </div>
        {#if isComboboxControl && comboboxOpen && comboboxRows.length}
          <div
            class="combobox-menu"
            style="top:{controlHeight + 4}px; width:{controlWidth}px;"
            role="listbox"
          >
            {#each comboboxRows as row (row.id ?? row.internalValue ?? row.displayText)}
              {@const selected = String(rowValue(row)) === String(currentComboboxValue())}
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
                  selectComboboxRow(row);
                }}
              >
                {rowLabel(row)}
              </button>
            {/each}
          </div>
        {/if}
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

  .test-surface.compact {
    gap: 0;
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

  .custom-debug-strip {
    display: grid;
    grid-template-columns: minmax(130px, 0.7fr) minmax(0, 1.8fr);
    gap: 8px;
    align-items: stretch;
    padding: 8px;
    border: 1px solid #2F3B40;
    border-radius: 8px;
    background: #171D20;
  }

  .custom-debug-strip.active {
    border-color: rgba(45, 218, 204, 0.62);
    background: #152224;
  }

  .debug-state,
  .debug-channel {
    min-width: 0;
    border: 1px solid #28343A;
    border-radius: 6px;
    background: rgba(8, 12, 14, 0.46);
  }

  .debug-state {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 8px;
  }

  .debug-state strong,
  .debug-channel strong {
    font-size: 10px;
    line-height: 1.2;
    color: #E2F7F4;
  }

  .debug-state span {
    overflow: hidden;
    color: #8CA1A8;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .debug-channels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    gap: 6px;
    min-width: 0;
  }

  .debug-channel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 6px;
    padding: 6px 7px;
  }

  .debug-channel strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .debug-channel span {
    color: #FFFFFF;
    font-size: 11px;
    font-weight: 700;
    text-align: right;
  }

  .debug-channel em {
    grid-column: 1 / -1;
    color: #75D9D0;
    font-size: 10px;
    font-style: normal;
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

  .test-surface.compact .surface-stage {
    min-height: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .test-surface.compact .stage-grid {
    display: none;
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
    touch-action: none;
    overscroll-behavior: contain;
    user-select: none;
    -webkit-user-select: none;
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

  .custom-zone-overlay {
    position: absolute;
    inset: 0;
    z-index: 1000;
    pointer-events: none;
  }

  .custom-zone-frame {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid rgba(45, 218, 204, 0.62);
    background: rgba(45, 218, 204, 0.08);
    color: #BFF6F1;
    min-width: 10px;
    min-height: 10px;
  }

  .custom-zone-frame.generated {
    border-color: rgba(229, 192, 107, 0.58);
    background: rgba(229, 192, 107, 0.08);
    color: #F2D99A;
  }

  .custom-zone-frame.grouped {
    border-style: dashed;
    background: rgba(229, 192, 107, 0.12);
  }

  .custom-zone-frame.active {
    border-color: rgba(255, 255, 255, 0.95);
    background: rgba(45, 218, 204, 0.18);
  }

  .custom-zone-frame em,
  .custom-zone-frame strong {
    position: absolute;
    left: 3px;
    top: 3px;
    max-width: calc(100% - 6px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: 3px;
    background: rgba(10, 15, 18, 0.82);
    padding: 2px 4px;
    font-size: 9px;
    font-style: normal;
    line-height: 1;
  }

  .custom-zone-frame strong {
    left: auto;
    right: 3px;
    color: #FFFFFF;
  }

  .combobox-menu {
    position: absolute;
    left: 0;
    z-index: 40;
    max-height: 184px;
    overflow: auto;
    padding: 4px;
    border: 1px solid #4A4A4A;
    border-radius: 6px;
    background: #202020;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.42);
  }

  .combobox-menu button {
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

  .combobox-menu button:hover,
  .combobox-menu button.selected {
    background: rgba(91, 155, 213, 0.24);
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
