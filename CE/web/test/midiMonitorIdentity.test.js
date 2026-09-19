import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitorEventReconciler } from '../src/CE_Application/utils/midiMonitor.js';

test('a rolling monitor snapshot retains surviving rows and their identity', () => {
  const reconcile = createMonitorEventReconciler();
  const events = Array.from({ length: 500 }, (_, i) => ({ timestamp: String(i), hex: 'B0 4A 20', direction: 'in' }));
  const before = reconcile(events);
  const next = reconcile(structuredClone([...events.slice(1), { timestamp: '500', hex: 'B0 4A 21', direction: 'in' }]));
  for (let i = 0; i < 499; i++) assert.equal(next[i], before[i + 1]);
  assert.equal(new Set(next.map(row => row.monitorKey)).size, 500);
});

test('same-millisecond duplicate events have distinct keys and native ids survive trimming', () => {
  const reconcile = createMonitorEventReconciler();
  const event = { timestamp: 'same', hex: 'B0 4A 20' };
  const duplicate = reconcile([event, { ...event }]);
  assert.notEqual(duplicate[0].monitorKey, duplicate[1].monitorKey);
  const original = reconcile([{ ...event, eventId: 1 }, { ...event, eventId: 2 }]);
  assert.equal(reconcile([{ ...event, eventId: 2 }])[0], original[1]);
  const changed = reconcile([{ ...event, eventId: 2, status: 'updated' }])[0];
  assert.notEqual(changed, original[1]);
  assert.equal(changed.monitorKey, original[1].monitorKey);
});
