#pragma once

#include <map>
#include "RackModel.h"
#include "RackProcessors.h"

// InstrumentRackHost — the live multi-part rack over one AudioProcessorGraph (VIP-successor
// Stage 1).
//
// Owns the Performance document (RackModel.h) and keeps the graph matched to it: per part a
// PartMidiFilterProcessor and a GainPanProcessor around an optional instrument node, all
// summing into one stereo output. The graph is the growth path the baseline chose — Stage 5
// effects and buses extend THIS graph, so nothing here assumes single-instrument shortcuts.
//
// THREADING CONTRACT. Every method here runs on one controlling thread (the message thread in
// the app; the test's main thread). The audio thread only ever meets this class through the
// graph's processBlock and the atomics inside the per-part processors. Topology edits use the
// graph's default UpdateKind::sync, which rebuilds under the graph's own callback lock —
// legal from the message thread while audio runs.
//
// LOAD TRANSACTIONS (baseline §8.6.10). Instantiation is asynchronous and can be slow, so a
// part hands out a generation ticket: beginLoad() invalidates every earlier ticket for that
// part, and commitLoad() refuses a stale one. A failed load simply never commits — the
// previous instrument keeps playing because nothing ever touched it. Replacement clears the
// filter's note tracking rather than panicking through it: the old destination is being
// destroyed, and sending its note-offs to the new instrument would address notes it never
// played. The caller must destroy any editor before commitLoad/unload/removePart destroys the
// processor it watches — editors do not exist at this layer yet, but the ordering rule is
// this API's contract all the same.
//
// UNRESOLVED PARTS. loadModel() rebuilds structure only; instruments arrive later through the
// normal transaction, and a part whose plug-in never arrives keeps its identity and state
// blob — a missing plug-in is repairable, not fatal (the audit's "missing is a flag"
// ruling, applied to the rack).

namespace ceditor::host
{

class InstrumentRackHost
{
public:
    InstrumentRackHost();
    ~InstrumentRackHost();

    struct ClassInfo
    {
        juce::String ceId;
        juce::String modulePath;
        juce::String name;
        juce::String vendor;
    };

    // -- engine lifecycle ---------------------------------------------------------------
    /** `numInputChannels` is the device's input side, for hardware parts' audio returns —
        0 keeps the rack output-only. */
    void prepare (double sampleRate, int blockSize, int numInputChannels = 0);
    void release();
    double getSampleRate() const                          { return currentSampleRate; }

    /** The wrappers drive this: the standalone through an AudioProcessorPlayer, the outer
        VST3 by delegating its processBlock, tests directly. */
    juce::AudioProcessorGraph& getGraph()                 { return graph; }

    // -- rack structure -----------------------------------------------------------------
    const Performance& getPerformance() const             { return model; }
    juce::String addPart();
    bool removePart (const juce::String& partId);
    bool movePart (const juce::String& partId, int newIndex);
    bool focusPart (const juce::String& partId);

    // -- insert-effect chains (Stage 5) -------------------------------------------------
    // Serial pre-fader inserts per part (instrument → fx… → gain) and a master chain (every
    // part's gain → mfx… → output), all in the ONE graph Stage 1 built. Effects follow the
    // instrument's rules exactly: minted stable ids, the same prime/begin/commit load
    // transaction with generation tickets, blob restore on identity match, and the
    // will-be-removed hook fired (with the effectId) before any live node dies.

    static constexpr const char* masterChainId = "master";

    /** Appends an empty slot to a part's chain or (chainId=="master") the master chain and
        returns its minted effectId — empty for an unknown chain. */
    juce::String addEffectSlot (const juce::String& chainId);   // partId, "master" or a returnId
    bool removeEffectSlot (const juce::String& effectId);
    /** Reorders within its own chain; identities and nodes stay put. */
    bool moveEffectSlot (const juce::String& effectId, int newIndex);
    bool setEffectBypassed (const juce::String& effectId, bool bypassed);
    /** Document-only identity/state priming, like primePartState. */
    bool primeEffectSlot (const juce::String& effectId, const ClassInfo& info,
                          const juce::String& stateBlobBase64);
    int  beginEffectLoad (const juce::String& effectId);
    bool commitEffectLoad (const juce::String& effectId, int generation,
                           std::unique_ptr<juce::AudioProcessor> effect, const ClassInfo& info);
    juce::AudioProcessor* getEffect (const juce::String& effectId) const;
    bool effectHasProcessor (const juce::String& effectId) const;

    // -- send/return chains (Stage 5) ---------------------------------------------------
    // Shared buses through the same graph and the same effect transaction: every part gets a
    // post-fader send gain per return, the chain's effects process the sum, and the chain's
    // level rejoins the path ahead of the master inserts. addEffectSlot and the whole effect
    // transaction accept a returnId as the chainId.

