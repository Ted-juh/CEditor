// ce.keys: who gets each key, the panel's shortcuts, the keys held, and the computer-keyboard piano
// (scripting/scriptKeys.js), and keyDown keeping a key by returning true (panelRuntime.js). The
// preview surface's part — feeding real browser events in — is a browser check; here the events are
// plain objects with what a KeyboardEvent has.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { get } from 'svelte/store';

import {
  keyName, keyFields, addShortcut, removeShortcut, listShortcuts, isDown, heldKeys, setPiano, pianoInfo,
  focusControl, focusedControl, keysCapture, keysBubble, keysUp, noteRaised, letGo, resetKeys, setKeysHost,
  setShortcutRunner, pianoSilence, keyIsTheEditors,
} from '../src/CE_Application/scripting/scriptKeys.js';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { setPreviewModeEnabled } from '../src/CE_Application/stores/interactionPreview.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import {
  initPanelRuntime, approveCurrentPanelScripts, dispatchKeyEvent, scriptsHear, scriptApiForTesting,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

const key = (k, code, mods = {}) => ({
  key: k, code, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt, metaKey: !!mods.meta,
  repeat: !!mods.repeat, defaultPrevented: !!mods.prevented,
});

function stubHost(extra = {}) {
  const played = [];
  const host = {
    played,
    playNote: (note, velocity, on, piano) => played.push([note, velocity, on, piano.target || piano.channel]),
    isKeyboard: (name) => name === 'Keys',
    canPlay: () => true,
    focus: (name) => (name === 'Cutoff' ? (host.has = name, true) : false),
    focused: () => host.has ?? '',
    panicShortcut: () => 'Escape',
    ...extra,
  };
  return host;
}

function fresh(extra) {
  resetKeys();
  letGo();
  const host = stubHost(extra);
  setKeysHost(host);
  const ran = [];
  setShortcutRunner((s, fields) => ran.push([s.keys, fields]));
  const said = [];
  return { host, ran, said, say: (level, text) => said.push(`${level}: ${text}`) };
}

test('a key is named as it is printed, and its place is its code', () => {
  assert.equal(keyName(key('r', 'KeyR')), 'R');
  assert.equal(keyName(key(' ', 'Space')), 'Space');
  assert.equal(keyName(key('ArrowUp', 'ArrowUp')), 'Up');
  assert.equal(keyName(key('Control', 'ControlLeft')), 'Ctrl');
  assert.equal(keyName(key('F2', 'F2')), 'F2');
  assert.deepEqual(keyFields(key('g', 'KeyG', { ctrl: true }), 'Cutoff'),
    { key: 'G', code: 'KeyG', ctrl: true, shift: false, alt: false, meta: false, repeat: false, control: 'Cutoff' });
  assert.equal('control' in keyFields(key('g', 'KeyG')), false, 'no control: the field is left out, nothing in Lua');
});

test('a shortcut is refused for the panic key, the editor\'s keys, the DAW\'s, a taken key and a non-key', () => {
  const { say, said } = fresh();
  const fn = () => {};
  assert.equal(addShortcut('s', 'Escape', fn, {}, say), undefined);
  assert.equal(addShortcut('s', 'F5', fn, {}, say), undefined);
  assert.equal(addShortcut('s', 'Ctrl+S', fn, {}, say), undefined);
  assert.equal(addShortcut('s', 'Ctrl+R', fn, {}, say), undefined);
  assert.equal(addShortcut('s', 'Ctrl+', fn, {}, say), undefined);
  assert.equal(addShortcut('s', 'Shift', fn, {}, say), undefined);
  assert.equal(addShortcut('s', 'Ctrl+G', 'not a function', {}, say), undefined);
  const id = addShortcut('s', 'ctrl+g', fn, { description: 'Random voice' }, say);
  assert.equal(id, 1);
  assert.equal(addShortcut('s', 'Ctrl+G', fn, {}, say), undefined);
  assert.deepEqual(said, [
    'error: ce.keys.shortcut: Escape is the panel\'s panic key, so no shortcut was made.',
    'error: ce.keys.shortcut: F5 is one of the editor\'s own keys, so no shortcut was made.',
    'error: ce.keys.shortcut: Ctrl+S is one of the editor\'s own keys, so no shortcut was made.',
    'error: ce.keys.shortcut: Ctrl+R is a key DAWs and the system take before the panel sees it, so no shortcut was made.',
    'error: ce.keys.shortcut: "Ctrl+" is not a key, so no shortcut was made. Write a key and its modifiers joined by +, such as "Ctrl+R" or "F2".',
    'error: ce.keys.shortcut: "Shift" is not a key, so no shortcut was made. Write a key and its modifiers joined by +, such as "Ctrl+R" or "F2".',
    'error: ce.keys.shortcut: Ctrl+G needs a function to run, so no shortcut was made.',
    'error: ce.keys.shortcut: Ctrl+G is already a shortcut ("Random voice"), so no shortcut was made.',
  ]);
  said.length = 0;
  assert.equal(addShortcut('s', 'Space', fn, {}, say), 2, 'Space is allowed…');
  assert.match(said[0], /^warn: .*no longer starts the transport/, '…with a console line');
});

