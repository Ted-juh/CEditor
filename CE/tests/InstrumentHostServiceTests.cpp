// InstrumentHostServiceTests — the bridge-facing command surface (VIP-successor Stage 1).
//
// This drives the exact payloads the WebView will send and asserts on the exact events it
// will hear back, with a stub instantiator standing in for AudioPluginFormatManager and the
// stub scanner worker standing in for real VST3 modules. What must hold:
//
//   Every mutation answers with state.      The UI renders whatever instrumentHostState says;
//                                           a command that changes something silently is a
//                                           desync waiting for a repaint.
//   A session survives its process.         Rack, identities, mixer, rules and instrument
//                                           state come back on the next start, instruments
//                                           re-requested through the same transaction.
//   Refusals are events, not silence.       Unknown parts, unknown instruments, quarantined
//                                           modules, superseded loads.
//   Startup is safe.                        A leftover dead-man marker quarantines its module
//                                           before anything gets a chance to load it.
//
// The stub worker's path arrives as argv[1] from CTest, same as the coordinator tests.

#include "InstrumentHost/InstrumentHostService.h"
#include "StubSynthProcessor.h"
#include <iostream>
#include <vector>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

using ceditor::host::InstrumentHostService;
using ceditor::host::PluginCatalog;
using ceditor::host::PluginClassRecord;
using ceditor::host::ModuleScanResult;
using ceditor::test::StubSynthProcessor;

juce::File freshDataDir (const juce::String& name)
{
    auto dir = juce::File::getSpecialLocation (juce::File::tempDirectory)
                   .getChildFile ("ceditor-host-service-tests").getChildFile (name);
    dir.deleteRecursively();
    dir.createDirectory();
    return dir;
}

/** Writes a catalogue file holding one healthy synth class and one quarantined module. */
void seedCatalog (const juce::File& dataDir)
{
    PluginCatalog catalog;

    ModuleScanResult healthy;
    healthy.modulePath = "C:\\VST3\\Good.vst3";
    healthy.fingerprint = "fp-good";
    PluginClassRecord synth;
    synth.ceId = "VST3-good-synth";
    synth.name = "Good Synth";
    synth.vendor = "Good Audio";
    synth.version = "1.0";
    synth.isInstrument = true;
    synth.descriptionXml = "<PLUGIN name=\"Good Synth\" ceId=\"VST3-good-synth\"/>";
    healthy.classes.add (synth);
    catalog.commitScanResult (healthy);

    ModuleScanResult broken;
    broken.modulePath = "C:\\VST3\\Broken.vst3";
    broken.fingerprint = "fp-broken";
    PluginClassRecord badSynth;
    badSynth.ceId = "VST3-broken-synth";
    badSynth.name = "Broken Synth";
    badSynth.isInstrument = true;
    broken.classes.add (badSynth);
    catalog.commitScanResult (broken);
    catalog.recordFailure ("C:\\VST3\\Broken.vst3", "fp-broken", "hung", true);

    catalog.saveTo (dataDir.getChildFile ("plugin-catalog.json"));
}

/** Collects emitted events and offers the usual assertions over them. */
struct Emits
{
    struct Entry { juce::String name; juce::var payload; };
    std::vector<Entry> entries;

    void clear() { entries.clear(); }

    const juce::var* lastState() const
    {
        for (auto it = entries.rbegin(); it != entries.rend(); ++it)
            if (it->name == "instrumentHostState")
                return &it->payload;
        return nullptr;
    }

    juce::String lastError() const
    {
        for (auto it = entries.rbegin(); it != entries.rend(); ++it)
            if (it->name == "instrumentHostError")
                return it->payload.getProperty ("message", {}).toString();
        return {};
    }

    int count (const juce::String& name) const
    {
        int n = 0;
        for (const auto& e : entries)
            if (e.name == name)
                ++n;
        return n;
    }
};

