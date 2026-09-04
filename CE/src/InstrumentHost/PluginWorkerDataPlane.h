#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <new>
#include <span>

// PluginWorkerDataPlane — allocation-free layout shared by the Hostage proxy and one worker.
//
// The operating-system mapping and wake events are intentionally outside this file. Keeping the
// layout as a plain view makes its bounds, sequence fencing and MIDI codec testable without
// launching a process. Kernel events provide the cross-process publication barrier; sequence
// numbers prevent a late/dead worker generation from being mistaken for the current block.

namespace ceditor::host::plugin_worker
{

inline constexpr juce::uint32 dataPlaneMagic = 0x48534450; // "HSDP"
inline constexpr juce::uint16 dataPlaneVersion = 1;
inline constexpr juce::uint16 dataPlaneSlotCount = 2;
inline constexpr juce::uint32 maxSupportedFrames = 16'384;
inline constexpr juce::uint32 maxSupportedChannels = 64;
// This is a per-audio-block transport capacity, not a limit on how many parameters a
// plug-in may expose. Larger inventories are drained across successive blocks.
inline constexpr juce::uint32 maxParameterEventsPerBlock = 4'096;
inline constexpr juce::uint32 maxSupportedMidiBytes = 256 * 1024;

inline constexpr size_t alignUp (size_t value, size_t alignment) noexcept
{
    return (value + alignment - 1) & ~ (alignment - 1);
}

struct DataPlaneConfig
{
    juce::uint32 maxFrames = 0;
    juce::uint32 maxInputChannels = 0;
    juce::uint32 maxOutputChannels = 0;
    juce::uint32 maxParameterEvents = 0;
    juce::uint32 maxMidiBytes = 0;
};

enum ParameterEventFlags : juce::uint32
{
    parameterValue = 0,
    parameterGestureBegin = 1u << 0,
    parameterGestureEnd = 1u << 1
};

struct ParameterEvent
{
    juce::uint32 parameterIndex = 0;
    juce::uint32 sampleOffset = 0;
    float normalizedValue = 0.0f;
    juce::uint32 flags = parameterValue;
};

static_assert (sizeof (ParameterEvent) == 16);

enum class BlockStatus : juce::uint32
{
    empty = 0,
    ready,
    processed,
    processedMidiOverflow,
    processorException,
    invalidBlock
};

enum TransportFlags : juce::uint32
{
    transportPlaying = 1u << 0,
    transportRecording = 1u << 1,
    transportLooping = 1u << 2,
    transportPpqValid = 1u << 3,
    transportBpmValid = 1u << 4,
    transportSamplePositionValid = 1u << 5
};

struct alignas (64) DataPlaneHeader
{
    juce::uint32 magic = dataPlaneMagic;
    juce::uint16 version = dataPlaneVersion;
    juce::uint16 slotCount = dataPlaneSlotCount;
    juce::uint32 mappingBytes = 0;
    juce::uint32 slotStride = 0;
    DataPlaneConfig config;
    juce::uint32 workerGeneration = 0;
    std::atomic<juce::uint64> latestInputSequence { 0 };
    std::atomic<juce::uint64> latestOutputSequence { 0 };
    juce::uint32 reserved[2] {};
};

struct alignas (64) BlockHeader
{
    std::atomic<juce::uint64> inputSequence { 0 };
    std::atomic<juce::uint64> outputSequence { 0 };
    std::atomic<juce::uint32> status { static_cast<juce::uint32> (BlockStatus::empty) };
    juce::uint32 numFrames = 0;
    juce::uint32 numInputChannels = 0;
    juce::uint32 numOutputChannels = 0;
    juce::uint32 inputParameterEvents = 0;
    juce::uint32 outputParameterEvents = 0;
    juce::uint32 inputMidiBytes = 0;
    juce::uint32 outputMidiBytes = 0;
    juce::uint32 transportFlags = 0;
    juce::uint32 reserved = 0;
    juce::int64 samplePosition = 0;
    double ppqPosition = 0.0;
    double bpm = 0.0;
};

static_assert (sizeof (DataPlaneHeader) % 64 == 0);
static_assert (sizeof (BlockHeader) % 64 == 0);
static_assert (std::atomic<juce::uint64>::is_always_lock_free,
               "the shared sequence fence requires lock-free 64-bit atomics");
static_assert (std::atomic<juce::uint32>::is_always_lock_free,
               "the shared status fence requires lock-free 32-bit atomics");

inline bool isValidConfig (const DataPlaneConfig& config) noexcept
{
    return config.maxFrames > 0 && config.maxFrames <= maxSupportedFrames
        && config.maxInputChannels <= maxSupportedChannels
        && config.maxOutputChannels <= maxSupportedChannels
        && (config.maxInputChannels > 0 || config.maxOutputChannels > 0)
        && config.maxParameterEvents > 0
        && config.maxParameterEvents <= maxParameterEventsPerBlock
        && config.maxMidiBytes > 0 && config.maxMidiBytes <= maxSupportedMidiBytes;
}

inline size_t checkedAdd (size_t a, size_t b) noexcept
{
    return b > std::numeric_limits<size_t>::max() - a ? 0 : a + b;
}

inline size_t checkedMultiply (size_t a, size_t b) noexcept
{
    return a != 0 && b > std::numeric_limits<size_t>::max() / a ? 0 : a * b;
}

inline size_t slotBytes (const DataPlaneConfig& config) noexcept
{
    if (! isValidConfig (config))
        return 0;

    const auto inputSamples = checkedMultiply (config.maxFrames, config.maxInputChannels);
    const auto outputSamples = checkedMultiply (config.maxFrames, config.maxOutputChannels);
    if ((config.maxInputChannels != 0 && inputSamples == 0)
        || (config.maxOutputChannels != 0 && outputSamples == 0))
        return 0;

    auto bytes = sizeof (BlockHeader);
    bytes = checkedAdd (bytes, checkedMultiply (inputSamples, sizeof (double)));
    bytes = checkedAdd (bytes, checkedMultiply (outputSamples, sizeof (double)));
    bytes = checkedAdd (bytes, checkedMultiply (
        checkedMultiply (config.maxParameterEvents, 2), sizeof (ParameterEvent)));
    bytes = checkedAdd (bytes, checkedMultiply (config.maxMidiBytes, 2));
    return bytes == 0 ? 0 : alignUp (bytes, 64);
}

inline size_t requiredDataPlaneBytes (const DataPlaneConfig& config) noexcept
{
    const auto stride = slotBytes (config);
    if (stride == 0)
        return 0;
    const auto slots = checkedMultiply (stride, dataPlaneSlotCount);
    return checkedAdd (sizeof (DataPlaneHeader), slots);
}

class BlockView
{
public:
    BlockView() = default;

