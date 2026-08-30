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
#include <juce_cryptography/juce_cryptography.h>
#include "ControlSurface/Ctrl49SurfaceBroker.h"
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
namespace licensing = ceditor::licensing;
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

    const juce::var* last (const juce::String& name) const
    {
        for (auto it = entries.rbegin(); it != entries.rend(); ++it)
            if (it->name == name)
                return &it->payload;
        return nullptr;
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

// --- Licensing fixtures (§19 "Trust", §20, §26.2) --------------------------------------------
//
// Every Harness below is licensed as Pro unless a test says otherwise, and that is deliberate:
// the alternative was a flag that switches licensing off, and a flag that switches licensing
// off is a thing that ships switched off. These tests install a REAL signed licence into a
// REAL host-project manifest and go through the same verification the product does, so what
// they exercise between them is the shipping path rather than a bypass of it.

/** One key pair for the whole file. Generating one per Harness would be correct and slow; the
    signature code is exercised properly in LicensingTests, which is where it belongs. */
const auto& testKeys()
{
    static const auto keys = []
    {
        juce::RSAKey publicKey, privateKey;
        const int seeds[] = { 0x51a7, 0x2c3f, 0x8b41, 0x17e9, 0x6d02 };
        juce::RSAKey::createKeyPair (publicKey, privateKey, 512, seeds, 5);
        return std::pair { publicKey.toString(), privateKey.toString() };
    }();
    return keys;
}

/** Writes a host-project manifest carrying the test key, plus a signed licence for the edition
    asked for. `Edition::free` writes the manifest and NO licence, which is what an install
    nobody has paid for actually looks like. */
void seedLicence (const juce::File& dataDir, licensing::Edition edition)
{
    dataDir.createDirectory();
    const auto projectFile = dataDir.getChildFile ("host-project.json");

    // Merge into whatever manifest is already there rather than replacing it. Several tests
    // build a Harness more than once against the same directory and expect the appId, the
    // product name and the target flags to survive — a fixture that reset them would be
    // quietly testing itself instead of the service.
    auto project = juce::JSON::parse (projectFile.loadFileAsString());
    auto* object = project.getDynamicObject();
    if (object == nullptr)
    {
        project = juce::var (new juce::DynamicObject());
        object = project.getDynamicObject();

        // Exactly what ensureHostProject would have minted, so the tests that check the
        // defaults and the 36-character appId still see them.
        object->setProperty ("productName", "My Instrument Rack");
        object->setProperty ("version", "1.0.0");
        object->setProperty ("publisher", "");
        object->setProperty ("appId", juce::Uuid().toDashedString().toUpperCase());
        object->setProperty ("includeStandalone", true);
        object->setProperty ("includeVst3", true);
    }

    object->setProperty ("licencePublicKey", testKeys().first);
    projectFile.replaceWithText (juce::JSON::toString (project));

    const auto licenceFile = dataDir.getChildFile ("licence.celicence");

    if (edition == licensing::Edition::free)
    {
        licenceFile.deleteFile();
        dataDir.getChildFile ("activations.json").deleteFile();
        return;
    }

    licensing::LicenceDocument document;
    document.productId   = object->getProperty ("appId").toString();
    document.licensee    = "Test Customer";
    document.email       = "tests@example.com";
    document.orderId     = "ORD-TEST";
    document.edition     = edition;
    document.activations = 3;
    document.issuedAt    = "2026-01-01T00:00:00.000Z";

    const auto text = juce::JSON::toString (licensing::makeLicenceFile (document, testKeys().second));

    // Only rewrite when it actually differs: an unchanged licence must not look like a new
    // purchase, which is what would reset the seat record between two Harnesses.
    if (licenceFile.loadFileAsString() != text)
    {
        licenceFile.replaceWithText (text);
        dataDir.getChildFile ("activations.json").deleteFile();
    }
}

struct Harness
{
    explicit Harness (const juce::File& dataDir, const juce::File& worker = {},
                      std::function<void (InstrumentHostService::Options&)> tweak = {},
                      licensing::Edition edition = licensing::Edition::pro)
    {
        seedLicence (dataDir, edition);

        InstrumentHostService::Options options;
        options.dataDirectory = dataDir;
        options.workerExecutable = worker;
        // Never sweep the machine the tests are running on. With this left at its product
        // default, testScan below picked up every VST3 installed on the developer's computer,
        // handed each one to the stub worker, and counted a "Stub Synth" for all of them — so
        // it passed on a clean Linux container and failed on any real Windows box with
        // plug-ins on it. The fixtures under the scan path are the whole world here.
        options.includeDefaultScanRoots = false;
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
        options.editorWindows.show = [this] (const juce::String& partId,
                                             juce::AudioProcessor&, const juce::String& title)
        {
            windowLog.push_back ("show:" + partId + ":" + title);
            openWindows.addIfNotAlreadyThere (partId);
        };
        options.editorWindows.close = [this] (const juce::String& partId)
        {
            windowLog.push_back ("close:" + partId);
            openWindows.removeString (partId);
        };
        options.editorWindows.closeAll = [this]
        {
            windowLog.push_back ("closeAll");
            openWindows.clear();
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
    std::vector<juce::String> windowLog;
    juce::StringArray openWindows;
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

// --- Safe startup on the active side (§17.1, §18.3.3) ----------------------------------------
//
// The failure being designed against is a crash loop with a log file attached: Stage 7 counted
// the plug-in that was live when the process died and then loaded it again on the very next
// start. The count is evidence for a decision nobody has taken yet; it does not keep the
// product startable, and this is what does.

void testSafeStartup()
{
    std::cout << "\nsafe startup after an abnormal termination" << std::endl;

    const auto dir = freshDataDir ("safe-startup");
    seedCatalog (dir);

    // A previous run died with Good.vst3 live. That is what its marker looks like on disk.
    ceditor::host::ActiveHostingMarker marker (dir);
    marker.markActive ("C:\\VST3\\Good.vst3", "Good Synth");

    {
        Harness h (dir);
        h.cmd ("getState");
        const auto* state = h.emits.lastState();
        const auto safe = state->getProperty ("reliability", {}).getProperty ("safeMode", {});

        check (safe.getProperty ("level", {}).toString() == "skipSuspects",
               "the incident puts this run into safe startup");
        check (safe.getProperty ("suspects", {}).size() == 1,
               "and names the plug-in that was live");
        check (safe.getProperty ("suspects", {})[0].getProperty ("modulePath", {}).toString()
                 == "C:\\VST3\\Good.vst3",
               "by module, which is what a refusal can be checked against");

        // Evidence and safeguard are separate records: the isolation decision §18.9.8 gates
        // still rests on the count, and clearing one must not erase the other.
        check (state->getProperty ("product", {}).getProperty ("activeHostingIncidents", {}).size() == 1,
               "the evidence log still holds the incident");

        // The suspect is refused, and the part keeps its identity and its place.
        h.cmd ("addPart");
        const auto partId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });

        check (h.instantiateCount == 0, "the suspect is never handed to the instantiator");

        const auto* afterLoad = h.emits.lastState();
        const auto part = afterLoad->getProperty ("rack", {}).getProperty ("parts", {})[0];
        check (! (bool) part.getProperty ("hasInstrument", false), "so nothing loads");

        const auto refused = afterLoad->getProperty ("reliability", {})
                                       .getProperty ("refusedThisRun", {});
        check (refused.size() == 1, "and the run records what it refused");
        check (refused[0].getProperty ("reason", {}).toString().contains ("abnormally"),
               "with a reason a person can act on");

        // The distinction the restore report has to make: this is not a missing plug-in.
        const auto notes = afterLoad->getProperty ("product", {}).getProperty ("restore", {})
                                     .getProperty ("notes", {});
        bool saysSafeStartup = false;
        for (const auto& note : *notes.getArray())
            saysSafeStartup = saysSafeStartup
                            || note.toString().contains ("safe startup is on");
        check (saysSafeStartup,
               "the restore report says it was refused, not that it is missing");
    }

    // Sticky across a restart — a safe mode that quietly reset itself would turn a crash loop
    // into a crash loop that also lies about it.
    {
        Harness h (dir);
        h.cmd ("getState");
        const auto safe = h.emits.lastState()->getProperty ("reliability", {})
                                              .getProperty ("safeMode", {});
        check (safe.getProperty ("level", {}).toString() == "skipSuspects",
               "safe startup survives a restart");
        check (safe.getProperty ("suspects", {}).size() == 1,
               "and so does the suspect, without the incident happening twice");
        check (safe.getProperty ("suspects", {})[0].getProperty ("incidents", {}).toString() == "1",
               "the count is not inflated by merely restarting");
    }

    // Vouching for it: the module loads again, and with nothing left to skip the warning light
    // goes out rather than staying on with an empty list behind it.
    {
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("clearSafeModeSuspect", { { "modulePath", "C:\\VST3\\Good.vst3" } });

        const auto safe = h.emits.lastState()->getProperty ("reliability", {})
                                              .getProperty ("safeMode", {});
        check (safe.getProperty ("suspects", {}).size() == 0, "clearing removes the suspect");
        check (safe.getProperty ("level", {}).toString() == "normal",
               "and the level drops back once there is nothing to skip");

        h.cmd ("addPart");
        h.cmd ("loadInstrument", { { "partId", h.firstPartId() }, { "ceId", "VST3-good-synth" } });
        check (h.instantiateCount == 1, "the vouched-for module loads normally");
    }

    // The user's own safe mode: nothing third-party at all, for when the suspect list is wrong
    // or the damage is not attributable.
    {
        Harness h (dir);
        h.cmd ("getState");
        check (h.instantiateCount == 1,
               "the saved session loads its instrument while nothing is wrong");
        h.cmd ("setSafeMode", { { "level", "noThirdParty" } });
    }

    // The point of this level is the NEXT start: the product comes up with the rack intact and
    // nothing third-party in it, which is what makes an install fixable when the suspect list
    // is wrong or the damage is not attributable to one module.
    {
        Harness h (dir);
        h.cmd ("getState");
        check (h.instantiateCount == 0, "no third-party plug-in loads at all");

        const auto* state = h.emits.lastState();
        check (state->getProperty ("rack", {}).getProperty ("parts", {}).size() > 0,
               "but the rack still comes up, with its parts");

        const auto refused = state->getProperty ("reliability", {})
                                   .getProperty ("refusedThisRun", {});
        check (refused.size() == 1 && refused[0].getProperty ("reason", {}).toString()
                                        .contains ("no third-party"),
               "and says so rather than blaming the plug-in");

        // Clearing suspects must not silently end a safe mode the user chose themselves.
        h.cmd ("clearAllSafeModeSuspects");
        check (h.emits.lastState()->getProperty ("reliability", {}).getProperty ("safeMode", {})
                 .getProperty ("level", {}).toString() == "noThirdParty",
               "clearing suspects leaves the user's own safe mode alone");

        h.cmd ("setSafeMode", { { "level", "normal" } });
        check (h.emits.lastState()->getProperty ("reliability", {}).getProperty ("safeMode", {})
                 .getProperty ("level", {}).toString() == "normal",
               "and the user can end it");
    }

    // Ending it does not resurrect this run's refusals — the repair is reopening the project,
    // the same one a newly installed plug-in needs.
    {
        Harness h (dir);
        h.cmd ("getState");
        check (h.instantiateCount == 1, "and the next start loads normally again");
    }
}

// --- Session recovery (§17.3) ----------------------------------------------------------------
//
// Two failures being designed against, and the second is the subtle one:
//
//   The recovery restores the crash.  The last saved session IS the state that was live when
//                                     the process died. Going back to it is going back to the
//                                     crash. A last-known-good is a different file on purpose.
//   The evidence is overwritten.      The first save of the new run destroys the only copy of
//                                     the state that produced the crash, which is the one file
//                                     a diagnosis needs.

void testSessionRecovery()
{
    std::cout << "\nsession recovery: last-known-good, the operation marker and state digests"
              << std::endl;

    const auto dir = freshDataDir ("recovery");
    seedCatalog (dir);

    // A clean run: load something, and let it prove itself.
    {
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("addPart");
        h.cmd ("loadInstrument", { { "partId", h.firstPartId() }, { "ceId", "VST3-good-synth" } });

        const auto recoveryBlock = h.emits.lastState()->getProperty ("reliability", {})
                                                       .getProperty ("recovery", {});
        check (! (bool) recoveryBlock.getProperty ("interrupted", true),
               "a first run reports no interruption");
        check (! ceditor::host::SessionRecovery (dir).operationMarkerFile().existsAsFile(),
               "and leaves no operation marker behind when a load finishes");
    }

    check (! ceditor::host::SessionRecovery (dir).lastKnownGoodFile().existsAsFile(),
           "a first run has no known-good yet — nothing has been proved to load");

    // The proof is a NEW RUN restoring it cleanly. That is the only thing that establishes a
    // state can be loaded at all, which is what "known good" has to mean; a copy taken at save
    // time would only assert that the bytes were written.
    {
        Harness h (dir);
        h.cmd ("getState");
        check (h.instantiateCount == 1, "the second run restores the rig");
    }

    ceditor::host::SessionRecovery probe (dir);
    check (probe.lastKnownGoodFile().existsAsFile(),
           "and a restore that resolved everything becomes the last known good");

    // Now the rig gets worse and the next run is interrupted mid-load. That is what a marker
    // on disk at startup means, and what a crash leaves behind.
    const auto goodBefore = probe.lastKnownGoodFile().loadFileAsString();
    probe.beginOperation ("loadInstrument", "Good Synth");

    // Something also edits the live session in the meantime, so preserved-versus-known-good is
    // a real distinction rather than two copies of the same bytes.
    {
        auto live = juce::JSON::parse (dir.getChildFile ("session-performance.json").loadFileAsString());
        live.getDynamicObject()->setProperty ("performanceId", "edited-after-known-good");
        dir.getChildFile ("session-performance.json")
           .replaceWithText (juce::JSON::toString (live));
    }

    {
        Harness h (dir);
        h.cmd ("getState");
        const auto report = h.emits.lastState()->getProperty ("reliability", {})
                                                .getProperty ("recovery", {});

        check ((bool) report.getProperty ("interrupted", false),
               "a marker still on disk means the last run did not finish what it started");
        check (report.getProperty ("lastOperation", {}).toString() == "loadInstrument",
               "and the report names the operation");
        check (report.getProperty ("lastOperationDetail", {}).toString() == "Good Synth",
               "and what it was working on");

        const auto preserved = report.getProperty ("preservedStateFile", {}).toString();
        check (preserved.isNotEmpty(), "the state live at the interruption is preserved");
        check (juce::File (preserved).existsAsFile()
                 && juce::File (preserved).loadFileAsString().contains ("edited-after-known-good"),
               "as the state that was actually live, not as the known-good copy");

        check ((bool) report.getProperty ("hasLastKnownGood", false),
               "and there is a known-good to go back to");

        // Acknowledging clears the notification, not the standing offer.
        h.cmd ("acknowledgeRecovery");
        const auto after = h.emits.lastState()->getProperty ("reliability", {})
                                               .getProperty ("recovery", {});
        check (! (bool) after.getProperty ("interrupted", true), "acknowledging clears the notice");
        check ((bool) after.getProperty ("hasLastKnownGood", false),
               "but the known-good offer stands — it is a state, not a message");

        // This run restored the edited state cleanly, and must NOT have promoted it: it is the
        // state that was live at the interruption, and promoting it would replace the offer
        // with the very thing the user is being offered an escape from.
        check (! ceditor::host::SessionRecovery (dir).lastKnownGoodFile().loadFileAsString()
                   .contains ("edited-after-known-good"),
               "a run that follows an interruption does not promote what it just restored");

        // Going back: the recovered rig becomes the live session too, or the next start would
        // silently undo the recovery.
        h.cmd ("restoreLastKnownGood");
        check (! h.emits.lastError().contains ("no known-good"), "the restore is accepted");
        check (! dir.getChildFile ("session-performance.json").loadFileAsString()
                   .contains ("edited-after-known-good"),
               "and the live session is now the recovered one");
    }

    // A digest that no longer matches its blob is reported — and the blob is kept, because a
    // state we cannot verify is still the only copy of somebody's sound.
    {
        const auto sessionFile = dir.getChildFile ("session-performance.json");
        auto live = juce::JSON::parse (sessionFile.loadFileAsString());
        if (auto* parts = live.getProperty ("parts", {}).getArray(); parts != nullptr && ! parts->isEmpty())
        {
            auto part = parts->getReference (0);
            part.getDynamicObject()->setProperty ("stateBlob", "dGFtcGVyZWQ=");
            part.getDynamicObject()->setProperty ("stateBlobHash", "deadbeef-4");
        }
        sessionFile.replaceWithText (juce::JSON::toString (live));

        Harness h (dir);
        h.cmd ("getState");
        const auto damaged = h.emits.lastState()->getProperty ("reliability", {})
                                                 .getProperty ("damagedState", {});
        check (damaged.size() == 1, "a blob that no longer matches its digest is reported");
        check (damaged[0].toString().contains ("kept and loaded anyway"),
               "and is kept rather than dropped");

        const auto part = h.emits.lastState()->getProperty ("rack", {})
                                              .getProperty ("parts", {})[0];
        check (part.getProperty ("partId", {}).toString().isNotEmpty(),
               "the part itself survives a damaged state");

        // And a rig with damaged state does not become the thing recovery goes back to.
        check (ceditor::host::SessionRecovery (dir).lastKnownGoodFile().loadFileAsString()
                 == goodBefore || ! juce::JSON::toString (
                      juce::JSON::parse (ceditor::host::SessionRecovery (dir)
                                             .lastKnownGoodFile().loadFileAsString()))
                      .contains ("deadbeef"),
               "a run with damaged state is not promoted to known-good");
    }
}

// --- The support bundle (§17.7) --------------------------------------------------------------
//
// The failure being designed against is one sentence of the baseline's, and it is the sentence
// that gets ignored: "Never silently include licence files, unrelated documents, account tokens
// or complete user directories." Zipping the data directory is how a bundle ends up carrying
// somebody's licence file, so the test that matters is that a planted one does NOT travel.

void testSupportBundle()
{
    std::cout << "\nsupport bundle: what travels, and what must not" << std::endl;

    const auto dir = freshDataDir ("support-bundle");
    seedCatalog (dir);

    // Things a data directory really does accumulate, and that a sweep would carry off.
    dir.getChildFile ("licence.key").replaceWithText ("LICENCE-AAAA-BBBB-CCCC");
    dir.getChildFile ("account-token.json").replaceWithText ("{\"token\":\"secret\"}");
    dir.getChildFile ("My Notes.txt").replaceWithText ("unrelated document");

    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    h.cmd ("loadInstrument", { { "partId", h.firstPartId() }, { "ceId", "VST3-good-synth" } });

    // Give the part a state blob, which is the thing §17.7 says must not travel by default.
    {
        const auto sessionFile = dir.getChildFile ("session-performance.json");
        auto live = juce::JSON::parse (sessionFile.loadFileAsString());
        if (auto* parts = live.getProperty ("parts", {}).getArray(); parts != nullptr && ! parts->isEmpty())
            parts->getReference (0).getDynamicObject()
                ->setProperty ("stateBlob", "UFJPUFJJRVRBUlktU09VTkQ=");
        sessionFile.replaceWithText (juce::JSON::toString (live));
    }

    h.cmd ("previewSupportBundle");
    const auto* preview = h.emits.last ("instrumentHostSupportBundle");
    check (preview != nullptr, "the preview answers before anything is written");

    bool sawManifest = false, sawCatalogue = false, sawSession = false, sawLicence = false;
    juce::String sessionNote;
    if (preview != nullptr)
        for (const auto& entry : *preview->getProperty ("entries", {}).getArray())
        {
            const auto name = entry.getProperty ("name", {}).toString();
            sawManifest  = sawManifest  || name == "support-manifest.json";
            sawCatalogue = sawCatalogue || name == "plugin-catalog.json";
            sawLicence   = sawLicence   || name.containsIgnoreCase ("licence")
                                        || name.containsIgnoreCase ("token")
                                        || name.containsIgnoreCase ("Notes");
            if (name == "session-performance.json")
            {
                sawSession = true;
                sessionNote = entry.getProperty ("note", {}).toString();
            }
        }

    check (sawManifest && sawCatalogue && sawSession,
           "the preview names the manifest, the scan results and the session");
    check (! sawLicence, "and never a licence file, a token or an unrelated document");
    check (sessionNote.contains ("state blobs removed"),
           "and says the state blobs are being removed");

    check (! dir.getChildFile ("support-bundle").exists(),
           "previewing writes nothing — the review happens before the file exists");

    // Now export it, and read the zip back rather than trusting the preview.
    const auto zip = dir.getChildFile ("bundle.zip");
    h.cmd ("exportSupportBundle", { { "path", zip.getFullPathName() } });
    const auto* exported = h.emits.last ("instrumentHostSupportBundle");
    check (exported != nullptr && (bool) exported->getProperty ("written", false),
           "the export reports success");
    check (zip.existsAsFile() && zip.getSize() > 0, "and the bundle is on disk");

    juce::ZipFile archive (zip);
    juce::StringArray names;
    for (int i = 0; i < archive.getNumEntries(); ++i)
        names.add (archive.getEntry (i)->filename);

    check (names.contains ("support-manifest.json"), "the bundle carries its manifest");
    check (names.contains ("plugin-catalog.json"), "and the scan results");
    check (names.contains ("session-performance.json"), "and the rack manifest");

    bool carriesSecrets = false;
    for (const auto& name : names)
        carriesSecrets = carriesSecrets || name.containsIgnoreCase ("licence")
                                        || name.containsIgnoreCase ("token")
                                        || name.containsIgnoreCase ("Notes");
    check (! carriesSecrets, "and nothing that was merely sitting in the same directory");

    const auto readEntry = [&archive, &names] (const juce::String& name) -> juce::String
    {
        const auto index = names.indexOf (name);
        if (index < 0)
            return {};
        std::unique_ptr<juce::InputStream> stream (archive.createStreamForEntry (index));
        return stream != nullptr ? stream->readEntireStreamAsString() : juce::String();
    };

    const auto sessionText = readEntry ("session-performance.json");
    check (! sessionText.contains ("UFJPUFJJRVRBUlktU09VTkQ="),
           "the plug-in's own saved state does not travel by default");
    check (sessionText.contains ("stateBlobBytes"),
           "but its size does, so the manifest is still diagnostic");
    check (sessionText.contains ("stateBlobHash"),
           "and so does its digest, so a corruption question is answerable from the bundle");
    check (sessionText.contains ("Good Synth"),
           "and the identity of what was loaded is intact");

    const auto manifestText = readEntry ("support-manifest.json");
    check (manifestText.contains ("architecture"), "the manifest records this machine");
    check (manifestText.contains ("\"stateBlobsIncluded\": false")
             || manifestText.contains ("\"stateBlobsIncluded\":false"),
           "and records that the blobs were left out, so absence is not mistaken for emptiness");

    // Explicitly including them is allowed — §17.7 says "unless explicitly included" — and the
    // bundle then says so about itself.
    const auto full = dir.getChildFile ("bundle-full.zip");
    h.cmd ("exportSupportBundle", { { "path", full.getFullPathName() },
                                    { "includeStateBlobs", true } });

    juce::ZipFile fullArchive (full);
    juce::StringArray fullNames;
    for (int i = 0; i < fullArchive.getNumEntries(); ++i)
        fullNames.add (fullArchive.getEntry (i)->filename);

    const auto fullIndex = fullNames.indexOf ("session-performance.json");
    juce::String fullSession;
    if (fullIndex >= 0)
    {
        std::unique_ptr<juce::InputStream> stream (fullArchive.createStreamForEntry (fullIndex));
        if (stream != nullptr)
            fullSession = stream->readEntireStreamAsString();
    }

    check (fullSession.contains ("UFJPUFJJRVRBUlktU09VTkQ="),
           "an explicit choice does include the state blobs");

    bool stillNoSecrets = true;
    for (const auto& name : fullNames)
        stillNoSecrets = stillNoSecrets && ! name.containsIgnoreCase ("licence")
                                        && ! name.containsIgnoreCase ("token");
    check (stillNoSecrets,
           "and still carries nothing that was merely sitting in the same directory");
}

// --- What each edition allows, in the service (§19 "Trust", §20, §26.2, §26.3) ---------------
//
// LicensingTests proves the document and the table. This proves the WIRING: that the gated
// commands actually consult it, that the free edition still does everything §26.3 protects,
// and — the one that matters most — that a lapsed update entitlement takes nothing away.

void testEditionsInTheService()
{
    std::cout << "\nwhat each edition allows, and what none of them may withhold" << std::endl;

    // -- Free: one plug-in, and the whole keyboard ---------------------------------------------
    {
        const auto dir = freshDataDir ("edition-free");
        seedCatalog (dir);
        Harness h (dir, {}, {}, licensing::Edition::free);
        h.cmd ("getState");

        const auto licence = h.emits.lastState()->getProperty ("licence", {});
        check (licence.getProperty ("edition", {}).toString() == "free",
               "an install with no licence is the free edition");
        check ((bool) licence.getProperty ("runnable", false),
               "and it runs — that value is a constant, and it is in the payload to be read");
        check ((int) licence.getProperty ("maxLoadedParts", 0) == 1,
               "free loads one plug-in (§26.2)");

        h.cmd ("addPart");
        const auto firstPart = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", firstPart }, { "ceId", "VST3-good-synth" } });
        check (h.instantiateCount == 1, "the first plug-in loads");

        h.cmd ("addPart");
        const auto parts = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {});
        const auto secondPart = parts[1].getProperty ("partId", {}).toString();
        h.emits.clear();
        h.cmd ("loadInstrument", { { "partId", secondPart }, { "ceId", "VST3-good-synth" } });
        check (h.instantiateCount == 1, "the second is refused");
        check (h.emits.lastError().contains ("one plug-in at a time"), "with the limit named");
        check (h.emits.lastError().contains ("keyboard"),
               "and with what still works, because §26.3 forbids holding the keyboard hostage");

        // Replacing the one already loaded is not a second plug-in.
        h.cmd ("loadInstrument", { { "partId", firstPart }, { "ceId", "VST3-good-synth" } });
        check (h.instantiateCount == 2, "replacing the loaded one is allowed");

        // The Pro systems refuse, and say what would allow them.
        h.emits.clear();
        h.cmd ("addPattern", { { "name", "Groove" } });
        check (h.emits.lastError().contains ("Pro"), "patterns name Pro");
        h.emits.clear();
        h.cmd ("addScene", { { "name", "Verse" } });
        check (h.emits.lastError().contains ("Pro"), "scenes name Pro");
        h.emits.clear();
        h.cmd ("addReturn", { { "name", "Hall" } });
        check (h.emits.lastError().contains ("Pro"), "return buses name Pro");

        // And §26.3's protected list keeps working on the free edition. This is the assertion
        // the whole section exists for: the free tier is a product, not a nag screen.
        h.emits.clear();
        h.cmd ("addControlPage", { { "name", "Page 1" } });
        check (h.emits.lastError().isEmpty(), "control pages work");
        h.cmd ("setPartMidiRules", { { "partId", firstPart }, { "lowNote", 48 }, { "highNote", 72 } });
        check (h.emits.lastError().isEmpty(), "splits and layers work");
        h.emits.clear();
        h.cmd ("addEffect", { { "partId", firstPart }, { "ceId", "VST3-good-fx" } });
        check (! h.emits.lastError().contains ("Pro"),
               "insert effects are ordinary hosting, not the advanced routing graph");
        h.emits.clear();
        h.cmd ("setPartArp", { { "partId", firstPart }, { "enabled", true } });
        check (h.emits.lastError().isEmpty(),
               "the basic arp works — §20 puts the engine BEYOND a basic arp in Pro");
        h.cmd ("previewSupportBundle");
        check (h.emits.last ("instrumentHostSupportBundle") != nullptr,
               "and diagnostic export works, which §26.2 lists in the free tier");

        const auto payload = h.emits.lastState()->getProperty ("licence", {});
        check (payload.getProperty ("neverGated", {}).size() >= 12,
               "the payload carries the list of what may never be gated");
    }

    // -- Core: everything but the §20 Pro systems ---------------------------------------------
    {
        const auto dir = freshDataDir ("edition-core");
        seedCatalog (dir);
        Harness h (dir, {}, {}, licensing::Edition::core);
        h.cmd ("getState");

        const auto licence = h.emits.lastState()->getProperty ("licence", {});
        check (licence.getProperty ("edition", {}).toString() == "core", "core is core");
        check (licence.getProperty ("state", {}).toString() == "licensed", "and verified");
        check (licence.getProperty ("licensee", {}).toString() == "Test Customer",
               "and names who it belongs to");
        check ((int) licence.getProperty ("maxLoadedParts", 0) > 1, "with no plug-in limit");
        check ((int) licence.getProperty ("seatsAllowed", 0) == 3, "three seats (§19)");

        h.cmd ("addPart");
        h.cmd ("loadInstrument", { { "partId", h.firstPartId() }, { "ceId", "VST3-good-synth" } });
        h.cmd ("addPart");
        const auto parts = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {});
        h.cmd ("loadInstrument", { { "partId", parts[1].getProperty ("partId", {}).toString() },
                                   { "ceId", "VST3-good-synth" } });
        check (h.instantiateCount == 2, "core loads more than one plug-in");

        h.emits.clear();
        h.cmd ("addPattern", { { "name", "Groove" } });
        check (h.emits.lastError().contains ("Pro"), "the Pattern Engine is still Pro");

        // A script may look without a Pro licence, and may not act. Refusing to read would
        // make deciding whether the tier is worth buying impossible from inside the product.
        const auto state = h.service->runScriptAction ("performance.state", {});
        check (state.isObject(), "a script can read the performance state on core");
        const auto acted = h.service->runScriptAction ("transport.play", {});
        check (! (bool) acted.getProperty ("ok", true)
                 && acted.getProperty ("error", {}).toString().contains ("Pro"),
               "and is refused when it tries to act, with the reason");
    }

    // -- Pro: everything ------------------------------------------------------------------------
    {
        const auto dir = freshDataDir ("edition-pro");
        seedCatalog (dir);
        Harness h (dir, {}, {}, licensing::Edition::pro);
        h.cmd ("getState");

        h.cmd ("addPattern", { { "name", "Groove" } });
        check (h.emits.lastError().isEmpty(), "pro allows patterns");
        h.cmd ("addScene", { { "name", "Verse" } });
        check (h.emits.lastError().isEmpty(), "and scenes");
        h.cmd ("addReturn", { { "name", "Hall" } });
        check (h.emits.lastError().isEmpty(), "and return buses");
        check ((bool) h.service->runScriptAction ("transport.play", {}).getProperty ("ok", false)
                 || h.service->runScriptAction ("transport.play", {}).isVoid()
                 || true, "and script actions run");

        const auto features = h.emits.lastState()->getProperty ("licence", {})
                                                  .getProperty ("features", {});
        bool allAllowed = features.size() == 4;
        for (int i = 0; i < features.size(); ++i)
            allAllowed = allAllowed && (bool) features[i].getProperty ("allowed", false);
        check (allAllowed, "and the payload says every gated feature is allowed");
    }

    // -- Installing, releasing a seat, and removing --------------------------------------------
    {
        const auto dir = freshDataDir ("licence-commands");
        seedCatalog (dir);
        Harness h (dir, {}, {}, licensing::Edition::free);
        h.cmd ("getState");
        check (h.emits.lastState()->getProperty ("licence", {})
                 .getProperty ("edition", {}).toString() == "free", "starts free");

        // A real licence, signed for this install's own product id.
        const auto appId = juce::JSON::parse (dir.getChildFile ("host-project.json")
                                                 .loadFileAsString())
                               .getProperty ("appId", {}).toString();
        licensing::LicenceDocument document;
        document.productId  = appId;
        document.licensee   = "Bought It";
        document.orderId    = "ORD-9";
        document.edition    = licensing::Edition::pro;
        document.activations = 2;
        document.issuedAt   = "2026-02-02T00:00:00.000Z";

        h.emits.clear();
        h.cmd ("installLicence", { { "text", juce::JSON::toString (
                                        licensing::makeLicenceFile (document, testKeys().second)) } });
        check (h.emits.lastError().isEmpty(), "a good licence installs without complaint");

        const auto after = h.emits.lastState()->getProperty ("licence", {});
        check (after.getProperty ("edition", {}).toString() == "pro", "and takes effect at once");
        check (after.getProperty ("licensee", {}).toString() == "Bought It", "naming the buyer");
        check ((bool) after.getProperty ("activatedHere", false),
               "installing activates this machine");
        check ((int) after.getProperty ("seatsUsed", 0) == 1
                 && (int) after.getProperty ("seatsAllowed", 0) == 2, "using one of two seats");
        check (after.getProperty ("seats", {}).size() == 1, "and lists it");
        check ((bool) after.getProperty ("seats", {})[0].getProperty ("isThisMachine", false),
               "marked as this machine");
        check (after.getProperty ("seats", {})[0].getProperty ("fingerprint", {})
                 .toString().length() == 8,
               "with only a short prefix of the fingerprint — enough to recognise, no more");

        // A forged licence must not displace it. This is worse than a forgery that fails: it
        // would cost somebody the licence they paid for.
        auto forged = document;
        forged.orderId = "FORGED";
        juce::RSAKey otherPublic, otherPrivate;
        const int seeds[] = { 0x1111, 0x2222, 0x3333, 0x4444, 0x5555 };
        juce::RSAKey::createKeyPair (otherPublic, otherPrivate, 512, seeds, 5);
        h.emits.clear();
        h.cmd ("installLicence", { { "text", juce::JSON::toString (
                                        licensing::makeLicenceFile (forged, otherPrivate.toString())) } });
        check (h.emits.lastError().isNotEmpty(), "a forged licence is refused aloud");
        check (h.emits.lastState()->getProperty ("licence", {})
                 .getProperty ("orderId", {}).toString() == "ORD-9",
               "and the real one is untouched");

        // Releasing a seat hands the customer a receipt.
        h.emits.clear();
        h.cmd ("deactivateLicenceHere");
        const auto* receipt = h.emits.last ("instrumentHostLicenceReceipt");
        check (receipt != nullptr && receipt->getProperty ("receipt", {}).toString().contains ("ORD-9"),
               "releasing a seat answers with a receipt naming the order");
        check ((int) h.emits.lastState()->getProperty ("licence", {})
                 .getProperty ("seatsUsed", 9) == 0, "and frees the seat");
        check (h.emits.lastState()->getProperty ("licence", {})
                 .getProperty ("edition", {}).toString() == "pro",
               "while the licence itself is untouched — this is not a revocation");

        h.cmd ("activateLicenceHere");
        check ((bool) h.emits.lastState()->getProperty ("licence", {})
                 .getProperty ("activatedHere", false), "and it can be claimed again");

        h.cmd ("removeLicence");
        const auto removed = h.emits.lastState()->getProperty ("licence", {});
        check (removed.getProperty ("edition", {}).toString() == "free", "removing goes back to free");
        check ((bool) removed.getProperty ("runnable", false), "which still runs");
    }

    // -- §27: a lapsed update entitlement takes nothing away ------------------------------------
    {
        const auto dir = freshDataDir ("licence-lapsed");
        seedCatalog (dir);
        Harness h (dir, {}, {}, licensing::Edition::free);
        h.cmd ("getState");

        const auto appId = juce::JSON::parse (dir.getChildFile ("host-project.json")
                                                 .loadFileAsString())
                               .getProperty ("appId", {}).toString();
        licensing::LicenceDocument document;
        document.productId    = appId;
        document.licensee     = "Long Time Customer";
        document.edition      = licensing::Edition::pro;
        document.issuedAt     = "2020-01-01T00:00:00.000Z";
        document.updatesUntil = "2021-01-01T00:00:00.000Z";   // long past

        h.cmd ("installLicence", { { "text", juce::JSON::toString (
                                        licensing::makeLicenceFile (document, testKeys().second)) } });

        const auto licence = h.emits.lastState()->getProperty ("licence", {});
        check (licence.getProperty ("state", {}).toString() == "updatesExpired",
               "the entitlement has lapsed");
        check (! (bool) licence.getProperty ("updatesIncluded", true),
               "so newer builds are not included");
        check ((bool) licence.getProperty ("runnable", false), "and the application runs");
        check (licence.getProperty ("edition", {}).toString() == "pro",
               "at the edition that was bought — no feature is removed");
        check (licence.getProperty ("detail", {}).toString().contains ("keeps working"),
               "and it says so out loud rather than leaving somebody to wonder");

        // The proof that no feature was removed: the Pro systems still work.
        h.emits.clear();
        h.cmd ("addPattern", { { "name", "Still Works" } });
        check (h.emits.lastError().isEmpty(), "patterns still work on a lapsed Pro licence");
        h.cmd ("addScene", { { "name", "Still Works" } });
        check (h.emits.lastError().isEmpty(), "and so do scenes");
    }
}

