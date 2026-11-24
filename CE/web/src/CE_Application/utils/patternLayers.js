/**
 * patternLayers.js — the Pattern engine (Animation Designer, step 3; docs/design/animation-designer.md).
 *
 * The owner's example was a label, "Wave", with a sine wave scrolling behind the text and another in
 * front of it, and the way the earlier program did it: one short single-colour image, tiled, tinted
 * on the fly, scrolled in any direction, in front of or behind the text, several at once. That is a
 * pattern. A control's background had an image layer and an overlay layer that could tile, but
 * nothing moved them, their tint was a wash over the picture rather than its colour, and both sat
 * behind everything.
 *
 * THE MODEL. `Background.Patterns` holds any number of patterns by name (pattern1, pattern2…), each:
 *
 *   { _type: 'Pattern', enabled,
 *     src,                      // 'builtin:<tile>' (PATTERN_TILES), or an image as a data URL
 *     tint,                     // AARRGGBB: the colour it is painted in, alpha included
 *     opacity, blend,           // 0..100, and a CSS blend mode (imageLayers.js IMAGE_BLENDS)
 *     scale,                    // the tile's size, 1 = as drawn
 *     repeat,                   // 'both', 'x' (one row), 'y' (one column)
 *     align,                    // where a row or a column sits: 'start', 'center', 'end'
 *     offsetX, offsetY,         // px: where a tile edge falls
 *     place,                    // 'behind' the content (over the fill) or 'front' (over the text)
 *     speed, direction,         // px a second, and degrees: 0 right, 90 down, 180 left, 270 up
 *     flipX, flipY }
 *
 * A row only moves along itself and a column down itself: a row moving up would slide out of the
 * control, not loop. The other half of its direction is ignored, and the editor says so.
 *
 * HOW IT DRAWS. The tile is a mask, not a picture: the painted element is filled with the tint and
 * shows only where the image is opaque, which is what "a single-colour image, tinted on the fly"
 * means, and why any colour can be animated (the tint is `background-color`, on the colour timing).
 * Written prefixed and unprefixed, as WebView2 and WebKitGTK each read one or both.
 *
 * HOW IT MOVES. Not by animating the mask's position, which repaints the whole layer every frame,
 * but by moving the element that carries it: a mover one tile wide slides by its own width
 * (`translate: 100% 0`) and starts again, and its painted child is a tile larger than the control
 * on every side so no edge ever shows. A translate is composited — the mask is painted once and the
 * compositor moves it — so a scrolling pattern costs about what a fading opacity does. A diagonal is
 * two movers, one inside the other, each looping on its own axis at its own rate, so any angle loops
 * seamlessly. Checked in WebKitGTK 2.52 and Chromium 158, 2026-11-24 (the design record, step 3).
 *
 * WHAT STOPS IT. Reduced motion (the operating system's, or the preview's switch) draws every pattern
 * still. A hidden window draws nothing, so nothing moves.
 */
import { IMAGE_BLENDS } from './imageLayers.js';

export const PATTERN_REPEATS = ['both', 'x', 'y'];
export const PATTERN_PLACES = ['behind', 'front'];
export const PATTERN_ALIGNS = ['start', 'center', 'end'];

/** The limits a value is kept to — past them a typo, not a design. */
const LIMITS = {
  opacity: [0, 100],
  scale: [0.1, 10],
  speed: [0, 2000],
  offsetX: [-10000, 10000],
  offsetY: [-10000, 10000],
};

/** A new pattern: a sine wave in a row, white, drifting right. */
export const PATTERN_DEFAULTS = Object.freeze({
  _type: 'Pattern',
  enabled: true,
  src: 'builtin:sine',
  tint: 'FFFFFFFF',
  opacity: 100,
  blend: 'normal',
  scale: 1,
  repeat: 'x',
  align: 'center',
  offsetX: 0,
  offsetY: 0,
  place: 'behind',
  speed: 30,
  direction: 0,
  flipX: false,
  flipY: false,
});

const sinePath = (width, height, amplitude, step = 2) => {
  const mid = height / 2;
  const points = [];
  for (let x = 0; x <= width; x += step) points.push(`${x} ${(mid - amplitude * Math.sin((x / width) * Math.PI * 2)).toFixed(2)}`);
  return `M${points.join(' L')}`;
};

