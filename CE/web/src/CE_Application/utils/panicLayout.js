// Panic — the button every hardware synth has, and the one thing the panel
// couldn't do. It silences everything: the notes the panel itself is holding
// (Chord Pad pads, a running Arp, a held Ribbon, latched Drum Pads), the echoed
// note display, and — the part that actually rescues you — whatever the SYNTH
// is holding because a note-off went missing.
//
// A stuck note is not hypothetical here: unplug a keyboard mid-note, or lose a
// note-off to a cable, and MIDI gives nobody a way to find out. Panic is the
// only cure, so it sends the standard silence set rather than trusting our own
// bookkeeping.

import { isTextEntryTarget } from './textEntry.js';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }

export const PANIC_SCOPES = ['all', 'channel'];
export const PANIC_SCOPE_LABELS = { all: 'All 16 channels', channel: 'One channel' };

export function panicConfig(control) {
  return control?._children?.Panic ?? {};
}
export function panicScope(control) {
  const s = String(panicConfig(control).scope ?? 'all');
  return PANIC_SCOPES.includes(s) ? s : 'all';
}
export function panicChannel(control) { return clampInt(panicConfig(control).channel ?? 1, 1, 16); }

// Which channels this button silences. All 16 is the right default: a stuck
// note is by definition one you've lost track of, so narrowing the search is
// exactly the wrong instinct.
export function panicChannels(control) {
  if (panicScope(control) === 'channel') return [panicChannel(control)];
  return Array.from({ length: 16 }, (_, i) => i + 1);
}

// The silence set, in the order that actually works:
//   CC 120 All Sound Off  — cuts even notes still in release
//   CC 123 All Notes Off  — releases anything held
//   CC 121 Reset All Controllers (optional) — drops a stuck mod wheel too
//   pitch bend centre (optional) — a ribbon glide left the synth detuned
// Sending 120 before 123 matters: 123 only lifts the keys, so on a long release
// you'd still be waiting for the tail.
export function panicMessages(control) {
  const cfg = panicConfig(control);
  const out = [];
  for (const ch of panicChannels(control)) {
    const status = 0xB0 | (ch - 1);
    out.push([status, 120, 0]);
    out.push([status, 123, 0]);
    if (cfg.resetControllers !== false) out.push([status, 121, 0]);
    if (cfg.centreBend !== false) out.push([0xE0 | (ch - 1), 0x00, 0x40]);
  }
  return out;
}

// The CC-only form of the silence set, for callers that can only send CCs: the
// `panic` script command, and every code-export target (their emitters know
// sendCC and nothing else).
//
// Pitch bend is absent on purpose. Per the MIDI spec, CC 121 Reset All
// Controllers already recentres pitch bend — the Panic *button* sends an
// explicit bend message on top as belt-and-braces for devices that implement
// 121 only partially. Emitting a `panic()` call that no target host defines
// would cost export-safety on every language, and that is worth more than the
// extra byte.
export function panicCcMessages({ scope = 'all', channel = 1, resetControllers = true } = {}) {
  const channels = String(scope) === 'channel'
    ? [clampInt(channel, 1, 16)]
    : Array.from({ length: 16 }, (_, i) => i + 1);
  const out = [];
  for (const ch of channels) {
    out.push({ channel: ch, cc: 120 });          // all sound off, first
    out.push({ channel: ch, cc: 123 });          // then all notes off
    if (resetControllers !== false) out.push({ channel: ch, cc: 121 });
  }
  return out;
}

// The config the EMERGENCY paths use — the Esc key and auto-panic on exit.
// Deliberately not any placed Panic button's config: someone may have set one
// up as a narrow "drums off, ch 10" button, and an emergency that only silences
// a third of the rig is worse than useless. Emergencies are always maximal.
export const EMERGENCY_PANIC = Object.freeze({
  _children: { Panic: { scope: 'all', resetControllers: true, centreBend: true } },
});

// --- The panic shortcut ---------------------------------------------------------
// Escape by default, but it lives on the panel so it travels with an exported
// Player, and plenty of rigs already have Escape bound to something else.
export const DEFAULT_PANIC_SHORTCUT = 'Escape';

