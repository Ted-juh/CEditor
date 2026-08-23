// vendoredJucePatches.test.js — the local modifications to vendored JUCE must not vanish.
//
// JUCE is vendored here as an install (see JUCE/VENDORED.md), and it carries one deliberate patch:
// juce_audio_plugin_client_VST3.cpp's getInterfaceId() consults a runtime identity before falling
// back to the compile-time defines, which is what lets one prebuilt player binary carry a per-panel
// VST3 FUID instead of every export needing a compiler.
//
// A patch inside a vendored tree has no diff to review and no upstream to conflict with. Drop in a
// new JUCE and it is simply gone — and gone quietly, because the guard is an `#if` that then never
// matches, so nothing fails to compile and nothing fails to link. The first symptom would be every
// exported panel reporting the same FUID to a DAW, which is the exact defect the compile-per-panel
// design existed to avoid, arriving silently at the far end of the pipeline.
//
// So the patch itself is the thing under test. This is the same shape as vendoredJuceHelpers.test.js
// next door, which guards the .gitignore rule that once dropped the JUCE binaries.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const WRAPPER = join(
  repoRoot,
  'JUCE/include/JUCE-8.0.7/modules/juce_audio_plugin_client/juce_audio_plugin_client_VST3.cpp',
);

const REAPPLY = 'Re-apply it — JUCE/VENDORED.md documents the patch and why it exists.';

test('the vendored JUCE VST3 wrapper still carries the sidecar-identity patch', () => {
  assert.ok(existsSync(WRAPPER), `the vendored JUCE VST3 wrapper is missing: ${WRAPPER}`);
  const source = readFileSync(WRAPPER, 'utf8');

  assert.ok(source.includes('Export/Vst3SidecarIdentity.h'),
    `the patch's include is gone from the JUCE VST3 wrapper. ${REAPPLY}`);
  assert.ok(source.includes('ceditor::vst3SidecarPluginCodes'),
    `getInterfaceId() no longer consults the runtime identity. ${REAPPLY}`);
  assert.ok(source.includes('CEDITOR_SIDECAR_IDENTITY'),
    `the patch's #if guard is gone. ${REAPPLY}`);
});

test('the patch stays behind its guard, so a stock build is unaffected', () => {
  // The point of the guard is that a build which does not define CEDITOR_SIDECAR_IDENTITY behaves
  // exactly as unmodified JUCE. If the call were ever hoisted out of the #if, every JUCE plugin
  // built from this tree would start reading files next to itself at factory time.
  const source = readFileSync(WRAPPER, 'utf8');
  const guarded = source.split('#if CEDITOR_SIDECAR_IDENTITY').slice(1)
    .map((section) => section.split('#endif')[0]);

  assert.equal(guarded.length, 2, 'expected exactly two guarded hunks: the include and the call');
  const callSites = source.split('ceditor::vst3SidecarPluginCodes').length - 1;
  const guardedCallSites = guarded.join('\n').split('ceditor::vst3SidecarPluginCodes').length - 1;
  assert.equal(callSites, guardedCallSites,
    'a call to the sidecar identity sits outside #if CEDITOR_SIDECAR_IDENTITY — a stock build would change behaviour');
});

test('the fallback to the compile-time defines is still there', () => {
  // Without a panel beside it — every development build — the patch must fall through to what JUCE
  // always did. If this line went, a source build would get a null identity rather than its own.
  const source = readFileSync(WRAPPER, 'utf8');
  assert.ok(
    source.includes('convertJucePluginId (JucePlugin_ManufacturerCode, JucePlugin_PluginCode, interfaceType)'),
    `getInterfaceId() lost its fallback to the compile-time codes. ${REAPPLY}`,
  );
});

test('JUCE/VENDORED.md records the patch', () => {
  // The test above proves the code is there; this proves someone can find out why. A patch nobody
  // can explain is one the next person deletes.
  const doc = join(repoRoot, 'JUCE/VENDORED.md');
  assert.ok(existsSync(doc), 'JUCE/VENDORED.md is missing — the vendored patch has no record');
  const text = readFileSync(doc, 'utf8');
  assert.ok(text.includes('CEDITOR_SIDECAR_IDENTITY'), 'VENDORED.md does not name the patch guard');
  assert.ok(text.includes('juce_audio_plugin_client_VST3.cpp'), 'VENDORED.md does not name the patched file');
});
