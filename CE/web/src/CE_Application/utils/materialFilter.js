/**
 * materialFilter.js — the lit material, as numbers.
 *
 * A material is an SVG filter: fractal noise, read as a height map by a distant lamp, and the
 * resulting light multiplied onto whatever the surface already paints. The same six primitives
 * drew every board on the control-set mockups (docs/design/control-sets.md); this module is the
 * port. It is pure — it turns an `Effects.Material` node and a lamp into the attribute values the
 * filter primitives take — and `CE_Panel/components/MaterialFilter.svelte` writes the markup.
 *
 * One lamp, everywhere. A material node normally does not carry its own light: it says
 * `lampFollowsSet: true` and takes the panel's control set's `lamp`, so a knob, the button beside
 * it and the panel behind both are lit from the same side. A surface that pins its own lamp
 * (`lampFollowsSet: false`) uses its own two numbers. Azimuth is in degrees as feDistantLight
 * takes it — 0 along +x, 90 along +y (down the screen) — so 225 is the upper left.
 */

export const DEFAULT_LAMP = Object.freeze({ azimuth: 225, elevation: 48 });

export const MATERIAL_KINDS = ['blast', 'brushed', 'leather', 'hammer', 'rubber', 'glass'];

// The recipes, from the mockup generator. `freq` is feTurbulence's baseFrequency (two values make
// the noise anisotropic — brushed metal is streaks, not grain); `scale` is the relief depth;
// `spec` the specular constant (0 = matte); `blur` softens the height map before it is lit, which
// is what turns grain into leather.
const RECIPES = {
  blast:   { freq: [0.95, 0.95],  octaves: 2, scale: 0.55, spec: 0.20, seed: 3,  blur: 0 },
  brushed: { freq: [0.004, 0.95], octaves: 1, scale: 0.35, spec: 0.50, seed: 11, blur: 0 },
  leather: { freq: [0.05, 0.05],  octaves: 5, scale: 3.2,  spec: 0.35, seed: 5,  blur: 0.4 },
  hammer:  { freq: [0.075, 0.075], octaves: 2, scale: 2.6, spec: 0.45, seed: 9,  blur: 0.7 },
  rubber:  { freq: [1.4, 1.4],    octaves: 2, scale: 0.35, spec: 0.0,  seed: 8,  blur: 0 },
  glass:   { freq: [0.03, 0.03],  octaves: 2, scale: 0.6,  spec: 1.2,  seed: 6,  blur: 2 },
};

const SPECULAR_EXPONENT = 18;

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function materialRecipe(kind) {
  return RECIPES[String(kind ?? '').toLowerCase()] ?? RECIPES.blast;
}

/** Whether a Material node draws anything at all. */
export function materialActive(material) {
  return material?.enabled === true && materialRecipe(material.kind) != null;
}

/** The lamp a material is lit by: its own when pinned, otherwise the set's, otherwise the default. */
export function resolveMaterialLamp(material, setLamp = null) {
  if (material && material.lampFollowsSet === false) {
    return { azimuth: num(material.lampAzimuth, DEFAULT_LAMP.azimuth), elevation: num(material.lampElevation, DEFAULT_LAMP.elevation) };
  }
  return {
    azimuth: num(setLamp?.azimuth, DEFAULT_LAMP.azimuth),
    elevation: num(setLamp?.elevation, DEFAULT_LAMP.elevation),
  };
}

/**
 * Everything the filter primitives need, as plain numbers. `null` when the material is off, so a
 * renderer can `{#if}` on the result and never build a filter for nothing.
 */
export function materialPrimitives(material, setLamp = null) {
  if (!materialActive(material)) return null;
  const recipe = materialRecipe(material.kind);
  const strength = Math.max(0, num(material.strength, 100)) / 100;
  const shine = Math.max(0, num(material.shine, 100)) / 100;
  const grain = Math.max(0.01, num(material.grain, 100)) / 100;
  const lamp = resolveMaterialLamp(material, setLamp);
  return {
    kind: String(material.kind ?? 'blast').toLowerCase(),
    baseFrequency: recipe.freq.map((f) => Number((f * grain).toFixed(4))).join(' '),
    numOctaves: recipe.octaves,
    seed: recipe.seed,
    blur: recipe.blur,
    surfaceScale: Number((recipe.scale * strength).toFixed(3)),
    specularConstant: Number((recipe.spec * shine).toFixed(3)),
    specularExponent: SPECULAR_EXPONENT,
    azimuth: lamp.azimuth,
    elevation: lamp.elevation,
  };
}
