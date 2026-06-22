import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { deepClone } from './deepClone.js';
export { createCustomComponentExportEnvelope } from './customComponentPackage.js';

export const CUSTOM_COMPONENT_PLAN_VERSION = 1;

export const CUSTOM_ASSISTANT_RECIPES = [
  {
    id: 'shape.roundedPanel',
    group: 'Shapes',
    label: 'Rounded Panel',
    summary: 'Add a resizable rounded background layer.',
    creates: ['Parts', 'Background'],
  },
  {
    id: 'shape.ring',
    group: 'Shapes',
    label: 'Ring / Dial',
    summary: 'Add a circular layer ready for dial or ring bindings.',
    creates: ['Parts', 'ValueChannels'],
  },
  {
    id: 'move.rotateValue',
    group: 'Movement',
    label: 'Rotate With Value',
    summary: 'Bind a selected pointer or ring to a normalized value.',
    creates: ['Bindings', 'Animations'],
  },
  {
    id: 'move.trackValue',
    group: 'Movement',
    label: 'Move Along Track',
    summary: 'Move a handle horizontally, vertically, or along an arc.',
    creates: ['Bindings', 'HitZones'],
  },
  {
    id: 'state.pressBounce',
    group: 'States',
    label: 'Press Bounce',
    summary: 'Create a pressed state with scale and quick transition.',
    creates: ['States', 'Animations'],
  },
  {
    id: 'generator.ticks',
    group: 'Generators',
    label: 'Tick Generator',
    summary: 'Create major/minor ticks for linear or circular controls.',
    creates: ['Generators', 'Parts'],
  },
  {
    id: 'generator.ledRing',
    group: 'Generators',
    label: 'LED Ring',
    summary: 'Create LEDs that light up one-by-one as a value crosses thresholds.',
    creates: ['Generators', 'Parts', 'ValueChannels'],
  },
  {
    id: 'generator.xyGrid',
    group: 'Generators',
    label: 'XY Grid',
    summary: 'Create a clickable grid that can set X and Y value channels.',
    creates: ['ValueChannels', 'Behaviors', 'Generators', 'HitZones'],
  },
  {
    id: 'generator.pianoBar',
    group: 'Generators',
    label: 'Piano Bar',
    summary: 'Create note keys with generated note-number hit zones.',
    creates: ['ValueChannels', 'Behaviors', 'Generators', 'HitZones'],
  },
  {
    id: 'asset.filmstrip',
    group: 'Assets',
    label: 'Filmstrip Knob',
    summary: 'Map a vertical or horizontal filmstrip to a value channel.',
    creates: ['Assets', 'Parts', 'Bindings'],
  },
  {
    id: 'logic.twoSlidersSwitch',
    group: 'Links',
    label: 'Two Sliders + Switch',
    summary: 'Create A/B value channels and a mode switch for compound controls.',
    creates: ['ValueChannels', 'Behaviors', 'HitZones', 'Links'],
  },
];

export const CUSTOM_COMPONENT_STARTERS = [
  {
    id: 'starter.macroRings',
    group: 'Performance',
    label: 'Three Ring Macro',
    summary: 'Three independent circular values with nested hit zones and public outputs.',
    creates: ['3 rings', '3 value channels', '3 hit zones', 'public API'],
    dimensions: { width: 168, height: 168 },
  },
  {
    id: 'starter.circularTickSlider',
    group: 'Slider',
    label: 'Circular Tick Slider',
    summary: 'A single circular slider with radial major/minor ticks, a value pointer, and a circular hit zone.',
    creates: ['circular slider', 'radial ticks', 'pointer', 'public API'],
    dimensions: { width: 156, height: 156 },
  },
  {
    id: 'starter.circularLedRing',
    group: 'Meter',
    label: 'Circular LED Ring',
    summary: 'A value-driven ring of LEDs that light cumulatively around a circular path.',
    creates: ['LED generator', 'circular drag zone', '0-127 value', 'public API'],
    dimensions: { width: 168, height: 168 },
  },
  {
    id: 'starter.dualSliderSwitch',
    group: 'Compound',
    label: 'Dual Slider Switch',
    summary: 'Two sliders, a mode button, and a linked active output value.',
    creates: ['2 sliders', 'mode button', 'switch link', 'public API'],
    dimensions: { width: 220, height: 92 },
  },
  {
    id: 'starter.labelledTwoStateButton',
    group: 'Button',
    label: 'Labelled Two-State Button',
    summary: 'A bordered label above a two-state button, enclosed by one solid outlined background.',
    creates: ['label', '2-state button', 'container outline', 'public API'],
    dimensions: { width: 152, height: 92 },
  },
  {
    id: 'starter.xyGridPad',
    group: 'Grid',
    label: 'XY Grid Pad',
    summary: 'A generated grid with X/Y values, cell hit zones, and a movable cursor.',
    creates: ['grid generator', 'X/Y channels', 'cell hit zones', 'cursor'],
    dimensions: { width: 184, height: 184 },
  },
  {
    id: 'starter.scrollPianoBar',
    group: 'Piano',
    label: 'Scrollable Piano Bar',
    summary: 'A wide generated piano keybed with note, scroll, and velocity channels.',
    creates: ['piano generator', 'note output', 'scroll channel', 'velocity'],
    dimensions: { width: 300, height: 86 },
  },
  {
    id: 'starter.tripleValueSlider',
    group: 'Compound',
    label: 'Triple Value Slider',
    summary: 'Three linked slider values with min/current/max handles and public outputs.',
    creates: ['3 handles', 'range values', 'linked rules', 'public API'],
    dimensions: { width: 260, height: 112 },
  },
  {
    id: 'starter.filmstripKnob',
    group: 'Assets',
    label: 'Filmstrip Knob',
    summary: 'A value-driven filmstrip frame layer with a fallback pointer and bake-ready asset slot.',
    creates: ['filmstrip asset', 'frame generator', 'dial hit zone', 'public API'],
    dimensions: { width: 126, height: 126 },
  },
];

export function createPartNode(name, {
  role = 'custom',
  kind = 'rectangle',
  zIndex = 0,
  opacity = 1,
  visible = true,
  layout = {},
  sections = {},
  meta = {},
} = {}) {
  return {
    _type: 'Part',
    name,
    role,
    kind,
    visible,
    opacity,
    zIndex,
    acceptsStatePatches: true,
    clipChildren: kind === 'viewport',
    meta,
    _children: {
      Layout: {
        _type: 'PartLayout',
        mode: 'absolute',
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'px',
        heightUnit: 'px',
        anchorX: 'center',
        anchorY: 'center',
        align: 'center',
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        scale: 1,
        pivotX: 50,
        pivotY: 50,
        ...layout,
      },
      ...sections,
    },
  };
}

function arcTrackMeta({
  startAngle = -135,
  sweepAngle = 270,
  direction = 'cw',
  thickness = 6,
  colour = 'FF2B3742',
} = {}) {
  return {
    renderer: 'arcTrack',
    arcTrack: {
      startAngle,
      sweepAngle,
      direction,
      thickness,
      colour,
    },
  };
}

export function createBackground(colour = 'FF30343A', {
  borderEnabled = true,
  borderColour = '55FFFFFF',
  borderThickness = 1,
  radius = 8,
} = {}) {
  const background = deepClone(SECTION_DEFAULTS.Background);
  background._children.Fill.colour = colour;
  background._children.Border.enabled = borderEnabled;
  background._children.Border.colour = borderColour;
  background._children.Border.thickness = borderThickness;
  background._children.Corners.radius = radius;
  return background;
}

export function createText(content = 'Custom', {
  colour = 'FFEFEFEF',
  size = 12,
  weight = 600,
} = {}) {
  const text = deepClone(SECTION_DEFAULTS.Text);
  text.content = content;
  text._children.Fill.colour = colour;
  text._children.Font.size = size;
  text._children.Font.weightValue = weight;
  text._children.Font.weight = weight >= 700 ? 'Bold' : 'SemiBold';
  text._children.Position.justification = 'centred';
  return text;
}

export function createValueChannel(name, {
  label = '',
  type = 'float',
  min = 0,
  max = 1,
  step = 0.01,
  defaultValue = 0,
  publicInput = true,
  publicOutput = true,
  format = {},
  snap = {},
  curve = {},
  constraints = {},
} = {}) {
  return {
    _type: 'ValueChannel',
    name,
    label: label || name,
    type,
    min,
    max,
    step,
    defaultValue,
    currentValue: defaultValue,
    publicInput,
    publicOutput,
    deviceBindable: true,
    format: {
      precision: type === 'int' ? 0 : 2,
      prefix: '',
      suffix: '',
      unit: '',
      ...format,
    },
    snap: {
      enabled: true,
      mode: 'step',
      ...snap,
    },
    curve: {
      mode: 'linear',
      deadZone: 0,
      hysteresis: 0,
      ...curve,
    },
    constraints: {
      enabled: true,
      normalizedMin: 0,
      normalizedMax: 1,
      ...constraints,
    },
  };
}

export function createBehaviorModule(name, {
  type = 'slider',
  valueChannel = 'mainValue',
  role = 'custom',
  geometry = 'linear',
  dragMode = 'auto',
  interaction = {},
  reverseMouseDirection = false,
} = {}) {
  return {
    _type: 'BehaviorModule',
    name,
    type,
    role,
    enabled: true,
    valueChannel,
    valueChannels: [valueChannel].filter(Boolean),
    geometry,
    dragMode,
    reverseMouseDirection,
    interaction: {
      pointer: true,
      keyboard: true,
      wheel: false,
      snap: true,
      ...interaction,
    },
  };
}

