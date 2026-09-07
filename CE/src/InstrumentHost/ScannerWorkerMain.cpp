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

#include "SonicAnalysisJob.h"

static int runScan (const juce::String& modulePath);
static int runAudition (const juce::File& jobFile);

int main (int argc, char* argv[])
{
    if (argc == 3 && juce::String (argv[1]) == "--scan")
    {
        // Scanning instantiates the module briefly, and VST3 module code expects a message
        // manager to exist on the thread doing it — the same footing PluginDirectoryScanner
        // runs on.
        juce::ScopedJuceInitialiser_GUI juceInit;
        return runScan (juce::String::fromUTF8 (argv[2]));
    }

    if (argc == 3 && juce::String (argv[1]) == "--audition")
    {
        juce::ScopedJuceInitialiser_GUI juceInit;
        return runAudition (juce::File (juce::String::fromUTF8 (argv[2])));
    }

    std::cerr << "usage: CEditorPluginScanner --scan <path-to-vst3>" << std::endl;
    std::cerr << "       CEditorPluginScanner --audition <path-to-job-xml>" << std::endl;
    return 64;
}

static int runScan (const juce::String& modulePath)
{
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

// --- auditioning ------------------------------------------------------------------------------
//
// Stage B2. The scan above asks a module what it contains; this plays what it contains and
// writes down how it sounded. Same argument for being here rather than in the editor, only
// more so: scanning instantiates a plug-in briefly, auditioning drives it through hundreds of
// preset changes and renders each one.
//
// Everything in this process is on the message thread, which is the whole reason a separate
// process is simpler as well as safer: a plug-in expects to be created, driven and destroyed on
// one thread, and here that thread is `main`. There is nothing to marshal.
//
// Output is a line per event, flushed as it happens, so a death at preset 300 keeps the 299
// before it — see SonicAnalysisJob.h for why that shape was chosen over one document.

static int runAudition (const juce::File& jobFile)
{
    using namespace ceditor::host;

    const auto fatal = [] (const juce::String& detail)
    {
        juce::XmlElement element ("FATAL");
        element.setAttribute ("detail", detail);
        std::cout << element.toString (juce::XmlElement::TextFormat().singleLine().withoutHeader())
                  << std::endl;
        return 2;
    };

    AnalysisJob job;
    if (! jobFile.existsAsFile())
        return fatal ("job file not found: " + jobFile.getFullPathName());
    if (! analysisJobFromXml (jobFile.loadFileAsString(), job))
        return fatal ("job file is not an audition job: " + jobFile.getFullPathName());

    juce::PluginDescription description;
    const auto parsedDescription = juce::XmlDocument::parse (job.descriptionXml);
    if (parsedDescription == nullptr || ! description.loadFromXml (*parsedDescription))
        return fatal ("unreadable plugin description");

    juce::AudioPluginFormatManager formats;
    formats.addDefaultFormats();

    juce::String error;
    auto instrument = formats.createPluginInstance (description, job.spec.sampleRate,
                                                    job.spec.blockSize, error);
    if (instrument == nullptr)
        return fatal (error.isEmpty() ? juce::String ("the plug-in would not load") : error);

    // A vendor .vstpreset needs the VST3 format to validate the class id inside the file against
    // the live instance, so a mismatched preset fails here rather than half-applying. Everything
    // else is a captured blob or a program index and needs no format at all.
    const auto applyState = [] (juce::AudioProcessor& processor, const AnalysisPreset& preset) -> juce::String
    {
        if (preset.sourceType != "vstpreset")
            return applyPresetStatePlain (processor, preset);

        auto* asInstance = dynamic_cast<juce::AudioPluginInstance*> (&processor);
        juce::MemoryBlock data;
        if (asInstance == nullptr || ! juce::File (preset.sourceLocator).loadFileAsData (data))
            return "The vendor preset could not be read: " + preset.name;
        if (! juce::VST3PluginFormat::setStateFromVSTPresetFile (asInstance, data))
            return "The plug-in refused this preset: " + preset.name;
        return {};
    };

    measurePresets (job, *instrument, applyState,
        [] (const AnalysisEvent& event)
        {
            if (event.kind == AnalysisEvent::Kind::trying)
                std::cout << analysisTryingLine (event.recordId) << std::endl;
            else if (event.kind == AnalysisEvent::Kind::finding)
                std::cout << analysisFindingLine (event.finding) << std::endl;
        });

    // Destroyed here, on the thread that made it, before the message manager goes.
    instrument.reset();

    std::cout << "<DONE/>" << std::endl;
    return 0;
}