    /** Mints and appends a return chain, returning its returnId. */
    juce::String addReturn (const juce::String& name);
    /** Destroys the chain's live effects (each announced first), drops every part's send
        into it, and heals the wiring. */
    bool removeReturn (const juce::String& returnId);
    bool renameReturn (const juce::String& returnId, const juce::String& name);
    bool setReturnLevel (const juce::String& returnId, float level);
    /** Sets one part's send level into one return (creating the send on first use). */
    bool setSendLevel (const juce::String& partId, const juce::String& returnId, float level);

    // -- explicit multi-output routing (Stage 5) ----------------------------------------
    /** Routes the instrument's output pair `pairIndex` (channels 2k/2k+1) to the master path
        with its own gain — added on first call, updated after. Pair 0 is the part's main
        pair and is refused here. */
    bool setExtraOut (const juce::String& partId, int pairIndex, float gain);
    bool removeExtraOut (const juce::String& partId, int pairIndex);
    /** Output channels the part's LIVE instrument exposes — 0 when none is loaded. */
    int instrumentOutputChannels (const juce::String& partId) const;

    // -- hardware-instrument parts (Stage 5, §18.7.6) -----------------------------------
    // A hardware part keeps everything a part already is — identity, zones, mute/solo/fader,
    // ordering, insert chain — and swaps the plug-in for a MIDI output plus an optional
    // managed audio return through the graph's input node. The MIDI device itself lives with
    // the caller (the service opens it; tests inject a capture sink).

    struct HardwareConfig
    {
        juce::String midiOutputId;
        juce::String midiOutputName;
        int midiOutChannel = 1;
        int audioReturnChannel = -1;
        bool audioReturnStereo = true;
        int programBank = -1;
        int programNumber = -1;
        juce::String deviceProfileId;
    };

    /** Makes the part a hardware part (unloading any live instrument first — the part's
        plug-in identity and blob stay for the day it turns back) or reconfigures one. */
    bool setHardwareConfig (const juce::String& partId, const HardwareConfig& config);
    /** Back to a software part: the sender and return wiring go; identity and zones stay. */
    bool clearHardware (const juce::String& partId);
    /** Hands the part's sender its device sink — empty disconnects. */
    bool setHardwareMidiSink (const juce::String& partId, MidiSendProcessor::Sink sink);
    /** Sends the configured bank select / program change through the sink, now. False when
        the part is not hardware or nothing is configured. */
    bool sendHardwareProgram (const juce::String& partId);

    // -- latency reporting (Stage 5) ----------------------------------------------------
    // The graph does not compensate parallel paths (a live rack keeps every path as fast as
    // its plug-ins allow); these make the cost visible instead of pretended away.
    int partLatencySamples (const juce::String& partId) const;
    int masterLatencySamples() const;

    // -- macros (Stage 5) ---------------------------------------------------------------
    // Model-only, like pages: a macro is stored fan-out; the writes go through the service's
    // parameter path, never through the graph.
    juce::String addMacro (const juce::String& name);
    bool removeMacro (const juce::String& macroId);
    /** Mutable access for the service's target edits; nullptr for an unknown macro. */
    Macro* findMutableMacro (const juce::String& macroId)   { return model.findMacro (macroId); }

    // -- control pages (Stage 2) --------------------------------------------------------
    // Model-only: pages bind control slots to parameter addresses and never touch the
    // graph. They live on the Performance so they persist and travel with the rack.
    juce::String addControlPage (const juce::String& name);
    /** Adopts a fully built page (the automatic generator's output) as-is. */
    void adoptControlPage (ControlPage page)      { model.pages.add (std::move (page)); }
    bool removeControlPage (const juce::String& pageId);
    bool renameControlPage (const juce::String& pageId, const juce::String& name);
    /** Writes the slot's binding (an empty binding clears the slot). */
    bool setSlotBinding (const juce::String& pageId, const juce::String& slotId,
                         ControlBinding binding);

    // -- per-part rules and mixer -------------------------------------------------------
    bool setMidiRules (const juce::String& partId, const PartMidiRules& rules);
    bool setEnabled (const juce::String& partId, bool enabled);
    bool setMute (const juce::String& partId, bool mute);
    bool setSolo (const juce::String& partId, bool solo);
    bool setVolume (const juce::String& partId, float volume);
    bool setPan (const juce::String& partId, float pan);

    // -- instrument load transaction ----------------------------------------------------
    /** Returns the new generation ticket, or 0 for an unknown part. */
    int beginLoad (const juce::String& partId);

    /** Commits a constructed instrument into the part. Refuses a stale generation (a newer
        beginLoad supersedes) and an unknown part. Restores the part's saved state into the
        instrument when the class identity matches; a different identity clears the blob. */
    bool commitLoad (const juce::String& partId, int generation,
                     std::unique_ptr<juce::AudioProcessor> instrument,
                     const ClassInfo& info);

    /** Removes the part's instrument (capturing its state first) but keeps the part, its
        identity and its rules — reloading the same class restores where it left off. */
    bool unloadInstrument (const juce::String& partId);

