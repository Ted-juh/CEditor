/**
 * svgComponentImport.js — a drawing from a vector editor, made a component of vector layers.
 *
 * The SVG panel importer (utils/svgPanelImport.js) makes a panel: the artwork one picture behind
 * controls placed on it. This makes the drawing itself the control: every shape a layer of a custom
 * component, still a vector, so its colours, gradient, stroke, size and position stay editable in the
 * Component Designer. Illustrator, Inkscape, Affinity Designer, Figma and Sketch all write SVG.
 *
 * One thing is made a picture: a turning layer drawn at several angles ("pointer shadow at 27"), each
 * angle a picture of itself as the file draws it, so the set is one part of frames mixed exactly as
 * it turns (utils/artworkComponent.js), not vectors faded against each other.
 *
 *   rect, circle, ellipse, line, polyline, polygon, path   a path layer (kind 'path', `meta.pathData`
 *                                                          in 0..1 of its box: utils/penPath.js),
 *                                                          with every transform applied to its points
 *   fill, stroke, opacity, fill-opacity, stroke-opacity    the layer's fill, border and opacity, from
 *                                                          attributes, `style` and the document's
 *                                                          class rules (Illustrator writes those),
 *                                                          inherited down groups as SVG inherits them
 *   linearGradient, radialGradient                         the layer's gradient, re-expressed in its
 *                                                          box (stops, colours, their opacity)
 *   text                                                   a text layer: its words, size, colour, face
 *   image with a data: source                              a picture layer
 *
 * What moves is said by the names (utils/artworkComponent.js): a shape or group named "pointer"
 * turns with the value, "fader" slides, "lamp" lights. Names come from Inkscape's labels,
 * Illustrator's layer names (`data-name`, `id`) and a `<title>`, as the panel importer reads them.
 *
 * Reported, not guessed: a clip path or mask (the shape is drawn whole), a pattern fill, an image
 * that is a link to a file, `<use>` of something that is not a shape, and an unknown element.
 *
 * Pure: text in, `{ ok, component, kind, layers, warnings }` out. The menu command is
 * stores/artworkComponentActions.js.
 */
import { parseXml } from '../../../../../tools/ctrlr-import/xml.mjs';
import { documentFrame, objectName, parseTransform, withoutSvgPrefix } from './svgPanelImport.js';
import { modelBounds, parsePathData, serializePathData } from './bezierPath.js';
import { createPartNode } from './customComponentFactory.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { deepClone } from './deepClone.js';
import { artworkRole, buildArtworkComponent, drawnAtAngle, nameWords, uniqueLayerName } from './artworkComponent.js';

const IDENTITY = [1, 0, 0, 1, 0, 0];
// More layers than a component stays quick to edit with (detailed artwork makes a few hundred; a PDF
// page of a document's text and rules, tens of thousands): the import stops and says so.
const MAX_LAYERS = 2000;
const TOO_MANY = Symbol('too many layers');
const SKIPPED = new Set(['defs', 'clipPath', 'mask', 'symbol', 'metadata', 'title', 'desc', 'style', 'script',
  'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker', 'sodipodi:namedview', 'namedview', 'foreignObject']);
const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']);
// Inherited as SVG inherits them; opacity is not, it multiplies down the tree.
const INHERITED = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'visibility',
  'font-size', 'font-family', 'font-weight', 'text-anchor', 'display', 'color'];
const CSS_BLEND_MODES = new Set(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'plus-lighter']);
// CSS's named colours, all of them (SVG takes the CSS list).
const NAMED = Object.fromEntries(('aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 '
  + 'black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 '
  + 'chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b '
  + 'darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b darkolivegreen 556b2f '
  + 'darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f '
  + 'darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 '
  + 'dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 '
  + 'goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 '
  + 'ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 '
  + 'lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a '
  + 'lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 '
  + 'limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 '
  + 'mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 '
  + 'midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 '
  + 'olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee '
  + 'palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 '
  + 'rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 '
  + 'seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa '
  + 'springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 '
  + 'white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32').split(' ').reduce((pairs, word, i, all) => (i % 2 ? pairs : [...pairs, [word, all[i + 1]]]), []));

function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
const apply = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
const num = (value, fallback = 0) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

