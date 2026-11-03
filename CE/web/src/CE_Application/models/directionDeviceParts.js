// directionDeviceParts.js — the buttons, switches and meters of the synth sets, as their own parts.
//
// The 36 synth sets (models/physicalControlSets.js, series 1 to 3) drew their buttons, switches and
// meters in code (editor/PhysicalAnatomy.svelte, SynthExpansionAnatomy.svelte,
// SculptedSynthAnatomy.svelte): a key in a well that goes down when pressed and lights its bar, a
// rocker, a piano key, a VU meter's paper and needle, an LED ladder. The owner decided that forms
// become parts (docs/design/changeable-control-sets.md, piece B), as the knobs did
// (models/directionKnobParts.js): each is a family patch of the control's device parts
// (models/buttonDeviceParts.js, models/meterDeviceParts.js), every shape, colour and motion of it a
// property, placed by the form layout as before. The twelve additional designs stay drawn by code.
//
// Each is written as it was drawn, in the drawing's units: a button's in its 160 by 80 device
// frame, a meter's in its 160 by 100 frame, as percentages of them. The colours are the set's roles
// where the drawing used them (face {surface}, housing {control.track}, legends {text.primary},
// indicator {accent}) and the drawing's own literals elsewhere; the shading is the drawing's
// gradients laid over the part's colour, clear where the drawing used the face. A highlight that
// let the dark well show through is that blend, opaque.
//
// Pressed or on, a key goes down as the drawing's did and its bar lights; a rocker tips; a side
// window's lamp rises. A meter's needle swings, a bar fills, a ladder lights to the reading.
//
// Left out, as no part draws them yet: the faint lines across the console keys, a key's border that
// lights (Edge Light, Floating Halo's edge keys keep theirs in the face), the slant of the guard
// keys' bars, Gimbal Ring's frame in metal (a plain edge), the lens keys' highlight line, the second
// needle meter's ticks on Studio Console (its needle is the marker), the curved tick lines of the
// paper meters (an arc of ticks round the curve's centre instead).

import { PHYSICAL_DIRECTIONS } from './physicalControlSets.js';

const ROLES = { face: '{surface}', housing: '{control.track}', legend: '{text.primary}', accent: '{accent}' };
const CLEAR = '00000000';
const pct = (value, of) => Math.round((value / of) * 10000) / 100;
const faint = (colour, alpha) => {
  const hex = String(colour ?? '').replace('#', '');
  return `${Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase()}${hex.slice(-6).toUpperCase()}`;
};

// A box in a frame's units, as the part's layout.
const frame = (W, H) => (x, y, w, h) => ({ 'Layout.x': pct(x, W), 'Layout.y': pct(y, H), 'Layout.width': pct(w, W), 'Layout.height': pct(h, H) });
const atB = frame(160, 80);
const atM = frame(160, 100);
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
const shaded = (gradient) => ({ 'Background.Fill.gradientEnabled': true, 'Background.Fill.gradient': gradient, 'Background.Fill.gradientOpacity': 100 });
// What every part a recipe draws leaves as the factory's: a shape, no pattern, no motion.
const plain = { shape: 'rect', pattern: 'solid', 'Layout.rotation': 0, travelX: 0, travelY: 0, swing: 0, follows: '', activeColour: '', shadowOffset: 0, shadowBlur: 0 };
const meterPlain = { shape: 'rect', pattern: 'solid', 'Layout.rotation': 0, motion: 'none', travelX: 0, travelY: 0, swing: 0, activeColour: '', shadowOffset: 0, shadowBlur: 0 };

