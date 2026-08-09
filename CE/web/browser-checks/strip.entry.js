import { mount } from 'svelte';
import StripHarness from './StripHarness.svelte';
import { midiMonitorEvents } from '../src/CE_Application/stores/deviceProfiles.js';

window.__JUCE__ = { backend: { emitEvent() {}, addEventListener() {} } };
const t = (ms) => new Date(Date.UTC(2026, 7, 9, 18, 4, 5, ms)).toISOString();
midiMonitorEvents.set([
  { timestamp: t(12), direction: 'out', deviceRole: 'Roland GAIA SH-01', messageType: 'cc', semantic: 'a', hex: 'B0 07 40', status: 'sent' },
  { timestamp: t(48), direction: 'in', deviceRole: 'Roland GAIA SH-01', messageType: 'cc', semantic: 'b', hex: 'B0 4A 5A', status: 'received' },
  { timestamp: t(96), direction: 'out', deviceRole: 'Elektron Digitakt', messageType: 'cc', semantic: 'c', hex: 'B9 30 0C', status: 'Not sent: unresolved profile' },
]);
window.__openedTab = null;
mount(StripHarness, { target: document.getElementById('host'), props: { onopentab: (id) => { window.__openedTab = id; } } });
