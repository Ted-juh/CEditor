#pragma once

#include "VendorPreset.h"
#include "Library.h"
#include "PluginCatalog.h"
#include <juce_cryptography/juce_cryptography.h>

namespace ceditor::host
{
inline juce::Array<PluginClassRecord> presetCatalogueClasses (const PluginCatalog& catalog)
{
    auto classes = catalog.instrumentClasses();
    classes.addArray (catalog.effectClasses());
    juce::StringArray seen;
    for (int i = classes.size(); --i >= 0;)
        if (classes[i].formatName != "VST3" || seen.contains (classes[i].ceId)) classes.remove (i);
        else seen.add (classes[i].ceId);
    return classes;
}

inline juce::Array<juce::File> vendorPresetRoots (const PluginCatalog& catalog,
                                                const juce::StringArray& additionalPaths)
{
    juce::Array<juce::File> roots;
    const auto add = [&] (const juce::File& path)
    {
        if (path.isDirectory() && ! roots.contains (path)) roots.add (path);
    };
    const auto documents = juce::File::getSpecialLocation (juce::File::userDocumentsDirectory);
    const auto shared = juce::File::getSpecialLocation (juce::File::commonDocumentsDirectory);
    const auto appData = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory);
    for (const auto& plugin : presetCatalogueClasses (catalog))
    {
        if (plugin.formatName != "VST3") continue;
        if (plugin.name == "Massive X" && plugin.vendor == "Native Instruments")
        {
            add (documents.getChildFile ("Native Instruments/User Content/Massive X"));
            add (documents.getChildFile ("Native Instruments/Massive X"));
            add (shared.getChildFile ("Native Instruments"));
            for (const auto& entry : juce::RangedDirectoryIterator (shared, false, "*", juce::File::findDirectories))
                if (entry.getFile().getFileName().endsWithIgnoreCase (" Library"))
                    add (entry.getFile());
           #if JUCE_WINDOWS
            const auto content = juce::WindowsRegistry::getValue (
                "HKEY_LOCAL_MACHINE\\SOFTWARE\\Native Instruments\\Massive X Factory Library\\ContentDir");
            if (juce::File::isAbsolutePath (content)) add (juce::File (content));
           #endif
        }
        else if (plugin.name == "Vanguard" && plugin.vendor == "reFX")
        {
            add (shared.getChildFile ("reFX/VANGUARD library"));
            add (shared.getChildFile ("reFX/User Content"));
            add (documents.getChildFile ("reFX"));
            add (appData.getChildFile ("reFX/Vanguard"));
        }
        else if (plugin.name == "Spire" && plugin.vendor == "Reveal Sound")
        {
            add (appData.getChildFile ("RevealSound/Banks"));
            const auto config = juce::JSON::parse (appData.getChildFile ("RevealSound/spire_config.json"));
            const auto workspace = config.getProperty ("workspace_dir", {}).toString();
            if (juce::File::isAbsolutePath (workspace)) add (juce::File (workspace));
            for (const auto& module : catalog.allModules())
                for (const auto& candidate : module.classes)
                    if (candidate.ceId == plugin.ceId)
                    {
                        const juce::File location (module.path);
                        add (location.getParentDirectory().getChildFile ("Factory Presets"));
                        if (location.isDirectory()) add (location.getChildFile ("Contents/Resources/Factory Presets"));
                    }
        }
        else if (plugin.name.equalsIgnoreCase ("Zebra3") && plugin.vendor.equalsIgnoreCase ("u-he"))
        {
            const auto addData = [&] (const juce::File& data)
            {
                add (data.getChildFile ("Presets/Zebra3"));
                add (data.getChildFile ("UserPresets/Zebra3"));
            };
            addData (documents.getChildFile ("u-he/Zebra3.data"));
           #if JUCE_WINDOWS
            // The installer permits a custom data location independently of the VST3 DLL.
            for (const auto* hive : { "HKEY_CURRENT_USER", "HKEY_LOCAL_MACHINE" })
            {
                const auto location = juce::WindowsRegistry::getValue (
                    juce::String (hive) + "\\SOFTWARE\\U-HE\\Zebra3\\DataPath");
                if (juce::File::isAbsolutePath (location)) addData (juce::File (location));
            }
           #elif JUCE_MAC
            add (juce::File ("/Library/Audio/Presets/u-he/Zebra3"));
            add (juce::File::getSpecialLocation (juce::File::userHomeDirectory)
                .getChildFile ("Library/Audio/Presets/u-he/Zebra3"));
           #elif JUCE_LINUX
            addData (juce::File::getSpecialLocation (juce::File::userHomeDirectory).getChildFile (".u-he/Zebra3"));
           #endif
            for (const auto& module : catalog.allModules())
                for (const auto& candidate : module.classes)
                    if (candidate.ceId == plugin.ceId)
                    {
                        const auto parent = juce::File (module.path).getParentDirectory();
                        addData (parent.getChildFile ("Zebra3.data"));
                        addData (parent.getParentDirectory().getChildFile ("Zebra3.data"));
                    }
        }
    }
    for (const auto& path : additionalPaths)
        if (juce::File::isAbsolutePath (path)) add (juce::File (path));
    return roots;
}

