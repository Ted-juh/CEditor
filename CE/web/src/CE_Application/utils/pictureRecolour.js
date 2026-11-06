/**
 * pictureRecolour.js — a picture's colour changed, its light kept.
 *
 * A picture layer (a part whose Background fill is a picture) and a part of frames (utils/
 * imageFrames.js) each have a colour of their own:
 *
 *   Background.Fill: { imageColour, imageColourDrawn, imageColourLighting, imageColourGloss,
 *                      imageColourMetal, imageColourFollows, imageColourRole }
 *   Image:           { colour, colourDrawn, colourMetal, colourFollows, colourRole,
 *                      frames: [{ source, lighting, gloss }, ...] }
 *
 * A light layer another part throws (a turning part's reflection in the parts under it, from the
 * add-on) may carry the share of it that comes off that part's colour and the look under it
 * (`Fill.imageColourThrown` { part: map } and `Fill.imageColourUnder`; on a part of frames each
 * frame's `thrown` and `under`): it is worked out again with that part in its new colour first
 * (`rethrownPixels`), then changed with any part it follows.
 *
 * `imageColour` / `colour` is the colour chosen (AARRGGBB, or a control set's role such as
 * `{control.body}`); empty is the picture as drawn. `…Drawn` is the colour the picture was drawn in,
 * measured on import (`drawnColour`).
 *
 * A picture with the light on it written beside it (`…Lighting`, `…Gloss`: the Blender add-on
 * tools/blender/ceditor_layers.py writes them, in linear light) is worked out again in its new colour
 * with the light layers that go with it (its shading and highlights, `…Follows` it with `…Role`), as
 * the add-on works them out: the colour layer, the shading it multiplies by and the highlights added
 * over it, each pixel from the new colour times the light, plus the gloss, in linear light. So the part
 * is lit as Blender would light it in that colour, its edge and a metal's glint (`…Metal`: light past
 * white kept in its highlights) included (`recolourGroupPixels`).
 *
 * Any other picture is changed in proportion, each pixel, each channel, alpha untouched:
 *
 *   new = old × colour / drawn       (a channel of the drawn colour darker than 8 levels: + colour − drawn)
 *
 * the drawn colour becoming the new one exactly and every other pixel keeping its proportion to it,
 * which is right wherever the light is multiplied into the colour. Light that only follows a part
 * (`…Follows` with no role: a turning part's reflection in a metal) is changed so too.
 *
 * Worked out on the pixels, once per picture and colour, as utils/linearEdges.js works out an edge:
 * `withColourFollows` gives each part what it needs from the parts it goes with,
 * `pictureColourSources` makes the pictures and `withPictureColourSources` puts them in the parts,
 * colour cleared, before anything draws them (CanvasControl, the outline mixing, the static baking,
 * the filmstrip baker); a part not passed through that recolours itself
 * (editor/InteractivePartRenderer.svelte). The pure part works on pixels and is what the tests hold.
 */
import { resolveColourValue } from '../models/controlSets.js';
import { isFramesImage } from './imageFrames.js';
import { isPictureLayer } from './partMask.js';
import { pngDataUrl } from './pngEncode.js';
import { picturePixels } from './linearEdges.js';

/** A colour as [r, g, b] (0 to 255), a role resolved; null for none, or one fully transparent. */
export function colourRgb(value) {
  const raw = String(resolveColourValue(String(value ?? '').trim()) ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(raw)) {
    if (parseInt(raw.slice(0, 2), 16) === 0) return null;
    return [2, 4, 6].map((at) => parseInt(raw.slice(at, at + 2), 16));
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return [0, 2, 4].map((at) => parseInt(raw.slice(at, at + 2), 16));
  return null;
}

const hex2 = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase();

/** [r, g, b] as AARRGGBB, opaque. */
export function rgbColour(rgb) {
  return `FF${rgb.map(hex2).join('')}`;
}

/**
 * The colour a picture was drawn in (RGBA pixels, straight): the median of the pixels it covers most,
 * those within two levels of its highest opacity. AARRGGBB, or '' for a picture with nothing in it.
 */
export function drawnColour(pixels) {
  let most = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > most) most = pixels[i];
  if (!most) return '';
  // Counted, not sorted: a picture of a quarter of a million pixels is read at every import.
  const counts = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < most - 2) continue;
    n += 1;
    for (let c = 0; c < 3; c += 1) counts[c][pixels[i + c]] += 1;
  }
  const median = (count) => {
    let seen = 0;
    for (let v = 0; v < 256; v += 1) if ((seen += count[v]) > n >> 1) return v;
    return 255;
  };
  return rgbColour(counts.map(median));
}

const xmpBag = (xmp, tag) => {
  const block = new RegExp(`<ceditor:${tag}>([\\s\\S]*?)</ceditor:${tag}>`).exec(String(xmp ?? ''));
  if (!block) return [];
  const unescape = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return [...block[1].matchAll(/<rdf:li>([\s\S]*?)<\/rdf:li>/g)].map((match) => unescape(match[1]));
};

/**
 * The light layers that go with a colour layer, as a Photoshop file says in its XMP (the Blender
 * add-on writes <ceditor:colourOf>, a bag of "light layer=colour layer": a part's shading and
 * highlights, and a turning part's reflection in a metal). A Map from the light layer's name to the
 * colour layer's.
 */
export function colourOfNames(xmp) {
  return new Map(xmpBag(xmp, 'colourOf')
    .map((entry) => entry.split('='))
    .filter((pair) => pair.length === 2 && pair[0].trim() && pair[1].trim())
    .map(([light, colour]) => [light.trim(), colour.trim()]));
}

/** The colour layers a Photoshop file says are metal (<ceditor:metal>): their glint is light past white. */
export function metalNames(xmp) {
  return new Set(xmpBag(xmp, 'metal').map((name) => name.trim()).filter(Boolean));
}

