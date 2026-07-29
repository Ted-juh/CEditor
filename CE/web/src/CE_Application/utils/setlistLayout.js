// Setlist / Scene Stepper — an ordered list of panel states you advance with a
// footswitch.
//
// Unglamorous, and the thing people actually need on stage. Everything it needs
// already existed: snapshots (the Timbre Space and the Preset Constellation both
// store them), program change is a MIDI message, and a footswitch is a CC the
// input path already reads. This is the ordering, the stepping and the recall.
//
// Pure: a list and an index in, messages and a patch out. The MIDI and the
// writes live in the preview surface.

import { UNCHANGED } from './scriptPatchOutcome.js';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }

export const MAX_SCENES = 128;

export function setlistConfig(control) {
  return control?._children?.Setlist ?? {};
}
export function setlistScenes(control) {
  const raw = setlistConfig(control).scenes;
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_SCENES).map((s, i) => ({
    id: String(s?.id ?? `scene_${i + 1}`),
    name: String(s?.name ?? `Scene ${i + 1}`),
    note: String(s?.note ?? ''),                 // a cue line for the player
    // The captured panel state: { "Control.Section.prop": value }. Only what
    // was captured — see captureScene for why "everything" is wrong.
    values: s?.values && typeof s.values === 'object' && !Array.isArray(s.values) ? s.values : {},
    program: s?.program === null || s?.program === undefined ? null : clampInt(s.program, 0, 127),
    bankMsb: s?.bankMsb === null || s?.bankMsb === undefined ? null : clampInt(s.bankMsb, 0, 127),
    bankLsb: s?.bankLsb === null || s?.bankLsb === undefined ? null : clampInt(s.bankLsb, 0, 127),
    bpm: s?.bpm === null || s?.bpm === undefined ? null : Math.max(20, Math.min(300, num(s.bpm, 120))),
    enabled: s?.enabled !== false,
    colour: String(s?.colour ?? ''),
    // Extra MIDI the scene sends after its program change. CCs as
    // { cc, value, channel? }, sysex as a byte array — because "the patch is
    // right but the reverb is still on" is a real thing a program change alone
    // cannot fix.
    ccs: normalizeSceneCcs(s?.ccs),
    sysex: normalizeSysex(s?.sysex),
  }));
}
export function normalizeSceneCcs(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 32)
    .filter((c) => c && Number.isFinite(Number(c.cc)))
    .map((c) => ({
      cc: clampInt(c.cc, 0, 127),
      value: clampInt(c.value ?? 0, 0, 127),
      // null means "the setlist's channel" — one place to change it later.
      channel: c.channel === null || c.channel === undefined ? null : clampInt(c.channel, 1, 16),
    }));
}
export function normalizeSysex(raw) {
  const bytes = (Array.isArray(raw) ? raw : []).map((b) => clampInt(b, 0, 255)).slice(0, 256);
  if (!bytes.length) return [];
  // Framed here rather than trusting the input: an unterminated sysex leaves
  // the receiving device waiting for the rest of a message that never comes.
  const body = bytes[0] === 0xF0 ? bytes.slice(1) : bytes;
  const end = body[body.length - 1] === 0xF7 ? body.slice(0, -1) : body;
  return [0xF0, ...end.filter((b) => b < 0x80), 0xF7];
}
export function setlistCount(control) { return setlistScenes(control).length; }
export function setlistIndex(control) {
  const n = setlistCount(control);
  if (!n) return -1;
  return clampInt(setlistConfig(control).index ?? 0, 0, n - 1);
}
export function sceneAt(control, index) {
  const scenes = setlistScenes(control);
  const i = Math.round(num(index, -1));
  return i >= 0 && i < scenes.length ? scenes[i] : null;
}
export function currentScene(control) { return sceneAt(control, setlistIndex(control)); }
export function setlistChannel(control) { return clampInt(setlistConfig(control).channel ?? 1, 1, 16); }
export function setlistWraps(control) { return setlistConfig(control).wrap === true; }

/**
 * Step the index. Disabled scenes are SKIPPED rather than landing on them —
 * "skip this one tonight" is the whole reason to have a disable, and stepping
 * onto a skipped scene would make the button appear to do nothing.
 *
 * Wrap is OFF by default. A setlist that jumps back to song one when you press
 * next at the end of the night is a bad surprise in front of an audience; the
 * end of the list simply stays put.
 */
