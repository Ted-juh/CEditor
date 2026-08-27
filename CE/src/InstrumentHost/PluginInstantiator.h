#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "InstrumentHostService.h"

// PluginInstantiator — the one real instantiator, shared by everything that hosts (VIP-successor
// Stage 1).
//
// The editor's bridge glue and both generated wrappers hand InstrumentHostService the same
// behaviour: parse the catalogue's stored PluginDescription XML, refuse it readably, and let
// JUCE's async path deliver the instance on the message thread. In its own header rather than
// HostRuntimeShared.h because THAT file needs the embedded web bundle (PlayerWebData) — and the
// editor target embeds a different BinaryData, so including it there would collide. This one
// needs juce_audio_processors and nothing else.

namespace ceditor::host
{

/** Builds the service's instantiate function over a format manager, which must outlive the
    returned function. */
inline std::function<void (const juce::String&, double, int, InstrumentHostService::InstantiateCallback)>
makePluginInstantiator (juce::AudioPluginFormatManager& manager)
{
    return [&manager] (const juce::String& descriptionXml, double sampleRate, int blockSize,
                       InstrumentHostService::InstantiateCallback done)
    {
        juce::PluginDescription description;
        const auto parsed = juce::XmlDocument::parse (descriptionXml);
        if (parsed == nullptr || ! description.loadFromXml (*parsed))
        {
            done (nullptr, "unreadable plugin description");
            return;
        }

        manager.createPluginInstanceAsync (description, sampleRate, blockSize,
            [done] (std::unique_ptr<juce::AudioPluginInstance> instance, const juce::String& error)
            {
                done (std::move (instance), error);
            });
    };
}

/** The vendor .vstpreset loader for Options::applyVstPreset — JUCE's own, which re-validates
    the class id inside the file against the live instance, so a mismatched preset fails
    here instead of half-applying. Requires JUCE_PLUGINHOST_VST3, like everything hosting. */
inline bool applyVstPresetFile (juce::AudioProcessor& processor, const juce::File& presetFile)
{
    auto* instance = dynamic_cast<juce::AudioPluginInstance*> (&processor);
    juce::MemoryBlock data;
    if (instance == nullptr || ! presetFile.loadFileAsData (data))
        return false;
    return juce::VST3PluginFormat::setStateFromVSTPresetFile (instance, data);
}

} // namespace ceditor::host
