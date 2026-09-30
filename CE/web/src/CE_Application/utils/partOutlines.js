/**
 * partOutlines.js — every component part as exact geometry, for combining shapes.
 *
 * A boolean operation is only as good as its operands' outlines: a hole cut with a slightly different
 * corner, or a stroke taken as its centreline, is visibly wrong. So each outline here is derived from
 * the same numbers, by the same rules, as InteractivePartRenderer and BackgroundRenderer draw the part:
 *
 *   box kinds          rectangle, roundedRectangle, image parts and anything the renderer draws as a
 *                      box: its Corners — rounded outward (with the CSS rule that scales radii down when
 *                      they overlap), rounded inward, chamfer, notch, straight, one per corner — from
 *                      the fill clip path builder the renderer itself uses (utils/cornerPaths.js)
 *   circle/ring/capsule  the 9999px-radius stadium CSS makes of them
 *   polygons, Pen paths  the points inset by half the stroke, united with the stroke's own band
 *                      (round joins), which is what the SVG polygon paints
 *   open Pen paths     the stroke expanded to an area — round joins, round caps, the renderer's width
 *   line               the stroke along the box's middle, round caps (the SVG overflows the box)
 *   arcTrack / ringArc the dashed circle stroke as a ring sector with butt or round ends, centred in
 *                      the box as `viewBox` + meet centres it
 *   valueArc           the conic-gradient sector under its radial mask and the element's 50% radius,
 *                      including CSS's farthest-corner sizing of that mask
 *   text               the glyphs (utils/textOutline.js), plus the box when the part also paints one
 *   boolean            a combined shape inside another: its own result, recursively
 *
 * Then the part's Layout scale and rotation are applied about its pivot, as the CSS transform is.
 *
 * Some parts have no fixed outline and are refused by name, with the reason: a slider carried as a
 * part, an envelope display, an animated waveform icon — each is drawn live by its own renderer.
 *
 * Geometry is Paper.js (headless) and paperjs-offset for stroke expansion, both loaded on first use.
 */
import { partFrame } from './customDesignSurfaceGeometry.js';
import { polygonPoints } from './shapeGeometry.js';
import { hasCompoundPath, pathIsClosed, pathVectorPoints } from './penPath.js';
import { normalizeCorner } from './cornerNormalization.js';
import { buildFillClipPath } from './cornerPaths.js';
import { cornersNeedClipPath } from './plainFillCSS.js';
import { numberOr } from './primitives.js';
import { textOutline } from './textOutline.js';

export const BOOLEAN_KIND = 'boolean';

const STADIUM_KINDS = new Set(['circle', 'ring', 'capsule']);

let geometryPromise = null;

/**
 * One headless Paper.js scope and the offset library, for the page's lifetime. Both import the bare
 * `paper` specifier, so they share one set of classes (vite.config.js aliases it to the core build).
 */
export function loadGeometry() {
  geometryPromise ??= Promise.all([import('paper'), import('paperjs-offset')]).then(([paperModule, offsetModule]) => {
    const paper = paperModule.default ?? paperModule;
    const scope = new paper.PaperScope();
    scope.setup(new scope.Size(1, 1));
    const PaperOffset = offsetModule.PaperOffset ?? offsetModule.default?.PaperOffset;
    return { scope, PaperOffset };
  });
  return geometryPromise;
}

const kindOf = (part) => String(part?.kind ?? 'rectangle').toLowerCase();
const rendererOf = (part) => String(part?.meta?.renderer ?? '').toLowerCase();

export function isBooleanGroup(part) {
  return kindOf(part) === BOOLEAN_KIND;
}

function isArcTrack(part) {
  return ['arctrack', 'ringarc'].includes(kindOf(part)) || ['arctrack', 'ringarc'].includes(rendererOf(part));
}

function isValueArc(part) {
  return kindOf(part) === 'valuearc' || rendererOf(part) === 'valuearc';
}

/** Why this part has no outline to combine, or ''. */
export function whyNoOutline(part) {
  if (!part) return 'not found';
  const kind = kindOf(part);
  const renderer = rendererOf(part);
  if (kind === 'slidercontrol' || part?.meta?.sliderControl) return 'a knob or slider carried as a part is drawn live by the slider renderer, with no fixed outline';
  if (kind === 'envelopepath' || renderer === 'envelopepath') return 'an envelope display is drawn live from its values, with no fixed outline';
  if (kind === 'waveformicon' || renderer === 'waveformicon') return 'a waveform icon is drawn (and animated) live, with no fixed outline';
  if (kind === 'path' && !hasCompoundPath(part) && !pathVectorPoints(part)) return 'a path with too few points';
  return '';
}

