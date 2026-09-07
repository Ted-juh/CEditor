#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include <atomic>
#include <memory>

// AuditionPlayer — the graph node that plays a snapshot, and the handoff to the real thing.
//
// The promise this keeps is the one a browser lives or dies by: a click makes a sound NOW. The
// snapshot the auditioner already rendered starts on the same message that begins loading the
// plug-in, and when the plug-in arrives the snapshot gets out of the way. Everything below is
// about making that swap inaudible.
//
// WHERE IT SITS. One node, wired into whichever part is being auditioned at exactly the point
// its instrument feeds — so the snapshot runs through that part's inserts, its fader, its pan
// and its sends, and is heard at the level the real instrument will be. With no part it feeds
// the master chain instead, which is a preview rather than a rehearsal, and honest about it.
//
// WHY A FADE RATHER THAN A CUT. The snapshot and the live instrument are two different
// renderings of the same sound arriving a few hundred milliseconds apart; cutting between them
// clicks, and a click is exactly the thing that makes a preview feel cheap. The fade is short —
// long enough to be inaudible, short enough that nobody waits for it.

namespace ceditor::host
{

class AuditionPlayer : public juce::AudioProcessor
{
public:
    AuditionPlayer()
        : juce::AudioProcessor (BusesProperties()
                                    .withOutput ("Audition", juce::AudioChannelSet::stereo(), true))
    {}

    /** Starts (or restarts) a snapshot. `sourceRate` is the rate the buffer was stored at; it is
        resampled on the fly against whatever the graph is running, so a 16 kHz snapshot plays at
        48 kHz without anybody converting anything first. Safe from the controlling thread while
        audio is running. */
    void start (juce::AudioBuffer<float> snapshot, double sourceRate)
    {
        auto next = std::make_shared<Clip>();
        next->audio = std::move (snapshot);
        next->rate = sourceRate > 0.0 ? sourceRate : 1.0;

        {
            const juce::SpinLock::ScopedLockType lock (clipLock);
            pending = std::move (next);
        }

        // Playing from HERE, not from the first block that manages to pick the clip up: a
        // caller that starts a snapshot and then asks whether anything is sounding must be told
        // yes, and the browser's indicator must not lag the sound by a block.
        restartPending = true;
        playing = true;
    }

    /** Fades out and stops. The live instrument taking over is the usual caller. */
    void stop (float fadeSeconds = 0.03f)
    {
        fadeSamplesRemaining = juce::jmax (1, (int) (fadeSeconds * juce::jmax (1.0, currentRate)));
        fading = true;
    }

    /** True while anything is audible — the browser's "is it the snapshot or the real thing"
        light reads this. */
    bool isPlaying() const noexcept    { return playing.load(); }

    // -- AudioProcessor -----------------------------------------------------------------------
    void prepareToPlay (double sampleRate, int) override
    {
        currentRate = sampleRate;
        position = 0.0;
    }
    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer&) override
    {
        audio.clear();

        // A block is never blocked waiting for the controlling thread: if a swap is in flight,
        // this block plays what it already had (or nothing) and the next one picks it up.
        {
            const juce::SpinLock::ScopedTryLockType lock (clipLock);
            if (lock.isLocked() && pending != nullptr)
            {
                clip = std::move (pending);
                pending = nullptr;
                position = 0.0;
                gain = 1.0f;
                fading = false;
                restartPending = false;
            }
        }

        // Silence rather than the tail of whatever was playing before, on the rare block where
        // the swap could not take the lock. One quiet block is not audible; a fragment of the
        // previous sound is.
        if (clip == nullptr || ! playing.load() || restartPending.load())
            return;

        const auto& source = clip->audio;
        const auto length = source.getNumSamples();
        if (length <= 0)
        {
            playing = false;
            return;
        }

        const auto step = clip->rate / juce::jmax (1.0, currentRate);
        const auto channels = juce::jmin (2, audio.getNumChannels());

        for (int i = 0; i < audio.getNumSamples(); ++i)
        {
            const auto index = (int) position;
            if (index + 1 >= length)
            {
                playing = false;
                break;
            }

            // Linear between the two neighbours: a preview at a fractional rate, not a resampler
            // anybody masters through.
            const auto fraction = (float) (position - (double) index);
            const auto value = source.getSample (0, index) * (1.0f - fraction)
                                 + source.getSample (0, index + 1) * fraction;

            if (fading)
            {
                gain = juce::jmax (0.0f, gain - 1.0f / (float) juce::jmax (1, fadeSamplesRemaining));
                if (gain <= 0.0f)
                {
                    playing = false;
                    fading = false;
                    break;
                }
            }

            for (int channel = 0; channel < channels; ++channel)
                audio.setSample (channel, i, value * gain);

            position += step;
        }

    }

    const juce::String getName() const override                 { return "Audition"; }
    double getTailLengthSeconds() const override                { return 0.0; }
    bool acceptsMidi() const override                           { return false; }
    bool producesMidi() const override                          { return false; }
    bool isMidiEffect() const override                          { return false; }
    juce::AudioProcessorEditor* createEditor() override         { return nullptr; }
    bool hasEditor() const override                             { return false; }
    int getNumPrograms() override                               { return 1; }
    int getCurrentProgram() override                            { return 0; }
    void setCurrentProgram (int) override                       {}
    const juce::String getProgramName (int) override            { return {}; }
    void changeProgramName (int, const juce::String&) override  {}
    void getStateInformation (juce::MemoryBlock&) override      {}
    void setStateInformation (const void*, int) override        {}

private:
    struct Clip
    {
        juce::AudioBuffer<float> audio;
        double rate = 16000.0;
    };

    juce::SpinLock clipLock;
    std::shared_ptr<Clip> clip, pending;

    std::atomic<bool> playing { false };
    std::atomic<bool> restartPending { false };
    double position = 0.0, currentRate = 44100.0;
    float gain = 1.0f;
    bool fading = false;
    int fadeSamplesRemaining = 1;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AuditionPlayer)
};

} // namespace ceditor::host
