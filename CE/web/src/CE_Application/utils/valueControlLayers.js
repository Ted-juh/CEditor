// valueControlLayers.js — a knob, made into layers the Component Designer edits (docs/design/
// changeable-control-sets.md, piece D2).
//
// Create Component from Selection used to turn a knob into one `slidercontrol` part: the panel's own
// renderer drawing a frozen copy that nothing in the designer could change. Now that a knob is made
// of parts, each part becomes a layer of a kind the designer draws and edits, wired to the knob's
// value by bindings the React tab shows:
//
//   housing, cap   a path (its outline: a circle, scallop, flutes, a polygon), with the part's fill,
//                  gradient and border; a cap that `turns` turns with the value about the centre.
//   track          an arc, round-ended, as the panel draws it.
//   value arc      an arc whose sweep follows the value; from the centre both ways when the knob
//                  fills from its centre (two arcs).
//   pointer        a line, a dot, or the needle or chicken-head as a path, turning about the centre.
//   ticks          a rectangle or dot each, lit up to the value as the panel lights them.
//   readout, title text; the readout shows the channel's value as the knob's readout did.
//
// The geometry is the panel renderer's own (editor/SliderFamilyRenderer.svelte), from the same
// helpers (utils/sliderGeometry.js, utils/knobOutlines.js), so a layer sits where its part was
// drawn; browser-checks/knobLayers.mjs compares the pixels at four values. Colours are taken as the
// set's family wrote them, so a colour role stays a role and the component follows the panel's set.
//
// What a layer does not draw yet is refused by name (valueLayersRefusal), and that knob comes in as
// one exact part instead, as before.

import { createPartNode } from './customComponentFactory.js';
import { resolveSliderSemanticParts } from './sliderEntityFactory.js';
import {
  buildSliderLabelAnchors, buildSliderTickStops, resolveCircularTrackMetrics, resolveLinearPointerPoint, resolveLinearTrackFrame,
} from './sliderGeometry.js';
import {
  formatSliderNumericValue, getSliderDirection, getSliderGeometry, getSliderMax, getSliderMin, getSliderOrientation, getSliderStartAngle,
  getSliderSweepAngle, getSliderValueMode, sliderDisplayScale,
} from './sliderBehavior.js';
import { knobOutlinePath, knobOutlineReach } from './knobOutlines.js';
import { formatBehaviorDisplay } from './parameterDisplay.js';
import { deepClone } from './deepClone.js';
import { anatomyForm } from '../models/controlAnatomy.js';
import { BUTTON_DEVICE_PARTS, DEVICE_FRAME } from '../models/buttonDeviceParts.js';
import { METER_DEVICE_PARTS, METER_FRAME } from '../models/meterDeviceParts.js';
import { meterLitOffset, meterPartDrawing } from './meterParts.js';
import { meterArcAngle, meterFillColourAt, meterSegmentCenter, meterTickLabel, meterTicks, meterZones } from './meterLayout.js';
import { normalLineHeight } from './textLineHeight.js';
import { deviceShapePath, devicePatternCells } from './deviceShapes.js';
import { buttonAnatomyLayout } from './anatomyLayout.js';
import { scalePathData } from './svgPathScale.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const r3 = (n) => Math.round(n * 1000) / 1000;

function partVisible(part) {
  return part?.visible !== false;
}

function fillOf(part) {
  return part?._children?.Background?._children?.Fill ?? {};
}

function borderWidth(part, fallback) {
  const border = part?._children?.Background?._children?.Border ?? null;
  if (border?.enabled === false) return 0;
  return Math.max(0, num(border?.thickness, fallback));
}

/** Whether a part's fill is more than one flat colour (a gradient, a picture, a texture, a material). */
function fillIsRich(part) {
  const fill = fillOf(part);
  const background = part?._children?.Background ?? {};
  return fill.gradientEnabled === true || fill.imageEnabled === true || fill.textureEnabled === true
    || background?._children?.Effects?._children?.Material?.enabled === true
    || background?._children?.Effects?.Material?.enabled === true;
}

/**
 * Why this knob cannot become layers that look as it does, or ''. A knob refused here still
 * converts, as one exact part.
 */
export function valueLayersRefusal(resolved) {
  const behavior = resolved?._children?.Behavior ?? {};
  const core = resolved?._children?.Core ?? {};
  const form = anatomyForm(core.controlType, core.controlForm);
  if (form) return `drawn in the "${form}" control form, which is not made of parts`;
  if (getSliderValueMode(behavior) !== 'single') return 'two handles';
  if (getSliderGeometry(behavior) !== 'circular') return sliderLayersRefusal(resolved);
  const parts = resolveSliderSemanticParts(resolved?._children?.Parts ?? null)._children;
  // A part that turns with the value turns its outline under a light that stays put. A layer turns
  // whole, its gradient or finish with it, so the light would turn too.
  for (const [name, label] of [['bodyHousing', 'housing'], ['bodyCap', 'cap']]) {
    if (parts[name]?.visible === true && parts[name]?.turns === true && fillIsRich(parts[name])) {
      return `a ${label} that turns under a fixed light (a gradient or finish), which a turning layer would turn with it`;
    }
  }
  // The synth sets' knobs (models/directionKnobParts.js) draw with parts no layer draws yet.
  if (parts.bodySkirt?.visible === true) return 'a skirt, which a layer does not draw yet';
  if (parts.bodyInsert?.visible === true) return 'an insert in its cap, which a layer does not draw yet';
  for (const [name, label] of [['bodyHousing', 'housing'], ['bodyCap', 'cap']]) {
    if (parts[name]?.visible === true && (Number(parts[name]?.shadowOffset) > 0 || Number(parts[name]?.shadowBlur) > 0)) {
      return `a shadow under its ${label}, which a layer does not draw yet`;
    }
  }
  for (const [name, label] of [['bodyHousing', 'housing'], ['bodyCap', 'cap']]) {
    if (parts[name]?.visible === true && (Number(parts[name]?.aspect ?? 100) !== 100 || Number(parts[name]?.shiftY ?? 0) !== 0)) {
      return `a ${label} drawn in perspective (an oval, or moved off the centre), which a layer does not draw yet`;
    }
    if (parts[name]?.visible === true && String(parts[name]?.outline ?? '') === 'chicken') return `a chicken-head ${label}, which a layer does not draw yet`;
  }
  for (const [name, label] of [['bodyHousing', 'housing'], ['bodySkirt', 'skirt'], ['bodyCap', 'cap'], ['bodyInsert', 'insert']]) {
    if (parts[name]?.visible === true && Number(parts[name]?.grooves) > 0) return `grooves round its ${label}, which a layer does not draw yet`;
    if (parts[name]?.visible === true && String(parts[name]?.look ?? '') === 'rendered') return `a rendered ${label}, which a layer does not draw yet`;
  }
  if (Number(parts.pointerCurrent?.markTo) > Number(parts.pointerCurrent?.markFrom ?? 0) && Number(parts.pointerCurrent?.markWidth) > 0) {
    return 'a second bar on its pointer, which a layer does not draw yet';
  }
  if (behavior.showTicks !== false && Number(behavior.secondScaleRadius) > 0 && Number(behavior.secondScaleCount) > 0) {
    return 'a second scale, which a layer does not draw yet';
  }
  if (String(parts.pointerCurrent?.kind ?? '').toLowerCase() === 'bar') return 'a bar for a pointer, which a layer does not draw yet';
  if (behavior.showTicks !== false && Number(behavior.tickRadius) > 0) return 'a scale on a radius of its own, which a layer does not draw yet';
  if (Number(behavior.scaleNumberCount) >= 2) return 'numbers round its scale, which a layer does not draw yet';
  if (behavior.showTicks !== false && (parts.tickMajor?.activeColour || parts.tickMinor?.activeColour)) return 'ticks that light up to the value, which a layer does not draw yet';
  if (partVisible(parts.bodyTrackBase) && fillIsRich(parts.bodyTrackBase)) return 'a gradient along its track, which a layer does not draw yet';
  if (partVisible(parts.bodyTrackFill) && fillIsRich(parts.bodyTrackFill)) return 'a gradient along its value arc, which a layer does not draw yet';
  if (behavior.showHandleLabels === true) return 'a label that rides the pointer';
  const min = getSliderMin(behavior);
  const max = getSliderMax(behavior);
  if (formatBehaviorDisplay(behavior, min, max, min) !== null) return 'a readout written as the synth writes it';
  if (String(parts.pointerCurrent?.kind ?? 'dot').toLowerCase() === 'dot' && fillIsRich(parts.pointerCurrent)) {
    return 'a gradient on its pointer, which a layer does not draw yet';
  }
  return '';
}

// --- path data -------------------------------------------------------------------------------------

/** "M x y L x y … Z" in absolute pixels, to the same shape in 0..1 of its own box: `{ d, box }`. */
function normalisePolygonPath(d) {
  const numbers = String(d).match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)?.map(Number) ?? [];
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
  return normalisePoints(points);
}

function normalisePoints(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const box = { x: Math.min(...xs), y: Math.min(...ys) };
  box.width = Math.max(0.001, Math.max(...xs) - box.x);
  box.height = Math.max(0.001, Math.max(...ys) - box.y);
  const d = `${points.map(([x, y], i) => `${i ? 'L' : 'M'}${r3((x - box.x) / box.width)} ${r3((y - box.y) / box.height)}`).join(' ')} Z`;
  return { d, box };
}

/** A circle as path data in 0..1 of its box. */
const UNIT_CIRCLE = 'M0 0.5 A0.5 0.5 0 1 0 1 0.5 A0.5 0.5 0 1 0 0 0.5 Z';

// --- layer builders --------------------------------------------------------------------------------

function pxBox(box, origin) {
  return {
    x: r3(origin.x + box.x), y: r3(origin.y + box.y), width: r3(Math.max(0.5, box.width)), height: r3(Math.max(0.5, box.height)),
    xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', align: 'left', rotation: 0,
  };
}

/** The pivot (an absolute point) as a percentage of `box`. */
function pivotIn(box, point) {
  return { pivotX: r3(((point.x - box.x) / box.width) * 100), pivotY: r3(((point.y - box.y) / box.height) * 100) };
}

function backgroundFrom(part, { borderFallback = 0, borderColourFallback = 'FF333333' } = {}) {
  const background = deepClone(part?._children?.Background ?? SECTION_DEFAULTS.Background);
  background._children ??= {};
  background._children.Fill ??= deepClone(SECTION_DEFAULTS.Background._children.Fill);
  background._children.Border ??= deepClone(SECTION_DEFAULTS.Background._children.Border);
  const border = background._children.Border;
  const width = borderWidth(part, borderFallback);
  border.enabled = width > 0;
  border.thickness = width;
  if (border.colour === undefined || border.colour === null || border.colour === '') border.colour = borderColourFallback;
  if (background._children.Corners) background._children.Corners.radius = 0;
  // The background's effects (a material, lit by the set's lamp) come along: a layer's background is
  // drawn by the same BackgroundRenderer and EffectSurface as the knob part's (SliderShapeFill).
  return background;
}

function solidBackground(colour, { borderColour = null, borderThickness = 0 } = {}) {
  const background = deepClone(SECTION_DEFAULTS.Background);
  background._children.Fill.solidEnabled = true;
  background._children.Fill.gradientEnabled = false;
  background._children.Fill.colour = colour;
  background._children.Border.enabled = borderThickness > 0;
  background._children.Border.thickness = borderThickness;
  if (borderColour) background._children.Border.colour = borderColour;
  background._children.Corners.radius = 0;
  return background;
}

/**
 * A filled outline (a circle, a ring, or a scallop, flutes, a polygon) centred on `centre`, radius
 * `r`, as path layers. The panel strokes the border centred on the edge; a closed path layer insets
 * its path by half the border and bands the border inward from its outer edge, so the box is the
 * shape's own grown by half the border and the two draw the same ring. The layer's fill reaches the
 * outer edge too, under the border: right for an opaque border, which covers it, but a border you
 * can see through shows it. Such a part is two layers, its fill and its edge, as the panel draws it.
 */
function outlineLayers(name, part, centre, r, origin, { zIndex, borderFallback, role }) {
  const kind = String(part?.outline ?? 'circle');
  const bw = borderWidth(part, borderFallback);
  let shape;
  if (kind === 'circle') {
    shape = { d: UNIT_CIRCLE, box: { x: centre.x - r, y: centre.y - r, width: 2 * r, height: 2 * r } };
  } else if (kind === 'ring') {
    // Two circles, the inner the other way round: an annulus (knobOutlines.js), in 0..1 of its box.
    const inner = 0.5 * (1 - Math.max(0.05, Math.max(0, Math.min(95, num(part?.outlineDepth, 20))) / 100));
    shape = {
      d: `${UNIT_CIRCLE} M${r3(0.5 - inner)} 0.5 a${r3(inner)} ${r3(inner)} 0 1 1 ${r3(inner * 2)} 0 a${r3(inner)} ${r3(inner)} 0 1 1 ${r3(-inner * 2)} 0 Z`,
      box: { x: centre.x - r, y: centre.y - r, width: 2 * r, height: 2 * r },
    };
  } else {
    // At the panel's own scale: knobOutlinePath rounds to hundredths of a pixel.
    shape = normalisePolygonPath(knobOutlinePath(kind, centre.x, centre.y, r, {
      count: part?.outlineCount, depth: part?.outlineDepth, rotation: num(part?.outlineRotation, 0),
    }));
  }
  const background = backgroundFrom(part, { borderFallback, borderColourFallback: 'FF333333' });
  const layerOf = (layerName, sectionBackground, grow) => {
    const box = { x: shape.box.x - grow / 2, y: shape.box.y - grow / 2, width: shape.box.width + grow, height: shape.box.height + grow };
    return createPartNode(layerName, {
      role, kind: 'path', zIndex, opacity: num(part?.opacity, 1),
      layout: { ...pxBox(box, origin), ...pivotIn(box, centre) },
      meta: { pathData: shape.d, closed: true },
      sections: { Background: sectionBackground },
    });
  };
  const borderColour = String(background._children.Border.colour ?? '');
  const seeThrough = bw > 0 && /^[0-9a-f]{8}$/i.test(borderColour) && borderColour.slice(0, 2).toUpperCase() !== 'FF';
  // A finish (a material) lights everything in the layer's background, its border too; the panel
  // draws the border over the lit fill, unlit. So a part with both is two layers as well.
  const lit = bw > 0 && Object.keys(background._children.Effects?._children ?? {}).some((key) => background._children.Effects._children[key]?.enabled === true);
  if (!seeThrough && !lit) return [layerOf(name(''), background, bw)];
  const fill = deepClone(background);
  fill._children.Border.enabled = false;
  fill._children.Border.thickness = 0;
  const edge = deepClone(background);
  edge._children.Fill.solidEnabled = false;
  edge._children.Fill.gradientEnabled = false;
  edge._children.Fill.imageEnabled = false;
  edge._children.Fill.textureEnabled = false;
  delete edge._children.Effects;
  return [layerOf(name(''), fill, 0), layerOf(name('Edge'), edge, bw)];
}

