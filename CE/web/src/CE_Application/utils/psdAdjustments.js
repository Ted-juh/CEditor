// psdAdjustments.js — Photoshop's adjustment layers, as what they do to a colour.
//
// An adjustment layer has no pixels: it changes the colours of everything under it. A component
// keeps its layers apart, so the Photoshop component import (utils/psdComponentImport.js) applies an
// adjustment to the layers it covers as it reads them: their pictures, and the colours of the vector
// and text layers. The look is Photoshop's; the adjustment itself does not survive as a layer.
//
// Each adjustment becomes a function from one 8-bit [r, g, b] to another. These follow Photoshop's
// published behaviour as closely as an import needs: Levels, Curves, Exposure, Invert, Posterize,
// Threshold, Channel Mixer and Gradient Map are exact; Brightness/Contrast, Hue/Saturation (its colour
// ranges and Colorize too), Vibrance, Color Balance, Black & White and Photo Filter follow the documented
// formulas and come out close. Selective Color follows the per-range weighting worked out from
// Photoshop's results (it publishes no formula) and is close too. Color Lookup applies the table the
// layer carries (Photoshop keeps the whole .cube, .3dl or .look file in it), interpolated
// trilinearly; a lookup through an ICC profile (Abstract or Device Link) is not done, and says so.

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const unit = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * CMYK inks (each 0..1) as sRGB 0..255, as a press's colours look: a polynomial fitted to Adobe's
 * U.S. Web Coated (SWOP) v2 profile, Photoshop's default CMYK, from pdf.js (Mozilla, Apache 2.0), which
 * draws a PDF's DeviceCMYK with it. Not the file's own profile, which is not read: close, not exact.
 */
export function cmykToRgb(c, m, y, k) {
  return [
    255 + c * (-4.387332384609988 * c + 54.48615194189176 * m + 18.82290502165302 * y + 212.25662451639585 * k - 285.2331026137004) + m * (1.7149763477362134 * m - 5.6096736904047315 * y - 17.873870861415444 * k - 5.497006427196366) + y * (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) + k * (-21.86122147463605 * k - 189.48180835922747),
    255 + c * (8.841041422036149 * c + 60.118027045597366 * m + 6.871425592049007 * y + 31.159100130055922 * k - 79.2970844816548) + m * (-15.310361306967817 * m + 17.575251261109482 * y + 131.35250912493976 * k - 190.9453302588951) + y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) + k * (-20.737325471181034 * k - 187.80453709719578),
    255 + c * (0.8842522430003296 * c + 8.078677503112928 * m + 30.89978309703729 * y - 0.23883238689178934 * k - 14.183576799673286) + m * (10.49593273432072 * m + 63.02378494754052 * y + 50.606957656360734 * k - 112.23884253719248) + y * (0.03296041114873217 * y + 115.60384449646641 * k - 193.58209356861505) + k * (-22.33816807309886 * k - 180.12613974708367),
  ].map(clamp);
}

// A CMYK file's own profile, while its colours are worked (utils/iccProfile.js), else the polynomial.
let cmykProfile = null;
/** Use `convert` ((c, m, y, k) inks 0..1 → sRGB) for CMYK colours until set back; returns the previous. */
export function useCmykProfile(convert) {
  const previous = cmykProfile;
  cmykProfile = convert ?? null;
  return previous;
}

// While a CMYK file is flattened on its inks (utils/psdComposite.js compositeInks), colours are its
// stored inks (255 no ink): cyan, magenta and yellow for 'cmy', black for 'k'.
let inkPlane = null;
/** Colours as the inks of `plane` ('cmy', 'k'), or as RGB again (null). */
export function inkPlaneColours(plane) {
  inkPlane = plane;
}

/**
 * Where a gradient's stops run to: ag-psd gives them 0..1 (the file's 0..4096 divided out); 4096 for
 * stops given as the file writes them; and a newer Photoshop's, written in another unit (0 to 2.5),
 * by their largest.
 */
export function stopScale(...lists) {
  const largest = Math.max(0, ...lists.flat().map((stop) => Number(stop?.location) || 0));
  return largest > 64 ? 4096 : largest > 1 ? largest : 1;
}

