/**
 * Reading the MIDI monitor's traffic.
 *
 * The events themselves come from C++, which keeps a 500-deep ring buffer and stamps each one with
 * a timestamp, a direction, the device it belongs to, a message type, a human-readable meaning, the
 * raw hex, and a status. All of that was already being sent to the UI; the Device tab showed four
 * of them and only four of the seven fields, so you could see that MIDI happened but not when, to
 * which synth, or whether it worked.
 *
 * Everything here is pure so the filtering and the formatting can be tested without a browser and
 * without a synth — which matters, because the one thing nobody can test here is real traffic.
 */

/** Directions the monitor distinguishes. C++ writes these strings. */
export const MONITOR_DIRECTIONS = ['out', 'in'];

const text = (value) => (typeof value === 'string' ? value : '');

/**
 * Just the time, from an ISO8601 stamp.
 *
 * A monitor is read by scanning down the left edge for a gap or a burst, so the date is noise and
 * the milliseconds are the whole point — MIDI events arrive milliseconds apart, and a list stamped
 * to the second says nothing about ordering or rate.
 */
export function monitorTime(event) {
  const stamp = text(event?.timestamp);
  const match = /T(\d{2}:\d{2}:\d{2})(\.\d{1,3})?/.exec(stamp);
  if (!match) return '';
  return `${match[1]}${(match[2] ?? '.000').padEnd(4, '0')}`;
}

/** One line of everything an event knows, for copying out. */
export function monitorEventLine(event) {
  return [
    monitorTime(event),
    text(event?.direction),
    text(event?.deviceRole),
    text(event?.messageType),
    text(event?.semantic),
    text(event?.hex),
    text(event?.status),
  ].filter(Boolean).join('  ');
}

/** Did this event fail? C++ puts the failure in `status`; anything else is a normal send. */
export function isMonitorFailure(event) {
  const status = text(event?.status).toLowerCase();
  return status.includes('error') || status.includes('fail') || status.includes('not sent');
}

/**
 * The devices and message types present in the buffer, so filters can offer what is actually there
 * rather than a fixed list that is mostly empty.
 */
export function monitorFacets(events) {
  const devices = new Set();
  const types = new Set();
  for (const event of events ?? []) {
    const device = text(event?.deviceRole);
    const type = text(event?.messageType);
    if (device) devices.add(device);
    if (type) types.add(type);
  }
  return { devices: [...devices].sort(), types: [...types].sort() };
}

/**
 * Filter and order the buffer for display.
 *
 * Newest first, because the interesting event is the one that just happened. `search` matches any
 * field, so a parameter name, a device, or a couple of hex bytes all narrow the same way — cheaper
 * to use than one input per column, and it is what people type into a monitor anyway.
 */
export function filterMonitorEvents(events, { direction = '', device = '', type = '', search = '', failuresOnly = false } = {}) {
  const needle = search.trim().toLowerCase();

  const out = [];
  for (const event of events ?? []) {
    if (direction && text(event?.direction) !== direction) continue;
    if (device && text(event?.deviceRole) !== device) continue;
    if (type && text(event?.messageType) !== type) continue;
    if (failuresOnly && !isMonitorFailure(event)) continue;
    if (needle && !monitorEventLine(event).toLowerCase().includes(needle)) continue;
    out.push(event);
  }
  out.reverse();
  return out;
}

/** How many went each way, for a line that says whether anything is happening at all. */
export function monitorCounts(events) {
  let sent = 0;
  let received = 0;
  let failed = 0;
  for (const event of events ?? []) {
    if (text(event?.direction) === 'out') sent++;
    else if (text(event?.direction) === 'in') received++;
    if (isMonitorFailure(event)) failed++;
  }
  return { sent, received, failed, total: (events ?? []).length };
}
