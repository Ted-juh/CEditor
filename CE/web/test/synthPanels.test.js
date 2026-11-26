// synthPanels.test.js — the Animated Synths (scripts/synthPanels.js): every control bound to a
// parameter its instrument's profile has, the way the editor binds a dropped one; every clock driven
// by a bound control; scenes that share an element moving different things of it, so they compose;
// a key lit by its note and darkened by that note let go; the minilogue's screen script saying what
// it is said to; and the YC61's rotors turning at the speeds and ramps its manual prints.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SYNTHS, loadProfile, YC61_SPEEDS, yc61Rpm, yc61Factor, yc61Step } from '../scripts/synthPanels.js';
import { getPreferredPort } from '../src/CE_Application/models/componentPorts.js';
import { cleanScene } from '../src/CE_Application/utils/sceneFormat.js';

const panels = Object.fromEntries(SYNTHS.map(([id, make]) => [id, make()]));
const named = (panel, name) => panel.controls.find((control) => control._children.Core.name === name);
const idOf = (panel, name) => named(panel, name)._children.Core.id;
const sceneNamed = (panel, name) => panel.animationScenes.find((scene) => scene.name === name);
/** What a clip's frames move: transform and opacity by name, the paint by 'fill', the picture by 'image'. */
const moves = (clip) => new Set((clip.effect.frames ?? []).flatMap((frame) => Object.keys(frame).filter((key) => key !== 'at'))
  .map((key) => (['panX', 'panY', 'zoom', 'spin'].includes(key) ? 'image' : key === 'x' || key === 'y' ? 'translate' : key)));

test('each panel needs its instrument\'s profile, and every bound control binds a parameter that profile has', () => {
  for (const [id, panel] of Object.entries(panels)) {
    const profile = loadProfile(id);
    assert.deepEqual(panel.requiredProfiles, [{ role: profile.name, profileId: id, version: '*' }]);
    const parameters = new Map(profile.parameters.map((parameter) => [parameter.id, parameter]));
    const bound = panel.controls.filter((control) => control._children.DeviceBindings?.bindings?.length);
    assert.ok(bound.length >= 20, `${id}: ${bound.length} bound controls`);
    for (const control of bound) {
      const [binding] = control._children.DeviceBindings.bindings;
      const parameter = parameters.get(binding.parameterId);
      const name = control._children.Core.name;
      assert.ok(parameter, `${id}: ${name} binds ${binding.parameterId}, which the profile has`);
      assert.equal(binding.deviceRole, profile.name, name);
      assert.equal(binding.parameterType, parameter.type, name);
      assert.equal(binding.port, getPreferredPort(control._children.Core.controlType, parameter.type).id, name);
      if (parameter.type === 'integer') {
        // Adopted as a dropped parameter is: the knob reads the synth's own range.
        assert.deepEqual([control._children.Behavior.min, control._children.Behavior.max], [parameter.range.min, parameter.range.max], name);
      } else if (parameter.type === 'choice') {
        assert.deepEqual(control._children.Value.rows.map((row) => row.displayText), parameter.choices.map((choice) => choice.label), name);
        const at = parameter.choices.findIndex((choice) => choice.id === parameter.default);
        assert.equal(control._children.Behavior.defaultCurrentValue, Math.max(0, at) / (parameter.choices.length - 1), `${name} starts on the profile's own choice`);
      }
    }
    const bindings = bound.map((control) => control._children.DeviceBindings.bindings[0].parameterId);
    assert.equal(new Set(bindings).size, bindings.length, `${id}: one control a parameter`);
  }
});

test('every scene a value drives is driven by a bound control, and its clips stay inside it', () => {
  for (const [id, panel] of Object.entries(panels)) {
    for (const raw of panel.animationScenes) {
      const scene = cleanScene(raw);
      assert.equal(scene.clips.length, raw.clips.length, `${id}: ${raw.name} keeps its clips`);
      if (!scene.clock) continue;
      assert.equal(scene.clock.source, 'value');
      const driver = panel.controls.find((control) => control._children.Core.id === scene.clock.controlId);
      assert.ok(driver?._children.DeviceBindings?.bindings?.length, `${id}: ${scene.name} is driven by a bound control`);
    }
  }
});

