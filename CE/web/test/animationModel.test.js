// animationModel.test.js — the Animation tab's working parts.
//
// The headline test runs the REAL animation runtime over every property the editor's dropdown
// offers, and checks that this file's answer matches. That is the whole point of the tab. For its
// first version two of the seven — Fill colour and Text colour — did nothing, because the runtime
// had no colour bucket; the animation overhaul gave it one, and the same test now says all of them
// work. If the runtime ever changes again, this fails rather than the tab keeping a stale answer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ANIMATION_KINDS,
  KEYFRAME_TRIGGER_TYPES,
  KEYFRAME_TRIGGER_LABELS,
  keyframeTargets,
  kindPatch,
  addFrame,
  removeFrame,
  setFrameValue,
  EASING_CHOICES,
  easingPatch,
  cleanSpring,
  moveBezierHandle,
  BEZIER_VIEW,
  SPRING_LIMITS,
  PANEL_EASING_OPTIONS,
  OVERSHOOTING_EASINGS,
  controlStateNames,
  triggerStateChoices,
  unknownTriggerStates,
  toggleTriggerState,
  triggersTie,
  findClashes,
  clashesFor,
  targetCost,
  newAnimationShape,
  cleanAnimationName,
  uniqueAnimationName,
  renameBlockedBecause,
  TRIGGER_TYPES,
  PART_PATHS,
  ROOT_PATHS,
  OFFERED_PROPERTIES,
  EASING_NAMES,
  EASING_BEZIERS,
  targetStatus,
  describeAnimation,
  readAnimations,
  animationsEnabled,
  describeTargets,
  deadTargetCount,
  addTarget,
  removeTarget,
  moveTarget,
  buildTarget,
  easingPoints,
  unofferedEasings,
  allAnimationFieldLabels,
} from '../src/CE_Application/utils/animationModel.js';
import { resolveInteractiveControl, readTrigger } from '../src/CE_Application/utils/interactionRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createCustomComponentPartsDefaults } from '../src/CE_Application/utils/customComponentFactory.js';

/** A control with real parts and one animation carrying the given targets. */
function withAnimation(targets) {
  const control = createControl('CustomComponent');
  control._children.Parts = createCustomComponentPartsDefaults();
  control._children.Animations = {
    _type: 'Animations',
    _children: {
      test: {
        kind: 'transition',
        enabled: true,
        duration: 200,
        delay: 0,
        easing: 'outQuad',
        trigger: { type: 'stateChange', from: ['*'], to: ['hover'] },
        targets,
      },
    },
  };
  return control;
}

const partsOf = (control) => Object.keys(control._children.Parts._children);

/** What the runtime actually builds for a part: the buckets it filled in. */
function runtimeAnimates(control, partName) {
  const { runtime } = resolveInteractiveControl(control, {});
  const bucket = runtime?.transitions?.partTransitions?.get?.(partName) ?? null;
  return bucket ? Object.entries(bucket).filter(([, value]) => value).map(([key]) => key) : [];
}

// --- The headline -----------------------------------------------------------

test('this file agrees with the runtime about every property the editor offers', () => {
  for (const offered of OFFERED_PROPERTIES) {
    const base = createControl('CustomComponent');
    base._children.Parts = createCustomComponentPartsDefaults();
    const part = partsOf(base)[0];
    const target = buildTarget(part, offered);
    const control = withAnimation([target]);

    const said = targetStatus(target, partsOf(control));
    const did = runtimeAnimates(control, part);

    assert.equal(
      said.works,
      did.length > 0,
      `${offered.label}: this file says ${said.works ? 'works' : 'does nothing'}, the runtime ${did.length ? 'animates ' + did.join(', ') : 'does nothing'}`
    );
    if (said.works) assert.ok(did.includes(said.animates), `${offered.label} animates ${did.join(', ')}, not ${said.animates}`);
  }
});

test('and none of them is dead any more — the panel\'s two colour choices work', () => {
  // This used to read "the two dead ones are the two the properties panel offers" and expect
  // ['Fill colour', 'Text colour']. The runtime gained a colour bucket in the animation overhaul,
  // and the CSS names the panel has always written for those two (`background-color`, `color`)
  // now name it, so a control saved from the panel years ago starts animating without an edit.
  const dead = OFFERED_PROPERTIES
    .filter((offered) => !targetStatus(buildTarget('label', offered), ['label']).works)
    .map((offered) => offered.label);
  assert.deepEqual(dead, []);
  for (const label of ['Fill colour', 'Text colour', 'Border colour']) {
    const offered = OFFERED_PROPERTIES.find((entry) => entry.label === label);
    assert.equal(targetStatus(buildTarget('label', offered), ['label']).animates, 'colour', label);
  }
});

