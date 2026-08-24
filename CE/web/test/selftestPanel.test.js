// selftestPanel.test.js — the native-handler self-test panel is generated, so it has to stay generated.
//
// WHAT THIS FIXTURE IS FOR. `selftest.cepanel` carries one `onPanelReady` handler in every scripting
// language, each sending a unique CC (20 lua … 26 java). Export it, route the plugin's MIDI out to a
// monitor, load it, and the CCs that arrive are exactly which language runtimes work in the shipped
// plugin. It is the first thing anybody reaches for when checking the export against real hardware.
//
// WHY IT WENT STALE, and it is the same story as the AN1x panel with one extra twist. It had no
// freshness gate, so it fell several model fields behind — `exportClap`, `exportLv2`,
// `restoreHardware`, `panicShortcut`, `guides`, `layers` — and would have been exported for a
// hardware pass while describing a panel the model no longer produces.
//
// The twist is why nobody wrote the gate: `createPanel` mints a random `panelGuid` every call, so a
// naive comparison against a fresh build failed on every run. The fix is not a testing trick — the
// GUID is now pinned in the generator, because a fixture that mints a NEW plugin identity each time
// it is regenerated is wrong anyway. Re-exporting the self-test should update the same plugin rather
// than orphan the copy already installed in somebody's DAW.

import test from 'node:test';
import assert from 'node:assert/strict';

import { assertSameText, readText } from './support/readText.mjs';
import {
  SELFTEST_LANGUAGES, SELFTEST_PATH, serializeSelftestPanel,
} from '../../../tools/scripts/nativeHandlers/make-selftest-panel.mjs';

test('the committed self-test panel matches the generator', () => {
  assertSameText(readText(SELFTEST_PATH), serializeSelftestPanel(),
    'tools/scripts/nativeHandlers/selftest.cepanel is stale — run: node tools/scripts/nativeHandlers/make-selftest-panel.mjs',
    { actual: 'committed', expected: 'the generator' });
});

test('the plugin identity is pinned, which is what makes the gate possible at all', () => {
  // Two builds in a row must agree. If this ever regresses to a minted GUID the test above starts
  // failing on every run and somebody deletes it, which is how the file rotted the first time.
  assert.equal(
    JSON.parse(serializeSelftestPanel()).panelGuid,
    JSON.parse(serializeSelftestPanel()).panelGuid,
  );
  assert.match(JSON.parse(serializeSelftestPanel()).panelGuid, /^[0-9a-f-]{36}$/);
});

test('every language still has a handler, and every CC is distinct', () => {
  // The panel proves which runtimes work by which CCs arrive. Two languages sharing a CC would make
  // one of them invisible — the monitor shows the number, not the language.
  const panel = JSON.parse(serializeSelftestPanel());
  const scripts = panel.scripts ?? [];
  assert.deepEqual(scripts.map((s) => s.language).sort(), [...SELFTEST_LANGUAGES].sort());

  const ccs = scripts.map((s) => Number(String(s.source).match(/sendCC\(\s*\d+\s*,\s*(\d+)/)?.[1]));
  assert.ok(ccs.every(Number.isFinite), `every handler must send a CC, got ${ccs.join(',')}`);
  assert.equal(new Set(ccs).size, ccs.length, `CCs must be distinct, got ${ccs.join(',')}`);
});
