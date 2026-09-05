#include "IsolatedPluginProxy.h"
#include "LiveWorkerDiagnostics.h"
#include "PluginWorkerJob.h"
#include <juce_cryptography/juce_cryptography.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <algorithm>
#include <cmath>
#include <stdexcept>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #include <windows.h>
#endif

namespace ceditor::host
{
using namespace plugin_worker;

namespace
{
juce::uint32 currentProcessId() noexcept
{
#if JUCE_WINDOWS
    return static_cast<juce::uint32> (GetCurrentProcessId());
#else
    return 0;
#endif
}

juce::MemoryBlock jsonPayload (const juce::var& value)
{
    const auto json = juce::JSON::toString (value, true);
    juce::MemoryBlock result;
    result.append (json.toRawUTF8(), static_cast<size_t> (json.getNumBytesAsUTF8()));
    return result;
}
} // namespace

struct IsolatedPluginProxy::Connection
{
    ~Connection()
    {
        if (process != nullptr && process->isRunning())
        {
            LiveWorkerDiagnostics::append (diagnosticLog, "worker_forced_stop", generation,
                                           pluginName, "proxy connection was destroyed");
            process->kill();
        }
    }

    juce::uint32 generation = 0;
    SharedMemoryNames names;
    std::unique_ptr<SharedDataPlaneMapping> mapping;
    std::unique_ptr<PluginWorkerControlChannel> control;
    std::unique_ptr<PluginWorkerJob> job;
    std::unique_ptr<juce::ChildProcess> process;
    juce::File diagnosticLog;
    juce::String pluginName;
};

class IsolatedPluginProxy::RemoteParameter final : public juce::HostedAudioProcessorParameter
{
public:
    RemoteParameter (IsolatedPluginProxy& ownerToUse, ParameterMetadata metadataToUse)
        : juce::HostedAudioProcessorParameter (1), owner (ownerToUse),
          metadata (std::move (metadataToUse)),
          value (metadata.value)
    {
    }

    float getValue() const override { return value.load (std::memory_order_acquire); }
    void setValue (float newValue) override
    {
        value.store (juce::jlimit (0.0f, 1.0f, newValue), std::memory_order_release);
        revision.fetch_add (1, std::memory_order_acq_rel);
    }
    float getDefaultValue() const override { return metadata.defaultValue; }
    juce::String getName (int maximumLength) const override
    {
        return metadata.name.substring (0, maximumLength);
    }
    juce::String getLabel() const override { return metadata.label; }
    juce::String getText (float normalisedValue, int maximumLength) const override
    {
        return owner.parameterText (metadata.index, normalisedValue, maximumLength);
    }
    int getNumSteps() const override { return metadata.steps; }
    bool isDiscrete() const override { return metadata.discrete; }
    bool isBoolean() const override { return metadata.discrete && metadata.steps == 2; }
    bool isAutomatable() const override { return metadata.automatable; }
    float getValueForText (const juce::String& text) const override
    {
        return owner.parameterValueFromText (metadata.index, text);
    }
    juce::String getParameterID() const override { return metadata.id; }

