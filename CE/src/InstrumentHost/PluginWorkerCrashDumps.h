#pragma once

#include <juce_core/juce_core.h>

// The crash reporter writes into a fixed ring of filenames. That makes retention a hard bound
// even when many workers fail together, and lets the support bundle use an exact allowlist
// instead of sweeping a directory for anything that happens to end in .dmp.

namespace ceditor::host::plugin_worker
{

class PluginWorkerCrashDumps
{
public:
    static constexpr int slotCount = 8;

    static juce::File directory (const juce::File& dataDirectory)
    {
        return dataDirectory.getChildFile ("crash-dumps");
    }

    static int slotFor (juce::uint32 generation, juce::uint32 processId) noexcept
    {
        return static_cast<int> ((generation ^ processId) % static_cast<juce::uint32> (slotCount));
    }

    static juce::File slotFile (const juce::File& dumpDirectory, int slot)
    {
        const auto bounded = juce::jlimit (0, slotCount - 1, slot);
        return dumpDirectory.getChildFile (
            "live-worker-slot-" + juce::String (bounded).paddedLeft ('0', 2) + ".dmp");
    }

    static juce::File metadataFile (const juce::File& dumpDirectory, int slot)
    {
        const auto bounded = juce::jlimit (0, slotCount - 1, slot);
        return dumpDirectory.getChildFile (
            "live-worker-slot-" + juce::String (bounded).paddedLeft ('0', 2) + ".json");
    }

    static juce::Array<juce::File> supportFiles (const juce::File& dataDirectory)
    {
        juce::Array<juce::File> files;
        const auto dumpDirectory = directory (dataDirectory);
        for (int slot = 0; slot < slotCount; ++slot)
            if (const auto file = slotFile (dumpDirectory, slot);
                file.existsAsFile() && ! file.isSymbolicLink())
                files.add (file);
        return files;
    }

    static juce::Array<juce::File> supportMetadataFiles (const juce::File& dataDirectory)
    {
        juce::Array<juce::File> files;
        const auto dumpDirectory = directory (dataDirectory);
        for (int slot = 0; slot < slotCount; ++slot)
        {
            const auto dump = slotFile (dumpDirectory, slot);
            const auto metadata = metadataFile (dumpDirectory, slot);
            // A sidecar only belongs to support when its matching dump still exists. This also
            // prevents a stale JSON file from describing a slot that has failed to overwrite.
            if (dump.existsAsFile() && ! dump.isSymbolicLink()
                && metadata.existsAsFile() && ! metadata.isSymbolicLink())
                files.add (metadata);
        }
        return files;
    }
};

} // namespace ceditor::host::plugin_worker