/**
 * The light a file writes beside a colour layer, by name: "skirt lighting" and "skirt gloss" for
 * "skirt", "pointer lighting at 27" for "pointer at 27". `{ of, kind }`, kind 'lighting' or 'gloss';
 * null for any other layer.
 */
export function lightMapOf(label) {
  const match = /^(.*?)\s+(lighting|gloss)(\s+at\s+\S+)?\s*$/i.exec(String(label ?? ''));
  return match ? { of: `${match[1]}${match[3] ?? ''}`, kind: match[2].toLowerCase() } : null;
}

/**
 * The light a file writes of one part thrown on another, by name (the Blender add-on's hidden layers):
 * "skirt lighting from cap" and "skirt gloss from cap" (on the skirt, off the cap's colour), "bounce
 * from skirt" (the share of the panel's light there off the skirt's colour), "bounce shine from skirt"
 * and "bounce base" (the scene's panel under the bounce). `{ of, kind, from }`, kind 'lighting',
 * 'gloss', 'light', 'shine' or 'base'; null for any other name.
 */
export function bounceMapOf(label) {
  // A turning part's, at an angle ("pointer reflection from pointer at 27", "pointer reflection base
  // at 27"): for the layer of that angle.
  const angled = /^(.*\S)(\s+at\s+-?\d+(?:\.\d+)?)\s*$/i.exec(String(label ?? '').trim());
  if (angled) {
    const map = bounceMapOf(angled[1]);
    return map ? { ...map, of: `${map.of}${angled[2]}` } : null;
  }
  const text = String(label ?? '').trim();
  let match = /^(.*?)\s+(lighting|gloss)\s+from\s+(.+)$/i.exec(text);
  if (match) return { of: match[1], kind: match[2].toLowerCase(), from: match[3] };
  match = /^(.*?)\s+shine\s+from\s+(.+)$/i.exec(text);
  if (match) return { of: match[1], kind: 'shine', from: match[2] };
  match = /^(.*?)\s+from\s+(.+)$/i.exec(text);
  if (match) return { of: match[1], kind: 'light', from: match[2] };
  match = /^(.*?)\s+base$/i.exec(text);
  if (match) return { of: match[1], kind: 'base', from: '' };
  return null;
}

/** The role of a light layer that goes with a colour layer, by its name: 'shading', 'highlights' or ''. */
export function lightRoleOf(name) {
  const own = words(name);
  if (own.includes('shading')) return 'shading';
  if (own.includes('highlights')) return 'highlights';
  return '';
}

/** `pixels` (RGBA, straight) with `drawn` taken to `colour` (each [r, g, b]), in proportion. */
export function recolourPixels(pixels, colour, drawn) {
  const out = new Uint8ClampedArray(pixels.length);
  const delta = [0, 1, 2].map((c) => colour[c] - drawn[c]);
  for (let i = 0; i < pixels.length; i += 4) {
    out[i + 3] = pixels[i + 3];
    for (let c = 0; c < 3; c += 1) {
      const old = pixels[i + c];
      if (!pixels[i + 3]) { out[i + c] = old; continue; }
      out[i + c] = Math.round(old + delta[c] * (drawn[c] >= 8 ? old / drawn[c] : 1));
    }
  }
  return out;
}

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
/** sRGB, carried on past white (a light many times white stays so). */
const srgbBeyond = (x) => {
  const v = Math.max(0, x);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
};
const srgbOf = (x) => Math.min(1, srgbBeyond(x));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Linear light from the add-on's 8 bits (ceditor_layers.py light_code): 0, or 1/256 to 256. */
export function decodeLight(code) {
  return code ? 2 ** ((code * 16) / 255 - 8) : 0;
}

/** Light a part throws on another, from its 8 bits (ceditor_layers.py bounce_code): 1/4096 to 16. */
export function decodeBounce(code) {
  return decodeLight(code) / 16;
}

/**
 * The panel's light under a component worked out again with parts in new colours, as the Blender
 * add-on lays it (ceditor_layers.py add_group): the shadow (black at an opacity), the bounce over it
 * (colour dodge, a multiple of the panel), the shine added. `base`: the scene's panel look (linear,
 * light_code), in the bounce layer's box; `emitters`: `[{ ratio, light, shine }]`, each part's change
 * of colour (linear, per channel) and the share of the panel's light that comes off its colour and
 * what it adds to the shine (bounce_code), in the bounce box. Each picture `{ pixels, box }`.
 *
 * The panel's light there, as shown, is scaled where it comes off a part's colour; the shadow becomes
 * a multiply carrying it where the panel is now darker than with no parts (`shadow` returned as the
 * colour to multiply by, opaque: a black layer at an opacity is a multiply by black at that opacity,
 * so where nothing changes it is drawn as before), and the bounce where it is lighter.
 */
