// Section designs: what a control set does to the controls that hold other controls.
//
// A Group, a Container, a tab page and a scroll area are the panel's sections. Every set used to
// draw them as an enlarged button: controlSetCoverage copied the button's face (its gradient, its
// bevel, its material) onto them and filled them with `control.field`, the colour of a value
// window. On seven sets that window is pale, so a section was a cream slab, and the panel's own
// lettering (a Label, the Group's title) is chosen to read on the dark panel: cream on cream, about
// 1:1, the moment a label had no plate of its own to carry it.
//
// A section is part of the panel, not a control on it. So it takes its colour from the panel:
// `section.surface` is the panel shifted a step further from the lettering, which only ever adds
// contrast, so everything that reads on the panel reads in a section. And its frame is the set's
// decision, one of five, every property one the editor's panels expose:
//
//   well      a recess in the panel: the section surface, a hairline edge, an inset shadow.
//   milled    the metal sets' well: tighter corners, a harder inset, the panel's own finish.
//   glow      the lit sets: a glass face and a hairline lit in the accent.
//   piping    the leather sets: no face, a cream piping line around the section.
//   hairline  the line-work set: no face, one ink line.
//
// Graphite has none: its sections are what they always were.

import { argb, darken, lighten, mix } from './controlSetDesigns.js';
import { labelTreatmentFor } from './labelDesigns.js';

export const SECTION_TYPES = ['Group', 'Container', 'TabContainer', 'ScrollArea'];
export const SECTION_TREATMENTS = ['well', 'milled', 'glow', 'piping', 'hairline'];

const PIPING = new Set(['tolex', 'saddle']);

// A token's literal within the set itself, aliases followed (see labelDesigns.js for why not
// resolveToken: the base set does not exist yet while the built-ins are being made).
function literal(set, name) {
  let value = set.tokens?.[name];
  for (let i = 0; i < 8 && /^\{.+\}$/.test(String(value ?? '')); i += 1) value = set.tokens?.[String(value).slice(1, -1)];
  return /^[0-9A-F]{6}([0-9A-F]{2})?$/i.test(String(value ?? '')) ? String(value).toUpperCase() : null;
}