// --- Paint facts the outline depends on ----------------------------------------------------------

function borderOf(part) {
  return part?._children?.Background?._children?.Border ?? null;
}

function fillOf(part) {
  return part?._children?.Background?._children?.Fill ?? null;
}

/** The stroke width the vector renderer paints for a polygon / path / line (0 when none). */
function vectorStrokeWidth(part) {
  const border = borderOf(part);
  return border?.enabled === true && numberOr(border?.thickness, 0) > 0 ? Math.max(1, numberOr(border.thickness, 1)) : 0;
}

function alphaOf(hex) {
  const text = String(hex ?? '');
  return text.length === 8 ? parseInt(text.slice(0, 2), 16) : 255;
}

/** Whether a part with text also paints its box (a filled or bordered background behind the text). */
export function paintsBox(part) {
  const background = part?._children?.Background;
  if (!background) return false;
  const fill = fillOf(part) ?? {};
  const legacy = background.mode === 'none' ? 'overlay' : (background.mode || 'solid');
  const solid = fill.solidEnabled !== undefined ? fill.solidEnabled !== false : legacy === 'solid';
  if (solid && fill.solidMuted !== true && alphaOf(fill.colour ?? 'FF3A3A3A') > 0) return true;
  if (fill.gradientEnabled === true && fill.gradientMuted !== true) return true;
  if (fill.imageEnabled === true && fill.imageMuted !== true && fill.imageSrc) return true;
  if (fill.overlayEnabled === true && fill.overlayMuted !== true && fill.overlaySrc) return true;
  const border = borderOf(part);
  return border?.enabled === true && numberOr(border?.thickness, 0) > 0;
}

// --- Box shapes ----------------------------------------------------------------------------------

/**
 * The box as the renderer's fill is shaped: a clip path for chamfer / notch / inward corners (built by
 * the renderer's own function), else CSS border-radius — whose radii CSS scales down together when two
 * on one side add up to more than that side.
 */
export function boxPathData(corners, width, height) {
  if (width <= 0 || height <= 0) return '';
  const at = (pos) => normalizeCorner(corners, pos);
  const tl = at('tl'); const tr = at('tr'); const br = at('br'); const bl = at('bl');
  if (corners && cornersNeedClipPath(corners)) {
    const css = buildFillClipPath({ tl, tr, br, bl }, width, height);
    return css.slice(css.indexOf("'") + 1, css.lastIndexOf("'"));
  }
  const r = (c) => ((c.radius > 0 && c.style === 'rounded' && c.direction !== 'inward') ? c.radius : 0);
  let [a, b, c, d] = [r(tl), r(tr), r(br), r(bl)];
  const f = Math.min(
    1,
    a + b > 0 ? width / (a + b) : 1,
    d + c > 0 ? width / (d + c) : 1,
    a + d > 0 ? height / (a + d) : 1,
    b + c > 0 ? height / (b + c) : 1,
  );
  [a, b, c, d] = [a * f, b * f, c * f, d * f];
  const W = width;
  const H = height;
  const arc = (rad, x, y) => (rad > 0 ? `A ${rad} ${rad} 0 0 1 ${x} ${y}` : '');
  return [
    `M ${a} 0`, `L ${W - b} 0`, arc(b, W, b), `L ${W} ${H - c}`, arc(c, W - c, H),
    `L ${d} ${H}`, arc(d, 0, H - d), `L 0 ${a}`, arc(a, a, 0), 'Z',
  ].filter(Boolean).join(' ');
}

function stadiumPathData(width, height) {
  return boxPathData({ radius: 9999, style: 'rounded', linked: true }, width, height);
}

// --- Strokes as areas ----------------------------------------------------------------------------

function strokeArea(geo, path, width, { cap = 'round', join = 'round' } = {}) {
  if (!path || width <= 0) return null;
  const hasLength = (path.children ?? [path]).some((child) => child.length > 1e-6);
  if (!hasLength) return null;
  return geo.PaperOffset.offsetStroke(path, width / 2, { cap, join, insert: false });
}