struct Harness
{
    explicit Harness (const juce::File& dataDir, const juce::File& worker = {},
                      std::function<void (InstrumentHostService::Options&)> tweak = {})
    {
        InstrumentHostService::Options options;
        options.dataDirectory = dataDir;
        options.workerExecutable = worker;
        options.emit = [this] (const juce::String& name, const juce::var& payload)
        {
            emits.entries.push_back ({ name, payload });
        };
        options.instantiate = [this] (const juce::String& descriptionXml, double sampleRate, int,
                                      InstrumentHostService::InstantiateCallback callback)
        {
            lastDescriptionXml = descriptionXml;
            lastSampleRate = sampleRate;
            if (deferCallbacks)
            {
                deferred.push_back (std::move (callback));
                return;
            }
            if (failInstantiation)
            {
                callback (nullptr, "stub refused");
                return;
            }
            auto stub = std::make_unique<StubSynthProcessor>();
            lastStub = stub.get();
            callback (std::move (stub), {});
        };
        options.scanExecutor = [this] (std::function<void()> body)
        {
            if (captureScanBody)
                scanBody = std::move (body);
            else
                body();
        };
        options.editorPane.show = [this] (const juce::String& partId,
                                          juce::AudioProcessor& processor,
                                          const juce::String& title)
        {
            paneLog.push_back ("show:" + partId + ":" + title);
            lastShownProcessor = &processor;
        };
        options.editorPane.hide = [this]
        {
            paneLog.push_back ("hide");
            lastShownProcessor = nullptr;
        };
        if (tweak != nullptr)
            tweak (options);
        service = std::make_unique<InstrumentHostService> (options);
    }

    juce::var cmd (const juce::String& name, std::initializer_list<std::pair<const char*, juce::var>> fields = {})
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty ("cmd", name);
        for (const auto& [key, value] : fields)
            obj->setProperty (key, value);
        const juce::var payload (obj);
        service->handleCommand (payload);
        return payload;
    }

    juce::String partIdAt (int index) const
    {
        const auto* state = emits.lastState();
        if (state == nullptr) return {};
        const auto parts = state->getProperty ("rack", {}).getProperty ("parts", {});
        return index < parts.size() ? parts[index].getProperty ("partId", {}).toString()
                                    : juce::String();
    }

    juce::String firstPartId() const   { return partIdAt (0); }

    juce::String editorOpenPartId() const
    {
        const auto* state = emits.lastState();
        return state != nullptr ? state->getProperty ("editorOpenPartId", {}).toString()
                                : juce::String();
    }

    Emits emits;
    std::vector<juce::String> paneLog;
    juce::AudioProcessor* lastShownProcessor = nullptr;
    juce::String lastDescriptionXml;
    double lastSampleRate = 0.0;
    StubSynthProcessor* lastStub = nullptr;
    bool failInstantiation = false;
    bool deferCallbacks = false;
    bool captureScanBody = false;
    std::function<void()> scanBody;
    std::vector<InstrumentHostService::InstantiateCallback> deferred;
    std::unique_ptr<InstrumentHostService> service;
};

void testCommandFlow()
{
    std::cout << "\ncommand flow" << std::endl;

    const auto dir = freshDataDir ("flow");
    seedCatalog (dir);
    Harness h (dir);

    h.cmd ("getState");
    const auto* state = h.emits.lastState();
    check (state != nullptr, "getState answers with state");
    check (state != nullptr && state->getProperty ("instruments", {}).size() == 1,
           "the browser projection lists the healthy instrument and not the quarantined one");
    check (state != nullptr && state->getProperty ("modules", {}).size() == 2,
           "the module list carries both, quarantine visible");

    h.cmd ("addPart");
    const auto partId = h.firstPartId();
    check (partId.isNotEmpty(), "addPart answers with the new part in state");

    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
    state = h.emits.lastState();
    const auto part = state->getProperty ("rack", {}).getProperty ("parts", {})[0];
    check ((bool) part.getProperty ("hasInstrument", false), "the instrument commits");
    check (part.getProperty ("pluginName", {}).toString() == "Good Synth",
           "and the part carries its display identity");
    check (h.lastDescriptionXml.contains ("Good Synth"),
           "the instantiator received the catalogue's description");

    h.cmd ("setPartMixer", { { "partId", partId }, { "mute", true } });
    const auto muted = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0];
    check ((bool) muted.getProperty ("mute", false)
             && juce::approximatelyEqual ((float) (double) muted.getProperty ("volume", 0.0), 1.0f),
           "setPartMixer touches only the fields it names");

    h.cmd ("setPartMidiRules", { { "partId", partId }, { "keyHigh", 59 } });
    const auto ruled = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0];
    check ((int) ruled.getProperty ("keyHigh", -1) == 59
             && (int) ruled.getProperty ("keyLow", -1) == 0,
           "setPartMidiRules keeps the fields it does not name");

    h.emits.clear();
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "no-such-instrument" } });
    check (h.emits.lastError().contains ("not in the catalogue"), "an unknown ceId is refused aloud");

    h.emits.clear();
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-broken-synth" } });
    check (h.emits.lastError().contains ("quarantined"), "a quarantined module refuses to load");

    h.emits.clear();
    h.cmd ("removePart", { { "partId", "no-such-part" } });
    check (h.emits.lastError().isNotEmpty(), "an unknown part is refused aloud");

    h.emits.clear();
    h.cmd ("definitelyNotACommand");
    check (h.emits.lastError().contains ("Unknown instrument-host command"),
           "an unknown command is refused aloud");
}

