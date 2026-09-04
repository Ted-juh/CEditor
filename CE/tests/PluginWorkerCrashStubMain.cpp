// Process-level fixture for IsolatedPluginProxy. The staged description name selects behavior:
// NormalStub halves audio, CrashStub exits on its first block, HangStub stops responding, and
// ExitIdleStub dies after setup without requiring the host transport to run.

#include "InstrumentHost/PluginWorkerControlChannel.h"
#include "InstrumentHost/PluginWorkerCrashReporter.h"
#include "InstrumentHost/PluginWorkerJob.h"
#include "InstrumentHost/PluginWorkerSharedMemory.h"
#include <juce_audio_basics/juce_audio_basics.h>
#include <algorithm>
#include <atomic>
#include <cstring>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #include <windows.h>
#endif

namespace
{
using namespace ceditor::host::plugin_worker;

juce::var parameterValues (float gain)
{
    juce::Array<juce::var> values;
    values.add (gain);
    return juce::var (values);
}

juce::var processorSnapshot (float gain, int currentProgram)
{
    auto* result = new juce::DynamicObject();
    result->setProperty ("currentProgram", currentProgram);
    result->setProperty ("parameters", parameterValues (gain));
    return juce::var (result);
}

juce::var metadata (float gain, bool crashDumpsAvailable,
                    const juce::String& crashDumpError,
                    const juce::String& workerBuildSha256,
                    int parameterCount = 1)
{
    juce::Array<juce::var> parameters;
    parameters.ensureStorageAllocated (parameterCount);
    for (int index = 0; index < parameterCount; ++index)
    {
        auto* parameter = new juce::DynamicObject();
        parameter->setProperty ("index", index);
        parameter->setProperty ("id", index == 0 ? juce::String ("gain")
                                                   : "parameter-" + juce::String (index));
        parameter->setProperty ("name", index == 0 ? juce::String ("Gain")
                                                     : "Parameter " + juce::String (index));
        parameter->setProperty ("label", "");
        parameter->setProperty ("value", gain);
        parameter->setProperty ("defaultValue", 0.5);
        parameter->setProperty ("steps", 0x7fffffff);
        parameter->setProperty ("discrete", false);
        parameter->setProperty ("automatable", true);
        parameters.add (juce::var (parameter));
    }

    auto* object = new juce::DynamicObject();
    object->setProperty ("ok", true);
    object->setProperty ("name", "Isolation test effect");
    object->setProperty ("inputs", 2);
    object->setProperty ("outputs", 2);
    object->setProperty ("acceptsMidi", true);
    object->setProperty ("producesMidi", true);
    object->setProperty ("midiEffect", false);
    object->setProperty ("hasEditor", false);
    object->setProperty ("latencySamples", 0);
    object->setProperty ("tailSeconds", 0.0);
    object->setProperty ("doublePrecision", true);
    object->setProperty ("currentProgram", 0);
    object->setProperty ("crashDumpsAvailable", crashDumpsAvailable);
    object->setProperty ("crashDumpError", crashDumpError);
    object->setProperty ("workerBuildSha256", workerBuildSha256);
    juce::Array<juce::var> programNames;
    programNames.add ("Init");
    programNames.add ("Wide");
    object->setProperty ("programNames", programNames);
    object->setProperty ("parameters", parameters);
    return juce::var (object);
}

bool replyToControl (PluginWorkerControlChannel& control, juce::uint32 generation,
                     juce::MemoryBlock& state, float& gain, int& currentProgram, bool& quit)
{
    const auto received = control.receive (2);
    if (! received)
        return true;
    Message reply;
    reply.type = received.message.type;
    reply.generation = generation;
    reply.requestId = received.message.requestId;
    if (received.message.type == MessageType::getState)
    {
        reply.type = MessageType::stateReply;
        reply.payload = state;
    }
    else if (received.message.type == MessageType::setParameter)
    {
        juce::String jsonError;
        const auto json = decodeJsonPayload (received.message, jsonError);
        if (const auto* values = json.getArray(); jsonError.isEmpty()
            && values != nullptr && values->size() == 1)
            gain = juce::jlimit (0.0f, 1.0f,
                static_cast<float> (static_cast<double> (values->getReference (0))));
        reply = makeJsonMessage (MessageType::setParameter, generation,
                                 received.message.requestId,
                                 processorSnapshot (gain, currentProgram));
    }
    else if (received.message.type == MessageType::parameterText)
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("text", "-6 dB");
        reply = makeJsonMessage (MessageType::parameterText, generation,
                                 received.message.requestId, juce::var (object));
    }
    else if (received.message.type == MessageType::parameterValueFromText)
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("value", 0.25);
        reply = makeJsonMessage (MessageType::parameterValueFromText, generation,
                                 received.message.requestId, juce::var (object));
    }
    else if (received.message.type == MessageType::setState)
    {
        state = received.message.payload;
        if (state.getSize() == 9 && std::memcmp (state.getData(), "new-state", 9) == 0)
        {
            gain = 0.75f;
            currentProgram = 0;
        }
        reply = makeJsonMessage (MessageType::setState, generation,
                                 received.message.requestId,
                                 processorSnapshot (gain, currentProgram));
    }
    else if (received.message.type == MessageType::setProgram)
    {
        juce::String jsonError;
        const auto json = decodeJsonPayload (received.message, jsonError);
        if (jsonError.isEmpty())
            currentProgram = juce::jlimit (0, 1, (int) json.getProperty ("index", 0));
        reply = makeJsonMessage (MessageType::setProgram, generation,
                                 received.message.requestId,
                                 processorSnapshot (gain, currentProgram));
    }
    else if (received.message.type == MessageType::reset
             || received.message.type == MessageType::applyVstPreset)
        reply = makeJsonMessage (received.message.type, generation,
                                 received.message.requestId,
                                 processorSnapshot (gain, currentProgram));
    else if (received.message.type == MessageType::shutdown)
        quit = true;
    juce::String error;
    return control.send (reply, 500, error);
}
} // namespace

