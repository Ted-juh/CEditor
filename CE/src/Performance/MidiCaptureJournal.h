#pragma once

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <memory>
#include <vector>
#include <juce_audio_basics/juce_audio_basics.h>

// MidiCaptureJournal — the always-listening half of Capture & Replay.
//
// The audio thread writes compact channel-voice messages into a fixed ring. It never locks,
// allocates, or constructs a growing container. The message thread may copy a time-bounded
// snapshot later — including while the transport is stopped — which is the foundation shared
// by retrospective capture, the looper, performance replay and a future MIDI freeze command.

namespace ceditor::perf
{

class MidiCaptureJournal
{
public:
    static constexpr int maxEvents = 32768;
    static constexpr double maxHistorySeconds = 120.0;

    struct Event
    {
        std::int64_t samplePosition = 0;
        std::uint32_t packedMessage = 0;

        int size() const noexcept             { return (int) ((packedMessage >> 24) & 0xffu); }
        juce::uint8 byte (int index) const noexcept
        {
            return (juce::uint8) ((packedMessage >> (8 * index)) & 0xffu);
        }

        juce::MidiMessage message() const
        {
            const juce::uint8 bytes[] { byte (0), byte (1), byte (2) };
            return juce::MidiMessage (bytes, size(), 0.0);
        }
    };

    struct Snapshot
    {
        std::vector<Event> events;             // allocated only by the message-thread reader
        double sampleRate = 44100.0;
        std::int64_t startSample = 0;
        std::int64_t endSample = 0;
        double requestedSeconds = 0.0;
        bool eventCapacityReached = false;
    };

    MidiCaptureJournal()
        : slots (std::make_unique<Slot[]> (maxEvents))
    {
    }

    MidiCaptureJournal (const MidiCaptureJournal&) = delete;
    MidiCaptureJournal& operator= (const MidiCaptureJournal&) = delete;

    /** Called with the rest of engine preparation, before processing starts. */
    void prepare (double sampleRate) noexcept
    {
        writerSequence = 0;
        writerSamplePosition = 0;
        publishedSequence.store (0, std::memory_order_release);
        publishedSamplePosition.store (0, std::memory_order_release);
        lastNoteOnSample.store (-1, std::memory_order_release);
        publishedSampleRate.store (sampleRate > 0.0 ? sampleRate : 44100.0,
                                   std::memory_order_release);

        for (int i = 0; i < maxEvents; ++i)
            slots[(size_t) i].sequence.store (0, std::memory_order_relaxed);
    }

    /** Audio thread: append this block's channel-voice messages and advance wall-clock time. */
    void appendBlock (const juce::MidiBuffer& midi, int numSamples) noexcept
    {
        const auto blockSamples = juce::jmax (0, numSamples);

        for (const auto metadata : midi)
        {
            const auto message = metadata.getMessage();
            const auto* data = message.getRawData();
            const auto size = message.getRawDataSize();
            if (data == nullptr || size < 1 || size > 3)
                continue;

            // Capture channel voice only. Clock/active sensing do not describe a performance,
            // and SysEx needs a separately bounded packet store rather than a three-byte slot.
            const auto statusClass = data[0] & 0xf0;
            if (statusClass < 0x80 || statusClass > 0xe0)
                continue;

            const auto sampleOffset = juce::jlimit (0, juce::jmax (0, blockSamples - 1),
                                                    metadata.samplePosition);
            const auto absoluteSample = writerSamplePosition + (std::int64_t) sampleOffset;
            std::uint32_t packed = (std::uint32_t) size << 24;
            for (int i = 0; i < size; ++i)
                packed |= (std::uint32_t) data[i] << (8 * i);

            const auto sequence = writerSequence++;
            auto& slot = slots[(size_t) (sequence % (std::uint64_t) maxEvents)];

            // The payload fields are atomic too. That matters in C++: a classic seqlock over
            // plain fields would still be a formal data race when this slot wraps mid-copy.
            slot.sequence.store (0, std::memory_order_release);
            slot.samplePosition.store (absoluteSample, std::memory_order_relaxed);
            slot.packedMessage.store (packed, std::memory_order_relaxed);
            slot.sequence.store (sequence + 1, std::memory_order_release);
            publishedSequence.store (sequence + 1, std::memory_order_release);

            if (message.isNoteOn())
                lastNoteOnSample.store (absoluteSample, std::memory_order_release);
        }

        writerSamplePosition += (std::int64_t) blockSamples;
        publishedSamplePosition.store (writerSamplePosition, std::memory_order_release);
    }