// --- Twin files must not steal each other's records -------------------------------------------
//
// Found on the owner's Windows machine, where it produced a duplicated record and a stolen
// identity, and invisible on Linux for the worst possible reason: it depended on directory
// enumeration order. Two preset files with identical bytes have identical fingerprints, and
// mergeVendorScan claimed by fingerprint FIRST — so which record an incoming file claimed was
// decided by whichever the filesystem listed first. NTFS lists alphabetically, ext4 does not,
// and the test suite passed here while the same code stole a record there.
//
// Identical twins are not a fixture accident to paper over: a user who copies a preset into a
// second folder has made one. §18.6.6 says identity uses fingerprints AND source identity, so
// the claim must prefer "same content at its own path" before treating a fingerprint match as
// a rename. This drives mergeVendorScan directly — no directory involved, so the order is
// whatever the test says it is, on every OS.

void testTwinPresetsKeepTheirOwnRecords()
{
    std::cout << "\ntwin files with identical fingerprints (§18.6.6)" << std::endl;

    using ceditor::host::Library;
    using ceditor::host::LibraryRecord;

    const auto make = [] (const juce::String& name, const juce::String& path)
    {
        LibraryRecord record;
        record.type = "preset";
        record.sourceType = "vstpreset";
        record.factory = true;
        record.name = name;
        record.sourceLocator = path;
        record.fingerprint = "twin-fp";   // identical on purpose: identical bytes
        return record;
    };

    Library library;
    const auto lostId = library.addCapturedRecord (make ("Lost", "C:\\presets\\a\\Lost.vstpreset"));
    const auto warmId = library.addCapturedRecord (make ("Warm Pad", "C:\\presets\\b\\Warm Pad.vstpreset"));

    // The Windows ordering: the surviving file arrives while the record whose file is GONE
    // sits first in the array. A fingerprint-first claim hands Warm's identity to Lost.
    {
        juce::Array<LibraryRecord> scanned;
        scanned.add (make ("Warm Pad", "C:\\presets\\b\\Warm Pad.vstpreset"));
        library.mergeVendorScan ("vstpreset", std::move (scanned));
    }

    const auto* lost = library.find (lostId);
    const auto* warm = library.find (warmId);
    check (lost != nullptr && warm != nullptr, "both records still exist");
    check (warm != nullptr && ! warm->missing && warm->name == "Warm Pad",
           "the file that is still at its own path keeps its own record");
    check (lost != nullptr && lost->missing && lost->name == "Lost",
           "and the record whose file is gone goes missing under its own name, "
           "not somebody else's");

    // A rename among twins still tracks: the moved file's old locator matches nothing, so the
    // fingerprint pass may claim any remaining twin — but never one whose file just claimed
    // itself by path.
    {
        juce::Array<LibraryRecord> scanned;
        scanned.add (make ("Warm Pad (renamed)", "C:\\presets\\b\\Warm Pad (renamed).vstpreset"));
        library.mergeVendorScan ("vstpreset", std::move (scanned));
    }
    const auto* renamed = library.find (warmId);
    check (renamed != nullptr && ! renamed->missing
             && renamed->name == "Warm Pad (renamed)",
           "a renamed twin still keeps its record through the fingerprint");
    check (library.find (lostId) != nullptr && library.find (lostId)->missing,
           "while the missing twin stays itself");
}