test('a dead target says what the runtime does accept', () => {
  // A path no table lists and no hint rescues. It was a colour path until colour started working.
  const status = targetStatus({ path: 'Parts.label.Text.content' }, ['label']);
  assert.equal(status.works, false);
  assert.equal(status.reason, 'dead path');
  assert.match(status.detail, /Layout\.scale/);
  assert.match(status.detail, /Background\.Fill\.colour/, 'and the list it gives includes colour now');
});

// --- The other ways a target can do nothing ---------------------------------

test('a target with no path is reported, not skipped in silence', () => {
  assert.equal(targetStatus({}, ['label']).reason, 'no path');
  assert.equal(targetStatus({ path: '   ' }, ['label']).reason, 'no path');
});

test('a target on a part that does not exist is a different problem', () => {
  const status = targetStatus({ path: 'Parts.typo.Layout.scale', properties: ['transform'] }, ['label', 'body']);
  assert.equal(status.works, false);
  assert.equal(status.reason, 'missing part');
  assert.equal(status.part, 'typo');
  assert.match(status.detail, /no part called "typo"/);
});

test('the runtime really does build a transition for a part that is not there', () => {
  // Which is why the check above is worth having: nothing downstream complains.
  const control = withAnimation([{ path: 'Parts.typo.Layout.scale', properties: ['transform'] }]);
  assert.deepEqual(runtimeAnimates(control, 'typo'), ['transform']);
});

test('size works on a part and does nothing on the control itself', () => {
  assert.equal(targetStatus({ path: 'Parts.label.Layout.width' }, ['label']).works, true);
  const root = targetStatus({ path: 'Transform.width', properties: ['size'] }, ['label']);
  assert.equal(root.works, false);
  assert.equal(root.reason, 'no size at root');
});

test('a target on the control itself works for every path in its table', () => {
  for (const path of Object.keys(ROOT_PATHS)) {
    assert.equal(targetStatus({ path }, []).works, true, `${path} should work`);
  }
  assert.equal(targetStatus({ path: 'Transform.x' }, []).works, false);
});

test('a properties hint works even when the path is not in the table', () => {
  // The runtime's own escape hatch. This test used to end by asserting that a `colour` hint did
  // nothing, with the note that the runtime would need a colour bucket first. It has one now.
  assert.equal(targetStatus({ path: 'Parts.label.Anything', properties: ['transform'] }, ['label']).works, true);
  assert.equal(targetStatus({ path: 'Parts.label.Anything', properties: ['colour'] }, ['label']).works, true);
  assert.equal(targetStatus({ path: 'Parts.label.Anything', properties: ['background-color'] }, ['label']).animates, 'colour');
  assert.equal(targetStatus({ path: 'Parts.label.Anything', properties: ['filter'] }, ['label']).works, false,
    'a hint that names no bucket still rescues nothing');
});

test('every path in the tables maps to a bucket the runtime fills', () => {
  const base = createControl('CustomComponent');
  base._children.Parts = createCustomComponentPartsDefaults();
  const part = partsOf(base)[0];
  for (const [path, bucket] of Object.entries(PART_PATHS)) {
    const control = withAnimation([{ path: `Parts.${part}.${path}` }]);
    assert.ok(runtimeAnimates(control, part).includes(bucket), `${path} should animate ${bucket}`);
  }
});

// --- Reading animations -----------------------------------------------------

test('an animation reads with sensible values when it is half empty', () => {
  const row = describeAnimation('fade', {});
  assert.equal(row.kind, 'transition');
  assert.equal(row.duration, 120);
  assert.equal(row.delay, 0);
  assert.equal(row.easing, 'outQuad');
  assert.equal(row.triggerType, 'stateChange');
  assert.deepEqual(row.targets, []);
  assert.equal(row.enabled, true);
});

test('readAnimations lists them and ignores rubbish', () => {
  const control = withAnimation([]);
  control._children.Animations._children.broken = null;
  control._children.Animations._children.alsoBroken = 'nope';
  assert.deepEqual(readAnimations(control).map((row) => row.name), ['test']);
  assert.deepEqual(readAnimations(null), []);
});

test('the section switch turns everything off', () => {
  const control = withAnimation([]);
  assert.equal(animationsEnabled(control), true);
  control._children.Animations.enabled = false;
  assert.equal(animationsEnabled(control), false);
});

test('describeTargets attaches a status to each one and counts the dead', () => {
  const part = partsOf(withAnimation([]))[0];
  const control = withAnimation([
    { path: `Parts.${part}.Layout.scale`, properties: ['transform'] },
    // Dead until the overhaul; works now, and is kept here so the count shows it.
    { path: `Parts.${part}.Background.Fill.colour`, properties: ['background-color'] },
    { path: `Parts.${part}.Text.content` },
    { path: '' },
  ]);
  const row = readAnimations(control)[0];
  const rows = describeTargets(row, partsOf(control));
  assert.deepEqual(rows.map((entry) => entry.status.works), [true, true, false, false]);
  assert.equal(deadTargetCount(row, partsOf(control)), 2);
});

