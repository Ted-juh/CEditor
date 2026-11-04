/**
 * svgPathScale.js — scale SVG path data by (sx, sy), synchronously and without a geometry library.
 *
 * A compound path part stores its outline in 0..1 of its box (utils/partBooleans.js); drawing it
 * needs it in the box's pixels, on every render, including in the plug-in's player where Paper.js is
 * not loaded unless something needs it. Scaling is exact for every command: coordinates and relative
 * offsets scale per axis, and an arc's radii scale with them (its rotation is kept, which is exact for
 * the axis-aligned arcs a box outline uses; Paper.js writes curves, never arcs).
 */
const ARG_COUNTS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

const fmt = (value) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

export function scalePathData(data, sx, sy) {
  const text = String(data ?? '');
  const tokens = text.match(/[a-df-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out = [];
  let command = '';
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[a-z]$/i.test(token)) {
      command = token;
      index += 1;
      out.push(command);
      if (command.toLowerCase() === 'z') continue;
    } else if (!command) {
      index += 1;
      continue;
    }
    const lower = command.toLowerCase();
    const count = ARG_COUNTS[lower];
    if (!count) continue;
    const args = tokens.slice(index, index + count).map(Number);
    if (args.length < count || args.some((value) => !Number.isFinite(value))) break;
    index += count;
    let scaled;
    if (lower === 'h') scaled = [args[0] * sx];
    else if (lower === 'v') scaled = [args[0] * sy];
    else if (lower === 'a') scaled = [args[0] * Math.abs(sx), args[1] * Math.abs(sy), args[2], args[3], args[4], args[5] * sx, args[6] * sy];
    else scaled = args.map((value, i) => value * (i % 2 === 0 ? sx : sy));
    out.push(scaled.map(fmt).join(' '));
    // Implicit repeats after a moveto are linetos.
    if (lower === 'm') command = command === 'm' ? 'l' : 'L';
  }
  return out.join(' ');
}

/**
 * Path data under an affine map `[a, b, c, d, e, f]` (x' = a·x + c·y + e, y' = b·x + d·y + f), as
 * absolute commands: every point moved, an H or V written as the line it is, and an arc's ellipse
 * mapped too, its radii and its turn from the map's action on its axes (and its sweep reversed by a
 * map that mirrors). Exact for every command, relative ones included: a turned or squashed outline,
 * drawn where it is turned (models/knob plates, InteractivePartRenderer's fixed-light layers).
 */
export function transformPathData(data, [a, b, c, d, e, f]) {
  const tokens = String(data ?? '').match(/[a-df-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const map = (x, y) => [a * x + c * y + e, b * x + d * y + f];
  const pt = (x, y) => map(x, y).map(fmt).join(' ');
  const mirrors = a * d - b * c < 0;
  const out = [];
  let command = '';
  let index = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[a-z]$/i.test(token)) {
      command = token;
      index += 1;
      if (command.toLowerCase() === 'z') {
        out.push('Z');
        cx = sx;
        cy = sy;
        continue;
      }
    } else if (!command) {
      index += 1;
      continue;
    }
    const lower = command.toLowerCase();
    const relative = command !== command.toUpperCase();
    const count = ARG_COUNTS[lower];
    if (!count) continue;
    const args = tokens.slice(index, index + count).map(Number);
    if (args.length < count || args.some((value) => !Number.isFinite(value))) break;
    index += count;
    const ox = relative ? cx : 0;
    const oy = relative ? cy : 0;
    if (lower === 'h') {
      cx = args[0] + ox;
      out.push(`L${pt(cx, cy)}`);
    } else if (lower === 'v') {
      cy = args[0] + (relative ? cy : 0);
      out.push(`L${pt(cx, cy)}`);
    } else if (lower === 'a') {
      const [rx, ry, turn, large, sweep, x, y] = args;
      // The ellipse's axes, mapped: A = M·R(turn)·diag(rx, ry); its radii and turn are A·Aᵀ's.
      const t = (turn * Math.PI) / 180;
      const u = [(a * Math.cos(t) + c * Math.sin(t)) * rx, (b * Math.cos(t) + d * Math.sin(t)) * rx];
      const v = [(-a * Math.sin(t) + c * Math.cos(t)) * ry, (-b * Math.sin(t) + d * Math.cos(t)) * ry];
      const p = u[0] * u[0] + v[0] * v[0];
      const q = u[0] * u[1] + v[0] * v[1];
      const r = u[1] * u[1] + v[1] * v[1];
      const mid = (p + r) / 2;
      const spread = Math.sqrt(Math.max(0, ((p - r) / 2) ** 2 + q * q));
      const r1 = Math.sqrt(Math.max(0, mid + spread));
      const r2 = Math.sqrt(Math.max(0, mid - spread));
      const angle = (Math.atan2(2 * q, p - r) / 2) * (180 / Math.PI);
      cx = x + ox;
      cy = y + oy;
      out.push(`A${fmt(r1)} ${fmt(r2)} ${fmt(angle)} ${large ? 1 : 0} ${(sweep ? 1 : 0) ^ (mirrors ? 1 : 0)} ${pt(cx, cy)}`);
    } else {
      const points = [];
      for (let i = 0; i < args.length; i += 2) points.push([args[i] + ox, args[i + 1] + oy]);
      const [ex, ey] = points[points.length - 1];
      out.push(`${lower === 'm' ? 'M' : command.toUpperCase()}${points.map(([x, y]) => pt(x, y)).join(' ')}`);
      cx = ex;
      cy = ey;
      if (lower === 'm') {
        sx = cx;
        sy = cy;
        // Implicit repeats after a moveto are linetos.
        command = relative ? 'l' : 'L';
      }
    }
  }
  return out.join(' ');
}

/** Path data turned `degrees` clockwise (on screen) about (cx, cy). */
export function rotatePathData(data, degrees, cx = 0, cy = 0) {
  const t = (degrees * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return transformPathData(data, [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy]);
}
