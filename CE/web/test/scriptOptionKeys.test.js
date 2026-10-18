// scriptOptionKeys.test.js — an option a member does not have is reported, in the editor.
//
// Every options table was read key by key, and a key nothing asked for was simply never looked at.
// So ce.anim.to("x", 1, { easing = "outBack" }) moved in a straight line, { time = 800 } took 300 ms,
// { onDone = fn } never ran, ce.draw.transform({ rotation = 45 }) turned nothing because the option
// is `rotate`, and ce.device.defineParameter declared { nrpn = { mbs = 1 } } and sent MSB 0. Every
// call succeeded. Only ce.text.style and ce.image.set said anything about a key they did not know.
//
// panelRuntime.js now checks each call against the fields panelApi.js lists for that member's
// options (applyOptionChecks), and warns; the call still runs. These pin the words, that the call
// still runs, that nothing is reported that is not a mistake (a Lua list, an option's own value, a
// section on ce.panel.create), and that the check is the contract's: every member whose options list
// fields is checked, so a field the contract gains is a field the check accepts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  optionCheckedMembersForTesting, resetScriptStateForTesting, scriptApiForTesting, setRuntimeHost,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { ALL_MEMBERS, memberPath } from '../src/CE_Application/scripting/panelApi.js';

const api = scriptApiForTesting('', 'options-probe');

/** The warnings and errors a call writes. */
function linesOf(fn) {
  clearScriptTrace();
  fn();
  return get(scriptTrace).filter((t) => t.kind === 'warn' || t.kind === 'error').map((t) => `${t.kind}: ${t.message}`);
}
const warnings = (fn) => linesOf(fn).filter((l) => l.startsWith('warn: '));

test.after(() => resetScriptStateForTesting());

test('each of the reported silent failures now says which option was ignored', () => {
  const ANIM_TO = 'duration, beats, sync, curve, damping, frequency, from, delay, stagger, repeat, pingpong, done';
  const cases = [
    [() => api.ce.anim.to('x', 1, { easing: 'outBack' }),
      `warn: ce.anim.to: "easing" is not one of its options, so it was ignored. Its options are: ${ANIM_TO}.`],
    [() => api.ce.anim.to('x', 1, { ease: 'out', time: 800, onDone: () => {} }),
      `warn: ce.anim.to: "ease", "time" and "onDone" are not among its options, so they were ignored. Its options are: ${ANIM_TO}.`],
    [() => api.ce.draw.transform({ rotation: 45 }),
      'warn: ce.draw.transform: "rotation" is not one of its options, so it was ignored. Its options are: rotate, cx, cy, x, y, scale.'],
    [() => api.ce.ui.notify('hi', { type: 'warn' }),
      'warn: ce.ui.notify: "type" is not one of its options, so it was ignored. Its options are: kind, duration.'],
    [() => api.ce.device.defineParameter('p', { nrpn: { mbs: 1, lsb: 2 } }),
      'warn: ce.device.defineParameter: "nrpn.mbs" is not one of its options, so it was ignored. The options of nrpn are: msb, lsb.'],
    [() => api.ce.time.syncTimer('t', 1, { folow: false }),
      'warn: ce.time.syncTimer: "folow" is not one of its options, so it was ignored. Its only option is follow.'],
    [() => api.ce.device.requestDump('patch', () => {}, { timout: 50 }),
      'warn: ce.device.requestDump: "timout" is not one of its options, so it was ignored. Its only option is timeout.'],
    [() => api.ce.midi.read([1, 2], 0, 2, { ordr: 'lsb' }),
      'warn: ce.midi.read: "ordr" is not one of its options, so it was ignored. Its options are: bits, order.'],
  ];
  for (const [call, line] of cases) assert.deepEqual(warnings(call), [line]);
  // ce.image.icon reports its unknown options before it finds there is no control to put them on.
  assert.deepEqual(warnings(() => api.ce.image.icon('nothing', 'x', { color: 'red', scale: 2 })), [
    'warn: ce.image.icon: "color" and "scale" are not among its options, so they were ignored. Its options are: size, fit, tint, opacity, rotation.',
  ]);
});

test('the call still runs, exactly as it did: this is a warning, not a refusal', () => {
  // read answers as if the misspelled order were not there (7-bit, most significant first).
  assert.equal(api.ce.midi.read([1, 2], 0, 2, { ordr: 'lsb' }), (1 << 7) | 2);
  // ce.anim.to starts the move, in a straight line, for the default 300 ms.
  setRuntimeHost({ panel: { id: 'p', name: 'P', controls: [], scripting: { modules: ['ce.anim'] } } });
  try {
    const host = scriptApiForTesting('', 'options-probe');
    assert.equal(host.ce.anim.to('x', 1, { easing: 'outBack' }), true);
    assert.equal(host.ce.anim.running('x'), true);
    host.ce.anim.stop();
  } finally {
    setRuntimeHost(null);
  }
});

test('the flat name and the namespaced one are the same checked function', () => {
  assert.equal(api.animateTo, api.ce.anim.to);
  assert.equal(warnings(() => api.animateTo('x', 1, { easing: 'x' })).length, 1);
  assert.equal(warnings(() => api.ce.anim.to('x', 1, { easing: 'x' })).length, 1);
});

