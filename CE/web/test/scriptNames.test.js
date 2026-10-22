// scriptNames.test.js — the names a panel's scripts share: timers, settings, custom events and
// actions, and the Values rows that read one call against the rest.
//
// A name one script uses and no other answers is the commonest slip there is, and the runtime
// cannot see it: stopping a timer that is not running, reading a setting nobody has saved and
// emitting an event nobody hears are each a thing a script may mean to do, and all three are quiet.
// The rows say it, from what the other scripts write out, and say nothing when a name is built
// from parts somewhere, since that may be any name. run() of an action nothing defines is refused
// at run time, and the row says it in those words.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptNames } from '../src/CE_Application/scripting/scriptNames.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { meaningLine } from '../src/CE_Application/editor/valueRows.js';
import { scriptApiForTesting, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

const SCRIPTS = [
  { id: 's1', name: 'Blinker', target: 'Led', language: 'lua', source: [
    'startTimer("blink", 250)',
    'saveSetting("volume", 3)',
    'saveSetting("mine", 1, { scope = "script" })',
    'emit("patchLoaded")',
    'defineAction("initPatch", function() end)',
    'function reset() end',
  ].join('\n') },
  { id: 's2', name: 'Display', target: 'Lcd', language: 'javascript', source: [
    'on("*", "patchLoaded", () => {});',
    'ce.time.stopTimer("blink");',
    'const v = ce.storage.loadSetting("volume", 0);',
    'run("initPatch");',
  ].join('\n') },
  { id: 's3', name: 'Tidy', target: 'Pad', language: 'python', source: 'def tidy():\n    forgetSetting("volume")\n' },
];
const NAMES = scriptNames(SCRIPTS);
const PANEL = { controls: [], scripting: { settings: { held: 5 } } };

/** The row of the call's shared name (or event), read as script `scriptId` writes it. */
function row(src, scriptId, names = NAMES) {
  const st = readStatement(src, 'lua', src.indexOf('(') + 1, { panel: PANEL, names, scriptId });
  return st.calls[0].args.find((a) => a.kind === 'sharedName' || a.kind === 'event');
}
const line = (src, scriptId) => meaningLine(row(src, scriptId));

test('the names the scripts write out, by what each call does with them', () => {
  const by = (list) => NAMES[list].map((e) => `${e.scriptId}:${e.name}${e.scope && e.scope !== 'panel' ? `/${e.scope}` : ''}`);
  assert.deepEqual(by('starts'), ['s1:blink']);
  assert.deepEqual(by('stops'), ['s2:blink']);
  assert.deepEqual(by('saves'), ['s1:volume', 's1:mine/script']);
  assert.deepEqual(by('loads'), ['s2:volume']);
  assert.deepEqual(by('forgets'), ['s3:volume']);
  assert.deepEqual([by('emits'), by('hears'), by('defines'), by('runs')], [['s1:patchLoaded'], ['s2:patchLoaded'], ['s1:initPatch'], ['s2:initPatch']]);
  assert.deepEqual(by('functions'), ['s1:reset', 's3:tidy']);
  assert.deepEqual(NAMES.computed, []);
  // A name built from parts is no name, and marks its list as one that may hold any.
  const built = scriptNames([{ id: 'x', language: 'lua', source: 'startTimer("t" .. n, 100)\nemit(name)' }]);
  assert.deepEqual([built.starts, built.emits, built.computed], [[], [], ['starts', 'emits']]);
});

test('a row says which script answers a name, and offers the names there are', () => {
  assert.equal(line('stopTimer("blink")', 's2'), "started in 'Blinker'");
  assert.equal(line('startTimer("blink", 100)', 's1'), "stopped in 'Display'");
  assert.equal(line('saveSetting("volume", 1)', 's1'), "read in 'Display'");
  assert.equal(line('loadSetting("volume", 0)', 's2'), "saved in 'Blinker'");
  assert.equal(line('loadSetting("held", 0)', 's2'), 'the panel holds 5');
  assert.equal(line('emit("patchLoaded")', 's1'), "heard in 'Display'");
  assert.equal(line('on("*", "patchLoaded", function() end)', 's2'), "a custom event, emitted in 'Blinker'");
  assert.equal(line('defineAction("initPatch", function() end)', 's1'), "run in 'Display'");
  assert.equal(line('run("initPatch")', 's2'), "defined in 'Blinker'");
  assert.equal(line('run("Led.reset")', 's2'), "a function in 'Blinker'");
  const stop = row('stopTimer("blink")', 's2');
  assert.deepEqual([stop.editable, stop.meaning.choices], ['choice', ['blink']]);
  assert.deepEqual(row('run("x")', 's2').meaning.choices, ['initPatch', 'reset', 'tidy']);
  // A script's private setting is its own: another script's read of it is answered by nothing.
  assert.equal(line('loadSetting("mine", 0, { scope = "script" })', 's1'), "saved in 'Blinker'");
  assert.equal(row('loadSetting("mine", 0, { scope = "script" })', 's2').problem?.severity, 'warning');
});

test('a name nobody answers is said, with the name meant', () => {
  const said = (src, scriptId) => row(src, scriptId).problem;
  assert.deepEqual(said('stopTimer("blnk")', 's2'),
    { severity: 'warning', message: 'no script starts a timer called "blnk", so this stops nothing. Did you mean "blink"?' });
  assert.deepEqual(said('loadSetting("volum", 0)', 's2'),
    { severity: 'warning', message: 'no script saves "volum", and the panel holds no setting by it, so this gives its fallback. Did you mean "volume"?' });
  assert.deepEqual(said('forgetSetting("nope")', 's3'),
    { severity: 'warning', message: 'no script saves "nope", and the panel holds no setting by it, so this forgets nothing.' });
  assert.deepEqual(said('emit("patchLoded")', 's1'),
    { severity: 'warning', message: 'no script listens for "patchLoded", so this reaches nothing. Did you mean "patchLoaded"?' });
  assert.deepEqual(said('on("*", "patchLoded", function() end)', 's2'),
    { severity: 'warning', message: 'no script emits "patchLoded", so this is never called. Did you mean "patchLoaded"?' });
  // The side that needs no answer says nothing: a timer nobody stops, a setting nobody reads.
  for (const src of ['startTimer("lonely", 100)', 'saveSetting("unread", 1)', 'defineAction("unused", function() end)']) {
    assert.equal(said(src, 's1'), null, src);
  }
  // A name built from parts anywhere may be the one, so nothing is claimed.
  const built = scriptNames([...SCRIPTS, { id: 's4', language: 'lua', source: 'startTimer(prefix .. "x", 100)\nemit(evt)' }]);
  assert.equal(row('stopTimer("blnk")', 's2', built).problem, null);
  assert.equal(row('on("*", "patchLoded", function() end)', 's2', built).problem, null);
});

test('run of an action nothing defines is said in the runtime\'s words', () => {
  // The runtime's refusal, with the panel's own actions registered as the scripts register them.
  resetScriptStateForTesting();
  panels.set([{ id: 'p', name: 'P', controls: [], scripting: { modules: ['ce.core'] } }]);
  activePanelId.set('p');
  try {
    const api = scriptApiForTesting('', 'names-probe');
    api.defineAction('initPatch', () => {});
    clearScriptTrace();
    api.run('initPatc');
    const said = get(scriptTrace).filter((t) => t.kind === 'error').map((t) => t.message);
    assert.deepEqual(row('run("initPatc")', 's2').problem, { severity: 'error', message: said[0] });
    assert.equal(said[0], 'run("initPatc") found no loaded script defining initPatc(). Registered actions: initPatch');
  } finally { panels.set([]); resetScriptStateForTesting(); }
});

test('a call after a colon is read, which only Lua chains on', async () => {
  // The scan the whole-source readers use (these, and the declared device parameters and dumps).
  // ":" was a chain in every language, so `{ a: clamp(x) }` read as a call to a.clamp, and the
  // call after a Python `def f():` or a ternary's ":" was not read at all.
  const { familyOf, tokenize, matchBrackets, scanCalls } = await import('../src/CE_Application/scripting/scriptValueScan.js');
  const callees = (src, lang) => {
    const tokens = tokenize(src, lang);
    const flat = (calls) => calls.flatMap((c) => [c.callee, ...flat(c.calls)]);
    return flat(scanCalls(tokens, 0, tokens.length, familyOf(lang), matchBrackets(tokens)));
  };
  assert.deepEqual(callees('set("k.value", { a: clamp(1, 2, 3) })', 'javascript'), ['set', 'clamp']);
  assert.deepEqual(callees('x = cond ? clamp(1, 2, 3) : clamp(4, 5, 6)', 'javascript'), ['clamp', 'clamp']);
  assert.deepEqual(callees('x = { "a": clamp(1, 2, 3) }', 'python'), ['clamp']);
  assert.deepEqual(callees('def tidy():\n    forgetSetting("v")', 'python'), ['forgetSetting']);
  assert.deepEqual(callees('local t = obj:method(1)', 'lua'), ['obj.method']);
});