// --- Editing the list -------------------------------------------------------

test('adding, removing and moving a target all return a new list', () => {
  const list = [{ path: 'a' }, { path: 'b' }, { path: 'c' }];
  assert.deepEqual(addTarget(list, { path: 'd' }).map((t) => t.path), ['a', 'b', 'c', 'd']);
  assert.deepEqual(removeTarget(list, 1).map((t) => t.path), ['a', 'c']);
  assert.deepEqual(moveTarget(list, 2, 0).map((t) => t.path), ['c', 'a', 'b']);
  assert.deepEqual(list.map((t) => t.path), ['a', 'b', 'c'], 'the original must not change');
});

test('the edits cope with nonsense indexes', () => {
  const list = [{ path: 'a' }];
  assert.deepEqual(removeTarget(list, 9), [{ path: 'a' }]);
  assert.deepEqual(removeTarget(list, -1), [{ path: 'a' }]);
  assert.deepEqual(moveTarget(list, 5, 0), [{ path: 'a' }]);
  assert.deepEqual(moveTarget([], 0, 1), []);
});

test('buildTarget writes the same shape the properties panel writes', () => {
  const built = buildTarget('body', OFFERED_PROPERTIES[0]);
  assert.deepEqual(built, { path: 'Parts.body.Layout.scale', properties: ['transform'] });
  assert.equal(buildTarget('body', null), null);
});

// --- Easing -----------------------------------------------------------------

test('the easing curve is the one the runtime hands to CSS', () => {
  for (const name of Object.keys(EASING_BEZIERS)) {
    const points = easingPoints(name, 8);
    assert.equal(points.length, 9);
    assert.ok(Math.abs(points[0].y) < 0.001, `${name} should start at 0`);
    assert.ok(Math.abs(points.at(-1).y - 1) < 0.001, `${name} should end at 1`);
  }
});

test('linear is a straight line', () => {
  const points = easingPoints('linear', 4);
  for (const point of points) assert.ok(Math.abs(point.y - point.x) < 0.001);
});

test('an ease-out really is fast at the start', () => {
  const out = easingPoints('outQuad', 10);
  const linear = easingPoints('linear', 10);
  assert.ok(out[2].y > linear[2].y, 'outQuad should be ahead of linear early on');
});

test('the panel offers four easings and the runtime knows ten', () => {
  // It knew five — the panel's four and inQuad — until the overhaul added inCubic, inOutCubic and
  // the three overshooting "back" curves. The panel's dropdown did not grow; this tab draws them all.
  assert.deepEqual(PANEL_EASING_OPTIONS, ['linear', 'outQuad', 'inOutQuad', 'outCubic']);
  assert.deepEqual(unofferedEasings(), ['inQuad', 'inCubic', 'inOutCubic', 'inBack', 'outBack', 'inOutBack']);
  assert.equal(EASING_NAMES.length, 10);
});

test('the back curves are drawn overshooting, the rest are not', () => {
  for (const name of EASING_NAMES) {
    const ys = easingPoints(name, 48).map((point) => point.y);
    const leaves = ys.some((y) => y < -1e-6 || y > 1 + 1e-6);
    assert.equal(leaves, OVERSHOOTING_EASINGS.includes(name), name);
  }
});

test('a custom bezier and a spring draw their own shape, and an unknown name draws what plays', () => {
  const custom = easingPoints({ easing: 'custom', bezier: [0, 0, 1, 1] }, 4);
  for (const point of custom) assert.ok(Math.abs(point.y - point.x) < 1e-9, 'the identity bezier is a line');

  const spring = easingPoints({ easing: 'spring', spring: { damping: 6, frequency: 12 } }, 40);
  assert.ok(spring.some((point) => point.y > 1), 'a spring overshoots');
  assert.equal(spring.at(-1).y, 1, 'and lands');

  // An unknown name is CSS `ease` to the runtime, so that is the picture — it used to be drawn as
  // a straight line, which is not what anybody would see.
  const unknown = easingPoints('wobbly', 10);
  const ease = easingPoints({ easing: 'custom', bezier: [0.25, 0.1, 0.25, 1] }, 10);
  assert.deepEqual(unknown, ease);
});

// --- Odds and ends ----------------------------------------------------------

