#pragma once

#include <juce_core/juce_core.h>

namespace ceditor::host
{

/** A moduleinfo snapshot path as the SDK writes it, relative to the BUNDLE
    ("Contents/Resources/Snapshots/<CID>_snapshot.png" — moduleinfocreator.cpp strips the
    bundle path off the front), made relative to Contents, which is what the rest of this file
    resolves against. A path already relative to Contents is returned as it is. */
inline juce::String contentsRelativeSnapshotPath (juce::String path)
{
    path = path.replaceCharacter ('\\', '/');
    return path.startsWith ("Contents/") ? path.substring (9) : path;
}

/** Rejects dangerous moduleinfo path syntax before any filesystem query can follow a UNC
    path or other attacker-controlled root. Accepts the SDK's bundle-relative form and a
    Contents-relative one; both must land under Resources/Snapshots. */
inline bool isSafeVst3SnapshotRelativePath (juce::String path)
{
    if (path.isEmpty() || juce::File::isAbsolutePath (path)
        || path.startsWithChar ('/') || path.startsWithChar ('\\') || path.containsChar (':'))
        return false;

    path = contentsRelativeSnapshotPath (path);
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
                             ? juce::File (path)
                             : contents.getChildFile (contentsRelativeSnapshotPath (path));

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