export function createHitZone(name, {
  shape = 'rectangle',
  targetBehavior = 'mainSlider',
  targetValueChannel = 'mainValue',
  targetValueChannelX = '',
  targetValueChannelY = '',
  action = 'dragValue',
  cursor = null,
  bounds = {},
  // Follow mode: how the grab area is positioned (all optional; omitting them
  // reproduces today's behavior, where `bounds` are independent coordinates).
  //   'independent'  — use `bounds` exactly as authored (default).
  //   'face'         — track the whole control's bounds.
  //   'part:<name>'  — track that part's resolved layout, grown by `inflate`.
  source = 'independent',
  inflate = {},
  minTouch = 0,
  payload = null,
  meta = {},
} = {}) {
  const hitZone = {
    _type: 'HitZone',
    name,
    shape,
    enabled: true,
    visibleInEditor: true,
    priority: 0,
    cursor: cursor || (action === 'dragValue' ? 'pointer' : 'default'),
    targetBehavior,
    targetValueChannel,
    targetValueChannelX,
    targetValueChannelY,
    action,
    bounds: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      unit: 'percent',
      ...bounds,
    },
    source: source || 'independent',
    inflate: {
      x: 0,
      y: 0,
      unit: 'px',
      ...inflate,
    },
    minTouch: Number(minTouch) || 0,
    condition: '',
    meta,
  };
  if (payload !== null && payload !== undefined) hitZone.payload = payload;
  return hitZone;
}

export function createCustomComponentDesignerDefaults() {
  return {
    _type: 'Designer',
    version: CUSTOM_COMPONENT_PLAN_VERSION,
    mode: 'workshop',
    authoringStage: 'foundation',
    selectedAssistantContext: 'overview',
    selectedLayer: 'background',
    selectedValueChannel: 'mainValue',
    selectedBehavior: 'mainSlider',
    selectedHitZone: 'mainDragArea',
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
    arpeggiator: {
      enabled: false,
      stepCount: 32,
      noteMin: 0,
      noteMax: 127,
      viewNote: 60,
      selectedBlock: '',
      blocks: [],
    },
    notes: 'Custom components are reusable mini-instruments made from layers, values, behaviors, hit zones, generators, links, states, and animations.',
  };
}

export function createCustomComponentAssetsDefaults() {
  return {
    _type: 'Assets',
    images: {},
    filmstrips: {},
    fonts: {},
    thumbnails: {},
    packagePolicy: {
      embedAssets: true,
      warnMissingFonts: true,
    },
  };
}

export function createCustomComponentValueChannelsDefaults() {
  return {
    _type: 'ValueChannels',
    _children: {
      mainValue: createValueChannel('mainValue', { label: 'Main Value', defaultValue: 0.5 }),
      mode: createValueChannel('mode', {
        label: 'Mode',
        type: 'enum',
        min: 0,
        max: 1,
        step: 1,
        defaultValue: 'A',
        format: { precision: 0 },
      }),
    },
  };
}

export function createCustomComponentBehaviorsDefaults() {
  return {
    _type: 'Behaviors',
    _children: {
      mainSlider: createBehaviorModule('mainSlider', {
        type: 'slider',
        role: 'slider',
        valueChannel: 'mainValue',
        geometry: 'linear',
      }),
      modeButton: createBehaviorModule('modeButton', {
        type: 'cycle',
        role: 'button',
        valueChannel: 'mode',
        geometry: 'none',
      }),
    },
  };
}

export function createCustomComponentHitZonesDefaults() {
  return {
    _type: 'HitZones',
    _children: {
      mainDragArea: createHitZone('mainDragArea', {
        shape: 'rectangle',
        targetBehavior: 'mainSlider',
        targetValueChannel: 'mainValue',
        action: 'dragValue',
      }),
      modeClickArea: createHitZone('modeClickArea', {
        shape: 'circle',
        targetBehavior: 'modeButton',
        targetValueChannel: 'mode',
        action: 'cycleValue',
        bounds: { x: 50, y: 50, width: 24, height: 24, unit: 'percent' },
      }),
    },
  };
}

export function createCustomComponentBlankPartsDefaults() {
  return {
    _type: 'Parts',
    _children: {},
  };
}

export function createCustomComponentBlankHitZonesDefaults() {
  return {
    _type: 'HitZones',
    _children: {},
  };
}

export function createCustomComponentBlankGeneratorsDefaults() {
  return {
    _type: 'Generators',
    _children: {},
  };
}

export function createCustomComponentBlankBindingsDefaults() {
  return {
    enabled: true,
    debug: false,
    _children: {},
  };
}

export function createCustomComponentGeneratorsDefaults() {
  return {
    _type: 'Generators',
    _children: {
      majorTicks: {
        _type: 'Generator',
        name: 'majorTicks',
        type: 'ticks',
        enabled: true,
        targetBehavior: 'mainSlider',
        geometry: 'linear',
        count: 11,
        minorCount: 3,
        placement: 'outside',
        generatedPartPrefix: 'tick',
        generatedHitZones: false,
      },
    },
  };
}

export function createCustomComponentLinksDefaults() {
  return {
    _type: 'Links',
    enabled: true,
    debug: false,
    _children: {},
  };
}

export function createCustomComponentPublishedPropertiesDefaults() {
  return {
    _type: 'PublishedProperties',
    inputs: {
      mainValue: { channel: 'mainValue', label: 'Main Value', type: 'float', enabled: true },
      mode: { channel: 'mode', label: 'Mode', type: 'enum', enabled: true },
      accentColour: { variable: 'accentColour', label: 'Accent Colour', type: 'color', enabled: true },
    },
    outputs: {
      mainValue: { channel: 'mainValue', label: 'Main Value', type: 'float', enabled: true },
      mode: { channel: 'mode', label: 'Mode', type: 'enum', enabled: true },
    },
    editableProperties: {
      label: { path: 'Parts.label.Text.content', label: 'Label', type: 'text', enabled: true },
      variant: { path: 'Designer.activeVariant', label: 'Variant', type: 'enum', enabled: true },
    },
  };
}

export function createCustomComponentExternalApiDefaults() {
  return {
    _type: 'ExternalAPI',
    version: 1,
    addressableName: '',
    acceptsExternalLinks: true,
    emitsExternalLinks: true,
    linkPolicy: 'publishedOnly',
    inputs: [],
    outputs: [],
    events: [
      { id: 'valueChange', label: 'Value Change', enabled: true },
      { id: 'modeChange', label: 'Mode Change', enabled: true },
    ],
  };
}

function createStarterExternalApiDefaults(addressableName, events = null) {
  return {
    ...createCustomComponentExternalApiDefaults(),
    addressableName,
    events: events ?? createCustomComponentExternalApiDefaults().events,
  };
}

export function createCustomComponentVariantsDefaults() {
  return {
    _type: 'Variants',
    active: 'default',
    _children: {
      default: {
        _type: 'Variant',
        name: 'default',
        label: 'Default',
        enabled: true,
        description: 'Base editable custom component layout.',
        patches: {},
      },
    },
  };
}

export function createCustomComponentPartsDefaults() {
  return {
    _type: 'Parts',
    _children: {
      background: createPartNode('background', {
        role: 'background',
        kind: 'roundedRectangle',
        zIndex: 0,
        layout: { mode: 'fill', widthUnit: 'percent', heightUnit: 'percent' },
        sections: {
          Background: createBackground('FF252A31', { borderColour: '445B9BD5', radius: 10 }),
        },
      }),
      track: createPartNode('track', {
        role: 'track',
        kind: 'roundedRectangle',
        zIndex: 1,
        layout: { x: 50, y: 58, width: 72, height: 10, widthUnit: 'percent', heightUnit: 'px' },
        sections: {
          Background: createBackground('FF111418', { borderEnabled: false, radius: 999 }),
        },
      }),
      fill: createPartNode('fill', {
        role: 'fill',
        kind: 'roundedRectangle',
        zIndex: 2,
        layout: { x: 14, y: 58, width: 36, height: 10, xUnit: 'percent', yUnit: 'percent', widthUnit: 'percent', heightUnit: 'px', anchorX: 'left' },
        sections: {
          Background: createBackground('FF5B9BD5', { borderEnabled: false, radius: 999 }),
        },
      }),
      handle: createPartNode('handle', {
        role: 'handle',
        kind: 'circle',
        zIndex: 3,
        layout: { x: 50, y: 58, width: 22, height: 22, widthUnit: 'px', heightUnit: 'px' },
        sections: {
          Background: createBackground('FFF2F5F7', { borderColour: '66202428', radius: 999 }),
        },
      }),
      label: createPartNode('label', {
        role: 'label',
        kind: 'text',
        zIndex: 4,
        layout: { x: 50, y: 24, width: 76, height: 24, widthUnit: 'percent', heightUnit: 'px' },
        sections: {
          Text: createText('Custom Component', { size: 12, weight: 700 }),
        },
      }),
    },
  };
}

function valueChannelPublicEntries(channels, direction = 'input') {
  return Object.fromEntries(
    Object.entries(channels).map(([name, channel]) => [
      name,
      {
        channel: name,
        label: channel.label || name,
        type: channel.type || 'float',
        enabled: direction === 'input' ? channel.publicInput !== false : channel.publicOutput !== false,
      },
    ])
  );
}

function binding(name, source, target, {
  outputMin = 0,
  outputMax = 1,
  outputUnit = '',
  clamp = true,
} = {}) {
  return {
    _type: 'Binding',
    name,
    enabled: true,
    source,
    mapMode: 'range',
    target,
    outputUnit,
    inputMin: 0,
    inputMax: 1,
    outputMin,
    outputMax,
    falseValue: outputMin,
    trueValue: outputMax,
    enumMap: {},
    clamp,
    round: false,
    invert: false,
  };
}

function starterShellParts(label, backgroundColour = 'FF171D22') {
  return {
    background: createPartNode('background', {
      role: 'background',
      kind: 'roundedRectangle',
      zIndex: 0,
      layout: { mode: 'fill', widthUnit: 'percent', heightUnit: 'percent' },
      sections: {
        Background: createBackground(backgroundColour, { borderColour: '445B9BD5', radius: 10 }),
      },
    }),
    label: createPartNode('label', {
      role: 'label',
      kind: 'text',
      zIndex: 20,
      layout: { x: 50, y: 12, width: 86, height: 18, widthUnit: 'percent', heightUnit: 'px' },
      sections: {
        Text: createText(label, { size: 10, weight: 700 }),
      },
    }),
  };
}

