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

// A two-bus instrument for the explicit multi-output tests: the main pair holds one known
// level, the aux pair another, so which pairs reach the mix is an amplitude question.
struct MultiOutSynth : juce::AudioProcessor
{
    MultiOutSynth()
        : juce::AudioProcessor (BusesProperties()
                                    .withOutput ("Main", juce::AudioChannelSet::stereo(), true)
                                    .withOutput ("Aux",  juce::AudioChannelSet::stereo(), true))
    {
    }

    void prepareToPlay (double, int) override {}
    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        for (const auto metadata : midi)
        {
            const auto message = metadata.getMessage();
            if (message.isNoteOn())
                ++activeNotes;
            else if (message.isNoteOff())
                activeNotes = juce::jmax (0, activeNotes - 1);
        }

        audio.clear();
        if (activeNotes > 0)
            for (int ch = 0; ch < audio.getNumChannels(); ++ch)
                juce::FloatVectorOperations::fill (audio.getWritePointer (ch),
                                                   ch < 2 ? 0.2f : 0.4f, audio.getNumSamples());
    }

    const juce::String getName() const override               { return "Multi Synth"; }
    bool acceptsMidi() const override                         { return true; }
    bool producesMidi() const override                        { return false; }
    double getTailLengthSeconds() const override              { return 0.0; }
    juce::AudioProcessorEditor* createEditor() override       { return nullptr; }
    bool hasEditor() const override                           { return false; }
    int getNumPrograms() override                             { return 1; }
    int getCurrentProgram() override                          { return 0; }
    void setCurrentProgram (int) override                     {}
    const juce::String getProgramName (int) override          { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override    {}
    void setStateInformation (const void*, int) override      {}

    int activeNotes = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MultiOutSynth)
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
            ++instantiateCount;
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
            if (descriptionXml.contains ("Reverb"))
            {
                auto fx = std::make_unique<ceditor::test::StubEffectProcessor>();
                lastEffectStub = fx.get();
                callback (std::move (fx), {});
                return;
            }
            if (descriptionXml.contains ("Multi"))
            {
                callback (std::make_unique<MultiOutSynth>(), {});
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
    int instantiateCount = 0;
    StubSynthProcessor* lastStub = nullptr;
    ceditor::test::StubEffectProcessor* lastEffectStub = nullptr;
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

// Two healthy instrument classes in two modules — for the tests that need a part to change
// class underneath a binding.
void seedTwoSynthCatalog (const juce::File& dataDir)
{
    PluginCatalog catalog;

    for (const auto* name : { "Good", "Other" })
    {
        ModuleScanResult module;
        module.modulePath = juce::String ("C:\\VST3\\") + name + ".vst3";
        module.fingerprint = juce::String ("fp-") + name;
        PluginClassRecord synth;
        synth.ceId = juce::String ("VST3-") + juce::String (name).toLowerCase() + "-synth";
        synth.name = juce::String (name) + " Synth";
        synth.vendor = "Test Audio";
        synth.isInstrument = true;
        synth.descriptionXml = "<PLUGIN name=\"" + synth.name + "\" ceId=\"" + synth.ceId + "\"/>";
        module.classes.add (synth);
        catalog.commitScanResult (module);
    }

    // One effect class beside them — the Stage 5 chains need something non-instrument.
    ModuleScanResult fx;
    fx.modulePath = "C:\\VST3\\FX.vst3";
    fx.fingerprint = "fp-fx";
    PluginClassRecord reverb;
    reverb.ceId = "VST3-nice-reverb";
    reverb.name = "Nice Reverb";
    reverb.vendor = "Test Audio";
    reverb.isInstrument = false;
    reverb.descriptionXml = "<PLUGIN name=\"Nice Reverb\" ceId=\"VST3-nice-reverb\"/>";
    fx.classes.add (reverb);
    catalog.commitScanResult (fx);

    // And a multi-output instrument for the explicit routing tests.
    ModuleScanResult multi;
    multi.modulePath = "C:\\VST3\\Multi.vst3";
    multi.fingerprint = "fp-multi";
    PluginClassRecord multiSynth;
    multiSynth.ceId = "VST3-multi-synth";
    multiSynth.name = "Multi Synth";
    multiSynth.vendor = "Test Audio";
    multiSynth.isInstrument = true;
    multiSynth.descriptionXml = "<PLUGIN name=\"Multi Synth\" ceId=\"VST3-multi-synth\"/>";
    multi.classes.add (multiSynth);
    catalog.commitScanResult (multi);

    catalog.saveTo (dataDir.getChildFile ("plugin-catalog.json"));
}

// Neutral pages: named slots over parameter addresses. What must hold is the identity story —
// assignment captures the class the author bound against, a part that later loads a different
// class shows unresolved and refuses writes even when the new class has a parameter with the
// SAME id, and loading the original class back reconnects automatically.
void testControlPages()
{
    std::cout << "\ncontrol pages and bindings" << std::endl;

    const auto dir = freshDataDir ("pages");
    seedTwoSynthCatalog (dir);
    juce::String pageId, partId;

    {
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("addPart");
        partId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        auto* stubGood = h.lastStub;

        h.cmd ("addControlPage", { { "name", "Performance 1" } });
        const auto pages = h.emits.lastState()->getProperty ("rack", {}).getProperty ("pages", {});
        check (pages.size() == 1 && pages[0].getProperty ("slots", {}).size() == 8,
               "a new page carries eight empty slots");
        pageId = pages[0].getProperty ("pageId", {}).toString();

        h.cmd ("assignControlSlot", { { "pageId", pageId }, { "slotId", "s1" },
                                      { "partId", partId }, { "parameterId", "cutoff" } });
        const auto slot = h.emits.lastState()->getProperty ("rack", {}).getProperty ("pages", {})[0]
                              .getProperty ("slots", {})[0];
        check ((bool) slot.getProperty ("assigned", false)
                 && (bool) slot.getProperty ("resolved", false)
                 && slot.getProperty ("displayName", {}).toString() == "Cutoff",
               "an assigned slot resolves and shows the parameter's name");

        h.emits.clear();
        h.cmd ("assignControlSlot", { { "pageId", pageId }, { "slotId", "s2" },
                                      { "partId", partId }, { "parameterId", "resonance" } });
        check (h.emits.lastError().contains ("Unknown parameter"),
               "assigning a parameter the registry does not hold refuses");

        h.cmd ("setControlSlotValue", { { "pageId", pageId }, { "slotId", "s1" }, { "value", 0.25 } });
        check (juce::approximatelyEqual (stubGood->cutoff->get(), 0.25f),
               "a slot value reaches the bound parameter");

        h.cmd ("setControlSlotOptions", { { "pageId", pageId }, { "slotId", "s1" },
                                          { "rangeMin", 0.5 }, { "rangeMax", 1.0 }, { "inverted", true } });
        h.cmd ("setControlSlotValue", { { "pageId", pageId }, { "slotId", "s1" }, { "value", 0.0 } });
        check (juce::approximatelyEqual (stubGood->cutoff->get(), 1.0f),
               "range and inversion map the value (0 inverted over 0.5..1 lands on 1)");
        h.cmd ("setControlSlotValue", { { "pageId", pageId }, { "slotId", "s1" }, { "value", 1.0 } });
        check (juce::approximatelyEqual (stubGood->cutoff->get(), 0.5f),
               "and the other end lands on the range floor");

        h.emits.clear();
        h.cmd ("setControlSlotValue", { { "pageId", pageId }, { "slotId", "s3" }, { "value", 0.5 } });
        check (h.emits.lastError().contains ("not assigned"), "an unassigned slot refuses values");
    }

    {
        // The session round trip, then the retarget story.
        Harness h (dir);
        h.cmd ("getState");
        auto slotOf = [&h] { return h.emits.lastState()->getProperty ("rack", {})
                                      .getProperty ("pages", {})[0].getProperty ("slots", {})[0]; };
        check ((bool) slotOf().getProperty ("resolved", false)
                 && slotOf().getProperty ("displayName", {}).toString() == "Cutoff",
               "bindings survive restart and reconnect to the same class");

        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-other-synth" } });
        auto* stubOther = h.lastStub;
        check ((bool) slotOf().getProperty ("assigned", false)
                 && ! (bool) slotOf().getProperty ("resolved", true),
               "a part that loads a different class turns the slot unresolved, not retargeted");

        const auto before = stubOther->cutoff->get();
        h.emits.clear();
        h.cmd ("setControlSlotValue", { { "pageId", pageId }, { "slotId", "s1" }, { "value", 0.9 } });
        check (h.emits.lastError().contains ("unresolved"),
               "writing through an unresolved slot refuses aloud");
        check (juce::approximatelyEqual (stubOther->cutoff->get(), before),
               "even though the new class has a parameter with the very same id");

        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        check ((bool) slotOf().getProperty ("resolved", false),
               "loading the assigned class back reconnects automatically");

        h.cmd ("clearControlSlot", { { "pageId", pageId }, { "slotId", "s1" } });
        check (! (bool) slotOf().getProperty ("assigned", true), "clearing a slot empties it");

        h.cmd ("removeControlPage", { { "pageId", pageId } });
        check (h.emits.lastState()->getProperty ("rack", {}).getProperty ("pages", {}).size() == 0,
               "removing the page removes it");
    }
}

// The Stage 2 parameter model: one registry per loaded instrument, addressed by the plug-in's
// own parameter IDs, with the bidirectional path — CEditor writes through the host-safe API,
// vendor-side edits arrive as coalesced deltas through drainParameterEvents. Two instances of
// one class must stay distinct, and a stale address must refuse rather than hit index zero.
void testParameterModel()
{
    std::cout << "\nparameter model" << std::endl;

    const auto dir = freshDataDir ("params");
    seedCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    h.cmd ("addPart");
    const auto partA = h.partIdAt (0), partB = h.partIdAt (1);
    h.cmd ("loadInstrument", { { "partId", partA }, { "ceId", "VST3-good-synth" } });
    auto* stubA = h.lastStub;
    h.cmd ("loadInstrument", { { "partId", partB }, { "ceId", "VST3-good-synth" } });
    auto* stubB = h.lastStub;

    h.emits.clear();
    h.cmd ("getParameters", { { "partId", partA } });
    const auto& reply = h.emits.entries.back();
    check (reply.name == "instrumentHostParameters"
             && reply.payload.getProperty ("partId", {}).toString() == partA,
           "getParameters answers with the part's registry");
    const auto params = reply.payload.getProperty ("parameters", {});
    // Three plug-in parameters plus the part's mixer addresses (@gain, @pan — no returns
    // exist yet), which Stage 5 folds into the same registry.
    check (params.size() == 5, "every host-visible parameter is listed");
    check (params[3].getProperty ("id", {}).toString() == "@gain"
             && params[4].getProperty ("id", {}).toString() == "@pan"
             && params[3].getProperty ("group", {}).toString() == "Mixer",
           "the mixer addresses follow the plug-in rows");
    check (params[0].getProperty ("id", {}).toString() == "cutoff"
             && ! (bool) params[0].getProperty ("discrete", true),
           "the plug-in's own paramID is the address, continuous classified");
    check (params[1].getProperty ("id", {}).toString() == "wave"
             && (bool) params[1].getProperty ("discrete", false)
             && (int) params[1].getProperty ("numSteps", 0) == 3,
           "a choice parameter reads as discrete with its step count");
    check (params[2].getProperty ("id", {}).toString() == "drive"
             && (bool) params[2].getProperty ("boolean", false),
           "a boolean parameter says so");
    check (params[0].getProperty ("text", {}).toString().isNotEmpty(),
           "and values arrive formatted");

    h.cmd ("setParameter", { { "partId", partA }, { "id", "cutoff" }, { "value", 0.8 } });
    check (juce::approximatelyEqual (stubA->cutoff->get(), 0.8f),
           "setParameter reaches the processor through the host-safe API");
    check (juce::approximatelyEqual (stubB->cutoff->get(), 0.5f),
           "and the other instance of the same class is untouched");

    // The vendor's editor half: a processor-side edit is only marks until the pump drains.
    h.emits.clear();
    stubB->cutoff->setValueNotifyingHost (0.25f);
    h.service->drainParameterEvents();
    bool sawDelta = false;
    for (const auto& e : h.emits.entries)
        if (e.name == "instrumentHostParamValues"
            && e.payload.getProperty ("partId", {}).toString() == partB)
            for (const auto& change : *e.payload.getProperty ("changes", {}).getArray())
                if (change.getProperty ("id", {}).toString() == "cutoff"
                    && juce::approximatelyEqual ((float) (double) change.getProperty ("value", 0.0), 0.25f))
                    sawDelta = true;
    check (sawDelta, "a vendor-side edit drains as a coalesced delta for its part");

    h.emits.clear();
    h.service->drainParameterEvents();
    check (h.emits.count ("instrumentHostParamValues") == 0, "a quiet drain emits nothing");

    h.cmd ("beginParameterGesture", { { "partId", partA }, { "id", "cutoff" } });
    h.cmd ("endParameterGesture", { { "partId", partA }, { "id", "cutoff" } });
    h.emits.clear();
    h.service->drainParameterEvents();
    bool sawGestures = false;
    for (const auto& e : h.emits.entries)
        if (e.name == "instrumentHostParamValues")
        {
            const auto gestures = e.payload.getProperty ("gestures", {});
            sawGestures = gestures.size() == 2
                            && gestures[0].getProperty ("phase", {}).toString() == "begin"
                            && gestures[1].getProperty ("phase", {}).toString() == "end";
        }
    check (sawGestures, "gesture boundaries ride along in order");

    h.cmd ("resetParameter", { { "partId", partA }, { "id", "cutoff" } });
    check (juce::approximatelyEqual (stubA->cutoff->get(), 0.5f), "resetParameter restores the default");

    h.emits.clear();
    h.cmd ("setParameter", { { "partId", partA }, { "id", "no-such-param" }, { "value", 1.0 } });
    check (h.emits.lastError().contains ("Unknown parameter"),
           "a stale address refuses instead of writing to an arbitrary index");
    check (juce::approximatelyEqual (stubA->cutoff->get(), 0.5f)
             && ! stubA->drive->get(),
           "and nothing moved");

    h.cmd ("unloadInstrument", { { "partId", partB } });
    h.emits.clear();
    h.cmd ("getParameters", { { "partId", partB } });
    {
        // The plug-in registry is gone with the instrument; the part's mixer addresses
        // remain — an empty (or hardware) part still has a fader to bind.
        const auto& unloaded = h.emits.entries.back();
        const auto remaining = unloaded.payload.getProperty ("parameters", {});
        check (unloaded.name == "instrumentHostParameters" && remaining.size() == 2
                 && remaining[0].getProperty ("id", {}).toString() == "@gain",
               "an unloaded part keeps only its mixer registry");
    }
    h.service->drainParameterEvents();   // and draining after the detach must not crash

    // Duplicate parameter IDs get unique addresses and a recorded warning, not silence.
    struct DupParamSynth : StubSynthProcessor
    {
        DupParamSynth()
        {
            addParameter (new juce::AudioParameterFloat ({ "dup", 1 }, "Dup A", 0.0f, 1.0f, 0.0f));
            addParameter (new juce::AudioParameterFloat ({ "dup", 1 }, "Dup B", 0.0f, 1.0f, 0.0f));
        }
    };
    DupParamSynth duplicated;
    const auto inventory = ceditor::host::describeParameters (duplicated);
    check (! inventory.warnings.isEmpty(), "duplicate parameter IDs are warned about");
    juce::StringArray ids;
    for (const auto& d : inventory.descriptors)
        ids.add (d.definitionId);
    check (ids.size() == 5 && ! ids.contains (juce::String()),
           "and every parameter still gets a unique, non-empty address");
    juce::StringArray sorted = ids;
    sorted.removeDuplicates (false);
    check (sorted.size() == ids.size(), "no two parameters share one address");
}

// Stage 5: insert chains, the master chain, and macros — all in the one graph and the one
// parameter path. The stub effect halves the signal, so presence, order, bypass and removal
// are amplitude ratios; identities, registries and editors follow the instrument rules.
void testEffectsAndMacros()
{
    std::cout << "\neffects and macros" << std::endl;

    const auto dir = freshDataDir ("effects");
    seedTwoSynthCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    const auto partId = h.firstPartId();
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
    auto* synth = h.lastStub;

    const auto peak = [&h]
    {
        juce::AudioBuffer<float> buffer (2, 512);
        juce::MidiBuffer midi;
        midi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        float highest = 0.0f;
        for (int i = 0; i < 3; ++i)
        {
            buffer.clear();
            h.service->getGraph().processBlock (buffer, midi);
            midi.clear();
            highest = juce::jmax (highest, buffer.getMagnitude (0, 512));
        }
        juce::MidiBuffer off;
        off.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
        buffer.clear();
        h.service->getGraph().processBlock (buffer, off);
        return highest;
    };
    const auto roughly = [] (float value, float expected)
    {
        return std::abs (value - expected) <= expected * 0.05f + 1.0e-6f;
    };

    const auto* state = h.emits.lastState();
    check (state->getProperty ("effectClasses", {}).size() == 1
             && state->getProperty ("effectClasses", {})[0].getProperty ("name", {}).toString()
                    == "Nice Reverb",
           "the effect picker's projection lists the non-instrument class");
    check (state->getProperty ("instruments", {}).size() == 3,
           "and the instrument browser still does not");

    const auto baseline = peak();
    check (baseline > 0.01f, "the dry part makes sound to begin with");

    // The insert chain: audibly in the path, ordered, bypassable, removable.
    h.cmd ("addEffect", { { "chainId", partId }, { "ceId", "VST3-nice-reverb" } });
    state = h.emits.lastState();
    const auto partEffects = state->getProperty ("rack", {}).getProperty ("parts", {})[0]
                                 .getProperty ("effects", {});
    check (partEffects.size() == 1
             && (bool) partEffects[0].getProperty ("hasProcessor", false)
             && partEffects[0].getProperty ("pluginName", {}).toString() == "Nice Reverb",
           "an added insert commits into the part's chain");
    const auto insertId = partEffects[0].getProperty ("effectId", {}).toString();
    auto* insertFx = h.lastEffectStub;
    check (roughly (peak(), baseline * 0.5f), "and the signal now runs through it");

    h.cmd ("addEffect", { { "chainId", "master" }, { "ceId", "VST3-nice-reverb" } });
    state = h.emits.lastState();
    check (state->getProperty ("rack", {}).getProperty ("masterEffects", {}).size() == 1,
           "the master chain takes effects too");
    check (roughly (peak(), baseline * 0.25f), "and every part runs through the master chain");

    h.cmd ("setEffectBypassed", { { "effectId", insertId }, { "bypassed", true } });
    check (roughly (peak(), baseline * 0.5f), "a bypassed insert passes through");
    h.cmd ("setEffectBypassed", { { "effectId", insertId }, { "bypassed", false } });
    check (roughly (peak(), baseline * 0.25f), "and comes back");

    // The effect is a first-class parameter target: registry, direct writes, page slots.
    h.emits.clear();
    h.cmd ("getParameters", { { "partId", insertId } });
    const auto& registry = h.emits.entries.back();
    check (registry.name == "instrumentHostParameters"
             && registry.payload.getProperty ("parameters", {})[0].getProperty ("id", {}).toString() == "wet",
           "an effect registers in the same parameter model");
    h.cmd ("setParameter", { { "partId", insertId }, { "id", "wet" }, { "value", 0.3 } });
    check (juce::approximatelyEqual (insertFx->wet->get(), 0.3f),
           "setParameter reaches the effect");

    h.cmd ("addControlPage", { { "name", "Mix" } });
    const auto pageId = h.emits.lastState()->getProperty ("rack", {}).getProperty ("pages", {})[0]
                            .getProperty ("pageId", {}).toString();
    h.cmd ("assignControlSlot", { { "pageId", pageId }, { "slotId", "s1" },
                                  { "partId", insertId }, { "parameterId", "wet" } });
    h.cmd ("setControlSlotValue", { { "pageId", pageId }, { "slotId", "s1" }, { "value", 0.9 } });
    check (juce::approximatelyEqual (insertFx->wet->get(), 0.9f),
           "a page slot drives an effect parameter like any other");

    // The editor pane hosts effects through the same policy.
    h.cmd ("openEffectEditor", { { "effectId", insertId } });
    check (! h.paneLog.empty() && h.paneLog.back() == "show:" + insertId + ":Nice Reverb",
           "the effect's editor shows in the shared pane");
    h.lastEffectStub->tone = 7;   // the master effect (latest instantiated) carries state
    h.cmd ("setPartMixer", { { "partId", partId }, { "volume", 1.0 } });   // persists everything

    h.cmd ("removeEffect", { { "effectId", insertId } });
    check (h.paneLog.back() == "hide", "removing the shown effect hides its editor first");
    check (roughly (peak(), baseline * 0.5f), "and the chain heals around the gap");
    h.emits.clear();
    h.cmd ("getParameters", { { "partId", insertId } });
    check (h.emits.lastError().isNotEmpty(), "its registry died with it");

    // Macros: one value fanning across two instances through the central path.
    h.cmd ("addPart");
    const auto partB = h.partIdAt (1);
    h.cmd ("loadInstrument", { { "partId", partB }, { "ceId", "VST3-good-synth" } });
    auto* synthB = h.lastStub;

    h.cmd ("addMacro", { { "name", "Brightness" } });
    const auto macroId = h.emits.lastState()->getProperty ("rack", {}).getProperty ("macros", {})[0]
                             .getProperty ("macroId", {}).toString();
    h.cmd ("addMacroTarget", { { "macroId", macroId }, { "targetId", partId }, { "parameterId", "cutoff" } });
    h.cmd ("addMacroTarget", { { "macroId", macroId }, { "targetId", partB }, { "parameterId", "cutoff" } });
    h.cmd ("setMacroTargetOptions", { { "macroId", macroId }, { "targetId", partB },
                                      { "parameterId", "cutoff" }, { "inverted", true } });

    h.cmd ("setMacroValue", { { "macroId", macroId }, { "value", 0.25 }, { "final", true } });
    check (juce::approximatelyEqual (synth->cutoff->get(), 0.25f)
             && juce::approximatelyEqual (synthB->cutoff->get(), 0.75f),
           "one macro moves several instances, each through its own mapping");

    h.cmd ("loadInstrument", { { "partId", partB }, { "ceId", "VST3-other-synth" } });
    auto* otherB = h.lastStub;
    const auto macroRow = h.emits.lastState()->getProperty ("rack", {}).getProperty ("macros", {})[0];
    check ((bool) macroRow.getProperty ("targets", {})[0].getProperty ("resolved", false)
             && ! (bool) macroRow.getProperty ("targets", {})[1].getProperty ("resolved", true),
           "a retargeted part turns its macro target unresolved, not silently rerouted");
    const auto before = otherB->cutoff->get();
    h.cmd ("setMacroValue", { { "macroId", macroId }, { "value", 1.0 }, { "final", true } });
    check (juce::approximatelyEqual (synth->cutoff->get(), 1.0f)
             && juce::approximatelyEqual (otherB->cutoff->get(), before),
           "the macro keeps driving resolved targets and skips the unresolved one");
}

// The enriched Performance round trip: chains, bypass flags, effect state and macros come
// back through the same session path everything else uses.
void testEnrichedPerformanceRestore()
{
    std::cout << "\nenriched performance restore" << std::endl;

    // Continues the previous test's session — the same directory WITHOUT the fresh wipe.
    const auto dir = juce::File::getSpecialLocation (juce::File::tempDirectory)
                         .getChildFile ("ceditor-host-service-tests").getChildFile ("effects");
    Harness h (dir);
    h.cmd ("getState");

    const auto* state = h.emits.lastState();
    const auto part = state->getProperty ("rack", {}).getProperty ("parts", {})[0];
    check (state->getProperty ("rack", {}).getProperty ("masterEffects", {}).size() == 1
             && (bool) state->getProperty ("rack", {}).getProperty ("masterEffects", {})[0]
                    .getProperty ("hasProcessor", false),
           "the master chain restores with its processor");
    check (part.getProperty ("effects", {}).size() == 0,
           "and the removed insert stays removed");
    check (h.lastEffectStub != nullptr && h.lastEffectStub->tone == 7,
           "effect state rides the manifest like instrument state");

    const auto macros = state->getProperty ("rack", {}).getProperty ("macros", {});
    check (macros.size() == 1
             && macros[0].getProperty ("targets", {}).size() == 2
             && juce::approximatelyEqual ((float) (double) macros[0].getProperty ("value", 0.0), 1.0f),
           "macros restore with their targets and value");
}

// Shared send/return buses (§18.7.5, §18.7.7): post-fader sends into one more effect chain,
// the chain's level rejoining ahead of the master inserts — all amplitude-provable through
// the same graph, and all of it round-tripping through the session file.
void testSendsAndReturns()
{
    std::cout << "\nsends and returns" << std::endl;

    const auto dir = freshDataDir ("sendreturn");
    seedTwoSynthCatalog (dir);

    // Measures the SETTLED level (gain ramps span one block), not the transient peak.
    const auto peakOf = [] (Harness& h)
    {
        juce::AudioBuffer<float> buffer (2, 512);
        juce::MidiBuffer midi;
        midi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        float settled = 0.0f;
        for (int i = 0; i < 3; ++i)
        {
            buffer.clear();
            h.service->getGraph().processBlock (buffer, midi);
            midi.clear();
            settled = buffer.getMagnitude (0, 512);
        }
        juce::MidiBuffer off;
        off.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
        buffer.clear();
        h.service->getGraph().processBlock (buffer, off);
        return settled;
    };
    const auto roughly = [] (float value, float expected)
    {
        return std::abs (value - expected) <= expected * 0.05f + 1.0e-6f;
    };

    juce::String returnId, partId;
    float baseline = 0.0f;
    {
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("addPart");
        partId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        baseline = peakOf (h);
        check (baseline > 0.01f, "the dry part makes sound to begin with");

        h.cmd ("addReturn", { { "name", "FX Bus" } });
        const auto* state = h.emits.lastState();
        const auto returns = state->getProperty ("rack", {}).getProperty ("returns", {});
        check (returns.size() == 1
                 && returns[0].getProperty ("name", {}).toString() == "FX Bus",
               "a return chain appears in state");
        returnId = returns[0].getProperty ("returnId", {}).toString();

        h.cmd ("setSendLevel", { { "partId", partId }, { "returnId", returnId }, { "level", 1.0 } });
        check (roughly (peakOf (h), baseline * 2.0f),
               "an empty return at unity doubles the part (dry plus wet)");

        h.cmd ("addEffect", { { "chainId", returnId }, { "ceId", "VST3-nice-reverb" } });
        state = h.emits.lastState();
        check ((bool) state->getProperty ("rack", {}).getProperty ("returns", {})[0]
                   .getProperty ("effects", {})[0].getProperty ("hasProcessor", false),
               "the return chain loads effects through the same transaction");
        check (roughly (peakOf (h), baseline * 1.5f),
               "the wet path runs the return's effects");

        h.cmd ("setReturnLevel", { { "returnId", returnId }, { "level", 0.5 } });
        check (roughly (peakOf (h), baseline * 1.25f), "the return's own level scales the wet path");
        h.cmd ("setReturnLevel", { { "returnId", returnId }, { "level", 1.0 } });

        h.cmd ("setPartMixer", { { "partId", partId }, { "mute", true } });
        check (peakOf (h) < 1.0e-4f, "a post-fader send goes silent with its part");
        h.cmd ("setPartMixer", { { "partId", partId }, { "mute", false } });
        check (roughly (peakOf (h), baseline * 1.5f), "and comes back");

        h.lastEffectStub->tone = 3;
        h.cmd ("setPartMixer", { { "partId", partId }, { "volume", 1.0 } });   // persists everything

        // Removing the return heals the wiring and drops the stranded sends.
        h.cmd ("addReturn", { { "name", "Doomed" } });
        const auto doomedId = h.emits.lastState()->getProperty ("rack", {}).getProperty ("returns", {})[1]
                                  .getProperty ("returnId", {}).toString();
        h.cmd ("setSendLevel", { { "partId", partId }, { "returnId", doomedId }, { "level", 1.0 } });
        h.cmd ("removeReturn", { { "returnId", doomedId } });
        state = h.emits.lastState();
        check (state->getProperty ("rack", {}).getProperty ("returns", {}).size() == 1
                 && state->getProperty ("rack", {}).getProperty ("parts", {})[0]
                        .getProperty ("sends", {}).size() == 1,
               "removing a return drops its sends and keeps the others");
        check (roughly (peakOf (h), baseline * 1.5f), "and the mix is undisturbed");
    }

    // The enriched manifest round trip: returns, their effects and states, and the sends.
    Harness h2 (dir);
    h2.cmd ("getState");
    const auto* state = h2.emits.lastState();
    const auto returns = state->getProperty ("rack", {}).getProperty ("returns", {});
    check (returns.size() == 1
             && (bool) returns[0].getProperty ("effects", {})[0].getProperty ("hasProcessor", false),
           "the return chain restores with its processor");
    check (h2.lastEffectStub != nullptr && h2.lastEffectStub->tone == 3,
           "return-effect state rides the manifest");
    const auto sends = state->getProperty ("rack", {}).getProperty ("parts", {})[0]
                           .getProperty ("sends", {});
    check (sends.size() == 1
             && juce::approximatelyEqual ((float) (double) sends[0].getProperty ("level", 0.0), 1.0f),
           "sends restore with their levels");
    const auto restoredBaseline = peakOf (h2) / 1.5f;
    check (roughly (peakOf (h2), restoredBaseline * 1.5f) && peakOf (h2) > 0.01f,
           "and the restored wet path is audible");
}

// Explicit multi-output routing (§18.7.7): an instrument's extra stereo pair reaches the
// master path through its own gain; the main pair keeps the inserts and the fader.
void testMultiOutputRouting()
{
    std::cout << "\nexplicit multi-output routing" << std::endl;

    const auto dir = freshDataDir ("multiout");
    seedTwoSynthCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    const auto partId = h.firstPartId();
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-multi-synth" } });

    // Settled level, not transient peak — the route gains ramp over one block.
    const auto peak = [&h]
    {
        juce::AudioBuffer<float> buffer (2, 512);
        juce::MidiBuffer midi;
        midi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        float settled = 0.0f;
        for (int i = 0; i < 3; ++i)
        {
            buffer.clear();
            h.service->getGraph().processBlock (buffer, midi);
            midi.clear();
            settled = buffer.getMagnitude (0, 512);
        }
        juce::MidiBuffer off;
        off.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
        buffer.clear();
        h.service->getGraph().processBlock (buffer, off);
        return settled;
    };
    const auto roughly = [] (float value, float expected)
    {
        return std::abs (value - expected) <= expected * 0.05f + 1.0e-6f;
    };

    check ((int) h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0]
               .getProperty ("outputChannels", 0) == 4,
           "the part reports its instrument's real output width");
    check (roughly (peak(), 0.2f), "only the main pair sounds until a route exists");

    h.cmd ("setExtraOut", { { "partId", partId }, { "pairIndex", 1 }, { "gain", 1.0 } });
    check (roughly (peak(), 0.6f), "a routed extra pair joins the mix at its own gain");

    h.cmd ("setExtraOut", { { "partId", partId }, { "pairIndex", 1 }, { "gain", 0.5 } });
    check (roughly (peak(), 0.4f), "the route's gain is live");
    const auto extraOuts = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0]
                               .getProperty ("extraOuts", {});
    check (extraOuts.size() == 1
             && (int) extraOuts[0].getProperty ("pairIndex", 0) == 1,
           "the route is state, not a side effect");

    h.emits.clear();
    h.cmd ("setExtraOut", { { "partId", partId }, { "pairIndex", 0 }, { "gain", 1.0 } });
    check (h.emits.lastError().isNotEmpty(), "the main pair is refused here — it has the fader");

    h.cmd ("removeExtraOut", { { "partId", partId }, { "pairIndex", 1 } });
    check (roughly (peak(), 0.2f), "an unrouted pair leaves the mix");
}

