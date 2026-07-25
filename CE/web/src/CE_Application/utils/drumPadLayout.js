// Drum Pads — the fourth note-playing control: a grid of fixed-note pads, the
// MPC/Push idiom. Unlike the Chord Pad (which computes its notes from a key and
// scale) every pad here is pinned to ONE note, so it maps onto a drum kit, a
// sampler's key map, or any set of trigger notes. Adds the two things a drum
// grid needs that a chord grid doesn't: velocity from where in the pad you hit,
// and CHOKE GROUPS (an open hat silenced by a closed one). Pure resolution +
// geometry, so it's all unit-tested.
import { noteOnBytes, noteOffBytes, bytesToHex, NOTE_SHARP } from './chordPadLayout.js';

export { noteOnBytes, noteOffBytes, bytesToHex };

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

// The General MIDI percussion map (channel 10), with short labels that fit on a
// pad. Anything outside 35-81 falls back to its note name.
export const GM_DRUMS = {
  35: ['Acoustic Bass Drum', 'Kick 2'], 36: ['Bass Drum 1', 'Kick'],
  37: ['Side Stick', 'Stick'], 38: ['Acoustic Snare', 'Snare'],
  39: ['Hand Clap', 'Clap'], 40: ['Electric Snare', 'Snare 2'],
  41: ['Low Floor Tom', 'Tom F-Lo'], 42: ['Closed Hi-Hat', 'CH Hat'],
  43: ['High Floor Tom', 'Tom F-Hi'], 44: ['Pedal Hi-Hat', 'Pd Hat'],
  45: ['Low Tom', 'Tom Lo'], 46: ['Open Hi-Hat', 'OP Hat'],
  47: ['Low-Mid Tom', 'Tom Mid'], 48: ['Hi-Mid Tom', 'Tom Hi-M'],
  49: ['Crash Cymbal 1', 'Crash'], 50: ['High Tom', 'Tom Hi'],
  51: ['Ride Cymbal 1', 'Ride'], 52: ['Chinese Cymbal', 'China'],
  53: ['Ride Bell', 'Bell'], 54: ['Tambourine', 'Tamb'],
  55: ['Splash Cymbal', 'Splash'], 56: ['Cowbell', 'Cowbell'],
  57: ['Crash Cymbal 2', 'Crash 2'], 58: ['Vibraslap', 'Vibra'],
  59: ['Ride Cymbal 2', 'Ride 2'], 60: ['Hi Bongo', 'Bongo Hi'],
  61: ['Low Bongo', 'Bongo Lo'], 62: ['Mute Hi Conga', 'Conga Mt'],
  63: ['Open Hi Conga', 'Conga Hi'], 64: ['Low Conga', 'Conga Lo'],
  65: ['High Timbale', 'Timb Hi'], 66: ['Low Timbale', 'Timb Lo'],
  67: ['High Agogo', 'Agogo Hi'], 68: ['Low Agogo', 'Agogo Lo'],
  69: ['Cabasa', 'Cabasa'], 70: ['Maracas', 'Maracas'],
  71: ['Short Whistle', 'Whis Sh'], 72: ['Long Whistle', 'Whis Lg'],
  73: ['Short Guiro', 'Guiro S'], 74: ['Long Guiro', 'Guiro L'],
  75: ['Claves', 'Claves'], 76: ['Hi Wood Block', 'Wood Hi'],
  77: ['Low Wood Block', 'Wood Lo'], 78: ['Mute Cuica', 'Cuica M'],
  79: ['Open Cuica', 'Cuica O'], 80: ['Mute Triangle', 'Tri Mute'],
  81: ['Open Triangle', 'Tri Open'],
};
// The GM hi-hats choke each other — closed, pedal and open are one instrument.
export const GM_CHOKE = { 42: 1, 44: 1, 46: 1 };

export const PAD_MAPS = ['gm', 'chromatic', 'custom'];
export const PAD_MAP_LABELS = { gm: 'GM drum kit', chromatic: 'Chromatic', custom: 'Custom' };
export const PAD_MODES = ['momentary', 'oneShot', 'toggle'];
export const PAD_MODE_LABELS = {
  momentary: 'Momentary (hold)', oneShot: 'One-shot', toggle: 'Toggle',
};

export function drumConfig(control) {
  return control?._children?.DrumPads ?? {};
}
export function drumRows(control) { return clampInt(drumConfig(control).rows ?? 4, 1, 8); }
export function drumCols(control) { return clampInt(drumConfig(control).cols ?? 4, 1, 8); }
export function drumCount(control) { return drumRows(control) * drumCols(control); }
export function drumChannel(control) { return clampInt(drumConfig(control).channel ?? 10, 1, 16); }
export function drumVelocity(control) { return clampInt(drumConfig(control).velocity ?? 100, 1, 127); }
export function drumMode(control) {
  const m = String(drumConfig(control).mode ?? 'momentary');
  return PAD_MODES.includes(m) ? m : 'momentary';
}
export function drumMap(control) {
  const m = String(drumConfig(control).map ?? 'gm');
  return PAD_MAPS.includes(m) ? m : 'gm';
}
// One-shot gate in ms — long enough for a sampler to latch the trigger.
export function drumGateMs(control) { return clampInt(drumConfig(control).gateMs ?? 60, 5, 2000); }

