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

test('Windows native messages remain restricted to the packaged or configured origin', () => {
  const source = readFileSync(join(repoRoot,
    'JUCE/include/JUCE-8.0.7/modules/juce_gui_extra/native/juce_WebBrowserComponent_windows.cpp'), 'utf8');
  const callback = source.slice(source.indexOf('webView->add_WebMessageReceived'));
  const dispatch = callback.indexOf('owner.impl->handleNativeEvent');
  assert.ok(dispatch > 0);
  const guard = callback.slice(0, dispatch);
  for (const check of ['get_Source', 'getResourceProviderRoot()', 'getAllowedOrigin()',
    'source != *allowed', 'source.startsWith (*allowed + "/")', 'return S_OK;'])
    assert.ok(guard.includes(check), `Missing origin guard ${check}. ${REAPPLY}`);
});

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

// Patch 5: four MIDI-CI property-exchange callbacks captured the temporary Visitor (`this`) and ran
// after it was gone. AddressSanitizer found it; JUCE's develop still has it. They capture the device.
const CI_DEVICE = join(repoRoot, 'JUCE/include/JUCE-8.0.7/modules/juce_midi_ci/ci/juce_CIDevice.cpp');

test('the vendored JUCE MIDI-CI callbacks capture the device, not the temporary visitor', () => {
  assert.ok(existsSync(CI_DEVICE), `the vendored MIDI-CI device is missing: ${CI_DEVICE}`);
  const source = readFileSync(CI_DEVICE, 'utf8');
  for (const [name, capture] of [
    ['onResourceListReceived', 'const auto onResourceListReceived = [device = device,'],
    ['allDone', 'const auto allDone = [device, source]'],
    ['getChannelList', 'const auto getChannelList = [device,'],
    ['the subscription callback', 'const auto callback = [device = device, request, source, subscribeId]'],
  ]) {
    assert.ok(source.includes(capture), `${name} no longer captures the device. ${REAPPLY}`);
  }
  for (const stale of ['onResourceListReceived = [this', 'allDone = [this', 'getChannelList = [this',
    'callback = [this, request, source, subscribeId]']) {
    assert.ok(!source.includes(stale), `"${stale}" is back: a callback captures the dead visitor. ${REAPPLY}`);
  }
});

test('JUCE/VENDORED.md records the MIDI-CI patch', () => {
  const text = readFileSync(join(repoRoot, 'JUCE/VENDORED.md'), 'utf8');
  assert.ok(text.includes('juce_CIDevice.cpp') && text.includes('stack-use-after-return'),
    'VENDORED.md must name the MIDI-CI file and the defect');
});

