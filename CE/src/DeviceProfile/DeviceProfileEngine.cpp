#include "DeviceProfileEngine.h"
#include "ProfileChecksums.h"

#include <cmath>
#include <set>

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

bool varsEqual (const juce::var& left, const juce::var& right)
{
    if (left.isBool() || right.isBool())
        return static_cast<bool> (left) == static_cast<bool> (right);

    if (left.isInt() || left.isDouble() || right.isInt() || right.isDouble())
        return std::abs ((double) left - (double) right) < 0.000001;

    return left.toString() == right.toString();
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
    // Two separators in a row (`F0  7E`, a trailing space) leave an empty token between them, which
    // read as a 00 byte here: the JavaScript engine (normalizeHex) drops it, and so does this.
    tokens.removeEmptyStrings();

    for (const auto& token : tokens)
        bytes.add (parseHexByte (token));

    return bytes;
}

juce::Array<int> parsePatternBytes (const juce::var& patternValue,
                                    const std::function<juce::var (const juce::String&)>& resolveVariable)
{
    juce::Array<int> bytes;
    juce::StringArray tokens;

    if (auto* patternArray = patternValue.getArray())
    {
        for (const auto& item : *patternArray)
            tokens.add (item.toString());
    }
    else
    {
        tokens.addTokens (patternValue.toString(), " ,\t\r\n", "");
    }

    tokens.removeEmptyStrings();
    for (const auto& tokenValue : tokens)
    {
        auto token = tokenValue.trim();
        if (token.startsWithChar ('$'))
            bytes.add ((int) resolveVariable (token.substring (1)));
        else
            bytes.add (parseHexByte (token));
    }

    return bytes;
}

bool startsWithBytes (const juce::Array<int>& bytes, const juce::Array<int>& prefix)
{
    if (prefix.size() > bytes.size())
        return false;

    for (int i = 0; i < prefix.size(); ++i)
        if (bytes[i] != prefix[i])
            return false;

    return true;
}

bool endsWithBytes (const juce::Array<int>& bytes, const juce::Array<int>& suffix)
{
    if (suffix.size() > bytes.size())
        return false;

    auto offset = bytes.size() - suffix.size();
    for (int i = 0; i < suffix.size(); ++i)
        if (bytes[offset + i] != suffix[i])
            return false;

    return true;
}

bool bytesEqual (const juce::Array<int>& left, const juce::Array<int>& right)
{
    if (left.size() != right.size())
        return false;

    for (int i = 0; i < left.size(); ++i)
        if (left[i] != right[i])
            return false;

    return true;
}

juce::Array<int> bytesSlice (const juce::Array<int>& bytes, int start, int count)
{
    juce::Array<int> result;
    for (int i = 0; i < count && start + i < bytes.size(); ++i)
        result.add (bytes[start + i]);
    return result;
}

juce::String bytesToHexText (const juce::Array<int>& bytes)
{
    juce::StringArray parts;
    for (auto byte : bytes)
        parts.add (byteToHex (byte));
    return parts.joinIntoString (" ");
}

juce::var dumpDiagnosticList (const juce::String& code,
                              const juce::String& message,
                              const juce::String& dumpId)
{
    juce::Array<juce::var> diagnostics;
    auto* diagnostic = new juce::DynamicObject();
    diagnostic->setProperty ("level", "error");
    diagnostic->setProperty ("code", code);
    diagnostic->setProperty ("message", message);
    if (dumpId.isNotEmpty())
        diagnostic->setProperty ("dumpId", dumpId);
    diagnostics.add (juce::var (diagnostic));
    return juce::var (diagnostics);
}

juce::var dumpRange (const juce::String& label, int start, int length, const juce::String& sourceId = {})
{
    auto* range = new juce::DynamicObject();
    range->setProperty ("label", label);
    range->setProperty ("start", start);
    range->setProperty ("length", length);
    range->setProperty ("end", start + juce::jmax (0, length) - 1);
    if (sourceId.isNotEmpty())
        range->setProperty ("sourceId", sourceId);
    return juce::var (range);
}

void appendDiagnostics (juce::Array<juce::var>& destination, const juce::var& diagnostics)
{
    if (auto* items = diagnostics.getArray())
        for (const auto& item : *items)
            destination.add (item);
}

juce::Array<juce::var> missingRangesForCoverage (int expectedBytes, const std::set<int>& coveredBytes)
{
    juce::Array<juce::var> ranges;
    auto rangeStart = -1;

    for (int offset = 0; offset < expectedBytes; ++offset)
    {
        const auto missing = coveredBytes.find (offset) == coveredBytes.end();
        if (missing && rangeStart < 0)
            rangeStart = offset;

        if ((! missing || offset == expectedBytes - 1) && rangeStart >= 0)
        {
            const auto end = missing && offset == expectedBytes - 1 ? offset : offset - 1;
            ranges.add (dumpRange ("missing", rangeStart, end - rangeStart + 1));
            rangeStart = -1;
        }
    }

    return ranges;
}

// Korg-style 8->7 block UNPACK: the inverse of CE/dpd/codecs.mjs pack8to7. Each group of (groupSize+1)
// wire bytes is one MSB byte followed by up to groupSize 7-bit low bytes; the MSB byte supplies each low
// byte's high bit. Kept byte-for-byte in step with codecs.mjs so the engine decodes exactly what the DPD
// (dumps.mjs) assembles. Lets a whole packed payload (the universal Korg dump case) be unpacked before
// per-offset mapping.
juce::Array<int> dumpUnpack8to7 (const juce::Array<int>& wire, const juce::String& order, int groupSize)
{
    juce::Array<int> out;
    const bool highFirst = order != "msb-low-first"; // default msb-high-first
    for (int g = 0; g < wire.size(); g += groupSize + 1)
    {
        const auto msb = wire[g];
        const auto lowCount = juce::jmin (groupSize, wire.size() - (g + 1));
        for (int i = 0; i < lowCount; ++i)
        {
            const auto lo = wire[g + 1 + i] & 0x7f;
            const auto bit = (msb >> (highFirst ? (groupSize - 1 - i) : i)) & 1;
            out.add (lo | (bit << 7));
        }
    }
    return out;
}

// The inverse: 8->7 block PACK. Kept immediately below the unpacker on purpose — these two have to
// agree bit for bit or a dump built here will not decode there, and a round-trip that fails only on
// the high bit of every eighth byte is a miserable thing to debug. `dumpBuildRoundTrips` in
// DeviceProfileEngineTests drives both over the same bytes.
juce::Array<int> dumpPack8to7 (const juce::Array<int>& raw, const juce::String& order, int groupSize)
{
    juce::Array<int> out;
    const bool highFirst = order != "msb-low-first"; // default msb-high-first, matching the unpacker
    for (int g = 0; g < raw.size(); g += groupSize)
    {
        const auto lowCount = juce::jmin (groupSize, raw.size() - g);
        int msb = 0;
        for (int i = 0; i < lowCount; ++i)
            if ((raw[g + i] & 0x80) != 0)
                msb |= 1 << (highFirst ? (groupSize - 1 - i) : i);

        out.add (msb & 0x7f);
        for (int i = 0; i < lowCount; ++i)
            out.add (raw[g + i] & 0x7f);
    }
    return out;
}

juce::String normalisedTextCodec (const juce::String& codec)
{
    if (codec == "ascii" || codec == "fixed-ascii")
        return "text-ascii";
    if (codec == "nibbled-ascii" || codec == "packed-nibbled-ascii")
        return "text-nibbled-ascii";
    return codec;
}

juce::String trimRightPad (juce::String text, int padByte)
{
    if (padByte < 0 || padByte > 127)
        return text.trimEnd();

    const auto padChar = (juce::juce_wchar) padByte;
    while (text.isNotEmpty() && text.getLastCharacter() == padChar)
        text = text.dropLastCharacters (1);

    return text.trimEnd();
}

