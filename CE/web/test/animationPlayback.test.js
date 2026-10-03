// animationPlayback.test.js — the plan the Animation tab's stage plays.
//
// Play drives a preview session of the stage's own through an animation's trigger. These pin the
// plan, and then run it through the REAL runtime and tracker, because a plan that sets the right
// flags and still makes the wrong animation fire is the failure that matters.

import test from 'node:test';
import assert from 'node:assert/strict';

import { playbackPlan, statePatch, valuePatch, ruleValues, REST_SESSION, LEAD_MS, TAIL_MS } from '../src/CE_Application/utils/animationPlayback.js';
import { createCustomComponentStarterPatch } from '../src/CE_Application/utils/customComponentFactory.js';
import { readAnimations } from '../src/CE_Application/utils/animationModel.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { createTransitionTracker } from '../src/CE_Application/utils/transitionSelection.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

const row = (control, name) => readAnimations(control).find((entry) => entry.name === name);

function withHoverIn(control) {
  control._children.Animations._children.hoverIn = {
    _type: 'Animation', name: 'hoverIn', enabled: true, kind: 'transition',
    trigger: { type: 'stateChange', from: ['*'], to: ['hover'] },
    targets: [{ path: 'Transform.scale', properties: ['transform'] }],
    duration: 200, delay: 0, easing: 'outQuad',
  };
  return control;
}

/** Play a plan through the runtime and tracker, and say which animations fired at each step. */
function fired(control, plan) {
  const clock = { t: 0 };
  const tracker = createTransitionTracker({ now: () => clock.t });
  tracker.next(resolveInteractiveControl(control, REST_SESSION).runtime);
  return plan.steps.map((step) => {
    clock.t += 1000;
    return tracker.next(resolveInteractiveControl(control, step.session).runtime).fired;
  });
}

test('a state is entered by making its condition true', () => {
  const range = createControl('Range');
  assert.deepEqual(statePatch(range, 'Pressed'), { patch: { pressed: true }, exact: true, name: 'pressed' });
  assert.deepEqual(statePatch(range, 'activehigh').patch, { activeHandle: 'end' });
  assert.deepEqual(statePatch(range, 'default'), { patch: {}, exact: true, name: 'default' });
  assert.equal(statePatch(range, 'nosuch'), null);
});

test('a condition the preview session cannot hold is reported as inexact, not dropped', () => {
  const range = createControl('Range');
  range._children.States._children.Loud = { _type: 'State', name: 'Loud', enabled: true, when: { hover: true, level: 'high' }, rule: 'level > 0.5', patches: {} };
  const loud = statePatch(range, 'loud');
  assert.deepEqual(loud.patch, { hover: true });
  assert.equal(loud.exact, false);
});

test('"from * to pressed" plays from hover, as a real press does, then presses, then lets go', () => {
  const range = createControl('Range');
  const plan = playbackPlan(range, row(range, 'pressIn'));
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.steps.map((step) => step.label), ['hover', 'pressed', 'hover again']);
  assert.equal(plan.steps[0].session.hover, true);
  assert.equal(plan.steps[0].session.pressed, false);
  assert.equal(plan.steps[1].session.pressed, true);
  assert.deepEqual(plan.steps.map((step) => step.hold), [LEAD_MS, 90 + TAIL_MS, 90 + TAIL_MS]);
});

test('and through the real runtime, only the press animation fires — not a hover one beside it', () => {
  // Pressing from rest would enter hover in the same frame, and hoverIn would tie with pressIn.
  const range = withHoverIn(createControl('Range'));
  const plan = playbackPlan(range, row(range, 'pressIn'));
  assert.deepEqual(fired(range, plan), [['hoverIn'], ['pressIn'], ['pressIn']]);
});

test('playing hoverIn starts from rest and comes back', () => {
  const range = withHoverIn(createControl('Range'));
  const plan = playbackPlan(range, row(range, 'hoverIn'));
  assert.deepEqual(plan.steps.map((step) => step.label), ['default', 'hover', 'default again']);
  assert.deepEqual(fired(range, plan), [[], ['hoverIn'], ['hoverIn']]);
});

test('an animation that does not play in reverse has no way back in its plan', () => {
  const range = createControl('Range');
  range._children.Animations._children.pressIn.trigger.reverse = false;
  assert.equal(playbackPlan(range, row(range, 'pressIn')).steps.length, 2);
});

test('slow motion stretches the holds with the animation', () => {
  const range = createControl('Range');
  const plan = playbackPlan(range, row(range, 'pressIn'), { timeScale: 4 });
  assert.equal(plan.steps[1].hold, 360 + TAIL_MS);
});

test('a value animation sweeps the value, and its origin decides whether the pointer is on it', () => {
  const knob = createControl('Knob');
  const plan = playbackPlan(knob, row(knob, 'pointerSlide'));
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.steps.map((step) => step.label), ['low', 'high', 'low again']);
  assert.ok(plan.steps[1].session.valueOverride > plan.steps[0].session.valueOverride);
  assert.equal(plan.steps[1].session.hover, false, 'any origin plays as a change from outside');
  // The first step moves the value off the control's default too, so it may glide as well.
  assert.deepEqual(fired(knob, plan).slice(1), [['pointerSlide', 'rangeSlide'], ['pointerSlide', 'rangeSlide']]);

  knob._children.Animations._children.pointerSlide.trigger.origin = 'user';
  const mine = playbackPlan(knob, row(knob, 'pointerSlide'));
  assert.equal(mine.steps[1].session.hover, true, '"mine" is a change made with the pointer on it');
});