/** An arc of the track's circle as an arc layer: `start` in the designer's degrees (0 at 12 o'clock). */
function arcLayer(name, { centre, radius, thickness, start, sweep, direction, colour, opacity, zIndex, origin, role, cap = 'round', extra = {} }) {
  const size = 2 * radius + thickness;
  const box = { x: centre.x - size / 2, y: centre.y - size / 2, width: size, height: size };
  return createPartNode(name, {
    role, kind: 'arcTrack', zIndex, opacity, layout: pxBox(box, origin),
    meta: { arcTrack: { startAngle: r3(start), sweepAngle: r3(sweep), direction, thickness: r3(thickness), cap, colour, ...extra } },
    sections: { Background: solidBackground('00000000') },
  });
}

function rangeBinding(name, source, target, outputMin, outputMax, inputMin = 0, inputMax = 1) {
  return {
    _type: 'Binding', name, enabled: true, source, target,
    mapMode: 'range', inputMin, inputMax, outputMin: r3(outputMin), outputMax: r3(outputMax), clamp: true,
  };
}

const designerAngle = (panelDegrees) => panelDegrees + 90;

/**
 * The layers, bindings and state patches for one knob.
 *
 * `resolved`  the knob as the panel draws it (resolveControlForSet), for its geometry;
 * `styled`    the knob with its set's family applied but colour roles left as roles
 *             (resolveControlFamily), for its colours, so the layers keep them;
 * `rect`      its box in the component; `channel` the name of its value channel; `prefix` the name
 *             its layers start with; `zIndex` the depth of its lowest layer; `taken` the part names
 *             used so far (uniquePartName).
 *
 * Returns `{ parts, bindings, partNames, behavior }`: `partNames` maps a knob part to its layer (for
 * the knob's states), `behavior` the drag settings for the channel's behaviour.
 */
export function knobLayers({ resolved, styled = resolved, rect, channel, prefix, zIndex, uniqueName }) {
  const behavior = resolved._children.Behavior ?? {};
  const parts = resolveSliderSemanticParts(styled?._children?.Parts ?? null)._children;
  const geometryParts = resolveSliderSemanticParts(resolved?._children?.Parts ?? null)._children;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const origin = { x: rect.x, y: rect.y };
  const source = `channel.${channel}.normalized`;
  const out = { parts: [], bindings: {}, partNames: {}, behavior: {} };
  let depth = zIndex;
  const add = (knobPart, part) => {
    out.parts.push(part);
    if (knobPart) out.partNames[knobPart] = [...(out.partNames[knobPart] ?? []), part.name];
    depth += 1;
    return part;
  };
  const named = (suffix) => uniqueName(`${prefix}_${suffix}`);

  // The renderer's derived values (SliderFamilyRenderer.svelte, the block from `trackThickness`).
  const g = (name) => geometryParts[name];
  const labelFontSize = (part, fallback) => Math.max(1, num(part?._children?.Text?._children?.Font?.size, fallback));
  const labelMetrics = {
    readoutSize: labelFontSize(g('labelValue'), 12),
    titleSize: labelFontSize(g('labelTitle'), 11),
    minMaxSize: Math.max(labelFontSize(g('labelMin'), 11), labelFontSize(g('labelMax'), 11)),
    handleSize: Math.max(labelFontSize(g('labelStart'), 11), labelFontSize(g('labelCurrent'), 11), labelFontSize(g('labelEnd'), 11)),
  };
  const showReadout = behavior.showValueReadout !== false;
  const showTicks = behavior.showTicks !== false;
  const trackThickness = num(g('bodyTrackBase')?._children?.Layout?.height, 10);
  const pointerCurrentSize = num(g('pointerCurrent')?._children?.Layout?.width, 20);
  const pointerStartSize = num(g('pointerStart')?._children?.Layout?.width, 18);
  const pointerEndSize = num(g('pointerEnd')?._children?.Layout?.width, 18);
  const maxPointerSize = Math.max(pointerCurrentSize, pointerStartSize, pointerEndSize);
  const kindOfPointer = String(g('pointerCurrent')?.kind ?? 'dot').toLowerCase();
  const pointerKind = ['line', 'chicken', 'capdot', 'needle'].includes(kindOfPointer) ? kindOfPointer : 'dot';
  const majorTickLength = num(g('tickMajor')?._children?.Layout?.height, num(behavior.majorTickLength, 12));
  const minorTickLength = num(g('tickMinor')?._children?.Layout?.height, num(behavior.minorTickLength, 7));
  const tickStrokeWidth = num(g('tickMajor')?._children?.Layout?.width, 2);
  const minorTickStrokeWidth = num(g('tickMinor')?._children?.Layout?.width, 1);
  const tight = String(behavior.circularFit ?? 'auto') === 'tight';
  const housingVisible = g('bodyHousing')?.visible === true;
  const housingReach = (() => {
    if (!housingVisible) return 0;
    const layout = g('bodyHousing')?._children?.Layout ?? {};
    if (String(layout.widthUnit ?? 'percent') === 'px') return 0;
    const reach = knobOutlineReach(String(g('bodyHousing')?.outline ?? 'circle'), {
      count: g('bodyHousing')?.outlineCount, depth: g('bodyHousing')?.outlineDepth, rotation: num(g('bodyHousing')?.outlineRotation, 0),
    });
    return (Math.max(0, num(layout.width, 100)) / 100) * reach;
  })();
  const metrics = resolveCircularTrackMetrics(width, height, {
    trackThickness,
    pointerSize: tight ? (pointerKind === 'dot' ? pointerCurrentSize : 0) : maxPointerSize,
    majorTickLength,
    hasTicks: showTicks,
    hasReadout: showReadout,
    circularDiameter: behavior.circularDiameter,
    labelMetrics,
    tight,
    showsMinMax: behavior.showMinMaxLabels !== false,
    readoutBelow: showReadout && String(behavior.labelReadoutPlacement ?? 'auto') === 'bottom',
    outerReach: housingReach,
    readoutGap: num(behavior.labelReadoutGap, 14),
  });
  const centre = { x: metrics.centerX, y: metrics.centerY };
  const radius = metrics.radius;
  const startPanel = getSliderStartAngle(behavior);
  const sweep = getSliderSweepAngle(behavior);
  const direction = getSliderDirection(behavior) === 'ccw' ? 'ccw' : 'cw';
  const signed = direction === 'ccw' ? -1 : 1;
  const angleAt = (t) => designerAngle(startPanel + signed * sweep * t);
  const radiusOf = (part, fallbackPercent) => {
    const layout = part?._children?.Layout ?? {};
    const size = Math.max(0, num(layout.width, fallbackPercent));
    return String(layout.widthUnit ?? 'percent') === 'px' ? size / 2 : radius * (size / 100);
  };
  const turnBinding = (layer, part) => {
    if (part?.turns !== true) return;
    // The outline is drawn as it stands at the start of the travel; the binding turns it from there.
    out.bindings[`${layer.name}Turn`] = rangeBinding(`${layer.name}Turn`, source, `Parts.${layer.name}.Layout.rotation`, 0, signed * sweep);
  };

  // Housing.
  if (housingVisible) {
    const r = radiusOf(g('bodyHousing'), 100);
    if (r > 0) {
      for (const layer of outlineLayers((extra) => named(`housing${extra}`), withTurnStart(parts.bodyHousing, startPanel), centre, r, origin, { zIndex: depth, borderFallback: 0, role: 'background' })) {
        add('bodyHousing', layer);
        turnBinding(layer, g('bodyHousing'));
      }
    }
  }

  // Track.
  const trackColour = fillOf(parts.bodyTrackBase).colour ?? 'FF2C2C2C';
  if (partVisible(g('bodyTrackBase'))) {
    add('bodyTrackBase', arcLayer(named('track'), {
      centre, radius, thickness: trackThickness, start: designerAngle(startPanel), sweep: Math.min(360, sweep), direction,
      colour: trackColour, opacity: num(g('bodyTrackBase')?.opacity, 1), zIndex: depth, origin, role: 'track',
    }));
  }

  // Centre marker.
  if (behavior.showCenterMarker === true && Number.isFinite(Number(behavior.centerValue))) {
    const min = getSliderMin(behavior);
    const max = getSliderMax(behavior);
    const t = max > min ? Math.max(0, Math.min(1, (num(behavior.centerValue, min) - min) / (max - min))) : 0.5;
    const markerWidth = num(g('bodyCenterMarker')?._children?.Layout?.width, 2);
    const markerLength = num(g('bodyCenterMarker')?._children?.Layout?.height, 18);
    add('bodyCenterMarker', radialBar(named('centre'), {
      centre, angle: angleAt(t), from: radius - markerLength / 2, to: radius + markerLength / 2, width: markerWidth, round: true,
      colour: fillOf(parts.bodyCenterMarker).colour ?? 'FFFFFFFF', opacity: num(g('bodyCenterMarker')?.opacity, 0.6), zIndex: depth, origin,
    }));
  }

  // Value arc: from the minimum, or both ways from the centre value.
  const fillColour = fillOf(parts.bodyTrackFill).colour ?? 'FF5B9BD5';
  if (partVisible(g('bodyTrackFill'))) {
    const fromCentre = String(behavior.fillOrigin ?? 'min').trim().toLowerCase() === 'center';
    const min = getSliderMin(behavior);
    const max = getSliderMax(behavior);
    const o = fromCentre && max > min ? Math.max(0, Math.min(1, (num(behavior.centerValue, min) - min) / (max - min))) : 0;
    const arcs = fromCentre
      ? [['valueUp', o, 1, direction], ['valueDown', 0, o, direction === 'ccw' ? 'cw' : 'ccw']]
      : [['value', 0, 1, direction]];
    for (const [suffix, from, to, way] of arcs) {
      if (to - from <= 0) continue;
      const layer = add('bodyTrackFill', arcLayer(named(suffix), {
        centre, radius, thickness: trackThickness, start: angleAt(o), sweep: 0, direction: way,
        colour: fillColour, opacity: num(g('bodyTrackFill')?.opacity, 1), zIndex: depth, origin, role: 'fill',
      }));
      const reach = sweep * (to - from);
      // Up from the origin the arc grows as the travel goes past it; down, as it falls below it.
      const outputs = suffix === 'valueDown' ? [reach, 0] : [0, reach];
      out.bindings[`${layer.name}Sweep`] = rangeBinding(`${layer.name}Sweep`, source, `Parts.${layer.name}.meta.arcTrack.sweepAngle`, outputs[0], outputs[1], from, to);
      // No arc at all at the origin, where the panel draws none.
      const edge = suffix === 'valueDown' ? [o - 0.0005, o] : [o, o + 0.0005];
      out.bindings[`${layer.name}Shown`] = rangeBinding(`${layer.name}Shown`, source, `Parts.${layer.name}.opacity`,
        suffix === 'valueDown' ? num(g('bodyTrackFill')?.opacity, 1) : 0, suffix === 'valueDown' ? 0 : num(g('bodyTrackFill')?.opacity, 1), edge[0], edge[1]);
    }
  }

  // Ticks, lit up to the value (from the origin) as the panel lights them.
  if (showTicks) {
    const stops = buildSliderTickStops(behavior);
    const mode = String(behavior.tickStops ?? 'all').trim();
    const majors = stops.major.map((stop, index) => ({ ...stop, index }));
    const majorShown = mode === 'ends'
      ? majors.filter((stop) => stop.index === 0 || stop.index === majors.length - 1)
      : (mode === 'endsCentre'
        ? majors.filter((stop) => stop.index === 0 || stop.index === majors.length - 1 || Math.abs(stop.index - (majors.length - 1) / 2) < 0.75)
        : majors);
    const shownIndex = new Set(majorShown.map((stop) => stop.index));
    const minorShown = mode === 'all' ? stops.minor : stops.minor.filter((stop) => shownIndex.has(Number(String(stop.key).split('_')[1])));
    const placement = String(behavior.tickPlacement ?? 'outside').trim().toLowerCase();
    const fromCentre = String(behavior.fillOrigin ?? 'min').trim().toLowerCase() === 'center';
    const min = getSliderMin(behavior);
    const max = getSliderMax(behavior);
    const o = fromCentre && max > min ? Math.max(0, Math.min(1, (num(behavior.centerValue, min) - min) / (max - min))) : 0;
    const tickSet = [
      ['tickMinor', minorShown, minorTickLength, minorTickStrokeWidth, 'FFB0B0B0', 'FFBFE0FF', 0.55, 0.9],
      ['tickMajor', majorShown, majorTickLength, tickStrokeWidth, 'FFD0D0D0', 'FFFFFFFF', 0.95, 1],
    ];
    let n = 0;
    for (const [partName, list, length, stroke, dimFallback, litFallback, dimOpacityFallback, litOpacity] of tickSet) {
      const part = parts[partName];
      const kind = String(g(partName)?.kind ?? 'line').toLowerCase();
      const own = fillOf(part).colour;
      const dimColour = own ?? dimFallback;
      const litColour = own ?? litFallback;
      const dimOpacity = num(g(partName)?.opacity, dimOpacityFallback);
      for (const stop of list) {
        const t = num(stop.normalized, 0);
        let r1 = radius + trackThickness / 2;
        let r2 = r1 + length;
        if (placement === 'inside') { r1 = radius - trackThickness / 2; r2 = r1 - length; }
        if (placement === 'cross') { r1 = radius - length / 2; r2 = radius + length / 2; }
        const angle = angleAt(t);
        // Lit while the travel is on the far side of the stop from the origin, as highlightStop has it.
        const litWhenAbove = t >= o;
        const threshold = litWhenAbove ? [t - 0.0005, t] : [t, t + 0.0005];
        // One tick, as the panel draws it, in `colour` at `opacity`: a layer or two, each with the
        // share of the opacity it takes (an engraved tick's light line under it takes 0.35).
        const drawTick = (suffix, colour, opacity) => {
          const tickName = (extra = '') => named(`tick${n}${suffix}${extra}`);
          if (kind === 'dot') {
            return [[add(partName, tickDot(tickName(), { centre, angle, at: (r1 + r2) / 2, r: Math.max(1.5, length * 0.45), colour, opacity, zIndex: depth, origin })), 1]];
          }
          if (kind === 'numeral') {
            const panelAngle = ((angle - 90) * Math.PI) / 180;
            const at = (r) => ({ x: centre.x + Math.cos(panelAngle) * r, y: centre.y + Math.sin(panelAngle) * r });
            const a = at(r1);
            const b = at(r2);
            const point = { x: b.x + (b.x - a.x) * 0.6, y: b.y + (b.y - a.y) * 0.6 };
            const size = Math.max(6, length * 1.4);
            const text = deepClone(SECTION_DEFAULTS.Text);
            text.content = numeralFor(behavior, stop);
            text._children.Fill.colour = colour;
            text._children.Font.size = size;
            text._children.Font.weightValue = 700;
            text._children.Font.weight = 'Bold';
            text._children.Position.justification = 'centred';
            const box = { x: point.x - size * 2, y: point.y - size, width: size * 4, height: size * 2 };
            return [[add(partName, createPartNode(tickName(), { role: 'label', kind: 'rectangle', zIndex: depth, opacity, layout: pxBox(box, origin), sections: { Text: text } })), 1]];
          }
          const line = { centre, angle, from: Math.min(r1, r2), to: Math.max(r1, r2), width: stroke, colour, zIndex: depth, origin };
          if (kind === 'engraved') {
            // A light line 0.6 px right and 0.8 px down on screen, under the tick: turned back by the
            // tick's angle, since the layer is drawn upright and turned.
            const turn = (-angle * Math.PI) / 180;
            const dx = 0.6 * Math.cos(turn) - 0.8 * Math.sin(turn);
            const dy = 0.6 * Math.sin(turn) + 0.8 * Math.cos(turn);
            const light = radialBar(tickName('light'), { ...line, colour: 'FFFFFFFF', opacity: opacity * 0.35, round: true });
            light._children.Layout.x = r3(light._children.Layout.x + dx);
            light._children.Layout.y = r3(light._children.Layout.y + dy);
            const pivot = { x: centre.x - dx, y: centre.y - dy };
            Object.assign(light._children.Layout, pivotIn(boxOfLayout(light._children.Layout, origin), pivot));
            return [[add(partName, light), 0.35], [add(partName, radialBar(tickName(), { ...line, opacity, round: true })), 1]];
          }
          return [[add(partName, radialBar(tickName(), { ...line, opacity, round: false })), 1]];
        };
        const fade = (layers, from, to, label) => {
          for (const [layer, share] of layers) {
            out.bindings[`${layer.name}${label}`] = rangeBinding(`${layer.name}${label}`, source, `Parts.${layer.name}.opacity`,
              from * share, to * share, threshold[0], threshold[1]);
          }
        };
        if (dimColour === litColour) {
          fade(drawTick('', dimColour, dimOpacity), litWhenAbove ? dimOpacity : litOpacity, litWhenAbove ? litOpacity : dimOpacity, 'Lit');
        } else {
          fade(drawTick('', dimColour, dimOpacity), litWhenAbove ? dimOpacity : 0, litWhenAbove ? 0 : dimOpacity, 'Dim');
          fade(drawTick('lit', litColour, litOpacity), litWhenAbove ? 0 : litOpacity, litWhenAbove ? litOpacity : 0, 'Lit');
        }
        n += 1;
      }
    }
  }

  // Cap.
  const capVisible = g('bodyCap')?.visible === true;
  const capRadius = capVisible ? radiusOf(g('bodyCap'), 72) : 0;
  if (capRadius > 0) {
    for (const layer of outlineLayers((extra) => named(`cap${extra}`), withTurnStart(parts.bodyCap, startPanel), centre, capRadius, origin, { zIndex: depth, borderFallback: 1, role: 'cap' })) {
      add('bodyCap', layer);
      turnBinding(layer, g('bodyCap'));
    }
  }

  // Pointer, drawn at the start of the travel and turned about the centre by the value.
  if (partVisible(g('pointerCurrent'))) {
    const reach = capRadius > 0 ? capRadius : radius * 0.7;
    const pointerPart = parts.pointerCurrent;
    const geometryPointer = g('pointerCurrent');
    const tip = reach * (num(geometryPointer?._children?.Layout?.height, 88) / 100);
    const thick = Math.max(1, pointerCurrentSize);
    const startAngle = designerAngle(startPanel);
    const colourOr = (fallback) => fillOf(pointerPart).colour ?? fallback;
    let layer = null;
    let pointerLayers = null;
    if (pointerKind === 'line') {
      const r0 = reach * (num(geometryPointer?._children?.Layout?.offsetX, 30) / 100);
      layer = radialBar(named('pointer'), { centre, angle: startAngle, from: r0, to: tip, width: thick, round: true, colour: colourOr('FFFFFFFF'), opacity: num(geometryPointer?.opacity, 1), zIndex: depth, origin });
    } else if (pointerKind === 'capdot') {
      const r = Math.max(1.5, reach * (num(geometryPointer?._children?.Layout?.width, 26) / 200));
      layer = tickDot(named('pointer'), { centre, angle: startAngle, at: tip, r, colour: colourOr('FFFFFFFF'), opacity: num(geometryPointer?.opacity, 1), zIndex: depth, origin });
    } else if (pointerKind === 'dot') {
      const point = { x: centre.x, y: centre.y - radius };
      const r = pointerCurrentSize / 2;
      pointerLayers = outlineLayers((extra) => named(`pointer${extra}`), pointerPart, point, r, origin, { zIndex: depth, borderFallback: 1, role: 'handle' });
      for (const dot of pointerLayers) {
        Object.assign(dot._children.Layout, pivotIn(boxOfLayout(dot._children.Layout, origin), centre));
        dot._children.Layout.rotation = startAngle;
      }
    } else {
      // Needle or chicken-head: a polygon, its stroke as wide as the panel draws it.
      const points = pointerKind === 'needle'
        ? (() => {
          const half = thick / 2;
          const tail = reach * (num(geometryPointer?._children?.Layout?.offsetX, 25) / 100);
          return [[tip, 0], [0, half], [-tail, half * 0.3], [-tail, -half * 0.3], [0, -half]];
        })()
        : [[-reach * 0.28, -thick / 2], [tip, -Math.max(1, thick * 0.22)], [tip, Math.max(1, thick * 0.22)], [-reach * 0.28, thick / 2]];
      const stroke = pointerKind === 'needle' ? 1 : Math.max(1, thick * 0.35);
      // Pointing up (12 o'clock): along -y, across +x.
      const absolute = points.map(([along, across]) => [centre.x + across, centre.y - along]);
      const shape = normalisePoints(absolute);
      const box = { x: shape.box.x - stroke / 2, y: shape.box.y - stroke / 2, width: shape.box.width + stroke, height: shape.box.height + stroke };
      const colour = colourOr('FF1C1A17');
      layer = createPartNode(named('pointer'), {
        role: 'handle', kind: 'path', zIndex: depth, opacity: num(geometryPointer?.opacity, 1),
        layout: { ...pxBox(box, origin), ...pivotIn(box, centre), rotation: startAngle },
        meta: { pathData: shape.d, closed: true },
        sections: { Background: solidBackground(colour, { borderColour: colour, borderThickness: stroke }) },
      });
    }
    for (const each of pointerLayers ?? (layer ? [layer] : [])) {
      add('pointerCurrent', each);
      out.bindings[`${each.name}Turn`] = rangeBinding(`${each.name}Turn`, source, `Parts.${each.name}.Layout.rotation`, startAngle, startAngle + signed * sweep);
    }
  }

  // Readout and title, where the panel's labels hang: centred on their anchor.
  const anchors = buildSliderLabelAnchors(behavior, width, height, { start: 0, current: 0, end: 0 }, {
    trackThickness, pointerSize: maxPointerSize, hasReadout: showReadout, labelMetrics,
  });
  addLabelLayers({ behavior, parts, resolved, width, origin, add, named, depthOf: () => depth, out, channel, showReadout }, anchors);

  // The drag: the knob's own mode, about its centre, over its own sweep.
  out.behavior = {
    geometry: 'circular',
    dragMode: String(behavior.circularDragMode ?? 'absolute').trim().toLowerCase() === 'knob' ? 'relative' : 'circular',
    startAngle: designerAngle(startPanel),
    sweepAngle: sweep,
    direction,
    centerX: r3((centre.x / width) * 100),
    centerY: r3((centre.y / height) * 100),
  };
  return out;
}

