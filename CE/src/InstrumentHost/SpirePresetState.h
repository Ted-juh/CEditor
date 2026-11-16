#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

namespace ceditor::host
{
// Spire 1.5 keeps its displayed name in the VST3 edit controller, separately from
// the sound parameters. Its controller chunk is NUL-terminated base64 of raw-deflate JSON.
inline juce::var readSpireController (const juce::MemoryBlock& state)
{
    const auto xml = juce::AudioProcessor::getXmlFromBinary (state.getData(), static_cast<int> (state.getSize()));
    const auto* controller = xml != nullptr ? xml->getChildByName ("IEditController") : nullptr;
    juce::MemoryBlock text;
    if (controller == nullptr || ! text.fromBase64Encoding (controller->getAllSubText()))
        return {};
    juce::MemoryOutputStream compressed;
    if (! juce::Base64::convertFromBase64 (compressed, text.toString()))
        return {};
    juce::MemoryInputStream input (compressed.getData(), compressed.getDataSize(), false);
    juce::GZIPDecompressorInputStream inflater (&input, false, juce::GZIPDecompressorInputStream::deflateFormat);
    juce::MemoryOutputStream json;
    constexpr int maxBytes = 4 * 1024 * 1024;
    if (json.writeFromInputStream (inflater, maxBytes + 1) > maxBytes)
        return {};
    return juce::JSON::parse (json.toUTF8());
}

inline void setSpirePresetName (juce::AudioPluginInstance& instrument, const juce::String& name)
{
    juce::MemoryBlock state;
    instrument.getStateInformation (state);
    auto controller = readSpireController (state);
    auto meta = controller.getProperty ("preset_meta", {});
    if (! meta.isObject() || ! meta.getProperty ("name", {}).isString())
        return; // Preserve parameter-based recall for versions with a different controller format.
    meta.getDynamicObject()->setProperty ("name", name);

    juce::MemoryOutputStream compressed;
    {
        juce::GZIPCompressorOutputStream deflater (compressed, -1, juce::GZIPCompressorOutputStream::windowBitsRaw);
        const auto json = juce::JSON::toString (controller, true);
        deflater.write (json.toRawUTF8(), json.getNumBytesAsUTF8());
    }
    const auto encoded = juce::Base64::toBase64 (compressed.getData(), compressed.getDataSize());
    const juce::MemoryBlock terminated (encoded.toRawUTF8(), encoded.getNumBytesAsUTF8() + 1);
    juce::XmlElement update ("VST3PluginState");
    update.createNewChildElement ("IEditController")->addTextElement (terminated.toBase64Encoding());
    juce::AudioProcessor::copyXmlToBinary (update, state);
    instrument.setStateInformation (state.getData(), static_cast<int> (state.getSize()));
}
}
