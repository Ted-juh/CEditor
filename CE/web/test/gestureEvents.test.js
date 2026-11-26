// Gestures with no duration on one control (utils/gestureEvents.js): what a press was, and which of
// the control's Events-row animations it plays. The surfaces call these with real pointer events;
// here the times and positions are handed in, so every rule is checked without a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { animationPlays } from '../src/CE_Application/stores/animationActivity.js';
import { newEventPatch } from '../src/CE_Application/utils/stateMotion.js';
import {
  animationsForGesture,
  createPressTracker,
  flickDirection,
  isFlick,
  leastFlickSpeed,
  longPressHolds,
  playGesture,
} from '../src/CE_Application/utils/gestureEvents.js';

function withEvent(control, eventId, trigger = {}) {
  const made = newEventPatch(control, eventId);
  for (const [path, node] of Object.entries(made.patch)) {
    setNestedValue(control, path, { ...node, trigger: { ...node.trigger, ...trigger } });
  }
  return made.name;
}

test('a press that stays put is a click; one that moves is a drag, and a fast release is a flick', () => {
  const press = createPressTracker();
  press.down(0, 100, 100);
  press.move(50, 102, 101);
  assert.equal(press.stillHeld(), true, 'two pixels is still a click');
  assert.deepEqual({ ...press.up(120, 102, 101), speed: undefined }, { click: true, moved: false, held: 120, speed: undefined, direction: 'right', vx: 0, vy: 0 });

  press.down(0, 100, 100);
  press.move(40, 100, 80);
  assert.equal(press.stillHeld(), false, 'twenty pixels is a drag');
  const slow = press.up(1000, 100, 79);
  assert.equal(slow.click, false);
  assert.ok(!isFlick(slow), `a drag that ends still is not a flick (${Math.round(slow.speed)} px/s)`);

  press.down(0, 100, 200);
  press.move(20, 100, 180);
  press.move(40, 100, 150);
  const fast = press.up(60, 100, 120);
  assert.equal(fast.direction, 'up');
  assert.ok(isFlick(fast), `80 px in 60 ms is a flick (${Math.round(fast.speed)} px/s)`);
  assert.equal(fast.vx, 0);
  assert.ok(Math.abs(fast.vy - -80 / 60) < 1e-9, `and its speed each way, in px a millisecond, for a scene a drag throws (${fast.vy})`);

  assert.equal(press.up(10, 0, 0), null, 'an up with no down is nothing');
  press.down(0, 0, 0);
  assert.equal(press.up(10, 0, 0, { inside: false }).click, false, 'released off the control: not a click');
});

test('a flick\'s direction is its larger axis, screen-wise', () => {
  assert.equal(flickDirection(-30, 5), 'left');
  assert.equal(flickDirection(30, -5), 'right');
  assert.equal(flickDirection(5, -30), 'up');
  assert.equal(flickDirection(-5, 30), 'down');
});

test('each gesture plays the control\'s own Events-row animations, and only those', () => {
  const control = createControl('Knob', { Core: { id: 'gk1', name: 'Knob01' } });
  const click = withEvent(control, 'click');
  const up = withEvent(control, 'flick', { direction: 'up', speed: 800 });
  const anyFlick = withEvent(control, 'flick');
  const quickHold = withEvent(control, 'longPress', { hold: 300 });
  const plainHold = withEvent(control, 'longPress');

  assert.deepEqual(animationsForGesture(control, 'click'), [click]);
  assert.deepEqual(animationsForGesture(control, 'doubleClick'), []);
  assert.deepEqual(animationsForGesture(control, 'flick', { moved: true, direction: 'up', speed: 900 }).sort(), [anyFlick, up].sort());
  assert.deepEqual(animationsForGesture(control, 'flick', { moved: true, direction: 'up', speed: 700 }), [anyFlick], 'slower than the up flick asks');
  assert.deepEqual(animationsForGesture(control, 'flick', { moved: true, direction: 'left', speed: 2000 }), [anyFlick]);
  assert.deepEqual(longPressHolds(control), [300, 500], 'each hold is waited for once');
  assert.deepEqual(animationsForGesture(control, 'longPress', { hold: 300 }), [quickHold]);
  assert.deepEqual(animationsForGesture(control, 'longPress', { hold: 500 }), [plainHold]);
  assert.equal(leastFlickSpeed(control), 600);

  // A switched-off animation is not played.
  setNestedValue(control, `Animations.${click}.enabled`, false);
  assert.deepEqual(animationsForGesture(control, 'click'), []);
});

test('a gesture plays a value effect and words thrown too, as the Animation tab offers them (2026-11-26)', () => {
  const control = createControl('Slider', { Core: { id: 'gs1', name: 'Fader' } });
  const animations = control._children.Animations._children;
  animations.throw = { _type: 'Animation', name: 'throw', enabled: true, kind: 'value', trigger: { type: 'event', event: 'flick' },
    targets: [{ path: 'Value' }], frames: [{ at: 0 }, { at: 0.3, by: 0.12 }, { at: 1 }], duration: 800 };
  animations.told = { _type: 'Animation', name: 'told', enabled: true, kind: 'emit', trigger: { type: 'event', event: 'click' },
    targets: [], shows: 'value', duration: 700 };
  assert.deepEqual(animationsForGesture(control, 'flick', { moved: true, direction: 'up', speed: 900 }), ['throw'], 'the Slider\'s Throw');
  assert.deepEqual(animationsForGesture(control, 'click'), ['told']);
});

test('playing a gesture is the same request ce.anim.play makes', () => {
  const control = createControl('Knob', { Core: { id: 'gk2', name: 'Knob02' } });
  const name = withEvent(control, 'wheelUp');
  const before = get(animationPlays)?.gk2?.[name];
  assert.deepEqual(playGesture(control, 'wheelUp'), [name]);
  const after = get(animationPlays)?.gk2?.[name];
  assert.notEqual(after, undefined);
  assert.notEqual(after, before, 'a new request each time');
  assert.deepEqual(playGesture(control, 'wheelDown'), []);
  assert.deepEqual(playGesture({}, 'wheelUp'), [], 'a control with no id plays nothing');
});
