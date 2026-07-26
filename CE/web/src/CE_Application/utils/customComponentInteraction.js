import {
  CUSTOM_ARP_RUNTIME_KEY,
  resolveRuntimeArpeggiatorEdit,
  syncCustomArpeggiatorValues,
} from './customComponentArpeggiator.js';
import { resolvePartPixelRect } from './customComponentLayout.js';
import { numberOr, clamp } from './primitives.js';

function sectionChildren(control, sectionName) {
  return control?._children?.[sectionName]?._children ?? {};
}

function enabledEntries(children) {
  return Object.entries(children ?? {})
    .filter(([, value]) => value?.enabled !== false);
}

export function getCustomValueChannels(control) {
  return sectionChildren(control, 'ValueChannels');
}

export function getCustomBehaviors(control) {
  return sectionChildren(control, 'Behaviors');
}

export function getCustomHitZones(control) {
  return sectionChildren(control, 'HitZones');
}

export function getCustomLinks(control) {
  return sectionChildren(control, 'Links');
}

// --- Array channels (PointSet primitive, §12.3) --------------------------
// A channel with type 'array' holds N scalar items sharing one min/max/step.
// Its runtime value in customValues is a plain array; generators can render
// one part per item (step bars) and generated zones write items back by
// index (action 'setItemValue' + payload.index).

export function isArrayValueChannel(channel) {
  return String(channel?.type ?? '').trim().toLowerCase() === 'array';
}

/** Object-item array channel: items are objects clamped per `itemFields`. */
export function isObjectArrayChannel(channel) {
  return isArrayValueChannel(channel) && !!channel?.itemFields && typeof channel.itemFields === 'object';
}

function clampArrayItem(channel, itemValue) {
  const min = numberOr(channel?.min, 0);
  const max = Math.max(min, numberOr(channel?.max, min + 1));
  return clamp(numberOr(itemValue, numberOr(channel?.defaultValue, min)), min, max);
}

function clampObjectArrayItem(channel, item) {
  const clamped = {};
  for (const [field, spec] of Object.entries(channel?.itemFields ?? {})) {
    const min = numberOr(spec?.min, 0);
    const max = Math.max(min, numberOr(spec?.max, min + 1));
    const fieldStep = Math.abs(numberOr(spec?.step, 0));
    let value = clamp(numberOr(item?.[field], numberOr(spec?.default, min)), min, max);
    if (fieldStep > 0) value = clamp(min + (Math.round((value - min) / fieldStep) * fieldStep), min, max);
    clamped[field] = value;
  }
  // Non-schema fields (like a block id) pass through untouched.
  for (const [key, value] of Object.entries(item ?? {})) {
    if (!(key in clamped)) clamped[key] = value;
  }
  return clamped;
}

/** The channel's items as a fresh, clamped array. Scalar channels are
    fixed-size (padded from the default); object-item channels keep the
    source length, capped at `size`. `rawValue` (the live customValues entry)
    wins over the authored `items` defaults. */
export function arrayChannelItems(channel, rawValue = undefined) {
  const authored = Array.isArray(channel?.items) ? channel.items : [];
  const source = Array.isArray(rawValue) ? rawValue : authored;
  if (isObjectArrayChannel(channel)) {
    const cap = Math.max(1, Math.round(numberOr(channel?.size, source.length || 1)));
    return source.slice(0, cap).map((item) => clampObjectArrayItem(channel, item));
  }
  const size = Math.max(1, Math.round(numberOr(channel?.size, authored.length || 16)));
  return Array.from({ length: size }, (_, index) => clampArrayItem(channel, source[index]));
}

export function normalizeArrayChannelItem(channel, itemValue) {
  const min = numberOr(channel?.min, 0);
  const max = Math.max(min, numberOr(channel?.max, min + 1));
  const span = max - min;
  if (Math.abs(span) < 0.000001) return 0;
  return clamp((clampArrayItem(channel, itemValue) - min) / span, 0, 1);
}

export function denormalizeArrayChannelItem(channel, normalized) {
  const min = numberOr(channel?.min, 0);
  const max = Math.max(min, numberOr(channel?.max, min + 1));
  const raw = min + ((max - min) * clamp(numberOr(normalized, 0), 0, 1));
  const step = numberOr(channel?.step, 0);
  return step > 0 ? clamp(Math.round((raw - min) / step) * step + min, min, max) : raw;
}

export function customChannelDefaultValue(channel) {
  if (!channel) return 0;
  if (isArrayValueChannel(channel)) return arrayChannelItems(channel, channel.currentValue);
  return channel.currentValue ?? channel.defaultValue ?? (String(channel.type ?? '') === 'bool' ? false : 0);
}

function customChannelResetValue(channel) {
  if (!channel) return 0;
  return channel.defaultValue ?? channel.currentValue ?? (String(channel.type ?? '') === 'bool' ? false : 0);
}

/**
 * Reset one or more value channels to their default — the universal
 * double-click convention. Pass a single channel name or an array; returns a
 * new, constrained values object. Unknown channels are ignored.
 */
export function resetCustomChannelToDefault(control, channelNames, values = {}) {
  const channels = getCustomValueChannels(control);
  const names = Array.isArray(channelNames) ? channelNames : [channelNames];
  const next = { ...(values ?? {}) };
  let changed = false;
  for (const name of names) {
    const channel = channels?.[name];
    if (!channel) continue;
    next[name] = customChannelResetValue(channel);
    changed = true;
  }
  return changed ? constrainCustomValues(control, next) : (values ?? {});
}

