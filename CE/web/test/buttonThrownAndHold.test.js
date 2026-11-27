// buttonThrownAndHold.test.js — the two things the Button's second half proposed and could not yet play
// (docs/design/component-presets.md, The Button): words thrown from a button's key, and a timed
// button's hold drawn as it goes.
//
// The promises: an emit throws words of its own or a count, which need no value, and a button takes
// only those; the Animation tab offers a button the Words kind, starting from "+1" on a click, from
// the key, rising; a keyframe animation on `hold` plays from the moment a timed button is held, over
// exactly its own hold time (a double-click one's wait for the next click), and stops if it is let go
// early; the stage's Play holds it that long; and a slider says words of its own too.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { readEmit, createKeyframePlayer, KEYFRAME_TRIGGER_TYPES, EMIT_WORDS_LIMIT } from '../src/CE_Application/utils/keyframeAnimation.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { animationKindsFor, kindPatch, triggerSummary, KEYFRAME_TRIGGER_LABELS, EMIT_KIND } from '../src/CE_Application/utils/animationModel.js';
import { presetDoesNotFit } from '../src/CE_Application/utils/animationPresetModel.js';
import { playbackPlan } from '../src/CE_Application/utils/animationPlayback.js';
import { BUTTON_PRESETS } from '../src/CE_Application/utils/buttonPresets.js';
import SliderFamilyRenderer from '../src/CE_Application/editor/SliderFamilyRenderer.svelte';

const byId = (slug) => BUTTON_PRESETS.find((entry) => entry.slug === slug);
const wearing = (type, slug, behaviour = {}) => {
  const control = createControl(type);
  Object.assign(control._children.Behavior, behaviour);
  control._children.Animations._children = { ...byId(slug).preset.animations };
  for (const [key, value] of Object.entries(byId(slug).preset.states ?? {})) {
    control._children.States._children[key] = { _type: 'State', name: key, enabled: true, group: 'interaction', when: value.when, patches: value.patches };
  }
  return control;
};
const runtimeOf = (control, session = {}) => resolveInteractiveControl(control, session).runtime;

test('an emit throws words of its own or a count: kept to what reads at a glance, and needing no value', () => {
  const read = readEmit({ kind: 'emit', name: 'w', shows: 'words', words: `  ${'x'.repeat(40)}  `, trigger: { type: 'event', event: 'click' } });
  assert.equal(read.emit.shows, 'words');
  assert.equal(read.emit.words.length, EMIT_WORDS_LIMIT);
  assert.equal(readEmit({ kind: 'emit', name: 'c', shows: 'count' }).emit.shows, 'count');
  assert.equal(readEmit({ kind: 'emit', name: 'v', shows: 'nonsense' }).emit.shows, 'value');

  // A button has no value; its words are thrown all the same, and a count counts.
  let clock = 0;
  const player = createKeyframePlayer({ now: () => clock });
  const key = wearing('MomentaryButton', 'count');
  player.next(runtimeOf(key));
  const counts = [];
  for (let k = 1; k <= 3; k += 1) {
    clock += 100;
    const out = player.next(runtimeOf(key), { plays: { count: k } });
    counts.push(out.emits.at(-1)?.count);
  }
  assert.deepEqual(counts, [1, 2, 3]);
  const plus = wearing('MomentaryButton', 'plus-one');
  const fresh = createKeyframePlayer({ now: () => 0 });
  fresh.next(runtimeOf(plus));
  const thrown = fresh.next(runtimeOf(plus), { plays: { plusOne: 1 } }).emits;
  assert.equal(thrown.length, 1);
  assert.deepEqual([thrown[0].emit.shows, thrown[0].emit.words, thrown[0].emit.from, thrown[0].emit.direction], ['words', '+1', 'centre', 'up']);
});

test('a button takes words of its own or a count, not a value; the Words kind starts as "+1" on a click', () => {
  const key = createControl('MomentaryButton');
  assert.ok(animationKindsFor(key).includes(EMIT_KIND), 'offered on a button');
  assert.ok(!animationKindsFor(createControl('Label')).includes(EMIT_KIND));
  const patch = kindPatch({ animation: { kind: 'keyframes', trigger: { type: 'always' } }, kind: 'keyframes' }, EMIT_KIND, key);
  assert.deepEqual([patch.shows, patch.words, patch.from, patch.direction, patch.trigger.type, patch.trigger.event], ['words', '+1', 'centre', 'up', 'event', 'click']);
  const knob = kindPatch({ animation: { kind: 'keyframes' }, kind: 'keyframes' }, EMIT_KIND, createControl('Knob'));
  assert.equal(knob.shows, 'value', 'a knob still throws its value');
  const preset = (shows) => ({ ...byId('plus-one').preset, animations: { w: { ...byId('plus-one').preset.animations.plusOne, shows } } });
  assert.equal(presetDoesNotFit(preset('words'), key), '');
  assert.equal(presetDoesNotFit(preset('count'), createControl('ToggleButton')), '');
  assert.match(presetDoesNotFit(preset('value'), key), /a button has none to throw/);
  assert.match(presetDoesNotFit(preset('words'), createControl('Label')), /goes on a knob, a slider or a button/);
});