// Hardware-instrument parts (§18.7.6): an external synth as a first-class part — MIDI out
// through an injected port, program recall, an audio return running the part's own inserts
// and fader, and the port-gone diagnostic. No hardware in this container; the sink IS the
// assertion.
void testHardwareParts()
{
    std::cout << "\nhardware-instrument parts" << std::endl;

    const auto dir = freshDataDir ("hardware");
    seedTwoSynthCatalog (dir);

    std::vector<juce::MidiMessage> captured;
    const auto tweak = [&captured] (InstrumentHostService::Options& options)
    {
        options.listMidiOutputs = []
        {
            juce::StringPairArray outputs;
            outputs.set ("an1x-port", "AN1x Port");
            return outputs;
        };
        options.openMidiOutput = [&captured] (const juce::String& deviceId, juce::String& errorOut)
            -> ceditor::host::MidiSendProcessor::Sink
        {
            if (deviceId != "an1x-port")
            {
                errorOut = "No such MIDI output.";
                return {};
            }
            return [&captured] (const juce::MidiBuffer& messages)
            {
                for (const auto metadata : messages)
                    captured.push_back (metadata.getMessage());
            };
        };
    };

    juce::String partId;
    {
        Harness h (dir, {}, tweak);
        h.cmd ("getState");
        h.cmd ("addPart");
        partId = h.firstPartId();

        h.cmd ("setHardwareConfig", { { "partId", partId },
                                      { "midiOutputId", "an1x-port" },
                                      { "midiOutputName", "AN1x Port" },
                                      { "midiOutChannel", 3 },
                                      { "programBank", 2 },
                                      { "programNumber", 45 } });
        const auto* state = h.emits.lastState();
        const auto part = state->getProperty ("rack", {}).getProperty ("parts", {})[0];
        check ((bool) part.getProperty ("hardware", false)
                 && part.getProperty ("midiOutError", "x").toString().isEmpty(),
               "a hardware part configures and its port opens");

        h.emits.clear();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        check (h.emits.lastError().contains ("hardware"),
               "a hardware part refuses a plug-in load");

        // The part's filtered MIDI reaches the port, rechannelled to the synth's channel.
        juce::AudioBuffer<float> buffer (2, 512);
        juce::MidiBuffer midi;
        midi.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 0);
        h.service->getGraph().processBlock (buffer, midi);
        check (! captured.empty() && captured.back().isNoteOn()
                 && captured.back().getChannel() == 3
                 && captured.back().getNoteNumber() == 64,
               "performance MIDI reaches the hardware, on its channel");

        captured.clear();
        h.cmd ("sendHardwareProgram", { { "partId", partId } });
        check (captured.size() == 3
                 && captured[0].isController() && captured[0].getControllerNumber() == 0
                 && captured[1].isController() && captured[1].getControllerNumber() == 32
                 && captured[1].getControllerValue() == 2
                 && captured[2].isProgramChange()
                 && captured[2].getProgramChangeNumber() == 45
                 && captured[2].getChannel() == 3,
               "program recall sends bank select then program change");

        // The managed audio return: interface inputs → the part's inserts → its fader.
        h.service->prepareRuntime (44100.0, 512, 4);
        h.cmd ("setHardwareConfig", { { "partId", partId }, { "audioReturnChannel", 2 } });

        const auto returnPeak = [&h]
        {
            // Two blocks: the second is past any gain ramp.
            float settled = 0.0f;
            for (int i = 0; i < 2; ++i)
            {
                juce::AudioBuffer<float> io (4, 512);
                io.clear();
                juce::FloatVectorOperations::fill (io.getWritePointer (2), 0.5f, 512);
                juce::FloatVectorOperations::fill (io.getWritePointer (3), 0.5f, 512);
                juce::MidiBuffer none;
                h.service->getGraph().processBlock (io, none);
                settled = io.getMagnitude (0, 0, 512);
            }
            return settled;
        };
        check (std::abs (returnPeak() - 0.5f) < 0.03f,
               "the audio return reaches the mix");

        h.cmd ("setPartMixer", { { "partId", partId }, { "volume", 0.5 } });
        check (std::abs (returnPeak() - 0.25f) < 0.03f,
               "the part's fader rides the returned audio");

        h.cmd ("addEffect", { { "chainId", partId }, { "ceId", "VST3-nice-reverb" } });
        check (std::abs (returnPeak() - 0.125f) < 0.03f,
               "and the part's inserts process it");

        // A port that is gone is a diagnostic on the part, never silence.
        h.cmd ("addPart");
        const auto partB = h.partIdAt (1);
        h.cmd ("setHardwareConfig", { { "partId", partB }, { "midiOutputId", "unplugged" } });
        const auto rowB = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[1];
        check (rowB.getProperty ("midiOutError", "").toString().isNotEmpty(),
               "a missing MIDI port is reported on its part");
    }

    // Restore: the port reopens, the program re-sends, the return re-wires — no commands.
    captured.clear();
    Harness h2 (dir, {}, tweak);
    h2.cmd ("getState");
    bool programResent = false;
    for (const auto& message : captured)
        programResent = programResent || (message.isProgramChange()
                                            && message.getProgramChangeNumber() == 45
                                            && message.getChannel() == 3);
    check (programResent, "restore reconnects the port and recalls the program");

    h2.service->prepareRuntime (44100.0, 512, 4);
    float restoredLevel = 0.0f;
    for (int i = 0; i < 2; ++i)
    {
        juce::AudioBuffer<float> io (4, 512);
        io.clear();
        juce::FloatVectorOperations::fill (io.getWritePointer (2), 0.5f, 512);
        juce::FloatVectorOperations::fill (io.getWritePointer (3), 0.5f, 512);
        juce::MidiBuffer none;
        h2.service->getGraph().processBlock (io, none);
        restoredLevel = io.getMagnitude (0, 0, 512);
    }
    check (std::abs (restoredLevel - 0.125f) < 0.03f,
           "the audio return restores through fader and inserts");
}