// An SVG gradient's direction (x2, y2) from the top-left corner, as a CSS angle.
const angleOf = (x2, y2) => Math.round((180 - (Math.atan2(x2, y2) * 180) / Math.PI) * 10) / 10;
// A device part paints its gradient in SVG, which fades between stops without premultiplying: a
// clear stop fades its neighbours through its own colour. So a clear stop takes its neighbours'
// colours, twice over where they differ: the one before on its way in, the one after on its way out.
function svgStops(stops) {
  const out = [];
  stops.forEach(([color, position], i) => {
    if (!/^00/.test(color)) { out.push({ color, position }); return; }
    const before = stops.slice(0, i).reverse().find(([c]) => !/^00/.test(c))?.[0] ?? color;
    const after = stops.slice(i + 1).find(([c]) => !/^00/.test(c))?.[0] ?? color;
    out.push({ color: `00${before.slice(-6)}`, position });
    if (after.slice(-6) !== before.slice(-6)) out.push({ color: `00${after.slice(-6)}`, position });
  });
  return out;
}
const linear = (x2, y2, stops) => ({ type: 'linear', angle: angleOf(x2, y2), edge: 0, stops: svgStops(stops) });
const radial = (cx, cy, r, stops) => ({ type: 'radial', centerX: cx * 100, centerY: cy * 100, radiusX: r * 100, radiusY: r * 100, edge: 0, stops: svgStops(stops) });

// The drawings' shading. A cap's white highlight was translucent over the dark well under it: the
// blend is the stop here, opaque, over the key's own colour.
const S1 = {
  cap: radial(0.35, 0.2, 0.95, [['FF3E4244', 0], [CLEAR, 35], [CLEAR, 78], ['FF141819', 100]]),
  edge: linear(0.2, 1, [['FF9B9F9E', 0], [CLEAR, 12], ['FF111719', 100]]),
  well: linear(0, 1, [['FF090D0F', 0], [CLEAR, 100]]),
  // Over a key: its sheen; on its own (a meter's glass): the face showing through.
  sheen: linear(0.65, 1, [['66EEFAFF', 0], [CLEAR, 46], ['38E5F5FF', 49], [CLEAR, 100]]),
  glass: (face) => linear(0.65, 1, [['66EEFAFF', 0], [faint(face, 0.1), 46], ['38E5F5FF', 49], [faint(face, 0.1), 100]]),
};
const S2 = {
  cap: radial(0.32, 0.2, 0.9, [['FF4C5154', 0], [CLEAR, 30], [CLEAR, 80], ['FF263238', 100]]),
  well: linear(0.2, 1, [['FF080E13', 0], [CLEAR, 65], ['FF5B6B73', 100]]),
  edge: linear(0.1, 1, [['FF9AA6AA', 0], [CLEAR, 15], ['FF0E181E', 100]]),
  lens: (face) => linear(0.5, 1, [['40FFFFFF', 0], ['05FFFFFF', 48], ['26FFFFFF', 50], [faint(face, 0.05), 100]]),
};
const S3 = {
  side: linear(0, 1, [[CLEAR, 0], ['FF1B2427', 25], ['FF05090B', 100]]),
  dome: radial(0.3, 0.18, 0.86, [['D4FFFFFF', 0], [CLEAR, 22], [CLEAR, 67], ['FF080D10', 100]]),
  metal: linear(0.8, 1, [['C7F6FAF8', 0], [CLEAR, 24], ['FF4C5B5E', 48], [CLEAR, 70], ['FF11191C', 100]]),
  glass: (face, housing) => linear(0.2, 1, [['99FFFFFF', 0], [faint(face, 0.72), 32], [faint(housing, 0.55), 62], ['E6071117', 100]]),
};
// The sculpted series' drop shadow, at its depth: 10.5 units down, 4.8 soft, 83 % black.
const dropB = { shadowOffset: pct(10.5, 80), shadowBlur: pct(4.8, 80), shadowColour: 'D4000000' };
const dropM = { shadowOffset: pct(10.5, 100), shadowBlur: pct(4.8, 100), shadowColour: 'D4000000' };

const pressB = (units) => ({ travelY: pct(units, 80) });
const follows = { follows: 'key' };
const lights = { activeColour: ROLES.accent };

/* --------------------------------------------------------------------------- buttons and switches */