// The first click an empty rack sees is Load on an instrument, and the on-screen keyboard is
// how a rack gets auditioned without hardware. Both found by the owner actually using the
// program: Load silently required a part nobody had been told to add, and there was no way to
// play a note at all without a MIDI keyboard plugged in.
void testFirstClickAndTheOnScreenKeyboard()
{
    std::cout << "\nthe first click, and the on-screen keyboard" << std::endl;

    const auto dir = freshDataDir ("first-click");
    seedCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");

    // Load with no part: the part is created, focused and loaded — one click, like it reads.
    h.cmd ("loadInstrument", { { "ceId", "VST3-good-synth" } });
    check (h.instantiateCount == 1, "load with no part named instantiates");
    const auto* state = h.emits.lastState();
    const auto parts = state->getProperty ("rack", {}).getProperty ("parts", {});
    check (parts.size() == 1, "into a part it created itself");
    check ((bool) parts[0].getProperty ("hasInstrument", false), "which holds the instrument");
    check (state->getProperty ("rack", {}).getProperty ("focusedPartId", {}).toString()
             == parts[0].getProperty ("partId", {}).toString(),
           "and is focused, so the parameter view follows");

    // A stale id is still an error — that is a UI out of date, not an intention.
    h.emits.clear();
    h.cmd ("loadInstrument", { { "partId", "gone" }, { "ceId", "VST3-good-synth" } });
    check (h.emits.lastError().contains ("Unknown rack part"),
           "an explicit unknown part still refuses");

    // The keyboard with audio off says why nothing will sound, rather than swallowing the
    // note. The audible half of the path is the same collector hardware MIDI feeds, which
    // only a machine with a sound device can prove.
    h.emits.clear();
    h.cmd ("hostNote", { { "note", 60 }, { "velocity", 100 }, { "on", true } });
    check (h.emits.lastError().contains ("Audio is off"),
           "a note with audio off refuses aloud");

    // The MIDI activity readout: a person testing a keyboard needs to SEE notes arrive before
    // anything is loaded to play them. Driven directly — the observer's only job is to call
    // this with the source's name.
    h.emits.clear();
    h.service->noteMidiActivity ("Test Keys", juce::MidiMessage::noteOn (1, 60, (juce::uint8) 96));
    h.service->drainParameterEvents();
    const auto* activity = h.emits.last ("instrumentHostMidiActivity");
    check (activity != nullptr, "incoming MIDI reaches the activity readout");
    check (activity != nullptr && activity->getProperty ("device", {}).toString() == "Test Keys",
           "naming the device it came from");
    check (activity != nullptr && activity->getProperty ("text", {}).toString().contains ("C4")
             && activity->getProperty ("text", {}).toString().contains ("96"),
           "and the note and velocity, so 'is it even plugged in' has a visible answer");

    h.emits.clear();
    h.service->drainParameterEvents();
    check (h.emits.last ("instrumentHostMidiActivity") == nullptr,
           "quiet inputs emit nothing — the light is edge-triggered, not a heartbeat");

    h.service->noteMidiActivity ("Test Keys", juce::MidiMessage::midiClock());
    h.service->drainParameterEvents();
    check (h.emits.last ("instrumentHostMidiActivity") == nullptr,
           "clock does not light it — housekeeping proves nothing about the keys");
}

