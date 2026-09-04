#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <atomic>
#include "PartMidiRules.h"

// PartMidiFilterCore — one Hostage rack part's real-time MIDI gate.
//
// Pulled out of the AudioProcessor shell (RackProcessors.h) for the same reason the repo
// pulled RestorePolicy out of PluginProcessor: everything hard in here is ordering, and
// ordering is what must be drivable by a plain test executable on any machine. This header
// needs juce_audio_basics only.
//
// THE INVARIANT THIS FILE EXISTS FOR (baseline §8.6.8): a note-off must reach the same
// destination that received the matching note-on, even when the rules changed in between.
// So acceptance is decided once, at note-on time, and remembered: the tracking table maps
// (source channel, source note) to the transposed note that was actually sent, and a note-off
// consults the table — never the current rules. Changing key, channel or velocity rules can
// therefore never orphan a sounding note; it only changes which future note-ons get in.
//
// THREADING. setRules/setEnabled/requestPanic/requestClear are safe from any thread: rules
// travel as one packed atomic word, the rest are flags the audio thread consumes at the top
// of process(). The tracking table itself is touched only inside process(). Nothing here
// allocates, locks or waits on the audio thread.
//
// PANIC vs CLEAR, both explicit because they answer different events: panic EMITS a note-off
// for every tracked note plus all-notes-off/all-sound-off on every channel and then forgets —
// for a destination that stays alive (disable, rule sweep, the user's panic button). Clear
// only forgets — for a destination that is being destroyed (part replacement/removal), where
// emitting offs would address an instrument that never played the notes.

namespace ceditor::host
{

class PartMidiFilterCore
{
public:
    PartMidiFilterCore()
    {
        setRules (PartMidiRules());
    }

    void setRules (const PartMidiRules& r) noexcept       { packedRules.store (pack (r)); }

    /** Disabling requests a panic as a side effect: the notes that already passed must not
        be stranded ringing behind a gate that no longer opens. */
    void setEnabled (bool shouldBeEnabled) noexcept
    {
        const bool was = enabled.exchange (shouldBeEnabled);
        if (was && ! shouldBeEnabled)
            panicRequested.store (true);
    }

    bool isEnabled() const noexcept                        { return enabled.load(); }
    void requestPanic() noexcept                           { panicRequested.store (true); }
    void requestClear() noexcept                           { clearRequested.store (true); }

    /** Audio-thread entry point: filters `in` into `out` (out is cleared first). */
    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out)
    {
        out.clear();

        if (clearRequested.exchange (false))
            forgetAllTracking();

        if (panicRequested.exchange (false))
            emitPanic (out, 0);

        const auto rules = unpack (packedRules.load());
        const bool on = enabled.load();

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const int position = metadata.samplePosition;

            if (message.isNoteOn())
            {
                if (! on)
                    continue;

                const int channel = message.getChannel();
                const int note = message.getNoteNumber();
                const int velocity = (int) message.getVelocity();

                if (rules.channel != 0 && channel != rules.channel)
                    continue;
                if (note < rules.keyLow || note > rules.keyHigh)
                    continue;
                if (velocity < rules.velocityLow || velocity > rules.velocityHigh)
                    continue;

                const int transposed = note + rules.transpose;
                if (transposed < 0 || transposed > 127)
                    continue;

                // A retrigger with no off in between: if transpose moved since the first
                // note-on, overwriting the table would orphan the note already sent — off it
                // before tracking the new one.
                auto& slot = activeOutNote[(size_t) (channel - 1)][(size_t) note];
                if (slot != 0 && (int) slot - 1 != transposed)
                    out.addEvent (juce::MidiMessage::noteOff (channel, (int) slot - 1), position);

                slot = (juce::uint8) (transposed + 1);
                out.addEvent (juce::MidiMessage::noteOn (channel, transposed,
                                                         (juce::uint8) velocity),
                              position);
            }
            else if (message.isNoteOff())
            {
                // The table, never the current rules: this is the whole invariant.
                const int channel = message.getChannel();
                const int note = message.getNoteNumber();
                auto& tracked = activeOutNote[(size_t) (channel - 1)][(size_t) note];

                if (tracked != 0)
                {
                    out.addEvent (juce::MidiMessage::noteOff (channel, (int) tracked - 1,
                                                              message.getVelocity()),
                                  position);
                    tracked = 0;
                }
            }
            else if (message.getChannel() > 0)
            {
                // Channel messages that are not notes (CC, pitch wheel, aftertouch, program):
                // gate on channel only — a key zone has no meaning for them.
                if (on && (rules.channel == 0 || message.getChannel() == rules.channel))
                    out.addEvent (message, position);
            }
            else
            {
                // Non-channel traffic (system messages) passes while the part is enabled.
                if (on)
                    out.addEvent (message, position);
            }
        }
    }

    /** Emits tracked note-offs plus all-notes-off/all-sound-off on every channel, then
        forgets. Public so the processor shell can reuse it; normal callers use
        requestPanic(). */
    void emitPanic (juce::MidiBuffer& out, int position)
    {
        for (size_t channelIndex = 0; channelIndex < 16; ++channelIndex)
        {
            for (size_t note = 0; note < 128; ++note)
            {
                auto& tracked = activeOutNote[channelIndex][note];
                if (tracked != 0)
                {
                    out.addEvent (juce::MidiMessage::noteOff ((int) channelIndex + 1,
                                                              (int) tracked - 1),
                                  position);
                    tracked = 0;
                }
            }

            out.addEvent (juce::MidiMessage::controllerEvent ((int) channelIndex + 1, 123, 0),
                          position);
            out.addEvent (juce::MidiMessage::controllerEvent ((int) channelIndex + 1, 120, 0),
                          position);
        }
    }

private:
    void forgetAllTracking() noexcept
    {
        for (auto& channel : activeOutNote)
            for (auto& note : channel)
                note = 0;
    }

    static juce::uint64 pack (const PartMidiRules& r) noexcept
    {
        return  ((juce::uint64) (juce::uint8) r.channel)
              | ((juce::uint64) (juce::uint8) r.keyLow        << 8)
              | ((juce::uint64) (juce::uint8) r.keyHigh       << 16)
              | ((juce::uint64) (juce::uint8) r.velocityLow   << 24)
              | ((juce::uint64) (juce::uint8) r.velocityHigh  << 32)
              | ((juce::uint64) (juce::uint8) (juce::int8) r.transpose << 40);
    }

    static PartMidiRules unpack (juce::uint64 packed) noexcept
    {
        PartMidiRules r;
        r.channel      = (int) (packed & 0xff);
        r.keyLow       = (int) ((packed >> 8)  & 0xff);
        r.keyHigh      = (int) ((packed >> 16) & 0xff);
        r.velocityLow  = (int) ((packed >> 24) & 0xff);
        r.velocityHigh = (int) ((packed >> 32) & 0xff);
        r.transpose    = (int) (juce::int8) ((packed >> 40) & 0xff);
        return r;
    }

    // (source channel 1..16, source note) -> sent note + 1; 0 = not sounding.
    juce::uint8 activeOutNote[16][128] = {};

    std::atomic<juce::uint64> packedRules { 0 };
    std::atomic<bool> enabled { true };
    std::atomic<bool> panicRequested { false };
    std::atomic<bool> clearRequested { false };
};

} // namespace ceditor::host
