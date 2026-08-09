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

/**
 * AARRGGBB -> a CSS colour that keeps its alpha.
 *
 * Border colours are stored alpha-first, and both stroke paths used to take `.slice(-6)` — the RGB
 * and nothing else. Every translucent border therefore painted fully opaque: the button types set
 * `66FFFFFF`, a 40% white hairline, and drew a solid white one. It reads as if every control on a
 * panel has been outlined in marker pen, and it is wrong everywhere borders are drawn, not just
 * here.
 */
function strokeColour(raw) {
  const hex = String(raw ?? 'FFFFFFFF').replace('#', '');
  if (hex.length === 8) return `#${hex.slice(2)}${hex.slice(0, 2)}`;   // AARRGGBB -> #RRGGBBAA
  if (hex.length === 6) return `#${hex}`;
  return '#FFFFFF';
}

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
  const colour = strokeColour(s?.colour);
  const style = s?.style || 'solid';
  return resolveStroke(style, thick, colour, side, dotRadius);
}

function getCornerStrokes(border, corners, pos) {
  const c = normalizeCorner(corners, pos);

  // `linked: true` means "all sides the same", and a corner is part of the border — so it takes
  // the border's colour and thickness, not the corner defaults.
  //
  // It used to read only the corner, whose defaults are FFFFFFFF at thickness 2. That is invisible
  // while the border is also white, which is the default, and shows up the moment anyone sets a
  // coloured rounded border: four dark sides and four white arcs at twice the width. On a small
  // control the two top arcs read as a stray chevron floating above it.
  const linked = border ? border.linked !== false : false;
  const thick = (linked ? border.thickness : c.thickness) || c.thickness || 2;
  const dotRadius = (linked ? border.dotRadius : c.dotRadius) || c.dotRadius || 2;
  const rawColour = (linked ? border.colour : c.colour) || c.colour || 'FFFFFFFF';
  const colour = strokeColour(rawColour);
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
// - rounded outward: the arc's centreline ends at R along the box edge (its
//   outer edge is the R-radius round the fill also paints), and the tangent
//   there is horizontal, so the stroke flows continuously from arc into side.
//   Solving `sideStart = tlG + t - tlOv = R` gives tlG = R - tt/2 + 1; using
//   R - tt/2 keeps the 1-px overlap convention the other shapes use. This used
//   to return R, which paired with the old arc that ended at R + tt/2 — both
//   were half a thickness out, so the join looked right while the corner was
//   rounder than the box it belonged to.
// - chamfer / notch / straight: side inset by R.
// - rounded inward: the arc has a *vertical* tangent at its top endpoint,
//   so the arc's butt cap is a horizontal segment at y = tt/2 spanning
//   x ∈ [R, R + tt]. The arc band itself only exists at y ≥ tt/2 — there is
//   nothing covering y ∈ [0, tt/2] for x ∈ [R, R + tt]. The side stroke must
//   reach all the way down to x = R to fill that L-corner. Solving
//   `sideStart = tlG + t - tlOv = r` with t = tt/2 and tlOv = 1 gives
//   tlG = r - tt/2 + 1; using r - tt/2 instead gives a 1-pixel overlap into
//   the bite area, matching the overlap convention used by the other corner
//   shapes.
// - corner off: max(R, 2*thickness) — prevents sides from running into the
//   space a missing corner would have filled.
//
// Reserved for a future "inward inset" mode (the original behavior): the
// formula `r + tt / 2` shifts the side's start to the OUTER edge of the arc
// band, leaving the arc's curved cap visible as a small angular notch
// between the side and the curve. Useful as a stylistic option later — wire
// it up via a corner `mode` field when the UI exposes it.
function sideInset(on, _cn, r, tt) {
  if (!on) return Math.max(r, tt * 2);
  // Chamfer diagonal runs edge-to-edge (see cornerPaths.js). For the side
  // centerline to intersect that diagonal cleanly on the inside edge, the
  // side start must be shifted inward by half thickness.
  //
  // sideStart = sideInset + tt/2 - overlap  -> should land at x=r (or y=r)
  // => sideInset = r - tt/2 + overlap.
  const cornerStyle = _cn?.style || 'rounded';
  if (cornerStyle === 'chamfer') {
    return Math.max(0, r - tt / 2 + 1);
  }
  // Notch corners should anchor like straight corners; using the chamfer
  // inset here pulls the side too far into the corner and breaks the join.
  if (cornerStyle === 'notch') {
    return r;
  }
  // Rounded OUTWARD only. An inward corner's arc still meets the side at
  // R + tt/2 (it is anchored at the box corner, not inset from it), so pulling
  // its sides back would open a gap the width of the border between the side's
  // end and the arc's leg.
  if (cornerStyle === 'rounded' && (_cn?.direction || 'outward') !== 'inward') {
    return Math.max(0, r - tt / 2);
  }
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

function reverseAxis(axis) {
  return axis ? { x1: axis.x2, y1: axis.y2, x2: axis.x1, y2: axis.y1 } : null;
}

// Per-corner gradient geometry — computed once per corner regardless of how
// many stroke layers are drawn.
// Returns:
//   {
//     cornerShape, isInward, arcCx, arcCy,
//     radialAxis, tangentialAxis
//   }
// For rounded corners, radial uses arcCx/arcCy and tangentialAxis is used for
// tangential mode. For non-rounded corners, both modes use linear axes.
function computeCornerGradientGeom(pos, cnStyle, cnDir, R, t, W, H) {
  const e = R + t;

  if (cnStyle === 'rounded') {
    if (cnDir === 'inward') {
      // Inward: arc anchored at the box corner — centred at the inset point,
      // running between the (R + t) marks on the two edges.
      let tangentialAxis;
      switch (pos) {
        case 'tl': tangentialAxis = { x1: t,     y1: e,     x2: e,     y2: t };     break;
        case 'tr': tangentialAxis = { x1: W - e, y1: t,     x2: W - t, y2: e };     break;
        case 'br': tangentialAxis = { x1: W - t, y1: H - e, x2: W - e, y2: H - t }; break;
        case 'bl': tangentialAxis = { x1: e,     y1: H - t, x2: t,     y2: H - e }; break;
      }
      let arcCx, arcCy;
      switch (pos) {
        case 'tl': arcCx = t;     arcCy = t;     break;
        case 'tr': arcCx = W - t; arcCy = t;     break;
        case 'br': arcCx = W - t; arcCy = H - t; break;
        case 'bl': arcCx = t;     arcCy = H - t; break;
      }
      return {
        cornerShape: 'rounded',
        isInward: true,
        arcCx, arcCy, arcR: R,
        radialAxis: null,
        tangentialAxis,
      };
    }

    // Outward: the arc's centreline circle is radius R - t about (R, R), so its
    // endpoints sit at R along each edge and its outer edge lands on R — the
    // radius the fill underneath is rounded to. Both the tangential axis (which
    // runs endpoint to endpoint) and the radial centre follow from that; they
    // used to be written in terms of R + t, matching the old oversized arc.
    let tangentialAxis;
    switch (pos) {
      case 'tl': tangentialAxis = { x1: t,     y1: R,     x2: R,     y2: t };     break;
      case 'tr': tangentialAxis = { x1: W - R, y1: t,     x2: W - t, y2: R };     break;
      case 'br': tangentialAxis = { x1: W - t, y1: H - R, x2: W - R, y2: H - t }; break;
      case 'bl': tangentialAxis = { x1: R,     y1: H - t, x2: t,     y2: H - R }; break;
    }
    let arcCx, arcCy;
    switch (pos) {
      case 'tl': arcCx = R;     arcCy = R;     break;
      case 'tr': arcCx = W - R; arcCy = R;     break;
      case 'br': arcCx = W - R; arcCy = H - R; break;
      case 'bl': arcCx = R;     arcCy = H - R; break;
    }
    return {
      cornerShape: 'rounded',
      isInward: false,
      arcCx, arcCy, arcR: Math.max(0, R - t),
      radialAxis: null,
      tangentialAxis,
    };
  }

  if (cnStyle === 'chamfer') {
    // Tangential: along the chamfer edge.
    let tangentialAxis;
    switch (pos) {
      case 'tl': tangentialAxis = { x1: 0,     y1: e,     x2: e,     y2: 0 };     break;
      case 'tr': tangentialAxis = { x1: W - e, y1: 0,     x2: W,     y2: e };     break;
      case 'br': tangentialAxis = { x1: W,     y1: H - e, x2: W - e, y2: H };     break;
      case 'bl': tangentialAxis = { x1: e,     y1: H,     x2: 0,     y2: H - e }; break;
    }

    // Radial mode for linear corners: axis across thickness.
    const mid = e / 2;
    let radialAxis;
    switch (pos) {
      case 'tl': radialAxis = { x1: mid + t / 2,     y1: mid + t / 2,     x2: mid - t / 2,     y2: mid - t / 2 };     break;
      case 'tr': radialAxis = { x1: W - mid - t / 2, y1: mid + t / 2,     x2: W - mid + t / 2, y2: mid - t / 2 };     break;
      case 'br': radialAxis = { x1: W - mid - t / 2, y1: H - mid - t / 2, x2: W - mid + t / 2, y2: H - mid + t / 2 }; break;
      case 'bl': radialAxis = { x1: mid + t / 2,     y1: H - mid - t / 2, x2: mid - t / 2,     y2: H - mid + t / 2 }; break;
    }

    if (cnDir === 'inward') radialAxis = reverseAxis(radialAxis);

    return {
      cornerShape: 'linear',
      isInward: cnDir === 'inward',
      arcCx: undefined,
      arcCy: undefined,
      radialAxis,
      tangentialAxis,
    };
  }

  if (cnStyle === 'straight') {
    // Tangential: along corner endpoints (edge-to-edge flow).
    let tangentialAxis;
    switch (pos) {
      case 'tl': tangentialAxis = { x1: t,     y1: e,     x2: e,     y2: t };     break;
      case 'tr': tangentialAxis = { x1: W - e, y1: t,     x2: W - t, y2: e };     break;
      case 'br': tangentialAxis = { x1: W - t, y1: H - e, x2: W - e, y2: H - t }; break;
      case 'bl': tangentialAxis = { x1: e,     y1: H - t, x2: t,     y2: H - e }; break;
    }

    // Radial: inner corner toward outer anchor (continuous with side thickness gradients).
    let radialAxis;
    switch (pos) {
      case 'tl': radialAxis = { x1: e,     y1: e,     x2: 0, y2: 0 }; break;
      case 'tr': radialAxis = { x1: W - e, y1: e,     x2: W, y2: 0 }; break;
      case 'br': radialAxis = { x1: W - e, y1: H - e, x2: W, y2: H }; break;
      case 'bl': radialAxis = { x1: e,     y1: H - e, x2: 0, y2: H }; break;
    }

    if (cnDir === 'inward') radialAxis = reverseAxis(radialAxis);

    return {
      cornerShape: 'linear',
      isInward: cnDir === 'inward',
      arcCx: undefined,
      arcCy: undefined,
      radialAxis,
      tangentialAxis,
    };
  }

  if (cnStyle === 'notch') {
    // Tangential: along notch endpoints (edge-to-edge flow).
    let tangentialAxis;
    switch (pos) {
      case 'tl': tangentialAxis = { x1: 0,     y1: e,     x2: e,     y2: 0 };     break;
      case 'tr': tangentialAxis = { x1: W - e, y1: 0,     x2: W,     y2: e };     break;
      case 'br': tangentialAxis = { x1: W,     y1: H - e, x2: W - e, y2: H };     break;
      case 'bl': tangentialAxis = { x1: e,     y1: H,     x2: 0,     y2: H - e }; break;
    }

    // Radial: notch elbow toward outer anchor.
    let radialAxis;
    switch (pos) {
      case 'tl': radialAxis = { x1: e,     y1: e,     x2: 0, y2: 0 }; break;
      case 'tr': radialAxis = { x1: W - e, y1: e,     x2: W, y2: 0 }; break;
      case 'br': radialAxis = { x1: W - e, y1: H - e, x2: W, y2: H }; break;
      case 'bl': radialAxis = { x1: e,     y1: H - e, x2: 0, y2: H }; break;
    }

    if (cnDir === 'inward') radialAxis = reverseAxis(radialAxis);

    return {
      cornerShape: 'linear',
      isInward: cnDir === 'inward',
      arcCx: undefined,
      arcCy: undefined,
      radialAxis,
      tangentialAxis,
    };
  }

  return {
    cornerShape: 'rounded',
    isInward: false,
    arcCx: undefined,
    arcCy: undefined,
    radialAxis: null,
    tangentialAxis: null,
  };
}

function cornerLineJoin(style) {
  return style === 'rounded' ? 'round' : 'miter';
}

function acrossAxisForSide(side, x, y, t) {
  switch (side) {
    case 'top':    return { x1: x,     y1: y + t, x2: x,     y2: y - t };
    case 'right':  return { x1: x - t, y1: y,     x2: x + t, y2: y };
    case 'bottom': return { x1: x,     y1: y - t, x2: x,     y2: y + t };
    case 'left':   return { x1: x + t, y1: y,     x2: x - t, y2: y };
  }
  return null;
}

// For straight/notch corners, split into leg pieces so each leg can carry a
// local across-thickness gradient (horizontal + vertical) instead of forcing
// one gradient axis across an L-shape path.
function buildLinearCornerPieces(style, pos, i, e, t, W, H) {
  const h = (x1, y, x2, sideKey) => ({
    d: `M ${x1} ${y} L ${x2} ${y}`,
    tangentialAxis: { x1, y1: y, x2, y2: y },
    radialAxis: acrossAxisForSide(sideKey, (x1 + x2) / 2, y, t),
    sideKey,
  });
  const v = (x, y1, y2, sideKey) => ({
    d: `M ${x} ${y1} L ${x} ${y2}`,
    tangentialAxis: { x1: x, y1, x2: x, y2 },
    radialAxis: acrossAxisForSide(sideKey, x, (y1 + y2) / 2, t),
    sideKey,
  });

  if (style === 'straight') {
    switch (pos) {
      case 'tl': return [v(i, e, i, 'left'), h(i, i, e, 'top')];
      case 'tr': return [h(W - e, i, W - i, 'top'), v(W - i, i, e, 'right')];
      case 'br': return [v(W - i, H - e, H - i, 'right'), h(W - i, H - i, W - e, 'bottom')];
      case 'bl': return [h(e, H - i, i, 'bottom'), v(i, H - i, H - e, 'left')];
    }
  }

  if (style === 'notch') {
    switch (pos) {
      case 'tl': return [h(0, e, e, 'top'), v(e, e, 0, 'left')];
      case 'tr': return [v(W - e, 0, e, 'right'), h(W - e, e, W, 'top')];
      case 'br': return [h(W, H - e, W - e, 'bottom'), v(W - e, H - e, H, 'right')];
      case 'bl': return [v(e, H, H - e, 'left'), h(e, H - e, 0, 'bottom')];
    }
  }

  return null;
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
  // Clamp corner radii to half the smaller side, matching CSS border-radius
  // behaviour. Round shapes (circle/ring/capsule) store radius: 999 to mean
  // "fully round"; without this clamp the SVG corner arcs are generated at that
  // literal radius and bleed far beyond the part as huge curved strokes.
  const maxR = Math.max(0, Math.min(W, H) / 2);
  const tlR = Math.min(tl.radius, maxR),
        trR = Math.min(tr.radius, maxR),
        brR = Math.min(br.radius, maxR),
        blR = Math.min(bl.radius, maxR);
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
      const x1 = tlG + t - tlOv;
      const x2 = W - trG - t + trOv;
      result.push({
        kind: 'side',
        key: 'top',
        d: `M ${x1} ${y} L ${x2} ${y}`,
        thick: l.thick,
        colour: l.colour,
        dasharray: l.dasharray,
        linecap: l.linecap,
        flowAxis: { x1, y1: y, x2, y2: y },
      });
    }
  }
  if (isSideOn(border, 'right')) {
    const { totalThick: tt, layers: ll } = getSideStrokes(border, 'right');
    const t = tt / 2;
    const trG = sideInset(trOn, tr, trR, tt);
    const brG = sideInset(brOn, br, brR, tt);
    for (const l of ll) {
      const x = W - t - l.offset;
      const y1 = trG + t - trOv;
      const y2 = H - brG - t + brOv;
      result.push({
        kind: 'side',
        key: 'right',
        d: `M ${x} ${y1} L ${x} ${y2}`,
        thick: l.thick,
        colour: l.colour,
        dasharray: l.dasharray,
        linecap: l.linecap,
        flowAxis: { x1: x, y1, x2: x, y2 },
      });
    }
  }
  if (isSideOn(border, 'bottom')) {
    const { totalThick: tt, layers: ll } = getSideStrokes(border, 'bottom');
    const t = tt / 2;
    const brG = sideInset(brOn, br, brR, tt);
    const blG = sideInset(blOn, bl, blR, tt);
    for (const l of ll) {
      const y = H - t - l.offset;
      const x1 = W - brG - t + brOv;
      const x2 = blG + t - blOv;
      result.push({
        kind: 'side',
        key: 'bottom',
        d: `M ${x1} ${y} L ${x2} ${y}`,
        thick: l.thick,
        colour: l.colour,
        dasharray: l.dasharray,
        linecap: l.linecap,
        flowAxis: { x1, y1: y, x2, y2: y },
      });
    }
  }
  if (isSideOn(border, 'left')) {
    const { totalThick: tt, layers: ll } = getSideStrokes(border, 'left');
    const t = tt / 2;
    const blG = sideInset(blOn, bl, blR, tt);
    const tlG = sideInset(tlOn, tl, tlR, tt);
    for (const l of ll) {
      const x = t + l.offset;
      const y1 = H - blG - t + blOv;
      const y2 = tlG + t - tlOv;
      result.push({
        kind: 'side',
        key: 'left',
        d: `M ${x} ${y1} L ${x} ${y2}`,
        thick: l.thick,
        colour: l.colour,
        dasharray: l.dasharray,
        linecap: l.linecap,
        flowAxis: { x1: x, y1, x2: x, y2 },
      });
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
      const e = R + t;
      const pieces = buildLinearCornerPieces(cnStyle, pos, inset, e, t, W, H);
      if (pieces?.length) {
        pieces.forEach((piece, partIdx) => {
          const radialAxis = cnDir === 'inward' ? reverseAxis(piece.radialAxis) : piece.radialAxis;
          result.push({
            kind: 'corner', key, pos, d: piece.d,
            thick: l.thick, colour: l.colour, dasharray: l.dasharray, linecap: l.linecap,
            linejoin: cornerLineJoin(cnStyle),
            cornerStyle: cnStyle,
            cornerShape: grad.cornerShape,
            radialIsInward: grad.isInward,
            radialAxis,
            tangentialAxis: piece.tangentialAxis,
            cornerPart: partIdx,
            cornerPartSide: piece.sideKey,
            geom: { ...cornerGeom[pos], R, thickness: tt, arcCx: grad.arcCx, arcCy: grad.arcCy, arcR: grad.arcR },
          });
        });
      } else {
        result.push({
          kind: 'corner', key, pos, d,
          thick: l.thick, colour: l.colour, dasharray: l.dasharray, linecap: l.linecap,
          linejoin: cornerLineJoin(cnStyle),
          cornerStyle: cnStyle,
          cornerShape: grad.cornerShape,
          radialIsInward: grad.isInward,
          radialAxis: grad.radialAxis,
          tangentialAxis: grad.tangentialAxis,
          geom: { ...cornerGeom[pos], R, thickness: tt, arcCx: grad.arcCx, arcCy: grad.arcCy, arcR: grad.arcR },
        });
      }
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
