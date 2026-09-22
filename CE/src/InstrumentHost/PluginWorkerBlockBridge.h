#pragma once

#include "PluginWorkerDataPlane.h"
#include <algorithm>
#include <atomic>
#include <utility>
#include <vector>

// The proxy-side real-time bridge. It is intentionally unaware of processes and Windows
// handles: callbacks inject a zero-time output poll and an input signal. This keeps the audio
// policy independently testable and prevents an accidental blocking wait from being introduced
// into AudioProcessor::processBlock.

namespace ceditor::host::plugin_worker
{

class PluginWorkerBlockBridge
{
public:
    enum class FailureReason : int
    {
        none = 0,
        unavailableDataPlane,
        slotStillOwned,
        invalidInputBlock,
        inputSignalFailed,
        processorException,
        invalidWorkerBlock,
        missedDeadline
    };

    static juce::String failureReasonText (FailureReason reason)
    {
        switch (reason)
        {
            case FailureReason::none:                 return "none";
            case FailureReason::unavailableDataPlane: return "unavailable_data_plane";
            case FailureReason::slotStillOwned:       return "slot_still_owned";
            case FailureReason::invalidInputBlock:    return "invalid_input_block";
            case FailureReason::inputSignalFailed:    return "input_signal_failed";
            case FailureReason::processorException:   return "processor_exception";
            case FailureReason::invalidWorkerBlock:   return "invalid_worker_block";
            case FailureReason::missedDeadline:       return "missed_deadline";
        }

        return "unknown";
    }

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
        FailureReason failureReason = FailureReason::none;
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
            fifoCapacity = config.maxFrames;
            fifoChannels = config.maxOutputChannels;
            audioFifo.assign (static_cast<size_t> (fifoCapacity) * fifoChannels, 0.0);
            queuedMidi.reserve (config.maxMidiBytes);
            setPipelineLatency (fifoCapacity);
        }
    }

    /** Resets the bridge to one prepared-block of latency. Call only while audio processing is
        stopped, immediately after the worker accepts prepareToPlay. */
    void setPipelineLatency (juce::uint32 frames) noexcept
    {
        if (fifoCapacity == 0)
            return;

        frames = juce::jlimit<juce::uint32> (1, fifoCapacity, frames);
        std::fill (audioFifo.begin(), audioFifo.end(), 0.0);
        queuedMidi.clear();
        fifoReadFrame = 0;
        fifoWriteFrame = frames % fifoCapacity;
        fifoFrames = frames;
        fifoReadPosition = 0;
        fifoWritePosition = frames;
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
            trip (FailureReason::unavailableDataPlane);
            applyImmediateFailure (audio, midi);
            result.fallbackUsed = true;
            result.workerFailed = true;
            result.failureReason = currentFailureReason();
            return result;
        }

        if (failed.load (std::memory_order_acquire))
        {
            applyImmediateFailure (audio, midi);
            result.fallbackUsed = true;
            result.workerFailed = true;
            result.failureReason = currentFailureReason();
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
                trip (FailureReason::slotStillOwned);
                applyImmediateFailure (audio, midi);
                result.fallbackUsed = true;
                result.workerFailed = true;
                result.failureReason = currentFailureReason();
                return result;
            }
        }
        if (! current.beginInput (sequence, static_cast<juce::uint32> (audio.getNumSamples()),
                                  activeChannels.inputs, activeChannels.outputs))
        {
            trip (FailureReason::invalidInputBlock);
            applyImmediateFailure (audio, midi);
            result.fallbackUsed = true;
            result.workerFailed = true;
            result.failureReason = currentFailureReason();
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
            trip (FailureReason::inputSignalFailed);
            applyImmediateFailure (audio, midi);
            result.fallbackUsed = true;
            result.workerFailed = true;
            result.failureReason = currentFailureReason();
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
                    rendered = queueWorkerOutput (previous, config);
                    if (rendered)
                    {
                        result.renderedSequence = expected;
                        result.workerOutputUsed = true;
                        result.outputParameterEvents = juce::jmin (
                            header->outputParameterEvents, config.maxParameterEvents);
                        consecutiveMisses = 0;
                    }
                }
                else if (status == BlockStatus::processorException)
                {
                    trip (FailureReason::processorException);
                }
                else if (status == BlockStatus::invalidBlock)
                {
                    trip (FailureReason::invalidWorkerBlock);
                }
            }
        }

        if (! rendered)
        {
            queueDelayedFallback (expected, config);
            result.renderedSequence = expected;
            result.fallbackUsed = true;
            if (expected != 0 && ! failed.load (std::memory_order_acquire)
                && ++consecutiveMisses >= missedBlocksBeforeFailure)
                trip (FailureReason::missedDeadline);
        }

        popQueuedOutput (audio, midi);

        result.workerFailed = failed.load (std::memory_order_acquire);
        result.failureReason = currentFailureReason();
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

    bool queueWorkerOutput (const BlockView& block, const DataPlaneConfig& config) noexcept
    {
        const auto* header = block.getHeader();
        if (header == nullptr || header->numFrames > config.maxFrames
            || header->numOutputChannels > config.maxOutputChannels
            || header->outputMidiBytes > config.maxMidiBytes)
            return false;

        const auto midiBytes = static_cast<size_t> (header->outputMidiBytes);
        juce::MidiBuffer decoded;
        if (! decodeMidi ({ block.outputMidiCapacity().data(), midiBytes }, decoded,
                          header->numFrames))
            return false;

        return queueFrames (header->numFrames, header->numOutputChannels,
                            [&] (juce::uint32 channel, juce::uint32 frame)
                            {
                                return block.outputChannel (channel)[frame];
                            }, decoded);
    }

    void queueDelayedFallback (juce::uint64 expected,
                               const DataPlaneConfig& config) noexcept
    {
        if (expected == 0)
            return;

        const auto previous = plane.slotForSequence (expected);
        const auto* header = previous.getHeader();
        if (header == nullptr
            || header->inputSequence.load (std::memory_order_acquire) != expected
            || header->numFrames > config.maxFrames)
            return;

        if (! effect)
        {
            queueSilence (header->numFrames);
            return;
        }

        const auto midiBytes = juce::jmin (header->inputMidiBytes, config.maxMidiBytes);
        juce::MidiBuffer decoded;
        if (! decodeMidi ({ previous.inputMidiCapacity().data(), midiBytes }, decoded,
                          header->numFrames))
            decoded.clear();

        if (! queueFrames (header->numFrames, header->numInputChannels,
                           [&] (juce::uint32 channel, juce::uint32 frame)
                           {
                               return previous.inputChannel (channel)[frame];
                           }, decoded))
            queueSilence (header->numFrames);
    }

    template <typename ReadSample>
    bool queueFrames (juce::uint32 frames, juce::uint32 channels,
                      ReadSample&& readSample, const juce::MidiBuffer& midi) noexcept
    {
        if (frames > fifoCapacity || fifoFrames + frames > fifoCapacity)
            return false;

        for (juce::uint32 frame = 0; frame < frames; ++frame)
        {
            for (juce::uint32 channel = 0; channel < fifoChannels; ++channel)
                audioFifo[static_cast<size_t> (channel) * fifoCapacity + fifoWriteFrame]
                    = channel < channels ? readSample (channel, frame) : 0.0;
            fifoWriteFrame = (fifoWriteFrame + 1) % fifoCapacity;
        }

        for (const auto metadata : midi)
            queuedMidi.push_back ({ fifoWritePosition + metadata.samplePosition,
                                    metadata.getMessage() });
        fifoWritePosition += frames;
        fifoFrames += frames;
        return true;
    }

    void queueSilence (juce::uint32 frames) noexcept
    {
        static const juce::MidiBuffer noMidi;
        queueFrames (frames, 0, [] (juce::uint32, juce::uint32) { return 0.0; }, noMidi);
    }

    template <typename Sample>
    void popQueuedOutput (juce::AudioBuffer<Sample>& audio, juce::MidiBuffer& midi) noexcept
    {
        const auto frames = static_cast<juce::uint32> (audio.getNumSamples());
        midi.clear();
        for (juce::uint32 frame = 0; frame < frames; ++frame)
        {
            const bool available = fifoFrames > 0;
            for (int channel = 0; channel < audio.getNumChannels(); ++channel)
            {
                const auto value = available && channel < static_cast<int> (fifoChannels)
                    ? audioFifo[static_cast<size_t> (channel) * fifoCapacity + fifoReadFrame]
                    : 0.0;
                audio.setSample (channel, static_cast<int> (frame), static_cast<Sample> (value));
            }
            if (available)
            {
                fifoReadFrame = (fifoReadFrame + 1) % fifoCapacity;
                --fifoFrames;
            }
        }

        const auto endPosition = fifoReadPosition + frames;
        size_t consumedMidi = 0;
        while (consumedMidi < queuedMidi.size()
               && queuedMidi[consumedMidi].position < endPosition)
        {
            const auto& event = queuedMidi[consumedMidi++];
            if (event.position >= fifoReadPosition)
                midi.addEvent (event.message,
                               static_cast<int> (event.position - fifoReadPosition));
        }
        if (consumedMidi != 0)
            queuedMidi.erase (queuedMidi.begin(),
                              queuedMidi.begin() + static_cast<std::ptrdiff_t> (consumedMidi));
        fifoReadPosition = endPosition;
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

    FailureReason currentFailureReason() const noexcept
    {
        return static_cast<FailureReason> (failureReason.load (std::memory_order_acquire));
    }

    void trip (FailureReason reason) noexcept
    {
        bool expected = false;
        if (failed.compare_exchange_strong (expected, true, std::memory_order_acq_rel))
        {
            failureReason.store (static_cast<int> (reason), std::memory_order_release);
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
    struct QueuedMidiEvent
    {
        juce::int64 position = 0;
        juce::MidiMessage message;
    };
    std::vector<double> audioFifo;
    std::vector<QueuedMidiEvent> queuedMidi;
    juce::uint32 fifoCapacity = 0;
    juce::uint32 fifoChannels = 0;
    juce::uint32 fifoReadFrame = 0;
    juce::uint32 fifoWriteFrame = 0;
    juce::uint32 fifoFrames = 0;
    juce::int64 fifoReadPosition = 0;
    juce::int64 fifoWritePosition = 0;
    juce::uint64 nextSequence = 0;
    int consecutiveMisses = 0;
    std::atomic<bool> failed { false };
    std::atomic<int> failureReason { static_cast<int> (FailureReason::none) };
    std::atomic<bool> failurePending { false };
};

} // namespace ceditor::host::plugin_worker
