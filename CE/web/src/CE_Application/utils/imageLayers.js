// imageLayers.js — the image layers a control carries, and the rules for writing one (design doc §50).
//
// Images were reachable and invisible, the same way fonts were before §46: a Label has 102
// image-related fields, a Knob 864 (many sub-parts, each with its own fill), and not one `ce.*`
// member mentioned any of them. Searching the whole contract for "image" returned three false
// positives.
//
// Three things make this more than a convenience wrapper.
//
// 1. THREE SOURCE MODELS WITH DIFFERENT PORTABILITY, and nothing said so.
//      * a `data:` URL — the payload is in the panel document, so it survives an export. Portable.
//      * a FILE PATH — resolved through the fileCache store, which asks the host to read the file and
//        hand back a data URL. Machine-local, and asynchronous: the layer renders blank until the
//        read lands. Not portable.
//      * an `Icon.assetId` — resolved against `storedIcons`, which is APP SETTINGS, falling back to
//        matching by `name` when the id misses. Not portable, and the name fallback makes it quieter
//        still, because a coincidental match looks like success.
//    embed() exists to collapse the last two into the first.
//
// 2. TWO ACTIVATION MODELS. Background.Fill composites its layers — `layerOrder` decides the
//    stacking and each layer has its own `Enabled`/`Muted`. Text.Fill is EXCLUSIVE: the renderer
//    switches on `mode`, one of solid/gradient/image/texture, and the editor keeps `imageEnabled` in
//    step as bookkeeping that the filmstrip baker reads. So "turn this layer on" means two different
//    writes depending on which section it is, and getting it wrong leaves a layer that is set up and
//    invisible.
//
// 3. TWO `fit` VOCABULARIES UNDER ONE NAME. Background honours fill/fit/stretch/tile/original;
//    Text honours cover/contain/fill. And `fill` does not even mean the same thing in both — it is
//    `cover` on a background and `100% 100%` on text. A single shared list would have been wrong for
//    one of them, which is why the vocabulary belongs to the layer.
//
// Every value below was read out of the code that consumes it: fitToCSS's own switch and posMap in
// backgroundCSS.js, and buildTextFillLayerStyle's sizeMap in canvasControlStyles.js.

/** Background: fitToCSS's switch. `fill` means cover here. */
export const BACKGROUND_FITS = ['fill', 'fit', 'stretch', 'tile', 'original'];
/** Background: fitToCSS's posMap keys. HYPHENATED, not camelCase. */
export const BACKGROUND_ALIGNS = ['top-left', 'top', 'top-right', 'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right'];
/** Text: buildTextFillLayerStyle's sizeMap. `fill` means 100% 100% here — a different meaning from
 *  the background's `fill`, which is the reason these are two lists. */
export const TEXT_FITS = ['cover', 'contain', 'fill'];
/** CSS mix-blend-mode values the background layers pass straight through. */
export const IMAGE_BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'];
export const IMAGE_CLIP_MODES = ['shape', 'box'];

/** The layers a script may address.
 *
 *  `fields` is what the layer actually HAS, and offering a field a layer lacks would write a key
 *  nothing reads. `activation` says how the layer is turned on: "layer" for the additive
 *  Background.Fill model, "mode" for the exclusive Text.Fill one. */
