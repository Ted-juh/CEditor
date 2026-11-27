// choiceGroupParts.test.js — a choice group's options animated as parts (choiceGroupLayout.js
// CHOICE_PARTS): the thumb that travels (utils/choiceGroupMotion.js), every option one after
// another (utils/optionStagger.js), an option's own motion as its states set it
// (choiceGroupStyle.js), a preset that brings that motion, and the trigger for a changed list of
// options. The Components showcase's Choice group, phase 2 (docs/design/component-presets.md).
//
// The promises: a choice group has its option parts to animate and no other control has; the thumb
// stands on the chosen option's mark in every style and eases its two edges on their own timings,
// the edge ahead first; an animation on every option starts each a stagger later, by rank, holding
// its first frame until its turn, and a text effect on every label does the same; a state moves the
// option under the pointer, or the others, and the option alone; a preset carries that and does not
// undo what an author set; and "when its options change" is a trigger of its own.

import test from 'node:test';
import assert from 'node:assert/strict';

import { CHOICE_PARTS, choicePartNames, OPTION_STATE_SIGNALS } from '../src/CE_Application/utils/choiceGroupLayout.js';
import { animatedParts, thumbBox, thumbDirection, thumbEdges, thumbTransition } from '../src/CE_Application/utils/choiceGroupMotion.js';
import { optionRankVars, readOptionStagger, scatteredRank, staggeredDelay } from '../src/CE_Application/utils/optionStagger.js';
import { resolveChoiceOption } from '../src/CE_Application/utils/choiceGroupStyle.js';
import { animationValue, readKeyframes, KEYFRAME_TRIGGER_TYPES } from '../src/CE_Application/utils/keyframeAnimation.js';
import { readTextEffect, textPieceStyles, splitText, TEXT_TRIGGER_TYPES, TEXT_TRIGGER_LABELS } from '../src/CE_Application/utils/textEffects.js';
import { KEYFRAME_TRIGGER_LABELS } from '../src/CE_Application/utils/animationModel.js';
import { cleanPreset } from '../src/CE_Application/utils/animationPresetFormat.js';
import { applyPresetPatch, presetDoesNotFit } from '../src/CE_Application/utils/animationPresetModel.js';
import { CHOICE_PRESETS } from '../src/CE_Application/utils/choicePresets.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';

const byId = (slug) => CHOICE_PRESETS.find((entry) => entry.slug === slug);

test('a choice group has its options to animate as parts; a knob has none of them', () => {
  assert.deepEqual(CHOICE_PARTS, ['thumb', 'chosen', 'option', 'chosenLabel', 'optionLabel']);
  assert.deepEqual(choicePartNames(createControl('RadioButtonGroup')), CHOICE_PARTS);
  assert.deepEqual(choicePartNames(createControl('Knob')), []);
  assert.equal(presetDoesNotFit(byId('slide').preset, createControl('RadioButtonGroup')), '');
  assert.match(presetDoesNotFit(byId('slide').preset, createControl('Knob')), /does not have: thumb/);
  assert.ok(OPTION_STATE_SIGNALS.includes('peerHover'), 'a state about the other options is an option state');
});

test('which parts anything plays on: transitions\' and keyframes\', text effects\' included', () => {
  const parts = animatedParts({ partTransitions: new Map([['thumb', {}]]), keyframeEntries: [{ part: 'chosen' }, { part: '' }, { part: 'optionLabel', text: {} }] });
  assert.deepEqual([...parts].sort(), ['chosen', 'optionLabel', 'thumb']);
});

