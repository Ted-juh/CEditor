// momentaryButtonPreview.test.js — the two momentary subtypes that were never wired.
//
// `momentary / repeating` and `momentary / press_to_talk` have been in the Behavior model and in
// the Properties panel from the start. A repo-wide search found `repeatEnabled`, `repeatDelay`,
// `repeatInterval` and `activeWhileHeld` in exactly three files — the model, BehaviorEditor.svelte
// and a menu list — and read by nothing. Their neighbours in the `timed` family are fully
// implemented, which is what marks these two as an oversight.
//
// The clock is injected, as it is for the timed twin, so the timings are ASSERTED rather than
// waited out: a test that sleeps 300 ms to check a 300 ms delay proves the machine is slow, not
// that the delay is right.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMomentaryButtonPreviewController,
  isPressToTalkBehavior,
  isRepeatingBehavior,
  resolveRepeatConfig,
} from '../src/CE_Application/utils/momentaryButtonPreview.js';

/** A clock the test drives by hand. Intervals re-arm themselves the way the real one does. */
function createScheduler() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  const timeout = (callback, delay = 0) => {
    const id = (nextId += 1);
    timers.set(id, { callback, runAt: now + Math.max(0, Number(delay) || 0), every: 0 });
    return id;
  };
  const interval = (callback, period = 1) => {
    const p = Math.max(1, Number(period) || 1);
    const id = (nextId += 1);
    timers.set(id, { callback, runAt: now + p, every: p });
    return id;
  };
  const clear = (id) => { timers.delete(id); };

  function advance(ms) {
    const until = now + Math.max(0, Number(ms) || 0);
    // Fire in time order, re-arming repeats, so a 1000 ms jump produces every tick in between.
    for (;;) {
      let next = null;
      for (const [id, t] of timers) {
        if (t.runAt > until) continue;
        if (!next || t.runAt < next.t.runAt) next = { id, t };
      }
      if (!next) break;
      now = next.t.runAt;
      if (next.t.every > 0) next.t.runAt = now + next.t.every;
      else timers.delete(next.id);
      next.t.callback();
    }
    now = until;
  }

  return { timeout, interval, clear, advance, pending: () => timers.size };
}

/** A controller wired to the fake clock, recording every patch it sends. */
function harness() {
  const clock = createScheduler();
  const patches = [];
  const controller = createMomentaryButtonPreviewController({
    patchSession: (id, patch) => patches.push({ id, ...patch }),
    scheduleTimeout: clock.timeout,
    clearTimeoutFn: clock.clear,
    scheduleInterval: clock.interval,
    clearIntervalFn: clock.clear,
  });
  const fires = () => patches.filter((p) => p.repeatCount !== undefined);
  return { clock, patches, controller, fires };
}

const REPEATING = { buttonType: 'momentary', subtype: 'repeating', repeatEnabled: true, repeatDelay: 300, repeatInterval: 120 };
const TALK = { buttonType: 'momentary', subtype: 'press_to_talk', activeWhileHeld: true };
const PLAIN = { buttonType: 'momentary', subtype: 'action' };

/* ------------------------------------------------------------------ recognising the behaviours */

test('the two subtypes are recognised, and a plain momentary button is left alone', () => {
  assert.equal(isRepeatingBehavior(REPEATING), true);
  assert.equal(isPressToTalkBehavior(TALK), true);
  assert.equal(isRepeatingBehavior(PLAIN), false);
  assert.equal(isPressToTalkBehavior(PLAIN), false);
  // The Properties panel writes the flag as well as the subtype, and turning the flag off is how
  // an author disables the repeat without changing the subtype.
  assert.equal(isRepeatingBehavior({ ...REPEATING, repeatEnabled: false }), false);
  // A timed button is somebody else's job.
  assert.equal(isRepeatingBehavior({ buttonType: 'timed', subtype: 'repeating' }), false);
});

test('the config is clamped the way the Properties panel clamps it', () => {
  assert.deepEqual(resolveRepeatConfig(REPEATING), { delay: 300, interval: 120 });
  assert.deepEqual(resolveRepeatConfig({}), { delay: 300, interval: 120 }, 'the stored defaults');
  assert.deepEqual(resolveRepeatConfig({ repeatDelay: -50, repeatInterval: 0 }), { delay: 0, interval: 10 },
    'a zero delay is legal — a zero interval is a busy loop, not a fast roll');
});