    explicit operator bool() const noexcept { return header != nullptr; }
    BlockHeader* getHeader() const noexcept { return header; }

    double* inputChannel (juce::uint32 channel) const noexcept
    {
        return header != nullptr && channel < config.maxInputChannels
                 ? inputAudio + static_cast<size_t> (channel) * config.maxFrames
                 : nullptr;
    }

    double* outputChannel (juce::uint32 channel) const noexcept
    {
        return header != nullptr && channel < config.maxOutputChannels
                 ? outputAudio + static_cast<size_t> (channel) * config.maxFrames
                 : nullptr;
    }

    std::span<std::byte> inputMidiCapacity() const noexcept
    {
        return { inputMidi, config.maxMidiBytes };
    }

    std::span<std::byte> outputMidiCapacity() const noexcept
    {
        return { outputMidi, config.maxMidiBytes };
    }

    std::span<ParameterEvent> inputParameterCapacity() const noexcept
    {
        return { inputParameters, config.maxParameterEvents };
    }

    std::span<ParameterEvent> outputParameterCapacity() const noexcept
    {
        return { outputParameters, config.maxParameterEvents };
    }

    bool beginInput (juce::uint64 sequence, juce::uint32 frames,
                     juce::uint32 inputChannels, juce::uint32 outputChannels) const noexcept
    {
        if (header == nullptr || sequence == 0 || frames > config.maxFrames
            || inputChannels > config.maxInputChannels
            || outputChannels > config.maxOutputChannels)
            return false;

        header->inputSequence.store (sequence, std::memory_order_relaxed);
        header->outputSequence.store (0, std::memory_order_relaxed);
        header->status.store (static_cast<juce::uint32> (BlockStatus::ready),
                              std::memory_order_relaxed);
        header->numFrames = frames;
        header->numInputChannels = inputChannels;
        header->numOutputChannels = outputChannels;
        header->inputParameterEvents = 0;
        header->outputParameterEvents = 0;
        header->inputMidiBytes = 0;
        header->outputMidiBytes = 0;
        header->transportFlags = 0;
        header->samplePosition = 0;
        header->ppqPosition = 0.0;
        header->bpm = 0.0;
        return true;
    }

