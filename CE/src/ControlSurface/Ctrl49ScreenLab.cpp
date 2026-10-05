// CTRL49 screen lab — the on-hardware half of tools/ctrl49/screen-lab. Uploads one of two Lua
// pages with its PNGs and drives it from the keyboard:
//
//   Ctrl49ScreenLab showcase <screen-lab dir>   six pages of what baked PNGs can look like,
//                                               the last one animated: Page </> walks them, the
//                                               encoders and pads play
//   Ctrl49ScreenLab stress   <screen-lab dir>   E1-E6 raise the drawing load until the screen
//                                               stutters or the watchdog gives up; the console
//                                               prints the load that did it
//
// Everything sent is built in Ctrl49ScreenLab.h, where it is tested and where the browser
// preview gets the same bytes. Windows-only. Single-owner named mutex; Ctrl+C exits cleanly.
//
// A third argument, --no-upload-keepalive, uploads the way HoSTage does (no keepalives between
// PNG chunks). The lab uploads far more than HoSTage, so by default it keeps the watchdog fed
// during the upload; turning that off shows whether the upload alone is too long for it.

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
#include <set>

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

std::string utf8 (const std::wstring& text)
{
    if (text.empty()) return {};
    const int size = WideCharToMultiByte (CP_UTF8, 0, text.data(), (int) text.size(), nullptr, 0, nullptr, nullptr);
    std::string result ((std::size_t) size, '\0');
    WideCharToMultiByte (CP_UTF8, 0, text.data(), (int) text.size(), result.data(), size, nullptr, nullptr);
    return result;
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
    std::printf ("usage: Ctrl49ScreenLab showcase|stress <screen-lab folder> [--no-upload-keepalive]\n"
                 "       Ctrl49ScreenLab preset <name.ctrl49preset> [--check]\n");
    return 2;
}
} // namespace

