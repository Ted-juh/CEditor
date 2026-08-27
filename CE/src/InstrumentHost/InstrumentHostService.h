#pragma once

#include <map>
#include <mutex>
#include <thread>
#include <juce_audio_utils/juce_audio_utils.h>
#include "PluginScannerCoordinator.h"
#include "InstrumentRackHost.h"
#include "ParameterModel.h"
#include "Library.h"
#include "PlatformMatrix.h"
#include "ActiveHostingMarker.h"
#include "SafeMode.h"
#include "SessionRecovery.h"
#include "SupportBundle.h"
#include "Licensing/LicenceStore.h"
#include "ControlSurface/SurfaceProfile.h"

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
//   getParameters {partId} | setParameter {partId,id,value} | resetParameter {partId,id}
//   beginParameterGesture {partId,id} | endParameterGesture {partId,id}
//     (the Stage 2 parameter model: getParameters answers with instrumentHostParameters —
//      the part's full registry with live values; vendor-editor edits arrive as coalesced
//      instrumentHostParamValues deltas whenever the owner pumps drainParameterEvents().
//      Addresses are partId + the plug-in's own parameter ID, never display names; a wrong
//      part or unknown ID refuses instead of writing to an arbitrary index.)
//   addControlPage {name?} | removeControlPage {pageId} | renameControlPage {pageId,name}
//   generateControlPages {partId}   (the automatic first pass over the part's registry;
//     replaces only that part's previously generated pages, never a user-authored one)
//   getLibrary {query?,type?} | scanLibrary | addLibraryPath {path} | removeLibraryPath {path}
//   browseLibraryPath | saveUserPreset {partId,name?,category?} | saveRackToLibrary {name?}
//   setLibraryUserMetadata {recordId, favourite?,rating?,notes?,tags?,collections?}
//   removeLibraryRecord {recordId} | loadLibraryRecord {recordId, action, partId?}
//     (the Stage 4 library: getLibrary answers with instrumentHostLibrary — records
//      projected with live availability. Loading goes through Stage 1's one transaction:
//      action is "focused", "replace" (with partId) or "add"; a vendor .vstpreset applies
//      through Options::applyVstPreset after the normal commit; a rack record restores
//      through the same path the session file uses, degraded-but-loud when classes are
//      missing. Vendor rescans never touch favourites, notes or captured records.)
//   addEffect {chainId,ceId} | removeEffect {effectId} | moveEffect {effectId,index}
//   setEffectBypassed {effectId,bypassed} | openEffectEditor {effectId}
//     (Stage 5 insert chains: chainId is a partId or "master". Effects load through the same
//      prime/begin/commit transaction as instruments, show in the same editor pane, register
//      in the same parameter model — their targetId is the effectId wherever a partId is
//      accepted: getParameters, setParameter, page-slot and macro assignment.)
//   addMacro {name?} | removeMacro {macroId} | renameMacro {macroId,name}
//   setMacroValue {macroId,value,final?} | addMacroTarget {macroId,targetId,parameterId}
//   removeMacroTarget {macroId,targetId,parameterId}
//   setMacroTargetOptions {macroId,targetId,parameterId, rangeMin?,rangeMax?,inverted?}
//     (a macro fans one 0..1 value into several parameter addresses through the SAME write
//      path as everything else — mapped per target, gesture-wrapped, unresolved targets
//      skipped and shown. `final:true` persists and re-announces state; drags without it
//      stay cheap.)
//   addReturn {name?} | removeReturn {returnId} | renameReturn {returnId,name}
//   setReturnLevel {returnId,level} | setSendLevel {partId,returnId,level}
//     (Stage 5 shared buses: each return is one more effect chain — addEffect and the whole
//      effect transaction take a returnId as the chainId — fed by post-fader sends from any
//      part and rejoining ahead of the master inserts.)
//   setExtraOut {partId,pairIndex,gain} | removeExtraOut {partId,pairIndex}
//     (explicit multi-output routing: an instrument's extra stereo pair gets its own gain
//      into the master path; the main pair keeps the inserts and the fader.)
//   setHardwareConfig {partId, midiOutputId?,midiOutputName?,midiOutChannel?,
//     audioReturnChannel?,audioReturnStereo?,programBank?,programNumber?,deviceProfileId?}
//   clearHardware {partId} | sendHardwareProgram {partId}
//     (hardware-instrument parts, §18.7.6: the part reaches an external synth over the named
//      MIDI output — opened through Options::openMidiOutput, port failures reported per part
//      in state — and can return audio through the interface's inputs, where it runs the
//      part's own inserts, fader and sends. Absent config fields keep their value.)
//
//   -- the Stage 6 performance system (§18.8) --
//   transportPlay | transportStop | transportContinue | setTempo {tempo}
//   setTimeSignature {numerator,denominator} | setTransportPosition {ppq}
//   setExternalClock {enabled}
//     (one transport for everything: the sequencer, the arpeggiators and the hardware
//      display all read it, and nothing else schedules musical events.)
//   addPattern {name?} | removePattern {patternId} | renamePattern {patternId,name}
//   setPatternOptions {patternId, swing?, seed?}
//   addLane {patternId, type?, targetPartId?} | removeLane {patternId,laneId}
//   setLaneOptions {patternId,laneId, name?,targetPartId?,targetId?,parameterId?,channel?,
//     ccNumber?,drumNote?,stepCount?,stepsPerBeat?,muted?,glide?}
//   euclidFill {patternId,laneId,pulses,rotation?} | clearLane {patternId,laneId}
//   setStep {patternId,laneId,index, active?,note?,velocity?,value?,gate?,microtiming?,
//     probability?,ratchets?,tie?,every?,offset?,chord?}
//   toggleStep {patternId,laneId,index}
//     (one Pattern object with typed lanes — note, chord, drum, cc and parameter — each with
//      its own length and rate, which is polymeter without a special case.)
//   addClip {patternId,name?} | removeClip {clipId}
//   setClipOptions {clipId, name?,launchQuantize?,loop?,followClipId?,followAfterLoops?}
//   launchClip {clipId} | stopClip {clipId} | stopAllClips
//   armCapture {clipId,laneId} | disarmCapture
//     (capture snaps played notes to the armed lane's grid and writes them into the pattern
//      on this thread — the audio thread only ever reports what it heard.)
//   addScene {name?} | removeScene {sceneId} | renameScene {sceneId,name}
//   captureScene {sceneId} | setSceneOptions {sceneId, launchQuantize?,stopOtherClips?,tempo?}
//   setSceneClip {sceneId,clipId,included} | launchScene {sceneId}
//     (a scene recalls clips, slot states, macros, focus and page through the SAME rack and
//      parameter systems built earlier — it is not a second snapshot engine. captureScene
//      takes the current rig as the scene's content.)
//   addSetlistItem {sceneId?,name?} | removeSetlistItem {itemId}
//   setSetlistItem {itemId, name?,notes?,tempo?,sceneId?} | moveSetlistItem {itemId,index}
//   setlistGo {index} | setlistNext | setlistPrev
//     (navigation recalls the item's scene; a scene that cannot be recalled leaves the rig on
//      the last stable item and says so rather than half-loading.)
//   setPartArp {partId, enabled?,mode?,stepsPerBeat?,gate?,swing?,octaves?,latch?,
//     constrainToScale?,velocityPattern?}
//   setPartMidiFx {partId, transpose?,constrainToScale?,scaleRoot?,scaleType?,chord?,
//     velocityFixed?,velocityScale?}
//     (both are modes over the shared transport, applied in the part's own event chain.)
//
// VIRTUAL PARAMETER ADDRESSES (Stage 5). A parameterId starting with '@' resolves against
// the rack's own state instead of a plug-in registry: "@gain" and "@pan" on any part,
// "@send:<returnId>" for that part's send level, "@macro" with the macroId as the target id.
// They work everywhere a plug-in parameter does — setParameter, page slots, macro targets
// (except "@macro" itself: a macro may not target a macro), surface nudges — so hardware
// encoders drive faders, sends and whole macros through the same binding math. Their writes
// persist and re-announce state, because the value lives in the manifest, not a plug-in.
//   assignControlSlot {pageId,slotId,partId,parameterId} | clearControlSlot {pageId,slotId}
//   setControlSlotOptions {pageId,slotId, rangeMin?,rangeMax?,inverted?,bipolar?,label?}
//   setControlSlotValue {pageId,slotId,value}
//     (neutral pages over parameter addresses — no hardware bytes. Assignment captures the
//      part's class identity; a part that later loads a different class shows the slot
//      unresolved in state rather than driving whatever answers to the same id, and
//      setControlSlotValue refuses an unresolved slot. Values map through the binding's
//      range/inversion so hardware and UI share one transform.)
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
        // Applies a vendor .vstpreset file to a live instrument. The app passes JUCE's own
        // VST3 preset loader (it re-validates the class id internally); tests stub it.
        // Absent = vendor preset records refuse to load, aloud.
        std::function<bool (juce::AudioProcessor&, const juce::File& presetFile)> applyVstPreset;
        // Hardware-part MIDI (Stage 5). Absent = the service talks to the real system
        // devices (juce::MidiOutput); tests inject an id→name map and capture sinks.
        // openMidiOutput returns the sink that will receive the part's MIDI, or nullptr
        // with `errorOut` set.
        // Approved performance events for scripts (§18.8.11): transportStarted/Stopped,
        // clipStarted/clipStopped, sceneApplied, setlistChanged. Called on the controlling
        // thread only — a script never runs anywhere near the scheduler.
        std::function<void (const juce::String& event, const juce::var& payload)> scriptEvent;
        std::function<juce::StringPairArray()> listMidiOutputs;
        std::function<MidiSendProcessor::Sink (const juce::String& deviceId,
                                               juce::String& errorOut)> openMidiOutput;
        EditorPaneHooks editorPane;
        // The Host Project's authored rack, shipped beside the generated binaries. Loaded
        // when nothing newer exists: the standalone uses it until the user has a session of
        // their own; the outer VST3 uses it for a fresh instance until the DAW hands over a
        // project chunk. Never written to — the product's factory state is read-only.
        juce::File factoryPerformanceFile;
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
        every resolved part's instrument. Falls back to Options::factoryPerformanceFile when
        no user session exists. Runs once — getState calls it lazily so plug-in code only
        ever loads after the UI is up and asking. */
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
        values too. `numInputChannels` feeds hardware parts' audio returns — the outer VST3
        passes none, tests pass what their buffers carry. */
    void prepareRuntime (double sampleRate, int blockSize, int numInputChannels = 0);

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

    // -- surface runtime API (Stage 3) ------------------------------------------------------
    // What a hardware bridge needs from the parameter model and nothing else: a display
    // projection per page, and a relative nudge per slot. The driver never touches plug-in
    // objects (baseline §18.5.1) — it consumes these views and emits normalized movements,
    // and both sides go through the same binding resolution as every other path, so an
    // unresolved slot renders as such and refuses to move anything.

    struct SurfaceSlot
    {
        juce::String slotId;
        juce::String displayName;   // label override, else the parameter's live name, else the id
        juce::String valueText;     // the plug-in's own formatted value — never a second numeric guess
        float position = 0.0f;      // 0..1 slot position, the binding's range/inversion inverse-mapped
        bool assigned = false;
        bool resolved = false;
    };

    /** The display projection for one page — empty for an unknown pageId. */
    juce::Array<SurfaceSlot> surfaceSlots (const juce::String& pageId) const;

    /** Relative encoder movement: moves the slot's position by delta/127 through the
        binding's range and inversion, wrapped in a begin/end gesture. Relative behavior is
        what makes page and Performance changes jump-free — there is no stale absolute
        position to snap to. Returns false, moving nothing, for an unknown, unassigned or
        unresolved slot. */
    bool nudgeControlSlot (const juce::String& pageId, const juce::String& slotId, int delta);

    // -- the Stage 6 performance system ------------------------------------------------------

    /** Recompiles the patterns and clips and publishes them to the engine. Called after any
        edit that changes what would play — a pattern, a clip, the part roster, or a plug-in
        load that makes an automation target resolvable again. */
    void recompilePerformance();

    perf::PerformanceEngine& getEngine()              { return rack.getEngine(); }

    /** Launches a scene by id: its clips through the engine's quantized launch, the rest of
        it (slots, macros, focus, page, tempo) when the launch actually lands. Returns false
        for an unknown scene. */
    bool launchScene (const juce::String& sceneId);

    /** Recalls setlist item `index`, or the next/previous one. A scene that cannot be
        recalled leaves the rig where it was and reports why (§18.8.9). */
    bool goToSetlistItem (int index);

    // -- the performance surface runtime (Stage 6, §18.8.10) ---------------------------------
    // Stage 3's rule again: the hardware driver never touches an engine object. It reads
    // these projections and sends these movements, and both go through the same code the UI
    // does. Polling here is deliberately the caller's business — the surface refreshes at
    // whatever rate it can stand, entirely apart from musical scheduling.

    struct SurfaceTransport
    {
        bool playing = false;
        double tempo = 120.0;
        int bar = 1;
        int beat = 1;
        bool externalClock = false;
        bool clockLost = false;
    };

    struct SurfaceClip
    {
        juce::String clipId;
        juce::String name;
        bool active = false;
        bool pending = false;
        float phase = 0.0f;
    };

    SurfaceTransport surfaceTransport() const;
    /** Clips in document order — which is pad order, so pad N is clip N and stays clip N. */
    juce::Array<SurfaceClip> surfaceClips() const;
    juce::StringArray surfaceSceneNames() const;

    /** A pad press on the clip bank: launches an idle clip, stops a running one. */
    bool surfaceClipPad (int padIndex);
    /** A pad press on the scene bank. */
    bool surfaceScenePad (int padIndex);
    /** A pad press on the step bank: toggles that step of the surface-focused lane, which is
        step triggering without a second editing model. */
    bool surfaceStepPad (int padIndex);
    /** Which lane the surface's encoders and step pads address. */
    bool setSurfaceLane (const juce::String& patternId, const juce::String& laneId);

    enum class SurfaceEncoder { tempo = 0, swing, gate, rate, length, probability, velocity };

    /** A relative encoder movement on the performance page. Returns false when there is
        nothing focused for that encoder to move. */
    bool nudgePerformanceEncoder (SurfaceEncoder encoder, int delta);

    // -- the scripting surface (Stage 6, §18.8.11) -------------------------------------------
    // Scripts observe approved events and call a bounded set of actions. They never see the
    // engine, never run on the audio thread, and cannot reach anything not named here — the
    // baseline's "bounded APIs" made literal.

    /** Runs one approved action. Returns an empty var for an unknown or refused action, so a
        script cannot discover the rest of the command surface by probing. */
    juce::var runScriptAction (const juce::String& action, const juce::var& payload);

    /** A read-only snapshot for scripts: transport, clips, scenes and the setlist position. */
    juce::var scriptPerformanceState() const;

    // -- the generated product's DAW surface (Stage 7, §18.9.3) ------------------------------
    // The curated automation set, deliberately small and deliberately INDEX-STABLE: macro
    // slot N is DAW parameter N whether or not a macro exists there yet, so a project's
    // automation lane still means the same thing after the rack is edited. Exposing every
    // inner plug-in parameter instead would make a DAW project unmanageable and would break
    // the moment an instrument was swapped — which is exactly what the baseline forbids.

    static constexpr int exposedMacroCount = 16;

    float exposedMacroValue (int index) const;
    /** Writes one exposed macro through the Stage 5 macro path (its targets, its ranges).
        An index with no macro behind it is accepted and does nothing — the parameter still
        exists, because a stable surface is the point. */
    bool setExposedMacroValue (int index, float value);
    juce::String exposedMacroName (int index) const;

    int sceneCount() const;
    juce::String sceneNameAt (int index) const;
    /** Launches scene `index`; -1 (or an unknown index) is "no scene", not an error. */
    bool selectSceneByIndex (int index);
    int selectedSceneIndex() const;

    float masterLevel() const;
    void setMasterLevel (float level);

    /** What the DAW should be told about this instance: the worst-case chain latency in
        samples, and the longest tail anything loaded claims. */
    int reportedLatencySamples() const;
    double tailLengthSeconds() const;

    /** How many stereo output buses the product renders (§18.9.3 multi-output). */
    int outputPairCount() const;

    // -- project portability and recovery (Stage 7, §18.9.4) ---------------------------------
    // A DAW instance uses the SAME Runtime State schema as the standalone — there is no
    // DAW-only Performance format — and carries the identity and compatibility data a project
    // needs to be reopened somewhere else and either work or say exactly why not.

    /** What a restore could not resolve, kept until the next successful one. A project opened
        on a machine missing a plug-in reports it here rather than quietly dropping the part:
        the identity and state blob stay in the manifest, so installing the plug-in and
        reopening the project is the whole repair (§18.9.3 "missing-content recovery"). */
    struct RestoreReport
    {
        juce::StringArray missingInstruments;   // display names, or ceIds when that is all we have
        juce::StringArray missingEffects;
        juce::StringArray notes;                // anything else worth saying out loud
        bool degraded() const { return ! missingInstruments.isEmpty() || ! missingEffects.isEmpty(); }
    };

    /** Computed live from what the rack could and could not resolve — always current, and
        therefore never a stale claim about a repair that has since happened. */
    RestoreReport lastRestoreReport() const;

    // -- multi-instance arbitration (Stage 7, §18.9.3) ---------------------------------------
    // Several outer-VST3 instances (and the standalone) share one per-user data directory, so
    // two things need an owner: the hardware surface, which is a physical device only one
    // instance can drive, and the catalogue, which is a file two scanners must not interleave.

    /** True when this instance currently owns the hardware surface. */
    bool ownsHardwareSurface() const;
    /** Claims the surface for this instance, taking it from an instance whose heartbeat has
        gone stale. Returns false when another live instance holds it. */
    bool claimHardwareSurface();
    void releaseHardwareSurface();
    /** A human-readable owner for the UI ("this instance", "another instance", "nobody"). */
    juce::String hardwareSurfaceOwner() const;

    // -- platform support and active-hosting evidence (Stage 7, §18.9.7, §18.9.8) -------------

    /** The compatibility matrix, run on this machine. "It compiles" is not support. */
    PlatformReport platformReport() const;

    /** Incidents where a plug-in was live when the process died — the field data §18.9.8
        requires before anyone builds active isolation. Not isolation itself, on purpose. */
    juce::Array<ActiveHostingMarker::Incident> activeHostingIncidents() const;

    // -- safe startup (§17.1, §18.3.3) --------------------------------------------------------
    // The other half of the marker Stage 7 wrote. A plug-in that was live when the process
    // died does not load again on the next start; the part keeps its identity and state and
    // reports itself degraded, exactly as a missing plug-in already does.

    SafeMode::Level safeModeLevel() const;
    /** Levels are sticky. Raising to noThirdParty takes effect at the next restore; dropping
        to normal does not resurrect the parts this run refused — reopening the project does,
        which is the same repair a newly installed plug-in needs. */
    void setSafeModeLevel (SafeMode::Level level);
    juce::Array<SafeMode::Suspect> safeModeSuspects() const;
    /** The user vouches for a module: it loads again from the next restore. */
    void clearSafeModeSuspect (const juce::String& modulePath);
    void clearAllSafeModeSuspects();
    /** Why this module will not be loaded on this run, or empty when it will be. */
    juce::String safeModeRefusal (const juce::String& modulePath) const;

    // -- session recovery (§17.3) --------------------------------------------------------------

    /** What the last run was doing when it stopped, and what there is to go back to. */
    SessionRecovery::Report recoveryReport() const;
    /** The user has read it; the standing last-known-good offer survives. */
    void acknowledgeRecoveryReport();
    /** Replaces the live session with the last state this product is known to have run
        cleanly, and restores the rack from it. Returns false when there is none. */
    bool restoreLastKnownGood();
    /** Parts and effect slots whose stored state no longer matches the digest saved with it.
        Never emptied by loading: a damaged blob is kept and reported, never quietly dropped. */
    juce::StringArray damagedStateNotes() const   { return stateDigestMismatches; }

    // -- licensing (§19 "Trust", §20, §26.2, §27) ----------------------------------------------
    // The public key and the product id come from the Host Project manifest, so a generated
    // instrument carries its own — one build's licence is not another's.

    licensing::LicenceStatus licenceStatus();
    licensing::Entitlements entitlements();
    /** Installs a licence from the text of a licence file. Empty on success, else the reason. */
    juce::String installLicence (const juce::String& licenceFileText);
    void removeLicence();
    juce::String activateLicenceHere();
    juce::String deactivateLicenceHere();
    juce::Array<licensing::LicenceStore::Activation> licenceActivations();

    /** True when the edition allows it. When it does not, emits the refusal — one sentence
        naming what would allow it and what still works — so no caller has to compose one. */
    bool requireFeature (licensing::Feature feature);

    // -- support bundle (§17.7) ----------------------------------------------------------------

    /** What this machine would contribute to a bundle: version, OS, architecture, the devices
        and surfaces actually seen. Filled here because only the service knows them. */
    SupportBundleContents supportBundleContents() const;
    /** Exactly what would be written, before anything is. §17.7's "with user review" is this. */
    juce::Array<SupportBundle::Entry> previewSupportBundle (const SupportBundleOptions& bundleOptions) const;
    /** Writes the bundle. Empty on success, otherwise the reason. */
    juce::String writeSupportBundle (const juce::File& destination,
                                     const SupportBundleOptions& bundleOptions) const;

    /** Offline render/bounce (§18.9.3). A bounce must be deterministic and must not spray
        MIDI at hardware that is not part of the render, so hardware ports are released while
        it runs and re-opened when it ends. Everything else is already deterministic: the
        engine's randomness is seeded. */
    void setOfflineRender (bool offline);
    bool isOfflineRender() const                       { return offlineRender; }

    /** Controlling thread. Drains every part's parameter-change marks (vendor editors and
        automation report through listeners that may fire on the audio thread) and emits one
        coalesced instrumentHostParamValues per part that changed — current value and text,
        read now, not whatever the callback once saw. The owner pumps this from a UI-rate
        timer; tests call it directly. */
    void drainParameterEvents();

