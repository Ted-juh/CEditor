// CEditorPluginWorker — one live VST3 instance in one disposable process.
//
// Audio/MIDI uses the fixed shared-memory pipeline; this process may wait, allocate, crash or be
// terminated without ever making Hostage's audio callback wait. State/editor lifecycle uses the
// named control pipe. One worker per instance makes every death attributable and restartable.

#include "PluginWorkerControlChannel.h"
#include "PluginWorkerCrashReporter.h"
#include "PluginWorkerJob.h"
#include "PluginWorkerSharedMemory.h"
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdlib>
#include <exception>
#include <stdexcept>
#include <utility>
#include <vector>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #include <windows.h>
#endif

namespace
{
using namespace ceditor::host::plugin_worker;

juce::var parameterMetadata (juce::AudioProcessor& processor)
{
    juce::Array<juce::var> result;
    const auto parameters = processor.getParameters();
    for (int index = 0; index < parameters.size(); ++index)
    {
        const auto* parameter = parameters[index];
        auto* object = new juce::DynamicObject();
        const auto* hosted = dynamic_cast<const juce::HostedAudioProcessorParameter*> (parameter);
        object->setProperty ("index", index);
        object->setProperty ("id", hosted != nullptr ? hosted->getParameterID()
                                                   : juce::String (index));
        object->setProperty ("name", parameter->getName (128));
        object->setProperty ("label", parameter->getLabel());
        object->setProperty ("value", parameter->getValue());
        object->setProperty ("defaultValue", parameter->getDefaultValue());
        object->setProperty ("steps", parameter->getNumSteps());
        object->setProperty ("discrete", parameter->isDiscrete());
        object->setProperty ("automatable", parameter->isAutomatable());
        result.add (juce::var (object));
    }
    return result;
}

juce::var createMetadata (juce::AudioProcessor& processor, bool crashDumpsAvailable,
                          const juce::String& crashDumpError,
                          const juce::String& workerBuildSha256)
{
    juce::Array<juce::var> programNames;
    const auto programCount = juce::jlimit (1, 4096, processor.getNumPrograms());
    for (int index = 0; index < programCount; ++index)
        programNames.add (processor.getProgramName (index).substring (0, 256));

    auto* object = new juce::DynamicObject();
    object->setProperty ("ok", true);
    object->setProperty ("name", processor.getName());
    object->setProperty ("inputs", processor.getTotalNumInputChannels());
    object->setProperty ("outputs", processor.getTotalNumOutputChannels());
    object->setProperty ("acceptsMidi", processor.acceptsMidi());
    object->setProperty ("producesMidi", processor.producesMidi());
    object->setProperty ("midiEffect", processor.isMidiEffect());
    object->setProperty ("hasEditor", processor.hasEditor());
    object->setProperty ("latencySamples", processor.getLatencySamples());
    object->setProperty ("tailSeconds", processor.getTailLengthSeconds());
    object->setProperty ("doublePrecision", processor.supportsDoublePrecisionProcessing());
    object->setProperty ("currentProgram", juce::jlimit (
        0, programCount - 1, processor.getCurrentProgram()));
    object->setProperty ("crashDumpsAvailable", crashDumpsAvailable);
    object->setProperty ("crashDumpError", crashDumpError.substring (0, 512));
    object->setProperty ("workerBuildSha256", workerBuildSha256);
    object->setProperty ("programNames", programNames);
    object->setProperty ("parameters", parameterMetadata (processor));
    return juce::var (object);
}

Message errorReply (juce::uint32 generation, juce::int64 requestId,
                    const juce::String& detail)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("ok", false);
    object->setProperty ("error", detail);
    return makeJsonMessage (MessageType::error, generation, requestId, juce::var (object));
}

juce::var parameterValues (juce::AudioProcessor& processor)
{
    juce::Array<juce::var> result;
    const auto parameters = processor.getParameters();
    result.ensureStorageAllocated (parameters.size());
    for (const auto* parameter : parameters)
        result.add (parameter->getValue());
    return juce::var (result);
}

juce::var processorSnapshot (juce::AudioProcessor& processor)
{
    auto* result = new juce::DynamicObject();
    const auto programs = juce::jmax (1, processor.getNumPrograms());
    result->setProperty ("currentProgram", juce::jlimit (
        0, programs - 1, processor.getCurrentProgram()));
    result->setProperty ("parameters", parameterValues (processor));
    return juce::var (result);
}

class WorkerPlayHead final : public juce::AudioPlayHead
{
public:
    void update (const BlockHeader& block)
    {
        PositionInfo next;
        const auto flags = block.transportFlags;
        if ((flags & transportSamplePositionValid) != 0)
            next.setTimeInSamples (block.samplePosition);
        if ((flags & transportPpqValid) != 0)
            next.setPpqPosition (block.ppqPosition);
        if ((flags & transportBpmValid) != 0)
            next.setBpm (block.bpm);
        next.setIsPlaying ((flags & transportPlaying) != 0);
        next.setIsRecording ((flags & transportRecording) != 0);
        next.setIsLooping ((flags & transportLooping) != 0);
        position = next;
    }

    juce::Optional<PositionInfo> getPosition() const override { return position; }

private:
    PositionInfo position;
};

class WorkerAudioThread final : public juce::Thread
{
public:
    WorkerAudioThread (juce::AudioProcessor& processorToUse, SharedDataPlaneMapping& mappingToUse)
        : juce::Thread ("Hostage plug-in audio worker"), processor (processorToUse),
          mapping (mappingToUse), config (mapping.dataPlane().getHeader()->config),
          floatBuffer (static_cast<int> (juce::jmax (config.maxInputChannels,
                                                     config.maxOutputChannels)),
                       static_cast<int> (config.maxFrames)),
          doubleBuffer (floatBuffer.getNumChannels(), floatBuffer.getNumSamples())
    {
        midi.ensureSize (config.maxMidiBytes + 512);
        processor.setPlayHead (&playHead);
        const auto parameters = processor.getParameters();
        lastParameterValues.reserve (static_cast<size_t> (parameters.size()));
        for (auto* parameter : parameters)
            lastParameterValues.push_back (parameter->getValue());
    }

    ~WorkerAudioThread() override { processor.setPlayHead (nullptr); }

    bool processorFailed() const noexcept { return failed.load (std::memory_order_acquire); }

