import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setlistConfig, setlistScenes, setlistCount, setlistIndex, sceneAt, currentScene,
  setlistChannel, setlistWraps, stepIndex, gotoIndex,
  footswitchCc, footswitchChannel, footswitchThreshold, footswitchEdge,
  FOOT_ACTIONS, sceneMessages, recallPlan, captureScene, sceneChangeCount, missingPaths,
  setlistGeometry, visibleRange, rowRect, rowAtPoint, MAX_SCENES,
  setlistScriptPatch, SETLIST_SCRIPT_ACTIONS,
  normalizeSysex, footswitchBackEdge, footswitchBackCc, crossfadeMs, blendValues,
} from '../src/CE_Application/utils/setlistLayout.js';

function sl(c) { return { _children: { Core: { controlType: 'Setlist' }, Setlist: c } }; }
const THREE = [
  { id: 'a', name: 'Opener', program: 4 },
  { id: 'b', name: 'Ballad', program: 12, bpm: 72 },
  { id: 'c', name: 'Closer', program: 40 },
];

test('config clamps and falls back', () => {
  assert.equal(setlistCount(sl({})), 0);
  assert.equal(setlistIndex(sl({})), -1, 'an empty setlist has no current scene');
  assert.equal(setlistIndex(sl({ scenes: THREE, index: 99 })), 2);
  assert.equal(setlistIndex(sl({ scenes: THREE, index: -5 })), 0);
  assert.equal(setlistChannel(sl({ channel: 99 })), 16);
  assert.equal(setlistWraps(sl({})), false, 'wrap is off by default');
  assert.equal(currentScene(sl({ scenes: THREE, index: 1 })).name, 'Ballad');
  assert.equal(sceneAt(sl({ scenes: THREE }), 9), null);
  assert.equal(setlistScenes(sl({ scenes: new Array(300).fill({ name: 'x' }) })).length, MAX_SCENES);
  assert.equal(FOOT_ACTIONS.length, 3);
});

test('a scene normalises its optional fields to null, not 0', () => {
  // 0 is a legal program number and a legal bank. "No program change" has to be
  // distinguishable from "program change to 0", or every scene without one
  // silently selects patch 1.
  const [s] = setlistScenes(sl({ scenes: [{ name: 'x' }] }));
  assert.equal(s.program, null);
  assert.equal(s.bankMsb, null);
  assert.equal(s.bpm, null);
  const [z] = setlistScenes(sl({ scenes: [{ name: 'x', program: 0, bankMsb: 0 }] }));
  assert.equal(z.program, 0, 'and an explicit 0 survives');
  assert.equal(z.bankMsb, 0);
});

// --- Stepping ---------------------------------------------------------------------
test('the end of the list stays put unless you ask for wrap', () => {
  // A setlist that jumps back to song one when you press next at the end of the
  // night is a bad surprise in front of an audience.
  assert.equal(stepIndex(THREE, 2, 1, false), 2);
  assert.equal(stepIndex(THREE, 0, -1, false), 0);
  assert.equal(stepIndex(THREE, 2, 1, true), 0, 'wrap on, if you want it');
  assert.equal(stepIndex(THREE, 0, -1, true), 2);
  assert.equal(stepIndex(THREE, 0, 1), 1);
  assert.equal(stepIndex(THREE, 1, -1), 0);
  assert.equal(stepIndex(THREE, 1, 0), 1, 'no delta, no move');
  assert.equal(stepIndex([], 0, 1), -1);
});

test('a disabled scene is skipped, not landed on', () => {
  // "Skip this one tonight" is the reason to have a disable — and stepping onto
  // a skipped scene would make the pedal look broken.
  const withSkip = [THREE[0], { ...THREE[1], enabled: false }, THREE[2]];
  assert.equal(stepIndex(withSkip, 0, 1), 2, 'straight past the skipped one');
  assert.equal(stepIndex(withSkip, 2, -1), 0);
  // Everything disabled: stay where you are rather than loop forever.
  const allOff = THREE.map((s) => ({ ...s, enabled: false }));
  assert.equal(stepIndex(allOff, 1, 1), 1);
  assert.equal(gotoIndex(THREE, 99), 2);
  assert.equal(gotoIndex([], 0), -1);
});