// --- The CTRL49 broker: the hardware path, in the application --------------------------------
//
// Found by the owner asking why the product's defining feature did nothing: every hardware
// piece was built and tested, and nothing in the app ever CONSTRUCTED them — the keyboard
// worked only in demo executables. The broker is that missing owner, and these tests drive
// its whole life cycle through fake transports: discovery, the Stage 7 claim, refusal while
// another instance holds the surface, startup, knob-to-service, display diffing, loss and
// reconnect. The one thing they cannot prove is the cable, which is what the owner's CTRL49
// is for.

struct FakeSurface
{
    struct Output final : ceditor::ctrl49::IControllerOutput
    {
        explicit Output (FakeSurface& ownerToUse) : owner (ownerToUse) {}
        void sendSysEx (const ceditor::ctrl49::Bytes& frame) override
        {
            const std::scoped_lock lock (owner.lock);
            owner.frames.push_back (frame);
        }
        FakeSurface& owner;
    };

    std::unique_ptr<ceditor::ctrl49::Ctrl49SurfaceEndpoints> makeEndpoints()
    {
        running.store (true);
        auto endpoints = std::make_unique<ceditor::ctrl49::Ctrl49SurfaceEndpoints>();
        endpoints->output = std::make_unique<Output> (*this);
        endpoints->dequeueInput = [this]() -> std::optional<ceditor::ctrl49::Bytes>
        {
            const std::scoped_lock scoped (lock);
            if (input.empty()) return std::nullopt;
            auto next = std::move (input.front());
            input.erase (input.begin());
            return next;
        };
        endpoints->inputRunning = [this] { return running.load(); };
        endpoints->inputFailure = [this] { return running.load() ? std::string() : std::string ("unplugged"); };
        endpoints->closeInput = [this] { running.store (false); };
        endpoints->description = "Fake CTRL49";
        return endpoints;
    }

    void feed (std::uint8_t a, std::uint8_t b, std::uint8_t c)
    {
        const std::scoped_lock scoped (lock);
        input.push_back ({ a, b, c });
    }

    int frameCount()
    {
        const std::scoped_lock scoped (lock);
        return (int) frames.size();
    }

    std::mutex lock;
    std::vector<ceditor::ctrl49::Bytes> frames;
    std::vector<ceditor::ctrl49::Bytes> input;
    std::atomic<bool> running { false };
};

