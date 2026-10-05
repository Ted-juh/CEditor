#pragma once
#include <juce_core/juce_core.h>
#include <filesystem>
#include <set>

namespace ceditor
{
// Capabilities live in the native host, never in a document or bridge payload.
class NativeFileAccess
{
public:
    void grantRead (const juce::File& file) { add (reads, file); }
    void grantDocument (const juce::File& file)
    {
        add (reads, file);
        add (writes, file);
        const auto parent = canonical (file.getParentDirectory());
        if (parent.isNotEmpty()) assetRoots.insert (parent + "/");
    }
    bool canWrite (const juce::File& file) const { return contains (writes, file); }
    bool canRead (const juce::File& file) const
    {
        if (contains (reads, file)) return true;
        if (! file.hasFileExtension ("png;jpg;jpeg;gif;bmp;svg;webp;ttf;otf;woff;woff2;psd")) return false;
        const auto key = canonical (file);
        for (const auto& root : assetRoots) if (key.startsWith (root)) return true;
        return false;
    }
private:
    static juce::String canonical (const juce::File& file)
    {
        if (file == juce::File()) return {};
        std::error_code error;
       #if JUCE_WINDOWS
        const std::filesystem::path input (file.getFullPathName().toWideCharPointer());
       #else
        const std::filesystem::path input (file.getFullPathName().toStdString());
       #endif
        const auto path = std::filesystem::weakly_canonical (input, error);
        if (error) return {};
       #if JUCE_WINDOWS
        return juce::String (path.wstring().c_str()).replaceCharacter ('\\', '/').toLowerCase();
       #else
        return juce::String (path.string());
       #endif
    }
    static void add (std::set<juce::String>& set, const juce::File& file)
    {
        const auto key = canonical (file);
        if (key.isNotEmpty()) set.insert (key);
    }
    static bool contains (const std::set<juce::String>& set, const juce::File& file)
    {
        const auto key = canonical (file);
        return key.isNotEmpty() && set.count (key) != 0;
    }
    std::set<juce::String> reads, writes, assetRoots;
};
}