// --- The footswitch ----------------------------------------------------------------
test('a footswitch steps on the rising edge only', () => {
  // A momentary pedal sends 127 on press and 0 on release. Acting on both steps
  // the setlist twice per press — which on stage looks like the pedal skipping
  // a song, and is the commonest way a scene stepper is broken.
  const c = sl({ scenes: THREE, footCc: 64, footThreshold: 64 });
  const press = footswitchEdge(c, { kind: 'cc', cc: 64, value: 127, channel: 1 }, false);
  assert.deepEqual(press, { step: true, down: true });
  // Held: a pedal that repeats its value must not step again.
  const held = footswitchEdge(c, { kind: 'cc', cc: 64, value: 127, channel: 1 }, true);
  assert.deepEqual(held, { step: false, down: true });
  const release = footswitchEdge(c, { kind: 'cc', cc: 64, value: 0, channel: 1 }, true);
  assert.deepEqual(release, { step: false, down: false }, 'the release must not step');
  // And then it can step again.
  assert.equal(footswitchEdge(c, { kind: 'cc', cc: 64, value: 127, channel: 1 }, false).step, true);
});

test('the footswitch ignores everything that is not its pedal', () => {
  const c = sl({ scenes: THREE, footCc: 64, footChannel: 2 });
  assert.equal(footswitchEdge(c, { kind: 'cc', cc: 1, value: 127, channel: 2 }, false).step, false, 'wrong CC');
  assert.equal(footswitchEdge(c, { kind: 'cc', cc: 64, value: 127, channel: 3 }, false).step, false, 'wrong channel');
  assert.equal(footswitchEdge(c, { kind: 'bend', value: 127 }, false).step, false, 'not a CC at all');
  // A non-matching event must not clear the held state either, or the next
  // repeat of the real pedal would look like a fresh press.
  assert.equal(footswitchEdge(c, { kind: 'cc', cc: 1, value: 0, channel: 2 }, true).down, true);
  // Channel 0 listens everywhere.
  const any = sl({ scenes: THREE, footCc: 64, footChannel: 0 });
  assert.equal(footswitchEdge(any, { kind: 'cc', cc: 64, value: 127, channel: 7 }, false).step, true);
  assert.equal(footswitchCc(sl({})), 64);
  assert.equal(footswitchChannel(sl({})), 0);
  assert.equal(footswitchThreshold(sl({})), 64);
});

test('a continuous pedal crosses the threshold once', () => {
  // Some expression pedals sweep rather than switch. Sweeping up past the
  // threshold is one press, not thirty.
  const c = sl({ scenes: THREE, footCc: 11, footThreshold: 64 });
  let down = false; let steps = 0;
  for (const v of [0, 20, 40, 60, 64, 80, 100, 127, 100, 60, 20, 0, 80]) {
    const r = footswitchEdge(c, { kind: 'cc', cc: 11, value: v, channel: 1 }, down);
    down = r.down;
    if (r.step) steps += 1;
  }
  assert.equal(steps, 2, 'up once, back down, up again');
});

// --- Recall ------------------------------------------------------------------------
test('bank select comes before the program change', () => {
  // Bank select selects the bank the NEXT program change lands in. After the
  // program change it does nothing until the following scene.
  const msgs = sceneMessages({ program: 5, bankMsb: 1, bankLsb: 2 }, 1);
  assert.deepEqual(msgs.map((m) => m.kind), ['cc', 'cc', 'program']);
  assert.deepEqual(msgs[0].bytes, [0xB0, 0, 1]);
  assert.deepEqual(msgs[1].bytes, [0xB0, 32, 2]);
  assert.deepEqual(msgs[2].bytes, [0xC0, 5]);
  // Channel is 1-based on the way in and 0-based in the byte.
  assert.deepEqual(sceneMessages({ program: 5 }, 10)[0].bytes, [0xC9, 5]);
  assert.deepEqual(sceneMessages({ program: null, bankMsb: null }, 1), [], 'nothing to send');
  assert.deepEqual(sceneMessages(null, 1), []);
});