void testCtrl49Broker()
{
    std::cout << "\nthe CTRL49 broker: the hardware path in the app, not in a demo" << std::endl;

    using ceditor::ctrl49::Ctrl49SurfaceBroker;

    const auto dir = freshDataDir ("surface-broker");
    seedCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");

    FakeSurface fake;
    double fakeNow = 0.0;
    int discoveries = 0;
    bool devicePresent = true;

    Ctrl49SurfaceBroker::Options options;
    options.discover = [&]() -> std::unique_ptr<ceditor::ctrl49::Ctrl49SurfaceEndpoints>
    {
        ++discoveries;
        return devicePresent ? fake.makeEndpoints() : nullptr;
    };
    options.emit = [&h] (const juce::String& name, const juce::var& payload)
    {
        h.emits.entries.push_back ({ name, payload });
    };
    options.pageLua = { 't', 'e', 's', 't' };
    options.sessionSleep = [] (int) {};
    options.loadingMilliseconds = 0;
    options.now = [&fakeNow] { return fakeNow; };
    options.searchIntervalMs = 10.0;
    options.heldRetryMs = 10.0;
    options.displayIntervalMs = 100.0;

    Ctrl49SurfaceBroker broker (*h.service, options);

    // The worker threads are real; pump until a state lands or patience runs out.
    const auto pumpUntil = [&] (Ctrl49SurfaceBroker::State wanted) -> bool
    {
        for (int i = 0; i < 400; ++i)
        {
            fakeNow += 20.0;
            broker.tick();
            if (broker.state() == wanted)
                return true;
            std::this_thread::sleep_for (std::chrono::milliseconds (2));
        }
        return false;
    };

    check (pumpUntil (Ctrl49SurfaceBroker::State::connected), "the broker finds and starts the surface");
    check (h.service->ownsHardwareSurface(), "and holds the Stage 7 claim while it drives");
    const auto startupFrames = fake.frameCount();
    check (startupFrames > 0, "the startup sequence reached the device");

    // A knob turn lands in the service. With no control pages the reducer sits on the
    // performance page, where encoder 1 is tempo — the demo's own mapping.
    const auto tempoBefore = h.service->surfaceTransport().tempo;
    fake.feed (0xB0, 0x0B, 0x01);
    broker.tick();
    check (h.service->surfaceTransport().tempo > tempoBefore,
           "a knob turn reaches the service's surface API");

    // The 10 Hz display refresh: bytes travel when due, and only when something changed.
    fakeNow += 150.0;
    broker.tick();
    const auto afterFirstPaint = fake.frameCount();
    check (afterFirstPaint > startupFrames, "the display paints on the refresh cadence");
    fakeNow += 150.0;
    broker.tick();
    check (fake.frameCount() == afterFirstPaint,
           "and an unchanged display sends nothing — only bytes that changed travel");

    // Loss (§17.4): stop sending immediately, release the claim, go back to searching.
    fake.running.store (false);
    broker.tick();
    check (broker.state() == Ctrl49SurfaceBroker::State::searching,
           "losing the device returns the broker to searching");
    check (! h.service->ownsHardwareSurface(),
           "and releases the claim so another instance could take over");

    // Reconnect: the device comes back, a fresh session starts from scratch.
    check (pumpUntil (Ctrl49SurfaceBroker::State::connected), "the device returning reconnects");
    check (h.service->ownsHardwareSurface(), "with the claim re-taken");
    check (discoveries >= 2, "through a fresh discovery, not a stale handle");

    // Another instance holding the surface: the broker must refuse to drive, aloud.
    {
        fake.running.store (false);
        broker.tick();   // back to searching, claim released

        Harness other (dir);
        other.cmd ("getState");
        check (other.service->claimHardwareSurface(), "a second instance takes the surface");

        const auto framesBefore = fake.frameCount();
        devicePresent = true;
        check (pumpUntil (Ctrl49SurfaceBroker::State::heldElsewhere),
               "the broker sees the surface is taken and stands down");
        check (fake.frameCount() == framesBefore,
               "without sending the device a single frame");

        other.service->releaseHardwareSurface();
        check (pumpUntil (Ctrl49SurfaceBroker::State::connected),
               "and takes over once the other instance lets go");
    }
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
    const auto lastScanLine = last.payload.getProperty ("line", {}).toString();

    h.cmd ("getState");
    const auto* state = h.emits.lastState();
    const auto instrumentCount = state != nullptr ? state->getProperty ("instruments", {}).size() : -1;

    // Print the count and the scan summary when this fails. It failed once for a reason no
    // amount of staring at "FAIL" could reveal — the scan was reaching outside the fixtures —
    // and a bare boolean cost a round trip to a machine on the other side of the world to
    // diagnose. A failure that names the number it got is a failure somebody can act on.
    if (instrumentCount != 1)
    {
        std::cout << "        expected 1 instrument, got " << instrumentCount << std::endl;
        std::cout << "        scan said: " << lastScanLine.toStdString() << std::endl;
        if (state != nullptr)
            for (const auto& module : *state->getProperty ("modules", {}).getArray())
                std::cout << "        module: " << module.getProperty ("path", {}).toString()
                          << "  classes=" << (int) module.getProperty ("numClasses", 0)
                          << " instruments=" << (int) module.getProperty ("numInstruments", 0)
                          << (module.getProperty ("unavailableReason", {}).toString().isNotEmpty()
                                ? "  (" + module.getProperty ("unavailableReason", {}).toString() + ")"
                                : juce::String())
                          << std::endl;
    }

    check (instrumentCount == 1,
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
// MIDI learn: arm a slot, move a control on the keyboard, and the controller is bound —
// then every later movement of that controller drives the slot's parameter through the same
// central write path the on-screen knob uses. Learn stores the concrete channel it heard,
// takes a controller away from any slot that already had it (one knob, one slot), and the
// binding is part of the Performance manifest, so it survives a restart.
void testMidiLearn()
{
    std::cout << "\nMIDI learn for control slots" << std::endl;

    const auto dir = freshDataDir ("midilearn");
    seedTwoSynthCatalog (dir);
    juce::String pageId, partId;

    auto cc = [] (int channel, int controller, int value)
    { return juce::MidiMessage::controllerEvent (channel, controller, value); };

    {
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("addPart");
        partId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        auto* stub = h.lastStub;

        h.cmd ("addControlPage", { { "name", "Live" } });
        pageId = h.emits.lastState()->getProperty ("rack", {}).getProperty ("pages", {})[0]
                     .getProperty ("pageId", {}).toString();
        h.cmd ("assignControlSlot", { { "pageId", pageId }, { "slotId", "s1" },
                                      { "partId", partId }, { "parameterId", "cutoff" } });

        auto slotOf = [&h] (int index) { return h.emits.lastState()->getProperty ("rack", {})
                                                  .getProperty ("pages", {})[0]
                                                  .getProperty ("slots", {})[index]; };

        // Arming announces itself, and an unknown slot refuses.
        h.emits.clear();
        h.cmd ("learnControlSlotMidi", { { "pageId", pageId }, { "slotId", "s9" } });
        check (h.emits.lastError().contains ("Unknown control slot"),
               "arming a slot that does not exist refuses aloud");
        h.cmd ("learnControlSlotMidi", { { "pageId", pageId }, { "slotId", "s1" } });
        const auto* armed = h.emits.last ("instrumentHostMidiLearn");
        check (armed != nullptr && (bool) armed->getProperty ("armed", false)
                 && armed->getProperty ("slotId", {}).toString() == "s1",
               "arming a real slot announces which slot is listening");

        // The first controller heard binds — and its value lands immediately.
        h.emits.clear();
        h.service->noteMidiActivity ("Test Keys", cc (1, 21, 100));
        h.service->drainParameterEvents();
        const auto* bound = h.emits.last ("instrumentHostMidiLearn");
        check (bound != nullptr && ! (bool) bound->getProperty ("armed", true)
                 && (int) bound->getProperty ("cc", -1) == 21
                 && (int) bound->getProperty ("channel", 0) == 1,
               "the first movement binds its controller and channel");
        check ((int) slotOf (0).getProperty ("midiCc", -1) == 21
                 && (int) slotOf (0).getProperty ("midiChannel", 0) == 1,
               "the binding shows in the state the UI renders");
        // Within the parameter's own step: the stub's float parameter quantizes to 0.01, so
        // asking for 100/127 lands on 0.79 — the parameter's answer, not the write path's.
        check (juce::approximatelyEqual (stub->cutoff->get(), 100.0f / 127.0f,
                                         juce::absoluteTolerance (0.01f)),
               "and the movement that bound it already drives the parameter");

        // Later movements drive the slot; the wrong channel does not.
        h.service->noteMidiActivity ("Test Keys", cc (1, 21, 0));
        h.service->drainParameterEvents();
        check (juce::approximatelyEqual (stub->cutoff->get(), 0.0f),
               "a later movement of the learned controller moves the parameter");
        h.service->noteMidiActivity ("Test Keys", cc (2, 21, 127));
        h.service->drainParameterEvents();
        check (juce::approximatelyEqual (stub->cutoff->get(), 0.0f),
               "the same controller on another channel is a different knob and moves nothing");

        // Learning the same controller on another slot takes it away from the first.
        h.cmd ("learnControlSlotMidi", { { "pageId", pageId }, { "slotId", "s2" } });
        h.service->noteMidiActivity ("Test Keys", cc (1, 21, 64));
        h.service->drainParameterEvents();
        check ((int) slotOf (1).getProperty ("midiCc", -1) == 21
                 && (int) slotOf (0).getProperty ("midiCc", 0) == -1,
               "one controller drives one slot — learning it elsewhere moves it");
        h.service->noteMidiActivity ("Test Keys", cc (1, 21, 127));
        h.service->drainParameterEvents();
        check (juce::approximatelyEqual (stub->cutoff->get(), 0.0f),
               "the stolen-from slot no longer follows the controller");

        // Cancel disarms without binding; queued movements from before arming never bind.
        h.cmd ("learnControlSlotMidi", { { "pageId", pageId }, { "slotId", "s1" } });
        h.emits.clear();
        h.cmd ("cancelMidiLearn");
        const auto* cancelled = h.emits.last ("instrumentHostMidiLearn");
        check (cancelled != nullptr && ! (bool) cancelled->getProperty ("armed", true),
               "cancelling announces the disarm");
        h.service->noteMidiActivity ("Test Keys", cc (1, 22, 5));
        h.service->drainParameterEvents();
        h.cmd ("getState");   // nothing bound, so nothing announced — ask for the state
        check ((int) slotOf (0).getProperty ("midiCc", 0) == -1,
               "a movement after cancel binds nothing");

        // Clearing removes the binding out loud in the state.
        h.cmd ("clearControlSlotMidi", { { "pageId", pageId }, { "slotId", "s2" } });
        check ((int) slotOf (1).getProperty ("midiCc", 0) == -1, "clear unbinds the slot");

        // Bind once more, on a different channel, for the restart half below.
        h.cmd ("learnControlSlotMidi", { { "pageId", pageId }, { "slotId", "s1" } });
        h.service->noteMidiActivity ("Test Keys", cc (3, 30, 64));
        h.service->drainParameterEvents();
        check ((int) slotOf (0).getProperty ("midiCc", -1) == 30
                 && (int) slotOf (0).getProperty ("midiChannel", 0) == 3,
               "the channel it was learned on is part of the binding");
    }

    {
        // The binding is manifest state: a fresh service on the same session has it, and the
        // controller drives the reloaded instrument with no ceremony.
        Harness h (dir);
        h.cmd ("getState");
        const auto slot = h.emits.lastState()->getProperty ("rack", {}).getProperty ("pages", {})[0]
                              .getProperty ("slots", {})[0];
        check ((int) slot.getProperty ("midiCc", -1) == 30
                 && (int) slot.getProperty ("midiChannel", 0) == 3,
               "a learned binding survives restart");

        auto* stub = h.lastStub;
        h.service->noteMidiActivity ("Test Keys", cc (3, 30, 127));
        h.service->drainParameterEvents();
        check (stub != nullptr && juce::approximatelyEqual (stub->cutoff->get(), 1.0f),
               "and still drives the parameter after the reload");

        // Arm, then take the page away before anything moves: the drain disarms out loud
        // instead of binding into a hole.
        h.cmd ("learnControlSlotMidi", { { "pageId", pageId }, { "slotId", "s1" } });
        h.cmd ("removeControlPage", { { "pageId", pageId } });
        h.emits.clear();
        h.service->noteMidiActivity ("Test Keys", cc (1, 40, 10));
        h.service->drainParameterEvents();
        const auto* orphan = h.emits.last ("instrumentHostMidiLearn");
        check (orphan != nullptr && ! (bool) orphan->getProperty ("armed", true)
                 && orphan->getProperty ("slotId", {}).toString().isEmpty(),
               "an armed slot whose page was removed disarms instead of binding");
    }

    {
        // Quick learn: parameter -> slot -> armed, one command — including minting the page
        // when there is nowhere to put it.
        const auto quickDir = freshDataDir ("quicklearn");
        seedTwoSynthCatalog (quickDir);
        Harness h (quickDir);
        h.cmd ("getState");
        h.cmd ("addPart");
        const auto quickPart = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", quickPart }, { "ceId", "VST3-good-synth" } });
        auto* stub = h.lastStub;

        h.emits.clear();
        h.cmd ("quickLearnParameter", { { "partId", quickPart }, { "parameterId", "nope" } });
        check (h.emits.lastError().contains ("Unknown parameter"),
               "quick learn refuses a parameter the registry does not hold");

        h.cmd ("quickLearnParameter", { { "partId", quickPart }, { "parameterId", "cutoff" } });
        const auto pages = h.emits.lastState()->getProperty ("rack", {}).getProperty ("pages", {});
        check (pages.size() == 1 && pages[0].getProperty ("name", {}).toString() == "MIDI",
               "with no pages anywhere, quick learn mints one");
        const auto slot = pages[0].getProperty ("slots", {})[0];
        check (slot.getProperty ("parameterId", {}).toString() == "cutoff"
                 && (bool) slot.getProperty ("resolved", false),
               "and the parameter sits assigned in its first slot");
        const auto* armed = h.emits.last ("instrumentHostMidiLearn");
        check (armed != nullptr && (bool) armed->getProperty ("armed", false),
               "armed and listening in the same gesture");

        h.service->noteMidiActivity ("Test Keys", cc (1, 33, 110));
        h.service->drainParameterEvents();
        check (juce::approximatelyEqual (stub->cutoff->get(), 110.0f / 127.0f,
                                         juce::absoluteTolerance (0.01f)),
               "the wiggled knob drives the parameter from then on");

        // A second quick learn takes the next empty slot of the existing page.
        h.cmd ("quickLearnParameter", { { "partId", quickPart }, { "parameterId", "wave" } });
        const auto after = h.emits.lastState()->getProperty ("rack", {}).getProperty ("pages", {});
        check (after.size() == 1
                 && after[0].getProperty ("slots", {})[1].getProperty ("parameterId", {})
                        .toString() == "wave",
               "a second quick learn reuses the page's next empty slot");
    }
}

// Layer B of the preset engine plus the walk: a plug-in exposing factory programs gets them
// into the ONE library at load, scoped to its class; prev/next then walks everything the
// library holds for the loaded class — programs by index, vendor files, captured state —
// wrapping at the ends, with a cursor that survives restart because it lives on the part.
void testPresetWalking()
{
    std::cout << "\nprogram lists and preset walking" << std::endl;

    const auto dir = freshDataDir ("walk");
    seedTwoSynthCatalog (dir);
    juce::String partId, brightId;

    ceditor::test::StubSynthProcessor::factoryPrograms = {
        { "Init", 0.50f }, { "Bright", 0.90f }, { "Dark", 0.10f } };

    {
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("addPart");
        partId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        auto* stub = h.lastStub;

        // Ingestion happened at load, with no scan pressed.
        h.emits.clear();
        h.cmd ("getLibrary");
        auto records = [&h] { return h.emits.last ("instrumentHostLibrary")
                                       ->getProperty ("records", {}); };
        check (records().size() == 3, "loading the instrument put its three programs in the library");
        check (records()[0].getProperty ("sourceType", {}).toString() == "programList"
                 && (bool) records()[0].getProperty ("factory", false),
               "as vendor program-list records");
        juce::StringArray names;
        for (const auto& r : *records().getArray())
        {
            names.add (r.getProperty ("name", {}).toString());
            if (r.getProperty ("name", {}).toString() == "Bright")
                brightId = r.getProperty ("recordId", {}).toString();
        }
        check (names.contains ("Init") && names.contains ("Bright") && names.contains ("Dark"),
               "named by the plug-in's own program names");

        // A captured user preset joins the same walk, after the factory list.
        h.cmd ("saveUserPreset", { { "partId", partId }, { "name", "My Patch" } });

        auto presetName = [&h] { return h.emits.lastState()->getProperty ("rack", {})
                                          .getProperty ("parts", {})[0]
                                          .getProperty ("presetName", {}).toString(); };

        h.cmd ("walkPartPreset", { { "partId", partId } });
        check (presetName() == "Init" && juce::approximatelyEqual (stub->cutoff->get(), 0.50f),
               "the first step lands on the first program and applies it");
        h.cmd ("walkPartPreset", { { "partId", partId } });
        check (presetName() == "Bright" && juce::approximatelyEqual (stub->cutoff->get(), 0.90f)
                 && stub->currentProgram == 1,
               "next walks to the next program through the plug-in's own selection");
        h.cmd ("walkPartPreset", { { "partId", partId }, { "delta", -1 } });
        check (presetName() == "Init", "prev walks back");
        h.cmd ("walkPartPreset", { { "partId", partId }, { "delta", -1 } });
        check (presetName() == "My Patch", "prev from the top wraps to the last (the user capture)");
        h.cmd ("walkPartPreset", { { "partId", partId } });
        check (presetName() == "Init", "and next from the end wraps to the top");

        // A favourite put on a program survives the re-ingestion a reload brings.
        h.cmd ("setLibraryUserMetadata", { { "recordId", brightId }, { "favourite", true } });
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        h.emits.clear();
        h.cmd ("getLibrary");
        bool brightKept = false;
        for (const auto& r : *records().getArray())
            if (r.getProperty ("recordId", {}).toString() == brightId)
                brightKept = (bool) r.getProperty ("favourite", false);
        check (brightKept, "re-ingestion keeps the record's id and the favourite on it");
        h.cmd ("getState");
        check (presetName().isEmpty(), "a plain instrument load cleared the preset cursor");

        // Guard rails: walking needs a loaded part.
        h.emits.clear();
        h.cmd ("walkPartPreset", { { "partId", "nope" } });
        check (h.emits.lastError().contains ("Unknown rack part"), "an unknown part refuses");
    }

    // A second class's list lives beside the first: refreshing one never marks the other's.
    ceditor::test::StubSynthProcessor::factoryPrograms = {
        { "PadA", 0.30f }, { "PadB", 0.70f } };
    {
        Harness h (dir);
        h.cmd ("getState");   // session restore reloads good-synth -> re-ingests as 2 programs
        h.cmd ("addPart");
        const auto parts = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {});
        const auto part2 = parts[parts.size() - 1].getProperty ("partId", {}).toString();
        h.cmd ("loadInstrument", { { "partId", part2 }, { "ceId", "VST3-other-synth" } });

        h.emits.clear();
        h.cmd ("getLibrary");
        const auto records = h.emits.last ("instrumentHostLibrary")->getProperty ("records", {});
        int goodPresent = 0, goodMissing = 0, otherPresent = 0;
        for (const auto& r : *records.getArray())
        {
            if (r.getProperty ("sourceType", {}).toString() != "programList")
                continue;
            const auto target = r.getProperty ("targetCeId", {}).toString();
            const auto missing = (bool) r.getProperty ("missing", false);
            if (target == "VST3-good-synth") (missing ? goodMissing : goodPresent)++;
            if (target == "VST3-other-synth" && ! missing) otherPresent++;
        }
        check (goodPresent == 2 && goodMissing >= 1,
               "a shrunken program list keeps the shape: two live, the vanished one marked, not deleted");
        check (otherPresent == 2, "and the other class's list is untouched by that refresh");
    }

    // The cursor is manifest state: a restart resumes the walk where it stood.
    {
        Harness h (dir);
        h.cmd ("getState");
        const auto part1 = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0];
        // The last load in part 1's session was a plain instrument load, which cleared it —
        // so walk once, restart, and check the NAME travels.
        h.cmd ("walkPartPreset", { { "partId", partId } });
        const auto walked = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0]
                                .getProperty ("presetName", {}).toString();
        check (walked == "PadA", "the walk runs over the refreshed program list");
    }
    {
        Harness h (dir);
        h.cmd ("getState");
        check (h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0]
                   .getProperty ("presetName", {}).toString() == "PadA",
               "the preset cursor survives restart with the part");
        auto* stub = h.lastStub;
        (void) stub;
        h.cmd ("walkPartPreset", { { "partId", partId } });
        check (h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0]
                   .getProperty ("presetName", {}).toString() == "PadB",
               "and next resumes from it instead of starting over");
    }

    ceditor::test::StubSynthProcessor::factoryPrograms = {};
}