    /** Message thread: copy at most the requested recent time span. */
    Snapshot snapshot (double seconds) const
    {
        Snapshot result;
        result.sampleRate = publishedSampleRate.load (std::memory_order_acquire);
        result.requestedSeconds = juce::jlimit (0.01, maxHistorySeconds, seconds);
        result.endSample = publishedSamplePosition.load (std::memory_order_acquire);
        const auto wantedSamples = (std::int64_t) std::llround (result.requestedSeconds
                                                                * result.sampleRate);
        result.startSample = juce::jmax ((std::int64_t) 0, result.endSample - wantedSamples);

        const auto endSequence = publishedSequence.load (std::memory_order_acquire);
        const auto firstSequence = endSequence > (std::uint64_t) maxEvents
                                     ? endSequence - (std::uint64_t) maxEvents : 0;
        const bool ringHasWrapped = endSequence > (std::uint64_t) maxEvents;
        std::int64_t oldestRetainedSample = result.endSample;
        bool foundRetainedEvent = false;
        result.events.reserve ((size_t) juce::jmin ((std::uint64_t) maxEvents,
                                                   endSequence - firstSequence));

        for (auto sequence = firstSequence; sequence < endSequence; ++sequence)
        {
            const auto& slot = slots[(size_t) (sequence % (std::uint64_t) maxEvents)];
            const auto expected = sequence + 1;
            if (slot.sequence.load (std::memory_order_acquire) != expected)
                continue;

            Event event;
            event.samplePosition = slot.samplePosition.load (std::memory_order_relaxed);
            event.packedMessage = slot.packedMessage.load (std::memory_order_relaxed);

            if (slot.sequence.load (std::memory_order_acquire) != expected)
                continue; // the audio thread wrapped onto this slot while it was copied
            if (! foundRetainedEvent)
            {
                oldestRetainedSample = event.samplePosition;
                foundRetainedEvent = true;
            }
            if (event.samplePosition >= result.startSample && event.samplePosition <= result.endSample)
                result.events.push_back (event);
        }

        result.eventCapacityReached = ringHasWrapped && foundRetainedEvent
                                      && oldestRetainedSample > result.startSample;

        return result;
    }

    double secondsAvailable() const noexcept
    {
        const auto rate = publishedSampleRate.load (std::memory_order_acquire);
        if (rate <= 0.0)
            return 0.0;
        return juce::jmin (maxHistorySeconds,
                          (double) publishedSamplePosition.load (std::memory_order_acquire) / rate);
    }

    int retainedEventCount() const noexcept
    {
        return (int) juce::jmin ((std::uint64_t) maxEvents,
                                publishedSequence.load (std::memory_order_acquire));
    }

    std::int64_t currentSamplePosition() const noexcept
    {
        return publishedSamplePosition.load (std::memory_order_acquire);
    }

    double sampleRate() const noexcept
    {
        return publishedSampleRate.load (std::memory_order_acquire);
    }

    bool hasRecentNoteOn (double seconds) const noexcept
    {
        const auto last = lastNoteOnSample.load (std::memory_order_acquire);
        const auto now = publishedSamplePosition.load (std::memory_order_acquire);
        const auto rate = publishedSampleRate.load (std::memory_order_acquire);
        return last >= 0 && rate > 0.0
               && last >= now - (std::int64_t) std::llround (
                              juce::jlimit (0.01, maxHistorySeconds, seconds) * rate);
    }

private:
    struct Slot
    {
        std::atomic<std::uint64_t> sequence { 0 };
        std::atomic<std::int64_t> samplePosition { 0 };
        std::atomic<std::uint32_t> packedMessage { 0 };
    };

    std::unique_ptr<Slot[]> slots;                // allocated once, never on the audio thread
    std::uint64_t writerSequence = 0;             // audio-thread owned
    std::int64_t writerSamplePosition = 0;        // audio-thread owned
    std::atomic<std::uint64_t> publishedSequence { 0 };
    std::atomic<std::int64_t> publishedSamplePosition { 0 };
    std::atomic<std::int64_t> lastNoteOnSample { -1 };
    std::atomic<double> publishedSampleRate { 44100.0 };
};

} // namespace ceditor::perf