export function seedCustomValues(control) {
  const seeded = Object.entries(getCustomValueChannels(control)).reduce((values, [name, channel]) => {
    values[name] = customChannelDefaultValue(channel);
    return values;
  }, {});
  return syncCustomArpeggiatorValues(control, seeded);
}

export function normalizeCustomChannelValue(channel, rawValue) {
  const type = String(channel?.type ?? 'float').trim().toLowerCase();
  if (type === 'array') return 0; // arrays have per-item normalization, no single scalar
  if (type === 'bool') return rawValue === true ? 1 : 0;
  if (type === 'enum') {
    const values = Array.isArray(channel?.values) ? channel.values : (Array.isArray(channel?.options) ? channel.options : []);
    const normalizedValues = values.map((entry) => String(entry?.value ?? entry?.id ?? entry ?? ''));
    const index = normalizedValues.indexOf(String(rawValue ?? ''));
    return normalizedValues.length > 1 ? clamp(index < 0 ? 0 : index / (normalizedValues.length - 1), 0, 1) : (index >= 0 ? 1 : 0);
  }

  const min = numberOr(channel?.min, 0);
  const max = numberOr(channel?.max, 1);
  const span = max - min;
  if (Math.abs(span) < 0.000001) return 0;
  return clamp((numberOr(rawValue, customChannelDefaultValue(channel)) - min) / span, 0, 1);
}

export function denormalizeCustomChannelValue(channel, normalized) {
  const type = String(channel?.type ?? 'float').trim().toLowerCase();
  const clamped = clamp(numberOr(normalized, 0), 0, 1);
  if (type === 'bool') return clamped >= 0.5;
  if (type === 'enum') {
    const explicitValues = Array.isArray(channel?.values) ? channel.values : (Array.isArray(channel?.options) ? channel.options : []);
    const values = explicitValues
      .map((entry) => entry?.value ?? entry?.id ?? entry)
      .filter((entry) => entry !== undefined && entry !== null);
    const enumValues = values.length ? values : ['A', 'B'];
    const index = clamp(Math.round(clamped * Math.max(0, enumValues.length - 1)), 0, Math.max(0, enumValues.length - 1));
    return enumValues[index];
  }

  const min = numberOr(channel?.min, 0);
  const max = numberOr(channel?.max, 1);
  return snapCustomChannelValue(channel, min + ((max - min) * clamped));
}

function normalizedConstraintValue(spec, values = {}, channels = {}) {
  if (spec === undefined || spec === null || spec === '') return null;
  if (typeof spec === 'number') return clamp(spec, 0, 1);
  const text = String(spec).trim();
  if (!text) return null;

  const numeric = Number(text);
  if (Number.isFinite(numeric)) return clamp(numeric, 0, 1);

  const channelMatch = text.match(/^channel\.([A-Za-z_$][\w$]*)\.(normalized|raw)$/);
  if (channelMatch) {
    const [, channelName] = channelMatch;
    const channel = channels?.[channelName];
    const rawValue = values?.[channelName] ?? customChannelDefaultValue(channel);
    return normalizeCustomChannelValue(channel, rawValue);
  }

  if (Object.prototype.hasOwnProperty.call(values, text)) {
    return normalizeCustomChannelValue(channels?.[text], values[text]);
  }

  return null;
}

function customChannelNormalizedBounds(channelName, channel, values, channels) {
  const constraints = channel?.constraints ?? channel?.constraint ?? null;
  if (!constraints || constraints.enabled === false) return { min: 0, max: 1 };
  const minSpec = constraints.normalizedMin ?? constraints.minNormalized ?? constraints.min;
  const maxSpec = constraints.normalizedMax ?? constraints.maxNormalized ?? constraints.max;
  const minGap = clamp(numberOr(constraints.normalizedMinGap ?? constraints.minGap, 0), 0, 1);
  const maxGap = clamp(numberOr(constraints.normalizedMaxGap ?? constraints.maxGap, 0), 0, 1);
  const min = (normalizedConstraintValue(minSpec, values, channels) ?? 0) + minGap;
  const max = (normalizedConstraintValue(maxSpec, values, channels) ?? 1) - maxGap;
  return {
    min: clamp(Math.min(min, max), 0, 1),
    max: clamp(Math.max(min, max), 0, 1),
  };
}

export function constrainCustomValues(control, values = {}, options = {}) {
  const channels = getCustomValueChannels(control);
  let nextValues = {
    ...seedCustomValues(control),
    ...(values ?? {}),
  };
  const primaryChannelName = String(options?.primaryChannelName ?? '').trim();

  if (primaryChannelName && channels?.[primaryChannelName]) {
    const channel = channels[primaryChannelName];
    const type = String(channel?.type ?? 'float').trim().toLowerCase();
    if (type === 'array') {
      nextValues = { ...nextValues, [primaryChannelName]: arrayChannelItems(channel, nextValues[primaryChannelName]) };
    } else if (!['enum', 'bool', 'boolean'].includes(type)) {
      const bounds = customChannelNormalizedBounds(primaryChannelName, channel, nextValues, channels);
      const raw = nextValues[primaryChannelName] ?? customChannelDefaultValue(channel);
      const normalized = normalizeCustomChannelValue(channel, raw);
      nextValues = {
        ...nextValues,
        [primaryChannelName]: denormalizeCustomChannelValue(channel, clamp(normalized, bounds.min, bounds.max)),
      };
    }
  }

  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const [name, channel] of Object.entries(channels)) {
      if (name === primaryChannelName) continue;
      const type = String(channel?.type ?? 'float').trim().toLowerCase();
      if (type === 'enum' || type === 'bool' || type === 'boolean') continue;
      if (type === 'array') {
        const clampedItems = arrayChannelItems(channel, nextValues[name]);
        const current = nextValues[name];
        const identical = Array.isArray(current)
          && current.length === clampedItems.length
          && clampedItems.every((item, index) => item === current[index]);
        if (!identical) {
          nextValues = { ...nextValues, [name]: clampedItems };
          changed = true;
        }
        continue;
      }
      const bounds = customChannelNormalizedBounds(name, channel, nextValues, channels);
      const raw = nextValues[name] ?? customChannelDefaultValue(channel);
      const normalized = normalizeCustomChannelValue(channel, raw);
      const clampedNormalized = clamp(normalized, bounds.min, bounds.max);
      const clampedValue = denormalizeCustomChannelValue(channel, clampedNormalized);
      if (clampedValue !== nextValues[name]) {
        nextValues = { ...nextValues, [name]: clampedValue };
        changed = true;
      }
    }
    if (!changed) break;
  }

  return nextValues;
}