export const IMAGE_LAYERS = [
  {
    id: 'image',
    node: 'Background.Fill',
    prefix: 'image',
    label: 'background image',
    activation: 'layer',
    defaultFit: 'fill',
    fits: BACKGROUND_FITS,
    aligns: BACKGROUND_ALIGNS,
    fields: ['Enabled', 'Muted', 'Src', 'Opacity', 'Fit', 'Align', 'OffsetX', 'OffsetY', 'Blend',
      'Blur', 'Tint', 'FlipH', 'FlipV', 'Rotation', 'Grayscale', 'Saturation', 'Brightness',
      'Contrast', 'TileScale', 'ClipMode'],
  },
  {
    id: 'overlay',
    node: 'Background.Fill',
    prefix: 'overlay',
    label: 'background overlay',
    activation: 'layer',
    // The overlay defaults to tiling rather than filling — BackgroundRenderer's own default.
    defaultFit: 'tile',
    fits: BACKGROUND_FITS,
    aligns: BACKGROUND_ALIGNS,
    fields: ['Enabled', 'Muted', 'Src', 'Opacity', 'Fit', 'Align', 'OffsetX', 'OffsetY', 'Blend',
      'Blur', 'Tint', 'FlipH', 'FlipV', 'Rotation', 'Grayscale', 'Saturation', 'Brightness',
      'Contrast', 'TileScale', 'ClipMode'],
  },
  {
    id: 'textImage',
    node: 'Text.Fill',
    prefix: 'image',
    label: 'text image fill',
    activation: 'mode',
    mode: 'image',
    defaultFit: 'cover',
    fits: TEXT_FITS,
    aligns: null,          // buildTextFillLayerStyle hardcodes the position; align is not read here
    fields: ['Enabled', 'Src', 'Opacity', 'Fit', 'OffsetX', 'OffsetY', 'Tint'],
  },
  {
    id: 'textTexture',
    node: 'Text.Fill',
    prefix: 'texture',
    label: 'text texture',
    activation: 'mode',
    mode: 'texture',
    defaultFit: null,      // the texture branch always tiles; there is no fit to choose
    fits: null,
    aligns: null,
    fields: ['Enabled', 'Src', 'Opacity', 'Tint', 'OffsetX', 'OffsetY', 'TileScale'],
  },
];

export const IMAGE_LAYER_IDS = IMAGE_LAYERS.map((l) => l.id);

const BY_ID = new Map(IMAGE_LAYERS.map((l) => [l.id.toLowerCase(), l]));

/** The layer for a name, or nothing. `image` is the default everywhere a layer is optional. */
export function imageLayer(id) {
  return BY_ID.get(String(id ?? 'image').trim().toLowerCase()) ?? null;
}

/* -------------------------------------------------------------------- sources */

export const SOURCE_KINDS = ['data', 'file', 'none'];

/** What kind of source this is, and therefore whether it travels. */
export function sourceKind(src) {
  const s = String(src ?? '');
  if (!s) return 'none';
  if (s.startsWith('data:')) return 'data';
  // Anything else is a path the fileCache has to resolve through the host. http(s) is included
  // deliberately: it is not in the document either, so it is no more portable than a local file.
  return 'file';
}

/** Does this source survive an export? Only an embedded data URL does. */
export const isPortableSource = (src) => sourceKind(src) === 'data';

/** One icon-library entry, reduced to what a script needs to decide whether it can use it. */
export function assetDescriptor(entry) {
  if (!entry) return null;
  const dataUrl = String(entry.dataUrl ?? '');
  return {
    id: String(entry.id ?? ''),
    name: String(entry.name ?? ''),
    source: String(entry.sourceType ?? 'local'),
    mime: String(entry.mimeType ?? ''),
    vector: entry.isVector === true,
    width: Number(entry.width) || 0,
    height: Number(entry.height) || 0,
    filePath: String(entry.filePath ?? ''),
    dataUrl,
    // A library REFERENCE never travels; the data URL behind it can, once embedded. Reporting both
    // is what lets a script decide rather than discover it after an export.
    portable: false,
    embeddable: dataUrl !== '',
  };
}

/** The catalogue, enabled entries only — a disabled icon is one the panel will not render. */
export function assetCatalogue(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && e.enabled !== false)
    .map(assetDescriptor)
    .filter(Boolean);
}

/** Find an asset by id first, then by name — the same order CanvasControl resolves in, so what a
 *  script sees is what the renderer will pick. */
export function findAsset(catalogue, idOrName) {
  const wanted = String(idOrName ?? '').trim();
  if (!wanted) return null;
  const lower = wanted.toLowerCase();
  return (catalogue ?? []).find((a) => a.id === wanted)
    ?? (catalogue ?? []).find((a) => a.name.toLowerCase() === lower)
    ?? null;
}

/* -------------------------------------------------------------------- planning a write */

const NUMBERS = {
  opacity: 'Opacity', blur: 'Blur', offsetx: 'OffsetX', offsety: 'OffsetY',
  rotation: 'Rotation', saturation: 'Saturation', brightness: 'Brightness',
  contrast: 'Contrast', tilescale: 'TileScale',
};
const BOOLEANS = {
  enabled: 'Enabled', muted: 'Muted', fliph: 'FlipH', flipv: 'FlipV', grayscale: 'Grayscale',
};