function createStarterStates() {
  return {
    _type: 'States',
    enabled: true,
    debug: false,
    priority: ['disabled', 'dragging', 'pressed', 'hover', 'focused'],
    _children: {
      Hover: {
        _type: 'State',
        name: 'Hover',
        group: 'interaction',
        description: 'Highlight the starter shell on hover.',
        enabled: true,
        when: { hover: true },
        patches: {
          component: {},
          parts: {
            background: { 'Background.Border.colour': '665B9BD5' },
          },
        },
      },
      Pressed: {
        _type: 'State',
        name: 'Pressed',
        group: 'interaction',
        description: 'Slightly compress the full custom component while pressed.',
        enabled: true,
        when: { pressed: true },
        patches: {
          component: { 'Transform.scale': 0.985 },
          parts: {},
        },
      },
      Disabled: {
        _type: 'State',
        name: 'Disabled',
        group: 'system',
        description: 'Dim the full custom component.',
        enabled: true,
        when: { disabled: true },
        patches: {
          component: { 'Transform.opacity': 0.55 },
          parts: {},
        },
      },
    },
  };
}

function createStarterAnimations() {
  return {
    _type: 'Animations',
    enabled: true,
    debug: false,
    _children: {
      pressMotion: {
        _type: 'Animation',
        name: 'pressMotion',
        enabled: true,
        kind: 'transition',
        trigger: { type: 'stateChange', from: ['*'], to: ['pressed'] },
        targets: [
          { path: 'Transform.scale', properties: ['transform'] },
        ],
        duration: 90,
        delay: 0,
        easing: 'outQuad',
      },
    },
  };
}

function createStarterLifecycleSections() {
  return {
    States: createStarterStates(),
    Animations: createStarterAnimations(),
  };
}

function createMacroRingsStarterPatch() {
  const channels = {
    outerValue: createValueChannel('outerValue', { label: 'Outer Ring', defaultValue: 0.72 }),
    middleValue: createValueChannel('middleValue', { label: 'Middle Ring', defaultValue: 0.48 }),
    innerValue: createValueChannel('innerValue', { label: 'Inner Ring', defaultValue: 0.31 }),
  };
  return {
    'Core.name': 'Three Ring Macro',
    'Transform.width': 168,
    'Transform.height': 168,
    ...createStarterLifecycleSections(),
    Parts: {
      _type: 'Parts',
      _children: {
        ...starterShellParts('MACRO RINGS', 'FF12161B'),
        outerRing: createPartNode('outerRing', {
          role: 'ring',
          kind: 'arcTrack',
          zIndex: 2,
          layout: { x: 50, y: 54, width: 132, height: 132, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('00111111', { borderColour: 'FF60A7D8', borderThickness: 7, radius: 999 }) },
          meta: arcTrackMeta({ thickness: 7, colour: 'FF60A7D8' }),
        }),
        middleRing: createPartNode('middleRing', {
          role: 'ring',
          kind: 'arcTrack',
          zIndex: 3,
          layout: { x: 50, y: 54, width: 96, height: 96, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('00111111', { borderColour: 'FFE5C06B', borderThickness: 7, radius: 999 }) },
          meta: arcTrackMeta({ thickness: 7, colour: 'FFE5C06B' }),
        }),
        innerRing: createPartNode('innerRing', {
          role: 'ring',
          kind: 'arcTrack',
          zIndex: 4,
          layout: { x: 50, y: 54, width: 60, height: 60, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('00111111', { borderColour: 'FF70C08F', borderThickness: 7, radius: 999 }) },
          meta: arcTrackMeta({ thickness: 7, colour: 'FF70C08F' }),
        }),
        outerPointer: createPartNode('outerPointer', {
          role: 'pointer',
          kind: 'capsule',
          zIndex: 8,
          layout: { x: 50, y: 24.72, width: 6, height: 38, yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'center', anchorY: 'top', pivotX: 50, pivotY: 173.6842105263 },
          sections: { Background: createBackground('FFEAF6FF', { borderEnabled: false, radius: 999 }) },
        }),
        middlePointer: createPartNode('middlePointer', {
          role: 'pointer',
          kind: 'capsule',
          zIndex: 9,
          layout: { x: 50, y: 42.72, width: 6, height: 28, yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'center', anchorY: 'top', pivotX: 50, pivotY: 171.4285714286 },
          sections: { Background: createBackground('FFFFEDB3', { borderEnabled: false, radius: 999 }) },
        }),
        innerPointer: createPartNode('innerPointer', {
          role: 'pointer',
          kind: 'capsule',
          zIndex: 10,
          layout: { x: 50, y: 60.72, width: 6, height: 18, yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'center', anchorY: 'top', pivotX: 50, pivotY: 166.6666666667 },
          sections: { Background: createBackground('FFDDF6E6', { borderEnabled: false, radius: 999 }) },
        }),
      },
    },
    ValueChannels: { _type: 'ValueChannels', _children: channels },
    Behaviors: {
      _type: 'Behaviors',
      _children: {
        outerRing: createBehaviorModule('outerRing', { type: 'slider', role: 'slider', valueChannel: 'outerValue', geometry: 'circular' }),
        middleRing: createBehaviorModule('middleRing', { type: 'slider', role: 'slider', valueChannel: 'middleValue', geometry: 'circular' }),
        innerRing: createBehaviorModule('innerRing', { type: 'slider', role: 'slider', valueChannel: 'innerValue', geometry: 'circular' }),
      },
    },
    HitZones: {
      _type: 'HitZones',
      _children: {
        outerRingZone: createHitZone('outerRingZone', { shape: 'ring', targetBehavior: 'outerRing', targetValueChannel: 'outerValue', bounds: { x: 5, y: 12, width: 90, height: 78, unit: 'percent' } }),
        middleRingZone: createHitZone('middleRingZone', { shape: 'ring', targetBehavior: 'middleRing', targetValueChannel: 'middleValue', bounds: { x: 18, y: 25, width: 64, height: 54, unit: 'percent' } }),
        innerRingZone: createHitZone('innerRingZone', { shape: 'circle', targetBehavior: 'innerRing', targetValueChannel: 'innerValue', bounds: { x: 33, y: 39, width: 34, height: 28, unit: 'percent' } }),
      },
    },
    Generators: {
      _type: 'Generators',
      _children: {
        ringTicks: {
          _type: 'Generator',
          name: 'ringTicks',
          type: 'ticks',
          enabled: true,
          geometry: 'circular',
          count: 13,
          minorCount: 0,
          radius: 42,
          startAngle: -135,
          endAngle: 135,
          generatedPartPrefix: 'ringTick',
          generatedHitZones: false,
        },
      },
    },
    Bindings: {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        outerPointerRotation: binding('outerPointerRotation', 'channel.outerValue.normalized', 'Parts.outerPointer.Layout.rotation', { outputMin: -135, outputMax: 135, outputUnit: 'deg' }),
        middlePointerRotation: binding('middlePointerRotation', 'channel.middleValue.normalized', 'Parts.middlePointer.Layout.rotation', { outputMin: -135, outputMax: 135, outputUnit: 'deg' }),
        innerPointerRotation: binding('innerPointerRotation', 'channel.innerValue.normalized', 'Parts.innerPointer.Layout.rotation', { outputMin: -135, outputMax: 135, outputUnit: 'deg' }),
      },
    },
    Links: createCustomComponentLinksDefaults(),
    PublishedProperties: {
      _type: 'PublishedProperties',
      inputs: valueChannelPublicEntries(channels, 'input'),
      outputs: valueChannelPublicEntries(channels, 'output'),
      editableProperties: {
        label: { path: 'Parts.label.Text.content', label: 'Label', type: 'text', enabled: true },
      },
    },
    ExternalAPI: createStarterExternalApiDefaults('threeRingMacro', [{ id: 'ringChange', label: 'Ring Change', enabled: true }]),
    Designer: {
      ...createCustomComponentDesignerDefaults(),
      selectedValueChannel: 'outerValue',
      selectedBehavior: 'outerRing',
      selectedHitZone: 'outerRingZone',
      selectedGenerator: 'ringTicks',
      notes: 'Three independent circular macro values with nested hit zones and public outputs.',
    },
  };
}