test('the order: typing keeps every key, a modifier shortcut beats a focused control, a bare one waits for it', () => {
  const { say, ran } = fresh();
  addShortcut('s', 'Ctrl+G', () => {}, {}, say);
  addShortcut('s', 'Up', () => {}, {}, say);
  // Typing: nothing here sees it.
  assert.equal(keysCapture(key('g', 'KeyG', { ctrl: true }), { typing: true }), false);
  assert.equal(keysBubble(key('g', 'KeyG', { ctrl: true }), { typing: true }), '');
  assert.equal(ran.length, 0);
  // With a modifier: at once, on the way in, even with a knob focused.
  assert.equal(keysCapture(key('g', 'KeyG', { ctrl: true }), { control: 'Cutoff' }), true);
  assert.deepEqual(ran.map(([k]) => k), ['Ctrl+G']);
  assert.equal(ran[0][1].control, 'Cutoff');
  // Without: a focused control goes first. It used the key, so the shortcut does not run…
  assert.equal(keysCapture(key('ArrowUp', 'ArrowUp'), { control: 'Cutoff' }), false);
  assert.equal(keysBubble(key('ArrowUp', 'ArrowUp', { prevented: true }), { control: 'Cutoff' }), '');
  assert.equal(ran.length, 1);
  // …and with no control focused it runs on the way in.
  assert.equal(keysCapture(key('ArrowUp', 'ArrowUp'), {}), true);
  assert.equal(ran.length, 2);
  // A control that did not use it lets the waiting shortcut run on the way out.
  assert.equal(keysBubble(key('ArrowUp', 'ArrowUp'), { control: 'Label' }), 'shortcut');
  assert.equal(ran.length, 3);
  // The panic key is nobody's but the panic's.
  assert.equal(keysCapture(key('Escape', 'Escape'), { panic: true }), false);
  assert.equal(keysBubble(key('Escape', 'Escape'), { panic: true }), '');
  // A key nobody kept is for keyDown; a bare modifier is not.
  assert.equal(keysBubble(key('q', 'KeyQ'), {}), 'event');
  assert.equal(keysBubble(key('Shift', 'ShiftLeft', { shift: true }), {}), '');
});

test('a held key repeats a shortcut only when asked', () => {
  const { say, ran } = fresh();
  addShortcut('s', 'Ctrl+G', () => {}, {}, say);
  addShortcut('s', 'Ctrl+H', () => {}, { repeat: true }, say);
  assert.equal(keysCapture(key('g', 'KeyG', { ctrl: true, repeat: true }), {}), true, 'still kept…');
  assert.equal(ran.length, 0, '…but not run again');
  keysCapture(key('h', 'KeyH', { ctrl: true, repeat: true }), {});
  assert.equal(ran.length, 1);
});

test('list gives the panic key first, then the shortcuts, then the piano; remove takes one away', () => {
  const { say } = fresh();
  const a = addShortcut('s', 'Ctrl+G', () => {}, { description: 'Random voice' }, say);
  addShortcut('s', 'F2', () => {}, {}, say);
  assert.deepEqual(listShortcuts(), [
    { id: 'panic', keys: 'Escape', description: 'Panic: every note off' },
    { id: a, keys: 'Ctrl+G', description: 'Random voice' },
    { id: a + 1, keys: 'F2' },
  ]);
  setPiano({}, say);
  assert.deepEqual(listShortcuts().at(-1), { id: 'piano', keys: 'Piano', description: 'Notes from the letter keys' });
  assert.equal(removeShortcut(a), true);
  assert.equal(removeShortcut(a), false);
  assert.deepEqual(listShortcuts().map((s) => s.keys), ['Escape', 'F2', 'Piano']);
  resetKeys();
  assert.deepEqual(listShortcuts().map((s) => s.keys), ['Escape'], 'a reload takes the script\'s keys away');
});

