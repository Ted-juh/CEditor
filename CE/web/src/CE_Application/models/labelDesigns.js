// Label designs: what a control set does to the Label control.
//
// Knobs, sliders and buttons each have a design per set: a cap, a pointer, a track, a finish. The
// Label had none. A set changed its font and its text colour and nothing else, so every set drew
// the same white 2px box, which is the default border every control inherits, a literal and not a
// token, and nothing on real hardware looks like it: a panel's legends are printed onto the panel.
// The design record called the boards' engraved and backlit labels "a further step"; this is it.
//
// Five treatments, each written as family-patch properties the editor's panels expose (so a label
// under any set can be rebuilt by hand, as controlSetDesigns.test.js insists), and each applied
// under the family rule: only where a Label still holds its factory value, so an author who gave a
// label a border or a colour keeps it.
//
//   silkscreen  no plate, no box: the lettering sits on the panel. The default for every set.
//   engraved    silkscreen, cut into a metal panel: a one-pixel lip, light under dark lettering
//               and dark over light. Every set whose panel material is metal (blast, brushed,
//               hammertone) unless it carries plates.
//   backlit     silkscreen, lit from behind: the lettering glows in its own colour.
//   plate       a brass plate with dark engraved lettering, for the wooden hi-fi and valve sets.
//   frame       a hairline in the ink colour around the lettering, for the line-work set.
//
// Graphite has no Label design: it is the look every existing document has.

import { argb, darken, lighten } from './controlSetDesigns.js';

// Which sets take which treatment beyond silkscreen. Short enough to read, which is the point: it
// is the design decision per set. The metal rule below covers the engraved sets.
const BACKLIT = new Set(['neon', 'backlit', 'obsidian', 'phosphor', 'edge-light', 'floating-halo', 'gemstone']);
const PLATE = new Set(['walnut', 'valve', 'saddle', 'valve-console', 'brassworks']);
const FRAME = new Set(['blueprint']);
const METAL = new Set(['blast', 'brushed', 'hammer']);

export const LABEL_TREATMENTS = ['silkscreen', 'engraved', 'backlit', 'plate', 'frame'];

export function labelTreatmentFor(set) {
  if (!set || set.id === 'graphite') return null;
  if (FRAME.has(set.id)) return 'frame';
  if (PLATE.has(set.id)) return 'plate';
  if (BACKLIT.has(set.id)) return 'backlit';
  const material = set.panel?.material;
  if (material?.enabled !== false && METAL.has(material?.kind)) return 'engraved';
  return 'silkscreen';
}

// A token's literal within the set itself, aliases followed. The built-ins define every role by
// the time this runs, and controlSets.js's resolveToken cannot be used here: it falls back to the
// base set, which does not exist yet while the built-ins are being made.
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

const BRASS = 'C8A45A';
const PLATE_INK = 'FF2A2116';

/** The Label family patch a set gets, or null for none. */
export function labelFamily(set) {
  const treatment = labelTreatmentFor(set);
  if (!treatment) return null;
  const panel = literal(set, 'panel.surface') ?? 'FF202020';
  const ink = literal(set, 'text.primary') ?? 'FFFFFFFF';
  // No plate and no box: the lettering on the panel.
  const bare = { 'Background.Fill.colour': '00000000', 'Background.Border.enabled': false };
  if (treatment === 'silkscreen') return { component: bare };
  if (treatment === 'engraved') {
    // Cut into the metal: the lit lip of the cut sits under dark lettering, the cut's own shadow
    // over light lettering.
    const lightLettering = luminance(ink) > luminance(panel);
    return { component: {
      ...bare,
      'Text.Effects.shadowEnabled': true,
      'Text.Effects.shadowStyle': 'soft',
      'Text.Effects.shadowOffsetX': 0,
      'Text.Effects.shadowOffsetY': lightLettering ? -1 : 1,
      'Text.Effects.shadowBlur': 0,
      'Text.Effects.shadowColour': lightLettering ? 'A6000000' : argb(lighten(panel, 0.6), 'CC'),
    } };
  }
  if (treatment === 'backlit') {
    // Tight and bright rather than wide and soft: the glow is drawn inside the label's own box, and
    // a halo wider than a caption's line is cut square at the box's edges.
    return { component: {
      ...bare,
      'Text.Effects.glowEnabled': true,
      'Text.Effects.glowSize': 3,
      'Text.Effects.glowIntensity': 1,
      'Text.Effects.glowColour': argb(ink, 'B3'),
    } };
  }
  if (treatment === 'plate') {
    return { component: {
      'Background.Fill.colour': argb(BRASS),
      'Background.Border.enabled': true,
      'Background.Border.colour': argb(darken(BRASS, 0.38)),
      'Background.Border.thickness': 1,
      'Background.Corners.radius': 2,
      'Text.Fill.colour': PLATE_INK,
      'Text.Effects.shadowEnabled': true,
      'Text.Effects.shadowStyle': 'soft',
      'Text.Effects.shadowOffsetX': 0,
      'Text.Effects.shadowOffsetY': 1,
      'Text.Effects.shadowBlur': 0,
      'Text.Effects.shadowColour': argb(lighten(BRASS, 0.55), '99'),
    } };
  }
  // frame: one ink, one paper, a hairline.
  return { component: {
    'Background.Fill.colour': '00000000',
    'Background.Border.enabled': true,
    'Background.Border.colour': '{text.primary}',
    'Background.Border.thickness': 1,
  } };
}

/**
 * The set with its Label design merged into its Label family. The design wins over what the family
 * already says (the additional sets name the text colour, which a plate must replace with its own
 * ink), and the set's type block still sets the face, beneath both (controlSetFamilies).
 */
export function withLabelDesign(set) {
  const design = labelFamily(set);
  if (!design) return set;
  const current = set.families?.Label ?? {};
  return { ...set, families: { ...set.families, Label: { ...current, component: { ...(current.component ?? {}), ...design.component } } } };
}
