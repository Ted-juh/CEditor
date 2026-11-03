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
// Each is a shape in a box (utils/deviceShapes.js), its box a percentage of the meter's 160 by 100
// frame. `motion` says how a part answers the value, `p` from 0 to 1 along the meter's scale:
//
//   none    it does not
//   fill    it grows from its `fillFrom` edge, 'left' or 'bottom', to its whole box at full scale
//   slide   it moves `travelX` and `travelY` % of the frame at full scale
//   swing   it turns `swing` degrees about its pivot at full scale, from its own rotation
//   light   its cells light up to the value: a cell whose column is at or below it takes the
//           part's `activeColour` and `activeOpacity` and moves `travelX` and `travelY`
//
// A scale is `pattern` 'ticks' (`patternCount` steps along the box's long side, `majorEvery`
// full length and the rest `shapeDepth` % of it) or 'arc' (round the circle in its box, from its
// rotation over `swing` degrees, `shapeDepth` % of the radius long); `tickWidth` thick, and ticks
// past `zoneFrom` (0 to 1) in the `activeColour`. A legend says its `legendText`, or with
// `textSource` 'value' or 'percent' the reading; with `pattern` 'digits' each figure of it in a cell
// of its own, as a part with that pattern lays out one cell per figure.

export const METER_DEVICE_TYPES = new Set(['Meter', 'ProgressBar']);
export const METER_DEVICE_PARTS = ['housing', 'face', 'track', 'scale', 'indicator', 'marker', 'cover', 'legend'];
export const METER_MOTIONS = ['none', 'fill', 'slide', 'swing', 'light'];
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

function meterPart(name, zIndex, fill) {
  return {
    _type: 'Part',
    name,
    role: name,
    visible: false,
    opacity: 1,
    zIndex,
    acceptsStatePatches: true,
    clipChildren: false,
    shape: 'rect',
    shapeDepth: 20,
    pattern: 'solid',
    patternCount: 4,
    patternRows: 3,
    cellWidth: null,
    cellHeight: null,
    motion: 'none',
    fillFrom: 'left',
    travelX: 0,
    travelY: 0,
    swing: 0,
    pivotX: 50,
    pivotY: 50,
    activeColour: '',
    activeOpacity: null,
    majorEvery: 0,
    tickWidth: 1,
    zoneFrom: null,
    ...(name === 'legend' ? { textSource: 'fixed', legendText: '', fontSize: 10, fontFamily: '' } : {}),
    _children: {
      Layout: {
        _type: 'PartLayout',
        mode: 'absolute',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
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

/** The eight parts, hidden: a meter that does not turn them on draws as it always did. */
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
