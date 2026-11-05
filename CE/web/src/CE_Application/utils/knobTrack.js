// knobTrack.js — the track a knob or slider is drawn round, worked out once.
//
// The renderer (editor/SliderFamilyRenderer.svelte) draws a knob round a circle whose centre and
// radius follow from its parts and its Behavior: the track's thickness, the pointers' sizes and
// kind, the ticks, the labels riding the handles, and in the tight fit the housing's and the scale
// numbers' reach (utils/sliderGeometry.js resolveCircularTrackMetrics). Preview's and the Test
// Bench's hit tests, the labels riding the handles and Create Component from Selection's layers each
// used to work that circle out for themselves, and they drifted. The hit tests read the control as
// authored, without its set's look (a set's tight fit, its pointers' sizes), and kept minimums of
// their own: up to 8 px from the handle as drawn, inside the 12 px a press may miss by, so it did not
// show, but only by luck. The labels riding the handles hung round a circle without the tight fit:
// on a Lever Dial knob 38 px from the centre, inside the track drawn at 43, over the knob. They all
// ask here now, with the control as it is drawn.

import { getSliderGeometry, getSliderValueMode, numberOr } from './sliderBehavior.js';
import { knobOutlineReach } from './knobOutlines.js';
import { resolveCircularTrackMetrics, sliderHandleLabelRoom } from './sliderGeometry.js';
import { resolveSliderSemanticParts } from './sliderEntityFactory.js';

const POINTER_KINDS_FROM_CENTRE = new Set(['line', 'bar', 'chicken', 'capdot', 'needle']);

function labelFontSize(part, fallback) {
  return Math.max(1, numberOr(part?._children?.Text?._children?.Font?.size, fallback));
}

/**
 * The sizes a knob or slider is drawn with and, for a knob, the circle it is drawn round
 * (`centerX`, `centerY`, `radius`) in a box `width` by `height`. `behavior` is the control's
 * Behavior and `parts` its parts as the renderer resolves them (resolveSliderSemanticParts'
 * `_children`), both as drawn: its set applied.
 */
export function knobTrack({ behavior = null, parts = {} } = {}, width = 0, height = 0) {
  const b = behavior ?? {};
  const part = (name) => parts?.[name] ?? null;
  const layout = (name) => part(name)?._children?.Layout ?? null;
  const circular = getSliderGeometry(b) === 'circular';
  const valueMode = getSliderValueMode(b);

  const trackThickness = numberOr(layout('bodyTrackBase')?.height, 10);
  const pointerCurrentSize = numberOr(layout('pointerCurrent')?.width, 20);
  const pointerStartSize = numberOr(layout('pointerStart')?.width, 18);
  const pointerEndSize = numberOr(layout('pointerEnd')?.width, 18);
  const maxPointerSize = Math.max(pointerCurrentSize, pointerStartSize, pointerEndSize);
  // How the current-value pointer is drawn round a knob: the dot that rides the arc, or a line,
  // bar, chicken-head, dot on the cap or needle drawn from the centre out, over the cap.
  const kind = String(part('pointerCurrent')?.kind ?? 'dot').toLowerCase();
  const pointerKind = circular && POINTER_KINDS_FROM_CENTRE.has(kind) ? kind : 'dot';
  const majorTickLength = numberOr(layout('tickMajor')?.height, numberOr(b.majorTickLength, 12));
  const showTicks = b.showTicks !== false;
  const tight = String(b.circularFit ?? 'auto') === 'tight';
  const handleLabelSize = sliderHandleLabelRoom(b,
    Math.max(labelFontSize(part('labelStart'), 11), labelFontSize(part('labelCurrent'), 11), labelFontSize(part('labelEnd'), 11)));

  // The scale's numbers (Parts.tickNumber, Behavior.scaleNumberCount): how many, their size, and
  // their distance from the centre as a multiple of the track's radius.
  const numberPart = part('tickNumber');
  const scaleNumberCount = circular && numberPart?.visible !== false
    ? Math.max(0, Math.min(41, Math.round(numberOr(b.scaleNumberCount, 0))))
    : 0;
  const scaleNumberSize = labelFontSize(numberPart, 7);
  const scaleNumberReach = scaleNumberCount >= 2 ? Math.max(0, numberOr(numberPart?._children?.Layout?.offsetX, 122)) / 100 : 0;

  // How far the housing and the skirt reach, as a multiple of the track's radius: their size and
  // their outline's reach (a square reaches further at its corners), either one's shadow below it,
  // an oval taller than wide, one moved off the centre; and a scale on a radius of its own.
  const plateReach = (name, fallback) => {
    const plate = part(name);
    if (!circular || plate?.visible !== true) return 0;
    const box = plate._children?.Layout ?? {};
    if (String(box.widthUnit ?? 'percent') === 'px') return 0;
    const reach = knobOutlineReach(String(plate.outline ?? 'circle'), {
      count: plate.outlineCount, depth: plate.outlineDepth, rotation: numberOr(plate.outlineRotation, 0),
    });
    const shadow = 1 + Math.max(0, numberOr(plate.shadowOffset, 0) + numberOr(plate.shadowBlur, 0)) / 100;
    const tall = Math.max(1, Math.max(5, numberOr(plate.aspect, 100)) / 100);
    return (Math.max(0, numberOr(box.width, fallback)) / 100) * reach * shadow * tall + Math.abs(numberOr(plate.shiftY, 0)) / 100;
  };
  const tickRadiusShare = Math.max(0, numberOr(b.tickRadius, 0)) / 100;
  const housingReach = Math.max(plateReach('bodyHousing', 100), plateReach('bodySkirt', 90),
    circular && showTicks && tickRadiusShare > 0 && tight ? tickRadiusShare + (String(b.tickPlacement ?? 'outside') === 'outside' ? 0.1 : 0.02) : 0);

  const metrics = resolveCircularTrackMetrics(width, height, {
    trackThickness,
    // Tight: the pointer it draws. A dot rides the arc and needs its size; a line, needle,
    // chicken-head or dot on the cap stays inside it. Range handles only in a range.
    pointerSize: tight
      ? Math.max(pointerKind === 'dot' ? pointerCurrentSize : 0, valueMode === 'single' ? 0 : Math.max(pointerStartSize, pointerEndSize))
      : maxPointerSize,
    majorTickLength,
    hasTicks: showTicks,
    circularDiameter: b.circularDiameter,
    handleLabelSize,
    tight,
    outerReach: housingReach,
    numberReach: scaleNumberReach,
    numberSize: scaleNumberSize,
  });

  return {
    centerX: metrics.centerX,
    centerY: metrics.centerY,
    radius: metrics.radius,
    trackThickness,
    pointerCurrentSize,
    pointerStartSize,
    pointerEndSize,
    maxPointerSize,
    pointerKind,
    majorTickLength,
    showTicks,
    tight,
    tickRadiusShare,
    housingReach,
    handleLabelSize,
    scaleNumberCount,
    scaleNumberSize,
    scaleNumberReach,
  };
}

/** knobTrack for a control as it is drawn (its set applied), its parts resolved as the renderer does. */
export function knobTrackOf(control, width, height) {
  const parts = resolveSliderSemanticParts(control?._children?.Parts ?? null)._children;
  return knobTrack({ behavior: control?._children?.Behavior ?? null, parts }, width, height);
}

/** The size of the pointer a handle (`current`, `start`, `end`) is drawn with. */
export function knobHandleSize(track, role = 'current') {
  if (role === 'start') return track.pointerStartSize;
  if (role === 'end') return track.pointerEndSize;
  return track.pointerCurrentSize;
}