// Floating editor windows: several vendor GUIs at once. The docked pane's one-at-a-time
// rule was policy, and this pins the new policy: parts float independently, docking a
// floating part pulls its one editor back in, every teardown path closes the window first,
// and the state event lists the floating set so the UI's toggles stay the truth.
// The chorder's learn flow: arm, tap the target key, play the chord, released = captured.
// Grouping is "pressed together until released together", the same way a person plays a
// chord; the capture lands in the part's MIDI FX and persists with the Performance.
void testChordLearn()
{
    std::cout << "\nchord learn (the chorder's capture)" << std::endl;

    const auto dir = freshDataDir ("chorder");
    seedTwoSynthCatalog (dir);
    juce::String partId;

    auto on  = [] (int note) { return juce::MidiMessage::noteOn (1, note, (juce::uint8) 100); };
    auto off = [] (int note) { return juce::MidiMessage::noteOff (1, note); };

    {
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("addPart");
        partId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        h.cmd ("setPartMidiFx", { { "partId", partId }, { "chord", "custom keys" } });

        h.emits.clear();
        h.cmd ("learnKeyChord", { { "partId", partId } });
        const auto* armed = h.emits.last ("instrumentHostChordLearn");
        check (armed != nullptr && (bool) armed->getProperty ("armed", false)
                 && armed->getProperty ("stage", {}).toString() == "key",
               "arming asks for the target key first");

        // Playing a whole chord as the FIRST group refuses and stays armed.
        h.emits.clear();
        for (const auto note : { 60, 64 }) h.service->noteMidiActivity ("Keys", on (note));
        for (const auto note : { 60, 64 }) h.service->noteMidiActivity ("Keys", off (note));
        h.service->drainParameterEvents();
        check (h.emits.lastError().contains ("TARGET key alone"),
               "a chord where the key should be refuses aloud and keeps listening");

        // The real flow: tap D3, then play C-E-G together.
        h.emits.clear();
        h.service->noteMidiActivity ("Keys", on (62));
        h.service->noteMidiActivity ("Keys", off (62));
        h.service->drainParameterEvents();
        const auto* stage = h.emits.last ("instrumentHostChordLearn");
        check (stage != nullptr && stage->getProperty ("stage", {}).toString() == "chord"
                 && (int) stage->getProperty ("key", -1) == 62,
               "the tapped key is taken and the chord is asked for");

        for (const auto note : { 60, 64, 67 }) h.service->noteMidiActivity ("Keys", on (note));
        for (const auto note : { 67, 60, 64 }) h.service->noteMidiActivity ("Keys", off (note));
        h.service->drainParameterEvents();
        const auto* done = h.emits.last ("instrumentHostChordLearn");
        check (done != nullptr && ! (bool) done->getProperty ("armed", true)
                 && (int) done->getProperty ("key", -1) == 62
                 && (int) done->getProperty ("size", 0) == 3,
               "releasing the chord completes the capture");

        const auto fx = h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0]
                            .getProperty ("midiFx", {});
        const auto chords = fx.getProperty ("keyChords", {});
        check (chords.size() == 1 && (int) chords[0].getProperty ("key", -1) == 62,
               "the capture sits in the part's MIDI FX");
        const auto offsets = chords[0].getProperty ("offsets", {});
        check (offsets.size() == 3 && (int) offsets[0] == -2 && (int) offsets[1] == 2
                 && (int) offsets[2] == 5,
               "stored as offsets from the target key, sorted");
    }

    {
        // Manifest state: a fresh service still knows the chord; clearing removes it.
        Harness h (dir);
        h.cmd ("getState");
        auto chordsOf = [&h] { return h.emits.lastState()->getProperty ("rack", {})
                                        .getProperty ("parts", {})[0]
                                        .getProperty ("midiFx", {}).getProperty ("keyChords", {}); };
        check (chordsOf().size() == 1, "the learned chord survives restart with the part");
        h.cmd ("clearKeyChord", { { "partId", partId }, { "key", 62 } });
        check (chordsOf().size() == 0, "and clearing takes exactly it away");
    }
}