test('two animation kinds play: transitions, and keyframes', () => {
  // This said "one animation kind plays; keyframes are not built yet" until phase 4 of the overhaul
  // gave the runtime a keyframe player (utils/keyframeAnimation.js). The transition trigger types
  // are unchanged; keyframes answer three more.
  assert.deepEqual(ANIMATION_KINDS, ['transition', 'keyframes']);
  assert.deepEqual(TRIGGER_TYPES, ['stateChange', 'valueChange']);
  assert.deepEqual(Object.keys(KEYFRAME_TRIGGER_LABELS), KEYFRAME_TRIGGER_TYPES);
});

test('field labels are collected for when the panel rows come out', () => {
  const labels = allAnimationFieldLabels();
  assert.ok(labels.includes('Easing'));
  assert.equal(new Set(labels).size, labels.length);
});

// --- Making and unmaking an animation ---------------------------------------
// Creating one used to stay in the properties panel, which is a gap the moment the panel's rows
// come out. The shape lives in the model so both surfaces make the same thing.

test('a new animation is the shape the properties panel makes', () => {
  const made = newAnimationShape('hoverGlow');
  assert.equal(made.name, 'hoverGlow');
  assert.equal(made.kind, 'transition');
  assert.equal(made.easing, 'outQuad');
  assert.equal(made.duration, 120);
  assert.deepEqual(made.targets, []);
  // `reverse: true` is new and explicit: it is the default either way (a hover lift settles back
  // when the pointer leaves), and the panel's shape without it reads the same.
  assert.deepEqual(made.trigger, { type: 'stateChange', from: ['*'], to: ['hover'], reverse: true });
  assert.deepEqual(readTrigger(made), readTrigger({ trigger: { type: 'stateChange', from: ['*'], to: ['hover'] } }));
  // And it reads back through the tab's own reader without special-casing.
  const described = describeAnimation('hoverGlow', made);
  assert.equal(described.enabled, true);
  assert.equal(described.triggerType, 'stateChange');
});

test('a name is cleaned to something usable as a path segment', () => {
  assert.equal(cleanAnimationName('  hover glow!  '), 'hoverglow');
  assert.equal(cleanAnimationName('press_2'), 'press_2');
  assert.equal(cleanAnimationName('   '), '');
  assert.equal(cleanAnimationName(null), '');
});

test('a duplicate name is suffixed rather than silently doing nothing', () => {
  // The panel's Add bails on a duplicate — `if (… || animations?._children?.[name]) return;` — which
  // looks like a broken button.
  assert.equal(uniqueAnimationName(['a'], 'a'), 'a2');
  assert.equal(uniqueAnimationName(['a', 'a2'], 'a'), 'a3');
  assert.equal(uniqueAnimationName([], 'fresh'), 'fresh');
  assert.equal(uniqueAnimationName([], 'enabled'), 'enabled2',
    'the section-level enabled switch cannot be replaced by an animation child');
  assert.equal(uniqueAnimationName([], '  '), '', 'nothing usable means nothing made');
});

test('a rename says why it cannot happen', () => {
  assert.equal(renameBlockedBecause(['a', 'b'], 'a', 'c'), '');
  assert.equal(renameBlockedBecause(['a', 'b'], 'a', 'a'), '', 'renaming to itself is fine');
  assert.match(renameBlockedBecause(['a', 'b'], 'a', 'b'), /already an animation called b/);
  assert.match(renameBlockedBecause(['a'], 'a', 'enabled'), /reserved/);
  assert.match(renameBlockedBecause(['a'], 'a', '   '), /letters, digits or underscores/);
});

// --- What the properties panel does now -------------------------------------
// This test used to pin the four things the tab existed to fix in the panel — seven properties
// with two dead among them, a raw JSON target box, four easings with no picture, a free-text Kind —
// so that fixing one in the panel would force the tab's reason to be rewritten. Phase 5 of the
// overhaul took the rows out instead: everything they did, the tab does. What is pinned now is the
// replacement, so the rows cannot creep back one at a time.

test('the properties panel summarises the animations and sends you to the tab', () => {
  const source = readFileSync(
    new URL('../src/CE_Application/sections/AnimationsEditor.svelte', import.meta.url),
    'utf8'
  );
  assert.match(source, /<OpenInDock tab="animation"/, 'the way into the tab');
  assert.equal((source.match(/<OpenInDock/g) ?? []).length, 1, 'one way in: dockOpeners counts them');
  assert.match(source, /readAnimations/, 'the summary reads the model, not its own copy');
  assert.match(source, /findClashes/, 'and shows what is wrong');
  for (const gone of [/<textarea/, /TARGET_PROPERTIES/, /EASING_OPTIONS/, /updateControlProperty/, /applyControlPatch/, /removeControlNode/]) {
    assert.ok(!gone.test(source), `the panel edits animations again (${gone}) — edit them in the tab`);
  }
});

