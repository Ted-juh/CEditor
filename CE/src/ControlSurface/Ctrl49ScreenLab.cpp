// CTRL49 screen lab — the on-hardware half of tools/ctrl49/screen-lab. Uploads a Lua page with
// its PNGs and drives it from the keyboard:
//
//   Ctrl49ScreenLab showcase <screen-lab dir>   six pages of what baked PNGs can look like,
//                                               the last one animated: Page </> walks them, the
//                                               encoders and pads play
//   Ctrl49ScreenLab stress   <screen-lab dir>   E1-E6 raise the drawing load until the screen
//                                               stutters or the watchdog gives up; the console
//                                               prints the load that did it
//   Ctrl49ScreenLab preset   <manifest>         a design (era-presets, feature-mockups,
//                                               design-presets, machined-metal): its pages,
//                                               their encoders, at its own rate
//   Ctrl49ScreenLab preset   <manifest> --check the manifest's rules, its files and its memory
//                                               guard, without the keyboard
//   Ctrl49ScreenLab size                        how large a page script the keyboard takes: pages
//                                               of real code, larger each time, until it refuses
//                                               one, then the gap halved to the limit
//   Ctrl49ScreenLab upload   <screen-lab dir>   PNGs uploaded while a page runs and redraws, each
//                                               then decoded and shown: what Section and Labels
//                                               would need, and how fast
//
// Every mode prints the keyboard's refusals as they arrive (each display command is answered:
// out of memory, a Lua script error, ...), and preset mode counts its answers after the upload,
// so a design that is too much for the keyboard says how.
//
// Everything sent is built in Ctrl49ScreenLab.h and Ctrl49ScreenLabPreset.h, where it is tested
// and where the browser preview gets the same bytes. Windows-only. Single-owner named mutex;
// Ctrl+C exits cleanly.
//
// A third argument, --no-upload-keepalive, uploads the way HoSTage does (no keepalives between
// PNG chunks). The lab uploads far more than HoSTage, so by default it keeps the watchdog fed
// during the upload; turning that off shows whether the upload alone is too long for it.

#ifdef _WIN32

#include "Ctrl49PrivateInput.h"
#include "Ctrl49Reducer.h"
#include "Ctrl49ScreenLab.h"
#include "Ctrl49ScreenLabPreset.h"
#include "Ctrl49Session.h"
#include "Ctrl49WinMmOutput.h"

#ifndef NOMINMAX
 #define NOMINMAX
#endif
#include <windows.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <mutex>
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
    std::printf ("usage: Ctrl49ScreenLab showcase|stress <tools\\ctrl49\\screen-lab folder> [--no-upload-keepalive]\n"
                 "       Ctrl49ScreenLab preset <name.ctrl49preset> [--check] [--no-upload-keepalive]\n"
                 "       Ctrl49ScreenLab size [--no-upload-keepalive]\n"
                 "       Ctrl49ScreenLab upload <tools\\ctrl49\\screen-lab folder>\n");
    return 2;
}

// The keyboard's answers to display commands, counted per command. Refusals are printed as they
// arrive, on the capture thread; the counts are read after the upload.
struct Replies
{
    std::mutex mutex;
    std::map<std::string, std::pair<int, int>> byCommand;     // command -> ok, refused
    std::string firstRefusal;

    void observe (const Bytes& frame)
    {
        const auto ack = parseAck (frame);
        if (! ack)
            return;
        const auto command = displayCommandName (ack->command);
        std::lock_guard<std::mutex> lock (mutex);
        auto& counts = byCommand[command];
        if (ack->ok())
        {
            ++counts.first;
            return;
        }
        ++counts.second;
        const auto line = "The keyboard refused " + command + ": " + ackStatusName (ack->status);
        if (firstRefusal.empty())
            firstRefusal = line;
        logLine ("  " + line);
    }

    void reset()
    {
        std::lock_guard<std::mutex> lock (mutex);
        byCommand.clear();
        firstRefusal.clear();
    }

