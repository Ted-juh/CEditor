// rangeControlConversion.js — turn a Knob into a Slider, or a Slider into a Knob.
//
// The two run on one engine (the slider's) with one set of parts; what makes one a knob is its type,
// which the control set reads to draw it, and its geometry. The Slider tab offered a knob linear
// presets and a Geometry choice, and a slider circular ones: set to linear a knob went on looking
// like a knob and was dragged as a line, and a circular slider was a knob the control set did not
// style as one. The owner's call: changing between the two is changing the control's type, so it
// takes the control set's design for what it becomes.
//
// What changes: the type; the geometry and direction to match it (clockwise ↔ left to right,
// anticlockwise ↔ right to left); the size, to the new type's own (a knob is square, a slider wide),
// centred where the control was; and the Form, to the same form of the new type. Everything else
// stays: the name, the value and range, bindings to the device and to MIDI, scripts, states,
// animations, and the parts, which the two types share.

import { createControl } from '../models/componentTypes.js';
import { anatomyOptions } from '../models/controlAnatomy.js';
import { deepClone } from './deepClone.js';

export const RANGE_CONVERSION = { Knob: 'Slider', Slider: 'Knob' };

/** The type a Knob or a Slider changes to, or '' for any other control. */
export function rangeConversionTarget(control) {
  return RANGE_CONVERSION[String(control?._children?.Core?.controlType ?? '')] ?? '';
}

function sameForm(fromType, toType, form) {
  const id = String(form ?? '');
  if (!id || id === 'original') return id;
  const index = anatomyOptions(fromType).findIndex(([option]) => option === id);
  return index >= 0 ? (anatomyOptions(toType)[index]?.[0] ?? '') : '';
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** A copy of `control` as the other of Knob and Slider; null when it is neither. */
export function convertRangeControl(control) {
  const fromType = String(control?._children?.Core?.controlType ?? '');
  const toType = RANGE_CONVERSION[fromType];
  if (!toType) return null;
  const next = deepClone(control);
  const sections = next._children;
  const fresh = createControl(toType)._children;

  sections.Core = {
    ...sections.Core,
    controlType: toType,
    controlForm: sameForm(fromType, toType, sections.Core?.controlForm),
  };

  const behavior = { ...(sections.Behavior ?? {}) };
  const anticlockwise = ['ccw', 'rtl', 'btt'].includes(String(behavior.direction ?? '').toLowerCase());
  if (toType === 'Knob') {
    behavior.geometry = 'circular';
    behavior.direction = anticlockwise ? 'ccw' : 'cw';
    behavior.startAngle = numberOr(behavior.startAngle, fresh.Behavior?.startAngle ?? 135);
    behavior.sweepAngle = numberOr(behavior.sweepAngle, fresh.Behavior?.sweepAngle ?? 270);
  } else {
    behavior.geometry = 'linear';
    behavior.orientation = 'horizontal';
    behavior.direction = anticlockwise ? 'rtl' : 'ltr';
  }
  sections.Behavior = behavior;

  const transform = sections.Transform ?? {};
  const width = numberOr(fresh.Transform?.width, toType === 'Knob' ? 100 : 220);
  const height = numberOr(fresh.Transform?.height, toType === 'Knob' ? 100 : 48);
  const centreX = numberOr(transform.x, 0) + numberOr(transform.width, width) / 2;
  const centreY = numberOr(transform.y, 0) + numberOr(transform.height, height) / 2;
  sections.Transform = {
    ...transform,
    width,
    height,
    x: Math.round(centreX - width / 2),
    y: Math.round(centreY - height / 2),
  };
  return next;
}
