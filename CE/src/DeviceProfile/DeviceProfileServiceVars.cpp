// Static converters and parsers: struct/result -> juce::var serialization
// for the bridge (transactions, jobs, requests, dump results, tests,
// validation), plus small pure parsers (hex byte parsing, slot lists,
// sync-direction normalization).

#include "DeviceProfileService.h"
#include "DeviceProfileServiceInternal.h"

namespace ceditor::device
{
juce::var DeviceProfileService::transactionToVar (const MidiTransaction& transaction)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("transactionId", transaction.transactionId);
    obj->setProperty ("deviceRole", transaction.deviceRole);
    obj->setProperty ("parameterId", transaction.parameterId);
    obj->setProperty ("semanticValue", transaction.semanticValue);
    obj->setProperty ("displayedValue", transaction.displayedValue);
    obj->setProperty ("normalizedValue", transaction.normalizedValue);
    obj->setProperty ("encodedValueHex", transaction.encodedValueHex);
    obj->setProperty ("checksumStatus", transaction.checksumStatus);
    obj->setProperty ("hex", DeviceProfileEngine::transactionToHex (transaction));

    juce::Array<juce::var> messages;
    for (const auto& message : transaction.messages)
    {
        auto* messageObject = new juce::DynamicObject();
        messageObject->setProperty ("kind", message.kind);
        messageObject->setProperty ("hex", DeviceProfileEngine::bytesToHex (message.bytes));
        messageObject->setProperty ("delayAfterMs", message.delayAfterMs);

        juce::Array<juce::var> bytes;
        for (auto byte : message.bytes)
            bytes.add (byte);
        messageObject->setProperty ("bytes", juce::var (bytes));

        messages.add (juce::var (messageObject));
    }

    obj->setProperty ("messages", juce::var (messages));
    auto* policy = new juce::DynamicObject();
    policy->setProperty ("mode", transaction.sendPolicyMode);
    policy->setProperty ("coalesce", transaction.coalesce);
    policy->setProperty ("minIntervalMs", transaction.minIntervalMs);
    policy->setProperty ("sendFinalOnRelease", transaction.sendFinalOnRelease);
    policy->setProperty ("realtimeSafe", transaction.realtimeSafe);
    obj->setProperty ("policy", juce::var (policy));
    return juce::var (obj);
}

juce::var DeviceProfileService::midiDestinationToVar (const MidiDestination& destination)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("type", destination.type);
    object->setProperty ("id", destination.id);
    object->setProperty ("name", destination.name);
    object->setProperty ("canSend", destination.type == "hardwareOutput");
    return juce::var (object);
}

juce::var DeviceProfileService::midiInputToVar (const MidiInputEndpoint& input)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("type", input.type);
    object->setProperty ("id", input.id);
    object->setProperty ("name", input.name);
    object->setProperty ("canReceive", input.type == "hardwareInput");
    return juce::var (object);
}

juce::var DeviceProfileService::pendingDeviceRequestToVar (const PendingDeviceRequest& request)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("correlationId", request.correlationId);
    object->setProperty ("deviceRole", request.deviceRole);
    object->setProperty ("profileId", request.profileId);
    object->setProperty ("requestId", request.requestId);
    object->setProperty ("expectedResponseKind", request.expectedResponseKind);
    object->setProperty ("expectedDumpId", request.expectedDumpId);
    object->setProperty ("nextRequestId", request.nextRequestId);
    object->setProperty ("continueRequestId", request.continueRequestId);
    object->setProperty ("sentHex", request.sentHex);
    object->setProperty ("purpose", request.purpose);
    object->setProperty ("scanId", request.scanId);
    object->setProperty ("slot", request.slot);
    object->setProperty ("createdAtMs", request.createdAtMs);
    object->setProperty ("timeoutAtMs", request.timeoutAtMs);
    object->setProperty ("retriesRemaining", request.retriesRemaining);
    object->setProperty ("continuationCount", request.continuationCount);
    object->setProperty ("continueSent", request.continueSent);
    object->setProperty ("status", "waiting");
    return juce::var (object);
}

