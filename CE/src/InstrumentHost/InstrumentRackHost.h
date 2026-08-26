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
    void prepare (double sampleRate, int blockSize);
    void release();

    /** The wrappers drive this: the standalone through an AudioProcessorPlayer, the outer
        VST3 by delegating its processBlock, tests directly. */
    juce::AudioProcessorGraph& getGraph()                 { return graph; }

    // -- rack structure -----------------------------------------------------------------
    const Performance& getPerformance() const             { return model; }
    juce::String addPart();
    bool removePart (const juce::String& partId);
    bool movePart (const juce::String& partId, int newIndex);
    bool focusPart (const juce::String& partId);

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
        PartMidiFilterProcessor* filter = nullptr;             // owned by filterNode
        GainPanProcessor* gain = nullptr;                      // owned by gainNode
        int loadGeneration = 0;
    };

    LivePart* findLive (const juce::String& partId);
    const LivePart* findLive (const juce::String& partId) const;
    void notifyInstrumentWillBeRemoved (const juce::String& partId, const LivePart& lp);
    void createLiveNodes (const RackPart& part);
    void connectInstrument (LivePart& live);
    void applyPartToLive (const RackPart& part, LivePart& live);
    void applyMixerState();
    void refreshStateBlob (RackPart& part);

    Performance model;
    std::map<juce::String, LivePart> live;
    juce::AudioProcessorGraph graph;
    juce::AudioProcessorGraph::Node::Ptr midiInNode, audioOutNode;
    double currentSampleRate = 44100.0;
    int currentBlockSize = 512;
    bool prepared = false;
};

} // namespace ceditor::host
