import { createControl } from '../models/componentTypes.js';
import { createPanel } from '../stores/panelModel.js';
import {
  createBackground,
  createBehaviorModule,
  createCustomComponentBlankBindingsDefaults,
  createCustomComponentDesignerDefaults,
  createCustomComponentLinksDefaults,
  createHitZone,
  createPartNode,
  createText,
  createValueChannel,
} from './customComponentFactory.js';
import { instantiateCustomComponentPackageControl } from './customComponentPackage.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function binding(name, source, target, {
  outputMin = 0,
  outputMax = 1,
  outputUnit = '',
  clamp = true,
  round = false,
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
    round,
    invert: false,
  };
}

function directBinding(name, source, target) {
  return {
    _type: 'Binding',
    name,
    enabled: true,
    source,
    mapMode: 'direct',
    target,
    outputUnit: '',
    inputMin: 0,
    inputMax: 1,
    outputMin: 0,
    outputMax: 1,
    falseValue: 0,
    trueValue: 1,
    enumMap: {},
    clamp: false,
    round: false,
    invert: false,
  };
}

function formatBinding(name, source, target, {
  multiplier = 1,
  offset = 0,
  precision = 0,
  prefix = '',
  suffix = '',
} = {}) {
  return {
    ...directBinding(name, source, target),
    mapMode: 'format',
    multiplier,
    offset,
    precision,
    prefix,
    suffix,
  };
}

function publicEntries(channels, direction = 'input') {
  return Object.fromEntries(
    Object.entries(channels).map(([name, channel]) => [
      name,
      {
        channel: name,
        label: channel.label || name,
        type: channel.type || 'float',
        enabled: direction === 'input' ? channel.publicInput !== false : channel.publicOutput !== false,
        min: channel.min,
        max: channel.max,
        step: channel.step,
        defaultValue: channel.defaultValue,
      },
    ])
  );
}

function states(extra = {}) {
  return {
    _type: 'States',
    enabled: true,
    debug: false,
    priority: ['active', 'stateA', 'stateB', 'armed', 'dragging', 'pressed', 'hover', 'disabled'],
    _children: {
      Hover: {
        _type: 'State',
        name: 'Hover',
        group: 'interaction',
        description: 'Accents the outer shell while hovered.',
        enabled: true,
        when: { hover: true },
        patches: { component: {}, parts: { background: { 'Background.Border.colour': 'AA9AD7FF' } } },
      },
      Pressed: {
        _type: 'State',
        name: 'Pressed',
        group: 'interaction',
        description: 'Compresses the component while pressed.',
        enabled: true,
        when: { pressed: true },
        patches: { component: { 'Transform.scale': 0.985 }, parts: {} },
      },
      Disabled: {
        _type: 'State',
        name: 'Disabled',
        group: 'system',
        description: 'Dims the component when disabled.',
        enabled: true,
        when: { disabled: true },
        patches: { component: { 'Transform.opacity': 0.48 }, parts: {} },
      },
      ...extra,
    },
  };
}

function shell(label, colour = 'FF12171D', border = '334E6B7F') {
  return {
    background: createPartNode('background', {
      role: 'background',
      kind: 'roundedRectangle',
      zIndex: 0,
      layout: { mode: 'fill', widthUnit: 'percent', heightUnit: 'percent' },
      sections: { Background: createBackground(colour, { borderColour: border, borderThickness: 1, radius: 7 }) },
    }),
    title: createPartNode('title', {
      role: 'label',
      kind: 'text',
      zIndex: 90,
      layout: { x: 50, y: 10, width: 86, height: 16, widthUnit: 'percent', heightUnit: 'px' },
      sections: { Text: createText(label, { colour: 'FFE8F3FA', size: 9, weight: 700 }) },
    }),
  };
}

function rect(name, layout, colour, {
  role = 'custom',
  zIndex = 10,
  radius = 4,
  borderColour = '224B6475',
  borderThickness = 1,
  kind = 'roundedRectangle',
  meta = {},
} = {}) {
  return createPartNode(name, {
    role,
    kind,
    zIndex,
    layout: {
      xUnit: 'px',
      yUnit: 'px',
      widthUnit: 'px',
      heightUnit: 'px',
      anchorX: 'left',
      anchorY: 'top',
      ...layout,
    },
    sections: { Background: createBackground(colour, { borderColour, borderThickness, radius }) },
    meta,
  });
}

function text(name, label, layout, options = {}) {
  return createPartNode(name, {
    role: options.role ?? 'label',
    kind: 'text',
    zIndex: options.zIndex ?? 80,
    layout: {
      xUnit: 'px',
      yUnit: 'px',
      widthUnit: 'px',
      heightUnit: 'px',
      anchorX: 'left',
      anchorY: 'top',
      ...layout,
    },
    sections: {
      ...(options.background ? { Background: options.background } : {}),
      Text: createText(label, {
        colour: options.colour ?? 'FFDCE8EF',
        size: options.size ?? 10,
        weight: options.weight ?? 700,
      }),
    },
  });
}

function arc(name, layout, colour, options = {}) {
  return createPartNode(name, {
    role: options.role ?? 'ring',
    kind: 'arcTrack',
    zIndex: options.zIndex ?? 12,
    layout: {
      xUnit: 'px',
      yUnit: 'px',
      widthUnit: 'px',
      heightUnit: 'px',
      anchorX: 'left',
      anchorY: 'top',
      ...layout,
    },
    sections: {
      Background: createBackground('00000000', {
        borderColour: colour,
        borderThickness: options.thickness ?? 6,
        borderEnabled: false,
        radius: 999,
      }),
    },
    meta: {
      renderer: 'arcTrack',
      arcTrack: {
        startAngle: options.startAngle ?? -135,
        sweepAngle: options.sweepAngle ?? 270,
        direction: options.direction ?? 'cw',
        thickness: options.thickness ?? 6,
        colour,
      },
    },
  });
}

function valueArc(name, layout, colour, options = {}) {
  return createPartNode(name, {
    role: options.role ?? 'valueArc',
    kind: 'valueArc',
    zIndex: options.zIndex ?? 13,
    layout: {
      xUnit: 'px',
      yUnit: 'px',
      widthUnit: 'px',
      heightUnit: 'px',
      anchorX: 'left',
      anchorY: 'top',
      ...layout,
    },
    sections: {},
    meta: {
      renderer: 'valueArc',
      valueArc: {
        startAngle: options.startAngle ?? -135,
        sweepAngle: options.sweepAngle ?? 270,
        thickness: options.thickness ?? 6,
        colour,
        value: options.value ?? 0,
        ...(options.startValue !== undefined ? { startValue: options.startValue } : {}),
        ...(options.endValue !== undefined ? { endValue: options.endValue } : {}),
      },
    },
  });
}

function envelopePathPart(name, layout, options = {}) {
  return createPartNode(name, {
    role: 'envelopePath',
    kind: 'envelopePath',
    zIndex: options.zIndex ?? 14,
    layout: {
      xUnit: 'px',
      yUnit: 'px',
      widthUnit: 'px',
      heightUnit: 'px',
      ...layout,
      anchorX: 'left',
      anchorY: 'top',
    },
    meta: {
      renderer: 'envelopePath',
      envelopePath: {
        mode: options.mode ?? 'points',
        points: options.points ?? [
          { id: 'start', x: 0, y: 0 },
          { id: 'peak', x: 0.24, y: 1 },
          { id: 'decay', x: 0.42, y: 0.58 },
          { id: 'releaseStart', x: 0.72, y: 0.58 },
          { id: 'end', x: 1, y: 0 },
        ],
        attack: options.attack ?? 0.24,
        decay: options.decay ?? 0.38,
        sustain: options.sustain ?? 0.58,
        release: options.release ?? 0.72,
        stroke: options.stroke ?? 'FF65E6A0',
        fill: options.fill ?? '2265E6A0',
        strokeWidth: options.strokeWidth ?? 4,
        padX: options.padX ?? 8,
        padY: options.padY ?? 7,
      },
    },
  });
}

function waveformIconPart(name, type, layout, options = {}) {
  return createPartNode(name, {
    role: 'waveformIcon',
    kind: 'waveformIcon',
    zIndex: options.zIndex ?? 18,
    layout: {
      xUnit: 'px',
      yUnit: 'px',
      widthUnit: 'px',
      heightUnit: 'px',
      anchorX: 'left',
      anchorY: 'top',
      ...layout,
    },
    meta: {
      renderer: 'waveformIcon',
      waveformIcon: {
        type,
        stroke: options.stroke ?? 'FFEAF0F6',
        strokeWidth: options.strokeWidth ?? 3,
        animationMode: options.animationMode ?? 'scroll',
        animationDurationMs: options.animationDurationMs ?? 900,
      },
    },
  });
}

