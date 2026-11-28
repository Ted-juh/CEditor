// A state's motion on the States tab: Entering, While in, Leaving, and the Events row
// (utils/stateMotion.js). Decided by the owner on 2026-11-24 instead of a mouse layer of its own:
// mouse over is entering Hover, mouse exit is leaving it, and the slots are readings of the
// triggers that already exist. So every slot here is checked the only way that means anything: the
// animation it writes is run through the real runtime, tracker and keyframe player.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { createTransitionTracker } from '../src/CE_Application/utils/transitionSelection.js';
import { createKeyframePlayer } from '../src/CE_Application/utils/keyframeAnimation.js';
import {
  MOTION_EVENTS,
  eventMotion,
  newEventPatch,
  newMotionPatch,
  playbackPatch,
  stateMotion,
  stateTargets,
} from '../src/CE_Application/utils/stateMotion.js';

function apply(control, patch) {
  for (const [path, value] of Object.entries(patch)) assert.ok(setNestedValue(control, path, value), `wrote ${path}`);
  return control;
}

/** A clean knob: its shipped animations are value glides, so nothing else answers a state. */
function knob() {
  return createControl('Knob', { Core: { id: 'k1', name: 'Knob01' } });
}

const runtimeOf = (control, session) => resolveInteractiveControl(control, session).runtime;

/** The names a transition tracker fires through a run of preview sessions. */
function firedThrough(control, sessions) {
  let clock = 0;
  const tracker = createTransitionTracker({ now: () => clock });
  return sessions.map((session) => {
    clock += 1000;
    return tracker.next(runtimeOf(control, session)).fired;
  });
}

test('a new Entering transition eases what the state already changes', () => {
  const control = knob();
  // A knob's Hover state lifts its pointer; that is what entering Hover should ease.
  assert.deepEqual(stateTargets(control, 'Hover').map((target) => target.path), ['Parts.pointerCurrent.Layout.scale']);
  const { name, patch } = newMotionPatch(control, 'Hover', 'entering');
  assert.equal(name, 'hoverEnter');
  apply(control, patch);

  const motion = stateMotion(control, 'Hover');
  assert.deepEqual(motion.entering.map((row) => row.name), ['hoverEnter']);
  assert.deepEqual(motion.playedBack.map((row) => row.name), ['hoverEnter'], 'and it plays back on leaving, by default');

  const [, entering, leaving] = firedThrough(control, [{}, { hover: true }, {}]);
  assert.ok(entering.includes('hoverEnter'), `mouse over fired ${entering.join(', ')}`);
  assert.ok(leaving.includes('hoverEnter'), `mouse exit played it back: ${leaving.join(', ')}`);
});

test('Leaving: switching play-back off stops the run back; an animation of its own plays on leaving only', () => {
  const control = knob();
  apply(control, newMotionPatch(control, 'Hover', 'entering').patch);
  apply(control, playbackPatch(control, 'Hover', false));
  assert.deepEqual(stateMotion(control, 'Hover').playedBack, []);
  let [, entering, leaving] = firedThrough(control, [{}, { hover: true }, {}]);
  assert.ok(entering.includes('hoverEnter'));
  assert.ok(!leaving.includes('hoverEnter'), 'no longer played back');

  const { name, patch } = newMotionPatch(control, 'Hover', 'leaving');
  assert.equal(name, 'hoverLeave');
  apply(control, patch);
  assert.deepEqual(stateMotion(control, 'Hover').leaving.map((row) => row.name), ['hoverLeave']);
  [, entering, leaving] = firedThrough(control, [{}, { hover: true }, {}]);
  assert.ok(!entering.includes('hoverLeave'), 'not on the way in');
  assert.ok(leaving.includes('hoverLeave'), `mouse exit fired ${leaving.join(', ')}`);
});

test('While in: a loop that plays for exactly as long as the state holds', () => {
  const control = knob();
  const { name, patch } = newMotionPatch(control, 'Pressed', 'whileIn');
  assert.equal(name, 'pressedLoop');
  apply(control, patch);
  assert.deepEqual(stateMotion(control, 'Pressed').whileIn.map((row) => row.name), ['pressedLoop']);
  assert.deepEqual(stateMotion(control, 'Pressed').entering, [], 'a loop is not an Entering animation');

  let clock = 0;
  const player = createKeyframePlayer({ now: () => clock });
  const playing = (session) => {
    clock += 100;
    return [...player.next(runtimeOf(control, session), {}).parts.values()].flat().length > 0;
  };
  assert.equal(playing({}), false);
  assert.equal(playing({ hover: true, pressed: true }), true, 'pressed: it loops');
  assert.equal(playing({ hover: true, pressed: true }), true, 'and keeps looping');
  assert.equal(playing({ hover: true }), false, 'released: it stops');
});

