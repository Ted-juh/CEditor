#pragma once
#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include <cstdint>
#include <cmath>

namespace ceditor::host
{
// One audio writer, one controlling-thread reader. Cumulative snapshots avoid averaging
// peaks or weighting short buffers as heavily as long ones. Disabled costs one atomic read.
class SoundcheckMeter
{
public:
    struct Reading { uint64_t token = 0, samples = 0; double energy = 0, seconds = 0; float peak = 0; bool invalid = false; };
    void start (uint64_t token) noexcept { requested.store (token, std::memory_order_release); }
    void stop() noexcept { requested.store (0, std::memory_order_release); }
    void capture (const juce::AudioBuffer<float>& audio, double sampleRate) noexcept
    {
        const auto token = requested.load (std::memory_order_acquire);
        if (token == 0 || sampleRate <= 0 || audio.getNumSamples() == 0) return;
        if (accumulated.token != token) { accumulated = {}; accumulated.token = token; }
        const int channels = juce::jmin (2, audio.getNumChannels());
        if (channels == 0) return;
        for (int c = 0; c < channels; ++c)
            for (int i = 0; i < audio.getNumSamples(); ++i)
            {
                const float value = audio.getReadPointer (c)[i];
                if (! std::isfinite (value)) { accumulated.invalid = true; continue; }
                accumulated.peak = juce::jmax (accumulated.peak, std::abs (value));
                accumulated.energy += (double) value * value;
            }
        accumulated.samples += (uint64_t) channels * (uint64_t) audio.getNumSamples();
        accumulated.seconds += (double) audio.getNumSamples() / sampleRate;
        sequence.fetch_add (1, std::memory_order_seq_cst);
        publishedToken.store (accumulated.token, std::memory_order_relaxed);
        samples.store (accumulated.samples, std::memory_order_relaxed);
        energy.store (accumulated.energy, std::memory_order_relaxed);
        seconds.store (accumulated.seconds, std::memory_order_relaxed);
        peak.store (accumulated.peak, std::memory_order_relaxed);
        invalid.store (accumulated.invalid, std::memory_order_relaxed);
        sequence.fetch_add (1, std::memory_order_release);
    }
    bool read (Reading& result) const noexcept
    {
        for (int attempt = 0; attempt < 3; ++attempt)
        {
            const auto before = sequence.load (std::memory_order_acquire);
            if (before & 1) continue;
            Reading value { publishedToken.load (std::memory_order_relaxed), samples.load (std::memory_order_relaxed),
                energy.load (std::memory_order_relaxed), seconds.load (std::memory_order_relaxed),
                peak.load (std::memory_order_relaxed), invalid.load (std::memory_order_relaxed) };
            std::atomic_thread_fence (std::memory_order_acquire);
            if (before == sequence.load (std::memory_order_relaxed)) { result = value; return true; }
        }
        return false; // keep the previous complete snapshot if the writer overlapped us
    }
private:
    static_assert (std::atomic<uint64_t>::is_always_lock_free && std::atomic<double>::is_always_lock_free
                   && std::atomic<float>::is_always_lock_free && std::atomic<bool>::is_always_lock_free);
    Reading accumulated; // audio thread only
    std::atomic<uint64_t> requested { 0 }, sequence { 0 }, publishedToken { 0 }, samples { 0 };
    std::atomic<double> energy { 0 }, seconds { 0 };
    std::atomic<float> peak { 0 };
    std::atomic<bool> invalid { false };
};
}
