# Vendored: JUCE 8.0.7

A vendored JUCE *install* — `include/`, `lib/` and `bin/` — rather than a source checkout, so the
build works offline. Same philosophy as `ThirdParty/clap-juce-extensions/VENDORED.md`.

`bin/JUCE-8.0.7/` holds `juceaide`, `juce_lv2_helper` and `juce_vst3_helper` as Windows `.exe`s.
Those were missing from the repository for a long stretch because `.gitignore` carried a blanket
`*.exe`, which made `find_package(JUCE)` fail on a half-install with an error that read like
corruption. `.gitignore` now has an explicit exception and
`CE/web/test/vendoredJuceHelpers.test.js` refuses a rule that would drop them again.

## Local modifications

Upstream JUCE is otherwise untouched. There are exactly five patches, and they are listed here because a
patch inside a vendored tree is invisible in a diff against upstream and dies silently the day
somebody drops in a new JUCE.

### 1. Runtime VST3 plugin identity

**File:** `include/JUCE-8.0.7/modules/juce_audio_plugin_client/juce_audio_plugin_client_VST3.cpp`
**Guard:** `#if CEDITOR_SIDECAR_IDENTITY` — off unless the build defines it, so an unmodified-looking
build behaves exactly as stock JUCE.
**Pinned by:** `CE/web/test/vendoredJucePatches.test.js`, which fails if the patch is gone.

Two hunks: an include of `Export/Vst3SidecarIdentity.h`, and four lines in `getInterfaceId()` that
consult it before falling back to `JucePlugin_ManufacturerCode` / `JucePlugin_PluginCode`.

**Why.** JUCE derives the VST3 class id (FUID) from those two `#define`s, so every exported panel
needed its own compile — which is why a full export required a C++ toolchain on the user's machine
and why "export runs from a source checkout" was a product limitation. But the VST3 class id is
whatever the module's factory reports; a `const` from `#define`s is JUCE's implementation choice,
not a VST3 requirement. With the patch, one prebuilt binary reads the panel document beside it and
reports a per-panel identity.

**Why it is safe.** The id is built from the same two four-character codes the compiling exporter
would have passed to CMake, so it is byte-identical to what a per-panel build produced — which
matters, because a host keys plugins by FUID and a saved session must keep finding its plugin
across the change. `CE/tests/PanelIdentitySidecarTests.cpp` asserts that equality against
`convertJucePluginId` itself, for every VST3 interface type.

The guarded `JucePluginFactory::getClassEntries` also reads the sidecar's product name, vendor
and version. Otherwise distinct panels have different IDs but all appear as the generic template
in a host's plugin browser. The Windows exporter renames the internal VST3 binary to match its
outer bundle, as required by the loader.

**If you upgrade JUCE:** re-apply both identity and metadata hooks. `getInterfaceId` is near the top of
that file; the whole rationale is in `CE/src/Export/Vst3SidecarIdentity.h`, and the guard test names
this document when it fails.

### 3. Windows named-pipe cancellation

**File:** `include/JUCE-8.0.7/modules/juce_core/native/juce_Files_windows.cpp`, `NamedPipe::Pimpl::waitForIO`.

Cancellation must finish before the stack OVERLAPPED and transfer buffer are released. A timeout
can race a successful transfer; returning failure immediately discards bytes already removed from
the pipe. After `CancelIo`, the patch calls `GetOverlappedResult(..., TRUE)` and retains successful
completion. The shutdown path also drains its operation before returning failure. Cancellation and
the pending I/O run on the same thread; close keeps the handle alive until the read lock is released.

**Pinned by:** the native `PluginWorkerProtocol` large-frame polling test and
`CE/web/test/vendoredJucePatches.test.js`. The original 4 MB test failed repeatedly before this patch
and passed five consecutive runs after it. Reapply this fix on JUCE upgrades unless upstream has
equivalent cancellation draining and completion accounting.

### 2. Linux webview bridge: messages framed in bytes

**File:** `include/JUCE-8.0.7/modules/juce_gui_extra/native/juce_WebBrowserComponent_linux.cpp`,
`CommandReceiver::sendCommand`.

**Guard:** none needed — the file is compiled on Linux only, and the change is a correction, not a
behaviour switch. Windows uses WebView2 and never reaches this code.

**Pinned by:** `CE/web/test/vendoredJucePatches.test.js`, which fails if the patch is gone.

**What.** The parent and the WebKit child talk over a pipe: a `size_t` length, then that many
**bytes** of JSON, which the receiver reads exactly and parses. Upstream computes the length with
`String::length()` — characters — and copies `toRawUTF8()` — bytes. The patch uses
`getNumBytesAsUTF8()`, and loops the `write()` until the whole message has gone, because a
multi-megabyte event does not always leave in one call.