test('a recall sends MIDI before it writes values', () => {
  // A program change swaps the patch on the synth. The stored values belong to
  // that patch, so writing them first would put them into the OLD patch and let
  // the program change wipe them.
  const control = sl({
    scenes: [{ id: 'a', name: 'Opener', program: 4, bpm: 96, values: { 'Cutoff.value': 8000 } }],
    index: 0, channel: 1,
  });
  const plan = recallPlan(control, 0);
  assert.equal(plan.scene.name, 'Opener');
  assert.deepEqual(plan.messages.map((m) => m.kind), ['program']);
  assert.deepEqual(plan.values, { 'Cutoff.value': 8000 });
  assert.equal(plan.bpm, 96);
  // Each half can be switched off independently.
  const noPc = sl({ ...control._children.Setlist, sendProgram: false });
  assert.deepEqual(recallPlan(noPc, 0).messages, []);
  const noVals = sl({ ...control._children.Setlist, recallValues: false });
  assert.deepEqual(recallPlan(noVals, 0).values, {});
  const noTempo = sl({ ...control._children.Setlist, recallTempo: false });
  assert.equal(recallPlan(noTempo, 0).bpm, null);
  assert.deepEqual(recallPlan(control, 9), { scene: null, messages: [], values: {}, bpm: null });
});

test('capture takes an explicit list, never everything', () => {
  // The setlist's own index is a panel value. Capturing "everything" would
  // store the index the scene was captured at, and recalling it would move the
  // setlist — usually to itself, occasionally elsewhere, always confusingly.
  const read = (p) => ({ 'Cutoff.value': 8000, 'Res.value': 20 }[p]);
  const scene = captureScene({ id: 'a', name: 'Opener' }, ['Cutoff.value', 'Res.value'], read);
  assert.deepEqual(scene.values, { 'Cutoff.value': 8000, 'Res.value': 20 });
  assert.equal(scene.name, 'Opener', 'the rest of the scene survives');
  // A path that reads back undefined is left out rather than stored as null —
  // recalling null would write null into a control.
  const partial = captureScene({}, ['Cutoff.value', 'Gone.value'], read);
  assert.deepEqual(Object.keys(partial.values), ['Cutoff.value']);
  assert.deepEqual(captureScene({}, null, read).values, {});
});

test('the display can say how much a recall would change', () => {
  const read = (p) => ({ 'Cutoff.value': 8000, 'Res.value': 20 }[p]);
  const scene = { values: { 'Cutoff.value': 8000, 'Res.value': 99 } };
  assert.equal(sceneChangeCount(scene, read), 1, 'only Res differs');
  assert.equal(sceneChangeCount({ values: {} }, read), 0);
  // And which paths a scene forgot — the usual cause of "that knob stayed
  // where the last song left it".
  assert.deepEqual(missingPaths(scene, ['Cutoff.value', 'Res.value', 'Drive.value']), ['Drive.value']);
  assert.deepEqual(missingPaths(null, ['A']), ['A']);
});

// --- Geometry -------------------------------------------------------------------
test('the current scene is kept in view, and off the edge where there is room', () => {
  // A setlist that always shows the current song at the bottom tells you
  // nothing about what is coming.
  const geom = setlistGeometry(200, 100, 20, 8, 20, 18);
  assert.equal(geom.visible, 3);
  const early = visibleRange(geom, 0);
  assert.deepEqual(early, { first: 0, last: 2 });
  const mid = visibleRange(geom, 10);
  assert.ok(mid.first < 10 && mid.last > 10, 'with something after it');
  const end = visibleRange(geom, 19);
  assert.equal(end.last, 19);
  assert.equal(end.first, 17, 'clamped to the end of the list');
  // A list shorter than the window shows all of it.
  const small = setlistGeometry(200, 100, 2, 8, 20, 18);
  assert.deepEqual(visibleRange(small, 0), { first: 0, last: 1 });
});

test('rows hit-test where they are drawn', () => {
  const geom = setlistGeometry(200, 100, 20, 8, 20, 18);
  const { first } = visibleRange(geom, 10);
  const r = rowRect(geom, first + 1, first);
  assert.equal(rowAtPoint(geom, 10, r.x + 5, r.y + 5), first + 1);
  assert.equal(rowAtPoint(geom, 10, r.x + 5, geom.y0 + geom.h + 50), null, 'below the list');
  assert.equal(rowAtPoint(geom, 10, -20, r.y + 5), null, 'left of it');
});

