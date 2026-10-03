#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include <cstdint>
#include <cstring>
#include "choc/containers/choc_VariableSizeFIFO.h"

namespace ce
{
/**
 * What the panel sends goes out through here: script sendCC/NRPN/SysEx, automation of a raw-MIDI
 * binding, program recall, a Total Recall dump. Written off the audio thread by whoever sends
 * (`sendRawMidiBytes` in PluginProcessor.h), drained into the host's MIDI buffer in processBlock.
 *
 * It replaced juce::MidiMessageCollector, which RealtimeSanitizer showed taking a CriticalSection on
 * every audio block, the same lock the message thread holds while it appends and may allocate, and
 * growing the host's buffer under a SysEx burst (docs/design/checkers-run-2026-10-02.md). The input
 * direction (HostMidiInputQueue) never had either problem; this is the output's equivalent.
 *
 *   - choc::fifo::VariableSizeFIFO: writers may spin briefly against each other, the reader never
 *     waits, and an item is a contiguous run of bytes, so a 4 KB SysEx is one item, not a slot
 *     size. Vendored with three local patches; CE/thirdparty/choc/VENDORED.md says what and why.
 *   - The drain keeps the host's buffer within the 2,048 bytes the VST3 and CLAP wrappers reserve
 *     (LV2 reserves 8,192). What does not fit waits for the next block, in order. So the audio
 *     thread neither locks nor allocates.
 *   - One exception, so that nothing can wait forever: if not a single message has gone out in this
 *     block, the first one goes regardless. That only grows the buffer for a message bigger than the
 *     reservation, or when the host's own input already filled it.
 *   - Messages land at the start of the block, after the host's own events there, in the order they
 *     were sent. The collector spread them across the block by arrival time; nothing here depended
 *     on that, and the start of the block is the soonest the synth can have them.
 */
class ScriptMidiOutQueue
{
public:
    static constexpr std::uint32_t capacityBytes = 256 * 1024;  // a GAIA bank dump fits several times over
    static constexpr int hostReservedBytes = 2048;               // juce_audio_plugin_client_VST3.cpp, clap-juce-wrapper.cpp
    static constexpr int eventOverheadBytes = (int) (sizeof (std::int32_t) + sizeof (std::uint16_t)); // MidiBuffer's per-event header
    static constexpr int maxMessageBytes = 65535;                // MidiBuffer stores a size in 16 bits

    ScriptMidiOutQueue() { fifo.reset (capacityBytes); }

    /** Any thread except the audio thread. False, and counted, when the queue is full. */
    bool push (const void* bytes, int size) noexcept
    {
        if (bytes == nullptr || size <= 0 || size > maxMessageBytes || ! fifo.push (bytes, (std::uint32_t) size))
        {
            dropped.fetch_add (1, std::memory_order_relaxed);
            return false;
        }
        return true;
    }

    /** Audio thread. Appends what fits at sample 0 of `midi`; the rest stays queued. Returns the count. */
    int drainInto (juce::MidiBuffer& midi) noexcept
    {
        int used = midi.data.size();
        int sent = 0;
        fifo.popAllAvailable ([&] (const void* data, std::uint32_t size) -> bool
        {
            // Decided BEFORE adding: returning false leaves this item in the FIFO for the next block,
            // so a false after addEvent would send it twice.
            const int cost = (int) size + eventOverheadBytes;
            if (used + cost > hostReservedBytes && sent > 0)
                return false;
            midi.addEvent (data, (int) size, 0);
            used += cost;
            ++sent;
            return true;
        });
        return sent;
    }

    unsigned takeDroppedCount() noexcept { return dropped.exchange (0, std::memory_order_relaxed); }

private:
    choc::fifo::VariableSizeFIFO fifo;
    std::atomic<unsigned> dropped { 0 };
};
} // namespace ce
