// The HoSTage CTRL49 display payloads, built the way the C++ builds them, so the screen preview
// draws what the keyboard would be sent. Each function names the one it mirrors; when those
// change, these change with them. test/ctrl49Payloads.test.js pins the byte layouts.
//
//   set_labels  [titleLen][title][ 8 x [labelLen][label] ]   ASCII, '?' for anything else, 90 cap
//   set_values  [activeSlot][v0..v7]                          each 0..127
//               a control page then adds [0][0][4][page][pages] 8 x [len][value text]

const encoder = new TextEncoder();

// kMaxLabelCharacters in Ctrl49RackDisplay.h: nine strings this long still fit the device's
// 1000-byte frame.
export const MAX_LABEL_CHARACTERS = 90;

// appendString in Ctrl49RackDisplay.cpp / Ctrl49PerformanceDisplay.cpp: the std::string is UTF-8,
// and every byte at or above 0x80 becomes '?' — so "é" is two question marks, as on the device.
function appendString(out, text, cap = MAX_LABEL_CHARACTERS) {
  const bytes = encoder.encode(String(text ?? ''));
  const length = Math.min(cap, bytes.length);
  out.push(length);
  for (let i = 0; i < length; i++) out.push(bytes[i] < 0x80 ? bytes[i] : 0x3f);
}

const clamp127 = (value) => Math.max(0, Math.min(127, Math.trunc(Number(value) || 0)));

/** @typedef {{ label?: string, position?: number, assigned?: boolean, resolved?: boolean }} SlotView */

/** buildRackLabelPayload. An unassigned slot has no label; an unresolved one is marked '!'. */
export function rackLabelPayload(title, slots) {
  const out = [];
  appendString(out, title);
  for (let i = 0; i < 8; i++) {
    const slot = slots[i] ?? {};
    appendString(out, !slot.assigned ? '' : slot.resolved ? slot.label : `!${slot.label ?? ''}`);
  }
  return out;
}

// kMaxValueCharacters in Ctrl49RackDisplay.h: the most of a value's text a knob shows.
export const MAX_VALUE_CHARACTERS = 12;

/** buildRackStatePayload: the active slot, then each slot's 0..127 position. With a page
    ({ number, count }, a control page), the overload that adds what the page shows besides the
    knobs: [9] 0 [10] 0 [11] 4, [12] the page's number, [13] how many, then each assigned slot's
    valueText as [len][ASCII], at most MAX_VALUE_CHARACTERS. */
export function rackStatePayload(activeSlot, slots, page) {
  const out = [clamp127(activeSlot)];
  for (let i = 0; i < 8; i++) out.push(clamp127(slots[i]?.position ?? 0));
  if (page) {
    out.push(0, 0, 4, clamp127(page.number), clamp127(page.count));
    for (let i = 0; i < 8; i++) appendString(out, slots[i]?.assigned ? slots[i]?.valueText : '', MAX_VALUE_CHARACTERS);
  }
  return out;
}

/** The extension of a control page's set_values read back: { page, pages, texts } (texts: the
    eight values as the plug-in writes them), or null for the plain nine bytes. */
export function readRackStateExtension(values) {
  if (!Array.isArray(values) || values.length <= 13) return null;
  const texts = [];
  let at = 14;
  for (let i = 0; i < 8; i++) {
    const length = values[at] ?? 0;
    texts.push(String.fromCharCode(...values.slice(at + 1, at + 1 + length)));
    at += 1 + length;
  }
  return { page: values[12], pages: values[13], texts };
}

/** buildPerformanceTitle: "> 3.2 120 EXT" — ASCII marks for play/stop, whole-number tempo. */
export function performanceTitle({ playing = false, bar = 1, beat = 1, tempo = 120, externalClock = false, clockLost = false }) {
  let title = `${playing ? '>' : '#'} ${bar}.${beat} ${Math.round(tempo)}`;
  if (clockLost) title += ' NO CLK';
  else if (externalClock) title += ' EXT';
  return title;
}

/** @typedef {{ name?: string, active?: boolean, pending?: boolean, phase?: number }} ClipView */

/** buildPerformanceLabelPayload: a queued clip reads ">name", a running one "*name". */
export function performanceLabelPayload(transport, clips) {
  const out = [];
  appendString(out, performanceTitle(transport));
  for (let i = 0; i < 8; i++) {
    const clip = clips[i] ?? {};
    if (!clip.name) { appendString(out, ''); continue; }
    appendString(out, clip.pending ? `>${clip.name}` : clip.active ? `*${clip.name}` : clip.name);
  }
  return out;
}