// --- the script API ------------------------------------------------------------------

test('a scripted step moves the index and nothing else', () => {
  // It does NOT recall. The recall is driven by the index changing, so the
  // pedal, a click, a script and a hand edit all take one path.
  const cfg = { scenes: THREE, index: 0, wrap: false };
  assert.deepEqual(setlistScriptPatch(cfg, 'next', {}), { index: 1 });
  assert.deepEqual(setlistScriptPatch({ ...cfg, index: 1 }, 'prev', {}), { index: 0 });
  // The same rules the pedal obeys: the end stays put, disabled scenes skipped.
  assert.deepEqual(setlistScriptPatch({ ...cfg, index: 2 }, 'next', {}), {});
  assert.deepEqual(setlistScriptPatch({ ...cfg, index: 2, wrap: true }, 'next', {}), { index: 0 });
  const skip = { scenes: [THREE[0], { ...THREE[1], enabled: false }, THREE[2]], index: 0 };
  assert.deepEqual(setlistScriptPatch(skip, 'next', {}), { index: 2 });
  for (const action of SETLIST_SCRIPT_ACTIONS) {
    assert.ok(Object.keys(setlistScriptPatch(cfg, action, {})).length <= 1);
  }
});

test('goto takes a 1-based number or a scene name', () => {
  // A name survives someone reordering the set; a number doesn't.
  const cfg = { scenes: THREE, index: 0 };
  assert.deepEqual(setlistScriptPatch(cfg, 'goto', { scene: 3 }), { index: 2 }, '1-based in');
  assert.deepEqual(setlistScriptPatch(cfg, 'goto', { scene: 'Closer' }), { index: 2 });
  assert.deepEqual(setlistScriptPatch(cfg, 'goto', { scene: 'c' }), { index: 2 }, 'by id too');
  assert.deepEqual(setlistScriptPatch(cfg, 'goto', { scene: 1 }), {}, 'already there');
  // Out of range, missing, or a name that isn't there: no-ops, not throws.
  assert.deepEqual(setlistScriptPatch(cfg, 'goto', { scene: 99 }), {});
  assert.deepEqual(setlistScriptPatch(cfg, 'goto', { scene: 0 }), {});
  assert.deepEqual(setlistScriptPatch(cfg, 'goto', { scene: 'Encore' }), {});
  assert.deepEqual(setlistScriptPatch(cfg, 'goto', {}), {});
});

test('enable skips a song tonight without editing the set', () => {
  const cfg = { scenes: THREE, index: 0 };
  const patch = setlistScriptPatch(cfg, 'enable', { scene: 'Ballad', enabled: false });
  assert.equal(patch.scenes[1].enabled, false);
  assert.equal(patch.scenes[0].enabled, true, 'the others are untouched');
  // Already in that state, or a scene that isn't there: nothing.
  assert.deepEqual(setlistScriptPatch(cfg, 'enable', { scene: 'Ballad', enabled: true }), {});
  assert.deepEqual(setlistScriptPatch(cfg, 'enable', { scene: 'Nope' }), {});
  assert.deepEqual(setlistScriptPatch(cfg, 'enable', { scene: 9 }), {});
});

test('wrap toggles when unspecified and is idempotent when told', () => {
  assert.deepEqual(setlistScriptPatch({ scenes: THREE, wrap: false }, 'wrap', {}), { wrap: true });
  assert.deepEqual(setlistScriptPatch({ scenes: THREE, wrap: true }, 'wrap', { wrap: true }), {});
  assert.deepEqual(setlistScriptPatch({ scenes: THREE, wrap: true }, 'wrap', { wrap: false }), { wrap: false });
  // An empty setlist has nothing to step, but wrap is still a setting.
  assert.deepEqual(setlistScriptPatch({ scenes: [] }, 'next', {}), {});
  assert.deepEqual(setlistScriptPatch({ scenes: [] }, 'wrap', { wrap: true }), { wrap: true });
  assert.deepEqual(setlistScriptPatch(null, 'nonsense', {}), {});
});

