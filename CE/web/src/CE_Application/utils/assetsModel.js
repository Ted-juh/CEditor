/**
 * assetsModel.js — the pure half of the Assets tab.
 *
 * No Svelte, no DOM, no icons: everything here is arithmetic over the `Assets` section so it can
 * be tested under plain `node --test`. See `docs/design/assets-tab-design.md` for why the tab
 * exists at all; the short version is that `Assets.images` and `Assets.filmstrips` are name-keyed
 * maps picked from two `<select>` dropdowns today, and that a filmstrip's frame count can be
 * arithmetically wrong with nothing in the application checking it.
 *
 * THE FRAME COUNT CHECK IS THE POINT OF THIS FILE. `InteractivePartRenderer` slices a strip with
 * proportional CSS background positioning, not pixel offsets, so a strip whose length along the
 * frame axis does not divide evenly by `frameCount` renders frames that drift and, at the far end,
 * show a sliver of a neighbour. `frameDivision()` is that test, and `suggestFrameCounts()` is the
 * repair. Both need the image's NATURAL size, which the asset does not store — `frameWidth` and
 * `frameHeight` are set at import as `round(total / frameCount)`, which has already thrown the
 * remainder away. The caller measures and passes it in.
 */

/** Which map on `Assets` holds each kind. */
export const ASSET_MAP_BY_KIND = { image: 'images', filmstrip: 'filmstrips' };

export const ASSET_KINDS = Object.keys(ASSET_MAP_BY_KIND);

/** `_type` written by the editor when it creates one, kept so new assets match imported ones. */
export const ASSET_TYPE_BY_KIND = { image: 'ImageAsset', filmstrip: 'FilmstripAsset' };

export const FILMSTRIP_ORIENTATIONS = ['vertical', 'horizontal'];
export const FILMSTRIP_INTERPOLATIONS = ['nearest', 'linear'];

const numberOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/**
 * Library identity. Names collide across the two maps — an image and a filmstrip may both be
 * called `knob` — so a single grid needs the kind in the key or the wrong one gets selected.
 */
export function assetKey(kind, name) {
  if (!ASSET_MAP_BY_KIND[kind] || !name) return '';
  return `${kind}:${name}`;
}

export function parseAssetKey(key) {
  const text = String(key ?? '');
  const cut = text.indexOf(':');
  if (cut < 1) return null;
  const kind = text.slice(0, cut);
  const name = text.slice(cut + 1);
  if (!ASSET_MAP_BY_KIND[kind] || !name) return null;
  return { kind, name };
}

/** The `updateControlProperty` path for one field of one asset, or the asset itself with no field. */
export function assetPath(kind, name, field = '') {
  const map = ASSET_MAP_BY_KIND[kind];
  if (!map || !name) return '';
  return field ? `Assets.${map}.${name}.${field}` : `Assets.${map}.${name}`;
}

/**
 * Every asset as a flat, sorted list — one library rather than two dropdowns.
 *
 * Sorted by name across both kinds on purpose: the grid shows the kind as a badge, and sorting by
 * kind first would put the same two dropdowns back on screen with a gap between them.
 */
export function listAssets(assets) {
  const out = [];
  for (const kind of ASSET_KINDS) {
    const map = assets?.[ASSET_MAP_BY_KIND[kind]] ?? {};
    for (const name of Object.keys(map)) {
      const asset = map[name];
      if (!asset || typeof asset !== 'object') continue;
      out.push(describeAsset(kind, name, asset));
    }
  }
  out.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    || left.kind.localeCompare(right.kind));
  return out;
}