export function isCustomMouseDirectionReversed(behaviorModule = null) {
  return behaviorModule?.reverseMouseDirection === true;
}

function applyCustomMouseDirection(behaviorModule, normalized) {
  const clamped = clamp(numberOr(normalized, 0), 0, 1);
  return isCustomMouseDirectionReversed(behaviorModule) ? 1 - clamped : clamped;
}

function normalizeDegrees(value) {
  return ((numberOr(value, 0) % 360) + 360) % 360;
}

function circularSweepFor(definition = null, fallbackStart = -135, fallbackEnd = 135) {
  const startAngle = numberOr(definition?.startAngle, fallbackStart);
  const rawSweep = definition?.sweepAngle !== undefined
    ? numberOr(definition.sweepAngle, fallbackEnd - fallbackStart)
    : numberOr(definition?.endAngle, fallbackEnd) - startAngle;
  const direction = String(definition?.direction ?? 'cw').trim().toLowerCase() === 'ccw' ? 'ccw' : 'cw';
  return {
    startAngle,
    sweepAngle: clamp(Math.abs(rawSweep), 0.001, 360),
    direction,
  };
}

function dialAngleFromPoint(localX, localY, centerX, centerY) {
  const canvasAngle = (Math.atan2(localY - centerY, localX - centerX) * 180) / Math.PI;
  return normalizeDegrees(canvasAngle + 90);
}

function normalizedFromDialAngle(angle, definition = null) {
  const { startAngle, sweepAngle, direction } = circularSweepFor(definition);
  if (sweepAngle >= 359.999) {
    const fullDelta = direction === 'ccw'
      ? normalizeDegrees(startAngle - angle)
      : normalizeDegrees(angle - startAngle);
    return fullDelta / 360;
  }

  const delta = direction === 'ccw'
    ? normalizeDegrees(startAngle - angle)
    : normalizeDegrees(angle - startAngle);
  if (delta <= sweepAngle) return clamp(delta / sweepAngle, 0, 1);

  const distanceToStart = Math.min(delta, 360 - delta);
  const distanceToEnd = Math.abs(delta - sweepAngle);
  return distanceToStart <= distanceToEnd ? 0 : 1;
}

function angleInCircularSweep(angle, definition = null) {
  const { startAngle, sweepAngle, direction } = circularSweepFor(definition);
  if (sweepAngle >= 359.999) return true;
  const delta = direction === 'ccw'
    ? normalizeDegrees(startAngle - angle)
    : normalizeDegrees(angle - startAngle);
  return delta <= sweepAngle;
}

export function snapCustomChannelValue(channel, rawValue) {
  const type = String(channel?.type ?? 'float').trim().toLowerCase();
  if (type === 'array') return arrayChannelItems(channel, rawValue);
  if (type === 'bool') return rawValue === true || rawValue === 'true' || Number(rawValue) >= 0.5;
  if (type === 'enum') return String(rawValue ?? customChannelDefaultValue(channel) ?? '');

  const min = numberOr(channel?.min, 0);
  const max = numberOr(channel?.max, 1);
  const step = Math.abs(numberOr(channel?.step, type === 'int' ? 1 : 0));
  let next = clamp(numberOr(rawValue, customChannelDefaultValue(channel)), Math.min(min, max), Math.max(min, max));

  if (channel?.snap?.enabled !== false && step > 0) {
    next = min + (Math.round((next - min) / step) * step);
  }

  next = clamp(next, Math.min(min, max), Math.max(min, max));
  return type === 'int' ? Math.round(next) : next;
}

export function nextCustomEnumValue(channel, currentValue) {
  const explicitValues = Array.isArray(channel?.values) ? channel.values : (Array.isArray(channel?.options) ? channel.options : []);
  const values = explicitValues
    .map((entry) => entry?.value ?? entry?.id ?? entry)
    .filter((entry) => entry !== undefined && entry !== null);
  const fallback = ['A', 'B'];
  const cycleValues = values.length ? values : fallback;
  const currentIndex = cycleValues.findIndex((entry) => String(entry) === String(currentValue));
  const nextIndex = currentIndex < 0 || currentIndex >= cycleValues.length - 1 ? 0 : currentIndex + 1;
  return cycleValues[nextIndex];
}

function payloadNormalized(payload, keys = ['normalized', 'valueNormalized', 'cellNormalized']) {
  for (const key of keys) {
    if (payload?.[key] !== undefined && payload?.[key] !== null) {
      return clamp(numberOr(payload[key], 0), 0, 1);
    }
  }
  return null;
}

