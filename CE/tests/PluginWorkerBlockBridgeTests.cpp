#include "InstrumentHost/PluginWorkerBlockBridge.h"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <utility>

namespace
{
int failures = 0;

void check (bool condition, const char* label)
{
    std::cout << (condition ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! condition)
        ++failures;
}

using namespace ceditor::host::plugin_worker;

struct Fixture
{
    DataPlaneConfig config { 16, 2, 2, 32, 256 };
    size_t bytes = requiredDataPlaneBytes (config);
    juce::MemoryBlock storage { bytes + alignof (DataPlaneHeader) - 1, true };
    DataPlaneView plane;

    Fixture()
    {
        const auto raw = reinterpret_cast<std::uintptr_t> (storage.getData());
        auto* aligned = reinterpret_cast<void*> (alignUp (raw, alignof (DataPlaneHeader)));
        plane = DataPlaneView::initialise (aligned, bytes, config, 1);
    }

    void complete (juce::uint64 sequence, double gain,
                   BlockStatus status = BlockStatus::processed)
    {
        const auto block = plane.slotForSequence (sequence);
        const auto* header = block.getHeader();
        for (juce::uint32 channel = 0; channel < header->numOutputChannels; ++channel)
            for (juce::uint32 frame = 0; frame < header->numFrames; ++frame)
                block.outputChannel (channel)[frame] = block.inputChannel (channel)[frame] * gain;
        const auto midi = std::span<const std::byte> (block.inputMidiCapacity().data(),
                                                      header->inputMidiBytes);
        std::copy (midi.begin(), midi.end(), block.outputMidiCapacity().begin());
        block.finishOutput (sequence, header->inputMidiBytes, status);
        plane.getHeader()->latestOutputSequence.store (sequence, std::memory_order_release);
    }
};

juce::AudioBuffer<float> audioBlock (float value)
{
    juce::AudioBuffer<float> audio (2, 16);
    for (int channel = 0; channel < audio.getNumChannels(); ++channel)
        for (int frame = 0; frame < audio.getNumSamples(); ++frame)
            audio.setSample (channel, frame, value);
    return audio;
}

void testOneBlockPipeline()
{
    std::cout << "\none-block worker pipeline" << std::endl;
    Fixture fixture;
    PluginWorkerBlockBridge bridge (fixture.plane, true);
    bool outputSignal = false;
    auto poll = [&] { return std::exchange (outputSignal, false); };
    auto signal = [] { return true; };

    auto firstAudio = audioBlock (0.4f);
    juce::MidiBuffer firstMidi;
    firstMidi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 2);
    const auto first = bridge.process (firstAudio, firstMidi, poll, signal);
    check (first.publishedSequence == 1 && first.fallbackUsed
             && std::abs (firstAudio.getSample (0, 0)) < 0.00001f,
           "the startup block publishes input and returns pipeline silence");

    fixture.complete (1, 0.5);
    outputSignal = true;
    auto secondAudio = audioBlock (0.8f);
    juce::MidiBuffer secondMidi;
    const auto second = bridge.process (secondAudio, secondMidi, poll, signal);
    check (second.workerOutputUsed && second.renderedSequence == 1
             && std::abs (secondAudio.getSample (0, 0) - 0.2f) < 0.00001f,
           "block N renders the worker's exact block N-1 output");
    check (secondMidi.getNumEvents() == 1 && (*secondMidi.begin()).samplePosition == 2,
           "sample-positioned worker MIDI returns with the same delayed block");
}

void testDryAndSilentFallback()
{
    std::cout << "\nlate-worker fallback" << std::endl;
    Fixture effectFixture;
    PluginWorkerBlockBridge effect (effectFixture.plane, true, 3);
    auto noOutput = [] { return false; };
    auto signal = [] { return true; };

    auto first = audioBlock (0.3f);
    juce::MidiBuffer midi;
    effect.process (first, midi, noOutput, signal);
    auto second = audioBlock (0.7f);
    midi.clear();
    const auto late = effect.process (second, midi, noOutput, signal);
    check (late.fallbackUsed && std::abs (second.getSample (0, 0) - 0.3f) < 0.00001f,
           "a late effect returns the previous dry block at declared latency");
    check (midi.getNumEvents() == 0,
           "an empty preceding effect block does not invent fallback MIDI");

    Fixture midiEffectFixture;
    PluginWorkerBlockBridge midiEffect (
        midiEffectFixture.plane, true, PluginWorkerBlockBridge::ChannelCounts { 0, 0 }, 3);
    juce::AudioBuffer<float> noAudio (0, 16);
    juce::MidiBuffer firstMidi;
    firstMidi.addEvent (juce::MidiMessage::noteOn (1, 67, (juce::uint8) 96), 5);
    midiEffect.process (noAudio, firstMidi, noOutput, signal);
    juce::MidiBuffer nextMidi;
    midiEffect.process (noAudio, nextMidi, noOutput, signal);
    check (nextMidi.getNumEvents() == 1 && (*nextMidi.begin()).samplePosition == 5,
           "a late MIDI effect passes its preceding MIDI block instead of silencing notes");

    Fixture instrumentFixture;
    PluginWorkerBlockBridge instrument (instrumentFixture.plane, false, 3);
    auto synthFirst = audioBlock (0.6f);
    instrument.process (synthFirst, midi, noOutput, signal);
    auto synthSecond = audioBlock (0.9f);
    instrument.process (synthSecond, midi, noOutput, signal);
    check (std::abs (synthSecond.getSample (0, 0)) < 0.00001f,
           "a late instrument returns silence, never dry input");
}