function makeComponent({
  slug,
  name,
  description,
  width,
  height,
  parts,
  channels = {},
  behaviors = {},
  hitZones = {},
  generators = {},
  stateOverrides = {},
  bindings = {},
  designer = {},
  arpeggiator = null,
  tags = [],
  category = 'Stress Test',
}) {
  const control = createControl('CustomComponent', {
    name,
    Core: { name },
    Transform: { width, height },
  });
  const designerDefaults = createCustomComponentDesignerDefaults();
  control._children.Parts = { _type: 'Parts', _children: parts };
  control._children.ValueChannels = { _type: 'ValueChannels', _children: channels };
  control._children.Behaviors = { _type: 'Behaviors', _children: behaviors };
  control._children.HitZones = { _type: 'HitZones', _children: hitZones };
  control._children.Generators = { _type: 'Generators', _children: generators };
  control._children.Bindings = { ...createCustomComponentBlankBindingsDefaults(), _children: bindings };
  const componentStates = states(stateOverrides);
  if (!parts.background && componentStates._children?.Hover?.patches?.parts) {
    componentStates._children.Hover.patches.parts = {};
  }
  control._children.States = componentStates;
  control._children.Links = createCustomComponentLinksDefaults();
  control._children.PublishedProperties = {
    _type: 'PublishedProperties',
    inputs: publicEntries(channels, 'input'),
    outputs: publicEntries(channels, 'output'),
    editableProperties: {
      label: {
        path: parts.title ? 'Parts.title.Text.content' : (parts.label ? 'Parts.label.Text.content' : ''),
        label: 'Label',
        type: 'text',
        enabled: parts.title || parts.label ? true : false,
        defaultValue: parts.title?._children?.Text?.content ?? parts.label?._children?.Text?.content ?? '',
      },
      ...(parts.label?._children?.Background?._children?.Border ? {
        labelBorder: {
          path: 'Parts.label.Background.Border.colour',
          label: 'Label Border',
          type: 'color',
          enabled: true,
          defaultValue: parts.label._children.Background._children.Border.colour ?? '66FFFFFF',
        },
      } : {}),
      ...(parts.background?._children?.Background?._children?.Border ? {
        containerOutline: {
          path: 'Parts.background.Background.Border.colour',
          label: 'Container Outline',
          type: 'color',
          enabled: true,
          defaultValue: parts.background._children.Background._children.Border.colour ?? 'FF718191',
        },
      } : {}),
    },
  };
  control._children.ExternalAPI = {
    ...(control._children.ExternalAPI ?? {}),
    addressableName: slug,
    events: [
      { id: 'valueChange', label: 'Value Change', enabled: true },
      { id: 'interaction', label: 'Interaction', enabled: true },
    ],
  };
  control._children.Designer = {
    ...designerDefaults,
    selectedLayer: Object.keys(parts)[0] ?? 'background',
    selectedValueChannel: Object.keys(channels)[0] ?? '',
    selectedBehavior: Object.keys(behaviors)[0] ?? '',
    selectedHitZone: Object.keys(hitZones)[0] ?? '',
    preview: { ...designerDefaults.preview, showHitZones: false, showBounds: false, testValue: 0.62 },
    arpeggiator: arpeggiator ?? designerDefaults.arpeggiator,
    notes: description,
    ...designer,
  };
  return {
    slug,
    name,
    description,
    width,
    height,
    tags,
    category,
    component: control,
    metadata: {
      id: `stress-${slug}`,
      name,
      version: '1.0.0',
      author: 'CEditor stress test',
      description,
      category,
      tags,
      license: 'Internal test fixture',
      homepage: '',
    },
  };
}

function dialComponent() {
  const channels = { cutoff: createValueChannel('cutoff', { label: 'Cutoff', min: 20, max: 20000, defaultValue: 9600, format: { precision: 0, suffix: ' Hz' } }) };
  return makeComponent({
    slug: 'neon-dial',
    name: 'Neon Dial',
    description: 'Circular dial with generated radial ticks, a value arc, pointer binding, and drag hit zone.',
    width: 164,
    height: 164,
    parts: {
      ...shell('CUTOFF', 'FF0F151A', '335BD3FF'),
      title: text('title', 'CUTOFF', { x: 43, y: 134, width: 78, height: 14 }, { size: 9, colour: 'FFE8F3FA' }),
      ring: arc('ring', { x: 12, y: 14, width: 140, height: 140 }, 'FF2E3942', { thickness: 10, zIndex: 3 }),
      valueArc: valueArc('valueArc', { x: 12, y: 14, width: 140, height: 140 }, 'FF27D7C4', { thickness: 10, zIndex: 4, value: 0.48 }),
      pointer: rect('pointer', { x: 82, y: 20, width: 4, height: 64, anchorX: 'center', anchorY: 'top', pivotX: 50, pivotY: 100 }, 'FFF3F9FF', { kind: 'capsule', radius: 999, zIndex: 20, borderThickness: 0 }),
      cap: rect('cap', { x: 61, y: 61, width: 42, height: 42 }, 'FF18222A', { kind: 'circle', radius: 999, zIndex: 22, borderColour: '8827D7C4', borderThickness: 2 }),
      readout: text('readout', '9600 Hz', { x: 43, y: 118, width: 78, height: 18 }, { size: 10, colour: 'FFBDFDF5' }),
    },
    channels,
    behaviors: { cutoffDial: createBehaviorModule('cutoffDial', { valueChannel: 'cutoff', role: 'dial', type: 'dial', geometry: 'circular', dragMode: 'vertical', interaction: { wheel: true } }) },
    hitZones: { dialZone: createHitZone('dialZone', { shape: 'circle', targetBehavior: 'cutoffDial', targetValueChannel: 'cutoff', bounds: { x: 15, y: 14, width: 70, height: 74, unit: 'percent' } }) },
    generators: { ticks: { _type: 'Generator', name: 'ticks', type: 'ticks', enabled: true, geometry: 'circular', count: 11, minorCount: 1, radius: 43, startAngle: -135, endAngle: 135, generatedPartPrefix: 'cutoffTick' } },
    bindings: {
      pointerRotation: binding('pointerRotation', 'channel.cutoff.normalized', 'Parts.pointer.Layout.rotation', { outputMin: -135, outputMax: 135, outputUnit: 'deg' }),
      arcValue: binding('arcValue', 'channel.cutoff.normalized', 'Parts.valueArc.meta.valueArc.value', { outputMin: 0, outputMax: 1 }),
      readoutText: formatBinding('readoutText', 'channel.cutoff.raw', 'Parts.readout.Text.content', { precision: 0, suffix: ' Hz' }),
    },
    stateOverrides: { Active: { _type: 'State', name: 'Active', group: 'value', enabled: true, when: { valueGreaterThan: 0.72 }, patches: { component: {}, parts: { cap: { 'Background.Border.colour': 'FFFFD06B' } } } } },
  });
}

