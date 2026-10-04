import { deepClone } from './deepClone.js';
import { resolveRadioSelectedKeys } from './radioSegmentStyle.js';
import { setNestedValue } from '../stores/controlTreeUtils.js';
import { getEnumNormalizedValue, normalizeEnumValues, resolveEnumDefaultValue } from './enumBehavior.js';
import {
  formatRangeValue,
  getCurrentRangeValue,
  getRangeActiveHandle,
  getRangeEndValue,
  getRangeMax,
  getRangeMin,
  getRangeStartValue,
  isTwoValueRange,
  resolveRangeDisplayValue,
  snapRangeValue,
} from './rangeBehavior.js';
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
import { applyCustomInternalScale } from './customComponentScale.js';
import { attachBooleanInputs } from './booleanGroups.js';
import { applyActiveVariant, applyVariantPatches } from './customComponentVariants.js';
import { constrainCustomValues, customConditionMatches } from './customComponentInteraction.js';
import { clamp } from './primitives.js';
import { formatChannelValue } from './valueDisplayScale.js';
import { visibleChoiceRows, dependsOnId } from './dependentChoices.js';
import { easingToCss } from './easing.js';
// A cycle, and a safe one: keyframeAnimation.js reads readTrigger from here, and this file reads
// readKeyframes from there, each only when called — never while either module is loading.
import { readKeyframes } from './keyframeAnimation.js';

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
  return rows.find((row) => row?.selectedByDefault === true && row?.enabled !== false && row?.isHeader !== true)
    ?? rows.find((row) => row?.enabled !== false && row?.isHeader !== true)
    ?? null;
}

function findRowByInternalValue(rows = [], value) {
  return rows.find((row) => row?.enabled !== false && row?.isHeader !== true
    && String(row?.internalValue ?? row?.id ?? '') === String(value ?? ''))
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

// The named easings live in utils/easing.js now, with the solver and the CSS writer beside them.
// Re-exported from here because ce.anim's tests pin the identity of THIS module's table: the panel
// and a script asking for "outCubic" have to read one object, not two that agree today.
export { EASING_BEZIERS, EASING_NAMES } from './easing.js';

export function treeValueAtPath(node, path) {
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
  // A surface effect may exist only in a state. Use the editor's lazy templates
  // so Hover can create that target without first changing the base appearance.
  if (/^Background\.(?:Effects|Border\.Effects|Fill\.(?:Solid|Gradient|Image|Overlay)Effects)\./.test(path)) {
    setNestedValue(node, path, value);
    return;
  }
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

/**
 * The value a signal source names ("value.normalized", "channel.cutoff.raw", …), read from
 * `signals`. The same reader bindings use, so an animation triggered by a source and a binding
 * driven by it agree about what that source is.
 */
export function readSignalSource(source, signals) {
  return evaluateBindingSource({ source }, signals ?? {});
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
    case 'value.start.display':
      return signals.startValueDisplay;
    case 'value.end.display':
      return signals.endValueDisplay;
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
    // "Is this zone among the focused ones" — the one list-valued signal a state asks about.
    if (key === 'focusedCustomHitZones') return Array.isArray(actual) && actual.includes(expected);
    if (Array.isArray(expected)) return expected.includes(actual);
    return actual === expected;
  });
}

function applyPatchMap(target, patchMap = {}) {
  for (const [path, value] of Object.entries(patchMap ?? {})) {
    setTreeValueAtPath(target, path, deepClone(value));
  }
}

function applyStatePatches(control, state) {
  const patches = state?.patches ?? {};
  applyPatchMap(control, patches.component);
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
  applyStatePatches(resolved, state);
  const resolvedValue = getNodeChild(resolved, 'Value');
  if (resolvedValue) {
    resolvedValue.__segmentPreviewState = stateName;
  }
  return resolved;
}

// --- Animations -------------------------------------------------------------------------------
// What each target path animates. A target is either on a part ("Parts.<name>.<path>") or on the
// control itself, and each path fills one BUCKET — a group of CSS properties the renderers give
// one shared transition. utils/animationModel.js reads these same tables to tell the editor which
// targets do something, so there is one list and not a copy of it.

