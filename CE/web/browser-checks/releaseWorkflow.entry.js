import { mount } from 'svelte';
import { get } from 'svelte/store';
import Harness from './ReleaseWorkflowHarness.svelte';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { updateControlProperty, selectedControl } from '../src/CE_Application/stores/controls.js';
import { midiControlBindingFrom } from '../src/CE_Application/utils/midiControlBindings.js';
import * as device from '../src/CE_Application/stores/deviceProfiles.js';
import { previewModeEnabled } from '../src/CE_Application/stores/interactionPreview.js';
import { displayTabRequest } from '../src/CE_Application/stores/displayTab.js';
import { deviceParameterValues } from '../src/CE_Application/stores/deviceParameterValues.js';
import { setOutboundMidiFilter } from '../src/CE_Application/scripting/midiFilters.js';

const emitted = [];
const listeners = new Map();
window.__JUCE__ = { backend: {
  emitEvent: (name, payload) => emitted.push({ name, payload }),
  addEventListener: (name, callback) => {
    const entries = listeners.get(name) ?? new Set();
    entries.add(callback); listeners.set(name, entries);
    return { name, callback };
  },
  removeEventListener: (token) => listeners.get(token?.name)?.delete(token.callback),
} };

const panel = createPanel('First-use check');
const control = createControl('Knob');
panel.controls.push(control);
panels.set([panel]); activePanelId.set(panel.id);
const id = control._children.Core.id;
selectedComponentIds.set(new Set([id]));
device.midiDestinations.set([
  { id: 'previewOnly', type: 'previewOnly', name: 'Preview Only' },
  { id: 'test-output', type: 'hardwareOutput', name: 'Test Synth Output' },
]);
device.midiInputs.set([
  { id: 'none', type: 'none', name: 'No MIDI Input' },
  { id: 'test-input', type: 'hardwareInput', name: 'Test Synth Input' },
]);

mount(Harness, { target: document.getElementById('host') });
window.__workflow = {
  emitted,
  control: () => get(selectedControl),
  prepareToolbar: () => {
    updateControlProperty(id, 'DeviceBindings.bindings', []);
    device.profileParameters.update((all) => ({ ...all, [get(device.deviceRoleMappings).mainSynth.profileId]: [
      { id: 'cutoff', name: 'Cutoff', type: 'integer', range: { min: 0, max: 127 }, default: 64 },
    ] }));
  },
  bind: (overrides = {}) => updateControlProperty(id, 'DeviceBindings', {
    _type: 'DeviceBindings', enabled: true,
    bindings: [{ ...midiControlBindingFrom({ controller: 74 }), ...overrides }],
  }),
  enabled: (value) => updateControlProperty(id, 'DeviceBindings.enabled', value),
  preview: (value) => previewModeEnabled.set(value),
  input: (hex, deviceRole = 'mainSynth') => device.latestMidiInputMessage.set({ hex, deviceRole }),
  reply: (name, payload) => { for (const callback of listeners.get(name) ?? []) callback(payload); },
  mapping: (role = 'mainSynth') => get(device.deviceRoleMappings)[role],
  unmappedDevice: () => device.deviceRoleMappings.update((all) => ({ ...all, primary: { ...all.primary, profileId: '' } })),
  customDevice: () => {
    device.deviceRoleMappings.update((all) => ({ ...all, primary: { ...all.mainSynth, role: 'primary', profileId: 'custom-profile' } }));
    deviceParameterValues.set({ primary: { cutoff: 73 } });
    device.selectedDeviceProfileId.set('unrelated-profile');
  },
  values: () => get(deviceParameterValues),
  dropMidi: (drop) => setOutboundMidiFilter(drop ? () => null : null),
  requestedTab: () => get(displayTabRequest)?.tab,
};
