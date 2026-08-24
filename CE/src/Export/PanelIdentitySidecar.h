#pragma once

#include <juce_core/juce_core.h>

#include "Export/PanelExportIdentity.h"

/**
 * Runtime plugin identity — the compiler-free export path.
 *
 * THE PROBLEM. Exporting a panel as a VST3 required a C++ toolchain on the user's machine, and the
 * only reason was identity. Panel *data* has been runtime-loaded for a long time: the player reads
 * a `.cepanel` from a path at startup and builds its whole parameter list by parsing it. What was
 * baked at compile time was the FUID, the plugin name, the CLAP id and the LV2 URI — a few dozen
 * bytes — and baking them is what forced the relink, the compiler, and "export runs from a source
 * checkout" as a product limitation.
 *
 * The received wisdom was that this is unavoidable, and it is written down as such in
 * docs/scripting-language-options-and-shippable-export.md §3a: "JUCE derives the VST3 class id
 * (FUID) from PLUGIN_CODE + MANUFACTURER_CODE (#defines baked at link time...); each VST3 product
 * genuinely needs a unique compile-time identity". The first half is a true statement about JUCE.
 * The conclusion does not follow: **the VST3 class id is whatever the module's factory reports.**
 * A `const` derived from `#define`s is JUCE's implementation choice, not a VST3 requirement, and
 * that same document's own "future wins" list says so.
 *
 * THE MECHANISM, and why it produces the same bytes. JUCE builds the 16-byte id in
 * `VST3ClientExtensions::convertJucePluginId`, and only the last EIGHT bytes carry plugin identity:
 *
 *     bytes  0-3   a constant per interface type (component / controller / processor / ...)
 *     bytes  4-7   a second constant per interface type
 *     bytes  8-11  manufacturerCode, as four ASCII bytes, big-endian
 *     bytes 12-15  pluginCode,       as four ASCII bytes, big-endian
 *
 * `JucePlugin_PluginCode` is nothing more exotic than those four characters packed into a uint32 —
 * JUCEUtils.cmake's `_juce_to_char_literal` writes the string to a scratch file and reads it back as
 * hex, so `"Cep1"` becomes `0x43657031`. Derive the same four characters at runtime and hand them to
 * the same function, and the id is byte-identical. That is not an approximation: it is the same
 * arithmetic over the same inputs, and `PanelIdentitySidecarTests` asserts the equality directly
 * against `convertJucePluginId` rather than trusting this paragraph.
 *
 * Byte-identical matters more than it sounds. A host keys plugins by FUID, so a panel exported by
 * the old compiling path and the same panel exported by this one must produce the SAME id, or a
 * saved session stops finding its plugin the day someone upgrades. The equivalence is the migration
 * story, and it is the reason this reuses `deriveIdentity` rather than inventing a scheme.
 *
 * WHERE THE IDENTITY COMES FROM. Not a sidecar file, in the end — the panel document already
 * carries everything. It has the `panelGuid` that every identifier is derived from, and the
 * `exportSettings` the exporter reads for the name, vendor and manufacturer code. A second file
 * would be a second source of truth and one more thing to lose in a copy. So the template player
 * looks for a `.cepanel` beside its own binary and reads identity out of that, which is the same
 * file it was going to load the panel from anyway.
 *
 * The fallback chain below is not invented here. It mirrors `tools/scripts/export-panel-vst3.mjs`
 * line for line, because a difference in a default is a different GUID input and therefore a
 * different FUID — the exact failure this whole header exists to avoid. The tests pin each default
 * individually for that reason.
 */
namespace ceditor::exporter
{

/**
 * Four ASCII characters packed big-endian, exactly as JUCEUtils.cmake's `_juce_to_char_literal`
 * does it: the string is truncated or zero-padded to four bytes, most significant byte first.
 *
 * Zero-padding rather than space-padding, and truncation rather than an error, because those are
 * what the CMake function does — this is a reimplementation of a specific behaviour, not a fresh
 * decision about how a fourcc should work.
 */
inline juce::uint32 fourccFromCode (const juce::String& code)
{
    const auto utf8 = code.toRawUTF8();
    const auto length = code.getNumBytesAsUTF8();

    juce::uint32 packed = 0;
    for (size_t i = 0; i < 4; ++i)
    {
        const auto byte = i < length ? (juce::uint8) utf8[i] : (juce::uint8) 0;
        packed = (packed << 8) | byte;
    }
    return packed;
}

/** Identity read from a panel document, in the form the VST3 factory needs. */
struct SidecarIdentity
{
    bool valid = false;             ///< false when no panel was found or it carried no GUID
    juce::File panelFile;           ///< the document this came from (also what the player loads)
    PanelExportIdentity identity;   ///< the full derived identity — clapId and auSubtype included

    /// The two codes JUCE's convertJucePluginId takes, already packed.
    juce::uint32 manufacturerCode = 0;
    juce::uint32 pluginCode = 0;
};

/**
 * The exporter's defaults, in one place so both sides can be tested against each other.
 *
 * Kept as functions rather than inline literals because the whole risk here is drift: if the JS
 * changes 'Tedjuh' and this does not, every panel exported by a template binary silently gets a
 * different FUID from the same panel exported by the compiling path.
 */
namespace fallback
{
    inline juce::String vendorName()      { return "Tedjuh"; }
    inline juce::String manufacturerCode(){ return "Tdjh"; }
    inline juce::String version()         { return "1.0.0"; }