    void run() override
    {
        while (! threadShouldExit())
        {
            const auto wait = mapping.waitForInput (100);
            if (wait == WaitResult::timedOut)
                continue;
            if (wait != WaitResult::signalled)
            {
                failed.store (true, std::memory_order_release);
                break;
            }
            if (threadShouldExit())
                break;

            std::atomic_thread_fence (std::memory_order_acquire);
            const auto plane = mapping.dataPlane();
            const auto sequence = plane.getHeader()->latestInputSequence.load (
                std::memory_order_acquire);
            if (sequence == 0 || sequence <= lastProcessedSequence)
                continue;

            const auto block = plane.slotForSequence (sequence);
            auto* header = block.getHeader();
            if (header == nullptr
                || header->inputSequence.load (std::memory_order_acquire) != sequence
                || header->status.load (std::memory_order_acquire)
                       != static_cast<juce::uint32> (BlockStatus::ready)
                || header->numFrames > config.maxFrames
                || header->numInputChannels > config.maxInputChannels
                || header->numOutputChannels > config.maxOutputChannels
                || header->inputMidiBytes > config.maxMidiBytes
                || header->inputParameterEvents > config.maxParameterEvents)
            {
                publishFailure (block, sequence, BlockStatus::invalidBlock);
                break;
            }

            lastProcessedSequence = sequence;
            const juce::ScopedLock callbackLock (processor.getCallbackLock());
            try
            {
                applyParameterEvents (block, *header);
                playHead.update (*header);
                if (! decodeMidi ({ block.inputMidiCapacity().data(), header->inputMidiBytes },
                                  midi, header->numFrames))
                {
                    publishFailure (block, sequence, BlockStatus::invalidBlock);
                    break;
                }

                const auto useDouble = processor.getProcessingPrecision()
                                     == juce::AudioProcessor::doublePrecision;
                if (useDouble)
                {
                    prepareAudio (doubleBuffer, block, *header);
                    juce::ScopedNoDenormals noDenormals;
                    processor.processBlock (doubleBuffer, midi);
                    copyOutput (doubleBuffer, block, *header);
                }
                else
                {
                    prepareAudio (floatBuffer, block, *header);
                    juce::ScopedNoDenormals noDenormals;
                    processor.processBlock (floatBuffer, midi);
                    copyOutput (floatBuffer, block, *header);
                }

                captureParameterChanges (block, *header);
                const auto encoded = encodeMidi (midi, block.outputMidiCapacity());
                publish (block, sequence, encoded.overflow ? 0 : encoded.bytes,
                         encoded.overflow ? BlockStatus::processedMidiOverflow
                                          : BlockStatus::processed);
            }
            catch (...)
            {
                publishFailure (block, sequence, BlockStatus::processorException);
                break;
            }
        }
    }

private:
    void applyParameterEvents (const BlockView& block, const BlockHeader& header)
    {
        const auto parameters = processor.getParameters();
        const auto events = block.inputParameterCapacity();
        for (juce::uint32 index = 0; index < header.inputParameterEvents; ++index)
        {
            const auto& event = events[index];
            if (event.parameterIndex >= static_cast<juce::uint32> (parameters.size())
                || event.sampleOffset >= header.numFrames)
                continue;
            auto* parameter = parameters[static_cast<int> (event.parameterIndex)];
            if ((event.flags & parameterGestureBegin) != 0)
                parameter->beginChangeGesture();
            parameter->setValue (juce::jlimit (0.0f, 1.0f, event.normalizedValue));
            if ((event.flags & parameterGestureEnd) != 0)
                parameter->endChangeGesture();
        }
    }

    template <typename Sample>
    static void prepareAudio (juce::AudioBuffer<Sample>& audio, const BlockView& block,
                              const BlockHeader& header)
    {
        audio.setSize (static_cast<int> (juce::jmax (header.numInputChannels,
                                                     header.numOutputChannels)),
                       static_cast<int> (header.numFrames), false, false, true);
        for (int channel = 0; channel < audio.getNumChannels(); ++channel)
            if (channel < static_cast<int> (header.numInputChannels))
                for (int frame = 0; frame < audio.getNumSamples(); ++frame)
                    audio.setSample (channel, frame, static_cast<Sample> (
                        block.inputChannel (static_cast<juce::uint32> (channel))[frame]));
            else
                audio.clear (channel, 0, audio.getNumSamples());
    }

    template <typename Sample>
    static void copyOutput (const juce::AudioBuffer<Sample>& audio, const BlockView& block,
                            const BlockHeader& header)
    {
        for (juce::uint32 channel = 0; channel < header.numOutputChannels; ++channel)
            if (channel < static_cast<juce::uint32> (audio.getNumChannels()))
                for (juce::uint32 frame = 0; frame < header.numFrames; ++frame)
                    block.outputChannel (channel)[frame]
                        = static_cast<double> (audio.getSample (static_cast<int> (channel),
                                                               static_cast<int> (frame)));
            else
                std::fill_n (block.outputChannel (channel), header.numFrames, 0.0);
    }

    void captureParameterChanges (const BlockView& block, BlockHeader& header)
    {
        const auto parameters = processor.getParameters();
        auto output = block.outputParameterCapacity();
        juce::uint32 count = 0;
        size_t inspected = 0;
        while (inspected < juce::jmin (static_cast<size_t> (parameters.size()),
                                      maxParameterInspectionsPerBlock)
               && count < static_cast<juce::uint32> (output.size()))
        {
            const auto index = parameterScanCursor;
            parameterScanCursor = (parameterScanCursor + 1)
                                % static_cast<size_t> (parameters.size());
            ++inspected;
            const auto value = parameters[index]->getValue();
            if (index >= lastParameterValues.size() || value != lastParameterValues[index])
            {
                output[count++] = { static_cast<juce::uint32> (index), 0, value, parameterValue };
                if (index < lastParameterValues.size())
                    lastParameterValues[index] = value;
            }
        }
        header.outputParameterEvents = count;
    }

    void publish (const BlockView& block, juce::uint64 sequence, juce::uint32 midiBytes,
                  BlockStatus status)
    {
        block.finishOutput (sequence, midiBytes, status);
        mapping.dataPlane().getHeader()->latestOutputSequence.store (
            sequence, std::memory_order_release);
        std::atomic_thread_fence (std::memory_order_release);
        if (! mapping.signalOutputReady())
            failed.store (true, std::memory_order_release);
    }

    void publishFailure (const BlockView& block, juce::uint64 sequence, BlockStatus status)
    {
        publish (block, sequence, 0, status);
        failed.store (true, std::memory_order_release);
    }

