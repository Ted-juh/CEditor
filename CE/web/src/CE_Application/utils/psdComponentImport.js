/**
 * psdComponentImport.js — a Photoshop drawing, made a component of layers.
 *
 * The Photoshop panel importer (utils/psdPanelImport.js) flattens the artwork into one picture
 * behind the controls. This keeps the layers: each becomes a layer of a custom component, so a knob
 * drawn in Photoshop as a body, a shadow, a highlight and a pointer stays four layers, and the
 * pointer can turn while the highlight stays put. GIMP, Krita, Affinity Photo, Photopea and
 * Procreate all save Photoshop files.
 *
 *   a pixel layer                       a picture layer, cropped to its pixels, the layers clipped to
 *                                       it blended in as Photoshop draws them (utils/psdComposite.js)
 *   a shape layer                       a VECTOR layer: its paths (combined by their operations), its
 *                                       fill colour or gradient, its stroke (utils/psdVectors.js)
 *   its layer mask, its vector mask     the layer's own mask (utils/partMask.js), not cut into its
 *                                       pixels: it can be turned off, and a disabled one comes in off
 *   its opacity and blend mode          the layer's (CSS's modes; the few it lacks get the nearest)
 *   its Drop Shadow and Outer Glow      the layer's own shadows, editable (utils/psdLayerStyles.js)
 *   its other styles                    on a shape layer, its own fill, outline, inner shadows and
 *                                       bevel; on a picture, drawn into the pixels, close to Photoshop
 *   an adjustment layer                 applied to every layer under it, pictures, vector and text
 *                                       colours alike (utils/psdAdjustments.js)
 *   a hidden layer                      a hidden layer: often the lit or pressed look
 *   a group (Pass Through)              its layers, its opacity on each, its name on their names
 *   a group with a blend mode or mask   one layer, flattened, since a component has no groups
 *   a text layer                        a text layer, its words, size and colour editable, when the
 *                                       file says them plainly; otherwise its picture
 *
 * What moves is said by the names, as for SVG (utils/artworkComponent.js): "pointer" turns, "fader"
 * slides, "lamp" lights.
 *
 * Pure: bytes in, `{ ok, component, kind, layers, warnings }` out.
 */
import { convertedNotice, readPhotoshop } from './psdRead.js';
// ag-psd is told once, by the panel importer, to make its pixel arrays without a canvas.
import './psdPanelImport.js';
import { compositePsd, layerMaskSampler } from './psdComposite.js';
import { adjustArgb, adjustPixels, adjustmentFunction, psdRgb, unappliedAdjustment } from './psdAdjustments.js';
import { LAYER_STYLES, drawLayerStyles, editableShadows, hasDrawnStyles, pxOf } from './psdLayerStyles.js';
import { combinedPathData, psdGradient, vectorFillOf, vectorStrokeOf } from './psdVectors.js';
import { modelBounds, parsePathData, serializePathData } from './bezierPath.js';
import { pngDataUrl } from './pngEncode.js';
import { createPartNode } from './customComponentFactory.js';
import { linearEdgeNames } from './linearEdges.js';
import { bounceMapOf, colourOfNames, drawnColour, lightMapOf, metalNames } from './pictureRecolour.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { deepClone } from './deepClone.js';
import { buildArtworkComponent, uniqueLayerName } from './artworkComponent.js';

// Photoshop's modes as CSS mix-blend-mode; the ones CSS does not have, as the nearest that it does.
const CSS_BLEND = {
  normal: 'normal', 'pass through': 'normal', dissolve: 'normal',
  multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten',
  'color dodge': 'color-dodge', 'color burn': 'color-burn', 'hard light': 'hard-light', 'soft light': 'soft-light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
  'linear dodge': 'plus-lighter',
};
const NEAREST_BLEND = {
  'linear burn': 'multiply', 'darker color': 'darken', 'lighter color': 'lighten', 'vivid light': 'overlay',
  'linear light': 'overlay', 'pin light': 'overlay', 'hard mix': 'hard-light', subtract: 'difference', divide: 'color-dodge',
};

const isGroup = (layer) => Array.isArray(layer?.children);
// A layer's knockout: 0 none, 1 shallow, 2 deep (utils/psdRead.js reads the level).
const knockoutOf = (layer) => Number(layer?.knockoutLevel ?? (layer?.knockout ? 1 : 0));
// Whether a group holds a layer that knocks out (any, or to the group's start: shallow).
const knocksInside = (group) => (group.children ?? []).some((layer) => !layer.hidden
  && (knockoutOf(layer) > 0 || (isGroup(layer) && knocksInside(layer))));
// Whether a group holds a layer that blends in a mode of its own (Multiply, Screen, ...).
const blendsInside = (group) => (group.children ?? []).some((layer) => !layer.hidden
  && (!['normal', 'pass through'].includes(String(layer.blendMode ?? 'normal')) || (isGroup(layer) && blendsInside(layer))));
// Whether a group holds an adjustment layer (in a group of its own mode it changes that group only).
const adjustsInside = (group) => (group.children ?? []).some((layer) => !layer.hidden
  && (layer.adjustment || (isGroup(layer) && String(layer.blendMode ?? 'pass through') === 'pass through' && adjustsInside(layer))));
