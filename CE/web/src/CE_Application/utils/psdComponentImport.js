/**
 * psdComponentImport.js — a Photoshop drawing, made a component of layers.
 *
 * The Photoshop panel importer (utils/psdPanelImport.js) flattens the artwork into one picture
 * behind the controls. This keeps the layers: each becomes a layer of a custom component with its
 * own picture, position, opacity and blend mode, so a knob drawn in Photoshop as a body, a shadow, a
 * highlight and a pointer stays four layers, and the pointer can turn while the highlight stays put.
 * A layer's colour is changed with the picture's tint; its opacity, blend mode, position and size
 * as any layer's. GIMP, Krita, Affinity Photo, Photopea and Procreate all save Photoshop files.
 *
 *   a pixel layer                       a picture layer, cropped to its pixels, its layer mask and
 *                                       Fill opacity baked into them, and the layers clipped to it
 *                                       blended in, as Photoshop draws them (utils/psdComposite.js)
 *   its opacity and blend mode          the layer's opacity and blend mode (the modes CSS has; the
 *                                       few it does not have get the nearest, and the report says so)
 *   a hidden layer                      a hidden layer: often the lit or pressed look, which the
 *                                       names below bring in when the value says so
 *   a group (Pass Through)              its layers, its opacity on each, its name on their names
 *   a group with a blend mode or mask   one layer, flattened, since a component has no groups
 *   a text layer                        a text layer, its words, size and colour editable, when the
 *                                       file says them plainly; otherwise its picture
 *
 * What moves is said by the names, as for SVG (utils/artworkComponent.js): "pointer" turns, "fader"
 * slides, "lamp" lights.
 *
 * Not drawn, and reported by layer name: layer effects (Photoshop keeps them as settings, not
 * pixels), vector masks, adjustment layers.
 *
 * Pure: bytes in, `{ ok, component, kind, layers, warnings }` out.
 */
import { readPsd } from 'ag-psd';
// ag-psd is told once, by the panel importer, to make its pixel arrays without a canvas.
import './psdPanelImport.js';
import { compositePsd } from './psdComposite.js';
import { pngDataUrl } from './pngEncode.js';
import { createPartNode } from './customComponentFactory.js';
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
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

