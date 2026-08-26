#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <vector>

// StubSynthProcessor — the test instrument shared by RackHostTests and
// InstrumentHostServiceTests.
//
// Outputs a known DC level while any of its notes is held and records every MIDI message it
// receives, which turns routing, layering, mixing, panic and replacement into numeric
// assertions with no plug-in installed and no audio device opened. State is one int (`patch`),
// so capture/restore round trips are a single equality check.

namespace ceditor::test
{

struct StubSynthProcessor final : juce::AudioProcessor
{
    explicit StubSynthProcessor (float ampToUse = 0.25f)
        : juce::AudioProcessor (BusesProperties()
                                    .withOutput ("Out", juce::AudioChannelSet::stereo(), true)),
          amp (ampToUse)
    {
    }

    void prepareToPlay (double sampleRate, int) override   { preparedRate = sampleRate; }
    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        for (const auto metadata : midi)
        {
            const auto message = metadata.getMessage();
            received.push_back (message);

            if (message.isNoteOn())
                ++activeNotes;
            else if (message.isNoteOff())
                activeNotes = juce::jmax (0, activeNotes - 1);
            else if (message.isController() && (message.getControllerNumber() == 123
                                                 || message.getControllerNumber() == 120))
                activeNotes = 0;
        }

        audio.clear();
        if (activeNotes > 0)
            for (int ch = 0; ch < audio.getNumChannels(); ++ch)
                juce::FloatVectorOperations::fill (audio.getWritePointer (ch), amp,
                                                   audio.getNumSamples());
    }

    void getStateInformation (juce::MemoryBlock& dest) override
    {
        juce::MemoryOutputStream stream (dest, false);
        stream.writeInt (patch);
    }

    void setStateInformation (const void* data, int size) override
    {
        if (size >= 4)
            patch = juce::MemoryInputStream (data, (size_t) size, false).readInt();
    }

    const juce::String getName() const override               { return "Stub Synth"; }
    bool acceptsMidi() const override                         { return true; }
    bool producesMidi() const override                        { return false; }
    double getTailLengthSeconds() const override              { return 0.0; }
    juce::AudioProcessorEditor* createEditor() override       { return nullptr; }
    bool hasEditor() const override                           { return false; }
    int getNumPrograms() override                             { return 1; }
    int getCurrentProgram() override                          { return 0; }
    void setCurrentProgram (int) override                     {}
    const juce::String getProgramName (int) override          { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    ~StubSynthProcessor() override
    {
        if (destroyedFlag != nullptr)
            *destroyedFlag = true;
    }

    float amp;
    int patch = 0;
    int activeNotes = 0;
    double preparedRate = 0.0;
    std::vector<juce::MidiMessage> received;   // test instrumentation, not RT-safe, fine here
    // For destruction-ordering assertions (the editor-before-processor invariant): the test
    // parks a flag here and checks it is still false inside onInstrumentWillBeRemoved.
    std::shared_ptr<bool> destroyedFlag;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (StubSynthProcessor)
};

} // namespace ceditor::test