    int refused()
    {
        std::lock_guard<std::mutex> lock (mutex);
        int count = 0;
        for (const auto& entry : byCommand)
            count += entry.second.second;
        return count;
    }

    int answered (const std::string& command)
    {
        std::lock_guard<std::mutex> lock (mutex);
        const auto found = byCommand.find (command);
        return found == byCommand.end() ? 0 : found->second.first;
    }

    std::string summary()
    {
        std::lock_guard<std::mutex> lock (mutex);
        std::string out;
        int refused = 0;
        for (const auto& [command, counts] : byCommand)
        {
            out += (out.empty() ? "" : ", ") + command + " " + std::to_string (counts.first) + " ok";
            if (counts.second > 0)
                out += " / " + std::to_string (counts.second) + " refused";
            refused += counts.second;
        }
        if (out.empty())
            return "no answers from the keyboard yet";
        return "answers: " + out + (refused > 0 ? " (first refusal: " + firstRefusal + ")" : "");
    }
};

int runPreset (const std::filesystem::path& manifest, bool checkOnly, bool uploadKeepalive);
int runSizeSweep (bool uploadKeepalive);
int runUploadProbe (const std::filesystem::path& labDir);
} // namespace

namespace
{
int runPreset (const std::filesystem::path& manifest, bool checkOnly, bool uploadKeepalive)
{
    const auto loaded = lab::loadPreset (manifest);
    if (! loaded.preset)
    {
        std::printf ("%s does not load:\n", manifest.string().c_str());
        for (const auto& error : loaded.errors)
            std::printf ("  %s\n", error.c_str());
        return 1;
    }
    const auto& preset = *loaded.preset;
    std::size_t pngBytes = 0;
    std::vector<Ctrl49Session::PngAsset> assets;
    for (const auto& [id, png] : loaded.pngs)
    {
        pngBytes += png.size();
        assets.push_back ({ (std::uint16_t) id, png });
    }
    logLine (lab::describe (preset, loaded.lua.size(), pngBytes));
    if (checkOnly)
    {
        logLine ("The manifest, its files and its memory guard are in order. Nothing was sent.");
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

    int exitCode = 0;
    Replies replies;
    try
    {
        const auto portId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
        if (! portId)
            throw std::runtime_error ("output port 'CTRL49 USB' not found");
        Ctrl49WinMmOutput output (*portId);
        Ctrl49PrivateInput input;
        input.setObserver ([&replies] (const Bytes& frame) { replies.observe (frame); });
        logLine ("Opening hidden cable-2 capture...");
        input.start (Ctrl49PrivateInput::discoverDevicePath());

        Ctrl49SessionOptions options;
        options.log = logLine;
        options.keepaliveEveryUploadFrames = uploadKeepalive ? 48 : 0;
        // A preset decodes its atlases one per draw behind the loading screen; 1.8 s is what
        // Machined Metal was run on the keyboard with.
        options.loadingMilliseconds = 1800;
        Ctrl49Session session (output, loaded.lua, assets, options);
        logLine ("Uploading the page and " + std::to_string (assets.size()) + " PNGs"
                 + (uploadKeepalive ? ", keeping the watchdog fed..." : ", with no keepalives..."));
        const auto uploadStart = Clock::now();
        session.start();
        logLine ("Upload and startup took " + std::to_string ((int) millisecondsSince (uploadStart)) + " ms.");
        std::this_thread::sleep_for (std::chrono::milliseconds (300));      // the last answers
        logLine ("After the upload, " + replies.summary());

        // Each page keeps its own encoders, starting where the manifest says.
        std::vector<std::array<int, 8>> encoders;
        for (const auto& page : preset.pageList)
            encoders.push_back (page.values);
        int page = 0, lastEncoder = 0, frame = 0;
        std::uint8_t padsLit = 0;
        std::array<int, 4> sentEnvelope { -1, -1, -1, -1 };
        // Page Left / Right (and the mode buttons) through the reducer, bounded to the preset's
        // pages; Shift + Page is the setlist's, not a page turn.
        Ctrl49Reducer reducer;
        reducer.setPageCount (preset.pages);
        const auto interval = std::chrono::milliseconds (1000 / preset.fps);
        auto nextRedraw = Clock::now();
        auto windowStart = Clock::now();
        int windowRedraws = 0;
        double windowSendMs = 0.0;
        logLine ("Page < > walks " + std::to_string (preset.pages) + " pages; every 10 s the console says "
                 "how many redraws went out and what the keyboard answered. Ctrl+C to stop.");
        logLine ("Page: " + preset.pageList[0].title);

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
                const auto action = reducer.process (bytes.data(), bytes.size());
                if (! action)
                    continue;
                if (action->pageChanged)
                {
                    page = reducer.page();
                    lastEncoder = 0;
                    logLine ("Page: " + preset.pageList[(std::size_t) page].title);
                }
                // A page answers only the encoders its manifest gives it.
                if (action->encoderMoved && action->encoderSlot >= 0
                    && action->encoderSlot < preset.pageList[(std::size_t) page].encoders)
                {
                    auto& value = encoders[(std::size_t) page][(std::size_t) action->encoderSlot];
                    value = std::clamp (value + action->encoderDelta, 0, 127);
                    lastEncoder = action->encoderSlot;
                }
                if (action->padChanged && action->pad >= 1 && action->pad <= 8)
                {
                    const auto bit = (std::uint8_t) (1u << (action->pad - 1));
                    padsLit = action->velocity > 0 ? (std::uint8_t) (padsLit | bit) : (std::uint8_t) (padsLit & ~bit);
                }
            }

            if (Clock::now() < nextRedraw)
            {
                std::this_thread::sleep_for (std::chrono::milliseconds (1));
                continue;
            }
            nextRedraw = Clock::now() + interval;
            ++frame;

            const auto sendStart = Clock::now();
            const auto& e = encoders[(std::size_t) page];
            if (page == preset.envelopePage)
            {
                const std::array<int, 4> wanted { e[0], e[1], e[2], e[3] };
                if (wanted != sentEnvelope)
                {
                    session.callLua ("set_envelope", lab::buildEnvelope (e[0], e[1], e[2], e[3]), false);
                    sentEnvelope = wanted;
                }
            }
            session.callLua ("set_frame", lab::buildShowcaseFrame (page, frame, e, lastEncoder, 0, 0, 0, padsLit), true);
            windowSendMs += millisecondsSince (sendStart);
            ++windowRedraws;

            if (millisecondsSince (windowStart) >= 10000.0)
            {
                char line[96];
                std::snprintf (line, sizeof line, "  %.1f redraws/s sent (asked %d), %.1f ms to send each; ",
                               windowRedraws / 10.0, preset.fps, windowSendMs / windowRedraws);
                logLine (line + replies.summary());
                windowStart = Clock::now();
                windowRedraws = 0;
                windowSendMs = 0.0;
            }
        }

        logLine ("Stopping...");
        session.stop();
        input.stop();
        logLine ("Screen lab stopped cleanly. " + replies.summary());
    }
    catch (const std::exception& error)
    {
        std::printf ("ERROR: %s\n%s\n", error.what(), replies.summary().c_str());
        exitCode = 1;
    }

