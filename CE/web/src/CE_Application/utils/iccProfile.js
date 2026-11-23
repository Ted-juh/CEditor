/**
 * iccProfile.js — a CMYK file's own ICC profile, for showing its colours as Photoshop does.
 *
 * Photoshop shows a CMYK document through the profile it carries, Relative Colorimetric with Black
 * Point Compensation (its default), and the pictures it exports are that conversion: psd-tools keeps
 * some beside its CMYK test files, and the profile so converted matches them to a third of a level,
 * where the fixed SWOP polynomial (utils/psdAdjustments.js cmykToRgb) is four or five levels off.
 *
 * What is read: an ICC version 2 profile's lookup tables, 'mft2' and 'mft1' (lut16Type, lut8Type),
 * which is what Photoshop's CMYK profiles carry (U.S. Web Coated (SWOP) v2, Japan Color 2001 Coated
 * and their kind). CMYK goes through A2B1, its table for Relative Colorimetric, to Lab; the black point
 * is found as LittleCMS finds a CMYK output profile's (Lab 0 through B2A0, the perceptual table, and
 * back through A2B1, lightness kept, colour dropped); the result is scaled so that black point lands on
 * sRGB's black and the paper white on its white, then put in sRGB through its D50 matrix. A version 4
 * profile ('mAB ' tables) or anything else returns null, and the caller keeps the polynomial.
 *
 * Interpolation as LittleCMS's: tetrahedral in three dimensions, and linear across the first of four.
 */

const D50 = [0.9642, 1, 0.8249];

function u16(view, at) { return view.getUint16(at); }
function s15f16(view, at) { return view.getInt32(at) / 65536; }

/** A 1-D table (values 0..1) read at `x` (0..1), linearly. */
function curve(table, x) {
  const n = table.length - 1;
  if (n <= 0) return x;
  const p = Math.max(0, Math.min(1, x)) * n;
  const i = Math.min(n - 1, Math.floor(p));
  const f = p - i;
  return table[i] + (table[i + 1] - table[i]) * f;
}

/** An 'mft2' or 'mft1' table: `{ inputs, outputs, evaluate(values 0..1) -> values 0..1 }`. */
function readLut(view, at) {
  const type = String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  if (type !== 'mft2' && type !== 'mft1') return null;
  const wide = type === 'mft2';
  const inputs = view.getUint8(at + 8);
  const outputs = view.getUint8(at + 9);
  const grid = view.getUint8(at + 10);
  // (The matrix at +12 applies only to XYZ input, which a CMYK table and a Lab one do not have.)
  let p = at + 48;
  let inEntries = 256;
  let outEntries = 256;
  if (wide) {
    inEntries = u16(view, p); outEntries = u16(view, p + 2);
    p += 4;
  }
  const read = (count) => {
    const out = new Float64Array(count);
    for (let i = 0; i < count; i += 1) {
      out[i] = wide ? u16(view, p) / 65535 : view.getUint8(p) / 255;
      p += wide ? 2 : 1;
    }
    return out;
  };
  const inCurves = [];
  for (let c = 0; c < inputs; c += 1) inCurves.push(read(inEntries));
  const clut = read(grid ** inputs * outputs);
  const outCurves = [];
  for (let c = 0; c < outputs; c += 1) outCurves.push(read(outEntries));
  if (!(grid >= 2) || inputs < 3 || inputs > 4 || outputs < 3) return null;

  const n1 = grid - 1;
  const strides = [];
  for (let c = 0; c < inputs; c += 1) strides.push(grid ** (inputs - 1 - c) * outputs);
  const out = new Float64Array(outputs);
  const a = new Float64Array(outputs);
  const b = new Float64Array(outputs);
  /** Tetrahedral interpolation over the last three inputs, at `base` in the table. */
  const tetra = (base, x, y, z, target) => {
    const [sx, sy, sz] = strides.slice(inputs - 3);
    const px = x * n1; const py = y * n1; const pz = z * n1;
    const ix = Math.min(n1 - 1, Math.floor(px)); const iy = Math.min(n1 - 1, Math.floor(py)); const iz = Math.min(n1 - 1, Math.floor(pz));
    const rx = px - ix; const ry = py - iy; const rz = pz - iz;
    const o = base + ix * sx + iy * sy + iz * sz;
    const X1 = sx; const Y1 = sy; const Z1 = sz;
    for (let k = 0; k < outputs; k += 1) {
      const c0 = clut[o + k];
      let c1; let c2; let c3;
      if (rx >= ry && ry >= rz) {
        c1 = clut[o + X1 + k] - c0; c2 = clut[o + X1 + Y1 + k] - clut[o + X1 + k]; c3 = clut[o + X1 + Y1 + Z1 + k] - clut[o + X1 + Y1 + k];
      } else if (rx >= rz && rz >= ry) {
        c1 = clut[o + X1 + k] - c0; c2 = clut[o + X1 + Y1 + Z1 + k] - clut[o + X1 + Z1 + k]; c3 = clut[o + X1 + Z1 + k] - clut[o + X1 + k];
      } else if (rz >= rx && rx >= ry) {
        c1 = clut[o + X1 + Z1 + k] - clut[o + Z1 + k]; c2 = clut[o + X1 + Y1 + Z1 + k] - clut[o + X1 + Z1 + k]; c3 = clut[o + Z1 + k] - c0;
      } else if (ry >= rx && rx >= rz) {
        c1 = clut[o + X1 + Y1 + k] - clut[o + Y1 + k]; c2 = clut[o + Y1 + k] - c0; c3 = clut[o + X1 + Y1 + Z1 + k] - clut[o + X1 + Y1 + k];
      } else if (ry >= rz && rz >= rx) {
        c1 = clut[o + X1 + Y1 + Z1 + k] - clut[o + Y1 + Z1 + k]; c2 = clut[o + Y1 + k] - c0; c3 = clut[o + Y1 + Z1 + k] - clut[o + Y1 + k];
      } else {
        c1 = clut[o + X1 + Y1 + Z1 + k] - clut[o + Y1 + Z1 + k]; c2 = clut[o + Y1 + Z1 + k] - clut[o + Z1 + k]; c3 = clut[o + Z1 + k] - c0;
      }
      target[k] = c0 + c1 * rx + c2 * ry + c3 * rz;
    }
  };
  const evaluate = (values) => {
    const v = values.map((x, c) => curve(inCurves[c], x));
    if (inputs === 3) tetra(0, v[0], v[1], v[2], out);
    else {
      const p0 = Math.max(0, Math.min(1, v[0])) * n1;
      const i0 = Math.min(n1 - 1, Math.floor(p0));
      const r0 = p0 - i0;
      tetra(i0 * strides[0], v[1], v[2], v[3], a);
      tetra((i0 + 1) * strides[0], v[1], v[2], v[3], b);
      for (let k = 0; k < outputs; k += 1) out[k] = a[k] + (b[k] - a[k]) * r0;
    }
    return Array.from(out, (x, c) => curve(outCurves[c], x));
  };
  return { inputs, outputs, wide, evaluate };
}

