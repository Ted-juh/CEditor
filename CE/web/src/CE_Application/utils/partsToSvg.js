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
// TEXT IS REFUSED, and the reason is not the one this comment used to give. The old wording said
// SVG and CSS text metrics differ, which is true and would only ever cost a pixel — it reads like a
// preference, and it is why "surely a declared conversion could allow text" kept coming up. The
// real constraint is harder: the compiled SVG is drawn through an `<img>`, and an image document is
// isolated. It cannot see the page's fonts — not @font-face faces the app loaded from a .cepanel's
// stored fonts, and not reliably the system ones either. A caption in a custom face therefore
// renders in a default face, silently, and looks like the font failed to load rather than like the
// bake did something. Nothing about declaring the intent up front changes that; embedding the face
// in every image would, and costs more than the DOM node it saves. This applies to the scenery
// compile in sceneryCompile.js for exactly the same reason, and it is why a control carrying text
// stays live there too.

import { numberOr } from './primitives.js';
import { normalizeCorner } from './cornerNormalization.js';

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

/**
 * Is the solid fill layer painting?
 *
 * BackgroundRenderer's own rule (CE_Panel/components/BackgroundRenderer.svelte), which is a
 * tri-state and not a boolean: an explicit `solidEnabled` wins, and only when it is ABSENT does the
 * legacy `Background.mode` decide. `mode` lives on the section rather than in its `_children`, so
 * callers that have only the children pass nothing and get the modern reading — which is why
 * fillIsPlain refuses the legacy case outright rather than guessing at it.
 */
export const solidFillIsOn = (fill, mode) => (fill?.solidEnabled !== undefined
  ? fill.solidEnabled !== false
  : (mode === 'none' ? 'overlay' : (mode || 'solid')) === 'solid');

