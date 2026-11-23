// scene3dLayers.js — a 3D part's render passes as the layers the Blender add-on writes
// (tools/blender/ceditor_layers.py), so that the Photoshop component import makes the same parts of
// them: each object's colour, its shading (multiply) and highlights (linear dodge) over its inside, the
// light on it and its gloss beside it (hidden, in linear light, `light_code`), a lamp's glow, the
// shadow on the panel, a turning object at each angle turned back to rest, and the XMP saying which
// light layers go with which colour layer and which are metal. A port of the add-on's part_look,
// unover, inward, carry_in, add_part and turned, for passes made by CEditor's own renderer
// (utils/scene3dRender.js) instead of Cycles. Pure: images are Float32Arrays, one value or three a pixel.
//
// What a renderer without light bouncing between parts cannot give is not written: the light a part
// throws on what is beside it (the add-on's bounce maps) and a turning part's reflection in a metal.

import { writePsd } from 'ag-psd';

export const TURN_STEP = 27;
/** The angles a turning object is rendered at: from rest, a step at a time, out to a dial's ends. */
export const TURN_ANGLES = (() => {
  const count = Math.floor(135 / TURN_STEP + 1e-9);
  return Array.from({ length: count * 2 + 1 }, (_, i) => (i - count) * TURN_STEP);
})();
const XMP_NAMESPACE = 'https://github.com/Ted-juh/CEditor/ns/layers/1.0/';

// --- Light and colour ------------------------------------------------------------------------------

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const srgb = (x) => { const v = clamp01(x); return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; };
export const srgbBeyond = (x) => { const v = Math.max(0, x); return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; };
export const linear = (x) => { const v = clamp01(x); return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** Linear light as 8 bits over 1/256 to 256, a step a sixteenth of a doubling; 0 for none (the add-on's light_code). */
export const lightCode = (x) => (x >= 2 ** -8 ? Math.min(255, Math.max(1, Math.round((Math.log2(x) + 8) * 255 / 16))) : 0);
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// --- Images -------------------------------------------------------------------------------------------

/**
 * The opacities that stack `coverages` (bottom first, each rendered with the others held out) to
 * their sum: each part's opacity its coverage of what the parts above leave. `{ opacities, above, left }`.
 */
export function unover(coverages, n) {
  let left = new Float32Array(n).fill(1);
  const opacities = new Array(coverages.length);
  const above = new Array(coverages.length);
  for (let i = coverages.length - 1; i >= 0; i -= 1) {
    above[i] = left;
    const out = new Float32Array(n);
    const next = new Float32Array(n);
    for (let p = 0; p < n; p += 1) {
      out[p] = left[p] > 1e-4 ? clamp01(coverages[i][p] / left[p]) : 0;
      next[p] = left[p] * (1 - out[p]);
    }
    opacities[i] = out;
    left = next;
  }
  return { opacities, above, left };
}

/** How far into the pixels a part covers whole each is, as a share of `width` pixels: 0 at its edge, 1 that far in. */
export function inward(full, w, h, width = 3) {
  const depth = new Float32Array(w * h);
  let inside = Uint8Array.from(full, (v) => (v ? 1 : 0));
  for (let ring = 0; ring < width; ring += 1) {
    for (let p = 0; p < w * h; p += 1) depth[p] += inside[p];
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let all = 1;
        for (let dy = -1; dy <= 1 && all; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            if (!inside[yy * w + xx]) { all = 0; break; }
          }
        }
        next[y * w + x] = all;
      }
    }
    inside = next;
  }
  for (let p = 0; p < w * h; p += 1) depth[p] /= width;
  return depth;
}

/**
 * Values carried from the pixels where they are `known` into neighbouring ones `into`, ring by ring:
 * a layer under a part goes on a little way under its edge, so that scaled it still meets it.
 * `values`: arrays of 1 or 3 a pixel. Changed in place.
 */