function payloadRawValue(channel, payload) {
  const type = String(channel?.type ?? 'float').trim().toLowerCase();
  if (type === 'int') {
    if (payload?.value !== undefined) return payload.value;
    if (payload?.cellIndex !== undefined) return payload.cellIndex;
    if (payload?.noteNumber !== undefined) return payload.noteNumber;
    if (payload?.keyIndex !== undefined) return payload.keyIndex;
  }
  if (type === 'enum') {
    return payload?.value ?? payload?.noteName ?? payload?.cellNumber ?? payload?.keyNumber ?? payload?.cellIndex ?? payload?.keyIndex;
  }
  return payload?.value ?? payload?.noteNumber ?? null;
}

function valueFromPayload(channel, payload, normalizedKeys) {
  const normalized = payloadNormalized(payload, normalizedKeys);
  if (normalized !== null) {
    return {
      value: denormalizeCustomChannelValue(channel, normalized),
      normalized,
    };
  }

  const rawValue = payloadRawValue(channel, payload);
  const value = snapCustomChannelValue(channel, rawValue);
  return {
    value,
    normalized: normalizeCustomChannelValue(channel, value),
  };
}

function applyPayloadValue(nextValues, channels, channelName, payload, normalizedKeys) {
  if (!channelName || !channels?.[channelName]) return null;
  const result = valueFromPayload(channels[channelName], payload, normalizedKeys);
  nextValues[channelName] = result.value;
  return result;
}

function applyHitZonePayloadValues(nextValues, channels, hitZone, channelName, action = '') {
  const normalizedKeys = String(action).toLowerCase() === 'notevalue'
    ? []
    : ['normalized', 'cellNormalized'];
  const result = applyPayloadValue(nextValues, channels, channelName, hitZone?.payload, normalizedKeys);
  applyPayloadValue(
    nextValues,
    channels,
    hitZone?.targetValueChannelX ?? hitZone?.targetXValueChannel,
    hitZone?.payload,
    ['xNormalized', 'columnNormalized']
  );
  applyPayloadValue(
    nextValues,
    channels,
    hitZone?.targetValueChannelY ?? hitZone?.targetYValueChannel,
    hitZone?.payload,
    ['yNormalized', 'rowNormalized']
  );
  return result;
}

export function resolveCustomHitZoneProbeValues(control, hitZoneEntry = null, seedValues = {}) {
  const hitZone = hitZoneEntry?.zone ?? hitZoneEntry ?? null;
  const behaviors = getCustomBehaviors(control);
  const channels = getCustomValueChannels(control);
  const behaviorName = hitZone?.targetBehavior ?? '';
  const behaviorModule = behaviors?.[behaviorName] ?? null;
  const channelName = hitZone?.targetValueChannel ?? behaviorModule?.valueChannel ?? 'mainValue';
  const channel = channels?.[channelName] ?? null;
  if (!hitZone || !channel) return { ...seedCustomValues(control), ...(seedValues ?? {}) };

  const action = String(hitZone?.action ?? behaviorModule?.type ?? 'setValue').trim().toLowerCase();
  const previousValues = {
    ...seedCustomValues(control),
    ...(seedValues ?? {}),
  };
  const currentValue = previousValues[channelName] ?? customChannelDefaultValue(channel);
  const nextValues = { ...previousValues };

  if (action === 'cyclevalue' || (String(behaviorModule?.type ?? '') === 'cycle' && !['setvalue', 'selectvalue', 'cellvalue', 'notevalue'].includes(action))) {
    nextValues[channelName] = nextCustomEnumValue(channel, currentValue);
  } else if (action === 'togglevalue' || (String(behaviorModule?.type ?? '') === 'toggle' && !['setvalue', 'selectvalue', 'cellvalue', 'notevalue'].includes(action))) {
    nextValues[channelName] = !snapCustomChannelValue({ ...channel, type: 'bool' }, currentValue);
  } else if (action === 'setitemvalue' && isArrayValueChannel(channel) && !isObjectArrayChannel(channel)) {
    const index = Math.round(numberOr(hitZone?.payload?.index, -1));
    const items = arrayChannelItems(channel, currentValue);
    if (index >= 0 && index < items.length) {
      items[index] = denormalizeArrayChannelItem(
        channel,
        payloadNormalized(hitZone?.payload) ?? hitZone?.probeNormalized ?? 0.75
      );
      nextValues[channelName] = items;
    }
  } else if (['setvalue', 'selectvalue', 'cellvalue', 'notevalue'].includes(action) && hitZone?.payload) {
    applyHitZonePayloadValues(nextValues, channels, hitZone, channelName, action);
  } else if (['dragvalue', 'setvalue', 'slider', 'dial', 'ring'].includes(action) || ['slider', 'dial', 'ring', 'xy-pad'].includes(String(behaviorModule?.type ?? '').trim().toLowerCase())) {
    const normalized = hitZone?.payload?.normalized ?? hitZone?.probeNormalized ?? 0.75;
    nextValues[channelName] = denormalizeCustomChannelValue(channel, normalized);
    const secondaryChannelName = resolveSecondaryChannelName(hitZone, behaviorModule, channelName);
    if (secondaryChannelName && channels?.[secondaryChannelName]) {
      const secondaryNormalized = hitZone?.payload?.yNormalized ?? hitZone?.payload?.rowNormalized ?? hitZone?.probeYNormalized ?? 0.25;
      nextValues[secondaryChannelName] = denormalizeCustomChannelValue(channels[secondaryChannelName], secondaryNormalized);
    }
  }

  return constrainCustomValues(control, nextValues, { primaryChannelName: channelName });
}

