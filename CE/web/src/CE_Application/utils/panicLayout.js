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

// The config the EMERGENCY paths use — the Esc key and auto-panic on exit.
// Deliberately not any placed Panic button's config: someone may have set one
// up as a narrow "drums off, ch 10" button, and an emergency that only silences
// a third of the rig is worse than useless. Emergencies are always maximal.
export const EMERGENCY_PANIC = Object.freeze({
  _children: { Panic: { scope: 'all', resetControllers: true, centreBend: true } },
});

// Should an Escape keypress fire the emergency stop?
//
// Escape is already the cancel key for four different in-place editors (a text
// field, a spinner, a range entry, an LCD zone). Stealing it from those would
// mean every cancelled edit also panics the rig — so a global handler has to
// defer. Those handlers run first and call preventDefault, which is the primary
// signal; the editable-target check covers the one that cancels without
// preventing, and typing in any field at all.
export function isEmergencyStopKey(event, { lcdEditing = false } = {}) {
  if (!event || event.key !== 'Escape') return false;
  if (event.repeat === true) return false;          // holding Esc fires once
  if (event.defaultPrevented === true) return false;
  if (lcdEditing) return false;
  const tag = String(event.target?.tagName ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (event.target?.isContentEditable === true) return false;
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