export const PART_PATH_BUCKETS = {
  'Layout.x': 'transform',
  'Layout.y': 'transform',
  'Layout.offsetX': 'transform',
  'Layout.offsetY': 'transform',
  'Layout.rotation': 'transform',
  'Layout.scale': 'transform',
  opacity: 'opacity',
  'Layout.width': 'size',
  'Layout.height': 'size',
  'Background.Fill.colour': 'colour',
  'Background.Border.colour': 'colour',
  'Text.Fill.colour': 'colour',
  // A state that shows or hides a part — a tab group swapping its pages — used to make it pop. With
  // this target it fades: the renderer keeps such a part mounted while hidden, so there is a
  // `visibility: hidden; opacity: 0` to ease to and from (utils/transitionCss.js).
  visible: 'visibility',
};

export const ROOT_PATH_BUCKETS = {
  'Transform.scale': 'transform',
  'Transform.rotation': 'transform',
  'Transform.opacity': 'opacity',
  'Background.Fill.colour': 'colour',
  'Background.Border.colour': 'colour',
  'Text.Fill.colour': 'colour',
};

/**
 * A target's `properties` list names buckets directly, which is how a target on a path missing from
 * the tables can still animate. The three CSS names are what the properties panel has always written
 * for its two colour choices; for years they named a bucket that did not exist, and now they name
 * the one that does, so a control saved with "Fill colour" starts working without being edited.
 */
export const BUCKET_HINTS = {
  transform: 'transform',
  opacity: 'opacity',
  size: 'size',
  colour: 'colour',
  color: 'colour',
  'background-color': 'colour',
  'border-color': 'colour',
  visibility: 'visibility',
};

/** The buckets a target on the control itself can fill. The root has no size bucket. */
export const ROOT_BUCKETS = ['transform', 'opacity', 'colour'];

export const ANIMATION_BUCKETS = ['transform', 'opacity', 'size', 'colour', 'visibility'];

/**
 * Where a target lands: `{ part, buckets }`, with part '' for the control itself. Null when the
 * path is empty or names "Parts." without a part; an empty bucket list when nothing it says is
 * animatable.
 */
export function targetBuckets(target) {
  const path = String(target?.path ?? '').trim();
  if (!path) return null;
  const hinted = (Array.isArray(target?.properties) ? target.properties : [])
    .map((hint) => BUCKET_HINTS[String(hint)])
    .filter(Boolean);
  if (path.startsWith('Parts.')) {
    const [, partName, ...rest] = path.split('.');
    if (!partName) return null;
    const byPath = PART_PATH_BUCKETS[rest.join('.')];
    return { part: partName, buckets: [...new Set([byPath, ...hinted].filter(Boolean))] };
  }
  const byPath = ROOT_PATH_BUCKETS[path];
  return {
    part: '',
    buckets: [...new Set([byPath, ...hinted].filter((bucket) => bucket && ROOT_BUCKETS.includes(bucket)))],
  };
}

const normalizeStateList = (list) => (Array.isArray(list) ? list : [])
  .map((value) => normalizeKey(value))
  .filter(Boolean);

/** One animation's trigger, read once. Every field has the default the editor shows. */
export function readTrigger(animation) {
  const trigger = animation?.trigger ?? {};
  const type = String(trigger.type ?? 'stateChange');
  return {
    type,
    from: normalizeStateList(trigger.from),
    to: normalizeStateList(trigger.to),
    // Leaving the `to` state plays the animation too, unless switched off. That is how a hover lift
    // settles back when the pointer leaves, which every control did before triggers were read.
    reverse: trigger.reverse !== false,
    source: String(trigger.source ?? 'value.normalized'),
    origin: ['user', 'external'].includes(trigger.origin) ? trigger.origin : 'any',
    every: Math.max(1, Math.round(Number(trigger.every) || 1)),
    event: String(trigger.event ?? ''),
  };
}

/**
 * The animation timing as a CSS transition value: "<duration>ms <easing> <delay>ms".
 * `timeScale` stretches both times — the editor's slow-motion preview, never the panel itself.
 */
export function animationTiming(animation, timeScale = 1) {
  const scale = Number.isFinite(Number(timeScale)) && Number(timeScale) > 0 ? Number(timeScale) : 1;
  const duration = Math.max(0, numberOr(animation?.duration, 120)) * scale;
  const delay = Math.max(0, numberOr(animation?.delay, 0)) * scale;
  return `${Math.round(duration)}ms ${easingToCss(animation)} ${Math.round(delay)}ms`;
}

