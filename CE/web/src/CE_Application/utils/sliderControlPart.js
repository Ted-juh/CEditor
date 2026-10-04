/**
 * sliderControlPart.js — a panel Knob or Slider carried inside a custom component, drawn and driven by
 * the panel's own code.
 *
 * Create Component from Selection turns panel artwork into a component (customComponentFromControls.js).
 * A knob cannot be rebuilt from component parts and look the same: the panel draws it procedurally
 * (editor/SliderFamilyRenderer.svelte) with its own angle convention, caps, ticks, labels and readout,
 * and its own States and Animations move the pointer on hover and press. So a converted knob is not
 * rebuilt. It becomes one part of kind `slidercontrol` that carries a snapshot of the knob, and that
 * part runs the SAME pipeline the panel runs for it:
 *
 *   resolveInteractiveControl(snapshot, session) → SliderFamilyRenderer(control, runtime)
 *
 * where `session` is what the panel's preview session would hold for the knob, rebuilt from the part:
 *
 *   meta.sliderControl.value     the knob's value, written by a binding from the knob's channel
 *   meta.sliderControl.hover     set by a component State while the pointer is over the knob's zone
 *   meta.sliderControl.pressed   set by a component State while that zone is being dragged
 *   meta.sliderControl.focused   set by a component State while that zone is among the focused ones
 *
 * Dragging the knob's hit zone uses the panel knob's own pointer maths on the snapshot's Behavior and
 * Mouse sections (sliderControlValueFromPoint below), so it moves the way it did on the panel.
 */
import { deepClone } from './deepClone.js';
import { numberOr, clamp } from './primitives.js';
import { getSliderLegalRangeForHandle, getSliderStep, snapSliderValue } from './sliderBehavior.js';
import { resolveMouseDirection } from './rangeBehavior.js';
import { rangeResetValue } from './rangeReset.js';
import { resolveSliderNormalizedFromPoint } from './sliderGeometry.js';
import {
  createCircularSliderScrub, createSliderTrackScrub, getCircularSliderDragMode, isLinearSliderGeometry,
} from './scrubRuntime.js';

export const SLIDER_CONTROL_KIND = 'slidercontrol';

/**
 * The parts a slider-family control uses as STYLE DATA for SliderFamilyRenderer rather than drawing
 * as parts of their own. CanvasControl skips these; any other visible part it draws on top.
 */
export const SLIDER_SEMANTIC_PARTS = new Set([
  'bodyTrackBase', 'bodyTrackFill', 'bodySelectedRange', 'bodyCenterMarker', 'bodyCap',
  'pointerStart', 'pointerCurrent', 'pointerEnd',
  'tickMajor', 'tickMinor', 'tickAccent',
  'labelMin', 'labelMax', 'labelStart', 'labelCurrent', 'labelEnd', 'labelValue', 'labelTitle', 'labelUnit',
]);

/** Sections of the knob the snapshot keeps. Bindings to a device and scripts stay on the panel side. */
const DROPPED_SECTIONS = ['DeviceBindings', 'Scripts'];

export function isSliderControlPart(part) {
  return String(part?.kind ?? '').trim().toLowerCase() === SLIDER_CONTROL_KIND;
}

/** The knob as the part carries it: the resolved control, without what only the panel uses. */
export function sliderControlSnapshot(resolvedControl) {
  const snapshot = deepClone(resolvedControl);
  for (const section of DROPPED_SECTIONS) delete snapshot._children[section];
  return snapshot;
}

/**
 * The preview session the panel would hold for the knob in this state. The value is an override
 * exactly as a drag on the panel writes it (PanelPreviewSurface's setSliderRoleValue), and a press
 * is hover + pressed + dragging, as the panel's pointer-down sets them.
 */
export function sliderControlSession(meta) {
  const value = Number(meta?.value);
  const pressed = meta?.pressed === true;
  const session = {
    activeHandle: 'current',
    hover: pressed || meta?.hover === true,
    pressed,
    dragging: pressed,
    focused: meta?.focused === true,
  };
  if (Number.isFinite(value)) {
    Object.assign(session, {
      valueOverrideEnabled: true,
      valueOverride: value,
      currentValueOverrideEnabled: true,
      currentValueOverride: value,
    });
  }
  return session;
}