test('every field the tab edits is in the label list the panel search reads', () => {
  const labels = allAnimationFieldLabels();
  for (const label of ['Kind', 'Duration', 'Delay', 'Easing', 'Trigger', 'From', 'To', 'Leaving', 'Origin',
    'Source', 'Targets', 'Frames', 'Repeat', 'Direction', 'Plays on', 'Every', 'Presets', 'Stage', 'Spring', 'Custom curve']) {
    assert.ok(labels.includes(label), `${label} is edited in the tab and the panel search cannot find it`);
  }
});

// --- Trigger states ---------------------------------------------------------
// A state trigger names states by the keys of the control's States section. The runtime compares
// names and nothing else, so "presed" is not an error anywhere — it is an animation that never
// plays. These are how the tab finds that out.

test('a control\'s state names are its States keys, spelled the way triggers spell them', () => {
  const button = createControl('ToggleButton');
  const names = controlStateNames(button);
  for (const name of ['hover', 'pressed', 'focused', 'disabled']) assert.ok(names.includes(name), `${name} in ${names}`);
  assert.deepEqual(controlStateNames(null), []);
  assert.deepEqual(triggerStateChoices(['hover', 'pressed']), ['*', 'default', 'hover', 'pressed']);
});

test('the states a control does not have are reported as they were typed', () => {
  const row = describeAnimation('a', { trigger: { type: 'stateChange', from: ['*', 'Default'], to: ['Presed', 'hover', 'presed'] } });
  assert.deepEqual(unknownTriggerStates(row, ['hover', 'pressed']), ['Presed'], 'once, as typed; * and default are always known');
  const value = describeAnimation('b', { trigger: { type: 'valueChange', source: 'value.normalized' } });
  assert.deepEqual(unknownTriggerStates(value, []), [], 'a value trigger names no states');
});

test('choosing * clears the named states, and a named state clears *', () => {
  assert.deepEqual(toggleTriggerState(['hover'], '*'), ['*']);
  assert.deepEqual(toggleTriggerState(['*'], 'Pressed'), ['pressed']);
  assert.deepEqual(toggleTriggerState(['hover', 'pressed'], 'hover'), ['pressed']);
  assert.deepEqual(toggleTriggerState(['pressed'], 'pressed'), ['*'], 'an empty list means any, so it says so');
  assert.deepEqual(toggleTriggerState([], 'hover'), ['hover']);
});

test('describeAnimation reads reverse and origin with the runtime\'s defaults', () => {
  const row = describeAnimation('a', { trigger: { type: 'stateChange', to: ['hover'] } });
  assert.equal(row.reverse, true);
  assert.equal(row.origin, 'any');
  assert.equal(describeAnimation('b', { trigger: { type: 'stateChange', to: ['hover'], reverse: false } }).reverse, false);
  assert.equal(describeAnimation('c', { trigger: { type: 'valueChange', origin: 'external' } }).origin, 'external');
  assert.equal(describeAnimation('d', { trigger: { type: 'valueChange', origin: 'nonsense' } }).origin, 'any');
});

// --- Clashes ----------------------------------------------------------------
// Two animations tying for one part's property on the same change: the later one always plays and
// the earlier one never does there. A rule, not a bug, but invisible until the tab says so.

const trig = (trigger) => readTrigger({ trigger });

test('two state triggers tie when they name a state in common', () => {
  assert.match(triggersTie(trig({ type: 'stateChange', to: ['pressed'] }), trig({ type: 'stateChange', to: ['pressed', 'hover'] })), /pressed/);
  assert.equal(triggersTie(trig({ type: 'stateChange', to: ['hover'] }), trig({ type: 'stateChange', to: ['pressed'] })), '',
    'the default hoverIn and pressIn must not be reported against each other');
  assert.match(triggersTie(trig({ type: 'stateChange', from: ['*'], to: ['*'] }), trig({ type: 'stateChange', to: [] })), /any state/);
});

test('a named state beats *, so that is a fallback and not a clash', () => {
  assert.equal(triggersTie(trig({ type: 'stateChange', to: ['pressed'] }), trig({ type: 'stateChange', to: ['*'] })), '');
});

test('From lists only keep two triggers apart when one is default and the other is not', () => {
  const a = trig({ type: 'stateChange', from: ['default'], to: ['pressed'] });
  assert.equal(triggersTie(a, trig({ type: 'stateChange', from: ['hover'], to: ['pressed'] })), '',
    'nothing active and hover active cannot both be the frame before');
  assert.match(triggersTie(trig({ type: 'stateChange', from: ['hover'], to: ['pressed'] }), trig({ type: 'stateChange', from: ['focused'], to: ['pressed'] })), /pressed/,
    'hover and focused can be active together');
});

