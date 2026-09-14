import {
  normalizeCustomChannelValue,
  seedCustomValues,
  snapCustomChannelValue,
} from './customComponentInteraction.js';
import { syncCustomArpeggiatorValues } from './customComponentArpeggiator.js';
import { numberOr } from './primitives.js';
import { flatControls } from './containment.js';

function controlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

function controlName(control) {
  return String(control?._children?.Core?.name ?? controlId(control) ?? '');
}

function isCustomComponent(control) {
  return String(control?._children?.Core?.controlType ?? '') === 'CustomComponent';
}

/**
 * The three link policies, which decide WHICH of a component's values other components may reach.
 *
 * The vocabulary was in the model and in the Policy dropdown long before anything read it, and the
 * dropdown offers the raw names with one hint beside them — "Published-only keeps internals private
 * by default". So the names are the specification, and both wider settings are built out of markers
 * the model already carries rather than out of a new field:
 *
 *   publishedOnly   only what `PublishedProperties` lists. The deliberate public contract, and what
 *                   the engine did when the other two were unread — so this stays the default and
 *                   every existing panel behaves exactly as it did.
 *   advancedOptIn   that, plus any value channel the author has NOT marked private. `publicInput`
 *                   and `publicOutput` are the opt-in: they already exist on every channel, the
 *                   Value Channels editor already shows them as "private in" / "private out", and
 *                   the export layer already honours them. An internal a component wants reachable
 *                   is one it has not marked private.
 *   allInternals    every channel, private markers included. The escape hatch, and it says so.
 *
 * A channel reached through the two wider settings is offered under its own name, with its own
 * type and bounds. A PUBLISHED entry always wins over the bare channel behind it: publishing is
 * where an author renames a channel, relabels it or narrows its range, and a wider policy is meant
 * to add reach, never to discard that.
 */
export const LINK_POLICIES = ['publishedOnly', 'advancedOptIn', 'allInternals'];

export function getLinkPolicy(control) {
  const policy = String(control?._children?.ExternalAPI?.linkPolicy ?? 'publishedOnly').trim();
  return LINK_POLICIES.includes(policy) ? policy : 'publishedOnly';
}

/**
 * Whether this component accepts links INTO it / emits links OUT of it at all.
 *
 * Two chips in the Published Properties tab, above the Policy dropdown, and a different question
 * from it: the policy says how much of the component is reachable, these say whether any of it is.
 * Both default true, so a component that has never been near the tab is unchanged.
 *
 * THE SWITCH APPLIES AT RUN TIME, not only to the picker. `listPanelCustomApiEndpoints` is what the
 * Links editor lists, and it is also what `applyPanelCustomLinkRoutes` resolves against while the
 * panel runs — so turning a direction off stops links already authored in that direction from
 * carrying a value, and drops them from the route list. That is the honest reading of "allow other
 * components to drive published inputs": a switch that only hid the endpoint from a picker would
 * leave the component being driven by every link made before it was turned off, which is the
 * opposite of what it says.
 */
function acceptsDirection(control, direction) {
  const api = control?._children?.ExternalAPI ?? {};
  return direction === 'output' ? api.emitsExternalLinks !== false : api.acceptsExternalLinks !== false;
}

function endpointFrom(control, direction, name, entry, channel) {
  return {
    controlId: controlId(control),
    controlName: controlName(control),
    direction,
    name,
    channel: String(entry?.channel || name),
    label: String(entry?.label || name),
    type: String(entry?.type ?? channel?.type ?? 'float'),
    min: entry?.min ?? channel?.min,
    max: entry?.max ?? channel?.max,
    step: entry?.step ?? channel?.step,
    defaultValue: entry?.defaultValue ?? channel?.defaultValue,
    values: Array.isArray(entry?.values) ? [...entry.values] : (Array.isArray(channel?.values) ? [...channel.values] : undefined),
  };
}

/** True when the policy lets this channel be reached in this direction without being published. */
function policyAdmitsChannel(policy, channel, direction) {
  if (policy === 'allInternals') return true;
  if (policy !== 'advancedOptIn') return false;
  return direction === 'output' ? channel?.publicOutput !== false : channel?.publicInput !== false;
}