    juce::uint32 getRevision() const noexcept { return revision.load (std::memory_order_acquire); }
    void setFromWorker (float newValue)
    {
        const auto normal = juce::jlimit (0.0f, 1.0f, newValue);
        if (normal != value.exchange (normal, std::memory_order_acq_rel))
            sendValueChangedMessageToListeners (normal);
    }

private:
    IsolatedPluginProxy& owner;
    const ParameterMetadata metadata;
    std::atomic<float> value { 0.0f };
    std::atomic<juce::uint32> revision { 1 };
};

// The vendor editor, inside Hostage's window, drawn by another process.
//
// This component is what the pane and the floating windows are handed for an isolated
// plug-in, and on screen it is COVERED by the plug-in's real interface: the worker creates
// its editor window as a child of whichever Hostage window this component is showing in,
// and this component keeps that child exactly over itself. A child window cannot be behind
// its parent, has no taskbar button, and needs nobody to win the foreground — which is the
// whole of what two earlier versions of this class were trying to arrange with a placeholder
// and a separate top-level window, and could not. This is how WebView2 sits in the same
// window, and how JUCE itself hosts an in-process VST3's view.
//
// The child is created when this component first has a peer to be a child of, not in the
// constructor, because the editor is built before it is placed. Its size is the worker's to
// decide: a vendor GUI that resizes itself changes the child, and a poll asks for the new
// size and resizes this component to match, which the pane and the floating window already
// follow. Position is Hostage's: the same arithmetic juce::HWNDComponent uses, without
// HWNDComponent itself, whose destructor destroys the window it hosts and reparents it to
// the desktop first — right for a window this process created, wrong for one it borrowed.
class IsolatedPluginProxy::RemoteEditor final : public juce::AudioProcessorEditor,
                                                private juce::Timer
{
public:
    explicit RemoteEditor (IsolatedPluginProxy& ownerToUse)
        : juce::AudioProcessorEditor (&ownerToUse), owner (ownerToUse)
    {
        setOpaque (true);
        setSize (420, 240);     // until the worker says what the editor measures
        watcher = std::make_unique<Watcher> (*this);
    }

    ~RemoteEditor() override
    {
        stopTimer();
        watcher.reset();
        if (child != 0)
            owner.sendEditorClose();
    }

    void paint (juce::Graphics& graphics) override
    {
        graphics.fillAll (juce::Colour (0xff171a1d));
        if (child != 0)
            return;         // the plug-in's own window is over this
        graphics.setColour (juce::Colour (0xff9aa5b1));
        graphics.setFont (14.0f);
        graphics.drawFittedText (failure.isNotEmpty() ? failure
                                                       : "Opening " + owner.getName() + "…",
                                 getLocalBounds().reduced (18), juce::Justification::centred, 3);
    }

private:
    // Movement, visibility and peer changes of this component and every ancestor — a
    // scrolled pane, a dragged window — all reach here. Kept as a separate object rather
    // than a second base class so nothing observes this component before it is whole.
    class Watcher final : public juce::ComponentMovementWatcher
    {
    public:
        explicit Watcher (RemoteEditor& editorToWatch)
            : juce::ComponentMovementWatcher (&editorToWatch), editor (editorToWatch) {}
        void componentMovedOrResized (bool, bool) override { editor.place(); }
        void componentPeerChanged() override { editor.peerChanged(); }
        void componentVisibilityChanged() override { editor.place(); }
    private:
        RemoteEditor& editor;
    };

    juce::int64 currentPeerHandle() const
    {
        if (auto* peer = getPeer())
            return static_cast<juce::int64> (
                reinterpret_cast<juce::pointer_sized_int> (peer->getNativeHandle()));
        return 0;
    }

    // A new peer means a new parent for the child. In practice there is never a second one
    // — the service builds a fresh editor for a fresh place — so this closes and reopens
    // rather than reparenting a window across processes.
    void peerChanged()
    {
        const auto handle = currentPeerHandle();
        if (handle == hostWindow)
        {
            place();
            return;
        }
        if (child != 0)
        {
            stopTimer();
            owner.sendEditorClose();
            child = 0;
        }
        hostWindow = handle;
        if (hostWindow == 0)
        {
            repaint();
            return;
        }

        juce::int64 nativeHandle = 0;
        int width = 0, height = 0;
        if (owner.sendEditorOpen (hostWindow, nativeHandle, width, height) && nativeHandle != 0)
        {
            child = nativeHandle;
            failure.clear();
            setSize (juce::jmax (1, width), juce::jmax (1, height));
            place();
            startTimer (250);
        }
        else
        {
            failure = owner.getName() + " did not open its interface.";
        }
        repaint();
    }

    void timerCallback() override
    {
        int width = 0, height = 0;
        if (child != 0 && owner.sendEditorSize (width, height) && width > 0 && height > 0
            && (width != getWidth() || height != getHeight()))
            setSize (width, height);
    }

    // The child over this component, in the peer's physical pixels: the peer's own account
    // of where this component is, scaled as juce::HWNDComponent scales it. Shown or hidden
    // with this component, and never activated or reordered from here.
    void place()
    {
       #if JUCE_WINDOWS
        if (child == 0)
            return;
        auto* peer = getPeer();
        if (peer == nullptr)
            return;
        const auto area = (peer->getAreaCoveredBy (*this).toFloat()
                           * peer->getPlatformScaleFactor()).getSmallestIntegerContainer();
        const auto hwnd = reinterpret_cast<HWND> (static_cast<juce::pointer_sized_int> (child));
        ::SetWindowPos (hwnd, nullptr, area.getX(), area.getY(), area.getWidth(), area.getHeight(),
                        SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER);
        ::ShowWindow (hwnd, isShowing() ? SW_SHOWNA : SW_HIDE);
       #endif
    }

    IsolatedPluginProxy& owner;
    std::unique_ptr<Watcher> watcher;
    juce::int64 hostWindow = 0;   // the peer the child was created in
    juce::int64 child = 0;        // the worker's window, 0 until it exists
    juce::String failure;
};

juce::AudioProcessor::BusesProperties IsolatedPluginProxy::busesFor (const Metadata& metadata)
{
    BusesProperties result;
    if (metadata.inputs > 0)
        result = result.withInput ("Input", juce::AudioChannelSet::canonicalChannelSet (
            metadata.inputs), true);
    if (metadata.outputs > 0)
        result = result.withOutput ("Output", juce::AudioChannelSet::canonicalChannelSet (
            metadata.outputs), true);
    return result;
}

IsolatedPluginProxy::Metadata IsolatedPluginProxy::parseMetadata (const juce::var& value,
                                                                  juce::String& error)
{
    Metadata result;
    error.clear();
    if (! value.isObject() || ! (bool) value.getProperty ("ok", false))
    {
        error = value.getProperty ("error", "worker returned invalid metadata").toString();
        return result;
    }
    result.name = value.getProperty ("name", "Isolated plug-in").toString();
    result.inputs = juce::jlimit (0, static_cast<int> (maxSupportedChannels),
                                  (int) value.getProperty ("inputs", 0));
    result.outputs = juce::jlimit (0, static_cast<int> (maxSupportedChannels),
                                   (int) value.getProperty ("outputs", 0));
    result.acceptsMidi = value.getProperty ("acceptsMidi", false);
    result.producesMidi = value.getProperty ("producesMidi", false);
    result.midiEffect = value.getProperty ("midiEffect", false);
    result.hasEditor = value.getProperty ("hasEditor", false);
    result.supportsDouble = value.getProperty ("doublePrecision", false);
    result.crashDumpsAvailable = value.getProperty ("crashDumpsAvailable", false);
    result.crashDumpError = value.getProperty ("crashDumpError", {}).toString().substring (0, 512);
    result.workerBuildSha256 = value.getProperty ("workerBuildSha256", {}).toString().toLowerCase();
    result.latencySamples = juce::jmax (0, (int) value.getProperty ("latencySamples", 0));
    result.tailSeconds = juce::jmax (0.0, (double) value.getProperty ("tailSeconds", 0.0));

    if (const auto* programs = value.getProperty ("programNames", {}).getArray())
        for (int index = 0; index < juce::jmin (programs->size(), 4096); ++index)
            result.programNames.push_back ((*programs)[index].toString().substring (0, 256));
    if (result.programNames.empty())
        result.programNames.emplace_back ("Default");
    result.currentProgram = juce::jlimit (
        0, static_cast<int> (result.programNames.size()) - 1,
        (int) value.getProperty ("currentProgram", 0));

    if (const auto* parameters = value.getProperty ("parameters", {}).getArray())
        for (const auto& item : *parameters)
        {
            ParameterMetadata parameter;
            parameter.index = (int) item.getProperty ("index", (int) result.parameters.size());
            parameter.id = item.getProperty ("id", juce::String (parameter.index)).toString();
            parameter.name = item.getProperty ("name", parameter.id).toString();
            parameter.label = item.getProperty ("label", {}).toString();
            parameter.value = juce::jlimit (0.0f, 1.0f,
                (float) item.getProperty ("value", 0.0));
            parameter.defaultValue = juce::jlimit (0.0f, 1.0f,
                (float) item.getProperty ("defaultValue", 0.0));
            parameter.steps = juce::jmax (2, (int) item.getProperty (
                "steps", juce::AudioProcessor::getDefaultNumParameterSteps()));
            parameter.discrete = item.getProperty ("discrete", false);
            parameter.automatable = item.getProperty ("automatable", true);
            result.parameters.push_back (std::move (parameter));
        }

    if (result.outputs == 0 && ! result.midiEffect)
        error = "isolated plug-in exposes neither audio output nor MIDI-effect output";
    return result;
}

IsolatedPluginProxy::IsolatedPluginProxy (Metadata metadataToUse,
                                          std::unique_ptr<Connection> connectionToUse,
                                          int initialBlockSize)
    : juce::AudioProcessor (busesFor (metadataToUse)), metadata (std::move (metadataToUse)),
      connection (std::move (connectionToUse)), programNames (metadata.programNames),
      currentProgram (metadata.currentProgram)
{
    // "Effect" here means pass the preceding block through when the worker is late. MIDI-only
    // effects need that policy just as much as audio inserts do; only instruments must fail
    // silent, including instruments that expose a sidechain input.
    const auto effect = ! metadata.instrument;
    blockBridge = std::make_unique<PluginWorkerBlockBridge> (
        connection->mapping->dataPlane(), effect,
        PluginWorkerBlockBridge::ChannelCounts {
            static_cast<juce::uint32> (metadata.inputs),
            static_cast<juce::uint32> (metadata.outputs) });
    remoteParameters.reserve (metadata.parameters.size());
    sentParameterRevisions.resize (metadata.parameters.size());
    pendingParameterEvents.resize (std::min (
        metadata.parameters.size(), static_cast<size_t> (maxParameterEventsPerBlock)));
    for (const auto& parameter : metadata.parameters)
    {
        auto* remote = new RemoteParameter (*this, parameter);
        addParameter (remote);
        remoteParameters.push_back (remote);
    }
    setLatencySamples (metadata.latencySamples + initialBlockSize);
}

IsolatedPluginProxy::~IsolatedPluginProxy()
{
    if (connection == nullptr)
        return;
    logDiagnostic ("shutdown_requested");
    try
    {
        juce::MemoryBlock ignored;
        juce::String error;
        request (MessageType::shutdown, {}, MessageType::shutdown, ignored, 300, error);
    }
    catch (...) {}
    if (connection->process != nullptr && ! connection->process->waitForProcessToFinish (500))
        connection->process->kill();
}

void IsolatedPluginProxy::terminateWorker() noexcept
{
    controlFailed.store (true, std::memory_order_release);
    if (connection == nullptr || connection->process == nullptr)
        return;
    if (connection->process->isRunning())
    {
        logDiagnostic ("failed_worker_terminated",
                       "the rack consumed this worker's failure edge");
        connection->process->kill();
    }
    else
    {
        logDiagnostic ("worker_exited",
                       "exit code " + juce::String (connection->process->getExitCode()));
    }
}

bool IsolatedPluginProxy::workerIsRunning() const noexcept
{
    return ! controlFailed.load (std::memory_order_acquire)
        && connection != nullptr && connection->process != nullptr
        && connection->process->isRunning();
}

void IsolatedPluginProxy::launchAsync (const juce::File& workerExecutable,
                                       const juce::File& temporaryDirectory,
                                       const juce::String& descriptionXml,
                                       double sampleRate, int blockSize,
                                       Completion completion)
{
    auto completionHolder = std::make_shared<Completion> (std::move (completion));
    const auto generation = static_cast<juce::uint32> (
        juce::Random::getSystemRandom().nextInt ({ 1, 0x7fffffff }));
    const auto diagnosticLog = LiveWorkerDiagnostics::currentFile (
        temporaryDirectory.getParentDirectory());
    const auto launched = juce::Thread::launch (juce::Thread::Priority::normal,
        [workerExecutable, temporaryDirectory, descriptionXml, sampleRate, blockSize,
         completionHolder, generation, diagnosticLog]() mutable
        {
            juce::String error;
            std::unique_ptr<juce::AudioProcessor> result;
            juce::String pluginName;
            LiveWorkerDiagnostics::append (diagnosticLog, "launch_requested", generation);
#if JUCE_WINDOWS
            if (! std::isfinite (sampleRate) || sampleRate <= 0.0 || blockSize <= 0
                || blockSize > static_cast<int> (maxSupportedFrames))
                error = "invalid live plug-in worker audio configuration";
            else if (! workerExecutable.existsAsFile())
                error = "live plug-in worker not found: " + workerExecutable.getFullPathName();
            else if (auto workerInput = workerExecutable.createInputStream(); workerInput == nullptr)
                error = "live plug-in worker could not be fingerprinted";
            else
            {
                const auto workerBuildSha256 = juce::SHA256 (*workerInput).toHexString();
                workerInput.reset();
                juce::PluginDescription description;
                const auto xml = juce::XmlDocument::parse (descriptionXml);
                if (xml == nullptr || ! description.loadFromXml (*xml))
                    error = "unreadable plug-in description";
                else
                {
                    pluginName = description.name;
                    DataPlaneConfig config;
                    // A DAW or audio device may re-prepare an existing graph with a larger block.
                    // Shared mappings cannot grow safely under a live worker, so reserve the
                    // protocol's declared ceiling once instead of turning that routine change
                    // into a false processor crash above the launch-time block size.
                    config.maxFrames = maxSupportedFrames;
                    config.maxInputChannels = static_cast<juce::uint32> (juce::jlimit (
                        0, static_cast<int> (maxSupportedChannels),
                        juce::jmax (description.numInputChannels, description.isInstrument ? 0 : 2)));
                    config.maxOutputChannels = static_cast<juce::uint32> (juce::jlimit (
                        1, static_cast<int> (maxSupportedChannels),
                        juce::jmax (description.numOutputChannels, 2)));
                    config.maxParameterEvents = maxParameterEventsPerBlock;
                    config.maxMidiBytes = maxSupportedMidiBytes;

                    auto connection = std::make_unique<Connection>();
                    connection->generation = generation;
                    connection->names = SharedMemoryNames::createUnique();
                    connection->mapping = std::make_unique<SharedDataPlaneMapping>();
                    connection->control = std::make_unique<PluginWorkerControlChannel>();
                    connection->job = std::make_unique<PluginWorkerJob>();
                    connection->process = std::make_unique<juce::ChildProcess>();
                    connection->diagnosticLog = diagnosticLog;
                    connection->pluginName = pluginName;
                    const auto jobName = connection->names.mapping + "-job";
                    const auto ipcReady = connection->job->createHost (jobName, error)
                        && connection->mapping->createHost (
                            connection->names, config, generation, error)
                        && connection->control->createHost (connection->names.controlPipe, error);
                    if (ipcReady)
                    {
                        if (! temporaryDirectory.createDirectory())
                            error = "could not create the plug-in worker staging directory";
                        else
                        {
                            const auto descriptionFile = temporaryDirectory.getChildFile (
                                "worker-description-" + juce::Uuid().toString() + ".xml");
                            if (! descriptionFile.replaceWithText (descriptionXml))
                                error = "could not stage the plug-in description for its worker";
                            else
                            {
                                juce::StringArray arguments;
                                arguments.add (workerExecutable.getFullPathName());
                                arguments.add ("--run");
                                arguments.add (juce::String (generation));
                                arguments.add (connection->names.mapping);
                                arguments.add (connection->names.inputReady);
                                arguments.add (connection->names.outputReady);
                                arguments.add (connection->names.controlPipe);
                                arguments.add (descriptionFile.getFullPathName());
                                arguments.add ("-");
                                arguments.add (juce::String (sampleRate, 8));
                                arguments.add (juce::String (blockSize));
                                arguments.add (jobName);
                                arguments.add (temporaryDirectory.getParentDirectory()
                                                   .getChildFile ("crash-dumps")
                                                   .getFullPathName());
                                arguments.add (workerBuildSha256);
                                arguments.add (juce::String (currentProcessId()));

                                if (! connection->process->start (arguments, 0))
                                    error = "could not launch the live plug-in worker";
                                else
                                {
                                    LiveWorkerDiagnostics::append (
                                        diagnosticLog, "process_started", generation, pluginName);
                                    const auto hello = connection->control->receive (15'000);
                                    if (! hello)
                                        error = hello.error.isNotEmpty() ? hello.error
                                                                        : "invalid worker handshake";
                                    else if (hello.message.type == MessageType::error)
                                    {
                                        juce::String jsonError;
                                        const auto json = decodeJsonPayload (hello.message, jsonError);
                                        error = jsonError.isNotEmpty() ? jsonError
                                            : json.getProperty ("error", "worker could not create plug-in").toString();
                                    }
                                    else if (hello.message.type != MessageType::createReply
                                             || ! belongsToGeneration (hello.message, generation))
                                        error = "invalid worker handshake";
                                    else
                                    {
                                        juce::String jsonError;
                                        const auto json = decodeJsonPayload (hello.message, jsonError);
                                        auto metadata = parseMetadata (json, jsonError);
                                        if (jsonError.isEmpty()
                                            && metadata.workerBuildSha256 != workerBuildSha256)
                                            jsonError = "live-worker build fingerprint mismatch";
                                        if (jsonError.isNotEmpty())
                                            error = jsonError;
                                        else
                                        {
                                            metadata.instrument = description.isInstrument;
                                            LiveWorkerDiagnostics::append (
                                                diagnosticLog, "worker_ready", generation,
                                                pluginName,
                                                "Windows job limit "
                                                    + juce::String (PluginWorkerJob::
                                                        maximumAssociatedProcesses)
                                                    + " processes; minidumps "
                                                    + (metadata.crashDumpsAvailable
                                                         ? juce::String ("ready")
                                                         : juce::String ("unavailable: ")
                                                             + metadata.crashDumpError)
                                                    + "; build "
                                                    + metadata.workerBuildSha256.substring (0, 12)
                                                    + "; "
                                                    + juce::String (metadata.inputs) + " inputs, "
                                                    + juce::String (metadata.outputs) + " outputs, "
                                                    + juce::String (static_cast<int> (
                                                        metadata.parameters.size()))
                                                    + " parameters");
                                            result.reset (new IsolatedPluginProxy (
                                                std::move (metadata), std::move (connection), blockSize));
                                        }
                                    }
                                }
                            }
                            descriptionFile.deleteFile();
                        }
                    }
                }
            }
#else
            juce::ignoreUnused (workerExecutable, temporaryDirectory, descriptionXml,
                                sampleRate, blockSize);
            error = "live plug-in isolation is currently available on Windows only";
#endif
            if (result == nullptr && error.isNotEmpty())
                LiveWorkerDiagnostics::append (diagnosticLog, "launch_failed", generation,
                                               pluginName, error);
            juce::MessageManager::callAsync (
                [completionHolder, result = std::move (result), error]() mutable
                {
                    (*completionHolder) (std::move (result), error);
                });
        });
    if (! launched)
    {
        LiveWorkerDiagnostics::append (diagnosticLog, "launch_thread_failed", generation,
                                       {}, "could not start the launch thread");
        juce::MessageManager::callAsync ([completionHolder]
        {
            (*completionHolder) (nullptr, "could not start the plug-in worker launch thread");
        });
    }
}

bool IsolatedPluginProxy::request (MessageType type, const juce::MemoryBlock& payload,
                                   MessageType expectedReply, juce::MemoryBlock& reply,
                                   int timeoutMs, juce::String& error)
{
    const juce::ScopedLock lock (requestLock);
    error.clear();
    if (connection == nullptr || connection->control == nullptr
        || connection->process == nullptr || ! connection->process->isRunning())
    {
        controlFailed.store (true, std::memory_order_release);
        error = "plug-in worker is not running";
        logDiagnostic ("control_unavailable", error);
        return false;
    }
    Message requestMessage;
    requestMessage.type = type;
    requestMessage.generation = connection->generation;
    requestMessage.requestId = nextRequestId.fetch_add (1, std::memory_order_relaxed);
    requestMessage.payload = payload;
    if (! connection->control->send (requestMessage, timeoutMs, error))
    {
        controlFailed.store (true, std::memory_order_release);
        logDiagnostic ("control_send_failed", error);
        return false;
    }
    const auto response = connection->control->receive (timeoutMs);
    if (! response)
    {
        controlFailed.store (true, std::memory_order_release);
        error = response.error;
        logDiagnostic ("control_receive_failed", error);
        return false;
    }
    if (! belongsToGeneration (response.message, connection->generation)
        || response.message.requestId != requestMessage.requestId)
    {
        controlFailed.store (true, std::memory_order_release);
        error = "stale or mismatched plug-in worker reply";
        logDiagnostic ("control_reply_mismatch", error);
        return false;
    }
    if (response.message.type == MessageType::error)
    {
        juce::String jsonError;
        const auto json = decodeJsonPayload (response.message, jsonError);
        error = jsonError.isNotEmpty() ? jsonError
                                       : json.getProperty ("error", "worker operation failed").toString();
        logDiagnostic ("worker_operation_failed", error);
        return false;
    }
    if (response.message.type != expectedReply)
    {
        controlFailed.store (true, std::memory_order_release);
        error = "unexpected plug-in worker reply";
        logDiagnostic ("control_reply_unexpected", error);
        return false;
    }
    reply = response.message.payload;
    return true;
}

void IsolatedPluginProxy::logDiagnostic (const juce::String& event,
                                         const juce::String& detail) const
{
    if (connection != nullptr)
        LiveWorkerDiagnostics::append (connection->diagnosticLog, event,
                                       connection->generation, connection->pluginName, detail);
}

bool IsolatedPluginProxy::applyParameterValues (const juce::MemoryBlock& payload,
                                                 juce::String& error)
{
    Message message;
    message.payload = payload;
    const auto json = decodeJsonPayload (message, error);
    const auto programValue = json.getProperty ("currentProgram", {});
    const auto valuesValue = json.getProperty ("parameters", {});
    const auto* values = valuesValue.getArray();
    if (error.isNotEmpty() || ! json.isObject() || values == nullptr
        || (! programValue.isInt() && ! programValue.isInt64())
        || values->size() != static_cast<int> (remoteParameters.size()))
    {
        if (error.isEmpty())
            error = "plug-in worker returned an invalid parameter snapshot";
        return false;
    }

    for (int index = 0; index < values->size(); ++index)
    {
        const auto& value = values->getReference (index);
        if (! value.isInt() && ! value.isInt64() && ! value.isDouble() && ! value.isBool())
        {
            error = "plug-in worker returned a non-numeric parameter value";
            return false;
        }
    }

    for (int index = 0; index < values->size(); ++index)
    {
        auto* parameter = remoteParameters[static_cast<size_t> (index)];
        parameter->setFromWorker (static_cast<float> (static_cast<double> (
            values->getReference (index))));
    }
    currentProgram.store (juce::jlimit (0, static_cast<int> (programNames.size()) - 1,
                                        static_cast<int> (programValue)),
                          std::memory_order_release);
    return true;
}

bool IsolatedPluginProxy::flushParameterValues (int timeoutMs, juce::String& error)
{
    juce::Array<juce::var> values;
    values.ensureStorageAllocated (static_cast<int> (remoteParameters.size()));
    for (const auto* parameter : remoteParameters)
        values.add (parameter->getValue());

    juce::MemoryBlock reply;
    if (! request (MessageType::setParameter, jsonPayload (juce::var (values)),
                   MessageType::setParameter, reply, timeoutMs, error))
        return false;
    // This is a one-way snapshot for serialization. Applying the echo here could overwrite a
    // newer parameter edit that arrived while the control round-trip was in flight; normal
    // audio-plane feedback will report any plug-in quantisation without that race.
    return true;
}

bool IsolatedPluginProxy::requestAndSyncParameters (MessageType type,
                                                     const juce::MemoryBlock& payload,
                                                     int timeoutMs, juce::String& error)
{
    juce::MemoryBlock reply;
    if (! request (type, payload, type, reply, timeoutMs, error))
        return false;
    return applyParameterValues (reply, error);
}

void IsolatedPluginProxy::requestOrThrow (MessageType type, const juce::MemoryBlock& payload,
                                          MessageType expectedReply, int timeoutMs)
{
    juce::MemoryBlock ignored;
    juce::String error;
    if (! request (type, payload, expectedReply, ignored, timeoutMs, error))
        throwFailure (error);
}

void IsolatedPluginProxy::prepareToPlay (double sampleRate, int blockSize)
{
    if (! std::isfinite (sampleRate) || sampleRate <= 0.0 || blockSize <= 0
        || blockSize > static_cast<int> (
            connection->mapping->dataPlane().getHeader()->config.maxFrames))
        throwFailure ("audio block exceeds the live-worker mapping");
    auto* object = new juce::DynamicObject();
    object->setProperty ("sampleRate", sampleRate);
    object->setProperty ("blockSize", blockSize);
    requestOrThrow (MessageType::prepare, jsonPayload (juce::var (object)),
                    MessageType::prepare, 5000);
    setLatencySamples (metadata.latencySamples + blockSize);
}

void IsolatedPluginProxy::releaseResources()
{
    juce::MemoryBlock reply;
    juce::String error;
    request (MessageType::release, {}, MessageType::release, reply, 1000, error);
}

void IsolatedPluginProxy::reset()
{
    juce::String error;
    if (! requestAndSyncParameters (MessageType::reset, {}, 1000, error))
        throwFailure (error);
}

void IsolatedPluginProxy::setNonRealtime (bool nonRealtime) noexcept
{
    juce::AudioProcessor::setNonRealtime (nonRealtime);
    try
    {
        juce::MemoryBlock payload (1, false);
        *static_cast<juce::uint8*> (payload.getData()) = nonRealtime ? 1 : 0;
        juce::MemoryBlock reply;
        juce::String error;
        request (MessageType::setNonRealtime, payload, MessageType::setNonRealtime,
                 reply, 500, error);
    }
    catch (...) {}
}

std::span<const ParameterEvent> IsolatedPluginProxy::collectParameterEvents() noexcept
{
    if (remoteParameters.empty() || pendingParameterEvents.empty())
        return {};

    size_t count = 0;
    size_t inspected = 0;
    while (inspected < remoteParameters.size() && count < pendingParameterEvents.size())
    {
        const auto index = parameterScanCursor;
        parameterScanCursor = (parameterScanCursor + 1) % remoteParameters.size();
        ++inspected;
        const auto revision = remoteParameters[index]->getRevision();
        if (revision == sentParameterRevisions[index])
            continue;
        pendingParameterEvents[count++] = { static_cast<juce::uint32> (index), 0,
                                             remoteParameters[index]->getValue(), parameterValue };
        // Mark only events that fit this block as sent. The round-robin cursor resumes after
        // the last emitted parameter, so an inventory larger than the shared-memory capacity
        // is delivered over later blocks without losing or starving its high indexes.
        sentParameterRevisions[index] = revision;
    }
    return { pendingParameterEvents.data(), count };
}

PluginWorkerBlockBridge::TransportState IsolatedPluginProxy::captureTransport() const noexcept
{
    PluginWorkerBlockBridge::TransportState result;
    if (auto* playHead = getPlayHead())
        if (const auto position = playHead->getPosition())
        {
            if (const auto samples = position->getTimeInSamples())
            {
                result.samplePosition = *samples;
                result.flags |= transportSamplePositionValid;
            }
            if (const auto ppq = position->getPpqPosition())
            {
                result.ppqPosition = *ppq;
                result.flags |= transportPpqValid;
            }
            if (const auto bpm = position->getBpm())
            {
                result.bpm = *bpm;
                result.flags |= transportBpmValid;
            }
            if (position->getIsPlaying()) result.flags |= transportPlaying;
            if (position->getIsRecording()) result.flags |= transportRecording;
            if (position->getIsLooping()) result.flags |= transportLooping;
        }
    return result;
}

void IsolatedPluginProxy::applyWorkerParameterEvents (const PluginWorkerBlockBridge::Result& result) noexcept
{
    if (! result.workerOutputUsed || result.outputParameterEvents == 0)
        return;
    const auto block = connection->mapping->dataPlane().slotForSequence (result.renderedSequence);
    const auto events = block.outputParameterCapacity();
    for (juce::uint32 index = 0; index < result.outputParameterEvents; ++index)
        if (events[index].parameterIndex < remoteParameters.size())
            remoteParameters[events[index].parameterIndex]->setFromWorker (
                events[index].normalizedValue);
}

template <typename Sample>
void IsolatedPluginProxy::process (juce::AudioBuffer<Sample>& audio, juce::MidiBuffer& midi)
{
    const auto result = blockBridge->process (
        audio, midi, collectParameterEvents(), captureTransport(),
        [this] { return connection->mapping->waitForOutput (0) == WaitResult::signalled; },
        [this] { return connection->mapping->signalInputReady(); });
    applyWorkerParameterEvents (result);
    if (result.workerFailed)
        throwFailure ("live plug-in worker crashed, disconnected or missed its deadline");
}

void IsolatedPluginProxy::processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi)
{
    process (audio, midi);
}

void IsolatedPluginProxy::processBlock (juce::AudioBuffer<double>& audio, juce::MidiBuffer& midi)
{
    process (audio, midi);
}

const juce::String IsolatedPluginProxy::getName() const { return metadata.name; }
bool IsolatedPluginProxy::acceptsMidi() const { return metadata.acceptsMidi; }
bool IsolatedPluginProxy::producesMidi() const { return metadata.producesMidi; }
bool IsolatedPluginProxy::isMidiEffect() const { return metadata.midiEffect; }
bool IsolatedPluginProxy::supportsDoublePrecisionProcessing() const { return metadata.supportsDouble; }
double IsolatedPluginProxy::getTailLengthSeconds() const { return metadata.tailSeconds; }
bool IsolatedPluginProxy::hasEditor() const { return metadata.hasEditor; }

int IsolatedPluginProxy::getNumPrograms()
{
    return static_cast<int> (programNames.size());
}

int IsolatedPluginProxy::getCurrentProgram()
{
    return currentProgram.load (std::memory_order_acquire);
}

void IsolatedPluginProxy::setCurrentProgram (int index)
{
    if (! juce::isPositiveAndBelow (index, getNumPrograms()))
        return;
    auto* object = new juce::DynamicObject();
    object->setProperty ("index", index);
    juce::String error;
    if (! requestAndSyncParameters (MessageType::setProgram, jsonPayload (juce::var (object)),
                                    3000, error))
        throwFailure (error);
}

const juce::String IsolatedPluginProxy::getProgramName (int index)
{
    const juce::ScopedLock lock (programLock);
    return juce::isPositiveAndBelow (index, static_cast<int> (programNames.size()))
         ? programNames[static_cast<size_t> (index)] : juce::String();
}

void IsolatedPluginProxy::changeProgramName (int index, const juce::String& name)
{
    if (! juce::isPositiveAndBelow (index, getNumPrograms()))
        return;
    auto* object = new juce::DynamicObject();
    object->setProperty ("index", index);
    object->setProperty ("name", name.substring (0, 256));
    requestOrThrow (MessageType::changeProgramName, jsonPayload (juce::var (object)),
                    MessageType::changeProgramName, 3000);
    const juce::ScopedLock lock (programLock);
    programNames[static_cast<size_t> (index)] = name.substring (0, 256);
}

juce::String IsolatedPluginProxy::parameterText (int index, float value, int maximumLength)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("index", index);
    object->setProperty ("value", juce::jlimit (0.0f, 1.0f, value));
    object->setProperty ("maximumLength", juce::jlimit (1, 4096, maximumLength));
    juce::MemoryBlock reply;
    juce::String error;
    if (request (MessageType::parameterText, jsonPayload (juce::var (object)),
                 MessageType::parameterText, reply, 1000, error))
    {
        Message message;
        message.payload = reply;
        juce::String jsonError;
        const auto json = decodeJsonPayload (message, jsonError);
        if (jsonError.isEmpty())
            return json.getProperty ("text", {}).toString().substring (
                0, juce::jlimit (1, 4096, maximumLength));
    }
    return juce::String (value, 6).trimCharactersAtEnd ("0").trimCharactersAtEnd (".");
}

