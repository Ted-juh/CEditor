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

  assert.equal(guarded.length, 3, 'expected guarded include, interface IDs and class metadata');
  const callSites = source.split('ceditor::vst3SidecarPluginCodes').length - 1;
  const guardedCallSites = guarded.join('\n').split('ceditor::vst3SidecarPluginCodes').length - 1;
  assert.equal(callSites, guardedCallSites,
    'a call to the sidecar identity sits outside #if CEDITOR_SIDECAR_IDENTITY — a stock build would change behaviour');
  assert.equal(source.split('ceditor::vst3SidecarIdentity()').length - 1,
    guarded.join('\n').split('ceditor::vst3SidecarIdentity()').length - 1,
    'class metadata must use sidecar identity only in template builds');
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

test('Windows pipe cancellation drains pending I/O and preserves deadline completion', () => {
  const source = readFileSync(join(repoRoot, 'JUCE/include/JUCE-8.0.7/modules/juce_core/native/juce_Files_windows.cpp'), 'utf8');
  const wait = source.slice(source.indexOf('bool waitForIO ('));
  const body = wait.slice(0, wait.indexOf('JUCE_DECLARE_NON_COPYABLE'));
  assert.equal((body.match(/GetOverlappedResult \(pipeH, &over.over, &transferred, TRUE\)/g) ?? []).length, 2,
    `Timeout and shutdown must drain cancelled I/O before releasing OVERLAPPED. ${REAPPLY}`);
  assert.match(body, /return GetOverlappedResult.*!= FALSE/);
  assert.ok(readFileSync(join(repoRoot, 'JUCE/VENDORED.md'), 'utf8').includes('Windows named-pipe cancellation'));
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

// Patch 2: the Linux webview bridge frames its pipe messages in bytes. Upstream counted characters
// and sent UTF-8, so one accented preset name desynchronised the bridge for the rest of the session.
const LINUX_BRIDGE = join(repoRoot,
  'JUCE/include/JUCE-8.0.7/modules/juce_gui_extra/native/juce_WebBrowserComponent_linux.cpp');

test('the vendored JUCE Linux webview bridge still frames its messages in bytes', () => {
  assert.ok(existsSync(LINUX_BRIDGE), `the vendored Linux webview bridge is missing: ${LINUX_BRIDGE}`);
  const source = readFileSync(LINUX_BRIDGE, 'utf8');
  const sendCommand = source.slice(source.indexOf('static void sendCommand ('));
  const body = sendCommand.slice(0, sendCommand.indexOf('private:'));
  assert.ok(body.includes('json.getNumBytesAsUTF8()'),
    `sendCommand measures the payload in characters again, not bytes. ${REAPPLY}`);
  assert.ok(!body.includes('json.length()'),
    `sendCommand still uses String::length() for the frame length. ${REAPPLY}`);
  assert.ok(/while \(written < len\)/.test(body),
    `sendCommand no longer loops the write until the whole message is out. ${REAPPLY}`);
});

test('JUCE/VENDORED.md records the Linux bridge patch too', () => {
  const text = readFileSync(join(repoRoot, 'JUCE/VENDORED.md'), 'utf8');
  assert.ok(text.includes('juce_WebBrowserComponent_linux.cpp') && text.includes('getNumBytesAsUTF8'),
    'VENDORED.md must name the Linux bridge file and the byte-count fix');
});

// Patch 4: the LV2 client's URI, name, vendor and version are read from the panel beside the
// binary, so one prebuilt .lv2 serves every panel the way the VST3 and CLAP templates do. The
// Turtle writers use the same four, so juce_lv2_helper regenerates a copied template's manifests
// with the panel's identity and parameters.
const LV2_WRAPPER = join(repoRoot,
  'JUCE/include/JUCE-8.0.7/modules/juce_audio_plugin_client/juce_audio_plugin_client_LV2.cpp');

test('the vendored JUCE LV2 wrapper still carries the sidecar-identity patch', () => {
  assert.ok(existsSync(LV2_WRAPPER), `the vendored JUCE LV2 wrapper is missing: ${LV2_WRAPPER}`);
  const source = readFileSync(LV2_WRAPPER, 'utf8');
  assert.ok(source.includes('Export/Lv2SidecarIdentity.h'), `the patch's include is gone from the JUCE LV2 wrapper. ${REAPPLY}`);
  for (const name of ['lv2PluginUri', 'lv2PluginName', 'lv2PluginVendor', 'lv2PluginVersion']) {
    assert.ok(source.includes(`ceditor::${name} (`), `the LV2 wrapper no longer consults ${name}. ${REAPPLY}`);
  }
  // Every use of the compiled URI goes through the macro; a raw use that crept back would be the
  // one place a template still reported the template's URI.
  const raw = source.split('JucePlugin_LV2URI').length - 1;
  assert.equal(raw, 5, `expected the compiled URI only in its #error, static_assert and the two macro definitions; found ${raw} uses. ${REAPPLY}`);
  // The derived URIs are functions: a namespace-scope static would read the sidecar at DLL load,
  // before lv2_descriptor can tell JUCE which module it is on Windows.
  assert.ok(source.includes('static const String& JucePluginLV2UriUi()'), `the derived UI URI is a load-time static again. ${REAPPLY}`);
  assert.ok(source.includes('ceditorNoteThisModule'), `the Windows module-handle note is gone from lv2_descriptor. ${REAPPLY}`);
});

test('the LV2 patch stays behind its guard, with the compiled values as the fallback', () => {
  const source = readFileSync(LV2_WRAPPER, 'utf8');
  assert.ok(source.includes('#define JUCE_LV2_URI     JucePlugin_LV2URI'), `the stock-JUCE branch of the macro is gone. ${REAPPLY}`);
  const guarded = source.split('#if CEDITOR_SIDECAR_IDENTITY').length - 1;
  assert.ok(guarded >= 4, `expected the include, the macros and the two descriptor notes behind the guard; found ${guarded}`);
  assert.ok(readFileSync(join(repoRoot, 'JUCE/VENDORED.md'), 'utf8').includes('juce_audio_plugin_client_LV2.cpp'),
    'VENDORED.md must name the patched LV2 file');
});
