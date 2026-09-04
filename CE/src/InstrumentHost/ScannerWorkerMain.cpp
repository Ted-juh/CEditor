// CEditorPluginScanner — Hostage's out-of-process VST3 scan worker.
//
// This executable is the ONE place a third-party VST3 module gets loaded to ask what it
// contains. It is short-lived by design: one module per invocation, so a module that crashes
// or hangs takes this process with it and the coordinator in the editor attributes the death
// to exactly the module it handed over (PluginScannerCoordinator.h documents the protocol and
// the classification).
//
// Output is one XML document on stdout and nothing else — JUCE's own PluginDescription XML per
// exposed class, plus the `ceId` attribute (the identifier string) that the catalogue uses as
// stable identity. Keeping the serialization JUCE's means the app side can reparse a stored
// description into a PluginDescription for instantiation without a single hand-mapped field.

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <iostream>

int main (int argc, char* argv[])
{
    if (argc != 3 || juce::String (argv[1]) != "--scan")
    {
        std::cerr << "usage: CEditorPluginScanner --scan <path-to-vst3>" << std::endl;
        return 64;
    }

    // Scanning instantiates the module briefly, and VST3 module code expects a message
    // manager to exist on the thread doing it — the same footing PluginDirectoryScanner runs on.
    juce::ScopedJuceInitialiser_GUI juceInit;

    const juce::String modulePath = juce::String::fromUTF8 (argv[2]);

    juce::XmlElement out ("SCANRESULT");
    out.setAttribute ("module", modulePath);

    const juce::File moduleFile (modulePath);
    if (! (moduleFile.existsAsFile() || moduleFile.isDirectory()))
    {
        auto* error = out.createNewChildElement ("ERROR");
        error->setAttribute ("message", "module does not exist: " + modulePath);
        std::cout << out.toString() << std::endl;
        return 2;
    }

    juce::VST3PluginFormat format;
    juce::OwnedArray<juce::PluginDescription> descriptions;
    format.findAllTypesForFile (descriptions, modulePath);

    // VST3 plug-ins may ship their own artwork: Contents/Resources/Snapshots holds one PNG per
    // class, named by the class UID, with optional _2.0x variants for hi-DPI. Reading them is
    // a directory listing — no instantiation, nothing executed — but this worker is where it
    // belongs anyway, because it is already the process that touched this module.
    const auto snapshotsFor = [] (const juce::File& module)
    {
        const auto bundle = module.isDirectory() ? module : module.getParentDirectory();
        return bundle.getChildFile ("Contents").getChildFile ("Resources").getChildFile ("Snapshots");
    };

    // The largest scale wins: a 2x image downscales cleanly and a 1x one does not scale up.
    const auto scaleOf = [] (const juce::File& png)
    {
        const auto name = png.getFileNameWithoutExtension();
        const auto tail = name.fromLastOccurrenceOf ("_", false, false);
        return tail.endsWithIgnoreCase ("x") ? tail.dropLastCharacters (1).getFloatValue() : 1.0f;
    };

    juce::Array<juce::File> snapshots;
    if (const auto folder = snapshotsFor (moduleFile); folder.isDirectory())
        folder.findChildFiles (snapshots, juce::File::findFiles, false, "*.png");

    // Attribution has to be exact or absent — the wrong picture on a plug-in is worse than
    // none. moduleinfo.json names each class beside its snapshot, so use it when it is there;
    // otherwise the only safe case is a module with a single class, where there is nothing to
    // confuse. A multi-class module with no manifest gets no artwork, on purpose.
    juce::HashMap<juce::String, juce::String> snapshotByClassName;
    const auto bundle = moduleFile.isDirectory() ? moduleFile : moduleFile.getParentDirectory();
    const auto moduleInfo = bundle.getChildFile ("Contents").getChildFile ("Resources")
                                  .getChildFile ("moduleinfo.json");
    if (moduleInfo.existsAsFile())
    {
        const auto parsedInfo = juce::JSON::parse (moduleInfo.loadFileAsString());
        if (const auto* classes = parsedInfo.getProperty ("Classes", {}).getArray())
            for (const auto& entry : *classes)
            {
                const auto className = entry.getProperty ("Name", {}).toString();
                float best = 0.0f;
                juce::String bestPath;
                if (const auto* shots = entry.getProperty ("Snapshots", {}).getArray())
                    for (const auto& shot : *shots)
                    {
                        const auto scale = (float) (double) shot.getProperty ("ScaleFactor", 1.0);
                        const auto relative = shot.getProperty ("Path", {}).toString();
                        if (relative.isEmpty() || scale < best)
                            continue;
                        best = scale;
                        bestPath = bundle.getChildFile ("Contents").getChildFile (relative)
                                         .getFullPathName();
                    }
                if (className.isNotEmpty() && bestPath.isNotEmpty())
                    snapshotByClassName.set (className, bestPath);
            }
    }

    juce::String loneSnapshot;
    if (descriptions.size() == 1 && ! snapshots.isEmpty())
    {
        float best = 0.0f;
        for (const auto& png : snapshots)
            if (const auto scale = scaleOf (png); scale >= best)
            {
                best = scale;
                loneSnapshot = png.getFullPathName();
            }
    }

    for (const auto* description : descriptions)
    {
        if (auto xml = description->createXml())
        {
            xml->setAttribute ("ceId", description->createIdentifierString());

            auto artwork = snapshotByClassName.contains (description->name)
                             ? snapshotByClassName[description->name]
                             : loneSnapshot;
            if (artwork.isNotEmpty() && juce::File (artwork).existsAsFile())
                xml->setAttribute ("ceSnapshot", artwork);

            out.addChildElement (xml.release());
        }
    }

    std::cout << out.toString() << std::endl;
    return 0;
}