function macroRingsComponent() {
  const channels = {
    min: createValueChannel('min', {
      label: 'Minimum',
      defaultValue: 0.24,
      constraints: { normalizedMax: 'channel.max.normalized', normalizedMaxGap: 0.12 },
    }),
    max: createValueChannel('max', {
      label: 'Maximum',
      defaultValue: 0.78,
      constraints: { normalizedMin: 'channel.min.normalized', normalizedMinGap: 0.12 },
    }),
    value: createValueChannel('value', {
      label: 'Sent Value',
      defaultValue: 0.52,
      constraints: { normalizedMin: 'channel.min.normalized', normalizedMax: 'channel.max.normalized' },
    }),
    rangeLocked: createValueChannel('rangeLocked', {
      label: 'Lock Range',
      type: 'bool',
      defaultValue: false,
    }),
  };
  return makeComponent({
    slug: 'range-macro-arc',
    name: 'Range Macro Arc',
    description: 'Single filled range arc controlling minimum, maximum, and the sent value channel.',
    width: 178,
    height: 178,
    parts: {
      ...shell('RANGE', 'FF151315', '33495C66'),
      track: arc('track', { x: 22, y: 29, width: 134, height: 134 }, 'FF26333D', { thickness: 12, zIndex: 8 }),
      rangeArc: valueArc('rangeArc', { x: 22, y: 29, width: 134, height: 134 }, 'FF6AD6FF', { thickness: 12, zIndex: 12, startValue: 0.24, endValue: 0.78 }),
      innerShade: rect('innerShade', { x: 55, y: 62, width: 68, height: 68 }, '66101518', { kind: 'circle', radius: 999, zIndex: 13, borderColour: '223B4A55' }),
      minHandle: rect('minHandle', { x: 89, y: 31, width: 4, height: 36, anchorX: 'center', anchorY: 'top', pivotX: 50, pivotY: 180.5555555556 }, 'FFFFD36C', { kind: 'capsule', radius: 999, zIndex: 24, borderThickness: 0 }),
      valueHandle: rect('valueHandle', { x: 89, y: 25, width: 5, height: 48, anchorX: 'center', anchorY: 'top', pivotX: 50, pivotY: 147.9166666667 }, 'FFFFFFFF', { kind: 'capsule', radius: 999, zIndex: 26, borderThickness: 0 }),
      maxHandle: rect('maxHandle', { x: 89, y: 31, width: 4, height: 36, anchorX: 'center', anchorY: 'top', pivotX: 50, pivotY: 180.5555555556 }, 'FF8EFFA5', { kind: 'capsule', radius: 999, zIndex: 24, borderThickness: 0 }),
      lockBody: rect('lockBody', { x: 70, y: 79, width: 38, height: 20 }, 'FF192227', { kind: 'capsule', radius: 999, zIndex: 30, borderColour: '66758A94' }),
      lockText: text('lockText', 'EDIT', { x: 74, y: 84, width: 30, height: 12 }, { size: 7, colour: 'FFEAF0F6', zIndex: 32 }),
      minValue: text('minValue', 'MIN 24%', { x: 18, y: 136, width: 48, height: 14 }, { size: 8, colour: 'FFFFD36C' }),
      sentValue: text('sentValue', 'OUT 52%', { x: 65, y: 119, width: 52, height: 14 }, { size: 9, colour: 'FFFFFFFF' }),
      maxValue: text('maxValue', 'MAX 78%', { x: 112, y: 136, width: 48, height: 14 }, { size: 8, colour: 'FF8EFFA5' }),
    },
    channels,
    behaviors: {
      minDrag: { ...createBehaviorModule('minDrag', { valueChannel: 'min', geometry: 'circular', role: 'dial', dragMode: 'vertical' }), dragSensitivity: 1.15 },
      valueDrag: { ...createBehaviorModule('valueDrag', { valueChannel: 'value', geometry: 'circular', role: 'dial', dragMode: 'vertical' }), dragSensitivity: 1.15 },
      maxDrag: { ...createBehaviorModule('maxDrag', { valueChannel: 'max', geometry: 'circular', role: 'dial', dragMode: 'vertical' }), dragSensitivity: 1.15 },
      lockToggle: createBehaviorModule('lockToggle', { type: 'toggle', valueChannel: 'rangeLocked', geometry: 'none', role: 'button' }),
    },
    hitZones: {
      minZone: { ...createHitZone('minZone', { targetBehavior: 'minDrag', targetValueChannel: 'min', bounds: { x: 5, y: 18, width: 30, height: 58, unit: 'percent' } }), condition: 'rangeLocked == false' },
      valueZone: createHitZone('valueZone', { targetBehavior: 'valueDrag', targetValueChannel: 'value', bounds: { x: 35, y: 14, width: 30, height: 64, unit: 'percent' } }),
      maxZone: { ...createHitZone('maxZone', { targetBehavior: 'maxDrag', targetValueChannel: 'max', bounds: { x: 65, y: 18, width: 30, height: 58, unit: 'percent' } }), condition: 'rangeLocked == false' },
      lockZone: { ...createHitZone('lockZone', { targetBehavior: 'lockToggle', targetValueChannel: 'rangeLocked', action: 'toggleValue', bounds: { x: 37, y: 43, width: 26, height: 14, unit: 'percent' } }), priority: 50 },
    },
    generators: {},
    bindings: {
      rangeMin: binding('rangeMin', 'channel.min.normalized', 'Parts.rangeArc.meta.valueArc.startValue', { outputMin: 0, outputMax: 1 }),
      rangeMax: binding('rangeMax', 'channel.max.normalized', 'Parts.rangeArc.meta.valueArc.endValue', { outputMin: 0, outputMax: 1 }),
      minRotation: binding('minRotation', 'channel.min.normalized', 'Parts.minHandle.Layout.rotation', { outputMin: -135, outputMax: 135, outputUnit: 'deg' }),
      valueRotation: binding('valueRotation', 'channel.value.normalized', 'Parts.valueHandle.Layout.rotation', { outputMin: -135, outputMax: 135, outputUnit: 'deg' }),
      maxRotation: binding('maxRotation', 'channel.max.normalized', 'Parts.maxHandle.Layout.rotation', { outputMin: -135, outputMax: 135, outputUnit: 'deg' }),
      minText: formatBinding('minText', 'channel.min.normalized', 'Parts.minValue.Text.content', { multiplier: 100, precision: 0, prefix: 'MIN ', suffix: '%' }),
      sentText: formatBinding('sentText', 'channel.value.normalized', 'Parts.sentValue.Text.content', { multiplier: 100, precision: 0, prefix: 'OUT ', suffix: '%' }),
      maxText: formatBinding('maxText', 'channel.max.normalized', 'Parts.maxValue.Text.content', { multiplier: 100, precision: 0, prefix: 'MAX ', suffix: '%' }),
    },
    stateOverrides: {
      Locked: {
        _type: 'State',
        name: 'Locked',
        group: 'interaction',
        enabled: true,
        when: { 'channel.rangeLocked.raw': true },
        patches: {
          component: {},
          parts: {
            minHandle: { opacity: 0.35 },
            maxHandle: { opacity: 0.35 },
            lockBody: { 'Background.Fill.colour': 'FF2D4655', 'Background.Border.colour': 'FF8EC8E8' },
            lockText: { 'Text.content': 'LOCK' },
          },
        },
      },
    },
  });
}

function horizontalScaleComponent() {
  const channels = { gain: createValueChannel('gain', { label: 'Gain', min: -24, max: 24, step: 0.5, defaultValue: 0, format: { suffix: ' dB' } }) };
  return makeComponent({
    slug: 'fine-horizontal-scale',
    name: 'Fine Horizontal Scale',
    description: 'Horizontal slider/scale with generated major/minor ticks, value fill, and set-value hit zone.',
    width: 260,
    height: 90,
    parts: {
      ...shell('GAIN', 'FF11171B', '334E6B75'),
      rail: rect('rail', { x: 30, y: 48, width: 200, height: 4 }, 'FF24313A', { kind: 'capsule', radius: 999, zIndex: 4, borderThickness: 0 }),
      fill: rect('fill', { x: 30, y: 48, width: 104, height: 4 }, 'FFFFC85F', { kind: 'capsule', radius: 999, zIndex: 5, borderThickness: 0 }),
      thumb: rect('thumb', { x: 126, y: 39, width: 18, height: 22 }, 'FFEAF0F3', { kind: 'capsule', radius: 999, zIndex: 20, borderColour: '44FFFFFF' }),
      low: text('low', '-24', { x: 7, y: 43, width: 28, height: 14 }, { size: 8, colour: 'FF8796A0' }),
      zero: text('zero', '0', { x: 122, y: 58, width: 16, height: 14 }, { size: 8, colour: 'FFE4EEF5' }),
      high: text('high', '+24', { x: 226, y: 43, width: 28, height: 14 }, { size: 8, colour: 'FF8796A0' }),
      gainValue: text('gainValue', '0.0 dB', { x: 96, y: 14, width: 68, height: 16 }, { size: 9, colour: 'FFFFD36C' }),
    },
    channels,
    behaviors: { gainSlide: createBehaviorModule('gainSlide', { valueChannel: 'gain', geometry: 'linear', role: 'slider' }) },
    hitZones: { railZone: createHitZone('railZone', { targetBehavior: 'gainSlide', targetValueChannel: 'gain', action: 'setValue', bounds: { x: 10, y: 31, width: 80, height: 36, unit: 'percent' } }) },
    generators: { scaleTicks: { _type: 'Generator', name: 'scaleTicks', type: 'ticks', enabled: true, geometry: 'horizontal', count: 9, minorCount: 3, generatedPartPrefix: 'gainTick', bounds: { x: 10, y: 48, width: 80, height: 24 } } },
    bindings: {
      thumbX: binding('thumbX', 'channel.gain.normalized', 'Parts.thumb.Layout.x', { outputMin: 30, outputMax: 212, outputUnit: 'px' }),
      fillWidth: binding('fillWidth', 'channel.gain.normalized', 'Parts.fill.Layout.width', { outputMin: 0, outputMax: 200, outputUnit: 'px' }),
      gainText: formatBinding('gainText', 'channel.gain.raw', 'Parts.gainValue.Text.content', { precision: 1, suffix: ' dB' }),
    },
  });
}

