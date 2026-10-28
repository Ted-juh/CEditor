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

    // The role's session, kept from one Discovery to the next (ciSessionFor): the app keeps its MUID,
    // and a device's subscriptions to it, and replies are heard whenever they come.
    midiCiReported.clear();
    midiCiRole = deviceRole;
    auto* session = ciSessionFor (deviceRole, true);

    syncMidiInputForRole (deviceRole); // make sure we are listening for the replies
    midiCiActive = true;
    midiCiDeadlineMs = nowMs() + 6000.0; // discovery + property-exchange window
    session->startDiscovery();
    session->pump();
    startTimerHz (60);

    appendMonitorEvent ("out", deviceRole, "sysex", "MIDI-CI discovery", {}, "Broadcast Discovery");

    auto* result = new juce::DynamicObject();
    result->setProperty ("ok", true);
    result->setProperty ("deviceRole", deviceRole);
    result->setProperty ("muid", (juce::int64) session->getMuid());
    result->setProperty ("status", "discovering");
    return juce::var (result);
}

void DeviceProfileService::pollMidiCiDiscovery()
{
    pollCiSessions();
    auto* midiCiSession = midiCiActive ? ciSessionFor (midiCiRole, false) : nullptr;
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
    auto* midiCiSession = ciSessionFor (midiCiRole, false);
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

// ---- ce.ci ----------------------------------------------------------------------------------------

MidiCiSession* DeviceProfileService::ciSessionFor (const juce::String& role, bool create)
{
    if (const auto it = ciSessions.find (role); it != ciSessions.end()) return it->second.get();
    if (! create) return nullptr;
    auto session = std::make_unique<MidiCiSession> (
        [this, role] (const juce::MidiMessage& m) { sendRawMidiToRole (role, m); },
        // Once a device has said what it can do: what the Discovery screen's draft profile reads, and,
        // for a script, the device itself, now with its names.
        [this, role] (uint32_t muid, const juce::var&, const juce::var&)
        {
            if (auto* s = ciSessionFor (role, false))
            {
                s->fetchProperty (muid, "AllCtrlList");
                s->fetchProperty (muid, "ChCtrlList");
                s->fetchProperty (muid, "ProgramList");
                s->inquireProfiles (muid); // MIDI-CI Profile Configuration (M2)
            }
            emitDeviceEvent ("ciDiscovered", ciDescribe (role, muid));
        });
    session->setEvents ({
        [this, role] (uint32_t muid)
        {
            // A device without property exchange is announced now; one with it once it has said what
            // it has (above), so the announcement carries its names.
            const auto d = ciDescribe (role, muid);
            if (! (bool) d.getProperty ("propertyExchange", false)) emitDeviceEvent ("ciDiscovered", d);
        },
        [this, role] (uint32_t muid)
        {
            auto* o = new juce::DynamicObject();
            o->setProperty ("muid", (juce::int64) muid);
            o->setProperty ("role", role);
            emitDeviceEvent ("ciDeviceRemoved", juce::var (o));
        },
        [this] (uint32_t muid, const juce::String& hex, int channel, bool enabled)
        {
            auto* o = new juce::DynamicObject();
            o->setProperty ("muid", (juce::int64) muid);
            o->setProperty ("id", hex);
            o->setProperty ("address", channel == 0 ? juce::var ("device") : juce::var (channel));
            o->setProperty ("enabled", enabled);
            emitDeviceEvent ("ciProfileChanged", juce::var (o));
        } });
    auto* raw = session.get();
    ciSessions[role] = std::move (session);
    syncMidiInputForRole (role);
    return raw;
}

juce::var DeviceProfileService::ciDescribe (const juce::String& role, uint32_t muid)
{
    auto* session = ciSessionFor (role, false);
    auto d = session != nullptr ? session->describe (muid) : juce::var();
    auto* o = d.getDynamicObject();
    if (o == nullptr) return {};
    o->setProperty ("role", role);
    // The synth the role's device profile describes: the Discovery reply carries the codes an
    // Identity Reply does, so it is matched the same way.
    bool matches = false;
    if (auto* engine = resolveEngine ({}, role))
    {
        const auto manufacturer = o->getProperty ("manufacturer").toString();
        const auto reply = "F0 7E 7F 06 02 " + manufacturer + " " + o->getProperty ("family").toString() + " "
                         + o->getProperty ("model").toString() + " " + o->getProperty ("version").toString() + " F7";
        matches = engine->matchIdentityReply (reply).matched;
    }
    o->setProperty ("matchesProfile", matches);
    return d;
}

juce::String DeviceProfileService::ciRoleOf (uint32_t muid) const
{
    for (const auto& [role, session] : ciSessions)
    {
        const auto found = session->getDiscoveredMuids();
        if (std::find (found.begin(), found.end(), muid) != found.end()) return role;
    }
    return {};
}

void DeviceProfileService::ciReply (const juce::var& token, bool final, const juce::var& result)
{
    auto* o = new juce::DynamicObject();
    o->setProperty ("token", token);
    o->setProperty ("final", final);
    o->setProperty ("result", result);
    emitDeviceEvent ("ciReply", juce::var (o));
}

void DeviceProfileService::pollCiSessions()
{
    bool busy = false;
    for (auto& [role, session] : ciSessions) busy = session->tick (nowMs()) || busy;
    const auto now = nowMs();
    for (auto it = ciDiscoveries.begin(); it != ciDiscoveries.end();)
    {
        if (it->deadline > now) { ++it; busy = true; continue; }
        const auto done = *it;
        it = ciDiscoveries.erase (it);
        juce::Array<juce::var> found;
        if (auto* session = ciSessionFor (done.role, false))
            for (const auto muid : session->getDiscoveredMuids())
                if (auto d = ciDescribe (done.role, muid); ! d.isVoid()) found.add (d);
        ciReply (done.token, true, found);
    }
    if (busy) startTimerHz (30);
}

juce::var DeviceProfileService::oscCommand (const juce::var& payload)
{
    if (oscTransport == nullptr)
    {
        oscTransport = std::make_unique<ceditor::osc::OscService>();
        oscTransport->emit = [this] (const juce::String& name, const juce::var& message) { emitDeviceEvent (name, message); };
        oscTransport->ask = [this] (const juce::String& question, std::function<void (bool)> answer)
        {
            if (askAboutNetwork == nullptr) return false;   // nobody to ask: not taken for a no
            askAboutNetwork (question, std::move (answer));
            return true;
        };
        oscTransport->grantsFile = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                                       .getChildFile ("CEditor").getChildFile ("osc-grants.json");
    }
    return oscTransport->command (payload);
}

juce::var DeviceProfileService::ciCommand (const juce::var& payload)
{
    auto* p = payload.getDynamicObject();
    const auto op = p != nullptr ? p->getProperty ("op").toString() : juce::String();
    const auto fail = [] (const juce::String& error)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("ok", false);
        o->setProperty ("error", error);
        return juce::var (o);
    };
    const auto started = [] (const juce::var& token)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("ok", true);
        o->setProperty ("token", token);
        return juce::var (o);
    };
    if (p == nullptr) return fail ("no command");
    auto role = p->getProperty ("role").toString();
    const auto muid = (uint32_t) (juce::int64) p->getProperty ("muid");
    const auto opts = p->getProperty ("opts");
    auto token = p->getProperty ("token");
    if (token.isVoid() || token.toString().isEmpty()) token = juce::var (ciNextToken++);

    if (op == "discover")
    {
        if (role.isEmpty()) role = "mainSynth";
        const auto destination = resolveDestination (role);
        if (destination.type != "hardwareOutput" || destination.id.isEmpty())
            return fail ("\"" + role + "\" has no hardware MIDI output to ask on");
        auto* session = ciSessionFor (role, true);
        syncMidiInputForRole (role);
        const auto timeoutMs = juce::jlimit (100.0, 60000.0, (double) p->getProperty ("timeoutMs").isVoid() ? 3000.0 : (double) p->getProperty ("timeoutMs"));
        ciDiscoveries.push_back ({ token, role, nowMs() + timeoutMs });
        session->startDiscovery();
        session->pump();
        appendMonitorEvent ("out", role, "sysex", "MIDI-CI discovery", {}, "Broadcast Discovery (script)");
        startTimerHz (30);
        return started (token);
    }

    if (op == "devices")
    {
        juce::Array<juce::var> out;
        for (const auto& [r, session] : ciSessions)
        {
            if (role.isNotEmpty() && r != role) continue;
            for (const auto m : session->getDiscoveredMuids())
                if (auto d = ciDescribe (r, m); ! d.isVoid()) out.add (d);
        }
        return out;
    }

    if (op == "unsubscribe")
    {
        const auto key = p->getProperty ("id").toString();
        const auto it = ciSubscriptions.find (key);
        if (it == ciSubscriptions.end()) return false;
        const auto [r, id] = it->second;
        ciSubscriptions.erase (it);
        if (auto* session = ciSessionFor (r, false)) return session->unsubscribe (id);
        return false;
    }

    // Everything below is about one device the session has met.
    const auto deviceRole = ciRoleOf (muid);
    auto* session = deviceRole.isNotEmpty() ? ciSessionFor (deviceRole, false) : nullptr;
    if (session == nullptr) return fail ("no MIDI-CI device " + juce::String ((juce::int64) muid) + " has answered: ce.ci.discover() finds them");

    if (op == "get" || op == "set")
    {
        const auto resource = p->getProperty ("resource").toString();
        if (resource.isEmpty()) return fail ("resource must be named");
        auto done = [this, token] (const juce::var& result) { ciReply (token, true, result); };
        const bool sent = op == "get" ? session->get (muid, resource, opts, done)
                                      : session->set (muid, resource, p->getProperty ("body"), opts, done);
        if (! sent) return fail ("the device does not support property exchange");
        appendMonitorEvent ("out", deviceRole, "sysex", "MIDI-CI " + op + " " + resource, {}, "Property Exchange (script)");
        startTimerHz (30);
        return started (token);
    }

    if (op == "subscribe")
    {
        const auto resource = p->getProperty ("resource").toString();
        if (resource.isEmpty()) return fail ("resource must be named");
        const auto key = token.toString();
        const auto id = session->subscribe (muid, resource, opts, [this, token, key] (const juce::var& update)
        {
            const bool ended = update.getProperty ("command", "").toString() == "end";
            if (ended) ciSubscriptions.erase (key);
            ciReply (token, ended, update);
        });
        if (id == 0) return fail ("the device does not support property exchange");
        ciSubscriptions[key] = { deviceRole, id };
        startTimerHz (30);
        return started (token);
    }

    if (op == "profiles")
    {
        // Without `ask`, the list as last asked, at once; with it, the device is asked again.
        if (! (bool) p->getProperty ("ask"))
            return session->profiles (muid);
        session->inquireProfiles (muid, [this, token] (const juce::var& list) { ciReply (token, true, list); });
        session->pump();
        startTimerHz (30);
        return started (token);
    }

    if (op == "setProfile")
    {
        const auto id = p->getProperty ("id").toString();
        if (id.isEmpty()) return fail ("the profile must be named, as profiles gives it");
        session->setProfile (muid, id, (bool) p->getProperty ("on"), (int) p->getProperty ("channel"));
        session->pump();
        startTimerHz (30);
        return true;
    }

    return fail ("\"" + op + "\" is not something ce.ci does");
}
}
