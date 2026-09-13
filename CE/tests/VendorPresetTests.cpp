#include "InstrumentHost/VendorPresetDiscovery.h"
#include <iostream>

using namespace ceditor::host;
namespace
{
int failures = 0;
void check (bool condition, const char* message)
{
    if (! condition) { ++failures; std::cerr << "FAIL " << message << '\n'; }
}
void mpString (juce::MemoryOutputStream& out, const juce::String& text)
{
    out.writeByte (static_cast<char> (0xd9));
    out.writeByte (static_cast<char> (text.getNumBytesAsUTF8()));
    out.write (text.toRawUTF8(), text.getNumBytesAsUTF8());
}
juce::MemoryBlock nksFixture (bool legacy = false, bool vst3 = false)
{
    juce::MemoryOutputStream content;
    content.write ("NIKS", 4);
    const auto chunk = [&] (const char* id, const juce::MemoryOutputStream& payload)
    {
        content.write (id, 4); content.writeInt (static_cast<int> (payload.getDataSize()) + 4);
        content.writeInt (1); content.write (payload.getData(), payload.getDataSize());
        if (payload.getDataSize() & 1) content.writeByte (0);
    };
    juce::MemoryOutputStream identity;
    identity.writeByte (static_cast<char> (legacy ? 0x81 : 0x83));
    if (! legacy)
    {
        mpString (identity, "pluginName"); mpString (identity, "Massive X");
        mpString (identity, "pluginVendor"); mpString (identity, "Native Instruments");
    }
    if (vst3)
    {
        mpString (identity, "VST3.uid"); identity.writeByte (static_cast<char> (0x94));
        for (const auto word : { 0x5653544e, 0x6924486d, 0x61737369, 0x76652078 })
        { identity.writeByte (static_cast<char> (0xce)); identity.writeIntBigEndian (word); }
    }
    else { mpString (identity, "VST.magic"); identity.writeByte (static_cast<char> (0xce)); identity.writeIntBigEndian (0x4e692448); }
    chunk ("PLID", identity);
    juce::MemoryOutputStream metadata;
    metadata.writeByte (static_cast<char> (0x81));
    mpString (metadata, "name"); mpString (metadata, juce::String::fromUTF8 ("Warm \xc3\xa9" "cho"));
    chunk ("NISI", metadata);
    juce::MemoryOutputStream state;
    state.writeInt (2); state.writeInt (2); state.writeInt (8); state.writeInt (123);
    chunk ("PCHK", state);
    juce::MemoryOutputStream file;
    file.write ("RIFF", 4); file.writeInt (static_cast<int> (content.getDataSize()));
    file.write (content.getData(), content.getDataSize());
    return file.getMemoryBlock();
}
juce::MemoryBlock fxpFixture()
{
    juce::MemoryOutputStream out;
    out.write ("CcnK", 4); out.writeIntBigEndian (68);
    out.write ("FPCh", 4); out.writeIntBigEndian (1);
    out.write ("VGRD", 4); out.writeIntBigEndian (0x02000700); out.writeIntBigEndian (0);
    out.writeRepeatedByte (0, 28); out.writeIntBigEndian (16);
    out.write ("VGRD2 Preset", 12); out.writeInt (0);
    return out.getMemoryBlock();
}
PluginCatalog fixtureCatalog()
{
    PluginCatalog catalog;
    int index = 0;
    for (const auto& pair : { std::pair { "Massive X", "Native Instruments" },
                              std::pair { "Vanguard", "reFX" }, std::pair { "Spire", "Reveal Sound" } })
    {
        ModuleScanResult scan;
        scan.modulePath = "/fixture/" + juce::String (++index) + ".vst3";
        PluginClassRecord plugin;
        plugin.name = pair.first; plugin.vendor = pair.second;
        plugin.ceId = "test-" + juce::String (index); plugin.isInstrument = true;
        scan.classes.add (plugin); catalog.commitScanResult (scan);
    }
    return catalog;
}
void testParsersAndDiscovery()
{
    const auto root = juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("hostage-vendor-tests-" + juce::Uuid().toString());
    root.createDirectory();
    const auto nks = root.getChildFile ("Categories/Deep/Name.nksf");
    nks.getParentDirectory().createDirectory();
    auto data = nksFixture(); nks.replaceWithData (data.getData(), data.getSize());
    const auto fxp = root.getChildFile ("Arp.fxp");
    data = fxpFixture(); fxp.replaceWithData (data.getData(), data.getSize());
    const auto spire = root.getChildFile ("Bass.spf2");
    spire.replaceWithText (R"({"parameters":{"volume":0.6,"osc1_type":0.1},"tags":["Bass"]})");
    const auto nk = readVendorPreset (nks);
    check (nk && nk.sourceType == "nksf" && nk.instrument == "Massive X"
           && nk.componentState.getSize() == 16 && nk.name.startsWith ("Warm"), "NKS identity, UTF-8 metadata and unwrapped component state");
    check (readVendorPreset (fxp).componentState.getSize() == 16, "FXP strips its 60-byte VST2 wrapper");
    check (readVendorPreset (spire).sourceType == "spire", "Spire reads its parameter map");
    const auto catalog = fixtureCatalog();
    const auto records = discoverVendorPresets (catalog, { root, nks.getParentDirectory(), root });
    check (records.size() == 3, "recursive roots overlap without duplicating presets");
    for (const auto& record : records)
        check (record.targetCeId.isNotEmpty() && record.fingerprint.length() == 64, "target identity comes from metadata, independent of category folder");
    Library library;
    for (const auto& record : records) library.mergeVendorScan (record.sourceType, { record });
    const auto id = library.allRecords()[0].recordId;
    library.find (id)->user.favourite = true;
    library.find (id)->user.notes = "Keep this";
    library.find (id)->user.tags.add ("Live set");
    const auto renamed = nks.getSiblingFile ("Renamed.nksf"); nks.moveFileTo (renamed);
    const auto updated = discoverVendorPresets (catalog, { root });
    for (const auto& source : { "nksf", "fxp", "spire" })
    {
        juce::Array<LibraryRecord> subset;
        for (const auto& record : updated) if (record.sourceType == source) subset.add (record);
        library.mergeVendorScan (source, subset);
    }
    check (library.allRecords().size() == 3 && library.find (id)->user.favourite
           && library.find (id)->user.notes == "Keep this"
           && library.find (id)->user.tags.contains ("Live set"), "rescan retains identity, favourites, tags and notes");
    data = nksFixture (true);
    const auto legacy = root.getChildFile ("Legacy.nksf");
    legacy.replaceWithData (data.getData(), data.getSize());
    check (static_cast<bool> (readVendorPreset (legacy)), "legacy NKS expansions resolve by VST magic without optional display names");
    data = nksFixture (true, true);
    legacy.replaceWithData (data.getData(), data.getSize());
    check (static_cast<bool> (readVendorPreset (legacy)), "VST3-only NKS expansions resolve by class UID without VST2 magic");
    data = nksFixture();
    const auto broken = root.getChildFile ("Bad.nksf");
    for (size_t length = 0; length < data.getSize(); ++length)
    {
        broken.replaceWithData (data.getData(), length);
        check (! readVendorPreset (broken), "truncated NKS must be rejected");
    }
    data = fxpFixture(); static_cast<char*> (data.getData())[16] = 'X';
    fxp.replaceWithData (data.getData(), data.getSize());
    check (! readVendorPreset (fxp), "foreign FXP must not be sent to Vanguard");
    spire.replaceWithText (R"({"parameters":{"volume":8,"osc1_type":0.1}})");
    check (! readVendorPreset (spire), "out-of-range Spire values are rejected");
    check (! isVendorPresetSource ("userState") && isVendorPresetSource ("spire"), "all file sources use the vendor loader");
    root.deleteRecursively();
}

void testEffectVstPresetDiscovery()
{
    const auto root = juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("hostage-fx-presets-" + juce::Uuid().toString());
    root.createDirectory();
    PluginCatalog catalog;
    ModuleScanResult module;
    module.modulePath = root.getChildFile ("Effect.vst3").getFullPathName();
    PluginClassRecord effect;
    effect.ceId = "effect"; effect.name = "An Effect"; effect.vendor = "Test";
    // Normalised FUID [1,2,3,4] hashes to 0x7c42 with JUCE's multiply-by-31 hash.
    effect.descriptionXml = "<PLUGIN uniqueId=\"7c42\"/>";
    module.classes.add (effect); catalog.commitScanResult (module);
    juce::MemoryOutputStream file;
    file.write ("VST3", 4); file.writeInt (1);
    file.write ("00000001000000020000000300000004", 32); file.writeInt64 (48);
    const auto preset = root.getChildFile ("No matching folder.vstpreset");
    preset.replaceWithData (file.getData(), file.getDataSize());
    const auto records = discoverVstPresetFiles (catalog, { root, root });
    check (records.size() == 1 && records[0].targetCeId == "effect" && records[0].instrument == "An Effect",
           "VST3 UID resolves an effect without a rack or a matching folder, overlapping roots deduplicate");
    root.deleteRecursively();
}

void testZebra3Presets()
{
    const auto root = juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("hostage-zebra-tests-" + juce::Uuid().toString());
    const auto folder = root.getChildFile ("Zebra3.data/Presets/Zebra3/Keys");
    folder.createDirectory();
    const auto preset = folder.getChildFile (juce::String::fromUTF8 ("Glass \xc3\xa9" "cho.h2p"));
    // Synthetic text only; no vendor sound content is checked into the repository.
    const juce::String patch = "#pgm=Old name.h2p\n#AM=Zebra3\n#Vers=1\n"
                               "#cm=MainMix\nVolume=60.00\n#cm=MPreset\nData=fixture\n";
    preset.replaceWithText (patch);
    const auto parsed = readVendorPreset (preset);
    check (parsed && parsed.sourceType == "h2p" && parsed.instrument == "Zebra3"
           && parsed.name == preset.getFileNameWithoutExtension(), "H2P uses the actual UTF-8 preset filename");
    check (parsed.componentState.toString().startsWith ("#pgm=" + preset.getFileName() + "\n")
           && ! parsed.componentState.toString().contains ("Old name"), "recall replaces stale embedded names as well as the library label");

    PluginCatalog catalog;
    ModuleScanResult module;
    module.modulePath = root.getChildFile ("u-he/Zebra3.vst3").getFullPathName();
    PluginClassRecord plugin;
    plugin.ceId = "test-zebra"; plugin.name = "Zebra3"; plugin.vendor = "u-he"; plugin.isInstrument = true;
    module.classes.add (plugin); catalog.commitScanResult (module);
    check (vendorPresetRoots (catalog, {}).contains (folder.getParentDirectory()), "data beside the VST3 vendor folder is discovered");
    const auto records = discoverVendorPresets (catalog, { root, folder });
    check (records.size() == 1 && records[0].name == parsed.name && records[0].targetCeId == "test-zebra",
           "H2P resolves to a catalogue class without a rack and overlapping roots do not duplicate it");
    Library library;
    library.mergeVendorScan ("h2p", records);
    const auto id = library.allRecords()[0].recordId;
    library.find (id)->user.favourite = true;
    const auto renamed = preset.getSiblingFile ("Renamed Glass.h2p");
    preset.moveFileTo (renamed);
    library.mergeVendorScan ("h2p", discoverVendorPresets (catalog, { root }));
    check (library.find (id)->name == "Renamed Glass" && library.find (id)->user.favourite,
           "a renamed H2P refreshes the real name while preserving its favourite and identity");
    renamed.replaceWithText ("#AM=Zebra3\n#Vers=1\n#cm=Osc1\nVolume=60.00\n");
    check (! readVendorPreset (renamed), "Zebra3 module presets are not complete sounds");
    renamed.replaceWithText (patch.replace ("#AM=Zebra3", "#AM=Zebra2"));
    check (! readVendorPreset (renamed), "foreign H2P files cannot load into Zebra3");
    renamed.replaceWithText (patch.replace ("#Vers=1", "#Vers=99"));
    check (! readVendorPreset (renamed), "unknown H2P versions are refused");
    for (const auto* name : { "Program 0", "Program 127", "preset01", "Preset 002", "Slot #3" })
        check (isZebra3ProgramSlot ("Zebra3", "u-he", name), "known Zebra3 numbered slots are not named presets");
    check (! isZebra3ProgramSlot ("Zebra3", "u-he", "Program Change Pad")
           && ! isZebra3ProgramSlot ("Other Synth", "Other", "Program 1")
           && isVendorPresetSource ("h2p"), "real named programs survive and H2P uses the file loader");
    root.deleteRecursively();
}
}
int main (int argc, char** argv)
{
    if (argc == 3)
    {
        PluginCatalog catalog;
        if (! catalog.loadFrom (juce::File (juce::String::fromUTF8 (argv[1])))) return 2;
        const auto records = discoverVendorPresets (catalog, vendorPresetRoots (catalog, {}));
        Library library;
        for (const auto& record : records) library.addCapturedRecord (record);
        library.saveTo (juce::File (juce::String::fromUTF8 (argv[2])));
        for (const auto& source : { "nksf", "fxp", "spire", "h2p" })
        {
            int count = 0; for (const auto& record : records) if (record.sourceType == source) ++count;
            std::cout << source << ": " << count << '\n';
        }
        return records.isEmpty() ? 1 : 0;
    }
    testParsersAndDiscovery();
    testEffectVstPresetDiscovery();
    testZebra3Presets();
    std::cout << (failures == 0 ? "ALL PASSED" : "FAILED") << '\n';
    return failures == 0 ? 0 : 1;
}
