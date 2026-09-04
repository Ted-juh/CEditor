#pragma once

#include <array>
#include <cstdint>
#include <juce_audio_basics/juce_audio_basics.h>
#include "PatternModel.h"

namespace ceditor::perf
{

/** Converts one expressive MIDI dialect into another without allocating on the audio thread.

    MPE notes are channel-per-note. Its three conventional dimensions are pitch bend, CC74
    timbre and channel pressure; ordinary poly aftertouch carries a note number instead, while
    channel pressure and CC are monophonic. Converting from polyphonic to monophonic is
    necessarily lossy, so `mpeCollapse` states the rule rather than choosing one invisibly. */
class MpeTransformerEngine
{
public:
    void setSettings (const NoteModuleSettings& next) noexcept { settings = next; }

    void process (const juce::MidiBuffer& in, juce::MidiBuffer& out)
    {
        out.clear();
        if (! settings.mpeEnabled && ! hasActiveVoices())
        {
            out.addEvents (in, 0, -1, 0);
            return;
        }

        for (const auto metadata : in)
        {
            const auto message = metadata.getMessage();
            const auto position = metadata.samplePosition;

            if (message.isNoteOn())
            {
                if (settings.mpeEnabled)
                    noteOn (message, out, position);
                else
                    out.addEvent (message, position);
                continue;
            }

            if (message.isNoteOff())
            {
                if (auto* voice = findVoice (message.getChannel(), message.getNoteNumber()))
                {
                    auto transformed = message;
                    transformed.setChannel (voice->outputChannel);
                    out.addEvent (transformed, position);
                    *voice = {};
                }
                else
                {
                    out.addEvent (message, position);
                }
                continue;
            }

            if (! settings.mpeEnabled || ! isSourceExpression (message))
            {
                out.addEvent (message, position);
                continue;
            }

            const auto value = sourceValue (message);
            const auto sourceIsPerNote = settings.mpeInput == "mpe"
                                      || settings.mpeInput == "poly aftertouch";
            Voice* sourceVoice = nullptr;
            if (settings.mpeInput == "mpe")
                sourceVoice = findVoiceOnInputChannel (message.getChannel());
            else if (settings.mpeInput == "poly aftertouch")
                sourceVoice = findVoice (message.getChannel(), message.getNoteNumber());

            // A per-note gesture with no sounding note has no destination. Suppress it rather
            // than turning stale MPE traffic into a global control jump.
            if (sourceIsPerNote && sourceVoice == nullptr)
                continue;

            if (sourceVoice != nullptr)
                sourceVoice->expression = value;

            if (settings.mpeOutput == "mpe" || settings.mpeOutput == "poly aftertouch")
            {
                if (sourceIsPerNote)
                {
                    emitExpression (out, position, value, *sourceVoice);
                }
                else
                {
                    for (const auto& voice : voices)
                        if (voice.active)
                            emitExpression (out, position, value, voice);
                }
            }
            else
            {
                emitGlobalExpression (out, position,
                                      sourceIsPerNote ? collapsedValue (value) : value);
            }
        }
    }

    void allNotesOff (juce::MidiBuffer& out, int position)
    {
        for (auto& voice : voices)
            if (voice.active)
            {
                out.addEvent (juce::MidiMessage::noteOff (voice.outputChannel, voice.note), position);
                voice = {};
            }
    }

private:
    struct Voice
    {
        bool active = false;
        int inputChannel = 0;
        int note = 0;
        int outputChannel = 0;
        float expression = 0.0f;
        std::uint64_t age = 0;
    };

    static constexpr int maxTrackedVoices = 32;
    std::array<Voice, maxTrackedVoices> voices {};
    NoteModuleSettings settings;
    std::uint64_t ageCounter = 0;
    int nextMemberChannel = 2;

    bool hasActiveVoices() const noexcept
    {
        for (const auto& voice : voices)
            if (voice.active)
                return true;
        return false;
    }

    Voice* findVoice (int inputChannel, int note) noexcept
    {
        Voice* newest = nullptr;
        for (auto& voice : voices)
            if (voice.active && voice.inputChannel == inputChannel && voice.note == note
                && (newest == nullptr || voice.age > newest->age))
                newest = &voice;
        return newest;
    }

    Voice* findVoiceOnInputChannel (int channel) noexcept
    {
        Voice* newest = nullptr;
        for (auto& voice : voices)
            if (voice.active && voice.inputChannel == channel
                && (newest == nullptr || voice.age > newest->age))
                newest = &voice;
        return newest;
    }

    int allocateMemberChannel (juce::MidiBuffer& out, int position)
    {
        const auto first = juce::jlimit (1, 16, settings.mpeMemberFirst);
        const auto last = juce::jlimit (first, 16, settings.mpeMemberLast);
        nextMemberChannel = juce::jlimit (first, last, nextMemberChannel);

        for (int offset = 0; offset <= last - first; ++offset)
        {
            const auto channel = first + ((nextMemberChannel - first + offset) % (last - first + 1));
            bool inUse = false;
            for (const auto& voice : voices)
                inUse = inUse || (voice.active && voice.outputChannel == channel);
            if (! inUse)
            {
                nextMemberChannel = channel == last ? first : channel + 1;
                return channel;
            }
        }

        Voice* oldest = nullptr;
        for (auto& voice : voices)
            if (voice.active && voice.outputChannel >= first && voice.outputChannel <= last
                && (oldest == nullptr || voice.age < oldest->age))
                oldest = &voice;
        if (oldest == nullptr)
            return first;
        const auto channel = oldest->outputChannel;
        out.addEvent (juce::MidiMessage::noteOff (channel, oldest->note), position);
        *oldest = {};
        return channel;
    }

