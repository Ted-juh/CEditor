#pragma once

#include <atomic>
#include <juce_audio_processors/juce_audio_processors.h>

// ParameterModel — the one authoritative parameter layer (VIP-successor Stage 2).
//
// Everything that will ever address a plug-in parameter — the Web UI now, hardware pages and
// macros and automation later — goes through the records here instead of inventing its own
// addressing. Two ideas, kept deliberately small (baseline §18.4.3):
//
// THE DESCRIPTOR is per plug-in-class parameter and stable across sessions. Its definitionId
// is the plug-in's own parameter ID where one exists (JUCE's hosted VST3 parameters carry
// theirs), and "#<index>" only as the fallback for plug-ins that expose nothing better.
// Display names are metadata, never identity. Duplicate IDs — they happen in the wild — are
// made unique by suffixing the index, and the collision is recorded as a warning instead of
// silently letting two parameters answer to one address.
//
// THE SYNC is the plug-in→CEditor half of the bidirectional path (§18.4.5). Vendor editors
// and automation report through AudioProcessorListener, and those callbacks may arrive on the
// audio thread — so the listener only marks WHICH parameter changed, into a fixed lock-free
// FIFO, and never reads values, formats text, allocates or locks. The controlling thread
// drains the marks and reads the CURRENT value per parameter — later than the callback saw,
// which is exactly right: coalescing to the freshest value is the point. A burst that
// overflows the FIFO degrades to "treat every parameter as changed", which costs one full
// snapshot and loses nothing.

namespace ceditor::host
{

struct ParameterDescriptor
{
    juce::String definitionId;   // stable address half: the plug-in's paramID, or "#<index>"
    int index = 0;               // native index in this processor, the plug-in-facing identity
    juce::String name;
    juce::String label;          // unit text, e.g. "Hz" — empty for most
    juce::String group;          // " / "-joined group path where the plug-in exposes one
    float defaultValue = 0.0f;   // normalized
    int numSteps = 0;
    bool discrete = false;
    bool boolean = false;
    bool automatable = true;
    bool metaParameter = false;
};

struct ParameterInventory
{
    juce::Array<ParameterDescriptor> descriptors;
    juce::StringArray warnings;

    const ParameterDescriptor* find (const juce::String& definitionId) const
    {
        for (const auto& d : descriptors)
            if (d.definitionId == definitionId)
                return &d;
        return nullptr;
    }
};

/** Walks a live processor's host-visible parameters into descriptors. */
ParameterInventory describeParameters (juce::AudioProcessor& processor);

class PartParameterSync final : private juce::AudioProcessorListener
{
public:
    PartParameterSync (juce::String partIdToUse, juce::AudioProcessor& processorToWatch)
        : partId (std::move (partIdToUse)), processor (processorToWatch)
    {
        processor.addListener (this);
    }

    ~PartParameterSync() override
    {
        processor.removeListener (this);
    }

    struct Gesture { int index; bool begin; };

    /** Controlling thread only. Collects the coalesced changed indices and the gesture
        boundaries since the last drain; returns true when anything arrived. On overflow
        every parameter index counts as changed. */
    bool drain (juce::SortedSet<int>& changedIndices, juce::Array<Gesture>& gestures)
    {
        bool any = false;

        if (overflowed.exchange (false))
        {
            for (int i = 0; i < processor.getParameters().size(); ++i)
                changedIndices.add (i);
            any = ! changedIndices.isEmpty();
        }

        for (;;)
        {
            const auto scope = fifo.read (1);
            if (scope.blockSize1 + scope.blockSize2 == 0)
                break;

            const auto& event = events[(size_t) (scope.blockSize1 > 0 ? scope.startIndex1
                                                                      : scope.startIndex2)];
            if (event.kind == valueChanged) changedIndices.add (event.index);
            else                            gestures.add ({ event.index, event.kind == gestureBegan });
            any = true;
        }

        return any;
    }

    const juce::String partId;

private:
    enum Kind : int { valueChanged = 0, gestureBegan = 1, gestureEnded = 2 };

    // May run on the audio thread: marks only, no reads, no allocation, no locks.
    void push (int index, Kind kind)
    {
        const auto scope = fifo.write (1);
        if (scope.blockSize1 + scope.blockSize2 == 0)
        {
            overflowed.store (true, std::memory_order_relaxed);
            return;
        }
        events[(size_t) (scope.blockSize1 > 0 ? scope.startIndex1 : scope.startIndex2)]
            = { index, kind };
    }

    void audioProcessorParameterChanged (juce::AudioProcessor*, int index, float) override
    {
        push (index, valueChanged);
    }

    void audioProcessorParameterChangeGestureBegin (juce::AudioProcessor*, int index) override
    {
        push (index, gestureBegan);
    }

    void audioProcessorParameterChangeGestureEnd (juce::AudioProcessor*, int index) override
    {
        push (index, gestureEnded);
    }

    void audioProcessorChanged (juce::AudioProcessor*, const ChangeDetails&) override {}

    struct Event { int index; int kind; };

    juce::AudioProcessor& processor;
    static constexpr int capacity = 1024;
    juce::AbstractFifo fifo { capacity };
    Event events[capacity] = {};
    std::atomic<bool> overflowed { false };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PartParameterSync)
};

} // namespace ceditor::host