function verticalScaleComponent() {
  const channels = { balance: createValueChannel('balance', { label: 'Balance', min: -1, max: 1, step: 0.01, defaultValue: 0 }) };
  return makeComponent({
    slug: 'bipolar-horizontal-scale',
    name: 'Bipolar Horizontal Scale',
    description: 'Horizontal bipolar balance scale with centre marker, generated ticks, and side labels.',
    width: 230,
    height: 108,
    parts: {
      ...shell('BAL', 'FF11161A', '33495A66'),
      rail: rect('rail', { x: 30, y: 52, width: 170, height: 4 }, 'FF26343D', { kind: 'capsule', radius: 999, zIndex: 3, borderThickness: 0 }),
      centre: rect('centre', { x: 114, y: 44, width: 2, height: 22 }, 'FFBBC8CF', { zIndex: 12, borderThickness: 0 }),
      thumb: rect('thumb', { x: 104, y: 43, width: 22, height: 22 }, 'FF8EFFA5', { kind: 'capsule', radius: 999, zIndex: 18, borderColour: '55FFFFFF' }),
      leftLabel: text('leftLabel', 'L', { x: 12, y: 45, width: 16, height: 16 }, { size: 9 }),
      mid: text('mid', '0', { x: 111, y: 76, width: 16, height: 16 }, { size: 9, colour: 'FFCAD4DA' }),
      rightLabel: text('rightLabel', 'R', { x: 204, y: 45, width: 16, height: 16 }, { size: 9 }),
      balanceValue: text('balanceValue', '0.00', { x: 96, y: 17, width: 38, height: 16 }, { size: 9, colour: 'FF8EFFA5' }),
    },
    channels,
    behaviors: { balanceSlide: createBehaviorModule('balanceSlide', { valueChannel: 'balance', geometry: 'linear', role: 'slider', dragMode: 'horizontal' }) },
    hitZones: { scaleZone: createHitZone('scaleZone', { targetBehavior: 'balanceSlide', targetValueChannel: 'balance', action: 'setValue', bounds: { x: 10, y: 32, width: 80, height: 45, unit: 'percent' } }) },
    generators: { balanceTicks: { _type: 'Generator', name: 'balanceTicks', type: 'ticks', enabled: true, geometry: 'horizontal', count: 7, minorCount: 1, generatedPartPrefix: 'balanceTick', bounds: { x: 10, y: 45, width: 80, height: 22 } } },
    bindings: {
      thumbX: binding('thumbX', 'channel.balance.normalized', 'Parts.thumb.Layout.x', { outputMin: 19, outputMax: 189, outputUnit: 'px' }),
      balanceText: formatBinding('balanceText', 'channel.balance.raw', 'Parts.balanceValue.Text.content', { precision: 2 }),
    },
  });
}

function meterComponent() {
  const channels = { level: createValueChannel('level', { label: 'Level', min: 0, max: 1, defaultValue: 0.72 }) };
  return makeComponent({
    slug: 'segment-meter',
    name: 'Segment Meter',
    description: 'Horizontal 16-segment meter using a value-driven repeated LED generator.',
    width: 260,
    height: 84,
    parts: {
      ...shell('LEVEL', 'FF101419', '33475561'),
      readout: text('readout', '72%', { x: 178, y: 10, width: 62, height: 16 }, { size: 9, colour: 'FFFFD36C' }),
    },
    channels,
    behaviors: { levelSet: createBehaviorModule('levelSet', { valueChannel: 'level', geometry: 'linear', role: 'meter' }) },
    hitZones: { meterZone: createHitZone('meterZone', { targetBehavior: 'levelSet', targetValueChannel: 'level', action: 'setValue', bounds: { x: 8, y: 36, width: 84, height: 34, unit: 'percent' } }) },
    generators: { leds: { _type: 'Generator', name: 'leds', type: 'repeated-leds', enabled: true, geometry: 'horizontal', count: 16, ledSize: 9, valueSource: 'level', activeColour: 'FF65E6A0', inactiveColour: '222B3640', generatedPartPrefix: 'levelLed', generatedHitZones: true, targetBehavior: 'levelSet', targetValueChannel: 'level' } },
    bindings: { levelText: formatBinding('levelText', 'channel.level.normalized', 'Parts.readout.Text.content', { multiplier: 100, precision: 0, suffix: '%' }) },
  });
}

function ledLadderComponent() {
  const channels = { amount: createValueChannel('amount', { label: 'Amount', defaultValue: 0.44 }) };
  return makeComponent({
    slug: 'vertical-led-ladder',
    name: 'Vertical LED Ladder',
    description: 'Vertical LED ladder with single-dot activation and clickable generated hit zones.',
    width: 96,
    height: 246,
    parts: {
      ...shell('STAGE', 'FF101316', '334A5963'),
      spine: rect('spine', { x: 45, y: 38, width: 6, height: 174 }, 'FF202B32', { kind: 'capsule', radius: 999, zIndex: 3, borderThickness: 0 }),
      labelA: text('labelA', 'MAX', { x: 55, y: 34, width: 28, height: 14 }, { size: 8, colour: 'FF8997A0' }),
      labelB: text('labelB', 'MIN', { x: 55, y: 202, width: 28, height: 14 }, { size: 8, colour: 'FF8997A0' }),
      amountValue: text('amountValue', '5', { x: 36, y: 220, width: 24, height: 16 }, { size: 10, colour: 'FFFF8A8A' }),
    },
    channels,
    behaviors: { ladderSet: createBehaviorModule('ladderSet', { valueChannel: 'amount', geometry: 'vertical', role: 'selector' }) },
    hitZones: { ladderZone: createHitZone('ladderZone', { targetBehavior: 'ladderSet', targetValueChannel: 'amount', action: 'setValue', bounds: { x: 24, y: 13, width: 52, height: 76, unit: 'percent' } }) },
    generators: { ladder: { _type: 'Generator', name: 'ladder', type: 'repeated-leds', enabled: true, geometry: 'vertical', count: 12, ledSize: 10, valueSource: 'amount', activationMode: 'single', activeColour: 'FFFF6868', inactiveColour: '2B40484E', generatedPartPrefix: 'ladderLed', generatedHitZones: true, targetBehavior: 'ladderSet', targetValueChannel: 'amount' } },
    bindings: { amountText: formatBinding('amountText', 'channel.amount.normalized', 'Parts.amountValue.Text.content', { multiplier: 11, offset: 1, precision: 0 }) },
  });
}

function xyPadComponent() {
  const channels = {
    x: createValueChannel('x', { label: 'X', defaultValue: 0.32 }),
    y: createValueChannel('y', { label: 'Y', defaultValue: 0.68 }),
  };
  return makeComponent({
    slug: 'xy-pad',
    name: 'XY Pad',
    description: 'Two-axis pad with generated grid, independent X/Y outputs, dot bindings, and rectangular drag zone.',
    width: 210,
    height: 190,
    parts: {
      ...shell('XY PAD', 'FF10151A', '335B7181'),
      field: rect('field', { x: 20, y: 30, width: 170, height: 140 }, 'FF0C1116', { zIndex: 2, borderColour: '554E6B7F', radius: 5 }),
      vCursor: rect('vCursor', { x: 74, y: 34, width: 1, height: 132 }, 'AA8EFFA5', { zIndex: 16, borderThickness: 0 }),
      hCursor: rect('hCursor', { x: 24, y: 122, width: 162, height: 1 }, 'AA8EFFA5', { zIndex: 16, borderThickness: 0 }),
      dot: rect('dot', { x: 64, y: 112, width: 20, height: 20 }, 'FFFFD36C', { kind: 'circle', radius: 999, zIndex: 22, borderColour: 'AAFFFFFF' }),
      xReadout: text('xReadout', 'X 0.32', { x: 20, y: 171, width: 64, height: 14 }, { size: 8, colour: 'FF8EFFA5' }),
      yReadout: text('yReadout', 'Y 0.68', { x: 122, y: 171, width: 64, height: 14 }, { size: 8, colour: 'FF8EFFA5' }),
    },
    channels,
    behaviors: { xyDrag: createBehaviorModule('xyDrag', { valueChannel: 'x', role: 'xyPad', geometry: 'xy', interaction: { pointer: true, keyboard: true } }) },
    hitZones: { padZone: createHitZone('padZone', { targetBehavior: 'xyDrag', targetValueChannel: 'x', targetValueChannelY: 'y', action: 'dragValue', bounds: { x: 9, y: 16, width: 82, height: 74, unit: 'percent' } }) },
    generators: { padGrid: { _type: 'Generator', name: 'padGrid', type: 'grid', enabled: true, rows: 4, columns: 4, colour: '225D7788', generatedPartPrefix: 'xyGrid', generatedHitZones: false, targetBehavior: 'xyDrag', targetValueChannel: 'x', targetValueChannelY: 'y', bounds: { x: 9.5, y: 17.5, width: 81, height: 73.5 } } },
    bindings: {
      dotX: binding('dotX', 'channel.x.normalized', 'Parts.dot.Layout.x', { outputMin: 20, outputMax: 170, outputUnit: 'px' }),
      dotY: binding('dotY', 'channel.y.normalized', 'Parts.dot.Layout.y', { outputMin: 150, outputMax: 30, outputUnit: 'px' }),
      vCursorX: binding('vCursorX', 'channel.x.normalized', 'Parts.vCursor.Layout.x', { outputMin: 30, outputMax: 180, outputUnit: 'px' }),
      hCursorY: binding('hCursorY', 'channel.y.normalized', 'Parts.hCursor.Layout.y', { outputMin: 160, outputMax: 34, outputUnit: 'px' }),
      xText: formatBinding('xText', 'channel.x.raw', 'Parts.xReadout.Text.content', { precision: 2, prefix: 'X ' }),
      yText: formatBinding('yText', 'channel.y.raw', 'Parts.yReadout.Text.content', { precision: 2, prefix: 'Y ' }),
    },
  });
}

