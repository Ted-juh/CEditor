// meterFormParts.js — the meter forms, as the meter's own parts.
//
// A form (editor/ControlAnatomy.svelte) drew a meter in code: its dial, glass or tally could not be
// edited and its colours were five fields. The owner decided that forms become parts
// (docs/design/changeable-control-sets.md, piece B): each form here is a family patch of the
// meter's parts (models/meterDeviceParts.js), so every shape, colour and motion of it is a
// property, and the form frame still places it, readout and all.
//
// The colours are the form's five, as set colour roles: face {surface}, housing {control.track},
// legends {text.primary}, indicator {accent}, and the ink, which the set works out against its
// surface (models/controlSetCoverage.js inkOn) and passes in. The boxes are the drawings' own, in
// the 160 by 100 frame, as percentages of it.

export const METER_FORMS_AS_PARTS = ['bar', 'ruler', 'ticket', 'capsule', 'column', 'counter', 'vu', 'blocks', 'dial', 'radio', 'semaphore', 'dots'];

const ROLES = { face: '{surface}', housing: '{control.track}', legend: '{text.primary}', accent: '{accent}' };
const W = 160;
const H = 100;
const pct = (value, of) => Math.round((value / of) * 10000) / 100;

/** A box in the frame's units, as the part's layout. */
const at = (x, y, w, h) => ({ 'Layout.x': pct(x, W), 'Layout.y': pct(y, H), 'Layout.width': pct(w, W), 'Layout.height': pct(h, H) });
const part = (colour, extra = {}) => ({
  visible: true,
  opacity: 1,
  'Background.Fill.colour': colour,
  'Background.Fill.gradientEnabled': false,
  'Background.Border.enabled': false,
  'Background.Corners.radius': 0,
  ...extra,
});
const edge = (colour, thickness) => ({ 'Background.Border.enabled': true, 'Background.Border.colour': colour, 'Background.Border.thickness': thickness });
const radius = (r) => ({ 'Background.Corners.radius': r });
const clear = '00000000';
// An ink a little through, as the forms drew their cases' edges.
const faint = (colour, alpha) => (/^[0-9a-f]{8}$/i.test(String(colour))
  ? `${Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase()}${String(colour).slice(2)}`
  : colour);
// The forms' metal: light at the top, the face across the middle, dark at the foot. With the face's
// colour to hand it is the form's own gradient; a gradient's stops are colours, not set roles, so
// without it the metal of models/buttonFormParts.js is laid over the face instead.
const METAL = { type: 'linear', angle: 180, edge: 0, stops: [
  { color: '7AFFFFFF', position: 0 }, { color: '00FFFFFF', position: 42 }, { color: '00000000', position: 55 }, { color: '64000000', position: 100 },
] };
const isLiteral = (colour) => /^[0-9a-f]{8}$/i.test(String(colour ?? ''));
const sheen = (face) => (isLiteral(face)
  ? { 'Background.Fill.colour': clear, 'Background.Fill.gradientEnabled': true, 'Background.Fill.gradientOpacity': 100, 'Background.Fill.gradient': {
    type: 'linear', angle: 180, edge: 0, stops: [
      { color: '7AFFFFFF', position: 0 }, { color: String(face).toUpperCase(), position: 42 }, { color: String(face).toUpperCase(), position: 55 }, { color: '64000000', position: 100 },
    ] } }
  : { 'Background.Fill.colour': ROLES.face, 'Background.Fill.gradientEnabled': true, 'Background.Fill.gradientOpacity': 100, 'Background.Fill.gradient': METAL });

