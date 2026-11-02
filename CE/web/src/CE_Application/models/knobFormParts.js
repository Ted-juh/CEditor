// knobFormParts.js — the control forms of a Knob, as the knob's own parts.
//
// A form (editor/ControlAnatomy.svelte) drew a knob in code: its geometry could not be edited, its
// colours were five fields, and while it was on, the knob's parts, background and effects were not
// drawn. The owner decided that forms become parts (docs/design/changeable-control-sets.md, piece
// B): each form here is a family patch of the knob's parts (the housing plate, the value track and
// arc, the cap, the pointer, the ticks, the readout) with the properties every knob has, so every
// one of them can be changed on the knob, and bipolar, range and linear work as they do for any
// knob.
//
// The colours are the form's five, as set colour roles: face {surface}, housing {control.track},
// legends {text.primary}, indicator {accent}, and the ink, which the set works out against its
// surface (models/controlSetCoverage.js inkOn) and passes in. Sizes follow the form's drawing: its
// track was 58 units in a 160 x 170 frame, so a part's width is its radius in the drawing as a
// percentage of 58, and a stroke in px is its width in the drawing at a knob about 100 px tall.

/** The forms that are parts now; the others are still drawn by the form code. */
export const KNOB_FORMS_AS_PARTS = ['disc', 'pointer', 'halo', 'lens', 'skirt', 'vernier', 'scallop', 'encoder'];

const ROLES = { face: '{surface}', housing: '{control.track}', legend: '{text.primary}', accent: '{accent}' };

const off = { visible: false };
const ticks = (divisions, { placement = 'outside', major = 5, minor = 2.5 } = {}) => {
  const count = Math.max(4, Math.min(48, Math.round(divisions) || 12));
  return {
    component: {
      'Behavior.showTicks': true,
      'Behavior.majorTickCount': Math.floor(count / 3) + 1,
      'Behavior.minorTickCount': 2,
      'Behavior.tickPlacement': placement,
    },
    parts: {
      tickMajor: { 'Layout.height': major, 'Layout.width': 1.2, 'Background.Fill.colour': ROLES.legend },
      tickMinor: { 'Layout.height': minor, 'Layout.width': 0.6, 'Background.Fill.colour': ROLES.legend },
    },
  };
};
const noTicks = { component: { 'Behavior.showTicks': false }, parts: {} };
// The readout under the knob, and no min/max labels: what every form drew. The track fitted tight
// to the box (utils/sliderGeometry.js), as the drawings filled it.
const board = { 'Behavior.showMinMaxLabels': false, 'Behavior.labelReadoutPlacement': 'bottom', 'Behavior.circularFit': 'tight' };
// The readout as the forms set it: small, monospaced, in the legend colour.
const readout = (colour = '{text.primary}') => ({ labelValue: { 'Text.Fill.colour': colour, 'Text.Font.family': 'JetBrains Mono', 'Text.Font.weight': 'normal' } });
// No track: hidden, and thin, since its thickness still sets where the ticks start.
const noTrack = { bodyTrackBase: { visible: false, 'Layout.height': 2 }, bodyTrackFill: { visible: false, 'Layout.height': 2 } };
const plain = (colour, extra = {}) => ({ opacity: 1, 'Background.Fill.colour': colour, 'Background.Fill.gradientEnabled': false, 'Background.Border.enabled': false, ...extra });
const edged = (colour, edge, thickness = 0.6, extra = {}) => ({ ...plain(colour), 'Background.Border.enabled': true, 'Background.Border.colour': edge, 'Background.Border.thickness': thickness, ...extra });
const size = (percent) => ({ 'Layout.width': percent, 'Layout.height': percent, 'Layout.widthUnit': 'percent', 'Layout.heightUnit': 'percent' });
const outline = (kind, count, depth, extra = {}) => ({ outline: kind, outlineCount: count, outlineDepth: depth, ...extra });
const lit = (kind, strength, shine) => ({
  'Background.Effects.Material.enabled': true,
  'Background.Effects.Material.kind': kind,
  'Background.Effects.Material.strength': strength,
  'Background.Effects.Material.shine': shine,
});

function merge(...pieces) {
  const out = { component: {}, parts: {} };
  for (const piece of pieces) {
    Object.assign(out.component, piece.component ?? {});
    for (const [name, patch] of Object.entries(piece.parts ?? {})) out.parts[name] = { ...(out.parts[name] ?? {}), ...patch };
  }
  return out;
}