function labelledButtonComponent() {
  const channels = { mode: createValueChannel('mode', { label: 'State', type: 'enum', min: 0, max: 1, step: 1, defaultValue: 'A', format: { precision: 0 } }) };
  channels.mode.values = ['A', 'B'];
  return makeComponent({
    slug: 'label-above-button',
    name: 'Label Above Button',
    description: 'A bordered label and a two-state button inside one outlined background; state patches only affect the button.',
    width: 168,
    height: 106,
    parts: {
      background: rect('background', { x: 0, y: 0, width: 168, height: 106 }, 'FF171C21', { zIndex: 0, radius: 8, borderColour: 'FF718191', borderThickness: 2 }),
      label: text('label', 'STATIC LABEL', { x: 25, y: 15, width: 118, height: 24 }, { size: 10, colour: 'FFEAF0F6', background: createBackground('00171C21', { borderColour: '88E1E7EF', borderThickness: 1, radius: 4 }) }),
      button: rect('button', { x: 25, y: 55, width: 118, height: 34 }, 'FF2F6FED', { role: 'button', zIndex: 12, radius: 6, borderColour: '77FFFFFF' }),
      buttonText: text('buttonText', 'ACTION', { x: 25, y: 64, width: 118, height: 16 }, { role: 'buttonLabel', zIndex: 20, size: 10 }),
    },
    channels,
    behaviors: { buttonMode: createBehaviorModule('buttonMode', { type: 'cycle', role: 'button', valueChannel: 'mode', geometry: 'none' }) },
    hitZones: { buttonZone: createHitZone('buttonZone', { targetBehavior: 'buttonMode', targetValueChannel: 'mode', action: 'cycleValue', bounds: { x: 14, y: 50, width: 72, height: 36, unit: 'percent' } }) },
    stateOverrides: {
      StateA: { _type: 'State', name: 'StateA', group: 'value', enabled: true, when: { valueEnum: 'A' }, patches: { component: {}, parts: { button: { 'Background.Fill.colour': 'FF2F6FED' } } } },
      StateB: { _type: 'State', name: 'StateB', group: 'value', enabled: true, when: { valueEnum: 'B' }, patches: { component: {}, parts: { button: { 'Background.Fill.colour': 'FFD97727' } } } },
    },
    designer: { selectedState: 'StateB', preview: { ...createCustomComponentDesignerDefaults().preview, state: 'StateA', showBounds: false, showHitZones: false } },
  });
}

function transportComponent() {
  const channels = { transport: createValueChannel('transport', { label: 'Transport', type: 'enum', min: 0, max: 2, step: 1, defaultValue: 'stop' }) };
  channels.transport.values = ['stop', 'play', 'record'];
  return makeComponent({
    slug: 'transport-cluster',
    name: 'Transport Cluster',
    description: 'Three command buttons with individual hit zones and state-colour patches for active transport modes.',
    width: 230,
    height: 86,
    parts: {
      ...shell('TRANSPORT', 'FF111519', '334C5E69'),
      stop: rect('stop', { x: 22, y: 34, width: 54, height: 34 }, 'FF202931', { role: 'button', zIndex: 8, radius: 5, borderColour: '554E6575' }),
      play: rect('play', { x: 88, y: 34, width: 54, height: 34 }, 'FF202931', { role: 'button', zIndex: 8, radius: 5, borderColour: '554E6575' }),
      record: rect('record', { x: 154, y: 34, width: 54, height: 34 }, 'FF202931', { role: 'button', zIndex: 8, radius: 5, borderColour: '554E6575' }),
      stopGlyph: text('stopGlyph', 'STOP', { x: 22, y: 44, width: 54, height: 14 }, { zIndex: 20, size: 8 }),
      playGlyph: text('playGlyph', 'PLAY', { x: 88, y: 44, width: 54, height: 14 }, { zIndex: 20, size: 8, colour: 'FF8EFFA5' }),
      recGlyph: text('recGlyph', 'REC', { x: 154, y: 44, width: 54, height: 14 }, { zIndex: 20, size: 8, colour: 'FFFF8A8A' }),
    },
    channels,
    behaviors: { transportCycle: createBehaviorModule('transportCycle', { type: 'cycle', role: 'buttonGroup', valueChannel: 'transport', geometry: 'none' }) },
    hitZones: {
      stopZone: createHitZone('stopZone', { targetBehavior: 'transportCycle', targetValueChannel: 'transport', action: 'setValue', payload: { value: 'stop' }, bounds: { x: 10, y: 39, width: 23, height: 40, unit: 'percent' } }),
      playZone: createHitZone('playZone', { targetBehavior: 'transportCycle', targetValueChannel: 'transport', action: 'setValue', payload: { value: 'play' }, bounds: { x: 38, y: 39, width: 24, height: 40, unit: 'percent' } }),
      recZone: createHitZone('recZone', { targetBehavior: 'transportCycle', targetValueChannel: 'transport', action: 'setValue', payload: { value: 'record' }, bounds: { x: 67, y: 39, width: 24, height: 40, unit: 'percent' } }),
    },
    stateOverrides: {
      Stop: { _type: 'State', name: 'Stop', group: 'value', enabled: true, when: { valueEnum: 'stop' }, patches: { component: {}, parts: { stop: { 'Background.Fill.colour': 'FF46515B' } } } },
      Play: { _type: 'State', name: 'Play', group: 'value', enabled: true, when: { valueEnum: 'play' }, patches: { component: {}, parts: { play: { 'Background.Fill.colour': 'FF1D6E47' } } } },
      Record: { _type: 'State', name: 'Record', group: 'value', enabled: true, when: { valueEnum: 'record' }, patches: { component: {}, parts: { record: { 'Background.Fill.colour': 'FF873636' } } } },
    },
  });
}