// Evaluate a single `channel op value` comparison. Returns a boolean, or null
// when the text is not a recognizable comparison (caller decides leniency).
function comparisonMatches(text, values) {
  const match = String(text ?? '').trim().match(/^([A-Za-z_$][\w$]*)\s*(={2,3}|!==|!=|>=|<=|>|<)\s*['"]?([^'"]*)['"]?$/);
  if (!match) return null;
  const left = values?.[match[1]];
  const right = match[3];
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  switch (match[2]) {
    case '===':
    case '==':
      return String(left ?? '') === right;
    case '!==':
    case '!=':
      return String(left ?? '') !== right;
    case '>=':
      return numeric ? leftNumber >= rightNumber : String(left ?? '') >= right;
    case '<=':
      return numeric ? leftNumber <= rightNumber : String(left ?? '') <= right;
    case '>':
      return numeric ? leftNumber > rightNumber : String(left ?? '') > right;
    case '<':
      return numeric ? leftNumber < rightNumber : String(left ?? '') < right;
    default:
      return null;
  }
}

// Supports compound conditions joined with `&&` (all) and `||` (any). `||` has
// the lower precedence, matching the structured builder's "match all / any"
// groups. An unparseable clause stays lenient (treated as satisfied) so legacy
// free-text conditions keep behaving as they did before.
function conditionMatches(condition, values) {
  const text = String(condition ?? '').trim();
  if (!text) return true;
  return text.split('||').some((orPart) =>
    orPart.split('&&').every((andPart) => {
      const result = comparisonMatches(andPart, values);
      return result === null ? true : result;
    })
  );
}

// Shared with state rules (interactionRuntime) so links, hit zones, and
// visual states all evaluate the same condition language.
export { conditionMatches as customConditionMatches };

function resolveSwitchLinkValue(link, values) {
  const sourceName = String(link?.source ?? '').trim();
  const sourceValue = values?.[sourceName];
  const cases = link?.cases ?? link?.map ?? null;
  if (cases && typeof cases === 'object' && cases[sourceValue] !== undefined) {
    const caseTarget = cases[sourceValue];
    return values?.[caseTarget] ?? caseTarget;
  }

  const directName = `value${sourceValue}`;
  if (values?.[directName] !== undefined) return values[directName];
  const lowerName = `value${String(sourceValue ?? '').toUpperCase()}`;
  if (values?.[lowerName] !== undefined) return values[lowerName];
  return undefined;
}

function literalOrValue(values, token, fallback = undefined) {
  if (token === undefined || token === null || token === '') return fallback;
  if (typeof token === 'boolean' || typeof token === 'number') return token;
  if (Object.prototype.hasOwnProperty.call(values, token)) return values[token];
  if (token === 'true') return true;
  if (token === 'false') return false;
  const numeric = Number(token);
  if (Number.isFinite(numeric)) return numeric;
  return token;
}

function linkSourceValue(link, values) {
  if (link?.value !== undefined) return link.value;
  return literalOrValue(values, String(link?.source ?? '').trim());
}

function mapNumericValue(link, sourceValue) {
  const numeric = numberOr(sourceValue, numberOr(link?.inputMin, 0));
  const inputMin = numberOr(link?.inputMin, 0);
  const inputMax = numberOr(link?.inputMax, 1);
  const outputMin = numberOr(link?.outputMin, inputMin);
  const outputMax = numberOr(link?.outputMax, inputMax);
  const span = inputMax - inputMin;
  const normalized = Math.abs(span) < 0.000001 ? 0 : (numeric - inputMin) / span;
  const mapped = outputMin + ((outputMax - outputMin) * normalized);
  const clamped = link?.clamp === false
    ? mapped
    : clamp(mapped, Math.min(outputMin, outputMax), Math.max(outputMin, outputMax));
  return link?.round === true ? Math.round(clamped) : clamped;
}

function snapLinkedValue(control, target, value) {
  const channel = getCustomValueChannels(control)?.[target];
  return channel ? snapCustomChannelValue(channel, value) : value;
}

export function applyCustomLinks(control, values = {}) {
  const linksRoot = control?._children?.Links;
  if (linksRoot?.enabled === false) return { values: { ...values }, targets: new Set() };

  const nextValues = { ...values };
  const targets = new Set();
  for (const link of Object.values(getCustomLinks(control))) {
    if (!link || link.enabled === false || !conditionMatches(link.condition, nextValues)) continue;
    const target = String(link.target ?? '').trim();
    if (!target) continue;

    const type = String(link.type ?? 'map').trim().toLowerCase();
    const sourceValue = linkSourceValue(link, nextValues);
    let nextValue;
    if (['mirror', 'route-value', 'external-input', 'external-output'].includes(type)) {
      nextValue = sourceValue;
    } else if (type === 'map') {
      nextValue = link?.inputMin !== undefined || link?.inputMax !== undefined || link?.outputMin !== undefined || link?.outputMax !== undefined
        ? mapNumericValue(link, sourceValue)
        : sourceValue;
    } else if (type === 'offset') {
      nextValue = numberOr(sourceValue, 0) + numberOr(link?.amount ?? link?.offset, 0);
    } else if (type === 'clamp') {
      const min = numberOr(link?.min, 0);
      const max = numberOr(link?.max, 1);
      nextValue = clamp(numberOr(sourceValue, min), Math.min(min, max), Math.max(min, max));
    } else if (type === 'condition') {
      nextValue = conditionMatches(link?.expression || link?.condition, nextValues)
        ? literalOrValue(nextValues, link?.trueValue ?? link?.whenTrue, sourceValue)
        : literalOrValue(nextValues, link?.falseValue ?? link?.whenFalse, nextValues[target]);
    } else if (type === 'switch') {
      nextValue = resolveSwitchLinkValue(link, nextValues);
    } else if (type === 'toggle') {
      nextValue = !nextValues[target];
    } else if (type === 'reset') {
      nextValue = customChannelResetValue(getCustomValueChannels(control)?.[target]);
    } else if (type === 'enable-disable' || type === 'show-hide') {
      const boolValue = sourceValue === true || sourceValue === 'true' || Number(sourceValue) >= 0.5;
      nextValue = link?.invert === true ? !boolValue : boolValue;
    }

    if (nextValue === undefined) continue;
    nextValues[target] = snapLinkedValue(control, target, nextValue);
    targets.add(target);
  }

  return { values: nextValues, targets };
}