// Series 1: a key in a dark well, its bar lit when pressed or on. The vintage, poly and modular
// switches are rockers in a frame instead.
function series1Key(style, toggle, { ink }) {
  const modern = ['flat', 'glass', 'future', 'digital'].includes(style);
  const r = ['rubber', 'compact'].includes(style) ? 10 : modern ? 3 : 4;
  if (toggle && ['vintage', 'poly', 'modular'].includes(style)) {
    return {
      housing: { ...part(ROLES.face, { ...edge('FF131819', 1), ...radius(4), ...shaded(S1.edge) }), ...plain, ...atB(47, 9, 66, 64) },
      guard: { ...part('FF0C1216', radius(3)), ...plain, ...atB(54, 15, 52, 51) },
      key: { ...part(ROLES.face, { ...edge(ROLES.face, 1), ...shaded(S1.cap) }), ...plain, ...atB(58, 21.5, 44, 38), 'Layout.rotation': 10.3, swing: -20.6, pivotX: 50, pivotY: 50 },
      indicator: { ...part(ink), ...plain, ...atB(70, 27.5, 20, 3), ...lights, ...pressB(4) },
    };
  }
  return {
    housing: { ...part('FF0C1114', { ...edge(modern ? ROLES.face : 'FF657073', 0.8), ...radius(r + 2) }), ...plain, ...atB(21, 13, 118, 59) },
    key: {
      ...part(ROLES.face, { ...edge(modern ? 'FF657987' : 'FF282E30', 0.8), ...radius(r), ...(style === 'glass' ? shaded(S1.sheen) : modern ? {} : shaded(S1.cap)) }),
      ...plain, ...atB(25, 14, 110, 51), ...pressB(3),
    },
    indicator: { ...part(ROLES.housing, radius(1)), ...plain, ...atB(toggle ? 49 : 67, 25, toggle ? 62 : 26, modern ? 3 : 4), ...lights, ...follows },
    symbol: { ...part(ink), ...plain, ...atB(68, 45, 24, 2), opacity: 0.7, ...follows },
  };
}

// Series 2: a cap in a shaded well; a piano key, a slim key, a key with a lamp in a side window,
// a rocker, or a flat key (touch, membrane, an edge lit along it).
function series2Key(key, toggle, { ink }) {
  const well = (x, y, w, h, r, width = 1) => ({ ...part(ROLES.housing, { ...edge(ROLES.face, width), ...radius(r), ...shaded(S2.well) }), ...plain, ...atB(x, y, w, h) });
  const cap = (extra = {}) => part(ROLES.face, { ...shaded(S2.cap), ...extra });
  if (toggle && key === 'rocker') {
    return {
      housing: well(40, 12, 80, 61, 4),
      key: { ...cap(edge('FF889398', 0.7)), ...plain, ...atB(46, 22.5, 68, 39), 'Layout.rotation': 7.5, swing: -15, pivotX: 50, pivotY: 50 },
      indicator: { ...part(ink), ...plain, ...atB(65, 27.5, 30, 3), ...lights, ...pressB(4) },
    };
  }
  if (key === 'piano') {
    return {
      housing: { ...part('FF0B151A', radius(2)), ...plain, ...atB(25, 12, 110, 61) },
      key: { ...cap(edge(ROLES.face, 1)), ...plain, shape: 'bevel', shapeDepth: pct(15, 54), ...atB(29, 14, 102, 54), ...pressB(3) },
      indicator: { ...part(ink), ...plain, ...atB(40, 55.5, 80, 3), ...lights, ...follows },
    };
  }
  if (key === 'status') {
    return {
      housing: well(22, 13, 87, 59, 3),
      key: { ...cap({ ...edge(faint(ink, 0.4), 1), ...radius(2) }), ...plain, ...atB(27, 16, 77, 47), ...pressB(3) },
      guard: { ...part('FF111B22', { ...edge(ROLES.face, 1), ...radius(2) }), ...plain, ...atB(121, 22, 13, 39) },
      indicator: { ...part(ROLES.face), ...plain, ...atB(124, 48, 7, 9), ...lights, ...pressB(-22) },
    };
  }
  if (key === 'slim') {
    return {
      housing: well(49, 8, 62, 68, 4),
      key: { ...cap(radius(3)), ...plain, ...atB(55, 12, 50, 55), ...pressB(3) },
      indicator: { ...part(ink), ...plain, ...atB(66, 28.5, 28, 3), ...lights, ...follows },
    };
  }
  const flat = ['touch', 'membrane', 'edge'].includes(key);
  const parts = {
    housing: well(20, 14, 120, 60, key === 'inset' ? 9 : 2, key === 'edge' ? 2 : 1),
    key: { ...(flat ? part(ROLES.face) : cap()), ...radius(key === 'inset' ? 6 : 1), ...plain, ...atB(26, 18, 108, 47), ...pressB(flat ? 1.2 : 3) },
  };
  if (key === 'membrane') {
    parts.symbol = { ...part(CLEAR, edge(faint(ink, 0.45), 0.7)), ...plain, ...atB(32, 24, 96, 34), ...follows };
    parts.indicator = { ...part(ROLES.housing), ...plain, ...atB(39, 30, 5, 5), ...lights, ...follows };
  } else if (key === 'edge') {
    // Two rules across it, 37 apart, lit when pressed.
    parts.symbol = { ...part(ink), ...plain, ...atB(33, 4.5, 94, 74), pattern: 'lines', patternCount: 2, cellHeight: pct(1.5, 37), ...lights, ...follows };
  } else if (key === 'touch') {
    parts.symbol = { ...part(ROLES.housing), ...plain, ...atB(51, 53.5, 58, 3), ...lights, ...follows };
  } else {
    parts.symbol = { ...part(ink), ...plain, ...atB(38, 22.5, 84, 1), opacity: 0.2, ...follows };
    parts.indicator = { ...part(ROLES.housing, radius(1)), ...plain, ...atB(66, 28, 28, 4), ...lights, ...follows };
  }
  return parts;
}