float IsolatedPluginProxy::parameterValueFromText (int index, const juce::String& text)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("index", index);
    object->setProperty ("text", text.substring (0, 4096));
    juce::MemoryBlock reply;
    juce::String error;
    if (request (MessageType::parameterValueFromText, jsonPayload (juce::var (object)),
                 MessageType::parameterValueFromText, reply, 1000, error))
    {
        Message message;
        message.payload = reply;
        juce::String jsonError;
        const auto json = decodeJsonPayload (message, jsonError);
        if (jsonError.isEmpty())
            return juce::jlimit (0.0f, 1.0f,
                                 (float) json.getProperty ("value", 0.0));
    }
    return juce::jlimit (0.0f, 1.0f, text.getFloatValue());
}

juce::AudioProcessorEditor* IsolatedPluginProxy::createEditor()
{
    return metadata.hasEditor ? new RemoteEditor (*this) : nullptr;
}

bool IsolatedPluginProxy::sendEditorOpen (juce::int64 hostWindow, juce::int64& nativeHandleOut,
                                          int& widthOut, int& heightOut)
{
    nativeHandleOut = 0;
    widthOut = heightOut = 0;
    auto* object = new juce::DynamicObject();
    object->setProperty ("hostWindow", hostWindow);
    juce::MemoryBlock reply;
    juce::String error;
    if (! request (MessageType::editorOpen, jsonPayload (juce::var (object)),
                   MessageType::editorOpen, reply, 3000, error))
        return false;

    Message message;
    message.payload = reply;
    juce::String jsonError;
    const auto json = decodeJsonPayload (message, jsonError);
    if (jsonError.isNotEmpty() || ! json.isObject())
        return false;
    nativeHandleOut = (juce::int64) json.getProperty ("hwnd", 0);
    widthOut = (int) json.getProperty ("width", 0);
    heightOut = (int) json.getProperty ("height", 0);
    return nativeHandleOut != 0;
}