juce::var DeviceProfileService::identityMatchResultToVar (const juce::String& profileId,
                                                           const juce::String& deviceRole,
                                                           const IdentityMatchResult& result)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("ok", result.matched);
    object->setProperty ("profileId", profileId);
    object->setProperty ("deviceRole", deviceRole);
    object->setProperty ("isIdentityReply", result.isIdentityReply);
    object->setProperty ("matched", result.matched);
    object->setProperty ("error", result.error);
    object->setProperty ("deviceId", result.deviceIdHex);
    object->setProperty ("manufacturerId", result.manufacturerIdHex);
    object->setProperty ("familyCode", result.familyCodeHex);
    object->setProperty ("modelNumber", result.modelNumberHex);
    object->setProperty ("revision", result.revisionHex);
    object->setProperty ("values", result.values);
    return juce::var (object);
}

juce::var DeviceProfileService::presetScanJobToVar (const PresetScanJob& job)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("ok", true);
    object->setProperty ("scanId", job.scanId);
    object->setProperty ("deviceRole", job.deviceRole);
    object->setProperty ("profileId", job.profileId);
    object->setProperty ("request", job.requestId);
    object->setProperty ("slotVariable", job.slotVariable);
    object->setProperty ("status", job.status);
    object->setProperty ("running", job.status == "running");
    object->setProperty ("total", job.total);
    object->setProperty ("completed", job.completed);
    object->setProperty ("failed", job.failed);
    auto pending = 0;
    if (job.status == "running")
        for (const auto& [slot, entry] : job.entries)
        {
            juce::ignoreUnused (slot);
            if (entry.status == "queued" || entry.status == "waiting" || entry.status == "running")
                ++pending;
        }
    object->setProperty ("pending", pending);
    object->setProperty ("cancelled", job.cancelled);

    juce::Array<juce::var> entries;
    for (const auto& [slot, entry] : job.entries)
    {
        juce::ignoreUnused (slot);
        auto* entryObject = new juce::DynamicObject();
        entryObject->setProperty ("slot", entry.slot);
        entryObject->setProperty ("request", entry.requestId);
        entryObject->setProperty ("requestHex", entry.requestHex);
        entryObject->setProperty ("status", entry.status);
        entryObject->setProperty ("name", entry.name);
        entryObject->setProperty ("error", entry.error);
        entryObject->setProperty ("dumpId", entry.dumpId);
        entryObject->setProperty ("dumpCollection", entry.dumpCollection);
        entries.add (juce::var (entryObject));
    }
    object->setProperty ("entries", juce::var (entries));
    return juce::var (object);
}

juce::var DeviceProfileService::bulkSendJobToVar (const BulkSendJob& job)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("ok", job.failedChunks == 0 && job.error.isEmpty());
    object->setProperty ("bulkSendId", job.bulkSendId);
    object->setProperty ("deviceRole", job.deviceRole);
    object->setProperty ("profileId", job.profileId);
    object->setProperty ("label", job.label);
    object->setProperty ("status", job.status);
    object->setProperty ("running", job.status == "running");
    object->setProperty ("messageType", job.messageType);
    object->setProperty ("totalBytes", job.totalBytes);
    object->setProperty ("sentBytes", job.sentBytes);
    object->setProperty ("chunkSizeBytes", job.chunkSizeBytes);
    object->setProperty ("chunkDelayMs", job.chunkDelayMs);
    object->setProperty ("totalChunks", job.totalChunks);
    object->setProperty ("sentChunks", job.sentChunks);
    object->setProperty ("failedChunks", job.failedChunks);
    auto pendingChunks = 0;
    for (const auto& chunk : job.chunks)
        if (chunk.status == "queued" || chunk.status == "running")
            ++pendingChunks;
    object->setProperty ("pendingChunks", pendingChunks);
    object->setProperty ("progress", job.totalBytes > 0 ? static_cast<double> (job.sentBytes) / static_cast<double> (job.totalBytes) : 0.0);
    object->setProperty ("cancelled", job.cancelled);
    object->setProperty ("dryRun", job.dryRun);
    object->setProperty ("error", job.error);
    object->setProperty ("expectedCollectionId", job.expectedCollectionId);
    object->setProperty ("verificationStatus", job.verificationStatus);
    object->setProperty ("ackStatus", job.ackStatus);
    object->setProperty ("ackHex", job.ackHex);
    object->setProperty ("nakHex", job.nakHex);
    object->setProperty ("retriesRemaining", job.retriesRemaining);
    object->setProperty ("retryCount", job.retryCount);
    object->setProperty ("dumpCollection", job.dumpCollection);

    juce::Array<juce::var> chunks;
    for (const auto& chunk : job.chunks)
    {
        auto* chunkObject = new juce::DynamicObject();
        chunkObject->setProperty ("index", chunk.index);
        chunkObject->setProperty ("offset", chunk.offset);
        chunkObject->setProperty ("byteCount", chunk.bytes.size());
        chunkObject->setProperty ("hex", DeviceProfileEngine::bytesToHex (chunk.bytes));
        chunkObject->setProperty ("status", chunk.status);
        chunkObject->setProperty ("error", chunk.error);
        chunkObject->setProperty ("dueTimeMs", chunk.dueTimeMs);
        chunkObject->setProperty ("sentAtMs", chunk.sentAtMs);
        chunks.add (juce::var (chunkObject));
    }
    object->setProperty ("chunks", juce::var (chunks));
    return juce::var (object);
}