test('Moog: each mixer line follows its own level, and the filter\'s picture slides with CUTOFF while its peak shows RESONANCE', () => {
  const panel = panels['moog-subsequent-37'];
  [['Osc1Level', 'Line1'], ['SubLevel', 'Line2'], ['Osc2Level', 'Line3'], ['NoiseLevel', 'Line4'], ['FeedbackLevel', 'Line5']].forEach(([knob, line]) => {
    const scene = panel.animationScenes.find((s) => s.clock?.controlId === idOf(panel, knob));
    assert.deepEqual(scene.clips.map((clip) => clip.controlId), [idOf(panel, line)], knob);
    assert.deepEqual(scene.clips[0].effect.frames.map((frame) => frame.opacity), [0.08, 1], `${knob}: barely there to full`);
  });
  const cutoff = sceneNamed(panel, 'Filter cutoff');
  const resonance = sceneNamed(panel, 'Filter resonance');
  assert.equal(cutoff.clock.controlId, idOf(panel, 'Cutoff'));
  assert.equal(resonance.clock.controlId, idOf(panel, 'Resonance'));
  assert.deepEqual(cutoff.clips.map((clip) => clip.controlId).sort(), [idOf(panel, 'FilterCurve'), idOf(panel, 'FilterPeak')].sort());
  const peak = (scene) => scene.clips.find((clip) => clip.controlId === idOf(panel, 'FilterPeak'));
  // Two scenes on one picture: one moves the image inside its clip, the other the control's opacity.
  assert.deepEqual([...moves(peak(cutoff))], ['image']);
  assert.deepEqual([...moves(peak(resonance))], ['opacity']);
  const pulse = sceneNamed(panel, 'Note pulse');
  assert.deepEqual(pulse.trigger, { type: 'midi', message: 'note', channel: 0, note: -1 }, 'any note, any channel');
  assert.deepEqual(sceneNamed(panel, 'Note off').trigger, { type: 'midi', message: 'noteOff', channel: 0, note: -1 });
  for (let i = 1; i <= 4; i += 1) assert.equal(named(panel, `Pulse${i}`)._children.Transform.opacity, 0, 'the pulse is not there until a note sends it');
});

test('JU-06A: every key from C3 to C5 is lit by its own note and goes back when that note is let go', () => {
  const panel = panels['roland-ju-06a'];
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let note = 48; note <= 72; note += 1) {
    const name = `${names[note % 12]}${Math.floor(note / 12) - 1}`;
    const key = named(panel, `Key${name}`);
    assert.ok(key, name);
    const struck = sceneNamed(panel, `Key ${name}`);
    const released = sceneNamed(panel, `Key ${name} let go`);
    assert.deepEqual(struck.trigger, { type: 'midi', message: 'note', channel: 0, note }, name);
    assert.deepEqual(released.trigger, { type: 'midi', message: 'noteOff', channel: 0, note }, name);
    const rest = key._children.Background._children.Fill.colour;
    assert.equal(struck.clips[0].effect.frames.at(-1).fill, released.clips[0].effect.frames[0].fill, `${name}: let go from where the note left it`);
    assert.equal(released.clips[0].effect.frames.at(-1).fill, rest, `${name}: back to its rest`);
  }
});

test('JU-06A: each echo is moved apart by TIME, shown by FEEDBACK and flashed by a note, three scenes on one mark each moving something else', () => {
  const panel = panels['roland-ju-06a'];
  const byDriver = (knob) => panel.animationScenes.find((s) => s.clock?.controlId === idOf(panel, knob));
  const time = byDriver('DelayTime');
  const feedback = byDriver('DelayFeedback');
  const note = sceneNamed(panel, 'Echoes');
  for (let k = 1; k <= 5; k += 1) {
    const on = (scene) => scene.clips.find((clip) => clip.controlId === idOf(panel, `Echo${k}`));
    const sets = [moves(on(time)), moves(on(feedback)), moves(on(note))];
    assert.deepEqual(sets.map((set) => [...set].sort()), [['translate'], ['opacity'], ['fill', 'scale']], `Echo${k}`);
  }
  // The first echo is always there; each later one comes in as FEEDBACK reaches it.
  const shown = (k, at) => {
    const frames = feedback.clips.find((clip) => clip.controlId === idOf(panel, `Echo${k}`)).effect.frames;
    const after = frames.findIndex((frame) => frame.at >= at);
    return frames[Math.max(0, after)].opacity;
  };
  assert.equal(shown(1, 0), 1);
  for (let k = 2; k <= 5; k += 1) assert.ok(shown(k, 0) === 0 && shown(k, 1) > 0, `Echo${k}`);
  assert.equal(byDriver('DelayLevel').clips[0].controlId, idOf(panel, 'DelayVeil'));
  assert.deepEqual(sceneNamed(panel, 'Beat').trigger, { type: 'beat', every: 1 });
});

