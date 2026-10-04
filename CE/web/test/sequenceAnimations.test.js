// sequenceAnimations.test.js — the `sequence` kind as the Animation tab's model sees it.
//
// Two branches each built an animation kind called `keyframes`. One (utils/keyframeAnimation.js)
// is CSS playing a list of frames on one part and kept the name. The other — tracks along a time
// axis, driving document values through anime.js — became `sequence` when they were merged. These
// are that second kind's model tests, which lived in animationModel.test.js on its own branch:
// what the Change list offers, what a track's status is, what switching kind writes, and that an
// overlay in the session poses the control. utils/keyframeModel.js and its player have
// keyframeModel.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANIMATION_KINDS,
  SEQUENCE_KIND,
  SEQUENCE_ONLY_BUCKETS,
  targetStatus,
  sequenceTargetStatus,
  describeAnimation,
  describeTargets,
  buildTarget,
  offeredTargetsFor,
  resolvedPartsOf,
  baseValueAt,
  kindPatch,
  findClashes,
  readAnimations,
} from '../src/CE_Application/utils/animationModel.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createCustomComponentPartsDefaults, createCustomComponentStarterPatch } from '../src/CE_Application/utils/customComponentFactory.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';

const partsOf = (control) => Object.keys(control._children.Parts._children);

function bareControl() {
  const control = createControl('CustomComponent');
  control._children.Parts = createCustomComponentPartsDefaults();
  return control;
}

function withAnimation(animation) {
  const control = bareControl();
  control._children.Animations = { _type: 'Animations', _children: { test: animation } };
  return control;
}

function filmstripStarter() {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch('starter.filmstripKnob'));
  return control;
}

/** A row as the tab holds one, and the node it would write after a kind switch. */
const rowOf = (animation) => describeAnimation('test', animation);
const switched = (animation, kind, control) => ({ ...animation, ...kindPatch(rowOf(animation), kind, control) });

test('sequence is a third kind, beside the transition and the CSS keyframes', () => {
  assert.deepEqual(ANIMATION_KINDS, ['transition', 'keyframes', 'sequence']);
  assert.equal(SEQUENCE_KIND, 'sequence');
  assert.deepEqual(SEQUENCE_ONLY_BUCKETS, ['channel', 'frame']);
});

test('switching to a sequence seeds every track with the value the control has, and a length', () => {
  const base = bareControl();
  const part = partsOf(base)[0];
  base._children.Parts._children[part]._children.Layout.rotation = 12;
  const animation = {
    kind: 'transition', duration: 90, trigger: { type: 'stateChange', from: ['*'], to: ['hover'], reverse: true }, targets: [
      { path: `Parts.${part}.Layout.rotation`, properties: ['transform'] },
      { path: `Parts.${part}.Background.Fill.colour`, properties: ['background-color'] },
      { path: 'Parts.nosuchpart.opacity', properties: ['opacity'] },
    ],
  };
  const next = switched(animation, 'sequence', base);
  assert.equal(next.kind, 'sequence');
  assert.equal(next.duration, 1000, 'a 90 ms transition becomes a 1 s axis');
  assert.equal(next.hold, true);
  assert.equal(next.loop, false);
  assert.deepEqual(next.trigger, animation.trigger, 'a state trigger carries over as it is');
  assert.deepEqual(next.targets[0].keyframes, [{ time: 0, value: 12, easing: 'outQuad' }]);
  assert.equal(next.targets[1].keyframes[0].value, base._children.Parts._children[part]._children.Background._children.Fill.colour);
  assert.deepEqual(next.targets[2].keyframes, [], 'a track on a part that is not there has nothing to start from');
  // Back and forth keeps the tracks.
  const back = switched(next, 'transition', base);
  assert.equal(back.kind, 'transition');
  assert.deepEqual(switched(back, 'sequence', base).targets[0].keyframes, next.targets[0].keyframes);
  // And a length someone set is left alone.
  assert.equal(switched({ ...animation, duration: 2400 }, 'sequence', base).duration, 2400);
});

test('a trigger a sequence does not answer becomes a state trigger', () => {
  // The CSS keyframes kind has always / beat / script; a sequence plays on a state or follows a value.
  const beat = { kind: 'keyframes', duration: 600, trigger: { type: 'beat', every: 2 }, targets: [], frames: [{ at: 0, scale: 1 }] };
  const next = switched(beat, 'sequence', bareControl());
  assert.equal(next.trigger.type, 'stateChange');
  assert.deepEqual(next.frames, beat.frames, 'the frames of the other kind are kept for the way back');
  const value = switched({ kind: 'transition', trigger: { type: 'valueChange', source: 'value.normalized' }, targets: [] }, 'sequence', bareControl());
  assert.equal(value.trigger.type, 'valueChange');
});