export function carryIn(values, known, into, w, h, rings = 2) {
  let have = Uint8Array.from(known, (v) => (v ? 1 : 0));
  for (let ring = 0; ring < rings; ring += 1) {
    const fresh = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x;
        if (have[p] || !into[p]) continue;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          if (!dy && !dx) continue;
          const xx = x + dx; const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && have[yy * w + xx]) count += 1;
        }
        if (count) fresh.push(p);
      }
    }
    if (!fresh.length) break;
    for (const value of values) {
      const k = value.length / (w * h);
      const sums = fresh.map((p) => {
        const x = p % w; const y = (p - x) / w;
        const sum = new Float32Array(k); let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          if (!dy && !dx) continue;
          const xx = x + dx; const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || !have[yy * w + xx]) continue;
          for (let c = 0; c < k; c += 1) sum[c] += value[(yy * w + xx) * k + c];
          count += 1;
        }
        return sum.map((s) => s / count);
      });
      fresh.forEach((p, i) => { for (let c = 0; c < k; c += 1) value[p * k + c] = sums[i][c]; });
    }
    for (const p of fresh) have[p] = 1;
  }
  return values;
}

/**
 * An image of straight colour (`k` values a pixel) and its opacity turned `degrees` clockwise on
 * screen about `about` [x, y], premultiplied, through a Lanczos window three pixels wide: a frame
 * turned back to rest here is turned again by the browser, and two bilinear turns blur a narrow
 * part's highlight twice (the add-on's turned, sharp). Returns { colour, alpha }.
 */
