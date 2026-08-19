// Message compile + inbound processing: parameter message compilation,
// raw MIDI actions, inbound byte ingestion, sysex reassembly (and its
// timeouts), incoming message semantics, dump parsing and dump-collection
// assembly state.

#include "DeviceProfileService.h"
#include "DeviceProfileServiceInternal.h"

namespace ceditor::device
{
/**
 * Is this one of the System Real-Time bytes an instrument sends on its own, forever?
 *
 * Active Sensing (FE) is a keep-alive — the AN1x emits one every ~262ms from the moment it is
 * plugged in. Timing Clock (F8) is a metronome tick, twenty-four to the beat. Neither is something
 * the instrument DID; both arrive whether anyone touched it or not.
 *
 * Matched on the whole message rather than its first byte, because these are single-byte messages:
 * a longer message that happens to begin FE is not one of them.
 */
static bool isMidiHousekeeping (const juce::String& hex)
{
    auto trimmed = hex.trim();
    return trimmed.equalsIgnoreCase ("FE") || trimmed.equalsIgnoreCase ("F8");
}

juce::var DeviceProfileService::compileParameterMessage (const juce::var& payload, bool updateState)
{
    auto* obj = payload.getDynamicObject();
    if (obj == nullptr)
        return errorResponse ({}, "compileParameterMessage payload must be an object");

    auto requestId = obj->getProperty ("requestId").toString();
    auto deviceRole = varToStringOr (obj->getProperty ("deviceRole"), "mainSynth");
    auto profileId = obj->getProperty ("profileId").toString();
    auto parameterId = obj->getProperty ("parameterId").toString();
    auto value = obj->getProperty ("value");
    auto dryRun = ! obj->getProperties().contains ("dryRun") || static_cast<bool> (obj->getProperty ("dryRun"));

    if (parameterId.isEmpty())
        return errorResponse (requestId, "parameterId is required");

    auto* engine = resolveEngine (profileId, deviceRole);
    if (engine == nullptr)
        return errorResponse (requestId, "No device profile mapped for role: " + deviceRole);

    auto resolvedProfileId = resolveProfileId (profileId, deviceRole);
    auto result = engine->compileSetParameter (deviceRole, parameterId, value, true);
    if (! result.ok)
        return errorResponse (requestId, result.error);

    if (updateState)
    {
        runtimeState[deviceRole][parameterId] = result.transaction.semanticValue;
        auto status = juce::String ("Dry run");
        auto direction = juce::String ("preview");

        if (! dryRun)
        {
            status = sendOrQueueTransaction (deviceRole, result.transaction);
            direction = status.startsWith ("Sent") ? "out" : (status.startsWith ("Queued") ? "queued" : "error");
        }

        appendMonitorEvent (direction,
                            deviceRole,
                            result.transaction.messages.isEmpty() ? "unknown" : result.transaction.messages[0].kind,
                            parameterId + " = " + result.transaction.displayedValue,
                            DeviceProfileEngine::transactionToHex (result.transaction),
                            status);
    }

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("requestId", requestId);
    response->setProperty ("profileId", resolvedProfileId);
    response->setProperty ("deviceRole", deviceRole);
    response->setProperty ("parameterId", parameterId);
    response->setProperty ("transaction", transactionToVar (result.transaction));
    response->setProperty ("runtimeState", getRuntimeState());
    return juce::var (response);
}

juce::var DeviceProfileService::compileRawMidiAction (const juce::var& payload, bool appendToMonitor)
{
    auto* obj = payload.getDynamicObject();
    if (obj == nullptr)
        return errorResponse ({}, "compileRawMidiAction payload must be an object");

    auto requestId = obj->getProperty ("requestId").toString();
    auto deviceRole = varToStringOr (obj->getProperty ("deviceRole"), "mainSynth");
    auto message = obj->getProperty ("message").toString();
    auto dryRun = ! obj->getProperties().contains ("dryRun") || static_cast<bool> (obj->getProperty ("dryRun"));

    juce::Array<int> bytes;
    juce::String error;
    if (! parseRawMidiHex (message, bytes, error))
        return errorResponse (requestId, error);

    MidiMessageSpec messageSpec;
    messageSpec.kind = bytes.size() > 0 && bytes[0] == 0xf0 ? "sysex" : "raw";
    messageSpec.bytes = bytes;

    MidiTransaction transaction;
    transaction.transactionId = "raw_dry_tx";
    transaction.deviceRole = deviceRole;
    transaction.parameterId = obj->getProperty ("actionId").toString();
    transaction.semanticValue = true;
    transaction.messages.add (messageSpec);
    transaction.displayedValue = "trigger";
    transaction.normalizedValue = 1.0;
    transaction.encodedValueHex = DeviceProfileEngine::bytesToHex (bytes);
    transaction.checksumStatus = "none";

    auto status = juce::String ("Dry run");
    auto direction = juce::String ("preview");

    if (appendToMonitor && ! dryRun)
    {
        status = sendOrQueueTransaction (deviceRole, transaction);
        direction = status.startsWith ("Sent") ? "out" : (status.startsWith ("Queued") ? "queued" : "error");
    }

    if (appendToMonitor)
        appendMonitorEvent (direction,
                            deviceRole,
                            messageSpec.kind,
                            varToStringOr (obj->getProperty ("actionId"), "raw MIDI action"),
                            DeviceProfileEngine::transactionToHex (transaction),
                            status);

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("requestId", requestId);
    response->setProperty ("deviceRole", deviceRole);
    response->setProperty ("transaction", transactionToVar (transaction));
    response->setProperty ("runtimeState", getRuntimeState());
    response->setProperty ("status", status);
    return juce::var (response);
}

juce::var DeviceProfileService::ingestIncomingMidiMessage (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    if (obj == nullptr)
        return errorResponse ({}, "ingestIncomingMidiMessage payload must be an object");

    auto requestId = objectString (obj, "requestId");
    auto deviceRole = varToStringOr (obj->getProperty ("deviceRole"), "mainSynth");
    auto hex = objectString (obj, "hex");
    if (hex.trim().isEmpty())
        return errorResponse (requestId, "Incoming MIDI hex is required");

    juce::Array<int> bytes;
    juce::String error;
    if (! parseMidiHexBytes (hex, bytes, error))
        return errorResponse (requestId, error);

    auto messageType = objectString (obj, "messageType");
    if (messageType.isEmpty())
        messageType = ! bytes.isEmpty() && bytes[0] == 0xf0 ? "sysex"
                    : (! bytes.isEmpty() && (bytes[0] & 0xf0) == 0xb0 ? "cc" : "midi");

    auto timestampSeconds = obj->hasProperty ("timestampSeconds")
        ? static_cast<double> (obj->getProperty ("timestampSeconds"))
        : juce::Time::getMillisecondCounterHiRes() / 1000.0;

    auto result = ingestIncomingMidiBytes (deviceRole, bytes, messageType, timestampSeconds);
    if (auto* resultObject = result.getDynamicObject())
        resultObject->setProperty ("requestId", requestId);
    return result;
}

juce::var DeviceProfileService::parseDumpMessage (const juce::var& payload, bool updateState)
{
    auto* obj = payload.getDynamicObject();
    if (obj == nullptr)
        return errorResponse ({}, "parseDumpMessage payload must be an object");

    auto requestId = obj->getProperty ("requestId").toString();
    auto deviceRole = varToStringOr (obj->getProperty ("deviceRole"), "mainSynth");
    auto profileId = obj->getProperty ("profileId").toString();
    auto hex = obj->getProperty ("hex").toString();

    if (hex.trim().isEmpty())
        return errorResponse (requestId, "Dump hex is required");

    auto* engine = resolveEngine (profileId, deviceRole);
    if (engine == nullptr)
        return errorResponse (requestId, "No device profile mapped for role: " + deviceRole);

    auto resolvedProfileId = resolveProfileId (profileId, deviceRole);
    auto result = engine->parseDumpMessage (hex);
    if (! result.ok)
    {
        auto response = dumpParseResultToVar (requestId, resolvedProfileId, deviceRole, result);
        if (updateState)
            appendMonitorEvent ("error", deviceRole, "sysex", "dump parse", hex, result.error);
        return response;
    }

    if (updateState)
    {
        if (auto* values = result.values.getDynamicObject())
            for (const auto& property : values->getProperties())
                runtimeState[deviceRole][property.name.toString()] = property.value;

        appendMonitorEvent ("in",
                            deviceRole,
                            "sysex",
                            result.dumpName.isNotEmpty() ? result.dumpName : result.dumpId,
                            hex,
                            "Parsed " + juce::String (result.values.getDynamicObject() != nullptr
                                ? result.values.getDynamicObject()->getProperties().size()
                                : 0) + " value(s)");
    }

    auto response = dumpParseResultToVar (requestId, resolvedProfileId, deviceRole, result);
    if (auto* responseObject = response.getDynamicObject())
        responseObject->setProperty ("runtimeState", getRuntimeState());
    return response;
}

juce::var DeviceProfileService::updateDumpCollectionForParsedDump (const juce::String& deviceRole,
                                                                   const juce::String& profileId,
                                                                   const juce::String& hex,
                                                                   const DumpParseResult& result)
{
    auto* completion = result.completion.getDynamicObject();
    auto collectionId = completion != nullptr ? completion->getProperty ("collectionId").toString() : juce::String {};
    if (collectionId.isEmpty() && result.expectedMessageCount > 1)
        collectionId = result.dumpId;

    if (collectionId.isEmpty())
        return {};

    auto* engine = resolveEngine (profileId, deviceRole);
    if (engine == nullptr)
        return {};

    auto key = deviceRole + ":" + profileId + ":" + collectionId;
    auto& state = dumpCollections[key];
    state.deviceRole = deviceRole;
    state.profileId = profileId;
    state.collectionId = collectionId;
    state.updatedAtMs = nowMs();

    auto alreadySeen = false;
    for (const auto& existing : state.hexMessages)
        if (existing == hex)
            alreadySeen = true;

    if (! alreadySeen)
        state.hexMessages.add (hex);

    auto collection = engine->collectDumpMessages (state.hexMessages);
    state.latestResult = dumpCollectionResultToVar ("collection_" + collectionId,
                                                    profileId,
                                                    deviceRole,
                                                    collection);

    if (auto* values = collection.values.getDynamicObject())
        for (const auto& property : values->getProperties())
            runtimeState[deviceRole][property.name.toString()] = property.value;

    emitDeviceEvent ("dumpCollectionUpdated", state.latestResult);
    updateBulkSendJobsForDumpCollection (deviceRole, profileId, collection);

    for (auto& [correlationId, pending] : pendingDeviceRequests)
    {
        juce::ignoreUnused (correlationId);
        auto expectedMatchesCollection = pending.expectedDumpId == collection.collectionId;
        if (! expectedMatchesCollection)
            if (auto* messages = collection.messages.getArray())
                for (const auto& message : *messages)
                    if (auto* messageObject = message.getDynamicObject())
                        if (messageObject->getProperty ("dumpId").toString() == pending.expectedDumpId)
                            expectedMatchesCollection = true;

        if (pending.deviceRole == deviceRole
            && (pending.profileId.isEmpty() || pending.profileId == profileId)
            && pending.purpose == "presetScan"
            && expectedMatchesCollection)
        {
            updatePresetScanForDumpCollectionProgress (pending, collection);
        }

        if (pending.deviceRole == deviceRole
            && (pending.profileId.isEmpty() || pending.profileId == profileId)
            && expectedMatchesCollection
            && ! collection.complete
            && pending.continueRequestId.isNotEmpty()
            && ! pending.continueSent)
        {
            auto continueRequest = engine->compileDeviceRequest (deviceRole, pending.continueRequestId, juce::var {});
            if (continueRequest.ok)
            {
                auto continueHex = DeviceProfileEngine::transactionToHex (continueRequest.transaction);
                auto status = sendOrQueueTransaction (deviceRole, continueRequest.transaction);
                auto direction = status.startsWith ("Sent") ? juce::String ("out")
                    : (status.startsWith ("Queued") ? juce::String ("queued") : juce::String ("error"));

                pending.continueSent = true;
                pending.continuationCount += 1;
                pending.timeoutAtMs = nowMs() + juce::jmax (1, continueRequest.timeoutMs);

                auto continued = pendingDeviceRequestToVar (pending);
                if (auto* object = continued.getDynamicObject())
                {
                    object->setProperty ("status", "continued");
                    object->setProperty ("continueRequestId", continueRequest.requestId);
                    object->setProperty ("continueTransaction", transactionToVar (continueRequest.transaction));
                    object->setProperty ("continueStatus", status);
                    object->setProperty ("dumpCollection", state.latestResult);
                }

                appendMonitorEvent (direction,
                                    deviceRole,
                                    continueRequest.transaction.messages.isEmpty() ? "unknown" : continueRequest.transaction.messages[0].kind,
                                    "continue " + continueRequest.requestId,
                                    continueHex,
                                    status);
                emitDeviceEvent ("deviceRequestContinued", continued);
            }
            else
            {
                appendMonitorEvent ("error",
                                    deviceRole,
                                    "request",
                                    "continue " + pending.continueRequestId,
                                    juce::String {},
                                    continueRequest.error);
            }
        }
    }

    if (collection.complete)
        resolvePendingRequestsForDumpCollection (deviceRole, profileId, collection);

    return state.latestResult;
}

void DeviceProfileService::processSysexAssemblyTimeouts()
{
    if (sysexAssemblies.empty())
        return;

    auto now = nowMs();
    for (auto it = sysexAssemblies.begin(); it != sysexAssemblies.end();)
    {
        if (now - it->second.updatedAtMs <= sysexAssemblyTimeoutMs)
        {
            ++it;
            continue;
        }

        auto role = it->first;
        auto hex = DeviceProfileEngine::bytesToHex (it->second.bytes);
        auto chunks = it->second.chunks;
        appendMonitorEvent ("timeout",
                            role,
                            "sysex",
                            "incoming SysEx assembly",
                            hex,
                            "Timed out waiting for F7 after " + juce::String (chunks) + " chunk(s)");

        auto* event = new juce::DynamicObject();
        event->setProperty ("ok", false);
        event->setProperty ("deviceRole", role);
        event->setProperty ("messageType", "sysex");
        event->setProperty ("hex", hex);
        event->setProperty ("chunks", chunks);
        event->setProperty ("error", "Timed out waiting for SysEx end byte");
        emitDeviceEvent ("sysexAssemblyTimedOut", juce::var (event));
        it = sysexAssemblies.erase (it);
    }

    emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
}

juce::var DeviceProfileService::ingestIncomingMidiBytes (const juce::String& deviceRole,
                                                         const juce::Array<int>& bytes,
                                                         const juce::String& messageType,
                                                         double timestampSeconds)
{
    auto role = deviceRole.isNotEmpty() ? deviceRole : juce::String ("mainSynth");
    auto hex = DeviceProfileEngine::bytesToHex (bytes);
    auto type = messageType.isNotEmpty() ? messageType : juce::String ("midi");
    auto now = nowMs();
    auto existingAssembly = sysexAssemblies.find (role);
    auto hasAssembly = existingAssembly != sysexAssemblies.end();
    auto startsSysex = ! bytes.isEmpty() && bytes[0] == 0xf0;
    auto endsSysex = ! bytes.isEmpty() && bytes.getLast() == 0xf7;
    auto isSysexLike = type == "sysex" || startsSysex || hasAssembly;

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("deviceRole", role);
    response->setProperty ("messageType", type);
    response->setProperty ("hex", hex);
    response->setProperty ("assembled", false);
    response->setProperty ("waitingForSysexEnd", false);

    if (! isSysexLike)
    {
        processIncomingMidiMessage (role, hex, type, timestampSeconds);
        return juce::var (response);
    }

    if (startsSysex && endsSysex)
    {
        processIncomingMidiMessage (role, hex, "sysex", timestampSeconds);
        return juce::var (response);
    }

    auto& assembly = sysexAssemblies[role];
    if (startsSysex)
    {
        assembly.bytes.clear();
        assembly.startedAtMs = now;
        assembly.chunks = 0;
    }
    else if (assembly.bytes.isEmpty())
    {
        appendMonitorEvent ("error", role, "sysex", "incoming SysEx chunk", hex, "Discarded chunk without F0 start");
        response->setProperty ("ok", false);
        response->setProperty ("error", "Discarded SysEx continuation without a start byte");
        emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
        return juce::var (response);
    }

    for (auto byte : bytes)
        assembly.bytes.add (byte);
    assembly.updatedAtMs = now;
    ++assembly.chunks;

    if (assembly.bytes.size() > maxInboundSysexBytes)
    {
        sysexAssemblies.erase (role);
        appendMonitorEvent ("error", role, "sysex", "incoming SysEx assembly", hex, "Discarded SysEx over max size");
        response->setProperty ("ok", false);
        response->setProperty ("error", "Incoming SysEx exceeded the maximum size");
        emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
        return juce::var (response);
    }

    if (! endsSysex)
    {
        appendMonitorEvent ("in", role, "sysex", "incoming SysEx chunk", hex, "Buffered chunk " + juce::String (assembly.chunks));
        response->setProperty ("waitingForSysexEnd", true);
        response->setProperty ("chunks", assembly.chunks);
        response->setProperty ("assembledBytes", assembly.bytes.size());
        emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
        startTimerHz (60);
        return juce::var (response);
    }

    auto assembledBytes = assembly.bytes;
    auto chunks = assembly.chunks;
    sysexAssemblies.erase (role);
    auto assembledHex = DeviceProfileEngine::bytesToHex (assembledBytes);
    response->setProperty ("assembled", true);
    response->setProperty ("chunks", chunks);
    response->setProperty ("assembledBytes", assembledBytes.size());
    response->setProperty ("hex", assembledHex);
    processIncomingMidiMessage (role, assembledHex, "sysex", timestampSeconds);
    return juce::var (response);
}

void DeviceProfileService::processIncomingMidiMessage (const juce::String& deviceRole,
                                                       const juce::String& hex,
                                                       const juce::String& messageType,
                                                       double timestampSeconds)
{
    auto role = deviceRole.isNotEmpty() ? deviceRole : juce::String ("mainSynth");
    auto mapping = roleMappings.find (role);
    if (mapping != roleMappings.end())
        mapping->second.lastInboundAtMs = nowMs();

    auto* incoming = new juce::DynamicObject();
    incoming->setProperty ("ok", true);
    incoming->setProperty ("deviceRole", role);
    incoming->setProperty ("messageType", messageType);
    incoming->setProperty ("hex", hex);
    incoming->setProperty ("timestampSeconds", timestampSeconds);
    incoming->setProperty ("origin", "hardwareInput");
    auto incomingVar = juce::var (incoming);
    emitDeviceEvent ("midiInputMessage", incomingVar);

    if (messageType == "sysex")
    {
        // Feed MIDI-CI replies (Universal SysEx) to the discovery session. Additive: the session ignores
        // non-CI SysEx and CI replies don't match the dump/identity logic below.
        if (midiCiActive && midiCiSession != nullptr && role == midiCiRole)
        {
            juce::Array<int> ciBytes;
            juce::String ciError;
            if (parseRawMidiHex (hex, ciBytes, ciError) && ! ciBytes.isEmpty())
            {
                std::vector<unsigned char> raw;
                raw.reserve (static_cast<size_t> (ciBytes.size()));
                for (auto b : ciBytes)
                    raw.push_back (static_cast<unsigned char> (juce::jlimit (0, 255, b)));
                midiCiSession->handleIncomingSysex (juce::MidiMessage (raw.data(), static_cast<int> (raw.size())));
            }
        }

        emitDeviceEvent ("sysexInputMessage", cloneVar (incomingVar));

        if (updateBulkSendJobsForProtocolReply (role, hex))
        {
            appendMonitorEvent ("sync", role, "sysex", "bulk protocol reply", hex, "Matched bulk ACK/NAK policy");
            emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
            emitDeviceEvent ("deviceSessionState", getSessionState());
            return;
        }

        auto resolvedProfileId = resolveProfileId (juce::String {}, role);
        if (auto* engine = resolveEngine (resolvedProfileId, role))
        {
            auto identity = engine->matchIdentityReply (hex);
            if (identity.isIdentityReply)
            {
                auto identityVar = identityMatchResultToVar (resolvedProfileId, role, identity);
                emitDeviceEvent ("deviceIdentityReply", identityVar);
                if (! identity.matched)
                    emitDeviceEvent ("deviceIdentityMismatch", identityVar);

                appendMonitorEvent (identity.matched ? "identity" : "mismatch",
                                    role,
                                    "identity",
                                    "Universal Identity Reply",
                                    hex,
                                    identity.matched ? "Identity matched" : identity.error);

                auto resolvedPending = resolvePendingRequestsForIdentity (role, resolvedProfileId, identity);
                if (! resolvedPending)
                {
                    updateRoleIdentityState (role, identity);
                    updateRoleSessionState (role,
                                            identity.matched ? "ready" : "mismatch",
                                            identity.matched ? "Identity matched" : identity.error);
                }

                emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
                emitDeviceEvent ("deviceSessionState", getSessionState());
                return;
            }
        }

        auto* payload = new juce::DynamicObject();
        payload->setProperty ("requestId", "incoming_" + juce::String (juce::Time::getMillisecondCounter()));
        payload->setProperty ("deviceRole", role);
        payload->setProperty ("profileId", resolvedProfileId);
        payload->setProperty ("hex", hex);

        auto parsed = parseDumpMessage (juce::var (payload), true);
        emitDeviceEvent ("dumpMessageParsed", parsed);
        emitDeviceEvent ("deviceRuntimeState", getRuntimeState());

        if (auto* parsedObject = parsed.getDynamicObject())
        {
            if (static_cast<bool> (parsedObject->getProperty ("ok")))
            {
                DumpParseResult parsedResult;
                parsedResult.ok = true;
                parsedResult.dumpId = parsedObject->getProperty ("dumpId").toString();
                parsedResult.dumpName = parsedObject->getProperty ("dumpName").toString();
                parsedResult.checksumStatus = parsedObject->getProperty ("checksumStatus").toString();
                parsedResult.values = parsedObject->getProperty ("values");
                parsedResult.matchStatus = parsedObject->getProperty ("matchStatus").toString();
                parsedResult.complete = static_cast<bool> (parsedObject->getProperty ("complete"));
                parsedResult.expectedMessageCount = (int) parsedObject->getProperty ("expectedMessageCount");
                parsedResult.receivedMessageCount = (int) parsedObject->getProperty ("receivedMessageCount");
                parsedResult.expectedBytes = (int) parsedObject->getProperty ("expectedBytes");
                parsedResult.receivedBytes = (int) parsedObject->getProperty ("receivedBytes");
                parsedResult.completion = parsedObject->getProperty ("completion");
                parsedResult.diagnostics = parsedObject->getProperty ("diagnostics");
                parsedResult.partialFailures = parsedObject->getProperty ("partialFailures");

                auto collection = updateDumpCollectionForParsedDump (role, resolvedProfileId, hex, parsedResult);
                if (auto* collectionObject = collection.getDynamicObject())
                    parsedObject->setProperty ("dumpCollection", collection);

                resolvePendingRequestsForDump (role, resolvedProfileId, parsedResult);

                auto hasPendingForRole = false;
                for (const auto& [correlationId, pending] : pendingDeviceRequests)
                {
                    juce::ignoreUnused (correlationId);
                    if (pending.deviceRole == role)
                    {
                        hasPendingForRole = true;
                        break;
                    }
                }

                if (! hasPendingForRole)
                {
                    auto collectionComplete = true;
                    if (auto* collectionObject = collection.getDynamicObject())
                        collectionComplete = static_cast<bool> (collectionObject->getProperty ("complete"));
                    updateRoleSessionState (role,
                                            collectionComplete ? "ready" : "syncing",
                                            collectionComplete ? "Incoming dump parsed"
                                                               : "Collecting multi-message dump");
                }
            }
            else
            {
                updateRoleSessionState (role, "linked", "Incoming SysEx did not match a dump definition");
            }
        }
    }
    else if (isMidiHousekeeping (hex))
    {
        // Proof of life, not an event. A Yamaha AN1x sends Active Sensing (FE) every ~262ms whether
        // anything is happening or not, and a sequencer sends Timing Clock (F8) twenty-four times a
        // beat — 48/s at 120bpm. Logging them fills the 500-entry monitor with identical lines in
        // about two minutes, so the one message somebody is actually looking for scrolls away
        // before they can read it, and every heavy emit then ships 500 copies of nothing across the
        // bridge.
        //
        // They still count as the link being alive, which is the one thing they genuinely tell us —
        // the session goes "linked" here exactly as it would for real traffic. What they do not get
        // is a line in a log whose whole purpose is to show what the instrument SAID.
        //
        // Start/Continue/Stop (FA/FB/FC) and System Reset (FF) are deliberately not in here: those
        // are things that happened, they arrive when someone does something, and they belong in the
        // log like any other message.
        updateRoleSessionState (role, "linked", "Instrument connected");
    }
    else
    {
        appendMonitorEvent ("in", role, messageType, "incoming MIDI", hex, "Received");
        updateRoleSessionState (role, "linked", "Incoming MIDI received");
    }

    // Throttle the heavy bridge emits (full monitor log + full session state) for high-rate
    // incoming MIDI: a knob streaming CC fires these hundreds of times/sec, each serializing the
    // whole monitor array across the WebView bridge -> UI lag. midiInputMessage already went out
    // per-message above (so panel-follow stays responsive); low-rate SysEx/dumps still emit now.
    const auto heavyNow = nowMs();
    const bool highRate = messageType != "sysex";
    if (! highRate || heavyNow - lastInboundHeavyEmitMs >= 40.0)
    {
        lastInboundHeavyEmitMs = heavyNow;
        emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
        emitDeviceEvent ("deviceSessionState", getSessionState());
    }
}
}