int wmain (int argc, wchar_t** argv)
{
    if (argc < 3)
        return usage();

    const std::wstring mode = argv[1];
    const bool stress = mode == L"stress";
    const bool preset = mode == L"preset";
    if (! stress && ! preset && mode != L"showcase")
        return usage();
    const auto presetPath = std::filesystem::absolute (argv[2]);
    const std::filesystem::path labDir = preset ? presetPath.parent_path() : presetPath;
    const bool uploadKeepalive = ! (argc >= 4 && std::wstring (argv[3]) == L"--no-upload-keepalive");
    const bool checkOnly = argc >= 4 && std::wstring (argv[3]) == L"--check";
    int pageCount = lab::kShowcasePages, envelopePage = 3, presetFps = 10;
    std::array<std::array<int, 8>, lab::kShowcasePages> presetValues {};
    std::array<int, lab::kShowcasePages> presetSlots {};
    std::array<std::string, lab::kShowcasePages> presetTitles {};

    Bytes rawLua;
    std::vector<Ctrl49Session::PngAsset> assets;
    try
    {
        if (preset)
        {
            if (! std::filesystem::is_regular_file (presetPath))
                throw std::runtime_error ("preset file not found");
            const auto field = [&] (const std::wstring& section, const wchar_t* key) {
                wchar_t value[512] {};
                GetPrivateProfileStringW (section.c_str(), key, L"", value, 512, presetPath.c_str());
                return std::wstring (value);
            };
            const auto number = [&] (const std::wstring& section, const wchar_t* key, int low, int high) {
                const auto text = field (section, key);
                std::size_t used = 0;
                const int n = std::stoi (text, &used);
                if (used != text.size() || n < low || n > high)
                    throw std::runtime_error ("preset number outside supported range");
                return n;
            };
            const auto localFile = [&] (const std::wstring& filename) {
                const std::filesystem::path leaf (filename);
                if (filename.empty() || leaf.has_parent_path() || leaf.is_absolute()
                    || filename.find (L':') != std::wstring::npos || filename == L".")
                    throw std::runtime_error ("preset assets must be files beside the preset");
                return labDir / leaf;
            };
            number (L"Preset", L"version", 1, 1);
            number (L"Preset", L"width", 480, 480);
            number (L"Preset", L"height", 272, 272);
            pageCount = number (L"Preset", L"pages", 1, lab::kShowcasePages);
            envelopePage = number (L"Preset", L"envelopePage", -1, pageCount - 1);
            presetFps = number (L"Preset", L"fps", 5, 30);
            rawLua = readFile (localFile (field (L"Preset", L"lua")));
            if (rawLua.empty() || rawLua.size() > 65536)
                throw std::runtime_error ("preset Lua must be 1..65536 bytes");
            std::set<int> ids;
            std::size_t decodedBytes = 0;
            const int count = number (L"Preset", L"assets", 1, 8);
            for (int i = 0; i < count; ++i)
            {
                const auto section = L"Asset" + std::to_wstring (i);
                const int id = number (section, L"id", 512, 1023);
                if (! ids.insert (id).second) throw std::runtime_error ("duplicate preset asset id");
                auto png = readFile (localFile (field (section, L"file")));
                const Bytes signature { 137, 80, 78, 71, 13, 10, 26, 10 };
                if (png.size() < 33 || ! std::equal (signature.begin(), signature.end(), png.begin()))
                    throw std::runtime_error ("preset asset is not a PNG");
                const auto dimension = [&] (int offset) {
                    std::uint32_t n = 0;
                    for (int b = 0; b < 4; ++b) n = (n << 8) | png[(std::size_t) offset + b];
                    if (n == 0 || n > 8192) throw std::runtime_error ("unsupported preset PNG dimensions");
                    return n;
                };
                decodedBytes += (std::size_t) dimension (16) * dimension (20) * 4;
                assets.push_back ({ (std::uint16_t) id, std::move (png) });
            }
            if (decodedBytes > 8 * 1024 * 1024)
                throw std::runtime_error ("preset exceeds the lab's 8 MiB decoded-image budget");
            for (int p = 0; p < pageCount; ++p)
            {
                const auto section = L"Page" + std::to_wstring (p);
                const auto title = field (section, L"title");
                presetTitles[p] = utf8 (title);
                presetSlots[p] = number (section, L"encoders", 1, 8);
                for (int e = 0; e < 8; ++e)
                    presetValues[p][e] = number (section, (L"e" + std::to_wstring (e + 1)).c_str(), 0, 127);
            }
            const auto name = field (L"Preset", L"name");
            logLine ("Preset: " + utf8 (name) + " / 480 x 272 / "
                     + std::to_string (pageCount) + " pages / " + std::to_string (presetFps) + " redraws/s");
            logLine ("Decoded RGBA image budget: " + std::to_string (decodedBytes / 1024) + " KiB.");
        }
        else
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
            assets.push_back ({ 0x0238, readFile (labDir / "logo_strip.png") });
            assets.push_back ({ 0x023A, readFile (labDir / "spinner_strip.png") });
        }
        }
    }
    catch (const std::exception& error)
    {
        std::printf ("%s\nCheck the preset and its companion PNG/Lua files.\n", error.what());
        return 2;
    }

    std::size_t uploadBytes = rawLua.size();
    for (const auto& asset : assets)
        uploadBytes += asset.png.size();
    if (checkOnly)
    {
        logLine ("Validated files and asset budget: " + std::to_string (uploadBytes) + " upload bytes. No device opened.");
        return 0;
    }

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
        // ~48 chunks is ~24 KB between keepalives: well inside the ~900 ms watchdog even over
        // a slow link, and still few enough extra frames to be invisible in the upload time.
        options.keepaliveEveryUploadFrames = uploadKeepalive ? 48 : 0;
        if (preset) options.loadingMilliseconds = 1800; // one staged atlas decode per draw
        Ctrl49Session session (output, rawLua, assets, options);

        logLine ("Uploading " + std::to_string (uploadBytes / 1024) + " KB (page + "
                 + std::to_string (assets.size()) + " PNGs), "
                 + (uploadKeepalive ? "keeping the watchdog fed..." : "with no keepalives, as HoSTage does..."));
        const auto uploadStart = Clock::now();
        session.start();
        logLine ("Upload and startup took " + std::to_string ((int) millisecondsSince (uploadStart)) + " ms.");

        // The lab keeps its own encoder values and page: the reducer's four pages are one
        // fewer than the showcase has. Each page remembers its own encoders.
        std::array<std::array<int, 8>, lab::kShowcasePages> encoders {};
        for (auto& pageEncoders : encoders)
            pageEncoders.fill (64);
        if (preset) encoders = presetValues;
        if (stress)
        {
            encoders[0].fill (0);
            encoders[0][5] = 39;                      // about 10 redraws per second to start
        }
        int page = 0, lastEncoder = 0, frame = 0;
        std::uint8_t padsLit = 0;
        std::array<int, 4> sentEnvelope { -1, -1, -1, -1 };

        Ctrl49Reducer reducer;
        if (preset) reducer.setPageCount (pageCount);
        const auto start = Clock::now();
        auto nextRedraw = Clock::now();
        auto windowStart = Clock::now();
        int windowRedraws = 0;
        double windowSendMs = 0.0;

        if (stress)
            logLine ("Stress page. E1 rects, E2 sprites, E3 texts, E4 full-screen blits, E5 memory, "
                     "E6 redraws/s. Raise one at a time; note the load when the orange bar stops "
                     "gliding. Ctrl+C to stop.");
        else if (preset)
            logLine ("Page < > selects the test page. E1-E4: knobs / ADSR; E1-E8: mixer. "
                     "Demonstration values only; no synth output. Ctrl+C to stop.");
        else
            logLine ("Showcase. Page < > walks FADERS, PADS, SEQUENCER, ENVELOPE, METERS, "
                     "ANIMATION; the encoders and pads play each page (on ANIMATION, E1 sets the "
                     "redraw rate). Ctrl+C to stop.");

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
                if (! stress && ! preset && bytes.size() >= 3 && (bytes[0] & 0xF0) == 0xB0 && bytes[2] == 127
                    && (bytes[1] == 39 || bytes[1] == 40))
                {
                    page = (page + (bytes[1] == 40 ? 1 : lab::kShowcasePages - 1)) % lab::kShowcasePages;
                    logLine (std::string ("Page: ") + lab::kShowcasePageNames[page]);
                }

                const auto action = reducer.process (bytes.data(), bytes.size());
                if (! action)
                    continue;
                if (preset && action->pageChanged)
                {
                    page = reducer.page();
                    lastEncoder = 0;
                    logLine ("Page: " + presetTitles[page]);
                }
                if (action->encoderMoved && action->encoderSlot >= 0 && action->encoderSlot < 8)
                {
                    if (preset && action->encoderSlot >= presetSlots[page]) continue;
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
            const auto interval = std::chrono::milliseconds (
                stress ? 1000 / load.fps : preset ? 1000 / presetFps
                    : lab::showcaseIntervalMs (page, encoders[(std::size_t) page][0]));
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
                if (page == envelopePage)
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
                if (! preset && page == lab::kAnimationPage)
                {
                    static int loggedFps = -1;
                    if (const auto fps = lab::animationFps (e[0]); fps != loggedFps)
                        logLine ("Animation: " + std::to_string (loggedFps = fps) + " redraws/s");
                }
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
