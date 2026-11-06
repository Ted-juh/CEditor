/**
 * pictureRecolour.js — a picture's colour changed, its light kept.
 *
 * A picture layer (a part whose Background fill is a picture) and a part of frames (utils/
 * imageFrames.js) each have a colour of their own:
 *
 *   Background.Fill: { imageColour, imageColourDrawn, imageColourShare, imageColourFollows }
 *   Image:           { colour, colourDrawn, colourFollows, frames: [{ source, share }, ...] }
 *
 * `imageColour` / `colour` is the colour chosen (AARRGGBB, or a control set's role such as
 * `{control.body}`); empty is the picture as drawn. `…Drawn` is the colour the picture was drawn in,
 * measured on import (`drawnColour`). Each pixel, each channel, alpha untouched:
 *
 *   new = old + (colour − drawn) × share
 *
 * `share` is, unless the file gives it, the pixel over the drawn colour (a channel of the drawn colour
 * darker than 8 levels takes 1): the drawn colour becomes the new one exactly, and every other pixel
 * keeps its proportion to it, which is right wherever the light is multiplied into the colour.
 *
 * The Blender add-on (tools/blender/ceditor_layers.py) writes a part's colour layer as its colour
 * inside and its whole lit look at its edge, where a multiply or an add would reach what is beside it
 * in the pixel. There a pixel holds colour × shading + highlights, and the share is how much of the
 * colour shows through the light: the add-on writes it ("<name> colour share", read by the import
 * into `imageColourShare` and each frame's `share`), and with it the edge is Blender's own.
 *
 * `…Follows` names another part whose colour this one takes, with its own default share: a metal's
 * highlights, whose reflections are the metal's colour (the add-on marks metal parts, and the import
 * sets the highlights to follow).
 *
 * Worked out on the pixels, once per picture and colour, as utils/linearEdges.js works out an edge:
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

/**
 * Which layers take another's colour, as a Photoshop file says in its XMP (the Blender add-on writes
 * <ceditor:colourOf>, a bag of "light layer=colour layer": a metal's highlights take its colour).
 * A Map from the light layer's name to the colour layer's.
 */
export function colourOfNames(xmp) {
  const block = /<ceditor:colourOf>([\s\S]*?)<\/ceditor:colourOf>/.exec(String(xmp ?? ''));
  if (!block) return new Map();
  const unescape = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return new Map([...block[1].matchAll(/<rdf:li>([\s\S]*?)<\/rdf:li>/g)]
    .map((match) => unescape(match[1]).split('='))
    .filter((pair) => pair.length === 2 && pair[0].trim() && pair[1].trim())
    .map(([light, colour]) => [light.trim(), colour.trim()]));
}

/**
 * The colour share a file gives for a colour layer, by name: "skirt colour share" for "skirt",
 * "pointer colour share at 27" for "pointer at 27". The name of the layer it is for, or ''.
 */
export function colourShareOf(label) {
  const match = /^(.*?)\s+colour\s+share(\s+at\s+\S+)?\s*$/i.exec(String(label ?? ''));
  return match ? `${match[1]}${match[2] ?? ''}` : '';
}

/**
 * `pixels` (RGBA, straight) with `drawn` taken to `colour` (each [r, g, b]): see the top of the file.
 * `share`, when given, is RGBA pixels of the same size, the share per channel in its colour (255 is
 * 1); where it is clear, or not given, the share is the pixel over the drawn colour.
 */
