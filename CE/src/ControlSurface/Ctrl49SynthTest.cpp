// CTRL49 -> real synth, first light (Phase 4). Turns encoder 1 into an actual device
// parameter change on a hardware synth, using CEditor's DeviceProfile intent compiler:
//
//   encoder 1 -> reducer value (0..127)
//             -> DeviceProfileEngine::compileSetParameter(role, param, value)
//             -> MIDI transaction bytes -> synth MIDI port
//             -> set_value -> the CTRL49 screen shows the value on the filmstrip knob
//
// This is the moment the project stops being a demo: a hardware synth's parameter, on the
// keyboard's screen, changed from its encoder, with the DAW untouched.
//
// Usage:
//   Ctrl49SynthTest <profile.json> <knob.lua> <knob_strip.png> <synth-port-name> [paramId]
//
// paramId defaults to filter.cutoff (roland-gaia.ceditor-device.json, range 0..127, DT1).
// <synth-port-name> is a prefix of the Windows MIDI-out port the synth enumerates as.
// Windows-only. Connect the synth; close VIP / your DAW (they hold the CTRL49 input).

#ifdef _WIN32

#include "Ctrl49PrivateInput.h"
#include "Ctrl49Reducer.h"
#include "Ctrl49Session.h"
#include "Ctrl49WinMmOutput.h"

#include "DeviceProfile/DeviceProfileEngine.h"

#include <windows.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <thread>

namespace
{
using namespace ceditor::ctrl49;

std::atomic<bool> g_quit { false };

BOOL WINAPI consoleHandler (DWORD signal)
{
    if (signal == CTRL_C_EVENT || signal == CTRL_CLOSE_EVENT)
    {
        g_quit.store (true);
        return TRUE;
    }
    return FALSE;
}

void logLine (const std::string& text)
{
    std::printf ("%s\n", text.c_str());
    std::fflush (stdout);
}

Bytes readFile (const wchar_t* path)
{
    std::ifstream file (path, std::ios::binary);
    if (! file)
        throw std::runtime_error ("could not open file");
    std::stringstream buffer;
    buffer << file.rdbuf();
    const std::string data = buffer.str();
    return Bytes (data.begin(), data.end());
}

std::string toUtf8 (const std::wstring& w)
{
    std::string out;
    for (const wchar_t ch : w)
        out += static_cast<char> (ch < 128 ? ch : '?');
    return out;
}

std::wstring widen (const char* s)
{
    std::wstring out;
    for (; *s; ++s) out += static_cast<wchar_t> (static_cast<unsigned char> (*s));
    return out;
}
} // namespace