test('a slot reads the states as the tab writes them, whatever the case of the state\'s key', () => {
  const control = knob();
  apply(control, newMotionPatch(control, 'hover', 'entering').patch);
  assert.equal(stateMotion(control, 'Hover').entering.length, 1);
  assert.equal(stateMotion(control, 'HOVER').entering.length, 1);
  assert.equal(stateMotion(control, 'Pressed').entering.length, 0, 'and only on its own state');
});

test('the Events row: a gesture\'s animation plays when it is requested, and at no other time', () => {
  const control = knob();
  assert.deepEqual(MOTION_EVENTS.map((event) => event.id), ['click', 'doubleClick', 'longPress', 'flick', 'wheelUp', 'wheelDown']);
  const { name, patch } = newEventPatch(control, 'doubleClick');
  assert.equal(name, 'onDoubleClick');
  apply(control, patch);
  assert.deepEqual(eventMotion(control).doubleClick.map((row) => row.name), ['onDoubleClick']);
  assert.deepEqual(eventMotion(control).click, []);

  let clock = 0;
  const player = createKeyframePlayer({ now: () => clock });
  const frame = (session, plays = {}) => { clock += 100; return player.next(runtimeOf(control, session), { plays }); };
  assert.deepEqual(frame({}).fired, []);
  assert.deepEqual(frame({ hover: true, pressed: true }).fired, [], 'a state change does not play it');
  assert.deepEqual(frame({ hover: true }, { [name]: 1 }).fired, [name], 'a request does');

  const flick = newEventPatch(control, 'flick');
  assert.deepEqual(flick.patch[`Animations.${flick.name}`].trigger, { type: 'event', event: 'flick', direction: 'any', speed: 600 });
  const hold = newEventPatch(control, 'longPress');
  assert.equal(hold.patch[`Animations.${hold.name}`].trigger.hold, 500);
  assert.equal(newEventPatch(control, 'sneeze'), null);
});

test('a leaving animation is its own rule: it never clashes with the entering one, and two leaving ones do', async () => {
  const { findClashes, readAnimations, triggerSummary } = await import('../src/CE_Application/utils/animationModel.js');
  const control = knob();
  apply(control, newMotionPatch(control, 'Hover', 'entering').patch);
  apply(control, newMotionPatch(control, 'Hover', 'leaving').patch);
  const parts = Object.keys(control._children.Parts._children);
  assert.deepEqual(findClashes(readAnimations(control), parts), [], 'same part and property, different changes');
  apply(control, newMotionPatch(control, 'Hover', 'leaving').patch);
  const clashes = findClashes(readAnimations(control), parts);
  assert.equal(clashes.length, 1);
  assert.match(clashes[0].why, /leaving hover/);
  assert.equal(triggerSummary(readAnimations(control).find((row) => row.name === 'hoverLeave')), 'leaving hover');
});

// The section itself, rendered: the three slots for the state being edited, each with what fills it,
// and the Events row with all six gestures. Rendered on the server, so it holds the markup, not the
// clicks; the writes the buttons make are the patches tested above.
test('the States tab shows each slot with what fills it, and the six gestures', async () => {
  const { render } = await import('svelte/server');
  const { default: StateMotionSection } = await import('../src/CE_Application/sections/StateMotionSection.svelte');
  const control = knob();
  apply(control, newMotionPatch(control, 'Hover', 'entering').patch);
  apply(control, newMotionPatch(control, 'Hover', 'whileIn').patch);
  apply(control, newEventPatch(control, 'click').patch);

  const { body } = render(StateMotionSection, { props: { control, stateName: 'Hover' } });
  const slot = (name) => body.match(new RegExp(`data-slot="${name}"[\\s\\S]*?</div>`))?.[0] ?? '';
  assert.match(slot('entering'), /hoverEnter/);
  assert.match(slot('whileIn'), /hoverLoop/);
  assert.match(slot('leaving'), /Entering, played back/, 'Leaving offers play-back while there is an Entering transition');
  for (const event of MOTION_EVENTS) assert.match(body, new RegExp(`data-event="${event.id}"`), event.id);
  assert.match(body.match(/data-event="click"[\s\S]*?<\/div>/)[0], /onClick/);

  const baseOnly = render(StateMotionSection, { props: { control, stateName: '' } }).body;
  assert.doesNotMatch(baseOnly, /data-slot=/, 'Base has no slots: it is not a state');
  assert.match(baseOnly, /data-event="flick"/, 'but the gestures belong to the control and are shown');
});

test('names never collide with what is already there', () => {
  const control = knob();
  apply(control, newMotionPatch(control, 'Hover', 'entering').patch);
  assert.equal(newMotionPatch(control, 'Hover', 'entering').name, 'hoverEnter2');
});
