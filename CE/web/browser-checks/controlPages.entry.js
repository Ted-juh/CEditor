import { mount } from 'svelte';
import { get } from 'svelte/store';
import InstrumentHostView from '../src/CE_Application/sections/InstrumentHostView.svelte';
import { hostState, normalizeHostState, mockHostState, applyMockCommand, hostParameters,
  normalizeHostParameters } from '../src/CE_Application/stores/instrumentHost.js';

const state = mockHostState();
state.rack.parts = ['Massive X', 'Vanguard', 'Spire'].map((pluginName, i) => ({
  ...state.rack.parts[0], partId: `part-${i}`, pluginName, pluginCeId: `synth-${i}`,
  effects: i === 2 ? [{ effectId: 'delay', pluginCeId: 'delay', pluginName: 'Delay', hasProcessor: true }] : [],
}));
state.rack.focusedPartId = 'part-2';
state.instruments = state.rack.parts.map(p => ({ ceId: p.pluginCeId, name: p.pluginName,
  snapshotUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#243b52"/><circle cx="50" cy="50" r="25" fill="#69afc8"/></svg>'),
}));
const blank = () => Array.from({ length: 8 }, (_, i) => ({ slotId: `s${i + 1}`, assigned: false }));
const slots = blank();
const assigned = (partId, parameterId, displayName, value, extra = {}) => ({
  assigned: true, resolved: true, partId, parameterId, displayName, value, ...extra,
});
Object.assign(slots[0], assigned('part-2', 'cutoff', 'Filter cutoff', .62, { midiCc: 74, midiChannel: 1 }));
Object.assign(slots[1], assigned('part-1', 'resonance', 'Resonance', .24, { midiCc: 71, midiChannel: 1 }));
Object.assign(slots[2], assigned('delay', 'mix', 'Delay mix', .18));
Object.assign(slots[3], { midiCc: 21 });
Object.assign(slots[6], assigned('removed', 'drive', 'Filter drive', 0, { partName: 'Massive X', resolved: false }));
state.rack.pages = [{ pageId: 'page-1', name: 'Page 1', slots }, { pageId: 'page-2', name: 'Page 2', slots: blank() }];
hostState.set(normalizeHostState(state));
window.controlCommands = [];
const listeners = new Map();
window.controlEvent = (name, payload) => { for (const cb of listeners.get(name) ?? []) cb(payload); };
window.__JUCE__ = { backend: {
  addEventListener(name, callback) { listeners.set(name, [...(listeners.get(name) ?? []), callback]); return callback; },
  removeEventListener() {},
  emitEvent(event, command) {
    if (event !== 'instrumentHost') return;
    window.controlCommands.push(command);
    if (command.cmd === 'getParameters') hostParameters.set(normalizeHostParameters({ partId: command.partId,
      parameters: [{ id: 'cutoff', name: 'Filter cutoff', value: .62 }] }));
    else if (command.cmd === 'learnControlSlotParameter' || command.cmd === 'cancelLearnControlSlotParameter')
      window.controlEvent('instrumentHostParamLearn', { armed: command.cmd === 'learnControlSlotParameter', pageId: command.pageId, slotId: command.slotId });
    else if (!['setControlSlotValue', 'learnControlSlotMidi', 'cancelMidiLearn'].includes(command.cmd))
      hostState.update(s => applyMockCommand(s, command));
  },
} };
window.getControlState = () => get(hostState);
mount(InstrumentHostView, { target: document.getElementById('host') });