int main (int argc, char* argv[])
{
#if ! JUCE_WINDOWS
    juce::ignoreUnused (argc, argv);
    return 77;
#else
    if (argc != 15 || juce::String (argv[1]) != "--run")
        return 64;
    const auto generation = static_cast<juce::uint32> (juce::String (argv[2]).getLargeIntValue());
    SharedMemoryNames names { juce::String::fromUTF8 (argv[3]),
                              juce::String::fromUTF8 (argv[4]),
                              juce::String::fromUTF8 (argv[5]),
                              juce::String::fromUTF8 (argv[6]) };
    const auto descriptionText = juce::File (juce::String::fromUTF8 (argv[7])).loadFileAsString();
    const bool crash = descriptionText.contains ("CrashStub");
    const bool accessViolation = descriptionText.contains ("AccessViolationStub");
    const bool hang = descriptionText.contains ("HangStub");
    const bool exitIdle = descriptionText.contains ("ExitIdleStub");
    const bool largeParameterInventory = descriptionText.contains ("LargeParameterStub");
    const auto workerBuildSha256 = juce::String::fromUTF8 (argv[13]).toLowerCase();

    SharedDataPlaneMapping mapping;
    PluginWorkerControlChannel control;
    juce::String error;
    if (! mapping.openWorker (names, error) || ! control.openWorker (names.controlPipe, error))
        return 65;
    if (! PluginWorkerJob::joinCurrentProcess (juce::String::fromUTF8 (argv[11]), error))
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("ok", false);
        object->setProperty ("error", error);
        control.send (makeJsonMessage (MessageType::error, generation, 0, juce::var (object)),
                      1000, error);
        return 65;
    }
    PluginWorkerCrashReporter crashReporter;
    juce::String crashDumpError;
    const auto crashDumpsAvailable = crashReporter.install (
        juce::File (juce::String::fromUTF8 (argv[12])), generation,
        accessViolation ? juce::String ("AccessViolationStub")
                        : juce::String ("Isolation test effect"),
        workerBuildSha256, crashDumpError);
    float gain = 0.5f;
    int currentProgram = 0;
    if (! control.send (makeJsonMessage (MessageType::createReply, generation, 0,
                                         metadata (gain, crashDumpsAvailable, crashDumpError,
                                                   workerBuildSha256,
                                                   largeParameterInventory
                                                       ? static_cast<int> (
                                                           maxParameterEventsPerBlock + 1)
                                                       : 1)),
                        2000, error))
        return 66;

    juce::MemoryBlock state;
    state.append ("stub-state", 10);
    bool quit = false;
    const auto idleExitDeadline = juce::Time::getMillisecondCounterHiRes() + 1000.0;
    while (! quit)
    {
        if (exitIdle && juce::Time::getMillisecondCounterHiRes() >= idleExitDeadline)
            return 98;
        if (! replyToControl (control, generation, state, gain, currentProgram, quit))
            return 67;
        if (mapping.waitForInput (2) != WaitResult::signalled)
            continue;
        std::atomic_thread_fence (std::memory_order_acquire);
        const auto plane = mapping.dataPlane();
        const auto sequence = plane.getHeader()->latestInputSequence.load (
            std::memory_order_acquire);
        const auto block = plane.slotForSequence (sequence);
        auto* header = block.getHeader();
        if (header == nullptr
            || header->inputSequence.load (std::memory_order_acquire) != sequence)
            return 68;
        if (crash)
            return 99;
        if (accessViolation)
        {
            RaiseException (EXCEPTION_ACCESS_VIOLATION, EXCEPTION_NONCONTINUABLE, 0, nullptr);
            return 100;
        }
        if (hang)
            Sleep (INFINITE);

        for (juce::uint32 channel = 0; channel < header->numOutputChannels; ++channel)
            for (juce::uint32 frame = 0; frame < header->numFrames; ++frame)
                block.outputChannel (channel)[frame]
                    = channel < header->numInputChannels ? block.inputChannel (channel)[frame] * 0.5
                                                         : 0.0;
        std::copy_n (block.inputMidiCapacity().begin(), header->inputMidiBytes,
                     block.outputMidiCapacity().begin());
        header->outputParameterEvents = juce::jmin (header->inputParameterEvents,
                                                    plane.getHeader()->config.maxParameterEvents);
        std::copy_n (block.inputParameterCapacity().begin(), header->outputParameterEvents,
                     block.outputParameterCapacity().begin());
        block.finishOutput (sequence, header->inputMidiBytes, BlockStatus::processed);
        plane.getHeader()->latestOutputSequence.store (sequence, std::memory_order_release);
        std::atomic_thread_fence (std::memory_order_release);
        if (! mapping.signalOutputReady())
            return 69;
    }
    return 0;
#endif
}