    juce::AudioProcessor& processor;
    SharedDataPlaneMapping& mapping;
    const DataPlaneConfig config;
    juce::AudioBuffer<float> floatBuffer;
    juce::AudioBuffer<double> doubleBuffer;
    juce::MidiBuffer midi;
    WorkerPlayHead playHead;
    std::vector<float> lastParameterValues;
    size_t parameterScanCursor = 0;
    juce::uint64 lastProcessedSequence = 0;
    std::atomic<bool> failed { false };
};

class WorkerEditorController
{
public:
    explicit WorkerEditorController (juce::AudioProcessor& processorToUse)
        : processor (processorToUse) {}

    enum class State : int { idle = 0, opening, ready, failed };

    /** Control thread, after Hostage has finished preparing and restoring the processor.
        Construct the expensive vendor GUI under a message-only window before Hostage asks
        to see it. The first visible open can then use the same cheap reparent path as every
        later open, without putting a window on screen. */
    void prewarm()
    {
       #if JUCE_WINDOWS
        if (processor.hasEditor())
            juce::MessageManager::callAsync ([this] { prewarmOnMessageThread(); });
       #endif
    }

    /** Control thread. Starts building the vendor editor inside `hostWindow` — a Hostage
        window, which the editor's own window becomes a CHILD of — and returns at once;
        status() says how it went.

        Nothing here waits for the message thread, and that is the design, not a shortcut.
        Building a vendor GUI can take seconds, and while it is being built inside Hostage's
        window it sends Hostage synchronous window messages that Hostage can only answer if
        its own message thread is free. The first version did the build inside the control
        request, so Hostage's thread was blocked on the pipe for the whole of it: every
        editor open took longer than the request's deadline, the late reply landed on the
        next request as "stale", and the worker was torn down for it — an editor that
        flashed on screen and a part marked Missing. So the request only STARTS the build;
        the message thread publishes progress into atomics; status() reads those from the
        control thread; and Hostage polls with requests that return in under a millisecond. */
    bool open (juce::int64 hostWindow)
    {
        if (hostWindow == 0)
            return false;
        // Always posted, never short-circuited on "already ready": the pane's editor closes
        // and a floating one opens in the same instant, and the close is a posted message
        // still in flight. Answering "ready" from here handed Hostage the OLD window, which
        // the close then destroyed — "Opening…" for ever, the first time. Posting the open
        // behind the close, and publishing nothing until it has run, makes the sequence the
        // message thread's, in order.
        handle.store (0, std::memory_order_release);
        state.store (State::opening, std::memory_order_release);
        juce::MessageManager::callAsync ([this, hostWindow] { openOnMessageThread (hostWindow); });
        return true;
    }

    /** Control thread. Reads what the message thread last published; never blocks. */
    void status (State& stateOut, juce::int64& handleOut, int& widthOut, int& heightOut,
                 int& openDurationOut, bool& reusedOut, int& prewarmDurationOut,
                 bool& prewarmedOut) const noexcept
    {
        stateOut = state.load (std::memory_order_acquire);
        handleOut = handle.load (std::memory_order_acquire);
        widthOut = width.load (std::memory_order_acquire);
        heightOut = height.load (std::memory_order_acquire);
        openDurationOut = openDurationMs.load (std::memory_order_acquire);
        reusedOut = reused.load (std::memory_order_acquire);
        prewarmDurationOut = prewarmDurationMs.load (std::memory_order_acquire);
        prewarmedOut = prewarmed.load (std::memory_order_acquire);
    }

    void closeNow() { closeOnMessageThread(); }
    void destroyNow()
    {
        frame.reset();
        frameHostWindow = 0;
        handle.store (0, std::memory_order_release);
        state.store (State::idle, std::memory_order_release);
    }

private:
    void prewarmOnMessageThread()
    {
       #if JUCE_WINDOWS
        if (frame != nullptr)
            return;
        const auto started = juce::Time::getMillisecondCounterHiRes();
        try
        {
            const auto parkingWindow = static_cast<juce::int64> (
                reinterpret_cast<juce::pointer_sized_int> (HWND_MESSAGE));
            if (! createFrame (parkingWindow))
                return;
            frameHostWindow = 0;  // parked, not owned by any Hostage peer
            prewarmDurationMs.store (static_cast<int> (
                juce::Time::getMillisecondCounterHiRes() - started), std::memory_order_release);
            prewarmed.store (true, std::memory_order_release);
        }
        catch (...)
        {
            frame.reset();
        }
       #endif
    }

    bool createFrame (juce::int64 parentWindow)
    {
        auto* editor = processor.createEditorIfNeeded();
        if (editor == nullptr)
            return false;
        frame = std::make_unique<Frame> (*this, editor);
        // Off-screen until Hostage places it: the window exists at the plug-in's size
        // the moment it is created, and without this it appeared at the host window's
        // origin for up to a poll tick before jumping to where it belonged.
        frame->setTopLeftPosition (-32000, -32000);
        // On the prewarm path the parent is HWND_MESSAGE; on a cold explicit open it is
        // the Hostage peer. Both make a child with no taskbar button or foreground claim.
        frame->addToDesktop (0, reinterpret_cast<void*> (
            static_cast<juce::pointer_sized_int> (parentWindow)));
        frame->setVisible (true);
        if (frame->getPeer() == nullptr)
        {
            frame.reset();
            return false;
        }
        publishSize();
        return true;
    }

    void openOnMessageThread (juce::int64 hostWindow)
    {
        const auto started = juce::Time::getMillisecondCounterHiRes();
       #if JUCE_WINDOWS
        if (frame != nullptr && ! hasValidNativeWindow())
            frame.reset();
        if (frame != nullptr && frameHostWindow != hostWindow
            && ! setNativeParent (reinterpret_cast<HWND> (
                static_cast<juce::pointer_sized_int> (hostWindow))))
            frame.reset();
       #else
        if (frame != nullptr && frameHostWindow != hostWindow)
            frame.reset();
       #endif
        if (frame != nullptr)
        {
            frameHostWindow = hostWindow;
            frame->setTopLeftPosition (-32000, -32000);
            frame->setVisible (true);
            publishHandle();
            publishSize();
            openDurationMs.store (static_cast<int> (
                juce::Time::getMillisecondCounterHiRes() - started), std::memory_order_release);
            reused.store (true, std::memory_order_release);
            state.store (State::ready, std::memory_order_release);
            return;
        }
        try
        {
            if (! createFrame (hostWindow))
            {
                state.store (State::failed, std::memory_order_release);
                return;
            }
            frameHostWindow = hostWindow;
            publishHandle();
            openDurationMs.store (static_cast<int> (
                juce::Time::getMillisecondCounterHiRes() - started), std::memory_order_release);
            reused.store (false, std::memory_order_release);
            state.store (State::ready, std::memory_order_release);   // last: it gates the rest
        }
        catch (...)
        {
            frame.reset();
            state.store (State::failed, std::memory_order_release);
        }
    }

