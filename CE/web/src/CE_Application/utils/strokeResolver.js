/**
 * Resolve a CSS-like border style into a list of paintable stroke layers.
 * Each returned layer carries its own thickness, colour, centerline offset,
 * dash array and line cap — the caller just paints them in order.
 *
 *   style     — 'solid' | 'dashed' | 'dotted' | 'groove' | 'ridge' |
 *               'inset' | 'outset' | 'none'
 *   thick     — requested stroke thickness in pixels
 *   colour    — '#RRGGBB'
 *   side      — 'top' | 'right' | 'bottom' | 'left' — affects inset/outset
 *               shading direction
 *   dotRadius — dot-style radius in pixels (used for 'dotted' only)
 *
 * Returns { totalThick, layers[] }.
 */
import { darken as darkenRGB, lighten as lightenRGB } from './colorHelpers.js';

// Segment colors have already been converted to CSS #RRGGBBAA. Shade RGB only
// and carry alpha through; the general helper also accepts stored AARRGGBB.
function shadeCSS(colour, shade) {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(colour);
  return match ? shade(match[1]) + (match[2] ?? '') : shade(colour);
}
const darken = (colour) => shadeCSS(colour, darkenRGB);
const lighten = (colour) => shadeCSS(colour, lightenRGB);

export function resolveStroke(style, thick, colour, side, dotRadius = 2) {
  const da = 'none';
  const cap = 'butt';

  if (style === 'dashed') {
    return {
      totalThick: thick,
      layers: [{ thick, colour, dasharray: `${thick * 3} ${thick * 2}`, offset: 0, linecap: cap }],
    };
  }
  if (style === 'dotted') {
    const dotDiam = Math.max(1, dotRadius * 2);
    const gap = Math.max(1, thick);
    return {
      totalThick: dotDiam,
      layers: [{ thick: dotDiam, colour, dasharray: `0.001 ${gap + dotDiam}`, offset: 0, linecap: 'round' }],
    };
  }
  if (style === 'groove') {
    const half = Math.max(1, thick / 2);
    return {
      totalThick: thick,
      layers: [
        { thick: half, colour: darken(colour),  dasharray: da, offset: -half / 2, linecap: cap },
        { thick: half, colour: lighten(colour), dasharray: da, offset:  half / 2, linecap: cap },
      ],
    };
  }
  if (style === 'ridge') {
    const half = Math.max(1, thick / 2);
    return {
      totalThick: thick,
      layers: [
        { thick: half, colour: lighten(colour), dasharray: da, offset: -half / 2, linecap: cap },
        { thick: half, colour: darken(colour),  dasharray: da, offset:  half / 2, linecap: cap },
      ],
    };
  }
  if (style === 'inset') {
    const isDark = (side === 'top' || side === 'left');
    return {
      totalThick: thick,
      layers: [{ thick, colour: isDark ? darken(colour) : lighten(colour), dasharray: da, offset: 0, linecap: cap }],
    };
  }
  if (style === 'outset') {
    const isDark = (side === 'bottom' || side === 'right');
    return {
      totalThick: thick,
      layers: [{ thick, colour: isDark ? darken(colour) : lighten(colour), dasharray: da, offset: 0, linecap: cap }],
    };
  }
  // solid / none / default
  return {
    totalThick: thick,
    layers: [{ thick, colour, dasharray: da, offset: 0, linecap: cap }],
  };
}