/** The profile's tags: `{ signature: offset }`. */
function tags(view) {
  const out = {};
  const count = view.getUint32(128);
  for (let i = 0; i < count && 132 + 12 * i + 12 <= view.byteLength; i += 1) {
    const at = 132 + 12 * i;
    const sig = String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
    out[sig] = view.getUint32(at + 4);
  }
  return out;
}

// Lab as a version 2 16-bit table holds it (L 0..100 over 0..0xFF00, a and b −128..127.996), and as an
// 8-bit one (L over 0..255, a and b offset by 128).
const labFrom16 = ([l, a, b]) => [(l * 65535 / 65280) * 100, (a * 65535 / 65280) * 255 - 128, (b * 65535 / 65280) * 255 - 128];
const labTo8 = ([L, a, b]) => [L / 100, (a + 128) / 255, (b + 128) / 255];

function labToXyz([L, a, b]) {
  const fy = (L + 16) / 116;
  const f = (t) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));
  return [D50[0] * f(fy + a / 500), D50[1] * f(fy), D50[2] * f(fy - b / 200)];
}

// XYZ (D50) to linear sRGB, through sRGB's colorants adapted to D50 (Bradford), as an ICC sRGB profile has them.
const XYZ_TO_SRGB = [
  [3.1338561, -1.6168667, -0.4906146],
  [-0.9787684, 1.9161415, 0.0334540],
  [0.0719453, -0.2289914, 1.4052427],
];
const encode = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

/**
 * A converter from CMYK inks (each 0..1, 1 full ink) to sRGB (0..255, unrounded) through the ICC
 * profile `bytes`, or null when it is not one this reads.
 */
export function iccCmykToRgb(bytes) {
  try {
    if (!bytes || bytes.byteLength < 132) return null;
    const view = new DataView(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength);
    const space = String.fromCharCode(view.getUint8(16), view.getUint8(17), view.getUint8(18), view.getUint8(19));
    const pcs = String.fromCharCode(view.getUint8(20), view.getUint8(21), view.getUint8(22), view.getUint8(23));
    if (space !== 'CMYK' || pcs !== 'Lab ') return null;
    const table = tags(view);
    const toLab = readLut(view, table.A2B1 ?? table.A2B0);
    if (!toLab || toLab.inputs !== 4) return null;
    const lab = (inks) => {
      const v = toLab.evaluate(inks);
      return toLab.wide ? labFrom16(v) : [v[0] * 100, v[1] * 255 - 128, v[2] * 255 - 128];
    };
    // The black point: Lab 0 to inks by the perceptual table, and back.
    let black = [0, 0, 0];
    const fromLab = table.B2A0 != null ? readLut(view, table.B2A0) : null;
    if (fromLab && fromLab.inputs === 3 && fromLab.outputs === 4) {
      const inks = fromLab.evaluate(fromLab.wide ? [0, 128 / 255 * 65280 / 65535, 128 / 255 * 65280 / 65535] : labTo8([0, 0, 0]));
      const L = Math.min(50, lab(inks)[0]);
      black = labToXyz([L, 0, 0]);
    } else {
      black = labToXyz([Math.min(50, lab([1, 1, 1, 1])[0]), 0, 0]);
    }
    const cache = new Map();
    return (c, m, y, k) => {
      const key = (Math.round(c * 255) << 24) | (Math.round(m * 255) << 16) | (Math.round(y * 255) << 8) | Math.round(k * 255);
      const known = cache.get(key);
      if (known) return known;
      const xyz = labToXyz(lab([c, m, y, k]));
      // Black Point Compensation: the black point to sRGB's black, the white kept.
      const scaled = xyz.map((v, i) => ((v - black[i]) * D50[i]) / (D50[i] - black[i]));
      const rgb = XYZ_TO_SRGB.map((row) => encode(row[0] * scaled[0] + row[1] * scaled[1] + row[2] * scaled[2]))
        .map((v) => Math.max(0, Math.min(255, v)));
      if (cache.size < 1 << 18) cache.set(key, rgb);
      return rgb;
    };
  } catch {
    return null;
  }
}
