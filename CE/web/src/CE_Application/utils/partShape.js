// partShape.js — how a custom component's layer is drawn, from its kind and meta: an arc, a round
// shape, a line, a polygon, a combined outline, or a box. editor/InteractivePartRenderer.svelte draws
// by it, and the designer's look bar asks it which paint fields draw anything on a layer
// (layerPaintFields), so the two cannot disagree. It lived in the renderer's module script.

import { polygonPoints } from './shapeGeometry.js';
import { hasCompoundPath, pathIsClosed, pathVectorPoints } from './penPath.js';
import { isBooleanGroup } from './booleanGroups.js';

function drawnAs(part, ...names) {
  return names.includes(String(part?.kind ?? '').toLowerCase())
    || names.includes(String(part?.meta?.renderer ?? '').toLowerCase());
}

/** How `part` is drawn: which of the renderer's branches it takes. */
export function partShape(part) {
  const kind = String(part?.kind ?? '').trim().toLowerCase();
  const rendersArcTrack = drawnAs(part, 'arctrack', 'ringarc');
  // Flat vector polygons (triangle, star, hexagon, …) render as a single SVG
  // <polygon> using the part's fill + border, instead of the CSS background.
  // A `path` part (the designer's Pen) carries its own points; see utils/penPath.js.
  const polygonVerts = polygonPoints(part?.kind) ?? pathVectorPoints(part);
  const rendersLine = kind === 'line';
  // A combined or smoothed shape (utils/partBooleans.js): SVG path data in 0..1 of the box, with curves,
  // holes and islands, so it cannot be a point list.
  const compoundPathData = hasCompoundPath(part) ? part.meta.pathData : '';
  // A combined shape (utils/booleanGroups.js) and a closed compound path paint through the outline
  // pipeline — every fill layer, border style and effect, on their true shape. An OPEN compound path
  // (a smoothed open Pen path) has no inside and is still a stroke, drawn by the vector branch.
  const rendersBooleanGroup = isBooleanGroup(part);
  const rendersOutline = rendersBooleanGroup || (!!compoundPathData && part?.meta?.closed !== false);
  return {
    rendersValueArc: drawnAs(part, 'valuearc'),
    rendersArcTrack,
    rendersEnvelopePath: drawnAs(part, 'envelopepath'),
    rendersWaveformIcon: drawnAs(part, 'waveformicon'),
    usesSimpleBackground: !!part?._children?.Background && !rendersArcTrack && ['circle', 'ring', 'capsule'].includes(kind),
    polygonVerts,
    rendersOpenPath: !!polygonVerts && String(part?.kind ?? '') === 'path' && !pathIsClosed(part),
    rendersLine,
    compoundPathData,
    rendersBooleanGroup,
    rendersOutline,
    rendersVectorShape: !!polygonVerts || rendersLine || (!!compoundPathData && !rendersOutline),
  };
}

/**
 * Which of the look bar's paint fields draw anything on this layer: `{ fill, gradient, stroke, corners }`.
 * The Component Designer review (item 14) found options offered where they do not apply. A round
 * shape (ellipse, ring, capsule) is drawn fully round in one solid colour, so Corners and Gradient
 * do nothing on it; a polygon fills in one solid colour and has no corners; a line or an open path
 * has no inside, so it has a stroke only; an arc is drawn from its own Arc settings (the Display
 * tab), so no paint field draws on it. A box, the rest, takes all four. A combined shape takes every
 * fill and stroke but no corners.
 */
export function layerPaintFields(part) {
  const shape = partShape(part);
  if (shape.rendersArcTrack) return { fill: false, gradient: false, stroke: false, corners: false };
  if (shape.rendersLine || shape.rendersOpenPath || (shape.compoundPathData && !shape.rendersOutline)) {
    return { fill: false, gradient: false, stroke: true, corners: false };
  }
  if (shape.rendersOutline) return { fill: true, gradient: true, stroke: true, corners: false };
  if (shape.usesSimpleBackground || shape.rendersVectorShape) return { fill: true, gradient: false, stroke: true, corners: false };
  return { fill: true, gradient: true, stroke: true, corners: true };
}
