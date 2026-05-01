#pragma once

#include "DeviceProfileEngine.h"

#include <juce_audio_devices/juce_audio_devices.h>

#include <deque>
#include <map>
#include <memory>

namespace ceditor::device
{
class DeviceProfileService final : private juce::Timer
{
public:
    DeviceProfileService();

    juce::var listProfiles();
    juce::var loadProfileFromFile (const juce::File& file);
    juce::var getProfileSource (const juce::var& payload);
    juce::var validateProfileSource (const juce::var& payload);
    juce::var saveProfileSource (const juce::var& payload);
    juce::var listProfileParameters (const juce::var& payload);
    juce::var getProfileParameterDetail (const juce::var& payload);
    juce::var saveProfileParameterDetail (const juce::var& payload);
    juce::var listMidiDestinations() const;
    juce::var setDeviceRoleMapping (const juce::var& payload);
    juce::var compileParameterMessage (const juce::var& payload, bool updateState);
    juce::var compileRawMidiAction (const juce::var& payload, bool appendToMonitor);
    juce::var parseDumpMessage (const juce::var& payload, bool updateState);
    juce::var runProfileTests (const juce::var& payload);
    juce::var getRuntimeState() const;
    juce::var getMonitorEvents() const;
    juce::var getDiagnostics() const;

private:
    struct LoadedProfile
    {
        juce::File file;
        juce::Time lastModificationTime;
        std::unique_ptr<DeviceProfileEngine> engine;
    };

    struct MidiDestination
    {
        juce::String type = "previewOnly";
        juce::String id = "previewOnly";
        juce::String name = "Preview Only";
    };

    struct RoleMapping
    {
        juce::String profileId;
        MidiDestination destination;
    };

    struct QueuedTransaction
    {
        juce::String deviceRole;
        MidiTransaction transaction;
        double dueTimeMs = 0.0;
    };

    std::map<juce::String, LoadedProfile> profiles;
    std::map<juce::String, RoleMapping> roleMappings;
    std::map<juce::String, std::unique_ptr<juce::MidiOutput>> midiOutputs;
    std::map<juce::String, double> lastSentAtMs;
    std::deque<QueuedTransaction> queuedTransactions;
    std::map<juce::String, std::map<juce::String, juce::var>> runtimeState;
    juce::Array<juce::var> monitorEvents;

    void loadInternalTestProfiles();
    bool loadProfileFile (const juce::File& file, juce::String& error);
    DeviceProfileEngine* resolveEngine (const juce::String& profileId, const juce::String& deviceRole);
    juce::String resolveProfileId (const juce::String& profileId, const juce::String& deviceRole) const;
    MidiDestination resolveDestination (const juce::String& deviceRole) const;
    bool sendTransactionNow (const juce::String& deviceRole, const MidiTransaction& transaction, juce::String& error);
    juce::String sendOrQueueTransaction (const juce::String& deviceRole, const MidiTransaction& transaction);
    void timerCallback() override;

    static juce::var transactionToVar (const MidiTransaction& transaction);
    static juce::var dumpParseResultToVar (const juce::String& requestId,
                                           const juce::String& profileId,
                                           const juce::String& deviceRole,
                                           const DumpParseResult& result);
    static juce::var testResultsToVar (const juce::String& profileId, const juce::Array<ProfileTestResult>& results);
    static juce::var validationMessagesToVar (const juce::Array<ValidationMessage>& messages);
    static juce::var errorResponse (const juce::String& requestId, const juce::String& error);
    static juce::String validationLevelToString (ValidationMessage::Level level);
    static bool parseRawMidiHex (const juce::String& hex, juce::Array<int>& bytes, juce::String& error);
    void appendMonitorEvent (const juce::String& direction,
                             const juce::String& deviceRole,
                             const juce::String& messageType,
                             const juce::String& semantic,
                             const juce::String& hex,
                             const juce::String& status);
};
}