test('held keys are counted by name or place, in order, and let go with the keyboard', () => {
  fresh();
  keysCapture(key('Control', 'ControlLeft', { ctrl: true }), {});
  keysCapture(key('g', 'KeyG', { ctrl: true }), {});
  assert.deepEqual(heldKeys(), ['Ctrl', 'G']);
  assert.equal(isDown('Ctrl'), true);
  assert.equal(isDown('g'), true);
  assert.equal(isDown('KeyG'), true);
  keysCapture(key('x', 'KeyX'), { typing: true });
  assert.equal(isDown('X'), false, 'typing is not counted');
  keysUp(key('g', 'KeyG'));
  assert.deepEqual(heldKeys(), ['Ctrl']);
  letGo();
  assert.deepEqual(heldKeys(), []);
});

test('the piano plays by place, one note per press, and moves its octave and velocity', () => {
  const { host, say } = fresh();
  assert.equal(setPiano({}, say), true);
  assert.equal(keysCapture(key('a', 'KeyA'), {}), true);
  assert.equal(keysCapture(key('a', 'KeyA', { repeat: true }), {}), true, 'a repeat is kept and ignored');
  assert.equal(keysCapture(key('w', 'KeyW'), {}), true);
  assert.deepEqual(host.played, [[60, 100, true, 1], [61, 100, true, 1]]);
  assert.deepEqual(pianoInfo().notes, [{ note: 60, key: 'A' }, { note: 61, key: 'W' }]);
  assert.equal(keysUp(key('a', 'KeyA')).piano, true);
  assert.deepEqual(host.played.at(-1), [60, 0, false, 1]);
  // On an AZERTY keyboard the key in the A place prints "q": it still plays C.
  keysCapture(key('q', 'KeyA'), {});
  assert.deepEqual(host.played.at(-1), [60, 100, true, 1]);
  keysUp(key('q', 'KeyA'));
  // Z and X move the octave, C and V the velocity.
  keysCapture(key('x', 'KeyX'), {});
  keysCapture(key('v', 'KeyV'), {});
  assert.equal(pianoInfo().octave, 5);
  assert.equal(pianoInfo().velocity, 120);
  keysCapture(key('a', 'KeyA'), {});
  assert.deepEqual(host.played.at(-1), [72, 120, true, 1]);
  // Ctrl+A is a shortcut's, not the piano's.
  assert.equal(keysCapture(key('a', 'KeyA', { ctrl: true }), {}), false);
  // Off lets every note go.
  setPiano({ on: false }, say);
  assert.deepEqual(host.played.filter(([, , on]) => !on).map(([n]) => n), [60, 60, 61, 72]);
  assert.deepEqual(pianoInfo().notes, []);
});

test('the piano plays through a Keyboard component, and refuses one that is not there', () => {
  const { host, say, said } = fresh();
  assert.equal(setPiano({ target: 'Nope' }, say), false);
  assert.match(said[0], /"Nope" is not a Keyboard on the panel/);
  assert.equal(setPiano({ target: 'Keys', octave: 3 }, say), true);
  keysCapture(key('a', 'KeyA'), {});
  assert.deepEqual(host.played.at(-1), [48, 100, true, 'Keys']);
  assert.equal(pianoInfo().target, 'Keys');
  pianoSilence();
  assert.deepEqual(host.played.at(-1), [48, 0, false, 'Keys'], 'the panic key lets the piano\'s notes go');
  assert.equal(pianoInfo().on, true, '…and leaves it on');
});

test('with nothing to play to, the piano says so and stays off', () => {
  const { say, said } = fresh({ canPlay: () => false });
  assert.equal(setPiano({}, say), false);
  assert.equal(pianoInfo().on, false);
  assert.match(said[0], /nothing to play to/);
  setKeysHost(null);
  assert.equal(setPiano({}, say), false, 'and with no live panel at all');
});

