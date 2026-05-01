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

int objectIntOr (const juce::DynamicObject* object, const juce::Identifier& name, int fallback)
{
    if (object == nullptr || ! object->hasProperty (name))
        return fallback;

    auto value = object->getProperty (name);
    if (value.isInt() || value.isInt64() || value.isDouble() || value.isBool())
        return static_cast<int> (value);

    auto text = value.toString().trim();
    return text.containsOnly ("-0123456789") ? text.getIntValue() : fallback;
}

bool textMatches (const juce::String& haystack, const juce::String& needle)
{
    return needle.isEmpty() || haystack.toLowerCase().contains (needle.toLowerCase());
}

bool descriptorMatches (const juce::DynamicObject& descriptor,
                        const juce::String& query,
                        const juce::String& group,
                        const juce::String& type,
                        const juce::String& access)
{
    auto descriptorGroup = objectString (&descriptor, "group");
    auto descriptorType = objectString (&descriptor, "type");
    auto* accessObject = descriptor.getProperty ("access").getDynamicObject();
    auto canWrite = accessObject == nullptr || ! accessObject->hasProperty ("canWrite") || static_cast<bool> (accessObject->getProperty ("canWrite"));
    auto realtimeSafe = accessObject == nullptr || ! accessObject->hasProperty ("realtimeSafe") || static_cast<bool> (accessObject->getProperty ("realtimeSafe"));

    if (group.isNotEmpty() && group != "all" && descriptorGroup != group)
        return false;

    if (type.isNotEmpty() && type != "all" && descriptorType != type)
        return false;

    if (access == "writable" && ! canWrite)
        return false;

    if (access == "readonly" && canWrite)
        return false;

    if (access == "realtimeWarning" && realtimeSafe)
        return false;

    if (query.isEmpty())
        return true;

    return textMatches (objectString (&descriptor, "id"), query)
        || textMatches (objectString (&descriptor, "name"), query)
        || textMatches (descriptorGroup, query)
        || textMatches (descriptorType, query);
}

const juce::Array<juce::var>* varArray (const juce::var& value)
{
    return value.getArray();
}

juce::var cloneVar (const juce::var& value)
{
    if (auto* object = value.getDynamicObject())
    {
        auto* clone = new juce::DynamicObject();
        for (const auto& property : object->getProperties())
            clone->setProperty (property.name, cloneVar (property.value));
        return juce::var (clone);
    }

    if (auto* array = value.getArray())
    {
        juce::Array<juce::var> clone;
        for (const auto& item : *array)
            clone.add (cloneVar (item));
        return clone;
    }

    return value;
}