    /** Writes a preset's identity and state blob into the part's DOCUMENT only — the live
        instrument (if any) keeps playing untouched. The caller then runs the normal load
        transaction, whose commit restores the primed blob into the new instrument: this is
        how a library preset loads through Stage 1's one path instead of growing another
        (baseline §18.6.7). */
    bool primePartState (const juce::String& partId, const ClassInfo& info,
                         const juce::String& stateBlobBase64);

    bool partHasInstrument (const juce::String& partId) const;

    /** The live instrument, for the editor host and for tests. Nullptr when empty. */
    juce::AudioProcessor* getInstrument (const juce::String& partId) const;

    /** Fires immediately BEFORE a live instrument is destroyed, on every path that destroys
        one — replacement, unload, part removal, and a whole-rack loadModel teardown. The
        editor host hangs off this: an AudioProcessorEditor must be gone before its processor
        is, and this hook is what makes that invariant enforceable rather than remembered. */
    std::function<void (const juce::String& partId, juce::AudioProcessor&)> onInstrumentWillBeRemoved;

    // -- state --------------------------------------------------------------------------
    /** The document with every live instrument's state freshly captured into its blob. */
    Performance captureState();

    struct UnresolvedPart
    {
        juce::String partId;
        juce::String ceId;
        juce::String modulePath;
    };

    /** Replaces the whole rack with `performance`: structure and settings become live
        immediately; instruments do not exist yet. Returns the parts that reference a plug-in
        class, for the caller to instantiate and commit through the normal transaction. */
    juce::Array<UnresolvedPart> loadModel (Performance performance);

    // -- panic --------------------------------------------------------------------------
    void panicPart (const juce::String& partId);
    void panicAll();

private:
    struct LivePart
    {
        juce::AudioProcessorGraph::Node::Ptr filterNode;
        juce::AudioProcessorGraph::Node::Ptr gainNode;
        juce::AudioProcessorGraph::Node::Ptr instrumentNode;   // may be null
        juce::AudioProcessorGraph::Node::Ptr midiSendNode;     // hardware parts only
        PartMidiFilterProcessor* filter = nullptr;             // owned by filterNode
        GainPanProcessor* gain = nullptr;                      // owned by gainNode
        MidiSendProcessor* midiSend = nullptr;                 // owned by midiSendNode
        std::map<juce::String, juce::AudioProcessorGraph::Node::Ptr> sendNodes;     // per returnId
        std::map<int, juce::AudioProcessorGraph::Node::Ptr> extraOutNodes;          // per pairIndex
        int loadGeneration = 0;
    };

    struct LiveEffect
    {
        juce::AudioProcessorGraph::Node::Ptr node;   // null while loading or unresolved
        int loadGeneration = 0;
    };

    LivePart* findLive (const juce::String& partId);
    const LivePart* findLive (const juce::String& partId) const;
    /** The chain behind a chainId — a part's inserts, the master chain, or a return's. */
    juce::Array<EffectSlot>* chainFor (const juce::String& chainId);
    void notifyInstrumentWillBeRemoved (const juce::String& partId, const LivePart& lp);
    void destroyEffectNode (const juce::String& effectId);
    void createLiveNodes (const RackPart& part);
    void applyPartToLive (const RackPart& part, LivePart& live);
    void applyMixerState();
    void refreshStateBlob (RackPart& part);
    void refreshEffectBlobs (juce::Array<EffectSlot>& effects);
    /** Stereo-adapting hop: mono fans out, stereo folds into mono, sums where several
        sources meet one input. */
    void connectAudio (juce::AudioProcessorGraph::Node* from, juce::AudioProcessorGraph::Node* to);
    /** The same hop from an explicit channel pair of `from` — the audio-input node's return
        channels, a multi-output instrument's extra pair. */
    void connectAudioPair (juce::AudioProcessorGraph::Node* from, int firstChannel, bool stereo,
                           juce::AudioProcessorGraph::Node* to);
    /** Keeps the auxiliary node population — send gains, return levels, extra-out gains,
        hardware MIDI senders — matched to the model, and re-applies their levels. */
    void syncAuxNodes();
    void destroyAuxNodes (LivePart& lp);
    /** Drops every audio connection and rebuilds the whole path — per-part chains into the
        gains, sends into the return chains, returns and gains through the master chain into
        the output. All the audio topology in one place, so an edit anywhere cannot leave a
        stale wire somewhere else. */
    void rewireAudio();

    Performance model;
    std::map<juce::String, LivePart> live;
    std::map<juce::String, LiveEffect> liveEffects;   // keyed by effectId, every chain kind
    std::map<juce::String, juce::AudioProcessorGraph::Node::Ptr> returnLevelNodes;   // per returnId
    juce::AudioProcessorGraph graph;
    juce::AudioProcessorGraph::Node::Ptr midiInNode, audioInNode, audioOutNode;
    double currentSampleRate = 44100.0;
    int currentBlockSize = 512;
    bool prepared = false;
};

} // namespace ceditor::host