export function recolourBouncePixels({ base, bounce: dodge, shine = null, shadow = null, emitters }) {
  const { box } = dodge;
  const out = {
    bounce: new Uint8ClampedArray(dodge.pixels),
    shine: shine ? new Uint8ClampedArray(shine.pixels) : null,
    shadow: shadow ? new Uint8ClampedArray(shadow.pixels) : null,
  };
  const indexIn = (sheet, x, y) => {
    if (!sheet) return -1;
    const sx = x + box.x - sheet.box.x;
    const sy = y + box.y - sheet.box.y;
    if (sx < 0 || sy < 0 || sx >= sheet.box.width || sy >= sheet.box.height) return -1;
    return (sy * sheet.box.width + sx) * 4;
  };
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const i = (y * box.width + x) * 4;
      if (!base[i + 3]) continue;
      const di = i;
      const hi = indexIn(shine, x, y);
      const si = indexIn(shadow, x, y);
      const shade = si >= 0 ? shadow.pixels[si + 3] / 255 : 0;
      const sheenAlpha = hi >= 0 ? shine.pixels[hi + 3] / 255 : 0;
      const shone = [0, 0, 0];
      const factor = [0, 0, 0];
      for (let c = 0; c < 3; c += 1) {
        const multiple = dodge.pixels[di + 3] ? 1 / Math.max(1 - dodge.pixels[di + c] / 255, 1e-6) : 1;
        const shown = srgbOf(decodeLight(base[i + c]));
        const now = clamp01((1 - shade) * multiple * shown);
        let light = 1;
        let added = hi >= 0 ? (shine.pixels[hi + c] / 255) * sheenAlpha : 0;
        for (const { ratio, light: share, shine: sheen } of emitters) {
          light += (ratio[c] - 1) * decodeBounce(share[i + c]);
          added += (ratio[c] - 1) * decodeBounce(sheen[i + c]);
        }
        factor[c] = shown > 1e-4 ? srgbOf(toLinear(now) * Math.max(0, light)) / shown : 1;
        shone[c] = clamp01(added);
      }
      for (let c = 0; c < 3; c += 1) out.bounce[di + c] = Math.round((1 - 1 / Math.max(factor[c], 1)) * 255);
      out.bounce[di + 3] = 255;
      if (si >= 0) {
        for (let c = 0; c < 3; c += 1) out.shadow[si + c] = Math.round(Math.min(factor[c], 1) * 255);
        out.shadow[si + 3] = 255;
      }
      if (hi >= 0) {
        // At least one step of opacity, so the layer still covers the pixel; its colour what it adds
        // over that, so a shine fainter than a step adds no more than it is.
        const alpha = Math.max(1, Math.round(Math.max(...shone) * 255));
        for (let c = 0; c < 3; c += 1) out.shine[hi + c] = Math.round(Math.min(1, shone[c] / (alpha / 255)) * 255);
        out.shine[hi + 3] = alpha;
      }
    }
  }
  return out;
}

/**
 * A light layer a part throws on what is under it (its reflection in a metal cap; linear dodge, its
 * colour the light added and its opacity how much of it), worked out again with parts in new colours,
 * as the add-on writes it (ceditor_layers.py add_group): the light there is the look under it, in
 * linear light, times a share, and each part's colour adds part of that share. `pixels` the layer
 * (RGBA straight), `under` the look under it (light_code) and each emitter's `light` (bounce_code,
 * the share off its colour), all in the layer's box; `ratio` each part's change of colour, linear,
 * per channel. Returns the layer: unchanged where `under` does not reach.
 */
export function rethrownPixels({ pixels, under, emitters }) {
  const out = new Uint8ClampedArray(pixels);
  for (let i = 0; i < pixels.length; i += 4) {
    if (!under[i + 3]) continue;
    const alpha = pixels[i + 3] / 255;
    const now = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) {
      const below = srgbOf(decodeLight(under[i + c]));
      // The light as written, under it and added, and what each part's new colour changes of it.
      let light = toLinear(Math.min(1, below + (pixels[i + c] / 255) * alpha));
      for (const { ratio, light: share } of emitters) light += toLinear(below) * (ratio[c] - 1) * decodeBounce(share[i + c]);
      now[c] = clamp01(srgbOf(Math.max(0, light)) - below);
    }
    const strongest = Math.max(...now);
    // Its opacity kept where it holds the light (a frame turned back has soft edges), else as much as
    // the light needs; nothing where it adds less than half a level.
    const opacity = alpha > 0 && strongest <= alpha ? alpha : strongest >= 0.5 / 255 ? Math.max(strongest, alpha) : 0;
    for (let c = 0; c < 3; c += 1) out[i + c] = opacity > 0 ? Math.round(clamp01(now[c] / opacity) * 255) : 0;
    out[i + 3] = Math.round(opacity * 255);
  }
  return out;
}

/**
 * A part's colour layer and the light layers that go with it, worked out again in `colour`, as the
 * Blender add-on works them out (ceditor_layers.py add_part, part_look). Each picture `{ pixels, box }`,
 * RGBA straight, its box `{ x, y, width, height }` in the artwork's pixels; `lighting` and `gloss` are
 * pixels in the colour layer's box. `colour`, `drawn`: [r, g, b] 0 to 255.
 *
 * Each pixel the colour layer covers, each channel: the part's colour there (the colour layer's own
 * where its light layers cover the pixel whole, else the colour it was drawn in) taken to the new
 * colour in proportion, in linear light; the look in it, colour × light + gloss; then as the add-on
 * splits a look: shading = the lit colour over the colour (at most 1), highlights = what is past that
 * (a metal's past white too), and the colour layer what, under them as they cover the pixel, gives the
 * look. Returns `{ colour, shading, highlights }`, each RGBA in its own box (null for one not given),
 * opacities untouched.
 */