const RECIPES = {
  // A flat disc on a faint track, the value an arc in the accent, a rounded bar for a pointer.
  disc: ({ ink }) => merge(noTicks, {
    component: board,
    parts: {
      bodyHousing: off,
      bodyTrackBase: { visible: true, 'Layout.height': 3, ...plain(ink), opacity: 0.2 },
      bodyTrackFill: { visible: true, 'Layout.height': 3, ...plain(ROLES.accent) },
      bodyCap: { visible: true, ...size(74), ...plain(ROLES.face) },
      pointerCurrent: { kind: 'line', 'Layout.width': 3.5, 'Layout.height': 93, 'Layout.offsetX': 35, ...plain(ROLES.accent) },
    },
  }),
  // A drafting pointer: a ruled ring, a needle with a tail, a small hub, ticks round it.
  pointer: ({ ink, divisions }) => merge(ticks(divisions), {
    component: board,
    parts: {
      ...noTrack,
      bodyHousing: { visible: true, ...size(78), ...outline('ring', 0, 4), ...plain(ink) },
      bodyCap: { visible: true, ...size(12), ...edged(ROLES.face, ink) },
      // The needle's reach is a % of the hub's radius (7 of the drawing's 58): 60 out, 32 behind.
      pointerCurrent: { kind: 'needle', 'Layout.width': 6, 'Layout.height': 860, 'Layout.offsetX': 460, ...plain(ROLES.accent) },
    },
  }),
  // An open glass ring between two hairlines, a bead riding it.
  halo: ({ ink, divisions }) => merge(ticks(divisions), {
    component: board,
    parts: {
      ...noTrack,
      bodyHousing: { visible: true, ...size(97), ...outline('ring', 0, 34), ...edged(ROLES.face, ink), opacity: 0.55 },
      bodyCap: off,
      pointerCurrent: { kind: 'capdot', 'Layout.width': 44, 'Layout.height': 116, ...plain(ROLES.accent) },
    },
  }),
  // An optical lens in an octagonal housing, the value read in its centre.
  lens: ({ ink }) => merge(noTicks, {
    component: { ...board, 'Behavior.labelReadoutPlacement': 'center' },
    parts: {
      ...noTrack,
      bodyHousing: { visible: true, ...size(117), ...outline('polygon', 8, 0, { outlineRotation: 22.5 }), ...edged(ROLES.housing, ink) },
      // The glass is dark, its rim the face colour: the drawing's dome over the housing.
      bodyCap: { visible: true, ...size(100), ...edged(ROLES.housing, ROLES.face, 2) },
      pointerCurrent: { kind: 'line', 'Layout.width': 3, 'Layout.height': 96, 'Layout.offsetX': 74, ...plain(ROLES.accent) },
      labelValue: { 'Text.Fill.colour': ROLES.accent },
    },
  }),
  // A console knob: a dark skirt, a face on it, a long pointer line, ticks outside.
  skirt: ({ ink, divisions }) => merge(ticks(divisions), {
    component: board,
    parts: {
      ...noTrack,
      bodyHousing: { visible: true, ...size(90), ...edged(ROLES.housing, ink) },
      bodyCap: { visible: true, ...size(78), ...plain(ROLES.face) },
      pointerCurrent: { kind: 'line', 'Layout.width': 4.5, 'Layout.height': 98, 'Layout.offsetX': 0, ...plain(ROLES.accent) },
    },
  }),
  // A vernier dial: a bright metal face with a dark ruled rim, a turning centre with its index.
  vernier: ({ ink, divisions }) => merge(ticks(divisions), {
    component: board,
    parts: {
      ...noTrack,
      bodyHousing: { visible: true, ...size(95), ...edged(ROLES.face, ink, 1.8), ...lit('brushed', 70, 60) },
      bodyCap: { visible: true, ...size(55), ...edged(ROLES.housing, ink) },
      pointerCurrent: { kind: 'line', 'Layout.width': 4.7, 'Layout.height': 97, 'Layout.offsetX': 3, ...plain(ROLES.accent) },
    },
  }),
  // A scalloped selector: an eight-point star that turns, on a darker star, a dark blade.
  scallop: ({ ink, divisions }) => merge(ticks(divisions), {
    component: board,
    parts: {
      ...noTrack,
      bodyHousing: { visible: true, ...size(95), ...outline('scallop', 8, 22), ...plain(ROLES.housing) },
      bodyCap: { visible: true, ...size(83), ...outline('scallop', 8, 19, { turns: true }), ...plain(ROLES.face), ...lit('glass', 30, 70) },
      pointerCurrent: { kind: 'chicken', 'Layout.width': 8, 'Layout.height': 104, ...plain(ink) },
    },
  }),
  // A segment encoder: a ring of segments lit up to the value, a hexagonal body, the value in it.
  encoder: ({ divisions }) => ({
    component: {
      ...board,
      'Behavior.labelReadoutPlacement': 'center',
      'Behavior.showTicks': true,
      'Behavior.majorTickCount': Math.max(4, Math.min(48, Math.round(divisions) || 12)),
      'Behavior.minorTickCount': 0,
      'Behavior.tickPlacement': 'cross',
    },
    parts: {
      ...noTrack,
      bodyHousing: { visible: true, ...size(83), ...outline('polygon', 6, 0, { outlineRotation: 30 }), ...edged(ROLES.housing, ROLES.legend) },
      bodyCap: off,
      pointerCurrent: off,
      tickMajor: { 'Layout.height': 9, 'Layout.width': 4, ...plain(ROLES.accent), opacity: 0.25 },
      labelValue: { 'Text.Fill.colour': ROLES.accent },
    },
  }),
};

/**
 * The family patch that draws `form` with the knob's parts, or null when the form is still drawn by
 * code. `ink` is the set's ink against its surface; `divisions` the form's scale divisions.
 */
export function knobFormFamily(form, { ink = 'FF20282C', divisions = 12 } = {}) {
  const recipe = RECIPES[String(form ?? '')];
  if (!recipe) return null;
  const family = recipe({ ink, divisions });
  return merge({ parts: readout() }, family);
}