/** The minilogue's script against a stand-in for the API: its listeners, and what they call. */
function runMinilogue(panel) {
  const listeners = {};
  const calls = [];
  const arrivals = [];
  const api = {
    on: (target, event, fn) => { listeners[event] = fn; },
    animateSwap: (target, words, effect, opts) => { calls.push(['swap', target, words, effect]); if (opts?.done) arrivals.push(opts.done); return true; },
    animatePlay: (scene) => { calls.push(['play', scene]); return true; },
    set: (path, value) => { calls.push(['set', path, value]); },
    after: (ms, fn) => { calls.push(['after', ms]); fn(); return 'timer'; },
  };
  new Function(...Object.keys(api), panel.scripts[0].source)(...Object.values(api));
  /** The oldest swap under way arrives (or is cut short), as the surface says when its words came in. */
  const arrive = (completed = true) => arrivals.shift()?.(completed);
  return { listeners, calls, arrive };
}

test('minilogue xd: a touched knob comes up by name and value, a choice by its label, a program by its number', () => {
  const panel = panels['korg-minilogue-xd'];
  const { listeners, calls, arrive } = runMinilogue(panel);
  assert.deepEqual(Object.keys(listeners).sort(), ['onBeat', 'onControlChanged', 'onProgramIn']);
  listeners.onControlChanged({ target: 'Vco1Shape', value: 90.4 });
  listeners.onControlChanged({ target: 'Vco1Shape', value: 91 });
  assert.deepEqual(calls.splice(0), [['set', 'ScreenValue.Text.content', ''], ['swap', 'ScreenName', 'VCO1 SHAPE', 'push']],
    'a new name pushed in, the value cleared and held back while it comes');
  arrive();
  listeners.onControlChanged({ target: 'Vco1Shape', value: 92 });
  assert.deepEqual(calls.splice(0), [['set', 'ScreenValue.Text.content', '91'], ['set', 'ScreenValue.Text.content', '92']],
    'once it has arrived, the latest value, then each one as it comes');
  listeners.onControlChanged({ target: 'Vco1Wave', value: 0.5 });
  listeners.onControlChanged({ target: 'Cutoff', value: 40 });
  arrive(false);
  arrive(true);
  assert.deepEqual(calls.splice(0), [['set', 'ScreenValue.Text.content', ''], ['swap', 'ScreenName', 'VCO1 WAVE', 'push'],
    ['set', 'ScreenValue.Text.content', ''], ['swap', 'ScreenName', 'CUTOFF', 'push'], ['set', 'ScreenValue.Text.content', '40']],
    'a name cut short by a newer one writes nothing; the newer one writes its own');
  listeners.onControlChanged({ target: 'Vco1Wave', value: 0.5 });
  arrive();
  assert.deepEqual(calls.splice(0).at(-1), ['set', 'ScreenValue.Text.content', 'TRI'], 'a choice by its label');
  listeners.onControlChanged({ target: 'Title', value: 'x' });
  assert.deepEqual(calls.splice(0), [], 'a control the screen does not know of says nothing');
  listeners.onProgramIn({ program: 41, number: 42, channel: 1 });
  listeners.onProgramIn({ program: 6, number: 7, bankLsb: 1, channel: 1 });
  assert.deepEqual(calls.splice(0), [['swap', 'ScreenProgram', 'PROGRAM 042', 'roll'], ['swap', 'ScreenProgram', 'PROGRAM 107', 'roll']], 'counted as the profile\'s banks count');
  for (const [name, entry] of Object.entries(JSON.parse(/const NAMES = (.*);/.exec(panel.scripts[0].source)[1]))) {
    assert.ok(named(panel, name), `the screen names ${name}, a control the panel has`);
    assert.ok(named(panel, name)._children.DeviceBindings?.bindings?.length, `${name} is bound`);
    if (typeof entry === 'object') assert.deepEqual(entry.choices, named(panel, name)._children.Value.rows.map((row) => row.displayText));
  }
});

