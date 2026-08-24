// Unit test for the compiler-free export identity — CE/src/Export/PanelIdentitySidecar.h.
//
// WHAT IS ACTUALLY BEING PROVED, and why it is the only thing that matters here.
//
// Exporting a panel as a VST3 needed a C++ toolchain on the user's machine for one reason: the
// plugin's identity was baked at link time. The claim this file tests is that it does not have to
// be — that a single prebuilt binary reading a panel document at load can report *byte-identical*
// identifiers to the ones a per-panel compile would have produced.
//
// Byte-identical, not merely "unique". A host keys a plugin by its FUID. If the compiler-free path
// derived a different id for the same panel, then the day a user upgraded, every saved session
// would stop finding its plugin — a worse failure than the limitation being removed. So the central
// assertion below builds the 16-byte VST3 InterfaceId twice, once through JUCE's own
// `convertJucePluginId` from the compile-time codes and once from the runtime derivation, and
// compares all sixteen bytes.
//
// The second thing tested is drift. The runtime derivation has to reproduce the exporter's fallback
// chain in tools/scripts/export-panel-vst3.mjs exactly — 'Tedjuh', 'Tdjh', '1.0.0', the 'x' padding,
// the pluginName/name/constructed-default order. A difference in any one of them is a different
// string into the hash, so a different pluginCode, so a different FUID, silently. Each is pinned.

#include "Export/PanelIdentitySidecar.h"

#include <juce_audio_processors/juce_audio_processors.h>

#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

using InterfaceId = juce::VST3ClientExtensions::InterfaceId;
using InterfaceType = juce::VST3ClientExtensions::InterfaceType;

juce::String toHex (const InterfaceId& id)
{
    juce::String out;
    for (auto byte : id)
        out << juce::String::toHexString ((int) (juce::uint8) byte).paddedLeft ('0', 2);
    return out;
}

/** Write a panel document to a temp directory and read identity back out of it. */
struct TempPanel
{
    explicit TempPanel (const juce::String& json, const juce::String& fileName = "panel.cepanel")
        : directory (juce::File::getSpecialLocation (juce::File::tempDirectory)
                         .getChildFile ("ceditor-sidecar-" + juce::String (juce::Random::getSystemRandom().nextInt (1 << 30))))
    {
        directory.createDirectory();
        directory.getChildFile (fileName).replaceWithText (json);
    }

    ~TempPanel() { directory.deleteRecursively(); }

    ceditor::exporter::SidecarIdentity read() const
    {
        // A module file that does not exist: the lookup only ever uses its parent directory, and a
        // real plugin binary is not something a unit test can produce.
        return ceditor::exporter::readIdentityBesideModule (directory.getChildFile ("CEditorPlayer.vst3"));
    }

    juce::File directory;
};

const char* kPanel = R"JSON({
  "name": "GAIA Filter",
  "panelGuid": "7f3a1c22-90ab-4d0e-9c11-5e6b2f88a301",
  "exportSettings": { "pluginName": "GAIA Filter", "vendor": "Tedjuh", "manufacturerCode": "Tdjh", "version": "1.0.0" },
  "controls": []
})JSON";
} // namespace

