// components.mjs — GAIA-shaped controls, built as custom components.
//
// The built-in Slider draws its thumb as `{ kind: 'circle', r: size / 2 }` — a hardcoded circle,
// in SliderFamilyRenderer. No amount of part styling makes it a flat fader cap, and a flat cap is
// most of what makes a bank of four faders read as an envelope rather than as a row of dials.
//
// A custom component has no such ceiling: it is its own parts, its own value channels, its own
// bindings from a channel to a part's geometry. So the fader here IS a slot with a rectangular cap
// that slides, because that is what was drawn — not because a renderer was persuaded to allow it.
//
// Two components, both bipolar-capable and both bound the same way a native control is:
//
//   gaiaFader   a vertical slot, a wide flat cap, and a fill that grows from the bottom
//   gaiaKnob    a dark cylinder with a pointer that rotates through the hardware's 270 degrees
//
// Each publishes one `value` channel, which is what the panel binds a device parameter to.

import {
  createBehaviorModule, createCustomComponentBlankBindingsDefaults,
  createCustomComponentDesignerDefaults, createCustomComponentLinksDefaults,
  createHitZone, createPartNode, createValueChannel,
} from '../../../CE/web/src/CE_Application/utils/customComponentFactory.js';
import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { SECTION_DEFAULTS } from '../../../CE/web/src/CE_Application/models/sectionDefaults.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * A linear gradient, at an angle, from a list of `[position, colour]` pairs.
 *
 * Stops carry a six-digit colour with no alpha — gradientToCSS builds the CSS from `color` and
 * `position` only, so transparency has to come from the part's opacity rather than from a stop.
 */
function linear(angle, stops) {
  return {
    type: 'linear',
    angle,
    centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, edge: 0,
    stops: stops.map(([position, color]) => ({ color, position })),
  };
}

/** A radial gradient centred where the light falls, for a domed face. */
function radial(centerX, centerY, stops, { radiusX = 60, radiusY = 60 } = {}) {
  return {
    type: 'radial',
    angle: 0,
    centerX, centerY, radiusX, radiusY, edge: 0,
    stops: stops.map(([position, color]) => ({ color, position })),
  };
}

