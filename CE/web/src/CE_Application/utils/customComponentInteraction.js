import {
  CUSTOM_ARP_RUNTIME_KEY,
  resolveRuntimeArpeggiatorEdit,
  syncCustomArpeggiatorValues,
} from './customComponentArpeggiator.js';

function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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

export function customChannelDefaultValue(channel) {
  if (!channel) return 0;
  return channel.currentValue ?? channel.defaultValue ?? (String(channel.type ?? '') === 'bool' ? false : 0);
}

function customChannelResetValue(channel) {
  if (!channel) return 0;
  return channel.defaultValue ?? channel.currentValue ?? (String(channel.type ?? '') === 'bool' ? false : 0);
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
  if (type === 'enum') return nextCustomEnumValue(channel, customChannelDefaultValue(channel));

  const min = numberOr(channel?.min, 0);
  const max = numberOr(channel?.max, 1);
  return snapCustomChannelValue(channel, min + ((max - min) * clamped));
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

  if (action === 'cyclevalue' || String(behaviorModule?.type ?? '') === 'cycle') {
    nextValues[channelName] = nextCustomEnumValue(channel, currentValue);
  } else if (action === 'togglevalue' || String(behaviorModule?.type ?? '') === 'toggle') {
    nextValues[channelName] = !snapCustomChannelValue({ ...channel, type: 'bool' }, currentValue);
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

  return nextValues;
}

function conditionMatches(condition, values) {
  const text = String(condition ?? '').trim();
  if (!text) return true;
  const match = text.match(/^([A-Za-z_$][\w$]*)\s*(={2,3}|!==|!=|>=|<=|>|<)\s*['"]?([^'"]+)['"]?$/);
  if (!match) return true;
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
      return true;
  }
}

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

export function customHitZoneRect(zone, rect) {
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

function isPointInZone(zone, rect, localX, localY) {
  const zoneRect = customHitZoneRect(zone, rect);
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

export function resolveCustomHitZoneAtPoint(control, rect, clientX, clientY) {
  if (!rect) return null;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const entries = enabledEntries(getCustomHitZones(control))
    .sort((left, right) => {
      const priorityDelta = numberOr(right[1]?.priority, 0) - numberOr(left[1]?.priority, 0);
      if (priorityDelta !== 0) return priorityDelta;
      const leftRect = customHitZoneRect(left[1], rect);
      const rightRect = customHitZoneRect(right[1], rect);
      const leftArea = Math.max(0, leftRect.width) * Math.max(0, leftRect.height);
      const rightArea = Math.max(0, rightRect.width) * Math.max(0, rightRect.height);
      return leftArea - rightArea;
    });

  for (const [name, zone] of entries) {
    if (isPointInZone(zone, rect, localX, localY)) {
      return { name, zone };
    }
  }

  return null;
}

export function resolveCustomNormalizedFromPoint(behaviorModule, rect, clientX, clientY) {
  if (!rect) return 0;
  const localX = clamp(clientX - rect.left, 0, rect.width);
  const localY = clamp(clientY - rect.top, 0, rect.height);
  const geometry = String(behaviorModule?.geometry ?? 'linear').trim().toLowerCase();

  if (['vertical', 'linear-vertical'].includes(geometry)) {
    return applyCustomMouseDirection(behaviorModule, 1 - (localY / Math.max(1, rect.height)));
  }

  if (['circular', 'ring', 'dial', 'arc'].includes(geometry)) {
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

  if (action === 'cyclevalue' || String(behaviorModule?.type ?? '') === 'cycle') {
    nextValue = nextCustomEnumValue(channel, currentValue);
    normalized = normalizeCustomChannelValue(channel, nextValue);
  } else if (action === 'togglevalue' || String(behaviorModule?.type ?? '') === 'toggle') {
    nextValue = !snapCustomChannelValue({ ...channel, type: 'bool' }, currentValue);
    normalized = nextValue ? 1 : 0;
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
      normalized = resolveCustomNormalizedFromPoint(behaviorModule, point.rect, point.clientX, point.clientY);
    }
    nextValue = denormalizeCustomChannelValue(channel, normalized);
  }
  nextValues[channelName] = nextValue;
  const linked = applyCustomLinks(control, nextValues);
  const linkedValues = syncCustomArpeggiatorValues(control, linked.values);
  const mainChannel = channels?.mainValue ?? channel;
  const mainTouched = channelName === 'mainValue' || linked.targets.has('mainValue');
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
