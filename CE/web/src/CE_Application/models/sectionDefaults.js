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
    segmentStyle: {
      shared: {},
      rows: {},
    },
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

  /** Scripts — Lua code per event trigger. Starts empty. */
  Scripts: {
    _type: 'Scripts',
  },

  /** Animations — named animation definitions. Starts empty. */
  Animations: {
    _type: 'Animations',
    enabled: true,
    debug: false,
    _children: {},
  },
};
