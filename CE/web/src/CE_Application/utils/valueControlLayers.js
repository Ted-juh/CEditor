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
  sliderTextRoom,
} from './sliderGeometry.js';
import {
  formatSliderNumericValue, getSliderAllowHandleCross, getSliderAllowWrapAround, getSliderDirection, getSliderGeometry, getSliderMax,
  getSliderMin, getSliderOrientation, getSliderStartAngle, getSliderSweepAngle, getSliderValueMode, sliderDisplayScale,
} from './sliderBehavior.js';
import { knobOutlinePath, knobOutlineReach } from './knobOutlines.js';
import { formatBehaviorDisplay } from './parameterDisplay.js';
import { deepClone } from './deepClone.js';
import { anatomyForm } from '../models/controlAnatomy.js';
import { DRAWN_KNOB_FORMS } from './formDrawingLayers.js';
import { formLayersRefusal } from '../models/formAsParts.js';
import { BUTTON_DEVICE_PARTS, DEVICE_FRAME } from '../models/buttonDeviceParts.js';
import { METER_DEVICE_PARTS, METER_FRAME } from '../models/meterDeviceParts.js';
import { meterLitOffset, meterPartDrawing, meterZoneColour } from './meterParts.js';
import { REVEAL_ALL_MASK_SRC } from './partMask.js';
import { decibelPosition, meterArcAngle, meterFillColourAt, meterSegmentCenter, meterTickLabel, meterTicks, meterZones } from './meterLayout.js';
import { normalLineHeight } from './textLineHeight.js';
import { unpremultipliedStops } from './gradientStops.js';
import { deviceShapeOptions, deviceShapePath, devicePatternCells } from './deviceShapes.js';
import { buttonAnatomyLayout } from './anatomyLayout.js';
import { scalePathData, transformPathData } from './svgPathScale.js';
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
  // A knob in a base form comes in as its drawing (formDrawingLayers.js), which shows one value.
  if (form && core.controlType === 'Knob' && DRAWN_KNOB_FORMS.includes(form)) {
    return getSliderValueMode(behavior) === 'single' ? '' : `two handles drawn in the "${form}" control form, which shows one value`;
  }
  if (form) return formLayersRefusal(core.controlType, form);
  // A range's or a band's handles are values of their own (valueHandles). Handles that may pass each
  // other or wrap round the end are drawn from the end less the start (handleSources); on a slider,
  // each handle's travel is laid out for its own size, so two of different sizes would not differ
  // by that alone.
  if (getSliderValueMode(behavior) !== 'single' && getSliderGeometry(behavior) !== 'circular' && getSliderAllowHandleCross(behavior)) {
    const parts = resolveSliderSemanticParts(resolved?._children?.Parts ?? null)._children;
    const sizeOf = (name) => num(parts?.[name]?._children?.Layout?.width, 18);
    if (Math.abs(sizeOf('pointerStart') - sizeOf('pointerEnd')) > 0.01) return 'handles of two sizes that may pass each other';
  }
  if (getSliderGeometry(behavior) !== 'circular') return sliderLayersRefusal();
  // Plates (housing, skirt, cap, insert) of every outline, in perspective, turning under a light
  // that stays put, with shadows and grooves, and rendered ones, are layers now (plateLayers).
  // A track or value arc in a gradient, a picture or a finish paints it through the arc (an arc
  // layer's `paint: 'background'`), and a dot pointer in one goes round upright (`meta.orbit`).
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

/**
 * A convex polygon's outline moved out by `distance` (in by a negative one), its corners mitred as an
 * SVG stroke's are: each corner where its two moved edges meet. Clockwise or not, out is out.
 */
function offsetPolygon(points, distance) {
  const pts = points.filter((p, i) => {
    const q = points[(i + 1) % points.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-6;
  });
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i += 1) area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1];
  const outward = area > 0 ? 1 : -1;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    // The edge's normal pointing out of the polygon (y down: clockwise on screen is a positive area).
    const nx = (outward * (q[1] - p[1])) / len;
    const ny = (outward * -(q[0] - p[0])) / len;
    return { p: [p[0] + nx * distance, p[1] + ny * distance], d: [q[0] - p[0], q[1] - p[1]] };
  });
  return lines.map((line, i) => {
    const prev = lines[(i - 1 + n) % n];
    const cross = prev.d[0] * line.d[1] - prev.d[1] * line.d[0];
    if (Math.abs(cross) < 1e-9) return line.p;
    const t = ((line.p[0] - prev.p[0]) * line.d[1] - (line.p[1] - prev.p[1]) * line.d[0]) / cross;
    return [prev.p[0] + prev.d[0] * t, prev.p[1] + prev.d[1] * t];
  });
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

/** A fill that is a gradient alone (the panel's sheen and dome over a cap), as a Background. */
function gradientBackground(gradient) {
  const background = solidBackground('00000000');
  const fill = background._children.Fill;
  fill.solidEnabled = false;
  fill.gradientEnabled = true;
  fill.gradientOpacity = 100;
  fill.gradient = { edge: 0, angle: 90, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, ...gradient };
  return background;
}

/** An edge alone, `thickness` wide in `colour`, banded in from the box's edge, as a Background. */
function borderOnlyBackground(colour, thickness, radius = 0) {
  const background = solidBackground('00000000', { borderColour: colour, borderThickness: thickness });
  background._children.Fill.solidEnabled = false;
  background._children.Corners.radius = radius;
  return background;
}

/** A part's own Background without its border (drawn as a layer of its own), its corners `radius`. */
function fillBackground(part, radius = 0) {
  const background = backgroundFrom(part, { borderFallback: 0 });
  background._children.Border.enabled = false;
  background._children.Border.thickness = 0;
  if (background._children.Corners) background._children.Corners.radius = radius;
  return background;
}

/** `layer` softened as an SVG feGaussianBlur of deviation `deviation` is (a CSS blur takes it as is). */
function blurred(layer, deviation) {
  const effects = deepClone(SECTION_DEFAULTS.Effects);
  effects._children.Shadows.items = [];
  effects._children.Filters.blur = r3(deviation);
  layer._children.Effects = effects;
  return layer;
}

// The panel's light over a fader cap (SliderFamilyRenderer's defs): the cylinder sheen across it,
// light along the near edge and shade along the far one, and a dome lit from the top left.
const capSheen = (vertical) => ({
  type: 'linear', angle: vertical ? 90 : 180,
  stops: [{ color: '61FFFFFF', position: 0 }, { color: '00FFFFFF', position: 45 }, { color: '00000000', position: 60 }, { color: '66000000', position: 100 }],
});
const CAP_DOME = {
  type: 'radial', centerX: 35, centerY: 30, radiusX: 70, radiusY: 70,
  stops: [{ color: 'BFFFFFFF', position: 0 }, { color: '00FFFFFF', position: 50 }, { color: '59000000', position: 100 }],
};

/**
 * A filled outline (a circle, a ring, or a scallop, flutes, a polygon) centred on `centre`, radius
 * `r`, as path layers. The panel strokes the border centred on the edge; a closed path layer insets
 * its path by half the border and bands the border inward from its outer edge, so the box is the
 * shape's own grown by half the border and the two draw the same ring. The layer's fill reaches the
 * outer edge too, under the border: right for an opaque border, which covers it, but a border you
 * can see through shows it. Such a part is two layers, its fill and its edge, as the panel draws it.
 */
