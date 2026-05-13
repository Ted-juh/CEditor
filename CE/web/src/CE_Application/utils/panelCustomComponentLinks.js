import {
  normalizeCustomChannelValue,
  seedCustomValues,
  snapCustomChannelValue,
} from './customComponentInteraction.js';
import { syncCustomArpeggiatorValues } from './customComponentArpeggiator.js';

function controlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function controlName(control) {
  return String(control?._children?.Core?.name ?? controlId(control) ?? '');
}

function isCustomComponent(control) {
  return String(control?._children?.Core?.controlType ?? '') === 'CustomComponent';
}

function publishedEntries(control, direction) {
  const published = control?._children?.PublishedProperties ?? {};
  const entries = direction === 'output' ? published.outputs : published.inputs;
  const channels = control?._children?.ValueChannels?._children ?? {};
  return Object.entries(entries ?? {})
    .filter(([, entry]) => entry?.enabled !== false)
    .map(([name, entry]) => {
      const channelName = String(entry?.channel || name);
      const channel = channels[channelName] ?? {};
      return {
        controlId: controlId(control),
        controlName: controlName(control),
        direction,
        name,
        channel: channelName,
        label: String(entry?.label || name),
        type: String(entry?.type ?? channel?.type ?? 'float'),
        min: entry?.min ?? channel?.min,
        max: entry?.max ?? channel?.max,
        step: entry?.step ?? channel?.step,
        defaultValue: entry?.defaultValue ?? channel?.defaultValue,
        values: Array.isArray(entry?.values) ? [...entry.values] : (Array.isArray(channel?.values) ? [...channel.values] : undefined),
      };
    });
}

export function listPanelCustomApiEndpoints(controls = []) {
  return (Array.isArray(controls) ? controls : [])
    .filter(isCustomComponent)
    .flatMap((control) => [
      ...publishedEntries(control, 'input'),
      ...publishedEntries(control, 'output'),
    ]);
}

export function endpointKey(endpoint) {
  if (!endpoint) return '';
  return `${endpoint.controlId}.${endpoint.channel}`;
}

export function endpointDisplayName(endpoint) {
  if (!endpoint) return '';
  const control = String(endpoint.controlName || endpoint.controlId || 'Component');
  const label = String(endpoint.label || endpoint.name || endpoint.channel || 'value');
  return `${control} / ${label}`;
}

function typeFamily(type) {
  const normalized = String(type || 'float').trim().toLowerCase();
  if (['float', 'int', 'integer', 'number', 'normalized', 'bipolar', 'note', 'velocity'].includes(normalized)) return 'numeric';
  if (['bool', 'boolean', 'toggle', 'trigger'].includes(normalized)) return 'boolean';
  if (['enum', 'choice', 'select', 'text', 'string'].includes(normalized)) return 'choice';
  if (['color', 'colour'].includes(normalized)) return 'color';
  return normalized || 'value';
}

function numericBounds(endpoint) {
  const min = Number(endpoint?.min);
  const max = Number(endpoint?.max);
  return {
    hasMin: Number.isFinite(min),
    hasMax: Number.isFinite(max),
    min,
    max,
  };
}

function enumValues(endpoint) {
  return Array.isArray(endpoint?.values)
    ? endpoint.values.map((value) => String(value ?? '')).filter(Boolean)
    : [];
}

function hasDifferentNumericBounds(source, target) {
  const sourceBounds = numericBounds(source);
  const targetBounds = numericBounds(target);
  if (!sourceBounds.hasMin && !sourceBounds.hasMax && !targetBounds.hasMin && !targetBounds.hasMax) return false;
  return sourceBounds.min !== targetBounds.min || sourceBounds.max !== targetBounds.max;
}

