export const METER_FLOOR_DB = -60;
const RELEASE_DB_PER_SECOND = 24;
const HOLD_MS = 1000;

export const emptyMeters = () => ({ channels: {}, updatedAt: 0 });
export const peakToDb = value => value > 0 ? 20 * Math.log10(value) : -Infinity;
export const meterPercent = db => Math.max(0, Math.min(100, (db - METER_FLOOR_DB) / -METER_FLOOR_DB * 100));
export const meterDbText = db => Number.isFinite(db) ? `${db > 0 ? '+' : ''}${db.toFixed(1)}` : '−∞';

function release(value, elapsed) {
  const next = value - RELEASE_DB_PER_SECOND * Math.max(0, elapsed) / 1000;
  return next < METER_FLOOR_DB ? -Infinity : next;
}

/** Display ballistics only; never feeds back into gain, routing, or the document. */
export function advanceMeters(state, now) {
  const elapsed = Math.max(0, now - state.updatedAt);
  return { updatedAt: now, channels: Object.fromEntries(Object.entries(state.channels).map(([id, channel]) => {
    const levels = channel.levels.map(value => release(value, elapsed));
    const holds = channel.holds.map((value, i) => Math.max(levels[i],
      release(value, Math.max(0, now - Math.max(state.updatedAt, channel.holdUntil[i])))));
    return [id, { ...channel, levels, holds }];
  })) };
}

/** Each native packet is the complete current roster, keyed by stable rack IDs.
 * Peaks above unity remain above 0 dBFS; missing channels are removed, not re-indexed. */
export function applyMeterFrame(state, payload, now) {
  if (!Array.isArray(payload?.channels)) return state;
  const previous = advanceMeters(state, now);
  const channels = [];
  for (const input of payload.channels) {
    if (typeof input?.id !== 'string' || !input.id
      || !Number.isFinite(input.left) || !Number.isFinite(input.right)
      || input.left < 0 || input.right < 0) continue;
    const current = [peakToDb(input.left), peakToDb(input.right)];
    const was = Object.hasOwn(previous.channels, input.id) ? previous.channels[input.id] : undefined;
    channels.push([input.id, {
      current, receivedAt: now,
      levels: current.map((db, i) => Math.max(db, was?.levels[i] ?? -Infinity)),
      holds: current.map((db, i) => Math.max(db, was?.holds[i] ?? -Infinity)),
      holdUntil: current.map((db, i) => db >= (was?.holds[i] ?? -Infinity) ? now + HOLD_MS : was.holdUntil[i]),
      maximumDb: Math.max(...current, was?.maximumDb ?? -Infinity),
      over: input.left >= 1 || input.right >= 1 || was?.over === true,
    }]);
  }
  return { channels: Object.fromEntries(channels), updatedAt: now };
}

/** Reset just the display memory. A new over-range audio packet will light OVER again. */
export function clearMeterPeaks(state, id, now) {
  const next = advanceMeters(state, now);
  return { ...next, channels: Object.fromEntries(Object.entries(next.channels).map(([key, channel]) => {
    if (id && key !== id) return [key, channel];
    const current = now - channel.receivedAt <= 250 ? channel.current : [-Infinity, -Infinity];
    return [key, { ...channel, over: false, maximumDb: Math.max(...current),
      holds: [...current], holdUntil: [now + HOLD_MS, now + HOLD_MS] }];
  })) };
}