/* ------------------------------------------------------------------------------- repeating */

test('nothing fires before the delay, and the first repeat lands ON it', () => {
  const { clock, controller, fires } = harness();
  controller.beginPress('pad', REPEATING);

  clock.advance(299);
  assert.equal(fires().length, 0, 'it fired during the delay');
  clock.advance(1);
  assert.equal(fires().length, 1, 'the first repeat should land at the delay, not an interval after');
});

test('it then fires once per interval, for as long as it is held', () => {
  const { clock, controller, fires } = harness();
  controller.beginPress('pad', REPEATING);

  clock.advance(300);                     // first
  clock.advance(120 * 5);                 // five more
  assert.equal(fires().length, 6);
  // The counter only ever goes up, which is the whole reason it is a counter: two `executed: true`
  // patches are indistinguishable, and at 120 ms they are certain to arrive as one.
  assert.deepEqual(fires().map((f) => f.repeatCount), [1, 2, 3, 4, 5, 6]);
});

test('a repeat never says the button was released', () => {
  const { clock, controller, patches } = harness();
  controller.beginPress('pad', REPEATING);
  clock.advance(300 + 120 * 3);
  assert.equal(patches.some((p) => p.pressed === false), false,
    'the button is still held — a release here would flicker the visual and raise a lie');
});

test('releasing stops it, and nothing fires afterwards', () => {
  const { clock, controller, fires } = harness();
  controller.beginPress('pad', REPEATING);
  clock.advance(300 + 120 * 2);
  const before = fires().length;

  controller.releasePress('pad', REPEATING);
  clock.advance(120 * 10);
  assert.equal(fires().length, before, 'the roll outlived the finger');
  assert.equal(clock.pending(), 0, 'a timer was left running');
});

test('releasing DURING the delay never starts it', () => {
  const { clock, controller, fires } = harness();
  controller.beginPress('pad', REPEATING);
  clock.advance(100);
  controller.releasePress('pad', REPEATING);
  clock.advance(1000);
  assert.equal(fires().length, 0, 'a tap on a repeating button must not start a roll');
});

test('a zero delay starts immediately', () => {
  const { clock, controller, fires } = harness();
  controller.beginPress('pad', { ...REPEATING, repeatDelay: 0 });
  assert.equal(fires().length, 1, 'delay 0 means the first fire is the press itself');
  clock.advance(120);
  assert.equal(fires().length, 2);
});

test('two buttons roll independently, at their own rates', () => {
  const { clock, controller, fires } = harness();
  controller.beginPress('slow', { ...REPEATING, repeatDelay: 0, repeatInterval: 200 });
  controller.beginPress('fast', { ...REPEATING, repeatDelay: 0, repeatInterval: 50 });
  clock.advance(200);

  const per = (id) => fires().filter((f) => f.id === id).length;
  assert.equal(per('slow'), 2, '1 at press + 1 at 200ms');
  assert.equal(per('fast'), 5, '1 at press + 4 at 50ms');
});

test('a vanished control stops rolling — cancel and syncKeys both end it', () => {
  for (const stop of ['cancel', 'syncKeys']) {
    const { clock, controller, fires } = harness();
    controller.beginPress('pad', { ...REPEATING, repeatDelay: 0 });
    clock.advance(120);
    const before = fires().length;

    if (stop === 'cancel') controller.cancel('pad');
    else controller.syncKeys([]);          // the control is no longer on the panel

    clock.advance(120 * 10);
    assert.equal(fires().length, before, `${stop} left the roll running`);
    assert.equal(clock.pending(), 0, `${stop} left a timer behind`);
  }
});

test('destroy stops everything at once', () => {
  const { clock, controller, fires } = harness();
  controller.beginPress('a', { ...REPEATING, repeatDelay: 0 });
  controller.beginPress('b', { ...REPEATING, repeatDelay: 0 });
  const before = fires().length;
  controller.destroy();
  clock.advance(1000);
  assert.equal(fires().length, before);
  assert.equal(clock.pending(), 0);
});

