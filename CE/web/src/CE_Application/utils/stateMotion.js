/**
 * stateMotion.js — a state's motion, as the States tab shows it: what plays on Entering the state,
 * what loops While in it, and what plays on Leaving it; and, for gestures that have no duration, an
 * Events row (click, double-click, long press, flick, a wheel turn).
 *
 * NOTHING NEW IS STORED. Each slot is a reading of the animation triggers that already exist
 * (docs/design/animation-designer.md, "Mouse over, exit, press: through states", decided by the
 * owner on 2026-11-24 instead of a mouse layer of its own):
 *
 *   Entering  a transition, a keyframe animation that plays a set number of times, or a sequence
 *             that does not loop — each with a `stateChange` trigger whose `to` names the state;
 *   While in  a keyframe animation that loops (`iterations: 'infinite'`) or a sequence that loops,
 *             with the same trigger: both already play for exactly as long as the state holds;
 *   Leaving   either Entering played back (a transition's `reverse`, on by default), or an
 *             animation of its own with `leaving: true` and the state in its `from`: it plays when
 *             the state is left (transitionSelection.js, rule 1). The one field this adds. "To
 *             default" was the first try and could not work on a knob, which rests in a state of
 *             its own (ActiveHandleCurrent), so leaving Hover never entered default.
 *
 * The Events row is the one new trigger type, `event` (keyframeAnimation.js), played the way a
 * script's `ce.anim.play` already plays one: on request, from where the gesture is recognised.
 *
 * State names are compared lower-cased, as every player compares them: the tab writes "hover",
 * the States section's key is "Hover".
 */
import {
  OFFERED_PROPERTIES,
  OFFERED_ROOT_PROPERTIES,
  animationsPatch,
  keyframeTargets,
  newAnimationShape,
  readAnimations,
  uniqueAnimationName,
} from './animationModel.js';
import { PULSE_FRAMES } from './keyframeAnimation.js';

/** The gestures with no duration, in the order the Events row lists them. */
export const MOTION_EVENTS = Object.freeze([
  { id: 'click', label: 'Click' },
  { id: 'doubleClick', label: 'Double-click' },
  { id: 'longPress', label: 'Long press' },
  { id: 'flick', label: 'Flick' },
  { id: 'wheelUp', label: 'Wheel up' },
  { id: 'wheelDown', label: 'Wheel down' },
]);

export const FLICK_DIRECTIONS = Object.freeze(['any', 'left', 'right', 'up', 'down']);
/** How long a press must be held, and how fast a release must move, by default. */
export const LONG_PRESS_MS = 500;
export const FLICK_MIN_SPEED = 600;

const lower = (value) => String(value ?? '').trim().toLowerCase();

function loops(row) {
  return (row.kind === 'keyframes' && row.iterations === 'infinite') || (row.kind === 'sequence' && row.loop === true);
}

/** The animations that fill each slot of one state, as the Animation tab reads them. */
export function stateMotion(control, stateKey) {
  const state = lower(stateKey);
  const rows = readAnimations(control).filter((row) => row.trigger?.type === 'stateChange');
  const arriving = rows.filter((row) => row.trigger.leaving !== true);
  const entering = arriving.filter((row) => row.trigger.to.includes(state) && !loops(row));
  return {
    state,
    entering,
    whileIn: arriving.filter((row) => row.trigger.to.includes(state) && loops(row)),
    leaving: rows.filter((row) => row.trigger.leaving === true && row.trigger.from.includes(state) && !loops(row)),
    // Entering transitions that run back when the state ends: the default, and what Leaving shows
    // when it has nothing of its own.
    playedBack: entering.filter((row) => row.kind === 'transition' && row.trigger.reverse),
    enteringTransitions: entering.filter((row) => row.kind === 'transition'),
  };
}

/** The keyframe animations each gesture plays, by event id. */
export function eventMotion(control) {
  const out = Object.fromEntries(MOTION_EVENTS.map((event) => [event.id, []]));
  for (const row of readAnimations(control)) {
    if ((row.kind !== 'keyframes' && row.kind !== 'text') || row.trigger?.type !== 'event') continue;
    if (out[row.trigger.event]) out[row.trigger.event].push(row);
  }
  return out;
}

