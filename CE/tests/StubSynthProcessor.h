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

struct StubSynthProcessor : juce::AudioProcessor
{
    explicit StubSynthProcessor (float ampToUse = 0.25f)
        : juce::AudioProcessor (BusesProperties()
                                    .withOutput ("Out", juce::AudioChannelSet::stereo(), true)),
          amp (ampToUse)
    {
        programs = factoryPrograms;
        // Three host-visible parameters, one per shape the Stage 2 registry classifies —
        // continuous, discrete choice, boolean — with real paramIDs the way hosted VST3
        // parameters carry them (AudioProcessorParameterWithID).
        addParameter (cutoff = new juce::AudioParameterFloat ({ "cutoff", 1 }, "Cutoff", 0.0f, 1.0f, 0.5f));
        addParameter (wave = new juce::AudioParameterChoice ({ "wave", 1 }, "Wave",
                                                             { "Saw", "Square", "Sine" }, 0));
        addParameter (drive = new juce::AudioParameterBool ({ "drive", 1 }, "Drive", false));
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
    // Program-list support, opt-in per test: set `factoryPrograms` BEFORE instantiation and
    // every stub built from then on exposes them, the way a plug-in with an IUnitInfo
    // program list surfaces through JUCE's program API. Empty (the default) reports the
    // API's mandatory single program, which the ingestion correctly reads as "no list" —
    // so the suites that never mention programs keep the library exactly as it was.
    int getNumPrograms() override    { return juce::jmax (1, (int) programs.size()); }
    int getCurrentProgram() override { return currentProgram; }
    void setCurrentProgram (int index) override
    {
        if (index < 0 || index >= (int) programs.size())
            return;
        currentProgram = index;
        *cutoff = programs[(size_t) index].second;   // a program is a sound: it moves state
    }
    const juce::String getProgramName (int index) override
    {
        return index >= 0 && index < (int) programs.size() ? programs[(size_t) index].first
                                                           : juce::String();
    }
    void changeProgramName (int, const juce::String&) override {}

    ~StubSynthProcessor() override
    {
        if (destroyedFlag != nullptr)
            *destroyedFlag = true;
    }

    float amp;
    juce::AudioParameterFloat* cutoff = nullptr;   // owned by the AudioProcessor base
    juce::AudioParameterChoice* wave = nullptr;
    juce::AudioParameterBool* drive = nullptr;
    int patch = 0;
    static inline std::vector<std::pair<juce::String, float>> factoryPrograms;
    std::vector<std::pair<juce::String, float>> programs;
    int currentProgram = 0;
    int activeNotes = 0;
    double preparedRate = 0.0;
    std::vector<juce::MidiMessage> received;   // test instrumentation, not RT-safe, fine here
    // For destruction-ordering assertions (the editor-before-processor invariant): the test
    // parks a flag here and checks it is still false inside onInstrumentWillBeRemoved.
    std::shared_ptr<bool> destroyedFlag;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (StubSynthProcessor)
};

// StubEffectProcessor — the test insert effect (Stage 5): stereo in/out, multiplies the
// signal by a fixed factor so chain order and presence become amplitude assertions, one
// parameter for registry/binding coverage, one int of state for capture round trips.
struct StubEffectProcessor : juce::AudioProcessor
{
    explicit StubEffectProcessor (float factorToUse = 0.5f)
        : juce::AudioProcessor (BusesProperties()
                                    .withInput ("In", juce::AudioChannelSet::stereo(), true)
                                    .withOutput ("Out", juce::AudioChannelSet::stereo(), true)),
          factor (factorToUse)
    {
        addParameter (wet = new juce::AudioParameterFloat ({ "wet", 1 }, "Wet", 0.0f, 1.0f, 1.0f));
        // Reported, not implemented: the latency-visibility tests read this through the
        // graph; the stub does not actually delay, so amplitude tests stay simple.
        setLatencySamples (441);
    }

    void prepareToPlay (double, int) override {}
    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer&) override
    {
        audio.applyGain (factor);
    }

    void getStateInformation (juce::MemoryBlock& dest) override
    {
        juce::MemoryOutputStream stream (dest, false);
        stream.writeInt (tone);
    }

    void setStateInformation (const void* data, int size) override
    {
        if (size >= 4)
            tone = juce::MemoryInputStream (data, (size_t) size, false).readInt();
    }

    const juce::String getName() const override               { return "Stub Effect"; }
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

    ~StubEffectProcessor() override
    {
        if (destroyedFlag != nullptr)
            *destroyedFlag = true;
    }

    float factor;
    juce::AudioParameterFloat* wet = nullptr;
    int tone = 0;
    std::shared_ptr<bool> destroyedFlag;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (StubEffectProcessor)
};

/** An effect that both REPORTS a latency and actually incurs it.

    StubEffectProcessor above reports 441 samples and delays by nothing, which is right for the
    tests it serves — they assert on amplitude and would be harder to read with the signal
    moving. It is exactly wrong for compensation: against an effect that lies about its
    latency, aligning the paths would CREATE the flam it exists to remove, and the test would
    pass while the feature was backwards.

    So this one tells the truth in both directions, and the alignment test uses it. */
struct DelayingEffectProcessor : juce::AudioProcessor
{
    explicit DelayingEffectProcessor (int delaySamples)
        : juce::AudioProcessor (BusesProperties()
                                    .withInput ("In", juce::AudioChannelSet::stereo(), true)
                                    .withOutput ("Out", juce::AudioChannelSet::stereo(), true)),
          delay (delaySamples)
    {
        setLatencySamples (delay);
    }

    void prepareToPlay (double, int) override
    {
        ring.setSize (2, juce::jmax (1, delay + 1), false, true, true);
        ring.clear();
        writeIndex = 0;
    }

    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer&) override
    {
        if (delay <= 0)
            return;

        const auto length = ring.getNumSamples();
        for (int channel = 0; channel < juce::jmin (audio.getNumChannels(), 2); ++channel)
        {
            auto* samples = audio.getWritePointer (channel);
            auto* stored = ring.getWritePointer (channel);
            auto write = writeIndex;

            for (int i = 0; i < audio.getNumSamples(); ++i)
            {
                auto read = write - delay;
                if (read < 0)
                    read += length;

                const auto out = stored[read];
                stored[write] = samples[i];
                samples[i] = out;

                if (++write >= length)
                    write = 0;
            }
        }

        writeIndex = (writeIndex + audio.getNumSamples()) % length;
    }

    const juce::String getName() const override               { return "Delaying Effect"; }
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

    int delay = 0;
    juce::AudioBuffer<float> ring;
    int writeIndex = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DelayingEffectProcessor)
};

} // namespace ceditor::test