// --- scene extras, back pedal, crossfade -----------------------------------------

test('extra CCs come after the program change, not before', () => {
  // A patch change on most synths resets its controllers, so a CC sent first
  // would be wiped by the very patch it was meant to modify.
  const [s] = setlistScenes(sl({ scenes: [{ program: 5, bankMsb: 1, ccs: [{ cc: 91, value: 0 }] }] }));
  const msgs = sceneMessages(s, 1);
  assert.deepEqual(msgs.map((m) => m.kind), ['cc', 'program', 'cc'], 'bank, program, then extras');
  assert.deepEqual(msgs[2].bytes, [0xB0, 91, 0]);
  // A CC may name its own channel; null means the setlist's.
  const [own] = setlistScenes(sl({ scenes: [{ ccs: [{ cc: 7, value: 100, channel: 9 }] }] }));
  assert.deepEqual(sceneMessages(own, 1)[0].bytes, [0xB8, 7, 100]);
});

test('sysex is framed here rather than trusted', () => {
  // An unterminated sysex leaves the receiving device waiting for the rest of a
  // message that never arrives.
  assert.deepEqual(normalizeSysex([0x41, 0x10]), [0xF0, 0x41, 0x10, 0xF7]);
  assert.deepEqual(normalizeSysex([0xF0, 0x41, 0xF7]), [0xF0, 0x41, 0xF7], 'already framed');
  assert.deepEqual(normalizeSysex([]), [], 'nothing is nothing');
  // A stray status byte inside the body would end the message early.
  assert.deepEqual(normalizeSysex([0x41, 0x90, 0x10]), [0xF0, 0x41, 0x10, 0xF7]);
  const [s] = setlistScenes(sl({ scenes: [{ sysex: [0x41, 0x10] }] }));
  assert.deepEqual(sceneMessages(s, 1).map((m) => m.kind), ['sysex']);
});

test('a back pedal has its own held state', () => {
  // Two pedals sharing one boolean would have each release cancel the other's
  // press.
  const c = sl({ scenes: THREE, footCc: 64, footBackCc: 65 });
  assert.equal(footswitchBackEdge(c, { kind: 'cc', cc: 65, value: 127, channel: 1 }, false).step, true);
  assert.equal(footswitchBackEdge(c, { kind: 'cc', cc: 65, value: 127, channel: 1 }, true).step, false);
  assert.equal(footswitchBackEdge(c, { kind: 'cc', cc: 64, value: 127, channel: 1 }, false).step, false, 'not its pedal');
  // No back pedal configured: never steps, and null is distinguishable from 0,
  // which is a legal CC number.
  assert.equal(footswitchBackCc(sl({})), null);
  assert.equal(footswitchBackCc(sl({ footBackCc: 0 })), 0);
  assert.equal(footswitchBackEdge(sl({ scenes: THREE }), { kind: 'cc', cc: 0, value: 127 }, false).step, false);
});

test('a crossfade interpolates numbers and switches everything else halfway', () => {
  // There is no meaningful value between "sine" and "square", and writing one
  // would put nonsense into a control.
  assert.deepEqual(blendValues({ 'a.v': 0 }, { 'a.v': 100 }, 0.25), { 'a.v': 25 });
  assert.deepEqual(blendValues({ 'a.v': 0 }, { 'a.v': 100 }, 1), { 'a.v': 100 });
  assert.deepEqual(blendValues({ 'a.w': 'sine' }, { 'a.w': 'square' }, 0.4), { 'a.w': 'sine' });
  assert.deepEqual(blendValues({ 'a.w': 'sine' }, { 'a.w': 'square' }, 0.6), { 'a.w': 'square' });
  // A path with no start value jumps to the target rather than being skipped.
  assert.deepEqual(blendValues({}, { 'a.v': 50 }, 0.1), { 'a.v': 50 });
  assert.equal(crossfadeMs(sl({})), 0, 'snapping is the default — a scene change is complete');
  assert.equal(crossfadeMs(sl({ crossfadeMs: 99999 })), 10000);
  assert.deepEqual(setlistScriptPatch({ scenes: THREE }, 'crossfade', { ms: 500 }), { crossfadeMs: 500 });
});
