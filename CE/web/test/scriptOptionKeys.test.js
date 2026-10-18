// scriptOptionKeys.test.js — an option a member does not take refuses the call.
//
// Every options table was read key by key, and a key nothing asked for was simply never looked at.
// So ce.anim.to("x", 1, { easing = "outBack" }) moved in a straight line, { time = 800 } took 300 ms,
// { onDone = fn } never ran, ce.draw.transform({ rotation = 45 }) turned nothing because the option
// is `rotate`, and ce.device.defineParameter declared { nrpn = { mbs = 1 } } and sent MSB 0. Every
// call succeeded.
//
// panelRuntime.js checks each call against the fields panelApi.js lists for that member's options
// (applyOptionChecks). It warned and ran the call; by the owner's decision it now refuses it:
// nothing is done, the console names the keys and lists the member's options, and the call answers
// what the member answers for any other refusal (refusalOf). These pin the words, that nothing is
// done and what comes back, that nothing is refused that is not a mistake (a Lua list, an option's
// own value, a section on ce.panel.create), and that the check is the contract's: every member
// whose options list fields is checked, so a field the contract gains is a field the check accepts.
// The C++ engines' preludes refuse the same calls in the same words: scriptPreludeAgreement.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  optionCheckedMembersForTesting, resetScriptStateForTesting, scriptApiForTesting, setRuntimeHost,
  clearDeviceRuntimeDefinitions,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import {
  ALL_MEMBERS, memberPath, MEMBERS_CHECKING_OWN_OPTIONS, optionChecks, refusalOf, REFUSAL_ANSWERS,
} from '../src/CE_Application/scripting/panelApi.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';

const api = scriptApiForTesting('', 'options-probe');

/** The warnings and errors a call writes. */
function linesOf(fn) {
  clearScriptTrace();
  fn();
  return get(scriptTrace).filter((t) => t.kind === 'warn' || t.kind === 'error').map((t) => `${t.kind}: ${t.message}`);
}
// The option check's own lines, whatever else a call goes on to say about its other arguments.
const OPTION_LINE = /: ".+" (is not one of its options|are not among its options), so nothing was done\. /;
const refusals = (fn) => linesOf(fn).filter((l) => OPTION_LINE.test(l));

/** A host over a panel, as the player has, so a refused write can be seen not to land. */
function withPanel(controls, fn) {
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls,
    scripting: { modules: ['ce.core', 'ce.anim', 'ce.device', 'ce.panel', 'ce.ui'] } };
  setRuntimeHost({
    panel, scripts: [],
    readValue: (control, path) => valueAtPath(control, path),
    writeValue: (control, path, value) => (setNestedValue(control, path, value), true),
  });
  clearDeviceRuntimeDefinitions();
  try { return fn(scriptApiForTesting('', 'options-probe'), panel); } finally { setRuntimeHost(null); }
}

test.after(() => resetScriptStateForTesting());

