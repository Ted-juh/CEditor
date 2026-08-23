# Vendored: JUCE 8.0.7

A vendored JUCE *install* — `include/`, `lib/` and `bin/` — rather than a source checkout, so the
build works offline. Same philosophy as `ThirdParty/clap-juce-extensions/VENDORED.md`.

`bin/JUCE-8.0.7/` holds `juceaide`, `juce_lv2_helper` and `juce_vst3_helper` as Windows `.exe`s.
Those were missing from the repository for a long stretch because `.gitignore` carried a blanket
`*.exe`, which made `find_package(JUCE)` fail on a half-install with an error that read like
corruption. `.gitignore` now has an explicit exception and
`CE/web/test/vendoredJuceHelpers.test.js` refuses a rule that would drop them again.

## Local modifications

Upstream JUCE is otherwise untouched. There is exactly one patch, and it is listed here because a
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

**If you upgrade JUCE:** re-apply it. `getInterfaceId` is a short static function near the top of
that file; the whole rationale is in `CE/src/Export/Vst3SidecarIdentity.h`, and the guard test names
this document when it fails.
