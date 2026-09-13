import { mount } from 'svelte';
import { get } from 'svelte/store';
import InstrumentHostView from '../src/CE_Application/sections/InstrumentHostView.svelte';
import { hostState, normalizeHostState, mockHostState, applyMockCommand } from '../src/CE_Application/stores/instrumentHost.js';

// Native event-shaped frames with known levels; no audio device or plug-in is opened.
const state = mockHostState();
state.rack.parts = ['Massive X', 'Vanguard', 'Spire'].map((pluginName, i) => ({
  ...state.rack.parts[0], partId: `part-${i}`, pluginCeId: `synth-${i}`, pluginName,
  destinationBusId: 'synths', sends: [{ returnId: 'space', level: .25 }],
}));
state.rack.focusedPartId = 'part-2';
state.rack.buses = [{ busId: 'synths', name: 'Synths', level: .5, destinationBusId: '', effects: [] }];
state.rack.returns = [{ returnId: 'space', name: 'Space', level: .25, effects: [] }];
hostState.set(normalizeHostState(state));
const listeners = new Map();
window.mixerCommands = [];
window.mixerStatePushes = 0;
window.__JUCE__ = { backend: {
  addEventListener(name, callback) { listeners.set(name, callback); return name; },
  removeEventListener(name) { listeners.delete(name); },
  emitEvent(event, command) {
    if (event !== 'instrumentHost') return;
    window.mixerCommands.push(command);
    if (['focusPart', 'setPartMixer', 'setSendLevel', 'setBusLevel', 'setReturnLevel', 'setMasterLevel', 'setPartDestination', 'setBusDestination'].includes(command.cmd)) {
      ++window.mixerStatePushes;
      hostState.update(s => applyMockCommand(s, command));
    }
  },
} };
const levels = [{ id: 'part-0', left: .2, right: .15 }, { id: 'part-1', left: .1, right: .12 },
  { id: 'part-2', left: .5, right: .25 }, { id: 'synths', left: .3, right: .35 },
  { id: 'space', left: .04, right: .03 }, { id: '@master', left: 1.1, right: .8 }];
window.emitMixerFrame = (channels = levels) => listeners.get('instrumentHostMeters')?.({ channels });
window.getMixerState = () => get(hostState);
window.reorderMixerParts = () => hostState.update(s => normalizeHostState({ ...s,
  rack: { ...s.rack, parts: [...s.rack.parts].reverse() } }));
mount(InstrumentHostView, { target: document.getElementById('host') });