// Series 3: a shaded case on its drop shadow, a key lifted in it that goes down 4 when pressed: a
// piano key, a rocker, a metal key under a guard's bars, a metal frame round a face, a glass key
// with an edge or a lens, or a domed key; a bar across its foot that lights.
function series3Key(key, toggle, { ink, face, housing }) {
  const parts = {
    housing: { ...part(ROLES.face, { ...edge(ROLES.face, 1), ...radius(key === 'lens' ? 12 : 5), ...shaded(S3.side) }), ...plain, ...atB(20, 13, 120, 62), ...dropB },
    indicator: { ...part(ink), ...plain, ...atB(55, 53.5, 50, 3), ...lights, ...follows },
  };
  const press = pressB(4);
  if (key === 'piano') parts.key = { ...part(ROLES.face, { ...edge('FF171B1B', 1), ...shaded(S3.dome) }), ...plain, shape: 'bevel', shapeDepth: pct(16, 53), ...atB(27, 15, 106, 53), ...press };
  else if (key === 'rocker') parts.key = { ...part(ROLES.face, { ...edge('FF283033', 1), ...shaded(S3.dome) }), ...plain, ...atB(27, 22.75, 106, 40), 'Layout.rotation': 6.5, swing: -13, pivotX: 50, pivotY: 50, ...press };
  else if (key === 'guard') {
    parts.key = { ...part(ROLES.face, { ...radius(2), ...shaded(S3.metal) }), ...plain, ...atB(27, 18, 106, 49), ...press };
    parts.symbol = { ...part(ROLES.accent), ...plain, ...atB(38.5, 22, 83, 41), pattern: 'columns', patternCount: 2, cellWidth: pct(3, 80), ...follows };
  } else if (key === 'frame') {
    // A frame round a face, open between them: the key is its edge.
    parts.key = { ...part(CLEAR, { ...edge(ROLES.face, 7), ...radius(8) }), ...plain, ...atB(28, 19, 104, 47), ...press };
    parts.symbol = { ...part(ROLES.face, radius(4)), ...plain, ...atB(43, 26, 74, 33), ...follows };
  } else if (key === 'edge') parts.key = { ...part(CLEAR, { ...edge(ROLES.face, 3), ...radius(5), ...shaded(S3.glass(face, housing)) }), ...plain, ...atB(27, 19, 106, 47), ...press };
  else if (key === 'lens') parts.key = { ...part(CLEAR, { ...edge('66FFFFFF', 1), ...radius(12), ...shaded(S3.glass(face, housing)) }), ...plain, ...atB(27, 19, 106, 47), ...press };
  else parts.key = { ...part(ROLES.face, { ...edge('FF172023', 1), ...radius(key === 'inset' ? 8 : 3), ...shaded(S3.dome) }), ...plain, ...atB(27, 18, 106, 49), ...press };
  return parts;
}

