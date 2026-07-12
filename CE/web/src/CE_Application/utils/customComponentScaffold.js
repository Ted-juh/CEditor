// "Make Interactive" scaffolding (§3 archetypes), shared by the design
// surface's draw tool / quickbar action and the Interact tab's add action.
// Builds the visual part(s) plus the channel + behavior + hit-zone set from
// makeInteractive(), pre-wired. Pure: returns a patch for applyControlPatch.
import {
  createBackground,
  createPartNode,
  makeInteractive,
} from './customComponentFactory.js';

function sectionNames(control, section) {
  return Object.keys(control?._children?.[section]?._children ?? {});
}

// Reserve the whole generated-name family (base, baseValue, baseZone,
// baseMinHandle, ...) by refusing any base that prefixes an existing name.
export function nextInteractiveBaseName(control, archetypeId) {
  const taken = [
    ...sectionNames(control, 'Parts'),
    ...sectionNames(control, 'HitZones'),
    ...sectionNames(control, 'ValueChannels'),
    ...sectionNames(control, 'Behaviors'),
  ];
  let index = 1;
  let candidate = archetypeId;
  while (taken.some((name) => name === candidate || name.startsWith(candidate))) {
    index += 1;
    candidate = `${archetypeId}${index}`;
  }
  return candidate;
}

function interactivePixelLayout(frame) {
  return {
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    width: Math.round(Math.max(8, frame.width)),
    height: Math.round(Math.max(8, frame.height)),
    xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px',
    anchorX: 'left', anchorY: 'top',
  };
}

function rangeHandleParts(base, frame, geometry, zIndexStart) {
  const thickness = 12;
  const frames = geometry === 'vertical'
    ? [
      { x: frame.x, y: frame.y + frame.height * 0.75 - thickness / 2, width: frame.width, height: thickness },
      { x: frame.x, y: frame.y + frame.height * 0.25 - thickness / 2, width: frame.width, height: thickness },
    ]
    : [
      { x: frame.x + frame.width * 0.25 - thickness / 2, y: frame.y, width: thickness, height: frame.height },
      { x: frame.x + frame.width * 0.75 - thickness / 2, y: frame.y, width: thickness, height: frame.height },
    ];
  const handles = {};
  [`${base}MinHandle`, `${base}MaxHandle`].forEach((name, index) => {
    handles[name] = createPartNode(name, {
      kind: 'rectangle',
      role: 'handle',
      zIndex: zIndexStart + index,
      layout: interactivePixelLayout(frames[index]),
      sections: {
        Background: createBackground('FF5B9BD5', { borderEnabled: true, borderColour: '55FFFFFF', borderThickness: 1, radius: 3 }),
      },
    });
  });
  return handles;
}

/**
 * Build the patch for one interactive archetype. `frame` is the control's
 * pixel rect; with `existingPartName` the scaffold wires onto that part
 * instead of creating a new face part. Returns { patch, partName, base } or
 * null for an unknown archetype.
 */
export function buildInteractivePatch(control, archetypeId, frame, existingPartName = '') {
  const base = nextInteractiveBaseName(control, archetypeId);
  const geometry = ['slider', 'range'].includes(archetypeId)
    ? (frame.height > frame.width ? 'vertical' : 'horizontal')
    : undefined;

  const newParts = {};
  let zIndex = sectionNames(control, 'Parts').length + 1;
  let partName = existingPartName;
  if (!partName) {
    partName = base;
    const circle = archetypeId === 'dial';
    newParts[partName] = createPartNode(partName, {
      kind: circle ? 'circle' : 'rectangle',
      role: archetypeId,
      zIndex: zIndex++,
      layout: interactivePixelLayout(frame),
      sections: {
        Background: createBackground('FF3A3F46', {
          borderEnabled: true,
          borderColour: 'FF5B9BD5',
          borderThickness: 1,
          radius: circle ? 999 : 6,
        }),
      },
    });
  }

  const options = { name: base, partName, geometry };
  if (archetypeId === 'range') {
    Object.assign(newParts, rangeHandleParts(base, frame, geometry, zIndex));
    options.minPart = `${base}MinHandle`;
    options.maxPart = `${base}MaxHandle`;
  }

  const wired = makeInteractive(archetypeId, options);
  if (!wired) return null;

  const patch = {};
  for (const [name, part] of Object.entries(newParts)) patch[`Parts.${name}`] = part;
  for (const [name, channel] of Object.entries(wired.valueChannels)) patch[`ValueChannels.${name}`] = channel;
  for (const [name, behavior] of Object.entries(wired.behaviors)) patch[`Behaviors.${name}`] = behavior;
  for (const [name, zone] of Object.entries(wired.hitZones)) patch[`HitZones.${name}`] = zone;
  return { patch, partName, base };
}
