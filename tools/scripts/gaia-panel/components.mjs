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

/** A filled rectangle part. `radius: 0` is what keeps a fader cap square. */
function rect(name, { x, y, width, height }, colour, {
  zIndex = 0, radius = 0, borderColour = '00000000', borderThickness = 0, opacity = 1,
} = {}) {
  const background = clone(SECTION_DEFAULTS.Background);
  background._children.Fill.colour = colour;
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

/** Assemble a CustomComponent control from parts + one value channel. */
function component({ name, width, height, parts, bindings, behavior, hitZone }) {
  const control = createControl('CustomComponent', {
    name,
    Core: { name },
    Transform: { width, height },
  });

  control._children.Parts = { _type: 'Parts', _children: parts };
  control._children.ValueChannels = {
    _type: 'ValueChannels',
    _children: {
      value: createValueChannel('value', { label: 'Value', min: 0, max: 1, step: 0.001, defaultValue: 0 }),
    },
  };
  control._children.Behaviors = { _type: 'Behaviors', _children: { drive: behavior } };
  control._children.HitZones = { _type: 'HitZones', _children: { grab: hitZone } };
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
export function gaiaKnob({ size = 54 } = {}) {
  const r = size / 2;
  return component({
    name: 'GAIA Knob',
    width: size,
    height: size,
    parts: {
      body: rect('body', { x: 3, y: 3, width: size - 6, height: size - 6 }, 'FF1B2126', { zIndex: 1, radius: 999, borderColour: 'FF454F58', borderThickness: 2 }),
      cap: rect('cap', { x: 8, y: 8, width: size - 16, height: size - 16 }, 'FF2A3238', { zIndex: 2, radius: 999, borderColour: '3300000', borderThickness: 1 }),
      pointer: rect('pointer', { x: r - 1.5, y: 6, width: 3, height: r - 6 }, 'FFF2F6F9', { zIndex: 6, radius: 2 }),
    },
    behavior: createBehaviorModule('drive', { valueChannel: 'value', geometry: 'circular', role: 'knob', dragMode: 'vertical' }),
    hitZone: createHitZone('grab', { targetBehavior: 'drive', targetValueChannel: 'value', action: 'setValue', bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' } }),
    bindings: {
      // -135deg at minimum to +135deg at maximum: the 270-degree sweep the instrument uses.
      pointerAngle: binding('pointerAngle', 'channel.value.normalized', 'Parts.pointer.Layout.rotation', { outputMin: -135, outputMax: 135, round: true }),
    },
  });
}
