// CTRL49 screen lab — the on-hardware half of tools/ctrl49/screen-lab. Uploads one of two Lua
// pages with its PNGs and drives it from the keyboard:
//
//   Ctrl49ScreenLab showcase <screen-lab dir>   five pages of what baked PNGs can look like:
//                                               Page </> walks them, the encoders and pads play
//   Ctrl49ScreenLab stress   <screen-lab dir>   E1-E6 raise the drawing load until the screen
//                                               stutters or the watchdog gives up; the console
//                                               prints the load that did it
//
// Everything sent is built in Ctrl49ScreenLab.h, where it is tested and where the browser
// preview gets the same bytes. Windows-only. Single-owner named mutex; Ctrl+C exits cleanly.

#ifdef _WIN32

#include "Ctrl49PrivateInput.h"
#include "Ctrl49Reducer.h"
#include "Ctrl49ScreenLab.h"
#include "Ctrl49Session.h"
#include "Ctrl49WinMmOutput.h"

#include <windows.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <thread>

namespace
{
using namespace ceditor::ctrl49;
using Clock = std::chrono::steady_clock;

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

Bytes readFile (const std::filesystem::path& path)
{
    std::ifstream file (path, std::ios::binary);
    if (! file)
        throw std::runtime_error ("could not read " + path.string());
    std::stringstream buffer;
    buffer << file.rdbuf();
    const std::string data = buffer.str();
    return Bytes (data.begin(), data.end());
}

double millisecondsSince (Clock::time_point start)
{
    return std::chrono::duration<double, std::milli> (Clock::now() - start).count();
}

int usage()
{
    std::printf ("usage: Ctrl49ScreenLab showcase|stress <tools\\ctrl49\\screen-lab folder>\n");
    return 2;
}
} // namespace