/** Every class rule's declarations, as class → { property: value }. Plain class selectors only. */
function classRules(root) {
  const rules = new Map();
  const visit = (node) => {
    if (node.name === 'style') {
      const pattern = /([^{}]+)\{([^}]*)\}/g;
      let match;
      while ((match = pattern.exec(node.text ?? ''))) {
        const declarations = declarationsOf(match[2]);
        for (const selector of match[1].split(',')) {
          const name = selector.trim().match(/^\.([A-Za-z0-9_-]+)$/);
          if (name) rules.set(name[1], { ...(rules.get(name[1]) ?? {}), ...declarations });
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return rules;
}

function declarationsOf(text) {
  const out = {};
  for (const piece of String(text ?? '').split(';')) {
    const at = piece.indexOf(':');
    if (at > 0) out[piece.slice(0, at).trim().toLowerCase()] = piece.slice(at + 1).trim();
  }
  return out;
}

/** A node's own style: presentation attributes, then class rules, then `style`, as CSS orders them. */
function ownStyle(node, classes) {
  const attributes = node.attributes ?? {};
  const style = {};
  for (const property of [...INHERITED, 'opacity', 'stop-color', 'stop-opacity']) {
    if (attributes[property] != null) style[property] = String(attributes[property]).trim();
  }
  for (const name of String(attributes.class ?? '').split(/\s+/).filter(Boolean)) Object.assign(style, classes.get(name) ?? {});
  Object.assign(style, declarationsOf(attributes.style));
  return style;
}

/** A colour as RRGGBB, or null for none, or undefined when it is not one this reads (a pattern). */
/**
 * A paint's colour as `{ rgb, alpha }` (rgb as six hex digits): a name, #rgb, #rgba, #rrggbb,
 * #rrggbbaa, rgb() and rgba(), hsl() and hsla(), and `currentColor` (`current`, the element's color).
 * null for none; undefined for one this does not read.
 */
function readColour(value, current = '') {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'transparent') return null;
  if (raw === 'currentcolor') return current && String(current).trim().toLowerCase() !== 'currentcolor' ? readColour(current) : { rgb: '000000', alpha: 1 };
  if (NAMED[raw]) return { rgb: NAMED[raw], alpha: 1 };
  const hex = raw.match(/^#([0-9a-f]{3,8})$/)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? hex.split('').map((c) => c + c).join('') : hex;
    return { rgb: full.slice(0, 6), alpha: full.length === 8 ? parseInt(full.slice(6), 16) / 255 : 1 };
  }
  const fn = raw.match(/^(rgba?|hsla?)\(\s*([^)]*)\)$/);
  if (!fn) return undefined;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return undefined;
  const number = (v, scale) => (v.endsWith('%') ? (Number.parseFloat(v) / 100) * scale : Number.parseFloat(v));
  const alpha = parts[3] != null ? Math.max(0, Math.min(1, number(parts[3], 1))) : 1;
  let rgb;
  if (fn[1].startsWith('rgb')) rgb = parts.slice(0, 3).map((v) => number(v, 255));
  else {
    const h = ((Number.parseFloat(parts[0]) % 360) + 360) % 360;
    const sat = Math.max(0, Math.min(1, number(parts[1], 1)));
    const light = Math.max(0, Math.min(1, number(parts[2], 1)));
    const a = sat * Math.min(light, 1 - light);
    const f = (n) => { const k = (n + h / 30) % 12; return (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255; };
    rgb = [f(0), f(8), f(4)];
  }
  if (rgb.some((v) => !Number.isFinite(v)) || !Number.isFinite(alpha)) return undefined;
  return { rgb: rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''), alpha };
}

/** A paint's colour as six hex digits; null for none, undefined for one this does not read. */
function parseColour(value, current = '') {
  const read = readColour(value, current);
  return read ? read.rgb : read;
}

/** The alpha a paint's colour carries itself (rgba(), hsla(), #rrggbbaa): 1 for any other. */
const colourAlpha = (value, current = '') => readColour(value, current)?.alpha ?? 1;

const argb = (rgb, alpha = 1) => `${Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')}${rgb}`.toUpperCase();
const opacityOf = (value, fallback = 1) => {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  const n = text.endsWith('%') ? Number.parseFloat(text) / 100 : Number.parseFloat(text);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

// --- shapes as path data, in their own user space --------------------------------------------------

function shapePathData(node) {
  const a = node.attributes ?? {};
  switch (node.name) {
    case 'rect': {
      const x = num(a.x); const y = num(a.y); const w = num(a.width); const h = num(a.height);
      if (!(w > 0 && h > 0)) return '';
      let rx = a.rx != null ? num(a.rx) : (a.ry != null ? num(a.ry) : 0);
      let ry = a.ry != null ? num(a.ry) : rx;
      rx = Math.min(Math.max(0, rx), w / 2);
      ry = Math.min(Math.max(0, ry), h / 2);
      if (!rx || !ry) return `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
      return `M${x + rx} ${y} H${x + w - rx} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`
        + ` H${x + rx} A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
    }
    case 'circle': case 'ellipse': {
      const cx = num(a.cx); const cy = num(a.cy);
      const rx = node.name === 'circle' ? num(a.r) : num(a.rx);
      const ry = node.name === 'circle' ? num(a.r) : num(a.ry);
      if (!(rx > 0 && ry > 0)) return '';
      return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    }
    case 'line':
      return `M${num(a.x1)} ${num(a.y1)} L${num(a.x2)} ${num(a.y2)}`;
    case 'polyline': case 'polygon': {
      const n = String(a.points ?? '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      if (n.length < 4) return '';
      const pairs = [];
      for (let i = 0; i + 1 < n.length; i += 2) pairs.push(`${n[i]} ${n[i + 1]}`);
      return `M${pairs.join(' L')}${node.name === 'polygon' ? ' Z' : ''}`;
    }
    case 'path':
      return String(a.d ?? '');
    default:
      return '';
  }
}

function transformModel(model, m) {
  const point = (p) => (p ? apply(m, p.x, p.y) : null);
  return model.map((subpath) => ({
    closed: subpath.closed,
    nodes: subpath.nodes.map((node) => ({ ...point(node), in: point(node.in), out: point(node.out) })),
  }));
}

function normalizeModel(subpaths, box) {
  const w = box.width || 1;
  const h = box.height || 1;
  const unit = (p) => (p ? { x: (p.x - box.x) / w, y: (p.y - box.y) / h } : null);
  return subpaths.map((subpath) => ({
    closed: subpath.closed,
    nodes: subpath.nodes.map((node) => ({ ...unit(node), in: unit(node.in), out: unit(node.out) })),
  }));
}

// --- gradients ----------------------------------------------------------------------------------------

function gradientIndex(root) {
  const index = new Map();
  const visit = (node) => {
    if ((node.name === 'linearGradient' || node.name === 'radialGradient') && node.attributes?.id) index.set(node.attributes.id, node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return index;
}

/** A gradient's attribute, followed through `href` as SVG does, and its stops from the first that has any. */
function gradientAttribute(node, name, index, depth = 0) {
  if (!node || depth > 8) return undefined;
  if (node.attributes?.[name] != null) return node.attributes[name];
  const href = String(node.attributes?.href ?? node.attributes?.['xlink:href'] ?? '').replace(/^#/, '');
  return href ? gradientAttribute(index.get(href), name, index, depth + 1) : undefined;
}

function gradientStops(node, index, classes, depth = 0) {
  if (!node || depth > 8) return [];
  const stops = (node.children ?? []).filter((child) => child.name === 'stop');
  if (stops.length) {
    // Each offset at least the one before it, as SVG places stops (missing or unreadable is 0).
    let previous = 0;
    return stops.map((stop) => {
      const style = ownStyle(stop, classes);
      const paint = style['stop-color'] ?? '#000000';
      const colour = parseColour(paint, style.color) ?? '000000';
      const offset = String(stop.attributes?.offset ?? style.offset ?? '0').trim();
      const position = offset.endsWith('%') ? Number.parseFloat(offset) : Number.parseFloat(offset) * 100;
      previous = Math.max(previous, Math.max(0, Math.min(100, Number.isFinite(position) ? position : 0)));
      return { color: argb(colour, opacityOf(style['stop-opacity']) * colourAlpha(paint, style.color)), position: round(previous, 1) };
    });
  }
  const href = String(node.attributes?.href ?? node.attributes?.['xlink:href'] ?? '').replace(/^#/, '');
  return href ? gradientStops(index.get(href), index, classes, depth + 1) : [];
}

/**
 * An SVG gradient in the layer's box, as the fill's gradient: the CSS angle and the stops placed along
 * CSS's gradient line, which runs corner to corner through the box's centre, where SVG's runs from
 * (x1, y1) to (x2, y2). The shape's own transform is applied to the gradient's points too.
 */
function gradientFill(node, index, classes, shapeBox, docBox, matrix) {
  const stops = gradientStops(node, index, classes);
  if (stops.length < 2) return null;
  const userSpace = gradientAttribute(node, 'gradientUnits', index) === 'userSpaceOnUse';
  const g = parseTransform(gradientAttribute(node, 'gradientTransform', index));
  const length = (value, of, fallback) => {
    const text = String(value ?? fallback);
    return text.endsWith('%') ? (Number.parseFloat(text) / 100) * (userSpace ? of : 1) : num(text, 0);
  };
  // A point of the gradient, in the document: through the box (objectBoundingBox) or the user
  // space, then its own transform, then the shape's.
  const toDoc = (x, y) => {
    const local = apply(g, x, y);
    const inShape = userSpace ? local : { x: shapeBox.x + local.x * shapeBox.width, y: shapeBox.y + local.y * shapeBox.height };
    return userSpace ? apply(matrix, inShape.x, inShape.y) : { x: docBox.x + (inShape.x - shapeBox.x) * (docBox.width / (shapeBox.width || 1)), y: docBox.y + (inShape.y - shapeBox.y) * (docBox.height / (shapeBox.height || 1)) };
  };
  if (node.name === 'radialGradient') {
    const cx = length(gradientAttribute(node, 'cx', index), shapeBox.width, '50%');
    const cy = length(gradientAttribute(node, 'cy', index), shapeBox.height, '50%');
    const r = length(gradientAttribute(node, 'r', index), Math.hypot(shapeBox.width, shapeBox.height) / Math.SQRT2, '50%');
    const c = toDoc(cx, cy);
    const edgeX = toDoc(cx + r, cy);
    const edgeY = toDoc(cx, cy + r);
    return {
      type: 'radial',
      centerX: round(((c.x - docBox.x) / (docBox.width || 1)) * 100, 1),
      centerY: round(((c.y - docBox.y) / (docBox.height || 1)) * 100, 1),
      radiusX: round((Math.hypot(edgeX.x - c.x, edgeX.y - c.y) / (docBox.width || 1)) * 100, 1),
      radiusY: round((Math.hypot(edgeY.x - c.x, edgeY.y - c.y) / (docBox.height || 1)) * 100, 1),
      edge: 0,
      stops,
    };
  }
  const p1 = toDoc(length(gradientAttribute(node, 'x1', index), shapeBox.width, '0%'), length(gradientAttribute(node, 'y1', index), shapeBox.height, '0%'));
  const p2 = toDoc(length(gradientAttribute(node, 'x2', index), shapeBox.width, '100%'), length(gradientAttribute(node, 'y2', index), shapeBox.height, '0%'));
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (!dx && !dy) return null;
  // CSS: 0deg points up, 90deg right; its line through the centre, long enough to reach the corners.
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const dir = { x: Math.sin((angle * Math.PI) / 180), y: -Math.cos((angle * Math.PI) / 180) };
  const lineLength = Math.abs(docBox.width * dir.x) + Math.abs(docBox.height * dir.y) || 1;
  const start = { x: docBox.x + docBox.width / 2 - (dir.x * lineLength) / 2, y: docBox.y + docBox.height / 2 - (dir.y * lineLength) / 2 };
  const along = (offset) => {
    const p = { x: p1.x + dx * offset, y: p1.y + dy * offset };
    return round((((p.x - start.x) * dir.x + (p.y - start.y) * dir.y) / lineLength) * 100, 1);
  };
  return {
    type: 'linear',
    angle: round(((angle % 360) + 360) % 360, 1),
    edge: 0,
    stops: stops.map((stop) => ({ ...stop, position: along(stop.position / 100) })),
  };
}

// --- layers -------------------------------------------------------------------------------------------

function background(fill, stroke) {
  const section = deepClone(SECTION_DEFAULTS.Background);
  const f = section._children.Fill;
  f.colour = fill.colour;
  f.solidEnabled = true;
  if (fill.gradient) {
    f.gradientEnabled = true;
    f.gradient = fill.gradient;
    f.gradientOpacity = 100;
    // The gradient is the paint; the solid under it shows only through its own transparency.
    f.solidEnabled = false;
  }
  if (fill.picture) {
    // A pattern: drawn once, as a picture over the shape's box, and clipped to its outline.
    Object.assign(f, { solidEnabled: false, imageEnabled: true, imageSrc: fill.picture, imageFit: 'stretch', imageOpacity: 100 });
  }
  const b = section._children.Border;
  b.enabled = !!stroke;
  if (stroke) {
    b.colour = stroke.colour;
    b.thickness = stroke.width;
    if (stroke.gradient) {
      // A gradient outline, straight across the shape as SVG draws it.
      Object.assign(b, { fillSolid: false, fillGradient: true, gradient: stroke.gradient, gradientFlow: 'across' });
    }
  }
  section._children.Corners.radius = 0;
  return section;
}

/** The area an outline encloses, closed as a fill closes it (from its points and handles), in px². */
function enclosedArea(model) {
  let total = 0;
  for (const subpath of model) {
    const points = [];
    const nodes = subpath.nodes ?? [];
    nodes.forEach((node, i) => {
      points.push(node);
      const next = nodes[i + 1];
      if (next) { if (node.out) points.push(node.out); if (next.in) points.push(next.in); }
    });
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    total += Math.abs(area) / 2;
  }
  return total;
}

function blendEffects(mode) {
  const effects = deepClone(SECTION_DEFAULTS.Effects);
  effects._children.Blend.mode = mode;
  return effects;
}

const matrixText = (m) => `matrix(${m.map((v) => round(v, 6)).join(' ')})`;

function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [1, 0, 0, 1, 0, 0];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

function svgPicture(svg) {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
/**
 * Read `text` and plan the component. Never throws: `{ ok: false, error }` says what to change.
 * `{ ok, name, width, height, component, kind, report, layers, warnings }`.
 *
 * `files` maps a linked picture's href to its data URL (the command reads them from beside the file);
 * `geometry` (utils/partOutlines.js loadGeometry) lets a clipped shape be cut to its clip path and
 * stay one vector, where without it the clip is the layer's mask.
 */
export function planSvgComponentImport(text, { fileName = '', files = {}, geometry = null } = {}) {
  const source = withoutSvgPrefix(String(text ?? '').replace(/^\uFEFF/, ''));
  let root;
  try {
    root = parseXml(source, { offsets: true, doctypeSubset: 'skip' });
  } catch (error) {
    return { ok: false, error: `This is not an SVG file CEditor can read (${error?.message ?? error}).` };
  }
  if (root?.name !== 'svg') return { ok: false, error: 'This file has no <svg> element at its root.' };
  const frame = documentFrame(root);
  if (!frame) return { ok: false, error: 'The drawing has no size: give the <svg> a width and height, or a viewBox.' };

  const classes = classRules(root);
  const gradients = gradientIndex(root);
  // Ids by kind: a file may give a gradient and a shape the same id ("cap"), and a fill means the
  // gradient, a <use> the shape.
  const ids = new Map();
  const defs = { paint: new Map(), clipPath: new Map(), mask: new Map() };
  const indexIds = (node) => {
    const id = node.attributes?.id;
    if (id) {
      if (node.name === 'linearGradient' || node.name === 'radialGradient' || node.name === 'pattern') defs.paint.set(id, node);
      else if (node.name === 'clipPath') defs.clipPath.set(id, node);
      else if (node.name === 'mask') defs.mask.set(id, node);
      else if (!ids.has(id)) ids.set(id, node);
    }
    for (const child of node.children ?? []) indexIds(child);
  };
  indexIds(root);

  // The document's definitions, carried into a picture made from part of it (a mask, a clip, a
  // pattern, a turning layer drawn at an angle) as far as it refers to them, so what it uses is there:
  // gradients, patterns, filters, clip paths, masks, symbols, markers, and those they refer to in
  // turn; the style rules always. Only those it refers to: a file with thousands of clip paths (a PDF
  // page of them) carried them all into every mask, thousands of times over, and never finished.
  const DEFINITIONS = new Set(['linearGradient', 'radialGradient', 'pattern', 'style', 'filter', 'clipPath', 'mask', 'symbol', 'marker']);
  const definitionText = new Map();
  const styleTexts = [];
  const gatherDefinitions = (node) => {
    if (DEFINITIONS.has(node.name) && Number.isFinite(node.start) && Number.isFinite(node.end)) {
      const text = source.slice(node.start, node.end);
      if (node.name === 'style') styleTexts.push(text);
      else if (node.attributes?.id && !definitionText.has(node.attributes.id)) definitionText.set(node.attributes.id, text);
      return;
    }
    for (const child of node.children ?? []) gatherDefinitions(child);
  };
  gatherDefinitions(root);
  const REFERENCE = /url\(\s*["']?#([^)"'\s]+)["']?\s*\)|href\s*=\s*["']#([^"']+)["']/g;
  /** The definitions `content` refers to, and those they refer to, as markup. */
  const definitionsFor = (content) => {
    const wanted = new Set();
    const queue = [content];
    while (queue.length) {
      for (const match of queue.pop().matchAll(REFERENCE)) {
        const id = match[1] ?? match[2];
        if (wanted.has(id) || !definitionText.has(id)) continue;
        wanted.add(id);
        queue.push(definitionText.get(id));
      }
    }
    return styleTexts.join('') + [...wanted].map((id) => definitionText.get(id)).join('');
  };
  /** A picture of `content` (in document pixels) over `box`, for a mask or a fill. */
  const picture = (box, content) => svgPicture(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`
    + ` width="${round(Math.max(1, box.width))}" height="${round(Math.max(1, box.height))}" viewBox="${round(box.x, 3)} ${round(box.y, 3)} ${round(Math.max(1e-3, box.width), 3)} ${round(Math.max(1e-3, box.height), 3)}"`
    + ` preserveAspectRatio="none"><defs>${definitionsFor(content)}</defs>${content}</svg>`);

  // Turning layers drawn at several angles ("pointer shadow at -27", "... at 0", "... at 27"): each
  // becomes a picture of itself, cut from the file as SVG draws it, so that the set is one part of
  // frames mixed exactly as it turns (utils/artworkComponent.js, utils/imageFrames.js). Kept as
  // vectors they could only be faded against each other, and a shadow or a multiply would show by a
  // quarter more half way between two angles. The sets: their names' angles, by what they are of.
  const angleSets = new Map();
  const findAngles = (node, names, depth = 0) => {
    if (!node?.name || depth > 64 || SKIPPED.has(node.name)) return;
    const name = objectName(node);
    const chain = name ? [name, ...names] : names;
    const at = name ? drawnAtAngle(name) : null;
    if (at && artworkRole(chain) === 'turns') {
      const key = nameWords(at.base).join(' ');
      if (!angleSets.has(key)) angleSets.set(key, new Set());
      angleSets.get(key).add(at.angle);
      return;
    }
    for (const child of node.children ?? []) findAngles(child, chain, depth + 1);
  };
  findAngles(root, []);
  const drawnAsFrame = (name, chain) => {
    const at = drawnAtAngle(name);
    return !!at && artworkRole(chain) === 'turns' && (angleSets.get(nameWords(at.base).join(' '))?.size ?? 0) >= 2;
  };
  let measuring = 0;

  const layers = [];
  const taken = new Set();
  const warnings = [];
  const noted = new Map();
  const note = (key, text) => { if (!noted.has(key)) noted.set(key, new Set()); noted.get(key).add(text); };
  const refOf = (value) => String(value ?? '').match(/^url\(\s*["']?#([^)"'\s]+)["']?\s*\)/)?.[1] ?? '';

  /**
   * The clips and masks a layer sits under, outermost first: `{ kind: 'clip' | 'mask', id, matrix }`,
   * the matrix the one their element is drawn with. Each becomes part of the layer's mask, or, for a
   * plain filled shape under one clip and nothing else, cuts the shape itself.
   */
  const maskContent = (stack, box) => {
    // The innermost first, wrapped outward: each group masks what is inside it.
    let content = `<rect x="${round(box.x - 1, 3)}" y="${round(box.y - 1, 3)}" width="${round(box.width + 2, 3)}" height="${round(box.height + 2, 3)}" fill="#fff"/>`;
    // The clip or mask is evaluated in its element's own space; the inner group undoes that space,
    // so what it masks stays where it is in the document.
    for (const entry of [...stack].reverse()) {
      const attribute = entry.kind === 'clip' ? 'clip-path' : 'mask';
      content = `<g transform="${matrixText(entry.matrix)}" ${attribute}="url(#${entry.id})"><g transform="${matrixText(invert(entry.matrix))}">${content}</g></g>`;
    }
    return content;
  };
  const applyMasks = (part, box, stack) => {
    if (!stack.length) return;
    part.mask = { enabled: true, src: picture(box, maskContent(stack, box)), x: 0, y: 0, width: 100, height: 100, invert: false };
  };

  /** A clip path's region in the document, as path data, or '' (for Paper.js to cut a shape to). */
  const clipRegion = (entry) => {
    const clip = defs.clipPath.get(entry.id);
    if (!clip || String(clip.attributes?.clipPathUnits ?? '') === 'objectBoundingBox') return '';
    const own = multiply(entry.matrix, parseTransform(clip.attributes?.transform));
    const pieces = [];
    for (const child of clip.children ?? []) {
      if (!SHAPES.has(child.name)) return '';
      const data = shapePathData(child);
      if (!data) continue;
      const model = transformModel(parsePathData(data), multiply(own, parseTransform(child.attributes?.transform)));
      pieces.push(serializePathData(model, 4));
    }
    return pieces.join(' ');
  };

  // The elements being drawn, outermost first: a <use> of one of them is a loop, which SVG does not
  // draw. And a cap on the walk, for a file whose <use>s fan out without end.
  const drawing = new Set();
  let visits = 0;
  const visit = (node, matrix, inherited, opacity, names, stack, depth = 0) => {
    visits += 1;
    if (layers.length > MAX_LAYERS || visits > MAX_LAYERS * 100) throw TOO_MANY;
    if (!node?.name || depth > 64 || SKIPPED.has(node.name)) return;
    const style = { ...inherited };
    const own = ownStyle(node, classes);
    for (const property of INHERITED) if (own[property] != null && own[property] !== 'inherit') style[property] = own[property];
    // A layer switched off in the file it came from (utils/pdfArtwork.js marks one so): its parts come
    // in hidden, as a hidden Photoshop layer does (often the lit or pressed look), not dropped.
    const switchedOff = node.attributes?.['data-ceditor-hidden'] === 'true';
    if ((own.display === 'none' && !switchedOff) || style.visibility === 'hidden') return;
    if (switchedOff) style.switchedOff = true;
    const m = multiply(matrix, parseTransform(node.attributes?.transform));
    const alpha = opacity * opacityOf(own.opacity);
    const name = objectName(node);
    // An unnamed shape is called after its group ("body", "body_2"), then after what it is.
    const label = name || names[0] || node.name;
    const chain = name ? [name, ...names] : names;
    // Its own clip and mask join those of its groups.
    const clipId = refOf(node.attributes?.['clip-path'] ?? own['clip-path']);
    const maskId = refOf(node.attributes?.mask ?? own.mask);
    const here = [...stack];
    if (clipId) {
      if (defs.clipPath.has(clipId)) here.push({ kind: 'clip', id: clipId, matrix: m });
      else note('missing', label);
    }
    if (maskId) {
      if (defs.mask.has(maskId)) here.push({ kind: 'mask', id: maskId, matrix: m });
      else note('missing', label);
    }

    if (!measuring && name && drawnAsFrame(name, chain) && Number.isFinite(node.start) && Number.isFinite(node.end)
      && !/<use\b/.test(source.slice(node.start, node.end))) {
      angleLayer(node, { matrix, inherited, opacity, names, stack, depth, own, label, chain, switchedOff, hidden: !!style.switchedOff });
      return;
    }
    // Not drawn here: a filter (a blur, a drop shadow), and a group's blend mode (a shape's own is
    // its layer's); said so.
    if (!measuring && refOf(node.attributes?.filter ?? own.filter)) note('filter', label);
    const blend = String(own['mix-blend-mode'] ?? node.attributes?.['mix-blend-mode'] ?? '').trim();
    if (node.name === 'g' || node.name === 'svg' || node.name === 'a' || node.name === 'switch') {
      if (!measuring && blend && blend !== 'normal') note('blend', label);
      drawing.add(node);
      try {
        for (const child of node.children ?? []) visit(child, m, style, alpha, chain, here, depth + 1);
      } finally {
        drawing.delete(node);
      }
      return;
    }
    if (node.name === 'use') {
      const target = ids.get(String(node.attributes?.href ?? node.attributes?.['xlink:href'] ?? '').replace(/^#/, ''));
      if (!target) { note('use', label); return; }
      if (drawing.has(target)) { note('loop', label); return; }
      const shifted = multiply(m, [1, 0, 0, 1, num(node.attributes?.x), num(node.attributes?.y)]);
      drawing.add(target);
      try {
        visit(target.name === 'symbol' ? { ...target, name: 'g' } : target, shifted, style, alpha, chain, here, depth + 1);
      } finally {
        drawing.delete(target);
      }
      return;
    }
    const before = layers.length;
    if (SHAPES.has(node.name)) shapeLayer(node, m, style, alpha, label, chain, here, CSS_BLEND_MODES.has(blend) && blend !== 'normal' ? blend : '');
    else if (node.name === 'text') textLayer(node, m, style, alpha, label, chain, here);
    else if (node.name === 'image') imageLayer(node, m, alpha, label, chain, here);
    else note('unknown', `<${node.name}>`);
    if (style.switchedOff) for (let i = before; i < layers.length; i += 1) layers[i].part.visible = false;
  };

  /**
   * A turning layer drawn at one of several angles, as a picture: the element as the file has it,
   * under its groups' transform and the paint they hand down, over the box its shapes cover (and
   * the room a filter takes round them). Its groups' clips and masks are its mask; its own are in it.
   */
  const angleLayer = (node, { matrix, inherited, opacity, names, stack, depth, own, label, chain, switchedOff, hidden }) => {
    // Where it draws: the layers it would have made, measured and taken back.
    const mark = layers.length;
    measuring += 1;
    try {
      visit(node, matrix, inherited, opacity, names, stack, depth);
    } finally {
      measuring -= 1;
    }
    const made = layers.splice(mark);
    for (const layer of made) taken.delete(layer.part.name);
    if (!made.length) return;
    let markup = source.slice(node.start, node.end);
    // A layer switched off in the file comes in hidden (below), not blank.
    if (switchedOff) markup = markup.replace(/^(<[^>]*?)\sdisplay\s*=\s*["']none["']/, '$1').replace(/^(<[^>]*?style\s*=\s*["'][^"']*?)display\s*:\s*none;?/, '$1');
    const x0 = Math.min(...made.map((layer) => layer.box.x));
    const y0 = Math.min(...made.map((layer) => layer.box.y));
    const x1 = Math.max(...made.map((layer) => layer.box.x + layer.box.width));
    const y1 = Math.max(...made.map((layer) => layer.box.y + layer.box.height));
    // A filter (a blurred shadow) draws past the shapes, by up to a tenth of them each way as SVG
    // gives it room by default.
    const filtered = /\bfilter\s*[=:]/.test(markup);
    const padX = filtered ? (x1 - x0) * 0.1 + 2 : 1;
    const padY = filtered ? (y1 - y0) * 0.1 + 2 : 1;
    const box = { x: round(x0 - padX, 3), y: round(y0 - padY, 3), width: round(x1 - x0 + padX * 2, 3), height: round(y1 - y0 + padY * 2, 3) };
    const handed = INHERITED.filter((property) => property !== 'display' && property !== 'visibility' && inherited[property] != null)
      .map((property) => ` ${property}="${String(inherited[property]).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
    const section = deepClone(SECTION_DEFAULTS.Background);
    Object.assign(section._children.Fill, { solidEnabled: false, imageEnabled: true, imageSrc: picture(box, `<g transform="${matrixText(matrix)}"${handed}>${markup}</g>`), imageFit: 'stretch', imageOpacity: 100 });
    section._children.Border.enabled = false;
    section._children.Corners.radius = 0;
    // Its blend mode is the layer's: inside the picture there is nothing under it to blend with.
    const blend = String(own['mix-blend-mode'] ?? node.attributes?.['mix-blend-mode'] ?? '').trim();
    const sections = { Background: section };
    if (CSS_BLEND_MODES.has(blend) && blend !== 'normal') {
      sections.Effects = deepClone(SECTION_DEFAULTS.Effects);
      sections.Effects._children.Blend.mode = blend;
    }
    const part = createPartNode(uniqueLayerName(label, taken), {
      role: 'image',
      kind: 'rectangle',
      opacity: round(opacity, 3),
      layout: { x: box.x, y: box.y, width: box.width, height: box.height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
      sections,
    });
    if (hidden) part.visible = false;
    applyMasks(part, box, stack);
    layers.push({ name: label, part, box, names: chain });
  };

  const shapeLayer = (node, m, style, alpha, label, chain, stack, blend = '') => {
    const data = shapePathData(node);
    if (!data) return;
    let model;
    try {
      model = parsePathData(data);
    } catch {
      note('path', label);
      return;
    }
    if (!model.length) return;
    let placed = transformModel(model, m);
    const fillValue = style.fill ?? '#000000';
    const strokeValue = style.stroke ?? 'none';
    const fillRef = refOf(fillValue);
    const strokeRef = refOf(strokeValue);
    const strokeColour = strokeRef ? 'gradient' : parseColour(strokeValue, style.color);
    const strokeWidth = strokeColour ? num(style['stroke-width'], 1) * scaleOf(m) : 0;
    // An outline not closed with a Z is still filled, as if it were closed (SVG and PDF both fill an
    // open path; a PDF read by utils/pdfArtwork.js closes none of its filled paths), so with no stroke
    // it is a closed shape; only a <line> has nothing to fill. Stroked as well, below: two layers.
    const unclosed = node.name === 'line' || node.name === 'polyline' || placed.every((subpath) => !subpath.closed);
    // Nothing to fill: a <line>, or an open outline that encloses no area (a straight stroke).
    const lineOnly = node.name === 'line' || (unclosed && enclosedArea(placed) < 0.25);
    let open = unclosed;
    if (open && !lineOnly && !strokeColour) open = false;

    // A plain filled shape under one clip path is cut to it, and stays one vector you can edit. A
    // stroked one, or one under a mask or several clips, is masked: the stroke stays whole round the
    // outline and is cut where SVG cuts it.
    let masks = stack;
    if (geometry && stack.length === 1 && stack[0].kind === 'clip' && !strokeColour && !open) {
      const region = clipRegion(stack[0]);
      if (region) {
        try {
          const { scope } = geometry;
          const shape = new scope.CompoundPath({ pathData: serializePathData(placed, 4), insert: false });
          if (String(style['fill-rule'] ?? '') === 'evenodd') shape.fillRule = 'evenodd';
          const cut = shape.intersect(new scope.CompoundPath({ pathData: region, insert: false }), { insert: false });
          if (!cut || cut.isEmpty?.() || !cut.pathData) return;
          placed = parsePathData(cut.pathData);
          if (!placed.length) return;
          masks = [];
        } catch {
          masks = stack;
        }
      }
    }
    const bounds = modelBounds(placed);
    if (!bounds) return;
    // A drawn stroke sits half outside the outline; the layer's box holds all of it (emit, below), and
    // the renderer insets the outline by half the stroke (editor/InteractivePartRenderer.svelte).
    const inner = { x: bounds.x, y: bounds.y, width: Math.max(1e-6, bounds.width), height: Math.max(1e-6, bounds.height) };
    const local = modelBounds(model) ?? inner;

    let fill = { colour: '00000000', gradient: null, picture: '' };
    if (!lineOnly) {
      const target = fillRef ? defs.paint.get(fillRef) : null;
      if (target?.name === 'linearGradient' || target?.name === 'radialGradient') {
        fill = { colour: '00000000', gradient: gradientFill(target, gradients, classes, local, inner, m), picture: '' };
      } else if (target?.name === 'pattern') {
        // The pattern drawn over the shape's own box, as SVG draws it there, and the shape clips it.
        fill = { colour: '00000000', gradient: null, picture: picture(inner, `<g transform="${matrixText(m)}"><rect x="${round(local.x, 3)}" y="${round(local.y, 3)}" width="${round(local.width, 3)}" height="${round(local.height, 3)}" fill="url(#${fillRef})"/></g>`) };
      } else if (fillRef) {
        note('missing', label);
      } else {
        const colour = parseColour(fillValue, style.color);
        if (colour === undefined) note('paint', label);
        else if (colour) fill = { colour: argb(colour, opacityOf(style['fill-opacity']) * colourAlpha(fillValue, style.color)), gradient: null, picture: '' };
      }
    }
    if (open && !strokeColour) return;
    let stroke = null;
    if (strokeColour === 'gradient') {
      const target = defs.paint.get(strokeRef);
      const gradient = target?.name === 'linearGradient' || target?.name === 'radialGradient' ? gradientFill(target, gradients, classes, local, inner, m) : null;
      if (!gradient) note('paint', label);
      stroke = { colour: gradient?.stops?.[0]?.color ?? 'FF000000', width: round(Math.max(0.5, strokeWidth)), gradient };
    } else if (strokeColour) {
      stroke = { colour: argb(strokeColour, opacityOf(style['stroke-opacity']) * colourAlpha(strokeValue, style.color)), width: round(Math.max(0.5, strokeWidth)) };
    }
    const filled = fill.colour !== '00000000' || fill.gradient || fill.picture;
    if (!stroke && !filled) return;

    const emit = (paint, line, closed) => {
      const reach = line ? strokeWidth / 2 : 0;
      const layerBox = { x: bounds.x - reach, y: bounds.y - reach, width: Math.max(1, bounds.width + reach * 2), height: Math.max(1, bounds.height + reach * 2) };
      const part = createPartNode(uniqueLayerName(label, taken), {
        role: 'custom',
        kind: 'path',
        opacity: round(alpha, 3),
        layout: { x: round(layerBox.x), y: round(layerBox.y), width: round(layerBox.width), height: round(layerBox.height), xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
        sections: { Background: background(paint, line), ...(blend ? { Effects: blendEffects(blend) } : {}) },
        meta: {
          pathData: serializePathData(normalizeModel(placed, inner), 5),
          closed,
          ...(String(style['fill-rule'] ?? '') === 'evenodd' ? { fillRule: 'evenodd' } : {}),
        },
      });
      applyMasks(part, layerBox, masks);
      layers.push({ name: label, part, box: layerBox, names: chain });
    };
    // An open outline filled and stroked: its fill closed, its stroke open, so the stroke does not
    // gain the closing edge SVG does not draw.
    if (open && stroke && filled) {
      emit(fill, null, true);
      emit({ colour: '00000000', gradient: null, picture: '' }, stroke, false);
      return;
    }
    emit(fill, stroke, !open);
  };

  const textLayer = (node, m, style, alpha, label, chain, stack) => {
    const words = [];
    const collect = (n) => { if (n.text) words.push(String(n.text)); for (const child of n.children ?? []) collect(child); };
    collect(node);
    const content = words.join(' ').replace(/\s+/g, ' ').trim();
    if (!content) return;
    const first = (node.children ?? []).find((child) => child.name === 'tspan');
    const x = num(node.attributes?.x ?? first?.attributes?.x);
    const y = num(node.attributes?.y ?? first?.attributes?.y);
    // A font size of 0 draws nothing; a negative one is not a size, and the text keeps the default.
    const ownSize = num(style['font-size'], 16);
    if (ownSize === 0) return;
    const size = (ownSize < 0 ? 16 : ownSize) * scaleOf(m);
    const anchor = String(style['text-anchor'] ?? 'start');
    const at = apply(m, x, y);
    // Wide enough for bold capitals, with room either side: a text layer clips what it cannot hold.
    const boldText = /bold|[6-9]00/.test(String(style['font-weight'] ?? ''));
    const width = Math.max(size, content.length * size * (boldText ? 0.74 : 0.64) + size);
    const left = anchor === 'middle' ? at.x - width / 2 : anchor === 'end' ? at.x - width : at.x;
    const box = { x: left, y: at.y - size * 0.85, width, height: size * 1.2 };
    const colour = parseColour(style.fill ?? '#000000', style.color) ?? '000000';
    const text = deepClone(SECTION_DEFAULTS.Text);
    text.content = content;
    text._children.Fill.colour = argb(colour, opacityOf(style['fill-opacity']) * colourAlpha(style.fill ?? '#000000', style.color));
    text._children.Font.size = round(size, 1);
    const family = String(style['font-family'] ?? '').split(',')[0].replace(/['"]/g, '').trim();
    if (family) text._children.Font.family = family;
    const weight = String(style['font-weight'] ?? '');
    const weightValue = weight === 'bold' ? 700 : Number.parseInt(weight, 10) || 400;
    text._children.Font.weightValue = weightValue;
    text._children.Font.weight = weightValue >= 700 ? 'Bold' : weightValue >= 600 ? 'SemiBold' : 'Regular';
    text._children.Position.justification = anchor === 'middle' ? 'centred' : anchor === 'end' ? 'right' : 'left';
    const partName = uniqueLayerName(label === 'text' ? content.slice(0, 24) : label, taken);
    const part = createPartNode(partName, {
      role: 'label',
      kind: 'text',
      opacity: round(alpha, 3),
      layout: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height), xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
      sections: { Text: text },
    });
    applyMasks(part, box, stack);
    layers.push({ name: label, part, box, names: chain });
  };

  const imageLayer = (node, m, alpha, label, chain, stack) => {
    const linked = String(node.attributes?.href ?? node.attributes?.['xlink:href'] ?? '');
    // A linked picture is read from beside the file, where the command could (files).
    const href = linked.startsWith('data:image/') ? linked : String(files?.[linked] ?? '');
    if (!href.startsWith('data:image/')) { note('link', label || linked); return; }
    const w = num(node.attributes?.width);
    const h = num(node.attributes?.height);
    if (!(w > 0 && h > 0)) return;
    const x = num(node.attributes?.x);
    const y = num(node.attributes?.y);
    const corners = [apply(m, x, y), apply(m, x + w, y), apply(m, x, y + h), apply(m, x + w, y + h)];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    const section = deepClone(SECTION_DEFAULTS.Background);
    Object.assign(section._children.Fill, { solidEnabled: false, imageEnabled: true, imageSrc: href, imageFit: 'stretch', imageOpacity: 100 });
    section._children.Border.enabled = false;
    section._children.Corners.radius = 0;
    const part = createPartNode(uniqueLayerName(label, taken), {
      role: 'image',
      kind: 'rectangle',
      opacity: round(alpha, 3),
      layout: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height), xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
      sections: { Background: section },
    });
    applyMasks(part, box, stack);
    layers.push({ name: label, part, box, names: chain });
  };

  const rootStyle = { fill: '#000000' };
  try {
    for (const child of root.children ?? []) visit(child, frame.matrix, rootStyle, 1, [], []);
  } catch (error) {
    if (error !== TOO_MANY) throw error;
    return {
      ok: false,
      error: `This drawing has more than ${MAX_LAYERS.toLocaleString('en')} shapes, more than a component can hold and stay quick to edit. `
        + 'Use it as a panel\'s artwork instead (File › New Panel from Vector Artwork), or simplify it first.',
    };
  }

  if (!layers.length) return { ok: false, error: 'The drawing has no shapes, text or embedded pictures to make layers of.' };
  const list = (key) => [...(noted.get(key) ?? [])].slice(0, 5).join(', ');
  if (noted.has('paint')) warnings.push(`Paints that are not a colour, gradient or pattern are not read: ${list('paint')}.`);
  if (noted.has('missing')) warnings.push(`References to a gradient, pattern, clip path or mask that is not in the file: ${list('missing')}.`);
  if (noted.has('link')) warnings.push(`Linked pictures that could not be read: ${list('link')}. Keep them beside the SVG, or embed them before exporting.`);
  if (noted.has('use')) warnings.push(`References to nothing in the file: ${list('use')}.`);
  if (noted.has('loop')) warnings.push(`References that loop back to what holds them, not drawn (as SVG does not draw them): ${list('loop')}.`);
  if (noted.has('filter')) warnings.push(`SVG filters (blur, drop shadow, lighting) are not drawn: ${list('filter')}. Give the layer a shadow in the Component Designer instead.`);
  if (noted.has('blend')) warnings.push(`A group's blend mode is not kept, only a shape's own: ${list('blend')}.`);
  if (noted.has('unknown')) warnings.push(`Not read: ${list('unknown')}.`);
  if (noted.has('path')) warnings.push(`Paths that could not be read: ${list('path')}.`);

  const name = String(fileName ?? '').replace(/\.[^.]+$/, '').trim() || 'SVG Artwork';
  const built = buildArtworkComponent({ name, width: frame.width, height: frame.height, layers, fileName });
  return { ok: true, name, width: frame.width, height: frame.height, ...built, warnings };
}