/* --------------------------------------------------------------------------- press to talk */

test('press to talk is active only while held', () => {
  const { controller } = harness();
  assert.deepEqual(controller.beginPress('ptt', TALK), { checked: true });
  assert.deepEqual(controller.releasePress('ptt', TALK), { checked: false });
});

test('press to talk hands its field BACK rather than patching separately', () => {
  // The whole reason it returns instead of patching. A second patch in the same tick reaches the
  // script runtime while it is dispatching the first, and gets dropped — which is exactly how
  // press-to-talk reported its release and never its press. The caller folds this into the press
  // patch it is already sending, and one patch cannot race itself.
  const { controller, patches } = harness();
  controller.beginPress('ptt', TALK);
  controller.releasePress('ptt', TALK);
  assert.deepEqual(patches, [], 'press to talk must not send a patch of its own');
});

test('the two subtypes do not answer for each other, or for a plain button', () => {
  const { clock, controller, patches, fires } = harness();
  assert.equal(controller.beginPress('plain', PLAIN), null, 'a plain momentary button is untouched');
  clock.advance(2000);
  assert.equal(patches.length, 0);

  controller.beginPress('ptt', TALK);
  clock.advance(2000);
  assert.equal(fires().length, 0, 'press to talk must not roll');
});

/* --------------------------------------------------- the other half: a script has to hear it */

test('every repeat reaches a script as onClick', async () => {
  // The controller only patches a session; what makes the feature real is the runtime turning that
  // into an event. onClick, not a new name: "keeps firing while held" is firing, and onClick is
  // already what "it fired" means in the contract.
  const { get } = await import('svelte/store');
  const { scriptApiForTesting, runPreviewSessionsForTesting } =
    await import('../src/CE_Application/scripting/panelRuntime.js');
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { panels, activePanelId } = await import('../src/CE_Application/stores/panels.js');
  const { panelPreviewSessions } = await import('../src/CE_Application/stores/interactionPreview.js');
  const { MODULES } = await import('../src/CE_Application/scripting/panelApi.js');

  const button = createControl('Button', { name: 'Roll' });
  button._children.Behavior = {
    ...button._children.Behavior,
    subtype: 'repeating', repeatEnabled: true, repeatDelay: 0, repeatInterval: 50,
  };
  const id = button._children.Core.id;
  panels.set([{ id: 'p', name: 'P', controls: [button], scripting: { modules: MODULES.map((m) => m.id) } }]);
  activePanelId.set('p');
  try {
    const api = scriptApiForTesting('', 'roll');
    let clicks = 0;
    api.on('Roll', 'click', () => { clicks += 1; });

    // Press, then three repeats — exactly what the controller patches.
    panelPreviewSessions.set({ [id]: { pressed: true, hover: true, repeatCount: 0 } });
    await runPreviewSessionsForTesting();
    const before = clicks;
    for (const n of [1, 2, 3]) {
      panelPreviewSessions.set({ [id]: { pressed: true, hover: true, repeatCount: n } });
      await runPreviewSessionsForTesting();
    }
    assert.equal(clicks - before, 3, 'three repeats have to arrive as three onClicks, not one');
  } finally { panels.set([]); panelPreviewSessions.set({}); }
});

