import { mount } from 'svelte';
import { get } from 'svelte/store';
import InstrumentHostView from '../src/CE_Application/sections/InstrumentHostView.svelte';
import { hostState, normalizeHostState, mockHostState, applyMockCommand, hostParameters,
  normalizeHostParameters, hostSurfaceLayout, normalizeSurfaceLayout, mockSurfaceLayout,
  hostAudioDevices, normalizeAudioDevices, hostSurface, normalizeHostSurface, hostMidiActivity,
} from '../src/CE_Application/stores/instrumentHost.js';

window.targetCommands = [];
window.deferParameters = false;
const state = mockHostState();
const fx = id => ({ effectId: id, pluginCeId: 'delay', pluginName: 'Delay', hasProcessor: true });
state.rack.parts = ['Massive X', 'Spire', 'Spire'].map((pluginName, i) => ({
  ...state.rack.parts[0], partId: `part-${i}`, pluginName, pluginCeId: `synth-${i}`,
  effects: [fx(`fx-${i}-0`), fx(`fx-${i}-1`)],
}));
state.instruments = state.rack.parts.map(p => ({ ceId: p.pluginCeId, name: p.pluginName,
  snapshotUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#243b52"/><circle cx="50" cy="50" r="25" fill="#69afc8"/></svg>'),
}));
state.rack.focusedPartId = 'part-0';
state.rack.masterEffects = [fx('master-fx')];
state.rack.returns = [{ returnId: 'space', name: 'Space', level: 1, effects: [fx('return-fx')] }];
state.rack.layerGroups = [{ layerGroupId: 'layer', name: 'Blend', enabled: true, source: 'velocity', allocation: 'all',
  members: state.rack.parts.map(p => ({ partId: p.partId, partName: p.pluginName, minimum: 0, maximum: 1, crossfade: .1, resolved: true })) }];
hostState.set(normalizeHostState(state));
hostSurfaceLayout.set(normalizeSurfaceLayout(mockSurfaceLayout()));
window.deliverParameters = partId => hostParameters.set(normalizeHostParameters({ partId,
  parameters: [{ id: 'cutoff', name: `Cutoff for ${partId}`, value: .5 }] }));
window.__JUCE__ = { backend: { addEventListener() { return 1; }, removeEventListener() {},
  emitEvent(event, command) {
    if (event !== 'instrumentHost') return;
    window.targetCommands.push(command);
    if (command.cmd === 'focusPart') hostState.update(s => applyMockCommand(s, command));
    if (command.cmd === 'getParameters' && !window.deferParameters) window.deliverParameters(command.partId);
  },
} };
window.getTargetState = () => get(hostState);
window.setPartIssueScenario = (scenario) => {
  hostMidiActivity.update(a => ({ ...a, seq: a.seq + 1, note: -1, value: 0 }));
  hostState.update(s => normalizeHostState({ ...s, reliability: {}, rack: { ...s.rack,
    focusedPartId: 'part-0', parts: s.rack.parts.map((p, i) => ({ ...p,
      enabled: scenario !== 'off' || i !== 0, mute: false, solo: scenario === 'solo' && i === 1, volume: scenario === 'zero' && i === 0 ? 0 : 1,
      hasInstrument: scenario !== 'missing' || i !== 0, unresolved: scenario === 'missing' && i === 0,
      hardware: scenario === 'output' && i === 0, midiOutError: scenario === 'output' && i === 0 ? 'MIDI output unavailable: USB Synth' : '',
      midiSourcePartId: '', channel: 0, keyLow: scenario === 'zone' && i === 0 ? 60 : 0,
      keyHigh: 127, velocityLow: 1, velocityHigh: 127,
    })),
  } }));
};
window.sendIssueNote = (note = 48, value = 100) => hostMidiActivity.update(a => ({
  seq: a.seq + 1, note, value, channel: 1, device: 'USB Keys', cc: -1,
}));
window.setStagePreload = (preloadState) => hostState.update(s => ({ ...s, performance: {
  ...s.performance, setlist: { ...s.performance.setlist, currentIndex: -1,
    items: [{ itemId: 'next-song', name: 'Evening set', rackRecordId: preloadState === 'scene' ? '' : 'next-rack', sceneName: 'Full rack' }],
    preloads: preloadState === 'none' || preloadState === 'scene' ? [] : [{ recordId: 'next-rack', state: preloadState,
      total: 3, ready: preloadState === 'ready' ? 3 : 2, failed: preloadState === 'degraded' ? 1 : 0,
      error: preloadState === 'degraded' ? 'Spire could not be loaded.' : '' }],
  },
} }));
window.setStageController = (state = 'searching', ownsAudio = true) => {
  hostSurfaceLayout.set(normalizeSurfaceLayout({ profileId: 'user', displayName: 'My fader controller' }));
  hostAudioDevices.set(normalizeAudioDevices({ midiInputs: [{ id: 'usb', name: 'USB MIDI keyboard', enabled: true }] }));
  hostSurface.set(normalizeHostSurface({ state, device: state === 'searching' ? '' : 'CTRL49' }));
  hostState.update(s => ({ ...s, audio: { ...s.audio, enabled: ownsAudio } }));
};
window.mutateTargets = action => hostState.update(s => normalizeHostState({ ...s, rack: { ...s.rack,
  parts: s.rack.parts.map(p => p.partId !== 'part-2' ? p : { ...p,
    effects: action === 'remove' ? [] : action === 'reorder' ? [...p.effects].reverse() : p.effects,
    volume: .6,
  }),
} }));
mount(InstrumentHostView, { target: document.getElementById('host') });