export function endpointTypeCompatibility(source, target) {
  const sourceFamily = typeFamily(source?.type);
  const targetFamily = typeFamily(target?.type);
  if (!source || !target) {
    return { status: 'missing', warning: 'Choose a source output and target input.' };
  }
  if (sourceFamily === targetFamily) {
    if (sourceFamily === 'choice') {
      const sourceValues = enumValues(source);
      const targetValues = enumValues(target);
      if (sourceValues.length && targetValues.length) {
        const overlap = sourceValues.filter((value) => targetValues.includes(value));
        if (!overlap.length) return { status: 'warning', warning: 'Choices do not overlap; route may not change the target.' };
        if (overlap.length < Math.max(sourceValues.length, targetValues.length)) {
          return { status: 'convert', warning: `Choices partially overlap: ${overlap.join(', ')}.` };
        }
      }
    }
    if (sourceFamily === 'numeric' && hasDifferentNumericBounds(source, target)) {
      return { status: 'convert', warning: 'Numeric ranges differ; values will be snapped to the target range.' };
    }
    return { status: 'compatible', warning: '' };
  }
  if (sourceFamily === 'numeric' && targetFamily === 'boolean') {
    return { status: 'convert', warning: 'Numeric values will act as off/on thresholds.' };
  }
  if (sourceFamily === 'boolean' && targetFamily === 'numeric') {
    return { status: 'convert', warning: 'Boolean output will become 0 or 1.' };
  }
  if (sourceFamily === 'numeric' && targetFamily === 'choice') {
    return { status: 'convert', warning: 'Numeric output may need snapping to the target choices.' };
  }
  return { status: 'warning', warning: `${source?.type || 'value'} output routed into ${target?.type || 'value'} input.` };
}

export function convertPanelRouteValue(sourceEndpoint, targetEndpoint, rawValue) {
  const sourceFamily = typeFamily(sourceEndpoint?.type);
  const targetFamily = typeFamily(targetEndpoint?.type);
  if (!targetEndpoint) return rawValue;

  if (sourceFamily === 'numeric' && targetFamily === 'numeric') {
    const normalized = normalizeCustomChannelValue({ type: 'float', min: sourceEndpoint?.min ?? 0, max: sourceEndpoint?.max ?? 1 }, rawValue);
    return snapCustomChannelValue(targetEndpoint, denormalizeRouteNumericValue(targetEndpoint, normalized));
  }

  if (sourceFamily === 'boolean' && targetFamily === 'numeric') {
    return snapCustomChannelValue(targetEndpoint, rawValue === true || rawValue === 'true' || Number(rawValue) >= 0.5 ? (targetEndpoint?.max ?? 1) : (targetEndpoint?.min ?? 0));
  }

  if (sourceFamily === 'numeric' && targetFamily === 'boolean') {
    return snapCustomChannelValue(targetEndpoint, normalizeCustomChannelValue(sourceEndpoint, rawValue) >= 0.5);
  }

  if (sourceFamily === 'numeric' && targetFamily === 'choice') {
    const values = enumValues(targetEndpoint);
    if (!values.length) return snapCustomChannelValue(targetEndpoint, rawValue);
    const normalized = normalizeCustomChannelValue(sourceEndpoint, rawValue);
    const index = Math.max(0, Math.min(values.length - 1, Math.round(normalized * (values.length - 1))));
    return values[index];
  }

  if (sourceFamily === 'choice' && targetFamily === 'choice') {
    const values = enumValues(targetEndpoint);
    const text = String(rawValue ?? '');
    if (!values.length || values.includes(text)) return snapCustomChannelValue(targetEndpoint, rawValue);
    return targetEndpoint?.defaultValue ?? values[0] ?? '';
  }

  return snapCustomChannelValue(targetEndpoint, rawValue);
}

function denormalizeRouteNumericValue(endpoint, normalized) {
  const min = numberOr(endpoint?.min, 0);
  const max = numberOr(endpoint?.max, 1);
  return min + ((max - min) * Math.max(0, Math.min(1, numberOr(normalized, 0))));
}

export function listPanelCustomRouteCandidates(controls = [], selectedControlId = '') {
  const endpoints = listPanelCustomApiEndpoints(controls);
  const outputs = endpoints.filter((endpoint) => endpoint.direction === 'output');
  const inputs = endpoints.filter((endpoint) => endpoint.direction === 'input');
  const selectedId = String(selectedControlId || '');

  return outputs.flatMap((source) => inputs
    .filter((target) => target.controlId !== source.controlId)
    .map((target) => {
      const compatibility = endpointTypeCompatibility(source, target);
      const sourceSelected = selectedId && source.controlId === selectedId;
      const targetSelected = selectedId && target.controlId === selectedId;
      return {
        key: `${endpointKey(source)}>${endpointKey(target)}`,
        source,
        target,
        direction: sourceSelected ? 'outbound' : targetSelected ? 'inbound' : 'external',
        compatibility,
      };
    }));
}

function routeNamePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_$]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'value';
}