const svgTile = (width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
const stroke = (d, width = 2) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${width}" stroke-linejoin="round"/>`;

/**
 * The built-in tiles: white on nothing, so the tint is their colour. Each tiles seamlessly — a line
 * leaves one edge where it enters the next — and the four waveforms are one period each, a synth's
 * own shapes.
 */
export const PATTERN_TILES = Object.freeze({
  sine: { label: 'Sine wave', width: 64, height: 24, svg: svgTile(64, 24, stroke(sinePath(64, 24, 9))) },
  triangle: { label: 'Triangle wave', width: 64, height: 24, svg: svgTile(64, 24, stroke('M0 12 L16 3 L48 21 L64 12')) },
  saw: { label: 'Saw wave', width: 64, height: 24, svg: svgTile(64, 24, stroke('M0 21 L62 3 L64 21')) },
  square: { label: 'Square wave', width: 64, height: 24, svg: svgTile(64, 24, stroke('M0 21 V3 H32 V21 H64')) },
  dots: { label: 'Dots', width: 16, height: 16, svg: svgTile(16, 16, '<circle cx="8" cy="8" r="3" fill="#fff"/>') },
  stripes: { label: 'Stripes', width: 16, height: 16, svg: svgTile(16, 16, stroke('M0 16 L16 0 M-4 4 L4 -4 M12 20 L20 12', 3)) },
  grid: { label: 'Grid', width: 16, height: 16, svg: svgTile(16, 16, stroke('M0 15.5 H16 M15.5 0 V16', 1)) },
  checks: { label: 'Checks', width: 16, height: 16, svg: svgTile(16, 16, '<path d="M0 0 H8 V8 H0 Z M8 8 H16 V16 H8 Z" fill="#fff"/>') },
  chevrons: { label: 'Chevrons', width: 32, height: 16, svg: svgTile(32, 16, stroke('M0 12 L16 4 L32 12')) },
  scanlines: { label: 'Scan lines', width: 4, height: 4, svg: svgTile(4, 4, '<rect width="4" height="1" fill="#fff"/>') },
});
export const PATTERN_TILE_NAMES = Object.keys(PATTERN_TILES);

const BUILTIN = /^builtin:([a-z]+)$/;
// An image a person picked, read into the document so it travels with it. Only these characters can
// be in a base64 or percent-encoded data URL, and none of them can end a url("…") or a declaration.
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml)(?:;[a-z0-9=.+-]+)*,[A-Za-z0-9+/=%._~:;,!*-]*$/;

/** The built-in tile a source names, or null. */
export function builtinTile(src) {
  const match = BUILTIN.exec(String(src ?? ''));
  return match ? PATTERN_TILES[match[1]] ?? null : null;
}

/** A built-in tile as a data URL. */
export function tileDataUrl(tile) {
  return `data:image/svg+xml,${encodeURIComponent(tile.svg)}`;
}

/**
 * The URL a pattern's source draws from, or null when it cannot be drawn: a built-in tile's, or a data
 * URL that is only an image. Anything else — a file path, a web address, text with a quote in it —
 * is refused here, so what reaches the mask is always a picture in the document.
 */
export function patternImageUrl(src) {
  const tile = builtinTile(src);
  if (tile) return tileDataUrl(tile);
  const text = String(src ?? '');
  return DATA_IMAGE.test(text) ? text : null;
}

const clamp = (key, value, fallback) => {
  const n = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(n)) return fallback;
  const [lo, hi] = LIMITS[key];
  return Math.min(hi, Math.max(lo, n));
};

/** AARRGGBB, upper case, or the fallback. Six digits are opaque. */
export function cleanTint(value, fallback = 'FFFFFFFF') {
  const hex = String(value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{8}$/.test(hex)) return hex.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `FF${hex.toUpperCase()}`;
  return fallback;
}

/** One pattern, read with every field at its default where it is missing or makes no sense. */
export function readPattern(node) {
  const d = PATTERN_DEFAULTS;
  const pick = (list, value, fallback) => (list.includes(value) ? value : fallback);
  const direction = Number(node?.direction);
  return {
    enabled: node?.enabled !== false,
    src: String(node?.src ?? d.src),
    tint: cleanTint(node?.tint, d.tint),
    opacity: clamp('opacity', node?.opacity, d.opacity),
    blend: pick(IMAGE_BLENDS, node?.blend, d.blend),
    scale: clamp('scale', node?.scale, d.scale),
    repeat: pick(PATTERN_REPEATS, node?.repeat, 'both'),
    align: pick(PATTERN_ALIGNS, node?.align, d.align),
    offsetX: clamp('offsetX', node?.offsetX, 0),
    offsetY: clamp('offsetY', node?.offsetY, 0),
    place: pick(PATTERN_PLACES, node?.place, d.place),
    speed: clamp('speed', node?.speed, 0),
    direction: Number.isFinite(direction) ? ((direction % 360) + 360) % 360 : 0,
    flipX: node?.flipX === true,
    flipY: node?.flipY === true,
  };
}