function outlineLayers(name, part, centre, r, origin, { zIndex, borderFallback, role, borderColourFallback = 'FF333333' }) {
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
  const background = backgroundFrom(part, { borderFallback, borderColourFallback });
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

/** A circle as absolute path data. */
function circlePath(cx, cy, r) {
  return `M${r3(cx - r)} ${r3(cy)} a${r3(r)} ${r3(r)} 0 1 0 ${r3(2 * r)} 0 a${r3(r)} ${r3(r)} 0 1 0 ${r3(-2 * r)} 0 Z`;
}

/** Absolute path data in 0..1 of `box`. */
function pathInBox(d, box) {
  return transformPathData(d, [1 / box.width, 0, 0, 1 / box.height, -box.x / box.width, -box.y / box.height]);
}

/** The turn (the designer's degrees, clockwise) and squash and shift of `d` about (cx, cy), in that order of drawing. */
function plateTransform(d, { cx, cy, aspect = 1, turn = 0, shift = 0 }) {
  const t = (turn * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  // translate(0 shift) · rotate(turn about c) · scale(1 aspect about c), as SliderFamilyRenderer's
  // outlineShapeFor writes it.
  const a = cos;
  const b = sin;
  const c = -sin * aspect;
  const dd = cos * aspect;
  const e = cx - a * cx - c * cy;
  const f = cy - b * cx - dd * cy + shift;
  return transformPathData(d, [a, b, c, dd, e, f]);
}

const RENDER_FIELDS = ['renderProfile', 'renderCount', 'renderDepth', 'renderTaper', 'renderHeight', 'renderTop', 'renderMaterial', 'renderTopMaterial', 'renderTopColour'];

/**
 * A part whose look is 'rendered' (utils/renderedLook.js) as one layer that draws the same image
 * (utils/layerRenderedLook.js): its render properties, its colour as the layer's fill (its plain
 * fill until the image is made, as the panel's part draws its own), and its box, `box` (absolute,
 * placed against `origin`). `shape` 'round' or 'block'; a block's `corner`, `height` and `axis` are
 * what the panel's spec takes for it, written out so the layer's spec is the same. `turn`, for a body
 * that turns with the value under a light that stays put, is its turn at the start of the travel
 * (the panel's degrees plus 90): the layer's rotation adds to it. `part` gives the properties with
 * colour roles kept, `geometry` the part as drawn.
 */
function renderedLayer(name, part, geometry, box, origin, { shape, corner = 30, height = 30, axis = null, colour, zIndex, opacity = 1, role = 'custom', turn = null }) {
  const background = solidBackground(colour);
  if (shape === 'block') background._children.Corners.radius = r3((Math.min(box.width, box.height) / 2) * (Math.min(100, Math.max(0, corner)) / 100));
  const layer = createPartNode(name, {
    role, kind: shape === 'round' ? 'circle' : 'rectangle', zIndex, opacity,
    layout: pxBox(box, origin), meta: turn === null ? {} : { fixedLight: true, renderTurn: r3(turn) },
    sections: { Background: background },
  });
  layer.look = 'rendered';
  layer.renderShape = shape;
  for (const key of RENDER_FIELDS) {
    const value = part?.[key] ?? geometry?.[key];
    if (value !== undefined && value !== null && value !== '') layer[key] = deepClone(value);
  }
  if (shape === 'block') {
    layer.renderCorner = r3(num(geometry?.renderCorner ?? part?.renderCorner, corner));
    layer.renderHeight = r3(num(geometry?.renderHeight ?? part?.renderHeight, height));
    layer.renderAxis = axis ?? (box.width >= box.height ? 'x' : 'y');
  }
  return layer;
}

/**
 * A knob's plate (housing, skirt, cap, insert) as the panel draws it (SliderFamilyRenderer's
 * bodyPlate), as layers:
 *
 *   shadow   its outline again, lower and softened, in the shadow's colour: a layer of its own under
 *            it, so it shows through a plate you can see through, as it does on the panel;
 *   plate    its outline (a circle, a ring, a gear, a scallop, flutes, a polygon, a chicken-head),
 *            seen in perspective when it has an `aspect` or a `shiftY` (squashed, then moved), its
 *            fill and border; one that `turns` turns its outline with the value while its light
 *            stays put (meta.fixedLight), as a gear turns under the set's lamp;
 *   grooves  fine lines in from its edge, turning with it.
 *
 * Its box is the panel's fill box (the circle's or the oval's bounds and a pixel), so a gradient runs
 * across it as the panel's does.
 */
function plateLayers(named, part, geometry, r, ctx) {
  const { centre, origin, trackRadius, startPanel, signed, sweep, source, borderFallback, role, knobPart, add, out, depthOf } = ctx;
  if (!(r > 0)) return;
  const kind = String(geometry?.outline ?? 'circle');
  const aspect = Math.max(5, Math.min(400, num(geometry?.aspect, 100))) / 100;
  const shift = (trackRadius * num(geometry?.shiftY, 0)) / 100;
  const turns = geometry?.turns === true;
  const perspective = aspect !== 1 || shift !== 0;
  const op = num(geometry?.opacity, 1);
  const cx = centre.x;
  const cy = centre.y;
  const pivot = { x: cx, y: cy + shift };
  const rest = turns ? designerAngle(startPanel) : 0;
  if (String(geometry?.look ?? '') === 'rendered') {
    // Rendered, the panel draws its image alone, centred where the plate is (moved by its shift, not
    // squashed): no shadow, border or grooves of its own.
    const layer = renderedLayer(named(''), part, geometry, { x: cx - r, y: cy + shift - r, width: 2 * r, height: 2 * r }, origin, {
      shape: 'round', colour: part?._children?.Background?._children?.Fill?.colour ?? geometry?._children?.Background?._children?.Fill?.colour,
      zIndex: depthOf(), opacity: op, role, turn: turns ? rest : null,
    });
    add(knobPart, layer);
    if (turns) out.bindings[`${layer.name}Turn`] = rangeBinding(`${layer.name}Turn`, source, `Parts.${layer.name}.Layout.rotation`, 0, signed * sweep);
    return;
  }
  const options = { count: geometry?.outlineCount, depth: geometry?.outlineDepth, rotation: num(geometry?.outlineRotation, 0) };
  const unturned = (radius) => (kind === 'circle' ? circlePath(cx, cy, radius) : knobOutlinePath(kind, cx, cy, radius, options));
  const placed = (radius, dy = 0) => plateTransform(unturned(radius), { cx, cy, aspect, turn: rest, shift: shift + dy });
  const bw = borderWidth(part, borderFallback);
  // The panel's fill box, grown where the border's outer half would leave it.
  const grown = r + bw / 2;
  const boxFor = (dy = 0) => {
    if (turns) {
      const half = Math.max(r * Math.max(1, aspect) + 1, grown * Math.max(1, aspect));
      return { x: cx - half, y: cy + shift + dy - half, width: 2 * half, height: 2 * half };
    }
    const hw = Math.max(r + 1, grown);
    const hh = perspective ? Math.max(r * aspect + 1, grown * aspect) : hw;
    return { x: cx - hw, y: cy + shift + dy - hh, width: 2 * hw, height: 2 * hh };
  };
  const turnBinding = (layer) => {
    if (!turns) return;
    // Drawn as it stands at the start of the travel; the binding turns it from there.
    out.bindings[`${layer.name}Turn`] = rangeBinding(`${layer.name}Turn`, source, `Parts.${layer.name}.Layout.rotation`, 0, signed * sweep);
  };
  const pathLayer = (name, d, box, background, { pivotPoint = pivot, extraMeta = {}, sections = {} } = {}) => createPartNode(name, {
    role, kind: 'path', zIndex: depthOf(), opacity: op,
    layout: { ...pxBox(box, origin), ...pivotIn(box, pivotPoint) },
    meta: { pathData: pathInBox(d, box), closed: true, ...(turns ? { fixedLight: true } : {}), ...extraMeta },
    sections: { Background: background, ...sections },
  });

  // Its shadow: `shadowOffset` % of its radius lower, softened by `shadowBlur` % (the panel's
  // feGaussianBlur takes half of that as its deviation, as a layer's blur does).
  const offset = num(geometry?.shadowOffset, 0);
  const softness = Math.max(0, num(geometry?.shadowBlur, 0));
  if (offset > 0 || softness > 0) {
    const dy = (r * offset) / 100;
    const effects = deepClone(SECTION_DEFAULTS.Effects);
    effects._children.Shadows.items = [];
    effects._children.Filters.blur = r3((r * softness) / 200);
    const shadow = pathLayer(named('Shadow'), placed(r, dy), boxFor(dy), solidBackground(String(part?.shadowColour ?? geometry?.shadowColour ?? '') || '99000000'), {
      pivotPoint: { x: cx, y: cy + shift + dy }, sections: { Effects: effects },
    });
    add(knobPart, shadow);
    turnBinding(shadow);
  }

  // The plate. A border you can see through, or one over a lit finish, is a layer of its own, as
  // outlineLayers has it: the panel strokes it over the fill, unlit.
  const background = backgroundFrom(part, { borderFallback, borderColourFallback: 'FF333333' });
  const borderColour = String(background._children.Border.colour ?? '');
  const seeThrough = bw > 0 && /^[0-9a-f]{8}$/i.test(borderColour) && borderColour.slice(0, 2).toUpperCase() !== 'FF';
  const lit = bw > 0 && Object.keys(background._children.Effects?._children ?? {}).some((key) => background._children.Effects._children[key]?.enabled === true);
  const box = boxFor();
  if (!seeThrough && !lit) {
    const plate = add(knobPart, pathLayer(named(''), placed(grown), box, background));
    turnBinding(plate);
  } else {
    const fill = deepClone(background);
    fill._children.Border.enabled = false;
    fill._children.Border.thickness = 0;
    const edge = deepClone(background);
    edge._children.Fill.solidEnabled = false;
    edge._children.Fill.gradientEnabled = false;
    edge._children.Fill.imageEnabled = false;
    edge._children.Fill.textureEnabled = false;
    delete edge._children.Effects;
    turnBinding(add(knobPart, pathLayer(named(''), placed(r), box, fill)));
    turnBinding(add(knobPart, pathLayer(named('Edge'), placed(grown), box, edge)));
  }

  // Its grooves: in from its edge (on the unsquashed circle, as the panel draws them), each a thin
  // bar, all one layer in the groove colour.
  const count = Math.max(0, Math.round(num(geometry?.grooves, 0)));
  if (count) {
    const inner = r * (1 - Math.max(0, Math.min(100, num(geometry?.grooveLength, 15))) / 100);
    const half = Math.max(0.25, num(geometry?.grooveWidth, 0.85)) / 2;
    const gy = cy + shift;
    const quads = Array.from({ length: count }, (_, i) => {
      const a = (((i * 360) / count + rest) * Math.PI) / 180;
      const ux = Math.sin(a);
      const uy = -Math.cos(a);
      const corners = [[r, -half], [r, half], [inner, half], [inner, -half]]
        .map(([along, across]) => `${r3(cx + ux * along - uy * across)} ${r3(gy + uy * along + ux * across)}`);
      return `M${corners.join(' L')} Z`;
    }).join(' ');
    const grooveBox = { x: cx - r - 1, y: gy - r - 1, width: 2 * r + 2, height: 2 * r + 2 };
    const grooves = createPartNode(named('Grooves'), {
      role, kind: 'path', zIndex: depthOf(), opacity: op,
      layout: { ...pxBox(grooveBox, origin), ...pivotIn(grooveBox, { x: cx, y: gy }) },
      meta: { pathData: pathInBox(quads, grooveBox), closed: true },
      sections: { Background: solidBackground(String(part?.grooveColour ?? geometry?.grooveColour ?? '') || 'FF253136') },
    });
    add(knobPart, grooves);
    turnBinding(grooves);
  }
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
 * The handles a knob or slider has, by its value mode (Behavior.valueMode): one, the control's own
 * value; a range's two, start and end; or a band's three, start, the value and end. Each is a value
 * of its own, the value keeping the control's channel. `name` reserves a channel's name.
 */
function valueHandles(behavior, channel, name) {
  const mode = getSliderValueMode(behavior);
  const current = { role: 'current', channel, pointer: 'pointerCurrent', label: 'labelCurrent' };
  if (mode === 'single') return [current];
  const start = { role: 'start', channel: name(`${channel}Start`), pointer: 'pointerStart', label: 'labelStart' };
  const end = { role: 'end', channel: name(`${channel}End`), pointer: 'pointerEnd', label: 'labelEnd' };
  return mode === 'band' ? [start, current, end] : [start, end];
}

/**
 * Where a range's handles are read (`start`, `end`), and whether they may pass each other
 * (`crossing`: Allow Handle Cross, or Allow Wrap-Around on a knob) and go round the end (`wrap`).
 * Handles that may cross are drawn from their difference, the end less the start (a binding's
 * `minus`), as the panel draws them from whichever comes first.
 */
function handleSources(behavior, sourceOf) {
  const ranged = getSliderValueMode(behavior) !== 'single';
  const wrap = ranged && getSliderAllowWrapAround(behavior);
  return { start: sourceOf('start'), end: sourceOf('end'), crossing: ranged && (wrap || getSliderAllowHandleCross(behavior)), wrap };
}

/** A binding that reads its source less the value `minus` names (interactionRuntime's bindingSourceValue). */
function lessBinding(binding, minus) {
  return { ...binding, minus };
}

/** A binding that adds its result to what the bindings before it wrote (interactionRuntime's `add`). */
function addingBinding(binding) {
  return { ...binding, add: true };
}

/**
 * Bindings lighting a layer between a range's start and end, as the panel's highlightStop lights a
 * tick: `lit` while start <= t <= end, `unlit` outside. The end sets it, the start adds to it; the
 * start never passes the end, so the sum is one or the other.
 */
function litBetween(out, layerName, label, sources, t, lit, unlit) {
  const target = `Parts.${layerName}.opacity`;
  out.bindings[`${layerName}${label}End`] = rangeBinding(`${layerName}${label}End`, sources.end, target, unlit, lit, t - 0.0005, t);
  out.bindings[`${layerName}${label}Start`] = addingBinding(rangeBinding(`${layerName}${label}Start`, sources.start, target, 0, unlit - lit, t, t + 0.0005));
  // Handles that may pass each other: with the end below the start, highlightStop lights what lies
  // outside them, at or past the start or at or before the end. The two above then sum to one step
  // short of that, whichever side of them the tick is, so the end less the start adds the step back.
  if (sources.crossing) {
    out.bindings[`${layerName}${label}Crossed`] = addingBinding(lessBinding(
      rangeBinding(`${layerName}${label}Crossed`, sources.end, target, lit - unlit, 0, -0.0005, 0), sources.start));
  }
}

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
  // A range's or a band's handles, each a value of its own (valueHandles).
  const valueMode = getSliderValueMode(behavior);
  const handles = valueHandles(behavior, channel, uniqueName);
  const sourceOf = (role) => `channel.${(handles.find((handle) => handle.role === role) ?? handles[0]).channel}.normalized`;
  const sources = handleSources(behavior, sourceOf);
  out.handles = handles;

  // The renderer's derived values (SliderFamilyRenderer.svelte, the block from `trackThickness`).
  const g = (name) => geometryParts[name];
  const labelFontSize = (part, fallback) => Math.max(1, num(part?._children?.Text?._children?.Font?.size, fallback));
  // No room for text of its own, as the renderer keeps none (sliderTextRoom): only riding labels.
  const textRoom = sliderTextRoom(behavior, {
    handleSize: Math.max(labelFontSize(g('labelStart'), 11), labelFontSize(g('labelCurrent'), 11), labelFontSize(g('labelEnd'), 11)),
  });
  const labelMetrics = textRoom.labelMetrics;
  const showTicks = behavior.showTicks !== false;
  const trackThickness = num(g('bodyTrackBase')?._children?.Layout?.height, 10);
  const pointerCurrentSize = num(g('pointerCurrent')?._children?.Layout?.width, 20);
  const pointerStartSize = num(g('pointerStart')?._children?.Layout?.width, 18);
  const pointerEndSize = num(g('pointerEnd')?._children?.Layout?.width, 18);
  const maxPointerSize = Math.max(pointerCurrentSize, pointerStartSize, pointerEndSize);
  const kindOfPointer = String(g('pointerCurrent')?.kind ?? 'dot').toLowerCase();
  const pointerKind = ['line', 'bar', 'chicken', 'capdot', 'needle'].includes(kindOfPointer) ? kindOfPointer : 'dot';
  const majorTickLength = num(g('tickMajor')?._children?.Layout?.height, num(behavior.majorTickLength, 12));
  const minorTickLength = num(g('tickMinor')?._children?.Layout?.height, num(behavior.minorTickLength, 7));
  const tickStrokeWidth = num(g('tickMajor')?._children?.Layout?.width, 2);
  const minorTickStrokeWidth = num(g('tickMinor')?._children?.Layout?.width, 1);
  const tight = String(behavior.circularFit ?? 'auto') === 'tight';
  const housingVisible = g('bodyHousing')?.visible === true;
  const tickRadiusShare = Math.max(0, num(behavior.tickRadius, 0)) / 100;
  // How far the housing and the skirt reach, as SliderFamilyRenderer's plateReach has it: their size
  // and outline, their shadow below, an oval taller than wide, a plate moved off the centre; and a
  // scale on a radius of its own, in the tight fit.
  const plateReach = (part, fallback) => {
    if (part?.visible !== true) return 0;
    const layout = part?._children?.Layout ?? {};
    if (String(layout.widthUnit ?? 'percent') === 'px') return 0;
    const reach = knobOutlineReach(String(part?.outline ?? 'circle'), {
      count: part?.outlineCount, depth: part?.outlineDepth, rotation: num(part?.outlineRotation, 0),
    });
    const shadow = 1 + Math.max(0, num(part?.shadowOffset, 0) + num(part?.shadowBlur, 0)) / 100;
    const tall = Math.max(1, Math.max(5, num(part?.aspect, 100)) / 100);
    return (Math.max(0, num(layout.width, fallback)) / 100) * reach * shadow * tall + Math.abs(num(part?.shiftY, 0)) / 100;
  };
  const housingReach = Math.max(plateReach(g('bodyHousing'), 100), plateReach(g('bodySkirt'), 90),
    showTicks && tickRadiusShare > 0 && tight ? tickRadiusShare + (String(behavior.tickPlacement ?? 'outside') === 'outside' ? 0.1 : 0.02) : 0);
  // The scale's numbers (tickNumber): how many, their size, how far out.
  const numberPart = g('tickNumber');
  const scaleNumberCount = numberPart?.visible !== false ? Math.max(0, Math.min(41, Math.round(num(behavior.scaleNumberCount, 0)))) : 0;
  const scaleNumberSize = labelFontSize(numberPart, 7);
  const scaleNumberReach = scaleNumberCount >= 2 ? Math.max(0, num(numberPart?._children?.Layout?.offsetX, 122)) / 100 : 0;
  const metrics = resolveCircularTrackMetrics(width, height, {
    trackThickness,
    // Tight: the pointer it draws, and a range's handles, as SliderFamilyRenderer sizes it.
    pointerSize: tight
      ? Math.max(pointerKind === 'dot' ? pointerCurrentSize : 0, valueMode === 'single' ? 0 : Math.max(pointerStartSize, pointerEndSize))
      : maxPointerSize,
    majorTickLength,
    hasTicks: showTicks,
    circularDiameter: behavior.circularDiameter,
    ...textRoom,
    tight,
    outerReach: housingReach,
    readoutGap: num(behavior.labelReadoutGap, 14),
    numberReach: scaleNumberReach,
    numberSize: scaleNumberSize,
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
  // The plates: the housing and the skirt under the track, the cap and its insert over the scale.
  const plateContext = {
    centre, origin, trackRadius: radius, startPanel, signed, sweep, source, add, out, depthOf: () => depth,
  };
  const plate = (partName, label, fallback, borderFallback, role) => {
    if (g(partName)?.visible !== true) return 0;
    const r = radiusOf(g(partName), fallback);
    plateLayers((extra) => named(`${label}${extra}`), parts[partName], g(partName), r, { ...plateContext, borderFallback, role, knobPart: partName });
    return r;
  };
  plate('bodyHousing', 'housing', 100, 0, 'background');
  plate('bodySkirt', 'skirt', 90, 0, 'background');

  // Track.
  const trackColour = fillOf(parts.bodyTrackBase).colour ?? 'FF2C2C2C';
  // A track or value arc in a gradient, a picture or a finish: its background painted through the
  // arc over the arc's box and a pixel, as the panel paints it (SliderShapeFill).
  const paintThrough = (layer, part) => {
    layer.meta.arcTrack.paint = 'background';
    layer.meta.arcTrack.paintPad = 1;
    layer._children.Background = fillBackground(part);
    return layer;
  };
  if (partVisible(g('bodyTrackBase'))) {
    const track = add('bodyTrackBase', arcLayer(named('track'), {
      centre, radius, thickness: trackThickness, start: designerAngle(startPanel), sweep: Math.min(360, sweep), direction,
      colour: trackColour, opacity: num(g('bodyTrackBase')?.opacity, 1), zIndex: depth, origin, role: 'track',
    }));
    if (fillIsRich(g('bodyTrackBase'))) paintThrough(track, parts.bodyTrackBase);
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
  if (valueMode !== 'single' && partVisible(g('bodySelectedRange'))) {
    // A range's arc, from the start to the end (bodySelectedRange): it begins where the start is, and
    // its sweep is the end's travel less the start's, the start's added on (`add`).
    const rangePart = g('bodySelectedRange');
    const layer = add('bodySelectedRange', arcLayer(named('range'), {
      centre, radius, thickness: trackThickness, start: angleAt(0), sweep: 0, direction,
      colour: fillOf(parts.bodySelectedRange).colour ?? fillColour, opacity: num(rangePart?.opacity, 1), zIndex: depth, origin, role: 'fill',
    }));
    if (fillIsRich(rangePart)) paintThrough(layer, parts.bodySelectedRange);
    const arcKey = `Parts.${layer.name}.meta.arcTrack`;
    out.bindings[`${layer.name}From`] = rangeBinding(`${layer.name}From`, sources.start, `${arcKey}.startAngle`, angleAt(0), angleAt(1));
    if (sources.crossing) {
      // Handles that may pass each other: the arc runs from the start round to the end
      // (resolveCircularArcSweep), so with the end below the start it goes the long way, through
      // the gap: 360 degrees less what lies between them, no more than the knob's sweep unless it
      // wraps round. All of it read from the end less the start.
      const key = `${arcKey}.sweepAngle`;
      out.bindings[`${layer.name}Sweep`] = lessBinding(rangeBinding(`${layer.name}Sweep`, sources.end, key, 0, sweep, 0, 1), sources.start);
      const round = sources.wrap ? 360 : Math.min(360, sweep);
      out.bindings[`${layer.name}SweepRound`] = addingBinding(lessBinding(rangeBinding(`${layer.name}SweepRound`, sources.end, key, round, 0, -0.0005, 0), sources.start));
      // Past the point where 360 less the gap falls under the cap, it falls with the difference.
      const capAt = sources.wrap ? 0 : Math.min(0, (sweep - 360) / sweep);
      if (capAt > -1) {
        out.bindings[`${layer.name}SweepBack`] = addingBinding(lessBinding(rangeBinding(`${layer.name}SweepBack`, sources.end, key, sweep * (-1 - capAt), 0, -1, capAt), sources.start));
      }
    } else {
      out.bindings[`${layer.name}Sweep`] = rangeBinding(`${layer.name}Sweep`, sources.end, `${arcKey}.sweepAngle`, 0, sweep);
      out.bindings[`${layer.name}SweepFrom`] = addingBinding(rangeBinding(`${layer.name}SweepFrom`, sources.start, `${arcKey}.sweepAngle`, 0, -sweep));
    }
  }
  if (valueMode === 'single' && partVisible(g('bodyTrackFill'))) {
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
      if (fillIsRich(g('bodyTrackFill'))) paintThrough(layer, parts.bodyTrackFill);
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
      // Lit, a tick takes its active colour where it has one (the panel's highlightStop colour).
      const litColour = String(part?.activeColour ?? '').trim() || own || litFallback;
      const dimOpacity = num(g(partName)?.opacity, dimOpacityFallback);
      // On the track, either side of its width; or on a radius of its own (Behavior.tickRadius).
      const base = tickRadiusShare > 0 ? radius * tickRadiusShare : radius;
      const halfTrack = tickRadiusShare > 0 ? 0 : trackThickness / 2;
      for (const stop of list) {
        const t = num(stop.normalized, 0);
        let r1 = base + halfTrack;
        let r2 = r1 + length;
        if (placement === 'inside') { r1 = base - halfTrack; r2 = r1 - length; }
        if (placement === 'cross') { r1 = base - length / 2; r2 = base + length / 2; }
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
        if (valueMode !== 'single') {
          // Lit between a range's start and end.
          const between = (layers, lit, unlit, label) => {
            for (const [layer, share] of layers) litBetween(out, layer.name, label, sources, t, lit * share, unlit * share);
          };
          if (dimColour === litColour) {
            between(drawTick('', dimColour, dimOpacity), litOpacity, dimOpacity, 'Lit');
          } else {
            between(drawTick('', dimColour, dimOpacity), 0, dimOpacity, 'Dim');
            between(drawTick('lit', litColour, litOpacity), litOpacity, 0, 'Lit');
          }
        } else if (dimColour === litColour) {
          fade(drawTick('', dimColour, dimOpacity), litWhenAbove ? dimOpacity : litOpacity, litWhenAbove ? litOpacity : dimOpacity, 'Lit');
        } else {
          fade(drawTick('', dimColour, dimOpacity), litWhenAbove ? dimOpacity : 0, litWhenAbove ? 0 : dimOpacity, 'Dim');
          fade(drawTick('lit', litColour, litOpacity), litWhenAbove ? 0 : litOpacity, litWhenAbove ? litOpacity : 0, 'Lit');
        }
        n += 1;
      }
    }

    // A second scale (Behavior.secondScaleRadius, % of the track's radius; secondScaleCount, its
    // divisions): long and short ticks in turn, in from that radius, in the scale's own colours and
    // not lit, as the panel draws Dual Scale's inner ring.
    const share = Math.max(0, num(behavior.secondScaleRadius, 0)) / 100;
    const divisions = Math.max(0, Math.round(num(behavior.secondScaleCount, 0)));
    if (share > 0 && divisions > 0) {
      const base = radius * share;
      for (let i = 0; i <= divisions; i += 1) {
        const major = i % 2 === 0;
        const partName = major ? 'tickMajor' : 'tickMinor';
        const kind = String(g(partName)?.kind ?? 'line').toLowerCase();
        const length = major ? majorTickLength : minorTickLength;
        const stroke = major ? tickStrokeWidth : minorTickStrokeWidth;
        const colour = fillOf(parts[partName]).colour ?? (major ? 'FFD0D0D0' : 'FFB0B0B0');
        const opacity = num(g(partName)?.opacity, major ? 0.95 : 0.55);
        const angle = angleAt(i / divisions);
        const line = { centre, angle, from: base - length, to: base, width: stroke, colour, zIndex: depth, origin };
        const tickName = (extra = '') => named(`scale2Tick${i}${extra}`);
        if (kind === 'dot') {
          add(partName, tickDot(tickName(), { centre, angle, at: base - length / 2, r: Math.max(1.5, length * 0.45), colour, opacity, zIndex: depth, origin }));
        } else if (kind === 'engraved') {
          const turn = (-angle * Math.PI) / 180;
          const dx = 0.6 * Math.cos(turn) - 0.8 * Math.sin(turn);
          const dy = 0.6 * Math.sin(turn) + 0.8 * Math.cos(turn);
          const light = radialBar(tickName('light'), { ...line, colour: 'FFFFFFFF', opacity: opacity * 0.35, round: true });
          light._children.Layout.x = r3(light._children.Layout.x + dx);
          light._children.Layout.y = r3(light._children.Layout.y + dy);
          Object.assign(light._children.Layout, pivotIn(boxOfLayout(light._children.Layout, origin), { x: centre.x - dx, y: centre.y - dy }));
          add(partName, light);
          add(partName, radialBar(tickName(), { ...line, opacity, round: true }));
        } else if (kind !== 'numeral') {
          // A numeral tick on the second scale prints nothing: the panel gives it no label.
          add(partName, radialBar(tickName(), { ...line, opacity, round: false }));
        }
      }
    }
  }

  // The scale's numbers (tickNumber; Behavior.scaleNumberCount, From, To): evenly round the sweep,
  // `Layout.offsetX` % of the track's radius out from the centre, centred on their point.
  if (scaleNumberCount >= 2) {
    const styledNumber = parts.tickNumber;
    const font = numberPart?._children?.Text?._children?.Font ?? {};
    const from = num(behavior.scaleNumberFrom, 0);
    const to = num(behavior.scaleNumberTo, 10);
    for (let i = 0; i < scaleNumberCount; i += 1) {
      const a = ((angleAt(i / (scaleNumberCount - 1)) - 90) * Math.PI) / 180;
      const point = { x: centre.x + Math.cos(a) * radius * scaleNumberReach, y: centre.y + Math.sin(a) * radius * scaleNumberReach };
      const text = deepClone(SECTION_DEFAULTS.Text);
      text.content = String(Math.round((from + ((to - from) * i) / (scaleNumberCount - 1)) * 100) / 100);
      text._children.Fill.colour = styledNumber?._children?.Text?._children?.Fill?.colour ?? 'FFD0D0D0';
      text._children.Font.size = scaleNumberSize;
      text._children.Font.family = font.family ?? 'Arial';
      text._children.Font.weightValue = num(font.weightValue, 400);
      if (num(font.weightValue, 400) >= 600) text._children.Font.weight = 'Bold';
      text._children.Position.justification = 'centred';
      const size = scaleNumberSize;
      const box = { x: point.x - size * 2, y: point.y - size, width: size * 4, height: size * 2 };
      add('tickNumber', createPartNode(named(`number${i}`), {
        role: 'label', kind: 'rectangle', zIndex: depth, opacity: num(numberPart?.opacity, 1), layout: pxBox(box, origin), sections: { Text: text },
      }));
    }
  }

  // The cap, and the insert set into it.
  const capRadius = plate('bodyCap', 'cap', 72, 1, 'cap');
  plate('bodyInsert', 'insert', 45, 1, 'cap');

  // A dot on the track at the start of the travel, turned about the centre by the value: the panel's
  // dot pointer, and a range's start and end. In a gradient, a picture or a finish, the panel paints
  // its background over its circle's box and a pixel, upright wherever it is (SliderShapeFill), and
  // strokes its border over it; its layers go round the knob upright (`meta.orbit`) rather than
  // turning.
  const dotLayers = (nameOf, part, geometry, size, borderColourFallback) => {
    const point = { x: centre.x, y: centre.y - radius };
    const r = size / 2;
    const startAngle = designerAngle(startPanel);
    if (!fillIsRich(geometry)) {
      const layers = outlineLayers(nameOf, part, point, r, origin, { zIndex: depth, borderFallback: 1, role: 'handle', borderColourFallback });
      for (const layer of layers) {
        Object.assign(layer._children.Layout, pivotIn(boxOfLayout(layer._children.Layout, origin), centre));
        layer._children.Layout.rotation = startAngle;
      }
      return layers;
    }
    const bw = borderWidth(part, 1);
    const background = backgroundFrom(part, { borderFallback: 1, borderColourFallback });
    const fill = deepClone(background);
    fill._children.Border.enabled = false;
    fill._children.Border.thickness = 0;
    const dot = (layerName, sectionBackground, half, closed, grow = 0) => {
      const box = { x: point.x - half - grow / 2, y: point.y - half - grow / 2, width: 2 * half + grow, height: 2 * half + grow };
      const inner = { x: point.x - half, y: point.y - half, width: 2 * half, height: 2 * half };
      return createPartNode(layerName, {
        role: 'handle', kind: 'path', zIndex: depth, opacity: num(geometry?.opacity, 1),
        layout: { ...pxBox(box, origin), ...pivotIn(box, centre), rotation: startAngle },
        meta: { pathData: pathInBox(circlePath(point.x, point.y, r), inner), closed, orbit: true },
        sections: { Background: sectionBackground },
      });
    };
    const layers = [dot(nameOf(''), fill, r + 1, true)];
    if (bw > 0) layers.push(dot(nameOf('Edge'), edgeBackground(background, bw), r, false, bw));
    return layers;
  };
  // A range's start or end: always a circle, whatever kind the pointer is, as the panel draws them,
  // each turned by its own value.
  const handleDot = (role, borderColourFallback) => {
    const handle = handles.find((each) => each.role === role);
    const part = { ...(parts[handle.pointer] ?? {}), outline: 'circle' };
    const startAngle = designerAngle(startPanel);
    const layers = dotLayers((extra) => named(`${role}${extra}`), part, g(handle.pointer), num(g(handle.pointer)?._children?.Layout?.width, 18), borderColourFallback);
    for (const each of layers) {
      each.zIndex = depth;
      add(handle.pointer, each);
      out.bindings[`${each.name}Turn`] = rangeBinding(`${each.name}Turn`, `channel.${handle.channel}.normalized`, `Parts.${each.name}.Layout.rotation`, startAngle, startAngle + signed * sweep);
    }
  };
  if (valueMode !== 'single') handleDot('start', 'FF000000');

  // Pointer, drawn at the start of the travel and turned about the centre by the value.
  if (valueMode !== 'range' && partVisible(g('pointerCurrent'))) {
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
    } else if (pointerKind === 'bar') {
      // A painted bar with square ends (the panel's radialPointerShape), pointing up and turned to the
      // start: from Layout.offsetX to Layout.height out, its width a % of the reach, narrowed at the
      // tip by `taper`. Its border is an edge outside it, a layer of its own under it; a shaded bar is
      // its Background, a flat one its colour.
      const r0 = reach * (num(geometryPointer?._children?.Layout?.offsetX, 30) / 100);
      const halfBase = Math.max(0.5, (reach * num(geometryPointer?._children?.Layout?.width, 12)) / 200);
      const halfTip = halfBase * (1 - Math.max(-300, Math.min(100, num(geometryPointer?.taper, 0))) / 100);
      const quad = (grow) => [[r0 - grow, -halfBase - grow], [tip + grow, -halfTip - grow], [tip + grow, halfTip + grow], [r0 - grow, halfBase + grow]]
        .map(([along, across]) => [centre.x + across, centre.y - along]);
      const edge = borderWidth(pointerPart, 0);
      const opacity = num(geometryPointer?.opacity, 1);
      const polygonLayer = (layerName, rings, background) => {
        const all = rings.flat();
        const shape = normalisePoints(all);
        const d = rings.map((ring) => `M${ring.map(([x, y]) => `${r3(x)} ${r3(y)}`).join(' L')} Z`).join(' ');
        return createPartNode(layerName, {
          role: 'handle', kind: 'path', zIndex: depth, opacity,
          layout: { ...pxBox(shape.box, origin), ...pivotIn(shape.box, centre), rotation: startAngle },
          meta: { pathData: pathInBox(d, shape.box), closed: true },
          sections: { Background: background },
        });
      };
      pointerLayers = [];
      if (edge > 0) {
        // The panel strokes quad(edge / 2), `edge` wide with mitred corners: the band between its
        // outline pushed out and pulled in by half the edge.
        const middle = quad(edge / 2);
        const colour = String(pointerPart?._children?.Background?._children?.Border?.colour ?? '') || 'FF202020';
        pointerLayers.push(polygonLayer(named('pointerEdge'), [offsetPolygon(middle, edge / 2), offsetPolygon(middle, -edge / 2).reverse()], solidBackground(colour)));
      }
      const shaded = fillOf(pointerPart).gradientEnabled === true;
      const fillBackground = shaded ? backgroundFrom(pointerPart, { borderFallback: 0 }) : solidBackground(colourOr('FFFFFFFF'));
      if (shaded) { fillBackground._children.Border.enabled = false; fillBackground._children.Border.thickness = 0; }
      pointerLayers.push(polygonLayer(named('pointer'), [quad(0)], fillBackground));
      // A second bar on it (markFrom, markTo, markWidth: % of the reach; markColour), Dual Scale's.
      const markTo = num(geometryPointer?.markTo, 0);
      const markFrom = num(geometryPointer?.markFrom, 0);
      const markWidth = num(geometryPointer?.markWidth, 0);
      if (markTo > markFrom && markWidth > 0) {
        const half = Math.max(0.25, (reach * markWidth) / 200);
        const m0 = (reach * markFrom) / 100;
        const m1 = (reach * markTo) / 100;
        const mark = [[m0, -half], [m1, -half], [m1, half], [m0, half]].map(([along, across]) => [centre.x + across, centre.y - along]);
        pointerLayers.push(polygonLayer(named('pointerMark'), [mark], solidBackground(String(pointerPart?.markColour ?? '') || 'FF1C2226')));
      }
    } else if (pointerKind === 'capdot') {
      const r = Math.max(1.5, reach * (num(geometryPointer?._children?.Layout?.width, 26) / 200));
      layer = tickDot(named('pointer'), { centre, angle: startAngle, at: tip, r, colour: colourOr('FFFFFFFF'), opacity: num(geometryPointer?.opacity, 1), zIndex: depth, origin });
    } else if (pointerKind === 'dot') {
      pointerLayers = dotLayers((extra) => named(`pointer${extra}`), pointerPart, geometryPointer, pointerCurrentSize, 'FF333333');
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
      each.zIndex = depth;
      add('pointerCurrent', each);
      out.bindings[`${each.name}Turn`] = rangeBinding(`${each.name}Turn`, source, `Parts.${each.name}.Layout.rotation`, startAngle, startAngle + signed * sweep);
    }
  }
  if (valueMode !== 'single') handleDot('end', 'FF202020');

  // Readout and title, where the panel's labels hang: centred on their anchor.
  const anchors = buildSliderLabelAnchors(behavior, width, height, { start: 0, current: 0, end: 0 }, {
    trackThickness, pointerSize: maxPointerSize, hasReadout: false, labelMetrics,
  });
  // A label that rides the pointer: 22 px out from the track, upright, round the centre the panel's
  // label anchors use (buildSliderLabelAnchors' own track metrics, not the knob's drawn centre).
  const labelCircle = resolveCircularTrackMetrics(width, height, {
    trackThickness, pointerSize: maxPointerSize, majorTickLength: num(behavior.majorTickLength, 12), hasTicks: behavior.showTicks !== false,
    hasReadout: false, circularDiameter: behavior.circularDiameter, labelMetrics,
  });
  const riding = behavior.showHandleLabels === true
    ? handles.map((each) => ({ ...each, at: anchors[each.role], centre: { x: labelCircle.centerX, y: labelCircle.centerY }, turn: signed * sweep }))
    : [];
  addLabelLayers({ parts, width, origin, add, named, depthOf: () => depth, out }, riding);

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
 * The labels that ride a knob's or slider's handles (`showHandleLabels`), as text layers. Its name,
 * value and range ends are Labels of their own beside it (utils/labelShows.js): selected with it,
 * they come in as layers of their own (customComponentFromControls.js).
 */
function addLabelLayers({ parts, width, origin, add, named, depthOf, out }, riding = []) {
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
  // The label that rides each pointer or cap (`showHandleLabels`): its value as the readout shows it,
  // at the start of the travel, carried with the value: round the knob upright (`meta.orbit`, the
  // turn its pointer makes), or along the slider's travel.
  for (const handle of riding) {
    const suffix = handle.role === 'current' ? 'handle' : `${handle.role}Label`;
    const layer = add(handle.label, textLayer(suffix, parts[handle.label], handle.at, '', 11));
    out.bindings[`${layer.name}Text`] = { _type: 'Binding', name: `${layer.name}Text`, enabled: true, source: `channel.${handle.channel}.display`, mapMode: 'direct', target: `Parts.${layer.name}.Text.content` };
    const source = `channel.${handle.channel}.normalized`;
    if (handle.centre) {
      layer.meta = { ...(layer.meta ?? {}), orbit: true };
      Object.assign(layer._children.Layout, pivotIn(boxOfLayout(layer._children.Layout, origin), handle.centre));
      out.bindings[`${layer.name}Turn`] = rangeBinding(`${layer.name}Turn`, source, `Parts.${layer.name}.Layout.rotation`, 0, handle.turn);
    } else {
      const dx = handle.to.x - handle.at.x;
      const dy = handle.to.y - handle.at.y;
      if (Math.abs(dx) > 1e-6) out.bindings[`${layer.name}MoveX`] = rangeBinding(`${layer.name}MoveX`, source, `Parts.${layer.name}.Layout.offsetX`, 0, dx);
      if (Math.abs(dy) > 1e-6) out.bindings[`${layer.name}MoveY`] = rangeBinding(`${layer.name}MoveY`, source, `Parts.${layer.name}.Layout.offsetY`, 0, dy);
    }
  }
}

// --- sliders ---------------------------------------------------------------------------------------


/** Why this slider cannot become layers that look as it does, or ''. */
function sliderLayersRefusal() {
  // Every cap kind (dot, bar, console, block, lens, glass, ring, line), its glow, sheen, gradient and
  // finish, a shaded track and fill, a glowing fill, a rendered cap and a label riding the cap are
  // layers now.
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
  // A range's or a band's handles, each a value of its own (valueHandles).
  const valueMode = getSliderValueMode(behavior);
  const handles = valueHandles(behavior, channel, uniqueName);
  const sourceOf = (role) => `channel.${(handles.find((handle) => handle.role === role) ?? handles[0]).channel}.normalized`;
  const sources = handleSources(behavior, sourceOf);
  out.handles = handles;

  const labelFontSize = (part, fallback) => Math.max(1, num(part?._children?.Text?._children?.Font?.size, fallback));
  const labelMetrics = sliderTextRoom(behavior, {
    handleSize: Math.max(labelFontSize(g('labelStart'), 11), labelFontSize(g('labelCurrent'), 11), labelFontSize(g('labelEnd'), 11)),
  }).labelMetrics;
  const showTicks = behavior.showTicks !== false;
  const trackThickness = num(g('bodyTrackBase')?._children?.Layout?.height, 10);
  const pointerCurrentSize = num(g('pointerCurrent')?._children?.Layout?.width, 20);
  const maxPointerSize = Math.max(pointerCurrentSize, num(g('pointerStart')?._children?.Layout?.width, 18), num(g('pointerEnd')?._children?.Layout?.width, 18));
  const frame = resolveLinearTrackFrame(behavior, width, height, trackThickness, maxPointerSize, false, labelMetrics);
  const pointAt = (t, size) => resolveLinearPointerPoint(behavior, width, height, t, trackThickness, size, false, labelMetrics);
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
    // A colour, or a whole Background (a shaded track, a lit fill).
    const background = typeof colour === 'object' && colour ? colour : solidBackground(colour);
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
    // Its own fill: a colour, or a gradient or finish along it.
    const trackFill = fillIsRich(trackPart) ? fillBackground(parts.bodyTrackBase, square ?? 0) : fillOf(parts.bodyTrackBase).colour ?? 'FF2C2C2C';
    add('bodyTrackBase', barLayer(named('track'), barBox({ x: frame.x1, y: frame.y1 }, { x: frame.x2, y: frame.y2 }, trackThickness, round),
      round, trackFill, num(trackPart?.opacity, 1), square ?? 0));
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

  // A range's fill, from the start to the end (bodySelectedRange): a bar the track's thickness with
  // round ends, as the panel strokes it. Its near edge goes where the start is; its length is the
  // end's place less the start's, the start's added on (`add`). Each end stands where its own
  // handle's travel puts it (the travel is laid out for each handle's size).
  if (valueMode !== 'single') {
    const startSize = num(g('pointerStart')?._children?.Layout?.width, 18);
    const endSize = num(g('pointerEnd')?._children?.Layout?.width, 18);
    const axis = vertical ? 'y' : 'x';
    const [posKey, lengthKey] = vertical ? ['y', 'height'] : ['x', 'width'];
    const startAt = (t) => pointAt(t, startSize)[axis];
    const endAt = (t) => pointAt(t, endSize)[axis];
    const rangePart = g('bodySelectedRange');
    const paint = fillIsRich(rangePart) ? fillBackground(parts.bodySelectedRange, 0) : (fillOf(parts.bodySelectedRange).colour ?? 'FF5B9BD5');
    const layer = add('bodySelectedRange', barLayer(named('range'), barBox(pointAt(0, startSize), pointAt(0, endSize), trackThickness, true), true, paint, num(rangePart?.opacity, 1)));
    const lead = Math.sign(endAt(1) - startAt(0)) || 1;
    const half = trackThickness / 2;
    const at = origin[axis];
    // The near edge: the start's, where the end lies further along the axis; else the end's.
    const lengthTarget = `Parts.${layer.name}.Layout.${lengthKey}`;
    const moveTarget = `Parts.${layer.name}.Layout.${posKey}`;
    if (sources.crossing) {
      // Handles that may pass each other (of one size, valueLayersRefusal): the bar from whichever
      // comes first along the axis to the other, as the panel's line from the start to the end is.
      // Its near edge is the start's, moved back by the end less the start where that is below
      // nothing (or on by it where the axis runs back, upright); its length that difference either way.
      const k = startAt(1) - startAt(0);
      out.bindings[`${layer.name}Move`] = rangeBinding(`${layer.name}Move`, sources.start, moveTarget, at + startAt(0) - half, at + startAt(1) - half);
      out.bindings[`${layer.name}MoveCrossed`] = addingBinding(lessBinding(k > 0
        ? rangeBinding(`${layer.name}MoveCrossed`, sources.end, moveTarget, -k, 0, -1, 0)
        : rangeBinding(`${layer.name}MoveCrossed`, sources.end, moveTarget, 0, k, 0, 1), sources.start));
      out.bindings[`${layer.name}Length`] = lessBinding(rangeBinding(`${layer.name}Length`, sources.end, lengthTarget, trackThickness, Math.abs(k) + trackThickness, 0, 1), sources.start);
      out.bindings[`${layer.name}LengthBack`] = addingBinding(lessBinding(rangeBinding(`${layer.name}LengthBack`, sources.end, lengthTarget, Math.abs(k), 0, -1, 0), sources.start));
    } else {
      const [nearSource, nearAt] = lead > 0 ? [sources.start, startAt] : [sources.end, endAt];
      out.bindings[`${layer.name}Move`] = rangeBinding(`${layer.name}Move`, nearSource, moveTarget, at + nearAt(0) - half, at + nearAt(1) - half);
      out.bindings[`${layer.name}Length`] = rangeBinding(`${layer.name}Length`, sources.end, lengthTarget,
        lead * (endAt(0) - startAt(0)) + trackThickness, lead * (endAt(1) - startAt(0)) + trackThickness);
      out.bindings[`${layer.name}LengthFrom`] = addingBinding(rangeBinding(`${layer.name}LengthFrom`, sources.start, lengthTarget, 0, -lead * (startAt(1) - startAt(0))));
    }
  }

  // Value fill, from its origin to the value: one bar growing each way it can.
  const fillPart = g('bodyTrackFill');
  if (valueMode === 'single' && partVisible(fillPart)) {
    const fromCentre = String(behavior.fillOrigin ?? 'min').trim().toLowerCase() === 'center';
    const o = fromCentre ? centreTravel : 0;
    const round = square === null;
    const po = pointAt(o, pointerCurrentSize);
    const colour = fillOf(parts.bodyTrackFill).colour ?? 'FF5B9BD5';
    const segments = fromCentre ? [['valueUp', o, 1], ['valueDown', 0, o]] : [['value', 0, 1]];
    for (const [suffix, from, to] of segments) {
      if (to - from <= 0) continue;
      const far = pointAt(suffix === 'valueDown' ? 0 : 1, pointerCurrentSize);
      const [lengthKey, posKey, a, b] = vertical ? ['height', 'y', po.y, far.y] : ['width', 'x', po.x, far.x];
      // Longer as the travel leaves the origin; where it grows up or left, its box moves with its end.
      const growing = suffix === 'valueDown' ? [to, from] : [from, to];
      const grow = (layer, base) => {
        out.bindings[`${layer.name}Length`] = rangeBinding(`${layer.name}Length`, source, `Parts.${layer.name}.Layout.${lengthKey}`, base, Math.abs(b - a) + base, growing[0], growing[1]);
        if (b < a) {
          const start = layer._children.Layout[posKey];
          out.bindings[`${layer.name}Move`] = rangeBinding(`${layer.name}Move`, source, `Parts.${layer.name}.Layout.${posKey}`, start, start - (a - b), growing[0], growing[1]);
        }
      };
      // A glowing fill (`glow`) draws nothing on the panel: its blur's region is a share of the
      // line's own box, which has no width across a straight line, so the filtered line is not
      // drawn. The layers draw what the panel shows.
      const fillPaint = fillIsRich(fillPart) ? fillBackground(parts.bodyTrackFill, square ?? 0) : colour;
      const layer = add('bodyTrackFill', barLayer(named(suffix), barBox(po, po, fillThickness, round), round, fillPaint, num(fillPart?.opacity, 1), square ?? 0));
      grow(layer, round ? fillThickness : 0);
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
        const litColour = String(parts[partName]?.activeColour ?? '').trim() || own || litFallback;
        if (valueMode !== 'single') {
          // Lit between a range's start and end.
          const between = (layers, lit, unlit, label) => {
            for (const [layer, share] of layers) litBetween(out, layer.name, label, sources, t, lit * share, unlit * share);
          };
          if (dimColour === litColour) {
            between(drawTick('', dimColour, dimOpacity), litOpacity, dimOpacity, 'Lit');
          } else {
            between(drawTick('', dimColour, dimOpacity), 0, dimOpacity, 'Dim');
            between(drawTick('lit', litColour, litOpacity), litOpacity, 0, 'Lit');
          }
        } else if (dimColour === litColour) {
          fade(drawTick('', dimColour, dimOpacity), litWhenAbove ? dimOpacity : litOpacity, litWhenAbove ? litOpacity : dimOpacity, 'Lit');
        } else {
          fade(drawTick('', dimColour, dimOpacity), litWhenAbove ? dimOpacity : 0, litWhenAbove ? 0 : dimOpacity, 'Dim');
          fade(drawTick('lit', litColour, litOpacity), litWhenAbove ? 0 : litOpacity, litWhenAbove ? litOpacity : 0, 'Lit');
        }
        n += 1;
      }
    }
  }

  const namedLayer = named;
  // The fader cap, drawn at the start of the travel and moved along the track by the value; a range's
  // start and end caps (and a band's value between them) by their own, each drawn as the panel draws
  // a cap (its linearCap), on the travel its size lays out.
  const addCap = (handle) => {
    const capPart = parts[handle.pointer];
    const capGeometryPart = g(handle.pointer);
    if (!partVisible(capGeometryPart)) return;
    const size = handle.role === 'current' ? pointerCurrentSize : num(capGeometryPart?._children?.Layout?.width, 18);
    const source = `channel.${handle.channel}.normalized`;
    // The value's cap keeps its names; a start or end cap's are `start…` and `end…`.
    const named = (suffix) => namedLayer(handle.role === 'current' ? suffix : `${handle.role}${suffix[0].toUpperCase()}${suffix.slice(1)}`);
    const kind = String(capGeometryPart?.kind ?? 'dot').toLowerCase();
    const at = pointAt(0, size);
    const end = pointAt(1, size);
    const along = Math.max(2, num(capGeometryPart?._children?.Layout?.width, 20));
    const across = Math.max(2, num(capGeometryPart?._children?.Layout?.height, 20));
    const fill = fillOf(capPart).colour ?? 'FFFFFFFF';
    const opacity = num(capGeometryPart?.opacity, 1);
    const capLayers = [];
    const bw = borderWidth(capGeometryPart, 1);
    const borderColour = capPart?._children?.Background?._children?.Border?.colour ?? 'FF333333';
    const grooveColour = capPart?.grooveColour ?? borderColour;
    const node = (name, kindOf, box, background, layerOpacity = opacity, extra = {}) => createPartNode(name, {
      role: 'handle', kind: kindOf, zIndex: depth, opacity: layerOpacity, layout: pxBox(box, origin), sections: { Background: background }, ...extra,
    });
    const circleBox = (r, pad = 0) => ({ x: at.x - r - pad, y: at.y - r - pad, width: 2 * (r + pad), height: 2 * (r + pad) });
    // A disc as a path in the panel's fill box (its circle's bounds and a pixel), so a gradient on
    // it runs as the panel's does.
    const disc = (name, r, background, layerOpacity = opacity) => {
      const box = circleBox(r, 1);
      return createPartNode(name, {
        role: 'handle', kind: 'path', zIndex: depth, opacity: layerOpacity, layout: pxBox(box, origin),
        meta: { pathData: pathInBox(circlePath(at.x, at.y, r), box), closed: true }, sections: { Background: background },
      });
    };
    const roundKinds = ['dot', 'lens', 'glass'];
    const rectKinds = ['bar', 'console', 'block'];
    // A bar's, a console cap's or a block's groove, as capGeometry lays it out, over the cap.
    const grooveLayer = (box, w, h) => {
      const small = Math.min(w, h);
      const stroke = Math.max(1, kind === 'block' ? 2 : Math.max(1.5, small * 0.18));
      const margin = kind === 'block' ? Math.max(6, small * 0.4) : 3;
      const groove = vertical
        ? { x: box.x + margin - stroke / 2, y: at.y - stroke / 2, width: w - margin * 2 + stroke, height: stroke }
        : { x: at.x - stroke / 2, y: box.y + margin - stroke / 2, width: stroke, height: h - margin * 2 + stroke };
      return barLayer(named('capGroove'), groove, true, grooveColour, opacity * (kind === 'block' ? 1 : 0.85));
    };
    const rendered = String(capGeometryPart?.look ?? '') === 'rendered' && (roundKinds.includes(kind) || rectKinds.includes(kind));
    if (rendered && roundKinds.includes(kind)) {
      // Rendered (renderedCapSpec): a turned body the cap's size, its image alone.
      capLayers.push(renderedLayer(named('cap'), capPart, capGeometryPart, circleBox(along / 2), origin, { shape: 'round', colour: fill, zIndex: depth, opacity, role: 'handle' }));
    } else if (rendered) {
      // A block the cap's box, the groove over it unless its top is ridged.
      const w = vertical ? across : along;
      const h = vertical ? along : across;
      const box = { x: at.x - w / 2, y: at.y - h / 2, width: w, height: h };
      capLayers.push(renderedLayer(named('cap'), capPart, capGeometryPart, box, origin, {
        shape: 'block', corner: kind === 'block' ? 30 : 36, height: 60, axis: vertical ? 'y' : 'x', colour: fill, zIndex: depth, opacity, role: 'handle',
      }));
      if (String(capGeometryPart?.renderTop ?? capPart?.renderTop ?? '') !== 'ridged') capLayers.push(grooveLayer(box, w, h));
    } else if (kind === 'ring') {
      const ring = Math.max(2, across / 4);
      const r = Math.max(2, (along / 2) - (ring / 2));
      const outer = r + ring / 2;
      const inner = Math.max(0.5, r - ring / 2) / (2 * outer);
      if (capGeometryPart?.glow === true) capLayers.push(blurred(node(named('capGlow'), 'circle', circleBox(r * 1.5), solidBackground(fill), 0.5 * opacity), 4));
      capLayers.push(createPartNode(named('cap'), {
        role: 'handle', kind: 'path', zIndex: depth, opacity,
        layout: pxBox({ x: at.x - outer, y: at.y - outer, width: 2 * outer, height: 2 * outer }, origin),
        meta: { pathData: `${UNIT_CIRCLE} M${r3(0.5 - inner)} 0.5 a${r3(inner)} ${r3(inner)} 0 1 1 ${r3(inner * 2)} 0 a${r3(inner)} ${r3(inner)} 0 1 1 ${r3(-inner * 2)} 0 Z`, closed: true },
        sections: { Background: fillIsRich(capGeometryPart) ? fillBackground(capPart) : solidBackground(fill) },
      }));
    } else if (kind === 'line') {
      const w = vertical ? across : along;
      const h = vertical ? along : across;
      const box = vertical
        ? { x: at.x - w / 2 - along / 2, y: at.y - along / 2, width: w + along, height: along }
        : { x: at.x - along / 2, y: at.y - h / 2 - along / 2, width: along, height: h + along };
      capLayers.push(barLayer(named('cap'), box, true, fill, opacity));
    } else if (roundKinds.includes(kind) || !rectKinds.includes(kind)) {
      // A dot, a lens (a dome lit from inside) or a glass dot (a dot in a halo), as the panel draws
      // them: its glow, a glass dot's halo, the fill, a lens's dome (or any cap's sheen), its edge,
      // and a lens's light, blurred, with its core and its spark.
      const r = along / 2;
      if (capGeometryPart?.glow === true) capLayers.push(blurred(node(named('capGlow'), 'circle', circleBox(r * 1.5), solidBackground(fill), 0.5 * opacity), 4));
      if (kind === 'glass') capLayers.push(node(named('capHalo'), 'circle', circleBox(r * 1.5), solidBackground(fill), 0.18 * opacity));
      capLayers.push(disc(named('cap'), r, fillBackground(capPart)));
      if (kind === 'lens' || capGeometryPart?.sheen === true) capLayers.push(node(named('capDome'), 'circle', circleBox(r), gradientBackground(CAP_DOME)));
      if (bw > 0) capLayers.push(node(named('capEdge'), 'circle', circleBox(r + bw / 2), borderOnlyBackground(borderColour, bw)));
      if (kind === 'lens') {
        capLayers.push(blurred(node(named('capLight'), 'circle', circleBox(r * 0.6), solidBackground(grooveColour), 0.9 * opacity), 4));
        capLayers.push(node(named('capLightCore'), 'circle', circleBox(r * 0.42), solidBackground(grooveColour)));
        capLayers.push(node(named('capSpark'), 'circle', circleBox(r * 0.16), solidBackground('FFFFFFFF'), 0.9 * opacity));
      }
    } else {
      // A fader cap: a bar (a rectangle with a groove), a console cap (the bar with the cylinder
      // sheen), or a billet block (the sheen and an inset top plate), as capGeometry lays them out:
      // its glow, the fill, the sheen, a block's plate and the plate's sheen, its edge, the groove.
      const w = vertical ? across : along;
      const h = vertical ? along : across;
      const box = { x: at.x - w / 2, y: at.y - h / 2, width: w, height: h };
      const small = Math.min(w, h);
      const rx = kind === 'block' ? small * 0.15 : small * 0.18;
      const rounded = (name, b, background, radius, layerOpacity = opacity) => {
        background._children.Corners.radius = radius;
        return node(name, 'roundedRectangle', b, background, layerOpacity);
      };
      if (capGeometryPart?.glow === true) {
        capLayers.push(blurred(rounded(named('capGlow'), { x: box.x - 4, y: box.y - 4, width: w + 8, height: h + 8 }, solidBackground(fill), rx + 4, 0.45 * opacity), 4));
      }
      capLayers.push(rounded(named('cap'), box, fillBackground(capPart, rx), rx));
      if (kind !== 'bar' || capGeometryPart?.sheen === true) capLayers.push(rounded(named('capSheen'), box, gradientBackground(capSheen(vertical)), rx));
      if (kind === 'block') {
        const inset = Math.max(2, small * 0.15);
        const plate = { x: box.x + inset, y: box.y + inset, width: w - inset * 2, height: h - inset * 2 };
        const plateRadius = Math.max(1, rx - 1);
        capLayers.push(rounded(named('capPlate'), plate, solidBackground(capPart?.plateColour ?? '38FFFFFF'), plateRadius));
        capLayers.push(rounded(named('capPlateSheen'), plate, gradientBackground(capSheen(vertical)), plateRadius, 0.6 * opacity));
      }
      // The panel strokes the edge centred on the outline; a layer bands it in from its box.
      if (bw > 0) capLayers.push(rounded(named('capEdge'), { x: box.x - bw / 2, y: box.y - bw / 2, width: w + bw, height: h + bw }, borderOnlyBackground(borderColour, bw), rx + bw / 2));
      capLayers.push(grooveLayer(box, w, h));
    }
    const [key, from, to] = vertical ? ['offsetY', 0, end.y - at.y] : ['offsetX', 0, end.x - at.x];
    for (const layer of capLayers) {
      add(handle.pointer, layer);
      out.bindings[`${layer.name}Move`] = rangeBinding(`${layer.name}Move`, source, `Parts.${layer.name}.Layout.${key}`, from, to);
    }
  };
  for (const handle of handles) addCap(handle);

  const anchors = buildSliderLabelAnchors(behavior, width, height, { start: 0, current: 0, end: 0 }, {
    trackThickness, pointerSize: maxPointerSize, hasReadout: false, labelMetrics,
  });
  // A label that rides each cap: beside it, or above it, from one end of the travel to the other.
  const far = buildSliderLabelAnchors(behavior, width, height, { start: 1, current: 1, end: 1 }, { trackThickness, pointerSize: maxPointerSize, hasReadout: false, labelMetrics });
  const riding = behavior.showHandleLabels === true ? handles.map((each) => ({ ...each, at: anchors[each.role], to: far[each.role] })) : [];
  addLabelLayers({ parts, width, origin, add, named, depthOf: () => depth, out }, riding);

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
 * designer, which draws what is authored, shows the control at its value and not at its start. A
 * binding on the held peak stands at `peak` (null: no peak, as the runtime reads one it lacks), and
 * one that writes only inside its range (`band`) writes as it does.
 */
/**
 * A meter on a decibel scale (Meter.scale 'db', dbFloor to dbCeil): every binding that places a part
 * by its reading or its held peak reads them on that scale (interactionRuntime's `scale: 'db'`), as
 * the meter places them (meterPosition). Its raw reading, printed, stays as it is.
 */
export function readOnDecibelScale(bindings, channel, meter) {
  if (String(meter?.scale ?? 'linear') !== 'db') return bindings;
  const scale = { scale: 'db', dbFloor: num(meter.dbFloor, -60), dbCeil: num(meter.dbCeil, 6) };
  for (const binding of Object.values(bindings ?? {})) {
    const source = String(binding?.source ?? '');
    if (source !== `channel.${channel}.normalized` && source !== `channel.${channel}.peak`) continue;
    if (binding.mapMode === 'range' || binding.mapMode === 'figures') Object.assign(binding, scale);
  }
  return bindings;
}

export function seedLayersAt(parts, bindings, travel, { peak = typeof travel === 'number' ? travel : null } = {}) {
  const byName = new Map(parts.map((part) => [part.name, part]));
  // One travel for every binding, or each channel's own (a range's handles): { channel: travel }.
  const travelOf = (source) => {
    if (typeof travel === 'number') return travel;
    const channel = /^channel\.(.+)\.[a-z]+$/.exec(String(source ?? ''))?.[1];
    return num(travel?.[channel], 0);
  };
  for (const binding of Object.values(bindings ?? {})) {
    if (binding?.mapMode !== 'range') continue;
    const match = /^Parts\.([^.]+)\.(.+)$/.exec(String(binding.target ?? ''));
    const part = match ? byName.get(match[1]) : null;
    if (!part) continue;
    const fromPeak = /\.peak$/.test(String(binding.source ?? ''));
    // A binding that reads its source less another (`minus`) reads the two travels' difference.
    const read = fromPeak ? peak : travelOf(binding.source) - (String(binding.minus ?? '').trim() ? travelOf(binding.minus) : 0);
    // No peak: the binding's own minimum, already where it places things. A decibel scale places the
    // reading as the runtime does.
    const input = read == null ? binding.inputMin : (binding.scale === 'db' ? decibelPosition(read, binding.dbFloor, binding.dbCeil) : read);
    const span = binding.inputMax - binding.inputMin;
    let value;
    if (binding.band === true) {
      const inside = !(fromPeak && peak == null) && input >= Math.min(binding.inputMin, binding.inputMax) && input < Math.max(binding.inputMin, binding.inputMax);
      value = inside ? binding.outputMax : binding.outputMin;
    } else {
      const t = span === 0 ? (input >= binding.inputMax ? 1 : 0) : Math.max(0, Math.min(1, (input - binding.inputMin) / span));
      value = r3(binding.outputMin + (binding.outputMax - binding.outputMin) * t);
    }
    const path = match[2].split('.');
    let node = part;
    for (const key of path.slice(0, -1)) {
      const next = key === 'meta' || key in node ? node[key] : node._children?.[key];
      if (!next || typeof next !== 'object') { node = null; break; }
      node = next;
    }
    // An adding binding (`add`) adds to what the binding before it wrote, as the runtime does.
    const key = path[path.length - 1];
    if (node) node[key] = binding.add === true ? r3(num(node[key], 0) + value) : value;
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

/** `colour` (AARRGGBB) with its alpha multiplied by `share`; a role or a malformed colour as `fallback`. */
function withAlpha(colour, share, fallback = 'FF000000') {
  const raw = String(colour ?? '').replace(/^#/, '').trim();
  const hex = /^[0-9a-f]{8}$/i.test(raw) ? raw : (/^[0-9a-f]{6}$/i.test(raw) ? `FF${raw}` : fallback);
  const alpha = Math.round(parseInt(hex.slice(0, 2), 16) * share);
  return `${alpha.toString(16).padStart(2, '0').toUpperCase()}${hex.slice(2).toUpperCase()}`;
}

/**
 * A button's bat switch (CanvasControl's lamp `bat`, an amp's or a tape deck's toggle) as layers.
 * The panel draws it as SVG in a box a lamp wide and three tall, a 10 by 30 view: a bezel ring at the
 * centre with a dark hub, and a lever from the hub to the top when lit and to the bottom when not,
 * its shadow under it, a ball on its end with a highlight. Each circle and each round-capped line is
 * a path layer, a stroke an edge layer over it (stroked as the panel strokes, half outside); the lever
 * is drawn twice, thrown up in the lit colour and down in the off colour, and `on` shows the one and
 * hides the other.
 *
 * `box` is the lamp's box in the component; `colours` `{ lit, off, bezel }` the lamp's colours (roles
 * kept), `tints` `{ lit, off }` the same as hex, for the highlight's tinted stop. Returns
 * `{ layers, on }`, `on` the patches by layer name for while the button is on or pressed.
 */
export function batLampLayers({ name, box, colours, tints, zIndex, opacity = 1, uniqueName = (wanted) => wanted }) {
  const k = box.width / 10;
  const layers = [];
  const on = {};
  let depth = zIndex;
  const place = (x, y, w, h, grow = 0) => ({ x: box.x + x * k - grow / 2, y: box.y + y * k - grow / 2, width: w * k + grow, height: h * k + grow });
  // A closed shape `d` (view units) in its own box, and its stroke over it as an edge layer.
  const shape = (wanted, d, x, y, w, h, background, stroke = null, layerOpacity = opacity) => {
    const pathData = transformPathData(d, [1 / w, 0, 0, 1 / h, -x / w, -y / h]);
    const made = [createPartNode(uniqueName(wanted), {
      role: 'indicator', kind: 'path', zIndex: depth, opacity: layerOpacity,
      layout: pxBox(place(x, y, w, h), { x: 0, y: 0 }), meta: { pathData, closed: true }, sections: { Background: background },
    })];
    depth += 1;
    if (stroke) {
      const bw = stroke.width * k;
      made.push(createPartNode(uniqueName(`${wanted}Edge`), {
        role: 'indicator', kind: 'path', zIndex: depth, opacity: layerOpacity,
        layout: pxBox(place(x, y, w, h, bw), { x: 0, y: 0 }), meta: { pathData, closed: false },
        sections: { Background: edgeBackground(solidBackground('00000000'), bw) },
      }));
      made[1]._children.Background._children.Border.colour = stroke.colour;
      depth += 1;
    }
    layers.push(...made);
    return made;
  };
  const circle = (wanted, cx, cy, r, background, stroke) => shape(wanted, circlePath(cx, cy, r), cx - r, cy - r, 2 * r, 2 * r, background, stroke);
  // A line from (5, 15) to (5, y) of width `w` with round caps, moved by (dx, dy).
  const lever = (wanted, y, w, background, dx, dy, layerOpacity) => {
    const h = w / 2;
    const top = Math.min(15, y);
    const bottom = Math.max(15, y);
    const d = `M${r3(5 - h + dx)} ${r3(top + dy)} A${r3(h)} ${r3(h)} 0 0 1 ${r3(5 + h + dx)} ${r3(top + dy)} L${r3(5 + h + dx)} ${r3(bottom + dy)} A${r3(h)} ${r3(h)} 0 0 1 ${r3(5 - h + dx)} ${r3(bottom + dy)} Z`;
    return shape(wanted, d, 5 - h + dx, top - h + dy, w, bottom - top + w, background, null, layerOpacity);
  };
  const edge = (colour, width) => ({ colour, width });
  circle(`${name}Bezel`, 5, 15, 4.6, solidBackground(colours.bezel), edge('73000000', 0.6));
  circle(`${name}Hub`, 5, 15, 1.8, solidBackground('8C000000'));
  for (const lit of [false, true]) {
    const tip = lit ? 4.5 : 25.5;
    const ballY = lit ? 4 : 26;
    const colour = lit ? colours.lit : colours.off;
    const shown = lit ? 0 : opacity;
    const part = lit ? 'Up' : 'Down';
    const made = [
      ...lever(`${name}${part}Shadow`, tip, 3.4, solidBackground('80000000'), 0.6, 0.8, shown),
      ...lever(`${name}${part}Lever`, tip, 2.8, solidBackground(colour), 0, 0, shown),
    ];
    const ball = shape(`${name}${part}Ball`, circlePath(5, ballY, 3.4), 1.6, ballY - 3.4, 6.8, 6.8, solidBackground(colour), edge('73000000', 0.5), shown);
    // Its highlight: SVG's radial gradient over the ball's box, centred at 35 % 30 %, 70 % out.
    const gloss = shape(`${name}${part}Gloss`, circlePath(5, ballY, 3.4), 1.6, ballY - 3.4, 6.8, 6.8, gradientBackground({
      type: 'radial', edge: 0, centerX: 35, centerY: 30, radiusX: 70, radiusY: 70,
      stops: [{ color: 'D9FFFFFF', position: 0 }, { color: withAlpha(lit ? tints.lit : tints.off, 0.15), position: 45 }, { color: '59000000', position: 100 }],
    }), null, shown);
    for (const layer of [...made, ...ball, ...gloss]) on[layer.name] = { opacity: lit ? opacity : 0 };
  }
  return { layers, on, depth };
}

/** Where the device frame's units land in the control's box: `{ x, y, scale }`, and the caption. */
export function deviceFrameIn(width, height, caption, letterSpacing) {
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
    // Painted in SVG on the panel, which blends a gradient's colours and opacities apart.
    if (fill.gradientEnabled === true && Array.isArray(fill.gradient?.stops)) fill.gradient = { ...fill.gradient, stops: unpremultipliedStops(fill.gradient.stops) };
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
    let shadow = null;
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
    } else if (String(part.look ?? '') === 'rendered' && ['housing', 'guard', 'key', 'indicator'].includes(name)) {
      // Rendered (renderedDevicePartSpec): a turned body for a round part, else a block with the
      // part's corner, its image alone, moving as the part does; lit, it is the image in its lit colour.
      const radius = num(part?._children?.Background?._children?.Corners?.radius, 0);
      const shapeName = String(part.shape ?? 'rect');
      const round = shapeName === 'ellipse' && Math.abs(box.w - box.h) / Math.max(box.w, box.h) < 0.08;
      const corner = shapeName === 'ellipse' ? 100 : Math.min(100, (radius / (Math.min(box.w, box.h) / 2)) * 100);
      const placed = { x: frame.x + box.x * S, y: frame.y + box.y * S, width: box.w * S, height: box.h * S };
      layer = renderedLayer(named(name), styledPart, part, placed, origin, {
        shape: round ? 'round' : 'block', corner, height: 30, axis: box.w >= box.h ? 'x' : 'y', colour: fill.colour, zIndex: depth, opacity, role: name,
      });
      Object.assign(layer._children.Layout, pivotIn(placed, pivot), { rotation: own.turn });
      const on = {};
      if (String(part.activeColour ?? '').trim()) on['Background.Fill.colour'] = styledPart.activeColour ?? part.activeColour;
      if (part.activeOpacity != null) on.opacity = num(part.activeOpacity, 1);
      if (Object.keys(on).length) out.onPatches[layer.name] = on;
    } else {
      const radius = num(part?._children?.Background?._children?.Corners?.radius, 0);
      const outlineOf = (active) => devicePatternCells(String(part.pattern ?? 'solid'), 0, 0, box.w, box.h, { count: part.patternCount, rows: part.patternRows, cellWidth: part.cellWidth, cellHeight: part.cellHeight })
        .map((cell) => deviceShapePath(part.shape, cell.x, cell.y, cell.w, cell.h, deviceShapeOptions(part, radius, active)))
        .filter(Boolean)
        .join(' ');
      const d = outlineOf(false);
      if (!d) continue;
      // A drawn outline of its own for pressed or on (`shapePathOn`): the layer's path then, a state.
      const dOn = outlineOf(true);
      const pathOn = dOn !== d ? scalePathData(dOn, 1 / box.w, 1 / box.h) : '';
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
      // A drop shadow (the sculpted sets' keys): its outline again, `shadowOffset` % of the frame's
      // height lower, softened by `shadowBlur` %, in `shadowColour`, under it and moving with it, as
      // ButtonDeviceParts draws it inside the part's own motion.
      const shadowDy = (num(part.shadowOffset, 0) / 100) * H;
      const shadowBlur = (num(part.shadowBlur, 0) / 100) * H;
      if (shadowDy > 0 || shadowBlur > 0) {
        shadow = blurred(pathLayerOf(named(`${name}Shadow`), solidBackground(String(styledPart.shadowColour ?? part.shadowColour ?? '') || '99000000'), 0, true), (shadowBlur / 2) * S);
        shadow._children.Layout.y = r3(shadow._children.Layout.y + shadowDy * S);
        Object.assign(shadow._children.Layout, pivotIn(boxOfLayout(shadow._children.Layout, origin), pivot));
        if (part.activeOpacity != null) out.onPatches[shadow.name] = { opacity: num(part.activeOpacity, 1) };
      }
      layer = pathLayerOf(named(name), bw > 0 ? fillOnly : background, 0, true);
      if (bw > 0) extra = pathLayerOf(named(`${name}Edge`), edgeBackground(background, bw), bw, false);
      const on = {};
      if (String(part.activeColour ?? '').trim()) on['Background.Fill.colour'] = styledPart.activeColour ?? part.activeColour;
      if (part.activeOpacity != null) on.opacity = num(part.activeOpacity, 1);
      if (pathOn) on['meta.pathData'] = pathOn;
      if (Object.keys(on).length) out.onPatches[layer.name] = on;
      const edgeOn = { ...(part.activeOpacity != null ? { opacity: num(part.activeOpacity, 1) } : {}), ...(pathOn ? { 'meta.pathData': pathOn } : {}) };
      if (extra && Object.keys(edgeOn).length) out.onPatches[extra.name] = edgeOn;
      if (shadow && pathOn) out.onPatches[shadow.name] = { ...(out.onPatches[shadow.name] ?? {}), 'meta.pathData': pathOn };
    }
    for (const each of [shadow, layer, extra].filter(Boolean)) {
      each.zIndex = depth;
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
    // The caption is one line of svg text in the colour, family, size, weight and spacing the
    // control's text sets, and nothing else of it: lines run together, no case, slant, shift,
    // decoration or effect.
    text.content = words.replace(/\s+/g, ' ');
    text._children ??= {};
    text._children.Fill = { ...(text._children.Fill ?? {}), colour: text._children.Fill?.colour ?? captionColour ?? 'FF20282C' };
    text._children.Font = {
      ...(text._children.Font ?? {}), style: 'Normal', caseMode: 'normal', scriptMode: 'normal', baselineShift: 0, wordSpacing: 0,
      underline: false, strikethrough: false, overline: false,
    };
    text._children.Effects = deepClone(SECTION_DEFAULTS.Text?._children?.Effects ?? { outlineEnabled: false });
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
      text.content = String(frame.caption.text ?? '').replace(/\s+/g, ' ').trim();
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

/**
 * How many characters a counter's figures can have for a reading between `min` and `max` at
 * `precision` places (utils/meterParts.js meterFigures, `toFixed`): one more past each power of ten,
 * and one for a minus sign, each where `toFixed` first rounds up to it.
 */
export function figureLengths(min, max, precision) {
  const places = Math.max(0, Math.min(3, Math.round(Number(precision) || 0)));
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const half = 0.5 * 10 ** -places;
  const samples = [lo, hi];
  for (let k = 0; k <= 15; k += 1) {
    for (const sign of [1, -1]) {
      const edge = sign * (10 ** k - half);
      for (const v of [edge - 1e-9 * Math.max(1, Math.abs(edge)), edge + 1e-9 * Math.max(1, Math.abs(edge))]) samples.push(v);
    }
  }
  samples.push(-1e-12, 1e-12);
  const lengths = new Set();
  for (const v of samples) if (v >= lo && v <= hi) lengths.add(v.toFixed(places).length);
  return [...lengths].sort((a, b) => a - b);
}

/**
 * Why a meter drawn with device parts cannot become layers, or ''. Nothing such a meter draws is
 * refused now: counter digits (still, filling or lighting), shadows, a legend that shows the reading,
 * a fill in a pattern or a shape, the held peak and a clip lamp; coloured by the meter's zones by
 * position (each lit cell, each scale mark, a fill along its length, in any shape, outlined or not)
 * or by the reading's zone (a copy of its paint for each zone, stepped or blended, lit or see-through:
 * zoneLevelCopies). Kept as the place a new setting that layers cannot draw is named.
 */
export function meterDeviceLayersRefusal(resolved) {
  void resolved;
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
    // Painted in SVG on the panel, which blends a gradient's colours and opacities apart.
    const fill = background._children.Fill;
    if (fill.gradientEnabled === true && Array.isArray(fill.gradient?.stops)) fill.gradient = { ...fill.gradient, stops: unpremultipliedStops(fill.gradient.stops) };
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
  // Parts the meter's zones colour by the reading (`zoneColours` 'level'; 'position' on a part with no
  // positions of its own): their layers, given a copy for each zone after the parts are drawn.
  const zoneMarks = [];
  // Counter cells that fill or light (pattern 'digits'): one cell to a figure of the reading, so for
  // each count of figures the reading can have, the part laid out as that many columns, drawn as a
  // fill or a ladder is, its layers shown only while the reading has that many (`lengthGate`).
  const precision = Math.max(0, Math.min(3, Math.round(num(meter.valuePrecision, 0))));
  const entries = [];
  for (const name of drawn) {
    const part = geometry[name];
    const motion = String(part.motion ?? 'none');
    if (name !== 'legend' && String(part.pattern ?? 'solid') === 'digits' && (motion === 'fill' || motion === 'light')) {
      const lengths = figureLengths(num(meter.valueMin, 0), num(meter.valueMax, 1), precision);
      for (const length of lengths) {
        entries.push({
          name, label: lengths.length > 1 ? `${name}${length}fig` : name,
          part: { ...part, pattern: 'columns', patternCount: length, cellWidth: part.cellWidth ?? 92 },
          lengthGate: lengths.length > 1 ? { length, precision } : null,
        });
      }
      continue;
    }
    entries.push({ name, part, lengthGate: null });
  }
  // The layers each such entry adds carry its gate, so the zones' copies of them carry it too.
  let gated = null;
  const closeGate = () => {
    if (gated) for (const layer of out.parts.slice(gated.from)) layer.meta = { ...(layer.meta ?? {}), lengthGate: gated.gate };
    gated = null;
  };
  for (const { name, label = name, part, lengthGate } of entries) {
    closeGate();
    if (lengthGate) gated = { from: out.parts.length, gate: lengthGate };
    const styledPart = colours[name] ?? part;
    const motion = String(part.motion ?? 'none');
    const opacity = num(part.opacity, 1);
    // A part that shows the held peak, or a clip lamp, follows the peak the meter holds.
    const partSource = String(part.source ?? 'reading') === 'peak' || motion === 'clip' ? `channel.${channel}.peak` : source;
    const zoneMode = String(part.zoneColours ?? 'off');
    const scaled = ['ticks', 'arc'].includes(String(part.pattern ?? 'solid'));
    const byLevel = zoneMode === 'level' || (zoneMode === 'position' && !scaled && motion !== 'fill' && motion !== 'light');
    // The layers whose paint the reading's zone decides, and a lit layer's own level (`gate`).
    const mark = { name, source: partSource, paint: [] };
    if (byLevel) zoneMarks.push(mark);
    const fill = styledPart?._children?.Background?._children?.Fill ?? {};
    const textColour = fill.colour ?? 'FFFFFFFF';
    const rest = meterPartDrawing(name, part, { p: 0, meter });
    const box = rest.box;
    if (!(box.w > 0 && box.h > 0)) continue;
    const pivot = { x: box.x + (num(part.pivotX, 50) / 100) * box.w, y: box.y + (num(part.pivotY, 50) / 100) * box.h };
    const restTurn = num(part?._children?.Layout?.rotation, 0);
    // A rendered housing or clip lamp (renderedMeterPartSpec): its image alone, a turned body for a
    // round lamp, else a low block with the part's corner; drawn flat, as the panel draws it, when
    // the meter's zones colour it.
    const renderable = String(part.look ?? '') === 'rendered' && (name === 'housing' || name === 'lamp')
      && String(part.zoneColours ?? 'off') === 'off' && !rest.paths.some((path) => path.colour);
    const renderedOf = (layerName, colour, layerOpacity) => {
      const radius = num(part?._children?.Background?._children?.Corners?.radius, 0);
      const shapeName = String(part.shape ?? 'rect');
      const round = shapeName === 'ellipse' && Math.abs(box.w - box.h) / Math.max(box.w, box.h) < 0.08;
      const corner = shapeName === 'ellipse' ? 100 : Math.min(100, (radius / (Math.min(box.w, box.h) / 2)) * 100);
      const topLeft = at(box.x, box.y);
      const placed = { x: topLeft.x, y: topLeft.y, width: box.w * S, height: box.h * S };
      const layer = renderedLayer(named(layerName), styledPart, part, placed, origin, {
        shape: round ? 'round' : 'block', corner, height: name === 'housing' ? 12 : 30, axis: box.w >= box.h ? 'x' : 'y',
        colour, zIndex: depth, opacity: layerOpacity,
      });
      Object.assign(layer._children.Layout, pivotIn(placed, at(pivot.x, pivot.y)), { rotation: restTurn });
      return layer;
    };
    if (name === 'legend') {
      // Its own words, or the reading (Text Source 'value', as the counter writes it) or its
      // percentage, one text or one figure to a column (pattern 'digits'), as meterPartDrawing lays
      // them out: written by a Counter Figures binding, column by column for each count of figures.
      const textSource = String(part.textSource ?? 'fixed');
      const family = String(part.fontFamily ?? '').trim();
      const size = Math.max(1, num(part.fontSize, 10));
      const precision = Math.max(0, Math.min(3, Math.round(num(meter.valuePrecision, 0))));
      const figuresBinding = (layer, extra) => {
        out.bindings[`${layer.name}Text`] = {
          _type: 'Binding', name: `${layer.name}Text`, enabled: true, mapMode: 'figures', target: `Parts.${layer.name}.Text.content`,
          ...(textSource === 'percent'
            ? { source: `channel.${channel}.normalized`, multiplier: 100, precision: 0 }
            : { source: `channel.${channel}.raw`, multiplier: 1, precision }),
          ...extra,
        };
      };
      const baseline = box.y + box.h;
      if (String(part.pattern ?? 'solid') === 'digits') {
        const fixedText = textSource === 'fixed' ? String(part.legendText ?? '') : null;
        const lengths = fixedText !== null ? [fixedText.length]
          : textSource === 'percent' ? figureLengths(0, 100, 0) : figureLengths(num(meter.valueMin, 0), num(meter.valueMax, 1), precision);
        for (const length of lengths.filter((n) => n > 0)) {
          for (const cell of devicePatternCells('columns', box.x, box.y, box.w, box.h, { count: length, cellWidth: part.cellWidth ?? 92 })) {
            const pitch = cell.cols > 1 ? (box.w - cell.w) / (cell.cols - 1) : box.w;
            const point = at(cell.x + cell.w / 2, baseline);
            const layer = add(name, textLayer(`legend${lengths.length > 1 ? length : ''}Figure${cell.col}`, fixedText !== null ? fixedText[cell.col] : '',
              point.x, point.y, Math.min(size, pitch) * S, textColour, { family, opacity }));
            mark.paint.push({ layer, opacity });
            if (fixedText === null) figuresBinding(layer, { character: cell.col, ...(lengths.length > 1 ? { length } : {}) });
          }
        }
        continue;
      }
      if (textSource !== 'fixed') {
        const point = at(box.x + box.w / 2, baseline);
        const layer = add(name, textLayer('legend', '', point.x, point.y, size * S, textColour, { family, opacity }));
        figuresBinding(layer, {});
        mark.paint.push({ layer, opacity });
        continue;
      }
      for (const [i, t] of rest.texts.entries()) {
        const point = at(t.x, t.y);
        mark.paint.push({ layer: add(name, textLayer(`legend${i || ''}`, t.text, point.x, point.y, t.size * S, textColour, { family, opacity })), opacity });
      }
      continue;
    }
    // A counter's windows (pattern 'digits'): one cell to a figure of the reading, so as many as it
    // has figures; for each count, its windows, shown while the reading has that many.
    if (String(part.pattern ?? 'solid') === 'digits' && motion !== 'fill' && motion !== 'light') {
      const precision = Math.max(0, Math.min(3, Math.round(num(meter.valuePrecision, 0))));
      const lengths = figureLengths(num(meter.valueMin, 0), num(meter.valueMax, 1), precision);
      const radius = num(part?._children?.Background?._children?.Corners?.radius, 0);
      const { background, bw } = backgroundOf(styledPart, part);
      for (const length of lengths) {
        const d = devicePatternCells('columns', box.x, box.y, box.w, box.h, { count: length, cellWidth: part.cellWidth ?? 92 })
          .map((cell) => deviceShapePath(part.shape, cell.x, cell.y, cell.w, cell.h, deviceShapeOptions(part, radius)))
          .filter(Boolean)
          .join(' ');
        if (!d) continue;
        for (const [k, layer] of pathLayers(`${label}${lengths.length > 1 ? length : ''}`, d, box, background, { opacity, bw, pivot, rotation: restTurn }).entries()) {
          add(name, layer);
          // Shown only while the reading has that many figures (the gate after the zones' copies).
          if (lengths.length > 1) layer.meta = { ...(layer.meta ?? {}), lengthGate: { length, precision } };
          // Coloured by the reading's zone, its windows (not their outline) take the zone's colour.
          if (k === 0) mark.paint.push({ layer, opacity });
        }
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
        const d = deviceShapePath(part.shape, cell.x, cell.y, cell.w, cell.h, deviceShapeOptions(part, radius));
        if (!d) return;
        const cellBox = { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
        const base = backgroundOf(styledPart, part);
        // Lit, in its own colour; or, coloured by position, in the zone the cell sits in.
        const lit = backgroundOf(styledPart, part, zoneMode === 'position' ? meterZoneColour((index + 0.5) / count, meter) : litColour);
        // Lit, the cell stands where the part's lit offset moves it.
        const litBox = { ...cellBox, x: cellBox.x + offset.x, y: cellBox.y + offset.y };
        const litD = deviceShapePath(part.shape, litBox.x, litBox.y, litBox.w, litBox.h, deviceShapeOptions(part, radius));
        // A cell is lit when its level (its index over the count) is at or under the reading.
        for (const plain of pathLayers(`${label}${i}`, d, cellBox, base.background, { opacity, bw: base.bw })) {
          add(name, plain);
          out.bindings[`${plain.name}Dim`] = rangeBinding(`${plain.name}Dim`, partSource, `Parts.${plain.name}.opacity`, opacity, 0, t - 0.0005, t);
        }
        for (const [k, lighted] of pathLayers(`${label}${i}lit`, litD, litBox, lit.background, { opacity: 0, bw: lit.bw }).entries()) {
          add(name, lighted);
          out.bindings[`${lighted.name}Lit`] = rangeBinding(`${lighted.name}Lit`, partSource, `Parts.${lighted.name}.opacity`, 0, litOpacity, t - 0.0005, t);
          if (k === 0) mark.paint.push({ layer: lighted, gate: t, opacity: litOpacity });
        }
      });
      continue;
    }
    if (motion === 'fill' && zoneMode !== 'position' && (String(part.pattern ?? 'solid') !== 'solid' || String(part.shape ?? 'rect') !== 'rect')) {
      // A fill drawn in a pattern or a shape: its cells laid out across the area the fill has
      // reached, so each moves and grows straight with the reading (devicePatternCells is linear in
      // its area): each a layer, from where it stands at the start to where it stands full.
      const { background, bw } = backgroundOf(styledPart, part);
      const from = String(part.fillFrom ?? 'left');
      const areaAt = (r) => (from === 'bottom' ? { x: box.x, y: box.y + box.h * (1 - r), w: box.w, h: box.h * r }
        : from === 'top' ? { x: box.x, y: box.y, w: box.w, h: box.h * r }
          : from === 'right' ? { x: box.x + box.w * (1 - r), y: box.y, w: box.w * r, h: box.h }
            : { x: box.x, y: box.y, w: box.w * r, h: box.h });
      const pattern = String(part.pattern ?? 'solid');
      const options = { count: part.patternCount, rows: part.patternRows, cellWidth: part.cellWidth, cellHeight: part.cellHeight };
      const cellsAt = (r) => { const a = areaAt(r); return devicePatternCells(pattern, a.x, a.y, a.w, a.h, options); };
      const full = cellsAt(1);
      const half = cellsAt(0.5);
      const radius = num(part?._children?.Background?._children?.Corners?.radius, 0);
      const rect = String(part.shape ?? 'rect') === 'rect';
      full.forEach((cell, i) => {
        const start = { x: 2 * half[i].x - cell.x, y: 2 * half[i].y - cell.y, w: Math.max(0, 2 * half[i].w - cell.w), h: Math.max(0, 2 * half[i].h - cell.h) };
        const pxOf = (c) => { const p = at(c.x, c.y); return { x: p.x - bw / 2, y: p.y - bw / 2, width: c.w * S + bw, height: c.h * S + bw }; };
        const end = pxOf(cell);
        const begin = pxOf(start);
        const cellBackground = deepClone(background);
        let layer;
        if (rect) {
          cellBackground._children.Corners.radius = r3(radius * S);
          layer = createPartNode(named(`${label}${i}`), { role: 'fill', kind: 'roundedRectangle', zIndex: depth, opacity, layout: pxBox(end, origin), sections: { Background: cellBackground } });
        } else {
          const d = deviceShapePath(part.shape, 0, 0, cell.w, cell.h, deviceShapeOptions(part, radius));
          layer = createPartNode(named(`${label}${i}`), {
            role: 'fill', kind: 'path', zIndex: depth, opacity, layout: pxBox(end, origin),
            meta: { pathData: scalePathData(d, 1 / Math.max(0.001, cell.w), 1 / Math.max(0.001, cell.h)), closed: true }, sections: { Background: cellBackground },
          });
        }
        add(name, layer);
        mark.paint.push({ layer, opacity });
        for (const [key, a, b] of [['x', begin.x + origin.x, end.x + origin.x], ['y', begin.y + origin.y, end.y + origin.y], ['width', begin.width, end.width], ['height', begin.height, end.height]]) {
          if (Math.abs(a - b) > 1e-6) out.bindings[`${layer.name}${key}`] = rangeBinding(`${layer.name}${key}`, partSource, `Parts.${layer.name}.Layout.${key}`, a, b);
        }
      });
      continue;
    }
    if (motion === 'fill' && zoneMode === 'position') {
      // Coloured by position: the zones along the fill's own direction across its whole box, shown
      // only where the fill has reached (MeterDeviceParts' zoneFill). Each cell of it (one, for a
      // plain fill) is the box painted in that gradient, shown through a mask of the cell's shape
      // (a rectangle with the part's corner in pixels, or an ellipse) placed where the cell stands:
      // from where it starts to where it stands full, as the reading goes. Its outline, where it has
      // one, a rectangle growing over it.
      const { background, bw } = backgroundOf(styledPart, part);
      const from = String(part.fillFrom ?? 'left');
      const pattern = String(part.pattern ?? 'solid');
      const areaAt = (r) => (from === 'bottom' ? { x: box.x, y: box.y + box.h * (1 - r), w: box.w, h: box.h * r }
        : from === 'top' ? { x: box.x, y: box.y, w: box.w, h: box.h * r }
          : from === 'right' ? { x: box.x + box.w * (1 - r), y: box.y, w: box.w * r, h: box.h }
            : { x: box.x, y: box.y, w: box.w * r, h: box.h });
      const options = { count: part.patternCount, rows: part.patternRows, cellWidth: part.cellWidth, cellHeight: part.cellHeight };
      const cellsAt = (r) => { const a = areaAt(r); return devicePatternCells(pattern, a.x, a.y, a.w, a.h, options); };
      const full = cellsAt(1);
      const half = cellsAt(0.5);
      const topLeft = at(box.x, box.y);
      const exact = { x: topLeft.x, y: topLeft.y, width: box.w * S, height: box.h * S };
      const zones = meterZones(meter);
      const stops = [];
      zones.forEach((zone, i) => {
        stops.push({ color: zone.colour, position: r3(zone.from * 100) });
        if (meter.gradient === false && zones[i + 1]) stops.push({ color: zone.colour, position: r3(zones[i + 1].from * 100) });
      });
      const painted = solidBackground(zones[0]?.colour ?? 'FF39D98A');
      Object.assign(painted._children.Fill, { gradientEnabled: true, gradient: { type: 'linear', angle: { left: 90, right: 270, bottom: 0, top: 180 }[from] ?? 90, stops } });
      const shapeName = String(part.shape ?? 'rect');
      const radius = num(part?._children?.Background?._children?.Corners?.radius, 0);
      // The mask of a cell's shape: a rectangle's corner stays in pixels, an ellipse fills its box,
      // any other shape is its outline stretched to the cell, as a patterned fill's cells stretch.
      const maskOf = (cell) => (shapeName === 'rect' || shapeName === 'ellipse'
        ? cellMaskSrc(shapeName, radius * S)
        : pathMaskSrc(deviceShapePath(part.shape, 0, 0, cell.w, cell.h, deviceShapeOptions(part, radius)), cell.w, cell.h));
      const percent = (cell) => ({ x: ((cell.x - box.x) / box.w) * 100, y: ((cell.y - box.y) / box.h) * 100, width: (cell.w / box.w) * 100, height: (cell.h / box.h) * 100 });
      // Where each cell starts: cells move and grow straight with the area (devicePatternCells).
      const startOf = (cell, i) => ({ x: 2 * half[i].x - cell.x, y: 2 * half[i].y - cell.y, w: Math.max(0, 2 * half[i].w - cell.w), h: Math.max(0, 2 * half[i].h - cell.h) });
      full.forEach((cell, i) => {
        const end = percent(cell);
        const begin = percent(startOf(cell, i));
        const layer = add(name, createPartNode(named(full.length > 1 ? `${label}${i}` : label), {
          role: 'fill', kind: 'rectangle', zIndex: depth, opacity, layout: pxBox(exact, origin), sections: { Background: deepClone(painted) },
        }));
        layer.mask = { enabled: true, src: maskOf(cell), x: r3(end.x), y: r3(end.y), width: r3(end.width), height: r3(end.height), invert: false, linked: true };
        for (const key of ['x', 'y', 'width', 'height']) {
          if (Math.abs(begin[key] - end[key]) > 1e-6) out.bindings[`${layer.name}Mask${key}`] = rangeBinding(`${layer.name}Mask${key}`, partSource, `Parts.${layer.name}.mask.${key}`, begin[key], end[key]);
        }
      });
      // Its outline, where it has one: each cell's, over the fill, growing with the cell as a
      // patterned fill's cells do.
      if (bw > 0) {
        const edgeOnly = edgeBackground(background, bw);
        const pxOf = (c) => { const p = at(c.x, c.y); return { x: p.x - bw / 2, y: p.y - bw / 2, width: c.w * S + bw, height: c.h * S + bw }; };
        full.forEach((cell, i) => {
          const end = pxOf(cell);
          const begin = pxOf(startOf(cell, i));
          const edgeName = named(full.length > 1 ? `${label}${i}Edge` : `${label}Edge`);
          let edge;
          if (shapeName === 'rect') {
            edge = createPartNode(edgeName, { role: 'fill', kind: 'roundedRectangle', zIndex: depth, opacity, layout: pxBox(end, origin), sections: { Background: deepClone(edgeOnly) } });
            edge._children.Background._children.Corners.radius = r3(radius * S);
          } else {
            const d = deviceShapePath(part.shape, 0, 0, cell.w, cell.h, deviceShapeOptions(part, radius));
            edge = createPartNode(edgeName, {
              role: 'fill', kind: 'path', zIndex: depth, opacity, layout: pxBox(end, origin),
              meta: { pathData: scalePathData(d, 1 / Math.max(0.001, cell.w), 1 / Math.max(0.001, cell.h)), closed: true }, sections: { Background: deepClone(edgeOnly) },
            });
          }
          add(name, edge);
          for (const [key, a, b] of [['x', begin.x + origin.x, end.x + origin.x], ['y', begin.y + origin.y, end.y + origin.y], ['width', begin.width, end.width], ['height', begin.height, end.height]]) {
            if (Math.abs(a - b) > 1e-6) out.bindings[`${edge.name}${key}`] = rangeBinding(`${edge.name}${key}`, partSource, `Parts.${edge.name}.Layout.${key}`, a, b);
          }
        });
      }
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
      mark.paint.push({ layer, opacity });
      const lengthKey = from === 'left' || from === 'right' ? 'width' : 'height';
      out.bindings[`${layer.name}Grow`] = rangeBinding(`${layer.name}Grow`, partSource, `Parts.${layer.name}.Layout.${lengthKey}`, 0, full[lengthKey]);
      if (from === 'right' || from === 'bottom') {
        const posKey = from === 'right' ? 'x' : 'y';
        out.bindings[`${layer.name}Edge`] = rangeBinding(`${layer.name}Edge`, partSource, `Parts.${layer.name}.Layout.${posKey}`, layer._children.Layout[posKey] + full[lengthKey], layer._children.Layout[posKey]);
      }
      continue;
    }
    if (motion === 'clip') {
      // A clip lamp: its own look until the held peak reaches its level (`clipFrom`), then lit in its
      // lit colour and opacity, and held lit while the peak holds (meterParts' 'clip').
      const clipFrom = Math.max(0, Math.min(1, num(part.clipFrom, 0.9)));
      const radius = num(part?._children?.Background?._children?.Corners?.radius, 0);
      const d = devicePatternCells(String(part.pattern ?? 'solid'), box.x, box.y, box.w, box.h, {
        count: part.patternCount, rows: part.patternRows, cellWidth: part.cellWidth, cellHeight: part.cellHeight,
      }).map((cell) => deviceShapePath(part.shape, cell.x, cell.y, cell.w, cell.h, deviceShapeOptions(part, radius))).filter(Boolean).join(' ');
      if (d) {
        const litColour = String(styledPart.activeColour ?? part.activeColour ?? '').trim() || fill.colour;
        const litOpacity = part.activeOpacity != null ? num(part.activeOpacity, 1) : opacity;
        const base = backgroundOf(styledPart, part);
        const lit = backgroundOf(styledPart, part, litColour);
        for (const plain of renderable ? [renderedOf(name, fill.colour, opacity)] : pathLayers(name, d, box, base.background, { opacity, bw: base.bw, pivot, rotation: restTurn })) {
          add(name, plain);
          out.bindings[`${plain.name}Dim`] = rangeBinding(`${plain.name}Dim`, partSource, `Parts.${plain.name}.opacity`, opacity, 0, clipFrom - 0.0005, clipFrom);
        }
        for (const [k, lighted] of (renderable ? [renderedOf(`${label}Lit`, litColour, 0)] : pathLayers(`${label}Lit`, d, box, lit.background, { opacity: 0, bw: lit.bw, pivot, rotation: restTurn })).entries()) {
          add(name, lighted);
          out.bindings[`${lighted.name}Lit`] = rangeBinding(`${lighted.name}Lit`, partSource, `Parts.${lighted.name}.opacity`, 0, litOpacity, clipFrom - 0.0005, clipFrom);
          if (k === 0) mark.paint.push({ layer: lighted, gate: clipFrom, opacity: litOpacity });
        }
      }
      continue;
    }
    // A part that stands, swings or slides: its shadow, its marks or its shape, and a scale's numerals.
    // Its own paths in its paint and outline; those the meter's zones colour, each colour a layer with
    // no outline; and a scale's marks past Zone From in its lit colour (MeterDeviceParts' zoned, zone).
    const d = rest.paths.filter((path) => path.role === 'base' && !path.colour).map((path) => path.d).filter(Boolean).join(' ');
    const colouredGroups = [];
    for (const path of rest.paths.filter((each) => each.role === 'base' && each.colour && each.d)) {
      const group = colouredGroups.find((each) => each.colour === path.colour);
      if (group) group.d += ` ${path.d}`;
      else colouredGroups.push({ colour: path.colour, d: path.d });
    }
    const pastZoneD = rest.paths.filter((path) => path.role === 'zone').map((path) => path.d).filter(Boolean).join(' ');
    // Its drop shadow (the sculpted sets' cases): its outline again, `shadowOffset` % of the frame's
    // height lower, softened by `shadowBlur` %, in `shadowColour`, at full strength (MeterDeviceParts
    // draws it without the part's opacity), turning and sliding with it.
    const shadowDy = (num(part.shadowOffset, 0) / 100) * H;
    const shadowBlur = (num(part.shadowBlur, 0) / 100) * H;
    const baseD = rest.paths.filter((path) => path.role === 'base' && !path.colour).map((path) => path.d).filter(Boolean).join(' ');
    const shadows = [];
    if (!renderable && baseD && (shadowDy > 0 || shadowBlur > 0)) {
      for (const layer of pathLayers(`${label}Shadow`, translatePathData(baseD, 0, shadowDy), { ...box, y: box.y + shadowDy }, solidBackground(String(styledPart.shadowColour ?? part.shadowColour ?? '') || '99000000'), { opacity: 1, pivot, rotation: restTurn })) {
        shadows.push(blurred(layer, (shadowBlur / 2) * S));
      }
    }
    const standing = [];
    if (d) {
      const { background, bw } = backgroundOf(styledPart, part);
      standing.push(...shadows, ...(renderable ? [renderedOf(name, fill.colour, opacity)] : pathLayers(name, d, box, background, { opacity, bw, pivot, rotation: restTurn })));
    }
    colouredGroups.forEach((group, i) => {
      const [layer] = pathLayers(`${label}Colour${colouredGroups.length > 1 ? i : ''}`, group.d, box, solidBackground(group.colour), { opacity, pivot, rotation: restTurn });
      standing.push(layer);
      mark.paint.push({ layer, opacity });
    });
    if (pastZoneD) {
      const litColour = String(styledPart.activeColour ?? part.activeColour ?? '').trim() || fill.colour;
      standing.push(...pathLayers(`${label}Zone`, pastZoneD, box, solidBackground(litColour ?? 'FFFF3030'), { opacity, pivot, rotation: restTurn }));
    }
    if (standing.length) {
      for (const layer of standing) {
        layer.zIndex = depth;
        add(name, layer);
        if (motion === 'swing' && num(part.swing, 0)) {
          out.bindings[`${layer.name}Swing`] = rangeBinding(`${layer.name}Swing`, partSource, `Parts.${layer.name}.Layout.rotation`, restTurn, restTurn + num(part.swing, 0));
        }
        if (motion === 'slide') {
          const dx = (num(part.travelX, 0) / 100) * W * S;
          const dy = (num(part.travelY, 0) / 100) * H * S;
          if (dx) out.bindings[`${layer.name}SlideX`] = rangeBinding(`${layer.name}SlideX`, partSource, `Parts.${layer.name}.Layout.offsetX`, 0, dx);
          if (dy) out.bindings[`${layer.name}SlideY`] = rangeBinding(`${layer.name}SlideY`, partSource, `Parts.${layer.name}.Layout.offsetY`, 0, dy);
        }
      }
    }
    for (const [i, label] of rest.labels.entries()) {
      const point = at(label.x, label.y);
      add(name, textLayer(`${label}Numeral${i}`, label.text, point.x, point.y, label.size * S, textColour, {
        anchor: label.anchor ?? 'middle', baseline: 'central', family: String(part.fontFamily ?? '').trim(), opacity,
      }));
    }
  }

  closeGate();

  zoneLevelCopies(out, zoneMarks, meter, uniqueName);

  // A layer drawn for one count of figures shows only while the reading has that many: a Counter
  // Figures binding, applied last, adds nothing to its opacity while it has, and takes 1 off it while
  // it has not, which no opacity outlives.
  for (const layer of out.parts) {
    const gate = layer.meta?.lengthGate;
    if (!gate) continue;
    delete layer.meta.lengthGate;
    out.bindings[`${layer.name}Figures`] = addingBinding({
      _type: 'Binding', name: `${layer.name}Figures`, enabled: true, mapMode: 'figures', source: `channel.${channel}.raw`,
      target: `Parts.${layer.name}.opacity`, precision: gate.precision, length: gate.length, outputMin: -1, outputMax: 0,
    });
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

/**
 * A mask picture of a meter cell's shape at any size: a rectangle with a corner of `radius` pixels
 * (no view box, so the corner stays in pixels however the mask is sized), or an ellipse.
 */
function cellMaskSrc(shape, radius) {
  if (shape !== 'ellipse' && !(radius > 0)) return REVEAL_ALL_MASK_SRC;
  const body = shape === 'ellipse'
    ? "<ellipse cx='50%' cy='50%' rx='50%' ry='50%' fill='#fff'/>"
    : `<rect width='100%' height='100%' rx='${r3(radius)}' ry='${r3(radius)}' fill='#fff'/>`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'>${body}</svg>`)}`;
}

/** A mask picture of `d`, drawn in a `w` by `h` box, stretched to whatever size the mask is. */
function pathMaskSrc(d, w, h) {
  if (!d) return REVEAL_ALL_MASK_SRC;
  const body = `<path d='${d}' fill='#fff' fill-rule='evenodd'/>`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' viewBox='0 0 ${r3(w)} ${r3(h)}' preserveAspectRatio='none'>${body}</svg>`)}`;
}

/**
 * A meter part coloured by the reading's zone (`zoneColours` 'level'): each layer whose paint the zone
 * decides becomes a copy in each zone's colour. Stepped zones: the copy shows while the reading is in
 * its zone (and, for a lit cell or a clip lamp, at or past its own level), so one shows at a time.
 * Blended: the copies stand in order, each fading in across the span from the zone before it to its
 * own, which composites to the meter's blend of the two colours (meterFillColourAt). An opaque copy
 * hides those under it; a see-through one does not, so each copy also fades out under the next as
 * that one fades in, at the rate that leaves the two weighed as the blend weighs them (zoneFadeUnder).
 * A lit cell or a clip lamp, blended, keeps its copies hidden until the reading reaches its level.
 */
function zoneLevelCopies(out, marks, meter, uniqueName) {
  const zones = meterZones(meter);
  if (!marks.length || !zones.length) return;
  const stepped = meter?.gradient === false;
  for (const mark of marks) {
    for (const { layer, gate = null, opacity } of mark.paint) {
      const index = out.parts.indexOf(layer);
      if (index < 0) continue;
      const own = Object.entries(out.bindings).filter(([, binding]) => String(binding?.target ?? '').startsWith(`Parts.${layer.name}.`));
      // A lit layer's own lighting gives way to the zones' bands, which start no lower than its level,
      // or, blended, to the gate at its level.
      if (gate != null) for (const [key, binding] of own) if (binding.target === `Parts.${layer.name}.opacity`) delete out.bindings[key];
      const seeThrough = opacity < 1;
      const copies = [];
      zones.forEach((zone, k) => {
        const lo = stepped ? Math.max(zone.from, gate ?? 0) : (k === 0 ? 0 : zones[k - 1].from);
        const hi = zones[k + 1]?.from ?? 1.0001;
        if (stepped && lo >= hi) return;
        const copy = k === 0 ? layer : deepClone(layer);
        if (k > 0) copy.name = uniqueName(`${layer.name}Zone${k}`);
        const paint = copy._children.Text ? copy._children.Text._children.Fill : copy._children.Background._children.Fill;
        Object.assign(paint, { colour: zone.colour, ...(copy._children.Text ? {} : { solidEnabled: true, gradientEnabled: false }) });
        if (k > 0) {
          for (const [key, binding] of own) {
            if (gate != null && binding.target === `Parts.${layer.name}.opacity`) continue;
            const name = `${key}Zone${k}`;
            out.bindings[name] = { ...deepClone(binding), name, target: binding.target.replace(`Parts.${layer.name}.`, `Parts.${copy.name}.`) };
          }
        }
        const target = `Parts.${copy.name}.opacity`;
        if (stepped) {
          copy.opacity = 0;
          out.bindings[`${copy.name}InZone`] = { ...rangeBinding(`${copy.name}InZone`, mark.source, target, 0, opacity, lo, hi), band: true };
        } else {
          const under = seeThrough && zones[k + 1] != null && zones[k + 1].from > zone.from;
          // What the bindings that add to it start from: the first copy, its opacity; each other,
          // fading in over the span before its zone.
          if (k > 0) {
            copy.opacity = 0;
            out.bindings[`${copy.name}Blend`] = rangeBinding(`${copy.name}Blend`, mark.source, target, 0, opacity, lo, zone.from);
          } else if (gate != null || under) {
            copy.opacity = opacity;
            out.bindings[`${copy.name}Zone`] = rangeBinding(`${copy.name}Zone`, mark.source, target, opacity, opacity, 0, 1);
          }
          if (under) zoneFadeUnder(out, copy.name, mark.source, opacity, zone.from, zones[k + 1].from);
          // Lit at its level: nothing of it shows below.
          if (gate != null) out.bindings[`${copy.name}Gate`] = addingBinding(rangeBinding(`${copy.name}Gate`, mark.source, target, -1, 0, gate - 0.0005, gate));
        }
        copies.push(copy);
      });
      out.parts.splice(index + 1, 0, ...copies.filter((copy) => copy !== layer));
      // Each copy is the panel part's, so its interaction states reach it.
      const named = out.partNames[mark.name] ?? [];
      out.partNames[mark.name] = [...named, ...copies.filter((copy) => copy !== layer).map((copy) => copy.name)];
    }
  }
}

/**
 * A see-through zone copy (opacity `alpha`) fading out from `from` to `to` while the next one fades in
 * over it. With the next at alpha·s (s the share of the way), this one at alpha·(1 - s) / (1 - alpha·s)
 * leaves the pair as opaque as the part and weighed (1 - s) to s, as the meter blends the colours.
 * That curve, as adding bindings: straight pieces between points spaced evenly in opacity, more of
 * them the more opaque the part, so no colour strays more than about 2 % of the way between the zones'.
 */
function zoneFadeUnder(out, layerName, source, alpha, from, to) {
  const pieces = alpha <= 0.5 ? 4 : (alpha <= 0.8 ? 6 : 8);
  const shareAt = (a) => (alpha - a) / (alpha * (1 - a));
  let previous = from;
  for (let i = 1; i <= pieces; i += 1) {
    const next = from + (to - from) * shareAt(alpha * (1 - i / pieces));
    const name = `${layerName}Under${i}`;
    out.bindings[name] = addingBinding(rangeBinding(name, source, `Parts.${layerName}.opacity`, 0, -alpha / pieces, previous, next));
    previous = next;
  }
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

/**
 * Why a plain meter (editor/MeterRenderer.svelte: a bar, segments or an arc) cannot become layers, or
 * ''. Nothing is refused now; a bar on a track you can see through shows its fill through a mask.
 */
export function plainMeterLayersRefusal(resolved) {
  void resolved;
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
 * draws it (on a track you can see through, a mask that reveals it up to the reading); for segments, each segment plain until the reading reaches its middle, then lit in its
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
  // The peak the value holds (Peak Hold; interactionRuntime's `channel.<name>.peak`).
  const peakSource = `channel.${channel}.peak`;
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
      if (cfg.peakHold === true) {
        // Peak Hold marks the segment the held peak is in with an inset line in the peak colour,
        // under the lit segment, so a segment the reading lights shows no mark (MeterRenderer).
        const ring = solid('00000000');
        ring._children.Fill.solidEnabled = false;
        Object.assign(ring._children.Border, { enabled: true, thickness: 1, colour: styledCfg.peakColour ?? 'FFF2F2F2' });
        const mark = rectLayer(`segment${idx}peak`, box, ring, 0);
        out.bindings[`${mark.name}Peak`] = { ...rangeBinding(`${mark.name}Peak`, peakSource, `Parts.${mark.name}.opacity`, 0, 1, (idx + 0.5) / segments, (idx + 1.5) / segments), band: true };
      }
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
    const fillLayer = rectLayer('fill', track, gradientBackground);
    if (/^[0-9a-f]{8}$/i.test(String(trackColour)) && String(trackColour).slice(0, 2).toUpperCase() !== 'FF') {
      // A track you can see through would show a cover over the fill, so the fill shows only as far
      // as the reading through a mask instead, square at the reading, as the renderer's clip shows it.
      const fillName = fillLayer.name;
      fillLayer.mask = { enabled: true, src: REVEAL_ALL_MASK_SRC, x: 0, y: vertical ? 100 : 0, width: vertical ? 100 : 0, height: vertical ? 0 : 100, invert: false, linked: true };
      if (vertical) {
        out.bindings[`${fillName}MaskY`] = rangeBinding(`${fillName}MaskY`, source, `Parts.${fillName}.mask.y`, 100, 0);
        out.bindings[`${fillName}MaskHeight`] = rangeBinding(`${fillName}MaskHeight`, source, `Parts.${fillName}.mask.height`, 0, 100);
      } else {
        out.bindings[`${fillName}MaskWidth`] = rangeBinding(`${fillName}MaskWidth`, source, `Parts.${fillName}.mask.width`, 0, 100);
      }
    } else {
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
    // Peak Hold's marker: a 2 px line across the track at the held peak, shown while there is one.
    if (cfg.peakHold === true) {
      const box = vertical
        ? { x: track.x, y: track.y + track.height - 1, width: track.width, height: 2 }
        : { x: track.x - 1, y: track.y, width: 2, height: track.height };
      const marker = add(createPartNode(named('peak'), {
        role: 'custom', kind: 'rectangle', zIndex: depth, opacity: 0, layout: pxBox(box, origin), sections: { Background: solidBackground(styledCfg.peakColour ?? 'FFF2F2F2') },
      }));
      const [key, from, to] = vertical ? ['y', box.y + origin.y, box.y + origin.y - track.height] : ['x', box.x + origin.x, box.x + origin.x + track.width];
      out.bindings[`${marker.name}Move`] = rangeBinding(`${marker.name}Move`, peakSource, `Parts.${marker.name}.Layout.${key}`, from, to);
      out.bindings[`${marker.name}Shown`] = rangeBinding(`${marker.name}Shown`, peakSource, `Parts.${marker.name}.opacity`, 0, 1, 0, 0.0005);
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

  // The track behind, only where there are no segments: segments are drawn each in the track's
  // colour, with the gaps between them showing what is behind the meter (MeterRenderer).
  if (segments <= 0) arcOf('track', 0, 1, trackColour, { cap: num(cfg.rounded, 3) > 0 ? 'round' : 'butt' });
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
  // Peak Hold's marker: a 2-unit line across the arc at the held peak, shown while there is one.
  if (cfg.peakHold === true) {
    const peakSource = source.replace(/\.normalized$/, '.peak');
    const marker = add(radialBar(named('peak'), {
      centre, angle: designer(0), from: (r - stroke / 2) * fit, to: (r + stroke / 2) * fit, width: 2 * fit, round: false,
      colour: styledCfg.peakColour ?? 'FFF2F2F2', opacity: 0, zIndex: depthOf(), origin,
    }));
    out.bindings[`${marker.name}Turn`] = rangeBinding(`${marker.name}Turn`, peakSource, `Parts.${marker.name}.Layout.rotation`, designer(0), designer(1));
    out.bindings[`${marker.name}Shown`] = rangeBinding(`${marker.name}Shown`, peakSource, `Parts.${marker.name}.opacity`, 0, 1, 0, 0.0005);
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
  // The knob's own display scale, by the panel's rule: a bound cleared to null is no bound
  // (utils/valueDisplayScale.js), where Number(null) would have made it 0 and every value read 0.
  const scale = sliderDisplayScale(behavior);
  if (scale) {
    format.displayMin = scale.displayMin;
    format.displayMax = scale.displayMax;
  }
  if (behavior?.showSign === true) format.showSign = true;
  // How the synth writes the value (a frequency, a pan, a note, a table: utils/parameterDisplay.js),
  // as the knob's readout wrote it: the channel's display text is the same (formatChannelValue).
  if (formatBehaviorDisplay(behavior, getSliderMin(behavior), getSliderMax(behavior), getSliderMin(behavior)) !== null) {
    format.display = {};
    for (const key of ['displayFormat', 'displayTable', 'displayMin', 'displayMax', 'precision', 'displayMiddleC']) {
      if (behavior[key] !== undefined && behavior[key] !== null && behavior[key] !== '') format.display[key] = deepClone(behavior[key]);
    }
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