test('minilogue xd: each beat lights four of the sixteen steps, a sixteenth apart at the tempo it came at', () => {
  const panel = panels['korg-minilogue-xd'];
  const { listeners, calls } = runMinilogue(panel);
  listeners.onBeat({ beats: 5.02, bpm: 100, bar: 2, beat: 2 });
  assert.deepEqual(calls, [['play', 'Step 5'], ['after', 150], ['play', 'Step 6'], ['after', 300], ['play', 'Step 7'], ['after', 450], ['play', 'Step 8']]);
  for (let s = 1; s <= 16; s += 1) assert.equal(sceneNamed(panel, `Step ${s}`)?.trigger.type, 'script', `Step ${s} is played by the script alone`);
  assert.equal(sceneNamed(panel, 'Scope wave').clock.controlId, idOf(panel, 'Vco1Wave'));
});

test('YC61: speeds, ramps and drawbar steps read as the manual prints them', () => {
  // Each speed's printed range and default (Owner's Manual): the default, 64, lands on the default.
  const printed = { hornFast: 413.8, drumFast: 373.5, hornSlow: 45.4, drumSlow: 44.8 };
  for (const [key, [low, high]] of Object.entries(YC61_SPEEDS)) {
    assert.ok(Math.abs(yc61Rpm(1, [low, high]) - low) < 1e-9, `${key}: 1 is the low end`);
    assert.ok(Math.abs(yc61Rpm(127, [low, high]) - high) < 1e-9, `${key}: 127 the high end`);
    assert.ok(Math.abs(yc61Rpm(64, [low, high]) - printed[key]) < 0.06, `${key}: 64 is ${printed[key]} rpm, not ${yc61Rpm(64, [low, high])}`);
  }
  // The ramps: 0.21 - 1.00 - 2.00, with the printed defaults 1.30 (horn, 83) and 1.00 (rotor, 64).
  for (const [value, factor] of [[14, 0.21], [64, 1], [83, 1.3], [127, 2]]) assert.equal(Math.round(yc61Factor(value) * 100) / 100, factor, String(value));
  // The drawbar table: 0: 0, 1: 1 - 18, 2: 19 - 36 ... 7: 109 - 126, 8: 127.
  const table = [[0, 0], [1, 1], [18, 1], [19, 2], [36, 2], [37, 3], [54, 3], [55, 4], [72, 4], [73, 5], [90, 5], [91, 6], [108, 6], [109, 7], [126, 7], [127, 8]];
  for (const [value, step] of table) assert.equal(yc61Step(value), step, `value ${value}`);
  // And the profile carries the same ranges the panel reads.
  const profile = loadProfile('yamaha-yc61');
  const said = (id) => profile.parameters.find((q) => q.id === `liveSetSoundCommon.${id}`).description;
  assert.match(said('rotarySpeakerHornSpeedFast'), /209\.4 – 817\.6/);
  assert.match(said('rotarySpeakerRotorSpeedSlow'), /22\.7 – 88\.3/);
});

/** One of the YC61's scripts against a stand-in API, with a clock of its own. */
function runYc61(source, values) {
  let now = 0;
  const timers = [];
  const calls = [];
  const listeners = {};
  class Clock { static now() { return now; } }
  const api = {
    Date: Clock,
    get: (name) => values[name],
    set: (path, value) => calls.push(['set', path, value]),
    on: (target, event, fn) => { listeners[event] = fn; },
    after: (ms, fn) => { timers.push([now + ms, fn]); },
    animateSeek: (scene, at) => calls.push(['seek', scene, at]),
    drawClear: () => calls.push(['clear']), drawOpacity: () => {}, drawStroke: () => {}, drawFill: () => {},
    drawPath: (points) => calls.push(['path', points.length]), drawText: (x, y, text) => calls.push(['text', text]),
    drawRedraw: () => calls.push(['redraw']),
  };
  const hooks = new Function(...Object.keys(api), `${source}\nreturn typeof onDraw === 'function' ? { onDraw } : {};`)(...Object.values(api));
  const run = (ms) => {
    const until = now + ms;
    for (;;) {
      timers.sort((a, b) => a[0] - b[0]);
      if (!timers.length || timers[0][0] > until) break;
      const [at, fn] = timers.shift();
      now = at;
      fn();
    }
    now = until;
  };
  return { calls, listeners, hooks, run };
}
const lastSet = (calls, path) => calls.filter(([kind, p]) => kind === 'set' && p === path).at(-1)?.[2];

