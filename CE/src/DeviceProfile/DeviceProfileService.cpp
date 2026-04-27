#include "DeviceProfileService.h"

#include <vector>

namespace ceditor::device
{
namespace
{
double nowMs()
{
    return juce::Time::getMillisecondCounterHiRes();
}

juce::File sourceRoot()
{
   #if defined (CEDITOR_SOURCE_ROOT)
    return juce::File (CEDITOR_SOURCE_ROOT);
   #else
    return juce::File::getCurrentWorkingDirectory();
   #endif
}

juce::String objectString (const juce::DynamicObject* object, const juce::Identifier& name)
{
    return object != nullptr ? object->getProperty (name).toString() : juce::String {};
}

juce::String varToStringOr (const juce::var& value, const juce::String& fallback)
{
    auto text = value.toString();
    return text.isNotEmpty() ? text : fallback;
}
}

DeviceProfileService::DeviceProfileService()
{
    loadInternalTestProfiles();

    if (! profiles.empty())
        roleMappings["mainSynth"].profileId = profiles.begin()->first;

    if (profiles.find ("test-cc-synth") != profiles.end())
        roleMappings["mainSynth"].profileId = "test-cc-synth";
}

juce::var DeviceProfileService::listProfiles()
{
    loadInternalTestProfiles();

    juce::Array<juce::var> items;
    for (const auto& [profileId, loaded] : profiles)
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", profileId);
        object->setProperty ("name", loaded.engine->getProfileName());
        object->setProperty ("filePath", loaded.file.getFullPathName());
        items.add (juce::var (object));
    }

    return items;
}

juce::var DeviceProfileService::loadProfileFromFile (const juce::File& file)
{
    juce::String error;
    DeviceProfileEngine probe;
    if (! probe.loadFromFile (file, error))
        return errorResponse ({}, error);

    auto profileId = probe.getProfileId();

    if (! loadProfileFile (file, error))
        return errorResponse ({}, error);

    auto loaded = profiles.find (profileId);
    auto* engine = loaded != profiles.end() ? loaded->second.engine.get() : nullptr;
    if (engine == nullptr)
        return errorResponse ({}, "Profile loaded but could not be resolved: " + file.getFullPathName());

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("id", profileId);
    response->setProperty ("name", engine->getProfileName());
    response->setProperty ("filePath", file.getFullPathName());
    return juce::var (response);
}

juce::var DeviceProfileService::listProfileParameters (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto requestId = objectString (obj, "requestId");
    auto profileId = objectString (obj, "profileId");
    auto deviceRole = varToStringOr (obj != nullptr ? obj->getProperty ("deviceRole") : juce::var {}, "mainSynth");

    auto* engine = resolveEngine (profileId, deviceRole);
    if (engine == nullptr)
        return errorResponse (requestId, profileId.isNotEmpty() ? "Unknown profileId: " + profileId
                                                                : "No profile mapped for role: " + deviceRole);

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("requestId", requestId);
    response->setProperty ("profileId", resolveProfileId (profileId, deviceRole));
    response->setProperty ("deviceRole", deviceRole);
    response->setProperty ("parameters", engine->listParameterDescriptors());
    return juce::var (response);
}

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

    if (auto* destination = obj->getProperty ("midiDestination").getDynamicObject())
    {
        mapping.destination.type = varToStringOr (destination->getProperty ("type"), "previewOnly");
        mapping.destination.id = varToStringOr (destination->getProperty ("id"), mapping.destination.type);
        mapping.destination.name = varToStringOr (destination->getProperty ("name"), mapping.destination.id);
    }

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("role", role);
    response->setProperty ("profileId", profileId);
    auto* destination = new juce::DynamicObject();
    destination->setProperty ("type", mapping.destination.type);
    destination->setProperty ("id", mapping.destination.id);
    destination->setProperty ("name", mapping.destination.name);
    response->setProperty ("midiDestination", juce::var (destination));
    return juce::var (response);
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

    if (appendToMonitor)
        appendMonitorEvent ("preview",
                            deviceRole,
                            messageSpec.kind,
                            varToStringOr (obj->getProperty ("actionId"), "raw MIDI action"),
                            DeviceProfileEngine::transactionToHex (transaction),
                            "Dry run");

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("requestId", requestId);
    response->setProperty ("deviceRole", deviceRole);
    response->setProperty ("transaction", transactionToVar (transaction));
    response->setProperty ("runtimeState", getRuntimeState());
    return juce::var (response);
}