/** A background's patterns, in order, as [name, node]. */
export function patternEntries(background) {
  const children = background?._children?.Patterns?._children;
  return children && typeof children === 'object' ? Object.entries(children).filter(([, node]) => node && typeof node === 'object') : [];
}

/** Whether a background draws a pattern at all. */
export function hasPatterns(background) {
  return patternEntries(background).some(([, node]) => readPattern(node).enabled);
}

/** Whether any of a background's patterns moves. */
export function patternsMove(background) {
  return patternEntries(background).some(([, node]) => {
    const pattern = readPattern(node);
    return pattern.enabled && pattern.speed > 0;
  });
}

/** How far a pattern travels a second along each axis, its repeat taken into account. */
export function patternVelocity(pattern) {
  const radians = (pattern.direction * Math.PI) / 180;
  let vx = pattern.speed * Math.cos(radians);
  let vy = pattern.speed * Math.sin(radians);
  if (Math.abs(vx) < 1e-6) vx = 0;
  if (Math.abs(vy) < 1e-6) vy = 0;
  // A row only moves along itself, a column down itself (see THE MODEL).
  if (pattern.repeat === 'x') vy = 0;
  if (pattern.repeat === 'y') vx = 0;
  return { vx, vy };
}

const px = (value) => `${Number(Number(value).toFixed(3))}px`;
const mod = (value, size) => ((value % size) + size) % size;
const argbCss = (argb) => `#${argb.slice(2)}${argb.slice(0, 2)}`;
// Longer than this and a loop is standing still to anyone watching; it is drawn still instead.
const LONGEST_LOOP_MS = 600000;

/** One axis's mover: how long a tile takes to pass, which way, and whether the clock ticks. */
function mover(distance, velocity, fps) {
  if (!velocity) return null;
  const duration = (distance / Math.abs(velocity)) * 1000;
  if (!(duration > 0) || duration > LONGEST_LOOP_MS) return null;
  const steps = fps > 0 ? Math.max(1, Math.round((duration / 1000) * fps)) : 0;
  return {
    duration: Math.max(1, Math.round(duration)),
    reverse: velocity < 0,
    // A capped frame rate is the same slide in steps: the compositor has a frame to draw `fps` times
    // a second rather than every refresh. `jump-end` keeps the loop seamless (no step lands on the end).
    timing: steps ? `steps(${steps}, jump-end)` : 'linear',
  };
}

/**
 * How one pattern is drawn in a box: the tile's size, the painted area, and a mover for each axis it
 * travels on (null for one it does not). `natural` is the image's own size in px.
 * `{ reduced }` draws it still; `{ fps }` caps how often it moves (0: every frame).
 */
export function patternLayout(pattern, natural, box, { reduced = false, fps = 0 } = {}) {
  const tileW = Math.max(1, Number(natural?.width) * pattern.scale || 0);
  const tileH = Math.max(1, Number(natural?.height) * pattern.scale || 0);
  const width = Math.max(0, Number(box?.width) || 0);
  const height = Math.max(0, Number(box?.height) || 0);
  const along = (size, tile, align) => (align === 'start' ? 0 : align === 'end' ? size - tile : (size - tile) / 2);

  let area;
  if (pattern.repeat === 'x') {
    area = { left: -tileW, top: along(height, tileH, pattern.align) + pattern.offsetY, width: width + 2 * tileW, height: tileH };
  } else if (pattern.repeat === 'y') {
    area = { left: along(width, tileW, pattern.align) + pattern.offsetX, top: -tileH, width: tileW, height: height + 2 * tileH };
  } else {
    area = { left: -tileW, top: -tileH, width: width + 2 * tileW, height: height + 2 * tileH };
  }
  // Where a tile edge falls, measured from the painted area's own corner.
  const positionX = pattern.repeat === 'y' ? 0 : mod(pattern.offsetX - area.left, tileW);
  const positionY = pattern.repeat === 'x' ? 0 : mod(pattern.offsetY - area.top, tileH);
  const { vx, vy } = reduced ? { vx: 0, vy: 0 } : patternVelocity(pattern);
  return {
    tile: { width: tileW, height: tileH },
    area,
    position: { x: positionX, y: positionY },
    moveX: mover(tileW, vx, fps),
    moveY: mover(tileH, vy, fps),
  };
}

