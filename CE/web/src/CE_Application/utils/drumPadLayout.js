// Drum Pads — the fourth note-playing control: a grid of fixed-note pads, the
// MPC/Push idiom. Unlike the Chord Pad (which computes its notes from a key and
// scale) every pad here is pinned to ONE note, so it maps onto a drum kit, a
// sampler's key map, or any set of trigger notes. Adds the two things a drum
// grid needs that a chord grid doesn't: velocity from where in the pad you hit,
// and CHOKE GROUPS (an open hat silenced by a closed one). Pure resolution +
// geometry, so it's all unit-tested.
import { noteOnBytes, noteOffBytes, bytesToHex, NOTE_SHARP } from './chordPadLayout.js';
import { beatsPerStep, DIVISION_IDS } from './transportLayout.js';

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
// The other two value sets this file switches on. They were spelled inline — `String(origin) ===
// 'topLeft'` in padCell, `!== 'position'` in strikeVelocity — which is fine for a comparison and
// useless to anything that needs to know what the legal values ARE. componentTables.js imports a
// table per enum verb on the rule that the table must be the same object the switch reads, so
// these are now that object and the two functions below read from them.
export const PAD_ORIGINS = ['bottomLeft', 'topLeft'];
export const PAD_ORIGIN_LABELS = { bottomLeft: 'Bottom-left (hardware)', topLeft: 'Top-left (reading order)' };
// Three readings of the same strike, and you pick one. 'position' reads the vertical axis (higher
// up the pad is harder, which is how a mouse is offered "hit it harder"); 'centre' reads distance
// from the middle, which is how a real pad behaves — full in the middle, thinner toward the rim.
export const PAD_VELOCITY_SOURCES = ['fixed', 'position', 'centre'];
export const PAD_VELOCITY_SOURCE_LABELS = {
  fixed: 'Fixed', position: 'From strike height', centre: 'From distance to centre',
};

export function drumOrigin(control) {
  const o = String(drumConfig(control).origin ?? 'bottomLeft');
  return PAD_ORIGINS.includes(o) ? o : 'bottomLeft';
}
export function drumVelocityFrom(control) {
  const s = String(drumConfig(control).velocityFrom ?? 'fixed');
  return PAD_VELOCITY_SOURCES.includes(s) ? s : 'fixed';
}

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
  return resolveDrumPads(drumConfig(control));
}

/** How many pads a config describes, which is the grid and not the length of its override array. */
export function drumPadCount(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  return clampInt(c.rows ?? 4, 1, 8) * clampInt(c.cols ?? 4, 1, 8);
}

/**
 * The same resolution from a bare CONFIG rather than a control.
 *
 * Split out for the script verbs: `ce.components.drumpads.note(kit, 3)` has to answer what pad 3
 * plays, and the stored override for it is usually absent — the honest answer comes from the same
 * fallback chain the renderer draws from, not from the hole in the array.
 */
