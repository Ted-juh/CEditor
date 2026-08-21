import { mount } from 'svelte';
import MidiHarness from './MidiHarness.svelte';
import { midiDestinations, midiInputs, deviceProfiles, deviceRoleMappings } from '../src/CE_Application/stores/deviceProfiles.js';
import { panels } from '../src/CE_Application/stores/panels.js';
import { get } from 'svelte/store';
import { createControl } from '../src/CE_Application/models/componentTypes.js';

// Stand in for the JUCE backend so the populated state can be seen. The real one answers
// listMidiDestinations/listMidiInputs with the same shapes; here the reply is simply pre-loaded.
if (new URLSearchParams(location.search).get('ports') === '1') {
  window.__JUCE__ = { backend: { emitEvent() {}, addEventListener() {} } };
  midiDestinations.set([
    { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' },
    { type: 'none', id: 'none', name: 'Disabled' },
    { type: 'hardwareOutput', id: 'out-1', name: 'Roland GAIA SH-01', canSend: true },
    { type: 'hardwareOutput', id: 'out-2', name: 'Elektron Digitakt', canSend: true },
  ]);
  midiInputs.set([
    { type: 'none', id: 'none', name: 'No MIDI Input' },
    { type: 'hardwareInput', id: 'in-1', name: 'Roland GAIA SH-01' },
  ]);
  deviceProfiles.set([{ id: 'test-cc-synth', name: 'Test CC Synth' }, { id: 'roland.gaia', name: 'Roland GAIA SH-01' }]);

  // mainSynth is configured and pointed at hardware; `primary` is what an open panel binds to and
  // nothing has set up — the case that used to be invisible.
  deviceRoleMappings.set({
    mainSynth: {
      role: 'mainSynth', profileId: 'test-cc-synth',
      midiDestination: { type: 'hardwareOutput', id: 'out-2', name: 'Elektron Digitakt' },
      midiInput: { type: 'none', id: 'none', name: 'No MIDI Input' },
      syncDirection: 'pull',
    },
  });
  const knob = createControl('Knob', { Core: { id: 'k1' } });
  knob._children.DeviceBindings.bindings = [{ deviceRole: 'primary', parameterId: 'osc.pitch', port: 'value' }];
  const knob2 = createControl('Knob', { Core: { id: 'k2' } });
  knob2._children.DeviceBindings.bindings = [{ deviceRole: 'primary', parameterId: 'osc.wave', port: 'value' }];
  const knob3 = createControl('Knob', { Core: { id: 'k3' } });
  knob3._children.DeviceBindings.bindings = [{ deviceRole: 'drums', parameterId: 'kick.tune', port: 'value' }];
  panels.set([{ id: 'p1', name: 'GAIA', controls: [knob, knob2, knob3] }]);
  window.__roleOf = (id) => {
    const panel = get(panels)[0];
    return panel.controls.find((c) => c._children.Core.id === id)?._children.DeviceBindings.bindings[0].deviceRole;
  };
}
// Stand in for the instrument answering, so the three outcomes can be seen without hardware.
import { latestDeviceIdentityReply, latestDeviceRequestTimedOut } from '../src/CE_Application/stores/deviceProfiles.js';
window.__answer = {
  ok: (role) => latestDeviceIdentityReply.set({ deviceRole: role, matched: true, manufacturerId: '41', familyCode: '00 41', modelNumber: '02 00', revision: '00 01 00 00' }),
  wrong: (role) => latestDeviceIdentityReply.set({ deviceRole: role, matched: false, manufacturerId: '00 20 29' }),
  silence: (role) => latestDeviceRequestTimedOut.set({ deviceRole: role }),
};
mount(MidiHarness, { target: document.getElementById('host') });