const toLinear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);
// Oklab, for Photoshop's Perceptual interpolation.
const toOklab = ([r, g, b]) => {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const fromOklab = ([L, A, B]) => {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(toSrgb);
};

/**
 * A gradient's colour and opacity at `u` (0..1), as Photoshop draws it, measured on its own pictures
 * of psd-tools' files: between two stops, the later stop's midpoint is where the two meet half way;
 * Classic interpolation is in the file's colours, bent by Smoothness (at 100% an S, u − 0.583·u(1−u)
 * (1−2u), which its two-stop fills follow to within half a level), Linear in linear light, and
 * Perceptual in Oklab. `[r, g, b, a]`, colours 0..255, a 0..1.
 */
export function gradientRamp(content, { mirrored = false } = {}) {
  if (content?.type === 'noise') {
    // A Noise gradient is Photoshop's random one, from its seed: not drawn as Photoshop draws it, but
    // in the middle of the ranges it was allowed (its average colour), and reported so.
    const mid = (k) => ((Number(content.min?.[k] ?? 0) + Number(content.max?.[k] ?? 1)) / 2) * 255;
    const rgb = content.colorModel === 'rgb' || !content.colorModel ? [mid(0), mid(1), mid(2)] : [128, 128, 128];
    const alpha = content.addTransparency ? 0.5 : 1;
    return () => [...rgb, alpha];
  }
  const colourStops = [...(content?.colorStops ?? [])].sort((a, b) => a.location - b.location);
  const opacityStops = [...(content?.opacityStops ?? [])].sort((a, b) => a.location - b.location);
  const scale = stopScale(colourStops, opacityStops);
  const smooth = content?.interpolationMethod && content.interpolationMethod !== 'classic' ? 0 : Number(content?.smoothness ?? 1);
  const method = content?.interpolationMethod ?? 'classic';
  // Smoothness, in the classic interpolation: a cubic Hermite spline through the stops, each channel on
  // its own. An end stop's slope is 1 − 0.583 of its segment's (at 100%; the two-stop fills' S, to half
  // a level); an inner stop's is its neighbours' (Catmull-Rom), so between two of one colour it is
  // flat: a Blue, Yellow, Blue stroke read back from Photoshop's colours row by row (stroke-effects.psd)
  // follows it to a hundredth. Below 100% each slope goes that far back toward its segment's own.
  const across = (stops, value, mix) => {
    if (!stops.length) return () => null;
    const at = (stop) => stop.location / scale;
    const values = stops.map((stop) => [].concat(value(stop)));
    const n = stops.length;
    // Each inner stop's Catmull-Rom slope, per unit of the gradient. A Reflected gradient mirrors about
    // its start, so a stop there is between its neighbour and that neighbour's mirror image: flat
    // (effect-enums.psd's reflected stroke is flat at its middle).
    const slopes = values.map((v, i) => {
      if (i === 0 && mirrored && at(stops[0]) <= 1e-6 && n > 1) return v.map(() => 0);
      if (i === 0 || i === n - 1) return null;
      return v.map((_, c) => (values[i + 1][c] - values[i - 1][c]) / Math.max(1e-9, at(stops[i + 1]) - at(stops[i - 1])));
    });
    const single = !Array.isArray(value(stops[0]));
    return (u) => {
      if (u <= at(stops[0])) return value(stops[0]);
      for (let i = 1; i < n; i += 1) {
        const a = stops[i - 1];
        const b = stops[i];
        if (u > at(b)) continue;
        const dx = Math.max(1e-9, at(b) - at(a));
        let k = (u - at(a)) / dx;
        const m = Number(b.midpoint ?? 0.5);
        k = k < m ? (0.5 * k) / Math.max(1e-9, m) : 0.5 + (0.5 * (k - m)) / Math.max(1e-9, 1 - m);
        if (!(smooth > 0)) return mix(value(a), value(b), k);
        const va = values[i - 1]; const vb = values[i];
        const slope = (stop, c, secant) => (slopes[stop]
          ? (1 - smooth) * secant + smooth * slopes[stop][c] * dx
          : (1 - 0.583 * smooth) * secant);
        const k2 = k * k; const k3 = k2 * k;
        const out = va.map((v, c) => {
          const secant = vb[c] - v;
          return (2 * k3 - 3 * k2 + 1) * v + (k3 - 2 * k2 + k) * slope(i - 1, c, secant)
            + (-2 * k3 + 3 * k2) * vb[c] + (k3 - k2) * slope(i, c, secant);
        });
        return single ? out[0] : out;
      }
      return value(stops[n - 1]);
    };
  };
  const lerp = (a, b, k) => a + (b - a) * k;
  const colourMix = method === 'linear'
    ? (a, b, k) => a.map((v, i) => toSrgb(lerp(toLinear(v), toLinear(b[i]), k)))
    : method === 'perceptual'
      ? (a, b, k) => { const oa = toOklab(a); const ob = toOklab(b); return fromOklab(oa.map((v, i) => lerp(v, ob[i], k))); }
      : (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  // A 32-bit document's gradient mixes its stops in linear light, Smoothness and all (psdRead.js marks
  // it): the stops taken back to linear, the result to sRGB.
  const light = Boolean(content?.linearLight) && method === 'classic';
  const colourAt = light
    ? ((at) => (u) => { const v = at(u); return v && v.map((c) => toSrgb(c)); })(across(colourStops, (stop) => psdRgb(stop.color).map(toLinear), (a, b, k) => a.map((v, i) => lerp(v, b[i], k))))
    : across(colourStops, (stop) => psdRgb(stop.color), colourMix);
  const alphaAt = across(opacityStops, (stop) => stop.opacity ?? 1, lerp);
  return (u) => {
    const t = Math.max(0, Math.min(1, u));
    const rgb = colourAt(t) ?? [0, 0, 0];
    return [...rgb.map((v) => Math.max(0, Math.min(255, v))), alphaAt(t) ?? 1];
  };
}

/** Photoshop's colour objects as 0..255 RGB (or, while flattening on inks, as the plane's inks). */
export function psdRgb(color) {
  if (inkPlane) return inksOf(color, inkPlane);
  if (!color || typeof color !== 'object') return [0, 0, 0];
  if (Number.isFinite(color.r)) return [color.r, color.g, color.b];
  if (Number.isFinite(color.fr)) return [color.fr * 255, color.fg * 255, color.fb * 255];
  if (Number.isFinite(color.k) && Number.isFinite(color.c)) return (cmykProfile ?? cmykToRgb)(color.c / 100, color.m / 100, color.y / 100, color.k / 100);
  // A grey given as its ink (0 white, 100 black).
  if (Number.isFinite(color.k)) return [0, 1, 2].map(() => 255 * (1 - color.k / 100));
  if (Number.isFinite(color.h)) return hsbToRgb(color.h, color.s / 100, color.b / 100);
  if (Number.isFinite(color.l) && Number.isFinite(color.a)) return labToRgb(color.l, color.a, color.b);
  if (Number.isFinite(color.l)) return [color.l * 2.55, color.l * 2.55, color.l * 2.55];
  return [0, 0, 0];
}

/** A colour as one plane's stored inks: given as CMYK, its own; otherwise its RGB split plainly. */
function inksOf(color, plane) {
  let inks;
  if (color && Number.isFinite(color.k) && Number.isFinite(color.c)) inks = [color.c, color.m, color.y, color.k].map((v) => v / 100);
  else if (color && Number.isFinite(color.k)) inks = [0, 0, 0, color.k / 100];
  else {
    const previous = inkPlane;
    inkPlane = null;
    const [r, g, b] = psdRgb(color).map((v) => v / 255);
    inkPlane = previous;
    const k = 1 - Math.max(r, g, b);
    inks = k >= 1 ? [0, 0, 0, 1] : [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
  }
  const stored = inks.map((v) => 255 * (1 - unit(v)));
  return plane === 'k' ? [stored[3], stored[3], stored[3]] : stored.slice(0, 3);
}

/**
 * CIE Lab (Photoshop's: L 0..100, a and b about -128..127, against D50) as sRGB 0..255, through XYZ
 * and Bradford's adaptation to sRGB's D65 white.
 */
export function labToRgb(l, a, b) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = 0.96422 * f(fx);
  const y = l > 8 ? f(fy) : l / 903.3;
  const z = 0.82521 * f(fz);
  const linear = [
    3.1338561 * x - 1.6168667 * y - 0.4906146 * z,
    -0.9787684 * x + 1.9161415 * y + 0.0334540 * z,
    0.0719453 * x - 0.2289914 * y + 1.4052427 * z,
  ];
  return linear.map((c) => {
    const v = Math.max(0, Math.min(1, c));
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  });
}

function hsbToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const HUE_RANGES = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas'];
// Photoshop's own bounds for each range (start of the fade in, start, end, end of the fade out), for a
// file that leaves them unset.
const HUE_RANGE_DEFAULTS = {
  reds: [315, 345, 15, 45], yellows: [15, 45, 75, 105], greens: [75, 105, 135, 165],
  cyans: [135, 165, 195, 225], blues: [195, 225, 255, 285], magentas: [255, 285, 315, 345],
};

/** How far hue `h` (degrees) is in a Hue/Saturation range [a, b, c, d], round the colour wheel: 0 to 1. */
export function hueRangeWeight(h, [a, b, c, d]) {
  const turn = (v) => ((v % 360) + 360) % 360;
  if (turn(h - b) <= turn(c - b)) return 1;
  const fadeIn = turn(b - a);
  const before = turn(b - h);
  const fadeOut = turn(d - c);
  const after = turn(h - c);
  return Math.max(fadeIn > 0 && before < fadeIn ? 1 - before / fadeIn : 0, fadeOut > 0 && after < fadeOut ? 1 - after / fadeOut : 0);
}

/** A Levels channel as a table: input black and white, gamma, output black and white. */
function levelsTable(channel) {
  const table = new Float32Array(256);
  const inLo = channel?.shadowInput ?? 0;
  const inHi = channel?.highlightInput ?? 255;
  const outLo = channel?.shadowOutput ?? 0;
  const outHi = channel?.highlightOutput ?? 255;
  const gamma = channel?.midtoneInput ?? 1;
  for (let v = 0; v < 256; v += 1) {
    const t = unit((v - inLo) / Math.max(1, inHi - inLo));
    table[v] = outLo + (outHi - outLo) * Math.pow(t, 1 / (gamma || 1));
  }
  return table;
}

/** A Curves channel's points as a table, through a natural cubic spline as Photoshop draws it. */
function curveTable(points) {
  const table = new Float32Array(256);
  const list = (points ?? []).map((p) => [p.input, p.output]).sort((a, b) => a[0] - b[0]);
  if (list.length < 2) { for (let v = 0; v < 256; v += 1) table[v] = v; return table; }
  const n = list.length;
  const xs = list.map((p) => p[0]);
  const ys = list.map((p) => p[1]);
  const m = new Float64Array(n);
  if (n > 2) {
    const a = new Float64Array(n); const b = new Float64Array(n); const c = new Float64Array(n); const r = new Float64Array(n);
    for (let i = 1; i < n - 1; i += 1) {
      const h0 = xs[i] - xs[i - 1]; const h1 = xs[i + 1] - xs[i];
      a[i] = h0; b[i] = 2 * (h0 + h1); c[i] = h1;
      r[i] = 6 * ((ys[i + 1] - ys[i]) / h1 - (ys[i] - ys[i - 1]) / h0);
    }
    for (let i = 2; i < n - 1; i += 1) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; r[i] -= w * r[i - 1]; }
    for (let i = n - 2; i >= 1; i -= 1) m[i] = (r[i] - c[i] * m[i + 1]) / b[i];
  }
  for (let v = 0; v < 256; v += 1) {
    if (v <= xs[0]) { table[v] = ys[0]; continue; }
    if (v >= xs[n - 1]) { table[v] = ys[n - 1]; continue; }
    let i = 0;
    while (i < n - 2 && v > xs[i + 1]) i += 1;
    const h = xs[i + 1] - xs[i];
    const t = (v - xs[i]) / h;
    const y = (1 - t) * ys[i] + t * ys[i + 1] + ((h * h) / 6) * (((1 - t) ** 3 - (1 - t)) * m[i] + (t ** 3 - t) * m[i + 1]);
    table[v] = clamp(y);
  }
  return table;
}

/**
 * A layer style's contour ({ curve: [{ x, y }] } on 0..255, as ag-psd gives one) as a table from 0..255
 * to 0..255, through the spline Curves uses; null for Linear, which leaves the style as it is.
 */
export function contourTable(contour) {
  const curve = contour?.curve;
  if (!Array.isArray(curve) || curve.length < 2) return null;
  const linear = curve.length === 2 && curve.every((p) => Math.abs(Number(p.x) - Number(p.y)) < 0.5);
  if (linear) return null;
  return curveTable(curve.map((p) => ({ input: Number(p.x) || 0, output: Number(p.y) || 0 })));
}

const SELECTIVE_RANGES = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks'];

/**
 * Selective Color: each range's cyan, magenta, yellow and black (-100..100 %) move the red, green
 * and blue they are the ink of, weighted by how much of the range the colour is in. A colour is in
 * reds as far as red leads the other two (max - mid), in yellows as far as blue trails them (mid -
 * min), and so on round the wheel; in whites as far as its lowest channel is over half, in blacks as
 * far as its highest is under half, in neutrals as far as it is neither. Relative scales the change
 * by the ink already there, so it cannot tint pure white; Absolute adds it outright.
 */
function selectiveColour(adjustment) {
  const relative = adjustment.mode !== 'absolute';
  const ranges = SELECTIVE_RANGES.map((name) => [name, adjustment[name]])
    .filter(([, cmyk]) => cmyk && (cmyk.c || cmyk.m || cmyk.y || cmyk.k));
  return ([r, g, b]) => {
    const rgb = [r / 255, g / 255, b / 255];
    const max = Math.max(...rgb);
    const min = Math.min(...rgb);
    const mid = rgb[0] + rgb[1] + rgb[2] - max - min;
    const weight = {
      reds: rgb[0] === max ? max - mid : 0,
      greens: rgb[1] === max ? max - mid : 0,
      blues: rgb[2] === max ? max - mid : 0,
      cyans: rgb[0] === min ? mid - min : 0,
      magentas: rgb[1] === min ? mid - min : 0,
      yellows: rgb[2] === min ? mid - min : 0,
      whites: min > 0.5 ? (min - 0.5) * 2 : 0,
      blacks: max < 0.5 ? (0.5 - max) * 2 : 0,
      neutrals: 1 - (Math.abs(max - 0.5) + Math.abs(min - 0.5)),
    };
    const out = [...rgb];
    for (const [name, cmyk] of ranges) {
      const w = weight[name];
      if (w <= 0) continue;
      const k = (cmyk.k ?? 0) / 100;
      [cmyk.c, cmyk.m, cmyk.y].forEach((ink, i) => {
        const v = rgb[i];
        const amount = (ink ?? 0) / 100;
        const change = ((-1 - amount) * k - amount) * (relative ? 1 - v : 1);
        out[i] += Math.min(1 - v, Math.max(-v, change)) * w;
      });
    }
    return out.map((v) => clamp(v * 255));
  };
}

const textOf = (bytes) => (typeof bytes === 'string' ? bytes : new TextDecoder('latin1').decode(bytes));

/** A .cube file (Adobe's and Resolve's): a 3D table red fastest, or a 1D one, over its domain. */
function readCube(text) {
  let size3 = 0; let size1 = 0;
  let lo = [0, 0, 0]; let hi = [1, 1, 1];
  const values = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [word, ...rest] = line.split(/\s+/);
    if (word === 'LUT_3D_SIZE') size3 = Number(rest[0]);
    else if (word === 'LUT_1D_SIZE') size1 = Number(rest[0]);
    else if (word === 'DOMAIN_MIN') lo = rest.slice(0, 3).map(Number);
    else if (word === 'DOMAIN_MAX') hi = rest.slice(0, 3).map(Number);
    else if (word === 'LUT_3D_INPUT_RANGE' || word === 'LUT_1D_INPUT_RANGE') { lo = [0, 1, 2].map(() => Number(rest[0])); hi = [0, 1, 2].map(() => Number(rest[1])); }
    else if (/^[-+.\d]/.test(word)) {
      const triple = [word, ...rest].slice(0, 3).map(Number);
      if (triple.length === 3 && triple.every(Number.isFinite)) values.push(...triple);
    }
  }
  const size = size3 || size1;
  const count = size3 ? size3 ** 3 : size1;
  if (!(size >= 2) || values.length !== count * 3) return null;
  return { size, dimensions: size3 ? 3 : 1, table: Float32Array.from(values), lo, hi };
}

