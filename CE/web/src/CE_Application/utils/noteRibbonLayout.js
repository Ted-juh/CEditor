// Ribbon Keyboard — the third note-playing control. A strip you slide along to
// play pitch: scale-snapped (only in-key notes, so you can't play a wrong one),
// chromatic (every semitone), or GLIDE — continuous pitch via MIDI pitch bend,
// the Trautonium/ondes-Martenot gesture that a keyboard can't make. The cross
// axis is a second expression dimension (a CC, standing in for the pressure a
// real ribbon senses). Reuses the Chord Pad's scale engine + note bytes. Pure
// mapping and geometry, so it's all unit-tested.
import {
  SCALES, scalePitchClasses, useFlats, noteName, noteOnBytes, noteOffBytes, bytesToHex,
} from './chordPadLayout.js';

export { noteOnBytes, noteOffBytes, bytesToHex };

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
function mod12(n) { return ((Math.round(num(n, 0)) % 12) + 12) % 12; }

export const RIBBON_MODES = ['snap', 'chromatic', 'glide'];
export const RIBBON_MODE_LABELS = {
  snap: 'Scale snap', chromatic: 'Chromatic', glide: 'Glide (pitch bend)',
};

export function ribbonConfig(control) {
  return control?._children?.NoteRibbon ?? {};
}
export function ribbonMode(control) {
  const m = String(ribbonConfig(control).mode ?? 'snap');
  return RIBBON_MODES.includes(m) ? m : 'snap';
}
export function ribbonKey(control) { return mod12(ribbonConfig(control).key ?? 0); }
export function ribbonScaleName(control) {
  const s = String(ribbonConfig(control).scale ?? 'major');
  return SCALES[s] ? s : 'major';
}
export function ribbonHorizontal(control) {
  return String(ribbonConfig(control).orientation ?? 'horizontal') !== 'vertical';
}
export function ribbonChannel(control) { return clampInt(ribbonConfig(control).channel ?? 1, 1, 16); }
export function ribbonVelocity(control) { return clampInt(ribbonConfig(control).velocity ?? 96, 1, 127); }
// Bend range in semitones — must MATCH the synth's own setting, or the glide
// will be the wrong distance. 2 is the near-universal default.
export function ribbonBendRange(control) { return clampInt(ribbonConfig(control).bendRange ?? 2, 1, 48); }

// The pitch span the strip covers, as MIDI note numbers.
export function ribbonRange(control) {
  const cfg = ribbonConfig(control);
  const lo = clampInt(cfg.baseNote ?? 48, 0, 127);
  const hi = Math.min(127, lo + 12 * clampInt(cfg.octaves ?? 2, 1, 5));
  return { lo, hi };
}

// The playable zones drawn along the strip. Scale-snap keeps only in-key notes
// (so every zone is a "right" note); chromatic and glide show all semitones —
// glide uses them as landmarks rather than as separate touch targets.
export function ribbonZones(control) {
  const { lo, hi } = ribbonRange(control);
  const mode = ribbonMode(control);
  const keyPc = ribbonKey(control);
  const scaleName = ribbonScaleName(control);
  const pcs = new Set(scalePitchClasses(keyPc, SCALES[scaleName]));
  const flats = useFlats(keyPc, scaleName);
  const out = [];
  for (let m = lo; m <= hi; m += 1) {
    const pc = mod12(m);
    const inScale = pcs.has(pc);
    if (mode === 'snap' && !inScale) continue;
    out.push({
      index: out.length,
      note: m,
      name: `${noteName(pc, flats)}${Math.floor(m / 12) - 1}`,
      shortName: noteName(pc, flats),
      isRoot: pc === keyPc,
      inScale,
    });
  }
  return out;
}

// --- Geometry -----------------------------------------------------------------
export function ribbonGeometry(width, height, pad = 8, headerH = 22, orientation = 'horizontal') {
  const p = Math.max(0, num(pad, 8));
  const head = Math.max(0, num(headerH, 0));
  const horizontal = String(orientation) !== 'vertical';
  const y0 = p + head;
  return {
    x0: p,
    y0,
    w: Math.max(1, num(width, 0) - p * 2),
    h: Math.max(1, num(height, 0) - y0 - p),
    horizontal,
  };
}
// Zone i's rectangle. Vertical strips run low-at-the-bottom, like a keyboard
// stood on end.
export function zoneRect(geom, i, count) {
  const n = Math.max(1, Math.round(num(count, 1)));
  const idx = Math.max(0, Math.round(num(i, 0)));
  if (geom.horizontal) {
    const cw = geom.w / n;
    return { x: geom.x0 + idx * cw, y: geom.y0, w: cw, h: geom.h };
  }
  const ch = geom.h / n;
  return { x: geom.x0, y: geom.y0 + geom.h - (idx + 1) * ch, w: geom.w, h: ch };
}
export function inRibbon(geom, px, py) {
  const x = num(px, -1);
  const y = num(py, -1);
  return x >= geom.x0 && x <= geom.x0 + geom.w && y >= geom.y0 && y <= geom.y0 + geom.h;
}
// 0 at the low-pitch end, 1 at the high end.
export function positionAlong(geom, px, py) {
  if (geom.horizontal) return clamp01((num(px, 0) - geom.x0) / Math.max(1, geom.w));
  return clamp01(1 - (num(py, 0) - geom.y0) / Math.max(1, geom.h));
}
// 0 at the far edge of the short axis, 1 at the near edge — the expression axis.
export function positionAcross(geom, px, py) {
  if (geom.horizontal) return clamp01(1 - (num(py, 0) - geom.y0) / Math.max(1, geom.h));
  return clamp01((num(px, 0) - geom.x0) / Math.max(1, geom.w));
}
export function zoneIndexAt(geom, px, py, count) {
  if (!inRibbon(geom, px, py)) return -1;
  const n = Math.max(1, Math.round(num(count, 1)));
  return Math.min(n - 1, Math.floor(positionAlong(geom, px, py) * n));
}

