/**
 * effectLooks.js — named looks for the Effects tab's fourth column.
 *
 * A preset gallery exists because most people want a look, not eleven parameters, and because the
 * eleven parameters are unreadable until you have seen what a few combinations of them do. The
 * thumbnails render the control's OWN text rather than the word "Sample", so what you click is
 * what you get.
 *
 * A look is a full patch, not a partial one: applying it switches OFF every effect it does not
 * use. A preset that only adds is a preset you cannot get out of — apply two and you have a mess
 * with no way back except undo — so `enableOnly` builds the off-switches for whatever the look
 * does not name. That makes the shelf a set of destinations rather than a set of increments.
 *
 * Pure: patches only, no Svelte and no DOM.
 */
import { TEXT_EFFECTS, TEXT_UNORDERED, TEXT_ROOT, COMPONENT_ROOT, COMPONENT_GROUPS } from './effectStack.js';
import { deepClone } from './deepClone.js';

/** Every text effect switched off, as a patch. The base every look is built on. */
function textAllOff() {
  const patch = {};
  for (const d of [...TEXT_EFFECTS, ...TEXT_UNORDERED]) patch[`${TEXT_ROOT}.${d.enabled}`] = false;
  return patch;
}

/** `props` are bare field names on Text.Effects; the enable flags are added for you. */
function textLook(id, label, enabled, props = {}) {
  const patch = textAllOff();
  for (const key of enabled) {
    const descriptor = [...TEXT_EFFECTS, ...TEXT_UNORDERED].find((entry) => entry.key === key);
    if (descriptor) patch[`${TEXT_ROOT}.${descriptor.enabled}`] = true;
  }
  for (const [key, value] of Object.entries(props)) patch[`${TEXT_ROOT}.${key}`] = value;
  return { id, label, domain: 'text', patch };
}

export const TEXT_LOOKS = [
  textLook('none', 'None', []),

  textLook('outlined', 'Outlined', ['outline'], {
    outlineColour: 'FF101418',
    outlineThickness: 1.4,
    outlineWidth: 1.4,
    outlineDistance: 0,
    outlinePlacement: 'outer',
    outlineJoin: 'round',
    outlineDashEnabled: false,
  }),

  textLook('neon', 'Neon', ['glow', 'outline'], {
    glowColour: 'CC14B8A6',
    glowSize: 9,
    glowIntensity: 1.6,
    outlineColour: 'FF8FEDE3',
    outlineThickness: 0.8,
    outlineWidth: 0.8,
    outlinePlacement: 'outer',
    outlineJoin: 'round',
  }),

  textLook('softdrop', 'Soft drop', ['shadow'], {
    shadowStyle: 'soft',
    shadowColour: '99000000',
    shadowOffsetX: 1,
    shadowOffsetY: 2,
    shadowBlur: 4,
  }),

  textLook('longshadow', 'Long shadow', ['shadow'], {
    shadowStyle: 'long',
    shadowColour: 'BB0B0F13',
    shadowOffsetX: 1,
    shadowOffsetY: 1,
    shadowDistance: 22,
    shadowSteps: 24,
  }),

  // Engraved and Letterpress are the same two layers with the light coming from opposite sides,
  // which is worth knowing when you are choosing between them.
  textLook('engraved', 'Engraved', ['innerShadow', 'shadow'], {
    innerShadowColour: 'CC000000',
    innerShadowOffsetX: 0,
    innerShadowOffsetY: 1,
    innerShadowBlur: 1,
    shadowStyle: 'soft',
    shadowColour: '55FFFFFF',
    shadowOffsetX: 0,
    shadowOffsetY: 1,
    shadowBlur: 0,
  }),

  textLook('letterpress', 'Letterpress', ['innerShadow', 'shadow'], {
    innerShadowColour: '99FFFFFF',
    innerShadowOffsetX: 0,
    innerShadowOffsetY: -1,
    innerShadowBlur: 0,
    shadowStyle: 'soft',
    shadowColour: 'AA05080B',
    shadowOffsetX: 0,
    shadowOffsetY: 1,
    shadowBlur: 1,
  }),

  textLook('chrome', 'Chrome', ['bevel', 'outline', 'shadow'], {
    bevelStyle: 'emboss',
    bevelDepth: 2,
    bevelHighlightColour: 'CCFFFFFF',
    bevelShadowColour: 'AA0A0E12',
    outlineColour: 'FF6E7A82',
    outlineThickness: 0.6,
    outlineWidth: 0.6,
    outlinePlacement: 'outer',
    shadowStyle: 'soft',
    shadowColour: '88000000',
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    shadowBlur: 3,
  }),

  textLook('ghost', 'Ghost', ['outline', 'innerGlow'], {
    outlineColour: 'AAB9C8D4',
    outlineThickness: 1,
    outlineWidth: 1,
    outlinePlacement: 'center',
    innerGlowColour: '4415181B',
    innerGlowSize: 4,
  }),
];