    void closeOnMessageThread()
    {
        if (frame != nullptr)
        {
            frame->setVisible (false);
           #if JUCE_WINDOWS
            // Keep the vendor editor alive while Hostage destroys the pane or floating parent.
            // HWND_MESSAGE is process-neutral parking: the same child can later be reparented
            // into the next Hostage peer without re-running createEditorIfNeeded().
            if (! setNativeParent (HWND_MESSAGE))
                frame.reset();
           #else
            frame.reset();
           #endif
        }
        frameHostWindow = 0;
        handle.store (0, std::memory_order_release);
        state.store (State::idle, std::memory_order_release);
    }

   #if JUCE_WINDOWS
    bool hasValidNativeWindow() const
    {
        const auto* peer = frame != nullptr ? frame->getPeer() : nullptr;
        return peer != nullptr && IsWindow (static_cast<HWND> (peer->getNativeHandle())) != FALSE;
    }

    bool setNativeParent (HWND parent)
    {
        if (! hasValidNativeWindow())
            return false;
        auto* peer = frame->getPeer();
        auto hwnd = static_cast<HWND> (peer->getNativeHandle());
        SetLastError (ERROR_SUCCESS);
        const auto previous = SetParent (hwnd, parent);
        return previous != nullptr || GetLastError() == ERROR_SUCCESS;
    }
   #endif

    void publishHandle()
    {
        auto* peer = frame != nullptr ? frame->getPeer() : nullptr;
        handle.store (peer != nullptr
                          ? static_cast<juce::int64> (reinterpret_cast<juce::pointer_sized_int> (peer->getNativeHandle()))
                          : (juce::int64) 0,
                      std::memory_order_release);
    }

    void publishSize()
    {
        if (frame == nullptr)
            return;
        width.store (frame->getWidth(), std::memory_order_release);
        height.store (frame->getHeight(), std::memory_order_release);
    }

    // The editor's frame: sized BY the editor, never the other way round. A vendor GUI that
    // resizes itself takes the frame with it and the new size is published for Hostage's
    // next poll. Hostage may also size the child window directly, which reaches here as a
    // resize; the editor is left at its own size and clipped rather than squeezed.
    class Frame final : public juce::Component, private juce::ComponentListener
    {
    public:
        Frame (WorkerEditorController& ownerToUse, juce::AudioProcessorEditor* editorToOwn)
            : owner (ownerToUse), editor (editorToOwn)
        {
            setOpaque (true);
            addAndMakeVisible (*editor);
            setSize (juce::jmax (1, editor->getWidth()), juce::jmax (1, editor->getHeight()));
            editor->addComponentListener (this);
        }

        ~Frame() override
        {
            // The editor dies before the frame it sits in, and before the processor that
            // created it — the same ordering the host's own editor windows keep.
            editor->removeComponentListener (this);
            removeChildComponent (editor.get());
            editor.reset();
        }

        void paint (juce::Graphics& graphics) override { graphics.fillAll (juce::Colours::black); }
        void resized() override { editor->setTopLeftPosition (0, 0); }

    private:
        void componentMovedOrResized (juce::Component&, bool, bool wasResized) override
        {
            if (wasResized)
            {
                setSize (juce::jmax (1, editor->getWidth()), juce::jmax (1, editor->getHeight()));
                owner.publishSize();
            }
        }

        WorkerEditorController& owner;
        std::unique_ptr<juce::AudioProcessorEditor> editor;
    };

    juce::AudioProcessor& processor;
    std::unique_ptr<Frame> frame;            // message thread only
    juce::int64 frameHostWindow = 0;         // message thread only: which Hostage window it is in
    std::atomic<State> state { State::idle };
    std::atomic<juce::int64> handle { 0 };
    std::atomic<int> width { 0 };
    std::atomic<int> height { 0 };
    std::atomic<int> openDurationMs { 0 };
    std::atomic<bool> reused { false };
    std::atomic<int> prewarmDurationMs { 0 };
    std::atomic<bool> prewarmed { false };
};

/** The longest single turn of the message loop, in milliseconds, since the last time it was
    read. Reported to Hostage with the editor status and logged there: when a plug-in's window
    hogs this thread, the log names the length of the hog instead of leaving it to be inferred
    from "busy" replies. Reset on read, so each report is the worst since the last. */
static std::atomic<int> longestDispatchMs { 0 };

/** Thrown by invokeProcessor when the message thread did not pick the job up in time. It is
    a reply, not a failure: the control loop answers it with a "busy:" error and carries on,
    and Hostage retries. Everything else thrown from a handler still stops the worker. */
struct WorkerBusy final : public std::runtime_error
{
    using std::runtime_error::runtime_error;
};

class WorkerControlThread final : public juce::Thread
{
public:
    WorkerControlThread (juce::AudioProcessor& processorToUse,
                         PluginWorkerControlChannel& channelToUse,
                         WorkerEditorController& editorToUse,
                         juce::uint32 generationToUse, juce::uint32 maxFramesToUse,
                         std::atomic<bool>& quitToUse)
        : juce::Thread ("Hostage plug-in control worker"), processor (processorToUse),
          channel (channelToUse), editor (editorToUse), generation (generationToUse),
          maxFrames (maxFramesToUse), quit (quitToUse)
    {
    }