bool allMidiDataBytes (const juce::Array<int>& bytes)
{
    for (auto byte : bytes)
        if (! isMidiDataByte (byte))
            return false;

    return true;
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

juce::var DeviceProfileEngine::getCatalogSummary() const
{
    auto* summary = new juce::DynamicObject();
    auto* root = profileObject();
    if (root == nullptr)
        return juce::var (summary);

    const auto count = [] (const juce::var& value) { auto* list = asArray (value); return list != nullptr ? list->size() : 0; };

    summary->setProperty ("manufacturer", propString (*root, "manufacturer"));
    summary->setProperty ("family", propString (*root, "family"));
    summary->setProperty ("status", propString (*root, "status"));
    summary->setProperty ("parameterCount", count (root->getProperty ("parameters")));

    // The kinds of message its parameters are sent as, in the order the recipes first name them.
    juce::StringArray kinds;
    if (auto* recipes = asArray (root->getProperty ("messageRecipes")))
        for (const auto& recipe : *recipes)
            if (auto* object = asObject (recipe))
                kinds.addIfNotAlreadyThere (propString (*object, "kind"));
    kinds.removeEmptyStrings();
    juce::Array<juce::var> kindList;
    for (const auto& kind : kinds)
        kindList.add (kind);
    summary->setProperty ("messageKinds", kindList);

    // Reads back: it declares a dump to parse AND a request that asks for one. A dump nobody can
    // ask for (the DPD's AN1x bulk receive) only reads what the synth sends of its own accord.
    summary->setProperty ("readsBack", count (root->getProperty ("dumpDefinitions")) > 0 && count (root->getProperty ("requests")) > 0);

    auto* presets = asObject (root->getProperty ("presets"));
    summary->setProperty ("presetRecall", presets != nullptr && count (presets->getProperty ("banks")) > 0
                                              && asObject (presets->getProperty ("recall")) != nullptr);

    auto* identity = asObject (root->getProperty ("identity"));
    summary->setProperty ("identifies", identity != nullptr && count (identity->getProperty ("familyCode")) > 0);

    juce::String source;
    if (auto* sources = asArray (root->getProperty ("sources")); sources != nullptr && ! sources->isEmpty())
        if (auto* first = asObject (sources->getReference (0)))
            source = propString (*first, "title");
    summary->setProperty ("source", source);

    auto* coverage = asObject (root->getProperty ("coverage"));
    summary->setProperty ("verifiedOnHardware", coverage != nullptr && (bool) coverage->getProperty ("verifiedOnHardware"));
    return juce::var (summary);
}

juce::String DeviceProfileEngine::getDefaultSyncDirection() const
{
    auto* root = profileObject();
    auto* startup = root != nullptr ? asObject (root->getProperty ("startup")) : nullptr;
    if (startup == nullptr)
        return "pull";

    auto direction = propString (*startup, "syncDirection");
    if (direction.isEmpty())
        direction = propString (*startup, "policy");

    return direction == "push" || direction == "live" ? direction : "pull";
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

DeviceRequestResult DeviceProfileEngine::compileDeviceRequest (const juce::String& deviceRole,
                                                               const juce::String& requestId,
                                                               const juce::var& variables) const
{
    if (hasErrors())
        return { false, "Profile has validation errors" };

    auto resolvedRequestId = requestId.isNotEmpty() ? requestId : defaultStartupRequestId();
    if (resolvedRequestId.isEmpty())
        return { false, "Profile has no startup request" };

    // A dump the profile defines is asked for by the request that answers with it: requestDump
    // takes the dump's id ("system"), which is also the id its answer arrives under, so a script's
    // callback for it can be matched. Only a request id was taken, and a dump id was refused here.
    auto* request = findDeviceRequest (resolvedRequestId);
    if (request == nullptr)
        if ((request = findRequestForDump (resolvedRequestId)) != nullptr)
            resolvedRequestId = propString (*request, "id");
    if (request == nullptr)
        return { false, "Unknown device request: " + resolvedRequestId };

    auto* templateItems = asArray (request->getProperty ("template"));
    if (templateItems == nullptr || templateItems->isEmpty())
        return { false, "Device request requires a template: " + resolvedRequestId };

    juce::Array<int> bytes;
    auto* requestVariables = asObject (variables);
    for (const auto& item : *templateItems)
    {
        auto token = item.toString().trim();
        if (token.startsWithChar ('$'))
        {
            auto variableName = token.substring (1);
            auto variableValue = requestVariables != nullptr && requestVariables->hasProperty (variableName)
                ? (int) requestVariables->getProperty (variableName)
                : (int) resolveVariable (variableName);
            if (! isMidiDataByte (variableValue))
                return { false, "Variable " + token + " is not a MIDI data byte" };
            bytes.add (variableValue);
        }
        else
        {
            auto byte = parseHexByte (token);
            if (byte < 0 || byte > 255)
                return { false, "Invalid hex byte in device request template: " + token };
            bytes.add (byte);
        }
    }

    auto kind = propString (*request, "kind");
    if (kind.isEmpty())
        kind = ! bytes.isEmpty() && bytes[0] == 0xf0 ? "sysex" : "raw";

    if (kind == "sysex")
    {
        if (bytes.isEmpty() || bytes[0] != 0xf0 || bytes.getLast() != 0xf7)
            return { false, "SysEx request must start with F0 and end with F7" };

        for (int index = 1; index < bytes.size() - 1; ++index)
            if (! isMidiDataByte (bytes[index]))
                return { false, "SysEx request data byte outside 0-127: " + byteToHex (bytes[index]) };
    }

    auto* response = asObject (request->getProperty ("response"));
    auto expectedDumpId = response != nullptr ? propString (*response, "dump") : propString (*request, "expectedDump");
    auto continueRequestId = response != nullptr ? propString (*response, "continueRequest") : propString (*request, "continueRequest");
    auto expectedResponseKind = juce::String ("dump");
    if (response != nullptr)
    {
        auto responseKind = propString (*response, "kind");
        if (responseKind == "identity" || propBool (*response, "identity", false))
            expectedResponseKind = "identity";
        else if (responseKind == "bulkDump" && expectedDumpId.isEmpty())
            expectedDumpId = propString (*response, "collectionId");
    }

    MidiMessageSpec message;
    message.kind = kind;
    message.bytes = bytes;
    message.delayAfterMs = propInt (*request, "delayAfterMs", 0);

    MidiTransaction transaction;
    transaction.transactionId = "request_" + resolvedRequestId;
    transaction.deviceRole = deviceRole;
    transaction.parameterId = resolvedRequestId;
    transaction.semanticValue = true;
    transaction.messages.add (message);
    transaction.displayedValue = propString (*request, "name").isNotEmpty() ? propString (*request, "name") : resolvedRequestId;
    transaction.normalizedValue = 1.0;
    transaction.encodedValueHex = bytesToHex (bytes);
    transaction.sendPolicyMode = "request";
    transaction.coalesce = false;
    transaction.minIntervalMs = propInt (*request, "minIntervalMs", 0);
    transaction.sendFinalOnRelease = true;
    transaction.realtimeSafe = false;

    DeviceRequestResult result;
    result.ok = true;
    result.requestId = resolvedRequestId;
    result.name = transaction.displayedValue;
    result.expectedResponseKind = expectedResponseKind;
    result.expectedDumpId = expectedDumpId;
    result.nextStartupRequestId = nextStartupRequestId (resolvedRequestId);
    result.continueRequestId = continueRequestId;
    result.timeoutMs = propInt (*request, "timeoutMs", 2000);
    result.retries = propInt (*request, "retries", 0);
    result.transaction = transaction;
    return result;
}

DeviceRequestResult DeviceProfileEngine::compileIdentityRequest (const juce::String& deviceRole) const
{
    if (hasErrors())
        return { false, "Profile has validation errors" };

    auto* root = profileObject();
    auto* identity = root != nullptr ? asObject (root->getProperty ("identity")) : nullptr;
    if (identity == nullptr)
        return { false, "Profile has no identity declaration" };

    auto deviceId = valueFromVarOrVariable (*identity,
                                            "requestDeviceId",
                                            [this] (const juce::String& name) { return resolveVariable (name); },
                                            0x7f);
    if (! isMidiDataByte (deviceId))
        return { false, "Identity request device id must be 0-127" };

    MidiMessageSpec message;
    message.kind = "sysex";
    message.bytes.add (0xf0);
    message.bytes.add (0x7e);
    message.bytes.add (deviceId);
    message.bytes.add (0x06);
    message.bytes.add (0x01);
    message.bytes.add (0xf7);

    MidiTransaction transaction;
    transaction.transactionId = "request_identityRequest";
    transaction.deviceRole = deviceRole;
    transaction.parameterId = "identityRequest";
    transaction.semanticValue = true;
    transaction.messages.add (message);
    transaction.displayedValue = "Identity Request";
    transaction.normalizedValue = 1.0;
    transaction.encodedValueHex = bytesToHex (message.bytes);
    transaction.sendPolicyMode = "request";
    transaction.coalesce = false;
    transaction.minIntervalMs = 0;
    transaction.sendFinalOnRelease = true;
    transaction.realtimeSafe = false;

    DeviceRequestResult result;
    result.ok = true;
    result.requestId = "identityRequest";
    result.name = transaction.displayedValue;
    result.expectedResponseKind = "identity";
    result.nextStartupRequestId = nextStartupRequestId ("identityRequest");
    result.timeoutMs = propInt (*identity, "timeoutMs", 1000);
    result.retries = propInt (*identity, "retries", 0);
    result.transaction = transaction;
    return result;
}

IdentityMatchResult DeviceProfileEngine::matchIdentityReply (const juce::String& hex) const
{
    IdentityMatchResult result;
    if (hasErrors())
    {
        result.error = "Profile has validation errors";
        return result;
    }

    auto bytes = parseHexBytes (hex);
    if (bytes.size() < 11 || bytes[0] != 0xf0 || bytes[1] != 0x7e || bytes[3] != 0x06 || bytes[4] != 0x02 || bytes.getLast() != 0xf7)
    {
        result.error = "Not an identity reply";
        return result;
    }

    result.isIdentityReply = true;

    for (int index = 1; index < bytes.size() - 1; ++index)
    {
        if (! isMidiDataByte (bytes[index]))
        {
            result.error = "Identity reply data byte outside 0-127: " + byteToHex (bytes[index]);
            return result;
        }
    }

    auto* root = profileObject();
    auto* identity = root != nullptr ? asObject (root->getProperty ("identity")) : nullptr;
    if (identity == nullptr)
    {
        result.error = "Profile has no identity declaration";
        return result;
    }

    const auto manufacturerLength = bytes[5] == 0x00 ? 3 : 1;
    const auto familyOffset = 5 + manufacturerLength;
    const auto modelOffset = familyOffset + 2;
    const auto revisionOffset = modelOffset + 2;
    if (bytes.size() <= revisionOffset)
    {
        result.error = "Identity reply is too short";
        return result;
    }

    auto actualManufacturer = bytesSlice (bytes, 5, manufacturerLength);
    auto actualFamily = bytesSlice (bytes, familyOffset, 2);
    auto actualModel = bytesSlice (bytes, modelOffset, 2);
    auto actualRevision = bytesSlice (bytes, revisionOffset, bytes.size() - revisionOffset - 1);

    auto expectedManufacturer = parsePatternBytes (identity->getProperty ("manufacturerId"),
                                                   [this] (const juce::String& name) { return resolveVariable (name); });
    auto expectedFamily = parsePatternBytes (identity->getProperty ("familyCode"),
                                             [this] (const juce::String& name) { return resolveVariable (name); });
    auto expectedModel = parsePatternBytes (identity->getProperty ("modelNumber"),
                                            [this] (const juce::String& name) { return resolveVariable (name); });
    auto expectedRevision = parsePatternBytes (identity->getProperty ("revision"),
                                               [this] (const juce::String& name) { return resolveVariable (name); });

    result.deviceIdHex = byteToHex (bytes[2]);
    result.manufacturerIdHex = bytesToHexText (actualManufacturer);
    result.familyCodeHex = bytesToHexText (actualFamily);
    result.modelNumberHex = bytesToHexText (actualModel);
    result.revisionHex = bytesToHexText (actualRevision);

    auto* values = new juce::DynamicObject();
    values->setProperty ("identity.deviceId", result.deviceIdHex);
    values->setProperty ("identity.manufacturerId", result.manufacturerIdHex);
    values->setProperty ("identity.familyCode", result.familyCodeHex);
    values->setProperty ("identity.modelNumber", result.modelNumberHex);
    values->setProperty ("identity.revision", result.revisionHex);
    result.values = juce::var (values);

    auto fail = [&result] (const juce::String& field, const juce::String& expected, const juce::String& actual)
    {
        result.error = "Identity " + field + " mismatch: expected " + expected + " but got " + actual;
        return result;
    };

    if (expectedManufacturer.isEmpty())
    {
        result.error = "Identity declaration requires manufacturerId";
        return result;
    }

    if (! allMidiDataBytes (expectedManufacturer) || ! bytesEqual (expectedManufacturer, actualManufacturer))
        return fail ("manufacturerId", bytesToHexText (expectedManufacturer), result.manufacturerIdHex);

    if (! expectedFamily.isEmpty() && (! allMidiDataBytes (expectedFamily) || ! bytesEqual (expectedFamily, actualFamily)))
        return fail ("familyCode", bytesToHexText (expectedFamily), result.familyCodeHex);

    if (! expectedModel.isEmpty() && (! allMidiDataBytes (expectedModel) || ! bytesEqual (expectedModel, actualModel)))
        return fail ("modelNumber", bytesToHexText (expectedModel), result.modelNumberHex);

    if (! expectedRevision.isEmpty() && (! allMidiDataBytes (expectedRevision) || ! bytesEqual (expectedRevision, actualRevision)))
        return fail ("revision", bytesToHexText (expectedRevision), result.revisionHex);

    result.ok = true;
    result.matched = true;
    return result;
}

juce::Array<int> DeviceProfileEngine::buildIdentityReply (int deviceId) const
{
    auto* root = profileObject();
    auto* identity = root != nullptr ? asObject (root->getProperty ("identity")) : nullptr;
    if (identity == nullptr || ! isMidiDataByte (deviceId))
        return {};

    const auto resolver = [this] (const juce::String& name) { return resolveVariable (name); };
    auto manufacturer = parsePatternBytes (identity->getProperty ("manufacturerId"), resolver);
    auto family = parsePatternBytes (identity->getProperty ("familyCode"), resolver);
    auto model = parsePatternBytes (identity->getProperty ("modelNumber"), resolver);
    auto revision = parsePatternBytes (identity->getProperty ("revision"), resolver);

    // The reply's layout is fixed: the parser reads two family bytes and two model bytes whatever
    // the block declares, so a field the block leaves out is zeros, not missing.
    if ((manufacturer.size() != 1 && manufacturer.size() != 3) || ! allMidiDataBytes (manufacturer))
        return {};
    while (family.size() < 2) family.add (0);
    while (model.size() < 2) model.add (0);
    if (revision.isEmpty())
        for (int index = 0; index < 4; ++index)
            revision.add (0);

    juce::Array<int> bytes { 0xf0, 0x7e, deviceId, 0x06, 0x02 };
    for (const auto* part : { &manufacturer, &family, &model, &revision })
        for (int index = 0; index < part->size(); ++index)
            bytes.add ((*part)[index] & 0x7f);
    bytes.add (0xf7);
    return bytes;
}

DeviceProfileEngine::AddressedProtocol DeviceProfileEngine::addressedProtocol() const
{
    AddressedProtocol protocol;
    auto* root = profileObject();
    auto* recipes = root != nullptr ? asArray (root->getProperty ("messageRecipes")) : nullptr;
    if (recipes == nullptr)
        return protocol;

    // One recipe's shape: the header before $address, then which value follows it. Anything that is
    // not header, $address, the value, $checksum, F7 — in that order — is not this protocol.
    struct Shape { juce::Array<int> header, variablePositions; juce::String value, checksumType; int checksumOffset = 0xa5; };
    const auto shapeOf = [this] (const juce::DynamicObject& recipe, Shape& shape)
    {
        auto* items = asArray (recipe.getProperty ("template"));
        auto* checksum = asObject (recipe.getProperty ("checksum"));
        if (propString (recipe, "kind") != "sysex" || items == nullptr || checksum == nullptr)
            return false;

        juce::StringArray tokens;
        for (const auto& item : *items)
            tokens.add (item.toString().trim());

        const auto at = tokens.indexOf ("$address");
        if (at < 1 || tokens.size() != at + 4 || tokens[at + 2] != "$checksum" || tokens[at + 3].toUpperCase() != "F7")
            return false;

        shape.value = tokens[at + 1];
        if ((shape.value != "$encodedValue" && shape.value != "$size")
            || propString (*checksum, "from") != "$address" || propString (*checksum, "to") != shape.value)
            return false;

        for (int index = 0; index < at; ++index)
        {
            if (tokens[index].startsWithChar ('$'))
            {
                const auto value = resolveVariable (tokens[index].substring (1));
                if (value.isVoid() || ! isMidiDataByte ((int) value))
                    return false;
                shape.variablePositions.add (index);
                shape.header.add ((int) value);
            }
            else
            {
                shape.header.add (parseHexByte (tokens[index]));
            }
        }

        shape.checksumType = propString (*checksum, "type");
        shape.checksumOffset = propInt (*checksum, "offset", 0xa5);
        return shape.header.size() > 1 && shape.header[0] == 0xf0;
    };

    Shape write, request;
    juce::String writeRecipeId;
    for (const auto& recipeValue : *recipes)
    {
        auto* recipe = asObject (recipeValue);
        Shape shape;
        if (recipe == nullptr || ! shapeOf (*recipe, shape))
            continue;
        if (shape.value == "$encodedValue" && write.header.isEmpty())
        {
            write = shape;
            writeRecipeId = propString (*recipe, "id");
        }
        else if (shape.value == "$size" && request.header.isEmpty())
        {
            request = shape;
        }
    }

    if (write.header.isEmpty() || request.header.isEmpty() || write.checksumType != request.checksumType)
        return protocol;

    const auto checksumWidth = ce::checksums::toBytes (write.checksumType, juce::Array<int> { 0 }, write.checksumOffset).size();
    if (checksumWidth < 1)
        return protocol;

    // How wide an address is: what the parameters that write through this recipe give. A size is as
    // wide as an address in every protocol of this shape.
    auto addressBytes = 0;
    if (auto* parameters = asArray (root->getProperty ("parameters")))
        for (const auto& parameterValue : *parameters)
            if (auto* parameter = asObject (parameterValue))
                if (propString (*parameter, "messageRecipe") == writeRecipeId)
                    if (const auto address = parseHexBytes (propString (*parameter, "address")); ! address.isEmpty())
                    {
                        addressBytes = address.size();
                        break;
                    }
    if (addressBytes < 1)
        return protocol;

    protocol.ok = true;
    protocol.writeHeader = write.header;
    protocol.requestHeader = request.header;
    protocol.writeVariablePositions = write.variablePositions;
    protocol.requestVariablePositions = request.variablePositions;
    protocol.addressBytes = addressBytes;
    protocol.sizeBytes = addressBytes;
    protocol.checksumType = write.checksumType;
    protocol.checksumOffset = write.checksumOffset;
    protocol.checksumBytes = checksumWidth;
    return protocol;
}

juce::var DeviceProfileEngine::listParameterDescriptors() const
{
    juce::Array<juce::var> descriptors;

    auto* root = profileObject();
    auto* parameters = root != nullptr ? asArray (root->getProperty ("parameters")) : nullptr;
    if (parameters == nullptr)
        return descriptors;

    // The profile's own display.middleC (3 on a Yamaha, where middle C is C3) is how every note
    // parameter on it is written, so each descriptor carries it unless the parameter says otherwise.
    // ce.format.parameter and the value readouts read it from the descriptor, in every runtime.
    juce::var profileMiddleC;
    if (auto* profileDisplay = asObject (root->getProperty ("display")))
        profileMiddleC = profileDisplay->getProperty ("middleC");

    for (const auto& parameterValue : *parameters)
    {
        auto* parameter = asObject (parameterValue);
        if (parameter == nullptr)
            continue;

        auto display = parameter->getProperty ("display");
        if (! profileMiddleC.isVoid())
        {
            auto* own = asObject (display);
            if (own == nullptr || ! own->hasProperty ("middleC"))
            {
                // A copy: the profile document is shared, and this answer must not change it.
                auto* withMiddleC = own != nullptr ? own->clone().release() : new juce::DynamicObject();
                withMiddleC->setProperty ("middleC", profileMiddleC);
                display = juce::var (withMiddleC);
            }
        }

        auto* descriptor = new juce::DynamicObject();
        descriptor->setProperty ("id", propString (*parameter, "id"));
        descriptor->setProperty ("name", propString (*parameter, "name"));
        descriptor->setProperty ("group", propString (*parameter, "group"));
        descriptor->setProperty ("type", propString (*parameter, "type"));
        descriptor->setProperty ("default", parameter->getProperty ("default"));
        descriptor->setProperty ("range", parameter->getProperty ("range"));
        descriptor->setProperty ("choices", parameter->getProperty ("choices"));
        descriptor->setProperty ("display", display);
        descriptor->setProperty ("access", parameter->getProperty ("access"));
        descriptor->setProperty ("sendPolicy", parameter->getProperty ("sendPolicy"));
        descriptor->setProperty ("ui", parameter->getProperty ("ui"));
        descriptors.add (juce::var (descriptor));
    }

    return descriptors;
}

DeviceProfileEngine::PresetSlotInfo DeviceProfileEngine::presetSlotInfo (int slot) const
{
    PresetSlotInfo info;
    // Outside any bank, a slot is its own program number. That is what the JS does, and it keeps a
    // profile with no bank list usable rather than refusing every recall.
    info.program = juce::jlimit (0, 127, slot);

    auto* root = profile.getDynamicObject();
    auto* presets = root != nullptr ? asObject (root->getProperty ("presets")) : nullptr;
    auto* banks = presets != nullptr ? asArray (presets->getProperty ("banks")) : nullptr;
    if (banks == nullptr) return info;

    for (const auto& entry : *banks)
    {
        auto* bank = asObject (entry);
        if (bank == nullptr) continue;
        const auto start = propInt (*bank, "startSlot", 0);
        const auto count = propInt (*bank, "slotCount", 0);
        if (count <= 0 || slot < start || slot >= start + count) continue;

        const auto index = slot - start;
        info.inBank = true;
        info.bankId = propString (*bank, "id");
        info.bankLabel = propString (*bank, "label");
        if (info.bankLabel.isEmpty()) info.bankLabel = info.bankId;
        info.role = propString (*bank, "role");
        if (info.role.isEmpty()) info.role = "user";
        info.writable = bank->hasProperty ("writable") ? propBool (*bank, "writable", true)
                                                       : info.role == "user";
        info.program = juce::jlimit (0, 127, propInt (*bank, "programBase", 0) + index);
        if (bank->hasProperty ("bankMsb")) info.bankMsb = propInt (*bank, "bankMsb", 0);
        if (bank->hasProperty ("bankLsb")) info.bankLsb = propInt (*bank, "bankLsb", 0);

        // Per-slot first, then the bank's own — the same precedence presetSlotInfo has in JS.
        if (auto* categories = asArray (bank->getProperty ("categories")))
            if (index < categories->size())
                info.category = (*categories)[index].toString();
        if (info.category.isEmpty()) info.category = propString (*bank, "category");

        if (auto* names = asArray (bank->getProperty ("names")))
            if (index < names->size())
                info.catalogName = (*names)[index].toString();

        break;
    }

    return info;
}

CompileResult DeviceProfileEngine::compilePresetRecall (const juce::String& deviceRole, int slot) const
{
    auto* root = profile.getDynamicObject();
    auto* presets = root != nullptr ? asObject (root->getProperty ("presets")) : nullptr;
    if (presets == nullptr)
        return { false, "Profile has no preset model (presets block).", {} };

    auto* recall = asObject (presets->getProperty ("recall"));
    if (recall == nullptr)
        return { false, "Preset model has no recall action.", {} };

    if (slot < 0)
        return { false, "Preset recall needs an integer slot >= 0.", {} };

    const auto info = presetSlotInfo (slot);
    if (auto* banks = asArray (presets->getProperty ("banks")))
        if (! banks->isEmpty() && ! info.inBank)
            return { false, "Slot " + juce::String (slot) + " is not inside any preset bank.", {} };

    const auto channel = juce::jlimit (1, 16, recall->hasProperty ("channel")
        ? propInt (*recall, "channel", 1)
        : (int) resolveVariable ("channel"));

    MidiTransaction transaction;
    transaction.transactionId = "preset_recall";
    transaction.deviceRole = deviceRole;
    transaction.parameterId = "preset.slot";
    transaction.semanticValue = juce::var (slot);
    transaction.displayedValue = info.catalogName.isNotEmpty()
        ? (juce::String (slot) + " " + info.catalogName)
        : juce::String (slot);
    transaction.checksumStatus = "none";
    transaction.sendPolicyMode = "onCommit";
    transaction.coalesce = false;

    const auto kind = propString (*recall, "kind");

    const auto addMessage = [&transaction] (const juce::String& messageKind, const juce::Array<int>& bytes)
    {
        MidiMessageSpec message;
        message.kind = messageKind;
        message.bytes = bytes;
        transaction.messages.add (message);
    };

    if (kind == "pc" || kind == "bankPc")
    {
        // Bank Select is sent ONLY for bankPc, and only for the halves the bank actually declares.
        // A machine with one bank has no CC 0 to send, and sending 0 anyway would select bank 0 on a
        // machine that numbers its banks from 1.
        if (kind == "bankPc")
        {
            const auto cc = 0xb0 + channel - 1;
            if (info.bankMsb >= 0) addMessage ("cc", { cc, 0, juce::jlimit (0, 127, info.bankMsb) });
            if (info.bankLsb >= 0) addMessage ("cc", { cc, 32, juce::jlimit (0, 127, info.bankLsb) });
        }
        addMessage ("raw", { 0xc0 + channel - 1, info.program });
        return { true, {}, transaction };
    }

    if (kind == "sysex")
    {
        auto* templateItems = asArray (recall->getProperty ("template"));
        if (templateItems == nullptr || templateItems->isEmpty())
            return { false, "SysEx preset recall has no template.", {} };

        juce::Array<int> bytes;
        juce::Array<int> checksumBytes;
        auto* checksum = asObject (recall->getProperty ("checksum"));
        const auto checksumType = checksum != nullptr ? propString (*checksum, "type") : "none";
        // Everything after the header up to $checksum, which is the span a Roland checksum covers.
        // Started at the first token so a template without $deviceId still accumulates.
        bool collecting = false;

        for (const auto& item : *templateItems)
        {
            const auto token = item.toString().trim();

            if (token == "$checksum")
            {
                if (checksumType == "none") { bytes.add (0); continue; }
                const auto value = ce::checksums::toBytes (checksumType, checksumBytes,
                                                           checksum != nullptr ? propInt (*checksum, "offset", 0xa5) : 0xa5);
                if (value.isEmpty())
                    return { false, "Unsupported checksum type: " + checksumType, {} };
                for (auto byte : value) bytes.add (byte);
                transaction.checksumStatus = "computed";
                continue;
            }

            int value = -1;
            if (token.startsWithChar ('$'))
            {
                const auto name = token.substring (1);
                // The recall's own variables first — the slot it was asked for and what that slot
                // maps to — then the profile's. A profile-level `slot` would otherwise shadow the
                // argument and recall the same preset every time.
                if (name == "slot") value = slot;
                else if (name == "program") value = info.program;
                else if (name == "bankMsb") value = juce::jlimit (0, 127, info.bankMsb < 0 ? 0 : info.bankMsb);
                else if (name == "bankLsb") value = juce::jlimit (0, 127, info.bankLsb < 0 ? 0 : info.bankLsb);
                else value = (int) resolveVariable (name);

                if (! isMidiDataByte (value))
                    return { false, "Variable " + token + " is not a MIDI data byte", {} };
            }
            else
            {
                value = parseHexByte (token);
                if (value < 0 || value > 255)
                    return { false, "Invalid hex byte in preset recall template: " + token, {} };
            }

            bytes.add (value);
            if (collecting) checksumBytes.add (value);
            // F0 and the manufacturer id are header, not payload: a checksum that covered them would
            // disagree with every manual that defines one.
            if (! collecting && bytes.size() >= 2 && bytes[0] == 0xf0) collecting = true;
        }

        if (bytes.isEmpty() || bytes[0] != 0xf0 || bytes[bytes.size() - 1] != 0xf7)
            return { false, "A SysEx preset recall must start with F0 and end with F7.", {} };

        addMessage ("sysex", bytes);
        return { true, {}, transaction };
    }

    return { false, "Unsupported preset recall kind: " + kind, {} };
}

juce::var DeviceProfileEngine::getPresetBrowser() const
{
    auto* root = profileObject();
    return root != nullptr ? root->getProperty ("presetBrowser") : juce::var {};
}

juce::var DeviceProfileEngine::getTiming() const
{
    auto* root = profileObject();
    return root != nullptr ? root->getProperty ("timing") : juce::var {};
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
        result.kind = propString (*test, "kind").isNotEmpty() ? propString (*test, "kind") : "parameter";

        if (result.kind == "request")
        {
            result.expectedHex = propString (*test, "expectedHex").trim().toUpperCase();
            auto requestResult = compileDeviceRequest ("mainSynth", propString (*test, "request"), test->getProperty ("variables"));
            if (! requestResult.ok)
            {
                result.error = requestResult.error;
                results.add (result);
                continue;
            }

            result.actualHex = transactionToHex (requestResult.transaction);
            result.passed = result.actualHex == result.expectedHex;
            if (! result.passed)
                result.error = "Expected " + result.expectedHex + " but got " + result.actualHex;

            results.add (result);
            continue;
        }

        if (result.kind == "identityRequest")
        {
            result.expectedHex = propString (*test, "expectedHex").trim().toUpperCase();
            auto requestResult = compileIdentityRequest ("mainSynth");
            if (! requestResult.ok)
            {
                result.error = requestResult.error;
                results.add (result);
                continue;
            }

            result.actualHex = transactionToHex (requestResult.transaction);
            result.passed = result.actualHex == result.expectedHex;
            if (! result.passed)
                result.error = "Expected " + result.expectedHex + " but got " + result.actualHex;

            results.add (result);
            continue;
        }

        if (result.kind == "identityReply")
        {
            auto identityResult = matchIdentityReply (propString (*test, "inputHex"));
            result.expectedValues = test->getProperty ("expectedValues");
            result.actualValues = identityResult.values;

            if (! identityResult.matched)
            {
                result.error = identityResult.error;
                results.add (result);
                continue;
            }

            auto* expected = result.expectedValues.getDynamicObject();
            auto* actual = result.actualValues.getDynamicObject();
            if (expected == nullptr)
            {
                result.error = "Identity reply test requires expectedValues";
                results.add (result);
                continue;
            }

            result.passed = true;
            for (const auto& property : expected->getProperties())
            {
                auto actualValue = actual != nullptr ? actual->getProperty (property.name) : juce::var {};
                if (! varsEqual (property.value, actualValue))
                {
                    result.passed = false;
                    result.error = "Expected " + property.name.toString() + " = " + property.value.toString()
                                   + " but got " + actualValue.toString();
                    break;
                }
            }

            results.add (result);
            continue;
        }

        if (result.kind == "dumpParse")
        {
            auto parseResult = parseDumpMessage (propString (*test, "inputHex"));
            result.expectedValues = test->getProperty ("expectedValues");
            result.actualValues = parseResult.values;

            if (! parseResult.ok)
            {
                result.error = parseResult.error;
                results.add (result);
                continue;
            }

            auto* expected = result.expectedValues.getDynamicObject();
            auto* actual = result.actualValues.getDynamicObject();
            if (expected == nullptr)
            {
                result.error = "Dump parse test requires expectedValues";
                results.add (result);
                continue;
            }

            result.passed = true;
            for (const auto& property : expected->getProperties())
            {
                auto actualValue = actual != nullptr ? actual->getProperty (property.name) : juce::var {};
                if (! varsEqual (property.value, actualValue))
                {
                    result.passed = false;
                    result.error = "Expected " + property.name.toString() + " = " + property.value.toString()
                                   + " but got " + actualValue.toString();
                    break;
                }
            }

            results.add (result);
            continue;
        }

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

DumpParseResult DeviceProfileEngine::parseDumpMessage (const juce::String& hex) const
{
    auto fail = [] (const juce::String& status, const juce::String& error)
    {
        DumpParseResult result { false, error, {}, {}, "none", {} };
        result.matchStatus = status;
        result.diagnostics = dumpDiagnosticList (status, error, {});
        return result;
    };

    if (hasErrors())
        return fail ("invalidProfile", "Profile has validation errors");

    auto bytes = parseHexBytes (hex);
    if (bytes.isEmpty())
        return fail ("empty", "Dump message is empty");

    if (bytes[0] == 0xf0 && bytes.getLast() != 0xf7)
        return fail ("partial", "SysEx dump must end with F7");

    for (int index = 1; index < bytes.size() - 1; ++index)
        if (! isMidiDataByte (bytes[index]))
            return fail ("invalidMidiData", "SysEx data byte outside 0-127: " + byteToHex (bytes[index]));

    auto* root = profileObject();
    auto* dumps = root != nullptr ? asArray (root->getProperty ("dumpDefinitions")) : nullptr;
    if (dumps == nullptr || dumps->isEmpty())
        return fail ("noDefinitions", "Profile has no dump definitions");

    DumpParseResult bestError;
    auto bestRank = -1;
    for (const auto& dumpValue : *dumps)
    {
        auto* dump = asObject (dumpValue);
        if (dump == nullptr)
            continue;

        auto parsed = parseDumpWithDefinition (*dump, bytes);
        if (parsed.ok)
            return parsed;

        auto rank = 0;
        if (parsed.matchStatus == "checksumFailed" || parsed.matchStatus == "unsupportedCodec")
            rank = 4;
        else if (parsed.matchStatus == "partial")
            rank = 3;
        else if (parsed.dumpId.isNotEmpty())
            rank = 2;
        else if (parsed.matchStatus == "noMatch")
            rank = 1;

        if (rank >= bestRank)
        {
            bestError = parsed;
            bestRank = rank;
        }
    }

    if (bestError.error.isNotEmpty())
        return bestError;

    return fail ("noMatch", "No dump definition matched message");
}

DumpBuildResult DeviceProfileEngine::buildDumpMessage (const juce::String& dumpId, const juce::var& values) const
{
    auto fail = [&dumpId] (const juce::String& error)
    {
        DumpBuildResult result;
        result.dumpId = dumpId;
        result.error = error;
        return result;
    };

    if (hasErrors())
        return fail ("Profile has validation errors");

    auto* root = profileObject();
    auto* dumps = root != nullptr ? asArray (root->getProperty ("dumpDefinitions")) : nullptr;
    if (dumps == nullptr || dumps->isEmpty())
        return fail ("Profile has no dump definitions");

    // By id, then by name. A script author reaches for whichever of the two they can see in the DPD,
    // and refusing the name would be a needless papercut.
    const juce::DynamicObject* dump = nullptr;
    for (const auto& dumpValue : *dumps)
    {
        auto* candidate = asObject (dumpValue);
        if (candidate == nullptr)
            continue;
        if (propString (*candidate, "id") == dumpId || propString (*candidate, "name") == dumpId)
        {
            dump = candidate;
            break;
        }
    }
    if (dump == nullptr)
        return fail ("No dump definition named: " + dumpId);

    DumpBuildResult result;
    result.dumpId = propString (*dump, "id");
    result.dumpName = propString (*dump, "name");

    auto* matcher = asObject (dump->getProperty ("matcher"));
    const auto resolver = [this] (const juce::String& name) { return resolveVariable (name); };
    auto prefix = matcher != nullptr ? parsePatternBytes (matcher->getProperty ("prefix"), resolver) : juce::Array<int> {};
    auto suffix = matcher != nullptr ? parsePatternBytes (matcher->getProperty ("suffix"), resolver) : juce::Array<int> {};

    auto* payload = asObject (dump->getProperty ("payload"));
    const auto payloadOffset = payload != nullptr ? propInt (*payload, "offset", prefix.size()) : prefix.size();
    const auto payloadSize = payload != nullptr ? propInt (*payload, "size", 0) : 0;
    if (payloadSize <= 0)
        return fail ("Dump definition has no payload size: " + result.dumpId);

    auto* payloadPack = payload != nullptr ? asObject (payload->getProperty ("pack")) : nullptr;
    const bool payloadPacked = payloadPack != nullptr && propString (*payloadPack, "type") == "packed8to7";
    const auto packGroupSize = payloadPacked ? juce::jmax (1, propInt (*payloadPack, "groupSize", 7)) : 7;
    const auto packOrder = payloadPacked ? propString (*payloadPack, "packOrder") : juce::String();

    auto* mappings = asArray (dump->getProperty ("mappings"));
    if (mappings == nullptr || mappings->isEmpty())
        return fail ("Dump definition has no mappings: " + result.dumpId);

    // The payload is built UNPACKED, because mapping offsets address unpacked bytes — the same
    // convention parseDumpWithDefinition uses when it unpacks before decoding. Packing happens once,
    // at the end, over the finished buffer.
    const auto defaultByte = payload != nullptr ? propInt (*payload, "defaultByte", 0) : 0;
    juce::Array<int> body;
    for (int index = 0; index < payloadSize; ++index)
        body.add (defaultByte & 0x7f);

    auto* given = values.getDynamicObject();
    std::set<juce::String> consumed;

    for (const auto& mappingValue : *mappings)
    {
        auto* mapping = asObject (mappingValue);
        if (mapping == nullptr)
            continue;

        const auto parameterId = propString (*mapping, "parameter");
        auto* parameter = findParameter (parameterId);
        if (parameter == nullptr)
            return fail ("Dump mapping references unknown parameter: " + parameterId);

        // A value the caller did not supply leaves the definition's default bytes in place. This is
        // the ordinary case for a panel that binds part of a dump, so it is reported, not refused.
        if (given == nullptr || ! given->hasProperty (parameterId))
        {
            result.unmappedParameters.add (parameterId);
            continue;
        }
        consumed.insert (parameterId);

        // A mapping's codec, when it gives one, is how this dump keeps the value, as the parser reads
        // it (decodeDumpParameterValue's codecOverride). Built with the parameter's own encoding
        // instead, a field the dump keeps LSB-first went out MSB-first, or was refused.
        auto codecOverride = mapping->getProperty ("codec");
        if (codecOverride.isVoid())
            codecOverride = mapping->getProperty ("nameCodec");
        std::unique_ptr<juce::DynamicObject> withCodec;
        if (asObject (codecOverride) != nullptr)
        {
            withCodec = parameter->clone();
            withCodec->setProperty ("encoding", codecOverride);
        }

        juce::var semanticValue;
        juce::Array<int> encodedBytes;
        double normalizedValue = 0.0;
        juce::String displayedValue;
        auto encoded = validateAndEncodeValue (withCodec != nullptr ? *withCodec : *parameter, given->getProperty (parameterId),
                                               semanticValue, encodedBytes, normalizedValue, displayedValue);
        if (encoded.failed())
            return fail ("Cannot encode " + parameterId + ": " + encoded.getErrorMessage());

        const auto offset = propInt (*mapping, "offset");
        if (offset < 0 || offset + encodedBytes.size() > body.size())
            return fail ("Mapping for " + parameterId + " writes outside the payload (offset "
                         + juce::String (offset) + ", " + juce::String (encodedBytes.size()) + " byte(s), payload "
                         + juce::String (payloadSize) + ")");

        for (int index = 0; index < encodedBytes.size(); ++index)
            body.set (offset + index, encodedBytes[index] & 0x7f);
    }

    if (given != nullptr)
        for (const auto& property : given->getProperties())
            if (consumed.find (property.name.toString()) == consumed.end())
                result.unknownParameters.add (property.name.toString());

    const auto wireBody = payloadPacked ? dumpPack8to7 (body, packOrder, packGroupSize) : body;

    // Frame it: prefix, payload at its declared offset, room for the checksum, then suffix. The gap
    // between the prefix and the payload offset is real in some profiles (a device id or a bank byte
    // the matcher does not claim), so it is filled rather than assumed empty.
    juce::Array<int> bytes (prefix);
    while (bytes.size() < payloadOffset)
        bytes.add (0);
    bytes.addArray (wireBody);

    // The checksum FIELD has to exist before the suffix goes on. In the Roland shape the byte sits
    // between the last data byte and F7 (`byteOffset: 72`, payload ending at 71), so appending the
    // suffix first would put the checksum on top of F7 and produce a message that neither ends
    // correctly nor verifies. Reserved here, filled in below once the frame is complete.
    auto* checksumSpec = asObject (dump->getProperty ("checksum"));
    if (checksumSpec != nullptr)
    {
        const auto reserveAt = propInt (*checksumSpec, "byteOffset", bytes.size());
        const auto reserveCount = juce::jmax (1, propInt (*checksumSpec, "byteCount", 1));
        while (bytes.size() < reserveAt + reserveCount)
            bytes.add (0);
    }

    bytes.addArray (suffix);

    // Checksum last, over the finished frame, using the same shared table the verifier reads — which
    // is the point: a dump built here has to satisfy the checksum check in parseDumpWithDefinition.
    if (auto* checksum = checksumSpec)
    {
        const auto type = propString (*checksum, "type");
        const auto fromOffset = propInt (*checksum, "fromOffset", 0);
        const auto toOffset = propInt (*checksum, "toOffset", bytes.size() - 2);
        const auto byteOffset = propInt (*checksum, "byteOffset", bytes.size() - 2);

        if (fromOffset < 0 || toOffset >= bytes.size() || fromOffset > toOffset || byteOffset < 0)
            return fail ("Dump checksum range is outside the built message");

        juce::Array<int> covered;
        for (int index = fromOffset; index <= toOffset; ++index)
            covered.add (bytes[index]);

        const auto computed = ce::checksums::toBytes (type, covered, propInt (*checksum, "offset", 0xa5));
        if (computed.isEmpty())
            return fail ("Unsupported dump checksum type: " + type);

        const auto byteCount = juce::jmax (1, propInt (*checksum, "byteCount", computed.size()));
        if (byteOffset + byteCount > bytes.size())
            return fail ("Dump checksum does not fit in the built message");

        for (int index = 0; index < byteCount && index < computed.size(); ++index)
            bytes.set (byteOffset + index, computed[index]);
        result.checksumStatus = "ok";
    }

    juce::StringArray hexBytes;
    for (const auto byte : bytes)
        hexBytes.add (byteToHex (byte));

    result.ok = true;
    result.bytes = bytes;
    result.hex = hexBytes.joinIntoString (" ");
    return result;
}

DumpCollectionResult DeviceProfileEngine::collectDumpMessages (const juce::StringArray& hexMessages) const
{
    DumpCollectionResult result;
    result.receivedMessageCount = hexMessages.size();

    auto* values = new juce::DynamicObject();
    juce::Array<juce::var> messages;
    juce::Array<juce::var> receivedRanges;
    juce::Array<juce::var> duplicateRanges;
    juce::Array<juce::var> diagnostics;
    std::set<int> coveredBytes;

    // A collection whose size the instrument decides (a Yamaha Performance: as many part blocks as
    // it has parts) names the dump that ends it, its Bulk Footer, and is complete when that arrives.
    juce::String endsWith;
    auto ended = false;

    auto appendDiagnostic = [&] (const juce::String& code, const juce::String& message, const juce::String& sourceId = {})
    {
        appendDiagnostics (diagnostics, dumpDiagnosticList (code, message, sourceId));
    };

    for (const auto& hex : hexMessages)
    {
        auto parsed = parseDumpMessage (hex);
        auto* messageObject = new juce::DynamicObject();
        messageObject->setProperty ("ok", parsed.ok);
        messageObject->setProperty ("dumpId", parsed.dumpId);
        messageObject->setProperty ("dumpName", parsed.dumpName);
        messageObject->setProperty ("matchStatus", parsed.matchStatus);
        messageObject->setProperty ("complete", parsed.complete);
        messageObject->setProperty ("expectedBytes", parsed.expectedBytes);
        messageObject->setProperty ("receivedBytes", parsed.receivedBytes);
        messageObject->setProperty ("checksumStatus", parsed.checksumStatus);
        messageObject->setProperty ("error", parsed.error);
        messages.add (juce::var (messageObject));

        if (! parsed.ok)
        {
            ++result.failedMessageCount;
            appendDiagnostics (diagnostics, parsed.diagnostics);
            continue;
        }

        ++result.parsedMessageCount;
        appendDiagnostics (diagnostics, parsed.diagnostics);

        auto* completion = parsed.completion.getDynamicObject();
        const auto collectionId = completion != nullptr
            ? completion->getProperty ("collectionId").toString()
            : juce::String {};
        const auto messageEndsWith = completion != nullptr
            ? completion->getProperty ("endsWith").toString()
            : juce::String {};
        if (endsWith.isEmpty())
            endsWith = messageEndsWith;
        if (parsed.dumpId.isNotEmpty() && parsed.dumpId == messageEndsWith)
            ended = true;
        if (result.collectionId.isEmpty())
            result.collectionId = collectionId.isNotEmpty() ? collectionId : parsed.dumpId;
        else if (collectionId.isNotEmpty() && collectionId != result.collectionId)
            appendDiagnostic ("mixedCollection", "Dump message belongs to a different collection: " + collectionId, parsed.dumpId);

        result.expectedMessageCount = juce::jmax (result.expectedMessageCount,
                                                  parsed.expectedMessageCount);

        if (completion != nullptr)
        {
            result.expectedBytes = juce::jmax (result.expectedBytes,
                                               propInt (*completion, "collectionBytes",
                                                        propInt (*completion, "totalBytes", 0)));
            result.expectedBytes = juce::jmax (result.expectedBytes,
                                               propInt (*completion, "expectedCollectionBytes", 0));
        }

        if (result.expectedBytes <= 0)
            result.expectedBytes = juce::jmax (result.expectedBytes, parsed.expectedBytes);

        auto rangeStart = result.receivedBytes;
        auto rangeLength = parsed.expectedBytes > 0 ? parsed.expectedBytes : parsed.receivedBytes;
        juce::String rangeLabel = parsed.dumpId;

        if (completion != nullptr)
        {
            if (auto* addressRange = asObject (completion->getProperty ("addressRange")))
            {
                rangeStart = propInt (*addressRange, "start", rangeStart);
                rangeLength = propInt (*addressRange, "length", rangeLength);
                auto label = propString (*addressRange, "label");
                if (label.isNotEmpty())
                    rangeLabel = label;
            }
            else if (auto* range = asObject (completion->getProperty ("range")))
            {
                rangeStart = propInt (*range, "start", rangeStart);
                rangeLength = propInt (*range, "length", rangeLength);
                auto label = propString (*range, "label");
                if (label.isNotEmpty())
                    rangeLabel = label;
            }
        }

        receivedRanges.add (dumpRange (rangeLabel, rangeStart, rangeLength, parsed.dumpId));
        for (int offset = rangeStart; offset < rangeStart + rangeLength; ++offset)
        {
            if (coveredBytes.find (offset) != coveredBytes.end())
                duplicateRanges.add (dumpRange ("duplicate", offset, 1, parsed.dumpId));
            coveredBytes.insert (offset);
        }

        if (auto* parsedValues = parsed.values.getDynamicObject())
            for (const auto& property : parsedValues->getProperties())
                values->setProperty (property.name, property.value);
    }

    result.receivedBytes = static_cast<int> (coveredBytes.size());
    auto missingRanges = result.expectedBytes > 0 ? missingRangesForCoverage (result.expectedBytes, coveredBytes)
                                                  : juce::Array<juce::var> {};

    // Ended, the collection is as many messages as came: the footer is what says so.
    if (ended || result.expectedMessageCount <= 0)
        result.expectedMessageCount = result.receivedMessageCount;

    result.values = juce::var (values);
    result.messages = juce::var (messages);
    result.receivedRanges = juce::var (receivedRanges);
    result.missingRanges = juce::var (missingRanges);
    result.duplicateRanges = juce::var (duplicateRanges);
    result.diagnostics = juce::var (diagnostics);

    const auto counted = endsWith.isNotEmpty() ? ended
                                          : result.receivedMessageCount >= result.expectedMessageCount;
    result.complete = result.failedMessageCount == 0
        && counted
        && missingRanges.isEmpty();
    result.ok = result.failedMessageCount == 0;
    result.status = result.complete ? "complete" : (result.ok ? "partial" : "error");

    if (! result.complete)
    {
        if (result.failedMessageCount > 0)
            result.error = juce::String (result.failedMessageCount) + " dump message(s) failed";
        else
            result.error = "Dump collection incomplete";

        appendDiagnostic (result.status, result.error, result.collectionId);
        result.diagnostics = juce::var (diagnostics);
    }

    return result;
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

    if (auto* requests = asArray (root->getProperty ("requests")))
    {
        for (int index = 0; index < requests->size(); ++index)
        {
            auto path = "requests[" + juce::String (index) + "]";
            auto* request = asObject ((*requests)[index]);
            if (request == nullptr)
            {
                addValidation (ValidationMessage::Level::error, path, "Device request must be an object");
                continue;
            }

            auto requestId = propString (*request, "id");
            if (requestId.isEmpty())
                addValidation (ValidationMessage::Level::error, path + ".id", "Device request id is required");

            auto* templateItems = asArray (request->getProperty ("template"));
            if (templateItems == nullptr || templateItems->isEmpty())
                addValidation (ValidationMessage::Level::error, path + ".template", "Device request requires a message template");

            auto* response = asObject (request->getProperty ("response"));
            auto expectedDumpId = response != nullptr ? propString (*response, "dump") : propString (*request, "expectedDump");
            if (expectedDumpId.isNotEmpty() && findDumpDefinition (expectedDumpId) == nullptr)
                addValidation (ValidationMessage::Level::error, path + ".response.dump", "Unknown dump definition: " + expectedDumpId);

            auto continueRequestId = response != nullptr ? propString (*response, "continueRequest") : propString (*request, "continueRequest");
            if (continueRequestId.isNotEmpty() && findDeviceRequest (continueRequestId) == nullptr)
                addValidation (ValidationMessage::Level::error, path + ".response.continueRequest", "Unknown continue request: " + continueRequestId);
        }
    }

    if (auto* identity = asObject (root->getProperty ("identity")))
    {
        auto manufacturerId = parsePatternBytes (identity->getProperty ("manufacturerId"),
                                                 [this] (const juce::String& name) { return resolveVariable (name); });
        if (manufacturerId.isEmpty())
            addValidation (ValidationMessage::Level::error, "identity.manufacturerId", "Identity manufacturerId is required");
        else if (! allMidiDataBytes (manufacturerId))
            addValidation (ValidationMessage::Level::error, "identity.manufacturerId", "Identity manufacturerId bytes must be 0-127");

        auto requestDeviceId = valueFromVarOrVariable (*identity,
                                                       "requestDeviceId",
                                                       [this] (const juce::String& name) { return resolveVariable (name); },
                                                       0x7f);
        if (! isMidiDataByte (requestDeviceId))
            addValidation (ValidationMessage::Level::error, "identity.requestDeviceId", "Identity request device id must be 0-127");

        auto familyCode = parsePatternBytes (identity->getProperty ("familyCode"),
                                             [this] (const juce::String& name) { return resolveVariable (name); });
        auto modelNumber = parsePatternBytes (identity->getProperty ("modelNumber"),
                                              [this] (const juce::String& name) { return resolveVariable (name); });
        auto revision = parsePatternBytes (identity->getProperty ("revision"),
                                           [this] (const juce::String& name) { return resolveVariable (name); });

        if (! familyCode.isEmpty() && (familyCode.size() != 2 || ! allMidiDataBytes (familyCode)))
            addValidation (ValidationMessage::Level::error, "identity.familyCode", "Identity familyCode must contain two MIDI data bytes");
        if (! modelNumber.isEmpty() && (modelNumber.size() != 2 || ! allMidiDataBytes (modelNumber)))
            addValidation (ValidationMessage::Level::error, "identity.modelNumber", "Identity modelNumber must contain two MIDI data bytes");
        if (! revision.isEmpty() && ! allMidiDataBytes (revision))
            addValidation (ValidationMessage::Level::error, "identity.revision", "Identity revision bytes must be 0-127");
    }

    if (auto* startup = asObject (root->getProperty ("startup")))
        if (auto* sync = asArray (startup->getProperty ("sync")))
            for (int index = 0; index < sync->size(); ++index)
            {
                auto requestId = (*sync)[index].toString();
                if (auto* step = asObject ((*sync)[index]))
                    requestId = propString (*step, "request");

                if (requestId.isNotEmpty() && findDeviceRequest (requestId) == nullptr)
                    addValidation (ValidationMessage::Level::error,
                                   "startup.sync[" + juce::String (index) + "].request",
                                   "Unknown startup request: " + requestId);
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

const juce::DynamicObject* DeviceProfileEngine::findDeviceRequest (const juce::String& requestId) const
{
    auto* root = profileObject();
    auto* requests = root != nullptr ? asArray (root->getProperty ("requests")) : nullptr;
    if (requests == nullptr)
        return nullptr;

    for (const auto& requestValue : *requests)
        if (auto* request = asObject (requestValue))
            if (propString (*request, "id") == requestId)
                return request;

    return nullptr;
}

const juce::DynamicObject* DeviceProfileEngine::findRequestForDump (const juce::String& dumpId) const
{
    auto* dump = findDumpDefinition (dumpId);
    if (dump == nullptr)
        return nullptr;

    // The request that says it answers with this dump, else the one the dump names as its own.
    auto* root = profileObject();
    if (auto* requests = root != nullptr ? asArray (root->getProperty ("requests")) : nullptr)
        for (const auto& requestValue : *requests)
            if (auto* request = asObject (requestValue))
            {
                auto* response = asObject (request->getProperty ("response"));
                const auto expected = response != nullptr ? propString (*response, "dump") : propString (*request, "expectedDump");
                if (expected == dumpId)
                    return request;
            }

    const auto recipe = propString (*dump, "requestRecipe");
    return recipe.isNotEmpty() ? findDeviceRequest (recipe) : nullptr;
}

juce::StringArray DeviceProfileEngine::dumpDefinitionIds() const
{
    juce::StringArray ids;
    auto* root = profileObject();
    auto* dumps = root != nullptr ? asArray (root->getProperty ("dumpDefinitions")) : nullptr;
    if (dumps == nullptr)
        return ids;

    for (const auto& dumpValue : *dumps)
        if (auto* dump = asObject (dumpValue))
        {
            const auto id = propString (*dump, "id");
            if (id.isNotEmpty())
                ids.add (id);
        }

    return ids;
}

juce::StringArray DeviceProfileEngine::dumpAddressVariables (const juce::String& dumpId) const
{
    juce::StringArray names;
    const auto collect = [&names] (const juce::var& tokens)
    {
        if (auto* items = asArray (tokens))
            for (const auto& item : *items)
            {
                const auto token = item.toString().trim();
                if (! token.startsWithChar ('$')) continue;
                const auto name = token.substring (1).initialSectionContainingOnly (
                    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_");
                if (name.isNotEmpty()) names.addIfNotAlreadyThere (name);
            }
    };

    auto* dump = findDumpDefinition (dumpId);
    if (dump == nullptr)
        return names;

    if (auto* matcher = asObject (dump->getProperty ("matcher")))
    {
        collect (matcher->getProperty ("prefix"));
        collect (matcher->getProperty ("suffix"));
    }

    const auto recipe = propString (*dump, "requestRecipe");
    auto* root = profileObject();
    if (auto* requests = root != nullptr ? asArray (root->getProperty ("requests")) : nullptr)
        for (const auto& requestValue : *requests)
            if (auto* request = asObject (requestValue))
            {
                auto* response = asObject (request->getProperty ("response"));
                const bool fetchesThisDump = (recipe.isNotEmpty() && propString (*request, "id") == recipe)
                    || (response != nullptr && propString (*response, "dump") == propString (*dump, "id"));
                if (fetchesThisDump)
                    collect (request->getProperty ("template"));
            }

    return names;
}

juce::StringArray DeviceProfileEngine::presetSlotVariables() const
{
    juce::StringArray names { "slot", "program", "bankMsb", "bankLsb" };
    auto* root = profileObject();
    if (root == nullptr)
        return names;

    if (auto* browser = asObject (root->getProperty ("presetBrowser")))
        if (const auto name = propString (*browser, "slotVariable"); name.isNotEmpty())
            names.addIfNotAlreadyThere (name);

    if (auto* presets = asObject (root->getProperty ("presets")))
        if (auto* nameRequest = asObject (presets->getProperty ("nameRequest")))
            if (const auto name = propString (*nameRequest, "slotVariable"); name.isNotEmpty())
                names.addIfNotAlreadyThere (name);

    return names;
}

const juce::DynamicObject* DeviceProfileEngine::findDumpDefinition (const juce::String& dumpId) const
{
    auto* root = profileObject();
    auto* dumps = root != nullptr ? asArray (root->getProperty ("dumpDefinitions")) : nullptr;
    if (dumps == nullptr)
        return nullptr;

    for (const auto& dumpValue : *dumps)
        if (auto* dump = asObject (dumpValue))
            if (propString (*dump, "id") == dumpId)
                return dump;

    return nullptr;
}

juce::String DeviceProfileEngine::defaultStartupRequestId() const
{
    auto* root = profileObject();
    auto* startup = root != nullptr ? asObject (root->getProperty ("startup")) : nullptr;
    auto* sync = startup != nullptr ? asArray (startup->getProperty ("sync")) : nullptr;

    if (sync != nullptr)
    {
        for (const auto& item : *sync)
        {
            if (auto* syncStep = asObject (item))
            {
                auto request = propString (*syncStep, "request");
                if (request.isNotEmpty())
                    return request;
            }
            else if (item.toString().isNotEmpty())
            {
                return item.toString();
            }
        }
    }

    auto* requests = root != nullptr ? asArray (root->getProperty ("requests")) : nullptr;
    if (requests != nullptr && ! requests->isEmpty())
        if (auto* firstRequest = asObject ((*requests)[0]))
            return propString (*firstRequest, "id");

    return {};
}

juce::String DeviceProfileEngine::nextStartupRequestId (const juce::String& requestId) const
{
    if (requestId.isEmpty())
        return {};

    auto* root = profileObject();
    auto* startup = root != nullptr ? asObject (root->getProperty ("startup")) : nullptr;
    auto* sync = startup != nullptr ? asArray (startup->getProperty ("sync")) : nullptr;
    if (sync == nullptr)
        return {};

    auto found = false;
    for (const auto& item : *sync)
    {
        juce::String current;
        if (auto* syncStep = asObject (item))
            current = propString (*syncStep, "request");
        else
            current = item.toString();

        if (current.isEmpty())
            continue;

        if (found)
            return current;

        found = current == requestId;
    }

    return {};
}

juce::var DeviceProfileEngine::resolveVariable (const juce::String& name) const
{
    auto* root = profileObject();
    auto* variables = root != nullptr ? asObject (root->getProperty ("variables")) : nullptr;
    if (variables == nullptr)
        return {};

    return variables->getProperty (name);
}

DumpParseResult DeviceProfileEngine::parseDumpWithDefinition (const juce::DynamicObject& dump, const juce::Array<int>& bytes) const
{
    const auto dumpId = propString (dump, "id");
    const auto dumpName = propString (dump, "name");
    auto* matcher = asObject (dump.getProperty ("matcher"));
    auto prefix = matcher != nullptr ? parsePatternBytes (matcher->getProperty ("prefix"), [this] (const juce::String& name) { return resolveVariable (name); }) : juce::Array<int> {};
    auto suffix = matcher != nullptr ? parsePatternBytes (matcher->getProperty ("suffix"), [this] (const juce::String& name) { return resolveVariable (name); }) : juce::Array<int> {};
    auto* payload = asObject (dump.getProperty ("payload"));
    auto* completion = asObject (dump.getProperty ("completion"));
    auto payloadOffset = payload != nullptr ? propInt (*payload, "offset", prefix.size()) : prefix.size();
    auto payloadSize = payload != nullptr ? propInt (*payload, "size", 0) : 0;
    // Optional whole-payload 8->7 block packing (Korg). When present the mapped data lives in the
    // UNPACKED payload; the wire carries one extra MSB byte per group, so its length is larger.
    auto* payloadPack = payload != nullptr ? asObject (payload->getProperty ("pack")) : nullptr;
    const bool payloadPacked = payloadPack != nullptr && propString (*payloadPack, "type") == "packed8to7";
    const auto packGroupSize = payloadPacked ? juce::jmax (1, propInt (*payloadPack, "groupSize", 7)) : 7;
    const auto packOrder = payloadPacked ? propString (*payloadPack, "packOrder") : juce::String();
    const auto wirePayloadLen = (payloadPacked && payloadSize > 0)
        ? payloadSize + (payloadSize + packGroupSize - 1) / packGroupSize
        : payloadSize;
    auto expectedMessageCount = completion != nullptr
        ? propInt (*completion, "expectedMessages", propInt (*completion, "expectedMessageCount", 1))
        : 1;
    auto expectedBytes = completion != nullptr
        ? propInt (*completion, "expectedBytes", propInt (*completion, "byteCount", 0))
        : 0;
    auto minimumBytes = completion != nullptr
        ? propInt (*completion, "minBytes", propInt (*completion, "minimumBytes", expectedBytes))
        : expectedBytes;
    auto maximumBytes = completion != nullptr
        ? propInt (*completion, "maxBytes", propInt (*completion, "maximumBytes", 0))
        : 0;

    if (! prefix.isEmpty() && ! startsWithBytes (bytes, prefix))
    {
        DumpParseResult result { false, "Dump prefix did not match " + dumpId, {}, {}, "none", {} };
        result.matchStatus = "noMatch";
        result.receivedBytes = bytes.size();
        return result;
    }

    if (! suffix.isEmpty() && ! endsWithBytes (bytes, suffix))
    {
        DumpParseResult result { false, "Dump suffix did not match " + dumpId, dumpId, dumpName, "none", {} };
        result.matchStatus = "partial";
        result.receivedBytes = bytes.size();
        result.expectedBytes = expectedBytes;
        result.expectedMessageCount = expectedMessageCount;
        result.completion = dump.getProperty ("completion");
        result.diagnostics = dumpDiagnosticList ("partial", result.error, dumpId);
        result.partialFailures = result.diagnostics;
        return result;
    }

    juce::String checksumStatus = "none";
    auto* checksum = asObject (dump.getProperty ("checksum"));
    if (payloadSize > 0 && expectedBytes <= 0)
    {
        auto requiredDataEnd = payloadOffset + wirePayloadLen;
        if (checksum != nullptr)
            requiredDataEnd = juce::jmax (requiredDataEnd, propInt (*checksum, "byteOffset", requiredDataEnd) + 1);
        expectedBytes = requiredDataEnd + suffix.size();
        minimumBytes = expectedBytes;
    }

    auto failForMatchedDump = [&] (const juce::String& status,
                                   const juce::String& error,
                                   const juce::String& checksum)
    {
        DumpParseResult result { false, error, dumpId, dumpName, checksum, {} };
        result.matchStatus = status;
        result.expectedMessageCount = expectedMessageCount;
        result.receivedMessageCount = 1;
        result.expectedBytes = expectedBytes;
        result.receivedBytes = bytes.size();
        result.completion = dump.getProperty ("completion");
        result.diagnostics = dumpDiagnosticList (status, error, dumpId);
        if (status == "partial")
            result.partialFailures = result.diagnostics;
        return result;
    };

    if (minimumBytes > 0 && bytes.size() < minimumBytes)
        return failForMatchedDump ("partial",
                                   "Partial dump " + dumpId + ": expected at least "
                                       + juce::String (minimumBytes) + " byte(s), got "
                                       + juce::String (bytes.size()),
                                   checksumStatus);

    if (maximumBytes > 0 && bytes.size() > maximumBytes)
        return failForMatchedDump ("noMatch",
                                   "Dump byte count for " + dumpId + " is outside the expected range",
                                   checksumStatus);

    if (checksum != nullptr)
    {
        auto type = propString (*checksum, "type");
        auto fromOffset = propInt (*checksum, "fromOffset", 0);
        auto toOffset = propInt (*checksum, "toOffset", bytes.size() - 2);
        auto byteOffset = propInt (*checksum, "byteOffset", bytes.size() - 2);
        if (fromOffset < 0 || toOffset >= bytes.size() || fromOffset > toOffset || byteOffset < 0 || byteOffset >= bytes.size())
            return failForMatchedDump ("partial", "Dump checksum range is outside message", "error");

        // Three algorithms open-coded here before, and the build path below knew a different two —
        // so verifying and building could disagree inside one engine. Both read the shared table now
        // (§48), which is also the table ce.midi.checksum answers from.
        juce::Array<int> covered;
        for (int index = fromOffset; index <= toOffset; ++index)
            covered.add (bytes[index]);

        const auto expected = ce::checksums::toBytes (type, covered, propInt (*checksum, "offset", 0xa5));
        if (expected.isEmpty())
            return failForMatchedDump ("unsupportedChecksum", "Unsupported dump checksum type: " + type, "error");

        // A CRC does not fit in one byte, so a checksum field has a length. Defaulted from the
        // algorithm's own width, so every existing single-byte profile reads exactly as before.
        const auto byteCount = juce::jmax (1, propInt (*checksum, "byteCount", expected.size()));
        if (byteCount != expected.size())
            return failForMatchedDump ("unsupportedChecksum",
                                       "Dump checksum \"" + type + "\" needs "
                                           + juce::String (expected.size()) + " byte(s) but the definition declares "
                                           + juce::String (byteCount),
                                       "error");

        if (byteOffset + byteCount > bytes.size())
            return failForMatchedDump ("partial", "Dump checksum range is outside message", "error");

        // A value the device takes in place of the sum (Waldorf: `A checksum of 7Fh is always
        // accepted as valid`), one byte each, for a one-byte checksum.
        bool accepted = false;
        if (byteCount == 1)
            if (const auto* also = checksum->getProperty ("alsoAccept").getArray())
                for (const auto& value : *also)
                    if (value.toString().getHexValue32() == bytes[byteOffset])
                        accepted = true;

        for (int i = 0; i < byteCount && ! accepted; ++i)
            if (bytes[byteOffset + i] != expected[i])
                return failForMatchedDump ("checksumFailed",
                                           "Dump checksum failed; expected " + byteToHex (expected[i])
                                               + " but got " + byteToHex (bytes[byteOffset + i]),
                                           "error");

        checksumStatus = "ok";
    }

    // A member of a collection may carry no value of its own (a Yamaha Bulk Header or Footer, the
    // block of a part not laid out): it parses to nothing and counts toward the collection. Alone,
    // a definition that reads nothing is a mistake.
    auto* mappings = asArray (dump.getProperty ("mappings"));
    const auto inCollection = completion != nullptr && completion->getProperty ("collectionId").toString().isNotEmpty();
    if ((mappings == nullptr || mappings->isEmpty()) && ! inCollection)
        return failForMatchedDump ("invalidDefinition", "Dump definition has no mappings: " + dumpId, checksumStatus);
    const juce::Array<juce::var> noMappings;
    if (mappings == nullptr)
        mappings = &noMappings;

    // Resolve the buffer that mappings decode against. A block-packed payload (Korg 8->7) is unpacked
    // here so mapping offsets address the UNPACKED bytes; otherwise mappings decode in place from the
    // framed message. The checksum above is always verified over the raw wire bytes (unchanged).
    const juce::Array<int>* decodeBytes = &bytes;
    int decodeBase = payloadOffset;
    juce::Array<int> unpackedPayload;
    if (payloadPacked)
    {
        if (wirePayloadLen <= 0 || payloadOffset + wirePayloadLen > bytes.size())
            return failForMatchedDump ("partial", "Packed dump payload is outside message: " + dumpId, checksumStatus);
        juce::Array<int> wirePayload;
        for (int index = 0; index < wirePayloadLen; ++index)
            wirePayload.add (bytes[payloadOffset + index]);
        unpackedPayload = dumpUnpack8to7 (wirePayload, packOrder, packGroupSize);
        decodeBytes = &unpackedPayload;
        decodeBase = 0;
    }

    // A payload of records (the Groove Synthesis 3rd Wave's program dump: every setting as its NRPN
    // number and value, four bytes each) has no fixed place for a value. Its records are read first,
    // each a key and where it starts; a mapping then names the key it reads (`record`), and may say
    // it reads the one met while another key last held a value (`scope`: the 3rd Wave sets NRPN 0,
    // the part being edited, before each part's settings). A key the dump does not carry leaves its
    // parameter unread, as a parameter with no mapping is. deviceProfileLocalEngine.js reads them
    // the same way.
    auto* records = payload != nullptr ? asObject (payload->getProperty ("records")) : nullptr;
    juce::Array<int> recordKeys, recordStarts;
    const auto recordWidth = [] (const juce::String& type) { return type == "u14" ? 2 : 1; };
    const auto recordField = [&bytes, &recordWidth] (int at, const juce::String& type)
    {
        return recordWidth (type) == 2 ? ((bytes[at] & 0x7f) << 7) | (bytes[at + 1] & 0x7f) : (bytes[at] & 0x7f);
    };
    const auto recordKeyAt = records != nullptr ? propInt (*records, "keyAt", 0) : 0;
    const auto recordKeyType = records != nullptr ? propString (*records, "keyType") : juce::String();
    const auto recordValueAt = records != nullptr ? propInt (*records, "valueAt", 1) : 1;
    const auto recordValueType = records != nullptr ? propString (*records, "valueType") : juce::String();
    if (records != nullptr)
    {
        const auto size = propInt (*records, "size", 0);
        if (payloadPacked || size <= 0 || recordKeyAt < 0 || recordValueAt < 0
            || recordKeyAt + recordWidth (recordKeyType) > size || recordValueAt + recordWidth (recordValueType) > size)
            return failForMatchedDump ("invalidDefinition", "Dump records are not a shape the engine reads: " + dumpId, checksumStatus);
        auto end = bytes.size() - suffix.size();
        if (checksum != nullptr)
            end = juce::jmin (end, propInt (*checksum, "byteOffset", end));
        if (end < payloadOffset || (end - payloadOffset) % size != 0)
            return failForMatchedDump ("partial", "Dump records do not fill the payload of " + dumpId, checksumStatus);
        for (int at = payloadOffset; at < end; at += size)
        {
            recordKeys.add (recordField (at + recordKeyAt, recordKeyType));
            recordStarts.add (at);
        }
    }

    // Owned from the start: two failure paths below return before `values` reaches the result.
    juce::DynamicObject::Ptr values = new juce::DynamicObject();
    for (const auto& mappingValue : *mappings)
    {
        auto* mapping = asObject (mappingValue);
        if (mapping == nullptr)
            continue;

        auto parameterId = propString (*mapping, "parameter");
        auto* parameter = findParameter (parameterId);
        if (parameter == nullptr)
            return failForMatchedDump ("invalidDefinition", "Dump mapping references unknown parameter: " + parameterId, checksumStatus);

        juce::var semanticValue;
        auto codecOverride = mapping->getProperty ("codec");
        if (codecOverride.isVoid())
            codecOverride = mapping->getProperty ("nameCodec");

        auto valueOffset = decodeBase + propInt (*mapping, "offset");
        if (records != nullptr)
        {
            const auto key = propInt (*mapping, "record", -1);
            if (key < 0)
                return failForMatchedDump ("invalidDefinition", "Dump mapping names no record: " + parameterId, checksumStatus);
            auto* scope = asObject (mapping->getProperty ("scope"));
            const auto scopeKey = scope != nullptr ? propInt (*scope, "record", -1) : -1;
            const auto scopeValue = scope != nullptr ? propInt (*scope, "value", 0) : 0;
            auto scopeHeld = -1;
            auto found = -1;
            for (int i = 0; i < recordKeys.size() && found < 0; ++i)
            {
                if (recordKeys[i] == key && (scope == nullptr || scopeHeld == scopeValue))
                    found = i;
                else if (scope != nullptr && recordKeys[i] == scopeKey)
                    scopeHeld = recordField (recordStarts[i] + recordValueAt, recordValueType);
            }
            if (found < 0)
                continue;
            valueOffset = recordStarts[found] + recordValueAt;
        }

        auto decoded = decodeDumpParameterValue (*parameter,
                                                 records != nullptr ? bytes : *decodeBytes,
                                                 valueOffset,
                                                 semanticValue,
                                                 codecOverride);
        if (decoded.failed())
        {
            auto status = decoded.getErrorMessage().startsWith ("Unsupported") ? "unsupportedCodec" : "partial";
            return failForMatchedDump (status, decoded.getErrorMessage(), checksumStatus);
        }

        values->setProperty (parameterId, semanticValue);
    }

    DumpParseResult result { true, {}, dumpId, dumpName, checksumStatus, juce::var (values.get()) };
    result.matchStatus = "ok";
    result.complete = true;
    result.expectedMessageCount = expectedMessageCount;
    result.receivedMessageCount = 1;
    result.expectedBytes = expectedBytes;
    result.receivedBytes = bytes.size();
    result.completion = dump.getProperty ("completion");
    return result;
}

juce::Result DeviceProfileEngine::decodeDumpParameterValue (const juce::DynamicObject& parameter,
                                                            const juce::Array<int>& bytes,
                                                            int offset,
                                                            juce::var& semanticValue,
                                                            const juce::var& codecOverride) const
{
    if (offset < 0 || offset >= bytes.size())
        return juce::Result::fail ("Dump value offset is outside message for " + propString (parameter, "id"));

    auto type = propString (parameter, "type");
    auto* encoding = asObject (codecOverride.isVoid() ? parameter.getProperty ("encoding") : codecOverride);
    auto encodingType = encoding != nullptr ? propString (*encoding, "type") : "u7";

    if (type == "text")
    {
        encodingType = normalisedTextCodec (encodingType);
        auto length = encoding != nullptr ? propInt (*encoding, "length", 1) : 1;
        auto padByte = encoding != nullptr ? propInt (*encoding, "pad", 32) : 32;

        if (encodingType == "text-ascii")
        {
            if (length <= 0 || offset + length > bytes.size())
                return juce::Result::fail ("Text dump value is outside message for " + propString (parameter, "id"));

            juce::String text;
            for (int index = 0; index < length; ++index)
            {
                auto byte = bytes[offset + index];
                if (byte < 32 || byte > 127)
                    return juce::Result::fail ("Text dump value contains non-ASCII byte for " + propString (parameter, "id"));
                text += juce::String::charToString ((juce::juce_wchar) byte);
            }

            semanticValue = trimRightPad (text, padByte);
            return juce::Result::ok();
        }

        if (encodingType == "text-nibbled-ascii")
        {
            auto nibbles = encoding != nullptr ? propInt (*encoding, "nibbles", length * 2) : length * 2;
            if (length <= 0 || nibbles < length * 2 || offset + nibbles > bytes.size())
                return juce::Result::fail ("Nibbled text dump value is outside message for " + propString (parameter, "id"));

            juce::String text;
            for (int index = 0; index < length; ++index)
            {
                auto high = bytes[offset + (index * 2)] & 0x0f;
                auto low = bytes[offset + (index * 2) + 1] & 0x0f;
                auto byte = (high << 4) | low;
                if (byte < 32 || byte > 127)
                    return juce::Result::fail ("Nibbled text dump value contains non-ASCII byte for " + propString (parameter, "id"));
                text += juce::String::charToString ((juce::juce_wchar) byte);
            }

            semanticValue = trimRightPad (text, padByte);
            return juce::Result::ok();
        }

        return juce::Result::fail ("Unsupported text dump codec: " + encodingType + " for " + propString (parameter, "id"));
    }

    auto numeric = bytes[offset];
    if (encodingType == "u14-msb-lsb" || encodingType == "u14")
    {
        if (offset + 1 >= bytes.size())
            return juce::Result::fail ("14-bit dump value requires two bytes for " + propString (parameter, "id"));
        numeric = ((bytes[offset] & 0x7f) << 7) | (bytes[offset + 1] & 0x7f);
    }
    else if (encodingType == "s21-lsb-msb" || encodingType == "s21-msb-lsb")
    {
        if (offset + 2 >= bytes.size())
            return juce::Result::fail ("21-bit dump value requires three bytes for " + propString (parameter, "id"));
        // Least significant byte first (the KingKORG's), or most (the KRONOS's).
        const auto hi = encodingType == "s21-msb-lsb" ? offset : offset + 2;
        const auto lo = encodingType == "s21-msb-lsb" ? offset + 2 : offset;
        numeric = ((bytes[hi] & 0x7f) << 14) | ((bytes[offset + 1] & 0x7f) << 7) | (bytes[lo] & 0x7f);
        if (numeric >= 1048576)
            numeric -= 2097152;
    }
    else if (encodingType == "u14-lsb-msb" || encodingType == "s14-lsb-msb")
    {
        // 14-bit, least-significant byte first (byteOrder lsb-first); s14 is the same bits read as
        // two's complement.
        if (offset + 1 >= bytes.size())
            return juce::Result::fail ("14-bit dump value requires two bytes for " + propString (parameter, "id"));
        numeric = ((bytes[offset + 1] & 0x7f) << 7) | (bytes[offset] & 0x7f);
        if (encodingType == "s14-lsb-msb" && numeric >= 8192)
            numeric -= 16384;
    }
    else if (encodingType == "nibbled")
    {
        auto nibbles = encoding != nullptr ? propInt (*encoding, "nibbles", 2) : 2;
        if (nibbles <= 0 || offset + nibbles > bytes.size())
            return juce::Result::fail ("Nibbled dump value is outside message for " + propString (parameter, "id"));

        numeric = 0;
        for (int index = 0; index < nibbles; ++index)
            numeric = (numeric << 4) | (bytes[offset + index] & 0x0f);
    }
    else if (encodingType == "s7")
    {
        // signed 7-bit: stored value minus a bias (default 64). Mirrors codecs.mjs decodeValue('s7'),
        // so a dump field can carry bipolar parameters (pan, tune, env depth) with their real sign.
        auto signedOffset = encoding != nullptr ? propInt (*encoding, "signedOffset", 64) : 64;
        numeric = (bytes[offset] & 0x7f) - signedOffset;
    }
    else if (encodingType == "u8")
    {
        numeric = bytes[offset] & 0xff; // full 8-bit byte (e.g. recovered from an unpacked payload)
    }
    else if (encodingType == "bitfields")
    {
        // A value put together from bit fields of an unpacked payload, as Korg's program dumps keep
        // one: the minilogue's VCO 1 PITCH is byte 20 (its bits 2-9) and bits 0-1 of byte 52, which
        // it shares with three other settings; the minilogue xd's is two bytes, low byte first.
        // Each part is { at: bytes after the mapping's offset, from: first bit, bits: how many,
        // shift: where they go }. `signed` reads what the parts make as two's complement over their
        // width (the KRONOS keeps -99~+99 as a byte, 9DH~63H). Then either `map` ([[dump value,
        // wire value], ...]: a setting kept as 0-3 in the dump and sent as 0, 42, 84, 127), or
        // `shiftRight` and `max` (a 10-bit value read as the 7-bit controller that sends it, its top
        // seven bits).
        auto* parts = encoding != nullptr ? asArray (encoding->getProperty ("parts")) : nullptr;
        if (parts == nullptr || parts->isEmpty())
            return juce::Result::fail ("Bitfields dump codec requires parts for " + propString (parameter, "id"));

        numeric = 0;
        auto width = 0;
        for (const auto& partValue : *parts)
        {
            auto* part = asObject (partValue);
            if (part == nullptr)
                return juce::Result::fail ("Bitfields dump codec part is not an object for " + propString (parameter, "id"));
            const auto at = offset + propInt (*part, "at", 0);
            const auto from = propInt (*part, "from", 0);
            const auto bits = propInt (*part, "bits", 8);
            const auto shift = propInt (*part, "shift", 0);
            if (at < 0 || at >= bytes.size() || from < 0 || bits < 1 || from + bits > 8 || shift < 0 || shift > 24)
                return juce::Result::fail ("Bitfields dump codec part is outside the message for " + propString (parameter, "id"));
            numeric |= ((bytes[at] >> from) & ((1 << bits) - 1)) << shift;
            width = juce::jmax (width, shift + bits);
        }
        if ((bool) encoding->getProperty ("signed") && width < 31 && numeric >= (1 << (width - 1)))
            numeric -= 1 << width;

        if (auto* map = asArray (encoding->getProperty ("map")))
        {
            auto found = false;
            for (const auto& pairValue : *map)
            {
                auto* pair = asArray (pairValue);
                if (pair != nullptr && pair->size() == 2 && (int) pair->getReference (0) == numeric)
                {
                    numeric = (int) pair->getReference (1);
                    found = true;
                    break;
                }
            }
            if (! found)
                return juce::Result::fail ("Bitfields dump value " + juce::String (numeric) + " is not in the map for " + propString (parameter, "id"));
        }
        else
        {
            numeric >>= juce::jlimit (0, 24, propInt (*encoding, "shiftRight", 0));
            if (encoding->hasProperty ("max"))
                numeric = juce::jmin (numeric, propInt (*encoding, "max", numeric));
        }
    }

    if (type == "choice" || type == "enum")
    {
        auto* choices = asArray (parameter.getProperty ("choices"));
        if (choices != nullptr)
        {
            for (const auto& choiceValue : *choices)
            {
                auto* choice = asObject (choiceValue);
                if (choice != nullptr && propInt (*choice, "value") == numeric)
                {
                    semanticValue = propString (*choice, "id");
                    return juce::Result::ok();
                }
            }
        }
    }

    if (type == "boolean" || type == "momentary")
    {
        auto trueValue = propInt (parameter, "trueValue", 1);
        semanticValue = numeric == trueValue;
        return juce::Result::ok();
    }

    semanticValue = numeric;
    return juce::Result::ok();
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
    // 99/98 select an NRPN, 101/100 an RPN. One builder, two controller pairs — see the header.
    if (kind == "nrpn")
        return compileParameterNumber (deviceRole, parameter, *recipe, semanticValue, encodedBytes,
                                       normalizedValue, displayedValue, dryRun, 99, 98, "NRPN");
    if (kind == "rpn")
        return compileParameterNumber (deviceRole, parameter, *recipe, semanticValue, encodedBytes,
                                       normalizedValue, displayedValue, dryRun, 101, 100, "RPN");
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

        if (encodingType == "u14-msb-lsb" || encodingType == "u14" || encodingType == "u14-lsb-msb")
        {
            // "u14" is the decoder's other name for MSB first; u14-lsb-msb keeps the same 14 bits
            // least significant byte first. Both were read here and only one of the three written.
            auto value = (int) std::round (numeric);
            if (value < 0 || value > 16383)
                return juce::Result::fail ("Encoded u14 value outside 0-16383 for " + propString (parameter, "id"));
            const auto msb = (value >> 7) & 0x7f;
            const auto lsb = value & 0x7f;
            encodedBytes.add (encodingType == "u14-lsb-msb" ? lsb : msb);
            encodedBytes.add (encodingType == "u14-lsb-msb" ? msb : lsb);
            return juce::Result::ok();
        }

        if (encodingType == "s21-lsb-msb")
        {
            // A signed value in 21 bits, two's complement, three 7-bit bytes least significant first:
            // the KingKORG's parameter change ("vvh,vvm,vvl = signed value", sent vvl vvm vvh).
            auto value = (int) std::round (numeric);
            if (value < -1048576 || value > 1048575)
                return juce::Result::fail ("Encoded s21 value outside -1048576-1048575 for " + propString (parameter, "id"));
            const auto wire = value & 0x1fffff;
            encodedBytes.add (wire & 0x7f);
            encodedBytes.add ((wire >> 7) & 0x7f);
            encodedBytes.add ((wire >> 14) & 0x7f);
            return juce::Result::ok();
        }

        if (encodingType == "s21-msb-lsb")
        {
            // The same 21 bits, most significant byte first: the KRONOS's parameter change
            // ("valueH 0scccccc, valueM 0bbbbbbb, valueL 0aaaaaaa", 21-bit two's complement).
            auto value = (int) std::round (numeric);
            if (value < -1048576 || value > 1048575)
                return juce::Result::fail ("Encoded s21 value outside -1048576-1048575 for " + propString (parameter, "id"));
            const auto wire = value & 0x1fffff;
            encodedBytes.add ((wire >> 14) & 0x7f);
            encodedBytes.add ((wire >> 7) & 0x7f);
            encodedBytes.add (wire & 0x7f);
            return juce::Result::ok();
        }

        if (encodingType == "s14-lsb-msb")
        {
            // A signed value in 14 bits, two's complement, least significant byte first: Korg's
            // parameter change ("VVvv = signed value": -50 is 3FCEH, sent 4E 7F).
            auto value = (int) std::round (numeric);
            if (value < -8192 || value > 8191)
                return juce::Result::fail ("Encoded s14 value outside -8192-8191 for " + propString (parameter, "id"));
            const auto wire = value & 0x3fff;
            encodedBytes.add (wire & 0x7f);
            encodedBytes.add ((wire >> 7) & 0x7f);
            return juce::Result::ok();
        }

        if (encodingType == "nibbled")
        {
            auto value = (int) std::round (numeric);
            auto nibbles = encoding != nullptr ? propInt (*encoding, "nibbles", 2) : 2;

            if (nibbles <= 0 || nibbles > 8)
                return juce::Result::fail ("Nibbled encoder requires 1-8 nibbles for " + propString (parameter, "id"));

            auto maxEncoded = 1;
            for (int i = 0; i < nibbles; ++i)
                maxEncoded *= 16;

            if (value < 0 || value >= maxEncoded)
                return juce::Result::fail ("Nibbled value outside 0-" + juce::String (maxEncoded - 1) + " for " + propString (parameter, "id"));

            for (auto shift = (nibbles - 1) * 4; shift >= 0; shift -= 4)
                encodedBytes.add ((value >> shift) & 0x0f);

            return juce::Result::ok();
        }

        if (encodingType == "s7")
        {
            // signed 7-bit: the value plus its bias (default 64), the reverse of the dump decoder's
            // s7 branch and of codecs.mjs encodeValue('s7'). Without it a profile could read a
            // bipolar parameter (pan, tune, env depth) but every write of one was refused here.
            auto signedOffset = encoding != nullptr ? propInt (*encoding, "signedOffset", 64) : 64;
            auto byte = (int) std::round (numeric) + signedOffset;
            if (! isMidiDataByte (byte))
                return juce::Result::fail ("Encoded s7 value outside MIDI data byte range for " + propString (parameter, "id"));
            encodedBytes.add (byte);
            return juce::Result::ok();
        }

        return juce::Result::fail ("Unsupported numeric encoder: " + encodingType);
    }

    if (type == "choice")
    {
        const auto requested = inputValue.toString();
        const bool numericInput = inputValue.isInt() || inputValue.isInt64()
                               || inputValue.isDouble() || inputValue.isBool();
        auto* choices = asArray (parameter.getProperty ("choices"));
        if (choices == nullptr || choices->isEmpty())
            return juce::Result::fail ("Choice parameter has no choices: " + propString (parameter, "id"));

        // Resolve string IDs before labels and wire values. Otherwise a note ID
        // such as "2" can select an earlier choice whose encoded byte is 2.
        // Numeric inputs explicitly denote wire values, not numeric-looking IDs.
        for (int matchKind = inputValue.isString() ? 0 : 2; matchKind < 3; ++matchKind)
        for (int index = 0; index < choices->size(); ++index)
        {
            auto* choice = asObject ((*choices)[index]);
            if (choice == nullptr)
                continue;

            auto id = propString (*choice, "id");
            auto label = propString (*choice, "label");
            auto value = propInt (*choice, "value");

            const bool matched = matchKind == 0 ? requested == id
                               : matchKind == 1 ? requested == label
                               : numericInput ? (double) inputValue == (double) value
                                              : requested == juce::String (value);
            if (matched)
            {
                // A choice with a 14-bit encoding carries 0 - 16383, in two bytes as a 14-bit number
                // does: the Hydrasynth's NRPNs give several parameters one number, the data MSB
                // choosing which, so OSC2 Mode's "WaveScan" is 1 * 128 + 1. Every other choice is a
                // single data byte.
                const auto wide = encodingType == "u14" || encodingType == "14bit"
                               || encodingType == "u14-msb-lsb" || encodingType == "u14-lsb-msb";
                if (wide ? (value < 0 || value > 16383) : ! isMidiDataByte (value))
                    return juce::Result::fail ("Choice encoded value outside MIDI data byte range for " + propString (parameter, "id"));

                semanticValue = id;
                normalizedValue = choices->size() > 1 ? (double) index / (double) (choices->size() - 1) : 1.0;
                displayedValue = label.isNotEmpty() ? label : id;
                if (! wide)
                    encodedBytes.add (value);
                else if (encodingType == "u14-lsb-msb")
                    encodedBytes.addArray ({ value & 0x7f, (value >> 7) & 0x7f });
                else
                    encodedBytes.addArray ({ (value >> 7) & 0x7f, value & 0x7f });
                return juce::Result::ok();
            }
        }

        return juce::Result::fail ("Unknown choice value '" + requested + "' for " + propString (parameter, "id"));
    }

    if (type == "text")
    {
        auto text = inputValue.toString();
        auto fixedLength = encoding != nullptr ? propInt (*encoding, "length", text.length()) : text.length();
        auto padByte = encoding != nullptr ? propInt (*encoding, "pad", 32) : 32;

        // Normalised, as the DECODE path at the top of this file already does. Without it a profile
        // spelling the codec `ascii` — an alias both readers accept — could have its patch name read
        // back and never written, which is a one-directional editor with nothing saying so.
        encodingType = normalisedTextCodec (encodingType);

        if (encodingType != "text-ascii" && encodingType != "text-nibbled-ascii")
            return juce::Result::fail ("Unsupported text encoder: " + encodingType);

        if (fixedLength <= 0)
            return juce::Result::fail ("Text encoder requires a positive length for " + propString (parameter, "id"));

        if (text.length() > fixedLength)
            return juce::Result::fail ("Text is longer than " + juce::String (fixedLength) + " characters for " + propString (parameter, "id"));

        if (! isMidiDataByte (padByte))
            return juce::Result::fail ("Text pad byte outside MIDI data byte range for " + propString (parameter, "id"));

        for (int i = 0; i < fixedLength; ++i)
        {
            auto byte = i < text.length() ? (int) text[i] : padByte;
            if (byte < 32 || byte > 127)
                return juce::Result::fail ("Text contains non-ASCII/MIDI byte for " + propString (parameter, "id"));

            // The exact inverse of the nibbled-ascii DECODER above. It could read a packed name and
            // not write one, so a profile using this codec loaded a patch name into a field that
            // could never be sent back.
            if (encodingType == "text-nibbled-ascii")
            {
                encodedBytes.add ((byte >> 4) & 0x0f);
                encodedBytes.add (byte & 0x0f);
            }
            else
            {
                encodedBytes.add (byte);
            }
        }

        semanticValue = text;
        normalizedValue = juce::jlimit (0.0, 1.0, (double) text.length() / (double) fixedLength);
        displayedValue = text;
        return juce::Result::ok();
    }

    if (type == "action")
    {
        auto encoded = propInt (parameter, "triggerValue", propInt (parameter, "value", 0));
        if (! isMidiDataByte (encoded))
            return juce::Result::fail ("Action encoded value outside MIDI data byte range for " + propString (parameter, "id"));

        semanticValue = true;
        normalizedValue = 1.0;
        displayedValue = "Trigger";
        encodedBytes.add (encoded);
        return juce::Result::ok();
    }

    if (type == "boolean" || type == "momentary")
    {
        auto boolValue = (bool) inputValue;
        auto falseValue = propInt (parameter, "falseValue", 0);
        auto trueValue = propInt (parameter, "trueValue", 1);
        auto encoded = boolValue ? trueValue : falseValue;
        if (! isMidiDataByte (encoded))
            return juce::Result::fail (juce::String (type == "momentary" ? "Momentary" : "Boolean")
                                       + " encoded value outside MIDI data byte range for "
                                       + propString (parameter, "id"));

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

    // A 14-bit pair: the MSB on `controller`, then the LSB on `lsbController` (MIDI's coarse and fine,
    // usually n and n + 32), as two messages. The MSB goes first because a receiver resets the fine
    // half when the coarse one arrives. One byte (a value below 128 with a 7-bit encoder) is the
    // coarse half alone, its fine half 0. deviceProfileLocalEngine.js builds the same bytes.
    const auto lsbController = propInt (recipe, "lsbController", -1);
    const auto hasLsb = recipe.hasProperty ("lsbController");
    MidiMessageSpec fine;
    if (hasLsb)
    {
        if (! isMidiDataByte (lsbController) || lsbController == controller)
            return { false, "CC lsbController must be 0-127 and differ from controller", {} };

        auto* encoding = asObject (parameter.getProperty ("encoding"));
        const auto encodingType = encoding != nullptr ? propString (*encoding, "type") : juce::String();
        const auto lsbFirst = encodingType == "u14-lsb-msb" || encodingType == "s14-lsb-msb";
        const auto msb = encodedBytes.size() > 1 ? encodedBytes[lsbFirst ? 1 : 0] : encodedBytes[0];
        const auto lsb = encodedBytes.size() > 1 ? encodedBytes[lsbFirst ? 0 : 1] : 0;
        message.bytes.add (msb & 0x7f);
        fine.kind = "cc";
        fine.bytes.add (0xb0 + (channel - 1));
        fine.bytes.add (lsbController);
        fine.bytes.add (lsb & 0x7f);
    }
    else
    {
        message.bytes.add (encodedBytes[0]);
    }

    MidiTransaction transaction;
    transaction.transactionId = "dry_tx";
    transaction.deviceRole = deviceRole;
    transaction.parameterId = propString (parameter, "id");
    transaction.semanticValue = semanticValue;
    transaction.messages.add (message);
    if (hasLsb)
        transaction.messages.add (fine);
    transaction.displayedValue = displayedValue;
    transaction.normalizedValue = normalizedValue;
    transaction.encodedValueHex = bytesToHex (encodedBytes);
    transaction.checksumStatus = "none";
    applyParameterPolicies (transaction, parameter);

    juce::ignoreUnused (dryRun);
    return { true, {}, transaction };
}

CompileResult DeviceProfileEngine::compileParameterNumber (const juce::String& deviceRole,
                                                           const juce::DynamicObject& parameter,
                                                           const juce::DynamicObject& recipe,
                                                           const juce::var& semanticValue,
                                                           const juce::Array<int>& encodedBytes,
                                                           double normalizedValue,
                                                           const juce::String& displayedValue,
                                                           bool dryRun,
                                                           int selectMsbController,
                                                           int selectLsbController,
                                                           const juce::String& label) const
{
    auto channel = valueFromVarOrVariable (recipe, "channel", [this] (const juce::String& name) { return resolveVariable (name); }, 1);
    if (channel < 1 || channel > 16)
        return { false, label + " channel must be 1-16", {} };

    auto parameterMsb = propInt (recipe, "parameterMsb");
    auto parameterLsb = propInt (recipe, "parameterLsb");
    if (! isMidiDataByte (parameterMsb) || ! isMidiDataByte (parameterLsb))
        return { false, label + " parameter bytes must be 0-127", {} };

    auto status = 0xb0 + (channel - 1);
    auto messageDelayAfterMs = juce::jmax (0, propInt (recipe,
                                                       "messageDelayAfterMs",
                                                       propInt (recipe, "delayAfterMs", 0)));
    auto addCc = [status, messageDelayAfterMs] (juce::Array<MidiMessageSpec>& messages, int controller, int value)
    {
        MidiMessageSpec message;
        message.kind = "cc";
        message.bytes.add (status);
        message.bytes.add (controller);
        message.bytes.add (value);
        message.delayAfterMs = messageDelayAfterMs;
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

    addCc (transaction.messages, selectMsbController, parameterMsb);
    addCc (transaction.messages, selectLsbController, parameterLsb);

    // Korg's data entry: the low bits of a value wider than 7 bits go FIRST, on a controller of their
    // own (CC 63 on the minilogue family), then the rest on CC 6. `lowBits` says how many: 3 for the
    // 10-bit values (0~1023: 3 then 7), 3 for the 8-bit ones (0~200: 3 then 5), 7 for 14 bits.
    // Unlike CC 38 the split is not at 7 bits, so it is a recipe of its own, not valueResolution.
    const auto lowBitsController = propInt (recipe, "lowBitsController", -1);
    const auto lowBits = propInt (recipe, "lowBits", 0);
    auto resolution = propInt (recipe, "valueResolution", 7);
    if (lowBitsController >= 0 || lowBits != 0)
    {
        if (! isMidiDataByte (lowBitsController) || lowBits < 1 || lowBits > 7)
            return { false, label + " lowBitsController must be 0-127 and lowBits 1-7", {} };
        if (encodedBytes.isEmpty())
            return { false, label + " recipe requires an encoded value", {} };

        auto* encoding = asObject (parameter.getProperty ("encoding"));
        const auto lsbFirst = encoding != nullptr && propString (*encoding, "type") == "u14-lsb-msb";
        const auto value = encodedBytes.size() == 1
                               ? encodedBytes[0]
                               : (encodedBytes[lsbFirst ? 1 : 0] << 7) | encodedBytes[lsbFirst ? 0 : 1];
        const auto high = value >> lowBits;
        if (! isMidiDataByte (high))
            return { false, label + " value " + juce::String (value) + " does not fit " + juce::String (7 + lowBits) + " bits", {} };

        addCc (transaction.messages, lowBitsController, value & ((1 << lowBits) - 1));
        addCc (transaction.messages, 6, high);
    }
    else if (resolution == 14)
    {
        if (encodedBytes.isEmpty())
            return { false, label + " 14-bit recipe requires an encoded value", {} };

        if (encodedBytes.size() == 1)
        {
            // One byte (a choice, a switch, a u7 number) on a 14-bit recipe is a value below 128:
            // MSB 0 on CC 6, the byte on CC 38. The local engine has always sent it this way; this one
            // refused it, so a choice on a synth whose NRPNs are all 14-bit (every Sequential
            // instrument sends "0 = Off, 1 = On" as MSB 0, LSB 1) worked in a preview and failed in
            // the program.
            addCc (transaction.messages, 6, 0);
            addCc (transaction.messages, 38, encodedBytes[0]);
        }
        else
        {
            // Data entry is the MSB on CC 6 and the LSB on CC 38, whichever order the parameter keeps
            // its two bytes in elsewhere.
            auto* encoding = asObject (parameter.getProperty ("encoding"));
            const auto encodingType = encoding != nullptr ? propString (*encoding, "type") : juce::String();
            const auto lsbFirst = encodingType == "u14-lsb-msb" || encodingType == "s14-lsb-msb";
            addCc (transaction.messages, 6, encodedBytes[lsbFirst ? 1 : 0]);
            addCc (transaction.messages, 38, encodedBytes[lsbFirst ? 0 : 1]);
        }
    }
    else
    {
        if (encodedBytes.isEmpty())
            return { false, label + " recipe requires an encoded value", {} };

        addCc (transaction.messages, 6, encodedBytes[0]);
    }

    if (propBool (recipe, "nullAfterSend", false))
    {
        // The null closes the selection so a later CC 6 cannot land on this parameter by accident.
        // It uses the SAME pair that opened it: 99/98 127 for an NRPN, 101/100 127 for an RPN.
        addCc (transaction.messages, selectMsbController, 127);
        addCc (transaction.messages, selectLsbController, 127);
    }

    if (! transaction.messages.isEmpty())
        transaction.messages.getReference (transaction.messages.size() - 1).delayAfterMs = 0;

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
    auto size = parseHexBytes (propString (parameter, "size"));
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
        else if (token == "$size")
        {
            appendBytes (bytes, size);
            appendBytes (checksumBytes, size);
        }
        else if (token == "$checksum")
        {
            auto* checksum = asObject (recipe.getProperty ("checksum"));
            auto type = checksum != nullptr ? propString (*checksum, "type") : "none";

            if (type == "none")
            {
                bytes.add (0);
            }
            else
            {
                // The shared table (§48). This knew sum-7bit and roland-7bit while the verify path
                // above also knew xor, so one engine could build a message it would then reject.
                const auto value = ce::checksums::toBytes (type, checksumBytes,
                                                           checksum != nullptr ? propInt (*checksum, "offset", 0xa5) : 0xa5);
                if (value.isEmpty())
                    return { false, "Unsupported checksum type: " + type, {} };

                for (auto byte : value)
                    bytes.add (byte);
            }

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