void testSessionSurvivesProcess()
{
    std::cout << "\nsession round trip" << std::endl;

    const auto dir = freshDataDir ("session");
    seedCatalog (dir);

    juce::String partId;
    {
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("addPart");
        partId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        h.lastStub->patch = 42;
        h.cmd ("setPartMixer", { { "partId", partId }, { "volume", 0.5 } });   // persists the patch
    }

    Harness h2 (dir);
    h2.cmd ("getState");
    check (h2.lastStub != nullptr, "restore re-requests the instrument through the instantiator");
    check (h2.lastStub != nullptr && h2.lastStub->patch == 42,
           "and the captured instrument state comes back");

    const auto part = h2.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0];
    check (part.getProperty ("partId", {}).toString() == partId, "the part keeps its identity");
    check ((bool) part.getProperty ("hasInstrument", false), "and its instrument");
    check (juce::approximatelyEqual ((float) (double) part.getProperty ("volume", 0.0), 0.5f),
           "and its mixer values");
}

void testUnresolvedAndFailures()
{
    std::cout << "\nfailed and unresolved loads" << std::endl;

    const auto dir = freshDataDir ("failures");
    seedCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    const auto partId = h.firstPartId();

    h.failInstantiation = true;
    h.emits.clear();
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
    check (h.emits.lastError().contains ("stub refused"), "an instantiation failure is reported");
    const auto part = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0];
    check (! (bool) part.getProperty ("hasInstrument", true), "and the part stays empty");
}

void testSupersededLoad()
{
    std::cout << "\nsuperseded load" << std::endl;

    const auto dir = freshDataDir ("superseded");
    seedCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    const auto partId = h.firstPartId();

    h.deferCallbacks = true;
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
    check (h.deferred.size() == 2, "two loads are in flight");

    // Both stubs exist BEFORE either callback runs: a refused arrival is destroyed inside
    // the commit, and a later allocation can land on the freed address — comparing against
    // a dead pointer would make this test pass and fail by allocator mood.
    auto first = std::make_unique<StubSynthProcessor>();
    auto second = std::make_unique<StubSynthProcessor>();
    auto* secondRaw = second.get();

    h.deferred[0] (std::move (first), {});
    check (h.service->getRackHost().getInstrument (partId) == nullptr,
           "the stale arrival is refused");

    h.deferred[1] (std::move (second), {});
    check (h.service->getRackHost().getInstrument (partId) == secondRaw,
           "the newest arrival wins");
}

void testDeadManStartup()
{
    std::cout << "\ndead-man marker at startup" << std::endl;

    const auto dir = freshDataDir ("deadman");
    seedCatalog (dir);
    ceditor::host::PluginScannerCoordinator::markerFile (dir).replaceWithText ("C:\\VST3\\Good.vst3");

    Harness h (dir);
    h.cmd ("getState");

    const auto* state = h.emits.lastState();
    bool goodQuarantined = false;
    if (state != nullptr)
        for (const auto& module : *state->getProperty ("modules", {}).getArray())
            if (module.getProperty ("path", {}).toString() == "C:\\VST3\\Good.vst3")
                goodQuarantined = (bool) module.getProperty ("quarantined", false);

    check (goodQuarantined, "the module named by a leftover marker starts quarantined");
    check (! ceditor::host::PluginScannerCoordinator::markerFile (dir).existsAsFile(),
           "and the marker is consumed");
    check (state != nullptr && state->getProperty ("instruments", {}).size() == 0,
           "its classes leave the browser projection until the user clears it");

    h.cmd ("clearQuarantine", { { "modulePath", "C:\\VST3\\Good.vst3" } });
    check (h.emits.lastState()->getProperty ("instruments", {}).size() == 1,
           "clearQuarantine brings them back");
}