// Virtual parameter addresses: faders, pans, sends and whole macros as ordinary parameter
// targets — pages and macros drive the mixer through the same binding math, and a macro on
// a page slot makes hardware encoders play macros (§18.7.8).
void testVirtualAddressesAndMacroSlots()
{
    std::cout << "\nvirtual addresses and macro slots" << std::endl;

    const auto dir = freshDataDir ("virtual");
    seedTwoSynthCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    const auto partId = h.firstPartId();
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });

    const auto partVolume = [&h]
    {
        return (float) (double) h.emits.lastState()->getProperty ("rack", {})
                   .getProperty ("parts", {})[0].getProperty ("volume", -1.0);
    };

    h.cmd ("setParameter", { { "partId", partId }, { "id", "@gain" }, { "value", 0.25 } });
    check (juce::approximatelyEqual (partVolume(), 0.5f),
           "@gain writes the part's fader through the parameter path");

    h.cmd ("addReturn", { { "name", "Verb" } });
    const auto returnId = h.emits.lastState()->getProperty ("rack", {}).getProperty ("returns", {})[0]
                              .getProperty ("returnId", {}).toString();
    h.emits.clear();
    h.cmd ("getParameters", { { "partId", partId } });
    const auto rows = h.emits.entries.back().payload.getProperty ("parameters", {});
    bool sendListed = false;
    for (int i = 0; i < rows.size(); ++i)
        sendListed = sendListed || rows[i].getProperty ("id", {}).toString() == "@send:" + returnId;
    check (sendListed, "each return adds a send address to the part's registry");

    // A fader on a page slot: assignment, absolute writes, relative nudges, the projection.
    h.cmd ("addControlPage", { { "name", "Mix" } });
    const auto pageId = h.emits.lastState()->getProperty ("rack", {}).getProperty ("pages", {})[0]
                            .getProperty ("pageId", {}).toString();
    h.cmd ("assignControlSlot", { { "pageId", pageId }, { "slotId", "s1" },
                                  { "partId", partId }, { "parameterId", "@gain" } });
    h.cmd ("setControlSlotValue", { { "pageId", pageId }, { "slotId", "s1" }, { "value", 1.0 } });
    check (juce::approximatelyEqual (partVolume(), 2.0f), "a page slot drives the fader");

    check (h.service->nudgeControlSlot (pageId, "s1", -64), "a nudge is accepted");
    check (std::abs (partVolume() - (2.0f - 64.0f / 127.0f * 2.0f)) < 0.02f,
           "and moves the fader relatively");

    const auto slots = h.service->surfaceSlots (pageId);
    check (slots[0].resolved && slots[0].displayName == "Level"
             && slots[0].valueText.isNotEmpty(),
           "the surface projection names and formats the mixer address");

    // A macro fans into a send level like any other target.
    h.cmd ("addMacro", { { "name", "Space" } });
    const auto macroId = h.emits.lastState()->getProperty ("rack", {}).getProperty ("macros", {})[0]
                             .getProperty ("macroId", {}).toString();
    h.cmd ("addMacroTarget", { { "macroId", macroId }, { "targetId", partId },
                               { "parameterId", "@send:" + returnId } });
    h.cmd ("setMacroValue", { { "macroId", macroId }, { "value", 0.5 }, { "final", true } });
    const auto sends = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0]
                           .getProperty ("sends", {});
    check (sends.size() == 1
             && juce::approximatelyEqual ((float) (double) sends[0].getProperty ("level", 0.0), 1.0f),
           "a macro drives a send level through the central path");

    // A macro ON a page slot: the encoder's target is the macro, the macro fans out.
    h.cmd ("assignControlSlot", { { "pageId", pageId }, { "slotId", "s2" },
                                  { "partId", macroId }, { "parameterId", "@macro" } });
    h.cmd ("setControlSlotValue", { { "pageId", pageId }, { "slotId", "s2" }, { "value", 1.0 } });
    const auto* state = h.emits.lastState();
    check (juce::approximatelyEqual ((float) (double) state->getProperty ("rack", {})
               .getProperty ("macros", {})[0].getProperty ("value", 0.0), 1.0f),
           "a page slot drives the whole macro");
    check (juce::approximatelyEqual ((float) (double) state->getProperty ("rack", {})
               .getProperty ("parts", {})[0].getProperty ("sends", {})[0].getProperty ("level", 0.0), 2.0f),
           "and the macro's targets follow");
    check (h.service->surfaceSlots (pageId)[1].displayName == "Space",
           "the slot shows the macro's name");

    h.emits.clear();
    h.cmd ("addMacroTarget", { { "macroId", macroId }, { "targetId", macroId },
                               { "parameterId", "@macro" } });
    check (h.emits.lastError().contains ("cannot target"),
           "a macro may not target a macro — page slots may");

    // Honesty when the address dies: the send binding unresolves, writes refuse.
    h.cmd ("removeReturn", { { "returnId", returnId } });
    const auto macroRow = h.emits.lastState()->getProperty ("rack", {}).getProperty ("macros", {})[0];
    check (! (bool) macroRow.getProperty ("targets", {})[0].getProperty ("resolved", true),
           "a send target unresolves when its return is gone");
    h.cmd ("setMacroValue", { { "macroId", macroId }, { "value", 0.2 }, { "final", true } });
    check (true, "and applying the macro skips it without harm");
}

