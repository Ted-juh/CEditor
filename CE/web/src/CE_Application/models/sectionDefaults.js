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
    tooltip: '',
    screenReaderText: '',
    stylePreset: '',
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
    scale: 1,
  },

  /** Background — the complete visual shell: fill + border + corners. */
  Background: {
    _type: 'Background',
    mode: 'solid',              // legacy primary layer / fallback
    _children: {
      Fill: {
        _type: 'Fill',
        mode: 'solid',          // legacy primary layer / fallback
        layerOrder: ['solid', 'gradient', 'image', 'overlay'],
        colour: 'FF3A3A3A',
        solidEnabled: true,
        solidBlend: 'normal',
        solidClipMode: 'shape',
        solidMuted: false,
        gradientEnabled: false,
        gradientOpacity: 100,
        gradientName: '',
        gradientBlend: 'normal',
        gradientClipMode: 'shape',
        gradientMuted: false,
        gradient: null,
        imageEnabled: false,
        imageMuted: false,
        imageSrc: '',
        imageOpacity: 100,
        imageFit: 'fill',
        imageAlign: 'center',
        imageOffsetX: 0,
        imageOffsetY: 0,
        imageBlend: 'normal',
        imageBlur: 0,
        imageTint: 'FFFFFF',
        imageFlipH: false,
        imageFlipV: false,
        imageRotation: 0,
        imageGrayscale: false,
        imageSaturation: 100,
        imageBrightness: 100,
        imageContrast: 100,
        imageTileScale: 1.0,
        imageClipMode: 'shape',
        overlayEnabled: false,
        overlayMuted: false,
        overlaySrc: '',
        overlayOpacity: 100,
        overlayFit: 'tile',
        overlayAlign: 'center',
        overlayOffsetX: 0,
        overlayOffsetY: 0,
        overlayBlend: 'normal',
        overlayBlur: 0,
        overlayTint: 'FFFFFF',
        overlayFlipH: false,
        overlayFlipV: false,
        overlayRotation: 0,
        overlayGrayscale: false,
        overlaySaturation: 100,
        overlayBrightness: 100,
        overlayContrast: 100,
        overlayTileScale: 1.0,
        overlayClipMode: 'shape',
        soloLayer: '',
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
        gradientFlow: 'across', // across / follow
        // --- double line (when style is 'double') ---
        doubleGap: 2,                 // gap between the two lines
        // --- per-side (when linked: false) ---
        top:    { style: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across' },
        right:  { style: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across' },
        bottom: { style: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across' },
        left:   { style: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across' },
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
        gradientFlow: 'across',       // across / follow
        cornerGradientMode: 'radial',  // 'radial' | 'tangential' | 'inherit'
        cornerGradientFlip: false,     // reverse direction for radial / tangential
        cornerGradientInheritSide: 'A', // 'A' or 'B' — for top-left: A=top, B=left
        // --- per-corner (when linked: false) ---
        topLeft:     { radius: 0, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across', cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
        topRight:    { radius: 0, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across', cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
        bottomLeft:  { radius: 0, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across', cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
        bottomRight: { radius: 0, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: 'FFFFFFFF', fillSolid: true, fillGradient: false, fillImage: false, fillOverlay: false, imageSrc: '', overlaySrc: '', gradient: null, gradientFlow: 'across', cornerGradientMode: 'radial', cornerGradientFlip: false, cornerGradientInheritSide: 'A' },
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
    editable: false,               // may an LCD edit zone rewrite this text? (Labels)
    _children: {
      Fill: {
        _type: 'Fill',
        mode: 'solid',
        colour: 'FFFFFFFF',
        order: 50,
        gradientEnabled: false,
        gradientName: '',
        gradient: null,
        imageEnabled: false,
        imageSrc: '',
        imageOpacity: 100,
        imageFit: 'cover',
        imageAlign: 'center',
        imageOffsetX: 0,
        imageOffsetY: 0,
        imageTint: 'FFFFFFFF',
        imageRotation: 0,
        imageTileScale: 1,
        textureEnabled: false,
        textureSrc: '',
        textureOpacity: 100,
        textureTint: 'FFFFFFFF',
        textureOffsetX: 0,
        textureOffsetY: 0,
        textureRotation: 0,
        textureTileScale: 1,
      },
      Font: {
        _type: 'Font',
        family: 'Arial',
        weight: 'Regular',
        weightValue: 400,
        style: 'Normal',
        size: 12,
        caseMode: 'normal',
        scriptMode: 'normal',
        baselineShift: 0,
        ligatures: true,
        stylisticAlternates: false,
        oldstyleFigures: false,
        tabularFigures: false,
        fractions: false,
        slashedZero: false,
        variationAxes: {},
        underline: false,
        strikethrough: false,
        overline: false,
        wordSpacing: 0,
        letterSpacing: 0,
        underlineOffset: 0,
        underlineThickness: 1,
        underlineColour: '',
        underlineInsetLeft: 0,
        underlineInsetRight: 0,
        underlineGap: 0,
        underlineLayer: 'back',
        strikethroughOffset: 0,
        strikethroughThickness: 1,
        strikethroughColour: '',
        strikethroughInsetLeft: 0,
        strikethroughInsetRight: 0,
        strikethroughGap: 0,
        strikethroughLayer: 'back',
        overlineOffset: 0,
        overlineThickness: 1,
        overlineColour: '',
        overlineInsetLeft: 0,
        overlineInsetRight: 0,
        overlineGap: 0,
        overlineLayer: 'back',
      },
      Multiline: {
        _type: 'Multiline',
        wrapMode: 'word',
        paragraphMode: 'normal',
        paragraphWidth: 100,
        fillWidthMode: 'none',
        justifyLastLine: false,
        lastLineAlign: 'inherit',
        overflowMode: 'clip',
        maxLines: 0,
        fitMode: 'none',
        lineHeight: 1.2,
      },
      Effects: {
        _type: 'TextEffects',
        outlineEnabled: false,
        outlineWidth: 1,
        outlineThickness: 1,
        outlineDistance: 0,
        outlineFill: true,
        outlineColour: 'FF000000',
        outlineJoin: 'round',
        outlinePlacement: 'outer',
        outlineDashEnabled: false,
        outlineDashLength: 8,
        outlineDashGap: 4,
        outlineOrder: 40,
        stroke2Enabled: false,
        stroke2Placement: 'inner',
        stroke2Thickness: 1,
        stroke2Colour: 'FFFFFFFF',
        stroke2DashEnabled: false,
        stroke2DashLength: 6,
        stroke2DashGap: 3,
        stroke2Order: 45,
        knockout: false,
        shadowEnabled: false,
        shadowStyle: 'soft',
        shadowOffsetX: 1,
        shadowOffsetY: 1,
        shadowBlur: 2,
        shadowDistance: 12,
        shadowSteps: 8,
        shadowColour: '80000000',
        shadowOrder: 10,
        glowEnabled: false,
        glowSize: 4,
        glowIntensity: 1,
        glowColour: '80FFFFFF',
        glowOrder: 20,
        innerGlowEnabled: false,
        innerGlowSize: 3,
        innerGlowColour: '80FFFFFF',
        innerGlowOrder: 80,
        innerShadowEnabled: false,
        innerShadowOffsetX: 1,
        innerShadowOffsetY: 1,
        innerShadowBlur: 2,
        innerShadowColour: '80000000',
        innerShadowOrder: 60,
        blurEnabled: false,
        blurAmount: 1,
        motionEnabled: false,
        motionAngle: 0,
        motionDistance: 8,
        motionSteps: 4,
        motionColour: '80FFFFFF',
        motionOrder: 30,
        bevelEnabled: false,
        bevelStyle: 'emboss',
        bevelDepth: 1.5,
        bevelHighlightColour: '99FFFFFF',
        bevelShadowColour: '99000000',
        bevelOrder: 60,
        reflectionEnabled: false,
        reflectionAngle: 90,
        reflectionDistance: 8,
        reflectionIntensity: 0.45,
        reflectionBlur: 2,
        reflectionFadeMode: 'none',
        reflectionFadeAmount: 0,
        reflectionColour: 'FFFFFFFF',
        reflectionOrder: 5,
        copyEnabled: false,
        copyOffsetX: 2,
        copyOffsetY: 2,
        copyBlur: 0,
        copyColour: 'FF000000',
      },
      Position: {
        _type: 'Position',
        justification: 'centred',
        readingOrientation: 'ltr',
        flowMode: 'rotate',
        flowAngle: 0,
        flowStepX: 8,
        flowStepY: 8,
        flowRadius: 48,
        flowSweep: 180,
        flowDistribution: 'natural',
        flowFacing: 'path',
        flowSide: 'center',
        flowReverse: false,
        flowStartOffset: 0,
        flowFixedAdvance: 0,
        flowAmplitude: 18,
        flowFrequency: 1,
        flowTurns: 2,
        flowPerimeterInset: 0,
        flowStairUnit: 'character',
        flowPathStartX: 0,
        flowPathStartY: 50,
        flowPathC1X: 33,
        flowPathC1Y: 0,
        flowPathC2X: 66,
        flowPathC2Y: 100,
        flowPathEndX: 100,
        flowPathEndY: 50,
        flowPolylinePoints: [
          { x: 0, y: 50 },
          { x: 33, y: 20 },
          { x: 66, y: 80 },
          { x: 100, y: 50 },
        ],
        flowFreehandPoints: [
          { x: 0, y: 50 },
          { x: 20, y: 25 },
          { x: 45, y: 75 },
          { x: 70, y: 15 },
          { x: 100, y: 50 },
        ],
        orientation: 'horizontal',
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 0,
        paddingBottom: 0,
        offsetX: 0,
        offsetY: 0,
      },
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
    source: 'library',
    assetId: '',
    name: '',
    size: 16,
    fit: 'contain',
    tint: 'FFFFFFFF',
    opacity: 1,
    rotation: 0,
    flipH: false,
    flipV: false,
    _children: {
      Fill: { _type: 'Fill', mode: 'solid', colour: 'FFFFFFFF' },
      Effects: {
        _type: 'IconEffects',
        shadowEnabled: false,
        shadowOffsetX: 0,
        shadowOffsetY: 2,
        shadowBlur: 4,
        shadowColour: '66000000',
        glowEnabled: false,
        glowSize: 4,
        glowColour: '66FFFFFF',
        blurEnabled: false,
        blurAmount: 0,
      },
    },
  },

  /** Content Layout — shared text/icon arrangement. */
  ContentLayout: {
    _type: 'ContentLayout',
    mode: 'text_only',
    horizontalAlign: 'center',
    verticalAlign: 'center',
    gap: 8,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 6,
    paddingBottom: 6,
    textOffsetX: 0,
    textOffsetY: 0,
    iconOffsetX: 0,
    iconOffsetY: 0,
    textAboveIcon: true,
    textZIndex: 2,
    iconZIndex: 1,
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

  /**
   * Display — the LCD/segment screen surface. Panel technology, character grid,
   * lit/unlit palette, backlight, contrast and glass realism. The text shown on
   * the screen lives here (lines) so the LCD renders self-contained.
   */
  Display: {
    _type: 'Display',
    panelType: 'character',        // character | segment | graphic
    segmentType: '16',             // 7 | 9 | curved9 | 14 | 16
    pixelWidth: 0,                 // graphic mode pixel columns (0 = auto from cols)
    pixelHeight: 0,                // graphic mode pixel rows (0 = auto from rows)
    imageSrc: '',                  // graphic mode: image to dither onto the grid
    imageDither: true,             // Floyd–Steinberg dither vs hard threshold
    // Graphic-mode animation layer (plays behind the zones/text):
    animMode: 'off',               // off | file (GIF/APNG/sprite sheet) | preset
    animSrc: '',                   // uploaded animation file (data URL)
    animFrames: 0,                 // sprite-sheet frame count (0 = animated file)
    animFps: 12,                   // sprite-sheet playback rate
    animLoop: true,                // loop, or hold the last frame
    animPreset: 'wave',            // wave | scanner | rain | starfield | spinner | plasma
    animSpeed: 1,                  // preset speed multiplier
    palette: 'greenStn',           // preset palette id (see LcdDisplayRenderer)
    rows: 2,
    cols: 16,
    lines: ['PATCH:INIT VOICE', 'VOL120  PAN C   '],
    litColour: 'FF2BE86A',         // lit phosphor (foreground)
    unlitColour: '242BE86A',       // faint unlit "ghost" segment
    screenColour: 'FF06371C',      // screen substrate behind the pixels
    backlightOn: true,
    backlightColour: 'FF0E5A2E',   // backlight wash
    brightness: 100,               // 0..100 (foreground intensity)
    contrast: 55,                  // 0..100 (LCD trim-pot feel)
    brightnessSourceId: '',        // range control that drives brightness live in preview
    backlightSourceId: '',         // switch/button control that drives the backlight on/off
    glassTint: '14FFFFFF',         // glass sheen overlay
    showGlass: true,               // draw the diagonal glass sheen overlay
    showGhost: true,               // faint unlit cells behind the text
    showScanlines: false,          // horizontal scanline overlay
    showGrid: false,               // faint pixel/cell grid lines
    dotMatrix: false,              // render glyphs as a dot grid (dot-matrix look)
    dotShape: 'round',             // round | square
    dotPitch: 0,                   // dot cell size px (0 = auto from cell size)
    charSpacing: 1,                // extra px between characters
    lineSpacing: 3,                // extra px between rows
    padding: 10,                   // inset from the bezel to the screen
    fontScale: 1,                  // relative glyph size
    // Motion (driven by a rAF ticker in the renderer)
    scroll: 'off',                 // off | left | right (marquee for long lines)
    scrollSpeed: 4,                // characters per second
    scrollMode: 'loop',            // loop | bounce (ping-pong)
    scrollGap: 3,                  // blank chars between loop repeats
    scrollRepeat: 0,               // 0 = infinite; N = scroll N times then settle
    blink: false,                  // blink the lit text on/off
    blinkRate: 500,                // ms per blink half-cycle
    cursor: 'off',                 // off | block | underline
    cursorRow: 0,
    cursorCol: 0,
    cursorBlink: true,
    // Value-driven display: lines can contain {value}, {pct}, {bar} / {bar:N}
    // tokens that expand from this value. It's the binding target for device
    // parameters / routed component values.
    value: 64,
    valueMin: 0,
    valueMax: 127,
    valuePrecision: 0,
    valuePrefix: '',
    valueSuffix: '',
    valueSourceId: '',             // Core.id of a panel control whose value drives
                                   // this display in preview ('' = use static value)
    // Extra value fields for multi-source displays. Field 1 is the primary
    // value above; fields[] are addressed as {v2}/{p2}/{b2}, {v3}/... in lines.
    // Each: { sourceId, value, min, max, precision, prefix, suffix }.
    fields: [],
    // Zones / layouts / pages. When layouts is non-empty the display composes its
    // rows from the active layout's zones instead of the lines/tokens above.
    // layout: { id, name, zones:[ { id,name,row,colStart,colEnd,show,sourceId,
    //   text,label,precision,prefix,suffix,radix,align,priority,visible } ] }.
    layouts: [],
    // pages: which layout is active. selector maps a control's value to a layout;
    // overlays transiently show a layout on a trigger for a duration / until change.
    pages: {
      defaultLayoutId: '',
      selectorSourceId: '',
      selectorMap: [],             // [{ when, layoutId }]
      overlays: [],                // [{ id, layoutId, sourceId, duration, dismiss }]
    },
    // Which controls count as "@active" (Core.ids). Empty = any control.
    activeScope: [],
    // Editable text field (e.g. a preset name). A zone with show:'edit' bound to
    // the reserved "@edit" source displays this buffer; in preview the screen is
    // focusable and edits it live (keyboard type/caret, or a knob/wheel cycling
    // the character under the caret). It's a named, bindable text value so it can
    // later drive a device patch-name parameter.
    editText: 'INIT',              // the current string
    editCharset: 'upper',          // upper | alnum | ascii | digits
    editMaxLength: 16,             // 0 = unbounded
  },

  /**
   * Pixel — a free-pixel dot-matrix surface (OLED/GLCD style). Everything is
   * addressed in grid pixels: elements are placed at (x, y, w, h) on a
   * pixelsW × pixelsH grid — no character rows/columns.
   */
  Pixel: {
    _type: 'Pixel',
    pixelsW: 128,                  // grid resolution (pixels)
    pixelsH: 64,
    palette: 'oledWhite',
    litColour: 'FFF2F2F2',
    unlitColour: '14FFFFFF',
    screenColour: 'FF000000',
    backlightOn: true,
    backlightColour: '4D0E5A2E',   // subtle green wash (was fully transparent: an "on" backlight that painted nothing)
    brightness: 100,
    contrast: 55,
    brightnessSourceId: '',        // range control that drives brightness live in preview
    backlightSourceId: '',         // switch control that drives the backlight on/off
    glassTint: '14FFFFFF',
    showGlass: true,
    showGhost: true,               // faint unlit dots
    showScanlines: false,
    dotShape: 'round',             // round | square
    gamma: 1,                      // brightness response curve (>1 lifts mids)
    glow: 0,                       // 0..1 bloom halo under lit dots
    showGrid: false,               // design-time grid overlay (editor aid, not painted at runtime)
    snapGrid: 0,                   // snap element drags to this pixel step (0 = free)
    padding: 8,                    // bezel inset (screen px, not grid px)
    imageSrc: '',                  // static image dithered onto the grid
    imageDither: true,
    imageColour: false,            // keep the image's colours (posterized) vs 1-bit
    animColour: false,             // global anim: colour frames / hue-cycling presets
    // Animation layer (plays behind the elements) — same engine as the LCD.
    animMode: 'off',
    animSrc: '',
    animFrames: 0,
    animSpriteCols: 0,             // sprite columns (0 = single horizontal strip)
    animFps: 12,
    animLoop: true,
    animPreset: 'wave',
    animSpeed: 1,
    // Which controls count as "@active" (Core.ids). Empty = any control.
    activeScope: [],
    // On-screen editable text (an 'edit' element bound to '@edit' shows/edits
    // this buffer; the same edit engine as the LCD).
    editText: 'INIT',              // the current string
    editCharset: 'upper',          // upper | alnum | ascii | digits
    editMaxLength: 16,             // 0 = unbounded
    // Optional custom bitmap font from a glyph sprite sheet. Elements set
    // font:'custom' to use it. { src(dataURL), glyphW, glyphH, cols, first(charCode) }.
    customFont: null,
    // The scene: pixel-addressed elements. Each:
    // { id, kind (static|name|value|pct|midiValue|note|text|state|
    //   hbar|vbar|hslider|vslider|needle), x, y, w, h, sourceId, align,
    //   precision, prefix, suffix, label, radix, frame, ticks, peakHold,
    //   smooth, visible }
    // Text kinds draw at (x, y) with font height h (w > 0 clips/aligns);
    // widget kinds fill the (x, y, w, h) rect.
    elements: [],
    // Layouts/pages (same engine as the LCD): when layouts is non-empty the
    // active layout's elements replace the flat list above.
    // layout: { id, name, elements: [...] }
    layouts: [],
    layoutTransition: 'none',      // none | fade | slide — animate on layout switch
    transitionMs: 250,
    pages: {
      defaultLayoutId: '',
      selectorSourceId: '',
      selectorMap: [],             // [{ when, layoutId }]
      overlays: [],                // [{ id, layoutId, sourceId, duration, dismiss }]
    },
  },

  /** Behavior — interaction family, role, and value model. */
  Behavior: {
    _type: 'Behavior',
    buttonType: 'momentary',
    subtype: 'action',
    family: 'trigger',
    role: 'button',
    valueType: 'none',
    defaultValue: null,
    fireOn: 'onRelease',
    activeWhileHeld: false,
    repeatEnabled: false,
    repeatDelay: 300,
    repeatInterval: 120,
    allowUncheck: true,
    allowDeselect: false,
    visualStyle: 'radio',
    wrapBehavior: true,
    holdDuration: 1200,
    requiredClicks: 2,
    clickWindow: 350,
    disableAfterUse: true,
    lockoutDuration: 0,
    selectionMode: 'none',
    enumValues: [],
    wrapEnum: false,
    groupId: '',
    allowMixed: false,
    uncheckOnClick: false,
    pressMode: 'pressRelease',
    toggleOn: 'release',
    orientation: 'horizontal',
    itemColumns: 0,
    geometry: 'linear',
    valueMode: 'single',
    direction: 'ltr',
    min: 0,
    max: 1,
    step: 1,
    defaultCurrentValue: 0,
    defaultStartValue: 0,
    defaultEndValue: 1,
    centerValue: 0.5,
    fillOrigin: 'min',
    circularDiameter: 0,
    startAngle: 135,
    sweepAngle: 270,
    allowWrapAround: false,
    allowHandleCross: false,
    activeHandlePolicy: 'currentFirst',
    trackClickMode: 'moveNearestHandle',
    keyboardEnabled: true,
    focusable: true,
    activationKeys: ['Enter', 'Space'],
    arrowKeyAdjust: false,
    pageKeyAdjust: false,
    homeEndAdjust: false,
    dragEnabled: false,
    wheelEnabled: false,
    reverseMouseDirection: false,
    snapToStep: true,
    snapToTicks: false,
    emitValueCommit: false,
    emitActiveHandleChange: false,
    showTicks: true,
    majorTickCount: 11,
    minorTickCount: 3,
    majorTickLength: 12,
    minorTickLength: 7,
    tickPlacement: 'outside',
    showMinMaxLabels: true,
    showHandleLabels: false,
    showValueReadout: true,
    showCenterMarker: false,
    labelMinMaxPlacement: 'auto',
    labelMinMaxGap: 22,
    labelMinMaxOffsetX: 0,
    labelMinMaxOffsetY: 0,
    labelReadoutPlacement: 'auto',
    labelReadoutGap: 14,
    labelReadoutOffsetX: 0,
    labelReadoutOffsetY: 0,
    precision: 2,
    prefix: '',
    suffix: '',
    unit: '',
    rangeSeparator: ' - ',
    bandSeparator: ' | ',
    showSign: false,
    emitClick: true,
    emitValueChange: false,
    emitStateChange: true,
  },

  /** Value — user-facing display/internal/send mapping rows. */
  Value: {
    _type: 'Value',
    showMapping: false,
    rows: [],
    // Cascading selectors: id of the parent selector this list depends on
    // ('' = independent). When set, only rows whose `parentValue` matches the
    // parent's current selection (or is blank = shown for all) are visible.
    dependsOn: '',
    dependsResetOnChange: true, // reset this list's pick when the parent changes
    // Export a selector's choice by its stable name (internalValue) instead of
    // a bare row index — so the saved/automated value round-trips even when the
    // visible rows change (cascading lists). Default keeps the numeric index.
    storeByValue: false,
    segmentStyle: {
      shared: {},
      rows: {},
    },
  },

  /** Listbox — display + behaviour options for the always-open list component. */
  Listbox: {
    _type: 'Listbox',
    // --- Layout / appearance ---
    rowHeight: 0,                 // 0 = auto from font size; else fixed px
    density: 'comfortable',       // comfortable | compact (auto row height tweak)
    selectionStyle: 'bar',        // bar | stripe | outline | check | bold
    accentColour: '',             // selection colour (empty = Background border colour)
    zebra: false,                 // alternating row stripes
    cardRows: false,              // gaps + rounded corners per row
    showIcons: true,              // render per-row icons when present
    twoLine: false,               // show row subtitles on a second line
    showBadges: true,             // render per-row trailing badges
    showSwatch: false,            // render the per-row colour stripe/dot
    fadeEdges: false,             // top/bottom fade to hint scroll
    scrollbar: 'auto',            // auto | always | hidden | thin
    emptyText: 'No items',        // shown when there are no rows
    // --- Scroll / navigation ---
    scrollMode: 'line',           // line | smooth
    momentum: false,              // inertial flick scrolling (smooth mode)
    dragScroll: false,            // grab-and-swipe the list
    keyboardNav: true,            // arrows / page / home / end move selection
    scrollIntoView: true,         // keep the selected row visible
    // --- Search ---
    typeAhead: 'off',             // off | prefix | fuzzy — focus + type to jump
    filterBox: false,             // header search field that live-filters rows
    highlightMatch: true,         // highlight the matched substring
    // --- Interaction / animation ---
    hoverHighlight: true,         // highlight the row under the pointer
    hoverAnim: 'none',            // none | glow | slide | scale | icon
    selectionAnim: false,         // animate the selection indicator between rows
    confirmMode: 'single',        // single | double | enter — when a pick "commits"
    multiSelect: false,           // checkbox / ctrl-click multi-selection
    // --- Data (preset browser) ---
    choiceSource: 'rows',         // rows | devicePresets
    recallOnSelect: false,        // fire the bound recall action on select/confirm
    nowPlaying: false,            // mark the live/recalled row distinct from selection
  },

  /** Meter — a read-only, value-driven level meter (bar / vertical / arc). */
  Meter: {
    _type: 'Meter',
    orientation: 'horizontal',    // horizontal | vertical | arc
    // Value + range. In preview the value comes from valueSourceId (a range
    // control's live value); at runtime the bound `level` device port drives it.
    value: 0.72,                  // static/test value (in value units)
    valueMin: 0,
    valueMax: 1,
    valueSourceId: '',            // Core.id of a control whose value drives this meter
    scale: 'linear',             // linear | db
    dbFloor: -60,                 // dB at the bottom (scale = db)
    dbCeil: 6,                    // dB at the top
    // Fill styling.
    segments: 0,                  // 0 = continuous fill; N = N discrete LED segments
    segmentGap: 2,                // px gap between segments
    gradient: true,               // blend zone colours smoothly (vs hard steps)
    trackColour: 'FF1B1B1B',      // unlit background
    fillColour: 'FF39D98A',       // used when no zones are configured
    thickness: 0,                 // bar/arc thickness px (0 = fill the box)
    rounded: 3,                   // fill corner radius (bar)
    // Threshold zones (green → amber → red). Each lights from `from` (0..1) up.
    zones: [
      { from: 0.0, colour: 'FF39D98A' },
      { from: 0.7, colour: 'FFF2C94C' },
      { from: 0.9, colour: 'FFEB5757' },
    ],
    // Peak-hold marker.
    peakHold: false,
    peakHoldMs: 1200,             // hold before the marker starts falling
    peakDecayPerSec: 0.4,         // normalized units/sec the marker falls after hold
    peakColour: 'FFF2F2F2',
    // Scale ticks + labels.
    showTicks: false,
    tickCount: 4,
    showScaleLabels: false,       // print value/dB at the ticks
    // Numeric readout.
    showValue: false,
    valuePrecision: 0,
    valuePrefix: '',
    valueSuffix: '',
    // Caption.
    label: '',
    labelPosition: 'none',        // none | above | below
    // Arc geometry (orientation = arc): clockwise from 3 o'clock in SVG space.
    arcStart: 135,
    arcSweep: 270,
  },

  /** Macro — one knob driving many assignments (depth · curve · range) via fan-out. */
  Macro: {
    _type: 'Macro',
    value: 0.28,                  // knob position 0..1
    editable: true,
    showLanes: true,              // show the assignment lanes (vs knob only)
    showValues: true,             // per-lane live value readout
    label: 'Macro',
    // Value-scale divisions on the lane meters — same generator as the sliders.
    showDivisions: false,
    majorTickCount: 5,
    minorTickCount: 0,
    // Assignments: each maps the macro position to a bound device parameter with
    // its own depth (−1..1; sign = direction), curve and output range. Each slot
    // is a bindable port ("Destination").
    slots: [
      { id: 'm0', label: 'Filter Cutoff', depth: 1.0, curve: 'linear', min: 0, max: 1, enabled: true, colour: 'FF39D98A' },
      { id: 'm1', label: 'Reverb Mix', depth: 0.6, curve: 'linear', min: 0, max: 1, enabled: true, colour: 'FF5B9BD5' },
      { id: 'm2', label: 'Osc Detune', depth: -0.4, curve: 'linear', min: 0, max: 1, enabled: true, colour: 'FFF2C94C' },
      { id: 'm3', label: 'Drive', depth: 1.0, curve: 'exp', min: 0, max: 1, enabled: true, colour: 'FFF2994A' },
    ],
    // Colours.
    knobColour: 'FF23232A',
    arcColour: 'FF5B9BD5',
    trackColour: 'FF0E0E12',
    labelColour: 'FFB9B9B9',
  },

  /** Constellation — your preset library as a 2D map of stars; a probe recalls
   *  (snap) or morphs (blend) between them; links show sonic neighbours. */
  Constellation: {
    _type: 'Constellation',
    probeX: 0.5,                  // probe position 0..1
    probeY: 0.5,
    mode: 'blend',               // snap (recall nearest) | blend (morph)
    blendPower: 2,               // blend sharpness
    running: false,              // wander (auto-drift the probe)
    wanderRate: 0.08,            // wander cycles per second
    editable: true,              // drag the probe / stars in preview
    showLinks: true,             // constellation lines between similar presets
    linkCount: 2,                // k nearest neighbours per preset
    showField: true,
    showLabels: true,
    // Targets: the bindable dimensions each preset stores (target_N ports).
    targets: [
      { id: 'cutoff', label: 'Filter Cutoff', colour: 'FF39D98A' },
      { id: 'reso', label: 'Resonance', colour: 'FF5B9BD5' },
      { id: 'drive', label: 'Drive', colour: 'FF9B8AFF' },
    ],
    // Presets: stars on the map, each a patch (value per target).
    presets: [
      { id: 's0', label: 'Deep Pad', x: 0.2, y: 0.25, colour: 'FF5B9BD5', values: { cutoff: 0.2, reso: 0.3, drive: 0.1 } },
      { id: 's1', label: 'Warm Keys', x: 0.32, y: 0.5, colour: 'FF9B8AFF', values: { cutoff: 0.42, reso: 0.35, drive: 0.15 } },
      { id: 's2', label: 'Glass Bell', x: 0.72, y: 0.3, colour: 'FF39D98A', values: { cutoff: 0.72, reso: 0.2, drive: 0.2 } },
      { id: 's3', label: 'Bright Lead', x: 0.82, y: 0.68, colour: 'FFF2C94C', values: { cutoff: 0.9, reso: 0.55, drive: 0.6 } },
      { id: 's4', label: 'Screamer', x: 0.68, y: 0.85, colour: 'FFF2994A', values: { cutoff: 0.95, reso: 0.85, drive: 0.95 } },
      { id: 's5', label: 'Sub Bass', x: 0.18, y: 0.78, colour: 'FFEB5757', values: { cutoff: 0.15, reso: 0.5, drive: 0.4 } },
    ],
    // Colours.
    fieldColour: 'FF0C0C12',
    probeColour: 'FFF2C94C',
    linkColour: '332A6BA8',
    labelColour: 'FFB9B9B9',
  },

  /** Timbre — a 2D "sound map": axes are musical meanings, anchors are patches,
   *  and the puck blends them (inverse-distance) into every target's value. */
  Timbre: {
    _type: 'Timbre',
    x: 0.5,                       // puck position 0..1
    y: 0.5,
    power: 2,                     // blend sharpness (higher = anchors dominate sooner)
    editable: true,              // drag the puck / anchors in preview
    axisX: 'dark → bright',
    axisY: 'soft → aggressive',
    showField: true,             // heat/contour field
    showAnchors: true,
    showReadout: true,           // "N of M targets MIDI-addressable"
    // Morph targets: each a bindable dimension ("target_N" port). Anchors store a
    // value per target id; the puck blends them.
    targets: [
      { id: 'cutoff', label: 'Filter Cutoff', colour: 'FF39D98A' },
      { id: 'reso', label: 'Resonance', colour: 'FF5B9BD5' },
      { id: 'drive', label: 'Drive', colour: 'FF9B8AFF' },
    ],
    // Anchors: named patches placed on the pad, each with a value per target.
    anchors: [
      { id: 'a0', label: 'Deep Pad', x: 0.15, y: 0.2, colour: 'FF5B9BD5', values: { cutoff: 0.2, reso: 0.3, drive: 0.1 } },
      { id: 'a1', label: 'Screaming Lead', x: 0.85, y: 0.85, colour: 'FFF2994A', values: { cutoff: 0.95, reso: 0.8, drive: 0.9 } },
      { id: 'a2', label: 'Glass Bell', x: 0.85, y: 0.2, colour: 'FF39D98A', values: { cutoff: 0.7, reso: 0.2, drive: 0.2 } },
      { id: 'a3', label: 'Soft Keys', x: 0.15, y: 0.8, colour: 'FF9B8AFF', values: { cutoff: 0.45, reso: 0.4, drive: 0.05 } },
    ],
    // Colours.
    fieldColour: 'FF0C0C12',
    puckColour: 'FFF2C94C',
    labelColour: 'FFB9B9B9',
  },

  /** Router — shape an incoming signal (mod wheel / aftertouch / breath / a linked
   *  control) through a transfer curve, then fan it to many device parameters. */
  Router: {
    _type: 'Router',
    source: 'modwheel',          // ROUTER_INPUT_SOURCES id
    sourceControlId: '',         // when source = 'link': the on-panel control to follow
    inputChannel: 0,             // MIDI sources: channel to watch (0 = omni)
    ccNumber: 1,                 // when source = 'cc': the controller number
    polyMode: 'highest',         // per-note aftertouch → one value: highest | last
    testInput: 0.5,              // fallback when that controller hasn't been seen (0..1)
    invert: false,               // flip the input before the curve
    deadzone: 0,                 // low-end dead-zone 0..1 (rescales the rest)
    editable: true,              // drag the transfer-curve nodes in preview
    showGrid: true,
    // Value-scale divisions on the destination meters — same generator as sliders.
    showDivisions: false,
    majorTickCount: 5,
    minorTickCount: 0,
    // Transfer curve: normalized breakpoints (x = shaped input, y = output).
    curve: [
      { id: 'c0', x: 0, y: 0, curve: 'linear' },
      { id: 'c1', x: 0.5, y: 0.4, curve: 'scurve' },
      { id: 'c2', x: 1, y: 1, curve: 'linear' },
    ],
    // Destinations: each maps the shaped value to a bound parameter with its own
    // depth (−1..1; sign = direction) + output range. Each is a bindable port.
    destinations: [
      { id: 'r0', label: 'Filter Cutoff', depth: 1.0, min: 0, max: 1, enabled: true, colour: 'FF39D98A' },
      { id: 'r1', label: 'LFO Depth', depth: 0.6, min: 0, max: 1, enabled: true, colour: 'FF5B9BD5' },
      { id: 'r2', label: 'Drive', depth: 0.3, min: 0, max: 1, enabled: true, colour: 'FF9B8AFF' },
    ],
    // Colours.
    curveColour: 'FF39D98A',
    inputColour: 'FFF2C94C',
    fieldColour: 'FF0A0A0F',
    gridColour: '18FFFFFF',
    labelColour: 'FFB9B9B9',
  },

  /** Turing — a looping shift-register of stepped values you can lock or let
   *  mutate; emits the current step's value, a gate and its inverse (fan-out). */
  Turing: {
    _type: 'Turing',
    phase: 0,                     // global loop clock 0..1 (advanced by the ticker)
    running: true,               // advance the sequence in preview / player
    rate: 2,                      // steps per second
    length: 8,                    // loop length in steps
    randomness: 0.25,            // 0 = locked loop, 1 = new value every step
    quantizeLevels: 0,           // 0 = continuous; ≥2 = snap values to N levels
    gateThreshold: 0.5,          // gate port fires when a step ≥ this
    editable: true,              // drag step bars to seed/edit the sequence
    showGate: true,
    // Value-scale divisions — the same major/minor tick generator the sliders use.
    showDivisions: false,
    majorTickCount: 5,           // major division lines across the value range
    minorTickCount: 0,           // minor lines between each pair of majors
    // The register — one value 0..1 per step (a musical-ish seed sequence).
    steps: [0.2, 0.8, 0.5, 1.0, 0.35, 0.65, 0.1, 0.9],
    // Colours.
    barColour: 'FF39D98A',
    headColour: 'FFF2C94C',
    fieldColour: 'FF0E0E13',
    labelColour: 'FFB9B9B9',
  },

  /** Looper — record your own control motion as a loopable clip that replays into
   *  a device parameter on the clock. Each lane is a bindable fan-out port. */
  Looper: {
    _type: 'Looper',
    phase: 0,                     // global loop clock 0..1 (advanced by the ticker)
    running: true,               // play the loops in preview / player
    loopSeconds: 4,              // loop length (seconds)
    editable: true,              // allow recording / scrubbing in preview
    showPlayhead: true,
    showGrid: true,
    quantizeLoop: false,         // snap the loop length to whole beats (visual aid)
    // Value-scale divisions — the same major/minor tick generator the sliders use.
    showDivisions: false,
    majorTickCount: 5,
    minorTickCount: 0,
    // Lanes: each records a value-over-loop gesture (sorted {t,v} points, 0..1),
    // emitted live via its bindable "Lane N" port. `rest` = value when empty.
    lanes: [
      { id: 'g0', label: 'Filter Cutoff', points: [], rest: 0, enabled: true, colour: 'FF39D98A' },
      { id: 'g1', label: 'Resonance', points: [], rest: 0, enabled: true, colour: 'FF5B9BD5' },
    ],
    // Colours.
    laneColour: 'FF0E0E13',
    gridColour: '22FFFFFF',
    playheadColour: 'FFFFFFFF',
    labelColour: 'FFB9B9B9',
  },

  /** ChordPad — PLAYS the synth: key/scale-aware pads that emit MIDI notes.
   *  Two layouts: wheel (circle of fifths) or grid. Not a parameter control. */
  ChordPad: {
    _type: 'ChordPad',
    layout: 'wheel',              // wheel (circle of fifths) | grid
    mode: 'chords',               // chords | notes
    key: 0,                       // tonic pitch class (0 = C)
    scale: 'major',               // see SCALES in chordPadLayout.js
    chordType: 'triad',           // triad | seventh
    voicing: 'close',             // close | spread | drop2
    inversion: 0,
    baseOctave: 4,                // tonic octave (4 → middle C)
    octave: 0,                    // transpose in octaves
    noteSpan: 2,                  // notes mode: octaves of scale notes
    velocity: 96,
    channel: 1,                   // MIDI channel 1-16
    strumMs: 0,                   // stagger between chord notes (0 = block chord)
    latch: false,                 // pads stay held until tapped again
    editable: true,               // play the pads in preview
    showPiano: true,              // the sounding-notes keyboard strip
    showRomans: true,             // roman numerals on the pads
    gridCols: 4,
    // Note input echo: light the pads from INCOMING MIDI, so the pad doubles as
    // a chord analyser. echoChannel 0 = omni.
    echo: false,
    echoChannel: 0,
    echoColour: 'FF39D98A',
    // Colours.
    fieldColour: 'FF101017',
    padColour: 'FF171720',
    inKeyColour: 'FF5B9BD5',
    tonicColour: 'FFF2C94C',
    minorColour: 'FF9B8AFF',
    labelColour: 'FFB9B9B9',
  },

  /** Arp — PLAYS the synth: walks a set of held notes on the clock. Notes come
   *  from its own key/scale chord, or from a linked Chord Pad. Not a parameter
   *  control, so (like ChordPad) it carries no DeviceBindings. */
  Arp: {
    _type: 'Arp',
    running: true,
    source: 'chord',              // chord (its own) | link (a Chord Pad) | input (MIDI in)
    linkId: '',                   // control id of the Chord Pad to follow
    inputChannel: 0,              // source 'input': MIDI channel to watch (0 = omni)
    pattern: 'up',                // see ARP_PATTERNS in arpLayout.js
    rate: 6,                      // steps per second (free-running)
    syncToTransport: false,       // follow the panel's Transport instead of `rate`
    division: '1/16',             // step length when synced (see DIVISIONS)
    octaves: 1,                   // repeat the note set upward
    gate: 0.6,                    // note length as a fraction of the step
    swing: 0,                     // 0 = straight, 1 = max shuffle (delays odd steps)
    latch: false,                 // keep arpeggiating after the source releases
    // Its own chord (source = 'chord').
    key: 0,                       // tonic pitch class (0 = C)
    scale: 'minor',
    degree: 0,                    // scale degree the chord is built on
    chordType: 'triad',           // triad | seventh
    baseOctave: 3,
    velocity: 96,
    channel: 1,                   // MIDI channel 1-16
    // Euclidean rest pattern + hand mutes.
    euclidEnabled: false,
    euclidSteps: 8,
    euclidPulses: 5,
    euclidRotate: 0,
    mutes: [],                    // step indices silenced by hand
    editable: true,               // click a step to mute it in preview
    showNotes: true,              // note names in the step cells
    showHeader: true,             // the pattern / rate / source strip
    phase: 0,
    // Colours.
    fieldColour: 'FF101017',
    stepColour: 'FF5B9BD5',
    headColour: 'FFF2C94C',
    restColour: 'FF2A2A34',
    labelColour: 'FFB9B9B9',
  },

  /** NoteRibbon — PLAYS the synth: a strip you slide along for pitch. Scale-snap,
   *  chromatic, or continuous glide via pitch bend. Like ChordPad/Arp it emits
   *  notes rather than driving a parameter, so it has no DeviceBindings. */
  NoteRibbon: {
    _type: 'NoteRibbon',
    mode: 'snap',                 // snap (in-key only) | chromatic | glide (pitch bend)
    orientation: 'horizontal',    // horizontal | vertical
    key: 0,                       // tonic pitch class (0 = C)
    scale: 'major',
    baseNote: 48,                 // lowest note on the strip (C3)
    octaves: 2,                   // how far the strip reaches
    bendRange: 2,                 // glide: semitones, MUST match the synth's setting
    velocity: 96,
    velocityFrom: 'fixed',        // fixed | position (across the strip)
    channel: 1,                   // MIDI channel 1-16
    modAxis: 'none',              // none | cc — the cross axis as an expression dimension
    modCc: 1,                     // which CC that axis sends (1 = mod wheel)
    latch: false,                 // the note keeps sounding after release
    editable: true,               // play the strip in preview
    showNames: true,              // note names on the zones
    showHeader: true,             // key / mode / current-note strip
    // Note input echo: light the zones from INCOMING MIDI (0 = omni channel).
    echo: false,
    echoChannel: 0,
    echoColour: 'FF39D98A',
    // Colours.
    fieldColour: 'FF101017',
    zoneColour: 'FF171720',
    inKeyColour: 'FF5B9BD5',
    rootColour: 'FFF2C94C',
    touchColour: 'FFF2C94C',
    labelColour: 'FFB9B9B9',
  },

  /** DrumPads — PLAYS the synth: a grid of fixed-note trigger pads (the MPC/Push
   *  idiom). Every pad is pinned to one note, with choke groups and velocity from
   *  the strike position. No DeviceBindings — it emits notes. */
  DrumPads: {
    _type: 'DrumPads',
    rows: 4,
    cols: 4,
    map: 'gm',                    // gm (GM drum kit) | chromatic | custom
    baseNote: 36,                 // pad 1's note (36 = GM Bass Drum 1)
    origin: 'bottomLeft',         // bottomLeft (hardware) | topLeft (reading order)
    mode: 'momentary',            // momentary | oneShot | toggle
    gateMs: 60,                   // one-shot: how long the note is held
    velocity: 100,
    velocityFrom: 'fixed',        // fixed | position (top of the pad = harder)
    channel: 10,                  // GM percussion channel
    editable: true,               // play the pads in preview
    showNotes: true,              // the MIDI note number on each pad
    showLabels: true,             // the drum name on each pad
    showHeader: true,             // map / channel / last-hit strip
    // Note input echo: light the pads from INCOMING MIDI, so the grid doubles as
    // a monitor for whatever a sequencer is playing (0 = omni channel).
    echo: false,
    echoChannel: 0,
    echoColour: 'FF39D98A',
    // Per-pad overrides — index-aligned, sparse. Each may set label, note,
    // colour (AARRGGBB) and choke (0 = none). Anything omitted falls back to
    // the generated map, so renaming one pad doesn't mean writing all sixteen.
    pads: [],
    // Colours.
    fieldColour: 'FF101017',
    padColour: 'FF171720',
    accentColour: 'FF5B9BD5',
    hitColour: 'FFF2C94C',
    labelColour: 'FFB9B9B9',
  },

  /** Panic — silence everything: the notes this panel is holding, the echoed
   *  note display, and whatever the SYNTH is still holding after a lost
   *  note-off. Emits MIDI, so no DeviceBindings. */
  Panic: {
    _type: 'Panic',
    label: 'PANIC',
    scope: 'all',                 // all (16 channels) | channel
    channel: 1,                   // when scope = 'channel'
    resetControllers: true,       // also send CC 121, for a stuck mod wheel
    centreBend: true,             // also recentre pitch bend
    clearLocal: true,             // silence this panel's own note controls too
    showSummary: true,            // the second line saying what it will do
    editable: true,
    // Colours.
    faceColour: 'FF2A1416',
    borderColour: 'FFE05C5C',
    labelColour: 'FFF2C94C',
    flashColour: 'FFE05C5C',
  },

  /** Transport — the master clock. Everything time-based used to run on its own
   *  steps-per-second and could not lock to anything; this is what they sync to.
   *  Emits MIDI clock rather than driving a parameter, so no DeviceBindings. */
  Transport: {
    _type: 'Transport',
    bpm: 120,
    source: 'internal',           // internal | external (follow MIDI clock in)
    beatsPerBar: 4,
    beatUnit: 4,
    runOnLoad: false,             // start the clock as soon as the panel opens
    clockOut: false,              // send MIDI clock — 24 messages per quarter note
    editable: true,               // press play / tap tempo in preview
    showPosition: true,           // the bar.beat.tick readout
    showTap: true,                // the tap-tempo button
    // Colours.
    faceColour: 'FF141420',
    accentColour: 'FF39D98A',
    beatColour: 'FFF2C94C',
    labelColour: 'FFB9B9B9',
  },

  /** Constraint — linked parameters that always preserve a relationship the synth
   *  can't express (sum=100% / ordered / ratio / mirror); each is a fan-out port. */
  Constraint: {
    _type: 'Constraint',
    mode: 'sum',                  // sum | order | ratio | mirror | free
    minGap: 0,                    // order mode: minimum gap between members
    editable: true,              // drag the member bars in preview
    showValues: true,
    showBadge: true,             // the rule badge (Σ=100% / a≤b≤c / …)
    // Members: the linked parameters. Each is a bindable "Member" port.
    members: [
      { id: 'c0', label: 'Osc 1', value: 0.5, colour: 'FF39D98A' },
      { id: 'c1', label: 'Osc 2', value: 0.3, colour: 'FF5B9BD5' },
      { id: 'c2', label: 'Noise', value: 0.2, colour: 'FF9B8AFF' },
    ],
    // Colours.
    fieldColour: 'FF0E0E13',
    trackColour: '18FFFFFF',
    linkColour: '55F2C94C',
    labelColour: 'FFB9B9B9',
  },

  /** Kinetic — a physics "bouncing ball": gravity + wall-bounce + drag drive a
   *  ball in a box; emits x / y / speed / bounce as modulation (fan-out). */
  Kinetic: {
    _type: 'Kinetic',
    running: true,               // integrate the physics in preview / player
    gravity: 0,                   // downward pull (0 = zero-g billiard)
    restitution: 0.92,           // wall bounce energy kept (1 = perpetual)
    friction: 0.04,              // air drag per second
    keepAlive: 0.35,             // re-kick strength when the ball nearly stalls
    editable: true,              // fling the ball in preview
    showTrail: true,
    showWalls: true,
    // Starting position + velocity.
    initial: { x: 0.5, y: 0.72, vx: 0.7, vy: 0.2 },
    // Colours.
    fieldColour: 'FF0D0D12',
    ballColour: 'FF39D98A',
    trailColour: '6639D98A',
    wallColour: '332A6BA8',
    labelColour: 'FFB9B9B9',
  },

  /** Orbit — a spatial poly-LFO: satellites orbit a centre, each emitting a live
   *  0..1 modulation value from its position (one bindable port per satellite). */
  Orbit: {
    _type: 'Orbit',
    phase: 0,                     // global clock 0..1 (advanced by the run ticker)
    running: true,               // animate in preview / player
    rate: 0.25,                  // global cycles per second
    editable: true,              // allow dragging satellites in preview
    showTrails: true,            // comet trails behind satellites
    showSpokes: true,            // spoke from centre to each satellite
    showRings: true,             // faint orbit rings
    showValues: false,           // per-satellite value readout
    // Satellites: each sits at radius (0..1) + base angle (deg), orbits at `ratio`
    // turns per global cycle (sign = direction), and emits a live value from its
    // position via `output` (y | x | sine | radius), scaled by depth, optionally
    // inverted. Each is a bindable port ("Node N").
    nodes: [
      { id: 'n0', label: 'Node 1', radius: 0.85, angle: 90, ratio: 1, output: 'y', depth: 1, invert: false, enabled: true, colour: 'FF39D98A' },
      { id: 'n1', label: 'Node 2', radius: 0.55, angle: 210, ratio: -2, output: 'x', depth: 0.7, invert: false, enabled: true, colour: 'FF5B9BD5' },
      { id: 'n2', label: 'Node 3', radius: 0.35, angle: 330, ratio: 3, output: 'sine', depth: 1, invert: true, enabled: true, colour: 'FFF2994A' },
    ],
    // Colours.
    fieldColour: 'FF0D0D12',
    ringColour: '332A6BA8',
    centreColour: 'FF3A3A44',
    labelColour: 'FFB9B9B9',
  },

  /** Ribbon — a 1-D absolute-touch strip / pitch-mod wheel with return-to-rest. */
  Ribbon: {
    _type: 'Ribbon',
    value: 0.5,                   // 0..1 current / rest position
    bipolar: false,               // value port emits −1..1 (pitch bend)
    orientation: 'vertical',      // vertical | horizontal
    style: 'ribbon',              // ribbon (flat strip) | wheel (3-D wheel)
    editable: true,
    returnMode: 'none',           // none | center | min | max | rest
    returnValue: 0.5,             // rest value when returnMode = rest
    returnRate: 8,                // glide speed (units/sec; 0 = instant snap)
    snap: 0,                      // value snap step (0 = continuous)
    showGlow: true,               // touch glow while held
    showValue: false,
    valuePrecision: 2,
    label: '',
    indicatorSize: 3,
    // Colours.
    trackColour: 'FF181818',
    fillColour: 'FF5B9BD5',
    indicatorColour: 'FFFFFFFF',
    glowColour: '885B9BD5',
    wheelColour: 'FF2A2A2A',
    labelColour: 'FFB9B9B9',
  },

  /** Crossfader — a 1-D A/B blend with a curve law + centre detent. */
  Crossfader: {
    _type: 'Crossfader',
    mix: 0.5,                     // 0 = full A, 1 = full B
    law: 'equalPower',            // linear | equalPower | sharp
    bipolar: false,               // mix port emits −1..1 (vs 0..1)
    orientation: 'horizontal',    // horizontal | vertical
    editable: true,
    detent: 0.03,                 // centre detent snap threshold (0 = off)
    returnToCenter: false,        // spring back to centre on release
    returnRate: 4,                // glide speed (units/sec)
    labelA: 'A',
    labelB: 'B',
    showLabels: true,
    showGains: false,             // draw per-side gain bars
    handleSize: 14,
    // Colours.
    trackColour: 'FF1B1B1B',
    fillAColour: 'FF5B9BD5',
    fillBColour: 'FFF2994A',
    handleColour: 'FFF2F2F2',
    detentColour: '55FFFFFF',
    labelColour: 'FFB9B9B9',
  },

  /** Joystick — an XY vector pad: a puck blending four corners + X/Y axes. */
  Joystick: {
    _type: 'Joystick',
    x: 0.5,                       // normalized 0..1 puck position (y=0 bottom)
    y: 0.5,
    bipolar: true,                // X/Y ports emit −1..1 (vs 0..1)
    editable: true,
    // Spring return-to-rest on release.
    returnToCenter: false,
    returnAxes: 'both',           // both | x | y
    returnRate: 4,                // normalized units/sec glide speed
    // Display.
    showGrid: true,
    gridDiv: 4,
    showCrosshair: true,
    showCorners: true,
    cornerLabels: ['A', 'B', 'C', 'D'],   // TL, TR, BL, BR
    showTrail: false,
    trailLength: 24,
    puckRadius: 9,
    // Colours.
    padColour: 'FF141414',
    gridColour: '18FFFFFF',
    crosshairColour: '40FFFFFF',
    puckColour: 'FF5B9BD5',
    trailColour: '665B9BD5',
    cornerColour: 'FFF2C94C',
    labelColour: 'FFB9B9B9',
  },

  /** Matrix — a modulation routing grid: sources (rows) × destinations (cols). */
  Matrix: {
    _type: 'Matrix',
    rows: ['LFO 1', 'LFO 2', 'Env', 'Vel'],       // sources
    cols: ['Pitch', 'Cutoff', 'Amp', 'Pan'],      // destinations
    // Row-major R×C modulation amounts (−1..1 bipolar, or 0..1). Each cell is a
    // bindable port ("Src → Dest") for the fan-out mechanism.
    amounts: [0.6, 0, 0, 0, 0, -0.45, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0.3],
    bipolar: true,
    step: 0,                    // snap step for cell amounts (0 = continuous)
    cellStyle: 'bar',           // bar | fill | dot — how a cell shows its amount
    editable: true,             // drag cells in preview
    showLabels: true,
    showValues: false,          // print the numeric amount in each cell
    rowHeaderW: 52,             // left label column width (px)
    colHeaderH: 20,             // top label row height (px)
    // Colours.
    cellBg: 'FF161616',
    gridColour: '22FFFFFF',
    posColour: 'FF39D98A',      // positive amount
    negColour: 'FFEB5757',      // negative amount
    labelColour: 'FFB9B9B9',
    activeColour: 'FFFFFFFF',
  },

  /** Envelope — a draggable breakpoint / curve editor (ADSR, MSEG, …). */
  Envelope: {
    _type: 'Envelope',
    preset: 'adsr',               // adsr | ar | ad | dahdsr | mseg | free
    // Breakpoints: normalized x (time/input) + y (level/output), each with the
    // curve shape of the segment ending at it (linear | exp | log | scurve | hold).
    points: [
      { id: 'e0', x: 0, y: 0, curve: 'linear', tension: 0 },
      { id: 'e1', x: 0.25, y: 1, curve: 'exp', tension: 0 },
      { id: 'e2', x: 0.5, y: 0.6, curve: 'exp', tension: 0 },
      { id: 'e3', x: 1, y: 0, curve: 'exp', tension: 0 },
    ],
    sustainIndex: 2,              // point that holds while a note is held (-1 = none)
    loopEnabled: false,
    loopStart: 0,                 // point index of the loop start
    loopEnd: 0,                   // point index of the loop end
    // Interaction (preview): drag nodes, double-click to add / remove.
    editable: true,
    addOnDoubleClick: true,
    snapX: 0,                     // grid snap step for x (0 = free)
    snapY: 0,                     // grid snap step for y (0 = free)
    // Axis + readout.
    xLabel: 'Time',
    yLabel: 'Level',
    timeMax: 1000,                // ms represented by x = 1 (readout only)
    timeUnit: 'ms',
    // A moving playhead dot at the current phase (driven live by a source).
    showPlayhead: false,
    phase: 0,                     // 0..1 static phase for the dot
    phaseSourceId: '',            // range control that drives the phase in preview
    // Style.
    showGrid: true,
    gridX: 4,
    gridY: 4,
    fillUnder: true,
    lineWidth: 2,
    nodeRadius: 4,
    lineColour: 'FF5B9BD5',
    fillColour: '335B9BD5',
    nodeColour: 'FFF2F2F2',
    gridColour: '18FFFFFF',
    sustainColour: 'FFF2C94C',
    playheadColour: 'FFFFFFFF',
  },

  /** Parts — named internal sub-elements for advanced controls. */
  Parts: {
    _type: 'Parts',
    _children: {},
  },

  /** Bindings — value-driven mappings into root or part properties. */
  Bindings: {
    _type: 'Bindings',
    enabled: true,
    debug: false,
    _children: {},
  },

  /** DeviceBindings — component ports bound to semantic device parameters. */
  DeviceBindings: {
    _type: 'DeviceBindings',
    enabled: true,
    debug: false,
    bindings: [],
  },

  /** States — contains named state override children. Starts empty. */
  States: {
    _type: 'States',
    enabled: true,
    debug: false,
      priority: ['hover', 'focused', 'checked', 'mixed', 'dragging', 'pressed', 'disabled'],
    _children: {},
  },

  /** Scripts — portable command graph scripts per event trigger. Starts empty. */
  Scripts: {
    _type: 'Scripts',
    enabled: true,
    runInPreview: true,
    scripts: [],
  },

  /** Animations — named animation definitions. Starts empty. */
  Animations: {
    _type: 'Animations',
    enabled: true,
    debug: false,
    _children: {},
  },

  /** Designer — authoring metadata for custom component workshop controls. */
  Designer: {
    _type: 'Designer',
    version: 1,
    mode: 'workshop',
    authoringStage: 'foundation',
    selectedAssistantContext: 'overview',
    selectedLayer: '',
    selectedValueChannel: '',
    selectedBehavior: '',
    selectedHitZone: '',
    selectedGenerator: '',
    selectedAsset: '',
    activeVariant: 'default',
    preview: {
      state: 'base',
      animationsEnabled: true,
      showHitZones: false,
      showBounds: true,
      showValues: true,
      testValue: 0.5,
    },
    notes: '',
  },

  /** Assets — packaged resources for custom components. */
  Assets: {
    _type: 'Assets',
    images: {},
    filmstrips: {},
    fonts: {},
    thumbnails: {},
    packagePolicy: {
      embedAssets: true,
      warnMissingFonts: true,
    },
  },

  /** ValueChannels — named internal/public values for custom components. */
  ValueChannels: {
    _type: 'ValueChannels',
    _children: {},
  },

  /** Behaviors — named behavior modules for custom components. */
  Behaviors: {
    _type: 'Behaviors',
    _children: {},
  },

  /** HitZones — independent interactive surfaces for custom components. */
  HitZones: {
    _type: 'HitZones',
    _children: {},
  },

  /** Generators — rules that create repeated/structured layers and zones. */
  Generators: {
    _type: 'Generators',
    _children: {},
  },

  /** Links — internal/external logic links between values and behaviors. */
  Links: {
    _type: 'Links',
    enabled: true,
    debug: false,
    _children: {},
  },

  /** PublishedProperties — public component API shown in normal panel editing. */
  PublishedProperties: {
    _type: 'PublishedProperties',
    inputs: {},
    outputs: {},
    editableProperties: {},
  },

  /** ExternalAPI — first-class link contract for other panel components. */
  ExternalAPI: {
    _type: 'ExternalAPI',
    version: 1,
    addressableName: '',
    acceptsExternalLinks: true,
    emitsExternalLinks: true,
    linkPolicy: 'publishedOnly',
    inputs: [],
    outputs: [],
    events: [],
  },

  /** Variants — reusable layout/style modes for custom components. */
  Variants: {
    _type: 'Variants',
    active: 'default',
    _children: {},
  },
};