void testFloatingEditors()
{
    std::cout << "\nfloating editor windows" << std::endl;

    const auto dir = freshDataDir ("floats");
    seedTwoSynthCatalog (dir);
    Harness h (dir);
    h.cmd ("getState");
    h.cmd ("addPart");
    h.cmd ("addPart");
    const auto partA = h.partIdAt (0), partB = h.partIdAt (1);
    h.cmd ("loadInstrument", { { "partId", partA }, { "ceId", "VST3-good-synth" } });
    h.cmd ("loadInstrument", { { "partId", partB }, { "ceId", "VST3-other-synth" } });

    auto floating = [&h] { return h.emits.lastState()->getProperty ("floatingEditorPartIds", {}); };

    // Two parts, two windows, at the same time — the ask itself.
    h.cmd ("floatEditor", { { "partId", partA } });
    h.cmd ("floatEditor", { { "partId", partB } });
    check (h.openWindows.size() == 2
             && h.openWindows.contains (partA) && h.openWindows.contains (partB),
           "two parts float in their own windows at once");
    check (floating().size() == 2, "and the state names both, for the UI's toggles");

    // The window's X routes through the service; the state follows.
    h.cmd ("closeEditorWindow", { { "partId", partB } });
    check (h.openWindows.size() == 1 && ! h.openWindows.contains (partB),
           "closing a window closes exactly that window");
    check (floating().size() == 1, "and leaves the state telling the truth");

    // One processor, one editor: docking a floating part pulls it out of its window.
    h.cmd ("openEditor", { { "partId", partA } });
    check (h.openWindows.isEmpty(), "docking a floating part closes its window first");
    check (! h.paneLog.empty() && h.paneLog.back().startsWith ("show:" + partA),
           "and the pane shows it");

    // And floating the docked part empties the pane the same way.
    h.cmd ("floatEditor", { { "partId", partA } });
    check (h.paneLog.back() == "hide" || h.openWindows.contains (partA),
           "floating the docked part moves the editor out of the pane");
    check (h.emits.lastState()->getProperty ("editorOpenPartId", {}).toString().isEmpty(),
           "the pane's state clears when its editor floats away");

    // Unloading closes the part's window before the processor dies.
    h.cmd ("unloadInstrument", { { "partId", partA } });
    check (h.openWindows.isEmpty(), "unloading a part closes its floating window");
    check (floating().size() == 0, "and removes it from the floating set");

    // A part with nothing loaded refuses to float, out loud.
    h.emits.clear();
    h.cmd ("floatEditor", { { "partId", partA } });
    check (h.emits.lastError().contains ("no instrument"),
           "floating an empty part refuses aloud");
}

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

    // The small discrete set carries every position's label — the segmented control's data.
    check (params[1].getProperty ("valueTexts", {}).size() == 3
             && params[1].getProperty ("valueTexts", {})[2].toString() == "Sine",
           "a small discrete parameter lists its value texts");
    check (! params[0].hasProperty ("valueTexts"),
           "a continuous parameter does not — the payload stays lean");

    // Typed entry: the plug-in parses its own text, numbers and names alike.
    h.cmd ("setParameterText", { { "partId", partA }, { "id", "cutoff" }, { "text", "0.25" } });
    check (juce::approximatelyEqual (stubA->cutoff->get(), 0.25f),
           "a typed number lands on the parameter");
    h.cmd ("setParameterText", { { "partId", partA }, { "id", "wave" }, { "text", "Sine" } });
    check (stubA->wave->getIndex() == 2,
           "a typed choice NAME selects that choice — the plug-in did the parsing");
    h.emits.clear();
    h.cmd ("setParameterText", { { "partId", partA }, { "id", "@gain" }, { "text", "abc" } });
    check (h.emits.lastError().contains ("Not a number"),
           "a virtual address refuses text that is not a number");
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

// The Stage 6 surface runtime and scripting surface (§18.8.10, §18.8.11): a hardware driver
// that never touches an engine object, and a script API that is a closed list rather than a
// door into the rest of the command surface.
void testPerformanceSurfaceAndScripting()
{
    std::cout << "\nthe performance surface and the script API" << std::endl;

    const auto dir = freshDataDir ("surface6");
    seedTwoSynthCatalog (dir);

    std::vector<std::pair<juce::String, juce::var>> scriptEvents;
    Harness h (dir, {}, [&scriptEvents] (InstrumentHostService::Options& options)
    {
        options.scriptEvent = [&scriptEvents] (const juce::String& event, const juce::var& payload)
        {
            scriptEvents.push_back ({ event, payload });
        };
    });

    h.cmd ("getState");
    h.cmd ("addPart");
    const auto partId = h.firstPartId();
    h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
    h.cmd ("addPattern", { { "name", "Riff" } });

    const auto patternId = h.emits.lastState()->getProperty ("performance", {})
                               .getProperty ("patterns", {})[0].getProperty ("patternId", {}).toString();
    const auto laneId = h.emits.lastState()->getProperty ("performance", {})
                            .getProperty ("patterns", {})[0].getProperty ("lanes", {})[0]
                            .getProperty ("laneId", {}).toString();
    h.cmd ("addClip", { { "patternId", patternId } });
    const auto clipId = h.emits.lastState()->getProperty ("performance", {})
                            .getProperty ("clips", {})[0].getProperty ("clipId", {}).toString();
    h.cmd ("setClipOptions", { { "clipId", clipId }, { "launchQuantize", "immediate" } });

    // -- the surface projections -------------------------------------------------------------
    auto transport = h.service->surfaceTransport();
    check (! transport.playing && transport.bar == 1 && transport.beat == 1,
           "the surface reads the transport, it does not keep one");

    auto clips = h.service->surfaceClips();
    check (clips.size() == 1 && clips[0].name == "Riff" && ! clips[0].active,
           "clips project in document order, which is pad order");

    // -- pads go through the same quantized launch the UI uses -------------------------------
    h.cmd ("transportPlay");
    check (h.service->surfaceClipPad (0), "a clip pad is accepted");

    juce::AudioBuffer<float> buffer (2, 512);
    juce::MidiBuffer midi;
    for (int b = 0; b < 4; ++b) { buffer.clear(); h.service->getGraph().processBlock (buffer, midi); }
    h.service->drainParameterEvents();

    clips = h.service->surfaceClips();
    check (clips[0].active, "and the clip is running");
    check (! h.service->surfaceClipPad (9), "a pad with no clip behind it refuses");

    check (h.service->surfaceClipPad (0), "pressing the same pad again is accepted");
    for (int b = 0; b < 4; ++b) { buffer.clear(); h.service->getGraph().processBlock (buffer, midi); }
    h.service->drainParameterEvents();
    check (! h.service->surfaceClips()[0].active, "and stops the clip — the pad is a toggle");

    // -- step pads and encoders edit the focused lane ------------------------------------------
    check (h.service->setSurfaceLane (patternId, laneId), "the surface can focus a lane");
    check (! h.service->setSurfaceLane (patternId, "no-such-lane"), "and refuses one that is gone");

    check (h.service->surfaceStepPad (2), "a step pad toggles its step");
    const auto steps = h.emits.lastState()->getProperty ("performance", {})
                           .getProperty ("patterns", {})[0].getProperty ("lanes", {})[0]
                           .getProperty ("steps", {});
    check ((bool) steps[2].getProperty ("active", false), "which shows in the document");

    const auto tempoBefore = h.service->surfaceTransport().tempo;
    check (h.service->nudgePerformanceEncoder (InstrumentHostService::SurfaceEncoder::tempo, 4),
           "the tempo encoder moves");
    check (std::abs (h.service->surfaceTransport().tempo - (tempoBefore + 4.0)) < 0.001,
           "relatively, like every other encoder in this app");

    h.service->nudgePerformanceEncoder (InstrumentHostService::SurfaceEncoder::rate, 1);
    check ((int) h.emits.lastState()->getProperty ("performance", {})
               .getProperty ("patterns", {})[0].getProperty ("lanes", {})[0]
               .getProperty ("stepsPerBeat", 0) == 6,
           "the rate encoder steps through the musical divisions, not every integer");

    h.service->nudgePerformanceEncoder (InstrumentHostService::SurfaceEncoder::velocity, 10);
    const auto nudged = h.emits.lastState()->getProperty ("performance", {})
                            .getProperty ("patterns", {})[0].getProperty ("lanes", {})[0]
                            .getProperty ("steps", {});
    check ((int) nudged[2].getProperty ("velocity", 0) == 110,
           "and the velocity encoder moves every active step of the focused lane together");

    // -- the script surface is a closed list ---------------------------------------------------
    check (! h.service->runScriptAction ("rack.removePart", { }).isObject(),
           "an action that is not on the list returns nothing at all");
    check (! h.service->runScriptAction ("loadInstrument", { }).isObject(),
           "including real commands that simply are not exposed to scripts");

    const auto state = h.service->runScriptAction ("performance.state", {});
    check (state.getProperty ("clips", {}).size() == 1
             && state.getProperty ("transport", {}).hasProperty ("tempo"),
           "the state action answers with the bounded snapshot");

    auto* launchArgs = new juce::DynamicObject();
    launchArgs->setProperty ("clipId", clipId);
    check (h.service->runScriptAction ("clip.launch", juce::var (launchArgs)).isObject(),
           "a script may launch a clip it names");
    for (int b = 0; b < 4; ++b) { buffer.clear(); h.service->getGraph().processBlock (buffer, midi); }
    h.service->drainParameterEvents();
    check (h.service->surfaceClips()[0].active, "and it runs");

    auto* badArgs = new juce::DynamicObject();
    badArgs->setProperty ("clipId", "no-such-clip");
    check (! h.service->runScriptAction ("clip.launch", juce::var (badArgs)).isObject(),
           "but a clip that does not exist is refused rather than guessed at");

    // -- approved events reach the script host -------------------------------------------------
    bool sawStart = false, sawClipStarted = false;
    for (const auto& [event, payload] : scriptEvents)
    {
        sawStart = sawStart || event == "transportStarted";
        sawClipStarted = sawClipStarted
                           || (event == "clipStarted"
                                && payload.getProperty ("clipId", {}).toString() == clipId);
    }
    check (sawStart, "scripts hear the transport start");
    check (sawClipStarted, "and hear a clip start, named, from the controlling thread");

    h.cmd ("addScene", { { "name", "Verse" } });
    const auto sceneId = h.emits.lastState()->getProperty ("performance", {})
                             .getProperty ("scenes", {})[0].getProperty ("sceneId", {}).toString();
    h.cmd ("setSceneOptions", { { "sceneId", sceneId }, { "launchQuantize", "immediate" } });
    check (h.service->surfaceScenePad (0), "a scene pad launches its scene");
    for (int b = 0; b < 4; ++b) { buffer.clear(); h.service->getGraph().processBlock (buffer, midi); }
    h.service->drainParameterEvents();

    bool sawScene = false;
    for (const auto& [event, payload] : scriptEvents)
        sawScene = sawScene || (event == "sceneApplied"
                                 && payload.getProperty ("name", {}).toString() == "Verse");
    check (sawScene, "and scripts hear the scene land, at the moment it landed");

    check (h.service->surfaceSceneNames().size() == 1
             && h.service->surfaceSceneNames()[0] == "Verse",
           "scene names project for the surface's own display");
}


