// scriptKeys.js — ce.keys: the computer keyboard on a panel.
//
// Design record: docs/design/ce-keys-module.md. Panel view only: the editor's preview and an
// exported plug-in with its window open. With the window shut there is no keyboard, and the C++
// engines stub every command (panelApi.js, RUNTIME_WEBVIEW).
//
// This file holds what the keyboard is doing — the panel's shortcuts, the keys held, the piano —
// and decides who gets each key. The preview surface (PanelPreviewSurface.svelte) hands it every
// key and does what it says; panelRuntime.js binds the commands to scripts and raises keyDown and
// keyUp. Who gets a key, in order (each step can keep it, and a kept key goes no further):
//
//   1. typing (a text box, an LCD being edited, an input method composing): nothing here sees it
//   2. the panic key
//   3. shortcuts — those with a modifier at once, on the way in; one without waits for the focused
//      control, so an arrow still moves a focused knob
//   4. the piano
//   5. the focused control's own keys
//   6. keyDown, for scripts; a handler that returns true keeps the key
//   7. whatever is around the panel: the DAW, the editor
//
// The surface owns the DOM and the notes; it gives this file a host (setKeysHost) to play a note,
// move the focus and so on. With no surface (a test, the design view) the commands answer as the
// design says for a panel with nothing to play to.

import {
  parseShortcut, formatShortcut, shortcutHasModifier, isHostClaimedShortcut, DEFAULT_PANIC_SHORTCUT,
} from '../utils/panicLayout.js';
import { GLOBAL_SHORTCUTS } from '../utils/globalShortcuts.js';

/* ------------------------------------------------------------------------------ key names */

