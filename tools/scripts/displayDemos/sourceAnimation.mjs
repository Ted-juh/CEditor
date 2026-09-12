// sourceAnimation.mjs — the GIF that gets LOADED, as opposed to the GIFs that get written.
//
// The dot-matrix panel can play an animation file: `animMode: 'file'` hands `animSrc` to
// LcdGraphicCanvas, which decodes it through WebCodecs ImageDecoder, Floyd–Steinberg dithers every
// frame to 1-bit at the grid size, and plays it back at the file's own per-frame durations. To
// demonstrate that, something has to be loaded — and a demo that depends on a binary nobody can
// regenerate is a demo that rots, so the source animation is rendered here instead of committed.
//
// WHY A SHADED TORUS. The panel is 1-bit: every dot is on or off. A shape with hard edges (a
// wireframe, a logo) would prove the file decodes and nothing else, because thresholding hard
// edges looks identical to dithering them. A smoothly shaded solid is the case where the
// dithering is the whole difference between a recognisable object and two flat blobs, so it is
// the case worth showing. It is also unmistakably a loaded picture rather than one of the panel's
// own widgets, which is the other half of the claim.
//
// The loop closes by construction: both rotations complete a whole number of turns over the
// frames, so the last frame leads back into the first.

import { encodeGif } from '../lib/animatedGif.mjs';

/**
 * One frame of a Lambert-shaded torus, as a greyscale RGBA buffer.
 *
 * The torus is swept as a circle of radius `r1` centred at `r2` from the origin, rotated through
 * `phi` around the y-axis to make the tube, then tumbled by `a` (x-axis) and `b` (z-axis). Points
 * are painted with a z-buffer rather than sorted, which is what keeps the near surface in front of
 * the far one where the hole is.
 */
function renderTorus(width, height, a, b, { r1 = 1, r2 = 2, viewerZ = 5 } = {}) {
  const rgba = new Uint8Array(width * height * 4);
  const depth = new Float32Array(width * height); // 1/z, so larger means nearer; 0 is empty

  // Scale so the tumbling torus (max extent r1 + r2 from the origin) always clears the short edge.
  const scale = (height * viewerZ * 0.42) / (r1 + r2);

  const cosA = Math.cos(a); const sinA = Math.sin(a);
  const cosB = Math.cos(b); const sinB = Math.sin(b);

  // Step sizes fine enough that the surface has no holes at this scale. The torus is a surface,
  // not a mesh, so oversampling is cheaper than interpolating.
  for (let theta = 0; theta < Math.PI * 2; theta += 0.05) {
    const cosT = Math.cos(theta); const sinT = Math.sin(theta);
    // A point on the tube's circle, and its outward normal, before the sweep.
    const circleX = r2 + r1 * cosT;
    const circleY = r1 * sinT;

    for (let phi = 0; phi < Math.PI * 2; phi += 0.015) {
      const cosP = Math.cos(phi); const sinP = Math.sin(phi);

      // Sweep, then tumble: x/y/z of the surface point.
      const x = circleX * (cosB * cosP + sinA * sinB * sinP) - circleY * cosA * sinB;
      const y = circleX * (sinB * cosP - sinA * cosB * sinP) + circleY * cosA * cosB;
      const z = viewerZ + cosA * circleX * sinP + circleY * sinA;
      const ooz = 1 / z;

      const px = Math.round(width / 2 + scale * ooz * x);
      const py = Math.round(height / 2 - scale * ooz * y);
      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      // Lambert term against a light at (0, 1, -1): the same rotation applied to the normal.
      const lum = cosP * cosT * sinB - cosA * cosT * sinP - sinA * sinT
        + cosB * (cosA * sinT - cosT * sinA * sinP);
      if (lum <= 0) continue; // facing away from the light

      const i = py * width + px;
      if (ooz <= depth[i]) continue;
      depth[i] = ooz;

      // lum is 0..sqrt(2); spread it across the full range so the dither has something to work
      // with, with a floor so the terminator does not collapse straight to black.
      const shade = Math.round(28 + (lum / Math.SQRT2) * 227);
      rgba[i * 4] = shade;
      rgba[i * 4 + 1] = shade;
      rgba[i * 4 + 2] = shade;
      rgba[i * 4 + 3] = 255;
    }
  }

  // Opaque black where nothing was drawn: the panel treats near-black as "dot off".
  for (let i = 0; i < width * height; i += 1) rgba[i * 4 + 3] = 255;
  return { width, height, rgba };
}

/**
 * The loadable animation, as GIF bytes.
 *
 * `width`/`height` default to 2.25:1 — the dot-matrix panel's own 144×64 aspect — because the
 * decoder scales whatever it is given to the grid, and a source of a different shape arrives
 * stretched. Rendering above the grid resolution and letting it scale down is what gives the
 * dither clean midtones instead of stair-stepped ones.
 */
export function buildTorusGif({ width = 216, height = 96, frames = 30, delayCs = 5, turnsA = 1, turnsB = 2 } = {}) {
  const rendered = [];
  for (let i = 0; i < frames; i += 1) {
    const t = i / frames; // 0 → just under 1, so frame `frames` would be frame 0 again
    rendered.push(renderTorus(width, height, turnsA * t * Math.PI * 2, turnsB * t * Math.PI * 2));
  }
  return encodeGif(rendered, { delayCs, loop: 0 });
}

/** Milliseconds one full cycle of `buildTorusGif` takes, for lining it up with the capture loop. */
export function torusGifMs({ frames = 30, delayCs = 5 } = {}) {
  return frames * delayCs * 10;
}
