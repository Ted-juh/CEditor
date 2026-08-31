#pragma once

#include <algorithm>
#include <memory>
#include <vector>

#include "ArpEngine.h"
#include "MidiFxChain.h"
#include "PatternModel.h"

// MidiInsertRack — a part's MIDI modules, in the order the player put them.
//
// What this replaces was welded: zone filter, then one MidiFxChain doing transpose, scale,
// chord and velocity in that fixed order, then one ArpEngine. Chord-before-arp was a
// decision the code had made for every rig. Here the modules are a list — any order,
// several of a kind, each bypassable — which is what makes "arp into chorder" and "chorder
// into arp" both reachable, and they are genuinely different instruments.
//
// EVERY MODULE IS A PROVEN ENGINE. A note-shaping slot is a MidiFxChain configured to do
// exactly one job (transpose sets only transpose; chord only the chorder), and an arp slot
// is an ArpEngine. Nothing here re-implements note transformation, which matters because of
// the invariant below.
//
// THE NOTE-OFF INVARIANT, composed. Each stage can change which note leaves for a note that
// arrived, and the rules can change while a key is held; each engine already tracks what it
// actually emitted and releases exactly that. A chain does not weaken this — every stage
// keeps its own table, and the stage downstream sees the stage upstream's output as if it
// came from a keyboard. What a chain adds is the moment the CHAIN ITSELF changes under a
// held chord: the modules that were holding notes are about to be destroyed, so their
// releases are collected first and emitted by the new chain on its next block. That is why
// rebuilding is not just a swap.
//
// THREADING. setSlots() is the message thread; process() is the audio thread. The new
// module list is built outside the lock and swapped inside it, and the old one is destroyed
// outside it again — the audio thread is never blocked for longer than a vector swap, and
// nothing is allocated or freed while it holds the lock.

namespace ceditor::perf
{

class MidiInsertRack
{
public:
    static constexpr int maxSlots = 8;

    MidiInsertRack();
    ~MidiInsertRack();

    MidiInsertRack (const MidiInsertRack&) = delete;
    MidiInsertRack& operator= (const MidiInsertRack&) = delete;

    /** Message thread: rebuilds the module list to match `slots`. Modules whose slot id and
        type are unchanged keep their live state (and their held notes) — retyping or
        removing a slot releases what it was holding through the pending flush. */
    void setSlots (const juce::Array<MidiSlot>& slots);

    /** Sizes the internal buffers; call from prepareToPlay. */
    void prepare (int maximumExpectedSamplesPerBlock);

    /** Audio thread: runs `in` through every enabled module in order into `out`. */
    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out,
                  const Transport::BlockTime& block, int numSamples);

    /** Releases everything every module is holding — the panic path reaches all of them. */
    void allNotesOff (juce::MidiBuffer& out, int position);

    /** The first arpeggiator's live pattern step, for the UI playhead; -1 when none. */
    int arpPatternStep() const noexcept;

private:
    struct Module
    {
        juce::String slotId;
        juce::String type;
        bool bypassed = false;
        std::unique_ptr<MidiFxChain> fx;    // every type but "arp"
        std::unique_ptr<ArpEngine> arp;     // "arp"
    };

    static std::unique_ptr<Module> build (const MidiSlot& slot);
    static void configure (Module& module, const MidiSlot& slot);

    mutable juce::SpinLock lock;
    std::vector<std::unique_ptr<Module>> modules;   // guarded by `lock`
    juce::MidiBuffer pendingFlush;                  // guarded by `lock`
    bool hasPendingFlush = false;                   // guarded by `lock`

    juce::MidiBuffer front, back;   // audio thread only: the ping-pong between stages
};

} // namespace ceditor::perf
