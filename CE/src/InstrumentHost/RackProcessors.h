#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PartMidiFilterCore.h"
#include "Performance/PerformanceEngine.h"
#include "Performance/ArpEngine.h"
#include "Performance/MidiInsertRack.h"
#include "Performance/MidiFxChain.h"

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

// The head of one part's MIDI path. Stage 1 made it the zone filter; Stage 6 makes it the
// whole per-part event chain, in the order the baseline fixes (§18.8.5):
//
//     live MIDI ─ zone filter ─┬─ MIDI FX ─ arpeggiator ─ instrument
//     engine staging ──────────┘
//
// Sequenced events join AFTER the zone filter because they are already addressed to this
// part — a step written for this lane must not be re-gated by a key range meant for a
// keyboard — and BEFORE the FX and arp because a sequence should be transposable and
// arpeggiable like anything else a part plays.
class PartMidiFilterProcessor final : public juce::AudioProcessor
{
public:
    PartMidiFilterProcessor() = default;

    PartMidiFilterCore& getCore()                             { return core; }
    perf::MidiInsertRack& getMidiInserts()                    { return inserts; }

    /** Where this part's sequenced events come from. Null (the default) is a part with no
        engine behind it, which is exactly how the Stage 1 tests still drive this. */
    void setEngine (perf::PerformanceEngine* engineToUse, int partIndexToUse) noexcept
    {
        engine = engineToUse;
        partIndex = partIndexToUse;
    }

    void prepareToPlay (double, int maximumExpectedSamplesPerBlock) override
    {
        const auto size = (size_t) juce::jmax (256, maximumExpectedSamplesPerBlock * 4);
        scratch.ensureSize (size);
        merged.ensureSize (size);
        afterFx.ensureSize (size);
        inserts.prepare (maximumExpectedSamplesPerBlock);
    }

    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        const auto numSamples = audio.getNumSamples();

        core.process (midi, scratch);

        // The engine node runs upstream in the same graph pass, so its staging for this part
        // is already written by the time we read it.
        if (engine != nullptr && partIndex >= 0)
        {
            merged.clear();
            merged.addEvents (scratch, 0, -1, 0);
            merged.addEvents (engine->stagingFor (partIndex), 0, -1, 0);
            scratch.swapWith (merged);
        }

        // The part's MIDI inserts, in the order the player put them: what used to be one
        // welded block plus one arpeggiator is a chain now, and the chain decides.
        const auto block = engine != nullptr ? engine->lastBlockTime()
                                             : perf::Transport::BlockTime();
        inserts.process (scratch, afterFx, block, numSamples);
        midi.swapWith (afterFx);
    }

    /** Releases everything the chain is holding — the panic path reaches every module. */
    void flushEventChain (juce::MidiBuffer& out, int position)
    {
        inserts.allNotesOff (out, position);
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
    perf::MidiInsertRack inserts;
    perf::PerformanceEngine* engine = nullptr;
    int partIndex = -1;
    juce::MidiBuffer scratch, merged, afterFx;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PartMidiFilterProcessor)
};

// The single node that owns musical time. It sits between the MIDI input and every part's
// filter, so the graph's own topological order guarantees the engine has run — and written
// its per-part staging — before any part reads it. Live MIDI passes through untouched; the
// engine's own output never travels this wire.
class PerformanceEngineProcessor final : public juce::AudioProcessor
{
public:
    explicit PerformanceEngineProcessor (perf::PerformanceEngine& engineToDrive)
        : engine (engineToDrive)
    {
    }

    void prepareToPlay (double, int) override {}
    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        engine.processBlock (juce::jmax (1, audio.getNumSamples()), midi);
    }

    const juce::String getName() const override               { return "CEditor Performance Engine"; }
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
    perf::PerformanceEngine& engine;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PerformanceEngineProcessor)
};

// The terminal MIDI node of a hardware-instrument part (Stage 5): forwards the part's
// filtered MIDI to an injected sink — the opened MIDI output in the app, a capture lambda in
// tests — rechannelled to the external synth's listening channel. The sink is swapped under a
// spin lock the audio thread only try-locks: a block that lands mid-swap is dropped rather
// than blocked on, and a swap only ever happens while the very destination is being
// reconfigured.
class MidiSendProcessor final : public juce::AudioProcessor
{
public:
    using Sink = std::function<void (const juce::MidiBuffer&)>;

    MidiSendProcessor() = default;

    void setSink (Sink newSink)
    {
        const juce::SpinLock::ScopedLockType lock (sinkLock);
        sink = std::move (newSink);
    }

    void setOutChannel (int channel1to16) noexcept
    {
        outChannel.store (juce::jlimit (1, 16, channel1to16));
    }

    /** Controlling thread: pushes messages (bank select, program change) straight through the
        sink, outside any audio block. */
    void sendNow (const juce::MidiBuffer& messages)
    {
        const juce::SpinLock::ScopedLockType lock (sinkLock);
        if (sink != nullptr)
            sink (messages);
    }

    void prepareToPlay (double, int) override {}
    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) override
    {
        juce::ignoreUnused (audio);

        const auto channel = outChannel.load();
        rechannelled.clear();
        for (const auto metadata : midi)
        {
            auto message = metadata.getMessage();
            if (message.getChannel() > 0)
                message.setChannel (channel);
            rechannelled.addEvent (message, metadata.samplePosition);
        }

        const juce::SpinLock::ScopedTryLockType lock (sinkLock);
        if (lock.isLocked() && sink != nullptr && ! rechannelled.isEmpty())
            sink (rechannelled);
    }

    const juce::String getName() const override               { return "CEditor Hardware MIDI Send"; }
    bool acceptsMidi() const override                         { return true; }
    bool producesMidi() const override                        { return false; }
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
    juce::SpinLock sinkLock;
    Sink sink;
    std::atomic<int> outChannel { 1 };
    juce::MidiBuffer rechannelled;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MidiSendProcessor)
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
