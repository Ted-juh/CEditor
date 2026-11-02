// buttonDeviceParts.js — a button's or a switch's own parts.
//
// The button and switch forms drew their devices in code (editor/ControlAnatomy.svelte): a key in
// a housing, a lever on a pivot, a slide in its track. The owner decided that forms become parts
// (docs/design/changeable-control-sets.md, piece B), as the knob's did. These are the parts every
// button and switch has, hidden until a set or the author turns them on, in the order they are
// drawn:
//
//   housing    the plate or well the device sits in
//   guard      a guard, a bezel or a frame round it
//   key        the part that moves: a key that goes down when pressed, a lever, a slide, a rocker
//   symbol     what is printed on it: a bar, a ring, grooves, a grid of cells
//   indicator  a light or a dot that marks the state
//   legend     the state in words: OFF and ON, O and I
//
// Each is a shape in a box (utils/deviceShapes.js), its box a percentage of the device's 160 by 80
// frame, which the form layout places and scales with the caption beside or under it
// (utils/anatomyLayout.js). Pressed or on, a part moves `travelX` and `travelY` % of the frame and
// turns `swing` degrees about its pivot (`pivotX`, `pivotY`, % of its own box), and takes its
// `activeColour` and `activeOpacity` where they are set. A part that `follows` the key moves with
// it: a bar printed on a key, the ball on the end of a lever.


export const BUTTON_DEVICE_TYPES = new Set(['Button', 'MomentaryButton', 'ToggleButton', 'TimedButton', 'OneShotButton']);
export const BUTTON_DEVICE_PARTS = ['housing', 'guard', 'key', 'symbol', 'indicator', 'legend'];
const PART_SET = new Set(BUTTON_DEVICE_PARTS);

/** The device's frame, in the drawing's units: a part's box is a percentage of it. */
export const DEVICE_FRAME = Object.freeze({ width: 160, height: 80 });

// What a device part paints with: its fill and a gradient over it, its border, its corner. Not the
// whole Background section a control has (its fill layers, per-side borders and per-corner shapes):
// six of those on every button that exists made a button three times the size, for parts that are
// hidden on most of them. A finish (Background.Effects.Material) is created where it is written.
function deviceBackground(colour) {
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

function devicePart(name, zIndex, { x = 10, y = 10, width = 80, height = 80, fill = '{surface}' } = {}) {
  const background = deviceBackground(fill);
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
    travelX: 0,
    travelY: 0,
    swing: 0,
    pivotX: 50,
    pivotY: 50,
    follows: '',
    activeColour: '',
    activeOpacity: null,
    ...(name === 'legend' ? { offText: 'OFF', onText: 'ON', fontSize: 11 } : {}),
    _children: {
      Layout: {
        _type: 'PartLayout',
        mode: 'absolute',
        x,
        y,
        width,
        height,
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'percent',
        heightUnit: 'percent',
        anchorX: 'left',
        anchorY: 'top',
        rotation: 0,
      },
      Background: background,
    },
  };
}

/** The six parts, hidden: a button or switch that does not turn them on draws as it always did. */
export function createButtonDeviceParts() {
  return {
    _type: 'Parts',
    _children: {
      housing: devicePart('housing', 0, { fill: '{control.track}' }),
      guard: devicePart('guard', 1, { fill: '{text.primary}' }),
      key: devicePart('key', 2),
      symbol: devicePart('symbol', 3, { fill: '{text.primary}' }),
      indicator: devicePart('indicator', 4, { fill: '{accent}' }),
      legend: devicePart('legend', 5, { fill: '{text.primary}' }),
    },
  };
}

export function isButtonDevicePart(name) {
  return PART_SET.has(String(name));
}

/**
 * Whether a button or switch is drawn with its parts: its key is on. A form it names still draws
 * instead (editor/ControlAnatomy.svelte), so a document that names one looks as it did; "Original
 * parts" draws neither.
 */
export function buttonDeviceDrawn(control) {
  const core = control?._children?.Core ?? {};
  if (!BUTTON_DEVICE_TYPES.has(String(core.controlType ?? ''))) return false;
  // "Original parts" (Core > Control design) is the button's own box, whatever its set draws.
  if (String(core.controlForm ?? '') === 'original') return false;
  return control?._children?.Parts?._children?.key?.visible === true;
}
