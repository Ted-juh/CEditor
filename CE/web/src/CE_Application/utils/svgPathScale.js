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
