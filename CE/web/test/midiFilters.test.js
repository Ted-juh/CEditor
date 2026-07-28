// midiFilters.test.js — ce.midi.interceptIn / interceptOut / feed / route, and sendNote's duration.
//
// ce.core.intercept filters a MODEL PATH; these filter the WIRE, and the difference is where they
// sit. Inbound reaches the panel's bindings, the note input and the transport long before any
// script sees it; outbound leaves from a control's own binding as often as from a sendCC. So the
// filters are installed at the app's two choke points, and these tests drive those choke points
// rather than the scripting API, because that placement IS the feature.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  setInboundMidiFilter, setOutboundMidiFilter, clearMidiFilters,
  filterInboundMidi, filterOutboundMidi, hasMidiFilters,
} from '../src/CE_Application/scripting/midiFilters.js';

test('with nothing registered a message passes through untouched', () => {
  clearMidiFilters();
  assert.equal(hasMidiFilters(), false);
  const payload = { hex: '90 3C 64' };
  assert.equal(filterInboundMidi(payload), payload, 'the same object, not a copy — no work done');
  assert.equal(filterOutboundMidi(payload), payload);
});

test('a filter can rewrite a message', () => {
  clearMidiFilters();
  // A velocity curve: the thing you cannot do from a properties panel, whose bindings are fixed.
  setInboundMidiFilter((p) => ({ ...p, hex: p.hex.replace('64', '7F') }));
  assert.equal(filterInboundMidi({ hex: '90 3C 64' }).hex, '90 3C 7F');
});

test('a filter can swallow a message', () => {
  clearMidiFilters();
  setOutboundMidiFilter(() => null);
  assert.equal(filterOutboundMidi({ hex: 'B0 4A 40' }), null, 'null means do not send');
});

test('a throwing filter passes the message through rather than dropping it', () => {
  // The rule that matters most here: a broken script must not be able to silence a synth. Failing
  // closed would turn a typo into "my hardware stopped responding", which is unattributable.
  clearMidiFilters();
  setInboundMidiFilter(() => { throw new Error('boom'); });
  const payload = { hex: '90 3C 64' };
  assert.equal(filterInboundMidi(payload), payload);
});

test('the two directions are independent', () => {
  clearMidiFilters();
  setInboundMidiFilter(() => null);
  assert.equal(filterInboundMidi({ hex: '90 3C 64' }), null);
  assert.deepEqual(filterOutboundMidi({ hex: '90 3C 64' }), { hex: '90 3C 64' },
    'an inbound filter has no say over what the panel sends');
  clearMidiFilters();
  assert.equal(hasMidiFilters(), false);
});

/* ------------------------------------------------------- through the scripting API */

test('the runtime installs and removes its chains as scripts register', async () => {
  const rt = await import('../src/CE_Application/scripting/panelRuntime.js');
  rt.resetScriptStateForTesting();
  clearMidiFilters();
  assert.equal(hasMidiFilters(), false, 'a fresh panel filters nothing');

  const api = rt.scriptApiForTesting('', 'wire');
  api.interceptMidiIn((bytes) => bytes.map((b, i) => (i === 2 ? 127 : b)));
  assert.equal(hasMidiFilters(), true, 'registering installs the chain behind the choke point');
  assert.equal(filterInboundMidi({ hex: '90 3C 64' }).hex, '90 3C 7F', 'and it acts on real payloads');

  rt.resetScriptStateForTesting();
  assert.equal(hasMidiFilters(), false, 'tearing the panel down takes the chain with it');
});

test('returning false from a script filter swallows the message', async () => {
  const rt = await import('../src/CE_Application/scripting/panelRuntime.js');
  rt.resetScriptStateForTesting();
  const api = rt.scriptApiForTesting('', 'wire');
  api.interceptMidiOut((bytes) => (bytes[0] === 0xB0 ? false : bytes));
  assert.equal(filterOutboundMidi({ hex: 'B0 4A 40' }), null, 'CC blocked');
  assert.deepEqual(filterOutboundMidi({ hex: '90 3C 64' }).hex, '90 3C 64', 'notes still go');
  rt.resetScriptStateForTesting();
});

test('returning nothing means no opinion, not "drop it"', async () => {
  const rt = await import('../src/CE_Application/scripting/panelRuntime.js');
  rt.resetScriptStateForTesting();
  const api = rt.scriptApiForTesting('', 'wire');
  api.interceptMidiIn(() => { /* looked, said nothing */ });
  assert.equal(filterInboundMidi({ hex: '90 3C 64' }).hex, '90 3C 64');
  rt.resetScriptStateForTesting();
});

test('one filter per script per direction — registering again replaces it', async () => {
  const rt = await import('../src/CE_Application/scripting/panelRuntime.js');
  rt.resetScriptStateForTesting();
  const api = rt.scriptApiForTesting('', 'wire');
  api.interceptMidiIn(() => [0x90, 0x3C, 0x01]);
  api.interceptMidiIn(() => [0x90, 0x3C, 0x02]);
  assert.equal(filterInboundMidi({ hex: '90 3C 64' }).hex, '90 3C 02',
    'the second registration replaces the first rather than stacking beside it');
  rt.resetScriptStateForTesting();
});