test('losing the keyboard raises keyUp for every key scripts heard go down, and silences the piano', () => {
  const { host, say } = fresh();
  setPiano({}, say);
  keysCapture(key('a', 'KeyA'), {});
  const down = key('q', 'KeyQ');
  keysCapture(down, {});
  noteRaised(down, keyFields(down));
  const ups = letGo();
  assert.deepEqual(ups, [{ key: 'Q', code: 'KeyQ', ctrl: false, shift: false, alt: false, meta: false }]);
  assert.deepEqual(host.played.at(-1), [60, 0, false, 1]);
  // A key-up after that finds nothing to raise.
  assert.deepEqual(keysUp(down), { piano: false, fields: null });
});

test('a key-up is raised for a key whose key-down was, and only then', () => {
  fresh();
  const down = key('q', 'KeyQ');
  assert.deepEqual(keysUp(down), { piano: false, fields: null });
  noteRaised(down, keyFields(down));
  assert.deepEqual(keysUp(down, { control: 'Cutoff' }).fields,
    { key: 'Q', code: 'KeyQ', ctrl: false, shift: false, alt: false, meta: false, control: 'Cutoff' });
});

test('focus goes through the panel, and the editor\'s keys are known', () => {
  fresh();
  assert.equal(focusControl('Cutoff'), true);
  assert.equal(focusedControl(), 'Cutoff');
  assert.equal(focusControl('Hidden'), false);
  setKeysHost(null);
  assert.equal(focusControl('Cutoff'), false, 'no live panel: refused');
  assert.equal(focusedControl(), undefined);
  assert.equal(keyIsTheEditors(key('F5', 'F5')), true);
  assert.equal(keyIsTheEditors(key('s', 'KeyS', { ctrl: true })), true);
  assert.equal(keyIsTheEditors(key('g', 'KeyG', { ctrl: true })), false);
});

/* ------------------------------------------------------------------ through the runtime */

const script = (id, event, source) => ({ id, name: id, event, source, language: 'javascript', scope: 'panel', enabled: true });
const messages = () => get(scriptTrace).map((t) => t.message);
async function until(check, what) {
  for (let n = 0; n < 200 && !check(); n++) await delay(10);
  assert.ok(check(), `${what}\n${messages().join('\n')}`);
}
initPanelRuntime();

test('keyDown keeps a key when a handler returns true, and only then', async () => {
  const control = createControl('Knob', { name: 'k' });
  control._children.Core.name = 'k';
  const p = {
    id: 'keys-panel', name: 'keys', controls: [control], scripting: { modules: MODULES.map((m) => m.id) },
    scripts: [
      script('keys', 'onKeyDown', 'function onKeyDown(key) { log("DOWN " + key.key + " " + key.code); return key.key === "G"; }'),
      script('ready', 'onPanelReady', 'function onPanelReady() { log("READY"); }'),
    ],
  };
  panels.set([p]);
  activePanelId.set(p.id);
  activeEditorTab.set({ type: 'panel', id: p.id });
  approveCurrentPanelScripts();
  clearScriptTrace();
  try {
    setPreviewModeEnabled(true);
    await until(() => messages().includes('READY'), 'the panel is live');
    assert.equal(scriptsHear('onKeyDown'), true);
    assert.equal(scriptsHear('onKeyUp'), false);
    assert.equal(await dispatchKeyEvent('onKeyDown', { key: 'G', code: 'KeyG' }), true);
    assert.equal(await dispatchKeyEvent('onKeyDown', { key: 'H', code: 'KeyH' }), false);
    assert.ok(messages().includes('DOWN G KeyG') && messages().includes('DOWN H KeyH'));
  } finally {
    setPreviewModeEnabled(false);
    panels.set([]);
  }
});

test('the commands are reachable as ce.keys and refuse an option they do not take', () => {
  fresh();
  const api = scriptApiForTesting();
  clearScriptTrace();
  const id = api.ce.keys.shortcut('Ctrl+G', () => {}, { description: 'x' });
  assert.equal(typeof id, 'number');
  assert.deepEqual(api.ce.keys.list().map((s) => s.keys), ['Escape', 'Ctrl+G']);
  assert.equal(api.ce.keys.shortcut('Ctrl+J', () => {}, { descripton: 'typo' }), undefined);
  assert.ok(get(scriptTrace).some((e) => e.kind === 'error' && /descripton/.test(e.message)));
  assert.equal(api.ce.keys.remove(id), true);
  resetKeys();
});
