#pragma once

#include <juce_core/juce_core.h>

namespace ceditor::host
{

/** Resolves a VST3 moduleinfo snapshot without allowing the manifest to escape the bundle. */
inline juce::File validatedVst3Snapshot (const juce::File& moduleFileOrBundle,
                                         const juce::String& path)
{
    if (path.isEmpty())
        return {};

    const auto bundle = moduleFileOrBundle.isDirectory()
                          ? moduleFileOrBundle : moduleFileOrBundle.getParentDirectory();
    const auto contents = bundle.getChildFile ("Contents");
    const auto snapshots = contents.getChildFile ("Resources").getChildFile ("Snapshots");
    const auto candidate = juce::File::isAbsolutePath (path)
                             ? juce::File (path) : contents.getChildFile (path);

    if (! candidate.isAChildOf (snapshots)
        || ! candidate.hasFileExtension ("png")
        || ! candidate.existsAsFile())
        return {};

    // isAChildOf is lexical. A link below Snapshots could still redirect outside the package.
    for (auto part = candidate; part != snapshots; part = part.getParentDirectory())
        if (part.isSymbolicLink())
            return {};

    return candidate;
}

} // namespace ceditor::host