void testEditorPolicy()
{
    std::cout << "\neditor pane policy" << std::endl;

    const auto dir = freshDataDir ("editor");
    seedCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    h.cmd ("addPart");
    h.cmd ("addPart");
    const auto a = h.partIdAt (0);
    const auto b = h.partIdAt (1);
    const auto empty = h.partIdAt (2);

    h.cmd ("loadInstrument", { { "partId", a }, { "ceId", "VST3-good-synth" } });
    h.cmd ("loadInstrument", { { "partId", b }, { "ceId", "VST3-good-synth" } });

    h.emits.clear();
    h.cmd ("openEditor", { { "partId", empty } });
    check (h.emits.lastError().contains ("no instrument"), "an empty part cannot open an editor");
    check (h.paneLog.empty(), "and the pane was never asked to");

    h.cmd ("openEditor", { { "partId", a } });
    check (! h.paneLog.empty() && h.paneLog.back() == "show:" + a + ":Good Synth",
           "openEditor shows the part's instrument with its display name");
    check (h.lastShownProcessor == h.service->getRackHost().getInstrument (a),
           "and it is the live processor, not a copy");
    check (h.editorOpenPartId() == a, "state carries the open editor's part");

    h.cmd ("focusPart", { { "partId", b } });
    check (h.paneLog.back() == "show:" + b + ":Good Synth",
           "the editor follows the focused part");
    check (h.editorOpenPartId() == b, "state follows too");

    h.cmd ("focusPart", { { "partId", empty } });
    check (h.paneLog.back() == "hide", "focusing an empty part hides the pane");
    check (h.editorOpenPartId().isEmpty(), "and state says so");

    // Replacement continuity: reopen on B, replace B's instrument, the pane comes back on
    // the new one — hidden first (the old editor must die before its processor), then shown.
    h.cmd ("openEditor", { { "partId", b } });
    h.paneLog.clear();
    h.cmd ("loadInstrument", { { "partId", b }, { "ceId", "VST3-good-synth" } });
    check (h.paneLog.size() >= 2 && h.paneLog.front() == "hide"
             && h.paneLog.back() == "show:" + b + ":Good Synth",
           "a replacement hides the old editor first and re-shows on the new instrument");
    check (h.lastShownProcessor == h.service->getRackHost().getInstrument (b),
           "showing the replacement instrument, not the destroyed one");

    h.cmd ("closeEditor");
    check (h.paneLog.back() == "hide" && h.editorOpenPartId().isEmpty(), "closeEditor hides");
    check (h.service->getRackHost().partHasInstrument (b),
           "and close is not unload — the instrument stays");

    h.cmd ("openEditor", { { "partId", b } });
    h.paneLog.clear();
    h.cmd ("removePart", { { "partId", b } });
    check (! h.paneLog.empty() && h.paneLog.front() == "hide",
           "removing the part hides its editor before the processor dies");
    check (h.editorOpenPartId().isEmpty(), "and clears the open-editor state");

    h.cmd ("openEditor", { { "partId", a } });
    h.paneLog.clear();
    h.cmd ("unloadInstrument", { { "partId", a } });
    check (! h.paneLog.empty() && h.paneLog.front() == "hide",
           "unloading hides the editor too");
}

void testScan (const juce::File& stubWorker)
{
    std::cout << "\nscan through the stub worker" << std::endl;

    const auto dir = freshDataDir ("scan");
    const auto moduleDir = freshDataDir ("scan-modules");
    moduleDir.getChildFile ("One.vst3").replaceWithText ("module one");
    moduleDir.getChildFile ("crash.vst3").replaceWithText ("module two");

    Harness h (dir, stubWorker);
    h.cmd ("getState");
    h.cmd ("addScanPath", { { "path", moduleDir.getFullPathName() } });
    check (h.emits.lastState()->getProperty ("scanPaths", {}).size() == 1,
           "addScanPath answers with the path in state");

    h.emits.clear();
    h.cmd ("scan");
    check (h.emits.count ("instrumentHostScanProgress") >= 2, "a scan reports progress");
    const auto& last = h.emits.entries.back();
    check (last.name == "instrumentHostScanProgress"
             && (bool) last.payload.getProperty ("done", false),
           "and its final progress event says done");

    h.cmd ("getState");
    const auto* state = h.emits.lastState();
    check (state != nullptr && state->getProperty ("instruments", {}).size() == 1,
           "the stub module's instrument class arrives in the catalogue");

    // Busy guard: hold the scan body un-run and ask again.
    h.captureScanBody = true;
    h.cmd ("scan");
    h.emits.clear();
    h.cmd ("scan");
    check (h.emits.lastError().contains ("already running"), "a second scan while busy is refused");
    h.scanBody();   // release the held scan so the service can be torn down clean

    moduleDir.deleteRecursively();
}