/** buildPerformanceStatePayload: the active clip, then each clip's phase as a knob. With a
    transport, three more bytes the page reads only on the performance page: [9] kind (1),
    [10] the beat in the bar (0 when stopped), [11] beats per bar. */
export function performanceStatePayload(activeClip, clips, transport) {
  const out = [clamp127(activeClip)];
  for (let i = 0; i < 8; i++) {
    const phase = Math.max(0, Math.min(1, Number(clips[i]?.phase) || 0));
    out.push(clamp127(Math.trunc(phase * 127)));
  }
  if (transport) {
    out.push(1, transport.playing ? clamp127(transport.beat ?? 1) : 0, clamp127(transport.beatsPerBar ?? 4));
  }
  return out;
}

/** browseSlotViews: a row of results as eight slots — the cursor row a full knob, the rest none.
    Names are cut to the surface's column count; a result that cannot load comes back unresolved. */
export function browseSlotViews(rows, cursorRowInWindow, columns = 12) {
  const width = columns > 0 ? columns : 12;
  return Array.from({ length: 8 }, (_, i) => {
    const row = rows[i];
    if (!row) return { label: '', position: 0, assigned: false, resolved: false };
    return {
      label: fitToColumns(row.name, width),
      assigned: true,
      resolved: row.available !== false,
      position: i === cursorRowInWindow ? 127 : 0,
    };
  });
}

// kMaxBrowseLineCharacters in Ctrl49RackDisplay.h: the most of the current sound the strip shows.
export const MAX_BROWSE_LINE_CHARACTERS = 48;

/** buildBrowseStatePayload: the browse page's set_values. The nine bytes as rackStatePayload
    gives them (the cursor row's ring full), then [9] 7 (the browser) [10] 0 [11] 4 [12] 0 [13] 0,
    eight empty value texts (so the rings carry no numbers), and the current sound for the strip. */
export function browseStatePayload(cursorRow, slots, current) {
  const out = rackStatePayload(cursorRow, slots);
  out.push(7, 0, 4, 0, 0);
  for (let i = 0; i < 8; i++) out.push(0);
  appendString(out, current ?? '', MAX_BROWSE_LINE_CHARACTERS);
  return out;
}

/** browseLineForDisplay: "Wool Pad - STAGE KEYS"; the name alone when there is no detail. */
export function browseLineForDisplay(row) {
  const name = String(row?.name ?? '');
  const detail = String(row?.detail ?? '');
  return (detail ? `${name} \u00B7 ${detail}` : name).replaceAll(' \u00B7 ', ' - ');
}

// surface::fitToColumns: printable ASCII per UTF-8 byte ('?' otherwise), and a name too long for
// the columns ends in a '.' rather than being clipped silently.
function fitToColumns(name, columns) {
  const ascii = [...encoder.encode(String(name ?? ''))]
    .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '?')).join('');
  if (ascii.length <= columns) return ascii;
  if (columns === 1) return '.';
  return `${ascii.slice(0, columns - 1)}.`;
}

// --- the stage pages (Ctrl49StagePages.h) -----------------------------------------------------------
//
//   set_check   the setlist checked: every song's state and level, the selected song in full
//   set_layers  every part's key and velocity zone, and the notes sounding

// appendString in Ctrl49StagePages.cpp: cut at `limit` UTF-8 bytes ("..." in the last three when
// `ellipsis`), then every byte outside printable ASCII becomes '?'.
function appendCut(out, text, limit, ellipsis = false) {
  let bytes = [...encoder.encode(String(text ?? ''))];
  if (bytes.length > limit) {
    bytes = ellipsis && limit > 3 ? [...bytes.slice(0, limit - 3), 0x2e, 0x2e, 0x2e] : bytes.slice(0, limit);
  }
  out.push(bytes.length);
  for (const b of bytes) out.push(b >= 0x20 && b < 0x80 ? b : 0x3f);
}

const clampTo = (value, low, high) => Math.max(low, Math.min(high, Math.trunc(Number(value) || 0)));

export const SOUNDCHECK_ROWS = 10;
export const SOUNDCHECK_PROBLEM_LINES = 4;
export const LAYERS_ROWS = 8;
export const LAYERS_HELD_NOTES = 16;