    /// The exporter pads a short manufacturer code with 'x' and takes the first four characters.
    inline juce::String padManufacturerCode (const juce::String& code)
    {
        return (code + "xxxx").substring (0, 4);
    }
}

/**
 * Derive identity from a parsed panel document.
 *
 * `panelFile` is carried through for the caller's benefit (it is also the panel to load) and is not
 * used in the derivation — identity comes from the document's contents, so renaming the file on
 * disk cannot change the plugin a host sees.
 */
inline SidecarIdentity identityFromPanelDocument (const juce::var& document, const juce::File& panelFile)
{
    SidecarIdentity out;
    out.panelFile = panelFile;

    const auto guid = document.getProperty ("panelGuid", juce::var()).toString().trim();
    if (guid.isEmpty())
        return out;   // no GUID, no derivation — the caller falls back to the compiled-in identity

    const auto settings = document.getProperty ("exportSettings", juce::var());
    const auto setting = [&settings] (const char* key)
    {
        return settings.getProperty (key, juce::var()).toString().trim();
    };

    // The exporter's own chain: exportSettings.pluginName, then the panel's name, then a
    // constructed default. The CLI's productName argument has no equivalent here and is skipped —
    // it is a developer convenience on the command line, never part of a shipped export.
    auto productName = setting ("pluginName");
    if (productName.isEmpty()) productName = document.getProperty ("name", juce::var()).toString().trim();
    if (productName.isEmpty()) productName = "CEditor " + panelFile.getFileNameWithoutExtension();

    auto vendor = setting ("vendor");
    if (vendor.isEmpty()) vendor = fallback::vendorName();

    auto version = setting ("version");
    if (version.isEmpty()) version = fallback::version();

    auto manufacturerCode = setting ("manufacturerCode");
    if (manufacturerCode.isEmpty()) manufacturerCode = fallback::manufacturerCode();
    manufacturerCode = fallback::padManufacturerCode (manufacturerCode);

    out.identity = deriveIdentity (guid, productName, vendor, manufacturerCode, version);
    out.manufacturerCode = fourccFromCode (out.identity.manufacturerCode);
    out.pluginCode = fourccFromCode (out.identity.pluginCode);
    out.valid = true;
    return out;
}

/**
 * The directories a template binary looks in for its panel, nearest first.
 *
 * A Windows VST3 is a bundle, not a bare DLL: the binary lives at
 * `Foo.vst3/Contents/x86_64-win/Foo.vst3`, three levels below the thing a user thinks of as "the
 * plugin". Dropping a panel next to the binary would mean burying it where nobody would look, so
 * the bundle root and the VST3-conventional `Contents/Resources` are searched too. A standalone or
 * a bare `.vst3` DLL has none of that structure and is covered by the first entry.
 *
 * Nearest-first, so a panel deliberately placed beside the binary beats one at the bundle root.
 */
inline juce::Array<juce::File> panelSearchDirectories (const juce::File& moduleFile)
{
    const auto binaryDir = moduleFile.isDirectory() ? moduleFile : moduleFile.getParentDirectory();

    juce::Array<juce::File> directories;
    directories.add (binaryDir);

    // .../Contents/<arch>/Foo.vst3  ->  .../Contents/Resources  and  the bundle root
    const auto archDir = binaryDir;
    const auto contentsDir = archDir.getParentDirectory();
    if (contentsDir.getFileName() == "Contents")
    {
        directories.addIfNotAlreadyThere (contentsDir.getChildFile ("Resources"));
        directories.addIfNotAlreadyThere (contentsDir.getParentDirectory());
    }

    return directories;
}

/**
 * The panel a template binary should adopt: a single `.cepanel` in the nearest directory that has
 * any.
 *
 * Exactly one, deliberately. Two panels in one place is an ambiguity with no right answer, and
 * picking the alphabetically-first would mean a plugin that silently changes identity when somebody
 * drops a file in the folder — the FUID instability that breaks saved sessions. So an ambiguous
 * directory refuses outright rather than falling through to the next candidate: falling through
 * would resolve the ambiguity by accident, which is worse than not resolving it.
 */
inline juce::File findPanelBesideModule (const juce::File& moduleFile)
{
    for (const auto& directory : panelSearchDirectories (moduleFile))
    {
        if (! directory.isDirectory())
            continue;

        const auto panels = directory.findChildFiles (juce::File::findFiles, false, "*.cepanel");
        if (panels.isEmpty())
            continue;

        return panels.size() == 1 ? panels.getFirst() : juce::File();
    }
    return {};
}

/** Read and derive in one step. Invalid (rather than throwing) for every failure a copy can cause. */
inline SidecarIdentity readIdentityBesideModule (const juce::File& moduleFile)
{
    const auto panel = findPanelBesideModule (moduleFile);
    if (! panel.existsAsFile())
        return {};

    const auto parsed = juce::JSON::parse (panel.loadFileAsString());
    if (! parsed.isObject())
        return {};

    return identityFromPanelDocument (parsed, panel);
}

/**
 * The panel this binary should load: the one beside the module if there is one, else the path baked
 * in at build time.
 *
 * The same lookup that decides identity decides the content, deliberately — a binary that took its
 * FUID from one panel and its controls from another would be a plugin lying to the host about what
 * it is. One answer, used for both.
 *
 * Resolved once. A host may ask for the panel at several points in a plugin's life and the answer
 * must not change under it; caching also means the directory scan happens once rather than on every
 * query.
 */
inline juce::File resolvePlayerPanelFile (const juce::String& compiledPath)
{
    static const juce::File resolved = [&compiledPath]
    {
        const auto module = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
        const auto beside = findPanelBesideModule (module);
        return beside.existsAsFile() ? beside : juce::File (compiledPath);
    }();

    return resolved;
}

} // namespace ceditor::exporter