juce::var DeviceProfileService::runProfileTests (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto profileId = objectString (obj, "profileId");
    auto deviceRole = varToStringOr (obj != nullptr ? obj->getProperty ("deviceRole") : juce::var {}, "mainSynth");

    auto* engine = resolveEngine (profileId, deviceRole);
    if (engine == nullptr)
        return errorResponse ({}, profileId.isNotEmpty() ? "Unknown profileId: " + profileId
                                                        : "No profile mapped for role: " + deviceRole);

    return testResultsToVar (resolveProfileId (profileId, deviceRole), engine->runTests());
}

juce::var DeviceProfileService::getRuntimeState() const
{
    auto* root = new juce::DynamicObject();

    for (const auto& [role, values] : runtimeState)
    {
        auto* roleObject = new juce::DynamicObject();
        for (const auto& [parameterId, value] : values)
            roleObject->setProperty (parameterId, value);

        root->setProperty (role, juce::var (roleObject));
    }

    return juce::var (root);
}

juce::var DeviceProfileService::getMonitorEvents() const
{
    return juce::var (monitorEvents);
}

juce::var DeviceProfileService::getDiagnostics() const
{
    juce::Array<juce::var> issues;

    auto addIssue = [&issues] (const juce::String& level,
                              const juce::String& source,
                              const juce::String& message)
    {
        auto* issue = new juce::DynamicObject();
        issue->setProperty ("level", level);
        issue->setProperty ("source", source);
        issue->setProperty ("message", message);
        issues.add (juce::var (issue));
    };

    if (profiles.empty())
        addIssue ("error", "profiles", "No device profiles are loaded");

    for (const auto& [profileId, loaded] : profiles)
    {
        for (const auto& message : loaded.engine->getValidationMessages())
            addIssue (validationLevelToString (message.level),
                      profileId + (message.path.isNotEmpty() ? ":" + message.path : ""),
                      message.message);
    }

    for (const auto& [role, mapping] : roleMappings)
    {
        if (mapping.profileId.isEmpty())
            addIssue ("error", role, "Device role has no profile mapping");
        else if (profiles.find (mapping.profileId) == profiles.end())
            addIssue ("error", role, "Device role references missing profile: " + mapping.profileId);

        if (mapping.destination.type == "previewOnly")
            addIssue ("info", role, "MIDI destination is preview-only");
        else if (mapping.destination.type == "none")
            addIssue ("warning", role, "MIDI destination is disabled");
        else if (mapping.destination.type == "hardwareOutput")
        {
            auto found = false;
            for (const auto& device : juce::MidiOutput::getAvailableDevices())
                if (device.identifier == mapping.destination.id)
                    found = true;

            if (! found)
                addIssue ("warning", role, "Mapped hardware MIDI output is not currently available: " + mapping.destination.name);
        }
    }

    if (! queuedTransactions.empty())
        addIssue ("info", "queue", juce::String (static_cast<int> (queuedTransactions.size())) + " MIDI transaction(s) queued");

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("issues", juce::var (issues));
    response->setProperty ("queuedTransactions", static_cast<int> (queuedTransactions.size()));
    response->setProperty ("loadedProfiles", static_cast<int> (profiles.size()));
    return juce::var (response);
}

void DeviceProfileService::loadInternalTestProfiles()
{
    auto directory = sourceRoot()
        .getChildFile ("CE")
        .getChildFile ("profiles")
        .getChildFile ("test");

    if (! directory.isDirectory())
        return;

    auto files = directory.findChildFiles (juce::File::findFiles, false, "*.ceditor-device.json");
    for (const auto& file : files)
    {
        juce::String error;
        loadProfileFile (file, error);
    }
}

