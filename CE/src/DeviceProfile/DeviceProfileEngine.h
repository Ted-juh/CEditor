#pragma once

#include <juce_core/juce_core.h>

namespace ceditor::device
{
struct ValidationMessage
{
    enum class Level
    {
        info,
        warning,
        error
    };

    Level level = Level::info;
    juce::String path;
    juce::String message;
};

struct MidiMessageSpec
{
    juce::String kind;
    juce::Array<int> bytes;
    int delayAfterMs = 0;
};

struct MidiTransaction
{
    juce::String transactionId;
    juce::String deviceRole;
    juce::String parameterId;
    juce::var semanticValue;
    juce::Array<MidiMessageSpec> messages;
    juce::String displayedValue;
    double normalizedValue = 0.0;
    juce::String encodedValueHex;
    juce::String checksumStatus;
    juce::String sendPolicyMode = "continuous";
    bool coalesce = true;
    int minIntervalMs = 0;
    bool sendFinalOnRelease = true;
    bool realtimeSafe = true;
};

struct CompileResult
{
    bool ok = false;
    juce::String error;
    MidiTransaction transaction;
};

struct DeviceRequestResult
{
    bool ok = false;
    juce::String error;
    juce::String requestId;
    juce::String name;
    juce::String expectedResponseKind = "dump";
    juce::String expectedDumpId;
    juce::String nextStartupRequestId;
    juce::String continueRequestId;
    int timeoutMs = 2000;
    int retries = 0;
    MidiTransaction transaction;
};

struct IdentityMatchResult
{
    bool ok = false;
    bool isIdentityReply = false;
    bool matched = false;
    juce::String error;
    juce::String deviceIdHex;
    juce::String manufacturerIdHex;
    juce::String familyCodeHex;
    juce::String modelNumberHex;
    juce::String revisionHex;
    juce::var values;
};

struct ProfileTestResult
{
    juce::String name;
    bool passed = false;
    juce::String kind = "parameter";
    juce::String expectedHex;
    juce::String actualHex;
    juce::var expectedValues;
    juce::var actualValues;
    juce::String error;
};

struct DumpParseResult
{
    bool ok = false;
    juce::String error;
    juce::String dumpId;
    juce::String dumpName;
    juce::String checksumStatus = "none";
    juce::var values;
    juce::String matchStatus = "unknown";
    bool complete = false;
    int expectedMessageCount = 1;
    int receivedMessageCount = 1;
    int expectedBytes = 0;
    int receivedBytes = 0;
    juce::var completion;
    juce::var diagnostics;
    juce::var partialFailures;
};

struct DumpCollectionResult
{
    bool ok = false;
    bool complete = false;
    juce::String status = "empty";
    juce::String error;
    juce::String collectionId;
    int expectedMessageCount = 0;
    int receivedMessageCount = 0;
    int parsedMessageCount = 0;
    int failedMessageCount = 0;
    int expectedBytes = 0;
    int receivedBytes = 0;
    juce::var values;
    juce::var messages;
    juce::var receivedRanges;
    juce::var missingRanges;
    juce::var duplicateRanges;
    juce::var diagnostics;
};

class DeviceProfileEngine
{
public:
    bool loadFromFile (const juce::File& file, juce::String& error);
    bool loadFromJson (const juce::String& json, juce::String& error);

    [[nodiscard]] juce::String getProfileId() const;
    [[nodiscard]] juce::String getProfileName() const;
    [[nodiscard]] juce::String getDefaultSyncDirection() const;
    [[nodiscard]] const juce::Array<ValidationMessage>& getValidationMessages() const { return validationMessages; }
    [[nodiscard]] bool hasErrors() const;

    CompileResult compileSetParameter (const juce::String& deviceRole,
                                       const juce::String& parameterId,
                                       const juce::var& value,
                                       bool dryRun = true) const;

    DeviceRequestResult compileDeviceRequest (const juce::String& deviceRole,
                                              const juce::String& requestId = {},
                                              const juce::var& variables = {}) const;

    DeviceRequestResult compileIdentityRequest (const juce::String& deviceRole) const;
    IdentityMatchResult matchIdentityReply (const juce::String& hex) const;
    DumpParseResult parseDumpMessage (const juce::String& hex) const;
    DumpCollectionResult collectDumpMessages (const juce::StringArray& hexMessages) const;

    juce::var listParameterDescriptors() const;
    juce::var getPresetBrowser() const;
    juce::var getTiming() const;
    juce::Array<ProfileTestResult> runTests() const;

    static juce::String bytesToHex (const juce::Array<int>& bytes);
    static juce::String transactionToHex (const MidiTransaction& transaction);

private:
    juce::var profile;
    juce::Array<ValidationMessage> validationMessages;

    void validate();
    void addValidation (ValidationMessage::Level level,
                        const juce::String& path,
                        const juce::String& message);

    [[nodiscard]] const juce::DynamicObject* profileObject() const;
    [[nodiscard]] const juce::DynamicObject* findParameter (const juce::String& parameterId) const;
    [[nodiscard]] const juce::DynamicObject* findMessageRecipe (const juce::String& recipeId) const;
    [[nodiscard]] const juce::DynamicObject* findDeviceRequest (const juce::String& requestId) const;
    [[nodiscard]] const juce::DynamicObject* findDumpDefinition (const juce::String& dumpId) const;
    [[nodiscard]] juce::var resolveVariable (const juce::String& name) const;
    [[nodiscard]] juce::String defaultStartupRequestId() const;
    [[nodiscard]] juce::String nextStartupRequestId (const juce::String& requestId) const;

    DumpParseResult parseDumpWithDefinition (const juce::DynamicObject& dump, const juce::Array<int>& bytes) const;
    juce::Result decodeDumpParameterValue (const juce::DynamicObject& parameter,
                                           const juce::Array<int>& bytes,
                                           int offset,
                                           juce::var& semanticValue,
                                           const juce::var& codecOverride = {}) const;

    CompileResult compileWithParameter (const juce::String& deviceRole,
                                        const juce::DynamicObject& parameter,
                                        const juce::var& value,
                                        bool dryRun) const;

    juce::Result validateAndEncodeValue (const juce::DynamicObject& parameter,
                                         const juce::var& inputValue,
                                         juce::var& semanticValue,
                                         juce::Array<int>& encodedBytes,
                                         double& normalizedValue,
                                         juce::String& displayedValue) const;

    CompileResult compileCc (const juce::String& deviceRole,
                             const juce::DynamicObject& parameter,
                             const juce::DynamicObject& recipe,
                             const juce::var& semanticValue,
                             const juce::Array<int>& encodedBytes,
                             double normalizedValue,
                             const juce::String& displayedValue,
                             bool dryRun) const;

    CompileResult compileNrpn (const juce::String& deviceRole,
                               const juce::DynamicObject& parameter,
                               const juce::DynamicObject& recipe,
                               const juce::var& semanticValue,
                               const juce::Array<int>& encodedBytes,
                               double normalizedValue,
                               const juce::String& displayedValue,
                               bool dryRun) const;

    CompileResult compileSysex (const juce::String& deviceRole,
                                const juce::DynamicObject& parameter,
                                const juce::DynamicObject& recipe,
                                const juce::var& semanticValue,
                                const juce::Array<int>& encodedBytes,
                                double normalizedValue,
                                const juce::String& displayedValue,
                                bool dryRun) const;
};
}