bool IsolatedPluginProxy::sendEditorSize (int& widthOut, int& heightOut)
{
    widthOut = heightOut = 0;
    juce::MemoryBlock reply;
    juce::String error;
    if (! request (MessageType::editorResize, {}, MessageType::editorResize, reply, 1000, error))
        return false;
    Message message;
    message.payload = reply;
    juce::String jsonError;
    const auto json = decodeJsonPayload (message, jsonError);
    if (jsonError.isNotEmpty() || ! json.isObject())
        return false;
    widthOut = (int) json.getProperty ("width", 0);
    heightOut = (int) json.getProperty ("height", 0);
    return true;
}

void IsolatedPluginProxy::sendEditorClose() noexcept
{
    try
    {
        juce::MemoryBlock reply;
        juce::String error;
        request (MessageType::editorClose, {}, MessageType::editorClose, reply, 1000, error);
    }
    catch (...) {}
}

void IsolatedPluginProxy::getStateInformation (juce::MemoryBlock& state)
{
    juce::String error;
    // Audio-plane parameter changes may still be pending while transport is stopped. Push the
    // proxy's authoritative values first so the opaque state describes what Hostage is showing,
    // rather than the worker's preceding block.
    if (! flushParameterValues (3000, error))
        throwFailure (error);
    if (! request (MessageType::getState, {}, MessageType::stateReply, state, 3000, error))
        throwFailure (error);
}

void IsolatedPluginProxy::setStateInformation (const void* data, int size)
{
    juce::MemoryBlock payload;
    if (data != nullptr && size > 0)
        payload.append (data, static_cast<size_t> (size));
    juce::String error;
    if (! requestAndSyncParameters (MessageType::setState, payload, 3000, error))
        throwFailure (error);
}

bool IsolatedPluginProxy::applyVstPreset (const juce::File& presetFile)
{
    if (! presetFile.existsAsFile())
        return false;
    auto* object = new juce::DynamicObject();
    object->setProperty ("path", presetFile.getFullPathName());
    juce::String error;
    return requestAndSyncParameters (MessageType::applyVstPreset,
                                     jsonPayload (juce::var (object)), 5000, error);
}

[[noreturn]] void IsolatedPluginProxy::throwFailure (const juce::String& error)
{
    throw std::runtime_error (error.toStdString());
}

} // namespace ceditor::host
