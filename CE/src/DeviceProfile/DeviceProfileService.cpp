// Core: construction, profile loading (files + internal test profiles),
// profile source / parameter editor API, tests, runtime state, monitor and
// diagnostics queries, engine/profile-id resolution, event emission.

#include "DeviceProfileService.h"
#include "DeviceProfileServiceInternal.h"

namespace ceditor::device
{
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
    loadInternalTestProfiles (true);   // the dropdown must show a profile generated a moment ago

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

/**
 * Load the shipped profiles, and — the point of this function — do almost nothing when they are
 * already loaded.
 *
 * It reads as a one-time startup step, and it was written as one, but resolveEngine() calls it on
 * every resolve: every knob move (compileParameterMessage), every request, every parsed dump, and
 * every single inbound MIDI message (processIncomingMidiMessage). Unconditionally it re-read and
 * re-parsed the whole directory each time — 1.9 MB of JSON across nine files, ~1,600 parameters
 * recompiled, on the message thread, which is the thread that draws the UI.
 *
 * The result is exactly what it sounds like: a knob sweep on the instrument sends a CC stream, each
 * CC queues a full reparse, the message thread never catches up and Windows paints the window
 * "(Not Responding)". A startup pull is worse: the full GAIA's startup.sync is ten RQ1s, each reply a
 * large dump that pays for the reload again on arrival and again when it is parsed. An identity reply
 * queued behind all that arrives seconds late, long past the profile's 1000ms timeout, so a synth
 * that answered correctly is reported as "No answer".
 *
 * LoadedProfile has carried a `lastModificationTime` since it was written and nothing ever read it.
 * This reads it: a file already loaded, and unchanged on disk since, is skipped. Editing a profile
 * still takes effect — findChildFiles + one stat per file is the whole cost of noticing — but that
 * is still disk I/O per inbound byte, so the directory itself is only rescanned once a second unless
 * a caller asks for a fresh look. A profile written a moment ago therefore appears within a second
 * everywhere, and immediately in the places where someone is waiting to see it.
 */
void DeviceProfileService::loadInternalTestProfiles (bool force)
{
    // Long enough that a MIDI stream cannot make this touch the disk more than once per second;
    // short enough that regenerating a profile and switching to the app picks it up on arrival.
    static constexpr double rescanIntervalMs = 1000.0;

    auto now = nowMs();
    if (! force && lastProfileScanMs > 0.0 && now - lastProfileScanMs < rescanIntervalMs)
        return;
    lastProfileScanMs = now;

    auto directory = sourceRoot()
        .getChildFile ("CE")
        .getChildFile ("profiles")
        .getChildFile ("test");

    if (! directory.isDirectory())
        return;

    auto files = directory.findChildFiles (juce::File::findFiles, false, "*.ceditor-device.json");
    for (const auto& file : files)
    {
        if (isLoadedProfileCurrent (file))
            continue;

        // A file the engine refuses is not in `profiles`, so without this it would be re-parsed on
        // every scan forever — the same unbounded rework, just for the broken profile instead of all
        // of them. Remember the exact copy we refused; a corrected one has a new modification time.
        auto path = file.getFullPathName();
        auto modified = file.getLastModificationTime();
        auto refused = refusedProfiles.find (path);
        if (refused != refusedProfiles.end() && refused->second == modified)
            continue;

        juce::String error;
        if (loadProfileFile (file, error))
            refusedProfiles.erase (path);
        else
            refusedProfiles[path] = modified;
    }
}

/** Is this file already loaded, from the same bytes that are on disk now? */
bool DeviceProfileService::isLoadedProfileCurrent (const juce::File& file) const
{
    for (const auto& entry : profiles)
        if (entry.second.file == file)
            return entry.second.lastModificationTime == file.getLastModificationTime();

    return false;
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

void DeviceProfileService::emitDeviceEvent (const juce::String& eventName, const juce::var& payload)
{
    if (eventCallback)
        eventCallback (eventName, payload);
}
}