// §18.7.11's resource behavior: engine load visible in state, chain latency visible per
// part, and the session file keeping revisions minutes apart instead of a keystroke log.
void testRevisionsAndEngine()
{
    std::cout << "\nrevisions and engine visibility" << std::endl;

    const auto dir = freshDataDir ("revisions");
    seedTwoSynthCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    const auto partId = h.firstPartId();

    const auto revisions = [&dir]
    {
        return dir.getChildFile ("session-revisions")
                  .findChildFiles (juce::File::findFiles, false, "*.json");
    };

    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
    check (revisions().size() == 1, "the first re-save snapshots the previous manifest");

    h.cmd ("setPartMixer", { { "partId", partId }, { "volume", 0.9 } });
    check (revisions().size() == 1, "an immediate re-save does not — revisions are not keystrokes");

    revisions().getFirst().setLastModificationTime (
        juce::Time::getCurrentTime() - juce::RelativeTime::minutes (11.0));
    h.cmd ("setPartMixer", { { "partId", partId }, { "volume", 0.8 } });
    check (revisions().size() == 2, "a save past the interval snapshots again");

    for (int i = 0; i < 14; ++i)
        dir.getChildFile ("session-revisions")
           .getChildFile ("session-0000-" + juce::String (i).paddedLeft ('0', 2) + ".json")
           .replaceWithText ("{}");
    for (auto& file : revisions())
        file.setLastModificationTime (juce::Time::getCurrentTime() - juce::RelativeTime::minutes (11.0));
    h.cmd ("setPartMixer", { { "partId", partId }, { "volume", 0.7 } });
    check (revisions().size() == 12, "the revision trail prunes to its cap, oldest first");

    // Latency is visible, not compensated: the stub effect reports 441 samples = 10ms.
    h.cmd ("addEffect", { { "chainId", partId }, { "ceId", "VST3-nice-reverb" } });
    const auto* state = h.emits.lastState();
    check (std::abs ((double) state->getProperty ("rack", {}).getProperty ("parts", {})[0]
                         .getProperty ("latencyMs", 0.0) - 10.0) < 0.5,
           "a part reports its chain's latency");
    check ((double) state->getProperty ("rack", {}).getProperty ("masterLatencyMs", -1.0) == 0.0,
           "the empty master chain reports none");

    const auto audio = state->getProperty ("audio", {});
    check (audio.hasProperty ("cpu") && audio.hasProperty ("xruns")
             && (double) audio.getProperty ("cpu", 1.0) == 0.0,
           "engine load reports zero while audio is off, never garbage");
}

