// Device sync + pending request lifecycle: startDeviceSync, runtime-state
// push, pending device request bookkeeping, resolution against identity /
// dump / dump-collection replies, startup request chaining, and timeouts.

#include "DeviceProfileService.h"
#include "DeviceProfileServiceInternal.h"

namespace ceditor::device
{
juce::var DeviceProfileService::startDeviceSync (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto correlationId = objectString (obj, "correlationId");
    if (correlationId.isEmpty())
        correlationId = "sync_" + juce::String (juce::Time::getMillisecondCounter());

    auto deviceRole = varToStringOr (obj != nullptr ? obj->getProperty ("deviceRole") : juce::var {}, "mainSynth");
    auto profileId = objectString (obj, "profileId");
    auto requestId = objectString (obj, "request");
    if (requestId.isEmpty())
        requestId = objectString (obj, "deviceRequestId");

    auto dryRun = obj != nullptr && obj->hasProperty ("dryRun") ? static_cast<bool> (obj->getProperty ("dryRun")) : false;
    auto purpose = varToStringOr (obj != nullptr ? obj->getProperty ("purpose") : juce::var {}, "sync");
    auto scanId = objectString (obj, "scanId");
    auto slot = objectIntOr (obj, "slot", -1);
    auto* engine = resolveEngine (profileId, deviceRole);
    if (engine == nullptr)
        return errorResponse (correlationId, "No device profile mapped for role: " + deviceRole);

    auto resolvedProfileId = resolveProfileId (profileId, deviceRole);
    auto syncDirection = normalizeSyncDirection (objectString (obj, "syncDirection"));
    if (syncDirection.isEmpty())
    {
        auto mapping = roleMappings.find (deviceRole);
        syncDirection = mapping != roleMappings.end() ? mapping->second.syncDirection : engine->getDefaultSyncDirection();
    }

    if (requestId.isEmpty() && syncDirection == "push")
        return pushRuntimeStateToDevice (correlationId,
                                         deviceRole,
                                         resolvedProfileId,
                                         obj != nullptr ? obj->getProperty ("values") : juce::var {},
                                         dryRun);

    auto request = requestId == "identity" || requestId == "identityRequest"
        ? engine->compileIdentityRequest (deviceRole)
        : engine->compileDeviceRequest (deviceRole,
                                        requestId,
                                        obj != nullptr ? obj->getProperty ("variables") : juce::var {});
    if (! request.ok)
        return errorResponse (correlationId, request.error);

    auto status = juce::String ("Preview");
    auto direction = juce::String ("preview");
    auto transactionHex = DeviceProfileEngine::transactionToHex (request.transaction);
    auto pending = false;

    if (! dryRun)
    {
        status = sendOrQueueTransaction (deviceRole, request.transaction);
        direction = status.startsWith ("Sent") ? "out" : (status.startsWith ("Queued") ? "queued" : "error");

        if ((direction == "out" || direction == "queued")
            && (request.expectedDumpId.isNotEmpty() || request.expectedResponseKind == "identity"))
        {
            PendingDeviceRequest pendingRequest;
            pendingRequest.correlationId = correlationId;
            pendingRequest.deviceRole = deviceRole;
            pendingRequest.profileId = resolvedProfileId;
            pendingRequest.requestId = request.requestId;
            pendingRequest.expectedResponseKind = request.expectedResponseKind;
            pendingRequest.expectedDumpId = request.expectedDumpId;
            pendingRequest.nextRequestId = request.nextStartupRequestId;
            pendingRequest.continueRequestId = request.continueRequestId;
            pendingRequest.sentHex = transactionHex;
            pendingRequest.purpose = purpose;
            pendingRequest.scanId = scanId;
            pendingRequest.slot = slot;
            pendingRequest.createdAtMs = nowMs();
            pendingRequest.timeoutAtMs = pendingRequest.createdAtMs + juce::jmax (1, request.timeoutMs);
            pendingRequest.retriesRemaining = request.retries;
            addPendingDeviceRequest (pendingRequest);
            pending = true;
            updateRoleSessionState (deviceRole,
                                    request.expectedResponseKind == "identity" ? "identifying" : "syncing",
                                    request.expectedResponseKind == "identity"
                                        ? "Waiting for identity reply"
                                        : "Waiting for " + request.expectedDumpId);
        }
        else
        {
            updateRoleSessionState (deviceRole, direction == "error" ? "error" : "linked", status);
        }
    }

    appendMonitorEvent (direction,
                        deviceRole,
                        request.transaction.messages.isEmpty() ? "unknown" : request.transaction.messages[0].kind,
                        request.name.isNotEmpty() ? request.name : request.requestId,
                        transactionHex,
                        status);

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("requestId", correlationId);
    response->setProperty ("deviceRole", deviceRole);
    response->setProperty ("profileId", resolvedProfileId);
    response->setProperty ("syncDirection", syncDirection);
    response->setProperty ("deviceRequestId", request.requestId);
    response->setProperty ("expectedResponseKind", request.expectedResponseKind);
    response->setProperty ("expectedDumpId", request.expectedDumpId);
    response->setProperty ("nextStartupRequestId", request.nextStartupRequestId);
    response->setProperty ("continueRequestId", request.continueRequestId);
    response->setProperty ("status", status);
    response->setProperty ("pending", pending);
    response->setProperty ("transaction", transactionToVar (request.transaction));
    response->setProperty ("pendingRequests", getPendingDeviceRequests());
    response->setProperty ("sessionState", getSessionState());
    return juce::var (response);
}

juce::var DeviceProfileService::getPendingDeviceRequests() const
{
    juce::Array<juce::var> items;
    for (const auto& [correlationId, request] : pendingDeviceRequests)
    {
        juce::ignoreUnused (correlationId);
        items.add (pendingDeviceRequestToVar (request));
    }
    return juce::var (items);
}

juce::var DeviceProfileService::pushRuntimeStateToDevice (const juce::String& correlationId,
                                                          const juce::String& deviceRole,
                                                          const juce::String& profileId,
                                                          const juce::var& values,
                                                          bool dryRun)
{
    auto* engine = resolveEngine (profileId, deviceRole);
    if (engine == nullptr)
        return errorResponse (correlationId, "No device profile mapped for role: " + deviceRole);

    auto* explicitValues = values.getDynamicObject();
    std::map<juce::String, juce::var> valuesToPush;
    if (explicitValues != nullptr)
    {
        for (const auto& property : explicitValues->getProperties())
            valuesToPush[property.name.toString()] = property.value;
    }
    else
    {
        auto roleState = runtimeState.find (deviceRole);
        if (roleState != runtimeState.end())
            valuesToPush = roleState->second;
    }

    juce::Array<juce::var> transactions;
    juce::Array<juce::var> errors;
    auto sentCount = 0;
    auto queuedCount = 0;

    if (! dryRun)
        updateRoleSessionState (deviceRole, "syncing", "Pushing panel state to device");

    for (const auto& [parameterId, value] : valuesToPush)
    {
        auto result = engine->compileSetParameter (deviceRole, parameterId, value, true);
        if (! result.ok)
        {
            auto* error = new juce::DynamicObject();
            error->setProperty ("parameterId", parameterId);
            error->setProperty ("error", result.error);
            errors.add (juce::var (error));
            appendMonitorEvent ("error", deviceRole, "sync", parameterId, "", result.error);
            continue;
        }

        auto status = juce::String ("Preview");
        auto direction = juce::String ("preview");
        if (! dryRun)
        {
            status = sendOrQueueTransaction (deviceRole, result.transaction);
            direction = status.startsWith ("Sent") ? "out" : (status.startsWith ("Queued") ? "queued" : "error");
        }

        if (direction == "queued")
            ++queuedCount;
        else if (direction == "out" || direction == "preview")
            ++sentCount;

        appendMonitorEvent (direction,
                            deviceRole,
                            result.transaction.messages.isEmpty() ? "unknown" : result.transaction.messages[0].kind,
                            parameterId + " = " + result.transaction.displayedValue,
                            DeviceProfileEngine::transactionToHex (result.transaction),
                            status);
        transactions.add (transactionToVar (result.transaction));
    }

    const auto pushedCount = sentCount + queuedCount;
    auto ok = errors.isEmpty();
    auto status = valuesToPush.empty()
        ? juce::String ("No runtime values to push")
        : (dryRun ? "Previewed " + juce::String (pushedCount) + " parameter(s)"
                  : "Pushed " + juce::String (sentCount) + " parameter(s)"
                      + (queuedCount > 0 ? ", queued " + juce::String (queuedCount) : juce::String {}));

    updateRoleSessionState (deviceRole,
                            ok ? "ready" : "error",
                            ok ? status : "Push completed with " + juce::String (errors.size()) + " error(s)");

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", ok);
    response->setProperty ("requestId", correlationId);
    response->setProperty ("deviceRole", deviceRole);
    response->setProperty ("profileId", profileId);
    response->setProperty ("syncDirection", "push");
    response->setProperty ("status", status);
    response->setProperty ("pushed", pushedCount);
    response->setProperty ("errors", juce::var (errors));
    response->setProperty ("transactions", juce::var (transactions));
    response->setProperty ("runtimeState", getRuntimeState());
    response->setProperty ("sessionState", getSessionState());
    emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
    emitDeviceEvent ("deviceSessionState", getSessionState());
    return juce::var (response);
}

void DeviceProfileService::addPendingDeviceRequest (const PendingDeviceRequest& request)
{
    pendingDeviceRequests[request.correlationId] = request;
    startTimerHz (60);
}

bool DeviceProfileService::resolvePendingRequestsForIdentity (const juce::String& deviceRole,
                                                              const juce::String& profileId,
                                                              const IdentityMatchResult& result)
{
    auto resolvedAny = false;
    for (auto it = pendingDeviceRequests.begin(); it != pendingDeviceRequests.end();)
    {
        const auto request = it->second;
        if (request.deviceRole != deviceRole
            || request.expectedResponseKind != "identity"
            || (request.profileId.isNotEmpty() && profileId.isNotEmpty() && request.profileId != profileId))
        {
            ++it;
            continue;
        }

        resolvedAny = true;
        auto resolved = pendingDeviceRequestToVar (request);
        if (auto* object = resolved.getDynamicObject())
        {
            object->setProperty ("status", result.matched ? "resolved" : "mismatch");
            object->setProperty ("identity", result.values);
            if (! result.matched)
                object->setProperty ("error", result.error);
        }

        appendMonitorEvent (result.matched ? "sync" : "mismatch",
                            deviceRole,
                            "identity",
                            request.requestId,
                            request.sentHex,
                            result.matched ? "Identity matched" : result.error);
        emitDeviceEvent (result.matched ? "deviceRequestResolved" : "deviceIdentityMismatch", resolved);

        it = pendingDeviceRequests.erase (it);

        if (result.matched)
        {
            updateRoleIdentityState (deviceRole, result);
            if (request.nextRequestId.isNotEmpty() && request.purpose != "presetScan")
                startNextStartupRequest (request);
            else
                updateRoleSessionState (deviceRole, "ready", "Identity matched");
        }
        else
        {
            updateRoleIdentityState (deviceRole, result);
            updateRoleSessionState (deviceRole, "mismatch", result.error);
        }
    }

    return resolvedAny;
}

void DeviceProfileService::resolvePendingRequestsForDump (const juce::String& deviceRole,
                                                          const juce::String& profileId,
                                                          const DumpParseResult& result)
{
    if (! result.ok || result.dumpId.isEmpty())
        return;

    if (result.expectedMessageCount > 1)
        return;

    for (auto it = pendingDeviceRequests.begin(); it != pendingDeviceRequests.end();)
    {
        const auto request = it->second;
        if (request.deviceRole != deviceRole
            || request.expectedResponseKind == "identity"
            || (request.profileId.isNotEmpty() && profileId.isNotEmpty() && request.profileId != profileId)
            || request.expectedDumpId != result.dumpId)
        {
            ++it;
            continue;
        }

        auto resolved = pendingDeviceRequestToVar (request);
        if (auto* object = resolved.getDynamicObject())
        {
            object->setProperty ("status", "resolved");
            object->setProperty ("dumpId", result.dumpId);
            object->setProperty ("values", result.values);
        }

        appendMonitorEvent ("sync",
                            deviceRole,
                            "request",
                            request.requestId,
                            request.sentHex,
                            "Resolved by " + result.dumpId);
        emitDeviceEvent ("deviceRequestResolved", resolved);
        if (request.purpose == "presetScan")
            updatePresetScanForResolvedDump (request, result);
        it = pendingDeviceRequests.erase (it);
        if (request.nextRequestId.isNotEmpty() && request.purpose != "presetScan")
            startNextStartupRequest (request);
    }
}

void DeviceProfileService::resolvePendingRequestsForDumpCollection (const juce::String& deviceRole,
                                                                    const juce::String& profileId,
                                                                    const DumpCollectionResult& result)
{
    if (! result.ok || ! result.complete || result.collectionId.isEmpty())
        return;

    for (auto it = pendingDeviceRequests.begin(); it != pendingDeviceRequests.end();)
    {
        const auto request = it->second;
        auto expectedMatchesCollection = request.expectedDumpId == result.collectionId;
        if (! expectedMatchesCollection)
            if (auto* messages = result.messages.getArray())
                for (const auto& message : *messages)
                    if (auto* messageObject = message.getDynamicObject())
                        if (messageObject->getProperty ("dumpId").toString() == request.expectedDumpId)
                            expectedMatchesCollection = true;

        if (request.deviceRole != deviceRole
            || request.expectedResponseKind == "identity"
            || (request.profileId.isNotEmpty() && profileId.isNotEmpty() && request.profileId != profileId)
            || ! expectedMatchesCollection)
        {
            ++it;
            continue;
        }

        auto resolved = pendingDeviceRequestToVar (request);
        if (auto* object = resolved.getDynamicObject())
        {
            object->setProperty ("status", "resolved");
            object->setProperty ("dumpId", result.collectionId);
            object->setProperty ("values", result.values);
            object->setProperty ("dumpCollection", dumpCollectionResultToVar (request.correlationId,
                                                                               profileId,
                                                                               deviceRole,
                                                                               result));
        }

        appendMonitorEvent ("sync",
                            deviceRole,
                            "request",
                            request.requestId,
                            request.sentHex,
                            "Resolved by collection " + result.collectionId);
        emitDeviceEvent ("deviceRequestResolved", resolved);
        if (request.purpose == "presetScan")
            updatePresetScanForResolvedDumpCollection (request, result);
        it = pendingDeviceRequests.erase (it);
        if (request.nextRequestId.isNotEmpty() && request.purpose != "presetScan")
            startNextStartupRequest (request);
    }
}

void DeviceProfileService::startNextStartupRequest (const PendingDeviceRequest& request)
{
    if (request.nextRequestId.isEmpty())
        return;

    auto* payload = new juce::DynamicObject();
    payload->setProperty ("correlationId", request.correlationId + "_" + request.nextRequestId);
    payload->setProperty ("deviceRole", request.deviceRole);
    payload->setProperty ("profileId", request.profileId);
    payload->setProperty ("request", request.nextRequestId);
    payload->setProperty ("purpose", request.purpose.isNotEmpty() ? request.purpose : juce::String ("sync"));
    payload->setProperty ("dryRun", false);

    updateRoleSessionState (request.deviceRole, "syncing", "Requesting " + request.nextRequestId);
    auto nextResult = startDeviceSync (juce::var (payload));
    emitDeviceEvent ("deviceSyncStarted", nextResult);
}

void DeviceProfileService::processPendingRequestTimeouts()
{
    if (pendingDeviceRequests.empty())
        return;

    auto now = nowMs();
    for (auto it = pendingDeviceRequests.begin(); it != pendingDeviceRequests.end();)
    {
        const auto& request = it->second;
        if (request.timeoutAtMs > now)
        {
            ++it;
            continue;
        }

        auto timedOut = pendingDeviceRequestToVar (request);
        if (auto* object = timedOut.getDynamicObject())
            object->setProperty ("status", "timeout");

        appendMonitorEvent ("timeout",
                            request.deviceRole,
                            "request",
                            request.requestId,
                            request.sentHex,
                            "Timed out waiting for " + (request.expectedResponseKind == "identity"
                                ? juce::String ("identity reply")
                                : request.expectedDumpId));
        emitDeviceEvent ("deviceRequestTimedOut", timedOut);
        if (request.purpose == "presetScan")
            updatePresetScanForTimeout (request);
        updateRoleSessionState (request.deviceRole, "linked", "Sync request timed out: " + request.requestId);
        it = pendingDeviceRequests.erase (it);
        emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
        emitDeviceEvent ("deviceSessionState", getSessionState());
    }
}
}
