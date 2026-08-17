// Bare CTRL49 bridge demonstrator — the C++ end state of Phase 2. One process that owns
// the hardware: opens the public output and the hidden cable-2 input, plays the proven
// display session, runs the reducer over live controls, and pushes coalesced set_state
// redraws plus pad/bank feedback. This reproduces what CTRL49_CEditor_Unified_Demo.ps1
// does, in C++, using CE/src/ControlSurface.
//
// Usage:  Ctrl49BridgeDemo <path-to-unified-demo.lua>
//
// Windows-only (WinMM + the stock M-Audio KSPROPERTY private input). Single-owner: a
// named mutex refuses a second instance. Ctrl+C exits cleanly and the keyboard watchdog
// restores its normal screen.

#ifdef _WIN32

#include "Ctrl49PrivateInput.h"
#include "Ctrl49Reducer.h"
#include "Ctrl49Session.h"
#include "Ctrl49WinMmOutput.h"

#include <windows.h>

#include <array>
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

// Bank -> feedback color, mirroring the PowerShell demo's palette.
std::array<int, 3> bankRgb (int bank)
{
    switch (bank)
    {
        case 0:  return { 255, 165, 0 };
        case 1:  return { 0, 0, 255 };
        case 2:  return { 0, 255, 0 };
        default: return { 255, 0, 255 };
    }
}
} // namespace

int wmain (int argc, wchar_t** argv)
{
    if (argc < 2)
    {
        std::printf ("usage: Ctrl49BridgeDemo <path-to-unified-demo.lua>\n");
        return 2;
    }

    // Load the Lua page and append the required NUL terminator.
    std::ifstream file (argv[1], std::ios::binary);
    if (! file)
    {
        std::printf ("could not open Lua page: %ls\n", argv[1]);
        return 2;
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    const std::string luaText = buffer.str();
    Bytes rawLua (luaText.begin(), luaText.end());
    rawLua.push_back (0x00);

    // Single-owner guard: refuse a second bridge before touching any port.
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
        // Transports.
        std::wstring portName;
        const auto portId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName, &portName);
        if (! portId)
            throw std::runtime_error ("output port 'CTRL49 USB' not found");
        std::string portNameUtf8;
        for (const wchar_t ch : portName)
            portNameUtf8 += static_cast<char> (ch < 128 ? ch : '?');
        logLine ("Output port: " + portNameUtf8);

        const std::wstring devicePath = Ctrl49PrivateInput::discoverDevicePath();

        Ctrl49WinMmOutput output (*portId);
        Ctrl49PrivateInput input;

        // Open the hidden input FIRST — if it fails (VIP running, contention), we must not
        // start a talk-only display session (the backstop rule).
        logLine ("Opening hidden cable-2 capture...");
        input.start (devicePath);

        Ctrl49SessionOptions options;
        options.log = logLine;
        Ctrl49Session session (output, rawLua, options);

        logLine ("Starting display session...");
        session.start();

        Ctrl49Reducer reducer;
        session.setActivePadBank (0);
        {
            const auto rgb = bankRgb (0);
            session.setAllPadsRgb (rgb[0], rgb[1], rgb[2]);
        }
        session.callLua ("set_state", reducer.displayArguments(), true);

        logLine ("Bridge ready. Turn encoders, press switches, Page Left/Right, Shift + Pad Bank.");
        logLine ("Ctrl+C to stop.");

        auto lastRender = std::chrono::steady_clock::now();
        bool dirty = false;

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
                if (! action)
                    continue;

                if (action->bankChanged)
                {
                    session.setActivePadBank (action->bank);
                    const auto rgb = bankRgb (action->bank);
                    session.setAllPadsRgb (rgb[0], rgb[1], rgb[2]);
                }
                if (action->padChanged)
                {
                    if (action->velocity > 0)
                        session.setPadRgb (action->pad, 255, 255, 255);
                    else
                    {
                        const auto rgb = bankRgb (reducer.padBank());
                        session.setPadRgb (action->pad, rgb[0], rgb[1], rgb[2]);
                    }
                }
                if (action->render)
                    dirty = true;

                // Keep encoder/dial ticks off the console; the screen is the value display.
                if (action->text.rfind ("Encoder ", 0) != 0
                    && action->text.rfind ("Data Dial ", 0) != 0)
                    logLine (action->text);
            }

            const auto now = std::chrono::steady_clock::now();
            if (dirty && now - lastRender >= std::chrono::milliseconds (50))
            {
                session.callLua ("set_state", reducer.displayArguments(), true);
                dirty = false;
                lastRender = now;
            }

            std::this_thread::sleep_for (std::chrono::milliseconds (2));
        }

        logLine ("Stopping...");
        session.stop();
        input.stop();
        logLine ("Bridge stopped cleanly.");
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
    std::printf ("Ctrl49BridgeDemo requires Windows (WinMM + M-Audio KSPROPERTY input).\n");
    return 0;
}

#endif // _WIN32