export function recolourGroupPixels({ colour, drawn, metal = false, layer, lighting, gloss, shading = null, highlights = null, bounce = [] }) {
  const { box } = layer;
  const out = {
    colour: new Uint8ClampedArray(layer.pixels),
    shading: shading ? new Uint8ClampedArray(shading.pixels) : null,
    highlights: highlights ? new Uint8ClampedArray(highlights.pixels) : null,
  };
  const ref = drawn.map((v) => toLinear(v / 255));
  const next = colour.map((v) => toLinear(v / 255));
  const indexIn = (sheet, x, y) => {
    if (!sheet) return -1;
    const sx = x + box.x - sheet.box.x;
    const sy = y + box.y - sheet.box.y;
    if (sx < 0 || sy < 0 || sx >= sheet.box.width || sy >= sheet.box.height) return -1;
    return (sy * sheet.box.width + sx) * 4;
  };
  const beyond = metal ? srgbBeyond : srgbOf;
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const i = (y * box.width + x) * 4;
      if (!layer.pixels[i + 3]) continue;
      const hi = indexIn(highlights, x, y);
      const si = indexIn(shading, x, y);
      const hA = hi >= 0 ? highlights.pixels[hi + 3] / 255 : 0;
      const sA = si >= 0 ? shading.pixels[si + 3] / 255 : 0;
      for (let c = 0; c < 3; c += 1) {
        const own = hA >= 1 ? toLinear(layer.pixels[i + c] / 255) : ref[c];
        const part = ref[c] > 1e-4 ? (own * next[c]) / ref[c] : next[c];
        // Light other parts throw on it by way of their colours, changed with them.
        let light = decodeLight(lighting[i + c]);
        let sheen = decodeLight(gloss[i + c]);
        for (const { ratio, lighting: from, gloss: fromGloss } of bounce) {
          light += (ratio[c] - 1) * decodeBounce(from[i + c]);
          sheen += (ratio[c] - 1) * decodeBounce(fromGloss[i + c]);
        }
        const lit = part * Math.max(0, light);
        const look = lit + Math.max(0, sheen);
        const e = srgbOf(part);
        const shade = e > 1e-4 ? clamp01(srgbBeyond(lit) / e) : 1;
        const added = clamp01(beyond(look) - e * shade);
        const under = 1 - sA + sA * shade;
        out.colour[i + c] = Math.round(clamp01((srgbOf(look) - hA * added) / Math.max(under, 1e-4)) * 255);
        if (si >= 0 && sA > 0) out.shading[si + c] = Math.round(shade * 255);
        if (hi >= 0 && hA > 0) out.highlights[hi + c] = Math.round(added * 255);
      }
    }
  }
  return out;
}

// --- Parts ---------------------------------------------------------------------------------------

const fillOf = (part) => part?._children?.Background?._children?.Fill ?? null;
const imageOf = (part) => part?._children?.Image ?? null;

/**
 * Whether a part's Background is a picture and nothing else (utils/partMask.js isPictureLayer): a
 * shape with a picture over its fill keeps its fill's colour, and its picture is drawn as it is.
 */
export function hasPictureFill(part) {
  return isPictureLayer(part?._children?.Background);
}

/** Whether a part is a picture with a colour of its own: a picture layer or a part of frames. */
export function hasPictureColour(part) {
  return isFramesImage(imageOf(part)) || hasPictureFill(part);
}

/**
 * The colour settings of a part's picture, as stored: `{ path, drawnPath, colour, drawn, follows,
 * role, metal, lit }` (`path` the part-relative property the colour is written at, `lit` whether the
 * light on it is written beside it); null for a part that is not a picture.
 */
export function pictureColourSettings(part) {
  const image = imageOf(part);
  if (isFramesImage(image)) {
    return {
      path: 'Image.colour', drawnPath: 'Image.colourDrawn', colour: String(image.colour ?? ''), drawn: String(image.colourDrawn ?? ''),
      follows: String(image.colourFollows ?? ''), role: String(image.colourRole ?? ''), metal: image.colourMetal === true,
      lit: image.frames.some((frame) => frame?.lighting && frame?.gloss),
      thrown: thrownFrom(image.frames.map((frame) => (frame?.under ? frame.thrown : null))),
    };
  }
  if (hasPictureFill(part)) {
    const fill = fillOf(part);
    return {
      path: 'Background.Fill.imageColour', drawnPath: 'Background.Fill.imageColourDrawn', colour: String(fill.imageColour ?? ''), drawn: String(fill.imageColourDrawn ?? ''),
      follows: String(fill.imageColourFollows ?? ''), role: String(fill.imageColourRole ?? ''), metal: fill.imageColourMetal === true,
      lit: Boolean(fill.imageColourLighting && fill.imageColourGloss),
      // The light other parts throw on it by way of their colours ({ part: { lighting, gloss } }), and
      // for the panel's bounce layer, the scene's panel under it.
      bounce: fill.imageColourBounce && typeof fill.imageColourBounce === 'object' ? fill.imageColourBounce : null,
      panelBase: String(fill.imageColourBase ?? ''),
      thrown: thrownFrom([fill.imageColourUnder ? fill.imageColourThrown : null]),
    };
  }
  return null;
}

/** The parts a light layer's pictures say are thrown by (`{ part: map }` each), or [] for none. */
function thrownFrom(maps) {
  const parts = new Set();
  for (const map of maps) if (map && typeof map === 'object') for (const [part, src] of Object.entries(map)) if (src) parts.add(part);
  return [...parts];
}

const sourceKey = (src) => `${src.length}:${src.slice(64, 96)}:${src.slice(-48)}`;

/**
 * A part's pictures in the artwork's pixels: `[{ src, box, lighting, gloss }]`, one for a picture
 * layer, one a frame for a part of frames (the import lays parts out in pixels from the top left).
 */
function sheetOf(part) {
  const layout = part?._children?.Layout ?? {};
  const at = { x: Number(layout.x) || 0, y: Number(layout.y) || 0, width: Number(layout.width) || 0, height: Number(layout.height) || 0 };
  const image = imageOf(part);
  if (isFramesImage(image)) {
    return image.frames.map((frame) => ({
      src: String(frame?.source ?? ''), lighting: String(frame?.lighting ?? ''), gloss: String(frame?.gloss ?? ''),
      under: String(frame?.under ?? ''), thrown: frame?.thrown && typeof frame.thrown === 'object' ? frame.thrown : {},
      box: {
        x: Math.round(at.x + ((Number(frame?.x) || 0) / 100) * at.width), y: Math.round(at.y + ((Number(frame?.y) || 0) / 100) * at.height),
        width: Math.round(((Number(frame?.width) || 100) / 100) * at.width), height: Math.round(((Number(frame?.height) || 100) / 100) * at.height),
      },
    }));
  }
  const fill = fillOf(part);
  return [{
    src: String(fill?.imageSrc ?? ''), lighting: String(fill?.imageColourLighting ?? ''), gloss: String(fill?.imageColourGloss ?? ''),
    under: String(fill?.imageColourUnder ?? ''), thrown: fill?.imageColourThrown && typeof fill.imageColourThrown === 'object' ? fill.imageColourThrown : {},
    box: { x: Math.round(at.x), y: Math.round(at.y), width: Math.round(at.width), height: Math.round(at.height) },
  }];
}

