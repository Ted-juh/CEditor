// CEditor CTRL49 Bridge — the self-contained product exe. Double-click and it turns the
// CTRL49 into a control surface for a hardware synth: eight filmstrip knobs bound to real
// device parameters (default: GAIA filter/amp), with Page Left/Right switching pages.
// `--presets` runs the patch browser instead (data dial scrolls, dial-press loads).
//
// Everything is embedded in the binary — Lua pages, filmstrip, default assignment, preset
// bank, and the GAIA profile — so no files need to sit beside the exe. Optional overrides:
//
//   Ctrl49Bridge.exe [assignment.json] [synth-port]
//   Ctrl49Bridge.exe --presets [presetbank.json] [synth-port]
//   Ctrl49Bridge.exe --selftest        (no hardware; verifies embedded assets + compile)
//
// If the synth port is not found, the bridge lists the available ports and asks. Close
// VIP / your DAW first (they hold the CTRL49 hidden input). Ctrl+C stops cleanly; the
// keyboard watchdog then restores its normal screen. Windows-only, single-owner.

#ifdef _WIN32

#include "Ctrl49Assignment.h"
#include "Ctrl49EmbeddedAssets.h"
#include "Ctrl49PresetBank.h"
#include "Ctrl49PrivateInput.h"
#include "Ctrl49Reducer.h"
#include "Ctrl49Session.h"
#include "Ctrl49WinMmOutput.h"

#include "DeviceProfile/DeviceProfileEngine.h"

#ifndef NOMINMAX
 #define NOMINMAX
#endif
#include <windows.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <thread>

namespace
{
using namespace ceditor::ctrl49;

constexpr int kVisibleRows = 6;

std::atomic<bool> g_quit { false };
BOOL WINAPI consoleHandler (DWORD s) { if (s == CTRL_C_EVENT || s == CTRL_CLOSE_EVENT) { g_quit.store (true); return TRUE; } return FALSE; }
void logLine (const std::string& t) { std::printf ("%s\n", t.c_str()); std::fflush (stdout); }

std::string toUtf8 (const std::wstring& w) { std::string o; for (wchar_t c : w) o += static_cast<char> (c < 128 ? c : '?'); return o; }

juce::String assetString (const unsigned char* data, unsigned int size)
{
    return juce::String::fromUTF8 (reinterpret_cast<const char*> (data), static_cast<int> (size));
}

Bytes assetBytes (const unsigned char* data, unsigned int size)
{
    return Bytes (data, data + size);
}

bool readFileBytes (const wchar_t* path, Bytes& out)
{
    std::FILE* fp = _wfopen (path, L"rb");
    if (! fp) return false;
    std::fseek (fp, 0, SEEK_END); const long n = std::ftell (fp); std::fseek (fp, 0, SEEK_SET);
    out.resize (static_cast<std::size_t> (n));
    const bool ok = std::fread (out.data(), 1, static_cast<std::size_t> (n), fp) == static_cast<std::size_t> (n);
    std::fclose (fp);
    return ok;
}

// When double-clicked, this process owns its console and the window vanishes at exit —
// pause so messages stay readable. When run from a shell, exit normally.
bool ownsConsole()
{
    DWORD ids[2];
    return GetConsoleProcessList (ids, 2) == 1;
}

void maybePause()
{
    if (! ownsConsole()) return;
    std::printf ("\nPress Enter to close.\n");
    std::string line;
    std::getline (std::cin, line);
}

// Resolve a synth output port; if not found, list ports and ask interactively.
std::unique_ptr<Ctrl49WinMmOutput> openSynthPort (std::wstring wanted, const char* what)
{
    for (;;)
    {
        if (! wanted.empty())
        {
            std::wstring actual;
            if (const auto id = Ctrl49WinMmOutput::findPort (wanted, &actual))
            {
                logLine (std::string (what) + " port: " + toUtf8 (actual));
                return std::make_unique<Ctrl49WinMmOutput> (*id);
            }
            logLine (std::string (what) + " port '" + toUtf8 (wanted) + "' not found.");
        }
        logLine ("Available MIDI output ports:");
        for (const auto& n : Ctrl49WinMmOutput::listOutputPortNames())
            logLine ("    " + toUtf8 (n));
        std::printf ("Type (part of) the %s port name, or press Enter to abort: ", what);
        std::fflush (stdout);
        std::string line;
        if (! std::getline (std::cin, line) || line.empty())
            return nullptr;
        wanted.assign (line.begin(), line.end());
    }
}

// A per-profile engine with its parameter range map.
struct SynthEngine
{
    std::unique_ptr<ceditor::device::DeviceProfileEngine> engine;
    struct Range { int min = 0; int max = 127; };
    std::map<juce::String, Range> ranges;