export function createPanelCustomRouteLink(sourceEndpoint, targetEndpoint, options = {}) {
  const source = sourceEndpoint?.channel || sourceEndpoint?.name || 'mainValue';
  const name = options.name || `route_${routeNamePart(sourceEndpoint?.controlName || sourceEndpoint?.controlId)}_${routeNamePart(source)}_to_${routeNamePart(targetEndpoint?.controlName || targetEndpoint?.controlId)}_${routeNamePart(targetEndpoint?.channel || targetEndpoint?.name)}`;
  const compatibility = endpointTypeCompatibility(sourceEndpoint, targetEndpoint);
  const notes = options.notes || `Routes ${endpointDisplayName(sourceEndpoint)} to ${endpointDisplayName(targetEndpoint)}.${compatibility.warning ? ` ${compatibility.warning}` : ''}`;
  return {
    _type: 'Link',
    name,
    enabled: options.enabled !== false,
    type: 'external-output',
    source,
    target: endpointKey(targetEndpoint),
    targetControlId: String(targetEndpoint?.controlId || ''),
    targetPort: String(targetEndpoint?.channel || targetEndpoint?.name || ''),
    condition: options.condition || '',
    expression: options.expression || '',
    notes,
    routeMeta: {
      source: {
        controlId: String(sourceEndpoint?.controlId || ''),
        label: String(sourceEndpoint?.label || sourceEndpoint?.name || source),
        type: String(sourceEndpoint?.type ?? 'float'),
      },
      target: {
        controlId: String(targetEndpoint?.controlId || ''),
        label: String(targetEndpoint?.label || targetEndpoint?.name || targetEndpoint?.channel || ''),
        type: String(targetEndpoint?.type ?? 'float'),
      },
      compatibility: compatibility.status,
      warning: compatibility.warning,
    },
  };
}

export function parsePanelCustomRouteTarget(link) {
  const explicitControl = String(link?.targetControlId ?? link?.targetComponentId ?? '').trim();
  const explicitPort = String(link?.targetPort ?? link?.targetInput ?? '').trim();
  if (explicitControl && explicitPort) {
    return { controlId: explicitControl, port: explicitPort };
  }

  const target = String(link?.target ?? '').trim();
  const match = target.match(/^([^.:/]+)[.:/]([^.:/]+)$/);
  if (!match) return null;
  return { controlId: match[1], port: match[2] };
}

function endpointFor(endpoints, controlId, channel, direction = '') {
  return endpoints.find((endpoint) =>
    endpoint.controlId === controlId
    && endpoint.channel === channel
    && (!direction || endpoint.direction === direction)
  ) ?? null;
}

export function listPanelCustomRouteLinks(controls = []) {
  const controlList = Array.isArray(controls) ? controls : [];
  const endpoints = listPanelCustomApiEndpoints(controlList);
  const controlMap = new Map(controlList.map((control) => [controlId(control), control]));
  const routes = [];

  for (const sourceControl of controlList) {
    if (!isCustomComponent(sourceControl)) continue;
    const sourceId = controlId(sourceControl);
    const sourceControlName = controlName(sourceControl);
    const links = sourceControl?._children?.Links;
    if (links?.enabled === false) continue;

    for (const [name, link] of Object.entries(links?._children ?? {})) {
      if (!link || link.enabled === false) continue;
      const type = String(link?.type ?? '').trim().toLowerCase();
      if (!['external-output', 'route-value', 'mirror'].includes(type)) continue;

      const target = parsePanelCustomRouteTarget(link);
      const sourceChannel = String(link?.source ?? '').trim();
      const targetControl = target ? controlMap.get(target.controlId) : null;
      const targetChannel = target && targetControl ? targetInputChannel(targetControl, target.port) : String(target?.port ?? '');
      const sourceEndpoint = endpointFor(endpoints, sourceId, sourceChannel, 'output') ?? {
        controlId: sourceId,
        controlName: sourceControlName,
        direction: 'output',
        name: sourceChannel,
        channel: sourceChannel,
        label: sourceChannel || 'Output',
        type: sourceControl?._children?.ValueChannels?._children?.[sourceChannel]?.type ?? 'float',
      };
      const targetEndpoint = target && targetControl
        ? endpointFor(endpoints, target.controlId, targetChannel, 'input') ?? {
          controlId: target.controlId,
          controlName: controlName(targetControl),
          direction: 'input',
          name: targetChannel,
          channel: targetChannel,
          label: targetChannel || 'Input',
          type: targetControl?._children?.ValueChannels?._children?.[targetChannel]?.type ?? 'float',
        }
        : null;
      const compatibility = endpointTypeCompatibility(sourceEndpoint, targetEndpoint);
      const broken = !target || !targetControl || !targetEndpoint;
      routes.push({
        key: `${sourceId}.${name}`,
        name,
        link,
        type,
        enabled: link.enabled !== false,
        source: sourceEndpoint,
        target: targetEndpoint,
        targetRef: target,
        compatibility: broken ? { status: 'missing', warning: 'Target component or input is missing.' } : compatibility,
        broken,
      });
    }
  }

  return routes;
}