/** soundcheckLevelByte: 0 when not measured, else 1..61 for -60..0 dBFS. */
export function soundcheckLevelByte(measured, db) {
  if (!measured || !Number.isFinite(db)) return 0;
  return clampTo(1 + Math.round(Math.max(-60, Math.min(0, db)) + 60), 1, 61);
}

/** soundcheckLoadByte: 0 never recalled, 1-254 tenths of a second (0.0-25.3 s), 255 gave up. */
export function soundcheckLoadByte(seconds, timedOut) {
  if (!(seconds >= 0) || !Number.isFinite(seconds)) return 0;
  if (timedOut) return 255;
  return clampTo(1 + Math.round(seconds * 10), 1, 254);
}

/** soundcheckFirstRow: the selected song kept in view, centred where it can be. */
export function soundcheckFirstRow(songs, selected) {
  if (songs <= SOUNDCHECK_ROWS) return 0;
  return Math.max(0, Math.min(songs - SOUNDCHECK_ROWS, selected - SOUNDCHECK_ROWS / 2));
}

/**
 * buildSoundcheckPayload.
 * @param {{ songs?: { name?: string, checked?: boolean, problems?: number, measured?: boolean,
 *   rmsDb?: number, peakDb?: number, loadSeconds?: number, loadTimedOut?: boolean, preloaded?: boolean }[],
 *   selected?: number, current?: number, basis?: string, problems?: string[], seconds?: number,
 *   preloadOff?: boolean }} view
 */
export function soundcheckPayload(view) {
  const songs = view.songs ?? [];
  const count = songs.length;
  const selected = count === 0 ? 0 : clampTo(view.selected ?? 0, 0, count - 1);
  const first = soundcheckFirstRow(count, selected);
  const rows = Math.min(SOUNDCHECK_ROWS, count - first);
  let ready = 0, problems = 0, unchecked = 0;
  for (const song of songs) {
    if (!song.checked) unchecked++;
    else if ((song.problems ?? 0) > 0) problems++;
    else ready++;
  }
  const current = view.current ?? -1;
  const out = [clampTo(count, 0, 255), clampTo(first, 0, 255), clampTo(rows, 0, 255), clampTo(selected, 0, 255),
    current >= 0 && current < count ? clampTo(current + 1, 0, 255) : 0,
    clampTo(ready, 0, 255), clampTo(problems, 0, 255), clampTo(unchecked, 0, 255)];
  for (let i = first; i < first + rows; i++) {
    const song = songs[i];
    out.push(!song.checked ? 0 : (song.problems ?? 0) > 0 ? 2 : 1);
    out.push(soundcheckLevelByte(song.measured, song.rmsDb));
    out.push(clampTo(song.problems ?? 0, 0, 255));
    out.push(soundcheckLoadByte(song.loadSeconds ?? -1, song.loadTimedOut === true));
    appendCut(out, song.name, 24);
  }
  appendCut(out, view.basis, 32, true);
  const lines = view.problems ?? [];
  out.push(clampTo(lines.length, 0, 255), Math.min(lines.length, SOUNDCHECK_PROBLEM_LINES));
  for (const line of lines.slice(0, SOUNDCHECK_PROBLEM_LINES)) appendCut(out, line, 44, true);
  const song = count > 0 ? songs[selected] : null;
  const measured = Boolean(song?.measured);
  out.push(soundcheckLevelByte(measured, song?.peakDb), soundcheckLevelByte(measured, song?.rmsDb),
    measured ? clampTo(Math.round(view.seconds ?? 0), 0, 255) : 0,
    (song?.preloaded ? 1 : 0) | (view.preloadOff ? 2 : 0));
  return out;
}

/** layersFirstRow: the focused part kept in view. */
export function layersFirstRow(parts, focused) {
  if (parts <= LAYERS_ROWS) return 0;
  return Math.max(0, Math.min(parts - LAYERS_ROWS, focused - LAYERS_ROWS / 2 + 1));
}

/**
 * buildLayersPayload.
 * @param {{ parts?: { name?: string, keyLow?: number, keyHigh?: number, velocityLow?: number,
 *   velocityHigh?: number, transpose?: number, enabled?: boolean, muted?: boolean,
 *   fromKeyboard?: boolean, group?: number, source?: number, allocation?: number, layerLow?: number,
 *   layerHigh?: number, layerFade?: number }[], focused?: number, firstKey?: number,
 *   held?: { note: number, velocity: number }[] }} view
 */