test('each of the reported silent failures is refused, and says which option', () => {
  const ANIM_TO = 'duration, beats, sync, curve, damping, frequency, from, delay, stagger, repeat, pingpong, done';
  const cases = [
    [() => api.ce.anim.to('x', 1, { easing: 'outBack' }),
      `error: ce.anim.to: "easing" is not one of its options, so nothing was done. Its options are: ${ANIM_TO}.`],
    // Several keys are named sorted, whatever order the table holds them in: a Lua table and a
    // Python dict keep none, and every runtime has to say the same words.
    [() => api.ce.anim.to('x', 1, { time: 800, ease: 'out', onDone: () => {} }),
      `error: ce.anim.to: "ease", "onDone" and "time" are not among its options, so nothing was done. Its options are: ${ANIM_TO}.`],
    [() => api.ce.draw.transform({ rotation: 45 }),
      'error: ce.draw.transform: "rotation" is not one of its options, so nothing was done. Its options are: rotate, cx, cy, x, y, scale.'],
    [() => api.ce.ui.notify('hi', { type: 'warn' }),
      'error: ce.ui.notify: "type" is not one of its options, so nothing was done. Its options are: kind, duration.'],
    [() => api.ce.device.defineParameter('p', { nrpn: { mbs: 1, lsb: 2 } }),
      'error: ce.device.defineParameter: "nrpn.mbs" is not one of its options, so nothing was done. The options of nrpn are: msb, lsb.'],
    [() => api.ce.time.syncTimer('t', 1, { folow: false }),
      'error: ce.time.syncTimer: "folow" is not one of its options, so nothing was done. Its only option is follow.'],
    [() => api.ce.device.requestDump('patch', () => {}, { timout: 50 }),
      'error: ce.device.requestDump: "timout" is not one of its options, so nothing was done. Its only option is timeout.'],
    [() => api.ce.midi.read([1, 2], 0, 2, { ordr: 'lsb' }),
      'error: ce.midi.read: "ordr" is not one of its options, so nothing was done. Its options are: bits, order.'],
    [() => api.ce.panel.create('Knob', { name: 'k', colour: 'red' }),
      'error: ce.panel.create: "colour" is not one of its options, so nothing was done. Its options are: name, x, y, '
        + 'width, height, parent, and the name of any section, such as Behavior.'],
  ];
  for (const [call, line] of cases) assert.deepEqual(linesOf(call), [line]);
  // A misspelling at both levels is two lines, the call's own options first, then the option's.
  assert.deepEqual(linesOf(() => api.ce.device.defineParameter('p', { nmae: 'Cutoff', cc: 7, nrpn: { msb: 1, lbs: 2 } })), [
    'error: ce.device.defineParameter: "nmae" is not one of its options, so nothing was done. Its options are: name, '
      + 'group, type, min, max, access, choices, trueValue, falseValue, cc, nrpn, sysex, channel, encoding, nibbles, '
      + 'checksum, variables, length, pad.',
    'error: ce.device.defineParameter: "nrpn.lbs" is not one of its options, so nothing was done. The options of nrpn are: msb, lsb.',
  ]);
  // ce.image.icon refuses before it looks for a control to put the icon on.
  assert.deepEqual(linesOf(() => api.ce.image.icon('nothing', 'x', { color: 'red', scale: 2 })), [
    'error: ce.image.icon: "color" and "scale" are not among its options, so nothing was done. Its options are: size, fit, tint, opacity, rotation.',
  ]);
});

test('nothing is done, and the call answers what the member answers for any other refusal', () => {
  // A number, read as if the options were right, is no number at all.
  assert.equal(api.ce.midi.read([1, 2], 0, 2, { ordr: 'lsb' }), undefined);
  assert.equal(api.ce.midi.checksum('roland', [1, 2], { ofset: 1 }), undefined);
  assert.equal(api.ce.storage.encode({ a: 1 }, { indnt: 2 }), undefined);
  // A list is still a list, so a loop over it runs, empty.
  assert.deepEqual(api.ce.device.ports({ dir: 'in' }), []);
  assert.deepEqual(api.ce.device.parameters({ grp: 'Filter' }), []);
  // recallPreset answers a result, and its error is what the console said.
  assert.deepEqual(api.ce.device.recallPreset(0, { rol: 'mainSynth' }), {
    ok: false,
    error: 'ce.device.recallPreset: "rol" is not one of its options, so nothing was done. Its only option is role.',
  });

  const knob = createControl('Knob', { name: 'k' });
  const other = createControl('Knob', { name: 'k2' });
  withPanel([knob, other], (host, panel) => {
    // A move that is refused does not start, and says false, as one with a target it cannot read.
    assert.equal(host.ce.anim.to('k.value', 1, { easing: 'outBack' }), false);
    assert.equal(host.ce.anim.running('k.value'), false);
    assert.equal(host.ce.anim.spring('k.value', 1, { curve: 'outBack' }), false, 'spring takes no curve');
    assert.equal(host.ce.anim.running(), false);
    // A definition that is refused defines nothing, so writing it is refused in turn.
    assert.equal(host.ce.device.defineParameter('cut', { cc: 74, nmae: 'Cutoff' }), false);
    clearScriptTrace();
    assert.equal(host.ce.device.write('cut', 10), false);
    // A write that is refused does not land.
    const before = valueAtPath(panel.controls[0], 'Value.value');
    assert.equal(host.set('k.value', 99, { transmit: false, quiet: true }), undefined);
    assert.equal(valueAtPath(panel.controls[0], 'Value.value'), before);
    // ce.panel's arranging verbs answer how many controls moved: none.
    assert.equal(host.ce.panel.align(['k', 'k2'], 'left', { too: 'k' }), 0);
    assert.equal(host.ce.panel.grid(['k', 'k2'], { cols: 2 }), 0);
    // A control that is refused is not made.
    assert.equal(host.ce.panel.create('Knob', { name: 'k3', colour: 'red' }), undefined);
    assert.equal(panel.controls.length, 2);
    // dialog, prompt and choose: false always means the callback has already run with no answer.
    const answers = [];
    assert.equal(host.ce.ui.dialog({ title: 'Q', choices: ['a'] }, (choice) => answers.push(['dialog', choice])), false);
    assert.equal(host.ce.ui.prompt({ title: 'Q', max: 4 }, (text) => answers.push(['prompt', text])), false);
    assert.equal(host.ce.ui.choose({ title: 'Q', options: ['a'] }, (pick) => answers.push(['choose', pick])), false);
    assert.deepEqual(answers, [['dialog', undefined], ['prompt', undefined], ['choose', undefined]]);
  });
});