/* --------------------------------------------------------------------------------------- meters */

// A paper meter: its face, the curve of its scale, ticks round the curve's centre, a needle
// sweeping about the face's foot. `cx` is the needle's x.
function paperMeter({ faceBox, faceColour, bow, ticks, needle, needleColour }) {
  return {
    face: { ...part(faceColour, radius(2)), ...meterPlain, ...atM(...faceBox) },
    track: { ...part(bow.colour), ...meterPlain, shape: 'bow', shapeDepth: pct(1, bow.box[3]), ...atM(...bow.box) },
    scale: ticks ? {
      ...part(bow.colour), ...meterPlain, pattern: 'arc', ...atM(ticks.cx - ticks.r, ticks.cy - ticks.r, ticks.r * 2, ticks.r * 2),
      'Layout.rotation': -ticks.half, swing: ticks.half * 2, majorCount: ticks.count, minorCount: 0,
      majorLength: pct(ticks.length, ticks.r), majorWidth: 1, minorWidth: 1, zoneFrom: null,
    } : { visible: false },
    indicator: {
      ...part(needleColour), ...meterPlain, ...atM(needle.x - needle.width / 2, needle.y - needle.length, needle.width, needle.length),
      'Layout.rotation': -needle.half, motion: 'swing', swing: needle.half * 2, pivotX: 50, pivotY: 100,
    },
  };
}

function series1Meter(style, { face }) {
  const modern = ['flat', 'glass', 'future', 'digital'].includes(style);
  if (style === 'vintage' || style === 'console') {
    const housing = { ...part(ROLES.face, { ...edge('FF101719', 1), ...radius(3), ...shaded(S1.edge) }), ...meterPlain, ...atM(4, 10, 152, 72) };
    if (style === 'vintage') {
      return {
        housing,
        ...paperMeter({
          faceBox: [11, 17, 138, 56], faceColour: 'FFDED6BD',
          bow: { box: [19, 30, 122, 16], colour: 'FF706553' },
          ticks: { cx: 80, cy: 154.3, r: 124.3, half: 28.4, count: 6, length: 4 },
          needle: { x: 80, y: 67, length: 44, width: 1.8, half: 47 }, needleColour: 'FFA5573E',
        }),
        cover: { ...part(CLEAR, shaded(S1.glass(face))), ...meterPlain, ...atM(11, 17, 138, 56) },
      };
    }
    // Two meters side by side: the faces, curves and glasses as two columns, the right needle the marker.
    const left = paperMeter({
      faceBox: [9, 17, 142, 56], faceColour: 'FFDED6BD',
      bow: { box: [17, 30, 126, 16], colour: 'FF706553' },
      ticks: { cx: 43, cy: 59.1, r: 29.1, half: 55.6, count: 6, length: 4 },
      needle: { x: 43, y: 67, length: 44, width: 1.8, half: 47 }, needleColour: 'FFA5573E',
    });
    const columns = { pattern: 'columns', patternCount: 2, cellWidth: pct(68, 74) };
    return {
      housing,
      ...left,
      face: { ...left.face, ...columns },
      track: { ...left.track, ...columns, cellWidth: pct(52, 74) },
      marker: { ...left.indicator, ...atM(117 - 0.9, 23, 1.8, 44) },
      cover: { ...part(CLEAR, shaded(S1.glass(face))), ...meterPlain, ...atM(9, 17, 142, 56), ...columns },
    };
  }
  const parts = {
    housing: { ...part(ROLES.housing, { ...edge(ROLES.face, 1), ...radius(modern ? 3 : 5), ...shaded(S1.well) }), ...meterPlain, ...atM(5, 22, 150, 46) },
    scale: { ...part(ROLES.legend), ...meterPlain, ...atM(13, 72, 134, 4), pattern: 'ticks', majorCount: 5, minorCount: 0, majorLength: 100, majorWidth: 1, minorWidth: 1, opacity: 0.5, zoneFrom: null },
  };
  if (style === 'flat' || style === 'glass') {
    parts.track = { ...part(ROLES.face, radius(2)), ...meterPlain, ...atM(13, 33, 134, 22), opacity: 0.3 };
    parts.indicator = { ...part(ROLES.accent, radius(2)), ...meterPlain, ...atM(13, 33, 134, 22), motion: 'fill', fillFrom: 'left' };
  } else {
    parts.indicator = {
      ...part(ROLES.face, radius(style === 'rubber' ? 1.5 : 0)), ...meterPlain, ...atM(13, 32, 132.5, 24),
      pattern: 'columns', patternCount: 18, cellWidth: pct(5, 7.5), motion: 'light', opacity: 0.22, activeColour: ROLES.accent, activeOpacity: 1,
    };
  }
  if (style === 'glass') parts.cover = { ...part(CLEAR, { ...radius(3), ...shaded(S1.glass(face)) }), ...meterPlain, ...atM(7, 24, 146, 42) };
  return parts;
}