int wmain (int argc, wchar_t** argv)
{
    if (argc < 3)
        return usage();

    const std::wstring mode = argv[1];
    const bool stress = mode == L"stress";
    if (! stress && mode != L"showcase")
        return usage();
    const std::filesystem::path labDir = argv[2];

    Bytes rawLua;
    std::vector<Ctrl49Session::PngAsset> assets;
    try
    {
        rawLua = readFile (labDir / (stress ? "Hostage_Stress.lua" : "Hostage_Showcase.lua"));
        // The ids the pages decode (see the PNG constants at the top of each .lua).
        assets.push_back ({ 0x0220, readFile (labDir / "surface_atlas.png") });
        assets.push_back ({ 0x0230, readFile (labDir / "lab_bg.png") });
        if (stress)
        {
            const auto block = readFile (labDir / "stress_block.png");
            for (int i = 0; i < lab::kStressMemoryBlocks; ++i)
                assets.push_back ({ (std::uint16_t) (0x0250 + i), block });
        }
        else
        {
            assets.push_back ({ 0x0232, readFile (labDir / "rich_atlas.png") });
            assets.push_back ({ 0x0234, readFile (labDir / "vu_face.png") });
            assets.push_back ({ 0x0236, readFile (labDir / "vu_needle.png") });
        }
    }
    catch (const std::exception& error)
    {
        std::printf ("%s\nRun make_lab_assets.py in that folder if the PNGs are missing.\n", error.what());
        return 2;
    }

    std::size_t uploadBytes = rawLua.size();
    for (const auto& asset : assets)
        uploadBytes += asset.png.size();

    HANDLE mutex = CreateMutexW (nullptr, TRUE, L"Local\\CEditor_CTRL49_Bridge");
    if (mutex == nullptr || GetLastError() == ERROR_ALREADY_EXISTS)
    {
        std::printf ("A CTRL49 bridge is already running (close HoSTage / CEditor first).\n");
        if (mutex != nullptr) CloseHandle (mutex);
        return 1;
    }

    SetConsoleCtrlHandler (consoleHandler, TRUE);

    lab::StressLoad lastLoad;
    int exitCode = 0;
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

        Ctrl49SessionOptions options;
        options.log = logLine;
        Ctrl49Session session (output, rawLua, assets, options);

        logLine ("Uploading " + std::to_string (uploadBytes / 1024) + " KB (page + "
                 + std::to_string (assets.size()) + " PNGs)...");
        const auto uploadStart = Clock::now();
        session.start();
        logLine ("Upload and startup took " + std::to_string ((int) millisecondsSince (uploadStart)) + " ms.");

        // The lab keeps its own encoder values and page: the reducer's four pages are one
        // fewer than the showcase has. Each page remembers its own encoders.
        std::array<std::array<int, 8>, lab::kShowcasePages> encoders {};
        for (auto& pageEncoders : encoders)
            pageEncoders.fill (64);
        if (stress)
        {
            encoders[0].fill (0);
            encoders[0][5] = 39;                      // about 10 redraws per second to start
        }
        int page = 0, lastEncoder = 0, frame = 0;
        std::uint8_t padsLit = 0;
        std::array<int, 4> sentEnvelope { -1, -1, -1, -1 };

        Ctrl49Reducer reducer;
        const auto start = Clock::now();
        auto nextRedraw = Clock::now();
        auto windowStart = Clock::now();
        int windowRedraws = 0;
        double windowSendMs = 0.0;

        if (stress)
            logLine ("Stress page. E1 rects, E2 sprites, E3 texts, E4 full-screen blits, E5 memory, "
                     "E6 redraws/s. Raise one at a time; note the load when the orange bar stops "
                     "gliding. Ctrl+C to stop.");
        else
            logLine ("Showcase. Page < > walks FADERS, PADS, SEQUENCER, ENVELOPE, METERS; the "
                     "encoders and pads play each page. Ctrl+C to stop.");

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
                const auto& bytes = *message;
                // Page Left / Page Right, read directly: the showcase has five pages.
                if (! stress && bytes.size() >= 3 && (bytes[0] & 0xF0) == 0xB0 && bytes[2] == 127
                    && (bytes[1] == 39 || bytes[1] == 40))
                {
                    page = (page + (bytes[1] == 40 ? 1 : lab::kShowcasePages - 1)) % lab::kShowcasePages;
                    logLine (std::string ("Page: ") + lab::kShowcasePageNames[page]);
                }

                const auto action = reducer.process (bytes.data(), bytes.size());
                if (! action)
                    continue;
                if (action->encoderMoved && action->encoderSlot >= 0 && action->encoderSlot < 8)
                {
                    auto& value = encoders[stress ? 0 : page][(std::size_t) action->encoderSlot];
                    value = std::clamp (value + action->encoderDelta, 0, 127);
                    lastEncoder = action->encoderSlot;
                }
                if (action->padChanged && action->pad >= 1 && action->pad <= 8)
                {
                    const auto bit = (std::uint8_t) (1u << (action->pad - 1));
                    padsLit = action->velocity > 0 ? (std::uint8_t) (padsLit | bit)
                                                   : (std::uint8_t) (padsLit & ~bit);
                }
            }

            const auto load = lab::stressLoad (encoders[0]);
            const auto interval = std::chrono::milliseconds (stress ? 1000 / load.fps : 100);
            if (Clock::now() < nextRedraw)
            {
                std::this_thread::sleep_for (std::chrono::milliseconds (1));
                continue;
            }
            nextRedraw = Clock::now() + interval;
            ++frame;

            const auto sendStart = Clock::now();
            if (stress)
            {
                if (load.rects != lastLoad.rects || load.images != lastLoad.images
                    || load.texts != lastLoad.texts || load.fullScreens != lastLoad.fullScreens
                    || load.memoryBlocks != lastLoad.memoryBlocks || load.fps != lastLoad.fps)
                    logLine ("Load: " + lab::describe (load));
                lastLoad = load;
                session.callLua ("set_load", lab::buildStressFrame (load, frame), true);
            }
            else
            {
                const auto& e = encoders[(std::size_t) page];
                if (page == 3)
                {
                    const std::array<int, 4> wanted { e[0], e[1], e[2], e[3] };
                    if (wanted != sentEnvelope)
                    {
                        session.callLua ("set_envelope", lab::buildEnvelope (e[0], e[1], e[2], e[3]), false);
                        sentEnvelope = wanted;
                    }
                }
                const auto elapsedMs = millisecondsSince (start);
                const int playhead = (int) (elapsedMs / 125.0) % 16;      // 120 BPM sixteenths
                const int gain = encoders[4][0];
                session.callLua ("set_frame",
                                 lab::buildShowcaseFrame (page, frame, e, lastEncoder, playhead,
                                                          lab::vuFrame (lab::demoLevel (0, frame, gain)),
                                                          lab::vuFrame (lab::demoLevel (1, frame, gain)),
                                                          padsLit),
                                 true);
            }
            windowSendMs += millisecondsSince (sendStart);
            ++windowRedraws;

            if (millisecondsSince (windowStart) >= 2000.0)
            {
                if (stress)
                {
                    char line[96];
                    std::snprintf (line, sizeof line, "  %d redraws/s sent, %.1f ms to send each",
                                   windowRedraws / 2, windowSendMs / windowRedraws);
                    logLine (line);
                }
                windowStart = Clock::now();
                windowRedraws = 0;
                windowSendMs = 0.0;
            }
        }

        logLine ("Stopping...");
        session.stop();
        input.stop();
        logLine ("Screen lab stopped cleanly.");
    }
    catch (const std::exception& error)
    {
        std::printf ("ERROR: %s\n", error.what());
        if (stress)
            std::printf ("The keyboard stopped answering. Last load sent:\n  %s\n",
                         lab::describe (lastLoad).c_str());
        exitCode = 1;
    }

    ReleaseMutex (mutex);
    CloseHandle (mutex);
    return exitCode;
}

#else // _WIN32

#include <cstdio>
int main()
{
    std::printf ("Ctrl49ScreenLab requires Windows.\n");
    return 0;
}

#endif // _WIN32
