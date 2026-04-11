/**
 * Build paintable border segment data for a W×H box from Border + Corners
 * sections. Pure math — returns an array of segment descriptors the SVG
 * template consumes directly. No Svelte dependencies.
 *
 * Segment shape:
 *   { kind: 'side' | 'corner', key, d, thick, colour, dasharray, linecap, ... }
 * Corner segments additionally carry `cornerShape`, `radialIsInward`,
 * `gradAxis`, `geom` — used downstream by fillDefs to position gradients.
 */

import { resolveStroke } from './strokeResolver.js';
import { normalizeCorner } from './cornerNormalization.js';
import { buildCornerPath } from './cornerPaths.js';

const MULTI_STYLES = new Set(['groove', 'ridge', 'inset', 'outset']);
const ADJACENT_SIDES = {
  tl: ['top', 'left'],
  tr: ['top', 'right'],
  br: ['bottom', 'right'],
  bl: ['bottom', 'left'],
};

function isSideOn(border, side) {
  if (!border?.enabled) return false;
  if (border.linked) return true;
  const s = border[side];
  return s && s.style !== 'none' && s.thickness > 0;
}

function isCornerOn(corners, pos) {
  return normalizeCorner(corners, pos).borderEnabled;
}

function getSideStrokes(border, side) {
  const s = (border?.linked) ? border : (border?.[side] ?? border);
  const thick = s?.thickness || 2;
  const dotRadius = s?.dotRadius || 2;
  const colour = `#${(s?.colour || 'FFFFFFFF').slice(-6)}`;
  const style = s?.style || 'solid';
  return resolveStroke(style, thick, colour, side, dotRadius);
}

function getCornerStrokes(border, corners, pos) {
  const c = normalizeCorner(corners, pos);
  const thick = c.thickness || 2;
  const dotRadius = c.dotRadius || 2;
  const colour = `#${(c.colour || 'FFFFFFFF').slice(-6)}`;
  const cornerDash = c.borderStyle || 'solid';
  const sideHint = (pos === 'tl' || pos === 'tr') ? 'top' : 'bottom';

  // For groove/ridge/inset/outset, inherit the multi-layer style from an
  // adjacent side if the corner itself doesn't specify one.
  let layerStyle = cornerDash;
  if (border && !border.linked) {
    const [a, b] = ADJACENT_SIDES[pos];
    const st1 = border[a]?.style;
    const st2 = border[b]?.style;
    if (st1 && st1 !== 'none' && MULTI_STYLES.has(st1)) layerStyle = st1;
    else if (st2 && st2 !== 'none' && MULTI_STYLES.has(st2)) layerStyle = st2;
  } else if (border?.linked && MULTI_STYLES.has(border.style)) {
    layerStyle = border.style;
  }

  const resolved = resolveStroke(layerStyle, thick, colour, sideHint, dotRadius);
  const { layers } = resolved;

  // Apply corner's own dash pattern (overrides any dashes from the multi-style).
  for (const l of layers) {
    if (cornerDash === 'dashed') {
      l.dasharray = `${l.thick * 3} ${l.thick * 2}`;
      l.linecap = 'butt';
    } else if (cornerDash === 'dotted') {
      const dd = Math.max(1, dotRadius * 2);
      l.thick = dd;
      l.dasharray = `0.001 ${Math.max(1, thick) + dd}`;
      l.linecap = 'round';
    } else {
      l.dasharray = 'none';
      l.linecap = 'butt';
    }
  }

  return { totalThick: resolved.totalThick, layers };
}

// Distance from the corner anchor where the side path must START.
// - rounded outward / chamfer / notch / straight: side inset by R
// - rounded inward: arc stroke extends perpendicular to its vertical tangent,
//   covering a band of width tt. Side must start one half-thickness further
//   out to reach the far edge of that band, i.e. r + tt/2.
// - corner off: max(R, 2*thickness) — prevents sides from running into the
//   space a missing corner would have filled.
function sideInset(on, cn, r, tt) {
  if (!on) return Math.max(r, tt * 2);
  const shape = cn?.style || 'rounded';
  const dir = cn?.direction || 'outward';
  if (shape === 'rounded' && dir === 'inward') return r + tt / 2;
  return r;
}

// Corner anchor + arc circle center + arc endpoints, per position.
// arcStart/arcEnd correspond to the horizontal and vertical edges of the arc.
function buildCornerGeom(W, H, tlR, trR, brR, blR) {
  return {
    tl: { px: 0, py: 0,  cx: tlR,    cy: tlR,    arcStart: { x: tlR, y: 0 },    arcEnd: { x: 0, y: tlR } },
    tr: { px: W, py: 0,  cx: W-trR,  cy: trR,    arcStart: { x: W-trR, y: 0 },  arcEnd: { x: W, y: trR } },
    br: { px: W, py: H,  cx: W-brR,  cy: H-brR,  arcStart: { x: W-brR, y: H },  arcEnd: { x: W, y: H-brR } },
    bl: { px: 0, py: H,  cx: blR,    cy: H-blR,  arcStart: { x: blR, y: H },    arcEnd: { x: 0, y: H-blR } },
  };
}