// Resolve a follow-mode hit zone's pixel rect from its source part (or the
// control face), grown by `inflate` and clamped up to `minTouch`. Returns null
// for independent zones or when the source can't be resolved, so the caller
// falls back to the authored `bounds`.
function followModeZoneRect(zone, rect, parts) {
  const source = String(zone?.source ?? 'independent');
  if (source === 'independent') return null;

  let base = null;
  if (source === 'face') {
    base = { x: 0, y: 0, width: rect.width, height: rect.height };
  } else if (source.startsWith('part:')) {
    const partName = source.slice('part:'.length);
    const layout = parts?.[partName]?._children?.Layout ?? null;
    base = layout ? resolvePartPixelRect(layout, rect.width, rect.height) : null;
  }
  if (!base) return null;

  const inflate = zone?.inflate ?? {};
  const percentUnit = String(inflate.unit ?? 'px') === 'percent';
  const inflateX = percentUnit ? (numberOr(inflate.x, 0) / 100) * rect.width : numberOr(inflate.x, 0);
  const inflateY = percentUnit ? (numberOr(inflate.y, 0) / 100) * rect.height : numberOr(inflate.y, 0);
  let resolved = {
    x: base.x - inflateX,
    y: base.y - inflateY,
    width: base.width + inflateX * 2,
    height: base.height + inflateY * 2,
  };

  const minTouch = numberOr(zone?.minTouch, 0);
  if (minTouch > 0) {
    if (resolved.width < minTouch) {
      resolved.x -= (minTouch - resolved.width) / 2;
      resolved.width = minTouch;
    }
    if (resolved.height < minTouch) {
      resolved.y -= (minTouch - resolved.height) / 2;
      resolved.height = minTouch;
    }
  }
  return resolved;
}

export function customHitZoneRect(zone, rect, parts = null) {
  const followRect = rect ? followModeZoneRect(zone, rect, parts) : null;
  if (followRect) return followRect;

  const bounds = zone?.bounds ?? {};
  const unit = String(bounds.unit ?? 'percent') === 'px' ? 'px' : 'percent';
  const width = Math.max(0, numberOr(bounds.width, 100));
  const height = Math.max(0, numberOr(bounds.height, 100));
  const x = numberOr(bounds.x, 0);
  const y = numberOr(bounds.y, 0);

  if (unit === 'px') {
    return { x, y, width, height };
  }

  return {
    x: (x / 100) * rect.width,
    y: (y / 100) * rect.height,
    width: (width / 100) * rect.width,
    height: (height / 100) * rect.height,
  };
}

function isPointInZone(zone, rect, localX, localY, parts = null) {
  const zoneRect = customHitZoneRect(zone, rect, parts);
  const insideBox = localX >= zoneRect.x
    && localX <= zoneRect.x + zoneRect.width
    && localY >= zoneRect.y
    && localY <= zoneRect.y + zoneRect.height;
  if (!insideBox) return false;

  const shape = String(zone?.shape ?? 'rectangle').trim().toLowerCase();
  if (!['circle', 'ellipse', 'ring'].includes(shape)) return true;

  const radiusX = Math.max(1, zoneRect.width / 2);
  const radiusY = Math.max(1, zoneRect.height / 2);
  const centerX = zoneRect.x + radiusX;
  const centerY = zoneRect.y + radiusY;
  const normalizedDistance = ((localX - centerX) ** 2) / (radiusX ** 2)
    + ((localY - centerY) ** 2) / (radiusY ** 2);
  if (shape !== 'ring') return normalizedDistance <= 1;

  const radialDistance = Math.sqrt(Math.max(0, normalizedDistance));
  const innerRadius = clamp(numberOr(zone?.innerRadius, zone?.innerRadiusPercent ?? 0.62), 0, 1);
  const outerRadius = clamp(numberOr(zone?.outerRadius, zone?.outerRadiusPercent ?? 1), innerRadius, 1);
  if (radialDistance > outerRadius || radialDistance < innerRadius) return false;

  if (zone?.startAngle !== undefined || zone?.endAngle !== undefined || zone?.sweepAngle !== undefined) {
    return angleInCircularSweep(dialAngleFromPoint(localX, localY, centerX, centerY), zone);
  }
  return true;
}