    Voice& allocateVoice (juce::MidiBuffer& out, int position)
    {
        for (auto& voice : voices)
            if (! voice.active)
                return voice;

        auto* oldest = &voices.front();
        for (auto& voice : voices)
            if (voice.age < oldest->age)
                oldest = &voice;
        out.addEvent (juce::MidiMessage::noteOff (oldest->outputChannel, oldest->note), position);
        *oldest = {};
        return *oldest;
    }

    void resetMpeChannel (juce::MidiBuffer& out, int channel, int position) const
    {
        out.addEvent (juce::MidiMessage::pitchWheel (channel, 8192), position);
        out.addEvent (juce::MidiMessage::controllerEvent (channel, 74, 64), position);
        out.addEvent (juce::MidiMessage::channelPressureChange (channel, 0), position);
    }

    void noteOn (const juce::MidiMessage& message, juce::MidiBuffer& out, int position)
    {
        // One MPE member channel represents one finger. A controller that reuses it without
        // releasing the old key is healed here rather than leaving the old destination stuck.
        // Ordinary MIDI can also retrigger the same channel/note before its note-off; that is
        // one logical voice too, so end its old transformed destination before replacing it.
        auto* previous = settings.mpeInput == "mpe"
                       ? findVoiceOnInputChannel (message.getChannel())
                       : findVoice (message.getChannel(), message.getNoteNumber());
        if (previous != nullptr)
        {
            out.addEvent (juce::MidiMessage::noteOff (previous->outputChannel,
                                                      previous->note), position);
            *previous = {};
        }

        auto outputChannel = message.getChannel();
        if (settings.mpeOutput == "mpe")
        {
            outputChannel = allocateMemberChannel (out, position);
            resetMpeChannel (out, outputChannel, position);
        }
        else if (settings.mpeInput == "mpe")
        {
            outputChannel = juce::jlimit (1, 16, settings.mpeOutputChannel);
        }

        auto& voice = allocateVoice (out, position);
        voice.active = true;
        voice.inputChannel = message.getChannel();
        voice.note = message.getNoteNumber();
        voice.outputChannel = outputChannel;
        voice.expression = 0.0f;
        voice.age = ++ageCounter;

        auto transformed = message;
        transformed.setChannel (outputChannel);
        out.addEvent (transformed, position);
    }

    bool isMpeAxisMessage (const juce::MidiMessage& message, const juce::String& axis) const noexcept
    {
        if (message.getChannel() < settings.mpeMemberFirst
            || message.getChannel() > settings.mpeMemberLast)
            return false;
        if (axis == "pitch bend") return message.isPitchWheel();
        if (axis == "timbre")     return message.isController() && message.getControllerNumber() == 74;
        return message.isChannelPressure();
    }

    bool isSourceExpression (const juce::MidiMessage& message) const noexcept
    {
        if (settings.mpeInput == "mpe")
            return isMpeAxisMessage (message, settings.mpeInputAxis);
        if (settings.mpeInput == "poly aftertouch")
            return message.isAftertouch();
        if (settings.mpeInput == "channel pressure")
            return message.isChannelPressure();
        return message.isController() && message.getControllerNumber() == settings.mpeInputCc;
    }

    float sourceValue (const juce::MidiMessage& message) const noexcept
    {
        if (message.isPitchWheel())
            return (float) message.getPitchWheelValue() / 16383.0f;
        if (message.isAftertouch())
            return (float) message.getAfterTouchValue() / 127.0f;
        if (message.isChannelPressure())
            return (float) message.getChannelPressureValue() / 127.0f;
        return (float) message.getControllerValue() / 127.0f;
    }

    float collapsedValue (float latest) const noexcept
    {
        if (settings.mpeCollapse == "latest")
            return latest;
        float sum = 0.0f, highest = 0.0f;
        int count = 0;
        for (const auto& voice : voices)
            if (voice.active)
            {
                sum += voice.expression;
                highest = juce::jmax (highest, voice.expression);
                ++count;
            }
        if (settings.mpeCollapse == "highest")
            return highest;
        return count > 0 ? sum / (float) count : latest;
    }

    static int value7 (float normalized) noexcept
    {
        return juce::jlimit (0, 127, juce::roundToInt (normalized * 127.0f));
    }

    void emitMpeAxis (juce::MidiBuffer& out, int position, int channel, float value) const
    {
        if (settings.mpeOutputAxis == "pitch bend")
            out.addEvent (juce::MidiMessage::pitchWheel (
                              channel, juce::jlimit (0, 16383,
                                                    juce::roundToInt (value * 16383.0f))), position);
        else if (settings.mpeOutputAxis == "timbre")
            out.addEvent (juce::MidiMessage::controllerEvent (channel, 74, value7 (value)), position);
        else
            out.addEvent (juce::MidiMessage::channelPressureChange (channel, value7 (value)), position);
    }

    void emitExpression (juce::MidiBuffer& out, int position, float value,
                         const Voice& voice) const
    {
        if (settings.mpeOutput == "mpe")
            emitMpeAxis (out, position, voice.outputChannel, value);
        else
            out.addEvent (juce::MidiMessage::aftertouchChange (
                              voice.outputChannel, voice.note, value7 (value)), position);
    }

    void emitGlobalExpression (juce::MidiBuffer& out, int position, float value) const
    {
        const auto channel = juce::jlimit (1, 16, settings.mpeOutputChannel);
        if (settings.mpeOutput == "cc")
            out.addEvent (juce::MidiMessage::controllerEvent (
                              channel, juce::jlimit (0, 127, settings.mpeOutputCc),
                              value7 (value)), position);
        else
            out.addEvent (juce::MidiMessage::channelPressureChange (channel, value7 (value)), position);
    }
};

} // namespace ceditor::perf