function behaviorOf(snapshot) {
  return snapshot?._children?.Behavior ?? null;
}

/**
 * The knob's value for a pointer position, as the panel computes it for the same knob and drag.
 *
 * The panel keeps ONE scrub for the whole gesture and feeds it every move (PanelPreviewSurface's
 * sliderValueForPoint), and that is not the same as one move from the press point: the scrub clamps at
 * each end as it goes, so pushing past the top and coming back starts down from the top at once; a
 * rotary drag unwraps its angle move by move; a stepped value has hysteresis. So a surface passes a
 * `dragState` object that lives for the gesture, and the scrub is kept in it. Without one (a one-off
 * hit test) the gesture is replayed as a single move, which agrees whenever nothing clamped.
 */
export function sliderControlValueFromPoint(snapshot, rect, point, start, dragState = null) {
  const behavior = behaviorOf(snapshot);
  const mouse = snapshot?._children?.Mouse ?? null;
  if (!behavior || !rect) return null;
  const min = numberOr(behavior.min, 0);
  const max = numberOr(behavior.max, 1);
  const span = max - min;
  const startNormalized = span > 0 ? clamp((numberOr(start?.value, min) - min) / span, 0, 1) : 0;
  const sample = (x, y) => ({ x, y, shiftKey: point?.fine === true, ctrlKey: point?.coarse === true, altKey: false, metaKey: false });
  const hasStart = Number.isFinite(Number(start?.clientX)) && Number.isFinite(Number(start?.clientY));
  const relativeDial = !isLinearSliderGeometry(behavior) && getCircularSliderDragMode(behavior) !== 'absolute';
  let normalized = null;
  if (hasStart && (isLinearSliderGeometry(behavior) || relativeDial)) {
    let scrub = dragState?.scrub ?? null;
    if (!scrub) {
      scrub = relativeDial
        ? createCircularSliderScrub(behavior, startNormalized, mouse)
        : createSliderTrackScrub(behavior, mouse, startNormalized);
      scrub.begin(sample(Number(start.clientX), Number(start.clientY)), relativeDial ? { bounds: rect } : { bounds: rect, jumpToPointer: true });
      if (dragState) dragState.scrub = scrub;
    }
    const moved = scrub.move(sample(point.clientX, point.clientY));
    normalized = moved ?? scrub.value;
  } else {
    // An absolute dial maps the pointer's angle straight to a value, as the panel does.
    normalized = resolveSliderNormalizedFromPoint(behavior, rect, point.clientX, point.clientY);
  }
  if (!Number.isFinite(Number(normalized))) return null;
  const raw = min + clamp(Number(normalized), 0, 1) * span;
  const legal = getSliderLegalRangeForHandle(behavior, null, 'current');
  return Math.max(legal.min, Math.min(legal.max, snapSliderValue(behavior, raw)));
}

/**
 * The knob's value after one wheel notch, or null where the panel knob ignores the wheel. The panel
 * moves a knob by one step per notch, and only when its Behavior says `wheelEnabled`
 * (PanelPreviewSurface's wheel handler); `direction` is +1 for a notch up.
 */
export function sliderControlWheelValue(snapshot, current, direction) {
  const behavior = behaviorOf(snapshot);
  if (!behavior || behavior.wheelEnabled !== true) return null;
  const signed = resolveMouseDirection(behavior, direction);
  const legal = getSliderLegalRangeForHandle(behavior, null, 'current');
  const next = snapSliderValue(behavior, numberOr(current, numberOr(behavior.defaultCurrentValue ?? behavior.defaultValue, 0)) + signed * getSliderStep(behavior));
  return Math.max(legal.min, Math.min(legal.max, next));
}

/** The knob part a component's hit zone drives, as `{ behavior, snapshot, channelName }`, or null. */
export function sliderControlForZone(control, zone) {
  const behavior = control?._children?.Behaviors?._children?.[zone?.targetBehavior ?? ''] ?? null;
  if (String(behavior?.type ?? '').trim().toLowerCase() !== SLIDER_CONTROL_KIND) return null;
  const snapshot = control?._children?.Parts?._children?.[behavior.part]?.meta?.sliderControl?.control ?? null;
  if (!snapshot) return null;
  return { behavior, snapshot, channelName: zone?.targetValueChannel ?? behavior.valueChannel };
}

