// directionKnobParts.js — the knobs of the synth direction sets, as the knob's own parts.
//
// The 36 synth sets (models/physicalControlSets.js, series 1 to 3: Vintage Mono to Future Lab,
// Heritage to Carbon Pro, Valve Console to Prism Cap) drew their knob in code
// (editor/PhysicalAnatomy.svelte, SynthExpansionAnatomy.svelte, SculptedSynthAnatomy.svelte): a
// printed scale with its numbers, a shadow on the panel, a skirt (often ribbed), a shaded cap, an
// insert or a ring, a painted pointer; the sculpted series in perspective, seen from above and in
// front. The twelve additional designs (a bellows, an iris, a fan) are not turning knobs and stay
// drawn by code, a classic category, as the owner decided. The owner decided that
// forms become parts (docs/design/changeable-control-sets.md, piece B), so each is a family patch of
// the knob's parts here, every shape, size and colour of it a property:
//
//   housing, skirt   plates under the cap (utils/sliderEntityFactory.js bodyHousing, bodySkirt);
//   cap, insert      the cap and a disc set into it (bodyCap, bodyInsert);
//   shadow           any plate's own outline again, lower and as soft as asked (`shadowOffset`,
//                    `shadowBlur`, `shadowColour`); with no offset and a colour, a glow;
//   perspective      a plate as an oval (`aspect`) moved up or down (`shiftY`): the sculpted
//                    series' side walls, tops and caps;
//   gear, chicken    the ribbed grip and the chicken-head, as outlines (utils/knobOutlines.js);
//   pointer          a bar with square ends, tapered, edged or shaded (pointerCurrent kind 'bar');
//   scale            ticks on a radius of their own (Behavior.tickRadius) and the 0 to 10 numbers
//                    round them (Behavior.scaleNumberCount, Parts.tickNumber);
//   value arc        the track and its fill, where the design had one.
//
// Each design is written here as it was drawn: radii and lengths in the units of its 160 by 170
// drawing, centred on (80, 76). `R` is the radius every other is a share of (the track's radius
// on the knob); a plate's width is its radius as a percentage of R, a pointer's lengths and width
// a percentage of the cap's radius, as the knob measures them. A stroke, a tick or the lettering is
// in px, at 0.85 px a unit: the drawing at the size a set's knob usually has.
//
// The shading is the drawing's, laid over the part's own colour: where a gradient passed through
// the set's face colour, the part's fill is that colour as a role ({surface}) and the gradient is
// transparent there, so the knob still follows its set. A cap's highlight is brighter than the
// drawing's white: the drawing's let the skirt under it show through, a part's covers it. The
// highlights stay put while the knob turns, as a light does; the drawing turned them with the cap.
//
// Left out, as no part draws them yet: the faint inner ring of Vintage Mono, the line under the
// digital knobs, the second scale of Dual Scale and its dark inner bar, the dark tail of Classic
// Poly's and Heritage's pointers, the knurling round Precision's face, Recessed's grip line, Arc
// Line's centre dot and the gap between its two arcs (one track carries both here); in the sculpted
// series, the specular glints, the line painted along a pointer, Prism Cap's facets, Coin Edge's
// accent tick and Gimbal Ring's two beads.

const PX = 0.85;
const px = (units) => Math.round(units * PX * 100) / 100;
const pct = (part, whole) => Math.round((part / whole) * 10000) / 100;
const lit = (hex) => `FF${String(hex).replace('#', '').toUpperCase()}`;
const faint = (hex, alpha) => `${Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase()}${String(hex).replace('#', '').toUpperCase()}`;
const CLEAR = '00000000';

const ROLES = { face: '{surface}', housing: '{control.track}', legend: '{text.primary}', accent: '{accent}' };

// An SVG gradient's direction (x2, y2) from the top-left corner, as a CSS angle.
const angleOf = (x2, y2) => Math.round((180 - (Math.atan2(x2, y2) * 180) / Math.PI) * 10) / 10;
const linear = (x2, y2, stops) => ({ type: 'linear', angle: angleOf(x2, y2), edge: 0, stops: stops.map(([color, position]) => ({ color, position })) });
const radial = (cx, cy, r, stops) => ({ type: 'radial', centerX: cx * 100, centerY: cy * 100, radiusX: r * 100, radiusY: r * 100, edge: 0, stops: stops.map(([color, position]) => ({ color, position })) });

