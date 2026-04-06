/**
 * Default property trees for each section type.
 * These are the building blocks — every component is assembled from these.
 *
 * Structure matches the ValueTree format:
 *   _type: node type identifier
 *   _children: child nodes (keyed by type name)
 *   all other keys: properties
 */

export const SECTION_DEFAULTS = {

  /** Core — mandatory. The component's identity. */
  Core: {
    _type: 'Core',
    // id is generated at creation time by createControl()
    name: '',
    controlType: '',
    visible: true,
    enabled: true,
    locked: false,
    zIndex: 0,
    alwaysOnTop: false,
    layer: 'Main',
  },

  /** Transform — always present. Position, size, spatial properties. */
  Transform: {
    _type: 'Transform',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    minWidth: 0,
    minHeight: 0,
    maxWidth: 0,    // 0 = no limit
    maxHeight: 0,   // 0 = no limit
    aspectLock: false,
    opacity: 1.0,
    rotation: 0,
  },

  /** Background — visual fill (solid colour, gradient, or image). */
  Background: {
    _type: 'Background',
    mode: 'solid',
    _children: {
      Fill: {
        _type: 'Fill',
        mode: 'solid',
        colour: 'FF3A3A3A',
      },
    },
  },

  /** Text — text content + styling. */
  Text: {
    _type: 'Text',
    content: '',
    _children: {
      Fill: { _type: 'Fill', mode: 'solid', colour: 'FFFFFFFF' },
      Font: { _type: 'Font', family: 'Arial', weight: 'Regular', style: 'Normal', size: 12 },
      Position: { _type: 'Position', justification: 'centred', paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2 },
    },
  },

  /** Border — outline + corners. */
  Border: {
    _type: 'Border',
    enabled: false,
    style: 'solid',
    thickness: 1,
    _children: {
      Fill: { _type: 'Fill', colour: 'FF888888' },
      Corners: { _type: 'Corners', radius: 0 },
    },
  },

  /** Grid — visual grid, cell data, snap. Foundation for arpeggiators, drum pads, etc. */
  Grid: {
    _type: 'Grid',
    enabled: true,
    visible: true,
    columns: 0,
    rows: 0,
    cellWidth: 0,
    cellHeight: 0,
    snap: false,
    size: 10,
    colour: '33FFFFFF',
    lineWidth: 1,
    style: 'lines',
    _children: {
      Cells: { _type: 'Cells' },
      Points: { _type: 'Points' },
    },
  },

  /** Mouse — interaction behavior (cursor, clicks, focus, drag). */
  Mouse: {
    _type: 'Mouse',
    cursor: 'default',
    interceptClicks: true,
    interceptChildClicks: false,
    bringToFrontOnClick: false,
    draggable: false,
    hitTestShape: 'rectangle',
    focusable: false,
    focusOutline: false,
    tabIndex: -1,
  },

  /** Icon — icon/image display. */
  Icon: {
    _type: 'Icon',
    source: 'builtin',
    name: '',
    size: 16,
    _children: {
      Fill: { _type: 'Fill', mode: 'solid', colour: 'FFFFFFFF' },
    },
  },

  /** Shadow — drop or inner shadow. */
  Shadow: {
    _type: 'Shadow',
    enabled: false,
    type: 'drop',
    offsetX: 0,
    offsetY: 2,
    blur: 4,
    spread: 0,
    _children: {
      Fill: { _type: 'Fill', colour: '66000000' },
    },
  },

  /** Children — contains nested Controls. */
  Children: {
    _type: 'Children',
    layout: 'none',
    gap: 0,
    padding: 0,
  },

  /** States — contains named state override children. Starts empty. */
  States: {
    _type: 'States',
    _children: {},
  },

  /** Scripts — Lua code per event trigger. Starts empty. */
  Scripts: {
    _type: 'Scripts',
  },

  /** Animations — named animation definitions. Starts empty. */
  Animations: {
    _type: 'Animations',
    _children: {},
  },
};
