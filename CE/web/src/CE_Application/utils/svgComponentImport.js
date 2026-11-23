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
import { parseXml } from '../ctrlrImport/xml.js';
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
/**
 * The document's style rules, in the order CSS applies them (by specificity, then as written): each
 * `{ type, id, classes, declarations }` for a selector of one element (\`.cls-1\`, \`rect\`, \`#cap\`,
 * \`path.edge\`, \`*\`). A selector that looks past the element (\`g > rect\`, \`g rect\`) is not read.
 */
function classRules(root) {
  const rules = [];
  const visit = (node) => {
    if (node.name === 'style') {
      const pattern = /([^{}]+)\{([^}]*)\}/g;
      let match;
      while ((match = pattern.exec(String(node.text ?? '').replace(/\/\*[\s\S]*?\*\//g, '')))) {
        const declarations = declarationsOf(match[2]);
        for (const selector of match[1].split(',')) {
          const text = selector.trim();
          const parts = /^(\*|[A-Za-z][\w:-]*)?((?:[.#][A-Za-z0-9_-]+)*)$/.exec(text);
          if (!text || !parts) continue;
          const type = parts[1] && parts[1] !== '*' ? parts[1] : '';
          const classes = [...parts[2].matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
          const ids = [...parts[2].matchAll(/#([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
          if (ids.length > 1) continue;
          rules.push({ type, id: ids[0] ?? '', classes, declarations, specificity: ids.length * 10000 + classes.length * 100 + (type ? 1 : 0), order: rules.length });
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
}

function declarationsOf(text) {
  const out = {};
  for (const piece of String(text ?? '').split(';')) {
    const at = piece.indexOf(':');
    if (at > 0) out[piece.slice(0, at).trim().toLowerCase()] = piece.slice(at + 1).replace(/!important\s*$/i, '').trim();
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
  if (classes.length) {
    const own = new Set(String(attributes.class ?? '').split(/\s+/).filter(Boolean));
    for (const rule of classes) {
      if ((rule.type && rule.type !== node.name) || (rule.id && rule.id !== attributes.id) || rule.classes.some((name) => !own.has(name))) continue;
      Object.assign(style, rule.declarations);
    }
  }
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
/** An AARRGGBB colour at `k` of its opacity. */
const fadeArgb = (colour, k) => (k >= 1 ? colour : argb(String(colour).slice(-6), (parseInt(String(colour).slice(0, 2), 16) / 255) * k));
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

// The colour filters a layer has (Effects › Filters), in the order CEditor draws them, as CSS names.
const FILTER_ORDER = ['brightness', 'contrast', 'saturate', 'hue-rotate', 'grayscale', 'sepia', 'invert'];
const FILTER_FIELDS = { brightness: 'brightness', contrast: 'contrast', saturate: 'saturation', 'hue-rotate': 'hueRotate', grayscale: 'grayscale', sepia: 'sepia', invert: 'invert' };

/**
 * Colour filters as the layer's own Filters (percent, and degrees for the hue), or null where they
 * are not in the order CEditor draws them, or one comes twice: a different order draws differently.
 */
function layerFilters(list) {
  let at = -1;
  const out = {};
  for (const [name, value] of list) {
    const index = FILTER_ORDER.indexOf(name);
    if (index <= at) return null;
    at = index;
    if (name === 'hue-rotate') out.hueRotate = round(((((value + 180) % 360) + 360) % 360) - 180, 3);
    else out[FILTER_FIELDS[name]] = round(value * 100, 3);
  }
  return out;
}

/**
 * CSS's filter functions' matrices (Filter Effects 1), each for an amount, to read one back by. Grayscale
 * first: at full strength it is saturate(0) to within a rounding, and reads as what it more likely is.
 */
const CSS_MATRICES = {
  grayscale: (a) => [0.2126 + 0.7874 * (1 - a), 0.7152 - 0.7152 * (1 - a), 0.0722 - 0.0722 * (1 - a), 0.2126 - 0.2126 * (1 - a), 0.7152 + 0.2848 * (1 - a), 0.0722 - 0.0722 * (1 - a), 0.2126 - 0.2126 * (1 - a), 0.7152 - 0.7152 * (1 - a), 0.0722 + 0.9278 * (1 - a)],
  sepia: (a) => [0.393 + 0.607 * (1 - a), 0.769 - 0.769 * (1 - a), 0.189 - 0.189 * (1 - a), 0.349 - 0.349 * (1 - a), 0.686 + 0.314 * (1 - a), 0.168 - 0.168 * (1 - a), 0.272 - 0.272 * (1 - a), 0.534 - 0.534 * (1 - a), 0.131 + 0.869 * (1 - a)],
  saturate: (s) => [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
};

/**
 * A 4 × 5 colour matrix as one CSS filter function, `[name, amount]`, or null: identity, brightness
 * (a diagonal), invert (every channel 1 − itself), or saturate, grayscale or sepia for some amount.
 */
function matrixFilter(values) {
  const v = values;
  const near = (a, b) => Math.abs(a - b) < 2e-3;
  // The alpha row untouched, and no channel taking from alpha.
  if (![15, 16, 17, 19].every((i) => near(v[i], 0)) || !near(v[18], 1) || ![3, 8, 13].every((i) => near(v[i], 0))) return null;
  const rgb = [v[0], v[1], v[2], v[5], v[6], v[7], v[10], v[11], v[12]];
  const offsets = [v[4], v[9], v[14]];
  if (offsets.every((o) => near(o, 1)) && rgb.every((x, i) => near(x, [0, 4, 8].includes(i) ? -1 : 0))) return ['invert', 1];
  if (!offsets.every((o) => near(o, 0))) return null;
  if (rgb.every((x, i) => ([0, 4, 8].includes(i) ? near(x, rgb[0]) : near(x, 0)))) return near(rgb[0], 1) ? ['identity', 1] : ['brightness', rgb[0]];
  for (const [name, of] of Object.entries(CSS_MATRICES)) {
    // The amount from the first entry, then every entry checked against it.
    const amount = name === 'saturate' ? (rgb[0] - 0.213) / 0.787 : 1 - (rgb[0] - of(1)[0]) / (of(0)[0] - of(1)[0]);
    if (Number.isFinite(amount) && of(amount).every((x, i) => near(x, rgb[i]))) return [name, Math.max(0, name === 'saturate' ? amount : Math.min(1, amount))];
  }
  return null;
}

/**
 * CSS filter functions (`blur(2px) saturate(50%) drop-shadow(...)`) as a layer effect: `{ blur,
 * shadows, filters }` as filterEffect gives them, `{}` for none, or null for what the layer cannot
 * hold as it is written: opacity(), a url() among functions, colour functions out of CEditor's order,
 * or a drop shadow followed by more, or of a blurred shape.
 */
export function cssFilterEffect(value) {
  const text = String(value ?? '').trim();
  if (!text || text === 'none') return {};
  const functions = [];
  let i = 0;
  while (i < text.length) {
    while (/\s/.test(text[i] ?? '')) i += 1;
    if (i >= text.length) break;
    const name = /^[a-z-]+(?=\()/i.exec(text.slice(i))?.[0];
    if (!name) return null;
    let depth = 0;
    let j = i + name.length;
    const start = j + 1;
    for (; j < text.length; j += 1) {
      if (text[j] === '(') depth += 1;
      else if (text[j] === ')') { depth -= 1; if (!depth) break; }
    }
    if (depth) return null;
    functions.push([name.toLowerCase(), text.slice(start, j).trim()]);
    i = j + 1;
  }
  const amount = (arg) => {
    if (!arg) return 1;
    const m = /^([-+]?(?:\d+\.?\d*|\.\d+))(%?)$/.exec(arg);
    return m ? Number(m[1]) / (m[2] ? 100 : 1) : NaN;
  };
  const length = (arg) => {
    const m = /^([-+]?(?:\d+\.?\d*|\.\d+))(px)?$/.exec(String(arg ?? '').trim());
    return m && (m[2] || Number(m[1]) === 0) ? Number(m[1]) : NaN;
  };
  const angle = (arg) => {
    const m = /^([-+]?(?:\d+\.?\d*|\.\d+))(deg|rad|grad|turn)?$/.exec(arg || '0');
    if (!m || (!m[2] && Number(m[1]) !== 0)) return NaN;
    return Number(m[1]) * { deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 }[m[2] ?? 'deg'];
  };
  let blur = 0;
  const colours = [];
  const shadows = [];
  for (const [name, arg] of functions) {
    if (shadows.length && name !== 'drop-shadow') return null;
    if (name === 'blur') {
      const sigma = arg ? length(arg) : 0;
      if (!(sigma >= 0)) return null;
      blur = Math.hypot(blur, sigma);
    } else if (name === 'drop-shadow') {
      if (blur) return null;
      // Its colour (first or last), then two or three lengths: the offset and the blur.
      const parts = arg.match(/(?:rgba?|hsla?)\([^)]*\)|#[0-9a-f]+|[^\s]+/gi) ?? [];
      const lengths = parts.map(length);
      const colourText = parts.filter((_, k) => !Number.isFinite(lengths[k])).join(' ') || 'black';
      const numbers = lengths.filter(Number.isFinite);
      const colour = parseColour(colourText, 'black');
      if (numbers.length < 2 || numbers.length > 3 || parts.filter((_, k) => !Number.isFinite(lengths[k])).length > 1 || !colour) return null;
      shadows.push({ dx: numbers[0], dy: numbers[1], deviation: (numbers[2] ?? 0) / 2, colour, opacity: colourAlpha(colourText, 'black') });
    } else if (FILTER_ORDER.includes(name)) {
      const v = name === 'hue-rotate' ? angle(arg) : amount(arg);
      if (!Number.isFinite(v) || v < (name === 'hue-rotate' ? -Infinity : 0)) return null;
      colours.push([name, ['grayscale', 'sepia', 'invert'].includes(name) ? Math.min(1, v) : v]);
    } else {
      return null;
    }
  }
  const filters = layerFilters(colours);
  if (!filters) return null;
  return { ...(blur ? { blur } : {}), ...(shadows.length ? { shadows } : {}), ...(Object.keys(filters).length ? { filters } : {}) };
}

/**
 * A filter that is a layer effect, read as one: `{ blur }` (a Gaussian blur of the element, its
 * deviation in the element's units), `{ shadows: [{ dx, dy, deviation, colour, opacity }] }` (drop
 * shadows under it, as Inkscape, Illustrator and feDropShadow write them), `{ filters }` (its colour
 * changed as the layer's Filters change it: saturate, hue-rotate, grayscale, sepia, brightness,
 * contrast and invert, in CSS's sRGB, so only where the filter works in sRGB, and in the order the
 * layer draws them), any of those together, `{}` (no effect), or null for anything else, which is
 * drawn as SVG draws it. `classes`: the style rules, for flood colours.
 */
export function filterEffect(filter, classes = [], byId = new Map()) {
  if (!filter || String(filter.attributes?.primitiveUnits ?? '') === 'objectBoundingBox') return null;
  // A filter with no primitives of its own takes those of the one it refers to (href), as SVG does.
  let source = filter;
  for (let depth = 0; depth < 8 && !(source.children ?? []).some((child) => String(child.name ?? '').startsWith('fe')); depth += 1) {
    const href = String(source.attributes?.href ?? source.attributes?.['xlink:href'] ?? '').replace(/^#/, '');
    if (!href || !byId.get(href)) break;
    source = byId.get(href);
  }
  const SOURCE = { kind: 'source', blur: 0, colours: [] };
  const ALPHA = { kind: 'shape', colour: '000000', opacity: 1, blur: 0, dx: 0, dy: 0 };
  const results = new Map();
  let last = SOURCE;
  const input = (name) => {
    const key = String(name ?? '').trim();
    if (!key) return last;
    if (key === 'SourceGraphic') return SOURCE;
    if (key === 'SourceAlpha') return ALPHA;
    return results.get(key) ?? null;
  };
  const attr = (node, name) => node.attributes?.[name] ?? ownStyle(node, classes)[name];
  // Colour primitives match CSS's functions only where they work in sRGB; SVG's default is linearRGB.
  const inSrgb = (node) => /^srgb$/i.test(String(attr(node, 'color-interpolation-filters') ?? attr(source, 'color-interpolation-filters') ?? attr(filter, 'color-interpolation-filters') ?? '').trim());
  const recolour = (a, node, change) => (a?.kind === 'source' && change && inSrgb(node) ? { ...a, colours: change[0] === 'identity' ? a.colours : [...a.colours, change] } : null);
  const deviation = (node) => {
    const values = String(attr(node, 'stdDeviation') ?? '0').trim().split(/[\s,]+/).map(Number);
    if (values.some((v) => !Number.isFinite(v) || v < 0)) return null;
    return values.length > 1 && Math.abs(values[0] - values[1]) > 1e-6 ? null : values[0];
  };
  const blurred = (a, b) => Math.sqrt(a * a + b * b);
  const floodOf = (node) => ({
    kind: 'flood',
    colour: parseColour(String(attr(node, 'flood-color') ?? 'black'), 'black') ?? '000000',
    opacity: opacityOf(attr(node, 'flood-opacity')) * colourAlpha(String(attr(node, 'flood-color') ?? 'black'), 'black'),
  });
  const over = (bottom, top) => ({ kind: 'over', layers: [...(bottom.kind === 'over' ? bottom.layers : [bottom]), ...(top.kind === 'over' ? top.layers : [top])] });
  // dx and dy are numbers, not lengths: '10%' is not one, and the effect is left to SVG.
  const number = (value, fallback) => (value == null ? fallback : /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(String(value)) ? Number(value) : NaN);
  for (const node of source.children ?? []) {
    if (!String(node.name ?? '').startsWith('fe')) continue;
    const a = input(node.attributes?.in);
    let out = null;
    switch (node.name) {
      case 'feGaussianBlur': {
        const sigma = deviation(node);
        if (sigma == null || !a) break;
        if (a.kind === 'source') out = { ...a, blur: blurred(a.blur, sigma) };
        else if (a.kind === 'shape') out = { ...a, blur: blurred(a.blur, sigma) };
        break;
      }
      case 'feOffset': {
        const dx = number(node.attributes?.dx, 0);
        const dy = number(node.attributes?.dy, 0);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) break;
        if (a?.kind === 'shape') out = { ...a, dx: a.dx + dx, dy: a.dy + dy };
        else if (a?.kind === 'source' && !dx && !dy) out = a;
        break;
      }
      case 'feFlood': out = floodOf(node); break;
      case 'feDropShadow': {
        const sigma = deviation(node) ?? null;
        const flood = floodOf(node);
        const dx = number(node.attributes?.dx, 2);
        const dy = number(node.attributes?.dy, 2);
        if (sigma == null || a?.kind !== 'source' || a.blur || !Number.isFinite(dx) || !Number.isFinite(dy)) break;
        out = over({ kind: 'shape', colour: flood.colour, opacity: flood.opacity, blur: sigma, dx, dy }, a);
        break;
      }
      case 'feComposite': {
        const b = input(node.attributes?.in2);
        const operator = String(node.attributes?.operator ?? 'over');
        if (!a || !b) break;
        if (operator === 'in' && a.kind === 'flood' && (b.kind === 'shape' || (b.kind === 'source' && !b.blur))) {
          // A colour cut to the shape: the silhouette in that colour.
          out = { kind: 'shape', colour: a.colour, opacity: a.opacity * (b.kind === 'shape' ? b.opacity : 1), blur: b.kind === 'shape' ? b.blur : 0, dx: b.kind === 'shape' ? b.dx : 0, dy: b.kind === 'shape' ? b.dy : 0 };
        } else if (operator === 'in' && a.kind === 'shape' && b.kind === 'flood') {
          out = { ...a, opacity: a.opacity * b.opacity };
        } else if (operator === 'over') {
          out = over(b, a);
        }
        break;
      }
      case 'feBlend': {
        const b = input(node.attributes?.in2);
        if (a && b && String(node.attributes?.mode ?? 'normal') === 'normal') out = over(b, a);
        break;
      }
      case 'feMerge': {
        const layers = (node.children ?? []).filter((child) => child.name === 'feMergeNode').map((child) => input(child.attributes?.in));
        if (layers.length && layers.every(Boolean)) out = layers.reduce((acc, layer) => (acc ? over(acc, layer) : layer), null);
        break;
      }
      case 'feColorMatrix': {
        const type = String(node.attributes?.type ?? 'matrix');
        const values = String(node.attributes?.values ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
        // The element's colours changed, as a layer's Filters change them.
        if (a?.kind === 'source') {
          if (type === 'saturate') out = recolour(a, node, ['saturate', values.length ? values[0] : 1]);
          else if (type === 'hueRotate') out = recolour(a, node, ['hue-rotate', values.length ? values[0] : 0]);
          else if (type === 'matrix' && values.length === 20 && values.every(Number.isFinite)) out = recolour(a, node, matrixFilter(values));
          if (out && !values.every(Number.isFinite)) out = null;
          break;
        }
        // A shadow's colour set by a matrix: every channel a constant, the alpha scaled.
        if (a?.kind === 'shape' && String(node.attributes?.type ?? 'matrix') === 'matrix' && values.length === 20 && values.every(Number.isFinite)
          && [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 19].every((i) => Math.abs(values[i]) < 1e-6)) {
          const hex = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
          out = { ...a, colour: `${hex(values[4])}${hex(values[9])}${hex(values[14])}`, opacity: a.opacity * Math.max(0, Math.min(1, values[18])) };
        }
        break;
      }
      case 'feComponentTransfer': {
        // A shadow's opacity scaled: feFuncA linear (slope) or table (0 to a).
        const funcs = (node.children ?? []).filter((child) => /^feFunc[RGBA]$/.test(child.name));
        const alpha = funcs.find((child) => child.name === 'feFuncA');
        if (a?.kind === 'source') {
          // The same function on red, green and blue, alpha untouched: brightness, contrast or invert.
          const rgb = ['feFuncR', 'feFuncG', 'feFuncB'].map((name) => funcs.find((child) => child.name === name));
          const describe = (f) => (f ? JSON.stringify([f.attributes?.type ?? 'identity', f.attributes?.slope ?? '1', f.attributes?.intercept ?? '0', f.attributes?.tableValues ?? '']) : '["identity","1","0",""]');
          if ((alpha && String(alpha.attributes?.type ?? 'identity') !== 'identity') || new Set(rgb.map(describe)).size !== 1) break;
          const f = rgb[0];
          const type = String(f?.attributes?.type ?? 'identity');
          const slope = num(f?.attributes?.slope, 1);
          const intercept = num(f?.attributes?.intercept, 0);
          const table = String(f?.attributes?.tableValues ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
          let change = null;
          if (type === 'identity') change = ['identity', 1];
          else if (type === 'linear' && Math.abs(intercept) < 1e-6) change = ['brightness', slope];
          else if (type === 'linear' && Math.abs(intercept - (0.5 - 0.5 * slope)) < 1e-6) change = ['contrast', slope];
          else if (type === 'table' && table.length === 2 && Math.abs(table[0] + table[1] - 1) < 1e-6 && table[0] <= 0.5) change = ['invert', table[0]];
          out = recolour(a, node, change);
          break;
        }
        if (a?.kind !== 'shape' || !alpha || funcs.some((child) => child !== alpha && String(child.attributes?.type ?? 'identity') !== 'identity')) break;
        const type = String(alpha.attributes?.type ?? 'identity');
        const table = String(alpha.attributes?.tableValues ?? '').trim().split(/[\s,]+/).map(Number);
        if (type === 'linear' && !num(alpha.attributes?.intercept)) out = { ...a, opacity: a.opacity * Math.max(0, Math.min(1, num(alpha.attributes?.slope, 1))) };
        else if (type === 'table' && table.length === 2 && table[0] === 0 && Number.isFinite(table[1])) out = { ...a, opacity: a.opacity * Math.max(0, Math.min(1, table[1])) };
        else if (type === 'identity') out = a;
        break;
      }
      default: break;
    }
    if (!out) return null;
    const name = String(node.attributes?.result ?? '').trim();
    if (name) results.set(name, out);
    last = out;
  }
  const filtersOf = (layer) => {
    const filters = layerFilters(layer.colours ?? []);
    return filters && Object.keys(filters).length ? { filters } : filters ? {} : null;
  };
  if (last.kind === 'source') {
    const filters = filtersOf(last);
    return filters && { ...(last.blur ? { blur: last.blur } : {}), ...filters };
  }
  if (last.kind !== 'over') return null;
  const top = last.layers[last.layers.length - 1];
  const below = last.layers.slice(0, -1);
  if (top.kind !== 'source' || top.blur || !below.length || below.some((layer) => layer.kind !== 'shape')) return null;
  const filters = filtersOf(top);
  if (!filters) return null;
  return { shadows: below.map((layer) => ({ dx: layer.dx, dy: layer.dy, deviation: layer.blur, colour: layer.colour, opacity: layer.opacity })), ...filters };
}

/** A filter's effect (filterEffect) as the layer's own: its blur, its drop shadows, its colour filters. */
function applyEffect(part, effect, m) {
  if (!part._children.Effects) part._children.Effects = deepClone(SECTION_DEFAULTS.Effects);
  const effects = part._children.Effects._children;
  const k = scaleOf(m);
  if (effect.blur) effects.Filters.blur = round(effect.blur * k, 3);
  if (effect.filters) Object.assign(effects.Filters, effect.filters);
  if (effect.shadows) {
    // CSS's blur is twice the deviation (utils/outlineShadows.js); the offset turned with the shape.
    effects.Shadows.items = effect.shadows.map((shadow) => {
      const origin = apply(m, 0, 0);
      const to = apply(m, shadow.dx, shadow.dy);
      return {
        enabled: true, type: 'drop', offsetX: round(to.x - origin.x, 3), offsetY: round(to.y - origin.y, 3),
        blur: round(shadow.deviation * 2 * k, 3), spread: 0, colour: argb(shadow.colour, shadow.opacity),
      };
    });
  }
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
  const defs = { paint: new Map(), clipPath: new Map(), mask: new Map(), filter: new Map() };
  const indexIds = (node) => {
    const id = node.attributes?.id;
    if (id) {
      if (node.name === 'linearGradient' || node.name === 'radialGradient' || node.name === 'pattern') defs.paint.set(id, node);
      else if (node.name === 'clipPath') defs.clipPath.set(id, node);
      else if (node.name === 'mask') defs.mask.set(id, node);
      else if (node.name === 'filter') defs.filter.set(id, node);
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
  /**
   * The definitions `content` refers to, and those they refer to, as markup; and the elements its
   * <use>s draw, which in <defs> are drawn only where they are used, as there.
   */
  const referredText = (id) => {
    if (definitionText.has(id)) return definitionText.get(id);
    const node = ids.get(id);
    return node && Number.isFinite(node.start) && Number.isFinite(node.end) ? source.slice(node.start, node.end) : '';
  };
  const definitionsFor = (content) => {
    const wanted = new Map();
    const queue = [content];
    while (queue.length) {
      for (const match of queue.pop().matchAll(REFERENCE)) {
        const id = match[1] ?? match[2];
        if (wanted.has(id)) continue;
        const text = referredText(id);
        if (!text) continue;
        wanted.set(id, text);
        queue.push(text);
      }
    }
    return styleTexts.join('') + [...wanted.values()].join('');
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
      const id = entry.kind === 'clip' ? clipInUserSpace(entry) : entry.id;
      content = `<g transform="${matrixText(entry.matrix)}" ${attribute}="url(#${id})"><g transform="${matrixText(invert(entry.matrix))}">${content}</g></g>`;
    }
    return content;
  };

  const transformOrigin = (node) => String(node.attributes?.['transform-origin'] ?? ownStyle(node, classes)['transform-origin'] ?? '').trim();
  /**
   * The box a clip in objectBoundingBox units measures against: the element's own, in its own space
   * (a shape's outline, a picture's rectangle), or null where it is not measured here (a group's).
   */
  const ownBox = (node) => {
    if (node.name === 'image') {
      const width = num(node.attributes?.width);
      const height = num(node.attributes?.height);
      return width > 0 && height > 0 ? { x: num(node.attributes?.x), y: num(node.attributes?.y), width, height } : null;
    }
    if (!SHAPES.has(node.name)) return null;
    try {
      const data = shapePathData(node);
      return data ? modelBounds(parsePathData(data)) : null;
    } catch {
      return null;
    }
  };
  // A clip in objectBoundingBox units, as one in the user space of the element it clips: the same
  // shapes, scaled to that element's box. The layer's mask is a picture of the clip round a box of its
  // own, which in the clip's units was the wrong box (a turned shape's clip came out unturned).
  const boxClips = new Map();
  const clipInUserSpace = (entry) => {
    const clip = defs.clipPath.get(entry.id);
    const box = entry.box;
    if (!box || !(box.width > 0 && box.height > 0) || String(clip?.attributes?.clipPathUnits ?? '') !== 'objectBoundingBox' || transformOrigin(clip)) return entry.id;
    const key = `${entry.id} ${box.x} ${box.y} ${box.width} ${box.height}`;
    if (!boxClips.has(key)) {
      const text = definitionText.get(entry.id) ?? '';
      const open = text.match(/^<clipPath\b[^>]*>/)?.[0];
      if (!open || open.endsWith('/>')) return entry.id;
      const id = `${entry.id}-box-${boxClips.size + 1}`;
      const transform = `${matrixText([box.width, 0, 0, box.height, box.x, box.y])} ${clip.attributes?.transform ?? ''}`.trim();
      definitionText.set(id, `<clipPath id="${id}" clipPathUnits="userSpaceOnUse" transform="${transform}">${text.slice(open.length)}`);
      boxClips.set(key, id);
    }
    return boxClips.get(key);
  };
  const applyMasks = (part, box, stack) => {
    if (!stack.length) return;
    part.mask = { enabled: true, src: picture(box, maskContent(stack, box)), x: 0, y: 0, width: 100, height: 100, invert: false };
  };

  /** A clip path's region in the document, as path data, or '' (for Paper.js to cut a shape to). */
  const clipRegion = (entry) => {
    const clip = defs.clipPath.get(entry.id);
    // A transform about an origin of its own (SVG 2's transform-origin) is left to the browser: the
    // clip is the layer's mask.
    if (!clip || transformOrigin(clip)) return '';
    let own = multiply(entry.matrix, parseTransform(clip.attributes?.transform));
    if (String(clip.attributes?.clipPathUnits ?? '') === 'objectBoundingBox') {
      // Its shapes in the units of the clipped element's own box.
      const box = entry.box;
      if (!box || !(box.width > 0 && box.height > 0)) return '';
      own = multiply(entry.matrix, multiply([box.width, 0, 0, box.height, box.x, box.y], parseTransform(clip.attributes?.transform)));
    }
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
      if (defs.clipPath.has(clipId)) {
        const boxed = String(defs.clipPath.get(clipId).attributes?.clipPathUnits ?? '') === 'objectBoundingBox';
        here.push({ kind: 'clip', id: clipId, matrix: m, ...(boxed ? { box: ownBox(node) } : {}) });
      }
      else note('missing', label);
    }
    if (maskId) {
      if (defs.mask.has(maskId)) here.push({ kind: 'mask', id: maskId, matrix: m });
      else note('missing', label);
    }

    const sliced = Number.isFinite(node.start) && Number.isFinite(node.end);
    const pictureOf = { matrix, inherited, opacity, names, stack, depth, own, label, chain, switchedOff, hidden: !!style.switchedOff };
    if (!measuring && name && sliced && drawnAsFrame(name, chain)) {
      pictureLayer(node, pictureOf);
      return;
    }
    // A filter (a blur, a drop shadow, lighting) draws what it holds as one picture, and a group's
    // blend mode blends the group as one: each such element is a picture of itself, as SVG draws it.
    // (A shape's own blend mode is its layer's, below, and it stays a shape.) A filter that is not in
    // the file is no filter, as in a browser.
    const filterId = refOf(node.attributes?.filter ?? own.filter);
    const filtered = !!filterId && defs.filter.has(filterId);
    if (filterId && !filtered && !measuring) note('missing', label);
    const blend = String(own['mix-blend-mode'] ?? node.attributes?.['mix-blend-mode'] ?? '').trim();
    const group = node.name === 'g' || node.name === 'svg' || node.name === 'a' || node.name === 'switch' || node.name === 'use';
    let groupBlend = group && CSS_BLEND_MODES.has(blend) && blend !== 'normal';
    // A group of one shape blends as that shape does: the blend mode is the shape's, and it stays a
    // shape. (A group of several blends them as one, which only a picture of it draws.)
    if (groupBlend && node.name !== 'use') {
      const drawn = (node.children ?? []).filter((child) => child.name && !SKIPPED.has(child.name));
      const [only] = drawn;
      const ownBlend = only ? String(ownStyle(only, classes)['mix-blend-mode'] ?? only.attributes?.['mix-blend-mode'] ?? '').trim() : '';
      if (drawn.length === 1 && SHAPES.has(only.name) && (!ownBlend || ownBlend === 'normal') && !refOf(only.attributes?.filter ?? ownStyle(only, classes).filter)) {
        node = { ...node, children: node.children.map((child) => (child === only ? { ...child, attributes: { ...child.attributes, style: `${child.attributes?.style ?? ''};mix-blend-mode:${blend}` } } : child)) };
        groupBlend = false;
      }
    }
    // A filter that is a layer effect (a blur, a drop shadow) on a shape: the shape stays a shape, the
    // effect its layer's own, which the Component Designer edits.
    const filterValue = String(node.attributes?.filter ?? own.filter ?? '').trim();
    const lone = /^url\(\s*["']?#[^)"'\s]+["']?\s*\)$/.test(filterValue);
    // CSS's filter functions (`filter: blur(2px) saturate(50%)`), no filter element: on a shape, the
    // layer's own effects where they are ones it has; anything else a picture, as a filter is.
    const functions = !filterId && /^[a-z-]+\(/i.test(filterValue);
    const effect = !measuring && SHAPES.has(node.name)
      ? (filtered && lone ? fitsRegion(filterEffect(defs.filter.get(filterId), classes, defs.filter), defs.filter.get(filterId), node) : functions ? cssFilterEffect(filterValue) : null)
      : null;
    if (!measuring && sliced && (((filtered || functions) && !effect) || groupBlend)) {
      note(filtered || functions ? 'filter' : 'blend', label);
      pictureLayer(node, pictureOf);
      return;
    }
    // Measured for a picture: CSS's functions draw past the shapes too, by their blur and offsets.
    if (measuring && functions && !regionOf.has(node)) {
      const mark = layers.length;
      regionOf.add(node);
      try {
        visit(node, matrix, inherited, opacity, names, stack, depth);
      } finally {
        regionOf.delete(node);
      }
      const held = layers.slice(mark);
      const reach = 3 * (filterValue.match(/[-+]?(?:\d+\.?\d*|\.\d+)px/g) ?? []).reduce((sum, value) => sum + Math.abs(parseFloat(value)), 0) * scaleOf(m);
      if (held.length) {
        const x0 = Math.min(...held.map((layer) => layer.box.x)) - reach;
        const y0 = Math.min(...held.map((layer) => layer.box.y)) - reach;
        const x1 = Math.max(...held.map((layer) => layer.box.x + layer.box.width)) + reach;
        const y1 = Math.max(...held.map((layer) => layer.box.y + layer.box.height)) + reach;
        layers.push({ box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, part: {}, names: [] });
      }
      return;
    }
    // Measured for a picture: a filter draws over its region, past the shapes it holds.
    if (measuring && filtered && !regionOf.has(node)) {
      const mark = layers.length;
      regionOf.add(node);
      try {
        visit(node, matrix, inherited, opacity, names, stack, depth);
      } finally {
        regionOf.delete(node);
      }
      const held = layers.slice(mark);
      if (held.length) layers.push({ box: filterRegion(defs.filter.get(filterId), held.map((layer) => layer.box), m), part: {}, names: [] });
      return;
    }
    if (node.name === 'g' || node.name === 'svg' || node.name === 'a' || node.name === 'switch') {
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
    if (effect && (effect.blur || effect.shadows || effect.filters)) {
      note('effect', label);
      for (let i = before; i < layers.length; i += 1) applyEffect(layers[i].part, effect, m);
    }
    if (style.switchedOff) for (let i = before; i < layers.length; i += 1) layers[i].part.visible = false;
  };

  /**
   * `effect` where the filter's region holds all of it (the shape, its shadows, three deviations of
   * blur round each), else null: a region that cuts a shadow off is drawn by SVG, as a picture.
   */
  const fitsRegion = (effect, filter, node) => {
    if (!effect || (!effect.blur && !effect.shadows)) return effect;
    const box = ownBox(node);
    if (!box) return null;
    const grow = (b, by, dx = 0, dy = 0) => ({ x0: b.x + dx - by, y0: b.y + dy - by, x1: b.x + b.width + dx + by, y1: b.y + b.height + dy + by });
    const parts = effect.blur ? [grow(box, effect.blur * 3)] : [grow(box, 0), ...effect.shadows.map((shadow) => grow(box, shadow.deviation * 3, shadow.dx, shadow.dy))];
    const reach = { x0: Math.min(...parts.map((p) => p.x0)), y0: Math.min(...parts.map((p) => p.y0)), x1: Math.max(...parts.map((p) => p.x1)), y1: Math.max(...parts.map((p) => p.y1)) };
    const region = filterRegion(filter, [box], IDENTITY);
    const slack = 0.5;
    return region.x <= reach.x0 + slack && region.y <= reach.y0 + slack && region.x + region.width >= reach.x1 - slack && region.y + region.height >= reach.y1 - slack ? effect : null;
  };

  // The elements whose filter region is being measured (a picture's box holds it).
  const regionOf = new Set();
  /**
   * Where a filter draws, in the document: its region (x, y, width, height on the <filter>; by default
   * a tenth of the box it filters past each side), over `boxes`, the document boxes of what it holds,
   * or in the user space of the element it is on (`m`).
   */
  const filterRegion = (filter, boxes, m) => {
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const w = Math.max(...boxes.map((b) => b.x + b.width)) - x0;
    const h = Math.max(...boxes.map((b) => b.y + b.height)) - y0;
    // Its region's attributes, each from the filter or, where it has none, the one it refers to (href).
    const a = {};
    for (let at = filter, depth = 0; at && depth < 8; depth += 1) {
      for (const key of ['x', 'y', 'width', 'height', 'filterUnits']) if (a[key] == null && at.attributes?.[key] != null) a[key] = at.attributes[key];
      at = defs.filter.get(String(at.attributes?.href ?? at.attributes?.['xlink:href'] ?? '').replace(/^#/, ''));
    }
    const length = (value, fallback, whole) => {
      const text = String(value ?? '').trim();
      if (!text) return fallback;
      const n = parseFloat(text);
      if (!Number.isFinite(n)) return fallback;
      return text.endsWith('%') ? (n / 100) * whole : n;
    };
    if (String(a.filterUnits ?? '') === 'userSpaceOnUse') {
      const rx = length(a.x, NaN, frame.width);
      const ry = length(a.y, NaN, frame.height);
      const rw = length(a.width, NaN, frame.width);
      const rh = length(a.height, NaN, frame.height);
      if ([rx, ry, rw, rh].every(Number.isFinite) && rw > 0 && rh > 0) {
        const corners = [apply(m, rx, ry), apply(m, rx + rw, ry), apply(m, rx, ry + rh), apply(m, rx + rw, ry + rh)];
        const xs = corners.map((p) => p.x);
        const ys = corners.map((p) => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      }
    }
    // Fractions of the box (objectBoundingBox, the default): '-10%' or -0.1.
    const fraction = (value, fallback) => {
      const text = String(value ?? '').trim();
      const n = parseFloat(text);
      if (!text || !Number.isFinite(n)) return fallback;
      return text.endsWith('%') ? n / 100 : n;
    };
    const fx = fraction(a.x, -0.1);
    const fy = fraction(a.y, -0.1);
    const fw = Math.max(0, fraction(a.width, 1.2));
    const fh = Math.max(0, fraction(a.height, 1.2));
    return { x: x0 + fx * w, y: y0 + fy * h, width: fw * w, height: fh * h };
  };

  /**
   * An element drawn as a picture of itself: a turning layer drawn at one of several angles, an
   * element with a filter, a group with a blend mode. The element as the file has it, under its
   * groups' transform and the paint they hand down, over the box its shapes cover and its filters'
   * regions. Its groups' clips and masks are its mask; its own are in it.
   */
  const pictureLayer = (node, { matrix, inherited, opacity, names, stack, depth, own, label, chain, switchedOff, hidden }) => {
    // Where it draws: the layers it would have made, measured and taken back.
    const mark = layers.length;
    measuring += 1;
    try {
      visit(node, matrix, inherited, opacity, names, stack, depth);
    } finally {
      measuring -= 1;
    }
    const made = layers.splice(mark);
    for (const layer of made) if (layer.part.name) taken.delete(layer.part.name);
    if (!made.length) return;
    let markup = source.slice(node.start, node.end);
    // A layer switched off in the file comes in hidden (below), not blank.
    if (switchedOff) markup = markup.replace(/^(<[^>]*?)\sdisplay\s*=\s*["']none["']/, '$1').replace(/^(<[^>]*?style\s*=\s*["'][^"']*?)display\s*:\s*none;?/, '$1');
    const x0 = Math.min(...made.map((layer) => layer.box.x));
    const y0 = Math.min(...made.map((layer) => layer.box.y));
    const x1 = Math.max(...made.map((layer) => layer.box.x + layer.box.width));
    const y1 = Math.max(...made.map((layer) => layer.box.y + layer.box.height));
    const box = { x: round(x0 - 1, 3), y: round(y0 - 1, 3), width: round(x1 - x0 + 2, 3), height: round(y1 - y0 + 2, 3) };
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

    // A gradient as a paint, at the paint's own opacity: one stop is that stop's colour, as SVG paints
    // it, and none is nothing. { colour } or { gradient }, or null.
    const gradientPaint = (target, opacity) => {
      const stops = gradientStops(target, gradients, classes);
      if (stops.length === 1) return { colour: fadeArgb(stops[0].color, opacity) };
      const gradient = gradientFill(target, gradients, classes, local, inner, m);
      if (!gradient) return null;
      if (opacity < 1) gradient.stops = gradient.stops.map((stop) => ({ ...stop, color: fadeArgb(stop.color, opacity) }));
      return { gradient };
    };

    let fill = { colour: '00000000', gradient: null, picture: '' };
    if (!lineOnly) {
      const target = fillRef ? defs.paint.get(fillRef) : null;
      if (target?.name === 'linearGradient' || target?.name === 'radialGradient') {
        const paint = gradientPaint(target, opacityOf(style['fill-opacity']));
        if (paint?.colour) fill = { colour: paint.colour, gradient: null, picture: '' };
        else if (paint?.gradient) fill = { colour: '00000000', gradient: paint.gradient, picture: '' };
        else if (gradientStops(target, gradients, classes).length) note('paint', label);
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
    // A stroke painted with a pattern: a picture of the stroke, over the shape (below).
    let patternStroke = null;
    if (strokeColour === 'gradient' && defs.paint.get(strokeRef)?.name === 'pattern') {
      patternStroke = defs.paint.get(strokeRef);
    } else if (strokeColour === 'gradient') {
      const target = defs.paint.get(strokeRef);
      const paint = target?.name === 'linearGradient' || target?.name === 'radialGradient' ? gradientPaint(target, opacityOf(style['stroke-opacity'])) : null;
      if (paint?.colour) stroke = { colour: paint.colour, width: round(Math.max(0.5, strokeWidth)) };
      else if (paint?.gradient) stroke = { colour: paint.gradient.stops?.[0]?.color ?? 'FF000000', width: round(Math.max(0.5, strokeWidth)), gradient: paint.gradient };
      else if (!target || gradientStops(target, gradients, classes).length) note('paint', label);
    } else if (strokeColour) {
      stroke = { colour: argb(strokeColour, opacityOf(style['stroke-opacity']) * colourAlpha(strokeValue, style.color)), width: round(Math.max(0.5, strokeWidth)) };
    }
    const filled = fill.colour !== '00000000' || fill.gradient || fill.picture;
    if (!stroke && !filled && !patternStroke) return;

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
    if (stroke || filled) emit(fill, stroke, !open);
    if (patternStroke) {
      // As SVG strokes it: the outline in its own space, the pattern, the stroke's width, caps, joins
      // and dashes, over the box the stroke can reach (a mitred corner past half its width).
      const own = ownStyle(node, classes);
      const extra = ['stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset']
        .map((key) => [key, node.attributes?.[key] ?? own[key]]).filter(([, value]) => value != null)
        .map(([key, value]) => ` ${key}="${String(value).replace(/"/g, '&quot;')}"`).join('');
      const opacity = opacityOf(style['stroke-opacity']);
      const reach = strokeWidth * 2;
      const box = { x: round(bounds.x - reach, 3), y: round(bounds.y - reach, 3), width: round(bounds.width + reach * 2, 3), height: round(bounds.height + reach * 2, 3) };
      const section = deepClone(SECTION_DEFAULTS.Background);
      Object.assign(section._children.Fill, {
        solidEnabled: false, imageEnabled: true, imageFit: 'stretch', imageOpacity: 100,
        imageSrc: picture(box, `<g transform="${matrixText(m)}"><path d="${data}" fill="none" stroke="url(#${strokeRef})" stroke-width="${num(style['stroke-width'], 1)}"${opacity < 1 ? ` stroke-opacity="${opacity}"` : ''}${extra}/></g>`),
      });
      section._children.Border.enabled = false;
      section._children.Corners.radius = 0;
      const part = createPartNode(uniqueLayerName(`${label} outline`, taken), {
        role: 'image',
        kind: 'rectangle',
        opacity: round(alpha, 3),
        layout: { x: box.x, y: box.y, width: box.width, height: box.height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
        sections: { Background: section, ...(blend ? { Effects: blendEffects(blend) } : {}) },
      });
      applyMasks(part, box, masks);
      layers.push({ name: label, part, box, names: chain });
    }
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
    const linked = String(node.attributes?.href ?? node.attributes?.['xlink:href'] ?? '').trim();
    // A linked picture is read from beside the file, where the command could (files). An embedded one
    // as the file has it, less the line breaks its base64 is often wrapped with, which a browser takes
    // in an SVG and not in the CSS a layer's picture is drawn with.
    const embedded = /^data:image\//i.test(linked) ? (/;base64,/i.test(linked) ? linked.replace(/\s+/g, '') : linked) : '';
    const href = embedded || String(files?.[linked] ?? '');
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
    // Placed in its box as preserveAspectRatio says: by default whole and centred (meet), or filling
    // it and cut (slice), or stretched to it (none). A picture that is itself an SVG fills the box and
    // places itself by its own viewBox, as a browser draws it.
    const [align = 'xMidYMid', meetOrSlice = 'meet'] = String(node.attributes?.preserveAspectRatio ?? '').trim().split(/\s+/).filter(Boolean);
    const fit = align === 'none' || /^data:image\/svg/i.test(href) ? 'stretch' : meetOrSlice === 'slice' ? 'cover' : 'contain';
    const placed = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.exec(align);
    const column = { Min: 'left', Mid: '', Max: 'right' }[placed?.[1] ?? 'Mid'];
    const row = { Min: 'top', Mid: '', Max: 'bottom' }[placed?.[2] ?? 'Mid'];
    const imageAlign = [row, column].filter(Boolean).join('-') || 'center';
    Object.assign(section._children.Fill, { solidEnabled: false, imageEnabled: true, imageSrc: href, imageFit: fit, imageAlign, imageOpacity: 100 });
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
  if (noted.has('missing')) warnings.push(`References to a gradient, pattern, clip path, mask or filter that is not in the file: ${list('missing')}.`);
  if (noted.has('link')) warnings.push(`Linked pictures that could not be read: ${list('link')}. Keep them beside the SVG, or embed them before exporting.`);
  if (noted.has('use')) warnings.push(`References to nothing in the file: ${list('use')}.`);
  if (noted.has('loop')) warnings.push(`References that loop back to what holds them, not drawn (as SVG does not draw them): ${list('loop')}.`);
  if (noted.has('effect')) warnings.push(`SVG filters read as the layer's own blur, drop shadows or colour filters, which the Component Designer edits: ${list('effect')}.`);
  if (noted.has('filter')) warnings.push(`Drawn as pictures of themselves, with their SVG filters (blur, drop shadow, lighting) as SVG draws them: ${list('filter')}. They are pictures, not shapes to edit.`);
  if (noted.has('blend')) warnings.push(`Groups with a blend mode, each drawn as a picture of itself so it blends as one: ${list('blend')}.`);
  if (noted.has('unknown')) warnings.push(`Not read: ${list('unknown')}.`);
  if (noted.has('path')) warnings.push(`Paths that could not be read: ${list('path')}.`);

  const name = String(fileName ?? '').replace(/\.[^.]+$/, '').trim() || 'SVG Artwork';
  const built = buildArtworkComponent({ name, width: frame.width, height: frame.height, layers, fileName });
  return { ok: true, name, width: frame.width, height: frame.height, ...built, warnings };
}
