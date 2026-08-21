// midiSettings.test.js — the MIDI page, and the reason it had to exist.
//
// The MIDI plumbing was never missing. DeviceProfileServiceMidiIO enumerates real ports with
// juce::MidiOutput::getAvailableDevices(), opens them and sends. What was missing was any way to
// reach it: three unlabelled dropdowns in the Device tab's toolbar, which did not work there
// either. initDeviceProfileBridge registers the listener for the port-list reply and never asks for
// the list; only Player.svelte ever called listMidiDestinations()/listMidiInputs(). So in the editor
// those dropdowns sat on their defaults on a desktop build with a synth plugged in, and the whole
// feature read as absent.
//
// Two things are worth pinning. That the page tells the truth when it cannot see any ports — the
// browser case is not "no MIDI devices found", it is "there is no backend here to ask" — and that
// the port controls carry names, since three anonymous selects in a row is most of what made this
// look like it did not exist.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';

import MidiSettings from '../src/CE_Application/settings/MidiSettings.svelte';
import SettingsView from '../src/CE_Application/editor/SettingsView.svelte';
import { readText } from './support/readText.mjs';
import { fileURLToPath } from 'node:url';

test('with no audio backend, the page says so instead of blaming the hardware', () => {
  // Server-rendered, there is no window.__JUCE__ — the same situation as any browser build, where
  // every bridge call returns immediately and no port can ever be listed however much hardware is
  // attached. Reporting "no MIDI devices found" there would be a claim about the user's studio.
  const { body } = render(MidiSettings, { props: {} });

  assert.match(body, /only available in the desktop app/i,
    'the browser case must be explained, not reported as missing hardware');
  assert.doesNotMatch(body, /no MIDI hardware found/i,
    'claimed the hardware was missing when the truth is nothing was asked');
});

test('the MIDI section is reachable from the settings sidebar', () => {
  // The point of the exercise: somewhere a person looking for MIDI would actually look.
  const { body } = render(SettingsView, { props: {} });
  assert.match(body, />MIDI</, 'no MIDI entry in the settings sidebar');
});

test('every MIDI port control has a name', () => {
  // Both here and in the Device tab. A select whose only clue is its current value tells you
  // nothing about what it selects, and there are three of them side by side.
  const deviceTab = readText(fileURLToPath(new URL('../src/CE_Application/components/ParameterBrowserTab.svelte', import.meta.url)));
  for (const label of ['MIDI output', 'MIDI input', 'Device profile']) {
    assert.ok(deviceTab.includes(`aria-label="${label}"`), `the Device tab's ${label} select is still unlabelled`);
  }

  // Read the settings page as source rather than as output: without a backend it renders the
  // explanation instead of the selects, so the labels are not in the markup to be found.
  const page = readText(fileURLToPath(new URL('../src/CE_Application/settings/MidiSettings.svelte', import.meta.url)));
  for (const label of ['MIDI output', 'MIDI input', 'Device profile']) {
    assert.ok(page.includes(`aria-label="${label}"`), `the MIDI page's ${label} select is unlabelled`);
  }
  assert.ok(page.includes('Send To') && page.includes('Listen To'),
    'the MIDI page does not name which direction each port is');
});