/** The zone Tab brings focus to: the first knob, as the panel's tab order reached them. */
export function firstSliderControlZone(control) {
  const zones = Object.entries(control?._children?.HitZones?._children ?? {})
    .filter(([, zone]) => sliderControlForZone(control, zone))
    .sort((left, right) => numberOr(left[1]?.priority, 0) - numberOr(right[1]?.priority, 0));
  return zones[0]?.[0] ?? '';
}

/** Whether a component carries any panel knob, which changes what its wheel does. */
export function hasSliderControlParts(control) {
  return Object.values(control?._children?.Behaviors?._children ?? {})
    .some((behavior) => String(behavior?.type ?? '').trim().toLowerCase() === SLIDER_CONTROL_KIND);
}

/**
 * The knob's value after a key, as the panel's keyboard handler moves a focused knob: arrows one step,
 * Page Up/Down ten, Home/End to the ends. Null for any other key.
 */
export function sliderControlKeyValue(snapshot, current, key) {
  const behavior = behaviorOf(snapshot);
  if (!behavior) return null;
  const legal = getSliderLegalRangeForHandle(behavior, null, 'current');
  const now = numberOr(current, numberOr(behavior.defaultCurrentValue ?? behavior.defaultValue, legal.min));
  const step = getSliderStep(behavior);
  let next;
  switch (key) {
    case 'Home': next = legal.min; break;
    case 'End': next = legal.max; break;
    case 'ArrowLeft': case 'ArrowDown': next = snapSliderValue(behavior, now - step); break;
    case 'ArrowRight': case 'ArrowUp': next = snapSliderValue(behavior, now + step); break;
    case 'PageDown': next = snapSliderValue(behavior, now - step * 10); break;
    case 'PageUp': next = snapSliderValue(behavior, now + step * 10); break;
    default: return null;
  }
  return Math.max(legal.min, Math.min(legal.max, next));
}

/**
 * The value a double-click resets the knob to, by the panel's own rule (resetRangeOnDoubleClick):
 * its default, or the display's zero when its display range spans one, snapped and clamped.
 */
export function sliderControlResetValue(snapshot) {
  const behavior = behaviorOf(snapshot);
  if (!behavior) return null;
  const defaultValue = behavior.defaultCurrentValue ?? behavior.defaultValue;
  const value = rangeResetValue({ ...behavior, defaultValue }, snapshot?._children?.Designer?.lcdReadout);
  const legal = getSliderLegalRangeForHandle(behavior, null, 'current');
  return Math.max(legal.min, Math.min(legal.max, snapSliderValue(behavior, value)));
}

// ---------------------------------------------------------------------------------------------------
// Focus
//
// A panel knob's `focused` flag is its own, and PanelPreviewSurface sets and clears it on these events:
//
//   press        the pressed knob: false (the pointer-down patch), and the knob that had DOM focus
//                loses it (its blur: false)
//   wheel, keys  the knob moved: true
//   Tab          the knob tabbed to: true (handleFocus, keyboard only)
//   blur         the knob that had DOM focus: false
//
// The flags are independent: a wheeled knob stays focused while another is pressed. A component has
// one focus of its own, so it keeps the knob flags in its session as a list of zones, with the zone
// that stands for the knob holding DOM focus. These patches are the events above, zone by zone.

const zoneList = (session) => (Array.isArray(session?.focusedCustomHitZones) ? session.focusedCustomHitZones : []);

/** A press on `zone` of the component ('' for its artwork). */
export function sliderControlPressFocusPatch(session, zone) {
  const drop = new Set([session?.domFocusCustomHitZone ?? '', zone ?? ''].filter(Boolean));
  return { focusedCustomHitZones: zoneList(session).filter((name) => !drop.has(name)), domFocusCustomHitZone: zone ?? '' };
}

/** The wheel or a key moved the knob on `zone`, or Tab brought focus to it. */
export function sliderControlFocusZonePatch(session, zone) {
  const list = zoneList(session);
  return { focusedCustomHitZones: list.includes(zone) ? list : [...list, zone] };
}

/** The component lost DOM focus: so does the knob that stood for it. */
export function sliderControlBlurPatch(session) {
  const gone = session?.domFocusCustomHitZone ?? '';
  return { focusedCustomHitZones: zoneList(session).filter((name) => name !== gone), domFocusCustomHitZone: '' };
}