test('nothing that is not a mistake is reported', () => {
  const quiet = [
    // Every option a member lists.
    () => api.ce.anim.to('x', 1, {
      duration: 5, beats: 1, sync: false, curve: 'linear', damping: 6, frequency: 12, from: 0, delay: 0,
      stagger: 0, repeat: 0, pingpong: false, done: () => {},
    }),
    // An option's own value is not looked into unless the contract lists its fields: a curve's
    // four numbers, as a list or as a Lua list arrives (an object of numbered keys).
    () => api.ce.anim.to('x', 1, { curve: [0.1, 0.2, 0.3, 0.4] }),
    () => api.ce.anim.to('x', 1, { curve: { 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4 } }),
    // A list where the options go is not an options table, nor a numbered-key object.
    () => api.ce.anim.to('x', 1, [500]),
    () => api.ce.anim.to('x', 1, { 1: 500 }),
    // A NRPN as a list.
    () => api.ce.device.defineParameter('p', { nrpn: [1, 2] }),
    () => api.ce.device.defineParameter('p', { nrpn: { 1: 1, 2: 2 } }),
    // The five spec keys both runtimes read that the contract did not list until now.
    () => api.ce.device.defineParameter('t', { type: 'text', sysex: 'F0 $value F7', length: 4, pad: 32 }),
    () => api.ce.device.defineParameter('b', { type: 'boolean', cc: 1, trueValue: 127, falseValue: 0 }),
    () => api.ce.device.defineParameter('n', { cc: 2, encoding: 'nibbled', nibbles: 4 }),
    // A section on create and clone, by the name set() uses.
    () => api.ce.panel.create('Knob', { name: 'k', x: 1, Behavior: { min: 0 }, Core: { tooltip: 'x' } }),
    () => api.ce.panel.clone('k', { name: 'k2', Transform: { x: 3 } }),
    // Options that are not a table at all.
    () => api.ce.ui.notify('hi', 'warn'),
    () => api.ce.ui.notify('hi'),
    () => api.ce.ui.notify('hi', null),
  ];
  for (const call of quiet) assert.deepEqual(warnings(call), [], String(call));
});

test('the members that refuse an unknown key themselves are not warned about twice', () => {
  // ce.text.style and ce.image.set refused unknown options already; ce.storage and ce.panel.find
  // refuse now. A warning saying "ignored" beside an error saying "refused" would contradict it.
  const lines = linesOf(() => api.ce.storage.saveSetting('k', 1, { scop: 'script' }));
  assert.equal(lines.filter((l) => l.startsWith('warn')).length, 0);
  assert.equal(lines.filter((l) => l.startsWith('error')).length, 1);
  const checked = optionCheckedMembersForTesting();
  for (const path of ['ce.text.style', 'ce.image.set', 'ce.panel.find', 'ce.storage.saveSetting']) {
    assert.ok(!checked.includes(path), `${path} should check its own keys`);
  }
});

test('the check is the contract: every member whose options list fields is checked', () => {
  const OWN = new Set(['textStyle', 'imageSet', 'panelFind', 'saveSetting', 'loadSetting', 'listSettings',
    'forgetSetting', 'allSettings', 'clearSettings', 'storageInfo']);
  const expected = ALL_MEMBERS
    .filter((m) => m.kind !== 'lifecycle' && !OWN.has(m.id))
    .filter((m) => (m.params ?? []).some((p) => Array.isArray(p.fields) && p.fields.length))
    .map((m) => memberPath(m.id))
    .sort();
  assert.deepEqual(optionCheckedMembersForTesting(), expected);
  assert.ok(expected.length > 40, 'most of the API takes options');
});

test('set()\'s transmit option and dialog\'s plumbing', () => {
  // `ask` is how prompt and choose tell the dialog store their shape. dialog named its own shape
  // only when the script did not, so { ask = "text" } turned it into a prompt; now it is reported
  // as the unknown option it is, and dialog asks with buttons.
  assert.deepEqual(warnings(() => api.ce.ui.dialog({ title: 'Q', ask: 'text' })), [
    'warn: ce.ui.dialog: "ask" is not one of its options, so it was ignored. Its options are: title, message, buttons, kind, default.',
  ]);
  // set() lists transmit, so it is never reported (the value reaching the write is pinned in
  // deviceStructure.test.js).
  assert.deepEqual(warnings(() => api.set('nothing.value', 1, { transmit: false })), []);
});

test('a Lua table reaches the check the way wasmoon hands it over', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    lua.global.set('animateTo', api.animateTo);
    lua.global.set('drawCurve', api.drawCurve);
    clearScriptTrace();
    await lua.doString(`
      animateTo("x", 1, { ["repeat"] = 2, curve = { 0.1, 0.2, 0.3, 0.4 }, done = function() end })
      drawCurve({ { 0, 0 }, { 1, 1 } }, { tension = 1, closed = true })
      animateTo("x", 1, { easing = "outBack" })`);
    assert.deepEqual(get(scriptTrace).filter((t) => t.kind === 'warn').map((t) => t.message), [
      'ce.anim.to: "easing" is not one of its options, so it was ignored. Its options are: duration, beats, '
        + 'sync, curve, damping, frequency, from, delay, stagger, repeat, pingpong, done.',
    ]);
  } finally {
    lua.global.close();
    resetScriptStateForTesting();
  }
});