function createCircularTickSliderStarterPatch() {
  const channels = {
    mainValue: createValueChannel('mainValue', {
      label: 'Dial Value',
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 64,
      format: { precision: 0, suffix: '%', unit: 'percent' },
    }),
  };
  return {
    'Core.name': 'Circular Tick Slider',
    'Transform.width': 156,
    'Transform.height': 156,
    ...createStarterLifecycleSections(),
    Parts: {
      _type: 'Parts',
      _children: {
        ...starterShellParts('CIRCULAR', 'FF11171D'),
        dialTrack: createPartNode('dialTrack', {
          role: 'track',
          kind: 'arcTrack',
          zIndex: 2,
          layout: { x: 50, y: 55, width: 96, height: 96, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('00111111', { borderColour: 'FF2B3742', borderThickness: 9, radius: 999 }) },
          meta: arcTrackMeta({ thickness: 9, colour: 'FF2B3742' }),
        }),
        dialArc: createPartNode('dialArc', {
          role: 'fill',
          kind: 'valueArc',
          zIndex: 3,
          layout: { x: 50, y: 55, width: 96, height: 96, widthUnit: 'px', heightUnit: 'px' },
          meta: {
            renderer: 'valueArc',
            valueArc: {
              value: 0.64,
              startAngle: -135,
              sweepAngle: 270,
              thickness: 6,
              colour: 'FF5B9BD5',
            },
          },
        }),
        pointer: createPartNode('pointer', {
          role: 'pointer',
          kind: 'capsule',
          zIndex: 10,
          layout: { x: 50, y: 55, width: 5, height: 38, widthUnit: 'px', heightUnit: 'px', pivotX: 50, pivotY: 116 },
          sections: { Background: createBackground('FFEAF6FF', { borderEnabled: false, radius: 999 }) },
        }),
        valueDot: createPartNode('valueDot', {
          role: 'handle',
          kind: 'circle',
          zIndex: 11,
          layout: { x: 50, y: 28, width: 12, height: 12, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('FFE5C06B', { borderColour: 'AAFFFFFF', radius: 999 }) },
        }),
        valueText: createPartNode('valueText', {
          role: 'label',
          kind: 'text',
          zIndex: 12,
          layout: { x: 50, y: 56, width: 52, height: 24, widthUnit: 'px', heightUnit: 'px' },
          sections: { Text: createText('64', { size: 16, weight: 700 }) },
        }),
      },
    },
    ValueChannels: { _type: 'ValueChannels', _children: channels },
    Behaviors: {
      _type: 'Behaviors',
      _children: {
        circularSlider: createBehaviorModule('circularSlider', { type: 'slider', role: 'slider', valueChannel: 'mainValue', geometry: 'circular' }),
      },
    },
    HitZones: {
      _type: 'HitZones',
      _children: {
        dialZone: createHitZone('dialZone', {
          shape: 'ring',
          targetBehavior: 'circularSlider',
          targetValueChannel: 'mainValue',
          action: 'dragValue',
          bounds: { x: 12, y: 20, width: 76, height: 68, unit: 'percent' },
        }),
      },
    },
    Generators: {
      _type: 'Generators',
      _children: {
        dialTicks: {
          _type: 'Generator',
          name: 'dialTicks',
          type: 'ticks',
          enabled: true,
          targetBehavior: 'circularSlider',
          targetValueChannel: 'mainValue',
          geometry: 'circular',
          count: 11,
          minorCount: 4,
          radius: 43,
          startAngle: -135,
          endAngle: 135,
          generatedPartPrefix: 'dialTick',
          generatedHitZones: false,
          zIndex: 7,
        },
      },
    },
    Bindings: {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        pointerRotation: binding('pointerRotation', 'channel.mainValue.normalized', 'Parts.pointer.Layout.rotation', { outputMin: -135, outputMax: 135, outputUnit: 'deg' }),
        dotRotation: binding('dotRotation', 'channel.mainValue.normalized', 'Parts.valueDot.Layout.rotation', { outputMin: -135, outputMax: 135, outputUnit: 'deg' }),
        arcValue: binding('arcValue', 'channel.mainValue.normalized', 'Parts.dialArc.meta.valueArc.value', { outputMin: 0, outputMax: 1 }),
        valueLabel: binding('valueLabel', 'channel.mainValue.display', 'Parts.valueText.Text.content', { outputMin: 0, outputMax: 100 }),
      },
    },
    Links: createCustomComponentLinksDefaults(),
    PublishedProperties: {
      _type: 'PublishedProperties',
      inputs: valueChannelPublicEntries(channels, 'input'),
      outputs: valueChannelPublicEntries(channels, 'output'),
      editableProperties: {
        label: { path: 'Parts.label.Text.content', label: 'Label', type: 'text', defaultValue: 'CIRCULAR', enabled: true },
        accent: { path: 'Parts.dialArc.meta.valueArc.colour', label: 'Accent', type: 'color', defaultValue: 'FF5B9BD5', enabled: true },
      },
    },
    ExternalAPI: createStarterExternalApiDefaults('circularTickSlider', [{ id: 'valueChange', label: 'Value Change', enabled: true }]),
    Designer: {
      ...createCustomComponentDesignerDefaults(),
      selectedValueChannel: 'mainValue',
      selectedBehavior: 'circularSlider',
      selectedHitZone: 'dialZone',
      selectedGenerator: 'dialTicks',
      preview: { ...createCustomComponentDesignerDefaults().preview, showHitZones: false, showBounds: false, testValue: 0.64 },
      notes: 'Single circular slider with radial major/minor ticks, a circular drag zone, value-driven pointer, public value input/output, and editable accent colour.',
    },
  };
}

function createCircularLedRingStarterPatch() {
  const channels = {
    mainValue: createValueChannel('mainValue', {
      label: 'LED Value',
      type: 'int',
      min: 0,
      max: 127,
      step: 1,
      defaultValue: 64,
      format: { precision: 0, unit: 'midi' },
    }),
  };
  return {
    'Core.name': 'Circular LED Ring',
    'Transform.width': 168,
    'Transform.height': 168,
    ...createStarterLifecycleSections(),
    Parts: {
      _type: 'Parts',
      _children: {
        ...starterShellParts('LED RING', 'FF10151A'),
        outerGuide: createPartNode('outerGuide', {
          role: 'track',
          kind: 'ring',
          zIndex: 1,
          layout: { x: 50, y: 54, width: 126, height: 126, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('00111111', { borderColour: '332B3944', borderThickness: 4, radius: 999 }) },
        }),
        innerGuide: createPartNode('innerGuide', {
          role: 'track',
          kind: 'ring',
          zIndex: 1,
          layout: { x: 50, y: 54, width: 82, height: 82, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('00111111', { borderColour: '222B3944', borderThickness: 2, radius: 999 }) },
        }),
        valueText: createPartNode('valueText', {
          role: 'label',
          kind: 'text',
          zIndex: 14,
          layout: { x: 50, y: 54, width: 58, height: 26, widthUnit: 'px', heightUnit: 'px' },
          sections: { Text: createText('64', { size: 17, weight: 800, colour: 'FFEAF6FF' }) },
        }),
        caption: createPartNode('caption', {
          role: 'label',
          kind: 'text',
          zIndex: 14,
          layout: { x: 50, y: 88, width: 120, height: 18, widthUnit: 'px', heightUnit: 'px' },
          sections: { Text: createText('0-127', { size: 10, weight: 700, colour: 'FF9CB1BE' }) },
        }),
      },
    },
    ValueChannels: { _type: 'ValueChannels', _children: channels },
    Behaviors: {
      _type: 'Behaviors',
      _children: {
        ledRingDrag: createBehaviorModule('ledRingDrag', { type: 'slider', role: 'slider', valueChannel: 'mainValue', geometry: 'circular' }),
      },
    },
    HitZones: {
      _type: 'HitZones',
      _children: {
        ledRingZone: createHitZone('ledRingZone', {
          shape: 'ring',
          targetBehavior: 'ledRingDrag',
          targetValueChannel: 'mainValue',
          action: 'dragValue',
          bounds: { x: 10, y: 16, width: 80, height: 74, unit: 'percent' },
        }),
      },
    },
    Generators: {
      _type: 'Generators',
      _children: {
        ledRing: {
          _type: 'Generator',
          name: 'ledRing',
          type: 'repeated-leds',
          enabled: true,
          targetBehavior: 'ledRingDrag',
          targetValueChannel: 'mainValue',
          valueSource: 'mainValue',
          geometry: 'circular',
          count: 24,
          radius: 37,
          startAngle: -135,
          endAngle: 135,
          ledSize: 8,
          activeColour: 'FF5B9BD5',
          inactiveColour: '66445664',
          inactiveOpacity: 0.9,
          activationMode: 'cumulative',
          generatedPartPrefix: 'led',
          generatedHitZones: false,
          zIndex: 8,
          detachable: true,
        },
      },
    },
    Bindings: {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        valueLabel: binding('valueLabel', 'channel.mainValue.display', 'Parts.valueText.Text.content', { outputMin: 0, outputMax: 127 }),
      },
    },
    Links: createCustomComponentLinksDefaults(),
    PublishedProperties: {
      _type: 'PublishedProperties',
      inputs: valueChannelPublicEntries(channels, 'input'),
      outputs: valueChannelPublicEntries(channels, 'output'),
      editableProperties: {
        label: { path: 'Parts.label.Text.content', label: 'Title', type: 'text', defaultValue: 'LED RING', enabled: true },
        activeColour: { path: 'Generators.ledRing.activeColour', label: 'Active LED Colour', type: 'color', defaultValue: 'FF5B9BD5', enabled: true },
        inactiveColour: { path: 'Generators.ledRing.inactiveColour', label: 'Inactive LED Colour', type: 'color', defaultValue: '66445664', enabled: true },
        ledCount: { path: 'Generators.ledRing.count', label: 'LED Count', type: 'int', defaultValue: 24, min: 1, max: 128, enabled: true },
      },
    },
    ExternalAPI: createStarterExternalApiDefaults('circularLedRing', [{ id: 'valueChange', label: 'Value Change', enabled: true }]),
    Designer: {
      ...createCustomComponentDesignerDefaults(),
      selectedValueChannel: 'mainValue',
      selectedBehavior: 'ledRingDrag',
      selectedHitZone: 'ledRingZone',
      selectedGenerator: 'ledRing',
      preview: { ...createCustomComponentDesignerDefaults().preview, showHitZones: false, showBounds: false, testValue: 0.5 },
      notes: 'Circular LED ring: generated LEDs light cumulatively when the 0-127 value passes each LED threshold.',
    },
  };
}

