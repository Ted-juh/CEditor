/**
 * The exported Player's startup, in a real browser: what it tells the synth when the port opens,
 * and what it does with the values the plugin restores. See utils/playerStartup.js for the rules.
 *
 * `?restored=1` stands in for a reopened DAW project: the plugin sets window.__CE_PLAYER_SESSION__
 * before it loads the panel. The bridge is faked only as far as the Player uses it, and every event
 * the Player emits is recorded, which is how "nothing was sent" is checked.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import Player from '../src/Player.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';
import { panelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
import gaiaProfile from '../../profiles/test/roland-gaia-sh01.ceditor-device.json';

const restored = new URLSearchParams(location.search).get('restored') === '1';
window.__CE_PLAYER_SESSION__ = { restored };

const listeners = new Map();
const sent = [];
let nextToken = 1;
window.__JUCE__ = {
  backend: {
    emitEvent(name, payload) { sent.push({ name, payload: JSON.parse(JSON.stringify(payload ?? {})), at: performance.now() }); },
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Map());
      const token = nextToken++;
      listeners.get(name).set(token, fn);
      return token;
    },
    removeEventListener(token) { for (const map of listeners.values()) map.delete(token); },
  },
};
const fire = (name, payload) => { for (const fn of [...(listeners.get(name)?.values() ?? [])]) fn(payload); };

const ROLE = 'Roland GAIA SH-01';
const cutoff = createControl('Knob', { Core: { id: 'cutoff', name: 'tone1.filter.cutoff' }, Transform: { x: 20, y: 20, width: 60, height: 60 } });
cutoff._children.DeviceBindings = { bindings: [{ kind: 'deviceParameter', port: 'value', deviceRole: ROLE,
  parameterId: 'tone1.filter.cutoff', dryRun: false, feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 } }] };

const panelDocument = {
  name: 'startup check', width: 200, height: 120,
  // The generated GAIA panel names its role and profile this way; the Player must connect as it.
  requiredProfiles: [{ role: ROLE, profileId: 'roland-gaia-sh01', version: '*' }],
  controls: [cutoff],
  exportParameters: [{ id: 'tone1.filter.cutoff.value', label: 'tone1.filter.cutoff', controlName: 'tone1.filter.cutoff',
    path: 'tone1.filter.cutoff.value', min: 0, max: 127, defaultValue: 0, unit: '', midiCC: null, valueKind: 'float',
    deviceRole: ROLE, deviceParameterId: 'tone1.filter.cutoff' }],
};
profileSources.set({ 'roland-gaia-sh01': { profileId: 'roland-gaia-sh01', source: JSON.stringify(gaiaProfile), native: true } });

mount(Player, { target: document.getElementById('host') });

window.__startup = {
  load: () => fire('loadPanel', { panel: panelDocument }),
  // A GAIA on USB appears, as the bridge reports ports.
  plugIn: () => {
    fire('midiDestinationsListed', { destinations: [{ type: 'hardwareOutput', id: 'usb-gaia', name: 'GAIA' }] });
    fire('midiInputsListed', { inputs: [{ type: 'hardwareInput', id: 'usb-gaia-in', name: 'GAIA' }] });
  },
  fire,
  sent: () => sent,
  value: (id) => get(panelPreviewSessions)?.[id]?.valueOverride,
};
