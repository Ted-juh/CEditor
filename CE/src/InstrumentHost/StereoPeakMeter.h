#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include <cmath>

namespace ceditor::host
{
/** Audio-thread peak accumulation, consumed by the controlling thread at UI rate.
    Each exchange starts the next interval; a quieter block cannot erase a transient.
    No locks, allocation, messaging, or audio mutation in capture(). */
class StereoPeakMeter
{
public:
    struct Reading { float left = 0.0f, right = 0.0f; };

    void capture (const juce::AudioBuffer<float>& audio) noexcept
    {
        if (audio.getNumSamples() == 0) return;
        if (audio.getNumChannels() > 0)
            accumulate (left, audio.getMagnitude (0, 0, audio.getNumSamples()));
        if (audio.getNumChannels() > 1)
            accumulate (right, audio.getMagnitude (1, 0, audio.getNumSamples()));
    }

    Reading drain() noexcept
    {
        return { left.exchange (0.0f, std::memory_order_relaxed),
                 right.exchange (0.0f, std::memory_order_relaxed) };
    }

private:
    static_assert (std::atomic<float>::is_always_lock_free);
    static void accumulate (std::atomic<float>& destination, float peak) noexcept
    {
        // Preserve over-range readings, including infinity, without emitting invalid JSON.
        if (std::isnan (peak)) return;
        peak = juce::jlimit (0.0f, 1000000.0f, peak);
        auto previous = destination.load (std::memory_order_relaxed);
        while (peak > previous && ! destination.compare_exchange_weak (
                   previous, peak, std::memory_order_relaxed, std::memory_order_relaxed)) {}
    }
    std::atomic<float> left { 0.0f }, right { 0.0f };
};
} // namespace ceditor::host