    void run() override
    {
        while (! threadShouldExit() && ! quit.load (std::memory_order_acquire))
        {
            const auto received = channel.receive (100);
            if (! received)
                continue;
            if (! belongsToGeneration (received.message, generation))
            {
                send (errorReply (generation, received.message.requestId,
                                  "stale plug-in worker generation"));
                continue;
            }

            Message reply;
            reply.type = received.message.type;
            reply.generation = generation;
            reply.requestId = received.message.requestId;
            try
            {
                if (received.message.type == MessageType::getState)
                {
                    int pickUpMs = 400;
                    bool valid = true;
                    if (! received.message.payload.isEmpty())
                    {
                        juce::String jsonError;
                        const auto json = decodeJsonPayload (received.message, jsonError);
                        valid = jsonError.isEmpty() && json.isObject();
                        if (valid)
                            pickUpMs = juce::jlimit (
                                10, 2000, (int) json.getProperty ("pickUpMs", 400));
                    }
                    if (! valid)
                        reply = errorReply (generation, received.message.requestId,
                                            "invalid worker state request");
                    else
                    {
                        invokeProcessor ([&] { processor.getStateInformation (reply.payload); },
                                         pickUpMs);
                        if (reply.payload.getSize() > maxPayloadBytes)
                            reply = errorReply (generation, received.message.requestId,
                                                "plug-in state exceeds the 64 MiB worker limit");
                        else
                            reply.type = MessageType::stateReply;
                    }
                }
                else if (received.message.type == MessageType::setParameter)
                {
                    juce::String jsonError;
                    const auto json = decodeJsonPayload (received.message, jsonError);
                    const auto valuesValue = json.isObject()
                        ? json.getProperty ("values", {}) : json;
                    const auto* values = valuesValue.getArray();
                    const auto pickUpMs = json.isObject()
                        ? juce::jlimit (10, 2000, (int) json.getProperty ("pickUpMs", 400))
                        : 400;
                    const auto parameters = processor.getParameters();
                    bool valid = jsonError.isEmpty() && values != nullptr
                              && values->size() == parameters.size();
                    if (valid)
                        for (const auto& value : *values)
                            valid = valid && (value.isInt() || value.isInt64()
                                           || value.isDouble() || value.isBool());
                    if (! valid)
                        reply = errorReply (generation, received.message.requestId,
                                            "invalid worker parameter snapshot");
                    else
                    {
                        invokeProcessor ([&]
                        {
                            for (int index = 0; index < parameters.size(); ++index)
                                parameters[index]->setValue (juce::jlimit (
                                    0.0f, 1.0f, static_cast<float> (static_cast<double> (
                                        values->getReference (index)))));
                            reply = makeJsonMessage (MessageType::setParameter, generation,
                                received.message.requestId, processorSnapshot (processor));
                        }, pickUpMs);
                    }
                }
                else if (received.message.type == MessageType::parameterText)
                {
                    juce::String jsonError;
                    const auto json = decodeJsonPayload (received.message, jsonError);
                    const auto index = (int) json.getProperty ("index", -1);
                    const auto value = juce::jlimit (0.0f, 1.0f,
                        (float) json.getProperty ("value", 0.0));
                    const auto maximumLength = juce::jlimit (
                        1, 4096, (int) json.getProperty ("maximumLength", 128));
                    const auto parameters = processor.getParameters();
                    if (jsonError.isNotEmpty() || ! juce::isPositiveAndBelow (index, parameters.size()))
                        reply = errorReply (generation, received.message.requestId,
                                            "invalid worker parameter-text request");
                    else
                    {
                        juce::String formatted;
                        // Hostage says how long a label is worth waiting for: almost nothing.
                        invokeProcessor ([&]
                        {
                            formatted = parameters[index]->getText (value, maximumLength);
                        }, juce::jlimit (10, 2000, (int) json.getProperty ("pickUpMs", 400)));
                        auto* object = new juce::DynamicObject();
                        object->setProperty ("text", formatted);
                        reply = makeJsonMessage (MessageType::parameterText, generation,
                                                 received.message.requestId, juce::var (object));
                    }
                }
                else if (received.message.type == MessageType::parameterValueFromText)
                {
                    juce::String jsonError;
                    const auto json = decodeJsonPayload (received.message, jsonError);
                    const auto index = (int) json.getProperty ("index", -1);
                    const auto text = json.getProperty ("text", {}).toString().substring (0, 4096);
                    const auto parameters = processor.getParameters();
                    if (jsonError.isNotEmpty() || ! juce::isPositiveAndBelow (index, parameters.size()))
                        reply = errorReply (generation, received.message.requestId,
                                            "invalid worker parameter parse request");
                    else
                    {
                        float parsed = 0.0f;
                        invokeProcessor ([&]
                        {
                            parsed = parameters[index]->getValueForText (text);
                        }, juce::jlimit (10, 2000, (int) json.getProperty ("pickUpMs", 400)));
                        auto* object = new juce::DynamicObject();
                        object->setProperty ("value", juce::jlimit (0.0f, 1.0f, parsed));
                        reply = makeJsonMessage (MessageType::parameterValueFromText, generation,
                                                 received.message.requestId, juce::var (object));
                    }
                }
                else if (received.message.type == MessageType::setState)
                {
                    invokeProcessor ([&]
                    {
                        processor.setStateInformation (
                            received.message.payload.getData(),
                            static_cast<int> (received.message.payload.getSize()));
                        reply = makeJsonMessage (MessageType::setState, generation,
                            received.message.requestId, processorSnapshot (processor));
                    });
                }
                else if (received.message.type == MessageType::reset)
                {
                    invokeProcessor ([&]
                    {
                        processor.reset();
                        reply = makeJsonMessage (MessageType::reset, generation,
                            received.message.requestId, processorSnapshot (processor));
                    });
                }
                else if (received.message.type == MessageType::prepare)
                {
                    juce::String jsonError;
                    const auto json = decodeJsonPayload (received.message, jsonError);
                    const auto sampleRate = (double) json.getProperty ("sampleRate", 0.0);
                    const auto blockSize = (int) json.getProperty ("blockSize", 0);
                    if (jsonError.isNotEmpty() || ! std::isfinite (sampleRate)
                        || sampleRate <= 0.0 || blockSize <= 0
                        || blockSize > static_cast<int> (maxFrames))
                        reply = errorReply (generation, received.message.requestId,
                                            "invalid worker prepare request");
                    else
                    {
                        invokeProcessor ([&]
                        {
                            processor.releaseResources();
                            processor.setRateAndBufferSizeDetails (sampleRate, blockSize);
                            processor.prepareToPlay (sampleRate, blockSize);
                        });
                    }
                }
                else if (received.message.type == MessageType::release)
                {
                    invokeProcessor ([&] { processor.releaseResources(); });
                }
                else if (received.message.type == MessageType::setNonRealtime)
                {
                    const auto nonRealtime = ! received.message.payload.isEmpty()
                        && *static_cast<const juce::uint8*> (received.message.payload.getData()) != 0;
                    // A mode hint: not worth holding the control thread for a busy plug-in.
                    invokeProcessor ([&] { processor.setNonRealtime (nonRealtime); }, 40);
                }
                else if (received.message.type == MessageType::setProgram)
                {
                    juce::String jsonError;
                    const auto json = decodeJsonPayload (received.message, jsonError);
                    const auto index = (int) json.getProperty ("index", -1);
                    int programCount = 0;
                    invokeProcessor ([&] { programCount = processor.getNumPrograms(); });
                    if (jsonError.isNotEmpty()
                        || ! juce::isPositiveAndBelow (index, programCount))
                        reply = errorReply (generation, received.message.requestId,
                                            "invalid worker program index");
                    else
                        invokeProcessor ([&]
                        {
                            processor.setCurrentProgram (index);
                            reply = makeJsonMessage (MessageType::setProgram, generation,
                                received.message.requestId, processorSnapshot (processor));
                        });
                }
                else if (received.message.type == MessageType::changeProgramName)
                {
                    juce::String jsonError;
                    const auto json = decodeJsonPayload (received.message, jsonError);
                    const auto index = (int) json.getProperty ("index", -1);
                    const auto name = json.getProperty ("name", {}).toString().substring (0, 256);
                    int programCount = 0;
                    invokeProcessor ([&] { programCount = processor.getNumPrograms(); });
                    if (jsonError.isNotEmpty()
                        || ! juce::isPositiveAndBelow (index, programCount))
                        reply = errorReply (generation, received.message.requestId,
                                            "invalid worker program rename");
                    else
                        invokeProcessor ([&] { processor.changeProgramName (index, name); });
                }
                else if (received.message.type == MessageType::applyVstPreset)
                {
                    juce::String jsonError;
                    const auto json = decodeJsonPayload (received.message, jsonError);
                    const juce::File preset (json.getProperty ("path", {}).toString());
                    auto* instance = dynamic_cast<juce::AudioPluginInstance*> (&processor);
                    juce::MemoryBlock data;
                    if (jsonError.isNotEmpty() || instance == nullptr
                        || ! preset.loadFileAsData (data))
                        reply = errorReply (generation, received.message.requestId,
                                            "worker could not apply the VST3 preset");
                    else
                    {
                        bool applied = false;
                        invokeProcessor ([&]
                        {
                            applied = juce::VST3PluginFormat::setStateFromVSTPresetFile (
                                instance, data);
                            if (applied)
                                reply = makeJsonMessage (MessageType::applyVstPreset, generation,
                                    received.message.requestId, processorSnapshot (processor));
                        });
                        if (! applied)
                            reply = errorReply (generation, received.message.requestId,
                                                "worker could not apply the VST3 preset");
                    }
                }
                else if (received.message.type == MessageType::editorOpen)
                {
                    juce::String jsonError;
                    const auto json = decodeJsonPayload (received.message, jsonError);
                    const auto hostWindow = jsonError.isEmpty() && json.isObject()
                        ? (juce::int64) json.getProperty ("hostWindow", 0) : (juce::int64) 0;
                    // The bare acknowledgement means "started"; editorResize reports the outcome.
                    if (! editor.open (hostWindow))
                        reply = errorReply (generation, received.message.requestId,
                                            "no host window to show the editor in");
                }
                else if (received.message.type == MessageType::editorPrewarm)
                {
                    // Acknowledge the scheduling, never the construction. Like editorOpen,
                    // the expensive work belongs to the message thread after this reply.
                    editor.prewarm();
                }
                else if (received.message.type == MessageType::editorResize)
                {
                    // Hostage asking, not telling: is the editor there yet, where, how big.
                    // Answered from the control thread without touching the message thread,
                    // which may be busy building the very thing being asked about.
                    WorkerEditorController::State state {};
                    juce::int64 handle = 0;
                    int width = 0, height = 0, openDurationMs = 0, prewarmDurationMs = 0;
                    bool reused = false, prewarmed = false;
                    editor.status (state, handle, width, height, openDurationMs, reused,
                                   prewarmDurationMs, prewarmed);
                    auto* object = new juce::DynamicObject();
                    object->setProperty ("state", state == WorkerEditorController::State::ready   ? "ready"
                                                : state == WorkerEditorController::State::opening ? "opening"
                                                : state == WorkerEditorController::State::failed  ? "failed"
                                                                                                   : "idle");
                    object->setProperty ("hwnd", handle);
                    object->setProperty ("width", width);
                    object->setProperty ("height", height);
                    object->setProperty ("openDurationMs", openDurationMs);
                    object->setProperty ("reused", reused);
                    object->setProperty ("prewarmDurationMs", prewarmDurationMs);
                    object->setProperty ("prewarmed", prewarmed);
                    object->setProperty ("stallMs", longestDispatchMs.exchange (0, std::memory_order_acq_rel));
                    reply = makeJsonMessage (MessageType::editorResize, generation,
                                             received.message.requestId, juce::var (object));
                }
                else if (received.message.type == MessageType::editorClose)
                {
                    // The acknowledgement means the native child is no longer owned by the
                    // Hostage window. This must complete before that parent is destroyed.
                    invokeMessageThread ([&] { editor.closeNow(); }, 400, false);
                }
                else if (received.message.type == MessageType::ping)
                {
                    reply.type = MessageType::pong;
                }
                else if (received.message.type == MessageType::shutdown)
                {
                    quit.store (true, std::memory_order_release);
                }
                else
                {
                    reply = errorReply (generation, received.message.requestId,
                                        "unsupported plug-in worker control command");
                }
            }
            catch (const WorkerBusy& busy)
            {
                // Not a failure and not a reason to stop: the worker is fine, its message
                // thread is busy, and Hostage retries a "busy:" reply.
                reply = errorReply (generation, received.message.requestId,
                                    juce::String::fromUTF8 (busy.what()));
            }
            catch (...)
            {
                reply = errorReply (generation, received.message.requestId,
                                    "plug-in threw during a control operation");
                quit.store (true, std::memory_order_release);
            }
            send (reply);
        }
    }

private:
    /** Runs `function` on the message thread, optionally under the processor's callback lock,
        waiting a BOUNDED time for that thread to pick it up.

        The bound is the point. The message thread can be busy for seconds — building the
        vendor editor is the case that found this — and while it is, every control request
        that needs it used to queue behind it here, unbounded, so the control thread answered
        nothing at all: Hostage's requests timed out one after another and a worker that was
        merely busy was torn down as dead. Now a job the message thread has not STARTED
        within `pickUpMs` is abandoned and reported as WorkerBusy, which the control loop
        turns into a "busy:" reply Hostage knows to retry. A job that has started is waited
        for however long it takes: `function` refers to this thread's stack, so it must never
        run once this call has returned — the lock below is what guarantees that. */
    template <typename Function>
    void invokeMessageThread (Function&& function, int pickUpMs, bool lockProcessor)
    {
        struct Job
        {
            juce::CriticalSection lock;
            bool started = false;
            bool abandoned = false;
            juce::WaitableEvent done;
            std::exception_ptr thrown;
        };
        auto job = std::make_shared<Job>();
        juce::MessageManager::callAsync ([this, job, &function, lockProcessor]
        {
            {
                const juce::ScopedLock lock (job->lock);
                if (job->abandoned)
                    return;
                job->started = true;
            }
            try
            {
                if (lockProcessor)
                {
                    const juce::ScopedLock lock (processor.getCallbackLock());
                    function();
                }
                else
                {
                    function();
                }
            }
            catch (...)
            {
                job->thrown = std::current_exception();
            }
            job->done.signal();
        });

        if (! job->done.wait (pickUpMs))
        {
            {
                const juce::ScopedLock lock (job->lock);
                if (! job->started)
                {
                    job->abandoned = true;
                    throw WorkerBusy ("busy: the plug-in's message thread is occupied"
                                      " (building its editor, most likely)");
                }
            }
            job->done.wait();       // it started: let it finish, whatever it takes
        }
        if (job->thrown)
            std::rethrow_exception (job->thrown);
    }

