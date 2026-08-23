#pragma once

#include <optional>
#include <utility>

#include "Export/PanelIdentitySidecar.h"

/**
 * The hook JUCE's VST3 wrapper calls to get a per-panel identity out of a prebuilt binary.
 *
 * Kept separate from PanelIdentitySidecar.h, and deliberately tiny, because the other end of it is
 * a patch inside vendored JUCE source. The smaller that patch is, the more likely it survives
 * somebody upgrading JUCE — so everything that can live on this side of the line does.
 * `juce_audio_plugin_client_VST3.cpp` gains four lines and an include; all the thinking is here.
 *
 * WHY currentExecutableFile IS THE MODULE. Inside a plugin DLL that reads as a surprising choice,
 * so it is worth pinning down: JUCE's Windows implementation returns
 * `getModuleFileName (Process::getCurrentModuleInstanceHandle())`, and the VST3 wrapper's own
 * `DllMain` sets that handle to the plugin's HINSTANCE at `DLL_PROCESS_ATTACH`. So it is the
 * plugin's own path, and it is set before any exported function — `GetPluginFactory` included —
 * can be reached.
 *
 * CACHED, AND THAT IS LOAD-BEARING. `getInterfaceId` is called once per interface type per query,
 * and a host may query repeatedly. Re-reading the panel each time would be wasteful, but the real
 * reason is correctness: if the file on disk changed between two calls, a plugin would report two
 * different identities within one session, which is the exact instability this design exists to
 * avoid. Reading once and holding it means the identity is fixed for the lifetime of the module,
 * which is what a host assumes.
 */
namespace ceditor
{

/** manufacturerCode, pluginCode — packed, in the order convertJucePluginId takes them. */
using Vst3PluginCodes = std::pair<juce::uint32, juce::uint32>;

/**
 * The codes this module should report, or nothing when it has no panel to take them from.
 *
 * Nothing is the honest answer for a plain development build, and the caller then keeps the
 * compile-time defines — so a source build behaves exactly as it did before this existed.
 */
inline std::optional<Vst3PluginCodes> vst3SidecarPluginCodes()
{
    static const std::optional<Vst3PluginCodes> codes = []() -> std::optional<Vst3PluginCodes>
    {
        const auto module = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
        const auto identity = exporter::readIdentityBesideModule (module);
        if (! identity.valid)
            return std::nullopt;

        return Vst3PluginCodes { identity.manufacturerCode, identity.pluginCode };
    }();

    return codes;
}

} // namespace ceditor
