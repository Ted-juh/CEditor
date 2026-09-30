/**
 * psdPanelImport.js — a panel drawn in Photoshop, turned into a CEditor panel.
 *
 * The same convention as the SVG importer (utils/svgPanelImport.js has the long version), read from
 * Photoshop's layers instead of SVG elements:
 *
 *   - One layer GROUP is named `components` (or `controls`, `placeholders`, `ceditor`). Each layer
 *     inside it, at any depth, is one control, placed on the layer's bounds — the box Photoshop keeps
 *     tight around the layer's pixels. The group may be hidden; designers usually hide it.
 *   - The layer's NAME says what it is (`knob-cutoff`, `slider volume`, `label-Filter`); the rest of
 *     the name becomes the control's name. With no keyword, its COLOUR decides, as in Rack: red is a
 *     control (a long one a slider, otherwise a knob — a raster layer has no circle to tell by),
 *     green a button, blue a label, magenta an LED, yellow a display.
 *   - Every other visible layer is the artwork, flattened into the panel's background image.
 *
 * Flattening is this file's own, and deliberately modest: layers are painted bottom to top with their
 * opacity and their group's, in normal blending. Blend modes other than normal, clipping masks,
 * layer masks and layer effects are not drawn — each one is reported by layer name, because a
 * background that looks slightly wrong with no explanation is worse than one that says why. The fix
 * the report suggests is Photoshop's own: rasterize or merge that layer before importing.
 *
 * The file is read by ag-psd (MIT) with `useImageData`, so pixels arrive as plain RGBA arrays with no
 * canvas — the same in node, where this is tested, as in the editor — and the background is written
 * as PNG by utils/pngEncode.js.
 *
 * Pure: bytes in, plan out, in the shape buildSvgImportControls takes, so both importers build and
 * name controls identically. The menu command is stores/psdPanelImportActions.js.
 */
import { initializeCanvas, readPsd } from 'ag-psd';
import { PLACEHOLDER_LAYER_NAMES, ROLE_CONTROL_TYPES, colourRole, roleFromName } from './svgPanelImport.js';
import { pngDataUrl } from './pngEncode.js';

const PASSTHROUGH = new Set(['normal', 'pass through']);

