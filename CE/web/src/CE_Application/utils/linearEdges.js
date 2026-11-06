/**
 * linearEdges.js — a picture's edge mixed with what is under it as light mixes, in linear light.
 *
 * Where a part covers some of a pixel, a renderer mixes its colour with what is behind it. Cycles mixes
 * the light, in linear light; a browser mixes the sRGB numbers, so a pale part's edge over a dark panel
 * comes out darker than Cycles draws it (a one-pixel ring), and the other way round. No CSS blend mixes
 * in linear light, and what is behind is the panel the control is put on, so the file cannot carry the
 * answer: CEditor works it out for the panel. A picture layer marked for it (the Blender add-on marks
 * the parts that stay put, `Background.Fill.imageEdges: 'linear'`) has its partly covered pixels'
 * opacity set so that the browser's sRGB mix gives Cycles' linear one, over the panel's colour under
 * the control and the component's own layers under the part (its shadow, the light on the panel).
 *
 * The pure part works on pixels (and is what the tests hold); `linearEdgeSources` decodes the parts'
 * pictures in a browser and encodes the ones it changes.
 */
import { pngDataUrl } from './pngEncode.js';
import { panelSolidColour } from './backgroundCSS.js';

/**
 * Context: a function giving the panel a surface draws (the preview, the Player). Without one, a
 * control is on the editor's active panel.
 */
export const PANEL_SURFACE_CONTEXT_KEY = 'ce.panelSurface';

/** `entries` ([name, part]) with the parts named in `sources` drawing those pictures instead. */
export function withEdgeSources(entries, sources) {
  if (!sources?.size) return entries;
  return entries.map(([name, part]) => {
    const src = sources.get(name);
    if (!src) return [name, part];
    const background = part._children.Background;
    const fill = background._children.Fill;
    // Mixed from the picture in its colour (utils/pictureRecolour.js), so not to be recoloured again.
    return [name, { ...part, _children: { ...part._children, Background: { ...background, _children: { ...background._children, Fill: { ...fill, imageSrc: src, imageColour: '' } } } } }];
  });
}

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => {
  const x = Math.min(1, Math.max(0, v));
  return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
};

/**
 * `under` (straight sRGB, 0 to 1, opaque) with a layer's straight colour `c` at opacity `a` laid on it,
 * as CSS lays it in `mode`. Modes the add-on writes are exact; any other is laid as normal.
 */
function laid(under, c, a, mode) {
  return under.map((b, i) => {
    const s = c[i];
    switch (mode) {
      case 'plus-lighter': return Math.min(1, b + a * s);
      case 'multiply': return (1 - a) * b + a * s * b;
      case 'screen': return (1 - a) * b + a * (s + b - s * b);
      case 'color-dodge': return (1 - a) * b + a * (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)));
      default: return (1 - a) * b + a * s;
    }
  });
}

/**
 * The opacity that gives an edge pixel of colour `c` covering `coverage` of it, laid over `under`
 * (straight sRGB) in sRGB, as it is mixed in linear light. Where the two are near alike it stays.
 */
export function linearEdgeAlpha(c, coverage, under) {
  const target = c.map((v, i) => toSrgb(coverage * toLinear(v) + (1 - coverage) * toLinear(under[i])));
  let dot = 0;
  let norm = 0;
  for (let i = 0; i < 3; i += 1) {
    const span = c[i] - under[i];
    dot += (target[i] - under[i]) * span;
    norm += span * span;
  }
  if (norm <= 3 * (2 / 255) ** 2) return coverage;
  return Math.min(1, Math.max(0, dot / norm));
}

/**
 * `layers`, bottom first: `{ pixels (RGBA bytes, straight), width, height, x, y, opacity, blend,
 * visible, linear }`, placed in one grid of pixels (x and y whole pixels). `backdrop`: the panel's
 * colour under them, [r, g, b] 0 to 1. Returns a Map from the index of each `linear` layer whose
 * pixels changed to its new pixels.
 */
export function mixEdgesInLinearLight(layers, backdrop) {
  const out = new Map();
  layers.forEach((layer, index) => {
    if (!layer?.linear || layer.visible === false) return;
    const { pixels, width, height } = layer;
    const opacity = Math.max(0, Math.min(1, layer.opacity ?? 1));
    if (!(opacity > 0)) return;
    let changed = null;
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const at = (py * width + px) * 4;
        const alpha = pixels[at + 3];
        if (alpha === 0 || alpha === 255) continue;
        const cx = layer.x + px;
        const cy = layer.y + py;
        let under = backdrop.slice(0, 3);
        for (let j = 0; j < index; j += 1) {
          const below = layers[j];
          if (!below || below.visible === false || !((below.opacity ?? 1) > 0)) continue;
          const bx = cx - below.x;
          const by = cy - below.y;
          if (bx < 0 || by < 0 || bx >= below.width || by >= below.height) continue;
          const bi = (by * below.width + bx) * 4;
          const ba = (below.pixels[bi + 3] / 255) * (below.opacity ?? 1);
          if (ba <= 0) continue;
          under = laid(under, [below.pixels[bi] / 255, below.pixels[bi + 1] / 255, below.pixels[bi + 2] / 255], ba, below.blend ?? 'normal');
        }
        const c = [pixels[at] / 255, pixels[at + 1] / 255, pixels[at + 2] / 255];
        const solved = linearEdgeAlpha(c, (alpha / 255) * opacity, under) / opacity;
        const byte = Math.max(1, Math.min(255, Math.round(solved * 255)));
        if (byte === alpha) continue;
        if (!changed) changed = new Uint8ClampedArray(pixels);
        changed[at + 3] = byte;
      }
    }
    if (changed) out.set(index, changed);
  });
  return out;
}

