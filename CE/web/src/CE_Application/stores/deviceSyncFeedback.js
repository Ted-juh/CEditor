// Evidence only: an engine runtime-state snapshot or successful compilation is NOT a synth reply.
import { writable } from 'svelte/store';

export const deviceSyncFeedback = writable({});
let serial = 0;
const requests = new Map();
const routes = new Map();
const empty = () => ({ received: {}, writes: {}, reads: {}, lastReplyAt: '', reason: '' });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function update(role, change) {
  if (!role) return;
  deviceSyncFeedback.update(all => ({ ...all, [role]: change(all[role] ?? empty()) }));
}
export function nextFeedbackRequestId() { return `sync_feedback_${++serial}`; }
export function invalidateDeviceFeedback(role, reason = 'READ REQUIRED', preserveWrites = false) {
  update(role, s => ({ ...empty(), generation: (s.generation ?? 0) + 1, reason,
    ...(preserveWrites ? { writes: Object.fromEntries(Object.entries(s.writes).map(([id, write]) => [id, { ...write, state: 'pending' }])) } : {}),
  }));
  for (const [id, request] of requests) if (request.deviceRole === role) requests.delete(id);
}
export function feedbackEndpointAvailable(endpoint, inventory) {
  if (!endpoint || ['none', 'previewOnly'].includes(endpoint.type) || ['none', 'previewOnly', ''].includes(String(endpoint.id ?? ''))) return false;
  return Array.isArray(inventory) && inventory.some(item => item.id === endpoint.id && item.type === endpoint.type);
}
export function syncFeedbackRoutes(mappings, destinations, inputs) {
  for (const role of new Set([...routes.keys(), ...Object.keys(mappings ?? {})])) {
    const mapping = mappings?.[role];
    const key = JSON.stringify([mapping?.profileId, mapping?.midiInput, mapping?.midiDestination]);
    const signature = JSON.stringify([key,
      feedbackEndpointAvailable(mapping?.midiDestination, destinations), feedbackEndpointAvailable(mapping?.midiInput, inputs)]);
    if (routes.has(role) && routes.get(role).signature !== signature) invalidateDeviceFeedback(role, 'MIDI ROUTE CHANGED — READ REQUIRED', routes.get(role).key === key);
    routes.set(role, { key, signature });
  }
}
export function noteDeviceFeedbackWrite(payload) {
  const { deviceRole: role, parameterId: id, value, requestId } = payload;
  if (!id) return;
  if (requestId) requests.set(requestId, { ...payload, kind: 'write' });
  // Bound retention even if the native backend never answers.
  if (requests.size > 4096) requests.delete(requests.keys().next().value);
  update(role, s => ({ ...s, writes: { ...s.writes, [id]: {
    value, sequence: ++serial, requestId, state: payload.dryRun ? 'preview' : 'pending', error: '',
  } } }));
}
export function noteDeviceFeedbackResult(payload) {
  const request = requests.get(payload?.requestId);
  const role = payload?.deviceRole ?? request?.deviceRole;
  const id = payload?.parameterId ?? request?.parameterId;
  if (!role || !id) return;
  update(role, s => {
    const current = s.writes[id];
    if (!current || (payload?.requestId && current.requestId !== payload.requestId)) return s;
    return { ...s, writes: { ...s.writes, [id]: { ...current,
      state: payload.ok === false ? 'error' : current.state === 'preview' ? 'preview' : 'unverified',
      error: payload.ok === false ? String(payload.error ?? 'MIDI request failed') : '',
    } } };
  });
  requests.delete(payload?.requestId);
}
export function noteDeviceFeedbackReceived(role, values) {
  const entries = Object.entries(values ?? {});
  if (!entries.length) return;
  update(role, s => ({ ...s, reason: '', lastReplyAt: new Date().toISOString(), received: {
    ...s.received, ...Object.fromEntries(entries.map(([id, value]) => [id, { value, sequence: ++serial }])),
  } }));
}
export function noteDeviceFeedbackRead(payload, phase = 'started') {
  const correlation = payload?.correlationId ?? payload?.requestId;
  const previous = requests.get(correlation);
  if (phase !== 'started' && !previous) return; // A retired route/request cannot taint the new connection.
  const role = payload?.deviceRole ?? previous?.deviceRole;
  if (!role || !correlation) return;
  const requestName = payload?.deviceRequestId ?? payload?.request ?? previous?.request ?? payload?.requestId;
  const failed = phase === 'timeout' || payload?.ok === false;
  const pending = !failed && (phase === 'started' && (payload?.pending === true || payload?.running === true));
  if (pending) requests.set(correlation, { deviceRole: role, request: requestName, kind: 'read' });
  else requests.delete(correlation);
  update(role, s => {
    const reads = { ...s.reads };
    if (pending || failed) reads[correlation] = { state: failed ? 'error' : 'reading',
      request: requestName, error: failed ? String(payload?.error ?? 'Read timed out — no complete reply') : '' };
    else delete reads[correlation];
    // Retire earlier timeout warnings when the same request is retried successfully.
    if (pending || phase === 'resolved') for (const [id, read] of Object.entries(reads)) {
      if (id !== correlation && read.request === requestName && read.state === 'error') delete reads[id];
    }
    return { ...s, reads };
  });
}
export function noteDeviceFeedbackIdentity(payload) {
  const role = payload?.deviceRole;
  if (!role) return;
  update(role, s => ({ ...s, identityError: payload?.matched === false || payload?.ok === false
    ? String(payload?.error || 'Device identity mismatch') : '',
    ...(payload?.matched === true || payload?.ok === true ? { lastReplyAt: new Date().toISOString() } : {}),
  }));
}
export function deviceFeedbackCounts(state = empty()) {
  let pending = 0, confirmed = 0, failed = 0;
  for (const [id, write] of Object.entries(state.writes ?? {})) {
    const rx = state.received?.[id];
    if (rx && rx.sequence > write.sequence && same(rx.value, write.value)) confirmed++;
    else { pending++; if (write.state === 'error') failed++; }
  }
  return { pending, confirmed, failed };
}
export function resetDeviceSyncFeedbackForTesting() {
  requests.clear(); routes.clear(); serial = 0; deviceSyncFeedback.set({});
}
