// The note API (sendNote / noteOn / noteOff) and musical time (transport(), beatCrossings)
// in the preview runtime. Notes are asserted through the script console trace — with no JUCE
// host the runtime traces exactly what it would have sent.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { setRuntimeHost, runScript, beatCrossings } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

const control = (id, name) => ({ _children: { Core: { id, name } } });

let writes;

function installHost(scripts = []) {
  writes = [];
  setRuntimeHost({
    panel: { id: 'test-panel', controls: [control('c-led', 'led')] },
    scripts,
    readValue: () => 0,
    writeValue: (ctl, modelPath, value) => { writes.push({ name: ctl._children.Core.name, modelPath, value }); },
  });
}

const settle = (ms = 25) => new Promise((r) => setTimeout(r, ms));
const traceLines = () => get(scriptTrace).map((t) => t.message ?? t.msg ?? String(t));

beforeEach(() => { setRuntimeHost(null); clearScriptTrace(); });

test('sendNote sends a note-on and schedules the note-off', async () => {
  installHost();
  await runScript(
    { id: 's-note', name: 'note', language: 'javascript', event: 'onClick', target: '*',
      source: 'function onClick(mouse) { sendNote(1, 60, 100, 40) }' },
    'onClick', {});
  const on = traceLines().find((l) => l.includes('note_on_60'));
  assert.ok(on && on.includes('90 3C 64'), `note-on 90 3C 64 should be traced, got: ${on}`);
  await settle(80);
  const off = traceLines().find((l) => l.includes('note_off_60'));
  assert.ok(off && off.includes('80 3C 00'), `note-off 80 3C 00 should follow after durationMs, got: ${off}`);
});

test('noteOn defaults velocity to 100; noteOff releases', async () => {
  installHost();
  await runScript(
    { id: 's-hold', name: 'hold', language: 'javascript', event: 'onClick', target: '*',
      source: 'function onClick(mouse) { noteOn(2, 72); noteOff(2, 72) }' },
    'onClick', {});
  const lines = traceLines();
  assert.ok(lines.some((l) => l.includes('91 48 64')), 'noteOn on channel 2 → status 0x91, velocity 100');
  assert.ok(lines.some((l) => l.includes('81 48 00')), 'noteOff on channel 2 → status 0x81');
});

test('transport() exposes the master clock to scripts', async () => {
  installHost();
  await runScript(
    { id: 's-clock', name: 'clock', language: 'javascript', event: 'onClick', target: '*',
      source: 'function onClick(mouse) { const t = transport(); set("led.value", t.bpm) }' },
    'onClick', {});
  await settle();
  assert.equal(writes.filter((w) => w.name === 'led').at(-1)?.value, 120,
    'the default transport bpm (120) should be readable from a script');
});

test('beatCrossings yields 1-based beats/bars and fires onBar at bar lines', () => {
  // Crossing beats 0..4 in 4/4: five onBeat events, and onBar at beat 0 (bar 1) and beat 4 (bar 2).
  const events = beatCrossings(-0.001, 4.2, 4);
  const beats = events.filter((e) => e.event === 'onBeat').map((e) => e.payload);
  const bars = events.filter((e) => e.event === 'onBar').map((e) => e.payload);
  assert.deepEqual(beats.map((b) => [b.bar, b.beat]), [[1, 1], [1, 2], [1, 3], [1, 4], [2, 1]]);
  assert.deepEqual(bars.map((b) => b.bar), [1, 2]);
  // No movement, no events; a rewind produces none either.
  assert.equal(beatCrossings(4.2, 4.3, 4).length, 0);
  assert.equal(beatCrossings(8, 2, 4).length, 0);
});