bool DeviceProfileService::loadProfileFile (const juce::File& file, juce::String& error)
{
    auto engine = std::make_unique<DeviceProfileEngine>();
    if (! engine->loadFromFile (file, error))
        return false;

    auto profileId = engine->getProfileId();
    if (profileId.isEmpty())
    {
        error = "Profile id is empty";
        return false;
    }

    auto existing = profiles.find (profileId);
    if (existing != profiles.end()
        && existing->second.file == file
        && existing->second.lastModificationTime == file.getLastModificationTime())
        return true;

    profiles[profileId] = LoadedProfile { file, file.getLastModificationTime(), std::move (engine) };
    return true;
}

DeviceProfileEngine* DeviceProfileService::resolveEngine (const juce::String& profileId, const juce::String& deviceRole)
{
    loadInternalTestProfiles();

    auto resolvedProfileId = resolveProfileId (profileId, deviceRole);
    auto profile = profiles.find (resolvedProfileId);
    return profile != profiles.end() ? profile->second.engine.get() : nullptr;
}

juce::String DeviceProfileService::resolveProfileId (const juce::String& profileId, const juce::String& deviceRole) const
{
    if (profileId.isNotEmpty())
        return profileId;

    auto role = roleMappings.find (deviceRole);
    return role != roleMappings.end() ? role->second.profileId : juce::String {};
}

DeviceProfileService::MidiDestination DeviceProfileService::resolveDestination (const juce::String& deviceRole) const
{
    auto role = roleMappings.find (deviceRole);
    return role != roleMappings.end() ? role->second.destination : MidiDestination {};
}

bool DeviceProfileService::sendTransactionNow (const juce::String& deviceRole, const MidiTransaction& transaction, juce::String& error)
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

    for (const auto& message : transaction.messages)
    {
        std::vector<unsigned char> bytes;
        bytes.reserve (static_cast<size_t> (message.bytes.size()));
        for (auto byte : message.bytes)
            bytes.push_back (static_cast<unsigned char> (juce::jlimit (0, 255, byte)));

        if (bytes.empty())
            continue;

        output->sendMessageNow (juce::MidiMessage (bytes.data(), static_cast<int> (bytes.size())));
    }

    lastSentAtMs[deviceRole + ":" + transaction.parameterId] = nowMs();
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

    if (earliestSendAt <= now)
    {
        juce::String error;
        return sendTransactionNow (deviceRole, transaction, error) ? "Sent" + realtimeWarning : "Not sent: " + error;
    }

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

    queuedTransactions.push_back ({ deviceRole, transaction, earliestSendAt });
    startTimerHz (60);
    return "Queued until rate limit clears" + realtimeWarning;
}

void DeviceProfileService::timerCallback()
{
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
        auto sent = sendTransactionNow (queued.deviceRole, queued.transaction, error);
        appendMonitorEvent (sent ? "out" : "error",
                            queued.deviceRole,
                            queued.transaction.messages.isEmpty() ? "unknown" : queued.transaction.messages[0].kind,
                            queued.transaction.parameterId + " = " + queued.transaction.displayedValue,
                            DeviceProfileEngine::transactionToHex (queued.transaction),
                            sent ? "Sent from queue" : "Not sent from queue: " + error);
    }

    if (queuedTransactions.empty())
        stopTimer();
}

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
        item->setProperty ("passed", result.passed);
        item->setProperty ("expectedHex", result.expectedHex);
        item->setProperty ("actualHex", result.actualHex);
        item->setProperty ("error", result.error);
        items.add (juce::var (item));
    }

    obj->setProperty ("passed", passed);
    obj->setProperty ("failed", results.size() - passed);
    obj->setProperty ("total", results.size());
    obj->setProperty ("results", juce::var (items));
    return juce::var (obj);
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