export function layersPayload(view) {
  const parts = view.parts ?? [];
  const count = parts.length;
  const focused = count === 0 ? 0 : clampTo(view.focused ?? 0, 0, count - 1);
  const first = layersFirstRow(count, focused);
  const rows = Math.min(LAYERS_ROWS, count - first);
  const out = [clampTo(count, 0, 255), clampTo(first, 0, 255), clampTo(rows, 0, 255), clampTo(focused, 0, 255),
    clampTo(view.firstKey ?? 36, 0, 127 - 48)];
  for (let i = first; i < first + rows; i++) {
    const part = parts[i];
    out.push(clampTo(part.keyLow ?? 0, 0, 127), clampTo(part.keyHigh ?? 127, 0, 127),
      clampTo(part.velocityLow ?? 1, 0, 127), clampTo(part.velocityHigh ?? 127, 0, 127),
      clampTo((part.transpose ?? 0) + 64, 0, 127),
      (part.enabled !== false ? 1 : 0) | (part.muted ? 2 : 0) | (part.fromKeyboard !== false ? 4 : 0),
      clampTo(part.group ?? 0, 0, 255), clampTo(part.source ?? 0, 0, 4) + 16 * clampTo(part.allocation ?? 0, 0, 2),
      clampTo(part.layerLow ?? 0, 0, 127), clampTo(part.layerHigh ?? 127, 0, 127), clampTo(part.layerFade ?? 0, 0, 64));
    appendCut(out, part.name, 20);
  }
  const held = (view.held ?? []).slice(0, LAYERS_HELD_NOTES);
  out.push(held.length);
  for (const { note, velocity } of held) out.push(clampTo(note, 0, 127), clampTo(velocity, 0, 127));
  return out;
}

/**
 * buildCuePayload: the setlist's cue screen. Two-byte numbers are low byte first, stopping at 65535.
 * @param {{ songs?: number, current?: number, picked?: number, loading?: boolean, song?: string, tempo?: number,
 *   songSeconds?: number, setSeconds?: number, plannedSeconds?: number, notes?: string[], section?: string,
 *   sectionBar?: number, sectionBars?: number, nextSection?: string, nextSong?: string, nextReady?: number,
 *   pickedSong?: string }} view
 */
export function cuePayload(view) {
  const songs = view.songs ?? 0;
  const current = view.current ?? -1;
  const picked = view.picked ?? -1;
  const inSet = (index) => (index >= 0 && index < songs ? index + 1 : 0);
  const two = (out, value) => { const v = clampTo(value, 0, 65535); out.push(v & 0xff, v >> 8); };
  const out = [clampTo(songs, 0, 255), inSet(current), picked === current ? 0 : inSet(picked), view.loading ? 1 : 0];
  two(out, view.songSeconds ?? 0);
  two(out, view.setSeconds ?? 0);
  two(out, view.plannedSeconds ?? 0);
  two(out, Math.round((view.tempo ?? 0) * 10));
  const bars = view.section ? clampTo(view.sectionBars ?? 0, 0, 255) : 0;
  out.push(bars === 0 ? 0 : clampTo(view.sectionBar ?? 1, 1, bars), bars,
    (view.nextReady ?? -1) < 0 ? 255 : clampTo(view.nextReady, 0, 100));
  appendCut(out, view.song, 24);
  appendCut(out, view.section, 16);
  appendCut(out, view.nextSection, 16);
  appendCut(out, view.nextSong, 24);
  appendCut(out, picked === current ? '' : view.pickedSong, 24);
  const lines = (view.notes ?? []).slice(0, 3);
  out.push(lines.length);
  for (const line of lines) appendCut(out, line, 44, true);
  return out;
}

// --- LIVE (Ctrl49StagePages.h) ------------------------------------------------------------------

export const LIVE_STEPS = 16;
export const LIVE_ZONES = 6;
export const LIVE_NOTES = 16;
export const LIVE_NAME_CHARS = 16;
export const ARP_MODE_NAMES = ['up', 'down', 'upDown', 'downUp', 'order', 'random', 'chord', 'pattern'];

/** liveNextRate: E7 on LIVE, steps per beat through 1 2 3 4 6 8 12 16. */
export function liveNextRate(stepsPerBeat, detents) {
  const rates = [1, 2, 3, 4, 6, 8, 12, 16];
  let at = 0;
  while (at < rates.length - 1 && rates[at] < stepsPerBeat) at++;
  let d = detents;
  if (rates[at] !== stepsPerBeat && d < 0 && at > 0) { at--; d++; }
  else if (rates[at] !== stepsPerBeat && d > 0) d--;
  return rates[Math.max(0, Math.min(rates.length - 1, at + d))];
}

