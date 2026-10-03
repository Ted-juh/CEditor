// Where a button's or switch's anatomy form draws its device and its caption.
//
// The forms are drawn in one fixed frame, 160 by 100: the device in the top 80, the caption under
// it at 11 units (editor/ControlAnatomy.svelte and the anatomy files it hands off to). That frame
// is scaled into the control's box whole, so a box the frame's shape and about its size reads, and
// a button's usual 120 by 40 does not: the frame meets the box at 0.4, the device is a sliver in
// the middle of the box and the caption is 4px high. Every set that draws its buttons as forms had
// that on every button of the usual size.
//
// So a box too small for the frame's caption is laid out in its own pixels instead. The caption is
// set at a size that reads, 9 to 12px, and the device takes what is left at the largest scale that
// fits: beside the caption in a box wider than the frame (the usual button), above it in one that
// is narrower (a square pad). A caption longer than the room is set smaller, to 8px, then cut.
// A box the frame reads in keeps the frame, exactly as it was drawn.

const FRAME_W = 160;
const DEVICE_H = 80;
const FRAME_H = 100;
const CAPTION_UNITS = 11;
// The frame is kept while its caption is at least 8px on screen.
const KEEP_FRAME_AT = 8 / CAPTION_UNITS;
const MIN_TEXT = 8;
// An average advance for bold capitals and figures in the sans faces the sets letter in, on the
// generous side: Nunito Sans bold runs wider than DM Sans.
const ADVANCE = 0.68;
// Kept clear at the box's edges.
const MARGIN = 2;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function fit(text, size, room, spacing) {
  const width = (t, s) => String(t).length * (ADVANCE * s + spacing);
  let s = size;
  while (s > MIN_TEXT && width(text, s) > room) s -= 0.5;
  let t = String(text);
  if (width(t, s) > room) {
    while (t.length > 1 && width(`${t}…`, s) > room) t = t.slice(0, -1);
    t = `${t}…`;
  }
  return { text: t, size: s, width: Math.min(room, width(t, s)) };
}

/**
 * The layout of a button or switch form in a box of `width` by `height` pixels with `caption`
 * under or beside it, or null where the fixed frame reads and is kept. A layout is in the box's
 * pixels: `device` is the transform that places the frame's top 80 units, `caption` is null for no
 * caption, or `{ text, size, x, y, anchor }`. `letterSpacing` is the caption's, in pixels.
 */
export function buttonAnatomyLayout(width, height, caption = '', { letterSpacing = 0 } = {}) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0) || !(h > 0)) return null;
  if (Math.min(w / FRAME_W, h / FRAME_H) >= KEEP_FRAME_AT) return null;
  const words = String(caption ?? '').trim();
  const spacing = Math.max(0, Number(letterSpacing) || 0);
  const place = (x, y, scale) => `translate(${+x.toFixed(2)} ${+y.toFixed(2)}) scale(${+scale.toFixed(4)})`;

  if (w / h > FRAME_W / FRAME_H) {
    // Beside: the device on the left, its caption after it, the pair centred in the box.
    const size = clamp(h * 0.3, 9, 12);
    const gap = words ? Math.max(4, size * 0.5) : 0;
    const set = words ? fit(words, size, w * 0.55, spacing) : null;
    const room = w - 2 * MARGIN - (set?.width ?? 0) - gap;
    const scale = Math.max(0, Math.min(room / FRAME_W, h / DEVICE_H));
    const left = (w - (FRAME_W * scale + gap + (set?.width ?? 0))) / 2;
    return {
      device: place(left, (h - DEVICE_H * scale) / 2, scale),
      caption: set && { text: set.text, size: set.size, x: left + FRAME_W * scale + gap, y: h / 2 + set.size * 0.36, anchor: 'start' },
    };
  }
  // Under: the device above, its caption below, as the frame has it, at a size that reads.
  const size = clamp(w * 0.1, 9, 12);
  const set = words ? fit(words, size, w - 2 * MARGIN, spacing) : null;
  const band = set ? set.size * 1.4 : 0;
  const scale = Math.max(0, Math.min(w / FRAME_W, (h - band) / DEVICE_H));
  return {
    device: place((w - FRAME_W * scale) / 2, Math.max(0, (h - band - DEVICE_H * scale) / 2), scale),
    caption: set && { text: set.text, size: set.size, x: w / 2, y: h - set.size * 0.35, anchor: 'middle' },
  };
}
