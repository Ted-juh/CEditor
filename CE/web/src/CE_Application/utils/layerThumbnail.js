// layerThumbnail.js — a small picture of what is on a layer.
//
// A LOCATOR, NOT A PREVIEW, and the distinction is the design. At 40px in a dock row, 409 controls
// is a texture: it tells you which layer is the dense one and which is your scenery, and where on
// the panel each sits. It will never tell you which knob is which, and trying to make it would
// mean rendering the controls for real — which on the GAIA panel means doubling the DOM to draw
// something 40 pixels wide.
//
// THE TRAP, measured before writing this. 79% of that panel's controls have a fully transparent
// `Background.Fill`: a knob keeps its appearance in `Parts`, a caption in `Text`. Colouring each
// control by its fill therefore draws 26 dark boxes on black and nothing else — which does not read
// as "an empty layer", it reads as "the thumbnail is broken". So anything without an opaque fill
// falls back to a neutral silhouette, and what you get is the panel's LAYOUT with its section
// colours picked out where they exist. That fallback is the whole reason this is usable.
//
// Cost: 0.41 ms for 409 controls, and it is cached by a digest of the geometry it drew, so a drag
// does not regenerate it per frame.

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** Opaque enough to be worth drawing in its own colour, or a silhouette? */
function paintFor(control) {
  const raw = String(control?._children?.Background?._children?.Fill?.colour ?? '');
  if (!/^[0-9a-fA-F]{8}$/.test(raw)) return null;
  return parseInt(raw.slice(0, 2), 16) >= 8 ? `#${raw.slice(2)}` : null;
}

const SILHOUETTE = '#93A2B0';

/**
 * @param {Array} controls      the controls on ONE layer
 * @param {number} panelWidth
 * @param {number} panelHeight
 * @param {number} box          the longest edge of the thumbnail, in px
 * @returns {{svg: string, width: number, height: number} | null}
 *
 * Letterboxed, never stretched: a landscape panel gets a short wide thumbnail and a portrait one
 * gets a tall narrow one, because a thumbnail that lies about the panel's shape is worse at the one
 * job it has. Returns null for an empty layer so the caller can show an empty state rather than a
 * blank rectangle, which reads as a failure.
 */
export function layerThumbnailSvg(controls, panelWidth, panelHeight, box = 40) {
  const list = (controls ?? []).filter((control) => control?._children?.Transform);
  if (list.length === 0) return null;
  if (!(panelWidth > 0 && panelHeight > 0)) return null;

  const scale = Math.min(box / panelWidth, box / panelHeight);
  const width = Math.max(1, Math.round(panelWidth * scale));
  const height = Math.max(1, Math.round(panelHeight * scale));

  const body = list.map((control) => {
    const t = control._children.Transform;
    const paint = paintFor(control);
    // A sub-pixel control still has to leave a mark, or a panel of thin captions thumbnails as
    // an empty box. Half a pixel is enough for the rasteriser to tint something.
    const w = Math.max(0.6, num(t.width) * scale);
    const h = Math.max(0.6, num(t.height) * scale);
    const x = (num(t.x) * scale).toFixed(1);
    const y = (num(t.y) * scale).toFixed(1);
    return `<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"`
      + ` fill="${paint ?? SILHOUETTE}"${paint ? '' : ' fill-opacity="0.55"'}/>`;
  }).join('');

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
      + `<rect width="${width}" height="${height}" fill="#15181B"/>${body}</svg>`,
    width,
    height,
  };
}

/* ------------------------------------------------------------------ the cache */

// Same shape as staticPartBaking's: a rolling digest over exactly the fields drawn, so a moved
// control misses and an unrelated edit does not. Cheaper than stringifying the controls, which on
// a 400-control layer is a couple of megabytes of string per keystroke.
const CACHE_LIMIT = 64;
const cache = new Map();

function fold(hash, value) {
  const text = typeof value === 'string' ? value : String(value);
  let h = hash;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ 0x2c) >>> 0;
}

function digest(controls, panelWidth, panelHeight, box) {
  let h = fold(fold(fold(0x811c9dc5, panelWidth), panelHeight), box);
  for (const control of controls ?? []) {
    const t = control?._children?.Transform;
    if (!t) continue;
    h = fold(fold(fold(fold(h, t.x), t.y), t.width), t.height);
    h = fold(h, control?._children?.Background?._children?.Fill?.colour ?? '');
  }
  return h >>> 0;
}

/** The thumbnail as a data URL, or null for an empty layer. Cached by what it drew. */
export function layerThumbnailUrl(controls, panelWidth, panelHeight, box = 40) {
  const key = `${box}|${digest(controls, panelWidth, panelHeight, box)}|${(controls ?? []).length}`;
  if (cache.has(key)) return cache.get(key);

  const built = layerThumbnailSvg(controls, panelWidth, panelHeight, box);
  const url = built
    ? { url: `data:image/svg+xml;base64,${typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(built.svg)))
        : Buffer.from(built.svg, 'utf8').toString('base64')}`, width: built.width, height: built.height }
    : null;

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, url);
  return url;
}

export const clearThumbnailCache = () => cache.clear();
export const thumbnailCacheSize = () => cache.size;
