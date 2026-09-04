// CTRL49 rack demo: the keyboard as a native front end for the Hostage rack.
// instrument-host rack. Eight encoders drive the ACTIVE CONTROL PAGE of the same
// InstrumentHostService the editor, standalone and outer VST3 run — real VST3 instruments,
// the Stage 2 parameter model, relative jump-free nudges, and the display showing each
// page's parameter names with knob positions fed from the bindings (an unresolved binding
// lights its switch LED instead of pretending).
//
// Usage:
//   Ctrl49RackDemo <multiknob.lua> <knob_strip.png> [--data <dir>]
//
// Shares the per-user data directory with the generated standalone by default
// (CEditorInstrumentHost), so whatever was scanned and saved there is what plays here.
// With no control pages saved, it auto-generates pages for the focused part's instrument.
// Page Left/Right and the mode buttons switch pages; encoders and the data dial nudge;
// Ctrl-C panics the rack and releases the session. Windows-only. Close other CTRL49 owners first.

#ifdef _WIN32

#include "Ctrl49PrivateInput.h"
#include "Ctrl49RackDisplay.h"
#include "Ctrl49PerformanceDisplay.h"
#include "Ctrl49Reducer.h"
#include "Ctrl49Session.h"
#include "Ctrl49WinMmOutput.h"

#include "InstrumentHost/InstrumentHostService.h"
#include "InstrumentHost/PluginInstantiator.h"

#include <windows.h>

#include <atomic>
#include <cstdio>
#include <memory>
#include <string>

namespace
{
using namespace ceditor::ctrl49;

std::atomic<bool> g_quit { false };

BOOL WINAPI consoleHandler (DWORD signal)
{
    if (signal == CTRL_C_EVENT || signal == CTRL_CLOSE_EVENT) { g_quit.store (true); return TRUE; }
    return FALSE;
}

void logLine (const std::string& text) { std::printf ("%s\n", text.c_str()); std::fflush (stdout); }

Bytes loadFileBytes (const juce::File& file)
{
    juce::MemoryBlock block;
    file.loadFileAsData (block);
    const auto* data = static_cast<const std::uint8_t*> (block.getData());
    return Bytes (data, data + block.getSize());
}

juce::File findWorkerForDemo (const juce::String& name)
{
    const auto exeDir = juce::File::getSpecialLocation (juce::File::currentExecutableFile)
                            .getParentDirectory();
    for (const auto& candidate : { exeDir.getChildFile (name),
                                   exeDir.getParentDirectory().getChildFile (name) })
        if (candidate.existsAsFile())
            return candidate;
    return exeDir.getChildFile (name);
}
} // namespace