test('value triggers tie on the same source unless their origins rule each other out', () => {
  const user = trig({ type: 'valueChange', source: 'value.normalized', origin: 'user' });
  const external = trig({ type: 'valueChange', source: 'value.normalized', origin: 'external' });
  const any = trig({ type: 'valueChange', source: 'value.normalized' });
  assert.equal(triggersTie(user, external), '');
  assert.match(triggersTie(user, any), /value\.normalized/);
  assert.equal(triggersTie(any, trig({ type: 'valueChange', source: 'value.raw' })), '');
  assert.equal(triggersTie(any, trig({ type: 'stateChange', to: ['hover'] })), '', 'different kinds of change rank differently');
});

test('findClashes reports the pair, where, and which one plays', () => {
  const control = withAnimation([{ path: 'Transform.scale', properties: ['transform'] }]);
  const animations = control._children.Animations._children;
  animations.second = {
    ...structuredClone(animations.test),
    name: 'second',
    targets: [{ path: 'Transform.scale', properties: ['transform'] }, { path: 'Transform.opacity' }],
  };
  const rows = readAnimations(control);
  const clashes = findClashes(rows, partsOf(control));
  assert.equal(clashes.length, 1);
  assert.deepEqual({ winner: clashes[0].winner, loser: clashes[0].loser }, { winner: 'second', loser: 'test' });
  assert.deepEqual(clashes[0].places, [{ part: '', bucket: 'transform' }], 'opacity is only on one of them');
  assert.match(clashesFor('test', clashes)[0].text, /Never plays on the control transform: second is later/);
  assert.match(clashesFor('second', clashes)[0].text, /Overrides test/);
  assert.deepEqual(clashesFor('nobody', clashes), []);
});

test('a switched-off animation, a dead target and a different trigger are not clashes', () => {
  const control = withAnimation([{ path: 'Transform.scale', properties: ['transform'] }]);
  const animations = control._children.Animations._children;
  animations.off = { ...structuredClone(animations.test), name: 'off', enabled: false };
  animations.press = { ...structuredClone(animations.test), name: 'press', trigger: { type: 'stateChange', from: ['*'], to: ['pressed'] } };
  animations.typo = { ...structuredClone(animations.test), name: 'typo', targets: [{ path: 'Parts.nosuch.Layout.scale' }] };
  assert.deepEqual(findClashes(readAnimations(control), partsOf(control)), []);
});

test('the shipped defaults have no clashes', () => {
  for (const type of ['Button', 'ToggleButton', 'Knob', 'Slider', 'Range', 'Number']) {
    const control = createControl(type);
    const parts = Object.keys(control._children?.Parts?._children ?? {});
    assert.deepEqual(findClashes(readAnimations(control), parts), [], type);
  }
});

// --- Cost --------------------------------------------------------------------

test('what a target costs, cheapest first', () => {
  assert.equal(targetCost({ path: 'Transform.scale' }).level, 'composite');
  assert.equal(targetCost({ path: 'Parts.a.opacity' }).level, 'composite');
  assert.equal(targetCost({ path: 'Parts.a.Background.Fill.colour' }).level, 'paint');
  assert.equal(targetCost({ path: 'Parts.a.Layout.width' }).level, 'layout');
  assert.equal(targetCost({ path: 'Parts.a.Text.content' }).level, 'none');
});

test('every shipped control and starter names only states it has, and has no clashes', async () => {
  // The rules that made triggers real also made a misspelt state a silent failure. The shipped
  // defaults are the first place somebody copies from, so they are checked here.
  const { buildStarterControl } = await import('../../../tools/scripts/qa/sheets/packages.mjs');
  const { CUSTOM_COMPONENT_STARTERS } = await import('../src/CE_Application/utils/customComponentFactory.js');
  const controls = [
    ...['Button', 'ToggleButton', 'Knob', 'Slider', 'Range', 'Number'].map((type) => [type, createControl(type)]),
    ...CUSTOM_COMPONENT_STARTERS.map((starter) => [`starter ${starter.id}`, buildStarterControl(starter, `qa_${starter.id}`)]),
  ];
  // This test found two starters, the status lamp and the tab group, carrying the generic press
  // animation with no Pressed state, so it could never play. They now animate what their states do
  // change (lampGlow, pageFade) and the exception list that held them is gone.
  for (const [label, control] of controls) {
    const rows = readAnimations(control);
    const states = controlStateNames(control);
    for (const row of rows) {
      assert.deepEqual(unknownTriggerStates(row, states), [], `${label} / ${row.name} names a state it does not have (it has: ${states.join(', ')})`);
    }
    const parts = Object.keys(control._children?.Parts?._children ?? {});
    assert.deepEqual(findClashes(rows, parts), [], label);
  }
});