void testFailureEdges()
{
    std::cout << "\nworker failure edge" << std::endl;
    Fixture fixture;
    PluginWorkerBlockBridge bridge (fixture.plane, true, 2);
    auto noOutput = [] { return false; };
    auto signal = [] { return true; };
    juce::MidiBuffer midi;

    auto one = audioBlock (0.1f);
    bridge.process (one, midi, noOutput, signal);
    auto two = audioBlock (0.2f);
    bridge.process (two, midi, noOutput, signal);
    auto three = audioBlock (0.3f);
    const auto failed = bridge.process (three, midi, noOutput, signal);
    check (failed.workerFailed && bridge.hasFailed(),
           "the bridge fails before reusing a slot still owned by a hung worker");
    check (bridge.takeFailure() && ! bridge.takeFailure(),
           "failure is exposed as one consumable edge");

    Fixture exceptionFixture;
    PluginWorkerBlockBridge exceptionBridge (exceptionFixture.plane, false, 8);
    bool output = false;
    auto poll = [&] { return std::exchange (output, false); };
    auto first = audioBlock (0.2f);
    exceptionBridge.process (first, midi, poll, signal);
    exceptionFixture.complete (1, 0.0, BlockStatus::processorException);
    output = true;
    auto second = audioBlock (0.2f);
    const auto exception = exceptionBridge.process (second, midi, poll, signal);
    check (exception.workerFailed && exceptionBridge.takeFailure(),
           "a reported processor exception trips immediately");

    Fixture signalFixture;
    PluginWorkerBlockBridge signalBridge (signalFixture.plane, true);
    auto block = audioBlock (0.5f);
    const auto disconnected = signalBridge.process (block, midi, noOutput, [] { return false; });
    check (disconnected.workerFailed && signalBridge.takeFailure(),
           "a broken input wake connection trips immediately");
}

void testNegotiatedChannelShape()
{
    std::cout << "\nnegotiated channel shape" << std::endl;
    auto signal = [] { return true; };
    auto noOutput = [] { return false; };
    juce::MidiBuffer midi;

    Fixture monoFixture;
    PluginWorkerBlockBridge mono (
        monoFixture.plane, true, PluginWorkerBlockBridge::ChannelCounts { 1, 1 });
    auto stereo = audioBlock (0.4f);
    mono.process (stereo, midi, noOutput, signal);
    const auto* monoHeader = monoFixture.plane.slotForSequence (1).getHeader();
    check (monoHeader->numInputChannels == 1 && monoHeader->numOutputChannels == 1,
           "reserved capacity does not turn a negotiated mono plug-in into stereo");

    Fixture midiFixture;
    PluginWorkerBlockBridge midiOnly (
        midiFixture.plane, false, PluginWorkerBlockBridge::ChannelCounts { 0, 0 });
    juce::AudioBuffer<float> noAudio (0, 16);
    midi.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 4);
    midiOnly.process (noAudio, midi, noOutput, signal);
    const auto* midiHeader = midiFixture.plane.slotForSequence (1).getHeader();
    check (midiHeader->numInputChannels == 0 && midiHeader->numOutputChannels == 0,
           "a MIDI-only plug-in receives a zero-channel audio buffer");
}
} // namespace

int main()
{
    testOneBlockPipeline();
    testDryAndSilentFallback();
    testFailureEdges();
    testNegotiatedChannelShape();
    std::cout << "\n" << failures << " failure(s)" << std::endl;
    return failures == 0 ? 0 : 1;
}