/**
 * What a part's picture needs to be drawn in its colour, with a `key` and `colour`, `drawn` ([r, g, b];
 * `drawn` null for one to be measured): `{ kind: 'group', role, group, frames }` for a part worked out
 * again with the light on it (withColourFollows gives it `_colourGroup`), else `{ kind: 'fill', src }`
 * or `{ kind: 'frames', frames: [{ src }] }`, changed in proportion; null when it is drawn as it is (no
 * colour, or its own).
 */
export function pictureColour(part) {
  const settings = pictureColourSettings(part);
  if (!settings) return null;
  // The panel's bounce, shine and shadow under a component, lit by parts in new colours.
  const panel = part?._colourPanel;
  if (panel) return panel.emitters.length ? { kind: 'panel', role: panel.role, panel, key: `panel|${panel.key}|${panel.role}` } : null;
  // A picture that came in without its drawn colour (not from a Photoshop file) has it measured when
  // it is drawn (`drawn` null).
  const drawn = colourRgb(settings.drawn);
  const group = part?._colourGroup;
  // A part lit by another in a new colour is worked out again in its own colour too.
  const lit = Boolean(group?.bounce?.length);
  // Light thrown by parts in new colours (a turning part's reflection), worked out again first.
  const thrown = part?._colourThrown?.emitters?.length ? part._colourThrown : null;
  let colour = colourRgb(settings.colour) ?? (lit ? drawn : null);
  if (colour && drawn && !lit && colour.every((value, c) => value === drawn[c])) colour = null;
  if (thrown && !group) {
    const frames = sheetOf(part).map((sheet) => ({ src: sheet.src, under: sheet.under, thrown: sheet.thrown }));
    const head = colour ? `${colour.join(',')}>${drawn ? drawn.join(',') : 'measured'}` : 'own';
    const key = `${head}|thrown:${thrown.key}|${frames.map((f) => `${sourceKey(f.src)}/${sourceKey(f.under)}`).join('|')}`;
    return settings.path === 'Image.colour'
      ? { kind: 'frames', colour, drawn, frames, thrown, key }
      : { kind: 'fill', colour, drawn, src: frames[0].src, under: frames[0].under, thrownMaps: frames[0].thrown, thrown, key };
  }
  if (!colour) return null;
  const head = `${colour.join(',')}>${drawn ? drawn.join(',') : 'measured'}`;
  if (group && drawn) {
    const frames = isFramesImage(imageOf(part)) ? imageOf(part).frames.length : 0;
    return { kind: 'group', role: group.role, group, colour, drawn, frames, key: `${head}|${group.key}|${group.role}` };
  }
  if (settings.path === 'Image.colour') {
    const frames = imageOf(part).frames.map((frame) => ({ src: String(frame?.source ?? '') }));
    return { kind: 'frames', colour, drawn, frames, key: `${head}|${frames.map((f) => sourceKey(f.src)).join('|')}` };
  }
  const src = String(fillOf(part).imageSrc);
  return { kind: 'fill', colour, drawn, src, key: `${head}|${sourceKey(src)}` };
}

function withFill(part, changes) {
  const background = part._children.Background;
  return { ...part, _children: { ...part._children, Background: { ...background, _children: { ...background._children, Fill: { ...background._children.Fill, ...changes } } } } };
}

function withBlend(part, mode) {
  const effects = part._children.Effects ?? { _type: 'Effects', _children: {} };
  return { ...part, _children: { ...part._children, Effects: { ...effects, _children: { ...effects._children, Blend: { ...(effects._children?.Blend ?? {}), mode } } } } };
}

function withImage(part, changes) {
  return { ...part, _children: { ...part._children, Image: { ...part._children.Image, ...changes } } };
}

/**
 * Parts (`[name, part]` entries) with what each needs of the parts it goes with: the colour and drawn
 * colour of the part a light layer follows; and, for a colour layer with the light on it written and
 * its shading and highlights (`…Role`), a `_colourGroup` on each of the three (their pictures, the
 * light, whether it is metal), from which recolourGroupPixels works them out together. `all`: every
 * part by name (a Map or an object), when the entries are only some.
 */