function series2Meter(mode, { face }) {
  if (mode === 'needle') {
    return {
      housing: { ...part(ROLES.face, { ...edge('FF111A20', 1), ...radius(3), ...shaded(S2.edge) }), ...meterPlain, ...atM(8, 12, 144, 69) },
      ...paperMeter({
        faceBox: [15, 19, 130, 54], faceColour: 'FFD8D3BE',
        bow: { box: [25, 26.5, 110, 21.5], colour: 'FF736B56' },
        ticks: { cx: 80, cy: 107.6, r: 81.1, half: 40.8, count: 7, length: 5 },
        needle: { x: 80, y: 67, length: 44, width: 1.6, half: 55 }, needleColour: 'FF9F573D',
      }),
      cover: { ...part(CLEAR, shaded(S2.lens(face))), ...meterPlain, ...atM(15, 19, 130, 54) },
    };
  }
  const parts = {
    housing: { ...part(ROLES.housing, { ...edge(ROLES.face, 1), ...radius(mode === 'dots' ? 6 : 2), ...shaded(S2.well) }), ...meterPlain, ...atM(6, 20, 148, 54) },
    cover: { ...part(ROLES.legend), ...meterPlain, ...atM(14, 78.5, 134, 1), opacity: 0.25 },
  };
  if (mode === 'bar') {
    parts.track = { ...part(ROLES.face), ...meterPlain, ...atM(13, 32, 134, 28), opacity: 0.2 };
    parts.indicator = { ...part(ROLES.accent), ...meterPlain, ...atM(13, 32, 134, 28), motion: 'fill', fillFrom: 'left' };
    parts.marker = { ...part(ROLES.legend), ...meterPlain, ...atM(12.4, 30, 1.2, 32), motion: 'slide', travelX: pct(134, 160) };
  } else if (mode === 'split') {
    const rows = { pattern: 'lines', patternCount: 2, cellHeight: 60 };
    parts.track = { ...part(ROLES.face), ...meterPlain, ...atM(13, 25, 134, 40), ...rows, opacity: 0.2 };
    parts.indicator = { ...part(ROLES.accent), ...meterPlain, ...atM(13, 25, 134, 40), ...rows, motion: 'fill', fillFrom: 'left' };
    parts.marker = { ...part(ROLES.legend), ...meterPlain, ...atM(12.4, 25, 1.2, 40), pattern: 'lines', patternCount: 2, cellHeight: 80, motion: 'slide', travelX: pct(134, 160) };
  } else {
    const cells = { ...part(ROLES.face), ...meterPlain, motion: 'light', opacity: 0.25, activeColour: ROLES.accent, activeOpacity: 1 };
    parts.indicator = mode === 'dots'
      ? { ...cells, shape: 'ellipse', ...atM(14, 44, 127, 4), pattern: 'columns', patternCount: 16, cellWidth: pct(4, 8.2) }
      : mode === 'twin'
        ? { ...cells, ...atM(14, 29, 128.5, 32), pattern: 'grid', patternCount: 16, patternRows: 2, cellWidth: pct(5.5, 8.2), cellHeight: 60 }
        : { ...cells, ...atM(14, 32, 128.5, 28), pattern: 'columns', patternCount: 16, cellWidth: pct(5.5, 8.2) };
  }
  return parts;
}