    bool load (const juce::String& profileKey, const juce::File& baseDir, juce::String& error)
    {
        engine = std::make_unique<ceditor::device::DeviceProfileEngine>();
        bool ok = false;
        if (profileKey == "embedded:roland-gaia")
            ok = engine->loadFromJson (assetString (assets::kGaiaProfileJson, assets::kGaiaProfileJsonSize), error);
        else
        {
            const juce::File f = juce::File::isAbsolutePath (profileKey)
                ? juce::File (profileKey) : baseDir.getChildFile (profileKey);
            ok = engine->loadFromFile (f, error);
        }
        if (! ok) return false;

        const juce::var descriptors = engine->listParameterDescriptors();
        if (const auto* arr = descriptors.getArray())
            for (const auto& d : *arr)
                if (auto* o = d.getDynamicObject())
                {
                    Range r;
                    if (auto* ro = o->getProperty ("range").getDynamicObject())
                    {
                        r.min = static_cast<int> (ro->getProperty ("min"));
                        r.max = static_cast<int> (ro->getProperty ("max"));
                    }
                    ranges[o->getProperty ("id").toString()] = r;
                }
        return true;
    }

    int scale (const juce::String& paramId, int encoder) const
    {
        const auto it = ranges.find (paramId);
        const Range r = it != ranges.end() ? it->second : Range {};
        if (r.max <= r.min) return r.min;
        return r.min + static_cast<int> (std::lround (static_cast<double> (r.max - r.min) * encoder / 127.0));
    }
};

juce::String pageProfileKey (const Assignment& a, int pageIndex)
{
    if (pageIndex >= 0 && pageIndex < static_cast<int> (a.pages.size()))
        if (const auto& p = a.pages[static_cast<std::size_t> (pageIndex)].profilePath; p.isNotEmpty())
            return p;
    return a.profilePath;
}

Bytes labelPayload (const AssignmentPage& page)
{
    auto append = [] (Bytes& out, const juce::String& s)
    {
        const juce::String a = s.substring (0, 255);
        out.push_back (static_cast<std::uint8_t> (a.length()));
        for (int i = 0; i < a.length(); ++i) out.push_back (static_cast<std::uint8_t> (a[i] & 0x7F));
    };
    Bytes out;
    append (out, page.title);
    for (const auto& slot : page.slots) append (out, slot.label);
    return out;
}

//==================================================================================================
// Knobs mode: the multi-knob assignment surface (default).

int runKnobs (const Assignment& assignment, const juce::File& baseDir, const std::wstring& portOverride)
{
    juce::String error;

    // One engine per distinct profile key.
    std::map<juce::String, SynthEngine> engines;
    for (int p = 0; p < static_cast<int> (assignment.pages.size()); ++p)
    {
        const juce::String key = pageProfileKey (assignment, p);
        if (engines.count (key)) continue;
        if (! engines[key].load (key, baseDir, error))
        {
            logLine ("profile load failed (" + std::string (key.toRawUTF8()) + "): " + error.toRawUTF8());
            return 2;
        }
        logLine ("Profile: " + std::string (engines[key].engine->getProfileName().toRawUTF8()));
    }

    // Verify every binding compiles before touching hardware.
    for (int p = 0; p < static_cast<int> (assignment.pages.size()); ++p)
    {
        auto& se = engines[pageProfileKey (assignment, p)];
        for (const auto& slot : assignment.pages[static_cast<std::size_t> (p)].slots)
        {
            if (slot.parameterId.isEmpty()) continue;
            const auto probe = se.engine->compileSetParameter (assignment.pageRole (p), slot.parameterId,
                                                               se.scale (slot.parameterId, 64), false);
            if (! probe.ok)
            {
                logLine ("parameter '" + std::string (slot.parameterId.toRawUTF8())
                         + "' did not compile: " + probe.error.toRawUTF8());
                return 2;
            }
        }
    }
    logLine ("All assigned parameters compile.");

    const auto ctrlPortId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
    if (! ctrlPortId) { logLine ("CTRL49 not found: MIDI output 'CTRL49 USB' is missing. Is the keyboard connected?"); return 1; }

    // One synth output per distinct page port (override wins over everything).
    auto portForPage = [&] (int p) -> std::wstring
    {
        if (! portOverride.empty()) return portOverride;
        const juce::String s = assignment.pagePort (p);
        return std::wstring (s.toWideCharPointer());
    };
    std::map<std::wstring, std::unique_ptr<Ctrl49WinMmOutput>> synthOuts;
    for (int p = 0; p < static_cast<int> (assignment.pages.size()); ++p)
    {
        const std::wstring want = portForPage (p);
        if (synthOuts.count (want)) continue;
        auto out = openSynthPort (want, "synth");
        if (! out) return 1;
        synthOuts[want] = std::move (out);
    }

    Ctrl49WinMmOutput ctrlOut (*ctrlPortId);
    Ctrl49PrivateInput input;
    logLine ("Opening hidden cable-2 capture...");
    input.start (Ctrl49PrivateInput::discoverDevicePath());

    Bytes rawLua = assetBytes (assets::kKnobPageLua, assets::kKnobPageLuaSize);
    rawLua.push_back (0x00);
    std::vector<Ctrl49Session::PngAsset> pngs { { 0x0200, assetBytes (assets::kKnobStripPng, assets::kKnobStripPngSize) } };

    Ctrl49SessionOptions options; options.log = logLine;
    Ctrl49Session session (ctrlOut, rawLua, pngs, options);
    logLine ("Starting display session...");
    session.start();

    Ctrl49Reducer reducer;
    reducer.setPageCount (static_cast<int> (assignment.pages.size()));

    auto sendLabels = [&] (int p) { session.callLua ("set_labels", labelPayload (assignment.pages[static_cast<std::size_t> (p)]), false); };
    auto sendValues = [&] ()
    {
        const Bytes vals = reducer.displayArguments();
        Bytes payload; payload.push_back (static_cast<std::uint8_t> (reducer.activeSlot()));
        for (int s = 0; s < 8; ++s) payload.push_back (vals[6 + static_cast<std::size_t> (s)]);
        session.callLua ("set_values", payload, true);
    };
    auto sendToSynth = [&] (int slot)
    {
        const int p = reducer.page();
        const auto& binding = assignment.pages[static_cast<std::size_t> (p)].slots[static_cast<std::size_t> (slot)];
        if (binding.parameterId.isEmpty()) return;
        auto& se = engines[pageProfileKey (assignment, p)];
        const int e = reducer.displayArguments()[6 + static_cast<std::size_t> (slot)];
        const auto result = se.engine->compileSetParameter (assignment.pageRole (p), binding.parameterId,
                                                            se.scale (binding.parameterId, e), false);
        if (! result.ok) return;
        const auto it = synthOuts.find (portForPage (p));
        if (it == synthOuts.end() || ! it->second) return;
        for (const auto& msg : result.transaction.messages)
        {
            Bytes bytes; for (int b : msg.bytes) bytes.push_back (static_cast<std::uint8_t> (b & 0xFF));
            it->second->send (bytes);
        }
    };

    int page = reducer.page();
    sendLabels (page);
    sendValues();
    logLine ("Bridge ready: encoders 1-8 edit, Page Left/Right switches pages. Ctrl+C to stop.");

    auto lastSend = std::chrono::steady_clock::now();
    bool dirty = false;
    int pendingSlot = -1;

    while (! g_quit.load())
    {
        if (! session.failure().empty()) { logLine ("ERROR: " + session.failure()); break; }
        if (! input.failure().empty())   { logLine ("ERROR: " + input.failure()); break; }
        if (! input.running())           { logLine ("ERROR: hidden input stopped"); break; }

        for (auto msg = input.dequeue(); msg; msg = input.dequeue())
        {
            const auto action = reducer.process (msg->data(), msg->size());
            if (! action) continue;
            if (action->render) dirty = true;
            const bool enc = action->text.rfind ("Encoder ", 0) == 0 || action->text.rfind ("Data Dial ", 0) == 0;
            if (enc) pendingSlot = reducer.activeSlot();
            else logLine (action->text);
        }

        if (reducer.page() != page)
        {
            page = reducer.page();
            sendLabels (page);
            pendingSlot = -1;
        }

        const auto now = std::chrono::steady_clock::now();
        if (dirty && now - lastSend >= std::chrono::milliseconds (20))
        {
            if (pendingSlot >= 0) { sendToSynth (pendingSlot); pendingSlot = -1; }
            sendValues();
            dirty = false;
            lastSend = now;
        }
        std::this_thread::sleep_for (std::chrono::milliseconds (2));
    }

    logLine ("Stopping...");
    session.stop();
    input.stop();
    logLine ("Bridge stopped; the keyboard returns to its normal screen shortly.");
    return 0;
}

//==================================================================================================
// Presets mode: the patch browser.

int runPresets (const PresetBank& bank, const std::wstring& portOverride)
{
    const auto ctrlPortId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
    if (! ctrlPortId) { logLine ("CTRL49 not found: MIDI output 'CTRL49 USB' is missing. Is the keyboard connected?"); return 1; }

    std::wstring want = portOverride;
    if (want.empty()) want = std::wstring (bank.portName.toWideCharPointer());
    auto synthOut = openSynthPort (want, "synth");
    if (! synthOut) return 1;

    Ctrl49WinMmOutput ctrlOut (*ctrlPortId);
    Ctrl49PrivateInput input;
    logLine ("Opening hidden cable-2 capture...");
    input.start (Ctrl49PrivateInput::discoverDevicePath());

    Bytes rawLua = assetBytes (assets::kPresetListLua, assets::kPresetListLuaSize);
    rawLua.push_back (0x00);

    Ctrl49SessionOptions options; options.log = logLine;
    Ctrl49Session session (ctrlOut, rawLua, options);
    logLine ("Starting display session...");
    session.start();

    PresetBrowser browser (static_cast<int> (bank.patches.size()));

    auto pushView = [&] ()
    {
        juce::String h = bank.name + "   " + juce::String (browser.index() + 1).paddedLeft ('0', 3)
                       + "/" + juce::String (static_cast<int> (bank.patches.size())).paddedLeft ('0', 3);
        Bytes header; for (int i = 0; i < h.length(); ++i) header.push_back (static_cast<std::uint8_t> (h[i] & 0x7F));
        session.callLua ("set_header", header, false);

        const int count = static_cast<int> (bank.patches.size());
        const int rows = std::min (kVisibleRows, count);
        int offset = std::max (0, std::min (browser.index() - 2, std::max (0, count - rows)));
        Bytes payload;
        payload.push_back (static_cast<std::uint8_t> (browser.index() - offset));
        payload.push_back (static_cast<std::uint8_t> (rows));
        for (int r = 0; r < rows; ++r)
        {
            const juce::String name = bank.patches[static_cast<std::size_t> (offset + r)].name.substring (0, 28);
            payload.push_back (static_cast<std::uint8_t> (name.length()));
            for (int i = 0; i < name.length(); ++i) payload.push_back (static_cast<std::uint8_t> (name[i] & 0x7F));
        }
        session.callLua ("set_rows", payload, true);
    };
    pushView();
    logLine ("Preset browser ready: data dial scrolls, press the dial to load. Ctrl+C to stop.");

    auto lastRender = std::chrono::steady_clock::now();
    bool dirty = false;

    while (! g_quit.load())
    {
        if (! session.failure().empty()) { logLine ("ERROR: " + session.failure()); break; }
        if (! input.failure().empty())   { logLine ("ERROR: " + input.failure()); break; }
        if (! input.running())           { logLine ("ERROR: hidden input stopped"); break; }

        for (auto msg = input.dequeue(); msg; msg = input.dequeue())
        {
            if (msg->size() < 3 || (msg->at (0) & 0xF0) != 0xB0) continue;
            const int d1 = msg->at (1), d2 = msg->at (2);
            if (d1 == 34) { const int d = d2 == 0x7F ? -1 : (d2 == 0x01 ? 1 : 0); if (d) { browser.move (d); dirty = true; } }
            else if (d1 == 30 && d2 == 127) { browser.move (1); dirty = true; }
            else if (d1 == 32 && d2 == 127) { browser.move (-1); dirty = true; }
            else if (d1 == 40 && d2 == 127) { browser.move (kVisibleRows); dirty = true; }
            else if (d1 == 39 && d2 == 127) { browser.move (-kVisibleRows); dirty = true; }
            else if (d1 == 33 && d2 == 127)
            {
                for (const auto& m : bank.selectSequence (browser.index()))
                    synthOut->send (m);
                logLine ("Load: " + std::string (bank.patches[static_cast<std::size_t> (browser.index())].name.toRawUTF8()));
            }
        }

        const auto now = std::chrono::steady_clock::now();
        if (dirty && now - lastRender >= std::chrono::milliseconds (20))
        {
            pushView();
            dirty = false;
            lastRender = now;
        }
        std::this_thread::sleep_for (std::chrono::milliseconds (2));
    }

    logLine ("Stopping...");
    session.stop();
    input.stop();
    logLine ("Preset browser stopped; the keyboard returns to its normal screen shortly.");
    return 0;
}

//==================================================================================================
// Self-test: embedded assets present, default assignment/bank parse, all params compile.

int runSelfTest()
{
    int failures = 0;
    auto check = [&] (bool ok, const char* label)
    {
        std::printf ("  %s  %s\n", ok ? "PASS" : "FAIL", label);
        if (! ok) ++failures;
    };

    std::printf ("Ctrl49Bridge self-test\n----------------------\n");
    check (assets::kKnobPageLuaSize > 1000, "knob page Lua embedded");
    check (assets::kPresetListLuaSize > 500, "preset list Lua embedded");
    check (assets::kKnobStripPngSize > 10000, "knob filmstrip embedded");
    check (assets::kGaiaProfileJsonSize > 1000, "GAIA profile embedded");

    juce::String error;
    Assignment assignment;
    const bool aOk = Assignment::fromJson (assetString (assets::kDefaultAssignment, assets::kDefaultAssignmentSize),
                                           juce::File(), assignment, error);
    check (aOk, "default assignment parses");

    PresetBank bank;
    const bool bOk = PresetBank::fromJson (assetString (assets::kDefaultPresetBank, assets::kDefaultPresetBankSize),
                                           bank, error);
    check (bOk && ! bank.patches.empty(), "default preset bank parses");

    SynthEngine se;
    const bool pOk = se.load ("embedded:roland-gaia", juce::File(), error);
    check (pOk, "embedded GAIA profile loads");

    int bound = 0, compiled = 0;
    if (aOk && pOk)
        for (int p = 0; p < static_cast<int> (assignment.pages.size()); ++p)
            for (const auto& slot : assignment.pages[static_cast<std::size_t> (p)].slots)
            {
                if (slot.parameterId.isEmpty()) continue;
                ++bound;
                const auto r = se.engine->compileSetParameter (assignment.pageRole (p), slot.parameterId,
                                                               se.scale (slot.parameterId, 64), false);
                if (r.ok) ++compiled;
            }
    check (bound > 0 && bound == compiled, "every default binding compiles");

    std::printf ("----------------------\n%s\n", failures == 0 ? "ALL PASS" : "FAILED");
    return failures == 0 ? 0 : 1;
}
} // namespace

