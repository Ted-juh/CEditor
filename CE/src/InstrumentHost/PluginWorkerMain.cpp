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
    // Hostage needs this to hand the foreground to this process before the editor opens:
    // Windows only lets the foreground owner grant it, and only to a named process or all.
#if JUCE_WINDOWS
    object->setProperty ("pid", static_cast<juce::int64> (GetCurrentProcessId()));
#else
    object->setProperty ("pid", 0);
#endif
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
        while (inspected < static_cast<size_t> (parameters.size())
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

    /** Shows the vendor editor in this process's own top-level window.

        `anchor` is where Hostage would have put a window of its own — its remembered bounds
        for the part, or nothing. It is honoured when the window is first created and ignored
        once it exists: by then the user may have moved it, and a button that snaps a window
        back to where it started is a button people learn not to press. Between a close and
        the next open this process remembers the last position itself, which outranks the
        anchor for the same reason.

        Bringing the window forward only works because Hostage granted the foreground to this
        process before asking (AllowSetForegroundWindow, on the proxy side). Without that grant
        Windows ignores toFront from a background process and the editor opens behind the host
        — which is where every vendor editor went until the grant existed.

        The window's bounds come back so Hostage can remember them as it does its own. */
    bool open (juce::Rectangle<int> anchor, juce::Rectangle<int>& boundsOut)
    {
        if (window == nullptr)
        {
            auto* editor = processor.createEditorIfNeeded();
            if (editor == nullptr)
                return false;

            class Window final : public juce::DocumentWindow
            {
            public:
                Window (const juce::String& title, juce::AudioProcessorEditor* editorToOwn)
                    : juce::DocumentWindow (title, juce::Colour (0xff171a1d),
                                            juce::DocumentWindow::allButtons, true)
                {
                    setUsingNativeTitleBar (true);
                    setContentOwned (editorToOwn, true);
                    centreWithSize (juce::jmax (320, editorToOwn->getWidth()),
                                    juce::jmax (120, editorToOwn->getHeight()));
                    setResizable (true, false);
                }
                // Hide, never destroy: the editor's state and position survive, and the
                // host's button brings it back. Hostage owns the window's life through
                // editorClose; this button only owns whether it is on screen.
                void closeButtonPressed() override { setVisible (false); }
            };

            window = std::make_unique<Window> (processor.getName(), editor);

            // Position precedence: where this process last had it, then where Hostage asks,
            // then centred (what centreWithSize already did). Constrained so a position
            // remembered from a monitor that is no longer there cannot put it out of reach.
            const auto position = ! lastBounds.isEmpty() ? lastBounds.getPosition()
                                : ! anchor.isEmpty()     ? anchor.getPosition()
                                                         : window->getPosition();
            window->setBoundsConstrained (window->getBounds().withPosition (position));
        }

        window->setVisible (true);
        window->toFront (true);
        boundsOut = window->getBounds();
        return true;
    }

    void close()
    {
        if (window != nullptr)
            lastBounds = window->getBounds();
        window.reset();
    }

private:
    juce::AudioProcessor& processor;
    std::unique_ptr<juce::DocumentWindow> window;
    juce::Rectangle<int> lastBounds;
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
                    invokeProcessor ([&] { processor.getStateInformation (reply.payload); });
                    if (reply.payload.getSize() > maxPayloadBytes)
                        reply = errorReply (generation, received.message.requestId,
                                            "plug-in state exceeds the 64 MiB worker limit");
                    else
                        reply.type = MessageType::stateReply;
                }
                else if (received.message.type == MessageType::setParameter)
                {
                    juce::String jsonError;
                    const auto json = decodeJsonPayload (received.message, jsonError);
                    const auto* values = json.getArray();
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
                        });
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
                        invokeProcessor ([&]
                        {
                            formatted = parameters[index]->getText (value, maximumLength);
                        });
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
                        });
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
                    invokeProcessor ([&] { processor.setNonRealtime (nonRealtime); });
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
                    // The payload is optional and so is everything in it: an empty message
                    // is the pre-anchor request and still opens the editor, centred.
                    juce::String jsonError;
                    const auto json = decodeJsonPayload (received.message, jsonError);
                    juce::Rectangle<int> anchor;
                    if (jsonError.isEmpty() && json.isObject())
                        anchor = { (int) json.getProperty ("x", 0), (int) json.getProperty ("y", 0),
                                   (int) json.getProperty ("width", 0),
                                   (int) json.getProperty ("height", 0) };
                    juce::Rectangle<int> bounds;
                    bool opened = false;
                    invokeProcessor ([&] { opened = editor.open (anchor, bounds); });
                    if (! opened)
                        reply = errorReply (generation, received.message.requestId,
                                            "plug-in did not create a vendor editor");
                    else
                    {
                        auto* object = new juce::DynamicObject();
                        object->setProperty ("x", bounds.getX());
                        object->setProperty ("y", bounds.getY());
                        object->setProperty ("width", bounds.getWidth());
                        object->setProperty ("height", bounds.getHeight());
                        reply = makeJsonMessage (MessageType::editorOpen, generation,
                                                 received.message.requestId, juce::var (object));
                    }
                }
                else if (received.message.type == MessageType::editorClose)
                {
                    invokeProcessor ([&] { editor.close(); });
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
    template <typename Function>
    void invokeProcessor (Function&& function)
    {
        std::exception_ptr thrown;
        const auto invoked = juce::MessageManager::callSync (
            [this, function = std::forward<Function> (function), &thrown]() mutable
            {
                try
                {
                    const juce::ScopedLock lock (processor.getCallbackLock());
                    function();
                }
                catch (...)
                {
                    thrown = std::current_exception();
                }
            });
        if (! invoked)
            throw std::runtime_error ("worker message thread is unavailable");
        if (thrown)
            std::rethrow_exception (thrown);
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
        juce::MessageManager::getInstance()->runDispatchLoopUntil (20);

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
    editor.close();
    {
        const juce::ScopedLock lock (processor->getCallbackLock());
        processor->releaseResources();
    }
    return audio.processorFailed() ? 72 : 0;
}
