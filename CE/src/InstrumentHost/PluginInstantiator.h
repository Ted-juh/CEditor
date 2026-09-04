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

/** Vendor .vstpreset loading stays on the isolated instance. The worker uses JUCE's loader,
    which re-validates the class id against the real instance before applying it. */
inline bool applyVstPresetFile (juce::AudioProcessor& processor, const juce::File& presetFile)
{
    if (auto* isolated = dynamic_cast<IsolatedPluginProxy*> (&processor))
        return isolated->applyVstPreset (presetFile);
    return false;
}

} // namespace ceditor::host
