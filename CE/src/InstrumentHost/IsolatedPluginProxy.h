#pragma once

#include "PluginWorkerBlockBridge.h"
#include "PluginWorkerBoundary.h"
#include "PluginWorkerControlChannel.h"
#include "PluginWorkerSharedMemory.h"
#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>
#include <functional>
#include <memory>
#include <span>
#include <vector>

namespace ceditor::host
{

/** AudioProcessor façade for one VST instance owned by CEditorPluginWorker. It deliberately has
    no vendor editor in-process; JUCE's generic editor uses the mirrored parameters. */
class IsolatedPluginProxy final : public juce::AudioProcessor, public PluginWorkerBoundary
{
public:
    using Completion = std::function<void (std::unique_ptr<juce::AudioProcessor>,
                                           const juce::String& error)>;

    static void launchAsync (const juce::File& workerExecutable,
                             const juce::File& temporaryDirectory,
                             const juce::String& descriptionXml,
                             double sampleRate, int blockSize,
                             Completion completion);

    ~IsolatedPluginProxy() override;

    void prepareToPlay (double sampleRate, int blockSize) override;
    void releaseResources() override;
    void reset() override;
    void setNonRealtime (bool nonRealtime) noexcept override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void processBlock (juce::AudioBuffer<double>&, juce::MidiBuffer&) override;

    const juce::String getName() const override;
    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    bool supportsDoublePrecisionProcessing() const override;
    double getTailLengthSeconds() const override;
    bool hasEditor() const override;
    juce::AudioProcessorEditor* createEditor() override;
    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram (int) override;
    const juce::String getProgramName (int) override;
    void changeProgramName (int, const juce::String&) override;
    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int) override;

    /** Used by the vendor-preset loader without exposing worker details to the service. */
    bool applyVstPreset (const juce::File& presetFile);

    /** The vendor editor lives in the worker's own top-level window; these are Hostage's
        handle on it. Message thread only.

        acquire/release count who wants it open — the pane's placeholder while it exists,
        FloatingEditorWindows while the part is floated — and the window closes when the last
        one lets go, so closing the pane cannot take a floated window with it. show() brings
        it forward without changing the count; it is what the placeholder's button does.

        `anchor` is where Hostage would have put a window of its own, honoured the first time
        the worker creates the window and ignored after: see WorkerEditorController. */
    bool acquireRemoteEditor (juce::Rectangle<int> anchor);
    void releaseRemoteEditor() noexcept;
    bool showRemoteEditor (juce::Rectangle<int> anchor);
    /** Where the worker last reported its window, empty until it has. */
    juce::Rectangle<int> lastRemoteEditorBounds() const noexcept { return remoteEditorBounds; }

    /** Called by the rack guard on its controlling thread after the audio thread reports a
        failure. This also releases a worker that is hung inside vendor code when retries are off. */
    bool workerIsRunning() const noexcept override;
    void terminateWorker() noexcept override;

private:
    struct ParameterMetadata
    {
        int index = 0;
        juce::String id;
        juce::String name;
        juce::String label;
        float value = 0.0f;
        float defaultValue = 0.0f;
        int steps = juce::AudioProcessor::getDefaultNumParameterSteps();
        bool discrete = false;
        bool automatable = true;
    };

    struct Metadata
    {
        juce::String name;
        int inputs = 0;
        int outputs = 0;
        bool acceptsMidi = false;
        bool producesMidi = false;
        bool midiEffect = false;
        bool instrument = false;
        bool hasEditor = false;
        bool supportsDouble = false;
        bool crashDumpsAvailable = false;
        juce::String crashDumpError;
        juce::String workerBuildSha256;
        juce::uint32 workerProcessId = 0;
        int latencySamples = 0;
        double tailSeconds = 0.0;
        int currentProgram = 0;
        std::vector<juce::String> programNames;
        std::vector<ParameterMetadata> parameters;
    };

    class RemoteParameter;
    class RemoteEditor;
    struct Connection;

    IsolatedPluginProxy (Metadata, std::unique_ptr<Connection>, int initialBlockSize);

    static Metadata parseMetadata (const juce::var&, juce::String& error);
    static BusesProperties busesFor (const Metadata&);
    bool request (plugin_worker::MessageType type, const juce::MemoryBlock& payload,
                  plugin_worker::MessageType expectedReply, juce::MemoryBlock& reply,
                  int timeoutMs, juce::String& error);
    bool applyParameterValues (const juce::MemoryBlock& payload, juce::String& error);
    bool flushParameterValues (int timeoutMs, juce::String& error);
    bool requestAndSyncParameters (plugin_worker::MessageType type,
                                   const juce::MemoryBlock& payload,
                                   int timeoutMs, juce::String& error);
    void requestOrThrow (plugin_worker::MessageType type, const juce::MemoryBlock& payload,
                         plugin_worker::MessageType expectedReply, int timeoutMs);

    template <typename Sample>
    void process (juce::AudioBuffer<Sample>&, juce::MidiBuffer&);

    plugin_worker::PluginWorkerBlockBridge::TransportState captureTransport() const noexcept;
    std::span<const plugin_worker::ParameterEvent> collectParameterEvents() noexcept;
    void applyWorkerParameterEvents (const plugin_worker::PluginWorkerBlockBridge::Result&) noexcept;
    juce::String parameterText (int index, float value, int maximumLength);
    float parameterValueFromText (int index, const juce::String& text);
    bool sendEditorOpen (juce::Rectangle<int> anchor);
    void sendEditorClose() noexcept;
    void logDiagnostic (const juce::String& event, const juce::String& detail = {}) const;
    [[noreturn]] static void throwFailure (const juce::String&);

    const Metadata metadata;
    std::unique_ptr<Connection> connection;
    std::unique_ptr<plugin_worker::PluginWorkerBlockBridge> blockBridge;
    std::vector<RemoteParameter*> remoteParameters; // owned by AudioProcessor::addParameter
    std::vector<juce::String> programNames;
    std::atomic<int> currentProgram { 0 };
    juce::CriticalSection programLock;
    std::vector<juce::uint32> sentParameterRevisions;
    std::vector<plugin_worker::ParameterEvent> pendingParameterEvents;
    size_t parameterScanCursor = 0;
    std::atomic<juce::int64> nextRequestId { 1 };
    std::atomic<bool> controlFailed { false };
    juce::CriticalSection requestLock;
    int remoteEditorHolders = 0;                // message thread only
    juce::Rectangle<int> remoteEditorBounds;    // message thread only

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (IsolatedPluginProxy)
};

} // namespace ceditor::host