const MODIFIER_ALIASES = {
  ctrl: 'ctrl', control: 'ctrl',
  alt: 'alt', option: 'alt',
  shift: 'shift',
  meta: 'meta', cmd: 'meta', command: 'meta', win: 'meta', super: 'meta',
};

// "Ctrl+Shift+P" / "Escape" / "F8" → a binding. An EMPTY string is not a
// failure to parse, it means the shortcut is switched off — some rigs will want
// no global key at all.
export function parseShortcut(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const binding = { key: '', ctrl: false, alt: false, shift: false, meta: false };
  for (const part of raw.split('+').map((p) => p.trim()).filter(Boolean)) {
    const mod = MODIFIER_ALIASES[part.toLowerCase()];
    if (mod) binding[mod] = true;
    else binding.key = part;
  }
  return binding.key ? binding : null;
}
export function formatShortcut(binding) {
  if (!binding?.key) return '';
  const parts = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('Meta');
  parts.push(binding.key.length === 1 ? binding.key.toUpperCase() : binding.key);
  return parts.join('+');
}
// Turn a real keydown into the shortcut text it represents — for a
// press-the-keys-you-want capture field. Returns '' for a bare modifier.
export function shortcutFromEvent(event) {
  const raw = String(event?.key ?? '');
  if (!raw || MODIFIER_ALIASES[raw.toLowerCase()]) return '';
  // A literal space would trim away to nothing and read back as "no shortcut",
  // so capturing Space would silently switch the key off instead of binding it.
  const key = raw === ' ' ? 'Space' : raw;
  return formatShortcut({
    key, ctrl: !!event.ctrlKey, alt: !!event.altKey, shift: !!event.shiftKey, meta: !!event.metaKey,
  });
}
export function shortcutHasModifier(binding) {
  return !!(binding && (binding.ctrl || binding.alt || binding.shift || binding.meta));
}
export function eventMatchesShortcut(event, binding) {
  if (!event || !binding?.key) return false;
  const raw = String(event.key ?? '');
  const k = raw === ' ' ? 'Space' : raw;      // same normalisation as capture
  // Single characters compare case-insensitively: Shift+P reports key 'P'.
  const sameKey = k.length === 1 && binding.key.length === 1
    ? k.toLowerCase() === binding.key.toLowerCase()
    : k === binding.key;
  return sameKey
    && !!event.ctrlKey === binding.ctrl
    && !!event.altKey === binding.alt
    && !!event.shiftKey === binding.shift
    && !!event.metaKey === binding.meta;
}

// --- Is this shortcut a good idea? ----------------------------------------------
// NOT a conflict check against other panel bindings: there are none. A panel
// binds exactly one key, this one — the scripting API has no key event and no
// control carries a shortcut. So the useful warnings are about the things that
// actually go wrong: a combo the host eats before the panel ever sees it, and a
// bare key that fires on an ordinary keystroke.
//
// Everything here is advice, never a block. The author knows their rig; the job
// is to make sure a bad choice is a choice rather than a surprise.

// Commonly claimed by a DAW or the OS. Not exhaustive and not certain — a
// plugin window's key handling varies by host — so these warn, never forbid.
const HOST_CLAIMED = new Set([
  'ctrl+s', 'ctrl+z', 'ctrl+y', 'ctrl+w', 'ctrl+t', 'ctrl+n', 'ctrl+q', 'ctrl+r',
  'ctrl+p', 'ctrl+o', 'ctrl+a', 'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+f',
  'meta+s', 'meta+z', 'meta+w', 'meta+q', 'meta+n', 'meta+o', 'meta+a', 'meta+c',
  'meta+v', 'meta+x', 'meta+f', 'meta+h', 'meta+m',
  'ctrl+shift+i', 'ctrl+shift+j', 'ctrl+shift+c', 'alt+F4',
  'F5', 'F11', 'F12',
]);
function claimKey(binding) {
  const parts = [];
  if (binding.ctrl) parts.push('ctrl');
  if (binding.alt) parts.push('alt');
  if (binding.shift) parts.push('shift');
  if (binding.meta) parts.push('meta');
  parts.push(binding.key.length === 1 ? binding.key.toLowerCase() : binding.key);
  return parts.join('+');
}

