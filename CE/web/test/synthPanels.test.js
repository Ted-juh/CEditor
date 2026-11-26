// synthPanels.test.js — the Animated Synths (scripts/synthPanels.js): every control bound to a
// parameter its instrument's profile has, the way the editor binds a dropped one; every clock driven
// by a bound control; scenes that share an element moving different things of it, so they compose;
// a key lit by its note and darkened by that note let go; and the minilogue's screen script saying
// what it is said to.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SYNTHS, loadProfile } from '../scripts/synthPanels.js';
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
