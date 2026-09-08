#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "IsolatedPluginProxy.h"
#include "InstrumentHostService.h"

// PluginInstantiator — the one real instantiator shared by every Hostage runtime.
//
// The editor's bridge glue and both generated wrappers hand InstrumentHostService the same
// behaviour: launch one live worker over the catalogue's stored PluginDescription XML and let
// its async handshake deliver the proxy on the message thread. In its own header rather than
// HostRuntimeShared.h because THAT file needs the embedded web bundle (PlayerWebData) — and the
// editor target embeds a different BinaryData, so including it there would collide. This one
// needs juce_audio_processors and nothing else.

namespace ceditor::host
{

/** Builds the crash-isolated instantiator. No format manager is needed in the Hostage process:
    the real AudioPluginInstance is created by CEditorPluginWorker. */
inline std::function<void (const juce::String&, double, int, InstrumentHostService::InstantiateCallback)>
makeIsolatedPluginInstantiator (const juce::File& liveWorkerExecutable,
                                const juce::File& temporaryDirectory)
{
    return [liveWorkerExecutable, temporaryDirectory]
           (const juce::String& descriptionXml, double sampleRate, int blockSize,
            InstrumentHostService::InstantiateCallback done)
    {
        IsolatedPluginProxy::launchAsync (liveWorkerExecutable, temporaryDirectory,
                                          descriptionXml, sampleRate, blockSize,
                                          std::move (done));
    };
}

#if ! JUCE_WINDOWS
/** The instantiator for platforms that have no live worker yet: the plug-in runs INSIDE
    Hostage, through JUCE's format manager, exactly as the scanner and audition workers run
    it in their own processes. A crash in the plug-in is then a crash of Hostage - which is
    the whole reason the Windows build does not do this, and why this is gated by platform
    rather than by a runtime switch. What it buys is a Linux or macOS build in which a part
    loads, the program list ingests and the browser can be worked on end to end. */
inline std::function<void (const juce::String&, double, int, InstrumentHostService::InstantiateCallback)>
makeInProcessPluginInstantiator (juce::AudioPluginFormatManager& formats)
{
    return [&formats] (const juce::String& descriptionXml, double sampleRate, int blockSize,
                       InstrumentHostService::InstantiateCallback done)
    {
        juce::PluginDescription description;
        const auto xml = juce::parseXML (descriptionXml);
        if (xml == nullptr || ! description.loadFromXml (*xml))
        {
            done (nullptr, "The catalogue entry for this plug-in could not be read.");
            return;
        }
        // JUCE moves this to the message thread itself when it is called from anywhere else.
        formats.createPluginInstanceAsync (description, sampleRate, blockSize,
            [done] (std::unique_ptr<juce::AudioPluginInstance> instance, const juce::String& error)
            {
                done (std::move (instance), error);
            });
    };
}
#endif

/** Vendor .vstpreset loading stays on the isolated instance. The worker uses JUCE's loader,
    which re-validates the class id against the real instance before applying it. An
    in-process instance goes through the same loader directly. */
inline bool applyVstPresetFile (juce::AudioProcessor& processor, const juce::File& presetFile)
{
    if (auto* isolated = dynamic_cast<IsolatedPluginProxy*> (&processor))
        return isolated->applyVstPreset (presetFile);
    if (auto* instance = dynamic_cast<juce::AudioPluginInstance*> (&processor))
    {
        // The format's own loader, reached the way JUCE now asks for it: through the
        // instance's extensions, so a non-VST3 instance simply is not visited.
        struct PresetVisitor final : juce::ExtensionsVisitor
        {
            explicit PresetVisitor (const juce::MemoryBlock& d) : data (d) {}
            void visitVST3Client (const VST3Client& client) override { applied = client.setPreset (data); }
            const juce::MemoryBlock& data;
            bool applied = false;
        };
        juce::MemoryBlock data;
        if (! presetFile.loadFileAsData (data))
            return false;
        PresetVisitor visitor (data);
        instance->getExtensions (visitor);
        return visitor.applied;
    }
    return false;
}

} // namespace ceditor::host
