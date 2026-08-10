#pragma once

#include "DeviceProfileEngine.h"
#include "MidiCiSession.h"

#include <juce_audio_devices/juce_audio_devices.h>

#include <cstdint>
#include <deque>
#include <functional>
#include <map>
#include <memory>
#include <set>
#include <vector>

namespace ceditor::device
{
class DeviceProfileService final : private juce::Timer,
                                   private juce::MidiInputCallback
{
public:
    using EventCallback = std::function<void (const juce::String&, const juce::var&)>;

    DeviceProfileService();
    ~DeviceProfileService() override;

    juce::var listProfiles();
    juce::var loadProfileFromFile (const juce::File& file);
    juce::var getProfileSource (const juce::var& payload);
    juce::var validateProfileSource (const juce::var& payload);
    juce::var saveProfileSource (const juce::var& payload);
    juce::var listProfileParameters (const juce::var& payload);
    juce::var getProfileParameterDetail (const juce::var& payload);
    juce::var saveProfileParameterDetail (const juce::var& payload);
    juce::var listMidiDestinations() const;
    juce::var listMidiInputs() const;
    juce::var setDeviceRoleMapping (const juce::var& payload);
    // Serialize / restore the role→{profile, MIDI port} mappings for plugin-state persistence so a
    // reloaded DAW project reconnects to the hardware without reopening the editor window.
    juce::var exportRoleMappings() const;
    void importRoleMappings (const juce::var& data);
    juce::var getTransportCapabilities() const;
    juce::var getSessionState() const;
    juce::var overrideDeviceIdentityMismatch (const juce::var& payload);
    juce::var startDeviceSync (const juce::var& payload);
    juce::var getPendingDeviceRequests() const;
    juce::var startPresetListScan (const juce::var& payload);
    juce::var cancelPresetListScan (const juce::var& payload);
    juce::var getPresetListScans() const;
    juce::var startBulkDumpSend (const juce::var& payload);
    juce::var cancelBulkDumpSend (const juce::var& payload);
    juce::var getBulkDumpSends() const;
    juce::var compileParameterMessage (const juce::var& payload, bool updateState);
    juce::var compileRawMidiAction (const juce::var& payload, bool appendToMonitor);
    juce::var ingestIncomingMidiMessage (const juce::var& payload);
    juce::var startMidiCiDiscovery (const juce::var& payload);
    juce::var setMidiCiProfile (const juce::var& payload);
    juce::var parseDumpMessage (const juce::var& payload, bool updateState);
    juce::var runProfileTests (const juce::var& payload);
    juce::var getRuntimeState() const;
    juce::var getMonitorEvents() const;
    juce::var getDiagnostics() const;
    void setEventCallback (EventCallback callback);

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

    struct MidiInputEndpoint
    {
        juce::String type = "none";
        juce::String id = "none";
        juce::String name = "No MIDI Input";
    };

    struct RoleMapping
    {
        juce::String profileId;
        MidiDestination destination;
        MidiInputEndpoint input;
        juce::String syncDirection = "pull";
        juce::String sessionState = "preview";
        juce::String sessionMessage = "Preview only";
        juce::String identityStatus = "unknown";
        juce::String identityMessage;
        double lastInboundAtMs = 0.0;
        double lastReadyAtMs = 0.0;
        double lastIdentityAtMs = 0.0;
    };

    struct QueuedTransaction
    {
        juce::String deviceRole;
        MidiTransaction transaction;
        double dueTimeMs = 0.0;
        int nextMessageIndex = 0;
    };

    struct PendingDeviceRequest
    {
        juce::String correlationId;
        juce::String deviceRole;
        juce::String profileId;
        juce::String requestId;
        juce::String expectedResponseKind = "dump";
        juce::String expectedDumpId;
        juce::String nextRequestId;
        juce::String continueRequestId;
        juce::String sentHex;
        juce::String purpose;
        juce::String scanId;
        double createdAtMs = 0.0;
        double timeoutAtMs = 0.0;
        int retriesRemaining = 0;
        int continuationCount = 0;
        bool continueSent = false;
        int slot = -1;
    };

    struct PresetScanEntry
    {
        int slot = -1;
        juce::String requestId;
        juce::String requestHex;
        juce::String status = "queued";
        juce::String name;
        juce::String error;
        juce::String dumpId;
        juce::var dumpCollection;
    };

    struct PresetScanJob
    {
        juce::String scanId;
        juce::String deviceRole;
        juce::String profileId;
        juce::String requestId;
        juce::String slotVariable = "slot";
        juce::String status = "running";
        int total = 0;
        int completed = 0;
        int failed = 0;
        bool cancelled = false;
        std::map<int, PresetScanEntry> entries;
    };

    struct BulkSendChunk
    {
        int index = 0;
        int offset = 0;
        juce::Array<int> bytes;
        juce::String status = "queued";
        juce::String error;
        double dueTimeMs = 0.0;
        double sentAtMs = 0.0;
    };

    struct BulkSendJob
    {
        juce::String bulkSendId;
        juce::String deviceRole;
        juce::String profileId;
        juce::String label;
        juce::String status = "running";
        juce::String error;
        juce::String messageType = "sysex";
        int totalBytes = 0;
        int sentBytes = 0;
        int chunkSizeBytes = 256;
        int chunkDelayMs = 50;
        int totalChunks = 0;
        int sentChunks = 0;
        int failedChunks = 0;
        bool cancelled = false;
        bool dryRun = true;
        juce::String expectedCollectionId;
        juce::String verificationStatus = "none";
        juce::String ackStatus = "none";
        juce::String ackHex;
        juce::String nakHex;
        int retriesRemaining = 0;
        int retryCount = 0;
        juce::var dumpCollection;
        std::vector<BulkSendChunk> chunks;
    };

    struct SysexAssembly
    {
        juce::Array<int> bytes;
        double startedAtMs = 0.0;
        double updatedAtMs = 0.0;
        int chunks = 0;
    };

    struct DumpCollectionState
    {
        juce::String deviceRole;
        juce::String profileId;
        juce::String collectionId;
        juce::StringArray hexMessages;
        juce::var latestResult;
        double updatedAtMs = 0.0;
    };

    std::map<juce::String, LoadedProfile> profiles;
    std::map<juce::String, RoleMapping> roleMappings;
    std::map<juce::String, std::unique_ptr<juce::MidiOutput>> midiOutputs;
    std::map<juce::String, std::unique_ptr<juce::MidiInput>> midiInputsByRole;
    std::map<juce::String, double> lastSentAtMs;
    std::deque<QueuedTransaction> queuedTransactions;
    std::map<juce::String, PendingDeviceRequest> pendingDeviceRequests;
    std::map<juce::String, PresetScanJob> presetScanJobs;
    std::map<juce::String, BulkSendJob> bulkSendJobs;
    std::map<juce::String, SysexAssembly> sysexAssemblies;
    std::map<juce::String, DumpCollectionState> dumpCollections;
    std::map<juce::String, std::map<juce::String, juce::var>> runtimeState;
    juce::Array<juce::var> monitorEvents;
    double lastInboundHeavyEmitMs = 0.0;  // throttles per-incoming heavy bridge emits (CC streams)
    double lastProfileScanMs = 0.0;       // throttles the profile directory rescan (see loadInternalTestProfiles)
    std::map<juce::String, juce::Time> refusedProfiles;  // path -> mtime of the copy we already refused
    EventCallback eventCallback;
    mutable juce::CriticalSection midiInputLock;

    // MIDI-CI live discovery (MIDI 2.0 plan, phase M1). The session is driven entirely on the message
    // thread: pumped from timerCallback, fed incoming SysEx from processIncomingMidiMessage.
    std::unique_ptr<MidiCiSession> midiCiSession;
    juce::String midiCiRole;
    double midiCiDeadlineMs = 0.0;
    bool midiCiActive = false;
    std::set<uint32_t> midiCiReported; // muids already emitted as midiCiDiscovered

    // `force` skips the rescan throttle, for the cold paths that must see a profile written a moment
    // ago (the profile list behind the settings dropdown, and validating a newly chosen profile id).
    void loadInternalTestProfiles (bool force = false);
    bool isLoadedProfileCurrent (const juce::File& file) const;
    bool loadProfileFile (const juce::File& file, juce::String& error);
    DeviceProfileEngine* resolveEngine (const juce::String& profileId, const juce::String& deviceRole);
    juce::String resolveProfileId (const juce::String& profileId, const juce::String& deviceRole) const;
    MidiDestination resolveDestination (const juce::String& deviceRole) const;
    juce::String resolveRoleForMidiInput (const juce::MidiInput* source) const;
    void updateRoleSessionState (const juce::String& role, const juce::String& state, const juce::String& message);
    void updateRoleIdentityState (const juce::String& role, const IdentityMatchResult& result);
    void syncMidiInputForRole (const juce::String& role);
    juce::var pushRuntimeStateToDevice (const juce::String& correlationId,
                                        const juce::String& deviceRole,
                                        const juce::String& profileId,
                                        const juce::var& values,
                                        bool dryRun);
    bool sendTransactionNow (const juce::String& deviceRole,
                             const MidiTransaction& transaction,
                             juce::String& error,
                             juce::String* status = nullptr,
                             int startMessageIndex = 0);
    juce::String sendOrQueueTransaction (const juce::String& deviceRole, const MidiTransaction& transaction);
    void addPendingDeviceRequest (const PendingDeviceRequest& request);
    bool resolvePendingRequestsForIdentity (const juce::String& deviceRole,
                                            const juce::String& profileId,
                                            const IdentityMatchResult& result);
    void resolvePendingRequestsForDump (const juce::String& deviceRole,
                                        const juce::String& profileId,
                                        const DumpParseResult& result);
    void resolvePendingRequestsForDumpCollection (const juce::String& deviceRole,
                                                  const juce::String& profileId,
                                                  const DumpCollectionResult& result);
    void startNextStartupRequest (const PendingDeviceRequest& request);
    void updatePresetScanForResolvedDump (const PendingDeviceRequest& request,
                                          const DumpParseResult& result);
    void updatePresetScanForResolvedDumpCollection (const PendingDeviceRequest& request,
                                                    const DumpCollectionResult& result);
    void updatePresetScanForDumpCollectionProgress (const PendingDeviceRequest& request,
                                                    const DumpCollectionResult& result);
    void updatePresetScanForTimeout (const PendingDeviceRequest& request);
    void refreshPresetScanJob (PresetScanJob& job);
    juce::var updateDumpCollectionForParsedDump (const juce::String& deviceRole,
                                                 const juce::String& profileId,
                                                 const juce::String& hex,
                                                 const DumpParseResult& result);
    void processBulkSendJobs();
    void refreshBulkSendJob (BulkSendJob& job);
    bool hasRunningBulkSendJobs() const;
    void updateBulkSendJobsForDumpCollection (const juce::String& deviceRole,
                                              const juce::String& profileId,
                                              const DumpCollectionResult& result);
    bool updateBulkSendJobsForProtocolReply (const juce::String& deviceRole,
                                             const juce::String& hex);
    void processPendingRequestTimeouts();
    void processSysexAssemblyTimeouts();
    void timerCallback() override;
    void handleIncomingMidiMessage (juce::MidiInput* source, const juce::MidiMessage& message) override;
    juce::var ingestIncomingMidiBytes (const juce::String& deviceRole,
                                       const juce::Array<int>& bytes,
                                       const juce::String& messageType,
                                       double timestampSeconds);
    void processIncomingMidiMessage (const juce::String& deviceRole,
                                     const juce::String& hex,
                                     const juce::String& messageType,
                                     double timestampSeconds);
    void emitDeviceEvent (const juce::String& eventName, const juce::var& payload);
    void sendRawMidiToRole (const juce::String& deviceRole, const juce::MidiMessage& message);
    void pollMidiCiDiscovery();

    static juce::var transactionToVar (const MidiTransaction& transaction);
    static juce::var midiDestinationToVar (const MidiDestination& destination);
    static juce::var midiInputToVar (const MidiInputEndpoint& input);
    static juce::var pendingDeviceRequestToVar (const PendingDeviceRequest& request);
    static juce::var identityMatchResultToVar (const juce::String& profileId,
                                               const juce::String& deviceRole,
                                               const IdentityMatchResult& result);
    static juce::var presetScanJobToVar (const PresetScanJob& job);
    static juce::var bulkSendJobToVar (const BulkSendJob& job);
    static juce::Array<int> presetScanSlotsFromVar (const juce::var& slotsValue);
    static juce::String sessionStateForMapping (const RoleMapping& mapping);
    static juce::String normalizeSyncDirection (const juce::String& value);
    static juce::var dumpParseResultToVar (const juce::String& requestId,
                                           const juce::String& profileId,
                                           const juce::String& deviceRole,
                                           const DumpParseResult& result);
    static juce::var dumpCollectionResultToVar (const juce::String& requestId,
                                                const juce::String& profileId,
                                                const juce::String& deviceRole,
                                                const DumpCollectionResult& result);
    static juce::var testResultsToVar (const juce::String& profileId, const juce::Array<ProfileTestResult>& results);
    static juce::var validationMessagesToVar (const juce::Array<ValidationMessage>& messages);
    static juce::var errorResponse (const juce::String& requestId, const juce::String& error);
    static juce::String validationLevelToString (ValidationMessage::Level level);
    static bool parseRawMidiHex (const juce::String& hex, juce::Array<int>& bytes, juce::String& error);
    static bool parseMidiHexBytes (const juce::String& hex, juce::Array<int>& bytes, juce::String& error);
    void appendMonitorEvent (const juce::String& direction,
                             const juce::String& deviceRole,
                             const juce::String& messageType,
                             const juce::String& semantic,
                             const juce::String& hex,
                             const juce::String& status);
};
}
