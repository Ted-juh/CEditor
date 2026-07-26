// One-click fixes for readiness checklist steps (analyzeCustomComponentReadiness).
// A fix is offered only when it is mechanically safe — scaffolding a missing
// piece with the same defaults the factory/starters use. Steps that encode
// design intent (motion rules, assets) or need diagnosis (package validity)
// stay navigate-only.
import {
  createBackground,
  createBehaviorModule,
  createHitZone,
  createPartNode,
  createValueChannel,
} from './customComponentFactory.js';

function sectionChildren(control, section) {
  return control?._children?.[section]?._children ?? {};
}

function uniqueName(base, taken) {
  let name = base;
  let index = 1;
  while (taken.has(name)) {
    index += 1;
    name = `${base}_${index}`;
  }
  return name;
}

function firstChannelName(control) {
  return Object.keys(sectionChildren(control, 'ValueChannels'))[0] ?? null;
}

function channelPublicEntry(name, channel) {
  return {
    channel: name,
    label: channel?.label || name,
    type: channel?.type || 'float',
    enabled: true,
  };
}

function fixVisuals(control) {
  const parts = sectionChildren(control, 'Parts');
  if (Object.keys(parts).length) return null;
  const part = createPartNode('background', {
    role: 'background',
    kind: 'rectangle',
    zIndex: 1,
    layout: { mode: 'fill' },
    sections: { Background: createBackground('FF30343A', { borderEnabled: true, borderColour: '332B3742', radius: 8 }) },
  });
  return {
    label: 'Add a background layer',
    patch: { 'Parts.background': part },
  };
}

function fixValues(control) {
  const channels = sectionChildren(control, 'ValueChannels');
  if (Object.keys(channels).length) return null;
  const name = uniqueName('value', new Set(Object.keys(channels)));
  return {
    label: 'Add a default value channel',
    patch: { [`ValueChannels.${name}`]: createValueChannel(name, { label: 'Value' }) },
  };
}

function fixInteraction(control) {
  const behaviors = sectionChildren(control, 'Behaviors');
  const hitZones = sectionChildren(control, 'HitZones');
  if (Object.keys(behaviors).length || Object.keys(hitZones).length) return null;

  const patch = {};
  let channelName = firstChannelName(control);
  if (!channelName) {
    channelName = 'value';
    patch[`ValueChannels.${channelName}`] = createValueChannel(channelName, { label: 'Value' });
  }
  const behaviorName = uniqueName('mainDrag', new Set(Object.keys(behaviors)));
  const zoneName = uniqueName('dragArea', new Set(Object.keys(hitZones)));
  patch[`Behaviors.${behaviorName}`] = createBehaviorModule(behaviorName, {
    type: 'slider',
    valueChannel: channelName,
    geometry: 'linear',
  });
  patch[`HitZones.${zoneName}`] = createHitZone(zoneName, {
    targetBehavior: behaviorName,
    targetValueChannel: channelName,
    source: 'face',
  });
  return {
    label: 'Wire a drag behavior + full-face hit zone',
    patch,
  };
}

function fixPublicApi(control) {
  const channels = sectionChildren(control, 'ValueChannels');
  const channelName = Object.keys(channels)[0];
  if (!channelName) return null;

  const published = control?._children?.PublishedProperties;
  const entry = channelPublicEntry(channelName, channels[channelName]);
  if (!published) {
    return {
      label: `Publish "${channelName}" to the panel API`,
      patch: {
        PublishedProperties: {
          _type: 'PublishedProperties',
          inputs: { [channelName]: entry },
          outputs: { [channelName]: entry },
          editableProperties: {},
        },
      },
    };
  }
  const hasInput = Object.values(published.inputs ?? {}).some((item) => item?.enabled !== false);
  const hasOutput = Object.values(published.outputs ?? {}).some((item) => item?.enabled !== false);
  if (hasInput && hasOutput) return null;
  const patch = {};
  if (!hasInput) patch[`PublishedProperties.inputs.${channelName}`] = entry;
  if (!hasOutput) patch[`PublishedProperties.outputs.${channelName}`] = entry;
  return {
    label: `Publish "${channelName}" to the panel API`,
    patch,
  };
}

function fixProperties(control) {
  const published = control?._children?.PublishedProperties;
  const existing = Object.values(published?.editableProperties ?? {}).filter((item) => item?.enabled !== false);
  if (existing.length) return null;

  const parts = sectionChildren(control, 'Parts');
  const textPartName = Object.keys(parts).find((name) => parts[name]?._children?.Text);
  if (!textPartName) return null;

  const entry = {
    path: `Parts.${textPartName}.Text.content`,
    label: 'Label',
    type: 'text',
    enabled: true,
  };
  if (!published) {
    return {
      label: `Expose "${textPartName}" text as an editable property`,
      patch: {
        PublishedProperties: {
          _type: 'PublishedProperties',
          inputs: {},
          outputs: {},
          editableProperties: { label: entry },
        },
      },
    };
  }
  return {
    label: `Expose "${textPartName}" text as an editable property`,
    patch: { 'PublishedProperties.editableProperties.label': entry },
  };
}

const FIXERS = {
  visuals: fixVisuals,
  values: fixValues,
  interaction: fixInteraction,
  publicApi: fixPublicApi,
  properties: fixProperties,
};

/**
 * Returns { label, patch } when the step can be auto-fixed on this control,
 * or null when it can't (already satisfied, or the step needs a human).
 */
export function readinessAutoFix(control, stepKey) {
  const fixer = FIXERS[stepKey];
  if (!control || !fixer) return null;
  return fixer(control);
}