/**
 * The readout, the title and the min and max labels, as text layers centred on where the panel hangs
 * its labels (`anchors`, buildSliderLabelAnchors). The readout shows the channel's value as the
 * control's readout did, unless its text was written by hand.
 */
function addLabelLayers({ behavior, parts, resolved, width, origin, add, named, depthOf, out, channel, showReadout }, anchors) {
  const textLayer = (suffix, part, anchor, content, fallbackSize) => {
    const text = deepClone(part?._children?.Text ?? SECTION_DEFAULTS.Text);
    text.content = content;
    text._children ??= {};
    text._children.Font = { ...(text._children.Font ?? {}) };
    text._children.Font.size = num(text._children.Font.size, fallbackSize);
    text._children.Font.weightValue = num(text._children.Font.weightValue, 600);
    text._children.Font.family = text._children.Font.family ?? 'Arial';
    text._children.Fill = { ...(text._children.Fill ?? {}), colour: text._children.Fill?.colour ?? 'FFFFFFFF' };
    text._children.Position = { ...(text._children.Position ?? {}), justification: anchor?.align === 'start' ? 'left' : (anchor?.align === 'end' ? 'right' : 'centred') };
    const size = text._children.Font.size;
    const boxWidth = width + 16;
    const boxHeight = Math.ceil(size * 2);
    const x = anchor?.align === 'start' ? anchor.x - 8 : (anchor?.align === 'end' ? anchor.x - boxWidth + 8 : anchor.x - boxWidth / 2);
    const box = { x, y: anchor.y - boxHeight / 2, width: boxWidth, height: boxHeight };
    return createPartNode(named(suffix), { role: 'label', kind: 'rectangle', zIndex: depthOf(), opacity: num(part?.opacity, 1), layout: pxBox(box, origin), sections: { Text: text } });
  };
  if (showReadout) {
    const authored = String(parts.labelValue?._children?.Text?.content ?? '').trim();
    const layer = add('labelValue', textLayer('readout', parts.labelValue, anchors.value, authored || '', 12));
    if (!authored) {
      out.bindings[`${layer.name}Text`] = { _type: 'Binding', name: `${layer.name}Text`, enabled: true, source: `channel.${channel}.display`, mapMode: 'direct', target: `Parts.${layer.name}.Text.content` };
    }
  }
  const title = String(parts.labelTitle?._children?.Text?.content ?? resolved?._children?.Text?.content ?? '').trim();
  if (title) add('labelTitle', textLayer('title', parts.labelTitle, anchors.title, title, 11));
  if (behavior.showMinMaxLabels !== false) {
    const minText = String(parts.labelMin?._children?.Text?.content ?? '').trim();
    const maxText = String(parts.labelMax?._children?.Text?.content ?? '').trim();
    add('labelMin', textLayer('min', parts.labelMin, anchors.min, minText || formatPlain(behavior, getSliderMin(behavior)), 11));
    add('labelMax', textLayer('max', parts.labelMax, anchors.max, maxText || formatPlain(behavior, getSliderMax(behavior)), 11));
  }
}

// --- sliders ---------------------------------------------------------------------------------------

const LINEAR_LAYER_CAPS = new Set(['dot', 'bar', 'ring', 'line']);

/** Why this slider cannot become layers that look as it does, or ''. */
function sliderLayersRefusal(resolved) {
  const behavior = resolved?._children?.Behavior ?? {};
  const parts = resolveSliderSemanticParts(resolved?._children?.Parts ?? null)._children;
  const cap = parts.pointerCurrent ?? {};
  const capKind = String(cap.kind ?? 'dot').toLowerCase();
  if (partVisible(cap) && String(cap.look ?? '') === 'rendered') return 'a rendered fader cap, which a layer does not draw yet';
  if (partVisible(cap) && !LINEAR_LAYER_CAPS.has(capKind)) return `a "${capKind}" fader cap, which a layer does not draw yet`;
  // `shadow` is a drop shadow filtering a shape drawn at 0.001 opacity (SliderFamilyRenderer's
  // linearCap): next to nothing reaches the screen, so a layer draws nothing for it.
  if (cap.glow === true) return 'a glow round its fader cap, which a layer does not draw yet';
  if (capKind === 'bar' && cap.sheen === true) return 'a sheen on its fader cap, which a layer does not draw yet';
  if (partVisible(parts.bodyTrackFill) && parts.bodyTrackFill?.glow === true) return 'a glowing value fill, which a layer does not draw yet';
  if (partVisible(parts.bodyTrackBase) && fillIsRich(parts.bodyTrackBase)) return 'a gradient along its track, which a layer does not draw yet';
  if (partVisible(parts.bodyTrackFill) && fillIsRich(parts.bodyTrackFill)) return 'a gradient along its value fill, which a layer does not draw yet';
  if (partVisible(cap) && capKind !== 'line' && fillIsRich(cap)) return 'a gradient or finish on its fader cap, which a layer does not draw yet';
  if (behavior.showHandleLabels === true) return 'a label that rides the cap';
  return '';
}

/**
 * The layers, bindings and state patches for one slider, as knobLayers does for a knob: the track
 * (and its edge and slot), the value fill from its origin, the ticks, the fader cap moving along the
 * track, and the labels. The geometry is SliderFamilyRenderer's linear drawing.
 */
