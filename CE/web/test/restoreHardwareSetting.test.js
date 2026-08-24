// restoreHardwareSetting.test.js — the editor half of Total Recall S2.
//
// The C++ half is a pure function with its own test (CE/tests/RestorePolicyTests.cpp). What cannot
// be tested there is the thing most likely to go wrong: the editor and the plugin disagreeing about
// what the setting MEANS. The editor writes a string into a panel document; a compiled plugin reads
// it back weeks later with no way to ask what was intended.
//
// So this pins both ends of that string — the values the editor can emit, and the values
// Player/RestorePolicy.h parses — and asserts they are the same set with the same default. A
// mismatch is silent in the worst way: an exported plugin that quietly falls back to Ask when the
// author chose Always, or worse the other way round.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const POLICY_HEADER = readFileSync(join(REPO, 'CE/src/Player/RestorePolicy.h'), 'utf8');
const EXPORT_TAB = readFileSync(
  join(REPO, 'CE/web/src/CE_Application/panels/PanelCardContent.svelte'), 'utf8');

const MODES = ['ask', 'always', 'never'];

test('a new panel defaults to asking', () => {
  // Not "always". A plugin that blasts SysEx at whatever is plugged in whenever a project opens is
  // a bad citizen — the device may be a different synth today, or the same synth mid-take.
  assert.equal(createPanel('x').exportSettings.restoreHardware, 'ask');
});

test('the setting survives a save and reopen', () => {
  const panel = createPanel('x');
  panel.exportSettings = { ...panel.exportSettings, restoreHardware: 'always' };
  const reopened = deserializePanel(serializePanel(panel), null, 'x');
  assert.equal(reopened.exportSettings.restoreHardware, 'always');
});

test('a panel saved before the setting existed still opens, and reads as ask', () => {
  // The migration case. Such a panel pushed nothing at all, so falling back to ask is strictly more
  // than it did and never less welcome — and the C++ parse agrees, which the next test checks.
  const document = JSON.parse(serializePanel(createPanel('x')));
  delete document.exportSettings.restoreHardware;
  const reopened = deserializePanel(JSON.stringify(document), null, 'x');
  assert.ok(['ask', undefined].includes(reopened.exportSettings.restoreHardware),
    'an absent setting must not become always by accident');
});

test('the editor offers exactly the modes the plugin can parse', () => {
  // The cross-language pin. RestorePolicy.h reads the string; this file writes it. Two lists that
  // are allowed to drift are two lists that will.
  for (const mode of MODES) {
    assert.ok(POLICY_HEADER.includes(`"${mode}"`) || mode === 'ask',
      `RestorePolicy.h does not parse "${mode}"`);
    assert.ok(EXPORT_TAB.includes(`['${mode}',`), `the Export tab does not offer "${mode}"`);
  }
});

test('both sides fall back to ask on anything they do not recognise', () => {
  // C++: parseRestorePolicy returns Ask for "", "ask" and anything unrecognised.
  assert.match(POLICY_HEADER, /return RestorePolicy::Ask;\s*\/\/ including "", "ask", and anything unrecognised/);
  // JS: the Export tab's derived mode, same rule.
  assert.match(EXPORT_TAB, /\['ask', 'always', 'never'\]\.includes\(exportSettings\.restoreHardware\)/);
  assert.match(EXPORT_TAB, /: 'ask'/);
});

test('the exported document carries the setting to the plugin', () => {
  // The plugin reads exportSettings off the baked .cepanel — if serialization dropped it, the
  // author's choice would silently become the default in every exported plugin.
  const panel = createPanel('x');
  panel.exportSettings = { ...panel.exportSettings, restoreHardware: 'never' };
  const document = JSON.parse(serializePanel(panel));
  assert.equal(document.exportSettings.restoreHardware, 'never');
});

test('the Export tab says what each mode will do', () => {
  // A three-way switch whose options are one word each is a switch nobody can set correctly. Each
  // mode has to state its consequence, and "always" in particular has to say it sends unprompted.
  assert.match(EXPORT_TAB, /restoreHardwareMode === 'always'/);
  assert.match(EXPORT_TAB, /restoreHardwareMode === 'never'/);
  assert.match(EXPORT_TAB, /with no prompt/);
});
