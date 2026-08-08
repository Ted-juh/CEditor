// plainBorderCSS.js — the border most panels actually use, drawn without an SVG.
//
// WHY. BackgroundRenderer paints every enabled border as `<svg><defs/><g>` plus eight `<path>` —
// four sides and four corners — because the border model can do things no single CSS declaration
// can: a different colour per side, a dashed top over a solid bottom, a gradient flowing round the
// outline, chamfered and notched corners, the twin rings of `double`. Eleven DOM elements, and they
// are spent whether or not the border in front of you needs any of it.
//
// Almost none of them do. On the GAIA panel all 223 borders are uniform, solid, single-colour and
// either square or plainly rounded — 168 of them live on screen at once, costing 1,848 elements to
// say `border: 1px solid #556` 168 times. This module answers one question, "does this border
// reduce EXACTLY to CSS", and when it does the renderer emits one absolutely-positioned div instead.
// Eleven elements become one.
//
// THE GEOMETRY IS NOT AN APPROXIMATION, which is the only reason this is safe. borderSegments.js
// strokes each side along a centreline `thickness / 2` inside the edge at `stroke-width: thickness`,
// so the paint covers exactly the band from the edge to `thickness` inward — which is precisely
// where `box-sizing: border-box` puts a CSS border. Corner arcs are drawn at the authored radius
// with the same centreline inset, so the outer curve is the authored radius and the inner curve is
// `radius - thickness`, which is exactly how CSS narrows a radius under a border. Both clamp the
// radius to half the shorter side. There is no fudge factor here and there must never be one: the
// moment the two disagree, this file should REFUSE rather than come close.
//
// REFUSALS ARE THE POINT, as in partsToSvg.js. Every branch below names a thing the SVG path can
// draw and CSS cannot, and returns null so the caller keeps the eleven elements and the correct
// picture. Widening the accepted set is a deliberate act with a pixel test attached.
//
// This is independent of the FILL. A gradient, an image, a blend mode — none of it changes whether
// the outline is expressible, and the fill layers keep their own elements either way. Asking about
// the border alone is what lets a gradient-filled box with a hairline outline take this path.

import { numberOr } from './primitives.js';
import { normalizeCorner } from './cornerNormalization.js';

const CORNERS = ['tl', 'tr', 'br', 'bl'];

/**
 * `FFB9C4CD` (AARRGGBB) -> `#B9C4CDFF` (CSS #RRGGBBAA).
 *
 * The same conversion borderSegments.strokeColour does, and it has to be: a border colour is stored
 * alpha-first, and reading it as plain RGB is what once painted every translucent hairline solid
 * white. Kept here rather than imported because that one is private to the segment builder.
 */
function strokeColour(raw) {
  const hex = String(raw ?? 'FFFFFFFF').replace('#', '').trim();
  if (/^[0-9a-fA-F]{8}$/.test(hex)) return `#${hex.slice(2)}${hex.slice(0, 2)}`;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`;
  return '#FFFFFF';
}

/**
 * The thickness the SVG path would actually stroke with.
 *
 * `|| 2`, not `?? 2`, and this is not a typo to tidy up: getSideStrokes reads `s?.thickness || 2`,
 * so an enabled border stored at thickness 0 draws a TWO pixel line on the canvas. Matching a
 * quirk is the job — a CSS border that honoured the 0 would silently erase an outline that is
 * visibly there, which is the one failure mode this whole file exists to avoid.
 */
const strokeThickness = (border) => numberOr(border?.thickness, 0) || 2;

/**
 * Why this border cannot be written as CSS, or null if it can.
 *
 * Prose for the same reason `whyNotBakeable` is prose: "why is this panel still 5,000 elements"
 * needs an answer somebody can read, and a boolean does not have one.
 */
export function whyBorderNotPlainCSS(border, corners) {
  if (!border || border.enabled !== true) return 'no border';

  // Per-side borders are the headline case CSS could ALMOST do — `border-top`, `border-right` and
  // friends exist. It is refused anyway, because the model's per-side data carries its own style,
  // dash geometry and fill flags per side, and "almost" is how a renderer starts lying.
  if (border.linked === false) return 'per-side border';

  const style = String(border.style ?? 'solid');
  // Every non-solid style is a different picture, not a different value: dashed and dotted are dash
  // arrays whose periods CSS computes differently, double is two rings with a gap, and
  // groove/ridge/inset/outset are two half-thickness strokes in derived shades (strokeResolver.js).
  if (style !== 'solid') return `border style "${style}"`;

  if (border.fillGradient === true) return 'gradient border fill';
  if (border.fillImage === true) return 'image border fill';
  if (border.fillOverlay === true) return 'overlay border fill';
  if (border.fillSolid === false) return 'solid border fill switched off';

  // A corner with its border switched off is a GAP in the outline — borderSegments.js simply omits
  // that arc, leaving four detached sides. CSS has no way to open a hole in one corner of a box.
  const off = CORNERS.filter((pos) => normalizeCorner(corners, pos).borderEnabled === false);
  if (off.length) return `corner border off (${off.join(', ')})`;

  for (const pos of CORNERS) {
    const corner = normalizeCorner(corners, pos);
    if (corner.radius <= 0) continue;                  // square corner: nothing to disagree about
    // Chamfer cuts the corner flat, notch cuts it inward, and an inward "rounded" corner curves the
    // wrong way. All three are real shapes in the model and none is a border-radius.
    if (corner.style !== 'rounded') return `corner style "${corner.style}"`;
    if (corner.direction !== 'outward') return 'inward corners';
  }

  return null;
}

export const borderIsPlainCSS = (border, corners) => whyBorderNotPlainCSS(border, corners) === null;

/**
 * The CSS for a plain border, or null when there isn't one.
 *
 * Returns a complete inline style for one absolutely-positioned box: the caller renders
 * `<div style={...}>` and nothing else. `width`/`height` are needed only to clamp the radii the way
 * both renderers do.
 */
export function plainBorderCSS(border, corners, width, height) {
  if (whyBorderNotPlainCSS(border, corners)) return null;
  if (!(width > 0 && height > 0)) return null;

  const thickness = strokeThickness(border);
  if (!(thickness > 0)) return null;

  // Per-corner radii are ACCEPTED even though partsToSvg refuses them, and the difference is real
  // rather than an inconsistency: that file has to emit one `rx` on one `<rect>`, while
  // `border-radius` takes four corners natively. Unlinked corners still take the border's colour and
  // thickness — getCornerStrokes reads those from the border whenever the BORDER is linked, which
  // the check above has already established.
  const radii = CORNERS.map((pos) => {
    const corner = normalizeCorner(corners, pos);
    if (corner.radius <= 0 || corner.style !== 'rounded' || corner.direction !== 'outward') return 0;
    // The same clamp borderSegments applies, and the same one CSS applies when radii overflow.
    return Math.max(0, Math.min(corner.radius, Math.min(width, height) / 2));
  });

  const parts = [
    'position:absolute',
    'inset:0',
    'box-sizing:border-box',
    'pointer-events:none',
    `border:${thickness}px solid ${strokeColour(border.colour)}`,
  ];
  if (radii.some((r) => r > 0)) parts.push(`border-radius:${radii.map((r) => `${r}px`).join(' ')}`);
  return `${parts.join('; ')};`;
}