test('the thumb stands on the chosen option\'s mark: the whole option, the underline, the dot, the lamp', () => {
  const item = { left: 100, top: 10, width: 80, height: 40, padX: 8 };
  const resolved = { indicatorOuter: { visible: true, width: 14, height: 14 }, indicatorInner: { width: 6, height: 6, height2: 0 } };
  assert.deepEqual(thumbBox('segmented', 'horizontal', item, resolved), { left: 100, top: 10, width: 80, height: 40 });
  assert.deepEqual(thumbBox('buttons', 'horizontal', item, resolved), { left: 100, top: 10, width: 80, height: 40 });
  assert.deepEqual(thumbBox('tab', 'horizontal', item, { indicatorInner: { height: 2 } }), { left: 108, top: 48, width: 64, height: 2 });
  assert.deepEqual(thumbBox('radio', 'horizontal', item, resolved), { left: 112, top: 27, width: 6, height: 6 }, 'the dot in the middle of the ring');
  assert.deepEqual(thumbBox('led', 'horizontal', item, resolved), { left: 108, top: 23, width: 14, height: 14 }, 'the lamp itself');
  assert.equal(thumbEdges({ left: 100, top: 10, width: 80, height: 40 }, 300, 60), 'left:100px;top:10px;right:120px;bottom:10px;');
});

test('the thumb eases the edge ahead on Layout.x\'s timing and the edge behind on Layout.width\'s', () => {
  assert.equal(thumbDirection({ left: 0, width: 50, top: 0, height: 10 }, { left: 100, width: 50, top: 0, height: 10 }), 1);
  assert.equal(thumbDirection({ left: 100, width: 50, top: 0, height: 10 }, { left: 0, width: 50, top: 0, height: 10 }), -1);
  assert.equal(thumbDirection({ top: 0, height: 20, left: 0, width: 5 }, { top: 40, height: 20, left: 0, width: 5 }, 'vertical'), 1);
  const stretch = { transform: '180ms ease 0ms', size: '420ms ease 0ms' };
  assert.equal(thumbTransition(stretch, 1), 'transition:right 180ms ease 0ms, left 420ms ease 0ms, top 180ms ease 0ms, bottom 180ms ease 0ms;', 'going on, the right edge leads');
  assert.equal(thumbTransition(stretch, -1), 'transition:left 180ms ease 0ms, right 420ms ease 0ms, top 180ms ease 0ms, bottom 180ms ease 0ms;', 'going back, the left edge does');
  assert.equal(thumbTransition({ size: '300ms linear 0ms' }, 1), 'transition:right 300ms linear 0ms, left 300ms linear 0ms, top 300ms linear 0ms, bottom 300ms linear 0ms;', 'one timing slides it whole');
  assert.equal(thumbTransition(null, 1), '');
});

test('every option one after another: the delay is the browser\'s, by the option\'s rank, and it holds its first frame till then', () => {
  assert.equal(readOptionStagger({}), null);
  assert.deepEqual(readOptionStagger({ optionStagger: 90 }), { by: 90, order: 'forward' });
  assert.deepEqual(readOptionStagger({ optionStagger: 90, optionOrder: 'fromChosen' }, 2), { by: 180, order: 'fromChosen' });
  assert.equal(staggeredDelay(40), '40ms');
  assert.equal(staggeredDelay(40, { by: 90, order: 'reverse' }), 'calc(40ms + var(--ce-rank-reverse, 0) * 90ms)');
  // A fourth, scattered: a meter's lamps sparkling (the Meter, phase 2), each place once.
  assert.equal(optionRankVars(1, 5, 3), `--ce-rank-forward:1;--ce-rank-reverse:3;--ce-rank-chosen:2;--ce-rank-scattered:${scatteredRank(1, 5)};`);
  assert.equal(optionRankVars(2, 5, -1), `--ce-rank-forward:2;--ce-rank-reverse:2;--ce-rank-chosen:2;--ce-rank-scattered:${scatteredRank(2, 5)};`, 'with none chosen, from the first');
  for (const n of [1, 5, 8, 16]) {
    assert.deepEqual(Array.from({ length: n }, (_, i) => scatteredRank(i, n)).sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i), `scattered over ${n}: each place once`);
  }
  assert.equal(staggeredDelay(0, { by: 50, order: 'scattered' }), 'calc(0ms + var(--ce-rank-scattered, 0) * 50ms)');

  const cascade = readKeyframes(byId('cascade').preset.animations.cascade);
  assert.deepEqual(cascade.optionStagger, { by: 110, order: 'forward' });
  const value = animationValue(cascade, 'a');
  assert.match(value, /calc\(0ms \+ var\(--ce-rank-forward, 0\) \* 110ms\)/);
  assert.match(value, / backwards$/, 'hidden until its turn');
  assert.match(animationValue(readKeyframes(byId('pop').preset.animations.pop), 'a'), / 0ms 1 normal none$/, 'no stagger: as ever');

  const typed = readTextEffect(byId('typewriter-labels').preset.animations.typed);
  const styles = textPieceStyles(typed, splitText('Sine', typed.split));
  assert.ok(styles.every((style) => /var\(--ce-rank-forward, 0\) \* 260ms/.test(style)), 'each label\'s letters after the label before');
});