/** A ring sector, the arc stroke of radius r and thickness t from angle a0 sweeping `sweep` degrees. */
function ringSector(scope, cx, cy, r, t, a0, sweep, cap) {
  const outer = r + t / 2;
  const inner = Math.max(0, r - t / 2);
  if (sweep >= 359.99) {
    const ring = new scope.Path.Circle({ center: [cx, cy], radius: outer, insert: false });
    if (inner <= 0) return ring;
    const hole = new scope.Path.Circle({ center: [cx, cy], radius: inner, insert: false });
    return ring.subtract(hole, { insert: false });
  }
  const rad = (deg) => (deg * Math.PI) / 180;
  const at = (radius, deg) => new scope.Point(cx + radius * Math.cos(rad(deg)), cy + radius * Math.sin(rad(deg)));
  // Where a round cap bulges to: half the thickness past the arc's end, along its tangent.
  const capTip = (deg, outward) => at(r, deg).add(new scope.Point(Math.cos(rad(deg + outward)), Math.sin(rad(deg + outward))).multiply(t / 2));
  const a1 = a0 + sweep;
  const mid = a0 + sweep / 2;
  const path = new scope.Path({ insert: false, closed: true });
  path.moveTo(at(outer, a0));
  path.arcTo(at(outer, mid), at(outer, a1));
  if (cap === 'round') path.arcTo(capTip(a1, 90), at(inner, a1));
  else path.lineTo(at(inner, a1));
  if (inner > 0) path.arcTo(at(inner, mid), at(inner, a0));
  else path.lineTo(new scope.Point(cx, cy));
  if (cap === 'round') path.arcTo(capTip(a0, -90), at(outer, a0));
  path.closePath();
  return path;
}

// --- Per-kind outlines in the part's own box (0..w, 0..h) ------------------------------------------

function fromPathData(scope, data, fillRule = 'nonzero') {
  if (!data) return null;
  const item = new scope.CompoundPath({ pathData: data, insert: false });
  item.fillRule = fillRule;
  return item;
}

function unitPathInBox(scope, data, left, top, width, height) {
  const item = fromPathData(scope, data, 'evenodd');
  item?.transform(new scope.Matrix(width, 0, 0, height, left, top));
  return item;
}

function unite(items) {
  const present = items.filter((item) => item && !item.isEmpty());
  if (!present.length) return null;
  return present.slice(1).reduce((sum, item) => sum.unite(item, { insert: false }), present[0]);
}