    ReleaseMutex (mutex);
    CloseHandle (mutex);
    return exitCode;
}

// The script-size probe: one session per size, the keyboard's answers deciding each. A size
// passes when the page was bound, its init and draw answered ok and nothing was refused; a
// refusal (out of memory, a Lua script error) fails it. Silence is neither: a keyboard that
// answers nothing has stopped listening, and halving the gap over silence would find a limit
// that is not there, so the sweep stops and says so.
int runUploadProbe (const std::filesystem::path& labDir)
{
    // Smallest first: what a page of words would be, up to a whole section's picture and more.
    // Each decodes into the buffer after its id, as every page that draws does.
    const std::pair<const char*, std::uint16_t> files[] {
        { "surface_atlas.png", 0x0300 }, { "rich_atlas.png", 0x0302 }, { "lab_bg.png", 0x0304 },
        { "stress_textured.png", 0x0306 }, { "machined-metal/panels.png", 0x0308 }, { "logo_strip.png", 0x030A },
    };
    Bytes rawLua;
    std::vector<Bytes> pngs;
    try
    {
        rawLua = readFile (labDir / "Hostage_Upload.lua");
        for (const auto& [name, id] : files)
            pngs.push_back (readFile (labDir / name));
    }
    catch (const std::exception& error)
    {
        std::printf ("%s\n", error.what());
        return 2;
    }

    HANDLE mutex = CreateMutexW (nullptr, TRUE, L"Local\\CEditor_CTRL49_Bridge");
    if (mutex == nullptr || GetLastError() == ERROR_ALREADY_EXISTS)
    {
        std::printf ("A CTRL49 bridge is already running (close HoSTage / CEditor first).\n");
        if (mutex != nullptr) CloseHandle (mutex);
        return 1;
    }
    SetConsoleCtrlHandler (consoleHandler, TRUE);

    int exitCode = 0;
    Replies replies;
    try
    {
        const auto portId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
        if (! portId)
            throw std::runtime_error ("output port 'CTRL49 USB' not found");
        Ctrl49WinMmOutput output (*portId);
        Ctrl49PrivateInput input;
        input.setObserver ([&replies] (const Bytes& frame) { replies.observe (frame); });
        logLine ("Opening hidden cable-2 capture...");
        input.start (Ctrl49PrivateInput::discoverDevicePath());

        Ctrl49SessionOptions options;
        options.log = logLine;
        options.loadingMilliseconds = 600;
        Ctrl49Session session (output, rawLua, {}, options);
        session.start();
        std::this_thread::sleep_for (std::chrono::milliseconds (300));
        logLine ("Page up. " + replies.summary());

        // Ten redraws a second from a thread of its own, as HoSTage's broker sends them, so the
        // upload has to share the cable with them.
        std::atomic<bool> stopRedraws { false };
        std::atomic<int> redrawsSent { 0 };
        std::string redrawFailure;
        std::thread redraws ([&]
        {
            int frame = 0;
            while (! stopRedraws.load())
            {
                try
                {
                    ++frame;
                    session.callLua ("set_frame", { (std::uint8_t) ((frame >> 8) & 0xFF), (std::uint8_t) (frame & 0xFF) }, true);
                    ++redrawsSent;
                }
                catch (const std::exception& error)
                {
                    redrawFailure = error.what();
                    return;
                }
                std::this_thread::sleep_for (std::chrono::milliseconds (100));
            }
        });

        logLine ("Uploading six PNGs while the page redraws, smallest first; each is then decoded and shown "
                 "in a row of its own. Watch the orange bar: it should keep moving.");
        for (std::size_t i = 0; i < pngs.size() && ! g_quit.load(); ++i)
        {
            const auto& png = pngs[i];
            const auto id = files[i].second;
            replies.reset();
            const auto redrawsBefore = redrawsSent.load();
            const auto start = Clock::now();
            const auto frames = session.uploadPng (id, png);
            const auto ms = (int) millisecondsSince (start);
            const auto during = redrawsSent.load() - redrawsBefore;
            const auto kb = (int) ((png.size() + 1023) / 1024);
            session.callLua ("show", { (std::uint8_t) i, (std::uint8_t) (id >> 8), (std::uint8_t) (id & 0xFF),
                                       (std::uint8_t) (kb >> 8), (std::uint8_t) (kb & 0xFF),
                                       (std::uint8_t) (std::min (ms, 65535) >> 8), (std::uint8_t) (std::min (ms, 65535) & 0xFF) },
                             true);
            std::this_thread::sleep_for (std::chrono::milliseconds (1500));
            char line[200];
            std::snprintf (line, sizeof line, "  %-20s %4d KB in %5d ms (%d KB/s, %zu frames); %d redraws went out during it (%d expected)",
                           files[i].first, kb, ms, ms > 0 ? kb * 1000 / ms : 0, frames, during, ms / 100);
            logLine (line);
            logLine ("    " + replies.summary());
            if (! session.failure().empty())
                throw std::runtime_error (session.failure());
        }
        logLine ("Done. On the keyboard each row should have a piece of a picture beside its size. "
                 "Write down which rows do. Ctrl+C to stop.");
        while (! g_quit.load() && session.failure().empty() && redrawFailure.empty())
            std::this_thread::sleep_for (std::chrono::milliseconds (100));
        stopRedraws.store (true);
        redraws.join();
        if (! redrawFailure.empty())
            throw std::runtime_error (redrawFailure);
        session.stop();
        input.stop();
    }
    catch (const std::exception& error)
    {
        std::printf ("ERROR: %s\n", error.what());
        exitCode = 1;
    }

    ReleaseMutex (mutex);
    CloseHandle (mutex);
    return exitCode;
}