    template <typename Function>
    void invokeProcessor (Function&& function, int pickUpMs = 400)
    {
        invokeMessageThread (std::forward<Function> (function), pickUpMs, true);
    }

    void send (const Message& message)
    {
        juce::String ignored;
        // Opaque state replies can be many megabytes. Keep this bounded, but do not impose a
        // shorter deadline than the proxy waiting for the same state round-trip.
        if (! channel.send (message, 3000, ignored))
            quit.store (true, std::memory_order_release);
    }

    juce::AudioProcessor& processor;
    PluginWorkerControlChannel& channel;
    WorkerEditorController& editor;
    const juce::uint32 generation;
    const juce::uint32 maxFrames;
    std::atomic<bool>& quit;
};

#if JUCE_WINDOWS
class ParentProcessHandle
{
public:
    explicit ParentProcessHandle (juce::uint32 processId)
        : handle (OpenProcess (SYNCHRONIZE, FALSE, static_cast<DWORD> (processId))) {}
    ~ParentProcessHandle() { if (handle != nullptr) CloseHandle (handle); }
    bool isValid() const noexcept { return handle != nullptr; }
    bool isAlive() const noexcept { return handle != nullptr
        && WaitForSingleObject (handle, 0) == WAIT_TIMEOUT; }
private:
    HANDLE handle = nullptr;
};

