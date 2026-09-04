#pragma once

#include "Microtuning.h"
#include <vector>
#include <juce_audio_basics/juce_audio_basics.h>

namespace ceditor::perf
{

/** Universal Real-Time SysEx, Single Note Tuning Change (08 02), tuning program 0 by
    default. MIDI's count byte tops out at 127, so a full keyboard is intentionally two
    messages. Each note is encoded as semitone plus a 14-bit fraction. */
inline juce::Array<juce::MidiMessage> mtsSingleNoteTuningMessages (const Microtuning& tuning)
{
    juce::Array<juce::MidiMessage> messages;
    for (int first = 0; first < 128; first += 127)
    {
        const auto count = juce::jmin (127, 128 - first);
        std::vector<juce::uint8> body;
        body.reserve ((size_t) 6 + (size_t) count * 4);
        body.push_back (0x7f); // universal real-time
        body.push_back ((juce::uint8) juce::jlimit (0, 127, tuning.mtsDeviceId));
        body.push_back (0x08); // MIDI Tuning Standard
        body.push_back (0x02); // single-note tuning change, no bank
        body.push_back ((juce::uint8) juce::jlimit (0, 127, tuning.mtsProgram));
        body.push_back ((juce::uint8) count);

        for (int note = first; note < first + count; ++note)
        {
            auto pitch = juce::jlimit (0.0, 127.99993896484375,
                                       tunedMidiPitch (tuning, note));
            auto semitone = juce::jlimit (0, 127, (int) std::floor (pitch));
            auto fraction = juce::roundToInt ((pitch - (double) semitone) * 16384.0);
            if (fraction >= 16384)
            {
                fraction = 0;
                semitone = juce::jmin (127, semitone + 1);
            }
            fraction = juce::jlimit (0, 16383, fraction);
            body.push_back ((juce::uint8) note);
            body.push_back ((juce::uint8) semitone);
            body.push_back ((juce::uint8) ((fraction >> 7) & 0x7f));
            body.push_back ((juce::uint8) (fraction & 0x7f));
        }

        messages.add (juce::MidiMessage::createSysExMessage (body.data(), (int) body.size()));
    }
    return messages;
}

} // namespace ceditor::perf