export function recolourPixels(pixels, colour, drawn, share = null) {
  const out = new Uint8ClampedArray(pixels.length);
  const delta = [0, 1, 2].map((c) => colour[c] - drawn[c]);
  const ownShare = share && share.length === pixels.length ? share : null;
  for (let i = 0; i < pixels.length; i += 4) {
    out[i + 3] = pixels[i + 3];
    const given = ownShare && ownShare[i + 3] > 0;
    for (let c = 0; c < 3; c += 1) {
      const old = pixels[i + c];
      if (!pixels[i + 3]) { out[i + c] = old; continue; }
      const part = given ? ownShare[i + c] / 255 : (drawn[c] >= 8 ? old / drawn[c] : 1);
      out[i + c] = Math.round(old + delta[c] * part);
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
 * The colour settings of a part's picture, as stored: `{ path, colour, drawn, follows }`, `path` the
 * part-relative property the colour is written at; null for a part that is not a picture.
 */
export function pictureColourSettings(part) {
  const image = imageOf(part);
  if (isFramesImage(image)) {
    return { path: 'Image.colour', drawnPath: 'Image.colourDrawn', colour: String(image.colour ?? ''), drawn: String(image.colourDrawn ?? ''), follows: String(image.colourFollows ?? '') };
  }
  if (hasPictureFill(part)) {
    const fill = fillOf(part);
    return { path: 'Background.Fill.imageColour', drawnPath: 'Background.Fill.imageColourDrawn', colour: String(fill.imageColour ?? ''), drawn: String(fill.imageColourDrawn ?? ''), follows: String(fill.imageColourFollows ?? '') };
  }
  return null;
}

const sourceKey = (src) => `${src.length}:${src.slice(64, 96)}:${src.slice(-48)}`;

/**
 * What a part's picture needs to be drawn in its colour: `{ kind: 'fill', src, share }` or
 * `{ kind: 'frames', frames: [{ src, share }] }`, with `colour`, `drawn` ([r, g, b]) and a `key`; null
 * when it is drawn as it is (no colour, no drawn colour, or the two the same).
 */
export function pictureColour(part) {
  const settings = pictureColourSettings(part);
  if (!settings) return null;
  const colour = colourRgb(settings.colour);
  // A picture that came in without its drawn colour (not from a Photoshop file) has it measured when
  // it is drawn (`drawn` null).
  const drawn = colourRgb(settings.drawn);
  if (!colour || (drawn && colour.every((value, c) => value === drawn[c]))) return null;
  const head = `${colour.join(',')}>${drawn ? drawn.join(',') : 'measured'}`;
  if (settings.path === 'Image.colour') {
    const frames = imageOf(part).frames.map((frame) => ({ src: String(frame?.source ?? ''), share: String(frame?.share ?? '') }));
    return { kind: 'frames', colour, drawn, frames, key: `${head}|${frames.map((f) => `${sourceKey(f.src)}/${sourceKey(f.share)}`).join('|')}` };
  }
  const fill = fillOf(part);
  const src = String(fill.imageSrc);
  const share = String(fill.imageColourShare ?? '');
  return { kind: 'fill', colour, drawn, src, share, key: `${head}|${sourceKey(src)}/${sourceKey(share)}` };
}

function withFill(part, changes) {
  const background = part._children.Background;
  return { ...part, _children: { ...part._children, Background: { ...background, _children: { ...background._children, Fill: { ...background._children.Fill, ...changes } } } } };
}

function withImage(part, changes) {
  return { ...part, _children: { ...part._children, Image: { ...part._children.Image, ...changes } } };
}

/**
 * Parts (`[name, part]` entries) with the colour of each that follows another taken from it (its
 * colour and drawn colour; its own share). `all`: every part by name, when the entries are only some.
 */
export function withColourFollows(entries, all = null) {
  const byName = all ?? new Map(entries);
  if (!entries.some(([, part]) => pictureColourSettings(part)?.follows)) return entries;
  return entries.map(([name, part]) => {
    const own = pictureColourSettings(part);
    if (!own?.follows) return [name, part];
    const leader = pictureColourSettings(byName instanceof Map ? byName.get(own.follows) : byName[own.follows]);
    if (!leader) return [name, part];
    return [name, own.path === 'Image.colour'
      ? withImage(part, { colour: leader.colour, colourDrawn: leader.drawn })
      : withFill(part, { imageColour: leader.colour, imageColourDrawn: leader.drawn })];
  });
}

/**
 * A part with its picture replaced by the one made for it (`made`, from `recolourPicture`), its colour
 * cleared so that nothing recolours it again. Unchanged when `made` is not for its picture now.
 */
export function withRecolouredPicture(part, made) {
  const wanted = pictureColour(part);
  if (!wanted || !made || made.key !== wanted.key) return part;
  if (made.kind === 'frames') {
    const frames = imageOf(part).frames.map((frame, i) => (made.frames[i] ? { ...frame, source: made.frames[i] } : frame));
    return withImage(part, { frames, colour: '' });
  }
  return withFill(part, { imageSrc: made.src, imageColour: '' });
}

// --- In a browser ------------------------------------------------------------------------------

const made = new Map();

async function recolourOne(src, share, colour, drawn) {
  if (!src) return '';
  const [picture, shares] = await Promise.all([picturePixels(src), share ? picturePixels(share) : null]);
  if (!picture) return '';
  const sharePixels = shares && shares.width === picture.width && shares.height === picture.height ? shares.pixels : null;
  const from = drawn ?? colourRgb(drawnColour(picture.pixels));
  if (!from) return src;
  return pngDataUrl(picture.width, picture.height, recolourPixels(picture.pixels, colour, from, sharePixels));
}

/** The drawn colour of a part of frames that came in without one: its middle frame's, measured. */
async function measuredFramesColour(frames) {
  const drawnFrames = frames.filter((frame) => frame.src);
  const middle = drawnFrames[drawnFrames.length >> 1];
  const picture = middle ? await picturePixels(middle.src) : null;
  return picture ? colourRgb(drawnColour(picture.pixels)) : null;
}

/** The pictures `pictureColour(part)` asks for, made: `{ key, kind, src }` or `{ key, kind, frames }`. */
export function recolourPicture(wanted) {
  if (typeof document === 'undefined' || !wanted) return Promise.resolve(null);
  if (made.has(wanted.key)) return made.get(wanted.key);
  const promise = (async () => {
    if (wanted.kind === 'frames') {
      const drawn = wanted.drawn ?? await measuredFramesColour(wanted.frames);
      const frames = drawn
        ? await Promise.all(wanted.frames.map((frame) => recolourOne(frame.src, frame.share, wanted.colour, drawn)))
        : wanted.frames.map((frame) => frame.src);
      return { key: wanted.key, kind: 'frames', frames };
    }
    return { key: wanted.key, kind: 'fill', src: await recolourOne(wanted.src, wanted.share, wanted.colour, wanted.drawn) };
  })();
  made.set(wanted.key, promise);
  if (made.size > 128) made.delete(made.keys().next().value);
  return promise;
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
