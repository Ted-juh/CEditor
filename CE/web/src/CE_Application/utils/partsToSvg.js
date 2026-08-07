// partsToSvg.js — turn a custom component's UNCHANGING parts into one SVG.
//
// WHY. A GAIA fader is 26 parts and 22 of them are printed scale marks that never move. A knob is
// 16 parts and only the pointer turns. Across that panel: 3,295 parts, 2,821 of which nothing can
// ever change. Every one is a DOM element the browser creates, styles, lays out and paints, and
// 12,025 of them is most of what "opening this panel is slow" is made of.
//
// So the ones that cannot change are compiled to a single SVG and drawn as one element. Measured on
// the GAIA panel: 12,025 surface nodes -> 5,509, load script 2,295 ms -> 1,280 ms, heap 333 MB ->
// 182 MB. SVG rather than a bitmap because it is one element EITHER way and the SVG stays sharp at
// any zoom — the resolution objection to baking simply does not apply.
//
// WHAT THIS FILE IS NOT. It is not a general SVG exporter, and it must never try to be. The parts
// model has blend modes, filters, image fills, chamfered corners, dashed borders, arc meta, percent
// units and text — and the rule here is that anything this file does not understand COMPLETELY is
// refused, by name, so the caller leaves it as a live part. A part that bakes wrong looks exactly
// like a design change nobody made, and it looks that way silently. Refusing is cheap; being wrong
// is not. `whyNotBakeable` returns the reason as a string precisely so that refusing is the easy
// path and widening the subset is a deliberate act with a test attached.
//
// Text is refused permanently, not pending. SVG text and CSS text are laid out by different code
// with different metrics; baking a caption means it moves by a pixel or two on some machines and
// not others, which is the least debuggable defect available.

import { numberOr } from './primitives.js';