function createDualSliderSwitchStarterPatch() {
  const channels = {
    mainValue: createValueChannel('mainValue', { label: 'Active Value', defaultValue: 0.25 }),
    valueA: createValueChannel('valueA', { label: 'Value A', defaultValue: 0.25 }),
    valueB: createValueChannel('valueB', { label: 'Value B', defaultValue: 0.75 }),
    mode: createValueChannel('mode', { label: 'Mode', type: 'enum', min: 0, max: 1, step: 1, defaultValue: 'A', format: { precision: 0 } }),
  };
  channels.mode.values = ['A', 'B'];
  return {
    'Core.name': 'Dual Slider Switch',
    'Transform.width': 220,
    'Transform.height': 92,
    ...createStarterLifecycleSections(),
    Parts: {
      _type: 'Parts',
      _children: {
        ...starterShellParts('DUAL SWITCH', 'FF151B21'),
        trackA: createPartNode('trackA', {
          role: 'track',
          kind: 'capsule',
          zIndex: 2,
          layout: { x: 40, y: 42, width: 62, height: 8, widthUnit: 'percent', heightUnit: 'px' },
          sections: { Background: createBackground('FF27313B', { borderEnabled: false, radius: 999 }) },
        }),
        handleA: createPartNode('handleA', {
          role: 'handle',
          kind: 'circle',
          zIndex: 5,
          layout: { x: 30, y: 42, width: 20, height: 20, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('FFEAF6FF', { borderColour: '55202428', radius: 999 }) },
        }),
        trackB: createPartNode('trackB', {
          role: 'track',
          kind: 'capsule',
          zIndex: 2,
          layout: { x: 40, y: 70, width: 62, height: 8, widthUnit: 'percent', heightUnit: 'px' },
          sections: { Background: createBackground('FF27313B', { borderEnabled: false, radius: 999 }) },
        }),
        handleB: createPartNode('handleB', {
          role: 'handle',
          kind: 'circle',
          zIndex: 5,
          layout: { x: 62, y: 70, width: 20, height: 20, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('FFFFEDB3', { borderColour: '55202428', radius: 999 }) },
        }),
        switchButton: createPartNode('switchButton', {
          role: 'button',
          kind: 'capsule',
          zIndex: 6,
          layout: { x: 86, y: 56, width: 34, height: 54, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('FF5B9BD5', { borderColour: '66FFFFFF', radius: 999 }) },
        }),
      },
    },
    ValueChannels: { _type: 'ValueChannels', _children: channels },
    Behaviors: {
      _type: 'Behaviors',
      _children: {
        sliderA: createBehaviorModule('sliderA', { type: 'slider', role: 'slider', valueChannel: 'valueA', geometry: 'linear' }),
        sliderB: createBehaviorModule('sliderB', { type: 'slider', role: 'slider', valueChannel: 'valueB', geometry: 'linear' }),
        switchMode: createBehaviorModule('switchMode', { type: 'cycle', role: 'button', valueChannel: 'mode', geometry: 'none' }),
      },
    },
    HitZones: {
      _type: 'HitZones',
      _children: {
        sliderAZone: createHitZone('sliderAZone', { targetBehavior: 'sliderA', targetValueChannel: 'valueA', bounds: { x: 7, y: 28, width: 68, height: 28, unit: 'percent' } }),
        sliderBZone: createHitZone('sliderBZone', { targetBehavior: 'sliderB', targetValueChannel: 'valueB', bounds: { x: 7, y: 56, width: 68, height: 30, unit: 'percent' } }),
        switchModeZone: createHitZone('switchModeZone', { shape: 'circle', targetBehavior: 'switchMode', targetValueChannel: 'mode', action: 'cycleValue', bounds: { x: 77, y: 28, width: 18, height: 58, unit: 'percent' } }),
      },
    },
    Bindings: {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        handleATrack: binding('handleATrack', 'channel.valueA.normalized', 'Parts.handleA.Layout.x', { outputMin: 12, outputMax: 68, outputUnit: 'percent' }),
        handleBTrack: binding('handleBTrack', 'channel.valueB.normalized', 'Parts.handleB.Layout.x', { outputMin: 12, outputMax: 68, outputUnit: 'percent' }),
      },
    },
    Links: {
      _type: 'Links',
      enabled: true,
      debug: false,
      _children: {
        activeValueRoute: {
          _type: 'Link',
          name: 'activeValueRoute',
          enabled: true,
          type: 'switch',
          source: 'mode',
          target: 'mainValue',
          condition: '',
          expression: 'mode === "A" ? valueA : valueB',
          notes: 'Routes the active slider value into mainValue.',
        },
      },
    },
    PublishedProperties: {
      _type: 'PublishedProperties',
      inputs: valueChannelPublicEntries(channels, 'input'),
      outputs: valueChannelPublicEntries(channels, 'output'),
      editableProperties: {
        label: { path: 'Parts.label.Text.content', label: 'Label', type: 'text', enabled: true },
      },
    },
    ExternalAPI: createStarterExternalApiDefaults('dualSliderSwitch'),
    Generators: { _type: 'Generators', _children: {} },
    Designer: {
      ...createCustomComponentDesignerDefaults(),
      selectedValueChannel: 'valueA',
      selectedBehavior: 'sliderA',
      selectedHitZone: 'sliderAZone',
      preview: { ...createCustomComponentDesignerDefaults().preview, showHitZones: false, showBounds: false },
      notes: 'Two sliders and a mode switch linked into one active value output.',
    },
  };
}

function createLabelledTwoStateButtonStarterPatch() {
  const channels = {
    mode: createValueChannel('mode', {
      label: 'Button State',
      type: 'enum',
      min: 0,
      max: 1,
      step: 1,
      defaultValue: 'A',
      format: { precision: 0 },
    }),
  };
  channels.mode.values = ['A', 'B'];

  return {
    'Core.name': 'Labelled Two-State Button',
    'Transform.width': 152,
    'Transform.height': 92,
    States: {
      _type: 'States',
      enabled: true,
      debug: false,
      priority: ['stateA', 'stateB', 'pressed', 'hover', 'disabled'],
      _children: {
        StateA: {
          _type: 'State',
          name: 'StateA',
          group: 'value',
          description: 'State A keeps the button on its first background colour.',
          enabled: true,
          when: { valueEnum: 'A' },
          patches: {
            component: {},
            parts: {
              button: { 'Background.Fill.colour': 'FF2F6FED' },
            },
          },
        },
        StateB: {
          _type: 'State',
          name: 'StateB',
          group: 'value',
          description: 'State B changes only the button background colour.',
          enabled: true,
          when: { valueEnum: 'B' },
          patches: {
            component: {},
            parts: {
              button: { 'Background.Fill.colour': 'FFD97727' },
            },
          },
        },
        Hover: {
          _type: 'State',
          name: 'Hover',
          group: 'interaction',
          description: 'Lightly accents the shared outer outline on hover.',
          enabled: true,
          when: { hover: true },
          patches: {
            component: {},
            parts: {
              background: { 'Background.Border.colour': '885B9BD5' },
            },
          },
        },
        Pressed: {
          _type: 'State',
          name: 'Pressed',
          group: 'interaction',
          description: 'Compresses the button surface while pressed.',
          enabled: true,
          when: { pressed: true },
          patches: {
            component: {},
            parts: {
              button: { 'Layout.scale': 0.97 },
            },
          },
        },
        Disabled: {
          _type: 'State',
          name: 'Disabled',
          group: 'system',
          description: 'Dims the full custom component.',
          enabled: true,
          when: { disabled: true },
          patches: {
            component: { 'Transform.opacity': 0.55 },
            parts: {},
          },
        },
      },
    },
    Animations: createStarterAnimations(),
    Parts: {
      _type: 'Parts',
      _children: {
        background: createPartNode('background', {
          role: 'background',
          kind: 'roundedRectangle',
          zIndex: 0,
          layout: { mode: 'fill', widthUnit: 'percent', heightUnit: 'percent' },
          sections: {
            Background: createBackground('FF171C21', { borderColour: 'FF6C7A86', borderThickness: 2, radius: 8 }),
          },
        }),
        label: createPartNode('label', {
          role: 'label',
          kind: 'text',
          zIndex: 2,
          layout: { x: 50, y: 24, width: 118, height: 24, widthUnit: 'px', heightUnit: 'px' },
          sections: {
            Background: createBackground('00171C21', { borderColour: '66FFFFFF', borderThickness: 1, radius: 4 }),
            Text: createText('Label', { colour: 'FFEAF0F6', size: 11, weight: 700 }),
          },
        }),
        button: createPartNode('button', {
          role: 'button',
          kind: 'roundedRectangle',
          zIndex: 1,
          layout: { x: 50, y: 63, width: 118, height: 34, widthUnit: 'px', heightUnit: 'px' },
          sections: {
            Background: createBackground('FF2F6FED', { borderColour: '77FFFFFF', borderThickness: 1, radius: 6 }),
          },
        }),
      },
    },
    ValueChannels: { _type: 'ValueChannels', _children: channels },
    Behaviors: {
      _type: 'Behaviors',
      _children: {
        buttonMode: createBehaviorModule('buttonMode', { type: 'cycle', role: 'button', valueChannel: 'mode', geometry: 'none' }),
      },
    },
    HitZones: {
      _type: 'HitZones',
      _children: {
        buttonZone: createHitZone('buttonZone', {
          targetBehavior: 'buttonMode',
          targetValueChannel: 'mode',
          action: 'cycleValue',
          bounds: { x: 11, y: 49, width: 78, height: 38, unit: 'percent' },
        }),
      },
    },
    Bindings: createCustomComponentBlankBindingsDefaults(),
    Links: createCustomComponentLinksDefaults(),
    PublishedProperties: {
      _type: 'PublishedProperties',
      inputs: valueChannelPublicEntries(channels, 'input'),
      outputs: valueChannelPublicEntries(channels, 'output'),
      editableProperties: {
        label: { path: 'Parts.label.Text.content', label: 'Label', type: 'text', defaultValue: 'Label', enabled: true },
        labelBorder: { path: 'Parts.label.Background.Border.colour', label: 'Label Border', type: 'color', defaultValue: '66FFFFFF', enabled: true },
        stateAColour: { path: 'States.StateA.patches.parts.button.Background.Fill.colour', label: 'State A Colour', type: 'color', defaultValue: 'FF2F6FED', enabled: true },
        stateBColour: { path: 'States.StateB.patches.parts.button.Background.Fill.colour', label: 'State B Colour', type: 'color', defaultValue: 'FFD97727', enabled: true },
        containerColour: { path: 'Parts.background.Background.Fill.colour', label: 'Container Colour', type: 'color', defaultValue: 'FF171C21', enabled: true },
        containerOutline: { path: 'Parts.background.Background.Border.colour', label: 'Container Outline', type: 'color', defaultValue: 'FF6C7A86', enabled: true },
      },
    },
    ExternalAPI: createStarterExternalApiDefaults('labelledTwoStateButton', [
      { id: 'modeChange', label: 'Mode Change', enabled: true },
    ]),
    Generators: { _type: 'Generators', _children: {} },
    Designer: {
      ...createCustomComponentDesignerDefaults(),
      selectedLayer: 'button',
      selectedValueChannel: 'mode',
      selectedBehavior: 'buttonMode',
      selectedHitZone: 'buttonZone',
      selectedState: 'StateB',
      preview: { ...createCustomComponentDesignerDefaults().preview, state: 'StateA', showHitZones: false, showBounds: false },
      notes: 'A single framed background contains a bordered label and a two-state button. The label is intentionally untouched by StateA/StateB patches.',
    },
  };
}

