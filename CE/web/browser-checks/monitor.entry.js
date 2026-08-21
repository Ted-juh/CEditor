import { mount } from 'svelte';
import MonitorHarness from './MonitorHarness.svelte';
import { midiMonitorEvents } from '../src/CE_Application/stores/deviceProfiles.js';

// Traffic shaped exactly as DeviceProfileService::appendMonitorEvent writes it.
window.__JUCE__ = { backend: { emitEvent() {}, addEventListener() {} } };
const t = (ms) => new Date(Date.UTC(2026, 7, 9, 18, 4, 5, ms)).toISOString();
const ev = (ms, direction, deviceRole, messageType, semantic, hex, status) =>
  ({ timestamp: t(ms), direction, deviceRole, messageType, semantic, hex, status });

midiMonitorEvents.set([
  ev(12,  'out', 'Roland GAIA SH-01', 'cc',    'common.patchLevel = 64',      'B0 07 40', 'sent'),
  ev(48,  'out', 'Roland GAIA SH-01', 'cc',    'tone1.filter.cutoff = 90',    'B0 4A 5A', 'sent'),
  ev(96,  'in',  'Roland GAIA SH-01', 'cc',    'tone1.filter.cutoff = 90',    'B0 4A 5A', 'echo ignored'),
  ev(140, 'out', 'Roland GAIA SH-01', 'sysex', 'common.patchName request',    'F0 41 10 00 00 00 41 11 F7', 'sent'),
  ev(232, 'in',  'Roland GAIA SH-01', 'sysex', 'patch dump (128 bytes)',      'F0 41 10 ... F7', 'received'),
  ev(310, 'out', 'Elektron Digitakt', 'cc',    'kick.tune = 12',              'B9 30 0C', 'Not sent: unresolved profile for Elektron Digitakt'),
  ev(388, 'out', 'Roland GAIA SH-01', 'cc',    'tone1.lfo.rate = 31',         'B0 4C 1F', 'sent'),
]);
mount(MonitorHarness, { target: document.getElementById('host') });
