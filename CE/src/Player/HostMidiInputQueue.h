#pragma once

#include <juce_core/juce_core.h>
#include <array>
#include <atomic>
#include <cstring>

namespace ce
{
// One audio-thread producer and one message-thread consumer. Publish complete records only;
// the audio callback never allocates, locks or executes panel scripts. Large SysEx records
// share the byte capacity with short messages instead of reserving a large slot for every note.
class HostMidiInputQueue
{
public:
    static constexpr int capacity = 256 * 1024;

    bool push (const void* bytes, int size) noexcept
    {
        if (bytes == nullptr || size <= 0) return false;
        if (size > capacity - headerSize - 1 || fifo.getFreeSpace() < size + headerSize)
        {
            dropped.fetch_add (1, std::memory_order_relaxed);
            return false;
        }
        int start, count, secondStart, secondCount;
        fifo.prepareToWrite (size + headerSize, start, count, secondStart, secondCount);
        copyIn (start, &size, headerSize);
        copyIn ((start + headerSize) % capacity, bytes, size);
        fifo.finishedWrite (size + headerSize);
        return true;
    }

    // Message thread only. The reusable destination may allocate here, away from processBlock.
    bool pop (juce::MemoryBlock& bytes)
    {
        if (fifo.getNumReady() < headerSize) return false;
        int start, count, secondStart, secondCount;
        fifo.prepareToRead (headerSize, start, count, secondStart, secondCount);
        int size = 0;
        copyOut (start, &size, headerSize);
        jassert (size > 0 && size + headerSize <= fifo.getNumReady());
        bytes.setSize (static_cast<size_t> (size), false);
        copyOut ((start + headerSize) % capacity, bytes.getData(), size);
        fifo.finishedRead (size + headerSize);
        return true;
    }

    unsigned takeDroppedCount() noexcept { return dropped.exchange (0, std::memory_order_relaxed); }

private:
    static constexpr int headerSize = sizeof (int);
    std::array<juce::uint8, capacity> data {};
    juce::AbstractFifo fifo { capacity };
    std::atomic<unsigned> dropped { 0 };

    void copyIn (int offset, const void* source, int size) noexcept
    {
        const int first = juce::jmin (size, capacity - offset);
        std::memcpy (data.data() + offset, source, static_cast<size_t> (first));
        std::memcpy (data.data(), static_cast<const juce::uint8*> (source) + first,
                     static_cast<size_t> (size - first));
    }

    void copyOut (int offset, void* destination, int size) const noexcept
    {
        const int first = juce::jmin (size, capacity - offset);
        std::memcpy (destination, data.data() + offset, static_cast<size_t> (first));
        std::memcpy (static_cast<juce::uint8*> (destination) + first, data.data(),
                     static_cast<size_t> (size - first));
    }
};
}