export function sliderLayers({ resolved, styled = resolved, rect, channel, prefix, zIndex, uniqueName }) {
  const behavior = resolved._children.Behavior ?? {};
  const parts = resolveSliderSemanticParts(styled?._children?.Parts ?? null)._children;
  const geometryParts = resolveSliderSemanticParts(resolved?._children?.Parts ?? null)._children;
  const g = (name) => geometryParts[name];
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const origin = { x: rect.x, y: rect.y };
  const source = `channel.${channel}.normalized`;
  const out = { parts: [], bindings: {}, partNames: {}, behavior: {} };
  let depth = zIndex;
  const add = (sliderPart, part) => {
    out.parts.push(part);
    if (sliderPart) out.partNames[sliderPart] = [...(out.partNames[sliderPart] ?? []), part.name];
    depth += 1;
    return part;
  };
  const named = (suffix) => uniqueName(`${prefix}_${suffix}`);
  const vertical = getSliderOrientation(behavior) === 'vertical';

  const labelFontSize = (part, fallback) => Math.max(1, num(part?._children?.Text?._children?.Font?.size, fallback));
  const labelMetrics = {
    readoutSize: labelFontSize(g('labelValue'), 12),
    titleSize: labelFontSize(g('labelTitle'), 11),
    minMaxSize: Math.max(labelFontSize(g('labelMin'), 11), labelFontSize(g('labelMax'), 11)),
    handleSize: Math.max(labelFontSize(g('labelStart'), 11), labelFontSize(g('labelCurrent'), 11), labelFontSize(g('labelEnd'), 11)),
  };
  const showReadout = behavior.showValueReadout !== false;
  const showTicks = behavior.showTicks !== false;
  const trackThickness = num(g('bodyTrackBase')?._children?.Layout?.height, 10);
  const pointerCurrentSize = num(g('pointerCurrent')?._children?.Layout?.width, 20);
  const maxPointerSize = Math.max(pointerCurrentSize, num(g('pointerStart')?._children?.Layout?.width, 18), num(g('pointerEnd')?._children?.Layout?.width, 18));
  const frame = resolveLinearTrackFrame(behavior, width, height, trackThickness, maxPointerSize, showReadout, labelMetrics);
  const pointAt = (t, size) => resolveLinearPointerPoint(behavior, width, height, t, trackThickness, size, showReadout, labelMetrics);
  const corners = g('bodyTrackBase')?._children?.Background?._children?.Corners;
  const cornerRadius = num(corners?.radius, 999);
  const square = cornerRadius < trackThickness / 2 ? Math.max(0, cornerRadius) : null;
  const fillInset = Math.max(0, Math.min(trackThickness / 2 - 1, num(g('bodyTrackFill')?.inset, 0)));
  const fillThickness = Math.max(1, trackThickness - fillInset * 2);

  // A bar from a to b across `thickness`: a pill (round ends, the line it was) or a rectangle with the
  // track's corner radius. `rx` null is the pill.
  const barBox = (a, b, thickness, round) => (vertical
    ? { x: a.x - thickness / 2, y: Math.min(a.y, b.y) - (round ? thickness / 2 : 0), width: thickness, height: Math.abs(b.y - a.y) + (round ? thickness : 0) }
    : { x: Math.min(a.x, b.x) - (round ? thickness / 2 : 0), y: a.y - thickness / 2, width: Math.abs(b.x - a.x) + (round ? thickness : 0), height: thickness });
  const barLayer = (name, box, round, colour, opacity, rx = 0) => {
    const background = solidBackground(colour);
    if (!round) background._children.Corners.radius = rx;
    return createPartNode(name, { role: 'track', kind: round ? 'capsule' : 'roundedRectangle', zIndex: depth, opacity, layout: pxBox(box, origin), sections: { Background: background } });
  };

  // Track: its edge under it, the track, its slot.
  const trackPart = g('bodyTrackBase');
  if (partVisible(trackPart)) {
    const round = square === null;
    const edge = borderWidth(trackPart, 0);
    if (edge > 0) {
      const box = barBox({ x: frame.x1, y: frame.y1 }, { x: frame.x2, y: frame.y2 }, trackThickness + edge * 2, round);
      if (!round) Object.assign(box, vertical ? { y: box.y - edge, height: box.height + edge * 2 } : { x: box.x - edge, width: box.width + edge * 2 });
      add('bodyTrackBase', barLayer(named('trackEdge'), box, round, parts.bodyTrackBase?._children?.Background?._children?.Border?.colour ?? 'FF000000', num(trackPart?.opacity, 1), (square ?? 0) + edge));
    }
    add('bodyTrackBase', barLayer(named('track'), barBox({ x: frame.x1, y: frame.y1 }, { x: frame.x2, y: frame.y2 }, trackThickness, round),
      round, fillOf(parts.bodyTrackBase).colour ?? 'FF2C2C2C', num(trackPart?.opacity, 1), square ?? 0));
    if (trackPart?.slot === true) {
      const q = trackThickness / 4;
      const along = round ? q : 0;
      const a = vertical ? { x: frame.x1 - q, y: Math.min(frame.y1, frame.y2) + along } : { x: Math.min(frame.x1, frame.x2) + along, y: frame.y1 - q };
      const b = vertical ? { x: frame.x1 - q, y: Math.max(frame.y1, frame.y2) - along } : { x: Math.max(frame.x1, frame.x2) - along, y: frame.y1 - q };
      add('bodyTrackBase', barLayer(named('slot'), barBox(a, b, trackThickness / 2, round), round, 'FF000000', 0.42 * num(trackPart?.opacity, 1)));
    }
  }

  // Centre marker.
  const min = getSliderMin(behavior);
  const max = getSliderMax(behavior);
  const centreTravel = max > min ? Math.max(0, Math.min(1, (num(behavior.centerValue, min) - min) / (max - min))) : 0.5;
  if (behavior.showCenterMarker === true && Number.isFinite(Number(behavior.centerValue))) {
    const markerWidth = num(g('bodyCenterMarker')?._children?.Layout?.width, 2);
    const markerLength = num(g('bodyCenterMarker')?._children?.Layout?.height, 18);
    const p = pointAt(centreTravel, maxPointerSize);
    const box = vertical
      ? { x: p.x - markerLength / 2 - markerWidth / 2, y: p.y - markerWidth / 2, width: markerLength + markerWidth, height: markerWidth }
      : { x: p.x - markerWidth / 2, y: p.y - markerLength / 2 - markerWidth / 2, width: markerWidth, height: markerLength + markerWidth };
    add('bodyCenterMarker', barLayer(named('centre'), box, true, fillOf(parts.bodyCenterMarker).colour ?? 'FFFFFFFF', num(g('bodyCenterMarker')?.opacity, 0.6)));
  }

  // Value fill, from its origin to the value: one bar growing each way it can.
  const fillPart = g('bodyTrackFill');
  if (partVisible(fillPart)) {
    const fromCentre = String(behavior.fillOrigin ?? 'min').trim().toLowerCase() === 'center';
    const o = fromCentre ? centreTravel : 0;
    const round = square === null;
    const po = pointAt(o, pointerCurrentSize);
    const colour = fillOf(parts.bodyTrackFill).colour ?? 'FF5B9BD5';
    const segments = fromCentre ? [['valueUp', o, 1], ['valueDown', 0, o]] : [['value', 0, 1]];
    for (const [suffix, from, to] of segments) {
      if (to - from <= 0) continue;
      const far = pointAt(suffix === 'valueDown' ? 0 : 1, pointerCurrentSize);
      const layer = add('bodyTrackFill', barLayer(named(suffix), barBox(po, po, fillThickness, round), round, colour, num(fillPart?.opacity, 1), square ?? 0));
      const [lengthKey, posKey, a, b] = vertical ? ['height', 'y', po.y, far.y] : ['width', 'x', po.x, far.x];
      const base = round ? fillThickness : 0;
      // Longer as the travel leaves the origin; where it grows up or left, its box moves with its end.
      const growing = suffix === 'valueDown' ? [to, from] : [from, to];
      out.bindings[`${layer.name}Length`] = rangeBinding(`${layer.name}Length`, source, `Parts.${layer.name}.Layout.${lengthKey}`, base, Math.abs(b - a) + base, growing[0], growing[1]);
      if (b < a) {
        const start = layer._children.Layout[posKey];
        out.bindings[`${layer.name}Move`] = rangeBinding(`${layer.name}Move`, source, `Parts.${layer.name}.Layout.${posKey}`, start, start - (a - b), growing[0], growing[1]);
      }
      if (fromCentre) {
        // Only the side the value is on: the other stays at the origin, where the panel draws one.
        const edge = suffix === 'valueDown' ? [o - 0.0005, o] : [o, o + 0.0005];
        const opacity = num(fillPart?.opacity, 1);
        if (suffix === 'valueDown') out.bindings[`${layer.name}Shown`] = rangeBinding(`${layer.name}Shown`, source, `Parts.${layer.name}.opacity`, opacity, 0, edge[0], edge[1]);
      }
    }
  }

  // Ticks, lit up to the value from the origin.
  if (showTicks) {
    const stops = buildSliderTickStops(behavior);
    const mode = String(behavior.tickStops ?? 'all').trim();
    const majors = stops.major.map((stop, index) => ({ ...stop, index }));
    const majorShown = mode === 'ends'
      ? majors.filter((stop) => stop.index === 0 || stop.index === majors.length - 1)
      : (mode === 'endsCentre'
        ? majors.filter((stop) => stop.index === 0 || stop.index === majors.length - 1 || Math.abs(stop.index - (majors.length - 1) / 2) < 0.75)
        : majors);
    const shownIndex = new Set(majorShown.map((stop) => stop.index));
    const minorShown = mode === 'all' ? stops.minor : stops.minor.filter((stop) => shownIndex.has(Number(String(stop.key).split('_')[1])));
    const placement = String(behavior.tickPlacement ?? 'outside').trim().toLowerCase();
    const fromCentre = String(behavior.fillOrigin ?? 'min').trim().toLowerCase() === 'center';
    const o = fromCentre ? centreTravel : 0;
    const lineFor = (t, length) => {
      const p = pointAt(t, maxPointerSize);
      const half = trackThickness / 2;
      if (vertical) {
        if (placement === 'inside') return { x1: p.x - half, y1: p.y, x2: p.x - half - length, y2: p.y };
        if (placement === 'cross') return { x1: p.x - length / 2, y1: p.y, x2: p.x + length / 2, y2: p.y };
        return { x1: p.x + half, y1: p.y, x2: p.x + half + length, y2: p.y };
      }
      if (placement === 'inside') return { x1: p.x, y1: p.y - half, x2: p.x, y2: p.y - half - length };
      if (placement === 'cross') return { x1: p.x, y1: p.y - length / 2, x2: p.x, y2: p.y + length / 2 };
      return { x1: p.x, y1: p.y + half, x2: p.x, y2: p.y + half + length };
    };
    let n = 0;
    for (const [partName, list, lengthDefault, strokeDefault, dimFallback, litFallback, dimOpacityFallback, litOpacity] of [
      ['tickMinor', minorShown, num(behavior.minorTickLength, 7), 1, 'FFB0B0B0', 'FFBFE0FF', 0.55, 0.9],
      ['tickMajor', majorShown, num(behavior.majorTickLength, 12), 2, 'FFD0D0D0', 'FFFFFFFF', 0.95, 1],
    ]) {
      const kind = String(g(partName)?.kind ?? 'line').toLowerCase();
      const length = num(g(partName)?._children?.Layout?.height, lengthDefault);
      const stroke = num(g(partName)?._children?.Layout?.width, strokeDefault);
      const own = fillOf(parts[partName]).colour;
      const dimOpacity = num(g(partName)?.opacity, dimOpacityFallback);
      for (const stop of list) {
        const t = num(stop.normalized, 0);
        const line = lineFor(t, length);
        const litWhenAbove = t >= o;
        const threshold = litWhenAbove ? [t - 0.0005, t] : [t, t + 0.0005];
        const drawTick = (suffix, colour, opacity) => {
          const tickName = (extra = '') => named(`tick${n}${suffix}${extra}`);
          const lineBox = (l, w, round) => {
            const x = Math.min(l.x1, l.x2);
            const y = Math.min(l.y1, l.y2);
            const along = l.x1 === l.x2;
            return along
              ? { x: x - w / 2, y: y - (round ? w / 2 : 0), width: w, height: Math.abs(l.y2 - l.y1) + (round ? w : 0) }
              : { x: x - (round ? w / 2 : 0), y: y - w / 2, width: Math.abs(l.x2 - l.x1) + (round ? w : 0), height: w };
          };
          if (kind === 'dot') {
            const r = Math.max(1.5, length * 0.45);
            const cx = (line.x1 + line.x2) / 2;
            const cy = (line.y1 + line.y2) / 2;
            return [[add(partName, createPartNode(tickName(), { role: 'custom', kind: 'circle', zIndex: depth, opacity, layout: pxBox({ x: cx - r, y: cy - r, width: 2 * r, height: 2 * r }, origin), sections: { Background: solidBackground(colour) } })), 1]];
          }
          if (kind === 'numeral') {
            const point = { x: line.x2 + (line.x2 - line.x1) * 0.6, y: line.y2 + (line.y2 - line.y1) * 0.6 };
            const size = Math.max(6, length * 1.4);
            const text = deepClone(SECTION_DEFAULTS.Text);
            text.content = numeralFor(behavior, stop);
            text._children.Fill.colour = colour;
            text._children.Font.size = size;
            text._children.Font.weightValue = 700;
            text._children.Font.weight = 'Bold';
            text._children.Position.justification = 'centred';
            const box = { x: point.x - size * 2, y: point.y - size, width: size * 4, height: size * 2 };
            return [[add(partName, createPartNode(tickName(), { role: 'label', kind: 'rectangle', zIndex: depth, opacity, layout: pxBox(box, origin), sections: { Text: text } })), 1]];
          }
          if (kind === 'engraved') {
            const light = { x1: line.x1 + 0.6, y1: line.y1 + 0.8, x2: line.x2 + 0.6, y2: line.y2 + 0.8 };
            return [
              [add(partName, barLayer(tickName('light'), lineBox(light, stroke, true), true, 'FFFFFFFF', opacity * 0.35)), 0.35],
              [add(partName, barLayer(tickName(), lineBox(line, stroke, true), true, colour, opacity)), 1],
            ];
          }
          return [[add(partName, barLayer(tickName(), lineBox(line, stroke, false), false, colour, opacity, 0)), 1]];
        };
        const fade = (layers, from, to, label) => {
          for (const [layer, share] of layers) {
            out.bindings[`${layer.name}${label}`] = rangeBinding(`${layer.name}${label}`, source, `Parts.${layer.name}.opacity`, from * share, to * share, threshold[0], threshold[1]);
          }
        };
        const dimColour = own ?? dimFallback;
        const litColour = own ?? litFallback;
        if (dimColour === litColour) {
          fade(drawTick('', dimColour, dimOpacity), litWhenAbove ? dimOpacity : litOpacity, litWhenAbove ? litOpacity : dimOpacity, 'Lit');
        } else {
          fade(drawTick('', dimColour, dimOpacity), litWhenAbove ? dimOpacity : 0, litWhenAbove ? 0 : dimOpacity, 'Dim');
          fade(drawTick('lit', litColour, litOpacity), litWhenAbove ? 0 : litOpacity, litWhenAbove ? litOpacity : 0, 'Lit');
        }
        n += 1;
      }
    }
  }

  // The fader cap, drawn at the start of the travel and moved along the track by the value.
  const capPart = parts.pointerCurrent;
  const capGeometryPart = g('pointerCurrent');
  if (partVisible(capGeometryPart)) {
    const kind = String(capGeometryPart?.kind ?? 'dot').toLowerCase();
    const at = pointAt(0, pointerCurrentSize);
    const end = pointAt(1, pointerCurrentSize);
    const along = Math.max(2, num(capGeometryPart?._children?.Layout?.width, 20));
    const across = Math.max(2, num(capGeometryPart?._children?.Layout?.height, 20));
    const fill = fillOf(capPart).colour ?? 'FFFFFFFF';
    const opacity = num(capGeometryPart?.opacity, 1);
    const capLayers = [];
    if (kind === 'dot') {
      capLayers.push(...outlineLayers((extra) => named(`cap${extra}`), capPart, at, along / 2, origin, { zIndex: depth, borderFallback: 1, role: 'handle' }));
    } else if (kind === 'ring') {
      const ring = Math.max(2, across / 4);
      const r = Math.max(2, (along / 2) - (ring / 2));
      const outer = r + ring / 2;
      const inner = Math.max(0.5, r - ring / 2) / (2 * outer);
      const background = solidBackground(fill);
      capLayers.push(createPartNode(named('cap'), {
        role: 'handle', kind: 'path', zIndex: depth, opacity,
        layout: pxBox({ x: at.x - outer, y: at.y - outer, width: 2 * outer, height: 2 * outer }, origin),
        meta: { pathData: `${UNIT_CIRCLE} M${r3(0.5 - inner)} 0.5 a${r3(inner)} ${r3(inner)} 0 1 1 ${r3(inner * 2)} 0 a${r3(inner)} ${r3(inner)} 0 1 1 ${r3(-inner * 2)} 0 Z`, closed: true },
        sections: { Background: background },
      }));
    } else if (kind === 'line') {
      const w = vertical ? across : along;
      const h = vertical ? along : across;
      const box = vertical
        ? { x: at.x - w / 2 - along / 2, y: at.y - along / 2, width: w + along, height: along }
        : { x: at.x - along / 2, y: at.y - h / 2 - along / 2, width: along, height: h + along };
      capLayers.push(barLayer(named('cap'), box, true, fill, opacity));
    } else {
      // A fader cap ('bar'): a rounded rectangle, its border, and a groove across the travel.
      const w = vertical ? across : along;
      const h = vertical ? along : across;
      const box = { x: at.x - w / 2, y: at.y - h / 2, width: w, height: h };
      const rx = Math.min(w, h) * 0.18;
      const bw = borderWidth(capGeometryPart, 1);
      const background = backgroundFrom(capPart, { borderFallback: 1, borderColourFallback: 'FF333333' });
      background._children.Corners = { ...(background._children.Corners ?? deepClone(SECTION_DEFAULTS.Background._children.Corners)), radius: rx };
      // The panel strokes the border centred on the edge; a box draws it inside.
      capLayers.push(createPartNode(named('cap'), {
        role: 'handle', kind: 'roundedRectangle', zIndex: depth, opacity,
        layout: pxBox({ x: box.x - bw / 2, y: box.y - bw / 2, width: box.width + bw, height: box.height + bw }, origin),
        sections: { Background: background },
      }));
      const stroke = Math.max(1.5, Math.min(w, h) * 0.18);
      const margin = 3;
      const groove = vertical
        ? { x: box.x + margin, y: at.y, width: w - margin * 2, height: 0 }
        : { x: at.x, y: box.y + margin, width: 0, height: h - margin * 2 };
      const grooveColour = capPart?.grooveColour ?? capPart?._children?.Background?._children?.Border?.colour ?? 'FF333333';
      capLayers.push(barLayer(named('capGroove'), vertical
        ? { x: groove.x - stroke / 2, y: groove.y - stroke / 2, width: groove.width + stroke, height: stroke }
        : { x: groove.x - stroke / 2, y: groove.y - stroke / 2, width: stroke, height: groove.height + stroke }, true, grooveColour, opacity * 0.85));
    }
    const [key, from, to] = vertical ? ['offsetY', 0, end.y - at.y] : ['offsetX', 0, end.x - at.x];
    for (const layer of capLayers) {
      add('pointerCurrent', layer);
      out.bindings[`${layer.name}Move`] = rangeBinding(`${layer.name}Move`, source, `Parts.${layer.name}.Layout.${key}`, from, to);
    }
  }

  const anchors = buildSliderLabelAnchors(behavior, width, height, { start: 0, current: 0, end: 0 }, {
    trackThickness, pointerSize: maxPointerSize, hasReadout: showReadout, labelMetrics,
  });
  addLabelLayers({ behavior, parts, resolved, width, origin, add, named, depthOf: () => depth, out, channel, showReadout }, anchors);

  // The drag: across the track, from one end to the other.
  const lo = pointAt(0, pointerCurrentSize);
  const hi = pointAt(1, pointerCurrentSize);
  out.behavior = {
    geometry: vertical ? 'vertical' : 'linear',
    dragMode: 'auto',
    zone: vertical
      ? { x: 0, y: Math.min(lo.y, hi.y), width, height: Math.abs(hi.y - lo.y) }
      : { x: Math.min(lo.x, hi.x), y: 0, width: Math.abs(hi.x - lo.x), height },
    reversed: vertical ? hi.y > lo.y : hi.x < lo.x,
  };
  return out;
}

