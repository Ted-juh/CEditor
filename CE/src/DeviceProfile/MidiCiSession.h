#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

#include <cstdint>
#include <functional>
#include <memory>
#include <vector>

namespace ceditor::device
{

// Thin initiator-side wrapper around juce::midi_ci::Device for live device discovery (MIDI 2.0 plan,
// phase M1). It broadcasts a MIDI-CI Discovery, and for each device that replies it runs Property
// Exchange (ResourceList -> DeviceInfo + ChannelList), handing the results back as juce::var JSON —
// the exact shape CE/dpd/tools/import-midici.mjs already consumes to draft a profile.
//
// Transport-agnostic: outgoing MIDI-CI messages are handed to an injected `SendSysex` (a complete
// bytestream SysEx MidiMessage, ready for any MidiOutput), and incoming SysEx is fed in via
// handleIncomingSysex(). MIDI-CI rides ordinary MIDI 1.0 Universal SysEx, so this works over today's
// cables — no UMP transport required.
//
// Threading: juce::midi_ci::Device is NOT thread-safe. Construct and call every method on a single
// thread (the message thread). The owner is responsible for marshalling incoming MIDI off the MIDI
// thread before calling handleIncomingSysex() (DeviceProfileService already does this).
class MidiCiSession
{
public:
    // Called with a complete SysEx MidiMessage that should be transmitted on the chosen output.
    using SendSysex = std::function<void (const juce::MidiMessage&)>;
    // Called after Property Exchange completes for a discovered device: its MUID plus the DeviceInfo
    // and ChannelList properties as JSON (either may be a null var if the device didn't supply it).
    using OnDeviceInfo = std::function<void (uint32_t muid, const juce::var& deviceInfo, const juce::var& channelList)>;

    explicit MidiCiSession (SendSysex send, OnDeviceInfo onDeviceInfo = {});
    ~MidiCiSession();

    MidiCiSession (const MidiCiSession&) = delete;
    MidiCiSession& operator= (const MidiCiSession&) = delete;

    // Clears the discovered-device cache and broadcasts a Discovery inquiry.
    void startDiscovery();

    // Feed an incoming MIDI message; non-SysEx messages are ignored, CI SysEx is dispatched to the
    // underlying Device (which drives the discovery/PE state machine + the result callbacks).
    void handleIncomingSysex (const juce::MidiMessage& message);

    // Sends any cached MIDI-CI messages that need retrying (call periodically / after delivering input).
    void pump();

    // This device's own MUID.
    uint32_t getMuid() const;

    // The MUIDs of all devices discovered so far.
    std::vector<uint32_t> getDiscoveredMuids() const;

    // The DeviceInfo / ChannelList of a discovered device as JSON (null var until Property Exchange
    // has fetched them — poll after discovery). These are what gets handed to import-midici.mjs.
    juce::var getDeviceInfo (uint32_t muid) const;
    juce::var getChannelList (uint32_t muid) const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl;
};

} // namespace ceditor::device
