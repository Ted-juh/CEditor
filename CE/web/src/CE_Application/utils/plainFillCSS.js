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
  return true;
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
  // An image or overlay layer is a whole sub-language of fit, align, offset, tile scale, blur,
  // tint, flip, rotation and colour adjustment (backgroundCSS.buildLayerStyle). Not one property.
  if (layer === 'image' || layer === 'overlay') return `${layer} fill layer`;

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

  if (!fill.gradient) return 'gradient layer with no gradient';
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

  const paint = layer === 'solid' ? argbToCss(fill.colour) : gradientToCSS(fill.gradient);
  if (!paint) return null;

  const shape = String(fill[`${layer}ClipMode`] ?? 'shape') === 'none'
    ? ''
    : fillShapeCSS(background._children.Corners, width, height);

  return `background: ${paint};${shape ? ` ${shape}` : ''}`;
}
