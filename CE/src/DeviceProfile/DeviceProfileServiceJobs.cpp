// Long-running jobs: preset list scans and bulk dump sends — job start /
// cancel / query API, per-slot scan progress updates, job refresh and
// completion accounting, ack/nak protocol replies, and chunked send pump.

#include "DeviceProfileService.h"
#include "DeviceProfileServiceInternal.h"

namespace ceditor::device
{
juce::var DeviceProfileService::startPresetListScan (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto scanId = objectString (obj, "scanId");
    if (scanId.isEmpty())
        scanId = "preset_scan_" + juce::String (juce::Time::getMillisecondCounter());

    auto scanError = [&scanId] (const juce::String& message)
    {
        auto response = errorResponse (scanId, message);
        if (auto* responseObject = response.getDynamicObject())
            responseObject->setProperty ("scanId", scanId);
        return response;
    };

    auto deviceRole = varToStringOr (obj != nullptr ? obj->getProperty ("deviceRole") : juce::var {}, "mainSynth");
    auto profileId = objectString (obj, "profileId");
    auto dryRun = obj == nullptr || ! obj->hasProperty ("dryRun") || static_cast<bool> (obj->getProperty ("dryRun"));
    auto* engine = resolveEngine (profileId, deviceRole);
    if (engine == nullptr)
        return scanError ("No device profile mapped for role: " + deviceRole);

    auto resolvedProfileId = resolveProfileId (profileId, deviceRole);
    auto presetBrowser = engine->getPresetBrowser();
    auto* browserObject = presetBrowser.getDynamicObject();
    if (browserObject == nullptr)
        return scanError ("Preset browser is not defined for profile: " + resolvedProfileId);

    auto requestId = objectString (obj, "request");
    if (requestId.isEmpty())
        requestId = objectString (obj, "deviceRequestId");
    if (requestId.isEmpty())
        requestId = objectString (browserObject, "request");
    if (requestId.isEmpty())
        requestId = objectString (browserObject, "nameRequest");
    if (requestId.isEmpty())
        return scanError ("Preset browser needs a request id.");

    auto slotVariable = objectString (obj, "slotVariable");
    if (slotVariable.isEmpty())
        slotVariable = objectString (browserObject, "slotVariable");
    if (slotVariable.isEmpty())
        slotVariable = "slot";

    juce::Array<int> slots;
    if (obj != nullptr && obj->hasProperty ("slots"))
        slots = presetScanSlotsFromVar (obj->getProperty ("slots"));
    if (slots.isEmpty() && browserObject->hasProperty ("slots"))
        slots = presetScanSlotsFromVar (browserObject->getProperty ("slots"));

    if (slots.isEmpty())
    {
        const auto* rangeObject = obj != nullptr && (obj->hasProperty ("startSlot") || obj->hasProperty ("slotCount") || obj->hasProperty ("endSlot"))
            ? obj
            : browserObject;
        auto startSlot = objectIntOr (rangeObject, "startSlot", 0);
        auto slotCount = objectIntOr (rangeObject, "slotCount", 0);
        auto endSlot = objectIntOr (rangeObject, "endSlot", slotCount > 0 ? startSlot + slotCount - 1 : startSlot - 1);

        for (auto slot = startSlot; slot <= endSlot; ++slot)
            slots.addIfNotAlreadyThere (slot);
    }

    if (slots.isEmpty())
        return scanError ("Preset browser has no slots to scan.");

    PresetScanJob job;
    job.scanId = scanId;
    job.deviceRole = deviceRole;
    job.profileId = resolvedProfileId;
    job.requestId = requestId;
    job.slotVariable = slotVariable;
    job.status = dryRun ? "preview" : "running";
    job.total = slots.size();
    auto previewWaitForReplies = obj != nullptr && static_cast<bool> (obj->getProperty ("previewWaitForReplies"));

    for (auto slot : slots)
    {
        PresetScanEntry entry;
        entry.slot = slot;
        entry.requestId = requestId;

        auto variables = obj != nullptr ? cloneVar (obj->getProperty ("variables")) : juce::var {};
        auto* variableObject = variables.getDynamicObject();
        if (variableObject == nullptr)
        {
            variableObject = new juce::DynamicObject();
            variables = juce::var (variableObject);
        }
        variableObject->setProperty (slotVariable, slot);

        auto request = engine->compileDeviceRequest (deviceRole, requestId, variables);
        if (! request.ok)
        {
            entry.status = "error";
            entry.error = request.error;
            job.entries[slot] = entry;
            continue;
        }

        entry.requestId = request.requestId;
        entry.requestHex = DeviceProfileEngine::transactionToHex (request.transaction);
        entry.dumpId = request.expectedDumpId;

        if (dryRun)
        {
            entry.status = "preview";
            job.entries[slot] = entry;
            continue;
        }

        auto status = sendOrQueueTransaction (deviceRole, request.transaction);
        auto direction = status.startsWith ("Sent") ? juce::String ("out")
                                                     : (status.startsWith ("Queued") ? juce::String ("queued") : juce::String ("error"));
        if (previewWaitForReplies && status.startsWith ("Not sent: MIDI destination is preview-only"))
            direction = "preview";

        appendMonitorEvent (direction,
                            deviceRole,
                            request.transaction.messages.isEmpty() ? "unknown" : request.transaction.messages[0].kind,
                            request.name.isNotEmpty() ? request.name : request.requestId,
                            entry.requestHex,
                            status);

        if ((direction == "out" || direction == "queued" || direction == "preview") && request.expectedDumpId.isNotEmpty())
        {
            entry.status = "waiting";

            PendingDeviceRequest pendingRequest;
            pendingRequest.correlationId = scanId + "_" + juce::String (slot);
            pendingRequest.deviceRole = deviceRole;
            pendingRequest.profileId = resolvedProfileId;
            pendingRequest.requestId = request.requestId;
            pendingRequest.expectedDumpId = request.expectedDumpId;
            pendingRequest.continueRequestId = request.continueRequestId;
            pendingRequest.sentHex = entry.requestHex;
            pendingRequest.purpose = "presetScan";
            pendingRequest.scanId = scanId;
            pendingRequest.slot = slot;
            pendingRequest.createdAtMs = nowMs();
            pendingRequest.timeoutAtMs = pendingRequest.createdAtMs + juce::jmax (1, request.timeoutMs);
            pendingRequest.retriesRemaining = request.retries;
            addPendingDeviceRequest (pendingRequest);
        }
        else if (direction == "out" || direction == "queued")
        {
            entry.status = "sent";
        }
        else
        {
            entry.status = "error";
            entry.error = status;
        }

        job.entries[slot] = entry;
    }

    refreshPresetScanJob (job);
    presetScanJobs[scanId] = job;

    if (! dryRun && job.status == "running")
        updateRoleSessionState (deviceRole, "syncing", "Scanning preset names");

    auto result = presetScanJobToVar (presetScanJobs[scanId]);
    if (! dryRun)
    {
        emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
        emitDeviceEvent ("deviceSessionState", getSessionState());
    }
    return result;
}

juce::var DeviceProfileService::cancelPresetListScan (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto scanId = objectString (obj, "scanId");
    if (scanId.isEmpty() && presetScanJobs.size() == 1)
        scanId = presetScanJobs.begin()->first;
    if (scanId.isEmpty())
        return errorResponse ("cancel_preset_scan", "scanId is required");

    auto job = presetScanJobs.find (scanId);
    if (job == presetScanJobs.end())
        return errorResponse (scanId, "Preset scan was not found: " + scanId);

    job->second.cancelled = true;
    for (auto& [slot, entry] : job->second.entries)
    {
        juce::ignoreUnused (slot);
        if (entry.status == "queued" || entry.status == "waiting" || entry.status == "running")
            entry.status = "cancelled";
    }
    refreshPresetScanJob (job->second);

    for (auto it = pendingDeviceRequests.begin(); it != pendingDeviceRequests.end();)
    {
        if (it->second.scanId == scanId)
            it = pendingDeviceRequests.erase (it);
        else
            ++it;
    }

    auto result = presetScanJobToVar (job->second);
    emitDeviceEvent ("presetListScanUpdated", result);
    emitDeviceEvent ("deviceSessionState", getSessionState());
    return result;
}

juce::var DeviceProfileService::getPresetListScans() const
{
    juce::Array<juce::var> scans;
    for (const auto& [scanId, job] : presetScanJobs)
    {
        juce::ignoreUnused (scanId);
        scans.add (presetScanJobToVar (job));
    }
    return juce::var (scans);
}

juce::var DeviceProfileService::startBulkDumpSend (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    if (obj == nullptr)
        return errorResponse ({}, "startBulkDumpSend payload must be an object");

    auto bulkSendId = objectString (obj, "bulkSendId");
    if (bulkSendId.isEmpty())
        bulkSendId = "bulk_send_" + juce::String (juce::Time::getMillisecondCounter());

    auto deviceRole = varToStringOr (obj->getProperty ("deviceRole"), "mainSynth");
    auto profileId = objectString (obj, "profileId");
    auto resolvedProfileId = resolveProfileId (profileId, deviceRole);
    auto* engine = resolveEngine (profileId, deviceRole);

    auto message = objectString (obj, "hex");
    if (message.isEmpty())
        message = objectString (obj, "message");
    if (message.isEmpty())
        message = objectString (obj, "dataHex");
    if (message.trim().isEmpty())
        return errorResponse (bulkSendId, "Bulk dump hex is required");

    juce::Array<int> bytes;
    juce::String error;
    if (! parseRawMidiHex (message, bytes, error))
        return errorResponse (bulkSendId, error);

    if (bytes.size() > maxInboundSysexBytes)
        return errorResponse (bulkSendId, "Bulk dump is larger than the transport limit");

    auto timing = engine != nullptr ? engine->getTiming() : juce::var {};
    auto* timingObject = timing.getDynamicObject();
    auto defaultChunkSize = objectIntOr (timingObject, "bulkChunkBytes", 256);
    auto defaultDelayMs = objectIntOr (timingObject,
                                       "bulkChunkDelayMs",
                                       objectIntOr (timingObject,
                                                    "interMessageDelayMs",
                                                    objectIntOr (timingObject, "minDelayBetweenMessagesMs", 50)));
    auto chunkSize = objectIntOr (obj,
                                  "chunkSizeBytes",
                                  objectIntOr (obj,
                                               "bulkChunkBytes",
                                               objectIntOr (obj, "chunkBytes", defaultChunkSize)));
    auto chunkDelayMs = objectIntOr (obj,
                                     "chunkDelayMs",
                                     objectIntOr (obj, "bulkChunkDelayMs", defaultDelayMs));

    chunkSize = juce::jlimit (1, maxInboundSysexBytes, chunkSize);
    chunkDelayMs = juce::jmax (0, chunkDelayMs);

    auto dryRun = ! obj->hasProperty ("dryRun") || static_cast<bool> (obj->getProperty ("dryRun"));
    auto now = nowMs();

    BulkSendJob job;
    job.bulkSendId = bulkSendId;
    job.deviceRole = deviceRole;
    job.profileId = resolvedProfileId;
    job.label = varToStringOr (obj->getProperty ("label"), "Bulk dump send");
    job.status = dryRun ? "preview" : "running";
    job.messageType = ! bytes.isEmpty() && bytes[0] == 0xf0 ? "sysex" : "raw";
    job.totalBytes = bytes.size();
    job.chunkSizeBytes = chunkSize;
    job.chunkDelayMs = chunkDelayMs;
    job.dryRun = dryRun;
    job.expectedCollectionId = objectString (obj, "expectedCollectionId");
    if (job.expectedCollectionId.isEmpty())
        job.expectedCollectionId = objectString (obj, "verifyCollectionId");
    if (job.expectedCollectionId.isEmpty())
        job.expectedCollectionId = objectString (obj, "expectedDumpId");
    job.verificationStatus = job.expectedCollectionId.isNotEmpty() ? "waiting" : "none";

    if (auto* ackPolicy = obj->getProperty ("ackPolicy").getDynamicObject())
    {
        job.ackHex = objectString (ackPolicy, "ackHex");
        job.nakHex = objectString (ackPolicy, "nakHex");
        job.retriesRemaining = objectIntOr (ackPolicy, "retries", 0);
    }
    if (job.ackHex.isEmpty())
        job.ackHex = objectString (obj, "ackHex");
    if (job.nakHex.isEmpty())
        job.nakHex = objectString (obj, "nakHex");
    if (obj->hasProperty ("retries"))
        job.retriesRemaining = objectIntOr (obj, "retries", job.retriesRemaining);
    job.ackStatus = job.ackHex.isNotEmpty() || job.nakHex.isNotEmpty() ? "waiting" : "none";

    for (auto offset = 0; offset < bytes.size(); offset += chunkSize)
    {
        BulkSendChunk chunk;
        chunk.index = static_cast<int> (job.chunks.size());
        chunk.offset = offset;
        chunk.bytes = sliceBytes (bytes, offset, juce::jmin (chunkSize, bytes.size() - offset));
        chunk.status = dryRun ? "preview" : "queued";
        chunk.dueTimeMs = dryRun ? 0.0 : now + static_cast<double> (chunk.index * chunkDelayMs);
        job.chunks.push_back (chunk);
    }

    refreshBulkSendJob (job);
    bulkSendJobs[bulkSendId] = job;

    if (! dryRun)
    {
        updateRoleSessionState (deviceRole, "syncing", "Sending bulk dump");
        startTimerHz (60);
    }

    return bulkSendJobToVar (bulkSendJobs[bulkSendId]);
}

juce::var DeviceProfileService::cancelBulkDumpSend (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto bulkSendId = objectString (obj, "bulkSendId");
    if (bulkSendId.isEmpty() && bulkSendJobs.size() == 1)
        bulkSendId = bulkSendJobs.begin()->first;
    if (bulkSendId.isEmpty())
        return errorResponse ("cancel_bulk_send", "bulkSendId is required");

    auto job = bulkSendJobs.find (bulkSendId);
    if (job == bulkSendJobs.end())
        return errorResponse (bulkSendId, "Bulk send was not found: " + bulkSendId);

    job->second.cancelled = true;
    for (auto& chunk : job->second.chunks)
        if (chunk.status == "queued" || chunk.status == "running" || chunk.status == "preview")
            chunk.status = "cancelled";

    refreshBulkSendJob (job->second);
    auto result = bulkSendJobToVar (job->second);
    emitDeviceEvent ("bulkDumpSendUpdated", result);
    emitDeviceEvent ("deviceSessionState", getSessionState());
    return result;
}

juce::var DeviceProfileService::getBulkDumpSends() const
{
    juce::Array<juce::var> sends;
    for (const auto& [bulkSendId, job] : bulkSendJobs)
    {
        juce::ignoreUnused (bulkSendId);
        sends.add (bulkSendJobToVar (job));
    }
    return juce::var (sends);
}

void DeviceProfileService::updatePresetScanForResolvedDump (const PendingDeviceRequest& request,
                                                            const DumpParseResult& result)
{
    if (request.scanId.isEmpty())
        return;

    auto job = presetScanJobs.find (request.scanId);
    if (job == presetScanJobs.end())
        return;

    auto entry = job->second.entries.find (request.slot);
    if (entry == job->second.entries.end())
        return;

    entry->second.status = "complete";
    entry->second.dumpId = result.dumpId;
    entry->second.error.clear();

    if (auto* values = result.values.getDynamicObject())
    {
        auto name = values->getProperty ("preset.name").toString();
        if (name.isEmpty())
            name = values->getProperty ("name").toString();
        entry->second.name = name;
    }

    refreshPresetScanJob (job->second);
    emitDeviceEvent ("presetListScanUpdated", presetScanJobToVar (job->second));
}

void DeviceProfileService::updatePresetScanForResolvedDumpCollection (const PendingDeviceRequest& request,
                                                                      const DumpCollectionResult& result)
{
    if (request.scanId.isEmpty())
        return;

    auto job = presetScanJobs.find (request.scanId);
    if (job == presetScanJobs.end())
        return;

    auto entry = job->second.entries.find (request.slot);
    if (entry == job->second.entries.end())
        return;

    entry->second.status = result.complete ? "complete" : result.status;
    entry->second.dumpId = result.collectionId;
    entry->second.error = result.error;
    entry->second.dumpCollection = dumpCollectionResultToVar (request.correlationId,
                                                              result.collectionId,
                                                              request.deviceRole,
                                                              result);

    if (auto* values = result.values.getDynamicObject())
    {
        auto name = values->getProperty ("preset.name").toString();
        if (name.isEmpty())
            name = values->getProperty ("name").toString();
        if (name.isNotEmpty())
            entry->second.name = name;
    }

    refreshPresetScanJob (job->second);
    emitDeviceEvent ("presetListScanUpdated", presetScanJobToVar (job->second));
}

void DeviceProfileService::updatePresetScanForDumpCollectionProgress (const PendingDeviceRequest& request,
                                                                      const DumpCollectionResult& result)
{
    if (request.scanId.isEmpty())
        return;

    auto job = presetScanJobs.find (request.scanId);
    if (job == presetScanJobs.end())
        return;

    auto entry = job->second.entries.find (request.slot);
    if (entry == job->second.entries.end())
        return;

    entry->second.status = result.complete ? "complete" : "partial";
    entry->second.dumpId = result.collectionId;
    entry->second.error = result.error;
    entry->second.dumpCollection = dumpCollectionResultToVar (request.correlationId,
                                                              request.profileId,
                                                              request.deviceRole,
                                                              result);

    refreshPresetScanJob (job->second);
    emitDeviceEvent ("presetListScanUpdated", presetScanJobToVar (job->second));
}

void DeviceProfileService::updatePresetScanForTimeout (const PendingDeviceRequest& request)
{
    if (request.scanId.isEmpty())
        return;

    auto job = presetScanJobs.find (request.scanId);
    if (job == presetScanJobs.end())
        return;

    auto entry = job->second.entries.find (request.slot);
    if (entry == job->second.entries.end())
        return;

    entry->second.status = "timeout";
    entry->second.error = "Timed out waiting for " + request.expectedDumpId;
    refreshPresetScanJob (job->second);
    emitDeviceEvent ("presetListScanUpdated", presetScanJobToVar (job->second));
}

void DeviceProfileService::refreshPresetScanJob (PresetScanJob& job)
{
    job.total = static_cast<int> (job.entries.size());
    job.completed = 0;
    job.failed = 0;

    auto pending = 0;
    auto previewOnly = job.total > 0;

    for (const auto& [slot, entry] : job.entries)
    {
        juce::ignoreUnused (slot);
        if (entry.status == "complete" || entry.status == "sent")
        {
            ++job.completed;
            previewOnly = false;
        }
        else if (entry.status == "error" || entry.status == "timeout")
        {
            ++job.failed;
            previewOnly = false;
        }
        else if (entry.status == "preview")
        {
            continue;
        }
        else if (entry.status != "cancelled")
        {
            ++pending;
            previewOnly = false;
        }
    }

    if (job.cancelled)
        job.status = "cancelled";
    else if (previewOnly)
        job.status = "preview";
    else if (pending <= 0 && job.total > 0)
        job.status = job.failed > 0 ? "completeWithErrors" : "complete";
    else
        job.status = "running";
}

void DeviceProfileService::refreshBulkSendJob (BulkSendJob& job)
{
    job.totalChunks = static_cast<int> (job.chunks.size());
    job.sentChunks = 0;
    job.failedChunks = 0;
    job.sentBytes = 0;

    auto pending = 0;
    auto previewOnly = job.totalChunks > 0;

    for (const auto& chunk : job.chunks)
    {
        if (chunk.status == "sent")
        {
            ++job.sentChunks;
            job.sentBytes += chunk.bytes.size();
            previewOnly = false;
        }
        else if (chunk.status == "error")
        {
            ++job.failedChunks;
            previewOnly = false;
        }
        else if (chunk.status == "preview")
        {
            continue;
        }
        else if (chunk.status != "cancelled")
        {
            ++pending;
            previewOnly = false;
        }
    }

    if (job.cancelled)
        job.status = "cancelled";
    else if (previewOnly)
        job.status = "preview";
    else if (pending <= 0 && job.totalChunks > 0)
        job.status = job.failedChunks > 0 ? "completeWithErrors" : "complete";
    else
        job.status = "running";
}

bool DeviceProfileService::hasRunningBulkSendJobs() const
{
    for (const auto& [bulkSendId, job] : bulkSendJobs)
    {
        juce::ignoreUnused (bulkSendId);
        if (job.status == "running")
            return true;
    }

    return false;
}

void DeviceProfileService::updateBulkSendJobsForDumpCollection (const juce::String& deviceRole,
                                                                const juce::String& profileId,
                                                                const DumpCollectionResult& result)
{
    if (result.collectionId.isEmpty())
        return;

    for (auto& [bulkSendId, job] : bulkSendJobs)
    {
        juce::ignoreUnused (bulkSendId);
        if (job.deviceRole != deviceRole
            || (job.profileId.isNotEmpty() && profileId.isNotEmpty() && job.profileId != profileId)
            || job.expectedCollectionId.isEmpty()
            || job.expectedCollectionId != result.collectionId)
            continue;

        job.dumpCollection = dumpCollectionResultToVar (job.bulkSendId, profileId, deviceRole, result);
        job.verificationStatus = result.complete ? "verified" : result.status;
        if (! result.ok && job.error.isEmpty())
            job.error = result.error;

        refreshBulkSendJob (job);
        emitDeviceEvent ("bulkDumpSendUpdated", bulkSendJobToVar (job));
    }
}

bool DeviceProfileService::updateBulkSendJobsForProtocolReply (const juce::String& deviceRole,
                                                               const juce::String& hex)
{
    auto handled = false;
    for (auto& [bulkSendId, job] : bulkSendJobs)
    {
        juce::ignoreUnused (bulkSendId);
        if (job.deviceRole != deviceRole)
            continue;

        if (job.ackHex.isNotEmpty() && hex == job.ackHex)
        {
            job.ackStatus = "ack";
            if (job.verificationStatus == "none")
                job.verificationStatus = "ack";
            refreshBulkSendJob (job);
            emitDeviceEvent ("bulkDumpSendUpdated", bulkSendJobToVar (job));
            handled = true;
            continue;
        }

        if (job.nakHex.isNotEmpty() && hex == job.nakHex)
        {
            if (job.retriesRemaining > 0)
            {
                --job.retriesRemaining;
                ++job.retryCount;
                job.ackStatus = "retrying";
                job.status = "running";
                job.error.clear();
                const auto now = nowMs();
                for (auto& chunk : job.chunks)
                {
                    chunk.status = "queued";
                    chunk.error.clear();
                    chunk.sentAtMs = 0.0;
                    chunk.dueTimeMs = now + static_cast<double> (chunk.index * job.chunkDelayMs);
                }
                startTimerHz (60);
            }
            else
            {
                job.ackStatus = "nak";
                job.status = "completeWithErrors";
                job.error = "Device rejected bulk dump";
            }

            refreshBulkSendJob (job);
            emitDeviceEvent ("bulkDumpSendUpdated", bulkSendJobToVar (job));
            handled = true;
        }
    }

    return handled;
}

void DeviceProfileService::processBulkSendJobs()
{
    if (bulkSendJobs.empty())
        return;

    auto now = nowMs();
    for (auto& [bulkSendId, job] : bulkSendJobs)
    {
        juce::ignoreUnused (bulkSendId);
        if (job.status != "running" || job.cancelled)
            continue;

        auto processedChunk = false;
        for (auto& chunk : job.chunks)
        {
            if (chunk.status != "queued" || chunk.dueTimeMs > now)
                continue;

            chunk.status = "running";

            MidiMessageSpec message;
            message.kind = job.messageType == "sysex" ? "sysexChunk" : "rawChunk";
            message.bytes = chunk.bytes;

            MidiTransaction transaction;
            transaction.transactionId = job.bulkSendId + "_chunk_" + juce::String (chunk.index + 1);
            transaction.deviceRole = job.deviceRole;
            transaction.parameterId = job.bulkSendId;
            transaction.semanticValue = true;
            transaction.messages.add (message);
            transaction.displayedValue = "chunk " + juce::String (chunk.index + 1) + "/" + juce::String (job.totalChunks);
            transaction.normalizedValue = job.totalChunks > 0 ? static_cast<double> (chunk.index + 1) / static_cast<double> (job.totalChunks) : 1.0;
            transaction.encodedValueHex = DeviceProfileEngine::bytesToHex (chunk.bytes);
            transaction.checksumStatus = "none";
            transaction.sendPolicyMode = "bulk";
            transaction.coalesce = false;
            transaction.minIntervalMs = 0;
            transaction.realtimeSafe = false;

            juce::String error;
            juce::String status;
            auto sent = sendTransactionNow (job.deviceRole, transaction, error, &status);
            if (sent)
            {
                chunk.status = "sent";
                chunk.sentAtMs = nowMs();
                chunk.error.clear();
                appendMonitorEvent ("out",
                                    job.deviceRole,
                                    message.kind,
                                    job.label + " chunk " + juce::String (chunk.index + 1) + "/" + juce::String (job.totalChunks),
                                    DeviceProfileEngine::bytesToHex (chunk.bytes),
                                    status);
            }
            else
            {
                chunk.status = "error";
                chunk.error = error;
                job.error = error;
                appendMonitorEvent ("error",
                                    job.deviceRole,
                                    message.kind,
                                    job.label + " chunk " + juce::String (chunk.index + 1) + "/" + juce::String (job.totalChunks),
                                    DeviceProfileEngine::bytesToHex (chunk.bytes),
                                    "Not sent: " + error);

                for (auto& remaining : job.chunks)
                    if (remaining.status == "queued" || remaining.status == "running")
                        remaining.status = "cancelled";
            }

            refreshBulkSendJob (job);
            if (job.status == "complete")
                updateRoleSessionState (job.deviceRole, "ready", "Bulk dump sent");
            else if (job.status == "completeWithErrors")
                updateRoleSessionState (job.deviceRole, "error", "Bulk dump send failed: " + job.error);

            emitDeviceEvent ("bulkDumpSendUpdated", bulkSendJobToVar (job));
            emitDeviceEvent ("midiMonitorEvents", getMonitorEvents());
            emitDeviceEvent ("deviceSessionState", getSessionState());
            processedChunk = true;
            break;
        }

        juce::ignoreUnused (processedChunk);
    }
}
}
