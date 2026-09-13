import { mount } from 'svelte';
import { get } from 'svelte/store';
import InstrumentHostView from '../src/CE_Application/sections/InstrumentHostView.svelte';
import { hostState, hostLibrary, hostLibraryLoad, normalizeLibraryLoad, normalizeHostState, normalizeHostLibrary, normalizeLibraryQuery, mockHostState } from '../src/CE_Application/stores/instrumentHost.js';

// This harness records commands without opening plug-ins or touching the user's library.
window.soundCommands = [];
const listeners = new Map();
window.soundEvent = (name, payload) => { for (const callback of listeners.get(name) ?? []) callback(payload); };
const plugins = ['Massive X', 'Vanguard', 'Spire'];
const records = Array.from({ length: 7854 }, (_, index) => ({
  recordId: `preset-${index}`, type: 'preset', sourceType: 'programList', factory: true,
  name: index === 0 ? 'Abandoned' : `Preset ${String(index).padStart(4, '0')}`,
  instrument: plugins[index % 3], targetCeId: `synth-${index % 3}`, category: 'Pad', available: true,
  favourite: index % 3 === 0,
}));
records.push({ recordId: 'effect', type: 'preset', sourceType: 'vstpreset', factory: true,
  name: 'Room', instrument: 'Reverb', targetCeId: 'effect', isEffect: true, available: true });
let query = normalizeLibraryQuery({});
let scanning = false;
let updateFinished = false;
let scanReport = [];
let paths = ['D:/Sounds/Presets'];
function publishLibrary() {
  const rows = records.filter(r => (!query.text || r.name.toLowerCase().includes(query.text.toLowerCase()))
    && (!query.type || r.type === query.type) && (!query.favouritesOnly || r.favourite)
    && (!query.facets.instruments.include.length || query.facets.instruments.include.includes(r.instrument)));
  hostLibrary.set(normalizeHostLibrary({ records: rows, request: query, scanning, updateFinished, scanReport, paths,
    duplicates: [{ keyRecordId: 'preset-0', name: 'Abandoned', recordIds: ['preset-0', 'preset-3'], identical: true }],
    counts: { total: records.length, matched: rows.length, presets: records.length },
    facets: { instruments: [...plugins, 'Reverb'].map(value => ({ value, count: 10 })) },
  }));
}
const initial = mockHostState();
initial.rack.parts = plugins.map((pluginName, i) => ({ ...initial.rack.parts[0],
  partId: `part-${i}`, pluginName, pluginCeId: `synth-${i}`, hasInstrument: true, effects: [],
}));
initial.rack.focusedPartId = 'part-0';
hostState.set(normalizeHostState(initial));
window.__JUCE__ = { backend: {
  addEventListener(name, callback) { listeners.set(name, [...(listeners.get(name) ?? []), callback]); return callback; }, removeEventListener() {},
  emitEvent(event, command) {
    if (event !== 'instrumentHost') return;
    window.soundCommands.push(command);
    if (command.cmd === 'getLibrary') { query = normalizeLibraryQuery(command); publishLibrary(); }
    if (command.cmd === 'scanLibrary') { scanning = true; updateFinished = false; publishLibrary(); }
    if (command.cmd === 'removeLibraryPath') { paths = paths.filter(path => path !== command.path); publishLibrary(); }
    if (command.cmd === 'loadLibraryRecord') hostLibraryLoad.set(normalizeLibraryLoad({
      recordId: command.recordId, partId: command.partId, phase: 'loading',
      name: records.find(r => r.recordId === command.recordId)?.name,
      message: 'Loading selected preset…',
    }));
    if (command.cmd === 'focusPart') hostState.update(state => normalizeHostState({ ...state,
      rack: { ...state.rack, focusedPartId: command.partId } }));
    if (command.cmd === 'setPresetAudition') hostState.update(state => normalizeHostState({ ...state,
      rack: { ...state.rack, presetAudition: { ...state.rack.presetAudition, ...command } } }));
  },
} };
publishLibrary();
window.getSoundsState = () => get(hostState);
window.setEditHistory = fields => hostState.update(state => normalizeHostState({ ...state, editHistory: fields }));
window.setSoundsComparison = active => hostState.update(state => normalizeHostState({ ...state,
  rack: { ...state.rack, soundComparison: { active, partId: 'part-1', count: 2, index: 0,
    recordId: 'preset-1', name: 'Preset 0001', originalName: 'Original' } } }));
window.setSoundsMorph = () => hostState.update(state => normalizeHostState({ ...state,
  rack: { ...state.rack, parts: state.rack.parts.map(part => part.partId === 'part-1'
    ? { ...part, morph: { recordIdA: 'a', recordIdB: 'b', nameA: 'A', nameB: 'B', amount: .5, live: true } } : part) } }));
window.finishSoundsLoad = (phase, message) => hostLibraryLoad.update(result => ({ ...result, phase, message }));
window.finishSoundsUpdate = () => {
  scanning = false; updateFinished = true;
  scanReport = [{ name: 'Massive X', kind: 'Instrument', count: 4139, files: 4139 },
    { name: 'Test Synth', kind: 'Instrument', count: 0, unavailable: 2,
      reason: 'Preset files are missing. Add their folder and update the library.' }];
  publishLibrary();
};
mount(InstrumentHostView, { target: document.getElementById('host') });
