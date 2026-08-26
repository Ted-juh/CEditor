#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PartMidiFilterCore.h"

// RackProcessors — the two per-part graph nodes around an instrument (VIP-successor Stage 1).
//
// The baseline's Stage 1 topology, literally:
//
//     MIDI input ── PartMidiFilterProcessor ── instrument ── GainPanProcessor ──┐
//                                                             (per part)        ├── stereo out
//                                                          ...other parts... ───┘
//
// Both shells are deliberately thin: the filter's behaviour lives in PartMidiFilterCore (where
// a juce_core+audio_basics test can drive it), and the gain node is a ramped stereo multiply.
// All host-facing setters are atomic; InstrumentRackHost owns policy (solo math, panic
// ordering) and calls down.

namespace ceditor::host
{

class PartMidiFilterProcessor final : public juce::AudioProcessor
{
public:
    PartMidiFilterProcessor() = default;

    PartMidiFilterCore& getCore()                             { return core; }

    void prepareToPlay (double, int maximumExpectedSamplesPerBlock) override
    {
        scratch.ensureSize ((size_t) juce::jmax (256, maximumExpectedSamplesPerBlock));
    }

    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        juce::ignoreUnused (audio);
        core.process (midi, scratch);
        midi.swapWith (scratch);
    }

    const juce::String getName() const override               { return "CEditor Part MIDI Filter"; }
    bool acceptsMidi() const override                         { return true; }
    bool producesMidi() const override                        { return true; }
    bool isMidiEffect() const override                        { return true; }
    double getTailLengthSeconds() const override              { return 0.0; }
    juce::AudioProcessorEditor* createEditor() override       { return nullptr; }
    bool hasEditor() const override                           { return false; }
    int getNumPrograms() override                             { return 1; }
    int getCurrentProgram() override                          { return 0; }
    void setCurrentProgram (int) override                     {}
    const juce::String getProgramName (int) override          { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override    {}
    void setStateInformation (const void*, int) override      {}

private:
    PartMidiFilterCore core;
    juce::MidiBuffer scratch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PartMidiFilterProcessor)
};

class GainPanProcessor final : public juce::AudioProcessor
{
public:
    GainPanProcessor()
        : juce::AudioProcessor (BusesProperties()
                                    .withInput ("In", juce::AudioChannelSet::stereo(), true)
                                    .withOutput ("Out", juce::AudioChannelSet::stereo(), true))
    {
    }

    /** Any thread. `audible` folds enabled/mute/solo into one decision the host already made;
        the linear pan law keeps the centre at unity so volume alone predicts the level. */
    void setVolumePan (float volume, float pan, bool audible) noexcept
    {
        const float left  = audible ? volume * juce::jmin (1.0f, 1.0f - pan) : 0.0f;
        const float right = audible ? volume * juce::jmin (1.0f, 1.0f + pan) : 0.0f;
        targetLeft.store (left);
        targetRight.store (right);
    }

    void prepareToPlay (double, int) override
    {
        // Snap on prepare: a restored mixer position must not fade in from silence.
        currentLeft  = targetLeft.load();
        currentRight = targetRight.load();
    }

    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer&) override
    {
        const auto numSamples = audio.getNumSamples();
        const float newLeft  = targetLeft.load();
        const float newRight = targetRight.load();

        if (audio.getNumChannels() > 0)
            audio.applyGainRamp (0, 0, numSamples, currentLeft, newLeft);
        if (audio.getNumChannels() > 1)
            audio.applyGainRamp (1, 0, numSamples, currentRight, newRight);

        currentLeft  = newLeft;
        currentRight = newRight;
    }

    const juce::String getName() const override               { return "CEditor Part Gain/Pan"; }
    bool acceptsMidi() const override                         { return false; }
    bool producesMidi() const override                        { return false; }
    double getTailLengthSeconds() const override              { return 0.0; }
    juce::AudioProcessorEditor* createEditor() override       { return nullptr; }
    bool hasEditor() const override                           { return false; }
    int getNumPrograms() override                             { return 1; }
    int getCurrentProgram() override                          { return 0; }
    void setCurrentProgram (int) override                     {}
    const juce::String getProgramName (int) override          { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override    {}
    void setStateInformation (const void*, int) override      {}

private:
    std::atomic<float> targetLeft { 1.0f }, targetRight { 1.0f };
    float currentLeft = 1.0f, currentRight = 1.0f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (GainPanProcessor)
};

} // namespace ceditor::host
