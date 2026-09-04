#pragma once

#include <array>
#include <atomic>
#include <juce_audio_basics/juce_audio_basics.h>
#include "PatternModel.h"

// ArticulationManagerEngine — turns named trigger notes into messages an instrument uses to
// select articulations. It deliberately wraps the musical MIDI chain rather than sitting inside
// it: trigger notes are controls, so a part's playable key zone must not reject them; generated
// keyswitches must not be transposed, harmonised or scale-folded on their way to the instrument.
//
// A trigger can emit a short keyswitch, bank-select + program change, or one CC. This covers the
// three practical formats exposed by orchestral plug-ins and hardware without putting scripts on
// the audio thread. Trigger note-on performs the action and trigger note-off is consumed.
//
// THREADING. setSlots/setPartInputChannel are the controlling thread. The audio thread only reads
// fixed arrays of atomics. setSlots publishes count=0 while replacing the array, then publishes
// the final count; the only observable intermediate state is a temporarily transparent manager.

namespace ceditor::perf
{

class ArticulationManagerEngine
{
public:
    static constexpr int maxArticulations = 32;

    void setPartInputChannel (int channel) noexcept
    {
        partInputChannel.store (juce::jlimit (0, 16, channel));
    }

    void setPartEnabled (bool shouldBeEnabled) noexcept
    {
        partEnabled.store (shouldBeEnabled);
    }

    void setSlots (const juce::Array<MidiSlot>& slots) noexcept
    {
        count.store (0);
        int next = 0;

        for (const auto& slot : slots)
        {
            if (slot.type != "articulation" || slot.bypassed || ! slot.mod.articulationEnabled)
                continue;

            for (const auto& source : slot.mod.articulations)
            {
                if (next >= maxArticulations)
                    break;

                auto& destination = entries[(size_t) next++];
                destination.triggerNote.store (juce::jlimit (0, 127, source.triggerNote));
                destination.triggerChannel.store (juce::jlimit (0, 16, source.triggerChannel));
                destination.type.store (source.type == "program change" ? programChange
                                      : source.type == "cc" ? controller : keyswitch);
                destination.outputChannel.store (juce::jlimit (0, 16, source.outputChannel));
                destination.keyswitchNote.store (juce::jlimit (0, 127, source.keyswitchNote));
                destination.keyswitchVelocity.store (juce::jlimit (1, 127,
                                                                    source.keyswitchVelocity));
                destination.program.store (juce::jlimit (0, 127, source.program));
                destination.bankMsb.store (juce::jlimit (-1, 127, source.bankMsb));
                destination.bankLsb.store (juce::jlimit (-1, 127, source.bankLsb));
                destination.controllerNumber.store (juce::jlimit (0, 127, source.controller));
                destination.controllerValue.store (juce::jlimit (0, 127,
                                                                  source.controllerValue));
            }

            if (next >= maxArticulations)
                break;
        }

        count.store (next);
    }

    /** Splits input into ordinary playable/configuration MIDI and articulation actions. Both
        outputs are cleared. Actions must be appended after the musical insert chain. */
    void process (const juce::MidiBuffer& input, juce::MidiBuffer& playable,
                  juce::MidiBuffer& actions) const noexcept
    {
        playable.clear();
        actions.clear();
        const auto entriesToRead = count.load();
        const auto partChannel = partInputChannel.load();

        if (! partEnabled.load() || entriesToRead == 0)
        {
            playable.addEvents (input, 0, -1, 0);
            return;
        }

        for (const auto metadata : input)
        {
            const auto message = metadata.getMessage();
            if (! message.isNoteOnOrOff())
            {
                playable.addEvent (message, metadata.samplePosition);
                continue;
            }

            const auto incomingChannel = message.getChannel();
            const auto note = message.getNoteNumber();
            const Compiled* matched = nullptr;
            for (int index = 0; index < entriesToRead; ++index)
            {
                const auto& candidate = entries[(size_t) index];
                if (candidate.triggerNote.load() != note)
                    continue;
                const auto explicitChannel = candidate.triggerChannel.load();
                const auto acceptedChannel = explicitChannel > 0 ? explicitChannel : partChannel;
                if (acceptedChannel == 0 || acceptedChannel == incomingChannel)
                {
                    matched = &candidate;
                    break;
                }
            }

            if (matched == nullptr)
            {
                playable.addEvent (message, metadata.samplePosition);
                continue;
            }

            // The release is consumed too: the trigger is a selector, never a playable note.
            if (message.isNoteOff())
                continue;

            const auto outputChannel = matched->outputChannel.load() > 0
                                         ? matched->outputChannel.load() : incomingChannel;
            const auto position = metadata.samplePosition;
            switch (matched->type.load())
            {
                case programChange:
                    if (const auto msb = matched->bankMsb.load(); msb >= 0)
                        actions.addEvent (juce::MidiMessage::controllerEvent (outputChannel, 0, msb),
                                          position);
                    if (const auto lsb = matched->bankLsb.load(); lsb >= 0)
                        actions.addEvent (juce::MidiMessage::controllerEvent (outputChannel, 32, lsb),
                                          position);
                    actions.addEvent (juce::MidiMessage::programChange (outputChannel,
                                                                         matched->program.load()),
                                      position);
                    break;
                case controller:
                    actions.addEvent (juce::MidiMessage::controllerEvent (
                                          outputChannel, matched->controllerNumber.load(),
                                          matched->controllerValue.load()), position);
                    break;
                case keyswitch:
                default:
                {
                    const auto key = matched->keyswitchNote.load();
                    actions.addEvent (juce::MidiMessage::noteOn (
                                          outputChannel, key,
                                          (juce::uint8) matched->keyswitchVelocity.load()), position);
                    // Most articulation engines latch on note-on; the paired release prevents a
                    // library that tracks held keys from leaving a silent key logically down.
                    actions.addEvent (juce::MidiMessage::noteOff (outputChannel, key), position);
                    break;
                }
            }
        }
    }

private:
    enum OutputType { keyswitch = 0, programChange, controller };
    struct Compiled
    {
        std::atomic<int> triggerNote { 24 };
        std::atomic<int> triggerChannel { 0 };
        std::atomic<int> type { keyswitch };
        std::atomic<int> outputChannel { 0 };
        std::atomic<int> keyswitchNote { 24 };
        std::atomic<int> keyswitchVelocity { 100 };
        std::atomic<int> program { 0 };
        std::atomic<int> bankMsb { -1 };
        std::atomic<int> bankLsb { -1 };
        std::atomic<int> controllerNumber { 0 };
        std::atomic<int> controllerValue { 127 };
    };

    std::array<Compiled, maxArticulations> entries {};
    std::atomic<int> count { 0 };
    std::atomic<int> partInputChannel { 0 };
    std::atomic<bool> partEnabled { true };
};

} // namespace ceditor::perf
