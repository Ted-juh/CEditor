import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buttonFiring, createButtonFiring, defaultFires, FIRE_PULSE_MS } from '../src/CE_Application/utils/customButtonFiring.js';

// A clock the test moves by hand, a millisecond at a time where order matters.
function clock() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  return {
    schedule(fn, ms = 0) { const id = next += 1; timers.set(id, { fn, at: now + Math.max(0, Number(ms) || 0) }); return id; },
    clear(id) { timers.delete(id); },
    advance(ms) {
      for (let i = 0; i < ms; i += 1) {
        now += 1;
        for (const [id, timer] of [...timers]) if (timer.at <= now && timers.has(id)) { timers.delete(id); timer.fn(); }
      }
    },
  };
}

// A button's value and flags as a surface would keep them.
function harness() {
  const time = clock();
  const seen = { value: false, flags: {}, acts: [] };
  const firing = createButtonFiring({
    act: (_context, what) => {
      seen.acts.push(what);
      seen.value = what === 'flip' ? !seen.value : what === 'on';
    },
    flags: (_context, flags) => Object.assign(seen.flags, flags),
    scheduleTimeout: time.schedule,
    clearTimeoutFn: time.clear,
  });
  return { time, seen, firing };
}

test('a button fires as it always has unless it says otherwise', () => {
  assert.equal(buttonFiring({ type: 'button' }), null, 'a momentary button, on while held');
  assert.equal(buttonFiring({ type: 'toggle' }), null, 'a toggle, flipped on release');
  assert.equal(buttonFiring({ type: 'button', fires: 'held' }), null, 'its own way, said');
  assert.equal(buttonFiring({ type: 'slider', fires: 'hold' }), null, 'not a button');
  assert.deepEqual([defaultFires({ type: 'toggle' }), defaultFires({ type: 'button' })], ['release', 'held']);
  assert.equal(buttonFiring({ type: 'button', fires: 'hold' }).holdMs, 1200);
  assert.equal(buttonFiring({ type: 'toggle', afterwards: 'disabled' }).fires, 'release');
});

test('after a hold: it fires once the hold is long enough, not when let go sooner', () => {
  const { time, seen, firing } = harness();
  const config = buttonFiring({ type: 'button', fires: 'hold', holdMs: 500 });
  firing.press('b', config, {});
  assert.equal(seen.flags.pending, true, 'pending while it is held');
  time.advance(300);
  firing.release('b', config, { inside: true });
  assert.deepEqual(seen.acts, [], 'let go too soon: nothing');
  assert.equal(seen.flags.pending, false);
  firing.press('b', config, {});
  time.advance(500);
  assert.deepEqual(seen.acts, ['on'], 'held long enough: fired, still held');
  assert.equal(seen.flags.executed, true);
  time.advance(FIRE_PULSE_MS);
  assert.deepEqual(seen.acts, ['on', 'off'], 'on for a moment');
  firing.release('b', config, { inside: true });
  assert.deepEqual(seen.acts, ['on', 'off'], 'the release adds nothing');
});

test('on a double click: the second click within the window fires; a slow one starts again', () => {
  const { time, seen, firing } = harness();
  const config = buttonFiring({ type: 'toggle', fires: 'double', clickWindow: 300 });
  const click = () => { firing.press('t', config, {}); firing.release('t', config, { inside: true }); };
  click();
  time.advance(400);
  click();
  assert.equal(seen.value, false, 'too slow: one click, twice');
  time.advance(100);
  click();
  assert.equal(seen.value, true, 'two within the window: flipped');
});

test('again and again while held: at the press, after the delay, then every interval, until let go', () => {
  const { time, seen, firing } = harness();
  const config = buttonFiring({ type: 'button', fires: 'repeat', repeatDelay: 300, repeatInterval: 100 });
  firing.press('r', config, {});
  const ons = () => seen.acts.filter((what) => what === 'on').length;
  assert.equal(ons(), 1, 'at the press');
  time.advance(299);
  assert.equal(ons(), 1);
  time.advance(1);
  assert.equal(ons(), 2, 'after the delay');
  time.advance(200);
  assert.equal(ons(), 4, 'then every interval');
  firing.release('r', config, { inside: true });
  time.advance(500);
  assert.equal(ons(), 4, 'not after it is let go');
  assert.equal(seen.value, false, 'and off');
});

test('once, then disabled; or locked for a time and ready again', () => {
  const { time, seen, firing } = harness();
  const once = buttonFiring({ type: 'button', fires: 'release', afterwards: 'disabled' });
  firing.press('o', once, {});
  firing.release('o', once, { inside: true });
  assert.equal(seen.acts.length, 1);
  assert.equal(seen.flags.disabled, true);
  assert.equal(firing.press('o', once, {}), false, 'a press does nothing');
  time.advance(10000);
  assert.equal(firing.locked('o'), true, 'for good');

  const locked = buttonFiring({ type: 'button', fires: 'press', afterwards: 'locked', lockMs: 1000 });
  firing.press('l', locked, {});
  firing.release('l', locked, { inside: true });
  assert.equal(firing.press('l', locked, {}), false, 'locked');
  time.advance(1000);
  assert.equal(firing.locked('l'), false, 'ready again');
  assert.equal(seen.flags.disabled, false);
  assert.equal(firing.press('l', locked, {}), true);
});

