import { mount } from 'svelte';
import { get } from 'svelte/store';
import InstrumentHostView from '../src/CE_Application/sections/InstrumentHostView.svelte';
import { hostState, normalizeHostState, mockHostState, applyMockCommand } from '../src/CE_Application/stores/instrumentHost.js';

window.layerCommands = [];
const state = mockHostState();
state.rack.parts = ['Massive X', 'Vanguard', 'Spire', 'Stage Keys'].map((pluginName, i) => ({
  ...state.rack.parts[0], partId: `part-${i}`, pluginName, midiSourcePartId: '',
}));
state.rack.focusedPartId = 'part-0';
state.rack.macros = [{ macroId: 'blend', name: 'Layer blend', value: .5, targets: [] }];
state.rack.layerGroups = [{ layerGroupId: 'layer-1', name: 'Velocity blend', enabled: true,
  source: 'velocity', allocation: 'all', controller: 11, members: [[0,65], [42,100], [80,127]].map(([lo,hi],i) => ({
    partId: `part-${i}`, partName: state.rack.parts[i].pluginName,
    minimum: lo / 127, maximum: hi / 127, crossfade: .1, resolved: true,
  })) }];
hostState.set(normalizeHostState(state));
window.__JUCE__ = { backend: { addEventListener() { return 1; }, removeEventListener() {},
  emitEvent(event, command) {
    if (event !== 'instrumentHost') return;
    window.layerCommands.push(command);
    if (['setLayerMember','setLayerGroup','addLayerMember','removeLayerMember','addLayerGroup','removeLayerGroup'].includes(command.cmd))
      hostState.update(s => applyMockCommand(s, command));
  },
} };
window.getLayersState = () => get(hostState);
window.unresolveLayerMember = () => hostState.update(s => normalizeHostState({ ...s, rack: { ...s.rack,
  layerGroups: s.rack.layerGroups.map(g => ({ ...g, members: g.members.map((m,i) => i === 1 ? { ...m, resolved: false } : m) })),
} }));
mount(InstrumentHostView, { target: document.getElementById('host') });
