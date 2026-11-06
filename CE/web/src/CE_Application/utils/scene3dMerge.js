// scene3dMerge.js — a 3D part's render, made into a component by the Photoshop component import
// (utils/scene3dLayers.js scenePsdBytes → utils/psdComponentImport.js), merged into the component the
// 3D part is in: its parts, their bindings and states, and the wiring the import gave them (a dial's
// value, behaviour and grab area, a lamp's value) where the component has none of its own.
//
// The 3D part itself is a marker (kind 'scene3d'): it holds the recipe (`meta.scene3d`) and its box,
// and draws nothing; what it made is named after it ("knob__pointer"), marked `meta.scene3dOf`, kept
// in the component's order just after it, and replaced whole by the next render. What it added to the
// component's wiring is listed on the marker (`meta.scene3dWired`), so that the next render takes back
// only that. Pure, so the merge is tested without a renderer.

import { createPartNode } from './customComponentFactory.js';
import { deepClone } from './deepClone.js';
import { starterKnob, SCENE3D_KIND } from './scene3dModel.js';

export const SEPARATOR = '__';
const round = (v) => Math.round(v * 100) / 100;

/** A new 3D part, a knob to start from, in `frame` (pixels of the component). */
export function createScene3dPart(name, frame, recipe = starterKnob()) {
  return createPartNode(name, {
    role: SCENE3D_KIND,
    kind: SCENE3D_KIND,
    layout: { x: round(frame.x), y: round(frame.y), width: round(frame.width), height: round(frame.height), xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
    sections: {},
    meta: { scene3d: recipe },
  });
}

/** Whether a part is a 3D part's marker. */
export const isScene3dPart = (part) => part?.kind === SCENE3D_KIND;
/** The 3D part a part was made by, or ''. */
export const scene3dOwner = (part) => String(part?.meta?.scene3dOf ?? '');

const children = (control, section) => control?._children?.[section]?._children ?? {};
const ensure = (control, section, type) => {
  control._children[section] ??= { _type: type, _children: {} };
  control._children[section]._children ??= {};
  return control._children[section]._children;
};

/** The component with what a 3D part made taken out: its parts, bindings, states and the wiring it added. */
export function withoutScene3d(control, sceneName) {
  const next = deepClone(control);
  const prefix = `${sceneName}${SEPARATOR}`;
  const parts = children(next, 'Parts');
  const marker = parts[sceneName];
  const wired = marker?.meta?.scene3dWired ?? {};
  for (const [name, part] of Object.entries(parts)) if (scene3dOwner(part) === sceneName) delete parts[name];
  for (const section of ['Bindings', 'States']) {
    const list = children(next, section);
    for (const name of Object.keys(list)) if (name.startsWith(prefix)) delete list[name];
  }
  for (const [section, names] of [['ValueChannels', wired.channels], ['Behaviors', wired.behaviors], ['HitZones', wired.hitZones]]) {
    const list = children(next, section);
    for (const name of names ?? []) delete list[name];
  }
  if (marker?.meta) delete marker.meta.scene3dWired;
  return next;
}

/**
 * The component with a 3D part's render in it, the earlier one taken out. `rendered`: the component
 * the import made of the render (its parts in pixels of the render); `frame`: the 3D part's box in the
 * component's pixels; `scale`: render pixels to one of the component's; `artboard`: the component's
 * size. Returns the new control.
 */
export function mergeScene3d(control, sceneName, rendered, { frame, scale = 1, artboard }) {
  const next = withoutScene3d(control, sceneName);
  const prefix = `${sceneName}${SEPARATOR}`;
  const rename = (name) => `${prefix}${name}`;
  const made = children(rendered, 'Parts');
  const marker = children(next, 'Parts')[sceneName];
  const zIndex = marker?.zIndex ?? 0;

  // The parts, renamed, placed in the 3D part's box, and kept just after the marker.
  const placed = {};
  for (const [name, part] of Object.entries(made)) {
    const copy = deepClone(part);
    copy.name = rename(name);
    copy.zIndex = zIndex;
    copy.meta = { ...(copy.meta ?? {}), scene3dOf: sceneName };
    const layout = copy._children?.Layout;
    if (layout) {
      layout.x = round(frame.x + (Number(layout.x) || 0) / scale);
      layout.y = round(frame.y + (Number(layout.y) || 0) / scale);
      layout.width = round((Number(layout.width) || 0) / scale);
      layout.height = round((Number(layout.height) || 0) / scale);
    }
    // A light layer names the colour layer it goes with.
    const fill = copy._children?.Background?._children?.Fill;
    if (fill?.imageColourFollows) fill.imageColourFollows = rename(fill.imageColourFollows);
    const image = copy._children?.Image;
    if (image?.colourFollows) image.colourFollows = rename(image.colourFollows);
    placed[rename(name)] = copy;
  }
  const parts = children(next, 'Parts');
  const ordered = {};
  for (const [name, part] of Object.entries(parts)) {
    ordered[name] = part;
    if (name === sceneName) Object.assign(ordered, placed);
  }
  next._children.Parts._children = ordered;

  // The value: the component's own where it has one, else the render's (a dial's), and a lamp's.
  const channels = ensure(next, 'ValueChannels', 'ValueChannels');
  const own = Object.values(channels).find((channel) => channel?.type !== 'bool' && channel?.type !== 'string');
  const wired = { channels: [], behaviors: [], hitZones: [] };
  const madeChannels = children(rendered, 'ValueChannels');
  const main = own?.name ?? 'mainValue';
  if (!own && madeChannels.mainValue) {
    channels.mainValue = deepClone(madeChannels.mainValue);
    wired.channels.push('mainValue');
    const behaviors = ensure(next, 'Behaviors', 'Behaviors');
    const hitZones = ensure(next, 'HitZones', 'HitZones');
    if (!Object.keys(behaviors).length) {
      for (const [name, behavior] of Object.entries(children(rendered, 'Behaviors'))) {
        behaviors[name] = deepClone(behavior);
        wired.behaviors.push(name);
      }
      for (const [name, zone] of Object.entries(children(rendered, 'HitZones'))) {
        const copy = deepClone(zone);
        // Over the 3D part's box, in percent of the component.
        copy.bounds = {
          ...copy.bounds, unit: 'percent',
          x: round((frame.x / artboard.width) * 100), y: round((frame.y / artboard.height) * 100),
          width: round((frame.width / artboard.width) * 100), height: round((frame.height / artboard.height) * 100),
        };
        hitZones[name] = copy;
        wired.hitZones.push(name);
      }
    }
  }
  if (madeChannels.lamp && !channels.lamp) {
    channels.lamp = deepClone(madeChannels.lamp);
    wired.channels.push('lamp');
  }

  // Its bindings and states, renamed to its parts and onto the component's value.
  const toPart = (path) => String(path ?? '').replace(/^Parts\.([^.]+)\./, (_, name) => `Parts.${made[name] ? rename(name) : name}.`);
  const toValue = (source) => String(source ?? '').replace(/^channel\.mainValue\./, `channel.${main}.`);
  const bindings = ensure(next, 'Bindings', 'Bindings');
  for (const [name, binding] of Object.entries(children(rendered, 'Bindings'))) {
    const copy = deepClone(binding);
    copy.name = rename(name);
    copy.target = toPart(copy.target);
    copy.source = toValue(copy.source);
    bindings[rename(name)] = copy;
  }
  const states = ensure(next, 'States', 'States');
  for (const [name, state] of Object.entries(children(rendered, 'States'))) {
    const copy = deepClone(state);
    copy.name = rename(name);
    if (copy.patches?.parts) copy.patches.parts = Object.fromEntries(Object.entries(copy.patches.parts).map(([part, patch]) => [made[part] ? rename(part) : part, patch]));
    states[rename(name)] = copy;
  }

  const nextMarker = children(next, 'Parts')[sceneName];
  if (nextMarker) nextMarker.meta = { ...(nextMarker.meta ?? {}), scene3dWired: wired };
  return next;
}