export function resolveCustomHitZoneAtPoint(control, rect, clientX, clientY, values = {}) {
  if (!rect) return null;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const parts = control?._children?.Parts?._children ?? null;
  const conditionValues = constrainCustomValues(control, values ?? {});
  const entries = enabledEntries(getCustomHitZones(control))
    .filter(([, zone]) => conditionMatches(zone?.condition, conditionValues))
    .sort((left, right) => {
      const priorityDelta = numberOr(right[1]?.priority, 0) - numberOr(left[1]?.priority, 0);
      if (priorityDelta !== 0) return priorityDelta;
      const leftRect = customHitZoneRect(left[1], rect, parts);
      const rightRect = customHitZoneRect(right[1], rect, parts);
      const leftArea = Math.max(0, leftRect.width) * Math.max(0, leftRect.height);
      const rightArea = Math.max(0, rightRect.width) * Math.max(0, rightRect.height);
      return leftArea - rightArea;
    });

  for (const [name, zone] of entries) {
    if (isPointInZone(zone, rect, localX, localY, parts)) {
      return { name, zone };
    }
  }

  return null;
}

export function resolveCustomNormalizedFromPoint(behaviorModule, rect, clientX, clientY, dragContext = null) {
  if (!rect) return 0;
  const localX = clamp(clientX - rect.left, 0, rect.width);
  const localY = clamp(clientY - rect.top, 0, rect.height);
  const geometry = String(behaviorModule?.geometry ?? 'linear').trim().toLowerCase();
  const configuredDragMode = String(behaviorModule?.dragMode ?? 'auto').trim().toLowerCase();
  const dragMode = configuredDragMode === 'auto'
    ? (['vertical', 'linear-vertical'].includes(geometry) ? 'vertical'
      : (['circular', 'ring', 'dial', 'arc'].includes(geometry) ? 'circular' : 'horizontal'))
    : configuredDragMode;
  // 'relative' is an explicit, geometry-agnostic mode (the standard DAW knob
  // feel): pointer movement nudges the value from where it was grabbed, so it
  // also covers dials, not just linear modes.
  const RELATIVE_MODES = ['vertical', 'horizontal', 'both', 'free', 'relative'];
  const hasDragStart = dragContext
    && Number.isFinite(Number(dragContext.startClientX))
    && Number.isFinite(Number(dragContext.startClientY))
    && Number.isFinite(Number(dragContext.startNormalized));

  if (hasDragStart && RELATIVE_MODES.includes(dragMode)) {
    // Fine-drag modifier (Shift): slow the drag for precise adjustment.
    const fineScale = dragContext?.fine ? 0.25 : 1;
    const sensitivity = Math.max(0.01, numberOr(behaviorModule?.dragSensitivity, 1)) * fineScale;
    const deltaX = (clientX - dragContext.startClientX) / Math.max(1, rect.width);
    const deltaY = (dragContext.startClientY - clientY) / Math.max(1, rect.height);
    const rawMovement = (dragMode === 'vertical' || dragMode === 'relative')
      ? deltaY
      : (dragMode === 'horizontal'
        ? deltaX
        : (Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY));
    const movement = isCustomMouseDirectionReversed(behaviorModule) ? -rawMovement : rawMovement;
    return clamp(numberOr(dragContext.startNormalized, 0) + (movement * sensitivity), 0, 1);
  }

  if (['vertical', 'linear-vertical'].includes(geometry)) {
    return applyCustomMouseDirection(behaviorModule, 1 - (localY / Math.max(1, rect.height)));
  }

  if (['circular', 'ring', 'dial', 'arc'].includes(geometry) && !RELATIVE_MODES.includes(dragMode)) {
    const centerX = rect.width * (clamp(numberOr(behaviorModule?.centerX, 50), 0, 100) / 100);
    const centerY = rect.height * (clamp(numberOr(behaviorModule?.centerY, 50), 0, 100) / 100);
    const angle = dialAngleFromPoint(localX, localY, centerX, centerY);
    return applyCustomMouseDirection(behaviorModule, normalizedFromDialAngle(angle, behaviorModule));
  }

  if (geometry === 'grid-y') {
    return applyCustomMouseDirection(behaviorModule, localY / Math.max(1, rect.height));
  }

  return applyCustomMouseDirection(behaviorModule, localX / Math.max(1, rect.width));
}

function resolveCustomXYNormalizedFromPoint(rect, clientX, clientY) {
  if (!rect) return { x: 0, y: 0 };
  const localX = clamp(clientX - rect.left, 0, rect.width);
  const localY = clamp(clientY - rect.top, 0, rect.height);
  return {
    x: clamp(localX / Math.max(1, rect.width), 0, 1),
    y: clamp(1 - (localY / Math.max(1, rect.height)), 0, 1),
  };
}

function resolveSecondaryChannelName(hitZone, behaviorModule, primaryChannelName) {
  const explicit = hitZone?.targetValueChannelY
    ?? hitZone?.targetYValueChannel
    ?? behaviorModule?.targetValueChannelY
    ?? behaviorModule?.targetYValueChannel;
  if (explicit) return explicit;

  const channels = Array.isArray(behaviorModule?.valueChannels)
    ? behaviorModule.valueChannels.filter(Boolean)
    : [];
  return channels.find((name) => name !== primaryChannelName) ?? '';
}

