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
    // has fetched them — poll after discovery). These are auto-fetched by the library.
    juce::var getDeviceInfo (uint32_t muid) const;
    juce::var getChannelList (uint32_t muid) const;

    // The device's ResourceList (which PE resources it offers), available after PE capabilities.
    juce::var getResourceList (uint32_t muid) const;

    // Explicitly request a PE resource that the library does NOT auto-fetch (e.g. "AllCtrlList" /
    // "ChCtrlList" for the controller map, "ProgramList" for presets — the rest of what import-midici.mjs
    // needs). The decoded JSON lands in getFetchedProperty(muid, resource); poll it after pumping.
    void fetchProperty (uint32_t muid, const juce::String& resource);
    juce::var getFetchedProperty (uint32_t muid, const juce::String& resource) const;

    // MIDI-CI Profile Configuration (MIDI 2.0 plan, phase M2). Inquire a device's function-block
    // profiles, read their state, and enable/disable one. Profiles are addressed at the whole block
    // (the common device-wide case); per-channel/group profiles are a later extension.
    void inquireProfiles (uint32_t muid);
    // [{ id: "7E 21 09 01 00", active: true|false }, ...] — empty until the inquiry replies.
    juce::var getProfiles (uint32_t muid) const;
    void setProfileEnabled (uint32_t muid, const juce::String& profileHex, bool enabled);

    // ---- For scripts (ce.ci, docs/design/ce-ci-module.md) ----------------------------------------
    // The session stays open while the device is connected, so these are heard at any time, not only
    // in a window after a Discovery. Every answer is a juce::var a script can be handed as it is.

    struct Events
    {
        std::function<void (uint32_t muid)> added;      // a device answered a Discovery, or announced itself
        std::function<void (uint32_t muid)> removed;    // a device said it is leaving, or stopped answering
        // A profile was turned on or off, by anyone. channel 0 is the whole device, else 1 to 16.
        std::function<void (uint32_t muid, const juce::String& profileHex, int channel, bool enabled)> profileChanged;
    };
    void setEvents (Events events);

    // A discovered device as a script sees it: { muid, manufacturer, family, model, version } as hex
    // text in the form device profiles use ("41", "00 20 6B"; family and model LSB first), names from
    // its DeviceInfo when it gave one, and whether it supports property exchange and profiles. Void
    // for a MUID that has not answered.
    juce::var describe (uint32_t muid) const;

    // A request's answer: { ok, status, message, body, mediaType }. `body` decoded: JSON as a value,
    // text as text, anything else as a list of bytes. ok is false for no reply in time (status 0),
    // the device's own refusal (its status: 404, 405...) or a transaction it cut short.
    using Answer = std::function<void (const juce::var&)>;

    // Read a resource. opts: resId, offset, limit, timeoutMs (default 3000). False when the device
    // does not support property exchange, or is not known.
    bool get (uint32_t muid, const juce::String& resource, const juce::var& opts, Answer done);
    // Change a resource. body: a table is sent as JSON, text as text, and a list of bytes as they are
    // when opts.mediaType says what they are. opts: resId, partial, mediaType, timeoutMs.
    bool set (uint32_t muid, const juce::String& resource, const juce::var& body, const juce::var& opts, Answer done);
    // Follow a resource: `update` gets { command, body } for each "full", "partial" or "notify", and
    // { command = "end" } once when it ends (with ok false when the device refused). 0 when not sent.
    int subscribe (uint32_t muid, const juce::String& resource, const juce::var& opts, Answer update);
    bool unsubscribe (int id);
    // A device's profiles on the whole device and every channel: [{ id, address, enabled }], address
    // "device" or a channel 1 to 16. As last asked; inquireProfiles asks again, and `done` (when given)
    // gets the fresh list once the device has answered for the whole device.
    juce::var profiles (uint32_t muid) const;
    void inquireProfiles (uint32_t muid, Answer done);
    // Turn a profile on or off, for the whole device (channel 0) or one channel, 1 to 16.
    void setProfile (uint32_t muid, const juce::String& profileHex, bool on, int channel);
    // Forget a device: its requests end with no reply, its subscriptions with "end".
    void forget (uint32_t muid);
    // Time goes by: requests past their timeout end with no reply, and waiting ones are sent.
    // True while anything waits, so the owner knows to keep calling.
    bool tick (double nowMs);
    bool busy() const;
    // Tests stand in for the clock that timeouts are read from.
    void setClockForTesting (std::function<double()> clock);

private:
    struct Impl;
    std::unique_ptr<Impl> impl;
};

} // namespace ceditor::device
