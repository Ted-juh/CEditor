#pragma once

#include <mutex>
#include <thread>
#include "PluginScannerCoordinator.h"
#include "InstrumentRackHost.h"

// InstrumentHostService — the instrument host behind one bridge event (VIP-successor Stage 1).
//
// The WebView drives the host through a single "instrumentHost" listener whose payload carries
// `cmd` plus arguments, and hears back through emitted events. This class is that whole
// surface, deliberately OUTSIDE ValueTreeBridgeHandlers.cpp: the handlers file compiles only
// with WebView2 on the app targets, while everything that can go wrong here — command
// dispatch, the load transaction, session persistence, scan orchestration — is provable by a
// plain test executable on any machine. The app glue shrinks to one listener, one emit
// marshaller and one real instantiator.
//
// EVENTS OUT (via Options::emit — MAY BE CALLED FROM THE SCAN THREAD; the app glue marshals
// to the message thread, tests just collect):
//   instrumentHostState         the full state snapshot, after every mutation
//   instrumentHostScanProgress  { line } while a scan runs
//   instrumentHostError         { message } for refused or failed commands
//
// COMMANDS IN (handleCommand payload.cmd):
//   getState                                     (first call restores the saved session)
//   scan | addScanPath {path} | removeScanPath {path} | clearQuarantine {modulePath}
//   addPart | removePart {partId} | movePart {partId,index} | focusPart {partId}
//   setPartMidiRules {partId, channel,keyLow,keyHigh,velocityLow,velocityHigh,transpose}
//   setPartMixer {partId, enabled?,mute?,solo?,volume?,pan?}    (absent fields untouched)
//   loadInstrument {partId, ceId} | unloadInstrument {partId} | panic {partId?}
//
// THE INSTANTIATOR is injected because it is the one piece that genuinely needs a real
// plug-in format: the app passes AudioPluginFormatManager::createPluginInstanceAsync over the
// catalogue's stored PluginDescription XML; tests pass a factory of stub processors. Its
// callback may arrive asynchronously (the message thread, in the app); the commit then runs
// through the rack host's generation ticket, so a part removed or re-targeted in the meantime
// refuses the stale arrival instead of activating it.
//
// PERSISTENCE lives in one per-user directory (Options::dataDirectory): the plug-in catalogue,
// the scanner's dead-man marker, the scan paths, and the session's Performance — saved after
// every rack mutation, so a crash costs keystrokes, not the rig. A leftover dead-man marker
// quarantines the module it names before anything else loads (safe startup, baseline §17.1).
// This directory is machine-level runtime data beside the catalogue, not app UI preference —
// which is why it is here and not in AppSettings.
//
// THREADING. Commands arrive on one controlling thread (the message thread in the app). A
// scan runs through Options::scanExecutor — the app passes a background-thread launcher (the
// default here), tests pass an inline executor. One scan at a time; the destructor asks a
// running scan to stop (checked between modules) and joins it.

namespace ceditor::host
{

class InstrumentHostService
{
public:
    using InstantiateCallback = std::function<void (std::unique_ptr<juce::AudioProcessor>,
                                                    const juce::String& error)>;

    struct Options
    {
        juce::File dataDirectory;
        juce::File workerExecutable;
        std::function<void (const juce::String& eventName, const juce::var& payload)> emit;
        std::function<void (const juce::String& descriptionXml, double sampleRate, int blockSize,
                            InstantiateCallback)> instantiate;
        // Runs the scan body. Default (nullptr) = the service's own background thread;
        // tests pass [] (auto fn) { fn(); } to run inline.
        std::function<void (std::function<void()>)> scanExecutor;
        double sampleRate = 44100.0;
        int blockSize = 512;
    };

    explicit InstrumentHostService (Options optionsToUse);
    ~InstrumentHostService();

    /** Dispatches one command payload ({ cmd, ... }). Unknown commands emit
        instrumentHostError rather than throwing or silently vanishing. */
    void handleCommand (const juce::var& payload);

    /** Loads the catalogue and saved session from the data directory, quarantines any module
        a leftover dead-man marker names, rebuilds the rack and asks the instantiator for
        every resolved part's instrument. Runs once — getState calls it lazily so plug-in
        code only ever loads after the UI is up and asking. */
    void restoreSession();

    const InstrumentRackHost& getRackHost() const     { return rack; }
    bool isScanning() const                           { return scanBusy.load(); }

private:
    struct ClassInfoForCommit
    {
        juce::String ceId, modulePath, name, vendor;
    };

    void emitState();
    void emitError (const juce::String& message);
    juce::var buildStatePayload() const;
    static juce::var scanProgressPayload (const juce::String& line, bool done);

    void runScanNow();
    void requestInstrument (const juce::String& partId, const juce::String& ceId);

    /** Caller holds catalogLock. */
    const PluginClassRecord* findClass (const juce::String& ceId,
                                        const ModuleRecord** moduleOut = nullptr) const;

    void savePerformance();
    void saveScanPaths();

    juce::File catalogFile() const      { return options.dataDirectory.getChildFile ("plugin-catalog.json"); }
    juce::File performanceFile() const  { return options.dataDirectory.getChildFile ("session-performance.json"); }
    juce::File scanPathsFile() const    { return options.dataDirectory.getChildFile ("scan-paths.json"); }

    Options options;
    PluginCatalog catalog;
    // Guards `catalog` only: a scan mutates a copy on its own thread and swaps it in under
    // this lock, so controlling-thread commands never block behind a module's scan timeout.
    // The rack is controlling-thread-only and needs no lock (its audio-thread story lives in
    // the per-part processors' atomics).
    mutable std::mutex catalogLock;
    InstrumentRackHost rack;
    juce::StringArray userScanPaths;
    bool sessionRestored = false;

    // Cleared in the destructor so an asynchronous instantiate callback that outlives this
    // service returns without touching a corpse — ValueTreeBridge.h documents the pattern.
    std::shared_ptr<std::atomic<bool>> alive { std::make_shared<std::atomic<bool>> (true) };

    std::thread scanThread;
    std::atomic<bool> scanBusy { false };
    std::atomic<bool> stopRequested { false };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (InstrumentHostService)
};

} // namespace ceditor::host
