// deviceWorkbenchTab.test.js — the four MIDI-workbench gaps, and the wiring they depend on.
//
// `docs/midi-workbench.md` listed seven concrete GUI gaps. Three closed on their own; four stayed
// open because each was a store with nothing rendering it. `latestDeviceIdentityReply` is the clearest
// case — it has existed, been populated, and been invisible, so the app knew what it was talking to
// and never said.
//
// These tests are the useful half of what can be checked without a browser: that the component
// renders, that it reaches the real stores and actions rather than reimplementing them, and that
// the input validation actually rejects bad bytes. What they cannot check is that it LOOKS right,
// which is a QA-sheet-and-an-eye job like everything else visual here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { render } from 'svelte/server';

import DeviceWorkbenchTab from '../src/CE_Application/components/DeviceWorkbenchTab.svelte';
import { parseRawMidiHexText } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(ROOT, 'src/CE_Application/components/DeviceWorkbenchTab.svelte'), 'utf8');
const DISPLAY_PANEL = readFileSync(join(ROOT, 'src/CE_Application/panels/DisplayPanel.svelte'), 'utf8');

test('the tab renders, with a section for each gap it closes', () => {
  const { body } = render(DeviceWorkbenchTab, { props: {} });
  for (const heading of ['Ports', 'Identity', 'Send raw MIDI', 'Capture a dump']) {
    assert.ok(body.includes(heading), `the "${heading}" section did not render`);
  }
});

test('it uses the real stores and actions rather than its own copies', () => {
  // The failure this guards is a diagnostics panel that shows its own idea of the port list while
  // the app sends on another — which would make it worse than nothing, because you would trust it.
  for (const symbol of [
    'selectedMidiDestinationId', 'selectedMidiInputId',   // the same selection the Device tab drives
    'latestDeviceIdentityReply',                          // the store that existed with nothing rendering it
    'requestMidiCiDiscovery',
    'triggerRawMidiAction',                               // the filtered outbound path, not a raw emit
    'parseProfileDump',                                   // the same decoder the session uses
  ]) {
    assert.ok(SOURCE.includes(symbol), `the workbench should reach ${symbol}, not reimplement it`);
  }
});

test('raw send goes through the filtered path, so interceptMidiOut still sees it', () => {
  // bridge.js routes triggerRawMidiAction through filterOutboundMidi. Emitting the bridge event
  // directly would bypass every ce.midi.interceptOut filter a panel has installed — silently, and
  // only for messages sent from this screen.
  assert.ok(!/emitEvent\(\s*['"]triggerRawMidiAction/.test(SOURCE),
    'the workbench must not emit the bridge event itself; call triggerRawMidiAction');
});

test('hex input is validated before anything is sent', () => {
  // Validation is shared with the engine rather than hand-rolled here, so "what counts as a legal
  // message" has one answer. These assertions are really about that helper's contract, which the
  // component's disabled-state depends on.
  assert.ok(SOURCE.includes('parseRawMidiHexText'), 'validation should reuse the engine helper');
  assert.equal(parseRawMidiHexText('B0 4A 64').ok, true);
  assert.equal(parseRawMidiHexText('F0 41 10 F7').ok, true);
  assert.equal(parseRawMidiHexText('ZZ').ok, false, 'a non-hex token must not pass');
  assert.equal(parseRawMidiHexText('F0 41 10').ok, false, 'an unterminated SysEx must not pass');
});

test('the send button is disabled until the bytes parse', () => {
  assert.match(SOURCE, /disabled=\{!rawCheck\?\.ok\}/,
    'Send must be disabled while the hex is invalid — finding out from the synth tells you nothing');
  assert.match(SOURCE, /disabled=\{!dumpCheck\?\.ok\}/, 'Decode likewise');
});

test('it is registered as a tab, lazily, and is a legal tab id', () => {
  // DISPLAY_TAB_IDS is a sanitiser: a tab missing from it is dropped on restore, which is how
  // 'layers' once shipped as a tab that would not come back. Easy to repeat.
  assert.ok(/DISPLAY_TAB_IDS = new Set\(\[[^\]]*'ports'/.test(DISPLAY_PANEL),
    "'ports' must be in DISPLAY_TAB_IDS or the tab will not survive a reload");
  assert.ok(DISPLAY_PANEL.includes("ports: () => import('../components/DeviceWorkbenchTab.svelte')"),
    'the tab should be lazily loaded like its neighbours');
  assert.ok(/id: 'ports'/.test(DISPLAY_PANEL), 'and it needs an entry in the tab bar');
});

test('the icon is a per-icon import, not the lucide barrel', () => {
  // treeshake is off, so a barrel import pulls lucide's whole index in. That is what produced a
  // 5.8 MB chunk once; bundleHygiene.test.js guards the general case, this pins the new import.
  assert.ok(DISPLAY_PANEL.includes("from 'lucide-svelte/icons/plug-zap'"),
    'import the single icon, never the lucide-svelte barrel');
});