function createXYGridPadStarterPatch() {
  const channels = {
    xValue: createValueChannel('xValue', { label: 'X Value', defaultValue: 0.5 }),
    yValue: createValueChannel('yValue', { label: 'Y Value', defaultValue: 0.5 }),
    pressure: createValueChannel('pressure', { label: 'Pressure', defaultValue: 0.65 }),
  };
  return {
    'Core.name': 'XY Grid Pad',
    'Transform.width': 184,
    'Transform.height': 184,
    ...createStarterLifecycleSections(),
    Parts: {
      _type: 'Parts',
      _children: {
        ...starterShellParts('XY GRID', 'FF121820'),
        padSurface: createPartNode('padSurface', {
          role: 'surface',
          kind: 'roundedRectangle',
          zIndex: 1,
          layout: { x: 50, y: 55, width: 82, height: 70, widthUnit: 'percent', heightUnit: 'percent' },
          sections: { Background: createBackground('FF18212B', { borderColour: '334F718A', radius: 8 }) },
        }),
        cursor: createPartNode('cursor', {
          role: 'handle',
          kind: 'circle',
          zIndex: 10,
          layout: { x: 50, y: 55, width: 18, height: 18, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('FFE5C06B', { borderColour: 'AAFFFFFF', radius: 999 }) },
        }),
      },
    },
    ValueChannels: { _type: 'ValueChannels', _children: channels },
    Behaviors: {
      _type: 'Behaviors',
      _children: {
        xyPad: {
          ...createBehaviorModule('xyPad', { type: 'xy-pad', role: 'xy-pad', valueChannel: 'xValue', geometry: 'xy' }),
          valueChannels: ['xValue', 'yValue', 'pressure'],
        },
      },
    },
    HitZones: {
      _type: 'HitZones',
      _children: {
        padDragArea: createHitZone('padDragArea', {
          targetBehavior: 'xyPad',
          targetValueChannel: 'xValue',
          targetValueChannelY: 'yValue',
          action: 'dragValue',
          bounds: { x: 9, y: 20, width: 82, height: 70, unit: 'percent' },
        }),
      },
    },
    Generators: {
      _type: 'Generators',
      _children: {
        xyGrid: {
          _type: 'Generator',
          name: 'xyGrid',
          type: 'grid',
          enabled: true,
          targetBehavior: 'xyPad',
          targetValueChannel: 'xValue',
          targetValueChannelY: 'yValue',
          rows: 8,
          columns: 8,
          colour: '335B9BD5',
          generatedPartPrefix: 'xyGrid',
          generatedHitZones: false,
          hitZoneAction: 'dragValue',
          detachable: true,
          zIndex: 3,
        },
      },
    },
    Bindings: {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        cursorX: binding('cursorX', 'channel.xValue.normalized', 'Parts.cursor.Layout.x', { outputMin: 13, outputMax: 87, outputUnit: 'percent' }),
        cursorY: binding('cursorY', 'channel.yValue.normalized', 'Parts.cursor.Layout.y', { outputMin: 84, outputMax: 26, outputUnit: 'percent' }),
      },
    },
    Links: createCustomComponentLinksDefaults(),
    PublishedProperties: {
      _type: 'PublishedProperties',
      inputs: valueChannelPublicEntries(channels, 'input'),
      outputs: valueChannelPublicEntries(channels, 'output'),
      editableProperties: {
        label: { path: 'Parts.label.Text.content', label: 'Label', type: 'text', enabled: true },
      },
    },
    ExternalAPI: createStarterExternalApiDefaults('xyGridPad'),
    Designer: {
      ...createCustomComponentDesignerDefaults(),
      selectedValueChannel: 'xValue',
      selectedBehavior: 'xyPad',
      selectedHitZone: 'padDragArea',
      selectedGenerator: 'xyGrid',
      preview: { ...createCustomComponentDesignerDefaults().preview, showHitZones: false, showBounds: false },
      notes: 'Generated XY grid pad with X/Y public values and a movable cursor.',
    },
  };
}

function createScrollPianoBarStarterPatch() {
  const channels = {
    note: createValueChannel('note', { label: 'Note', type: 'int', min: 0, max: 127, step: 1, defaultValue: 60, format: { precision: 0, unit: 'midi' } }),
    scroll: createValueChannel('scroll', { label: 'Scroll', defaultValue: 0.25 }),
    velocity: createValueChannel('velocity', { label: 'Velocity', defaultValue: 0.8 }),
  };
  return {
    'Core.name': 'Scrollable Piano Bar',
    'Transform.width': 300,
    'Transform.height': 86,
    ...createStarterLifecycleSections(),
    Parts: {
      _type: 'Parts',
      _children: {
        ...starterShellParts('PIANO BAR', 'FF14171B'),
        keyViewport: createPartNode('keyViewport', {
          role: 'viewport',
          kind: 'viewport',
          zIndex: 1,
          layout: { x: 50, y: 62, width: 94, height: 58, widthUnit: 'percent', heightUnit: 'percent' },
          sections: { Background: createBackground('FF0E1115', { borderColour: '445B9BD5', radius: 6 }) },
        }),
        scrollThumb: createPartNode('scrollThumb', {
          role: 'handle',
          kind: 'capsule',
          zIndex: 9,
          layout: { x: 28, y: 91, width: 46, height: 5, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('FF5B9BD5', { borderEnabled: false, radius: 999 }) },
        }),
      },
    },
    ValueChannels: { _type: 'ValueChannels', _children: channels },
    Behaviors: {
      _type: 'Behaviors',
      _children: {
        pianoBar: createBehaviorModule('pianoBar', { type: 'piano-bar', role: 'piano', valueChannel: 'note', geometry: 'piano' }),
        pianoScroll: createBehaviorModule('pianoScroll', { type: 'slider', role: 'slider', valueChannel: 'scroll', geometry: 'linear' }),
      },
    },
    HitZones: {
      _type: 'HitZones',
      _children: {
        scrollArea: createHitZone('scrollArea', { targetBehavior: 'pianoScroll', targetValueChannel: 'scroll', action: 'dragValue', bounds: { x: 8, y: 86, width: 84, height: 12, unit: 'percent' } }),
      },
    },
    Generators: {
      _type: 'Generators',
      _children: {
        pianoKeys: {
          _type: 'Generator',
          name: 'pianoKeys',
          type: 'piano-keys',
          enabled: true,
          targetBehavior: 'pianoBar',
          targetValueChannel: 'note',
          count: 36,
          baseNote: 48,
          generatedPartPrefix: 'piano',
          generatedHitZones: true,
          hitZoneAction: 'noteValue',
          detachable: true,
          zIndex: 4,
        },
      },
    },
    Bindings: {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        scrollThumbX: binding('scrollThumbX', 'channel.scroll.normalized', 'Parts.scrollThumb.Layout.x', { outputMin: 12, outputMax: 88, outputUnit: 'percent' }),
      },
    },
    Links: createCustomComponentLinksDefaults(),
    PublishedProperties: {
      _type: 'PublishedProperties',
      inputs: valueChannelPublicEntries(channels, 'input'),
      outputs: valueChannelPublicEntries(channels, 'output'),
      editableProperties: {
        label: { path: 'Parts.label.Text.content', label: 'Label', type: 'text', enabled: true },
      },
    },
    ExternalAPI: createStarterExternalApiDefaults('scrollablePianoBar'),
    Designer: {
      ...createCustomComponentDesignerDefaults(),
      selectedValueChannel: 'note',
      selectedBehavior: 'pianoBar',
      selectedHitZone: 'scrollArea',
      selectedGenerator: 'pianoKeys',
      preview: { ...createCustomComponentDesignerDefaults().preview, showHitZones: false, showBounds: false },
      notes: 'Scrollable piano-bar starter with generated keys, note output, scroll, and velocity channels.',
    },
  };
}

function placeholderFilmstripSource() {
  return 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22128%22%20height%3D%221024%22%20viewBox%3D%220%200%20128%201024%22%3E%3Crect%20width%3D%22128%22%20height%3D%221024%22%20fill%3D%22%2311161c%22/%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%235b9bd5%22%20stroke-width%3D%226%22%3E%3Ccircle%20cx%3D%2264%22%20cy%3D%2264%22%20r%3D%2240%22/%3E%3Ccircle%20cx%3D%2264%22%20cy%3D%22192%22%20r%3D%2240%22/%3E%3Ccircle%20cx%3D%2264%22%20cy%3D%22320%22%20r%3D%2240%22/%3E%3Ccircle%20cx%3D%2264%22%20cy%3D%22448%22%20r%3D%2240%22/%3E%3Ccircle%20cx%3D%2264%22%20cy%3D%22576%22%20r%3D%2240%22/%3E%3Ccircle%20cx%3D%2264%22%20cy%3D%22704%22%20r%3D%2240%22/%3E%3Ccircle%20cx%3D%2264%22%20cy%3D%22832%22%20r%3D%2240%22/%3E%3Ccircle%20cx%3D%2264%22%20cy%3D%22960%22%20r%3D%2240%22/%3E%3C/g%3E%3Cg%20stroke%3D%22%23eef6ff%22%20stroke-width%3D%226%22%20stroke-linecap%3D%22round%22%3E%3Cline%20x1%3D%2264%22%20y1%3D%2264%22%20x2%3D%2264%22%20y2%3D%2230%22/%3E%3Cline%20x1%3D%2264%22%20y1%3D%22192%22%20x2%3D%2276%22%20y2%3D%22160%22/%3E%3Cline%20x1%3D%2264%22%20y1%3D%22320%22%20x2%3D%2290%22%20y2%3D%22300%22/%3E%3Cline%20x1%3D%2264%22%20y1%3D%22448%22%20x2%3D%2298%22%20y2%3D%22448%22/%3E%3Cline%20x1%3D%2264%22%20y1%3D%22576%22%20x2%3D%2290%22%20y2%3D%22596%22/%3E%3Cline%20x1%3D%2264%22%20y1%3D%22704%22%20x2%3D%2276%22%20y2%3D%22736%22/%3E%3Cline%20x1%3D%2264%22%20y1%3D%22832%22%20x2%3D%2264%22%20y2%3D%22866%22/%3E%3Cline%20x1%3D%2264%22%20y1%3D%22960%22%20x2%3D%2252%22%20y2%3D%22992%22/%3E%3C/g%3E%3C/svg%3E';
}

