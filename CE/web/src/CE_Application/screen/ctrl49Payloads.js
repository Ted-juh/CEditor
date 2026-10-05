// The HoSTage CTRL49 display payloads, built the way the C++ builds them, so the screen preview
// draws what the keyboard would be sent. Each function names the one it mirrors; when those
// change, these change with them. test/ctrl49Payloads.test.js pins the byte layouts.
//
//   set_labels  [titleLen][title][ 8 x [labelLen][label] ]   ASCII, '?' for anything else, 90 cap
//   set_values  [activeSlot][v0..v7]                          each 0..127

const encoder = new TextEncoder();

// kMaxLabelCharacters in Ctrl49RackDisplay.h: nine strings this long still fit the device's
// 1000-byte frame.
export const MAX_LABEL_CHARACTERS = 90;

// appendString in Ctrl49RackDisplay.cpp / Ctrl49PerformanceDisplay.cpp: the std::string is UTF-8,
// and every byte at or above 0x80 becomes '?' — so "é" is two question marks, as on the device.
function appendString(out, text) {
  const bytes = encoder.encode(String(text ?? ''));
  const length = Math.min(MAX_LABEL_CHARACTERS, bytes.length);
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

/** buildRackStatePayload: the active slot, then each slot's 0..127 position. */
export function rackStatePayload(activeSlot, slots) {
  const out = [clamp127(activeSlot)];
  for (let i = 0; i < 8; i++) out.push(clamp127(slots[i]?.position ?? 0));
  return out;
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

/** soundcheckFirstRow: the selected song kept in view, centred where it can be. */
export function soundcheckFirstRow(songs, selected) {
  if (songs <= SOUNDCHECK_ROWS) return 0;
  return Math.max(0, Math.min(songs - SOUNDCHECK_ROWS, selected - SOUNDCHECK_ROWS / 2));
}

/**
 * buildSoundcheckPayload.
 * @param {{ songs?: { name?: string, checked?: boolean, problems?: number, measured?: boolean,
 *   rmsDb?: number, peakDb?: number }[], selected?: number, current?: number, basis?: string,
 *   problems?: string[], seconds?: number }} view
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
    appendCut(out, song.name, 24);
  }
  appendCut(out, view.basis, 32, true);
  const lines = view.problems ?? [];
  out.push(clampTo(lines.length, 0, 255), Math.min(lines.length, SOUNDCHECK_PROBLEM_LINES));
  for (const line of lines.slice(0, SOUNDCHECK_PROBLEM_LINES)) appendCut(out, line, 44, true);
  const song = count > 0 ? songs[selected] : null;
  const measured = Boolean(song?.measured);
  out.push(soundcheckLevelByte(measured, song?.peakDb), soundcheckLevelByte(measured, song?.rmsDb),
    measured ? clampTo(Math.round(view.seconds ?? 0), 0, 255) : 0);
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
 *   fromKeyboard?: boolean }[], focused?: number, firstKey?: number,
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
      (part.enabled !== false ? 1 : 0) | (part.muted ? 2 : 0) | (part.fromKeyboard !== false ? 4 : 0));
    appendCut(out, part.name, 20);
  }
  const held = (view.held ?? []).slice(0, LAYERS_HELD_NOTES);
  out.push(held.length);
  for (const { note, velocity } of held) out.push(clampTo(note, 0, 127), clampTo(velocity, 0, 127));
  return out;
}