/**
 * What a state changes, as targets a transition can ease: the state's own overrides on the control
 * and on its parts, where the runtime animates them. A new Entering transition starts with these,
 * so it does something the moment it exists — it eases the change the state already makes.
 */
export function stateTargets(control, stateKey) {
  const states = control?._children?.States?._children ?? {};
  const key = Object.keys(states).find((name) => lower(name) === lower(stateKey));
  const patches = states[key]?.patches ?? {};
  const targets = [];
  for (const path of Object.keys(patches.component ?? {})) {
    const offered = OFFERED_ROOT_PROPERTIES.find((entry) => entry.path === path);
    if (offered) targets.push({ path, properties: [...offered.properties] });
  }
  for (const [part, changes] of Object.entries(patches.parts ?? {})) {
    for (const path of Object.keys(changes ?? {})) {
      const offered = OFFERED_PROPERTIES.find((entry) => entry.path === path);
      if (offered) targets.push({ path: `Parts.${part}.${path}`, properties: [...offered.properties] });
    }
  }
  return targets;
}

function existingNames(control) {
  return Object.keys(control?._children?.Animations?._children ?? {});
}

function loopNode(name, trigger) {
  return {
    _type: 'Animation',
    name,
    enabled: true,
    kind: 'keyframes',
    trigger,
    iterations: 'infinite',
    direction: 'normal',
    duration: 600,
    delay: 0,
    easing: 'inOutQuad',
    targets: keyframeTargets(''),
    frames: PULSE_FRAMES.map((frame) => ({ ...frame })),
  };
}

/**
 * A new animation for one slot of one state, as one patch for applyControlPatch: `{ patch, name }`.
 *   entering  a transition from anything into the state, easing what the state changes;
 *   whileIn   a gentle pulse on the whole control, looping while the state holds;
 *   leaving   a transition from the state back to the resting look, easing the same things.
 */
export function newMotionPatch(control, stateKey, slot) {
  const state = lower(stateKey);
  if (!state) return null;
  const name = uniqueAnimationName(existingNames(control), `${state}${slot === 'whileIn' ? 'Loop' : slot === 'leaving' ? 'Leave' : 'Enter'}`);
  let node;
  if (slot === 'whileIn') {
    node = loopNode(name, { type: 'stateChange', from: ['*'], to: [state], reverse: true });
  } else if (slot === 'leaving') {
    node = {
      ...newAnimationShape(name),
      trigger: { type: 'stateChange', from: [state], to: ['*'], reverse: false, leaving: true },
      targets: stateTargets(control, stateKey),
      duration: 160,
    };
  } else {
    node = {
      ...newAnimationShape(name),
      trigger: { type: 'stateChange', from: ['*'], to: [state], reverse: true },
      targets: stateTargets(control, stateKey),
    };
  }
  return { name, patch: animationsPatch(control, { [name]: node }) };
}

/** Play the state's Entering transitions back when it ends, or not: one write per transition. */
export function playbackPatch(control, stateKey, on) {
  const patch = {};
  for (const row of stateMotion(control, stateKey).enteringTransitions) {
    patch[`Animations.${row.name}.trigger.reverse`] = on === true;
  }
  return patch;
}

/** A new keyframe animation played by a gesture: a single pulse of the whole control. */
export function newEventPatch(control, eventId) {
  const event = MOTION_EVENTS.find((entry) => entry.id === eventId);
  if (!event) return null;
  const name = uniqueAnimationName(existingNames(control), `on${event.id[0].toUpperCase()}${event.id.slice(1)}`);
  const trigger = { type: 'event', event: event.id };
  if (event.id === 'flick') Object.assign(trigger, { direction: 'any', speed: FLICK_MIN_SPEED });
  if (event.id === 'longPress') trigger.hold = LONG_PRESS_MS;
  const node = { ...loopNode(name, trigger), iterations: 1 };
  return { name, patch: animationsPatch(control, { [name]: node }) };
}

/** A row in a few words for a slot: its name, and what kind of motion it is. */
export function slotLabel(row) {
  const kind = row.kind === 'keyframes' ? (loops(row) ? 'loop' : 'keyframes') : row.kind;
  return { name: row.name, kind, enabled: row.enabled !== false };
}
