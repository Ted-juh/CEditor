// The rest of a device's MIDI, and ce.mpe, in the panel view: what arrives on the editor's MIDI input
// raises the decoded events with `from`, a note read with ce.mpe.listen() carries its id, and
// ce.mpe plays through the same send path as every other script send. The decoding itself is held to
// one table by midiInDecoder.test.js and MidiInDecoderTests.cpp; the four runtimes' ce.mpe by
// mpeParity.test.js. This is the wiring between them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  setRuntimeHost, setLiveEnabled, scriptApiForTesting, midiInputForTesting, midiInFlushForTesting, clearDeviceRuntimeDefinitions,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function withPanel(fn) {
  setRuntimeHost({ panel: { id: 'midi-in', name: 'In', width: 100, height: 100, controls: [], scripting: { modules: ['ce.core', 'ce.midi', 'ce.mpe'] } }, scripts: [] });
  setLiveEnabled(true);
  clearScriptTrace();
  try { return await fn(scriptApiForTesting('', 'midi-in-script')); } finally {
    clearDeviceRuntimeDefinitions();
    setRuntimeHost(null);
  }
}

const hex = (bytes) => bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
async function arrive(bytes, at, { role = 'controller', type = 'other' } = {}) {
  midiInputForTesting({ hex: hex(bytes), deviceRole: role, messageType: type, atForTesting: at });
  await settle();
}

test('a bend, a program change with its bank, an NRPN and transport reach a script, with from', async () => {
  await withPanel(async (api) => {
    const seen = [];
    for (const e of ['onBendIn', 'onProgramIn', 'onNrpnIn', 'onTransportIn', 'onMidiIn']) api.on('*', e, (p) => seen.push([e, p]));
    await arrive([0xE1, 0x00, 0x60], 1000);
    await arrive([0xB0, 0, 1], 1001, { type: 'cc' });
    await arrive([0xC0, 5], 1002);
    await arrive([0xB0, 99, 1], 1003, { type: 'cc' });
    await arrive([0xB0, 98, 2], 1004, { type: 'cc' });
    await arrive([0xB0, 6, 3], 1005, { type: 'cc' });
    await arrive([0xB0, 38, 4], 1006, { type: 'cc' });
    await arrive([0xFA], 1007);
    const named = seen.filter(([e]) => e !== 'onMidiIn');
    assert.deepEqual(named, [
      ['onBendIn', { channel: 2, value: 4096, amount: 4096 / 8191, raw: 12288, from: 'controller' }],
      ['onProgramIn', { channel: 1, program: 5, number: 6, bankMsb: 1, from: 'controller' }],
      ['onNrpnIn', { channel: 1, from: 'controller', msb: 1, lsb: 2, parameter: 130, value: 388, fine: true }],
      ['onTransportIn', { action: 'start', from: 'controller' }],
    ]);
    assert.ok(seen.filter(([e]) => e === 'onMidiIn').every(([, p]) => p.from === 'controller'), 'midiIn says where it came from');
  });
});

test('a coarse-only NRPN is raised when its wait is over', async () => {
  await withPanel(async (api) => {
    const seen = [];
    api.on('*', 'onNrpnIn', (p) => seen.push(p));
    await arrive([0xB0, 99, 0], 2000, { type: 'cc' });
    await arrive([0xB0, 98, 7], 2000, { type: 'cc' });
    await arrive([0xB0, 6, 100], 2000, { type: 'cc' });
    assert.equal(seen.length, 0, 'the fine half may still come');
    midiInFlushForTesting(2010);
    await settle();
    assert.deepEqual(seen, [{ channel: 1, from: 'controller', msb: 0, lsb: 7, parameter: 7, value: 100, fine: false }]);
  });
});

test('ce.mpe.listen gives notes ids and turns a member channel\'s bend and timbre into expressionIn', async () => {
  await withPanel(async (api) => {
    const seen = [];
    for (const e of ['onNoteIn', 'onExpressionIn', 'onCcIn', 'onBendIn', 'onNoteOffIn']) api.on('*', e, (p) => seen.push([e, p]));
    assert.equal(api.ce.mpe.listen({ from: 'controller', members: 4, bendRange: 48 }), true);
    await arrive([0x92, 60, 100], 3000);
    await arrive([0xE2, 0x7F, 0x7F], 3001);
    await arrive([0xB2, 74, 127], 3020, { type: 'cc' });
    await arrive([0x82, 60, 0], 3030);
    assert.deepEqual(seen.map(([e]) => e), ['onNoteIn', 'onExpressionIn', 'onExpressionIn', 'onNoteOffIn'], 'no ccIn or bendIn for the member channel');
    const id = seen[0][1].id;
    assert.ok(Number.isInteger(id));
    assert.equal(seen[1][1].id, id);
    assert.equal(seen[1][1].bend, 48);
    assert.equal(seen[2][1].changed, 'timbre');
    assert.equal(seen[3][1].id, id, 'the note off carries the same id');
    // Another device is not read as MPE.
    seen.length = 0;
    await arrive([0xE2, 0, 64], 3100, { role: 'mainSynth' });
    assert.deepEqual(seen.map(([e]) => e), ['onBendIn']);
  });
});

test('ce.mpe plays through the panel\'s send path, and the panel closing ends its notes', async () => {
  const sent = () => get(scriptTrace).map((t) => t.message ?? t.text ?? String(t)).filter((m) => m.startsWith('→ mpe:'));
  await withPanel(async (api) => {
    assert.equal(api.ce.mpe.zone({ members: 2, send: false }), true);
    const id = api.ce.mpe.noteOn('C4', 100);
    assert.equal(id, 1);
    assert.deepEqual(sent().map((m) => m.replace(/\s+\(no JUCE host.*$/, '')), [
      '→ mpe: E1 00 40', '→ mpe: B1 4A 40', '→ mpe: D1 00', '→ mpe: 91 3C 64',
    ]);
    assert.deepEqual(api.ce.mpe.notes().map((n) => [n.id, n.note, n.channel]), [[1, 60, 2]]);
    assert.equal(api.ce.mpe.express(id, { bnd: 1 }), false, 'a misspelt value is refused, not ignored');
  });
  // The panel went: a new one starts with no zone and no notes.
  await withPanel(async (api) => {
    assert.deepEqual(api.ce.mpe.notes(), []);
  });
});