function componentAllOff() {
  const patch = {};
  for (const group of COMPONENT_GROUPS) {
    if (group.enabled) patch[`${group.root}.${group.enabled}`] = false;
  }
  return patch;
}

/** Component looks write the whole `Shadows.items` array, because that array IS the shadow stack —
 *  there is no per-item flag to flip from out here. */
function componentLook(id, label, { shadows = [], bevel = null, filters = null, blend = 'normal' } = {}) {
  const patch = { ...componentAllOff() };
  patch[`${COMPONENT_ROOT}.Shadows.items`] = shadows;
  patch[`${COMPONENT_ROOT}.Blend.mode`] = blend;
  if (bevel) {
    patch[`${COMPONENT_ROOT}.Bevel.enabled`] = true;
    for (const [key, value] of Object.entries(bevel)) patch[`${COMPONENT_ROOT}.Bevel.${key}`] = value;
  }
  const neutral = { blur: 0, brightness: 100, contrast: 100, saturation: 100, hueRotate: 0, grayscale: 0, sepia: 0, invert: 0 };
  for (const [key, value] of Object.entries({ ...neutral, ...(filters ?? {}) })) {
    patch[`${COMPONENT_ROOT}.Filters.${key}`] = value;
  }
  return { id, label, domain: 'component', patch };
}

export const COMPONENT_LOOKS = [
  componentLook('flat', 'Flat', {}),
  componentLook('raised', 'Raised', {
    shadows: [{ enabled: true, type: 'drop', offsetX: 0, offsetY: 2, blur: 5, spread: 0, colour: '77000000' }],
    bevel: { style: 'outer-bevel', depth: 100, size: 3, softness: 1, angle: 135, highlightColour: 'FFFFFF', highlightOpacity: 60, shadowColour: '000000', shadowOpacity: 60 },
  }),
  componentLook('sunken', 'Sunken', {
    shadows: [{ enabled: true, type: 'inner', offsetX: 0, offsetY: 2, blur: 4, spread: 0, colour: '99000000' }],
  }),
  componentLook('halo', 'Halo', {
    shadows: [{ enabled: true, type: 'outer-glow', offsetX: 0, offsetY: 0, blur: 12, spread: 1, colour: '8814B8A6' }],
  }),
  componentLook('dimmed', 'Dimmed', { filters: { brightness: 55, saturation: 70 } }),
  componentLook('mono', 'Mono', { filters: { grayscale: 100 } }),
];

export const LOOKS_BY_DOMAIN = {
  text: TEXT_LOOKS,
  component: COMPONENT_LOOKS,
  // Lighting has no looks: backlight and dot pitch describe one physical screen, so a "look" would
  // just be a second name for two numbers. An empty shelf is honest; a shelf of near-identical
  // thumbnails is not.
  lighting: [],
};

export function looksFor(domain) {
  return LOOKS_BY_DOMAIN[domain] ?? [];
}

/**
 * Apply a look to a control, returning the patched clone. Used by the shelf's thumbnails to draw
 * the look on the real control before anyone commits to it, and by the click handler through
 * `look.patch`.
 */
export function previewLook(control, look) {
  if (!control || !look) return control;
  const clone = deepClone(control);
  for (const [path, value] of Object.entries(look.patch)) {
    const parts = path.split('.');
    let node = clone;
    for (const part of parts.slice(0, -1)) {
      node._children = node._children ?? {};
      node._children[part] = node._children[part] ?? {};
      node = node._children[part];
    }
    node[parts.at(-1)] = deepClone(value);
  }
  return clone;
}

/** Which look, if any, the control currently matches — so the shelf can show a tick rather than
 *  leaving you guessing whether the last click took. */
export function matchLook(control, domain) {
  for (const look of looksFor(domain)) {
    const matches = Object.entries(look.patch).every(([path, value]) => {
      const parts = path.split('.');
      let node = control;
      for (const part of parts.slice(0, -1)) node = node?._children?.[part];
      const actual = node?.[parts.at(-1)];
      if (Array.isArray(value)) return JSON.stringify(actual ?? []) === JSON.stringify(value);
      return actual === value;
    });
    if (matches) return look.id;
  }
  return '';
}