export function findPanelCustomRouteLink(controls = [], sourceEndpoint, targetEndpoint) {
  const sourceKey = endpointKey(sourceEndpoint);
  const targetKey = endpointKey(targetEndpoint);
  return listPanelCustomRouteLinks(controls).find((route) =>
    endpointKey(route.source) === sourceKey && endpointKey(route.target) === targetKey
  ) ?? null;
}

function resolveSourceValue(control, session, source) {
  const values = {
    ...seedCustomValues(control),
    ...(session?.customValues ?? {}),
  };
  return values?.[source];
}

function targetInputChannel(control, port) {
  const inputs = control?._children?.PublishedProperties?.inputs ?? {};
  const input = inputs?.[port] ?? Object.values(inputs).find((entry) => String(entry?.channel ?? '') === port);
  return String(input?.channel || port);
}

export function applyPanelCustomLinkRoutes(controls = [], sessions = {}) {
  const controlList = Array.isArray(controls) ? controls : [];
  const controlMap = new Map(controlList.map((control) => [controlId(control), control]));
  const endpoints = listPanelCustomApiEndpoints(controlList);
  let nextSessions = sessions ?? {};
  let changed = false;

  for (const sourceControl of controlList) {
    if (!isCustomComponent(sourceControl)) continue;
    const sourceId = controlId(sourceControl);
    const sourceSession = nextSessions?.[sourceId] ?? {};
    const links = sourceControl?._children?.Links;
    if (links?.enabled === false) continue;

    for (const link of Object.values(links?._children ?? {})) {
      if (!link || link.enabled === false) continue;
      const type = String(link?.type ?? '').trim().toLowerCase();
      if (!['external-output', 'route-value', 'mirror'].includes(type)) continue;

      const target = parsePanelCustomRouteTarget(link);
      if (!target || target.controlId === sourceId) continue;
      const targetControl = controlMap.get(target.controlId);
      if (!isCustomComponent(targetControl)) continue;

      const source = String(link?.source ?? '').trim();
      const rawValue = resolveSourceValue(sourceControl, sourceSession, source);
      if (rawValue === undefined) continue;

      const channelName = targetInputChannel(targetControl, target.port);
      const channel = targetControl?._children?.ValueChannels?._children?.[channelName];
      if (!channel) continue;
      const sourceEndpoint = endpointFor(endpoints, sourceId, source, 'output') ?? {
        type: sourceControl?._children?.ValueChannels?._children?.[source]?.type ?? 'float',
        ...(sourceControl?._children?.ValueChannels?._children?.[source] ?? {}),
      };
      const targetEndpoint = endpointFor(endpoints, target.controlId, channelName, 'input') ?? {
        type: channel?.type ?? 'float',
        ...channel,
      };

      const targetSession = {
        customValues: seedCustomValues(targetControl),
        ...(nextSessions?.[target.controlId] ?? {}),
      };
      const nextValue = snapCustomChannelValue(channel, convertPanelRouteValue(sourceEndpoint, targetEndpoint, rawValue));
      const nextCustomValues = syncCustomArpeggiatorValues(targetControl, {
        ...(targetSession.customValues ?? {}),
        [channelName]: nextValue,
      });
      if (targetSession.customValues?.[channelName] === nextValue
        && targetSession.customValues?.arpNote === nextCustomValues.arpNote
        && targetSession.customValues?.arpVelocity === nextCustomValues.arpVelocity
        && targetSession.customValues?.arpGate === nextCustomValues.arpGate) {
        continue;
      }

      nextSessions = {
        ...nextSessions,
        [target.controlId]: {
          ...targetSession,
          customValues: nextCustomValues,
          customNormalizedValue: channelName === 'mainValue'
            ? normalizeCustomChannelValue(channel, nextValue)
            : targetSession.customNormalizedValue,
          valueOverrideEnabled: channelName === 'mainValue' ? true : targetSession.valueOverrideEnabled,
          valueOverride: channelName === 'mainValue' ? nextValue : targetSession.valueOverride,
        },
      };
      changed = true;
    }
  }

  return changed ? nextSessions : sessions;
}