function series3Meter(mode) {
  const needle = mode === 'needle';
  const parts = {
    housing: { ...part(ROLES.face, { ...edge(ROLES.face, 1), ...radius(needle ? 5 : 10), ...shaded(S3.side) }), ...meterPlain, ...atM(7, 11, 146, 70), ...dropM },
    face: { ...part(needle ? 'FFD9D2B8' : ROLES.housing, radius(4)), ...meterPlain, ...atM(14, 17, 132, 54) },
    cover: { ...part('FFFFFFFF'), ...meterPlain, ...atM(18, 19.5, 124, 1), opacity: 0.15 },
  };
  if (needle) {
    return {
      ...parts,
      ...paperMeter({
        faceBox: [14, 17, 132, 54], faceColour: 'FFD9D2B8',
        bow: { box: [24, 27, 112, 22], colour: 'FF736B56' }, ticks: null,
        needle: { x: 80, y: 67, length: 44, width: 2, half: 55 }, needleColour: ROLES.accent,
      }),
      face: { ...part('FFD9D2B8', radius(4)), ...meterPlain, ...atM(14, 17, 132, 54) },
    };
  }
  const cells = { ...part(ROLES.face, radius(mode === 'dots' ? 2.5 : 1)), ...meterPlain, motion: 'light', opacity: 0.2, activeColour: ROLES.accent, activeOpacity: 1 };
  if (mode === 'split') {
    // Every other cell sits low: the even ones the indicator, the odd ones the marker.
    parts.indicator = { ...cells, ...atM(18, 29, 112.8, 24), pattern: 'columns', patternCount: 8, cellWidth: pct(5, 15.4) };
    parts.marker = { ...cells, ...atM(25.7, 43, 112.8, 24), pattern: 'columns', patternCount: 8, cellWidth: pct(5, 15.4) };
  } else {
    parts.indicator = { ...cells, ...atM(18, 29, 120.5, mode === 'dots' ? 5 : 24), pattern: 'columns', patternCount: 16, cellWidth: pct(5, 7.7) };
  }
  return parts;
}

/* -------------------------------------------------------------------------------------- the API */

const SERIES = new Map(PHYSICAL_DIRECTIONS.map((d) => [d.id, d]));

/** The direction forms whose buttons, switches and meters are parts: the 36 synth sets'. */
export const DIRECTION_DEVICE_FORMS = [...SERIES.keys()].map((id) => `new-${id}`);

const BUTTON_TYPES = ['Button', 'MomentaryButton', 'TimedButton', 'OneShotButton'];

/**
 * The parts that draw direction form `form` (`new-<set id>`) on a control of `type`, or null when it
 * is still drawn by code. `ink` is the set's ink against its surface, `face` and `housing` its surface
 * and track as literals (a glass is those colours with an alpha).
 */
export function directionDeviceParts(type, form, { ink = 'FF20282C', face = 'FFDEDBD2', housing = 'FF171A20' } = {}) {
  const id = String(form ?? '').replace(/^new-/, '');
  const d = SERIES.get(id);
  if (!d || !String(form).startsWith('new-')) return null;
  const colours = { ink, face: String(face).replace('#', '').slice(-6), housing: String(housing).replace('#', '').slice(-6) };
  const series = d.series ?? 1;
  if (type === 'Meter' || type === 'ProgressBar') {
    return series === 3 ? series3Meter(d.meterStyle) : series === 2 ? series2Meter(d.meterStyle, colours) : series1Meter(d.style, colours);
  }
  const toggle = type === 'ToggleButton';
  if (!toggle && !BUTTON_TYPES.includes(type)) return null;
  return series === 3 ? series3Key(d.key, toggle, colours) : series === 2 ? series2Key(d.key, toggle, colours) : series1Key(d.style, toggle, colours);
}
