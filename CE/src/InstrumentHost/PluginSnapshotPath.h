#pragma once

#include <juce_core/juce_core.h>

namespace ceditor::host
{

/** Rejects dangerous moduleinfo path syntax before any filesystem query can follow a UNC
    path or other attacker-controlled root. VST3 paths are relative to Contents. */
inline bool isSafeVst3SnapshotRelativePath (juce::String path)
{
    if (path.isEmpty() || juce::File::isAbsolutePath (path)
        || path.startsWithChar ('/') || path.startsWithChar ('\\') || path.containsChar (':'))
        return false;

    path = path.replaceCharacter ('\\', '/');
    if (! path.startsWith ("Resources/Snapshots/")
        || path.endsWithChar ('.') || path.endsWithChar (' '))
        return false;

    juce::StringArray parts;
    parts.addTokens (path, "/", "");
    for (const auto& part : parts)
        if (part.isEmpty() || part == "." || part == "..")
            return false;

    return path.fromLastOccurrenceOf ("/", false, false).endsWithIgnoreCase (".png");
}

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
