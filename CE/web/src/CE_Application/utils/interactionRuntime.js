import { deepClone } from './deepClone.js';
import { getEnumNormalizedValue, normalizeEnumValues, resolveEnumDefaultValue } from './enumBehavior.js';
import { getCurrentRangeValue, getRangeMax, getRangeMin, resolveRangeDisplayValue, snapRangeValue } from './rangeBehavior.js';
import {
  formatSliderNumericValue,
  formatSliderReadout,
  getSliderActiveHandle,
  getSliderDisplayValue,
  getSliderGeometry,
  getSliderLegalRangeForHandle,
  getSliderNormalizedValues,
  getSliderResolvedValues,
  getSliderValueMode,
  isSliderBehavior,
  isSliderDirty,
} from './sliderBehavior.js';
import { sliderValueToAngle } from './sliderGeometry.js';

function getNodeChild(node, key) {
  return node?._children?.[key];
}

function getValueRows(control) {
  const rows = getNodeChild(control, 'Value')?.rows;
  return Array.isArray(rows) ? rows : [];
}

function hasCheckedStateSignal(signals) {
  return signals?.checked === true || signals?.selectionActive === true;
}

function findDefaultRow(rows = []) {
  return rows.find((row) => row?.selectedByDefault === true && row?.enabled !== false)
    ?? rows.find((row) => row?.enabled !== false)
    ?? null;
}

function findRowByInternalValue(rows = [], value) {
  return rows.find((row) => String(row?.internalValue ?? row?.id ?? '') === String(value ?? ''))
    ?? null;
}

