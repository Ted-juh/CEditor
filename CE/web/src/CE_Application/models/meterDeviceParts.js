// meterDeviceParts.js — a meter's own parts.
//
// The twelve meter forms drew their dials, columns and tallies in code (editor/ControlAnatomy.svelte).
// As the knob's and the button's did, they become the control's own parts
// (docs/design/changeable-control-sets.md, piece B), hidden until a set or the author turns them
// on, in the order they are drawn:
//
//   housing    the case or plate the meter sits in
//   face       its window, dial face or paper
//   track      what the value runs along, unlit: a bar's groove, a column's glass
//   scale      its marks: ticks along a line or round an arc, a zone of them in another colour
//   indicator  what shows the value: a fill, a cursor, a needle or cells that light
//   marker     a second moving piece: a cursor's head, a peak mark
//   cover      over the rest: a needle's hub, a glass's gloss, a capsule's sheen
//   legend     words or figures: VU, the value, the percentage
//
//   lamp       a clip lamp: it lights when the reading reaches a level, and holds
//
// Each is a shape in a box (utils/deviceShapes.js), its box a percentage of the meter's 160 by 100
// frame. `motion` says how a part answers the reading `p` (0 to 1 along the meter's scale), or with
// `source` 'peak' the held peak the meter keeps (Meter.peakHoldMs, Meter.peakDecayPerSec):
//
//   none    it does not
//   fill    it grows from its `fillFrom` edge (left, right, bottom, top) to its whole box at full scale
//   slide   it moves `travelX` and `travelY` % of the frame at full scale
//   swing   it turns `swing` degrees about its pivot at full scale, from its own rotation
//   light   its cells light up to the reading, counted from its `lightFrom` edge (left or bottom): a
//           lit cell takes the part's `activeColour` and `activeOpacity` and moves `travelX`/`travelY`
//   clip    it lights, in its active colour, while the held peak is at or above `clipFrom` (0 to 1),
//           so it holds for the meter's peak hold time
//
// `zoneColours` colours a part from the meter's own colour zones (Meter.zones, stepped or blended
// as Meter.gradient says): 'position' paints each part of a fill, each lit cell and each tick in the
// zone it sits in, as an LED ladder; 'level' paints the part in the zone of the reading, as a needle
// that turns red. 'off' keeps its own colours.
//
// A scale is `pattern` 'ticks' (along the box's long side) or 'arc' (round the circle in its box,
// from its rotation over `swing` degrees): `majorCount` long ticks with `minorCount` short ones
// between each pair, each kind its own length (`majorLength`, `minorLength`: % of the box's short
// side, or of the radius) and width (`majorWidth`, `minorWidth`); ticks past `zoneFrom` (0 to 1)
// in its `activeColour`; `numerals` on the long ticks, in `numeralUnits` ('reading', 'db' or
// 'percent'), `numeralSize`, `numeralPlacement` 'outside' or 'inside'. A legend says its
// `legendText`, or with `textSource` 'value' or 'percent' the reading; with `pattern` 'digits' each
// figure of it in a cell of its own, as a part with that pattern lays out one cell per figure.

export const METER_DEVICE_TYPES = new Set(['Meter', 'ProgressBar']);
export const METER_DEVICE_PARTS = ['housing', 'face', 'track', 'scale', 'indicator', 'marker', 'cover', 'legend', 'lamp'];
export const METER_MOTIONS = ['none', 'fill', 'slide', 'swing', 'light', 'clip'];
export const METER_PATTERNS = ['solid', 'lines', 'grid', 'columns', 'ticks', 'arc', 'digits'];
const PART_SET = new Set(METER_DEVICE_PARTS);

/** The meter's frame, in the drawing's units: a part's box is a percentage of it. */
export const METER_FRAME = Object.freeze({ width: 160, height: 100 });

// What a meter part paints with: as a button part's, a fill with a gradient over it, a border and
// a corner, and a finish created where it is written.
function meterBackground(colour) {
  return {
    _type: 'Background',
    mode: 'solid',
    _children: {
      Fill: { _type: 'Fill', colour, gradientEnabled: false, gradient: null, gradientOpacity: 100, imageEnabled: false, overlayEnabled: false },
      Border: { _type: 'Border', enabled: false, colour: 'FF000000', thickness: 1 },
      Corners: { _type: 'Corners', radius: 0 },
    },
  };
}

