#include "InstrumentHost/PluginWorkerDataPlane.h"
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>

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

DataPlaneConfig config()
{
    return { 128, 2, 4, 32, 256 };
}

void* alignedPointer (juce::MemoryBlock& storage)
{
    const auto raw = reinterpret_cast<std::uintptr_t> (storage.getData());
    return reinterpret_cast<void*> (alignUp (raw, alignof (DataPlaneHeader)));
}

void testLayoutAndAttach()
{
    std::cout << "\nshared data-plane layout" << std::endl;
    const auto bytes = requiredDataPlaneBytes (config());
    check (bytes > sizeof (DataPlaneHeader) + 2 * sizeof (BlockHeader),
           "configuration produces two bounded data slots");

    juce::MemoryBlock memory (bytes + alignof (DataPlaneHeader) - 1, true);
    auto* shared = alignedPointer (memory);
    const auto host = DataPlaneView::initialise (shared, bytes, config(), 17);
    check (static_cast<bool> (host), "host initialises the mapping");
    const auto worker = DataPlaneView::attach (shared, bytes);
    check (static_cast<bool> (worker) && worker.getHeader()->workerGeneration == 17,
           "worker attaches to the same version and generation");

    auto tooSmall = juce::MemoryBlock (bytes + alignof (DataPlaneHeader) - 1, true);
    check (! DataPlaneView::initialise (alignedPointer (tooSmall), bytes - 1, config(), 1),
           "a short mapping is refused");

    auto badConfig = config();
    badConfig.maxFrames = maxSupportedFrames + 1;
    check (requiredDataPlaneBytes (badConfig) == 0,
           "unsupported block dimensions cannot create a mapping");

    juce::MemoryBlock corrupt (bytes + alignof (DataPlaneHeader) - 1, true);
    auto* corruptShared = alignedPointer (corrupt);
    std::memcpy (corruptShared, shared, bytes);
    static_cast<DataPlaneHeader*> (corruptShared)->version += 1;
    check (! DataPlaneView::attach (corruptShared, bytes),
           "a worker with another layout version is refused");
}

void testBlockSequenceAndAudio()
{
    std::cout << "\nblock sequencing and audio" << std::endl;
    const auto bytes = requiredDataPlaneBytes (config());
    juce::MemoryBlock memory (bytes + alignof (DataPlaneHeader) - 1, true);
    const auto plane = DataPlaneView::initialise (alignedPointer (memory), bytes, config(), 2);

    const auto first = plane.slotForSequence (41);
    check (first.beginInput (41, 64, 2, 4), "a valid input block is published");
    check (plane.slotForSequence (43).getHeader() == first.getHeader(),
           "sequence parity selects the same fixed slot two blocks later");

    for (juce::uint32 frame = 0; frame < 64; ++frame)
    {
        first.inputChannel (0)[frame] = static_cast<double> (frame) / 64.0;
        first.inputChannel (1)[frame] = -static_cast<double> (frame) / 64.0;
        first.outputChannel (0)[frame] = first.inputChannel (0)[frame] * 0.5;
        first.outputChannel (1)[frame] = first.inputChannel (1)[frame] * 0.5;
    }

    check (first.finishOutput (40, 0) == false,
           "a worker cannot publish output under another sequence");
    check (first.finishOutput (41, 0), "matching worker output completes the block");
    check (first.getHeader()->outputSequence.load (std::memory_order_acquire) == 41
             && first.getHeader()->status.load (std::memory_order_acquire)
                    == static_cast<juce::uint32> (BlockStatus::processed)
             && std::abs (first.outputChannel (0)[32] - 0.25) < 0.000001,
           "completed output carries exact sequence, status and samples");

    first.inputParameterCapacity()[0] = { 7, 12, 0.75f, parameterGestureBegin };
    first.getHeader()->inputParameterEvents = 1;
    check (first.inputParameterCapacity()[0].parameterIndex == 7
             && first.inputParameterCapacity()[0].sampleOffset == 12
             && std::abs (first.inputParameterCapacity()[0].normalizedValue - 0.75f) < 0.0001f,
           "parameter automation shares the same sample-relative block");

    check (! first.beginInput (42, 129, 2, 4), "an oversized block is refused");
    check (! first.beginInput (42, 64, 3, 4), "too many input channels are refused");
}

void testMidiCodec()
{
    std::cout << "\nallocation-free MIDI codec" << std::endl;
    juce::MidiBuffer midi;
    midi.addEvent (juce::MidiMessage::noteOn (2, 64, (juce::uint8) 100), 3);
    const juce::uint8 sysex[] { 0xf0, 0x7d, 0x10, 0x00, 0xf7 };
    midi.addEvent (sysex, static_cast<int> (sizeof (sysex)), 91);

    std::array<std::byte, 64> bytes {};
    const auto encoded = encodeMidi (midi, bytes);
    check (! encoded.overflow && encoded.events == 2 && encoded.bytes > 0,
           "channel and SysEx events fit as whole records");

    juce::MidiBuffer decoded;
    decoded.ensureSize (128);
    check (decodeMidi ({ bytes.data(), encoded.bytes }, decoded, 128),
           "encoded events decode inside the block range");
    auto iterator = decoded.begin();
    const auto first = *iterator++;
    const auto second = *iterator;
    check (decoded.getNumEvents() == 2 && first.samplePosition == 3
             && first.getMessage().isNoteOn() && first.getMessage().getNoteNumber() == 64
             && second.samplePosition == 91 && second.getMessage().isSysEx(),
           "decoded MIDI preserves data, ordering and sample positions");

    std::array<std::byte, 10> tiny {};
    const auto partial = encodeMidi (midi, tiny);
    check (partial.overflow && partial.events == 0 && partial.bytes == 0,
           "overflow never publishes half an event");

    auto invalid = bytes;
    invalid[4] = std::byte { 0xff };
    invalid[5] = std::byte { 0xff };
    invalid[6] = std::byte { 0xff };
    invalid[7] = std::byte { 0x7f };
    check (! decodeMidi ({ invalid.data(), encoded.bytes }, decoded, 128)
             && decoded.isEmpty(),
           "a corrupt event length is refused without partial MIDI");
}
} // namespace

int main()
{
    testLayoutAndAttach();
    testBlockSequenceAndAudio();
    testMidiCodec();
    std::cout << "\n" << failures << " failure(s)" << std::endl;
    return failures == 0 ? 0 : 1;
}
