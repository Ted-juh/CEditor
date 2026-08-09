/**
 * The Player following the instrument, in a real browser.
 *
 * Everything about the inbound index is unit-tested against the profile, but the wiring is not: an
 * $effect that builds the index from the profile source the Player fetches, and two message
 * handlers that hand a decoded value to the preview session. That glue only runs in a browser, with
 * a bridge, against a mounted panel — so nothing in `npm test` touches it. This does.
 *
 * The REAL profile, with all 793 parameters, because the point of the index is coverage. Not the
 * real generated GAIA panel, though: that file is 45MB, and bundling it made Vite chew a gigabyte
 * and never finish. What the panel has to supply is three bindings, and which parameters they name
 * is what carries the argument — a four-nibble one the old map had no address for, a three-nibble
 * one, and a u7 that also arrives as a CC.
 *
 * The bridge is faked only as far as the Player uses it — addEventListener returns a token,
 * removeEventListener takes one, emitEvent is recorded so the RQ1 read-back can be inspected.
 */
import { mount } from 'svelte';
import { get } from 'svelte/store';
import Player from '../src/Player.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';
import { panelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
import gaiaProfile from '../../profiles/test/roland-gaia-sh01.ceditor-device.json';

const listeners = new Map();
const sent = [];
let nextToken = 1;

window.__JUCE__ = {
  backend: {
    emitEvent(name, payload) { sent.push({ name, payload }); },
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Map());
      const token = nextToken++;
      listeners.get(name).set(token, fn);
      return token;
    },
    removeEventListener(token) {
      for (const map of listeners.values()) map.delete(token);
    },
  },
};

const fire = (name, payload) => {
  for (const fn of [...(listeners.get(name)?.values() ?? [])]) fn(payload);
};

// Bindings in the shape the generated GAIA panel writes them, scoped parameter ids and all.
function knob(id, parameterId, y) {
  const control = createControl('Knob', { Core: { id, name: id }, Transform: { x: 20, y, width: 60, height: 60 } });
  control._children.DeviceBindings = {
    bindings: [{
      kind: 'deviceParameter', port: 'value', deviceRole: 'Roland GAIA SH-01', parameterId,
      dryRun: false, feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
    }],
  };
  return control;
}

const panelDocument = {
  name: 'inbound check',
  width: 400,
  height: 300,
  controls: [
    knob('distortion1', 'distortion.parameter1', 20),   // 4 nibbles, 10 00 04 01
    knob('tempo', 'common.patchTempo', 100),            // 3 nibbles, 10 00 00 0D
    knob('cutoff', 'tone1.filter.cutoff', 180),         // u7, 10 00 01 0C, also CC 102
  ],
};

// What the Player would fetch over the bridge, under the profile id it defaults to.
profileSources.set({
  'roland-gaia': { profileId: 'roland-gaia', source: JSON.stringify(gaiaProfile), native: true },
});

mount(Player, { target: document.getElementById('host') });

window.__player = {
  load: () => fire('loadPanel', { panel: panelDocument }),
  cc: (hex) => fire('midiInputMessage', { messageType: 'cc', hex }),
  sysex: (hex) => fire('sysexInputMessage', { hex }),
  value: (controlId) => get(panelPreviewSessions)?.[controlId]?.valueOverride,
  bound: () => Object.keys(get(panelPreviewSessions) ?? {}).length,
  // Every RQ1 the read-back sent, as parameterId -> the byte count the request asks for. The size
  // is the last of the four size bytes, at offset 14 of the message.
  requests: () => Object.fromEntries(sent
    .filter((e) => e.name === 'triggerRawMidiAction' && String(e.payload?.actionId ?? '').startsWith('rq1_'))
    .map((e) => [String(e.payload.actionId).slice(4), parseInt(String(e.payload.message).trim().split(/\s+/)[14], 16)])),
};