int wmain (int argc, wchar_t** argv)
{
    std::printf ("CEditor CTRL49 Bridge\n");

    bool presets = false, selfTest = false;
    std::wstring fileArg, portArg;
    for (int i = 1; i < argc; ++i)
    {
        const std::wstring a = argv[i];
        if (a == L"--presets") presets = true;
        else if (a == L"--selftest") selfTest = true;
        else if (fileArg.empty() && a.size() > 5 && a.rfind (L".json") == a.size() - 5) fileArg = a;
        else portArg = a;
    }

    if (selfTest)
        return runSelfTest();

    HANDLE mutex = CreateMutexW (nullptr, TRUE, L"Local\\CEditor_CTRL49_Bridge");
    if (mutex == nullptr || GetLastError() == ERROR_ALREADY_EXISTS)
    {
        std::printf ("A CTRL49 bridge is already running.\n");
        if (mutex) CloseHandle (mutex);
        maybePause();
        return 1;
    }
    SetConsoleCtrlHandler (consoleHandler, TRUE);

    int result = 1;
    try
    {
        juce::String error;
        if (presets)
        {
            PresetBank bank;
            bool ok;
            if (! fileArg.empty())
            {
                Bytes b;
                ok = readFileBytes (fileArg.c_str(), b)
                     && PresetBank::fromJson (juce::String::fromUTF8 (reinterpret_cast<const char*> (b.data()),
                                                                     static_cast<int> (b.size())), bank, error);
            }
            else
                ok = PresetBank::fromJson (assetString (assets::kDefaultPresetBank, assets::kDefaultPresetBankSize),
                                           bank, error);
            if (! ok) { logLine ("preset bank load failed: " + std::string (error.toRawUTF8())); }
            else
            {
                logLine ("Bank: " + std::string (bank.name.toRawUTF8())
                         + " (" + std::to_string (bank.patches.size()) + " patches)");
                result = runPresets (bank, portArg);
            }
        }
        else
        {
            Assignment assignment;
            juce::File baseDir;
            bool ok;
            if (! fileArg.empty())
            {
                const juce::File f (juce::String (fileArg.c_str()));
                baseDir = f.getParentDirectory();
                ok = Assignment::fromFile (f, assignment, error);
            }
            else
                ok = Assignment::fromJson (assetString (assets::kDefaultAssignment, assets::kDefaultAssignmentSize),
                                           juce::File(), assignment, error);
            if (! ok) { logLine ("assignment load failed: " + std::string (error.toRawUTF8())); }
            else
            {
                logLine ("Assignment: " + std::string (assignment.name.toRawUTF8())
                         + " (" + std::to_string (assignment.pages.size()) + " pages)");
                result = runKnobs (assignment, baseDir, portArg);
            }
        }
    }
    catch (const std::exception& e)
    {
        std::printf ("ERROR: %s\n", e.what());
        result = 1;
    }

    ReleaseMutex (mutex);
    CloseHandle (mutex);
    maybePause();
    return result;
}

#else // _WIN32
#include <cstdio>
int main() { std::printf ("Ctrl49Bridge requires Windows.\n"); return 0; }
#endif // _WIN32
