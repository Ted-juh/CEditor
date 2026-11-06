/**
 * svgComponentImport.js — a drawing from a vector editor, made a component of vector layers.
 *
 * The SVG panel importer (utils/svgPanelImport.js) makes a panel: the artwork one picture behind
 * controls placed on it. This makes the drawing itself the control: every shape a layer of a custom
 * component, still a vector, so its colours, gradient, stroke, size and position stay editable in the
 * Component Designer, and nothing is a picture. Illustrator, Inkscape, Affinity Designer, Figma and
 * Sketch all write SVG.
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
import { documentFrame, objectName, parseTransform } from './svgPanelImport.js';
import { modelBounds, parsePathData, serializePathData } from './bezierPath.js';
import { createPartNode } from './customComponentFactory.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { deepClone } from './deepClone.js';
import { buildArtworkComponent, uniqueLayerName } from './artworkComponent.js';

const IDENTITY = [1, 0, 0, 1, 0, 0];
const SKIPPED = new Set(['defs', 'clipPath', 'mask', 'symbol', 'metadata', 'title', 'desc', 'style', 'script',
  'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker', 'sodipodi:namedview', 'namedview', 'foreignObject']);
const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']);
// Inherited as SVG inherits them; opacity is not, it multiplies down the tree.
const INHERITED = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'visibility',
  'font-size', 'font-family', 'font-weight', 'text-anchor', 'display'];
const NAMED = {
  black: '000000', white: 'ffffff', red: 'ff0000', lime: '00ff00', green: '008000', blue: '0000ff', yellow: 'ffff00',
  cyan: '00ffff', aqua: '00ffff', magenta: 'ff00ff', fuchsia: 'ff00ff', gray: '808080', grey: '808080', silver: 'c0c0c0',
  maroon: '800000', olive: '808000', navy: '000080', purple: '800080', teal: '008080', orange: 'ffa500',
};

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
function parseColour(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'transparent') return null;
  if (NAMED[raw]) return NAMED[raw];
  let match = raw.match(/^#([0-9a-f]{6})$/);
  if (match) return match[1];
  match = raw.match(/^#([0-9a-f]{3})$/);
  if (match) return match[1].split('').map((c) => c + c).join('');
  match = raw.match(/^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)/);
  if (match) {
    return match.slice(1, 4).map((v) => {
      const n = v.endsWith('%') ? (Number.parseFloat(v) / 100) * 255 : Number.parseFloat(v);
      return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    }).join('');
  }
  return undefined;
}

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
    return stops.map((stop) => {
      const style = ownStyle(stop, classes);
      const colour = parseColour(style['stop-color'] ?? '#000000') ?? '000000';
      const offset = String(stop.attributes?.offset ?? '0');
      const position = offset.endsWith('%') ? Number.parseFloat(offset) : Number.parseFloat(offset) * 100;
      return { color: argb(colour, opacityOf(style['stop-opacity'])), position: round(Math.max(0, Math.min(100, Number.isFinite(position) ? position : 0)), 1) };
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
  const source = String(text ?? '').replace(/^\uFEFF/, '');
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

  // The document's definitions, carried into every picture made from part of it (a mask, a clip, a
  // pattern), so what they refer to is there: gradients, patterns, styles, clip paths, masks.
  const DEFINITIONS = new Set(['linearGradient', 'radialGradient', 'pattern', 'style', 'filter', 'clipPath', 'mask', 'symbol', 'marker']);
  const definitions = [];
  const gatherDefinitions = (node) => {
    if (DEFINITIONS.has(node.name) && Number.isFinite(node.start) && Number.isFinite(node.end)) {
      definitions.push(source.slice(node.start, node.end));
      return;
    }
    for (const child of node.children ?? []) gatherDefinitions(child);
  };
  gatherDefinitions(root);
  const defsText = definitions.join('');
  /** A picture of `content` (in document pixels) over `box`, for a mask or a fill. */
  const picture = (box, content) => svgPicture(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`
    + ` width="${round(Math.max(1, box.width))}" height="${round(Math.max(1, box.height))}" viewBox="${round(box.x, 3)} ${round(box.y, 3)} ${round(Math.max(1e-3, box.width), 3)} ${round(Math.max(1e-3, box.height), 3)}"`
    + ` preserveAspectRatio="none"><defs>${defsText}</defs>${content}</svg>`);

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

  const visit = (node, matrix, inherited, opacity, names, stack, depth = 0) => {
    if (!node?.name || depth > 64 || SKIPPED.has(node.name)) return;
    const style = { ...inherited };
    const own = ownStyle(node, classes);
    for (const property of INHERITED) if (own[property] != null && own[property] !== 'inherit') style[property] = own[property];
    if (own.display === 'none' || style.visibility === 'hidden') return;
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

    if (node.name === 'g' || node.name === 'svg' || node.name === 'a' || node.name === 'switch') {
      for (const child of node.children ?? []) visit(child, m, style, alpha, chain, here, depth + 1);
      return;
    }
    if (node.name === 'use') {
      const target = ids.get(String(node.attributes?.href ?? node.attributes?.['xlink:href'] ?? '').replace(/^#/, ''));
      if (!target) { note('use', label); return; }
      const shifted = multiply(m, [1, 0, 0, 1, num(node.attributes?.x), num(node.attributes?.y)]);
      visit(target.name === 'symbol' ? { ...target, name: 'g' } : target, shifted, style, alpha, chain, here, depth + 1);
      return;
    }
    if (SHAPES.has(node.name)) {
      shapeLayer(node, m, style, alpha, label, chain, here);
      return;
    }
    if (node.name === 'text') {
      textLayer(node, m, style, alpha, label, chain, here);
      return;
    }
    if (node.name === 'image') {
      imageLayer(node, m, alpha, label, chain, here);
      return;
    }
    note('unknown', `<${node.name}>`);
  };

  const shapeLayer = (node, m, style, alpha, label, chain, stack) => {
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
    const strokeColour = strokeRef ? 'gradient' : parseColour(strokeValue);
    const strokeWidth = strokeColour ? num(style['stroke-width'], 1) * scaleOf(m) : 0;
    const open = node.name === 'line' || node.name === 'polyline' || placed.every((subpath) => !subpath.closed);

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
    // A drawn stroke sits half outside the outline; the layer's box holds all of it, and the
    // renderer insets the outline by half the stroke (editor/InteractivePartRenderer.svelte).
    const half = strokeWidth / 2;
    const box = { x: bounds.x - half, y: bounds.y - half, width: Math.max(1, bounds.width + strokeWidth), height: Math.max(1, bounds.height + strokeWidth) };
    const inner = { x: bounds.x, y: bounds.y, width: Math.max(1e-6, bounds.width), height: Math.max(1e-6, bounds.height) };
    const local = modelBounds(model) ?? inner;

    let fill = { colour: '00000000', gradient: null, picture: '' };
    if (!open) {
      const target = fillRef ? defs.paint.get(fillRef) : null;
      if (target?.name === 'linearGradient' || target?.name === 'radialGradient') {
        fill = { colour: '00000000', gradient: gradientFill(target, gradients, classes, local, inner, m), picture: '' };
      } else if (target?.name === 'pattern') {
        // The pattern drawn over the shape's own box, as SVG draws it there, and the shape clips it.
        fill = { colour: '00000000', gradient: null, picture: picture(inner, `<g transform="${matrixText(m)}"><rect x="${round(local.x, 3)}" y="${round(local.y, 3)}" width="${round(local.width, 3)}" height="${round(local.height, 3)}" fill="url(#${fillRef})"/></g>`) };
      } else if (fillRef) {
        note('missing', label);
      } else {
        const colour = parseColour(fillValue);
        if (colour === undefined) note('paint', label);
        else if (colour) fill = { colour: argb(colour, opacityOf(style['fill-opacity'])), gradient: null, picture: '' };
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
      stroke = { colour: argb(strokeColour, opacityOf(style['stroke-opacity'])), width: round(Math.max(0.5, strokeWidth)) };
    }
    if (!stroke && fill.colour === '00000000' && !fill.gradient && !fill.picture) return;

    const partName = uniqueLayerName(label, taken);
    const part = createPartNode(partName, {
      role: 'custom',
      kind: 'path',
      opacity: round(alpha, 3),
      layout: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height), xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
      sections: { Background: background(fill, stroke) },
      meta: {
        pathData: serializePathData(normalizeModel(placed, inner), 5),
        closed: !open,
        ...(String(style['fill-rule'] ?? '') === 'evenodd' ? { fillRule: 'evenodd' } : {}),
      },
    });
    applyMasks(part, box, masks);
    layers.push({ name: label, part, box, names: chain });
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
    const size = num(style['font-size'], 16) * scaleOf(m);
    const anchor = String(style['text-anchor'] ?? 'start');
    const at = apply(m, x, y);
    // Wide enough for bold capitals, with room either side: a text layer clips what it cannot hold.
    const boldText = /bold|[6-9]00/.test(String(style['font-weight'] ?? ''));
    const width = Math.max(size, content.length * size * (boldText ? 0.74 : 0.64) + size);
    const left = anchor === 'middle' ? at.x - width / 2 : anchor === 'end' ? at.x - width : at.x;
    const box = { x: left, y: at.y - size * 0.85, width, height: size * 1.2 };
    const colour = parseColour(style.fill ?? '#000000') ?? '000000';
    const text = deepClone(SECTION_DEFAULTS.Text);
    text.content = content;
    text._children.Fill.colour = argb(colour, opacityOf(style['fill-opacity']));
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
  for (const child of root.children ?? []) visit(child, frame.matrix, rootStyle, 1, [], []);

  if (!layers.length) return { ok: false, error: 'The drawing has no shapes, text or embedded pictures to make layers of.' };
  const list = (key) => [...(noted.get(key) ?? [])].slice(0, 5).join(', ');
  if (noted.has('paint')) warnings.push(`Paints that are not a colour, gradient or pattern are not read: ${list('paint')}.`);
  if (noted.has('missing')) warnings.push(`References to a gradient, pattern, clip path or mask that is not in the file: ${list('missing')}.`);
  if (noted.has('link')) warnings.push(`Linked pictures that could not be read: ${list('link')}. Keep them beside the SVG, or embed them before exporting.`);
  if (noted.has('use')) warnings.push(`References to nothing in the file: ${list('use')}.`);
  if (noted.has('unknown')) warnings.push(`Not read: ${list('unknown')}.`);
  if (noted.has('path')) warnings.push(`Paths that could not be read: ${list('path')}.`);

  const name = String(fileName ?? '').replace(/\.[^.]+$/, '').trim() || 'SVG Artwork';
  const built = buildArtworkComponent({ name, width: frame.width, height: frame.height, layers, fileName });
  return { ok: true, name, width: frame.width, height: frame.height, ...built, warnings };
}
