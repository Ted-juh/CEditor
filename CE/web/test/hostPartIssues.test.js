import test from 'node:test';
import assert from 'node:assert/strict';
import { writable } from 'svelte/store';
import { hostPartIssues } from '../src/CE_Application/utils/hostPartIssues.js';
import { recentNoteStore, hostRackIssues } from '../src/CE_Application/stores/hostPartIssues.js';
import { hostState, hostMidiActivity, normalizeHostState } from '../src/CE_Application/stores/instrumentHost.js';

const part = (fields = {}) => ({ partId: 'p', hasInstrument: true, enabled: true, volume: 1,
  channel: 0, keyLow: 0, keyHigh: 127, velocityLow: 1, velocityHigh: 127, ...fields });
const state = (parts) => ({ rack: { parts, focusedPartId: 'p' } });
const ids = (s, p, note) => hostPartIssues(s, p, note).filter(i => !i.existing).map(i => i.id);

test('normal, empty and deliberately muted parts do not gain redundant indicators', () => {
  for (const p of [part(), part({ mute: true, volume: 0 }), part({ enabled: false }),
    part({ hasInstrument: false }), part({ unresolved: true, hasInstrument: false })])
    assert.deepEqual(ids(state([p]), p), []);
  assert.equal(hostPartIssues(state([]), part({ mute: true }))[0].existing, true);
});

test('solo on another part explains audio suppression, including a disabled solo part', () => {
  const p = part();
  const s = state([p, part({ partId: 'q', solo: true, enabled: false, pluginName: 'Spire' })]);
  assert.deepEqual(ids(s, p), ['solo-other']);
  assert.match(hostPartIssues(s, p)[0].detail, /Spire/);
  assert.deepEqual(ids(s, { ...p, solo: true }), []);
  assert.deepEqual(ids(state([p]), { ...p, volume: 0 }), ['level-zero']);
});

test('hardware diagnostics use the native error, not a stale or unrequested device list', () => {
  const p = part({ hardware: true, midiOutputId: 'usb', hasInstrument: false });
  assert.deepEqual(ids({ ...state([p]), audioDevices: { midiOutputs: [] } }, p), []);
  assert.deepEqual(ids(state([p]), { ...p, midiOutError: 'USB port unavailable' }), ['midi-output']);
});

test('disconnected input belongs only to the native-reported affected parts', () => {
  const p = part();
  const s = { ...state([p]), reliability: { midi: { issues: [
    { kind: 'inputGone', device: 'Keys', parts: [{ partId: 'p' }] },
    { kind: 'heldNote', device: 'Other', parts: [{ partId: 'p' }] },
  ] } } };
  assert.deepEqual(ids(s, p), ['midi-input']);
  assert.deepEqual(ids(s, { ...p, partId: 'q' }), []);
});

test('recovered processors and dry-bypassed effects do not claim the instrument is silent', () => {
  const p = part();
  const s = { ...state([p]), reliability: { automaticFailover: { events: [
    { targetId: 'p', state: 'recovered' }, { targetId: 'p', effect: true, state: 'failed' },
  ] } } };
  assert.deepEqual(ids(s, p), []);
  s.reliability.automaticFailover.events = [{ targetId: 'p', state: 'failed', error: 'Worker stopped' }];
  assert.equal(hostPartIssues(s, p)[0].target, 'health');
});

test('filtering is a contextual observation, combines reasons and respects Omni', () => {
  const p = part({ channel: 2, keyLow: 60, velocityLow: 60 });
  const note = { partId: 'p', note: 48, channel: 1, value: 40, device: 'Keys' };
  const result = hostPartIssues(state([p]), p, note);
  assert.deepEqual(result.map(i => i.id), ['zone']);
  assert.match(result[0].detail, /channel 1/);
  assert.match(result[0].detail, /outside/);
  assert.match(result[0].detail, /velocity 40/);
  assert.deepEqual(ids(state([p]), part(), note), []);
});

test('routed MIDI, note-offs and changed focus never reuse the global note as proof', () => {
  const p = part({ keyLow: 60 });
  const note = { partId: 'p', note: 48, channel: 1, value: 100 };
  assert.deepEqual(ids(state([p]), { ...p, midiSourcePartId: 'arp' }, note), []);
  assert.deepEqual(ids(state([p]), p, { ...note, value: 0 }), []);
  assert.deepEqual(ids({ rack: { parts: [p], focusedPartId: 'q' } }, p, note), []);
  assert.deepEqual(ids(state([p]), p, { ...note, partId: 'q' }), []);
});

test('note observation expires and later events replace it without an old timer clearing them', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const activity = writable(null);
  const recent = recentNoteStore(activity, () => 'p', 35);
  let value;
  const unsubscribe = recent.subscribe(v => value = v);
  activity.set({ seq: 1, note: 48, channel: 1, value: 100 });
  assert.equal(value.partId, 'p');
  t.mock.timers.tick(20);
  activity.set({ seq: 2, note: 60, channel: 1, value: 100 });
  t.mock.timers.tick(20);
  assert.equal(value.note, 60);
  t.mock.timers.tick(25);
  assert.equal(value, null);
  unsubscribe();
});

test('opening or reopening a rack ignores cached MIDI monitor events', () => {
  hostState.set(normalizeHostState(state([part({ keyLow: 60 })])));
  hostMidiActivity.set({ seq: 10, note: 48, channel: 1, value: 100 });
  let value;
  let unsubscribe = hostRackIssues.subscribe(v => value = v);
  assert.deepEqual(value.p, []);
  hostMidiActivity.set({ seq: 11, note: 48, channel: 1, value: 100 });
  assert.equal(value.p[0].id, 'zone');
  unsubscribe();
  unsubscribe = hostRackIssues.subscribe(v => value = v);
  assert.deepEqual(value.p, []);
  unsubscribe();
});