test('a session change that lands mid-dispatch is not lost', async () => {
  // The wider bug press-to-talk exposed. Two patches in one tick: the first starts an async
  // dispatch, the second arrives while `live.dispatching` is true. It used to be refused AND then
  // absorbed by the re-seed at the end of that dispatch, so it became the new baseline and never
  // happened. Anything patching twice in a tick hit it.
  const { get } = await import('svelte/store');
  const { scriptApiForTesting, runPreviewSessionsForTesting } =
    await import('../src/CE_Application/scripting/panelRuntime.js');
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { panels, activePanelId } = await import('../src/CE_Application/stores/panels.js');
  const { panelPreviewSessions } = await import('../src/CE_Application/stores/interactionPreview.js');
  const { MODULES } = await import('../src/CE_Application/scripting/panelApi.js');

  const button = createControl('Button', { name: 'Talk' });
  const id = button._children.Core.id;
  panels.set([{ id: 'p', name: 'P', controls: [button], scripting: { modules: MODULES.map((m) => m.id) } }]);
  activePanelId.set('p');
  try {
    const api = scriptApiForTesting('', 'talk');
    const seen = [];
    api.on('Talk', 'valueChanged', (v) => { seen.push(v); });

    panelPreviewSessions.set({ [id]: { pressed: false, hover: true, checked: false } });
    await runPreviewSessionsForTesting();

    // press: `pressed` first, then `checked` — the two-patch shape the surface produced. Driven
    // through the store, because the retry re-reads it exactly as the live subscription does.
    panelPreviewSessions.set({ [id]: { pressed: true, hover: true, checked: false } });
    const first = runPreviewSessionsForTesting();
    panelPreviewSessions.set({ [id]: { pressed: true, hover: true, checked: true } });
    runPreviewSessionsForTesting();          // arrives mid-dispatch
    await first;
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    assert.deepEqual(seen, [true],
      'the value asserted during the first dispatch never arrived — it was swallowed by the re-seed');
  } finally { panels.set([]); panelPreviewSessions.set({}); }
});

test('a hold that rolled does not strike once more on the way up', async () => {
  // "Keeps firing while held" means the fires happened during the hold. Release is where they
  // STOP. Treating it as one more click made every roll a hit too long, audibly.
  const { scriptApiForTesting, runPreviewSessionsForTesting } =
    await import('../src/CE_Application/scripting/panelRuntime.js');
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { panels, activePanelId } = await import('../src/CE_Application/stores/panels.js');
  const { panelPreviewSessions } = await import('../src/CE_Application/stores/interactionPreview.js');
  const { MODULES } = await import('../src/CE_Application/scripting/panelApi.js');

  const roll = createControl('Button', { name: 'Roll' });
  const plain = createControl('Button', { name: 'Plain' });
  const rollId = roll._children.Core.id;
  const plainId = plain._children.Core.id;
  panels.set([{ id: 'p', name: 'P', controls: [roll, plain], scripting: { modules: MODULES.map((m) => m.id) } }]);
  activePanelId.set('p');
  try {
    const api = scriptApiForTesting('', 'trailing');
    const clicks = { Roll: 0, Plain: 0 };
    api.on('Roll', 'click', () => { clicks.Roll += 1; });
    api.on('Plain', 'click', () => { clicks.Plain += 1; });

    const sessions = (patch) => { panelPreviewSessions.set(patch); return runPreviewSessionsForTesting(); };
    const rest = { pressed: false, hover: true, repeatCount: 0 };
    await sessions({ [rollId]: { ...rest }, [plainId]: { ...rest } });

    // Both held. The roll fires twice while down; the plain one does nothing until it comes up.
    await sessions({ [rollId]: { ...rest, pressed: true }, [plainId]: { ...rest, pressed: true } });
    await sessions({ [rollId]: { ...rest, pressed: true, repeatCount: 1 }, [plainId]: { ...rest, pressed: true } });
    await sessions({ [rollId]: { ...rest, pressed: true, repeatCount: 2 }, [plainId]: { ...rest, pressed: true } });
    assert.deepEqual(clicks, { Roll: 2, Plain: 0 }, 'the repeats should have arrived, and only those');

    // Both released.
    await sessions({ [rollId]: { ...rest, repeatCount: 2 }, [plainId]: { ...rest } });
    assert.deepEqual(clicks, { Roll: 2, Plain: 1 },
      'the roll gained a hit on release; a plain button must still click there');
  } finally { panels.set([]); panelPreviewSessions.set({}); }
});

test('the press zeroes the counter, so one hold cannot inherit the last one', () => {
  const { clock, controller, fires } = harness();
  assert.deepEqual(controller.beginPress('pad', { ...REPEATING, repeatDelay: 0 }), { repeatCount: 0 });
  clock.advance(120 * 2);
  controller.releasePress('pad', REPEATING);

  const second = controller.beginPress('pad', { ...REPEATING, repeatDelay: 0 });
  assert.deepEqual(second, { repeatCount: 0 }, 'a fresh hold has to start from zero');
  assert.equal(fires().at(-1).repeatCount, 1, 'and so does the counter it patches');
});
