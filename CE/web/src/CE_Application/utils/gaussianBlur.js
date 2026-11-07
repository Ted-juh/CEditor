// gaussianBlur.js — a Gaussian blur of one value a pixel, for the Photoshop importers (shadows and
// glows in utils/psdLayerStyles.js, mask feather in utils/psdComposite.js).

/**
 * A Gaussian blur of `a` (`w` × `h`, one value a pixel) in place, as three box blurs (Wells), nothing
 * outside it.
 */
export function blur(a, w, h, sigma) {
  if (!(sigma > 0.25)) return;
  const ideal = Math.sqrt(4 * sigma * sigma + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower -= 1;
  const m = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
  const line = new Float32Array(Math.max(w, h));
  const pass = (start, step, n, r) => {
    let sum = 0;
    for (let k = 0; k <= Math.min(r, n - 1); k += 1) sum += a[start + k * step];
    const scale = 1 / (2 * r + 1);
    for (let i = 0; i < n; i += 1) {
      line[i] = sum * scale;
      if (i + r + 1 < n) sum += a[start + (i + r + 1) * step];
      if (i - r >= 0) sum -= a[start + (i - r) * step];
    }
    for (let i = 0; i < n; i += 1) a[start + i * step] = line[i];
  };
  for (let k = 0; k < 3; k += 1) {
    const r = ((k < m ? lower : lower + 2) - 1) / 2;
    if (r < 1) continue;
    for (let y = 0; y < h; y += 1) pass(y * w, 1, w, r);
    for (let x = 0; x < w; x += 1) pass(x, w, h, r);
  }
}

