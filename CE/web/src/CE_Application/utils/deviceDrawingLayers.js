// deviceDrawingLayers.js — a button, switch or meter drawn in a synth set's form (`new-<set id>`),
// made into the layers that draw the same picture (Create Component from Selection, as layers).
//
// The drawing is the form's markup (utils/synthDeviceDrawings.js), read shape by shape
// (utils/svgDrawingItems.js) and made into layers as a knob's drawing is (formDrawingLayers'
// drawingLayers), in the frame ControlAnatomy draws it in: a button's or a switch's 160 by 100
// fitted to the box with its caption under it, or laid out in the box's own pixels where the
// caption does not fit (valueControlLayers' deviceFrameIn, buttonAnatomyLayout); a meter's 160 by
// 100 fitted to the box. A button or switch is drawn twice, at rest and pressed or on, and the
// second drawing's differences (a key moved down, a lamp lit, a rocker tipped) are its layers'
// state while pressed or on (`onPatches`). A meter's reading moves its needle, grows its bar and
// lights its cells through bindings on its value. Returns what buttonDeviceLayers and
// meterDeviceLayers return, for the same callers.

import { PHYSICAL_DIRECTIONS } from '../models/physicalControlSets.js';
import { anatomyForm, isIllustratedForm } from '../models/controlAnatomy.js';
import { drawingItems } from './svgDrawingItems.js';
import { synthDeviceDrawing } from './synthDeviceDrawings.js';
import { drawingLayers, formColours, markupColour } from './formDrawingLayers.js';
import { deviceFrameIn } from './valueControlLayers.js';

const METERS = new Set(['Meter', 'ProgressBar']);
const BUTTONS = new Set(['Button', 'MomentaryButton', 'TimedButton', 'OneShotButton', 'ToggleButton']);

/** The synth set a button, switch or meter's form is (`new-<set id>`), when its drawing is made into layers here; else null. */
export function drawnDeviceDirection(type, form) {
  const name = anatomyForm(String(type ?? ''), String(form ?? ''));
  if (!name.startsWith('new-') || isIllustratedForm(name) || !(METERS.has(type) || BUTTONS.has(type))) return null;
  return PHYSICAL_DIRECTIONS.find((direction) => `new-${direction.id}` === name) ?? null;
}

// The properties a pressed or switched-on drawing may change on a layer, as a state patches them.
const ON_PATHS = [
  'opacity', 'meta.pathData', 'Layout.x', 'Layout.y', 'Layout.width', 'Layout.height', 'Layout.pivotX', 'Layout.pivotY',
  'Background.Fill.colour', 'Background.Fill.solidEnabled', 'Background.Fill.gradientEnabled', 'Background.Fill.gradient',
  'Text.content', 'Text.Fill.colour',
];
function read(layer, path) {
  let node = layer;
  for (const key of path.split('.')) {
    if (node == null) return undefined;
    node = key in node ? node[key] : node._children?.[key];
  }
  return node;
}

/**
 * The layers of `resolved` drawn in its synth form: `{ parts, bindings, partNames, onPatches }` for
 * a button or switch (`kind` 'button' or 'toggle'), `{ parts, bindings, partNames }` for a meter
 * (`kind` 'meter'); null when its form is not one drawn here. `caption` is the control's text.
 */
export function synthDeviceDrawingLayers({ resolved, styled = resolved, rect, channel, prefix, zIndex, uniqueName, kind, caption = '' }) {
  const core = resolved?._children?.Core ?? {};
  const direction = drawnDeviceDirection(core.controlType, core.controlForm);
  if (!direction) return null;
  const c = formColours(resolved, styled);
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const origin = { x: rect.x, y: rect.y };
  const named = (suffix) => uniqueName(`${prefix}_${suffix}`);
  const drawingOf = (active) => synthDeviceDrawing(direction, { kind, active, depth: c.depthShare });
  const itemsOf = (drawing, merge) => drawingItems(drawing.markup, {
    colour: (token) => markupColour(token, c), gradients: drawing.gradients, shadow: drawing.shadow ?? null, merge,
  });

  if (kind === 'meter') {
    const drawing = drawingOf(false);
    if (!drawing) return null;
    const s = Math.min(width / 160, height / 100);
    const ox = (width - 160 * s) / 2;
    const oy = (height - 100 * s) / 2;
    const place = { at: ([x, y]) => [ox + s * x, oy + s * y], k: () => s };
    const items = itemsOf(drawing, true);
    if (c.showValue) items.push({ name: 'readout', text: true, readout: true, x: 80, y: drawing.readout.y, size: drawing.readout.size, colour: c.legend, family: 'monospace' });
    const out = { parts: [], bindings: {}, partNames: {} };
    drawingLayers(items, { place, origin, named, zIndex, source: `channel.${channel}.normalized`, channel, c, width, out });
    return out;
  }

  // A button or a switch: at rest, and pressed or on, the same shapes in the same order.
  const rest = drawingOf(false);
  const lit = drawingOf(true);
  if (!rest || !lit) return null;
  const font = resolved?._children?.Text?._children?.Font ?? {};
  const frame = deviceFrameIn(width, height, caption, Math.max(0, Number(font.letterSpacing) || 0));
  const S = frame.scale;
  const place = { at: ([x, y]) => [frame.x + x * S, frame.y + y * S], k: () => S };
  const restItems = itemsOf(rest, false);
  const litItems = itemsOf(lit, false);
  if (restItems.length !== litItems.length) return null;
  const out = { parts: [], bindings: {}, partNames: {}, onPatches: {} };
  const made = drawingLayers(restItems, { place, origin, named, zIndex, source: null, channel: null, c, width, out });
  const pressed = drawingLayers(litItems, { place, origin, named, zIndex, source: null, channel: null, c, width, out: { parts: [], bindings: {}, partNames: {} }, names: made.map((layer) => layer.name) });
  made.forEach((layer, i) => {
    const on = {};
    for (const path of ON_PATHS) {
      const was = read(layer, path);
      const now = read(pressed[i], path);
      if (JSON.stringify(was) !== JSON.stringify(now) && now !== undefined) on[path] = now;
    }
    if (Object.keys(on).length) out.onPatches[layer.name] = on;
  });
  // The caption: under the device in the frame, as the drawing sets it, or where the box's own
  // layout puts it, as ControlAnatomy then sets it.
  const words = String(caption ?? '').replace(/\s+/g, ' ').trim();
  if (words) {
    const captionOut = { parts: [], bindings: {}, partNames: {} };
    let layers = [];
    if (frame.inFrame) {
      layers = drawingLayers([{ name: 'caption', text: words, x: 80, y: rest.caption.y, size: 11, colour: c.legend, anchor: 'middle', family: rest.caption.family || c.family }],
        { place, origin, named, zIndex: zIndex + made.length, source: null, channel: null, c, width, out: captionOut });
    } else if (frame.caption) {
      layers = drawingLayers([{
        name: 'caption', text: String(frame.caption.text ?? words).replace(/\s+/g, ' ').trim(), x: frame.caption.x, y: frame.caption.y, size: frame.caption.size, colour: c.legend,
        anchor: frame.caption.anchor === 'start' ? 'start' : 'middle', family: c.family, weight: c.weight, spacing: c.spacing,
      }], { place: { at: (point) => point, k: () => 1 }, origin, named, zIndex: zIndex + made.length, source: null, channel: null, c, width, out: captionOut });
    }
    out.parts.push(...layers);
    if (layers.length) out.partNames.caption = layers.map((layer) => layer.name);
  }
  return out;
}
