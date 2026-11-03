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
//     x, y, width, height   where it sits: in % of the part's own box while linked, so it moves,
//               turns and scales with the layer; in % of the artboard while not
//     invert    true: shows where the picture is clear
//     linked    false: the mask stays put on the artboard while the layer moves under it (a
//               pointer turning behind a fixed window); absent or true: it moves with the layer
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

/**
 * Add Layer Mask's picture: opaque everywhere, so the layer shows whole until the mask is moved,
 * sized or replaced. An SVG with a view box and no fixed aspect, so it stretches to any size.
 */
export const REVEAL_ALL_MASK_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' preserveAspectRatio='none'%3E%3Crect width='16' height='16' fill='%23fff'/%3E%3C/svg%3E";

/** A new mask over the whole layer: `src` (a reveal-all picture when none), linked, on. */
export function newMask(src = REVEAL_ALL_MASK_SRC) {
  return { enabled: true, src: src || REVEAL_ALL_MASK_SRC, x: 0, y: 0, width: 100, height: 100, invert: false, linked: true };
}

/** Whether the mask moves with its layer (the default) rather than staying put on the artboard. */
export function maskLinked(mask) {
  return mask?.linked !== false;
}

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * The mask linked to its layer or not, placed where it was: its rect turned from % of the layer's
 * box into % of the artboard, or back. `frame` is the layer's box on the artboard in px (unturned:
 * a turned layer's mask is placed by its box), `artboard` is `{ width, height }`.
 */
export function relinkMask(mask, frame, artboard, linked) {
  if (!mask || maskLinked(mask) === !!linked) return mask;
  const fw = Math.max(1e-6, num(frame?.width, 1));
  const fh = Math.max(1e-6, num(frame?.height, 1));
  const aw = Math.max(1e-6, num(artboard?.width, 1));
  const ah = Math.max(1e-6, num(artboard?.height, 1));
  const left = num(frame?.left, 0);
  const top = num(frame?.top, 0);
  const x = num(mask.x, 0);
  const y = num(mask.y, 0);
  const w = num(mask.width, 100);
  const h = num(mask.height, 100);
  const rect = linked
    ? { x: ((x / 100) * aw - left) / fw * 100, y: ((y / 100) * ah - top) / fh * 100, width: (w / 100) * aw / fw * 100, height: (h / 100) * ah / fh * 100 }
    : { x: (left + (x / 100) * fw) / aw * 100, y: (top + (y / 100) * fh) / ah * 100, width: (w / 100) * fw / aw * 100, height: (h / 100) * fh / ah * 100 };
  return { ...mask, linked: !!linked, x: round2(rect.x), y: round2(rect.y), width: round2(rect.width), height: round2(rect.height) };
}

/** The mask over exactly its layer's box: Fit to Layer. */
export function fitMaskToLayer(mask, frame, artboard) {
  if (!mask) return mask;
  if (maskLinked(mask)) return { ...mask, x: 0, y: 0, width: 100, height: 100 };
  const aw = Math.max(1e-6, num(artboard?.width, 1));
  const ah = Math.max(1e-6, num(artboard?.height, 1));
  return {
    ...mask,
    x: round2(num(frame?.left, 0) / aw * 100),
    y: round2(num(frame?.top, 0) / ah * 100),
    width: round2(num(frame?.width, 0) / aw * 100),
    height: round2(num(frame?.height, 0) / ah * 100),
  };
}

/**
 * Make an opaque picture a mask, in place: its brightness becomes how much shows (white shows,
 * black hides), as Photoshop reads a picture pasted into a layer mask. `data` is RGBA bytes. A
 * picture with any transparency of its own is left alone and false returned: its alpha already is
 * the mask.
 */
export function brightnessToAlpha(data) {
  if (!data || data.length < 4) return false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return false;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = lum;
  }
  return true;
}

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