test('a working colour target says that only a solid colour fades', () => {
  // Phase 2 of the overhaul: colour animates, and the one thing it cannot do is said on the row.
  const colour = targetStatus({ path: 'Parts.label.Background.Fill.colour' }, ['label']);
  assert.equal(colour.works, true);
  assert.match(colour.note, /gradient, an image or a material switches/);
  assert.equal(targetStatus({ path: 'Transform.scale' }, []).note, undefined, 'scale has nothing to warn about');
});

// --- Phase 3: a curve you draw, and one that bounces ---------------------------------------------

test('the tab offers the ten named curves, then custom and spring', () => {
  assert.deepEqual(EASING_CHOICES.slice(-2), ['custom', 'spring']);
  assert.equal(EASING_CHOICES.length, 12);
});

test('choosing custom starts from the curve the animation already had', () => {
  const row = describeAnimation('a', { easing: 'outCubic' });
  assert.deepEqual(easingPatch(row, 'custom'), { easing: 'custom', bezier: EASING_BEZIERS.outCubic });
  assert.notEqual(easingPatch(row, 'custom').bezier, EASING_BEZIERS.outCubic, 'a copy, never the shared table');
  assert.deepEqual(easingPatch(describeAnimation('b', { easing: 'linear' }), 'custom').bezier, [0, 0, 1, 1]);
  const own = describeAnimation('c', { easing: 'outQuad', bezier: [0.2, 0.3, 0.4, 0.5] });
  assert.deepEqual(easingPatch(own, 'custom').bezier, [0.2, 0.3, 0.4, 0.5], 'a curve drawn before comes back');
});

test('choosing spring keeps a feel already set, and choosing a name writes only the name', () => {
  const sprung = describeAnimation('a', { easing: 'outQuad', spring: { damping: 9, frequency: 18 } });
  assert.deepEqual(easingPatch(sprung, 'spring'), { easing: 'spring', spring: { damping: 9, frequency: 18 } });
  assert.deepEqual(easingPatch(describeAnimation('b', {}), 'spring').spring, { damping: 6, frequency: 12 });
  assert.deepEqual(easingPatch(sprung, 'inBack'), { easing: 'inBack' }, 'the spring stays stored for coming back');
});

test('a spring is kept inside the range where it settles and does not buzz', () => {
  assert.deepEqual(cleanSpring({ damping: 0, frequency: 400 }), { damping: SPRING_LIMITS.damping[0], frequency: SPRING_LIMITS.frequency[1] });
  assert.deepEqual(cleanSpring({ damping: 'x' }), { damping: 6, frequency: 12 });
  assert.deepEqual(cleanSpring({ damping: 7.25, frequency: 11.04 }), { damping: 7.3, frequency: 11 });
});

test('dragging a bezier handle keeps time running forwards and the curve inside the view', () => {
  const start = [0.25, 0.1, 0.25, 1];
  assert.deepEqual(moveBezierHandle(start, 1, 0.33333, 0.6666), [0.333, 0.667, 0.25, 1], 'rounded like the named curves');
  assert.deepEqual(moveBezierHandle(start, 2, 1.4, 9), [0.25, 0.1, 1, BEZIER_VIEW.yMax], 'x cannot leave [0, 1]');
  assert.deepEqual(moveBezierHandle(start, 1, -1, -9), [0, BEZIER_VIEW.yMin, 0.25, 1]);
  assert.deepEqual(moveBezierHandle('nonsense', 1, 0.5, 0.5), [0.5, 0.5, 0.25, 1], 'bad points start from the default');
});

// --- Phase 4: keyframe animations ---------------------------------------------------------------

test('switching to keyframes gives a pulse, a trigger keyframes answer, and a pulse\'s duration', () => {
  const row = describeAnimation('a', { kind: 'transition', duration: 120, trigger: { type: 'stateChange', to: ['hover'] } });
  const patch = kindPatch(row, 'keyframes');
  assert.equal(patch.kind, 'keyframes');
  assert.equal(patch.frames.length, 3);
  assert.deepEqual(patch.trigger, { type: 'stateChange', to: ['hover'] }, 'a state trigger carries over');
  assert.equal(patch.duration, 600, 'a 120ms loop would flicker');
  const slow = kindPatch(describeAnimation('b', { duration: 900, frames: [{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }] }), 'keyframes');
  assert.equal(slow.duration, undefined, 'a duration that was already slow is kept');
  assert.deepEqual(slow.frames, [{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }], 'frames from before come back');
});

