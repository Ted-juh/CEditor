// CTRL49 preset browser (Phase 7). Uploads the preset-list page, shows a bank of patch
// names, and drives it from the hardware: the data dial (and cursor up/down) scroll the
// selection, and pressing the data dial loads the patch (Bank Select + Program Change) on
// the synth's MIDI port. The screen is a pure list renderer; the host owns selection and
// scrolling and sends the visible window.
//
// Usage:
//   Ctrl49PresetTest <presetbank.json> <CEditor_PresetList.lua> [synth-port-override]
//
// Windows-only. Single-owner named mutex; Ctrl+C exits cleanly.

#ifdef _WIN32

#include "Ctrl49PresetBank.h"
#include "Ctrl49PrivateInput.h"
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
std::wstring wideOf (const juce::String& s) { return std::wstring (s.toWideCharPointer()); }

bool readFile (const wchar_t* path, Bytes& out)
{
    std::FILE* fp = _wfopen (path, L"rb");
    if (! fp) return false;
    std::fseek (fp, 0, SEEK_END); const long n = std::ftell (fp); std::fseek (fp, 0, SEEK_SET);
    out.resize (static_cast<std::size_t> (n));
    const bool ok = std::fread (out.data(), 1, static_cast<std::size_t> (n), fp) == static_cast<std::size_t> (n);
    std::fclose (fp);
    return ok;
}

Bytes headerBytes (const PresetBank& bank, int sel)
{
    juce::String h = bank.name + "   " + juce::String (sel + 1).paddedLeft ('0', 3)
                   + "/" + juce::String (static_cast<int> (bank.patches.size())).paddedLeft ('0', 3);
    Bytes out; for (int i = 0; i < h.length(); ++i) out.push_back (static_cast<std::uint8_t> (h[i] & 0x7F));
    return out;
}

// Visible window [offset, offset+rows) with the selection kept near the middle; returns the
// set_rows payload: [selectedRow][rowCount][ rowCount x [nameLen][name] ].
Bytes rowsBytes (const PresetBank& bank, int sel, int& outOffset)
{
    const int count = static_cast<int> (bank.patches.size());
    const int rows = std::min (kVisibleRows, count);
    int offset = sel - 2;
    offset = std::max (0, std::min (offset, std::max (0, count - rows)));
    outOffset = offset;

    Bytes payload;
    payload.push_back (static_cast<std::uint8_t> (sel - offset));  // selected row within window
    payload.push_back (static_cast<std::uint8_t> (rows));
    for (int r = 0; r < rows; ++r)
    {
        const juce::String name = bank.patches[static_cast<std::size_t> (offset + r)].name.substring (0, 28);
        payload.push_back (static_cast<std::uint8_t> (name.length()));
        for (int i = 0; i < name.length(); ++i) payload.push_back (static_cast<std::uint8_t> (name[i] & 0x7F));
    }
    return payload;
}
} // namespace