/**
 * The layers as they stand at `travel`: each range binding's value written into its layer, so the
 * designer, which draws what is authored, shows the control at its value and not at its start.
 */
export function seedLayersAt(parts, bindings, travel) {
  const byName = new Map(parts.map((part) => [part.name, part]));
  for (const binding of Object.values(bindings ?? {})) {
    if (binding?.mapMode !== 'range') continue;
    const match = /^Parts\.([^.]+)\.(.+)$/.exec(String(binding.target ?? ''));
    const part = match ? byName.get(match[1]) : null;
    if (!part) continue;
    const span = binding.inputMax - binding.inputMin;
    const t = span === 0 ? (travel >= binding.inputMax ? 1 : 0) : Math.max(0, Math.min(1, (travel - binding.inputMin) / span));
    const value = r3(binding.outputMin + (binding.outputMax - binding.outputMin) * t);
    const path = match[2].split('.');
    let node = part;
    for (const key of path.slice(0, -1)) {
      const next = key === 'meta' || key in node ? node[key] : node._children?.[key];
      if (!next || typeof next !== 'object') { node = null; break; }
      node = next;
    }
    if (node) node[path[path.length - 1]] = value;
  }
  return parts;
}

// --- buttons and switches drawn as a device ----------------------------------------------------------

/**
 * Why a button or switch drawn with device parts cannot become layers, or ''. A part that rides a
 * key which turns would need two turns at once; a layer has one.
 */
export function buttonDeviceLayersRefusal(resolved) {
  const parts = resolved?._children?.Parts?._children ?? {};
  const key = parts.key;
  const keyTurns = Boolean(Number(key?.swing ?? 0) || Number(key?._children?.Layout?.rotation ?? 0));
  // A drop shadow under a part (the sculpted synth set's), which a layer does not draw yet.
  for (const name of BUTTON_DEVICE_PARTS) {
    if (parts[name]?.visible === true && (Number(parts[name]?.shadowOffset) > 0 || Number(parts[name]?.shadowBlur) > 0)) return `a shadow under its ${name}, which a layer does not draw yet`;
    if (parts[name]?.visible === true && String(parts[name]?.look ?? '') === 'rendered') return `a rendered ${name}, which a layer does not draw yet`;
  }
  for (const name of BUTTON_DEVICE_PARTS) {
    const part = parts[name];
    if (part?.visible !== true || name === 'key') continue;
    // Riding a key that turns, a part turns about the key's pivot; one that also turns itself would
    // need two turns about two points, which one layer cannot do.
    const ownTurn = Boolean(Number(part.swing ?? 0) || Number(part?._children?.Layout?.rotation ?? 0)
      || Number(part.travelX ?? 0) || Number(part.travelY ?? 0));
    if (String(part.follows ?? '') === 'key' && keyTurns && ownTurn) return `its ${name} moves on a key that turns, which one layer cannot do`;
  }
  return '';
}

/** Where the device frame's units land in the control's box: `{ x, y, scale }`, and the caption. */
function deviceFrameIn(width, height, caption, letterSpacing) {
  const lay = buttonAnatomyLayout(width, height, caption, { letterSpacing });
  if (lay) {
    const [x, y, scale] = (/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(lay.device) ?? [0, 0, 0, 1]).slice(1).map(Number);
    return { x, y, scale, caption: lay.caption ?? null, inFrame: false };
  }
  // The frame's 160 by 100 units, fitted into the box and centred (an svg's viewBox, "meet").
  const scale = Math.min(width / 160, height / 100);
  return { x: (width - 160 * scale) / 2, y: (height - 100 * scale) / 2, scale, caption: null, inFrame: true };
}

/**
 * A button or switch drawn with device parts (models/buttonDeviceParts.js, editor/ButtonDeviceParts
 * .svelte) as layers: each part a path layer, its shape over its pattern's cells, with its fill,
 * gradient, finish and border; the legend and the caption as text. Pressed or on, a part moves and
 * turns as it says (bindings on the channel, 0 or 1) and takes its lit colour, opacity and legend
 * (`onPatches`, for the state the caller makes). `caption` is the control's text.
 */
export function buttonDeviceLayers({ resolved, styled = resolved, rect, channel, prefix, zIndex, uniqueName, caption = '', captionText = null }) {
  const geometry = resolved?._children?.Parts?._children ?? {};
  const colours = styled?._children?.Parts?._children ?? geometry;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const origin = { x: rect.x, y: rect.y };
  const source = `channel.${channel}.normalized`;
  const font = resolved?._children?.Text?._children?.Font ?? {};
  const spacing = Math.max(0, num(font.letterSpacing, 0));
  const frame = deviceFrameIn(width, height, caption, spacing);
  const S = frame.scale;
  const at = (fx, fy) => ({ x: frame.x + fx * S, y: frame.y + fy * S });
  const out = { parts: [], bindings: {}, partNames: {}, onPatches: {} };
  let depth = zIndex;
  const add = (devicePart, part) => {
    out.parts.push(part);
    if (devicePart) out.partNames[devicePart] = [...(out.partNames[devicePart] ?? []), part.name];
    depth += 1;
    return part;
  };
  const named = (suffix) => uniqueName(`${prefix}_${suffix}`);
  const W = DEVICE_FRAME.width;
  const H = DEVICE_FRAME.height;
  const boxOf = (part) => {
    const layout = part?._children?.Layout ?? {};
    return { x: (num(layout.x, 0) / 100) * W, y: (num(layout.y, 0) / 100) * H, w: Math.max(0, (num(layout.width, 0) / 100) * W), h: Math.max(0, (num(layout.height, 0) / 100) * H) };
  };
  const motion = (part) => ({
    dx: (num(part?.travelX, 0) / 100) * W * S,
    dy: (num(part?.travelY, 0) / 100) * H * S,
    turn: num(part?._children?.Layout?.rotation, 0),
    swing: num(part?.swing, 0),
  });
  const keyMotion = motion(geometry.key);
  const drawn = BUTTON_DEVICE_PARTS
    .filter((name) => geometry[name]?.visible === true)
    .sort((a, b) => num(geometry[a].zIndex, 0) - num(geometry[b].zIndex, 0));
  for (const name of drawn) {
    const part = geometry[name];
    const styledPart = colours[name] ?? part;
    const box = boxOf(part);
    if (!(box.w > 0 && box.h > 0)) continue;
    // A device part keeps a few settings of each; the layer's background renderer wants them all.
    const background = deepClone(styledPart?._children?.Background ?? SECTION_DEFAULTS.Background);
    background._children ??= {};
    for (const key of ['Fill', 'Border', 'Corners']) {
      background._children[key] = { ...deepClone(SECTION_DEFAULTS.Background._children[key]), ...(background._children[key] ?? {}) };
    }
    const fill = background._children.Fill;
    const own = motion(part);
    // A part that rides the key moves as the key does, then as itself; where the key turns, the part
    // (which then does not turn itself: refused) turns with it, about the key's pivot.
    const rides = String(part.follows ?? '') === 'key' && name !== 'key' ? keyMotion : { dx: 0, dy: 0, turn: 0, swing: 0 };
    const opacity = num(part.opacity, 1);
    const keyBox = boxOf(geometry.key);
    const turnsWithKey = Boolean(rides.turn || rides.swing);
    const pivot = turnsWithKey
      ? at(keyBox.x + (num(geometry.key?.pivotX, 50) / 100) * keyBox.w, keyBox.y + (num(geometry.key?.pivotY, 50) / 100) * keyBox.h)
      : at(box.x + (num(part.pivotX, 50) / 100) * box.w, box.y + (num(part.pivotY, 50) / 100) * box.h);
    if (turnsWithKey) {
      own.turn = rides.turn;
      own.swing = rides.swing;
    }
    let layer;
    let extra = null;
    if (name === 'legend') {
      const size = num(part.fontSize, 11) * S;
      const text = deepClone(SECTION_DEFAULTS.Text);
      text.content = String(part.offText ?? '');
      text._children.Fill.colour = fill.colour ?? 'FFFFFFFF';
      text._children.Font.size = r3(size);
      text._children.Font.weightValue = 400;
      text._children.Font.weight = 'Regular';
      if (font.family) text._children.Font.family = font.family;
      text._children.Position.justification = 'centred';
      const centre = at(box.x + box.w / 2, box.y + box.h / 2);
      const textBox = { x: centre.x - width, y: centre.y - size, width: width * 2, height: size * 2 };
      layer = createPartNode(named('legend'), { role: 'label', kind: 'rectangle', zIndex: depth, opacity, layout: { ...pxBox(textBox, origin), ...pivotIn(textBox, pivot), rotation: own.turn }, sections: { Text: text } });
      const on = {};
      if (part.onText !== undefined && String(part.onText) !== String(part.offText ?? '')) on['Text.content'] = String(part.onText ?? '');
      if (String(part.activeColour ?? '').trim()) on['Text.Fill.colour'] = styledPart.activeColour ?? part.activeColour;
      if (part.activeOpacity != null) on.opacity = num(part.activeOpacity, 1);
      if (Object.keys(on).length) out.onPatches[layer.name] = on;
    } else {
      const radius = num(part?._children?.Background?._children?.Corners?.radius, 0);
      const d = devicePatternCells(String(part.pattern ?? 'solid'), 0, 0, box.w, box.h, { count: part.patternCount, rows: part.patternRows, cellWidth: part.cellWidth, cellHeight: part.cellHeight })
        .map((cell) => deviceShapePath(part.shape, cell.x, cell.y, cell.w, cell.h, { depth: part.shapeDepth, radius }))
        .filter(Boolean)
        .join(' ');
      if (!d) continue;
      const border = part?._children?.Background?._children?.Border ?? {};
      const bw = border.enabled === true && num(border.thickness, 0) > 0 ? num(border.thickness, 0) * S : 0;
      background._children.Border = { ...(background._children.Border ?? {}), enabled: bw > 0, thickness: r3(bw) };
      if (background._children.Corners) background._children.Corners.radius = 0;
      const topLeft = at(box.x, box.y);
      const pathLayerOf = (layerName, layerBackground, grow, closed) => {
        const boxed = { x: topLeft.x - grow / 2, y: topLeft.y - grow / 2, width: box.w * S + grow, height: box.h * S + grow };
        return createPartNode(layerName, {
          role: name, kind: 'path', zIndex: depth, opacity,
          layout: { ...pxBox(boxed, origin), ...pivotIn(boxed, pivot), rotation: own.turn },
          meta: { pathData: scalePathData(d, 1 / box.w, 1 / box.h), closed },
          sections: { Background: layerBackground },
        });
      };
      // The panel strokes a part's border over its fill: a line along the outline, half outside it,
      // round at the corners. A path layer that is not closed is drawn as just that stroke, so a part
      // with a border is two layers, its fill and its edge.
      const fillOnly = deepClone(background);
      fillOnly._children.Border.enabled = false;
      fillOnly._children.Border.thickness = 0;
      layer = pathLayerOf(named(name), bw > 0 ? fillOnly : background, 0, true);
      if (bw > 0) extra = pathLayerOf(named(`${name}Edge`), edgeBackground(background, bw), bw, false);
      const on = {};
      if (String(part.activeColour ?? '').trim()) on['Background.Fill.colour'] = styledPart.activeColour ?? part.activeColour;
      if (part.activeOpacity != null) on.opacity = num(part.activeOpacity, 1);
      if (Object.keys(on).length) out.onPatches[layer.name] = on;
      if (extra && part.activeOpacity != null) out.onPatches[extra.name] = { opacity: num(part.activeOpacity, 1) };
    }
    for (const each of [layer, extra].filter(Boolean)) {
      add(name, each);
      const dx = own.dx + rides.dx;
      const dy = own.dy + rides.dy;
      if (dx) out.bindings[`${each.name}MoveX`] = rangeBinding(`${each.name}MoveX`, source, `Parts.${each.name}.Layout.offsetX`, 0, dx);
      if (dy) out.bindings[`${each.name}MoveY`] = rangeBinding(`${each.name}MoveY`, source, `Parts.${each.name}.Layout.offsetY`, 0, dy);
      if (own.swing) out.bindings[`${each.name}Swing`] = rangeBinding(`${each.name}Swing`, source, `Parts.${each.name}.Layout.rotation`, own.turn, own.turn + own.swing);
    }
  }

  // The caption: under the device in the frame, or where the box's own layout puts it.
  const words = String(captionText ?? caption ?? '').trim();
  const captionColour = resolved?._children?.Text?._children?.Fill?.colour;
  if (words) {
    const text = deepClone(styled?._children?.Text ?? resolved?._children?.Text ?? SECTION_DEFAULTS.Text);
    text.content = words;
    text._children ??= {};
    text._children.Fill = { ...(text._children.Fill ?? {}), colour: text._children.Fill?.colour ?? captionColour ?? 'FF20282C' };
    text._children.Font = { ...(text._children.Font ?? {}) };
    text._children.Position = { ...(text._children.Position ?? {}), justification: 'centred', offsetX: 0, offsetY: 0 };
    let box;
    if (frame.inFrame) {
      const size = 11 * S;
      text._children.Font.size = r3(size);
      // The frame's caption sets no weight of its own: the page's, a regular one.
      text._children.Font.weightValue = 400;
      text._children.Font.weight = 'Regular';
      text._children.Font.letterSpacing = 0;
      const base = at(80, 96);
      // A baseline at y, centred: the glyphs' middle sits about a third of the size above it.
      box = { x: base.x - width, y: base.y - size * 0.36 - size, width: width * 2, height: size * 2 };
    } else if (frame.caption) {
      const size = frame.caption.size;
      text._children.Font.size = r3(size);
      const weight = num(font.weightValue, /bold/i.test(String(font.weight ?? '')) ? 700 : 400);
      text._children.Font.weightValue = weight;
      text._children.Font.weight = weight >= 600 ? 'Bold' : 'Regular';
      text.content = frame.caption.text;
      const middle = frame.caption.y - size * 0.36;
      if (frame.caption.anchor === 'start') {
        text._children.Position.justification = 'left';
        box = { x: frame.caption.x - 8, y: middle - size, width: Math.max(1, width - frame.caption.x + 16), height: size * 2 };
      } else {
        box = { x: frame.caption.x - width, y: middle - size, width: width * 2, height: size * 2 };
      }
    }
    if (box) add('caption', createPartNode(named('caption'), { role: 'label', kind: 'rectangle', zIndex: depth, opacity: 1, layout: pxBox(box, origin), sections: { Text: text } }));
  }
  return out;
}