export function withColourFollows(entries, all = null) {
  const byName = all instanceof Map ? all : new Map(all ? Object.entries(all) : entries);
  const settingsOf = new Map([...byName].map(([name, part]) => [name, pictureColourSettings(part)]));
  if (![...settingsOf.values()].some((own) => own?.follows || own?.lit || own?.panelBase || own?.thrown?.length)) return entries;
  // A part's change of colour, in linear light, per channel; null for a part as drawn.
  const ratioOf = (name) => {
    const own = settingsOf.get(name);
    const colour = colourRgb(own?.colour);
    const drawn = colourRgb(own?.drawn);
    if (!colour || !drawn || colour.every((value, c) => value === drawn[c])) return null;
    return colour.map((value, c) => (toLinear(drawn[c] / 255) > 1e-4 ? toLinear(value / 255) / toLinear(drawn[c] / 255) : 1));
  };
  const thrown = (maps) => Object.entries(maps ?? {})
    .map(([from, given]) => ({ from, ratio: ratioOf(from), ...given }))
    .filter((each) => each.ratio);
  const thrownKey = (list) => list.map((each) => `${each.from}:${each.ratio.map((v) => v.toFixed(5)).join(',')}`).join(';');
  const members = new Map();
  for (const [name, own] of settingsOf) {
    if (!own?.follows || !own.role) continue;
    const group = members.get(own.follows) ?? {};
    group[own.role] = name;
    members.set(own.follows, group);
  }
  const groups = new Map();
  const panels = new Map();
  const groupOf = (leaderName) => {
    if (groups.has(leaderName)) return groups.get(leaderName);
    const lead = settingsOf.get(leaderName);
    let group = null;
    if (lead?.lit) {
      const own = members.get(leaderName) ?? {};
      const sheet = (name) => (name && byName.has(name) ? sheetOf(byName.get(name)) : null);
      group = { leader: sheet(leaderName), shading: sheet(own.shading), highlights: sheet(own.highlights), metal: lead.metal, bounce: thrown(lead.bounce) };
      const keyOf = (frames) => (frames ? frames.map((f) => `${sourceKey(f.src)}/${sourceKey(f.lighting)}/${sourceKey(f.gloss)}@${f.box.x},${f.box.y}`).join(';') : '-');
      group.key = `${leaderName}:${group.metal ? 'metal' : ''}|${keyOf(group.leader)}|${keyOf(group.shading)}|${keyOf(group.highlights)}|${thrownKey(group.bounce)}`;
    }
    groups.set(leaderName, group);
    return group;
  };
  return entries.map(([name, part]) => {
    const own = settingsOf.get(name) ?? pictureColourSettings(part);
    if (!own) return [name, part];
    let next = part;
    if (own.follows) {
      const lead = settingsOf.get(own.follows);
      if (!lead) return [name, part];
      next = own.path === 'Image.colour'
        ? withImage(part, { colour: lead.colour, colourDrawn: lead.drawn })
        : withFill(part, { imageColour: lead.colour, imageColourDrawn: lead.drawn });
    }
    const leaderName = own.follows && own.role ? own.follows : (own.lit ? name : '');
    const group = leaderName ? groupOf(leaderName) : null;
    if (group) next = { ...next, _colourGroup: { ...group, role: leaderName === name ? 'colour' : own.role } };
    // The panel's bounce layer, its shine and the shadow under them (following it as 'shine' and
    // 'shadow'), lit by the parts in their new colours.
    const panelName = own.panelBase ? name : (own.follows && ['shine', 'shadow'].includes(own.role) && settingsOf.get(own.follows)?.panelBase ? own.follows : '');
    const panel = panelName ? panelOf(panelName) : null;
    if (panel) next = { ...next, _colourPanel: { ...panel, role: panelName === name ? 'bounce' : own.role } };
    // Light it is thrown by parts in new colours (a turning part's reflection in the cap).
    const emitters = (own.thrown ?? []).map((from) => ({ from, ratio: ratioOf(from) })).filter((each) => each.ratio);
    if (emitters.length) next = { ...next, _colourThrown: { emitters, key: thrownKey(emitters) } };
    return [name, next];
  });

  function panelOf(name) {
    if (panels.has(name)) return panels.get(name);
    const own = settingsOf.get(name);
    const member = (role) => [...settingsOf].find(([, each]) => each?.follows === name && each.role === role)?.[0] ?? '';
    const single = (part) => (part && byName.has(part) ? sheetOf(byName.get(part))[0] : null);
    const panel = {
      base: own.panelBase, bounce: single(name), shine: single(member('shine')), shadow: single(member('shadow')),
      emitters: Object.entries(own.bounce ?? {}).map(([from, given]) => ({ from, ratio: ratioOf(from), light: given.light, shine: given.shine })).filter((each) => each.ratio),
    };
    const at = (sheet) => (sheet ? `${sourceKey(sheet.src)}@${sheet.box.x},${sheet.box.y}` : '-');
    panel.key = `${name}|${sourceKey(panel.base)}|${at(panel.bounce)}|${at(panel.shine)}|${at(panel.shadow)}|${thrownKey(panel.emitters)}`;
    panels.set(name, panel);
    return panel;
  }
}

/**
 * A part with its picture replaced by the one made for it (`made`, from `recolourPicture`), its colour
 * cleared so that nothing recolours it again. Unchanged when `made` is not for its picture now.
 */
export function withRecolouredPicture(part, made) {
  const wanted = pictureColour(part);
  if (!wanted || !made || made.key !== wanted.key) return part;
  const { _colourGroup: _, _colourPanel: __, _colourThrown: ___, ...stripped } = part;
  // The shadow under the panel's bounce, made a multiply (black at an opacity is the same as a multiply
  // by black at that opacity, so it draws as before where nothing changed).
  const plain = made.blend ? withBlend(stripped, made.blend) : stripped;
  if (made.kind === 'frames') {
    const frames = imageOf(plain).frames.map((frame, i) => (made.frames[i] ? { ...frame, source: made.frames[i] } : frame));
    return withImage(plain, { frames, colour: '' });
  }
  return withFill(plain, { imageSrc: made.src, imageColour: '' });
}

// --- In a browser ------------------------------------------------------------------------------

const made = new Map();
const madeGroups = new Map();

const remember = (cache, key, promise) => {
  cache.set(key, promise);
  if (cache.size > 128) cache.delete(cache.keys().next().value);
  return promise;
};

async function recolourOne(src, colour, drawn) {
  if (!src) return '';
  const picture = await picturePixels(src);
  if (!picture) return '';
  const from = drawn ?? colourRgb(drawnColour(picture.pixels));
  if (!from) return src;
  return pngDataUrl(picture.width, picture.height, recolourPixels(picture.pixels, colour, from));
}

/**
 * A light layer's picture thrown by parts in new colours (`thrown.emitters`), worked out again from
 * the look under it and the share off each one's colour, then, with `colour`, changed in proportion
 * as a follower is. The picture as it was where its maps do not fit it.
 */
