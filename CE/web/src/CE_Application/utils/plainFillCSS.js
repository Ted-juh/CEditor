// plainFillCSS.js — a background colour is a background, not an element.
//
// WHY. BackgroundRenderer paints each fill layer as its own absolutely-positioned div, because a
// Fill is four stackable layers — solid, gradient, image, overlay — each with its own opacity,
// blend mode and clip, and stacking those genuinely needs elements. On the GAIA panel it costs 889
// of them, and almost every one is a single flat colour. A single flat colour is what the
// `background` property is for, and every box that wants one ALREADY HAS an element: the control's
// own `.control-content`, the part's own `.interactive-part`. Painting it there costs nothing at
// all, which is the cheapest an element can get.
//
// THE STACKING ORDER IS PRESERVED FOR FREE, and that is the whole reason this is safe rather than
// merely small. The fill layers are the FIRST children of their wrapper, so they paint below
// everything else inside it — and an element's own background paints below every one of its
// children by definition. Moving the paint from the first child to the parent changes which
// element carries it and nothing about where it lands.
//
// ONE LAYER ONLY. The moment two layers are visible, their order and their blending are the point,
// and `background` can hold only one image. Two visible layers are refused outright rather than
// half-handled. Everything else that cannot be said in one declaration — a blend mode, a partial
// gradient opacity, a fill clipped to the inside of the border — is refused by name, as in
// plainBorderCSS.js and partsToSvg.js.
//
// ALPHA GOES IN THE COLOUR, NOT IN `opacity`. BackgroundRenderer writes a translucent solid as
// `background: #RRGGBB; opacity: 0.4` on a div of its own, where fading that div fades only the
// fill. On the wrapper, `opacity` would fade the control's text, its parts and its border along
// with it. Eight-digit hex says the same thing about the colour and nothing about the children.

import { normalizeCorner } from './cornerNormalization.js';
import { gradientToCSS } from './gradientCSS.js';
import { buildLayerStyle } from './backgroundCSS.js';
import { buildFillClipPath } from './cornerPaths.js';
import { numberOr } from './primitives.js';

const LAYERS = ['solid', 'gradient', 'image', 'overlay'];
const DEFAULT_ORDER = Object.freeze([...LAYERS]);

/** BackgroundRenderer's legacy fallback: `Background.mode` decides when a layer flag is absent. */
const legacyMode = (background) => (background?.mode === 'none' ? 'overlay' : (background?.mode || 'solid'));

/**
 * Is this fill layer switched on? The renderer's own tri-state, copied exactly.
 *
 * An explicit `<layer>Enabled` wins; only when it is ABSENT does the legacy `Background.mode`
 * decide. Getting this wrong in either direction paints a rectangle over a control that renders
 * transparent, or drops one that does not.
 */
function layerEnabled(background, layerId) {
  const fill = background?._children?.Fill;
  const flag = fill?.[`${layerId}Enabled`];
  if (flag !== undefined) return layerId === 'solid' ? flag !== false : flag === true;
  return legacyMode(background) === layerId;
}

function layerVisible(background, layerId) {
  const fill = background?._children?.Fill;
  if (!layerEnabled(background, layerId)) return false;
  if (fill?.soloLayer && fill.soloLayer !== layerId) return false;
  if (fill?.[`${layerId}Muted`] === true) return false;
  // A layer with nothing to paint WITH draws nothing, and BackgroundRenderer gates on exactly
  // these — `fill?.colour`, `fill?.gradient`, `fill?.imageSrc`, `fill?.overlaySrc` — before it
  // will emit an element. Without this, an enabled image layer whose source has not been set
  // counts as the one visible layer here while the renderer draws none, and the absorbed path
  // paints a broken url where the live one painted nothing.
  if (layerId === 'solid') return !!fill?.colour;
  if (layerId === 'gradient') return !!fill?.gradient;
  return !!fill?.[`${layerId}Src`];
}