class ParentProcessWatchdog final : public juce::Thread
{
public:
    explicit ParentProcessWatchdog (juce::uint32 processId)
        : juce::Thread ("Hostage parent-process watchdog"), parent (processId) {}

    ~ParentProcessWatchdog() override
    {
        signalThreadShouldExit();
        notify();
        stopThread (1000);
    }

    bool isValid() const noexcept { return parent.isValid(); }

    void run() override
    {
        while (! threadShouldExit())
        {
            if (! parent.isAlive())
            {
                // This thread is deliberately independent of JUCE's message loop and the audio
                // worker. If vendor construction, state code, or an editor has wedged either of
                // those, a dead Hostage parent must still reap this orphan and its OS handles.
                if (TerminateProcess (GetCurrentProcess(), 73) == FALSE)
                    std::_Exit (73);
                return;
            }
            wait (250);
        }
    }

private:
    ParentProcessHandle parent;
};
#else
class ParentProcessHandle
{
public:
    explicit ParentProcessHandle (juce::uint32) {}
    bool isValid() const noexcept { return false; }
    bool isAlive() const noexcept { return false; }
};

class ParentProcessWatchdog final : public juce::Thread
{
public:
    explicit ParentProcessWatchdog (juce::uint32)
        : juce::Thread ("Hostage parent-process watchdog") {}
    bool isValid() const noexcept { return false; }
    void run() override {}
};
#endif
} // namespace