export function stepIndex(scenes, index, delta, wrap = false) {
  const list = Array.isArray(scenes) ? scenes : [];
  const n = list.length;
  if (!n) return -1;
  const d = Math.sign(Math.round(num(delta, 0))) || 0;
  let i = clampInt(index, 0, n - 1);
  if (d === 0) return i;
  for (let hop = 0; hop < n; hop += 1) {
    i += d;
    if (i < 0 || i >= n) {
      if (!wrap) return clampInt(index, 0, n - 1);   // stay where you are
      i = ((i % n) + n) % n;
    }
    if (list[i]?.enabled !== false) return i;
  }
  return clampInt(index, 0, n - 1);                  // everything is disabled
}
export function gotoIndex(scenes, index) {
  const list = Array.isArray(scenes) ? scenes : [];
  if (!list.length) return -1;
  return clampInt(index, 0, list.length - 1);
}

// --- The footswitch --------------------------------------------------------------
// The one rule that has to be right: advance on the RISING edge only.
//
// A momentary footswitch sends 127 when you press it and 0 when you let go. Both
// are CC messages on the same number. Acting on each one steps the setlist twice
// per press — which on stage looks like the pedal skipping a song, and is the
// single most common way a scene stepper is broken.
export const FOOT_ACTIONS = ['next', 'prev', 'goto'];
export const FOOT_ACTION_LABELS = { next: 'Next scene', prev: 'Previous scene', goto: 'Go to a scene' };

export function footswitchCc(control) { return clampInt(setlistConfig(control).footCc ?? 64, 0, 127); }
// A second pedal for "previous". Null means there isn't one — a single pedal is
// still the common case, and defaulting this to a CC number would silently make
// some other controller step the setlist backwards.
export function footswitchBackCc(control) {
  const raw = setlistConfig(control).footBackCc;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? clampInt(n, 0, 127) : null;
}
export function footswitchChannel(control) { return clampInt(setlistConfig(control).footChannel ?? 0, 0, 16); }
export function footswitchThreshold(control) { return clampInt(setlistConfig(control).footThreshold ?? 64, 1, 127); }

/**
 * Should this CC event step the list? `wasDown` is whether the pedal was already
 * held; the caller keeps that one boolean.
 * Returns { step, down } — `down` is the new held state, always.
 */
export function footswitchEdge(control, event, wasDown = false) {
  const down = clampInt(event?.value, 0, 127) >= footswitchThreshold(control);
  const chan = footswitchChannel(control);
  const matches = String(event?.kind) === 'cc'
    && clampInt(event?.cc, 0, 127) === footswitchCc(control)
    && (chan === 0 || clampInt(event?.channel, 1, 16) === chan);
  if (!matches) return { step: false, down: wasDown };
  return { step: down && !wasDown, down };
}
// The back pedal, on the same rising-edge rule. Its held state is tracked
// separately: two pedals sharing one boolean would have each release cancel the
// other's press.
export function footswitchBackEdge(control, event, wasDown = false) {
  const cc = footswitchBackCc(control);
  if (cc === null) return { step: false, down: wasDown };
  const down = clampInt(event?.value, 0, 127) >= footswitchThreshold(control);
  const chan = footswitchChannel(control);
  const matches = String(event?.kind) === 'cc'
    && clampInt(event?.cc, 0, 127) === cc
    && (chan === 0 || clampInt(event?.channel, 1, 16) === chan);
  if (!matches) return { step: false, down: wasDown };
  return { step: down && !wasDown, down };
}

// --- Recall ----------------------------------------------------------------------
// The MIDI a scene sends. Bank select comes BEFORE the program change, because
// that is what bank select means — it selects the bank the next program change
// lands in. Sending it after would change the patch and then change the bank,
// which does nothing until the following scene.
export function sceneMessages(scene, channel) {
  const ch = clampInt(channel, 1, 16);
  const out = [];
  if (!scene) return out;
  if (scene.bankMsb !== null && scene.bankMsb !== undefined) {
    out.push({ kind: 'cc', bytes: [0xB0 | (ch - 1), 0, scene.bankMsb] });
  }
  if (scene.bankLsb !== null && scene.bankLsb !== undefined) {
    out.push({ kind: 'cc', bytes: [0xB0 | (ch - 1), 32, scene.bankLsb] });
  }
  if (scene.program !== null && scene.program !== undefined) {
    out.push({ kind: 'program', bytes: [0xC0 | (ch - 1), scene.program] });
  }
  // Extra CCs come AFTER the program change: a patch change on most synths
  // resets its controllers, so a CC sent first would be wiped by the patch it
  // was meant to modify.
  for (const c of scene.ccs ?? []) {
    const cch = c.channel === null || c.channel === undefined ? ch : clampInt(c.channel, 1, 16);
    out.push({ kind: 'cc', bytes: [0xB0 | (cch - 1), c.cc, c.value] });
  }
  if ((scene.sysex ?? []).length) out.push({ kind: 'sysex', bytes: scene.sysex.slice() });
  return out;
}

