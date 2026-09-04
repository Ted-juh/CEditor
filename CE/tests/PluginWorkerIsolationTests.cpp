#include "InstrumentHost/IsolatedPluginProxy.h"
#include "InstrumentHost/InstrumentRackHost.h"
#include "InstrumentHost/PluginWorkerCrashDumps.h"
#include "StubSynthProcessor.h"
#include <juce_cryptography/juce_cryptography.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <atomic>
#include <cmath>
#include <cstring>
#include <iostream>

namespace
{
int failures = 0;

void check (bool condition, const char* label)
{
    std::cout << (condition ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! condition)
        ++failures;
}

juce::String descriptionXml (const juce::String& name)
{
    juce::PluginDescription description;
    description.name = name;
    description.pluginFormatName = "VST3";
    description.fileOrIdentifier = "C:\\fixture\\" + name + ".vst3";
    description.uniqueId = name.hashCode();
    description.isInstrument = name.contains ("Instrument");
    description.numInputChannels = 2;
    description.numOutputChannels = 2;
    const auto xml = description.createXml();
    return xml != nullptr ? xml->toString() : juce::String();
}

const juce::File& testDataDirectory()
{
    static const auto directory = []
    {
        auto result = juce::File::getSpecialLocation (juce::File::tempDirectory)
                          .getChildFile ("hostage-isolation-tests-"
                                        + juce::Uuid().toString().removeCharacters ("-"));
        result.createDirectory();
        return result;
    }();
    return directory;
}

std::unique_ptr<juce::AudioProcessor> launch (const juce::File& stub, const juce::String& mode,
                                              juce::String& error)
{
    std::unique_ptr<juce::AudioProcessor> result;
    std::atomic<bool> finished { false };
    const auto staging = testDataDirectory().getChildFile ("worker-staging");
    ceditor::host::IsolatedPluginProxy::launchAsync (
        stub, staging, descriptionXml (mode), 48'000.0, 16,
        [&] (std::unique_ptr<juce::AudioProcessor> processor, const juce::String& launchError)
        {
            result = std::move (processor);
            error = launchError;
            finished.store (true, std::memory_order_release);
        });

    const auto deadline = juce::Time::getMillisecondCounter() + 10'000;
    while (! finished.load (std::memory_order_acquire)
           && juce::Time::getMillisecondCounter() < deadline)
        juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
    if (! finished.load (std::memory_order_acquire))
        error = "worker launch callback timed out";
    return result;
}

juce::AudioBuffer<float> audio (float value, int frames = 16)
{
    juce::AudioBuffer<float> result (2, frames);
    for (int channel = 0; channel < result.getNumChannels(); ++channel)
        for (int frame = 0; frame < result.getNumSamples(); ++frame)
            result.setSample (channel, frame, value);
    return result;
}

void testSupportedBlockSizeSoak (const juce::File& stub)
{
    std::cout << "\nrepresentative supported block sizes" << std::endl;
    juce::String error;
    auto processor = launch (stub, "NormalStub", error);
    check (processor != nullptr && error.isEmpty(),
           "the block-size soak fixture completes its worker handshake");
    if (processor == nullptr)
        return;

    constexpr int sizes[] { 16, 64, 128, 256, 512, 1024, 2048, 4096, 8192 };
    bool allProcessed = true;
    int processedBlocks = 0;
    try
    {
        for (const auto frames : sizes)
        {
            processor->prepareToPlay (48'000.0, frames);
            auto previousValue = 0.2f;
            auto warmup = audio (previousValue, frames);
            juce::MidiBuffer midi;
            processor->processBlock (warmup, midi);
            juce::Thread::sleep (20);

            // Twelve blocks per size is long enough to exercise slot reuse repeatedly without
            // turning this correctness fixture into a wall-clock performance benchmark.
            for (int iteration = 0; iteration < 12; ++iteration)
            {
                const auto inputValue = 0.25f + static_cast<float> (iteration) * 0.01f;
                auto block = audio (inputValue, frames);
                midi.clear();
                processor->processBlock (block, midi);
                allProcessed = allProcessed
                    && block.getNumSamples() == frames
                    && std::abs (block.getSample (0, frames - 1) - previousValue * 0.5f) < 0.0001f;
                ++processedBlocks;
                previousValue = inputValue;
                juce::Thread::sleep (20);
            }
        }
    }
    catch (const std::exception&)
    {
        allProcessed = false;
    }

    check (allProcessed && processedBlocks == 108,
           "all nine supported block sizes repeatedly cross the one-block worker pipeline");
    processor->releaseResources();
}

void testNormalWorker (const juce::File& stub)
{
    std::cout << "\nnormal isolated worker" << std::endl;
    juce::String error;
    auto processor = launch (stub, "NormalStub", error);
    check (processor != nullptr && error.isEmpty(),
           "proxy completes the handshake only after the stub joins its Windows worker job");
    if (processor == nullptr)
        return;

    processor->prepareToPlay (48'000.0, 16);
    check (processor->getLatencySamples() == 16,
           "proxy reports its explicit one-block transport latency");
    processor->prepareToPlay (48'000.0, 8192);
    check (processor->getLatencySamples() == 8192,
           "an existing worker survives a later supported host block-size increase");
    processor->prepareToPlay (48'000.0, 16);
    check (processor->getNumPrograms() == 2 && processor->getProgramName (1) == "Wide",
           "worker program names remain available to preset browsing");
    processor->setCurrentProgram (1);
    check (processor->getCurrentProgram() == 1,
           "program selection crosses the worker control plane");
    processor->changeProgramName (1, "Wider");
    check (processor->getProgramName (1) == "Wider",
           "program renames remain visible through the proxy");
    auto* gain = processor->getParameters()[0];
    check (gain->getText (0.5f, 32) == "-6 dB"
             && std::abs (gain->getValueForText ("-12 dB") - 0.25f) < 0.0001f,
           "parameter display text and typed units are interpreted by the worker plug-in");
    auto first = audio (0.4f);
    juce::MidiBuffer midi;
    midi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 3);
    processor->processBlock (first, midi);
    juce::Thread::sleep (30);
    auto second = audio (0.8f);
    midi.clear();
    processor->processBlock (second, midi);
    check (std::abs (second.getSample (0, 0) - 0.2f) < 0.0001f,
           "the next callback receives worker-processed audio");
    check (midi.getNumEvents() == 1 && (*midi.begin()).samplePosition == 3,
           "worker MIDI returns in the matching delayed block");

    juce::MemoryBlock state;
    processor->getStateInformation (state);
    check (state.getSize() == 10, "state round-trips over the control plane");
    const char changed[] = "new-state";
    processor->setStateInformation (changed, 9);
    check (std::abs (gain->getValue() - 0.75f) < 0.0001f,
           "state restore immediately refreshes the proxy's parameter mirror");
    check (processor->getCurrentProgram() == 0,
           "state restore immediately refreshes the proxy's current program");
    processor->getStateInformation (state);
    check (state.getSize() == 9, "state replacement reaches the worker instance");
    processor->releaseResources();
}

void testLargeParameterInventory (const juce::File& stub)
{
    std::cout << "\nlarge parameter inventory" << std::endl;
    juce::String error;
    auto processor = launch (stub, "LargeParameterStub", error);
    check (processor != nullptr && error.isEmpty(),
           "a plug-in may expose more parameters than one block can transport");
    if (processor == nullptr)
        return;
    check (processor->getParameters().size()
             == static_cast<int> (
                 ceditor::host::plugin_worker::maxParameterEventsPerBlock + 1),
           "the proxy retains the complete parameter inventory");
}

void testDeadWorker (const juce::File& stub, const juce::String& mode, const char* label)
{
    std::cout << "\n" << label << std::endl;
    juce::String error;
    auto processor = launch (stub, mode, error);
    check (processor != nullptr && error.isEmpty(), "failure fixture completes its handshake");
    if (processor == nullptr)
        return;
    processor->prepareToPlay (48'000.0, 16);
    juce::MidiBuffer midi;
    bool threw = false;
    try
    {
        auto first = audio (0.2f);
        processor->processBlock (first, midi);
        juce::Thread::sleep (40);
        auto second = audio (0.3f);
        processor->processBlock (second, midi);
        auto third = audio (0.4f);
        processor->processBlock (third, midi);
    }
    catch (const std::exception&)
    {
        threw = true;
    }
    check (threw, "the proxy turns process death/deadline loss into a rack failure edge");
}

void testUnhandledWorkerCreatesMinidump (const juce::File& stub)
{
    std::cout << "\nunhandled worker fault creates a bounded minidump" << std::endl;
    const auto before = ceditor::host::plugin_worker::PluginWorkerCrashDumps::supportFiles (
        testDataDirectory());
    const auto metadataBefore =
        ceditor::host::plugin_worker::PluginWorkerCrashDumps::supportMetadataFiles (
            testDataDirectory());

    juce::String error;
    auto processor = launch (stub, "AccessViolationStub", error);
    check (processor != nullptr && error.isEmpty(),
           "the access-violation fixture handshakes after installing its crash reporter");
    if (processor == nullptr)
        return;

    processor->prepareToPlay (48'000.0, 16);
    juce::MidiBuffer midi;
    try
    {
        auto first = audio (0.2f);
        processor->processBlock (first, midi);
        juce::Thread::sleep (100);
        auto second = audio (0.3f);
        processor->processBlock (second, midi);
        auto third = audio (0.4f);
        processor->processBlock (third, midi);
    }
    catch (const std::exception&)
    {
        // The proxy's failure edge is covered separately; this fixture is about the dump bytes.
    }

    auto dumps = ceditor::host::plugin_worker::PluginWorkerCrashDumps::supportFiles (
        testDataDirectory());
    auto metadataFiles =
        ceditor::host::plugin_worker::PluginWorkerCrashDumps::supportMetadataFiles (
            testDataDirectory());
    const auto deadline = juce::Time::getMillisecondCounter() + 2000;
    while ((dumps.size() <= before.size() || metadataFiles.size() <= metadataBefore.size())
           && juce::Time::getMillisecondCounter() < deadline)
    {
        juce::Thread::sleep (10);
        dumps = ceditor::host::plugin_worker::PluginWorkerCrashDumps::supportFiles (
            testDataDirectory());
        metadataFiles =
            ceditor::host::plugin_worker::PluginWorkerCrashDumps::supportMetadataFiles (
                testDataDirectory());
    }

    bool hasMinidumpSignature = false;
    for (const auto& dump : dumps)
    {
        juce::MemoryBlock header;
        if (dump.loadFileAsData (header) && header.getSize() >= 4)
            hasMinidumpSignature = std::memcmp (header.getData(), "MDMP", 4) == 0;
        if (hasMinidumpSignature)
            break;
    }
    check (dumps.size() > before.size() && dumps.size() <=
             ceditor::host::plugin_worker::PluginWorkerCrashDumps::slotCount,
           "an unhandled native fault creates one file inside the fixed eight-slot ring");
    check (hasMinidumpSignature, "the captured file has the Windows minidump signature");
    const auto expectedWorkerHash = juce::SHA256 (stub).toHexString();
    bool hasMatchingWorkerHash = false;
    for (const auto& metadata : metadataFiles)
        hasMatchingWorkerHash = hasMatchingWorkerHash
            || metadata.loadFileAsString().contains (expectedWorkerHash);
    check (metadataFiles.size() > metadataBefore.size()
             && metadataFiles.size() <=
                  ceditor::host::plugin_worker::PluginWorkerCrashDumps::slotCount
             && hasMatchingWorkerHash,
           "the bounded sidecar identifies the exact worker executable for symbol lookup");
}

void testRackSurvivesWorkerDeath (const juce::File& stub)
{
    std::cout << "\nrack survives isolated worker death" << std::endl;
    juce::String error;
    auto crashedProcessor = launch (stub, "CrashStub", error);
    check (crashedProcessor != nullptr, "crash fixture is available to the real rack");
    if (crashedProcessor == nullptr)
        return;

    ceditor::host::InstrumentRackHost rack;
    rack.prepare (48'000.0, 16);
    const auto broken = rack.addPart();
    const auto healthy = rack.addPart();
    auto healthyProcessor = std::make_unique<ceditor::test::StubSynthProcessor> (0.25f);
    check (rack.commitLoad (broken, rack.beginLoad (broken), std::move (crashedProcessor),
                            { "crash-worker", {}, "Crash Worker", "Test" })
             && rack.commitLoad (healthy, rack.beginLoad (healthy),
                                 std::move (healthyProcessor),
                                 { "healthy", {}, "Healthy", "Test" }),
           "isolated and healthy processors commit through normal generation tickets");

    juce::AudioBuffer<float> buffer (2, 16);
    juce::MidiBuffer midi;
    midi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
    buffer.clear();
    rack.getGraph().processBlock (buffer, midi);
    juce::Thread::sleep (40);
    for (int block = 0; block < 3; ++block)
    {
        buffer.clear();
        midi.clear();
        rack.getGraph().processBlock (buffer, midi);
    }

    const auto incidents = rack.takeProcessorFailures();
    check (incidents.size() == 1 && incidents[0].targetId == broken,
           "worker death emerges as the rack's existing named failure incident");
    check (buffer.getMagnitude (0, buffer.getNumSamples()) > 0.1f,
           "the healthy part continues sounding while the failed part is silent");
}

void testInstrumentWithInputFailsSilent (const juce::File& stub)
{
    std::cout << "\ninstrument with input fails silent" << std::endl;
    juce::String error;
    auto processor = launch (stub, "CrashStubInstrumentWithInput", error);
    check (processor != nullptr && error.isEmpty(),
           "sidechain-instrument fixture completes its handshake");
    if (processor == nullptr)
        return;

    processor->prepareToPlay (48'000.0, 16);
    juce::MidiBuffer midi;
    auto first = audio (0.2f);
    processor->processBlock (first, midi);
    juce::Thread::sleep (40);
    auto second = audio (0.3f);
    processor->processBlock (second, midi);
    auto failed = audio (0.4f);
    bool threw = false;
    try
    {
        processor->processBlock (failed, midi);
    }
    catch (const std::exception&)
    {
        threw = true;
    }
    check (threw && failed.getMagnitude (0, failed.getNumSamples()) < 0.0001f,
           "an instrument stays silent on failure even when its topology has an input");
}

void testRackDetectsIdleWorkerDeath (const juce::File& stub)
{
    std::cout << "\nidle worker death" << std::endl;
    juce::String error;
    auto processor = launch (stub, "ExitIdleStub", error);
    check (processor != nullptr && error.isEmpty(), "idle-exit worker completes its handshake");
    if (processor == nullptr)
        return;
    processor->prepareToPlay (48'000.0, 16);

    ceditor::host::InstrumentRackHost rack;
    rack.prepare (48'000.0, 16);
    const auto part = rack.addPart();
    check (rack.commitLoad (part, rack.beginLoad (part), std::move (processor),
                            { "idle-worker", {}, "Idle Worker", "Test" }),
           "idle-exit proxy commits through the ordinary rack path");
    juce::Thread::sleep (1100);
    const auto incidents = rack.takeProcessorFailures();
    check (incidents.size() == 1 && incidents[0].targetId == part,
           "control-thread liveness detects process death without an audio callback");
}
} // namespace

int main (int argc, char* argv[])
{
    juce::ScopedJuceInitialiser_GUI juceInitialiser;
    if (argc != 2)
        return 64;
    const juce::File stub (juce::String::fromUTF8 (argv[1]));
    testNormalWorker (stub);
    testLargeParameterInventory (stub);
    testSupportedBlockSizeSoak (stub);
    testDeadWorker (stub, "CrashStub", "crashed worker");
    testUnhandledWorkerCreatesMinidump (stub);
    testDeadWorker (stub, "HangStub", "hung worker");
    testRackSurvivesWorkerDeath (stub);
    testInstrumentWithInputFailsSilent (stub);
    testRackDetectsIdleWorkerDeath (stub);
    testDataDirectory().deleteRecursively();
    std::cout << "\n" << failures << " failure(s)" << std::endl;
    return failures == 0 ? 0 : 1;
}
