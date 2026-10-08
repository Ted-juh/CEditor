// A set's design grammar: the few decisions every framed control reads, so that a set looks as if
// one hand drew it rather than as a kit of recoloured parts.
//
//   frame      how the set holds a thing on its panel: a well (recessed), milled (a harder inset in
//              the metal), glow (a lit edge), piping (a cream line round leather) or a hairline (one
//              ink line). It is the set's signature, the thing that repeats: Tolex's piping is on its
//              sections, its shapes, its display bezels and its instrument cases alike.
//   corners    the set's radius, as its frame clamps it.
//   line       the weight of its lines: a hairline 1, a milled edge 1.5, piping 2.
//   lettering  its typefaces: the legend face for captions and names, the field face for values.
//
// The frame was decided first, for the sections (models/sectionDesigns.js), and is read from there.
// What this adds is that everything else framed reads it too: an instrument's case and a display's
// bezel are drawn in the same frame, filled with their own face. Graphite has no grammar: its
// controls are what they always were.

import { sectionFrame, sectionTreatmentFor } from './sectionDesigns.js';

const LINE = { hairline: 1, well: 1, glow: 1, milled: 1.5, piping: 2 };

export function grammarFor(set) {
  const frame = sectionTreatmentFor(set);
  if (!frame) return null;
  const radius = Number(set.families?.Group?.component?.['Background.Corners.radius'] ?? 8);
  return {
    frame,
    corners: Number.isFinite(radius) ? radius : 8,
    line: LINE[frame] ?? 1,
    lettering: {
      legend: set.type?.legend?.family ?? null,
      field: set.type?.field?.family ?? null,
      label: set.type?.label?.family ?? null,
    },
  };
}

/**
 * The set's frame round a control whose face is its own: an instrument's display window, a
 * display's bezel. The section's frame with `fill` for its face, and without the panel's material,
 * which belongs to sections cut into the panel rather than to a screen. `maxRadius` caps the corner.
 */
export function frameFor(set, { fill, maxRadius = Infinity } = {}) {
  const grammar = grammarFor(set);
  if (!grammar) return null;
  const frame = sectionFrame(set, grammar.corners);
  const out = Object.fromEntries(Object.entries(frame).filter(([key]) => !key.startsWith('Background.Effects.Material.')));
  if (fill) out['Background.Fill.colour'] = fill;
  out['Background.Border.thickness'] = Math.max(out['Background.Border.thickness'] ?? 1, grammar.line);
  out['Background.Corners.radius'] = Math.min(out['Background.Corners.radius'] ?? grammar.corners, maxRadius);
  return out;
}