juce::Array<int> DeviceProfileService::presetScanSlotsFromVar (const juce::var& slotsValue)
{
    juce::Array<int> slots;
    auto addSlot = [&slots] (const juce::var& value)
    {
        if (value.isVoid() || value.isUndefined())
            return;

        int slot = 0;
        if (value.isInt() || value.isInt64() || value.isDouble() || value.isBool())
        {
            slot = static_cast<int> (value);
        }
        else
        {
            auto text = value.toString().trim();
            if (text.isEmpty() || ! text.containsOnly ("-0123456789"))
                return;
            slot = text.getIntValue();
        }

        slots.addIfNotAlreadyThere (slot);
    };

    if (auto* array = slotsValue.getArray())
    {
        for (const auto& slot : *array)
            addSlot (slot);
        return slots;
    }

    addSlot (slotsValue);
    return slots;
}

juce::String DeviceProfileService::sessionStateForMapping (const RoleMapping& mapping)
{
    if (mapping.sessionState.isNotEmpty())
        return mapping.sessionState;

    if (mapping.input.type == "hardwareInput")
        return "linked";

    if (mapping.destination.type == "hardwareOutput")
        return "linked";

    return "preview";
}

juce::String DeviceProfileService::normalizeSyncDirection (const juce::String& value)
{
    auto direction = value.trim().toLowerCase();
    if (direction.isEmpty())
        return {};

    if (direction == "push" || direction == "live")
        return direction;

    return "pull";
}

juce::var DeviceProfileService::dumpParseResultToVar (const juce::String& requestId,
                                                      const juce::String& profileId,
                                                      const juce::String& deviceRole,
                                                      const DumpParseResult& result)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("ok", result.ok);
    obj->setProperty ("requestId", requestId);
    obj->setProperty ("profileId", profileId);
    obj->setProperty ("deviceRole", deviceRole);
    obj->setProperty ("dumpId", result.dumpId);
    obj->setProperty ("dumpName", result.dumpName);
    obj->setProperty ("checksumStatus", result.checksumStatus);
    obj->setProperty ("values", result.values);
    obj->setProperty ("error", result.error);
    obj->setProperty ("matchStatus", result.matchStatus);
    obj->setProperty ("complete", result.complete);
    obj->setProperty ("expectedMessageCount", result.expectedMessageCount);
    obj->setProperty ("receivedMessageCount", result.receivedMessageCount);
    obj->setProperty ("expectedBytes", result.expectedBytes);
    obj->setProperty ("receivedBytes", result.receivedBytes);
    obj->setProperty ("completion", result.completion);
    obj->setProperty ("diagnostics", result.diagnostics);
    obj->setProperty ("partialFailures", result.partialFailures);
    return juce::var (obj);
}