export function describeAsset(kind, name, asset) {
  const source = String(asset?.source ?? '');
  return {
    key: assetKey(kind, name),
    kind,
    name,
    asset,
    source,
    hasSource: source.startsWith('data:image/') || /^https?:|^\.?\//.test(source),
    generated: asset?.generated === true,
    // Named for the stored property, not prettied to `packaged`: the settings column reads
    // `descriptor[field.key]`, so a descriptor key that drifts from the write path renders blank.
    package: asset?.package !== false,
    // Images record their natural size at import; filmstrips record a per-frame size instead.
    width: Math.max(0, Math.round(numberOr(asset?.width, 0))),
    height: Math.max(0, Math.round(numberOr(asset?.height, 0))),
    frameCount: kind === 'filmstrip' ? Math.max(1, Math.round(numberOr(asset?.frameCount, 1))) : 1,
    frameWidth: Math.max(0, Math.round(numberOr(asset?.frameWidth, 0))),
    frameHeight: Math.max(0, Math.round(numberOr(asset?.frameHeight, 0))),
    orientation: normalizeOrientation(asset?.orientation),
    interpolation: String(asset?.interpolation ?? 'nearest') === 'linear' ? 'linear' : 'nearest',
    valueSource: String(asset?.valueSource ?? 'mainValue') || 'mainValue',
    sourceFileName: String(asset?.sourceFileName ?? ''),
    bytes: estimateSourceBytes(source),
  };
}

export function findAsset(assets, key) {
  const parsed = parseAssetKey(key);
  if (!parsed) return null;
  const asset = assets?.[ASSET_MAP_BY_KIND[parsed.kind]]?.[parsed.name];
  return asset ? describeAsset(parsed.kind, parsed.name, asset) : null;
}

export function normalizeOrientation(value) {
  return String(value ?? 'vertical') === 'horizontal' ? 'horizontal' : 'vertical';
}

// --- Frames -----------------------------------------------------------------

export function clampFrameIndex(index, frameCount) {
  const total = Math.max(1, Math.round(numberOr(frameCount, 1)));
  const wanted = Math.round(numberOr(index, 0));
  return Math.max(0, Math.min(total - 1, wanted));
}

export function stepFrame(index, delta, frameCount) {
  return clampFrameIndex(clampFrameIndex(index, frameCount) + Math.round(numberOr(delta, 0)), frameCount);
}

/**
 * The run of frames the stage draws.
 *
 * A 128-frame strip cannot be shown a frame at a time and cannot be shown all at once either, so
 * the stage is a window: `capacity` consecutive frames with the current one inside it, kept in
 * range at both ends. Centring is what makes stepping feel like moving along the strip rather than
 * flicking between pictures.
 */
export function frameWindow({ frameCount = 1, frameIndex = 0, capacity = 9 } = {}) {
  const total = Math.max(1, Math.round(numberOr(frameCount, 1)));
  const room = Math.max(1, Math.min(total, Math.round(numberOr(capacity, 9))));
  const current = clampFrameIndex(frameIndex, total);
  let start = current - Math.floor((room - 1) / 2);
  start = Math.max(0, Math.min(total - room, start));
  const indices = [];
  for (let i = 0; i < room; i += 1) indices.push(start + i);
  return { start, count: room, indices, atStart: start === 0, atEnd: start + room >= total };
}

/**
 * The CSS that shows one frame of a strip.
 *
 * MIRRORED FROM `editor/InteractivePartRenderer.svelte`, deliberately and exactly. The preview is
 * only evidence about the renderer if it does what the renderer does — including the part that is
 * wrong for a strip that does not divide evenly. Computing frame offsets in pixels here would give
 * a tidy preview of a defect that ships, which is worse than no preview.
 */
export function frameBackground({ frameCount = 1, frameIndex = 0, orientation = 'vertical' } = {}) {
  const total = Math.max(1, Math.round(numberOr(frameCount, 1)));
  const index = clampFrameIndex(frameIndex, total);
  const offset = total <= 1 ? 0 : (index / (total - 1)) * 100;
  return normalizeOrientation(orientation) === 'horizontal'
    ? { backgroundSize: `${total * 100}% 100%`, backgroundPosition: `${offset}% 0%` }
    : { backgroundSize: `100% ${total * 100}%`, backgroundPosition: `0% ${offset}%` };
}

/**
 * Does the strip divide evenly into its frames?
 *
 * `width` and `height` are the image's measured natural size. Pass zeroes when it has not been
 * measured yet and the result reports `known: false` rather than inventing a verdict — an
 * unmeasured strip is not a passing strip.
 */