function hasEffects(layer) {
  return Boolean(layer.effects && !layer.effects.disabled && Object.values(layer.effects).some((effect) =>
    effect && typeof effect === 'object'
    && (Array.isArray(effect) ? effect.some((e) => e?.enabled !== false) : effect.enabled !== false)));
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
 */
export function planPsdComponentImport(bytes, { fileName = '' } = {}) {
  let psd;
  try {
    const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    psd = readPsd(buffer, { useImageData: true, skipThumbnail: true, skipCompositeImageData: true, skipLinkedFilesData: true });
  } catch (error) {
    return { ok: false, error: `This is not a Photoshop file CEditor can read (${error?.message ?? error}).` };
  }
  const width = Math.round(psd.width ?? 0);
  const height = Math.round(psd.height ?? 0);
  if (!(width > 0 && height > 0)) return { ok: false, error: 'The Photoshop file has no size.' };

  const layers = [];
  const taken = new Set();
  const notDrawn = { effects: new Set(), vectorMask: new Set(), adjustment: new Set(), nearest: new Set(), flattened: new Set() };

  /** One unit (a layer and the layers clipped to it, or an isolated group) as a picture layer. */
  const pictureLayer = (unit, clipped, opacity, names) => {
    const label = String(unit.name ?? '').trim() || 'Layer';
    const mode = String(unit.blendMode ?? 'normal');
    const css = CSS_BLEND[mode] ?? NEAREST_BLEND[mode] ?? 'normal';
    if (!CSS_BLEND[mode]) notDrawn.nearest.add(`${label} (${mode})`);
    for (const layer of [unit, ...clipped]) {
      if (hasEffects(layer)) notDrawn.effects.add(layer.name || 'unnamed');
      if (layer.vectorMask && !(layer.mask?.imageData && !layer.mask.fromVectorData)) notDrawn.vectorMask.add(layer.name || 'unnamed');
    }
    const chain = [label, ...names];
    const visible = !unit.hidden;

    // Text the file says plainly is set as text, editable; anything else is its picture.
    const section = !isGroup(unit) && !clipped.length ? textSection(unit) : null;
    if (section) {
      const box = { x: unit.left ?? 0, y: unit.top ?? 0, width: Math.max(1, (unit.right ?? 0) - (unit.left ?? 0)), height: Math.max(1, (unit.bottom ?? 0) - (unit.top ?? 0)) };
      const part = createPartNode(uniqueLayerName(label, taken), {
        role: 'label', kind: 'text', opacity: round(opacity * (unit.opacity ?? 1), 3), visible,
        layout: { x: box.x, y: box.y, width: box.width, height: box.height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
        sections: { Text: section, ...(css !== 'normal' ? { Effects: blendEffects(css) } : {}) },
      });
      layers.push({ name: label, part, box, names: chain });
      return;
    }

    // Drawn on its own, at full opacity and in Normal mode: those two are the layer's, not its pixels'.
    const alone = { ...unit, hidden: false, opacity: 1, blendMode: isGroup(unit) && mode === 'pass through' ? 'pass through' : 'normal', clipping: false };
    const { pixels } = compositePsd([alone, ...clipped.map((layer) => ({ ...layer, clipping: true }))], width, height);
    const box = opaqueBounds(pixels, width, height);
    if (!box) return;
    const part = createPartNode(uniqueLayerName(label, taken), {
      role: 'image', kind: 'rectangle', opacity: round(opacity * (unit.opacity ?? 1), 3), visible,
      layout: { x: box.x, y: box.y, width: box.width, height: box.height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
      sections: { Background: pictureBackground(pngDataUrl(box.width, box.height, crop(pixels, width, box))), ...(css !== 'normal' ? { Effects: blendEffects(css) } : {}) },
    });
    layers.push({ name: label, part, box, names: chain });
  };

  /** A layer list, bottom first, as Photoshop stacks it: each base with the layers clipped to it. */
  const walk = (list, opacity, names, hidden) => {
    const all = list ?? [];
    for (let i = 0; i < all.length; i += 1) {
      const base = all[i];
      const clipped = [];
      while (i + 1 < all.length && all[i + 1].clipping) clipped.push(all[(i += 1)]);
      if (base.clipping) continue;
      if (base.adjustment) { notDrawn.adjustment.add(base.name || 'unnamed'); continue; }
      const unit = hidden ? { ...base, hidden: true } : base;
      if (isGroup(base)) {
        const mode = String(base.blendMode ?? 'pass through');
        const isolated = (mode !== 'pass through' && mode !== 'normal') || clipped.length || (base.mask && !base.mask.disabled);
        if (isolated) {
          notDrawn.flattened.add(base.name || 'a group');
          pictureLayer(unit, clipped, opacity, names);
        } else {
          walk(base.children, opacity * (base.opacity ?? 1), base.name ? [base.name, ...names] : names, hidden || base.hidden);
        }
        continue;
      }
      pictureLayer(unit, clipped, opacity, names);
    }
  };
  walk(psd.children, 1, [], false);

  if (!layers.length) return { ok: false, error: 'The Photoshop file has no layers with pixels to make layers of.' };
  const warnings = [];
  const list = (set) => [...set].slice(0, 5).join(', ') + (set.size > 5 ? ` and ${set.size - 5} more` : '');
  if (notDrawn.effects.size) warnings.push(`Layer effects are not drawn: ${list(notDrawn.effects)}. Rasterize the layer style in Photoshop first.`);
  if (notDrawn.vectorMask.size) warnings.push(`Vector masks are not applied: ${list(notDrawn.vectorMask)}. Rasterize the vector mask (or the layer) first.`);
  if (notDrawn.adjustment.size) warnings.push(`Adjustment layers are left out: ${list(notDrawn.adjustment)}. Merge each into the layers it changes first.`);
  if (notDrawn.nearest.size) warnings.push(`Blend modes drawn as the nearest one the editor has: ${list(notDrawn.nearest)}.`);
  if (notDrawn.flattened.size) warnings.push(`Groups with their own blend mode or mask are one layer each: ${list(notDrawn.flattened)}.`);

  const name = String(fileName ?? '').replace(/\.[^.]+$/, '').trim() || 'Photoshop Artwork';
  const built = buildArtworkComponent({ name, width, height, layers, fileName });
  return { ok: true, name, width, height, ...built, layers: layers.length, warnings };
}