test('only while held, let go outside: off all the same; when released, let go outside: nothing', () => {
  const { seen, firing } = harness();
  const held = buttonFiring({ type: 'toggle', fires: 'held' });
  firing.press('h', held, {});
  assert.equal(seen.value, true);
  firing.release('h', held, { inside: false });
  assert.equal(seen.value, false);
  const released = buttonFiring({ type: 'toggle', fires: 'release', afterwards: 'disabled' });
  firing.press('x', released, {});
  firing.release('x', released, { inside: false });
  assert.equal(seen.value, false, 'not fired');
  assert.equal(firing.locked('x'), false, 'and not spent');
});

test('the surfaces time a component button by its firing, and the Interact card edits it', () => {
  const preview = readFileSync(new URL('../src/CE_Application/editor/PanelPreviewSurface.svelte', import.meta.url), 'utf8');
  const bench = readFileSync(new URL('../src/CE_Application/components/InteractiveTestSurface.svelte', import.meta.url), 'utf8');
  for (const source of [preview, bench]) {
    assert.match(source, /customButtonFiring\.press\(firing\.key, firing\.config, firing\.context\)/);
    assert.match(source, /customButtonFiring\.release\(firing\.key, firing\.config, \{ inside/);
    assert.match(source, /customButtonFiring\.destroy\(\)/);
  }
  const interact = readFileSync(new URL('../src/CE_Application/sections/CustomInteractEditor.svelte', import.meta.url), 'utf8');
  assert.match(interact, /<em>Fires<\/em>[\s\S]*?setBehaviorField\(behaviorName, 'fires'/);
  assert.match(interact, /<em>Afterwards<\/em>[\s\S]*?setBehaviorField\(behaviorName, 'afterwards'/);
  for (const words of ['when pressed', 'when released', 'after a hold', 'on a double click', 'again and again while held', 'only while held']) {
    assert.ok(interact.includes(`'${words}'`), words);
  }
});

test('a timed, one-shot or repeating button comes in as layers that fire as it did; Minus reads one value less another', async () => {
  const { createControl } = await import('../src/CE_Application/models/componentTypes.js');
  const { getControlSet } = await import('../src/CE_Application/models/controlSets.js');
  const { planComponentFromSelection } = await import('../src/CE_Application/utils/customComponentFromControls.js');
  const { applyCustomBindings } = await import('../src/CE_Application/utils/interactionRuntime.js');
  const button = (behavior) => createControl('Button', { Core: { id: 'b1', name: 'Go' }, Transform: { x: 20, y: 20, width: 120, height: 40 }, Behavior: behavior, Text: { content: 'GO' } });
  const plan = (control) => planComponentFromSelection({ id: 'p', controlSet: { id: 'graphite' }, controlSets: [], controls: [control] }, ['b1'],
    { set: getControlSet('graphite'), name: 'T', valueControlsAs: 'layers' });
  const behaviourOf = (behavior) => {
    const made = plan(button(behavior));
    assert.ok(made.ok, JSON.stringify(made.refused));
    return Object.values(made.component._children.Behaviors._children)[0];
  };
  assert.equal(behaviourOf({ buttonType: 'timed', subtype: 'hold_to_confirm', holdDuration: 800 }).holdMs, 800);
  assert.deepEqual((({ fires, clicks }) => ({ fires, clicks }))(behaviourOf({ buttonType: 'timed', subtype: 'double_click', requiredClicks: 3 })), { fires: 'double', clicks: 3 });
  assert.equal(behaviourOf({ buttonType: 'one_shot' }).afterwards, 'disabled');
  assert.deepEqual((({ afterwards, lockMs }) => ({ afterwards, lockMs }))(behaviourOf({ buttonType: 'one_shot', lockoutDuration: 2000 })), { afterwards: 'locked', lockMs: 2000 });
  assert.equal(behaviourOf({ buttonType: 'momentary', subtype: 'repeating', repeatEnabled: true, repeatInterval: 90 }).repeatInterval, 90);
  assert.equal(behaviourOf({ buttonType: 'momentary', subtype: 'press_to_talk' }).fires, undefined, 'on while held, as any momentary button');
  assert.match(plan(button({ buttonType: 'radio' })).refused?.[0]?.reason ?? '', /toggle or a momentary/);
  // A held timed button looks pressed while held, not only while its value pulses.
  const held = plan(button({ buttonType: 'timed' })).component;
  assert.ok(Object.values(held._children.States._children).some((state) => state?.when?.pressed === true && state?.when?.activeCustomHitZone));
  // Minus: the source less another source.
  const control = { _children: { Parts: { _children: { bar: { _children: { Layout: { width: 0 } } } } }, Bindings: { _children: {
    gap: { _type: 'Binding', name: 'gap', enabled: true, source: 'channel.End.normalized', minus: 'channel.Start.normalized', mapMode: 'range', target: 'Parts.bar.Layout.width', inputMin: -1, inputMax: 1, outputMin: -100, outputMax: 100, clamp: true },
  } } } };
  applyCustomBindings(control, { customChannels: { 'channel.End.normalized': 0.2, 'channel.Start.normalized': 0.7 } });
  assert.equal(Math.round(control._children.Parts._children.bar._children.Layout.width), -50);
  const editor = readFileSync(new URL('../src/CE_Application/sections/BindingsEditor.svelte', import.meta.url), 'utf8');
  assert.match(editor, /label="Minus"[\s\S]*?setBindingProp\('minus', e\.target\.value\)/);
});