// --- meters drawn as a device ------------------------------------------------------------------------

/** Why a meter drawn with device parts cannot become layers, or ''. */
export function meterDeviceLayersRefusal(resolved) {
  const meter = resolved?._children?.Meter ?? {};
  if (String(meter.scale ?? 'linear') === 'db') return 'a decibel scale, which a layer does not follow yet';
  if (String(meter.valueSourceId ?? '').trim()) return 'its value taken from another control';
  const parts = resolved?._children?.Parts?._children ?? {};
  for (const name of METER_DEVICE_PARTS) {
    const part = parts[name];
    if (part?.visible !== true) continue;
    if (String(part.look ?? '') === 'rendered') return `a rendered ${name}, which a layer does not draw yet`;
    const motion = String(part.motion ?? 'none');
    const pattern = String(part.pattern ?? 'solid');
    if (pattern === 'digits') return `counter digits on its ${name}, which a layer does not draw yet`;
    if (Number(part.shadowOffset) > 0 || Number(part.shadowBlur) > 0) return `a shadow under its ${name}, which a layer does not draw yet`;
    if (String(part.zoneColours ?? 'off') !== 'off') return `its ${name} coloured by the meter's zones, which a layer does not do yet`;
    if (String(part.source ?? 'reading') === 'peak' || motion === 'clip') return `its ${name} follows the held peak, which a layer does not keep`;
    if (name === 'legend' && String(part.textSource ?? 'fixed') !== 'fixed') return 'a legend that shows the reading';
    if (motion === 'fill' && (pattern !== 'solid' || String(part.shape ?? 'rect') !== 'rect')) return `a ${name} that fills in a pattern or shape, which a layer does not draw yet`;
  }
  return '';
}

/**
 * A meter drawn with device parts (models/meterDeviceParts.js, utils/meterParts.js) as layers, placed
 * as ControlAnatomy fits the 160 by 100 frame in the box: each part a path layer in its own box,
 * swinging (a needle) or sliding (a pointer, a marker) with the reading, a fill growing from its edge,
 * lit cells each lit from its own level, a scale's marks and numerals, a fixed legend, and the readout.
 */
export function meterDeviceLayers({ resolved, styled = resolved, rect, channel, prefix, zIndex, uniqueName }) {
  const geometry = resolved?._children?.Parts?._children ?? {};
  const colours = styled?._children?.Parts?._children ?? geometry;
  const meter = resolved?._children?.Meter ?? {};
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const origin = { x: rect.x, y: rect.y };
  const source = `channel.${channel}.normalized`;
  const W = METER_FRAME.width;
  const H = METER_FRAME.height;
  const S = Math.min(width / W, height / H);
  const ox = (width - W * S) / 2;
  const oy = (height - H * S) / 2;
  const at = (fx, fy) => ({ x: ox + fx * S, y: oy + fy * S });
  const out = { parts: [], bindings: {}, partNames: {} };
  let depth = zIndex;
  const add = (meterPart, part) => {
    out.parts.push(part);
    if (meterPart) out.partNames[meterPart] = [...(out.partNames[meterPart] ?? []), part.name];
    depth += 1;
    return part;
  };
  const named = (suffix) => uniqueName(`${prefix}_${suffix}`);
  const font = resolved?._children?.Text?._children?.Font ?? {};
  // A path in the frame's units as layers over `box` (frame units): its fill, and where it has a
  // border, its edge, stroked as the panel strokes it (buttonDeviceLayers says why two).
  const pathLayers = (name, d, box, background, { opacity, bw = 0, pivot = null, rotation = 0 } = {}) => {
    const topLeft = at(box.x, box.y);
    const pathData = scalePathData(translatePathData(d, -box.x, -box.y), 1 / box.w, 1 / box.h);
    const layerOf = (layerName, layerBackground, grow, closed) => {
      const pxBoxed = { x: topLeft.x - grow / 2, y: topLeft.y - grow / 2, width: box.w * S + grow, height: box.h * S + grow };
      return createPartNode(named(layerName), {
        role: 'custom', kind: 'path', zIndex: depth, opacity,
        layout: { ...pxBox(pxBoxed, origin), ...(pivot ? pivotIn(pxBoxed, at(pivot.x, pivot.y)) : {}), rotation },
        meta: { pathData, closed },
        sections: { Background: layerBackground },
      });
    };
    if (!(bw > 0)) return [layerOf(name, background, 0, true)];
    const fillOnly = deepClone(background);
    fillOnly._children.Border.enabled = false;
    fillOnly._children.Border.thickness = 0;
    return [layerOf(name, fillOnly, 0, true), layerOf(`${name}Edge`, edgeBackground(background, bw), bw, false)];
  };
  const backgroundOf = (styledPart, part, colour = null) => {
    const background = deepClone(styledPart?._children?.Background ?? SECTION_DEFAULTS.Background);
    background._children ??= {};
    for (const key of ['Fill', 'Border', 'Corners']) {
      background._children[key] = { ...deepClone(SECTION_DEFAULTS.Background._children[key]), ...(background._children[key] ?? {}) };
    }
    if (colour) {
      background._children.Fill.colour = colour;
      background._children.Fill.solidEnabled = true;
      background._children.Fill.gradientEnabled = false;
    }
    const border = part?._children?.Background?._children?.Border ?? {};
    const bw = border.enabled === true && num(border.thickness, 0) > 0 ? num(border.thickness, 0) * S : 0;
    background._children.Border.enabled = bw > 0;
    background._children.Border.thickness = r3(bw);
    background._children.Corners.radius = 0;
    return { background, bw };
  };
  const textLayer = (name, words, x, y, size, colour, { anchor = 'middle', baseline = 'alphabetic', family = '', opacity = 1 } = {}) => {
    const text = deepClone(SECTION_DEFAULTS.Text);
    text.content = words;
    text._children.Fill.colour = colour ?? 'FFFFFFFF';
    text._children.Font.size = r3(size);
    text._children.Font.weightValue = 400;
    text._children.Font.weight = 'Regular';
    if (family || font.family) text._children.Font.family = family || font.family;
    text._children.Position.justification = anchor === 'start' ? 'left' : (anchor === 'end' ? 'right' : 'centred');
    // A baseline at y: the glyphs' middle about a third of the size above it; `central` is the middle.
    const middle = baseline === 'central' ? y : y - size * 0.36;
    const span = Math.max(size * 6, width);
    const box = anchor === 'start' ? { x: x - 8, y: middle - size, width: span, height: size * 2 }
      : anchor === 'end' ? { x: x - span + 8, y: middle - size, width: span, height: size * 2 }
        : { x: x - span / 2, y: middle - size, width: span, height: size * 2 };
    return createPartNode(named(name), { role: 'label', kind: 'rectangle', zIndex: depth, opacity, layout: pxBox(box, origin), sections: { Text: text } });
  };

  const drawn = METER_DEVICE_PARTS
    .filter((name) => geometry[name]?.visible === true)
    .sort((a, b) => num(geometry[a].zIndex, 0) - num(geometry[b].zIndex, 0));
  for (const name of drawn) {
    const part = geometry[name];
    const styledPart = colours[name] ?? part;
    const motion = String(part.motion ?? 'none');
    const opacity = num(part.opacity, 1);
    const fill = styledPart?._children?.Background?._children?.Fill ?? {};
    const textColour = fill.colour ?? 'FFFFFFFF';
    const rest = meterPartDrawing(name, part, { p: 0, meter });
    const box = rest.box;
    if (!(box.w > 0 && box.h > 0)) continue;
    const pivot = { x: box.x + (num(part.pivotX, 50) / 100) * box.w, y: box.y + (num(part.pivotY, 50) / 100) * box.h };
    const restTurn = num(part?._children?.Layout?.rotation, 0);
    if (name === 'legend') {
      for (const [i, t] of rest.texts.entries()) {
        const point = at(t.x, t.y);
        add(name, textLayer(`legend${i || ''}`, t.text, point.x, point.y, t.size * S, textColour, { family: String(part.fontFamily ?? '').trim(), opacity }));
      }
      continue;
    }
    if (motion === 'light') {
      // Each cell: its plain look until the reading reaches it, then lit (moved by the lit offset).
      const parts = part?._children?.Background?._children ?? {};
      const litColour = String(styledPart.activeColour ?? part.activeColour ?? '').trim() || fill.colour;
      const litOpacity = part.activeOpacity != null ? num(part.activeOpacity, 1) : opacity;
      const offset = meterLitOffset(part);
      const bottom = String(part.lightFrom ?? 'left') === 'bottom';
      const cells = devicePatternCells(String(part.pattern ?? 'solid'), box.x, box.y, box.w, box.h, {
        count: part.patternCount, rows: part.patternRows, cellWidth: part.cellWidth, cellHeight: part.cellHeight,
      });
      const radius = num(parts.Corners?.radius, 0);
      cells.forEach((cell, i) => {
        const index = bottom ? cell.rows - 1 - cell.row : cell.col;
        const count = bottom ? cell.rows : cell.cols;
        const t = index / count;
        const d = deviceShapePath(part.shape, cell.x, cell.y, cell.w, cell.h, { depth: part.shapeDepth, radius });
        if (!d) return;
        const cellBox = { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
        const base = backgroundOf(styledPart, part);
        const lit = backgroundOf(styledPart, part, litColour);
        // Lit, the cell stands where the part's lit offset moves it.
        const litBox = { ...cellBox, x: cellBox.x + offset.x, y: cellBox.y + offset.y };
        const litD = deviceShapePath(part.shape, litBox.x, litBox.y, litBox.w, litBox.h, { depth: part.shapeDepth, radius });
        // A cell is lit when its level (its index over the count) is at or under the reading.
        for (const plain of pathLayers(`${name}${i}`, d, cellBox, base.background, { opacity, bw: base.bw })) {
          add(name, plain);
          out.bindings[`${plain.name}Dim`] = rangeBinding(`${plain.name}Dim`, source, `Parts.${plain.name}.opacity`, opacity, 0, t - 0.0005, t);
        }
        for (const lighted of pathLayers(`${name}${i}lit`, litD, litBox, lit.background, { opacity: 0, bw: lit.bw })) {
          add(name, lighted);
          out.bindings[`${lighted.name}Lit`] = rangeBinding(`${lighted.name}Lit`, source, `Parts.${lighted.name}.opacity`, 0, litOpacity, t - 0.0005, t);
        }
      });
      continue;
    }
    if (motion === 'fill') {
      // A rectangle growing from its edge; its corners keep their radius as it grows.
      const { background, bw } = backgroundOf(styledPart, part);
      background._children.Corners.radius = r3(num(part?._children?.Background?._children?.Corners?.radius, 0) * S);
      const topLeft = at(box.x, box.y);
      const full = { x: topLeft.x - bw / 2, y: topLeft.y - bw / 2, width: box.w * S + bw, height: box.h * S + bw };
      const from = String(part.fillFrom ?? 'left');
      const layer = add(name, createPartNode(named(name), {
        role: 'fill', kind: 'roundedRectangle', zIndex: depth, opacity, layout: pxBox(full, origin), sections: { Background: background },
      }));
      const lengthKey = from === 'left' || from === 'right' ? 'width' : 'height';
      out.bindings[`${layer.name}Grow`] = rangeBinding(`${layer.name}Grow`, source, `Parts.${layer.name}.Layout.${lengthKey}`, 0, full[lengthKey]);
      if (from === 'right' || from === 'bottom') {
        const posKey = from === 'right' ? 'x' : 'y';
        out.bindings[`${layer.name}Edge`] = rangeBinding(`${layer.name}Edge`, source, `Parts.${layer.name}.Layout.${posKey}`, layer._children.Layout[posKey] + full[lengthKey], layer._children.Layout[posKey]);
      }
      continue;
    }
    // A part that stands, swings or slides: its marks or its shape, and a scale's numerals.
    const d = rest.paths.map((path) => path.d).filter(Boolean).join(' ');
    if (d) {
      const { background, bw } = backgroundOf(styledPart, part);
      for (const layer of pathLayers(name, d, box, background, { opacity, bw, pivot, rotation: restTurn })) {
        add(name, layer);
        if (motion === 'swing' && num(part.swing, 0)) {
          out.bindings[`${layer.name}Swing`] = rangeBinding(`${layer.name}Swing`, source, `Parts.${layer.name}.Layout.rotation`, restTurn, restTurn + num(part.swing, 0));
        }
        if (motion === 'slide') {
          const dx = (num(part.travelX, 0) / 100) * W * S;
          const dy = (num(part.travelY, 0) / 100) * H * S;
          if (dx) out.bindings[`${layer.name}SlideX`] = rangeBinding(`${layer.name}SlideX`, source, `Parts.${layer.name}.Layout.offsetX`, 0, dx);
          if (dy) out.bindings[`${layer.name}SlideY`] = rangeBinding(`${layer.name}SlideY`, source, `Parts.${layer.name}.Layout.offsetY`, 0, dy);
        }
      }
    }
    for (const [i, label] of rest.labels.entries()) {
      const point = at(label.x, label.y);
      add(name, textLayer(`${name}Numeral${i}`, label.text, point.x, point.y, label.size * S, textColour, {
        anchor: label.anchor ?? 'middle', baseline: 'central', family: String(part.fontFamily ?? '').trim(), opacity,
      }));
    }
  }

  // The readout under the frame, as the meter prints its value.
  const core = resolved?._children?.Core ?? {};
  if (core.formShowValue !== false) {
    const point = at(80, 98);
    const colour = resolved?._children?.Text?._children?.Fill?.colour ?? 'FF20282C';
    const layer = add('readout', textLayer('readout', '', point.x, point.y, 10 * S, styled?._children?.Text?._children?.Fill?.colour ?? colour));
    out.bindings[`${layer.name}Text`] = { _type: 'Binding', name: `${layer.name}Text`, enabled: true, source: `channel.${channel}.display`, mapMode: 'direct', target: `Parts.${layer.name}.Text.content` };
  }
  return out;
}

/** Path data moved by (dx, dy): absolute coordinates shifted, relative ones as they are. */
function translatePathData(d, dx, dy) {
  const tokens = String(d ?? '').match(/[a-df-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const counts = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  const out = [];
  let command = '';
  let i = 0;
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) { command = tokens[i]; out.push(command); i += 1; if (command.toLowerCase() === 'z') continue; }
    const lower = command.toLowerCase();
    const n = counts[lower];
    if (!n) { i += 1; continue; }
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n) break;
    i += n;
    if (command === lower) { out.push(...args.map(r3)); continue; }
    if (lower === 'h') out.push(r3(args[0] + dx));
    else if (lower === 'v') out.push(r3(args[0] + dy));
    else if (lower === 'a') out.push(...args.slice(0, 5).map(r3), r3(args[5] + dx), r3(args[6] + dy));
    else out.push(...args.map((value, k) => r3(value + (k % 2 === 0 ? dx : dy))));
    if (lower === 'm') command = command === 'M' ? 'L' : 'l';
  }
  return out.join(' ');
}

