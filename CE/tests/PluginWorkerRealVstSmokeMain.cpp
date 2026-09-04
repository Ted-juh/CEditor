// Opt-in acceptance smoke for Hostage's real VST3 process boundary.
//
// This executable must never instantiate vendor code itself. It asks CEditorPluginScanner for
// one serialized PluginDescription, then gives that opaque XML to IsolatedPluginProxy. The real
// CEditorPluginWorker owns construction, preparation, processing and state calls. Keeping this
// outside CTest is intentional: a representative installed VST3, its licence state and any UI it
// opens are properties of the test machine rather than deterministic repository fixtures.

#include "InstrumentHost/IsolatedPluginProxy.h"
#include "InstrumentHost/PluginScannerCoordinator.h"
#include <juce_gui_basics/juce_gui_basics.h>
#include <atomic>
#include <iostream>
#include <memory>
#include <stdexcept>

namespace
{
constexpr double sampleRate = 48'000.0;
constexpr int blockSize = 256;
constexpr int blocksToProcess = 12;

struct SmokeResult
{
    bool passed = false;
    juce::String phase;
    juce::String detail;
    juce::String module;
    juce::String plugin;
    juce::String pluginId;
    bool instrument = false;
    bool acceptsMidi = false;
    int inputChannels = 0;
    int outputChannels = 0;
    int processedBlocks = 0;
    int stateBytes = 0;
    bool stateRestored = false;
};

int finish (const SmokeResult& result)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("ok", result.passed);
    object->setProperty ("phase", result.phase);
    object->setProperty ("detail", result.detail);
    object->setProperty ("module", result.module);
    object->setProperty ("plugin", result.plugin);
    object->setProperty ("pluginId", result.pluginId);
    object->setProperty ("instrument", result.instrument);
    object->setProperty ("acceptsMidi", result.acceptsMidi);
    object->setProperty ("inputChannels", result.inputChannels);
    object->setProperty ("outputChannels", result.outputChannels);
    object->setProperty ("sampleRate", sampleRate);
    object->setProperty ("blockSize", blockSize);
    object->setProperty ("processedBlocks", result.processedBlocks);
    object->setProperty ("stateBytes", result.stateBytes);
    object->setProperty ("stateRestored", result.stateRestored);

    std::cout << (result.passed ? "PASS  " : "FAIL  ") << result.detail << std::endl;
    // The final, single-line record is intentionally easy for a release script to capture.
    std::cout << "SMOKE_RESULT "
              << juce::JSON::toString (juce::var (object), true) << std::endl;
    return result.passed ? 0 : 1;
}

juce::String scanStatusName (ceditor::host::PluginScannerCoordinator::JobStatus status)
{
    using Status = ceditor::host::PluginScannerCoordinator::JobStatus;
    switch (status)
    {
        case Status::ok:            return "ok";
        case Status::timedOut:      return "timed out";
        case Status::crashed:       return "crashed";
        case Status::reportedError: return "reported an error";
        case Status::badOutput:     return "returned invalid output";
        case Status::launchFailed:  return "could not launch";
    }
    return "failed";
}

const ceditor::host::PluginClassRecord* chooseClass (
    const juce::Array<ceditor::host::PluginClassRecord>& classes,
    const juce::String& selector)
{
    if (selector.isNotEmpty())
        for (const auto& candidate : classes)
            if (candidate.ceId.equalsIgnoreCase (selector)
                || candidate.name.equalsIgnoreCase (selector))
                return &candidate;

    if (selector.isEmpty())
    {
        for (const auto& candidate : classes)
            if (candidate.isInstrument)
                return &candidate;
        if (! classes.isEmpty())
            return &classes.getReference (0);
    }
    return nullptr;
}

struct AsyncLaunch
{
    std::atomic<bool> finished { false };
    std::unique_ptr<juce::AudioProcessor> processor;
    juce::String error;
};

std::unique_ptr<juce::AudioProcessor> launchProxy (const juce::File& worker,
                                                   const juce::File& staging,
                                                   const juce::String& descriptionXml,
                                                   juce::String& error)
{
    auto launch = std::make_shared<AsyncLaunch>();
    ceditor::host::IsolatedPluginProxy::launchAsync (
        worker, staging, descriptionXml, sampleRate, blockSize,
        [launch] (std::unique_ptr<juce::AudioProcessor> processor,
                  const juce::String& launchError)
        {
            launch->processor = std::move (processor);
            launch->error = launchError;
            launch->finished.store (true, std::memory_order_release);
        });

    const auto deadline = juce::Time::getMillisecondCounter() + 30'000;
    while (! launch->finished.load (std::memory_order_acquire)
           && juce::Time::getMillisecondCounter() < deadline)
        juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    if (! launch->finished.load (std::memory_order_acquire))
    {
        error = "worker launch callback did not complete within 30 seconds";
        return {};
    }
    error = launch->error;
    return std::move (launch->processor);
}
} // namespace