function createTripleValueSliderStarterPatch() {
  const channels = {
    minValue: createValueChannel('minValue', { label: 'Minimum', defaultValue: 0.2 }),
    mainValue: createValueChannel('mainValue', { label: 'Current', defaultValue: 0.5 }),
    maxValue: createValueChannel('maxValue', { label: 'Maximum', defaultValue: 0.8 }),
  };
  return {
    'Core.name': 'Triple Value Slider',
    'Transform.width': 260,
    'Transform.height': 112,
    ...createStarterLifecycleSections(),
    Parts: {
      _type: 'Parts',
      _children: {
        ...starterShellParts('TRIPLE SLIDER', 'FF141A20'),
        track: createPartNode('track', {
          role: 'track',
          kind: 'capsule',
          zIndex: 2,
          layout: { x: 50, y: 58, width: 82, height: 10, widthUnit: 'percent', heightUnit: 'px' },
          sections: { Background: createBackground('FF27313B', { borderEnabled: false, radius: 999 }) },
        }),
        rangeFill: createPartNode('rangeFill', {
          role: 'fill',
          kind: 'capsule',
          zIndex: 3,
          layout: { x: 50, y: 58, width: 48, height: 10, widthUnit: 'percent', heightUnit: 'px' },
          sections: { Background: createBackground('665B9BD5', { borderEnabled: false, radius: 999 }) },
        }),
        minHandle: createPartNode('minHandle', {
          role: 'handle',
          kind: 'circle',
          zIndex: 5,
          layout: { x: 22, y: 58, width: 18, height: 18, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('FF70C08F', { borderColour: 'AAFFFFFF', radius: 999 }) },
        }),
        mainHandle: createPartNode('mainHandle', {
          role: 'handle',
          kind: 'circle',
          zIndex: 6,
          layout: { x: 50, y: 58, width: 24, height: 24, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('FFEAF6FF', { borderColour: '665B9BD5', radius: 999 }) },
        }),
        maxHandle: createPartNode('maxHandle', {
          role: 'handle',
          kind: 'circle',
          zIndex: 5,
          layout: { x: 78, y: 58, width: 18, height: 18, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('FFE5C06B', { borderColour: 'AAFFFFFF', radius: 999 }) },
        }),
      },
    },
    ValueChannels: { _type: 'ValueChannels', _children: channels },
    Behaviors: {
      _type: 'Behaviors',
      _children: {
        minSlider: createBehaviorModule('minSlider', { type: 'slider', role: 'slider', valueChannel: 'minValue', geometry: 'linear' }),
        mainSlider: createBehaviorModule('mainSlider', { type: 'slider', role: 'slider', valueChannel: 'mainValue', geometry: 'linear' }),
        maxSlider: createBehaviorModule('maxSlider', { type: 'slider', role: 'slider', valueChannel: 'maxValue', geometry: 'linear' }),
      },
    },
    HitZones: {
      _type: 'HitZones',
      _children: {
        minZone: createHitZone('minZone', { targetBehavior: 'minSlider', targetValueChannel: 'minValue', bounds: { x: 8, y: 30, width: 84, height: 18, unit: 'percent' } }),
        mainZone: createHitZone('mainZone', { targetBehavior: 'mainSlider', targetValueChannel: 'mainValue', bounds: { x: 8, y: 48, width: 84, height: 22, unit: 'percent' } }),
        maxZone: createHitZone('maxZone', { targetBehavior: 'maxSlider', targetValueChannel: 'maxValue', bounds: { x: 8, y: 70, width: 84, height: 18, unit: 'percent' } }),
      },
    },
    Bindings: {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        minHandleX: binding('minHandleX', 'channel.minValue.normalized', 'Parts.minHandle.Layout.x', { outputMin: 9, outputMax: 91, outputUnit: 'percent' }),
        mainHandleX: binding('mainHandleX', 'channel.mainValue.normalized', 'Parts.mainHandle.Layout.x', { outputMin: 9, outputMax: 91, outputUnit: 'percent' }),
        maxHandleX: binding('maxHandleX', 'channel.maxValue.normalized', 'Parts.maxHandle.Layout.x', { outputMin: 9, outputMax: 91, outputUnit: 'percent' }),
        rangeFillWidth: binding('rangeFillWidth', 'channel.maxValue.normalized', 'Parts.rangeFill.Layout.width', { outputMin: 8, outputMax: 82, outputUnit: 'percent' }),
      },
    },
    Links: {
      _type: 'Links',
      enabled: true,
      debug: false,
      _children: {
        clampMainFromMin: {
          _type: 'Link',
          name: 'clampMainFromMin',
          enabled: true,
          type: 'clamp',
          source: 'mainValue',
          target: 'mainValue',
          min: 0,
          max: 1,
          notes: 'Keep the current value inside the authored range; refine this into min/max expressions if needed.',
        },
      },
    },
    Generators: { _type: 'Generators', _children: {} },
    PublishedProperties: {
      _type: 'PublishedProperties',
      inputs: valueChannelPublicEntries(channels, 'input'),
      outputs: valueChannelPublicEntries(channels, 'output'),
      editableProperties: {
        label: { path: 'Parts.label.Text.content', label: 'Label', type: 'text', enabled: true },
      },
    },
    ExternalAPI: createStarterExternalApiDefaults('tripleValueSlider'),
    Designer: {
      ...createCustomComponentDesignerDefaults(),
      selectedValueChannel: 'mainValue',
      selectedBehavior: 'mainSlider',
      selectedHitZone: 'mainZone',
      preview: { ...createCustomComponentDesignerDefaults().preview, showHitZones: false, showBounds: false },
      notes: 'Three-value slider starter for min/current/max ranges and multi-value panel controls.',
    },
  };
}

function createFilmstripKnobStarterPatch() {
  const channels = {
    mainValue: createValueChannel('mainValue', { label: 'Knob Value', defaultValue: 0.5 }),
  };
  return {
    'Core.name': 'Filmstrip Knob',
    'Transform.width': 126,
    'Transform.height': 126,
    ...createStarterLifecycleSections(),
    Parts: {
      _type: 'Parts',
      _children: {
        ...starterShellParts('FILMSTRIP', 'FF12161B'),
        fallbackRing: createPartNode('fallbackRing', {
          role: 'ring',
          kind: 'ring',
          zIndex: 2,
          layout: { x: 50, y: 56, width: 78, height: 78, widthUnit: 'px', heightUnit: 'px' },
          sections: { Background: createBackground('00111111', { borderColour: '445B9BD5', borderThickness: 5, radius: 999 }) },
        }),
        pointer: createPartNode('pointer', {
          role: 'pointer',
          kind: 'capsule',
          zIndex: 8,
          layout: { x: 50, y: 56, width: 5, height: 30, widthUnit: 'px', heightUnit: 'px', pivotX: 50, pivotY: 118 },
          sections: { Background: createBackground('FFEAF6FF', { borderEnabled: false, radius: 999 }) },
        }),
      },
    },
    Assets: {
      _type: 'Assets',
      images: {},
      filmstrips: {
        knobFrames: {
          name: 'knobFrames',
          source: placeholderFilmstripSource(),
          frameCount: 8,
          frameWidth: 128,
          frameHeight: 128,
          orientation: 'vertical',
          interpolation: 'nearest',
          valueSource: 'mainValue',
        },
      },
      fonts: {},
      thumbnails: {},
      packagePolicy: { embedAssets: true, warnMissingFonts: true },
    },
    ValueChannels: { _type: 'ValueChannels', _children: channels },
    Behaviors: {
      _type: 'Behaviors',
      _children: {
        knobDrag: createBehaviorModule('knobDrag', { type: 'slider', role: 'slider', valueChannel: 'mainValue', geometry: 'circular' }),
      },
    },
    HitZones: {
      _type: 'HitZones',
      _children: {
        knobZone: createHitZone('knobZone', { shape: 'circle', targetBehavior: 'knobDrag', targetValueChannel: 'mainValue', action: 'dragValue', bounds: { x: 18, y: 22, width: 64, height: 68, unit: 'percent' } }),
      },
    },
    Generators: {
      _type: 'Generators',
      _children: {
        filmstripFrame: {
          _type: 'Generator',
          name: 'filmstripFrame',
          type: 'filmstrip-frames',
          enabled: true,
          assetName: 'knobFrames',
          generatedPartPrefix: 'filmstrip',
          generatedHitZones: false,
          zIndex: 6,
          detachable: false,
        },
      },
    },
    Bindings: {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        pointerRotation: binding('pointerRotation', 'channel.mainValue.normalized', 'Parts.pointer.Layout.rotation', { outputMin: -135, outputMax: 135, outputUnit: 'deg' }),
      },
    },
    Links: createCustomComponentLinksDefaults(),
    PublishedProperties: {
      _type: 'PublishedProperties',
      inputs: valueChannelPublicEntries(channels, 'input'),
      outputs: valueChannelPublicEntries(channels, 'output'),
      editableProperties: {
        label: { path: 'Parts.label.Text.content', label: 'Label', type: 'text', enabled: true },
        filmstrip: { path: 'Assets.filmstrips.knobFrames.source', label: 'Filmstrip Source', type: 'image', enabled: true },
      },
    },
    ExternalAPI: createStarterExternalApiDefaults('filmstripKnob'),
    Designer: {
      ...createCustomComponentDesignerDefaults(),
      selectedValueChannel: 'mainValue',
      selectedBehavior: 'knobDrag',
      selectedHitZone: 'knobZone',
      selectedGenerator: 'filmstripFrame',
      selectedAsset: 'knobFrames',
      preview: { ...createCustomComponentDesignerDefaults().preview, showHitZones: false, showBounds: false },
      notes: 'Filmstrip knob starter with an embedded placeholder strip that can be baked or replaced later.',
    },
  };
}