// The wrapper-context API — what the generated targets use instead of the bridge. The outer
// VST3 is the demanding one: the DAW owns the session (persistSession=false, state through
// capture/restore vars), announces its own rate, and destroys/recreates the editor window at
// will. Each of those contracts is asserted here so the wrappers stay thin glue.
void testWrapperContext()
{
    std::cout << "\nwrapper context (the generated targets)" << std::endl;

    const auto dir = freshDataDir ("wrapper");
    seedCatalog (dir);

    const auto asPlugin = [] (InstrumentHostService::Options& o) { o.persistSession = false; };

    juce::var chunk;
    {
        Harness h (dir, {}, asPlugin);
        h.cmd ("getState");
        h.cmd ("addPart");
        const auto partId = h.firstPartId();

        h.service->prepareRuntime (96000.0, 256);
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        check (juce::approximatelyEqual (h.lastSampleRate, 96000.0),
               "instantiation after prepareRuntime uses the host's sample rate");

        h.lastStub->patch = 7;
        h.cmd ("setPartMixer", { { "partId", partId }, { "volume", 0.25 } });
        check (! dir.getChildFile ("session-performance.json").existsAsFile(),
               "persistSession=false never writes the session file");

        chunk = h.service->captureStateVar();
        check (chunk.isObject(), "captureStateVar hands back the session as a var");
    }

    {
        // A fresh processor in a reopened project: state arrives through the chunk, not a file.
        Harness h (dir, {}, asPlugin);
        h.service->restoreFromVar (chunk);
        check (h.lastStub != nullptr && h.lastStub->patch == 7,
               "restoreFromVar rebuilds the rack and its instrument state from the chunk");

        const auto part = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0];
        check (juce::approximatelyEqual ((float) (double) part.getProperty ("volume", 0.0), 0.25f),
               "and the mixer values ride along");

        // The DAW closes the window: hooks detach, the service keeps its editor intent.
        const auto partId = h.firstPartId();
        h.cmd ("openEditor", { { "partId", partId } });
        check (h.lastShownProcessor != nullptr, "the editor opens into the attached pane");
        h.service->setEditorPaneHooks ({});
        h.paneLog.clear();

        // The DAW reopens it: a new pane attaches and asks for whatever was open.
        InstrumentHostService::EditorPaneHooks reopened;
        reopened.show = [&h] (const juce::String& partIdShown, juce::AudioProcessor&,
                              const juce::String&)
        {
            h.paneLog.push_back ("reopened:" + partIdShown);
        };
        h.service->setEditorPaneHooks (std::move (reopened));
        h.service->reassertEditorPane();
        check (! h.paneLog.empty() && h.paneLog.back() == "reopened:" + partId,
               "reassertEditorPane re-shows the intended editor into the new pane");

        check (h.editorOpenPartId() == partId,
               "the state payload still names the open editor across the gap");
    }

    // A garbage chunk must not tear down a working rack.
    {
        Harness h (dir, {}, asPlugin);
        h.cmd ("getState");
        h.cmd ("addPart");
        const auto partId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });

        h.emits.clear();
        h.service->restoreFromVar (juce::var ("nonsense"));
        check (h.emits.lastError().contains ("could not be read"),
               "an unreadable chunk is refused aloud");
        check (h.service->getRackHost().getInstrument (partId) != nullptr,
               "and the current rack survives it");
    }
}
} // namespace

int main (int argc, char* argv[])
{
    if (argc != 2)
    {
        std::cout << "usage: CEditorInstrumentHostServiceTests <path-to-CEditorScannerStub>" << std::endl;
        return 64;
    }

    const juce::File stubWorker (juce::String::fromUTF8 (argv[1]));
    if (! stubWorker.existsAsFile())
    {
        std::cout << "stub worker not found: " << stubWorker.getFullPathName() << std::endl;
        return 64;
    }

    std::cout << "InstrumentHostService tests" << std::endl;

    testCommandFlow();
    testSessionSurvivesProcess();
    testUnresolvedAndFailures();
    testSupersededLoad();
    testDeadManStartup();
    testEditorPolicy();
    testScan (stubWorker);
    testWrapperContext();

    juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("ceditor-host-service-tests").deleteRecursively();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