int wmain (int argc, wchar_t** argv)
{
    if (argc < 3)
    {
        std::printf ("usage: Ctrl49PresetTest <presetbank.json> <preset-list.lua> [synth-port]\n");
        return 2;
    }

    juce::String error;
    PresetBank bank;
    {
        Bytes bankBytes;
        if (! readFile (argv[1], bankBytes)) { std::printf ("could not read preset bank.\n"); return 2; }
        const juce::String json (reinterpret_cast<const char*> (bankBytes.data()), bankBytes.size());
        if (! PresetBank::fromJson (json, bank, error))
        { std::printf ("preset bank load failed: %s\n", error.toRawUTF8()); return 2; }
    }
    logLine ("Bank: " + std::string (bank.name.toRawUTF8()) + " (" + std::to_string (bank.patches.size()) + " patches)");

    Bytes rawLua;
    if (! readFile (argv[2], rawLua)) { std::printf ("could not read the list Lua page.\n"); return 2; }
    rawLua.push_back (0x00);

    const std::wstring synthPortName = argc >= 4 ? argv[3] : wideOf (bank.portName);

    HANDLE mutex = CreateMutexW (nullptr, TRUE, L"Local\\CEditor_CTRL49_Bridge");
    if (mutex == nullptr || GetLastError() == ERROR_ALREADY_EXISTS)
    { std::printf ("A CTRL49 bridge is already running.\n"); if (mutex) CloseHandle (mutex); return 1; }
    SetConsoleCtrlHandler (consoleHandler, TRUE);

    try
    {
        const auto ctrlPortId = Ctrl49WinMmOutput::findPort (Ctrl49WinMmOutput::kDefaultPortName);
        if (! ctrlPortId) throw std::runtime_error ("output port 'CTRL49 USB' not found");

        std::wstring synthActual;
        const auto synthPortId = Ctrl49WinMmOutput::findPort (synthPortName, &synthActual);
        if (! synthPortId)
        {
            logLine ("Synth port '" + toUtf8 (synthPortName) + "' not found. Available:");
            for (const auto& n : Ctrl49WinMmOutput::listOutputPortNames()) logLine ("    " + toUtf8 (n));
            throw std::runtime_error ("re-run with a matching synth port name");
        }
        logLine ("Synth port: " + toUtf8 (synthActual));

        const std::wstring devicePath = Ctrl49PrivateInput::discoverDevicePath();

        Ctrl49WinMmOutput ctrlOut (*ctrlPortId);
        Ctrl49WinMmOutput synthOut (*synthPortId);
        Ctrl49PrivateInput input;

        logLine ("Opening hidden cable-2 capture...");
        input.start (devicePath);

        Ctrl49SessionOptions options; options.log = logLine;
        Ctrl49Session session (ctrlOut, rawLua, options);   // no filmstrip: the list page draws text only
        logLine ("Uploading preset-list page, starting display...");
        session.start();

        PresetBrowser browser (static_cast<int> (bank.patches.size()));

        auto pushView = [&] ()
        {
            session.callLua ("set_header", headerBytes (bank, browser.index()), false);
            int offset = 0;
            session.callLua ("set_rows", rowsBytes (bank, browser.index(), offset), true);
        };
        pushView();
        logLine ("Ready. Data dial scrolls, press the dial to load. Ctrl+C to stop.");

        auto lastRender = std::chrono::steady_clock::now();
        bool dirty = false;

        while (! g_quit.load())
        {
            if (! session.failure().empty()) throw std::runtime_error (session.failure());
            if (! input.failure().empty())   throw std::runtime_error (input.failure());
            if (! input.running())           throw std::runtime_error ("hidden input stopped");

            for (auto msg = input.dequeue(); msg; msg = input.dequeue())
            {
                if (msg->size() < 3 || (msg->at (0) & 0xF0) != 0xB0) continue;
                const int d1 = msg->at (1), d2 = msg->at (2);

                if (d1 == 34)  // data dial turn (relative)
                {
                    const int delta = d2 == 0x7F ? -1 : (d2 == 0x01 ? 1 : 0);
                    if (delta != 0) { browser.move (delta); dirty = true; }
                }
                else if (d1 == 30 && d2 == 127) { browser.move (1); dirty = true; }   // cursor down
                else if (d1 == 32 && d2 == 127) { browser.move (-1); dirty = true; }  // cursor up
                else if (d1 == 40 && d2 == 127) { browser.move (kVisibleRows); dirty = true; }   // page right
                else if (d1 == 39 && d2 == 127) { browser.move (-kVisibleRows); dirty = true; }  // page left
                else if (d1 == 33 && d2 == 127)  // data-dial press -> load
                {
                    for (const auto& m : bank.selectSequence (browser.index()))
                        synthOut.send (m);
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
        logLine ("Preset browser stopped cleanly.");
    }
    catch (const std::exception& e)
    {
        std::printf ("ERROR: %s\n", e.what());
        ReleaseMutex (mutex); CloseHandle (mutex);
        return 1;
    }

    ReleaseMutex (mutex); CloseHandle (mutex);
    return 0;
}

#else // _WIN32
#include <cstdio>
int main() { std::printf ("Ctrl49PresetTest requires Windows.\n"); return 0; }
#endif // _WIN32