/** `FFB9C4CD` (AARRGGBB) -> `{ hex: '#B9C4CD', alpha: 1 }`. */
function argb(raw, fallbackHex = '#000000') {
  const text = String(raw ?? '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6,8}$/.test(text)) return { hex: fallbackHex, alpha: 1 };
  const hex = text.length === 6 ? `FF${text}` : text;
  return { hex: `#${hex.slice(2)}`, alpha: parseInt(hex.slice(0, 2), 16) / 255 };
}

const num = (value, fallback = 0) => numberOr(value, fallback);

/** Fields that must be at their default for a part to be understood by this file. */
function layoutIsPlain(layout) {
  if (!layout) return 'no layout';
  if (String(layout.mode ?? 'absolute') !== 'absolute') return `layout mode "${layout.mode}"`;
  for (const unit of ['xUnit', 'yUnit', 'widthUnit', 'heightUnit']) {
    if (String(layout[unit] ?? 'px') !== 'px') return `${unit} is "${layout[unit]}"`;
  }
  if (String(layout.anchorX ?? 'left') !== 'left' || String(layout.anchorY ?? 'top') !== 'top') return 'non top-left anchor';
  if (num(layout.scale, 1) !== 1) return 'layout scale';
  if (num(layout.offsetX, 0) !== 0 || num(layout.offsetY, 0) !== 0) return 'layout offset';
  return null;
}

function fillIsPlain(fill) {
  if (!fill) return null;
  if (fill.imageEnabled === true || fill.overlayEnabled === true) return 'image or overlay fill';
  if (fill.soloLayer) return 'solo fill layer';
  for (const layer of ['solid', 'gradient', 'image', 'overlay']) {
    if (fill[`${layer}Muted`] === true) return `muted ${layer} layer`;
    const blend = String(fill[`${layer}Blend`] ?? 'normal');
    if (blend !== 'normal') return `${layer} blend mode "${blend}"`;
  }
  if (fill.gradientEnabled === true) {
    const type = String(fill.gradient?.type ?? '');
    if (type !== 'linear' && type !== 'radial') return `gradient type "${type}"`;
    if (num(fill.gradientOpacity, 100) !== 100) return 'gradient opacity';
  }
  return null;
}

function borderIsPlain(border) {
  if (!border || border.enabled !== true) return null;
  if (border.linked === false) return 'per-side border';
  if (String(border.style ?? 'solid') !== 'solid') return `border style "${border.style}"`;
  if (border.fillGradient || border.fillImage || border.fillOverlay) return 'decorated border fill';
  return null;
}

function cornersArePlain(corners) {
  if (!corners) return null;
  if (num(corners.radius, 0) === 0) return null;            // square: nothing to disagree about
  if (corners.linked === false) return 'per-corner radii';
  if (String(corners.style ?? 'rounded') !== 'rounded') return `corner style "${corners.style}"`;
  if (String(corners.direction ?? 'outward') !== 'outward') return 'inward corners';
  return null;
}

/**
 * Why this part cannot be baked, or null if it can.
 *
 * Returned as prose rather than a boolean so a refusal can be logged, counted and read — the
 * question "why is this panel not getting faster" has to have an answer.
 */
export function whyNotBakeable(part) {
  if (!part || typeof part !== 'object') return 'not a part';
  if (part.visible === false) return null;                   // invisible: nothing to draw, safe to drop
  const kind = String(part.kind ?? 'rectangle').toLowerCase();
  if (kind !== 'rectangle') return `part kind "${kind}"`;

  const children = part._children ?? {};
  if (children.Text) return 'text part (SVG and CSS text metrics differ)';
  if (children.Effects) return 'effects section';
  if (part.meta && (part.meta.valueArc || part.meta.arcTrack)) return 'arc meta';
  if (part.clipChildren === true) return 'clips children';

  const layout = layoutIsPlain(children.Layout);
  if (layout) return layout;

  const background = children.Background?._children;
  if (!background) return 'no background to draw';
  return fillIsPlain(background.Fill) ?? borderIsPlain(background.Border) ?? cornersArePlain(background.Corners);
}

export const isBakeable = (part) => whyNotBakeable(part) === null;

const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function gradientElement(gradient, id) {
  const stops = (gradient.stops ?? [])
    .map((stop) => `<stop offset="${num(stop.position, 0)}%" stop-color="#${String(stop.color ?? '000000').replace('#', '')}"/>`)
    .join('');

  if (String(gradient.type) === 'radial') {
    const r = Math.max(num(gradient.radiusX, 50), num(gradient.radiusY, 50));
    return `<radialGradient id="${id}" cx="${num(gradient.centerX, 50)}%" cy="${num(gradient.centerY, 50)}%" r="${r}%">${stops}</radialGradient>`;
  }
  // CSS gradient angles: 0deg points up, 90deg points right. SVG wants two endpoints, so the angle
  // becomes a unit vector through the box centre.
  const radians = ((num(gradient.angle, 180)) - 90) * (Math.PI / 180);
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const at = (v) => (50 + v * 50).toFixed(2);
  return `<linearGradient id="${id}" x1="${at(-dx)}%" y1="${at(-dy)}%" x2="${at(dx)}%" y2="${at(dy)}%">${stops}</linearGradient>`;
}

/** One bakeable part -> one `<rect>`, plus any gradient it needs pushed onto `defs`. */
function rectElement(part, defs, index) {
  const layout = part._children.Layout;
  const x = num(layout.x);
  const y = num(layout.y);
  const width = num(layout.width);
  const height = num(layout.height);
  if (!(width > 0 && height > 0)) return '';

  const background = part._children.Background._children;
  const fill = background.Fill ?? {};
  const border = background.Border ?? {};
  const radius = Math.min(num(background.Corners?.radius, 0), Math.min(width, height) / 2);

  let paint;
  let opacity = num(part.opacity, 1);
  if (fill.gradientEnabled === true && fill.gradient) {
    const id = `g${index}`;
    defs.push(gradientElement(fill.gradient, id));
    paint = `url(#${id})`;
  } else {
    const colour = argb(fill.colour, '#000000');
    paint = colour.hex;
    opacity *= colour.alpha;
  }

  let stroke = '';
  if (border.enabled === true && num(border.thickness, 0) > 0) {
    const colour = argb(border.colour, '#FFFFFF');
    stroke = ` stroke="${colour.hex}" stroke-opacity="${colour.alpha.toFixed(3)}" stroke-width="${num(border.thickness)}"`;
  }

  // Rotation turns about the part's pivot, expressed as a percentage of its own box — the same
  // convention the CSS renderer uses, and the one the knob pointer depends on.
  const rotation = num(layout.rotation, 0);
  let transform = '';
  if (rotation) {
    const cx = x + width * (num(layout.pivotX, 50) / 100);
    const cy = y + height * (num(layout.pivotY, 50) / 100);
    transform = ` transform="rotate(${rotation} ${cx.toFixed(3)} ${cy.toFixed(3)})"`;
  }

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}"`
    + (radius > 0 ? ` rx="${radius}" ry="${radius}"` : '')
    + ` fill="${escapeText(paint)}" fill-opacity="${opacity.toFixed(3)}"${stroke}${transform}/>`;
}

/**
 * Compile an ordered list of `[name, part]` entries into one SVG document.
 *
 * Returns null when there is nothing worth baking — the caller then changes nothing, which is the
 * behaviour that makes this safe to switch on everywhere.
 */
export function partsToSvg(entries, width, height) {
  // One rect is a perfectly good drawing. Whether folding is WORTH it is the caller's judgement
  // (staticPartBaking's MIN_PARTS_TO_BAKE) — mixing that policy in here made the serializer refuse
  // inputs it understood perfectly well.
  if (!Array.isArray(entries) || entries.length < 1) return null;
  if (!(width > 0 && height > 0)) return null;

  const defs = [];
  const body = entries
    .slice()
    .sort((a, b) => num(a[1]?.zIndex, 0) - num(b[1]?.zIndex, 0))
    .map(([, part], index) => (part?.visible === false ? '' : rectElement(part, defs, index)))
    .join('');
  if (!body) return null;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + (defs.length ? `<defs>${defs.join('')}</defs>` : '')
    + `${body}</svg>`;
}

/**
 * The SVG as a data URL, BASE64 rather than percent-encoded.
 *
 * Not a style preference. The document references its own gradients as `url(#g0)`, and
 * encodeURIComponent leaves parentheses alone — so the inner `)` closes the CSS `url(...)` early
 * and the browser gets a truncated document it fails to decode in silence. The first prototype
 * rendered a panel with every knob body missing and no error anywhere.
 */
export function svgToDataUrl(svg) {
  const base64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(svg)))
    : Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}