/** A background that draws only its border: the edge layer of a part stroked over its fill. */
function edgeBackground(background, bw) {
  const edge = deepClone(background);
  Object.assign(edge._children.Fill, { solidEnabled: false, gradientEnabled: false, imageEnabled: false, overlayEnabled: false });
  edge._children.Border = { ...edge._children.Border, enabled: true, thickness: r3(bw) };
  delete edge._children.Effects;
  return edge;
}

// --- plain meters ----------------------------------------------------------------------------------

/** Why a plain meter (editor/MeterRenderer.svelte: a bar, segments or an arc) cannot become layers, or ''. */
export function plainMeterLayersRefusal(resolved) {
  const cfg = resolved?._children?.Meter ?? {};
  if (String(cfg.scale ?? 'linear') === 'db') return 'a decibel scale, which a layer does not follow yet';
  if (String(cfg.valueSourceId ?? '').trim()) return 'its value taken from another control';
  if (cfg.peakHold === true) return 'peak hold, which a layer does not keep';
  // A bar's fill shows up to the reading under a cover in the track's colour, which only hides the
  // fill if nothing shows through it. Segments and an arc draw their fill over the track instead.
  const track = String(cfg.trackColour ?? 'FF141414');
  const bar = String(cfg.orientation ?? 'horizontal') !== 'arc' && Math.round(num(cfg.segments, 0)) <= 0;
  if (bar && /^[0-9a-f]{8}$/i.test(track) && track.slice(0, 2).toUpperCase() !== 'FF') return 'a track you can see through';
  return '';
}

/** An AARRGGBB colour as the RRGGBB a text layer draws and the opacity it needs for the alpha. */
function textColourOf(raw, fallback = 'E6DCDCDC') {
  const hex = /^[0-9a-f]{8}$/i.test(String(raw ?? '')) ? String(raw) : (/^[0-9a-f]{6}$/i.test(String(raw ?? '')) ? `FF${raw}` : fallback);
  return { colour: `FF${hex.slice(2).toUpperCase()}`, alpha: parseInt(hex.slice(0, 2), 16) / 255 };
}

/**
 * A plain meter as layers, as MeterRenderer lays it out: padding 4 round a column of its label (above
 * or below, as tall as one line of its text) and its body, 3 apart. In the body, for a bar, the
 * track, the zones' gradient over the whole track, and over that, from the reading to the end, a
 * cover in the track's colour, so the gradient shows up to the reading and stays where the panel
 * draws it; for segments, each segment plain until the reading reaches its middle, then lit in its
 * zone's colour; and the ticks, the scale's labels and the readout. An arc is the meter's SVG fitted
 * to the body: the track, the fill as one arc in the zones' colours whose sweep is the reading (or
 * its segments), the ticks, the labels round it and the readout under it.
 */
export function plainMeterLayers({ resolved, styled = resolved, rect, channel, prefix, zIndex, uniqueName }) {
  const cfg = resolved?._children?.Meter ?? {};
  const styledCfg = styled?._children?.Meter ?? cfg;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const origin = { x: rect.x, y: rect.y };
  const source = `channel.${channel}.normalized`;
  const out = { parts: [], bindings: {}, partNames: {} };
  let depth = zIndex;
  const add = (part) => { out.parts.push(part); depth += 1; return part; };
  const named = (suffix) => uniqueName(`${prefix}_${suffix}`);
  const orientation = String(cfg.orientation ?? 'horizontal');
  const vertical = orientation === 'vertical';
  const arc = orientation === 'arc';
  const thickness = Math.max(0, num(cfg.thickness, 0));
  const radius = num(cfg.rounded, 3);
  const trackColour = styledCfg.trackColour ?? 'FF141414';
  const segments = Math.max(0, Math.round(num(cfg.segments, 0)));
  const zones = meterZones(styledCfg);

  // The meter's text: its Text section's font, its colour (the renderer's pale grey without one).
  const font = resolved?._children?.Text?._children?.Font ?? {};
  const family = String(font.family ?? 'Arial');
  const fontSize = Math.max(7, num(font.size, 11));
  const ink = textColourOf(styled?._children?.Text?._children?.Fill?.colour ?? resolved?._children?.Text?._children?.Fill?.colour);
  const textLayer = (suffix, words, box, size, { justification = 'centred', opacity = 1, shadow = '', outline = false } = {}) => {
    const text = deepClone(SECTION_DEFAULTS.Text);
    text.content = words;
    text._children.Fill.colour = ink.colour;
    text._children.Font.family = family;
    text._children.Font.size = r3(size);
    text._children.Font.weightValue = 400;
    text._children.Font.weight = 'Regular';
    text._children.Position.justification = justification;
    if (shadow) Object.assign(text._children.Effects, { shadowEnabled: true, shadowStyle: 'soft', shadowOffsetX: 0, shadowOffsetY: 1, shadowBlur: 2, shadowColour: shadow });
    if (outline) Object.assign(text._children.Effects, { outlineEnabled: true, outlinePlacement: 'outer', outlineThickness: 1, outlineColour: 'BF000000' });
    return add(createPartNode(named(suffix), {
      role: 'label', kind: 'rectangle', zIndex: depth, opacity: r3(opacity * ink.alpha), layout: pxBox(box, origin), sections: { Text: text },
    }));
  };
  // A text layer's box keeps 8 px clear each side (its text's padding): text centred at (x, y), or
  // starting or ending at x.
  const textAt = (x, y, size, anchor = 'middle') => {
    const span = Math.max(width, size * 8);
    const h = Math.max(size * 2, 4);
    if (anchor === 'start') return { x: x - 8, y: y - h / 2, width: span, height: h };
    if (anchor === 'end') return { x: x + 8 - span, y: y - h / 2, width: span, height: h };
    return { x: x - span / 2, y: y - h / 2, width: span, height: h };
  };

  // Padding 4, the label's line and a gap of 3, and the body the rest.
  const label = String(cfg.label ?? '').trim() && ['above', 'below'].includes(String(cfg.labelPosition ?? 'none')) ? String(cfg.label) : '';
  const labelSize = fontSize * 0.82;
  const labelLine = label ? normalLineHeight(family, labelSize) : 0;
  const above = label && String(cfg.labelPosition) === 'above';
  const body = {
    x: 4,
    y: 4 + (above ? labelLine + 3 : 0),
    width: Math.max(1, width - 8),
    height: Math.max(1, height - 8 - (label ? labelLine + 3 : 0)),
  };

  const solid = (colour, corners = null) => {
    const background = solidBackground(colour);
    if (corners) {
      background._children.Corners.linked = false;
      background._children.Corners.radius = radius;
      for (const [key, r] of Object.entries(corners)) background._children.Corners[key] = { ...(background._children.Corners[key] ?? {}), radius: r };
    } else {
      background._children.Corners.radius = radius;
    }
    return background;
  };
  const rectLayer = (name, box, background, opacity = 1) => add(createPartNode(named(name), {
    role: 'custom', kind: 'roundedRectangle', zIndex: depth, opacity, layout: pxBox(box, origin), sections: { Background: background },
  }));

  const plate = resolved?._children?.Background;
  const fill = plate?._children?.Fill ?? {};
  const border = plate?._children?.Border ?? {};
  if (fill.solidEnabled === true || fill.gradientEnabled === true || fill.imageEnabled === true || border.enabled === true) {
    rectLayer('plate', { x: 0, y: 0, width, height }, deepClone(styled?._children?.Background ?? plate));
  }
  if (label) {
    textLayer('label', label, textAt(4 + (width - 8) / 2, (above ? 4 : height - 4 - labelLine) + labelLine / 2, labelSize), labelSize, { opacity: 0.75 });
  }

  const readoutSize = fontSize * 0.9;
  const readoutLine = normalLineHeight(family, readoutSize);
  const readout = (box) => {
    const layer = textLayer('readout', '', box, readoutSize, { justification: box.justification ?? 'centred', opacity: 0.92, shadow: '99000000' });
    out.bindings[`${layer.name}Text`] = { _type: 'Binding', name: `${layer.name}Text`, enabled: true, source: `channel.${channel}.display`, mapMode: 'direct', target: `Parts.${layer.name}.Text.content` };
  };
  const ticks = cfg.showTicks === true || cfg.showScaleLabels === true ? meterTicks(cfg, cfg.tickCount) : [];

  if (arc) {
    plainArcMeterLayers({ cfg, styledCfg, body, width, height, origin, source, out, named, add, depthOf: () => depth, trackColour, zones, segments, ticks, fontSize, textLayer, textAt });
    if (cfg.showValue === true) {
      readout(textAt(body.x + body.width / 2, body.y + body.height - 6 - readoutLine / 2, readoutSize));
    }
    return out;
  }

  // The track fills the body, or is `thickness` across it, centred.
  const track = thickness > 0
    ? (vertical
      ? { x: body.x + (body.width - Math.min(thickness, body.width)) / 2, y: body.y, width: Math.min(thickness, body.width), height: body.height }
      : { x: body.x, y: body.y + (body.height - Math.min(thickness, body.height)) / 2, width: body.width, height: Math.min(thickness, body.height) })
    : body;
  if (segments > 0) {
    const gap = num(cfg.segmentGap, 2);
    const along = vertical ? track.height : track.width;
    const size = Math.max(0.5, (along - gap * (segments - 1)) / segments);
    for (let idx = 0; idx < segments; idx += 1) {
      const offset = idx * (size + gap);
      const box = vertical
        ? { x: track.x, y: track.y + along - offset - size, width: track.width, height: size }
        : { x: track.x + offset, y: track.y, width: size, height: track.height };
      const plain = rectLayer(`segment${idx}`, box, solid(trackColour));
      const lit = rectLayer(`segment${idx}lit`, box, solid(meterFillColourAt(meterSegmentCenter(idx, segments), styledCfg)), 0);
      // Lit once the reading reaches the segment's middle (meterSegmentsLit rounds).
      const t = (idx + 0.5) / segments;
      out.bindings[`${lit.name}Lit`] = rangeBinding(`${lit.name}Lit`, source, `Parts.${lit.name}.opacity`, 0, 1, t - 0.0005, t);
      out.bindings[`${plain.name}Dim`] = rangeBinding(`${plain.name}Dim`, source, `Parts.${plain.name}.opacity`, 1, 0, t - 0.0005, t);
    }
  } else {
    rectLayer('track', track, solid(trackColour));
    // The zones as a gradient over the whole track (MeterRenderer's gradientCss).
    const stops = [];
    zones.forEach((zone, i) => {
      const at = Math.round(zone.from * 100);
      if (cfg.gradient === false && i > 0) stops.push({ color: zones[i - 1].colour, position: at });
      stops.push({ color: zone.colour, position: at });
    });
    const gradientBackground = solid(zones[0]?.colour ?? 'FF39D98A');
    if (zones.length > 1) {
      gradientBackground._children.Fill.gradientEnabled = true;
      gradientBackground._children.Fill.gradient = { type: 'linear', angle: vertical ? 0 : 90, stops };
    }
    rectLayer('fill', track, gradientBackground);
    // The cover: from the reading to the end of the track, square where the reading is.
    const cover = vertical
      ? rectLayer('cover', track, solid(trackColour, { topLeft: radius, topRight: radius, bottomLeft: 0, bottomRight: 0 }))
      : rectLayer('cover', track, solid(trackColour, { topLeft: 0, bottomLeft: 0, topRight: radius, bottomRight: radius }));
    const name = cover.name;
    if (vertical) {
      out.bindings[`${name}Height`] = rangeBinding(`${name}Height`, source, `Parts.${name}.Layout.height`, track.height, 0);
    } else {
      out.bindings[`${name}Edge`] = rangeBinding(`${name}Edge`, source, `Parts.${name}.Layout.x`, cover._children.Layout.x, cover._children.Layout.x + track.width);
      out.bindings[`${name}Width`] = rangeBinding(`${name}Width`, source, `Parts.${name}.Layout.width`, track.width, 0);
    }
    // At no reading the cover is the whole track, rounded where the track is.
    const near = vertical ? ['bottomLeft', 'bottomRight'] : ['topLeft', 'bottomLeft'];
    for (const corner of near) {
      out.bindings[`${name}${corner}`] = rangeBinding(`${name}${corner}`, source, `Parts.${name}.Background.Corners.${corner}.radius`, radius, 0, 0, 0.0005);
    }
  }
  if (cfg.showTicks === true) {
    for (const [i, tick] of ticks.entries()) {
      const box = vertical
        ? { x: track.x, y: track.y + track.height * (1 - tick.pos), width: track.width, height: 1 }
        : { x: track.x + track.width * tick.pos, y: track.y, width: 1, height: track.height };
      add(createPartNode(named(`tick${i}`), { role: 'custom', kind: 'rectangle', zIndex: depth, opacity: 1, layout: pxBox(box, origin), sections: { Background: solidBackground('2EFFFFFF') } }));
    }
  }
  if (cfg.showScaleLabels === true) {
    // Over the body, 2 px in from its bottom (or its left, upright), each at its tick; the first and
    // last kept inside it.
    const size = fontSize * 0.7;
    ticks.forEach((tick, i) => {
      const first = i === 0;
      const last = i === ticks.length - 1;
      let box;
      if (vertical) {
        const y = body.y + body.height * (1 - tick.pos);
        const middle = first ? y - size / 2 : (last ? body.y + size / 2 : y);
        box = textAt(body.x + 2, middle, size, 'start');
      } else {
        const x = body.x + body.width * tick.pos;
        const middle = body.y + body.height - 2 - size / 2;
        box = first ? textAt(x, middle, size, 'start') : (last ? textAt(x, middle, size, 'end') : textAt(x, middle, size));
        box.justification = first ? 'left' : (last ? 'right' : 'centred');
      }
      textLayer(`scale${i}`, meterTickLabel(tick, cfg), box, size, { justification: box.justification ?? 'left', opacity: 0.78, shadow: 'CC000000' });
    });
  }
  if (cfg.showValue === true) {
    // At the body's right, 5 px in, across its middle; upright, centred 4 px below its top.
    if (vertical) readout(textAt(body.x + body.width / 2, body.y + 4 + readoutLine / 2, readoutSize));
    else readout({ ...textAt(body.x + body.width - 5, body.y + body.height / 2, readoutSize, 'end'), justification: 'right' });
  }
  return out;
}

