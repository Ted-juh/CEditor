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
import { materializeCustomComponent } from './customComponentMaterializer.js';
import { constrainCustomValues, customConditionMatches } from './customComponentInteraction.js';
import { clamp } from './primitives.js';

function getNodeChild(node, key) {
  return node?._children?.[key];
}

function getValueRows(control) {
  const rows = getNodeChild(control, 'Value')?.rows;
  return Array.isArray(rows) ? rows : [];
}

function getValueChannels(control) {
  return getNodeChild(control, 'ValueChannels')?._children ?? {};
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
  const source = String(binding?.source ?? '');
  if (source.startsWith('channel.')) {
    return signals?.customChannels?.[source];
  }

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

  if (binding?.mapMode === 'format') {
    const multiplier = numberOr(binding?.multiplier, 1);
    const offset = numberOr(binding?.offset, 0);
    const precision = Math.max(0, Math.min(8, Math.round(numberOr(binding?.precision, 0))));
    const numeric = Number(sourceValue);
    const formatted = Number.isFinite(numeric)
      ? ((numeric * multiplier) + offset).toFixed(precision)
      : String(sourceValue ?? '');
    return `${binding?.prefix ?? ''}${formatted}${binding?.suffix ?? ''}`;
  }

  if (binding?.mapMode === 'template') {
    const template = String(binding?.template ?? '{value}');
    return template.replaceAll('{value}', String(sourceValue ?? ''));
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
    default:
      if (String(key ?? '').startsWith('channel.')) return signals?.customChannels?.[key];
      return signals[key];
  }
}

// Flat name -> value map for state rules: bare channel names carry their raw
// values, interaction flags come along so rules like `hover == true` work.
function stateRuleValues(signals) {
  const values = {};
  for (const [key, value] of Object.entries(signals?.customChannels ?? {})) {
    const match = /^channel\.([^.]+)\.raw$/.exec(key);
    if (match) values[match[1]] = value;
  }
  for (const flag of ['hover', 'pressed', 'focused', 'dragging', 'disabled', 'checked', 'mixed']) {
    values[flag] = signals?.[flag] === true;
  }
  return values;
}