// The Stage 6 performance system through the bridge: one transport, patterns that reach real
// instruments, automation that lands on Stage 2 addresses, scenes that recall through the
// rack rather than a second snapshot engine, a setlist that refuses to half-load, and capture
// that turns played notes into steps.
void testPerformanceSystem()
{
    std::cout << "\nthe performance system" << std::endl;

    const auto dir = freshDataDir ("performance");
    seedTwoSynthCatalog (dir);

    juce::String patternId, laneId, clipId, sceneId, partA, partB;

    {
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("addPart");
        partA = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partA }, { "ceId", "VST3-good-synth" } });
        auto* synthA = h.lastStub;

        // -- the transport -----------------------------------------------------------------
        h.cmd ("setTempo", { { "tempo", 120.0 } });
        h.cmd ("setTimeSignature", { { "numerator", 4 }, { "denominator", 4 } });
        const auto* state = h.emits.lastState();
        const auto transport = state->getProperty ("performance", {}).getProperty ("transport", {});
        check (! (bool) transport.getProperty ("playing", true)
                 && std::abs ((double) transport.getProperty ("tempo", 0.0) - 120.0) < 1.0e-9,
               "the transport reports itself, stopped and at tempo");

        // -- a pattern that reaches a real instrument --------------------------------------
        h.cmd ("addPattern", { { "name", "Riff" } });
        const auto patterns = h.emits.lastState()->getProperty ("performance", {})
                                  .getProperty ("patterns", {});
        check (patterns.size() == 1 && patterns[0].getProperty ("lanes", {}).size() == 1,
               "a new pattern arrives with a lane already aimed at the focused part");
        patternId = patterns[0].getProperty ("patternId", {}).toString();
        laneId = patterns[0].getProperty ("lanes", {})[0].getProperty ("laneId", {}).toString();

        h.cmd ("setLaneOptions", { { "patternId", patternId }, { "laneId", laneId },
                                   { "stepCount", 4 }, { "stepsPerBeat", 4 } });
        for (int i = 0; i < 4; ++i)
            h.cmd ("setStep", { { "patternId", patternId }, { "laneId", laneId },
                                { "index", i }, { "active", true },
                                { "note", 60 + i }, { "velocity", 100 } });

        h.cmd ("addClip", { { "patternId", patternId } });
        const auto clips = h.emits.lastState()->getProperty ("performance", {})
                               .getProperty ("clips", {});
        check (clips.size() == 1, "a clip references the pattern");
        clipId = clips[0].getProperty ("clipId", {}).toString();

        h.cmd ("setClipOptions", { { "clipId", clipId }, { "launchQuantize", "immediate" } });
        h.cmd ("transportPlay");
        h.cmd ("launchClip", { { "clipId", clipId } });

        // 44.1k, 512-sample blocks: one beat at 120bpm is 22050 samples, so 43 blocks is one
        // loop of four sixteenths.
        synthA->received.clear();
        juce::AudioBuffer<float> buffer (2, 512);
        juce::MidiBuffer midi;
        for (int b = 0; b < 43; ++b)
        {
            buffer.clear();
            h.service->getGraph().processBlock (buffer, midi);
        }

        int notesPlayed = 0;
        bool sawFirst = false, sawLast = false;
        for (const auto& message : synthA->received)
            if (message.isNoteOn())
            {
                ++notesPlayed;
                sawFirst = sawFirst || message.getNoteNumber() == 60;
                sawLast = sawLast || message.getNoteNumber() == 63;
            }
        check (notesPlayed == 4 && sawFirst && sawLast,
               "the sequence reaches the part's instrument through the graph");

        const auto clipRow = h.emits.lastState()->getProperty ("performance", {})
                                 .getProperty ("clips", {})[0];
        juce::ignoreUnused (clipRow);
        check (h.service->getEngine().isClipActive (0), "and the clip is running");

        // -- automation on a Stage 2 address ------------------------------------------------
        h.cmd ("addLane", { { "patternId", patternId }, { "type", "parameter" } });
        const auto lanes = h.emits.lastState()->getProperty ("performance", {})
                               .getProperty ("patterns", {})[0].getProperty ("lanes", {});
        const auto autoLaneId = lanes[1].getProperty ("laneId", {}).toString();
        h.cmd ("setLaneOptions", { { "patternId", patternId }, { "laneId", autoLaneId },
                                   { "targetId", partA }, { "parameterId", "cutoff" },
                                   { "stepCount", 2 }, { "stepsPerBeat", 4 } });
        h.cmd ("setStep", { { "patternId", patternId }, { "laneId", autoLaneId },
                            { "index", 0 }, { "active", true }, { "value", 0.9 } });

        synthA->cutoff->setValueNotifyingHost (0.1f);
        for (int b = 0; b < 43; ++b)
        {
            buffer.clear();
            h.service->getGraph().processBlock (buffer, midi);
        }
        h.service->drainParameterEvents();
        check (std::abs (synthA->cutoff->get() - 0.9f) < 0.01f,
               "an automation lane writes through the Stage 2 parameter path");

        // The honesty rule: a part that loads a different class unresolves the lane.
        h.cmd ("loadInstrument", { { "partId", partA }, { "ceId", "VST3-other-synth" } });
        const auto afterSwap = h.emits.lastState()->getProperty ("performance", {})
                                   .getProperty ("patterns", {})[0].getProperty ("lanes", {})[1];
        check (! (bool) afterSwap.getProperty ("resolved", true),
               "and shows unresolved when the target no longer carries that plug-in");
        h.cmd ("loadInstrument", { { "partId", partA }, { "ceId", "VST3-good-synth" } });
        check ((bool) h.emits.lastState()->getProperty ("performance", {})
                   .getProperty ("patterns", {})[0].getProperty ("lanes", {})[1]
                   .getProperty ("resolved", false),
               "and resolves again when the original class comes back");

        // -- the arpeggiator and the MIDI FX chain ------------------------------------------
        auto* synth = dynamic_cast<StubSynthProcessor*> (h.service->getRackHost().getInstrument (partA));
        h.cmd ("setPartMidiFx", { { "partId", partA }, { "transpose", 12 } });
        synth->received.clear();
        juce::MidiBuffer played;
        played.addEvent (juce::MidiMessage::noteOn (1, 40, (juce::uint8) 100), 0);
        buffer.clear();
        h.service->getGraph().processBlock (buffer, played);
        bool sawTransposed = false;
        for (const auto& message : synth->received)
            sawTransposed = sawTransposed || (message.isNoteOn() && message.getNoteNumber() == 52);
        check (sawTransposed, "the MIDI FX chain transposes what the part plays");
        h.cmd ("setPartMidiFx", { { "partId", partA }, { "transpose", 0 } });

        juce::MidiBuffer lift;
        lift.addEvent (juce::MidiMessage::noteOff (1, 40), 0);
        buffer.clear();
        h.service->getGraph().processBlock (buffer, lift);

        h.cmd ("setPartArp", { { "partId", partA }, { "enabled", true },
                               { "mode", "up" }, { "stepsPerBeat", 4 }, { "latch", true } });
        h.cmd ("stopAllClips");
        for (int b = 0; b < 4; ++b) { buffer.clear(); h.service->getGraph().processBlock (buffer, midi); }

        synth->received.clear();
        juce::MidiBuffer chord;
        chord.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
        chord.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 1);
        buffer.clear();
        h.service->getGraph().processBlock (buffer, chord);
        for (int b = 0; b < 43; ++b) { buffer.clear(); h.service->getGraph().processBlock (buffer, midi); }

        int arpNotes = 0;
        for (const auto& message : synth->received)
            arpNotes += message.isNoteOn() ? 1 : 0;
        check (arpNotes >= 3, "and the arpeggiator replays a held chord on the shared grid");
        h.cmd ("setPartArp", { { "partId", partA }, { "enabled", false }, { "latch", false } });

        // -- capture: played notes become steps ----------------------------------------------
        h.cmd ("addPattern", { { "name", "Captured" } });
        const auto capturePatternId = h.emits.lastState()->getProperty ("performance", {})
                                          .getProperty ("patterns", {})[1]
                                          .getProperty ("patternId", {}).toString();
        const auto captureLaneId = h.emits.lastState()->getProperty ("performance", {})
                                       .getProperty ("patterns", {})[1].getProperty ("lanes", {})[0]
                                       .getProperty ("laneId", {}).toString();
        h.cmd ("addClip", { { "patternId", capturePatternId } });
        const auto captureClipId = h.emits.lastState()->getProperty ("performance", {})
                                       .getProperty ("clips", {})[1].getProperty ("clipId", {}).toString();
        h.cmd ("setClipOptions", { { "clipId", captureClipId }, { "launchQuantize", "immediate" } });
        h.cmd ("launchClip", { { "clipId", captureClipId } });
        h.cmd ("armCapture", { { "clipId", captureClipId }, { "laneId", captureLaneId } });
        for (int b = 0; b < 2; ++b) { buffer.clear(); h.service->getGraph().processBlock (buffer, midi); }

        juce::MidiBuffer performed;
        performed.addEvent (juce::MidiMessage::noteOn (1, 67, (juce::uint8) 111), 0);
        buffer.clear();
        h.service->getGraph().processBlock (buffer, performed);
        h.service->drainParameterEvents();

        const auto capturedLane = h.emits.lastState()->getProperty ("performance", {})
                                      .getProperty ("patterns", {})[1].getProperty ("lanes", {})[0];
        bool captured = false;
        const auto capturedSteps = capturedLane.getProperty ("steps", {});
        for (int i = 0; i < capturedSteps.size(); ++i)
            captured = captured || ((bool) capturedSteps[i].getProperty ("active", false)
                                     && (int) capturedSteps[i].getProperty ("note", 0) == 67
                                     && (int) capturedSteps[i].getProperty ("velocity", 0) == 111);
        check (captured, "an armed lane turns a played note into a step");
        h.cmd ("disarmCapture");
        h.cmd ("stopAllClips");

        // -- scenes recall through the rack, not a snapshot engine ---------------------------
        h.cmd ("addPart");
        partB = h.partIdAt (1);
        h.cmd ("loadInstrument", { { "partId", partB }, { "ceId", "VST3-good-synth" } });
        h.cmd ("addMacro", { { "name", "Sweep" } });
        const auto macroId = h.emits.lastState()->getProperty ("rack", {}).getProperty ("macros", {})[0]
                                 .getProperty ("macroId", {}).toString();
        h.cmd ("addMacroTarget", { { "macroId", macroId }, { "targetId", partB },
                                   { "parameterId", "cutoff" } });
        h.cmd ("setMacroValue", { { "macroId", macroId }, { "value", 0.8 }, { "final", true } });
        h.cmd ("setPartMixer", { { "partId", partB }, { "mute", true } });

        h.cmd ("addScene", { { "name", "Verse" } });
        const auto scenes = h.emits.lastState()->getProperty ("performance", {})
                                .getProperty ("scenes", {});
        check (scenes.size() == 1 && (int) scenes[0].getProperty ("numSlots", 0) == 2,
               "a new scene captures the rig as it stands");
        sceneId = scenes[0].getProperty ("sceneId", {}).toString();

        // Change the rig, then recall the scene and watch it come back. The launch is
        // quantized like a clip's, so the scene lands when the boundary arrives — the engine
        // decides WHEN and the message thread applies the rest at that instant.
        h.cmd ("setPartMixer", { { "partId", partB }, { "mute", false } });
        h.cmd ("setMacroValue", { { "macroId", macroId }, { "value", 0.1 }, { "final", true } });
        h.cmd ("setSceneOptions", { { "sceneId", sceneId }, { "launchQuantize", "immediate" } });
        h.cmd ("launchScene", { { "sceneId", sceneId } });

        check (! (bool) h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[1]
                   .getProperty ("mute", false),
               "the rig does not change the instant the button is pressed — the launch is musical");

        for (int b = 0; b < 4; ++b) { buffer.clear(); h.service->getGraph().processBlock (buffer, midi); }
        h.service->drainParameterEvents();

        const auto recalled = h.emits.lastState();
        check ((bool) recalled->getProperty ("rack", {}).getProperty ("parts", {})[1]
                   .getProperty ("mute", false),
               "recalling the scene restores the mixer state through the rack");
        check (std::abs ((float) (double) recalled->getProperty ("rack", {})
                             .getProperty ("macros", {})[0].getProperty ("value", 0.0) - 0.8f) < 0.01f,
               "and the macro value through the Stage 5 macro path");

        // -- the setlist ---------------------------------------------------------------------
        h.cmd ("addSetlistItem", { { "sceneId", sceneId }, { "name", "Opener" } });
        h.cmd ("addSetlistItem", { { "sceneId", "gone-scene" }, { "name", "Broken" } });
        h.cmd ("setlistGo", { { "index", 0 } });
        check ((int) h.emits.lastState()->getProperty ("performance", {})
                   .getProperty ("setlist", {}).getProperty ("currentIndex", -1) == 0,
               "the setlist recalls its first item");

        h.emits.clear();
        h.cmd ("setlistNext");
        check (h.emits.lastError().contains ("cannot be recalled"),
               "an item whose scene is gone refuses out loud");
        check ((int) h.emits.lastState()->getProperty ("performance", {})
                   .getProperty ("setlist", {}).getProperty ("currentIndex", -1) == 0,
               "and leaves the rig on the last item that worked");
    }

    // -- everything survives the process --------------------------------------------------
    Harness h2 (dir);
    h2.cmd ("getState");
    const auto* restored = h2.emits.lastState();
    const auto performance = restored->getProperty ("performance", {});

    check (performance.getProperty ("patterns", {}).size() == 2
             && performance.getProperty ("clips", {}).size() == 2
             && performance.getProperty ("scenes", {}).size() == 1
             && performance.getProperty ("setlist", {}).getProperty ("items", {}).size() == 2,
           "patterns, clips, scenes and the setlist all come back");

    const auto restoredLane = performance.getProperty ("patterns", {})[0]
                                  .getProperty ("lanes", {})[0];
    const auto restoredSteps = restoredLane.getProperty ("steps", {});
    check (restoredSteps.size() == 4 && (bool) restoredSteps[0].getProperty ("active", false)
             && (int) restoredSteps[3].getProperty ("note", 0) == 63,
           "with every step exactly as it was written");

    check (std::abs ((double) performance.getProperty ("transport", {}).getProperty ("tempo", 0.0)
                       - 120.0) < 1.0e-9,
           "and the transport defaults travel with the Performance");

    // The restored song is compiled and ready: launching plays without another edit.
    const auto restoredClipId = performance.getProperty ("clips", {})[0]
                                    .getProperty ("clipId", {}).toString();
    h2.cmd ("setClipOptions", { { "clipId", restoredClipId }, { "launchQuantize", "immediate" } });
    h2.cmd ("transportPlay");
    h2.cmd ("launchClip", { { "clipId", restoredClipId } });

    auto* restoredSynth = dynamic_cast<StubSynthProcessor*> (
        h2.service->getRackHost().getInstrument (h2.firstPartId()));
    check (restoredSynth != nullptr, "the rack's instrument came back too");

    if (restoredSynth != nullptr)
    {
        restoredSynth->received.clear();
        juce::AudioBuffer<float> buffer (2, 512);
        juce::MidiBuffer midi;
        for (int b = 0; b < 43; ++b)
        {
            buffer.clear();
            h2.service->getGraph().processBlock (buffer, midi);
        }

        int notes = 0;
        for (const auto& message : restoredSynth->received)
            notes += message.isNoteOn() ? 1 : 0;
        check (notes == 4, "and the restored pattern plays without another edit");
    }
}