// The drawings' shading, each a gradient over the part's own colour (CLEAR where it was the face).
// The depth the forms drew at is in the highlights' opacity: 60 % for the first two series, 92 %
// for the sculpted one.
const SHADES = {
  1: {
    cap: radial(0.35, 0.2, 0.95, [['73FFFFFF', 0], [CLEAR, 35], [CLEAR, 78], ['FF141819', 100]]),
    edge: linear(0.2, 1, [['FF9B9F9E', 0], [CLEAR, 12], ['FF111719', 100]]),
    metal: linear(0.8, 1, [['FFE2E5E5', 0], [CLEAR, 24], ['FFE5E8E8', 50], [CLEAR, 70], ['FF454C4E', 100]]),
    well: linear(0, 1, [['FF090D0F', 0], [CLEAR, 100]]),
  },
  2: {
    cap: radial(0.32, 0.2, 0.9, [['80FFFFFF', 0], [CLEAR, 30], [CLEAR, 80], ['FF263238', 100]]),
    dish: radial(0.7, 0.85, 0.9, [['FFEFF3EE', 0], [CLEAR, 40], ['FF485156', 100]]),
    metal: linear(0.65, 1, [['FFE5EAE8', 0], [CLEAR, 30], ['FFC9D2D2', 53], ['FF38484C', 100]]),
    edge: linear(0.1, 1, [['FF9AA6AA', 0], [CLEAR, 15], ['FF0E181E', 100]]),
    well: linear(0.2, 1, [['FF080E13', 0], [CLEAR, 65], ['FF5B6B73', 100]]),
  },
  3: {
    dome: radial(0.3, 0.18, 0.86, [['B3FFFFFF', 0], [CLEAR, 22], [CLEAR, 67], ['FF080D10', 100]]),
    dish: radial(0.66, 0.76, 0.88, [['FF11191C', 0], [CLEAR, 42], ['A3DCE4E1', 72], ['FF202A2E', 100]]),
    side: linear(0, 1, [[CLEAR, 0], ['FF1B2427', 25], ['FF05090B', 100]]),
    metal: linear(0.8, 1, [['C7F6FAF8', 0], [CLEAR, 24], ['FF4C5B5E', 48], [CLEAR, 70], ['FF11191C', 100]]),
  },
};

/** A plate: `r` its radius; `fill` its colour; `shade` a gradient over it; `border` [colour, width]. */
function plate(R, { r, fill, shade = null, border = null, shadow = null, gear = null, rounded = null, ring = null, opacity = 1,
  oval = null, at = 0, star = null, polygon = null, chicken = false, turns = false }) {
  const out = {
    visible: true,
    opacity,
    'Layout.width': pct(r, R), 'Layout.height': pct(r, R), 'Layout.widthUnit': 'percent', 'Layout.heightUnit': 'percent',
    'Background.Fill.colour': fill,
    'Background.Fill.gradientEnabled': Boolean(shade),
    'Background.Border.enabled': Boolean(border),
    // The drawing's shading is the whole of its finish: no material from the set's own knob under it.
    'Background.Effects.Material.enabled': false,
    outline: 'circle', turns, shadowOffset: 0, shadowBlur: 0, aspect: 100, shiftY: 0,
  };
  if (shade) Object.assign(out, { 'Background.Fill.gradient': shade, 'Background.Fill.gradientOpacity': 100 });
  if (border) Object.assign(out, { 'Background.Border.colour': border[0], 'Background.Border.thickness': px(border[1]) });
  // [drop, colour, blur]: the drawing's dark disc under the plate, `drop` units lower, `blur` soft.
  if (shadow) Object.assign(out, { shadowOffset: pct(shadow[0], r), shadowColour: shadow[1], shadowBlur: pct(shadow[2] ?? 0, r) });
  // In perspective: `oval` its height, the plate `at` units lower (above, below 0).
  if (oval != null) out.aspect = pct(oval, r);
  if (at) out.shiftY = pct(at, R);
  // [points, inner radius]: a star; a polygon of `polygon` corners, one at the top; a chicken-head.
  if (star) Object.assign(out, { outline: 'scallop', outlineCount: star[0], outlineDepth: pct(r - star[1], r), turns: true });
  if (polygon) Object.assign(out, { outline: 'polygon', outlineCount: polygon, outlineRotation: 0, turns: true });
  if (chicken) Object.assign(out, { outline: 'chicken', turns: true });
  // [teeth, inner radius]: the ribbed grip, turning with the cap as it did.
  if (gear) Object.assign(out, { outline: 'gear', outlineCount: gear[0], outlineDepth: pct(r - gear[1], r), turns: true });
  // A square well round the knob, its corners `rounded` units round.
  if (rounded != null) Object.assign(out, { outline: 'rounded', outlineDepth: pct(rounded, r) });
  // A full ring `ring` units wide.
  if (ring != null) Object.assign(out, { outline: 'ring', outlineDepth: pct(ring, r) });
  return out;
}

/** The pointer: a bar from `from` to `to` units out, `width` wide, against the cap's radius `reach`. */
function bar(reach, { from, to, width, colour, taper = 0, edge = null, shade = null }) {
  const out = {
    visible: true, kind: 'bar', opacity: 1,
    'Layout.width': pct(width, reach), 'Layout.height': pct(to, reach), 'Layout.offsetX': pct(from, reach),
    'Background.Fill.colour': colour, 'Background.Fill.gradientEnabled': false, taper,
    'Background.Border.enabled': Boolean(edge),
  };
  if (edge) Object.assign(out, { 'Background.Border.colour': edge[0], 'Background.Border.thickness': px(edge[1]) });
  // A shaded bar (Lever Dial's brushed lever): the gradient over its colour, as a plate's.
  if (shade) Object.assign(out, { 'Background.Fill.gradientEnabled': true, 'Background.Fill.gradient': shade, 'Background.Fill.gradientOpacity': 100 });
  return out;
}