test('the value range is the control\'s own', () => {
  const range = createControl('Range');
  const behavior = range._children.Behavior;
  const low = valuePatch(range, 0);
  const high = valuePatch(range, 1);
  assert.equal(low.valueOverrideEnabled, true);
  assert.ok(high.valueOverride > low.valueOverride, `${JSON.stringify(behavior).slice(0, 80)}`);
  assert.equal(valuePatch(createControl('Button'), 0.5), null, 'a button has no value to sweep');
});

test('what Play cannot do, it says', () => {
  const range = createControl('Range');
  const animations = range._children.Animations._children;
  animations.pressIn.trigger.to = ['presed'];
  assert.match(playbackPlan(range, row(range, 'pressIn')).reason, /None of the states/);
  animations.pressIn.trigger = { type: 'valueChange', source: 'channel.cutoff.raw' };
  assert.match(playbackPlan(range, row(range, 'pressIn')).reason, /channel\.cutoff\.raw is not it/);
  const button = createControl('Button');
  button._children.Animations._children.glide = { name: 'glide', trigger: { type: 'valueChange', source: 'value.normalized' }, duration: 100 };
  assert.match(playbackPlan(button, row(button, 'glide')).reason, /cannot set this control's value/);
  assert.equal(playbackPlan(null, null).ok, false);
});

// --- Keyframe animations (phase 4) ---------------------------------------------------------------

function withKeyframes(control, trigger, extra = {}) {
  control._children.Animations._children.pulse = {
    _type: 'Animation', name: 'pulse', enabled: true, kind: 'keyframes', trigger,
    targets: [{ path: 'Transform' }], duration: 500, delay: 0, easing: 'linear',
    frames: [{ at: 0, scale: 1 }, { at: 0.5, scale: 1.1 }, { at: 1, scale: 1 }], ...extra,
  };
  return control;
}

test('a keyframe animation that plays all the time has nothing for Play to do, and says so', () => {
  const range = withKeyframes(createControl('Range'), { type: 'always' });
  const plan = playbackPlan(range, row(range, 'pulse'));
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /already playing/);
});

test('a beat or script keyframe animation is played by asking for it', () => {
  for (const type of ['beat', 'script']) {
    const range = withKeyframes(createControl('Range'), { type });
    assert.deepEqual(playbackPlan(range, row(range, 'pulse')), { ok: true, request: true, steps: [], exact: true, note: '' }, type);
  }
});

test('a looping state keyframe animation is shown for two cycles, then the stage goes back', () => {
  const range = withKeyframes(createControl('Range'), { type: 'stateChange', to: ['hover'] });
  const plan = playbackPlan(range, row(range, 'pulse'));
  assert.deepEqual(plan.steps.map((step) => step.label), ['default', 'hover', 'default again']);
  assert.equal(plan.steps[1].hold, 1000 + TAIL_MS, 'two 500ms cycles');
  assert.equal(plan.steps[2].hold, TAIL_MS, 'nothing plays on the way back');
});

test('a one-shot keyframe animation is held for all its repeats', () => {
  const range = withKeyframes(createControl('Range'), { type: 'stateChange', to: ['pressed'] }, { iterations: 3, delay: 100 });
  const plan = playbackPlan(range, row(range, 'pulse'), { timeScale: 2 });
  assert.equal(plan.steps[1].hold, (100 + 500 * 3) * 2 + TAIL_MS);
});

// --- A state the control's own value channels decide ---------------------------------------------
// Found by running the app: the status lamp's glow is on LampOn, whose rule is `active >= 1` over a
// value channel, and Play could only report it could not get there.

function starter(id) {
  const control = createControl('CustomComponent');
  for (const [dotPath, value] of Object.entries(createCustomComponentStarterPatch(id))) {
    const parts = dotPath.split('.');
    if (parts.length === 1) { control._children[parts[0]] = value; continue; }
    const field = parts.pop();
    let node = control._children;
    for (const key of parts) node = node?.[key]?._children ?? node?.[key];
    if (node && typeof node === 'object') node[field] = value;
  }
  return control;
}

test('a rule over a value channel is met by setting the channel', () => {
  const lamp = starter('starter.statusLamp');
  assert.deepEqual(ruleValues(lamp, 'active >= 1'), { active: true });
  assert.equal(ruleValues(lamp, 'nosuchchannel > 0'), null, 'a rule that names no channel the control has');
  assert.equal(ruleValues(lamp, 'active >= 5'), null, 'or one nothing obvious satisfies');
  const lampOn = statePatch(lamp, 'lampon');
  assert.deepEqual(lampOn, { patch: { customValues: { active: true } }, exact: true, name: 'lampon' });
});

test('the status lamp\'s glow plays on the stage: lit for the change, back to its own value either side', () => {
  const lamp = starter('starter.statusLamp');
  const plan = playbackPlan(lamp, row(lamp, 'lampGlow'));
  assert.equal(plan.ok, true);
  assert.equal(plan.exact, true, plan.note);
  const own = plan.steps[0].session.customValues;
  assert.deepEqual(plan.steps.map((step) => step.session.customValues), [own, { active: true }, own]);
  assert.notEqual(own.active, true, 'the channel\'s own value, which leaves the lamp off');
  // And through the real runtime: the To step is LampOn, and lampGlow is what fires.
  const states = plan.steps.map((step) => resolveInteractiveControl(lamp, step.session).runtime.activeStates.map((name) => name.toLowerCase()));
  assert.ok(states[1].includes('lampon'), JSON.stringify(states));
  assert.ok(!states[0].includes('lampon') && !states[2].includes('lampon'));
  assert.deepEqual(fired(lamp, plan), [[], ['lampGlow'], ['lampGlow']]);
});