/**
 * The CSS for one pattern: `layer` (its opacity and blend, on the element that clips it), the two
 * movers' (or null), and `paint` (the tinted, masked area). Null when it cannot be drawn. Numbers, a
 * checked colour and a checked URL only, so each is safe in a style attribute.
 */
export function patternStyles(node, natural, box, options = {}) {
  const pattern = readPattern(node);
  if (!pattern.enabled) return null;
  const url = patternImageUrl(pattern.src);
  if (!url || !natural) return null;
  const layout = patternLayout(pattern, natural, box, options);
  const { tile, area, position } = layout;
  const repeat = pattern.repeat === 'x' ? 'repeat-x' : pattern.repeat === 'y' ? 'repeat-y' : 'repeat';
  const mask = [
    `-webkit-mask-image:url("${url}")`, `mask-image:url("${url}")`,
    `-webkit-mask-size:${px(tile.width)} ${px(tile.height)}`, `mask-size:${px(tile.width)} ${px(tile.height)}`,
    `-webkit-mask-repeat:${repeat}`, `mask-repeat:${repeat}`,
    `-webkit-mask-position:${px(position.x)} ${px(position.y)}`, `mask-position:${px(position.x)} ${px(position.y)}`,
  ];
  const flip = pattern.flipX || pattern.flipY ? [`scale:${pattern.flipX ? -1 : 1} ${pattern.flipY ? -1 : 1}`] : [];
  const paint = [
    `left:${px(area.left)}`, `top:${px(area.top)}`, `width:${px(area.width)}`, `height:${px(area.height)}`,
    `background-color:${argbCss(pattern.tint)}`,
    ...mask,
    ...flip,
  ].join(';');
  const moverStyle = (move) => (move
    ? `width:${px(tile.width)};height:${px(tile.height)};animation-duration:${move.duration}ms;animation-timing-function:${move.timing};animation-direction:${move.reverse ? 'reverse' : 'normal'}`
    : null);
  return {
    place: pattern.place,
    layer: `opacity:${Number((pattern.opacity / 100).toFixed(3))};mix-blend-mode:${pattern.blend}`,
    moveX: moverStyle(layout.moveX),
    moveY: moverStyle(layout.moveY),
    paint,
    moves: !!(layout.moveX || layout.moveY),
  };
}

/** The natural size of a source, where it is known without loading it: a built-in tile's. */
export function knownTileSize(src) {
  const tile = builtinTile(src);
  return tile ? { width: tile.width, height: tile.height } : null;
}

/** The next free name for a pattern: pattern1, pattern2… */
export function nextPatternName(background) {
  const taken = new Set(patternEntries(background).map(([name]) => name));
  for (let n = 1; ; n += 1) if (!taken.has(`pattern${n}`)) return `pattern${n}`;
}

/**
 * The write that adds a pattern to a background at `prefix` (its path on the control, 'Background'
 * or 'Parts.<p>.Background'): the pattern on its own where the background has patterns already, and
 * the whole Patterns node where it has none, since a write into a node that is not there is dropped
 * (the same reason as animationModel.js animationsPatch). `{ patch, name }`.
 */
export function addPatternPatch(background, prefix = 'Background', fields = {}) {
  const name = nextPatternName(background);
  const node = { ...PATTERN_DEFAULTS, ...fields, _type: 'Pattern' };
  if (background?._children?.Patterns?._children) {
    return { name, patch: { [`${prefix}.Patterns.${name}`]: node } };
  }
  return { name, patch: { [`${prefix}.Patterns`]: { _type: 'Patterns', _children: { [name]: node } } } };
}

/** "Pattern 1" for pattern1; a name someone gave it, as they gave it. */
export function patternLabel(name) {
  const match = /^pattern(\d+)$/.exec(String(name ?? ''));
  return match ? `Pattern ${match[1]}` : String(name ?? '');
}