test('the hold plays from the moment the button is held, over its own hold time, and stops if let go', () => {
  assert.ok(KEYFRAME_TRIGGER_TYPES.includes('hold'));
  assert.equal(KEYFRAME_TRIGGER_LABELS.hold, 'While held to confirm');
  assert.equal(triggerSummary({ kind: 'keyframes', trigger: { type: 'hold' } }), 'while held to confirm');
  const timed = wearing('TimedButton', 'lamp-fills', { holdDuration: 2400 });
  const entry = runtimeOf(timed).keyframes.entries.find((e) => e.name === 'lampFills');
  assert.deepEqual([entry.duration, entry.iterations, entry.span], [2400, 1, 2400], 'the button\'s hold, not the preset\'s 1500');
  const doubled = wearing('TimedButton', 'lamp-fills', { subtype: 'double_click', clickWindow: 500 });
  assert.equal(runtimeOf(doubled).keyframes.entries.find((e) => e.name === 'lampFills').duration, 500, 'a double-click one waits for its next click');
  assert.equal(runtimeOf(timed, { animationTimeScale: 2 }).keyframes.entries.find((e) => e.name === 'lampFills').duration, 4800, 'slowed with the preview');

  let clock = 0;
  const player = createKeyframePlayer({ now: () => clock });
  const rest = player.next(runtimeOf(timed));
  assert.equal(rest.parts.get('indicator'), undefined, 'nothing at rest');
  clock = 100;
  const held = player.next(runtimeOf(timed, { pressed: true, pending: true }));
  assert.deepEqual(held.fired, ['lampFills']);
  assert.match(held.parts.get('indicator')[0], /2400ms linear 0ms 1 /);
  clock = 900;
  const still = player.next(runtimeOf(timed, { pressed: true, pending: true }));
  assert.equal(still.parts.get('indicator')[0], held.parts.get('indicator')[0], 'one run, not restarted while held');
  clock = 1000;
  const early = player.next(runtimeOf(timed, { pressed: false, pending: false }));
  assert.equal(early.parts.get('indicator'), undefined, 'let go early, the lamp goes back');
  clock = 1200;
  const again = player.next(runtimeOf(timed, { pressed: true, pending: true }));
  assert.notEqual(again.parts.get('indicator')[0], held.parts.get('indicator')[0], 'held again, it starts again');
});

test('when the hold is done the preset\'s own Executed state fires what plays then', () => {
  const timed = wearing('TimedButton', 'confirmed', { holdDuration: 1000 });
  let clock = 0;
  const player = createKeyframePlayer({ now: () => clock });
  player.next(runtimeOf(timed, { pressed: true, pending: true }));
  clock = 1000;
  const fired = player.next(runtimeOf(timed, { executed: true }));
  assert.deepEqual(fired.emits.map((word) => word.emit.words), ['OK']);
});

test('the stage\'s Play holds a timed button for its own hold, then lets it fire', () => {
  const timed = wearing('TimedButton', 'swell', { holdDuration: 1800 });
  const plan = playbackPlan(timed, { kind: 'keyframes', animation: timed._children.Animations._children.swell, trigger: { type: 'hold' } });
  assert.ok(plan.ok, plan.reason);
  assert.deepEqual(plan.steps.map((step) => step.label), ['rest', 'held', 'confirmed']);
  assert.equal(plan.steps[1].hold, 1800);
  assert.deepEqual([plan.steps[1].session.pending, plan.steps[2].session.executed], [true, true]);
});

test('a slider says words of its own and counts too', () => {
  const fader = createControl('Slider');
  const word = (emit, extra = {}) => ({ id: 1, name: 'w', at: performance.now(), value: 0.5, from: 0.5, turn: 1, count: 4, ...extra,
    emit: { shows: 'value', words: '', from: 'tip', direction: 'up', travel: 30, size: 12, colour: null, duration: 700, delay: 0, easing: 'ease', ...emit } });
  const said = (emit) => /data-emitted-word[^>]*>([^<]*)</.exec(render(SliderFamilyRenderer, { props: { control: fader, width: 60, height: 200, emits: [word(emit)] } }).body)?.[1];
  assert.equal(said({ shows: 'words', words: 'MAX' }), 'MAX');
  assert.equal(said({ shows: 'count' }), '4');
});