/**
 * An arc meter's layers: MeterRenderer's SVG, its viewBox the meter's whole box fitted ("meet") into
 * the body, so a point (x, y) of the drawing is at the body's offset plus (x, y) times the fit. The
 * drawing's angles run clockwise from 3 o'clock; a layer's from 12, so 90 more.
 */
function plainArcMeterLayers({ cfg, styledCfg, body, width, height, origin, source, out, named, add, depthOf, trackColour, zones, segments, ticks, fontSize, textLayer, textAt }) {
  const fit = Math.min(body.width / width, body.height / height);
  const ox = body.x + (body.width - width * fit) / 2;
  const oy = body.y + (body.height - height * fit) / 2;
  const min = Math.min(width, height);
  const stroke = Math.min(min / 2, num(cfg.thickness, 0) > 0 ? num(cfg.thickness, 0) : Math.max(6, min * 0.16));
  const r = Math.max(0, min / 2 - stroke / 2 - 2);
  const centre = { x: ox + (width / 2) * fit, y: oy + (height / 2) * fit };
  const startSvg = num(cfg.arcStart, 135);
  const sweepSvg = num(cfg.arcSweep, 270);
  const direction = sweepSvg < 0 ? 'ccw' : 'cw';
  const sweep = Math.min(360, Math.abs(sweepSvg));
  const designer = (pos) => meterArcAngle(pos, startSvg, sweepSvg) + 90;
  const arcOf = (name, from, to, colour, { cap = 'butt', opacity = 1, extra = {} } = {}) => add(arcLayer(named(name), {
    centre, radius: r * fit, thickness: stroke * fit, start: designer(from), sweep: Math.abs(designer(to) - designer(from)), direction,
    colour, opacity, zIndex: depthOf(), origin, role: 'custom', cap, extra,
  }));

  arcOf('track', 0, 1, trackColour, { cap: num(cfg.rounded, 3) > 0 ? 'round' : 'butt' });
  if (segments > 0) {
    const gap = Math.min(0.8 / segments, Math.max(0, num(cfg.segmentGap, 2)) / Math.max(1, r * sweep * Math.PI / 180));
    for (let i = 0; i < segments; i += 1) {
      const from = i / segments + gap / 2;
      const to = (i + 1) / segments - gap / 2;
      const plain = arcOf(`segment${i}`, from, to, trackColour);
      const lit = arcOf(`segment${i}lit`, from, to, meterFillColourAt(meterSegmentCenter(i, segments), styledCfg), { opacity: 0 });
      const t = (i + 0.5) / segments;
      out.bindings[`${lit.name}Lit`] = rangeBinding(`${lit.name}Lit`, source, `Parts.${lit.name}.opacity`, 0, 1, t - 0.0005, t);
      out.bindings[`${plain.name}Dim`] = rangeBinding(`${plain.name}Dim`, source, `Parts.${plain.name}.opacity`, 1, 0, t - 0.0005, t);
    }
  } else {
    // One arc in the zones' colours, fixed to the whole travel; the reading decides how much shows.
    const fillArc = arcOf('fill', 0, 1, zones[0]?.colour ?? 'FF39D98A', {
      extra: { zones: zones.map((zone) => ({ from: r3(zone.from), colour: zone.colour })), zoneSweep: r3(sweep), blend: cfg.gradient !== false },
    });
    out.bindings[`${fillArc.name}Sweep`] = rangeBinding(`${fillArc.name}Sweep`, source, `Parts.${fillArc.name}.meta.arcTrack.sweepAngle`, 0, r3(sweep));
  }
  if (cfg.showTicks === true) {
    for (const [i, tick] of ticks.entries()) {
      add(radialBar(named(`tick${i}`), {
        centre, angle: designer(tick.pos), from: (r - stroke / 2) * fit, to: (r + stroke / 2) * fit, width: fit, round: false,
        colour: '66FFFFFF', opacity: 1, zIndex: depthOf(), origin,
      }));
    }
  }
  if (cfg.showScaleLabels === true) {
    const size = Math.max(7, fontSize * 0.72) * fit;
    const at = Math.max(0, r - stroke / 2 - fontSize) * fit;
    ticks.forEach((tick, i) => {
      const angle = ((designer(tick.pos) - 90) * Math.PI) / 180;
      textLayer(`scale${i}`, meterTickLabel(tick, cfg), textAt(centre.x + at * Math.cos(angle), centre.y + at * Math.sin(angle), size), size, { opacity: 0.78, outline: true });
    });
  }
}

/** A part's outline as drawn at the start of the travel, for a part that turns with the value. */
function withTurnStart(part, startPanel) {
  if (part?.turns !== true) return part;
  return { ...part, outlineRotation: num(part?.outlineRotation, 0) + designerAngle(startPanel) };
}

/** The box a px layout describes, back in the knob's own coordinates. */
function boxOfLayout(layout, origin) {
  return { x: layout.x - origin.x, y: layout.y - origin.y, width: layout.width, height: layout.height };
}

/**
 * A bar along a radius, from `from` to `to` out from the centre at `angle` (the designer's degrees):
 * a rectangle (a tick) or a pill (a round-capped line: the pointer, the centre marker).
 */
function radialBar(name, { centre, angle, from, to, width, round, colour, opacity, zIndex, origin }) {
  const length = Math.abs(to - from) + (round ? width : 0);
  const mid = (from + to) / 2;
  const box = { x: centre.x - width / 2, y: centre.y - mid - length / 2, width, height: length };
  // Drawn upright above the centre and turned about it: the turn carries it round to its angle.
  const layout = { ...pxBox(box, origin), ...pivotIn(box, centre), rotation: r3(angle) };
  return createPartNode(name, {
    role: 'custom', kind: round ? 'capsule' : 'rectangle', zIndex, opacity, layout,
    sections: { Background: solidBackground(colour) },
  });
}

/** A dot `at` out from the centre at `angle`, turned about the centre. */
function tickDot(name, { centre, angle, at, r, colour, opacity, zIndex, origin }) {
  const box = { x: centre.x - r, y: centre.y - at - r, width: 2 * r, height: 2 * r };
  const layout = { ...pxBox(box, origin), ...pivotIn(box, centre), rotation: r3(angle) };
  return createPartNode(name, { role: 'custom', kind: 'circle', zIndex, opacity, layout, sections: { Background: solidBackground(colour) } });
}

/** What a numeral tick prints: the stop's index, or the value there with its trailing zeros dropped. */
function numeralFor(behavior, stop) {
  if (String(behavior?.tickNumerals ?? 'index') !== 'value') return String(stop.index ?? 0);
  const min = getSliderMin(behavior);
  const max = getSliderMax(behavior);
  const text = formatSliderNumericValue(behavior, min + (max - min) * num(stop.normalized, 0));
  return text.replace(/(\.\d*?[1-9])0+(?!\d)|\.0+(?!\d)/g, '$1');
}

/** A value as the min and max labels print it. */
function formatPlain(behavior, value) {
  const scale = sliderDisplayScale(behavior);
  const shown = scale ? scale.displayMin + ((value - scale.min) / (scale.max - scale.min)) * (scale.displayMax - scale.displayMin) : value;
  const step = num(behavior?.step, 0.01);
  const precision = Number.isFinite(Number(behavior?.precision))
    ? Math.max(0, Math.min(6, Math.round(Number(behavior.precision))))
    : (step <= 0 || step >= 1 ? (String(behavior?.valueType ?? '') === 'int' ? 0 : 2) : Math.min(6, (String(step).split('.')[1] ?? '').length));
  const unit = String(behavior?.unit ?? '');
  return `${behavior?.prefix ?? ''}${Number(shown).toFixed(precision)}${behavior?.suffix ?? ''}${unit ? ` ${unit}` : ''}`.trim();
}

/** The format a knob's channel needs for its readout to print as the knob's did. */
export function knobChannelFormat(behavior) {
  const step = num(behavior?.step, 0.01);
  const precision = Number.isFinite(Number(behavior?.precision))
    ? Math.max(0, Math.min(6, Math.round(Number(behavior.precision))))
    : (step <= 0 || step >= 1 ? (String(behavior?.valueType ?? '') === 'int' ? 0 : 2) : Math.min(6, (String(step).split('.')[1] ?? '').length));
  const format = {
    precision,
    prefix: String(behavior?.prefix ?? ''),
    suffix: String(behavior?.suffix ?? ''),
    unit: String(behavior?.unit ?? '').trim(),
  };
  if (Number.isFinite(Number(behavior?.displayMin)) && Number.isFinite(Number(behavior?.displayMax))) {
    format.displayMin = Number(behavior.displayMin);
    format.displayMax = Number(behavior.displayMax);
  }
  return format;
}

/** A knob state's part patch, written to the layers its parts became. Arc layers keep their colour in meta. */
export function layerStatePatches(partsPatch, partNames, layersByName) {
  const out = {};
  for (const [knobPart, patch] of Object.entries(partsPatch ?? {})) {
    for (const layerName of partNames[knobPart] ?? []) {
      const layer = layersByName[layerName];
      const arc = String(layer?.kind ?? '') === 'arcTrack';
      const text = Boolean(layer?._children?.Text);
      for (const [path, value] of Object.entries(patch ?? {})) {
        let target = path;
        if (arc && path === 'Background.Fill.colour') target = 'meta.arcTrack.colour';
        else if (arc && path.startsWith('Background.')) continue;
        if (!text && path.startsWith('Text.')) continue;
        if (text && path.startsWith('Background.')) continue;
        (out[layerName] ??= {})[target] = deepClone(value);
      }
    }
  }
  return out;
}