// The Stage 4 library: one index, explicit provenance, loading only ever through Stage 1's
// transaction. The identity story is the heart of it — user metadata survives rescans and
// renames, a missing source marks instead of deletes, and availability is computed live
// with a reason a person can act on.
void testLibrary()
{
    std::cout << "\nthe unified library" << std::endl;

    // The .vstpreset header parse, pure.
    {
        std::vector<std::uint8_t> good (64, 0);
        std::memcpy (good.data(), "VST3", 4);
        const char* cid = "abcdef0123456789ABCDEF0123456789";
        std::memcpy (good.data() + 8, cid, 32);
        const auto header = ceditor::host::parseVstPresetHeader (good.data(), good.size());
        check (header.valid && header.classIdHex == "ABCDEF0123456789ABCDEF0123456789",
               "a preset header parses and the class id normalizes to uppercase");

        std::vector<std::uint8_t> bad = good;
        bad[0] = 'X';
        check (! ceditor::host::parseVstPresetHeader (bad.data(), bad.size()).valid,
               "a wrong magic refuses");
        check (! ceditor::host::parseVstPresetHeader (good.data(), 20).valid,
               "a truncated header refuses");
    }

    const auto dir = freshDataDir ("library");
    seedTwoSynthCatalog (dir);

    // A vendor preset tree in Steinberg's layout, with the plug-in folder named after the
    // catalogue class so the target resolves — and one folder nothing installed matches.
    const auto presetRoot = freshDataDir ("library-presets");
    const auto writePreset = [] (const juce::File& file)
    {
        std::vector<std::uint8_t> bytes (64, 0);
        std::memcpy (bytes.data(), "VST3", 4);
        std::memcpy (bytes.data() + 8, "ABCDEF0123456789ABCDEF0123456789", 32);
        file.getParentDirectory().createDirectory();
        file.replaceWithData (bytes.data(), bytes.size());
    };
    const auto goodPreset = presetRoot.getChildFile ("Test Audio").getChildFile ("Good Synth")
                                      .getChildFile ("Warm Pad.vstpreset");
    const auto orphanPreset = presetRoot.getChildFile ("Someone").getChildFile ("Uninstalled Synth")
                                        .getChildFile ("Lost.vstpreset");
    writePreset (goodPreset);
    writePreset (orphanPreset);

    juce::String userPresetId, rackId, vendorId, orphanId, partId;

    {
        std::vector<std::pair<juce::AudioProcessor*, juce::String>> applied;
        Harness h (dir, {}, [&] (InstrumentHostService::Options& o)
        {
            o.applyVstPreset = [&applied] (juce::AudioProcessor& p, const juce::File& f)
            {
                applied.push_back ({ &p, f.getFullPathName() });
                return true;
            };
        });
        h.cmd ("getState");
        h.cmd ("addPart");
        partId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });

        // Capture a user preset with real state in it.
        h.lastStub->patch = 5;
        h.emits.clear();
        h.cmd ("saveUserPreset", { { "partId", partId }, { "name", "My Warm Patch" } });
        const auto& lib = h.emits.entries.back();
        check (lib.name == "instrumentHostLibrary"
                 && lib.payload.getProperty ("records", {}).size() == 1,
               "saving a user preset answers with the library");
        const auto saved = lib.payload.getProperty ("records", {})[0];
        userPresetId = saved.getProperty ("recordId", {}).toString();
        check (saved.getProperty ("sourceType", {}).toString() == "userState"
                 && ! (bool) saved.getProperty ("factory", true)
                 && (bool) saved.getProperty ("available", false),
               "with captured provenance and live availability");

        // Same-class in-place load: state applies, nothing re-instantiates.
        h.lastStub->patch = 9;
        const auto instantiationsBefore = h.instantiateCount;
        h.cmd ("loadLibraryRecord", { { "recordId", userPresetId }, { "action", "focused" } });
        check (h.lastStub->patch == 5, "loading onto the same class applies state in place");
        check (h.instantiateCount == instantiationsBefore, "without re-instantiating anything");

        // Add-as-new-part: the transaction builds a second part with the preset's state.
        h.cmd ("loadLibraryRecord", { { "recordId", userPresetId }, { "action", "add" } });
        check (h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {}).size() == 2,
               "action add creates a new part");
        check (h.lastStub->patch == 5, "and the new instrument carries the captured state");

        // The vendor scan: the matched preset resolves, the orphan stays honest.
        h.cmd ("addLibraryPath", { { "path", presetRoot.getFullPathName() } });
        h.emits.clear();
        h.cmd ("scanLibrary");
        const auto records = h.emits.entries.back().payload.getProperty ("records", {});
        check (records.size() == 3, "the scan indexes both vendor presets beside the capture");
        for (const auto& r : *records.getArray())
        {
            if (r.getProperty ("name", {}).toString() == "Warm Pad")
            {
                vendorId = r.getProperty ("recordId", {}).toString();
                check ((bool) r.getProperty ("available", false)
                         && r.getProperty ("instrument", {}).toString() == "Good Synth",
                       "a preset under an installed plug-in's folder resolves its target");
            }
            if (r.getProperty ("name", {}).toString() == "Lost")
            {
                orphanId = r.getProperty ("recordId", {}).toString();
                check (! (bool) r.getProperty ("available", true)
                         && r.getProperty ("reason", {}).toString().isNotEmpty(),
                       "a preset for nothing installed says so, actionably");
            }
        }

        // Vendor preset load: through the transaction, applied after commit.
        h.cmd ("loadLibraryRecord", { { "recordId", vendorId }, { "action", "add" } });
        check (applied.size() == 1 && applied[0].second == goodPreset.getFullPathName()
                 && applied[0].first == h.lastStub,
               "a vendor preset applies to the freshly committed instrument");
        h.emits.clear();
        h.cmd ("loadLibraryRecord", { { "recordId", orphanId }, { "action", "add" } });
        check (h.emits.lastError().isNotEmpty(), "an unavailable preset refuses aloud");

        // Favourites survive a rescan and a rename; a deleted source marks, never deletes.
        h.cmd ("setLibraryUserMetadata", { { "recordId", vendorId }, { "favourite", true } });
        goodPreset.moveFileTo (goodPreset.getSiblingFile ("Warm Pad (renamed).vstpreset"));
        h.cmd ("scanLibrary");
        h.emits.clear();
        h.cmd ("getLibrary");
        int vendorRows = 0;
        bool favouriteKept = false, orphanStillThere = false;
        for (const auto& r : *h.emits.entries.back().payload.getProperty ("records", {}).getArray())
        {
            if (r.getProperty ("recordId", {}).toString() == vendorId)
            {
                ++vendorRows;
                favouriteKept = (bool) r.getProperty ("favourite", false)
                                  && r.getProperty ("name", {}).toString() == "Warm Pad (renamed)";
            }
            if (r.getProperty ("recordId", {}).toString() == orphanId)
                orphanStillThere = true;
        }
        check (vendorRows == 1 && favouriteKept,
               "a renamed source keeps its record and favourite through the fingerprint");
        check (orphanStillThere, "and other records are untouched");

        orphanPreset.deleteFile();
        h.cmd ("scanLibrary");
        h.emits.clear();
        h.cmd ("getLibrary");
        bool orphanMarkedMissing = false;
        for (const auto& r : *h.emits.entries.back().payload.getProperty ("records", {}).getArray())
            if (r.getProperty ("recordId", {}).toString() == orphanId)
                orphanMarkedMissing = (bool) r.getProperty ("missing", false);
        check (orphanMarkedMissing, "a vanished source is marked missing, never deleted");

        h.emits.clear();
        h.cmd ("removeLibraryRecord", { { "recordId", vendorId } });
        check (h.emits.lastError().contains ("rescan"),
               "removing a vendor record explains why not instead of lying");

        // The complete rack as a library entry.
        h.emits.clear();
        h.cmd ("saveRackToLibrary", { { "name", "My Rig" } });
        for (const auto& r : *h.emits.entries.back().payload.getProperty ("records", {}).getArray())
            if (r.getProperty ("type", {}).toString() == "rack")
                rackId = r.getProperty ("recordId", {}).toString();
        check (rackId.isNotEmpty(), "the whole rack captures as one record");
    }

    {
        // Restart: everything persisted; the rack record restores the rig.
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("removePart", { { "partId", partId } });   // wreck the session a little
        h.emits.clear();
        h.cmd ("getLibrary");
        check (h.emits.entries.back().payload.getProperty ("counts", {})
                   .getProperty ("total", 0).equals (4),
               "the library survives its process");

        h.cmd ("loadLibraryRecord", { { "recordId", rackId } });
        const auto parts = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {});
        check (parts.size() == 3 && h.lastStub != nullptr,
               "a rack record restores its parts through the session path");
        auto* firstPart = dynamic_cast<StubSynthProcessor*> (
            h.service->getRackHost().getInstrument (partId));
        check (firstPart != nullptr && firstPart->patch == 5, "instrument state included");

        h.emits.clear();
        h.cmd ("removeLibraryRecord", { { "recordId", rackId } });
        check (h.emits.entries.back().payload.getProperty ("counts", {})
                   .getProperty ("total", 0).equals (3),
               "a captured record removes cleanly");

        // Search narrows by text, filter narrows by type.
        h.emits.clear();
        h.cmd ("getLibrary", { { "query", "warm" } });
        check (h.emits.entries.back().payload.getProperty ("records", {}).size() == 2,
               "search matches names case-insensitively");
        h.emits.clear();
        h.cmd ("getLibrary", { { "type", "rack" } });
        check (h.emits.entries.back().payload.getProperty ("records", {}).size() == 0,
               "and the type filter holds after the rack record's removal");
    }
}