function arpeggiatorComponent() {
  const channels = {
    arpCurrentStep: createValueChannel('arpCurrentStep', { label: 'Arp Step', type: 'int', defaultValue: 0, min: 0, max: 31, step: 1 }),
    arpStepCount: createValueChannel('arpStepCount', { label: 'Arp Steps', type: 'int', defaultValue: 32, min: 1, max: 256, step: 1, publicInput: false, publicOutput: false }),
    arpNote: createValueChannel('arpNote', { label: 'Arp Note', type: 'int', defaultValue: 60, min: 0, max: 127, step: 1 }),
    arpVelocity: createValueChannel('arpVelocity', { label: 'Arp Velocity', type: 'int', defaultValue: 0, min: 0, max: 127, step: 1 }),
    arpGate: createValueChannel('arpGate', { label: 'Arp Gate', type: 'bool', defaultValue: false, min: 0, max: 1, step: 1 }),
  };
  return makeComponent({
    slug: 'arp-sequencer',
    name: 'Arpeggiator Sequencer',
    description: '32-step graphical arpeggiator with note blocks, draw/move/resize hit zones, and runtime gate/note outputs.',
    width: 720,
    height: 300,
    parts: {
      arpPanel: rect('arpPanel', { x: 0, y: 0, width: 720, height: 300 }, 'FF101317', { role: 'arpeggiatorSurface', zIndex: 1, radius: 4, borderColour: 'FF354555', meta: { locked: true, arpeggiatorSurface: true } }),
    },
    channels,
    behaviors: { arpEdit: createBehaviorModule('arpEdit', { type: 'grid', role: 'arpeggiator', valueChannel: 'arpCurrentStep', geometry: 'grid', interaction: { pointer: true, keyboard: true, wheel: false, snap: true } }) },
    hitZones: { arpSurfaceZone: createHitZone('arpSurfaceZone', { targetBehavior: 'arpEdit', targetValueChannel: 'arpCurrentStep', action: 'arpeggiatorEdit', bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' } }) },
    arpeggiator: {
      enabled: true,
      stepCount: 32,
      noteMin: 0,
      noteMax: 127,
      viewNote: 60,
      selectedBlock: 'arp_3_64',
      blocks: [
        { id: 'arp_0_60', note: 60, step: 0, length: 2, velocity: 104 },
        { id: 'arp_3_64', note: 64, step: 3, length: 1, velocity: 118 },
        { id: 'arp_5_67', note: 67, step: 5, length: 3, velocity: 92 },
        { id: 'arp_10_71', note: 71, step: 10, length: 2, velocity: 124 },
        { id: 'arp_14_69', note: 69, step: 14, length: 4, velocity: 83 },
        { id: 'arp_22_70', note: 70, step: 22, length: 2, velocity: 112 },
      ],
    },
    designer: { selectedLayer: 'arpPanel', selectedValueChannel: 'arpNote' },
    tags: ['arpeggiator', 'sequencer', 'grid'],
  });
}

function envelopeComponent() {
  const channels = {
    attack: createValueChannel('attack', { label: 'Attack', defaultValue: 0.24 }),
    decay: createValueChannel('decay', { label: 'Decay', defaultValue: 0.38 }),
    sustain: createValueChannel('sustain', { label: 'Sustain', defaultValue: 0.58 }),
    release: createValueChannel('release', { label: 'Release', defaultValue: 0.72 }),
  };
  const graph = { x: 26, y: 38, width: 248, height: 80, padX: 12, padY: 10 };
  const handleSize = 10;
  const handleX = (normalized) => graph.x + graph.padX - (handleSize / 2) + ((graph.width - graph.padX * 2) * normalized);
  const handleY = (normalized) => graph.y + graph.padY - (handleSize / 2) + ((graph.height - graph.padY * 2) * (1 - normalized));
  const attackX = { min: 0.12, max: 0.28 };
  const decayX = { min: 0.34, max: 0.52 };
  const releaseStartX = { min: 0.82, max: 0.64 };
  const sustainHandleX = 0.58;
  return makeComponent({
    slug: 'adsr-envelope',
    name: 'ADSR Envelope',
    description: 'Generic point-envelope display using ADSR channels as one editable envelope preset.',
    width: 300,
    height: 164,
    parts: {
      ...shell('ADSR', 'FF11161B', '446B7F91'),
      grid: rect('grid', { x: 18, y: 32, width: 264, height: 98 }, 'FF0A1015', { zIndex: 2, borderColour: '334B6272', radius: 4 }),
      floor: rect('floor', { x: graph.x + graph.padX, y: graph.y + graph.height - graph.padY, width: graph.width - graph.padX * 2, height: 1 }, '665A7585', { zIndex: 4, radius: 0, borderThickness: 0 }),
      envelopeCurve: envelopePathPart('envelopeCurve', { x: graph.x, y: graph.y, width: graph.width, height: graph.height }, {
        stroke: 'FF65E6A0',
        fill: '2465E6A0',
        strokeWidth: 4,
        padX: graph.padX,
        padY: graph.padY,
        points: [
          { id: 'start', x: 0, y: 0 },
          { id: 'attackPeak', x: attackX.min + ((attackX.max - attackX.min) * 0.24), y: 1 },
          { id: 'decayEnd', x: decayX.min + ((decayX.max - decayX.min) * 0.38), y: 0.58 },
          { id: 'releaseStart', x: releaseStartX.min + ((releaseStartX.max - releaseStartX.min) * 0.72), y: 0.58 },
          { id: 'end', x: 1, y: 0 },
        ],
      }),
      aDot: rect('aDot', { x: handleX(attackX.min + ((attackX.max - attackX.min) * 0.24)), y: handleY(1), width: handleSize, height: handleSize }, 'FF65E6A0', { kind: 'circle', radius: 999, zIndex: 28, borderColour: 'EEFFFFFF', borderThickness: 1 }),
      dDot: rect('dDot', { x: handleX(decayX.min + ((decayX.max - decayX.min) * 0.38)), y: handleY(0.58), width: handleSize, height: handleSize }, 'FFFFD36C', { kind: 'circle', radius: 999, zIndex: 28, borderColour: 'EEFFFFFF', borderThickness: 1 }),
      sDot: rect('sDot', { x: handleX(sustainHandleX), y: handleY(0.58), width: handleSize, height: handleSize }, 'FF6AD6FF', { kind: 'circle', radius: 999, zIndex: 28, borderColour: 'EEFFFFFF', borderThickness: 1 }),
      rDot: rect('rDot', { x: handleX(releaseStartX.min + ((releaseStartX.max - releaseStartX.min) * 0.72)), y: handleY(0.58), width: handleSize, height: handleSize }, 'FFFF8A8A', { kind: 'circle', radius: 999, zIndex: 28, borderColour: 'EEFFFFFF', borderThickness: 1 }),
      attackValue: text('attackValue', 'A 24%', { x: 34, y: 138, width: 54, height: 14 }, { size: 8, colour: 'FF65E6A0' }),
      decayValue: text('decayValue', 'D 38%', { x: 94, y: 138, width: 54, height: 14 }, { size: 8, colour: 'FFFFD36C' }),
      sustainValue: text('sustainValue', 'S 58%', { x: 154, y: 138, width: 54, height: 14 }, { size: 8, colour: 'FF6AD6FF' }),
      releaseValue: text('releaseValue', 'R 72%', { x: 214, y: 138, width: 54, height: 14 }, { size: 8, colour: 'FFFF8A8A' }),
    },
    channels,
    behaviors: {
      attackDrag: { ...createBehaviorModule('attackDrag', { valueChannel: 'attack', geometry: 'linear', role: 'slider', dragMode: 'horizontal' }), dragSensitivity: 1.35 },
      decayDrag: { ...createBehaviorModule('decayDrag', { valueChannel: 'decay', geometry: 'linear', role: 'slider', dragMode: 'horizontal' }), dragSensitivity: 1.35 },
      sustainDrag: { ...createBehaviorModule('sustainDrag', { valueChannel: 'sustain', geometry: 'vertical', role: 'slider', dragMode: 'vertical' }), dragSensitivity: 1.2 },
      releaseDrag: { ...createBehaviorModule('releaseDrag', { valueChannel: 'release', geometry: 'linear', role: 'slider', dragMode: 'horizontal', reverseMouseDirection: true }), dragSensitivity: 1.35 },
    },
    hitZones: {
      attackZone: createHitZone('attackZone', { targetBehavior: 'attackDrag', targetValueChannel: 'attack', bounds: { x: 8, y: 23, width: 24, height: 58, unit: 'percent' } }),
      decayZone: createHitZone('decayZone', { targetBehavior: 'decayDrag', targetValueChannel: 'decay', bounds: { x: 30, y: 23, width: 22, height: 58, unit: 'percent' } }),
      sustainZone: createHitZone('sustainZone', { targetBehavior: 'sustainDrag', targetValueChannel: 'sustain', bounds: { x: 49, y: 23, width: 22, height: 58, unit: 'percent' } }),
      releaseZone: createHitZone('releaseZone', { targetBehavior: 'releaseDrag', targetValueChannel: 'release', bounds: { x: 67, y: 23, width: 25, height: 58, unit: 'percent' } }),
    },
    generators: { envelopeGrid: { _type: 'Generator', name: 'envelopeGrid', type: 'grid', enabled: true, rows: 4, columns: 8, colour: '163D5363', generatedPartPrefix: 'envGrid', bounds: { x: 6, y: 20, width: 88, height: 60 } } },
    bindings: {
      attackText: formatBinding('attackText', 'channel.attack.normalized', 'Parts.attackValue.Text.content', { multiplier: 100, precision: 0, prefix: 'A ', suffix: '%' }),
      decayText: formatBinding('decayText', 'channel.decay.normalized', 'Parts.decayValue.Text.content', { multiplier: 100, precision: 0, prefix: 'D ', suffix: '%' }),
      sustainText: formatBinding('sustainText', 'channel.sustain.normalized', 'Parts.sustainValue.Text.content', { multiplier: 100, precision: 0, prefix: 'S ', suffix: '%' }),
      releaseText: formatBinding('releaseText', 'channel.release.normalized', 'Parts.releaseValue.Text.content', { multiplier: 100, precision: 0, prefix: 'R ', suffix: '%' }),
      envelopeAttackX: binding('envelopeAttackX', 'channel.attack.normalized', 'Parts.envelopeCurve.meta.envelopePath.points.1.x', { outputMin: attackX.min, outputMax: attackX.max }),
      envelopeDecayX: binding('envelopeDecayX', 'channel.decay.normalized', 'Parts.envelopeCurve.meta.envelopePath.points.2.x', { outputMin: decayX.min, outputMax: decayX.max }),
      envelopeDecayY: binding('envelopeDecayY', 'channel.sustain.normalized', 'Parts.envelopeCurve.meta.envelopePath.points.2.y', { outputMin: 0, outputMax: 1 }),
      envelopeSustainY: binding('envelopeSustainY', 'channel.sustain.normalized', 'Parts.envelopeCurve.meta.envelopePath.points.3.y', { outputMin: 0, outputMax: 1 }),
      envelopeReleaseStartX: binding('envelopeReleaseStartX', 'channel.release.normalized', 'Parts.envelopeCurve.meta.envelopePath.points.3.x', { outputMin: releaseStartX.min, outputMax: releaseStartX.max }),
      attackDotX: binding('attackDotX', 'channel.attack.normalized', 'Parts.aDot.Layout.x', { outputMin: handleX(attackX.min), outputMax: handleX(attackX.max), outputUnit: 'px' }),
      decayDotX: binding('decayDotX', 'channel.decay.normalized', 'Parts.dDot.Layout.x', { outputMin: handleX(decayX.min), outputMax: handleX(decayX.max), outputUnit: 'px' }),
      decayDotY: binding('decayDotY', 'channel.sustain.normalized', 'Parts.dDot.Layout.y', { outputMin: handleY(0), outputMax: handleY(1), outputUnit: 'px' }),
      sustainDotY: binding('sustainDotY', 'channel.sustain.normalized', 'Parts.sDot.Layout.y', { outputMin: handleY(0), outputMax: handleY(1), outputUnit: 'px' }),
      releaseDotX: binding('releaseDotX', 'channel.release.normalized', 'Parts.rDot.Layout.x', { outputMin: handleX(releaseStartX.min), outputMax: handleX(releaseStartX.max), outputUnit: 'px' }),
      releaseDotY: binding('releaseDotY', 'channel.sustain.normalized', 'Parts.rDot.Layout.y', { outputMin: handleY(0), outputMax: handleY(1), outputUnit: 'px' }),
    },
  });
}

function waveformSelectorComponent() {
  const channels = { waveform: createValueChannel('waveform', { label: 'Waveform', type: 'enum', min: 0, max: 3, step: 1, defaultValue: 'saw' }) };
  channels.waveform.values = ['sine', 'saw', 'square', 'noise'];
  const buttonY = 34;
  const iconY = 41;
  const labelY = 68;
  return makeComponent({
    slug: 'waveform-selector',
    name: 'Waveform Selector',
    description: 'Segmented waveform selector with four hit zones and state feedback.',
    width: 276,
    height: 108,
    parts: {
      ...shell('OSC WAVE', 'FF111519', '334D5B66'),
      sine: rect('sine', { x: 18, y: buttonY, width: 54, height: 52 }, 'FF1D2730', { role: 'button', zIndex: 8, radius: 5, borderColour: '55657986' }),
      saw: rect('saw', { x: 82, y: buttonY, width: 54, height: 52 }, 'FF1D2730', { role: 'button', zIndex: 8, radius: 5, borderColour: '55657986' }),
      square: rect('square', { x: 146, y: buttonY, width: 54, height: 52 }, 'FF1D2730', { role: 'button', zIndex: 8, radius: 5, borderColour: '55657986' }),
      noise: rect('noise', { x: 210, y: buttonY, width: 54, height: 52 }, 'FF1D2730', { role: 'button', zIndex: 8, radius: 5, borderColour: '55657986' }),
      sineIcon: waveformIconPart('sineIcon', 'sine', { x: 29, y: iconY, width: 32, height: 19 }, { stroke: 'FFEAF0F6' }),
      sawIcon: waveformIconPart('sawIcon', 'saw', { x: 93, y: iconY, width: 32, height: 19 }, { stroke: 'FFEAF0F6' }),
      squareIcon: waveformIconPart('squareIcon', 'square', { x: 157, y: iconY, width: 32, height: 19 }, { stroke: 'FFEAF0F6' }),
      noiseIcon: waveformIconPart('noiseIcon', 'noise', { x: 221, y: iconY, width: 32, height: 19 }, { stroke: 'FFEAF0F6', strokeWidth: 2 }),
      sineLabel: text('sineLabel', 'SINE', { x: 18, y: labelY, width: 54, height: 12 }, { size: 7, colour: 'FFBFD0DA' }),
      sawLabel: text('sawLabel', 'SAW', { x: 82, y: labelY, width: 54, height: 12 }, { size: 7, colour: 'FFBFD0DA' }),
      squareLabel: text('squareLabel', 'SQR', { x: 146, y: labelY, width: 54, height: 12 }, { size: 7, colour: 'FFBFD0DA' }),
      noiseLabel: text('noiseLabel', 'NOISE', { x: 210, y: labelY, width: 54, height: 12 }, { size: 7, colour: 'FFBFD0DA' }),
    },
    channels,
    behaviors: { waveSelect: createBehaviorModule('waveSelect', { type: 'cycle', role: 'segmentedControl', valueChannel: 'waveform', geometry: 'none' }) },
    hitZones: {
      sineZone: createHitZone('sineZone', { targetBehavior: 'waveSelect', targetValueChannel: 'waveform', action: 'setValue', payload: { value: 'sine' }, bounds: { x: 6.5, y: 31.5, width: 19.6, height: 48.5, unit: 'percent' } }),
      sawZone: createHitZone('sawZone', { targetBehavior: 'waveSelect', targetValueChannel: 'waveform', action: 'setValue', payload: { value: 'saw' }, bounds: { x: 29.7, y: 31.5, width: 19.6, height: 48.5, unit: 'percent' } }),
      squareZone: createHitZone('squareZone', { targetBehavior: 'waveSelect', targetValueChannel: 'waveform', action: 'setValue', payload: { value: 'square' }, bounds: { x: 52.9, y: 31.5, width: 19.6, height: 48.5, unit: 'percent' } }),
      noiseZone: createHitZone('noiseZone', { targetBehavior: 'waveSelect', targetValueChannel: 'waveform', action: 'setValue', payload: { value: 'noise' }, bounds: { x: 76.1, y: 31.5, width: 19.6, height: 48.5, unit: 'percent' } }),
    },
    stateOverrides: {
      Sine: { _type: 'State', name: 'Sine', group: 'value', enabled: true, when: { valueEnum: 'sine' }, patches: { component: {}, parts: { sine: { 'Background.Fill.colour': 'FF584C76', 'Background.Border.colour': 'CCCFB7FF' } } } },
      Saw: { _type: 'State', name: 'Saw', group: 'value', enabled: true, when: { valueEnum: 'saw' }, patches: { component: {}, parts: { saw: { 'Background.Fill.colour': 'FF3A5A35', 'Background.Border.colour': 'CC8EFFA5' } } } },
      Square: { _type: 'State', name: 'Square', group: 'value', enabled: true, when: { valueEnum: 'square' }, patches: { component: {}, parts: { square: { 'Background.Fill.colour': 'FF3B536E', 'Background.Border.colour': 'CC9ECFFF' } } } },
      Noise: { _type: 'State', name: 'Noise', group: 'value', enabled: true, when: { valueEnum: 'noise' }, patches: { component: {}, parts: { noise: { 'Background.Fill.colour': 'FF6A4A42', 'Background.Border.colour': 'FFFFB197' } } } },
      HoverSine: { _type: 'State', name: 'HoverSine', group: 'interaction', enabled: true, when: { hoveredCustomHitZone: 'sineZone' }, patches: { component: {}, parts: { sineIcon: { 'meta.waveformIcon.animate': true }, sine: { 'Background.Border.colour': 'FFEAF0F6' } } } },
      HoverSaw: { _type: 'State', name: 'HoverSaw', group: 'interaction', enabled: true, when: { hoveredCustomHitZone: 'sawZone' }, patches: { component: {}, parts: { sawIcon: { 'meta.waveformIcon.animate': true }, saw: { 'Background.Border.colour': 'FFEAF0F6' } } } },
      HoverSquare: { _type: 'State', name: 'HoverSquare', group: 'interaction', enabled: true, when: { hoveredCustomHitZone: 'squareZone' }, patches: { component: {}, parts: { squareIcon: { 'meta.waveformIcon.animate': true }, square: { 'Background.Border.colour': 'FFEAF0F6' } } } },
      HoverNoise: { _type: 'State', name: 'HoverNoise', group: 'interaction', enabled: true, when: { hoveredCustomHitZone: 'noiseZone' }, patches: { component: {}, parts: { noiseIcon: { 'meta.waveformIcon.animate': true }, noise: { 'Background.Border.colour': 'FFEAF0F6' } } } },
    },
  });
}

function keyboardComponent() {
  const channels = { note: createValueChannel('note', { label: 'Note', type: 'int', min: 48, max: 72, step: 1, defaultValue: 60 }) };
  return makeComponent({
    slug: 'mini-keyboard',
    name: 'Mini Keyboard',
    description: 'Two-octave mini keyboard using generated piano keys and generated key hit zones.',
    width: 300,
    height: 110,
    parts: {
      ...shell('KEYS', 'FF111519', '334D5D68'),
      keybed: rect('keybed', { x: 16, y: 31, width: 268, height: 64 }, 'FF090D11', { zIndex: 2, radius: 4, borderColour: '44596B78' }),
    },
    channels,
    behaviors: { keySet: createBehaviorModule('keySet', { type: 'selector', role: 'keyboard', valueChannel: 'note', geometry: 'keyboard' }) },
    hitZones: {},
    generators: { keys: { _type: 'Generator', name: 'keys', type: 'piano-keys', enabled: true, count: 25, baseNote: 48, zIndex: 8, generatedPartPrefix: 'miniKey', generatedHitZones: true, targetBehavior: 'keySet', targetValueChannel: 'note' } },
    tags: ['keyboard', 'generated'],
  });
}

function modMatrixComponent() {
  const channels = { slot: createValueChannel('slot', { label: 'Slot', type: 'int', min: 0, max: 15, step: 1, defaultValue: 5 }) };
  return makeComponent({
    slug: 'mod-matrix',
    name: 'Mod Matrix',
    description: 'Compact 4x4 modulation matrix using generated grid cells and one value channel.',
    width: 190,
    height: 190,
    parts: {
      ...shell('MOD MATRIX', 'FF10151A', '334E6272'),
      field: rect('field', { x: 22, y: 34, width: 146, height: 136 }, 'FF0B1015', { zIndex: 2, radius: 4, borderColour: '445E7280' }),
      activeCell: rect('activeCell', { x: 96, y: 91, width: 28, height: 28 }, '885B9BD5', { zIndex: 16, radius: 3, borderColour: 'CCBBDFFF' }),
    },
    channels,
    behaviors: { matrixSet: createBehaviorModule('matrixSet', { type: 'selector', role: 'matrix', valueChannel: 'slot', geometry: 'grid' }) },
    hitZones: { matrixZone: createHitZone('matrixZone', { targetBehavior: 'matrixSet', targetValueChannel: 'slot', action: 'setValue', bounds: { x: 12, y: 18, width: 76, height: 70, unit: 'percent' } }) },
    generators: { matrixGrid: { _type: 'Generator', name: 'matrixGrid', type: 'grid', enabled: true, rows: 4, columns: 4, colour: '305D7788', generatedPartPrefix: 'matrixCell', generatedHitZones: true, targetBehavior: 'matrixSet', targetValueChannel: 'slot' } },
  });
}

export function createCustomComponentStressTest() {
  const definitions = [
    dialComponent(),
    macroRingsComponent(),
    horizontalScaleComponent(),
    verticalScaleComponent(),
    meterComponent(),
    ledLadderComponent(),
    xyPadComponent(),
    labelledButtonComponent(),
    transportComponent(),
    arpeggiatorComponent(),
    envelopeComponent(),
    waveformSelectorComponent(),
    keyboardComponent(),
    modMatrixComponent(),
  ].slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    definitions,
    notes: CUSTOM_COMPONENT_STRESS_NOTES,
  };
}

export function createCustomComponentStressPanel(entries = []) {
  const panel = createPanel('Custom Component Stress Rig');
  panel.width = 1500;
  panel.height = 980;
  panel.bgColour = 'FF202427';
  panel.gridEnabled = true;
  panel.gridSize = 20;
  panel.description = 'Stress panel generated from 12 saved custom component packages.';
  panel.notepad = {
    activeNoteIndex: 0,
    notes: [
      {
        name: 'Stress Notes',
        content: CUSTOM_COMPONENT_STRESS_NOTES,
      },
    ],
  };

  const placements = [
    [30, 35, 164, 164],
    [230, 35, 178, 178],
    [450, 45, 260, 90],
    [750, 45, 230, 108],
    [1020, 45, 260, 84],
    [1210, 25, 96, 246],
    [30, 260, 210, 190],
    [280, 285, 168, 106],
    [500, 290, 230, 86],
    [760, 330, 720, 300],
    [30, 520, 280, 150],
    [350, 540, 260, 100],
  ];

  panel.controls = entries.slice(0, 12).map((entry, index) => {
    const [x, y, width, height] = placements[index];
    const control = instantiateCustomComponentPackageControl(entry.envelope ?? entry, {
      id: `stress_instance_${index + 1}`,
      name: entry.name ?? entry.metadata?.name ?? `Stress Component ${index + 1}`,
      Transform: { x, y, width, height },
    });
    if (control?._children?.Transform) {
      control._children.Transform.x = x;
      control._children.Transform.y = y;
      control._children.Transform.width = width;
      control._children.Transform.height = height;
    }
    return control ?? clone(entry.component);
  }).filter(Boolean);

  return panel;
}

export const CUSTOM_COMPONENT_STRESS_NOTES = `Custom Component Designer stress notes

Generated 12 saved custom components and loaded package instances into one panel:
1. Neon Dial - circular arc/tick dial with pointer binding.
2. Triple Macro Rings - three independent circular channels and hit zones.
3. Fine Horizontal Scale - horizontal line, generated ticks, fill and thumb bindings.
4. Bipolar Vertical Scale - vertical ticks and reverse-direction slider behavior.
5. Segment Meter - repeated LED generator with generated segment hit zones.
6. Vertical LED Ladder - vertical single-active LED selector.
7. XY Pad - two-channel pad with generated grid and cursor bindings.
8. Label Above Button - bordered label plus two-state button inside one outlined shell.
9. Transport Cluster - multi-button enum component with mode states.
10. Arpeggiator Sequencer - generated runtime step editor with note blocks.
11. ADSR Envelope - multi-channel envelope display with draggable phase zones.
12. Waveform Selector - segmented enum selector with individual hit zones.

What looks strong:
- The same component package model can represent circular, horizontal, vertical, grid, button, meter, keyboard, and arpeggiator patterns.
- Generators are powerful: ticks, LEDs, grids, piano keys, and arpeggiator parts reduce manual layer work dramatically.
- ValueChannels, Behaviors, HitZones, States, Bindings, and PublishedProperties are enough to describe reusable working controls, not only static drawings.
- The package/library path can save reusable controls and instantiate them into a normal panel.

GUI/UX improvements that became obvious:
- The designer needs a first-class component test bench where a user can drag/click the component and see live ValueChannel changes without leaving the designer.
- Smart kits should stay selectable/resizable as one object, with an obvious Expand/Edit Internals action.
- Generator controls need friendlier editors: tick count, minor ticks, label sets, geometry, radius, start/end angle, LED mode, grid rows/columns, and previewed hit zones should not feel like raw data.
- State authoring needs a visual state matrix: pick state, see changed parts highlighted, and preview state combinations.
- Hit zones need clearer feedback and deletion affordances; generated hit zones should be folded under their kit/generator by default.
- Import vs create language still matters: the panel toolbar should insert saved packages, while the standalone designer should create/edit packages.
- Saving should show an explicit library result: package name, validation status, thumbnail, and where it can be inserted from.
- Components need resize policies: stretch, fixed aspect, scale internals, pin labels, and min/max size should be visible in the inspector.
- Bindings need a friendlier mapping editor with source, target, curve, clamp, and live sample value rather than path strings.
- The arpeggiator is powerful but needs a clearer mode switch between drawing notes, moving notes, resizing notes, and selecting notes.
- Preview mode should distinguish visual preview from runtime simulation, because users expect the latter when they see a Preview button.
- Large generated components need layer-tree grouping/collapse to avoid layer noise.
- There should be package validation warnings directly in the designer before save/export.
`;