**Why.** Any message carrying a non-ASCII character arrived a few bytes short, failed to parse, and
left its surplus bytes at the head of the next message — so every event after it was misframed
too. A real synth's factory list has such names (`µcomputer`, `Café`, `™`); the first library
event of the session carried them, and from the page's side the library simply never came. Found
running the app on Linux with a 3,600-preset Surge XT library (2026-09-08, commit `08a2c85`).

**Upstream status (checked 2026-10-01).** Half of it is fixed: JUCE 9.0.0 counts bytes
(`f9f79a18f`, "Linux: WebBrowserComponent: Fix emitting non-ASCII event data", 2026-06-21). The
other half is not: 9.0.3's `writeToChannel` has a resume-after-short-write block that is unreachable,
because any result other than -1 leaves the loop first. A fix against `develop` is prepared for a
pull request; until it lands, re-apply the write loop on an upgrade. The guard test names this
document when it fails.

### 4. Runtime LV2 plugin identity

**File:** `include/JUCE-8.0.7/modules/juce_audio_plugin_client/juce_audio_plugin_client_LV2.cpp`

**Guard:** `#if CEDITOR_SIDECAR_IDENTITY`, as for patch 1. A stock build keeps the compiled
`JucePlugin_LV2URI`, name, vendor and version through four macros that are the only thing it sees.

**Pinned by:** `CE/web/test/vendoredJucePatches.test.js`.

**What it does.** The LV2 client's URI was a compile-time literal, used in the descriptor, every
derived URI (the UI, the state keys, the parameters' IRIs, the presets) and the Turtle writers. Each
use now goes through `JUCE_LV2_URI`, which with the guard on asks `CE/src/Export/Lv2SidecarIdentity.h`
for the panel beside the binary and answers `urn:ceditor:<clapId>` — the string the compiling
exporter passes as `CE_LV2_URI`, so the two builds of one panel are the same plugin to a host. Name,
vendor and version go the same way. The three derived-URI constants became functions, because a
namespace-scope static would read the sidecar at DLL load, before `lv2_descriptor` has told JUCE
which module it is on Windows — the LV2 client, unlike the VST3 one, has no `DllMain`, so
`lv2_descriptor` and `lv2ui_descriptor` note the module from their own address first.

**Why the Turtle files need no rewriting.** JUCE writes manifest.ttl, dsp.ttl and ui.ttl by loading
the built binary (`juce_lv2_helper`) and calling the plug-in's own writers, which read the live
processor. The template exporter copies the binary, puts the panel beside it and runs that helper:
the files come out with the panel's URI and the panel's parameters. Without a panel the compiled
identity stands, so the template build's own helper run still succeeds; that is also why a template
`.lv2` copied without its panel reports the template's URI rather than refusing, as the CLAP does.

**If you upgrade JUCE:** re-apply the include, the macro block after the `static_assert`, the three
functions, the `map()` of the two state URIs, the fourteen use sites and the two descriptor notes;
the pin test counts the raw uses of `JucePlugin_LV2URI` and names the file.

### 5. MIDI-CI: callbacks that outlived the visitor they captured

**File:** `include/JUCE-8.0.7/modules/juce_midi_ci/ci/juce_CIDevice.cpp`

**Guard:** none. It is a fix, not a feature: a stock build with the patch behaves as JUCE intends.

**Pinned by:** `CE/web/test/vendoredJucePatches.test.js`.

**What was wrong.** `Device::Impl::LastListener::tryRespond` handles each incoming MIDI-CI message
with a `Visitor` built on its own stack (`Visitor { device, &output, &result }`) and gone when it
returns. Four of the visitor's lambdas are stored for later rather than run there: the reply to a
property-exchange capabilities inquiry asks the device for its ResourceList, then its DeviceInfo and
ChannelList, and the callbacks for those replies (`onResourceListReceived`, and inside it
`allDone` and `getChannelList`) captured `this`, the visitor. So did the subscription callback,
which runs when the last chunk of a subscription arrives, possibly in a later call. Each of them
then read `device` through a pointer to a dead stack frame.

It worked by luck: the slot usually still held the same pointer when the reply arrived.
AddressSanitizer reported it as a stack-use-after-return on the first run of
`CEditorDeviceProfileTests` under it (`docs/design/checkers-run-2026-10-02.md`), from CEditor's own
MIDI-CI session (`MidiCiSession::handleIncomingSysex`). In a release build the same read is
whatever the stack holds by then, through which the callback calls `sendPropertyGetInquiry` and
the device's listeners.

**What the patch does.** The four lambdas capture the `Impl*` the visitor points at
(`[device = device, ...]` in the two outer ones, `[device, ...]` in the two nested ones), which is
the device itself and outlives every callback the device owns. Nothing else in them read the
visitor.

**Upstream status (checked 2026-10-02).** Unfixed on JUCE's `develop` at `39b4da4f2`: the same four
captures, at the same lines. It is the third candidate for an upstream pull request beside the two
in the other patches' notes.

**If you upgrade JUCE:** look for `[this,` in the property-exchange handlers of
`LastListener::Visitor` in `juce_CIDevice.cpp`; the pin test fails while any of the four is back.