const rgbOf = (hex) => {
  const digits = String(hex).replace(/^#/, '');
  const rgb = digits.length === 8 ? digits.slice(2) : digits.slice(-6);
  return [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16) / 255);
};

/**
 * The colour under a control on its panel, [r, g, b] 0 to 1: the panel's own colour, with any control
 * drawn before it that holds its middle and is filled with a colour (a section's plate) laid over it.
 * A gradient, a picture or a texture on the panel is not looked into: under them it is the panel's
 * colour.
 */
export function colourUnderControl(panel, control) {
  let colour = rgbOf(panelSolidColour(panel));
  const transform = control?._children?.Transform ?? {};
  const cx = (Number(transform.x) || 0) + (Number(transform.width) || 0) / 2;
  const cy = (Number(transform.y) || 0) + (Number(transform.height) || 0) / 2;
  const controls = Array.isArray(panel?.controls) ? panel.controls : [];
  const id = control?._children?.Core?.id;
  const index = controls.findIndex((other) => other === control || (id != null && other?._children?.Core?.id === id));
  for (const other of index >= 0 ? controls.slice(0, index) : []) {
    if (other?._children?.Core?.visible === false) continue;
    const t = other?._children?.Transform;
    if (!t || cx < t.x || cy < t.y || cx > t.x + t.width || cy > t.y + t.height) continue;
    const fill = other?._children?.Background?._children?.Fill;
    if (!fill || fill.solidEnabled === false) continue;
    const hex = String(fill.colour ?? '').replace(/^#/, '');
    if (!/^([0-9a-f]{2})?[0-9a-f]{6}$/i.test(hex)) continue;
    const alpha = hex.length === 8 ? parseInt(hex.slice(0, 2), 16) / 255 : 1;
    if (alpha <= 0) continue;
    const over = rgbOf(hex);
    colour = colour.map((v, i) => v * (1 - alpha) + over[i] * alpha);
  }
  return colour;
}

/**
 * The layers a Photoshop file names in its XMP for their edge to be mixed for the panel under them
 * (the Blender add-on writes <ceditor:linearEdges>, a bag of layer names).
 */
export function linearEdgeNames(xmp) {
  const block = /<ceditor:linearEdges>([\s\S]*?)<\/ceditor:linearEdges>/.exec(String(xmp ?? ''));
  if (!block) return new Set();
  const unescape = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return new Set([...block[1].matchAll(/<rdf:li>([\s\S]*?)<\/rdf:li>/g)].map((match) => unescape(match[1])));
}

/** Whether a part's picture is to have its edge mixed for what is under it. */
export function hasLinearEdges(part) {
  const fill = part?._children?.Background?._children?.Fill;
  return fill?.imageEdges === 'linear' && fill?.imageEnabled === true && Boolean(fill?.imageSrc);
}

// --- In a browser ------------------------------------------------------------------------------

const decoded = new Map();

/** A picture's pixels, decoded once (straight RGBA, through a canvas): `{ width, height, pixels }`, or null. */
export function picturePixels(src) {
  if (decoded.has(src)) return decoded.get(src);
  const promise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      resolve({ width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data });
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
  decoded.set(src, promise);
  return promise;
}

const made = new Map();

/**
 * For the parts of a component (part nodes, in the order they are drawn), the pictures of those marked
 * for it with their edges mixed over `backdrop`: a Map from part name to a data URL. Pictures are laid
 * where their Layout puts them, in whole pixels at rest; parts that are not pictures are passed over.
 */
export async function linearEdgeSources(parts, backdrop) {
  if (typeof document === 'undefined' || !parts.some(hasLinearEdges)) return new Map();
  const pictures = parts.filter((part) => {
    const fill = part?._children?.Background?._children?.Fill;
    return fill?.imageEnabled === true && String(fill?.imageSrc ?? '').startsWith('data:');
  });
  const key = `${backdrop.map((v) => Math.round(v * 255)).join(',')}|${pictures.map((part) => `${part.name}:${part.visible !== false}:${part.opacity ?? 1}:${part._children.Background._children.Fill.imageSrc.length}:${part._children.Background._children.Fill.imageSrc.slice(-24)}`).join('|')}`;
  if (made.has(key)) return made.get(key);
  const promise = (async () => {
    const read = await Promise.all(pictures.map((part) => picturePixels(part._children.Background._children.Fill.imageSrc)));
    const layers = pictures.map((part, i) => {
      const layout = part._children.Layout ?? {};
      const blend = part._children.Effects?._children?.Blend?.mode ?? 'normal';
      return read[i] ? {
        ...read[i], x: Math.round(Number(layout.x) || 0), y: Math.round(Number(layout.y) || 0),
        opacity: part.opacity ?? 1, visible: part.visible !== false, blend, linear: hasLinearEdges(part),
      } : null;
    });
    const mixed = mixEdgesInLinearLight(layers.map((layer) => layer ?? { width: 0, height: 0, pixels: new Uint8ClampedArray(0), x: 0, y: 0, visible: false }), backdrop);
    const sources = new Map();
    for (const [index, pixels] of mixed) sources.set(pictures[index].name, pngDataUrl(layers[index].width, layers[index].height, pixels));
    return sources;
  })();
  made.set(key, promise);
  if (made.size > 64) made.delete(made.keys().next().value);
  return promise;
}
