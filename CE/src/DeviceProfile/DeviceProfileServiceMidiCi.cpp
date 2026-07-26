// MIDI-CI live discovery (MIDI 2.0 plan, phase M1): discovery start,
// message-thread polling pump, and profile set/enable requests.

#include "DeviceProfileService.h"
#include "DeviceProfileServiceInternal.h"

namespace ceditor::device
{
juce::var DeviceProfileService::startMidiCiDiscovery (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    const auto deviceRole = varToStringOr (obj != nullptr ? obj->getProperty ("deviceRole") : juce::var {}, "mainSynth");

    const auto destination = resolveDestination (deviceRole);
    if (destination.type != "hardwareOutput" || destination.id.isEmpty())
        return errorResponse ({}, "MIDI-CI discovery needs a hardware MIDI output mapped for " + deviceRole);

    // (Re)create the session bound to this role's output. onDeviceInfo (fired once PE capabilities are
    // known) kicks off the controller-map + preset fetches that the library does not auto-request.
    midiCiReported.clear();
    midiCiRole = deviceRole;
    midiCiSession = std::make_unique<MidiCiSession> (
        [this, deviceRole] (const juce::MidiMessage& m) { sendRawMidiToRole (deviceRole, m); },
        [this] (uint32_t muid, const juce::var&, const juce::var&)
        {
            if (midiCiSession != nullptr)
            {
                midiCiSession->fetchProperty (muid, "AllCtrlList");
                midiCiSession->fetchProperty (muid, "ProgramList");
                midiCiSession->inquireProfiles (muid); // MIDI-CI Profile Configuration (M2)
            }
        });

    syncMidiInputForRole (deviceRole); // make sure we are listening for the replies
    midiCiActive = true;
    midiCiDeadlineMs = nowMs() + 6000.0; // discovery + property-exchange window
    midiCiSession->startDiscovery();
    midiCiSession->pump();
    startTimerHz (60);

    appendMonitorEvent ("out", deviceRole, "sysex", "MIDI-CI discovery", {}, "Broadcast Discovery");

    auto* result = new juce::DynamicObject();
    result->setProperty ("ok", true);
    result->setProperty ("deviceRole", deviceRole);
    result->setProperty ("muid", (juce::int64) midiCiSession->getMuid());
    result->setProperty ("status", "discovering");
    return juce::var (result);
}

void DeviceProfileService::pollMidiCiDiscovery()
{
    if (! midiCiActive || midiCiSession == nullptr)
        return;

    midiCiSession->pump();
    const bool deadline = nowMs() >= midiCiDeadlineMs;

    for (const auto muid : midiCiSession->getDiscoveredMuids())
    {
        if (midiCiReported.count (muid) != 0)
            continue;

        const auto deviceInfo = midiCiSession->getDeviceInfo (muid);
        const auto allCtrlList = midiCiSession->getFetchedProperty (muid, "AllCtrlList");

        // Emit as soon as a device is fully described (DeviceInfo + controller map). At the deadline,
        // emit anything that at least has DeviceInfo so partial devices still surface.
        const bool complete = deviceInfo != juce::var {} && allCtrlList != juce::var {};
        const bool partialAtDeadline = deadline && deviceInfo != juce::var {};
        if (! complete && ! partialAtDeadline)
            continue;

        midiCiReported.insert (muid);

        auto* o = new juce::DynamicObject();
        o->setProperty ("ok", true);
        o->setProperty ("deviceRole", midiCiRole);
        o->setProperty ("muid", (juce::int64) muid);
        o->setProperty ("deviceInfo", deviceInfo);
        o->setProperty ("channelList", midiCiSession->getChannelList (muid));
        o->setProperty ("allCtrlList", allCtrlList);
        o->setProperty ("programList", midiCiSession->getFetchedProperty (muid, "ProgramList"));
        o->setProperty ("profiles", midiCiSession->getProfiles (muid)); // MIDI-CI block profiles (M2)
        emitDeviceEvent ("midiCiDiscovered", juce::var (o));
        appendMonitorEvent ("sync", midiCiRole, "sysex", "MIDI-CI device discovered", {}, "DeviceInfo received");
    }

    if (deadline)
    {
        midiCiActive = false;
        auto* done = new juce::DynamicObject();
        done->setProperty ("ok", true);
        done->setProperty ("deviceRole", midiCiRole);
        done->setProperty ("discovered", (int) midiCiReported.size());
        emitDeviceEvent ("midiCiDiscoveryComplete", juce::var (done));
    }
}

juce::var DeviceProfileService::setMidiCiProfile (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    if (obj == nullptr || midiCiSession == nullptr)
        return errorResponse ({}, "No active MIDI-CI session — run discovery first");

    const auto muid = (uint32_t) static_cast<juce::int64> (obj->getProperty ("muid"));
    const auto profileId = objectString (obj, "profileId");
    const auto enabled = static_cast<bool> (obj->getProperty ("enabled"));
    if (profileId.isEmpty())
        return errorResponse ({}, "setMidiCiProfile needs a profileId");

    midiCiSession->setProfileEnabled (muid, profileId, enabled);

    // Re-open a short window so the enablement is pumped out and the device's report is processed +
    // re-emitted (clearing the reported flag lets pollMidiCiDiscovery surface the updated profile state).
    midiCiReported.erase (muid);
    midiCiActive = true;
    midiCiDeadlineMs = nowMs() + 3000.0;
    midiCiSession->pump();
    startTimerHz (60);

    appendMonitorEvent ("out", midiCiRole, "sysex", "MIDI-CI profile " + juce::String (enabled ? "enable" : "disable"), {}, profileId);

    auto* result = new juce::DynamicObject();
    result->setProperty ("ok", true);
    result->setProperty ("muid", (juce::int64) muid);
    result->setProperty ("profileId", profileId);
    result->setProperty ("enabled", enabled);
    return juce::var (result);
}
}