/** A .3dl file (Flame's and Lustre's): integer triples blue fastest, their bit depth from the largest. */
function read3dl(text) {
  const values = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!/^\d/.test(line)) continue;
    const numbers = line.split(/\s+/).map(Number);
    if (numbers.length === 3 && numbers.every(Number.isFinite)) values.push(...numbers);
  }
  const size = Math.round(Math.cbrt(values.length / 3));
  if (size < 2 || size ** 3 * 3 !== values.length) return null;
  // The output depth, as the file's largest value suggests it: 10-bit for up to 2047, and so on.
  const largest = values.reduce((a, b) => Math.max(a, b), 0);
  let bits = 8;
  while (bits < 16 && largest > 2 ** bits * 2 - 1) bits += 2;
  if (bits === 14) bits = 16;
  const scale = 2 ** bits - 1;
  const table = new Float32Array(values.length);
  for (let r = 0; r < size; r += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let b = 0; b < size; b += 1) {
        const from = ((r * size + g) * size + b) * 3;
        const to = ((b * size + g) * size + r) * 3;
        for (let c = 0; c < 3; c += 1) table[to + c] = values[from + c] / scale;
      }
    }
  }
  return { size, dimensions: 3, table, lo: [0, 0, 0], hi: [1, 1, 1] };
}