export function resolveCustomInteractionPatch(control, session = {}, hitZoneEntry = null, point = null) {
  const hitZone = hitZoneEntry?.zone ?? null;
  const arpeggiatorEdit = resolveRuntimeArpeggiatorEdit(control, session?.customValues ?? {}, hitZone, point);
  if (arpeggiatorEdit) {
    const customValues = syncCustomArpeggiatorValues(control, {
      ...seedCustomValues(control),
      ...(session?.customValues ?? {}),
      [CUSTOM_ARP_RUNTIME_KEY]: arpeggiatorEdit,
    });
    return {
      customValues,
      customNormalizedValue: session?.customNormalizedValue,
      activeCustomBehavior: 'arpeggiator',
      activeCustomHitZone: hitZoneEntry?.name ?? '',
      valueOverrideEnabled: session?.valueOverrideEnabled === true,
      valueOverride: session?.valueOverride,
    };
  }

  const behaviors = getCustomBehaviors(control);
  const channels = getCustomValueChannels(control);
  const behaviorName = hitZone?.targetBehavior ?? '';
  const behaviorModule = behaviors?.[behaviorName] ?? null;
  const channelName = hitZone?.targetValueChannel ?? behaviorModule?.valueChannel ?? 'mainValue';
  const channel = channels?.[channelName] ?? null;
  if (!channel) return {};

  const action = String(hitZone?.action ?? behaviorModule?.type ?? 'dragValue').trim().toLowerCase();
  const previousValues = {
    ...seedCustomValues(control),
    ...(session?.customValues ?? {}),
  };
  const currentValue = previousValues[channelName] ?? customChannelDefaultValue(channel);
  let nextValue = currentValue;
  let normalized = normalizeCustomChannelValue(channel, currentValue);
  const nextValues = { ...previousValues };

  if (action === 'cyclevalue' || (String(behaviorModule?.type ?? '') === 'cycle' && !['setvalue', 'selectvalue', 'cellvalue', 'notevalue'].includes(action))) {
    nextValue = nextCustomEnumValue(channel, currentValue);
    normalized = normalizeCustomChannelValue(channel, nextValue);
  } else if (action === 'togglevalue' || (String(behaviorModule?.type ?? '') === 'toggle' && !['setvalue', 'selectvalue', 'cellvalue', 'notevalue'].includes(action))) {
    nextValue = !snapCustomChannelValue({ ...channel, type: 'bool' }, currentValue);
    normalized = nextValue ? 1 : 0;
  } else if (action === 'setitemvalue' && isArrayValueChannel(channel) && !isObjectArrayChannel(channel)) {
    // Indexed repeats (§12.4): the zone edits ONE item of a scalar array
    // channel. Vertical position inside the zone is the item value (top =
    // max). Object-item channels have their own editors (e.g. the arp grid).
    const index = Math.round(numberOr(hitZone?.payload?.index, -1));
    const items = arrayChannelItems(channel, previousValues[channelName]);
    if (index >= 0 && index < items.length) {
      const itemNormalized = point?.rect
        ? clamp(1 - ((point.clientY - point.rect.top) / Math.max(1, point.rect.height)), 0, 1)
        : (payloadNormalized(hitZone?.payload) ?? 1);
      items[index] = denormalizeArrayChannelItem(channel, itemNormalized);
      nextValue = items;
      normalized = itemNormalized;
    }
  } else if (['setvalue', 'selectvalue', 'cellvalue', 'notevalue'].includes(action) && hitZone?.payload) {
    const result = applyHitZonePayloadValues(nextValues, channels, hitZone, channelName, action);
    nextValue = result?.value ?? nextValue;
    normalized = result?.normalized ?? normalized;
  } else if (point?.rect) {
    const geometry = String(behaviorModule?.geometry ?? '').trim().toLowerCase();
    const type = String(behaviorModule?.type ?? '').trim().toLowerCase();
    if (geometry === 'grid' || geometry === 'xy' || type.includes('xy')) {
      const xy = resolveCustomXYNormalizedFromPoint(point.rect, point.clientX, point.clientY);
      normalized = xy.x;
      const secondaryChannelName = resolveSecondaryChannelName(hitZone, behaviorModule, channelName);
      if (secondaryChannelName && channels?.[secondaryChannelName]) {
        nextValues[secondaryChannelName] = denormalizeCustomChannelValue(channels[secondaryChannelName], xy.y);
      }
    } else {
      normalized = resolveCustomNormalizedFromPoint(behaviorModule, point.rect, point.clientX, point.clientY, {
        startClientX: point.startClientX,
        startClientY: point.startClientY,
        startNormalized: point.startNormalized ?? normalizeCustomChannelValue(channel, point.startValues?.[channelName] ?? currentValue),
        fine: point.fine === true,
      });
    }
    nextValue = denormalizeCustomChannelValue(channel, normalized);
  }
  nextValues[channelName] = nextValue;
  const constrainedValues = constrainCustomValues(control, nextValues, { primaryChannelName: channelName });
  const linked = applyCustomLinks(control, constrainedValues);
  const linkedValues = syncCustomArpeggiatorValues(control, constrainCustomValues(control, linked.values, { primaryChannelName: channelName }));
  const mainChannel = channels?.mainValue ?? channel;
  const mainTouched = channelName === 'mainValue'
    || linked.targets.has('mainValue')
    || (previousValues.mainValue !== undefined && linkedValues.mainValue !== previousValues.mainValue);
  const mainValue = linkedValues.mainValue;
  const mainNormalized = mainTouched ? normalizeCustomChannelValue(mainChannel, mainValue) : session?.customNormalizedValue;

  return {
    customValues: linkedValues,
    customNormalizedValue: mainTouched ? mainNormalized : session?.customNormalizedValue,
    activeCustomBehavior: behaviorName,
    activeCustomHitZone: hitZoneEntry?.name ?? '',
    valueOverrideEnabled: mainTouched,
    valueOverride: mainTouched ? mainValue : session?.valueOverride,
  };
}
