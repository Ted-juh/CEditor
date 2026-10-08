#pragma once

#include <juce_core/juce_core.h>

// HostageManifest — what a HoSTage program is told about itself, and where that puts its data
// (docs/design/hostage-creator-editor-player.md).
//
// hostage.json sits where factory-performance.json does — beside the standalone's exe, or in the
// VST3 bundle's Contents/Resources — and is written by whatever made the program:
// build-host-product.mjs today, the player creator later.
//
//   { "role": "player", "product": { "name": "Super Rack", "appId": "8F3A…" },
//     "show": "Super Rack.hostageshow", "portable": true }
//
// Missing, unreadable, or a field absent or malformed: the editor, with no product identity. That
// is what a program from a build tree is, and what every product built before the manifest
// carried an identity is.
//
// juce_core only, so the host's tests drive it without a webview or the embedded web bundle.

namespace ceditor::host
{

struct HostageManifest
{
    bool player = false;
    juce::String productName;
    /** The Host Project's appId, upper-case, or empty. It is the installer's identity and names
        the product's data folder: the one thing about a product that never changes, so a product
        renamed between builds keeps its rig. */
    juce::String appId;
    /** The built-in show to open on the first start (HostShow.h): a bare file name in the
        program's shows folder, or empty for the first one there. */
    juce::String showFileName;
    /** Keeps its data beside the program rather than in the user's folder, so that it travels
        with it — the USB stick player (step 6). The standalone only: a VST3 lives wherever the
        DAW keeps plug-ins. */
    bool portable = false;

    bool hasProduct() const noexcept { return appId.isNotEmpty(); }
};

/** A GUID in its dashed 8-4-4-4-12 form, upper-cased, or empty. It becomes a folder name, so
    nothing but hex digits in that pattern gets through — "..", a slash or a drive never does. */
inline juce::String normaliseProductId (const juce::String& raw)
{
    const auto id = raw.trim().toUpperCase();
    if (id.length() != 36)
        return {};
    for (int i = 0; i < 36; ++i)
    {
        const bool dashHere = i == 8 || i == 13 || i == 18 || i == 23;
        if (dashHere ? id[i] != '-' : juce::CharacterFunctions::getHexDigitValue (id[i]) < 0)
            return {};
    }
    return id;
}

inline HostageManifest parseHostageManifest (const juce::var& json)
{
    HostageManifest manifest;
    manifest.player = json.getProperty ("role", {}).toString() == "player";
    const auto product = json.getProperty ("product", {});
    manifest.appId = normaliseProductId (product.getProperty ("appId", {}).toString());
    if (manifest.hasProduct())
        manifest.productName = product.getProperty ("name", {}).toString().trim();

    // A file name and nothing more: it is looked up in the program's own shows folder.
    const auto show = json.getProperty ("show", {}).toString().trim();
    if (show.endsWithIgnoreCase (".hostageshow") && ! show.containsAnyOf ("/\\:") && ! show.startsWith (".."))
        manifest.showFileName = show;
    manifest.portable = (bool) json.getProperty ("portable", false);
    return manifest;
}

/** hostage.json beside a module, or in the bundle's Resources one level up from it. */
inline HostageManifest readHostageManifestBeside (const juce::File& moduleDir)
{
    for (const auto& candidate : { moduleDir.getChildFile ("hostage.json"),
                                   moduleDir.getParentDirectory().getChildFile ("Resources")
                                            .getChildFile ("hostage.json") })
        if (candidate.existsAsFile())
            return parseHostageManifest (juce::JSON::parse (candidate));
    return {};
}

// -- where a program keeps its data ------------------------------------------------------------
// Every HoSTage program outside CEditor keeps its per-user data under CEditorInstrumentHost — a
// name from before HoSTage had one, kept because existing rigs live there. Until each product
// knew which one it was, every built product used that folder itself, so two products on one
// machine overwrote each other's rig, plug-in list, sound library and licence. A program that
// knows its product now keeps its own folder, products/<appId>, inside it. One that does not —
// a build tree, or a product built before hostage.json said — keeps the folder its data is
// already in.

inline juce::File hostDataRoot()
{
    return juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
               .getChildFile ("CEditorInstrumentHost");
}

inline juce::File productDataDirectory (const juce::File& root, const HostageManifest& manifest)
{
    return manifest.hasProduct() ? root.getChildFile ("products").getChildFile (manifest.appId)
                                 : root;
}

/** Where a portable program keeps its data: a Data folder beside it, when that folder can be
    written — tried by writing, since a folder can look writable and not be (Program Files, a
    stick with its lock switch on). Otherwise the per-user folder it would have used anyway, so a
    portable program copied somewhere read-only still starts, with its data on this computer. */
inline juce::File dataDirectoryFor (const HostageManifest& manifest, const juce::File& programDir,
                                    const juce::File& root)
{
    if (manifest.portable && programDir != juce::File())
    {
        const auto beside = programDir.getChildFile ("Data");
        const auto probe = beside.getChildFile (".write-test");
        if (beside.createDirectory().wasOk() && probe.replaceWithText ("HoSTage") && probe.deleteFile())
            return beside;
    }
    return productDataDirectory (root, manifest);
}

/** Leaves product.json in a product's folder, naming the product. The folder is named by an id,
    so that a rename keeps the rig; this file is how somebody looking in it tells which is which. */
inline void labelProductDataDirectory (const juce::File& directory, const HostageManifest& manifest)
{
    if (! manifest.hasProduct())
        return;

    auto* label = new juce::DynamicObject();
    label->setProperty ("name", manifest.productName);
    label->setProperty ("appId", manifest.appId);
    const auto text = juce::JSON::toString (juce::var (label));
    const auto file = directory.getChildFile ("product.json");
    if (file.loadFileAsString() != text && directory.createDirectory().wasOk())
        file.replaceWithText (text);
}

} // namespace ceditor::host