function publishedEntries(control, direction) {
  if (!acceptsDirection(control, direction)) return [];

  const published = control?._children?.PublishedProperties ?? {};
  const entries = direction === 'output' ? published.outputs : published.inputs;
  const channels = control?._children?.ValueChannels?._children ?? {};

  const out = [];
  const claimed = new Set();
  for (const [name, entry] of Object.entries(entries ?? {})) {
    if (entry?.enabled === false) continue;
    const channelName = String(entry?.channel || name);
    claimed.add(channelName);
    out.push(endpointFrom(control, direction, name, entry, channels[channelName] ?? {}));
  }

  // The wider policies, added after the published contract so a published entry keeps its name,
  // label and narrowed range and an unpublished channel is never listed twice.
  const policy = getLinkPolicy(control);
  if (policy === 'publishedOnly') return out;
  for (const [channelName, channel] of Object.entries(channels)) {
    if (claimed.has(channelName)) continue;
    if (!policyAdmitsChannel(policy, channel, direction)) continue;
    out.push(endpointFrom(control, direction, channelName,
      { channel: channelName, label: channel?.label || channelName }, channel ?? {}));
  }
  return out;
}

/**
 * Whether a component will carry a link on this channel in this direction.
 *
 * One rule, asked twice: the Links editor asks it by listing endpoints, and the run time asks it
 * here. Keeping both on `publishedEntries` is the point — a permission that the picker enforces and
 * the runtime does not is not a permission, it is a suggestion, and a component whose author has
 * turned external input off would go on being driven by every link made before they turned it off.
 *
 * The cost is worth stating where somebody reads it: narrowing the Policy, unpublishing a property,
 * or disabling one, all stop links that depended on it from carrying a value. That is the same
 * sentence read forwards — those settings decide what other components may reach — and the Links
 * editor keeps LISTING such a link, marked `blocked`, rather than hiding it, so the author can see
 * why it stopped and remove it.
 */
export function panelCustomLinkPermitted(control, channel, direction) {
  if (!isCustomComponent(control)) return false;
  const wanted = String(channel ?? '');
  return publishedEntries(control, direction).some((endpoint) => endpoint.channel === wanted);
}

export function listPanelCustomApiEndpoints(controls = []) {
  // Walk the whole control tree so custom components nested inside containers
  // expose their published API to panel-level linking, not just top-level ones.
  return flatControls(Array.isArray(controls) ? controls : [])
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
  const controlList = flatControls(Array.isArray(controls) ? controls : []);
  const endpoints = listPanelCustomApiEndpoints(controls);
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
      // A link the two components' own settings now refuse. Listed rather than hidden: the author
      // made it, it is in their document, and a link that vanishes from the editor is one they
      // cannot see, understand or delete. `blocked` is kept apart from `missing` because they need
      // different answers — this one is a setting to change, that one is a component to restore.
      const blocked = !broken
        && (!panelCustomLinkPermitted(sourceControl, sourceChannel, 'output')
          || !panelCustomLinkPermitted(targetControl, targetChannel, 'input'));
      routes.push({
        key: `${sourceId}.${name}`,
        name,
        link,
        type,
        enabled: link.enabled !== false,
        source: sourceEndpoint,
        target: targetEndpoint,
        targetRef: target,
        compatibility: broken
          ? { status: 'missing', warning: 'Target component or input is missing.' }
          : (blocked
            ? { status: 'blocked', warning: 'One of these components does not allow this link. Check its External switches and Policy.' }
            : compatibility),
        broken,
        blocked,
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
  const controlList = flatControls(Array.isArray(controls) ? controls : []);
  const controlMap = new Map(controlList.map((control) => [controlId(control), control]));
  const endpoints = listPanelCustomApiEndpoints(controls);
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
      // The permission check, and deliberately not the endpoint lookup below it: that one falls
      // back to the raw channel when it finds nothing, which is right for working out a type to
      // convert through and wrong as a gate — it is why these settings used to be picker-only.
      if (!panelCustomLinkPermitted(sourceControl, source, 'output')) continue;
      if (!panelCustomLinkPermitted(targetControl, channelName, 'input')) continue;
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