    bool finishOutput (juce::uint64 sequence, juce::uint32 midiBytes,
                       BlockStatus status = BlockStatus::processed) const noexcept
    {
        if (header == nullptr || sequence == 0
            || sequence != header->inputSequence.load (std::memory_order_acquire)
            || midiBytes > config.maxMidiBytes)
            return false;
        header->outputMidiBytes = midiBytes;
        header->status.store (static_cast<juce::uint32> (status), std::memory_order_relaxed);
        header->outputSequence.store (sequence, std::memory_order_release);
        return true;
    }

private:
    friend class DataPlaneView;

    BlockView (BlockHeader* headerToUse, DataPlaneConfig configToUse, std::byte* bytesAfterHeader)
        : header (headerToUse), config (configToUse)
    {
        inputAudio = reinterpret_cast<double*> (bytesAfterHeader);
        outputAudio = inputAudio + static_cast<size_t> (config.maxFrames)
                                   * config.maxInputChannels;
        inputParameters = reinterpret_cast<ParameterEvent*> (outputAudio
                          + static_cast<size_t> (config.maxFrames) * config.maxOutputChannels);
        outputParameters = inputParameters + config.maxParameterEvents;
        inputMidi = reinterpret_cast<std::byte*> (outputParameters + config.maxParameterEvents);
        outputMidi = inputMidi + config.maxMidiBytes;
    }

    BlockHeader* header = nullptr;
    DataPlaneConfig config;
    double* inputAudio = nullptr;
    double* outputAudio = nullptr;
    ParameterEvent* inputParameters = nullptr;
    ParameterEvent* outputParameters = nullptr;
    std::byte* inputMidi = nullptr;
    std::byte* outputMidi = nullptr;
};

class DataPlaneView
{
public:
    DataPlaneView() noexcept = default;

    static DataPlaneView initialise (void* memory, size_t bytes, const DataPlaneConfig& config,
                                     juce::uint32 workerGeneration) noexcept
    {
        const auto required = requiredDataPlaneBytes (config);
        if (memory == nullptr
            || reinterpret_cast<std::uintptr_t> (memory) % alignof (DataPlaneHeader) != 0
            || workerGeneration == 0 || required == 0 || bytes < required)
            return {};

        std::memset (memory, 0, required);
        auto* header = new (memory) DataPlaneHeader();
        header->mappingBytes = static_cast<juce::uint32> (required);
        header->slotStride = static_cast<juce::uint32> (slotBytes (config));
        header->config = config;
        header->workerGeneration = workerGeneration;
        auto* base = static_cast<std::byte*> (memory);
        for (juce::uint16 slot = 0; slot < dataPlaneSlotCount; ++slot)
            new (base + sizeof (DataPlaneHeader)
                      + static_cast<size_t> (slot) * header->slotStride) BlockHeader();
        return DataPlaneView (memory, required);
    }