// The name a key has in a keyDown event and in a shortcut: the key printed on it, letters in upper
// case, and these for the keys that print no character.
const EVENT_KEY_NAMES = {
  ' ': 'Space', Spacebar: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Control: 'Ctrl', OS: 'Meta', Esc: 'Escape', Del: 'Delete',
};
const WRITTEN_KEY_NAMES = {
  space: 'Space', up: 'Up', down: 'Down', left: 'Left', right: 'Right', arrowup: 'Up', arrowdown: 'Down',
  arrowleft: 'Left', arrowright: 'Right', enter: 'Enter', return: 'Enter', esc: 'Escape', escape: 'Escape',
  tab: 'Tab', backspace: 'Backspace', delete: 'Delete', del: 'Delete', insert: 'Insert', home: 'Home',
  end: 'End', pageup: 'PageUp', pagedown: 'PageDown', ctrl: 'Ctrl', control: 'Ctrl', shift: 'Shift',
  alt: 'Alt', meta: 'Meta',
};
const MODIFIER_NAMES = new Set(['Ctrl', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/** A key-down's name: "R", "7", "Space", "Up", "F2". */
export function keyName(event) {
  const raw = String(event?.key ?? '');
  if (EVENT_KEY_NAMES[raw]) return EVENT_KEY_NAMES[raw];
  if (raw.length === 1) return raw.toUpperCase();
  return raw;
}

/** A key as a script writes it ("up", "f2", "r", "KeyR") to the name keyDown gives, or its code. */
function writtenKeyName(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  const known = WRITTEN_KEY_NAMES[raw.toLowerCase()];
  if (known) return known;
  if (/^f\d{1,2}$/i.test(raw)) return raw.toUpperCase();
  if (raw.length === 1) return raw.toUpperCase();
  return raw;
}

export function isModifierKey(event) {
  return MODIFIER_NAMES.has(keyName(event));
}

/** What keyDown and keyUp hand a script, and what a shortcut's function is called with. */
export function keyFields(event, control) {
  const fields = {
    key: keyName(event),
    code: String(event?.code ?? ''),
    ctrl: event?.ctrlKey === true,
    shift: event?.shiftKey === true,
    alt: event?.altKey === true,
    meta: event?.metaKey === true,
    repeat: event?.repeat === true,
  };
  if (control) fields.control = String(control);
  return fields;
}

/* ------------------------------------------------------------------------------ state */

let override = null;             // a host set directly (tests)
const hosts = new Map();         // panel id -> the surface showing that panel
let livePanelId = () => '';
let runner = (shortcut, fields) => shortcut.fn(fields);
const shortcuts = [];            // { id, binding, keys, description, repeat, fn, scriptId }
let nextShortcutId = 1;
const held = new Map();          // code -> name, in the order they went down
const raised = new Map();        // code -> the keyDown fields, for keys whose keyDown scripts heard

const PIANO_DEFAULTS = Object.freeze({
  on: false, target: '', octave: 4, velocity: 100, channel: 1, role: 'mainSynth', octaveKeys: true, velocityKeys: true,
});
let piano = { ...PIANO_DEFAULTS };
const pianoNotes = new Map();    // code -> note, for the notes the piano holds now

// The piano by the keys' PLACE, so the same places play the same notes on every layout. The middle
// letter row is the white keys from C, the row above it the black ones (Ableton Live's, Hostage's).
export const PIANO_LAYOUT = Object.freeze({
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10,
  KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
});
const PIANO_KEY_LABELS = { Semicolon: ';', Quote: "'" };

/**
 * A surface's host: `{ playNote(note, velocity, on, piano), isKeyboard(name), canPlay(piano),
 * focus(name), focused(), panicShortcut() }`. Several surfaces can be mounted at once (a gallery
 * draws sample panels with the same component), so each registers under the panel it shows and the
 * keyboard belongs to the one showing the panel the scripts run on. Returns the function that
 * unregisters it.
 */
export function registerKeysSurface(panelId, next) {
  const key = String(panelId ?? '');
  hosts.set(key, next);
  return () => {
    if (hosts.get(key) !== next) return;
    if (isLiveSurface(key)) letGo();
    hosts.delete(key);
  };
}

/** How the live panel's id is found: panelRuntime.js's, which knows the panel its scripts run on. */
export function setKeysPanelResolver(fn) {
  livePanelId = typeof fn === 'function' ? fn : () => '';
}

/** Whether a surface showing this panel is the one the keyboard belongs to. */
export function isLiveSurface(panelId) {
  return String(panelId ?? '') === String(livePanelId() ?? '');
}

/** A host directly, whatever panel is live: for tests. null clears it. */
export function setKeysHost(next) {
  if (!next) letGo();
  override = next ?? null;
}

function currentHost() {
  return override ?? hosts.get(String(livePanelId() ?? '')) ?? null;
}

/** How a shortcut's function is called: panelRuntime wraps it as it does every handler. */
export function setShortcutRunner(fn) {
  runner = typeof fn === 'function' ? fn : (shortcut, fields) => shortcut.fn(fields);
}

/** Everything a script set up goes when the scripts reload. Held keys stay held: they are the user's. */
export function resetKeys() {
  shortcuts.length = 0;
  nextShortcutId = 1;
  pianoOff();
  piano = { ...PIANO_DEFAULTS };
}

/* ------------------------------------------------------------------------------ shortcuts */

function panicBinding() {
  const text = currentHost()?.panicShortcut?.() ?? DEFAULT_PANIC_SHORTCUT;
  const binding = parseShortcut(text);
  if (binding) binding.key = writtenKeyName(binding.key);
  return binding;
}

function sameBinding(a, b) {
  return !!a && !!b && a.key === b.key && a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.meta === b.meta;
}

/** A key-down as the editor's shortcut list reads one, for asking whether the editor has it. */
function bindingAsEvent(binding) {
  const named = { Space: ' ', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight' };
  return {
    key: named[binding.key] ?? (binding.key.length === 1 ? binding.key.toLowerCase() : binding.key),
    ctrlKey: binding.ctrl, metaKey: binding.meta, shiftKey: binding.shift, altKey: binding.alt,
  };
}

/** Whether a key-down is one of the editor's own shortcuts (F5, Ctrl+S, ...): those always go on. */
export function keyIsTheEditors(event) {
  return GLOBAL_SHORTCUTS.some((s) => {
    try { return s.match(event) === true; } catch { return false; }
  });
}

function editorHas(binding) {
  const event = bindingAsEvent(binding);
  return GLOBAL_SHORTCUTS.some((s) => {
    try { return s.match(event) === true; } catch { return false; }
  });
}

function eventMatches(event, binding) {
  if (event?.ctrlKey === true) { if (!binding.ctrl) return false; } else if (binding.ctrl) return false;
  if ((event?.altKey === true) !== binding.alt) return false;
  if ((event?.shiftKey === true) !== binding.shift) return false;
  if ((event?.metaKey === true) !== binding.meta) return false;
  const name = keyName(event);
  if (name === binding.key) return true;
  // Shift+7 is "&" on a US keyboard and "/" on a German one; the 7 is still the key pressed.
  if (binding.shift && /^\d$/.test(binding.key)) return String(event?.code ?? '') === `Digit${binding.key}`;
  return false;
}

/**
 * ce.keys.shortcut. Returns the new id, or undefined when refused (with `say` saying why).
 * `say(level, text)`.
 */
export function addShortcut(scriptId, keys, fn, opts, say) {
  const binding = parseShortcut(keys);
  if (binding) binding.key = writtenKeyName(binding.key);
  if (!binding || !binding.key || MODIFIER_NAMES.has(binding.key)) {
    say('error', `ce.keys.shortcut: "${String(keys ?? '')}" is not a key, so no shortcut was made. Write a key and its modifiers joined by +, such as "Ctrl+R" or "F2".`);
    return undefined;
  }
  const text = formatShortcut(binding);
  if (typeof fn !== 'function') {
    say('error', `ce.keys.shortcut: ${text} needs a function to run, so no shortcut was made.`);
    return undefined;
  }
  if (sameBinding(binding, panicBinding())) {
    say('error', `ce.keys.shortcut: ${text} is the panel's panic key, so no shortcut was made.`);
    return undefined;
  }
  if (editorHas(binding)) {
    say('error', `ce.keys.shortcut: ${text} is one of the editor's own keys, so no shortcut was made.`);
    return undefined;
  }
  if (isHostClaimedShortcut(binding)) {
    say('error', `ce.keys.shortcut: ${text} is a key DAWs and the system take before the panel sees it, so no shortcut was made.`);
    return undefined;
  }
  const taken = shortcuts.find((s) => sameBinding(s.binding, binding));
  if (taken) {
    say('error', `ce.keys.shortcut: ${text} is already a shortcut${taken.description ? ` ("${taken.description}")` : ''}, so no shortcut was made.`);
    return undefined;
  }
  if (binding.key === 'Space' && !shortcutHasModifier(binding)) {
    say('warn', 'ce.keys.shortcut: Space is now the panel\'s; in a DAW it no longer starts the transport while the plug-in has the keyboard.');
  }
  const id = nextShortcutId++;
  shortcuts.push({
    id, binding, keys: text, fn, scriptId: String(scriptId ?? ''),
    description: typeof opts?.description === 'string' ? opts.description : '',
    repeat: opts?.repeat === true,
  });
  return id;
}

export function removeShortcut(id) {
  const at = shortcuts.findIndex((s) => s.id === Number(id));
  if (at < 0) return false;
  shortcuts.splice(at, 1);
  return true;
}

/** ce.keys.list: the panic key first, then the shortcuts in the order they were made, then the piano. */
export function listShortcuts() {
  const out = [];
  const panic = panicBinding();
  if (panic) out.push({ id: 'panic', keys: formatShortcut(panic), description: 'Panic: every note off' });
  for (const s of shortcuts) {
    const entry = { id: s.id, keys: s.keys };
    if (s.description) entry.description = s.description;
    out.push(entry);
  }
  if (piano.on) out.push({ id: 'piano', keys: 'Piano', description: 'Notes from the letter keys' });
  return out;
}

function shortcutFor(event) {
  return shortcuts.find((s) => eventMatches(event, s.binding)) ?? null;
}

function runShortcut(shortcut, event, control) {
  if (event?.repeat === true && !shortcut.repeat) return;
  runner(shortcut, keyFields(event, control));
}

/* ------------------------------------------------------------------------------ held keys */

export function isDown(key) {
  const wanted = String(key ?? '');
  if (!wanted) return false;
  if (held.has(wanted)) return true;          // a place, as `code` gives it
  const name = writtenKeyName(wanted);
  for (const value of held.values()) if (value === name) return true;
  return false;
}

export function heldKeys() {
  return [...new Set(held.values())];
}

/* ------------------------------------------------------------------------------ the piano */

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

function pianoOff() {
  for (const [code, note] of [...pianoNotes]) {
    pianoNotes.delete(code);
    currentHost()?.playNote?.(note, 0, false, piano);
  }
}

/** ce.keys.piano. True when the piano is on. */
export function setPiano(opts, say) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (o.on === false) {
    pianoOff();
    piano = { ...piano, on: false };
    return false;
  }
  const next = { ...piano, on: true };
  if (o.target !== undefined) next.target = o.target === null ? '' : String(o.target);
  if (o.octave !== undefined) next.octave = clampInt(o.octave, -1, 9);
  if (o.velocity !== undefined) next.velocity = clampInt(o.velocity, 1, 127);
  if (o.channel !== undefined) next.channel = clampInt(o.channel, 1, 16);
  if (o.role !== undefined) next.role = String(o.role || 'mainSynth');
  if (o.octaveKeys !== undefined) next.octaveKeys = o.octaveKeys !== false;
  if (o.velocityKeys !== undefined) next.velocityKeys = o.velocityKeys !== false;
  if (next.target && !currentHost()?.isKeyboard?.(next.target)) {
    say('error', `ce.keys.piano: "${next.target}" is not a Keyboard on the panel, so the piano is ${piano.on ? 'left as it was' : 'off'}.`);
    return piano.on;
  }
  if (!currentHost()?.canPlay?.(next)) {
    say('log', 'ce.keys.piano: the panel has nothing to play to here, so the piano is off.');
    pianoOff();
    piano = { ...next, on: false };
    return false;
  }
  // Where the notes go may have changed: let the held ones go where they went.
  if (next.target !== piano.target || next.channel !== piano.channel || next.role !== piano.role) pianoOff();
  piano = next;
  return true;
}

export function pianoInfo() {
  const info = {
    on: piano.on, octave: piano.octave, velocity: piano.velocity, channel: piano.channel,
    notes: [...pianoNotes].map(([code, note]) => ({ note, key: PIANO_KEY_LABELS[code] ?? code.replace(/^Key/, '') })),
  };
  if (piano.target) info.target = piano.target;
  return info;
}

function pianoTakes(event) {
  if (!piano.on || event?.ctrlKey || event?.altKey || event?.metaKey) return false;
  const code = String(event?.code ?? '');
  if (code in PIANO_LAYOUT) return true;
  if (piano.octaveKeys && (code === 'KeyZ' || code === 'KeyX')) return true;
  return piano.velocityKeys && (code === 'KeyC' || code === 'KeyV');
}

function pianoDown(event) {
  if (event?.repeat === true) return;          // one note per press, whatever the system repeats
  const code = String(event?.code ?? '');
  if (code === 'KeyZ' || code === 'KeyX') { piano.octave = clampInt(piano.octave + (code === 'KeyZ' ? -1 : 1), -1, 9); return; }
  if (code === 'KeyC' || code === 'KeyV') { piano.velocity = clampInt(piano.velocity + (code === 'KeyC' ? -20 : 20), 1, 127); return; }
  if (pianoNotes.has(code)) return;
  const note = (piano.octave + 1) * 12 + PIANO_LAYOUT[code];
  if (note < 0 || note > 127) return;
  pianoNotes.set(code, note);
  currentHost()?.playNote?.(note, piano.velocity, true, piano);
}

function pianoUp(event) {
  const code = String(event?.code ?? '');
  const note = pianoNotes.get(code);
  if (note === undefined) return false;
  pianoNotes.delete(code);
  currentHost()?.playNote?.(note, 0, false, piano);
  return true;
}

/* ------------------------------------------------------------------------------ focus */

export function focusControl(name) {
  return currentHost()?.focus?.(name === undefined || name === null ? '' : String(name)) === true;
}

export function focusedControl() {
  const name = currentHost()?.focused?.();
  return name ? String(name) : undefined;
}

/* ------------------------------------------------------------------------------ routing */

/**
 * On the way in (the window's capture phase), before any control sees the key. Returns true when a
 * shortcut or the piano kept it; the surface then stops it. `ctx`: { typing, panic, control }, where
 * `control` is the name of the control that has the keyboard, if any.
 */
export function keysCapture(event, ctx = {}) {
  if (ctx.typing) return false;
  const code = String(event?.code ?? '');
  if (code && event?.repeat !== true) held.set(code, keyName(event));
  if (ctx.panic) return false;
  const shortcut = shortcutFor(event);
  if (shortcut && (shortcutHasModifier(shortcut.binding) || !ctx.control)) {
    runShortcut(shortcut, event, ctx.control);
    return true;
  }
  if (pianoTakes(event)) {
    pianoDown(event);
    return true;
  }
  return false;
}

/**
 * On the way out, after the focused control had its chance (it did not keep the key, or it would
 * not be here). Returns 'shortcut' when a waiting shortcut ran, 'event' when scripts should hear
 * keyDown, or '' for nothing.
 */
export function keysBubble(event, ctx = {}) {
  if (ctx.typing || ctx.panic || event?.defaultPrevented) return '';
  const shortcut = shortcutFor(event);
  if (shortcut) {
    runShortcut(shortcut, event, ctx.control);
    return 'shortcut';
  }
  if (isModifierKey(event)) return '';
  return 'event';
}

/** Remember that scripts heard this key go down, so its keyUp is raised too. */
export function noteRaised(event, fields) {
  const code = String(event?.code ?? '') || keyName(event);
  raised.set(code, fields);
}

/**
 * A key went up. Returns { piano, fields }: whether it was a piano key (the surface stops it), and
 * the keyUp fields when scripts heard its keyDown (else null).
 */
export function keysUp(event, ctx = {}) {
  const code = String(event?.code ?? '');
  if (code) held.delete(code);
  const wasPiano = pianoUp(event);
  const key = code || keyName(event);
  const down = raised.get(key);
  if (!down) return { piano: wasPiano, fields: null };
  raised.delete(key);
  const fields = keyFields(event, ctx.control);
  delete fields.repeat;
  return { piano: wasPiano, fields };
}

/**
 * The panel lost the keyboard (the window lost focus or was hidden, or the panel closed): every
 * held key is let go. Returns the keyUp fields to raise, one per key scripts heard go down.
 */
export function letGo() {
  pianoOff();
  held.clear();
  const ups = [...raised.values()].map((fields) => {
    const up = { ...fields };
    delete up.repeat;
    return up;
  });
  raised.clear();
  return ups;
}

/** The piano's notes off, as the panic key does; the piano stays on. */
export function pianoSilence() {
  pianoOff();
}