// Per-corner gradient geometry — computed once per corner regardless of how
// many stroke layers are drawn. Returns { cornerShape, arcCx, arcCy,
// isInward, gradAxis }. Unused fields stay undefined.
function computeCornerGradientGeom(pos, cnStyle, cnDir, R, t, W, H) {
  if (cnStyle === 'rounded') {
    if (cnDir === 'inward') {
      // Inward: radial centered at the inset point near the anchor.
      let arcCx, arcCy;
      switch (pos) {
        case 'tl': arcCx = t;     arcCy = t;     break;
        case 'tr': arcCx = W - t; arcCy = t;     break;
        case 'br': arcCx = W - t; arcCy = H - t; break;
        case 'bl': arcCx = t;     arcCy = H - t; break;
      }
      return { cornerShape: 'rounded', isInward: true, arcCx, arcCy, gradAxis: null };
    }
    // Outward: radial centered at the arc circle center.
    let arcCx, arcCy;
    switch (pos) {
      case 'tl': arcCx = R + t;     arcCy = R + t;     break;
      case 'tr': arcCx = W - R - t; arcCy = R + t;     break;
      case 'br': arcCx = W - R - t; arcCy = H - R - t; break;
      case 'bl': arcCx = R + t;     arcCy = H - R - t; break;
    }
    return { cornerShape: 'rounded', isInward: false, arcCx, arcCy, gradAxis: null };
  }

  if (cnStyle === 'chamfer') {
    // Linear gradient perpendicular to the 45° chamfer line, through its midpoint.
    const mid = t + R / 2;
    let gradAxis;
    switch (pos) {
      case 'tl': gradAxis = { x1: mid + t / 2,     y1: mid + t / 2, x2: mid - t / 2, y2: mid - t / 2 }; break;
      case 'tr': gradAxis = { x1: W - mid - t / 2, y1: mid + t / 2, x2: W - mid + t / 2, y2: mid - t / 2 }; break;
      case 'br': gradAxis = { x1: W - mid - t / 2, y1: H - mid - t / 2, x2: W - mid + t / 2, y2: H - mid + t / 2 }; break;
      case 'bl': gradAxis = { x1: mid + t / 2,     y1: H - mid - t / 2, x2: mid - t / 2, y2: H - mid + t / 2 }; break;
    }
    return { cornerShape: 'linear', isInward: false, arcCx: undefined, arcCy: undefined, gradAxis };
  }

  if (cnStyle === 'straight') {
    // Gradient from the L-shape's inner corner (toward body) to its outer corner (anchor).
    let gradAxis;
    switch (pos) {
      case 'tl': gradAxis = { x1: R + t,     y1: R + t,     x2: 0, y2: 0 }; break;
      case 'tr': gradAxis = { x1: W - R - t, y1: R + t,     x2: W, y2: 0 }; break;
      case 'br': gradAxis = { x1: W - R - t, y1: H - R - t, x2: W, y2: H }; break;
      case 'bl': gradAxis = { x1: R + t,     y1: H - R - t, x2: 0, y2: H }; break;
    }
    return { cornerShape: 'linear', isInward: false, arcCx: undefined, arcCy: undefined, gradAxis };
  }

  if (cnStyle === 'notch') {
    // Gradient from L-elbow to the cut-in region.
    let gradAxis;
    switch (pos) {
      case 'tl': gradAxis = { x1: 0, y1: 0, x2: R + t,     y2: R + t };     break;
      case 'tr': gradAxis = { x1: W, y1: 0, x2: W - R - t, y2: R + t };     break;
      case 'br': gradAxis = { x1: W, y1: H, x2: W - R - t, y2: H - R - t }; break;
      case 'bl': gradAxis = { x1: 0, y1: H, x2: R + t,     y2: H - R - t }; break;
    }
    return { cornerShape: 'linear', isInward: false, arcCx: undefined, arcCy: undefined, gradAxis };
  }

  return { cornerShape: 'rounded', isInward: false, arcCx: undefined, arcCy: undefined, gradAxis: null };
}

/**
 * Main entry point. Produces the complete segment list for one rectangle.
 * Call once for the outer box, and again (with W/H reduced by 2*gap) for
 * the inner box when rendering double borders.
 */
