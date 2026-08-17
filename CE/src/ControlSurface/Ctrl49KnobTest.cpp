// CTRL49 filmstrip-knob beauty test — the on-hardware half of Phase 3. Uploads a
// CEditor-generated arc-knob filmstrip (PNG) plus CEditor_Knob_Test.lua, then maps
// encoder 1 to the knob value: turning it sweeps the pre-rendered, anti-aliased arc on
// the real 480x272 screen. Proves the filmstrip pipeline end to end on metal.
//
// Usage:  Ctrl49KnobTest <CEditor_Knob_Test.lua> <knob_strip.png>
//
// Windows-only. Single-owner named mutex; Ctrl+C exits cleanly.

#ifdef _WIN32

#include "Ctrl49PrivateInput.h"
#include "Ctrl49Reducer.h"
#include "Ctrl49Session.h"
#include "Ctrl49WinMmOutput.h"

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
} // namespace

int wmain (int argc, wchar_t** argv)
{
    if (argc < 3)
    {
        std::printf ("usage: Ctrl49KnobTest <knob-page.lua> <knob_strip.png>\n");
        return 2;
    }

    Bytes rawLua;
    Bytes png;
    try
    {
        rawLua = readFile (argv[1]);
        rawLua.push_back (0x00);        // Lua object convention: source + NUL
        png = readFile (argv[2]);
    }
    catch (const std::exception&)
    {
        std::printf ("could not read the Lua page or PNG filmstrip.\n");
        return 2;
    }

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
        const auto portId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
        if (! portId)
            throw std::runtime_error ("output port 'CTRL49 USB' not found");
        const std::wstring devicePath = Ctrl49PrivateInput::discoverDevicePath();

        Ctrl49WinMmOutput output (*portId);
        Ctrl49PrivateInput input;

        logLine ("Opening hidden cable-2 capture...");
        input.start (devicePath);

        // The knob page expects the filmstrip as PNG object id 0x0200 (see the .lua).
        std::vector<Ctrl49Session::PngAsset> assets { { 0x0200, png } };

        Ctrl49SessionOptions options;
        options.log = logLine;
        Ctrl49Session session (output, rawLua, assets, options);

        logLine ("Uploading knob page + filmstrip, starting display...");
        session.start();

        Ctrl49Reducer reducer;
        session.callLua ("set_value", { 0 }, true);
        logLine ("Ready. Turn Encoder 1 to sweep the knob. Ctrl+C to stop.");

        int lastValue = -1;
        auto lastRender = std::chrono::steady_clock::now();
        bool dirty = true;

        while (! g_quit.load())
        {
            if (! session.failure().empty())
                throw std::runtime_error (session.failure());
            if (! input.failure().empty())
                throw std::runtime_error (input.failure());
            if (! input.running())
                throw std::runtime_error ("hidden cable-2 capture stopped unexpectedly");

            for (auto message = input.dequeue(); message; message = input.dequeue())
            {
                const auto action = reducer.process (message->data(), message->size());
                if (action && action->render)
                    dirty = true;
            }

            // Encoder 1 maps to page-0 slot-0 in the reducer; that is the knob value.
            const int value = reducer.displayArguments()[6];
            const auto now = std::chrono::steady_clock::now();
            if (dirty && value != lastValue
                && now - lastRender >= std::chrono::milliseconds (30))
            {
                session.callLua ("set_value", { static_cast<std::uint8_t> (value) }, true);
                lastValue = value;
                dirty = false;
                lastRender = now;
            }

            std::this_thread::sleep_for (std::chrono::milliseconds (2));
        }

        logLine ("Stopping...");
        session.stop();
        input.stop();
        logLine ("Knob test stopped cleanly.");
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
    std::printf ("Ctrl49KnobTest requires Windows.\n");
    return 0;
}

#endif // _WIN32
