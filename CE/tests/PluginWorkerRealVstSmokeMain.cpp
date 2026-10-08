// Opt-in acceptance smoke for Hostage's real VST3 process boundary.
//
// This executable must never instantiate vendor code itself. It asks CEditorPluginScanner for
// one serialized PluginDescription, then gives that opaque XML to IsolatedPluginProxy. The real
// CEditorPluginWorker owns construction, preparation, processing and state calls. Keeping this
// outside CTest is intentional: a representative installed VST3, its licence state and any UI it
// opens are properties of the test machine rather than deterministic repository fixtures.

#include "InstrumentHost/IsolatedPluginProxy.h"
#include "InstrumentHost/PluginScannerCoordinator.h"
#include "InstrumentHost/VendorPreset.h"
#include <juce_gui_basics/juce_gui_basics.h>
#include <atomic>
#include <iostream>
#include <memory>
#include <stdexcept>

namespace
{
constexpr double sampleRate = 48'000.0;
constexpr int blockSize = 256;
// Cover several message-thread timer ticks as well as the audio handoff. Scripted MIDI
// responses are asynchronous and need time to return through the next worker block.
constexpr int blocksToProcess = 64;

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
    int parameterCount = 0;
    juce::Array<juce::var> outputCc;
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
    object->setProperty ("parameterCount", result.parameterCount);
    object->setProperty ("outputCc", result.outputCc);

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

    if (argc < 4 || argc > 6)
    {
        result.detail = "usage: CEditorPluginWorkerRealVstSmoke <scanner.exe> <worker.exe> "
                        "<plugin.vst3> [exact-class-name-or-id] [preset-file]";
        return finish (result);
    }

    const juce::File scanner (juce::String::fromUTF8 (argv[1]));
    const juce::File worker (juce::String::fromUTF8 (argv[2]));
    const juce::File module (juce::String::fromUTF8 (argv[3]));
    const auto selector = argc >= 5 ? juce::String::fromUTF8 (argv[4]) : juce::String();
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

        if (argc == 6)
        {
            result.phase = "vendor preset";
            juce::MemoryBlock before;
            processor->getStateInformation (before);
            std::vector<float> beforeParameters;
            for (auto* parameter : processor->getParameters()) beforeParameters.push_back (parameter->getValue());
            if (! isolated->applyVstPreset (juce::File (juce::String::fromUTF8 (argv[5]))))
                throw std::runtime_error ("worker refused the vendor preset");
            juce::MemoryBlock after;
            processor->getStateInformation (after);
            if (after == before)
                throw std::runtime_error ("preset returned success without changing the initial sound");
            const auto preset = ceditor::host::readVendorPreset (juce::File (juce::String::fromUTF8 (argv[5])));
            if (preset.sourceType == "h2p")
            {
                bool changed = false;
                const auto& parameters = processor->getParameters();
                for (int i = 0; i < parameters.size() && i < static_cast<int> (beforeParameters.size()); ++i)
                    changed |= std::abs (parameters[i]->getValue() - beforeParameters[static_cast<size_t> (i)]) > 0.00001f;
                if (! changed) throw std::runtime_error ("H2P changed its name but left the parameter cache unchanged");
                const auto xml = juce::AudioProcessor::getXmlFromBinary (after.getData(), static_cast<int> (after.getSize()));
                juce::MemoryBlock native;
                const auto* component = xml != nullptr ? xml->getChildByName ("IComponent") : nullptr;
                const auto filename = juce::File (juce::String::fromUTF8 (argv[5])).getFileName();
                if (component == nullptr || ! native.fromBase64Encoding (component->getAllSubText())
                    || ! juce::StringArray::fromLines (native.toString()).contains ("#pgm=" + filename))
                    throw std::runtime_error ("H2P recall did not retain the real preset name");
            }
            if (preset.sourceType == "spire")
                for (const auto& property : preset.parameters.getDynamicObject()->getProperties())
                {
                    bool matched = false;
                    for (auto* parameter : processor->getParameters())
                        if (parameter->getName (256) == property.name.toString())
                            matched = std::abs (parameter->getValue() - static_cast<float> (property.value)) < 0.00001f;
                    if (! matched) throw std::runtime_error ("Spire parameter differs from the preset file");
                }
        }