export function resolveDrumPads(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  const count = drumPadCount(cfg);
  const m = String(cfg.map ?? 'gm');
  const map = PAD_MAPS.includes(m) ? m : 'gm';
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
      roll: ov.roll === true,                  // restrike while held/latched
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
  const o = PAD_ORIGINS.includes(String(origin)) ? String(origin) : 'bottomLeft';
  return { row: o === 'topLeft' ? row : r - 1 - row, col };
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
// 0 at the bottom of the pad, 1 at the top — the axis 'position' velocity reads from.
export function padStrikeY(rect, py) {
  return clamp01(1 - (num(py, 0) - rect.y) / Math.max(1, rect.h));
}
// 0 at the left edge, 1 at the right. Only 'centre' velocity and the corner zones need it, so it
// is optional everywhere it is passed and defaults to the middle.
export function padStrikeX(rect, px) {
  return clamp01((num(px, 0) - rect.x) / Math.max(1, rect.w));
}

/**
 * How hard a strike landed, in the pad's own terms.
 *
 * 'centre' measures the CHEBYSHEV distance to the middle — the larger of the two axis distances —
 * rather than the euclidean one, because a pad is a square and a ring of equal response should
 * follow its edges. With euclidean distance the corners are further from the middle than the edge
 * midpoints are, so a corner strike would come out quieter than a rim strike beside it, which is
 * backwards from how a square pad feels under a hand.
 */
export function strikeVelocity(control, strikeY, strikeX = 0.5) {
  const from = drumVelocityFrom(control);
  if (from === 'position') return clampInt(10 + clamp01(num(strikeY, 0.5)) * 117, 1, 127);
  if (from === 'centre') {
    const dx = Math.abs(clamp01(num(strikeX, 0.5)) - 0.5);
    const dy = Math.abs(clamp01(num(strikeY, 0.5)) - 0.5);
    // 0 in the middle, 1 at any edge.
    const out = Math.min(1, Math.max(dx, dy) * 2);
    return clampInt(drumVelocity(control) * (1 - out * 0.72), 1, 127);
  }
  return drumVelocity(control);
}

// --- Corner zones -------------------------------------------------------------
//
// A strike inside a corner of a pad does something other than a plain hit. This is the hardware
// idiom where the rim and the corners of a pad carry a second vocabulary — a roll under one thumb,
// a flam under the other — and it is what turns sixteen triggers into an instrument you can phrase
// on rather than sixteen buttons.
//
// GRID-LEVEL, not per pad, and that is the point rather than a shortcut. A corner is a gesture your
// hand learns once: "top-right rolls". Per-pad corners would make the same physical movement mean
// different things on adjacent pads, which is the opposite of what a performance surface is for.
//
// SCREEN corners, so `origin` does not rotate them. Origin decides which pad sits where; it does
// not decide which way your hand is pointing.

export const PAD_ZONE_ACTIONS = ['none', 'roll', 'flam', 'choke', 'accent', 'ghost'];
export const PAD_ZONE_ACTION_LABELS = {
  none: 'Plain hit', roll: 'Roll while held', flam: 'Flam (grace note)',
  choke: 'Choke the group', accent: 'Accent (full velocity)', ghost: 'Ghost (quiet)',
};
// In the order they are drawn and listed. The field each one is stored in is `corner` + the name,
// flat rather than nested, so each is an ordinary enum the script verbs and the editor already know
// how to write.
export const PAD_CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
export const PAD_CORNER_LABELS = {
  topLeft: 'Top left', topRight: 'Top right', bottomLeft: 'Bottom left', bottomRight: 'Bottom right',
};
export const cornerField = (corner) => `corner${corner.charAt(0).toUpperCase()}${corner.slice(1)}`;

export function zonesEnabled(cfg) { return (cfg ?? {}).zones === true; }

/** How much of the pad each corner claims, from both edges. Capped below a half so a face remains. */
export function cornerSize(cfg) {
  const n = num((cfg ?? {}).cornerSize, 0.28);
  return n < 0.05 ? 0.05 : n > 0.45 ? 0.45 : n;
}

export function cornerAction(cfg, corner) {
  const a = String((cfg ?? {})[cornerField(String(corner))] ?? 'none');
  return PAD_ZONE_ACTIONS.includes(a) ? a : 'none';
}

/**
 * Which corner a strike landed in, or nothing for the face.
 *
 * `x` and `y` are the pad-relative 0..1 pair padStrikeX/padStrikeY give — so y is 1 at the TOP,
 * which is why the comparison below reads the way it does.
 */
export function cornerAt(cfg, strikeX, strikeY) {
  if (!zonesEnabled(cfg)) return null;
  const size = cornerSize(cfg);
  const x = clamp01(num(strikeX, 0.5));
  const y = clamp01(num(strikeY, 0.5));
  const left = x <= size, right = x >= 1 - size;
  const top = y >= 1 - size, bottom = y <= size;
  if (!(left || right) || !(top || bottom)) return null;
  return `${top ? 'top' : 'bottom'}${left ? 'Left' : 'Right'}`;
}

/** What a strike at this point does: an action name, and the corner it came from (null for a face
 *  hit, which is always 'none'). */
export function strikeAction(cfg, strikeX, strikeY) {
  const corner = cornerAt(cfg, strikeX, strikeY);
  return { corner, action: corner ? cornerAction(cfg, corner) : 'none' };
}

/** How long before the main hit a flam's grace note lands. */
export function flamMs(cfg) {
  return Math.max(1, Math.round(num((cfg ?? {}).flamMs, 22)));
}

/** A ghost strike's velocity, given what the hit would otherwise have been. */
export function ghostVelocity(cfg, velocity) {
  return clampInt(clampInt(velocity, 1, 127) * clamp01(num((cfg ?? {}).ghostVelocity, 0.35)), 1, 127);
}

/** The rectangle one corner occupies inside a pad, for drawing it. */
export function cornerRect(rect, cfg, corner) {
  const size = cornerSize(cfg);
  const w = rect.w * size, h = rect.h * size;
  const name = String(corner);
  return {
    x: name.endsWith('Left') ? rect.x : rect.x + rect.w - w,
    y: name.startsWith('top') ? rect.y : rect.y + rect.h - h,
    w, h,
  };
}

// --- Roll ---------------------------------------------------------------------
// A pad with `roll` set restrikes for as long as it is ON — held under 'momentary',
// latched under 'toggle'. Not a fourth grid MODE: rolling is a property of the
// instrument, and a kick that buzzed every time you leant on it would be unplayable.
// One-shots are excluded because the pad is already gone by its own gate.
export const ROLL_MODES = ['momentary', 'toggle'];

export function drumRollRate(cfg) {
  const r = String((cfg ?? {}).rollRate ?? '1/16');
  return DIVISION_IDS.includes(r) ? r : '1/16';
}

/**
 * How long between strikes of a roll, in milliseconds.
 *
 * Musical when synced and a tempo is on offer: the same beatsPerStep the Arpeggiator and the Turing
 * Machine step by, so a roll set to 1/32 IS a 1/32 against the panel transport and stays one when
 * the tempo moves. `bpm` of null means nothing is running to sync to, and the free-running rate
 * takes over rather than the roll stopping — a panel with no Transport control still has pads.
 */
export function rollIntervalMs(cfg, bpm = null) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const tempo = Number(bpm);
  if (c.rollSync !== false && Number.isFinite(tempo) && tempo > 0) {
    return Math.max(10, Math.round(beatsPerStep(drumRollRate(c)) * (60000 / tempo)));
  }
  // Strikes per second, clamped to something a hand could ask for and a synth could follow.
  const hz = Math.min(50, Math.max(0.5, num(c.rollHz, 8)));
  return Math.max(10, Math.round(1000 / hz));
}

export function rollDelayMs(cfg) {
  return Math.max(0, Math.round(num((cfg ?? {}).rollDelay, 0)));
}

/** The velocity a repeat strikes at, given what the opening strike used. */
export function rollVelocity(cfg, openingVelocity) {
  const scale = clamp01(num((cfg ?? {}).rollVelocity, 0.75));
  return clampInt(clampInt(openingVelocity, 1, 127) * scale, 1, 127);
}

/** Whether this pad, on this grid, in this mode, should roll. */
export function padRolls(cfg, pad, mode) {
  return Boolean(pad?.roll) && ROLL_MODES.includes(String(mode ?? 'momentary'));
}
