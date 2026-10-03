// transitionSelection.test.js — which animation plays, given what just changed.
//
// For the first year of the app the runtime read no trigger at all: every animation's timing went
// onto every change of the properties it targets, the last one in the document winning. These
// tests pin the rules that replaced that, one per rule in the header of
// utils/transitionSelection.js, plus the default controls end to end through the REAL runtime —
// because a rule that is right on a hand-built catalog and wrong on a shipped Button is the bug.
//
// Time is injected. A test that waits on a real clock to see whether a transition is "still in
// flight" is a flaky test.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeChange,
  matchStrength,
  selectTransitions,
  selectionToTransitions,
  createTransitionTracker,
  catalogKey,
} from '../src/CE_Application/utils/transitionSelection.js';
import { readTrigger, resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

// --- A hand-built catalog ---------------------------------------------------------------------

function entry(name, trigger, { root = [], parts = {}, css = `${name} timing`, span = 100 } = {}) {
  return {
    name,
    order: 0,
    css,
    span,
    trigger: readTrigger({ trigger }),
    root: new Set(root),
    parts: new Map(Object.entries(parts).map(([part, buckets]) => [part, new Set(buckets)])),
  };
}

const catalogOf = (...entries) => ({ enabled: true, reducedMotion: false, entries, rootTransitions: new Map(), partTransitions: new Map() });

/** A tracker over a fixed catalog, driven by (states, signals) pairs, on a clock the test owns. */
function rig(catalog) {
  const clock = { t: 0 };
  const tracker = createTransitionTracker({ now: () => clock.t });
  const step = (states, signals = {}, options = {}) => tracker.next({ activeStates: states, signals, transitions: catalog }, options);
  return { clock, tracker, step };
}

const hoverIn = () => entry('hoverIn', { type: 'stateChange', from: ['*'], to: ['hover'] }, { root: ['transform'], span: 120 });
const pressIn = () => entry('pressIn', { type: 'stateChange', from: ['*'], to: ['pressed'] }, { root: ['transform'], span: 80 });
const glide = (extra = {}) => entry('glide', { type: 'valueChange', source: 'value.normalized', ...extra }, { parts: { pointer: ['transform'] }, span: 140 });

// --- What changed -----------------------------------------------------------------------------

test('a change is the states entered and the states left, and no states is "default"', () => {
  const change = describeChange({ activeStates: [], signals: {} }, { activeStates: ['Hover'], signals: {} });
  assert.equal(change.stateChanged, true);
  assert.deepEqual([...change.entered], ['hover'], 'state names compare lower-cased, as triggers write them');
  assert.deepEqual([...change.exited], ['default']);
  assert.deepEqual([...change.before], ['default']);
  const first = describeChange(null, { activeStates: ['Hover'], signals: {} });
  assert.equal(first.first, true);
  assert.equal(first.stateChanged, false, 'the first frame has nothing before it, so nothing changed');
});

test('a value change is read through the same reader a binding uses', () => {
  const change = describeChange({ activeStates: [], signals: { valueNormalized: 0.2 } }, { activeStates: [], signals: { valueNormalized: 0.7 } });
  assert.equal(change.changedSource('value.normalized'), true);
  assert.equal(change.changedSource('value.raw'), false);
});

// --- Rule 1: state changes, forward and reverse -----------------------------------------------

test('hover then press then release then leave: each animation plays its own change', () => {
  const { step } = rig(catalogOf(hoverIn(), pressIn()));
  step([]);
  const hover = step(['Hover']);
  assert.equal(hover.rootTransitions.get('transform'), 'hoverIn timing');
  assert.deepEqual(hover.fired, ['hoverIn']);

  const press = step(['Hover', 'Pressed']);
  assert.equal(press.rootTransitions.get('transform'), 'pressIn timing',
    'the press is 80ms and the hover 120ms, and before triggers were read they could never differ');
  assert.deepEqual(press.fired, ['pressIn']);

  const release = step(['Hover']);
  assert.equal(release.rootTransitions.get('transform'), 'pressIn timing', 'leaving pressed plays pressIn backwards');
  assert.deepEqual(release.fired, ['pressIn']);

  const leave = step([]);
  assert.equal(leave.rootTransitions.get('transform'), 'hoverIn timing');
});

test('"from * to pressed" does not play when the pointer merely arrives', () => {
  const { step, clock } = rig(catalogOf(pressIn()));
  step([]);
  clock.t = 1000;
  const hover = step(['Hover']);
  assert.equal(hover.rootTransitions.size, 0, 'no match on a state change means the property snaps');
  assert.deepEqual(hover.fired, []);
});

test('reverse: false keeps an animation to the way in', () => {
  const oneWay = entry('in', { type: 'stateChange', to: ['hover'], reverse: false }, { root: ['opacity'] });
  const { step, clock } = rig(catalogOf(oneWay));
  step([]);
  assert.equal(step(['Hover']).rootTransitions.get('opacity'), 'in timing');
  clock.t = 1000;
  assert.equal(step([]).rootTransitions.size, 0);
});

test('From is checked against the frame before, and "default" means nothing was active', () => {
  const fromRest = entry('fromRest', { type: 'stateChange', from: ['default'], to: ['pressed'] }, { root: ['transform'] });
  const { step, clock } = rig(catalogOf(fromRest));
  step([]);
  assert.equal(step(['Pressed']).rootTransitions.get('transform'), 'fromRest timing', 'pressed straight from rest');
  clock.t = 1000;
  step(['Hover']);
  clock.t = 2000;
  assert.equal(step(['Hover', 'Pressed']).rootTransitions.size, 0, 'pressed from hover is not from default');
});

test('a forward match on a named state outranks *, which outranks a value change, which outranks reverse', () => {
  const named = entry('named', { type: 'stateChange', to: ['pressed'] }, { root: ['transform'] });
  const any = entry('any', { type: 'stateChange', to: ['*'] }, { root: ['transform'] });
  const value = entry('value', { type: 'valueChange', source: 'value.normalized' }, { root: ['transform'] });
  const leaving = entry('leaving', { type: 'stateChange', to: ['hover'] }, { root: ['transform'] });
  // Listed weakest-last so a "later wins" mistake would show.
  const catalog = catalogOf(named, any, value, leaving);
  const before = { activeStates: ['Hover'], signals: { valueNormalized: 0 } };
  const after = { activeStates: ['Pressed'], signals: { valueNormalized: 1 } };
  const change = describeChange(before, after);
  assert.equal(matchStrength(named, change, after.signals), 4);
  assert.equal(matchStrength(any, change, after.signals), 3);
  assert.equal(matchStrength(value, change, after.signals), 2);
  assert.equal(matchStrength(leaving, change, after.signals), 1);
  const picked = selectTransitions(catalog, change, { signals: after.signals });
  assert.equal(picked.root.get('transform').name, 'named');
});

// --- Rule 2: value changes, and where they came from --------------------------------------------

test('a value trigger answers its own source only', () => {
  const { step } = rig(catalogOf(glide()));
  step([], { valueNormalized: 0 });
  const moved = step([], { valueNormalized: 0.5 });
  assert.equal(moved.partTransitions.get('pointer').transform, 'glide timing');
  assert.deepEqual(moved.fired, ['glide']);
});

test('origin "user" plays only while the person is on the control, "external" only when not', () => {
  for (const [origin, signals, plays] of [
    ['user', { hover: true }, true],
    ['user', {}, false],
    ['external', {}, true],
    ['external', { focused: true }, false],
    ['any', { pressed: true }, true],
  ]) {
    const { step } = rig(catalogOf(glide({ origin })));
    step([], { ...signals, valueNormalized: 0 });
    const moved = step([], { ...signals, valueNormalized: 1 });
    assert.equal(moved.partTransitions.has('pointer'), plays, `${origin} with ${JSON.stringify(signals)}`);
  }
});

// --- Rule 3: what a property keeps when nothing matches -----------------------------------------

test('a transition still in flight survives a state change that does not match it', () => {
  // Pressing a knob enters Pressed and, a moment later, Dragging. Clearing the press's transition
  // in between would make CSS jump the property to its end.
  const { step, clock } = rig(catalogOf(pressIn()));
  step([]);
  clock.t = 0;
  step(['Pressed']);
  clock.t = 30;
  assert.equal(step(['Pressed', 'Dragging']).rootTransitions.get('transform'), 'pressIn timing', '30ms into an 80ms press');
  clock.t = 500;
  assert.equal(step(['Pressed']).rootTransitions.size, 0, 'long finished, so the next unmatched change snaps');
});

test('a value-only change keeps everything, finished or not', () => {
  const { step, clock } = rig(catalogOf(hoverIn(), glide()));
  step([], { valueNormalized: 0 });
  step(['Hover'], { valueNormalized: 0 });
  clock.t = 10_000;
  const turned = step(['Hover'], { valueNormalized: 0.4 });
  assert.equal(turned.rootTransitions.get('transform'), 'hoverIn timing');
  assert.equal(turned.partTransitions.get('pointer').transform, 'glide timing');
});

test('a re-render with nothing new hands back the same transitions, untouched', () => {
  const { step } = rig(catalogOf(hoverIn()));
  step([]);
  const hover = step(['Hover'], { valueNormalized: 0.1 });
  const again = step(['Hover'], { valueNormalized: 0.1, somethingElse: 3 });
  assert.equal(again.rootTransitions, hover.rootTransitions, 'the same Map, so nothing downstream restyles');
  assert.deepEqual(again.fired, []);
});

test('an edit made while a pick is held reaches it: new timing, or let go', () => {
  // Editing hoverIn's duration in the Animation tab while the pointer rests on the control used to
  // leave the old timing in place until the next state change.
  const catalog = catalogOf(hoverIn());
  const { step, clock } = rig(catalog);
  step([]);
  step(['Hover']);
  clock.t = 5000;
  catalog.entries = [{ ...catalog.entries[0], css: 'hoverIn slower' }];
  assert.equal(step(['Hover']).rootTransitions.get('transform'), 'hoverIn slower');
  catalog.entries = [];
  assert.equal(step(['Hover']).rootTransitions.size, 0, 'deleted or switched off: it lets go');
});

// --- Rule 4: dragging -------------------------------------------------------------------------

test('while dragging, value animations are dropped — including one an earlier frame chose', () => {
  const { step } = rig(catalogOf(glide()));
  step([], { valueNormalized: 0 });
  assert.ok(step([], { valueNormalized: 0.3 }).partTransitions.has('pointer'), 'a MIDI-style change glides');
  const grabbed = step(['Pressed', 'Dragging'], { valueNormalized: 0.3, pressed: true, dragging: true });
  assert.equal(grabbed.partTransitions.has('pointer'), false, 'a pointer 140ms behind the mouse is lag');
  const dragged = step(['Pressed', 'Dragging'], { valueNormalized: 0.8, pressed: true, dragging: true });
  assert.equal(dragged.partTransitions.has('pointer'), false);
  assert.deepEqual(dragged.fired, [], 'and a dropped animation did not fire');
});

// --- Rule 5: reduced motion -------------------------------------------------------------------

test('reduced motion, from the operating system or the preview switch, stops everything', () => {
  const { step } = rig(catalogOf(hoverIn()));
  step([]);
  assert.equal(step(['Hover'], {}, { reducedMotion: true }).rootTransitions.size, 0, 'the OS setting');

  const switched = catalogOf(hoverIn());
  switched.reducedMotion = true;
  const second = rig(switched);
  second.step([]);
  assert.equal(second.step(['Hover']).rootTransitions.size, 0, 'the preview switch, carried by the catalog');
});

test('turning reduced motion on mid-hover takes effect at once, not on the next change', () => {
  // The frame where the switch flips changes nothing an animation listens to, and the tracker's
  // "nothing new, keep what you had" shortcut used to hand the hover's transition straight back.
  const catalog = catalogOf(hoverIn());
  const { step } = rig(catalog);
  step([]);
  assert.equal(step(['Hover']).rootTransitions.size, 1);
  catalog.reducedMotion = true;
  assert.equal(step(['Hover']).rootTransitions.size, 0, 'the preview switch');
  catalog.reducedMotion = false;
  step(['Hover']);
  assert.equal(step(['Hover'], {}, { reducedMotion: true }).rootTransitions.size, 0, 'the OS setting');
});

// --- Rule 6: ties ------------------------------------------------------------------------------

test('a tie goes to the animation later in the document', () => {
  const first = entry('first', { type: 'stateChange', to: ['hover'] }, { root: ['opacity'] });
  const second = entry('second', { type: 'stateChange', to: ['hover'] }, { root: ['opacity'] });
  const { step } = rig(catalogOf(first, second));
  step([]);
  const hover = step(['Hover']);
  assert.equal(hover.rootTransitions.get('opacity'), 'second timing');
  assert.deepEqual(hover.fired, ['first', 'second'], 'both caught the change; one won the property');
});

// --- Shapes -------------------------------------------------------------------------------------

test('the selection comes out in the shape the renderers read', () => {
  const selection = {
    root: new Map([['colour', { css: 'c' }]]),
    parts: new Map([['knob', new Map([['transform', { css: 't' }]])], ['empty', new Map()]]),
  };
  const out = selectionToTransitions(selection);
  assert.equal(out.rootTransitions.get('colour'), 'c');
  assert.deepEqual(out.partTransitions.get('knob'), { transform: 't', opacity: null, size: null, colour: null });
  assert.equal(out.partTransitions.has('empty'), false);
});

test('the catalog key moves with anything that changes a selection, and only that', () => {
  const a = catalogOf(hoverIn());
  const b = catalogOf(hoverIn());
  assert.equal(catalogKey(a), catalogKey(b));
  b.entries[0] = { ...b.entries[0], css: 'other' };
  assert.notEqual(catalogKey(a), catalogKey(b));
  const c = catalogOf(hoverIn());
  c.entries[0] = { ...c.entries[0], trigger: readTrigger({ trigger: { type: 'stateChange', to: ['hover'], reverse: false } }) };
  assert.notEqual(catalogKey(a), catalogKey(c));
});

// --- The shipped controls, through the real runtime ---------------------------------------------

function realRig(type) {
  const control = createControl(type);
  const clock = { t: 0 };
  const tracker = createTransitionTracker({ now: () => clock.t });
  const step = (session) => tracker.next(resolveInteractiveControl(control, session).runtime);
  return { control, clock, step };
}

test('a default Range presses in 90ms, and a hover animation added beside it keeps its own timing', () => {
  // The case the audit led with: two animations on one property, one for hover and one for press.
  // Before triggers were read, both changes got whichever timing came last in the document.
  const { step, control } = realRig('Range');
  const animations = control._children.Animations._children;
  assert.equal(animations.pressIn.duration, 90);
  animations.hoverIn = {
    _type: 'Animation', name: 'hoverIn', enabled: true, kind: 'transition',
    trigger: { type: 'stateChange', from: ['*'], to: ['hover'] },
    targets: [{ path: 'Transform.scale', properties: ['transform'] }],
    duration: 200, delay: 0, easing: 'outQuad',
  };
  step({});
  const hover = step({ hover: true });
  assert.match(hover.rootTransitions.get('transform'), /^200ms /, 'hover plays hoverIn');
  const press = step({ hover: true, pressed: true });
  assert.match(press.rootTransitions.get('transform'), /^90ms /, 'press plays pressIn, though hoverIn is later in the list');
  assert.deepEqual(press.fired, ['pressIn']);
});

test('a default Knob: a value from outside glides its pointer, a drag does not', () => {
  const { step, clock } = realRig('Knob');
  step({ valueOverrideEnabled: true, valueOverride: 0.1 });
  clock.t = 1000;
  const midi = step({ valueOverrideEnabled: true, valueOverride: 0.9 });
  assert.match(midi.partTransitions.get('pointerCurrent')?.transform ?? '', /^140ms /, 'pointerSlide, 140ms');
  assert.deepEqual(midi.fired.sort(), ['pointerSlide', 'rangeSlide']);

  clock.t = 2000;
  const grab = step({ valueOverrideEnabled: true, valueOverride: 0.9, hover: true, pressed: true, dragging: true });
  assert.equal(grab.partTransitions.get('pointerCurrent')?.transform ?? null, null);
  const drag = step({ valueOverrideEnabled: true, valueOverride: 0.4, hover: true, pressed: true, dragging: true });
  assert.equal(drag.partTransitions.get('pointerCurrent')?.transform ?? null, null, 'the pointer tracks the mouse');
});

test('the Animations switch and the preview switch both turn a control off', () => {
  const { step, control } = realRig('Range');
  control._children.Animations.enabled = false;
  step({});
  assert.equal(step({ pressed: true }).rootTransitions.size, 0);
  control._children.Animations.enabled = true;
  step({});
  assert.equal(step({ pressed: true }).rootTransitions.size, 1, 'on again');
  step({ animationsEnabled: false });
  assert.equal(step({ pressed: false, animationsEnabled: false }).rootTransitions.size, 0);
  assert.equal(step({ pressed: true, animationsEnabled: false }).rootTransitions.size, 0);
});