/** A filled rectangle part. `radius: 0` is what keeps a fader cap square. */
function rect(name, { x, y, width, height }, colour, {
  zIndex = 0, radius = 0, borderColour = '00000000', borderThickness = 0, opacity = 1, gradient = null,
} = {}) {
  const background = clone(SECTION_DEFAULTS.Background);
  background._children.Fill.colour = colour;
  if (gradient) {
    background._children.Fill.gradientEnabled = true;
    background._children.Fill.gradient = gradient;
    background._children.Fill.gradientOpacity = 100;
  }
  background._children.Border.enabled = borderThickness > 0;
  background._children.Border.colour = borderColour;
  background._children.Border.thickness = borderThickness;
  background._children.Corners.radius = radius;

  return createPartNode(name, {
    role: 'custom',
    zIndex,
    opacity,
    layout: { x, y, width, height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
    sections: { Background: background },
  });
}

function binding(name, source, target, { outputMin = 0, outputMax = 1, round = false } = {}) {
  return {
    _type: 'Binding',
    name,
    enabled: true,
    source,
    mapMode: 'range',
    target,
    outputUnit: 'px',
    inputMin: 0,
    inputMax: 1,
    outputMin,
    outputMax,
    falseValue: outputMin,
    trueValue: outputMax,
    enumMap: {},
    clamp: true,
    round,
    invert: false,
  };
}

/** A text part, for the option names beside an LED. */
function text(name, content, { x, y, width, height }, { size = 9, colour = 'FFC3CDD6', align = 'left' } = {}) {
  const section = clone(SECTION_DEFAULTS.Text);
  section.content = content;
  section._children.Fill.colour = colour;
  section._children.Font.size = size;
  section._children.Font.family = 'Arial';
  section._children.Font.weightValue = 600;
  section._children.Font.weight = 'SemiBold';
  section._children.Position.justification = align === 'left' ? 'centredLeft' : 'centred';

  return createPartNode(name, {
    role: 'custom',
    zIndex: 8,
    layout: { x, y, width, height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top' },
    sections: { Text: section },
  });
}

/** A binding that picks its output from a table keyed by the source value. */
function enumBinding(name, source, target, enumMap) {
  return {
    _type: 'Binding',
    name,
    enabled: true,
    source,
    mapMode: 'enum',
    target,
    outputUnit: '',
    inputMin: 0,
    inputMax: 1,
    outputMin: 0,
    outputMax: 1,
    falseValue: 0,
    trueValue: 1,
    enumMap,
    clamp: false,
    round: false,
    invert: false,
  };
}

/** Assemble a CustomComponent control from parts + one value channel. */
function component({ name, width, height, parts, bindings, behavior, hitZone, hitZones, channel }) {
  const control = createControl('CustomComponent', {
    name,
    Core: { name },
    Transform: { width, height },
  });

  control._children.Parts = { _type: 'Parts', _children: parts };
  control._children.ValueChannels = {
    _type: 'ValueChannels',
    _children: {
      value: channel ?? createValueChannel('value', { label: 'Value', min: 0, max: 1, step: 0.001, defaultValue: 0 }),
    },
  };
  control._children.Behaviors = { _type: 'Behaviors', _children: { drive: behavior } };
  control._children.HitZones = { _type: 'HitZones', _children: hitZones ?? { grab: hitZone } };
  control._children.Bindings = { ...createCustomComponentBlankBindingsDefaults(), _children: bindings };
  control._children.Designer = createCustomComponentDesignerDefaults();
  control._children.Links = createCustomComponentLinksDefaults();
  control._children.PublishedProperties = {
    _type: 'PublishedProperties',
    inputs: { value: { channel: 'value', label: 'Value', type: 'float' } },
    outputs: { value: { channel: 'value', label: 'Value', type: 'float' } },
    editableProperties: {},
  };

  return control;
}

const SLOT = 'FF0C0F11';
const FILL = 'FF3D4C57';
const CAP = 'FFE7ECF0';
const CAP_LINE = 'FF11151800';

/**
 * A vertical fader: slot, fill, and a wide flat cap.
 *
 * The cap travels by binding the value channel to its Layout.y. Top of travel is a small y and
 * bottom is a large one, so the range is written high-to-low — a fader at zero sits at the bottom.
 */
export function gaiaFader({ width = 30, height = 108 } = {}) {
  const slotX = Math.round(width / 2) - 4;
  const capH = 13;
  const travelTop = 2;
  const travelBottom = height - capH - 2;

  return component({
    name: 'GAIA Fader',
    width,
    height,
    parts: {
      slot: rect('slot', { x: slotX, y: 4, width: 8, height: height - 8 }, SLOT, { zIndex: 1, radius: 4, borderColour: '66000000', borderThickness: 1 }),
      fill: rect('fill', { x: slotX + 1, y: height - 8, width: 6, height: 4 }, FILL, { zIndex: 2, radius: 3 }),
      cap: rect('cap', { x: 2, y: travelBottom, width: width - 4, height: capH }, CAP, { zIndex: 6, radius: 2, borderColour: CAP_LINE, borderThickness: 1 }),
      capLine: rect('capLine', { x: 5, y: travelBottom + 6, width: width - 10, height: 1 }, '55000000', { zIndex: 7 }),
    },
    behavior: createBehaviorModule('drive', { valueChannel: 'value', geometry: 'linear', role: 'slider', dragMode: 'vertical' }),
    hitZone: createHitZone('grab', { targetBehavior: 'drive', targetValueChannel: 'value', action: 'setValue', bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' } }),
    bindings: {
      capY: binding('capY', 'channel.value.normalized', 'Parts.cap.Layout.y', { outputMin: travelBottom, outputMax: travelTop, round: true }),
      capLineY: binding('capLineY', 'channel.value.normalized', 'Parts.capLine.Layout.y', { outputMin: travelBottom + 6, outputMax: travelTop + 6, round: true }),
      fillY: binding('fillY', 'channel.value.normalized', 'Parts.fill.Layout.y', { outputMin: height - 8, outputMax: travelTop + 6, round: true }),
      fillH: binding('fillH', 'channel.value.normalized', 'Parts.fill.Layout.height', { outputMin: 4, outputMax: height - 14, round: true }),
    },
  });
}

/**
 * A knob: dark cylinder, a rim, and a pointer that rotates.
 *
 * The hardware's knobs sweep about 270 degrees, from roughly seven o'clock to five. The pointer is
 * a part whose Layout.rotation is bound to the channel, which is the whole reason this is a custom
 * component and not a styled Knob — rotation of an arbitrary part is not something the built-in
 * one exposes.
 */
export function gaiaKnob({ size = 54, ticks = 11 } = {}) {
  const r = size / 2;

  // The ring of tick marks printed around every knob on the instrument. Placed here rather than
  // left to a generator because their whole job is to sit on an arc at fixed angles, and thirteen
  // lines of trigonometry is less machinery than a generator that has to be told the same thing.
  const tickParts = {};
  const sweep = 270;
  for (let i = 0; i < ticks; i++) {
    const deg = -135 + (sweep * i) / (ticks - 1);
    const rad = (deg - 90) * (Math.PI / 180);
    // Outside the rim, not under it. The shaded rim grew to r-8, and ticks drawn at the old r-2
    // vanished beneath it — the ring was there in the document and invisible on screen.
    const ringR = r - 1;
    const major = i === 0 || i === ticks - 1 || i === (ticks - 1) / 2;
    const len = major ? 5 : 3;
    tickParts[`tick${i}`] = rect(
      `tick${i}`,
      {
        x: r + Math.cos(rad) * (ringR - len / 2) - 1,
        y: r + Math.sin(rad) * (ringR - len / 2) - len / 2,
        width: major ? 2 : 1.5,
        height: len,
      },
      major ? 'FFB9C4CD' : 'FF6C7883',
      { zIndex: 0, radius: 1 },
    );
  }

  return component({
    name: 'GAIA Knob',
    width: size,
    height: size,
    parts: {
      ...tickParts,
      // A dark cylinder with a lighter rim and a lit chamfer, which is what gives the hardware's
      // knobs their depth. Three stacked circles do it; a gradient would do it better.
      // Five stacked circles, lit from above, which is how a photographed knob actually reads:
      //   drop     the shadow it casts on the panel
      //   rim      the metal collar — light at the top edge, dark at the bottom
      //   face     the cap itself, domed by a radial that puts its highlight up and left
      //   gloss    a soft specular smear across the top third
      //   pointer  the printed indicator line
      // Flat colours got the shapes right and left every knob looking like a sticker.
      drop: rect('drop', { x: 9, y: 11, width: size - 18, height: size - 18 }, 'FF05080A', { zIndex: 0, radius: 999, opacity: 0.55 }),
      rim: rect('rim', { x: 8, y: 8, width: size - 16, height: size - 16 }, 'FF464F58', {
        zIndex: 1, radius: 999,
        gradient: linear(180, [[0, '8A949E'], [45, '3C444C'], [100, '171B1F']]),
      }),
      face: rect('face', { x: 11, y: 11, width: size - 22, height: size - 22 }, 'FF262E35', {
        zIndex: 2, radius: 999,
        gradient: radial(34, 28, [[0, '48535D'], [55, '2A323A'], [100, '141A1E']], { radiusX: 72, radiusY: 72 }),
      }),
      gloss: rect('gloss', { x: 16, y: 14, width: size - 32, height: (size - 32) * 0.46 }, 'FFFFFFFF', {
        zIndex: 3, radius: 999, opacity: 0.13,
        gradient: linear(180, [[0, 'FFFFFF'], [100, '9AA6B0']]),
      }),
      pointer: rect('pointer', { x: r - 2, y: 12, width: 4, height: r - 15 }, 'FFF6FAFD', { zIndex: 6, radius: 2 }),
    },
    behavior: createBehaviorModule('drive', { valueChannel: 'value', geometry: 'circular', role: 'knob', dragMode: 'vertical' }),
    hitZone: createHitZone('grab', { targetBehavior: 'drive', targetValueChannel: 'value', action: 'setValue', bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' } }),
    bindings: {
      // -135deg at minimum to +135deg at maximum: the 270-degree sweep the instrument uses.
      pointerAngle: binding('pointerAngle', 'channel.value.normalized', 'Parts.pointer.Layout.rotation', { outputMin: -135, outputMax: 135, round: true }),
    },
  });
}

const LED_ON = 'FFFF3B30';
const LED_OFF = 'FF3A1E1C';
const LED_RIM = 'FF120A0A';

/**
 * An LED column: one lamp per option, and only the selected one is lit.
 *
 * This is the control the instrument uses wherever a parameter has a handful of named settings —
 * WAVE, FILTER MODE, LFO SHAPE, MOD. Every option is printed and visible at once with a lamp beside
 * it, which is why a dropdown reads so wrong in its place: on the hardware you can see what is
 * selected AND what else there is, without touching anything.
 *
 * It is a different SHAPE of binding from the fader and the knob, which is the reason it needed its
 * own component rather than a variant of theirs. Those map a continuous 0..1 onto a position or an
 * angle. This one maps a selected INDEX onto which lamp is lit, which the binding layer expresses
 * as `mapMode: 'enum'` — a table keyed by the source value. One binding per lamp, each with a table
 * that names its own index the lit colour and every other index the dark one.
 */
export function gaiaLeds({ options, width = 96, rowHeight = 15 } = {}) {
  const count = options.length;
  const height = count * rowHeight + 8;
  const parts = {};
  const bindings = {};
  const hitZones = {};

  parts.plate = rect('plate', { x: 0, y: 0, width, height }, 'FF171C20', {
    zIndex: 0, radius: 4, borderColour: '55000000', borderThickness: 1,
  });

  options.forEach((option, index) => {
    const y = 4 + index * rowHeight;

    // The lamp: a dark bezel with the lamp face inside it, so an unlit LED still reads as a lamp
    // rather than as an empty circle.
    parts[`bezel${index}`] = rect(`bezel${index}`, { x: 7, y: y + 3, width: 9, height: 9 }, LED_RIM, { zIndex: 2, radius: 999 });
    parts[`led${index}`] = rect(`led${index}`, { x: 8.5, y: y + 4.5, width: 6, height: 6 }, LED_OFF, { zIndex: 3, radius: 999 });
    parts[`name${index}`] = text(`name${index}`, option.label, { x: 22, y: y + 1, width: width - 26, height: rowHeight - 2 }, { size: 9 });

    // The table that lights exactly one lamp. Written per lamp rather than per value because the
    // binding layer resolves one target at a time.
    const litMap = {};
    const textMap = {};
    options.forEach((other, otherIndex) => {
      litMap[String(other.value)] = otherIndex === index ? LED_ON : LED_OFF;
      textMap[String(other.value)] = otherIndex === index ? 'FFFFFFFF' : 'FF8A959E';
    });

    bindings[`led${index}`] = enumBinding(`led${index}`, 'channel.value.raw', `Parts.led${index}.Background.Fill.colour`, litMap);
    bindings[`name${index}`] = enumBinding(`name${index}`, 'channel.value.raw', `Parts.name${index}.Text.Fill.colour`, textMap);

    hitZones[`pick${index}`] = createHitZone(`pick${index}`, {
      targetBehavior: 'drive',
      targetValueChannel: 'value',
      action: 'setValue',
      payload: option.value,
      bounds: { x: 0, y: (y / height) * 100, width: 100, height: (rowHeight / height) * 100, unit: 'percent' },
    });
  });

  const values = options.map((option) => Number(option.value));
  return component({
    name: 'GAIA LED Column',
    width,
    height,
    parts,
    channel: createValueChannel('value', {
      label: 'Value',
      type: 'int',
      min: Math.min(...values),
      max: Math.max(...values),
      step: 1,
      defaultValue: values[0],
    }),
    behavior: createBehaviorModule('drive', { type: 'selector', valueChannel: 'value', geometry: 'vertical', role: 'selector' }),
    hitZones,
    bindings,
  });
}