int runSizeSweep (bool uploadKeepalive)
{
    HANDLE mutex = CreateMutexW (nullptr, TRUE, L"Local\\CEditor_CTRL49_Bridge");
    if (mutex == nullptr || GetLastError() == ERROR_ALREADY_EXISTS)
    {
        std::printf ("A CTRL49 bridge is already running (close HoSTage / CEditor first).\n");
        if (mutex != nullptr) CloseHandle (mutex);
        return 1;
    }
    SetConsoleCtrlHandler (consoleHandler, TRUE);

    int exitCode = 0;
    Replies replies;
    lab::SizeSweep sweep;
    try
    {
        const auto portId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
        if (! portId)
            throw std::runtime_error ("output port 'CTRL49 USB' not found");
        Ctrl49WinMmOutput output (*portId);
        Ctrl49PrivateInput input;
        input.setObserver ([&replies] (const Bytes& frame) { replies.observe (frame); });
        logLine ("Opening hidden cable-2 capture...");
        input.start (Ctrl49PrivateInput::discoverDevicePath());
        logLine ("Script-size test: pages of real code, " + std::to_string (lab::SizeSweep::kStartKb) + " KB first, "
                 "doubling until the keyboard refuses one (or " + std::to_string (lab::SizeSweep::kMaxKb)
                 + " KB passes), then the gap halved three times. Each size shows on the keyboard for two "
                 "seconds. Ctrl+C to stop.");

        for (int kb = sweep.next(); kb != 0 && ! g_quit.load(); kb = sweep.next())
        {
            const auto script = lab::buildSizeProbe ((std::size_t) kb * 1024, kb);
            Bytes lua (script.begin(), script.end());
            replies.reset();
            Ctrl49SessionOptions options;
            options.log = [] (const std::string&) {};
            options.keepaliveEveryUploadFrames = uploadKeepalive ? 48 : 0;
            std::string problem;
            const auto start = Clock::now();
            int seconds = 0;
            {
                Ctrl49Session session (output, lua, {}, options);
                try
                {
                    session.start();
                    seconds = (int) (millisecondsSince (start) / 1000.0 + 0.5);
                    for (int waited = 0; waited < 2000 && ! g_quit.load(); waited += 100)
                    {
                        std::this_thread::sleep_for (std::chrono::milliseconds (100));
                        if (! session.failure().empty())
                            throw std::runtime_error (session.failure());
                    }
                    session.callLua ("set_mode", { 0x01 }, true);
                    std::this_thread::sleep_for (std::chrono::milliseconds (300));
                }
                catch (const std::exception& error)
                {
                    problem = error.what();
                }
                session.stop();
            }
            if (! input.failure().empty() || ! input.running())
                throw std::runtime_error ("the keyboard's hidden input stopped at " + std::to_string (kb)
                                          + " KB; switch the CTRL49 off and on. " + sweep.answer());

            const int refusals = replies.refused();
            const bool ran = problem.empty() && refusals == 0 && replies.answered ("bind Lua") > 0
                          && replies.answered ("Lua call") > 0 && replies.answered ("draw") > 0;
            if (problem.empty() && refusals == 0 && ! ran)
            {
                logLine ("  " + std::to_string (kb) + " KB: the keyboard did not answer at all. Switch the CTRL49 "
                         "off and on, then run the test again. " + replies.summary());
                exitCode = 1;
                break;
            }
            sweep.record (kb, ran);
            if (ran)
                logLine ("  " + std::to_string (kb) + " KB: loaded and ran (upload and startup "
                         + std::to_string (seconds) + " s)");
            else
                logLine ("  " + std::to_string (kb) + " KB: did not run. "
                         + (problem.empty() ? replies.summary() : problem + ". " + replies.summary()));
            std::this_thread::sleep_for (std::chrono::milliseconds (2000));   // the watchdog's screen between sizes
        }
        input.stop();
        logLine (sweep.answer());
    }
    catch (const std::exception& error)
    {
        std::printf ("ERROR: %s\n", error.what());
        exitCode = 1;
    }

    ReleaseMutex (mutex);
    CloseHandle (mutex);
    return exitCode;
}
} // namespace