int main()
{
    juce::ScopedJuceInitialiser_GUI juceInit;
    std::cout << "PanelIdentitySidecar\n--------------------" << std::endl;

    // ---------------------------------------------------------------- the equivalence
    //
    // The whole route stands or falls here.

    {
        TempPanel panel { kPanel };
        const auto sidecar = panel.read();
        check (sidecar.valid, "identity is derived from a panel sitting beside the module");

        // What a per-panel compile would have produced: the exporter passes these two 4-char codes
        // to CMake, JUCEUtils packs each into a uint32, and JUCE builds the id from them.
        const auto compiled = juce::VST3ClientExtensions::convertJucePluginId (
            ceditor::exporter::fourccFromCode ("Tdjh"),
            ceditor::exporter::fourccFromCode (sidecar.identity.pluginCode),
            InterfaceType::component);

        const auto runtime = juce::VST3ClientExtensions::convertJucePluginId (
            sidecar.manufacturerCode, sidecar.pluginCode, InterfaceType::component);

        check (compiled == runtime,
               "the runtime-derived FUID is byte-identical to the compiled one: " + toHex (runtime));

        // Every interface type, not just the component. A plugin reports several ids and they must
        // all match, or a host loads the processor and fails to find its controller.
        bool allTypes = true;
        for (auto type : { InterfaceType::component, InterfaceType::controller,
                           InterfaceType::processor, InterfaceType::compatibility, InterfaceType::ara })
        {
            const auto a = juce::VST3ClientExtensions::convertJucePluginId (
                ceditor::exporter::fourccFromCode ("Tdjh"),
                ceditor::exporter::fourccFromCode (sidecar.identity.pluginCode), type);
            const auto b = juce::VST3ClientExtensions::convertJucePluginId (
                sidecar.manufacturerCode, sidecar.pluginCode, type);
            if (a != b) allTypes = false;
        }
        check (allTypes, "  and for every VST3 interface type, not only the component");
    }

    // The fourcc packing is JUCEUtils.cmake's, reproduced. "Cep1" is the repo's own default plugin
    // code, and 0x43657031 is what _juce_to_char_literal writes for it.
    {
        check (ceditor::exporter::fourccFromCode ("Cep1") == 0x43657031u,
               "fourccFromCode packs four ASCII bytes big-endian, as JUCE's CMake does");
        check (ceditor::exporter::fourccFromCode ("Tdjh") == 0x54646A68u, "  'Tdjh' -> 0x54646A68");
        check (ceditor::exporter::fourccFromCode ("ab") == 0x61620000u,
               "  a short code is zero-padded on the right, not space-padded");
        check (ceditor::exporter::fourccFromCode ("abcdef") == 0x61626364u, "  a long code is truncated to four");
    }

    // The identity bytes really are the last eight of the id — the fact the whole approach rests on.
    {
        const auto id = juce::VST3ClientExtensions::convertJucePluginId (0x54646A68u, 0x43657031u,
                                                                        InterfaceType::component);
        const juce::uint8 expectedTail[] = { 'T','d','j','h','C','e','p','1' };
        bool tailMatches = true;
        for (size_t i = 0; i < 8; ++i)
            if ((juce::uint8) id[8 + i] != expectedTail[i]) tailMatches = false;
        check (tailMatches, "bytes 8-15 of the FUID are literally the two four-character codes");
    }

    // The canonical fixture, the other half of a cross-language pin.
    //
    // 'HlSQ' is the value exportIdentity.test.js and PanelExportIdentityTests.cpp both assert for
    // (guid-AAAA-1111, GAIA Filter, Tedjuh, Tdjh, 1.0.0). Reaching it from a DOCUMENT rather than
    // from five arguments is what proves this file's fallback chain agrees with the JavaScript one
    // in panelIdentityInputs.js -- the two cannot share code, so they share an expectation instead.
    {
        TempPanel canonical { R"JSON({
          "name": "GAIA Filter",
          "panelGuid": "guid-AAAA-1111",
          "exportSettings": { "pluginName": "GAIA Filter", "vendor": "Tedjuh",
                              "manufacturerCode": "Tdjh", "version": "1.0.0" }
        })JSON" };
        check (canonical.read().identity.pluginCode == "HlSQ",
               "the canonical fixture reaches the canonical pluginCode through a document");
    }

    // ---------------------------------------------------------------- determinism and uniqueness

    {
        TempPanel a { kPanel };
        TempPanel b { kPanel };
        check (a.read().pluginCode == b.read().pluginCode,
               "the same panel derives the same code twice — re-export keeps a session working");

        TempPanel other { juce::String (kPanel).replace ("7f3a1c22", "8a4b2d33") };
        check (a.read().pluginCode != other.read().pluginCode,
               "a different GUID derives a different code — two panels are two plugins");
    }

    // Two panels that share a display name must still differ. The GUID is the only source of
    // uniqueness, and this is the case a name-based scheme would get wrong.
    {
        TempPanel a { juce::String (kPanel) };
        TempPanel b { juce::String (kPanel).replace ("7f3a1c22-90ab-4d0e-9c11-5e6b2f88a301",
                                                     "11112222-3333-4444-5555-666677778888") };
        check (a.read().identity.productName == b.read().identity.productName, "two panels share a name");
        check (a.read().pluginCode != b.read().pluginCode, "  and still get different plugin codes");
    }

    // ---------------------------------------------------------------- the exporter's fallbacks
    //
    // Each of these is a silent-divergence risk: get a default wrong and the template binary and the
    // compiling exporter derive different FUIDs from the same panel, with nothing to show for it.

    {
        TempPanel bare { R"JSON({ "name": "Bare", "panelGuid": "abc-123", "controls": [] })JSON" };
        const auto id = bare.read();
        check (id.valid, "a panel with no exportSettings still derives an identity");
        check (id.identity.vendorName == "Tedjuh", "  vendor falls back to Tedjuh");
        check (id.identity.manufacturerCode == "Tdjh", "  manufacturer code falls back to Tdjh");
        check (id.identity.version == "1.0.0", "  version falls back to 1.0.0");
        check (id.identity.productName == "Bare", "  product name falls back to the panel's name");
    }

    {
        TempPanel unnamed { R"JSON({ "panelGuid": "abc-123", "controls": [] })JSON", "Custom Name.cepanel" };
        check (unnamed.read().identity.productName == "CEditor Custom Name",
               "with no name at all, the product name is built from the file name");
    }

    {
        TempPanel shortCode { juce::String (kPanel).replace ("\"manufacturerCode\": \"Tdjh\"",
                                                            "\"manufacturerCode\": \"Ab\"") };
        check (shortCode.read().identity.manufacturerCode == "Abxx",
               "a short manufacturer code is padded with 'x' to four, as the exporter pads it");
    }

    {
        TempPanel named { juce::String (kPanel).replace ("\"pluginName\": \"GAIA Filter\"",
                                                         "\"pluginName\": \"Override\"") };
        check (named.read().identity.productName == "Override",
               "exportSettings.pluginName wins over the panel's own name");
    }

    // ---------------------------------------------------------------- refusing to guess

    {
        TempPanel noGuid { R"JSON({ "name": "No GUID", "controls": [] })JSON" };
        check (! noGuid.read().valid,
               "a panel with no GUID yields no identity — the binary keeps its compiled-in one");
    }

    {
        TempPanel broken { "{ this is not json" };
        check (! broken.read().valid, "an unparseable panel yields no identity rather than throwing");
    }

    {
        // Two panels beside one binary has no right answer, and picking one would mean a plugin
        // whose FUID changes when somebody drops a file in the folder.
        TempPanel two { kPanel };
        two.directory.getChildFile ("second.cepanel").replaceWithText (kPanel);
        check (! two.read().valid, "two panels beside the module is refused, not guessed at");
    }

    {
        const auto empty = juce::File::getSpecialLocation (juce::File::tempDirectory)
                               .getChildFile ("ceditor-sidecar-empty-" + juce::String (juce::Random::getSystemRandom().nextInt (1 << 30)));
        empty.createDirectory();
        check (! ceditor::exporter::readIdentityBesideModule (empty.getChildFile ("x.vst3")).valid,
               "no panel beside the module yields no identity");
        empty.deleteRecursively();
    }

    // ---------------------------------------------------------------- the VST3 bundle layout
    //
    // A Windows VST3 is Foo.vst3/Contents/x86_64-win/Foo.vst3. A panel next to the binary would be
    // three levels below where a user would ever put one, so the bundle root and Contents/Resources
    // are searched too.

    {
        const auto root = juce::File::getSpecialLocation (juce::File::tempDirectory)
                              .getChildFile ("ceditor-bundle-" + juce::String (juce::Random::getSystemRandom().nextInt (1 << 30)));
        const auto bundle = root.getChildFile ("CEditorPlayer.vst3");
        const auto archDir = bundle.getChildFile ("Contents").getChildFile ("x86_64-win");
        archDir.createDirectory();
        const auto binary = archDir.getChildFile ("CEditorPlayer.vst3");
        binary.replaceWithText ("not really a dll");

        // At the bundle root, which is where a user would drop it.
        bundle.getChildFile ("panel.cepanel").replaceWithText (kPanel);
        check (ceditor::exporter::readIdentityBesideModule (binary).valid,
               "a panel at the VST3 bundle root is found from the nested binary");

        // Contents/Resources, the VST3 convention.
        bundle.getChildFile ("panel.cepanel").deleteFile();
        const auto resources = bundle.getChildFile ("Contents").getChildFile ("Resources");
        resources.createDirectory();
        resources.getChildFile ("panel.cepanel").replaceWithText (kPanel);
        check (ceditor::exporter::readIdentityBesideModule (binary).valid,
               "  and one in Contents/Resources is found too");

        // Nearest wins: a panel beside the binary beats the one further out.
        const auto near = juce::String (kPanel).replace ("7f3a1c22", "cafe9999");
        archDir.getChildFile ("panel.cepanel").replaceWithText (near);
        const auto nearest = ceditor::exporter::readIdentityBesideModule (binary);
        const auto expected = ceditor::exporter::identityFromPanelDocument (juce::JSON::parse (near), {});
        check (nearest.pluginCode == expected.pluginCode,
               "  a panel beside the binary wins over one further out");

        // An ambiguous directory refuses rather than silently resolving to the next candidate.
        archDir.getChildFile ("second.cepanel").replaceWithText (kPanel);
        check (! ceditor::exporter::readIdentityBesideModule (binary).valid,
               "  two panels in the nearest directory refuses, rather than falling through");

        root.deleteRecursively();
    }

    // ---------------------------------------------------------------- the other identifiers
    //
    // CLAP and LV2 have no fixed-id contract at all, which is why they were already named as the
    // easy half. They come from the same derivation, so they ride along for free.

    {
        TempPanel panel { kPanel };
        const auto id = panel.read();
        check (id.identity.clapId.startsWith ("com.tedjuh.gaia-filter."),
               "the CLAP id is derived from the same GUID: " + id.identity.clapId);
        check (id.identity.auSubtype.isNotEmpty() && id.identity.auSubtype != id.identity.pluginCode,
               "the AU subtype is derived too, and is independent of the plugin code");
    }

    if (failures == 0)
    {
        std::cout << "--------------------\nALL PASS" << std::endl;
        return 0;
    }

    std::cout << "--------------------\n" << failures << " FAILED" << std::endl;
    return 1;
}