export function turnImage(colour, alpha, w, h, degrees, about, k = 3) {
  const t = (degrees * Math.PI) / 180;
  const cos = Math.cos(t); const sin = Math.sin(t);
  const outColour = new Float32Array(w * h * k);
  const outAlpha = new Float32Array(w * h);
  const sinc = (x) => (Math.abs(x) < 1e-6 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
  const window = (d) => (Math.abs(d) < 3 ? sinc(d) * sinc(d / 3) : 0);
  const acc = new Float32Array(k);
  for (let qy = 0; qy < h; qy += 1) {
    for (let qx = 0; qx < w; qx += 1) {
      const cx = qx + 0.5 - about[0]; const cy = qy + 0.5 - about[1];
      const sx = about[0] + cx * cos + cy * sin - 0.5;
      const sy = about[1] - cx * sin + cy * cos - 0.5;
      const x0 = Math.floor(sx); const y0 = Math.floor(sy);
      const fx = sx - x0; const fy = sy - y0;
      acc.fill(0);
      let a = 0; let total = 0;
      for (let j = -2; j <= 3; j += 1) {
        const wy = window(fy - j);
        if (!wy) continue;
        const yy = y0 + j;
        for (let i = -2; i <= 3; i += 1) {
          const weight = wy * window(fx - i);
          if (!weight) continue;
          total += weight;
          const xx = x0 + i;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const p = yy * w + xx;
          const pa = alpha[p];
          a += pa * weight;
          for (let c = 0; c < k; c += 1) acc[c] += colour[p * k + c] * pa * weight;
        }
      }
      const q = qy * w + qx;
      const alphaOut = clamp01(total ? a / total : 0);
      outAlpha[q] = alphaOut;
      for (let c = 0; c < k; c += 1) {
        const premultiplied = Math.min(Math.max(total ? acc[c] / total : 0, 0), alphaOut * (k === 3 ? Infinity : 1));
        outColour[q * k + c] = alphaOut > 0 ? Math.max(0, premultiplied) / alphaOut : 0;
      }
    }
  }
  return { colour: outColour, alpha: outAlpha };
}

// --- An object's look ---------------------------------------------------------------------------------

/**
 * An object's look from its passes, straight, as the add-on's part_look gives it: `colour` its sRGB
 * colour, `shade` what the light does to it (up to the colour), `highlights` the light past that,
 * `glow` its own light, `whole` all of it (a lamp's without its glow), and in linear light `light`
 * (the light on it without its colour) and `gloss` (what it reflects whatever its colour), `bare` its
 * look without its glow. Passes: `alpha` the coverage; `colour`, `light`, `gloss`, `glow` linear,
 * per covered pixel.
 */
export function partLook(passes, n, { metal = false, lamp = false } = {}) {
  const out = {
    alpha: passes.alpha, colour: new Float32Array(n * 3), shade: new Float32Array(n * 3), highlights: new Float32Array(n * 3),
    glow: new Float32Array(n * 3), whole: new Float32Array(n * 3), light: passes.light, gloss: new Float32Array(n * 3), bare: new Float32Array(n * 3),
  };
  const beyond = metal ? srgbBeyond : srgb;
  for (let i = 0; i < n * 3; i += 1) {
    const c = passes.colour[i];
    const lit = c * passes.light[i];
    const bare = lit + Math.max(0, passes.gloss[i]);
    const total = bare + Math.max(0, passes.glow ? passes.glow[i] : 0);
    const e = srgb(c);
    const shade = e > 1e-4 ? clamp01(srgbBeyond(lit) / e) : 1;
    out.colour[i] = e;
    out.shade[i] = shade;
    out.highlights[i] = clamp01(beyond(bare) - e * shade);
    out.glow[i] = clamp01(srgb(total) - srgb(bare));
    out.whole[i] = srgb(lamp ? bare : total);
    out.bare[i] = bare;
    out.gloss[i] = Math.max(0, passes.gloss[i]);
  }
  return out;
}

// --- The layers ------------------------------------------------------------------------------------------

const to8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** Words that say what a name does, by the importer's words; the add-on keeps a lamp's body without them. */
const ROLE_WORDS = ['pivot', 'centre', 'center', 'axis', 'pressed', 'down', 'off', 'unlit', 'lamp', 'led', 'light', 'lit', 'glow', 'on',
  'fader', 'thumb', 'handle', 'slide', 'pointer', 'indicator', 'needle', 'rotor', 'marker', 'turns', 'rotate', 'rotates', 'track', 'slot', 'rail', 'groove'];
const nameWords = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
export const withoutRoleWords = (name, fallback) => nameWords(name).filter((w) => !ROLE_WORDS.includes(w)).join(' ') || fallback;

/**
 * The layers, bottom first, and what the file says about them.
 *
 * `objects`, bottom first: `{ name, motion, metal, passes, at }` — `name` as it is to be written (it
 * carries the word for what it does: "pointer", "top rotor", "lamp"); `motion` 'stays', 'rotor' (turns,
 * its light staying: a round body), 'turns' (rendered at each angle, `at` { angle: passes turned back
 * to rest }) or 'lamp'; `passes` at rest. `shadow`: the panel's darkness under what stays put (0 to 1
 * a pixel, linear), or null. `turnShadows`: { angle: darkness } a turning object casts on the panel and
 * on what stays put, already turned back about `shadowPivot`. `axis`: where turning objects turn.
 * Returns `{ layers: [{ name, rgba, blend, hidden }], colourOf: [[light, colour]], metal, linearEdges }`.
 */
export function buildSceneLayers({ width: w, height: h, objects, shadow = null, turnShadows = null, axis = null, shadowPivot = null }) {
  const n = w * h;
  const layers = [];
  const colourOf = [];
  const metal = [];
  const linearEdges = [];
  const add = (name, rgb, alpha, blend = 'normal', hidden = false) => {
    const rgba = new Uint8ClampedArray(n * 4);
    let any = false;
    for (let p = 0; p < n; p += 1) {
      const a = to8(typeof alpha === 'number' ? alpha : alpha[p]);
      if (!a) continue;
      any = true;
      rgba[p * 4] = to8(rgb ? rgb[p * 3] : 0);
      rgba[p * 4 + 1] = to8(rgb ? rgb[p * 3 + 1] : 0);
      rgba[p * 4 + 2] = to8(rgb ? rgb[p * 3 + 2] : 0);
      rgba[p * 4 + 3] = a;
    }
    if (any) layers.push({ name, rgba, blend, hidden });
  };
  const darkness = (ratioDark) => Float32Array.from(ratioDark, (d) => 1 - srgb(1 - clamp01(d)));

  // The shadow on the panel under everything.
  if (shadow) add('shadow', null, darkness(shadow));

  const still = objects.filter((o) => o.motion !== 'turns');
  const turning = objects.filter((o) => o.motion === 'turns');
  const looks = (list) => list.map((o) => partLook(o.passes, n, { metal: o.metal, lamp: o.motion === 'lamp' }));

  const writeGroup = (group) => {
    if (!group.length) return;
    const rest = looks(group);
    const { opacities, above } = unover(rest.map((look) => look.alpha), n);
    group.forEach((o, index) => {
      let look = rest[index];
      let opacity = opacities[index];
      // Under the parts above it, where they cover the pixel whole, it goes on a little way past its edge.
      const known = Uint8Array.from(opacity, (v) => (v > 1e-3 ? 1 : 0));
      const into = Uint8Array.from(above[index], (v) => (v < 1e-3 ? 1 : 0));
      const keys = ['colour', 'shade', 'highlights', 'glow', 'whole', 'light', 'gloss', 'bare'];
      const copies = [Float32Array.from(opacity), ...keys.map((key) => Float32Array.from(look[key]))];
      carryIn(copies, known, into, w, h);
      opacity = copies[0];
      look = { ...look, ...Object.fromEntries(keys.map((key, i) => [key, copies[i + 1]])) };
      const at = o.motion === 'turns' && o.at ? Object.fromEntries(Object.entries(o.at).map(([angle, passes]) => {
        const seen = partLook(passes, n, { metal: o.metal });
        // Where the part turned back does not quite cover what it covers at rest, its look at rest.
        for (const key of ['colour', 'shade', 'highlights', 'glow', 'whole', 'light', 'gloss', 'bare']) {
          for (let p = 0; p < n; p += 1) if (passes.alpha[p] <= 0.5) for (let c = 0; c < 3; c += 1) seen[key][p * 3 + c] = look[key][p * 3 + c];
        }
        return [Number(angle), seen];
      })) : null;
      addPart(o, look, opacity, at);
    });
  };

  const addPart = (o, look, opacity, at) => {
    const lamp = o.motion === 'lamp';
    const stillName = lamp ? withoutRoleWords(o.name, 'lens') : o.motion === 'rotor' ? withoutRoleWords(o.name, 'cap') : o.name;
    const whole = new Uint8Array(n);
    for (let p = 0; p < n; p += 1) whole[p] = opacity[p] > 254.5 / 255 && look.alpha[p] > 254.5 / 255 ? 1 : 0;
    const depth = inward(whole, w, h);
    const colourLayer = (seen) => {
      const out = new Float32Array(n * 3);
      for (let p = 0; p < n; p += 1) {
        const d = depth[p];
        for (let c = 0; c < 3; c += 1) {
          const i = p * 3 + c;
          if (d >= 1) { out[i] = seen.colour[i]; continue; }
          const glow = lamp ? 0 : seen.glow[i];
          const shading = 1 - d + d * seen.shade[i];
          out[i] = clamp01((seen.whole[i] - d * (seen.highlights[i] + glow)) / Math.max(shading, 1e-4));
        }
      }
      return out;
    };
    const drawnOf = (colour, alpha) => {
      let top = 0;
      for (let p = 0; p < n; p += 1) top = Math.max(top, to8(alpha[p]));
      const picked = [[], [], []];
      for (let p = 0; p < n; p += 1) if (to8(alpha[p]) >= top - 2 && top > 0) for (let c = 0; c < 3; c += 1) picked[c].push(to8(colour[p * 3 + c]));
      return picked.map((values) => { values.sort((a, b) => a - b); return (values[values.length >> 1] ?? 0) / 255; });
    };
    const addLight = (name, suffix, seen, colour, alpha, drawn) => {
      const covered = Float32Array.from(alpha, (v) => (to8(v) > 0 ? 1 : 0));
      const lighting = new Float32Array(n * 3);
      const gloss = new Float32Array(n * 3);
      for (let p = 0; p < n; p += 1) {
        const inside = to8(depth[p]) >= 255;
        for (let c = 0; c < 3; c += 1) {
          const i = p * 3 + c;
          const own = inside ? linear(to8(colour[i]) / 255) : linear(drawn[c]);
          lighting[i] = lightCode(seen.light[i]) / 255;
          gloss[i] = lightCode(Math.max(0, seen.bare[i] - own * seen.light[i])) / 255;
        }
      }
      add(`${name} lighting${suffix}`, lighting, covered, 'normal', true);
      add(`${name} gloss${suffix}`, gloss, covered, 'normal', true);
    };
    const angleName = (angle) => `${angle}`;
    let colourName;
    if (at) {
      colourName = o.name;
      const restDrawn = drawnOf(colourLayer(look), opacity);
      for (const angle of TURN_ANGLES) {
        const seen = angle ? at[angle] : look;
        if (!seen) continue;
        const layer = colourLayer(seen);
        add(`${o.name} at ${angleName(angle)}`, layer, opacity, 'normal', angle !== 0);
        addLight(o.name, ` at ${angleName(angle)}`, seen, layer, opacity, restDrawn);
      }
    } else {
      colourName = lamp ? stillName : o.name;
      const layer = colourLayer(look);
      add(colourName, layer, opacity);
      addLight(colourName, '', look, layer, opacity, drawnOf(layer, opacity));
      if (o.motion === 'stays') linearEdges.push(colourName);
    }
    colourOf.push([`${stillName} shading`, colourName], [`${stillName} highlights`, colourName]);
    let metalShare = 0; let coveredCount = 0;
    for (let p = 0; p < n; p += 1) if (look.alpha[p] > 0.5) { coveredCount += 1; metalShare += o.metal ? 1 : 0; }
    if (coveredCount && metalShare / coveredCount > 0.5) metal.push(colourName);
    const insideAlpha = depth;
    if (at) {
      const shadesFlat = TURN_ANGLES.every((angle) => {
        const seen = angle ? at[angle] : look;
        if (!seen) return true;
        for (let p = 0; p < n; p += 1) if (insideAlpha[p] > 0) for (let c = 0; c < 3; c += 1) if (seen.shade[p * 3 + c] < 1 - 1 / 255) return false;
        return true;
      });
      for (const angle of TURN_ANGLES) {
        const seen = angle ? at[angle] : look;
        if (!seen) continue;
        if (!shadesFlat) add(`${stillName} shading at ${angleName(angle)}`, inside(seen.shade, insideAlpha), insideAlpha, 'multiply', angle !== 0);
      }
      for (const angle of TURN_ANGLES) {
        const seen = angle ? at[angle] : look;
        if (seen) add(`${stillName} highlights at ${angleName(angle)}`, seen.highlights, insideAlpha, 'linear dodge', angle !== 0);
      }
      return;
    }
    let shaded = false;
    for (let p = 0; p < n && !shaded; p += 1) if (insideAlpha[p] > 0) for (let c = 0; c < 3; c += 1) if (look.shade[p * 3 + c] < 1 - 1 / 255) { shaded = true; break; }
    if (shaded) add(`${stillName} shading`, inside(look.shade, insideAlpha), insideAlpha, 'multiply');
    add(`${stillName} highlights`, look.highlights, insideAlpha, 'linear dodge');
    if (lamp) {
      // Its glow, shown when it is lit, out to where it covers the pixel.
      const glowAlpha = new Float32Array(n);
      const glowColour = new Float32Array(n * 3);
      for (let p = 0; p < n; p += 1) {
        const strongest = Math.max(look.glow[p * 3], look.glow[p * 3 + 1], look.glow[p * 3 + 2]) * opacity[p];
        if (strongest < 0.5 / 255) continue;
        glowAlpha[p] = strongest;
        for (let c = 0; c < 3; c += 1) glowColour[p * 3 + c] = (look.glow[p * 3 + c] * opacity[p]) / strongest;
      }
      add(`${o.name} lit`, glowColour, glowAlpha, 'linear dodge');
    }
  };
  // The shading is a multiply: where nothing is inside, white.
  const inside = (shade, alpha) => Float32Array.from(shade, (v, i) => (alpha[Math.floor(i / 3)] > 0 ? v : 1));

  writeGroup(still);
  if (turning.length && turnShadows) {
    const name = `${turning[0].name} shadow`;
    for (const angle of TURN_ANGLES) {
      if (turnShadows[angle]) add(`${name} at ${angle}`, null, darkness(turnShadows[angle]), 'normal', angle !== 0);
    }
  }
  writeGroup(turning);

  const mark = (name, point) => {
    if (!point) return;
    const alpha = new Float32Array(n);
    const px = Math.round(point[0]); const py = Math.round(point[1]);
    for (let y = Math.max(0, py - 1); y < Math.min(h, py + 1); y += 1) for (let x = Math.max(0, px - 1); x < Math.min(w, px + 1); x += 1) alpha[y * w + x] = 1;
    add(name, Float32Array.from({ length: n * 3 }, () => 1), alpha, 'normal', true);
  };
  if (turning.length) {
    mark('pivot', axis);
    if (turnShadows && shadowPivot) mark(`${turning[0].name} shadow pivot`, shadowPivot);
  }
  const written = new Set(layers.map((layer) => layer.name));
  const has = (base) => written.has(base) || [...written].some((name) => name.startsWith(`${base} at `));
  return {
    layers,
    colourOf: colourOf.filter(([lightName, colour]) => has(lightName) && has(colour)),
    metal: metal.filter((name) => has(name)),
    linearEdges: linearEdges.filter((name) => written.has(name)),
  };
}

// --- The file ------------------------------------------------------------------------------------------

const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The file's XMP, as the add-on writes it. */
export function sceneXmp({ linearEdges = [], colourOf = [], metal = [] }) {
  const bag = (items) => `<rdf:Bag>${items.map((item) => `<rdf:li>${escape(item)}</rdf:li>`).join('')}</rdf:Bag>`;
  return '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">'
    + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + `<rdf:Description rdf:about="" xmlns:ceditor="${XMP_NAMESPACE}">`
    + `<ceditor:linearEdges>${bag(linearEdges)}</ceditor:linearEdges>`
    + (colourOf.length ? `<ceditor:colourOf>${bag(colourOf.map(([lightName, colour]) => `${lightName}=${colour}`))}</ceditor:colourOf>` : '')
    + (metal.length ? `<ceditor:metal>${bag(metal)}</ceditor:metal>` : '')
    + '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
}

/** The layers as a Photoshop file's bytes, for the Photoshop component import. */
export function scenePsdBytes({ width, height, layers, linearEdges = [], colourOf = [], metal = [] }) {
  const psd = {
    width,
    height,
    imageResources: { xmpMetadata: sceneXmp({ linearEdges, colourOf, metal }) },
    children: layers.map((layer) => ({
      name: layer.name,
      hidden: layer.hidden === true,
      blendMode: layer.blend,
      left: 0,
      top: 0,
      imageData: { width, height, data: layer.rgba },
    })),
  };
  return new Uint8Array(writePsd(psd, { generateThumbnail: false }));
}