inline juce::Array<LibraryRecord> discoverVendorPresets (const PluginCatalog& catalog,
                                                       const juce::Array<juce::File>& roots,
                                                       std::function<bool()> cancelled = {})
{
    const auto classes = presetCatalogueClasses (catalog);
    juce::Array<LibraryRecord> records;
    juce::SortedSet<juce::String> visited;
    for (const auto& root : roots)
        for (const auto& entry : juce::RangedDirectoryIterator (root, true, "*.nksf;*.fxp;*.spf2;*.h2p", juce::File::findFiles))
        {
            if (cancelled != nullptr && cancelled()) return records;
            const auto file = entry.getFile();
            auto key = file.getFullPathName();
           #if JUCE_WINDOWS
            key = key.toLowerCase();
           #endif
            if (visited.contains (key)) continue;
            visited.add (key);
            const auto preset = readVendorPreset (file);
            if (! preset) continue;
            const PluginClassRecord* target = nullptr;
            for (const auto& plugin : classes)
                if (plugin.formatName == "VST3" && plugin.name.equalsIgnoreCase (preset.instrument)
                    && plugin.vendor.equalsIgnoreCase (preset.manufacturer))
                { target = &plugin; break; }
            if (target == nullptr) continue;
            LibraryRecord record;
            record.type = "preset";
            record.sourceType = preset.sourceType;
            record.factory = true;
            record.sourceLocator = file.getFullPathName();
            record.name = preset.name;
            record.instrument = target->name;
            record.manufacturer = target->vendor;
            record.targetCeId = target->ceId;
            record.category = preset.category;
            record.fingerprint = juce::SHA256 (file).toHexString();
            records.add (std::move (record));
        }
    return records;
}

inline juce::Array<LibraryRecord> discoverVstPresetFiles (const PluginCatalog& catalog,
                                                        const juce::Array<juce::File>& roots,
                                                        std::function<bool()> cancelled = {})
{
    juce::Array<LibraryRecord> records;
    juce::SortedSet<juce::String> visited;
    const auto classes = presetCatalogueClasses (catalog);
    for (const auto& root : roots)
        for (const auto& entry : juce::RangedDirectoryIterator (root, true, "*.vstpreset", juce::File::findFiles))
        {
            if (cancelled != nullptr && cancelled()) return records;
            const auto file = entry.getFile();
            auto key = file.getFullPathName();
           #if JUCE_WINDOWS
            key = key.toLowerCase();
           #endif
            if (visited.contains (key)) continue;
            visited.add (key);
            juce::FileInputStream input (file);
            juce::MemoryBlock head;
            if (! input.openedOk()) continue;
            input.readIntoMemoryBlock (head, 48);
            const auto header = parseVstPresetHeader (head.getData(), head.getSize());
            if (! header.valid) continue;
            LibraryRecord record;
            record.type = "preset"; record.sourceType = "vstpreset"; record.factory = true;
            record.sourceLocator = file.getFullPathName(); record.name = file.getFileNameWithoutExtension();
            record.classIdHex = header.classIdHex;
            record.fingerprint = juce::SHA256 (file).toHexString();
            // JUCE's current uniqueId hashes the four normalised FUID words. Match this
            // before looking at folders, so renamed folders and files at the root resolve.
            juce::uint32 uid = 0;
            for (int word = 0; word < 4; ++word)
                uid = uid * 31u + static_cast<juce::uint32> (
                    header.classIdHex.substring (word * 8, word * 8 + 8).getHexValue64());
            for (const auto& plugin : classes)
                if (const auto xml = juce::parseXML (plugin.descriptionXml))
                    if (xml->hasAttribute ("uniqueId") && uid == static_cast<juce::uint32> (
                        xml->getStringAttribute ("uniqueId").getHexValue64()))
                    {
                        record.instrument = plugin.name; record.manufacturer = plugin.vendor;
                        record.targetCeId = plugin.ceId; break;
                    }
            if (record.targetCeId.isNotEmpty()) { records.add (std::move (record)); continue; }
            if (file.getParentDirectory() != root) record.instrument = file.getParentDirectory().getFileName();
            if (file.getParentDirectory() != root && file.getParentDirectory().getParentDirectory() != root)
                record.manufacturer = file.getParentDirectory().getParentDirectory().getFileName();
            for (auto folder = file.getParentDirectory(); folder != folder.getParentDirectory(); folder = folder.getParentDirectory())
            {
                for (const auto& plugin : classes)
                    if (plugin.formatName == "VST3" && plugin.name.equalsIgnoreCase (folder.getFileName()))
                    {
                        record.instrument = plugin.name; record.manufacturer = plugin.vendor;
                        record.targetCeId = plugin.ceId; break;
                    }
                if (record.targetCeId.isNotEmpty() || folder == root) break;
            }
            records.add (std::move (record));
        }
    return records;
}
}