private:
    struct ClassInfoForCommit
    {
        juce::String ceId, modulePath, name, vendor;
    };

    void emitState();
    void emitError (const juce::String& message);
    /** Not const, and that is the licence block's doing: the licence store is built on first
        need because its public key lives in the Host Project, which is itself loaded lazily.
        Its one caller, emitState, is not const either. */
    juce::var buildStatePayload();
    static juce::var scanProgressPayload (const juce::String& line, bool done);

    /** Runs the load transaction for a part: begin ticket, instantiate, commit; on success
        `afterCommit` runs with the live instrument before anything is announced — the
        vendor-preset apply rides there. */
    void requestInstrument (const juce::String& partId, const juce::String& ceId,
                            std::function<void (juce::AudioProcessor&)> afterCommit = {});

    void runScanNow();
    void restoreSessionImpl (bool includePerformance);
    void ensureHostProject();
    void ensureLibrary();
    void emitLibrary (const juce::String& query, const juce::String& type);
    void scanVstPresets();
    /** Availability, computed live against the catalogue (caller holds no locks; this takes
        catalogLock itself): empty = loadable, else the actionable reason. */
    juce::String recordUnavailableReason (const LibraryRecord& record) const;
    void loadPresetRecord (const LibraryRecord& record, const juce::String& partId);
    void loadRackRecord (const LibraryRecord& record);
    void attachParameters (const juce::String& partId);
    void applyPerformance (Performance&& performance);
    /** Mirrors requestInstrument for an effect slot, through the rack's effect transaction. */
    void requestEffect (const juce::String& effectId, const juce::String& ceId);
    /** The live processor behind any target id — a part's instrument or an effect. */
    juce::AudioProcessor* targetProcessor (const juce::String& targetId) const;
    /** The class identity any target currently carries (for binding capture/resolution). */
    juce::String targetClassCeId (const juce::String& targetId) const;
    juce::String targetDisplayName (const juce::String& targetId) const;
    void showEditorForEffect (const juce::String& effectId);
    /** Applies one macro's value to every resolved target through the parameter path. */
    void applyMacroValue (const Macro& macro);
    juce::AudioProcessorParameter* resolveParameter (const juce::String& partId,
                                                     const juce::String& definitionId,
                                                     const ParameterDescriptor** descriptorOut = nullptr);

    // -- virtual parameter addresses (Stage 5) -----------------------------------------
    // '@'-prefixed ids resolve against the rack's own state: "@gain"/"@pan"/"@send:<id>" on
    // a part, "@macro" on a macro id. Values are normalized 0..1 like everything else on
    // the parameter path; writes go through the rack's setters, never a second store.
    static bool isVirtualParameterId (const juce::String& parameterId)
    {
        return parameterId.startsWith ("@");
    }
    bool virtualParameterExists (const juce::String& targetId, const juce::String& parameterId) const;
    float virtualParameterValue (const juce::String& targetId, const juce::String& parameterId) const;
    juce::String virtualParameterText (const juce::String& targetId, const juce::String& parameterId) const;
    juce::String virtualParameterName (const juce::String& targetId, const juce::String& parameterId) const;
    static float virtualParameterDefault (const juce::String& parameterId);
    void setVirtualParameter (const juce::String& targetId, const juce::String& parameterId,
                              float normalized);
    /** True when targetId+parameterId can be written right now — plug-in or virtual. */
    bool targetParameterExists (const juce::String& targetId, const juce::String& parameterId);
    /** One mapped, gesture-wrapped write through a binding — page slots, nudges and macro
        targets all funnel here so plug-in and virtual addresses share the transform. */
    void writeMappedBinding (const ControlBinding& binding, float value01);

    /** A slot binding resolves only when its part still carries the class it was assigned
        against AND that parameter exists in the live registry — anything else is unresolved,
        shown, and refused for writes. Virtual addresses resolve on existence alone: they
        belong to the rack, not a plug-in class. */
    bool bindingResolves (const ControlBinding& binding) const;
    juce::String slotDisplayName (const ControlBinding& binding, bool resolved) const;
    /** The parameter's current value inverse-mapped into the slot's 0..1 position. */
    static float slotPositionFor (const ControlBinding& binding, float parameterValue);
    juce::File libraryFile() const      { return options.dataDirectory.getChildFile ("library.json"); }
    juce::File libraryPathsFile() const { return options.dataDirectory.getChildFile ("library-paths.json"); }
    void emitHostProject();
    void showEditorFor (const juce::String& partId);
    void hideEditor();
    void startAudio();
    void stopAudio();
    /** Reopens the device when a hardware audio return now needs more input channels than
        the running device has. */
    void restartAudioIfNeeded();
    /** Input channels the model's hardware returns need — 0 when none are configured. */
    int neededInputChannels() const;
    void emitAudioDevices();

    // -- hardware-part MIDI (Stage 5) ---------------------------------------------------
    juce::StringPairArray listMidiOutputsNow() const;
    MidiSendProcessor::Sink openMidiOutputNow (const juce::String& deviceId, juce::String& errorOut) const;
    /** (Re)opens the part's configured MIDI output into its sender; failures land in
        `hardwareMidiErrors` and the state payload, never in silence. */
    void openHardwareMidi (const juce::String& partId);

    /** Caller holds catalogLock. */
    const PluginClassRecord* findClass (const juce::String& ceId,
                                        const ModuleRecord** moduleOut = nullptr) const;

    // -- Stage 6 internals -------------------------------------------------------------------
    /** Pops everything the engine queued: automation values (applied through the Stage 2
        path), scene landings, clip state changes and captured notes. Runs on the same pump as
        drainParameterEvents. */
    void drainEngineEvents();
    /** Writes one automation value to its target. No gestures: automation is a continuous
        stream, and wrapping every value would spam the host with begin/end pairs. */
    void applyAutomationValue (const juce::String& targetId, const juce::String& parameterId,
                               float value);
    /** The half of a scene that is not clips — slots, macros, focus, page, tempo. */
    void applySceneState (const perf::Scene& scene);
    /** Fills a scene from the rig as it stands right now. */
    void captureSceneFromRack (perf::Scene& scene);
    juce::var performancePayload() const;
    /** The Stage 7 block: the DAW surface, the restore report, the platform matrix, the
        hardware owner and the active-hosting evidence. */
    juce::var productPayload() const;
    /** Everything about whether this install is healthy and what it did about it when it was
        not: safe startup and its suspects, and what this run actually refused. */
    juce::var reliabilityPayload() const;
    /** The edition, the licence behind it, its seats, and what is gated. Never a nag: the
        panel reads this to say what somebody has, not to interrupt them. */
    juce::var licencePayload();

    void savePerformance();
    /** Keeps previous manifest revisions beside the session file: before an overwrite, the
        current file is copied into the revisions directory when the newest copy there is
        older than the snapshot interval, and the directory is pruned to a fixed count. A
        crash or a bad edit costs keystrokes, not the last good rig. */
    void maybeSnapshotRevision();
    void saveScanPaths();

    juce::File catalogFile() const      { return options.dataDirectory.getChildFile ("plugin-catalog.json"); }
    juce::File performanceFile() const  { return options.dataDirectory.getChildFile ("session-performance.json"); }
    juce::File revisionsDirectory() const { return options.dataDirectory.getChildFile ("session-revisions"); }
    /** Checks every stored state blob against the digest saved with it and fills
        stateDigestMismatches. Reports; never repairs, and never deletes a blob. */
    void checkStateDigests();
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
    juce::String editorTargetId;      // the part whose editor the pane is showing, or empty
    bool sessionRestored = false;
    juce::var hostProject;          // the Host Project manifest; loaded/minted on first ask
    bool hostProjectLoaded = false;
    Library library;                // the Stage 4 unified index; loaded on first ask
    juce::StringArray libraryPaths; // user-added .vstpreset folders, beside the standard roots
    bool libraryLoaded = false;
    // Per-part MIDI-output failures ("port is gone"), reported in state until the next
    // successful open — the §18.7.7 missing-device diagnostic.
    std::map<juce::String, juce::String> hardwareMidiErrors;

    // Stage 6: the compiled song's generation, and the scene launches waiting for the engine
    // to tell us they landed (so the non-audio half arrives at the same musical instant).
    int songGeneration = 0;
    int nextSceneToken = 1;
    std::map<int, juce::String> pendingScenes;
    juce::String captureClipId, captureLaneId;
    // What the surface's encoders and step pads address; empty = the first lane of the first
    // pattern, so an unconfigured surface still does something sensible.
    juce::String surfacePatternId, surfaceLaneId;
    bool lastReportedPlaying = false;
    bool offlineRender = false;
    int lastSelectedScene = -1;
    juce::String instanceId { juce::Uuid().toDashedString() };
    bool holdsHardwareSurface = false;
    juce::int64 lastHardwareHeartbeat = 0;
    std::unique_ptr<ActiveHostingMarker> activeMarker;
    ActiveHostingMarker::Incident pendingActiveIncident;   // reported once, at the first state
    std::unique_ptr<SafeMode> safeMode;
    std::unique_ptr<SessionRecovery> recovery;
    std::unique_ptr<licensing::LicenceStore> licence;
    /** Constructs the store on first need, because the public key lives in the Host Project
        and that manifest is itself loaded lazily. */
    void ensureLicence();
    /** How many parts currently hold a plug-in — what §26.2's free-tier limit counts. */
    int loadedPartCount() const;
    /** Anything whose saved state did not match the digest stored beside it, in words. */
    juce::StringArray stateDigestMismatches;
    /** Modules this run actually refused, with the reason, so the restore report can say what
        happened rather than reporting them as merely missing. Keyed by module path. */
    std::map<juce::String, juce::String> safeModeRefusals;
    // A claim is refreshed this often and considered abandoned after this long, so an
    // instance that crashed frees the surface without anyone having to clean up after it.
    static constexpr juce::int64 hardwareHeartbeatMs = 2000;
    static constexpr juce::int64 hardwareClaimTimeoutMs = 8000;

    juce::File hardwareOwnerFile() const { return options.dataDirectory.getChildFile ("hardware-owner.json"); }
    /** The package identity a saved state carries, so a project reopened elsewhere can say
        which product and revision wrote it (§18.9.4). */
    juce::var packageIdentity() const;

    void emitScriptEvent (const juce::String& event, const juce::var& payload) const;
    /** The lane the surface currently addresses, or nullptr. */
    perf::Lane* surfaceLane();

    // The Stage 2 registry, per part with a live instrument: descriptors plus the RT-safe
    // change listener. Attached on every successful commit, dropped from the same rack hook
    // that hides the editor — the sync must stop listening before its processor dies.
    struct PartParameters
    {
        ParameterInventory inventory;
        std::unique_ptr<PartParameterSync> sync;
    };
    std::map<juce::String, PartParameters> partParameters;

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