function evaluateState(state, signals) {
  if (!state || state.enabled === false) return false;
  // Optional compound condition over channels/flags (`level > 0.5 && mode == 'A'`),
  // evaluated with the same language links and hit zones use. ANDed with `when`
  // so flag toggles and a rule can be combined.
  const rule = String(state.rule ?? '').trim();
  if (rule && !customConditionMatches(rule, stateRuleValues(signals))) return false;
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

function normalizeCustomChannelValue(channel = null, rawValue = 0) {
  const type = String(channel?.type ?? 'float').trim().toLowerCase();
  if (type === 'bool' || type === 'boolean') return rawValue === true ? 1 : 0;
  if (type === 'enum' || type === 'text' || type === 'note' || type === 'array') return 0;

  const min = numberOr(channel?.min, 0);
  const max = Math.max(min, numberOr(channel?.max, min + 1));
  const numeric = numberOr(rawValue, numberOr(channel?.defaultValue, min));
  return clamp(normalizeRange(numeric, min, max), 0, 1);
}

function resolveCustomComponentInteractionContext(control, previewSession = {}) {
  const core = getNodeChild(control, 'Core');
  const channels = getValueChannels(control);
  const constrainedCustomValues = constrainCustomValues(control, previewSession?.customValues ?? {});
  const mainChannel = channels.mainValue
    ?? Object.values(channels).find((channel) => ! ['enum', 'array'].includes(String(channel?.type ?? '').trim().toLowerCase()))
    ?? Object.values(channels)[0]
    ?? null;
  const modeChannel = channels.mode ?? null;
  const overrideValue = previewSession?.valueOverrideEnabled === true
    ? previewSession?.valueOverride
    : constrainedCustomValues?.mainValue;
  const rawValue = overrideValue ?? mainChannel?.currentValue ?? mainChannel?.defaultValue ?? 0;
  const valueNormalized = previewSession?.valueOverrideEnabled === true
    ? normalizeCustomChannelValue(mainChannel, rawValue)
    : numberOr(previewSession?.customNormalizedValue, normalizeCustomChannelValue(mainChannel, rawValue));
  const modeValue = constrainedCustomValues?.mode ?? modeChannel?.currentValue ?? modeChannel?.defaultValue ?? '';

  const channelSignals = {};
  for (const [name, channel] of Object.entries(channels)) {
    const channelRaw = constrainedCustomValues?.[name] ?? channel?.currentValue ?? channel?.defaultValue;
    channelSignals[`channel.${name}.raw`] = channelRaw;
    channelSignals[`channel.${name}.normalized`] = normalizeCustomChannelValue(channel, channelRaw);
    channelSignals[`channel.${name}.display`] = String(channelRaw ?? '');
    // Array channels (§12.3) additionally expose their items — whole and
    // per-index — so generators and bindings can target item i directly
    // (`channel.<name>.items`, `channel.<name>.<i>.raw|.normalized`).
    if (String(channel?.type ?? '').trim().toLowerCase() === 'array') {
      const items = Array.isArray(channelRaw) ? channelRaw : (Array.isArray(channel?.items) ? channel.items : []);
      channelSignals[`channel.${name}.items`] = items;
      const itemMin = numberOr(channel?.min, 0);
      const itemMax = Math.max(itemMin, numberOr(channel?.max, itemMin + 1));
      const span = Math.max(0.000001, itemMax - itemMin);
      items.forEach((item, index) => {
        channelSignals[`channel.${name}.${index}.raw`] = item;
        channelSignals[`channel.${name}.${index}.normalized`] = clamp((numberOr(item, itemMin) - itemMin) / span, 0, 1);
      });
    }
  }

  return {
    family: 'custom',
    role: 'component',
    valueType: String(mainChannel?.type ?? 'float'),
    valueRaw: rawValue,
    valueDisplay: String(rawValue ?? ''),
    valueEnum: String(modeValue ?? ''),
    valueNormalized,
    customChannels: channelSignals,
    arpeggiator: constrainedCustomValues?.__arpeggiator ?? null,
    mode: modeValue,
    activeCustomBehavior: previewSession?.activeCustomBehavior ?? '',
    activeCustomHitZone: previewSession?.activeCustomHitZone ?? '',
    hoveredCustomBehavior: previewSession?.hoveredCustomBehavior ?? '',
    hoveredCustomHitZone: previewSession?.hoveredCustomHitZone ?? '',
    hover: previewSession?.hover === true,
    pressed: previewSession?.pressed === true,
    focused: previewSession?.focused === true,
    dragging: previewSession?.dragging === true,
    disabled: previewSession?.disabled === true || core?.enabled === false,
    checked: previewSession?.checked === true,
    selectionActive: false,
    mixed: previewSession?.mixed === true,
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

  if (String(core?.controlType ?? '') === 'CustomComponent') {
    return resolveCustomComponentInteractionContext(control, previewSession);
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

// Apply a CustomComponent's bindings to a (already cloned/materialized) control
// in place, given the current interaction signals. Each binding reads its source
// channel/state from `signals` and writes the mapped result to its target
// property path. This is the live recompute seam: callers re-run it whenever the
// signals change (the runtime does so reactively via resolveInteractiveControl;
// the Test Bench calls it on its preview snapshot) so bindings track value
// changes instead of being frozen at materialize time. Returns the same control.
export function applyCustomBindings(control, signals = {}) {
  const bindings = getNodeChild(control, 'Bindings');
  if (!bindings || bindings.enabled === false) return control;
  for (const binding of Object.values(bindings?._children ?? {})) {
    if (!binding || binding.enabled === false) continue;
    const sourceValue = evaluateBindingSource(binding, signals);
    const resolvedValue = resolveBindingValue(binding, sourceValue);
    if (resolvedValue === undefined) continue;
    setTreeValueAtPath(control, binding.target, resolvedValue);
  }
  return control;
}

export function resolveInteractiveControl(control, previewSession = {}) {
  const behavior = getNodeChild(control, 'Behavior');
  const parts = getNodeChild(control, 'Parts');
  const bindings = getNodeChild(control, 'Bindings');
  const states = getNodeChild(control, 'States');
  const animations = getNodeChild(control, 'Animations');
  const isCustomComponent = String(getNodeChild(control, 'Core')?.controlType ?? '') === 'CustomComponent';
  const effectivePreviewSession = isCustomComponent
    ? { ...(previewSession ?? {}), pressed: false }
    : previewSession;
  const hasInteractiveSections = !!behavior
    || Object.keys(parts?._children ?? {}).length > 0
    || Object.keys(bindings?._children ?? {}).length > 0
    || Object.keys(states?._children ?? {}).length > 0
    || Object.keys(animations?._children ?? {}).length > 0;

  if (!hasInteractiveSections) {
    const signals = resolveInteractionContext(control, effectivePreviewSession);
    return {
      control,
      runtime: createEmptyRuntime(signals),
    };
  }

  const resolved = deepClone(control);
  const signals = resolveInteractionContext(control, effectivePreviewSession);
  materializeCustomComponent(resolved, signals);
  applyCustomBindings(resolved, signals);
  const resolvedStates = getNodeChild(resolved, 'States');

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

  for (const [, state] of activeStates) {
    applyStatePatches(resolved, state);
  }

  const transitions = buildTransitionCatalog(resolved, effectivePreviewSession);

  return {
    control: resolved,
    runtime: {
      signals,
      activeStates: activeStates.map(([name]) => name),
      transitions,
    },
  };
}