async function rethrowOne({ src, under, thrown: maps }, thrown, colour, drawn) {
  if (!src) return '';
  const emitters = thrown.emitters.filter((each) => maps?.[each.from]);
  if (!under || !emitters.length) return colour ? recolourOne(src, colour, drawn) : src;
  const [picture, below, ...shares] = await Promise.all([picturePixels(src), picturePixels(under), ...emitters.map((each) => picturePixels(maps[each.from]))]);
  if (!picture) return '';
  const fits = (other) => other && other.width === picture.width && other.height === picture.height;
  if (!fits(below) || !shares.every(fits)) return colour ? recolourOne(src, colour, drawn) : src;
  let pixels = rethrownPixels({ pixels: picture.pixels, under: below.pixels, emitters: emitters.map((each, i) => ({ ratio: each.ratio, light: shares[i].pixels })) });
  if (colour) {
    const from = drawn ?? colourRgb(drawnColour(picture.pixels));
    if (from) pixels = recolourPixels(pixels, colour, from);
  }
  return pngDataUrl(picture.width, picture.height, pixels);
}

/** The drawn colour of a part of frames that came in without one: its middle frame's, measured. */
async function measuredFramesColour(frames) {
  const drawnFrames = frames.filter((frame) => frame.src);
  const middle = drawnFrames[drawnFrames.length >> 1];
  const picture = middle ? await picturePixels(middle.src) : null;
  return picture ? colourRgb(drawnColour(picture.pixels)) : null;
}

/** One frame of a part's group worked out in its new colour: `{ colour, shading, highlights }`, data URLs. */
function groupFrame(want, index) {
  const { group, colour, drawn } = want;
  const key = `${colour.join(',')}>${drawn.join(',')}|${group.key}|${index}`;
  if (madeGroups.has(key)) return madeGroups.get(key);
  return remember(madeGroups, key, (async () => {
    const lead = group.leader?.[index];
    if (!lead?.src || !lead.lighting || !lead.gloss) return {};
    const at = (sheet) => (sheet?.[index]?.src ? sheet[index] : null);
    const [layer, lighting, gloss, shading, highlights] = await Promise.all([
      picturePixels(lead.src), picturePixels(lead.lighting), picturePixels(lead.gloss),
      at(group.shading) ? picturePixels(at(group.shading).src) : null,
      at(group.highlights) ? picturePixels(at(group.highlights).src) : null,
    ]);
    // The pictures are laid out by their parts' boxes, in the artwork's pixels; a picture drawn finer
    // than its box (a 3D part's, at twice the component's pixels) is placed at its own scale, the
    // colour layer's, which the layers that go with it share.
    const scale = layer && lead.box.width ? layer.width / lead.box.width : 1;
    const inPixels = (box) => ({ x: Math.round(box.x * scale), y: Math.round(box.y * scale), width: Math.round(box.width * scale), height: Math.round(box.height * scale) });
    const fits = (picture, box) => picture && Math.abs(picture.width - box.width * scale) <= 1 && Math.abs(picture.height - box.height * scale) <= 1;
    if (!fits(layer, lead.box) || !fits(lighting, lead.box) || !fits(gloss, lead.box)) return {};
    const leadBox = { ...inPixels(lead.box), width: layer.width, height: layer.height };
    const sheet = (picture, frame) => (frame && fits(picture, frame.box) ? { pixels: picture.pixels, box: { ...inPixels(frame.box), width: picture.width, height: picture.height } } : null);
    const shadingSheet = sheet(shading, at(group.shading));
    const highlightsSheet = sheet(highlights, at(group.highlights));
    // Light other parts throw on it, in its box (a part that stays put: one frame).
    const thrownMaps = index === 0 ? await Promise.all((group.bounce ?? []).map(async (each) => ({
      ratio: each.ratio, lighting: await picturePixels(each.lighting), gloss: await picturePixels(each.gloss),
    }))) : [];
    const bounce = thrownMaps.filter((each) => fits(each.lighting, lead.box) && fits(each.gloss, lead.box))
      .map((each) => ({ ratio: each.ratio, lighting: each.lighting.pixels, gloss: each.gloss.pixels }));
    const result = recolourGroupPixels({
      colour, drawn, metal: group.metal, layer: { pixels: layer.pixels, box: leadBox }, lighting: lighting.pixels, gloss: gloss.pixels,
      shading: shadingSheet, highlights: highlightsSheet, bounce,
    });
    return {
      colour: pngDataUrl(leadBox.width, leadBox.height, result.colour),
      shading: result.shading ? pngDataUrl(shadingSheet.box.width, shadingSheet.box.height, result.shading) : '',
      highlights: result.highlights ? pngDataUrl(highlightsSheet.box.width, highlightsSheet.box.height, result.highlights) : '',
    };
  })());
}

const madePanels = new Map();

/** The panel's bounce, shine and shadow under a component, lit by parts in new colours: data URLs. */
function panelPictures(panel) {
  if (madePanels.has(panel.key)) return madePanels.get(panel.key);
  return remember(madePanels, panel.key, (async () => {
    if (!panel.bounce?.src || !panel.base) return {};
    const decode = (src) => (src ? picturePixels(src) : null);
    const [base, bounce, shine, shadow, ...maps] = await Promise.all([
      decode(panel.base), decode(panel.bounce.src), decode(panel.shine?.src), decode(panel.shadow?.src),
      ...panel.emitters.flatMap((each) => [decode(each.light), decode(each.shine)]),
    ]);
    const box = panel.bounce.box;
    const fits = (picture, frame = { box }) => picture && picture.width === frame.box.width && picture.height === frame.box.height;
    if (!fits(base) || !fits(bounce) || maps.some((map) => !fits(map))) return {};
    const sheet = (picture, frame) => (frame && fits(picture, frame) ? { pixels: picture.pixels, box: frame.box } : null);
    const result = recolourBouncePixels({
      base: base.pixels, bounce: { pixels: bounce.pixels, box }, shine: sheet(shine, panel.shine), shadow: sheet(shadow, panel.shadow),
      emitters: panel.emitters.map((each, i) => ({ ratio: each.ratio, light: maps[i * 2].pixels, shine: maps[i * 2 + 1].pixels })),
    });
    const encode = (pixels, frame) => (pixels && frame ? pngDataUrl(frame.box.width, frame.box.height, pixels) : '');
    return { bounce: encode(result.bounce, panel.bounce), shine: encode(result.shine, panel.shine), shadow: encode(result.shadow, panel.shadow) };
  })());
}

