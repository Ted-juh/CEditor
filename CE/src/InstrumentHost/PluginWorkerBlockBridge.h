#pragma once

#include "PluginWorkerDataPlane.h"
#include <algorithm>
#include <atomic>
#include <utility>

// The proxy-side real-time bridge. It is intentionally unaware of processes and Windows
// handles: callbacks inject a zero-time output poll and an input signal. This keeps the audio
// policy independently testable and prevents an accidental blocking wait from being introduced
// into AudioProcessor::processBlock.

namespace ceditor::host::plugin_worker
{

class PluginWorkerBlockBridge
{
public:
    struct ChannelCounts
    {
        juce::uint32 inputs = 0;
        juce::uint32 outputs = 0;
    };

    struct TransportState
    {
        juce::uint32 flags = 0;
        juce::int64 samplePosition = 0;
        double ppqPosition = 0.0;
        double bpm = 0.0;
    };

    struct Result
    {
        juce::uint64 publishedSequence = 0;
        juce::uint64 renderedSequence = 0;
        bool workerOutputUsed = false;
        bool fallbackUsed = false;
        bool inputMidiOverflow = false;
        bool inputParameterOverflow = false;
        juce::uint32 outputParameterEvents = 0;
        bool workerFailed = false;
    };

    PluginWorkerBlockBridge (DataPlaneView planeToUse, bool effectToUse,
                             int missedBlocksBeforeFailureToUse = 4) noexcept
        : PluginWorkerBlockBridge (planeToUse, effectToUse, capacityOf (planeToUse),
                                   missedBlocksBeforeFailureToUse)
    {
    }

    PluginWorkerBlockBridge (DataPlaneView planeToUse, bool effectToUse,
                             ChannelCounts activeChannelsToUse,
                             int missedBlocksBeforeFailureToUse = 4) noexcept
        : plane (planeToUse), effect (effectToUse),
          missedBlocksBeforeFailure (juce::jmax (1, missedBlocksBeforeFailureToUse))
    {
        if (plane)
        {
            const auto& config = plane.getHeader()->config;
            activeChannels.inputs = juce::jmin (activeChannelsToUse.inputs,
                                                 config.maxInputChannels);
            activeChannels.outputs = juce::jmin (activeChannelsToUse.outputs,
                                                  config.maxOutputChannels);
        }
    }

    bool hasFailed() const noexcept { return failed.load (std::memory_order_acquire); }

    bool takeFailure() noexcept
    {
        return failurePending.exchange (false, std::memory_order_acq_rel);
    }

    /** Processes exactly one host block without waiting. `pollOutput` MUST be a zero-time poll;
        when it returns true it also supplies the acquire barrier paired with the worker event.
        `signalInput` publishes the slot after a release fence. */
    template <typename Sample, typename PollOutput, typename SignalInput>
    Result process (juce::AudioBuffer<Sample>& audio, juce::MidiBuffer& midi,
                    PollOutput&& pollOutput, SignalInput&& signalInput) noexcept
    {
        return process (audio, midi, std::span<const ParameterEvent>(),
                        TransportState {},
                        std::forward<PollOutput> (pollOutput),
                        std::forward<SignalInput> (signalInput));
    }

