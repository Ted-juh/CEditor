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
  createArpPatternChannel, createBehaviorModule, createCustomComponentBlankBindingsDefaults,
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
  pivotX = null, pivotY = null,
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
    layout: {
      x, y, width, height,
      xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px',
      anchorX: 'left', anchorY: 'top',
      // transform-origin defaults to the part's own centre (50% 50%). Anything that rotates about
      // a point other than its own middle — a knob pointer, which must swing about the KNOB's
      // centre — has to say so, or it pivots around itself and both the direction and the angle
      // come out wrong.
      ...(pivotX === null ? {} : { pivotX }),
      ...(pivotY === null ? {} : { pivotY }),
    },
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
function component({
  name, width, height, parts, bindings, behavior, hitZone, hitZones, channel, channels,
  designer = null, published = null,
}) {
  const control = createControl('CustomComponent', {
    name,
    Core: { name },
    Transform: { width, height },
  });

  control._children.Parts = { _type: 'Parts', _children: parts };
  control._children.ValueChannels = {
    _type: 'ValueChannels',
    _children: channels ?? {
      value: channel ?? createValueChannel('value', { label: 'Value', min: 0, max: 1, step: 0.001, defaultValue: 0 }),
    },
  };
  control._children.Behaviors = { _type: 'Behaviors', _children: behavior ? { drive: behavior } : {} };
  control._children.HitZones = { _type: 'HitZones', _children: hitZones ?? (hitZone ? { grab: hitZone } : {}) };
  control._children.Bindings = { ...createCustomComponentBlankBindingsDefaults(), _children: bindings ?? {} };
  control._children.Designer = { ...createCustomComponentDesignerDefaults(), ...(designer ?? {}) };
  control._children.Links = createCustomComponentLinksDefaults();
  control._children.PublishedProperties = published ?? {
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
export function gaiaFader({ width = 30, height = 108, ticks = 11 } = {}) {
  const slotX = Math.round(width / 2) - 4;
  const capH = 13;
  const travelTop = 2;
  const travelBottom = height - capH - 2;

  // The printed scale beside the slot. Every fader on the instrument has one, and without it a
  // fader is a slot with a cap in it — the stripes are what say how far it has travelled.
  // Longer at the ends and the middle, the way a printed scale marks its thirds.
  const scale = {};
  for (let i = 0; i < ticks; i++) {
    const major = i === 0 || i === ticks - 1 || i === (ticks - 1) / 2;
    const y = travelTop + capH / 2 + ((travelBottom - travelTop) * i) / (ticks - 1);
    scale[`tick${i}`] = rect(`tick${i}`, {
      x: slotX - (major ? 7 : 5),
      y: Math.round(y * 10) / 10,
      width: major ? 5 : 3,
      height: 1,
    }, major ? 'FF9AA6B0' : 'FF5C666F', { zIndex: 0 });
    scale[`tickR${i}`] = rect(`tickR${i}`, {
      x: slotX + 8 + 2,
      y: Math.round(y * 10) / 10,
      width: major ? 5 : 3,
      height: 1,
    }, major ? 'FF9AA6B0' : 'FF5C666F', { zIndex: 0 });
  }

  return component({
    name: 'GAIA Fader',
    width,
    height,
    parts: {
      ...scale,
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
      // The pointer sits in the top half of the knob and must swing about the knob's CENTRE, which
      // is below its own box. pivotY is therefore over 100% — the centre expressed as a percentage
      // of the pointer's height. Without it the bar rotated about its own midpoint: at minimum it
      // pointed up-and-left instead of down-and-left, and every angle in between was wrong too.
      pointer: rect('pointer', { x: r - 2, y: 12, width: 4, height: r - 15 }, 'FFF6FAFD', {
        zIndex: 6, radius: 2,
        pivotX: 50,
        pivotY: ((r - 12) / (r - 15)) * 100,
      }),
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
    // A glyph where the instrument prints one, and the name beside it rather than instead of it.
    const glyph = glyphKindFor(option.label);
    const textX = glyph ? 44 : 22;
    if (glyph) {
      for (const stroke of glyphStrokes(glyph, 21, y + (rowHeight - 9) / 2)) {
        parts[`g${index}_${stroke.name}`] = rect(`g${index}_${stroke.name}`,
          { x: stroke.x, y: stroke.y, width: stroke.width, height: stroke.height },
          stroke.colour, { zIndex: 5, radius: 0, ...(stroke.rotation ? { pivotX: 0, pivotY: 50 } : {}) });
        if (stroke.rotation) {
          parts[`g${index}_${stroke.name}`]._children.Layout.rotation = stroke.rotation;
        }
      }
    }
    parts[`name${index}`] = text(`name${index}`, option.label, { x: textX, y: y + 1, width: width - textX - 4, height: rowHeight - 2 }, { size: 9 });

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

/* ------------------------------------------------------------------ envelope drawings */

/**
 * The envelope curve the instrument PRINTS above each fader bank.
 *
 * Every A/D/S/R bank on the SH-01 has one silkscreened over it, and without it four identical
 * faders labelled A D S R are four identical faders — the drawing is what says they are one shape
 * with four handles. The pitch envelope gets the two-stage version, because that is what it has.
 *
 * This is printed, not driven: it does not move when the faders do. The Envelope component type
 * declares attack/decay/sustain/release ports, but deviceBindingSync only reflects value / state /
 * selectedChoice / text / brightness / backlight inbound, so binding those four would look wired
 * and do nothing. A drawing that is honestly a drawing beats a control that lies.
 */
export function gaiaEnvelope({ stages = 'adsr', width = 200, height = 40 } = {}) {
  const pad = 5;
  const base = height - pad;
  const top = pad;
  const w = width - pad * 2;
  const line = 'FFBFCBD6';
  const guide = 'FF39434C';

  // Corner points of the printed shape, left to right.
  const points = stages === 'ad'
    ? [[0, base], [0.34, top], [1, base]]
    : [[0, base], [0.2, top], [0.46, top + (base - top) * 0.45], [0.72, top + (base - top) * 0.45], [1, base]];

  const parts = {};
  parts.baseline = rect('baseline', { x: pad, y: base, width: w, height: 1 }, guide, { zIndex: 0 });

  points.forEach(([fx], index) => {
    if (index === 0 || index === points.length - 1) return;
    parts[`guide${index}`] = rect(`guide${index}`, { x: pad + fx * w, y: top, width: 1, height: base - top }, guide, { zIndex: 0, opacity: 0.55 });
  });

  for (let i = 0; i < points.length - 1; i++) {
    const [fx1, y1] = points[i];
    const [fx2, y2] = points[i + 1];
    const x1 = pad + fx1 * w;
    const x2 = pad + fx2 * w;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const seg = rect(`seg${i}`, {
      x: x1,
      y: y1 - 0.8,
      width: Math.hypot(dx, dy),
      height: 1.6,
    }, line, { zIndex: 4, radius: 1, pivotX: 0, pivotY: 50 });
    if (dy !== 0) seg._children.Layout.rotation = Math.round((Math.atan2(dy, dx) * 180) / Math.PI * 10) / 10;
    parts[`seg${i}`] = seg;
  }

  // A component with no hit zones and no bindings: it draws and nothing else, which is what a
  // silkscreen does.
  return component({ name: 'GAIA Envelope', width, height, parts });
}

/**
 * One cell of a step sequencer: a well, and a bar that fills it from the bottom.
 *
 * NOT a short fader. A fader at this size is a 33px slot with a 13px cap in it, which reads as a
 * switch and, sixteen of them in a row, as a scattering of matchsticks — you cannot see the shape
 * of a pattern in it, and seeing the shape is the entire job of a step grid. A bar can be read
 * across sixteen columns at a glance, which is how every step sequencer ever built draws one.
 *
 * `accent` tints the well so bars of four are visible without a ruler.
 */
export function stepCell({ width = 92, height = 40, colour = 'FF52B788', accent = false } = {}) {
  const inset = 3;
  const floor = height - inset;
  const barW = width - inset * 2;

  return component({
    name: 'Step Cell',
    width,
    height,
    parts: {
      well: rect('well', { x: 0, y: 0, width, height }, accent ? 'FF1B222A' : 'FF141920', {
        zIndex: 0, radius: 3, borderColour: '44000000', borderThickness: 1,
      }),
      // Grows upward from the floor: y walks up as the value rises, height grows to match, which
      // is two bindings against one channel rather than one binding and a wish.
      bar: rect('bar', { x: inset, y: floor - 2, width: barW, height: 2 }, `55${colour.slice(2)}`, { zIndex: 1, radius: 2 }),
      cap: rect('cap', { x: inset, y: floor - 2, width: barW, height: 2 }, colour, { zIndex: 2, radius: 1 }),
    },
    behavior: createBehaviorModule('drive', { valueChannel: 'value', geometry: 'linear', role: 'slider', dragMode: 'vertical' }),
    hitZone: createHitZone('grab', { targetBehavior: 'drive', targetValueChannel: 'value', action: 'setValue', bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' } }),
    bindings: {
      barY: binding('barY', 'channel.value.normalized', 'Parts.bar.Layout.y', { outputMin: floor - 2, outputMax: inset, round: true }),
      barH: binding('barH', 'channel.value.normalized', 'Parts.bar.Layout.height', { outputMin: 2, outputMax: floor - inset, round: true }),
      capY: binding('capY', 'channel.value.normalized', 'Parts.cap.Layout.y', { outputMin: floor - 2, outputMax: inset, round: true }),
    },
  });
}

/* ------------------------------------------------------------------ arpeggio grid */

/**
 * The GAIA's arpeggiator, as the grid it actually is.
 *
 * The MIDI implementation has sixteen Patch Arpeggio Pattern blocks at 00 0D 00 .. 00 1C 00, each
 * an Original Note plus THIRTY-TWO step slots holding 0 for a rest and 1..127 for a velocity. That
 * is a step sequencer, and a step sequencer drawn as knobs is not a step sequencer — you draw
 * blocks into it.
 *
 * So this is the engine's own arpeggiator surface: `Designer.arpeggiator`, which materializes a
 * ruler, note-labelled rows and the drawn blocks at render time and takes arpeggiatorDraw /
 * arpeggiatorMove / arpeggiatorResize edits. 32 steps, the count the hardware has.
 *
 * WHAT IS AND IS NOT WIRED. The blocks you draw live in the component and publish through the
 * `arpPattern` channel. They are NOT written out to those 528 addresses: the channel's write side
 * is deliberately unbuilt (see customComponentArpeggiator.js — "a channel write racing a grid edit
 * has no clean precedence"), and there is no pattern-to-parameter bridge yet. The addresses are in
 * the profile so that bridge has somewhere to land; until it exists this grid edits a pattern, not
 * a synth, and the panel's notes say so rather than leaving it to be discovered.
 */
export function gaiaArpGrid({ width = 1200, height = 250, steps = 32, viewNote = 60, blocks = null } = {}) {
  // A starter pattern, so the grid opens showing what it is for rather than as an empty field.
  const seed = blocks ?? [
    { id: 'arp_seed_0', note: 60, step: 0, length: 1, velocity: 112 },
    { id: 'arp_seed_1', note: 63, step: 2, length: 1, velocity: 88 },
    { id: 'arp_seed_2', note: 67, step: 4, length: 1, velocity: 96 },
    { id: 'arp_seed_3', note: 70, step: 6, length: 1, velocity: 80 },
    { id: 'arp_seed_4', note: 72, step: 8, length: 2, velocity: 120 },
    { id: 'arp_seed_5', note: 67, step: 12, length: 1, velocity: 88 },
    { id: 'arp_seed_6', note: 63, step: 14, length: 1, velocity: 88 },
    { id: 'arp_seed_7', note: 60, step: 16, length: 4, velocity: 104 },
  ];

  return component({
    name: 'GAIA Arpeggio Grid',
    width,
    height,
    // The field the materialized rows and blocks are drawn onto. Everything else — ruler, note
    // labels, rows, blocks, the draw hit zone — is generated from Designer.arpeggiator at render.
    parts: {
      field: rect('field', { x: 0, y: 0, width, height }, 'FF0D1116', {
        zIndex: 0, radius: 4, borderColour: '55000000', borderThickness: 1,
      }),
    },
    channels: {
      arpCurrentStep: createValueChannel('arpCurrentStep', { label: 'Current Step', type: 'int', min: 0, max: steps - 1, step: 1, defaultValue: 0 }),
      arpStepCount: createValueChannel('arpStepCount', { label: 'Step Count', type: 'int', min: 1, max: 256, step: 1, defaultValue: steps }),
      arpGate: createValueChannel('arpGate', { label: 'Gate', type: 'bool', min: 0, max: 1, step: 1, defaultValue: 0 }),
      arpNote: createValueChannel('arpNote', { label: 'Note', type: 'int', min: 0, max: 127, step: 1, defaultValue: 0 }),
      arpVelocity: createValueChannel('arpVelocity', { label: 'Velocity', type: 'int', min: 0, max: 127, step: 1, defaultValue: 0 }),
      arpPattern: createArpPatternChannel(),
    },
    designer: {
      ...createCustomComponentDesignerDefaults(),
      arpeggiator: {
        enabled: true,
        stepCount: steps,
        noteMin: 0,
        noteMax: 127,
        viewNote,
        selectedBlock: '',
        blocks: seed,
      },
    },
    published: {
      _type: 'PublishedProperties',
      inputs: { currentStep: { channel: 'arpCurrentStep', label: 'Current Step', type: 'int' } },
      outputs: {
        gate: { channel: 'arpGate', label: 'Gate', type: 'bool' },
        note: { channel: 'arpNote', label: 'Note', type: 'int' },
        velocity: { channel: 'arpVelocity', label: 'Velocity', type: 'int' },
        pattern: { channel: 'arpPattern', label: 'Pattern', type: 'array' },
      },
      editableProperties: {},
    },
  });
}

/* ------------------------------------------------------------------ waveform glyphs */

/**
 * The little wave drawings printed beside each option on the instrument.
 *
 * The SH-01 does not write "SAW" next to its oscillator LEDs — it draws a sawtooth. Words are what
 * a spreadsheet uses; a synthesiser shows you the shape, and reading the shape is faster than
 * reading the word once you know the panel. So each option gets its glyph, and the text moves to
 * the right of it rather than standing in for it.
 *
 * Drawn from thin rects, rotated where a stroke needs to be diagonal. A sine is four short chords
 * rather than a curve, which at 16x9 is indistinguishable from one and needs no path support.
 */
function glyphStrokes(kind, ox, oy, w = 18, h = 9) {
  const c = 'FFD3DCE4';
  const T = 1.4;

  // A stroke between two points, and the reason the first attempt at these glyphs came out as
  // scattered marks: a rotated rect turns about its own centre unless told otherwise, so a segment
  // authored as "start here, this long, at this angle" ends up centred on its start point and
  // swings half its length backwards. Pinning the pivot to the LEFT-MIDDLE (pivotX 0, pivotY 50)
  // makes x,y mean "the line starts here", which is the only way polyline maths reads correctly.
  const line = (name, x1, y1, x2, y2) => ({
    name,
    x: ox + x1,
    y: oy + y1 - T / 2,
    width: Math.max(T, Math.hypot(x2 - x1, y2 - y1)),
    height: T,
    rotation: Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI * 10) / 10,
    colour: c,
  });

  /** Connect a list of [x, y] points with segments — one glyph, written as its own shape. */
  const poly = (points) => points.slice(0, -1).map((point, i) =>
    line(String.fromCharCode(97 + i), point[0], point[1], points[i + 1][0], points[i + 1][1]));

  const bar = (name, x, y, height) => ({ name, x: ox + x, y: oy + y, width: T, height, rotation: 0, colour: c });

  switch (kind) {
    case 'saw':
      // A ramp and the vertical fall back — one cycle of what the panel prints.
      return poly([[0, h], [w * 0.78, 0], [w * 0.78, h]]);
    case 'square':
      return poly([[0, h], [0, 0], [w * 0.5, 0], [w * 0.5, h], [w, h]]);
    case 'pulse':
      // Narrow duty cycle, which is what distinguishes PW-SQR from SQR at a glance.
      return poly([[0, h], [0, 0], [w * 0.3, 0], [w * 0.3, h], [w, h]]);
    case 'triangle':
      return poly([[0, h], [w * 0.5, 0], [w, h]]);
    case 'sine': {
      // Sampled, not eyeballed: five points off an actual sine, chorded together. At 18x9 the
      // chords are indistinguishable from a curve and need no path support.
      const points = [0, 0.25, 0.5, 0.75, 1].map((t) => [t * w, h / 2 - (Math.sin(t * 2 * Math.PI) * h) / 2]);
      return poly(points);
    }
    case 'noise':
      // Random-height spikes — sample-and-hold, and the same mark the panel uses for RND.
      return [bar('a', 1, 2, h - 2), bar('b', 5, 0, h), bar('c', 9, 3, h - 3), bar('d', 13, 1, h - 1)];
    case 'supersaw':
      // Three detuned saws stacked, which is exactly what the voice is.
      return [0, 1, 2].flatMap((i) => poly([[i * 2.5, h], [i * 2.5 + w * 0.55, 0]])
        .map((stroke) => ({ ...stroke, name: `${stroke.name}${i}` })));
    default:
      return [];
  }
}

/** Which glyph an option label means. Anything unlisted keeps its text and gets no drawing. */
const GLYPH_FOR = {
  SAW: 'saw', SQR: 'square', 'PW-SQR': 'pulse', TRI: 'triangle', SINE: 'sine',
  NOISE: 'noise', 'SUPER-SAW': 'supersaw', SIN: 'sine', 'S&H': 'noise', RND: 'noise',
};

export function glyphKindFor(label) {
  return GLYPH_FOR[String(label).toUpperCase()] ?? null;
}