test('the call still runs when every key is one it takes', () => {
  assert.equal(api.ce.midi.read([1, 2], 0, 2, { order: 'lsb' }), (2 << 7) | 1);
  assert.equal(api.ce.storage.encode({ a: 1 }, { indent: 2 }), '{\n  "a": 1\n}');
  const knob = createControl('Knob', { name: 'k' });
  withPanel([knob], (host) => {
    assert.equal(host.ce.anim.to('k.value', 1, { duration: 500, curve: 'outBack' }), true);
    assert.equal(host.ce.anim.running('k.value'), true);
    host.ce.anim.stop();
    assert.equal(host.ce.device.defineParameter('cut', { name: 'Cutoff', cc: 74, nrpn: undefined }), true);
  });
});

test('the flat name and the namespaced one are the same checked function', () => {
  assert.equal(api.animateTo, api.ce.anim.to);
  assert.equal(refusals(() => api.animateTo('x', 1, { easing: 'x' })).length, 1);
  assert.equal(refusals(() => api.ce.anim.to('x', 1, { easing: 'x' })).length, 1);
});

test('nothing that is not a mistake is refused', () => {
  const quiet = [
    // Every option a member lists.
    () => api.ce.anim.to('x', 1, {
      duration: 5, beats: 1, sync: false, curve: 'linear', damping: 6, frequency: 12, from: 0, delay: 0,
      stagger: 0, repeat: 1, pingpong: false, done: () => {},
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
    // The five spec keys both runtimes read that the contract once did not list.
    () => api.ce.device.defineParameter('t', { type: 'text', sysex: 'F0 $value F7', length: 4, pad: 32 }),
    () => api.ce.device.defineParameter('b', { type: 'boolean', cc: 1, trueValue: 127, falseValue: 0 }),
    () => api.ce.device.defineParameter('n', { cc: 2, encoding: 'nibbled', nibbles: 4 }),
    // A dump layout's prefix and suffix, inside `match` or beside it, and a checksum given whole.
    () => api.ce.device.defineDump('d', { match: { prefix: 'F0 41', suffix: 'F7' }, fields: [],
      checksum: { type: 'roland', fromOffset: 5 } }),
    () => api.ce.device.defineDump('d', { prefix: 'F0 41', suffix: 'F7', request: 'F0 41 F7', offset: 2, size: 4, name: 'D' }),
    // A section on create and clone, by the name set() uses.
    () => api.ce.panel.create('Knob', { name: 'k', x: 1, Behavior: { min: 0 }, Core: { tooltip: 'x' } }),
    () => api.ce.panel.clone('k', { name: 'k2', Transform: { x: 3 } }),
    // Options that are not a table at all.
    () => api.ce.ui.notify('hi', 'warn'),
    () => api.ce.ui.notify('hi'),
    () => api.ce.ui.notify('hi', null),
    () => api.set('nothing.value', 1, 'value'),
  ];
  for (const call of quiet) assert.deepEqual(refusals(call), [], String(call));
});

test('the members that check their own keys are not refused twice', () => {
  // ce.text.style and ce.image.set refuse an unknown option in words of their own, as ce.panel.find
  // and the storage calls do; a second line from the common check would say it twice.
  const lines = linesOf(() => api.ce.storage.saveSetting('k', 1, { scop: 'script' }));
  assert.deepEqual(lines, [
    'error: ce.storage.saveSetting: "scop" is not one of its options, so nothing was done. Its only option is scope.',
  ]);
  const checked = optionCheckedMembersForTesting();
  for (const path of ['ce.text.style', 'ce.image.set', 'ce.panel.find', 'ce.storage.saveSetting']) {
    assert.ok(!checked.includes(path), `${path} should check its own keys`);
  }
});

test('the check is the contract: every member whose options list fields is checked', () => {
  const expected = ALL_MEMBERS
    .filter((m) => m.kind !== 'lifecycle' && !MEMBERS_CHECKING_OWN_OPTIONS.has(m.id))
    .filter((m) => (m.params ?? []).some((p) => Array.isArray(p.fields) && p.fields.length))
    .map((m) => memberPath(m.id))
    .sort();
  assert.deepEqual(optionCheckedMembersForTesting(), expected);
  assert.ok(expected.length > 40, 'most of the API takes options');
});

test('what each checked member answers when it refuses', () => {
  // Pinned whole, so a member that gains options, or changes what it returns, is a decision someone
  // makes here rather than a default nobody looked at. refusalOf reads `refusal` on the member, or
  // the signature's `-> boolean` (false) and `-> list` (an empty list).
  const answers = Object.fromEntries(optionChecks().map((c) => [c.path, c.refusal]));
  assert.ok(Object.values(answers).every((a) => REFUSAL_ANSWERS.includes(a)));
  const byAnswer = {};
  for (const [path, answer] of Object.entries(answers)) (byAnswer[answer] ??= []).push(path);
  for (const list of Object.values(byAnswer)) list.sort();
  assert.deepEqual(byAnswer, {
    nothing: ['ce.draw.measure', 'ce.draw.stroke', 'ce.draw.transform', 'ce.midi.checksum', 'ce.midi.panic',
      'ce.midi.read', 'ce.panel.clone', 'ce.panel.create', 'ce.storage.encode', 'ce.text.fit', 'ce.time.syncTimer',
      'ce.ui.notify', 'set'],
    false: ['ce.anim.envelope', 'ce.anim.spring', 'ce.anim.to', 'ce.device.bind', 'ce.device.defineDump',
      'ce.device.defineParameter', 'ce.device.requestDump', 'ce.draw.curve', 'ce.draw.grid', 'ce.draw.image',
      'ce.draw.polygon', 'ce.draw.text', 'ce.image.icon', 'ce.ui.status', 'ce.ui.update'],
    zero: ['ce.panel.align', 'ce.panel.circle', 'ce.panel.distribute', 'ce.panel.grid', 'ce.panel.match'],
    'empty list': ['ce.device.parameters', 'ce.device.ports', 'ce.image.assets', 'ce.text.fonts'],
    result: ['ce.device.recallPreset'],
    unanswered: ['ce.ui.choose', 'ce.ui.dialog', 'ce.ui.prompt'],
  });
  assert.equal(refusalOf({ signature: 'x() -> boolean' }), 'false');
  assert.equal(refusalOf({ signature: 'x() -> list' }), 'empty list');
  assert.equal(refusalOf({ signature: 'x() -> number' }), 'nothing');
});

test('set()\'s transmit option and dialog\'s plumbing', () => {
  // `ask` is how prompt and choose tell the dialog store their shape. dialog named its own shape
  // only when the script did not, so { ask = "text" } turned it into a prompt; it is refused now,
  // like any key dialog does not take.
  assert.deepEqual(linesOf(() => api.ce.ui.dialog({ title: 'Q', ask: 'text' })), [
    'error: ce.ui.dialog: "ask" is not one of its options, so nothing was done. Its options are: title, message, buttons, kind, default.',
  ]);
  // set() lists transmit, so it is never refused (the value reaching the write is pinned in
  // deviceStructure.test.js).
  assert.deepEqual(refusals(() => api.set('nothing.value', 1, { transmit: false })), []);
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
    assert.deepEqual(get(scriptTrace).filter((t) => OPTION_LINE.test(`: ${t.message}`)).map((t) => t.message), [
      'ce.anim.to: "easing" is not one of its options, so nothing was done. Its options are: duration, beats, '
        + 'sync, curve, damping, frequency, from, delay, stagger, repeat, pingpong, done.',
    ]);
  } finally {
    lua.global.close();
    resetScriptStateForTesting();
  }
});