// A readable name for a note: its GM percussion name when there is one.
export function drumNoteLabel(note, short = true) {
  const m = clampInt(note, 0, 127);
  const gm = GM_DRUMS[m];
  if (gm) return short ? gm[1] : gm[0];
  return `${NOTE_SHARP[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

// The resolved pads, in PAD ORDER (index 0 is pad 1, wherever that sits on
// screen). Custom entries from the model override the generated map per pad, so
// you can rename or re-point one pad without hand-writing all sixteen.
export function drumPads(control) {
  const cfg = drumConfig(control);
  const count = drumCount(control);
  const map = drumMap(control);
  const base = clampInt(cfg.baseNote ?? 36, 0, 127);
  const overrides = Array.isArray(cfg.pads) ? cfg.pads : [];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const ov = overrides[i] ?? {};
    const note = clampInt(ov.note ?? (map === 'custom' ? base + i : base + i), 0, 127);
    const label = String(ov.label ?? '').trim()
      || (map === 'chromatic' ? drumNoteLabel(note, true) : (GM_DRUMS[note] ? GM_DRUMS[note][1] : drumNoteLabel(note, true)));
    const choke = clampInt(ov.choke ?? (map === 'gm' ? (GM_CHOKE[note] ?? 0) : 0), 0, 8);
    out.push({
      index: i,
      id: `p${i}`,
      note,
      label,
      fullName: drumNoteLabel(note, false),
      choke,                                   // 0 = no group
      colour: String(ov.colour ?? '').trim(),  // '' = use the section accent
    });
  }
  return out;
}
// Which OTHER pads a hit on `pad` silences (same non-zero choke group).
export function chokedBy(pads, pad) {
  if (!pad || !pad.choke) return [];
  return pads.filter((p) => p.choke === pad.choke && p.index !== pad.index);
}

// --- Geometry -----------------------------------------------------------------
export function drumGeometry(width, height, rows, cols, pad = 8, headerH = 22, gap = 5) {
  const p = Math.max(0, num(pad, 8));
  const y0 = p + Math.max(0, num(headerH, 0));
  const r = clampInt(rows, 1, 8);
  const c = clampInt(cols, 1, 8);
  const g = Math.max(0, num(gap, 5));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - y0 - p);
  return {
    x0: p, y0, w, h, rows: r, cols: c, gap: g,
    cellW: Math.max(2, (w - g * (c - 1)) / c),
    cellH: Math.max(2, (h - g * (r - 1)) / r),
  };
}
// Pad index → screen cell. Hardware pad grids number from the BOTTOM-left (pad 1
// under your left thumb); 'topLeft' is the reading order some editors prefer.
export function padCell(index, rows, cols, origin = 'bottomLeft') {
  const r = clampInt(rows, 1, 8);
  const c = clampInt(cols, 1, 8);
  const i = Math.max(0, Math.round(num(index, 0)));
  const row = Math.floor(i / c);
  const col = i % c;
  return { row: String(origin) === 'topLeft' ? row : r - 1 - row, col };
}
export function padRect(geom, index, origin = 'bottomLeft') {
  const { row, col } = padCell(index, geom.rows, geom.cols, origin);
  return {
    x: geom.x0 + col * (geom.cellW + geom.gap),
    y: geom.y0 + row * (geom.cellH + geom.gap),
    w: geom.cellW,
    h: geom.cellH,
  };
}
// Which pad index is under a point (-1 for the gaps and the header).
export function padHit(geom, px, py, origin = 'bottomLeft') {
  const x = num(px, -1);
  const y = num(py, -1);
  for (let i = 0; i < geom.rows * geom.cols; i += 1) {
    const r = padRect(geom, i, origin);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}
// 0 at the bottom of the pad, 1 at the top — the axis velocity reads from.
export function padStrikeY(rect, py) {
  return clamp01(1 - (num(py, 0) - rect.y) / Math.max(1, rect.h));
}
// Velocity for a hit: fixed, or softer at the bottom of the pad and harder at
// the top, which is how hardware pads present "hit it harder" to a mouse.
export function strikeVelocity(control, strikeY) {
  if (String(drumConfig(control).velocityFrom ?? 'fixed') !== 'position') return drumVelocity(control);
  return clampInt(10 + clamp01(num(strikeY, 0.5)) * 117, 1, 127);
}
