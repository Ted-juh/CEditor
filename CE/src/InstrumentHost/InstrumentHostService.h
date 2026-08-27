#pragma once

#include <mutex>
#include <thread>
#include <juce_audio_utils/juce_audio_utils.h>
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
//   scan | addScanPath {path} | removeScanPath {path} | browseScanPath | clearQuarantine {modulePath}
//     (browseScanPath opens the native directory picker through Options::pickDirectory and
//      adds whatever the user chose; cancelling chooses nothing and changes nothing)
//   addPart | removePart {partId} | movePart {partId,index} | focusPart {partId}
//   setPartMidiRules {partId, channel,keyLow,keyHigh,velocityLow,velocityHigh,transpose}
//   setPartMixer {partId, enabled?,mute?,solo?,volume?,pan?}    (absent fields untouched)
//   loadInstrument {partId, ceId} | unloadInstrument {partId} | panic {partId?}
//   openEditor {partId} | closeEditor
//   getAudioDevices | setAudioDevice {name} | setMidiInputEnabled {id, enabled}
//     (getAudioDevices answers with instrumentHostAudioDevices — enumeration can touch
//      drivers, so it runs on demand rather than inside every state push)
//   getHostProject | setHostProject {productName?,version?,publisher?,includeStandalone?,
//     includeVst3?} | buildHostProduct {outputDirectory?}
//     (both project commands answer with instrumentHostProject; the appId is minted once and
//      never writable from the page — installer identity survives every rename. Building goes
//      through Options::runBuild; without the hook the command refuses aloud.)
//
// THE EDITOR PANE is presentation the service commands but does not own: Options::editorPane
// carries show/hide hooks into the native PluginEditorHost (stubs in tests). The service owns
// the POLICY — one editor, following the focused part; hidden before its processor dies (via
// the rack's onInstrumentWillBeRemoved); re-shown across a same-part replacement; close is
// never unload. The pane object must outlive this service or be unhooked first; in the app
// the pane is destroyed before the bridge that owns this service, which also guarantees any
// last editor dies before the rack's processors do.
//
// AUDIO (Options::enableAudio) makes the editor the Preview Runtime in the simplest honest
// form: default output device, every MIDI input enabled, AudioProcessorPlayer driving the
// rack's graph. Explicit device selection is a later step; the state payload reports what is
// actually open so the UI never pretends.
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

    struct EditorPaneHooks
    {
        std::function<void (const juce::String& partId, juce::AudioProcessor& processor,
                            const juce::String& title)> show;
        std::function<void()> hide;
    };

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
        // Launches the Host Project build pipeline (the app streams a node child process;
        // tests capture the call). Absent = building is not available in this build, and
        // buildHostProduct says so instead of doing nothing.
        std::function<void (const juce::var& project, const juce::String& outputDirectory)> runBuild;
        // Opens the native directory picker and calls back with the chosen path — empty for
        // cancel. The app provides an async FileChooser; absent (tests, plain browser) makes
        // browseScanPath refuse aloud rather than silently do nothing.
        std::function<void (std::function<void (const juce::String& directory)>)> pickDirectory;
        EditorPaneHooks editorPane;
        bool enableAudio = false;
        // The editor and the standalone persist the rack session to dataDirectory after every
        // mutation; the outer VST3 sets this false because the DAW owns the session through
        // get/setStateInformation — a host file would fight the project file over the truth.
        bool persistSession = true;
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

    // -- wrapper-context API --------------------------------------------------------------
    // The generated targets drive the service beside the bridge, not through it. The
    // standalone shell only needs enableAudio; the outer VST3 needs all of this: the DAW
    // owns audio (delegate processBlock to the graph), owns the session (capture/restore a
    // var through the plug-in state chunk), and opens/closes the editor window at will
    // (detach and reassert the pane).

    /** The rack's graph, for the plug-in wrapper's processBlock delegation. */
    juce::AudioProcessorGraph& getGraph()             { return rack.getGraph(); }

    /** The plug-in wrapper's prepareToPlay: adopt the host's rate and block size and
        (re)prepare the graph. Safe to call repeatedly; later instantiations use the new
        values too. */
    void prepareRuntime (double sampleRate, int blockSize);

    /** The plug-in wrapper's releaseResources. */
    void releaseRuntime();

    /** The whole rack session as a var, for getStateInformation. */
    juce::var captureStateVar();

    /** Replaces the rack from a var captureStateVar produced — setStateInformation. Restores
        the catalogue first if it has not loaded yet, so part ceIds can resolve; a var that
        does not parse keeps the current rack rather than tearing it down. */
    void restoreFromVar (const juce::var& state);

    /** Swaps the editor-pane hooks. The plug-in's editor component owns the real pane and
        comes and goes at the DAW's pleasure: it attaches on construction and detaches (empty
        hooks) on destruction. The service keeps its editor intent across the gap. */
    void setEditorPaneHooks (EditorPaneHooks hooks);

    /** Re-shows the intended part's editor into a freshly attached pane — the DAW reopened
        the plug-in window and the pane is new, but which editor was open is service state
        and survived. */
    void reassertEditorPane();

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
    void ensureHostProject();
    void emitHostProject();
    void requestInstrument (const juce::String& partId, const juce::String& ceId);
    void showEditorFor (const juce::String& partId);
    void hideEditor();
    void startAudio();
    void stopAudio();
    void emitAudioDevices();

    /** Caller holds catalogLock. */
    const PluginClassRecord* findClass (const juce::String& ceId,
                                        const ModuleRecord** moduleOut = nullptr) const;

    void savePerformance();
    void saveScanPaths();

    juce::File catalogFile() const      { return options.dataDirectory.getChildFile ("plugin-catalog.json"); }
    juce::File performanceFile() const  { return options.dataDirectory.getChildFile ("session-performance.json"); }
    juce::File scanPathsFile() const    { return options.dataDirectory.getChildFile ("scan-paths.json"); }
    juce::File hostProjectFile() const  { return options.dataDirectory.getChildFile ("host-project.json"); }

    Options options;
    PluginCatalog catalog;
    // Guards `catalog` only: a scan mutates a copy on its own thread and swaps it in under
    // this lock, so controlling-thread commands never block behind a module's scan timeout.
    // The rack is controlling-thread-only and needs no lock (its audio-thread story lives in
    // the per-part processors' atomics).
    mutable std::mutex catalogLock;
    InstrumentRackHost rack;
    juce::StringArray userScanPaths;
    juce::String editorPartId;      // the part whose editor the pane is showing, or empty
    bool sessionRestored = false;
    juce::var hostProject;          // the Host Project manifest; loaded/minted on first ask
    bool hostProjectLoaded = false;

    // Declared after the rack so destruction stops them first; stopAudio() in the destructor
    // detaches the callbacks before the graph they drive goes down.
    juce::AudioDeviceManager deviceManager;
    juce::AudioProcessorPlayer player;
    bool audioRunning = false;

    // Cleared in the destructor so an asynchronous instantiate callback that outlives this
    // service returns without touching a corpse — ValueTreeBridge.h documents the pattern.
    std::shared_ptr<std::atomic<bool>> alive { std::make_shared<std::atomic<bool>> (true) };

    std::thread scanThread;
    std::atomic<bool> scanBusy { false };
    std::atomic<bool> stopRequested { false };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (InstrumentHostService)
};

} // namespace ceditor::host