/** liveNextMode: E8 on LIVE, -1 off, else the arp mode 0-7. */
export const liveNextMode = (mode, detents) => Math.max(-1, Math.min(7, mode + detents));

/**
 * buildLivePayload: the keys as played, the zones over them, and the focused part's arp lane.
 * @param {{ part?: string, arpOn?: boolean, mode?: number, stepsPerBeat?: number, gate?: number, lane?: boolean,
 *   steps?: { velocity?: number, octave?: number, ratchet?: number, chance?: number, tie?: boolean }[],
 *   cursor?: number, playing?: number, tempo?: number, zones?: { name?: string, keyLow?: number, keyHigh?: number,
 *   playable?: boolean }[], focused?: number, firstKey?: number, held?: number[], arpNotes?: number[] }} view
 */
export function livePayload(view) {
  const steps = (view.steps ?? []).slice(0, LIVE_STEPS);
  const zones = (view.zones ?? []).slice(0, LIVE_ZONES);
  const tempo = clampTo(Math.round((view.tempo ?? 120) * 10), 0, 65535);
  const playing = view.playing ?? -1;
  const focused = view.focused ?? -1;
  const out = [(view.arpOn ? 1 : 0) | (view.lane ? 2 : 0), clampTo(view.mode ?? 0, 0, 7), clampTo(view.stepsPerBeat ?? 4, 1, 16),
    clampTo(view.gate ?? 50, 0, 100), steps.length, clampTo(view.cursor ?? 0, 0, Math.max(0, steps.length - 1)),
    playing >= 0 && playing < steps.length ? playing + 1 : 0, tempo & 0xff, tempo >> 8,
    clampTo(view.firstKey ?? 36, 0, 127 - 48), zones.length, focused >= 0 && focused < zones.length ? focused : 255];
  for (const step of steps)
    out.push(clampTo(step.velocity ?? 100, 0, 127), clampTo((step.octave ?? 0) + 2, 0, 4), clampTo(step.ratchet ?? 1, 1, 4),
      clampTo(step.chance ?? 100, 0, 100), step.tie ? 1 : 0);
  for (const zone of zones) {
    out.push(clampTo(zone.keyLow ?? 0, 0, 127), clampTo(zone.keyHigh ?? 127, 0, 127), zone.playable === false ? 0 : 1);
    appendCut(out, zone.name, LIVE_NAME_CHARS);
  }
  for (const notes of [view.held ?? [], view.arpNotes ?? []]) {
    const list = notes.slice(0, LIVE_NOTES);
    out.push(list.length, ...list.map((n) => clampTo(n, 0, 127)));
  }
  appendCut(out, view.part, LIVE_NAME_CHARS);
  return out;
}

// --- METERS (Ctrl49StagePages.h) ----------------------------------------------------------------

export const METERS_STRIPS = 5;
export const METERS_NAME_CHARS = 12;

/** metersLevelByte: 0 silence (below -57 dB, or a fader at zero), else 1-127 for -57..+6 dB in
    half decibels; 0 dB is 115, anything over it a clip. `linear` 1 = 0 dBFS. */
export function metersLevelByte(linear) {
  const value = Number(linear);
  if (!(value > 0)) return 0;
  const db = Number.isFinite(value) ? 20 * Math.log10(value) : 6;
  if (db < -57.25) return 0;
  return clampTo(1 + Math.round((Math.min(db, 6) + 57) * 2), 1, 127);
}

/** metersFirstPart: the first part on a strip, kept so there are five where the rack has them. */
export function metersFirstPart(parts, first) {
  return clampTo(first, 0, Math.max(0, parts - METERS_STRIPS));
}

/** metersNudgeVolume: a fader turned on METERS, half a decibel a detent, from off to +6 dB (2.0). */
export function metersNudgeVolume(volume, detents) {
  if (!detents) return volume;
  let db = volume > 0 ? 20 * Math.log10(volume) : -57.5;
  db = Math.min(db + 0.5 * detents, 20 * Math.log10(2));
  if (db < -57) return 0;
  return Math.max(0, Math.min(2, 10 ** (db / 20)));
}

/**
 * buildMetersPayload: every part's level and fader, five on strips, and the master's.
 * @param {{ parts?: { name?: string, left?: number, right?: number, volume?: number, muted?: boolean,
 *   enabled?: boolean }[], first?: number, touched?: number, masterLeft?: number, masterRight?: number,
 *   masterVolume?: number }} view
 */