// Stage 3's host-side half: the automatic first-pass pages and the surface runtime API.
// The generator's rules run pure over a crafted inventory; the service level proves that
// regeneration replaces only its own pages, and that a hardware-style relative nudge moves
// through the same binding mapping and refusals as every other write path.
void testAutoPagesAndSurfaceRuntime()
{
    std::cout << "\nauto pages and the surface runtime" << std::endl;

    // The generator, pure: groups chunk in first-appearance order; weak identities and
    // non-automatable/meta parameters stay off the pages.
    {
        ceditor::host::ParameterInventory inventory;
        const auto add = [&inventory] (const char* id, const char* name, const char* group,
                                       bool automatable = true, bool meta = false)
        {
            ceditor::host::ParameterDescriptor d;
            d.definitionId = id;
            d.index = inventory.descriptors.size();
            d.name = name;
            d.group = group;
            d.automatable = automatable;
            d.metaParameter = meta;
            inventory.descriptors.add (d);
        };

        for (int i = 1; i <= 10; ++i)
            add (("f" + juce::String (i)).toRawUTF8(),
                 ("Filter " + juce::String (i)).toRawUTF8(), "Filter");
        add ("meter", "Out Meter", "Filter", false);          // meter-shaped: not automatable
        add ("macro1", "Macro 1", "Filter", true, true);      // the plug-in's own macro layer
        add ("#5", "Nameless", "Filter");                     // fallback identity
        add ("dup#7", "Dup", "Filter");                       // collision suffix
        add ("mix", "Mix", "");                               // ungrouped

        const auto pages = ceditor::host::generateControlPages ("part-1", "class-1", "Big Synth",
                                                                inventory);
        check (pages.size() == 3, "ten grouped + one ungrouped candidate make three pages");
        check (pages[0].name == "Filter 1" && pages[1].name == "Filter 2",
               "a chunked group numbers its pages");
        check (pages[2].name == "Big Synth", "ungrouped parameters page under the plug-in's name");
        check (pages[0].slots.size() == 8 && ! pages[0].slots[7].binding.isEmpty()
                 && pages[1].slots[1].binding.parameterId == "f10"
                 && pages[1].slots[2].binding.isEmpty(),
               "slots fill in registry order and stop where the group ends");
        check (pages[0].generated && pages[0].generatedForPartId == "part-1",
               "generated pages say so and name their part");

        bool excludedLeaked = false;
        for (const auto& page : pages)
            for (const auto& slot : page.slots)
                if (slot.binding.parameterId == "meter" || slot.binding.parameterId == "macro1"
                    || slot.binding.parameterId.containsChar ('#'))
                    excludedLeaked = true;
        check (! excludedLeaked, "meters, metas and weak identities stay off the pages");
    }

    const auto dir = freshDataDir ("surface");
    seedTwoSynthCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    const auto partId = h.firstPartId();
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
    auto* stub = h.lastStub;

    h.cmd ("addControlPage", { { "name", "My Page" } });
    h.cmd ("generateControlPages", { { "partId", partId } });
    h.cmd ("generateControlPages", { { "partId", partId } });   // regenerate: replaces, never stacks
    const auto pages = h.emits.lastState()->getProperty ("rack", {}).getProperty ("pages", {});
    check (pages.size() == 2, "regeneration replaces its own pages and keeps the user page");
    check (! (bool) pages[0].getProperty ("generated", true)
             && (bool) pages[1].getProperty ("generated", false),
           "and the state payload says which is which");
    check (pages[1].getProperty ("name", {}).toString() == "Good Synth",
           "the stub's ungrouped parameters page under the plug-in's name");
    const auto generatedPageId = pages[1].getProperty ("pageId", {}).toString();

    // The surface projection: names, the plug-in's own value text, and the slot position.
    auto slots = h.service->surfaceSlots (generatedPageId);
    check (slots.size() == 8 && slots[0].displayName == "Cutoff" && slots[0].resolved
             && slots[0].valueText.isNotEmpty()
             && juce::approximatelyEqual (slots[0].position, 0.5f),
           "surfaceSlots projects display name, formatted value and position");
    check (! slots[3].assigned, "empty slots present as empty, not as zeros to draw");

    // The relative nudge: gesture-wrapped, clamped, jump-free by construction.
    check (h.service->nudgeControlSlot (generatedPageId, "s1", 64), "a nudge on a resolved slot lands");
    check (juce::approximatelyEqual (stub->cutoff->get(), 1.0f), "and clamps at the top");
    h.service->nudgeControlSlot (generatedPageId, "s1", -127);
    check (juce::approximatelyEqual (stub->cutoff->get(), 0.0f), "a full turn down reaches the floor");
    h.emits.clear();
    h.service->drainParameterEvents();
    bool sawGesturePair = false;
    for (const auto& e : h.emits.entries)
        if (e.name == "instrumentHostParamValues")
            sawGesturePair = e.payload.getProperty ("gestures", {}).size() >= 2;
    check (sawGesturePair, "nudges ride inside begin/end gestures for later automation");

    // Range + inversion run through the same transform as the UI slider.
    h.cmd ("setControlSlotOptions", { { "pageId", generatedPageId }, { "slotId", "s1" },
                                      { "rangeMin", 0.5 }, { "rangeMax", 1.0 }, { "inverted", true } });
    stub->cutoff->setValueNotifyingHost (1.0f);
    slots = h.service->surfaceSlots (generatedPageId);
    check (juce::approximatelyEqual (slots[0].position, 0.0f),
           "an inverted slot shows the mapped position, not the raw value");
    h.service->nudgeControlSlot (generatedPageId, "s1", 127);
    check (juce::approximatelyEqual (stub->cutoff->get(), 0.5f),
           "and a nudge up moves the parameter down through the inversion");

    // Unresolved refuses on the surface exactly like everywhere else.
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-other-synth" } });
    auto* other = h.lastStub;
    const auto before = other->cutoff->get();
    slots = h.service->surfaceSlots (generatedPageId);
    check (slots[0].assigned && ! slots[0].resolved, "the projection shows unresolved honestly");
    check (! h.service->nudgeControlSlot (generatedPageId, "s1", 64)
             && juce::approximatelyEqual (other->cutoff->get(), before),
           "and a nudge through an unresolved slot moves nothing");

    h.emits.clear();
    h.cmd ("generateControlPages", { { "partId", "no-such-part" } });
    check (h.emits.lastError().contains ("no instrument"), "generating for an empty part refuses");
}

