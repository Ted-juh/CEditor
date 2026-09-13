import { mount } from 'svelte';
import InstrumentHostView from '../src/CE_Application/sections/InstrumentHostView.svelte';
import { hostState, hostSurface, hostSurfaceLayout, hostParameters, hostMidiLearn,
  normalizeHostState, normalizeSurfaceLayout, normalizeHostParameters,
  mockHostState, mockSurfaceLayout, applyMockCommand } from '../src/CE_Application/stores/instrumentHost.js';

// No native plug-ins or MIDI devices are opened by this fixture.
window.controllerCommands = [];
const state = mockHostState();
state.rack.pages = [{ pageId: 'page-1', name: 'Synth controls', slots: Array.from({ length: 8 }, (_, index) => ({
  slotId: `encoder-${index + 1}`, kind: 'encoder', index, assigned: index === 0,
  resolved: true, displayName: index === 0 ? 'Filter cutoff' : '',
  partId: state.rack.focusedPartId, partName: 'Stage Keys', parameterId: 'cutoff',
  midiCc: index === 0 ? 74 : -1, midiNote: -1, midiChannel: 1, rangeMin: 0, rangeMax: 1,
})) }];
hostState.set(normalizeHostState(state));
hostSurfaceLayout.set(normalizeSurfaceLayout(mockSurfaceLayout()));
hostSurface.set({ state: 'connected', device: 'M-Audio CTRL49' });
hostParameters.set(normalizeHostParameters({ partId: state.rack.focusedPartId,
  favourites: ['cutoff', 'param-3'], touched: ['param-1', 'cutoff'],
  parameters: ['Filter cutoff', 'Resonance', 'Envelope attack', 'Envelope release',
    ...Array.from({ length: 100 }, (_, i) => `Oscillator parameter ${i + 1}`)].map((name, index) => ({
      id: index === 0 ? 'cutoff' : `param-${index}`, index, name, value: 0.5,
    })) }));
const listeners = new Map();
window.controllerEvent = (name, payload) => { for (const callback of listeners.get(name) ?? []) callback(payload); };
window.__JUCE__ = { backend: {
  addEventListener(name, callback) { listeners.set(name, [...(listeners.get(name) ?? []), callback]); return callback; }, removeEventListener() {},
  emitEvent(event, command) {
    if (event !== 'instrumentHost') return;
    window.controllerCommands.push(command);
    if (command.cmd === 'setControlSlotOptions') hostState.update(s => normalizeHostState(applyMockCommand(s, command)));
    if (command.cmd === 'focusPart') hostState.update(s => normalizeHostState({ ...s,
      rack: { ...s.rack, focusedPartId: command.partId } }));
  },
} };
window.finishControllerLearn = () => hostMidiLearn.set({ armed: false, pageId: '', slotId: '' });
window.setPickupDirection = (direction) => hostState.update(s => normalizeHostState({ ...s,
  rack: { ...s.rack, pages: s.rack.pages.map(p => ({ ...p, slots: p.slots.map((slot, i) =>
    i === 0 ? { ...slot, pickupDirection: direction } : slot) })) },
}));
window.showEmptyController = () => hostSurfaceLayout.set(normalizeSurfaceLayout({}));
mount(InstrumentHostView, { target: document.getElementById('host') });
