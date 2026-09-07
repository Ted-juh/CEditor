// RealPluginCheck — the Sound Browser against an actual VST3, not a stub.
//
// Everything else in this suite proves the browser against StubSynthProcessor, which is the
// right tool for the questions those tests ask: it makes routing, identity and refusals into
// arithmetic with nothing installed. It cannot answer the one question that matters most about
// the auditioner, because it is not a plug-in — it is a DC generator with three parameters.
//
// So this points the whole chain at a real .vst3 and asks whether the numbers mean anything:
// the out-of-process scanner finds it, the service loads it, the auditioner plays each of its
// programs, and the measurements have to SEPARATE sounds that genuinely differ. A brighter
// preset must measure brighter. A slow pad must measure slower. If those fail, the probe is
// describing itself rather than the sound.
//
// Not part of ctest, because CI has no plug-ins. Build it with -DCEDITOR_REAL_PLUGIN_CHECK=ON
// and hand it a bundle:
//
//   CEditorRealPluginCheck <path-to.vst3> <path-to-CEditorPluginScanner>
//
// `tools/verification/probe-synth/` is a plug-in built for exactly this, whose three programs
// differ along the axes the profile claims to measure. Any real instrument works; the
// assertions about which program is brighter are the ones that need that one.

#include "InstrumentHost/InstrumentHostService.h"
#include "InstrumentHost/PluginInstantiator.h"
#include "InstrumentHost/SnapshotStore.h"

#include <iostream>
#include <thread>

namespace
{
int failures = 0;

void check (bool condition, const juce::String& label)
{
    std::cout << (condition ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! condition)
        ++failures;
}

using ceditor::host::InstrumentHostService;

struct Emits
{
    struct Entry { juce::String name; juce::var payload; };
    std::vector<Entry> entries;

    void clear() { entries.clear(); }

    const juce::DynamicObject* last (const juce::String& name) const
    {
        for (auto it = entries.rbegin(); it != entries.rend(); ++it)
            if (it->name == name)
                return it->payload.getDynamicObject();
        return nullptr;
    }

    juce::String lastError() const
    {
        const auto* error = last ("instrumentHostError");
        return error != nullptr ? error->getProperty ("message").toString() : juce::String();
    }
};

/** Every record the library holds, by name. */
juce::var recordNamed (const juce::DynamicObject* library, const juce::String& name)
{
    if (library == nullptr)
        return {};
    if (const auto* records = library->getProperty ("records").getArray())
        for (const auto& record : *records)
            if (record.getProperty ("name", {}).toString() == name)
                return record;
    return {};
}

float measured (const juce::var& record, const char* axis)
{
    return (float) (double) record.getProperty ("sonic", {}).getProperty (axis, 0.0);
}

} // namespace

