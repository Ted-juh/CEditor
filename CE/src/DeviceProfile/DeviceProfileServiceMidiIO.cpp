// MIDI I/O and session plumbing: port enumeration, role mappings
// (set/export/import), transport capabilities, session/identity state,
// MIDI input wiring per role, outbound transaction send/queue, raw sends,
// the service timer, incoming MidiInput callback, and monitor bookkeeping.

#include "DeviceProfileService.h"
#include "DeviceProfileServiceInternal.h"

namespace ceditor::device
{
juce::var DeviceProfileService::listMidiDestinations() const
{
    juce::Array<juce::var> destinations;

    auto* preview = new juce::DynamicObject();
    preview->setProperty ("id", "previewOnly");
    preview->setProperty ("type", "previewOnly");
    preview->setProperty ("name", "Preview Only");
    preview->setProperty ("canSend", false);
    destinations.add (juce::var (preview));

    auto* none = new juce::DynamicObject();
    none->setProperty ("id", "none");
    none->setProperty ("type", "none");
    none->setProperty ("name", "Disabled");
    none->setProperty ("canSend", false);
    destinations.add (juce::var (none));

    for (const auto& device : juce::MidiOutput::getAvailableDevices())
    {
        auto* hardware = new juce::DynamicObject();
        hardware->setProperty ("id", device.identifier);
        hardware->setProperty ("type", "hardwareOutput");
        hardware->setProperty ("name", device.name);
        hardware->setProperty ("canSend", true);
        destinations.add (juce::var (hardware));
    }

    return destinations;
}

juce::var DeviceProfileService::listMidiInputs() const
{
    juce::Array<juce::var> inputs;

    auto* none = new juce::DynamicObject();
    none->setProperty ("id", "none");
    none->setProperty ("type", "none");
    none->setProperty ("name", "No MIDI Input");
    none->setProperty ("canReceive", false);
    inputs.add (juce::var (none));

    for (const auto& device : juce::MidiInput::getAvailableDevices())
    {
        auto* hardware = new juce::DynamicObject();
        hardware->setProperty ("id", device.identifier);
        hardware->setProperty ("type", "hardwareInput");
        hardware->setProperty ("name", device.name);
        hardware->setProperty ("canReceive", true);
        inputs.add (juce::var (hardware));
    }

    return inputs;
}

juce::var DeviceProfileService::setDeviceRoleMapping (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    if (obj == nullptr)
        return errorResponse ({}, "setDeviceRoleMapping payload must be an object");

    auto role = varToStringOr (obj->getProperty ("role"), "mainSynth");
    auto profileId = obj->getProperty ("profileId").toString();
    if (profileId.isEmpty())
        return errorResponse ({}, "profileId is required");

    loadInternalTestProfiles();
    if (profiles.find (profileId) == profiles.end())
        return errorResponse ({}, "Unknown profileId: " + profileId);

    auto& mapping = roleMappings[role];
    mapping.profileId = profileId;
    if (auto* engine = resolveEngine (profileId, role))
        mapping.syncDirection = engine->getDefaultSyncDirection();

    if (auto* destination = obj->getProperty ("midiDestination").getDynamicObject())
    {
        mapping.destination.type = varToStringOr (destination->getProperty ("type"), "previewOnly");
        mapping.destination.id = varToStringOr (destination->getProperty ("id"), mapping.destination.type);
        mapping.destination.name = varToStringOr (destination->getProperty ("name"), mapping.destination.id);
    }

    if (auto* input = obj->getProperty ("midiInput").getDynamicObject())
    {
        mapping.input.type = varToStringOr (input->getProperty ("type"), "none");
        mapping.input.id = varToStringOr (input->getProperty ("id"), mapping.input.type);
        mapping.input.name = varToStringOr (input->getProperty ("name"), mapping.input.id);
    }

    if (obj->hasProperty ("syncDirection"))
    {
        auto requestedDirection = normalizeSyncDirection (obj->getProperty ("syncDirection").toString());
        mapping.syncDirection = requestedDirection.isNotEmpty() ? requestedDirection : juce::String ("pull");
    }

    syncMidiInputForRole (role);

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("role", role);
    response->setProperty ("profileId", profileId);
    response->setProperty ("midiDestination", midiDestinationToVar (mapping.destination));
    response->setProperty ("midiInput", midiInputToVar (mapping.input));
    response->setProperty ("syncDirection", mapping.syncDirection);
    response->setProperty ("sessionState", getSessionState());
    response->setProperty ("capabilities", getTransportCapabilities());
    return juce::var (response);
}

juce::var DeviceProfileService::exportRoleMappings() const
{
    juce::Array<juce::var> entries;
    for (const auto& pair : roleMappings)
    {
        auto* o = new juce::DynamicObject();
        o->setProperty ("role", pair.first);
        o->setProperty ("profileId", pair.second.profileId);
        o->setProperty ("midiDestination", midiDestinationToVar (pair.second.destination));
        o->setProperty ("midiInput", midiInputToVar (pair.second.input));
        o->setProperty ("syncDirection", pair.second.syncDirection);
        entries.add (juce::var (o));
    }
    return entries;
}

void DeviceProfileService::importRoleMappings (const juce::var& data)
{
    if (auto* arr = data.getArray())
        for (const auto& entry : *arr)
            if (entry.getDynamicObject() != nullptr
                && entry.getProperty ("profileId", "").toString().isNotEmpty())
                setDeviceRoleMapping (entry);
}

juce::var DeviceProfileService::getTransportCapabilities() const
{
    auto* capabilities = new juce::DynamicObject();
    capabilities->setProperty ("transport", "standalone");
    capabilities->setProperty ("canSendMidi", true);
    capabilities->setProperty ("canReceiveMidi", true);
    capabilities->setProperty ("canSendSysex", true);
    capabilities->setProperty ("canReceiveSysex", true);
    capabilities->setProperty ("ownsPorts", true);
    capabilities->setProperty ("supportsTimestamps", true);
    capabilities->setProperty ("supportsInputSelection", true);
    capabilities->setProperty ("supportsOutputSelection", true);
    capabilities->setProperty ("supportsChunkedSysex", true);
    capabilities->setProperty ("supportsScheduledMessages", true);
    capabilities->setProperty ("maxSysexBytes", 1024 * 1024);

    juce::Array<juce::var> endpointTypes;
    endpointTypes.add ("previewOnly");
    endpointTypes.add ("hardwareOutput");
    endpointTypes.add ("hardwareInput");
    capabilities->setProperty ("supportedEndpointTypes", juce::var (endpointTypes));

    juce::Array<juce::var> pluginTransports;
    for (const auto& format : { juce::String ("VST3"), juce::String ("AU"), juce::String ("AUv3"), juce::String ("CLAP") })
    {
        auto* plugin = new juce::DynamicObject();
        plugin->setProperty ("format", format);
        plugin->setProperty ("status", "planned");
        plugin->setProperty ("ownsPorts", false);
        plugin->setProperty ("midiRouting", "host");
        plugin->setProperty ("sysex", "hostDependent");
        pluginTransports.add (juce::var (plugin));
    }
    capabilities->setProperty ("pluginTransportStatus", "planned");
    capabilities->setProperty ("pluginTransports", juce::var (pluginTransports));
    return juce::var (capabilities);
}

juce::var DeviceProfileService::getSessionState() const
{
    auto* root = new juce::DynamicObject();

    for (const auto& [role, mapping] : roleMappings)
    {
        auto* roleObject = new juce::DynamicObject();
        roleObject->setProperty ("role", role);
        roleObject->setProperty ("profileId", mapping.profileId);
        roleObject->setProperty ("syncDirection", mapping.syncDirection);
        roleObject->setProperty ("state", sessionStateForMapping (mapping));
        roleObject->setProperty ("message", mapping.sessionMessage);
        roleObject->setProperty ("identityStatus", mapping.identityStatus);
        roleObject->setProperty ("identityMessage", mapping.identityMessage);
        roleObject->setProperty ("midiDestination", midiDestinationToVar (mapping.destination));
        roleObject->setProperty ("midiInput", midiInputToVar (mapping.input));
        roleObject->setProperty ("lastInboundAtMs", mapping.lastInboundAtMs);
        roleObject->setProperty ("lastReadyAtMs", mapping.lastReadyAtMs);
        roleObject->setProperty ("lastIdentityAtMs", mapping.lastIdentityAtMs);
        root->setProperty (role, juce::var (roleObject));
    }

    root->setProperty ("pendingRequests", getPendingDeviceRequests());
    return juce::var (root);
}

juce::var DeviceProfileService::overrideDeviceIdentityMismatch (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto role = varToStringOr (obj != nullptr ? obj->getProperty ("deviceRole") : juce::var {}, "mainSynth");
    auto profileId = objectString (obj, "profileId");
    auto reason = varToStringOr (obj != nullptr ? obj->getProperty ("reason") : juce::var {},
                                 "User accepted identity mismatch");

    auto mapping = roleMappings.find (role);
    if (mapping == roleMappings.end())
        return errorResponse (role, "No device role mapping exists for role: " + role);

    if (profileId.isNotEmpty() && mapping->second.profileId != profileId)
        return errorResponse (role, "Role " + role + " is mapped to " + mapping->second.profileId + ", not " + profileId);

    mapping->second.identityStatus = "overridden";
    mapping->second.identityMessage = reason;
    mapping->second.sessionState = "ready";
    mapping->second.sessionMessage = "Identity mismatch accepted by user";
    mapping->second.lastIdentityAtMs = nowMs();
    mapping->second.lastReadyAtMs = mapping->second.lastIdentityAtMs;

    appendMonitorEvent ("identity",
                        role,
                        "identity",
                        "override",
                        juce::String {},
                        "Identity mismatch accepted by user");

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("deviceRole", role);
    response->setProperty ("profileId", mapping->second.profileId);
    response->setProperty ("identityStatus", mapping->second.identityStatus);
    response->setProperty ("message", mapping->second.identityMessage);
    response->setProperty ("sessionState", getSessionState());
    return juce::var (response);
}

DeviceProfileService::MidiDestination DeviceProfileService::resolveDestination (const juce::String& deviceRole) const
{
    auto role = roleMappings.find (deviceRole);
    return role != roleMappings.end() ? role->second.destination : MidiDestination {};
}

juce::String DeviceProfileService::resolveRoleForMidiInput (const juce::MidiInput* source) const
{
    const juce::ScopedLock lock (midiInputLock);
    for (const auto& [role, input] : midiInputsByRole)
        if (input.get() == source)
            return role;

    return {};
}

void DeviceProfileService::updateRoleSessionState (const juce::String& role,
                                                   const juce::String& state,
                                                   const juce::String& message)
{
    auto mapping = roleMappings.find (role);
    if (mapping == roleMappings.end())
        return;

    mapping->second.sessionState = state;
    mapping->second.sessionMessage = message;
    if (state == "ready")
        mapping->second.lastReadyAtMs = nowMs();
}

void DeviceProfileService::updateRoleIdentityState (const juce::String& role, const IdentityMatchResult& result)
{
    auto mapping = roleMappings.find (role);
    if (mapping == roleMappings.end())
        return;

    mapping->second.identityStatus = result.matched ? "matched" : "mismatch";
    mapping->second.identityMessage = result.matched
        ? "Matched identity " + result.manufacturerIdHex + " / " + result.modelNumberHex
        : result.error;
    mapping->second.lastIdentityAtMs = nowMs();
}

void DeviceProfileService::syncMidiInputForRole (const juce::String& role)
{
    auto mapping = roleMappings.find (role);
    if (mapping == roleMappings.end())
        return;

    {
        const juce::ScopedLock lock (midiInputLock);
        auto existing = midiInputsByRole.find (role);
        if (existing != midiInputsByRole.end())
        {
            if (existing->second != nullptr)
                existing->second->stop();
            midiInputsByRole.erase (existing);
        }
    }

    if (mapping->second.input.type != "hardwareInput")
    {
        updateRoleSessionState (role,
                                mapping->second.destination.type == "hardwareOutput" ? "linked" : "preview",
                                mapping->second.destination.type == "hardwareOutput" ? "MIDI output linked; no input selected"
                                                                                       : "Preview only");
        return;
    }

    if (mapping->second.input.id.isEmpty())
    {
        updateRoleSessionState (role, "error", "Hardware MIDI input id is empty");
        return;
    }

    auto input = juce::MidiInput::openDevice (mapping->second.input.id, this);
    if (input == nullptr)
    {
        updateRoleSessionState (role, "error", "Could not open MIDI input: " + mapping->second.input.name);
        return;
    }

    input->start();
    {
        const juce::ScopedLock lock (midiInputLock);
        midiInputsByRole[role] = std::move (input);
    }
    updateRoleSessionState (role, "linked", "MIDI input linked; identity not verified");
}

bool DeviceProfileService::sendTransactionNow (const juce::String& deviceRole,
                                               const MidiTransaction& transaction,
                                               juce::String& error,
                                               juce::String* status,
                                               int startMessageIndex)
{
    auto destination = resolveDestination (deviceRole);
    if (destination.type != "hardwareOutput")
    {
        error = destination.type == "none" ? "MIDI destination is disabled"
                                           : "MIDI destination is preview-only";
        return false;
    }

    if (destination.id.isEmpty())
    {
        error = "Hardware MIDI destination id is empty";
        return false;
    }

    auto& output = midiOutputs[destination.id];
    if (output == nullptr)
    {
        output = juce::MidiOutput::openDevice (destination.id);
        if (output == nullptr)
        {
            error = "Could not open MIDI output: " + destination.name;
            return false;
        }
    }

    const auto key = deviceRole + ":" + transaction.parameterId;
    const auto firstMessageIndex = juce::jlimit (0, transaction.messages.size(), startMessageIndex);
    auto sentCount = 0;

    for (auto messageIndex = firstMessageIndex; messageIndex < transaction.messages.size(); ++messageIndex)
    {
        const auto& message = transaction.messages[messageIndex];
        std::vector<unsigned char> bytes;
        bytes.reserve (static_cast<size_t> (message.bytes.size()));
        for (auto byte : message.bytes)
            bytes.push_back (static_cast<unsigned char> (juce::jlimit (0, 255, byte)));

        if (bytes.empty())
            continue;

        output->sendMessageNow (juce::MidiMessage (bytes.data(), static_cast<int> (bytes.size())));
        ++sentCount;
        lastSentAtMs[key] = nowMs();

        auto nextMessageIndex = messageIndex + 1;
        while (nextMessageIndex < transaction.messages.size()
               && transaction.messages[nextMessageIndex].bytes.isEmpty())
            ++nextMessageIndex;

        const auto delayAfterMs = juce::jmax (0, message.delayAfterMs);
        if (delayAfterMs > 0 && nextMessageIndex < transaction.messages.size())
        {
            queuedTransactions.push_back ({ deviceRole,
                                            transaction,
                                            nowMs() + static_cast<double> (delayAfterMs),
                                            nextMessageIndex });
            startTimerHz (60);

            if (status != nullptr)
                *status = "Sent " + juce::String (sentCount)
                    + (sentCount == 1 ? " message; queued remaining messages"
                                      : " messages; queued remaining messages");

            return true;
        }
    }

    lastSentAtMs[key] = nowMs();
    if (status != nullptr)
        *status = sentCount <= 1 ? juce::String ("Sent")
                                 : "Sent " + juce::String (sentCount) + " messages";

    return true;
}

juce::String DeviceProfileService::sendOrQueueTransaction (const juce::String& deviceRole, const MidiTransaction& transaction)
{
    const auto realtimeWarning = ! transaction.realtimeSafe && transaction.sendPolicyMode == "continuous"
        ? juce::String (" (not realtime-safe)")
        : juce::String {};

    auto key = deviceRole + ":" + transaction.parameterId;
    auto now = nowMs();
    auto lastSent = lastSentAtMs.find (key);
    auto earliestSendAt = lastSent != lastSentAtMs.end()
        ? lastSent->second + juce::jmax (0, transaction.minIntervalMs)
        : now;

    if (transaction.coalesce)
    {
        for (auto it = queuedTransactions.begin(); it != queuedTransactions.end();)
        {
            if (it->deviceRole == deviceRole && it->transaction.parameterId == transaction.parameterId)
                it = queuedTransactions.erase (it);
            else
                ++it;
        }
    }

    if (earliestSendAt <= now)
    {
        juce::String error;
        juce::String status;
        return sendTransactionNow (deviceRole, transaction, error, &status)
            ? status + realtimeWarning
            : "Not sent: " + error;
    }

    queuedTransactions.push_back ({ deviceRole, transaction, earliestSendAt, 0 });
    startTimerHz (60);
    return "Queued until rate limit clears" + realtimeWarning;
}

void DeviceProfileService::sendRawMidiToRole (const juce::String& deviceRole, const juce::MidiMessage& message)
{
    const auto destination = resolveDestination (deviceRole);
    if (destination.type != "hardwareOutput" || destination.id.isEmpty())
        return;

    auto& output = midiOutputs[destination.id];
    if (output == nullptr)
        output = juce::MidiOutput::openDevice (destination.id);
    if (output != nullptr)
        output->sendMessageNow (message);
}

void DeviceProfileService::timerCallback()
{
    processSysexAssemblyTimeouts();
    processPendingRequestTimeouts();
    processBulkSendJobs();
    pollMidiCiDiscovery();

    auto now = nowMs();
    for (auto it = queuedTransactions.begin(); it != queuedTransactions.end();)
    {
        if (it->dueTimeMs > now)
        {
            ++it;
            continue;
        }

        auto queued = *it;
        it = queuedTransactions.erase (it);

        juce::String error;
        juce::String status;
        auto sent = sendTransactionNow (queued.deviceRole,
                                        queued.transaction,
                                        error,
                                        &status,
                                        queued.nextMessageIndex);
        appendMonitorEvent (sent ? "out" : "error",
                            queued.deviceRole,
                            queued.transaction.messages.isEmpty() ? "unknown" : queued.transaction.messages[0].kind,
                            queued.transaction.parameterId + " = " + queued.transaction.displayedValue,
                            DeviceProfileEngine::transactionToHex (queued.transaction),
                            sent ? status + " from queue" : "Not sent from queue: " + error);
    }

    if (queuedTransactions.empty() && pendingDeviceRequests.empty() && sysexAssemblies.empty() && ! hasRunningBulkSendJobs() && ! midiCiActive)
        stopTimer();
}

void DeviceProfileService::handleIncomingMidiMessage (juce::MidiInput* source, const juce::MidiMessage& message)
{
    auto role = resolveRoleForMidiInput (source);
    if (role.isEmpty())
        role = "mainSynth";

    juce::Array<int> bytes;
    bytes.ensureStorageAllocated (message.getRawDataSize());
    for (int index = 0; index < message.getRawDataSize(); ++index)
        bytes.add (static_cast<unsigned char> (message.getRawData()[index]));

    auto hex = DeviceProfileEngine::bytesToHex (bytes);
    auto messageType = message.isSysEx() ? juce::String ("sysex")
                                         : (message.isController() ? juce::String ("cc") : juce::String ("midi"));
    auto timestampSeconds = message.getTimeStamp();

    juce::MessageManager::callAsync ([this, role, bytes, hex, messageType, timestampSeconds]()
    {
        juce::ignoreUnused (hex);
        ingestIncomingMidiBytes (role, bytes, messageType, timestampSeconds);
    });
}

void DeviceProfileService::appendMonitorEvent (const juce::String& direction,
                                               const juce::String& deviceRole,
                                               const juce::String& messageType,
                                               const juce::String& semantic,
                                               const juce::String& hex,
                                               const juce::String& status)
{
    auto* event = new juce::DynamicObject();
    event->setProperty ("timestamp", juce::Time::getCurrentTime().toISO8601 (true));
    event->setProperty ("direction", direction);
    event->setProperty ("deviceRole", deviceRole);
    event->setProperty ("messageType", messageType);
    event->setProperty ("semantic", semantic);
    event->setProperty ("hex", hex);
    event->setProperty ("status", status);
    monitorEvents.add (juce::var (event));

    constexpr int maxMonitorEvents = 500;
    while (monitorEvents.size() > maxMonitorEvents)
        monitorEvents.remove (0);
}
}