test('a state moves the option under the pointer, or the others, and that option alone', () => {
  const control = createControl('RadioButtonGroup');
  const states = control._children.States;
  states._children.Hover.patches.segments = { shared: { whole: { scale: 1.1 }, label: { scale: 1.2 } } };
  states._children.Spotlight = { _type: 'State', name: 'Spotlight', enabled: true, when: { peerHover: true }, patches: { component: {}, parts: {}, segments: { shared: { whole: { opacity: 0.35 } } } } };
  const motion = (flags) => resolveChoiceOption({ style: 'buttons', row: control._children.Value.rows[0], flags, statesSection: states, background: control._children.Background, text: control._children.Text }).motion;
  assert.deepEqual(motion({}), { scale: 1, opacity: 1, labelScale: 1 });
  assert.deepEqual(motion({ hover: true }), { scale: 1.1, opacity: 1, labelScale: 1.2 });
  assert.deepEqual(motion({ peerHover: true }), { scale: 1, opacity: 0.35, labelScale: 1 });
});

test('a preset brings an option\'s motion in its state, and leaves what an author set', () => {
  const lift = byId('lift').preset;
  assert.deepEqual(lift.states.Hover.patches.segments, { shared: { whole: { scale: 1.1 } } });
  const cleaned = cleanPreset({ ...lift, states: { Hover: { when: { hover: true }, patches: { segments: { shared: { whole: { scale: 2 } }, rows: { opt_1: { whole: { scale: 3 } } } } } } } });
  assert.deepEqual(cleaned.states.Hover.patches.segments, { shared: { whole: { scale: 2 } } }, 'the shared layer only: a preset names no other group\'s rows');

  const apply = (control) => {
    const { patch, reason } = applyPresetPatch(control, lift);
    assert.ok(patch, reason);
    for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value);
    return control._children.States._children.Hover.patches;
  };
  const fresh = apply(createControl('RadioButtonGroup'));
  assert.deepEqual(fresh.segments.shared.whole, { scale: 1.1 });
  assert.equal(fresh.component['Background.Fill.colour'], '{surface.hover}', 'the hover colour the type gives is still there');
  const authored = createControl('RadioButtonGroup');
  authored._children.States._children.Hover.patches.segments = { shared: { whole: { scale: 1.02, fillColour: 'FF336699' } } };
  assert.deepEqual(apply(authored).segments.shared.whole, { scale: 1.02, fillColour: 'FF336699' }, 'an author\'s scale is kept');
});

test('"when its options change" is a trigger of its own, for keyframes and text effects', () => {
  assert.ok(KEYFRAME_TRIGGER_TYPES.includes('optionsChange'));
  assert.ok(TEXT_TRIGGER_TYPES.includes('optionsChange'));
  assert.equal(KEYFRAME_TRIGGER_LABELS.optionsChange, 'When its options change');
  assert.equal(TEXT_TRIGGER_LABELS.optionsChange, 'When its options change');
  for (const slug of ['roll-over', 'crossfade', 'cascade-new']) {
    assert.ok(Object.values(byId(slug).preset.animations).every((node) => node.trigger.type === 'optionsChange'), slug);
  }
});