int main (int argc, char* argv[])
{
    if (argc != 15 || juce::String (argv[1]) != "--run")
        return 64;

    // JUCE makes a process per-monitor-DPI aware only when it believes it is a standalone
    // application, and the test for that is "has a JUCEApplication instance function", not
    // any compile-time define. This process has a plain main(), so without this line it stays
    // DPI-unaware, every JUCE scale factor in it is 1.0, and its editor window — a child of a
    // Hostage window at 125% — draws the plug-in at 100% in the top-left of a frame that
    // Hostage sized for 125%: the black margin. The function is never called; its being
    // non-null is the whole effect, and it must be set before ScopedJuceInitialiser_GUI, which
    // is when JUCE decides.
    juce::JUCEApplicationBase::createInstance = [] () -> juce::JUCEApplicationBase* { return nullptr; };

    juce::ScopedJuceInitialiser_GUI juceInitialiser;
    const auto generation = static_cast<juce::uint32> (juce::String (argv[2]).getLargeIntValue());
    SharedMemoryNames names { juce::String::fromUTF8 (argv[3]),
                              juce::String::fromUTF8 (argv[4]),
                              juce::String::fromUTF8 (argv[5]),
                              juce::String::fromUTF8 (argv[6]) };
    const juce::File descriptionFile (juce::String::fromUTF8 (argv[7]));
    const juce::String statePath = juce::String::fromUTF8 (argv[8]);
    const auto sampleRate = juce::String (argv[9]).getDoubleValue();
    const auto blockSize = juce::String (argv[10]).getIntValue();
    const auto workerJobName = juce::String::fromUTF8 (argv[11]);
    const juce::File crashDumpDirectory (juce::String::fromUTF8 (argv[12]));
    const auto workerBuildSha256 = juce::String::fromUTF8 (argv[13]).toLowerCase();
    const auto parentProcessId = static_cast<juce::uint32> (
        juce::String (argv[14]).getLargeIntValue());
    ParentProcessHandle parent (parentProcessId);
    ParentProcessWatchdog parentWatchdog (parentProcessId);

    SharedDataPlaneMapping mapping;
    PluginWorkerControlChannel control;
    juce::String error;
    if (generation == 0 || ! std::isfinite (sampleRate) || sampleRate <= 0.0
        || blockSize <= 0 || ! parent.isValid() || ! parentWatchdog.isValid()
        || ! mapping.openWorker (names, error) || ! control.openWorker (names.controlPipe, error)
        || mapping.dataPlane().getHeader()->workerGeneration != generation)
        return 65;
    if (! PluginWorkerJob::joinCurrentProcess (workerJobName, error))
    {
        control.send (errorReply (generation, 0, error), 1000, error);
        return 65;
    }
    if (! parentWatchdog.startThread (juce::Thread::Priority::normal))
        return 65;

    juce::PluginDescription description;
    const auto xml = juce::XmlDocument::parse (descriptionFile.loadFileAsString());
    if (xml == nullptr || ! description.loadFromXml (*xml))
    {
        control.send (errorReply (generation, 0, "unreadable plug-in description"), 1000, error);
        return 66;
    }

    PluginWorkerCrashReporter crashReporter;
    juce::String crashDumpError;
    const auto crashDumpsAvailable = crashReporter.install (
        crashDumpDirectory, generation, description.name, workerBuildSha256, crashDumpError);

    juce::AudioPluginFormatManager manager;
    std::unique_ptr<juce::AudioPluginInstance> processor;
    try
    {
        manager.addDefaultFormats();
        processor = manager.createPluginInstance (description, sampleRate, blockSize, error);
        // A vendor constructor is allowed to install its own top-level filter. Put the worker's
        // boundary back before any state, prepare or processing callback can enter vendor code.
        crashReporter.reinstall();
    }
    catch (const std::exception& exception)
    {
        error = juce::String ("plug-in constructor failed: ")
              + juce::String::fromUTF8 (exception.what());
    }
    catch (...)
    {
        error = "plug-in constructor failed";
    }

    if (processor == nullptr)
    {
        const auto message = error.isNotEmpty() ? error : juce::String ("plug-in could not be created");
        control.send (errorReply (generation, 0, message), 1000, error);
        return 67;
    }

    const auto config = mapping.dataPlane().getHeader()->config;
    try
    {
        if (blockSize > static_cast<int> (config.maxFrames))
            throw std::runtime_error ("initial plug-in block exceeds shared memory");
        // Preserve the bus state negotiated by the format at construction. Enabling every
        // optional sidechain and auxiliary output here changes the plug-in's topology and can
        // make an otherwise ordinary stereo instance exceed the shared-memory channel budget.
        if (processor->getTotalNumInputChannels() > static_cast<int> (config.maxInputChannels)
            || processor->getTotalNumOutputChannels() > static_cast<int> (config.maxOutputChannels))
            throw std::runtime_error ("plug-in bus layout exceeds shared memory");

        if (statePath != "-")
        {
            juce::MemoryBlock state;
            if (! juce::File (statePath).loadFileAsData (state))
                throw std::runtime_error ("could not read initial plug-in state");
            processor->setStateInformation (state.getData(), static_cast<int> (state.getSize()));
        }

        if (processor->supportsDoublePrecisionProcessing())
            processor->setProcessingPrecision (juce::AudioProcessor::doublePrecision);
        processor->setRateAndBufferSizeDetails (sampleRate, blockSize);
        processor->prepareToPlay (sampleRate, blockSize);
        crashReporter.reinstall();

        if (! control.send (makeJsonMessage (MessageType::createReply, generation, 0,
                                             createMetadata (*processor, crashDumpsAvailable,
                                                             crashDumpError,
                                                             workerBuildSha256)), 5000, error))
            return 70;
    }
    catch (const std::exception& exception)
    {
        control.send (errorReply (generation, 0,
                                  juce::String ("plug-in failed during worker startup: ")
                                      + juce::String::fromUTF8 (exception.what())),
                      1000, error);
        return 69;
    }
    catch (...)
    {
        control.send (errorReply (generation, 0, "plug-in failed during worker startup"),
                      1000, error);
        return 69;
    }

    std::atomic<bool> quit { false };
    WorkerEditorController editor (*processor);
    WorkerAudioThread audio (*processor, mapping);
    WorkerControlThread commands (*processor, control, editor, generation,
                                  config.maxFrames, quit);
    const auto audioStarted = audio.startThread (juce::Thread::Priority::highest);
    const auto commandsStarted = audioStarted
        && commands.startThread (juce::Thread::Priority::normal);
    if (! commandsStarted)
    {
        // A half-started worker must not destroy the processor/mapping underneath the audio
        // thread while unwinding startup.
        quit.store (true, std::memory_order_release);
        commands.signalThreadShouldExit();
        audio.signalThreadShouldExit();
        mapping.signalInputReady();
        commands.stopThread (500);
        audio.stopThread (1500);
        return 71;
    }

    while (! quit.load (std::memory_order_acquire) && ! audio.processorFailed()
           && parent.isAlive())
    {
        // One turn is meant to be about 20 ms. A turn that takes much longer is one message
        // handler — a plug-in window painting, most likely — holding the thread, and its
        // length is what Hostage's log needs to know.
        const auto started = juce::Time::getMillisecondCounterHiRes();
        juce::MessageManager::getInstance()->runDispatchLoopUntil (20);
        const auto took = static_cast<int> (juce::Time::getMillisecondCounterHiRes() - started);
        if (took > longestDispatchMs.load (std::memory_order_relaxed))
            longestDispatchMs.store (took, std::memory_order_relaxed);
    }

    quit.store (true, std::memory_order_release);
    commands.signalThreadShouldExit();
    audio.signalThreadShouldExit();
    mapping.signalInputReady();

    // A control request may already be waiting in callSync when audio failure or parent death
    // starts shutdown. Keep the message queue alive briefly so that request can unwind while all
    // of its referenced objects still exist; stopping dispatch first would strand the control
    // thread inside a synchronous message-thread call.
    const auto controlDeadline = juce::Time::getMillisecondCounterHiRes() + 1500.0;
    while (commands.isThreadRunning()
           && juce::Time::getMillisecondCounterHiRes() < controlDeadline)
        juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    commands.stopThread (100);
    audio.stopThread (1500);
    editor.destroyNow();    // message thread, and the loop is over: release the parked editor
    {
        const juce::ScopedLock lock (processor->getCallbackLock());
        processor->releaseResources();
    }
    return audio.processorFailed() ? 72 : 0;
}