export function createCustomComponentStarterPatch(starterId) {
  if (starterId === 'starter.blankCanvas') {
    return {
      'Core.name': 'Blank Custom Component',
      Parts: createCustomComponentBlankPartsDefaults(),
      HitZones: createCustomComponentBlankHitZonesDefaults(),
      Generators: createCustomComponentBlankGeneratorsDefaults(),
      Bindings: createCustomComponentBlankBindingsDefaults(),
      Designer: {
        ...createCustomComponentDesignerDefaults(),
        selectedLayer: '',
        selectedHitZone: '',
        selectedSurfaceKind: 'artboard',
        preview: {
          ...createCustomComponentDesignerDefaults().preview,
          showHitZones: true,
          showBounds: true,
        },
        notes: 'Blank canvas for drawing custom parts and hit zones directly in the Component Designer.',
      },
    };
  }
  if (starterId === 'starter.macroRings') return createMacroRingsStarterPatch();
  if (starterId === 'starter.circularTickSlider') return createCircularTickSliderStarterPatch();
  if (starterId === 'starter.circularLedRing') return createCircularLedRingStarterPatch();
  if (starterId === 'starter.dualSliderSwitch') return createDualSliderSwitchStarterPatch();
  if (starterId === 'starter.labelledTwoStateButton') return createLabelledTwoStateButtonStarterPatch();
  if (starterId === 'starter.xyGridPad') return createXYGridPadStarterPatch();
  if (starterId === 'starter.scrollPianoBar') return createScrollPianoBarStarterPatch();
  if (starterId === 'starter.tripleValueSlider') return createTripleValueSliderStarterPatch();
  if (starterId === 'starter.filmstripKnob') return createFilmstripKnobStarterPatch();
  return {};
}

// "Make Interactive" archetypes. Each describes the defaults for one common
// control so a single action can scaffold the value channel(s) + behavior +
// hit zone(s), pre-wired, instead of the author hand-authoring three things.
// The hit-zone `source` defaults follow §3.5 of the redesign plan.
export const CUSTOM_INTERACTIVE_ARCHETYPES = {
  dial: { label: 'Dial', cursor: 'grab', shape: 'circle', geometry: 'circular', source: 'face' },
  slider: { label: 'Slider', cursor: 'ew-resize', shape: 'rectangle', geometry: 'horizontal', source: 'part', minTouch: 44 },
  handle: { label: 'Handle', cursor: 'grab', shape: 'rectangle', geometry: 'horizontal', source: 'part', inflate: 12, minTouch: 44, relative: true },
  button: { label: 'Button', cursor: 'pointer', shape: 'rectangle', geometry: 'none', source: 'part', action: 'cycleValue', boolean: true },
  toggle: { label: 'Toggle', cursor: 'pointer', shape: 'rectangle', geometry: 'none', source: 'part', action: 'toggleValue', boolean: true },
  xy: { label: 'XY Pad', cursor: 'move', shape: 'rectangle', geometry: 'xy', source: 'face', dual: true },
  range: { label: 'Range', cursor: 'ew-resize', shape: 'rectangle', geometry: 'horizontal', source: 'part', range: true, relative: true },
};

export function listInteractiveArchetypes() {
  return Object.entries(CUSTOM_INTERACTIVE_ARCHETYPES).map(([id, spec]) => ({ id, label: spec.label }));
}

function floatChannel(name, label, defaultValue = 0) {
  return createValueChannel(name, { label, type: 'float', min: 0, max: 1, step: 0.01, defaultValue });
}

/**
 * Scaffold a fully pre-wired interactive control of the given archetype.
 *
 * Returns `{ valueChannels, behaviors, hitZones }` — name→object maps ready to
 * merge into a control's section `_children`. `options` lets the caller name
 * the set and point hit zones at the parts they should follow:
 *   name      base name for generated channels/behaviors/zones (default = id)
 *   partName  the part a `source:'part'` archetype should track
 *   minPart / maxPart  handle parts for the range archetype
 */
export function makeInteractive(archetypeId, options = {}) {
  const archetype = CUSTOM_INTERACTIVE_ARCHETYPES[archetypeId];
  if (!archetype) return null;

  const name = String(options.name || archetypeId).trim() || archetypeId;
  const geometry = options.geometry || archetype.geometry;
  const relativeDrag = archetype.relative || options.relative;
  const dragMode = options.dragMode || (relativeDrag
    ? (geometry === 'vertical' ? 'vertical' : 'horizontal')
    : 'auto');

  const valueChannels = {};
  const behaviors = {};
  const hitZones = {};

  const partFor = (fallback) => options.partName || fallback;
  const inflate = archetype.inflate ? { x: archetype.inflate, y: archetype.inflate, unit: 'px' } : {};
  const sourceFor = (partName) => (archetype.source === 'face' ? 'face' : `part:${partName}`);

  if (archetype.dual) {
    // XY pad — one face, two channels.
    const xName = `${name}X`;
    const yName = `${name}Y`;
    valueChannels[xName] = floatChannel(xName, 'X', 0.5);
    valueChannels[yName] = floatChannel(yName, 'Y', 0.5);
    const behaviorName = `${name}Pad`;
    behaviors[behaviorName] = {
      ...createBehaviorModule(behaviorName, { type: 'xy-pad', role: 'xy-pad', valueChannel: xName, geometry: 'xy', dragMode }),
      valueChannels: [xName, yName],
    };
    hitZones[`${name}Zone`] = createHitZone(`${name}Zone`, {
      shape: archetype.shape,
      targetBehavior: behaviorName,
      targetValueChannel: xName,
      targetValueChannelY: yName,
      action: 'dragValue',
      source: 'face',
      cursor: archetype.cursor,
    });
    return { valueChannels, behaviors, hitZones };
  }

  if (archetype.range) {
    // Range — two handles, two linked channels.
    const minName = `${name}Min`;
    const maxName = `${name}Max`;
    valueChannels[minName] = { ...floatChannel(minName, 'Min', 0.25), constraints: { enabled: true, normalizedMin: 0, normalizedMax: 1, pairedMax: maxName } };
    valueChannels[maxName] = { ...floatChannel(maxName, 'Max', 0.75), constraints: { enabled: true, normalizedMin: 0, normalizedMax: 1, pairedMin: minName } };
    const minPart = options.minPart || `${name}MinHandle`;
    const maxPart = options.maxPart || `${name}MaxHandle`;
    for (const [channel, part, suffix] of [[minName, minPart, 'Min'], [maxName, maxPart, 'Max']]) {
      const behaviorName = `${name}${suffix}`;
      behaviors[behaviorName] = createBehaviorModule(behaviorName, { type: 'slider', role: 'range', valueChannel: channel, geometry, dragMode });
      hitZones[`${name}${suffix}Zone`] = createHitZone(`${name}${suffix}Zone`, {
        shape: archetype.shape,
        targetBehavior: behaviorName,
        targetValueChannel: channel,
        action: 'dragValue',
        source: `part:${part}`,
        inflate: { x: 12, y: 12, unit: 'px' },
        minTouch: 44,
        cursor: archetype.cursor,
      });
    }
    return { valueChannels, behaviors, hitZones };
  }

  // Single-channel archetypes: dial, slider, handle, button, toggle.
  const channelName = `${name}Value`;
  valueChannels[channelName] = archetype.boolean
    ? createValueChannel(channelName, { label: archetype.label, type: 'bool', min: 0, max: 1, step: 1, defaultValue: false })
    : floatChannel(channelName, archetype.label, archetype.geometry === 'circular' ? 0.5 : 0);

  const behaviorName = `${name}Behavior`;
  behaviors[behaviorName] = createBehaviorModule(behaviorName, {
    type: archetypeId,
    role: archetypeId,
    valueChannel: channelName,
    geometry,
    dragMode,
  });

  const partName = partFor(name);
  hitZones[`${name}Zone`] = createHitZone(`${name}Zone`, {
    shape: archetype.shape,
    targetBehavior: behaviorName,
    targetValueChannel: channelName,
    action: archetype.action || 'dragValue',
    source: sourceFor(partName),
    inflate,
    minTouch: archetype.minTouch || 0,
    cursor: archetype.cursor,
  });

  return { valueChannels, behaviors, hitZones };
}

export function createCustomComponentSections() {
  return {
    Designer: createCustomComponentDesignerDefaults(),
    Assets: createCustomComponentAssetsDefaults(),
    ValueChannels: createCustomComponentValueChannelsDefaults(),
    Behaviors: createCustomComponentBehaviorsDefaults(),
    HitZones: createCustomComponentBlankHitZonesDefaults(),
    Generators: createCustomComponentBlankGeneratorsDefaults(),
    Links: createCustomComponentLinksDefaults(),
    PublishedProperties: createCustomComponentPublishedPropertiesDefaults(),
    ExternalAPI: createCustomComponentExternalApiDefaults(),
    Variants: createCustomComponentVariantsDefaults(),
  };
}
