#include "DeviceProfileService.h"

#include <vector>

namespace ceditor::device
{
namespace
{
constexpr int maxInboundSysexBytes = 1024 * 1024;
constexpr double sysexAssemblyTimeoutMs = 1000.0;

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

juce::Array<int> sliceBytes (const juce::Array<int>& bytes, int start, int count)
{
    juce::Array<int> result;
    for (auto index = 0; index < count && start + index < bytes.size(); ++index)
        result.add (bytes[start + index]);
    return result;
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

DeviceProfileService::~DeviceProfileService()
{
    const juce::ScopedLock lock (midiInputLock);
    for (auto& [role, input] : midiInputsByRole)
    {
        juce::ignoreUnused (role);
        if (input != nullptr)
            input->stop();
    }
    midiInputsByRole.clear();
}

void DeviceProfileService::setEventCallback (EventCallback callback)
{
    eventCallback = std::move (callback);
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

        if (mapping.input.type == "none")
            addIssue ("info", role, "MIDI input is disabled; startup pull and live device sync cannot receive replies");
        else if (mapping.input.type == "hardwareInput")
        {
            auto found = false;
            for (const auto& device : juce::MidiInput::getAvailableDevices())
                if (device.identifier == mapping.input.id)
                    found = true;

            if (! found)
                addIssue ("warning", role, "Mapped hardware MIDI input is not currently available: " + mapping.input.name);
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

void DeviceProfileService::addPendingDeviceRequest (const PendingDeviceRequest& request)
{
    pendingDeviceRequests[request.correlationId] = request;
    startTimerHz (60);
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

void DeviceProfileService::timerCallback()
{
    processSysexAssemblyTimeouts();
    processPendingRequestTimeouts();
    processBulkSendJobs();

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

    if (queuedTransactions.empty() && pendingDeviceRequests.empty() && sysexAssemblies.empty() && ! hasRunningBulkSendJobs())
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

void DeviceProfileService::emitDeviceEvent (const juce::String& eventName, const juce::var& payload)
{
    if (eventCallback)
        eventCallback (eventName, payload);
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