// ag-psd makes its pixel arrays through a canvas unless told otherwise — a canvas it borrows from the
// page in a browser, and has none of in node. A plain array is all `useImageData` needs, is the same
// everywhere, and never passes through a canvas's premultiplied alpha. Only this importer uses ag-psd.
initializeCanvas(
  (width, height) => {
    if (typeof document === 'undefined') throw new Error('a canvas is not available here');
    return Object.assign(document.createElement('canvas'), { width, height });
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
);

function isGroup(layer) {
  return Array.isArray(layer?.children);
}

function isPlaceholderGroup(layer) {
  return isGroup(layer) && PLACEHOLDER_LAYER_NAMES.includes(String(layer.name ?? '').trim().toLowerCase());
}

function bounds(layer) {
  const left = Number(layer.left ?? 0);
  const top = Number(layer.top ?? 0);
  return { x: left, y: top, width: Number(layer.right ?? left) - left, height: Number(layer.bottom ?? top) - top };
}

/** The average colour of a layer's opaque pixels, as RRGGBB, or '' when it has none. */
export function dominantColour(pixels) {
  const data = pixels?.data;
  if (!data?.length) return '';
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
  }
  if (!n) return '';
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return `${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

function roleFor(layer, box) {
  const named = roleFromName(layer.name);
  if (named.role) return { role: named.role, rest: named.rest, reason: `named "${layer.name}"` };
  const colour = dominantColour(layer.imageData);
  const byColour = colourRole(colour);
  if (byColour === 'control') {
    const long = Math.max(box.width, box.height) >= 2.2 * Math.max(1, Math.min(box.width, box.height));
    return long
      ? { role: 'slider', rest: named.rest, reason: 'red, long' }
      : { role: 'knob', rest: named.rest, reason: 'red' };
  }
  if (byColour) {
    return { role: byColour, rest: named.rest, reason: { button: 'green', label: 'blue', led: 'magenta', display: 'yellow' }[byColour] };
  }
  return { role: '', rest: named.rest, reason: '' };
}

/**
 * Paint `layer`'s pixels over `canvas` (width × height RGBA, not premultiplied) at `alpha`, in normal
 * blending. Pixels outside the document are clipped.
 */
function paint(canvas, width, height, layer, alpha) {
  const src = layer.imageData;
  if (!src?.data?.length || alpha <= 0) return;
  const left = Math.round(layer.left ?? 0);
  const top = Math.round(layer.top ?? 0);
  for (let sy = 0; sy < src.height; sy += 1) {
    const y = top + sy;
    if (y < 0 || y >= height) continue;
    for (let sx = 0; sx < src.width; sx += 1) {
      const x = left + sx;
      if (x < 0 || x >= width) continue;
      const s = (sy * src.width + sx) * 4;
      const sa = (src.data[s + 3] / 255) * alpha;
      if (sa <= 0) continue;
      const d = (y * width + x) * 4;
      const da = canvas[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c += 1) {
        canvas[d + c] = Math.round((src.data[s + c] * sa + canvas[d + c] * da * (1 - sa)) / oa);
      }
      canvas[d + 3] = Math.round(oa * 255);
    }
  }
}

/**
 * Read a Photoshop file and plan the panel. Never throws: a file it cannot use comes back
 * `ok: false` with an `error` that says what to change.
 *
 * `{ ok, width, height, layer, background, placeholders, skipped, warnings }` — as planSvgPanelImport
 * returns, so buildSvgImportControls and describeSvgImport take either.
 */
export function planPsdPanelImport(bytes) {
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

  let group = null;
  const findGroup = (layers) => {
    for (const layer of layers ?? []) {
      if (group) return;
      if (isPlaceholderGroup(layer)) group = layer;
      else if (isGroup(layer)) findGroup(layer.children);
    }
  };
  findGroup(psd.children);
  if (!group) {
    return {
      ok: false,
      error: `No layer group named "${PLACEHOLDER_LAYER_NAMES[0]}". Put one rectangle or ellipse per control in a group of that name — named like "knob-cutoff", or filled red, green, blue, magenta or yellow.`,
    };
  }

  // Placeholders: every layer in the group, at any depth, hidden or not.
  const placeholders = [];
  const skipped = [];
  const collect = (layers) => {
    for (const layer of layers ?? []) {
      if (isGroup(layer)) { collect(layer.children); continue; }
      const box = bounds(layer);
      const label = layer.name ? `"${layer.name}"` : 'an unnamed layer';
      if (!(box.width > 0 && box.height > 0)) {
        skipped.push({ source: label, reason: 'is empty — it has no pixels to measure' });
        continue;
      }
      const found = roleFor(layer, box);
      if (!found.role) {
        skipped.push({ source: label, reason: 'says neither by name nor by colour what it is — name it like "knob-cutoff", or fill it with a convention colour' });
        continue;
      }
      const text = layer.text?.text ? String(layer.text.text).trim() : found.rest.join(' ');
      placeholders.push({
        role: found.role,
        type: ROLE_CONTROL_TYPES[found.role],
        name: found.rest.join('_'),
        text,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        orientation: found.role === 'slider' && box.height > box.width ? 'vertical' : 'horizontal',
        reason: found.reason,
        source: label,
        key: String(layer.name ?? '').trim(),
      });
    }
  };
  collect(group.children);

  // The artwork: every other visible layer, bottom to top (ag-psd lists children bottom first).
  const canvas = new Uint8Array(width * height * 4);
  const notDrawn = { blend: [], clipping: [], mask: [], effects: [] };
  let painted = 0;
  const flatten = (layers, inherited) => {
    for (const layer of layers ?? []) {
      if (layer === group || layer.hidden) continue;
      const alpha = inherited * (layer.opacity ?? 1);
      const name = layer.name || 'unnamed';
      const blend = String(layer.blendMode ?? 'normal');
      if (!PASSTHROUGH.has(blend)) notDrawn.blend.push(`${name} (${blend})`);
      if (layer.mask) notDrawn.mask.push(name);
      if (layer.effects && Object.values(layer.effects).some((effect) => effect && (Array.isArray(effect) ? effect.some((e) => e?.enabled !== false) : effect.enabled !== false))) {
        notDrawn.effects.push(name);
      }
      if (isGroup(layer)) { flatten(layer.children, alpha); continue; }
      if (layer.clipping) { notDrawn.clipping.push(name); continue; }
      paint(canvas, width, height, layer, alpha * (layer.fillOpacity ?? 1));
      if (layer.imageData?.data?.length) painted += 1;
    }
  };
  flatten(psd.children, 1);

  const warnings = [];
  if (!placeholders.length) warnings.push(`The "${group.name}" group has no layers to place.`);
  const outside = placeholders.filter((p) => p.x + p.width <= 0 || p.y + p.height <= 0 || p.x >= width || p.y >= height);
  if (outside.length) warnings.push(`${outside.length} placeholder(s) sit outside the canvas and will be off the panel.`);
  if (notDrawn.blend.length) warnings.push(`Drawn in normal blending instead of their own mode: ${notDrawn.blend.join(', ')}. Merge or rasterize them in Photoshop for an exact background.`);
  if (notDrawn.clipping.length) warnings.push(`Clipped layers left out: ${notDrawn.clipping.join(', ')}. Merge each into the layer it clips to.`);
  if (notDrawn.mask.length) warnings.push(`Layer masks not applied: ${notDrawn.mask.join(', ')}. Apply the mask in Photoshop first.`);
  if (notDrawn.effects.length) warnings.push(`Layer effects not drawn: ${notDrawn.effects.join(', ')}. Rasterize the layer style in Photoshop first.`);

  const dataUrl = painted ? pngDataUrl(width, height, canvas) : '';
  return {
    ok: true,
    width,
    height,
    layer: String(group.name),
    background: { dataUrl, bytes: dataUrl.length, layers: painted },
    placeholders,
    skipped,
    warnings,
  };
}