function buildTransitionCatalog(control, previewSession) {
  const animations = getNodeChild(control, 'Animations');
  const enabled = animations?.enabled !== false && previewSession?.animationsEnabled !== false;
  const rootTransitions = new Map();
  const partTransitions = new Map();
  const entries = [];
  const reducedMotion = previewSession?.reducedMotion === true;
  if (!enabled) {
    return { enabled: false, reducedMotion, rootTransitions, partTransitions, entries };
  }

  const timeScale = previewSession?.animationTimeScale;
  let order = 0;
  for (const [key, animation] of Object.entries(animations?._children ?? {})) {
    if (!animation || typeof animation !== 'object' || animation.enabled === false) continue;
    // `keyframes` is the second kind, which runs a shape of its own (a pulse, a blink) rather than
    // easing between two styles; buildKeyframeCatalog below reads those. Every other kind —
    // including a word typed into the properties panel's free text box — is a transition, exactly
    // as before.
    if (String(animation.kind ?? '') === 'keyframes') continue;
    // `sequence` is the third: tracks of keyframes along a time axis, whose values the sequence
    // player drives itself (utils/keyframePlayer.js). A CSS transition on top would ease what is
    // already eased.
    if (String(animation.kind ?? '') === 'sequence') continue;
    const transition = animationTiming(animation, timeScale);
    const scale = Number(timeScale) > 0 ? Number(timeScale) : 1;
    const entry = {
      name: String(animation.name ?? key),
      order: order++,
      css: transition,
      // How long a transition this entry starts can still be running — the tracker keeps it in
      // place that long rather than cutting it off on the next unrelated change.
      span: (Math.max(0, numberOr(animation.duration, 120)) + Math.max(0, numberOr(animation.delay, 0))) * scale,
      trigger: readTrigger(animation),
      root: new Set(),
      parts: new Map(),
    };
    for (const target of animation.targets ?? []) {
      const landing = targetBuckets(target);
      if (!landing || !landing.buckets.length) continue;
      if (landing.part) {
        const bucket = partTransitions.get(landing.part) ?? { transform: null, opacity: null, size: null, colour: null, visibility: null };
        const set = entry.parts.get(landing.part) ?? new Set();
        for (const name of landing.buckets) { bucket[name] = transition; set.add(name); }
        partTransitions.set(landing.part, bucket);
        entry.parts.set(landing.part, set);
      } else {
        for (const name of landing.buckets) { rootTransitions.set(name, transition); entry.root.add(name); }
      }
    }
    if (entry.root.size || entry.parts.size) entries.push(entry);
  }

  // rootTransitions / partTransitions are every animation at once, the last one winning a shared
  // bucket — what the runtime COULD animate. Which one actually plays depends on what changed, and
  // that needs the previous frame: utils/transitionSelection.js picks from `entries`.
  return { enabled: true, reducedMotion, rootTransitions, partTransitions, entries };
}

/**
 * The keyframe animations a control plays — the second kind, which runs frames of its own rather
 * than easing between two styles (utils/keyframeAnimation.js). The same switches as transitions:
 * the section's, the preview's Animations switch and its Reduced motion, and slow motion. Which of
 * them is playing at any moment needs the frame before, so a player beside the transition tracker
 * decides that, in the renderer.
 */
function buildKeyframeCatalog(control, previewSession) {
  const animations = getNodeChild(control, 'Animations');
  const enabled = animations?.enabled !== false && previewSession?.animationsEnabled !== false;
  const reducedMotion = previewSession?.reducedMotion === true;
  if (!enabled) return { enabled: false, reducedMotion, entries: [] };
  const entries = [];
  for (const [key, animation] of Object.entries(animations?._children ?? {})) {
    const entry = readKeyframes(animation, key, { timeScale: previewSession?.animationTimeScale });
    if (entry) entries.push(entry);
  }
  return { enabled: true, reducedMotion, entries };
}

/** The channel entries of a keyframe overlay, apart from the ones that patch the look. */
const CHANNEL_OVERLAY = /^ValueChannels\.([^.]+)$/;
function splitKeyframeOverlay(overlay) {
  if (!overlay) return { channelOverrides: null, lookOverlay: null };
  let channelOverrides = null;
  let lookOverlay = null;
  for (const [path, value] of Object.entries(overlay)) {
    const match = CHANNEL_OVERLAY.exec(path);
    if (match) (channelOverrides ??= {})[match[1]] = value;
    else (lookOverlay ??= {})[path] = value;
  }
  return { channelOverrides, lookOverlay };
}