    template <typename Sample, typename PollOutput, typename SignalInput>
    Result process (juce::AudioBuffer<Sample>& audio, juce::MidiBuffer& midi,
                    std::span<const ParameterEvent> parameterEvents,
                    const TransportState& transport,
                    PollOutput&& pollOutput, SignalInput&& signalInput) noexcept
    {
        Result result;
        if (! plane)
        {
            trip();
            applyImmediateFailure (audio, midi);
            result.fallbackUsed = true;
            result.workerFailed = true;
            return result;
        }

        if (failed.load (std::memory_order_acquire))
        {
            applyImmediateFailure (audio, midi);
            result.fallbackUsed = true;
            result.workerFailed = true;
            return result;
        }

        // Poll BEFORE waking the worker for this block. Otherwise an exceptionally fast worker
        // could make one auto-reset event acknowledge block N while we are still rendering N-1.
        const bool outputSignal = static_cast<bool> (pollOutput());
        if (outputSignal)
            std::atomic_thread_fence (std::memory_order_acquire);

        const auto sequence = ++nextSequence;
        result.publishedSequence = sequence;
        const auto current = plane.slotForSequence (sequence);
        const auto& config = plane.getHeader()->config;
        // Two slots are sufficient only while a slot is never reused under a worker that still
        // owns its earlier sequence. If the worker is more than one full block behind, fail it
        // here and leave that memory untouched; the service will terminate/recreate the process.
        // This check is what turns a worker hang into bypass/silence instead of shared-memory
        // corruption.
        if (const auto* reused = current.getHeader(); reused != nullptr)
        {
            const auto oldInput = reused->inputSequence.load (std::memory_order_acquire);
            const auto oldOutput = reused->outputSequence.load (std::memory_order_acquire);
            if (oldInput != 0 && oldOutput != oldInput)
            {
                trip();
                applyImmediateFailure (audio, midi);
                result.fallbackUsed = true;
                result.workerFailed = true;
                return result;
            }
        }
        if (! current.beginInput (sequence, static_cast<juce::uint32> (audio.getNumSamples()),
                                  activeChannels.inputs, activeChannels.outputs))
        {
            trip();
            applyImmediateFailure (audio, midi);
            result.fallbackUsed = true;
            result.workerFailed = true;
            return result;
        }

        copyInputAudio (audio, current);
        const auto encodedMidi = encodeMidi (midi, current.inputMidiCapacity());
        current.getHeader()->inputMidiBytes = encodedMidi.overflow ? 0 : encodedMidi.bytes;
        result.inputMidiOverflow = encodedMidi.overflow;
        auto parameterCapacity = current.inputParameterCapacity();
        const auto parameterCount = juce::jmin (parameterCapacity.size(), parameterEvents.size());
        std::copy_n (parameterEvents.begin(), parameterCount, parameterCapacity.begin());
        current.getHeader()->inputParameterEvents = static_cast<juce::uint32> (parameterCount);
        result.inputParameterOverflow = parameterCount != parameterEvents.size();
        current.getHeader()->transportFlags = transport.flags;
        current.getHeader()->samplePosition = transport.samplePosition;
        current.getHeader()->ppqPosition = transport.ppqPosition;
        current.getHeader()->bpm = transport.bpm;

        plane.getHeader()->latestInputSequence.store (sequence, std::memory_order_release);
        std::atomic_thread_fence (std::memory_order_release);
        if (! static_cast<bool> (signalInput()))
        {
            trip();
            applyImmediateFailure (audio, midi);
            result.fallbackUsed = true;
            result.workerFailed = true;
            return result;
        }

        const auto expected = sequence - 1;
        bool rendered = false;
        if (expected != 0 && outputSignal)
        {
            const auto previous = plane.slotForSequence (expected);
            const auto* header = previous.getHeader();
            if (header != nullptr
                && header->inputSequence.load (std::memory_order_acquire) == expected
                && header->outputSequence.load (std::memory_order_acquire) == expected)
            {
                const auto status = static_cast<BlockStatus> (
                    header->status.load (std::memory_order_acquire));
                if (status == BlockStatus::processed
                    || status == BlockStatus::processedMidiOverflow)
                {
                    rendered = copyWorkerOutput (previous, audio, midi, config);
                    if (rendered)
                    {
                        result.renderedSequence = expected;
                        result.workerOutputUsed = true;
                        result.outputParameterEvents = juce::jmin (
                            header->outputParameterEvents, config.maxParameterEvents);
                        consecutiveMisses = 0;
                    }
                }
                else if (status == BlockStatus::processorException
                         || status == BlockStatus::invalidBlock)
                {
                    trip();
                }
            }
        }

        if (! rendered)
        {
            applyDelayedFallback (expected, audio, midi, config);
            result.renderedSequence = expected;
            result.fallbackUsed = true;
            if (expected != 0 && ! failed.load (std::memory_order_acquire)
                && ++consecutiveMisses >= missedBlocksBeforeFailure)
                trip();
        }

        result.workerFailed = failed.load (std::memory_order_acquire);
        return result;
    }

private:
    template <typename Sample>
    static void copyInputAudio (const juce::AudioBuffer<Sample>& audio,
                                const BlockView& block) noexcept
    {
        const auto frames = static_cast<size_t> (audio.getNumSamples());
        const auto activeInputs = block.getHeader() != nullptr
                                ? block.getHeader()->numInputChannels : 0;
        for (juce::uint32 channel = 0; channel < activeInputs; ++channel)
        {
            auto* destination = block.inputChannel (channel);
            if (channel < static_cast<juce::uint32> (audio.getNumChannels()))
                for (size_t frame = 0; frame < frames; ++frame)
                    destination[frame] = static_cast<double> (audio.getSample (
                        static_cast<int> (channel), static_cast<int> (frame)));
            else
                std::fill_n (destination, frames, 0.0);
        }
    }