/** `FF3A3A3A` (AARRGGBB) -> `#3A3A3AFF` (CSS #RRGGBBAA), so alpha rides in the colour. */
function argbToCss(raw) {
  const hex = String(raw ?? '').replace('#', '').trim();
  if (/^[0-9a-fA-F]{8}$/.test(hex)) return `#${hex.slice(2)}${hex.slice(0, 2)}`;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`;
  return null;
}

/**
 * The shape a fill takes: a border-radius, a clip-path, or nothing.
 *
 * Extracted from BackgroundRenderer so the absorbed fill and the one still drawn as a layer are
 * shaped by the same function rather than by two that are meant to agree. Radii are deliberately
 * NOT clamped here — CSS clamps overflowing radii itself, and clamping early would make an
 * absorbed fill disagree with a layered one on the same panel.
 */
export function cornersNeedClipPath(corners) {
  if (!corners) return false;
  return ['tl', 'tr', 'br', 'bl'].map((pos) => normalizeCorner(corners, pos)).some((c) => c.radius > 0
    && (c.style === 'chamfer' || c.style === 'notch' || (c.style === 'rounded' && c.direction === 'inward')));
}

export function fillShapeCSS(corners, width, height) {
  if (!corners || width <= 0 || height <= 0) return '';
  const at = (pos) => normalizeCorner(corners, pos);
  const tl = at('tl'); const tr = at('tr'); const br = at('br'); const bl = at('bl');

  if (cornersNeedClipPath(corners)) return buildFillClipPath({ tl, tr, br, bl }, width, height);

  const r = (c) => ((c.radius > 0 && c.style === 'rounded' && c.direction !== 'inward') ? c.radius : 0);
  const radii = [r(tl), r(tr), r(br), r(bl)];
  if (radii.every((v) => v === 0)) return '';
  return `border-radius: ${radii.map((v) => `${v}px`).join(' ')};`;
}

/**
 * An image or overlay layer's CSS, built from the same pseudo-panel BackgroundRenderer builds.
 *
 * Lifted out of the component rather than copied, for the reason fillShapeCSS was: the absorbed
 * path and the layered path have to produce the same picture, and two functions meant to agree do
 * not stay agreeing. `buildLayerStyle` speaks the panel background's vocabulary — `bgImageFit`,
 * `bgTextureAlign` — so the translation from a Fill's `imageFit` / `overlayAlign` lives here.
 */
export function imageLayerStyle(fill, layerId, src, width, height) {
  const isImage = layerId === 'image';
  const prefix = isImage ? 'Image' : 'Texture';
  const from = isImage ? 'image' : 'overlay';
  const at = (key, fallback) => fill?.[`${from}${key}`] ?? fallback;

  return buildLayerStyle({
    width,
    height,
    [`bg${prefix}Enabled`]: true,
    [`bg${prefix}`]: src,
    [`bg${prefix}Fit`]: at('Fit', isImage ? 'fill' : 'tile'),
    [`bg${prefix}Align`]: at('Align', 'center'),
    [`bg${prefix}OffsetX`]: at('OffsetX', 0),
    [`bg${prefix}OffsetY`]: at('OffsetY', 0),
    [`bg${prefix}Blend`]: at('Blend', 'normal'),
    [`bg${prefix}Opacity`]: at('Opacity', 100),
    [`bg${prefix}Blur`]: at('Blur', 0),
    [`bg${prefix}Tint`]: at('Tint', 'FFFFFF'),
    [`bg${prefix}FlipH`]: at('FlipH', false),
    [`bg${prefix}FlipV`]: at('FlipV', false),
    [`bg${prefix}Rotation`]: at('Rotation', 0),
    [`bg${prefix}Grayscale`]: at('Grayscale', false),
    [`bg${prefix}Saturation`]: at('Saturation', 100),
    [`bg${prefix}Brightness`]: at('Brightness', 100),
    [`bg${prefix}Contrast`]: at('Contrast', 100),
    [`bg${prefix}TileScale`]: at('TileScale', 1.0),
  }, prefix, src);
}

// The only properties that may ride along to the wrapper. Everything else buildLayerStyle can emit
// — `transform` for a flipped or rotated layer, `filter` for blur and colour adjustment,
// `box-shadow` for a tint, a partial `opacity`, a real blend — would apply to the control's text,
// its parts and its border as well as to its background. An allowlist rather than a blocklist, so
// a property added to that builder next year is refused by default.
const RIDES_ALONG = new Set(['background-image', 'background-size', 'background-position', 'background-repeat']);

/**
 * Split a style string into declarations WITHOUT breaking inside `url(...)`.
 *
 * A baked image is a base64 data URL, and `data:image/svg+xml;base64,...` carries a semicolon in
 * its own mime type. Splitting on `;` cuts every one of them in half — silently, into a truncated
 * URL and a fragment that parses as a nonsense property.
 */
function declarations(style) {
  const out = [];
  let depth = 0;
  let start = 0;
  const text = String(style ?? '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out.map((d) => d.trim()).filter(Boolean);
}

/** An image layer reduced to background properties alone, or null if it needs more than those. */
function absorbableImageStyle(style) {
  if (!style) return null;
  const kept = [];
  for (const decl of declarations(style)) {
    const split = decl.indexOf(':');
    if (split < 0) return null;
    const prop = decl.slice(0, split).trim();
    const value = decl.slice(split + 1).trim();
    if (RIDES_ALONG.has(prop)) { kept.push(`${prop}: ${value}`); continue; }
    // buildLayerStyle always writes these two; at their identity values they say nothing and are
    // dropped rather than carried onto an element whose children would inherit the consequences.
    if (prop === 'opacity' && Number(value) === 1) continue;
    if (prop === 'mix-blend-mode' && value === 'normal') continue;
    return null;
  }
  return kept.length ? `${kept.join('; ')};` : null;
}

/**
 * Why this fill cannot be painted on the wrapper, or null if it can.
 *
 * Prose, so "why is this panel still 4,000 elements" has an answer somebody can read.
 */
export function whyFillNotPlainCSS(background) {
  const fill = background?._children?.Fill;
  if (!fill) return 'no fill';

  const order = fill.layerOrder?.length ? fill.layerOrder : DEFAULT_ORDER;
  const visible = order.filter((id) => LAYERS.includes(id) && layerVisible(background, id));
  if (visible.length === 0) return 'nothing painting';
  // Two layers ARE the feature — their order and their blending is what the author asked for, and
  // `background` holds one image. Refused whole rather than half-handled.
  if (visible.length > 1) return `${visible.length} fill layers`;

  const [layer] = visible;

  const blend = String(fill[`${layer}Blend`] ?? 'normal');
  if (blend !== 'normal') return `${layer} blend mode "${blend}"`;

  // 'shape' is the default and is what fillShapeCSS draws; 'none' means an unshaped rectangle,
  // which is expressible too. 'border-inner' insets the fill by each side's resolved stroke and
  // is not.
  const clipMode = String(fill[`${layer}ClipMode`] ?? 'shape');
  if (clipMode !== 'shape' && clipMode !== 'none') return `${layer} clip mode "${clipMode}"`;

  // A chamfered, notched or inward corner is drawn with a `clip-path`, and a clip-path on the
  // wrapper clips its CHILDREN as well as its background — the control's text, its parts, its
  // border. A border-radius does not (only an overflow clip is reshaped by it), which is why one
  // is accepted and the other is not. The fill keeps its own element and its own clip.
  if (clipMode !== 'none' && cornersNeedClipPath(background._children?.Corners)) return 'corners need a clip-path';

  if (layer === 'solid') {
    if (!argbToCss(fill.colour)) return 'unreadable fill colour';
    return null;
  }

  if (layer === 'image' || layer === 'overlay') {
    const src = String(fill[`${layer}Src`] ?? '');
    // A stored path resolves through the fileCache store, which this function cannot read and must
    // not: it is pure, and a wrong answer here paints the previous panel's artwork. A data URL
    // needs no lookup — and every image this actually catches is one, because they are the baked
    // static art of custom components (utils/staticPartBaking.js), 154 of them on the GAIA panel.
    if (!src.startsWith('data:')) return `${layer} source is a stored file`;
    if (!absorbableImageStyle(imageLayerStyle(fill, layer, src, 1, 1))) return `${layer} needs more than a background`;
    return null;
  }

  // A gradient's opacity is a separate `opacity:` on its own div. On the wrapper that would fade
  // the control's children too, and unlike a solid colour there is no alpha channel to hide it in.
  if (numberOr(fill.gradientOpacity, 100) !== 100) return 'gradient opacity';
  return null;
}

/**
 * The CSS for a fill that can be painted on an element that already exists, or null.
 *
 * Returns a style fragment — `background` plus whatever shape the corners ask for — to be appended
 * to the wrapper's own inline style. The caller that uses it must then tell BackgroundRenderer not
 * to draw the layer as well.
 */
export function plainFillCSS(background, width, height) {
  if (whyFillNotPlainCSS(background)) return null;
  if (!(width > 0 && height > 0)) return null;

  const fill = background._children.Fill;
  const order = fill.layerOrder?.length ? fill.layerOrder : DEFAULT_ORDER;
  const layer = order.find((id) => LAYERS.includes(id) && layerVisible(background, id));

  let paint;
  if (layer === 'image' || layer === 'overlay') {
    // Already validated by whyFillNotPlainCSS; the real width and height matter here because a
    // rotated layer's cover scale is computed from them.
    paint = absorbableImageStyle(imageLayerStyle(fill, layer, String(fill[`${layer}Src`]), width, height));
  } else {
    const colour = layer === 'solid' ? argbToCss(fill.colour) : gradientToCSS(fill.gradient);
    paint = colour ? `background: ${colour};` : null;
  }
  if (!paint) return null;

  const shape = String(fill[`${layer}ClipMode`] ?? 'shape') === 'none'
    ? ''
    : fillShapeCSS(background._children.Corners, width, height);

  return `${paint}${shape ? ` ${shape}` : ''}`;
}