function meterPart(name, zIndex, fill, extra = {}) {
  return {
    _type: 'Part',
    name,
    role: name,
    visible: false,
    opacity: 1,
    zIndex,
    acceptsStatePatches: true,
    clipChildren: false,
    shape: name === 'lamp' ? 'ellipse' : 'rect',
    shapeDepth: 20,
    // A drawn outline (utils/deviceShapes.js `path`), and its outline pressed or on.
    shapePath: '',
    shapePathOn: '',
    pattern: 'solid',
    patternCount: 4,
    patternRows: 3,
    cellWidth: null,
    cellHeight: null,
    // A clip lamp is one from the start: turned on, it lights at its level, in the top right corner.
    motion: name === 'lamp' ? 'clip' : 'none',
    fillFrom: 'left',
    travelX: 0,
    travelY: 0,
    swing: 0,
    pivotX: 50,
    pivotY: 50,
    lightFrom: 'left',
    source: 'reading',
    activeColour: name === 'lamp' ? '{accent.hot}' : '',
    activeOpacity: null,
    zoneColours: 'off',
    clipFrom: 0.9,
    zoneFrom: null,
    ...(name === 'scale' ? {
      majorCount: 5, minorCount: 0, majorLength: 100, minorLength: 50, majorWidth: 1, minorWidth: 1,
      numerals: false, numeralSize: 7, numeralPlacement: 'outside', numeralUnits: 'reading',
    } : {}),
    ...(name === 'legend' ? { textSource: 'fixed', legendText: '', fontSize: 10, fontFamily: '' } : {}),
    _children: {
      Layout: {
        _type: 'PartLayout',
        mode: 'absolute',
        ...(name === 'lamp' ? { x: 87.5, y: 6, width: 6.25, height: 10 } : { x: 10, y: 10, width: 80, height: 80 }),
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'percent',
        heightUnit: 'percent',
        anchorX: 'left',
        anchorY: 'top',
        rotation: 0,
      },
      Background: meterBackground(fill),
    },
  };
}

/** The nine parts, hidden: a meter that does not turn them on draws as it always did. */
export function createMeterDeviceParts() {
  return {
    _type: 'Parts',
    _children: {
      housing: meterPart('housing', 0, '{control.track}'),
      face: meterPart('face', 1, '{surface}'),
      track: meterPart('track', 2, '{text.primary}'),
      scale: meterPart('scale', 3, '{text.primary}'),
      indicator: meterPart('indicator', 4, '{accent}'),
      marker: meterPart('marker', 5, '{accent}'),
      cover: meterPart('cover', 6, '{text.primary}'),
      legend: meterPart('legend', 7, '{text.primary}'),
      lamp: meterPart('lamp', 8, '{control.track}'),
    },
  };
}

export function isMeterDevicePart(name) {
  return PART_SET.has(String(name));
}

/**
 * Whether a meter is drawn with its parts: one of them is on (a counter shows its value in figures,
 * with no indicator). A form it names still draws instead (editor/ControlAnatomy.svelte), so a
 * document that names one looks as it did; "Original parts" draws neither.
 */
export function meterDeviceDrawn(control) {
  const core = control?._children?.Core ?? {};
  if (!METER_DEVICE_TYPES.has(String(core.controlType ?? ''))) return false;
  if (String(core.controlForm ?? '') === 'original') return false;
  const parts = control?._children?.Parts?._children ?? {};
  return METER_DEVICE_PARTS.some((name) => parts[name]?.visible === true);
}

/**
 * Whether a meter's parts need the held peak: one that is drawn shows it, or is a clip lamp. The
 * preview keeps the peak for it as it does for Peak Hold (editor/PanelPreviewSurface.svelte).
 */
export function meterNeedsPeak(control) {
  if (!meterDeviceDrawn(control)) return false;
  const parts = control?._children?.Parts?._children ?? {};
  return METER_DEVICE_PARTS.some((name) => parts[name]?.visible === true
    && (String(parts[name].source ?? '') === 'peak' || String(parts[name].motion ?? '') === 'clip'));
}