// The three needle meters: a case, a face, an arc of ticks with its top fifth in the accent, a
// needle sweeping 130 degrees about the face's foot, a hub and a word.
const needle = (ink, divisions, housing, face, word) => ({
  housing: { ...part(ROLES.housing, edge(faint(ink, 0.35), 1)), ...housing },
  face: { ...part(ROLES.face), ...face },
  scale: {
    ...part(ink), ...at(26, 26, 108, 108), 'Layout.rotation': -65, pattern: 'arc', swing: 130,
    // Minor ticks, where the author adds them, a little shorter and finer than the majors.
    majorCount: divisions + 1, minorCount: 0, majorLength: 12.96, minorLength: 8, majorWidth: 1.5, minorWidth: 1,
    zoneFrom: 0.8, activeColour: ROLES.accent,
  },
  indicator: { ...part(ROLES.accent), ...at(79, 30, 2, 50), 'Layout.rotation': -65, motion: 'swing', swing: 130, pivotX: 50, pivotY: 100 },
  cover: { ...part(ink), shape: 'ellipse', ...at(74, 74, 12, 12) },
  legend: { ...part(ink), ...at(13, 47, 134, 10), textSource: 'fixed', legendText: word, fontSize: 10 },
});

const METERS = {
  // A flat bar filling a faint groove.
  bar: ({ ink }) => ({
    track: { ...part(ink), ...at(8, 34, 144, 30), opacity: 0.22 },
    indicator: { ...part(ROLES.accent), ...at(8, 34, 144, 30), motion: 'fill', fillFrom: 'left' },
  }),
  // A cursor riding a ruler: a baseline, twenty steps with every fifth long, a line and its head.
  ruler: ({ ink }) => ({
    track: { ...part(ink), ...at(8, 63.5, 144, 1) },
    scale: {
      ...part(ink), ...at(10, 43, 140, 21), pattern: 'ticks',
      majorCount: 5, minorCount: 4, majorLength: 100, minorLength: 42.86, majorWidth: 1, minorWidth: 1,
    },
    indicator: { ...part(ROLES.accent), ...at(9.5, 25, 1, 50), motion: 'slide', travelX: pct(140, W) },
    marker: { ...part(ROLES.accent), shape: 'pointer', ...at(3, 25, 14, 14), motion: 'slide', travelX: pct(140, W) },
  }),
  // A pinked paper tally: fifteen strokes, inked in the accent up to the value.
  ticket: ({ ink }) => ({
    face: { ...part(ROLES.face, edge(ink, 2)), shape: 'ticket', shapeDepth: 8.06, ...at(5, 18, 150, 62) },
    indicator: {
      ...part(ink), ...at(13, 39, 130, 26), pattern: 'columns', patternCount: 15, cellWidth: 44.44,
      motion: 'light', opacity: 0.15, activeColour: ROLES.accent, activeOpacity: 1,
    },
  }),
  // A capsule filling, a metal sheen over it.
  capsule: ({ ink, face }) => ({
    track: { ...part(ink, radius(15)), ...at(8, 34, 144, 30), opacity: 0.22 },
    indicator: { ...part(ROLES.accent, radius(15)), ...at(8, 34, 144, 30), motion: 'fill', fillFrom: 'left' },
    cover: { ...part(ROLES.face, radius(15)), ...at(8, 34, 144, 30), opacity: 0.35, ...sheen(face) },
  }),
  // A glass column filling from its foot, a gloss down it and five marks beside it: the glass,
  // then its outline over it.
  column: ({ ink }) => ({
    housing: { ...part(ROLES.face, radius(21)), ...at(48, 6, 64, 82), opacity: 0.3 },
    track: { ...part(clear, { ...radius(21), ...edge(ink, 1) }), ...at(48, 6, 64, 82) },
    indicator: { ...part(ROLES.accent, radius(14)), ...at(55, 14, 50, 66), motion: 'fill', fillFrom: 'bottom' },
    cover: { ...part('FFFFFFFF'), ...at(58, 16, 4, 59), opacity: 0.6 },
    scale: { ...part(ROLES.legend), ...at(117, 16, 8, 64), pattern: 'ticks', majorCount: 5, minorCount: 0, majorLength: 100, minorLength: 60, majorWidth: 1, minorWidth: 1 },
  }),
  // A row of number wheels in a case, a figure on each, a seam across them.
  counter: ({ ink }) => ({
    housing: { ...part(ROLES.housing, { ...radius(6), ...edge(faint(ink, 0.35), 1) }), ...at(3, 21, 154, 61) },
    face: { ...part(ROLES.face, radius(3)), ...at(8, 27, 141, 48), pattern: 'digits', cellWidth: 92 },
    scale: { ...part(ink), ...at(8, 50.5, 141, 1), pattern: 'digits', cellWidth: 92, opacity: 0.5 },
    legend: { ...part(ink), ...at(8, 29, 141, 33), pattern: 'digits', cellWidth: 92, textSource: 'value', fontSize: 33, fontFamily: 'monospace' },
  }),
  vu: ({ ink, divisions }) => needle(ink, divisions, at(6, 13, 148, 74), at(13, 20, 134, 60), 'VU'),
  // Eight rubber blocks on their shadows, each rising and lighting up to the value.
  blocks: ({ ink }) => ({
    housing: { ...part(ink), ...at(6, 33, 146, 39), pattern: 'columns', patternCount: 8, cellWidth: 68.42 },
    indicator: {
      ...part(ROLES.face, radius(3)), ...at(7, 35, 146, 34), pattern: 'columns', patternCount: 8, cellWidth: 68.42,
      motion: 'light', activeColour: ROLES.accent, travelY: -8,
    },
  }),
  dial: ({ ink, divisions }) => needle(ink, divisions, at(24, 10, 112, 76), at(31, 17, 98, 62), 'LEVEL'),
  radio: ({ ink, divisions }) => needle(ink, divisions,
    { shape: 'arch', shapeDepth: 35.1, ...at(6, 8.5, 148, 75.5) }, { shape: 'arch', shapeDepth: 37.93, ...at(14, 18, 132, 58) }, 'SIGNAL'),
  // A flag filling a window in a cut-cornered case, a staff across it and the percentage on it.
  semaphore: ({ ink }) => ({
    housing: { ...part(ROLES.housing, edge(faint(ink, 0.35), 1)), shape: 'hexagon', shapeDepth: 10.14, ...at(11, 14, 138, 72) },
    face: { ...part(ROLES.face), ...at(28, 25, 104, 49) },
    indicator: { ...part(ROLES.accent), ...at(28, 25, 104, 49), motion: 'fill', fillFrom: 'left' },
    marker: { ...part(ink), ...at(78.5, 18, 3, 63) },
    legend: { ...part(ink), ...at(28, 36, 104, 24), textSource: 'percent', fontSize: 24 },
  }),
  // Fifteen columns of four dots in a case, lit up to the value.
  dots: ({ ink }) => ({
    housing: { ...part(ROLES.housing, { ...radius(3), ...edge(faint(ink, 0.35), 1) }), ...at(4, 17, 152, 68) },
    indicator: {
      ...part(ROLES.accent), shape: 'ellipse', ...at(11, 25, 137.6, 51), pattern: 'grid', patternCount: 15, patternRows: 4,
      cellWidth: 63.83, cellHeight: 40, motion: 'light', opacity: 0.13, activeOpacity: 1,
    },
  }),
};

/** The forms of `type` that are parts now. */
export function meterFormsAsParts(type) {
  return type === 'Meter' || type === 'ProgressBar' ? METER_FORMS_AS_PARTS : [];
}

/**
 * The family patch that draws `form` with a meter's own parts, or null when the form is still
 * drawn by code. `ink` is the set's ink against its surface; `divisions` the steps of a needle's
 * scale, as Core › Control design's Divisions gave them; `face` the set's surface as a colour, for
 * a sheen that runs through it.
 */
export function meterFormFamily(type, form, { ink = 'FF20282C', divisions = 12, face = '' } = {}) {
  if (!meterFormsAsParts(type).length) return null;
  const recipe = METERS[String(form ?? '')];
  if (!recipe) return null;
  // The readout in the legend colour, as the forms set it.
  return { component: { 'Text.Fill.colour': ROLES.legend }, parts: recipe({ ink, face, divisions: Math.max(4, Math.min(48, Math.round(Number(divisions) || 12))) }) };
}
