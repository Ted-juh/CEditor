// buttonFormParts.js — the button and switch forms, as the control's own parts.
//
// A form (editor/ControlAnatomy.svelte) drew a button or a switch in code: its shapes could not be
// edited, its colours were five fields, and while it was on the control's background, border and
// effects were not drawn. The owner decided that forms become parts
// (docs/design/changeable-control-sets.md, piece B): each form here is a family patch of the
// control's device parts (models/buttonDeviceParts.js), so every shape, colour, motion and legend
// of it is a property, and the form layout still places it, caption and all.
//
// The colours are the form's five, as set colour roles: face {surface}, housing {control.track},
// legends {text.primary}, indicator {accent}, and the ink, which the set works out against its
// surface (models/controlSetCoverage.js inkOn) and passes in. The boxes are the drawings' own, in
// the 160 by 80 device frame, as percentages of it; a key travels the 2.4 units the forms pressed it.

export const BUTTON_FORMS_AS_PARTS = ['tile', 'crosskey', 'fold', 'cushion', 'glasskey', 'touch', 'piano', 'rubber', 'hexkey', 'typewriter', 'guardkey', 'pixelkey'];
export const TOGGLE_FORMS_AS_PARTS = ['slide', 'knife', 'bookmark', 'rocker', 'orbit', 'split', 'latch', 'strap', 'bolt', 'lever', 'guard', 'binary'];

const ROLES = { face: '{surface}', housing: '{control.track}', legend: '{text.primary}', accent: '{accent}' };
const W = 160;
const H = 80;
const pct = (value, of) => Math.round((value / of) * 10000) / 100;

/** A box in the device frame's units, as the part's layout. */
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
const shape = (kind, depth) => (depth == null ? { shape: kind } : { shape: kind, shapeDepth: depth });
const radius = (r) => ({ 'Background.Corners.radius': r });
const pressed = { travelY: pct(2.4, H) };
const follows = { follows: 'key' };
const clear = '00000000';
// An ink a little through, as the forms drew their housings' edges.
const faint = (colour, alpha) => (/^[0-9a-f]{8}$/i.test(String(colour))
  ? `${Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase()}${String(colour).slice(2)}`
  : colour);
// The forms' two finishes, laid over a part's own colour so they shade any colour: a turned metal
// face, light at the top and dark at the foot; a dome lit from the top left.
const METAL = { type: 'linear', angle: 180, edge: 0, stops: [
  { color: '7AFFFFFF', position: 0 }, { color: '00FFFFFF', position: 42 }, { color: '00000000', position: 55 }, { color: '64000000', position: 100 },
] };
const DOME = { type: 'radial', centerX: 32, centerY: 25, radiusX: 80, radiusY: 80, edge: 0, stops: [
  { color: '82FFFFFF', position: 0 }, { color: '00FFFFFF', position: 45 }, { color: '5C000000', position: 100 },
] };
const shaded = (gradient) => ({ 'Background.Fill.gradientEnabled': true, 'Background.Fill.gradient': gradient, 'Background.Fill.gradientOpacity': 100 });

