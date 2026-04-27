#include "DeviceProfileEngine.h"

#include <cmath>

namespace ceditor::device
{
namespace
{
const juce::DynamicObject* asObject (const juce::var& value)
{
    return value.getDynamicObject();
}

const juce::Array<juce::var>* asArray (const juce::var& value)
{
    return value.getArray();
}

juce::String propString (const juce::DynamicObject& object, const juce::Identifier& name)
{
    return object.getProperty (name).toString();
}

int propInt (const juce::DynamicObject& object, const juce::Identifier& name, int fallback = 0)
{
    auto value = object.getProperty (name);
    return value.isVoid() ? fallback : (int) value;
}

bool propBool (const juce::DynamicObject& object, const juce::Identifier& name, bool fallback = false)
{
    auto value = object.getProperty (name);
    return value.isVoid() ? fallback : (bool) value;
}

bool isMidiDataByte (int value)
{
    return value >= 0 && value <= 127;
}

juce::String byteToHex (int value)
{
    return juce::String::toHexString (value).paddedLeft ('0', 2).toUpperCase();
}

int parseHexByte (const juce::String& token)
{
    return token.trim().getHexValue32();
}

juce::Array<int> parseHexBytes (const juce::String& text)
{
    juce::Array<int> bytes;
    juce::StringArray tokens;
    tokens.addTokens (text, " ,\t\r\n", "");

    for (const auto& token : tokens)
        bytes.add (parseHexByte (token));

    return bytes;
}

bool isIntegerType (const juce::String& type)
{
    return type == "integer" || type == "float" || type == "bipolar";
}

double normalizeLinear (double value, double min, double max)
{
    auto span = max - min;
    if (std::abs (span) < 0.000001)
        return 0.0;

    return juce::jlimit (0.0, 1.0, (value - min) / span);
}

int valueFromVarOrVariable (const juce::DynamicObject& object,
                            const juce::Identifier& name,
                            const std::function<juce::var (const juce::String&)>& resolveVariable,
                            int fallback = 0)
{
    auto value = object.getProperty (name);
    if (value.isString())
    {
        auto text = value.toString();
        if (text.startsWithChar ('$'))
            return (int) resolveVariable (text.substring (1));
    }

    return value.isVoid() ? fallback : (int) value;
}

juce::String levelToString (ValidationMessage::Level level)
{
    switch (level)
    {
        case ValidationMessage::Level::info: return "info";
        case ValidationMessage::Level::warning: return "warning";
        case ValidationMessage::Level::error: return "error";
    }

    return "info";
}
}

bool DeviceProfileEngine::loadFromFile (const juce::File& file, juce::String& error)
{
    if (! file.existsAsFile())
    {
        error = "Profile file does not exist: " + file.getFullPathName();
        return false;
    }

    return loadFromJson (file.loadFileAsString(), error);
}

bool DeviceProfileEngine::loadFromJson (const juce::String& json, juce::String& error)
{
    auto parsed = juce::JSON::parse (json);

    if (parsed.isVoid())
    {
        error = "Invalid JSON";
        return false;
    }

    if (asObject (parsed) == nullptr)
    {
        error = "Device profile root must be an object";
        return false;
    }

    profile = parsed;
    validate();

    if (hasErrors())
    {
        error = "Device profile contains validation errors";
        return false;
    }

    error = {};
    return true;
}

juce::String DeviceProfileEngine::getProfileId() const
{
    if (auto* object = profileObject())
        return propString (*object, "id");

    return {};
}

juce::String DeviceProfileEngine::getProfileName() const
{
    if (auto* object = profileObject())
        return propString (*object, "name");

    return {};
}

bool DeviceProfileEngine::hasErrors() const
{
    for (const auto& message : validationMessages)
        if (message.level == ValidationMessage::Level::error)
            return true;

    return false;
}

CompileResult DeviceProfileEngine::compileSetParameter (const juce::String& deviceRole,
                                                        const juce::String& parameterId,
                                                        const juce::var& value,
                                                        bool dryRun) const
{
    if (hasErrors())
        return { false, "Profile has validation errors", {} };

    auto* parameter = findParameter (parameterId);
    if (parameter == nullptr)
        return { false, "Unknown parameter: " + parameterId, {} };

    return compileWithParameter (deviceRole, *parameter, value, dryRun);
}

juce::var DeviceProfileEngine::listParameterDescriptors() const
{
    juce::Array<juce::var> descriptors;

    auto* root = profileObject();
    auto* parameters = root != nullptr ? asArray (root->getProperty ("parameters")) : nullptr;
    if (parameters == nullptr)
        return descriptors;

    for (const auto& parameterValue : *parameters)
    {
        auto* parameter = asObject (parameterValue);
        if (parameter == nullptr)
            continue;

        auto* descriptor = new juce::DynamicObject();
        descriptor->setProperty ("id", propString (*parameter, "id"));
        descriptor->setProperty ("name", propString (*parameter, "name"));
        descriptor->setProperty ("group", propString (*parameter, "group"));
        descriptor->setProperty ("type", propString (*parameter, "type"));
        descriptor->setProperty ("default", parameter->getProperty ("default"));
        descriptor->setProperty ("range", parameter->getProperty ("range"));
        descriptor->setProperty ("choices", parameter->getProperty ("choices"));
        descriptor->setProperty ("display", parameter->getProperty ("display"));
        descriptor->setProperty ("access", parameter->getProperty ("access"));
        descriptor->setProperty ("sendPolicy", parameter->getProperty ("sendPolicy"));
        descriptor->setProperty ("ui", parameter->getProperty ("ui"));
        descriptors.add (juce::var (descriptor));
    }

    return descriptors;
}

juce::Array<ProfileTestResult> DeviceProfileEngine::runTests() const
{
    juce::Array<ProfileTestResult> results;

    auto* root = profileObject();
    auto* tests = root != nullptr ? asArray (root->getProperty ("tests")) : nullptr;
    if (tests == nullptr)
        return results;

    for (const auto& testValue : *tests)
    {
        ProfileTestResult result;
        auto* test = asObject (testValue);
        if (test == nullptr)
        {
            result.name = "Invalid test";
            result.error = "Test entry must be an object";
            results.add (result);
            continue;
        }

        result.name = propString (*test, "name");
        result.expectedHex = propString (*test, "expectedHex").trim().toUpperCase();

        auto compileResult = compileSetParameter ("mainSynth",
                                                  propString (*test, "parameter"),
                                                  test->getProperty ("value"),
                                                  true);

        if (! compileResult.ok)
        {
            result.error = compileResult.error;
            results.add (result);
            continue;
        }

        result.actualHex = transactionToHex (compileResult.transaction);
        result.passed = result.actualHex == result.expectedHex;
        if (! result.passed)
            result.error = "Expected " + result.expectedHex + " but got " + result.actualHex;

        results.add (result);
    }

    return results;
}

juce::String DeviceProfileEngine::bytesToHex (const juce::Array<int>& bytes)
{
    juce::StringArray parts;
    for (auto byte : bytes)
        parts.add (byteToHex (byte));

    return parts.joinIntoString (" ");
}

juce::String DeviceProfileEngine::transactionToHex (const MidiTransaction& transaction)
{
    juce::StringArray messages;
    for (const auto& message : transaction.messages)
        messages.add (bytesToHex (message.bytes));

    return messages.joinIntoString ("\n").trim().toUpperCase();
}

void DeviceProfileEngine::validate()
{
    validationMessages.clear();

    auto* root = profileObject();
    if (root == nullptr)
    {
        addValidation (ValidationMessage::Level::error, "$", "Profile root must be an object");
        return;
    }

    if (propInt (*root, "schemaVersion") != 1)
        addValidation (ValidationMessage::Level::error, "schemaVersion", "Only schemaVersion 1 is supported");

    if (propString (*root, "id").isEmpty())
        addValidation (ValidationMessage::Level::error, "id", "Profile id is required");

    if (propString (*root, "name").isEmpty())
        addValidation (ValidationMessage::Level::warning, "name", "Profile name is recommended");

    auto* parameters = asArray (root->getProperty ("parameters"));
    if (parameters == nullptr || parameters->isEmpty())
        addValidation (ValidationMessage::Level::error, "parameters", "At least one parameter is required");

    auto* recipes = asArray (root->getProperty ("messageRecipes"));
    if (recipes == nullptr || recipes->isEmpty())
        addValidation (ValidationMessage::Level::error, "messageRecipes", "At least one message recipe is required");

    if (parameters != nullptr)
    {
        for (int index = 0; index < parameters->size(); ++index)
        {
            auto path = "parameters[" + juce::String (index) + "]";
            auto* parameter = asObject ((*parameters)[index]);
            if (parameter == nullptr)
            {
                addValidation (ValidationMessage::Level::error, path, "Parameter must be an object");
                continue;
            }

            auto id = propString (*parameter, "id");
            if (id.isEmpty())
                addValidation (ValidationMessage::Level::error, path + ".id", "Parameter id is required");

            auto type = propString (*parameter, "type");
            if (type.isEmpty())
                addValidation (ValidationMessage::Level::error, path + ".type", "Parameter type is required");

            auto access = asObject (parameter->getProperty ("access"));
            if (access != nullptr && ! propBool (*access, "canWrite", true))
                continue;

            auto recipeId = propString (*parameter, "messageRecipe");
            if (recipeId.isEmpty())
            {
                addValidation (ValidationMessage::Level::error, path + ".messageRecipe", "Writable parameter must reference a message recipe");
            }
            else if (findMessageRecipe (recipeId) == nullptr)
            {
                addValidation (ValidationMessage::Level::error, path + ".messageRecipe", "Unknown message recipe: " + recipeId);
            }
        }
    }

    auto* tests = asArray (root->getProperty ("tests"));
    if (tests == nullptr || tests->isEmpty())
        addValidation (ValidationMessage::Level::warning, "tests", "Profile has no test vectors");
}

void DeviceProfileEngine::addValidation (ValidationMessage::Level level,
                                         const juce::String& path,
                                         const juce::String& message)
{
    validationMessages.add ({ level, path, message });
    juce::ignoreUnused (levelToString);
}

const juce::DynamicObject* DeviceProfileEngine::profileObject() const
{
    return asObject (profile);
}

const juce::DynamicObject* DeviceProfileEngine::findParameter (const juce::String& parameterId) const
{
    auto* root = profileObject();
    auto* parameters = root != nullptr ? asArray (root->getProperty ("parameters")) : nullptr;
    if (parameters == nullptr)
        return nullptr;

    for (const auto& parameterValue : *parameters)
        if (auto* parameter = asObject (parameterValue))
            if (propString (*parameter, "id") == parameterId)
                return parameter;

    return nullptr;
}

const juce::DynamicObject* DeviceProfileEngine::findMessageRecipe (const juce::String& recipeId) const
{
    auto* root = profileObject();
    auto* recipes = root != nullptr ? asArray (root->getProperty ("messageRecipes")) : nullptr;
    if (recipes == nullptr)
        return nullptr;

    for (const auto& recipeValue : *recipes)
        if (auto* recipe = asObject (recipeValue))
            if (propString (*recipe, "id") == recipeId)
                return recipe;

    return nullptr;
}

juce::var DeviceProfileEngine::resolveVariable (const juce::String& name) const
{
    auto* root = profileObject();
    auto* variables = root != nullptr ? asObject (root->getProperty ("variables")) : nullptr;
    if (variables == nullptr)
        return {};

    return variables->getProperty (name);
}

CompileResult DeviceProfileEngine::compileWithParameter (const juce::String& deviceRole,
                                                         const juce::DynamicObject& parameter,
                                                         const juce::var& value,
                                                         bool dryRun) const
{
    auto* access = asObject (parameter.getProperty ("access"));
    if (access != nullptr && ! propBool (*access, "canWrite", true))
        return { false, "Parameter is read-only: " + propString (parameter, "id"), {} };

    auto* recipe = findMessageRecipe (propString (parameter, "messageRecipe"));
    if (recipe == nullptr)
        return { false, "Unknown message recipe: " + propString (parameter, "messageRecipe"), {} };

    juce::var semanticValue;
    juce::Array<int> encodedBytes;
    double normalizedValue = 0.0;
    juce::String displayedValue;
    auto encoded = validateAndEncodeValue (parameter, value, semanticValue, encodedBytes, normalizedValue, displayedValue);
    if (encoded.failed())
        return { false, encoded.getErrorMessage(), {} };

    auto kind = propString (*recipe, "kind");
    if (kind == "cc")
        return compileCc (deviceRole, parameter, *recipe, semanticValue, encodedBytes, normalizedValue, displayedValue, dryRun);
    if (kind == "nrpn")
        return compileNrpn (deviceRole, parameter, *recipe, semanticValue, encodedBytes, normalizedValue, displayedValue, dryRun);
    if (kind == "sysex")
        return compileSysex (deviceRole, parameter, *recipe, semanticValue, encodedBytes, normalizedValue, displayedValue, dryRun);

    return { false, "Unsupported message recipe kind: " + kind, {} };
}

namespace
{
void applyParameterPolicies (MidiTransaction& transaction, const juce::DynamicObject& parameter)
{
    if (auto* sendPolicy = asObject (parameter.getProperty ("sendPolicy")))
    {
        auto mode = propString (*sendPolicy, "mode");
        transaction.sendPolicyMode = mode.isNotEmpty() ? mode : "continuous";
        transaction.coalesce = propBool (*sendPolicy, "coalesce", true);
        transaction.minIntervalMs = propInt (*sendPolicy, "minIntervalMs", 0);
        transaction.sendFinalOnRelease = propBool (*sendPolicy, "sendFinalOnRelease", true);
    }

    if (auto* access = asObject (parameter.getProperty ("access")))
        transaction.realtimeSafe = propBool (*access, "realtimeSafe", true);
}
}

juce::Result DeviceProfileEngine::validateAndEncodeValue (const juce::DynamicObject& parameter,
                                                          const juce::var& inputValue,
                                                          juce::var& semanticValue,
                                                          juce::Array<int>& encodedBytes,
                                                          double& normalizedValue,
                                                          juce::String& displayedValue) const
{
    auto type = propString (parameter, "type");
    auto* encoding = asObject (parameter.getProperty ("encoding"));
    auto encodingType = encoding != nullptr ? propString (*encoding, "type") : "u7";

    if (type == "action")
    {
        semanticValue = true;
        normalizedValue = 1.0;
        displayedValue = "trigger";
        return juce::Result::ok();
    }

    if (isIntegerType (type))
    {
        auto* range = asObject (parameter.getProperty ("range"));
        auto min = range != nullptr ? (double) range->getProperty ("min") : 0.0;
        auto max = range != nullptr ? (double) range->getProperty ("max") : 127.0;
        auto numeric = (double) inputValue;

        if (! std::isfinite (numeric))
            return juce::Result::fail ("Value is not numeric for " + propString (parameter, "id"));

        if (numeric < min || numeric > max)
            return juce::Result::fail ("Value outside range " + juce::String (min) + "-" + juce::String (max)
                                       + " for " + propString (parameter, "id"));

        semanticValue = type == "integer" ? juce::var ((int) std::round (numeric)) : juce::var (numeric);
        normalizedValue = normalizeLinear (numeric, min, max);
        displayedValue = semanticValue.toString();

        if (encodingType == "u7")
        {
            auto byte = (int) std::round (numeric);
            if (! isMidiDataByte (byte))
                return juce::Result::fail ("Encoded u7 value outside MIDI data byte range for " + propString (parameter, "id"));
            encodedBytes.add (byte);
            return juce::Result::ok();
        }

        if (encodingType == "u14-msb-lsb")
        {
            auto value = (int) std::round (numeric);
            if (value < 0 || value > 16383)
                return juce::Result::fail ("Encoded u14 value outside 0-16383 for " + propString (parameter, "id"));
            encodedBytes.add ((value >> 7) & 0x7f);
            encodedBytes.add (value & 0x7f);
            return juce::Result::ok();
        }

        return juce::Result::fail ("Unsupported numeric encoder: " + encodingType);
    }

    if (type == "choice")
    {
        auto requested = inputValue.toString();
        auto* choices = asArray (parameter.getProperty ("choices"));
        if (choices == nullptr || choices->isEmpty())
            return juce::Result::fail ("Choice parameter has no choices: " + propString (parameter, "id"));

        for (int index = 0; index < choices->size(); ++index)
        {
            auto* choice = asObject ((*choices)[index]);
            if (choice == nullptr)
                continue;

            auto id = propString (*choice, "id");
            auto label = propString (*choice, "label");
            auto value = propInt (*choice, "value");

            if (requested == id || requested == label || requested == juce::String (value))
            {
                if (! isMidiDataByte (value))
                    return juce::Result::fail ("Choice encoded value outside MIDI data byte range for " + propString (parameter, "id"));

                semanticValue = id;
                normalizedValue = choices->size() > 1 ? (double) index / (double) (choices->size() - 1) : 1.0;
                displayedValue = label.isNotEmpty() ? label : id;
                encodedBytes.add (value);
                return juce::Result::ok();
            }
        }

        return juce::Result::fail ("Unknown choice value '" + requested + "' for " + propString (parameter, "id"));
    }

    if (type == "boolean")
    {
        auto boolValue = (bool) inputValue;
        auto falseValue = propInt (parameter, "falseValue", 0);
        auto trueValue = propInt (parameter, "trueValue", 1);
        auto encoded = boolValue ? trueValue : falseValue;
        if (! isMidiDataByte (encoded))
            return juce::Result::fail ("Boolean encoded value outside MIDI data byte range for " + propString (parameter, "id"));

        semanticValue = boolValue;
        normalizedValue = boolValue ? 1.0 : 0.0;
        displayedValue = boolValue ? "On" : "Off";
        encodedBytes.add (encoded);
        return juce::Result::ok();
    }

    return juce::Result::fail ("Unsupported parameter type: " + type);
}

CompileResult DeviceProfileEngine::compileCc (const juce::String& deviceRole,
                                              const juce::DynamicObject& parameter,
                                              const juce::DynamicObject& recipe,
                                              const juce::var& semanticValue,
                                              const juce::Array<int>& encodedBytes,
                                              double normalizedValue,
                                              const juce::String& displayedValue,
                                              bool dryRun) const
{
    if (encodedBytes.isEmpty())
        return { false, "CC recipe requires an encoded value", {} };

    auto channel = valueFromVarOrVariable (recipe, "channel", [this] (const juce::String& name) { return resolveVariable (name); }, 1);
    if (channel < 1 || channel > 16)
        return { false, "CC channel must be 1-16", {} };

    auto controller = propInt (recipe, "controller");
    if (! isMidiDataByte (controller))
        return { false, "CC controller must be 0-127", {} };

    MidiMessageSpec message;
    message.kind = "cc";
    message.bytes.add (0xb0 + (channel - 1));
    message.bytes.add (controller);
    message.bytes.add (encodedBytes[0]);

    MidiTransaction transaction;
    transaction.transactionId = "dry_tx";
    transaction.deviceRole = deviceRole;
    transaction.parameterId = propString (parameter, "id");
    transaction.semanticValue = semanticValue;
    transaction.messages.add (message);
    transaction.displayedValue = displayedValue;
    transaction.normalizedValue = normalizedValue;
    transaction.encodedValueHex = bytesToHex (encodedBytes);
    transaction.checksumStatus = "none";
    applyParameterPolicies (transaction, parameter);

    juce::ignoreUnused (dryRun);
    return { true, {}, transaction };
}

CompileResult DeviceProfileEngine::compileNrpn (const juce::String& deviceRole,
                                                const juce::DynamicObject& parameter,
                                                const juce::DynamicObject& recipe,
                                                const juce::var& semanticValue,
                                                const juce::Array<int>& encodedBytes,
                                                double normalizedValue,
                                                const juce::String& displayedValue,
                                                bool dryRun) const
{
    auto channel = valueFromVarOrVariable (recipe, "channel", [this] (const juce::String& name) { return resolveVariable (name); }, 1);
    if (channel < 1 || channel > 16)
        return { false, "NRPN channel must be 1-16", {} };

    auto parameterMsb = propInt (recipe, "parameterMsb");
    auto parameterLsb = propInt (recipe, "parameterLsb");
    if (! isMidiDataByte (parameterMsb) || ! isMidiDataByte (parameterLsb))
        return { false, "NRPN parameter bytes must be 0-127", {} };

    auto status = 0xb0 + (channel - 1);
    auto addCc = [status] (juce::Array<MidiMessageSpec>& messages, int controller, int value)
    {
        MidiMessageSpec message;
        message.kind = "cc";
        message.bytes.add (status);
        message.bytes.add (controller);
        message.bytes.add (value);
        messages.add (message);
    };

    MidiTransaction transaction;
    transaction.transactionId = "dry_tx";
    transaction.deviceRole = deviceRole;
    transaction.parameterId = propString (parameter, "id");
    transaction.semanticValue = semanticValue;
    transaction.displayedValue = displayedValue;
    transaction.normalizedValue = normalizedValue;
    transaction.encodedValueHex = bytesToHex (encodedBytes);
    transaction.checksumStatus = "none";
    applyParameterPolicies (transaction, parameter);

    addCc (transaction.messages, 99, parameterMsb);
    addCc (transaction.messages, 98, parameterLsb);

    auto resolution = propInt (recipe, "valueResolution", 7);
    if (resolution == 14)
    {
        if (encodedBytes.size() < 2)
            return { false, "NRPN 14-bit recipe requires two encoded bytes", {} };

        addCc (transaction.messages, 6, encodedBytes[0]);
        addCc (transaction.messages, 38, encodedBytes[1]);
    }
    else
    {
        if (encodedBytes.isEmpty())
            return { false, "NRPN recipe requires an encoded value", {} };

        addCc (transaction.messages, 6, encodedBytes[0]);
    }

    if (propBool (recipe, "nullAfterSend", false))
    {
        addCc (transaction.messages, 99, 127);
        addCc (transaction.messages, 98, 127);
    }

    juce::ignoreUnused (dryRun);
    return { true, {}, transaction };
}

CompileResult DeviceProfileEngine::compileSysex (const juce::String& deviceRole,
                                                 const juce::DynamicObject& parameter,
                                                 const juce::DynamicObject& recipe,
                                                 const juce::var& semanticValue,
                                                 const juce::Array<int>& encodedBytes,
                                                 double normalizedValue,
                                                 const juce::String& displayedValue,
                                                 bool dryRun) const
{
    auto* templateItems = asArray (recipe.getProperty ("template"));
    if (templateItems == nullptr || templateItems->isEmpty())
        return { false, "SysEx recipe requires a template", {} };

    auto address = parseHexBytes (propString (parameter, "address"));
    juce::Array<int> bytes;
    juce::Array<int> checksumBytes;
    bool checksumInserted = false;

    auto appendBytes = [] (juce::Array<int>& target, const juce::Array<int>& source)
    {
        for (auto byte : source)
            target.add (byte);
    };

    for (const auto& item : *templateItems)
    {
        auto token = item.toString().trim();
        if (token == "$address")
        {
            appendBytes (bytes, address);
            appendBytes (checksumBytes, address);
        }
        else if (token == "$encodedValue")
        {
            appendBytes (bytes, encodedBytes);
            appendBytes (checksumBytes, encodedBytes);
        }
        else if (token == "$checksum")
        {
            auto* checksum = asObject (recipe.getProperty ("checksum"));
            auto type = checksum != nullptr ? propString (*checksum, "type") : "none";
            auto value = 0;

            if (type == "sum-7bit")
            {
                for (auto byte : checksumBytes)
                    value = (value + byte) & 0x7f;
            }
            else if (type == "none")
            {
                value = 0;
            }
            else
            {
                return { false, "Unsupported checksum type: " + type, {} };
            }

            bytes.add (value);
            checksumInserted = true;
        }
        else if (token.startsWithChar ('$'))
        {
            auto variableValue = (int) resolveVariable (token.substring (1));
            if (! isMidiDataByte (variableValue))
                return { false, "Variable " + token + " is not a MIDI data byte", {} };
            bytes.add (variableValue);
        }
        else
        {
            auto byte = parseHexByte (token);
            if (byte < 0 || byte > 255)
                return { false, "Invalid hex byte in SysEx template: " + token, {} };
            bytes.add (byte);
        }
    }

    if (bytes.isEmpty() || bytes[0] != 0xf0 || bytes.getLast() != 0xf7)
        return { false, "SysEx transaction must start with F0 and end with F7", {} };

    for (int i = 1; i < bytes.size() - 1; ++i)
        if (! isMidiDataByte (bytes[i]))
            return { false, "SysEx data byte outside 0-127: " + byteToHex (bytes[i]), {} };

    MidiMessageSpec message;
    message.kind = "sysex";
    message.bytes = bytes;

    MidiTransaction transaction;
    transaction.transactionId = "dry_tx";
    transaction.deviceRole = deviceRole;
    transaction.parameterId = propString (parameter, "id");
    transaction.semanticValue = semanticValue;
    transaction.messages.add (message);
    transaction.displayedValue = displayedValue;
    transaction.normalizedValue = normalizedValue;
    transaction.encodedValueHex = bytesToHex (encodedBytes);
    transaction.checksumStatus = checksumInserted ? "ok" : "none";
    applyParameterPolicies (transaction, parameter);

    juce::ignoreUnused (dryRun);
    return { true, {}, transaction };
}
}