juce::String normalizeLineEndingsForCompare (juce::String text)
{
    return text.replace ("\r\n", "\n").replace ("\r", "\n");
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

juce::var DeviceProfileService::getProfileSource (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto requestId = objectString (obj, "requestId");
    auto profileId = objectString (obj, "profileId");

    auto profile = profiles.find (profileId);
    if (profile == profiles.end())
        return errorResponse (requestId, "Unknown profileId: " + profileId);

    const auto& file = profile->second.file;
    if (! file.existsAsFile())
        return errorResponse (requestId, "Profile file does not exist: " + file.getFullPathName());

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("requestId", requestId);
    response->setProperty ("profileId", profileId);
    response->setProperty ("filePath", file.getFullPathName());
    response->setProperty ("source", file.loadFileAsString());
    response->setProperty ("lastModified", file.getLastModificationTime().toISO8601 (true));
    return juce::var (response);
}

juce::var DeviceProfileService::validateProfileSource (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto requestId = objectString (obj, "requestId");
    auto requestedProfileId = objectString (obj, "profileId");
    auto source = objectString (obj, "source");

    juce::String error;
    DeviceProfileEngine probe;
    auto ok = probe.loadFromJson (source, error);

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", ok);
    response->setProperty ("requestId", requestId);
    response->setProperty ("profileId", requestedProfileId);
    response->setProperty ("detectedProfileId", probe.getProfileId());
    response->setProperty ("name", probe.getProfileName());
    response->setProperty ("error", error);
    response->setProperty ("validation", validationMessagesToVar (probe.getValidationMessages()));
    return juce::var (response);
}

juce::var DeviceProfileService::saveProfileSource (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto requestId = objectString (obj, "requestId");
    auto profileId = objectString (obj, "profileId");
    auto source = objectString (obj, "source");

    auto profile = profiles.find (profileId);
    if (profile == profiles.end())
        return errorResponse (requestId, "Unknown profileId: " + profileId);

    juce::String error;
    DeviceProfileEngine probe;
    if (! probe.loadFromJson (source, error))
    {
        auto response = errorResponse (requestId, error);
        if (auto* responseObj = response.getDynamicObject())
            responseObj->setProperty ("validation", validationMessagesToVar (probe.getValidationMessages()));
        return response;
    }

    auto file = profile->second.file;
    if (! file.replaceWithText (source))
        return errorResponse (requestId, "Could not save profile: " + file.getFullPathName());

    auto savedSource = file.loadFileAsString();
    if (normalizeLineEndingsForCompare (savedSource) != normalizeLineEndingsForCompare (source))
        return errorResponse (requestId, "Profile save verification failed: " + file.getFullPathName());

    auto oldProfileId = profileId;
    auto newProfileId = probe.getProfileId();
    if (! loadProfileFile (file, error))
        return errorResponse (requestId, "Profile saved but reload failed: " + error);

    if (newProfileId.isNotEmpty() && newProfileId != oldProfileId)
        profiles.erase (oldProfileId);

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("requestId", requestId);
    response->setProperty ("profileId", newProfileId);
    response->setProperty ("name", probe.getProfileName());
    response->setProperty ("filePath", file.getFullPathName());
    response->setProperty ("source", source);
    response->setProperty ("lastModified", file.getLastModificationTime().toISO8601 (true));
    response->setProperty ("savedBytes", static_cast<int> (source.getNumBytesAsUTF8()));
    response->setProperty ("validation", validationMessagesToVar (probe.getValidationMessages()));
    return juce::var (response);
}

juce::var DeviceProfileService::listProfileParameters (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto requestId = objectString (obj, "requestId");
    auto profileId = objectString (obj, "profileId");
    auto deviceRole = varToStringOr (obj != nullptr ? obj->getProperty ("deviceRole") : juce::var {}, "mainSynth");
    auto offset = juce::jmax (0, objectIntOr (obj, "offset", 0));
    auto limit = objectIntOr (obj, "limit", 160);
    if (limit <= 0)
        limit = 160;
    limit = juce::jlimit (1, 500, limit);
    auto query = objectString (obj, "query").trim();
    auto group = objectString (obj, "group").trim();
    auto type = objectString (obj, "type").trim();
    auto access = objectString (obj, "access").trim();

    auto* engine = resolveEngine (profileId, deviceRole);
    if (engine == nullptr)
        return errorResponse (requestId, profileId.isNotEmpty() ? "Unknown profileId: " + profileId
                                                                : "No profile mapped for role: " + deviceRole);

    auto allDescriptors = engine->listParameterDescriptors();
    juce::Array<juce::var> page;
    juce::StringArray groups;
    juce::StringArray types;
    auto total = 0;

    if (auto* descriptorArray = allDescriptors.getArray())
    {
        for (const auto& descriptorValue : *descriptorArray)
        {
            auto* descriptor = descriptorValue.getDynamicObject();
            if (descriptor == nullptr)
                continue;

            groups.addIfNotAlreadyThere (objectString (descriptor, "group").isNotEmpty() ? objectString (descriptor, "group") : "Ungrouped");
            types.addIfNotAlreadyThere (objectString (descriptor, "type").isNotEmpty() ? objectString (descriptor, "type") : "unknown");

            if (! descriptorMatches (*descriptor, query, group, type, access))
                continue;

            if (total >= offset && page.size() < limit)
                page.add (descriptorValue);

            ++total;
        }
    }

    groups.sort (true);
    types.sort (true);
    juce::Array<juce::var> groupItems;
    juce::Array<juce::var> typeItems;
    for (const auto& item : groups)
        groupItems.add (item);
    for (const auto& item : types)
        typeItems.add (item);

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("requestId", requestId);
    response->setProperty ("profileId", resolveProfileId (profileId, deviceRole));
    response->setProperty ("deviceRole", deviceRole);
    response->setProperty ("parameters", page);
    response->setProperty ("offset", offset);
    response->setProperty ("limit", limit);
    response->setProperty ("total", total);
    response->setProperty ("hasMore", offset + page.size() < total);
    response->setProperty ("query", query);
    response->setProperty ("group", group);
    response->setProperty ("type", type);
    response->setProperty ("access", access);
    response->setProperty ("groups", groupItems);
    response->setProperty ("types", typeItems);
    return juce::var (response);
}

juce::var DeviceProfileService::getProfileParameterDetail (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto requestId = objectString (obj, "requestId");
    auto profileId = objectString (obj, "profileId");
    auto deviceRole = varToStringOr (obj != nullptr ? obj->getProperty ("deviceRole") : juce::var {}, "mainSynth");
    auto parameterId = objectString (obj, "parameterId");
    auto resolvedProfileId = resolveProfileId (profileId, deviceRole);

    auto profile = profiles.find (resolvedProfileId);
    if (profile == profiles.end())
        return errorResponse (requestId, resolvedProfileId.isNotEmpty() ? "Unknown profileId: " + resolvedProfileId
                                                                        : "No profile mapped for role: " + deviceRole);

    const auto source = profile->second.file.loadFileAsString();
    juce::var parsed;
    auto parseResult = juce::JSON::parse (source, parsed);
    if (parseResult.failed())
        return errorResponse (requestId, parseResult.getErrorMessage());

    auto* root = parsed.getDynamicObject();
    auto parametersValue = root != nullptr ? root->getProperty ("parameters") : juce::var {};
    auto* parameters = varArray (parametersValue);
    if (parameters == nullptr)
        return errorResponse (requestId, "Profile has no parameter array: " + resolvedProfileId);

    juce::var parameter;
    int parameterIndex = -1;
    for (int index = 0; index < parameters->size(); ++index)
    {
        auto* candidate = (*parameters)[index].getDynamicObject();
        if (candidate != nullptr && objectString (candidate, "id") == parameterId)
        {
            parameter = cloneVar ((*parameters)[index]);
            parameterIndex = index;
            break;
        }
    }

    if (parameterIndex < 0)
        return errorResponse (requestId, "Unknown parameter: " + parameterId);

    auto* parameterObject = parameter.getDynamicObject();
    auto recipeId = objectString (parameterObject, "messageRecipe");
    juce::var recipe;
    auto recipesValue = root != nullptr ? root->getProperty ("messageRecipes") : juce::var {};
    if (auto* recipes = varArray (recipesValue))
    {
        for (const auto& recipeValue : *recipes)
        {
            auto* candidate = recipeValue.getDynamicObject();
            if (candidate != nullptr && objectString (candidate, "id") == recipeId)
            {
                recipe = cloneVar (recipeValue);
                break;
            }
        }
    }

    juce::Array<juce::var> tests;
    auto testsValue = root != nullptr ? root->getProperty ("tests") : juce::var {};
    if (auto* testArray = varArray (testsValue))
    {
        for (const auto& testValue : *testArray)
        {
            auto* candidate = testValue.getDynamicObject();
            if (candidate != nullptr && objectString (candidate, "parameter") == parameterId)
                tests.add (cloneVar (testValue));
        }
    }

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("requestId", requestId);
    response->setProperty ("profileId", resolvedProfileId);
    response->setProperty ("deviceRole", deviceRole);
    response->setProperty ("parameterId", parameterId);
    response->setProperty ("parameterIndex", parameterIndex);
    response->setProperty ("parameter", parameter);
    response->setProperty ("recipe", recipe);
    response->setProperty ("tests", tests);
    response->setProperty ("filePath", profile->second.file.getFullPathName());
    response->setProperty ("lastModified", profile->second.file.getLastModificationTime().toISO8601 (true));
    return juce::var (response);
}

juce::var DeviceProfileService::saveProfileParameterDetail (const juce::var& payload)
{
    auto* obj = payload.getDynamicObject();
    auto requestId = objectString (obj, "requestId");
    auto profileId = objectString (obj, "profileId");
    auto deviceRole = varToStringOr (obj != nullptr ? obj->getProperty ("deviceRole") : juce::var {}, "mainSynth");
    auto parameterId = objectString (obj, "parameterId");
    auto parameter = obj != nullptr ? cloneVar (obj->getProperty ("parameter")) : juce::var {};
    auto* parameterObject = parameter.getDynamicObject();
    auto savedParameterId = objectString (parameterObject, "id");
    auto resolvedProfileId = resolveProfileId (profileId, deviceRole);

    if (parameterObject == nullptr)
        return errorResponse (requestId, "Parameter payload is required");

    if (savedParameterId.isEmpty())
        return errorResponse (requestId, "Parameter id is required");

    auto profile = profiles.find (resolvedProfileId);
    if (profile == profiles.end())
        return errorResponse (requestId, resolvedProfileId.isNotEmpty() ? "Unknown profileId: " + resolvedProfileId
                                                                        : "No profile mapped for role: " + deviceRole);

    const auto source = profile->second.file.loadFileAsString();
    juce::var parsed;
    auto parseResult = juce::JSON::parse (source, parsed);
    if (parseResult.failed())
        return errorResponse (requestId, parseResult.getErrorMessage());

    auto* root = parsed.getDynamicObject();
    auto parametersValue = root != nullptr ? root->getProperty ("parameters") : juce::var {};
    auto* parameters = parametersValue.getArray();
    if (parameters == nullptr)
        return errorResponse (requestId, "Profile has no parameter array: " + resolvedProfileId);

    auto replaceId = parameterId.isNotEmpty() ? parameterId : savedParameterId;
    auto found = false;
    for (auto& item : *parameters)
    {
        auto* candidate = item.getDynamicObject();
        if (candidate != nullptr && objectString (candidate, "id") == replaceId)
        {
            item = parameter;
            found = true;
            break;
        }
    }

    if (! found)
        return errorResponse (requestId, "Unknown parameter: " + replaceId);

    auto nextSource = juce::JSON::toString (parsed, true);
    juce::String error;
    DeviceProfileEngine probe;
    if (! probe.loadFromJson (nextSource, error))
    {
        auto response = errorResponse (requestId, error);
        if (auto* responseObj = response.getDynamicObject())
            responseObj->setProperty ("validation", validationMessagesToVar (probe.getValidationMessages()));
        return response;
    }

    auto file = profile->second.file;
    if (! file.replaceWithText (nextSource))
        return errorResponse (requestId, "Could not save profile: " + file.getFullPathName());

    if (! loadProfileFile (file, error))
        return errorResponse (requestId, "Parameter saved but profile reload failed: " + error);

    auto* response = new juce::DynamicObject();
    response->setProperty ("ok", true);
    response->setProperty ("requestId", requestId);
    response->setProperty ("profileId", probe.getProfileId());
    response->setProperty ("deviceRole", deviceRole);
    response->setProperty ("parameterId", savedParameterId);
    response->setProperty ("parameter", parameter);
    response->setProperty ("filePath", file.getFullPathName());
    response->setProperty ("lastModified", file.getLastModificationTime().toISO8601 (true));
    response->setProperty ("savedBytes", static_cast<int> (nextSource.getNumBytesAsUTF8()));
    response->setProperty ("validation", validationMessagesToVar (probe.getValidationMessages()));
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