/** An Iridas .look (SpeedGrade's): XML, its table little-endian 32-bit floats in hex, red fastest. */
function readLook(text) {
  if (/<mask\b/i.test(text)) return null;
  const size = Number((text.match(/<size>([^<]*)<\/size>/i)?.[1] ?? '').replace(/["'\s]/g, ''));
  const hex = (text.match(/<data>([^<]*)<\/data>/i)?.[1] ?? '').replace(/["'\s]/g, '');
  if (!(size >= 2) || hex.length !== size ** 3 * 3 * 8 || /[^0-9a-f]/i.test(hex)) return null;
  const view = new DataView(new ArrayBuffer(4));
  const table = new Float32Array(size ** 3 * 3);
  for (let i = 0; i < table.length; i += 1) {
    for (let b = 0; b < 4; b += 1) view.setUint8(b, parseInt(hex.slice(i * 8 + b * 2, i * 8 + b * 2 + 2), 16));
    table[i] = view.getFloat32(0, true);
  }
  return { size, dimensions: 3, table, lo: [0, 0, 0], hi: [1, 1, 1] };
}

/**
 * The lookup table in a Color Lookup layer's file, as `{ size, dimensions, table, lo, hi }` (the
 * table 0..1, red fastest), or null when there is none this reads.
 */
export function readLookupTable(bytes, format) {
  if (!bytes || !bytes.length) return null;
  const text = textOf(bytes);
  const kind = /LUT_[13]D_SIZE/.test(text) ? 'cube' : /<LUT\b/i.test(text) ? 'look' : format === '3dl' || !format ? '3dl' : format;
  if (kind === 'cube') return readCube(text);
  if (kind === 'look') return readLook(text);
  if (kind === '3dl') return read3dl(text);
  return null;
}

function colourLookup(lut) {
  const { size, table, lo, hi } = lut;
  const n = size - 1;
  const at = (v, c) => unit(((v / 255) - lo[c]) / ((hi[c] - lo[c]) || 1)) * n;
  if (lut.dimensions === 1) {
    return (rgb) => rgb.map((v, c) => {
      const x = at(v, c); const i = Math.min(n - 1, Math.floor(x)); const t = x - i;
      return clamp((table[i * 3 + c] * (1 - t) + table[(i + 1) * 3 + c] * t) * 255);
    });
  }
  const cell = (r, g, b, c) => table[((b * size + g) * size + r) * 3 + c];
  return ([r, g, b]) => {
    const x = at(r, 0); const y = at(g, 1); const z = at(b, 2);
    const i = Math.min(n - 1, Math.floor(x)); const j = Math.min(n - 1, Math.floor(y)); const k = Math.min(n - 1, Math.floor(z));
    const tx = x - i; const ty = y - j; const tz = z - k;
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) {
      const lerp = (a, b2, t) => a + (b2 - a) * t;
      const near = lerp(lerp(cell(i, j, k, c), cell(i + 1, j, k, c), tx), lerp(cell(i, j + 1, k, c), cell(i + 1, j + 1, k, c), tx), ty);
      const far = lerp(lerp(cell(i, j, k + 1, c), cell(i + 1, j, k + 1, c), tx), lerp(cell(i, j + 1, k + 1, c), cell(i + 1, j + 1, k + 1, c), tx), ty);
      out[c] = clamp(lerp(near, far, tz) * 255);
    }
    return out;
  };
}


// How two colour ranges' saturations add up in Photoshop's Hue/Saturation: a table psd-tools measured
// on a grid of -100..100 in tens (MIT, psd_tools/composite/adjustments.py), read here reversed on both
// axes as it reads it, and between its points by straight lines.
const SATURATION_GRID = [
  [100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100],
  [100, 94, 92, 91, 91, 90, 90, 90, 90, 90, 90, 89, 89, 89, 89, 89, 89, 89, 88, 88, 88],
  [100, 92, 89, 86, 84, 83, 82, 81, 81, 80, 80, 79, 79, 78, 78, 77, 77, 76, 76, 75, 74],
  [100, 91, 86, 82, 79, 77, 74, 73, 71, 70, 70, 68, 67, 66, 65, 64, 62, 61, 59, 58, 56],
  [100, 91, 84, 79, 75, 71, 68, 65, 63, 61, 60, 58, 56, 54, 52, 49, 47, 44, 41, 36, 32],
  [100, 90, 83, 77, 71, 66, 62, 59, 55, 52, 50, 47, 44, 41, 37, 33, 28, 22, 17,  9, -1],
  [100, 90, 82, 74, 68, 62, 57, 52, 47, 43, 40, 36, 31, 26, 21, 13,  5, -5,-15,-25,-35],
  [100, 90, 81, 73, 65, 59, 52, 46, 39, 35, 30, 24, 19, 11,  2, -8,-18,-28,-38,-48,-58],
  [100, 90, 81, 71, 63, 55, 47, 39, 33, 26, 20, 13,  4, -6,-16,-26,-36,-46,-56,-66,-76],
  [100, 90, 80, 70, 61, 52, 43, 35, 26, 17, 10,  1, -9,-19,-29,-39,-49,-59,-69,-79,-89],
  [100, 90, 80, 70, 60, 50, 40, 30, 20, 10,  0,-10,-20,-30,-40,-49,-60,-70,-80,-90,-100],
  [100, 89, 79, 68, 58, 47, 36, 24, 13,  1,-10,-19,-30,-40,-50,-60,-70,-79,-89,-99,-100],
  [100, 89, 79, 67, 56, 44, 31, 19,  4, -9,-20,-30,-40,-50,-60,-70,-79,-90,-99,-100,-100],
  [100, 89, 78, 66, 54, 41, 26, 11, -6,-19,-30,-40,-50,-59,-70,-79,-89,-99,-100,-100,-100],
  [100, 89, 78, 65, 52, 37, 21,  2,-16,-29,-40,-50,-60,-70,-79,-90,-99,-100,-100,-100,-100],
  [100, 89, 77, 64, 49, 33, 13, -8,-26,-39,-49,-60,-70,-79,-90,-99,-100,-100,-100,-100,-100],
  [100, 89, 77, 62, 47, 28,  5,-18,-36,-49,-60,-70,-79,-89,-99,-100,-100,-100,-100,-100,-100],
  [100, 89, 76, 61, 44, 22, -5,-28,-46,-59,-70,-79,-90,-99,-100,-100,-100,-100,-100,-100,-100],
  [100, 88, 76, 59, 41, 17,-15,-38,-56,-69,-80,-89,-99,-100,-100,-100,-100,-100,-100,-100,-100],
  [100, 88, 75, 58, 36,  9,-25,-48,-66,-79,-90,-99,-100,-100,-100,-100,-100,-100,-100,-100,-100],
  [100, 88, 74, 56, 32, -1,-35,-58,-76,-89,-100,-100,-100,-100,-100,-100,-100,-100,-100,-100,-100],
].reverse().map((row) => row.slice().reverse().map((v) => v / 100));
function addSaturations(x, y) {
  const at = (v) => Math.max(0, Math.min(19.999, (Math.max(-1, Math.min(1, v)) + 1) * 10));
  const fx = at(x); const fy = at(y);
  const i = Math.floor(fx); const j = Math.floor(fy);
  const u = fx - i; const v = fy - j;
  const g = SATURATION_GRID;
  return (g[i][j] * (1 - u) + g[i + 1][j] * u) * (1 - v) + (g[i][j + 1] * (1 - u) + g[i + 1][j + 1] * u) * v;
}
const rgbToHslUnit = (r, g, b) => {
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min; const l = (max + min) / 2;
  if (d <= 1e-9) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = (((g - b) / d) % 6 + 6) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return [h / 6, s, l];
};
const hslUnitToRgb = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s; const hh = (((h % 1) + 1) % 1) * 6; const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
};
/**
 * Hue/Saturation's colour ranges as psd-tools models them from Photoshop's pictures (MIT,
 * psd_tools/composite/adjustments.py): the master lightness first; each range's hue, lightness and
 * saturation weighed by its trapezoid; the ranges' lightness in HSV, their saturations joined through
 * the measured table; hue and saturation then in HSL, the master's before the ranges'.
 */
function hueSaturationRanges(adjustment, ranges) {
  const master = adjustment.master ?? {};
  const mh = (master.hue ?? 0) / 360; const ms = (master.saturation ?? 0) / 100; const ml = (master.lightness ?? 0) / 100;
  const lighten = (v, l) => (l > 0 ? v * (1 - l) + l : l < 0 ? v * (1 + l) : v);
  const saturate = (v, s) => Math.max(0, Math.min(1, s > 0 ? v / (1 - s + 0.01) : v * (1 + s)));
  return (rgb) => {
    const [r, g, b] = rgb.map((v) => lighten(v / 255, ml));
    const [h0, s0, l0] = rgbToHslUnit(r, g, b);
    let ch = 0; let cs = 0; let cl = 0;
    for (const range of ranges) {
      const w = hueRangeWeight(h0 * 360, range.bounds);
      ch += (range.hue / 360) * w;
      cl = Math.max(-1, Math.min(1, cl + range.light * w));
      const contribution = range.sat > 0 ? range.sat * (1 - (1 - w) ** (1.5 / (1 - range.sat ** 4 + 0.05))) : range.sat * w;
      cs = addSaturations(cs, contribution);
    }
    // Into HSV for the ranges' lightness.
    const v = l0 + s0 * Math.min(l0, 1 - l0);
    let sv = v > 1e-9 ? 2 * (1 - l0 / v) : 0;
    let vv = cl >= 0 ? v : Math.max(0, Math.min(1, v * (1 + cl * sv)));
    const div = 1 / (sv + 1e-3);
    sv = Math.max(0, Math.min(1, cl >= 0 ? sv * (1 - cl) : 1 + (div - 1) / (Math.abs(cl) - div + 1e-3)));
    // Back to HSL.
    const l = vv * (1 - sv / 2);
    const denom = Math.min(l, 1 - l);
    let s = denom > 1e-9 ? (vv - l) / denom : 0;
    const h = (((h0 + ch + mh) % 1) + 1) % 1;
    s = saturate(saturate(s, ms), cs);
    return hslUnitToRgb(h, s, l).map((x) => clamp(x * 255));
  };
}


/**
 * The current Brightness/Contrast as psd-tools models it (MIT, psd_tools/composite/adjustments.py):
 * Contrast an S through Curves' spline about 63 and 191, moved 25 levels for each 100%; Brightness a
 * polynomial bend psd-tools fitted to Photoshop's pictures, put on as a shear along the diagonal.
 */
function brightnessContrastCurve(brightness, contrast) {
  const b = brightness / 150;
  const s = contrast * 25;
  const curve = curveTable([{ input: 0, output: 0 }, { input: 63, output: 63 - s }, { input: 191, output: 191 + s }, { input: 255, output: 255 }]);
  const pol = (a, x, r) => a * x ** r;
  const xs = new Float64Array(256);
  const ys = new Float64Array(256);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    const h = 0.5 * (Math.abs(b) * (pol(1.65, t, 0.35) + pol(-1, t, 10)) + (1 - Math.abs(b)) * (pol(1.96, t, 0.4) + pol(1, t, 4)) + pol(1, t, 1.25));
    const bend = b * t * (1 - t) * h;
    xs[i] = t - bend;
    ys[i] = curve[i] / 255 + bend;
  }
  const table = new Float32Array(256);
  let k = 0;
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    while (k < 254 && xs[k + 1] < t) k += 1;
    const span = xs[k + 1] - xs[k];
    const f = span > 1e-12 ? Math.max(0, Math.min(1, (t - xs[k]) / span)) : 0;
    const y = t <= xs[0] ? ys[0] : t >= xs[255] ? ys[255] : ys[k] + (ys[k + 1] - ys[k]) * f;
    table[i] = clamp(y * 255);
  }
  return (rgb) => rgb.map((v) => table[Math.round(clamp(v))]);
}

/**
 * The adjustment as `([r, g, b]) => [r, g, b]` (0..255), or null when it is one this does not do.
 * `report` (a Set) collects what was only approximated.
 */
export function adjustmentFunction(adjustment, report = new Set(), { grey = false, cmyk = false, deep = false } = {}) {
  const type = adjustment?.type;
  switch (type) {
    case 'invert':
      return ([r, g, b]) => [255 - r, 255 - g, 255 - b];
    case 'posterize': {
      const levels = Math.max(2, Math.min(255, Math.round(adjustment.levels ?? 4)));
      // Photoshop's: the range cut into `levels` equal bands, each drawn at its share of 255, rounded
      // down (exactly as on psd-tools' test files).
      // In a 16- or 32-bit file, on the value at its full precision (0..1): cut at k / levels, each band
      // drawn at its share of Photoshop's 15-bit scale (posterize_16bits_rgb.psd, 3.4 % of pixels off
      // to none, where the 8-bit rule cuts a little lower and misses the pixels at each edge).
      const step = deep
        ? (v) => (Math.round(Math.min(levels - 1, Math.floor((clamp(v) / 255) * levels)) * (32768 / (levels - 1))) / 32768) * 255
        : (v) => Math.floor(Math.min(levels - 1, Math.floor((clamp(v) * levels) / 256)) * (255 / (levels - 1)));
      const fn = ([r, g, b]) => [step(r), step(g), step(b)];
      // (Its edges fall between 8-bit levels: given the colour unrounded where the file has it.)
      if (deep) fn.fine = true;
      return fn;
    }
    case 'threshold': {
      // White where the luminance, as Photoshop weighs it and rounds it to a level, reaches the
      // threshold (the grey itself in a Grayscale file).
      // In a CMYK file its black is the black ink alone, as a press shows it (threshold_cmyk.psd).
      const level = adjustment.level ?? 128;
      const black = cmyk ? (cmykProfile ?? cmykToRgb)(0, 0, 0, 1) : [0, 0, 0];
      // (A CMYK file's Threshold is drawn on its inks where it can be: utils/psdComposite.js compositeInks.)
      return ([r, g, b]) => (Math.round(grey ? r : 0.3 * r + 0.59 * g + 0.11 * b) >= level ? [255, 255, 255] : [...black]);
    }
    case 'levels': {
      // Each channel's own levels first, then the RGB ones over all three, as Photoshop draws them.
      // A Grayscale file has one channel, its levels the first after the master, which it ignores.
      const all = levelsTable(grey ? null : adjustment.rgb);
      const per = (grey ? ['red', 'red', 'red'] : ['red', 'green', 'blue']).map((name) => levelsTable(adjustment[name]));
      return (rgb) => rgb.map((v, i) => all[Math.round(clamp(per[i][Math.round(clamp(v))]))]);
    }
    case 'curves': {
      // Each channel's own curve first, then the RGB one over all three, as Photoshop draws them.
      // A Grayscale file has one channel, its curve the first after the master, which it ignores.
      const all = curveTable(grey ? null : adjustment.rgb);
      const per = (grey ? ['red', 'red', 'red'] : ['red', 'green', 'blue']).map((name) => curveTable(adjustment[name]));
      return (rgb) => rgb.map((v, i) => all[Math.round(clamp(per[i][Math.round(clamp(v))]))]);
    }
    case 'exposure': {
      const gain = Math.pow(2, adjustment.exposure ?? 0);
      const offset = adjustment.offset ?? 0;
      const gamma = adjustment.gamma ?? 1;
      // In linear light, as Photoshop works exposure: through sRGB's curve, or in a Grayscale file
      // through Dot Gain 20%'s, a power of 1.75 (psd-tools' finding, which its test files bear out).
      const toLinear = grey ? (v) => (v / 255) ** 1.75 : (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const toSrgb = grey ? (c) => 255 * Math.max(0, c) ** (1 / 1.75) : (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
      return (rgb) => rgb.map((v) => clamp(toSrgb(unit(Math.pow(unit(toLinear(v) * gain + offset), 1 / (gamma || 1))))));
    }
    case 'brightness/contrast': {
      const brightness = adjustment.brightness ?? 0;
      const contrast = (adjustment.contrast ?? 0) / 100;
      if (adjustment.useLegacy) {
        // Legacy, as Photoshop draws it (exactly, on psd-tools' test files): Contrast stretches each
        // channel about its middle, Brightness adds its own value, before the stretch when Contrast
        // is up and after the squeeze when it is down.
        const k = contrast >= 0 ? 1 / Math.max(0.01, 1 - contrast) : 1 + contrast;
        return (rgb) => rgb.map((v) => clamp(contrast >= 0 ? (v + brightness - 127.5) * k + 127.5 : (v - 127.5) * k + 127.5 + brightness));
      }
      // The current one, which Photoshop took from Camera Raw and publishes no formula for: psd-tools'
      // model (brightnessContrastCurve), within 3 levels of Photoshop's pictures of its four test
      // settings on average and nowhere 16 off, where the curve fitted here before was 7 off.
      report.add('Brightness/Contrast');
      return brightnessContrastCurve(brightness, contrast);
    }
    case 'hue/saturation': {
      const master = adjustment.master ?? {};
      // Colorize: every colour given one hue and saturation, its lightness kept (then lightened or
      // darkened). The file keeps the switch and those three ahead of the master range, which ag-psd
      // reads as the master's first four values: a (the switch, in its high byte), b, c and d.
      if (master.a) {
        report.add('Hue/Saturation Colorize');
        const hue = (((master.b ?? 0) % 360) + 360) % 360;
        const sat = unit((master.c ?? 25) / 100);
        const light = (master.d ?? 0) / 100;
        return ([r, g, b]) => {
          let l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
          l = light >= 0 ? l + (1 - l) * light : l * (1 + light);
          return hslToRgb(hue, sat, unit(l));
        };
      }
      // The master and the colour ranges (Reds, Yellows, ...), each range weighed by how far a colour's
      // hue is in it, as psd-tools models Photoshop (hueSaturationRanges): within a level of Photoshop's
      // own pictures of psd-tools' three test files, where the model this replaced was 2 to 8 off.
      const ranges = HUE_RANGES.map((name) => {
        const range = adjustment[name];
        if (!range || !(range.hue || range.saturation || range.lightness)) return null;
        const bounds = [range.a, range.b, range.c, range.d].map((v) => Number(v) || 0);
        return {
          bounds: bounds.every((v) => v === 0) ? HUE_RANGE_DEFAULTS[name] : bounds,
          hue: range.hue ?? 0, sat: (range.saturation ?? 0) / 100, light: (range.lightness ?? 0) / 100,
        };
      }).filter(Boolean);
      if (ranges.length) report.add('Hue/Saturation colour ranges');
      return hueSaturationRanges(adjustment, ranges);
    }
    case 'vibrance': {
      report.add('Vibrance');
      const vibrance = (adjustment.vibrance ?? 0) / 100;
      const saturation = (adjustment.saturation ?? 0) / 100;
      return ([r, g, b]) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        const boosted = unit(s + (1 - s) * vibrance * (1 - s) + s * saturation);
        return hslToRgb(h, boosted, l);
      };
    }
    case 'color balance': {
      report.add('Color Balance');
      const ranges = ['shadows', 'midtones', 'highlights'].map((name) => adjustment[name] ?? { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 });
      return ([r, g, b]) => {
        const l = luma(r, g, b) / 255;
        // How much each tonal range applies at this lightness.
        const weights = [unit(1 - l * 3), unit(1 - Math.abs(l - 0.5) * 3), unit((l - 2 / 3) * 3)];
        let dr = 0; let dg = 0; let db = 0;
        ranges.forEach((range, i) => {
          dr += (range.cyanRed ?? 0) * weights[i] * 0.6;
          dg += (range.magentaGreen ?? 0) * weights[i] * 0.6;
          db += (range.yellowBlue ?? 0) * weights[i] * 0.6;
        });
        let out = [clamp(r + dr), clamp(g + dg), clamp(b + db)];
        if (adjustment.preserveLuminosity) {
          const shift = luma(r, g, b) - luma(...out);
          out = out.map((v) => clamp(v + shift));
        }
        return out;
      };
    }
    case 'black & white': {
      report.add('Black & White');
      const weights = { reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80, ...adjustment };
      const tint = adjustment.useTint ? psdRgb(adjustment.tintColor) : null;
      return ([r, g, b]) => {
        const [h, s] = rgbToHsl(r, g, b);
        // The hue's own weight, blended between the six named ones.
        const names = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas'];
        const at = h / 60;
        const i = Math.floor(at) % 6;
        const k = at - Math.floor(at);
        const w = ((weights[names[i]] * (1 - k) + weights[names[(i + 1) % 6]] * k) / 100);
        const base = luma(r, g, b);
        const v = clamp(base + (Math.max(r, g, b) - base) * (w - 0.5) * 2 * s);
        return tint ? [v * tint[0] / 255 + v * (1 - tint[0] / 255) * 0.5, v * tint[1] / 255 + v * (1 - tint[1] / 255) * 0.5, v * tint[2] / 255 + v * (1 - tint[2] / 255) * 0.5].map(clamp) : [v, v, v];
      };
    }
    case 'photo filter': {
      report.add('Photo Filter');
      const colour = psdRgb(adjustment.color);
      // ag-psd gives the Density as a fraction; a percent, where a reader gave one, still reads.
      const raw = Number(adjustment.density ?? 0.25);
      const density = raw > 1 ? raw / 100 : raw;
      return ([r, g, b]) => {
        let out = [r * (1 - density) + (r * colour[0] / 255) * density, g * (1 - density) + (g * colour[1] / 255) * density, b * (1 - density) + (b * colour[2] / 255) * density];
        if (adjustment.preserveLuminosity !== false) {
          const shift = luma(r, g, b) - luma(...out);
          out = out.map((v) => v + shift);
        }
        return out.map(clamp);
      };
    }
    case 'channel mixer': {
      const mix = (channel, rgb) => clamp(((channel?.red ?? 0) * rgb[0] + (channel?.green ?? 0) * rgb[1] + (channel?.blue ?? 0) * rgb[2]) / 100 + (channel?.constant ?? 0) * 2.55);
      if (adjustment.monochrome) return (rgb) => { const v = mix(adjustment.gray ?? { red: 40, green: 40, blue: 20 }, rgb); return [v, v, v]; };
      return (rgb) => [mix(adjustment.red ?? { red: 100 }, rgb), mix(adjustment.green ?? { green: 100 }, rgb), mix(adjustment.blue ?? { blue: 100 }, rgb)];
    }
    case 'gradient map': {
      // Through the gradient as Photoshop draws one (midpoints, Smoothness, interpolation).
      const ramp = gradientRamp(adjustment);
      return ([r, g, b]) => {
        let t = luma(r, g, b) / 255;
        if (adjustment.reverse) t = 1 - t;
        return ramp(t).slice(0, 3).map(clamp);
      };
    }
    case 'selective color':
      report.add('Selective Color');
      return selectiveColour(adjustment);
    case 'color lookup': {
      // One with nothing chosen in it (no table, no profile, no name) leaves colours as they are, as a
      // freshly added Color Lookup does in Photoshop (fill_adjustments.psd).
      if (!adjustment.lookupType && !adjustment.lut3DFileData?.length && !adjustment.lut3DFileName && !adjustment.profile && !adjustment.name) return (rgb) => rgb;
      if (adjustment.lookupType && adjustment.lookupType !== '3dlut') return null;
      const lut = readLookupTable(adjustment.lut3DFileData, adjustment.lutFormat);
      return lut ? colourLookup(lut) : null;
    }
    default:
      return null;
  }
}

/** What an adjustment `adjustmentFunction` does not do is, for the import's list of them. */
export function unappliedAdjustment(adjustment) {
  const type = adjustment?.type ?? 'unknown';
  if (type !== 'color lookup') return type;
  if (adjustment.lookupType && adjustment.lookupType !== '3dlut') return 'Color Lookup through an ICC profile';
  return adjustment.lut3DFileData?.length ? `Color Lookup, its table (${adjustment.lut3DFileName || adjustment.lutFormat || 'file'}) not readable` : 'Color Lookup without its table';
}

/**
 * Adjust `pixels` (RGBA 8-bit, `width` wide, its top left at document `left`, `top`) by `fn`, by
 * `strength` 0..1 (the adjustment's opacity) times `mask(x, y)` (its layer mask, in document pixels).
 */
export function adjustPixels(pixels, width, left, top, fn, { strength = 1, mask = null } = {}) {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const p = i / 4;
    const amount = strength * (mask ? mask(left + (p % width), top + Math.floor(p / width)) : 1);
    if (amount <= 0) continue;
    const [r, g, b] = fn([pixels[i], pixels[i + 1], pixels[i + 2]]);
    pixels[i] = Math.round(pixels[i] + (r - pixels[i]) * amount);
    pixels[i + 1] = Math.round(pixels[i + 1] + (g - pixels[i + 1]) * amount);
    pixels[i + 2] = Math.round(pixels[i + 2] + (b - pixels[i + 2]) * amount);
  }
}

/** An ARGB colour string through `fn`, its alpha kept. */
export function adjustArgb(argb, fn) {
  const hex = String(argb ?? '');
  if (!/^[0-9a-f]{8}$/i.test(hex)) return argb;
  const rgb = fn([1, 3, 5].map((i) => parseInt(hex.slice(i + 1, i + 3), 16)));
  return `${hex.slice(0, 2)}${rgb.map((v) => Math.round(clamp(v)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