export function panicShortcutWarnings(shortcut) {
  const binding = parseShortcut(shortcut);
  if (!binding) {
    return [{ level: 'info', message: 'No shortcut. The Panic button, the script command and auto-panic on exit all still work.' }];
  }
  const out = [];
  const bare = !shortcutHasModifier(binding);
  const key = binding.key;

  if (HOST_CLAIMED.has(claimKey(binding))) {
    out.push({ level: 'warn', message: `${formatShortcut(binding)} is commonly claimed by the DAW or the OS — it may never reach the panel.` });
  }
  if (bare && (key === 'Space' || key === 'Spacebar')) {
    out.push({ level: 'warn', message: 'Space is play/stop in nearly every DAW. Almost certainly the wrong choice.' });
  } else if (bare && key.length === 1) {
    out.push({ level: 'warn', message: `A bare "${key.toUpperCase()}" fires on a single keystroke whenever focus is not in a text field. Add a modifier unless that is what you want.` });
  }
  if (bare && key === 'Escape') {
    out.push({ level: 'info', message: 'Escape is also the cancel key for in-place edits, so it will not fire while you are editing a field — which is the correct precedence, but worth knowing.' });
  }
  if (bare) {
    out.push({ level: 'info', message: 'Bare keys never fire while typing. A shortcut with a modifier still works with focus in a text box.' });
  }
  return out;
}

// Should this keypress fire the emergency stop?
//
// The default, Escape, is already the cancel key for four in-place editors (a
// text field, a spinner, a range entry, an LCD zone). Stealing it from those
// would mean every cancelled edit also panics the rig — so a global handler has
// to defer. Those handlers run first and call preventDefault, which is the
// primary signal; the LCD flag covers the one that cancels without preventing.
//
// The editable-target guard applies to BARE keys only. A bare key in a field is
// always the field's (Escape cancels; a bare letter would panic on every
// keystroke) — but Ctrl+Alt+P is nobody's typing, so a modified shortcut still
// works with focus in a text box, which is where you often are when it goes
// wrong.
export function isPanicShortcut(event, { shortcut = DEFAULT_PANIC_SHORTCUT, lcdEditing = false } = {}) {
  const binding = parseShortcut(shortcut);
  if (!binding) return false;                       // '' = switched off
  if (!event || event.repeat === true) return false;
  if (!eventMatchesShortcut(event, binding)) return false;
  if (event.defaultPrevented === true) return false;
  if (lcdEditing) return false;
  if (!shortcutHasModifier(binding) && isTextEntryTarget(event.target)) return false;
  return true;
}

export function panicLabel(control) {
  const text = String(panicConfig(control).label ?? '').trim();
  return text || 'PANIC';
}
// A short line saying what pressing it will do, for the button's second row.
export function panicSummary(control) {
  const cfg = panicConfig(control);
  const scope = panicScope(control) === 'channel' ? `ch ${panicChannel(control)}` : 'all ch';
  const extras = [];
  if (cfg.resetControllers !== false) extras.push('reset CC');
  if (cfg.centreBend !== false) extras.push('centre bend');
  return extras.length ? `${scope} · ${extras.join(' · ')}` : scope;
}

// Geometry: a plain button face inset by `pad`.
export function panicGeometry(width, height, pad = 6) {
  const p = Math.max(0, num(pad, 6));
  return {
    x: p, y: p,
    w: Math.max(1, num(width, 0) - p * 2),
    h: Math.max(1, num(height, 0) - p * 2),
  };
}
export function panicHit(geom, px, py) {
  const x = num(px, -1);
  const y = num(py, -1);
  return x >= geom.x && x <= geom.x + geom.w && y >= geom.y && y <= geom.y + geom.h;
}
