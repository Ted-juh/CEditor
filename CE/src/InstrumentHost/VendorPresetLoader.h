#pragma once

#include "VendorPreset.h"
#include <juce_audio_processors/juce_audio_processors.h>

namespace ceditor::host
{
inline bool applyVendorComponentState (juce::AudioPluginInstance& instrument, const juce::MemoryBlock& component)
{
    struct Loader final : juce::ExtensionsVisitor
    {
        const juce::MemoryBlock& component;
        bool applied = false;
        explicit Loader (const juce::MemoryBlock& state) : component (state) {}
        void visitVST3Client (const VST3Client& client) override
        {
            const auto current = client.getPreset();
            if (current.getSize() < 48 || std::memcmp (current.getData(), "VST3", 4) != 0) return;
            // Use the live class UID, after checking the adapter's exact instrument/vendor.
            // The VST3 loader reports refusal and synchronises the edit controller as well.
            juce::MemoryOutputStream out;
            out.write ("VST3", 4);
            out.writeInt (1);
            out.write (static_cast<const char*> (current.getData()) + 8, 32);
            out.writeInt64 (static_cast<juce::int64> (48 + component.getSize()));
            out.write (component.getData(), component.getSize());
            out.write ("List", 4);
            out.writeInt (1);
            out.write ("Comp", 4);
            out.writeInt64 (48);
            out.writeInt64 (static_cast<juce::int64> (component.getSize()));
            applied = client.setPreset (out.getMemoryBlock());
        }
    } loader (component);
    instrument.getExtensions (loader);
    return loader.applied;
}

// Called only inside a disposable plug-in worker, on its message thread. Format parsing is
// shared with discovery, so a file we cannot recall never becomes an apparently usable sound.
inline bool applyVendorPresetInWorker (juce::AudioPluginInstance& instrument, const juce::File& file)
{
    juce::MemoryBlock bytes;
    if (file.hasFileExtension ("vstpreset"))
        return file.getSize() <= 64 * 1024 * 1024 && file.loadFileAsData (bytes)
            && juce::VST3PluginFormat::setStateFromVSTPresetFile (&instrument, bytes);

    const auto preset = readVendorPreset (file);
    const auto description = instrument.getPluginDescription();
    if (! preset || ! description.name.equalsIgnoreCase (preset.instrument)
        || ! description.manufacturerName.equalsIgnoreCase (preset.manufacturer))
        return false;

    if (preset.sourceType == "h2p")
    {
        if (description.pluginFormatName != "VST3") return false;
        // Zebra3 uses the same H2P text for component and controller state. Use JUCE's
        // state restore path: its preset-file path does not reset the cached parameters,
        // so a later proxy snapshot/save would otherwise write the preceding sound back.
        juce::XmlElement state ("VST3PluginState");
        const auto encoded = preset.componentState.toBase64Encoding();
        state.createNewChildElement ("IComponent")->addTextElement (encoded);
        state.createNewChildElement ("IEditController")->addTextElement (encoded);
        juce::MemoryBlock wrapped;
        juce::AudioProcessor::copyXmlToBinary (state, wrapped);
        instrument.setStateInformation (wrapped.getData(), static_cast<int> (wrapped.getSize()));

        juce::MemoryBlock recalled;
        instrument.getStateInformation (recalled);
        const auto xml = juce::AudioProcessor::getXmlFromBinary (recalled.getData(), static_cast<int> (recalled.getSize()));
        if (xml == nullptr) return false;
        const auto* component = xml->getChildByName ("IComponent");
        juce::MemoryBlock text;
        if (component == nullptr || ! text.fromBase64Encoding (component->getAllSubText())) return false;
        const auto lines = juce::StringArray::fromLines (text.toString());
        return lines.contains ("#pgm=" + file.getFileName().removeCharacters ("\r\n"))
            && lines.contains ("#AM=Zebra3");
    }

    if (preset.sourceType == "spire")
    {
        struct Assignment { juce::AudioProcessorParameter* parameter; float value; };
        juce::Array<Assignment> assignments;
        const auto& parameters = instrument.getParameters();
        for (const auto& property : preset.parameters.getDynamicObject()->getProperties())
        {
            juce::AudioProcessorParameter* match = nullptr;
            for (auto* parameter : parameters)
                if (parameter->getName (256) == property.name.toString())
                {
                    if (match != nullptr) return false;
                    match = parameter;
                }
            if (match == nullptr) return false;
            assignments.add ({ match, static_cast<float> (property.value) });
        }
        // Older SPF2 files predate these global sound controls. Do not inherit an offset
        // from the previously edited sound when importing one of those files.
        for (auto* parameter : parameters)
        {
            const auto name = parameter->getName (256);
            if ((name == "osc_all_pt" || name == "lfo_all_rt")
                && ! preset.parameters.getDynamicObject()->hasProperty (juce::Identifier (name)))
                assignments.add ({ parameter, parameter->getDefaultValue() });
        }
        // Resolve the complete map before touching the instance. Spire exposes its SPF2
        // parameter keys verbatim, avoiding a version-dependent binary-state layout.
        for (const auto& assignment : assignments)
            assignment.parameter->setValueNotifyingHost (assignment.value);
        return true;
    }

    return applyVendorComponentState (instrument, preset.componentState);
}
}