// --- Pitch mapping ------------------------------------------------------------
// Discrete play: which zone (and so which note) a position along the strip hits.
export function snapZone(zones, t) {
  if (!zones.length) return null;
  const i = Math.min(zones.length - 1, Math.floor(clamp01(t) * zones.length));
  return zones[i];
}
// Continuous play: the fractional MIDI pitch at a position.
export function pitchAt(control, t) {
  const { lo, hi } = ribbonRange(control);
  return lo + clamp01(t) * (hi - lo);
}
// 14-bit pitch-bend value for an offset in semitones (8192 = centred).
export function bendValue(semitones, bendRange) {
  const range = Math.max(0.01, num(bendRange, 2));
  const off = Math.max(-range, Math.min(range, num(semitones, 0)));
  const v = 8192 + Math.round((off / range) * 8191);
  return v < 0 ? 0 : v > 16383 ? 16383 : v;
}
// One glide step: the sounding root note, the bend to reach the exact pitch,
// and whether the root had to move. Pitch bend only reaches ±bendRange, so once
// the finger travels past that window the note is RE-TRIGGERED on a new root —
// the same compromise every hardware ribbon makes.
export function glideStep(control, t, currentRoot) {
  const { lo, hi } = ribbonRange(control);
  const range = ribbonBendRange(control);
  const pitch = pitchAt(control, t);
  const has = Number.isFinite(Number(currentRoot));
  let root = has ? Math.round(Number(currentRoot)) : Math.round(pitch);
  if (!has || Math.abs(pitch - root) > range) root = Math.round(pitch);
  root = Math.min(hi, Math.max(lo, root));
  return {
    pitch,
    root,
    bend: bendValue(pitch - root, range),
    retrigger: !has || root !== Math.round(Number(currentRoot)),
  };
}

// --- MIDI bytes ---------------------------------------------------------------
export function bendBytes(channel, value14) {
  const ch = clampInt(channel, 1, 16) - 1;
  const v = clampInt(value14, 0, 16383);
  return [0xE0 | ch, v & 0x7F, (v >> 7) & 0x7F];
}
export function ccBytes(channel, cc, value) {
  const ch = clampInt(channel, 1, 16) - 1;
  return [0xB0 | ch, clampInt(cc, 0, 127), clampInt(value, 0, 127)];
}

// Velocity for a touch: fixed, or taken from where on the cross axis you landed
// (near edge = harder), which is the closest a mouse/trackpad gets to dynamics.
export function touchVelocity(control, across) {
  if (String(ribbonConfig(control).velocityFrom ?? 'fixed') !== 'position') return ribbonVelocity(control);
  return clampInt(8 + clamp01(num(across, 0.5)) * 119, 1, 127);
}
// The expression CC value for a cross-axis position (null when the axis is off).
export function modValue(control, across) {
  const cfg = ribbonConfig(control);
  if (String(cfg.modAxis ?? 'none') !== 'cc') return null;
  return clampInt(clamp01(num(across, 0)) * 127, 0, 127);
}
export function modCc(control) { return clampInt(ribbonConfig(control).modCc ?? 1, 0, 127); }

// A label for the current touch: the note, plus how far it's bent in glide.
export function touchLabel(control, touch) {
  if (!touch) return '';
  const flats = useFlats(ribbonKey(control), ribbonScaleName(control));
  const m = clampInt(touch.note, 0, 127);
  const base = `${noteName(mod12(m), flats)}${Math.floor(m / 12) - 1}`;
  if (ribbonMode(control) !== 'glide' || !Number.isFinite(Number(touch.pitch))) return base;
  const cents = Math.round((Number(touch.pitch) - m) * 100);
  return cents === 0 ? base : `${base} ${cents > 0 ? '+' : ''}${cents}¢`;
}