int wmain (int argc, wchar_t** argv)
{
    if (argc >= 2 && std::wstring (argv[1]) == L"size")
        return runSizeSweep (! (argc >= 3 && std::wstring (argv[2]) == L"--no-upload-keepalive"));
    if (argc >= 3 && std::wstring (argv[1]) == L"upload")
        return runUploadProbe (argv[2]);
    if (argc < 3)
        return usage();

    const std::wstring mode = argv[1];
    if (mode == L"preset")
    {
        bool check = false, keepalive = true;
        for (int i = 3; i < argc; ++i)
        {
            check = check || std::wstring (argv[i]) == L"--check";
            keepalive = keepalive && std::wstring (argv[i]) != L"--no-upload-keepalive";
        }
        return runPreset (argv[2], check, keepalive);
    }
    const bool stress = mode == L"stress";
    if (! stress && mode != L"showcase")
        return usage();
    const std::filesystem::path labDir = argv[2];
    const bool uploadKeepalive = ! (argc >= 4 && std::wstring (argv[3]) == L"--no-upload-keepalive");

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
            // The flat block and the textured one, and a second upload of each for the late
            // decodes into the id after their own upload (Hostage_Stress.lua, BLOCKS).
            const auto flat = readFile (labDir / "stress_block.png");
            const auto textured = readFile (labDir / "stress_textured.png");
            assets.push_back ({ 0x0250, flat });
            assets.push_back ({ 0x0260, textured });
            assets.push_back ({ 0x0270, flat });
            assets.push_back ({ 0x0278, textured });
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
        Replies replies;                      // before the input, which calls into it until it stops
        Ctrl49PrivateInput input;
        input.setObserver ([&replies] (const Bytes& frame) { replies.observe (frame); });
        logLine ("Opening hidden cable-2 capture...");
        input.start (devicePath);

        Ctrl49SessionOptions options;
        options.log = logLine;
        // ~48 chunks is ~24 KB between keepalives: well inside the ~900 ms watchdog even over
        // a slow link, and still few enough extra frames to be invisible in the upload time.
        options.keepaliveEveryUploadFrames = uploadKeepalive ? 48 : 0;
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
            const auto interval = std::chrono::milliseconds (
                stress ? 1000 / load.fps : lab::showcaseIntervalMs (page, encoders[(std::size_t) page][0]));
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
                if (page == lab::kAnimationPage)
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