export function metersPayload(view) {
  const parts = view.parts ?? [];
  const first = metersFirstPart(parts.length, view.first ?? 0);
  const strips = Math.min(METERS_STRIPS, parts.length - first);
  const touched = view.touched ?? -1;
  const out = [clampTo(parts.length, 0, 255), clampTo(first, 0, 255), strips,
    touched >= 0 && touched <= METERS_STRIPS ? touched : 255];
  for (const part of parts.slice(first, first + strips)) {
    out.push(metersLevelByte(part.left ?? 0), metersLevelByte(part.right ?? 0), metersLevelByte(part.volume ?? 1),
      (part.muted ? 1 : 0) | (part.enabled === false ? 2 : 0));
    appendCut(out, part.name, METERS_NAME_CHARS);
  }
  out.push(metersLevelByte(view.masterLeft ?? 0), metersLevelByte(view.masterRight ?? 0),
    metersLevelByte(view.masterVolume ?? 1));
  return out;
}

export const CHANGES_ROWS = 8;

/**
 * buildChangesPayload: the focused part's sound against a save of it. State 0 problem, 1 unchanged, 2 changed.
 * @param {{ state?: number, rows?: { name?: string, savedText?: string, nowText?: string, saved?: number,
 *   now?: number }[], selected?: number, total?: number, listen?: number, back?: number, saves?: number,
 *   putBack?: number, sound?: string, against?: string, when?: string, problemText?: string }} view
 */
export function changesPayload(view) {
  const rows = view.rows ?? [];
  const count = rows.length;
  const selected = count === 0 ? 0 : clampTo(view.selected ?? 0, 0, count - 1);
  const first = count <= CHANGES_ROWS ? 0 : clampTo(selected - CHANGES_ROWS / 2 + 1, 0, count - CHANGES_ROWS);
  const shown = Math.min(CHANGES_ROWS, count - first);
  const total = clampTo(view.total ?? 0, 0, 65535);
  const out = [clampTo(view.state ?? 0, 0, 2), clampTo(count, 0, 255), clampTo(first, 0, 255), clampTo(shown, 0, 255),
    clampTo(selected, 0, 255), total & 0xff, total >> 8, clampTo(view.listen ?? 100, 0, 100),
    clampTo(view.back ?? 0, 0, 255), clampTo(view.saves ?? 0, 0, 255), clampTo(view.putBack ?? 0, 0, 255)];
  appendCut(out, view.sound, 24);
  appendCut(out, view.against, 24);
  appendCut(out, view.when, 16);
  appendCut(out, view.problemText, 44, true);
  for (const row of rows.slice(first, first + shown)) {
    out.push(clampTo(row.saved ?? 0, 0, 100), clampTo(row.now ?? 0, 0, 100));
    appendCut(out, row.name, 20);
    appendCut(out, row.savedText, 10);
    appendCut(out, row.nowText, 10);
  }
  return out;
}

export const DISCOVER_ROWS = 8;
export const DISCOVER_REGULARS = 48;

/** discoverFirstRow: the window pages by eight, so pad N is always row N of what is shown. */
export function discoverFirstRow(sounds, selected) {
  if (sounds <= DISCOVER_ROWS) return 0;
  return Math.max(0, Math.min(sounds - 1, Math.floor(selected / DISCOVER_ROWS) * DISCOVER_ROWS));
}

/**
 * buildDiscoverPayload. State 0 is "not enough to go on", 1 suggestions, 2 nothing new.
 * @param {{ state?: number, sounds?: { name?: string, instrument?: string, at?: { x: number, y: number },
 *   percent?: number, kept?: boolean }[], selected?: number, neverOpened?: number, regularsCounted?: number,
 *   kind?: string, centre?: { x: number, y: number }, regulars?: { x: number, y: number }[],
 *   likeName?: string, likeLoads?: number }} view
 */