export function frameDivision({ width = 0, height = 0, frameCount = 1, orientation = 'vertical' } = {}) {
  const axis = normalizeOrientation(orientation) === 'horizontal' ? 'width' : 'height';
  const total = Math.max(0, Math.round(numberOr(axis === 'width' ? width : height, 0)));
  const frames = Math.max(1, Math.round(numberOr(frameCount, 1)));
  const known = total > 0;
  const remainder = known ? total % frames : 0;
  return {
    axis,
    total,
    frameCount: frames,
    known,
    framePixels: known ? total / frames : 0,
    remainder,
    divides: known && remainder === 0,
    // More frames than pixels is a different fault from a remainder and needs saying differently:
    // no frame count divides it usefully, the strip itself is wrong.
    overSliced: known && frames > total,
  };
}

/** Every divisor of `total`, ascending. Cheap — the loop is to the square root. */
export function divisorsOf(total) {
  const n = Math.max(0, Math.round(numberOr(total, 0)));
  if (n <= 0) return [];
  const small = [];
  const large = [];
  for (let i = 1; i * i <= n; i += 1) {
    if (n % i !== 0) continue;
    small.push(i);
    if (i !== n / i) large.push(n / i);
  }
  large.reverse();
  return small.concat(large);
}

/**
 * The frame counts nearest the current one that DO divide the strip evenly.
 *
 * Sorted by distance from the count in use, so the first offer is the smallest change that fixes
 * the drift. A prime-length strip only has 1 and itself, and the caller says so rather than
 * offering "use 1".
 */
export function suggestFrameCounts(total, frameCount, limit = 3) {
  const current = Math.max(1, Math.round(numberOr(frameCount, 1)));
  const candidates = divisorsOf(total).filter((value) => value !== current);
  candidates.sort((left, right) => Math.abs(left - current) - Math.abs(right - current) || left - right);
  return candidates.slice(0, Math.max(0, Math.round(numberOr(limit, 3))));
}

/**
 * Changing the frame count also changes what one frame measures, and the two are stored
 * separately. The import path already computes `frameWidth`/`frameHeight` this way; a fix button
 * that moved the count and left the sizes behind would trade one wrong number for two.
 */
export function frameCountPatch({ kind = 'filmstrip', name = '', frameCount = 1, width = 0, height = 0, orientation = 'vertical' } = {}) {
  const path = assetPath(kind, name);
  if (!path || kind !== 'filmstrip') return {};
  const frames = Math.max(1, Math.round(numberOr(frameCount, 1)));
  const axis = normalizeOrientation(orientation);
  const naturalWidth = Math.max(0, Math.round(numberOr(width, 0)));
  const naturalHeight = Math.max(0, Math.round(numberOr(height, 0)));
  const patch = { [`${path}.frameCount`]: frames };
  if (naturalWidth > 0 && naturalHeight > 0) {
    patch[`${path}.frameWidth`] = axis === 'horizontal' ? Math.round(naturalWidth / frames) : naturalWidth;
    patch[`${path}.frameHeight`] = axis === 'horizontal' ? naturalHeight : Math.round(naturalHeight / frames);
    // The strip's own size goes on too. `customComponentPackage.js` reads `width`/`height` off a
    // filmstrip when it builds the export summary and nothing in the application has ever written
    // them, so every exported strip reports 0x0. This is the one moment the measurement is in hand
    // and the user has asked for a change, so it is recorded rather than measured and thrown away.
    patch[`${path}.width`] = naturalWidth;
    patch[`${path}.height`] = naturalHeight;
  }
  return patch;
}

// --- Settings ---------------------------------------------------------------

/**
 * The fields the settings column draws, by kind.
 *
 * These are the properties actually stored on the asset — `customComponentPackage.js` and
 * `customComponentMaterializer.js` both carry `frameWidth`/`frameHeight` through export, so they
 * are real fields and not bookkeeping. `name` and `source` are not here: a name is the map key
 * (renaming is a move, and generators reference the old one), and a source is a data URL nobody
 * edits by hand.
 */