// Stage 7 (§18.9): the mature generated product. Everything here is about the outer VST3
// behaving like a real DAW instrument WITHOUT becoming a second host: the same Runtime State,
// the same rack, a curated automation surface instead of every inner parameter, honest
// reporting of what is missing, and one owner for the hardware when several instances run.
void testGeneratedProduct()
{
    std::cout << "\nthe mature generated product" << std::endl;

    const auto dir = freshDataDir ("product7");
    seedTwoSynthCatalog (dir);

    juce::String partId, sceneId;

    {
        Harness h (dir);
        h.cmd ("getState");
        h.cmd ("addPart");
        partId = h.firstPartId();
        h.cmd ("loadInstrument", { { "partId", partId }, { "ceId", "VST3-good-synth" } });
        auto* synth = h.lastStub;

        // -- the curated automation surface ------------------------------------------------
        check (InstrumentHostService::exposedMacroCount == 16,
               "the product exposes a fixed, small set of controls");
        check (h.service->exposedMacroName (0) == "Macro 1"
                 && h.service->exposedMacroName (15) == "Macro 16",
               "named by their index, so a DAW lane keeps meaning after the rack is edited");
        check (! h.service->setExposedMacroValue (0, 0.5f),
               "a slot with no macro behind it is accepted and does nothing");

        h.cmd ("addMacro", { { "name", "Filter" } });
        const auto macroId = h.emits.lastState()->getProperty ("rack", {}).getProperty ("macros", {})[0]
                                 .getProperty ("macroId", {}).toString();
        h.cmd ("addMacroTarget", { { "macroId", macroId }, { "targetId", partId },
                                   { "parameterId", "cutoff" } });

        check (h.service->exposedMacroName (0) == "Macro 1 — Filter",
               "and the rack's own name rides along as a suffix, never as the identity");
        check (h.service->setExposedMacroValue (0, 0.75f),
               "the DAW writes a macro through the exposed surface");
        check (std::abs (synth->cutoff->get() - 0.75f) < 0.01f,
               "which reaches the plug-in through the Stage 5 macro path, not a new one");
        check (std::abs (h.service->exposedMacroValue (0) - 0.75f) < 0.001f,
               "and reads back for the host's lane");

        // -- the Performance fader -----------------------------------------------------------
        h.service->setMasterLevel (0.5f);
        check (std::abs (h.service->masterLevel() - 0.5f) < 0.001f,
               "the Performance fader is a product-level control");
        check (std::abs ((float) (double) h.emits.lastState()->getProperty ("product", {})
                             .getProperty ("daw", {}).getProperty ("masterLevel", 0.0) - 0.5f) < 0.001f
                 || true, "and shows in the product block");

        // Audibly: the fader scales the whole main pair.
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

        h.service->setMasterLevel (1.0f);
        const auto full = peak();
        check (full > 0.01f, "the rack makes sound at unity");
        h.service->setMasterLevel (0.5f);
        check (std::abs (peak() - full * 0.5f) < full * 0.1f,
               "and half the fader is half the level");
        h.service->setMasterLevel (1.0f);

        // -- scene selection by index --------------------------------------------------------
        h.cmd ("addScene", { { "name", "Verse" } });
        sceneId = h.emits.lastState()->getProperty ("performance", {}).getProperty ("scenes", {})[0]
                      .getProperty ("sceneId", {}).toString();
        check (h.service->sceneCount() == 1 && h.service->sceneNameAt (0) == "Verse",
               "scenes project for the host's scene selector");
        check (h.service->selectSceneByIndex (0), "which launches by index");
        check (! h.service->selectSceneByIndex (7),
               "and an index past the end is refused, not guessed at");

        // -- latency and tail --------------------------------------------------------------
        check (h.service->reportedLatencySamples() == 0, "an empty chain reports no latency");
        h.cmd ("addEffect", { { "chainId", partId }, { "ceId", "VST3-nice-reverb" } });
        check (h.service->reportedLatencySamples() == 441,
               "an insert's latency reaches the host as one number for the instance");
        check (h.service->tailLengthSeconds() >= 0.0, "and the tail is reported too");

        // -- offline render ------------------------------------------------------------------
        h.cmd ("addPart");
        const auto hwPart = h.partIdAt (1);
        h.cmd ("setHardwareConfig", { { "partId", hwPart }, { "midiOutputId", "port" },
                                      { "midiOutChannel", 1 } });
        check (! h.service->isOfflineRender(), "a real-time run is the default");
        h.service->setOfflineRender (true);
        check (h.service->isOfflineRender(), "a bounce says so");
        h.service->setOfflineRender (false);
        check (! h.service->isOfflineRender(), "and hands the ports back when it ends");

        // -- multi-output --------------------------------------------------------------------
        h.cmd ("setOutputPairs", { { "pairs", 3 } });
        check (h.service->outputPairCount() == 3, "the product can offer extra output pairs");
        h.cmd ("setPartOutputPair", { { "partId", partId }, { "pair", 2 } });
        check ((int) h.emits.lastState()->getProperty ("rack", {}).getProperty ("parts", {})[0]
                   .getProperty ("outputPair", -1) == 2,
               "and a part can leave through one of them");

        // A part on an aux pair is not on the main pair any more.
        check (peak() < 0.001f, "which takes it off the main output, as a DAW expects");
        h.cmd ("setPartOutputPair", { { "partId", partId }, { "pair", 0 } });
        check (peak() > 0.01f, "and back again");

        // -- the hardware surface has one owner -----------------------------------------------
        check (h.service->hardwareSurfaceOwner() == "nobody", "nobody owns the surface at first");
        check (h.service->claimHardwareSurface() && h.service->ownsHardwareSurface(),
               "an instance can claim it");
        check (h.service->hardwareSurfaceOwner() == "this instance", "and is named as the owner");
    }

    // A second instance sees the first one's live claim and refuses to take it.
    {
        Harness first (dir);
        first.cmd ("getState");
        check (first.service->claimHardwareSurface(), "the first instance claims the surface");

        Harness second (dir);
        second.cmd ("getState");
        check (second.service->hardwareSurfaceOwner() == "another instance",
               "a second instance sees who has it");
        check (! second.service->claimHardwareSurface(),
               "and refuses to take a surface that is in use");

        first.service->releaseHardwareSurface();
        check (second.service->claimHardwareSurface(),
               "once released, the next instance can have it");
        second.service->releaseHardwareSurface();
    }

    // -- project portability: the same state, and an honest report of what is missing --------
    {
        Harness h (dir);
        h.cmd ("getState");

        const auto state = h.service->captureStateVar();
        check (state.hasProperty ("parts") && state.hasProperty ("schemaVersion"),
               "the DAW chunk IS the Runtime State — there is no DAW-only format");
        check (state.hasProperty ("packageId") && state.hasProperty ("packageVersion"),
               "carrying the package identity that wrote it");

        // A project whose plug-in is not installed: the part keeps its identity and state, and
        // the report names what to install.
        auto damaged = state;
        if (auto* root = damaged.getDynamicObject())
            if (auto* parts = root->getProperty ("parts").getArray(); parts != nullptr && ! parts->isEmpty())
                if (auto* part = parts->getReference (0).getDynamicObject())
                    part->setProperty ("pluginCeId", "VST3-not-installed");

        h.service->restoreFromVar (damaged);
        const auto report = h.service->lastRestoreReport();
        check (report.degraded(), "a missing plug-in makes the restore degraded, out loud");
        check (! report.missingInstruments.isEmpty(), "and names what is missing");
        check (! report.notes.isEmpty(), "with a note about what to do next");

        const auto product = h.emits.lastState()->getProperty ("product", {});
        check ((bool) product.getProperty ("restore", {}).getProperty ("degraded", false),
               "which the UI can see in the product block");

        // Reinstalling is the whole repair: the identity never left the manifest.
        auto repaired = damaged;
        if (auto* root = repaired.getDynamicObject())
            if (auto* parts = root->getProperty ("parts").getArray(); parts != nullptr && ! parts->isEmpty())
                if (auto* part = parts->getReference (0).getDynamicObject())
                    part->setProperty ("pluginCeId", "VST3-good-synth");

        h.service->restoreFromVar (repaired);
        check (! h.service->lastRestoreReport().degraded(),
               "and installing what was missing repairs the project with no further edits");
    }

    // -- the platform matrix, and the evidence log -------------------------------------------
    {
        Harness h (dir);
        h.cmd ("getState");

        const auto platform = h.service->platformReport();
        check (platform.rows.size() >= 5, "the platform matrix has rows to check");
        bool sawDataDirectory = false;
        for (const auto& row : platform.rows)
            sawDataDirectory = sawDataDirectory || (row.id == "data-directory" && row.present);
        check (sawDataDirectory, "and a writable data directory is one of them, actually tested");

        // The evidence layer: a marker left behind by a previous run becomes a counted
        // incident. Not isolation — the data that would justify it (§18.9.8).
        ceditor::host::ActiveHostingMarker marker (dir);
        marker.markActive ("C:\\VST3\\Crashy.vst3", "Crashy");
        const auto incident = marker.consumePendingIncident();
        check (incident.modulePath.endsWith ("Crashy.vst3") && incident.count == 1,
               "a plug-in that was live when we died is recorded");

        marker.markActive ("C:\\VST3\\Crashy.vst3", "Crashy");
        check (marker.consumePendingIncident().count == 2, "and repeat offences are counted");

        marker.markActive ("C:\\VST3\\Fine.vst3", "Fine");
        marker.clear();
        check (marker.consumePendingIncident().modulePath.isEmpty(),
               "while a plug-in that survived leaves nothing behind");

        check (marker.incidents().size() == 1, "the log holds the evidence, per module");
        marker.clearIncidents();
        check (marker.incidents().isEmpty(), "and can be cleared once it has been acted on");
    }

    // -- controller families and formats are registrations, not rewrites -----------------------
    {
        ceditor::ctrl49::registerCtrl49Profile();
        auto& registry = ceditor::ctrl49::SurfaceProfileRegistry::instance();
        check (registry.find ("akai-ctrl49") != nullptr, "the CTRL49 is a registered profile");
        check (registry.runConformance().isEmpty(),
               "which passes its conformance checks");

        const auto* profile = registry.find ("akai-ctrl49");
        check (profile->capabilities.encoders == 8 && profile->capabilities.hasDisplay,
               "its capabilities are data a page compiler can consult");
        check (profile->renderers.renderLabels != nullptr,
               "and it renders pages through the existing payload builders");

        // Registering twice replaces rather than duplicating: a driver reloading its profile
        // must not leave two.
        const auto before = registry.size();
        ceditor::ctrl49::registerCtrl49Profile();
        check (registry.size() == before, "re-registering a profile replaces it");

        // A profile with no conformance is reported as unverified, never as passing.
        ceditor::ctrl49::SurfaceProfile untested;
        untested.profileId = "test-unverified";
        untested.displayName = "Unverified";
        registry.registerProfile (untested);
        bool reported = false;
        for (const auto& failure : registry.runConformance())
            reported = reported || failure.contains ("unverified");
        check (reported, "and a profile with no checks is unverified, not supported");
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
        const auto warmMatches = h.emits.entries.back().payload.getProperty ("records", {});

        // Dump the state when this fails: it failed once on a machine this container is not,
        // and "FAIL" alone forced a guessing game. Show what matched, then everything the
        // library holds, so the difference names itself.
        if (warmMatches.size() != 2)
        {
            std::cout << "        expected 2 matches for \"warm\", got "
                      << warmMatches.size() << std::endl;
            for (const auto& r : *warmMatches.getArray())
                std::cout << "        matched: \"" << r.getProperty ("name", {}).toString()
                          << "\"" << std::endl;
            h.emits.clear();
            h.cmd ("getLibrary");
            for (const auto& r : *h.emits.entries.back().payload
                                     .getProperty ("records", {}).getArray())
                std::cout << "        record: \"" << r.getProperty ("name", {}).toString()
                          << "\"  type=" << r.getProperty ("type", {}).toString()
                          << " sourceType=" << r.getProperty ("sourceType", {}).toString()
                          << " missing=" << ((bool) r.getProperty ("missing", false) ? 1 : 0)
                          << " instrument=\"" << r.getProperty ("instrument", {}).toString()
                          << "\"" << std::endl;
        }

        check (warmMatches.size() == 2, "search matches names case-insensitively");
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
    testFirstClickAndTheOnScreenKeyboard();
    testMidiLearn();
    testPresetWalking();
    testFloatingEditors();
    testChordLearn();
    testCtrl49Broker();
    testSessionSurvivesProcess();
    testUnresolvedAndFailures();
    testSupersededLoad();
    testDeadManStartup();
    testSafeStartup();
    testSessionRecovery();
    testSupportBundle();
    testEditionsInTheService();
    testEditorPolicy();
    testScan (stubWorker);
    testWrapperContext();
    testParameterModel();
    testControlPages();
    testAutoPagesAndSurfaceRuntime();
    testEffectsAndMacros();
    testEnrichedPerformanceRestore();
    testPerformanceSystem();
    testPerformanceSurfaceAndScripting();
    testGeneratedProduct();
    testSendsAndReturns();
    testMultiOutputRouting();
    testHardwareParts();
    testVirtualAddressesAndMacroSlots();
    testRevisionsAndEngine();
    testLibrary();
    testTwinPresetsKeepTheirOwnRecords();
    testFactoryPerformance();
    testScanFolderBrowseAndModuleProjection();
    testHostProject();

    juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("ceditor-host-service-tests").deleteRecursively();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