    template <typename Sample>
    static bool copyWorkerOutput (const BlockView& block, juce::AudioBuffer<Sample>& audio,
                                  juce::MidiBuffer& midi,
                                  const DataPlaneConfig& config) noexcept
    {
        const auto* header = block.getHeader();
        if (header == nullptr || header->numFrames != static_cast<juce::uint32> (audio.getNumSamples())
            || header->numOutputChannels > config.maxOutputChannels
            || header->outputMidiBytes > config.maxMidiBytes)
            return false;

        for (int channel = 0; channel < audio.getNumChannels(); ++channel)
            if (channel < static_cast<int> (header->numOutputChannels))
                for (int frame = 0; frame < audio.getNumSamples(); ++frame)
                    audio.setSample (channel, frame, static_cast<Sample> (
                        block.outputChannel (static_cast<juce::uint32> (channel))[frame]));
            else
                audio.clear (channel, 0, audio.getNumSamples());

        const auto midiBytes = static_cast<size_t> (header->outputMidiBytes);
        return decodeMidi ({ block.outputMidiCapacity().data(), midiBytes }, midi,
                           header->numFrames);
    }

    template <typename Sample>
    void applyDelayedFallback (juce::uint64 expected, juce::AudioBuffer<Sample>& audio,
                               juce::MidiBuffer& midi,
                               const DataPlaneConfig& config) const noexcept
    {
        if (! effect || expected == 0)
        {
            audio.clear();
            midi.clear();
            return;
        }

        const auto previous = plane.slotForSequence (expected);
        const auto* header = previous.getHeader();
        if (header == nullptr
            || header->inputSequence.load (std::memory_order_acquire) != expected
            || header->numFrames != static_cast<juce::uint32> (audio.getNumSamples()))
        {
            audio.clear();
            midi.clear();
            return;
        }

        for (int channel = 0; channel < audio.getNumChannels(); ++channel)
            if (channel < static_cast<int> (header->numInputChannels))
                for (int frame = 0; frame < audio.getNumSamples(); ++frame)
                    audio.setSample (channel, frame, static_cast<Sample> (
                        previous.inputChannel (static_cast<juce::uint32> (channel))[frame]));
            else
                audio.clear (channel, 0, audio.getNumSamples());

        const auto midiBytes = juce::jmin (header->inputMidiBytes, config.maxMidiBytes);
        if (! decodeMidi ({ previous.inputMidiCapacity().data(), midiBytes }, midi,
                          header->numFrames))
            midi.clear();
    }

    template <typename Sample>
    void applyImmediateFailure (juce::AudioBuffer<Sample>& audio, juce::MidiBuffer& midi) const noexcept
    {
        if (! effect)
        {
            audio.clear();
            midi.clear();
        }
        // An effect that has crossed the failure threshold is removed from the pipeline
        // immediately: its current input is already the correct dry/bypassed block.
    }

    void trip() noexcept
    {
        bool expected = false;
        if (failed.compare_exchange_strong (expected, true, std::memory_order_acq_rel))
        {
            failurePending.store (true, std::memory_order_release);
        }
    }

    static ChannelCounts capacityOf (DataPlaneView source) noexcept
    {
        if (! source)
            return {};
        const auto& config = source.getHeader()->config;
        return { config.maxInputChannels, config.maxOutputChannels };
    }

    DataPlaneView plane;
    const bool effect = false;
    const int missedBlocksBeforeFailure = 4;
    ChannelCounts activeChannels;
    juce::uint64 nextSequence = 0;
    int consecutiveMisses = 0;
    std::atomic<bool> failed { false };
    std::atomic<bool> failurePending { false };
};

} // namespace ceditor::host::plugin_worker