export const ASSET_FIELD_GROUPS = {
  image: [
    {
      title: 'Package',
      fields: [
        { key: 'package', label: 'Embed', kind: 'toggle', hint: 'Ship this image inside the saved component.' },
      ],
    },
  ],
  filmstrip: [
    {
      title: 'Frames',
      fields: [
        { key: 'frameCount', label: 'Count', kind: 'number', min: 1, step: 1, hint: 'How many frames the strip holds.' },
        { key: 'orientation', label: 'Axis', kind: 'choice', options: FILMSTRIP_ORIENTATIONS, hint: 'Which way the frames run.' },
        { key: 'frameWidth', label: 'Frame W', kind: 'number', min: 0, step: 1, hint: 'One frame’s width. Carried into the exported package.' },
        { key: 'frameHeight', label: 'Frame H', kind: 'number', min: 0, step: 1, hint: 'One frame’s height. Carried into the exported package.' },
      ],
    },
    {
      title: 'Drive',
      fields: [
        { key: 'valueSource', label: 'Value', kind: 'text', hint: 'Value channel that chooses the frame.' },
        { key: 'interpolation', label: 'Interp', kind: 'choice', options: FILMSTRIP_INTERPOLATIONS, hint: 'How the runtime moves between frames.' },
      ],
    },
    {
      title: 'Package',
      fields: [
        { key: 'package', label: 'Embed', kind: 'toggle', hint: 'Ship this strip inside the saved component.' },
      ],
    },
  ],
};

export function assetFieldGroups(kind) {
  return ASSET_FIELD_GROUPS[kind] ?? [];
}

/** The two build settings that live on `Assets` itself rather than on one asset. */
export const PACKAGE_POLICY_FIELDS = [
  { key: 'embedAssets', label: 'Embed assets', hint: 'Package images and filmstrips with saved components.' },
  { key: 'warnMissingFonts', label: 'Warn on fonts', hint: 'Warn when downloaded components reference missing fonts.' },
];

/**
 * Every label this tab can edit.
 *
 * Same purpose as `allEffectFieldLabels()` and `allTypographyFieldLabels()`: the properties panel's
 * search index is built from the rows it draws, so the day these rows come out of the panel the
 * search has to be fed from here instead. Relocating a group without its search index is losing it,
 * not moving it.
 */
export function allAssetFieldLabels() {
  const labels = new Set();
  for (const kind of ASSET_KINDS) {
    for (const group of assetFieldGroups(kind)) {
      for (const field of group.fields) labels.add(field.label);
    }
  }
  for (const field of PACKAGE_POLICY_FIELDS) labels.add(field.label);
  return [...labels];
}

// --- Sizes ------------------------------------------------------------------