function createEmptyRuntime(signals = {}) {
  return {
    signals,
    activeStates: [],
    transitions: {
      enabled: false,
      rootTransitions: new Map(),
      partTransitions: new Map(),
      entries: [],
    },
    keyframes: { enabled: false, reducedMotion: false, entries: [] },
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
    // The channel's own formatting AND its display scale — a knob bound to a parameter stored
    // 61..67 and printed -3..+3 read 64 here where the instrument reads 0. String(raw) also threw
    // away the channel's prefix/suffix/unit/precision, which nothing had ever applied.
    channelSignals[`channel.${name}.display`] = formatChannelValue(channel, channelRaw);
    // Array channels (§12.3) additionally expose their items — whole and
    // per-index — so generators and bindings can target item i directly
    // (`channel.<name>.items`, `channel.<name>.<i>.raw|.normalized`).
    // Object-item channels (itemFields) get `.items`, `.count`, and per-index
    // raw objects; per-index normalization only applies to scalar items.
    if (String(channel?.type ?? '').trim().toLowerCase() === 'array') {
      const items = Array.isArray(channelRaw) ? channelRaw : (Array.isArray(channel?.items) ? channel.items : []);
      channelSignals[`channel.${name}.items`] = items;
      channelSignals[`channel.${name}.count`] = items.length;
      const objectItems = !!channel?.itemFields;
      const itemMin = numberOr(channel?.min, 0);
      const itemMax = Math.max(itemMin, numberOr(channel?.max, itemMin + 1));
      const span = Math.max(0.000001, itemMax - itemMin);
      items.forEach((item, index) => {
        channelSignals[`channel.${name}.${index}.raw`] = item;
        if (!objectItems) {
          channelSignals[`channel.${name}.${index}.normalized`] = clamp((numberOr(item, itemMin) - itemMin) / span, 0, 1);
        }
      });
    }
  }

  return {
    family: 'custom',
    role: 'component',
    valueType: String(mainChannel?.type ?? 'float'),
    valueRaw: rawValue,
    valueDisplay: formatChannelValue(mainChannel, rawValue),
    valueEnum: String(modeValue ?? ''),
    valueNormalized,
    customChannels: channelSignals,
    arpeggiator: constrainedCustomValues?.__arpeggiator ?? null,
    mode: modeValue,
    activeCustomBehavior: previewSession?.activeCustomBehavior ?? '',
    activeCustomHitZone: previewSession?.activeCustomHitZone ?? '',
    hoveredCustomBehavior: previewSession?.hoveredCustomBehavior ?? '',
    hoveredCustomHitZone: previewSession?.hoveredCustomHitZone ?? '',
    focusedCustomHitZones: Array.isArray(previewSession?.focusedCustomHitZones) ? previewSession.focusedCustomHitZones : [],
    domFocusCustomHitZone: previewSession?.domFocusCustomHitZone ?? '',
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
  // Cascading selectors: reduce the choices to those visible under the parent
  // selector's current value (a no-op for independent controls).
  const valueRows = visibleChoiceRows(getValueRows(control), previewSession?.dependsParentValue, dependsOnId(control));
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
    const checked = typeof previewSession?.checked === 'boolean' ? previewSession.checked : behavior?.defaultValue === true;
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

  if (buttonType === 'radio' || buttonType === 'cyclic' || buttonType === 'combobox' || buttonType === 'listbox') {
    const multi = buttonType === 'radio' && behavior?.selectionMode === 'multi';
    const emptyRadio = buttonType === 'radio' && previewSession?.valueOverrideEnabled === true
      && (valueRaw === '' || (Array.isArray(valueRaw) && valueRaw.length === 0));
    const selectedKeys = multi ? (previewSession?.valueOverrideEnabled === true
      ? (Array.isArray(valueRaw) ? valueRaw : [valueRaw])
      : [...resolveRadioSelectedKeys(valueRows, behavior)]) : null;
    const selectedRows = multi ? valueRows.filter(row => selectedKeys.map(String).includes(String(row.internalValue ?? row.id))) : [];
    const resolvedRow = emptyRadio ? null : multi ? selectedRows[0]
      : findRowByInternalValue(valueRows, valueRaw) ?? findDefaultRow(valueRows);
    const selectionActive = multi ? selectedRows.length > 0 : resolvedRow != null;
    valueRaw = multi ? selectedRows.map(row => row.internalValue ?? row.id) : emptyRadio ? '' : resolvedRow?.internalValue ?? resolvedRow?.id ?? defaultValue ?? '';
    const rowIndex = Math.max(0, valueRows.findIndex((row) => row?.id === resolvedRow?.id));
    const normalizedRow = valueRows.length > 1 ? rowIndex / (valueRows.length - 1) : (resolvedRow ? 1 : 0);
    return {
      family: String(behavior?.family ?? 'select'),
      role: String(behavior?.role ?? core?.controlType ?? 'button'),
      valueType,
      valueRaw,
      valueDisplay: multi ? selectedRows.map(row => row.displayText ?? row.internalValue ?? row.id).join(', ') : String(resolvedRow?.displayText ?? valueRaw ?? ''),
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

  // Two-value (min/max) range spinner carries a low (start) and high (end)
  // value plus which one is active. These extra signals feed the low/high text
  // bindings and the active-field highlight state; single-value ranges (Number)
  // leave them undefined and are unaffected.
  let twoValueSignals = {};
  if (isTwoValueRange(behavior)) {
    const startValue = getRangeStartValue(behavior, previewSession);
    const endValue = getRangeEndValue(behavior, previewSession);
    twoValueSignals = {
      startValueRaw: startValue,
      endValueRaw: endValue,
      startValueDisplay: formatRangeValue(behavior, startValue),
      endValueDisplay: formatRangeValue(behavior, endValue),
      startValueNormalized: clamp(normalizeRange(startValue, min, max), 0, 1),
      endValueNormalized: clamp(normalizeRange(endValue, min, max), 0, 1),
      activeHandle: getRangeActiveHandle(previewSession),
    };
  }

  return {
    family: String(behavior?.family ?? 'trigger'),
    role: String(behavior?.role ?? core?.controlType ?? 'custom'),
    valueType,
    valueRaw,
    valueDisplay,
    valueEnum: valueType === 'enum' ? String(valueRaw ?? '') : '',
    valueNormalized,
    ...twoValueSignals,
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
  // A keyframe track on a value channel (`ValueChannels.<name>`, utils/keyframeModel.js) is a
  // value, not a look: it goes into the session's custom values so the signals, and everything
  // bindings and generators draw from them (a filmstrip's frame, a meter's bar), follow it.
  const { channelOverrides, lookOverlay } = splitKeyframeOverlay(effectivePreviewSession?.keyframeOverlay);
  const signalSession = channelOverrides
    ? { ...(effectivePreviewSession ?? {}), customValues: { ...(effectivePreviewSession?.customValues ?? {}), ...channelOverrides } }
    : effectivePreviewSession;
  const signals = resolveInteractionContext(control, signalSession);
  // The copy's chosen variant is its base look: applied first, so bindings and states still act
  // on top of it. Patches on a part a generator makes are retried once the generators have run.
  const variantPending = isCustomComponent ? applyActiveVariant(resolved) : null;
  materializeCustomComponent(resolved, signals);
  if (variantPending) applyVariantPatches(resolved, variantPending);
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

  // A running keyframe animation, or the Animation tab's playhead: a path → value map written by
  // utils/keyframePlayer.js into stores/keyframeOverlays.js and handed in with the session. It
  // lands after the states, where a state's own patch would, and before scaling, like one.
  if (lookOverlay) {
    applyPatchMap(resolved, lookOverlay);
  }

  // Resize policy: with Transform.contentScaleMode === 'scaleInternals',
  // px-unit internals (parts, zones) scale to the instance size relative to
  // the stamped design size. Applied last so materialization, bindings, and
  // state patches all keep authoring in design space.
  if (isCustomComponent) applyCustomInternalScale (resolved);

  // Combined shapes (utils/booleanGroups.js) take their operands as they are NOW — after variants,
  // generators, bindings, states and scaling — so a binding that moves a hole moves it in the shape.
  if (isCustomComponent) attachBooleanInputs(getNodeChild(resolved, 'Parts')?._children);

  const transitions = buildTransitionCatalog(resolved, effectivePreviewSession);
  const keyframes = buildKeyframeCatalog(resolved, effectivePreviewSession);

  return {
    control: resolved,
    runtime: {
      signals,
      activeStates: activeStates.map(([name]) => name),
      transitions,
      keyframes,
    },
  };
}