const BUTTONS = {
  // A flat tile, a rule across its foot; it lights in the accent when pressed.
  tile: ({ ink }) => ({
    key: { ...part(ROLES.face, radius(4)), ...at(15, 12, 130, 57), activeColour: ROLES.accent, ...pressed },
    symbol: { ...part(ink), ...at(33, 50, 94, 2), ...follows },
  }),
  // A diamond outline on a crosshair, a dot in the middle; the diamond fills when pressed.
  crosskey: ({ ink }) => ({
    guard: { ...part(ink), ...shape('crosshair', 40), ...at(0, 0, 160, 80) },
    key: { ...part(clear, edge(ink, 2)), ...shape('diamond'), ...at(16, 5, 128, 70), activeColour: ROLES.accent, ...pressed },
    indicator: { ...part(ROLES.accent), ...shape('ellipse'), ...at(71, 31, 18, 18), ...follows },
  }),
  // A folded sheet on its shadow, the fold in the accent, a rule across it.
  fold: ({ ink }) => ({
    housing: { ...part(ink), ...at(22, 17, 115, 54) },
    key: { ...part(ROLES.face, edge(ink, 2)), ...shape('flap', 24), ...at(16, 10, 116, 54), activeColour: ROLES.accent, ...pressed },
    indicator: { ...part(ROLES.accent, edge(ink, 1)), ...shape('corner'), ...at(119, 10, 13, 14), ...follows },
    symbol: { ...part(ink), ...at(30, 40.5, 79, 3), ...follows },
  }),
  // A soft cushion with a dome on it, a short bar in the middle.
  cushion: ({ ink }) => ({
    key: { ...part(ROLES.face, shaded(DOME)), ...shape('pillow'), ...at(9, 3, 142, 69), activeColour: ROLES.accent, ...pressed },
    symbol: { ...part(ink, radius(2.5)), ...at(67, 35.5, 26, 5), ...follows },
  }),
  // A glass disc, a ring in it that fills in the accent when pressed.
  glasskey: ({ ink }) => ({
    key: { ...part(ROLES.face, edge(ink, 1)), ...shape('ellipse'), ...at(47, 7, 66, 66), opacity: 0.45, ...pressed },
    symbol: { ...part(clear, edge('B3FFFFFF', 1)), ...shape('ellipse'), ...at(56, 16, 48, 48), activeColour: ROLES.accent, ...follows },
  }),
  // A dark touch strip, a line along it and a dot; the line lights when touched.
  touch: ({ ink }) => ({
    key: { ...part(ink), ...at(8, 24, 144, 33), ...pressed },
    symbol: { ...part(ROLES.accent), ...at(25, 47, 110, 2), activeColour: ROLES.face, ...follows },
    indicator: { ...part(ROLES.accent), ...shape('ellipse'), ...at(75, 30, 10, 10), ...follows },
  }),
  // A piano key in its slot, a label block across its top.
  piano: ({ ink }) => ({
    housing: { ...part(ROLES.housing, edge(faint(ink, 0.35), 1)), ...at(48, 4, 64, 72) },
    key: { ...part(ROLES.face), ...at(52, 8, 56, 64), activeColour: ROLES.accent, ...pressed },
    symbol: { ...part(ink), ...at(62, 16, 36, 9), ...follows },
  }),
  // A rubber pad in its bezel, grooves across it.
  rubber: ({ ink }) => ({
    housing: { ...part(ROLES.housing, { ...edge(faint(ink, 0.35), 1), ...radius(18) }), ...at(26, 6, 108, 70) },
    key: { ...part(ROLES.face, radius(17)), ...at(33, 10, 94, 58), activeColour: ROLES.accent, ...pressed },
    symbol: { ...part(ink), ...at(49, 21.5, 62, 28), pattern: 'lines', patternCount: 4, opacity: 0.25, ...follows },
  }),
  // A hexagonal plunger in a hexagonal housing, turned metal, a dot in the middle.
  hexkey: ({ ink }) => ({
    housing: { ...part(ROLES.housing, edge(faint(ink, 0.35), 1)), ...shape('hexagon', 22), ...at(14, 5, 132, 70) },
    key: { ...part(ROLES.face, shaded(METAL)), ...shape('hexagon', 21), ...at(24, 12, 112, 54), activeColour: ROLES.accent, ...pressed },
    indicator: { ...part(ROLES.accent), ...shape('ellipse'), ...at(71, 30, 18, 18), ...follows },
  }),
  // A typewriter key on its shadow, a ring printed on it.
  typewriter: ({ ink }) => ({
    housing: { ...part(ink), ...shape('ellipse'), ...at(43, 23, 74, 52) },
    key: { ...part(ROLES.face, edge(ink, 4)), ...shape('ellipse'), ...at(46, 9, 68, 50), activeColour: ROLES.accent, ...pressed },
    symbol: { ...part(clear, edge(ink, 1)), ...shape('ellipse'), ...at(53, 16, 54, 36), ...follows },
  }),
  // A key under a guard, the guard's bar in the accent.
  guardkey: ({ ink }) => ({
    guard: { ...part(ink), ...shape('bracket', 20), ...at(19, 2, 122, 71) },
    key: { ...part(ROLES.face, radius(5)), ...at(42, 23, 76, 45), activeColour: ROLES.accent, ...pressed },
    indicator: { ...part(ROLES.accent), ...at(28, 5.5, 104, 7) },
  }),
  // A dark key of pixels that light when it is pressed.
  pixelkey: () => ({
    key: { ...part(ROLES.housing), ...at(33, 8, 94, 64), ...pressed },
    symbol: { ...part(ROLES.accent), ...at(45, 19, 73, 43), pattern: 'grid', patternCount: 5, patternRows: 3, opacity: 0.18, activeOpacity: 1, ...follows },
  }),
};