export function discoverPayload(view) {
  const sounds = view.sounds ?? [];
  const count = sounds.length;
  const selected = count === 0 ? 0 : clampTo(view.selected ?? 0, 0, count - 1);
  const first = discoverFirstRow(count, selected);
  const rows = Math.min(DISCOVER_ROWS, count - first);
  const point = (out, p) => out.push(clampTo(p?.x ?? 0, 0, 100), clampTo(p?.y ?? 0, 0, 100));
  const never = clampTo(view.neverOpened ?? 0, 0, 65535);
  const out = [clampTo(view.state ?? 0, 0, 2), clampTo(count, 0, 255), clampTo(first, 0, 255),
    clampTo(rows, 0, 255), clampTo(selected, 0, 255), never & 0xff, never >> 8,
    clampTo(view.regularsCounted ?? 0, 0, 255)];
  appendCut(out, view.kind, 12);
  point(out, view.centre);
  for (let i = first; i < first + rows; i++) {
    const sound = sounds[i];
    point(out, sound.at);
    out.push(clampTo(sound.percent ?? 0, 0, 100), sound.kept ? 1 : 0);
    appendCut(out, sound.name, 24);
    appendCut(out, sound.instrument, 16);
  }
  appendCut(out, view.likeName, 24);
  out.push(clampTo(view.likeLoads ?? 0, 0, 255));
  const regulars = (view.regulars ?? []).slice(0, DISCOVER_REGULARS);
  out.push(regulars.length);
  for (const p of regulars) point(out, p);
  return out;
}

// --- reading them back ----------------------------------------------------------------------------
// The app's screen card labels its encoders from the bytes it draws, as it does for a knob page,
// so the strip beside the screen can never disagree with the screen. Short or malformed bytes
// read as an empty page rather than throwing.

function reader(bytes) {
  let at = 0;
  const byte = () => (at < bytes.length ? bytes[at++] : 0);
  const text = () => {
    const length = byte();
    const out = String.fromCharCode(...bytes.slice(at, at + length));
    at += length;
    return out;
  };
  return { byte, text };
}

/** The set_layers payload as a view: the parts drawn (from `first`), the focused one, held notes. */
export function readLayersPayload(bytes = []) {
  const r = reader(bytes);
  const count = r.byte(), first = r.byte(), rows = r.byte(), focused = r.byte(), firstKey = r.byte();
  const parts = [];
  for (let i = 0; i < rows; i++) {
    const [keyLow, keyHigh, velocityLow, velocityHigh, transpose, flags] = [r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte()];
    const [group, how, layerLow, layerHigh, layerFade] = [r.byte(), r.byte(), r.byte(), r.byte(), r.byte()];
    parts.push({ index: first + i, name: r.text(), keyLow, keyHigh, velocityLow, velocityHigh, transpose: transpose - 64,
                 enabled: (flags & 1) !== 0, muted: (flags & 2) !== 0, fromKeyboard: (flags & 4) !== 0,
                 group, source: how % 16, allocation: Math.floor(how / 16), layerLow, layerHigh, layerFade });
  }
  const held = [];
  for (let i = 0, n = r.byte(); i < n; i++) held.push({ note: r.byte(), velocity: r.byte() });
  return { count, first, focused, firstKey, parts, held };
}

/** The set_check payload as a view: the songs listed (from `first`) and the selected one in full. */
export function readSoundcheckPayload(bytes = []) {
  const r = reader(bytes);
  const [count, first, rows, selected, current, ready, problems, unchecked] =
    [r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte()];
  const songs = [];
  for (let i = 0; i < rows; i++) {
    const [status, level, issues, load] = [r.byte(), r.byte(), r.byte(), r.byte()];
    songs.push({ index: first + i, status: ['unchecked', 'ready', 'problems'][status] ?? 'unchecked', level, problems: issues,
                 loadSeconds: load === 0 ? -1 : load === 255 ? null : (load - 1) / 10, loadTimedOut: load === 255, name: r.text() });
  }
  const basis = r.text();
  const total = r.byte();
  const lines = [];
  for (let i = 0, n = r.byte(); i < n; i++) lines.push(r.text());
  const [peak, rms, seconds, flags] = [r.byte(), r.byte(), r.byte(), r.byte()];
  return { count, first, selected, current: current - 1, ready, problems, unchecked, songs, basis,
           problemCount: total, problemLines: lines, peak, rms, seconds,
           preloaded: (flags & 1) !== 0, preloadOff: (flags & 2) !== 0 };
}

/** The set_discover payload as a view: the sounds listed (from `first`), the map, the selected one. */
export function readDiscoverPayload(bytes = []) {
  const r = reader(bytes);
  const [state, count, first, rows, selected, low, high, regularsCounted] =
    [r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte()];
  const kind = r.text();
  const centre = { x: r.byte(), y: r.byte() };
  const sounds = [];
  for (let i = 0; i < rows; i++) {
    const at = { x: r.byte(), y: r.byte() };
    const [percent, kept] = [r.byte(), r.byte()];
    sounds.push({ index: first + i, at, percent, kept: kept !== 0, name: r.text(), instrument: r.text() });
  }
  const likeName = r.text();
  const likeLoads = r.byte();
  const regulars = [];
  for (let i = 0, n = r.byte(); i < n; i++) regulars.push({ x: r.byte(), y: r.byte() });
  return { state: ['notEnough', 'suggestions', 'nothingNew'][state] ?? 'notEnough', count, first, selected,
           neverOpened: low + 256 * high, regularsCounted, kind, centre, sounds, likeName, likeLoads, regulars };
}