/**
 * The printed scale: `count` divisions at radius `r`, ticks running in from it, every other one
 * long; with `numbers`, 0 to 10 round it `gap` units out. The three series drew them a little
 * differently (their lengths, widths, opacity and the numbers' gap and size).
 */
function scale(R, { r, count, numbers = false, series = 1, placement = 'inside', length = null, kind = 'line', width = null, colour = ROLES.legend, opacity = null, activeColour = null }) {
  const s2 = series === 2;
  const s3 = series === 3;
  // Long and short in turn, unless every tick is a segment of its own (a dot, an LED).
  const pairs = kind === 'line' && !activeColour;
  length = length ?? (s3 ? 6 : 5);
  const component = {
    'Behavior.showTicks': true,
    'Behavior.majorTickCount': pairs ? Math.floor(count / 2) + 1 : count + 1,
    'Behavior.minorTickCount': pairs ? 1 : 0,
    'Behavior.tickPlacement': placement,
    'Behavior.tickRadius': Math.abs(r - R) < 0.01 ? 0 : pct(r, R),
    'Behavior.scaleNumberCount': numbers ? 6 : 0,
    'Behavior.scaleNumberFrom': 0,
    'Behavior.scaleNumberTo': 10,
  };
  const tickOpacity = opacity ?? (s2 ? 0.7 : 0.8);
  const parts = {
    tickMajor: { kind, 'Layout.height': px(length), 'Layout.width': px(width ?? (s2 ? 1.2 : 1.4)), 'Background.Fill.colour': colour, opacity: tickOpacity, ...(activeColour ? { activeColour } : {}) },
    tickMinor: { kind, 'Layout.height': px(length / 2), 'Layout.width': px(width ? width / 2 : (s2 ? 0.6 : s3 ? 0.7 : 0.75)), 'Background.Fill.colour': colour, opacity: tickOpacity },
  };
  if (numbers) {
    parts.tickNumber = {
      visible: true, opacity: 1, 'Layout.offsetX': pct(r + (s2 ? 11 : 12), R),
      'Text.Fill.colour': ROLES.legend, 'Text.Font.size': px(s2 || s3 ? 6.5 : 7), 'Text.Font.family': 'Arial', 'Text.Font.weight': 'Regular', 'Text.Font.weightValue': 400,
    };
  }
  return { component, parts };
}

const noScale = { component: { 'Behavior.showTicks': false, 'Behavior.scaleNumberCount': 0, 'Behavior.tickRadius': 0 }, parts: {} };
const hidden = { visible: false };
// No track: hidden, and next to no width, since its width still sets where ticks on it start.
const noTrack = { bodyTrackBase: { visible: false, 'Layout.height': 0.5 }, bodyTrackFill: { visible: false, 'Layout.height': 0.5 } };
const arc = (width, base, fill = ROLES.accent) => ({
  bodyTrackBase: base ? { visible: true, 'Layout.height': px(width), opacity: 1, 'Background.Fill.colour': base, 'Background.Fill.gradientEnabled': false, 'Background.Border.enabled': false } : { visible: false, 'Layout.height': px(width) },
  bodyTrackFill: { visible: true, 'Layout.height': px(width), opacity: 1, 'Background.Fill.colour': fill, 'Background.Fill.gradientEnabled': false, 'Background.Border.enabled': false },
});
const board = { 'Behavior.showMinMaxLabels': false, 'Behavior.labelReadoutPlacement': 'bottom', 'Behavior.circularFit': 'tight' };
const readout = { labelValue: { 'Text.Fill.colour': ROLES.legend, 'Text.Font.family': 'JetBrains Mono', 'Text.Font.weight': 'Regular', 'Text.Font.weightValue': 400 } };

function knob(R, { scale: scaleSpec = null, track = null, housing = null, skirt = null, cap = null, insert = null, pointer, component = {}, parts = {} }) {
  const reach = cap ? cap.r : R * 0.7;
  const printed = scaleSpec ? scale(R, scaleSpec) : noScale;
  return {
    component: { ...board, ...printed.component, ...component },
    parts: {
      ...readout,
      ...(track ?? noTrack),
      ...printed.parts,
      bodyHousing: housing ? plate(R, housing) : hidden,
      bodySkirt: skirt ? plate(R, skirt) : hidden,
      bodyCap: cap ? plate(R, cap) : hidden,
      bodyInsert: insert ? plate(R, insert) : hidden,
      pointerCurrent: pointer.kind === 'dot'
        ? { visible: true, kind: 'dot', 'Layout.width': px(pointer.size), 'Layout.height': px(pointer.size), 'Background.Fill.colour': pointer.colour, 'Background.Fill.gradientEnabled': false, 'Background.Border.enabled': false, opacity: 1 }
        : bar(reach, pointer),
      ...parts,
    },
  };
}

