// The HoSTage CTRL49 display payloads, built the way the C++ builds them, so the screen preview
// draws what the keyboard would be sent. Each function names the one it mirrors; when those
// change, these change with them. test/ctrl49Payloads.test.js pins the byte layouts.
//
//   set_labels  [titleLen][title][ 8 x [labelLen][label] ]   ASCII, '?' for anything else, 255 cap
//   set_values  [activeSlot][v0..v7]                          each 0..127

const encoder = new TextEncoder();

// appendString in Ctrl49RackDisplay.cpp / Ctrl49PerformanceDisplay.cpp: the std::string is UTF-8,
// and every byte at or above 0x80 becomes '?' — so "é" is two question marks, as on the device.
function appendString(out, text) {
  const bytes = encoder.encode(String(text ?? ''));
  const length = Math.min(255, bytes.length);
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

/** buildPerformanceStatePayload: the active clip, then each clip's phase as a knob. */
export function performanceStatePayload(activeClip, clips) {
  const out = [clamp127(activeClip)];
  for (let i = 0; i < 8; i++) {
    const phase = Math.max(0, Math.min(1, Number(clips[i]?.phase) || 0));
    out.push(clamp127(Math.trunc(phase * 127)));
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
