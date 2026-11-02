// psdAdjustments.js — Photoshop's adjustment layers, as what they do to a colour.
//
// An adjustment layer has no pixels: it changes the colours of everything under it. A component
// keeps its layers apart, so the Photoshop component import (utils/psdComponentImport.js) applies an
// adjustment to the layers it covers as it reads them: their pictures, and the colours of the vector
// and text layers. The look is Photoshop's; the adjustment itself does not survive as a layer.
//
// Each adjustment becomes a function from one 8-bit [r, g, b] to another. These follow Photoshop's
// published behaviour as closely as an import needs: Levels, Curves, Exposure, Invert, Posterize,
// Threshold, Channel Mixer and Gradient Map are exact; Brightness/Contrast, Hue/Saturation (the
// master range), Vibrance, Color Balance, Black & White and Photo Filter follow the documented
// formulas and come out close. Selective Color and Color Lookup are not done, and say so.

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const unit = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Photoshop's colour objects as 0..255 RGB. */
export function psdRgb(color) {
  if (!color || typeof color !== 'object') return [0, 0, 0];
  if (Number.isFinite(color.r)) return [color.r, color.g, color.b];
  if (Number.isFinite(color.fr)) return [color.fr * 255, color.fg * 255, color.fb * 255];
  if (Number.isFinite(color.k)) {
    const k = color.k / 100;
    return [255 * (1 - color.c / 100) * (1 - k), 255 * (1 - color.m / 100) * (1 - k), 255 * (1 - color.y / 100) * (1 - k)];
  }
  if (Number.isFinite(color.h)) return hsbToRgb(color.h, color.s / 100, color.b / 100);
  if (Number.isFinite(color.l)) return [color.l * 2.55, color.l * 2.55, color.l * 2.55];
  return [0, 0, 0];
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

function gradientColour(stops, t) {
  const list = [...(stops ?? [])].sort((a, b) => a.location - b.location);
  if (!list.length) return [t * 255, t * 255, t * 255];
  const at = t * 4096;
  if (at <= list[0].location) return psdRgb(list[0].color);
  for (let i = 1; i < list.length; i += 1) {
    if (at <= list[i].location) {
      const k = (at - list[i - 1].location) / Math.max(1, list[i].location - list[i - 1].location);
      const a = psdRgb(list[i - 1].color);
      const b = psdRgb(list[i].color);
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
  }
  return psdRgb(list[list.length - 1].color);
}

/**
 * The adjustment as `([r, g, b]) => [r, g, b]` (0..255), or null when it is one this does not do.
 * `report` (a Set) collects what was only approximated.
 */
export function adjustmentFunction(adjustment, report = new Set()) {
  const type = adjustment?.type;
  switch (type) {
    case 'invert':
      return ([r, g, b]) => [255 - r, 255 - g, 255 - b];
    case 'posterize': {
      const levels = Math.max(2, Math.min(255, Math.round(adjustment.levels ?? 4)));
      const step = (v) => Math.round(Math.round((v / 255) * (levels - 1)) * (255 / (levels - 1)));
      return ([r, g, b]) => [step(r), step(g), step(b)];
    }
    case 'threshold': {
      const level = adjustment.level ?? 128;
      return ([r, g, b]) => { const v = luma(r, g, b) >= level ? 255 : 0; return [v, v, v]; };
    }
    case 'levels': {
      const all = levelsTable(adjustment.rgb);
      const per = ['red', 'green', 'blue'].map((name) => levelsTable(adjustment[name]));
      return (rgb) => rgb.map((v, i) => per[i][Math.round(clamp(all[Math.round(clamp(v))]))]);
    }
    case 'curves': {
      const all = curveTable(adjustment.rgb);
      const per = ['red', 'green', 'blue'].map((name) => curveTable(adjustment[name]));
      return (rgb) => rgb.map((v, i) => per[i][Math.round(all[Math.round(clamp(v))])]);
    }
    case 'exposure': {
      const gain = Math.pow(2, adjustment.exposure ?? 0);
      const offset = adjustment.offset ?? 0;
      const gamma = adjustment.gamma ?? 1;
      // In linear light, as Photoshop works exposure.
      const toLinear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const toSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
      return (rgb) => rgb.map((v) => clamp(toSrgb(unit(Math.pow(unit(toLinear(v) * gain + offset), 1 / (gamma || 1))))));
    }
    case 'brightness/contrast': {
      report.add('Brightness/Contrast');
      const brightness = (adjustment.brightness ?? 0) / 100;
      const contrast = (adjustment.contrast ?? 0) / 100;
      const k = contrast >= 0 ? 1 / Math.max(0.01, 1 - contrast) : 1 + contrast;
      return (rgb) => rgb.map((v) => {
        const lit = brightness >= 0 ? v + (255 - v) * brightness * 0.6 : v * (1 + brightness * 0.6);
        return clamp((lit - 127.5) * k + 127.5);
      });
    }
    case 'hue/saturation': {
      const master = adjustment.master ?? {};
      if (['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas'].some((name) => adjustment[name] && (adjustment[name].hue || adjustment[name].saturation || adjustment[name].lightness))) {
        report.add('Hue/Saturation colour ranges (the master range is applied)');
      }
      const hue = master.hue ?? 0;
      const sat = (master.saturation ?? 0) / 100;
      const light = (master.lightness ?? 0) / 100;
      return ([r, g, b]) => {
        let [h, s, l] = rgbToHsl(r, g, b);
        h = (h + hue + 360) % 360;
        s = sat >= 0 ? s + (1 - s) * sat * s : s * (1 + sat);
        l = light >= 0 ? l + (1 - l) * light : l * (1 + light);
        return hslToRgb(h, unit(s), unit(l));
      };
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
      const density = (adjustment.density ?? 25) / 100;
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
      const stops = adjustment.colorStops ?? [];
      return ([r, g, b]) => {
        let t = luma(r, g, b) / 255;
        if (adjustment.reverse) t = 1 - t;
        return gradientColour(stops, t).map(clamp);
      };
    }
    default:
      return null;
  }
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