int wmain (int argc, wchar_t** argv)
{
    if (argc < 3)
    {
        std::printf ("usage: Ctrl49RackDemo <multiknob.lua> <knob_strip.png> [--data <dir>]\n");
        return 2;
    }

    // The message thread: plug-in instantiation, the audio device manager and the service
    // all live on it, and this console thread IS it once initialised.
    juce::ScopedJuceInitialiser_GUI juceInit;

    juce::File dataDir = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                             .getChildFile ("CEditorInstrumentHost");
    for (int i = 3; i + 1 < argc; ++i)
        if (std::wstring (argv[i]) == L"--data")
            dataDir = juce::File (juce::String (argv[i + 1]));

    ceditor::host::InstrumentHostService::Options options;
    options.dataDirectory = dataDir;
    options.workerExecutable = findWorkerForDemo ("CEditorPluginScanner.exe");
    options.enableAudio = true;
    options.emit = [] (const juce::String& eventName, const juce::var& payload)
    {
        if (eventName == "instrumentHostError")
            logLine ("[host] " + payload.getProperty ("message", {}).toString().toStdString());
        else if (eventName == "instrumentHostScanProgress")
            logLine ("[scan] " + payload.getProperty ("line", {}).toString().toStdString());
    };
    const auto liveWorker = findWorkerForDemo ("CEditorPluginWorker.exe");
    options.livePluginIsolationAvailable = liveWorker.existsAsFile();
    options.instantiate = ceditor::host::makeIsolatedPluginInstantiator (
        liveWorker, dataDir.getChildFile ("worker-staging"));

    options.applyVstPreset = ceditor::host::applyVstPresetFile;

    ceditor::host::InstrumentHostService service (std::move (options));

    // Boot the saved session (catalogue, rack, instruments, audio).
    {
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("cmd", "getState");
        service.handleCommand (juce::var (payload));
    }
    juce::MessageManager::getInstance()->runDispatchLoopUntil (500);   // let async pieces settle

    const auto& performance = service.getRackHost().getPerformance();
    if (performance.pages.isEmpty() && performance.focusedPartId.isNotEmpty())
    {
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("cmd", "generateControlPages");
        payload->setProperty ("partId", performance.focusedPartId);
        service.handleCommand (juce::var (payload));
    }
    if (performance.pages.isEmpty())
    {
        logLine ("No control pages and nothing to generate them from — load an instrument in "
                 "CEditor (or the standalone) first; this demo shares its session.");
        return 3;
    }

    // The hardware.
    try
    {
        const auto ctrlPortId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
        if (! ctrlPortId)
        {
            logLine ("CTRL49 USB output port not found. Available ports:");
            for (const auto& name : Ctrl49WinMmOutput::listOutputPortNames())
                logLine ("    " + juce::String (name.c_str()).toStdString());   // proper narrowing, not per-wchar truncation
            return 3;
        }
        Ctrl49WinMmOutput output (*ctrlPortId);
        Ctrl49SessionOptions sessionOptions;
        sessionOptions.log = logLine;
        std::vector<Ctrl49Session::PngAsset> assets {
            { 0x0200, loadFileBytes (juce::File (juce::String (argv[2]))) } };
        Ctrl49Session session (output, loadFileBytes (juce::File (juce::String (argv[1]))),
                               std::move (assets), sessionOptions);

        Ctrl49PrivateInput input;
        input.start (Ctrl49PrivateInput::discoverDevicePath());
        session.start();
        SetConsoleCtrlHandler (consoleHandler, TRUE);

        Ctrl49Reducer reducer;
        // The performance page is the last one: control pages 0..N-1, then the Stage 6 page
        // where pads launch clips, the encoders shape the focused lane and the display reads
        // the transport (§18.8.10).
        const auto controlPages = juce::jmin (Ctrl49Reducer::kPageCount - 1,
                                              performance.pages.size());
        const auto performancePage = controlPages;
        reducer.setPageCount (controlPages + 1);
        logLine ("Rack surface up: " + std::to_string (controlPages)
                   + " control page(s) + the performance page. Ctrl-C to exit.");

        Bytes lastLabels, lastState;
        auto lastDisplay = juce::Time::getMillisecondCounterHiRes();

        while (! g_quit.load())
        {
            juce::MessageManager::getInstance()->runDispatchLoopUntil (5);

            if (! input.failure().empty()) throw std::runtime_error (input.failure());
            if (! input.running())         throw std::runtime_error ("hidden input stopped");
            if (! session.failure().empty()) throw std::runtime_error (session.failure());

            for (auto message = input.dequeue(); message; message = input.dequeue())
            {
                const auto action = reducer.process (message->data(), message->size());
                if (! action)
                    continue;

                if (reducer.page() == performancePage)
                {
                    // Pads are clips in bank A and scenes in bank B; the encoders are the
                    // performance set, in the order a groove box puts them.
                    if (action->padChanged && action->pad >= 1 && action->velocity > 0)
                    {
                        const auto index = action->pad - 1;
                        if (reducer.padBank() == 1)
                            service.surfaceScenePad (index);
                        else
                            service.surfaceClipPad (index);
                    }

                    if (action->encoderMoved && action->encoderSlot >= 0)
                    {
                        using SurfaceEncoder = ceditor::host::InstrumentHostService::SurfaceEncoder;
                        static const SurfaceEncoder encoders[] =
                        {
                            SurfaceEncoder::tempo,
                            SurfaceEncoder::swing,
                            SurfaceEncoder::rate,
                            SurfaceEncoder::length,
                            SurfaceEncoder::gate,
                            SurfaceEncoder::velocity,
                            SurfaceEncoder::probability,
                            SurfaceEncoder::tempo,
                        };
                        service.nudgePerformanceEncoder (
                            encoders[(std::size_t) juce::jlimit (0, 7, action->encoderSlot)],
                            action->encoderDelta);
                    }
                }
                else if (controlPages > 0)
                {
                    const auto& page = performance.pages.getReference (reducer.page());
                    if (action->encoderMoved)
                        service.nudgeControlSlot (page.pageId,
                                                  "s" + juce::String (action->encoderSlot + 1),
                                                  action->encoderDelta);
                }

                if (! action->text.empty())
                    logLine (action->text);
            }

            // Coalesced display refresh: 10 Hz, and only bytes that changed travel. Value
            // truth comes from the service — vendor-editor moves show up here too.
            const auto now = juce::Time::getMillisecondCounterHiRes();
            if (now - lastDisplay >= 100.0)
            {
                lastDisplay = now;
                service.drainParameterEvents();

                Bytes labels, state;

                if (reducer.page() == performancePage)
                {
                    const auto t = service.surfaceTransport();
                    PerformanceTransportView transport { t.playing, t.tempo, t.bar, t.beat,
                                                         t.externalClock, t.clockLost };

                    PerformanceClipViews clipViews {};
                    if (reducer.padBank() == 1)
                    {
                        const auto scenes = service.surfaceSceneNames();
                        for (int i = 0; i < juce::jmin (8, scenes.size()); ++i)
                            clipViews[(std::size_t) i] = { scenes[i].toStdString(), false, false, 0.0f };
                    }
                    else
                    {
                        const auto clips = service.surfaceClips();
                        for (int i = 0; i < juce::jmin (8, clips.size()); ++i)
                        {
                            const auto& c = clips.getReference (i);
                            clipViews[(std::size_t) i] = { c.name.toStdString(), c.active,
                                                           c.pending, c.phase };
                        }
                    }

                    labels = buildPerformanceLabelPayload (transport, clipViews);
                    state = buildPerformanceStatePayload (reducer.activeSlot(),
                                                          clipViews);
                }
                else if (controlPages > 0)
                {
                    const auto& page = performance.pages.getReference (reducer.page());
                    const auto slots = service.surfaceSlots (page.pageId);
                    RackSlotViews views {};
                    for (int i = 0; i < juce::jmin (8, slots.size()); ++i)
                    {
                        const auto& s = slots.getReference (i);
                        views[(std::size_t) i] = { s.displayName.toStdString(),
                                                   (int) std::lround (s.position * 127.0f),
                                                   s.assigned, s.resolved };
                    }

                    labels = buildRackLabelPayload (page.name.toStdString(), views);
                    state = buildRackStatePayload (reducer.activeSlot(), views);
                }

                if (! labels.empty() && labels != lastLabels)
                {
                    session.callLua ("set_labels", labels, false);
                    lastLabels = std::move (labels);
                }
                if (! state.empty() && state != lastState)
                {
                    session.callLua ("set_values", state, true);
                    lastState = std::move (state);
                }
            }
        }

        logLine ("Panic + release...");
        {
            auto* payload = new juce::DynamicObject();
            payload->setProperty ("cmd", "panic");
            service.handleCommand (juce::var (payload));
        }
        session.stop();
        input.stop();
    }
    catch (const std::exception& e)
    {
        logLine (std::string ("FATAL: ") + e.what());
        return 1;
    }

    return 0;
}

#endif // _WIN32
