#pragma once
#include <juce_audio_basics/juce_audio_basics.h>

namespace ceditor::host::mackie
{
// The Mackie Control section of a keyboard, read as controls rather than as notes to play.
//
// A Mackie Control surface speaks MIDI in a vocabulary of its own: every fader is PITCH BEND
// on a channel of its own (1-8 the channel strips, 9 the master), every button is a NOTE, on
// for the press and off (or on at velocity 0) for the release. Fed to an instrument it bends
// the pitch of whatever listens on channel 1 when you move fader 1 — which is exactly what
// it did before HoSTage read it. Decoded here, fader N is fader N and B1 is a button.
//
// The note numbers are Mackie Control's own, the same on every surface that speaks it: the
// four rows of strip buttons (record, solo, mute, select — which row a surface's buttons send
// is usually the surface's own "button mode", so all four read as button N), bank and channel
// left/right, and the transport.

struct Event
{
    enum class Kind { none, fader, button, bank, transport };
    Kind kind = Kind::none;
    int index = -1;       // fader 0..8, button 0..7, transport 0..4 (rewind, forward, stop, play, record)
    int step = 0;         // bank: -1 or +1
    float value = 0.0f;   // fader position 0..1
    bool down = false;    // button, bank, transport: pressed rather than released
};

enum Transport { rewind = 0, forward = 1, stop = 2, play = 3, record = 4 };

/** Whether an input is a Mackie Control / HUI port, by the name its driver gives it — the
    CTRL49's is "CTRL49 Mackie/HUI". */
inline bool isMackiePort (const juce::String& deviceName)
{
    return deviceName.containsIgnoreCase ("mackie") || deviceName.containsIgnoreCase ("HUI");
}

inline Event decode (const juce::MidiMessage& message)
{
    Event event;
    if (message.isPitchWheel())
    {
        const auto channel = message.getChannel();
        if (channel < 1 || channel > 9)
            return event;
        event.kind = Event::Kind::fader;
        event.index = channel - 1;
        event.value = juce::jlimit (0.0f, 1.0f, (float) message.getPitchWheelValue() / 16383.0f);
        return event;
    }

    if (! message.isNoteOnOrOff())
        return event;

    const auto note = message.getNoteNumber();
    event.down = message.isNoteOn() && message.getVelocity() > 0;

    if (note >= 0x00 && note <= 0x1F)             // record / solo / mute / select, strips 1-8
    {
        event.kind = Event::Kind::button;
        event.index = note % 8;
    }
    else if (note == 0x2E || note == 0x30)        // bank left, channel left
    {
        event.kind = Event::Kind::bank;
        event.step = -1;
    }
    else if (note == 0x2F || note == 0x31)        // bank right, channel right
    {
        event.kind = Event::Kind::bank;
        event.step = 1;
    }
    else if (note >= 0x5B && note <= 0x5F)        // rewind, forward, stop, play, record
    {
        event.kind = Event::Kind::transport;
        event.index = note - 0x5B;
    }
    return event;
}

} // namespace ceditor::host::mackie
