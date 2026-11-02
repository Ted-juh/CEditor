// partMask.js — a component layer's mask, and the shadows of a picture layer.
//
// A MASK is what a drawing program calls one: a picture that says how much of the layer shows,
// opaque where it shows and clear where it does not, in between for a soft edge. It lives on the
// part, beside its layout:
//
//   mask: {
//     enabled   false keeps it, unapplied (Photoshop's "Disable Layer Mask")
//     src       the picture: a PNG, or an SVG for a vector mask (a Photoshop vector mask, an SVG
//               clip path or mask), whose ALPHA is the mask
//     x, y, width, height   where it sits, in % of the part's own box, so it moves, turns and scales
//               with the layer as a linked mask does
//     invert    true: shows where the picture is clear
//   }
//
// It is drawn with CSS masking on the part's element (the -webkit- spelling for WebKitGTK and older
// WebView2 builds), so it masks the layer and what the layer draws: its fill, its border, its text,
// its shadows. A masked part is never folded into a static picture (utils/partsToSvg.js), so its
// mask stays its own.
//
// A PICTURE LAYER's shadows (a layer whose fill is an image and nothing else) follow its pixels: a
// CSS box-shadow follows the box, and a round knob in a square picture would cast a square shadow.
// drop-shadow() follows the alpha. It has no spread and no inset, so a spread is not drawn and inner
// shadows and glows on a picture are left to its pixels (the Photoshop import draws them in).

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Whether a mask is there to draw. */
export function maskActive(mask) {
  return !!mask && mask.enabled !== false && typeof mask.src === 'string' && mask.src.length > 0;
}

/** The CSS that applies `mask` to an element of `width` × `height` px, or ''. */
export function partMaskCSS(mask, width, height) {
  if (!maskActive(mask)) return '';
  const x = (num(mask.x, 0) / 100) * width;
  const y = (num(mask.y, 0) / 100) * height;
  const w = Math.max(0, (num(mask.width, 100) / 100) * width);
  const h = Math.max(0, (num(mask.height, 100) / 100) * height);
  const url = `url("${String(mask.src).replace(/"/g, '%22')}")`;
  const px = (value) => `${Math.round(value * 100) / 100}px`;
  // Inverted: everything, less the mask (a full layer composited out with it).
  const images = mask.invert ? `linear-gradient(#000, #000), ${url}` : url;
  const sizes = mask.invert ? `100% 100%, ${px(w)} ${px(h)}` : `${px(w)} ${px(h)}`;
  const positions = mask.invert ? `0 0, ${px(x)} ${px(y)}` : `${px(x)} ${px(y)}`;
  return [
    `-webkit-mask-image:${images}`, `mask-image:${images}`,
    `-webkit-mask-size:${sizes}`, `mask-size:${sizes}`,
    `-webkit-mask-position:${positions}`, `mask-position:${positions}`,
    '-webkit-mask-repeat:no-repeat', 'mask-repeat:no-repeat',
    'mask-mode:alpha',
    ...(mask.invert ? ['-webkit-mask-composite:xor', 'mask-composite:exclude'] : []),
  ].join('; ');
}

/** Whether a part paints a picture and nothing else, so its shadows should follow its pixels. */
export function isPictureLayer(background) {
  const fill = background?._children?.Fill;
  if (!fill || fill.imageEnabled !== true || !fill.imageSrc) return false;
  if (fill.gradientEnabled === true) return false;
  const solid = fill.solidEnabled !== undefined ? fill.solidEnabled !== false : String(background?.mode ?? 'solid') === 'solid';
  return !solid || /^00/i.test(String(fill.colour ?? ''));
}

function rgba(argb) {
  const hex = String(argb ?? '').replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(hex)) {
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return `rgba(${n(2)}, ${n(4)}, ${n(6)}, ${(n(0) / 255).toFixed(3)})`;
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`;
  return 'rgba(0, 0, 0, 0.4)';
}

/** A picture layer's drop shadows and outer glows as drop-shadow() filters, or ''. */
export function pictureShadowFilters(effects) {
  const items = (effects?._children?.Shadows?.items ?? [])
    .filter((item) => item?.enabled && (item.type === 'drop' || item.type === 'outer-glow' || !item.type));
  return items.map((item) => {
    const glow = item.type === 'outer-glow';
    return `drop-shadow(${glow ? 0 : num(item.offsetX, 0)}px ${glow ? 0 : num(item.offsetY, 0)}px ${Math.max(0, num(item.blur, 0))}px ${rgba(item.colour)})`;
  }).join(' ');
}