const S1 = SHADES[1];
const S2 = SHADES[2];
const S3 = SHADES[3];
// The sculpted series' glass: white, then the face and the housing showing through, then dark.
const glass3 = (face, housing) => linear(0.2, 1, [['99FFFFFF', 0], [faint(face, 0.72), 32], [faint(housing, 0.55), 62], ['E6071117', 100]]);

/** Each design, keyed by its set's form (`new-<set id>`). `c` holds the colours: ink, face. */
const DESIGNS = {
  // Vintage Mono: a dark edged skirt on its shadow, a shaded cap, a dark insert, a cream bar.
  brassworks: () => knob(63, {
    scale: { r: 63, count: 20, numbers: true },
    housing: { r: 49, fill: ROLES.face, shade: S1.edge, border: ['FF0A0C0D', 2], shadow: [5, 'FF080B0D'] },
    cap: { r: 41, fill: ROLES.face, shade: S1.cap, border: null },
    insert: { r: 28, fill: 'FF30312E', border: ['FF6A6B62', 1] },
    pointer: { from: 16, to: 46, width: 6, colour: 'FFE7DDBD' },
  }),
  // Classic Poly: a ribbed skirt that turns, a shaded cap, a bar in the accent.
  bakelite: () => knob(65, {
    scale: { r: 65, count: 10 },
    housing: { r: 51, fill: ROLES.face, shade: S1.edge, border: ['FF111518', 2], gear: [12, 47], shadow: [5, 'FF0D1012'] },
    cap: { r: 38, fill: ROLES.face, shade: S1.cap, border: ['FF666D70', 1] },
    pointer: { from: 19, to: 48, width: 6, colour: ROLES.accent },
  }),
  // Studio Console: a dark skirt, a turned metal ring, a shaded cap, a dark line, a faint ring.
  'hi-fi': () => knob(67, {
    scale: { r: 67, count: 20, numbers: true },
    housing: { r: 49, fill: ROLES.face, shade: S1.edge, shadow: [4, 'FF13191B'] },
    skirt: { r: 43, fill: ROLES.face, shade: S1.metal, border: ['FFD0D4D4', 1] },
    cap: { r: 37, fill: ROLES.face, shade: S1.cap },
    insert: { r: 27, fill: CLEAR, border: ['FFFFFFFF', 1], opacity: 0.15 },
    pointer: { from: 17, to: 42, width: 4, colour: 'FF20272B' },
  }),
  // Compact Analog: a small ribbed skirt, a pale shaded cap, a bar in the accent.
  porcelain: () => knob(58, {
    scale: { r: 58, count: 10 },
    housing: { r: 42, fill: ROLES.face, shade: S1.edge, border: ['FF777C79', 1], gear: [7, 38], shadow: [4, 'FF1F292C'] },
    cap: { r: 34, fill: ROLES.face, shade: S1.cap },
    pointer: { from: 10, to: 38, width: 6, colour: ROLES.accent },
  }),
  // Modular Metal: a dark collar ringed in light, a ribbed skirt, a small cap, a pale bar.
  flightdeck: () => knob(57, {
    scale: { r: 57, count: 20, numbers: true },
    housing: { r: 38, fill: 'FF171E1F', border: ['FFD4D7D1', 1], shadow: [5, 'FF3B4140'] },
    skirt: { r: 37, fill: ROLES.face, shade: S1.edge, border: ['FF111819', 1], gear: [8, 31] },
    cap: { r: 26, fill: ROLES.face, shade: S1.cap },
    pointer: { from: 3, to: 33, width: 4, colour: 'FFE4E7DE' },
  }),
  // Performance: a deep rubber grip, a shaded cap, a wedge in the accent.
  stompbox: () => knob(66, {
    scale: { r: 66, count: 10 },
    housing: { r: 51, fill: ROLES.face, shade: S1.edge, border: ['FF1B2426', 2], gear: [16, 46], shadow: [5, 'FF111819'] },
    cap: { r: 38, fill: ROLES.face, shade: S1.cap },
    pointer: { from: 17, to: 48, width: 6, taper: -100, colour: ROLES.accent },
  }),
  // Digital 1986: a low edged disc, a flat face, a short bar.
  switchboard: () => knob(61, {
    scale: { r: 61, count: 20, opacity: 0.45 },
    housing: { r: 46, fill: ROLES.face, shade: S1.edge, shadow: [4, 'FF090D14'] },
    cap: { r: 40, fill: ROLES.face },
    pointer: { from: 23, to: 42, width: 4, colour: ROLES.accent },
  }),
  // Precision: a turned metal face, a shaded cap ringed in light, a dark line, a faint ring.
  chronograph: () => knob(68, {
    scale: { r: 68, count: 24, numbers: true },
    housing: { r: 50, fill: ROLES.face, shade: S1.metal, shadow: [4, 'FF111719'] },
    cap: { r: 39, fill: ROLES.face, shade: S1.cap, border: ['FFCED6D8', 1] },
    insert: { r: 32, fill: CLEAR, border: ['FFDCE1E1', 1], opacity: 0.22 },
    pointer: { from: 12, to: 38, width: 2, colour: 'FF172127' },
  }),
  // Workstation: a fine ribbed skirt, a flat face, a broad tab in the accent.
  'cassette-deck': () => knob(66, {
    scale: { r: 66, count: 16 },
    housing: { r: 50, fill: ROLES.face, shade: S1.edge, border: ['FF131A20', 1], gear: [24, 47], shadow: [6, 'FF101519'] },
    cap: { r: 39, fill: ROLES.face, border: ['FF839098', 1] },
    pointer: { from: 28, to: 47, width: 14, colour: ROLES.accent },
  }),
  // Modern Flat: a value arc round a flat face, a line in the ink.
  diesel: ({ ink }) => knob(59, {
    track: arc(4, ROLES.face),
    cap: { r: 46, fill: ROLES.face },
    pointer: { from: 17, to: 41, width: 3, colour: ink },
  }),
  // Glass Signal: a dark well, a tinted glass disc, a value arc, a glass cap, a line in the accent.
  gemstone: ({ face }) => knob(55, {
    scale: { r: 67, count: 12, opacity: 0.45 },
    track: arc(2.5, null),
    housing: { r: 52, fill: ROLES.housing, shade: S1.well },
    skirt: { r: 50, fill: faint(face, 0.28), border: [lit(face), 1] },
    cap: { r: 43, fill: CLEAR, shade: linear(0.65, 1, [['66EEFAFF', 0], [faint(face, 0.1), 46], ['38E5F5FF', 49], [faint(face, 0.1), 100]]), border: ['40DBEEF6', 1] },
    pointer: { from: 17, to: 45, width: 3, colour: ROLES.accent },
  }),
  // Future Lab: a ring of segments lit to the value, a ringed face, a dark centre, a short bar.
  leatherbound: () => knob(63, {
    scale: { r: 63, count: 23, kind: 'line', length: 7, width: 3, colour: ROLES.face, opacity: 1, activeColour: ROLES.accent },
    housing: { r: 46, fill: ROLES.face, border: ['FF7C929F', 0.8], shadow: [2, 'FF090E15'] },
    cap: { r: 39, fill: ROLES.housing },
    pointer: { from: 22, to: 44, width: 4, colour: ROLES.accent },
  }),

  // Heritage: a ribbed skirt, a shaded cap ringed in light, a dark bar, a fine ring.
  heritage: () => knob(65, {
    scale: { r: 65, count: 10, numbers: true, series: 2 },
    housing: { r: 49, fill: ROLES.face, shade: S2.edge, border: ['FF6D7369', 1], gear: [12, 45], shadow: [5, 'FF111716'] },
    cap: { r: 38, fill: ROLES.face, shade: S2.cap, border: ['FFE0E4D6', 1] },
    insert: { r: 26, fill: CLEAR, border: ['FFA3A798', 0.7] },
    pointer: { from: 18, to: 45, width: 6, colour: 'FF4D5246' },
  }),
  // Pinstripe: an edged skirt, a dark collar, a shaded cap, two fine cream lines.
  pinstripe: () => knob(68, {
    scale: { r: 68, count: 24, numbers: true, series: 2 },
    housing: { r: 55, fill: ROLES.face, shade: S2.edge, shadow: [3, 'FF080D12'] },
    skirt: { r: 49, fill: 'FF191E20', border: ['FF7A8080', 0.8] },
    cap: { r: 36, fill: ROLES.face, shade: S2.cap, border: ['FF596263', 1] },
    pointer: { from: 17, to: 53, width: 4, colour: CLEAR, edge: ['FFE7E2D0', 2] },
  }),
  // Dual Scale: a metal skirt, a collar in the housing colour, a shaded cap, an accent tip past it.
  'dual-scale': () => knob(68, {
    scale: { r: 68, count: 20, numbers: true, series: 2 },
    housing: { r: 53, fill: ROLES.face, shade: S2.metal, shadow: [5, 'FF0D1419'] },
    skirt: { r: 47, fill: ROLES.housing },
    cap: { r: 32, fill: ROLES.face, shade: S2.cap, border: ['FFB7C3C5', 2] },
    insert: { r: 22, fill: CLEAR, border: ['FFD3DBD9', 1], opacity: 0.3 },
    pointer: { from: 39, to: 51, width: 6, colour: ROLES.accent },
  }),
  // Broadcast: a metal skirt, a dished cap, a long dark bar, a faint ring.
  broadcast: () => knob(67, {
    scale: { r: 67, count: 12, series: 2 },
    housing: { r: 52, fill: ROLES.face, shade: S2.metal, border: ['FFACB8B9', 1], shadow: [5, 'FF131C20'] },
    cap: { r: 42, fill: ROLES.face, shade: S2.dish, border: ['FF6F7E80', 1.5] },
    insert: { r: 28, fill: CLEAR, border: ['FFBDC8C6', 1], opacity: 0.3 },
    pointer: { from: 15, to: 50, width: 6, colour: 'FF253238' },
  }),
  // Compact Rack: a square well, a small ribbed skirt, a shaded cap, a pale bar.
  'compact-rack': () => knob(53, {
    scale: { r: 53, count: 10, numbers: true, series: 2 },
    housing: { r: 37.5, fill: ROLES.housing, shade: S2.well, border: ['FF626F6E', 1], rounded: 5 },
    skirt: { r: 33, fill: ROLES.face, shade: S2.edge, border: ['FF172124', 1], gear: [10, 28] },
    cap: { r: 22, fill: ROLES.face, shade: S2.cap },
    pointer: { from: 2, to: 31, width: 4, colour: 'FFEDF0E5' },
  }),
  // Recessed: a shaded well, a dark collar, a flat face, a wedge widening to its tip.
  recessed: () => knob(66, {
    scale: { r: 66, count: 12, series: 2 },
    housing: { r: 55, fill: ROLES.housing, shade: S2.well, border: [ROLES.face, 1.5] },
    skirt: { r: 46, fill: 'FF17232B' },
    cap: { r: 37, fill: ROLES.face, border: ['FF8799A3', 0.7] },
    pointer: { from: 14, to: 41, width: 8, taper: -75, colour: ROLES.accent },
  }),
  // Digital Grid: a square plate, eight square dots round it, an edged disc, a flat face, a bar.
  'digital-grid': () => knob(65, {
    scale: { r: 65, count: 7, kind: 'dot', placement: 'cross', length: 4, width: 4, opacity: 0.7 },
    housing: { r: 57, fill: ROLES.housing, shade: S2.well, border: [ROLES.face, 1], rounded: 4 },
    skirt: { r: 45, fill: ROLES.face, shade: S2.edge },
    cap: { r: 37, fill: ROLES.face },
    pointer: { from: 17, to: 41, width: 6, colour: ROLES.accent },
  }),
  // Studio White: a fine arc and a scale outside it, a pale shaded skirt, a flat face, a line.
  'studio-white': () => knob(65, {
    scale: { r: 71, count: 6, series: 2 },
    track: { bodyTrackBase: { visible: true, 'Layout.height': px(0.8), opacity: 1, 'Background.Fill.colour': ROLES.legend, 'Background.Fill.gradientEnabled': false, 'Background.Border.enabled': false }, bodyTrackFill: { visible: false, 'Layout.height': px(0.8) } },
    housing: { r: 48, fill: ROLES.face, shade: S2.cap, border: ['FFB8C3BF', 1], shadow: [4, 'FFAAB3B0'] },
    cap: { r: 40, fill: ROLES.face },
    pointer: { from: 8, to: 45, width: 3, colour: ROLES.accent },
  }),
  // Arc Line: a value arc, a flat face, a collar in the housing colour, a long line through it.
  'arc-line': () => knob(63, {
    track: arc(2, ROLES.face),
    cap: { r: 38, fill: ROLES.face },
    insert: { r: 30, fill: ROLES.housing, border: null },
    pointer: { from: -2, to: 59, width: 2, colour: ROLES.accent },
  }),
  // Edge Light: a metal skirt, a dark collar, a value arc close round a shaded cap, a glass
  // sheen over the cap, a bar.
  'edge-light': ({ face }) => knob(49, {
    scale: { r: 67, count: 12, series: 2 },
    track: arc(3, null),
    housing: { r: 52, fill: ROLES.face, shade: S2.metal, shadow: [3, 'FF09141D'] },
    skirt: { r: 46, fill: ROLES.housing },
    cap: { r: 39, fill: ROLES.face, shade: S2.cap },
    insert: { r: 39, fill: CLEAR, shade: linear(0.5, 1, [['40FFFFFF', 0], ['05FFFFFF', 48], ['26FFFFFF', 50], [faint(face, 0.05), 100]]) },
    pointer: { from: 19, to: 46, width: 4, colour: ROLES.accent },
  }),
  // Touch Encoder: a thin ring and its value arc, a face, a dark centre, a dot riding the arc,
  // the value in the middle.
  'touch-encoder': () => knob(57, {
    track: arc(3, null),
    skirt: { r: 57, fill: CLEAR, border: [ROLES.face, 1] },
    cap: { r: 46, fill: ROLES.face },
    insert: { r: 39, fill: ROLES.housing, border: null },
    pointer: { kind: 'dot', size: 8, colour: ROLES.accent },
    component: { 'Behavior.labelReadoutPlacement': 'center' },
    parts: { labelValue: { ...readout.labelValue, 'Text.Font.size': px(16) } },
  }),
  // Carbon Pro: a deep ribbed skirt, a shaded cap, an accent bar edged in dark.
  'carbon-pro': () => knob(66, {
    scale: { r: 66, count: 10, series: 2 },
    housing: { r: 53, fill: ROLES.face, shade: S2.edge, border: ['FF1C2A2E', 2], gear: [8, 44], shadow: [4, 'FF111B20'] },
    cap: { r: 33, fill: ROLES.face, shade: S2.cap, border: ['FF748387', 0.7] },
    pointer: { from: 20, to: 46, width: 4, colour: ROLES.accent, edge: ['FF263238', 4] },
  }),

  // The sculpted series, seen from above and in front: a side wall under a top, a cap lifted off
  // it, and the drawing's drop shadow as a soft shadow under the cap.
  // Valve Console: a dark wall, a lit rim in the accent, a domed cap, a cream bar.
  'valve-console': () => knob(67, {
    scale: { r: 67, count: 10, numbers: true, series: 3 },
    housing: { r: 52, oval: 44, at: 6, fill: ROLES.face, shade: S3.side, shadow: [5, 'CC07090A'] },
    skirt: { r: 48, oval: 41, at: -1, fill: ROLES.accent, opacity: 0.55 },
    cap: { r: 40, at: -4, fill: ROLES.face, shade: S3.dome, border: ['FF796552', 2], shadow: [8, 'E6130F0D', 4] },
    pointer: { from: 14, to: 48, width: 8, colour: 'FFEEE1BD' },
  }),
  // Chicken Head: a turned metal plate, a domed chicken-head that turns, a line in the accent.
  'chicken-head': () => knob(69, {
    scale: { r: 69, count: 20, numbers: true, series: 3 },
    housing: { r: 51, fill: ROLES.face, shade: S3.metal, border: [ROLES.accent, 1], shadow: [5, 'FF0B0D0D'] },
    cap: { r: 59, chicken: true, fill: ROLES.face, shade: S3.dome, border: ['FF26211D', 2], shadow: [8, 'BB000000', 4] },
    pointer: { from: 10, to: 54, width: 3, colour: ROLES.accent },
  }),
  // Turret Stack: a wide low turret, a metal top, a stepped cap, a domed boss, a bar in the ink.
  'turret-stack': ({ ink }) => knob(69, {
    scale: { r: 69, count: 24, numbers: true, series: 3 },
    housing: { r: 53, oval: 32, at: 8, fill: ROLES.face, shade: S3.side, shadow: [7, 'FF070B0D'] },
    skirt: { r: 49, oval: 30, fill: ROLES.face, shade: S3.metal },
    cap: { r: 39, oval: 31, at: -8, fill: ROLES.face, shade: S3.metal, border: ['FFD9DFDD', 1], shadow: [9, 'FF293437', 3] },
    insert: { r: 27, oval: 23, at: -11, fill: ROLES.face, shade: S3.dome },
    pointer: { from: 10, to: 39, width: 4, colour: ink },
  }),
  // Deep Flute: a deep fluted star that turns, a domed star on it, a face, a wedge in the accent.
  'deep-flute': () => knob(67, {
    scale: { r: 67, count: 12, series: 3 },
    housing: { r: 54, star: [12, 42], fill: ROLES.face, shade: S3.side, border: ['FF101719', 2], shadow: [10, 'FF080D0E', 4] },
    skirt: { r: 45, star: [12, 37], fill: ROLES.face, shade: S3.dome, border: ['FF718083', 1] },
    cap: { r: 28, fill: ROLES.face },
    pointer: { from: 16, to: 51, width: 6, taper: -133, colour: ROLES.accent },
  }),
  // Concave Studio: a wall, a metal top, a dished cap lifted off it, a dark hollow, a bar.
  'concave-studio': () => knob(69, {
    scale: { r: 69, count: 16, numbers: true, series: 3 },
    housing: { r: 54, oval: 42, at: 4, fill: ROLES.face, shade: S3.side, shadow: [7, 'FF0A1012'] },
    skirt: { r: 49, at: -3, fill: ROLES.face, shade: S3.metal, border: ['FFE5EAE7', 1] },
    cap: { r: 41, at: -3, fill: ROLES.face, shade: S3.dish, border: ['FF536064', 2], shadow: [8, 'B3000000', 4] },
    insert: { r: 28, oval: 22, at: 2, fill: 'FF172126', opacity: 0.72 },
    pointer: { from: 16, to: 45, width: 4, colour: ROLES.accent },
  }),
  // Hex Drive: three hexagons that turn, metal, face and a domed boss, a long bar.
  'hex-drive': () => knob(67, {
    scale: { r: 67, count: 12, numbers: true, series: 3 },
    housing: { r: 54, polygon: 6, fill: ROLES.face, shade: S3.metal, border: ['FFCBD2CF', 2], shadow: [7, 'FF070B0D', 3] },
    skirt: { r: 42, polygon: 6, fill: ROLES.face, border: ['FF354044', 1] },
    cap: { r: 28, polygon: 6, fill: ROLES.face, shade: S3.dome },
    pointer: { from: 15, to: 49, width: 4, colour: ROLES.accent },
  }),
  // Coin Edge: a milled edge that turns, a domed cap, a flat face, a fine line in the ink.
  'coin-edge': ({ ink }) => knob(69, {
    scale: { r: 69, count: 24, numbers: true, series: 3 },
    housing: { r: 52, star: [36, 48], fill: ROLES.face, shade: S3.metal, border: ['FF2D393D', 1], shadow: [9, 'FF080D0F', 3] },
    cap: { r: 43, fill: ROLES.face, shade: S3.dome, border: ['FFDBE0DD', 1] },
    insert: { r: 35, fill: ROLES.face },
    pointer: { from: 12, to: 46, width: 2, colour: ink },
  }),
  // Gimbal Ring: a metal ring, two oval rings that turn across each other, a small domed hub.
  'gimbal-ring': ({ ink }) => knob(70, {
    scale: { r: 70, count: 12, numbers: true, series: 3 },
    housing: { r: 59.5, ring: 9, fill: ROLES.face, shade: S3.metal, shadow: [8, 'FF070C0F', 4] },
    skirt: { r: 47.5, oval: 31.5, ring: 7, turns: true, fill: ROLES.face },
    cap: { r: 24, fill: ROLES.face, shade: S3.dome, border: ['FFD7E2E3', 1] },
    insert: { r: 29, oval: 44, ring: 4, turns: true, fill: ROLES.accent, opacity: 0.7 },
    pointer: { from: 7, to: 27, width: 4, colour: ink },
  }),
  // Lever Dial: a metal plate, a dark well ringed in the face, a small hub, a brushed lever.
  'lever-dial': () => knob(70, {
    scale: { r: 70, count: 20, numbers: true, series: 3 },
    housing: { r: 52, fill: ROLES.face, shade: S3.metal, border: ['FFBFC4BC', 1], shadow: [10, 'FF080C0D', 3] },
    skirt: { r: 37, fill: ROLES.housing, border: [ROLES.face, 1] },
    cap: { r: 18, fill: ROLES.face, shade: S3.dome, border: ['FFD7DDDA', 1], shadow: [6, 'B3000000', 4] },
    pointer: { from: 3, to: 59, width: 16, colour: ROLES.face, shade: S3.metal, edge: ['FF20292B', 1] },
  }),
  // Castellated: a castellated crown that turns, a domed cap, a face, a bar edged in dark.
  castellated: () => knob(68, {
    scale: { r: 68, count: 12, series: 3 },
    housing: { r: 56, star: [8, 43], fill: ROLES.face, shade: S3.side, border: ['FF101719', 3], shadow: [12, 'FF070B0C', 4] },
    cap: { r: 39, fill: ROLES.face, shade: S3.dome, border: ['FF6B7879', 1] },
    insert: { r: 29, fill: ROLES.face },
    pointer: { from: 18, to: 50, width: 4, colour: ROLES.accent, edge: ['FF1C2527', 5] },
  }),
  // Floating Halo: a glowing ring in the accent, a dark wall, a glass cap lifted above it, a face.
  'floating-halo': ({ face, housing }) => knob(70, {
    scale: { r: 70, count: 16, series: 3 },
    housing: { r: 59.5, ring: 5, at: 3, fill: ROLES.accent, opacity: 0.42, shadow: [0, ROLES.accent, 8] },
    skirt: { r: 45, oval: 39, at: 2, fill: ROLES.face, shade: S3.side, shadow: [13, 'E603070A', 3] },
    cap: { r: 43, at: -8, fill: CLEAR, shade: glass3(face, housing), border: [ROLES.accent, 1], shadow: [8, '99000000', 4] },
    insert: { r: 34, at: -8, fill: ROLES.face },
    pointer: { from: 23, to: 50, width: 4, colour: ROLES.accent },
  }),
  // Prism Cap: a fine-toothed glass rim that turns, a faceted face, a bar in the accent.
  'prism-cap': ({ face, housing }) => knob(69, {
    scale: { r: 69, count: 12, numbers: true, series: 3 },
    housing: { r: 52, star: [12, 49], fill: CLEAR, shade: glass3(face, housing), border: ['B3D7F0F0', 1], shadow: [12, 'FF071016', 4] },
    skirt: { r: 49, polygon: 11, fill: faint(face, 0.45), border: ['59FFFFFF', 1] },
    pointer: { from: 16, to: 48, width: 4, colour: ROLES.accent },
  }),
};

/** The direction forms drawn with the knob's parts. */
export const DIRECTION_KNOB_FORMS = Object.keys(DESIGNS).map((id) => `new-${id}`);

/**
 * The family patch that draws direction form `form` (`new-<set id>`) with the knob's parts, or null
 * when it is still drawn by code. `ink` is the set's ink against its surface, `face` and `housing`
 * its surface and track colours as literals (a translucent glass is those colours with an alpha,
 * which a role cannot carry).
 */
export function directionKnobFamily(form, { ink = 'FF20282C', face = 'FFDEDBD2', housing = 'FF171A20' } = {}) {
  const id = String(form ?? '').replace(/^new-/, '');
  const design = DESIGNS[id];
  if (!design || !String(form).startsWith('new-')) return null;
  return design({ ink, face: String(face).replace(/^#/, '').slice(-6), housing: String(housing).replace(/^#/, '').slice(-6) });
}