async function localOutline(geo, part, width, height, context) {
  const { scope } = geo;
  const kind = kindOf(part);

  if (isBooleanGroup(part)) {
    return context.groupOutline(part, width, height);
  }

  if (isArcTrack(part)) {
    const arc = part?.meta?.arcTrack ?? part?.meta?.ringArc ?? {};
    const border = borderOf(part);
    const size = Math.max(1, Math.min(width, height));
    const t = Math.max(1, Math.min(size / 2, numberOr(arc.thickness ?? border?.thickness, 1)));
    const r = Math.max(0.5, size / 2 - t / 2);
    const sweep = Math.max(0, Math.min(360, numberOr(arc.sweepAngle, 0)));
    const ccw = String(arc.direction ?? 'cw').trim().toLowerCase() === 'ccw';
    const start = numberOr(arc.startAngle, -135);
    const rendered = ccw ? start - sweep : start;
    const scale = Math.min(width, height) / size;
    const cx = width / 2;
    const cy = height / 2;
    if (sweep <= 0) return null;
    return ringSector(scope, cx, cy, r * scale, t * scale, rendered - 90, Math.min(sweep, 359.99), arc.cap === 'round' ? 'round' : 'butt');
  }

  if (isValueArc(part)) {
    const arc = part?.meta?.valueArc ?? {};
    const size = Math.max(1, Math.min(width, height));
    const t = Math.max(1, Math.min(size / 2, numberOr(arc.thickness, 1)));
    const value = Math.max(0, Math.min(1, numberOr(arc.value, 0)));
    const sweep = Math.max(0, Math.min(360, numberOr(arc.sweepAngle, 0)));
    const start = numberOr(arc.startAngle, -135);
    const hasRange = arc.startValue !== undefined || arc.endValue !== undefined;
    const from = hasRange ? Math.max(0, Math.min(1, numberOr(arc.startValue, 0))) : 0;
    const to = hasRange ? Math.max(from, Math.min(1, numberOr(arc.endValue, from))) : value;
    const filled = Math.max(0.001, sweep * Math.max(0, to - from));
    // CSS: a circle radial-gradient sizes to the farthest corner; its % stops are of that radius.
    const ray = Math.hypot(width / 2, height / 2);
    const outerR = ray / 2 + 1;
    const innerR = Math.max(0, ray / 2 - t);
    const mid = (outerR + innerR) / 2;
    const sector = ringSector(scope, width / 2, height / 2, mid, outerR - innerR, start + sweep * from - 90, Math.min(filled, 360), 'butt');
    const ellipse = new scope.Path.Ellipse({ rectangle: [0, 0, width, height], insert: false });
    return sector.intersect(ellipse, { insert: false });
  }

  if (part?._children?.Text) {
    const text = await textOutline(part, width, height);
    let glyphs = text.pathData ? fromPathData(scope, text.pathData, 'nonzero') : null;
    if (glyphs) {
      glyphs.reorient(true, true);
      glyphs = glyphs.unite(new scope.Path({ insert: false }), { insert: false });
      if (text.fakeBoldOutset > 0) glyphs = geo.PaperOffset.offset(glyphs, text.fakeBoldOutset, { join: 'miter', insert: false });
      const clip = new scope.Path.Rectangle({ rectangle: [text.clip.x, text.clip.y, text.clip.width, text.clip.height], insert: false });
      glyphs = glyphs.intersect(clip, { insert: false });
    }
    const box = paintsBox(part) ? fromPathData(scope, boxPathData(part?._children?.Background?._children?.Corners, width, height)) : null;
    return unite([box, glyphs]);
  }

  // The vector renderer's branches, in its order: line, compound path, open path, polygon.
  if (kind === 'line') {
    const border = borderOf(part);
    const lineWidth = border?.enabled === true && numberOr(border?.thickness, 0) > 0 ? Math.max(1, numberOr(border.thickness, 1)) : 2;
    const centre = new scope.Path({ segments: [[0, height / 2], [width, height / 2]], insert: false });
    return strokeArea(geo, centre, lineWidth);
  }

  const strokeWidth = vectorStrokeWidth(part);
  if (hasCompoundPath(part)) {
    const open = part?.meta?.closed === false;
    const sw = open && strokeWidth === 0 ? 2 : strokeWidth;
    const inset = sw / 2;
    const shape = unitPathInBox(scope, part.meta.pathData, inset, inset, Math.max(0.001, width - 2 * inset), Math.max(0.001, height - 2 * inset));
    if (open) return strokeArea(geo, shape, sw);
    return unite([shape, strokeArea(geo, shape, sw)]);
  }

  const points = polygonPoints(kind) ?? pathVectorPoints(part);
  if (points) {
    const open = kind === 'path' && !pathIsClosed(part);
    const sw = open && strokeWidth === 0 ? 2 : strokeWidth;
    const inset = sw / 2;
    const w = Math.max(1, width - inset * 2);
    const h = Math.max(1, height - inset * 2);
    const path = new scope.Path({
      segments: points.map(([x, y]) => [inset + x * w, inset + y * h]),
      closed: !open,
      insert: false,
    });
    if (open) return strokeArea(geo, path, sw);
    return unite([path, strokeArea(geo, path, sw)]);
  }

  if (STADIUM_KINDS.has(kind)) return fromPathData(scope, stadiumPathData(width, height));

  return fromPathData(scope, boxPathData(part?._children?.Background?._children?.Corners, width, height));
}

/**
 * The part's outline in its parent's coordinates (the component face, `parentWidth` × `parentHeight`),
 * turned and scaled as the renderer's CSS transform turns and scales it. Null when it has no area.
 *
 * `context.groupOutline(part, w, h)` resolves a nested combined shape (booleanGroups.js supplies it).
 */
export async function partOutline(geo, part, parentWidth, parentHeight, context = {}) {
  const frame = partFrame(part, parentWidth, parentHeight);
  if (!(frame.width > 0) || !(frame.height > 0)) return null;
  let item = await localOutline(geo, part, frame.width, frame.height, context);
  if (!item || item.isEmpty()) return null;
  item.translate(new geo.scope.Point(frame.left, frame.top));
  const layout = part?._children?.Layout ?? {};
  const pivot = new geo.scope.Point(
    frame.left + frame.width * numberOr(layout.pivotX, 50) / 100,
    frame.top + frame.height * numberOr(layout.pivotY, 50) / 100,
  );
  const scale = Math.max(0.01, numberOr(layout.scale, 1));
  if (Math.abs(scale - 1) > 1e-6) item.scale(scale, pivot);
  const rotation = numberOr(layout.rotation, 0);
  if (Math.abs(rotation) > 1e-6) item.rotate(rotation, pivot);
  return item;
}