const SWITCHES = {
  // A slide in a pill track; on, it moves across and lights, and the legend moves to the other side.
  slide: ({ ink }) => ({
    housing: { ...part(ink, radius(22)), ...at(18, 18, 124, 45), opacity: 0.18 },
    key: { ...part(ROLES.face, radius(19)), ...at(21, 21, 58, 39), activeColour: ROLES.accent, travelX: pct(60, W) },
    legend: { ...part(ink), ...at(92, 33, 40, 20), offText: 'OFF', onText: 'ON', fontSize: 12, travelX: pct(-63, W) },
  }),
  // An exposed knife switch: a blade on a pivot between two posts; on, it swings down into the catch.
  knife: ({ ink }) => ({
    housing: { ...part(ink), ...at(22, 59, 116, 2) },
    guard: { ...part(ink), ...shape('bracket', 5), ...at(39, 15, 82, 50), 'Layout.rotation': 180 },
    key: { ...part(ink), ...at(40, 38.5, 81, 9), pivotX: 0, pivotY: 50, 'Layout.rotation': -26.6, swing: 26.6 },
    symbol: { ...part(ROLES.accent), ...at(80, 37, 42, 12), ...follows },
    indicator: { ...part(ROLES.face, edge(ink, 1)), ...shape('ellipse'), ...at(31, 34, 18, 18) },
  }),
  // A paper card with a bookmark ribbon; on, the ribbon moves across.
  bookmark: ({ ink }) => ({
    housing: { ...part(ROLES.face, edge(ink, 2)), ...at(27, 19, 106, 43) },
    key: { ...part(ROLES.accent, edge(ink, 2)), ...shape('ribbon', 18), ...at(37, 8, 30, 67), travelX: pct(51, W) },
  }),
  // A moulded rocker on its shadow; on, it tips the other way and its dot moves across.
  rocker: ({ ink }) => ({
    housing: { ...part(ink), ...shape('ellipse'), ...at(21, 9, 118, 64), opacity: 0.3 },
    key: { ...part(ROLES.face, shaded(METAL)), ...shape('pillow'), ...at(28, 14, 105, 56), 'Layout.rotation': 6, swing: -12 },
    indicator: { ...part(ROLES.accent), ...shape('ellipse'), ...at(44, 33, 12, 12), travelX: pct(60, W) },
  }),
  // A bead on a ring; on, it runs to the other side, and the legend reads I.
  orbit: ({ ink }) => ({
    housing: { ...part(ROLES.face), ...shape('ring', 32), ...at(45.5, 4.5, 69, 69) },
    guard: { ...part(ink), ...shape('ring', 3), ...at(45, 4, 70, 70) },
    key: { ...part(ROLES.accent, edge(ink, 1)), ...shape('ellipse'), ...at(39, 26, 26, 26), travelX: pct(56, W) },
    legend: { ...part(ink), ...at(70, 33, 20, 14), offText: 'O', onText: 'I', fontSize: 10 },
  }),
  // Two dark halves, the lit one the state; its legend and its bar go with it.
  split: ({ ink }) => ({
    housing: { ...part(ink), ...shape('pair', 6), ...at(14, 15, 132, 51) },
    key: { ...part(ROLES.face), ...at(14, 15, 62, 51), travelX: pct(70, W) },
    symbol: { ...part(ROLES.accent), ...at(26, 54, 38, 4), ...follows },
    legend: { ...part(ink), ...at(25, 31, 40, 20), offText: 'O', onText: 'I', fontSize: 12, ...follows },
  }),
  // A console latch in its well; on, the cap sinks and its bar lights.
  latch: ({ ink }) => ({
    housing: { ...part(ROLES.housing, { ...edge(faint(ink, 0.35), 1), ...radius(3) }), ...at(42, 7, 76, 68) },
    key: { ...part(ROLES.face), ...at(48, 9, 64, 52), travelY: pct(10, H) },
    symbol: { ...part(ink), ...at(58, 19, 44, 8), activeColour: ROLES.accent, ...follows },
  }),
  // A rubber strap over a dark band; on, it flips and drops.
  strap: ({ ink }) => ({
    housing: { ...part(ink), ...shape('ellipse'), ...at(19, 15, 122, 58) },
    key: { ...part(ROLES.face), ...shape('pillow'), ...at(28, 14, 104, 40), swing: 180, travelY: pct(8, H) },
    symbol: { ...part(ROLES.accent), ...at(66, 31, 28, 18), pattern: 'lines', patternCount: 3, ...follows },
  }),
  // A sliding bolt in its keeper; on, it slides across, its handle with it.
  bolt: ({ ink }) => ({
    housing: { ...part(ROLES.face, edge(ink, 3)), ...at(15, 25, 130, 35) },
    key: { ...part(ROLES.face, { ...edge(ink, 1), ...shaded(METAL) }), ...at(18, 33, 91, 19), travelX: pct(32, W) },
    symbol: { ...part(ink), ...at(48, 18, 12, 45), ...follows },
    indicator: { ...part(ROLES.accent), ...at(50.5, 18, 7, 25), ...follows },
  }),
  // A bakelite lever on its boss; on, it throws to the other side.
  lever: ({ ink }) => ({
    housing: { ...part(ROLES.face, edge(ink, 3)), ...shape('ellipse'), ...at(57, 37, 46, 30) },
    key: { ...part(ink), ...at(75, 18, 10, 34), pivotX: 50, pivotY: 100, 'Layout.rotation': -42.5, swing: 76.2 },
    indicator: { ...part(ROLES.accent, edge(ink, 2)), ...shape('ellipse'), ...at(67, 7, 26, 18), ...follows },
  }),
  // The lever under a guard, the guard's bar in the accent.
  guard: (options) => ({
    ...SWITCHES.lever(options),
    guard: { ...part(options.ink), ...shape('bracket', 24.5), ...at(31, 8, 98, 59) },
    symbol: { ...part(ROLES.accent), ...at(37, 10, 86, 8) },
  }),
  // Two cells of dots, the lit one the state.
  binary: () => ({
    housing: { ...part(ROLES.housing), ...shape('pair', 10), ...at(20, 13, 120, 54) },
    symbol: { ...part(ROLES.accent), ...at(29, 22, 34, 34), pattern: 'grid', patternCount: 3, patternRows: 3, opacity: 0.15 },
    indicator: { ...part(ROLES.accent), ...at(95, 22, 34, 34), pattern: 'grid', patternCount: 3, patternRows: 3, opacity: 0.15 },
    key: { ...part(ROLES.accent), ...at(29, 22, 34, 34), pattern: 'grid', patternCount: 3, patternRows: 3, travelX: pct(66, W) },
  }),
};

/** The forms of `type` that are parts now. */
export function buttonFormsAsParts(type) {
  if (type === 'ToggleButton') return TOGGLE_FORMS_AS_PARTS;
  return ['Button', 'MomentaryButton', 'TimedButton', 'OneShotButton'].includes(type) ? BUTTON_FORMS_AS_PARTS : [];
}

/**
 * The family patch that draws `form` with a button's or a switch's own parts, or null when the form
 * is still drawn by code. `ink` is the set's ink against its surface.
 */
export function buttonFormFamily(type, form, { ink = 'FF20282C' } = {}) {
  const recipes = type === 'ToggleButton' ? SWITCHES : (buttonFormsAsParts(type).length ? BUTTONS : null);
  const recipe = recipes?.[String(form ?? '')];
  if (!recipe) return null;
  // The caption in the legend colour, as the forms set it.
  return { component: { 'Text.Fill.colour': ROLES.legend }, parts: recipe({ ink }) };
}