// The factory Performance: the authored rack ships beside the generated binaries, and a
// product boots as that rack — until something newer exists. The standalone's own session
// outranks it; the outer VST3's DAW chunk replaces it without ever booting it first.
void testFactoryPerformance()
{
    std::cout << "\nfactory performance" << std::endl;

    // Author a one-part rack and keep its session file as the shipped factory rack.
    const auto authoringDir = freshDataDir ("factory-author");
    seedCatalog (authoringDir);
    juce::String factoryPartId;
    {
        Harness h (authoringDir);
        h.cmd ("getState");
        h.cmd ("addPart");
        factoryPartId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", factoryPartId }, { "ceId", "VST3-good-synth" } });
        h.lastStub->patch = 9;
        h.cmd ("setPartMixer", { { "partId", factoryPartId }, { "volume", 0.5 } });
    }
    const auto factoryFile = freshDataDir ("factory-asset").getChildFile ("factory-performance.json");
    authoringDir.getChildFile ("session-performance.json").copyFileTo (factoryFile);

    const auto withFactory = [factoryFile] (InstrumentHostService::Options& o)
    {
        o.factoryPerformanceFile = factoryFile;
    };

    // A fresh standalone boots the factory rack, instruments and state included.
    const auto standaloneDir = freshDataDir ("factory-standalone");
    seedCatalog (standaloneDir);
    {
        Harness h (standaloneDir, {}, withFactory);
        h.cmd ("getState");
        check (h.firstPartId() == factoryPartId, "a fresh product boots the shipped rack");
        check (h.lastStub != nullptr && h.lastStub->patch == 9,
               "with the authored instrument state");

        h.cmd ("addPart");   // the user makes it their own; savePerformance writes their session
    }
    {
        Harness h (standaloneDir, {}, withFactory);
        h.cmd ("getState");
        check (h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {}).size() == 2,
               "the user's own session outranks the factory rack from then on");
    }

    // A fresh plug-in instance boots the factory rack too; a DAW chunk replaces it, and a
    // chunk arriving BEFORE any UI never boots the factory rack at all.
    const auto pluginDir = freshDataDir ("factory-plugin");
    seedCatalog (pluginDir);
    juce::var chunk;
    {
        Harness h (pluginDir, {}, [&] (InstrumentHostService::Options& o)
        {
            o.persistSession = false;
            withFactory (o);
        });
        h.cmd ("getState");
        check (h.firstPartId() == factoryPartId, "a fresh plug-in instance boots the shipped rack");

        h.cmd ("addPart");
        chunk = h.service->captureStateVar();
    }
    {
        Harness h (pluginDir, {}, [&] (InstrumentHostService::Options& o)
        {
            o.persistSession = false;
            withFactory (o);
        });
        h.service->restoreFromVar (chunk);   // the DAW speaks before any UI does
        check (h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {}).size() == 2,
               "a DAW chunk replaces the factory rack");
        check (h.instantiateCount == 1,
               "and the factory rack was never booted first just to be torn down");
    }
}

// The browse dialog behind "Add scan folder", and the module projection the browser column
// cannot explain scans without. A cancelled picker changes nothing; a module full of effects
// says so through numInstruments instead of silently showing nothing.
void testScanFolderBrowseAndModuleProjection()
{
    std::cout << "\nscan-folder browse and module projection" << std::endl;

    const auto dir = freshDataDir ("browse");
    seedCatalog (dir);

    {
        Harness h (dir);
        h.cmd ("getState");
        h.emits.clear();
        h.cmd ("browseScanPath");
        check (h.emits.lastError().contains ("not available"),
               "browsing without a picker hook refuses aloud");
    }

    {
        std::function<void (const juce::String&)> deliverChoice;
        Harness h (dir, {}, [&] (InstrumentHostService::Options& o)
        {
            o.pickDirectory = [&] (std::function<void (const juce::String&)> done)
            {
                deliverChoice = std::move (done);   // async, like the real FileChooser
            };
        });
        h.cmd ("getState");

        h.cmd ("browseScanPath");
        check (deliverChoice != nullptr, "the picker opens");
        deliverChoice ("");   // the user cancels
        check (h.emits.lastState()->getProperty ("scanPaths", {}).size() == 0,
               "a cancelled picker changes nothing");

        h.cmd ("browseScanPath");
        deliverChoice ("D:\\Chosen VST3s");
        const auto* state = h.emits.lastState();
        check (state->getProperty ("scanPaths", {})[0].toString() == "D:\\Chosen VST3s",
               "the chosen folder joins the scan paths");

        bool sawInstrumentCount = false;
        for (const auto& module : *state->getProperty ("modules", {}).getArray())
            if (module.getProperty ("path", {}).toString() == "C:\\VST3\\Good.vst3")
                sawInstrumentCount = (int) module.getProperty ("numInstruments", -1) == 1
                                     && (int) module.getProperty ("numClasses", -1) == 1;
        check (sawInstrumentCount,
               "each module reports how many of its classes the browser will actually show");
    }

    Harness h2 (dir);
    h2.cmd ("getState");
    check (h2.emits.lastState()->getProperty ("scanPaths", {})[0].toString() == "D:\\Chosen VST3s",
           "and the browsed folder persists like a typed one");
}

// The Host Project manifest and the build command. The manifest is what the generated product
// IS — name, version, publisher, targets — and its appId is the installer's identity, minted
// once and never authored, so upgrades keep upgrading whatever the product gets renamed to.
void testHostProject()
{
    std::cout << "\nhost project manifest and build" << std::endl;

    const auto dir = freshDataDir ("project");
    juce::String mintedAppId;

    {
        Harness h (dir);
        h.emits.clear();
        h.cmd ("getHostProject");

        const auto& entry = h.emits.entries.back();
        check (entry.name == "instrumentHostProject", "getHostProject answers with the project");
        check (entry.payload.getProperty ("productName", {}).toString() == "My Instrument Rack"
                 && entry.payload.getProperty ("version", {}).toString() == "1.0.0"
                 && (bool) entry.payload.getProperty ("includeStandalone", false)
                 && (bool) entry.payload.getProperty ("includeVst3", false),
               "a fresh project carries the defaults");
        mintedAppId = entry.payload.getProperty ("appId", {}).toString();
        check (mintedAppId.length() == 36, "and a minted appId");
        check (dir.getChildFile ("host-project.json").existsAsFile(), "persisted on first ask");

        h.cmd ("setHostProject", { { "productName", "  Super Rack  " }, { "version", "2.1.0" },
                                   { "appId", "attacker-chosen" }, { "includeVst3", false } });
        const auto& updated = h.emits.entries.back().payload;
        check (updated.getProperty ("productName", {}).toString() == "Super Rack",
               "setHostProject merges and trims the authored fields");
        check (! (bool) updated.getProperty ("includeVst3", true), "including the target flags");
        check (updated.getProperty ("appId", {}).toString() == mintedAppId,
               "but the appId is not writable from the page");
    }

    {
        Harness h (dir);
        h.cmd ("getHostProject");
        check (h.emits.entries.back().payload.getProperty ("appId", {}).toString() == mintedAppId,
               "the appId survives the process, like any identity");

        h.emits.clear();
        h.cmd ("buildHostProduct");
        check (h.emits.lastError().contains ("not available"),
               "building without a runBuild hook refuses aloud");
    }

    {
        juce::var builtProject;
        juce::String builtOutputDir;
        Harness h (dir, {}, [&] (InstrumentHostService::Options& o)
        {
            o.runBuild = [&] (const juce::var& project, const juce::String& outputDirectory)
            {
                builtProject = project;
                builtOutputDir = outputDirectory;
            };
        });

        h.cmd ("buildHostProduct", { { "outputDirectory", "D:\\out" } });
        check (builtProject.getProperty ("productName", {}).toString() == "Super Rack"
                 && builtOutputDir == "D:\\out",
               "buildHostProduct hands the hook the manifest and the destination");

        h.cmd ("setHostProject", { { "includeStandalone", false } });   // includeVst3 already off
        h.emits.clear();
        builtProject = juce::var();
        h.cmd ("buildHostProduct");
        check (h.emits.lastError().contains ("no targets"),
               "a project with every target off refuses to build");
        check (builtProject.isVoid(), "and the hook never runs");
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
    testParameterModel();
    testControlPages();
    testAutoPagesAndSurfaceRuntime();
    testEffectsAndMacros();
    testEnrichedPerformanceRestore();
    testPerformanceSystem();
    testSendsAndReturns();
    testMultiOutputRouting();
    testHardwareParts();
    testVirtualAddressesAndMacroSlots();
    testRevisionsAndEngine();
    testLibrary();
    testFactoryPerformance();
    testScanFolderBrowseAndModuleProjection();
    testHostProject();

    juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("ceditor-host-service-tests").deleteRecursively();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