/** Bytes behind a data URL, from the base64 length. Zero for anything else. */
export function estimateSourceBytes(source) {
  const text = String(source ?? '');
  if (!text.startsWith('data:')) return 0;
  const encoded = text.split(',', 2)[1] ?? '';
  return Math.floor((encoded.length * 3) / 4);
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  // Bytes below a kilobyte are shown as bytes rather than rounded to "0 KB". A small asset reading
  // zero looks like a broken one, which is the opposite of what a size readout is for.
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

/** A short, honest name for a source: the file it came from, else the data URL's type. */
export function sourceLabel(descriptor) {
  if (!descriptor?.source) return 'no source';
  if (descriptor.sourceFileName) return descriptor.sourceFileName;
  if (descriptor.generated) return 'baked';
  const match = String(descriptor.source).match(/^data:image\/([a-z0-9.+-]+);/i);
  return match ? `${match[1].toLowerCase()} data` : 'linked';
}

/**
 * An image asset records its natural size at import — and then never again. Replace the source by
 * hand and `width`/`height` describe the old picture, which `customComponentPackage.js` copies
 * straight into the exported package summary.
 *
 * So the tab measures what is actually there and compares. `known: false` means it has not been
 * measured yet, which is not the same as agreeing.
 */
export function imageSizeCheck({ stored = { width: 0, height: 0 }, measured = { width: 0, height: 0 } } = {}) {
  const storedWidth = Math.max(0, Math.round(numberOr(stored?.width, 0)));
  const storedHeight = Math.max(0, Math.round(numberOr(stored?.height, 0)));
  const width = Math.max(0, Math.round(numberOr(measured?.width, 0)));
  const height = Math.max(0, Math.round(numberOr(measured?.height, 0)));
  const known = width > 0 && height > 0;
  return {
    known,
    width,
    height,
    storedWidth,
    storedHeight,
    recorded: storedWidth > 0 && storedHeight > 0,
    matches: known && storedWidth === width && storedHeight === height,
  };
}

/** Write a measured size onto an asset. Both kinds: the package summary reads `width`/`height` off
 *  a filmstrip too, and nothing has ever written them there. */
export function assetSizePatch({ kind = 'image', name = '', width = 0, height = 0 } = {}) {
  const path = assetPath(kind, name);
  const w = Math.max(0, Math.round(numberOr(width, 0)));
  const h = Math.max(0, Math.round(numberOr(height, 0)));
  if (!path || w <= 0 || h <= 0) return {};
  return { [`${path}.width`]: w, [`${path}.height`]: h };
}

/**
 * A first guess at a frame count, from the picture itself.
 *
 * Filmstrip frames are square far more often than not — a knob strip is N square frames stacked —
 * so the axis length divided by the cross length is the count. The guess is rounded rather than
 * refused when it does not divide exactly, because the check bar is right underneath it: a wrong
 * guess is visible and one click from correct, which is better than importing every strip as one
 * frame and making the user work it out.
 */
export function guessFrameCount({ width = 0, height = 0, orientation = 'vertical' } = {}) {
  const horizontal = normalizeOrientation(orientation) === 'horizontal';
  const axis = Math.max(0, Math.round(numberOr(horizontal ? width : height, 0)));
  const cross = Math.max(0, Math.round(numberOr(horizontal ? height : width, 0)));
  if (axis <= 0 || cross <= 0) return 1;
  const ratio = axis / cross;
  if (ratio < 1.5) return 1;
  return Math.max(1, Math.round(ratio));
}

/** The extension a data URL implies, normalised the way a file on disk would spell it. */
export function dataUrlExtension(source) {
  const match = String(source ?? '').match(/^data:image\/([a-z0-9.+-]+);/i);
  if (!match) return 'png';
  if (match[1].toLowerCase() === 'jpeg') return 'jpg';
  return match[1].replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'png';
}

/** A file name safe enough to hand to a download attribute. */
export function safeAssetFileName(value, fallback = 'asset') {
  return String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    || fallback;
}

export function assetFileName(descriptor) {
  if (!descriptor) return '';
  return `${safeAssetFileName(descriptor.name, descriptor.kind)}.${dataUrlExtension(descriptor.source)}`;
}

/** The asset object an import writes. Kept here so the shape matches what the editor already
 *  creates rather than drifting into a second dialect of the same record. */
export function importedAsset({ kind = 'image', name = '', source = '', width = 0, height = 0, orientation = 'vertical', fileName = '' } = {}) {
  const now = new Date().toISOString();
  const common = {
    _type: ASSET_TYPE_BY_KIND[kind] ?? ASSET_TYPE_BY_KIND.image,
    name,
    source,
    package: true,
    importedAt: now,
    sourceFileName: fileName,
    width: Math.max(0, Math.round(numberOr(width, 0))),
    height: Math.max(0, Math.round(numberOr(height, 0))),
  };
  if (kind !== 'filmstrip') return common;
  const axis = normalizeOrientation(orientation);
  const frameCount = guessFrameCount({ width, height, orientation: axis });
  return {
    ...common,
    frameCount,
    frameWidth: axis === 'horizontal' ? Math.round(common.width / frameCount) : common.width,
    frameHeight: axis === 'horizontal' ? common.height : Math.round(common.height / frameCount),
    orientation: axis,
    interpolation: 'nearest',
    valueSource: 'mainValue',
  };
}