/** The set_cue payload as a view. */
export function readCuePayload(bytes = []) {
  const r = reader(bytes);
  const two = () => r.byte() + 256 * r.byte();
  const [songs, current, picked, loading] = [r.byte(), r.byte(), r.byte(), r.byte()];
  const [songSeconds, setSeconds, plannedSeconds, tempo] = [two(), two(), two(), two() / 10];
  const [sectionBar, sectionBars, ready] = [r.byte(), r.byte(), r.byte()];
  const [song, section, nextSection, nextSong, pickedSong] = [r.text(), r.text(), r.text(), r.text(), r.text()];
  const notes = [];
  for (let i = 0, n = r.byte(); i < n; i++) notes.push(r.text());
  return { songs, current: current - 1, picked: picked - 1, loading: loading !== 0, songSeconds, setSeconds,
           plannedSeconds, tempo, sectionBar, sectionBars, nextReady: ready === 255 ? -1 : ready,
           song, section, nextSection, nextSong, pickedSong, notes };
}

/** The set_live payload as a view: the lane, the zones, the notes and the part. */
export function readLivePayload(bytes = []) {
  const r = reader(bytes);
  const [flags, mode, stepsPerBeat, gate, count, cursor, playing, low, high, firstKey, zoneCount, focused] =
    Array.from({ length: 12 }, () => r.byte());
  const steps = [];
  for (let i = 0; i < count; i++) {
    const [velocity, octave, ratchet, chance, tie] = [r.byte(), r.byte(), r.byte(), r.byte(), r.byte()];
    steps.push({ velocity, octave: octave - 2, ratchet, chance, tie: tie === 1 });
  }
  const zones = [];
  for (let i = 0; i < zoneCount; i++) {
    const [keyLow, keyHigh, zoneFlags] = [r.byte(), r.byte(), r.byte()];
    zones.push({ keyLow, keyHigh, playable: (zoneFlags & 1) !== 0, name: r.text() });
  }
  const notes = () => Array.from({ length: r.byte() }, () => r.byte());
  const held = notes();
  const arpNotes = notes();
  return { arpOn: (flags & 1) !== 0, lane: (flags & 2) !== 0, mode, stepsPerBeat, gate, steps, cursor,
           playing: playing - 1, tempo: (low + 256 * high) / 10, firstKey, zones, focused: focused === 255 ? -1 : focused,
           held, arpNotes, part: r.text() };
}

/** The set_meters payload as a view: the strips (from `first`) with their bytes, and the master. */
export function readMetersPayload(bytes = []) {
  const r = reader(bytes);
  const [count, first, stripCount, touched] = [r.byte(), r.byte(), r.byte(), r.byte()];
  const strips = [];
  for (let i = 0; i < stripCount; i++) {
    const [left, right, fader, flags] = [r.byte(), r.byte(), r.byte(), r.byte()];
    strips.push({ index: first + i, left, right, fader, muted: (flags & 1) !== 0, off: (flags & 2) !== 0, name: r.text() });
  }
  const [left, right, fader] = [r.byte(), r.byte(), r.byte()];
  return { count, first, touched: touched === 255 ? -1 : touched, strips, master: { left, right, fader } };
}

/** The set_changes payload as a view: the changes shown (from `first`) and the save they are against. */
export function readChangesPayload(bytes = []) {
  const r = reader(bytes);
  const [state, count, first, rows, selected, low, high, listen, back, saves, putBack] =
    [r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte(), r.byte()];
  const [sound, against, when, problemText] = [r.text(), r.text(), r.text(), r.text()];
  const changes = [];
  for (let i = 0; i < rows; i++) {
    const [saved, now] = [r.byte(), r.byte()];
    changes.push({ index: first + i, saved, now, name: r.text(), savedText: r.text(), nowText: r.text() });
  }
  return { state: ['problem', 'unchanged', 'changed'][state] ?? 'problem', count, first, selected,
           total: low + 256 * high, listen, back, saves, putBack, sound, against, when, problemText, rows: changes };
}