function luminance(hex) {
  const six = String(hex).slice(-6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(six.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The section surface a set implies: its panel, moved a step away from its lettering. Light
 * lettering on a dark panel gets a darker well; dark lettering on a light panel gets a lighter face.
 * Either way the lettering's contrast only grows, so the rule "text roles read on the panel" carries
 * into every section without a second set of inks.
 */
export function sectionSurfaceFor(set) {
  const panel = literal(set, 'panel.surface');
  const ink = literal(set, 'text.primary');
  if (!panel || !ink) return null;
  const lightLettering = luminance(ink) > luminance(panel);
  return argb(lightLettering ? darken(panel, 0.22) : lighten(panel, 0.35));
}

/** `section.surface` for a set that does not name one; Graphite's is its control surface. */
export function withSectionSurface(set, { fallback = null } = {}) {
  if (set?.tokens?.['section.surface'] !== undefined) return set;
  const derived = set?.id === 'graphite' ? '{surface}' : (sectionSurfaceFor(set) ?? fallback);
  if (!derived) return set;
  return { ...set, tokens: { ...set.tokens, 'section.surface': derived } };
}

export function sectionTreatmentFor(set) {
  if (!set || set.id === 'graphite') return null;
  const label = labelTreatmentFor(set);
  if (label === 'frame') return 'hairline';
  if (label === 'backlit') return 'glow';
  if (PIPING.has(set.id)) return 'piping';
  if (label === 'engraved') return 'milled';
  return 'well';
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The set's own inks first, then plain dark and light: whichever reads best on `face`. */
function inkFor(set, face) {
  if (!face) return '{text.inverse}';
  const candidates = [['{text.inverse}', literal(set, 'text.inverse')], ['{text.primary}', literal(set, 'text.primary')], ['FF15171A', 'FF15171A'], ['FFF6F7F9', 'FFF6F7F9']]
    .filter(([, value]) => value);
  return candidates.reduce((best, entry) => (contrast(entry[1], face) > contrast(best[1], face) + 0.01 ? entry : best))[0];
}

const shadow = (type, offsetY, blur, colour, spread = 0) => ({ enabled: true, type, offsetX: 0, offsetY, blur, spread, colour });

/** The frame properties one section treatment writes. `radius` is the set's own corner. */
export function sectionFrame(set, radius = 8) {
  const treatment = sectionTreatmentFor(set);
  if (!treatment) return null;
  const panel = literal(set, 'panel.surface') ?? 'FF202020';
  const ink = literal(set, 'text.primary') ?? 'FFFFFFFF';
  const accent = literal(set, 'accent') ?? ink;
  const material = set.panel?.material;
  const finish = material?.enabled !== false && material?.kind
    ? { 'Background.Effects.Material.enabled': true, 'Background.Effects.Material.kind': material.kind,
      'Background.Effects.Material.strength': material.strength ?? 50, 'Background.Effects.Material.shine': material.shine ?? 40,
      'Background.Effects.Material.grain': material.grain ?? 100 }
    : { 'Background.Effects.Material.enabled': false };
  const flat = { 'Background.Fill.gradientEnabled': false, 'Effects.Bevel.enabled': false };
  if (treatment === 'well') {
    return { ...flat, ...finish,
      'Background.Fill.colour': '{section.surface}',
      'Background.Border.enabled': true, 'Background.Border.thickness': 1,
      'Background.Border.colour': argb(mix(panel, ink, 0.16), '99'),
      'Background.Corners.radius': Math.max(4, Math.min(radius, 14)),
      'Effects.Shadows.items': [shadow('inner', 2, 6, '73000000')] };
  }
  if (treatment === 'milled') {
    return { ...flat, ...finish,
      'Background.Fill.colour': '{section.surface}',
      'Background.Border.enabled': true, 'Background.Border.thickness': 1,
      'Background.Border.colour': argb(darken(panel, 0.35), 'B3'),
      'Background.Corners.radius': Math.max(2, Math.min(radius, 5)),
      'Effects.Shadows.items': [shadow('inner', 2, 3, '8C000000'), shadow('drop', 1, 0, argb(lighten(panel, 0.5), '99'))] };
  }
  if (treatment === 'glow') {
    return { ...flat, 'Background.Effects.Material.enabled': false,
      'Background.Fill.colour': '{section.surface}',
      'Background.Border.enabled': true, 'Background.Border.thickness': 1,
      'Background.Border.colour': argb(accent, '8C'),
      'Background.Corners.radius': Math.max(6, Math.min(radius, 16)),
      'Effects.Shadows.items': [shadow('outer-glow', 0, 10, argb(accent, '40'))] };
  }
  if (treatment === 'piping') {
    return { ...flat, 'Background.Effects.Material.enabled': false,
      'Background.Fill.colour': '00000000',
      'Background.Border.enabled': true, 'Background.Border.thickness': 2,
      'Background.Border.colour': '{text.primary}',
      'Background.Corners.radius': 14,
      'Effects.Shadows.items': [shadow('drop', 2, 3, '99000000')] };
  }
  // hairline
  return { ...flat, 'Background.Effects.Material.enabled': false,
    'Background.Fill.colour': '00000000',
    'Background.Border.enabled': true, 'Background.Border.thickness': 1,
    'Background.Border.colour': '{text.primary}',
    'Background.Corners.radius': 0,
    'Effects.Shadows.items': [] };
}

const isFrameKey = (key) => key.startsWith('Background.') || key.startsWith('Effects.');

/**
 * The set with its sections designed. The frame the set's families gave a section (the button's,
 * copied) is replaced, not merged: a section is not a button. Everything else a family says about a
 * section (its lettering's face, a tab strip's appearance, a scrollbar) stays. A full-panel
 * Background block loses the factory's white 2px border, since it is the panel's face, not a frame.
 */
export function withSectionDesign(set) {
  // The set's own corner: the one its families already gave a section, which is its design
  // direction's radius (controlSetCoverage).
  const radius = Number(set.families?.Group?.component?.['Background.Corners.radius'] ?? 8);
  const frame = sectionFrame(set, Number.isFinite(radius) ? radius : 8);
  if (!frame) return set;
  const families = { ...set.families };
  for (const type of SECTION_TYPES) {
    const current = families[type]?.component ?? {};
    const kept = Object.fromEntries(Object.entries(current).filter(([key]) => !isFrameKey(key)));
    const component = { ...kept, 'Text.Fill.colour': '{text.primary}', ...frame };
    if (type === 'TabContainer') {
      // The strip and the idle tabs are the section, and idle lettering reads on it like any
      // lettering in a section. The chosen tab keeps the set's checked surface, with whichever
      // ink reads best on it: `text.inverse` was assumed, and on twelve sets it sat under 3:1.
      Object.assign(component, {
        'TabContainer.stripColour': '{section.surface}',
        'TabContainer.tabColour': '{section.surface}',
        'TabContainer.labelColour': '{text.primary}',
        'TabContainer.activeLabelColour': inkFor(set, literal(set, 'surface.checked')),
      });
    }
    families[type] = { ...families[type], component };
  }
  families.Background = { ...families.Background, component: { ...(families.Background?.component ?? {}), 'Background.Border.enabled': false } };
  return { ...set, families };
}
