// Some CCs select a value according to an effect's mode. Ask for that small
// parameter block instead of guessing, with one outstanding read per block and
// a trailing read so a fast gesture cannot leave the display at an old value.
export function createInboundRefreshQueue(send, { interval = 100, timeout = 1500,
  now = Date.now, later = setTimeout, cancel = clearTimeout } = {}) {
  const entries = new Map();
  let sequence = 0;
  function schedule(entry) {
    if (entry.timer != null || entry.pending || !entry.dirty) return;
    entry.timer = later(() => {
      entry.timer = null;
      entry.dirty = false;
      entry.sentAt = now();
      entry.pending = `inbound_refresh_${++sequence}`;
      entry.watchdog = later(() => finish(entry.pending), timeout);
      send({ ...entry.payload, correlationId: entry.pending, chainStartup: false, dryRun: false });
    }, Math.max(0, entry.sentAt + interval - now()));
  }
  function finish(id) {
    const entry = [...entries.values()].find(item => item.pending === id);
    if (!entry) return;
    cancel(entry.watchdog);
    entry.pending = '';
    schedule(entry);
  }
  return {
    request(payload) {
      const key = JSON.stringify([payload.deviceRole, payload.profileId, payload.request]);
      let entry = entries.get(key);
      if (!entry) entries.set(key, entry = { payload, sentAt: -Infinity, pending: '', timer: null });
      entry.dirty = true;
      schedule(entry);
    },
    finish,
    clear() {
      for (const entry of entries.values()) { cancel(entry.timer); cancel(entry.watchdog); }
      entries.clear();
    },
  };
}