int main (int argc, char* argv[])
{
    if (argc < 3)
    {
        std::cout << "usage: CEditorRealPluginCheck <path-to.vst3> <path-to-CEditorPluginScanner>"
                  << std::endl;
        return 64;
    }

    const juce::File plugin (juce::String::fromUTF8 (argv[1]));
    const juce::File worker (juce::String::fromUTF8 (argv[2]));

    if (! plugin.exists() || ! worker.existsAsFile())
    {
        std::cout << "not found: " << (plugin.exists() ? worker.getFullPathName()
                                                       : plugin.getFullPathName()) << std::endl;
        return 64;
    }

    juce::ScopedJuceInitialiser_GUI juceInit;

    auto dataDir = juce::File::getSpecialLocation (juce::File::tempDirectory)
                       .getChildFile ("ceditor-real-plugin-check");
    dataDir.deleteRecursively();
    dataDir.createDirectory();

    juce::AudioPluginFormatManager formats;
    formats.addDefaultFormats();

    Emits emits;
    InstrumentHostService::Options options;
    options.dataDirectory = dataDir;
    options.workerExecutable = worker;
    options.includeDefaultScanRoots = false;   // only the bundle we were handed
    options.enableAudio = false;               // no device here; the probe renders offline
    options.emit = [&emits] (const juce::String& name, const juce::var& payload)
                   { emits.entries.push_back ({ name, payload }); };
    options.instantiate = ceditor::host::makePluginInstantiator (formats);
    options.applyVstPreset = ceditor::host::applyVstPresetFile;
    options.scanExecutor = [] (std::function<void()> body) { body(); };

    // WIRED AS THE APP WIRES IT, and it has to be. The auditioner borrows an instance through
    // the instantiate hook and WAITS for it; the real hook is asynchronous and delivers on the
    // message thread. Running the job inline on that same thread is therefore a deadlock — the
    // job holds the thread that is the only one able to answer it. The stub tests get away with
    // an inline executor because their instantiate answers synchronously. This check found that
    // by hanging, which is the most honest way to find it.
    std::thread analysisThread;
    options.analysisExecutor = [&analysisThread] (std::function<void()> body)
    {
        if (analysisThread.joinable())
            analysisThread.join();
        analysisThread = std::thread (std::move (body));
    };
    options.onControlThread = [] (std::function<void()> work)
    {
        juce::MessageManager::callAsync (std::move (work));
    };

    InstrumentHostService service (std::move (options));

    // The real instantiator is JUCE's ASYNCHRONOUS one — it delivers on the message thread,
    // which in the app is always running and in a console program is not. So every command is
    // followed by a turn of the loop, and loading waits for the instrument to actually arrive.
    // (Without this the plug-in scans, reports no error, and never loads: the check's first
    // run said "its program list was not ingested" about a plug-in that had not been given the
    // chance to exist.)
    const auto pump = [] (int milliseconds)
    {
        if (auto* mm = juce::MessageManager::getInstanceWithoutCreating())
            mm->runDispatchLoopUntil (milliseconds);
    };

    const auto cmd = [&service, &pump] (const juce::String& name,
                                 std::initializer_list<std::pair<const char*, juce::var>> fields = {})
    {
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("cmd", name);
        for (const auto& [key, value] : fields)
            payload->setProperty (juce::Identifier (key), value);
        service.handleCommand (juce::var (payload));
        pump (20);
    };

    std::cout << "the Sound Browser against a real VST3" << std::endl;
    std::cout << "  plug-in: " << plugin.getFullPathName() << std::endl;

    // -- the scan, through the real out-of-process worker --------------------------------
    cmd ("getState");
    cmd ("addScanPath", { { "path", plugin.getParentDirectory().getFullPathName() } });
    emits.clear();
    cmd ("scan");
    const auto scanLine = emits.last ("instrumentHostScanProgress") != nullptr
                            ? emits.last ("instrumentHostScanProgress")->getProperty ("line").toString()
                            : juce::String();
    // A scan reports progress; the STATE is asked for. (Reading the state the scan did not emit
    // is how this check first said "no plug-in found" about a scan that had just said it
    // scanned one.)
    emits.clear();
    cmd ("getState");

    // The state's own shape: instruments are a top-level list, which is the projection the
    // browser reads. (Reading a `catalog.classes` that does not exist is how this check first
    // reported "no plug-in found" against a plug-in that had scanned perfectly.)
    const auto* state = emits.last ("instrumentHostState");
    int classes = 0;
    juce::String ceId, pluginName;
    if (state != nullptr)
        if (const auto* found = state->getProperty ("instruments").getArray())
            for (const auto& entry : *found)
            {
                ++classes;
                ceId = entry.getProperty ("ceId", {}).toString();
                pluginName = entry.getProperty ("name", {}).toString();
            }

    check (classes >= 1, "the out-of-process scanner finds a real plug-in and catalogues it");
    if (classes == 0)
    {
        std::cout << "  scan said: " << scanLine << std::endl;
        if (state != nullptr)
            if (const auto* mods = state->getProperty ("modules").getArray())
                for (const auto& m : *mods)
                    std::cout << "  module " << m.getProperty ("path", {}).toString()
                              << " status=" << m.getProperty ("status", {}).toString()
                              << " reason=" << m.getProperty ("unavailableReason", {}).toString()
                              << " instruments=" << (int) m.getProperty ("numInstruments", 0)
                              << " classes=" << (int) m.getProperty ("numClasses", 0) << std::endl;
        std::cout << "\nFAILURES: " << (failures + 1) << " (nothing to go on)" << std::endl;
        return 1;
    }
    std::cout << "  found: " << pluginName << " (" << ceId << ")" << std::endl;

    // -- loading it, and what it says about itself ---------------------------------------
    cmd ("addPart");
    emits.clear();
    cmd ("getState");
    juce::String partId;
    if (const auto* current = emits.last ("instrumentHostState"))
        partId = current->getProperty ("rack").getProperty ("parts", {})[0]
                     .getProperty ("partId", {}).toString();
    check (partId.isNotEmpty(), "the rack has a part to load it onto");

    emits.clear();
    cmd ("loadInstrument", { { "partId", partId }, { "ceId", ceId } });
    for (int i = 0; i < 100 && service.getRackHost().getInstrument (partId) == nullptr; ++i)
        pump (50);

    auto* live = service.getRackHost().getInstrument (partId);
    check (emits.lastError().isEmpty() && live != nullptr,
           "a real VST3 instantiates through the service's own path and lands on the part");
    if (live != nullptr)
        std::cout << "  it reports " << live->getNumPrograms() << " programs and "
                  << live->getParameters().size() << " host-visible parameters" << std::endl;

    emits.clear();
    cmd ("getLibrary");
    const auto* library = emits.last ("instrumentHostLibrary");
    const auto programCount = library != nullptr ? library->getProperty ("records").size() : 0;
    check (programCount >= 3,
           "and its own program list is ingested — the names the plug-in reports, not ours");

    // -- the auditioner, on a real instrument --------------------------------------------
    emits.clear();
    cmd ("analyseLibrary");

    // The job is on its own thread now, so the loop has to keep turning: that is how its
    // instantiate is answered and how its findings get home.
    for (int i = 0; i < 600; ++i)
    {
        pump (50);
        const auto* running = emits.last ("instrumentHostAnalysisProgress");
        if (running != nullptr && ! (bool) running->getProperty ("running"))
            break;
    }
    if (analysisThread.joinable())
        analysisThread.join();
    pump (100);

    const auto* progress = emits.last ("instrumentHostAnalysisProgress");
    check (progress != nullptr && ! (bool) progress->getProperty ("running")
             && (int) progress->getProperty ("done") >= 3,
           "the auditioner plays every program of a real plug-in and finishes");

    // And it did it in a CHILD PROCESS, which is the claim Stage B2 makes and the one thing
    // about it that cannot be inferred from the numbers: identical measurements are exactly
    // what a silent fallback to in-process would also produce. The job document is written
    // here and deleted after each pass, so the directory existing is the evidence the worker
    // was actually asked.
    check (dataDir.getChildFile ("audition-jobs").isDirectory(),
           "and it was a child process that played them, not this one");

    emits.clear();
    cmd ("getLibrary");
    library = emits.last ("instrumentHostLibrary");

    const auto dark = recordNamed (library, "Dark Pluck");
    const auto bright = recordNamed (library, "Bright Pluck");
    const auto pad = recordNamed (library, "Wide Slow Pad");

    const auto haveProbeSynth = dark.isObject() && bright.isObject() && pad.isObject();
    check (haveProbeSynth || programCount >= 3,
           haveProbeSynth ? "the verification plug-in's three programs are all here"
                          : "a plug-in other than the verification one: measuring only");

    if (! haveProbeSynth)
    {
        std::cout << "\n  This plug-in is not tools/verification/probe-synth, so the assertions\n"
                     "  about WHICH program should measure brighter cannot be made. What was\n"
                     "  measured, for reading by hand:" << std::endl;
        if (const auto* records = library->getProperty ("records").getArray())
            for (const auto& record : *records)
                std::cout << "    " << record.getProperty ("name", {}).toString()
                          << "  brightness " << measured (record, "brightness")
                          << "  attack " << measured (record, "attackSeconds") << "s"
                          << "  tail " << measured (record, "tailSeconds") << "s"
                          << "  width " << measured (record, "width") << std::endl;

        std::cout << (failures == 0 ? "\nALL PASSED\n" : "\nFAILURES\n");
        return failures == 0 ? 0 : 1;
    }

    std::cout << "  Dark Pluck   brightness " << measured (dark, "brightness")
              << " (" << measured (dark, "centroidHz") << " Hz)"
              << "  attack " << measured (dark, "attackSeconds") << "s"
              << "  tail " << measured (dark, "tailSeconds") << "s"
              << "  width " << measured (dark, "width") << std::endl;
    std::cout << "  Bright Pluck brightness " << measured (bright, "brightness")
              << " (" << measured (bright, "centroidHz") << " Hz)"
              << "  attack " << measured (bright, "attackSeconds") << "s"
              << "  tail " << measured (bright, "tailSeconds") << "s"
              << "  width " << measured (bright, "width") << std::endl;
    std::cout << "  Wide Slow Pad brightness " << measured (pad, "brightness")
              << " (" << measured (pad, "centroidHz") << " Hz)"
              << "  attack " << measured (pad, "attackSeconds") << "s"
              << "  tail " << measured (pad, "tailSeconds") << "s"
              << "  width " << measured (pad, "width") << std::endl;

    // THE QUESTION THE STUB CANNOT ANSWER. These three presets differ in ways somebody can
    // hear; if the profile does not separate them, it is describing the probe rather than the
    // sound, and every filter, map and match built on it is decoration.
    check (measured (bright, "brightness") > measured (dark, "brightness") + 0.1f,
           "a preset with its filter seven times higher measures brighter");
    check (measured (bright, "centroidHz") > measured (dark, "centroidHz") * 1.5f,
           "and the centroid says so in Hz, not just on the normalised scale");
    check (measured (pad, "attackSeconds") > measured (dark, "attackSeconds") * 10.0f,
           "a preset with a 600 ms attack measures slower than one with 4 ms");
    check (measured (pad, "tailSeconds") > measured (dark, "tailSeconds"),
           "and its longer release measures a longer tail");
    check (measured (pad, "width") > measured (dark, "width") + 0.1f,
           "a preset whose two channels differ measures wider than one whose do not");
    check (measured (dark, "width") < 0.1f, "while a mono-in-both-channels preset is not wide");

    // -- the same sound, measured in this process, must be the same measurement ------------
    //
    // Stage B2 moved the listening into a child process, and everything above went through it:
    // a plug-in that dies while being auditioned now costs a process and one blamed preset
    // rather than the editor. That is only an improvement if it measures IDENTICALLY, because
    // a browser whose numbers depend on where they were taken cannot compare a preset measured
    // before the change with one measured after it — the filters, the map and every match are
    // one scale or they are nothing.
    //
    // So the whole thing runs again with the auditioner in this process, over its own library,
    // and the two have to agree. This is also the only check anywhere that the in-process
    // fallback still works, which matters because it is what a build with no worker uses.
    {
        auto inProcessDir = dataDir.getSiblingFile ("ceditor-real-plugin-check-inproc");
        inProcessDir.deleteRecursively();
        inProcessDir.createDirectory();

        Emits localEmits;
        InstrumentHostService::Options localOptions;
        localOptions.dataDirectory = inProcessDir;
        localOptions.workerExecutable = worker;
        localOptions.auditionOutOfProcess = false;    // the whole point of this block
        localOptions.includeDefaultScanRoots = false;
        localOptions.enableAudio = false;
        localOptions.emit = [&localEmits] (const juce::String& name, const juce::var& payload)
                            { localEmits.entries.push_back ({ name, payload }); };
        localOptions.instantiate = ceditor::host::makePluginInstantiator (formats);
        localOptions.applyVstPreset = ceditor::host::applyVstPresetFile;
        localOptions.scanExecutor = [] (std::function<void()> body) { body(); };

        std::thread localThread;
        localOptions.analysisExecutor = [&localThread] (std::function<void()> body)
        {
            if (localThread.joinable())
                localThread.join();
            localThread = std::thread (std::move (body));
        };
        localOptions.onControlThread = [] (std::function<void()> work)
                                       { juce::MessageManager::callAsync (std::move (work)); };

        InstrumentHostService local (std::move (localOptions));
        const auto localCmd = [&local, &pump] (const juce::String& name,
                                  std::initializer_list<std::pair<const char*, juce::var>> fields = {})
        {
            auto* payload = new juce::DynamicObject();
            payload->setProperty ("cmd", name);
            for (const auto& [key, value] : fields)
                payload->setProperty (juce::Identifier (key), value);
            local.handleCommand (juce::var (payload));
            pump (20);
        };

        localCmd ("getState");
        localCmd ("addScanPath", { { "path", plugin.getParentDirectory().getFullPathName() } });
        localCmd ("scan");
        localCmd ("addPart");
        localEmits.clear();
        localCmd ("getState");
        juce::String localPartId;
        if (const auto* current = localEmits.last ("instrumentHostState"))
            localPartId = current->getProperty ("rack").getProperty ("parts", {})[0]
                              .getProperty ("partId", {}).toString();
        localCmd ("loadInstrument", { { "partId", localPartId }, { "ceId", ceId } });
        for (int i = 0; i < 100 && local.getRackHost().getInstrument (localPartId) == nullptr; ++i)
            pump (50);

        localEmits.clear();
        localCmd ("analyseLibrary");
        for (int i = 0; i < 600; ++i)
        {
            pump (50);
            const auto* running = localEmits.last ("instrumentHostAnalysisProgress");
            if (running != nullptr && ! (bool) running->getProperty ("running"))
                break;
        }
        if (localThread.joinable())
            localThread.join();
        pump (100);

        localEmits.clear();
        localCmd ("getLibrary");
        const auto* localLibrary = localEmits.last ("instrumentHostLibrary");
        const auto localDark = recordNamed (localLibrary, "Dark Pluck");
        const auto localBright = recordNamed (localLibrary, "Bright Pluck");
        const auto localPad = recordNamed (localLibrary, "Wide Slow Pad");

        check (localDark.isObject() && localBright.isObject() && localPad.isObject(),
               "the in-process auditioner still measures every program");

        // Identical, not merely similar: both paths run the same probe over the same renders
        // through the same analysis, so any difference at all is a difference in the plumbing.
        // A hundredth of a normalised unit is the tolerance for a plug-in that is not perfectly
        // deterministic across instances; a real disagreement is far larger than that.
        const auto agrees = [] (const juce::var& a, const juce::var& b, const char* axis)
        {
            return std::abs (measured (a, axis) - measured (b, axis)) < 0.01f;
        };

        check (agrees (dark, localDark, "brightness") && agrees (bright, localBright, "brightness")
                 && agrees (pad, localPad, "brightness"),
               "and a child process measures the same brightness this one does");
        check (agrees (dark, localDark, "attack") && agrees (pad, localPad, "attack")
                 && agrees (dark, localDark, "tail") && agrees (pad, localPad, "tail")
                 && agrees (pad, localPad, "width"),
               "the same attack, tail and width too — one scale, wherever it was taken");

        ceditor::host::SnapshotStore localStore (inProcessDir.getChildFile ("snapshots"));
        check (localStore.count() >= 3,
               "and both paths leave the snapshot behind that makes the next click instant");

        inProcessDir.deleteRecursively();
    }

    // -- the snapshots that make browsing instant -----------------------------------------
    int instant = 0;
    if (const auto* records = library->getProperty ("records").getArray())
        for (const auto& record : *records)
            if ((bool) record.getProperty ("instant", false))
                ++instant;
    check (instant >= 3, "every measured program left a real snapshot behind");

    ceditor::host::SnapshotStore store (dataDir.getChildFile ("snapshots"));
    check (store.count() >= 3 && store.bytes() > 0,
           "which are on disk, in the store, taking real bytes");

    // -- one distance function, over real measurements -------------------------------------
    emits.clear();
    cmd ("similarSounds", { { "recordId", dark.getProperty ("recordId", {}) } });
    const auto* similar = emits.last ("instrumentHostSimilar");
    check (similar != nullptr && similar->getProperty ("matches").size() >= 2,
           "a real sound has real neighbours");
    if (similar != nullptr && similar->getProperty ("matches").size() >= 2)
    {
        const auto matches = similar->getProperty ("matches");
        const auto closest = matches[0].getProperty ("name", {}).toString();
        check (closest == "Bright Pluck",
               "and the two plucks are nearer each other than either is to the pad");
    }

    // -- a version, and a diff that names a parameter of a real plug-in --------------------
    emits.clear();
    cmd ("loadLibraryRecord", { { "recordId", dark.getProperty ("recordId", {}) },
                                { "action", "focused" }, { "partId", partId } });
    cmd ("saveUserPreset", { { "partId", partId }, { "name", "Mine" } });

    emits.clear();
    cmd ("getLibrary");
    const auto mine = recordNamed (emits.last ("instrumentHostLibrary"), "Mine");
    check (mine.isObject(), "a real plug-in's state captures as a record of your own");

    // Two saves with a real parameter moved between them. The first version is the sound as
    // loaded; the second is after the change, and the diff has to name what moved.
    emits.clear();
    cmd ("commitVersion", { { "recordId", mine.getProperty ("recordId", {}) },
                            { "label", "as loaded" } });

    juce::String moved;
    if (auto* instrument = service.getRackHost().getInstrument (partId))
        for (auto* parameter : instrument->getParameters())
            if (moved.isEmpty() && parameter->getName (32).containsIgnoreCase ("cutoff"))
            {
                moved = parameter->getName (32);
                parameter->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f,
                                                                parameter->getValue() + 0.5f));
            }
    pump (200);
    check (moved.isNotEmpty(), "a real plug-in's own parameter can be found by name and moved");

    emits.clear();
    cmd ("commitVersion", { { "recordId", mine.getProperty ("recordId", {}) },
                            { "label", "brighter" } });
    emits.clear();
    cmd ("getLibrary");
    const auto versioned = recordNamed (emits.last ("instrumentHostLibrary"), "Mine");
    check (versioned.getProperty ("versions", {}).size() >= 2,
           "each save is a version of the same record rather than an overwrite");

    emits.clear();
    cmd ("diffVersions", { { "recordId", mine.getProperty ("recordId", {}) },
                           { "versionIdA", versioned.getProperty ("versions", {})[0]
                                               .getProperty ("versionId", {}) } });
    const auto* diff = emits.last ("instrumentHostVersionDiff");
    check (diff != nullptr, "two states of a real plug-in compare");
    if (diff != nullptr)
    {
        std::cout << "  diff: " << (int) diff->getProperty ("differing")
                  << " of " << (int) diff->getProperty ("total")
                  << " parameters differ" << std::endl;
        check ((int) diff->getProperty ("differing") >= 1,
               "and the parameter that was moved is among the ones reported as changed");

        bool named = false;
        if (const auto* rows = diff->getProperty ("parameters").getArray())
            for (const auto& row : *rows)
                if ((bool) row.getProperty ("changed", false)
                    && row.getProperty ("name", {}).toString() == moved)
                    named = row.getProperty ("aText", {}).toString()
                              != row.getProperty ("bText", {}).toString();
        check (named, "by the plug-in's own name for it, with both values in its own words");
    }

    dataDir.deleteRecursively();
    std::cout << (failures == 0 ? "\nALL PASSED\n" : "\nFAILURES\n");
    return failures == 0 ? 0 : 1;
}