/**
 * What a recall does, in order. Returned as a plan rather than performed, so the
 * order is testable and the caller stays dumb.
 *
 * MIDI first, then the panel values. A program change swaps the patch on the
 * synth; the stored values belong to that patch, so sending them first would
 * write them into the OLD patch and then have the program change wipe them.
 */
export function recallPlan(control, index) {
  const scene = sceneAt(control, index);
  if (!scene) return { scene: null, messages: [], values: {}, bpm: null };
  const cfg = setlistConfig(control);
  return {
    scene,
    messages: cfg.sendProgram === false ? [] : sceneMessages(scene, setlistChannel(control)),
    values: cfg.recallValues === false ? {} : scene.values,
    // The transport tempo, if the scene carries one. Songs have tempos; that is
    // most of what a setlist is for.
    bpm: cfg.recallTempo === false ? null : scene.bpm,
  };
}

// --- Crossfade -----------------------------------------------------------------------
// Values are written instantly by default, because a scene change should be
// complete. A fade is for the case a hard jump is worse than a slow one — a
// filter sweeping between songs rather than snapping.
//
// Pure: a start map, an end map and a 0..1 position in, the values to write out.
// Only NUMBERS are interpolated; anything else (an enum, a string, a boolean)
// switches at the halfway point, because there is no meaningful value between
// "sine" and "square" and pretending otherwise would write nonsense.
export function crossfadeMs(control) {
  return Math.max(0, Math.min(10000, num(setlistConfig(control).crossfadeMs, 0)));
}
export function blendValues(from, to, position) {
  const p = Math.max(0, Math.min(1, num(position, 1)));
  const out = {};
  for (const [path, target] of Object.entries(to ?? {})) {
    const start = (from ?? {})[path];
    if (typeof target === 'number' && typeof start === 'number') {
      out[path] = start + (target - start) * p;
    } else {
      out[path] = p >= 0.5 ? target : (start === undefined ? target : start);
    }
  }
  return out;
}

/**
 * Capture the current panel into a scene.
 *
 * `paths` is an explicit list. Capturing "everything" is wrong in a specific
 * way: the setlist's own index is a panel value, so a scene would store the
 * index it was captured at, and recalling it would move the setlist — usually
 * to itself, occasionally to somewhere else, and always confusingly.
 */
export function captureScene(scene, paths, readValue) {
  const values = {};
  for (const path of Array.isArray(paths) ? paths : []) {
    const v = typeof readValue === 'function' ? readValue(path) : undefined;
    if (v !== undefined) values[path] = v;
  }
  return { ...(scene ?? {}), values };
}
// How many values a recall would actually change. "12 values change" on the
// button is worth more than a list nobody reads.
export function sceneChangeCount(scene, readValue) {
  const values = scene?.values ?? {};
  let n = 0;
  for (const [path, v] of Object.entries(values)) {
    const cur = typeof readValue === 'function' ? readValue(path) : undefined;
    if (JSON.stringify(cur) !== JSON.stringify(v)) n += 1;
  }
  return n;
}
// The paths one scene has and another doesn't — the usual cause of "that knob
// stayed where the last song left it".
export function missingPaths(scene, referencePaths) {
  const have = new Set(Object.keys(scene?.values ?? {}));
  return (Array.isArray(referencePaths) ? referencePaths : []).filter((p) => !have.has(p));
}