test('the Linux webview child is shut down without a loop that waits for an exit a signal never reports', () => {
  // Patch 8: a child killed by the SIGTERM is WIFSIGNALED, not WIFEXITED, so upstream's loop spun on
  // ECHILD at full CPU inside the closing window's destructor, re-sending SIGTERM to a reused pid.
  const source = readFileSync(LINUX_BRIDGE, 'utf8');
  const kill = source.slice(source.indexOf('void killChild()'));
  const body = kill.slice(0, kill.indexOf('void launchChild()'));
  assert.ok(!/WIFEXITED\s*\(/.test(body), `killChild waits for WIFEXITED again. ${REAPPLY}`);
  assert.ok(!/for \(;;\)\s*\{\s*kill \(childProcess, SIGTERM\)/.test(body), `the kill-and-wait loop is back. ${REAPPLY}`);
  for (const piece of ['CEditor patch (JUCE/VENDORED.md, 8)', 'childHasGone (1500)', 'kill (childProcess, SIGTERM)',
    'kill (childProcess, SIGKILL)', 'childHasGone (-1)', "result == childProcess || (result < 0 && errno != EINTR)"])
    assert.ok(body.includes(piece), `Missing ${piece} in killChild. ${REAPPLY}`);
  assert.match(readFileSync(join(repoRoot, 'JUCE/VENDORED.md'), 'utf8'), /### 8\. Linux webview: a closing window could spin the host forever/);
});

test('QuickJS still asks a proxy in the global prototype chain before reading a global through it', () => {
  // Without it, a read of an undefined name in a plug-in script is undefined instead of an error:
  // the per-script scope for undeclared names (JsScriptEngine.cpp) sits behind the global as a proxy.
  const source = readFileSync(join(repoRoot,
    'JUCE/include/JUCE-8.0.7/modules/juce_javascript/choc/javascript/choc_javascript_QuickJS.h'), 'utf8');
  const branch = source.slice(source.indexOf('/* XXX: should pass throw_ref_error */'));
  const get = branch.indexOf('em->get_property(ctx, obj1, prop, this_obj)');
  assert.ok(get > 0, 'the exotic get branch of JS_GetPropertyInternal moved');
  const before = branch.slice(0, get);
  for (const piece of ['CEditor patch 7', 'throw_ref_error && em->has_property', 'JS_ThrowReferenceErrorNotDefined(ctx, prop)'])
    assert.ok(before.includes(piece), `Missing ${piece} before the proxy's get. ${REAPPLY}`);
});


test('the vendored CLAP wrapper reports a state the player did not recognise as a failed load', () => {
  // JUCE's setStateInformation is void, so the wrapper returned true for any bytes at all and
  // clap-validator's state-invalid-random warned. The wrapper now asks (Player/StateLoadReport.h).
  const wrapper = readFileSync(join(repoRoot, 'CE/thirdparty/clap-juce-extensions/src/wrapper/clap-juce-wrapper.cpp'), 'utf8');
  const load = wrapper.slice(wrapper.indexOf('bool stateLoad(const clap_istream *stream)'));
  const body = load.slice(0, load.indexOf('\n    }\n'));
  const ask = body.indexOf('report->lastStateLoadAccepted()');
  assert.ok(ask > body.indexOf('processor->setStateInformation('), 'asked after the state is handed over. Re-apply the patch — CE/thirdparty/clap-juce-extensions/VENDORED.md.');
  assert.match(body, /dynamic_cast<ceditor::ReportsStateLoad \*>\(processor\.get\(\)\)/);
  assert.match(wrapper, /#include "Player\/StateLoadReport\.h"/);
  assert.match(readFileSync(join(repoRoot, 'CE/thirdparty/clap-juce-extensions/VENDORED.md'), 'utf8'), /`stateLoad`: returns whether the processor recognised the/);

  const processor = readFileSync(join(repoRoot, 'CE/src/Player/PluginProcessor.h'), 'utf8');
  assert.match(processor, /class PlayerAudioProcessor : public juce::AudioProcessor\s+, public ceditor::ReportsStateLoad/);
  const setState = processor.slice(processor.indexOf('void setStateInformation (const void* data, int sizeInBytes) override'));
  const setBody = setState.slice(0, setState.indexOf('\n    }\n'));
  assert.ok(setBody.indexOf('stateLoadAccepted.store (false);') < setBody.indexOf('getXmlFromBinary'), 'cleared before anything can return early');
  assert.ok(setBody.indexOf('stateLoadAccepted.store (true);') > setBody.indexOf('backward-compat: APVTS-only state'), 'set only once a known form was read');
});

test('a panel in a Windows webview has no autofill, and a hidden one is left to WebView2', () => {
  // Patch 9: JUCE 8.0.7 leaves autofill and password saving on. It also asked a hidden webview for
  // the low memory target, which the engine probe found did nothing for a page that keeps running;
  // setControlVisible is JUCE's own again.
  const source = readFileSync(join(repoRoot,
    'JUCE/include/JUCE-8.0.7/modules/juce_gui_extra/native/juce_WebBrowserComponent_windows.cpp'), 'utf8');
  const preferences = source.slice(source.indexOf('void setWebViewPreferences()'));
  const preferencesBody = preferences.slice(0, preferences.indexOf('void createWebView()'));
  for (const piece of ['ComSmartPtr<ICoreWebView2Settings4>', 'put_IsGeneralAutofillEnabled (FALSE)', 'put_IsPasswordAutosaveEnabled (FALSE)'])
    assert.ok(preferencesBody.includes(piece), `Missing ${piece} in setWebViewPreferences. ${REAPPLY}`);
  const visible = source.slice(source.indexOf('void setControlVisible (bool shouldBeVisible) const'));
  const visibleBody = visible.slice(0, visible.indexOf('\n    }\n'));
  assert.ok(visibleBody.includes('put_IsVisible (shouldBeVisible)'));
  assert.ok(!visibleBody.includes('MemoryUsageTargetLevel'), 'the low memory target came out (VENDORED.md, patch 9)');
  assert.match(readFileSync(join(repoRoot, 'JUCE/VENDORED.md'), 'utf8'), /### 9\. Windows WebView2: no autofill in a panel/);
});

test('the editor sets the size of a Windows webview page, and Ctrl+wheel does not', () => {
  // Patch 10: WebView2 zoomed the whole page on any Ctrl+wheel or Ctrl+plus/minus the page did not
  // take itself, by accident and with nothing on screen to say so. The editor's window sets its
  // size through setZoomFactor, which JUCE has no call for, and a webview whose host does that has
  // no zoom of its own.
  const gui = 'JUCE/include/JUCE-8.0.7/modules/juce_gui_extra';
  const header = readFileSync(join(repoRoot, gui, 'misc/juce_WebBrowserComponent.h'), 'utf8');
  const common = readFileSync(join(repoRoot, gui, 'misc/juce_WebBrowserComponent.cpp'), 'utf8');
  const windows = readFileSync(join(repoRoot, gui, 'native/juce_WebBrowserComponent_windows.cpp'), 'utf8');
  assert.ok(header.includes('void setZoomFactor (double factor);'), `WebBrowserComponent::setZoomFactor is gone. ${REAPPLY}`);
  assert.ok(common.includes('virtual void setZoomFactor (double) {}'), `the platform's default is gone. ${REAPPLY}`);
  assert.match(common, /void WebBrowserComponent::setZoomFactor \(double factor\)\s*\{\s*impl->setZoomFactor \(factor\);/);

  const webView2 = windows.slice(windows.indexOf('class WebBrowserComponent::Impl::Platform::WebView2 final'));
  assert.match(webView2, /void setZoomFactor \(double factor\) override\s*\{\s*zoomFactor = factor;\s*applyHostZoom\(\);/,
    `WebView2 no longer takes the host's zoom. ${REAPPLY}`);
  const apply = webView2.slice(webView2.indexOf('void applyHostZoom()'));
  const applyBody = apply.slice(0, apply.indexOf('\n    }\n'));
  // Only a webview whose host sets the zoom loses the engine's own: the manual's window keeps it.
  assert.match(applyBody, /if \(! zoomFactor\.has_value\(\)/, `every webview lost its own zoom. ${REAPPLY}`);
  assert.ok(applyBody.includes('settings->put_IsZoomControlEnabled (FALSE);'), `the engine's zoom is on again under the host's. ${REAPPLY}`);
  assert.ok(applyBody.includes('webViewController->put_ZoomFactor (*zoomFactor);'), `WebView2 no longer sets its ZoomFactor. ${REAPPLY}`);
  const preferences = webView2.slice(webView2.indexOf('void setWebViewPreferences()'));
  const preferencesBody = preferences.slice(0, preferences.indexOf('void createWebView()'));
  assert.ok(preferencesBody.includes('applyHostZoom();'),
    `a size asked for before the controller existed is no longer applied when it does. ${REAPPLY}`);
  assert.match(readFileSync(join(repoRoot, 'JUCE/VENDORED.md'), 'utf8'), /### 10\. Windows WebView2: the page's size is the editor's, not Ctrl\+wheel's/);

  const host = readFileSync(join(repoRoot, 'CE/src/WebViewHost.cpp'), 'utf8');
  assert.match(host, /withEventListener \("setInterfaceZoom"[\s\S]{0,500}webView->setZoomFactor \(factor\)/,
    'the editor window no longer passes the interface size to its webview');
});
