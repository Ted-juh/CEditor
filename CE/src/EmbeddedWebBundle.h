#pragma once

// EmbeddedWebBundle.h — a file of the web bundle the player, the plug-in and Hostage carry inside them.
//
// The bundle is PlayerWebData (CMakeLists.txt): the files player.html and host.html can reach, each
// gzip-compressed as `<name>.gz` by CE/web/scripts/embed-web.mjs, because compressed they are 6.3 MB
// of what was 21.6. A file is looked up by its name alone — Vite gives every file a unique one — and
// inflated as its page asks for it. A file embedded as it is, without the suffix, is served as it is.
//
// Include it only where PlayerWebData is linked: "BinaryData.h" is that bundle's header there.

#include "BinaryData.h" // PlayerWebData

#include <juce_core/juce_core.h>

#include <cstddef>
#include <cstring>
#include <optional>
#include <vector>

namespace ceditor
{
/** The bytes of `name` from the embedded web bundle, inflated when it is stored compressed. */
inline std::optional<std::vector<std::byte>> embeddedWebFile (const juce::String& name)
{
    const auto find = [] (const juce::String& wanted, int& size) -> const char*
    {
        for (int i = 0; i < PlayerWebData::namedResourceListSize; ++i)
            if (juce::String (PlayerWebData::originalFilenames[i]) == wanted)
                return PlayerWebData::getNamedResource (PlayerWebData::namedResourceList[i], size);
        return nullptr;
    };
    const auto bytesOf = [] (const void* data, size_t size)
    {
        std::vector<std::byte> bytes (size);
        if (size > 0) std::memcpy (bytes.data(), data, size);
        return bytes;
    };

    int size = 0;
    if (const auto* data = find (name, size))
        return bytesOf (data, (size_t) size);

    if (const auto* data = find (name + ".gz", size))
    {
        juce::MemoryInputStream compressed (data, (size_t) size, false);
        juce::GZIPDecompressorInputStream gzip (&compressed, false, juce::GZIPDecompressorInputStream::gzipFormat);
        juce::MemoryBlock inflated;
        gzip.readIntoMemoryBlock (inflated);
        return bytesOf (inflated.getData(), inflated.getSize());
    }
    return std::nullopt;
}
} // namespace ceditor