export function buildBorderSegments(W, H, border, corners) {
  const result = [];

  const tl = normalizeCorner(corners, 'tl');
  const tr = normalizeCorner(corners, 'tr');
  const br = normalizeCorner(corners, 'br');
  const bl = normalizeCorner(corners, 'bl');
  const tlR = tl.radius, trR = tr.radius, brR = br.radius, blR = bl.radius;
  const tlOn = isCornerOn(corners, 'tl');
  const trOn = isCornerOn(corners, 'tr');
  const brOn = isCornerOn(corners, 'br');
  const blOn = isCornerOn(corners, 'bl');

  // 1px overlap where the side meets an enabled corner — eliminates
  // anti-aliasing gaps at the junction point.
  const tlOv = tlOn ? 1 : 0;
  const trOv = trOn ? 1 : 0;
  const brOv = brOn ? 1 : 0;
  const blOv = blOn ? 1 : 0;

  // --- Sides ---
  if (isSideOn(border, 'top')) {
    const { totalThick: tt, layers: ll } = getSideStrokes(border, 'top');
    const t = tt / 2;
    const tlG = sideInset(tlOn, tl, tlR, tt);
    const trG = sideInset(trOn, tr, trR, tt);
    for (const l of ll) {
      const y = t + l.offset;
      result.push({ kind: 'side', key: 'top', d: `M ${tlG + t - tlOv} ${y} L ${W - trG - t + trOv} ${y}`, thick: l.thick, colour: l.colour, dasharray: l.dasharray, linecap: l.linecap });
    }
  }
  if (isSideOn(border, 'right')) {
    const { totalThick: tt, layers: ll } = getSideStrokes(border, 'right');
    const t = tt / 2;
    const trG = sideInset(trOn, tr, trR, tt);
    const brG = sideInset(brOn, br, brR, tt);
    for (const l of ll) {
      const x = W - t - l.offset;
      result.push({ kind: 'side', key: 'right', d: `M ${x} ${trG + t - trOv} L ${x} ${H - brG - t + brOv}`, thick: l.thick, colour: l.colour, dasharray: l.dasharray, linecap: l.linecap });
    }
  }
  if (isSideOn(border, 'bottom')) {
    const { totalThick: tt, layers: ll } = getSideStrokes(border, 'bottom');
    const t = tt / 2;
    const brG = sideInset(brOn, br, brR, tt);
    const blG = sideInset(blOn, bl, blR, tt);
    for (const l of ll) {
      const y = H - t - l.offset;
      result.push({ kind: 'side', key: 'bottom', d: `M ${W - brG - t + brOv} ${y} L ${blG + t - blOv} ${y}`, thick: l.thick, colour: l.colour, dasharray: l.dasharray, linecap: l.linecap });
    }
  }
  if (isSideOn(border, 'left')) {
    const { totalThick: tt, layers: ll } = getSideStrokes(border, 'left');
    const t = tt / 2;
    const blG = sideInset(blOn, bl, blR, tt);
    const tlG = sideInset(tlOn, tl, tlR, tt);
    for (const l of ll) {
      const x = t + l.offset;
      result.push({ kind: 'side', key: 'left', d: `M ${x} ${H - blG - t + blOv} L ${x} ${tlG + t - tlOv}`, thick: l.thick, colour: l.colour, dasharray: l.dasharray, linecap: l.linecap });
    }
  }

  // --- Corners ---
  const cornerPositions = [
    { pos: 'tl', key: 'topLeft',     on: tlOn, R: tlR, cn: { ...tl, radius: tlR } },
    { pos: 'tr', key: 'topRight',    on: trOn, R: trR, cn: { ...tr, radius: trR } },
    { pos: 'br', key: 'bottomRight', on: brOn, R: brR, cn: { ...br, radius: brR } },
    { pos: 'bl', key: 'bottomLeft',  on: blOn, R: blR, cn: { ...bl, radius: blR } },
  ];
  const cornerGeom = buildCornerGeom(W, H, tlR, trR, brR, blR);

  for (const { pos, key, on, R, cn } of cornerPositions) {
    if (!on) continue;
    const { totalThick: tt, layers: ll } = getCornerStrokes(border, corners, pos);
    const t = tt / 2;
    const cnStyle = cn.style || 'rounded';
    const cnDir = cn.direction || 'outward';

    const grad = computeCornerGradientGeom(pos, cnStyle, cnDir, R, t, W, H);

    // One path per stroke layer.
    for (const l of ll) {
      const inset = t + l.offset;
      const d = buildCornerPath(cn, pos, R, inset, t, W, H);
      result.push({
        kind: 'corner', key, pos, d,
        thick: l.thick, colour: l.colour, dasharray: l.dasharray, linecap: l.linecap,
        cornerShape: grad.cornerShape,
        radialIsInward: grad.isInward,
        gradAxis: grad.gradAxis,
        geom: { ...cornerGeom[pos], R, thickness: tt, arcCx: grad.arcCx, arcCy: grad.arcCy },
      });
    }
  }

  return result;
}

/**
 * Gap size for double-border rendering. Returns 0 when no side uses the
 * 'double' style (i.e. no inner box should be drawn).
 */
export function getDoubleGap(border) {
  if (!border?.enabled) return 0;
  if (border.linked) {
    return border.style === 'double' ? (border.doubleGap ?? 2) : 0;
  }
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const s = border[side];
    if (s?.style === 'double') return s.doubleGap ?? 2;
  }
  return 0;
}