test('switching back to a transition gives it a trigger a transition answers, and keeps the frames', () => {
  const beat = describeAnimation('a', { kind: 'keyframes', trigger: { type: 'beat', every: 2 }, frames: [{ at: 0, scale: 1 }] });
  const patch = kindPatch(beat, 'transition');
  assert.equal(patch.kind, 'transition');
  assert.deepEqual(patch.trigger, { type: 'stateChange', from: ['*'], to: ['hover'], reverse: true });
  assert.equal('frames' in patch, false, 'nothing deletes them');
  const value = describeAnimation('b', { kind: 'keyframes', trigger: { type: 'valueChange', source: 'value.raw' } });
  assert.deepEqual(kindPatch(value, 'transition').trigger, { type: 'valueChange', source: 'value.raw' });
});

test('a keyframe animation\'s target only has to name a part that exists', () => {
  const row = describeAnimation('a', { kind: 'keyframes', targets: keyframeTargets('lamp'), frames: [{ at: 0, scale: 1 }] });
  assert.deepEqual(row.targets, [{ path: 'Parts.lamp' }]);
  assert.equal(row.part, 'lamp');
  assert.equal(deadTargetCount(row, ['lamp']), 0, 'no property path is needed, so none is "dead"');
  assert.equal(deadTargetCount(row, ['other']), 1, 'but a part that is not there is');
  assert.deepEqual(keyframeTargets(''), [{ path: 'Transform' }]);
  assert.equal(describeAnimation('b', { kind: 'keyframes', targets: keyframeTargets('') }).part, '');
});

test('a keyframe row reads its repeat, direction and frames', () => {
  const row = describeAnimation('a', { kind: 'keyframes', trigger: { type: 'beat' }, direction: 'alternate', frames: [{ at: 1, scale: 2 }, { at: 0, scale: 1 }] });
  assert.equal(row.iterations, 1, 'a beat plays once per beat by default');
  assert.equal(row.direction, 'alternate');
  assert.deepEqual(row.frames.map((frame) => frame.at), [0, 1]);
  assert.equal(describeAnimation('b', { kind: 'keyframes', trigger: { type: 'always' } }).iterations, 'infinite');
  assert.equal(describeAnimation('c', { kind: 'keyframes', iterations: 3 }).iterations, 3);
  assert.deepEqual(describeAnimation('d', { kind: 'transition', frames: [{ at: 0 }] }).frames, [], 'a transition has none');
});

test('adding a frame puts it in the widest gap, as a copy of the frame before', () => {
  assert.deepEqual(addFrame([{ at: 0, scale: 1 }, { at: 1, scale: 2 }]), [{ at: 0, scale: 1 }, { at: 0.5, scale: 1 }, { at: 1, scale: 2 }]);
  assert.deepEqual(addFrame([{ at: 0, scale: 1 }, { at: 0.2, scale: 2 }]).map((frame) => frame.at), [0, 0.2, 0.6]);
  assert.equal(addFrame([]).length, 1);
});

test('frame values are set, cleared and re-sorted', () => {
  const frames = [{ at: 0, scale: 1 }, { at: 0.5, scale: 1.1 }, { at: 1, scale: 1 }];
  assert.deepEqual(setFrameValue(frames, 1, 'opacity', 0.5)[1], { at: 0.5, scale: 1.1, opacity: 0.5 });
  assert.deepEqual(setFrameValue(frames, 1, 'scale', '')[1], { at: 0.5 }, 'empty lets it ease through');
  assert.deepEqual(setFrameValue(frames, 0, 'at', 75).map((frame) => frame.at), [0.5, 0.75, 1], 'at is a percentage in the tab');
  assert.deepEqual(removeFrame(frames, 1).map((frame) => frame.at), [0, 1]);
  assert.deepEqual(removeFrame(frames, 9).length, 3);
});

test('the status lamp fades into its colour and the tab group cross-fades its pages', async () => {
  const { buildStarterControl } = await import('../../../tools/scripts/qa/sheets/packages.mjs');
  const { CUSTOM_COMPONENT_STARTERS } = await import('../src/CE_Application/utils/customComponentFactory.js');
  const starter = (id) => buildStarterControl(CUSTOM_COMPONENT_STARTERS.find((s) => s.id === id), `qa_${id}`);
  const lamp = starter('starter.statusLamp');
  const glow = readAnimations(lamp).find((row) => row.name === 'lampGlow');
  assert.deepEqual(describeTargets(glow, partsOf(lamp)).map((t) => t.status.animates), ['colour', 'colour', 'colour']);
  const tabs = starter('starter.tabGroup');
  const fade = readAnimations(tabs).find((row) => row.name === 'pageFade');
  assert.deepEqual(describeTargets(fade, partsOf(tabs)).map((t) => t.status.animates), ['visibility', 'visibility', 'visibility']);
  assert.deepEqual(fade.trigger.to, ['tabtwo', 'tabthree']);
});