test('YC61: the rotors start at their slow speeds, ramp to fast at their own rates, and brake to a stop', () => {
  const panel = panels['yamaha-yc61'];
  const rotary = panel.scripts.find((s) => s.name === 'Rotary speaker').source;
  const values = { HornFast: 64, HornSlow: 64, DrumFast: 64, DrumSlow: 64, HornAcc: 83, HornDec: 83, DrumAcc: 64, DrumDec: 64, SlowFast: 'slow', Rotation: 'on' };
  const { calls, listeners, run } = runYc61(rotary, values);
  run(100);
  assert.equal(lastSet(calls, 'HornRpm.Text.content'), '45 rpm', 'already turning at its slow speed as the panel opens');
  assert.equal(lastSet(calls, 'DrumRpm.Text.content'), '45 rpm');
  for (const scene of ['Horn turn', 'Horn blur', 'Drum turn', 'Drum blur']) assert.ok(panel.animationScenes.some((s) => s.name === scene), scene);
  assert.ok(calls.some(([kind, scene]) => kind === 'seek' && scene === 'Horn turn'), 'the horn\'s scene is held where it has turned to');
  listeners.onControlChanged({ target: 'SlowFast', value: 'fast' });
  run(1000);
  const horn = parseInt(lastSet(calls, 'HornRpm.Text.content'), 10);
  const drum = parseInt(lastSet(calls, 'DrumRpm.Text.content'), 10);
  assert.ok(horn > drum + 20 && horn < 413, `a second in, the horn (factor 1.30) is further on than the drum (1.00): ${horn} and ${drum}`);
  run(10000);
  // And settles at its fast speed: 413.8 and 373.5 rpm as printed, to the nearest whole rpm shown.
  assert.ok(Math.abs(parseInt(lastSet(calls, 'HornRpm.Text.content'), 10) - 413.8) <= 1, lastSet(calls, 'HornRpm.Text.content'));
  assert.ok(Math.abs(parseInt(lastSet(calls, 'DrumRpm.Text.content'), 10) - 373.5) <= 1, lastSet(calls, 'DrumRpm.Text.content'));
  const blur = calls.filter(([kind, scene]) => kind === 'seek' && scene === 'Horn blur').at(-1)[2];
  assert.equal(blur, 1, 'too fast to see: drawn as its blur');
  listeners.onControlChanged({ target: 'Rotation', value: 'off' });
  run(15000);
  assert.equal(lastSet(calls, 'HornRpm.Text.content'), '0 rpm', 'ROTATION off brakes it to a stop');
});

test('YC61: the wave screen draws each sounding footage and their sum, and the registration', () => {
  const panel = panels['yamaha-yc61'];
  const script = panel.scripts.find((s) => s.event === 'onDraw');
  assert.deepEqual([script.target, script.enabled], ['Wave', true], 'attached to the screen it paints');
  const bars = ['Drawbar16', 'Drawbar513', 'Drawbar8', 'Drawbar4', 'Drawbar223', 'Drawbar2', 'Drawbar135', 'Drawbar113', 'Drawbar1'];
  const values = Object.fromEntries(bars.map((name) => [name, named(panel, name)._children.Behavior.defaultCurrentValue]));
  const { calls, listeners, hooks, run } = runYc61(script.source, values);
  run(100);
  assert.deepEqual(calls.splice(0), [['redraw']], 'it asks to be painted as it starts');
  hooks.onDraw({ target: 'Wave', width: 330, height: 230 });
  const sounding = bars.filter((name) => yc61Step(values[name]) > 0).length;
  assert.equal(calls.filter(([kind]) => kind === 'path').length, sounding + 1, 'one line a sounding footage, and their sum');
  assert.deepEqual(calls.find(([kind]) => kind === 'text'), ['text', '88 7040 002']);
  calls.splice(0);
  listeners.onControlChanged({ target: 'Drawbar4', value: 64 });
  listeners.onControlChanged({ target: 'HornFast', value: 64 });
  assert.deepEqual(calls, [['redraw']], 'redrawn when a drawbar moves, and only then');
  for (const name of bars) assert.ok(named(panel, name)._children.DeviceBindings.bindings[0].parameterId.startsWith('organUpper.drawbar'), `${name} is an upper drawbar`);
});