test('a sequence builds no CSS transition, plays no CSS keyframes, and takes no part in clashes', () => {
  const base = bareControl();
  const part = partsOf(base)[0];
  const track = { path: `Parts.${part}.Layout.rotation`, properties: ['transform'], keyframes: [{ time: 0, value: 0 }, { time: 500, value: 90 }] };
  const control = withAnimation({ kind: 'sequence', enabled: true, duration: 1000, trigger: { type: 'stateChange', from: ['*'], to: ['hover'] }, targets: [track] });
  const { runtime } = resolveInteractiveControl(control, {});
  assert.equal(runtime.transitions.partTransitions.get(part), undefined);
  assert.deepEqual(runtime.transitions.entries, []);
  assert.deepEqual(runtime.keyframes.entries, []);
  // Beside a transition on the same property for the same change: not a tie, the sequence drives values.
  control._children.Animations._children.ease = {
    kind: 'transition', enabled: true, duration: 120, trigger: { type: 'stateChange', from: ['*'], to: ['hover'] },
    targets: [{ path: `Parts.${part}.Layout.rotation`, properties: ['transform'] }],
  };
  assert.deepEqual(findClashes(readAnimations(control), [part]), []);
});

test('an overlay in the session poses the control after its states, where a state patch would', () => {
  const base = bareControl();
  const part = partsOf(base)[0];
  const { control } = resolveInteractiveControl(base, { keyframeOverlay: { [`Parts.${part}.Layout.rotation`]: 33, [`Parts.${part}.opacity`]: 0.25, 'Transform.rotation': 5 } });
  assert.equal(control._children.Parts._children[part]._children.Layout.rotation, 33);
  assert.equal(control._children.Parts._children[part].opacity, 0.25);
  assert.equal(control._children.Transform.rotation, 5);
  assert.equal(base._children.Parts._children[part]._children.Layout.rotation, 0, 'the document is untouched');
});

// --- Value channel and frame tracks (a sequence only) --------------------------------------------

test('for a sequence the Change list offers a channel per value channel and a frame per filmstrip part, whole paths', () => {
  const control = filmstripStarter();
  const extras = offeredTargetsFor(control).filter((entry) => entry.scope === 'control');
  assert.deepEqual(extras.map((e) => e.path), ['ValueChannels.mainValue', 'Parts.filmstrip_knobFrames.Image.frameIndex']);
  assert.match(extras[0].label, /^Channel: /);
  assert.match(extras[1].label, /^Frame: filmstrip_knobFrames/);
  assert.equal(buildTarget('background', extras[0]).path, 'ValueChannels.mainValue', 'a whole path ignores the part picker');
  assert.ok(Object.keys(resolvedPartsOf(control)).includes('filmstrip_knobFrames'), 'the generated part is known');
  // A bare custom component has its default channel and no filmstrip: channels only, no frames.
  const bare = offeredTargetsFor(createControl('CustomComponent')).filter((e) => e.scope === 'control');
  assert.ok(bare.every((e) => e.properties[0] === 'channel'), JSON.stringify(bare));
  // The other kinds have no way to play them, so they are not offered there at all.
  assert.deepEqual(offeredTargetsFor(control, 'transition').filter((entry) => entry.scope === 'control'), []);
});