function fillIsPlain(fill, mode) {
  if (!fill) return null;
  if (fill.imageEnabled === true || fill.overlayEnabled === true) return 'image or overlay fill';
  if (fill.soloLayer) return 'solo fill layer';
  // A frame with nothing inside it — border on, solid layer off — is a normal thing to draw, and
  // boxElement now omits the fill rect for it. What cannot be read from the children alone is the
  // LEGACY spelling, where `solidEnabled` is absent and `Background.mode` decides; a caller that
  // knows the mode passes it, and one that does not gets a refusal rather than an opaque rectangle
  // painted over a control that renders transparent.
  if (fill.solidEnabled === undefined && mode !== undefined && !solidFillIsOn(fill, mode)) {
    return `legacy fill mode "${mode}"`;
  }
  for (const layer of ['solid', 'gradient', 'image', 'overlay']) {
    if (fill[`${layer}Muted`] === true) return `muted ${layer} layer`;
    const blend = String(fill[`${layer}Blend`] ?? 'normal');
    if (blend !== 'normal') return `${layer} blend mode "${blend}"`;
  }
  if (fill.gradientEnabled === true) {
    const gradient = fill.gradient ?? {};
    const type = String(gradient.type ?? '');
    if (type !== 'linear' && type !== 'radial') return `gradient type "${type}"`;
    if (num(fill.gradientOpacity, 100) !== 100) return 'gradient opacity';
    // Two features the CSS renderer has and gradientElement below does not, so accepting them
    // would bake a different picture rather than the same one:
    //   `edge` — gradientCSS.buildStops splits every stop into a flat band, so an edged gradient
    //     is hard colour steps live and a smooth ramp compiled.
    //   an ELLIPTICAL radial — CSS takes radiusX and radiusY separately; <radialGradient> here
    //     emits one `r`, so a 30x70 ellipse compiles as a circle of 70.
    if (num(gradient.edge, 0) !== 0) return 'gradient edge hardness';
    if (type === 'radial' && num(gradient.radiusX, 50) !== num(gradient.radiusY, 50)) {
      return 'elliptical radial gradient';
    }
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

function cornersArePlain(corners, border) {
  if (!corners) return null;

  // A corner whose border is switched off is a GAP in the outline: borderSegments.js draws four
  // detached sides and simply omits that corner's arc, so the live control has a hole where this
  // emitter would put a continuous stroked rect. Checked before the radius short-circuit and
  // independently of it, because isCornerOn() does not consult the radius either — and only when a
  // border is actually being drawn, since with no border there is no outline to break.
  if (border?.enabled === true) {
    const off = ['tl', 'tr', 'br', 'bl'].filter((pos) => normalizeCorner(corners, pos).borderEnabled === false);
    if (off.length) return `corner border off (${off.join(', ')})`;
  }

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
  if (children.Text) return 'text part (an <img> cannot see the page\'s fonts)';
  if (children.Effects) return 'effects section';
  if (part.meta && (part.meta.valueArc || part.meta.arcTrack)) return 'arc meta';
  if (part.clipChildren === true) return 'clips children';

  const layout = layoutIsPlain(children.Layout);
  if (layout) return layout;

  const background = children.Background?._children;
  if (!background) return 'no background to draw';
  return fillIsPlain(background.Fill, children.Background.mode)
    ?? borderIsPlain(background.Border)
    ?? cornersArePlain(background.Corners, background.Border);
}

export const isBakeable = (part) => whyNotBakeable(part) === null;

/**
 * Why this Background cannot be drawn, or null.
 *
 * The same three checks `whyNotBakeable` runs, exported so the scenery compile refuses EXACTLY what
 * the part bake refuses. Controls and parts carry the identical Fill/Border/Corners sections, and
 * two lists of "things we understand" that were meant to agree would not stay agreeing.
 */
export function whyBackgroundNotDrawable(background) {
  const children = background?._children;
  if (!children) return 'no background to draw';
  return fillIsPlain(children.Fill, background.mode)
    ?? borderIsPlain(children.Border)
    ?? cornersArePlain(children.Corners, children.Border);
}

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

/**
 * One filled, optionally bordered, optionally rotated box -> one `<rect>`.
 *
 * Shared by the part bake and the scenery compile (utils/sceneryCompile.js), deliberately: two
 * emitters for the same Fill/Border/Corners sections would drift, and the whole safety argument for
 * baking rests on the compiled picture being indistinguishable from the live one.
 *
 * THE BORDER IS ITS OWN RECT, INSET BY HALF ITS THICKNESS, which is not a detail. The live renderer
 * draws a border as SVG segments starting at `thickness / 2` from the edge (borderSegments.js), so
 * the stroke lies ENTIRELY INSIDE the box, over a fill that occupies the whole box. A single rect
 * carrying both fill and stroke cannot say that: the stroke would straddle the outline and put half
 * a border outside the element on every side, so a bordered box baked a pixel larger than it
 * rendered. Two rects — full-box fill, inset stroke — is what the renderer actually does.
 *
 * @param geometry {{x, y, width, height, rotation, pivotX, pivotY, opacity}}
 * @param background the Background section's `_children` — { Fill, Border, Corners }
 */
export function boxElement(geometry, background, defs, key) {
  const width = num(geometry.width);
  const height = num(geometry.height);
  if (!(width > 0 && height > 0)) return '';

  const x = num(geometry.x);
  const y = num(geometry.y);
  const fill = background?.Fill ?? {};
  const border = background?.Border ?? {};
  const radius = Math.min(num(background?.Corners?.radius, 0), Math.min(width, height) / 2);

  // The gradient layer paints over the solid one, so a gradient is drawn whether or not the solid
  // layer is on. With BOTH off there is nothing to fill with — a frame with nothing inside it —
  // and the box must emit its border alone rather than a rectangle of whatever colour the disabled
  // solid layer still happens to hold. (The legacy `Background.mode` spelling of the same state is
  // refused upstream by fillIsPlain, which is the only reading that needs the section.)
  const gradientOn = fill.gradientEnabled === true && fill.gradient;
  const solidOn = fill.solidEnabled !== false;

  let paint = null;
  let opacity = num(geometry.opacity, 1);
  if (gradientOn) {
    const id = `g${key}`;
    defs.push(gradientElement(fill.gradient, id));
    paint = `url(#${id})`;
  } else if (solidOn) {
    const colour = argb(fill.colour, '#000000');
    paint = colour.hex;
    opacity *= colour.alpha;
  }

  // Rotation turns about the pivot, expressed as a percentage of the box — the same convention the
  // CSS renderer uses, and the one the knob pointer depends on. Both rects share it, so a rotated
  // bordered box keeps its border attached to it.
  const rotation = num(geometry.rotation, 0);
  let transform = '';
  if (rotation) {
    const cx = x + width * (num(geometry.pivotX, 50) / 100);
    const cy = y + height * (num(geometry.pivotY, 50) / 100);
    transform = ` transform="rotate(${rotation} ${cx.toFixed(3)} ${cy.toFixed(3)})"`;
  }

  const rounded = (r) => (r > 0 ? ` rx="${r}" ry="${r}"` : '');

  let out = paint === null ? '' : `<rect x="${x}" y="${y}" width="${width}" height="${height}"${rounded(radius)}`
    + ` fill="${escapeText(paint)}" fill-opacity="${opacity.toFixed(3)}"${transform}/>`;

  const thickness = border.enabled === true ? Math.max(0, num(border.thickness, 0)) : 0;
  if (thickness > 0) {
    // Never let the inset invert the box: a 2px border on a 3px divider would otherwise emit a
    // negative width, which is an invalid rect the renderer drops in silence.
    const inset = Math.min(thickness / 2, Math.min(width, height) / 2);
    const colour = argb(border.colour, '#FFFFFF');
    // The radius is authored against the OUTER edge; the stroke's centreline sits `inset` inside it,
    // so its radius shrinks by the same amount — exactly how a CSS border-radius narrows inward.
    const strokeRadius = Math.max(0, Math.min(radius - inset, Math.min(width, height) / 2 - inset));
    out += `<rect x="${x + inset}" y="${y + inset}" width="${width - inset * 2}" height="${height - inset * 2}"`
      + rounded(strokeRadius)
      + ` fill="none" stroke="${colour.hex}" stroke-opacity="${(colour.alpha * num(geometry.opacity, 1)).toFixed(3)}"`
      + ` stroke-width="${thickness}"${transform}/>`;
  }

  return out;
}

/** One bakeable part -> one `<rect>`, plus any gradient it needs pushed onto `defs`. */
function rectElement(part, defs, index) {
  const layout = part._children.Layout;
  return boxElement({
    x: layout.x, y: layout.y, width: layout.width, height: layout.height,
    rotation: layout.rotation, pivotX: layout.pivotX, pivotY: layout.pivotY,
    opacity: part.opacity,
  }, part._children.Background._children, defs, index);
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