const knocksShallowInside = (group) => (group.children ?? []).some((layer) => !layer.hidden
  && (knockoutOf(layer) === 1 || (isGroup(layer) && knocksShallowInside(layer))));
/** An AARRGGBB colour at `k` of its opacity. */
const fadeArgb = (colour, k) => {
  const hex = String(colour ?? '');
  if (k >= 1 || !/^[0-9a-f]{8}$/i.test(hex)) return colour;
  return `${Math.round(parseInt(hex.slice(0, 2), 16) * Math.max(0, k)).toString(16).padStart(2, '0')}${hex.slice(2)}`.toUpperCase();
};
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

function svgPicture(svg) {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** The pixels' bounds where they are not fully clear, or null. */
function opaqueBounds(pixels, width, height) {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function crop(pixels, width, box) {
  const out = new Uint8Array(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    const from = ((box.y + y) * width + box.x) * 4;
    out.set(pixels.subarray(from, from + box.width * 4), y * box.width * 4);
  }
  return out;
}

/** `pixels` cropped to `from` (RGBA), laid in a box `to` of the same picture: clear where it has none. */
function placed(pixels, from, to) {
  const out = new Uint8Array(to.width * to.height * 4);
  for (let y = 0; y < to.height; y += 1) {
    const sy = to.y + y - from.y;
    if (sy < 0 || sy >= from.height) continue;
    const x0 = Math.max(to.x, from.x);
    const x1 = Math.min(to.x + to.width, from.x + from.width);
    if (x1 <= x0) continue;
    out.set(pixels.subarray((sy * from.width + (x0 - from.x)) * 4, (sy * from.width + (x1 - from.x)) * 4), (y * to.width + (x0 - to.x)) * 4);
  }
  return out;
}

function pictureBackground(src) {
  const background = deepClone(SECTION_DEFAULTS.Background);
  Object.assign(background._children.Fill, { solidEnabled: false, imageEnabled: true, imageSrc: src, imageFit: 'stretch', imageOpacity: 100 });
  background._children.Border.enabled = false;
  background._children.Corners.radius = 0;
  return background;
}

function blendEffects(mode) {
  const effects = deepClone(SECTION_DEFAULTS.Effects);
  effects._children.Blend.mode = mode;
  return effects;
}

const hex2 = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');

/** A text layer's words as a text part's Text section, or null when the file does not say them plainly. */
function textSection(layer) {
  const text = layer.text;
  const style = text?.style ?? {};
  const colour = style.fillColor;
  const content = String(text?.text ?? '').replace(/\r/g, '\n').trim();
  if (!content || !(style.fontSize > 0) || !colour || !['r', 'g', 'b'].every((k) => Number.isFinite(colour[k]))) return null;
  // The size in the document: Photoshop scales the type by the layer's transform.
  const scale = Array.isArray(text.transform) ? Math.hypot(text.transform[0] ?? 1, text.transform[1] ?? 0) || 1 : 1;
  const section = deepClone(SECTION_DEFAULTS.Text);
  section.content = content;
  section._children.Fill.colour = `FF${hex2(colour.r)}${hex2(colour.g)}${hex2(colour.b)}`.toUpperCase();
  section._children.Font.size = round(style.fontSize * scale, 1);
  // "Helvetica-Bold" is Helvetica, bold.
  const postscript = String(style.font?.name ?? '');
  const [family, face = ''] = postscript.split('-');
  if (family) section._children.Font.family = family.replace(/([a-z])([A-Z])/g, '$1 $2');
  const bold = /bold|black|heavy/i.test(face) || style.fauxBold === true;
  section._children.Font.weightValue = bold ? 700 : /semi|demi/i.test(face) ? 600 : 400;
  section._children.Font.weight = bold ? 'Bold' : section._children.Font.weightValue === 600 ? 'SemiBold' : 'Regular';
  const justification = String(text.paragraphStyle?.justification ?? 'left');
  section._children.Position.justification = justification === 'center' ? 'centred' : justification === 'right' ? 'right' : 'left';
  return section;
}

/**
 * Read a Photoshop file and plan the component. Never throws: `{ ok: false, error }` says why.
 * `{ ok, name, width, height, component, kind, report, layers, warnings }`.
 *
 * `geometry` (utils/partOutlines.js loadGeometry) combines a shape's paths by their operations;
 * without it they are one even-odd outline.
 */
export function planPsdComponentImport(bytes, { fileName = '', geometry = null } = {}) {
  let read = readPhotoshop(bytes);
  if (!read.ok) return read;
  // A file of one Background layer has no layers at all (or only empty ones), only the picture of the
  // whole file Photoshop keeps beside them: that picture is its one layer.
  const draws = (layer) => (layer.imageData?.width > 0 && layer.imageData?.height > 0) || layer.adjustment || layer.vectorFill
    || layer.vectorMask || layer.text || layer.children?.some(draws);
  if (!read.psd.children?.some(draws)) {
    const flat = readPhotoshop(bytes, { composite: true });
    if (flat.ok && flat.psd.imageData?.data) {
      const { psd: whole } = flat;
      whole.children = [{ name: 'Background', left: 0, top: 0, right: whole.width, bottom: whole.height, imageData: whole.imageData }];
      read = flat;
    }
  }
  const { psd } = read;
  const width = Math.round(psd.width ?? 0);
  const height = Math.round(psd.height ?? 0);
  if (!(width > 0 && height > 0)) return { ok: false, error: 'The Photoshop file has no size.' };
  const everything = `M0 0 H${width} V${height} H0 Z`;

  // Each layer as read, before it is a part: adjustment layers further up still change it.
  const records = [];
  const taken = new Set();
  const report = {
    kept: new Set(), drawn: new Set(), approximated: new Set(), unsupported: new Set(), nearest: new Set(),
    flattened: new Set(), pattern: new Set(), dissolve: new Set(),
  };

  const blendOf = (layer, label) => {
    const mode = String(layer.blendMode ?? 'normal');
    const css = CSS_BLEND[mode] ?? NEAREST_BLEND[mode] ?? 'normal';
    if (!CSS_BLEND[mode]) report.nearest.add(`${label} (${mode})`);
    return css;
  };

  /** A layer's mask over `box` (document pixels): its pixel mask, its vector mask, or both. */
  const maskOver = (layer, box, { vector = true } = {}) => {
    const pixel = layer.mask?.imageData && !layer.mask.fromVectorData ? layer.mask : null;
    const path = vector && layer.vectorMask?.paths?.length ? combinedPathData(layer.vectorMask, { geometry, everything }) : null;
    if (!pixel && !path) return null;
    let pixelPicture = '';
    if (pixel) {
      const sample = layerMaskSampler({ ...layer, mask: { ...pixel, disabled: false } });
      const alpha = new Uint8Array(box.width * box.height * 4);
      for (let y = 0; y < box.height; y += 1) {
        for (let x = 0; x < box.width; x += 1) {
          const p = (y * box.width + x) * 4;
          alpha[p] = 255; alpha[p + 1] = 255; alpha[p + 2] = 255;
          alpha[p + 3] = Math.round((sample ? sample(box.x + x, box.y + y) : 1) * 255);
        }
      }
      pixelPicture = pngDataUrl(box.width, box.height, alpha);
    }
    let src = pixelPicture;
    if (path) {
      // The vector mask as an SVG picture over the box; with a pixel mask too, that picture cut by it.
      const invert = layer.vectorMask.invert === true;
      const shape = invert ? `${everything} ${path.d}` : path.d;
      const rule = invert ? 'evenodd' : path.fillRule;
      const content = pixelPicture
        ? `<defs><clipPath id="v"><path d="${shape}" clip-rule="${rule}"/></clipPath></defs><image href="${pixelPicture}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" preserveAspectRatio="none" clip-path="url(#v)"/>`
        : `<path d="${shape}" fill="#fff" fill-rule="${rule}"/>`;
      src = svgPicture(`<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" preserveAspectRatio="none">${content}</svg>`);
    }
    // Photoshop's "Disable Layer Mask" keeps the mask, unapplied.
    const off = (pixel && pixel.disabled) || (path && layer.vectorMask.disable);
    return { enabled: !off, src, x: 0, y: 0, width: 100, height: 100, invert: false };
  };

  /** The styles that stay settings: shadows and glows, for any layer. */
  const shadowsOf = (layer) => {
    const { items, kept } = editableShadows(layer.effects);
    for (const name of kept) report.kept.add(name);
    return items;
  };

  /** One unit (a layer and the layers clipped to it, or an isolated group) as a record. */
  const unitRecord = (unit, clipped, opacity, names) => {
    const label = String(unit.name ?? '').trim() || 'Layer';
    const css = blendOf(unit, label);
    const chain = [label, ...names];
    const visible = !unit.hidden;
    const alpha = opacity * (unit.opacity ?? 1);
    const clippedAdjustments = clipped.filter((layer) => layer.adjustment && !layer.hidden);
    const clippedPixels = clipped.filter((layer) => !layer.adjustment);

    // Text the file says plainly is set as text, editable; with styles it is its picture, styles drawn.
    const section = !isGroup(unit) && !clipped.length && !hasDrawnStyles(unit.effects) ? textSection(unit) : null;
    if (section) {
      // Its Fill opacity on its type, not on its styles.
      if ((unit.fillOpacity ?? 1) < 1) section._children.Fill.colour = fadeArgb(section._children.Fill.colour, unit.fillOpacity);
      const box = { x: unit.left ?? 0, y: unit.top ?? 0, width: Math.max(1, (unit.right ?? 0) - (unit.left ?? 0)), height: Math.max(1, (unit.bottom ?? 0) - (unit.top ?? 0)) };
      records.push({ type: 'text', label, chain, visible, alpha, css, box, section, shadows: shadowsOf(unit), mask: maskOver(unit, box) });
      return;
    }

    // A shape layer: its paths, filled and stroked, as a vector layer you can still reshape.
    // A fill layer with no vector mask fills the whole document (Layer › New Fill Layer).
    const wholeFill = !isGroup(unit) && unit.vectorFill && !unit.vectorMask?.paths?.length && !(unit.imageData?.width > 0);
    const fill = !isGroup(unit) && unit.vectorFill && (unit.vectorMask?.paths?.length || wholeFill) && !clippedPixels.length ? vectorFillOf(unit.vectorFill) : null;
    if (fill) {
      const outline = wholeFill
        ? { d: `M0 0L${width} 0L${width} ${height}L0 ${height}Z`, fillRule: 'nonzero' }
        : combinedPathData(unit.vectorMask, { geometry, everything });
      const model = outline ? parsePathData(outline.d) : [];
      const bounds = model.length ? modelBounds(model) : null;
      // The gradient laid over the shape's own box, as Photoshop lays it.
      const shaped = bounds && vectorFillOf(unit.vectorFill, bounds);
      if (bounds && bounds.width > 0 && bounds.height > 0 && shaped) {
        Object.assign(fill, shaped);
        const stroke = vectorStrokeOf(unit.vectorStroke, bounds);
        const strokeWidth = stroke?.width ?? 0;
        const box = { x: bounds.x - strokeWidth / 2, y: bounds.y - strokeWidth / 2, width: bounds.width + strokeWidth, height: bounds.height + strokeWidth };
        const noFill = unit.vectorStroke?.fillEnabled === false;
        // Its Fill opacity on its fill and its stroke, not on its styles.
        const content = unit.fillOpacity ?? 1;
        const faded = (paint) => (paint && content < 1 ? {
          ...paint,
          colour: fadeArgb(paint.colour, content),
          ...(paint.gradient ? { gradient: { ...paint.gradient, stops: paint.gradient.stops.map((stop) => ({ ...stop, color: fadeArgb(stop.color, content) })) } } : {}),
        } : paint);
        records.push({
          type: 'vector', label, chain, visible, alpha, css, box,
          fill: noFill ? { colour: '00000000', gradient: null } : faded(fill),
          stroke: faded(stroke),
          pathData: serializePathData(normalizeTo(model, bounds), 5),
          fillRule: outline.fillRule,
          shadows: shadowsOf(unit),
          styles: unit.effects,
          // Its own pixel mask; its vector mask is its outline.
          mask: maskOver(unit, { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width) + 1, height: Math.ceil(box.height) + 1 }, { vector: false }),
          adjustments: clippedAdjustments,
        });
        return;
      }
    }
    if (unit.vectorFill?.type === 'pattern') report.pattern.add(label);

    // A picture: drawn on its own, at full opacity and in Normal mode (those are the layer's), its
    // masks kept apart as its mask, then its styles drawn in from its shape. A fill layer with no
    // pixels is drawn from its vector mask, which is then its shape rather than a mask of it. What is
    // inside it (a group's layers, the layers clipped to it) is drawn with its styles and adjustments.
    const mode = String(unit.blendMode ?? 'normal');
    const fromPaths = Boolean(unit.vectorFill) && !(unit.imageData?.width > 0);
    const alone = {
      ...unit, hidden: false, opacity: 1, blendMode: isGroup(unit) && mode === 'pass through' ? 'pass through' : 'normal', clipping: false,
      mask: undefined, vectorMask: fromPaths ? unit.vectorMask : undefined, effects: undefined,
    };
    const stack = (fillOpacity) => [{ ...alone, fillOpacity }, ...clippedPixels.map((layer) => ({ ...layer, clipping: true }))];
    const fillOpacity = unit.fillOpacity ?? 1;
    const flatten = (fill) => {
      const out = compositePsd(stack(fill), width, height, { styles: LAYER_STYLES, grey: Boolean(psd.grey), cmyk: read.converted === 'CMYK', cmykProfile: psd.cmykProfile });
      for (const name of out.styles ?? out.closeTo.styles) report.drawn.add(name);
      for (const name of out.closeTo.adjustments) report.approximated.add(name);
      for (const name of out.notDrawn.adjustment) report.unsupported.add(name);
      for (const name of out.dissolve) report.dissolve.add(name);
      return out.pixels;
    };
    const pixels = flatten(fillOpacity);
    if (hasDrawnStyles(unit.effects)) {
      const full = fillOpacity < 1 ? flatten(1) : pixels;
      const shape = new Float32Array(width * height);
      for (let i = 0; i < shape.length; i += 1) shape[i] = full[i * 4 + 3] / 255;
      for (const name of drawLayerStyles(pixels, shape, width, height, unit.effects)) report.drawn.add(name);
    }
    // Clipped adjustments change this unit alone.
    for (const layer of clippedAdjustments) {
      const fn = adjustmentFunction(layer.adjustment, report.approximated, { grey: Boolean(psd.grey), cmyk: read.converted === 'CMYK' });
      if (fn) adjustPixels(pixels, width, 0, 0, fn, { strength: layer.opacity ?? 1, mask: layerMaskSampler(layer, { width, height }) });
      else report.unsupported.add(`${layer.name || 'unnamed'} (${unappliedAdjustment(layer.adjustment)})`);
    }
    const box = opaqueBounds(pixels, width, height);
    if (!box) return;
    records.push({
      type: 'picture', label, chain, visible, alpha, css, box,
      pixels: crop(pixels, width, box),
      shadows: shadowsOf(unit),
      mask: maskOver(unit, box, { vector: !fromPaths }),
    });
  };

  /** An adjustment layer: what it does, to every layer read so far (they are all under it). */
  const adjust = (layer, opacity) => {
    const fn = adjustmentFunction(layer.adjustment, report.approximated, { grey: Boolean(psd.grey), cmyk: read.converted === 'CMYK' });
    if (!fn) { report.unsupported.add(`${layer.name || 'unnamed'} (${unappliedAdjustment(layer.adjustment)})`); return; }
    const strength = opacity * (layer.opacity ?? 1);
    const mask = layerMaskSampler(layer, { width, height });
    for (const record of records) {
      if (record.type === 'picture') adjustPixels(record.pixels, record.box.width, record.box.x, record.box.y, fn, { strength, mask });
      else if (record.type === 'vector') {
        record.fill = { ...record.fill, colour: adjustArgb(record.fill.colour, fn), gradient: record.fill.gradient && { ...record.fill.gradient, stops: record.fill.gradient.stops.map((stop) => ({ ...stop, color: adjustArgb(stop.color, fn) })) } };
        if (record.stroke) record.stroke = { ...record.stroke, colour: adjustArgb(record.stroke.colour, fn) };
      } else if (record.type === 'text') {
        record.section._children.Fill.colour = adjustArgb(record.section._children.Fill.colour, fn);
      }
    }
  };

  /**
   * A knockout through layers that are layers of their own (Blending Options › Knockout): each layer
   * read since `from` that it reaches (not the Background) gets a hole its shape, as deep as its
   * opacity. A picture's own pixels are cut; a shape's or text's mask takes the hole.
   */
  const cutBelow = (unit, strength, from) => {
    const alone = { ...unit, hidden: false, opacity: 1, fillOpacity: 1, blendMode: 'normal', clipping: false, knockoutLevel: 0, knockout: false };
    const { pixels: shape } = compositePsd([alone], width, height);
    const cover = (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? (shape[(y * width + x) * 4 + 3] / 255) * strength : 0);
    for (let r = from; r < records.length; r += 1) {
      const record = records[r];
      if (record.background) continue;
      if (record.type === 'picture') {
        const { x: bx, y: by, width: bw, height: bh } = record.box;
        for (let y = 0; y < bh; y += 1) {
          for (let x = 0; x < bw; x += 1) {
            const c = cover(bx + x, by + y);
            if (c > 0) record.pixels[(y * bw + x) * 4 + 3] = Math.round(record.pixels[(y * bw + x) * 4 + 3] * (1 - c));
          }
        }
        continue;
      }
      const w = Math.max(1, Math.ceil(record.box.width));
      const h = Math.max(1, Math.ceil(record.box.height));
      const hole = new Uint8Array(w * h * 4);
      let cut = false;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const c = cover(Math.floor(record.box.x + ((x + 0.5) * record.box.width) / w), Math.floor(record.box.y + ((y + 0.5) * record.box.height) / h));
          const p = (y * w + x) * 4;
          hole[p] = 255; hole[p + 1] = 255; hole[p + 2] = 255; hole[p + 3] = Math.round(255 * (1 - c));
          if (c > 0) cut = true;
        }
      }
      if (!cut) continue;
      const src = pngDataUrl(w, h, hole);
      const own = record.mask?.enabled ? record.mask : null;
      record.mask = own
        ? { ...own, src: svgPicture(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><mask id="k" style="mask-type:alpha"><image href="${src}" width="${w}" height="${h}" preserveAspectRatio="none"/></mask></defs><image href="${own.src}" width="${w}" height="${h}" preserveAspectRatio="none" mask="url(#k)"/></svg>`) }
        : { enabled: true, src, x: 0, y: 0, width: 100, height: 100, invert: false };
    }
  };

  /**
   * A layer list, bottom first, as Photoshop stacks it: each base with the layers clipped to it.
   * `start`: the first record of the group being read, where a shallow knockout in it stops.
   */
  const walk = (list, opacity, names, hidden, start = 0, top = true) => {
    const all = list ?? [];
    for (let i = 0; i < all.length; i += 1) {
      const base = all[i];
      const clipped = [];
      while (i + 1 < all.length && all[i + 1].clipping) clipped.push(all[(i += 1)]);
      if (base.clipping) continue;
      if (base.adjustment) {
        if (!base.hidden && !hidden) adjust(base, opacity);
        continue;
      }
      const unit = hidden ? { ...base, hidden: true } : base;
      // A knockout cuts what is under it first: to its group's start (shallow), or to the Background
      // (deep, and either at the top of the file).
      const knock = knockoutOf(base);
      if (knock > 0 && !base.hidden && !hidden) cutBelow(base, opacity * (base.opacity ?? 1), knock >= 2 || top ? 0 : start);
      if (isGroup(base)) {
        // Below 100% Fill, Photoshop draws a Pass Through group as a Normal one.
        const passes = String(base.blendMode ?? 'pass through') === 'pass through';
        const mode = passes && (base.fillOpacity ?? 1) < 1 ? 'normal' : String(base.blendMode ?? 'pass through');
        // A group holding a knockout that stops at it is one picture, drawn as Photoshop draws it: one
        // that knocks out to the group's start (shallow), or any in a group of its own mode, Normal
        // included, which Photoshop puts together on its own. A deep one in a Pass Through group
        // reaches past it to the Background, and cuts the layers on its way (cutBelow).
        // A Normal group whose layers blend (Multiply, Screen) blends them with each other only, not with
        // what is under the group, and an adjustment in it changes only the group: one picture too. So
        // is a group with a mask, which is the picture's mask.
        const masked = (base.mask && !base.mask.disabled) || (base.vectorMask?.paths?.length && !base.vectorMask.disable);
        const isolated = (mode !== 'pass through' && mode !== 'normal') || clipped.length || masked
          || knocksShallowInside(base) || (mode !== 'pass through' && (knocksInside(base) || blendsInside(base) || adjustsInside(base)));
        if (isolated) {
          report.flattened.add(base.name || 'a group');
          unitRecord(unit, clipped, opacity, names);
        } else {
          walk(base.children, opacity * (base.opacity ?? 1) * (base.fillOpacity ?? 1), base.name ? [base.name, ...names] : names, hidden || base.hidden, records.length, false);
        }
        continue;
      }
      const before = records.length;
      unitRecord(unit, clipped, opacity, names);
      // The Background layer (the bottom one, its transparency locked), which a knockout stops at.
      if (top && i === 0 && base.transparencyProtected && records.length > before) records[before].background = true;
    }
  };
  walk(psd.children, 1, [], false);

  // The records as parts. A picture the file names for it (the Blender add-on's parts that stay put)
  // has its edge mixed for the panel under it as light mixes (utils/linearEdges.js).
  const linearEdges = linearEdgeNames(psd.imageResources?.xmpMetadata);
  // The light on a colour layer and its gloss ("<name> lighting", "<name> gloss"), which the Blender
  // add-on writes beside its colour layers, in linear light, for CEditor to work the part out again in
  // another colour (utils/pictureRecolour.js). Not parts: they go with the picture they are for.
  const lights = new Map();
  for (const record of records) {
    const map = record.type === 'picture' ? lightMapOf(record.label) : null;
    if (!map) continue;
    lights.set(map.of, { ...lights.get(map.of), [map.kind]: record });
    record.lightMap = true;
  }
  // The light one part throws on another by way of its colour, and the panel's under them (hidden
  // layers the add-on writes: "skirt lighting from cap", "bounce from skirt", "bounce base"), for a
  // part lit in another's new colour. Not parts either.
  const thrown = new Map();
  for (const record of records) {
    const map = record.type === 'picture' && !record.lightMap && record.visible === false ? bounceMapOf(record.label) : null;
    if (!map) continue;
    thrown.set(map.of, [...(thrown.get(map.of) ?? []), { ...map, record }]);
    record.lightMap = true;
  }
  const xmp = psd.imageResources?.xmpMetadata;
  const metal = metalNames(xmp);
  const layers = [];
  for (const record of records) {
    if (record.lightMap) continue;
    const effects = record.shadows.length || record.css !== 'normal' ? blendEffects(record.css) : null;
    if (effects && record.shadows.length) effects._children.Shadows.items = record.shadows;
    const layout = { x: record.box.x, y: record.box.y, width: record.box.width, height: record.box.height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' };
    let part;
    if (record.type === 'text') {
      part = createPartNode(uniqueLayerName(record.label, taken), {
        role: 'label', kind: 'text', opacity: round(record.alpha, 3), visible: record.visible, layout,
        sections: { Text: record.section, ...(effects ? { Effects: effects } : {}) },
      });
    } else if (record.type === 'vector') {
      const section = vectorBackground(record.fill, record.stroke);
      const vectorEffects = effects ?? blendEffects('normal');
      for (const name of styleVector(record.styles, section, vectorEffects, record.box)) report.kept.add(name);
      part = createPartNode(uniqueLayerName(record.label, taken), {
        role: 'custom', kind: 'path', opacity: round(record.alpha, 3), visible: record.visible,
        layout: { ...layout, x: round(record.box.x), y: round(record.box.y), width: round(record.box.width), height: round(record.box.height) },
        sections: { Background: section, Effects: vectorEffects },
        meta: { pathData: record.pathData, closed: true, ...(record.fillRule === 'evenodd' ? { fillRule: 'evenodd' } : {}) },
      });
    } else {
      part = createPartNode(uniqueLayerName(record.label, taken), {
        role: 'image', kind: 'rectangle', opacity: round(record.alpha, 3), visible: record.visible, layout,
        sections: { Background: pictureBackground(pngDataUrl(record.box.width, record.box.height, record.pixels)), ...(effects ? { Effects: effects } : {}) },
      });
      const fill = part._children.Background._children.Fill;
      if (linearEdges.has(record.label)) fill.imageEdges = 'linear';
      // The colour it was drawn in, which its colour is changed from.
      fill.imageColourDrawn = drawnColour(record.pixels);
      const light = lights.get(record.label);
      if (light?.lighting && light?.gloss) {
        const laid = (map) => pngDataUrl(record.box.width, record.box.height, placed(map.pixels, map.box, record.box));
        fill.imageColourLighting = laid(light.lighting);
        fill.imageColourGloss = laid(light.gloss);
      }
      if (metal.has(record.label) || metal.has(record.label.replace(/\s+at\s+\S+\s*$/i, ''))) fill.imageColourMetal = true;
      const onIt = thrown.get(record.label);
      if (onIt && record.css === 'plus-lighter') {
        // Light a part throws (a turning part's reflection in the cap): the look under it and the share
        // of it off each part's colour.
        const laid = (map) => pngDataUrl(record.box.width, record.box.height, placed(map.pixels, map.box, record.box));
        const byPart = {};
        for (const { kind, from, record: map } of onIt) {
          if (kind === 'base') fill.imageColourUnder = laid(map);
          else if (kind === 'light') byPart[from] = laid(map);
        }
        if (fill.imageColourUnder && Object.keys(byPart).length) fill.imageColourThrown = byPart;
        else delete fill.imageColourUnder;
      } else if (onIt) {
        const laid = (map) => pngDataUrl(record.box.width, record.box.height, placed(map.pixels, map.box, record.box));
        const byPart = {};
        for (const { kind, from, record: map } of onIt) {
          if (kind === 'base') fill.imageColourBase = laid(map);
          else byPart[from] = { ...byPart[from], [kind]: laid(map) };
        }
        // Keyed by the layer it comes off, made its part's name below.
        if (Object.keys(byPart).length) fill.imageColourBounce = byPart;
      }
    }
    if (record.mask) part.mask = record.mask;
    layers.push({ name: record.label, part, box: record.box, names: record.chain });
  }

  if (!layers.length) return { ok: false, error: 'The Photoshop file has no layers with pixels to make layers of.' };
  // The light thrown on a part keyed by the part it comes off; the panel's shine and shadow go with its
  // bounce layer.
  const partNamed = new Map(layers.map((layer) => [layer.name, layer.part.name]));
  // A turning part is written at angles ("pointer at 0", "pointer at 27"): the light it throws is keyed
  // by one of them, made the name of the part of frames they become (utils/artworkComponent.js).
  const partOf = (from) => partNamed.get(from) ?? partNamed.get(`${from} at 0`)
    ?? [...partNamed].find(([label]) => label.toLowerCase().startsWith(`${from.toLowerCase()} at `))?.[1];
  for (const layer of layers) {
    const fill = layer.part._children.Background?._children?.Fill;
    if (fill?.imageColourThrown) {
      fill.imageColourThrown = Object.fromEntries(Object.entries(fill.imageColourThrown)
        .filter(([from]) => partOf(from)).map(([from, map]) => [partOf(from), map]));
      if (!Object.keys(fill.imageColourThrown).length) { delete fill.imageColourThrown; delete fill.imageColourUnder; }
    }
    if (!fill?.imageColourBounce) continue;
    fill.imageColourBounce = Object.fromEntries(Object.entries(fill.imageColourBounce)
      .filter(([from]) => partNamed.has(from)).map(([from, maps]) => [partNamed.get(from), maps]));
    if (!fill.imageColourBase) continue;
    const members = [[`${layer.name} shine`, 'shine'], [layer.name.replace(/bounce$/i, 'shadow'), 'shadow']];
    for (const [label, role] of members) {
      const member = layers.find((each) => each.name === label && each !== layer)?.part._children.Background?._children?.Fill;
      if (member) Object.assign(member, { imageColourFollows: layer.part.name, imageColourRole: role });
    }
  }
  const warnings = [];
  const list = (set) => [...set].slice(0, 5).join(', ') + (set.size > 5 ? ` and ${set.size - 5} more` : '');
  if (read.converted) warnings.push(convertedNotice(read.converted, { profile: Boolean(psd.cmykProfile) }));
  if (report.drawn.size) warnings.push(`Layer styles drawn into the pictures, as Photoshop draws them (what only close to it says why): ${list(report.drawn)}.`);
  if (report.approximated.size) warnings.push(`Adjustments applied close to Photoshop's: ${list(report.approximated)}.`);
  if (report.unsupported.size) warnings.push(`Adjustments not applied: ${list(report.unsupported)}. Merge them into the layers below in Photoshop first.`);
  if (report.dissolve.size) warnings.push(`Dissolve drawn with a grain of its own in pictures: ${list(report.dissolve)}. Photoshop's is random; merge the layer in Photoshop for its exact pixels.`);
  if (report.nearest.size) warnings.push(`Blend modes drawn as the nearest one the editor has: ${list(report.nearest)}.`);
  if (report.flattened.size) warnings.push(`Groups drawn as one layer each, as Photoshop puts them together on their own (their own blend mode or mask, a knockout inside, or a Normal group whose layers blend or hold an adjustment): ${list(report.flattened)}.`);
  if (report.pattern.size) warnings.push(`Pattern-filled shapes come in as their pictures: ${list(report.pattern)}.`);

  const name = String(fileName ?? '').replace(/\.[^.]+$/, '').trim() || 'Photoshop Artwork';
  const built = buildArtworkComponent({ name, width, height, layers, fileName, colourOf: colourOfNames(xmp) });
  return { ok: true, name, width, height, ...built, warnings, kept: [...report.kept] };
}

function normalizeTo(model, box) {
  const unit = (p) => (p ? { x: (p.x - box.x) / (box.width || 1), y: (p.y - box.y) / (box.height || 1) } : null);
  return model.map((subpath) => ({ closed: subpath.closed, nodes: subpath.nodes.map((node) => ({ ...unit(node), in: unit(node.in), out: unit(node.out) })) }));
}

function vectorBackground(fill, stroke) {
  const section = deepClone(SECTION_DEFAULTS.Background);
  const f = section._children.Fill;
  f.colour = fill.colour;
  f.solidEnabled = !fill.gradient;
  if (fill.gradient) Object.assign(f, { gradientEnabled: true, gradient: fill.gradient, gradientOpacity: 100 });
  const b = section._children.Border;
  b.enabled = !!stroke;
  if (stroke) {
    Object.assign(b, { colour: stroke.colour, thickness: stroke.width });
    if (stroke.gradient) Object.assign(b, { fillSolid: false, fillGradient: true, gradient: stroke.gradient, gradientFlow: 'across' });
  }
  section._children.Corners.radius = 0;
  return section;
}

/**
 * A shape layer's styles as the vector layer's own settings, every one still editable: overlays
 * become its fill, a stroke its outline, inner shadows and glows its inner shadows, a bevel its
 * bevel. Returns the names kept.
 */
function styleVector(styles, background, effects, box) {
  const kept = [];
  if (!styles || styles.disabled) return kept;
  const on = (effect) => effect && effect.enabled !== false;
  const fill = background._children.Fill;
  for (const overlay of (styles.gradientOverlay ?? []).filter(on)) {
    const gradient = overlay.align === false ? null : psdGradient({ ...overlay.gradient, style: overlay.type, angle: overlay.angle, reverse: overlay.reverse, scale: overlay.scale, offset: overlay.offset }, box);
    if (gradient) { Object.assign(fill, { gradientEnabled: true, gradient, gradientOpacity: Math.round((overlay.opacity ?? 1) * 100), solidEnabled: false }); kept.push('Gradient Overlay'); }
  }
  for (const overlay of (styles.solidFill ?? []).filter(on)) {
    const rgb = psdRgb(overlay.color);
    fill.colour = `${Math.round((overlay.opacity ?? 1) * 255).toString(16).padStart(2, '0')}${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    Object.assign(fill, { solidEnabled: true, gradientEnabled: false });
    kept.push('Color Overlay');
  }
  const stroke = (styles.stroke ?? []).find(on);
  if (stroke && !background._children.Border.enabled) {
    const rgb = psdRgb(stroke.color);
    Object.assign(background._children.Border, { enabled: true, thickness: pxOf(stroke.size, 3), colour: `${Math.round((stroke.opacity ?? 1) * 255).toString(16).padStart(2, '0')}${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase() });
    kept.push('Stroke');
  }
  const items = effects._children.Shadows.items;
  for (const shadow of (styles.innerShadow ?? []).filter(on)) {
    const a = ((shadow.angle ?? 120) * Math.PI) / 180;
    const distance = pxOf(shadow.distance, 5);
    const rgb = psdRgb(shadow.color);
    items.push({ enabled: true, type: 'inner', offsetX: Math.round(-Math.cos(a) * distance * 10) / 10, offsetY: Math.round(Math.sin(a) * distance * 10) / 10, blur: pxOf(shadow.size, 5), spread: 0, colour: `${Math.round((shadow.opacity ?? 0.75) * 255).toString(16).padStart(2, '0')}${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase() });
    kept.push('Inner Shadow');
  }
  if (on(styles.innerGlow)) {
    const glow = styles.innerGlow;
    const rgb = glow.color ? psdRgb(glow.color) : [255, 255, 190];
    items.push({ enabled: true, type: 'inner-glow', offsetX: 0, offsetY: 0, blur: pxOf(glow.size, 5), spread: 0, colour: `${Math.round((glow.opacity ?? 0.75) * 255).toString(16).padStart(2, '0')}${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase() });
    kept.push('Inner Glow');
  }
  if (on(styles.bevel)) {
    const bevel = styles.bevel;
    const style = { 'inner bevel': 'inner-bevel', 'outer bevel': 'outer-bevel', emboss: 'emboss', 'pillow emboss': 'pillow-emboss' }[bevel.style] ?? 'inner-bevel';
    Object.assign(effects._children.Bevel, {
      enabled: true, style, size: pxOf(bevel.size, 5), softness: pxOf(bevel.soften, 0), depth: Math.round((bevel.strength ?? 1) * 100), angle: bevel.angle ?? 120,
      highlightOpacity: Math.round((bevel.highlightOpacity ?? 0.75) * 100), shadowOpacity: Math.round((bevel.shadowOpacity ?? 0.75) * 100),
    });
    kept.push('Bevel & Emboss');
  }
  return kept;
}