/** The pictures `pictureColour(part)` asks for, made: `{ key, kind, src }` or `{ key, kind, frames }`. */
export function recolourPicture(wanted) {
  if (typeof document === 'undefined' || !wanted) return Promise.resolve(null);
  if (made.has(wanted.key)) return made.get(wanted.key);
  return remember(made, wanted.key, (async () => {
    if (wanted.kind === 'panel') {
      const pictures = await panelPictures(wanted.panel);
      const src = pictures[wanted.role];
      if (!src) return null;
      return { key: wanted.key, kind: 'fill', src, ...(wanted.role === 'shadow' ? { blend: 'multiply' } : {}) };
    }
    if (wanted.kind === 'group') {
      const count = Math.max(1, wanted.frames);
      const sheets = { colour: wanted.group.leader, shading: wanted.group.shading, highlights: wanted.group.highlights };
      const own = sheets[wanted.role] ?? [];
      const pictures = await Promise.all(Array.from({ length: count }, async (_, i) => ((await groupFrame(wanted, i))[wanted.role] || own[i]?.src || '')));
      return wanted.frames ? { key: wanted.key, kind: 'frames', frames: pictures } : { key: wanted.key, kind: 'fill', src: pictures[0] };
    }
    if (wanted.thrown) {
      const drawn = wanted.colour ? wanted.drawn ?? (wanted.kind === 'frames' ? await measuredFramesColour(wanted.frames) : null) : null;
      if (wanted.kind === 'frames') {
        const frames = await Promise.all(wanted.frames.map((frame) => rethrowOne(frame, wanted.thrown, wanted.colour, drawn)));
        return { key: wanted.key, kind: 'frames', frames };
      }
      return { key: wanted.key, kind: 'fill', src: await rethrowOne({ src: wanted.src, under: wanted.under, thrown: wanted.thrownMaps }, wanted.thrown, wanted.colour, drawn) };
    }
    if (wanted.kind === 'frames') {
      const drawn = wanted.drawn ?? await measuredFramesColour(wanted.frames);
      const frames = drawn
        ? await Promise.all(wanted.frames.map((frame) => recolourOne(frame.src, wanted.colour, drawn)))
        : wanted.frames.map((frame) => frame.src);
      return { key: wanted.key, kind: 'frames', frames };
    }
    return { key: wanted.key, kind: 'fill', src: await recolourOne(wanted.src, wanted.colour, wanted.drawn) };
  })());
}

/** For parts (`[name, part]` entries, follows resolved), their pictures in their colours: a Map from name. */
export async function pictureColourSources(entries) {
  const wanted = entries.map(([name, part]) => [name, pictureColour(part)]).filter(([, want]) => want);
  if (!wanted.length || typeof document === 'undefined') return new Map();
  const results = await Promise.all(wanted.map(([, want]) => recolourPicture(want)));
  return new Map(wanted.map(([name], i) => [name, results[i]]).filter(([, result]) => result));
}

/** Parts with the pictures `pictureColourSources` made put in. */
export function withPictureColourSources(entries, sources) {
  if (!sources?.size) return entries;
  return entries.map(([name, part]) => [name, sources.has(name) ? withRecolouredPicture(part, sources.get(name)) : part]);
}

// --- What a layer is ---------------------------------------------------------------------------

const LIGHT_BLENDS = new Set(['multiply', 'plus-lighter', 'color-dodge', 'screen', 'linear-dodge', 'lighten', 'darken', 'overlay', 'soft-light', 'hard-light']);
const PIVOT_WORDS = new Set(['pivot', 'centre', 'center', 'axis']);
const LIGHT_WORDS = new Set(['shading', 'shade', 'highlights', 'highlight', 'shadow', 'reflection', 'shine', 'bounce', 'emission']);

const words = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * What a part is, for the designer: 'light' (a picture laid on what is under it to light it, or a
 * shadow, by its blend mode or its name), 'frames' (a part of frames), 'picture' (a picture layer),
 * or '' for anything else.
 */
export function pictureLayerKind(part, name = part?.name) {
  if (!hasPictureColour(part)) return '';
  const blend = String(part?._children?.Effects?._children?.Blend?.mode ?? 'normal').toLowerCase();
  // A pivot mark ("pointer shadow pivot") is a dot the import hides, not light.
  if (words(name).some((word) => PIVOT_WORDS.has(word))) return isFramesImage(imageOf(part)) ? 'frames' : 'picture';
  if (LIGHT_BLENDS.has(blend) || words(name).some((word) => LIGHT_WORDS.has(word))) return 'light';
  return isFramesImage(imageOf(part)) ? 'frames' : 'picture';
}

/**
 * The part a light layer lights, by its name: `skirt_shading` lights `skirt`, `cap highlights` lights
 * `cap`. `parts`: the component's parts by name. '' when there is none to name.
 */
export function litLayerOf(name, parts) {
  const own = words(name);
  if (!own.some((word) => LIGHT_WORDS.has(word))) return '';
  const base = own.filter((word) => !LIGHT_WORDS.has(word)).join(' ');
  if (!base) return '';
  for (const [other, part] of Object.entries(parts ?? {})) {
    if (other === name || words(other).join(' ') !== base) continue;
    const kind = pictureLayerKind(part, other);
    if (kind === 'picture' || kind === 'frames') return other;
  }
  return '';
}