int wmain (int argc, wchar_t** argv)
{
    if (argc < 5)
    {
        std::printf ("usage: Ctrl49SynthTest <profile.json> <knob.lua> <knob_strip.png>"
                     " <synth-port-name> [paramId]\n");
        return 2;
    }

    const std::string paramId = argc >= 6
        ? toUtf8 (argv[5]) : std::string ("filter.cutoff");
    const std::wstring synthPortName = argv[4];

    // Load the device profile.
    ceditor::device::DeviceProfileEngine engine;
    {
        Bytes profileBytes;
        try { profileBytes = readFile (argv[1]); }
        catch (const std::exception&) { std::printf ("could not read profile.\n"); return 2; }
        juce::String error;
        const juce::String json (reinterpret_cast<const char*> (profileBytes.data()),
                                 profileBytes.size());
        if (! engine.loadFromJson (json, error))
        {
            std::printf ("profile load failed: %s\n", error.toRawUTF8());
            return 2;
        }
        logLine ("Profile: " + std::string (engine.getProfileName().toRawUTF8()));
    }

    // Verify the parameter compiles before touching hardware.
    {
        const auto probe = engine.compileSetParameter ("mainSynth", juce::String (paramId), 64, false);
        if (! probe.ok)
        {
            std::printf ("parameter '%s' did not compile: %s\n",
                         paramId.c_str(), probe.error.toRawUTF8());
            return 2;
        }
        logLine ("Parameter '" + paramId + "' compiles; value 64 -> "
                 + std::string (ceditor::device::DeviceProfileEngine::transactionToHex (probe.transaction).toRawUTF8()));
    }

    Bytes rawLua, png;
    try
    {
        rawLua = readFile (argv[2]);
        rawLua.push_back (0x00);
        png = readFile (argv[3]);
    }
    catch (const std::exception&) { std::printf ("could not read Lua/PNG.\n"); return 2; }

    HANDLE mutex = CreateMutexW (nullptr, TRUE, L"Local\\CEditor_CTRL49_Bridge");
    if (mutex == nullptr || GetLastError() == ERROR_ALREADY_EXISTS)
    {
        std::printf ("A CTRL49 bridge is already running.\n");
        if (mutex != nullptr) CloseHandle (mutex);
        return 1;
    }
    SetConsoleCtrlHandler (consoleHandler, TRUE);

    try
    {
        // CTRL49 output + hidden input.
        const auto ctrlPortId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
        if (! ctrlPortId)
            throw std::runtime_error ("output port 'CTRL49 USB' not found");

        // Synth output port.
        std::wstring synthActual;
        const auto synthPortId = Ctrl49WinMmOutput::findPort (synthPortName, &synthActual);
        if (! synthPortId)
        {
            logLine ("Synth MIDI port not found: '" + toUtf8 (synthPortName) + "'. Available output ports:");
            for (const auto& name : Ctrl49WinMmOutput::listOutputPortNames())
                logLine ("    " + toUtf8 (name));
            throw std::runtime_error ("re-run with a name matching one of the ports above");
        }
        logLine ("Synth port: " + toUtf8 (synthActual));

        const std::wstring devicePath = Ctrl49PrivateInput::discoverDevicePath();

        Ctrl49WinMmOutput ctrlOut (*ctrlPortId);
        Ctrl49WinMmOutput synthOut (*synthPortId);
        Ctrl49PrivateInput input;

        logLine ("Opening hidden cable-2 capture...");
        input.start (devicePath);

        std::vector<Ctrl49Session::PngAsset> assets { { 0x0200, png } };
        Ctrl49SessionOptions options;
        options.log = logLine;
        Ctrl49Session session (ctrlOut, rawLua, assets, options);

        logLine ("Uploading knob page + filmstrip, starting display...");
        session.start();

        Ctrl49Reducer reducer;
        session.callLua ("set_value", { 0 }, true);
        logLine ("Ready. Turn Encoder 1 -> " + paramId + " on the synth. Ctrl+C to stop.");

        int lastValue = -1;
        auto lastSend = std::chrono::steady_clock::now();

        while (! g_quit.load())
        {
            if (! session.failure().empty()) throw std::runtime_error (session.failure());
            if (! input.failure().empty())   throw std::runtime_error (input.failure());
            if (! input.running())           throw std::runtime_error ("hidden input stopped");

            bool changed = false;
            for (auto message = input.dequeue(); message; message = input.dequeue())
            {
                const auto action = reducer.process (message->data(), message->size());
                if (action && action->render)
                    changed = true;
            }

            const int value = reducer.displayArguments()[6];  // encoder 1 -> page0 slot0
            const auto now = std::chrono::steady_clock::now();
            if (changed && value != lastValue
                && now - lastSend >= std::chrono::milliseconds (20))  // profile minInterval
            {
                const auto result = engine.compileSetParameter ("mainSynth", juce::String (paramId),
                                                                value, false);
                if (result.ok)
                {
                    for (const auto& msg : result.transaction.messages)
                    {
                        Bytes bytes;
                        bytes.reserve (static_cast<std::size_t> (msg.bytes.size()));
                        for (int b : msg.bytes)
                            bytes.push_back (static_cast<std::uint8_t> (b & 0xFF));
                        synthOut.send (bytes);
                    }
                    session.callLua ("set_value", { static_cast<std::uint8_t> (value) }, true);
                    lastValue = value;
                    lastSend = now;
                }
            }

            std::this_thread::sleep_for (std::chrono::milliseconds (2));
        }

        logLine ("Stopping...");
        session.stop();
        input.stop();
        logLine ("Synth test stopped cleanly.");
    }
    catch (const std::exception& error)
    {
        std::printf ("ERROR: %s\n", error.what());
        ReleaseMutex (mutex);
        CloseHandle (mutex);
        return 1;
    }

    ReleaseMutex (mutex);
    CloseHandle (mutex);
    return 0;
}

#else // _WIN32

#include <cstdio>
int main()
{
    std::printf ("Ctrl49SynthTest requires Windows.\n");
    return 0;
}

#endif // _WIN32