test('a channel or frame track works for a sequence only, and never the value a sequence follows', () => {
  const channel = { path: 'ValueChannels.mainValue', properties: ['channel'] };
  const frame = { path: 'Parts.filmstrip_knobFrames.Image.frameIndex', properties: ['frame'] };
  // To the transition catalog neither is anything.
  assert.equal(targetStatus(channel, []).works, false);
  assert.equal(targetStatus(frame, ['filmstrip_knobFrames']).works, false);
  // On a sequence they are tracks.
  assert.deepEqual(sequenceTargetStatus(channel, []), { works: true, animates: 'channel', buckets: ['channel'], part: '', channel: 'mainValue' });
  assert.equal(sequenceTargetStatus(channel, [], { triggerType: 'valueChange' }).reason, 'feedback');
  assert.equal(sequenceTargetStatus({ path: 'ValueChannels.other', properties: [] }, [], { triggerType: 'valueChange' }).works, true);
  assert.equal(sequenceTargetStatus(frame, ['filmstrip_knobFrames']).animates, 'frame');
  assert.equal(sequenceTargetStatus(frame, ['background']).reason, 'missing part');
  // Any other path gets the transition's own answer: a sequence tracks what a transition eases.
  assert.equal(sequenceTargetStatus({ path: 'Parts.label.Layout.rotation', properties: ['transform'] }, ['label']).animates, 'transform');
  assert.equal(sequenceTargetStatus({ path: 'Parts.label.Effects.Filters.blur', properties: [] }, ['label']).reason, 'dead path');

  // describeTargets carries the row's kind and trigger, so the tab's verdicts follow them.
  const following = describeAnimation('a', { kind: 'sequence', trigger: { type: 'valueChange' }, targets: [channel, frame] });
  assert.deepEqual(describeTargets(following, ['filmstrip_knobFrames']).map((t) => t.status.works), [false, true]);
  // On a transition the row says why, in words, rather than "dead path".
  const easing = describeAnimation('a', { kind: 'transition', targets: [channel, frame] });
  assert.deepEqual(describeTargets(easing, ['filmstrip_knobFrames']).map((t) => t.status.reason), ['sequence only', 'sequence only']);
});

test('a channel keyframe drives the value, so the filmstrip frame follows; a frame keyframe wins over it', () => {
  const control = filmstripStarter();
  const at = (overlay) => resolveInteractiveControl(control, { keyframeOverlay: overlay });
  const frameOf = (r) => r.control._children.Parts._children.filmstrip_knobFrames._children.Image.frameIndex;
  assert.equal(frameOf(at({ 'ValueChannels.mainValue': 1 })), 7, 'eight frames, full value');
  assert.equal(at({ 'ValueChannels.mainValue': 1 }).runtime.signals.valueNormalized, 1);
  assert.equal(frameOf(at({ 'ValueChannels.mainValue': 0 })), 0);
  assert.equal(frameOf(at({ 'ValueChannels.mainValue': 1, 'Parts.filmstrip_knobFrames.Image.frameIndex': 2 })), 2);
  assert.equal(typeof at({ 'ValueChannels.mainValue': 1 }).control._children.ValueChannels._children.mainValue, 'object', 'the channel node is not overwritten');
  assert.equal(control._children.ValueChannels._children.mainValue.currentValue, 0.5, 'the document value is untouched');
});

test('switching to a sequence seeds a channel track from its value and a frame track from the resolved frame', () => {
  const control = filmstripStarter();
  const next = switched({ kind: 'transition', targets: [
    { path: 'ValueChannels.mainValue', properties: ['channel'] },
    { path: 'Parts.filmstrip_knobFrames.Image.frameIndex', properties: ['frame'] },
  ] }, 'sequence', control);
  assert.deepEqual(next.targets[0].keyframes, [{ time: 0, value: 0.5, easing: 'outQuad' }]);
  assert.deepEqual(next.targets[1].keyframes, [{ time: 0, value: 4, easing: 'outQuad' }], 'frame 4 of 8 at value 0.5');
  assert.equal(baseValueAt(control, 'ValueChannels.mainValue'), 0.5);
  assert.equal(baseValueAt(control, 'Parts.nosuchpart.opacity'), undefined);
});

test('a sequence can track the control itself, beside its channels and frames', async () => {
  const { OFFERED_ROOT_PROPERTIES, CONTROL_ITSELF } = await import('../src/CE_Application/utils/animationModel.js');
  const control = filmstripStarter();
  const offered = offeredTargetsFor(control, 'sequence', { onControl: true });
  assert.deepEqual(offered.filter((e) => e.scope === 'root').map((e) => e.path), OFFERED_ROOT_PROPERTIES.map((e) => e.path));
  assert.deepEqual(offered.filter((e) => e.scope === 'control').map((e) => e.path), ['ValueChannels.mainValue', 'Parts.filmstrip_knobFrames.Image.frameIndex']);
  const rotation = buildTarget(CONTROL_ITSELF, offered.find((e) => e.path === 'Transform.rotation'));
  assert.equal(sequenceTargetStatus(rotation, []).animates, 'transform');
  assert.equal(typeof baseValueAt(control, 'Transform.rotation'), 'number', 'so a new track has a value to start from');
  // The pose reaches the control through the same overlay a part track uses.
  const { control: posed } = resolveInteractiveControl(control, { keyframeOverlay: { 'Transform.rotation': 17 } });
  assert.equal(posed._children.Transform.rotation, 17);
});
