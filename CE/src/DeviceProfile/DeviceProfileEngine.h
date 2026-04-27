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

struct ProfileTestResult
{
    juce::String name;
    bool passed = false;
    juce::String expectedHex;
    juce::String actualHex;
    juce::String error;
};

class DeviceProfileEngine
{
public:
    bool loadFromFile (const juce::File& file, juce::String& error);
    bool loadFromJson (const juce::String& json, juce::String& error);

    [[nodiscard]] juce::String getProfileId() const;
    [[nodiscard]] juce::String getProfileName() const;
    [[nodiscard]] const juce::Array<ValidationMessage>& getValidationMessages() const { return validationMessages; }
    [[nodiscard]] bool hasErrors() const;

    CompileResult compileSetParameter (const juce::String& deviceRole,
                                       const juce::String& parameterId,
                                       const juce::var& value,
                                       bool dryRun = true) const;

    juce::var listParameterDescriptors() const;
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
    [[nodiscard]] juce::var resolveVariable (const juce::String& name) const;

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