int main (int argc, char* argv[])
{
    juce::ScopedJuceInitialiser_GUI juceInit;
    SmokeResult result;
    result.phase = "arguments";

    if (argc != 4 && argc != 5)
    {
        result.detail = "usage: CEditorPluginWorkerRealVstSmoke <scanner.exe> <worker.exe> "
                        "<plugin.vst3> [exact-class-name-or-id]";
        return finish (result);
    }

    const juce::File scanner (juce::String::fromUTF8 (argv[1]));
    const juce::File worker (juce::String::fromUTF8 (argv[2]));
    const juce::File module (juce::String::fromUTF8 (argv[3]));
    const auto selector = argc == 5 ? juce::String::fromUTF8 (argv[4]) : juce::String();
    result.module = module.getFullPathName();

    if (! scanner.existsAsFile())
    {
        result.detail = "scanner executable does not exist: " + scanner.getFullPathName();
        return finish (result);
    }
    if (! worker.existsAsFile())
    {
        result.detail = "live worker executable does not exist: " + worker.getFullPathName();
        return finish (result);
    }
    if (! (module.existsAsFile() || module.isDirectory()))
    {
        result.detail = "VST3 module does not exist: " + module.getFullPathName();
        return finish (result);
    }

    const auto workspace = juce::File::getSpecialLocation (juce::File::tempDirectory)
        .getChildFile ("hostage-real-vst-smoke-" + juce::Uuid().toString().removeCharacters ("-"));
    if (! workspace.createDirectory())
    {
        result.detail = "could not create isolated smoke workspace: " + workspace.getFullPathName();
        return finish (result);
    }

    result.phase = "scan";
    ceditor::host::PluginScannerCoordinator scannerCoordinator ({
        scanner,
        workspace.getChildFile ("scanner"),
        60'000,
        1,
        [] (const juce::String& line) { std::cout << "SCAN  " << line << std::endl; },
        {}
    });
    const auto scan = scannerCoordinator.runOneJob (module.getFullPathName());
    if (scan.status != ceditor::host::PluginScannerCoordinator::JobStatus::ok)
    {
        result.detail = "scanner " + scanStatusName (scan.status) + ": " + scan.detail;
        std::cout << "Workspace retained for diagnosis: " << workspace.getFullPathName() << std::endl;
        return finish (result);
    }

    const auto* selected = chooseClass (scan.result.classes, selector);
    if (selected == nullptr)
    {
        result.detail = selector.isEmpty()
            ? "scanner returned no plug-in classes"
            : "scanner returned no exact class name or id matching: " + selector;
        std::cout << "Workspace retained for diagnosis: " << workspace.getFullPathName() << std::endl;
        return finish (result);
    }
    result.plugin = selected->name;
    result.pluginId = selected->ceId;
    result.instrument = selected->isInstrument;
    std::cout << "CLASS " << selected->name << " (" << selected->ceId << ")" << std::endl;

    result.phase = "worker launch";
    juce::String launchError;
    auto processor = launchProxy (worker, workspace.getChildFile ("worker-staging"),
                                  selected->descriptionXml, launchError);
    if (processor == nullptr)
    {
        result.detail = launchError.isNotEmpty() ? launchError : "live worker returned no processor";
        std::cout << "Workspace retained for diagnosis: " << workspace.getFullPathName() << std::endl;
        return finish (result);
    }

    auto* isolated = dynamic_cast<ceditor::host::IsolatedPluginProxy*> (processor.get());
    if (isolated == nullptr || ! isolated->workerIsRunning())
    {
        result.detail = "isolated proxy did not retain a running worker after its handshake";
        std::cout << "Workspace retained for diagnosis: " << workspace.getFullPathName() << std::endl;
        return finish (result);
    }

    result.acceptsMidi = processor->acceptsMidi();
    result.inputChannels = processor->getTotalNumInputChannels();
    result.outputChannels = processor->getTotalNumOutputChannels();

    try
    {
        result.phase = "prepare";
        processor->prepareToPlay (sampleRate, blockSize);

        result.phase = "audio and MIDI";
        const auto channels = juce::jmax (1, result.inputChannels, result.outputChannels);
        juce::AudioBuffer<float> audio (channels, blockSize);
        juce::MidiBuffer midi;
        for (int block = 0; block < blocksToProcess; ++block)
        {
            audio.clear();
            midi.clear();
            if (result.acceptsMidi && block == 0)
                midi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 96), 0);
            if (result.acceptsMidi && block == blocksToProcess / 2)
                midi.addEvent (juce::MidiMessage::noteOff (1, 60), 0);
            processor->processBlock (audio, midi);
            ++result.processedBlocks;
            juce::Thread::sleep (10); // allow the fixed one-block pipeline to publish its reply
        }
        if (! isolated->workerIsRunning())
            throw std::runtime_error ("worker stopped during representative block processing");

        result.phase = "state";
        juce::MemoryBlock state;
        processor->getStateInformation (state);
        result.stateBytes = static_cast<int> (state.getSize());
        if (! state.isEmpty())
        {
            processor->setStateInformation (state.getData(), static_cast<int> (state.getSize()));
            result.stateRestored = true;
        }
        if (! isolated->workerIsRunning())
            throw std::runtime_error ("worker stopped during state serialization");

        processor->releaseResources();
    }
    catch (const std::exception& exception)
    {
        result.detail = exception.what();
        std::cout << "Workspace retained for diagnosis: " << workspace.getFullPathName() << std::endl;
        return finish (result);
    }
    catch (...)
    {
        result.detail = "unknown exception while exercising the isolated plug-in";
        std::cout << "Workspace retained for diagnosis: " << workspace.getFullPathName() << std::endl;
        return finish (result);
    }

    processor.reset();
    result.passed = true;
    result.phase = "complete";
    result.detail = "real VST3 completed isolated scan, handshake, processing and state checks";
    workspace.deleteRecursively();
    return finish (result);
}