    static DataPlaneView attach (void* memory, size_t bytes) noexcept
    {
        if (memory == nullptr
            || reinterpret_cast<std::uintptr_t> (memory) % alignof (DataPlaneHeader) != 0
            || bytes < sizeof (DataPlaneHeader))
            return {};
        const auto* header = static_cast<const DataPlaneHeader*> (memory);
        if (header->magic != dataPlaneMagic || header->version != dataPlaneVersion
            || header->slotCount != dataPlaneSlotCount || ! isValidConfig (header->config))
            return {};
        const auto required = requiredDataPlaneBytes (header->config);
        if (required == 0 || header->mappingBytes != required
            || header->slotStride != slotBytes (header->config) || bytes < required
            || header->workerGeneration == 0)
            return {};
        return DataPlaneView (memory, required);
    }

    explicit operator bool() const noexcept { return base != nullptr; }
    DataPlaneHeader* getHeader() const noexcept { return header; }
    size_t sizeBytes() const noexcept { return mappedBytes; }

    BlockView slot (juce::uint32 index) const noexcept
    {
        if (base == nullptr || index >= dataPlaneSlotCount)
            return {};
        auto* slotBase = base + sizeof (DataPlaneHeader)
                       + static_cast<size_t> (index) * header->slotStride;
        auto* block = reinterpret_cast<BlockHeader*> (slotBase);
        return BlockView (block, header->config, slotBase + sizeof (BlockHeader));
    }

    BlockView slotForSequence (juce::uint64 sequence) const noexcept
    {
        return sequence == 0 ? BlockView() : slot (static_cast<juce::uint32> (sequence & 1u));
    }

private:
    DataPlaneView (void* memory, size_t bytes) noexcept
        : base (static_cast<std::byte*> (memory)),
          header (static_cast<DataPlaneHeader*> (memory)), mappedBytes (bytes)
    {
    }

    std::byte* base = nullptr;
    DataPlaneHeader* header = nullptr;
    size_t mappedBytes = 0;
};

struct MidiEncodeResult
{
    juce::uint32 bytes = 0;
    juce::uint32 events = 0;
    bool overflow = false;
};

inline MidiEncodeResult encodeMidi (const juce::MidiBuffer& source,
                                    std::span<std::byte> destination) noexcept
{
    MidiEncodeResult result;
    for (const auto metadata : source)
    {
        if (metadata.numBytes <= 0)
            continue;
        const auto bytesNeeded = sizeof (juce::int32) + sizeof (juce::uint32)
                               + static_cast<size_t> (metadata.numBytes);
        if (bytesNeeded > destination.size() - result.bytes)
        {
            result.overflow = true;
            break;
        }

        const auto position = static_cast<juce::int32> (metadata.samplePosition);
        const auto messageBytes = static_cast<juce::uint32> (metadata.numBytes);
        auto* write = destination.data() + result.bytes;
        std::memcpy (write, &position, sizeof (position));
        write += sizeof (position);
        std::memcpy (write, &messageBytes, sizeof (messageBytes));
        write += sizeof (messageBytes);
        std::memcpy (write, metadata.data, messageBytes);
        result.bytes += static_cast<juce::uint32> (bytesNeeded);
        ++result.events;
    }
    return result;
}

inline bool decodeMidi (std::span<const std::byte> source, juce::MidiBuffer& destination,
                        juce::uint32 maxFrames) noexcept
{
    destination.clear();
    size_t offset = 0;
    while (offset < source.size())
    {
        constexpr auto eventHeaderBytes = sizeof (juce::int32) + sizeof (juce::uint32);
        if (source.size() - offset < eventHeaderBytes)
            return false;

        juce::int32 position = 0;
        juce::uint32 messageBytes = 0;
        std::memcpy (&position, source.data() + offset, sizeof (position));
        std::memcpy (&messageBytes, source.data() + offset + sizeof (position),
                     sizeof (messageBytes));
        offset += eventHeaderBytes;

        if (position < 0 || static_cast<juce::uint32> (position) >= maxFrames
            || messageBytes == 0 || messageBytes > source.size() - offset)
        {
            destination.clear();
            return false;
        }
        if (! destination.addEvent (source.data() + offset, static_cast<int> (messageBytes),
                                    position))
        {
            destination.clear();
            return false;
        }
        offset += messageBytes;
    }
    return true;
}

} // namespace ceditor::host::plugin_worker
