// Preview raw MIDI-in dispatch (onMidiIn / onCcIn / onNoteIn / onSysexIn) and the Q1 handle
// form (panel.get / self.on). MIDI-in is driven through the exported handler seams the bridge
// subscribes in the app; handles run inside real scripts via the host seam.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setRuntimeHost, runScript, dispatchInteraction,
  handleMidiInputMessage, handleSysexInputMessage,
} from '../src/CE_Application/scripting/panelRuntime.js';

const control = (id, name) => ({ _children: { Core: { id, name } } });

let writes;

function installHost(scripts) {
  writes = [];
  setRuntimeHost({
    panel: { id: 'test-panel', controls: [control('c-led', 'led'), control('c-cutoff', 'cutoff')] },
    scripts,
    readValue: () => 0,
    writeValue: (ctl, modelPath, value) => { writes.push({ name: ctl._children.Core.name, value }); },
  });
}

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => setRuntimeHost(null));

test('raw MIDI in: a CC message fires onMidiIn and onCcIn with 1-based channels', async () => {
  installHost([
    { id: 's-cc', name: 'cc', language: 'javascript', event: 'onCcIn', target: '*', enabled: true,
      source: 'function onCcIn(cc) { set("led.value", cc.channel * 1000 + cc.cc) }' },
    { id: 's-raw', name: 'raw', language: 'javascript', event: 'onMidiIn', target: '*', enabled: true,
      source: 'function onMidiIn(midi) { set("cutoff.value", midi.status) }' },
  ]);
  handleMidiInputMessage({ hex: 'B0 4A 40' }); // CC 74 on channel 1
  await settle();
  assert.equal(writes.filter((w) => w.name === 'led').at(-1)?.value, 1074, 'channel 1 (1-based), cc 74');
  assert.equal(writes.filter((w) => w.name === 'cutoff').at(-1)?.value, 0xB0);
});

test('raw MIDI in: notes fire onNoteIn; velocity-0 note-on counts as off', async () => {
  installHost([
    { id: 's-note', name: 'note', language: 'javascript', event: 'onNoteIn', target: '*', enabled: true,
      source: 'function onNoteIn(note) { set("led.value", (note.on ? "+" : "-") + note.note) }' },
  ]);
  handleMidiInputMessage({ hex: '91 3C 64' }); // note-on C4, channel 2
  await settle();
  assert.equal(writes.at(-1)?.value, '+60');
  handleMidiInputMessage({ hex: '91 3C 00' }); // velocity 0 = off
  await settle();
  assert.equal(writes.at(-1)?.value, '-60');
});

test('raw MIDI in: sysex arrives as a bare byte array', async () => {
  installHost([
    { id: 's-sx', name: 'sx', language: 'javascript', event: 'onSysexIn', target: '*', enabled: true,
      source: 'function onSysexIn(bytes) { set("led.value", bytes.length * 100 + bytes[0]) }' },
  ]);
  handleSysexInputMessage({ hex: 'F0 41 10 F7' });
  await settle();
  assert.equal(writes.at(-1)?.value, 640, '4 bytes, first 0xF0 (240)');
});

test('panel.get handles: set/get with a remembered prefix, on() registers a targeted listener', async () => {
  const script = {
    id: 's-handle', name: 'handle', language: 'javascript', event: 'onClick', target: '*', enabled: true,
    source: `
      const h = panel.get("led")
      h.on("valueChanged", (value) => { h.set("value", value + 1) })
      function onClick(m) { panel.get("cutoff").set("value", 42) }
    `,
  };
  installHost([script]);
  await runScript(script, 'onClick', {});
  assert.equal(writes.filter((w) => w.name === 'cutoff').at(-1)?.value, 42, 'handle.set resolves through the prefix');
  dispatchInteraction('c-led', 'onValueChanged', 7);
  await settle();
  assert.equal(writes.filter((w) => w.name === 'led').at(-1)?.value, 8,
    'the handle-registered listener fires for its own target');
});
