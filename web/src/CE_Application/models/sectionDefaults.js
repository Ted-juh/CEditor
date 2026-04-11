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

  /** Background — the complete visual shell: fill + border + corners. */
  Background: {
    _type: 'Background',
    mode: 'solid',              // solid / gradient / image / none
    _children: {
      Fill: {
        _type: 'Fill',
        mode: 'solid',
        colour: 'FF3A3A3A',
      },
      Border: {
        _type: 'Border',
        enabled: true,
        linked: true,           // all sides same vs independent
        // --- uniform (when linked: true) ---
        style: 'solid',         // solid / dashed / dotted / double / groove / ridge / inset / outset / none
        thickness: 2,
        dotRadius: 2,           // dot size (radius) when style is 'dotted'; thickness becomes gap between dots
        colour: 'FFFFFFFF',
        // --- fill modes (per-side, multi-selectable) ---
        fillSolid: true,        // solid colour fill active
        fillGradient: false,    // gradient fill active
        fillImage: false,       // image fill active
        fillOverlay: false,     // overlay fill active
        imageSrc: '',           // data URL for image fill
        overlaySrc: '',         // data URL for overlay fill
        gradient: null,         // gradient data { type, angle, stops, ... }
        // --- double line (when style is 'double') ---
        doubleGap: 2,                 // gap between the two lines
        // --- per-side (when linked: false) ---
        top:    { style: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null },
        right:  { style: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null },
        bottom: { style: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null },
        left:   { style: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null },
      },
      Corners: {
        _type: 'Corners',
        linked: true,           // all corners same vs independent
        // --- uniform (when linked: true) ---
        borderEnabled: true,    // border draws around corners
        radius: 0,
        style: 'rounded',      // rounded / chamfer / notch / straight
        direction: 'outward',   // outward / inward
        borderStyle: 'solid',   // solid / dashed / dotted / double / groove / ridge / inset / outset  (line style, same as sides)
        thickness: 2,           // border thickness at corners (gap between dots when dotted)
        dotRadius: 2,           // dot size (radius) when borderStyle is 'dotted'
        doubleGap: 2,           // gap between the two lines (when borderStyle is 'double')
        doubleAnchor: 'center', // center / outer / inner
        doubleDirection: 'outward', // inward / outward
        colour: 'FFFFFFFF',     // border colour at corners
        // --- fill modes (per-corner, multi-selectable) ---
        fillSolid: true,
        fillGradient: false,
        fillImage: false,
        fillOverlay: false,
        imageSrc: '',
        overlaySrc: '',
        gradient: null,
        cornerGradientMode: 'radial',  // 'radial' | 'tangential' | 'inherit'
        cornerGradientFlip: false,     // reverse direction for radial / tangential
        cornerGradientInheritSide: 'A', // 'A' or 'B' — for top-left: A=top, B=left
        // --- per-corner (when linked: false) ---
        topLeft:     { radius: 0, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
        topRight:    { radius: 0, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
        bottomLeft:  { radius: 0, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
        bottomRight: { radius: 0, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
        // sideA/sideB mapping:
        //   TL: sideA = top edge,    sideB = left edge
        //   TR: sideA = top edge,    sideB = right edge
        //   BL: sideA = bottom edge, sideB = left edge
        //   BR: sideA = bottom edge, sideB = right edge
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

  // Border is now part of Background._children.Border (not a standalone section).

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

  /** Effects — shadows, bevel/emboss, CSS filters, blend mode. */
  Effects: {
    _type: 'Effects',
    _children: {
      Shadows: {
        _type: 'Shadows',
        items: [
          { enabled: false, type: 'drop', offsetX: 0, offsetY: 2, blur: 4, spread: 0, colour: '66000000' },
        ],
      },
      Bevel: {
        _type: 'Bevel',
        enabled: false,
        style: 'outer-bevel',    // outer-bevel / inner-bevel / emboss / pillow-emboss
        depth: 100,
        size: 5,
        softness: 0,
        angle: 135,
        highlightColour: 'FFFFFF',
        highlightOpacity: 75,
        shadowColour: '000000',
        shadowOpacity: 75,
      },
      Filters: {
        _type: 'Filters',
        blur: 0,
        brightness: 100,
        contrast: 100,
        saturation: 100,
        hueRotate: 0,
        grayscale: 0,
        sepia: 0,
        invert: 0,
      },
      Blend: {
        _type: 'Blend',
        mode: 'normal',
      },
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