juce::var DeviceProfileService::dumpCollectionResultToVar (const juce::String& requestId,
                                                           const juce::String& profileId,
                                                           const juce::String& deviceRole,
                                                           const DumpCollectionResult& result)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("ok", result.ok);
    obj->setProperty ("requestId", requestId);
    obj->setProperty ("profileId", profileId);
    obj->setProperty ("deviceRole", deviceRole);
    obj->setProperty ("collectionId", result.collectionId);
    obj->setProperty ("status", result.status);
    obj->setProperty ("complete", result.complete);
    obj->setProperty ("error", result.error);
    obj->setProperty ("expectedMessageCount", result.expectedMessageCount);
    obj->setProperty ("receivedMessageCount", result.receivedMessageCount);
    obj->setProperty ("parsedMessageCount", result.parsedMessageCount);
    obj->setProperty ("failedMessageCount", result.failedMessageCount);
    obj->setProperty ("expectedBytes", result.expectedBytes);
    obj->setProperty ("receivedBytes", result.receivedBytes);
    obj->setProperty ("values", result.values);
    obj->setProperty ("messages", result.messages);
    obj->setProperty ("receivedRanges", result.receivedRanges);
    obj->setProperty ("missingRanges", result.missingRanges);
    obj->setProperty ("duplicateRanges", result.duplicateRanges);
    obj->setProperty ("diagnostics", result.diagnostics);
    return juce::var (obj);
}

juce::var DeviceProfileService::testResultsToVar (const juce::String& profileId, const juce::Array<ProfileTestResult>& results)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("ok", true);
    obj->setProperty ("profileId", profileId);

    auto passed = 0;
    juce::Array<juce::var> items;
    for (const auto& result : results)
    {
        if (result.passed)
            ++passed;

        auto* item = new juce::DynamicObject();
        item->setProperty ("name", result.name);
        item->setProperty ("kind", result.kind);
        item->setProperty ("passed", result.passed);
        item->setProperty ("expectedHex", result.expectedHex);
        item->setProperty ("actualHex", result.actualHex);
        item->setProperty ("expectedValues", result.expectedValues);
        item->setProperty ("actualValues", result.actualValues);
        item->setProperty ("error", result.error);
        items.add (juce::var (item));
    }

    obj->setProperty ("passed", passed);
    obj->setProperty ("failed", results.size() - passed);
    obj->setProperty ("total", results.size());
    obj->setProperty ("results", juce::var (items));
    return juce::var (obj);
}

juce::var DeviceProfileService::validationMessagesToVar (const juce::Array<ValidationMessage>& messages)
{
    juce::Array<juce::var> items;
    for (const auto& message : messages)
    {
        auto* item = new juce::DynamicObject();
        item->setProperty ("level", validationLevelToString (message.level));
        item->setProperty ("path", message.path);
        item->setProperty ("message", message.message);
        items.add (juce::var (item));
    }

    return juce::var (items);
}

juce::var DeviceProfileService::errorResponse (const juce::String& requestId, const juce::String& error)
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty ("ok", false);
    obj->setProperty ("requestId", requestId);
    obj->setProperty ("error", error);
    return juce::var (obj);
}

juce::String DeviceProfileService::validationLevelToString (ValidationMessage::Level level)
{
    switch (level)
    {
        case ValidationMessage::Level::info: return "info";
        case ValidationMessage::Level::warning: return "warning";
        case ValidationMessage::Level::error: return "error";
    }

    return "info";
}

bool DeviceProfileService::parseRawMidiHex (const juce::String& hex, juce::Array<int>& bytes, juce::String& error)
{
    if (! parseMidiHexBytes (hex, bytes, error))
        return false;

    if (bytes[0] == 0xf0)
    {
        if (bytes.getLast() != 0xf7)
        {
            error = "SysEx raw MIDI message must end with F7";
            return false;
        }

        for (int index = 1; index < bytes.size() - 1; ++index)
        {
            if (bytes[index] > 127)
            {
                error = "SysEx data byte outside 0-127";
                return false;
            }
        }
    }

    return true;
}

bool DeviceProfileService::parseMidiHexBytes (const juce::String& hex, juce::Array<int>& bytes, juce::String& error)
{
    juce::StringArray tokens;
    tokens.addTokens (hex, " ,\t\r\n", "");
    tokens.removeEmptyStrings();

    if (tokens.isEmpty())
    {
        error = "Raw MIDI message is empty";
        return false;
    }

    for (const auto& token : tokens)
    {
        auto byte = token.getHexValue32();
        if (byte < 0 || byte > 255)
        {
            error = "Invalid MIDI byte: " + token;
            return false;
        }

        bytes.add (byte);
    }

    return true;
}
}
