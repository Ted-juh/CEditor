import { mount } from 'svelte';
import MidiHarness from './MidiHarness.svelte';
import { midiDestinations, midiInputs, deviceProfiles } from '../src/CE_Application/stores/deviceProfiles.js';

// Stand in for the JUCE backend so the populated state can be seen. The real one answers
// listMidiDestinations/listMidiInputs with the same shapes; here the reply is simply pre-loaded.
if (new URLSearchParams(location.search).get('ports') === '1') {
  window.__JUCE__ = { backend: { emitEvent() {}, addEventListener() {} } };
  midiDestinations.set([
    { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' },
    { type: 'none', id: 'none', name: 'Disabled' },
    { type: 'hardwareOutput', id: 'out-1', name: 'Roland GAIA SH-01', canSend: true },
    { type: 'hardwareOutput', id: 'out-2', name: 'USB MIDI Interface Port 2', canSend: true },
  ]);
  midiInputs.set([
    { type: 'none', id: 'none', name: 'No MIDI Input' },
    { type: 'hardwareInput', id: 'in-1', name: 'Roland GAIA SH-01' },
  ]);
  deviceProfiles.set([{ id: 'test-cc-synth', name: 'Test CC Synth' }, { id: 'roland.gaia', name: 'Roland GAIA SH-01' }]);
}
mount(MidiHarness, { target: document.getElementById('host') });