        // Presets by ear. The checks above read state and parameters, and both can be right while
        // the plug-in plays something else: Vanguard did, with every load reported applied and
        // every parameter reading as saved, because Hostage was writing its MIDI-controller
        // parameters (PluginWorkerMain.cpp, snapshotValueIsToBeWritten). So this listens.
        //
        // HOSTAGE_SMOKE_SOUND_SEQUENCE is a ';'-separated list. A preset file is loaded; the words
        // below do to the part what Hostage does between loads. After each step one held note is
        // rendered and reduced to three numbers. Two different sounds must not come out alike, and
        // one sound must come out the same each time, whatever was done in between.
        //
        //   @save           read the state, as every save of the rack does
        //   @save-restore   read the state and put the same state back
        //   @restart        restore the state into a new worker, as reopening the rack does
        //   @remember       keep the state as it is now ...
        //   @recall         ... and put it back over whatever was loaded since (a comparison ended)
        //   @tweak          turn the filter's cutoff well away: a new sound, which must then last
        //   @state:<file>   put back a state saved in a file (a part of a saved rack)
        //
        // Use sounds that repeat: a bass does, a pad with free-running modulation does not.
        if (const auto sequence = juce::StringArray::fromTokens (
                juce::SystemStats::getEnvironmentVariable ("HOSTAGE_SMOKE_SOUND_SEQUENCE", {}), ";", {});
            ! sequence.isEmpty())
        {
            result.phase = "preset sound";
            struct Sound { juce::String name; double rms = 0.0, peak = 0.0, crossingsHz = 0.0; };
            const auto render = [&] (const juce::String& name)
            {
                juce::AudioBuffer<float> audio (juce::jmax (1, result.inputChannels, result.outputChannels), blockSize);
                juce::MidiBuffer midi;
                // A short note first, unmeasured: the first note after a load is not the sound yet on a
                // patch that glides (Spire's 303 basses slide up to it from wherever the voice was).
                const int primed = 24, held = 96, tail = 48;
                double squares = 0.0, peak = 0.0;
                int crossings = 0, samples = 0;
                float last = 0.0f;
                for (int block = 0; block < primed + held + tail; ++block)
                {
                    audio.clear();
                    midi.clear();
                    if (block == 0)             midi.addEvent (juce::MidiMessage::noteOn (1, 48, (juce::uint8) 100), 0);
                    if (block == 8)             midi.addEvent (juce::MidiMessage::noteOff (1, 48), 0);
                    if (block == primed)        midi.addEvent (juce::MidiMessage::noteOn (1, 48, (juce::uint8) 100), 0);
                    if (block == primed + held) midi.addEvent (juce::MidiMessage::noteOff (1, 48), 0);
                    processor->processBlock (audio, midi);
                    if (block >= primed && block < primed + held)
                        for (int i = 0; i < blockSize; ++i, ++samples)
                        {
                            const auto sample = audio.getSample (0, i);
                            squares += (double) sample * sample;
                            peak = juce::jmax (peak, (double) std::abs (sample));
                            crossings += (sample >= 0.0f) != (last >= 0.0f) ? 1 : 0;
                            last = sample;
                        }
                    juce::Thread::sleep (10);
                    ++result.processedBlocks;
                }
                Sound sound { name, std::sqrt (squares / juce::jmax (1, samples)), peak,
                              crossings * sampleRate / (2.0 * juce::jmax (1, samples)) };
                std::cout << "SOUND " << juce::File::createLegalFileName (juce::File (name).getFileNameWithoutExtension()).paddedRight (' ', 28)
                          << " rms " << juce::String (sound.rms, 4) << "  peak " << juce::String (sound.peak, 4)
                          << "  crossings " << juce::String (sound.crossingsHz, 0) << " Hz" << std::endl;
                return sound;
            };
            // The same sound twice lands within a per cent or two in level. Its zero crossings wander
            // far more (free-running oscillators), so they count only by the factor: a filter opened
            // moves them tenfold where the level hardly moves.
            const auto alike = [] (const Sound& a, const Sound& b)
            {
                const auto near = [] (double x, double y) { return std::abs (x - y) <= 0.06 * juce::jmax (x, y, 1.0e-6); };
                const auto low = juce::jmax (5.0, juce::jmin (a.crossingsHz, b.crossingsHz));
                const auto high = juce::jmax (5.0, a.crossingsHz, b.crossingsHz);
                return near (a.rms, b.rms) && near (a.peak, b.peak) && high / low < 1.5;
            };
            const auto restore = [&] (const juce::MemoryBlock& state)
            {
                processor->setStateInformation (state.getData(), static_cast<int> (state.getSize()));
            };

            std::vector<Sound> sounds;
            sounds.push_back (render ("(as the plug-in starts)"));   // shown, and compared with nothing
            int restarts = 0;
            juce::MemoryBlock remembered;
            juce::String rememberedName;
            for (const auto& step : sequence)
            {
                const auto current = sounds.back().name;
                auto heard = current;
                if (step == "@save" || step == "@save-restore" || step == "@restart")
                {
                    juce::MemoryBlock state;
                    processor->getStateInformation (state);
                    if (step == "@restart")
                    {
                        processor->releaseResources();
                        processor.reset();
                        processor = launchProxy (worker, workspace.getChildFile ("restart-" + juce::String (++restarts)),
                                                 selected->descriptionXml, launchError);
                        isolated = dynamic_cast<ceditor::host::IsolatedPluginProxy*> (processor.get());
                        if (processor == nullptr || isolated == nullptr)
                            throw std::runtime_error ("could not start the worker again");
                        processor->prepareToPlay (sampleRate, blockSize);
                    }
                    if (step != "@save")
                        restore (state);
                }
                else if (step == "@remember")
                {
                    processor->getStateInformation (remembered);
                    rememberedName = current;
                    std::cout << "      " << step << std::endl;
                    continue;
                }
                else if (step == "@recall")
                {
                    restore (remembered);
                    heard = rememberedName;
                }
                else if (step == "@tweak")
                {
                    juce::AudioProcessorParameter* cutoff = nullptr;
                    for (auto* parameter : processor->getParameters())
                        if (parameter->getName (64).containsIgnoreCase ("cut")) { cutoff = parameter; break; }
                    if (cutoff == nullptr)
                        throw std::runtime_error ("this plug-in has no parameter named for a cutoff to turn");
                    std::cout << "      (" << cutoff->getName (64) << ")" << std::endl;
                    cutoff->setValueNotifyingHost (cutoff->getValue() < 0.5f ? 0.95f : 0.05f);
                    heard = current + " tweaked";
                }
                else if (step.startsWith ("@state:"))
                {
                    juce::MemoryBlock saved;
                    const juce::File source (step.fromFirstOccurrenceOf (":", false, false));
                    if (! source.loadFileAsData (saved) || saved.isEmpty())
                        throw std::runtime_error (("could not read the saved state: " + source.getFullPathName()).toStdString());
                    restore (saved);
                    heard = source.getFullPathName();
                }
                else if (step.startsWith ("@"))
                {
                    throw std::runtime_error (("unknown step in the sound sequence: " + step).toStdString());
                }
                else
                {
                    if (! isolated->applyVstPreset (juce::File (step)))
                        throw std::runtime_error (("worker refused the vendor preset: " + step).toStdString());
                    heard = step;
                }
                if (step.startsWith ("@"))
                    std::cout << "      " << step.upToFirstOccurrenceOf (":", false, false) << std::endl;
                sounds.push_back (render (heard));
            }
            for (size_t a = 1; a < sounds.size(); ++a)
                for (size_t b = a + 1; b < sounds.size(); ++b)
                {
                    const bool same = sounds[a].name == sounds[b].name;
                    if (same != alike (sounds[a], sounds[b]))
                        throw std::runtime_error ((same
                            ? juce::File (sounds[a].name).getFileName() + " did not sound the same every time (steps "
                                + juce::String ((int) a) + " and " + juce::String ((int) b) + ")"
                            : juce::File (sounds[a].name).getFileName() + " and " + juce::File (sounds[b].name).getFileName()
                                + " are different sounds and came out alike").toStdString());
                }
            processor->releaseResources();
            processor.reset();
            result.passed = true;
            result.phase = "complete";
            result.detail = "every sound in the sequence was heard as itself, each time";
            workspace.deleteRecursively();
            return finish (result);
        }

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
            for (const auto metadata : midi)
            {
                const auto message = metadata.getMessage();
                if (message.isController())
                    result.outputCc.addIfNotAlreadyThere (message.getControllerNumber());
            }
            ++result.processedBlocks;
            juce::Thread::sleep (10); // allow the fixed one-block pipeline to publish its reply
        }
        if (! isolated->workerIsRunning())
            throw std::runtime_error ("worker stopped during representative block processing");

        result.phase = "state";
        result.parameterCount = processor->getParameters().size();
        juce::MemoryBlock state;
        processor->getStateInformation (state);
        const auto dumpPath = juce::SystemStats::getEnvironmentVariable ("HOSTAGE_SMOKE_STATE_DUMP", {});
        if (dumpPath.isNotEmpty())
        {
            juce::File (dumpPath).replaceWithData (state.getData(), state.getSize());
            juce::Array<juce::var> parameters;
            for (const auto* parameter : processor->getParameters())
            {
                auto* value = new juce::DynamicObject();
                value->setProperty ("name", parameter->getName (256));
                value->setProperty ("value", parameter->getValue());
                if (const auto* hosted = dynamic_cast<const juce::HostedAudioProcessorParameter*> (parameter))
                    value->setProperty ("id", hosted->getParameterID());
                parameters.add (juce::var (value));
            }
            juce::File (dumpPath + ".parameters.json").replaceWithText (juce::JSON::toString (parameters));
        }
        result.stateBytes = static_cast<int> (state.getSize());
        if (! state.isEmpty())
        {
            std::vector<float> expected;
            for (const auto* parameter : processor->getParameters()) expected.push_back (parameter->getValue());
            if (argc == 6)
            {
                processor->releaseResources();
                processor.reset();
                processor = launchProxy (worker, workspace.getChildFile ("restore-worker"),
                                         selected->descriptionXml, launchError);
                if (processor == nullptr) throw std::runtime_error ("could not create state-restore worker");
                isolated = dynamic_cast<ceditor::host::IsolatedPluginProxy*> (processor.get());
                processor->prepareToPlay (sampleRate, blockSize);
            }
            processor->setStateInformation (state.getData(), static_cast<int> (state.getSize()));
            if (argc == 6)
                for (int block = 0; block < 12; ++block)
                {
                    audio.clear(); midi.clear();
                    processor->processBlock (audio, midi);
                    juce::Thread::sleep (10);
                }
            if (dumpPath.isNotEmpty())
            {
                juce::MemoryBlock restored;
                processor->getStateInformation (restored);
                juce::File (dumpPath + ".restored").replaceWithData (restored.getData(), restored.getSize());
            }
            if (argc == 6)
            {
                const auto& parameters = processor->getParameters();
                if (parameters.size() != static_cast<int> (expected.size()))
                    throw std::runtime_error ("parameter inventory changed on state restore");
                for (int i = 0; i < parameters.size(); ++i)
                    if (std::abs (parameters[i]->getValue() - expected[static_cast<size_t> (i)]) > 0.00001f)
                        throw std::runtime_error ("restored preset parameter differs: " + parameters[i]->getName (256).toStdString()
                            + " expected " + std::to_string (expected[static_cast<size_t> (i)])
                            + " got " + std::to_string (parameters[i]->getValue()));
            }
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