// --- Geometry -----------------------------------------------------------------
// A list. A setlist that isn't drawn as a list is a puzzle.
export function setlistGeometry(width, height, count, pad = 8, headerH = 20, rowH = 18) {
  const p = Math.max(0, num(pad, 8));
  const hdr = Math.max(0, num(headerH, 0));
  const h = Math.max(1, num(height, 0) - p * 2 - hdr);
  const rh = Math.max(10, num(rowH, 18));
  return {
    x0: p, y0: p + hdr, w: Math.max(1, num(width, 0) - p * 2), h,
    rowH: rh,
    visible: Math.max(1, Math.floor(h / rh)),
    count: Math.max(0, Math.round(num(count, 0))),
  };
}
// Which rows to draw. The current scene is kept in view and, where there is
// room, kept off the edge — a setlist that always shows the current song at the
// bottom gives you no idea what is coming.
export function visibleRange(geom, index) {
  const n = geom.count;
  const v = Math.min(geom.visible, n);
  if (v >= n) return { first: 0, last: Math.max(0, n - 1) };
  const lead = Math.floor(v / 3);
  let first = clampInt(index - lead, 0, Math.max(0, n - v));
  return { first, last: first + v - 1 };
}
export function rowRect(geom, row, first) {
  return { x: geom.x0, y: geom.y0 + (row - first) * geom.rowH, w: geom.w, h: geom.rowH - 1 };
}
export function rowAtPoint(geom, index, px, py) {
  const { first, last } = visibleRange(geom, index);
  for (let r = first; r <= last; r += 1) {
    const rect = rowRect(geom, r, first);
    if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) return r;
  }
  return null;
}

// --- Driving it from a script -------------------------------------------------------------
// The most obviously needed of the three: a setlist you can only advance with a
// pedal or a mouse can't be driven by a panel button, and "Next" as a button is
// exactly what a setlist wants.
//
// Note what this reducer does NOT do: it does not recall. It moves the index,
// and the recall is driven by the index CHANGING — so the pedal, a click, a
// script and a hand edit in the inspector all take the same path and cannot
// diverge.
export const SETLIST_SCRIPT_ACTIONS = ['next', 'prev', 'goto', 'enable', 'wrap', 'crossfade'];

export function setlistScriptPatch(cfg, action, args = {}) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const a = args && typeof args === 'object' ? args : {};
  const scenes = setlistScenes({ _children: { Setlist: c } });
  if (!scenes.length && String(action) !== 'wrap') return {};
  const index = clampInt(c.index ?? 0, 0, Math.max(0, scenes.length - 1));
  const wrap = c.wrap === true;

  switch (String(action)) {
    case 'next': {
      const next = stepIndex(scenes, index, 1, wrap);
      return next === index ? {} : { index: next };
    }
    case 'prev': {
      const next = stepIndex(scenes, index, -1, wrap);
      return next === index ? {} : { index: next };
    }
    case 'goto': {
      // Accepts a 1-based number as the list shows it, or a scene name/id —
      // a name survives someone reordering the set, a number doesn't.
      let target = -1;
      if (a.scene !== undefined && a.scene !== null && !Number.isFinite(Number(a.scene))) {
        const key = String(a.scene);
        target = scenes.findIndex((s) => s.name === key || s.id === key);
      } else {
        const n = Number(a.scene ?? a.index);
        if (!Number.isFinite(n)) return {};
        target = Math.round(n) - 1;                 // 1-based in, 0-based out
      }
      if (target < 0 || target >= scenes.length) return {};
      return target === index ? {} : { index: target };
    }
    case 'enable': {
      // Skip a song tonight without editing the set.
      const key = String(a.scene ?? '');
      const at = Number.isFinite(Number(a.scene))
        ? Math.round(Number(a.scene)) - 1
        : scenes.findIndex((s) => s.name === key || s.id === key);
      if (at < 0 || at >= scenes.length) return {};
      const want = a.enabled !== false;
      // Already that way: accepted, nothing to write. NOT the same as a refusal, and the script
      // verb's return value now depends on the difference.
      if ((scenes[at].enabled !== false) === want) return UNCHANGED;
      return { scenes: scenes.map((s, i) => (i === at ? { ...s, enabled: want } : s)) };
    }
    case 'crossfade': {
      const ms = Number(a.ms);
      return Number.isFinite(ms) ? { crossfadeMs: Math.max(0, Math.min(10000, ms)) } : {};
    }
    case 'wrap': {
      const want = a.wrap === undefined ? !wrap : a.wrap !== false;
      return want === wrap ? UNCHANGED : { wrap: want };
    }
    default:
      return {};
  }
}
