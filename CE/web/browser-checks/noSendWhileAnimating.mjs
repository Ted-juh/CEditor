/**
 * Animations draw; they never send. A knob bound to a synth (a raw CC binding, the most direct path
 * out), wearing a value effect as the panel opens, one that loops, a keyframe pulse, and a scene's
 * value clip on it; a meter sweeping and shivering; all of it played in Preview for seconds. Nothing
 * is handed to the backend that would reach a synth or a host: no MIDI, no SysEx, no device
 * parameter, no host parameter. Then the knob is turned by hand, and its CC does go out: the spy
 * sees a real send, so its silence before means something.
 *
 * Why it is a check of its own: the engine promises it (utils/valueDrawn.js: "It moves the DRAWING,
 * never the value. Nothing is sent, no binding fires"), and nothing else held it. The Meter's phase 2
 * makes a meter's level the value its animations hear and gives a needle ballistics; both stay on
 * this side of the line: a meter on a test signal, clipping every 2.4 s and playing everything the
 * Level presets play, sends nothing either.
 *
 * Every message out goes through `window.__JUCE__.backend.emitEvent` (bridge/bridge.js). There is
 * no backend in a browser, so one is stood in, as behaviourKit's `wire()` does, and it keeps
 * every event it is handed.
 *
 *   node browser-checks/noSendWhileAnimating.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

// What would reach a synth or a host if a real backend were there.
const SENDS = new Set(['triggerRawMidiAction', 'setDeviceParameter', 'compileParameterMessage', 'paramChanged', 'sendBulkDump', 'requestBulkDump']);
const CC = 74;

const kit = await boot({ width: 1700, height: 1000 });
const { page } = kit;
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };

try {
  await kit.fresh();
  const ids = await page.evaluate(async ({ cc }) => {
    const { panelMaker } = await window.__ceImport('/scripts/festivalKit.js');
    const { serializePanel, deserializePanel } = await window.__ceImport('/src/CE_Application/stores/panelModel.js');
    const { addPanel } = await window.__ceImport('/src/CE_Application/stores/panels.js');
    const { applyPresetPatch } = await window.__ceImport('/src/CE_Application/utils/animationPresetModel.js');
    const { setNestedValue } = await window.__ceImport('/src/CE_Application/stores/controlTreeUtils.js');
    const { midiControlBindingFrom } = await window.__ceImport('/src/CE_Application/utils/midiControlBindings.js');
    const { KNOB_PRESETS } = await window.__ceImport('/src/CE_Application/utils/knobPresets.js');
    const { METER_PRESETS } = await window.__ceImport('/src/CE_Application/utils/meterPresets.js');
    const wear = (control, presets, slug) => {
      const { patch, reason } = applyPresetPatch(control, presets.find((entry) => entry.slug === slug).preset);
      if (!patch) throw new Error(`${slug}: ${reason}`);
      for (const [path, value] of Object.entries(patch)) setNestedValue(control, path, value);
    };
    const f = panelMaker('guard-no-send', 'No send', { set: 'graphite', bg: 'FF202124', width: 900, height: 420, fields: { gridEnabled: false } });
    const knob = f.add('Knob', 'Bound', 60, 60, 160, 160);
    knob._children.DeviceBindings.bindings = [midiControlBindingFrom({ message: 'cc', controller: cc, deviceRole: 'mainSynth' })];
    for (const slug of ['ring-sweep', 'modulated']) wear(knob, KNOB_PRESETS, slug);
    const meter = f.add('Meter', 'Level', 300, 100, 240, 44);
    for (const slug of ['self-test', 'shiver', 'pulse']) wear(meter, METER_PRESETS, slug);
    // A meter whose level clips, on its own test signal (a burst every 2.4 s): its level is the value
    // its animations hear, and every one of the Level presets plays on it, words thrown and all.
    const clipping = f.add('Meter', 'Clipping', 600, 100, 208, 130);
    clipping._children.Meter.testSignal = 'bursts';
    Object.assign(clipping._children.Meter, { riseTime: 300, fallTime: 300, overshoot: 0.015 });
    for (const slug of ['clip-flash', 'clip-shake', 'red-wash', 'peak-flare', 'over-thrown']) wear(clipping, METER_PRESETS, slug);
    f.clip('Bound', 'Value', 0, { kind: 'value', easing: 'inOutSine', frames: [{ at: 0 }, { at: 0.5, value: 1 }, { at: 1 }] }, 1200, 0);
    const panel = deserializePanel(serializePanel(f.scenes([{ name: 'Sweep', length: 1200, loop: true }])), '/tmp/guard.cepanel', null);
    addPanel(panel);
    return Object.fromEntries(panel.controls.map((c) => [c._children.Core.name, c._children.Core.id]));
  }, { cc: CC });
  await kit.settle(400);
  // A backend that keeps every event, behind the kit's stand-in (which names the device role).
  await kit.wire();
  await page.evaluate(() => {
    window.__backendEvents = [];
    const backend = window.__JUCE__.backend;
    const keep = backend.emitEvent.bind(backend);
    backend.emitEvent = (name, payload) => { window.__backendEvents.push({ name, payload }); keep(name, payload); };
  });

  await kit.preview(true);
  // Three seconds of the bound knob's drawing, so the silence is over something that moved; and a
  // clipping meter's, which must have clipped in that time (OVER thrown).
  const looks = [];
  let over = false;
  for (let k = 0; k < 30; k += 1) {
    looks.push(await page.evaluate((id) => document.querySelector(`.preview-surface [data-control-id="${id}"] svg`)?.innerHTML ?? '', ids.Bound));
    over ||= await page.evaluate((id) => [...document.querySelectorAll(`.preview-surface [data-control-id="${id}"] *`)].some((e) => !e.children.length && e.textContent === 'OVER'), ids.Clipping);
    await page.waitForTimeout(100);
  }
  const quiet = await page.evaluate(() => window.__backendEvents.map((e) => e.name));
  check('while value effects, a scene\'s value clip, keyframes, loops and a meter\'s clips play for three seconds, nothing is sent', () => {
    assert.ok(new Set(looks).size > 5, `the bound knob's drawing moved (${new Set(looks).size} looks)`);
    assert.ok(over, 'the meter clipped and threw its words');
    const sent = quiet.filter((name) => SENDS.has(name));
    assert.deepEqual(sent, [], `sent: ${sent.join(', ')}`);
  });

  // The spy works: turn the knob by hand, and its CC goes out.
  await kit.forgetSent();
  const box = await kit.box(ids.Bound);
  await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
  await page.mouse.down();
  for (let k = 1; k <= 8; k += 1) { await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2 - k * 8); await page.waitForTimeout(16); }
  await page.mouse.up();
  await kit.settle(300);
  const turned = await kit.sent();
  check('turned by hand, the same knob sends its CC: the spy sees a real send', () => {
    assert.ok(turned.some((m) => m.status === 0xB0 && m.data1 === CC), JSON.stringify(turned.slice(0, 3)));
  });

  assert.deepEqual(kit.failures, [], 'no page errors');
  console.log('noSendWhileAnimating: all checks passed');
} finally {
  await kit.close();
}