/**
 * Turn a set() request into the writes it implies, refusing what cannot be honoured.
 *
 * Returns `{ writes, refused }`. A write is `{ field, value }` with `field` already prefixed, or
 * `{ raw, value }` for the one thing that is not part of a layer's own prefix — `mode` on an
 * exclusive Text.Fill layer.
 *
 * `Src` and `Enabled` are always written together: they are two fields that must agree, and a layer
 * left enabled with a blank source is the commonest way to get a bug you cannot see.
 */
export function planImage(layer, src, opts) {
  const writes = [];
  const refused = [];
  const source = opts && typeof opts === 'object' ? opts : {};
  const has = (name) => layer.fields.includes(name);
  const put = (name, value) => {
    if (!has(name)) {
      refused.push({ option: name, reason: `the ${layer.label} has no ${name} — nothing reads it` });
      return;
    }
    writes.push({ field: `${layer.prefix}${name}`, value });
  };

  if (src !== undefined && src !== null) {
    const text = String(src);
    if (text === '') {
      put('Src', '');
      put('Enabled', false);
      // Leaving an exclusive layer selected with no source shows the solid colour, which is the
      // sane thing — so the mode goes back to solid rather than staying on an empty image.
      if (layer.activation === 'mode') writes.push({ raw: 'mode', value: 'solid' });
    } else {
      put('Src', text);
      put('Enabled', true);
      if (layer.activation === 'mode') writes.push({ raw: 'mode', value: layer.mode });
    }
  }

  if (source.fit !== undefined) {
    if (!layer.fits) {
      refused.push({ option: 'fit', reason: `the ${layer.label} has no fit — it always tiles` });
    } else if (!layer.fits.includes(String(source.fit))) {
      // The vocabularies differ per layer, so the message has to name the layer's own.
      refused.push({ option: 'fit',
        reason: `"${source.fit}" is not one of ${layer.fits.join(', ')} for the ${layer.label}` });
    } else put('Fit', String(source.fit));
  }

  if (source.align !== undefined) {
    if (!layer.aligns) {
      refused.push({ option: 'align',
        reason: `the ${layer.label} does not read align — use offsetX / offsetY` });
    } else if (!layer.aligns.includes(String(source.align))) {
      refused.push({ option: 'align', reason: `"${source.align}" is not one of ${layer.aligns.join(', ')}` });
    } else put('Align', String(source.align));
  }

  if (source.blend !== undefined) {
    if (!IMAGE_BLENDS.includes(String(source.blend))) {
      refused.push({ option: 'blend', reason: `"${source.blend}" is not one of ${IMAGE_BLENDS.join(', ')}` });
    } else put('Blend', String(source.blend));
  }

  if (source.clipMode !== undefined) {
    if (!IMAGE_CLIP_MODES.includes(String(source.clipMode))) {
      refused.push({ option: 'clipMode', reason: `"${source.clipMode}" is not one of ${IMAGE_CLIP_MODES.join(', ')}` });
    } else put('ClipMode', String(source.clipMode));
  }

  if (source.tint !== undefined) put('Tint', String(source.tint).replace(/^#/, ''));

  for (const [key, value] of Object.entries(source)) {
    const lower = key.toLowerCase();
    // `layer` selects which layer this is about — it is consumed by the caller, not written.
    if (lower === 'layer') continue;
    if (['fit', 'align', 'blend', 'clipmode', 'tint'].includes(lower)) continue;   // handled above
    if (NUMBERS[lower]) {
      const asNumber = Number(value);
      if (!Number.isFinite(asNumber)) {
        refused.push({ option: key, reason: `"${value}" is not a number` });
        continue;
      }
      // Opacity is 0..100 here, not 0..1 — the panel's own range, and the one the editor shows.
      const clamped = lower === 'opacity'
        ? Math.max(0, Math.min(100, asNumber))
        : (lower === 'tilescale' ? Math.max(0.1, asNumber) : asNumber);
      put(NUMBERS[lower], clamped);
      continue;
    }
    if (BOOLEANS[lower]) { put(BOOLEANS[lower], value === true); continue; }
    refused.push({ option: key, reason: 'not an image option' });
  }

  return { writes, refused };
}

/** The writes that turn a layer OFF, which is two or three fields rather than one. */
export function planClear(layer) {
  const writes = [{ field: `${layer.prefix}Src`, value: '' }];
  if (layer.fields.includes('Enabled')) writes.push({ field: `${layer.prefix}Enabled`, value: false });
  if (layer.activation === 'mode') writes.push({ raw: 'mode', value: 'solid' });
  return writes;
}