function isRadioGroupControl(control) {
  return String(getNodeChild(control, 'Behavior')?.buttonType ?? '').trim().toLowerCase() === 'radio';
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

const KNOWN_STATE_PRECEDENCE = {
  hover: 10,
  focused: 20,
  checked: 30,
  mixed: 40,
  dragging: 50,
  pressed: 60,
  pending: 70,
  executed: 80,
  disabled: 90,
};

function isNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRange(value, min, max) {
  const span = max - min;
  if (!Number.isFinite(span) || Math.abs(span) < 0.000001) return 0;
  return (value - min) / span;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easingToCss(name) {
  switch (String(name ?? 'outQuad')) {
    case 'linear': return 'linear';
    case 'inQuad': return 'cubic-bezier(0.55, 0.085, 0.68, 0.53)';
    case 'outQuad': return 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    case 'inOutQuad': return 'cubic-bezier(0.455, 0.03, 0.515, 0.955)';
    case 'outCubic': return 'cubic-bezier(0.215, 0.61, 0.355, 1)';
    default: return 'ease';
  }
}

function treeValueAtPath(node, path) {
  if (!node || !path) return undefined;
  const parts = String(path).split('.');
  let current = node;
  for (const part of parts) {
    if (current?._children?.[part] !== undefined) {
      current = current._children[part];
      continue;
    }
    if (current?.[part] !== undefined) {
      current = current[part];
      continue;
    }
    return undefined;
  }
  return current;
}

function setTreeValueAtPath(node, path, value) {
  if (!node || !path) return;
  const parts = String(path).split('.');
  let current = node;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (current?._children?.[key] !== undefined) {
      current = current._children[key];
      continue;
    }
    if (current?.[key] !== undefined) {
      current = current[key];
      continue;
    }
    return;
  }

  const finalKey = parts[parts.length - 1];
  if (current?._children?.[finalKey] !== undefined) {
    current._children[finalKey] = value;
  } else {
    current[finalKey] = value;
  }
}

function evaluateBindingSource(binding, signals) {
  switch (binding?.source) {
    case 'value.raw':
      return signals.valueRaw;
    case 'value.normalized':
      return signals.valueNormalized;
    case 'value.start.raw':
      return signals.startValueRaw;
    case 'value.current.raw':
      return signals.currentValueRaw;
    case 'value.end.raw':
      return signals.endValueRaw;
    case 'value.start.normalized':
      return signals.startValueNormalized;
    case 'value.current.normalized':
      return signals.currentValueNormalized;
    case 'value.end.normalized':
      return signals.endValueNormalized;
    case 'value.display':
      return signals.valueDisplay;
    case 'value.bool':
      return signals.checked;
    case 'value.enum':
      return signals.valueEnum;
    case 'state.activeHandleIsStart':
      return signals.activeHandle === 'start';
    case 'state.activeHandleIsCurrent':
      return signals.activeHandle === 'current';
    case 'state.activeHandleIsEnd':
      return signals.activeHandle === 'end';
    case 'state.hover':
      return signals.hover;
    case 'state.pressed':
      return signals.pressed;
    case 'state.focused':
      return signals.focused;
    case 'state.dragging':
      return signals.dragging;
    case 'state.disabled':
      return signals.disabled;
    case 'state.checked':
      return hasCheckedStateSignal(signals);
    default:
      return undefined;
  }
}

function resolveBindingValue(binding, sourceValue) {
  if (binding?.mapMode === 'direct') {
    return sourceValue;
  }

  if (binding?.mapMode === 'boolean') {
    const boolValue = !!sourceValue;
    let resolved = boolValue ? binding.trueValue : binding.falseValue;
    if (binding?.invert) resolved = boolValue ? binding.falseValue : binding.trueValue;
    return resolved;
  }

  if (binding?.mapMode === 'enum') {
    const enumMap = binding?.enumMap ?? {};
    return enumMap?.[String(sourceValue ?? '')];
  }

  let numeric = Number(sourceValue);
  if (!Number.isFinite(numeric)) numeric = numberOr(binding?.inputMin, 0);

  let inputMin = numberOr(binding?.inputMin, 0);
  let inputMax = numberOr(binding?.inputMax, 1);
  if (binding?.invert) {
    const flippedMin = inputMax;
    inputMax = inputMin;
    inputMin = flippedMin;
  }

  const normalized = normalizeRange(numeric, inputMin, inputMax);
  let resolved = numberOr(binding?.outputMin, 0)
    + (numberOr(binding?.outputMax, 100) - numberOr(binding?.outputMin, 0)) * normalized;

  if (binding?.clamp !== false) {
    const min = Math.min(numberOr(binding?.outputMin, 0), numberOr(binding?.outputMax, 100));
    const max = Math.max(numberOr(binding?.outputMin, 0), numberOr(binding?.outputMax, 100));
    resolved = clamp(resolved, min, max);
  }
  if (binding?.round === true) {
    resolved = Math.round(resolved);
  }
  return resolved;
}

function stateSignalValue(key, signals) {
  switch (key) {
    case 'hover': return signals.hover;
    case 'pressed': return signals.pressed;
    case 'focused': return signals.focused;
    case 'dragging': return signals.dragging;
    case 'disabled': return signals.disabled;
    case 'checked': return hasCheckedStateSignal(signals);
    case 'mixed': return signals.mixed;
    case 'value': return signals.valueRaw;
    case 'valueNormalized': return signals.valueNormalized;
    case 'valueEnum': return signals.valueEnum;
    case 'activeHandle': return signals.activeHandle;
    default: return signals[key];
  }
}

function evaluateState(state, signals) {
  if (!state || state.enabled === false) return false;
  const when = state.when ?? {};
  return Object.entries(when).every(([key, expected]) => {
    const actual = stateSignalValue(key, signals);
    if (Array.isArray(expected)) return expected.includes(actual);
    return actual === expected;
  });
}

function applyPatchMap(target, patchMap = {}) {
  for (const [path, value] of Object.entries(patchMap ?? {})) {
    setTreeValueAtPath(target, path, deepClone(value));
  }
}

function applyStatePatches(control, state, { skipComponentPatch = false } = {}) {
  const patches = state?.patches ?? {};
  if (!skipComponentPatch) {
    applyPatchMap(control, patches.component);
  }
  const partsSection = getNodeChild(control, 'Parts');
  for (const [partName, patchMap] of Object.entries(patches.parts ?? {})) {
    const partNode = partsSection?._children?.[partName];
    if (!partNode) continue;
    applyPatchMap(partNode, patchMap);
  }
}

export function resolveStateScopedControl(control, stateName = '') {
  if (!control || !stateName) return control;

  const state = getNodeChild(control, 'States')?._children?.[stateName];
  if (!state) return control;

  const resolved = deepClone(control);
  applyStatePatches(resolved, state, { skipComponentPatch: isRadioGroupControl(control) });
  const resolvedValue = getNodeChild(resolved, 'Value');
  if (resolvedValue) {
    resolvedValue.__segmentPreviewState = stateName;
  }
  return resolved;
}

function buildTransitionCatalog(control, previewSession) {
  const animations = getNodeChild(control, 'Animations');
  const enabled = animations?.enabled !== false && previewSession?.animationsEnabled !== false;
  const rootTransitions = new Map();
  const partTransitions = new Map();
  if (!enabled) {
    return { enabled: false, rootTransitions, partTransitions };
  }

  for (const animation of Object.values(animations?._children ?? {})) {
    if (!animation || animation.enabled === false) continue;
    const transition = `${numberOr(animation.duration, 120)}ms ${easingToCss(animation.easing)} ${numberOr(animation.delay, 0)}ms`;
    for (const target of animation.targets ?? []) {
      const path = String(target?.path ?? '');
      if (!path) continue;
      const propertySet = new Set(target?.properties ?? []);
      if (path.startsWith('Parts.')) {
        const [, partName, ...rest] = path.split('.');
        if (!partName) continue;
        const bucket = partTransitions.get(partName) ?? { transform: null, opacity: null, size: null };
        if (rest.join('.') === 'Layout.x' || rest.join('.') === 'Layout.y' || rest.join('.') === 'Layout.offsetX' || rest.join('.') === 'Layout.offsetY' || rest.join('.') === 'Layout.rotation' || rest.join('.') === 'Layout.scale' || propertySet.has('transform')) {
          bucket.transform = transition;
        }
        if (rest.join('.') === 'opacity' || propertySet.has('opacity')) {
          bucket.opacity = transition;
        }
        if (rest.join('.') === 'Layout.width' || rest.join('.') === 'Layout.height' || propertySet.has('size')) {
          bucket.size = transition;
        }
        partTransitions.set(partName, bucket);
      } else {
        if (path === 'Transform.scale' || path === 'Transform.rotation' || propertySet.has('transform')) {
          rootTransitions.set('transform', transition);
        }
        if (path === 'Transform.opacity' || propertySet.has('opacity')) {
          rootTransitions.set('opacity', transition);
        }
      }
    }
  }

  return { enabled: true, rootTransitions, partTransitions };
}

function createEmptyRuntime(signals = {}) {
  return {
    signals,
    activeStates: [],
    transitions: {
      enabled: false,
      rootTransitions: new Map(),
      partTransitions: new Map(),
    },
  };
}

export function serializeInteractionRuntime(runtime = {}) {
  const rootTransitions = Object.fromEntries(runtime?.transitions?.rootTransitions?.entries?.() ?? []);
  const partTransitions = Object.fromEntries(runtime?.transitions?.partTransitions?.entries?.() ?? []);

  return {
    signals: runtime?.signals ?? {},
    activeStates: Array.isArray(runtime?.activeStates) ? [...runtime.activeStates] : [],
    transitions: {
      enabled: runtime?.transitions?.enabled === true,
      rootTransitions,
      partTransitions,
    },
  };
}

function resolveSliderInteractionContext(control, previewSession = {}) {
  const core = getNodeChild(control, 'Core');
  const behavior = getNodeChild(control, 'Behavior');
  const values = getSliderResolvedValues(behavior, previewSession);
  const normalizedValues = getSliderNormalizedValues(behavior, previewSession);
  const geometry = getSliderGeometry(behavior);
  const valueMode = getSliderValueMode(behavior);
  const activeHandle = getSliderActiveHandle(behavior, previewSession);
  const legalRange = getSliderLegalRangeForHandle(behavior, previewSession, activeHandle);
  const primaryValue = values?.[activeHandle] ?? values.current;
  const primaryNormalized = normalizedValues?.[activeHandle] ?? normalizedValues.current;
  const startAngle = sliderValueToAngle(behavior, values.start);
  const currentAngle = sliderValueToAngle(behavior, values.current);
  const endAngle = sliderValueToAngle(behavior, values.end);
  const direction = String(behavior?.direction ?? '').trim().toLowerCase();
  const crossesSeam = geometry === 'circular'
    && behavior?.allowWrapAround === true
    && (
      (direction === 'ccw' && normalizedValues.end > normalizedValues.start)
      || (direction !== 'ccw' && normalizedValues.end < normalizedValues.start)
    );

  return {
    family: 'range',
    role: 'slider',
    valueType: String(behavior?.valueType ?? 'float'),
    geometry,
    valueMode,
    activeHandle,
    primaryRole: activeHandle,
    valueRaw: primaryValue,
    valueDisplay: formatSliderReadout(behavior, previewSession),
    valueInputDisplay: getSliderDisplayValue(behavior, previewSession),
    valueEnum: '',
    valueNormalized: primaryNormalized,
    startValueRaw: values.start,
    currentValueRaw: values.current,
    endValueRaw: values.end,
    startValueNormalized: normalizedValues.start,
    currentValueNormalized: normalizedValues.current,
    endValueNormalized: normalizedValues.end,
    rangeSpan: Math.abs(values.end - values.start),
    rangeSpanNormalized: Math.abs(normalizedValues.end - normalizedValues.start),
    bandMidpoint: (values.start + values.end) / 2,
    bandMidpointNormalized: (normalizedValues.start + normalizedValues.end) / 2,
    isDirty: isSliderDirty(behavior, previewSession),
    legalMin: legalRange.min,
    legalMax: legalRange.max,
    startAngle,
    currentAngle,
    endAngle,
    crossesSeam,
    ariaValueNow: primaryValue,
    ariaValueMin: legalRange.min,
    ariaValueMax: legalRange.max,
    ariaValueText: `${activeHandle}: ${formatSliderNumericValue(behavior, primaryValue)}`,
    hover: previewSession?.hover === true,
    pressed: previewSession?.pressed === true,
    focused: previewSession?.focused === true,
    dragging: previewSession?.dragging === true,
    disabled: previewSession?.disabled === true || core?.enabled === false,
    checked: false,
    selectionActive: false,
    mixed: false,
    pending: previewSession?.pending === true,
    executed: previewSession?.executed === true,
    animationsEnabled: previewSession?.animationsEnabled !== false,
    reducedMotion: previewSession?.reducedMotion === true,
    highContrast: previewSession?.highContrast === true,
  };
}

export function resolveInteractionContext(control, previewSession = {}) {
  const core = getNodeChild(control, 'Core');
  const behavior = getNodeChild(control, 'Behavior');
  const valueRows = getValueRows(control);
  const defaultRow = findDefaultRow(valueRows);
  const buttonType = String(behavior?.buttonType ?? '');
  const valueType = String(behavior?.valueType ?? 'none');
  const defaultValue = behavior?.defaultValue;
  const enumValues = normalizeEnumValues(behavior?.enumValues ?? []);

  if (isSliderBehavior(behavior)) {
    return resolveSliderInteractionContext(control, previewSession);
  }

  let valueRaw = previewSession?.valueOverrideEnabled
    ? previewSession?.valueOverride
    : defaultValue;

  if (valueType === 'bool' && previewSession?.valueOverrideEnabled !== true) {
    valueRaw = previewSession?.checked === true;
  }

  if (buttonType === 'toggle') {
    const checked = previewSession?.checked === true || behavior?.defaultValue === true;
    const toggleRow = checked
      ? (valueRows[1] ?? valueRows.find((row) => row?.internalValue === true) ?? null)
      : (valueRows[0] ?? valueRows.find((row) => row?.internalValue === false) ?? null);
    valueRaw = checked;
    return {
      family: String(behavior?.family ?? 'select'),
      role: String(behavior?.role ?? core?.controlType ?? 'toggle'),
      valueType,
      valueRaw,
      valueDisplay: String(toggleRow?.displayText ?? (checked ? 'On' : 'Off')),
      valueEnum: '',
      valueNormalized: checked ? 1 : 0,
      hover: previewSession?.hover === true,
      pressed: previewSession?.pressed === true,
      focused: previewSession?.focused === true,
      dragging: previewSession?.dragging === true,
      disabled: previewSession?.disabled === true || core?.enabled === false,
      checked,
      selectionActive: checked,
      mixed: previewSession?.mixed === true,
      pending: previewSession?.pending === true,
      executed: previewSession?.executed === true,
      animationsEnabled: previewSession?.animationsEnabled !== false,
    };
  }

  if (buttonType === 'radio' || buttonType === 'cyclic' || buttonType === 'combobox') {
    const resolvedRow = findRowByInternalValue(valueRows, valueRaw)
      ?? findDefaultRow(valueRows);
    const selectionActive = resolvedRow != null;
    valueRaw = resolvedRow?.internalValue ?? resolvedRow?.id ?? defaultValue ?? '';
    const rowIndex = Math.max(0, valueRows.findIndex((row) => row?.id === resolvedRow?.id));
    const normalizedRow = valueRows.length > 1 ? rowIndex / (valueRows.length - 1) : (resolvedRow ? 1 : 0);
    return {
      family: String(behavior?.family ?? 'select'),
      role: String(behavior?.role ?? core?.controlType ?? 'button'),
      valueType,
      valueRaw,
      valueDisplay: String(resolvedRow?.displayText ?? valueRaw ?? ''),
      valueEnum: String(valueRaw ?? ''),
      valueNormalized: clamp(normalizedRow, 0, 1),
      hover: previewSession?.hover === true,
      pressed: previewSession?.pressed === true,
      focused: previewSession?.focused === true,
      dragging: previewSession?.dragging === true,
      disabled: previewSession?.disabled === true || core?.enabled === false,
      checked: buttonType === 'radio' || buttonType === 'combobox' ? false : previewSession?.checked === true,
      selectionActive,
      mixed: previewSession?.mixed === true,
      pending: previewSession?.pending === true,
      executed: previewSession?.executed === true,
      animationsEnabled: previewSession?.animationsEnabled !== false,
    };
  }

  if (valueType === 'enum') {
    valueRaw = resolveEnumDefaultValue(enumValues, valueRaw);
  } else if (String(behavior?.family ?? '') === 'range') {
    valueRaw = getCurrentRangeValue(behavior, previewSession);
  }

  const min = getRangeMin(behavior);
  const max = getRangeMax(behavior);
  const normalizedSource = isNumeric(valueRaw) ? valueRaw : (valueRaw === true ? max : min);
  const valueNormalized = valueType === 'enum'
    ? clamp(getEnumNormalizedValue(enumValues, valueRaw), 0, 1)
    : clamp(normalizeRange(snapRangeValue(behavior, normalizedSource), min, max), 0, 1);
  const valueDisplay = String(behavior?.family === 'range'
    ? resolveRangeDisplayValue(behavior, previewSession)
    : (valueType === 'enum' ? String(valueRaw ?? '') : String(valueRaw ?? '')));

  return {
    family: String(behavior?.family ?? 'trigger'),
    role: String(behavior?.role ?? core?.controlType ?? 'custom'),
    valueType,
    valueRaw,
    valueDisplay,
    valueEnum: valueType === 'enum' ? String(valueRaw ?? '') : '',
    valueNormalized,
    hover: previewSession?.hover === true,
    pressed: previewSession?.pressed === true,
    focused: previewSession?.focused === true,
    dragging: previewSession?.dragging === true,
    disabled: previewSession?.disabled === true || core?.enabled === false,
    checked: previewSession?.checked === true || valueRaw === true,
    selectionActive: false,
    mixed: previewSession?.mixed === true,
    pending: previewSession?.pending === true,
    executed: previewSession?.executed === true,
    animationsEnabled: previewSession?.animationsEnabled !== false,
  };
}

export function resolveInteractiveControl(control, previewSession = {}) {
  const behavior = getNodeChild(control, 'Behavior');
  const parts = getNodeChild(control, 'Parts');
  const bindings = getNodeChild(control, 'Bindings');
  const states = getNodeChild(control, 'States');
  const animations = getNodeChild(control, 'Animations');
  const hasInteractiveSections = !!behavior
    || Object.keys(parts?._children ?? {}).length > 0
    || Object.keys(bindings?._children ?? {}).length > 0
    || Object.keys(states?._children ?? {}).length > 0
    || Object.keys(animations?._children ?? {}).length > 0;

  if (!hasInteractiveSections) {
    const signals = resolveInteractionContext(control, previewSession);
    return {
      control,
      runtime: createEmptyRuntime(signals),
    };
  }

  const resolved = deepClone(control);
  const signals = resolveInteractionContext(control, previewSession);
  const resolvedBindings = getNodeChild(resolved, 'Bindings');
  const resolvedStates = getNodeChild(resolved, 'States');

  if (resolvedBindings?.enabled !== false) {
    for (const binding of Object.values(resolvedBindings?._children ?? {})) {
      if (!binding || binding.enabled === false) continue;
      const sourceValue = evaluateBindingSource(binding, signals);
      const resolvedValue = resolveBindingValue(binding, sourceValue);
      if (resolvedValue === undefined) continue;
      setTreeValueAtPath(resolved, binding.target, resolvedValue);
    }
  }

  const priority = Array.isArray(resolvedStates?.priority)
    ? resolvedStates.priority.map((value) => normalizeKey(value))
    : [];
  const activeStates = resolvedStates?.enabled === false
    ? []
    : Object.entries(resolvedStates?._children ?? {})
      .filter(([, state]) => evaluateState(state, signals))
      .sort((left, right) => {
        const leftKey = normalizeKey(left[0] ?? left[1]?.name);
        const rightKey = normalizeKey(right[0] ?? right[1]?.name);
        const leftKnown = KNOWN_STATE_PRECEDENCE[leftKey];
        const rightKnown = KNOWN_STATE_PRECEDENCE[rightKey];
        const leftIndex = priority.indexOf(leftKey);
        const rightIndex = priority.indexOf(rightKey);
        const safeLeft = leftKnown ?? (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : 200 + leftIndex);
        const safeRight = rightKnown ?? (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : 200 + rightIndex);
        return safeLeft - safeRight;
      });

  const skipRootComponentStatePatches = isRadioGroupControl(control);
  for (const [, state] of activeStates) {
    applyStatePatches(resolved, state, { skipComponentPatch: skipRootComponentStatePatches });
  }

  const transitions = buildTransitionCatalog(resolved, previewSession);

  return {
    control: resolved,
    runtime: {
      signals,
      activeStates: activeStates.map(([name]) => name),
      transitions,
    },
  };
}
